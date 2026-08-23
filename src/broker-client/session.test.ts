import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  reduceBrokerClientSession,
  type BrokerClientSession,
  type BrokerHelloMessage
} from './public.ts';

const sessionFixture = (): Readonly<{ session: BrokerClientSession; hello: BrokerHelloMessage }> => {
  const requestId = parseBrokerRequestId('session-1');
  const sequence = parseBrokerSequence(0);
  const sentAtMs = parseBrokerTimestampMs(1000);
  if (requestId.isErr() || sequence.isErr() || sentAtMs.isErr()) throw new Error('typed fixture construction failed');
  return {
    session: { state: 'awaiting-hello', requestId: requestId.value, nextSequence: sequence.value },
    hello: {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'hello',
      requestId: requestId.value,
      sequence: sequence.value,
      sentAtMs: sentAtMs.value,
      payload: { buildId: 'test-build', capabilities: ['request'] }
    }
  };
};

describe('broker client session reducer', () => {
  it('advances only through a correlated monotonic hello', () => {
    const fixture = sessionFixture();
    expect(reduceBrokerClientSession(fixture.session, fixture.hello)).toEqual(expect.objectContaining({
      value: expect.objectContaining({ state: 'ready', nextSequence: 1 })
    }));
  });

  it('rejects sequence gaps without changing session authority', () => {
    const fixture = sessionFixture();
    const wrongSequence = parseBrokerSequence(2);
    if (wrongSequence.isErr()) throw new Error('typed fixture construction failed');
    expect(reduceBrokerClientSession(fixture.session, { ...fixture.hello, sequence: wrongSequence.value })).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'sequence-invalid' })]
    }));
  });
});
