import { parseBrokerAttemptId, type BrokerRequestMessage } from '../broker-client/public.ts';
import type { RecipeLifecycle } from '../recipe-contract/public.ts';
import {
  resolveAndAuthorizeExecution,
  type AuthorizedExecution,
  type BrokerAuthorityPorts
} from './authority.ts';
import {
  validateBrokerOperationOutcome,
  type BrokerOperationContext,
  type BrokerOperationOutcome,
  type BrokerOperationPort
} from './operation.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { brokerErr, brokerOk, type BrokerIssue, type BrokerIssues, type BrokerResult } from './result.ts';

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
  executeToTerminal: (
    execution: AuthorizedExecution,
    nowMs: number,
    context?: BrokerOperationContext
  ) => Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>>;
}>;

export type RecipeExecutionOperationDependencies = Readonly<{
  authority: BrokerAuthorityPorts;
  executor: AuthorizedRecipeExecutorPort;
  fallback: BrokerOperationPort;
}>;

const authorityDefect = (): BrokerIssue => ({
  code: 'authority-denied',
  message: 'Repository-scoped recipe authority is unavailable.'
});

const executorDefect = (): BrokerIssue => ({
  code: 'receiver-failed',
  message: 'Authorized recipe execution failed.'
});

const fallbackDefect = (): BrokerIssue => ({
  code: 'receiver-failed',
  message: 'Broker fallback operation failed.'
});

const routingDefect = (): BrokerIssue => ({
  code: 'request-invalid',
  message: 'Broker operation routing failed closed.'
});

const forwardIssues = <Value>(issues: BrokerIssues): BrokerResult<Value> =>
  brokerErr(issues[0], ...issues.slice(1));

const invokeTask = <Value>(
  effect: () => Promise<BrokerResult<Value>>,
  defect: BrokerIssue
): Promise<BrokerResult<Value>> => Promise.resolve()
  .then(effect)
  .then(
    result => result,
    () => brokerErr(defect)
  );

const projectTask = <Input, Output>(
  task: Promise<BrokerResult<Input>>,
  project: (value: Input) => BrokerResult<Output>,
  defect: BrokerIssue
): Promise<BrokerResult<Output>> => task
  .then(result => result.isErr() ? forwardIssues<Output>(result.error) : project(result.value))
  .then(
    result => result,
    () => brokerErr<Output>(defect)
  );

const flatMapTask = <Input, Output>(
  task: Promise<BrokerResult<Input>>,
  project: (value: Input) => Promise<BrokerResult<Output>>,
  defect: BrokerIssue
): Promise<BrokerResult<Output>> => task
  .then(result => result.isErr()
    ? Promise.resolve(forwardIssues<Output>(result.error))
    : project(result.value))
  .then(
    result => result,
    () => brokerErr<Output>(defect)
  );

const isObservableAttemptId = (value: unknown): value is ProcessAttemptId =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);

const isRecipeLifecycle = (value: unknown): value is RecipeLifecycle =>
  value === 'one-shot' || value === 'long-lived' || value === 'service';

const isTerminalState = (value: unknown): value is RecipeExecutionTerminalState =>
  value === 'succeeded' || value === 'failed' || value === 'cancelled';

const validExitCode = (state: RecipeExecutionTerminalState, value: unknown): value is number | null =>
  state === 'succeeded'
    ? value === 0
    : state === 'failed'
      ? Number.isSafeInteger(value) && typeof value === 'number' && value !== 0
      : value === null || (Number.isSafeInteger(value) && typeof value === 'number');

const validateCompletion = (
  execution: AuthorizedExecution,
  completion: AuthorizedRecipeExecutionCompletion
): BrokerResult<AuthorizedRecipeExecutionCompletion> => {
  const expectedLifecycle = execution.recipe.admittedRecipe.semantic.lifecycle;
  return isObservableAttemptId(completion.attemptId) && isRecipeLifecycle(completion.lifecycle) &&
    isTerminalState(completion.state) && validExitCode(completion.state, completion.exitCode) &&
    completion.lifecycle === expectedLifecycle
    ? brokerOk({
        attemptId: completion.attemptId,
        lifecycle: completion.lifecycle,
        state: completion.state,
        exitCode: completion.exitCode,
        cleanup: 'complete'
      })
    : brokerErr(executorDefect());
};

const terminalOutcome = (
  completion: AuthorizedRecipeExecutionCompletion
): BrokerResult<BrokerOperationOutcome> => {
  const attemptId = parseBrokerAttemptId(completion.attemptId);
  return attemptId.isErr()
    ? brokerErr(executorDefect())
    : validateBrokerOperationOutcome({
        outcome: completion.state === 'succeeded' ? 'success' : 'failure',
        code: completion.state === 'succeeded'
          ? 'recipe-execution-succeeded'
          : completion.state === 'cancelled'
            ? 'request-cancelled'
            : 'recipe-execution-failed',
        message: completion.state === 'succeeded'
          ? 'Authorized recipe execution completed successfully.'
          : completion.state === 'cancelled'
            ? 'Authorized recipe execution was cancelled and cleaned up.'
            : 'Authorized recipe execution failed and was cleaned up.',
        progress: [
          {
            phase: 'authority',
            detail: 'Repository-scoped recipe authority was admitted.'
          },
          {
            phase: 'execution-attempt',
            detail: `Attempt ${completion.attemptId} completed ${completion.state}; lifecycle ${completion.lifecycle}.`
          }
        ],
        attemptId: attemptId.value
      });
};

const executeAuthorizedExecution = (
  execution: AuthorizedExecution,
  nowMs: number,
  executor: AuthorizedRecipeExecutorPort,
  context?: BrokerOperationContext
): Promise<BrokerResult<BrokerOperationOutcome>> => projectTask(
  invokeTask(() => executor.executeToTerminal(execution, nowMs, context), executorDefect()),
  completion => validateCompletion(execution, completion).andThen(terminalOutcome),
  executorDefect()
);

const executeRecipe = (
  request: BrokerRequestMessage,
  nowMs: number,
  dependencies: RecipeExecutionOperationDependencies,
  context?: BrokerOperationContext
): Promise<BrokerResult<BrokerOperationOutcome>> => flatMapTask(
  invokeTask(
    () => resolveAndAuthorizeExecution(request, nowMs, dependencies.authority),
    authorityDefect()
  ),
  execution => executeAuthorizedExecution(execution, nowMs, dependencies.executor, context),
  authorityDefect()
);

const executeFallback = (
  request: BrokerRequestMessage,
  nowMs: number,
  fallback: BrokerOperationPort,
  context?: BrokerOperationContext
): Promise<BrokerResult<BrokerOperationOutcome>> => projectTask(
  invokeTask(() => fallback.execute(request, nowMs, context), fallbackDefect()),
  validateBrokerOperationOutcome,
  fallbackDefect()
);

const executeRoutedOperation = (
  request: BrokerRequestMessage,
  nowMs: number,
  dependencies: RecipeExecutionOperationDependencies,
  context?: BrokerOperationContext
): Promise<BrokerResult<BrokerOperationOutcome>> => Number.isSafeInteger(nowMs) && nowMs >= 0
  ? request.payload.operation === 'execute-recipe'
    ? executeRecipe(request, nowMs, dependencies, context)
    : executeFallback(request, nowMs, dependencies.fallback, context)
  : Promise.resolve(brokerErr({ code: 'request-invalid', message: 'Broker operation timestamp is invalid.' }));

export const createRecipeExecutionOperationPort = (
  dependencies: RecipeExecutionOperationDependencies
): BrokerOperationPort => ({
  execute: (request, nowMs, context) => Promise.resolve()
    .then(() => executeRoutedOperation(request, nowMs, dependencies, context))
    .then(
      result => result,
      () => brokerErr(routingDefect())
    )
});
