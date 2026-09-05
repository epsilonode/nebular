import type { RecipeLifecycle } from '../recipe-contract/public.ts';
import { type AuthorizedExecution, type BrokerAuthorityPorts } from './authority.ts';
import { type BrokerOperationContext, type BrokerOperationPort } from './operation.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { type BrokerResult } from './result.ts';
export type RecipeExecutionTerminalState = 'succeeded' | 'failed' | 'cancelled';
/**
 * The executor's observable receipt deliberately excludes authority,
 * command, environment, receiver metadata, and secret-bearing values.
 */
export type AuthorizedRecipeExecutionCompletion = Readonly<{
    attemptId: ProcessAttemptId;
    lifecycle: RecipeLifecycle;
    state: RecipeExecutionTerminalState;
    exitCode: number | null;
    cleanup: 'complete';
}>;
export type AuthorizedRecipeExecutorPort = Readonly<{
    executeToTerminal: (execution: AuthorizedExecution, nowMs: number, context?: BrokerOperationContext) => Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>>;
}>;
export type RecipeExecutionOperationDependencies = Readonly<{
    authority: BrokerAuthorityPorts;
    executor: AuthorizedRecipeExecutorPort;
    fallback: BrokerOperationPort;
}>;
export declare const createRecipeExecutionOperationPort: (dependencies: RecipeExecutionOperationDependencies) => BrokerOperationPort;
