import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  authorizeExecution,
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type BrokerGrant,
  type ResolvedRecipe
} from './public.ts';

type AuthorityFixture = Readonly<{
  request: BrokerRequestMessage;
  recipe: ResolvedRecipe;
  grant: BrokerGrant;
}>;

const buildFixture = (
  slotNames: readonly string[],
  requestedSlotNames: readonly string[],
  expiresAtMs: number
): AuthorityFixture | undefined => {
  const repository = parseCanonicalRepository('R:/Code/property-fixture');
  const revision = parseRecipeRevision('property-revision');
  const grantId = parseGrantId('property-grant');
  const requestId = parseBrokerRequestId('property-request');
  const sequence = parseBrokerSequence(0);
  const sentAtMs = parseBrokerTimestampMs(1);
  const slots = slotNames.flatMap(name => {
    const parsed = parseCredentialSlotId(name);
    return parsed.isOk() ? [parsed.value] : [];
  });
  const requestedSlots = requestedSlotNames.flatMap(name => {
    const parsed = parseCredentialSlotId(name);
    return parsed.isOk() ? [parsed.value] : [];
  });
  if (repository.isErr() || revision.isErr() || grantId.isErr() || requestId.isErr() ||
      sequence.isErr() || sentAtMs.isErr() || slots.length !== slotNames.length ||
      requestedSlots.length !== requestedSlotNames.length) return undefined;

  const recipe: ResolvedRecipe = {
    repository: repository.value,
    relativePath: 'recipe.xml',
    revision: revision.value,
    credentialSlotIds: slots
  };
  const grant: BrokerGrant = {
    id: grantId.value,
    repository: repository.value,
    recipeRevision: revision.value,
    credentialSlotIds: slots,
    expiresAtMs,
    revoked: false
  };
  return {
    recipe,
    grant,
    request: {
      protocolVersion: 1,
      messageKind: 'request',
      requestId: requestId.value,
      sequence: sequence.value,
      sentAtMs: sentAtMs.value,
      payload: {
        operation: 'execute-recipe',
        repositoryPathHint: repository.value,
        recipePathHint: recipe.relativePath,
        recipeRevision: revision.value,
        credentialSlotIds: requestedSlots
      }
    }
  };
};

const slotSet = fc.uniqueArray(
  fc.integer({ min: 0, max: 10_000 }).map(value => `slot-${value}`),
  { minLength: 1, maxLength: 16 }
);

describe('repository authority laws', () => {
  it('is invariant to request ordering and duplicate slot claims', () => {
    fc.assert(fc.property(slotSet, slots => {
      const requested = [...slots.toReversed(), slots[0] ?? 'slot-0'];
      const fixture = buildFixture(slots, requested, 2_000);
      expect(fixture).toBeDefined();
      if (fixture === undefined) return;
      expect(authorizeExecution(fixture.request, fixture.recipe, fixture.grant, 1_000).isOk()).toBe(true);
    }));
  });

  it('rejects every strict slot widening and treats expiry as an exclusive boundary', () => {
    fc.assert(fc.property(slotSet, fc.integer({ min: 1, max: 1_000_000 }), (slots, expiresAtMs) => {
      const widened = [...slots, `other-${expiresAtMs}`];
      const fixture = buildFixture(slots, widened, expiresAtMs);
      expect(fixture).toBeDefined();
      if (fixture === undefined) return;
      expect(authorizeExecution(fixture.request, fixture.recipe, fixture.grant, expiresAtMs - 1).isErr()).toBe(true);

      const exact = buildFixture(slots, slots, expiresAtMs);
      expect(exact).toBeDefined();
      if (exact === undefined) return;
      expect(authorizeExecution(exact.request, exact.recipe, exact.grant, expiresAtMs - 1).isOk()).toBe(true);
      expect(authorizeExecution(exact.request, exact.recipe, exact.grant, expiresAtMs).isErr()).toBe(true);
    }));
  });
});
