import { describe, expect, it } from 'vitest';

import type { BrokerRequestMessage } from '../broker-client/public.ts';
import { decodeAndAdmitRecipeXml, type AdmittedRecipe } from '../recipe-contract/public.ts';
import {
  authorityTaskOk,
  authorizeExecution,
  parseCanonicalRepository,
  parseCredentialReference,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  resolveAndAuthorizeExecution,
  type BrokerAuthorityPorts,
  type BrokerGrant,
  type ResolvedRecipe
} from './public.ts';

const recipeXml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const admittedRecipe = (): AdmittedRecipe => {
  const decoded = decodeAndAdmitRecipeXml(recipeXml);
  if (decoded.isErr()) throw new Error('admitted recipe fixture construction failed');
  return decoded.value;
};

const facts = (): Readonly<{ request: BrokerRequestMessage; recipe: ResolvedRecipe; grant: BrokerGrant }> => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slot = parseCredentialSlotId('weather-api');
  const credentialReference = parseCredentialReference('credential-weather');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slot.isErr() || credentialReference.isErr()) {
    throw new Error('typed fixture construction failed');
  }
  return {
    request: {
      protocolVersion: 1,
      messageKind: 'request',
      requestId: 'request-1' as BrokerRequestMessage['requestId'],
      sequence: 0 as BrokerRequestMessage['sequence'],
      sentAtMs: 1000 as BrokerRequestMessage['sentAtMs'],
      payload: {
        operation: 'execute-recipe',
        grantIdHint: grantId.value,
        repositoryPathHint: repository.value,
        recipePathHint: 'recipe.xml',
        recipeRevision: revision.value,
        credentialSlotIds: [slot.value]
      }
    },
    recipe: {
      repository: repository.value,
      relativePath: 'recipe.xml',
      revision: revision.value,
      credentialSlotIds: [slot.value],
      admittedRecipe: admittedRecipe()
    },
    grant: {
      id: grantId.value,
      generation: 1,
      repository: repository.value,
      recipeRevision: revision.value,
      credentialBindings: [{ slotId: slot.value, credentialReference: credentialReference.value }],
      expiresAtMs: 2000,
      revoked: false
    }
  };
};

const authorityPorts = (
  fixture: Readonly<{ recipe: ResolvedRecipe; grant: BrokerGrant }>
): BrokerAuthorityPorts => ({
  canonicalizeRepository: () => authorityTaskOk(fixture.recipe.repository),
  resolveRecipe: () => authorityTaskOk(fixture.recipe),
  readGrant: () => authorityTaskOk(fixture.grant)
});

describe('repository-scoped recipe authority', () => {
  it('admits exact grant generation and slots while redacting credential references', () => {
    const fixture = facts();
    const result = authorizeExecution(fixture.request, fixture.recipe, fixture.grant, 1000);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.admittedSlotIds).toEqual(fixture.recipe.credentialSlotIds);
    expect(result.value.grant).toEqual({
      id: fixture.grant.id,
      generation: 1,
      repository: fixture.grant.repository,
      recipeRevision: fixture.grant.recipeRevision,
      credentialSlotIds: fixture.recipe.credentialSlotIds,
      expiresAtMs: 2000,
      revoked: false
    });
    expect(JSON.stringify(result.value.grant)).not.toContain('credential-weather');
    expect('credentialBindings' in result.value.grant).toBe(false);
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

  it('composes authority lookups as a plain Promise of the broker result', async () => {
    const fixture = facts();
    const selectedGrantIds: string[] = [];
    const ports: BrokerAuthorityPorts = {
      ...authorityPorts(fixture),
      readGrant: grantId => {
        selectedGrantIds.push(grantId);
        return authorityTaskOk(fixture.grant);
      }
    };
    const task = resolveAndAuthorizeExecution(fixture.request, 1000, ports);

    expect(task).toBeInstanceOf(Promise);
    const result = await task;
    expect(result.isOk() ? result.value.admittedSlotIds : []).toEqual(fixture.recipe.credentialSlotIds);
    expect(selectedGrantIds).toEqual(['grant-1']);
  });

  it('denies a journal record whose identity differs from the selected grant', () => {
    const fixture = facts();
    const otherGrant = parseGrantId('grant-other');
    if (otherGrant.isErr()) throw new Error('typed fixture construction failed');

    expect(authorizeExecution(
      fixture.request,
      fixture.recipe,
      { ...fixture.grant, id: otherGrant.value },
      1000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'authority-denied' })] }));
  });

  it('independently denies every grant authority mismatch', () => {
    const fixture = facts();
    const otherRepository = parseCanonicalRepository('R:/Code/other');
    const otherRevision = parseRecipeRevision('revision-other');
    const otherSlot = parseCredentialSlotId('other-slot');
    if (otherRepository.isErr() || otherRevision.isErr() || otherSlot.isErr()) {
      throw new Error('typed fixture construction failed');
    }
    const mismatches: readonly BrokerGrant[] = [
      { ...fixture.grant, generation: 0 },
      { ...fixture.grant, generation: 1.5 },
      { ...fixture.grant, generation: Number.MAX_SAFE_INTEGER + 1 },
      { ...fixture.grant, repository: otherRepository.value },
      { ...fixture.grant, recipeRevision: otherRevision.value },
      {
        ...fixture.grant,
        credentialBindings: [{
          slotId: otherSlot.value,
          credentialReference: fixture.grant.credentialBindings[0].credentialReference
        }]
      },
      {
        ...fixture.grant,
        credentialBindings: [
          fixture.grant.credentialBindings[0],
          fixture.grant.credentialBindings[0]
        ]
      },
      { ...fixture.grant, revoked: true }
    ];

    mismatches.forEach(grant => expect(authorizeExecution(
      fixture.request,
      fixture.recipe,
      grant,
      1000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'authority-denied' })] })));
  });

  it('denies a resolver projection whose slot list differs from its admitted recipe facts', () => {
    const fixture = facts();

    expect(authorizeExecution(
      fixture.request,
      { ...fixture.recipe, credentialSlotIds: [] },
      fixture.grant,
      1000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'authority-denied' })] }));
  });

  it('turns a synchronous authority-port defect into one redacted typed denial', async () => {
    const fixture = facts();
    const ports: BrokerAuthorityPorts = {
      ...authorityPorts(fixture),
      canonicalizeRepository: () => {
        throw new Error('private canonicalizer defect');
      }
    };

    const result = await resolveAndAuthorizeExecution(fixture.request, 1000, ports);

    expect(result.isErr() ? result.error[0] : null).toEqual({
      code: 'authority-denied',
      message: 'Repository-scoped recipe authority is unavailable.'
    });
    expect(JSON.stringify(result)).not.toContain('private canonicalizer defect');
  });

  it('turns a rejected recipe lookup into one redacted typed denial without reading the grant', async () => {
    const fixture = facts();
    let grantReads = 0;
    const ports: BrokerAuthorityPorts = {
      ...authorityPorts(fixture),
      resolveRecipe: () => Promise.reject(new Error('private recipe adapter rejection')),
      readGrant: () => {
        grantReads += 1;
        return authorityTaskOk(fixture.grant);
      }
    };

    const result = await resolveAndAuthorizeExecution(fixture.request, 1000, ports);

    expect(result.isErr() ? result.error[0] : null).toEqual({
      code: 'authority-denied',
      message: 'Repository-scoped recipe authority is unavailable.'
    });
    expect(grantReads).toBe(0);
    expect(JSON.stringify(result)).not.toContain('private recipe adapter rejection');
  });
});
