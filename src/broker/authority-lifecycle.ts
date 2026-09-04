import type { CredentialReference } from './lease.ts';
import type {
  CommitGrantWithConsent,
  ConsentEvidenceRecord,
  ConsentId,
  GrantCredentialBinding,
  GrantCredentialBindingSet,
  JournalIssues,
  JournalOperationId,
  RedactedAuthorityDigest
} from './journal.ts';
import type {
  CanonicalRepository,
  CredentialSlotId,
  GrantId,
  RecipeRevision
} from './primitives.ts';

const authorityTokenSeal = Symbol('nebular-authority-token');
const authorityRequestSeal = Symbol('nebular-authority-request');
const authorityGrantSeal = Symbol('nebular-authority-grant');

type AuthorityToken<Kind extends string, Value> = Readonly<{
  kind: Kind;
  value: Value;
  [authorityTokenSeal]: Kind;
}>;

type SealedAuthorityRequest = Readonly<{ [authorityRequestSeal]: true }>;
type SealedAuthorityGrant = Readonly<{ [authorityGrantSeal]: true }>;

export type AuthorityLifecycleIssueCode =
  | 'authority-invalid'
  | 'authority-widened'
  | 'consent-method-mismatch'
  | 'grant-correlation-mismatch'
  | 'grant-expired'
  | 'grant-transition-invalid'
  | 'request-expired'
  | 'request-transition-invalid';

export type AuthorityLifecycleIssue = Readonly<{
  code: AuthorityLifecycleIssueCode;
  message: string;
}>;

export type AuthorityLifecycleIssues = readonly [AuthorityLifecycleIssue, ...AuthorityLifecycleIssue[]];

export type AuthorityLifecycleResult<T> =
  | Readonly<{ type: 'ok'; value: T }>
  | Readonly<{ type: 'err'; issues: AuthorityLifecycleIssues }>;

export const authorityLifecycleOk = <T>(value: T): AuthorityLifecycleResult<T> => ({ type: 'ok', value });

export const authorityLifecycleErr = <T = never>(
  issue: AuthorityLifecycleIssue,
  ...rest: readonly AuthorityLifecycleIssue[]
): AuthorityLifecycleResult<T> => ({ type: 'err', issues: [issue, ...rest] });

export type AuthorityInstant = AuthorityToken<'authority-instant', number>;
export type ProviderId = AuthorityToken<'provider-id', string>;
export type ProviderEnvironment = AuthorityToken<'provider-environment', string>;
export type ProviderAccountLabel = AuthorityToken<'provider-account-label', string>;
export type AuthorityAtom = AuthorityToken<'authority-atom', string>;
export type ConsentPromptVersion = AuthorityToken<'consent-prompt-version', string>;
export type RecipeDisplayPath = AuthorityToken<'recipe-display-path', string>;
export type RequestingExecutable = AuthorityToken<'requesting-executable', string>;

type TextAuthorityTokenKind =
  | ProviderId['kind']
  | ProviderEnvironment['kind']
  | ProviderAccountLabel['kind']
  | AuthorityAtom['kind']
  | ConsentPromptVersion['kind']
  | RecipeDisplayPath['kind']
  | RequestingExecutable['kind'];

const textToken = <Kind extends TextAuthorityTokenKind>(
  kind: Kind,
  value: unknown,
  maximumLength: number,
  accepts: (candidate: string) => boolean
): AuthorityLifecycleResult<AuthorityToken<Kind, string>> =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength &&
    !value.includes('\0') && accepts(value)
    ? authorityLifecycleOk({ kind, value, [authorityTokenSeal]: kind })
    : authorityLifecycleErr({ code: 'authority-invalid', message: `${kind} is invalid.` });

export const parseAuthorityInstant = (value: unknown): AuthorityLifecycleResult<AuthorityInstant> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? authorityLifecycleOk({ kind: 'authority-instant', value, [authorityTokenSeal]: 'authority-instant' })
    : authorityLifecycleErr({ code: 'authority-invalid', message: 'authority-instant is invalid.' });

export const parseProviderId = (value: unknown): AuthorityLifecycleResult<ProviderId> =>
  textToken('provider-id', value, 128, candidate => /^[a-z0-9][a-z0-9._-]*$/u.test(candidate));

export const parseProviderEnvironment = (value: unknown): AuthorityLifecycleResult<ProviderEnvironment> =>
  textToken('provider-environment', value, 128, candidate => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(candidate));

export const parseProviderAccountLabel = (value: unknown): AuthorityLifecycleResult<ProviderAccountLabel> =>
  textToken('provider-account-label', value, 256, () => true);

export const parseAuthorityAtom = (value: unknown): AuthorityLifecycleResult<AuthorityAtom> =>
  textToken('authority-atom', value, 256, candidate => /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(candidate));

export const parseConsentPromptVersion = (value: unknown): AuthorityLifecycleResult<ConsentPromptVersion> =>
  textToken('consent-prompt-version', value, 128, candidate => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(candidate));

export const parseRecipeDisplayPath = (value: unknown): AuthorityLifecycleResult<RecipeDisplayPath> =>
  textToken('recipe-display-path', value, 1024, () => true);

export const parseRequestingExecutable = (value: unknown): AuthorityLifecycleResult<RequestingExecutable> =>
  textToken('requesting-executable', value, 4096, () => true);

export type AuthorityWindow = Readonly<{
  issuedAt: AuthorityInstant;
  expiresAt: AuthorityInstant;
}>;

export const createAuthorityWindow = (
  issuedAt: AuthorityInstant,
  expiresAt: AuthorityInstant
): AuthorityLifecycleResult<AuthorityWindow> =>
  expiresAt.value > issuedAt.value
    ? authorityLifecycleOk({ issuedAt, expiresAt })
    : authorityLifecycleErr({ code: 'authority-invalid', message: 'Authority time window is empty or reversed.' });

export const isAuthorityWindowExpired = (window: AuthorityWindow, at: AuthorityInstant): boolean =>
  at.value >= window.expiresAt.value;

export type AuthorityAtomSet = readonly [AuthorityAtom, ...AuthorityAtom[]];
export type CredentialSlotSet = readonly [CredentialSlotId, ...CredentialSlotId[]];

const uniqueByValue = <T extends Readonly<{ value: string }>>(values: readonly T[]): readonly T[] =>
  values
    .toSorted((left, right) => left.value.localeCompare(right.value))
    .reduce<readonly T[]>((unique, value) =>
      unique.at(-1)?.value === value.value ? unique : [...unique, value], []);

export const createAuthorityAtomSet = (
  first: AuthorityAtom,
  ...rest: readonly AuthorityAtom[]
): AuthorityAtomSet => {
  const unique: readonly AuthorityAtom[] = uniqueByValue([first, ...rest]);
  const head: AuthorityAtom | undefined = unique[0];
  const tail: readonly AuthorityAtom[] = unique.slice(1);
  return head === undefined ? [first] : [head, ...tail];
};

export const createCredentialSlotSet = (
  first: CredentialSlotId,
  ...rest: readonly CredentialSlotId[]
): CredentialSlotSet => {
  const sorted: readonly CredentialSlotId[] = [first, ...rest]
    .toSorted((left, right) => left.localeCompare(right));
  const unique: readonly CredentialSlotId[] = sorted.reduce<readonly CredentialSlotId[]>((values, value) =>
    values.at(-1) === value ? values : [...values, value], []);
  const head: CredentialSlotId | undefined = unique[0];
  const tail: readonly CredentialSlotId[] = unique.slice(1);
  return head === undefined ? [first] : [head, ...tail];
};

export type ProviderAccount =
  | Readonly<{ type: 'unspecified' }>
  | Readonly<{ type: 'named'; label: ProviderAccountLabel }>;

export type AuthorityRequirements =
  | Readonly<{ type: 'operations'; operations: AuthorityAtomSet; scopes: readonly [] }>
  | Readonly<{ type: 'scopes'; operations: readonly []; scopes: AuthorityAtomSet }>
  | Readonly<{ type: 'operations-and-scopes'; operations: AuthorityAtomSet; scopes: AuthorityAtomSet }>;

export const operationRequirements = (operations: AuthorityAtomSet): AuthorityRequirements => ({
  type: 'operations',
  operations,
  scopes: []
});

export const scopeRequirements = (scopes: AuthorityAtomSet): AuthorityRequirements => ({
  type: 'scopes',
  operations: [],
  scopes
});

export const operationAndScopeRequirements = (
  operations: AuthorityAtomSet,
  scopes: AuthorityAtomSet
): AuthorityRequirements => ({
  type: 'operations-and-scopes',
  operations,
  scopes
});

export type ProviderAuthority = Readonly<{
  provider: ProviderId;
  account: ProviderAccount;
  environment: ProviderEnvironment;
  requirements: AuthorityRequirements;
}>;

export type AuthorityCredentialBinding = Readonly<{
  credentialReference: CredentialReference;
  credentialSlotIds: CredentialSlotSet;
  providerAuthority: ProviderAuthority;
}>;

export type AuthorityCredentialBindingSet = readonly [
  AuthorityCredentialBinding,
  ...AuthorityCredentialBinding[]
];

export type ConsentPurpose = 'credential-enrollment' | 'repository-approval';

export type AuthorityGrantProposal = Readonly<{
  grantId: GrantId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  recipeDisplayPath: RecipeDisplayPath;
  requestingExecutable: RequestingExecutable;
  credentialBindings: AuthorityCredentialBindingSet;
  authorityDigest: RedactedAuthorityDigest;
  promptVersion: ConsentPromptVersion;
  consentPurpose: ConsentPurpose;
  requestedGrantExpiresAt: AuthorityInstant;
  grantGeneration: number;
  deliveryMode: 'cooperative-bootstrap';
}>;

export type ReceivedAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'received';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
}>;

export type ParsedAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'parsed';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  proposal: AuthorityGrantProposal;
  parsedAt: AuthorityInstant;
}>;

export type AcceptedAuthorityPolicy = Readonly<{
  credentialBindings: AuthorityCredentialBindingSet;
  grantExpiresAt: AuthorityInstant;
  acceptedAt: AuthorityInstant;
}>;

export type PolicyAcceptedAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'policy-accepted';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  proposal: AuthorityGrantProposal;
  policy: AcceptedAuthorityPolicy;
}>;

export type AwaitingConsentAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'awaiting-consent';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  proposal: AuthorityGrantProposal;
  policy: AcceptedAuthorityPolicy;
  consentId: ConsentId;
  consentWindow: AuthorityWindow;
}>;

export type ApprovedAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'approved';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  proposal: AuthorityGrantProposal;
  policy: AcceptedAuthorityPolicy;
  consent: ConsentEvidenceRecord;
}>;

export type AuthorityRequestDenial =
  | Readonly<{ type: 'policy'; reason: 'policy-denied'; consent: null }>
  | Readonly<{
      type: 'consent';
      reason: 'user-denied' | 'cancelled';
      consent: ConsentEvidenceRecord;
    }>;

export type DeniedAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'denied';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  proposal: AuthorityGrantProposal;
  deniedAt: AuthorityInstant;
  denial: AuthorityRequestDenial;
}>;

export type ExpiredAuthorityRequest = SealedAuthorityRequest & Readonly<{
  state: 'expired';
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
  expiredAt: AuthorityInstant;
  expiredFrom: 'received' | 'parsed' | 'policy-accepted' | 'awaiting-consent';
  proposal: AuthorityGrantProposal | null;
}>;

export type AuthorityRequest =
  | ReceivedAuthorityRequest
  | ParsedAuthorityRequest
  | PolicyAcceptedAuthorityRequest
  | AwaitingConsentAuthorityRequest
  | ApprovedAuthorityRequest
  | DeniedAuthorityRequest
  | ExpiredAuthorityRequest;

export type AuthorityRequestEvent =
  | Readonly<{ type: 'parsed'; at: AuthorityInstant; proposal: AuthorityGrantProposal }>
  | Readonly<{
      type: 'policy-accepted';
      at: AuthorityInstant;
      credentialBindings: AuthorityCredentialBindingSet;
      grantExpiresAt: AuthorityInstant;
    }>
  | Readonly<{
      type: 'consent-requested';
      at: AuthorityInstant;
      consentId: ConsentId;
      deadline: AuthorityInstant;
    }>
  | Readonly<{ type: 'credential-entry-accepted'; at: AuthorityInstant }>
  | Readonly<{ type: 'repository-approved'; at: AuthorityInstant }>
  | Readonly<{ type: 'denied'; at: AuthorityInstant; reason: 'policy-denied' | 'user-denied' | 'cancelled' }>
  | Readonly<{ type: 'expire'; at: AuthorityInstant }>;

export type AuthorityConsentDisplay = Readonly<{
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  recipeDisplayPath: RecipeDisplayPath;
  requestingExecutable: RequestingExecutable;
  credentialBindings: AuthorityCredentialBindingSet;
  deliveryMode: 'cooperative-bootstrap';
  grantExpiresAt: AuthorityInstant;
}>;

export type OpenAuthorityConsentEffect = Readonly<{
  type: 'open-authority-consent';
  correlationId: JournalOperationId;
  idempotencyKey: ConsentId;
  expectedGrantGeneration: number;
  requiredAuthority: 'broker-owned-consent-surface';
  deadline: AuthorityInstant;
  method: ConsentPurpose;
  display: AuthorityConsentDisplay;
}>;

export type CommitAuthorityGrantEffect = Readonly<{
  type: 'commit-grant-with-consent';
  correlationId: JournalOperationId;
  idempotencyKey: JournalOperationId;
  expectedPredecessorGeneration: number;
  requiredAuthority: 'authority-journal';
  deadline: AuthorityInstant;
  command: CommitGrantWithConsent;
}>;

export type GrantTerminationReason =
  | 'authority-replaced'
  | 'credential-rotated'
  | 'recipe-drift'
  | 'user-revoked';

export type RecordGrantTerminationEffect = Readonly<{
  type: 'record-grant-termination';
  correlationId: JournalOperationId;
  idempotencyKey: JournalOperationId;
  expectedGrantGeneration: number;
  requiredAuthority: 'authority-journal';
  grantId: GrantId;
  at: AuthorityInstant;
  outcome: 'revoked' | 'expired';
  reason: GrantTerminationReason | 'local-grant-expired';
}>;

export type AuthorityLifecycleEffect =
  | OpenAuthorityConsentEffect
  | CommitAuthorityGrantEffect
  | RecordGrantTerminationEffect;

export type AuthorityAuditFact =
  | Readonly<{ type: 'request-received'; operationId: JournalOperationId; at: AuthorityInstant }>
  | Readonly<{ type: 'request-parsed'; operationId: JournalOperationId; at: AuthorityInstant }>
  | Readonly<{ type: 'policy-accepted'; operationId: JournalOperationId; at: AuthorityInstant }>
  | Readonly<{ type: 'consent-requested'; operationId: JournalOperationId; consentId: ConsentId; at: AuthorityInstant }>
  | Readonly<{ type: 'consent-approved'; operationId: JournalOperationId; consentId: ConsentId; at: AuthorityInstant }>
  | Readonly<{ type: 'request-denied'; operationId: JournalOperationId; at: AuthorityInstant; reason: AuthorityRequestDenial['reason'] }>
  | Readonly<{ type: 'request-expired'; operationId: JournalOperationId; at: AuthorityInstant }>
  | Readonly<{ type: 'grant-commit-requested'; operationId: JournalOperationId; grantId: GrantId; at: AuthorityInstant }>
  | Readonly<{ type: 'grant-activated'; operationId: JournalOperationId; grantId: GrantId; at: AuthorityInstant }>
  | Readonly<{ type: 'grant-recovery-required'; operationId: JournalOperationId; grantId: GrantId; at: AuthorityInstant }>
  | Readonly<{ type: 'grant-revoked'; operationId: JournalOperationId; grantId: GrantId; at: AuthorityInstant; reason: GrantTerminationReason }>
  | Readonly<{ type: 'grant-expired'; operationId: JournalOperationId; grantId: GrantId; at: AuthorityInstant }>;

export type AuthorityLifecycleWarning = Readonly<{
  code: 'authority-narrowed' | 'grant-expiry-clamped';
  message: string;
}>;

export type AuthorityRequestTerminal =
  | null
  | Readonly<{ outcome: 'approved'; grantId: GrantId }>
  | Readonly<{ outcome: 'denied'; reason: AuthorityRequestDenial['reason'] }>
  | Readonly<{ outcome: 'expired' }>;

export type AuthorityRequestTransition = Readonly<{
  state: AuthorityRequest;
  effects: readonly AuthorityLifecycleEffect[];
  audit: readonly AuthorityAuditFact[];
  warnings: readonly AuthorityLifecycleWarning[];
  terminal: AuthorityRequestTerminal;
}>;

const requestTerminal = (state: AuthorityRequest): AuthorityRequestTerminal => {
  if (state.state === 'approved') return { outcome: 'approved', grantId: state.proposal.grantId };
  if (state.state === 'denied') return { outcome: 'denied', reason: state.denial.reason };
  return state.state === 'expired' ? { outcome: 'expired' } : null;
};

const requestTransition = (
  state: AuthorityRequest,
  effects: readonly AuthorityLifecycleEffect[],
  audit: readonly AuthorityAuditFact[],
  warnings: readonly AuthorityLifecycleWarning[] = []
): AuthorityLifecycleResult<AuthorityRequestTransition> => authorityLifecycleOk({
  state,
  effects,
  audit,
  warnings,
  terminal: requestTerminal(state)
});

export type OpenAuthorityRequestInput = Readonly<{
  operationId: JournalOperationId;
  requestWindow: AuthorityWindow;
}>;

export const openAuthorityRequest = (
  input: OpenAuthorityRequestInput
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  const state: ReceivedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'received',
    operationId: input.operationId,
    requestWindow: input.requestWindow
  };
  return requestTransition(state, [], [{
    type: 'request-received',
    operationId: input.operationId,
    at: input.requestWindow.issuedAt
  }]);
};

const authorityAtoms = (requirements: AuthorityRequirements): readonly AuthorityAtom[] =>
  [...requirements.operations, ...requirements.scopes];

const hasDistinctValues = (values: readonly Readonly<{ value: string }>[]): boolean =>
  values.every((value, index) => values.findIndex(candidate => candidate.value === value.value) === index);

const credentialBindingSlots = (
  bindings: AuthorityCredentialBindingSet
): readonly CredentialSlotId[] => bindings.flatMap(binding => binding.credentialSlotIds);

const validCredentialBinding = (binding: AuthorityCredentialBinding): boolean =>
  binding.credentialReference.value.length > 0 &&
  binding.credentialSlotIds.length > 0 &&
  hasDistinctValues(binding.credentialSlotIds.map(value => ({ value }))) &&
  authorityAtoms(binding.providerAuthority.requirements).length > 0 &&
  hasDistinctValues(authorityAtoms(binding.providerAuthority.requirements));

const validCredentialBindings = (bindings: AuthorityCredentialBindingSet): boolean =>
  bindings.length > 0 &&
  bindings.every(validCredentialBinding) &&
  hasDistinctValues(bindings.map(binding => binding.credentialReference)) &&
  hasDistinctValues(credentialBindingSlots(bindings).map(value => ({ value })));

const validProposal = (proposal: AuthorityGrantProposal): boolean =>
  Number.isSafeInteger(proposal.grantGeneration) && proposal.grantGeneration >= 1 &&
  validCredentialBindings(proposal.credentialBindings);

const sameAccount = (left: ProviderAccount, right: ProviderAccount): boolean =>
  left.type === 'unspecified'
    ? right.type === 'unspecified'
    : right.type === 'named' && left.label.value === right.label.value;

const valueSubset = (
  candidate: readonly Readonly<{ value: string }>[],
  authority: readonly Readonly<{ value: string }>[]
): boolean => candidate.every(item => authority.some(allowed => allowed.value === item.value));

const providerAuthoritySubset = (candidate: ProviderAuthority, authority: ProviderAuthority): boolean =>
  candidate.provider.value === authority.provider.value &&
  sameAccount(candidate.account, authority.account) &&
  candidate.environment.value === authority.environment.value &&
  valueSubset(candidate.requirements.operations, authority.requirements.operations) &&
  valueSubset(candidate.requirements.scopes, authority.requirements.scopes);

const slotsSubset = (candidate: CredentialSlotSet, authority: CredentialSlotSet): boolean =>
  candidate.every(slot => authority.includes(slot));

const sameAuthority = (left: ProviderAuthority, right: ProviderAuthority): boolean =>
  providerAuthoritySubset(left, right) && providerAuthoritySubset(right, left);

const credentialBindingSubset = (
  candidate: AuthorityCredentialBinding,
  authority: AuthorityCredentialBinding
): boolean => candidate.credentialReference.value === authority.credentialReference.value &&
  providerAuthoritySubset(candidate.providerAuthority, authority.providerAuthority) &&
  candidate.credentialSlotIds.length === authority.credentialSlotIds.length &&
  slotsSubset(candidate.credentialSlotIds, authority.credentialSlotIds);

const credentialBindingsSubset = (
  candidate: AuthorityCredentialBindingSet,
  authority: AuthorityCredentialBindingSet
): boolean => validCredentialBindings(candidate) && candidate.every(binding => {
  const requested = authority.find(
    allowed => allowed.credentialReference.value === binding.credentialReference.value
  );
  return requested !== undefined && credentialBindingSubset(binding, requested);
}) && candidate.length === authority.length;

const sameCredentialBinding = (
  left: AuthorityCredentialBinding,
  right: AuthorityCredentialBinding
): boolean => left.credentialReference.value === right.credentialReference.value &&
  sameAuthority(left.providerAuthority, right.providerAuthority) &&
  left.credentialSlotIds.length === right.credentialSlotIds.length &&
  slotsSubset(left.credentialSlotIds, right.credentialSlotIds);

const sameCredentialBindings = (
  left: AuthorityCredentialBindingSet,
  right: AuthorityCredentialBindingSet
): boolean => left.length === right.length && left.every(binding => {
  const candidate = right.find(
    current => current.credentialReference.value === binding.credentialReference.value
  );
  return candidate !== undefined && sameCredentialBinding(binding, candidate);
});

const atOrAfter = (left: AuthorityInstant, right: AuthorityInstant): boolean => left.value >= right.value;
const before = (left: AuthorityInstant, right: AuthorityInstant): boolean => left.value < right.value;

const expireRequest = (
  state: Exclude<AuthorityRequest, ApprovedAuthorityRequest | DeniedAuthorityRequest | ExpiredAuthorityRequest>,
  at: AuthorityInstant,
  proposal: AuthorityGrantProposal | null
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  const expired: ExpiredAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'expired',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    expiredAt: at,
    expiredFrom: state.state,
    proposal
  };
  return requestTransition(expired, [], [{ type: 'request-expired', operationId: state.operationId, at }]);
};

const requestDeadline = (
  state: Exclude<AuthorityRequest, ApprovedAuthorityRequest | DeniedAuthorityRequest | ExpiredAuthorityRequest>
): AuthorityInstant => {
  if (state.state === 'received' || state.state === 'parsed') return state.requestWindow.expiresAt;
  if (state.state === 'policy-accepted') {
    return state.policy.grantExpiresAt.value < state.requestWindow.expiresAt.value
      ? state.policy.grantExpiresAt
      : state.requestWindow.expiresAt;
  }
  return [state.requestWindow.expiresAt, state.policy.grantExpiresAt, state.consentWindow.expiresAt]
    .toSorted((left, right) => left.value - right.value)[0] ?? state.requestWindow.expiresAt;
};

const expiredAt = (
  state: Exclude<AuthorityRequest, ApprovedAuthorityRequest | DeniedAuthorityRequest | ExpiredAuthorityRequest>,
  at: AuthorityInstant
): boolean => atOrAfter(at, requestDeadline(state));

const parseRequest = (
  state: ReceivedAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'parsed' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, null);
  if (before(event.at, state.requestWindow.issuedAt) || !validProposal(event.proposal) ||
      !before(event.at, event.proposal.requestedGrantExpiresAt)) {
    return authorityLifecycleErr({ code: 'authority-invalid', message: 'Parsed grant proposal is invalid.' });
  }
  const parsed: ParsedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'parsed',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: event.proposal,
    parsedAt: event.at
  };
  return requestTransition(parsed, [], [{ type: 'request-parsed', operationId: state.operationId, at: event.at }]);
};

const acceptPolicy = (
  state: ParsedAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'policy-accepted' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, state.proposal);
  if (before(event.at, state.parsedAt) || !before(event.at, event.grantExpiresAt) ||
      event.grantExpiresAt.value > state.proposal.requestedGrantExpiresAt.value) {
    return authorityLifecycleErr({ code: 'authority-invalid', message: 'Accepted grant lifetime is invalid.' });
  }
  if (!credentialBindingsSubset(event.credentialBindings, state.proposal.credentialBindings)) {
    return authorityLifecycleErr({ code: 'authority-widened', message: 'Policy cannot widen requested credential authority.' });
  }
  const policy: AcceptedAuthorityPolicy = {
    credentialBindings: event.credentialBindings,
    grantExpiresAt: event.grantExpiresAt,
    acceptedAt: event.at
  };
  const accepted: PolicyAcceptedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'policy-accepted',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: state.proposal,
    policy
  };
  const authorityNarrowed = !sameCredentialBindings(
    event.credentialBindings,
    state.proposal.credentialBindings
  );
  const warnings: readonly AuthorityLifecycleWarning[] = [
    ...(authorityNarrowed ? [{
      code: 'authority-narrowed' as const,
      message: 'Policy narrowed the requested credential authority.'
    }] : []),
    ...(event.grantExpiresAt.value < state.proposal.requestedGrantExpiresAt.value ? [{
      code: 'grant-expiry-clamped' as const,
      message: 'Policy shortened the requested local grant lifetime.'
    }] : [])
  ];
  return requestTransition(accepted, [], [{
    type: 'policy-accepted',
    operationId: state.operationId,
    at: event.at
  }], warnings);
};

const consentDisplay = (state: PolicyAcceptedAuthorityRequest): AuthorityConsentDisplay => ({
  repository: state.proposal.repository,
  recipeRevision: state.proposal.recipeRevision,
  recipeDisplayPath: state.proposal.recipeDisplayPath,
  requestingExecutable: state.proposal.requestingExecutable,
  credentialBindings: state.policy.credentialBindings,
  deliveryMode: state.proposal.deliveryMode,
  grantExpiresAt: state.policy.grantExpiresAt
});

const requestConsent = (
  state: PolicyAcceptedAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'consent-requested' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, state.proposal);
  if (before(event.at, state.policy.acceptedAt) || !before(event.at, event.deadline) ||
      event.deadline.value > state.requestWindow.expiresAt.value ||
      event.deadline.value > state.policy.grantExpiresAt.value) {
    return authorityLifecycleErr({ code: 'authority-invalid', message: 'Consent prompt lifetime is invalid.' });
  }
  const consentWindow: AuthorityWindow = { issuedAt: event.at, expiresAt: event.deadline };
  const awaiting: AwaitingConsentAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'awaiting-consent',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: state.proposal,
    policy: state.policy,
    consentId: event.consentId,
    consentWindow
  };
  const effect: OpenAuthorityConsentEffect = {
    type: 'open-authority-consent',
    correlationId: state.operationId,
    idempotencyKey: event.consentId,
    expectedGrantGeneration: state.proposal.grantGeneration,
    requiredAuthority: 'broker-owned-consent-surface',
    deadline: event.deadline,
    method: state.proposal.consentPurpose,
    display: consentDisplay(state)
  };
  return requestTransition(awaiting, [effect], [{
    type: 'consent-requested',
    operationId: state.operationId,
    consentId: event.consentId,
    at: event.at
  }]);
};

const consentEvidence = (
  state: AwaitingConsentAuthorityRequest,
  at: AuthorityInstant,
  outcome: 'approved' | 'denied'
): ConsentEvidenceRecord => ({
  id: state.consentId,
  operationId: state.operationId,
  repository: state.proposal.repository,
  recipeRevision: state.proposal.recipeRevision,
  authorityDigest: state.proposal.authorityDigest,
  promptVersion: state.proposal.promptVersion.value,
  credentialSlotIds: credentialBindingSlots(state.policy.credentialBindings),
  deliveryMode: state.proposal.deliveryMode,
  grantExpiresAtMs: state.policy.grantExpiresAt.value,
  occurredAtMs: at.value,
  outcome
});

const approveConsent = (
  state: AwaitingConsentAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'credential-entry-accepted' | 'repository-approved' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, state.proposal);
  const methodMatches = state.proposal.consentPurpose === 'credential-enrollment'
    ? event.type === 'credential-entry-accepted'
    : event.type === 'repository-approved';
  if (!methodMatches) {
    return authorityLifecycleErr({
      code: 'consent-method-mismatch',
      message: 'Consent completion does not match the broker-selected consent surface.'
    });
  }
  if (before(event.at, state.consentWindow.issuedAt)) {
    return authorityLifecycleErr({ code: 'authority-invalid', message: 'Consent occurred before its trusted prompt.' });
  }
  const consent = consentEvidence(state, event.at, 'approved');
  const approved: ApprovedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'approved',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: state.proposal,
    policy: state.policy,
    consent
  };
  return requestTransition(approved, [], [{
    type: 'consent-approved',
    operationId: state.operationId,
    consentId: state.consentId,
    at: event.at
  }]);
};

const denyParsedRequest = (
  state: ParsedAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'denied' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, state.proposal);
  if (event.reason !== 'policy-denied' || before(event.at, state.parsedAt)) {
    return authorityLifecycleErr({ code: 'request-transition-invalid', message: 'Request denial is invalid at this stage.' });
  }
  const denied: DeniedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'denied',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: state.proposal,
    deniedAt: event.at,
    denial: { type: 'policy', reason: 'policy-denied', consent: null }
  };
  return requestTransition(denied, [], [{
    type: 'request-denied',
    operationId: state.operationId,
    at: event.at,
    reason: event.reason
  }]);
};

const denyConsent = (
  state: AwaitingConsentAuthorityRequest,
  event: Extract<AuthorityRequestEvent, { type: 'denied' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (expiredAt(state, event.at)) return expireRequest(state, event.at, state.proposal);
  if (event.reason === 'policy-denied' || before(event.at, state.consentWindow.issuedAt)) {
    return authorityLifecycleErr({ code: 'request-transition-invalid', message: 'Consent denial is invalid at this stage.' });
  }
  const denied: DeniedAuthorityRequest = {
    [authorityRequestSeal]: true,
    state: 'denied',
    operationId: state.operationId,
    requestWindow: state.requestWindow,
    proposal: state.proposal,
    deniedAt: event.at,
    denial: {
      type: 'consent',
      reason: event.reason,
      consent: consentEvidence(state, event.at, 'denied')
    }
  };
  return requestTransition(denied, [], [{
    type: 'request-denied',
    operationId: state.operationId,
    at: event.at,
    reason: event.reason
  }]);
};

const explicitRequestExpiry = (
  state: Exclude<AuthorityRequest, ApprovedAuthorityRequest | DeniedAuthorityRequest | ExpiredAuthorityRequest>,
  event: Extract<AuthorityRequestEvent, { type: 'expire' }>
): AuthorityLifecycleResult<AuthorityRequestTransition> =>
  expiredAt(state, event.at)
    ? expireRequest(state, event.at, state.state === 'received' ? null : state.proposal)
    : authorityLifecycleErr({ code: 'request-expired', message: 'Request cannot expire before its current deadline.' });

const illegalRequestTransition = (): AuthorityLifecycleResult<AuthorityRequestTransition> =>
  authorityLifecycleErr({
    code: 'request-transition-invalid',
    message: 'The authority request transition is not permitted from its current state.'
  });

export const reduceAuthorityRequest = (
  state: AuthorityRequest,
  event: AuthorityRequestEvent
): AuthorityLifecycleResult<AuthorityRequestTransition> => {
  if (state.state === 'received') {
    if (event.type === 'parsed') return parseRequest(state, event);
    if (event.type === 'expire') return explicitRequestExpiry(state, event);
    return illegalRequestTransition();
  }
  if (state.state === 'parsed') {
    if (event.type === 'policy-accepted') return acceptPolicy(state, event);
    if (event.type === 'denied') return denyParsedRequest(state, event);
    if (event.type === 'expire') return explicitRequestExpiry(state, event);
    return illegalRequestTransition();
  }
  if (state.state === 'policy-accepted') {
    if (event.type === 'consent-requested') return requestConsent(state, event);
    if (event.type === 'expire') return explicitRequestExpiry(state, event);
    return illegalRequestTransition();
  }
  if (state.state === 'awaiting-consent') {
    if (event.type === 'credential-entry-accepted' || event.type === 'repository-approved') {
      return approveConsent(state, event);
    }
    if (event.type === 'denied') return denyConsent(state, event);
    if (event.type === 'expire') return explicitRequestExpiry(state, event);
    return illegalRequestTransition();
  }
  return illegalRequestTransition();
};

export type AuthorityGrantFacts = Readonly<{
  command: CommitGrantWithConsent;
  credentialBindings: AuthorityCredentialBindingSet;
}>;

export type PendingAuthorityGrant = SealedAuthorityGrant & Readonly<{
  state: 'pending-persistence';
  facts: AuthorityGrantFacts;
}>;

export type ActiveAuthorityGrant = SealedAuthorityGrant & Readonly<{
  state: 'active';
  facts: AuthorityGrantFacts;
  activatedAt: AuthorityInstant;
}>;

export type RevokedAuthorityGrant = SealedAuthorityGrant & Readonly<{
  state: 'revoked';
  facts: AuthorityGrantFacts;
  revokedAt: AuthorityInstant;
  reason: GrantTerminationReason;
}>;

export type ExpiredAuthorityGrant = SealedAuthorityGrant & Readonly<{
  state: 'expired';
  facts: AuthorityGrantFacts;
  expiredAt: AuthorityInstant;
}>;

export type RecoveryRequiredAuthorityGrant = SealedAuthorityGrant & Readonly<{
  state: 'recovery-required';
  facts: AuthorityGrantFacts;
  failedAt: AuthorityInstant;
  issues: JournalIssues;
}>;

export type AuthorityGrant =
  | PendingAuthorityGrant
  | ActiveAuthorityGrant
  | RevokedAuthorityGrant
  | ExpiredAuthorityGrant
  | RecoveryRequiredAuthorityGrant;

export type AuthorityGrantEvent =
  | Readonly<{
      type: 'grant-persisted';
      operationId: JournalOperationId;
      grantId: GrantId;
      at: AuthorityInstant;
    }>
  | Readonly<{
      type: 'grant-persistence-failed';
      operationId: JournalOperationId;
      grantId: GrantId;
      at: AuthorityInstant;
      issues: JournalIssues;
    }>
  | Readonly<{
      type: 'retry-persistence';
      grantId: GrantId;
      at: AuthorityInstant;
    }>
  | Readonly<{
      type: 'revoke';
      operationId: JournalOperationId;
      grantId: GrantId;
      at: AuthorityInstant;
      reason: GrantTerminationReason;
    }>
  | Readonly<{
      type: 'expire';
      operationId: JournalOperationId;
      grantId: GrantId;
      at: AuthorityInstant;
    }>;

export type AuthorityGrantTerminal =
  | null
  | Readonly<{ outcome: 'revoked'; reason: GrantTerminationReason }>
  | Readonly<{ outcome: 'expired' }>
  | Readonly<{ outcome: 'recovery-required' }>;

export type AuthorityGrantTransition = Readonly<{
  state: AuthorityGrant;
  effects: readonly AuthorityLifecycleEffect[];
  audit: readonly AuthorityAuditFact[];
  warnings: readonly AuthorityLifecycleWarning[];
  terminal: AuthorityGrantTerminal;
}>;

const grantTerminal = (state: AuthorityGrant): AuthorityGrantTerminal => {
  if (state.state === 'revoked') return { outcome: 'revoked', reason: state.reason };
  if (state.state === 'expired') return { outcome: 'expired' };
  return state.state === 'recovery-required' ? { outcome: 'recovery-required' } : null;
};

const grantTransition = (
  state: AuthorityGrant,
  effects: readonly AuthorityLifecycleEffect[],
  audit: readonly AuthorityAuditFact[]
): AuthorityLifecycleResult<AuthorityGrantTransition> => authorityLifecycleOk({
  state,
  effects,
  audit,
  warnings: [],
  terminal: grantTerminal(state)
});

const grantCommitEffect = (facts: AuthorityGrantFacts): CommitAuthorityGrantEffect => ({
  type: 'commit-grant-with-consent',
  correlationId: facts.command.operationId,
  idempotencyKey: facts.command.operationId,
  expectedPredecessorGeneration: facts.command.grant.generation - 1,
  requiredAuthority: 'authority-journal',
  deadline: {
    kind: 'authority-instant',
    value: facts.command.grant.expiresAtMs,
    [authorityTokenSeal]: 'authority-instant'
  },
  command: facts.command
});

const toGrantCredentialBinding = (
  slotId: CredentialSlotId,
  credentialReference: CredentialReference
): GrantCredentialBinding => ({ slotId, credentialReference });

const expandGrantCredentialBinding = (
  binding: AuthorityCredentialBinding
): readonly GrantCredentialBinding[] => binding.credentialSlotIds.map(slotId =>
  toGrantCredentialBinding(slotId, binding.credentialReference));

const toGrantCredentialBindings = (
  bindings: AuthorityCredentialBindingSet
): GrantCredentialBindingSet => {
  const first = bindings[0];
  const head = toGrantCredentialBinding(first.credentialSlotIds[0], first.credentialReference);
  const tail: readonly GrantCredentialBinding[] = [
    ...first.credentialSlotIds.slice(1).map(slotId =>
      toGrantCredentialBinding(slotId, first.credentialReference)),
    ...bindings.slice(1).flatMap(expandGrantCredentialBinding)
  ];
  return [head, ...tail];
};

export const deriveGrantFromApprovedRequest = (
  request: ApprovedAuthorityRequest
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (request.consent.occurredAtMs >= request.policy.grantExpiresAt.value) {
    return authorityLifecycleErr({ code: 'grant-expired', message: 'Approved request cannot issue an expired grant.' });
  }
  const command: CommitGrantWithConsent = {
    operationId: request.operationId,
    consent: request.consent,
    grant: {
      id: request.proposal.grantId,
      operationId: request.operationId,
      repository: request.proposal.repository,
      recipeRevision: request.proposal.recipeRevision,
      credentialBindings: toGrantCredentialBindings(request.policy.credentialBindings),
      consentId: request.consent.id,
      generation: request.proposal.grantGeneration,
      issuedAtMs: request.consent.occurredAtMs,
      expiresAtMs: request.policy.grantExpiresAt.value,
      state: 'active'
    }
  };
  const facts: AuthorityGrantFacts = {
    command,
    credentialBindings: request.policy.credentialBindings
  };
  const pending: PendingAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'pending-persistence',
    facts
  };
  const at: AuthorityInstant = {
    kind: 'authority-instant',
    value: request.consent.occurredAtMs,
    [authorityTokenSeal]: 'authority-instant'
  };
  return grantTransition(pending, [grantCommitEffect(facts)], [{
    type: 'grant-commit-requested',
    operationId: request.operationId,
    grantId: request.proposal.grantId,
    at
  }]);
};

const grantPersistenceIdentityMatches = (
  facts: AuthorityGrantFacts,
  event: Extract<AuthorityGrantEvent, { type: 'grant-persisted' | 'grant-persistence-failed' }>
): boolean => facts.command.operationId.value === event.operationId.value && facts.command.grant.id === event.grantId;

const grantIdMatches = (
  facts: AuthorityGrantFacts,
  event: Readonly<{ grantId: GrantId }>
): boolean => facts.command.grant.id === event.grantId;

const grantExpiresAt = (facts: AuthorityGrantFacts): number => facts.command.grant.expiresAtMs;

const expireGrant = (
  state: PendingAuthorityGrant | ActiveAuthorityGrant | RecoveryRequiredAuthorityGrant,
  event: Extract<AuthorityGrantEvent, { type: 'expire' }>
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (!grantIdMatches(state.facts, event)) {
    return authorityLifecycleErr({ code: 'grant-correlation-mismatch', message: 'Grant expiry correlation is invalid.' });
  }
  if (event.at.value < grantExpiresAt(state.facts)) {
    return authorityLifecycleErr({ code: 'grant-expired', message: 'Grant cannot expire before its local deadline.' });
  }
  const expired: ExpiredAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'expired',
    facts: state.facts,
    expiredAt: event.at
  };
  const effect: RecordGrantTerminationEffect = {
    type: 'record-grant-termination',
    correlationId: event.operationId,
    idempotencyKey: event.operationId,
    expectedGrantGeneration: state.facts.command.grant.generation,
    requiredAuthority: 'authority-journal',
    grantId: event.grantId,
    at: event.at,
    outcome: 'expired',
    reason: 'local-grant-expired'
  };
  return grantTransition(expired, [effect], [{
    type: 'grant-expired',
    operationId: event.operationId,
    grantId: event.grantId,
    at: event.at
  }]);
};

const persistGrant = (
  state: PendingAuthorityGrant,
  event: Extract<AuthorityGrantEvent, { type: 'grant-persisted' }>
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (!grantPersistenceIdentityMatches(state.facts, event)) {
    return authorityLifecycleErr({ code: 'grant-correlation-mismatch', message: 'Grant persistence correlation is invalid.' });
  }
  if (event.at.value >= grantExpiresAt(state.facts)) return expireGrant(state, { ...event, type: 'expire' });
  const active: ActiveAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'active',
    facts: state.facts,
    activatedAt: event.at
  };
  return grantTransition(active, [], [{
    type: 'grant-activated',
    operationId: event.operationId,
    grantId: event.grantId,
    at: event.at
  }]);
};

const failGrantPersistence = (
  state: PendingAuthorityGrant,
  event: Extract<AuthorityGrantEvent, { type: 'grant-persistence-failed' }>
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (!grantPersistenceIdentityMatches(state.facts, event)) {
    return authorityLifecycleErr({ code: 'grant-correlation-mismatch', message: 'Grant persistence correlation is invalid.' });
  }
  const recovery: RecoveryRequiredAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'recovery-required',
    facts: state.facts,
    failedAt: event.at,
    issues: event.issues
  };
  return grantTransition(recovery, [], [{
    type: 'grant-recovery-required',
    operationId: event.operationId,
    grantId: event.grantId,
    at: event.at
  }]);
};

const retryGrantPersistence = (
  state: RecoveryRequiredAuthorityGrant,
  event: Extract<AuthorityGrantEvent, { type: 'retry-persistence' }>
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (state.facts.command.grant.id !== event.grantId) {
    return authorityLifecycleErr({ code: 'grant-correlation-mismatch', message: 'Grant recovery correlation is invalid.' });
  }
  if (event.at.value >= grantExpiresAt(state.facts)) {
    const operationId = state.facts.command.operationId;
    return expireGrant(state, { type: 'expire', operationId, grantId: event.grantId, at: event.at });
  }
  const pending: PendingAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'pending-persistence',
    facts: state.facts
  };
  return grantTransition(pending, [grantCommitEffect(state.facts)], [{
    type: 'grant-commit-requested',
    operationId: state.facts.command.operationId,
    grantId: event.grantId,
    at: event.at
  }]);
};

const revokeGrant = (
  state: ActiveAuthorityGrant,
  event: Extract<AuthorityGrantEvent, { type: 'revoke' }>
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (!grantIdMatches(state.facts, event)) {
    return authorityLifecycleErr({ code: 'grant-correlation-mismatch', message: 'Grant revocation correlation is invalid.' });
  }
  if (event.at.value < state.activatedAt.value) {
    return authorityLifecycleErr({ code: 'grant-transition-invalid', message: 'Grant cannot be revoked before activation.' });
  }
  if (event.at.value >= grantExpiresAt(state.facts)) {
    return expireGrant(state, { ...event, type: 'expire' });
  }
  const revoked: RevokedAuthorityGrant = {
    [authorityGrantSeal]: true,
    state: 'revoked',
    facts: state.facts,
    revokedAt: event.at,
    reason: event.reason
  };
  const effect: RecordGrantTerminationEffect = {
    type: 'record-grant-termination',
    correlationId: event.operationId,
    idempotencyKey: event.operationId,
    expectedGrantGeneration: state.facts.command.grant.generation,
    requiredAuthority: 'authority-journal',
    grantId: event.grantId,
    at: event.at,
    outcome: 'revoked',
    reason: event.reason
  };
  return grantTransition(revoked, [effect], [{
    type: 'grant-revoked',
    operationId: event.operationId,
    grantId: event.grantId,
    at: event.at,
    reason: event.reason
  }]);
};

const illegalGrantTransition = (): AuthorityLifecycleResult<AuthorityGrantTransition> =>
  authorityLifecycleErr({
    code: 'grant-transition-invalid',
    message: 'The authority grant transition is not permitted from its current state.'
  });

export const reduceAuthorityGrant = (
  state: AuthorityGrant,
  event: AuthorityGrantEvent
): AuthorityLifecycleResult<AuthorityGrantTransition> => {
  if (state.state === 'pending-persistence') {
    if (event.type === 'grant-persisted') return persistGrant(state, event);
    if (event.type === 'grant-persistence-failed') return failGrantPersistence(state, event);
    if (event.type === 'expire') return expireGrant(state, event);
    return illegalGrantTransition();
  }
  if (state.state === 'recovery-required') {
    if (event.type === 'retry-persistence') return retryGrantPersistence(state, event);
    if (event.type === 'expire') return expireGrant(state, event);
    return illegalGrantTransition();
  }
  if (state.state === 'active') {
    if (event.type === 'revoke') return revokeGrant(state, event);
    if (event.type === 'expire') return expireGrant(state, event);
    return illegalGrantTransition();
  }
  return illegalGrantTransition();
};
