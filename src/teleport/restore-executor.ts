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
  readonly stage: (step: TeleportRestoreStep) => Promise<TeleportResult<unknown>>;
  readonly commit: (
    step: TeleportRestoreStep,
    staged: unknown
  ) => Promise<TeleportResult<unknown>>;
  readonly verify: (
    step: TeleportRestoreStep,
    receipt: unknown
  ) => Promise<TeleportResult<void>>;
  readonly rollback: (
    step: TeleportRestoreStep,
    receipt: unknown
  ) => Promise<TeleportResult<void>>;
  readonly cleanup: (step: TeleportRestoreStep, staged: unknown) => Promise<void>;
}

type StagedStep = Readonly<{
  step: TeleportRestoreStep;
  token: unknown;
}>;

type CommittedStep = Readonly<{
  step: TeleportRestoreStep;
  receipt: TeleportRestoreReceipt;
}>;

type StagingOutcome =
  | Readonly<{
      ok: true;
      staged: readonly StagedStep[];
      warnings: readonly TeleportIssue[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly TeleportIssue[];
      staged: readonly StagedStep[];
      warnings: readonly TeleportIssue[];
    }>;

type CommitOutcome =
  | Readonly<{
      ok: true;
      committed: readonly CommittedStep[];
      warnings: readonly TeleportIssue[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly TeleportIssue[];
      committed: readonly CommittedStep[];
      warnings: readonly TeleportIssue[];
    }>;

type RollbackOutcome = Readonly<{
  rolledBackStepIds: readonly string[];
  issues: readonly TeleportIssue[];
}>;

const restoreIssue = (
  code: TeleportIssue['code'],
  message: string,
  step: TeleportRestoreStep
): TeleportIssue => ({
  code,
  message,
  instanceId: step.capabilityInstanceId
});

const settleResult = <T>(
  operation: Promise<TeleportResult<T>>,
  step: TeleportRestoreStep,
  phase: string
): Promise<TeleportResult<T>> => operation.then(
  result => result,
  (): TeleportResult<T> => err(restoreIssue(
    'execution-failed',
    `Restore step ${step.id} ${phase} failed unexpectedly.`,
    step
  ))
);

const settleCleanup = (
  staged: StagedStep,
  port: TeleportRestoreExecutorPort
): Promise<readonly TeleportIssue[]> => port.cleanup(staged.step, staged.token).then(
  (): readonly TeleportIssue[] => [],
  (): readonly TeleportIssue[] => [restoreIssue(
    'execution-failed',
    `Restore step ${staged.step.id} cleanup failed.`,
    staged.step
  )]
);

const stageSteps = async (
  steps: readonly TeleportRestoreStep[],
  port: TeleportRestoreExecutorPort,
  index = 0,
  staged: readonly StagedStep[] = [],
  warnings: readonly TeleportIssue[] = []
): Promise<StagingOutcome> => {
  const step = steps[index];
  if (!step) return { ok: true, staged, warnings };
  const result = await settleResult(port.stage(step), step, 'staging');
  if (!result.ok) return { ok: false, issues: result.issues, staged, warnings };
  return stageSteps(
    steps,
    port,
    index + 1,
    [...staged, { step, token: result.value }],
    [...warnings, ...result.warnings]
  );
};

const cleanupStaged = async (
  staged: readonly StagedStep[],
  port: TeleportRestoreExecutorPort,
  index = 0,
  issues: readonly TeleportIssue[] = []
): Promise<readonly TeleportIssue[]> => {
  const current = staged[index];
  if (!current) return issues;
  const cleanupIssues = await settleCleanup(current, port);
  return cleanupStaged(staged, port, index + 1, [...issues, ...cleanupIssues]);
};

const commitSteps = async (
  staged: readonly StagedStep[],
  port: TeleportRestoreExecutorPort,
  index = 0,
  committed: readonly CommittedStep[] = [],
  warnings: readonly TeleportIssue[] = []
): Promise<CommitOutcome> => {
  const current = staged[index];
  if (!current) return { ok: true, committed, warnings };

  const committedResult = await settleResult(
    port.commit(current.step, current.token),
    current.step,
    'commit'
  );
  if (!committedResult.ok) {
    const issues: readonly TeleportIssue[] = committedResult.issues.length > 0
      ? committedResult.issues
      : [restoreIssue(
          'execution-failed',
          `Restore step ${current.step.id} did not commit.`,
          current.step
        )];
    return { ok: false, issues, committed, warnings };
  }

  const receipt: TeleportRestoreReceipt = {
    stepId: current.step.id,
    capabilityInstanceId: current.step.capabilityInstanceId,
    token: committedResult.value
  };
  const nextCommitted: readonly CommittedStep[] = [...committed, { step: current.step, receipt }];
  const nextWarnings: readonly TeleportIssue[] = [...warnings, ...committedResult.warnings];
  const verified = await settleResult(
    port.verify(current.step, receipt.token),
    current.step,
    'verification'
  );
  if (!verified.ok) {
    const issues: readonly TeleportIssue[] = verified.issues.length > 0
      ? verified.issues
      : [restoreIssue(
          'verification-failed',
          `Restore step ${current.step.id} did not verify.`,
          current.step
        )];
    return { ok: false, issues, committed: nextCommitted, warnings: nextWarnings };
  }
  return commitSteps(
    staged,
    port,
    index + 1,
    nextCommitted,
    [...nextWarnings, ...verified.warnings]
  );
};

const rollbackCommitted = async (
  committed: readonly CommittedStep[],
  port: TeleportRestoreExecutorPort,
  index = committed.length - 1,
  outcome: RollbackOutcome = { rolledBackStepIds: [], issues: [] }
): Promise<RollbackOutcome> => {
  const current = committed[index];
  if (!current) return outcome;
  if (!current.step.reversible) return rollbackCommitted(committed, port, index - 1, outcome);

  const rolledBack = await settleResult(
    port.rollback(current.step, current.receipt.token),
    current.step,
    'rollback'
  );
  return rollbackCommitted(
    committed,
    port,
    index - 1,
    rolledBack.ok
      ? {
          rolledBackStepIds: [...outcome.rolledBackStepIds, current.step.id],
          issues: outcome.issues
        }
      : {
          rolledBackStepIds: outcome.rolledBackStepIds,
          issues: [
            ...outcome.issues,
            ...(rolledBack.issues.length > 0
              ? rolledBack.issues
              : [restoreIssue(
                  'execution-failed',
                  `Restore step ${current.step.id} rollback failed.`,
                  current.step
                )])
          ]
        }
  );
};

const authorizationIssue = (
  plan: TeleportRestorePlan,
  authorization: TeleportRestoreAuthorization
): TeleportIssue | undefined => {
  const unauthorized = plan.steps.find(step => !authorization.allowEffects.includes(step.effect));
  if (unauthorized) {
    return restoreIssue(
      'policy-rejected',
      `Restore effect ${unauthorized.effect} is not authorized.`,
      unauthorized
    );
  }
  const unconfirmed = plan.steps.find(step =>
    step.requiresConfirmation && !authorization.confirmedStepIds?.includes(step.id)
  );
  return unconfirmed
    ? restoreIssue(
        'policy-rejected',
        `Restore step ${unconfirmed.id} requires explicit confirmation.`,
        unconfirmed
      )
    : undefined;
};

export const executeTeleportRestorePlan = async (
  plan: TeleportRestorePlan,
  authorization: TeleportRestoreAuthorization,
  port: TeleportRestoreExecutorPort
): Promise<TeleportResult<TeleportRestoreExecutionReport>> => {
  const denied = authorizationIssue(plan, authorization);
  if (denied) return err(denied);

  const staging = await stageSteps(plan.steps, port);
  if (!staging.ok) {
    const cleanupIssues = await cleanupStaged(staging.staged, port);
    return err(...staging.issues, ...cleanupIssues);
  }

  const execution = await commitSteps(staging.staged, port);
  if (execution.ok) {
    const cleanupIssues = await cleanupStaged(staging.staged, port);
    return ok({
      status: 'committed',
      receipts: execution.committed.map(entry => entry.receipt),
      rolledBackStepIds: []
    }, [...staging.warnings, ...execution.warnings, ...cleanupIssues]);
  }

  const rollback = await rollbackCommitted(execution.committed, port);
  const cleanupIssues = await cleanupStaged(staging.staged, port);
  return err(...execution.issues, ...rollback.issues, ...cleanupIssues);
};
