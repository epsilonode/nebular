import { describe, expect, it } from 'vitest';

import {
  decodeBrokerControlMessage,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import { decodeAndAdmitRecipeXml } from '../recipe-contract/public.ts';
import {
  authorityTaskOk,
  parseCanonicalRepository,
  parseCredentialReference,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  resolveAndAuthorizeExecution,
  type BrokerAuthorityPorts
} from '../broker/public.ts';

const recipeXml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const request = (revision = 'revision-1'): BrokerRequestMessage => {
  const requestId = parseBrokerRequestId('request-1');
  const sequence = parseBrokerSequence(0);
  const sentAtMs = parseBrokerTimestampMs(1000);
  if (requestId.isErr() || sequence.isErr() || sentAtMs.isErr()) throw new Error('typed fixture construction failed');
  const decoded = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: requestId.value,
    sequence: sequence.value,
    sentAtMs: sentAtMs.value,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Code/example-alias',
      recipePathHint: 'caller/recipe-alias.xml',
      recipeRevision: revision,
      credentialSlotIds: ['weather-api']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('request decode failed');
  return decoded.value;
};

type HintObservations = Readonly<{
  repositoryHints: string[];
  recipeHints: string[];
}>;

const ports = (grantReads: string[], hints?: HintObservations): BrokerAuthorityPorts => {
  const recipe = decodeAndAdmitRecipeXml(recipeXml);
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slot = parseCredentialSlotId('weather-api');
  const credentialReference = parseCredentialReference('credential-weather');
  if (recipe.isErr() || repository.isErr() || revision.isErr() || grantId.isErr() || slot.isErr() ||
      credentialReference.isErr()) throw new Error('typed fixture construction failed');
  return {
    canonicalizeRepository: pathHint => {
      hints?.repositoryHints.push(pathHint);
      return authorityTaskOk(repository.value);
    },
    resolveRecipe: (canonicalRepository, recipePathHint) => {
      hints?.recipeHints.push(recipePathHint);
      return authorityTaskOk({
        repository: canonicalRepository,
        relativePath: 'recipe.xml',
        revision: revision.value,
        credentialSlotIds: [slot.value],
        admittedRecipe: recipe.value
      });
    },
    readGrant: selectedGrantId => {
      grantReads.push(selectedGrantId);
      return authorityTaskOk({
        id: grantId.value,
        generation: 1,
        repository: repository.value,
        recipeRevision: revision.value,
        credentialBindings: [{ slotId: slot.value, credentialReference: credentialReference.value }],
        expiresAtMs: 2000,
        revoked: false
      });
    }
  };
};

describe('broker client to broker authority seam', () => {
  it('treats client paths as hints and authorizes only broker-resolved facts', async () => {
    const grantReads: string[] = [];
    const hints: HintObservations = { repositoryHints: [], recipeHints: [] };
    const result = await resolveAndAuthorizeExecution(request(), 1000, ports(grantReads, hints));
    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        admittedSlotIds: ['weather-api'],
        recipe: expect.objectContaining({ repository: 'R:/Code/example', relativePath: 'recipe.xml' })
      })
    }));
    expect(hints).toEqual({
      repositoryHints: ['R:/Code/example-alias'],
      recipeHints: ['caller/recipe-alias.xml']
    });
    expect(grantReads).toEqual(['grant-1']);
  });

  it('rejects recipe drift before consulting grant authority', async () => {
    const grantReads: string[] = [];
    const result = await resolveAndAuthorizeExecution(request('caller-stale-revision'), 1000, ports(grantReads));
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'recipe-drift' })] }));
    expect(grantReads).toEqual([]);
  });
});
