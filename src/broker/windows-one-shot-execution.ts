import type { AuthorizedExecution } from './authority.ts';
import {
  waitForGrantQualifiedOneShotTerminal,
  type GrantQualifiedOneShotTerminalWaitOutcome,
  type GrantQualifiedOneShotTerminalWaitPolicy,
  type GrantQualifiedOneShotTerminalWaitPorts
} from './grant-qualified-one-shot-terminal-observer.ts';
import type { OneShotSlotPool } from './one-shot-slots.ts';
import type { BrokerOperationContext } from './operation.ts';
import {
  type AuthorizedRecipeExecutionCompletion,
  type AuthorizedRecipeExecutorPort
} from './recipe-execution-operation.ts';
import { brokerErr, brokerOk, type BrokerIssueCode, type BrokerResult } from './result.ts';
import type { TrustedProfileRoot } from './journal.ts';
import {
  cleanupVerifiedWindowsOneShotAttempt,
  type WindowsOneShotTerminalSignal,
  type WindowsTerminalCleanupRecoveryStage,
  type WindowsTerminalCleanupPorts
} from './windows-terminal-cleanup.ts';
import {
  planWindowsOneShotArtifacts,
  releaseWindowsOneShotArtifacts,
  type WindowsOneShotArtifactRuntimePort
} from './windows-one-shot-artifacts.ts';
import type {
  WindowsPm2OneShotLaunchPort,
  WindowsPm2OneShotLaunchOutcome,
  WindowsPm2OneShotLaunchRecoveryStage
} from './windows-pm2-one-shot-launch.ts';

export type WindowsOneShotExecutionConfig = Readonly<{
  pool: OneShotSlotPool;
  trustedProfileRoot: TrustedProfileRoot;
  terminalWaitPolicy?: GrantQualifiedOneShotTerminalWaitPolicy;
}>;

export type WindowsOneShotExecutionPorts = Readonly<{
  launch: WindowsPm2OneShotLaunchPort;
  terminalWait: GrantQualifiedOneShotTerminalWaitPorts;
  cleanup: WindowsTerminalCleanupPorts;
  artifacts: WindowsOneShotArtifactRuntimePort;
}>;

const executionFailure = <Value>(code: BrokerIssueCode = 'receiver-failed'): BrokerResult<Value> => brokerErr({
  code,
  message: 'The exact Windows one-shot execution could not be completed safely.'
});

const cleanupFailureCodes: Readonly<Record<WindowsTerminalCleanupRecoveryStage, BrokerIssueCode>> = {
  request: 'cleanup-request-failed',
  'durable-binding': 'cleanup-durable-binding-failed',
  'job-tree': 'cleanup-job-tree-failed',
  'root-exit': 'cleanup-root-exit-failed',
  'exposure-closure': 'cleanup-exposure-closure-failed',
  'pm2-deletion': 'cleanup-pm2-deletion-failed',
  'journal-finalization': 'cleanup-journal-finalization-failed'
};

const launchFailureCodes: Readonly<Record<WindowsPm2OneShotLaunchRecoveryStage, BrokerIssueCode>> = {
  configuration: 'receiver-launch-configuration-failed',
  'canonical-plan': 'receiver-launch-canonical-plan-failed',
  'receiver-probe': 'receiver-launch-receiver-probe-failed',
  'durable-reservation': 'receiver-launch-durable-reservation-failed',
  'exact-start': 'receiver-launch-exact-start-failed',
  'exact-start-invalid': 'receiver-launch-exact-start-invalid',
  'exact-start-admission': 'receiver-launch-exact-start-admission-failed',
  'exact-start-lock': 'receiver-launch-exact-start-lock-failed',
  'exact-start-observation': 'receiver-launch-exact-start-observation-failed',
  'exact-start-artifact-preparation': 'receiver-launch-exact-start-artifact-preparation-failed',
  'exact-start-receiver-start': 'receiver-launch-exact-start-receiver-start-failed',
  'exact-start-bootstrap-artifact': 'receiver-launch-bootstrap-artifact-failed',
  'exact-start-bootstrap-job-pending': 'receiver-launch-bootstrap-job-pending',
  'exact-start-bootstrap-job-name-missing': 'receiver-launch-bootstrap-job-name-missing',
  'exact-start-bootstrap-job-empty': 'receiver-launch-bootstrap-job-empty',
  'exact-start-bootstrap-job-unavailable': 'receiver-launch-bootstrap-job-unavailable',
  'exact-start-bootstrap-job-multiple': 'receiver-launch-bootstrap-job-multiple',
  'exact-start-bootstrap-job-policy': 'receiver-launch-bootstrap-job-policy-failed',
  'exact-start-bootstrap-process-incarnation': 'receiver-launch-bootstrap-process-incarnation-failed',
  'exact-start-bootstrap-job-membership': 'receiver-launch-bootstrap-job-membership-failed',
  'exact-start-bootstrap-journal-bind': 'receiver-launch-bootstrap-journal-bind-failed',
  'exact-start-ownership': 'receiver-launch-exact-start-ownership-failed',
  'exact-start-confirmation': 'receiver-launch-exact-start-confirmation-failed',
  'exact-start-timing': 'receiver-launch-exact-start-timing-failed',
  'terminal-before-containment': 'receiver-launch-terminal-before-containment',
  'process-incarnation': 'receiver-launch-process-incarnation-failed',
  'job-containment': 'receiver-launch-job-containment-failed',
  'bootstrap-binding': 'receiver-launch-bootstrap-binding-failed'
};

const launchFailureCode = (launch: WindowsPm2OneShotLaunchOutcome): BrokerIssueCode =>
  launch.state === 'recovery-required' ? launchFailureCodes[launch.stage] : 'receiver-launch-failed';

const unsupportedLifecycle = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'receiver-unavailable',
  message: 'This broker runtime currently admits exact Windows one-shot recipes only.'
});

const neverAbortSignal = (): Readonly<AbortSignal> => new AbortController().signal;

const terminalSignal = (
  attemptId: WindowsOneShotTerminalSignal['processAttemptId'],
  terminal: GrantQualifiedOneShotTerminalWaitOutcome,
  observedAtMs: number
): WindowsOneShotTerminalSignal => terminal.state === 'exact-terminal-observed'
  ? {
      format: 'windows-pm2-one-shot-terminal-signal/v1',
      processAttemptId: attemptId,
      terminalDisposition: terminal.exitCode === 0 ? 'succeeded' : 'failed',
      observedAtMs
    }
  : {
      format: 'windows-pm2-one-shot-terminal-signal/v1',
      processAttemptId: attemptId,
      terminalDisposition: 'cancelled',
      observedAtMs
    };

const completion = (
  signal: WindowsOneShotTerminalSignal,
  exitCode: number | null
): AuthorizedRecipeExecutionCompletion => ({
  attemptId: signal.processAttemptId,
  lifecycle: 'one-shot',
  state: signal.terminalDisposition,
  exitCode,
  cleanup: 'complete'
});

const releaseArtifacts = (
  signal: WindowsOneShotTerminalSignal,
  launch: Extract<Awaited<ReturnType<WindowsPm2OneShotLaunchPort['launch']>>, {
    state: 'launched' | 'replayed';
  }>,
  config: WindowsOneShotExecutionConfig,
  ports: WindowsOneShotExecutionPorts
): Promise<BrokerResult<void>> => {
  const plan = planWindowsOneShotArtifacts(
    config.trustedProfileRoot,
    signal.processAttemptId,
    launch.receipt.reservation.identity.slotIndependentPlanDigest.value
  );
  return plan.isErr()
    ? Promise.resolve(executionFailure<void>())
    : releaseWindowsOneShotArtifacts(plan.value, ports.artifacts).then(released => released.isOk()
      ? brokerOk(undefined)
      : executionFailure<void>());
};

const cleanupAndComplete = (
  signal: WindowsOneShotTerminalSignal,
  exitCode: number | null,
  launch: Extract<Awaited<ReturnType<WindowsPm2OneShotLaunchPort['launch']>>, {
    state: 'launched' | 'replayed';
  }>,
  config: WindowsOneShotExecutionConfig,
  ports: WindowsOneShotExecutionPorts
): Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>> => cleanupVerifiedWindowsOneShotAttempt(
  signal,
  ports.cleanup
).then(cleaned => cleaned.state === 'recovery-required'
  ? executionFailure<AuthorizedRecipeExecutionCompletion>(cleanupFailureCodes[cleaned.stage])
  : releaseArtifacts(signal, launch, config, ports).then(released => released.isErr()
    ? executionFailure<AuthorizedRecipeExecutionCompletion>('cleanup-artifact-release-failed')
    : brokerOk(completion(signal, exitCode))));

const observeTerminalThenCleanup = (
  launch: Extract<Awaited<ReturnType<WindowsPm2OneShotLaunchPort['launch']>>, {
    state: 'launched' | 'replayed';
  }>,
  signal: Readonly<AbortSignal>,
  config: WindowsOneShotExecutionConfig,
  ports: WindowsOneShotExecutionPorts
): Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>> => waitForGrantQualifiedOneShotTerminal(
  launch.receipt.reservation,
  config.pool,
  launch.receipt.start,
  signal,
  ports.terminalWait,
  config.terminalWaitPolicy
).then(waited => {
  if (waited.outcome === 'failure') {
    return executionFailure<AuthorizedRecipeExecutionCompletion>('receiver-terminal-observation-failed');
  }
  return Promise.resolve().then(() => ports.cleanup.clock.nowMs()).then(
    observedAtMs => Number.isSafeInteger(observedAtMs) && observedAtMs >= 0
      ? cleanupAndComplete(
          terminalSignal(launch.attemptId, waited.value, observedAtMs),
          waited.value.state === 'exact-terminal-observed' ? waited.value.exitCode : null,
          launch,
          config,
          ports
        )
      : executionFailure<AuthorizedRecipeExecutionCompletion>('receiver-clock-failed'),
    () => executionFailure<AuthorizedRecipeExecutionCompletion>('receiver-clock-failed')
  );
});

const executeToTerminal = (
  execution: AuthorizedExecution,
  nowMs: number,
  context: BrokerOperationContext | undefined,
  config: WindowsOneShotExecutionConfig,
  ports: WindowsOneShotExecutionPorts
): Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>> =>
  execution.recipe.admittedRecipe.semantic.lifecycle !== 'one-shot'
    ? Promise.resolve(unsupportedLifecycle<AuthorizedRecipeExecutionCompletion>())
    : Promise.resolve().then(() => ports.launch.launch(execution, nowMs)).then(
      launch => launch.state === 'launched' || launch.state === 'replayed'
        ? observeTerminalThenCleanup(launch, context?.signal ?? neverAbortSignal(), config, ports)
        : executionFailure<AuthorizedRecipeExecutionCompletion>(launchFailureCode(launch)),
      () => executionFailure<AuthorizedRecipeExecutionCompletion>('receiver-launch-failed')
    );

/**
 * This composition owns the exact one-shot lifetime. It cannot return a
 * successful execution receipt until terminal observation, Job-tree proof,
 * exposure closure, exact PM2 deletion, durable finalization, and trusted
 * artifact release have all succeeded.
 */
export const createWindowsOneShotExecutionPort = (
  config: WindowsOneShotExecutionConfig,
  ports: WindowsOneShotExecutionPorts
): AuthorizedRecipeExecutorPort => ({
  executeToTerminal: (execution, nowMs, context) => executeToTerminal(
    execution,
    nowMs,
    context,
    config,
    ports
  )
});
