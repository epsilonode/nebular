import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  createDefaultBrokerOperationPort,
  projectBrokerOperationMessages
} from './operation.ts';
import { type BrokerResult } from './result.ts';

const unwrap = <T>(result: BrokerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const request = (operation: 'doctor' | 'status' = 'doctor'): BrokerRequestMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: 'operation-1',
    sequence: 1,
    sentAtMs: 1_000,
    payload: { operation, credentialSlotIds: [] }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('typed request fixture failed');
  return decoded.value;
};

describe('broker operation boundary', () => {
  it('projects bounded progress followed by exactly one terminal frame', async () => {
    const outcome = await createDefaultBrokerOperationPort().execute(request(), 1_000);
    expect(outcome.isOk()).toBe(true);
    if (outcome.isErr()) return;
    const sentAt = request().sentAtMs;
    expect(unwrap(projectBrokerOperationMessages(request(), outcome.value, sentAt))).toEqual([
      expect.objectContaining({ messageKind: 'progress', sequence: 2, payload: expect.objectContaining({ phase: 'doctor' }) }),
      expect.objectContaining({ messageKind: 'terminal-success', sequence: 3, payload: expect.objectContaining({ code: 'broker-ready' }) })
    ]);
  });

  it('fails unsupported operations without pretending they acquired authority', async () => {
    const outcome = await createDefaultBrokerOperationPort().execute(request('status'), 1_000);
    expect(outcome).toEqual(expect.objectContaining({
      value: expect.objectContaining({ outcome: 'failure', code: 'operation-unavailable', progress: [] })
    }));
  });

  it('rejects unbounded or NUL-bearing diagnostic output', () => {
    expect(projectBrokerOperationMessages(request(), {
      outcome: 'success',
      code: 'bad\0code',
      message: 'unsafe',
      progress: []
    }, request().sentAtMs)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'ipc-invalid' })]
    }));
  });
});
