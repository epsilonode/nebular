import type { BrokerAuthorityPorts } from './authority.ts';
import { type BunWindowsFilesystemFactsRuntime } from './bun-windows-filesystem-facts.ts';
import { type GrantQualifiedOneShotStartTiming } from './grant-qualified-one-shot-start.ts';
import type { AuthorityJournal } from './journal.ts';
import { type Pm2ApplicationPrepareDispatchPort, type Pm2ApplicationRpcClientPort } from './pm2-application-rpc.ts';
import { createPm2ExactNameOneShotPorts, type Pm2OneShotCleanupProofPort, type Pm2OneShotLaunchPayload } from './pm2-exact-name-receiver.ts';
import { type Pm2PrerequisiteRuntimePort } from './pm2-prerequisite.ts';
import type { CurrentProcessIncarnationPort } from './receiver-attempt-verifier.ts';
import { type BrokerResult } from './result.ts';
import { type WindowsExecutionAuthorityContext, type WindowsExecutionAuthorityContextOptions } from './windows-execution-authority-context.ts';
import { type WindowsNamedJobContainmentCapabilities, type WindowsNamedJobContainmentConfig } from './windows-named-job-containment.ts';
import { type WindowsNamedMutexAllocationConfig, type WindowsNamedMutexAllocationPort } from './windows-named-mutex-allocation.ts';
import { type WindowsOneShotArtifactRuntimePort } from './windows-one-shot-artifacts.ts';
import { type WindowsPm2OneShotLaunchConfig, type WindowsPm2OneShotLaunchPort } from './windows-pm2-one-shot-launch.ts';
import type { ExactPm2RecordDeletionPort } from './windows-terminal-cleanup.ts';
export declare const WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT: "windows-pm2-one-shot-composition/v1";
export declare const WINDOWS_PM2_ONE_SHOT_DEFAULT_NAMESPACE: "nebular-one-shot";
export declare const WINDOWS_PM2_ONE_SHOT_DEFAULT_SLOT_CAPACITY = 1;
export declare const WINDOWS_PM2_ONE_SHOT_DEFAULT_ADAPTER_TIMEOUT_MS = 2000;
export declare const WINDOWS_PM2_ONE_SHOT_DEFAULT_ALLOCATION_TIMEOUT_MS = 2000;
export declare const WINDOWS_PM2_ONE_SHOT_DEFAULT_KILL_RETRY_TIME_MS = 100;
export type WindowsPm2OneShotCompositionOptions = Readonly<{
    brokerEntrypointPath: string;
    namespace?: string;
    slotCapacity?: number;
    pm2Endpoint?: string;
    adapterTimeoutMs?: number;
    allocationTimeoutMs?: number;
    killRetryTimeMs?: number;
    allowedNonsecretEnvironmentNames?: readonly string[];
}>;
export type WindowsPm2OneShotCompositionFactories = Readonly<{
    createAllocation: (config: WindowsNamedMutexAllocationConfig) => WindowsNamedMutexAllocationPort<Pm2OneShotLaunchPayload>;
    createArtifacts: (filesystem: BunWindowsFilesystemFactsRuntime) => WindowsOneShotArtifactRuntimePort;
    createCleanupProofs: () => Pm2OneShotCleanupProofPort;
    createClock: () => Readonly<{
        nowMs: () => number;
    }>;
    createContainment: (config: WindowsNamedJobContainmentConfig) => WindowsNamedJobContainmentCapabilities;
    createFilesystem: () => BunWindowsFilesystemFactsRuntime;
    createPm2ApplicationRpc: () => Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
    createPm2Compatibility: () => Pm2PrerequisiteRuntimePort;
    createProcessIncarnations: () => CurrentProcessIncarnationPort;
    createStartTiming: () => GrantQualifiedOneShotStartTiming;
}>;
export type WindowsPm2OneShotCompositionCapabilities = Readonly<{
    artifacts: WindowsOneShotArtifactRuntimePort;
    clock: Readonly<{
        nowMs: () => number;
    }>;
    containment: WindowsNamedJobContainmentCapabilities;
    filesystem: BunWindowsFilesystemFactsRuntime;
    journal: AuthorityJournal;
    pm2Deletion: ExactPm2RecordDeletionPort;
    processIncarnations: CurrentProcessIncarnationPort;
    receiver: ReturnType<typeof createPm2ExactNameOneShotPorts>;
    timing: GrantQualifiedOneShotStartTiming;
}>;
export type WindowsPm2OneShotComposition = Readonly<{
    format: typeof WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT;
    authority: BrokerAuthorityPorts;
    authorityContext: WindowsExecutionAuthorityContext;
    journal: AuthorityJournal;
    launchConfig: WindowsPm2OneShotLaunchConfig;
    launch: WindowsPm2OneShotLaunchPort;
    capabilities: WindowsPm2OneShotCompositionCapabilities;
}>;
export type WindowsExecutionAuthorityContextResolverPort = Readonly<{
    resolve: (options: WindowsExecutionAuthorityContextOptions) => Promise<BrokerResult<WindowsExecutionAuthorityContext>>;
}>;
export type WindowsPm2OneShotCompositionResolverRuntime = Readonly<{
    authorityContexts: WindowsExecutionAuthorityContextResolverPort;
    factories: WindowsPm2OneShotCompositionFactories;
}>;
export type WindowsPm2OneShotCompositionResolverOptions = Readonly<{
    authority?: WindowsExecutionAuthorityContextOptions;
    oneShot: WindowsPm2OneShotCompositionOptions;
}>;
export declare const createProductionWindowsPm2OneShotCompositionFactories: () => WindowsPm2OneShotCompositionFactories;
export declare const createWindowsPm2OneShotComposition: (context: WindowsExecutionAuthorityContext, options: WindowsPm2OneShotCompositionOptions, factories?: WindowsPm2OneShotCompositionFactories) => BrokerResult<WindowsPm2OneShotComposition>;
export declare const createWindowsPm2OneShotCompositionResolverRuntime: () => WindowsPm2OneShotCompositionResolverRuntime;
export declare const resolveWindowsPm2OneShotComposition: (options: WindowsPm2OneShotCompositionResolverOptions, injectedRuntime?: WindowsPm2OneShotCompositionResolverRuntime) => Promise<BrokerResult<WindowsPm2OneShotComposition>>;
