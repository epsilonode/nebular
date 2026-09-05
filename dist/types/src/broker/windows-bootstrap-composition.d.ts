import { type BootstrapCurrentRecipeTaskPort, type BootstrapCurrentReceiverAttemptTaskPort } from './bootstrap-authority.ts';
import { type BrokerBootstrapChildPorts, type BrokerBootstrapInheritedIpcRuntime } from './bun-bootstrap-inherited-ipc.ts';
import type { AuthorityJournal, TrustedLocalApplicationDataPort } from './journal.ts';
import { type BrokerResult } from './result.ts';
import type { SecretStoreLeasePort } from './secret-delivery.ts';
import { type WindowsBrokerHostConfigurationPort } from './windows-host-configuration.ts';
export declare const WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION: "epsilonode-nebular-v1";
export declare const WINDOWS_BROKER_BOOTSTRAP_DEFAULT_LEASE_LIFETIME_MS = 30000;
export declare const WINDOWS_BROKER_BOOTSTRAP_MAX_LEASE_LIFETIME_MS = 60000;
export declare const WINDOWS_BROKER_BOOTSTRAP_DEFAULT_ADAPTER_TIMEOUT_MS = 2000;
export declare const WINDOWS_BROKER_BOOTSTRAP_MAX_ADAPTER_TIMEOUT_MS = 10000;
export type WindowsBrokerBootstrapCompositionOptions = Readonly<{
    leaseLifetimeMs?: number;
    adapterTimeoutMs?: number;
}>;
export type WindowsBrokerBootstrapCompositionRuntime = Readonly<{
    localApplicationData: TrustedLocalApplicationDataPort;
    hostConfiguration: WindowsBrokerHostConfigurationPort;
    journal: AuthorityJournal;
    currentRecipes: Readonly<{
        create: (gitExecutable: string) => BootstrapCurrentRecipeTaskPort;
    }>;
    currentReceiverAttempt: BootstrapCurrentReceiverAttemptTaskPort;
    bootstrapRuntime: BrokerBootstrapInheritedIpcRuntime;
    secretStore: SecretStoreLeasePort;
    clock: Readonly<{
        nowMs: () => number;
    }>;
}>;
export declare const createWindowsBrokerBootstrapCompositionRuntime: (options?: WindowsBrokerBootstrapCompositionOptions) => WindowsBrokerBootstrapCompositionRuntime;
export declare const resolveWindowsBrokerBootstrapChildPorts: (options?: WindowsBrokerBootstrapCompositionOptions, runtime?: WindowsBrokerBootstrapCompositionRuntime) => Promise<BrokerResult<BrokerBootstrapChildPorts>>;
