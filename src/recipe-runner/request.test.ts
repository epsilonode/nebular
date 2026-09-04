import { describe, expect, it } from 'vitest';

import {
  buildExecuteRecipeRequest,
  decodeAndAdmitRecipeXml,
  parseRecipeRelativePath,
  parseRecipeRevision
} from './public.ts';

const xml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

describe('recipe-runner request construction', () => {
  it('projects only admitted recipe hints and declared credential slots into broker IPC', () => {
    const recipe = decodeAndAdmitRecipeXml(xml);
    const path = parseRecipeRelativePath('recipes/weather.xml');
    const revision = parseRecipeRevision('revision-1');
    if (recipe.isErr() || path.isErr() || revision.isErr()) throw new Error('typed fixture construction failed');
    const request = buildExecuteRecipeRequest({
      recipe: recipe.value,
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Code/weather',
      recipePathHint: path.value,
      recipeRevision: revision.value,
      requestId: 'request-1',
      sequence: 0,
      sentAtMs: 1000
    });
    expect(request).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        messageKind: 'request',
        payload: expect.objectContaining({
          operation: 'execute-recipe',
          grantIdHint: 'grant-1',
          credentialSlotIds: ['weather-api']
        })
      })
    }));
  });

  it('rejects invalid hints and broker envelope facts as typed failures', () => {
    const recipe = decodeAndAdmitRecipeXml(xml);
    const path = parseRecipeRelativePath('recipes/weather.xml');
    const revision = parseRecipeRevision('revision-1');
    if (recipe.isErr() || path.isErr() || revision.isErr()) throw new Error('typed fixture construction failed');
    expect(buildExecuteRecipeRequest({
      recipe: recipe.value,
      grantIdHint: 'grant-1',
      repositoryPathHint: '',
      recipePathHint: path.value,
      recipeRevision: revision.value,
      requestId: 'request-1',
      sequence: 0,
      sentAtMs: 1000
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'invalid-input' })] }));
    expect(buildExecuteRecipeRequest({
      recipe: recipe.value,
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Code/weather',
      recipePathHint: path.value,
      recipeRevision: revision.value,
      requestId: 'invalid request id',
      sequence: 0,
      sentAtMs: 1000
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'client-contract-invalid' })] }));
    expect(buildExecuteRecipeRequest({
      recipe: recipe.value,
      grantIdHint: 'x'.repeat(129),
      repositoryPathHint: 'R:/Code/weather',
      recipePathHint: path.value,
      recipeRevision: revision.value,
      requestId: 'request-1',
      sequence: 0,
      sentAtMs: 1000
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'client-contract-invalid' })] }));
  });
});
