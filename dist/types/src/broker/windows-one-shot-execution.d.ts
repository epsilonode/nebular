import { type GrantQualifiedOneShotTerminalWaitPolicy, type GrantQualifiedOneShotTerminalWaitPorts } from './grant-qualified-one-shot-terminal-observer.ts';
import type { OneShotSlotPool } from './one-shot-slots.ts';
import { type AuthorizedRecipeExecutorPort } from './recipe-execution-operation.ts';
import type { TrustedProfileRoot } from './journal.ts';
import { type WindowsTerminalCleanupPorts } from './windows-terminal-cleanup.ts';
import { type WindowsOneShotArtifactRuntimePort } from './windows-one-shot-artifacts.ts';
import type { WindowsPm2OneShotLaunchPort } from './windows-pm2-one-shot-launch.ts';
export type WindowsOneShotExecutionConfig = Readonly<{
    pool: OneShotSlotPool;
    trustedProfileRoot: TrustedProfileRoot;
    terminalWaitPolicy?: GrantQualifiedOneShotTerminalWaitPolicy;
}>;
export type WindowsOneShotExecutionPorts = Readonly<{
    launch: WindowsPm2OneShotLaunchPort;
    terminalWait: GrantQualifiedOneShotTerminalWaitPorts;
    cleanup: WindowsTerminalCleanupPorts;
    artifacts: WindowsOneShotArtifactRuntimePort;
}>;
/**
 * This composition owns the exact one-shot lifetime. It cannot return a
 * successful execution receipt until terminal observation, Job-tree proof,
 * exposure closure, exact PM2 deletion, durable finalization, and trusted
 * artifact release have all succeeded.
 */
export declare const createWindowsOneShotExecutionPort: (config: WindowsOneShotExecutionConfig, ports: WindowsOneShotExecutionPorts) => AuthorizedRecipeExecutorPort;
