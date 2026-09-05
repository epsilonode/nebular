import { type GrantQualifiedOneShotReservation } from './one-shot-materialization-reservation.ts';
import type { GrantQualifiedOneShotStartOutcome } from './grant-qualified-one-shot-start.ts';
import type { OneShotReceiverPortIssue } from './one-shot-receiver.ts';
import { type OneShotAttemptHandle, type OneShotResult, type OneShotSlotObservation, type OneShotSlotPool } from './one-shot-slots.ts';
export declare const GRANT_QUALIFIED_ONE_SHOT_DEFAULT_TERMINAL_POLL_INTERVAL_MS = 25;
export declare const GRANT_QUALIFIED_ONE_SHOT_MAX_TERMINAL_POLL_INTERVAL_MS = 1000;
export declare const GRANT_QUALIFIED_ONE_SHOT_DEFAULT_CONSECUTIVE_OBSERVE_FAILURES = 3;
export declare const GRANT_QUALIFIED_ONE_SHOT_MAX_CONSECUTIVE_OBSERVE_FAILURES = 10;
export type GrantQualifiedOneShotTerminalObservation = Readonly<{
    state: 'exact-terminal-observed';
    handle: OneShotAttemptHandle;
    receiverStatus: 'stopped' | 'errored';
    exitCode: number;
}>;
export type GrantQualifiedOneShotCancellationRequirement = Readonly<{
    state: 'exact-cancellation-required';
    reason: 'control-cancelled' | 'deadline-expired';
    handle: OneShotAttemptHandle;
}>;
export type GrantQualifiedOneShotTerminalWaitOutcome = GrantQualifiedOneShotTerminalObservation | GrantQualifiedOneShotCancellationRequirement;
export type GrantQualifiedOneShotTerminalWaitIssue = Readonly<{
    code: 'grant-qualified-one-shot-terminal-wait-invalid';
    safeMessage: string;
}> | Readonly<{
    code: 'grant-qualified-one-shot-terminal-recovery-required';
    reason: 'clock-unavailable' | 'receiver-observation-unavailable' | 'slot-inventory-drift' | 'slot-ownership-drift' | 'terminal-projection-incomplete' | 'wait-unavailable';
    safeMessage: string;
}>;
export type GrantQualifiedOneShotTerminalWaitPorts = Readonly<{
    observe: (pool: OneShotSlotPool) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
    now: () => number;
    wait: (milliseconds: number) => Promise<void>;
}>;
export type GrantQualifiedOneShotTerminalWaitPolicy = Readonly<{
    pollIntervalMs: number;
    maximumConsecutiveObserveFailures: number;
}>;
export declare const createSystemGrantQualifiedOneShotTerminalWaitPorts: (observe: GrantQualifiedOneShotTerminalWaitPorts["observe"]) => GrantQualifiedOneShotTerminalWaitPorts;
export declare const waitForGrantQualifiedOneShotTerminal: <Payload>(reservation: GrantQualifiedOneShotReservation<Payload>, pool: OneShotSlotPool, start: GrantQualifiedOneShotStartOutcome, signal: Readonly<AbortSignal>, ports: GrantQualifiedOneShotTerminalWaitPorts, policy?: GrantQualifiedOneShotTerminalWaitPolicy) => Promise<OneShotResult<GrantQualifiedOneShotTerminalWaitOutcome, GrantQualifiedOneShotTerminalWaitIssue>>;
