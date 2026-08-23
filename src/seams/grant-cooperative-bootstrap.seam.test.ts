import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapRequest,
  decodeBootstrapProtocolMessage,
  type BootstrapAcknowledgementMessage,
  type BootstrapDeliveryMessage
} from '../broker-client/public.ts';
import {
  prepareRecipeEnvironmentThenImport,
  type CooperativeBootstrapPorts
} from '../broker-client/public.ts';
import { clientOk } from '../broker-client/result.ts';
import {
  authorizeSecretLease,
  parseCredentialReference,
  parseSecretLeaseId,
  type AuthorizedSecretLease,
  type SecretDeliveryGrant,
  type SecretLeaseRequest,
  type SecretSlotBinding
} from '../broker/lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from '../broker/primitives.ts';

const authorizedLease = (): AuthorizedSecretLease => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const recipeRevision = parseRecipeRevision('recipe-revision-1');
  const grantId = parseGrantId('grant-1');
  const slotId = parseCredentialSlotId('weather-api');
  const credentialReference = parseCredentialReference('credential-1');
  const leaseId = parseSecretLeaseId('lease-1');
  const receiverId = parseReceiverId('pm2');
  const processAttemptId = parseProcessAttemptId('attempt-1');
  if (repository.isErr() || recipeRevision.isErr() || grantId.isErr() || slotId.isErr() ||
      credentialReference.isErr() || leaseId.isErr() || receiverId.isErr() || processAttemptId.isErr()) {
    throw new Error('expected valid grant-to-cooperative-bootstrap fixture');
  }
  const binding: SecretSlotBinding = {
    slotId: slotId.value,
    credentialReference: credentialReference.value,
    environmentName: 'WEATHER_API_TOKEN'
  };
  const grant: SecretDeliveryGrant = {
    id: grantId.value,
    generation: 3,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    bindings: [binding],
    expiresAtMs: 2_000,
    revoked: false,
    exposureMode: 'cooperative-bootstrap'
  };
  const request: SecretLeaseRequest = {
    id: leaseId.value,
    grantId: grantId.value,
    grantGeneration: 3,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    receiverId: receiverId.value,
    processAttemptId: processAttemptId.value,
    bindings: [binding],
    requestedAtMs: 1_000,
    expiresAtMs: 1_500,
    exposureMode: 'cooperative-bootstrap'
  };
  const authorized = authorizeSecretLease(grant, request, 1_000);
  if (authorized.isErr()) throw new Error('expected authorized secret lease fixture');
  return authorized.value;
};

describe('repository grant to cooperative bootstrap seam', () => {
  it('narrows one authorized lease into one attempt-bound atomic patch before application evaluation', async () => {
    const lease = authorizedLease();
    const request = createBootstrapRequest({
      exchangeId: 'bootstrap-1',
      repository: lease.facts.repository,
      recipeRevision: lease.facts.recipeRevision,
      grantId: lease.facts.grantId,
      grantGeneration: lease.facts.grantGeneration,
      receiverId: lease.facts.receiverId,
      processAttemptId: lease.facts.processAttemptId,
      slots: lease.facts.bindings.map(binding => ({
        slotId: binding.slotId,
        environmentName: binding.environmentName
      }))
    });
    if (request.isErr()) throw new Error('expected bootstrap request projected from authorized lease');

    const canary = 'SECRET_CANARY_GRANT_TO_BOOTSTRAP';
    const decoded = decodeBootstrapProtocolMessage({
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-delivery',
      exchangeId: request.value.exchangeId.value,
      payload: {
        leaseId: lease.facts.id.value,
        processAttemptId: lease.facts.processAttemptId,
        expiresAtMs: lease.facts.expiresAtMs,
        slots: lease.facts.bindings.map(binding => ({
          slotId: binding.slotId,
          environmentName: binding.environmentName,
          secret: canary
        }))
      }
    });
    if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-delivery') {
      throw new Error('expected attempt-bound secret delivery fixture');
    }
    const delivery: BootstrapDeliveryMessage = decoded.value;
    const events: string[] = [];
    let observedInsideInstaller = false;
    let acknowledgement: BootstrapAcknowledgementMessage | undefined;
    const ports: CooperativeBootstrapPorts = {
      clock: { nowMs: () => 1_001 },
      transport: {
        exchange: (received, consume) => {
          expect(received.payload.authority.repository.value).toBe(lease.facts.repository);
          expect(received.payload.authority.recipeRevision.value).toBe(lease.facts.recipeRevision);
          expect(received.payload.authority.grantId.value).toBe(lease.facts.grantId);
          expect(received.payload.authority.grantGeneration).toBe(lease.facts.grantGeneration);
          expect(received.payload.attempt.receiverId.value).toBe(lease.facts.receiverId);
          expect(received.payload.attempt.processAttemptId.value).toBe(lease.facts.processAttemptId);
          return consume(delivery).then(result => {
            if (result.isOk()) acknowledgement = result.value.acknowledgement;
            return result;
          });
        }
      },
      environment: {
        installAtomically: patch => Promise.resolve((() => {
          events.push('atomic-install');
          patch.entries.forEach(entry => entry.secret.withValue(value => {
            observedInsideInstaller = value === canary;
          }));
          return clientOk({ atomic: true, installedSlots: patch.slots });
        })())
      }
    };

    const loaded = await prepareRecipeEnvironmentThenImport({
      request: request.value,
      inheritedEnvironmentNames: ['PATH', 'CI']
    }, ports, () => {
      events.push('application-evaluated');
      return Promise.resolve({ started: true as const });
    });

    expect(loaded).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        environment: expect.objectContaining({
          state: 'prepared',
          leaseId: { kind: 'bootstrap-lease-id', value: 'lease-1' },
          processAttemptId: { kind: 'bootstrap-process-attempt-id', value: 'attempt-1' },
          installedSlots: [{
            slotId: { kind: 'bootstrap-slot-id', value: 'weather-api' },
            environmentName: 'WEATHER_API_TOKEN'
          }]
        }),
        application: { started: true }
      })
    }));
    expect(events).toEqual(['atomic-install', 'application-evaluated']);
    expect(observedInsideInstaller).toBe(true);
    expect(acknowledgement).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        installedSlotIds: [{ kind: 'bootstrap-slot-id', value: 'weather-api' }],
        installedSlotCount: 1
      })
    }));
    expect(JSON.stringify({ loaded, acknowledgement, events })).not.toContain(canary);
  });
});
