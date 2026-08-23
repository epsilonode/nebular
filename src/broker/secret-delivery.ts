import { match } from 'ts-pattern';

import type { CredentialSlotId, GrantId, ProcessAttemptId, ReceiverId } from './primitives.ts';
import {
  reduceSecretLease,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type ActiveSecretLease,
  type AuthorizedSecretLease,
  type ConsumedSecretLease,
  type CredentialReference,
  type RevokedSecretLease,
  type SecretLeaseId,
  type SecretLeaseIssueCode,
  type SecretLeaseIssues,
  type SecretLeaseResult,
  type SecretLeaseTaskResult,
  type SecretLeaseRevocationReason,
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
  secretsCleared: true;
}>;

/**
 * `runWithSecrets` owns atomic staging, application execution, and cleanup.
 * It must clear staged/bootstrap copies before returning either branch.
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

export type CompletedSecretDelivery = Readonly<{
  outcome: 'completed';
  lease: ConsumedSecretLease;
  leaseId: SecretLeaseId;
  processAttemptId: ProcessAttemptId;
  deliveredSlotIds: readonly CredentialSlotId[];
  secretsCleared: true;
}>;

export type RevokedSecretDelivery = Readonly<{
  outcome: 'revoked';
  lease: RevokedSecretLease;
  leaseId: SecretLeaseId;
  processAttemptId: ProcessAttemptId;
  deliveredSlotIds: readonly CredentialSlotId[];
  secretsCleared: true;
  reason: SecretLeaseRevocationReason;
  issueCodes: readonly SecretLeaseIssueCode[];
}>;

export type SecretDeliveryTerminal = CompletedSecretDelivery | RevokedSecretDelivery;

const toBootstrapSlot = (binding: SecretSlotBinding): BootstrapSecretSlot => ({
  slotId: binding.slotId,
  environmentName: binding.environmentName
});

const toBootstrapContext = (lease: ActiveSecretLease): BootstrapSecretContext => ({
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

const revocationReason = (issues: SecretLeaseIssues): SecretLeaseRevocationReason =>
  match<SecretLeaseIssueCode, SecretLeaseRevocationReason>(issues[0].code)
    .with('secret-unavailable', () => 'secret-unavailable')
    .with('grant-revoked', () => 'grant-revoked')
    .with('grant-expired', 'lease-expired', () => 'lease-expired')
    .otherwise(() => 'bootstrap-rejected');

const revokeAfterDeliveryFailure = (
  lease: ActiveSecretLease,
  atMs: number,
  issues: SecretLeaseIssues
): SecretLeaseResult<SecretDeliveryTerminal> => {
  const reason = revocationReason(issues);
  return reduceSecretLease(lease, { type: 'revoke', atMs, reason }).andThen(terminal =>
    terminal.state === 'revoked'
      ? secretLeaseOk<SecretDeliveryTerminal>({
          outcome: 'revoked',
          lease: terminal,
          leaseId: terminal.facts.id,
          processAttemptId: terminal.facts.processAttemptId,
          deliveredSlotIds: [],
          secretsCleared: true,
          reason,
          issueCodes: issues.map(issue => issue.code)
        })
      : secretLeaseErr({
          code: 'lease-transition-invalid',
          message: 'Secret delivery failure did not revoke its lease.'
        })
  );
};

const completeDelivery = (
  lease: ActiveSecretLease,
  receipt: BootstrapSecretReceipt,
  atMs: number
): SecretLeaseResult<SecretDeliveryTerminal> => {
  const expectedSlotIds: readonly CredentialSlotId[] = lease.facts.bindings.map(binding => binding.slotId);
  if (receipt.leaseId.value !== lease.facts.id.value ||
      receipt.processAttemptId !== lease.facts.processAttemptId ||
      !sameSlotSet(receipt.installedSlotIds, expectedSlotIds)) {
    return revokeAfterDeliveryFailure(
      lease,
      atMs,
      [{ code: 'bootstrap-rejected', message: 'Bootstrap returned inconsistent redacted receipt facts.' }]
    );
  }
  return reduceSecretLease(lease, { type: 'complete', atMs }).andThen(terminal =>
    terminal.state === 'consumed'
      ? secretLeaseOk<SecretDeliveryTerminal>({
          outcome: 'completed',
          lease: terminal,
          leaseId: terminal.facts.id,
          processAttemptId: terminal.facts.processAttemptId,
          deliveredSlotIds: receipt.installedSlotIds,
          secretsCleared: true
        })
      : terminal.state === 'revoked'
        ? secretLeaseOk<SecretDeliveryTerminal>({
            outcome: 'revoked',
            lease: terminal,
            leaseId: terminal.facts.id,
            processAttemptId: terminal.facts.processAttemptId,
            deliveredSlotIds: receipt.installedSlotIds,
            secretsCleared: true,
            reason: terminal.reason,
            issueCodes: ['lease-expired']
          })
        : secretLeaseErr({
            code: 'lease-transition-invalid',
            message: 'Bootstrap completion did not terminate its secret lease.'
          })
  );
};

export const activateAuthorizedSecretLease = (
  lease: AuthorizedSecretLease,
  atMs: number
): SecretLeaseResult<ActiveSecretLease> => reduceSecretLease(lease, { type: 'activate', atMs }).andThen(activated =>
  activated.state === 'active'
    ? secretLeaseOk(activated)
    : secretLeaseErr({
        code: 'lease-transition-invalid',
        message: 'Secret lease activation produced a non-active state.'
      })
);

export const deliverActiveSecretLease = (
  active: ActiveSecretLease,
  ports: SecretDeliveryPorts
): SecretLeaseTaskResult<SecretDeliveryTerminal> => ports.bootstrap.runWithSecrets(
  toBootstrapContext(active),
  sink => deliverBindings(active.facts.bindings, 0, sink, ports.secretStore)
).andThen(receipt => completeDelivery(active, receipt, ports.clock.nowMs()))
  .orElse(issues => revokeAfterDeliveryFailure(active, ports.clock.nowMs(), issues));

export const deliverAuthorizedSecretLease = (
  lease: AuthorizedSecretLease,
  ports: SecretDeliveryPorts
): SecretLeaseTaskResult<SecretDeliveryTerminal> => {
  const activation = activateAuthorizedSecretLease(lease, ports.clock.nowMs());
  if (activation.isErr()) return secretLeaseTaskErr(activation.error[0], ...activation.error.slice(1));
  return deliverActiveSecretLease(activation.value, ports);
};
