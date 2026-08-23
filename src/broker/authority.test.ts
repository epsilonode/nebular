import { describe, expect, it } from 'vitest';

import type { BrokerRequestMessage } from '../broker-client/public.ts';
import {
  authorizeExecution,
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type BrokerGrant,
  type ResolvedRecipe
} from './public.ts';

const facts = (): Readonly<{ request: BrokerRequestMessage; recipe: ResolvedRecipe; grant: BrokerGrant }> => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slot = parseCredentialSlotId('weather-api');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slot.isErr()) throw new Error('typed fixture construction failed');
  return {
    request: {
      protocolVersion: 1,
      messageKind: 'request',
      requestId: 'request-1' as BrokerRequestMessage['requestId'],
      sequence: 0 as BrokerRequestMessage['sequence'],
      sentAtMs: 1000 as BrokerRequestMessage['sentAtMs'],
      payload: {
        operation: 'execute-recipe',
        repositoryPathHint: repository.value,
        recipePathHint: 'recipe.xml',
        recipeRevision: revision.value,
        credentialSlotIds: [slot.value]
      }
    },
    recipe: { repository: repository.value, relativePath: 'recipe.xml', revision: revision.value, credentialSlotIds: [slot.value] },
    grant: {
      id: grantId.value,
      repository: repository.value,
      recipeRevision: revision.value,
      credentialSlotIds: [slot.value],
      expiresAtMs: 2000,
      revoked: false
    }
  };
};

describe('repository-scoped recipe authority', () => {
  it('admits only the intersection of recipe and unexpired grant slots', () => {
    const fixture = facts();
    expect(authorizeExecution(fixture.request, fixture.recipe, fixture.grant, 1000)).toEqual(expect.objectContaining({
      value: expect.objectContaining({ admittedSlotIds: fixture.recipe.credentialSlotIds })
    }));
  });

  it('rejects expiration and slot widening as typed denials', () => {
    const fixture = facts();
    expect(authorizeExecution(fixture.request, fixture.recipe, fixture.grant, 2000)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'grant-expired' })]
    }));
    expect(authorizeExecution(
      { ...fixture.request, payload: { ...fixture.request.payload, credentialSlotIds: ['other-slot'] } },
      fixture.recipe,
      fixture.grant,
      1000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'authority-denied' })] }));
  });
});
