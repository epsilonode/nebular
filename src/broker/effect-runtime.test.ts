import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  brokerResultToEffect,
  projectBrokerEffectExit,
  withBrokerResource,
  type BrokerEffectBoundaryContext,
  type BrokerFinalizerOutcome
} from './effect-runtime.ts';
import {
  parseJournalOperationId,
  type JournalResult
} from './journal.ts';
import {
  brokerErr,
  brokerOk,
  type BrokerIssues
} from './result.ts';

const unwrapJournal = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const boundaryContext = (
  phase: BrokerEffectBoundaryContext['phase'] = 'execute'
): BrokerEffectBoundaryContext => ({
  phase,
  interruptionReason: 'timeout',
  recoveryOperationId: unwrapJournal(parseJournalOperationId('broker-effect-recovery-1'))
});

const typedIssues = (message: string = 'The request was invalid.'): BrokerIssues => [{
  code: 'request-invalid',
  message
}];

describe('privileged Result and Effect interoperation', () => {
  it('lifts BrokerResult success and preserves the exact typed failure value', async () => {
    const success = await Effect.runPromiseExit(brokerResultToEffect(brokerOk({ receipt: 'ready' })));
    expect(Exit.isSuccess(success)).toBe(true);
    if (Exit.isSuccess(success)) expect(success.value).toEqual({ receipt: 'ready' });

    const failedResult = brokerErr({ code: 'request-invalid', message: 'The request was invalid.' });
    if (failedResult.isOk()) throw new Error('expected failed broker fixture');
    const expectedIssues = failedResult.error;
    const failure = await Effect.runPromiseExit(brokerResultToEffect(failedResult));
    expect(Exit.isFailure(failure)).toBe(true);
    if (Exit.isFailure(failure)) {
      const causeFailure = Cause.failureOption(failure.cause);
      expect(Option.isSome(causeFailure)).toBe(true);
      if (Option.isSome(causeFailure)) expect(causeFailure.value).toBe(expectedIssues);
    }
  });

  it('runs the finalizer exactly once after success', async () => {
    const outcomes: BrokerFinalizerOutcome<never>[] = [];
    const program = withBrokerResource(
      Effect.succeed({ resourceId: 'resource-1' }),
      resource => Effect.succeed({ used: resource.resourceId }),
      (_resource, outcome) => Effect.sync(() => {
        outcomes.push(outcome);
      })
    );

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(outcomes).toEqual([{ type: 'succeeded' }]);
  });

  it('runs the finalizer exactly once after a typed failure', async () => {
    const issues = typedIssues();
    const outcomes: BrokerFinalizerOutcome<BrokerIssues>[] = [];
    const program = withBrokerResource(
      Effect.succeed({ resourceId: 'resource-1' }),
      () => Effect.fail(issues),
      (_resource, outcome) => Effect.sync(() => {
        outcomes.push(outcome);
      })
    );

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(outcomes).toEqual([{
      type: 'typed-failure',
      error: issues,
      interrupted: false
    }]);
  });

  it('runs the finalizer exactly once after interruption and projects typed cancellation', async () => {
    const outcomes: BrokerFinalizerOutcome<never>[] = [];
    const program = withBrokerResource(
      Effect.succeed({ resourceId: 'resource-1' }),
      () => Effect.interrupt,
      (_resource, outcome) => Effect.sync(() => {
        outcomes.push(outcome);
      })
    );

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(outcomes).toEqual([{ type: 'interrupted' }]);
    expect(projectBrokerEffectExit(exit, boundaryContext('finalize'))).toEqual({
      type: 'cancelled',
      code: 'broker-operation-cancelled',
      phase: 'finalize',
      reason: 'timeout',
      recoveryOperationId: boundaryContext().recoveryOperationId
    });
  });

  it('keeps defects distinct from typed failures and cancellation', async () => {
    const secretCanary = 'defect-secret-canary';
    const exit = await Effect.runPromiseExit(Effect.die(new Error(secretCanary)));
    const outcome = projectBrokerEffectExit(exit, boundaryContext('execute'));

    expect(outcome).toEqual({
      type: 'defect',
      code: 'broker-runtime-defect',
      phase: 'execute',
      message: 'The privileged broker operation failed unexpectedly.',
      recoveryOperationId: boundaryContext().recoveryOperationId
    });
    expect(JSON.stringify(outcome)).not.toContain(secretCanary);
  });

  it('redacts issue messages and successful secret-bearing values at the outer boundary', async () => {
    const secretCanary = 'token-secret-canary';
    const failure = await Effect.runPromiseExit(brokerResultToEffect(brokerErr({
      code: 'request-invalid',
      message: `Invalid request exposed ${secretCanary}`
    })));
    const redactedFailure = projectBrokerEffectExit(failure, boundaryContext());
    expect(redactedFailure).toEqual(expect.objectContaining({
      type: 'failure',
      issues: [{ code: 'request-invalid' }]
    }));
    expect(JSON.stringify(redactedFailure)).not.toContain(secretCanary);

    const success = await Effect.runPromiseExit(brokerResultToEffect(brokerOk({
      secret: secretCanary,
      receipt: 'complete'
    })));
    const redactedSuccess = projectBrokerEffectExit(success, boundaryContext('reply'));
    expect(redactedSuccess).toEqual({
      type: 'success',
      code: 'broker-operation-succeeded',
      phase: 'reply'
    });
    expect(JSON.stringify(redactedSuccess)).not.toContain(secretCanary);
  });
});
