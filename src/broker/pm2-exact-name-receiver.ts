import { createHash } from 'node:crypto';
import { isAbsolute, win32 } from 'node:path';

import { MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT } from '../broker-client/public.ts';
import type { ReceiverCorrelation, ReceiverEntryIdentity } from './journal.ts';
import {
  type Pm2ApplicationRpcClientPort,
  type Pm2ApplicationPrepareDispatchPort,
  type Pm2ApplicationRpcReply,
  type Pm2ApplicationStartConfig
} from './pm2-application-rpc.ts';
import {
  PM2_METADATA_ATTEMPT_ID,
  PM2_METADATA_BINDING_GENERATION,
  PM2_METADATA_DEADLINE_AT_MS,
  PM2_METADATA_DIGEST,
  PM2_METADATA_GRANT_GENERATION,
  PM2_METADATA_GRANT_ID,
  PM2_METADATA_JOB_IDENTITY,
  PM2_METADATA_RECEIVER_CORRELATION,
  PM2_METADATA_RECEIVER_ENTRY_IDENTITY,
  PM2_METADATA_RECEIVER_ID,
  PM2_METADATA_RECIPE_REVISION,
  PM2_METADATA_REPOSITORY,
  PM2_METADATA_SLOT_ID,
  PM2_METADATA_STARTED_AT_MS,
  type Pm2ProjectedProcess
} from './pm2-monitor-projection.ts';
import {
  parseProcessAttemptId,
  type CanonicalRepository,
  type GrantId,
  type ProcessAttemptId,
  type ReceiverId,
  type RecipeRevision
} from './primitives.ts';
import {
  type ExactNameOneShotPorts,
  type ExactOneShotStart,
  type OneShotCleanupReceipt,
  type OneShotReceiverPortIssue
} from './one-shot-receiver.ts';
import {
  sameOneShotSlotId,
  type OneShotAttemptHandle,
  type OneShotCleanupProof,
  type OneShotObservedStatus,
  type OneShotOwnershipMetadata,
  type OneShotProcessName,
  type OneShotResult,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import {
  deriveWindowsNamedJobIdentity,
  type WindowsNamedJobAttemptIdentity,
  type WindowsNamedJobContainmentConfig,
  type WindowsNamedJobIdentity
} from './windows-named-job-containment.ts';
import { isCanonicalLocalWindowsAbsolutePath } from './windows-execution-paths.ts';
import type { CanonicalBrokerEntrypoint } from './windows-tool-registry.ts';

export const PM2_ONE_SHOT_MAX_TIMEOUT_MS = 10_000;
export const PM2_ONE_SHOT_MAX_ARGUMENTS = 256;
export const PM2_ONE_SHOT_MAX_ARGUMENT_BYTES = 4_096;
export const PM2_ONE_SHOT_MAX_ENVIRONMENT_ENTRIES = 64;

export type Pm2NonsecretEnvironmentAtom = Readonly<{
  kind: 'pm2-nonsecret-environment-atom';
  name: string;
  value: string;
}>;

export type Pm2OneShotAuthorityMetadata = Readonly<{
  receiverId: ReceiverId;
  receiverEntryIdentity: ReceiverEntryIdentity;
  receiverCorrelation: ReceiverCorrelation;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  grantGeneration: number;
  bindingGeneration: number;
}>;

export type Pm2ManagedWindowsContainment = Readonly<{
  format: 'pm2-managed-windows-job/v1';
  jobIdentity: WindowsNamedJobIdentity;
}>;

export type Pm2ManagedBunRecipeBootstrap = Readonly<{
  format: 'pm2-managed-bun-recipe-bootstrap/v1';
  brokerEntrypoint: CanonicalBrokerEntrypoint;
}>;

export type Pm2OneShotLaunchPayload = Readonly<{
  executablePath: string;
  cwd: string;
  args: readonly string[];
  stdoutPath: string;
  stderrPath: string;
  pidPath: string;
  nonsecretEnvironment: readonly Pm2NonsecretEnvironmentAtom[];
  managedContainment: Pm2ManagedWindowsContainment;
  managedBootstrap: Pm2ManagedBunRecipeBootstrap;
  authority?: Pm2OneShotAuthorityMetadata;
}>;

export type Pm2OneShotAdapterConfig = Readonly<{
  endpoint: string;
  timeoutMs: number;
  namespace: string;
  allowedNonsecretEnvironmentNames: readonly string[];
  killRetryTimeMs: number;
}>;

export type Pm2OneShotConfigurationIssue = Readonly<{
  code: 'pm2-one-shot-configuration-invalid';
  field: 'adapter' | 'argument' | 'bootstrap' | 'containment' | 'environment' | 'path' | 'ownership';
}>;

export type Pm2OneShotCompatibilityPort = Readonly<{
  probeCompatible: () => Promise<boolean>;
}>;

export type Pm2OneShotCleanupProofPort = Readonly<{
  readProof: (handle: OneShotAttemptHandle) => Promise<OneShotCleanupProof>;
}>;

export type Pm2OneShotAdapterDependencies = Readonly<{
  rpc: Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
  compatibility: Pm2OneShotCompatibilityPort;
  cleanupProofs: Pm2OneShotCleanupProofPort;
  allocation: Readonly<{
    withAllocationLock: ExactNameOneShotPorts<Pm2OneShotLaunchPayload>['withAllocationLock'];
  }>;
}>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({ outcome: 'success', value });
const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const configurationFailure = (
  field: Pm2OneShotConfigurationIssue['field']
): OneShotResult<never, Pm2OneShotConfigurationIssue> => failure({
  code: 'pm2-one-shot-configuration-invalid',
  field
});

export const derivePm2ManagedWindowsContainment = (
  config: Pick<WindowsNamedJobContainmentConfig, 'trustedProfileRoot' | 'namespace'>,
  attempt: WindowsNamedJobAttemptIdentity
): OneShotResult<Pm2ManagedWindowsContainment, Pm2OneShotConfigurationIssue> => {
  const identity = deriveWindowsNamedJobIdentity(config, attempt);
  return identity.isOk()
    ? success({ format: 'pm2-managed-windows-job/v1', jobIdentity: identity.value })
    : configurationFailure('containment');
};

const sensitiveName = (name: string): boolean => /(?:secret|token|credential|password|passphrase|api[_-]?key|pin)/iu
  .test(name);

export const createPm2NonsecretEnvironmentAtom = (
  name: string,
  value: string,
  allowedNames: readonly string[]
): OneShotResult<Pm2NonsecretEnvironmentAtom, Pm2OneShotConfigurationIssue> =>
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name) &&
  !name.toUpperCase().startsWith('NEBULAR_') && !sensitiveName(name) &&
  allowedNames.includes(name) && value.length <= 4_096 && !value.includes('\0')
    ? success({ kind: 'pm2-nonsecret-environment-atom', name, value })
    : configurationFailure('environment');

const validAbsolutePath = (value: string): boolean => value.length > 0 && value.length <= 4_096 &&
  !value.includes('\0') && (isAbsolute(value) || win32.isAbsolute(value));

const isUnknownRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validContainment = (containment: unknown): containment is Pm2ManagedWindowsContainment => {
  if (!isUnknownRecord(containment)) return false;
  const raw = containment;
  const identity = raw['jobIdentity'];
  if (!isUnknownRecord(identity)) return false;
  const rawIdentity = identity;
  return Object.keys(raw).length === 2 && raw['format'] === 'pm2-managed-windows-job/v1' &&
    Object.keys(rawIdentity).length === 2 && rawIdentity['kind'] === 'windows-named-job-identity' &&
    typeof rawIdentity['value'] === 'string' &&
    /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(rawIdentity['value']);
};

const validManagedBootstrap = (bootstrap: unknown): bootstrap is Pm2ManagedBunRecipeBootstrap => {
  if (!isUnknownRecord(bootstrap)) return false;
  const raw = bootstrap;
  const entrypoint = raw['brokerEntrypoint'];
  if (!isUnknownRecord(entrypoint)) return false;
  const rawEntrypoint = entrypoint;
  return Object.keys(raw).length === 2 && raw['format'] === 'pm2-managed-bun-recipe-bootstrap/v1' &&
    Object.keys(rawEntrypoint).length === 2 && rawEntrypoint['kind'] === 'canonical-broker-entrypoint' &&
    isCanonicalLocalWindowsAbsolutePath(rawEntrypoint['value']) && rawEntrypoint['value'].length <= 4_096;
};

const validPayload = (payload: Pm2OneShotLaunchPayload, config: Pm2OneShotAdapterConfig): boolean => {
  const names: readonly string[] = payload.nonsecretEnvironment.map(atom => atom.name);
  const foldedNames: readonly string[] = names.map(name => name.toUpperCase());
  const environmentValid = payload.nonsecretEnvironment.length <= PM2_ONE_SHOT_MAX_ENVIRONMENT_ENTRIES &&
    new Set(foldedNames).size === foldedNames.length && payload.nonsecretEnvironment.every(atom =>
      config.allowedNonsecretEnvironmentNames.includes(atom.name) &&
      !atom.name.toUpperCase().startsWith('NEBULAR_') && !sensitiveName(atom.name) && atom.value.length <= 4_096 &&
      !atom.value.includes('\0'));
  const argumentsValid = payload.args.length <= PM2_ONE_SHOT_MAX_ARGUMENTS && payload.args.every(argument =>
    argument.length > 0 && new TextEncoder().encode(argument).byteLength <= PM2_ONE_SHOT_MAX_ARGUMENT_BYTES &&
    !argument.includes('\0'));
  return [payload.executablePath, payload.cwd, payload.stdoutPath, payload.stderrPath, payload.pidPath]
    .every(validAbsolutePath) && environmentValid && argumentsValid && validContainment(payload.managedContainment) &&
    validManagedBootstrap(payload.managedBootstrap);
};

const validAdapterConfig = (config: Pm2OneShotAdapterConfig): boolean => config.endpoint.length > 0 &&
  config.endpoint.length <= 1_024 && !config.endpoint.includes('\0') && Number.isSafeInteger(config.timeoutMs) &&
  config.timeoutMs > 0 && config.timeoutMs <= PM2_ONE_SHOT_MAX_TIMEOUT_MS &&
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(config.namespace) &&
  Number.isSafeInteger(config.killRetryTimeMs) && config.killRetryTimeMs > 0 &&
  config.killRetryTimeMs <= PM2_ONE_SHOT_MAX_TIMEOUT_MS &&
  new Set(config.allowedNonsecretEnvironmentNames.map(name => name.toUpperCase())).size ===
    config.allowedNonsecretEnvironmentNames.length &&
  config.allowedNonsecretEnvironmentNames.every(name => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name) &&
    !name.toUpperCase().startsWith('NEBULAR_') && !sensitiveName(name));

const validAuthority = (
  authority: Pm2OneShotAuthorityMetadata | undefined,
  slot: OneShotSlotDefinition
): boolean => authority === undefined || (authority.receiverId === 'pm2' &&
  authority.receiverEntryIdentity.value === `pm2-entry:${slot.processName.value}` &&
  authority.receiverCorrelation.value.length > 0 && authority.receiverCorrelation.value.length <= 512 &&
  !authority.receiverCorrelation.value.includes('\0') && authority.repository.length > 0 &&
  authority.repository.length <= 4_096 && !authority.repository.includes('\0') &&
  authority.recipeRevision.length > 0 && authority.recipeRevision.length <= 256 &&
  !authority.recipeRevision.includes('\0') && authority.grantId.length > 0 && authority.grantId.length <= 128 &&
  !authority.grantId.includes('\0') && Number.isSafeInteger(authority.grantGeneration) &&
  authority.grantGeneration > 0 && Number.isSafeInteger(authority.bindingGeneration) &&
  authority.bindingGeneration > 0);

const authorityEntries = (
  authority: Pm2OneShotAuthorityMetadata | undefined
): Readonly<Record<string, string>> => authority === undefined
  ? {}
  : {
      [PM2_METADATA_RECEIVER_ID]: authority.receiverId,
      [PM2_METADATA_RECEIVER_ENTRY_IDENTITY]: authority.receiverEntryIdentity.value,
      [PM2_METADATA_RECEIVER_CORRELATION]: authority.receiverCorrelation.value,
      [PM2_METADATA_REPOSITORY]: authority.repository,
      [PM2_METADATA_RECIPE_REVISION]: authority.recipeRevision,
      [PM2_METADATA_GRANT_ID]: authority.grantId,
      [PM2_METADATA_GRANT_GENERATION]: String(authority.grantGeneration),
      [PM2_METADATA_BINDING_GENERATION]: String(authority.bindingGeneration)
    };

const environmentFor = (
  metadata: OneShotOwnershipMetadata,
  payload: Pm2OneShotLaunchPayload
): Readonly<Record<string, string>> => ({
  ...Object.fromEntries(payload.nonsecretEnvironment.map(atom => [atom.name, atom.value] as const)),
  [PM2_METADATA_SLOT_ID]: metadata.slotId.value,
  [PM2_METADATA_ATTEMPT_ID]: metadata.attemptId,
  [PM2_METADATA_DIGEST]: metadata.metadataDigest,
  [PM2_METADATA_STARTED_AT_MS]: String(metadata.startedAtMs),
  [PM2_METADATA_DEADLINE_AT_MS]: String(metadata.deadlineAtMs),
  [PM2_METADATA_JOB_IDENTITY]: payload.managedContainment.jobIdentity.value,
  [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: payload.managedBootstrap.brokerEntrypoint.value,
  ...authorityEntries(payload.authority)
});

const canonicalDigestInput = (
  attemptId: ProcessAttemptId,
  payload: Pm2OneShotLaunchPayload,
  startedAtMs: number,
  deadlineAtMs: number
): string => JSON.stringify([
  'nebular-pm2-one-shot-metadata/v1',
  attemptId,
  startedAtMs,
  deadlineAtMs,
  payload.executablePath,
  payload.cwd,
  payload.args,
  payload.stdoutPath,
  payload.stderrPath,
  payload.pidPath,
  [payload.managedContainment.format, payload.managedContainment.jobIdentity.value],
  [payload.managedBootstrap.format, payload.managedBootstrap.brokerEntrypoint.kind,
    payload.managedBootstrap.brokerEntrypoint.value],
  payload.nonsecretEnvironment.toSorted((left, right) => left.name.localeCompare(right.name))
    .map((atom): readonly [string, string] => [atom.name, atom.value]),
  payload.authority === undefined ? null : [
    payload.authority.receiverId,
    payload.authority.receiverEntryIdentity.value,
    payload.authority.receiverCorrelation.value,
    payload.authority.repository,
    payload.authority.recipeRevision,
    payload.authority.grantId,
    payload.authority.grantGeneration,
    payload.authority.bindingGeneration
  ]
]);

export const pm2OneShotMetadataDigest = (
  attemptId: ProcessAttemptId,
  payload: Pm2OneShotLaunchPayload,
  startedAtMs: number,
  deadlineAtMs: number
): string => createHash('sha256').update(canonicalDigestInput(
  attemptId,
  payload,
  startedAtMs,
  deadlineAtMs
)).digest('hex');

export const buildPm2OneShotStartConfig = (
  config: Pm2OneShotAdapterConfig,
  request: ExactOneShotStart<Pm2OneShotLaunchPayload>
): OneShotResult<Pm2ApplicationStartConfig, Pm2OneShotConfigurationIssue> => {
  if (!validAdapterConfig(config)) return configurationFailure('adapter');
  if (!validContainment(request.payload.managedContainment)) return configurationFailure('containment');
  if (!validManagedBootstrap(request.payload.managedBootstrap)) return configurationFailure('bootstrap');
  if (!validPayload(request.payload, config)) return configurationFailure('path');
  if (request.slot.processName.value !== `${config.namespace}-${request.slot.slotId.value.split(':').at(-1)}` ||
      request.metadata.slotId.value !== request.slot.slotId.value || !validAuthority(request.payload.authority, request.slot)) {
    return configurationFailure('ownership');
  }
  const expectedDigest = pm2OneShotMetadataDigest(
    request.metadata.attemptId,
    request.payload,
    request.metadata.startedAtMs,
    request.metadata.deadlineAtMs
  );
  if (expectedDigest !== request.metadata.metadataDigest) return configurationFailure('ownership');
  return success({
    name: request.slot.processName.value,
    namespace: config.namespace,
    pm_exec_path: request.payload.executablePath,
    pm_cwd: request.payload.cwd,
    args: request.payload.args,
    exec_mode: 'fork_mode',
    exec_interpreter: 'none',
    env: environmentFor(request.metadata, request.payload),
    autorestart: false,
    // PM2 5.4.3 cannot later start an autostart=false prepared record; this is
    // intentionally one atomic launch after the durable reservation port.
    autostart: true,
    treekill: true,
    windowsHide: true,
    merge_logs: true,
    pm_out_log_path: request.payload.stdoutPath,
    pm_err_log_path: request.payload.stderrPath,
    pm_pid_path: request.payload.pidPath,
    vizion: false,
    watch: false,
    kill_retry_time: config.killRetryTimeMs
  });
};

const portFailure = (
  operation: OneShotReceiverPortIssue['operation'],
  code: OneShotReceiverPortIssue['code'] = 'pm2-operation-failed'
): OneShotReceiverPortIssue => ({ code, operation, safeMessage: 'The exact-name PM2 operation failed.' });

const execute = (
  config: Pm2OneShotAdapterConfig,
  rpc: Pm2ApplicationRpcClientPort,
  operation: Parameters<Pm2ApplicationRpcClientPort['execute']>[0]['operation']
): Promise<OneShotResult<Pm2ApplicationRpcReply, OneShotReceiverPortIssue>> => Promise.resolve()
  .then(() => rpc.execute({ endpoint: config.endpoint, timeoutMs: config.timeoutMs, operation }))
  .then(
    result => result.outcome === 'success' ? success(result.value) : failure(portFailure('observe')),
    () => failure(portFailure('observe'))
  );

const observationStatus = (process: Pm2ProjectedProcess): OneShotObservedStatus => process.status;

const handleFor = (
  slot: OneShotSlotDefinition,
  process: Pm2ProjectedProcess,
  metadata: OneShotOwnershipMetadata
): OneShotAttemptHandle => ({
  slotId: slot.slotId,
  processName: slot.processName,
  attemptId: metadata.attemptId,
  metadataDigest: metadata.metadataDigest,
  pmId: process.pmId
});

const ownedObservation = (
  slot: OneShotSlotDefinition,
  process: Pm2ProjectedProcess,
  cleanupProofs: Pm2OneShotCleanupProofPort
): Promise<OneShotSlotObservation> => {
  if (process.autorestart || !process.treeKill) {
    return Promise.resolve({ ...slot, occupant: { kind: 'foreign', reason: 'configuration-drift' } });
  }
  const ownership = process.ownership;
  if (ownership.kind !== 'owned' || ownership.slotId !== slot.slotId.value) {
    return Promise.resolve({
      ...slot,
      occupant: {
        kind: 'foreign',
        reason: ownership.kind === 'absent' ? 'missing-ownership-metadata' : 'invalid-ownership-metadata'
      }
    });
  }
  const attemptId = parseProcessAttemptId(ownership.attemptId);
  if (attemptId.isErr()) {
    return Promise.resolve({
      ...slot,
      occupant: { kind: 'foreign', reason: 'invalid-ownership-metadata' }
    });
  }
  const metadata: OneShotOwnershipMetadata = {
    slotId: slot.slotId,
    attemptId: attemptId.value,
    metadataDigest: ownership.metadataDigest,
    startedAtMs: ownership.startedAtMs,
    deadlineAtMs: ownership.deadlineAtMs
  };
  const handle = handleFor(slot, process, metadata);
  const terminalExitCode: Readonly<{ exitCode?: number }> =
    (process.status === 'stopped' || process.status === 'errored') &&
    process.exitCode !== undefined && Number.isSafeInteger(process.exitCode)
    ? { exitCode: process.exitCode }
    : {};
  return Promise.resolve().then(() => cleanupProofs.readProof(handle)).then(
    proof => ({
      ...slot,
      occupant: {
        kind: 'owned',
        pmId: process.pmId,
        pid: process.pid,
        status: observationStatus(process),
        ...terminalExitCode,
        metadata,
        cleanupProof: proof === 'confirmed' ? 'confirmed' : 'unconfirmed'
      }
    }),
    () => ({
      ...slot,
      occupant: {
        kind: 'owned',
        pmId: process.pmId,
        pid: process.pid,
        status: observationStatus(process),
        ...terminalExitCode,
        metadata,
        cleanupProof: 'unconfirmed'
      }
    })
  );
};

const observationsFrom = (
  pool: OneShotSlotPool,
  processes: readonly Pm2ProjectedProcess[],
  cleanupProofs: Pm2OneShotCleanupProofPort
): Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>> => {
  const duplicate = pool.slots.find(slot => processes.filter(process => process.name === slot.processName.value).length > 1);
  if (duplicate !== undefined) return Promise.resolve(failure(portFailure('observe')));
  return Promise.all(pool.slots.map(slot => {
    const process = processes.find(candidate => candidate.name === slot.processName.value);
    return process === undefined ? Promise.resolve({ ...slot, occupant: { kind: 'empty' as const } })
      : ownedObservation(slot, process, cleanupProofs);
  })).then(success);
};

const exactProjectedHandle = (
  process: Pm2ProjectedProcess,
  handle: OneShotAttemptHandle
): boolean => process.name === handle.processName.value && process.pmId === handle.pmId &&
  !process.autorestart && process.treeKill &&
  process.ownership.kind === 'owned' && process.ownership.slotId === handle.slotId.value &&
  process.ownership.attemptId === handle.attemptId && process.ownership.metadataDigest === handle.metadataDigest;

const monitorExact = (
  config: Pm2OneShotAdapterConfig,
  rpc: Pm2ApplicationRpcClientPort,
  name: OneShotProcessName
): Promise<OneShotResult<Pm2ProjectedProcess, OneShotReceiverPortIssue>> => execute(config, rpc, {
  method: 'getMonitorData', allowedNames: [name.value]
}).then(result => result.outcome === 'failure' ? result
  : result.value.method === 'getMonitorData' && result.value.processes.length === 1 &&
    result.value.processes[0] !== undefined
    ? success(result.value.processes[0])
    : failure(portFailure('observe')));

const mutateExact = (
  config: Pm2OneShotAdapterConfig,
  rpc: Pm2ApplicationRpcClientPort,
  handle: OneShotAttemptHandle,
  method: 'stopProcessId' | 'deleteProcessId'
): Promise<OneShotResult<void, OneShotReceiverPortIssue>> => monitorExact(config, rpc, handle.processName)
  .then(observed => observed.outcome === 'failure' || !exactProjectedHandle(observed.value, handle) ||
    (method === 'stopProcessId' && (observed.value.status !== 'online' || observed.value.pid === null ||
      observed.value.pid <= 0)) ||
    (method === 'deleteProcessId' && observed.value.status !== 'stopped' && observed.value.status !== 'errored')
    ? failure(portFailure(method === 'stopProcessId' ? 'stop-exact' : 'delete-exact'))
    : execute(config, rpc, { method, pmId: handle.pmId, expectedName: handle.processName.value }).then(result =>
      result.outcome === 'success' && result.value.method === method && exactProjectedHandle(result.value.process, handle)
        ? success(undefined)
        : failure(portFailure(method === 'stopProcessId' ? 'stop-exact' : 'delete-exact'))));

export const createPm2ExactNameOneShotPorts = (
  config: Pm2OneShotAdapterConfig,
  dependencies: Pm2OneShotAdapterDependencies
): ExactNameOneShotPorts<Pm2OneShotLaunchPayload> => ({
  probe: () => validAdapterConfig(config)
    ? Promise.resolve().then(() => dependencies.compatibility.probeCompatible()).then(
      compatible => compatible ? success(undefined) : failure(portFailure('probe', 'pm2-receiver-unavailable')),
      () => failure(portFailure('probe', 'pm2-receiver-unavailable'))
    )
    : Promise.resolve(failure(portFailure('probe', 'pm2-receiver-unavailable'))),
  withAllocationLock: dependencies.allocation.withAllocationLock,
  observe: pool => execute(config, dependencies.rpc, {
    method: 'getMonitorData', allowedNames: pool.slots.map(slot => slot.processName.value)
  }).then(result => result.outcome === 'failure' ? result
    : result.value.method === 'getMonitorData'
      ? observationsFrom(pool, result.value.processes, dependencies.cleanupProofs)
      : failure(portFailure('observe'))),
  startExact: request => {
    const directConfig = buildPm2OneShotStartConfig(config, request);
    if (directConfig.outcome === 'failure') return Promise.resolve(failure(portFailure('start-exact')));
    return Promise.resolve().then(() => dependencies.rpc.dispatchPrepare({
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs,
      operation: { method: 'prepare', config: directConfig.value }
    })).then(
      result => result.outcome === 'success'
        ? success(undefined)
        : failure(portFailure('start-exact')),
      () => failure(portFailure('start-exact'))
    );
  },
  stopExact: handle => mutateExact(config, dependencies.rpc, handle, 'stopProcessId'),
  deleteExact: (handle, receipt) => oneShotCleanupReceiptIsExact(receipt, handle)
    ? Promise.resolve().then(() => dependencies.cleanupProofs.readProof(handle)).then(
      proof => proof === 'confirmed'
        ? mutateExact(config, dependencies.rpc, handle, 'deleteProcessId')
        : failure(portFailure('delete-exact')),
      () => failure(portFailure('delete-exact'))
    )
    : Promise.resolve(failure(portFailure('delete-exact')))
});

export const oneShotCleanupReceiptIsExact = (
  receipt: OneShotCleanupReceipt,
  handle: OneShotAttemptHandle
): boolean => sameOneShotSlotId(receipt.handle.slotId, handle.slotId) && receipt.handle.pmId === handle.pmId &&
  receipt.handle.attemptId === handle.attemptId && receipt.handle.metadataDigest === handle.metadataDigest;
