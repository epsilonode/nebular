import type { CanonicalRepository } from './primitives.ts';
import { type BrokerResult } from './result.ts';
import { type CanonicalWindowsWorkingDirectory } from './windows-execution-paths.ts';
export declare const COOPERATIVE_BUN_TOOL_DECLARATION: "bun";
export type CanonicalCurrentBunExecutable = Readonly<{
    kind: 'canonical-current-bun-executable';
    value: string;
}>;
export type CanonicalBrokerEntrypoint = Readonly<{
    kind: 'canonical-broker-entrypoint';
    value: string;
}>;
export type RepositoryRelativeWindowsTargetEntrypoint = Readonly<{
    kind: 'repository-relative-windows-target-entrypoint';
    value: string;
}>;
export type CanonicalWindowsTargetEntrypoint = Readonly<{
    kind: 'canonical-windows-target-entrypoint';
    value: string;
    repository: CanonicalRepository;
    workingDirectory: CanonicalWindowsWorkingDirectory;
    relativePath: RepositoryRelativeWindowsTargetEntrypoint;
}>;
export type ResolvedCooperativeBunTool = Readonly<{
    kind: 'cooperative-bun-v1';
    executable: CanonicalCurrentBunExecutable;
    brokerEntrypoint: CanonicalBrokerEntrypoint;
}>;
export type WindowsExecutionToolResolutionRequest = Readonly<{
    declaredTool: string;
}>;
export type WindowsExecutionToolRegistryPort = Readonly<{
    resolve: (request: WindowsExecutionToolResolutionRequest) => Promise<BrokerResult<ResolvedCooperativeBunTool>>;
}>;
export type WindowsExecutionToolRegistryOptions = Readonly<{
    /** Fixed by the privileged composition root; never copied from a recipe or repository. */
    brokerEntrypointPath: string;
}>;
export type WindowsExecutionProcessFacts = Readonly<{
    platform: string;
    runtime: 'bun' | 'unsupported';
    executablePath: string;
}>;
export type WindowsExecutionFileObservation = Readonly<{
    role: 'current-bun-executable' | 'broker-entrypoint' | 'target-entrypoint';
    requestedPath: string;
    canonicalPath: string | null;
    kind: 'regular-file' | 'directory' | 'other' | 'missing';
    traversesReparsePoint: boolean;
}>;
export type WindowsExecutionFileInspectionRequest = Readonly<{
    role: WindowsExecutionFileObservation['role'];
    path: string;
}>;
export type WindowsExecutionFileFactsPort = Readonly<{
    inspectExistingFile: (request: WindowsExecutionFileInspectionRequest) => Promise<unknown>;
}>;
/**
 * The runtime has no ambient resolver operation by design: no PATH, PATHEXT,
 * `where`, shell, package manifest, or repository override can participate.
 */
export type WindowsExecutionToolRuntimePort = WindowsExecutionFileFactsPort & Readonly<{
    currentProcess: () => unknown;
}>;
export type WindowsExecutionTargetEntrypointRequest = Readonly<{
    repository: CanonicalRepository;
    workingDirectory: CanonicalWindowsWorkingDirectory;
    declaredEntrypoint: string;
}>;
export type WindowsExecutionTargetEntrypointResolverPort = Readonly<{
    resolveTargetEntrypoint: (request: WindowsExecutionTargetEntrypointRequest) => Promise<BrokerResult<CanonicalWindowsTargetEntrypoint>>;
}>;
export declare const readCurrentWindowsExecutionProcessFacts: () => WindowsExecutionProcessFacts;
export declare const createWindowsExecutionToolRegistry: (options: WindowsExecutionToolRegistryOptions, runtime: WindowsExecutionToolRuntimePort) => WindowsExecutionToolRegistryPort;
export declare const createWindowsExecutionTargetEntrypointResolver: (files: WindowsExecutionFileFactsPort) => WindowsExecutionTargetEntrypointResolverPort;
