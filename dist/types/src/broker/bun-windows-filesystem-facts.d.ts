import { type WindowsExecutionDirectoryFactsPort } from './windows-execution-paths.ts';
import { type WindowsExecutionToolRuntimePort } from './windows-tool-registry.ts';
export type WindowsFilesystemComponentKind = 'directory' | 'regular-file' | 'other';
export type WindowsFilesystemComponentInspection = Readonly<{
    status: 'observed';
    canonicalPath: string;
    kind: WindowsFilesystemComponentKind;
    reparsePoint: boolean;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsOpenedFilesystemComponent = Readonly<{
    inspect: () => Promise<WindowsFilesystemComponentInspection>;
    close: () => Promise<boolean>;
}>;
export type WindowsFilesystemComponentOpenObservation = Readonly<{
    status: 'opened';
    component: WindowsOpenedFilesystemComponent;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsFilesystemNativeSession = Readonly<{
    openComponent: (path: string) => Promise<WindowsFilesystemComponentOpenObservation>;
    /** Unloads the native library after all component handles have been closed. */
    close: () => Promise<boolean>;
}>;
export type WindowsFilesystemSessionOpenObservation = Readonly<{
    status: 'opened';
    session: WindowsFilesystemNativeSession;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsFilesystemPathObservation = Readonly<{
    requestedPath: string;
    canonicalPath: string;
    kind: WindowsFilesystemComponentKind;
    traversesReparsePoint: boolean;
}>;
export type WindowsFilesystemPathFactsPort = Readonly<{
    inspectExistingPath: (path: string) => Promise<WindowsFilesystemPathObservation | Readonly<{
        status: 'unavailable';
    }>>;
}>;
export type WindowsFilesystemNativePort = Readonly<{
    openSession: () => Promise<WindowsFilesystemSessionOpenObservation>;
}>;
export type BunWindowsFilesystemFactsRuntime = WindowsExecutionDirectoryFactsPort & WindowsExecutionToolRuntimePort & WindowsFilesystemPathFactsPort;
export declare const createBunWindowsFilesystemNativePort: (platform?: string) => WindowsFilesystemNativePort;
export declare const createBunWindowsFilesystemFactsRuntime: (native?: WindowsFilesystemNativePort, platform?: string) => BunWindowsFilesystemFactsRuntime;
