import type { CredentialSlotId, GrantId, ProcessAttemptId, ReceiverId } from './primitives.ts';
import { type AuthorizedSecretLease, type CredentialReference, type DeliveringSecretLease, type ExposedSecretLease, type RecoveryRequiredSecretLease, type SecretLeaseId, type SecretLeaseIssueCode, type SecretLeaseResult, type SecretLeaseTaskResult } from './lease.ts';
export type BootstrapSecretSlot = Readonly<{
    slotId: CredentialSlotId;
    environmentName: string;
}>;
/** The only broker port whose implementation receives raw secret text. */
export type BootstrapSecretSink = Readonly<{
    install: (slot: BootstrapSecretSlot, secretText: string) => SecretLeaseResult<void>;
}>;
/**
 * An opaque, callback-scoped capability produced by a SecretStore adapter.
 * It has no read, string, JSON, equality, or cloning operation. The capability
 * can only transfer its value into the explicit bootstrap sink.
 */
export type ScopedSecret = Readonly<{
    deliverTo: (sink: BootstrapSecretSink, slot: BootstrapSecretSlot) => SecretLeaseResult<void>;
}>;
export type SecretStoreLeasePort = Readonly<{
    withSecret: (reference: CredentialReference, use: (secret: ScopedSecret) => SecretLeaseResult<void>) => SecretLeaseTaskResult<void>;
}>;
export type BootstrapSecretContext = Readonly<{
    leaseId: SecretLeaseId;
    grantId: GrantId;
    grantGeneration: number;
    receiverId: ReceiverId;
    processAttemptId: ProcessAttemptId;
    expiresAtMs: number;
    slots: readonly BootstrapSecretSlot[];
}>;
export type BootstrapSecretReceipt = Readonly<{
    leaseId: SecretLeaseId;
    processAttemptId: ProcessAttemptId;
    installedSlotIds: readonly CredentialSlotId[];
    environmentInstalled: true;
    brokerCopiesReleased: true;
}>;
/**
 * `runWithSecrets` owns atomic broker-side staging and exchange cleanup.
 * It clears broker/transport copies, but never claims target exposure ended.
 */
export type BootstrapSecretPort = Readonly<{
    runWithSecrets: (context: BootstrapSecretContext, install: (sink: BootstrapSecretSink) => SecretLeaseTaskResult<void>) => SecretLeaseTaskResult<BootstrapSecretReceipt>;
}>;
export type SecretDeliveryClock = Readonly<{
    nowMs: () => number;
}>;
export type SecretDeliveryPorts = Readonly<{
    clock: SecretDeliveryClock;
    secretStore: SecretStoreLeasePort;
    bootstrap: BootstrapSecretPort;
}>;
export type ExposedSecretDelivery = Readonly<{
    outcome: 'exposed';
    lease: ExposedSecretLease;
    leaseId: SecretLeaseId;
    processAttemptId: ProcessAttemptId;
    deliveredSlotIds: readonly CredentialSlotId[];
    environmentInstalled: true;
    brokerCopiesReleased: true;
}>;
export type RecoveryRequiredSecretDelivery = Readonly<{
    outcome: 'recovery-required';
    lease: RecoveryRequiredSecretLease;
    leaseId: SecretLeaseId;
    processAttemptId: ProcessAttemptId;
    deliveredSlotIds: readonly CredentialSlotId[];
    exposureMayHaveOccurred: true;
    brokerCopiesReleased: true;
    issueCodes: readonly SecretLeaseIssueCode[];
}>;
export type SecretDeliveryOutcome = ExposedSecretDelivery | RecoveryRequiredSecretDelivery;
export declare const beginAuthorizedSecretDelivery: (lease: AuthorizedSecretLease, atMs: number) => SecretLeaseResult<DeliveringSecretLease>;
export declare const deliverDeliveringSecretLease: (delivering: DeliveringSecretLease, ports: SecretDeliveryPorts) => SecretLeaseTaskResult<SecretDeliveryOutcome>;
export declare const deliverAuthorizedSecretLease: (lease: AuthorizedSecretLease, ports: SecretDeliveryPorts) => SecretLeaseTaskResult<SecretDeliveryOutcome>;
