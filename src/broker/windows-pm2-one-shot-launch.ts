import { createHash } from 'node:crypto';

import type { AuthorizedExecution } from './authority.ts';
import type { BunWindowsFilesystemFactsRuntime } from './bun-windows-filesystem-facts.ts';
import {
  createSystemGrantQualifiedOneShotStartTiming,
  startGrantQualifiedOneShotReservation,
  type GrantQualifiedOneShotStartIssue,
  type GrantQualifiedOneShotStartOutcome,
  type GrantQualifiedOneShotStartPorts,
  type GrantQualifiedOneShotStartTiming
} from './grant-qualified-one-shot-start.ts';
import {
  parseJournalOperationId,
  parseProcessIncarnation,
  parseDurableWindowsNamedJobIdentity,
  validateVerifiedWindowsAttemptContainmentBinding,
  type AttemptJournal,
  type BootstrapAttemptBinding,
  type BootstrapAttemptJournalRecord,
  type GrantQualifiedContainedAttemptRecord,
  type GrantQualifiedMaterializingAttemptRecord,
  type JournalOperationId,
  type ProcessIncarnation,
  type TrustedProfileRoot,
  type VerifiedWindowsAttemptContainmentBinding
} from './journal.ts';
import {
  reserveGrantQualifiedOneShotMaterialization,
  type GrantQualifiedOneShotFinalizationContext,
  type GrantQualifiedOneShotLaunchFactory,
  type GrantQualifiedOneShotReservation,
  type OneShotMaterializationReservationIssue,
  type OneShotMaterializationReservationPortIssue,
  type OneShotMaterializationReservationPorts
} from './one-shot-materialization-reservation.ts';
import type {
  AdmittedOneShotLaunch,
  ExactNameOneShotPorts,
  OneShotLaunchFactoryIssue,
  OneShotReceiverIssue,
  OneShotReceiverPortIssue
} from './one-shot-receiver.ts';
import type {
  OneShotAttemptHandle,
  OneShotResult,
  OneShotSlotPool
} from './one-shot-slots.ts';
import {
  createPm2NonsecretEnvironmentAtom,
  derivePm2ManagedWindowsContainment,
  pm2OneShotMetadataDigest,
  type Pm2NonsecretEnvironmentAtom,
  type Pm2OneShotLaunchPayload
} from './pm2-exact-name-receiver.ts';
import type { ProcessAttemptId } from './primitives.ts';
import {
  planAuthorizedRecipeMaterialization,
  type RecipeMaterializationPlan
} from './recipe-materialization-plan.ts';
import type { CurrentProcessIncarnationPort } from './receiver-attempt-verifier.ts';
import {
  createWindowsExecutionPathResolver
} from './windows-execution-paths.ts';
import {
  createWindowsExecutionTargetEntrypointResolver,
  createWindowsExecutionToolRegistry
} from './windows-tool-registry.ts';
import {
  type WindowsNamedJobContainmentPort,
  type WindowsNamedJobIdentity,
  type WindowsNamedJobVerificationReceipt
} from './windows-named-job-containment.ts';
import {
  planWindowsOneShotArtifacts,
  prepareWindowsOneShotArtifacts,
  type WindowsOneShotArtifactPlan,
  type WindowsOneShotArtifactRuntimePort
} from './windows-one-shot-artifacts.ts';

export const WINDOWS_PM2_ONE_SHOT_BIND_OPERATION_DOMAIN =
  'epsilonode.nebular.windows-pm2-one-shot-bind/v1' as const;

export const WINDOWS_PM2_ONE_SHOT_BOOTSTRAP_READY_OPERATION_DOMAIN =
  'epsilonode.nebular.windows-pm2-one-shot-bootstrap-ready/v1' as const;

export type WindowsPm2OneShotLaunchRecoveryStage =
  | 'configuration'
  | 'canonical-plan'
  | 'receiver-probe'
  | 'durable-reservation'
  | 'exact-start'
  | 'exact-start-invalid'
  | 'exact-start-admission'
  | 'exact-start-lock'
  | 'exact-start-observation'
  | 'exact-start-artifact-preparation'
  | 'exact-start-receiver-start'
  | 'exact-start-bootstrap-artifact'
  | 'exact-start-bootstrap-job-pending'
  | 'exact-start-bootstrap-job-name-missing'
  | 'exact-start-bootstrap-job-empty'
  | 'exact-start-bootstrap-job-unavailable'
  | 'exact-start-bootstrap-job-multiple'
  | 'exact-start-bootstrap-job-policy'
  | 'exact-start-bootstrap-process-incarnation'
  | 'exact-start-bootstrap-job-membership'
  | 'exact-start-bootstrap-journal-bind'
  | 'exact-start-ownership'
  | 'exact-start-confirmation'
  | 'exact-start-timing'
  | 'terminal-before-containment'
  | 'process-incarnation'
  | 'job-containment'
  | 'bootstrap-binding';

type WindowsPm2OneShotActiveStart = Extract<
  GrantQualifiedOneShotStartOutcome,
  Readonly<{ state: 'exact-start-confirmed' }>
>;

type WindowsPm2OneShotTerminalStart = Extract<
  GrantQualifiedOneShotStartOutcome,
  Readonly<{ state: 'exact-terminal-confirmed' }>
>;

export type WindowsPm2OneShotReservedLaunchReceipt = Readonly<{
  format: 'windows-pm2-one-shot-launch-receipt/v1';
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
  start: null;
  containedAttempt: null;
}>;

export type WindowsPm2OneShotActiveLaunchReceipt = Readonly<{
  format: 'windows-pm2-one-shot-launch-receipt/v1';
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
  start: WindowsPm2OneShotActiveStart;
  containedAttempt: GrantQualifiedContainedAttemptRecord | null;
}>;

export type WindowsPm2OneShotTerminalLaunchReceipt = Readonly<{
  format: 'windows-pm2-one-shot-launch-receipt/v1';
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
  start: WindowsPm2OneShotTerminalStart;
  containedAttempt: null;
}>;

export type WindowsPm2OneShotLaunchReceipt =
  | WindowsPm2OneShotReservedLaunchReceipt
  | WindowsPm2OneShotActiveLaunchReceipt
  | WindowsPm2OneShotTerminalLaunchReceipt;

export type WindowsPm2OneShotRunningLaunch = Readonly<{
  state: 'launched' | 'replayed';
  attemptId: ProcessAttemptId;
  handle: OneShotAttemptHandle;
  processId: number;
  processIncarnation: ProcessIncarnation;
  job: WindowsNamedJobIdentity;
  receiverStatus: 'online' | 'launching';
  journalState: 'running';
  bindingGeneration: number;
  receipt: WindowsPm2OneShotActiveLaunchReceipt & Readonly<{
    containedAttempt: GrantQualifiedContainedAttemptRecord;
  }>;
}>;

export type WindowsPm2OneShotLaunchRecovery = Readonly<{
  state: 'recovery-required';
  stage: WindowsPm2OneShotLaunchRecoveryStage;
  attemptId: ProcessAttemptId | null;
  safeMessage: string;
  receipt: WindowsPm2OneShotLaunchReceipt | null;
}>;

export type WindowsPm2OneShotLaunchOutcome =
  | WindowsPm2OneShotRunningLaunch
  | WindowsPm2OneShotLaunchRecovery;

export type WindowsPm2OneShotLaunchConfig = Readonly<{
  trustedProfileRoot: TrustedProfileRoot;
  brokerEntrypointPath: string;
  pool: OneShotSlotPool;
  allowedNonsecretEnvironmentNames: readonly string[];
}>;

export type WindowsPm2OneShotLaunchPorts = Readonly<{
  filesystem: BunWindowsFilesystemFactsRuntime;
  artifacts: WindowsOneShotArtifactRuntimePort;
  attempts: Pick<AttemptJournal,
    | 'bindBootstrap'
    | 'bindVerifiedWindowsContainmentAndStart'
    | 'readGrantQualifiedMaterializing'
    | 'reserveGrantQualifiedMaterializing'>;
  receiver: Pick<ExactNameOneShotPorts<Pm2OneShotLaunchPayload>,
    'probe' | 'withAllocationLock' | 'observe' | 'startExact'>;
  processIncarnations: CurrentProcessIncarnationPort;
  containment: WindowsNamedJobContainmentPort;
  timing: GrantQualifiedOneShotStartTiming;
}>;

export type WindowsPm2OneShotLaunchPort = Readonly<{
  launch: (
    execution: AuthorizedExecution,
    observedAtMs: number
  ) => Promise<WindowsPm2OneShotLaunchOutcome>;
}>;

type RunningVerification = Readonly<{
  processIncarnation: ProcessIncarnation;
  job: WindowsNamedJobVerificationReceipt;
}>;

type RunningVerificationOutcome =
  | Readonly<{ status: 'verified'; value: RunningVerification }>
  | Readonly<{ status: 'process-incarnation-unavailable' }>
  | Readonly<{ status: 'job-containment-unverified' }>;

type BootstrapReadinessDetail = Exclude<OneShotReceiverPortIssue['detail'], undefined>;

type BootstrapReadinessOutcome =
  | Readonly<{ status: 'bound' }>
  | Readonly<{ status: 'failed'; detail: BootstrapReadinessDetail }>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({
  outcome: 'success',
  value
});

const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const recovery = (
  stage: WindowsPm2OneShotLaunchRecoveryStage,
  attemptId: ProcessAttemptId | null,
  receipt: WindowsPm2OneShotLaunchReceipt | null = null
): WindowsPm2OneShotLaunchRecovery => ({
  state: 'recovery-required',
  stage,
  attemptId,
  safeMessage: 'The exact Windows PM2 one-shot launch requires bounded reconciliation.',
  receipt
});

const reservedReceipt = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>
): WindowsPm2OneShotReservedLaunchReceipt => ({
  format: 'windows-pm2-one-shot-launch-receipt/v1',
  reservation,
  start: null,
  containedAttempt: null
});

const activeReceipt = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  start: WindowsPm2OneShotActiveStart,
  containedAttempt: GrantQualifiedContainedAttemptRecord | null
): WindowsPm2OneShotActiveLaunchReceipt => ({
  format: 'windows-pm2-one-shot-launch-receipt/v1',
  reservation,
  start,
  containedAttempt
});

const terminalReceipt = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  start: WindowsPm2OneShotTerminalStart
): WindowsPm2OneShotTerminalLaunchReceipt => ({
  format: 'windows-pm2-one-shot-launch-receipt/v1',
  reservation,
  start,
  containedAttempt: null
});

const launchFactoryFailure = (): OneShotResult<never, OneShotLaunchFactoryIssue> => failure({
  code: 'one-shot-launch-factory-failed',
  safeMessage: 'The canonical Windows PM2 launch payload could not be finalized.'
});

const reservationLockFailure = (): OneShotResult<never, OneShotMaterializationReservationIssue> => failure({
  code: 'one-shot-reservation-lock-unavailable',
  safeMessage: 'The exact one-shot reservation lock is unavailable.'
});

const reservationObservationFailure = (): OneShotResult<never, OneShotMaterializationReservationPortIssue> => failure({
  code: 'one-shot-reservation-observation-unavailable',
  safeMessage: 'The exact one-shot receiver observation is unavailable.'
});

const startLockFailure = (): OneShotResult<never, GrantQualifiedOneShotStartIssue> => failure({
  code: 'grant-qualified-one-shot-start-port-failed',
  operation: 'lock',
  safeMessage: 'The exact durable one-shot start capability failed closed.'
});

const artifactPreparationFailure = (): OneShotResult<never, Readonly<{
  code: 'exact-start-preparation-failed';
  safeMessage: string;
}>> => failure({
  code: 'exact-start-preparation-failed',
  safeMessage: 'The exact trusted one-shot artifacts could not be prepared.'
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => {
  const actual: readonly string[] = Object.keys(value);
  return actual.length === keys.length && keys.every(key => actual.includes(key));
};

const validConfig = (config: WindowsPm2OneShotLaunchConfig): boolean => {
  const folded: readonly string[] = config.allowedNonsecretEnvironmentNames.map(name => name.toUpperCase());
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(config.pool.namespace) &&
    config.pool.slots.length > 0 && config.pool.slots.length <= 100 &&
    config.brokerEntrypointPath.length > 0 && config.brokerEntrypointPath.length <= 4_096 &&
    !config.brokerEntrypointPath.includes('\0') && new Set(folded).size === folded.length;
};

const stripSha256Prefix = (value: string): string => value.startsWith('sha256:')
  ? value.slice('sha256:'.length)
  : value;

const EMPTY_ENVIRONMENT_ATOMS: readonly Pm2NonsecretEnvironmentAtom[] = Object.freeze([]);

const successfulEnvironmentAtom = (
  atom: OneShotResult<Pm2NonsecretEnvironmentAtom, unknown>
): readonly Pm2NonsecretEnvironmentAtom[] => atom.outcome === 'success'
  ? Object.freeze([atom.value])
  : EMPTY_ENVIRONMENT_ATOMS;

const successfulEnvironmentAtoms = (
  atoms: readonly OneShotResult<Pm2NonsecretEnvironmentAtom, OneShotLaunchFactoryIssue>[]
): readonly Pm2NonsecretEnvironmentAtom[] => atoms.flatMap(successfulEnvironmentAtom);

const buildEnvironment = (
  plan: RecipeMaterializationPlan,
  allowedNames: readonly string[]
): OneShotResult<Pm2OneShotLaunchPayload['nonsecretEnvironment'], OneShotLaunchFactoryIssue> => {
  const atoms: readonly OneShotResult<Pm2NonsecretEnvironmentAtom, unknown>[] =
    plan.nonsecretEnvironment.map(entry => createPm2NonsecretEnvironmentAtom(
      entry.name,
      entry.value,
      allowedNames
    ));
  return atoms.every(atom => atom.outcome === 'success')
    ? success(successfulEnvironmentAtoms(atoms))
    : launchFactoryFailure();
};

const finalizePayload = (
  context: GrantQualifiedOneShotFinalizationContext,
  config: WindowsPm2OneShotLaunchConfig
): OneShotResult<AdmittedOneShotLaunch<Pm2OneShotLaunchPayload>, OneShotLaunchFactoryIssue> => {
  const artifacts = planWindowsOneShotArtifacts(
    config.trustedProfileRoot,
    context.identity.attemptId,
    context.identity.slotIndependentPlanDigest.value
  );
  const containment = derivePm2ManagedWindowsContainment({
    trustedProfileRoot: config.trustedProfileRoot,
    namespace: config.pool.namespace
  }, {
    attemptId: context.identity.attemptId,
    attemptDigest: stripSha256Prefix(context.identity.slotIndependentPlanDigest.value)
  });
  const environment = buildEnvironment(context.plan, config.allowedNonsecretEnvironmentNames);
  if (artifacts.isErr() || containment.outcome === 'failure' || environment.outcome === 'failure') {
    return launchFactoryFailure();
  }
  const payload: Pm2OneShotLaunchPayload = {
    executablePath: context.plan.tool.executable.value,
    cwd: context.plan.workingDirectory.value,
    args: [context.plan.targetEntrypoint.value, ...context.plan.argv.slice(1)],
    stdoutPath: artifacts.value.stdoutPath,
    stderrPath: artifacts.value.stderrPath,
    pidPath: artifacts.value.pidPath,
    nonsecretEnvironment: environment.value,
    managedContainment: containment.value,
    managedBootstrap: {
      format: 'pm2-managed-bun-recipe-bootstrap/v1',
      brokerEntrypoint: context.plan.tool.brokerEntrypoint
    },
    authority: {
      receiverId: context.receiver.receiverId,
      receiverEntryIdentity: context.receiver.receiverEntryIdentity,
      receiverCorrelation: context.receiver.receiverCorrelation,
      repository: context.plan.repository,
      recipeRevision: context.plan.recipeRevision,
      grantId: context.plan.authority.grantId,
      grantGeneration: context.plan.authority.grantGeneration,
      bindingGeneration: 1
    }
  };
  return success({
    attemptId: context.identity.attemptId,
    metadataDigest: pm2OneShotMetadataDigest(
      context.identity.attemptId,
      payload,
      context.startedAtMs,
      context.deadlineAtMs
    ),
    startedAtMs: context.startedAtMs,
    deadlineAtMs: context.deadlineAtMs,
    payload
  });
};

export const createWindowsPm2OneShotLaunchFactory = (
  config: WindowsPm2OneShotLaunchConfig
): GrantQualifiedOneShotLaunchFactory<Pm2OneShotLaunchPayload> => ({
  finalizeForSlot: context => validConfig(config)
    ? finalizePayload(context, config)
    : launchFactoryFailure()
});

const adaptReservationLock = <Value>(
  receiver: WindowsPm2OneShotLaunchPorts['receiver'],
  namespace: string,
  work: () => Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>>
): Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>> => Promise.resolve()
  .then(() => receiver.withAllocationLock<OneShotResult<Value, OneShotMaterializationReservationIssue>>(
    namespace,
    () => Promise.resolve().then(work).then(inner => success<
      OneShotResult<Value, OneShotMaterializationReservationIssue>,
      OneShotReceiverIssue
    >(inner))
  ))
  .then(
    locked => locked.outcome === 'success' ? locked.value : reservationLockFailure(),
    reservationLockFailure
  );

const reservationPorts = (
  ports: WindowsPm2OneShotLaunchPorts
): OneShotMaterializationReservationPorts => ({
  withAllocationLock: (namespace, work) => adaptReservationLock(ports.receiver, namespace, work),
  observe: pool => Promise.resolve().then(() => ports.receiver.observe(pool)).then(
    observed => observed.outcome === 'success' ? observed : reservationObservationFailure(),
    reservationObservationFailure
  ),
  attempts: ports.attempts
});

const exactArtifactPlan = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  config: WindowsPm2OneShotLaunchConfig
): WindowsOneShotArtifactPlan | null => {
  const planned = planWindowsOneShotArtifacts(
    config.trustedProfileRoot,
    reservation.identity.attemptId,
    reservation.identity.slotIndependentPlanDigest.value
  );
  if (planned.isErr()) return null;
  const payload = reservation.launch.payload;
  const containment = derivePm2ManagedWindowsContainment({
    trustedProfileRoot: config.trustedProfileRoot,
    namespace: config.pool.namespace
  }, {
    attemptId: reservation.identity.attemptId,
    attemptDigest: stripSha256Prefix(reservation.identity.slotIndependentPlanDigest.value)
  });
  return containment.outcome === 'success' &&
    containment.value.jobIdentity.value === payload.managedContainment.jobIdentity.value &&
    planned.value.stdoutPath === payload.stdoutPath && planned.value.stderrPath === payload.stderrPath &&
    planned.value.pidPath === payload.pidPath
    ? planned.value
    : null;
};

const prepareExactArtifacts = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  config: WindowsPm2OneShotLaunchConfig,
  runtime: WindowsOneShotArtifactRuntimePort
): ReturnType<GrantQualifiedOneShotStartPorts<Pm2OneShotLaunchPayload>['prepareExactStart']> => {
  const plan = exactArtifactPlan(reservation, config);
  return plan === null
    ? Promise.resolve(artifactPreparationFailure())
    : Promise.resolve().then(() => prepareWindowsOneShotArtifacts(plan, runtime)).then(
        prepared => prepared.isOk() ? success(undefined) : artifactPreparationFailure(),
        artifactPreparationFailure
      );
};

const adaptStartLock = <Value>(
  receiver: WindowsPm2OneShotLaunchPorts['receiver'],
  namespace: string,
  work: () => Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>
): Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>> => Promise.resolve()
  .then(() => receiver.withAllocationLock<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>(
    namespace,
    () => Promise.resolve().then(work).then(inner => success<
      OneShotResult<Value, GrantQualifiedOneShotStartIssue>,
      OneShotReceiverIssue
    >(inner))
  ))
  .then(
    locked => locked.outcome === 'success' ? locked.value : startLockFailure(),
    startLockFailure
  );

const starterPorts = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): GrantQualifiedOneShotStartPorts<Pm2OneShotLaunchPayload> => ({
  attempts: ports.attempts,
  withAllocationLock: (namespace, work) => adaptStartLock(ports.receiver, namespace, work),
  observe: ports.receiver.observe,
  prepareExactStart: reservation => prepareExactArtifacts(reservation, config, ports.artifacts),
  startExact: request => Promise.resolve().then(() => ports.receiver.startExact(request)).then(
    started => started.outcome === 'failure'
      ? started
      : bindBootstrapReadiness(reservation, config, ports).then(readiness => readiness.status === 'bound'
          ? started
          : bootstrapReadinessFailure(readiness.detail)),
    () => bootstrapReadinessFailure('bootstrap-job-unavailable')
  )
});

const decodeRunningIncarnation = (
  value: unknown,
  processId: number
): ProcessIncarnation | null => {
  if (!isRecord(value) || !exactKeys(value, ['status', 'processId', 'incarnation']) ||
      value['status'] !== 'running' || value['processId'] !== processId || !isRecord(value['incarnation']) ||
      !exactKeys(value['incarnation'], ['kind', 'value']) || value['incarnation']['kind'] !== 'process-incarnation') {
    return null;
  }
  const parsed = parseProcessIncarnation(value['incarnation']['value']);
  return parsed.type === 'ok' ? parsed.value : null;
};

const verifyJobReceipt = (
  receipt: WindowsNamedJobVerificationReceipt,
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  processId: number,
  incarnation: ProcessIncarnation
): boolean => receipt.processId === processId &&
  receipt.processIncarnation.value === incarnation.value &&
  receipt.job.value === reservation.launch.payload.managedContainment.jobIdentity.value;

const verifyRunningProcess = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  processId: number,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<RunningVerificationOutcome> => Promise.resolve()
  .then(() => ports.processIncarnations.readCurrentIncarnation({ processId }))
  .then(
    observation => {
      const incarnation = decodeRunningIncarnation(observation, processId);
      if (incarnation === null) return { status: 'process-incarnation-unavailable' } as const;
      const verified = (receipt: WindowsNamedJobVerificationReceipt): RunningVerification => ({
        processIncarnation: incarnation,
        job: receipt
      });
      const verifiedOutcome = (receipt: WindowsNamedJobVerificationReceipt): RunningVerificationOutcome => ({
        status: 'verified',
        value: verified(receipt)
      });
      const containmentUnavailable = (): RunningVerificationOutcome => ({
        status: 'job-containment-unverified'
      });
      return Promise.resolve().then(() => ports.containment.verifyExactProcess({
        attemptId: reservation.identity.attemptId,
        attemptDigest: stripSha256Prefix(reservation.identity.slotIndependentPlanDigest.value),
        processId,
        processIncarnation: incarnation
      })).then(
        result => result.isOk() && verifyJobReceipt(result.value, reservation, processId, incarnation)
          ? verifiedOutcome(result.value)
          : containmentUnavailable(),
        containmentUnavailable
      );
    },
    () => ({ status: 'process-incarnation-unavailable' as const })
  );

const operationId = (
  domain: string,
  values: readonly unknown[]
): JournalOperationId | null => {
  const digest = createHash('sha256').update(JSON.stringify([domain, ...values])).digest('hex');
  const parsed = parseJournalOperationId(`windows-pm2-one-shot-v1-${digest}`);
  return parsed.type === 'ok' ? parsed.value : null;
};

const bootstrapReadinessFailure = (
  detail: BootstrapReadinessDetail
): OneShotResult<void, OneShotReceiverPortIssue> => failure({
  code: 'pm2-operation-failed',
  operation: 'start-exact',
  detail,
  safeMessage: 'The exact PM2 bootstrap readiness acknowledgement failed closed.'
});

const bootstrapBound = (): BootstrapReadinessOutcome => ({ status: 'bound' });
const bootstrapFailed = (detail: BootstrapReadinessDetail): BootstrapReadinessOutcome => ({
  status: 'failed',
  detail
});

const bootstrapBindingFromVerification = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  processId: number,
  verification: RunningVerification
): BootstrapAttemptBinding => ({
  format: 'bootstrap-attempt-binding/v2',
  bindingGeneration: reservation.admission.bindingGeneration,
  grantId: reservation.authority.grantId,
  grantGeneration: reservation.authority.grantGeneration,
  receiverId: reservation.receiver.receiverId,
  receiverEntryIdentity: reservation.receiver.receiverEntryIdentity,
  helperParentProcessId: processId,
  helperParentProcessIncarnation: verification.processIncarnation,
  recipeLocator: reservation.admission.recipeLocator
});

const exactBootstrapReadinessRecord = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  binding: BootstrapAttemptBinding,
  record: BootstrapAttemptJournalRecord
): boolean => record.id === reservation.identity.attemptId && record.state === 'materializing' &&
  record.stateVersion === reservation.attempt.stateVersion + 1 &&
  record.receiverCorrelation?.value === reservation.receiver.receiverCorrelation.value &&
  record.bootstrapBinding.bindingGeneration === binding.bindingGeneration &&
  record.bootstrapBinding.grantId === binding.grantId &&
  record.bootstrapBinding.grantGeneration === binding.grantGeneration &&
  record.bootstrapBinding.receiverId === binding.receiverId &&
  record.bootstrapBinding.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
  record.bootstrapBinding.helperParentProcessId === binding.helperParentProcessId &&
  record.bootstrapBinding.helperParentProcessIncarnation.value === binding.helperParentProcessIncarnation.value &&
  record.bootstrapBinding.recipeLocator.value === binding.recipeLocator.value;

const persistBootstrapReadiness = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  processId: number,
  verification: RunningVerification,
  verifiedAtMs: number,
  attempts: WindowsPm2OneShotLaunchPorts['attempts']
): Promise<boolean> => {
  const binding = bootstrapBindingFromVerification(reservation, processId, verification);
  const id = operationId(WINDOWS_PM2_ONE_SHOT_BOOTSTRAP_READY_OPERATION_DOMAIN, [
    reservation.identity.attemptId,
    reservation.exactReservationDigest.value,
    processId,
    verification.processIncarnation.value,
    verification.job.job.value,
    verifiedAtMs
  ]);
  if (id === null) return Promise.resolve(false);
  return Promise.resolve().then(() => attempts.bindBootstrap({
    operationId: id,
    attemptId: reservation.identity.attemptId,
    expectedStateVersion: reservation.attempt.stateVersion,
    atMs: verifiedAtMs,
    receiverCorrelation: reservation.receiver.receiverCorrelation,
    binding,
    mode: 'initial',
    expectedState: 'materializing',
    priorBindingGeneration: null
  })).then(
    result => result.type === 'ok' && exactBootstrapReadinessRecord(
      reservation,
      binding,
      result.value.record
    ),
    () => false
  );
};

const waitForBootstrapReadiness = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  ports: WindowsPm2OneShotLaunchPorts,
  lastDetail: BootstrapReadinessDetail = 'bootstrap-job-pending'
): Promise<BootstrapReadinessOutcome> => {
  const retry = (detail: BootstrapReadinessDetail): Promise<BootstrapReadinessOutcome> => Promise.resolve()
    .then(() => ports.timing.wait(ports.timing.confirmationIntervalMs))
    .then(
      () => waitForBootstrapReadiness(reservation, ports, detail),
      () => bootstrapFailed(detail)
    );
  return readSafeNow(ports.timing).then(nowMs => {
    if (nowMs === null || nowMs >= reservation.launch.deadlineAtMs ||
        nowMs >= reservation.authority.grantExpiresAtMs) return bootstrapFailed(lastDetail);
    return ports.containment.observeBootstrapRoot({
      attemptId: reservation.identity.attemptId,
      attemptDigest: stripSha256Prefix(reservation.identity.slotIndependentPlanDigest.value)
    }).then(observed => {
      if (observed.status === 'ambiguous' && observed.reason === 'multiple-processes') {
        return bootstrapFailed('bootstrap-job-multiple');
      }
      if (observed.status === 'ambiguous' && observed.reason === 'policy-conflict') {
        return bootstrapFailed('bootstrap-job-policy');
      }
      if (observed.status === 'ambiguous') return retry('bootstrap-job-unavailable');
      if (observed.status !== 'ready') {
        return retry(observed.reason === 'job-name-missing'
          ? 'bootstrap-job-name-missing'
          : 'bootstrap-job-empty');
      }
      return verifyRunningProcess(reservation, observed.processId, ports).then(verification =>
        verification.status === 'verified'
          ? readSafeNow(ports.timing).then(verifiedAtMs => verifiedAtMs !== null &&
              verifiedAtMs < reservation.launch.deadlineAtMs &&
              verifiedAtMs < reservation.authority.grantExpiresAtMs
            ? persistBootstrapReadiness(
                reservation,
                observed.processId,
                verification.value,
                verifiedAtMs,
                ports.attempts
              ).then(persisted => persisted
                ? bootstrapBound()
                : bootstrapFailed('bootstrap-journal-bind'))
            : bootstrapFailed(lastDetail))
          : retry(verification.status === 'process-incarnation-unavailable'
              ? 'bootstrap-process-incarnation'
              : 'bootstrap-job-membership'));
    }, () => retry('bootstrap-job-unavailable'));
  });
};

const bindBootstrapReadiness = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<BootstrapReadinessOutcome> => {
  const plan = exactArtifactPlan(reservation, config);
  return plan === null
    ? Promise.resolve(bootstrapFailed('bootstrap-artifact-plan'))
    : waitForBootstrapReadiness(reservation, ports);
};

const VERIFIED_WINDOWS_JOB_POLICY = {
  format: 'windows-job-policy/v1',
  extendedLimit: 'kill-on-job-close-only',
  uiRestrictions: 'none',
  breakaway: 'forbidden'
} as const;

const verifiedContainmentBinding = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  started: WindowsPm2OneShotActiveStart,
  verification: RunningVerification,
  membershipVerifiedAtMs: number
): VerifiedWindowsAttemptContainmentBinding | null => {
  const jobIdentity = parseDurableWindowsNamedJobIdentity(verification.job.job.value);
  return jobIdentity.type === 'ok'
    ? {
        format: 'verified-windows-attempt-containment/v1',
        bindingGeneration: reservation.admission.bindingGeneration,
        processAttemptId: reservation.identity.attemptId,
        repository: reservation.authority.repository,
        recipeRevision: reservation.authority.recipeRevision,
        grantId: reservation.authority.grantId,
        grantGeneration: reservation.authority.grantGeneration,
        credentialSlotIds: reservation.authority.credentialSlotIds,
        grantExpiresAtMs: reservation.authority.grantExpiresAtMs,
        receiverId: reservation.receiver.receiverId,
        receiverCorrelation: reservation.receiver.receiverCorrelation,
        receiverEntryIdentity: reservation.receiver.receiverEntryIdentity,
        receiverSlotIdentity: reservation.slot.slotId.value,
        receiverProcessName: reservation.slot.processName.value,
        receiverPmId: started.handle.pmId,
        recipeLocator: reservation.admission.recipeLocator,
        slotIndependentPlanDigest: reservation.identity.slotIndependentPlanDigest,
        launchMetadataDigest: reservation.launch.metadataDigest,
        deadlineAtMs: reservation.launch.deadlineAtMs,
        rootProcessId: started.processId,
        rootProcessIncarnation: verification.processIncarnation,
        jobIdentity: jobIdentity.value,
        jobPolicy: VERIFIED_WINDOWS_JOB_POLICY,
        membershipVerifiedAtMs
      }
    : null;
};

const sameSlots = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((slot, index) => slot === right[index]);

const sameContainmentBinding = (
  left: VerifiedWindowsAttemptContainmentBinding,
  right: VerifiedWindowsAttemptContainmentBinding
): boolean => left.bindingGeneration === right.bindingGeneration &&
  left.processAttemptId === right.processAttemptId && left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision && left.grantId === right.grantId &&
  left.grantGeneration === right.grantGeneration &&
  sameSlots(left.credentialSlotIds.map(String), right.credentialSlotIds.map(String)) &&
  left.grantExpiresAtMs === right.grantExpiresAtMs && left.receiverId === right.receiverId &&
  left.receiverCorrelation.value === right.receiverCorrelation.value &&
  left.receiverEntryIdentity.value === right.receiverEntryIdentity.value &&
  left.receiverSlotIdentity === right.receiverSlotIdentity &&
  left.receiverProcessName === right.receiverProcessName && left.receiverPmId === right.receiverPmId &&
  left.recipeLocator.value === right.recipeLocator.value &&
  left.slotIndependentPlanDigest.value === right.slotIndependentPlanDigest.value &&
  left.launchMetadataDigest === right.launchMetadataDigest && left.deadlineAtMs === right.deadlineAtMs &&
  left.rootProcessId === right.rootProcessId &&
  left.rootProcessIncarnation.value === right.rootProcessIncarnation.value &&
  left.jobIdentity.value === right.jobIdentity.value &&
  left.membershipVerifiedAtMs === right.membershipVerifiedAtMs;

const exactContainedRecord = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  binding: VerifiedWindowsAttemptContainmentBinding,
  expectedStateVersion: number,
  record: GrantQualifiedContainedAttemptRecord
): boolean => {
  const attempt = record.attempt;
  const bootstrap = attempt.bootstrapBinding;
  return attempt.id === reservation.identity.attemptId && attempt.state === 'running' &&
    attempt.stateVersion === expectedStateVersion + 1 &&
    attempt.repository === reservation.authority.repository &&
    attempt.recipeRevision === reservation.authority.recipeRevision &&
    attempt.planDigest.value === reservation.launch.metadataDigest &&
    attempt.receiverCorrelation?.value === reservation.receiver.receiverCorrelation.value &&
    bootstrap !== null && bootstrap.bindingGeneration === binding.bindingGeneration &&
    bootstrap.grantId === binding.grantId && bootstrap.grantGeneration === binding.grantGeneration &&
    bootstrap.receiverId === binding.receiverId &&
    bootstrap.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
    bootstrap.helperParentProcessId === binding.rootProcessId &&
    bootstrap.helperParentProcessIncarnation.value === binding.rootProcessIncarnation.value &&
    bootstrap.recipeLocator.value === binding.recipeLocator.value &&
    record.authority.grantId === reservation.authority.grantId &&
    record.authority.grantGeneration === reservation.authority.grantGeneration &&
    record.admission.launchMetadataDigest === reservation.admission.launchMetadataDigest &&
    record.admission.slotIndependentPlanDigest.value === reservation.admission.slotIndependentPlanDigest.value &&
    validateVerifiedWindowsAttemptContainmentBinding(record.containmentBinding).type === 'ok' &&
    sameContainmentBinding(record.containmentBinding, binding);
};

const expectedContainmentBindVersion = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  binding: VerifiedWindowsAttemptContainmentBinding,
  current: GrantQualifiedMaterializingAttemptRecord
): number | null => {
  if (current.attempt.id !== reservation.identity.attemptId || current.attempt.state !== 'materializing' ||
      current.attempt.repository !== reservation.authority.repository ||
      current.attempt.recipeRevision !== reservation.authority.recipeRevision ||
      current.attempt.planDigest.value !== reservation.launch.metadataDigest ||
      current.attempt.receiverCorrelation?.value !== reservation.receiver.receiverCorrelation.value) return null;
  const bootstrap = current.attempt.bootstrapBinding;
  if (bootstrap === null) return current.attempt.stateVersion === reservation.attempt.stateVersion
    ? current.attempt.stateVersion
    : null;
  return current.attempt.stateVersion === reservation.attempt.stateVersion + 1 &&
    bootstrap.bindingGeneration === binding.bindingGeneration && bootstrap.grantId === binding.grantId &&
    bootstrap.grantGeneration === binding.grantGeneration && bootstrap.receiverId === binding.receiverId &&
    bootstrap.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
    bootstrap.helperParentProcessId === binding.rootProcessId &&
    bootstrap.helperParentProcessIncarnation.value === binding.rootProcessIncarnation.value &&
    bootstrap.recipeLocator.value === binding.recipeLocator.value
    ? current.attempt.stateVersion
    : null;
};

const bindVerifiedContainmentAndStart = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  started: WindowsPm2OneShotActiveStart,
  verification: RunningVerification,
  membershipVerifiedAtMs: number,
  attempts: WindowsPm2OneShotLaunchPorts['attempts']
): Promise<GrantQualifiedContainedAttemptRecord | null> => {
  const binding = verifiedContainmentBinding(
    reservation,
    started,
    verification,
    membershipVerifiedAtMs
  );
  if (binding === null) return Promise.resolve(null);
  const id = operationId(WINDOWS_PM2_ONE_SHOT_BIND_OPERATION_DOMAIN, [
    reservation.identity.attemptId,
    reservation.exactReservationDigest.value,
    binding.receiverPmId,
    binding.rootProcessId,
    binding.rootProcessIncarnation.value,
    binding.jobIdentity.value,
    membershipVerifiedAtMs
  ]);
  if (id === null) return Promise.resolve(null);
  return Promise.resolve().then(() => attempts.readGrantQualifiedMaterializing(
    reservation.identity.attemptId
  )).then(current => {
    if (current.type === 'err' || current.value === null) return null;
    const expectedStateVersion = expectedContainmentBindVersion(reservation, binding, current.value);
    if (expectedStateVersion === null) return null;
    return Promise.resolve().then(() => attempts.bindVerifiedWindowsContainmentAndStart({
      operationId: id,
      expectedState: 'materializing',
      expectedStateVersion,
      binding
    })).then(
      result => result.type === 'ok' && exactContainedRecord(
        reservation,
        binding,
        expectedStateVersion,
        result.value.record
      )
        ? result.value.record
        : null,
      () => null
    );
  }, () => null);
};

/*
 * This operation deliberately stops at the atomic running bind. Terminal
 * observation, tree-empty proof, PM2 deletion, exposure closure, and artifact
 * release are owned by the separate terminal-cleanup composition.
 */

const readSafeNow = (timing: GrantQualifiedOneShotStartTiming): Promise<number | null> => Promise.resolve()
  .then(() => timing.now())
  .then(
    value => Number.isSafeInteger(value) && value >= 0 ? value : null,
    () => null
  );

const finalizeRunning = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  started: WindowsPm2OneShotActiveStart,
  verification: RunningVerification,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => {
  const runningOutcome = (
    running: GrantQualifiedContainedAttemptRecord
  ): WindowsPm2OneShotRunningLaunch => ({
    state: started.disposition === 'started' ? 'launched' : 'replayed',
    attemptId: reservation.identity.attemptId,
    handle: started.handle,
    processId: started.processId,
    processIncarnation: verification.processIncarnation,
    job: verification.job.job,
    receiverStatus: started.receiverStatus,
    journalState: 'running',
    bindingGeneration: running.containmentBinding.bindingGeneration,
    receipt: {
      ...activeReceipt(reservation, started, running),
      containedAttempt: running
    }
  });
  const unboundReceipt = activeReceipt(reservation, started, null);
  return readSafeNow(ports.timing).then(membershipVerifiedAtMs => {
    if (membershipVerifiedAtMs === null || membershipVerifiedAtMs >= reservation.launch.deadlineAtMs ||
        membershipVerifiedAtMs >= reservation.authority.grantExpiresAtMs) {
      return recovery('bootstrap-binding', reservation.identity.attemptId, unboundReceipt);
    }
    return bindVerifiedContainmentAndStart(
      reservation,
      started,
      verification,
      membershipVerifiedAtMs,
      ports.attempts
    ).then(running => running === null
      ? recovery('bootstrap-binding', reservation.identity.attemptId, unboundReceipt)
      : runningOutcome(running));
  });
};

const projectStarted = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  started: Awaited<ReturnType<typeof startGrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>>>,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => {
  if (started.outcome === 'failure') {
    return Promise.resolve(recovery(
      exactStartRecoveryStage(started.issue),
      reservation.identity.attemptId,
      reservedReceipt(reservation)
    ));
  }
  if (started.value.state === 'exact-terminal-confirmed') {
    const receipt = terminalReceipt(reservation, started.value);
    return Promise.resolve(recovery(
      'terminal-before-containment',
      reservation.identity.attemptId,
      receipt
    ));
  }
  const active = started.value;
  return verifyRunningProcess(reservation, active.processId, ports).then(verification => {
    switch (verification.status) {
      case 'verified':
        return finalizeRunning(reservation, active, verification.value, ports);
      case 'process-incarnation-unavailable':
        return recovery(
          'process-incarnation',
          reservation.identity.attemptId,
          activeReceipt(reservation, active, null)
        );
      case 'job-containment-unverified':
        return recovery(
          'job-containment',
          reservation.identity.attemptId,
          activeReceipt(reservation, active, null)
        );
    }
  });
};

const exactStartRecoveryReasonStage = (
  reason: Extract<GrantQualifiedOneShotStartIssue, {
    code: 'grant-qualified-one-shot-start-recovery-required';
  }>['reason']
): WindowsPm2OneShotLaunchRecoveryStage => {
  switch (reason) {
    case 'durable-admission-missing':
    case 'durable-admission-drift': return 'exact-start-admission';
    case 'slot-inventory-drift':
    case 'slot-foreign':
    case 'slot-ownership-drift':
    case 'terminal-retired': return 'exact-start-ownership';
    case 'confirmation-exhausted': return 'exact-start-confirmation';
  }
};

const bootstrapReadinessRecoveryStage = (
  detail: BootstrapReadinessDetail
): WindowsPm2OneShotLaunchRecoveryStage => {
  switch (detail) {
    case 'bootstrap-artifact-plan': return 'exact-start-bootstrap-artifact';
    case 'bootstrap-job-pending': return 'exact-start-bootstrap-job-pending';
    case 'bootstrap-job-name-missing': return 'exact-start-bootstrap-job-name-missing';
    case 'bootstrap-job-empty': return 'exact-start-bootstrap-job-empty';
    case 'bootstrap-job-unavailable': return 'exact-start-bootstrap-job-unavailable';
    case 'bootstrap-job-multiple': return 'exact-start-bootstrap-job-multiple';
    case 'bootstrap-job-policy': return 'exact-start-bootstrap-job-policy';
    case 'bootstrap-process-incarnation': return 'exact-start-bootstrap-process-incarnation';
    case 'bootstrap-job-membership': return 'exact-start-bootstrap-job-membership';
    case 'bootstrap-journal-bind': return 'exact-start-bootstrap-journal-bind';
  }
};

const exactStartPortFailureStage = (
  issue: Extract<GrantQualifiedOneShotStartIssue, {
    code: 'grant-qualified-one-shot-start-port-failed';
  }>
): WindowsPm2OneShotLaunchRecoveryStage => {
  if (issue.operation === 'start-exact' && issue.receiverDetail !== undefined) {
    return bootstrapReadinessRecoveryStage(issue.receiverDetail);
  }
  switch (issue.operation) {
    case 'lock': return 'exact-start-lock';
    case 'observe': return 'exact-start-observation';
    case 'prepare-exact-start': return 'exact-start-artifact-preparation';
    case 'start-exact': return 'exact-start-receiver-start';
    case 'wait':
    case 'clock': return 'exact-start-timing';
  }
};

const exactStartRecoveryStage = (
  issue: GrantQualifiedOneShotStartIssue
): WindowsPm2OneShotLaunchRecoveryStage => {
  switch (issue.code) {
    case 'grant-qualified-one-shot-start-invalid': return 'exact-start-invalid';
    case 'grant-qualified-one-shot-start-authority-stale':
    case 'grant-qualified-one-shot-start-journal-failed': return 'exact-start-admission';
    case 'grant-qualified-one-shot-start-recovery-required': return exactStartRecoveryReasonStage(issue.reason);
    case 'grant-qualified-one-shot-start-port-failed': return exactStartPortFailureStage(issue);
  }
};

const startReservation = (
  reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => startGrantQualifiedOneShotReservation(
  reservation,
  config.pool,
  starterPorts(reservation, config, ports),
  ports.timing
).then(
  started => projectStarted(reservation, started, ports),
  () => recovery('exact-start', reservation.identity.attemptId)
);

const reserveAndStart = (
  plan: RecipeMaterializationPlan,
  observedAtMs: number,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => reserveGrantQualifiedOneShotMaterialization(
  plan,
  observedAtMs,
  config.pool,
  createWindowsPm2OneShotLaunchFactory(config),
  reservationPorts(ports)
).then(
  reserved => reserved.outcome === 'success'
    ? startReservation(reserved.value, config, ports)
    : recovery('durable-reservation', null),
  () => recovery('durable-reservation', null)
);

const probeAndReserve = (
  plan: RecipeMaterializationPlan,
  observedAtMs: number,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => Promise.resolve()
  .then(() => ports.receiver.probe())
  .then(
    probed => probed.outcome === 'success'
      ? reserveAndStart(plan, observedAtMs, config, ports)
      : recovery('receiver-probe', null),
    () => recovery('receiver-probe', null)
  );

const launch = (
  execution: AuthorizedExecution,
  observedAtMs: number,
  config: WindowsPm2OneShotLaunchConfig,
  ports: WindowsPm2OneShotLaunchPorts
): Promise<WindowsPm2OneShotLaunchOutcome> => {
  if (!validConfig(config) || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    return Promise.resolve(recovery('configuration', null));
  }
  return planAuthorizedRecipeMaterialization(execution, {
    paths: createWindowsExecutionPathResolver(ports.filesystem),
    tools: createWindowsExecutionToolRegistry({
      brokerEntrypointPath: config.brokerEntrypointPath
    }, ports.filesystem),
    targetEntrypoints: createWindowsExecutionTargetEntrypointResolver(ports.filesystem)
  }).then(
    planned => planned.isOk()
      ? probeAndReserve(planned.value, observedAtMs, config, ports)
      : recovery('canonical-plan', null),
    () => recovery('canonical-plan', null)
  );
};

export const createWindowsPm2OneShotLaunchPort = (
  config: WindowsPm2OneShotLaunchConfig,
  ports: Omit<WindowsPm2OneShotLaunchPorts, 'timing'> &
    Readonly<{ timing?: GrantQualifiedOneShotStartTiming }>
): WindowsPm2OneShotLaunchPort => {
  const completePorts: WindowsPm2OneShotLaunchPorts = {
    ...ports,
    timing: ports.timing ?? createSystemGrantQualifiedOneShotStartTiming()
  };
  return {
    launch: (execution, observedAtMs) => launch(execution, observedAtMs, config, completePorts)
  };
};
