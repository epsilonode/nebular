import type { Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { authorityTaskErr, type BrokerAuthorityPorts } from './authority.ts';
import { createBunSqliteAuthorityJournal } from './bun-sqlite-journal.ts';
import type { BunWindowsFilesystemFactsRuntime } from './bun-windows-filesystem-facts.ts';
import {
  journalErr,
  parseCheckedInRecipeLocator,
  parseDurableWindowsNamedJobIdentity,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  type JournalResult,
  type VerifiedWindowsAttemptContainmentBinding,
  type VerifiedWindowsTreeCleanupProof
} from './journal.ts';
import type { OneShotCleanupReceipt } from './one-shot-receiver.ts';
import type { OneShotAttemptHandle } from './one-shot-slots.ts';
import type {
  Pm2ApplicationPrepareDispatchPort,
  Pm2ApplicationRpcClientPort
} from './pm2-application-rpc.ts';
import type { Pm2ProjectedProcess } from './pm2-monitor-projection.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';
import { brokerErr, brokerOk } from './result.ts';
import type { WindowsExecutionAuthorityContext } from './windows-execution-authority-context.ts';
import type { WindowsNamedJobContainmentConfig } from './windows-named-job-containment.ts';
import type { WindowsNamedMutexAllocationConfig } from './windows-named-mutex-allocation.ts';
import type { WindowsOneShotArtifactRuntimePort } from './windows-one-shot-artifacts.ts';
import {
  createWindowsPm2OneShotComposition,
  resolveWindowsPm2OneShotComposition,
  WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT,
  type WindowsPm2OneShotCompositionFactories
} from './windows-pm2-one-shot-composition.ts';

const PROFILE_ROOT = 'C:\\Users\\Developer\\AppData\\Local';
const BROKER_ENTRYPOINT = 'R:\\Code\\nebular\\broker.js';
const GIT_EXECUTABLE = 'C:\\Program Files\\Git\\cmd\\git.exe';

const unwrapBroker = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('invalid broker fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error('invalid journal fixture');
  return result.value;
};

const deniedAuthority = (): BrokerAuthorityPorts => ({
  canonicalizeRepository: () => authorityTaskErr({
    code: 'authority-denied',
    message: 'fixture authority is unavailable'
  }),
  resolveRecipe: () => authorityTaskErr({
    code: 'authority-denied',
    message: 'fixture authority is unavailable'
  }),
  readGrant: () => authorityTaskErr({
    code: 'authority-denied',
    message: 'fixture authority is unavailable'
  })
});

const authorityContext = (): WindowsExecutionAuthorityContext => ({
  authority: deniedAuthority(),
  journal: createBunSqliteAuthorityJournal({
    profilePath: {
      resolveAuthorityDatabasePath: () => Promise.resolve(journalErr({
        code: 'journal-unavailable',
        message: 'fixture database is unavailable'
      }))
    },
    applicationVersion: 'epsilonode-nebular-v1',
    clock: { nowMs: () => 3_500 }
  }),
  trustedProfileRoot: { kind: 'trusted-profile-root', value: PROFILE_ROOT },
  gitExecutable: { kind: 'canonical-git-executable', value: GIT_EXECUTABLE }
});

const filesystem = (): BunWindowsFilesystemFactsRuntime => ({
  currentProcess: () => ({
    platform: 'win32',
    runtime: 'bun',
    executablePath: 'C:\\Tools\\bun.exe'
  }),
  inspect: () => Promise.resolve({ status: 'unavailable' }),
  inspectExistingFile: () => Promise.resolve({ status: 'unavailable' }),
  inspectExistingPath: () => Promise.resolve({ status: 'unavailable' })
});

const artifacts = (): WindowsOneShotArtifactRuntimePort => ({
  inspectExistingPath: () => Promise.resolve({ status: 'unavailable' }),
  ensureDirectory: () => Promise.resolve('unavailable'),
  createExclusiveFile: () => Promise.resolve('unavailable'),
  readBoundedFile: () => Promise.resolve({ state: 'unavailable' }),
  removeFile: () => Promise.resolve('unavailable'),
  removeDirectoryIfEmpty: () => Promise.resolve('unavailable')
});

type FactoryObservations = Readonly<{
  allocations: WindowsNamedMutexAllocationConfig[];
  containments: WindowsNamedJobContainmentConfig[];
  rpcOperations: string[];
  waits: number[];
}>;

type FactoryHarness = Readonly<{
  factories: WindowsPm2OneShotCompositionFactories;
  observations: FactoryObservations;
}>;

const factoryHarness = (
  process: Pm2ProjectedProcess | null = null,
  observationSequence: readonly (Pm2ProjectedProcess | null)[] = []
): FactoryHarness => {
  const allocations: WindowsNamedMutexAllocationConfig[] = [];
  const containments: WindowsNamedJobContainmentConfig[] = [];
  const rpcOperations: string[] = [];
  const waits: number[] = [];
  let current = process;
  let observationIndex = 0;
  const facts = filesystem();
  const artifactRuntime = artifacts();
  const rpc: Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort = {
    execute: request => {
      rpcOperations.push(request.operation.method);
      switch (request.operation.method) {
        case 'getMonitorData':
          if (observationSequence.length > 0) {
            current = observationSequence[Math.min(observationIndex, observationSequence.length - 1)] ?? null;
            observationIndex += 1;
          }
          return Promise.resolve({
            outcome: 'success',
            value: {
              method: 'getMonitorData',
              processes: current === null || !request.operation.allowedNames.includes(current.name)
                ? []
                : [current]
            }
          });
        case 'deleteProcessId': {
          if (current === null) return Promise.resolve({ outcome: 'failure', code: 'pm2-rpc-rejected' });
          const deleted = current;
          current = null;
          return Promise.resolve({
            outcome: 'success',
            value: { method: 'deleteProcessId', process: deleted }
          });
        }
        case 'prepare':
        case 'stopProcessId':
          return Promise.resolve({ outcome: 'failure', code: 'pm2-rpc-rejected' });
      }
    },
    dispatchPrepare: () => Promise.resolve({ outcome: 'failure', code: 'pm2-rpc-rejected' })
  };
  return {
    factories: {
      createAllocation: config => {
        allocations.push(config);
        return { withAllocationLock: (_namespace, work) => work() };
      },
      createArtifacts: supplied => supplied === facts ? artifactRuntime : artifacts(),
      createCleanupProofs: () => ({ readProof: () => Promise.resolve('unconfirmed') }),
      createClock: () => ({ nowMs: () => 3_500 }),
      createContainment: config => {
        containments.push(config);
        return {
          observeBootstrapRoot: () => Promise.resolve({
            status: 'ambiguous',
            reason: 'unavailable'
          }),
          verifyExactProcess: () => Promise.resolve(brokerErr({
            code: 'receiver-unavailable',
            message: 'fixture containment is unavailable'
          })),
          terminateAndProveEmpty: () => Promise.resolve(brokerErr({
            code: 'receiver-unavailable',
            message: 'fixture containment is unavailable'
          })),
          terminateAndObserve: () => Promise.resolve({ status: 'ambiguous', reason: 'unavailable' })
        };
      },
      createFilesystem: () => facts,
      createPm2ApplicationRpc: () => rpc,
      createPm2Compatibility: () => ({
        supportsEndpointKind: kind => kind === 'named-pipe',
        probeSocket: () => Promise.resolve({ status: 'compatible' })
      }),
      createProcessIncarnations: () => ({
        readCurrentIncarnation: query => Promise.resolve({
          status: 'unavailable',
          processId: query.processId
        })
      }),
      createStartTiming: () => ({
        confirmationAttempts: 2,
        confirmationIntervalMs: 1,
        now: () => 2_500,
        wait: milliseconds => {
          waits.push(milliseconds);
          return Promise.resolve();
        }
      })
    },
    observations: { allocations, containments, rpcOperations, waits }
  };
};

const binding = (): VerifiedWindowsAttemptContainmentBinding => ({
  format: 'verified-windows-attempt-containment/v1',
  bindingGeneration: 1,
  processAttemptId: unwrapBroker(parseProcessAttemptId('attempt-composition-1')),
  repository: unwrapBroker(parseCanonicalRepository('R:\\Code\\repository')),
  recipeRevision: unwrapBroker(parseRecipeRevision('revision-1')),
  grantId: unwrapBroker(parseGrantId('grant-1')),
  grantGeneration: 2,
  credentialSlotIds: [unwrapBroker(parseCredentialSlotId('weather'))],
  grantExpiresAtMs: 20_000,
  receiverId: unwrapBroker(parseReceiverId('pm2')),
  receiverCorrelation: unwrapJournal(parseReceiverCorrelation('receiver-correlation-1')),
  receiverEntryIdentity: unwrapJournal(parseReceiverEntryIdentity('pm2-entry:nebular-one-shot-00')),
  receiverSlotIdentity: 'nebular-one-shot:00',
  receiverProcessName: 'nebular-one-shot-00',
  receiverPmId: 7,
  recipeLocator: unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipes/weather.xml')),
  slotIndependentPlanDigest: unwrapJournal(parseRedactedPlanDigest(`sha256:${'b'.repeat(64)}`)),
  launchMetadataDigest: 'a'.repeat(64),
  deadlineAtMs: 10_000,
  rootProcessId: 4_200,
  rootProcessIncarnation: unwrapJournal(parseProcessIncarnation(
    `windows-process-incarnation-v1-${'c'.repeat(64)}`
  )),
  jobIdentity: unwrapJournal(parseDurableWindowsNamedJobIdentity(
    `Local\\epsilonode.nebular.job.v1.${'d'.repeat(64)}`
  )),
  jobPolicy: {
    format: 'windows-job-policy/v1',
    extendedLimit: 'kill-on-job-close-only',
    uiRestrictions: 'none',
    breakaway: 'forbidden'
  },
  membershipVerifiedAtMs: 2_000
});

const treeProof = (
  contained: VerifiedWindowsAttemptContainmentBinding
): VerifiedWindowsTreeCleanupProof => ({
  format: 'verified-windows-tree-cleanup/v1',
  proof: 'exact-tree-empty',
  basis: 'job-terminated-empty',
  jobIdentity: contained.jobIdentity,
  rootProcessId: contained.rootProcessId,
  rootProcessIncarnation: contained.rootProcessIncarnation,
  observedAtMs: 3_000
});

const projectedStoppedProcess = (
  contained: VerifiedWindowsAttemptContainmentBinding
): Pm2ProjectedProcess => ({
  name: contained.receiverProcessName,
  pmId: contained.receiverPmId,
  pid: null,
  status: 'stopped',
  exitCode: 0,
  autorestart: false,
  treeKill: true,
  ownership: {
    kind: 'owned',
    slotId: contained.receiverSlotIdentity,
    attemptId: contained.processAttemptId,
    metadataDigest: contained.launchMetadataDigest,
    startedAtMs: 1_000,
    deadlineAtMs: contained.deadlineAtMs,
    managedContainment: {
      kind: 'windows-job-v1',
      jobIdentity: contained.jobIdentity.value
    },
    managedBootstrap: {
      kind: 'bun-recipe-bootstrap-v1',
      brokerEntrypoint: BROKER_ENTRYPOINT
    },
    receiverAuthority: { kind: 'absent' }
  }
});

const projectedOnlineProcess = (
  contained: VerifiedWindowsAttemptContainmentBinding
): Pm2ProjectedProcess => ({
  ...projectedStoppedProcess(contained),
  pid: contained.rootProcessId,
  status: 'online'
});

const exactHandle = (contained: VerifiedWindowsAttemptContainmentBinding): OneShotAttemptHandle => ({
  slotId: { kind: 'one-shot-slot-id', value: contained.receiverSlotIdentity },
  processName: { kind: 'one-shot-process-name', value: contained.receiverProcessName },
  attemptId: contained.processAttemptId,
  metadataDigest: contained.launchMetadataDigest,
  pmId: contained.receiverPmId
});

describe('production Windows PM2 one-shot composition', () => {
  it('builds launch and reusable lifetime capabilities while cleanup remains proof-gated', async () => {
    const contained = binding();
    const harness = factoryHarness(projectedStoppedProcess(contained));
    const context = authorityContext();
    const result = createWindowsPm2OneShotComposition(context, {
      brokerEntrypointPath: BROKER_ENTRYPOINT,
      slotCapacity: 1,
      adapterTimeoutMs: 500,
      allocationTimeoutMs: 750,
      killRetryTimeMs: 100,
      allowedNonsecretEnvironmentNames: ['REGION']
    }, harness.factories);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error('composition rejected fixture');
    expect(result.value).toMatchObject({
      format: WINDOWS_PM2_ONE_SHOT_COMPOSITION_FORMAT,
      authority: context.authority,
      journal: context.journal,
      authorityContext: context,
      launchConfig: {
        brokerEntrypointPath: BROKER_ENTRYPOINT,
        pool: { namespace: 'nebular-one-shot' },
        allowedNonsecretEnvironmentNames: ['REGION']
      }
    });
    expect(result.value.capabilities.journal).toBe(context.journal);
    expect(result.value.capabilities.containment.terminateAndObserve).toBeTypeOf('function');
    expect(result.value.capabilities.processIncarnations.readCurrentIncarnation).toBeTypeOf('function');
    expect(result.value.capabilities.timing.now()).toBe(2_500);
    expect(result.value.capabilities.clock.nowMs()).toBe(3_500);
    expect(harness.observations.allocations).toEqual([{
      namespace: 'nebular-one-shot',
      trustedProfileRoot: context.trustedProfileRoot,
      timeoutMs: 750
    }]);
    expect(harness.observations.containments).toEqual([{
      trustedProfileRoot: context.trustedProfileRoot,
      namespace: 'nebular-one-shot'
    }]);

    const handle = exactHandle(contained);
    const assertedCleanup: OneShotCleanupReceipt = {
      format: 'one-shot-tree-cleanup/v1',
      handle,
      proof: 'confirmed'
    };
    const ungatedDelete = await result.value.capabilities.receiver.deleteExact(handle, assertedCleanup);
    expect(ungatedDelete.outcome).toBe('failure');
    expect(harness.observations.rpcOperations).toEqual([]);

    const deletion = await result.value.capabilities.pm2Deletion.deleteExactRecord({
      format: 'pm2-exact-record-deletion-request/v1',
      binding: contained,
      treeCleanup: treeProof(contained)
    });
    expect(deletion).toMatchObject({
      outcome: 'success',
      value: {
        format: 'pm2-exact-record-deletion/v1',
        disposition: 'deleted',
        receiverPmId: 7,
        processAttemptId: contained.processAttemptId,
        deletedAtMs: 3_500
      }
    });
    expect(harness.observations.rpcOperations).toEqual([
      'getMonitorData',
      'getMonitorData',
      'deleteProcessId'
    ]);
  });

  it('rejects mismatched tree proof before observing or deleting PM2', async () => {
    const contained = binding();
    const harness = factoryHarness(projectedStoppedProcess(contained));
    const result = createWindowsPm2OneShotComposition(authorityContext(), {
      brokerEntrypointPath: BROKER_ENTRYPOINT
    }, harness.factories);
    if (result.isErr()) throw new Error('composition rejected fixture');
    const otherJob = unwrapJournal(parseDurableWindowsNamedJobIdentity(
      `Local\\epsilonode.nebular.job.v1.${'e'.repeat(64)}`
    ));

    const deletion = await result.value.capabilities.pm2Deletion.deleteExactRecord({
      format: 'pm2-exact-record-deletion-request/v1',
      binding: contained,
      treeCleanup: { ...treeProof(contained), jobIdentity: otherJob }
    });

    expect(deletion).toMatchObject({
      outcome: 'failure',
      issue: { code: 'pm2-exact-record-deletion-unconfirmed' }
    });
    expect(harness.observations.rpcOperations).toEqual([]);
  });

  it('boundedly re-observes the same exact PM2 identity until terminal status permits deletion', async () => {
    const contained = binding();
    const stopped = projectedStoppedProcess(contained);
    const harness = factoryHarness(stopped, [
      projectedOnlineProcess(contained),
      stopped,
      stopped
    ]);
    const result = createWindowsPm2OneShotComposition(authorityContext(), {
      brokerEntrypointPath: BROKER_ENTRYPOINT
    }, harness.factories);
    if (result.isErr()) throw new Error('composition rejected fixture');

    const deletion = await result.value.capabilities.pm2Deletion.deleteExactRecord({
      format: 'pm2-exact-record-deletion-request/v1',
      binding: contained,
      treeCleanup: treeProof(contained)
    });

    expect(deletion).toMatchObject({ outcome: 'success', value: { disposition: 'deleted' } });
    expect(harness.observations.waits).toEqual([1]);
    expect(harness.observations.rpcOperations).toEqual([
      'getMonitorData',
      'getMonitorData',
      'getMonitorData',
      'deleteProcessId'
    ]);
  });

  it('fails closed after the bounded exact PM2 status retry budget is exhausted', async () => {
    const contained = binding();
    const online = projectedOnlineProcess(contained);
    const harness = factoryHarness(online, [online, online]);
    const result = createWindowsPm2OneShotComposition(authorityContext(), {
      brokerEntrypointPath: BROKER_ENTRYPOINT
    }, harness.factories);
    if (result.isErr()) throw new Error('composition rejected fixture');

    const deletion = await result.value.capabilities.pm2Deletion.deleteExactRecord({
      format: 'pm2-exact-record-deletion-request/v1',
      binding: contained,
      treeCleanup: treeProof(contained)
    });

    expect(deletion).toMatchObject({
      outcome: 'failure',
      issue: { code: 'pm2-exact-record-deletion-unconfirmed' }
    });
    expect(harness.observations.waits).toEqual([1]);
    expect(harness.observations.rpcOperations).toEqual(['getMonitorData', 'getMonitorData']);
  });

  it('resolves the public authority context before composing the injectable production leaves', async () => {
    const context = authorityContext();
    const harness = factoryHarness();
    const authorityOptions: unknown[] = [];
    const result = await resolveWindowsPm2OneShotComposition({
      authority: { adapterTimeoutMs: 900, journalBusyTimeoutMs: 300 },
      oneShot: { brokerEntrypointPath: BROKER_ENTRYPOINT }
    }, {
      authorityContexts: {
        resolve: options => {
          authorityOptions.push(options);
          return Promise.resolve(brokerOk(context));
        }
      },
      factories: harness.factories
    });

    expect(result.isOk()).toBe(true);
    expect(authorityOptions).toEqual([{ adapterTimeoutMs: 900, journalBusyTimeoutMs: 300 }]);
    expect(result.isOk() ? result.value.authorityContext : null).toBe(context);
  });

  it('rejects invalid launch options before resolving authority or constructing effects', async () => {
    const authorityCalls: unknown[] = [];
    const harness = factoryHarness();
    const result = await resolveWindowsPm2OneShotComposition({
      oneShot: {
        brokerEntrypointPath: 'relative-private-entrypoint.ts',
        allowedNonsecretEnvironmentNames: ['PRIVATE_TOKEN']
      }
    }, {
      authorityContexts: {
        resolve: options => {
          authorityCalls.push(options);
          return Promise.resolve(brokerOk(authorityContext()));
        }
      },
      factories: harness.factories
    });

    expect(result.isErr()).toBe(true);
    expect(authorityCalls).toEqual([]);
    expect(harness.observations.allocations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('relative-private-entrypoint');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
  });
});
