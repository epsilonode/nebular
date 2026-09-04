import type { Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { decodeBrokerControlMessage, type BrokerRequestMessage } from '../broker-client/public.ts';
import {
  authorityTaskOk,
  resolveAndAuthorizeExecution,
  type BrokerAuthorityPorts
} from '../broker/authority.ts';
import { journalOk, type ReserveGrantQualifiedMaterializingAttempt } from '../broker/journal.ts';
import { parseCredentialReference } from '../broker/lease.ts';
import { startGrantQualifiedOneShotReservation } from '../broker/grant-qualified-one-shot-start.ts';
import {
  reserveGrantQualifiedOneShotMaterialization,
  type OneShotMaterializationReservationPorts
} from '../broker/one-shot-materialization-reservation.ts';
import { createOneShotSlotPool } from '../broker/one-shot-slots.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from '../broker/primitives.ts';
import { planAuthorizedRecipeMaterialization } from '../broker/recipe-materialization-plan.ts';
import { brokerOk, type BrokerResult } from '../broker/result.ts';
import { decodeAndAdmitRecipeXml } from '../recipe-contract/public.ts';

const recipeLocator = '.nebular/recipes/weather.xml';
const revisionValue = 'revision-1';
const privateCanaries = [
  'credential-reference-private-canary',
  'provider-private-canary',
  'account-private-canary',
  'scope-private-canary',
  'operation-private-canary'
] as const;

const recipeXml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source tool="bun" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="bun"><arg>src/main.ts</arg></exec>
  <stop-policy value="ephemeral-safe-to-stop" />
  <credential-slot id="weather" provider="provider-private-canary" account="account-private-canary" environment="development" delivery="environment" inject="WEATHER_KEY">
    <scope>scope-private-canary</scope><operation>operation-private-canary</operation>
  </credential-slot>
</recipe>`;

const unwrap = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('invalid seam fixture');
  return result.value;
};

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('invalid broker seam fixture');
  return result.value;
};

const request = (): BrokerRequestMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'authority-plan-reservation-1',
    sequence: 1,
    sentAtMs: 1_000,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:\\untrusted-hint',
      recipePathHint: recipeLocator,
      recipeRevision: revisionValue,
      credentialSlotIds: ['weather']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('invalid request fixture');
  return decoded.value;
};

describe('authority to redacted plan to durable one-shot reservation seam', () => {
  it('preserves request idempotency while credential authority is absent from every downstream projection', async () => {
    const recipe = decodeAndAdmitRecipeXml(recipeXml);
    if (recipe.isErr()) throw new Error('invalid recipe fixture');
    const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\repository'));
    const revision = unwrapBroker(parseRecipeRevision(revisionValue));
    const slot = unwrapBroker(parseCredentialSlotId('weather'));
    const grantId = unwrapBroker(parseGrantId('grant-1'));
    const authorityPorts: BrokerAuthorityPorts = {
      canonicalizeRepository: () => authorityTaskOk(repository),
      resolveRecipe: () => authorityTaskOk({
        repository,
        relativePath: recipeLocator,
        revision,
        credentialSlotIds: [slot],
        admittedRecipe: recipe.value
      }),
      readGrant: () => authorityTaskOk({
        id: grantId,
        generation: 2,
        repository,
        recipeRevision: revision,
        credentialBindings: [{
          slotId: slot,
          credentialReference: unwrap(parseCredentialReference(privateCanaries[0]))
        }],
        expiresAtMs: 10_000,
        revoked: false
      })
    };
    const authorized = await resolveAndAuthorizeExecution(request(), 1_000, authorityPorts);
    if (authorized.isErr()) throw new Error('authority seam rejected fixture');
    const planned = await planAuthorizedRecipeMaterialization(authorized.value, {
      paths: {
        resolveWorkingDirectory: () => Promise.resolve(brokerOk({
          kind: 'canonical-windows-working-directory',
          value: 'R:\\Code\\repository',
          repository,
          relativePath: { kind: 'repository-relative-windows-directory', value: '.' }
        }))
      },
      tools: {
        resolve: () => Promise.resolve(brokerOk({
          kind: 'cooperative-bun-v1',
          executable: { kind: 'canonical-current-bun-executable', value: 'C:\\Tools\\bun.exe' },
          brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: 'R:\\Code\\nebular\\broker.js' }
        }))
      },
      targetEntrypoints: {
        resolveTargetEntrypoint: input => Promise.resolve(brokerOk({
          kind: 'canonical-windows-target-entrypoint',
          value: 'R:\\Code\\repository\\src\\main.ts',
          repository: input.repository,
          workingDirectory: input.workingDirectory,
          relativePath: {
            kind: 'repository-relative-windows-target-entrypoint',
            value: input.declaredEntrypoint
          }
        }))
      }
    });
    if (planned.isErr()) throw new Error('planning seam rejected fixture');
    const pool = createOneShotSlotPool('nebular-one-shot', 1);
    if (pool.outcome === 'failure') throw new Error('invalid pool fixture');
    const selectedSlot = pool.value.slots.at(0);
    if (selectedSlot === undefined) throw new Error('invalid pool fixture');
    const commands: ReserveGrantQualifiedMaterializingAttempt[] = [];
    const reservationPorts: OneShotMaterializationReservationPorts = {
      withAllocationLock: (_namespace, work) => work(),
      observe: () => Promise.resolve({
        outcome: 'success',
        value: [{ ...selectedSlot, occupant: { kind: 'empty' } }]
      }),
      attempts: {
        readGrantQualifiedMaterializing: () => Promise.resolve(journalOk(null)),
        reserveGrantQualifiedMaterializing: command => {
          commands.push(command);
          return Promise.resolve(journalOk({
            status: 'committed',
            record: {
              attempt: {
                ...command.reservation.attempt,
                receiverCorrelation: command.materialization.receiverCorrelation,
                state: 'materializing',
                stateVersion: 2,
                updatedAtMs: command.materialization.atMs
              },
              authority: command.authority,
              admission: command.admission
            }
          }));
        }
      }
    };
    const reserved = await reserveGrantQualifiedOneShotMaterialization(
      planned.value,
      1_000,
      pool.value,
      {
        finalizeForSlot: context => ({
          outcome: 'success',
          value: {
            attemptId: context.identity.attemptId,
            metadataDigest: 'c'.repeat(64),
            startedAtMs: context.startedAtMs,
            deadlineAtMs: context.deadlineAtMs,
            payload: { entrypoint: 'src/main.ts' }
          }
        })
      },
      reservationPorts
    );

    expect(planned.value.requestId).toBe('authority-plan-reservation-1');
    expect(reserved.outcome).toBe('success');
    expect(commands).toHaveLength(1);
    if (reserved.outcome === 'failure') throw new Error('reservation seam rejected fixture');
    const startEvents: string[] = [];
    let observation = 0;
    const started = await startGrantQualifiedOneShotReservation(
      reserved.value,
      pool.value,
      {
        withAllocationLock: (_namespace, work) => {
          startEvents.push('lock');
          return work();
        },
        attempts: {
          readGrantQualifiedMaterializing: () => {
            startEvents.push('read-exact-admission');
            return Promise.resolve(journalOk({
              attempt: reserved.value.attempt,
              authority: reserved.value.authority,
              admission: reserved.value.admission
            }));
          }
        },
        observe: () => {
          startEvents.push('observe-exact-slot');
          observation += 1;
          return Promise.resolve({
            outcome: 'success',
            value: [{
              ...selectedSlot,
              occupant: observation === 1
                ? { kind: 'empty' as const }
                : {
                    kind: 'owned' as const,
                    pmId: 7,
                    pid: 4_200,
                    status: 'online' as const,
                    metadata: {
                      slotId: selectedSlot.slotId,
                      attemptId: reserved.value.launch.attemptId,
                      metadataDigest: reserved.value.launch.metadataDigest,
                      startedAtMs: reserved.value.launch.startedAtMs,
                      deadlineAtMs: reserved.value.launch.deadlineAtMs
                    },
                    cleanupProof: 'unconfirmed' as const
                  }
            }]
          });
        },
        prepareExactStart: () => {
          startEvents.push('prepare-exact-start');
          return Promise.resolve({ outcome: 'success', value: undefined });
        },
        startExact: () => {
          startEvents.push('start-exact');
          return Promise.resolve({ outcome: 'success', value: undefined });
        }
      },
      {
        confirmationAttempts: 2,
        confirmationIntervalMs: 0,
        now: () => 2_000,
        wait: () => Promise.resolve()
      }
    );

    expect(started).toMatchObject({
      outcome: 'success',
      value: { state: 'exact-start-confirmed', disposition: 'started', processId: 4_200 }
    });
    expect(startEvents).toEqual([
      'lock',
      'read-exact-admission',
      'observe-exact-slot',
      'prepare-exact-start',
      'start-exact',
      'observe-exact-slot'
    ]);
    expect(commands).toHaveLength(1);
    const serialized = JSON.stringify([planned.value, commands, reserved]);
    privateCanaries.forEach(canary => expect(serialized).not.toContain(canary));
    expect(serialized).not.toContain('credentialReference');
    expect(serialized).not.toContain('credentialBindings');
  });
});
