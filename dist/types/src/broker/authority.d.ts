import type { BrokerRequestMessage } from '../broker-client/public.ts';
import type { AdmittedRecipe } from '../recipe-contract/public.ts';
import type { GrantCredentialBindingSet } from './journal.ts';
import { type CanonicalRepository, type CredentialSlotId, type GrantId, type RecipeRevision } from './primitives.ts';
import { type BrokerIssue, type BrokerResult } from './result.ts';
export type BrokerAuthorityTaskResult<T> = Promise<BrokerResult<T>>;
export declare const authorityTaskOk: <T>(value: T) => BrokerAuthorityTaskResult<T>;
export declare const authorityTaskErr: <T = never>(issue: BrokerIssue) => BrokerAuthorityTaskResult<T>;
export type ResolvedRecipe = Readonly<{
    repository: CanonicalRepository;
    relativePath: string;
    revision: RecipeRevision;
    credentialSlotIds: readonly CredentialSlotId[];
    admittedRecipe: AdmittedRecipe;
}>;
export type BrokerGrant = Readonly<{
    id: GrantId;
    generation: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialBindings: GrantCredentialBindingSet;
    expiresAtMs: number;
    revoked: boolean;
}>;
/**
 * Exact nonsecret authority facts admitted for downstream materialization.
 * Credential references are broker-authority input only and never cross this seam.
 */
export type AuthorizedGrant = Readonly<{
    id: GrantId;
    generation: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialSlotIds: readonly CredentialSlotId[];
    expiresAtMs: number;
    revoked: boolean;
}>;
export type AuthorizedExecution = Readonly<{
    request: BrokerRequestMessage;
    recipe: ResolvedRecipe;
    grant: AuthorizedGrant;
    admittedSlotIds: readonly CredentialSlotId[];
}>;
export type BrokerAuthorityPorts = Readonly<{
    canonicalizeRepository: (pathHint: string) => BrokerAuthorityTaskResult<CanonicalRepository>;
    resolveRecipe: (repository: CanonicalRepository, relativePathHint: string) => BrokerAuthorityTaskResult<ResolvedRecipe>;
    readGrant: (grantId: GrantId) => BrokerAuthorityTaskResult<BrokerGrant>;
}>;
export declare const authorizeExecution: (request: BrokerRequestMessage, recipe: ResolvedRecipe, grant: BrokerGrant, nowMs: number) => BrokerResult<AuthorizedExecution>;
export declare const resolveAndAuthorizeExecution: (request: BrokerRequestMessage, nowMs: number, ports: BrokerAuthorityPorts) => BrokerAuthorityTaskResult<AuthorizedExecution>;
