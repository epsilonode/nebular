import { type AttemptJournal, type ExactPm2RecordDeletionReceipt, type JournalIssueCode, type LeaseJournal, type VerifiedWindowsAttemptContainmentBinding, type VerifiedWindowsTerminalCleanupRecord, type VerifiedWindowsTreeCleanupProof } from './journal.ts';
import { type ProcessAttemptId } from './primitives.ts';
import type { CurrentProcessIncarnationPort, ProcessIncarnationObservation } from './receiver-attempt-verifier.ts';
import type { OneShotResult } from './one-shot-slots.ts';
import type { WindowsNamedJobTerminalObservationPort } from './windows-named-job-containment.ts';
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
    deleteExactRecord: (request: ExactPm2RecordDeletionRequest) => Promise<OneShotResult<ExactPm2RecordDeletionReceipt, ExactPm2RecordDeletionIssue>>;
}>;
export type WindowsTerminalCleanupPorts = Readonly<{
    attempts: Pick<AttemptJournal, 'finalizeVerifiedWindowsTerminalCleanup' | 'readGrantQualifiedContainedAttempt' | 'readVerifiedWindowsTerminalCleanup'>;
    leases: Pick<LeaseJournal, 'readClosedCountForAttempt' | 'readNonterminalForAttempt' | 'transition'>;
    containment: WindowsNamedJobTerminalObservationPort;
    rootProcesses: CurrentProcessIncarnationPort;
    pm2: ExactPm2RecordDeletionPort;
    clock: Readonly<{
        nowMs: () => number;
    }>;
}>;
export type WindowsTerminalCleanupRecoveryStage = 'request' | 'durable-binding' | 'job-tree' | 'root-exit' | 'exposure-closure' | 'pm2-deletion' | 'journal-finalization';
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
export type WindowsTerminalCleanupOutcome = WindowsTerminalCleanupSuccess | WindowsTerminalCleanupRecovery;
/**
 * Terminal composition consumes only the redacted observer signal. Every
 * authority, PM2, root-incarnation, and Job fact is reread from the exact
 * durable containment binding before effects begin.
 */
export declare const cleanupVerifiedWindowsOneShotAttempt: (signal: WindowsOneShotTerminalSignal, ports: WindowsTerminalCleanupPorts) => Promise<WindowsTerminalCleanupOutcome>;
export declare const isExactRootExited: (observation: ProcessIncarnationObservation, binding: VerifiedWindowsAttemptContainmentBinding) => boolean;
