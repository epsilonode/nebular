import { type AttemptJournal, type AttemptJournalRecord, type GrantQualifiedAttemptAuthority, type GrantQualifiedOneShotLaunchAdmission, type GrantQualifiedMaterializingAttemptRecord, type JournalIssueCode, type JournalMutation, type ReceiverCorrelation, type ReceiverEntryIdentity, type RedactedPlanDigest, type ReserveGrantQualifiedMaterializingAttempt } from './journal.ts';
import { type AdmittedOneShotLaunch, type OneShotLaunchFactoryIssue } from './one-shot-receiver.ts';
import { type OneShotAllocationIssue, type OneShotResult, type OneShotSlotDefinition, type OneShotSlotObservation, type OneShotSlotPool } from './one-shot-slots.ts';
import { type ProcessAttemptId, type ReceiverId } from './primitives.ts';
import { type RecipeMaterializationPlan } from './recipe-materialization-plan.ts';
export declare const ONE_SHOT_ATTEMPT_ID_DOMAIN: "epsilonode.nebular.one-shot-attempt-id/v1";
export declare const ONE_SHOT_RESERVE_OPERATION_DOMAIN: "epsilonode.nebular.one-shot-reserve-operation/v1";
export declare const ONE_SHOT_MATERIALIZE_OPERATION_DOMAIN: "epsilonode.nebular.one-shot-materialize-operation/v1";
export declare const ONE_SHOT_SLOT_CORRELATION_DOMAIN: "epsilonode.nebular.one-shot-slot-correlation/v1";
export declare const ONE_SHOT_EXACT_RESERVATION_DIGEST_DOMAIN: "epsilonode.nebular.one-shot-exact-reservation-digest/v1";
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
    finalizeForSlot: (context: GrantQualifiedOneShotFinalizationContext) => OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue> | Promise<OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue>>;
}>;
export type OneShotMaterializationReservationPortIssue = Readonly<{
    code: 'one-shot-reservation-lock-unavailable' | 'one-shot-reservation-observation-unavailable';
    safeMessage: string;
}>;
export type OneShotMaterializationReservationIssue = OneShotAllocationIssue | OneShotLaunchFactoryIssue | OneShotMaterializationReservationPortIssue | Readonly<{
    code: 'one-shot-materialization-reservation-invalid';
    safeMessage: string;
}> | Readonly<{
    code: 'one-shot-materialization-journal-failed';
    journalCode: JournalIssueCode;
    safeMessage: string;
}> | Readonly<{
    code: 'one-shot-materialization-authority-stale';
    action: 'cancel-or-reconcile';
    safeMessage: string;
}> | Readonly<{
    code: 'one-shot-materialization-recovery-required';
    safeMessage: string;
}>;
export type OneShotMaterializationReservationPorts = Readonly<{
    withAllocationLock: <Value>(namespace: string, work: () => Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>>) => Promise<OneShotResult<Value, OneShotMaterializationReservationIssue>>;
}> & Readonly<{
    observe: (pool: OneShotSlotPool) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotMaterializationReservationPortIssue>>;
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
export declare const deriveGrantQualifiedOneShotIdentity: (plan: RecipeMaterializationPlan) => OneShotResult<GrantQualifiedOneShotIdentity, OneShotMaterializationReservationIssue>;
export declare const deriveGrantQualifiedOneShotReservationDigest: (identity: GrantQualifiedOneShotIdentity, allocationNamespace: string, slot: OneShotSlotDefinition, receiver: OneShotMaterializationReceiverIdentity, launch: AdmittedOneShotLaunch<unknown>) => OneShotResult<RedactedPlanDigest, OneShotMaterializationReservationIssue>;
export declare const validateGrantQualifiedOneShotReservation: <Payload>(reservation: GrantQualifiedOneShotReservation<Payload>) => boolean;
export declare const sameGrantQualifiedOneShotDurableRecord: <Payload>(reservation: GrantQualifiedOneShotReservation<Payload>, current: GrantQualifiedMaterializingAttemptRecord) => boolean;
export declare const reserveGrantQualifiedOneShotMaterialization: <Payload>(plan: RecipeMaterializationPlan, observedAtMs: number, pool: OneShotSlotPool, factory: GrantQualifiedOneShotLaunchFactory<Payload>, ports: OneShotMaterializationReservationPorts) => Promise<OneShotResult<GrantQualifiedOneShotReservation<Payload>, OneShotMaterializationReservationIssue>>;
