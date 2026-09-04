import { describe, expect, it, vi } from 'vitest';

import { parseReceiverEntryIdentity } from './journal.ts';
import type { Pm2ApplicationRpcClientPort } from './pm2-application-rpc.ts';
import type { Pm2ProjectedProcess } from './pm2-monitor-projection.ts';
import { createPm2ReceiverAttemptProjectionPort } from './pm2-receiver-attempt-projection.ts';
import { parseReceiverId } from './primitives.ts';

const query = () => {
  const receiverId = parseReceiverId('pm2');
  const receiverEntryIdentity = parseReceiverEntryIdentity('pm2-entry:nebular-one-shot-00');
  if (receiverId.isErr() || receiverEntryIdentity.type === 'err') throw new Error('invalid query fixture');
  return {
    format: 'bootstrap-receiver-attempt-query/v1' as const,
    receiverId: receiverId.value,
    receiverEntryIdentity: receiverEntryIdentity.value
  };
};

const process = (
  overrides: Partial<Pm2ProjectedProcess> = {}
): Pm2ProjectedProcess => ({
  name: 'nebular-one-shot-00',
  pmId: 7,
  pid: 51,
  status: 'online',
  autorestart: false,
  treeKill: true,
  ownership: {
    kind: 'owned',
    slotId: 'nebular-one-shot:00',
    attemptId: 'attempt-1',
    metadataDigest: 'a'.repeat(64),
    startedAtMs: 1_000,
    deadlineAtMs: 2_000,
    managedContainment: {
      kind: 'windows-job-v1',
      jobIdentity: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`
    },
    managedBootstrap: {
      kind: 'bun-recipe-bootstrap-v1',
      brokerEntrypoint: 'R:\\Code\\nebular\\broker.js'
    },
    receiverAuthority: {
      kind: 'owned',
      receiverId: 'pm2',
      receiverEntryIdentity: 'pm2-entry:nebular-one-shot-00',
      receiverCorrelation: 'pm2:nebular-one-shot-00:attempt-1',
      repository: 'R:/Code/example',
      recipeRevision: 'recipe-revision-1',
      grantId: 'grant-1',
      grantGeneration: 3,
      bindingGeneration: 2
    }
  },
  ...overrides
});

const client = (processes: readonly Pm2ProjectedProcess[]): Pm2ApplicationRpcClientPort => ({
  execute: () => Promise.resolve({
    outcome: 'success',
    value: { method: 'getMonitorData', processes }
  })
});

const invalidReceiverAuthorityProcess = (): Pm2ProjectedProcess => {
  const fixture = process();
  if (fixture.ownership.kind !== 'owned') throw new Error('owned projection fixture required');
  return process({
    ownership: { ...fixture.ownership, receiverAuthority: { kind: 'invalid' } }
  });
};

describe('strict PM2 receiver-attempt projection port', () => {
  it('resolves only the exact-name, exact-authority allowlist projection', async () => {
    const execute = vi.fn(client([process()]).execute);
    const result = await createPm2ReceiverAttemptProjectionPort({
      endpoint: '\\\\.\\pipe\\rpc.sock', timeoutMs: 250
    }, { execute }).readStrictProjection(query());

    expect(result).toEqual({
      status: 'resolved',
      fact: {
        format: 'bootstrap-receiver-attempt-projection/v1',
        receiverId: 'pm2',
        receiverEntryIdentity: { kind: 'receiver-entry-identity', value: 'pm2-entry:nebular-one-shot-00' },
        receiverCorrelation: { kind: 'receiver-correlation', value: 'pm2:nebular-one-shot-00:attempt-1' },
        processId: 51,
        lifecycleState: 'online',
        ownership: {
          processAttemptId: 'attempt-1',
          repository: 'R:/Code/example',
          recipeRevision: 'recipe-revision-1',
          grantId: 'grant-1',
          grantGeneration: 3,
          bindingGeneration: 2
        }
      }
    });
    expect(execute).toHaveBeenCalledWith({
      endpoint: '\\\\.\\pipe\\rpc.sock',
      timeoutMs: 250,
      operation: { method: 'getMonitorData', allowedNames: ['nebular-one-shot-00'] }
    });
  });

  it.each([
    process({ autorestart: true }),
    process({ treeKill: false }),
    process({ pid: null }),
    process({ status: 'unknown' }),
    process({ ownership: { kind: 'absent' } }),
    process({ ownership: { kind: 'invalid' } }),
    invalidReceiverAuthorityProcess()
  ])('fails closed for incomplete ownership, configuration, process, or lifecycle facts', async candidate => {
    const result = await createPm2ReceiverAttemptProjectionPort({ endpoint: 'pipe', timeoutMs: 250 }, client([candidate]))
      .readStrictProjection(query());
    expect(result).toEqual({ status: 'ambiguous' });
  });

  it('distinguishes missing from duplicate exact-name observations', async () => {
    const port = (processes: readonly Pm2ProjectedProcess[]) => createPm2ReceiverAttemptProjectionPort({
      endpoint: 'pipe', timeoutMs: 250
    }, client(processes)).readStrictProjection(query());
    expect(await port([])).toEqual({ status: 'missing' });
    expect(await port([process(), process({ pmId: 8, pid: 52 })])).toEqual({ status: 'ambiguous' });
  });

  it('redacts rejected RPCs and never forwards extra foreign data', async () => {
    const canary = 'STRICT_PROJECTION_SECRET_CANARY';
    const rejected: Pm2ApplicationRpcClientPort = {
      execute: () => Promise.reject(new Error(canary))
    };
    const result = await createPm2ReceiverAttemptProjectionPort({ endpoint: 'pipe', timeoutMs: 250 }, rejected)
      .readStrictProjection(query());
    expect(result).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain(canary);
  });
});
