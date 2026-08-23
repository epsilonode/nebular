import { describe, expect, it } from 'vitest';

import * as recipeRunner from './recipe-runner.ts';

describe('recipe-runner public entrypoint', () => {
  it('is inert, unprivileged, and exposes only runner contracts', () => {
    expect(Object.keys(recipeRunner).toSorted()).toEqual([
      'RECIPE_CANONICALIZATION',
      'RECIPE_REVISION_DOMAIN',
      'RECIPE_SCHEMA',
      'RECIPE_TIMEOUT_MAX_MS',
      'RECIPE_XML_MAX_ATTRIBUTES',
      'RECIPE_XML_MAX_BYTES',
      'RECIPE_XML_MAX_DEPTH',
      'RECIPE_XML_MAX_ELEMENTS',
      'RECIPE_XML_MAX_TEXT',
      'admitRecipe',
      'buildExecuteRecipeRequest',
      'canonicalRecipeJson',
      'computeRecipeRevision',
      'decodeAndAdmitRecipeXml',
      'decodeRecipeXml',
      'parseAuthorityAtom',
      'parseCredentialSlotId',
      'parseInjectionName',
      'parseProviderEnvironment',
      'parseProviderId',
      'parseRecipeId',
      'parseRecipeRelativePath',
      'parseRecipeRevision',
      'recipeErr',
      'recipeOk',
      'recipeRevisionDigestInput',
      'recipeTry'
    ]);
    expect('Bun' in recipeRunner).toBe(false);
    expect('resolveAndAuthorizeExecution' in recipeRunner).toBe(false);
  });
});
