import {
  decodeBrokerControlMessage,
  type BrokerClientIssue,
  type BrokerClientIssues,
  type BrokerClientResult,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  recipeErr,
  recipeOk,
  type AdmittedRecipe,
  type RecipeRelativePath,
  type RecipeRevision,
  type RecipeRunnerIssues,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';

export type ExecuteRecipeRequestInput = Readonly<{
  recipe: AdmittedRecipe;
  grantIdHint: string;
  repositoryPathHint: string;
  recipePathHint: RecipeRelativePath;
  recipeRevision: RecipeRevision;
  requestId: string;
  sequence: number;
  sentAtMs: number;
}>;

const clientIssue = (issue: BrokerClientIssue) => ({
  code: 'client-contract-invalid' as const,
  message: issue.message,
  ...(issue.path === undefined ? {} : { path: issue.path })
});

const clientIssues = (issues: BrokerClientIssues): RecipeRunnerIssues => {
  const first = clientIssue(issues[0]);
  const rest: readonly ReturnType<typeof clientIssue>[] = issues.slice(1).map(clientIssue);
  return [first, ...rest];
};

const projectClientIssues = <T>(result: BrokerClientResult<T>): RecipeRunnerResult<T> =>
  result.mapErr(clientIssues);

export const buildExecuteRecipeRequest = (
  input: ExecuteRecipeRequestInput
): RecipeRunnerResult<BrokerRequestMessage> => {
  if (input.repositoryPathHint.length === 0 || input.repositoryPathHint.length > 4096 || input.repositoryPathHint.includes('\0')) {
    return recipeErr({ code: 'invalid-input', message: 'Repository path hint is invalid.' });
  }
  return projectClientIssues(decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: input.requestId,
    sequence: input.sequence,
    sentAtMs: input.sentAtMs,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: input.grantIdHint,
      repositoryPathHint: input.repositoryPathHint,
      recipePathHint: input.recipePathHint.value,
      recipeRevision: input.recipeRevision.value,
      credentialSlotIds: input.recipe.semantic.credentialSlots.map(slot => slot.id.value)
    }
  })).andThen(message => message.messageKind === 'request'
    ? recipeOk(message)
    : recipeErr({ code: 'client-contract-invalid', message: 'Broker request projection returned the wrong message kind.' }));
};
