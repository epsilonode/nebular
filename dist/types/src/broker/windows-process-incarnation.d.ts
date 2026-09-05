import type { CurrentProcessIncarnationPort, ProcessIncarnationObservation, ProcessIncarnationQuery } from './receiver-attempt-verifier.ts';
export type WindowsOpenedProcessInspection = Readonly<{
    status: 'running';
    creationFileTime: bigint;
}> | Readonly<{
    status: 'stopped';
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsOpenedProcess = Readonly<{
    inspect: () => Promise<WindowsOpenedProcessInspection>;
    /** Closes both the process handle and its native-library lifetime. */
    close: () => Promise<boolean>;
}>;
export type WindowsNativeProcessOpenObservation = Readonly<{
    status: 'opened';
    process: WindowsOpenedProcess;
}> | Readonly<{
    status: 'missing';
}> | Readonly<{
    status: 'inaccessible';
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsProcessNativePort = Readonly<{
    openProcess: (processId: number) => Promise<WindowsNativeProcessOpenObservation>;
}>;
export declare const createBunWindowsProcessNativePort: () => WindowsProcessNativePort;
export declare const readWindowsProcessIncarnation: (query: ProcessIncarnationQuery, runtime: WindowsProcessNativePort, platform: string) => Promise<ProcessIncarnationObservation>;
export declare const createWindowsProcessIncarnationPort: (runtime?: WindowsProcessNativePort, platform?: string) => CurrentProcessIncarnationPort;
