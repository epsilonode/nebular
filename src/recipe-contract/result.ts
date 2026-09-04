import { err, ok, Result, type Result as NeverthrowResult } from 'neverthrow';

export type RecipeRunnerIssueCode =
  | 'client-contract-invalid'
  | 'digest-failed'
  | 'inheritance-unresolved'
  | 'invalid-input'
  | 'invalid-recipe'
  | 'invalid-xml'
  | 'resource-limit'
  | 'unsafe-recipe'
  | 'unknown-field'
  | 'unsupported-schema';

export type RecipeRunnerIssue = Readonly<{
  code: RecipeRunnerIssueCode;
  message: string;
  path?: readonly (string | number)[];
}>;

export type RecipeRunnerIssues = readonly [RecipeRunnerIssue, ...RecipeRunnerIssue[]];
export type RecipeRunnerResult<T> = NeverthrowResult<T, RecipeRunnerIssues>;

export const recipeOk = <T>(value: T): RecipeRunnerResult<T> => ok(value);

export const recipeErr = <T = never>(
  issue: RecipeRunnerIssue,
  ...rest: readonly RecipeRunnerIssue[]
): RecipeRunnerResult<T> => err([issue, ...rest]);

export const recipeTry = <T>(
  operation: () => T,
  issue: RecipeRunnerIssue
): RecipeRunnerResult<T> => Result.fromThrowable(operation, () => [issue] as const)();
