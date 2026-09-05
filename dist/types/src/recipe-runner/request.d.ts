import { type BrokerRequestMessage } from '../broker-client/public.ts';
import { type AdmittedRecipe, type RecipeRelativePath, type RecipeRevision, type RecipeRunnerResult } from '../recipe-contract/public.ts';
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
export declare const buildExecuteRecipeRequest: (input: ExecuteRecipeRequestInput) => RecipeRunnerResult<BrokerRequestMessage>;
