import type { CredentialReference } from './lease.ts';
import type { CommitGrantWithConsent, ConsentEvidenceRecord, ConsentId, JournalIssues, JournalOperationId, RedactedAuthorityDigest } from './journal.ts';
import type { CanonicalRepository, CredentialSlotId, GrantId, RecipeRevision } from './primitives.ts';
declare const authorityTokenSeal: unique symbol;
declare const authorityRequestSeal: unique symbol;
declare const authorityGrantSeal: unique symbol;
type AuthorityToken<Kind extends string, Value> = Readonly<{
    kind: Kind;
    value: Value;
    [authorityTokenSeal]: Kind;
}>;
type SealedAuthorityRequest = Readonly<{
    [authorityRequestSeal]: true;
}>;
type SealedAuthorityGrant = Readonly<{
    [authorityGrantSeal]: true;
}>;
export type AuthorityLifecycleIssueCode = 'authority-invalid' | 'authority-widened' | 'consent-method-mismatch' | 'grant-correlation-mismatch' | 'grant-expired' | 'grant-transition-invalid' | 'request-expired' | 'request-transition-invalid';
export type AuthorityLifecycleIssue = Readonly<{
    code: AuthorityLifecycleIssueCode;
    message: string;
}>;
export type AuthorityLifecycleIssues = readonly [AuthorityLifecycleIssue, ...AuthorityLifecycleIssue[]];
export type AuthorityLifecycleResult<T> = Readonly<{
    type: 'ok';
    value: T;
}> | Readonly<{
    type: 'err';
    issues: AuthorityLifecycleIssues;
}>;
export declare const authorityLifecycleOk: <T>(value: T) => AuthorityLifecycleResult<T>;
export declare const authorityLifecycleErr: <T = never>(issue: AuthorityLifecycleIssue, ...rest: readonly AuthorityLifecycleIssue[]) => AuthorityLifecycleResult<T>;
export type AuthorityInstant = AuthorityToken<'authority-instant', number>;
export type ProviderId = AuthorityToken<'provider-id', string>;
export type ProviderEnvironment = AuthorityToken<'provider-environment', string>;
export type ProviderAccountLabel = AuthorityToken<'provider-account-label', string>;
export type AuthorityAtom = AuthorityToken<'authority-atom', string>;
export type ConsentPromptVersion = AuthorityToken<'consent-prompt-version', string>;
export type RecipeDisplayPath = AuthorityToken<'recipe-display-path', string>;
export type RequestingExecutable = AuthorityToken<'requesting-executable', string>;
export declare const parseAuthorityInstant: (value: unknown) => AuthorityLifecycleResult<AuthorityInstant>;
export declare const parseProviderId: (value: unknown) => AuthorityLifecycleResult<ProviderId>;
export declare const parseProviderEnvironment: (value: unknown) => AuthorityLifecycleResult<ProviderEnvironment>;
export declare const parseProviderAccountLabel: (value: unknown) => AuthorityLifecycleResult<ProviderAccountLabel>;
export declare const parseAuthorityAtom: (value: unknown) => AuthorityLifecycleResult<AuthorityAtom>;
export declare const parseConsentPromptVersion: (value: unknown) => AuthorityLifecycleResult<ConsentPromptVersion>;
export declare const parseRecipeDisplayPath: (value: unknown) => AuthorityLifecycleResult<RecipeDisplayPath>;
export declare const parseRequestingExecutable: (value: unknown) => AuthorityLifecycleResult<RequestingExecutable>;
export type AuthorityWindow = Readonly<{
    issuedAt: AuthorityInstant;
    expiresAt: AuthorityInstant;
}>;
export declare const createAuthorityWindow: (issuedAt: AuthorityInstant, expiresAt: AuthorityInstant) => AuthorityLifecycleResult<AuthorityWindow>;
export declare const isAuthorityWindowExpired: (window: AuthorityWindow, at: AuthorityInstant) => boolean;
export type AuthorityAtomSet = readonly [AuthorityAtom, ...AuthorityAtom[]];
export type CredentialSlotSet = readonly [CredentialSlotId, ...CredentialSlotId[]];
export declare const createAuthorityAtomSet: (first: AuthorityAtom, ...rest: readonly AuthorityAtom[]) => AuthorityAtomSet;
export declare const createCredentialSlotSet: (first: CredentialSlotId, ...rest: readonly CredentialSlotId[]) => CredentialSlotSet;
export type ProviderAccount = Readonly<{
    type: 'unspecified';
}> | Readonly<{
    type: 'named';
    label: ProviderAccountLabel;
}>;
export type AuthorityRequirements = Readonly<{
    type: 'operations';
    operations: AuthorityAtomSet;
    scopes: readonly [];
}> | Readonly<{
    type: 'scopes';
    operations: readonly [];
    scopes: AuthorityAtomSet;
}> | Readonly<{
    type: 'operations-and-scopes';
    operations: AuthorityAtomSet;
    scopes: AuthorityAtomSet;
}>;
export declare const operationRequirements: (operations: AuthorityAtomSet) => AuthorityRequirements;
export declare const scopeRequirements: (scopes: AuthorityAtomSet) => AuthorityRequirements;
export declare const operationAndScopeRequirements: (operations: AuthorityAtomSet, scopes: AuthorityAtomSet) => AuthorityRequirements;
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
export type AuthorityRequestDenial = Readonly<{
    type: 'policy';
    reason: 'policy-denied';
    consent: null;
}> | Readonly<{
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
export type AuthorityRequest = ReceivedAuthorityRequest | ParsedAuthorityRequest | PolicyAcceptedAuthorityRequest | AwaitingConsentAuthorityRequest | ApprovedAuthorityRequest | DeniedAuthorityRequest | ExpiredAuthorityRequest;
export type AuthorityRequestEvent = Readonly<{
    type: 'parsed';
    at: AuthorityInstant;
    proposal: AuthorityGrantProposal;
}> | Readonly<{
    type: 'policy-accepted';
    at: AuthorityInstant;
    credentialBindings: AuthorityCredentialBindingSet;
    grantExpiresAt: AuthorityInstant;
}> | Readonly<{
    type: 'consent-requested';
    at: AuthorityInstant;
    consentId: ConsentId;
    deadline: AuthorityInstant;
}> | Readonly<{
    type: 'credential-entry-accepted';
    at: AuthorityInstant;
}> | Readonly<{
    type: 'repository-approved';
    at: AuthorityInstant;
}> | Readonly<{
    type: 'denied';
    at: AuthorityInstant;
    reason: 'policy-denied' | 'user-denied' | 'cancelled';
}> | Readonly<{
    type: 'expire';
    at: AuthorityInstant;
}>;
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
export type GrantTerminationReason = 'authority-replaced' | 'credential-rotated' | 'recipe-drift' | 'user-revoked';
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
export type AuthorityLifecycleEffect = OpenAuthorityConsentEffect | CommitAuthorityGrantEffect | RecordGrantTerminationEffect;
export type AuthorityAuditFact = Readonly<{
    type: 'request-received';
    operationId: JournalOperationId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'request-parsed';
    operationId: JournalOperationId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'policy-accepted';
    operationId: JournalOperationId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'consent-requested';
    operationId: JournalOperationId;
    consentId: ConsentId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'consent-approved';
    operationId: JournalOperationId;
    consentId: ConsentId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'request-denied';
    operationId: JournalOperationId;
    at: AuthorityInstant;
    reason: AuthorityRequestDenial['reason'];
}> | Readonly<{
    type: 'request-expired';
    operationId: JournalOperationId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'grant-commit-requested';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'grant-activated';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'grant-recovery-required';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'grant-revoked';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
    reason: GrantTerminationReason;
}> | Readonly<{
    type: 'grant-expired';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}>;
export type AuthorityLifecycleWarning = Readonly<{
    code: 'authority-narrowed' | 'grant-expiry-clamped';
    message: string;
}>;
export type AuthorityRequestTerminal = null | Readonly<{
    outcome: 'approved';
    grantId: GrantId;
}> | Readonly<{
    outcome: 'denied';
    reason: AuthorityRequestDenial['reason'];
}> | Readonly<{
    outcome: 'expired';
}>;
export type AuthorityRequestTransition = Readonly<{
    state: AuthorityRequest;
    effects: readonly AuthorityLifecycleEffect[];
    audit: readonly AuthorityAuditFact[];
    warnings: readonly AuthorityLifecycleWarning[];
    terminal: AuthorityRequestTerminal;
}>;
export type OpenAuthorityRequestInput = Readonly<{
    operationId: JournalOperationId;
    requestWindow: AuthorityWindow;
}>;
export declare const openAuthorityRequest: (input: OpenAuthorityRequestInput) => AuthorityLifecycleResult<AuthorityRequestTransition>;
export declare const reduceAuthorityRequest: (state: AuthorityRequest, event: AuthorityRequestEvent) => AuthorityLifecycleResult<AuthorityRequestTransition>;
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
export type AuthorityGrant = PendingAuthorityGrant | ActiveAuthorityGrant | RevokedAuthorityGrant | ExpiredAuthorityGrant | RecoveryRequiredAuthorityGrant;
export type AuthorityGrantEvent = Readonly<{
    type: 'grant-persisted';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'grant-persistence-failed';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
    issues: JournalIssues;
}> | Readonly<{
    type: 'retry-persistence';
    grantId: GrantId;
    at: AuthorityInstant;
}> | Readonly<{
    type: 'revoke';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
    reason: GrantTerminationReason;
}> | Readonly<{
    type: 'expire';
    operationId: JournalOperationId;
    grantId: GrantId;
    at: AuthorityInstant;
}>;
export type AuthorityGrantTerminal = null | Readonly<{
    outcome: 'revoked';
    reason: GrantTerminationReason;
}> | Readonly<{
    outcome: 'expired';
}> | Readonly<{
    outcome: 'recovery-required';
}>;
export type AuthorityGrantTransition = Readonly<{
    state: AuthorityGrant;
    effects: readonly AuthorityLifecycleEffect[];
    audit: readonly AuthorityAuditFact[];
    warnings: readonly AuthorityLifecycleWarning[];
    terminal: AuthorityGrantTerminal;
}>;
export declare const deriveGrantFromApprovedRequest: (request: ApprovedAuthorityRequest) => AuthorityLifecycleResult<AuthorityGrantTransition>;
export declare const reduceAuthorityGrant: (state: AuthorityGrant, event: AuthorityGrantEvent) => AuthorityLifecycleResult<AuthorityGrantTransition>;
export {};
