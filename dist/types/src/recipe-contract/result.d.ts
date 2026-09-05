import { type Result as NeverthrowResult } from 'neverthrow';
export type RecipeRunnerIssueCode = 'client-contract-invalid' | 'digest-failed' | 'inheritance-unresolved' | 'invalid-input' | 'invalid-recipe' | 'invalid-xml' | 'resource-limit' | 'unsafe-recipe' | 'unknown-field' | 'unsupported-schema';
export type RecipeRunnerIssue = Readonly<{
    code: RecipeRunnerIssueCode;
    message: string;
    path?: readonly (string | number)[];
}>;
export type RecipeRunnerIssues = readonly [RecipeRunnerIssue, ...RecipeRunnerIssue[]];
export type RecipeRunnerResult<T> = NeverthrowResult<T, RecipeRunnerIssues>;
export declare const recipeOk: <T>(value: T) => RecipeRunnerResult<T>;
export declare const recipeErr: <T = never>(issue: RecipeRunnerIssue, ...rest: readonly RecipeRunnerIssue[]) => RecipeRunnerResult<T>;
export declare const recipeTry: <T>(operation: () => T, issue: RecipeRunnerIssue) => RecipeRunnerResult<T>;
