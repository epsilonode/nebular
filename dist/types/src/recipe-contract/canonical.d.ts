import type { AdmittedRecipe } from './model.ts';
import { type RecipeRevision } from './primitives.ts';
import { type RecipeRunnerResult } from './result.ts';
export declare const RECIPE_REVISION_DOMAIN: "wx.recipe.revision/v1";
export type RecipeRevisionDigestPort = Readonly<{
    sha256: (input: Readonly<Uint8Array>) => RecipeRunnerResult<unknown>;
}>;
export declare const canonicalRecipeJson: (recipe: AdmittedRecipe) => string;
export declare const recipeRevisionDigestInput: (recipe: AdmittedRecipe) => Readonly<Uint8Array>;
export declare const computeRecipeRevision: (recipe: AdmittedRecipe, digest: RecipeRevisionDigestPort) => RecipeRunnerResult<RecipeRevision>;
