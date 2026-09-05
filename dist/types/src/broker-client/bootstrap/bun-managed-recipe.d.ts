import { type BootstrapEnvironmentInstallPort, type BootstrapNotReadyRetryPolicy, type BootstrapNotReadyRetryPort, type PreparedApplication } from './cooperative.ts';
import { type BunBootstrapTransportOptions } from './bun-inherited-ipc.ts';
import { type ManagedAttemptEnvironmentPort, type ManagedBootstrapRequestInput } from './managed-attempt.ts';
import type { ManagedWindowsJobFirstEffectGatePort, ManagedWindowsJobLifetimeAnchor } from './windows-job-first-effect.ts';
import { type BrokerClientResult } from '../result.ts';
import type { CooperativeBootstrapTransportPort } from './cooperative.ts';
export declare const MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY: BootstrapNotReadyRetryPolicy;
export declare const MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT: "NEBULAR_BROKER_ENTRYPOINT";
export type ManagedBunRecipeBootstrapInput = Readonly<{
    brokerEntrypoint?: string;
    cwd?: string;
    slots: ManagedBootstrapRequestInput['slots'];
    timeoutMs?: number;
    retryPolicy?: BootstrapNotReadyRetryPolicy;
}>;
export type ManagedBunRecipeBootstrapRuntime = Readonly<{
    containment: ManagedWindowsJobFirstEffectGatePort;
    authorityEnvironment: ManagedAttemptEnvironmentPort;
    environment: BootstrapEnvironmentInstallPort;
    inheritedEnvironment: Readonly<{
        names: () => readonly string[];
    }>;
    locations: Readonly<{
        currentDirectory: () => string;
        brokerEntrypoint: () => unknown;
    }>;
    retry: BootstrapNotReadyRetryPort;
    transports: Readonly<{
        create: (options: BunBootstrapTransportOptions) => CooperativeBootstrapTransportPort;
    }>;
    clock: Readonly<{
        nowMs: () => number;
    }>;
}>;
export type PreparedManagedBunRecipeApplication<Module> = PreparedApplication<Module> & Readonly<{
    containment: ManagedWindowsJobLifetimeAnchor;
}>;
export declare const createManagedBunRecipeBootstrapRuntime: () => ManagedBunRecipeBootstrapRuntime;
export declare const prepareManagedBunRecipeEnvironmentThenImport: <Module>(input: ManagedBunRecipeBootstrapInput, deferredImport: () => PromiseLike<Module>, runtime?: ManagedBunRecipeBootstrapRuntime) => Promise<BrokerClientResult<PreparedManagedBunRecipeApplication<Module>>>;
