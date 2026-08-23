import { Cause, Chunk, Effect, Exit, Option } from 'effect';

import type { JournalOperationId } from './journal.ts';
import type {
  BrokerIssueCode,
  BrokerIssues,
  BrokerResult
} from './result.ts';

/**
 * The single one-way boundary from pure broker policy into privileged Effect
 * orchestration. The exact nonempty issue value is retained as the Effect error.
 */
export const brokerResultToEffect = <Value>(
  result: BrokerResult<Value>
): Effect.Effect<Value, BrokerIssues> => result.isOk()
  ? Effect.succeed(result.value)
  : Effect.fail(result.error);

export type BrokerFinalizerOutcome<Error> =
  | Readonly<{ type: 'succeeded' }>
  | Readonly<{ type: 'typed-failure'; error: Error; interrupted: boolean }>
  | Readonly<{ type: 'interrupted' }>
  | Readonly<{ type: 'defect' }>;

const finalizerOutcome = <Value, Error>(
  exit: Exit.Exit<Value, Error>
): BrokerFinalizerOutcome<Error> => {
  if (Exit.isSuccess(exit)) return { type: 'succeeded' };
  if (Chunk.isNonEmpty(Cause.defects(exit.cause))) return { type: 'defect' };
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    return {
      type: 'typed-failure',
      error: failure.value,
      interrupted: Cause.isInterrupted(exit.cause)
    };
  }
  return Cause.isInterrupted(exit.cause) ? { type: 'interrupted' } : { type: 'defect' };
};

/**
 * Brackets one privileged resource. Acquisition and use retain their typed
 * error channels; release is guaranteed after successful acquisition and sees
 * a closed finalization reason without raw defect or interruption details.
 */
export const withBrokerResource = <
  Resource,
  AcquireError,
  AcquireRequirements,
  Value,
  UseError,
  UseRequirements,
  FinalizerValue,
  FinalizerRequirements
>(
  acquire: Effect.Effect<Resource, AcquireError, AcquireRequirements>,
  use: (resource: Resource) => Effect.Effect<Value, UseError, UseRequirements>,
  release: (
    resource: Resource,
    outcome: BrokerFinalizerOutcome<UseError>
  ) => Effect.Effect<FinalizerValue, never, FinalizerRequirements>
): Effect.Effect<
  Value,
  AcquireError | UseError,
  AcquireRequirements | UseRequirements | FinalizerRequirements
> => Effect.acquireUseRelease(
  acquire,
  use,
  (resource, exit) => release(resource, finalizerOutcome(exit))
);

export type BrokerRuntimePhase =
  | 'acquire'
  | 'authorize'
  | 'execute'
  | 'finalize'
  | 'reply';

export type BrokerCancellationReason =
  | 'caller-cancelled'
  | 'lease-expired'
  | 'shutdown'
  | 'timeout'
  | 'user-cancelled';

export type BrokerEffectBoundaryContext = Readonly<{
  phase: BrokerRuntimePhase;
  interruptionReason: BrokerCancellationReason;
  recoveryOperationId: JournalOperationId | null;
}>;

export type RedactedBrokerIssue = Readonly<{
  code: BrokerIssueCode;
}>;

export type RedactedBrokerIssues = readonly [RedactedBrokerIssue, ...RedactedBrokerIssue[]];

export type BrokerRedactedOutcome =
  | Readonly<{
      type: 'success';
      code: 'broker-operation-succeeded';
      phase: BrokerRuntimePhase;
    }>
  | Readonly<{
      type: 'failure';
      code: 'broker-operation-failed';
      phase: BrokerRuntimePhase;
      issues: RedactedBrokerIssues;
      recoveryOperationId: JournalOperationId | null;
      interrupted: boolean;
    }>
  | Readonly<{
      type: 'cancelled';
      code: 'broker-operation-cancelled';
      phase: BrokerRuntimePhase;
      reason: BrokerCancellationReason;
      recoveryOperationId: JournalOperationId | null;
    }>
  | Readonly<{
      type: 'defect';
      code: 'broker-runtime-defect';
      phase: BrokerRuntimePhase;
      message: 'The privileged broker operation failed unexpectedly.';
      recoveryOperationId: JournalOperationId | null;
    }>;

const redactBrokerIssues = (issues: BrokerIssues): RedactedBrokerIssues => {
  const first: RedactedBrokerIssue = { code: issues[0].code };
  const rest: readonly RedactedBrokerIssue[] = issues.slice(1).map(issue => ({ code: issue.code }));
  return [first, ...rest];
};

const projectFailureCause = (
  cause: Cause.Cause<BrokerIssues>,
  context: BrokerEffectBoundaryContext
): BrokerRedactedOutcome => {
  if (Chunk.isNonEmpty(Cause.defects(cause))) {
    return {
      type: 'defect',
      code: 'broker-runtime-defect',
      phase: context.phase,
      message: 'The privileged broker operation failed unexpectedly.',
      recoveryOperationId: context.recoveryOperationId
    };
  }
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) {
    return {
      type: 'failure',
      code: 'broker-operation-failed',
      phase: context.phase,
      issues: redactBrokerIssues(failure.value),
      recoveryOperationId: context.recoveryOperationId,
      interrupted: Cause.isInterrupted(cause)
    };
  }
  if (Cause.isInterrupted(cause)) {
    return {
      type: 'cancelled',
      code: 'broker-operation-cancelled',
      phase: context.phase,
      reason: context.interruptionReason,
      recoveryOperationId: context.recoveryOperationId
    };
  }
  return {
    type: 'defect',
    code: 'broker-runtime-defect',
    phase: context.phase,
    message: 'The privileged broker operation failed unexpectedly.',
    recoveryOperationId: context.recoveryOperationId
  };
};

/**
 * Converts Effect Exit exactly once at an IPC, CLI, or test boundary. Success
 * values, raw issue messages, causes, defects, fiber ids, and resource values
 * are deliberately absent from this closed projection.
 */
export const projectBrokerEffectExit = <Value>(
  exit: Exit.Exit<Value, BrokerIssues>,
  context: BrokerEffectBoundaryContext
): BrokerRedactedOutcome => Exit.isSuccess(exit)
  ? {
      type: 'success',
      code: 'broker-operation-succeeded',
      phase: context.phase
    }
  : projectFailureCause(exit.cause, context);
