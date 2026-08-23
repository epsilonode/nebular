import {
  providerScopesContain,
  type ActiveAuthorityGrant,
  type CredentialReference,
  type ParsedAuthorityRequest,
  type PendingAuthorityGrant,
  type PolicyAcceptedAuthorityRequest,
  type ProviderContract,
  type ProviderScopeSet,
  type SecretTransferPlaintext
} from '../public.ts';

declare const parsedRequest: ParsedAuthorityRequest;
declare const pendingGrant: PendingAuthorityGrant;
declare const alphaContract: ProviderContract<'alpha', 'read'>;
declare const alphaScopes: ProviderScopeSet<'alpha', 'read'>;
declare const betaScopes: ProviderScopeSet<'beta', 'read'>;
declare const plaintextSecret: SecretTransferPlaintext;

// @ts-expect-error A parsed request cannot skip policy admission.
const illegallyAcceptedRequest: PolicyAcceptedAuthorityRequest = parsedRequest;

// @ts-expect-error A pending persistence state cannot be treated as active authority.
const illegallyActiveGrant: ActiveAuthorityGrant = pendingGrant;

// @ts-expect-error Provider-indexed scope sets cannot cross provider witnesses.
providerScopesContain<'alpha', 'read'>(alphaContract, alphaScopes, betaScopes);

// @ts-expect-error Scope authority cannot be fabricated without the private constructor seal.
const forgedScopeSet: ProviderScopeSet<'alpha', 'read'> = {
  providerId: 'alpha',
  values: ['read']
};

// @ts-expect-error Plaintext possession is not an opaque credential reference.
const exposedReference: CredentialReference = plaintextSecret;

export type CompileNegativeWitnesses = readonly [
  typeof illegallyAcceptedRequest,
  typeof illegallyActiveGrant,
  typeof forgedScopeSet,
  typeof exposedReference
];
