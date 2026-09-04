import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  parseBrokerAttemptId,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  createDefaultBrokerOperationPort,
  createPm2AwareBrokerOperationPort,
  projectBrokerOperationMessages
} from './operation.ts';
import type { Pm2PrerequisiteRuntimePort } from './pm2-prerequisite.ts';
import type { Pm2PrerequisiteConfig } from './pm2-prerequisite.ts';
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
      expect.objectContaining({ messageKind: 'terminal-success', sequence: 3, payload: expect.objectContaining({ code: 'broker-runtime-ready' }) })
    ]);
  });

  it('projects a typed execution attempt only onto the terminal frame', () => {
    const attemptId = parseBrokerAttemptId('attempt-structured-1');
    if (attemptId.isErr()) throw new Error('attempt fixture failed');
    const messages = unwrap(projectBrokerOperationMessages(request(), {
      outcome: 'success',
      code: 'completed',
      message: 'Execution completed.',
      progress: [{ phase: 'execution', detail: 'Execution reached terminal cleanup.' }],
      attemptId: attemptId.value
    }, request().sentAtMs));

    expect(messages[0]).not.toHaveProperty('attemptId');
    expect(messages.at(-1)).toEqual(expect.objectContaining({
      messageKind: 'terminal-success',
      attemptId: 'attempt-structured-1'
    }));
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

  it('keeps host prerequisite inspection opt-in without treating socket reachability as PM2 readiness', async () => {
    let probes = 0;
    const runtime: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: async probe => {
        probes += 1;
        expect(probe).toEqual({
          endpointKind: 'named-pipe',
          endpoint: '\\\\.\\pipe\\pm2-rpc',
          timeoutMs: 250
        });
        return { status: 'reachable-unverified' };
      }
    };
    const outcome = await createPm2AwareBrokerOperationPort({
      controlSurface: { kind: 'named-pipe', endpoint: '\\\\.\\pipe\\pm2-rpc' },
      timeoutMs: 250
    }, runtime).execute(request(), 1_000);

    expect(probes).toBe(1);
    expect(outcome).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        outcome: 'failure',
        code: 'pm2-compatibility-unverified',
        progress: [
          expect.objectContaining({ phase: 'doctor' }),
          expect.objectContaining({ phase: 'receiver-prerequisite' })
        ]
      })
    }));
  });

  it.each([
    ['unavailable', 'pm2-unavailable'],
    ['unreachable', 'pm2-unreachable'],
    ['incompatible', 'pm2-incompatible'],
    ['timeout', 'pm2-timeout']
  ] as const)('maps the closed PM2 %s status to a typed doctor failure', async (status, code) => {
    const runtime: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: async () => ({ status })
    };
    const outcome = await createPm2AwareBrokerOperationPort({
      controlSurface: { kind: 'named-pipe', endpoint: '\\\\.\\pipe\\pm2-rpc' },
      timeoutMs: 250
    }, runtime).execute(request(), 1_000);

    expect(outcome).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        outcome: 'failure',
        code,
        progress: [
          expect.objectContaining({ phase: 'doctor' }),
          expect.objectContaining({ phase: 'receiver-prerequisite' })
        ]
      })
    }));
  });

  it('reports receiver readiness only after a compatible PM2 protocol observation', async () => {
    const runtime: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: async () => ({ status: 'compatible' })
    };
    const outcome = await createPm2AwareBrokerOperationPort({
      controlSurface: { kind: 'named-pipe', endpoint: '\\\\.\\pipe\\pm2-rpc' },
      timeoutMs: 250
    }, runtime).execute(request(), 1_000);

    expect(outcome).toEqual(expect.objectContaining({
      value: expect.objectContaining({ outcome: 'success', code: 'pm2-compatible' })
    }));
  });

  it('does not probe PM2 for operations outside the exact doctor shape', async () => {
    let probes = 0;
    const runtime: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: async () => {
        probes += 1;
        return { status: 'reachable-unverified' };
      }
    };
    const outcome = await createPm2AwareBrokerOperationPort({
      controlSurface: { kind: 'named-pipe', endpoint: '\\\\.\\pipe\\pm2-rpc' },
      timeoutMs: 250
    }, runtime).execute(request('status'), 1_000);

    expect(probes).toBe(0);
    expect(outcome).toEqual(expect.objectContaining({
      value: expect.objectContaining({ outcome: 'failure', code: 'operation-unavailable' })
    }));
  });

  it('maps a rejected prerequisite task to one closed redacted issue', async () => {
    const config: Pm2PrerequisiteConfig = {
      controlSurface: { kind: 'named-pipe', endpoint: '\\\\.\\pipe\\pm2-rpc' },
      get timeoutMs(): never {
        throw new Error('private-prerequisite-detail');
      }
    };
    const runtime: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: () => true,
      probeSocket: async () => ({ status: 'compatible' })
    };
    const outcome = await createPm2AwareBrokerOperationPort(config, runtime).execute(request(), 1_000);

    expect(outcome).toEqual({
      error: [{
        code: 'receiver-unavailable',
        message: 'Broker receiver prerequisite inspection failed.'
      }]
    });
    expect(JSON.stringify(outcome)).not.toContain('private-prerequisite-detail');
  });
});
