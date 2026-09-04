import { describe, expect, it } from 'vitest';

import {
  BROKER_MAX_MESSAGE_BYTES,
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlJson,
  decodeBrokerControlMessage,
  encodeBrokerControlMessage,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerRequestMessage
} from './public.ts';

const requestMessage = (): BrokerRequestMessage => {
  const requestId = parseBrokerRequestId('request-1');
  const sequence = parseBrokerSequence(0);
  const sentAtMs = parseBrokerTimestampMs(1_700_000_000_000);
  if (requestId.isErr() || sequence.isErr() || sentAtMs.isErr()) throw new Error('typed fixture construction failed');
  return {
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: requestId.value,
    sequence: sequence.value,
    sentAtMs: sentAtMs.value,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Code/example',
      recipePathHint: 'recipe.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['weather-api']
    }
  };
};

describe('broker control codec', () => {
  it('round trips a bounded closed request envelope', () => {
    const encoded = encodeBrokerControlMessage(requestMessage());
    expect(encoded.isOk()).toBe(true);
    if (encoded.isErr()) return;
    expect(decodeBrokerControlJson(encoded.value)).toEqual(expect.objectContaining({
      value: expect.objectContaining({ messageKind: 'request' })
    }));
  });

  it('rejects unknown and secret-bearing fields', () => {
    expect(decodeBrokerControlMessage({ ...requestMessage(), secret: 'must-not-cross-control-ipc' }).isErr()).toBe(true);
    expect(decodeBrokerControlMessage({ ...requestMessage(), protocolVersion: 2 }).isErr()).toBe(true);
  });

  it('requires a bounded grant selector only for execute requests', () => {
    const executeWithoutGrant = {
      ...requestMessage(),
      payload: {
        operation: 'execute-recipe',
        credentialSlotIds: []
      }
    };
    expect(decodeBrokerControlMessage(executeWithoutGrant).isErr()).toBe(true);
    expect(decodeBrokerControlMessage({
      ...requestMessage(),
      payload: {
        operation: 'execute-recipe',
        grantIdHint: 'x'.repeat(129),
        credentialSlotIds: []
      }
    }).isErr()).toBe(true);
    expect(decodeBrokerControlMessage({
      ...requestMessage(),
      payload: {
        operation: 'doctor',
        grantIdHint: 'grant-1',
        credentialSlotIds: []
      }
    }).isErr()).toBe(true);
    expect(decodeBrokerControlMessage({
      ...requestMessage(),
      payload: { operation: 'doctor', credentialSlotIds: [] }
    }).isOk()).toBe(true);
  });

  it('rejects oversized JSON before parsing', () => {
    const oversized = `{"payload":"${'x'.repeat(BROKER_MAX_MESSAGE_BYTES)}"}`;
    expect(decodeBrokerControlJson(oversized)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'message-too-large' })]
    }));
  });
});
