import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlJson,
  decodeBrokerControlMessage,
  encodeBrokerControlMessage,
  openBrokerClientExchange,
  parseBrokerRequestId,
  parseBrokerTimestampMs,
  reduceBrokerClientExchange,
  type BrokerCancelMessage,
  type BrokerClientExchange,
  type BrokerClientResult,
  type BrokerControlMessage,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  authorizeExecution,
  brokerOk,
  completeBrokerControlSession,
  disconnectBrokerControlSession,
  handleBrokerControlInput,
  openBrokerControlSession,
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type AuthorizedExecution,
  type BrokerControlAuthority,
  type BrokerControlSession,
  type BrokerResult
} from '../broker/public.ts';

const unwrapClient = <T>(result: BrokerClientResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const unwrapBroker = <T>(result: BrokerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const control = (input: unknown): BrokerControlMessage =>
  unwrapClient(decodeBrokerControlMessage(input));

const roundTrip = (message: BrokerControlMessage): BrokerControlMessage =>
  unwrapClient(decodeBrokerControlJson(unwrapClient(encodeBrokerControlMessage(message))));

const asRequest = (message: BrokerControlMessage): BrokerRequestMessage => {
  if (message.messageKind !== 'request') throw new Error('request frame expected');
  return message;
};

const asCancel = (message: BrokerControlMessage): BrokerCancelMessage => {
  if (message.messageKind !== 'cancel') throw new Error('cancel frame expected');
  return message;
};

const onlyFrame = (messages: readonly BrokerControlMessage[]): BrokerControlMessage => {
  const message = messages[0];
  if (messages.length !== 1 || message === undefined) throw new Error('exactly one frame expected');
  return message;
};

const authorizedExecution = (request: BrokerRequestMessage): AuthorizedExecution => {
  const repository = unwrapBroker(parseCanonicalRepository('R:/Code/canonical'));
  const revision = unwrapBroker(parseRecipeRevision('revision-1'));
  const slot = unwrapBroker(parseCredentialSlotId('weather-api'));
  const grantId = unwrapBroker(parseGrantId('grant-1'));
  return unwrapBroker(authorizeExecution(request, {
    repository,
    relativePath: 'recipe.xml',
    revision,
    credentialSlotIds: [slot]
  }, {
    id: grantId,
    repository,
    recipeRevision: revision,
    credentialSlotIds: [slot],
    expiresAtMs: 2000,
    revoked: false
  }, 1000));
};

const canonicalAuthority: BrokerControlAuthority = {
  authorizeExecution: request => brokerOk(authorizedExecution(request))
};

type ActiveSeam = Readonly<{
  client: BrokerClientExchange;
  broker: BrokerControlSession;
  request: BrokerRequestMessage;
  frames: readonly BrokerControlMessage[];
}>;

const establishActiveSeam = (): ActiveSeam => {
  const requestId = unwrapClient(parseBrokerRequestId('ipc-seam-1'));
  const helloAt = unwrapClient(parseBrokerTimestampMs(1000));
  const progressAt = unwrapClient(parseBrokerTimestampMs(1002));
  const clientOpened = unwrapClient(openBrokerClientExchange(requestId));
  const brokerOpened = unwrapBroker(openBrokerControlSession(
    requestId,
    helloAt,
    'broker-test',
    ['request', 'cancel', 'progress']
  ));
  const hello = roundTrip(brokerOpened.hello);
  const ready = unwrapClient(reduceBrokerClientExchange(clientOpened, {
    eventKind: 'control',
    direction: 'broker-to-client',
    message: hello
  }));
  const request = asRequest(roundTrip(control({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: 'ipc-seam-1',
    sequence: 1,
    sentAtMs: 1001,
    payload: {
      operation: 'execute-recipe',
      repositoryPathHint: 'R:/Code/client-controlled-alias',
      recipePathHint: 'recipe.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['weather-api']
    }
  })));
  const requested = unwrapClient(reduceBrokerClientExchange(ready, {
    eventKind: 'control',
    direction: 'client-to-broker',
    message: request
  }));
  const admitted = unwrapBroker(handleBrokerControlInput(
    brokerOpened.session,
    request,
    1000,
    progressAt,
    canonicalAuthority
  ));
  const progress = roundTrip(onlyFrame(admitted.outbound));
  return {
    client: unwrapClient(reduceBrokerClientExchange(requested, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: progress
    })),
    broker: admitted.session,
    request,
    frames: [hello, request, progress]
  };
};

describe('broker-client to privileged broker inherited-IPC seam', () => {
  it('round-trips handshake, correlated progress, and exactly one terminal result without secret fields', () => {
    const active = establishActiveSeam();
    const completedAt = unwrapClient(parseBrokerTimestampMs(1003));
    const completed = unwrapBroker(completeBrokerControlSession(
      active.broker,
      { outcome: 'success', code: 'completed', message: 'Execution completed.' },
      completedAt
    ));
    const terminal = roundTrip(onlyFrame(completed.outbound));
    const clientTerminal = unwrapClient(reduceBrokerClientExchange(active.client, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: terminal
    }));
    expect(active.request.payload.repositoryPathHint).toBe('R:/Code/client-controlled-alias');
    expect(active.broker).toEqual(expect.objectContaining({
      state: 'active',
      authorized: expect.objectContaining({
        recipe: expect.objectContaining({ repository: 'R:/Code/canonical' })
      })
    }));
    expect(clientTerminal).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: { outcome: 'success', code: 'completed', message: 'Execution completed.' }
    }));
    expect(JSON.stringify([...active.frames, terminal])).not.toMatch(
      /apiKey|accessToken|secretValue|credentialValue|plaintextCredential/iu
    );
    expect(reduceBrokerClientExchange(clientTerminal, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: control({ ...terminal, sequence: clientTerminal.nextSequence })
    })).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'session-closed' })] }));
  });

  it('round-trips cancellation as an explicit correlated terminal outcome', () => {
    const active = establishActiveSeam();
    const cancel = asCancel(roundTrip(control({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'cancel',
      requestId: 'ipc-seam-1',
      sequence: active.client.nextSequence,
      sentAtMs: 1003,
      payload: { expectedGeneration: 0 }
    })));
    const cancelling = unwrapClient(reduceBrokerClientExchange(active.client, {
      eventKind: 'control',
      direction: 'client-to-broker',
      message: cancel
    }));
    const terminalAt = unwrapClient(parseBrokerTimestampMs(1004));
    const cancelled = unwrapBroker(handleBrokerControlInput(
      active.broker,
      cancel,
      1003,
      terminalAt,
      canonicalAuthority
    ));
    const terminal = roundTrip(onlyFrame(cancelled.outbound));
    expect(unwrapClient(reduceBrokerClientExchange(cancelling, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message: terminal
    }))).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: expect.objectContaining({ outcome: 'cancelled' })
    }));
    expect(cancelled.session).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: expect.objectContaining({ outcome: 'cancelled' })
    }));
  });

  it('converges both sides on an explicit disconnect outcome without a synthetic wire frame', () => {
    const active = establishActiveSeam();
    const client = unwrapClient(reduceBrokerClientExchange(active.client, {
      eventKind: 'disconnect',
      reason: 'channel-closed',
      detail: 'Inherited IPC channel closed before completion.'
    }));
    const broker = unwrapBroker(disconnectBrokerControlSession(active.broker, 'channel-closed'));
    expect(client).toEqual(expect.objectContaining({
      state: 'terminal',
      terminal: expect.objectContaining({ outcome: 'disconnected', reason: 'channel-closed' })
    }));
    expect(broker).toEqual(expect.objectContaining({
      session: expect.objectContaining({
        state: 'terminal',
        terminal: { outcome: 'disconnected', reason: 'channel-closed' }
      }),
      outbound: []
    }));
  });
});
