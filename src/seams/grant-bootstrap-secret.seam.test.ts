import { describe, expect, it } from 'vitest';

import {
  authorizeSecretLease,
  parseCredentialReference,
  parseSecretLeaseId,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type AuthorizedSecretLease,
  type SecretDeliveryGrant,
  type SecretLeaseRequest,
  type SecretSlotBinding
} from '../broker/lease.ts';
import {
  deliverAuthorizedSecretLease,
  type BootstrapSecretPort,
  type BootstrapSecretSink,
  type ScopedSecret,
  type SecretDeliveryPorts,
  type SecretStoreLeasePort
} from '../broker/secret-delivery.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from '../broker/primitives.ts';

type FakeEvent =
  | Readonly<{ type: 'bootstrap-cleared' }>
  | Readonly<{ type: 'bootstrap-opened' }>
  | Readonly<{ type: 'secret-acquired' }>
  | Readonly<{ type: 'secret-installed'; environmentName: string }>
  | Readonly<{ type: 'secret-released' }>;

type FakeInspection = Readonly<{
  events: readonly FakeEvent[];
  secretObservedOnlyInsideBootstrap: boolean;
  scopedSecretJson: string;
}>;

type FakeInspector = Readonly<{
  inspect: () => FakeInspection;
}>;

type SecretDeliveryFake = Readonly<{
  ports: SecretDeliveryPorts;
  inspector: FakeInspector;
}>;

const typedLeaseFixture = (): AuthorizedSecretLease => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('recipe-revision-1');
  const grantId = parseGrantId('grant-1');
  const slotId = parseCredentialSlotId('weather-api');
  const reference = parseCredentialReference('credential-1');
  const leaseId = parseSecretLeaseId('lease-1');
  const receiverId = parseReceiverId('pm2');
  const processAttemptId = parseProcessAttemptId('attempt-1');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slotId.isErr() || reference.isErr() ||
      leaseId.isErr() || receiverId.isErr() || processAttemptId.isErr()) {
    throw new Error('typed grant-to-bootstrap fixture construction failed');
  }
  const binding: SecretSlotBinding = {
    slotId: slotId.value,
    credentialReference: reference.value,
    environmentName: 'WEATHER_API_TOKEN'
  };
  const grant: SecretDeliveryGrant = {
    id: grantId.value,
    generation: 3,
    repository: repository.value,
    recipeRevision: revision.value,
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
    recipeRevision: revision.value,
    receiverId: receiverId.value,
    processAttemptId: processAttemptId.value,
    bindings: [binding],
    requestedAtMs: 1_000,
    expiresAtMs: 1_500,
    exposureMode: 'cooperative-bootstrap'
  };
  const lease = authorizeSecretLease(grant, request, 1_000);
  if (lease.isErr()) throw new Error('expected authorized secret lease fixture');
  return lease.value;
};

const createSecretDeliveryFake = (
  canary: string,
  behavior: 'success' | 'secret-unavailable' | 'bootstrap-rejected' = 'success'
): SecretDeliveryFake => {
  const events: FakeEvent[] = [];
  const times = [1_001, 1_002];
  let secretObservedOnlyInsideBootstrap = false;
  let scopedSecretJson = '';

  const store: SecretStoreLeasePort = {
    withSecret: (_reference, use) => {
      events.push({ type: 'secret-acquired' });
      if (behavior === 'secret-unavailable') {
        return secretLeaseTaskErr({ code: 'secret-unavailable', message: 'The credential is unavailable.' });
      }
      let scopedValue: string | undefined = canary;
      const secret: ScopedSecret = {
        deliverTo: (sink, slot) => {
          scopedSecretJson = JSON.stringify(secret);
          return scopedValue === undefined
            ? secretLeaseErr({ code: 'secret-unavailable', message: 'The credential lease is no longer active.' })
            : sink.install(slot, scopedValue);
        }
      };
      const result = use(secret);
      scopedValue = undefined;
      events.push({ type: 'secret-released' });
      return result.isErr()
        ? secretLeaseTaskErr(result.error[0], ...result.error.slice(1))
        : secretLeaseTaskOk(undefined);
    }
  };

  const bootstrap: BootstrapSecretPort = {
    runWithSecrets: (context, install) => {
      events.push({ type: 'bootstrap-opened' });
      const staged = new Map<string, string>();
      const sink: BootstrapSecretSink = {
        install: (slot, value) => {
          events.push({ type: 'secret-installed', environmentName: slot.environmentName });
          secretObservedOnlyInsideBootstrap = value === canary;
          if (behavior === 'bootstrap-rejected') {
            return secretLeaseErr({ code: 'bootstrap-rejected', message: 'Bootstrap rejected secret installation.' });
          }
          staged.set(slot.environmentName, value);
          return secretLeaseOk(undefined);
        }
      };
      return install(sink).andThen(() => {
        const installedSlotIds: readonly (typeof context.slots[number]['slotId'])[] = context.slots
          .map(slot => slot.slotId);
        staged.clear();
        events.push({ type: 'bootstrap-cleared' });
        return secretLeaseTaskOk({
            leaseId: context.leaseId,
            processAttemptId: context.processAttemptId,
            installedSlotIds,
            secretsCleared: true as const
          });
      }).orElse(issues => {
        staged.clear();
        events.push({ type: 'bootstrap-cleared' });
        return secretLeaseTaskErr(issues[0], ...issues.slice(1));
      });
    }
  };

  return {
    ports: {
      clock: {
        nowMs: () => times.shift() ?? 1_002
      },
      secretStore: store,
      bootstrap
    },
    inspector: {
      inspect: () => ({ events: [...events], secretObservedOnlyInsideBootstrap, scopedSecretJson })
    }
  };
};

describe('grant to bootstrap secret delivery seam', () => {
  it('crosses raw secret text only through the scoped bootstrap callback and clears both scopes', async () => {
    const canary = 'SECRET_CANARY_DO_NOT_REPORT';
    const fake = createSecretDeliveryFake(canary);
    const result = await deliverAuthorizedSecretLease(typedLeaseFixture(), fake.ports);
    const inspection = fake.inspector.inspect();

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        outcome: 'completed',
        deliveredSlotIds: ['weather-api'],
        secretsCleared: true,
        lease: expect.objectContaining({ state: 'consumed' })
      })
    }));
    expect(inspection.secretObservedOnlyInsideBootstrap).toBe(true);
    expect(inspection.scopedSecretJson).toBe('{}');
    expect(inspection.events).toEqual([
      { type: 'bootstrap-opened' },
      { type: 'secret-acquired' },
      { type: 'secret-installed', environmentName: 'WEATHER_API_TOKEN' },
      { type: 'secret-released' },
      { type: 'bootstrap-cleared' }
    ]);
    expect(JSON.stringify({ result, inspection })).not.toContain(canary);
  });

  it('revokes the lease and clears bootstrap staging when the store cannot acquire a secret', async () => {
    const canary = 'SECRET_CANARY_NEVER_ACQUIRED';
    const fake = createSecretDeliveryFake(canary, 'secret-unavailable');
    const result = await deliverAuthorizedSecretLease(typedLeaseFixture(), fake.ports);
    const inspection = fake.inspector.inspect();

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        outcome: 'revoked',
        reason: 'secret-unavailable',
        secretsCleared: true,
        issueCodes: ['secret-unavailable'],
        lease: expect.objectContaining({ state: 'revoked' })
      })
    }));
    expect(inspection.events).toEqual([
      { type: 'bootstrap-opened' },
      { type: 'secret-acquired' },
      { type: 'bootstrap-cleared' }
    ]);
    expect(JSON.stringify({ result, inspection })).not.toContain(canary);
  });

  it('releases the store callback before reporting a bootstrap rejection', async () => {
    const canary = 'SECRET_CANARY_REJECTED';
    const fake = createSecretDeliveryFake(canary, 'bootstrap-rejected');
    const result = await deliverAuthorizedSecretLease(typedLeaseFixture(), fake.ports);
    const inspection = fake.inspector.inspect();

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        outcome: 'revoked',
        reason: 'bootstrap-rejected',
        secretsCleared: true,
        issueCodes: ['bootstrap-rejected']
      })
    }));
    expect(inspection.events.slice(-2)).toEqual([
      { type: 'secret-released' },
      { type: 'bootstrap-cleared' }
    ]);
    expect(JSON.stringify({ result, inspection })).not.toContain(canary);
  });
});
