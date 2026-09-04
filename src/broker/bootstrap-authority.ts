import { createHash } from 'node:crypto';

import { ResultAsync } from 'neverthrow';

import type { BootstrapRequestMessage } from '../broker-client/public.ts';
import type {
  AttemptJournal,
  AttemptJournalRecord,
  BootstrapAttemptJournalRecord,
  BootstrapExchangeJournalId,
  CheckedInRecipeLocator,
  ClaimAuthorizedBootstrapLease,
  GrantJournal,
  GrantJournalRecord,
  JournalMutation,
  JournalOperationId,
  JournalResult,
  JournalTaskResult,
  LeaseJournalId,
  LeaseJournalRecord,
  ProcessIncarnation,
  ReceiverEntryIdentity,
  TransitionLease
} from './journal.ts';
import {
  parseBootstrapExchangeJournalId,
  parseJournalOperationId
} from './journal.ts';
import {
  authorizeSecretLease,
  parseSecretExposureCorrelation,
  parseSecretLeaseId,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  type AuthorizedSecretLease,
  type SecretExposureCleanupReceipt,
  type SecretExposureCorrelation,
  type SecretDeliveryGrant,
  type SecretLeaseId,
  type SecretLeaseResult,
  type SecretLeaseRequest,
  type SecretLeaseTaskResult,
  type SecretSlotBinding
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type ProcessAttemptId,
  type ReceiverId,
  type RecipeRevision
} from './primitives.ts';
import type { BrokerResult } from './result.ts';

export type BootstrapLeaseAuthorityPort = Readonly<{
  /** Independently resolve Git, recipe, grant, receiver, and attempt authority. */
  resolveAuthorizedLease: (
    request: BootstrapRequestMessage
  ) => SecretLeaseTaskResult<AuthorizedSecretLease>;
  /** Persist the same legal transition performed by the in-memory lease reducer. */
  transitionLease: (
    transition: BootstrapLeaseAuthorityTransition
  ) => SecretLeaseTaskResult<void>;
}>;

export type CurrentBootstrapRecipeAuthority = Readonly<{
  state: 'current-checked-in-recipe';
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  relativePath: CheckedInRecipeLocator;
  slots: readonly Readonly<{
    slotId: CredentialSlotId;
    environmentName: string;
  }>[];
}>;

export type VerifiedBootstrapReceiverAttempt = Readonly<{
  state: 'verified-current-attempt';
  processAttemptId: ProcessAttemptId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  grantGeneration: number;
  receiverId: ReceiverId;
  bindingGeneration: number;
  receiverEntryIdentity: ReceiverEntryIdentity;
  helperParentProcessId: number;
  helperParentProcessIncarnation: ProcessIncarnation;
  recipeLocator: CheckedInRecipeLocator;
}>;

/**
 * This port must re-read the checked-in recipe selected by broker-owned
 * attempt metadata. It must not resolve a recipe path supplied by the
 * bootstrap request.
 */
export type BootstrapCurrentRecipePort = Readonly<{
  resolveCurrentRecipe: (
    attempt: VerifiedBootstrapReceiverAttempt
  ) => SecretLeaseTaskResult<CurrentBootstrapRecipeAuthority>;
}>;

/**
 * This port joins the broker's durable attempt binding with the receiver's
 * current process facts. The request's receiver id and grant id are not input
 * authority. Implementations fail unless the helper's parent is the exact
 * live process represented by the journal record.
 */
export type BootstrapCurrentReceiverAttemptPort = Readonly<{
  verifyCurrentAttempt: (
    journaledAttempt: BootstrapAttemptJournalRecord
  ) => SecretLeaseTaskResult<VerifiedBootstrapReceiverAttempt>;
}>;

/** Plain-result task boundary used by strict Git/recipe adapters before the privileged lift. */
export type BootstrapCurrentRecipeTaskPort = Readonly<{
  resolveCurrentRecipe: (
    attempt: VerifiedBootstrapReceiverAttempt
  ) => Promise<BrokerResult<CurrentBootstrapRecipeAuthority>>;
}>;

/** Plain-result task boundary used by strict receiver/OS adapters before the privileged lift. */
export type BootstrapCurrentReceiverAttemptTaskPort = Readonly<{
  verifyCurrentAttempt: (
    journaledAttempt: BootstrapAttemptJournalRecord
  ) => Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>>;
}>;

export type BootstrapAuthorityClock = Readonly<{
  nowMs: () => number;
}>;

/**
 * `claimAuthorized` is deliberately stronger than the generic journal
 * `create`: it atomically rejects a second nonterminal bootstrap lease for the
 * same grant generation and process attempt.
 */
export type BootstrapLeaseClaimJournal = Readonly<{
  claimAuthorized: (
    command: ClaimAuthorizedBootstrapLease
  ) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  transition: (
    command: TransitionLease
  ) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
}>;

export type DurableBootstrapLeaseAuthorityPorts = Readonly<{
  attempts: Pick<AttemptJournal, 'read'>;
  clock: BootstrapAuthorityClock;
  grants: Pick<GrantJournal, 'readGrant'>;
  leaseLifetimeMs: number;
  leases: BootstrapLeaseClaimJournal;
  recipes: BootstrapCurrentRecipePort;
  receiverAttempts: BootstrapCurrentReceiverAttemptPort;
}>;

type BootstrapLeaseTransitionIdentity = Readonly<{
  leaseId: SecretLeaseId;
  exposureCorrelation: SecretExposureCorrelation;
  atMs: number;
}>;

export type BootstrapLeaseAuthorityTransition = BootstrapLeaseTransitionIdentity & (
  | Readonly<{
      expectedState: 'authorized';
      nextState: 'delivering' | 'revoked' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'delivering';
      nextState: 'exposed' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'exposed';
      nextState: 'closure-required' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'closure-required';
      nextState: 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'recovery-required';
      nextState: 'closure-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'closure-required' | 'recovery-required';
      nextState: 'closed';
      cleanupReceipt: SecretExposureCleanupReceipt;
    }>
);

export type DurableBootstrapLeaseAuthorityPort = BootstrapLeaseAuthorityPort;

type BootstrapRequestAuthorityFacts = Readonly<{
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  processAttemptId: ProcessAttemptId;
}>;

type ResolvedBootstrapAuthority = Readonly<{
  attempt: ClaimableBootstrapAttemptJournalRecord;
  grant: GrantJournalRecord;
  recipe: CurrentBootstrapRecipeAuthority;
  receiverAttempt: VerifiedBootstrapReceiverAttempt;
  request: BootstrapRequestMessage;
}>;

type ClaimableBootstrapAttemptJournalRecord = BootstrapAttemptJournalRecord & Readonly<{
  state: 'materializing' | 'running';
}>;

export const BOOTSTRAP_AUTHORITY_MAX_LEASE_LIFETIME_MS = 60_000;

const durableAuthorityFailure = <Value>(
  code: 'attempt-not-ready' | 'bootstrap-rejected' | 'grant-expired' | 'grant-revoked' | 'lease-invalid' | 'slot-not-authorized',
  message: string
): SecretLeaseResult<Value> => secretLeaseErr({ code, message });

const fromJournal = <Value>(task: JournalTaskResult<Value>): SecretLeaseTaskResult<Value> => {
  const operation = Promise.resolve(task).then(
    result => result.type === 'ok'
      ? secretLeaseOk(result.value)
      : durableAuthorityFailure<Value>('bootstrap-rejected', 'Durable bootstrap authority is unavailable.'),
    () => durableAuthorityFailure<Value>('bootstrap-rejected', 'Durable bootstrap authority is unavailable.')
  );
  return ResultAsync.fromSafePromise(operation).andThen(result => result);
};

const adapterUnavailable = <Value>(): SecretLeaseResult<Value> => durableAuthorityFailure(
  'bootstrap-rejected',
  'A privileged bootstrap authority adapter is unavailable.'
);

const liftSecretLeaseTask = <Value>(
  effect: () => Promise<SecretLeaseResult<Value>>
): SecretLeaseTaskResult<Value> => ResultAsync.fromSafePromise(
  Promise.resolve().then(effect).then(
    result => result,
    adapterUnavailable<Value>
  )
).andThen(result => result);

const projectRecipeAdapterResult = <Value>(result: BrokerResult<Value>): SecretLeaseResult<Value> => {
  if (result.isOk()) return secretLeaseOk(result.value);
  return result.error[0].code === 'recipe-drift'
    ? secretLeaseErr({
        code: 'recipe-drift',
        message: 'The current checked-in recipe no longer matches durable authority.'
      })
    : adapterUnavailable();
};

export const liftBootstrapCurrentRecipeTaskPort = (
  port: BootstrapCurrentRecipeTaskPort
): BootstrapCurrentRecipePort => ({
  resolveCurrentRecipe: attempt => liftSecretLeaseTask<CurrentBootstrapRecipeAuthority>(
    () => Promise.resolve().then(() => port.resolveCurrentRecipe(attempt)).then(
      result => projectRecipeAdapterResult<CurrentBootstrapRecipeAuthority>(result),
      () => adapterUnavailable<CurrentBootstrapRecipeAuthority>()
    )
  )
});

export const liftBootstrapCurrentReceiverAttemptTaskPort = (
  port: BootstrapCurrentReceiverAttemptTaskPort
): BootstrapCurrentReceiverAttemptPort => ({
  verifyCurrentAttempt: attempt => liftSecretLeaseTask(
    () => port.verifyCurrentAttempt(attempt)
  )
});

const fromBrokerFact = <Value>(result: BrokerResult<Value>): SecretLeaseResult<Value> => result.isOk()
  ? secretLeaseOk(result.value)
  : durableAuthorityFailure('lease-invalid', 'Bootstrap authority references are invalid.');

const fromJournalFact = <Value>(result: JournalResult<Value>): SecretLeaseResult<Value> => result.type === 'ok'
  ? secretLeaseOk(result.value)
  : durableAuthorityFailure('lease-invalid', 'Bootstrap authority references are invalid.');

const requestAuthorityFacts = (
  request: BootstrapRequestMessage
): SecretLeaseResult<BootstrapRequestAuthorityFacts> => fromBrokerFact(parseCanonicalRepository(
  request.payload.authority.repository.value
)).andThen(repository => fromBrokerFact(parseRecipeRevision(request.payload.authority.recipeRevision.value))
  .andThen(recipeRevision => fromBrokerFact(parseGrantId(request.payload.authority.grantId.value))
    .andThen(grantId => fromBrokerFact(parseProcessAttemptId(request.payload.attempt.processAttemptId.value))
      .map(processAttemptId => ({ repository, recipeRevision, grantId, processAttemptId }))
    )
  )
);

const exactTextSet = (left: readonly string[], right: readonly string[]): boolean => {
  const leftSorted = [...new Set(left)].toSorted();
  const rightSorted = [...new Set(right)].toSorted();
  return leftSorted.length === rightSorted.length &&
    leftSorted.every((value, index) => value === rightSorted[index]);
};

const exactRecipeSlots = (
  request: BootstrapRequestMessage,
  recipe: CurrentBootstrapRecipeAuthority
): boolean => request.payload.slots.length === recipe.slots.length &&
  request.payload.slots.every(requested => recipe.slots.some(authoritative =>
    requested.slotId.value === authoritative.slotId &&
    requested.environmentName.toUpperCase() === authoritative.environmentName.toUpperCase()
  ));

const isBootstrappableAttempt = (
  attempt: AttemptJournalRecord
): attempt is ClaimableBootstrapAttemptJournalRecord => attempt.bootstrapBinding !== null &&
  (attempt.state === 'materializing' || attempt.state === 'running') && attempt.receiverCorrelation !== null;

const isPendingBootstrapBinding = (attempt: AttemptJournalRecord): boolean =>
  attempt.bootstrapBinding === null && attempt.state === 'materializing' && attempt.receiverCorrelation !== null;

const verifyBootstrappingReceiverAttempt = (
  attempt: ClaimableBootstrapAttemptJournalRecord,
  port: BootstrapCurrentReceiverAttemptPort
): SecretLeaseTaskResult<VerifiedBootstrapReceiverAttempt> => port.verifyCurrentAttempt(attempt).orElse(
  issues => attempt.state === 'materializing'
    ? durableAuthorityFailure<VerifiedBootstrapReceiverAttempt>(
        'attempt-not-ready',
        'The managed process attempt is waiting for current receiver verification.'
      )
    : secretLeaseErr(issues[0], ...issues.slice(1))
);

const exactResolvedAuthority = (
  resolved: ResolvedBootstrapAuthority,
  nowMs: number
): SecretLeaseResult<ResolvedBootstrapAuthority> => {
  const { attempt, grant, recipe, receiverAttempt, request } = resolved;
  const stableIdentity = request.payload.authority.repository.value === grant.repository &&
    request.payload.authority.recipeRevision.value === grant.recipeRevision &&
    request.payload.authority.grantId.value === grant.id &&
    request.payload.authority.grantGeneration === grant.generation &&
    attempt.repository === grant.repository && attempt.recipeRevision === grant.recipeRevision &&
    attempt.bootstrapBinding.grantId === grant.id &&
    attempt.bootstrapBinding.grantGeneration === grant.generation &&
    receiverAttempt.processAttemptId === attempt.id && receiverAttempt.repository === attempt.repository &&
    receiverAttempt.recipeRevision === attempt.recipeRevision && receiverAttempt.grantId === grant.id &&
    receiverAttempt.grantGeneration === grant.generation &&
    receiverAttempt.receiverId === attempt.bootstrapBinding.receiverId &&
    receiverAttempt.bindingGeneration === attempt.bootstrapBinding.bindingGeneration &&
    receiverAttempt.receiverEntryIdentity.value === attempt.bootstrapBinding.receiverEntryIdentity.value &&
    receiverAttempt.helperParentProcessId === attempt.bootstrapBinding.helperParentProcessId &&
    receiverAttempt.helperParentProcessIncarnation.value ===
      attempt.bootstrapBinding.helperParentProcessIncarnation.value &&
    receiverAttempt.recipeLocator.value === attempt.bootstrapBinding.recipeLocator.value &&
    request.payload.attempt.processAttemptId.value === receiverAttempt.processAttemptId &&
    request.payload.attempt.receiverId.value === receiverAttempt.receiverId &&
    recipe.repository === attempt.repository && recipe.recipeRevision === attempt.recipeRevision &&
    recipe.relativePath.value === attempt.bootstrapBinding.recipeLocator.value;
  if (!stableIdentity) {
    return durableAuthorityFailure('lease-invalid', 'Current recipe, grant, receiver, or attempt authority does not match.');
  }
  if (grant.state === 'revoked') {
    return durableAuthorityFailure('grant-revoked', 'The repository-scoped credential grant is revoked.');
  }
  if (grant.expiresAtMs <= nowMs) {
    return durableAuthorityFailure('grant-expired', 'The repository-scoped credential grant has expired.');
  }
  const recipeSlotIds: readonly string[] = recipe.slots.map(slot => slot.slotId);
  const bindingSlotIds: readonly string[] = grant.credentialBindings.map(binding => binding.slotId);
  const exactGrantBindings = grant.credentialBindings.length === recipeSlotIds.length &&
    new Set(bindingSlotIds).size === grant.credentialBindings.length &&
    grant.credentialBindings.every(binding => binding.credentialReference.value.length > 0 &&
      binding.credentialReference.value.length <= 256 &&
      !binding.credentialReference.value.includes('\0')) && exactTextSet(bindingSlotIds, recipeSlotIds);
  return exactGrantBindings && exactRecipeSlots(request, recipe)
    ? secretLeaseOk(resolved)
    : durableAuthorityFailure('slot-not-authorized', 'Requested bootstrap slots differ from current recipe authority.');
};

const resolveDurableAuthority = (
  request: BootstrapRequestMessage,
  nowMs: number,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<ResolvedBootstrapAuthority> => {
  const facts = requestAuthorityFacts(request);
  if (facts.isErr()) return secretLeaseTaskErr(facts.error[0], ...facts.error.slice(1));
  return fromJournal<GrantJournalRecord | null>(ports.grants.readGrant(facts.value.grantId)).andThen(grant => grant === null
    ? durableAuthorityFailure<ResolvedBootstrapAuthority>('lease-invalid', 'The requested grant does not exist.')
    : fromJournal<AttemptJournalRecord | null>(ports.attempts.read(facts.value.processAttemptId)).andThen(attempt => attempt === null
      ? durableAuthorityFailure<ResolvedBootstrapAuthority>('lease-invalid', 'The requested process attempt does not exist.')
      : isBootstrappableAttempt(attempt)
        ? verifyBootstrappingReceiverAttempt(attempt, ports.receiverAttempts).andThen(receiverAttempt =>
          ports.recipes.resolveCurrentRecipe(receiverAttempt).andThen(recipe => exactResolvedAuthority({
            attempt,
            grant,
            recipe,
            receiverAttempt,
            request
          }, nowMs))
        )
        : isPendingBootstrapBinding(attempt)
          ? durableAuthorityFailure<ResolvedBootstrapAuthority>(
              'attempt-not-ready',
              'The managed process attempt is waiting for its current receiver binding.'
            )
          : durableAuthorityFailure<ResolvedBootstrapAuthority>(
              'lease-invalid',
              'The requested process attempt has no current bootstrap binding.'
            )
    )
  );
};

const leaseBindings = (resolved: ResolvedBootstrapAuthority): SecretLeaseResult<readonly SecretSlotBinding[]> => {
  const bindings: readonly SecretSlotBinding[] = resolved.recipe.slots.flatMap(slot => {
    const matching = resolved.grant.credentialBindings.filter(binding => binding.slotId === slot.slotId);
    return matching.length === 1 && matching[0] !== undefined
      ? [{
          slotId: slot.slotId,
          environmentName: slot.environmentName,
          credentialReference: matching[0].credentialReference
        }]
      : [];
  });
  return bindings.length === resolved.recipe.slots.length
    ? secretLeaseOk(bindings)
    : durableAuthorityFailure(
        'slot-not-authorized',
        'A bootstrap recipe slot has no exact persisted credential binding.'
      );
};

const deliveryGrant = (
  resolved: ResolvedBootstrapAuthority,
  bindings: readonly SecretSlotBinding[]
): SecretDeliveryGrant => ({
  id: resolved.grant.id,
  generation: resolved.grant.generation,
  repository: resolved.grant.repository,
  recipeRevision: resolved.grant.recipeRevision,
  bindings,
  expiresAtMs: resolved.grant.expiresAtMs,
  revoked: resolved.grant.state === 'revoked',
  exposureMode: 'cooperative-bootstrap'
});

const leaseRequest = (
  resolved: ResolvedBootstrapAuthority,
  bindings: readonly SecretSlotBinding[],
  id: SecretLeaseId,
  exposureCorrelation: SecretExposureCorrelation,
  nowMs: number,
  leaseLifetimeMs: number
): SecretLeaseRequest => ({
  id,
  grantId: resolved.grant.id,
  grantGeneration: resolved.grant.generation,
  repository: resolved.grant.repository,
  recipeRevision: resolved.grant.recipeRevision,
  receiverId: resolved.receiverAttempt.receiverId,
  processAttemptId: resolved.receiverAttempt.processAttemptId,
  exposureCorrelation,
  bindings,
  requestedAtMs: nowMs,
  expiresAtMs: Math.min(resolved.grant.expiresAtMs, nowMs + leaseLifetimeMs),
  exposureMode: 'cooperative-bootstrap'
});

const toLeaseJournalId = (id: SecretLeaseId): LeaseJournalId => ({
  kind: 'lease-id',
  value: id.value
});

const createLeaseCommand = (
  resolved: ResolvedBootstrapAuthority,
  lease: AuthorizedSecretLease,
  operationId: JournalOperationId,
  exchangeId: BootstrapExchangeJournalId
): ClaimAuthorizedBootstrapLease => ({
  operationId,
  exchangeId,
  expectedAttempt: {
    id: resolved.attempt.id,
    state: resolved.attempt.state,
    stateVersion: resolved.attempt.stateVersion,
    binding: resolved.attempt.bootstrapBinding
  },
  lease: {
    id: toLeaseJournalId(lease.facts.id),
    operationId,
    grantId: lease.facts.grantId,
    grantGeneration: lease.facts.grantGeneration,
    processAttemptId: lease.facts.processAttemptId,
    receiverId: lease.facts.receiverId,
    exposureCorrelation: lease.facts.exposureCorrelation,
    issuedAtMs: lease.facts.authorizedAtMs,
    expiresAtMs: lease.facts.expiresAtMs,
    updatedAtMs: lease.facts.authorizedAtMs,
    cleanupReceipt: null,
    state: 'authorized'
  }
});

type BootstrapClaimIdentity = Readonly<{
  exchangeId: BootstrapExchangeJournalId;
  leaseId: SecretLeaseId;
  exposureCorrelation: SecretExposureCorrelation;
  operationId: JournalOperationId;
}>;

const stableIdentityDigest = (parts: readonly string[]): string => createHash('sha256')
  .update(JSON.stringify(parts))
  .digest('hex');

const stableBootstrapClaimIdentity = (
  resolved: ResolvedBootstrapAuthority
): SecretLeaseResult<BootstrapClaimIdentity> => {
  const exchangeId = fromJournalFact(parseBootstrapExchangeJournalId(resolved.request.exchangeId.value));
  if (exchangeId.isErr()) return secretLeaseErr(exchangeId.error[0], ...exchangeId.error.slice(1));
  const identityFacts = [
    resolved.request.protocolVersion,
    exchangeId.value.value,
    resolved.attempt.id,
    'claim-authorized-bootstrap-lease'
  ];
  const digest = stableIdentityDigest(identityFacts);
  const leaseId = parseSecretLeaseId(`bootstrap-lease-v1-${digest}`);
  const exposureCorrelation = parseSecretExposureCorrelation(`bootstrap-exposure-v1-${digest}`);
  const operationId = fromJournalFact(parseJournalOperationId(`bootstrap-operation-v1-${digest}`));
  return leaseId.isErr()
    ? secretLeaseErr(leaseId.error[0], ...leaseId.error.slice(1))
    : exposureCorrelation.isErr()
      ? secretLeaseErr(exposureCorrelation.error[0], ...exposureCorrelation.error.slice(1))
    : operationId.isErr()
      ? secretLeaseErr(operationId.error[0], ...operationId.error.slice(1))
      : secretLeaseOk({
          exchangeId: exchangeId.value,
          leaseId: leaseId.value,
          exposureCorrelation: exposureCorrelation.value,
          operationId: operationId.value
        });
};

const recoveredAuthorizedLease = (
  resolved: ResolvedBootstrapAuthority,
  record: LeaseJournalRecord,
  expectedExposureCorrelation: SecretExposureCorrelation,
  currentTimeMs: number
): SecretLeaseResult<AuthorizedSecretLease> => {
  const bindings = leaseBindings(resolved);
  if (bindings.isErr()) return secretLeaseErr(bindings.error[0], ...bindings.error.slice(1));
  const identityMatches = record.state === 'authorized' && record.cleanupReceipt === null &&
    record.grantId === resolved.grant.id && record.grantGeneration === resolved.grant.generation &&
    record.processAttemptId === resolved.attempt.id && record.receiverId === resolved.receiverAttempt.receiverId &&
    record.exposureCorrelation.value === expectedExposureCorrelation.value &&
    record.updatedAtMs === record.issuedAtMs && record.issuedAtMs <= currentTimeMs &&
    record.expiresAtMs > currentTimeMs;
  return identityMatches
    ? authorizeSecretLease(
        deliveryGrant(resolved, bindings.value),
        leaseRequest(
          resolved,
          bindings.value,
          { kind: 'secret-lease-id', value: record.id.value },
          record.exposureCorrelation,
          record.issuedAtMs,
          record.expiresAtMs - record.issuedAtMs
        ),
        record.issuedAtMs
      )
    : durableAuthorityFailure('bootstrap-rejected', 'Durable lease claim returned inconsistent authority.');
};

const claimLease = (
  resolved: ResolvedBootstrapAuthority,
  nowMs: number,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<AuthorizedSecretLease> => {
  const identity = stableBootstrapClaimIdentity(resolved);
  if (identity.isErr()) return secretLeaseTaskErr(identity.error[0], ...identity.error.slice(1));
  const bindings = leaseBindings(resolved);
  if (bindings.isErr()) return secretLeaseTaskErr(bindings.error[0], ...bindings.error.slice(1));
  const authorization = authorizeSecretLease(
    deliveryGrant(resolved, bindings.value),
    leaseRequest(
      resolved,
      bindings.value,
      identity.value.leaseId,
      identity.value.exposureCorrelation,
      nowMs,
      ports.leaseLifetimeMs
    ),
    nowMs
  );
  return authorization.isErr()
    ? secretLeaseTaskErr<AuthorizedSecretLease>(authorization.error[0], ...authorization.error.slice(1))
    : fromJournal<JournalMutation<LeaseJournalRecord>>(ports.leases.claimAuthorized(createLeaseCommand(
      resolved,
      authorization.value,
      identity.value.operationId,
      identity.value.exchangeId
    ))).andThen(mutation => recoveredAuthorizedLease(
      resolved,
      mutation.record,
      identity.value.exposureCorrelation,
      nowMs
    ));
};

const validLeaseLifetime = (leaseLifetimeMs: number): boolean =>
  Number.isSafeInteger(leaseLifetimeMs) && leaseLifetimeMs > 0 &&
  leaseLifetimeMs <= BOOTSTRAP_AUTHORITY_MAX_LEASE_LIFETIME_MS;

const resolveAuthorizedLease = (
  request: BootstrapRequestMessage,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<AuthorizedSecretLease> => {
  const nowMs = ports.clock.nowMs();
  return Number.isSafeInteger(nowMs) && nowMs >= 0 && validLeaseLifetime(ports.leaseLifetimeMs)
    ? resolveDurableAuthority(request, nowMs, ports).andThen(resolved => claimLease(resolved, nowMs, ports))
    : secretLeaseTaskErr({ code: 'bootstrap-rejected', message: 'Bootstrap authority timing is invalid.' });
};

const transitionOperationId = (
  transition: BootstrapLeaseAuthorityTransition
): SecretLeaseResult<JournalOperationId> => fromJournalFact(parseJournalOperationId(
  `bootstrap-operation-v1-${stableIdentityDigest([
    transition.leaseId.value,
    transition.exposureCorrelation.value,
    transition.expectedState,
    transition.nextState,
    transition.cleanupReceipt?.id.value ?? 'no-cleanup-receipt',
    'transition-bootstrap-lease'
  ])}`
));

const sameTransitionedLease = (
  transition: BootstrapLeaseAuthorityTransition,
  record: LeaseJournalRecord
): boolean => record.id.value === transition.leaseId.value && record.state === transition.nextState &&
  record.exposureCorrelation.value === transition.exposureCorrelation.value &&
  record.updatedAtMs === transition.atMs &&
  (transition.nextState === 'closed'
    ? record.cleanupReceipt?.id.value === transition.cleanupReceipt.id.value
    : record.cleanupReceipt === null);

const transitionDurableLease = (
  transition: BootstrapLeaseAuthorityTransition,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<void> => {
  const operationId = transitionOperationId(transition);
  if (operationId.isErr()) return secretLeaseTaskErr(operationId.error[0], ...operationId.error.slice(1));
  const journalTransition: TransitionLease = {
    ...transition,
    operationId: operationId.value,
    leaseId: toLeaseJournalId(transition.leaseId)
  };
  return fromJournal<JournalMutation<LeaseJournalRecord>>(ports.leases.transition(journalTransition)).andThen(mutation =>
      sameTransitionedLease(transition, mutation.record)
        ? secretLeaseOk(undefined)
        : durableAuthorityFailure<void>(
            'bootstrap-rejected',
            'Durable lease transition returned inconsistent state.'
          ));
};

export const createDurableBootstrapLeaseAuthorityPort = (
  ports: DurableBootstrapLeaseAuthorityPorts
): DurableBootstrapLeaseAuthorityPort => ({
  resolveAuthorizedLease: request => resolveAuthorizedLease(request, ports),
  transitionLease: transition => transitionDurableLease(transition, ports)
});

const bindingMatches = (
  requested: BootstrapRequestMessage['payload']['slots'][number],
  authorized: SecretSlotBinding
): boolean => requested.slotId.value === authorized.slotId &&
  requested.environmentName.toUpperCase() === authorized.environmentName.toUpperCase();

const exactBindings = (
  request: BootstrapRequestMessage,
  lease: AuthorizedSecretLease
): boolean => request.payload.slots.length === lease.facts.bindings.length &&
  request.payload.slots.every(slot => lease.facts.bindings.some(binding => bindingMatches(slot, binding)));

export const validateBootstrapLeaseAuthority = (
  request: BootstrapRequestMessage,
  lease: AuthorizedSecretLease
): SecretLeaseResult<AuthorizedSecretLease> => {
  const authorityMatches = request.payload.authority.repository.value === lease.facts.repository &&
    request.payload.authority.recipeRevision.value === lease.facts.recipeRevision &&
    request.payload.authority.grantId.value === lease.facts.grantId &&
    request.payload.authority.grantGeneration === lease.facts.grantGeneration;
  const attemptMatches = request.payload.attempt.receiverId.value === lease.facts.receiverId &&
    request.payload.attempt.processAttemptId.value === lease.facts.processAttemptId;
  return authorityMatches && attemptMatches && exactBindings(request, lease)
    ? secretLeaseOk(lease)
    : secretLeaseErr({
        code: 'lease-invalid',
        message: 'Resolved bootstrap lease does not match the independently validated request authority.'
      });
};
