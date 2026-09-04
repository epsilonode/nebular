import { err, errAsync, ok, okAsync, type Result, type ResultAsync } from 'neverthrow';
import { match } from 'ts-pattern';

import type {
  CanonicalRepository,
  CredentialSlotId,
  GrantId,
  ProcessAttemptId,
  ReceiverId,
  RecipeRevision
} from './primitives.ts';

export type SecretLeaseIssueCode =
  | 'attempt-not-ready'
  | 'bootstrap-rejected'
  | 'grant-expired'
  | 'grant-revoked'
  | 'lease-expired'
  | 'lease-invalid'
  | 'lease-transition-invalid'
  | 'recipe-drift'
  | 'secret-input-invalid'
  | 'secret-store-failed'
  | 'secret-unavailable'
  | 'slot-not-authorized';

export type SecretLeaseIssue = Readonly<{
  code: SecretLeaseIssueCode;
  message: string;
}>;

export type SecretLeaseIssues = readonly [SecretLeaseIssue, ...SecretLeaseIssue[]];
export type SecretLeaseResult<T> = Result<T, SecretLeaseIssues>;
export type SecretLeaseTaskResult<T> = ResultAsync<T, SecretLeaseIssues>;

export const secretLeaseOk = <T>(value: T): SecretLeaseResult<T> => ok(value);
export const secretLeaseErr = <T = never>(
  issue: SecretLeaseIssue,
  ...rest: readonly SecretLeaseIssue[]
): SecretLeaseResult<T> => err([issue, ...rest]);
export const secretLeaseTaskOk = <T>(value: T): SecretLeaseTaskResult<T> => okAsync(value);
export const secretLeaseTaskErr = <T = never>(
  issue: SecretLeaseIssue,
  ...rest: readonly SecretLeaseIssue[]
): SecretLeaseTaskResult<T> => errAsync([issue, ...rest]);

type OpaqueReference<Kind extends string> = Readonly<{
  kind: Kind;
  value: string;
}>;

export type CredentialReference = OpaqueReference<'credential-reference'>;
export type SecretLeaseId = OpaqueReference<'secret-lease-id'>;
export type SecretExposureCorrelation = OpaqueReference<'secret-exposure-correlation'>;
export type SecretExposureCleanupReceiptId = OpaqueReference<'secret-exposure-cleanup-receipt-id'>;

type SecretLeaseReferenceKind =
  | CredentialReference['kind']
  | SecretLeaseId['kind']
  | SecretExposureCorrelation['kind']
  | SecretExposureCleanupReceiptId['kind'];

const parseReference = <Kind extends SecretLeaseReferenceKind>(
  kind: Kind,
  value: unknown
): SecretLeaseResult<OpaqueReference<Kind>> =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0')
    ? secretLeaseOk({ kind, value })
    : secretLeaseErr({ code: 'lease-invalid', message: 'A secret-delivery reference is invalid.' });

export const parseCredentialReference = (value: unknown): SecretLeaseResult<CredentialReference> =>
  parseReference('credential-reference', value);
export const parseSecretLeaseId = (value: unknown): SecretLeaseResult<SecretLeaseId> =>
  parseReference('secret-lease-id', value);
export const parseSecretExposureCorrelation = (value: unknown): SecretLeaseResult<SecretExposureCorrelation> =>
  parseReference('secret-exposure-correlation', value);
export const parseSecretExposureCleanupReceiptId = (
  value: unknown
): SecretLeaseResult<SecretExposureCleanupReceiptId> => parseReference('secret-exposure-cleanup-receipt-id', value);

export type SecretSlotBinding = Readonly<{
  slotId: CredentialSlotId;
  credentialReference: CredentialReference;
  environmentName: string;
}>;

export type SecretDeliveryGrant = Readonly<{
  id: GrantId;
  generation: number;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  bindings: readonly SecretSlotBinding[];
  expiresAtMs: number;
  revoked: boolean;
  exposureMode: 'cooperative-bootstrap';
}>;

export type SecretLeaseRequest = Readonly<{
  id: SecretLeaseId;
  grantId: GrantId;
  grantGeneration: number;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  receiverId: ReceiverId;
  processAttemptId: ProcessAttemptId;
  exposureCorrelation: SecretExposureCorrelation;
  bindings: readonly SecretSlotBinding[];
  requestedAtMs: number;
  expiresAtMs: number;
  exposureMode: 'cooperative-bootstrap';
}>;

export type SecretLeaseFacts = Readonly<{
  id: SecretLeaseId;
  grantId: GrantId;
  grantGeneration: number;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  receiverId: ReceiverId;
  processAttemptId: ProcessAttemptId;
  exposureCorrelation: SecretExposureCorrelation;
  bindings: readonly SecretSlotBinding[];
  authorizedAtMs: number;
  expiresAtMs: number;
  exposureMode: 'cooperative-bootstrap';
}>;

export type AuthorizedSecretLease = Readonly<{
  state: 'authorized';
  facts: SecretLeaseFacts;
}>;

export type DeliveringSecretLease = Readonly<{
  state: 'delivering';
  facts: SecretLeaseFacts;
  deliveryStartedAtMs: number;
}>;

export type ExposedSecretLease = Readonly<{
  state: 'exposed';
  facts: SecretLeaseFacts;
  deliveryStartedAtMs: number;
  acknowledgedAtMs: number;
}>;

export type SecretLeaseRevocationReason =
  | 'bootstrap-rejected'
  | 'cancelled'
  | 'grant-revoked'
  | 'lease-expired'
  | 'secret-unavailable'
  | 'target-terminal';

export type SecretExposureClosureReason =
  | 'cancelled'
  | 'grant-revoked'
  | 'lease-expired'
  | 'target-terminal';

export type SecretExposureRecoveryReason =
  | 'acknowledgement-ambiguous'
  | 'cleanup-ambiguous'
  | 'delivery-failed'
  | 'journal-ambiguous';

export type SecretExposureRecoveryPhase = 'authorization' | 'delivery' | 'exposure' | 'closure';

export type SecretExposureCleanupReceipt = Readonly<{
  format: 'secret-exposure-cleanup-receipt/v1';
  id: SecretExposureCleanupReceiptId;
  exposureCorrelation: SecretExposureCorrelation;
  receiverId: ReceiverId;
  processAttemptId: ProcessAttemptId;
  proof: 'exact-tree-empty';
  observedAtMs: number;
}>;

export type RevokedSecretLease = Readonly<{
  state: 'revoked';
  facts: SecretLeaseFacts;
  revokedAtMs: number;
  reason: SecretLeaseRevocationReason;
}>;

export type ClosureRequiredSecretLease = Readonly<{
  state: 'closure-required';
  facts: SecretLeaseFacts;
  deliveryStartedAtMs: number;
  acknowledgedAtMs: number;
  closureRequiredAtMs: number;
  reason: SecretExposureClosureReason;
}>;

export type ClosedSecretLease = Readonly<{
  state: 'closed';
  facts: SecretLeaseFacts;
  closedAtMs: number;
  cleanupReceipt: SecretExposureCleanupReceipt;
}>;

export type RecoveryRequiredSecretLease = Readonly<{
  state: 'recovery-required';
  facts: SecretLeaseFacts;
  deliveryStartedAtMs: number | null;
  acknowledgedAtMs: number | null;
  recoveryRequiredAtMs: number;
  phase: SecretExposureRecoveryPhase;
  reason: SecretExposureRecoveryReason;
}>;

export type SecretLease =
  | AuthorizedSecretLease
  | DeliveringSecretLease
  | ExposedSecretLease
  | ClosureRequiredSecretLease
  | ClosedSecretLease
  | RevokedSecretLease
  | RecoveryRequiredSecretLease;

export type SecretLeaseEvent =
  | Readonly<{ type: 'begin-delivery'; atMs: number }>
  | Readonly<{ type: 'acknowledge-exposure'; atMs: number }>
  | Readonly<{ type: 'revoke-unexposed'; atMs: number; reason: SecretLeaseRevocationReason }>
  | Readonly<{ type: 'request-closure'; atMs: number; reason: SecretExposureClosureReason }>
  | Readonly<{ type: 'require-recovery'; atMs: number; reason: SecretExposureRecoveryReason }>
  | Readonly<{ type: 'close'; atMs: number; receipt: SecretExposureCleanupReceipt }>;

const reservedEnvironmentNames: readonly string[] = [
  'BUN_OPTIONS',
  'CLASSPATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'JAVA_TOOL_OPTIONS',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYOPT',
  '_JAVA_OPTIONS'
];

const isValidEnvironmentName = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) &&
  !value.toUpperCase().startsWith('NEBULAR_') &&
  !reservedEnvironmentNames.includes(value.toUpperCase());

const hasDuplicates = (values: readonly string[]): boolean =>
  values.some((value, index) => values.indexOf(value) !== index);

const hasValidBindings = (bindings: readonly SecretSlotBinding[]): boolean => {
  const slotIds: readonly CredentialSlotId[] = bindings.map(binding => binding.slotId);
  const environmentNames: readonly string[] = bindings.map(binding => binding.environmentName.toUpperCase());
  return bindings.length > 0 &&
    bindings.every(binding => isValidEnvironmentName(binding.environmentName)) &&
    !hasDuplicates(slotIds) &&
    !hasDuplicates(environmentNames);
};

const sameBinding = (left: SecretSlotBinding, right: SecretSlotBinding): boolean =>
  left.slotId === right.slotId &&
  left.credentialReference.value === right.credentialReference.value &&
  left.environmentName.toUpperCase() === right.environmentName.toUpperCase();

const bindingsAreAuthorized = (
  requested: readonly SecretSlotBinding[],
  granted: readonly SecretSlotBinding[]
): boolean => requested.every(binding => granted.some(grantedBinding => sameBinding(binding, grantedBinding)));

const hasStableAuthority = (grant: SecretDeliveryGrant, request: SecretLeaseRequest): boolean =>
  grant.id === request.grantId &&
  grant.generation === request.grantGeneration &&
  grant.repository === request.repository &&
  grant.recipeRevision === request.recipeRevision;

export const authorizeSecretLease = (
  grant: SecretDeliveryGrant,
  request: SecretLeaseRequest,
  nowMs: number
): SecretLeaseResult<AuthorizedSecretLease> => {
  if (grant.revoked) {
    return secretLeaseErr({ code: 'grant-revoked', message: 'The repository-scoped credential grant is revoked.' });
  }
  if (grant.expiresAtMs <= nowMs) {
    return secretLeaseErr({ code: 'grant-expired', message: 'The repository-scoped credential grant has expired.' });
  }
  if (!hasStableAuthority(grant, request)) {
    return secretLeaseErr({ code: 'lease-invalid', message: 'Secret lease authority facts do not match the grant.' });
  }
  if (!Number.isSafeInteger(request.requestedAtMs) || request.requestedAtMs > nowMs ||
      !Number.isSafeInteger(request.expiresAtMs) || request.expiresAtMs <= nowMs ||
      request.expiresAtMs > grant.expiresAtMs) {
    return secretLeaseErr({ code: 'lease-expired', message: 'The requested secret lease lifetime is invalid.' });
  }
  if (!hasValidBindings(request.bindings)) {
    return secretLeaseErr({ code: 'lease-invalid', message: 'Secret delivery slots are invalid or collide.' });
  }
  if (!bindingsAreAuthorized(request.bindings, grant.bindings)) {
    return secretLeaseErr({ code: 'slot-not-authorized', message: 'A requested secret slot exceeds grant authority.' });
  }
  return secretLeaseOk({
    state: 'authorized',
    facts: {
      id: request.id,
      grantId: request.grantId,
      grantGeneration: request.grantGeneration,
      repository: request.repository,
      recipeRevision: request.recipeRevision,
      receiverId: request.receiverId,
      processAttemptId: request.processAttemptId,
      exposureCorrelation: request.exposureCorrelation,
      bindings: request.bindings,
      authorizedAtMs: nowMs,
      expiresAtMs: request.expiresAtMs,
      exposureMode: request.exposureMode
    }
  });
};

const invalidTransition = (): SecretLeaseResult<SecretLease> => secretLeaseErr({
  code: 'lease-transition-invalid',
  message: 'The secret-exposure transition is not permitted from its current state.'
});

const validEventTime = (lease: SecretLease, atMs: number): boolean =>
  Number.isSafeInteger(atMs) && atMs >= lease.facts.authorizedAtMs;

const cleanupReceiptMatches = (
  lease: ClosureRequiredSecretLease | RecoveryRequiredSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'close' }>
): boolean => event.atMs === event.receipt.observedAtMs && validEventTime(lease, event.atMs) &&
  event.receipt.exposureCorrelation.value === lease.facts.exposureCorrelation.value &&
  event.receipt.receiverId === lease.facts.receiverId &&
  event.receipt.processAttemptId === lease.facts.processAttemptId;

const beginDelivery = (
  lease: AuthorizedSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'begin-delivery' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) && event.atMs < lease.facts.expiresAtMs
  ? secretLeaseOk({ state: 'delivering', facts: lease.facts, deliveryStartedAtMs: event.atMs })
  : secretLeaseErr({ code: 'lease-expired', message: 'Secret delivery cannot begin outside its authority window.' });

const acknowledgeExposure = (
  lease: DeliveringSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'acknowledge-exposure' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) && event.atMs >= lease.deliveryStartedAtMs
  ? secretLeaseOk({
      state: 'exposed',
      facts: lease.facts,
      deliveryStartedAtMs: lease.deliveryStartedAtMs,
      acknowledgedAtMs: event.atMs
    })
  : invalidTransition();

const revokeUnexposed = (
  lease: AuthorizedSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'revoke-unexposed' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) &&
  (event.reason !== 'lease-expired' || event.atMs >= lease.facts.expiresAtMs)
  ? secretLeaseOk({ state: 'revoked', facts: lease.facts, revokedAtMs: event.atMs, reason: event.reason })
  : invalidTransition();

const requireDeliveryRecovery = (
  lease: DeliveringSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'require-recovery' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) && event.atMs >= lease.deliveryStartedAtMs
  ? secretLeaseOk({
      state: 'recovery-required',
      facts: lease.facts,
      deliveryStartedAtMs: lease.deliveryStartedAtMs,
      acknowledgedAtMs: null,
      recoveryRequiredAtMs: event.atMs,
      phase: 'delivery',
      reason: event.reason
    })
  : invalidTransition();

const requireExposureRecovery = (
  lease: ExposedSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'require-recovery' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) && event.atMs >= lease.acknowledgedAtMs
  ? secretLeaseOk({
      state: 'recovery-required',
      facts: lease.facts,
      deliveryStartedAtMs: lease.deliveryStartedAtMs,
      acknowledgedAtMs: lease.acknowledgedAtMs,
      recoveryRequiredAtMs: event.atMs,
      phase: 'exposure',
      reason: event.reason
    })
  : invalidTransition();

const requestExposureClosure = (
  lease: ExposedSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'request-closure' }>
): SecretLeaseResult<SecretLease> => validEventTime(lease, event.atMs) && event.atMs >= lease.acknowledgedAtMs &&
  (event.reason !== 'lease-expired' || event.atMs >= lease.facts.expiresAtMs)
  ? secretLeaseOk({
      state: 'closure-required',
      facts: lease.facts,
      deliveryStartedAtMs: lease.deliveryStartedAtMs,
      acknowledgedAtMs: lease.acknowledgedAtMs,
      closureRequiredAtMs: event.atMs,
      reason: event.reason
    })
  : invalidTransition();

const escalateRecoveryToClosure = (
  lease: RecoveryRequiredSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'request-closure' }>
): SecretLeaseResult<SecretLease> => lease.deliveryStartedAtMs !== null && lease.acknowledgedAtMs !== null &&
  validEventTime(lease, event.atMs) && event.atMs >= lease.recoveryRequiredAtMs
  ? secretLeaseOk({
      state: 'closure-required',
      facts: lease.facts,
      deliveryStartedAtMs: lease.deliveryStartedAtMs,
      acknowledgedAtMs: lease.acknowledgedAtMs,
      closureRequiredAtMs: event.atMs,
      reason: event.reason
    })
  : invalidTransition();

const closeExposure = (
  lease: ClosureRequiredSecretLease | RecoveryRequiredSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'close' }>
): SecretLeaseResult<SecretLease> => cleanupReceiptMatches(lease, event)
  ? secretLeaseOk({
      state: 'closed',
      facts: lease.facts,
      closedAtMs: event.atMs,
      cleanupReceipt: event.receipt
    })
  : secretLeaseErr({
      code: 'lease-transition-invalid',
      message: 'Secret exposure cannot close without an exact matching tree-cleanup receipt.'
    });

export const reduceSecretLease = (
  lease: SecretLease,
  event: SecretLeaseEvent
): SecretLeaseResult<SecretLease> =>
  match<Readonly<{ lease: SecretLease; event: SecretLeaseEvent }>, SecretLeaseResult<SecretLease>>({ lease, event })
    .with({ lease: { state: 'authorized' }, event: { type: 'begin-delivery' } }, ({ lease: target, event: next }) =>
      beginDelivery(target, next))
    .with({ lease: { state: 'authorized' }, event: { type: 'revoke-unexposed' } }, ({ lease: target, event: next }) =>
      revokeUnexposed(target, next))
    .with({ lease: { state: 'delivering' }, event: { type: 'acknowledge-exposure' } },
      ({ lease: target, event: next }) => acknowledgeExposure(target, next))
    .with({ lease: { state: 'delivering' }, event: { type: 'require-recovery' } },
      ({ lease: target, event: next }) => requireDeliveryRecovery(target, next))
    .with({ lease: { state: 'exposed' }, event: { type: 'request-closure' } },
      ({ lease: target, event: next }) => requestExposureClosure(target, next))
    .with({ lease: { state: 'exposed' }, event: { type: 'require-recovery' } },
      ({ lease: target, event: next }) => requireExposureRecovery(target, next))
    .with({ lease: { state: 'recovery-required' }, event: { type: 'request-closure' } },
      ({ lease: target, event: next }) => escalateRecoveryToClosure(target, next))
    .with({ lease: { state: 'closure-required' }, event: { type: 'close' } },
      ({ lease: target, event: next }) => closeExposure(target, next))
    .with({ lease: { state: 'recovery-required' }, event: { type: 'close' } },
      ({ lease: target, event: next }) => closeExposure(target, next))
    .otherwise(invalidTransition);
