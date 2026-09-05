import { type ProcessIncarnation, type TrustedProfileRoot } from './journal.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { type BrokerResult } from './result.ts';
export declare const WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_ATTEMPTS = 40;
export declare const WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_ATTEMPTS = 100;
export declare const WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_INTERVAL_MS = 25;
export declare const WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_INTERVAL_MS = 100;
export type WindowsNamedJobIdentity = Readonly<{
    kind: 'windows-named-job-identity';
    value: string;
}>;
export type WindowsNamedJobContainmentConfig = Readonly<{
    trustedProfileRoot: TrustedProfileRoot;
    namespace: string;
    terminationPollAttempts?: number;
    terminationPollIntervalMs?: number;
}>;
export type WindowsNamedJobAttemptIdentity = Readonly<{
    attemptId: ProcessAttemptId;
    attemptDigest: string;
}>;
export type WindowsNamedJobVerificationRequest = WindowsNamedJobAttemptIdentity & Readonly<{
    processId: number;
    processIncarnation: ProcessIncarnation;
}>;
export type WindowsNamedJobTerminationRequest = WindowsNamedJobAttemptIdentity;
export type WindowsNamedJobTerminationReceipt = Readonly<{
    state: 'terminated-empty' | 'already-empty';
    job: WindowsNamedJobIdentity;
    activeProcesses: 0;
}>;
export type WindowsNamedJobTerminationObservation = Readonly<{
    status: 'proved-empty';
    receipt: WindowsNamedJobTerminationReceipt;
}> | Readonly<{
    status: 'missing';
    job: WindowsNamedJobIdentity;
}> | Readonly<{
    status: 'ambiguous';
    reason: 'cleanup-unconfirmed' | 'policy-conflict' | 'unavailable';
}>;
export type WindowsNamedJobVerificationReceipt = Readonly<{
    state: 'verified-contained';
    job: WindowsNamedJobIdentity;
    processId: number;
    processIncarnation: ProcessIncarnation;
}>;
export type WindowsNamedJobBootstrapRootObservation = Readonly<{
    status: 'pending';
    reason: 'job-name-missing' | 'job-empty';
    job: WindowsNamedJobIdentity;
}> | Readonly<{
    status: 'ready';
    job: WindowsNamedJobIdentity;
    processId: number;
}> | Readonly<{
    status: 'ambiguous';
    reason: 'multiple-processes' | 'policy-conflict' | 'unavailable';
}>;
export type WindowsNamedJobContainmentPort = Readonly<{
    observeBootstrapRoot: (request: WindowsNamedJobAttemptIdentity) => Promise<WindowsNamedJobBootstrapRootObservation>;
    verifyExactProcess: (request: WindowsNamedJobVerificationRequest) => Promise<BrokerResult<WindowsNamedJobVerificationReceipt>>;
    terminateAndProveEmpty: (request: WindowsNamedJobTerminationRequest) => Promise<BrokerResult<WindowsNamedJobTerminationReceipt>>;
}>;
export type WindowsNamedJobTerminalObservationPort = Readonly<{
    /**
     * Preserves a missing-name observation for the durable terminal-cleanup
     * composer. Missing is not proof here; only that composer may combine it
     * with a prior exact membership binding and exact root-incarnation exit.
     */
    terminateAndObserve: (request: WindowsNamedJobTerminationRequest) => Promise<WindowsNamedJobTerminationObservation>;
}>;
export type WindowsNamedJobContainmentCapabilities = WindowsNamedJobContainmentPort & WindowsNamedJobTerminalObservationPort;
export type WindowsNamedJobProcessInspection = Readonly<{
    status: 'running';
    creationFileTime: bigint;
}> | Readonly<{
    status: 'stopped' | 'unavailable';
}>;
export type WindowsNamedJobPolicyObservation = Readonly<{
    status: 'compatible';
}> | Readonly<{
    status: 'incompatible' | 'unavailable';
}>;
export type WindowsNamedJobBooleanObservation = Readonly<{
    status: 'observed';
    value: boolean;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsNamedJobActiveProcessObservation = Readonly<{
    status: 'observed';
    activeProcesses: number;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsNamedJobProcessIdsObservation = Readonly<{
    status: 'observed';
    processIds: readonly number[];
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsNamedJobNativeAction = Readonly<{
    status: 'succeeded' | 'failed';
}>;
export type WindowsNamedJobTerminationSession = Readonly<{
    queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
    queryActiveProcesses: () => Promise<WindowsNamedJobActiveProcessObservation>;
    terminate: (exitCode: number) => Promise<WindowsNamedJobNativeAction>;
    close: () => Promise<boolean>;
}>;
export type WindowsNamedJobObservationSession = Readonly<{
    queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
    queryProcessIds: () => Promise<WindowsNamedJobProcessIdsObservation>;
    close: () => Promise<boolean>;
}>;
export type WindowsNamedJobVerificationSession = Readonly<{
    inspectProcess: () => Promise<WindowsNamedJobProcessInspection>;
    queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
    queryActiveProcesses: () => Promise<WindowsNamedJobActiveProcessObservation>;
    isProcessInThisJob: () => Promise<WindowsNamedJobBooleanObservation>;
    close: () => Promise<boolean>;
}>;
export type WindowsNamedJobTerminationOpenOutcome = Readonly<{
    status: 'opened';
    session: WindowsNamedJobTerminationSession;
}> | Readonly<{
    status: 'missing' | 'unavailable';
}>;
export type WindowsNamedJobObservationOpenOutcome = Readonly<{
    status: 'opened';
    session: WindowsNamedJobObservationSession;
}> | Readonly<{
    status: 'missing' | 'unavailable';
}>;
export type WindowsNamedJobVerificationOpenOutcome = Readonly<{
    status: 'opened';
    session: WindowsNamedJobVerificationSession;
}> | Readonly<{
    status: 'job-missing' | 'process-missing' | 'process-inaccessible' | 'unavailable';
}>;
export type WindowsNamedJobNativePort = Readonly<{
    openObservation: (name: WindowsNamedJobIdentity) => Promise<WindowsNamedJobObservationOpenOutcome>;
    openTermination: (name: WindowsNamedJobIdentity) => Promise<WindowsNamedJobTerminationOpenOutcome>;
    openVerification: (name: WindowsNamedJobIdentity, processId: number) => Promise<WindowsNamedJobVerificationOpenOutcome>;
    delay: (milliseconds: number) => Promise<void>;
}>;
export declare const deriveWindowsNamedJobIdentity: (config: Pick<WindowsNamedJobContainmentConfig, "trustedProfileRoot" | "namespace">, attempt: WindowsNamedJobAttemptIdentity) => BrokerResult<WindowsNamedJobIdentity>;
export declare const createBunWindowsNamedJobNativePort: (platform?: string, architecture?: string) => WindowsNamedJobNativePort;
/**
 * The ephemeral-safe-to-stop policy is exact: KILL_ON_JOB_CLOSE is the only
 * extended limit and UI restrictions are zero, so no breakaway mode can omit a
 * descendant. An admitted target self-assigns as its first effect and retains a
 * non-inheritable opaque lifetime anchor until process exit. Closing that last
 * owned anchor then terminates any surviving descendants without a wrapper.
 * Query-only broker handles are temporary and verification always closes them.
 * A missing object name is never accepted as standalone proof of an empty tree;
 * higher-level cleanup must combine prior containment with root and descendant
 * exit evidence.
 */
export declare const createWindowsNamedJobContainmentPort: (config: WindowsNamedJobContainmentConfig, native?: WindowsNamedJobNativePort) => WindowsNamedJobContainmentCapabilities;
