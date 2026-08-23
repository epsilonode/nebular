import { describe, expect, it } from 'vitest';

import {
  decodeBrokerControlMessage,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  brokerTaskOk,
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  resolveAndAuthorizeExecution,
  type BrokerAuthorityPorts
} from '../broker/public.ts';

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
      repositoryPathHint: 'R:/Code/example-alias',
      recipePathHint: 'recipe.xml',
      recipeRevision: revision,
      credentialSlotIds: ['weather-api']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('request decode failed');
  return decoded.value;
};

const ports = (grantReads: string[]): BrokerAuthorityPorts => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slot = parseCredentialSlotId('weather-api');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slot.isErr()) throw new Error('typed fixture construction failed');
  return {
    canonicalizeRepository: () => brokerTaskOk(repository.value),
    resolveRecipe: canonicalRepository => brokerTaskOk({
      repository: canonicalRepository,
      relativePath: 'recipe.xml',
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

describe('broker client to broker authority seam', () => {
  it('treats client paths as hints and authorizes only broker-resolved facts', async () => {
    const grantReads: string[] = [];
    const result = await resolveAndAuthorizeExecution(request(), 1000, ports(grantReads));
    expect(result).toEqual(expect.objectContaining({ value: expect.objectContaining({ admittedSlotIds: ['weather-api'] }) }));
    expect(grantReads).toEqual(['R:/Code/example:revision-1']);
  });

  it('rejects recipe drift before consulting grant authority', async () => {
    const grantReads: string[] = [];
    const result = await resolveAndAuthorizeExecution(request('caller-stale-revision'), 1000, ports(grantReads));
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'recipe-drift' })] }));
    expect(grantReads).toEqual([]);
  });
});
