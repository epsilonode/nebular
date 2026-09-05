import type { AttemptJournal, JournalIssueCode } from './journal.ts';
import { type GrantQualifiedOneShotReservation } from './one-shot-materialization-reservation.ts';
import { type ExactOneShotStart, type OneShotReceiverPortIssue } from './one-shot-receiver.ts';
import { type OneShotAttemptHandle, type OneShotResult, type OneShotSlotObservation, type OneShotSlotPool } from './one-shot-slots.ts';
export type GrantQualifiedOneShotStartRecoveryReason = 'durable-admission-missing' | 'durable-admission-drift' | 'slot-inventory-drift' | 'slot-foreign' | 'slot-ownership-drift' | 'terminal-retired' | 'confirmation-exhausted';
export type GrantQualifiedOneShotStartIssue = Readonly<{
    code: 'grant-qualified-one-shot-start-invalid';
    safeMessage: string;
}> | Readonly<{
    code: 'grant-qualified-one-shot-start-recovery-required';
    reason: GrantQualifiedOneShotStartRecoveryReason;
    safeMessage: string;
}> | Readonly<{
    code: 'grant-qualified-one-shot-start-authority-stale';
    reason: 'deadline-expired';
    safeMessage: string;
}> | Readonly<{
    code: 'grant-qualified-one-shot-start-journal-failed';
    journalCode: JournalIssueCode;
    safeMessage: string;
}> | Readonly<{
    code: 'grant-qualified-one-shot-start-port-failed';
    operation: 'lock' | 'observe' | 'prepare-exact-start' | 'start-exact' | 'wait' | 'clock';
    receiverDetail?: OneShotReceiverPortIssue['detail'];
    safeMessage: string;
}>;
export type GrantQualifiedOneShotActiveStart = Readonly<{
    state: 'exact-start-confirmed';
    disposition: 'started' | 'already-started';
    handle: OneShotAttemptHandle;
    processId: number;
    receiverStatus: 'online' | 'launching';
}>;
export type GrantQualifiedOneShotTerminalStart = Readonly<{
    state: 'exact-terminal-confirmed';
    disposition: 'started' | 'already-started';
    handle: OneShotAttemptHandle;
    receiverStatus: 'stopped' | 'errored';
    exitCode: number;
}>;
export type GrantQualifiedOneShotStartOutcome = GrantQualifiedOneShotActiveStart | GrantQualifiedOneShotTerminalStart;
export type GrantQualifiedOneShotStartPorts<Payload> = Readonly<{
    attempts: Pick<AttemptJournal, 'readGrantQualifiedMaterializing'>;
}> & Readonly<{
    /** The same namespace lock used by reservation and ordinary one-shot allocation. */
    withAllocationLock: <Value>(namespace: string, work: () => Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>) => Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>;
    observe: (pool: OneShotSlotPool) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
    prepareExactStart: (reservation: GrantQualifiedOneShotReservation<Payload>) => Promise<OneShotResult<void, Readonly<{
        code: 'exact-start-preparation-failed';
        safeMessage: string;
    }>>>;
    startExact: (request: ExactOneShotStart<Payload>) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
}>;
export type GrantQualifiedOneShotStartTiming = Readonly<{
    confirmationAttempts: number;
    confirmationIntervalMs: number;
}> & Readonly<{
    now: () => number;
    wait: (milliseconds: number) => Promise<void>;
}>;
export declare const createSystemGrantQualifiedOneShotStartTiming: () => GrantQualifiedOneShotStartTiming;
export declare const startGrantQualifiedOneShotReservation: <Payload>(reservation: GrantQualifiedOneShotReservation<Payload>, pool: OneShotSlotPool, ports: GrantQualifiedOneShotStartPorts<Payload>, timing?: GrantQualifiedOneShotStartTiming) => Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>>;
