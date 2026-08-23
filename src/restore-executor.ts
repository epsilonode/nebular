import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import type { TeleportRestorePlan, TeleportRestoreStep } from './types';

export interface TeleportRestoreAuthorization {
  readonly allowEffects: readonly TeleportRestoreStep['effect'][];
  readonly confirmedStepIds?: readonly string[];
}

export interface TeleportRestoreReceipt {
  readonly stepId: string;
  readonly capabilityInstanceId: string;
  readonly token: unknown;
}

export interface TeleportRestoreExecutionReport {
  readonly status: 'committed' | 'rolled-back';
  readonly receipts: readonly TeleportRestoreReceipt[];
  readonly rolledBackStepIds: readonly string[];
}

export interface TeleportRestoreExecutorPort {
  stage(step: TeleportRestoreStep): Promise<TeleportResult<unknown>>;
  commit(step: TeleportRestoreStep, staged: unknown): Promise<TeleportResult<unknown>>;
  verify(step: TeleportRestoreStep, receipt: unknown): Promise<TeleportResult<void>>;
  rollback(step: TeleportRestoreStep, receipt: unknown): Promise<TeleportResult<void>>;
  cleanup(step: TeleportRestoreStep, staged: unknown): Promise<void>;
}

const issue = (code: TeleportIssue['code'], message: string, step: TeleportRestoreStep): TeleportIssue => ({
  code,
  message,
  instanceId: step.capabilityInstanceId
});

export const executeTeleportRestorePlan = async (
  plan: TeleportRestorePlan,
  authorization: TeleportRestoreAuthorization,
  port: TeleportRestoreExecutorPort
): Promise<TeleportResult<TeleportRestoreExecutionReport>> => {
  const allowed = new Set(authorization.allowEffects);
  const confirmed = new Set(authorization.confirmedStepIds ?? []);
  for (const step of plan.steps) {
    if (!allowed.has(step.effect)) {
      return err(issue('policy-rejected', `Restore effect ${step.effect} is not authorized.`, step));
    }
    if (step.requiresConfirmation && !confirmed.has(step.id)) {
      return err(issue('policy-rejected', `Restore step ${step.id} requires explicit confirmation.`, step));
    }
  }

  const staged = new Map<string, unknown>();
  for (const step of plan.steps) {
    const result = await port.stage(step);
    if (!result.ok) {
      await Promise.allSettled([...staged.entries()].map(([id, value]) => {
        const stagedStep = plan.steps.find(candidate => candidate.id === id);
        return stagedStep ? port.cleanup(stagedStep, value) : Promise.resolve();
      }));
      return result;
    }
    staged.set(step.id, result.value);
  }

  const receipts: TeleportRestoreReceipt[] = [];
  const rolledBackStepIds: string[] = [];
  try {
    for (const step of plan.steps) {
      const committed = await port.commit(step, staged.get(step.id));
      if (!committed.ok) throw committed.issues;
      const receipt = { stepId: step.id, capabilityInstanceId: step.capabilityInstanceId, token: committed.value };
      receipts.push(receipt);
      const verified = await port.verify(step, receipt.token);
      if (!verified.ok) throw verified.issues.length ? verified.issues : [issue('verification-failed', `Restore step ${step.id} did not verify.`, step)];
    }
    return ok({ status: 'committed', receipts, rolledBackStepIds });
  } catch (cause) {
    const failure = Array.isArray(cause) && cause.length
      ? cause as TeleportIssue[]
      : [issue('execution-failed', 'Restore execution failed.', plan.steps[receipts.length] ?? plan.steps[0]!)];
    for (const receipt of receipts.toReversed()) {
      const step = plan.steps.find(candidate => candidate.id === receipt.stepId);
      if (!step?.reversible) continue;
      const rollback = await port.rollback(step, receipt.token);
      if (rollback.ok) rolledBackStepIds.push(step.id);
    }
    return err(...failure);
  } finally {
    await Promise.allSettled(plan.steps.map(step => port.cleanup(step, staged.get(step.id))));
  }
};
