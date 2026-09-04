import { describe, expect, it } from 'vitest';

import { MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT } from '../broker-client/public.ts';
import type {
  Pm2ApplicationPrepareDispatchPort,
  Pm2ApplicationRpcClientPort,
  Pm2ApplicationStartConfig
} from './pm2-application-rpc.ts';
import {
  PM2_METADATA_ATTEMPT_ID,
  PM2_METADATA_DEADLINE_AT_MS,
  PM2_METADATA_DIGEST,
  PM2_METADATA_JOB_IDENTITY,
  PM2_METADATA_SLOT_ID,
  PM2_METADATA_STARTED_AT_MS,
  type Pm2ProjectedProcess
} from './pm2-monitor-projection.ts';
import {
  buildPm2OneShotStartConfig,
  createPm2ExactNameOneShotPorts,
  createPm2NonsecretEnvironmentAtom,
  derivePm2ManagedWindowsContainment,
  pm2OneShotMetadataDigest,
  type Pm2OneShotAdapterConfig,
  type Pm2OneShotLaunchPayload
} from './pm2-exact-name-receiver.ts';
import { parseProcessAttemptId, type ProcessAttemptId } from './primitives.ts';
import {
  allocateOneShotAttempt,
  requestOneShotCancellation,
  type OneShotLaunchAllocationPort
} from './one-shot-receiver.ts';
import {
  createOneShotSlotPool,
  type OneShotAttemptHandle,
  type OneShotCleanupProof,
  type OneShotSlotDefinition,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import type { BrokerResult } from './result.ts';

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('invalid primitive fixture');
  return result.value;
};

const attempt = (value: string): ProcessAttemptId => unwrapBroker(parseProcessAttemptId(value));

const targetPool = (): OneShotSlotPool => {
  const result = createOneShotSlotPool('nebular-one-shot', 1);
  if (result.outcome === 'failure') throw new Error('invalid pool fixture');
  return result.value;
};

const slotAt = (pool: OneShotSlotPool): OneShotSlotDefinition => {
  const slot = pool.slots.at(0);
  if (slot === undefined) throw new Error('slot fixture missing');
  return slot;
};

const adapterConfig: Pm2OneShotAdapterConfig = {
  endpoint: '\\\\.\\pipe\\rpc.sock',
  timeoutMs: 250,
  namespace: 'nebular-one-shot',
  allowedNonsecretEnvironmentNames: ['LANG', 'NO_COLOR'],
  killRetryTimeMs: 100
};

const payload = (): Pm2OneShotLaunchPayload => {
  const atom = createPm2NonsecretEnvironmentAtom('NO_COLOR', '1', adapterConfig.allowedNonsecretEnvironmentNames);
  if (atom.outcome === 'failure') throw new Error('invalid environment fixture');
  return {
    executablePath: 'R:/mise/installs/bun/1.4.0/bun.exe',
    cwd: 'R:/Code/example',
    args: ['R:/Code/example/worker.ts', '--cooperative-bootstrap'],
    stdoutPath: 'R:/Code/example/.generated/pm2/attempt-1.out.log',
    stderrPath: 'R:/Code/example/.generated/pm2/attempt-1.err.log',
    pidPath: 'R:/Code/example/.generated/pm2/attempt-1.pid',
    nonsecretEnvironment: [atom.value],
    managedContainment: {
      format: 'pm2-managed-windows-job/v1',
      jobIdentity: {
        kind: 'windows-named-job-identity',
        value: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`
      }
    },
    managedBootstrap: {
      format: 'pm2-managed-bun-recipe-bootstrap/v1',
      brokerEntrypoint: {
        kind: 'canonical-broker-entrypoint',
        value: 'R:\\Code\\nebular\\broker.js'
      }
    }
  };
};

const metadata = (slot: OneShotSlotDefinition, launchPayload: Pm2OneShotLaunchPayload) => ({
  slotId: slot.slotId,
  attemptId: attempt('attempt-1'),
  metadataDigest: pm2OneShotMetadataDigest(attempt('attempt-1'), launchPayload, 1_000, 2_000),
  startedAtMs: 1_000,
  deadlineAtMs: 2_000
});

type FakePm2 = Readonly<{
  client: Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
  facts: Readonly<{ events: readonly string[] }>;
  controls: Readonly<{
    recordEvent: (event: string) => void;
    markCleanupConfirmed: () => void;
    markNaturallyStopped: () => void;
    cleanupProof: (handle: OneShotAttemptHandle) => Promise<OneShotCleanupProof>;
  }>;
}>;

const fakePm2 = (): FakePm2 => {
  const events: string[] = [];
  let current: Pm2ProjectedProcess | undefined;
  let cleanupConfirmed = false;
  const client: Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort = {
    execute: request => {
      events.push(request.operation.method);
      switch (request.operation.method) {
        case 'getMonitorData': return Promise.resolve({
          outcome: 'success',
          value: {
            method: 'getMonitorData',
            processes: current === undefined || !request.operation.allowedNames.includes(current.name) ? [] : [current]
          }
        });
        case 'prepare': {
          const config = request.operation.config;
          current = {
            name: config.name,
            pmId: 7,
            pid: 51,
            status: 'online',
            exitCode: 99,
            autorestart: config.autorestart,
            treeKill: config.treekill,
            ownership: {
              kind: 'owned',
              slotId: config.env[PM2_METADATA_SLOT_ID] ?? '',
              attemptId: config.env[PM2_METADATA_ATTEMPT_ID] ?? '',
              metadataDigest: config.env[PM2_METADATA_DIGEST] ?? '',
              startedAtMs: Number(config.env[PM2_METADATA_STARTED_AT_MS]),
              deadlineAtMs: Number(config.env[PM2_METADATA_DEADLINE_AT_MS]),
              managedContainment: {
                kind: 'windows-job-v1',
                jobIdentity: config.env[PM2_METADATA_JOB_IDENTITY] ?? ''
              },
              managedBootstrap: {
                kind: 'bun-recipe-bootstrap-v1',
                brokerEntrypoint: config.env[MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT] ?? ''
              },
              receiverAuthority: { kind: 'absent' }
            }
          };
          return Promise.resolve({ outcome: 'success', value: { method: 'prepare', process: current } });
        }
        case 'stopProcessId': {
          if (current === undefined) return Promise.resolve({ outcome: 'failure', code: 'pm2-rpc-rejected' });
          current = { ...current, status: 'stopped', pid: 0, exitCode: 0 };
          return Promise.resolve({ outcome: 'success', value: { method: 'stopProcessId', process: current } });
        }
        case 'deleteProcessId': {
          if (current === undefined) return Promise.resolve({ outcome: 'failure', code: 'pm2-rpc-rejected' });
          const deleted = current;
          current = undefined;
          return Promise.resolve({ outcome: 'success', value: { method: 'deleteProcessId', process: deleted } });
        }
      }
    },
    dispatchPrepare: request => client.execute(request).then(result => result.outcome === 'success'
      ? { outcome: 'success', value: undefined }
      : result)
  };
  return {
    client,
    facts: { events },
    controls: {
      recordEvent: event => events.push(event),
      markCleanupConfirmed: () => { cleanupConfirmed = true; },
      markNaturallyStopped: () => {
        if (current !== undefined) current = { ...current, status: 'stopped', pid: 0, exitCode: 17 };
      },
      cleanupProof: () => Promise.resolve(cleanupConfirmed ? 'confirmed' : 'unconfirmed')
    }
  };
};

describe('exact-name PM2 one-shot adapter', () => {
  it('builds atomic direct-start config from explicit paths and allowlisted nonsecret environment only', () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const result = buildPm2OneShotStartConfig(adapterConfig, {
      slot,
      metadata: metadata(slot, launchPayload),
      payload: launchPayload,
      autorestart: false
    });
    expect(result.outcome).toBe('success');
    if (result.outcome === 'failure') return;
    const config: Pm2ApplicationStartConfig = result.value;
    expect(config).toMatchObject({
      name: 'nebular-one-shot-00',
      namespace: 'nebular-one-shot',
      exec_mode: 'fork_mode',
      exec_interpreter: 'none',
      autorestart: false,
      autostart: true,
      treekill: true,
      vizion: false,
      watch: false
    });
    expect(config.env).toEqual({
      NO_COLOR: '1',
      [PM2_METADATA_SLOT_ID]: 'nebular-one-shot:00',
      [PM2_METADATA_ATTEMPT_ID]: 'attempt-1',
      [PM2_METADATA_DIGEST]: metadata(slot, launchPayload).metadataDigest,
      [PM2_METADATA_STARTED_AT_MS]: '1000',
      [PM2_METADATA_DEADLINE_AT_MS]: '2000',
      [PM2_METADATA_JOB_IDENTITY]: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`,
      [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: 'R:\\Code\\nebular\\broker.js'
    });
  });

  it('derives the closed managed-containment payload and binds it into the metadata digest', () => {
    const derived = derivePm2ManagedWindowsContainment({
      trustedProfileRoot: {
        kind: 'trusted-profile-root',
        value: 'C:\\Users\\Broker\\AppData\\Local'
      },
      namespace: 'nebular-one-shot'
    }, {
      attemptId: attempt('attempt-1'),
      attemptDigest: 'a'.repeat(64)
    });
    expect(derived.outcome).toBe('success');
    if (derived.outcome === 'failure') return;
    expect(derived.value).toEqual({
      format: 'pm2-managed-windows-job/v1',
      jobIdentity: {
        kind: 'windows-named-job-identity',
        value: expect.stringMatching(/^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u)
      }
    });
    const original = payload();
    const drifted = { ...original, managedContainment: derived.value };
    expect(pm2OneShotMetadataDigest(attempt('attempt-1'), original, 1_000, 2_000))
      .not.toBe(pm2OneShotMetadataDigest(attempt('attempt-1'), drifted, 1_000, 2_000));
  });

  it('rejects a forged managed-containment identity before PM2 request construction', () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const forged = {
      ...payload(),
      managedContainment: {
        format: 'pm2-managed-windows-job/v1',
        jobIdentity: { kind: 'windows-named-job-identity', value: 'Local\\forged' }
      }
    } as const;
    const result = buildPm2OneShotStartConfig(adapterConfig, {
      slot,
      metadata: metadata(slot, forged),
      payload: forged,
      autorestart: false
    });

    expect(result).toEqual({
      outcome: 'failure',
      issue: { code: 'pm2-one-shot-configuration-invalid', field: 'containment' }
    });
  });

  it('binds the canonical managed bootstrap into the digest and rejects a forged entrypoint', () => {
    const original = payload();
    const drifted = {
      ...original,
      managedBootstrap: {
        ...original.managedBootstrap,
        brokerEntrypoint: {
          kind: 'canonical-broker-entrypoint' as const,
          value: 'R:\\Code\\nebular\\alternate-broker.js'
        }
      }
    };
    expect(pm2OneShotMetadataDigest(attempt('attempt-1'), original, 1_000, 2_000))
      .not.toBe(pm2OneShotMetadataDigest(attempt('attempt-1'), drifted, 1_000, 2_000));

    const pool = targetPool();
    const slot = slotAt(pool);
    const forged = {
      ...original,
      managedBootstrap: {
        format: 'pm2-managed-bun-recipe-bootstrap/v1',
        brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: 'relative/broker.js' }
      }
    } as const;
    expect(buildPm2OneShotStartConfig(adapterConfig, {
      slot,
      metadata: metadata(slot, forged),
      payload: forged,
      autorestart: false
    })).toEqual({
      outcome: 'failure',
      issue: { code: 'pm2-one-shot-configuration-invalid', field: 'bootstrap' }
    });
  });

  it('rejects secret-shaped environment authority with a redacted atomic issue', () => {
    const canary = 'PM2_ENV_SECRET_CANARY';
    const result = createPm2NonsecretEnvironmentAtom('API_TOKEN', canary, ['API_TOKEN']);
    expect(result).toEqual({
      outcome: 'failure',
      issue: { code: 'pm2-one-shot-configuration-invalid', field: 'environment' }
    });
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it.each([
    PM2_METADATA_JOB_IDENTITY,
    MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT
  ])('reserves the complete Nebular environment namespace under Windows case folding: %s', internalName => {
    const result = createPm2NonsecretEnvironmentAtom(
      internalName.toLowerCase(),
      'caller-value',
      [internalName.toLowerCase()]
    );

    expect(result).toEqual({
      outcome: 'failure',
      issue: { code: 'pm2-one-shot-configuration-invalid', field: 'environment' }
    });
  });

  it('rejects duplicate nonsecret names under Windows case folding', () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = {
      ...payload(),
      nonsecretEnvironment: [
        { kind: 'pm2-nonsecret-environment-atom', name: 'LANG', value: 'en' },
        { kind: 'pm2-nonsecret-environment-atom', name: 'lang', value: 'ja' }
      ]
    } as const;
    const result = buildPm2OneShotStartConfig(
      { ...adapterConfig, allowedNonsecretEnvironmentNames: ['LANG', 'lang'] },
      {
        slot,
        metadata: metadata(slot, launchPayload),
        payload: launchPayload,
        autorestart: false
      }
    );

    expect(result).toEqual({
      outcome: 'failure',
      issue: { code: 'pm2-one-shot-configuration-invalid', field: 'adapter' }
    });
  });

  it('reserves durably, starts atomically, then exposes immediate binding finalization', async () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const fake = fakePm2();
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: reservation => {
        fake.controls.recordEvent(`durable:${reservation.slot.processName.value}`);
        return Promise.resolve({ outcome: 'success', value: undefined });
      }
    };
    const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
      rpc: fake.client,
      compatibility: { probeCompatible: () => Promise.resolve(true) },
      cleanupProofs: { readProof: fake.controls.cleanupProof },
      allocation: {
        withAllocationLock: (_namespace, work) => {
          fake.controls.recordEvent('lock');
          return work().then(result => {
            fake.controls.recordEvent('unlock');
            return result;
          });
        }
      }
    });
    const launch = {
      attemptId: attempt('attempt-1'),
      metadataDigest: metadata(slot, launchPayload).metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 2_000,
      payload: launchPayload
    };
    const started = await allocateOneShotAttempt(pool, launch, ports, allocation);

    expect(started).toMatchObject({
      outcome: 'success',
      value: {
        outcome: 'started',
        handle: { pmId: 7, attemptId: 'attempt-1' },
        binding: { status: 'finalization-required', processId: 51 }
      }
    });
    expect(fake.facts.events).toEqual([
      'lock', 'getMonitorData', 'durable:nebular-one-shot-00', 'prepare', 'getMonitorData', 'unlock'
    ]);

    const retried = await allocateOneShotAttempt(pool, launch, ports, allocation);
    expect(retried).toMatchObject({ outcome: 'success', value: { outcome: 'already-started' } });
    expect(fake.facts.events).toEqual([
      'lock', 'getMonitorData', 'durable:nebular-one-shot-00', 'prepare', 'getMonitorData', 'unlock',
      'lock', 'getMonitorData', 'unlock'
    ]);
  });

  it('fails before atomic PM2 launch when durable reservation is not confirmed', async () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const fake = fakePm2();
    const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
      rpc: fake.client,
      compatibility: { probeCompatible: () => Promise.resolve(true) },
      cleanupProofs: { readProof: fake.controls.cleanupProof },
      allocation: { withAllocationLock: (_namespace, work) => work() }
    });
    const result = await allocateOneShotAttempt(pool, {
      attemptId: attempt('attempt-1'),
      metadataDigest: metadata(slot, launchPayload).metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 2_000,
      payload: launchPayload
    }, ports, {
      allocateLaunch: () => Promise.resolve({
        outcome: 'failure',
        issue: { code: 'launch-allocation-failed', safeMessage: 'Durable reservation was not confirmed.' }
      })
    });

    expect(result).toMatchObject({ outcome: 'failure', issue: { code: 'launch-allocation-failed' } });
    expect(fake.facts.events).toEqual(['getMonitorData']);
  });

  it('requires external cleanup proof before issuing a receipt and rechecks an already-terminal attempt', async () => {
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const fake = fakePm2();
    const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
      rpc: fake.client,
      compatibility: { probeCompatible: () => Promise.resolve(true) },
      cleanupProofs: { readProof: fake.controls.cleanupProof },
      allocation: { withAllocationLock: (_namespace, work) => work() }
    });
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: () => Promise.resolve({ outcome: 'success', value: undefined })
    };
    const started = await allocateOneShotAttempt(pool, {
      attemptId: attempt('attempt-1'),
      metadataDigest: metadata(slot, launchPayload).metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 2_000,
      payload: launchPayload
    }, ports, allocation);
    if (started.outcome === 'failure') throw new Error(started.issue.code);
    const activeObservation = await ports.observe(pool);
    expect(activeObservation.outcome === 'success'
      ? activeObservation.value[0]?.occupant
      : undefined).not.toHaveProperty('exitCode');
    const stopped = await requestOneShotCancellation(pool, started.value.handle, ports);

    expect(stopped).toMatchObject({
      outcome: 'success',
      value: {
        state: 'terminal-cleanup-unconfirmed'
      }
    });
    expect(stopped.outcome === 'success' ? stopped.value.cleanupReceipt : undefined).toBeUndefined();
    const terminalObservation = await ports.observe(pool);
    expect(terminalObservation).toEqual(expect.objectContaining({
      outcome: 'success',
      value: [expect.objectContaining({
        occupant: expect.objectContaining({ kind: 'owned', status: 'stopped', exitCode: 0 })
      })]
    }));
    const stopCalls = fake.facts.events.filter(event => event === 'stopProcessId').length;
    fake.controls.markCleanupConfirmed();
    const confirmed = await requestOneShotCancellation(pool, started.value.handle, ports);
    expect(confirmed).toMatchObject({
      outcome: 'success',
      value: {
        state: 'terminal-cleanup-confirmed',
        cleanupReceipt: { format: 'one-shot-tree-cleanup/v1', proof: 'confirmed' }
      }
    });
    expect(fake.facts.events.filter(event => event === 'stopProcessId')).toHaveLength(stopCalls);
    if (confirmed.outcome === 'failure' || confirmed.value.cleanupReceipt === undefined) return;
    expect(await ports.deleteExact(started.value.handle, confirmed.value.cleanupReceipt)).toEqual({
      outcome: 'success', value: undefined
    });
  });

  it('rejects a stale PM2 handle before stop/delete mutation', async () => {
    const fake = fakePm2();
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
      rpc: fake.client,
      compatibility: { probeCompatible: () => Promise.resolve(true) },
      cleanupProofs: { readProof: fake.controls.cleanupProof },
      allocation: { withAllocationLock: (_namespace, work) => work() }
    });
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: () => Promise.resolve({ outcome: 'success', value: undefined })
    };
    const started = await allocateOneShotAttempt(pool, {
      attemptId: attempt('attempt-1'),
      metadataDigest: metadata(slot, launchPayload).metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 2_000,
      payload: launchPayload
    }, ports, allocation);
    if (started.outcome === 'failure') throw new Error(started.issue.code);
    const before = fake.facts.events.length;
    const stale = { ...started.value.handle, pmId: 8 };
    const result = await ports.stopExact(stale);

    expect(result).toMatchObject({ outcome: 'failure', issue: { operation: 'stop-exact' } });
    expect(fake.facts.events.slice(before)).toEqual(['getMonitorData']);
  });

  it('never upgrades a natural terminal observation into process-tree cleanup proof', async () => {
    const fake = fakePm2();
    const pool = targetPool();
    const slot = slotAt(pool);
    const launchPayload = payload();
    const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
      rpc: fake.client,
      compatibility: { probeCompatible: () => Promise.resolve(true) },
      cleanupProofs: { readProof: fake.controls.cleanupProof },
      allocation: { withAllocationLock: (_namespace, work) => work() }
    });
    const started = await allocateOneShotAttempt(pool, {
      attemptId: attempt('attempt-1'),
      metadataDigest: metadata(slot, launchPayload).metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 2_000,
      payload: launchPayload
    }, ports, { allocateLaunch: () => Promise.resolve({ outcome: 'success', value: undefined }) });
    if (started.outcome === 'failure') throw new Error(started.issue.code);
    fake.controls.markNaturallyStopped();

    const result = await requestOneShotCancellation(pool, started.value.handle, ports);
    expect(result).toMatchObject({
      outcome: 'success', value: { state: 'terminal-cleanup-unconfirmed' }
    });
    expect(result.outcome === 'success' ? result.value.cleanupReceipt : undefined).toBeUndefined();
    expect(fake.facts.events.filter(event => event === 'stopProcessId')).toEqual([]);
  });
});
