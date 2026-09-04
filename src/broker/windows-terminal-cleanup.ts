import { createHash } from 'node:crypto';

import {
  parseJournalOperationId,
  type AttemptJournal,
  type ExactPm2RecordDeletionReceipt,
  type GrantQualifiedContainedAttemptRecord,
  type JournalIssueCode,
  type LeaseJournal,
  type LeaseJournalRecord,
  type TransitionLease,
  type VerifiedWindowsAttemptContainmentBinding,
  type VerifiedWindowsTerminalCleanupRecord,
  type VerifiedWindowsTreeCleanupProof
} from './journal.ts';
import { parseSecretExposureCleanupReceiptId } from './lease.ts';
import { parseProcessAttemptId, type ProcessAttemptId } from './primitives.ts';
import type {
  CurrentProcessIncarnationPort,
  ProcessIncarnationObservation
} from './receiver-attempt-verifier.ts';
import type { OneShotResult } from './one-shot-slots.ts';
import type {
  WindowsNamedJobTerminalObservationPort,
  WindowsNamedJobTerminationObservation
} from './windows-named-job-containment.ts';

const TERMINAL_CLEANUP_OPERATION_DOMAIN = 'epsilonode/nebular/windows-terminal-cleanup/v1';
const EXPOSURE_TRANSITION_OPERATION_DOMAIN = 'epsilonode/nebular/exposure-terminal-transition/v1';
const EXPOSURE_RECEIPT_DOMAIN = 'epsilonode/nebular/exposure-cleanup-receipt/v1';

export type WindowsOneShotTerminalSignal = Readonly<{
  format: 'windows-pm2-one-shot-terminal-signal/v1';
  processAttemptId: ProcessAttemptId;
  terminalDisposition: 'succeeded' | 'failed' | 'cancelled';
  observedAtMs: number;
}>;

export type ExactPm2RecordDeletionRequest = Readonly<{
  format: 'pm2-exact-record-deletion-request/v1';
  binding: VerifiedWindowsAttemptContainmentBinding;
  treeCleanup: VerifiedWindowsTreeCleanupProof;
}>;

export type ExactPm2RecordDeletionIssue = Readonly<{
  code: 'pm2-exact-record-deletion-unconfirmed';
  safeMessage: string;
}>;

/**
 * This port may use only the allowlisted PM2 projection. It must never expose
 * raw PM2 metadata, environment objects, arguments, or logs. `already-absent`
 * is admissible only for this exact durable binding after the supplied tree
 * proof, which makes crash recovery idempotent without broad name matching.
 */
export type ExactPm2RecordDeletionPort = Readonly<{
  deleteExactRecord: (
    request: ExactPm2RecordDeletionRequest
  ) => Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>>;
}>;

export type WindowsTerminalCleanupPorts = Readonly<{
  attempts: Pick<AttemptJournal,
    | 'finalizeVerifiedWindowsTerminalCleanup'
    | 'readGrantQualifiedContainedAttempt'
    | 'readVerifiedWindowsTerminalCleanup'>;
  leases: Pick<LeaseJournal, 'readClosedCountForAttempt' | 'readNonterminalForAttempt' | 'transition'>;
  containment: WindowsNamedJobTerminalObservationPort;
  rootProcesses: CurrentProcessIncarnationPort;
  pm2: ExactPm2RecordDeletionPort;
  clock: Readonly<{ nowMs: () => number }>;
}>;

export type WindowsTerminalCleanupRecoveryStage =
  | 'request'
  | 'durable-binding'
  | 'job-tree'
  | 'root-exit'
  | 'exposure-closure'
  | 'pm2-deletion'
  | 'journal-finalization';

export type WindowsTerminalCleanupSuccess = Readonly<{
  state: 'cleaned' | 'already-cleaned';
  processAttemptId: ProcessAttemptId;
  cleanup: VerifiedWindowsTerminalCleanupRecord;
}>;

export type WindowsTerminalCleanupRecovery = Readonly<{
  state: 'recovery-required';
  processAttemptId: ProcessAttemptId | null;
  stage: WindowsTerminalCleanupRecoveryStage;
  journalCode?: JournalIssueCode;
  safeMessage: string;
}>;

export type WindowsTerminalCleanupOutcome =
  | WindowsTerminalCleanupSuccess
  | WindowsTerminalCleanupRecovery;

type CleanupStepResult<Value> = OneShotResult<Value, WindowsTerminalCleanupRecovery>;

const success = <Value>(value: Value): CleanupStepResult<Value> => ({ outcome: 'success', value });
const failure = <Value = never>(issue: WindowsTerminalCleanupRecovery): CleanupStepResult<Value> => ({
  outcome: 'failure',
  issue
});

const recovery = (
  processAttemptId: ProcessAttemptId | null,
  stage: WindowsTerminalCleanupRecoveryStage,
  journalCode?: JournalIssueCode
): WindowsTerminalCleanupRecovery => ({
  state: 'recovery-required',
  processAttemptId,
  stage,
  ...(journalCode === undefined ? {} : { journalCode }),
  safeMessage: 'The exact Windows process cleanup requires bounded reconciliation.'
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validTerminalSignal = (signal: WindowsOneShotTerminalSignal): boolean => {
  const raw: unknown = signal;
  return isRecord(raw) && raw['format'] === 'windows-pm2-one-shot-terminal-signal/v1' &&
    parseProcessAttemptId(raw['processAttemptId']).isOk() &&
    (raw['terminalDisposition'] === 'succeeded' || raw['terminalDisposition'] === 'failed' ||
      raw['terminalDisposition'] === 'cancelled') && Number.isSafeInteger(raw['observedAtMs']) &&
    typeof raw['observedAtMs'] === 'number' && raw['observedAtMs'] >= 0;
};

const sha256 = (domain: string, values: readonly unknown[]): string => createHash('sha256')
  .update(JSON.stringify([domain, ...values]))
  .digest('hex');

const operationId = (
  domain: string,
  values: readonly unknown[]
) => parseJournalOperationId(`${domain}-${sha256(domain, values)}`);

const attemptDigest = (binding: VerifiedWindowsAttemptContainmentBinding): string | null => {
  const value = binding.slotIndependentPlanDigest.value;
  return /^sha256:[a-f0-9]{64}$/u.test(value) ? value.slice('sha256:'.length) : null;
};

const safeNow = (ports: WindowsTerminalCleanupPorts, minimum: number): Promise<number | null> => Promise.resolve()
  .then(() => ports.clock.nowMs()).then(
    value => Number.isSafeInteger(value) && value >= minimum ? value : null,
    () => null
  );

const exactJob = (
  observation: WindowsNamedJobTerminationObservation,
  binding: VerifiedWindowsAttemptContainmentBinding
): boolean => observation.status === 'proved-empty'
  ? observation.receipt.job.value === binding.jobIdentity.value
  : observation.status === 'missing' && observation.job.value === binding.jobIdentity.value;

const cleanedOutcome = (
  state: WindowsTerminalCleanupSuccess['state'],
  processAttemptId: ProcessAttemptId,
  cleanup: VerifiedWindowsTerminalCleanupRecord
): WindowsTerminalCleanupSuccess => ({ state, processAttemptId, cleanup });

const decodeRootObservation = (
  value: unknown,
  binding: VerifiedWindowsAttemptContainmentBinding
): 'exited' | 'running' | 'ambiguous' => {
  if (!isRecord(value) || value['processId'] !== binding.rootProcessId) return 'ambiguous';
  if (value['status'] === 'missing' || value['status'] === 'stopped') return 'exited';
  if (value['status'] !== 'running') return 'ambiguous';
  const incarnation = value['incarnation'];
  if (!isRecord(incarnation) || incarnation['kind'] !== 'process-incarnation' ||
      typeof incarnation['value'] !== 'string') return 'ambiguous';
  return incarnation['value'] === binding.rootProcessIncarnation.value ? 'running' : 'exited';
};

const treeProof = (
  binding: VerifiedWindowsAttemptContainmentBinding,
  observation: Exclude<WindowsNamedJobTerminationObservation, { status: 'ambiguous' }>,
  observedAtMs: number
): VerifiedWindowsTreeCleanupProof => ({
  format: 'verified-windows-tree-cleanup/v1',
  proof: 'exact-tree-empty',
  basis: observation.status === 'missing'
    ? 'job-missing-root-exited'
    : observation.receipt.state === 'already-empty'
      ? 'job-already-empty'
      : 'job-terminated-empty',
  jobIdentity: binding.jobIdentity,
  rootProcessId: binding.rootProcessId,
  rootProcessIncarnation: binding.rootProcessIncarnation,
  observedAtMs
});

const proveTreeEmpty = (
  binding: VerifiedWindowsAttemptContainmentBinding,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<VerifiedWindowsTreeCleanupProof>> => {
  const digest = attemptDigest(binding);
  if (digest === null) return Promise.resolve(failure(recovery(binding.processAttemptId, 'durable-binding')));
  return Promise.resolve().then(() => ports.containment.terminateAndObserve({
    attemptId: binding.processAttemptId,
    attemptDigest: digest
  })).then(
    job => job.status === 'ambiguous' || !exactJob(job, binding)
      ? failure(recovery(binding.processAttemptId, 'job-tree'))
      : Promise.resolve().then(() => ports.rootProcesses.readCurrentIncarnation({
          processId: binding.rootProcessId
        })).then(
          root => decodeRootObservation(root, binding) !== 'exited'
            ? failure(recovery(binding.processAttemptId, 'root-exit'))
            : safeNow(ports, binding.membershipVerifiedAtMs).then(nowMs => nowMs === null
              ? failure(recovery(binding.processAttemptId, 'root-exit'))
              : success(treeProof(binding, job, nowMs))),
          () => failure(recovery(binding.processAttemptId, 'root-exit'))
        ),
    () => failure(recovery(binding.processAttemptId, 'job-tree'))
  );
};

const transitionOperation = (
  lease: LeaseJournalRecord,
  phase: string
) => operationId(EXPOSURE_TRANSITION_OPERATION_DOMAIN, [
  lease.processAttemptId,
  lease.id.value,
  lease.exposureCorrelation.value,
  phase
]);

const cleanupReceiptId = (lease: LeaseJournalRecord) => parseSecretExposureCleanupReceiptId(
  `${EXPOSURE_RECEIPT_DOMAIN}-${sha256(EXPOSURE_RECEIPT_DOMAIN, [
    lease.processAttemptId,
    lease.id.value,
    lease.exposureCorrelation.value
  ])}`
);

const commitLeaseTransition = (
  command: TransitionLease,
  expectedNextState: LeaseJournalRecord['state'],
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => Promise.resolve()
  .then(() => ports.leases.transition(command)).then(
    result => result.type === 'ok' && result.value.record.state === expectedNextState &&
      result.value.record.id.value === command.leaseId.value &&
      result.value.record.exposureCorrelation.value === command.exposureCorrelation.value
      ? success(result.value.record)
      : failure(recovery(
          result.type === 'ok' ? result.value.record.processAttemptId : null,
          'exposure-closure',
          result.type === 'err' ? result.issues[0].code : undefined
        )),
    () => failure(recovery(null, 'exposure-closure'))
  );

const revokeAuthorized = (
  lease: LeaseJournalRecord & Readonly<{ state: 'authorized' }>,
  atMs: number,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => {
  const id = transitionOperation(lease, 'authorized-to-revoked');
  return id.type === 'err'
    ? Promise.resolve(failure(recovery(lease.processAttemptId, 'exposure-closure')))
    : commitLeaseTransition({
        operationId: id.value,
        leaseId: lease.id,
        exposureCorrelation: lease.exposureCorrelation,
        atMs,
        expectedState: 'authorized',
        nextState: 'revoked',
        cleanupReceipt: null
      }, 'revoked', ports);
};

const moveToRecovery = (
  lease: LeaseJournalRecord & Readonly<{ state: 'delivering' }>,
  atMs: number,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => {
  const id = transitionOperation(lease, 'delivering-to-recovery-required');
  return id.type === 'err'
    ? Promise.resolve(failure(recovery(lease.processAttemptId, 'exposure-closure')))
    : commitLeaseTransition({
        operationId: id.value,
        leaseId: lease.id,
        exposureCorrelation: lease.exposureCorrelation,
        atMs,
        expectedState: 'delivering',
        nextState: 'recovery-required',
        cleanupReceipt: null
      }, 'recovery-required', ports);
};

const requireClosure = (
  lease: LeaseJournalRecord & Readonly<{ state: 'exposed' | 'recovery-required' }>,
  atMs: number,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => {
  const id = transitionOperation(lease, `${lease.state}-to-closure-required`);
  if (id.type === 'err') {
    return Promise.resolve(failure(recovery(lease.processAttemptId, 'exposure-closure')));
  }
  const command: TransitionLease = lease.state === 'exposed'
    ? {
        operationId: id.value,
        leaseId: lease.id,
        exposureCorrelation: lease.exposureCorrelation,
        atMs,
        expectedState: 'exposed',
        nextState: 'closure-required',
        cleanupReceipt: null
      }
    : {
        operationId: id.value,
        leaseId: lease.id,
        exposureCorrelation: lease.exposureCorrelation,
        atMs,
        expectedState: 'recovery-required',
        nextState: 'closure-required',
        cleanupReceipt: null
      };
  return commitLeaseTransition(command, 'closure-required', ports);
};

const closeRequiredExposure = (
  lease: LeaseJournalRecord & Readonly<{ state: 'closure-required' }>,
  proof: VerifiedWindowsTreeCleanupProof,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => {
  const id = transitionOperation(lease, 'closure-required-to-closed');
  const receiptId = cleanupReceiptId(lease);
  if (id.type === 'err' || receiptId.isErr()) {
    return Promise.resolve(failure(recovery(lease.processAttemptId, 'exposure-closure')));
  }
  return commitLeaseTransition({
    operationId: id.value,
    leaseId: lease.id,
    exposureCorrelation: lease.exposureCorrelation,
    atMs: proof.observedAtMs,
    expectedState: 'closure-required',
    nextState: 'closed',
    cleanupReceipt: {
      format: 'secret-exposure-cleanup-receipt/v1',
      id: receiptId.value,
      exposureCorrelation: lease.exposureCorrelation,
      receiverId: lease.receiverId,
      processAttemptId: lease.processAttemptId,
      proof: 'exact-tree-empty',
      observedAtMs: proof.observedAtMs
    }
  }, 'closed', ports);
};

const closeLeaseExposure = (
  lease: LeaseJournalRecord,
  proof: VerifiedWindowsTreeCleanupProof,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<LeaseJournalRecord>> => {
  switch (lease.state) {
    case 'authorized':
      return revokeAuthorized({ ...lease, state: 'authorized' }, proof.observedAtMs, ports);
    case 'delivering':
      return moveToRecovery({ ...lease, state: 'delivering' }, proof.observedAtMs, ports).then(result =>
        result.outcome === 'failure'
          ? result
          : closeLeaseExposure(result.value, proof, ports));
    case 'exposed':
    case 'recovery-required':
      return requireClosure({ ...lease, state: lease.state }, proof.observedAtMs, ports).then(result =>
        result.outcome === 'failure'
          ? result
          : closeLeaseExposure(result.value, proof, ports));
    case 'closure-required':
      return closeRequiredExposure({ ...lease, state: 'closure-required' }, proof, ports);
    case 'closed':
    case 'revoked':
      return Promise.resolve(success(lease));
  }
};

const closeExposureList = (
  leases: readonly LeaseJournalRecord[],
  proof: VerifiedWindowsTreeCleanupProof,
  ports: WindowsTerminalCleanupPorts,
  offset: number = 0
): Promise<CleanupStepResult<void>> => {
  const lease = leases.at(offset);
  return lease === undefined
    ? Promise.resolve(success(undefined))
    : closeLeaseExposure(lease, proof, ports).then(closed => closed.outcome === 'failure'
      ? closed
      : closeExposureList(leases, proof, ports, offset + 1));
};

const closeEveryExposure = (
  attemptId: ProcessAttemptId,
  proof: VerifiedWindowsTreeCleanupProof,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<number>> => Promise.resolve()
  .then(() => ports.leases.readNonterminalForAttempt(attemptId)).then(
    leases => leases.type === 'err'
      ? failure(recovery(attemptId, 'exposure-closure', leases.issues[0].code))
      : closeExposureList(leases.value, proof, ports).then(closed => closed.outcome === 'failure'
        ? closed
        : Promise.resolve().then(() => ports.leases.readNonterminalForAttempt(attemptId)).then(
            remaining => remaining.type === 'err' || remaining.value.length > 0
              ? failure(recovery(
                  attemptId,
                  'exposure-closure',
                  remaining.type === 'err' ? remaining.issues[0].code : undefined
                ))
              : Promise.resolve().then(() => ports.leases.readClosedCountForAttempt(attemptId)).then(
                  count => count.type === 'ok'
                    ? success(count.value)
                    : failure(recovery(attemptId, 'exposure-closure', count.issues[0].code)),
                  () => failure(recovery(attemptId, 'exposure-closure'))
                ),
            () => failure(recovery(attemptId, 'exposure-closure'))
          )),
    () => failure(recovery(attemptId, 'exposure-closure'))
  );

const exactDeletionReceipt = (
  receipt: ExactPm2RecordDeletionReceipt,
  binding: VerifiedWindowsAttemptContainmentBinding,
  proof: VerifiedWindowsTreeCleanupProof
): boolean => receipt.receiverId === binding.receiverId &&
  receipt.receiverCorrelation.value === binding.receiverCorrelation.value &&
  receipt.receiverSlotIdentity === binding.receiverSlotIdentity &&
  receipt.receiverProcessName === binding.receiverProcessName && receipt.receiverPmId === binding.receiverPmId &&
  receipt.processAttemptId === binding.processAttemptId &&
  receipt.launchMetadataDigest === binding.launchMetadataDigest && receipt.deletedAtMs >= proof.observedAtMs;

const deletePm2Record = (
  binding: VerifiedWindowsAttemptContainmentBinding,
  proof: VerifiedWindowsTreeCleanupProof,
  ports: WindowsTerminalCleanupPorts
): Promise<CleanupStepResult<ExactPm2RecordDeletionReceipt>> => Promise.resolve()
  .then(() => ports.pm2.deleteExactRecord({
    format: 'pm2-exact-record-deletion-request/v1',
    binding,
    treeCleanup: proof
  })).then(
    result => result.outcome === 'success' && exactDeletionReceipt(result.value, binding, proof)
      ? success(result.value)
      : failure(recovery(binding.processAttemptId, 'pm2-deletion')),
    () => failure(recovery(binding.processAttemptId, 'pm2-deletion'))
  );

const finalCleanupRecord = (
  signal: WindowsOneShotTerminalSignal,
  binding: VerifiedWindowsAttemptContainmentBinding,
  proof: VerifiedWindowsTreeCleanupProof,
  deletion: ExactPm2RecordDeletionReceipt,
  closedExposureCount: number,
  cleanedAtMs: number
): CleanupStepResult<VerifiedWindowsTerminalCleanupRecord> => {
  const id = operationId(TERMINAL_CLEANUP_OPERATION_DOMAIN, [
    signal.processAttemptId,
    binding.bindingGeneration,
    binding.jobIdentity.value,
    binding.rootProcessIncarnation.value,
    binding.receiverPmId,
    binding.launchMetadataDigest
  ]);
  return id.type === 'err'
    ? failure(recovery(signal.processAttemptId, 'journal-finalization'))
    : success({
        format: 'verified-windows-terminal-cleanup/v1',
        operationId: id.value,
        processAttemptId: signal.processAttemptId,
        bindingGeneration: binding.bindingGeneration,
        terminalDisposition: signal.terminalDisposition,
        treeCleanup: proof,
        pm2Deletion: deletion,
        closedExposureCount,
        cleanedAtMs
      });
};

const finalizeCleanup = (
  signal: WindowsOneShotTerminalSignal,
  contained: GrantQualifiedContainedAttemptRecord,
  proof: VerifiedWindowsTreeCleanupProof,
  deletion: ExactPm2RecordDeletionReceipt,
  closedExposureCount: number,
  ports: WindowsTerminalCleanupPorts
): Promise<WindowsTerminalCleanupOutcome> => safeNow(
  ports,
  Math.max(signal.observedAtMs, deletion.deletedAtMs)
).then(cleanedAtMs => {
  if (cleanedAtMs === null) return recovery(signal.processAttemptId, 'journal-finalization');
  const expectedAttemptState = contained.attempt.state;
  if (expectedAttemptState === 'cleaned') {
    return recovery(signal.processAttemptId, 'journal-finalization', 'journal-recovery-required');
  }
  const cleanup = finalCleanupRecord(
    signal,
    contained.containmentBinding,
    proof,
    deletion,
    closedExposureCount,
    cleanedAtMs
  );
  if (cleanup.outcome === 'failure') return cleanup.issue;
  return Promise.resolve().then(() => ports.attempts.finalizeVerifiedWindowsTerminalCleanup({
    cleanup: cleanup.value,
    expectedAttemptState,
    expectedAttemptStateVersion: contained.attempt.stateVersion
  })).then(
    result => result.type === 'ok' && result.value.record.operationId.value === cleanup.value.operationId.value
      ? cleanedOutcome('cleaned', signal.processAttemptId, result.value.record)
      : recovery(
          signal.processAttemptId,
          'journal-finalization',
          result.type === 'err' ? result.issues[0].code : undefined
        ),
    () => recovery(signal.processAttemptId, 'journal-finalization')
  );
});

const executeCleanup = (
  signal: WindowsOneShotTerminalSignal,
  contained: GrantQualifiedContainedAttemptRecord,
  ports: WindowsTerminalCleanupPorts
): Promise<WindowsTerminalCleanupOutcome> => proveTreeEmpty(contained.containmentBinding, ports).then(proof =>
  proof.outcome === 'failure'
    ? proof.issue
    : closeEveryExposure(signal.processAttemptId, proof.value, ports).then(closed => closed.outcome === 'failure'
      ? closed.issue
      : deletePm2Record(contained.containmentBinding, proof.value, ports).then(deletion =>
          deletion.outcome === 'failure'
            ? deletion.issue
            : finalizeCleanup(signal, contained, proof.value, deletion.value, closed.value, ports))));

const resolveDurableCleanup = (
  signal: WindowsOneShotTerminalSignal,
  ports: WindowsTerminalCleanupPorts
): Promise<WindowsTerminalCleanupOutcome> => Promise.resolve()
  .then(() => ports.attempts.readVerifiedWindowsTerminalCleanup(signal.processAttemptId)).then(
    prior => {
      if (prior.type === 'err') {
        return recovery(signal.processAttemptId, 'durable-binding', prior.issues[0].code);
      }
      if (prior.value !== null) return prior.value.terminalDisposition === signal.terminalDisposition
        ? cleanedOutcome('already-cleaned', signal.processAttemptId, prior.value)
        : recovery(signal.processAttemptId, 'journal-finalization', 'journal-conflict');
      return Promise.resolve().then(() => ports.attempts.readGrantQualifiedContainedAttempt(
        signal.processAttemptId
      )).then(
        contained => contained.type === 'ok' && contained.value !== null &&
          signal.observedAtMs >= contained.value.containmentBinding.membershipVerifiedAtMs
          ? executeCleanup(signal, contained.value, ports)
          : recovery(
              signal.processAttemptId,
              'durable-binding',
              contained.type === 'err' ? contained.issues[0].code : undefined
            ),
        () => recovery(signal.processAttemptId, 'durable-binding')
      );
    },
    () => recovery(signal.processAttemptId, 'durable-binding')
  );

/**
 * Terminal composition consumes only the redacted observer signal. Every
 * authority, PM2, root-incarnation, and Job fact is reread from the exact
 * durable containment binding before effects begin.
 */
export const cleanupVerifiedWindowsOneShotAttempt = (
  signal: WindowsOneShotTerminalSignal,
  ports: WindowsTerminalCleanupPorts
): Promise<WindowsTerminalCleanupOutcome> => validTerminalSignal(signal)
  ? resolveDurableCleanup(signal, ports)
  : Promise.resolve(recovery(null, 'request'));

export const isExactRootExited = (
  observation: ProcessIncarnationObservation,
  binding: VerifiedWindowsAttemptContainmentBinding
): boolean => decodeRootObservation(observation, binding) === 'exited';
