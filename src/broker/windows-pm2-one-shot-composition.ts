import type { BrokerAuthorityPorts } from './authority.ts';
import {
  createBunWindowsFilesystemFactsRuntime,
  type BunWindowsFilesystemFactsRuntime
} from './bun-windows-filesystem-facts.ts';
import {
  createSystemGrantQualifiedOneShotStartTiming,
  type GrantQualifiedOneShotStartTiming
} from './grant-qualified-one-shot-start.ts';
import type {
  AuthorityJournal,
  ExactPm2RecordDeletionReceipt,
  TrustedProfileRoot,
  VerifiedWindowsAttemptContainmentBinding,
  VerifiedWindowsTreeCleanupProof
} from './journal.ts';
import { validateVerifiedWindowsAttemptContainmentBinding } from './journal.ts';
import type { OneShotCleanupReceipt } from './one-shot-receiver.ts';
import {
  createOneShotSlotPool,
  sameOneShotProcessName,
  sameOneShotSlotId,
  validateOneShotAttempt,
  validateOneShotSlotInventory,
  type OneShotAttemptHandle,
  type OneShotResult,
  type OneShotSlotDefinition,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import {
  createNodeNetPm2ApplicationRpcClient,
  type Pm2ApplicationPrepareDispatchPort,
  type Pm2ApplicationRpcClientPort
} from './pm2-application-rpc.ts';
import { createUnadmittedPm2OneShotCleanupProofPort } from './pm2-cleanup-proof.ts';
import {
  createPm2ExactNameOneShotPorts,
  createPm2NonsecretEnvironmentAtom,
  PM2_ONE_SHOT_MAX_ENVIRONMENT_ENTRIES,
  PM2_ONE_SHOT_MAX_TIMEOUT_MS,
  type Pm2OneShotCleanupProofPort,
  type Pm2OneShotCompatibilityPort,
  type Pm2OneShotLaunchPayload
} from './pm2-exact-name-receiver.ts';
import {
  probePm2Prerequisite,
  type Pm2PrerequisiteRuntimePort
} from './pm2-prerequisite.ts';
import {
  createPm2ProtocolCompatibilityRuntimePort,
  PM2_WINDOWS_RPC_PIPE
} from './pm2-rpc.ts';
import type { CurrentProcessIncarnationPort } from './receiver-attempt-verifier.ts';
import { brokerErr, brokerOk, brokerTry, type BrokerResult } from './result.ts';
import {
  resolveWindowsExecutionAuthorityContext,
  type WindowsExecutionAuthorityContext,
  type WindowsExecutionAuthorityContextOptions
} from './windows-execution-authority-context.ts';
import { isCanonicalLocalWindowsAbsolutePath } from './windows-execution-paths.ts';
import {
  createWindowsNamedJobContainmentPort,
  type WindowsNamedJobContainmentCapabilities,
  type WindowsNamedJobContainmentConfig
} from './windows-named-job-containment.ts';
import {
  createWindowsNamedMutexAllocationPort,
  WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS,
  type WindowsNamedMutexAllocationConfig,
  type WindowsNamedMutexAllocationPort
} from './windows-named-mutex-allocation.ts';
import {
  createNodeWindowsOneShotArtifactRuntime,
  type WindowsOneShotArtifactRuntimePort
} from './windows-one-shot-artifacts.ts';
import {
  createWindowsPm2OneShotLaunchPort,
  type WindowsPm2OneShotLaunchConfig,
  type WindowsPm2OneShotLaunchPort
} from './windows-pm2-one-shot-launch.ts';
import { createWindowsProcessIncarnationPort } from './windows-process-incarnation.ts';
import type {
  ExactPm2RecordDeletionIssue,
  ExactPm2RecordDeletionPort,
  ExactPm2RecordDeletionRequest
} from './windows-terminal-cleanup.ts';

export const WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT =
  'windows-pm2-one-shot-composition/v1' as const;
export const WINDOWS_PM2_ONE_SHOT_DEFAULT_NAMESPACE = 'nebular-one-shot' as const;
export const WINDOWS_PM2_ONE_SHOT_DEFAULT_SLOT_CAPACITY = 1;
export const WINDOWS_PM2_ONE_SHOT_DEFAULT_ADAPTER_TIMEOUT_MS = 2_000;
export const WINDOWS_PM2_ONE_SHOT_DEFAULT_ALLOCATION_TIMEOUT_MS = 2_000;
export const WINDOWS_PM2_ONE_SHOT_DEFAULT_KILL_RETRY_TIME_MS = 100;

export type WindowsPm2OneShotCompositionOptions = Readonly<{
  brokerEntrypointPath: string;
  namespace?: string;
  slotCapacity?: number;
  pm2Endpoint?: string;
  adapterTimeoutMs?: number;
  allocationTimeoutMs?: number;
  killRetryTimeMs?: number;
  allowedNonsecretEnvironmentNames?: readonly string[];
}>;

export type WindowsPm2OneShotCompositionFactories = Readonly<{
  createAllocation: (
    config: WindowsNamedMutexAllocationConfig
  ) => WindowsNamedMutexAllocationPort<Pm2OneShotLaunchPayload>;
  createArtifacts: (
    filesystem: BunWindowsFilesystemFactsRuntime
  ) => WindowsOneShotArtifactRuntimePort;
  createCleanupProofs: () => Pm2OneShotCleanupProofPort;
  createClock: () => Readonly<{ nowMs: () => number }>;
  createContainment: (
    config: WindowsNamedJobContainmentConfig
  ) => WindowsNamedJobContainmentCapabilities;
  createFilesystem: () => BunWindowsFilesystemFactsRuntime;
  createPm2ApplicationRpc: () => Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
  createPm2Compatibility: () => Pm2PrerequisiteRuntimePort;
  createProcessIncarnations: () => CurrentProcessIncarnationPort;
  createStartTiming: () => GrantQualifiedOneShotStartTiming;
}>;

export type WindowsPm2OneShotCompositionCapabilities = Readonly<{
  artifacts: WindowsOneShotArtifactRuntimePort;
  clock: Readonly<{ nowMs: () => number }>;
  containment: WindowsNamedJobContainmentCapabilities;
  filesystem: BunWindowsFilesystemFactsRuntime;
  journal: AuthorityJournal;
  pm2Deletion: ExactPm2RecordDeletionPort;
  processIncarnations: CurrentProcessIncarnationPort;
  receiver: ReturnType<typeof createPm2ExactNameOneShotPorts>;
  timing: GrantQualifiedOneShotStartTiming;
}>;

export type WindowsPm2OneShotComposition = Readonly<{
  format: typeof WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT;
  authority: BrokerAuthorityPorts;
  authorityContext: WindowsExecutionAuthorityContext;
  journal: AuthorityJournal;
  launchConfig: WindowsPm2OneShotLaunchConfig;
  launch: WindowsPm2OneShotLaunchPort;
  capabilities: WindowsPm2OneShotCompositionCapabilities;
}>;

export type WindowsExecutionAuthorityContextResolverPort = Readonly<{
  resolve: (
    options: WindowsExecutionAuthorityContextOptions
  ) => Promise<BrokerResult<WindowsExecutionAuthorityContext>>;
}>;

export type WindowsPm2OneShotCompositionResolverRuntime = Readonly<{
  authorityContexts: WindowsExecutionAuthorityContextResolverPort;
  factories: WindowsPm2OneShotCompositionFactories;
}>;

export type WindowsPm2OneShotCompositionResolverOptions = Readonly<{
  authority?: WindowsExecutionAuthorityContextOptions;
  oneShot: WindowsPm2OneShotCompositionOptions;
}>;

type ValidWindowsPm2OneShotCompositionOptions = Readonly<{
  brokerEntrypointPath: string;
  pool: OneShotSlotPool;
  pm2Endpoint: string;
  adapterTimeoutMs: number;
  allocationTimeoutMs: number;
  killRetryTimeMs: number;
  allowedNonsecretEnvironmentNames: readonly string[];
}>;

const compositionFailure = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'bootstrap-failed',
  message: 'The production Windows one-shot composition is unavailable.'
});

const validPositiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const validNamedPipe = (value: string): boolean =>
  value.length > 0 && value.length <= 1_024 && !value.includes('\0') &&
  /^\\\\\.\\pipe\\[^\\]+(?:\\[^\\]+)*$/u.test(value);

const validEnvironmentNames = (names: readonly string[]): boolean => {
  const folded: readonly string[] = names.map(name => name.toUpperCase());
  return names.length <= PM2_ONE_SHOT_MAX_ENVIRONMENT_ENTRIES &&
    new Set(folded).size === folded.length &&
    names.every(name => createPm2NonsecretEnvironmentAtom(name, '', names).outcome === 'success');
};

const validateOptions = (
  options: WindowsPm2OneShotCompositionOptions
): BrokerResult<ValidWindowsPm2OneShotCompositionOptions> => {
  const namespace = options.namespace ?? WINDOWS_PM2_ONE_SHOT_DEFAULT_NAMESPACE;
  const slotCapacity = options.slotCapacity ?? WINDOWS_PM2_ONE_SHOT_DEFAULT_SLOT_CAPACITY;
  const pm2Endpoint = options.pm2Endpoint ?? PM2_WINDOWS_RPC_PIPE;
  const adapterTimeoutMs = options.adapterTimeoutMs ?? WINDOWS_PM2_ONE_SHOT_DEFAULT_ADAPTER_TIMEOUT_MS;
  const allocationTimeoutMs = options.allocationTimeoutMs ??
    WINDOWS_PM2_ONE_SHOT_DEFAULT_ALLOCATION_TIMEOUT_MS;
  const killRetryTimeMs = options.killRetryTimeMs ?? WINDOWS_PM2_ONE_SHOT_DEFAULT_KILL_RETRY_TIME_MS;
  const allowedNonsecretEnvironmentNames = Object.freeze([
    ...(options.allowedNonsecretEnvironmentNames ?? [])
  ]);
  const pool = createOneShotSlotPool(namespace, slotCapacity);
  return isCanonicalLocalWindowsAbsolutePath(options.brokerEntrypointPath) &&
    pool.outcome === 'success' && validNamedPipe(pm2Endpoint) &&
    validPositiveBound(adapterTimeoutMs, PM2_ONE_SHOT_MAX_TIMEOUT_MS) &&
    validPositiveBound(allocationTimeoutMs, WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS) &&
    validPositiveBound(killRetryTimeMs, PM2_ONE_SHOT_MAX_TIMEOUT_MS) &&
    validEnvironmentNames(allowedNonsecretEnvironmentNames)
    ? brokerOk({
        brokerEntrypointPath: options.brokerEntrypointPath,
        pool: pool.value,
        pm2Endpoint,
        adapterTimeoutMs,
        allocationTimeoutMs,
        killRetryTimeMs,
        allowedNonsecretEnvironmentNames
      })
    : compositionFailure();
};

const hasAuthoritySurface = (authority: BrokerAuthorityPorts): boolean =>
  typeof authority.canonicalizeRepository === 'function' &&
  typeof authority.resolveRecipe === 'function' && typeof authority.readGrant === 'function';

const hasAttemptSurface = (journal: AuthorityJournal): boolean =>
  typeof journal.attempts.readGrantQualifiedMaterializing === 'function' &&
  typeof journal.attempts.reserveGrantQualifiedMaterializing === 'function' &&
  typeof journal.attempts.bindVerifiedWindowsContainmentAndStart === 'function';

const validProfileRoot = (profile: TrustedProfileRoot): boolean =>
  isCanonicalLocalWindowsAbsolutePath(profile.value);

const validAuthorityContext = (context: WindowsExecutionAuthorityContext): boolean =>
  hasAuthoritySurface(context.authority) && hasAttemptSurface(context.journal) &&
  validProfileRoot(context.trustedProfileRoot) && isCanonicalLocalWindowsAbsolutePath(context.gitExecutable.value);

const compatibilityPort = (
  endpoint: string,
  timeoutMs: number,
  runtime: Pm2PrerequisiteRuntimePort
): Pm2OneShotCompatibilityPort => ({
  probeCompatible: () => probePm2Prerequisite({
    controlSurface: { kind: 'named-pipe', endpoint },
    timeoutMs
  }, runtime).then(
    status => status.status === 'compatible',
    () => false
  )
});

type Pm2ExactReceiver = ReturnType<typeof createPm2ExactNameOneShotPorts>;

const deletionFailure = (): OneShotResult<never, ExactPm2RecordDeletionIssue> => ({
  outcome: 'failure',
  issue: {
    code: 'pm2-exact-record-deletion-unconfirmed',
    safeMessage: 'The exact PM2 record deletion could not be confirmed.'
  }
});

const deletionSuccess = (
  value: ExactPm2RecordDeletionReceipt
): OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue> => ({
  outcome: 'success',
  value
});

const exactTreeProof = (
  binding: VerifiedWindowsAttemptContainmentBinding,
  proof: VerifiedWindowsTreeCleanupProof
): boolean => proof.jobIdentity.value === binding.jobIdentity.value &&
  proof.rootProcessId === binding.rootProcessId &&
  proof.rootProcessIncarnation.value === binding.rootProcessIncarnation.value &&
  Number.isSafeInteger(proof.observedAtMs) && proof.observedAtMs >= binding.membershipVerifiedAtMs;

const exactDeletionHandle = (
  request: ExactPm2RecordDeletionRequest,
  pool: OneShotSlotPool
): OneShotAttemptHandle | null => {
  const binding = request.binding;
  const matches: readonly OneShotSlotDefinition[] = pool.slots.filter(slot =>
    slot.slotId.value === binding.receiverSlotIdentity &&
    slot.processName.value === binding.receiverProcessName);
  if (validateVerifiedWindowsAttemptContainmentBinding(binding).type === 'err' ||
      !exactTreeProof(binding, request.treeCleanup) || binding.receiverId !== 'pm2' ||
      binding.receiverEntryIdentity.value !== `pm2-entry:${binding.receiverProcessName}` ||
      matches.length !== 1 || matches[0] === undefined) return null;
  return {
    slotId: matches[0].slotId,
    processName: matches[0].processName,
    attemptId: binding.processAttemptId,
    metadataDigest: binding.launchMetadataDigest,
    pmId: binding.receiverPmId
  };
};

const readDeletionTime = (
  clock: Readonly<{ nowMs: () => number }>,
  minimum: number
): Promise<number | null> => Promise.resolve().then(() => clock.nowMs()).then(
  value => Number.isSafeInteger(value) && value >= minimum ? value : null,
  () => null
);

const projectDeletionReceipt = (
  request: ExactPm2RecordDeletionRequest,
  disposition: ExactPm2RecordDeletionReceipt['disposition'],
  clock: Readonly<{ nowMs: () => number }>
): Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>> =>
  readDeletionTime(clock, request.treeCleanup.observedAtMs).then(deletedAtMs => deletedAtMs === null
    ? deletionFailure()
    : deletionSuccess({
        format: 'pm2-exact-record-deletion/v1',
        disposition,
        receiverId: request.binding.receiverId,
        receiverCorrelation: request.binding.receiverCorrelation,
        receiverSlotIdentity: request.binding.receiverSlotIdentity,
        receiverProcessName: request.binding.receiverProcessName,
        receiverPmId: request.binding.receiverPmId,
        processAttemptId: request.binding.processAttemptId,
        launchMetadataDigest: request.binding.launchMetadataDigest,
        deletedAtMs
      }));

const deleteObservedExactRecord = (
  request: ExactPm2RecordDeletionRequest,
  handle: OneShotAttemptHandle,
  receiver: Pm2ExactReceiver,
  clock: Readonly<{ nowMs: () => number }>
): Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>> => {
  const cleanup: OneShotCleanupReceipt = {
    format: 'one-shot-tree-cleanup/v1',
    handle,
    proof: 'confirmed'
  };
  return Promise.resolve().then(() => receiver.deleteExact(handle, cleanup)).then(
    deleted => deleted.outcome === 'success'
      ? projectDeletionReceipt(request, 'deleted', clock)
      : deletionFailure(),
    deletionFailure
  );
};

const deleteFromObservation = (
  request: ExactPm2RecordDeletionRequest,
  handle: OneShotAttemptHandle,
  pool: OneShotSlotPool,
  receiver: Pm2ExactReceiver,
  clock: Readonly<{ nowMs: () => number }>,
  observations: Awaited<ReturnType<Pm2ExactReceiver['observe']>>,
  retry: () => Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>>
): Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>> => {
  if (observations.outcome === 'failure') return retry();
  const inventory = validateOneShotSlotInventory(pool, observations.value);
  if (inventory.outcome === 'failure') return Promise.resolve(deletionFailure());
  const exact = inventory.value.find(observation => sameOneShotSlotId(observation.slotId, handle.slotId) &&
    sameOneShotProcessName(observation.processName, handle.processName));
  if (exact?.occupant.kind === 'empty') {
    const duplicateAttempt = inventory.value.some(observation => observation.occupant.kind === 'owned' &&
      observation.occupant.metadata.attemptId === handle.attemptId);
    return duplicateAttempt
      ? Promise.resolve(deletionFailure())
      : projectDeletionReceipt(request, 'already-absent', clock);
  }
  const owned = validateOneShotAttempt(pool, inventory.value, handle);
  if (owned.outcome === 'failure') return Promise.resolve(deletionFailure());
  if (owned.value.status === 'stopped' || owned.value.status === 'errored') {
    return deleteObservedExactRecord(request, handle, receiver, clock).then(result =>
      result.outcome === 'success' ? result : retry());
  }
  return owned.value.status === 'online' || owned.value.status === 'launching' ||
    owned.value.status === 'stopping'
    ? retry()
    : Promise.resolve(deletionFailure());
};

const validDeletionTiming = (timing: GrantQualifiedOneShotStartTiming): boolean =>
  validPositiveBound(timing.confirmationAttempts, 100) &&
  validPositiveBound(timing.confirmationIntervalMs, PM2_ONE_SHOT_MAX_TIMEOUT_MS);

const observeExactRecordForDeletion = (
  request: ExactPm2RecordDeletionRequest,
  handle: OneShotAttemptHandle,
  pool: OneShotSlotPool,
  receiver: Pm2ExactReceiver,
  clock: Readonly<{ nowMs: () => number }>,
  timing: GrantQualifiedOneShotStartTiming,
  attempt: number = 0
): Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>> => {
  const retry = (): Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>> =>
    attempt + 1 >= timing.confirmationAttempts
      ? Promise.resolve(deletionFailure())
      : Promise.resolve().then(() => timing.wait(timing.confirmationIntervalMs)).then(
          () => observeExactRecordForDeletion(
            request,
            handle,
            pool,
            receiver,
            clock,
            timing,
            attempt + 1
          ),
          deletionFailure
        );
  return Promise.resolve().then(() => receiver.observe(pool)).then(
    observations => deleteFromObservation(request, handle, pool, receiver, clock, observations, retry),
    retry
  );
};

const createCleanupGatedPm2ExactRecordDeletionPort = (
  pool: OneShotSlotPool,
  receiver: Pm2ExactReceiver,
  clock: Readonly<{ nowMs: () => number }>,
  timing: GrantQualifiedOneShotStartTiming
): ExactPm2RecordDeletionPort => ({
  deleteExactRecord: request => {
    const handle = exactDeletionHandle(request, pool);
    return handle === null || !validDeletionTiming(timing)
      ? Promise.resolve(deletionFailure())
      : observeExactRecordForDeletion(request, handle, pool, receiver, clock, timing);
  }
});

const compose = (
  context: WindowsExecutionAuthorityContext,
  options: ValidWindowsPm2OneShotCompositionOptions,
  factories: WindowsPm2OneShotCompositionFactories
): BrokerResult<WindowsPm2OneShotComposition> => {
  if (!validAuthorityContext(context)) return compositionFailure();
  return brokerTry(() => {
    const filesystem = factories.createFilesystem();
    const artifacts = factories.createArtifacts(filesystem);
    const allocation = factories.createAllocation({
      namespace: options.pool.namespace,
      trustedProfileRoot: context.trustedProfileRoot,
      timeoutMs: options.allocationTimeoutMs
    });
    const containment = factories.createContainment({
      trustedProfileRoot: context.trustedProfileRoot,
      namespace: options.pool.namespace
    });
    const processIncarnations = factories.createProcessIncarnations();
    const timing = factories.createStartTiming();
    const clock = factories.createClock();
    const receiverConfig = {
      endpoint: options.pm2Endpoint,
      timeoutMs: options.adapterTimeoutMs,
      namespace: options.pool.namespace,
      allowedNonsecretEnvironmentNames: options.allowedNonsecretEnvironmentNames,
      killRetryTimeMs: options.killRetryTimeMs
    } as const;
    const rpc = factories.createPm2ApplicationRpc();
    const compatibility = compatibilityPort(
      options.pm2Endpoint,
      options.adapterTimeoutMs,
      factories.createPm2Compatibility()
    );
    const receiver = createPm2ExactNameOneShotPorts(receiverConfig, {
      rpc,
      compatibility,
      cleanupProofs: factories.createCleanupProofs(),
      allocation
    });
    const cleanupReceiver = createPm2ExactNameOneShotPorts(receiverConfig, {
      rpc,
      compatibility,
      cleanupProofs: { readProof: () => Promise.resolve('confirmed') },
      allocation
    });
    const pm2Deletion = createCleanupGatedPm2ExactRecordDeletionPort(
      options.pool,
      cleanupReceiver,
      clock,
      timing
    );
    const launchConfig: WindowsPm2OneShotLaunchConfig = {
      trustedProfileRoot: context.trustedProfileRoot,
      brokerEntrypointPath: options.brokerEntrypointPath,
      pool: options.pool,
      allowedNonsecretEnvironmentNames: options.allowedNonsecretEnvironmentNames
    };
    const launch = createWindowsPm2OneShotLaunchPort(launchConfig, {
      filesystem,
      artifacts,
      attempts: context.journal.attempts,
      receiver,
      processIncarnations,
      containment,
      timing
    });
    return {
      format: WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT,
      authority: context.authority,
      authorityContext: context,
      journal: context.journal,
      launchConfig,
      launch,
      capabilities: {
        artifacts,
        clock,
        containment,
        filesystem,
        journal: context.journal,
        pm2Deletion,
        processIncarnations,
        receiver,
        timing
      }
    };
  }, {
    code: 'bootstrap-failed',
    message: 'The production Windows one-shot composition is unavailable.'
  });
};

export const createProductionWindowsPm2OneShotCompositionFactories = (
): WindowsPm2OneShotCompositionFactories => ({
  createAllocation: config => createWindowsNamedMutexAllocationPort(config),
  createArtifacts: filesystem => createNodeWindowsOneShotArtifactRuntime(filesystem),
  createCleanupProofs: createUnadmittedPm2OneShotCleanupProofPort,
  createClock: () => ({ nowMs: () => Date.now() }),
  createContainment: config => createWindowsNamedJobContainmentPort(config),
  createFilesystem: createBunWindowsFilesystemFactsRuntime,
  createPm2ApplicationRpc: createNodeNetPm2ApplicationRpcClient,
  createPm2Compatibility: createPm2ProtocolCompatibilityRuntimePort,
  createProcessIncarnations: createWindowsProcessIncarnationPort,
  createStartTiming: createSystemGrantQualifiedOneShotStartTiming
});

export const createWindowsPm2OneShotComposition = (
  context: WindowsExecutionAuthorityContext,
  options: WindowsPm2OneShotCompositionOptions,
  factories: WindowsPm2OneShotCompositionFactories =
    createProductionWindowsPm2OneShotCompositionFactories()
): BrokerResult<WindowsPm2OneShotComposition> => {
  const validated = validateOptions(options);
  return validated.isErr() ? compositionFailure() : compose(context, validated.value, factories);
};

export const createWindowsPm2OneShotCompositionResolverRuntime = (
): WindowsPm2OneShotCompositionResolverRuntime => ({
  authorityContexts: { resolve: options => resolveWindowsExecutionAuthorityContext(options) },
  factories: createProductionWindowsPm2OneShotCompositionFactories()
});

export const resolveWindowsPm2OneShotComposition = (
  options: WindowsPm2OneShotCompositionResolverOptions,
  injectedRuntime?: WindowsPm2OneShotCompositionResolverRuntime
): Promise<BrokerResult<WindowsPm2OneShotComposition>> => {
  const validated = validateOptions(options.oneShot);
  if (validated.isErr()) return Promise.resolve(compositionFailure());
  return Promise.resolve()
    .then(() => injectedRuntime ?? createWindowsPm2OneShotCompositionResolverRuntime())
    .then(runtime => runtime.authorityContexts.resolve(options.authority ?? {}).then(
      context => context.isOk()
        ? compose(context.value, validated.value, runtime.factories)
        : compositionFailure<WindowsPm2OneShotComposition>(),
      () => compositionFailure<WindowsPm2OneShotComposition>()
    ))
    .then(
      result => result,
      () => compositionFailure<WindowsPm2OneShotComposition>()
    );
};
