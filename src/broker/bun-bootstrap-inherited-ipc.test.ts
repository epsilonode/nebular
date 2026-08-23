import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapRequest,
  type BootstrapRequestMessage
} from '../broker-client/public.ts';
import {
  authorizeSecretLease,
  parseCredentialReference,
  parseSecretLeaseId,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type AuthorizedSecretLease,
  type SecretDeliveryGrant,
  type SecretLeaseRequest,
  type SecretSlotBinding
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';
import {
  brokerBootstrapChildExchangeId,
  runBrokerBootstrapInheritedIpcChild,
  type BrokerBootstrapChildPorts,
  type BrokerBootstrapInheritedIpcRuntime
} from './bun-bootstrap-inherited-ipc.ts';
import type { BootstrapLeaseAuthorityTransition } from './bootstrap-authority.ts';
import type { ScopedSecret, SecretStoreLeasePort } from './secret-delivery.ts';

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
    throw new Error('expected valid broker bootstrap fixture');
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
  if (authorized.isErr()) throw new Error('expected authorized broker bootstrap lease');
  return authorized.value;
};

const bootstrapRequest = (lease: AuthorizedSecretLease): BootstrapRequestMessage => {
  const request = createBootstrapRequest({
    exchangeId: 'bootstrap-child-1',
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
  if (request.isErr()) throw new Error('expected valid broker bootstrap request');
  return request.value;
};

const requestWire = (request: BootstrapRequestMessage, grantGeneration = request.payload.authority.grantGeneration): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-request',
  exchangeId: request.exchangeId.value,
  payload: {
    authority: {
      repository: request.payload.authority.repository.value,
      recipeRevision: request.payload.authority.recipeRevision.value,
      grantId: request.payload.authority.grantId.value,
      grantGeneration
    },
    attempt: {
      receiverId: request.payload.attempt.receiverId.value,
      processAttemptId: request.payload.attempt.processAttemptId.value
    },
    slots: request.payload.slots.map(slot => ({
      slotId: slot.slotId.value,
      environmentName: slot.environmentName
    }))
  }
});

const acknowledgementWire = (lease: AuthorizedSecretLease): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-acknowledgement',
  exchangeId: 'bootstrap-child-1',
  payload: {
    leaseId: lease.facts.id.value,
    processAttemptId: lease.facts.processAttemptId,
    installedSlotIds: lease.facts.bindings.map(binding => binding.slotId),
    installedSlotCount: lease.facts.bindings.length
  }
});

const messageKind = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'messageKind' in value &&
    typeof value.messageKind === 'string'
    ? value.messageKind
    : undefined;

const fakeRuntime = (inbound: readonly unknown[]): Readonly<{
  runtime: BrokerBootstrapInheritedIpcRuntime;
  sent: () => readonly unknown[];
  disconnects: () => number;
}> => {
  const messages = [...inbound];
  const sent: unknown[] = [];
  let disconnects = 0;
  return {
    runtime: {
      send: message => {
        sent.push(message);
        return secretLeaseTaskOk(undefined);
      },
      receive: () => {
        const message = messages.shift();
        return message === undefined
          ? secretLeaseTaskErr({ code: 'bootstrap-rejected', message: 'Injected IPC input exhausted.' })
          : secretLeaseTaskOk(message);
      },
      disconnect: () => {
        disconnects += 1;
        return secretLeaseOk(undefined);
      }
    },
    sent: () => [...sent],
    disconnects: () => disconnects
  };
};

const secretStore = (canary: string, reads: string[]): SecretStoreLeasePort => ({
  withSecret: (reference, use) => {
    reads.push(reference.value);
    const secret: ScopedSecret = {
      deliverTo: (sink, slot) => sink.install(slot, canary)
    };
    const used = use(secret);
    return used.isErr()
      ? secretLeaseTaskErr(used.error[0], ...used.error.slice(1))
      : secretLeaseTaskOk(undefined);
  }
});

const ports = (
  lease: AuthorizedSecretLease,
  runtime: BrokerBootstrapInheritedIpcRuntime,
  reads: string[],
  canary: string,
  transitions: BootstrapLeaseAuthorityTransition[],
  clockTimes: readonly number[] = [1_001, 1_002]
): BrokerBootstrapChildPorts => {
  const times = [...clockTimes];
  return {
    authority: {
      resolveAuthorizedLease: () => secretLeaseTaskOk(lease),
      transitionLease: transition => {
        transitions.push(transition);
        return secretLeaseTaskOk(undefined);
      }
    },
    clock: { nowMs: () => times.shift() ?? 1_002 },
    runtime,
    secretStore: secretStore(canary, reads)
  };
};

describe('privileged broker secret-bootstrap inherited IPC child', () => {
  it('revalidates authority, delivers one secret bundle, requires acknowledgement, and disconnects', async () => {
    const lease = authorizedLease();
    const request = bootstrapRequest(lease);
    const fake = fakeRuntime([requestWire(request), acknowledgementWire(lease)]);
    const reads: string[] = [];
    const transitions: BootstrapLeaseAuthorityTransition[] = [];
    const canary = 'BROKER_BOOTSTRAP_SECRET_CANARY';
    const result = await runBrokerBootstrapInheritedIpcChild(
      { exchangeId: request.exchangeId.value },
      ports(lease, fake.runtime, reads, canary, transitions)
    );

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({ outcome: 'completed', secretsCleared: true })
    }));
    expect(fake.sent().map(messageKind)).toEqual(['bootstrap-hello', 'bootstrap-delivery']);
    expect(JSON.stringify(fake.sent())).toContain(canary);
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(reads).toEqual(['credential-1']);
    expect(transitions).toEqual([
      expect.objectContaining({ expectedState: 'authorized', nextState: 'active', atMs: 1_001 }),
      expect.objectContaining({ expectedState: 'active', nextState: 'consumed', atMs: 1_002 })
    ]);
    expect(fake.disconnects()).toBe(1);
  });

  it('fails closed on independently revalidated grant drift before reading a secret', async () => {
    const lease = authorizedLease();
    const request = bootstrapRequest(lease);
    const fake = fakeRuntime([requestWire(request, lease.facts.grantGeneration + 1)]);
    const reads: string[] = [];
    const transitions: BootstrapLeaseAuthorityTransition[] = [];
    const result = await runBrokerBootstrapInheritedIpcChild(
      { exchangeId: request.exchangeId.value },
      ports(lease, fake.runtime, reads, 'MUST_NOT_BE_READ', transitions)
    );

    expect(result.isErr()).toBe(true);
    expect(fake.sent().map(messageKind)).toEqual(['bootstrap-hello', 'bootstrap-rejected']);
    expect(reads).toEqual([]);
    expect(transitions).toEqual([
      expect.objectContaining({ expectedState: 'authorized', nextState: 'revoked', atMs: 1_001 })
    ]);
    expect(JSON.stringify(fake.sent())).not.toContain('MUST_NOT_BE_READ');
    expect(fake.disconnects()).toBe(1);
  });

  it('durably revokes an activated lease when secret delivery fails', async () => {
    const lease = authorizedLease();
    const request = bootstrapRequest(lease);
    const fake = fakeRuntime([requestWire(request)]);
    const reads: string[] = [];
    const transitions: BootstrapLeaseAuthorityTransition[] = [];
    const basePorts = ports(lease, fake.runtime, reads, 'MUST_NOT_BE_READ', transitions);
    const result = await runBrokerBootstrapInheritedIpcChild(
      { exchangeId: request.exchangeId.value },
      {
        ...basePorts,
        secretStore: {
          withSecret: () => secretLeaseTaskErr({
            code: 'secret-unavailable',
            message: 'Injected secret-store failure.'
          })
        }
      }
    );

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({ outcome: 'revoked', reason: 'secret-unavailable' })
    }));
    expect(fake.sent().map(messageKind)).toEqual(['bootstrap-hello']);
    expect(transitions).toEqual([
      expect.objectContaining({ expectedState: 'authorized', nextState: 'active', atMs: 1_001 }),
      expect.objectContaining({ expectedState: 'active', nextState: 'revoked', atMs: 1_002 })
    ]);
    expect(fake.disconnects()).toBe(1);
  });

  it('durably revokes a claimed lease when activation has already expired', async () => {
    const lease = authorizedLease();
    const request = bootstrapRequest(lease);
    const fake = fakeRuntime([requestWire(request)]);
    const reads: string[] = [];
    const transitions: BootstrapLeaseAuthorityTransition[] = [];
    const result = await runBrokerBootstrapInheritedIpcChild(
      { exchangeId: request.exchangeId.value },
      ports(
        lease,
        fake.runtime,
        reads,
        'MUST_NOT_BE_READ',
        transitions,
        [lease.facts.expiresAtMs]
      )
    );

    expect(result.isErr()).toBe(true);
    expect(fake.sent().map(messageKind)).toEqual(['bootstrap-hello', 'bootstrap-rejected']);
    expect(reads).toEqual([]);
    expect(transitions).toEqual([
      expect.objectContaining({
        expectedState: 'authorized',
        nextState: 'revoked',
        atMs: lease.facts.expiresAtMs
      })
    ]);
    expect(fake.disconnects()).toBe(1);
  });

  it('recognizes only a bounded explicit bootstrap-child argument', () => {
    expect(brokerBootstrapChildExchangeId(['bun', 'broker.ts']).isOk()).toBe(true);
    expect(brokerBootstrapChildExchangeId([
      'bun',
      'broker.ts',
      '--nebular-bootstrap-child',
      'bootstrap-child-1'
    ])).toEqual(expect.objectContaining({ value: 'bootstrap-child-1' }));
    expect(brokerBootstrapChildExchangeId([
      'bun',
      'broker.ts',
      '--nebular-bootstrap-child',
      '../invalid'
    ])).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
  });
});
