import { ResultAsync } from 'neverthrow';

import type { BootstrapRequestMessage } from '../broker-client/public.ts';
import type {
  AttemptJournal,
  AttemptJournalRecord,
  CreateLease,
  GrantJournal,
  GrantJournalRecord,
  JournalMutation,
  JournalOperationId,
  JournalTaskResult,
  LeaseJournalId,
  LeaseJournalRecord,
  TransitionLease
} from './journal.ts';
import {
  authorizeSecretLease,
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  type AuthorizedSecretLease,
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
  relativePath: string;
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
    journaledAttempt: AttemptJournalRecord
  ) => SecretLeaseTaskResult<VerifiedBootstrapReceiverAttempt>;
}>;

export type BootstrapAuthorityClock = Readonly<{
  nowMs: () => number;
}>;

export type BootstrapAuthorityEntropyPort = Readonly<{
  nextLeaseId: () => SecretLeaseTaskResult<SecretLeaseId>;
  nextOperationId: (
    purpose: 'claim-bootstrap-lease' | 'activate-bootstrap-lease' | 'consume-bootstrap-lease' | 'revoke-bootstrap-lease'
  ) => SecretLeaseTaskResult<JournalOperationId>;
}>;

/**
 * `claimAuthorized` is deliberately stronger than the generic journal
 * `create`: it atomically rejects a second nonterminal bootstrap lease for the
 * same grant generation and process attempt.
 */
export type BootstrapLeaseClaimJournal = Readonly<{
  claimAuthorized: (
    command: CreateLease
  ) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  transition: (
    command: TransitionLease
  ) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
}>;

export type DurableBootstrapLeaseAuthorityPorts = Readonly<{
  attempts: Pick<AttemptJournal, 'read'>;
  clock: BootstrapAuthorityClock;
  entropy: BootstrapAuthorityEntropyPort;
  grants: Pick<GrantJournal, 'readGrant'>;
  leaseLifetimeMs: number;
  leases: BootstrapLeaseClaimJournal;
  recipes: BootstrapCurrentRecipePort;
  receiverAttempts: BootstrapCurrentReceiverAttemptPort;
}>;

type BootstrapLeaseTransitionIdentity = Readonly<{
  leaseId: SecretLeaseId;
  atMs: number;
}>;

export type BootstrapLeaseAuthorityTransition = BootstrapLeaseTransitionIdentity & (
  | Readonly<{ expectedState: 'authorized'; nextState: 'active' | 'revoked' }>
  | Readonly<{ expectedState: 'active'; nextState: 'consumed' | 'revoked' }>
);

export type DurableBootstrapLeaseAuthorityPort = BootstrapLeaseAuthorityPort;

type BootstrapRequestAuthorityFacts = Readonly<{
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  processAttemptId: ProcessAttemptId;
}>;

type ResolvedBootstrapAuthority = Readonly<{
  attempt: AttemptJournalRecord;
  grant: GrantJournalRecord;
  recipe: CurrentBootstrapRecipeAuthority;
  receiverAttempt: VerifiedBootstrapReceiverAttempt;
  request: BootstrapRequestMessage;
}>;

const durableAuthorityFailure = <Value>(
  code: 'bootstrap-rejected' | 'grant-expired' | 'grant-revoked' | 'lease-invalid' | 'slot-not-authorized',
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

const fromBrokerFact = <Value>(result: BrokerResult<Value>): SecretLeaseResult<Value> => result.isOk()
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

const isBootstrappableAttempt = (attempt: AttemptJournalRecord): boolean =>
  (attempt.state === 'materializing' || attempt.state === 'running') && attempt.receiverCorrelation !== null;

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
    receiverAttempt.processAttemptId === attempt.id && receiverAttempt.repository === attempt.repository &&
    receiverAttempt.recipeRevision === attempt.recipeRevision && receiverAttempt.grantId === grant.id &&
    receiverAttempt.grantGeneration === grant.generation &&
    request.payload.attempt.processAttemptId.value === receiverAttempt.processAttemptId &&
    request.payload.attempt.receiverId.value === receiverAttempt.receiverId &&
    recipe.repository === attempt.repository && recipe.recipeRevision === attempt.recipeRevision;
  if (!stableIdentity || !isBootstrappableAttempt(attempt)) {
    return durableAuthorityFailure('lease-invalid', 'Current recipe, grant, receiver, or attempt authority does not match.');
  }
  if (grant.state === 'revoked') {
    return durableAuthorityFailure('grant-revoked', 'The repository-scoped credential grant is revoked.');
  }
  if (grant.expiresAtMs <= nowMs) {
    return durableAuthorityFailure('grant-expired', 'The repository-scoped credential grant has expired.');
  }
  const recipeSlotIds: readonly string[] = recipe.slots.map(slot => slot.slotId);
  return exactTextSet(grant.credentialSlotIds, recipeSlotIds) && exactRecipeSlots(request, recipe)
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
      : ports.receiverAttempts.verifyCurrentAttempt(attempt).andThen(receiverAttempt =>
        ports.recipes.resolveCurrentRecipe(receiverAttempt).andThen(recipe => exactResolvedAuthority({
          attempt,
          grant,
          recipe,
          receiverAttempt,
          request
        }, nowMs))
      )
    )
  );
};

const leaseBindings = (resolved: ResolvedBootstrapAuthority): readonly SecretSlotBinding[] =>
  resolved.recipe.slots.map(slot => ({
    slotId: slot.slotId,
    environmentName: slot.environmentName,
    credentialReference: resolved.grant.credentialReference
  }));

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
  lease: AuthorizedSecretLease,
  operationId: JournalOperationId
): CreateLease => ({
  operationId,
  lease: {
    id: toLeaseJournalId(lease.facts.id),
    operationId,
    grantId: lease.facts.grantId,
    grantGeneration: lease.facts.grantGeneration,
    processAttemptId: lease.facts.processAttemptId,
    issuedAtMs: lease.facts.authorizedAtMs,
    expiresAtMs: lease.facts.expiresAtMs,
    terminatedAtMs: null,
    state: 'authorized'
  }
});

const sameClaimedLease = (lease: AuthorizedSecretLease, record: LeaseJournalRecord): boolean =>
  record.id.value === lease.facts.id.value && record.grantId === lease.facts.grantId &&
  record.grantGeneration === lease.facts.grantGeneration &&
  record.processAttemptId === lease.facts.processAttemptId && record.issuedAtMs === lease.facts.authorizedAtMs &&
  record.expiresAtMs === lease.facts.expiresAtMs && record.state === 'authorized';

const claimLease = (
  resolved: ResolvedBootstrapAuthority,
  nowMs: number,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<AuthorizedSecretLease> => ports.entropy.nextLeaseId().andThen(id => {
  const bindings = leaseBindings(resolved);
  const authorization = authorizeSecretLease(
    deliveryGrant(resolved, bindings),
    leaseRequest(resolved, bindings, id, nowMs, ports.leaseLifetimeMs),
    nowMs
  );
  return authorization.isErr()
    ? secretLeaseTaskErr<AuthorizedSecretLease>(authorization.error[0], ...authorization.error.slice(1))
    : ports.entropy.nextOperationId('claim-bootstrap-lease').andThen(operationId =>
      fromJournal<JournalMutation<LeaseJournalRecord>>(
        ports.leases.claimAuthorized(createLeaseCommand(authorization.value, operationId))
      )
        .andThen(mutation => sameClaimedLease(authorization.value, mutation.record)
          ? secretLeaseOk<AuthorizedSecretLease>(authorization.value)
          : durableAuthorityFailure<AuthorizedSecretLease>(
              'bootstrap-rejected',
              'Durable lease claim returned inconsistent authority.'
            ))
    );
});

const validLeaseLifetime = (leaseLifetimeMs: number): boolean =>
  Number.isSafeInteger(leaseLifetimeMs) && leaseLifetimeMs > 0 && leaseLifetimeMs <= 60_000;

const resolveAuthorizedLease = (
  request: BootstrapRequestMessage,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<AuthorizedSecretLease> => {
  const nowMs = ports.clock.nowMs();
  return Number.isSafeInteger(nowMs) && nowMs >= 0 && validLeaseLifetime(ports.leaseLifetimeMs)
    ? resolveDurableAuthority(request, nowMs, ports).andThen(resolved => claimLease(resolved, nowMs, ports))
    : secretLeaseTaskErr({ code: 'bootstrap-rejected', message: 'Bootstrap authority timing is invalid.' });
};

const transitionPurpose = (
  nextState: BootstrapLeaseAuthorityTransition['nextState']
): Parameters<BootstrapAuthorityEntropyPort['nextOperationId']>[0] => nextState === 'active'
  ? 'activate-bootstrap-lease'
  : nextState === 'consumed'
    ? 'consume-bootstrap-lease'
    : 'revoke-bootstrap-lease';

const sameTransitionedLease = (
  transition: BootstrapLeaseAuthorityTransition,
  record: LeaseJournalRecord
): boolean => record.id.value === transition.leaseId.value && record.state === transition.nextState &&
  record.terminatedAtMs === (transition.nextState === 'active' ? null : transition.atMs);

const transitionDurableLease = (
  transition: BootstrapLeaseAuthorityTransition,
  ports: DurableBootstrapLeaseAuthorityPorts
): SecretLeaseTaskResult<void> => ports.entropy.nextOperationId(
  transitionPurpose(transition.nextState)
).andThen(operationId => fromJournal<JournalMutation<LeaseJournalRecord>>(ports.leases.transition({
  operationId,
  leaseId: toLeaseJournalId(transition.leaseId),
  expectedState: transition.expectedState,
  nextState: transition.nextState,
  atMs: transition.atMs
})).andThen(mutation =>
  sameTransitionedLease(transition, mutation.record)
    ? secretLeaseOk(undefined)
    : durableAuthorityFailure<void>(
        'bootstrap-rejected',
        'Durable lease transition returned inconsistent state.'
      )));

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
