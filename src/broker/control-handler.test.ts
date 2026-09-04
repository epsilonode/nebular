import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  parseBrokerAttemptId,
  parseBrokerRequestId,
  parseBrokerTimestampMs,
  type BrokerCancelMessage,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import { decodeAndAdmitRecipeXml } from '../recipe-contract/public.ts';
import {
  authorizeExecution,
  brokerErr,
  brokerOk,
  completeBrokerControlSession,
  disconnectBrokerControlSession,
  handleBrokerControlInput,
  openBrokerControlSession,
  parseCanonicalRepository,
  parseCredentialReference,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type AuthorizedExecution,
  type BrokerControlAuthority,
  type BrokerControlOpen,
  type BrokerControlSession,
  type BrokerResult
} from './public.ts';

const unwrapBroker = <T>(result: BrokerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const requestMessage = (): BrokerRequestMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: 'control-1',
    sequence: 1,
    sentAtMs: 1001,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Code/untrusted-alias',
      recipePathHint: 'recipe.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['weather-api']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('request fixture is invalid');
  return decoded.value;
};

const cancelMessage = (sequence: number, expectedGeneration = 0): BrokerCancelMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'cancel',
    requestId: 'control-1',
    sequence,
    sentAtMs: 1003,
    payload: { expectedGeneration }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'cancel') throw new Error('cancel fixture is invalid');
  return decoded.value;
};

const authorizedExecution = (request: BrokerRequestMessage): AuthorizedExecution => {
  const admittedRecipe = decodeAndAdmitRecipeXml(`<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
    <timeout ms="20000" />
    <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
    <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
      <scope>alerts:read</scope>
    </credential-slot>
  </recipe>`);
  const repository = unwrapBroker(parseCanonicalRepository('R:/Code/canonical'));
  const revision = unwrapBroker(parseRecipeRevision('revision-1'));
  const slot = unwrapBroker(parseCredentialSlotId('weather-api'));
  const grantId = unwrapBroker(parseGrantId('grant-1'));
  const credentialReference = parseCredentialReference('credential-weather');
  if (admittedRecipe.isErr() || credentialReference.isErr()) {
    throw new Error('admitted recipe fixture construction failed');
  }
  return unwrapBroker(authorizeExecution(request, {
    repository,
    relativePath: 'recipe.xml',
    revision,
    credentialSlotIds: [slot],
    admittedRecipe: admittedRecipe.value
  }, {
    id: grantId,
    generation: 1,
    repository,
    recipeRevision: revision,
    credentialBindings: [{ slotId: slot, credentialReference: credentialReference.value }],
    expiresAtMs: 2000,
    revoked: false
  }, 1000));
};

const authority = (): BrokerControlAuthority => ({
  authorizeExecution: request => brokerOk(authorizedExecution(request))
});

const openSession = (): BrokerControlOpen =>
  unwrapBroker(openBrokerControlSession(
    unwrapBroker(parseBrokerRequestId('control-1').mapErr(() => [{ code: 'ipc-invalid', message: 'fixture' }] as const)),
    unwrapBroker(parseBrokerTimestampMs(1000).mapErr(() => [{ code: 'ipc-invalid', message: 'fixture' }] as const)),
    'broker-test',
    ['request', 'cancel']
  ));

const activeSession = (): BrokerControlSession => {
  const responseSentAt = parseBrokerTimestampMs(1002);
  if (responseSentAt.isErr()) throw new Error('timestamp fixture is invalid');
  const transition = unwrapBroker(handleBrokerControlInput(
    openSession().session,
    requestMessage(),
    1000,
    responseSentAt.value,
    authority()
  ));
  return transition.session;
};

describe('privileged broker inherited-IPC control handler', () => {
  it('emits hello, one progress frame, and exactly one terminal frame', () => {
    const opened = openSession();
    expect(opened.hello).toEqual(expect.objectContaining({ messageKind: 'hello', sequence: 0 }));
    const responseSentAt = parseBrokerTimestampMs(1002);
    if (responseSentAt.isErr()) throw new Error('timestamp fixture is invalid');
    const admitted = unwrapBroker(handleBrokerControlInput(
      opened.session,
      requestMessage(),
      1000,
      responseSentAt.value,
      authority()
    ));
    expect(admitted).toEqual(expect.objectContaining({
      session: expect.objectContaining({ state: 'active', nextSequence: 3 }),
      outbound: [expect.objectContaining({ messageKind: 'progress', sequence: 2 })]
    }));
    const completedAt = parseBrokerTimestampMs(1003);
    if (completedAt.isErr()) throw new Error('timestamp fixture is invalid');
    const attemptId = parseBrokerAttemptId('attempt-control-1');
    if (attemptId.isErr()) throw new Error('attempt fixture is invalid');
    const completed = unwrapBroker(completeBrokerControlSession(
      admitted.session,
      { outcome: 'success', code: 'completed', message: 'Execution completed.', attemptId: attemptId.value },
      completedAt.value
    ));
    expect(completed).toEqual(expect.objectContaining({
      session: expect.objectContaining({ state: 'terminal', terminal: { outcome: 'success', code: 'completed' } }),
      outbound: [expect.objectContaining({
        messageKind: 'terminal-success',
        sequence: 3,
        attemptId: 'attempt-control-1'
      })]
    }));
    expect(completeBrokerControlSession(
      completed.session,
      { outcome: 'success', code: 'duplicate', message: '' },
      completedAt.value
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'process-state-invalid' })] }));
  });

  it('turns authority denial into a single redacted terminal frame', () => {
    const responseSentAt = parseBrokerTimestampMs(1002);
    if (responseSentAt.isErr()) throw new Error('timestamp fixture is invalid');
    const denied = unwrapBroker(handleBrokerControlInput(
      openSession().session,
      requestMessage(),
      1000,
      responseSentAt.value,
      { authorizeExecution: () => brokerErr({ code: 'authority-denied', message: 'private internal detail' }) }
    ));
    expect(denied).toEqual(expect.objectContaining({
      session: expect.objectContaining({ state: 'terminal' }),
      outbound: [expect.objectContaining({
        messageKind: 'terminal-failure',
        payload: {
          code: 'authority-denied',
          message: 'The privileged broker denied repository-scoped authority.'
        }
      })]
    }));
  });

  it('records accepted cancellation and disconnect as explicit terminal outcomes', () => {
    const sentAt = parseBrokerTimestampMs(1004);
    if (sentAt.isErr()) throw new Error('timestamp fixture is invalid');
    const cancelled = unwrapBroker(handleBrokerControlInput(
      activeSession(),
      cancelMessage(3),
      1003,
      sentAt.value,
      authority()
    ));
    expect(cancelled).toEqual(expect.objectContaining({
      session: expect.objectContaining({ state: 'terminal', terminal: expect.objectContaining({ outcome: 'cancelled' }) }),
      outbound: [expect.objectContaining({ messageKind: 'terminal-failure', sequence: 4 })]
    }));
    expect(unwrapBroker(disconnectBrokerControlSession(activeSession(), 'channel-closed'))).toEqual(expect.objectContaining({
      session: expect.objectContaining({ state: 'terminal', terminal: { outcome: 'disconnected', reason: 'channel-closed' } }),
      outbound: []
    }));
  });
});
