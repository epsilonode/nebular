import { type BrokerClientResult } from '../result.ts';
export declare const MANAGED_WINDOWS_JOB_ENVIRONMENT: Readonly<{
    readonly jobIdentity: "NEBULAR_PM2_JOB_IDENTITY";
    readonly processAttemptId: "NEBULAR_PM2_ATTEMPT_ID";
}>;
export type ManagedWindowsJobIdentity = Readonly<{
    kind: 'managed-windows-job-identity';
    value: string;
}>;
export type ManagedWindowsJobAttemptIdentity = Readonly<{
    kind: 'managed-windows-job-attempt-identity';
    value: string;
}>;
export type ManagedWindowsJobFirstEffectIdentity = Readonly<{
    job: ManagedWindowsJobIdentity;
    attempt: ManagedWindowsJobAttemptIdentity;
}>;
export type ManagedWindowsJobAnchorReceipt = Readonly<{
    state: 'assigned' | 'already-contained';
    job: ManagedWindowsJobIdentity;
    attempt: ManagedWindowsJobAttemptIdentity;
    processId: number;
}>;
export type ManagedWindowsJobLifetimeAnchorAuthority = Readonly<{
    proveRetained: () => Promise<BrokerClientResult<ManagedWindowsJobAnchorReceipt>>;
}>;
export type ManagedWindowsJobLifetimeAnchor = Readonly<{
    identity: ManagedWindowsJobAnchorReceipt;
    authority: ManagedWindowsJobLifetimeAnchorAuthority;
}>;
export type ManagedWindowsJobFirstEffectGatePort = Readonly<{
    enter: () => Promise<BrokerClientResult<ManagedWindowsJobLifetimeAnchor>>;
}>;
export type ManagedWindowsJobEnvironmentPort = Readonly<{
    read: (name: string) => unknown;
}>;
export type ManagedWindowsJobPolicyObservation = Readonly<{
    status: 'compatible';
}> | Readonly<{
    status: 'incompatible' | 'unavailable';
}>;
export type ManagedWindowsJobBooleanObservation = Readonly<{
    status: 'observed';
    value: boolean;
}> | Readonly<{
    status: 'unavailable';
}>;
export type ManagedWindowsJobActiveProcessObservation = Readonly<{
    status: 'observed';
    activeProcesses: number;
}> | Readonly<{
    status: 'unavailable';
}>;
export type ManagedWindowsJobNativeAction = Readonly<{
    status: 'succeeded' | 'failed';
}>;
export type ManagedWindowsJobNativeSession = Readonly<{
    queryPolicy: () => Promise<ManagedWindowsJobPolicyObservation>;
    queryActiveProcesses: () => Promise<ManagedWindowsJobActiveProcessObservation>;
    isCurrentProcessInAnyJob: () => Promise<ManagedWindowsJobBooleanObservation>;
    isCurrentProcessInThisJob: () => Promise<ManagedWindowsJobBooleanObservation>;
    assignCurrentProcess: () => Promise<ManagedWindowsJobNativeAction>;
    close: () => Promise<boolean>;
}>;
export type ManagedWindowsJobNativeOpenOutcome = Readonly<{
    status: 'opened';
    processId: number;
    session: ManagedWindowsJobNativeSession;
}> | Readonly<{
    status: 'unavailable';
}>;
export type ManagedWindowsJobNativePort = Readonly<{
    openCurrentProcess: (job: ManagedWindowsJobIdentity) => Promise<ManagedWindowsJobNativeOpenOutcome>;
}>;
export declare const readManagedWindowsJobFirstEffectIdentity: (environment: ManagedWindowsJobEnvironmentPort) => BrokerClientResult<ManagedWindowsJobFirstEffectIdentity>;
export declare const createManagedWindowsJobFirstEffectGate: (environment: ManagedWindowsJobEnvironmentPort, native: ManagedWindowsJobNativePort) => ManagedWindowsJobFirstEffectGatePort;
