import { describe, expect, it } from 'vitest';

import { createBootstrapRequest, type BootstrapRequestMessage } from '../broker-client/public.ts';
import {
  createDurableBootstrapLeaseAuthorityPort,
  type DurableBootstrapLeaseAuthorityPorts,
  type VerifiedBootstrapReceiverAttempt
} from './bootstrap-authority.ts';
import {
  journalOk,
  parseConsentId,
  parseJournalOperationId,
  parseReceiverCorrelation,
  parseRedactedPlanDigest,
  type AttemptJournalRecord,
  type CreateLease,
  type GrantJournalRecord,
  type JournalOperationId,
  type LeaseJournalRecord,
  type TransitionLease
} from './journal.ts';
import {
  parseCredentialReference,
  parseSecretLeaseId,
  secretLeaseTaskOk,
  type SecretLeaseId
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type ProcessAttemptId,
  type ReceiverId,
  type RecipeRevision
} from './primitives.ts';
import type { BrokerResult } from './result.ts';

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('expected valid broker primitive fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: Readonly<{ type: 'ok'; value: Value }> | Readonly<{ type: 'err' }>): Value => {
  if (result.type === 'err') throw new Error('expected valid journal primitive fixture');
  return result.value;
};

const repository = (): CanonicalRepository => unwrapBroker(parseCanonicalRepository('R:/Code/example'));
const revision = (): RecipeRevision => unwrapBroker(parseRecipeRevision('recipe-revision-1'));
const grantId = (value: string = 'grant-1'): GrantId => unwrapBroker(parseGrantId(value));
const attemptId = (): ProcessAttemptId => unwrapBroker(parseProcessAttemptId('attempt-1'));
const receiverId = (): ReceiverId => unwrapBroker(parseReceiverId('pm2'));
const slotId = (): CredentialSlotId => unwrapBroker(parseCredentialSlotId('weather-api'));
const leaseId = (): SecretLeaseId => {
  const parsed = parseSecretLeaseId('lease-1');
  if (parsed.isErr()) throw new Error('expected valid lease fixture');
  return parsed.value;
};
const operationId = (value: string): JournalOperationId => unwrapJournal(parseJournalOperationId(value));

const grant = (): GrantJournalRecord => {
  const credentialReference = parseCredentialReference('credential-1');
  if (credentialReference.isErr()) throw new Error('expected valid credential reference fixture');
  return {
    id: grantId(),
    operationId: operationId('grant-operation-1'),
    repository: repository(),
    recipeRevision: revision(),
    credentialReference: credentialReference.value,
    credentialSlotIds: [slotId()],
    consentId: unwrapJournal(parseConsentId('consent-1')),
    generation: 3,
    issuedAtMs: 500,
    expiresAtMs: 5_000,
    state: 'active'
  };
};

const attempt = (): AttemptJournalRecord => ({
  id: attemptId(),
  reserveOperationId: operationId('reserve-attempt-1'),
  repository: repository(),
  recipeRevision: revision(),
  planDigest: unwrapJournal(parseRedactedPlanDigest('plan-1')),
  lifecycle: 'one-shot',
  receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:nebular-example')),
  state: 'materializing',
  stateVersion: 2,
  createdAtMs: 900,
  updatedAtMs: 950
});

const verifiedAttempt = (
  overrides: Partial<VerifiedBootstrapReceiverAttempt> = {}
): VerifiedBootstrapReceiverAttempt => ({
  state: 'verified-current-attempt',
  processAttemptId: attemptId(),
  repository: repository(),
  recipeRevision: revision(),
  grantId: grantId(),
  grantGeneration: 3,
  receiverId: receiverId(),
  ...overrides
});

const request = (environmentName: string = 'WEATHER_API_TOKEN'): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-1',
    repository: repository(),
    recipeRevision: revision(),
    grantId: grantId(),
    grantGeneration: 3,
    receiverId: receiverId(),
    processAttemptId: attemptId(),
    slots: [{ slotId: slotId(), environmentName }]
  });
  if (created.isErr()) throw new Error('expected valid bootstrap request fixture');
  return created.value;
};

type MutableHarness = Readonly<{
  claims: CreateLease[];
  transitionCommands: TransitionLease[];
  transitionPurposes: string[];
}>;

const transitionedRecord = (command: TransitionLease, previous: LeaseJournalRecord): LeaseJournalRecord => ({
  ...previous,
  state: command.nextState,
  terminatedAtMs: command.nextState === 'active' ? null : command.atMs
});

const ports = (
  harness: MutableHarness,
  receiverAttempt: VerifiedBootstrapReceiverAttempt = verifiedAttempt()
): DurableBootstrapLeaseAuthorityPorts => {
  const currentGrant = grant();
  const currentAttempt = attempt();
  return {
    attempts: {
      read: id => Promise.resolve(journalOk(id === currentAttempt.id ? currentAttempt : null))
    },
    clock: { nowMs: () => 1_000 },
    entropy: {
      nextLeaseId: () => secretLeaseTaskOk(leaseId()),
      nextOperationId: purpose => {
        harness.transitionPurposes.push(purpose);
        return secretLeaseTaskOk(operationId(`${purpose}-1`));
      }
    },
    grants: {
      readGrant: id => Promise.resolve(journalOk(id === currentGrant.id ? currentGrant : null))
    },
    leaseLifetimeMs: 1_000,
    leases: {
      claimAuthorized: command => {
        harness.claims.push(command);
        return Promise.resolve(journalOk({ status: 'committed', record: command.lease }));
      },
      transition: command => {
        harness.transitionCommands.push(command);
        const claimed = harness.claims[0]?.lease;
        if (claimed === undefined) throw new Error('expected a claimed lease before transition');
        return Promise.resolve(journalOk({
          status: 'committed',
          record: transitionedRecord(command, claimed)
        }));
      }
    },
    receiverAttempts: {
      verifyCurrentAttempt: () => secretLeaseTaskOk(receiverAttempt)
    },
    recipes: {
      resolveCurrentRecipe: () => secretLeaseTaskOk({
        state: 'current-checked-in-recipe',
        repository: repository(),
        recipeRevision: revision(),
        relativePath: '.nebular/recipe.xml',
        slots: [{ slotId: slotId(), environmentName: 'WEATHER_API_TOKEN' }]
      })
    }
  };
};

const harness = (): MutableHarness => ({
  claims: [],
  transitionCommands: [],
  transitionPurposes: []
});

describe('durable bootstrap lease authority composition', () => {
  it('joins current grant, recipe, and receiver attempt before atomically claiming a bounded lease', async () => {
    const observed = harness();
    const authority = createDurableBootstrapLeaseAuthorityPort(ports(observed));
    const resolved = await authority.resolveAuthorizedLease(request());

    expect(resolved.isOk()).toBe(true);
    if (resolved.isErr()) return;
    expect(resolved.value).toEqual(expect.objectContaining({
      state: 'authorized',
      facts: expect.objectContaining({
        id: expect.objectContaining({ value: 'lease-1' }),
        grantGeneration: 3,
        repository: repository(),
        recipeRevision: revision(),
        receiverId: receiverId(),
        processAttemptId: attemptId(),
        expiresAtMs: 2_000,
        bindings: [{
          slotId: slotId(),
          environmentName: 'WEATHER_API_TOKEN',
          credentialReference: expect.objectContaining({ value: 'credential-1' })
        }]
      })
    }));
    expect(observed.claims).toHaveLength(1);
    expect(observed.transitionPurposes).toEqual(['claim-bootstrap-lease']);

    const activated = await authority.transitionLease({
      leaseId: resolved.value.facts.id,
      expectedState: 'authorized',
      nextState: 'active',
      atMs: 1_001
    });
    expect(activated.isOk()).toBe(true);
    expect(observed.transitionCommands).toEqual([
      expect.objectContaining({ expectedState: 'authorized', nextState: 'active', atMs: 1_001 })
    ]);
    expect(observed.transitionPurposes).toEqual([
      'claim-bootstrap-lease',
      'activate-bootstrap-lease'
    ]);
  });

  it('rejects caller-selected environment names before entropy or a durable lease claim', async () => {
    const observed = harness();
    const resolved = await createDurableBootstrapLeaseAuthorityPort(ports(observed))
      .resolveAuthorizedLease(request('ATTACKER_SELECTED_TOKEN'));

    expect(resolved).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'slot-not-authorized' })]
    }));
    expect(observed.claims).toEqual([]);
    expect(observed.transitionPurposes).toEqual([]);
  });

  it('rejects a caller grant that is not bound to the independently verified receiver attempt', async () => {
    const observed = harness();
    const resolved = await createDurableBootstrapLeaseAuthorityPort(ports(observed, verifiedAttempt({
      grantId: grantId('different-attempt-grant')
    }))).resolveAuthorizedLease(request());

    expect(resolved).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'lease-invalid' })]
    }));
    expect(observed.claims).toEqual([]);
    expect(observed.transitionPurposes).toEqual([]);
  });
});
