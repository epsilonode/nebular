import { describe, expect, it } from 'vitest';

import { createBootstrapRequest, type BootstrapRequestMessage } from '../broker-client/public.ts';
import {
  createDurableBootstrapLeaseAuthorityPort,
  liftBootstrapCurrentReceiverAttemptTaskPort,
  liftBootstrapCurrentRecipeTaskPort,
  type DurableBootstrapLeaseAuthorityPorts,
  type VerifiedBootstrapReceiverAttempt
} from './bootstrap-authority.ts';
import {
  journalOk,
  parseCheckedInRecipeLocator,
  parseConsentId,
  parseJournalOperationId,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  type AttemptJournalRecord,
  type ClaimAuthorizedBootstrapLease,
  type GrantJournalRecord,
  type JournalOperationId,
  type LeaseJournalRecord,
  type TransitionLease
} from './journal.ts';
import {
  parseCredentialReference,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
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
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

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
const secondSlotId = (): CredentialSlotId => unwrapBroker(parseCredentialSlotId('radar-api'));
const operationId = (value: string): JournalOperationId => unwrapJournal(parseJournalOperationId(value));
const recipeLocator = () => unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipe.xml'));
const receiverEntryIdentity = () => unwrapJournal(parseReceiverEntryIdentity('pm2-entry:nebular-example'));
const processIncarnation = () => unwrapJournal(parseProcessIncarnation('windows-created:9001'));
const credentialReference = (value: string) => {
  const parsed = parseCredentialReference(value);
  if (parsed.isErr()) throw new Error('expected valid credential reference fixture');
  return parsed.value;
};

const grant = (): GrantJournalRecord => {
  const credentialReference = parseCredentialReference('credential-1');
  if (credentialReference.isErr()) throw new Error('expected valid credential reference fixture');
  return {
    id: grantId(),
    operationId: operationId('grant-operation-1'),
    repository: repository(),
    recipeRevision: revision(),
    credentialBindings: [{ slotId: slotId(), credentialReference: credentialReference.value }],
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
  updatedAtMs: 950,
  bootstrapBinding: {
    format: 'bootstrap-attempt-binding/v2',
    bindingGeneration: 1,
    grantId: grantId(),
    grantGeneration: 3,
    receiverId: receiverId(),
    receiverEntryIdentity: receiverEntryIdentity(),
    helperParentProcessId: 4100,
    helperParentProcessIncarnation: processIncarnation(),
    recipeLocator: recipeLocator()
  }
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
  bindingGeneration: 1,
  receiverEntryIdentity: receiverEntryIdentity(),
  helperParentProcessId: 4100,
  helperParentProcessIncarnation: processIncarnation(),
  recipeLocator: recipeLocator(),
  ...overrides
});

const requestWithSlots = (
  slots: readonly Readonly<{ slotId: CredentialSlotId; environmentName: string }>[]
): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-1',
    repository: repository(),
    recipeRevision: revision(),
    grantId: grantId(),
    grantGeneration: 3,
    receiverId: receiverId(),
    processAttemptId: attemptId(),
    slots
  });
  if (created.isErr()) throw new Error('expected valid bootstrap request fixture');
  return created.value;
};

const request = (environmentName: string = 'WEATHER_API_TOKEN'): BootstrapRequestMessage =>
  requestWithSlots([{ slotId: slotId(), environmentName }]);

type MutableHarness = Readonly<{
  claims: ClaimAuthorizedBootstrapLease[];
  clockValues: number[];
  persistedLeases: LeaseJournalRecord[];
  receiverVerifications: AttemptJournalRecord[];
  transitionCommands: TransitionLease[];
}>;

const transitionedRecord = (command: TransitionLease, previous: LeaseJournalRecord): LeaseJournalRecord => ({
  ...previous,
  state: command.nextState,
  updatedAtMs: command.atMs,
  cleanupReceipt: command.cleanupReceipt
});

const ports = (
  harness: MutableHarness,
  receiverAttempt: VerifiedBootstrapReceiverAttempt = verifiedAttempt(),
  currentAttempt: AttemptJournalRecord = attempt(),
  currentGrant: GrantJournalRecord = grant(),
  recipeSlots: readonly Readonly<{ slotId: CredentialSlotId; environmentName: string }>[] = [
    { slotId: slotId(), environmentName: 'WEATHER_API_TOKEN' }
  ]
): DurableBootstrapLeaseAuthorityPorts => {
  return {
    attempts: {
      read: id => Promise.resolve(journalOk(id === currentAttempt.id ? currentAttempt : null))
    },
    clock: { nowMs: () => harness.clockValues.shift() ?? 1_000 },
    grants: {
      readGrant: id => Promise.resolve(journalOk(id === currentGrant.id ? currentGrant : null))
    },
    leaseLifetimeMs: 1_000,
    leases: {
      claimAuthorized: command => {
        harness.claims.push(command);
        const persisted = harness.persistedLeases[0];
        if (persisted !== undefined) {
          return Promise.resolve(journalOk({ status: 'already-committed', record: persisted }));
        }
        harness.persistedLeases.push(command.lease);
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
      verifyCurrentAttempt: journaledAttempt => {
        harness.receiverVerifications.push(journaledAttempt);
        return secretLeaseTaskOk(receiverAttempt);
      }
    },
    recipes: {
      resolveCurrentRecipe: () => secretLeaseTaskOk({
        state: 'current-checked-in-recipe',
        repository: repository(),
        recipeRevision: revision(),
        relativePath: recipeLocator(),
        slots: recipeSlots
      })
    }
  };
};

const harness = (): MutableHarness => ({
  claims: [],
  clockValues: [1_000],
  persistedLeases: [],
  receiverVerifications: [],
  transitionCommands: []
});

describe('durable bootstrap lease authority composition', () => {
  it('confines plain-result recipe and receiver tasks to redacted privileged lifts', async () => {
    const journaledAttempt = attempt();
    if (journaledAttempt.bootstrapBinding === null) throw new Error('expected bound attempt fixture');
    const verified = verifiedAttempt();
    const currentRecipe = {
      state: 'current-checked-in-recipe' as const,
      repository: repository(),
      recipeRevision: revision(),
      relativePath: recipeLocator(),
      slots: [{ slotId: slotId(), environmentName: 'WEATHER_API_TOKEN' }]
    };
    const recipePort = liftBootstrapCurrentRecipeTaskPort({
      resolveCurrentRecipe: () => Promise.resolve(brokerOk(currentRecipe))
    });
    const receiverPort = liftBootstrapCurrentReceiverAttemptTaskPort({
      verifyCurrentAttempt: () => Promise.resolve(secretLeaseOk(verified))
    });

    expect(await recipePort.resolveCurrentRecipe(verified)).toEqual(expect.objectContaining({ value: currentRecipe }));
    expect(await receiverPort.verifyCurrentAttempt(journaledAttempt)).toEqual(expect.objectContaining({ value: verified }));

    const drifted = liftBootstrapCurrentRecipeTaskPort({
      resolveCurrentRecipe: () => Promise.resolve(brokerErr({
        code: 'recipe-drift',
        message: 'private git diagnostic'
      }))
    });
    const unavailable = liftBootstrapCurrentReceiverAttemptTaskPort({
      verifyCurrentAttempt: () => Promise.reject(new Error('private receiver diagnostic'))
    });
    expect(await drifted.resolveCurrentRecipe(verified)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'recipe-drift' })]
    }));
    expect(await unavailable.verifyCurrentAttempt(journaledAttempt)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
    expect(JSON.stringify(await unavailable.verifyCurrentAttempt(journaledAttempt)))
      .not.toContain('private receiver diagnostic');

    const explicitDenial = liftBootstrapCurrentReceiverAttemptTaskPort({
      verifyCurrentAttempt: () => Promise.resolve(secretLeaseErr({
        code: 'bootstrap-rejected',
        message: 'Current managed process authority could not be verified.'
      }))
    });
    expect(await explicitDenial.verifyCurrentAttempt(journaledAttempt)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
  });

  it('joins current grant, recipe, and receiver attempt before atomically claiming a bounded lease', async () => {
    const observed = harness();
    const authority = createDurableBootstrapLeaseAuthorityPort(ports(observed));
    const resolved = await authority.resolveAuthorizedLease(request());

    expect(resolved.isOk()).toBe(true);
    if (resolved.isErr()) return;
    expect(resolved.value).toEqual(expect.objectContaining({
      state: 'authorized',
      facts: expect.objectContaining({
        id: expect.objectContaining({ value: expect.stringMatching(/^bootstrap-lease-v1-[a-f0-9]{64}$/u) }),
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
    expect(observed.receiverVerifications).toHaveLength(1);
    expect(observed.claims[0]).toEqual(expect.objectContaining({
      exchangeId: expect.objectContaining({ value: 'bootstrap-1' }),
      operationId: expect.objectContaining({ value: expect.stringMatching(/^bootstrap-operation-v1-[a-f0-9]{64}$/u) })
    }));

    const activated = await authority.transitionLease({
      leaseId: resolved.value.facts.id,
      exposureCorrelation: resolved.value.facts.exposureCorrelation,
      expectedState: 'authorized',
      nextState: 'delivering',
      atMs: 1_001,
      cleanupReceipt: null
    });
    expect(activated.isOk()).toBe(true);
    expect(observed.transitionCommands).toEqual([
      expect.objectContaining({ expectedState: 'authorized', nextState: 'delivering', atMs: 1_001 })
    ]);
    expect(observed.transitionCommands[0]?.operationId.value)
      .toMatch(/^bootstrap-operation-v1-[a-f0-9]{64}$/u);
  });

  it('resolves two recipe slots to their exact persisted credential references without fan-out', async () => {
    const observed = harness();
    const firstReference = credentialReference('credential-weather');
    const secondReference = credentialReference('credential-radar');
    const currentGrant: GrantJournalRecord = {
      ...grant(),
      credentialBindings: [
        { slotId: slotId(), credentialReference: firstReference },
        { slotId: secondSlotId(), credentialReference: secondReference }
      ]
    };
    const recipeSlots = [
      { slotId: slotId(), environmentName: 'WEATHER_API_TOKEN' },
      { slotId: secondSlotId(), environmentName: 'RADAR_API_TOKEN' }
    ] as const;
    const resolved = await createDurableBootstrapLeaseAuthorityPort(ports(
      observed,
      verifiedAttempt(),
      attempt(),
      currentGrant,
      recipeSlots
    )).resolveAuthorizedLease(requestWithSlots(recipeSlots));

    expect(resolved.isOk()).toBe(true);
    if (resolved.isErr()) return;
    expect(resolved.value.facts.bindings).toEqual([
      {
        slotId: slotId(),
        environmentName: 'WEATHER_API_TOKEN',
        credentialReference: firstReference
      },
      {
        slotId: secondSlotId(),
        environmentName: 'RADAR_API_TOKEN',
        credentialReference: secondReference
      }
    ]);
  });

  it('fails closed when persisted grant bindings are missing or duplicate a recipe slot', async () => {
    const recipeSlots = [
      { slotId: slotId(), environmentName: 'WEATHER_API_TOKEN' },
      { slotId: secondSlotId(), environmentName: 'RADAR_API_TOKEN' }
    ] as const;
    const requested = requestWithSlots(recipeSlots);
    const missingHarness = harness();
    const missing = await createDurableBootstrapLeaseAuthorityPort(ports(
      missingHarness,
      verifiedAttempt(),
      attempt(),
      grant(),
      recipeSlots
    )).resolveAuthorizedLease(requested);

    const duplicateHarness = harness();
    const duplicateReference = credentialReference('credential-duplicate');
    const duplicateGrant: GrantJournalRecord = {
      ...grant(),
      credentialBindings: [
        grant().credentialBindings[0],
        { slotId: slotId(), credentialReference: duplicateReference }
      ]
    };
    const duplicate = await createDurableBootstrapLeaseAuthorityPort(ports(
      duplicateHarness,
      verifiedAttempt(),
      attempt(),
      duplicateGrant,
      recipeSlots
    )).resolveAuthorizedLease(requested);

    expect(missing).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'slot-not-authorized' })]
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'slot-not-authorized' })]
    }));
    expect(missingHarness.claims).toEqual([]);
    expect(duplicateHarness.claims).toEqual([]);
  });

  it('reuses stable exchange identities and accepts the persisted lease after a lost claim response', async () => {
    const observed = harness();
    observed.clockValues.push(1_100);
    const authority = createDurableBootstrapLeaseAuthorityPort(ports(observed));

    const first = await authority.resolveAuthorizedLease(request());
    const recovered = await authority.resolveAuthorizedLease(request());

    expect(first.isOk()).toBe(true);
    expect(recovered.isOk()).toBe(true);
    if (first.isErr() || recovered.isErr()) return;
    expect(observed.claims).toHaveLength(2);
    expect(observed.claims[1]?.operationId).toEqual(observed.claims[0]?.operationId);
    expect(observed.claims[1]?.lease.id).toEqual(observed.claims[0]?.lease.id);
    expect(observed.claims[1]?.lease.issuedAtMs).toBe(1_100);
    expect(recovered.value.facts).toEqual(first.value.facts);
  });

  it('rejects caller-selected environment names before a durable lease claim', async () => {
    const observed = harness();
    const resolved = await createDurableBootstrapLeaseAuthorityPort(ports(observed))
      .resolveAuthorizedLease(request('ATTACKER_SELECTED_TOKEN'));

    expect(resolved).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'slot-not-authorized' })]
    }));
    expect(observed.claims).toEqual([]);
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
  });

  it('reports an unbound materializing attempt as transiently not ready before receiver verification', async () => {
    const observed = harness();
    const legacyAttempt: AttemptJournalRecord = { ...attempt(), bootstrapBinding: null };
    const resolved = await createDurableBootstrapLeaseAuthorityPort(
      ports(observed, verifiedAttempt(), legacyAttempt)
    ).resolveAuthorizedLease(request());

    expect(resolved).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'attempt-not-ready' })]
    }));
    expect(observed.receiverVerifications).toEqual([]);
    expect(observed.claims).toEqual([]);
  });

  it('keeps receiver verification transient only during the prebound materializing window', async () => {
    const materializingHarness = harness();
    const materializingPorts = ports(materializingHarness);
    const transientReceiver = {
      verifyCurrentAttempt: () => secretLeaseTaskErr<VerifiedBootstrapReceiverAttempt>({
        code: 'bootstrap-rejected',
        message: 'Current managed process authority could not be verified.'
      })
    };
    const materializing = await createDurableBootstrapLeaseAuthorityPort({
      ...materializingPorts,
      receiverAttempts: transientReceiver
    }).resolveAuthorizedLease(request());

    const runningHarness = harness();
    const runningAttempt: AttemptJournalRecord = { ...attempt(), state: 'running' };
    const runningPorts = ports(runningHarness, verifiedAttempt(), runningAttempt);
    const running = await createDurableBootstrapLeaseAuthorityPort({
      ...runningPorts,
      receiverAttempts: transientReceiver
    }).resolveAuthorizedLease(request());

    expect(materializing).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'attempt-not-ready' })]
    }));
    expect(running).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
    expect(materializingHarness.claims).toEqual([]);
    expect(runningHarness.claims).toEqual([]);
  });
});
