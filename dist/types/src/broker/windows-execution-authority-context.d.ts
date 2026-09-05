import type { BrokerAuthorityPorts } from './authority.ts';
import { type BunSqliteJournalOptions } from './bun-sqlite-journal.ts';
import { type WindowsKnownFolderRuntimePort } from './bun-windows-profile.ts';
import { type GitJournalExecutionAuthorityOptions } from './git-journal-execution-authority.ts';
import { type GitCurrentRecipeRuntime } from './git-current-recipe.ts';
import { type AuthorityJournal, type TrustedProfileRoot } from './journal.ts';
import { type BrokerResult } from './result.ts';
import { type BrokerHostConfigurationRuntimePort, type CanonicalGitExecutable } from './windows-host-configuration.ts';
import type { WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION } from './windows-bootstrap-composition.ts';
export declare const WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION: typeof WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION;
export declare const WINDOWS_EXECUTION_AUTHORITY_DEFAULT_ADAPTER_TIMEOUT_MS = 2000;
export declare const WINDOWS_EXECUTION_AUTHORITY_MAX_ADAPTER_TIMEOUT_MS = 10000;
export declare const WINDOWS_EXECUTION_AUTHORITY_DEFAULT_JOURNAL_BUSY_TIMEOUT_MS = 250;
export declare const WINDOWS_EXECUTION_AUTHORITY_MAX_JOURNAL_BUSY_TIMEOUT_MS = 5000;
export type WindowsExecutionAuthorityContextOptions = Readonly<{
    adapterTimeoutMs?: number;
    recipeBlobLimitBytes?: number;
    journalBusyTimeoutMs?: number;
}>;
export type WindowsExecutionAuthorityJournalFactoryPort = Readonly<{
    create: (options: BunSqliteJournalOptions) => AuthorityJournal;
}>;
export type WindowsExecutionAuthorityFactoryPort = Readonly<{
    create: (options: GitJournalExecutionAuthorityOptions, runtime: GitCurrentRecipeRuntime) => BrokerAuthorityPorts;
}>;
export type WindowsExecutionAuthorityContextRuntime = Readonly<{
    platform: string;
    knownFolder: WindowsKnownFolderRuntimePort;
    hostConfiguration: BrokerHostConfigurationRuntimePort;
    git: GitCurrentRecipeRuntime;
    journals: WindowsExecutionAuthorityJournalFactoryPort;
    authorities: WindowsExecutionAuthorityFactoryPort;
    clock: Readonly<{
        nowMs: () => number;
    }>;
}>;
export type WindowsExecutionAuthorityContext = Readonly<{
    authority: BrokerAuthorityPorts;
    journal: AuthorityJournal;
    trustedProfileRoot: TrustedProfileRoot;
    gitExecutable: CanonicalGitExecutable;
}>;
export declare const createWindowsExecutionAuthorityContextRuntime: () => WindowsExecutionAuthorityContextRuntime;
export declare const resolveWindowsExecutionAuthorityContext: (options?: WindowsExecutionAuthorityContextOptions, injectedRuntime?: WindowsExecutionAuthorityContextRuntime) => Promise<BrokerResult<WindowsExecutionAuthorityContext>>;
