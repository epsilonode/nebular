import { describe, expect, it } from 'vitest';

import { decodeBrokerControlMessage } from '../broker-client/public.ts';
import { decodeAndAdmitRecipeXml } from '../recipe-contract/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import type { BunWindowsFilesystemFactsRuntime } from './bun-windows-filesystem-facts.ts';
import {
  journalOk,
  parseProcessIncarnation,
  type BindBootstrapAttempt,
  type BindVerifiedWindowsContainmentAndStart,
  type BootstrapAttemptJournalRecord,
  type GrantQualifiedMaterializingAttemptRecord,
  type ReserveGrantQualifiedMaterializingAttempt
} from './journal.ts';
import type { ExactOneShotStart } from './one-shot-receiver.ts';
import { waitForGrantQualifiedOneShotTerminal } from './grant-qualified-one-shot-terminal-observer.ts';
import type { OneShotSlotObservation } from './one-shot-slots.ts';
import { createOneShotSlotPool } from './one-shot-slots.ts';
import type { Pm2OneShotLaunchPayload } from './pm2-exact-name-receiver.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';
import { brokerErr, brokerOk } from './result.ts';
import { deriveWindowsNamedJobIdentity } from './windows-named-job-containment.ts';
import type { WindowsOneShotArtifactRuntimePort } from './windows-one-shot-artifacts.ts';
import {
  createWindowsPm2OneShotLaunchPort,
  type WindowsPm2OneShotLaunchConfig,
  type WindowsPm2OneShotLaunchPorts
} from './windows-pm2-one-shot-launch.ts';

const REPOSITORY_TEXT = 'R:\\Code\\repository';
const BUN_EXECUTABLE = 'C:\\Tools\\mise\\bun.exe';
const BROKER_ENTRYPOINT = 'R:\\Code\\nebular\\broker.js';
const TARGET_ENTRYPOINT = 'R:\\Code\\repository\\src\\main.ts';
const PROFILE_ROOT = 'C:\\Users\\Developer\\AppData\\Local';
const PROCESS_ID = 4_200;
const PM_ID = 7;
const INCARNATION_TEXT = `windows-process-incarnation-v1-${'a'.repeat(64)}`;

const RECIPE_XML = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source tool="bun" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="bun">
    <arg>src/main.ts</arg><arg>--forecast</arg><env name="REGION" value="west" />
  </exec>
  <stop-policy value="ephemeral-safe-to-stop" />
  <credential-slot id="weather" provider="weather-provider" account="dev" environment="development" delivery="environment" inject="WEATHER_API_KEY">
    <scope>read</scope><operation>forecast</operation>
  </credential-slot>
</recipe>`;

const authorizedExecution = (): AuthorizedExecution => {
  const request = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'windows-pm2-launch-1',
    sequence: 1,
    sentAtMs: 1_000,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: REPOSITORY_TEXT,
      recipePathHint: '.nebular/recipes/weather.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['weather']
    }
  });
  const recipe = decodeAndAdmitRecipeXml(RECIPE_XML);
  const repository = parseCanonicalRepository(REPOSITORY_TEXT);
  const revision = parseRecipeRevision('revision-1');
  const grantId = parseGrantId('grant-1');
  const slotId = parseCredentialSlotId('weather');
  if (request.isErr() || request.value.messageKind !== 'request' || recipe.isErr() || repository.isErr() ||
      revision.isErr() || grantId.isErr() || slotId.isErr()) throw new Error('invalid launch fixture');
  return {
    request: request.value,
    recipe: {
      repository: repository.value,
      relativePath: '.nebular/recipes/weather.xml',
      revision: revision.value,
      credentialSlotIds: [slotId.value],
      admittedRecipe: recipe.value
    },
    grant: {
      id: grantId.value,
      generation: 2,
      repository: repository.value,
      recipeRevision: revision.value,
      credentialSlotIds: [slotId.value],
      expiresAtMs: 50_000,
      revoked: false
    },
    admittedSlotIds: [slotId.value]
  };
};

const pathKind = (path: string): 'directory' | 'regular-file' =>
  /(?:stdout\.log|stderr\.log|process\.pid)$/u.test(path) ? 'regular-file' : 'directory';

const filesystem = (): BunWindowsFilesystemFactsRuntime => ({
  currentProcess: () => ({
    platform: 'win32',
    runtime: 'bun',
    executablePath: BUN_EXECUTABLE
  }),
  inspect: request => Promise.resolve({
    platform: 'win32',
    repository: {
      requestedPath: request.repositoryPath,
      canonicalPath: request.repositoryPath,
      kind: 'directory',
      traversesReparsePoint: false
    },
    workingDirectory: {
      requestedPath: request.workingDirectoryPath,
      canonicalPath: request.workingDirectoryPath,
      kind: 'directory',
      traversesReparsePoint: false
    }
  }),
  inspectExistingFile: request => Promise.resolve({
    role: request.role,
    requestedPath: request.path,
    canonicalPath: request.path,
    kind: 'regular-file',
    traversesReparsePoint: false
  }),
  inspectExistingPath: path => Promise.resolve({
    requestedPath: path,
    canonicalPath: path,
    kind: pathKind(path),
    traversesReparsePoint: false
  })
});

type HarnessMode = 'active' | 'terminal' | 'job-failure' | 'job-failure-once';

type Harness = Readonly<{
  config: WindowsPm2OneShotLaunchConfig;
  ports: WindowsPm2OneShotLaunchPorts;
  events: string[];
  starts: ExactOneShotStart<Pm2OneShotLaunchPayload>[];
  bootstrapBinds: BindBootstrapAttempt[];
  binds: BindVerifiedWindowsContainmentAndStart[];
}>;

const harness = (mode: HarnessMode = 'active'): Harness => {
  const pool = createOneShotSlotPool('nebular-one-shot', 1);
  const profile = { kind: 'trusted-profile-root' as const, value: PROFILE_ROOT };
  const incarnation = parseProcessIncarnation(INCARNATION_TEXT);
  if (pool.outcome === 'failure' || incarnation.type === 'err') throw new Error('invalid launch fixture');
  const slot = pool.value.slots[0];
  if (slot === undefined) throw new Error('invalid launch fixture');
  const events: string[] = [];
  const starts: ExactOneShotStart<Pm2OneShotLaunchPayload>[] = [];
  const bootstrapBinds: BindBootstrapAttempt[] = [];
  const binds: BindVerifiedWindowsContainmentAndStart[] = [];
  let lockDepth = 0;
  let observationCount = 0;
  let containmentVerificationCount = 0;
  let durable: GrantQualifiedMaterializingAttemptRecord | null = null;

  const observed = (): readonly OneShotSlotObservation[] => {
    const start = starts[0];
    if (start === undefined || observationCount < 3) return [{ ...slot, occupant: { kind: 'empty' } }];
    return [{
      ...slot,
      occupant: {
        kind: 'owned',
        pmId: PM_ID,
        pid: mode === 'terminal' ? null : PROCESS_ID,
        status: mode === 'terminal' ? 'stopped' : 'online',
        ...(mode === 'terminal' ? { exitCode: 7 } : {}),
        metadata: start.metadata,
        cleanupProof: 'unconfirmed'
      }
    }];
  };

  const artifacts: WindowsOneShotArtifactRuntimePort = {
    inspectExistingPath: path => Promise.resolve({
      requestedPath: path,
      canonicalPath: path,
      kind: pathKind(path),
      traversesReparsePoint: false
    }),
    ensureDirectory: path => {
      events.push(`artifact-directory:${lockDepth}:${path}`);
      return Promise.resolve('created');
    },
    createExclusiveFile: path => {
      events.push(`artifact-file:${lockDepth}:${path}`);
      return Promise.resolve('created');
    },
    readBoundedFile: () => Promise.resolve({
      state: 'read',
      text: mode === 'job-failure' ? 'invalid' : String(PROCESS_ID)
    }),
    removeFile: () => Promise.resolve('removed'),
    removeDirectoryIfEmpty: () => Promise.resolve('removed')
  };

  const config: WindowsPm2OneShotLaunchConfig = {
    trustedProfileRoot: profile,
    brokerEntrypointPath: BROKER_ENTRYPOINT,
    pool: pool.value,
    allowedNonsecretEnvironmentNames: ['REGION']
  };
  const ports: WindowsPm2OneShotLaunchPorts = {
    filesystem: filesystem(),
    artifacts,
    attempts: {
      readGrantQualifiedMaterializing: () => Promise.resolve(journalOk(durable)),
      reserveGrantQualifiedMaterializing: (command: ReserveGrantQualifiedMaterializingAttempt) => {
        if (durable !== null) {
          events.push('journal-replayed');
          return Promise.resolve(journalOk({ status: 'already-committed', record: durable }));
        }
        const record: GrantQualifiedMaterializingAttemptRecord = {
          attempt: {
            ...command.reservation.attempt,
            receiverCorrelation: command.materialization.receiverCorrelation,
            state: 'materializing',
            stateVersion: 2,
            updatedAtMs: command.materialization.atMs
          },
          authority: command.authority,
          admission: command.admission
        };
        durable = record;
        events.push('journal-reserved');
        return Promise.resolve(journalOk({ status: 'committed', record }));
      },
      bindBootstrap: command => {
        bootstrapBinds.push(command);
        events.push('journal-bootstrap-ready');
        if (durable === null) return Promise.resolve({
          type: 'err',
          issues: [{ code: 'journal-not-found' as const, message: 'missing fixture' }]
        });
        const attempt: BootstrapAttemptJournalRecord = {
          ...durable.attempt,
          stateVersion: durable.attempt.stateVersion + 1,
          updatedAtMs: command.atMs,
          bootstrapBinding: command.binding
        };
        const record: GrantQualifiedMaterializingAttemptRecord = { ...durable, attempt };
        durable = record;
        return Promise.resolve(journalOk({ status: 'committed', record: attempt }));
      },
      bindVerifiedWindowsContainmentAndStart: command => {
        binds.push(command);
        events.push('journal-contained-running');
        if (durable === null) return Promise.resolve({
          type: 'err',
          issues: [{ code: 'journal-not-found', message: 'missing fixture' }]
        });
        const binding = command.binding;
        const record = {
          attempt: {
            ...durable.attempt,
            state: 'running' as const,
            stateVersion: durable.attempt.stateVersion + 1,
            updatedAtMs: binding.membershipVerifiedAtMs,
            bootstrapBinding: {
              format: 'bootstrap-attempt-binding/v2' as const,
              bindingGeneration: binding.bindingGeneration,
              grantId: binding.grantId,
              grantGeneration: binding.grantGeneration,
              receiverId: binding.receiverId,
              receiverEntryIdentity: binding.receiverEntryIdentity,
              helperParentProcessId: binding.rootProcessId,
              helperParentProcessIncarnation: binding.rootProcessIncarnation,
              recipeLocator: binding.recipeLocator
            }
          },
          authority: durable.authority,
          admission: durable.admission,
          containmentBinding: binding
        };
        return Promise.resolve(journalOk({ status: 'committed', record }));
      }
    },
    receiver: {
      probe: () => {
        events.push('receiver-probe');
        return Promise.resolve({ outcome: 'success', value: undefined });
      },
      withAllocationLock: (_namespace, work) => {
        events.push('lock-enter');
        lockDepth += 1;
        return work().then(result => {
          lockDepth -= 1;
          events.push('lock-exit');
          return result;
        });
      },
      observe: () => {
        observationCount += 1;
        events.push(`receiver-observe:${observationCount}`);
        return Promise.resolve({ outcome: 'success', value: observed() });
      },
      startExact: request => {
        events.push(`receiver-start-exact:${lockDepth}`);
        starts.push(request);
        return Promise.resolve({ outcome: 'success', value: undefined });
      }
    },
    processIncarnations: {
      readCurrentIncarnation: query => {
        events.push('process-incarnation');
        return Promise.resolve({
          status: 'running',
          processId: query.processId,
          incarnation: incarnation.value
        });
      }
    },
    containment: {
      observeBootstrapRoot: request => {
        events.push('job-root-observation');
        const job = deriveWindowsNamedJobIdentity({
          trustedProfileRoot: profile,
          namespace: pool.value.namespace
        }, request);
        return Promise.resolve(mode === 'job-failure' || job.isErr()
          ? { status: 'ambiguous' as const, reason: 'policy-conflict' as const }
          : { status: 'ready' as const, job: job.value, processId: PROCESS_ID });
      },
      verifyExactProcess: request => {
        containmentVerificationCount += 1;
        events.push('job-membership');
        if (mode === 'job-failure' || (mode === 'job-failure-once' && containmentVerificationCount === 2)) {
          return Promise.resolve(brokerErr({
          code: 'receiver-failed',
          message: 'fixture denial'
          }));
        }
        const job = deriveWindowsNamedJobIdentity({
          trustedProfileRoot: profile,
          namespace: pool.value.namespace
        }, request);
        return Promise.resolve(job.isErr()
          ? brokerErr({ code: 'receiver-failed', message: 'fixture denial' })
          : brokerOk({
              state: 'verified-contained',
              job: job.value,
              processId: request.processId,
              processIncarnation: request.processIncarnation
            }));
      },
      terminateAndProveEmpty: () => Promise.resolve(brokerErr({
        code: 'receiver-failed',
        message: 'terminal cleanup is outside this fixture'
      }))
    },
    timing: {
      confirmationAttempts: 2,
      confirmationIntervalMs: 0,
      now: () => 1_200,
      wait: () => Promise.resolve()
    }
  };
  return { config, ports, events, starts, bootstrapBinds, binds };
};

describe('production Windows grant-qualified PM2 one-shot launch', () => {
  it('uses canonical target facts, prepares artifacts under the exact-slot lock, then atomically binds Job proof', async () => {
    const fixture = harness();
    const outcome = await createWindowsPm2OneShotLaunchPort(fixture.config, fixture.ports)
      .launch(authorizedExecution(), 1_000);

    expect(outcome.state).toBe('launched');
    expect(fixture.starts).toHaveLength(1);
    expect(fixture.starts[0]?.payload).toMatchObject({
      executablePath: BUN_EXECUTABLE,
      cwd: REPOSITORY_TEXT,
      args: [TARGET_ENTRYPOINT, '--forecast'],
      managedBootstrap: {
        brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: BROKER_ENTRYPOINT }
      }
    });
    expect(fixture.events.filter(event => event.startsWith('artifact-file:'))).toHaveLength(3);
    expect(fixture.events.filter(event => event.startsWith('artifact-file:'))
      .every(event => event.startsWith('artifact-file:1:'))).toBe(true);
    expect(fixture.events).toContain('receiver-start-exact:1');
    expect(fixture.events.indexOf('process-incarnation')).toBeLessThan(fixture.events.indexOf('job-membership'));
    expect(fixture.events.indexOf('job-membership')).toBeLessThan(fixture.events.indexOf('journal-bootstrap-ready'));
    expect(fixture.events.indexOf('journal-bootstrap-ready')).toBeLessThan(
      fixture.events.indexOf('journal-contained-running')
    );
    expect(fixture.bootstrapBinds).toHaveLength(1);
    expect(fixture.events.indexOf('job-membership')).toBeLessThan(fixture.events.indexOf('journal-contained-running'));
    expect(fixture.binds).toHaveLength(1);
    expect(fixture.binds[0]?.binding).toMatchObject({
      receiverPmId: PM_ID,
      rootProcessId: PROCESS_ID,
      jobPolicy: {
        extendedLimit: 'kill-on-job-close-only',
        uiRestrictions: 'none',
        breakaway: 'forbidden'
      },
      membershipVerifiedAtMs: 1_200
    });
    if (outcome.state !== 'launched') throw new Error('unexpected launch outcome');
    expect(outcome.receipt.reservation.launch.payload.args).toEqual([TARGET_ENTRYPOINT, '--forecast']);
    expect(outcome.receipt.start.processId).toBe(PROCESS_ID);
    expect(outcome.receipt.containedAttempt.attempt.state).toBe('running');
    const terminal = await waitForGrantQualifiedOneShotTerminal(
      outcome.receipt.reservation,
      fixture.config.pool,
      outcome.receipt.start,
      new AbortController().signal,
      {
        observe: () => Promise.resolve({
          outcome: 'success',
          value: [{
            ...outcome.receipt.reservation.slot,
            occupant: {
              kind: 'owned',
              pmId: outcome.receipt.start.handle.pmId,
              pid: null,
              status: 'stopped',
              exitCode: 0,
              metadata: {
                slotId: outcome.receipt.reservation.slot.slotId,
                attemptId: outcome.receipt.reservation.launch.attemptId,
                metadataDigest: outcome.receipt.reservation.launch.metadataDigest,
                startedAtMs: outcome.receipt.reservation.launch.startedAtMs,
                deadlineAtMs: outcome.receipt.reservation.launch.deadlineAtMs
              },
              cleanupProof: 'unconfirmed'
            }
          }]
        }),
        now: () => 1_300,
        wait: () => Promise.resolve()
      }
    );
    expect(terminal).toMatchObject({
      outcome: 'success',
      value: { state: 'exact-terminal-observed', exitCode: 0 }
    });
  });

  it('requires recovery for an immediate terminal while preserving exact evidence without claiming cleanup', async () => {
    const fixture = harness('terminal');
    const outcome = await createWindowsPm2OneShotLaunchPort(fixture.config, fixture.ports)
      .launch(authorizedExecution(), 1_000);

    expect(outcome).toMatchObject({
      state: 'recovery-required',
      stage: 'terminal-before-containment'
    });
    expect(fixture.bootstrapBinds).toHaveLength(1);
    expect(fixture.binds).toHaveLength(0);
    expect(fixture.events).toContain('process-incarnation');
    if (outcome.state !== 'recovery-required' || outcome.receipt === null) {
      throw new Error('unexpected terminal recovery outcome');
    }
    if (outcome.receipt.start === null) throw new Error('missing exact terminal receipt');
    expect(outcome.receipt.start.state).toBe('exact-terminal-confirmed');
    expect(outcome.receipt.containedAttempt).toBeNull();
  });

  it('replays an exact durable materializing reservation without preparing artifacts or starting PM2 twice', async () => {
    const fixture = harness('job-failure-once');
    const launch = createWindowsPm2OneShotLaunchPort(fixture.config, fixture.ports);
    const interrupted = await launch.launch(authorizedExecution(), 1_000);

    expect(interrupted).toMatchObject({ state: 'recovery-required', stage: 'job-containment' });
    expect(fixture.starts).toHaveLength(1);
    const preparedBeforeReplay = fixture.events.filter(event => event.startsWith('artifact-file:')).length;
    const startsBeforeReplay = fixture.events.filter(event => event.startsWith('receiver-start-exact:')).length;

    const replayed = await launch.launch(authorizedExecution(), 1_500);

    expect(replayed.state).toBe('replayed');
    expect(fixture.starts).toHaveLength(1);
    expect(fixture.events.filter(event => event.startsWith('artifact-file:'))).toHaveLength(preparedBeforeReplay);
    expect(fixture.events.filter(event => event.startsWith('receiver-start-exact:'))).toHaveLength(startsBeforeReplay);
    expect(fixture.events).toContain('journal-replayed');
    expect(fixture.binds).toHaveLength(1);
    if (replayed.state !== 'replayed') throw new Error('unexpected replay outcome');
    expect(replayed.receipt).toMatchObject({
      format: 'windows-pm2-one-shot-launch-receipt/v1',
      reservation: {
        state: 'materializing-reserved',
        status: 'already-committed',
        launch: { payload: { args: [TARGET_ENTRYPOINT, '--forecast'] } }
      },
      start: {
        state: 'exact-start-confirmed',
        disposition: 'already-started',
        processId: PROCESS_ID
      },
      containedAttempt: {
        attempt: { state: 'running' },
        containmentBinding: {
          receiverPmId: PM_ID,
          rootProcessId: PROCESS_ID,
          jobPolicy: {
            extendedLimit: 'kill-on-job-close-only',
            uiRestrictions: 'none',
            breakaway: 'forbidden'
          }
        }
      }
    });
  });

  it('retains the exact active receipt but never binds bootstrap authority when Job proof fails', async () => {
    const fixture = harness('job-failure');
    const outcome = await createWindowsPm2OneShotLaunchPort(fixture.config, fixture.ports)
      .launch(authorizedExecution(), 1_000);

    expect(outcome).toMatchObject({ state: 'recovery-required', stage: 'job-containment' });
    expect(fixture.binds).toHaveLength(0);
    if (outcome.state !== 'recovery-required' || outcome.receipt?.start === null ||
        outcome.receipt?.start === undefined) throw new Error('missing recovery receipt');
    expect(outcome.receipt.start.state).toBe('exact-start-confirmed');
  });
});
