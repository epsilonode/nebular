import type { TrustedProfileRoot } from './journal.ts';
import type { ExactNameOneShotPorts, OneShotReceiverPortIssue } from './one-shot-receiver.ts';
import type { OneShotResult } from './one-shot-slots.ts';
export declare const WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS = 10000;
export type WindowsNamedMutexAllocationConfig = Readonly<{
    namespace: string;
    trustedProfileRoot: TrustedProfileRoot;
    timeoutMs: number;
}>;
export type WindowsNamedMutexLease = Readonly<{
    /** Single-use capability. Release is executed on the acquiring Bun JS thread. */
    release: () => Promise<boolean>;
}>;
export type WindowsNamedMutexAcquisition = Readonly<{
    status: 'acquired';
    disposition: 'ordinary' | 'abandoned';
    lease: WindowsNamedMutexLease;
}> | Readonly<{
    status: 'timeout' | 'unavailable';
}>;
export type WindowsNamedMutexNativePort = Readonly<{
    acquire: (name: string, timeoutMs: number) => Promise<WindowsNamedMutexAcquisition>;
}>;
export type WindowsNamedMutexAllocationPort<Payload> = Readonly<{
    withAllocationLock: ExactNameOneShotPorts<Payload>['withAllocationLock'];
}>;
export declare const deriveWindowsNamedMutexName: (config: WindowsNamedMutexAllocationConfig) => OneShotResult<string, OneShotReceiverPortIssue>;
export declare const createBunWindowsNamedMutexNativePort: (platform?: string) => WindowsNamedMutexNativePort;
export declare const createWindowsNamedMutexAllocationPort: <Payload>(config: WindowsNamedMutexAllocationConfig, native?: WindowsNamedMutexNativePort) => WindowsNamedMutexAllocationPort<Payload>;
