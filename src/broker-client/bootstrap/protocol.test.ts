import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES,
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapAcknowledgement,
  createBootstrapRequest,
  decodeBootstrapProtocolJson,
  decodeBootstrapProtocolMessage,
  type BootstrapDeliveryMessage,
  type BootstrapProtocolMessage,
  type BootstrapRequestMessage
} from './protocol.ts';

const required = <T>(result: ReturnType<typeof decodeBootstrapProtocolMessage>): T => {
  if (result.isErr()) throw new Error('expected valid bootstrap protocol fixture');
  return result.value as T;
};

const request = (): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-1',
    repository: 'R:/Code/example',
    recipeRevision: 'recipe-revision-1',
    grantId: 'grant-1',
    grantGeneration: 3,
    receiverId: 'pm2',
    processAttemptId: 'attempt-1',
    slots: [{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' }]
  });
  if (created.isErr()) throw new Error('expected valid bootstrap request fixture');
  return created.value;
};

const deliveryWire = (secret: string): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-delivery',
  exchangeId: 'bootstrap-1',
  payload: {
    leaseId: 'lease-1',
    processAttemptId: 'attempt-1',
    expiresAtMs: 2_000,
    slots: [{
      slotId: 'weather-api',
      environmentName: 'WEATHER_API_TOKEN',
      secret
    }]
  }
});

describe('closed cooperative bootstrap protocol', () => {
  it('constructs authority, attempt, and declared-slot requests', () => {
    expect(request()).toEqual({
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-request',
      exchangeId: { kind: 'bootstrap-exchange-id', value: 'bootstrap-1' },
      payload: {
        authority: {
          repository: { kind: 'bootstrap-repository', value: 'R:/Code/example' },
          recipeRevision: { kind: 'bootstrap-recipe-revision', value: 'recipe-revision-1' },
          grantId: { kind: 'bootstrap-grant-id', value: 'grant-1' },
          grantGeneration: 3
        },
        attempt: {
          receiverId: { kind: 'bootstrap-receiver-id', value: 'pm2' },
          processAttemptId: { kind: 'bootstrap-process-attempt-id', value: 'attempt-1' }
        },
        slots: [{
          slotId: { kind: 'bootstrap-slot-id', value: 'weather-api' },
          environmentName: 'WEATHER_API_TOKEN'
        }]
      }
    });
  });

  it('decodes a bounded delivery into callback-only secret capabilities', () => {
    const canary = 'SECRET_CANARY_PROTOCOL';
    const decoded = decodeBootstrapProtocolMessage(deliveryWire(canary));
    if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-delivery') {
      throw new Error('expected decoded bootstrap delivery');
    }
    const observed = decoded.value.payload.secrets.slots[0]?.secret.withValue(value => value);

    expect(observed).toBe(canary);
    expect(JSON.stringify(decoded.value)).not.toContain(canary);
    expect(JSON.stringify(decoded.value.payload.secrets)).not.toContain(canary);
  });

  it('constructs acknowledgements containing only redacted slot facts', () => {
    const decoded = required<BootstrapDeliveryMessage>(decodeBootstrapProtocolMessage(deliveryWire('secret')));
    const acknowledged = createBootstrapAcknowledgement({
      exchangeId: decoded.exchangeId,
      leaseId: decoded.payload.leaseId,
      processAttemptId: decoded.payload.processAttemptId,
      installedSlotIds: request().payload.slots.map(slot => slot.slotId)
    });

    expect(acknowledged).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        messageKind: 'bootstrap-acknowledgement',
        payload: expect.objectContaining({
          installedSlotCount: 1,
          installedSlotIds: [{ kind: 'bootstrap-slot-id', value: 'weather-api' }]
        })
      })
    }));
    expect(JSON.stringify(acknowledged)).not.toContain('secret');
  });

  it('admits the closed transient attempt-not-ready rejection without free-form detail', () => {
    expect(decodeBootstrapProtocolMessage({
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-rejected',
      exchangeId: 'bootstrap-1',
      payload: { code: 'attempt-not-ready' }
    })).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        messageKind: 'bootstrap-rejected',
        payload: { code: 'attempt-not-ready' }
      })
    }));
  });

  it('rejects extra fields and free-form failure detail', () => {
    const extraAuthority = {
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-request',
      exchangeId: 'bootstrap-1',
      payload: {
        authority: {
          repository: 'R:/Code/example',
          recipeRevision: 'recipe-revision-1',
          grantId: 'grant-1',
          grantGeneration: 3,
          providerToken: 'must-not-enter-this-protocol-shape'
        },
        attempt: { receiverId: 'pm2', processAttemptId: 'attempt-1' },
        slots: []
      }
    };
    const freeFormFailure = {
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-rejected',
      exchangeId: 'bootstrap-1',
      payload: { code: 'authority-denied', detail: 'SECRET_CANARY_FAILURE' }
    };

    expect(decodeBootstrapProtocolMessage(extraAuthority)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'invalid-input' })]
    }));
    expect(decodeBootstrapProtocolMessage(freeFormFailure)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'invalid-input' })]
    }));
  });

  it('rejects oversized, cyclic, malformed, and version-mismatched messages', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const oversized = JSON.stringify({
      ...deliveryWire('small') as Record<string, unknown>,
      padding: 'x'.repeat(BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES)
    });
    const wrongVersion = {
      ...deliveryWire('small') as Record<string, unknown>,
      protocolVersion: 'epsilonode.bootstrap/v2'
    };

    expect(decodeBootstrapProtocolMessage(cycle)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'message-too-large' })]
    }));
    expect(decodeBootstrapProtocolJson(oversized)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'message-too-large' })]
    }));
    expect(decodeBootstrapProtocolJson('{broken')).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'invalid-input' })]
    }));
    expect(decodeBootstrapProtocolMessage(wrongVersion)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'protocol-mismatch' })]
    }));
  });

  it('admits only the closed bootstrap message family', () => {
    const ordinaryControlLookalike = {
      protocolVersion: 1,
      messageKind: 'request',
      requestId: 'ordinary-control-1',
      sequence: 0,
      sentAtMs: 1_000,
      payload: { operation: 'doctor', credentialSlotIds: [] }
    };
    const decoded: ReturnType<typeof decodeBootstrapProtocolMessage> =
      decodeBootstrapProtocolMessage(ordinaryControlLookalike);
    const message: BootstrapProtocolMessage | undefined = decoded.isOk() ? decoded.value : undefined;

    expect(message).toBeUndefined();
    expect(decoded).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'invalid-input' })]
    }));
  });
});
