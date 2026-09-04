import { createHash } from 'node:crypto';

import {
  parseJournalOperationId,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  validateGrantQualifiedMaterializingAttempt,
  type AttemptJournal,
  type AttemptJournalRecord,
  type GrantQualifiedAttemptAuthority,
  type GrantQualifiedOneShotLaunchAdmission,
  type GrantQualifiedMaterializingAttemptRecord,
  type JournalIssueCode,
  type JournalMutation,
  type ReceiverCorrelation,
  type ReceiverEntryIdentity,
  type RedactedPlanDigest,
  type ReserveGrantQualifiedMaterializingAttempt
} from './journal.ts';
import {
  type AdmittedOneShotLaunch,
  type OneShotLaunchFactoryIssue
} from './one-shot-receiver.ts';
import {
  planOneShotSlotSelection,
  sameOneShotProcessName,
  sameOneShotSlotId,
  summarizeOneShotSlot,
  validateOneShotSlotInventory,
  type OneShotAllocationIssue,
  type OneShotResult,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import {
  parseProcessAttemptId,
  parseReceiverId,
  type ProcessAttemptId,
  type ReceiverId
} from './primitives.ts';
import {
  RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
  type RecipeMaterializationPlan,
  validateRecipeMaterializationPlan
} from './recipe-materialization-plan.ts';

export const ONE_SHOT_ATTEMPT_ID_DOMAIN = 'epsilonode.nebular.one-shot-attempt-id/v1' as const;
export const ONE_SHOT_RESERVE_OPERATION_DOMAIN =
  'epsilonode.nebular.one-shot-reserve-operation/v1' as const;
export const ONE_SHOT_MATERIALIZE_OPERATION_DOMAIN =
  'epsilonode.nebular.one-shot-materialize-operation/v1' as const;
export const ONE_SHOT_SLOT_CORRELATION_DOMAIN =
  'epsilonode.nebular.one-shot-slot-correlation/v1' as const;
export const ONE_SHOT_EXACT_RESERVATION_DIGEST_DOMAIN =
  'epsilonode.nebular.one-shot-exact-reservation-digest/v1' as const;

export type GrantQualifiedOneShotIdentity = Readonly<{
  attemptId: ProcessAttemptId;
  reserveOperationId: ReserveGrantQualifiedMaterializingAttempt['reservation']['operationId'];
  materializeOperationId: ReserveGrantQualifiedMaterializingAttempt['materialization']['operationId'];
  slotIndependentPlanDigest: RedactedPlanDigest;
}>;

export type OneShotMaterializationReceiverIdentity = Readonly<{
  receiverId: ReceiverId;
  receiverEntryIdentity: ReceiverEntryIdentity;
  receiverCorrelation: ReceiverCorrelation;
}>;

export type GrantQualifiedOneShotFinalizationContext = Readonly<{
  plan: RecipeMaterializationPlan;
  slot: OneShotSlotDefinition;
  identity: GrantQualifiedOneShotIdentity;
  receiver: OneShotMaterializationReceiverIdentity;
  startedAtMs: number;
  deadlineAtMs: number;
}>;

/** Trusted pure plan-to-payload boundary; it must not launch or mutate a receiver. */
export type GrantQualifiedOneShotLaunchFactory<Payload> = Readonly<{
  finalizeForSlot: (
    context: GrantQualifiedOneShotFinalizationContext
  ) => OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue> |
    Promise<OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue>>;
}>;

export type OneShotMaterializationReservationPortIssue = Readonly<{
  code: 'one-shot-reservation-lock-unavailable' | 'one-shot-reservation-observation-unavailable';
  safeMessage: string;
}>;

export type OneShotMaterializationReservationIssue =
  | OneShotAllocationIssue
  | OneShotLaunchFactoryIssue
  | OneShotMaterializationReservationPortIssue
  | Readonly<{ code: 'one-shot-materialization-reservation-invalid'; safeMessage: string }>
  | Readonly<{
      code: 'one-shot-materialization-journal-failed';
      journalCode: JournalIssueCode;
      safeMessage: string;
    }>
  | Readonly<{
      code: 'one-shot-materialization-authority-stale';
      action: 'cancel-or-reconcile';
      safeMessage: string;
    }>
  | Readonly<{ code: 'one-shot-materialization-recovery-required'; safeMessage: string }>;

export type OneShotMaterializationReservationPorts = Readonly<{
  withAllocationLock: <Value>(
    namespace: string,
    work: () => Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>>
  ) => Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>>;
}> & Readonly<{
  observe: (
    pool: OneShotSlotPool
  ) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotMaterializationReservationPortIssue>>;
}> & Readonly<{
  attempts: Pick<AttemptJournal, 'readGrantQualifiedMaterializing' | 'reserveGrantQualifiedMaterializing'>;
}>;

export type GrantQualifiedOneShotReservation<Payload> = Readonly<{
  state: 'materializing-reserved';
  status: JournalMutation<AttemptJournalRecord>['status'];
  allocationNamespace: string;
  identity: GrantQualifiedOneShotIdentity;
  slot: OneShotSlotDefinition;
  receiver: OneShotMaterializationReceiverIdentity;
  exactReservationDigest: RedactedPlanDigest;
  attempt: AttemptJournalRecord;
  authority: GrantQualifiedAttemptAuthority;
  admission: GrantQualifiedOneShotLaunchAdmission;
  launch: AdmittedOneShotLaunch<Payload>;
}>;

type ReservationInput = Readonly<{
  plan: RecipeMaterializationPlan;
  observedAtMs: number;
}>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({ outcome: 'success', value });
const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const sha256 = (domain: string, values: readonly unknown[]): string => createHash('sha256')
  .update(JSON.stringify([domain, ...values]))
  .digest('hex');

const invalid = (): OneShotMaterializationReservationIssue => ({
  code: 'one-shot-materialization-reservation-invalid',
  safeMessage: 'The grant-qualified one-shot reservation is invalid.'
});

const factoryFailed = (): OneShotLaunchFactoryIssue => ({
  code: 'one-shot-launch-factory-failed',
  safeMessage: 'The slot-aware launch finalizer failed closed.'
});

const recoveryRequired = (): OneShotMaterializationReservationIssue => ({
  code: 'one-shot-materialization-recovery-required',
  safeMessage: 'The durable one-shot reservation requires reconciliation.'
});

const portFailed = (
  code: OneShotMaterializationReservationPortIssue['code']
): OneShotMaterializationReservationPortIssue => ({
  code,
  safeMessage: 'The one-shot allocation capability failed closed.'
});

export const deriveGrantQualifiedOneShotIdentity = (
  plan: RecipeMaterializationPlan
): OneShotResult<GrantQualifiedOneShotIdentity, OneShotMaterializationReservationIssue> => {
  if (!validateRecipeMaterializationPlan(plan)) return failure(invalid());
  const attemptId = parseProcessAttemptId(
    `one-shot-v1-${sha256(ONE_SHOT_ATTEMPT_ID_DOMAIN, [plan.requestId])}`
  );
  const reserveOperationId = parseJournalOperationId(
    `one-shot-reserve-v1-${sha256(ONE_SHOT_RESERVE_OPERATION_DOMAIN, [plan.requestId])}`
  );
  const materializeOperationId = parseJournalOperationId(
    `one-shot-materialize-v1-${sha256(ONE_SHOT_MATERIALIZE_OPERATION_DOMAIN, [plan.requestId])}`
  );
  const slotIndependentPlanDigest = parseRedactedPlanDigest(
    `sha256:${sha256(RECIPE_MATERIALIZATION_DIGEST_DOMAIN, [plan.redactedDigestInput.canonicalJson])}`
  );
  return attemptId.isOk() && reserveOperationId.type === 'ok' && materializeOperationId.type === 'ok' &&
    slotIndependentPlanDigest.type === 'ok'
    ? success({
        attemptId: attemptId.value,
        reserveOperationId: reserveOperationId.value,
        materializeOperationId: materializeOperationId.value,
        slotIndependentPlanDigest: slotIndependentPlanDigest.value
      })
    : failure(invalid());
};

const receiverFor = (
  plan: RecipeMaterializationPlan,
  identity: GrantQualifiedOneShotIdentity,
  slot: OneShotSlotDefinition
): OneShotResult<OneShotMaterializationReceiverIdentity, OneShotMaterializationReservationIssue> => {
  const receiverId = parseReceiverId('pm2');
  const receiverEntryIdentity = parseReceiverEntryIdentity(`pm2-entry:${slot.processName.value}`);
  const receiverCorrelation = parseReceiverCorrelation(`pm2-one-shot-v1-${sha256(
    ONE_SHOT_SLOT_CORRELATION_DOMAIN,
    [
      identity.attemptId,
      identity.slotIndependentPlanDigest.value,
      slot.slotId.value,
      slot.processName.value,
      plan.authority.grantId,
      plan.authority.grantGeneration
    ]
  )}`);
  return receiverId.isOk() && receiverEntryIdentity.type === 'ok' && receiverCorrelation.type === 'ok'
    ? success({
        receiverId: receiverId.value,
        receiverEntryIdentity: receiverEntryIdentity.value,
        receiverCorrelation: receiverCorrelation.value
      })
    : failure(invalid());
};

const slotForDurableAttempt = (
  plan: RecipeMaterializationPlan,
  identity: GrantQualifiedOneShotIdentity,
  pool: OneShotSlotPool,
  current: GrantQualifiedMaterializingAttemptRecord
): OneShotResult<OneShotSlotDefinition, OneShotMaterializationReservationIssue> => {
  const attempt = current.attempt;
  if (attempt.receiverCorrelation === null) return failure(recoveryRequired());
  const matches: readonly OneShotSlotDefinition[] = pool.slots.filter(slot =>
    slot.slotId.value === current.admission.receiverSlotIdentity &&
    slot.processName.value === current.admission.receiverProcessName && (() => {
      const receiver = receiverFor(plan, identity, slot);
      return receiver.outcome === 'success' && receiver.value.receiverId === current.admission.receiverId &&
        receiver.value.receiverEntryIdentity.value === current.admission.receiverEntryIdentity.value &&
        receiver.value.receiverCorrelation.value === attempt.receiverCorrelation?.value;
    })());
  return matches.length === 1 && matches[0] !== undefined
    ? success(matches[0])
    : failure(recoveryRequired());
};

const sameCredentialSlots = (
  left: readonly string[],
  right: readonly string[]
): boolean => left.length === right.length && left.every(slot => right.includes(slot));

const sameDurablePlan = (
  plan: RecipeMaterializationPlan,
  identity: GrantQualifiedOneShotIdentity,
  current: GrantQualifiedMaterializingAttemptRecord
): boolean => current.authority.repository === plan.repository &&
  current.authority.recipeRevision === plan.recipeRevision &&
  current.authority.grantId === plan.authority.grantId &&
  current.authority.grantGeneration === plan.authority.grantGeneration &&
  current.authority.grantExpiresAtMs === plan.authority.grantExpiresAtMs &&
  sameCredentialSlots(
    current.authority.credentialSlotIds.map(String),
    plan.credentialSlots.map(slot => String(slot.slotId))
  ) && current.admission.recipeLocator.value === plan.recipeLocator.value &&
  current.admission.slotIndependentPlanDigest.value === identity.slotIndependentPlanDigest.value;

const initialSlot = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  identity: GrantQualifiedOneShotIdentity,
  observedAtMs: number
): OneShotResult<OneShotSlotDefinition, OneShotMaterializationReservationIssue> => {
  const selection = planOneShotSlotSelection(pool, observations, { attemptId: identity.attemptId }, observedAtMs);
  if (selection.outcome === 'failure') return selection;
  if (selection.value.kind === 'claim-empty') return success(selection.value.slot);
  if (selection.value.kind === 'confirm-existing') return failure(recoveryRequired());
  return failure({
    code: 'slot-capacity-busy',
    slots: observations.map(observation => summarizeOneShotSlot(observation, observedAtMs))
  });
};

const selectSlot = (
  input: ReservationInput,
  identity: GrantQualifiedOneShotIdentity,
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  current: GrantQualifiedMaterializingAttemptRecord | null
): OneShotResult<OneShotSlotDefinition, OneShotMaterializationReservationIssue> => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return inventory;
  if (current !== null) {
    const binding = current.attempt.bootstrapBinding;
    const baseline = current.attempt.state === 'materializing' && current.attempt.stateVersion === 2 &&
      binding === null;
    const preconfirmed = current.attempt.state === 'materializing' && current.attempt.stateVersion === 3 &&
      binding !== null && binding.bindingGeneration === current.admission.bindingGeneration &&
      binding.grantId === current.authority.grantId &&
      binding.grantGeneration === current.authority.grantGeneration &&
      binding.receiverId === current.admission.receiverId &&
      binding.receiverEntryIdentity.value === current.admission.receiverEntryIdentity.value &&
      binding.recipeLocator.value === current.admission.recipeLocator.value;
    if (!baseline && !preconfirmed) return failure(recoveryRequired());
  }
  return current === null
    ? initialSlot(pool, inventory.value, identity, input.observedAtMs)
    : slotForDurableAttempt(input.plan, identity, pool, current);
};

export const deriveGrantQualifiedOneShotReservationDigest = (
  identity: GrantQualifiedOneShotIdentity,
  allocationNamespace: string,
  slot: OneShotSlotDefinition,
  receiver: OneShotMaterializationReceiverIdentity,
  launch: AdmittedOneShotLaunch<unknown>
): OneShotResult<RedactedPlanDigest, OneShotMaterializationReservationIssue> => {
  const parsed = parseRedactedPlanDigest(`sha256:${sha256(ONE_SHOT_EXACT_RESERVATION_DIGEST_DOMAIN, [
    identity.slotIndependentPlanDigest.value,
    allocationNamespace,
    slot.slotId.value,
    slot.processName.value,
    receiver.receiverId,
    receiver.receiverEntryIdentity.value,
    receiver.receiverCorrelation.value,
    launch.metadataDigest
  ])}`);
  return parsed.type === 'ok' ? success(parsed.value) : failure(invalid());
};

const validLaunch = <Payload>(
  launch: AdmittedOneShotLaunch<Payload>,
  identity: GrantQualifiedOneShotIdentity,
  startedAtMs: number,
  deadlineAtMs: number
): boolean => launch.attemptId === identity.attemptId && /^[a-f0-9]{64}$/u.test(launch.metadataDigest) &&
  launch.startedAtMs === startedAtMs && launch.deadlineAtMs === deadlineAtMs;

const sameTextArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameReservationAuthority = (
  left: GrantQualifiedAttemptAuthority,
  right: GrantQualifiedAttemptAuthority
): boolean => left.grantId === right.grantId && left.grantGeneration === right.grantGeneration &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.grantExpiresAtMs === right.grantExpiresAtMs && sameTextArray(
    left.credentialSlotIds.map(String),
    right.credentialSlotIds.map(String)
  );

const sameReservationAdmission = (
  left: GrantQualifiedOneShotLaunchAdmission,
  right: GrantQualifiedOneShotLaunchAdmission
): boolean => left.bindingGeneration === right.bindingGeneration && left.receiverId === right.receiverId &&
  left.receiverSlotIdentity === right.receiverSlotIdentity &&
  left.receiverProcessName === right.receiverProcessName &&
  left.receiverEntryIdentity.value === right.receiverEntryIdentity.value &&
  left.recipeLocator.value === right.recipeLocator.value &&
  left.slotIndependentPlanDigest.value === right.slotIndependentPlanDigest.value &&
  left.launchMetadataDigest === right.launchMetadataDigest && left.deadlineAtMs === right.deadlineAtMs;

const sameReservationAttemptIdentity = (
  left: AttemptJournalRecord,
  right: AttemptJournalRecord
): boolean => left.id === right.id && left.reserveOperationId.value === right.reserveOperationId.value &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.planDigest.value === right.planDigest.value && left.lifecycle === right.lifecycle &&
  left.receiverCorrelation?.value === right.receiverCorrelation?.value && left.state === right.state &&
  left.createdAtMs === right.createdAtMs;

const samePreconfirmedBootstrapAttempt = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  current: GrantQualifiedMaterializingAttemptRecord
): boolean => {
  const binding = current.attempt.bootstrapBinding;
  return binding !== null && current.attempt.stateVersion === reservation.attempt.stateVersion + 1 &&
    binding.bindingGeneration === reservation.admission.bindingGeneration &&
    binding.grantId === reservation.authority.grantId &&
    binding.grantGeneration === reservation.authority.grantGeneration &&
    binding.receiverId === reservation.receiver.receiverId &&
    binding.receiverEntryIdentity.value === reservation.receiver.receiverEntryIdentity.value &&
    binding.recipeLocator.value === reservation.admission.recipeLocator.value;
};

const exactReservationFacts = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>
): boolean => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(reservation.allocationNamespace) &&
  reservation.slot.slotId.value.startsWith(`${reservation.allocationNamespace}:`) &&
  reservation.slot.processName.value.startsWith(`${reservation.allocationNamespace}-`) &&
  reservation.attempt.state === 'materializing' && reservation.attempt.stateVersion === 2 &&
  reservation.attempt.bootstrapBinding === null && reservation.attempt.id === reservation.identity.attemptId &&
  reservation.attempt.reserveOperationId.value === reservation.identity.reserveOperationId.value &&
  reservation.attempt.lifecycle === 'one-shot' &&
  reservation.attempt.receiverCorrelation?.value === reservation.receiver.receiverCorrelation.value &&
  reservation.attempt.planDigest.value === reservation.launch.metadataDigest &&
  reservation.attempt.repository === reservation.authority.repository &&
  reservation.attempt.recipeRevision === reservation.authority.recipeRevision &&
  reservation.launch.attemptId === reservation.identity.attemptId &&
  /^[a-f0-9]{64}$/u.test(reservation.launch.metadataDigest) &&
  reservation.launch.startedAtMs === reservation.attempt.createdAtMs &&
  reservation.launch.deadlineAtMs === reservation.admission.deadlineAtMs &&
  reservation.launch.deadlineAtMs <= reservation.authority.grantExpiresAtMs &&
  reservation.admission.bindingGeneration === 1 && reservation.admission.receiverId === reservation.receiver.receiverId &&
  reservation.admission.receiverSlotIdentity === reservation.slot.slotId.value &&
  reservation.admission.receiverProcessName === reservation.slot.processName.value &&
  reservation.admission.receiverEntryIdentity.value === reservation.receiver.receiverEntryIdentity.value &&
  reservation.admission.slotIndependentPlanDigest.value === reservation.identity.slotIndependentPlanDigest.value &&
  reservation.admission.launchMetadataDigest === reservation.launch.metadataDigest;

const materializingCommandForReservation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>
): ReserveGrantQualifiedMaterializingAttempt => ({
  authorityCheckedAtMs: reservation.launch.startedAtMs,
  authority: reservation.authority,
  admission: reservation.admission,
  reservation: {
    operationId: reservation.identity.reserveOperationId,
    attempt: {
      id: reservation.identity.attemptId,
      reserveOperationId: reservation.identity.reserveOperationId,
      repository: reservation.authority.repository,
      recipeRevision: reservation.authority.recipeRevision,
      planDigest: reservation.attempt.planDigest,
      lifecycle: 'one-shot',
      receiverCorrelation: null,
      state: 'reserved',
      stateVersion: 1,
      createdAtMs: reservation.launch.startedAtMs,
      updatedAtMs: reservation.launch.startedAtMs,
      bootstrapBinding: null
    }
  },
  materialization: {
    operationId: reservation.identity.materializeOperationId,
    attemptId: reservation.identity.attemptId,
    expectedState: 'reserved',
    nextState: 'materializing',
    atMs: reservation.launch.startedAtMs,
    receiverCorrelation: reservation.receiver.receiverCorrelation
  }
});

export const validateGrantQualifiedOneShotReservation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>
): boolean => {
  const raw: Readonly<Record<string, unknown>> = reservation;
  const digest = deriveGrantQualifiedOneShotReservationDigest(
    reservation.identity,
    reservation.allocationNamespace,
    reservation.slot,
    reservation.receiver,
    reservation.launch
  );
  return raw['state'] === 'materializing-reserved' &&
    (raw['status'] === 'committed' || raw['status'] === 'already-committed') &&
    validateGrantQualifiedMaterializingAttempt(materializingCommandForReservation(reservation)).type === 'ok' &&
    exactReservationFacts(reservation) && digest.outcome === 'success' &&
    digest.value.value === reservation.exactReservationDigest.value;
};

export const sameGrantQualifiedOneShotDurableRecord = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  current: GrantQualifiedMaterializingAttemptRecord
): boolean => sameReservationAttemptIdentity(reservation.attempt, current.attempt) &&
  ((current.attempt.stateVersion === reservation.attempt.stateVersion &&
    current.attempt.updatedAtMs === reservation.attempt.updatedAtMs && current.attempt.bootstrapBinding === null) ||
    samePreconfirmedBootstrapAttempt(reservation, current)) &&
  sameReservationAuthority(reservation.authority, current.authority) &&
  sameReservationAdmission(reservation.admission, current.admission);

const finalize = <Payload>(
  input: ReservationInput,
  identity: GrantQualifiedOneShotIdentity,
  slot: OneShotSlotDefinition,
  allocationNamespace: string,
  current: GrantQualifiedMaterializingAttemptRecord | null,
  factory: GrantQualifiedOneShotLaunchFactory<Payload>
): Promise<OneShotResult<Readonly<{
  receiver: OneShotMaterializationReceiverIdentity;
  launch: AdmittedOneShotLaunch<Payload>;
  digest: RedactedPlanDigest;
}>, OneShotMaterializationReservationIssue>> => {
  const receiver = receiverFor(input.plan, identity, slot);
  if (receiver.outcome === 'failure') return Promise.resolve(receiver);
  const startedAtMs = current?.attempt.createdAtMs ?? input.observedAtMs;
  const candidateDeadlineAtMs = startedAtMs + input.plan.timeoutMs;
  const deadlineAtMs = Math.min(candidateDeadlineAtMs, input.plan.authority.grantExpiresAtMs);
  if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= startedAtMs) {
    return Promise.resolve(failure(invalid()));
  }
  const context: GrantQualifiedOneShotFinalizationContext = {
    plan: input.plan,
    slot,
    identity,
    receiver: receiver.value,
    startedAtMs,
    deadlineAtMs
  };
  return Promise.resolve().then(() => factory.finalizeForSlot(context)).then(
    finalized => {
      if (finalized.outcome === 'failure' ||
          !validLaunch(finalized.value, identity, startedAtMs, deadlineAtMs)) {
        return failure(factoryFailed());
      }
      const digest = deriveGrantQualifiedOneShotReservationDigest(
        identity,
        allocationNamespace,
        slot,
        receiver.value,
        finalized.value
      );
      return digest.outcome === 'failure'
        ? digest
        : success({ receiver: receiver.value, launch: finalized.value, digest: digest.value });
    },
    () => failure(factoryFailed())
  );
};

const exactObservation = <Payload>(
  slot: OneShotSlotDefinition,
  launch: AdmittedOneShotLaunch<Payload>,
  observations: readonly OneShotSlotObservation[]
): boolean => {
  const observation = observations.find(candidate => sameOneShotSlotId(candidate.slotId, slot.slotId));
  if (observation === undefined || !sameOneShotProcessName(observation.processName, slot.processName)) return false;
  if (observation.occupant.kind === 'empty') return true;
  return observation.occupant.kind === 'owned' && observation.occupant.metadata.attemptId === launch.attemptId &&
    observation.occupant.metadata.metadataDigest === launch.metadataDigest &&
    observation.occupant.metadata.startedAtMs === launch.startedAtMs &&
    observation.occupant.metadata.deadlineAtMs === launch.deadlineAtMs &&
    (observation.occupant.status === 'online' || observation.occupant.status === 'launching');
};

const commandFor = (
  input: ReservationInput,
  identity: GrantQualifiedOneShotIdentity,
  slot: OneShotSlotDefinition,
  finalized: Readonly<{
    receiver: OneShotMaterializationReceiverIdentity;
    launch: AdmittedOneShotLaunch<unknown>;
    digest: RedactedPlanDigest;
  }>
): ReserveGrantQualifiedMaterializingAttempt => {
  const atMs = finalized.launch.startedAtMs;
  return {
    authorityCheckedAtMs: input.observedAtMs,
    authority: {
      grantId: input.plan.authority.grantId,
      grantGeneration: input.plan.authority.grantGeneration,
      repository: input.plan.repository,
      recipeRevision: input.plan.recipeRevision,
      credentialSlotIds: input.plan.credentialSlots.map(slot => slot.slotId),
      grantExpiresAtMs: input.plan.authority.grantExpiresAtMs
    },
    admission: {
      format: 'grant-qualified-launch-admission/v1',
      bindingGeneration: 1,
      receiverId: finalized.receiver.receiverId,
      receiverSlotIdentity: slot.slotId.value,
      receiverProcessName: slot.processName.value,
      receiverEntryIdentity: finalized.receiver.receiverEntryIdentity,
      recipeLocator: input.plan.recipeLocator,
      slotIndependentPlanDigest: identity.slotIndependentPlanDigest,
      launchMetadataDigest: finalized.launch.metadataDigest,
      deadlineAtMs: finalized.launch.deadlineAtMs
    },
    reservation: {
      operationId: identity.reserveOperationId,
      attempt: {
        id: identity.attemptId,
        reserveOperationId: identity.reserveOperationId,
        repository: input.plan.repository,
        recipeRevision: input.plan.recipeRevision,
        planDigest: { kind: 'redacted-plan-digest', value: finalized.launch.metadataDigest },
        lifecycle: 'one-shot',
        receiverCorrelation: null,
        state: 'reserved',
        stateVersion: 1,
        createdAtMs: atMs,
        updatedAtMs: atMs,
        bootstrapBinding: null
      }
    },
    materialization: {
      operationId: identity.materializeOperationId,
      attemptId: identity.attemptId,
      expectedState: 'reserved',
      nextState: 'materializing',
      atMs,
      receiverCorrelation: finalized.receiver.receiverCorrelation
    }
  };
};

const journalFailure = (code: JournalIssueCode): OneShotMaterializationReservationIssue =>
  code === 'journal-authority-stale'
    ? {
        code: 'one-shot-materialization-authority-stale',
        action: 'cancel-or-reconcile',
        safeMessage: 'The durable reservation no longer has current execution authority.'
      }
    : {
        code: 'one-shot-materialization-journal-failed',
        journalCode: code,
        safeMessage: 'The durable materializing reservation failed closed.'
      };

const persist = <Payload>(
  input: ReservationInput,
  identity: GrantQualifiedOneShotIdentity,
  allocationNamespace: string,
  slot: OneShotSlotDefinition,
  finalized: Readonly<{
    receiver: OneShotMaterializationReceiverIdentity;
    launch: AdmittedOneShotLaunch<Payload>;
    digest: RedactedPlanDigest;
  }>,
  ports: OneShotMaterializationReservationPorts
): Promise<OneShotResult<GrantQualifiedOneShotReservation<Payload>, OneShotMaterializationReservationIssue>> => {
  const command = commandFor(input, identity, slot, finalized);
  return Promise.resolve().then(() => ports.attempts.reserveGrantQualifiedMaterializing(command)).then(
    committed => committed.type === 'err'
      ? failure(journalFailure(committed.issues[0].code))
      : success({
          state: 'materializing-reserved',
          status: committed.value.status,
          allocationNamespace,
          identity,
          slot,
          receiver: finalized.receiver,
          exactReservationDigest: finalized.digest,
          attempt: {
            ...command.reservation.attempt,
            receiverCorrelation: command.materialization.receiverCorrelation,
            state: 'materializing',
            stateVersion: 2,
            updatedAtMs: command.materialization.atMs
          },
          authority: committed.value.record.authority,
          admission: committed.value.record.admission,
          launch: finalized.launch
        }),
    () => failure(journalFailure('journal-unavailable'))
  );
};

const reserveUnderLock = <Payload>(
  input: ReservationInput,
  identity: GrantQualifiedOneShotIdentity,
  pool: OneShotSlotPool,
  factory: GrantQualifiedOneShotLaunchFactory<Payload>,
  ports: OneShotMaterializationReservationPorts
): Promise<OneShotResult<GrantQualifiedOneShotReservation<Payload>, OneShotMaterializationReservationIssue>> =>
  Promise.resolve().then(() => ports.attempts.readGrantQualifiedMaterializing(identity.attemptId)).then(
    current => current.type === 'err'
      ? failure(journalFailure(current.issues[0].code))
      : current.value !== null && !sameDurablePlan(input.plan, identity, current.value)
        ? failure(journalFailure('journal-conflict'))
      : Promise.resolve().then(() => ports.observe(pool)).then(
          observed => {
            if (observed.outcome === 'failure') return observed;
            const slot = selectSlot(input, identity, pool, observed.value, current.value);
            if (slot.outcome === 'failure') return slot;
            return finalize(input, identity, slot.value, pool.namespace, current.value, factory).then(finalized => {
              if (finalized.outcome === 'failure') return finalized;
              return exactObservation(slot.value, finalized.value.launch, observed.value)
                ? persist(input, identity, pool.namespace, slot.value, finalized.value, ports)
                : failure(recoveryRequired());
            });
          },
          () => failure(portFailed('one-shot-reservation-observation-unavailable'))
        ),
    () => failure(journalFailure('journal-unavailable'))
  );

export const reserveGrantQualifiedOneShotMaterialization = <Payload>(
  plan: RecipeMaterializationPlan,
  observedAtMs: number,
  pool: OneShotSlotPool,
  factory: GrantQualifiedOneShotLaunchFactory<Payload>,
  ports: OneShotMaterializationReservationPorts
): Promise<OneShotResult<GrantQualifiedOneShotReservation<Payload>, OneShotMaterializationReservationIssue>> => {
  const identity = deriveGrantQualifiedOneShotIdentity(plan);
  if (identity.outcome === 'failure' || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    return Promise.resolve(identity.outcome === 'failure' ? identity : failure(invalid()));
  }
  if (observedAtMs >= plan.authority.grantExpiresAtMs) {
    return Promise.resolve(failure(journalFailure('journal-authority-stale')));
  }
  return Promise.resolve().then(() => ports.withAllocationLock(
    pool.namespace,
    () => reserveUnderLock({ plan, observedAtMs }, identity.value, pool, factory, ports)
  )).then(
    result => result,
    () => failure(portFailed('one-shot-reservation-lock-unavailable'))
  );
};
