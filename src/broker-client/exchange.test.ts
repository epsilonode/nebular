import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  BROKER_REQUEST_CANCELLED_CODE,
  decodeBrokerControlMessage,
  openBrokerClientExchange,
  parseBrokerRequestId,
  reduceBrokerClientExchange,
  type BrokerClientExchange,
  type BrokerClientResult,
  type BrokerControlMessage
} from './public.ts';

const unwrap = <T>(result: BrokerClientResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const control = (input: unknown): BrokerControlMessage =>
  unwrap(decodeBrokerControlMessage(input));

const initialExchange = (): BrokerClientExchange =>
  unwrap(openBrokerClientExchange(unwrap(parseBrokerRequestId('exchange-1'))));

const activeExchange = (): BrokerClientExchange => {
  const hello = control({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'hello',
    requestId: 'exchange-1',
    sequence: 0,
    sentAtMs: 1000,
    payload: { buildId: 'broker-test', capabilities: ['request', 'cancel'] }
  });
  const ready = unwrap(reduceBrokerClientExchange(initialExchange(), {
    eventKind: 'control',
    direction: 'broker-to-client',
    message: hello
  }));
  const request = control({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: 'exchange-1',
    sequence: 1,
    sentAtMs: 1001,
    payload: {
      operation: 'execute-recipe',
      repositoryPathHint: 'R:/Code/untrusted-alias',
      recipePathHint: 'recipe.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['weather-api']
    }
  });
  return unwrap(reduceBrokerClientExchange(ready, {
    eventKind: 'control',
    direction: 'client-to-broker',
    message: request
  }));
};

describe('broker client inherited-IPC exchange', () => {
  it('records ordered progress and accepts exactly one correlated terminal result', () => {
    const progress = control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'progress',
      requestId: 'exchange-1',
      sequence: 2,
      sentAtMs: 1002,
      payload: { phase: 'authority-admitted', detail: 'Repository authority admitted.' }
    });
    const progressed = unwrap(reduceBrokerClientExchange(activeExchange(), {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: progress
    }));
    const terminal = control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'terminal-success',
      requestId: 'exchange-1',
      sequence: 3,
      sentAtMs: 1003,
      payload: { code: 'completed', message: 'Execution completed.' }
    });
    const completed = unwrap(reduceBrokerClientExchange(progressed, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: terminal
    }));
    expect(completed).toEqual(expect.objectContaining({
      state: 'terminal',
      progress: [{ phase: 'authority-admitted', detail: 'Repository authority admitted.' }],
      terminal: { outcome: 'success', code: 'completed', message: 'Execution completed.' }
    }));
    expect(reduceBrokerClientExchange(completed, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: { ...terminal, sequence: completed.nextSequence }
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'session-closed' })] }));
  });

  it('makes accepted cancellation an explicit terminal outcome', () => {
    const cancel = control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'cancel',
      requestId: 'exchange-1',
      sequence: 2,
      sentAtMs: 1002,
      payload: { expectedGeneration: 0 }
    });
    const cancelling = unwrap(reduceBrokerClientExchange(activeExchange(), {
      eventKind: 'control',
      direction: 'client-to-broker',
      message: cancel
    }));
    const terminal = control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'terminal-failure',
      requestId: 'exchange-1',
      sequence: 3,
      sentAtMs: 1003,
      payload: { code: BROKER_REQUEST_CANCELLED_CODE, message: 'Cancellation accepted.' }
    });
    expect(unwrap(reduceBrokerClientExchange(cancelling, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: terminal
    }))).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: expect.objectContaining({ outcome: 'cancelled' })
    }));
  });

  it('makes inherited-channel disconnect an explicit terminal outcome', () => {
    expect(unwrap(reduceBrokerClientExchange(activeExchange(), {
      eventKind: 'disconnect',
      reason: 'peer-exit',
      detail: 'Privileged broker exited before completion.'
    }))).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: {
        outcome: 'disconnected',
        reason: 'peer-exit',
        detail: 'Privileged broker exited before completion.'
      }
    }));
  });

  it('rejects wrong-direction and sequence-gap frames', () => {
    const hello = control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'hello',
      requestId: 'exchange-1',
      sequence: 0,
      sentAtMs: 1000,
      payload: { buildId: 'broker-test', capabilities: [] }
    });
    expect(reduceBrokerClientExchange(initialExchange(), {
      eventKind: 'control',
      direction: 'client-to-broker',
      message: hello
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'protocol-mismatch' })] }));
    expect(reduceBrokerClientExchange(initialExchange(), {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: control({ ...hello, sequence: 1 })
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'sequence-invalid' })] }));
  });
});
