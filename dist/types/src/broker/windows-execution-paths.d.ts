import type { CanonicalRepository } from './primitives.ts';
import { type BrokerResult } from './result.ts';
export declare const WINDOWS_EXECUTION_PATH_MAX_CODE_UNITS = 32767;
export declare const WINDOWS_EXECUTION_DECLARED_CWD_MAX_CODE_UNITS = 4096;
export type RepositoryRelativeWindowsDirectory = Readonly<{
    kind: 'repository-relative-windows-directory';
    value: string;
}>;
export type CanonicalWindowsWorkingDirectory = Readonly<{
    kind: 'canonical-windows-working-directory';
    value: string;
    repository: CanonicalRepository;
    relativePath: RepositoryRelativeWindowsDirectory;
}>;
export type WindowsExecutionDirectoryObservation = Readonly<{
    requestedPath: string;
    canonicalPath: string | null;
    kind: 'directory' | 'regular-file' | 'other' | 'missing';
    traversesReparsePoint: boolean;
}>;
export type WindowsExecutionDirectoryFacts = Readonly<{
    platform: string;
    repository: WindowsExecutionDirectoryObservation;
    workingDirectory: WindowsExecutionDirectoryObservation;
}>;
export type WindowsExecutionDirectoryInspectionRequest = Readonly<{
    repositoryPath: string;
    workingDirectoryPath: string;
}>;
/**
 * A production adapter must inspect every traversed component. In particular,
 * `traversesReparsePoint` cannot be implemented as an lstat of only the leaf.
 * The boundary returns unknown so malformed native/FFI observations fail closed.
 */
export type WindowsExecutionDirectoryFactsPort = Readonly<{
    inspect: (request: WindowsExecutionDirectoryInspectionRequest) => Promise<unknown>;
}>;
export type WindowsExecutionWorkingDirectoryRequest = Readonly<{
    repository: CanonicalRepository;
    declaredCwd: string;
}>;
export type WindowsExecutionPathResolverPort = Readonly<{
    resolveWorkingDirectory: (request: WindowsExecutionWorkingDirectoryRequest) => Promise<BrokerResult<CanonicalWindowsWorkingDirectory>>;
}>;
export declare const isCanonicalLocalWindowsAbsolutePath: (value: unknown) => value is string;
export declare const parseRepositoryRelativeWindowsDirectory: (value: unknown) => BrokerResult<RepositoryRelativeWindowsDirectory>;
export declare const createWindowsExecutionPathResolver: (facts: WindowsExecutionDirectoryFactsPort) => WindowsExecutionPathResolverPort;
