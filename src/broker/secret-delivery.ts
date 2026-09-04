import type { CredentialSlotId, GrantId, ProcessAttemptId, ReceiverId } from './primitives.ts';
import {
  reduceSecretLease,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type AuthorizedSecretLease,
  type CredentialReference,
  type DeliveringSecretLease,
  type ExposedSecretLease,
  type RecoveryRequiredSecretLease,
  type SecretLeaseId,
  type SecretLeaseIssueCode,
  type SecretLeaseIssues,
  type SecretLeaseResult,
  type SecretLeaseTaskResult,
  type SecretSlotBinding
} from './lease.ts';

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
  withSecret: (
    reference: CredentialReference,
    use: (secret: ScopedSecret) => SecretLeaseResult<void>
  ) => SecretLeaseTaskResult<void>;
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
  runWithSecrets: (
    context: BootstrapSecretContext,
    install: (sink: BootstrapSecretSink) => SecretLeaseTaskResult<void>
  ) => SecretLeaseTaskResult<BootstrapSecretReceipt>;
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

const toBootstrapSlot = (binding: SecretSlotBinding): BootstrapSecretSlot => ({
  slotId: binding.slotId,
  environmentName: binding.environmentName
});

const toBootstrapContext = (lease: DeliveringSecretLease): BootstrapSecretContext => ({
  leaseId: lease.facts.id,
  grantId: lease.facts.grantId,
  grantGeneration: lease.facts.grantGeneration,
  receiverId: lease.facts.receiverId,
  processAttemptId: lease.facts.processAttemptId,
  expiresAtMs: lease.facts.expiresAtMs,
  slots: lease.facts.bindings.map(toBootstrapSlot)
});

const deliverBindings = (
  bindings: readonly SecretSlotBinding[],
  index: number,
  sink: BootstrapSecretSink,
  store: SecretStoreLeasePort
): SecretLeaseTaskResult<void> => {
  const binding = bindings[index];
  return binding === undefined
    ? secretLeaseTaskOk(undefined)
    : store.withSecret(
        binding.credentialReference,
        secret => secret.deliverTo(sink, toBootstrapSlot(binding))
      ).andThen(() => deliverBindings(bindings, index + 1, sink, store));
};

const sameSlotSet = (left: readonly CredentialSlotId[], right: readonly CredentialSlotId[]): boolean => {
  const normalizedLeft: readonly CredentialSlotId[] = [...new Set(left)].toSorted();
  const normalizedRight: readonly CredentialSlotId[] = [...new Set(right)].toSorted();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((slotId, index) => slotId === normalizedRight[index]);
};

const recoverAfterDeliveryFailure = (
  lease: DeliveringSecretLease,
  atMs: number,
  issues: SecretLeaseIssues
): SecretLeaseResult<SecretDeliveryOutcome> =>
  reduceSecretLease(lease, { type: 'require-recovery', atMs, reason: 'delivery-failed' }).andThen(terminal =>
    terminal.state === 'recovery-required'
      ? secretLeaseOk<SecretDeliveryOutcome>({
          outcome: 'recovery-required',
          lease: terminal,
          leaseId: terminal.facts.id,
          processAttemptId: terminal.facts.processAttemptId,
          deliveredSlotIds: [],
          exposureMayHaveOccurred: true,
          brokerCopiesReleased: true,
          issueCodes: issues.map(issue => issue.code)
        })
      : secretLeaseErr({
          code: 'lease-transition-invalid',
          message: 'Secret delivery failure did not enter durable recovery.'
        })
  );

const acknowledgeExposure = (
  lease: DeliveringSecretLease,
  receipt: BootstrapSecretReceipt,
  atMs: number
): SecretLeaseResult<SecretDeliveryOutcome> => {
  const expectedSlotIds: readonly CredentialSlotId[] = lease.facts.bindings.map(binding => binding.slotId);
  if (receipt.leaseId.value !== lease.facts.id.value ||
      receipt.processAttemptId !== lease.facts.processAttemptId ||
      !sameSlotSet(receipt.installedSlotIds, expectedSlotIds)) {
    return reduceSecretLease(lease, {
      type: 'require-recovery',
      atMs,
      reason: 'acknowledgement-ambiguous'
    }).andThen(terminal => terminal.state === 'recovery-required'
      ? secretLeaseOk<SecretDeliveryOutcome>({
          outcome: 'recovery-required',
          lease: terminal,
          leaseId: terminal.facts.id,
          processAttemptId: terminal.facts.processAttemptId,
          deliveredSlotIds: [],
          exposureMayHaveOccurred: true,
          brokerCopiesReleased: receipt.brokerCopiesReleased,
          issueCodes: ['bootstrap-rejected']
        })
      : secretLeaseErr({ code: 'lease-transition-invalid', message: 'Exposure ambiguity was not retained.' }));
  }
  return reduceSecretLease(lease, { type: 'acknowledge-exposure', atMs }).andThen(exposed =>
    exposed.state === 'exposed'
      ? secretLeaseOk<SecretDeliveryOutcome>({
          outcome: 'exposed',
          lease: exposed,
          leaseId: exposed.facts.id,
          processAttemptId: exposed.facts.processAttemptId,
          deliveredSlotIds: receipt.installedSlotIds,
          environmentInstalled: receipt.environmentInstalled,
          brokerCopiesReleased: receipt.brokerCopiesReleased
        })
      : secretLeaseErr({
          code: 'lease-transition-invalid',
          message: 'Bootstrap acknowledgement did not establish secret exposure.'
        })
  );
};

export const beginAuthorizedSecretDelivery = (
  lease: AuthorizedSecretLease,
  atMs: number
): SecretLeaseResult<DeliveringSecretLease> => reduceSecretLease(lease, { type: 'begin-delivery', atMs })
  .andThen(delivering => delivering.state === 'delivering'
    ? secretLeaseOk(delivering)
    : secretLeaseErr({
        code: 'lease-transition-invalid',
        message: 'Secret delivery did not enter the delivering state.'
      })
  );

export const deliverDeliveringSecretLease = (
  delivering: DeliveringSecretLease,
  ports: SecretDeliveryPorts
): SecretLeaseTaskResult<SecretDeliveryOutcome> => ports.bootstrap.runWithSecrets(
  toBootstrapContext(delivering),
  sink => deliverBindings(delivering.facts.bindings, 0, sink, ports.secretStore)
).andThen(receipt => acknowledgeExposure(delivering, receipt, ports.clock.nowMs()))
  .orElse(issues => recoverAfterDeliveryFailure(delivering, ports.clock.nowMs(), issues));

export const deliverAuthorizedSecretLease = (
  lease: AuthorizedSecretLease,
  ports: SecretDeliveryPorts
): SecretLeaseTaskResult<SecretDeliveryOutcome> => {
  const delivering = beginAuthorizedSecretDelivery(lease, ports.clock.nowMs());
  if (delivering.isErr()) return secretLeaseTaskErr(delivering.error[0], ...delivering.error.slice(1));
  return deliverDeliveringSecretLease(delivering.value, ports);
};
