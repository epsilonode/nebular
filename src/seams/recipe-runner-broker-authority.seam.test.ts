import { describe, expect, it } from 'vitest';

import {
  brokerTaskOk,
  parseCanonicalRepository,
  parseCredentialSlotId as parseBrokerCredentialSlotId,
  parseGrantId,
  parseRecipeRevision as parseBrokerRecipeRevision,
  resolveAndAuthorizeExecution,
  type BrokerAuthorityPorts
} from '../broker/public.ts';
import {
  buildExecuteRecipeRequest,
  decodeAndAdmitRecipeXml,
  parseRecipeRelativePath,
  parseRecipeRevision as parseRunnerRecipeRevision
} from '../recipe-runner/public.ts';

const xml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const runnerRequest = (revisionValue: string) => {
  const recipe = decodeAndAdmitRecipeXml(xml);
  const path = parseRecipeRelativePath('recipes/weather.xml');
  const revision = parseRunnerRecipeRevision(revisionValue);
  if (recipe.isErr() || path.isErr() || revision.isErr()) throw new Error('typed runner fixture construction failed');
  const request = buildExecuteRecipeRequest({
    recipe: recipe.value,
    repositoryPathHint: 'R:/Code/weather-caller-alias',
    recipePathHint: path.value,
    recipeRevision: revision.value,
    requestId: 'request-1',
    sequence: 0,
    sentAtMs: 1000
  });
  if (request.isErr()) throw new Error('typed runner request construction failed');
  return request.value;
};

const authorityPorts = (grantReads: string[]): BrokerAuthorityPorts => {
  const repository = parseCanonicalRepository('R:/Code/weather');
  const revision = parseBrokerRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slot = parseBrokerCredentialSlotId('weather-api');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slot.isErr()) throw new Error('typed broker fixture construction failed');
  return {
    canonicalizeRepository: () => brokerTaskOk(repository.value),
    resolveRecipe: canonicalRepository => brokerTaskOk({
      repository: canonicalRepository,
      relativePath: 'recipes/weather.xml',
      revision: revision.value,
      credentialSlotIds: [slot.value]
    }),
    readGrant: (canonicalRepository, recipeRevision) => {
      grantReads.push(`${canonicalRepository}:${recipeRevision}`);
      return brokerTaskOk({
        id: grantId.value,
        repository: canonicalRepository,
        recipeRevision,
        credentialSlotIds: [slot.value],
        expiresAtMs: 2000,
        revoked: false
      });
    }
  };
};

describe('recipe-runner to broker authority seam', () => {
  it('keeps runner repository and recipe facts as hints while the broker resolves authority', async () => {
    const grantReads: string[] = [];
    const result = await resolveAndAuthorizeExecution(runnerRequest('revision-1'), 1000, authorityPorts(grantReads));
    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        admittedSlotIds: ['weather-api'],
        recipe: expect.objectContaining({ repository: 'R:/Code/weather' })
      })
    }));
    expect(grantReads).toEqual(['R:/Code/weather:revision-1']);
  });

  it('rejects caller revision drift before reading a grant', async () => {
    const grantReads: string[] = [];
    const result = await resolveAndAuthorizeExecution(runnerRequest('revision-stale'), 1000, authorityPorts(grantReads));
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'recipe-drift' })] }));
    expect(grantReads).toEqual([]);
  });
});
