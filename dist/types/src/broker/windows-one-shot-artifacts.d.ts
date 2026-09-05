import type { WindowsFilesystemPathFactsPort } from './bun-windows-filesystem-facts.ts';
import type { TrustedProfileRoot } from './journal.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { type BrokerResult } from './result.ts';
export declare const WINDOWS_ONE_SHOT_ARTIFACT_FORMAT: "windows-one-shot-artifacts/v1";
export type WindowsOneShotArtifactPlan = Readonly<{
    format: typeof WINDOWS_ONE_SHOT_ARTIFACT_FORMAT;
    attemptId: ProcessAttemptId;
    attemptDigest: string;
    trustedProfileRoot: TrustedProfileRoot;
    directory: string;
    stdoutPath: string;
    stderrPath: string;
    pidPath: string;
}>;
export type WindowsOneShotArtifactPreparationReceipt = Readonly<{
    state: 'prepared-exact-start-artifacts';
    plan: WindowsOneShotArtifactPlan;
}>;
export type WindowsOneShotArtifactReleaseReceipt = Readonly<{
    state: 'released-after-exact-cleanup';
    plan: WindowsOneShotArtifactPlan;
}>;
export type WindowsOneShotArtifactDirectoryOutcome = 'created' | 'existing' | 'unavailable';
export type WindowsOneShotArtifactFileCreationOutcome = 'created' | 'already-exists' | 'unavailable';
export type WindowsOneShotArtifactRemovalOutcome = 'removed' | 'missing' | 'unavailable';
export type WindowsOneShotArtifactReadOutcome = Readonly<{
    state: 'pending';
}> | Readonly<{
    state: 'read';
    text: string;
}> | Readonly<{
    state: 'unavailable';
}>;
export type WindowsOneShotProcessIdObservation = Readonly<{
    state: 'pending';
}> | Readonly<{
    state: 'ready';
    processId: number;
}> | Readonly<{
    state: 'invalid' | 'unavailable';
}>;
export type WindowsOneShotArtifactRuntimePort = WindowsFilesystemPathFactsPort & Readonly<{
    ensureDirectory: (path: string) => Promise<WindowsOneShotArtifactDirectoryOutcome>;
    createExclusiveFile: (path: string) => Promise<WindowsOneShotArtifactFileCreationOutcome>;
    readBoundedFile: (path: string, maximumBytes: number) => Promise<WindowsOneShotArtifactReadOutcome>;
    removeFile: (path: string) => Promise<WindowsOneShotArtifactRemovalOutcome>;
    removeDirectoryIfEmpty: (path: string) => Promise<WindowsOneShotArtifactRemovalOutcome>;
}>;
export declare const planWindowsOneShotArtifacts: (trustedProfileRoot: TrustedProfileRoot, attemptId: ProcessAttemptId, attemptDigest: string) => BrokerResult<WindowsOneShotArtifactPlan>;
export declare const validateWindowsOneShotArtifactPlan: (plan: WindowsOneShotArtifactPlan) => boolean;
export declare const prepareWindowsOneShotArtifacts: (plan: WindowsOneShotArtifactPlan, runtime: WindowsOneShotArtifactRuntimePort) => Promise<BrokerResult<WindowsOneShotArtifactPreparationReceipt>>;
/**
 * PM2 writes this already-pinned file immediately after the process spawns.
 * It is only a candidate-PID readiness signal: callers must still prove the
 * live process incarnation and exact Windows Job membership before granting
 * any authority.
 */
export declare const observeWindowsOneShotProcessId: (plan: WindowsOneShotArtifactPlan, runtime: WindowsOneShotArtifactRuntimePort) => Promise<WindowsOneShotProcessIdObservation>;
export declare const releaseWindowsOneShotArtifacts: (plan: WindowsOneShotArtifactPlan, runtime: WindowsOneShotArtifactRuntimePort) => Promise<BrokerResult<WindowsOneShotArtifactReleaseReceipt>>;
export declare const createNodeWindowsOneShotArtifactRuntime: (facts: WindowsFilesystemPathFactsPort) => WindowsOneShotArtifactRuntimePort;
