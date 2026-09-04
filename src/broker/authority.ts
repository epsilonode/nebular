import type { BrokerRequestMessage } from '../broker-client/public.ts';
import type { AdmittedRecipe } from '../recipe-contract/public.ts';
import type { GrantCredentialBindingSet } from './journal.ts';
import {
  parseGrantId,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type RecipeRevision
} from './primitives.ts';
import { brokerErr, brokerOk, brokerTry, type BrokerIssue, type BrokerResult } from './result.ts';

export type BrokerAuthorityTaskResult<T> = Promise<BrokerResult<T>>;

export const authorityTaskOk = <T>(value: T): BrokerAuthorityTaskResult<T> =>
  Promise.resolve(brokerOk(value));

export const authorityTaskErr = <T = never>(issue: BrokerIssue): BrokerAuthorityTaskResult<T> =>
  Promise.resolve(brokerErr(issue));

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
  resolveRecipe: (
    repository: CanonicalRepository,
    relativePathHint: string
  ) => BrokerAuthorityTaskResult<ResolvedRecipe>;
  readGrant: (
    grantId: GrantId
  ) => BrokerAuthorityTaskResult<BrokerGrant>;
}>;

const sameSet = (left: readonly string[], right: readonly string[]): boolean => {
  const normalizedLeft: readonly string[] = [...new Set(left)].toSorted();
  const normalizedRight: readonly string[] = [...new Set(right)].toSorted();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const exactGrantBindings = (
  bindings: GrantCredentialBindingSet,
  slotIds: readonly CredentialSlotId[]
): boolean => {
  const bindingSlotIds: readonly CredentialSlotId[] = bindings.map(binding => binding.slotId);
  return bindings.length === slotIds.length && new Set(bindingSlotIds).size === bindings.length &&
    bindings.every(binding => binding.credentialReference.value.length > 0 &&
      binding.credentialReference.value.length <= 256 &&
      !binding.credentialReference.value.includes('\0')) && sameSet(bindingSlotIds, slotIds);
};

const projectAuthorizedGrant = (grant: BrokerGrant): AuthorizedGrant => ({
  id: grant.id,
  generation: grant.generation,
  repository: grant.repository,
  recipeRevision: grant.recipeRevision,
  credentialSlotIds: grant.credentialBindings
    .map(binding => binding.slotId)
    .toSorted(),
  expiresAtMs: grant.expiresAtMs,
  revoked: grant.revoked
});

export const authorizeExecution = (
  request: BrokerRequestMessage,
  recipe: ResolvedRecipe,
  grant: BrokerGrant,
  nowMs: number
): BrokerResult<AuthorizedExecution> => {
  if (request.payload.operation !== 'execute-recipe') {
    return brokerErr({ code: 'request-invalid', message: 'Request is not a recipe execution operation.' });
  }
  const selectedGrant = parseGrantId(request.payload.grantIdHint);
  if (selectedGrant.isErr()) return brokerErr(selectedGrant.error[0], ...selectedGrant.error.slice(1));
  const admittedRecipeSlotIds: readonly string[] = recipe.admittedRecipe.semantic.credentialSlots.map(slot => slot.id.value);
  if (grant.id !== selectedGrant.value || !Number.isSafeInteger(grant.generation) || grant.generation <= 0 ||
      grant.revoked || grant.repository !== recipe.repository ||
      grant.recipeRevision !== recipe.revision || !sameSet(recipe.credentialSlotIds, admittedRecipeSlotIds)) {
    return brokerErr({ code: 'authority-denied', message: 'Repository-scoped recipe authority is unavailable.' });
  }
  if (grant.expiresAtMs <= nowMs) return brokerErr({ code: 'grant-expired', message: 'Repository-scoped recipe grant has expired.' });
  if (!sameSet(request.payload.credentialSlotIds, recipe.credentialSlotIds) ||
      !exactGrantBindings(grant.credentialBindings, recipe.credentialSlotIds)) {
    return brokerErr({ code: 'authority-denied', message: 'Requested credential slots exceed recipe or grant authority.' });
  }
  return brokerOk({
    request,
    recipe,
    grant: projectAuthorizedGrant(grant),
    admittedSlotIds: recipe.credentialSlotIds
  });
};

const authorityPortFailureIssue = (): BrokerIssue => ({
  code: 'authority-denied',
  message: 'Repository-scoped recipe authority is unavailable.'
});

const invokeAuthorityPort = <T>(
  effect: () => BrokerAuthorityTaskResult<T>
): BrokerAuthorityTaskResult<T> => {
  const issue = authorityPortFailureIssue();
  const invoked = brokerTry(effect, issue);
  return invoked.isErr()
    ? Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)))
    : invoked.value.then(
        result => result,
        () => brokerErr(issue)
      );
};

const readGrantAndAuthorize = (
  request: BrokerRequestMessage,
  recipe: ResolvedRecipe,
  grantId: GrantId,
  nowMs: number,
  ports: BrokerAuthorityPorts
): BrokerAuthorityTaskResult<AuthorizedExecution> => invokeAuthorityPort(
  () => ports.readGrant(grantId)
).then(result => result.andThen(grant => authorizeExecution(request, recipe, grant, nowMs)));

const resolveRecipeAndAuthorize = (
  request: BrokerRequestMessage,
  repository: CanonicalRepository,
  recipePathHint: string,
  claimedRevision: string,
  grantId: GrantId,
  nowMs: number,
  ports: BrokerAuthorityPorts
): BrokerAuthorityTaskResult<AuthorizedExecution> => invokeAuthorityPort(
  () => ports.resolveRecipe(repository, recipePathHint)
).then(result => {
  if (result.isErr()) return brokerErr<AuthorizedExecution>(result.error[0], ...result.error.slice(1));
  return claimedRevision === result.value.revision
    ? readGrantAndAuthorize(request, result.value, grantId, nowMs, ports)
    : brokerErr({ code: 'recipe-drift', message: 'Caller recipe revision does not match broker-resolved recipe.' });
});

export const resolveAndAuthorizeExecution = (
  request: BrokerRequestMessage,
  nowMs: number,
  ports: BrokerAuthorityPorts
): BrokerAuthorityTaskResult<AuthorizedExecution> => {
  if (request.payload.operation !== 'execute-recipe') {
    return authorityTaskErr({ code: 'request-invalid', message: 'Request is not a recipe execution operation.' });
  }
  const repositoryHint = request.payload.repositoryPathHint;
  const recipePathHint = request.payload.recipePathHint;
  const claimedRevision = request.payload.recipeRevision;
  if (repositoryHint === undefined || recipePathHint === undefined || claimedRevision === undefined) {
    return authorityTaskErr({ code: 'request-invalid', message: 'Recipe execution request is incomplete.' });
  }
  const grantId = parseGrantId(request.payload.grantIdHint);
  if (grantId.isErr()) return authorityTaskErr(grantId.error[0]);
  return invokeAuthorityPort(
    () => ports.canonicalizeRepository(repositoryHint)
  ).then(result => result.isErr()
    ? brokerErr<AuthorizedExecution>(result.error[0], ...result.error.slice(1))
    : resolveRecipeAndAuthorize(request, result.value, recipePathHint, claimedRevision, grantId.value, nowMs, ports));
};
