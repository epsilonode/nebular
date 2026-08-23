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
  | 'bootstrap-rejected'
  | 'grant-expired'
  | 'grant-revoked'
  | 'lease-expired'
  | 'lease-invalid'
  | 'lease-transition-invalid'
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

const parseReference = <Kind extends CredentialReference['kind'] | SecretLeaseId['kind']>(
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
  bindings: readonly SecretSlotBinding[];
  authorizedAtMs: number;
  expiresAtMs: number;
  exposureMode: 'cooperative-bootstrap';
}>;

export type AuthorizedSecretLease = Readonly<{
  state: 'authorized';
  facts: SecretLeaseFacts;
}>;

export type ActiveSecretLease = Readonly<{
  state: 'active';
  facts: SecretLeaseFacts;
  activatedAtMs: number;
}>;

export type ConsumedSecretLease = Readonly<{
  state: 'consumed';
  facts: SecretLeaseFacts;
  activatedAtMs: number;
  completedAtMs: number;
}>;

export type SecretLeaseRevocationReason =
  | 'bootstrap-rejected'
  | 'grant-revoked'
  | 'lease-expired'
  | 'secret-unavailable';

export type RevokedSecretLease = Readonly<{
  state: 'revoked';
  facts: SecretLeaseFacts;
  revokedAtMs: number;
  reason: SecretLeaseRevocationReason;
}>;

export type SecretLease = AuthorizedSecretLease | ActiveSecretLease | ConsumedSecretLease | RevokedSecretLease;

export type SecretLeaseEvent =
  | Readonly<{ type: 'activate'; atMs: number }>
  | Readonly<{ type: 'complete'; atMs: number }>
  | Readonly<{ type: 'expire'; atMs: number }>
  | Readonly<{ type: 'revoke'; atMs: number; reason: SecretLeaseRevocationReason }>;

const reservedEnvironmentNames: readonly string[] = [
  'BUN_OPTIONS',
  'DYLD_INSERT_LIBRARIES',
  'LD_PRELOAD',
  'NODE_OPTIONS'
];

const isValidEnvironmentName = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) &&
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
      bindings: request.bindings,
      authorizedAtMs: nowMs,
      expiresAtMs: request.expiresAtMs,
      exposureMode: request.exposureMode
    }
  });
};

const revoke = (
  lease: AuthorizedSecretLease | ActiveSecretLease,
  event: Extract<SecretLeaseEvent, { type: 'expire' | 'revoke' }>
): SecretLeaseResult<RevokedSecretLease> =>
  event.type === 'expire' && event.atMs < lease.facts.expiresAtMs
    ? secretLeaseErr({ code: 'lease-transition-invalid', message: 'A secret lease cannot expire before its deadline.' })
    : secretLeaseOk({
        state: 'revoked',
        facts: lease.facts,
        revokedAtMs: event.atMs,
        reason: event.type === 'expire' ? 'lease-expired' : event.reason
      });

type AuthorizedActivationMatch = Readonly<{
  lease: AuthorizedSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'activate' }>;
}>;

type ActiveCompletionMatch = Readonly<{
  lease: ActiveSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'complete' }>;
}>;

type AuthorizedExpirationMatch = Readonly<{
  lease: AuthorizedSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'expire' }>;
}>;

type AuthorizedRevocationMatch = Readonly<{
  lease: AuthorizedSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'revoke' }>;
}>;

type ActiveExpirationMatch = Readonly<{
  lease: ActiveSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'expire' }>;
}>;

type ActiveRevocationMatch = Readonly<{
  lease: ActiveSecretLease;
  event: Extract<SecretLeaseEvent, { type: 'revoke' }>;
}>;

const activateAuthorizedLease = (
  { lease, event }: AuthorizedActivationMatch
): SecretLeaseResult<SecretLease> =>
  event.atMs < lease.facts.authorizedAtMs || event.atMs >= lease.facts.expiresAtMs
    ? secretLeaseErr({ code: 'lease-expired', message: 'The secret lease cannot be activated at this time.' })
    : secretLeaseOk({
        state: 'active',
        facts: lease.facts,
        activatedAtMs: event.atMs
      });

const completeActiveLease = (
  { lease, event }: ActiveCompletionMatch
): SecretLeaseResult<SecretLease> =>
  event.atMs < lease.activatedAtMs || event.atMs >= lease.facts.expiresAtMs
    ? secretLeaseOk({
        state: 'revoked',
        facts: lease.facts,
        revokedAtMs: event.atMs,
        reason: 'lease-expired'
      })
    : secretLeaseOk({
        state: 'consumed',
        facts: lease.facts,
        activatedAtMs: lease.activatedAtMs,
        completedAtMs: event.atMs
      });

const expireAuthorizedLease = ({ lease, event }: AuthorizedExpirationMatch): SecretLeaseResult<SecretLease> =>
  revoke(lease, event);

const revokeAuthorizedLease = ({ lease, event }: AuthorizedRevocationMatch): SecretLeaseResult<SecretLease> =>
  revoke(lease, event);

const expireActiveLease = ({ lease, event }: ActiveExpirationMatch): SecretLeaseResult<SecretLease> =>
  revoke(lease, event);

const revokeActiveLease = ({ lease, event }: ActiveRevocationMatch): SecretLeaseResult<SecretLease> =>
  revoke(lease, event);

export const reduceSecretLease = (
  lease: SecretLease,
  event: SecretLeaseEvent
): SecretLeaseResult<SecretLease> =>
  match<Readonly<{ lease: SecretLease; event: SecretLeaseEvent }>, SecretLeaseResult<SecretLease>>({ lease, event })
    .with(
      { lease: { state: 'authorized' }, event: { type: 'activate' } },
      activateAuthorizedLease
    )
    .with(
      { lease: { state: 'active' }, event: { type: 'complete' } },
      completeActiveLease
    )
    .with(
      { lease: { state: 'authorized' }, event: { type: 'expire' } },
      expireAuthorizedLease
    )
    .with(
      { lease: { state: 'authorized' }, event: { type: 'revoke' } },
      revokeAuthorizedLease
    )
    .with(
      { lease: { state: 'active' }, event: { type: 'expire' } },
      expireActiveLease
    )
    .with(
      { lease: { state: 'active' }, event: { type: 'revoke' } },
      revokeActiveLease
    )
    .otherwise(() => secretLeaseErr({
      code: 'lease-transition-invalid',
      message: 'The secret lease transition is not permitted from its current state.'
    }));
