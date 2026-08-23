import type { BrokerRequestMessage } from '../broker-client/public.ts';
import type { CanonicalRepository, CredentialSlotId, GrantId, RecipeRevision } from './primitives.ts';
import { brokerErr, brokerOk, brokerTaskErr, type BrokerResult, type BrokerTaskResult } from './result.ts';

export type ResolvedRecipe = Readonly<{
  repository: CanonicalRepository;
  relativePath: string;
  revision: RecipeRevision;
  credentialSlotIds: readonly CredentialSlotId[];
}>;

export type BrokerGrant = Readonly<{
  id: GrantId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  credentialSlotIds: readonly CredentialSlotId[];
  expiresAtMs: number;
  revoked: boolean;
}>;

export type AuthorizedExecution = Readonly<{
  request: BrokerRequestMessage;
  recipe: ResolvedRecipe;
  grant: BrokerGrant;
  admittedSlotIds: readonly CredentialSlotId[];
}>;

export type BrokerAuthorityPorts = Readonly<{
  canonicalizeRepository: (pathHint: string) => BrokerTaskResult<CanonicalRepository>;
  resolveRecipe: (repository: CanonicalRepository, relativePathHint: string) => BrokerTaskResult<ResolvedRecipe>;
  readGrant: (repository: CanonicalRepository, revision: RecipeRevision) => BrokerTaskResult<BrokerGrant>;
}>;

const sameSet = (left: readonly string[], right: readonly string[]): boolean => {
  const normalizedLeft: readonly string[] = [...new Set(left)].toSorted();
  const normalizedRight: readonly string[] = [...new Set(right)].toSorted();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

export const authorizeExecution = (
  request: BrokerRequestMessage,
  recipe: ResolvedRecipe,
  grant: BrokerGrant,
  nowMs: number
): BrokerResult<AuthorizedExecution> => {
  if (request.payload.operation !== 'execute-recipe') {
    return brokerErr({ code: 'request-invalid', message: 'Request is not a recipe execution operation.' });
  }
  if (grant.revoked || grant.repository !== recipe.repository || grant.recipeRevision !== recipe.revision) {
    return brokerErr({ code: 'authority-denied', message: 'Repository-scoped recipe authority is unavailable.' });
  }
  if (grant.expiresAtMs <= nowMs) return brokerErr({ code: 'grant-expired', message: 'Repository-scoped recipe grant has expired.' });
  if (!sameSet(request.payload.credentialSlotIds, recipe.credentialSlotIds) ||
      !recipe.credentialSlotIds.every(slot => grant.credentialSlotIds.includes(slot))) {
    return brokerErr({ code: 'authority-denied', message: 'Requested credential slots exceed recipe or grant authority.' });
  }
  return brokerOk({ request, recipe, grant, admittedSlotIds: recipe.credentialSlotIds });
};

export const resolveAndAuthorizeExecution = (
  request: BrokerRequestMessage,
  nowMs: number,
  ports: BrokerAuthorityPorts
): BrokerTaskResult<AuthorizedExecution> => {
  const repositoryHint = request.payload.repositoryPathHint;
  const recipePathHint = request.payload.recipePathHint;
  const claimedRevision = request.payload.recipeRevision;
  if (repositoryHint === undefined || recipePathHint === undefined || claimedRevision === undefined) {
    return brokerTaskErr({ code: 'request-invalid', message: 'Recipe execution request is incomplete.' });
  }
  return ports.canonicalizeRepository(repositoryHint)
    .andThen(repository => ports.resolveRecipe(repository, recipePathHint))
    .andThen(recipe => claimedRevision === recipe.revision
      ? ports.readGrant(recipe.repository, recipe.revision).andThen(grant => authorizeExecution(request, recipe, grant, nowMs))
      : brokerErr({ code: 'recipe-drift', message: 'Caller recipe revision does not match broker-resolved recipe.' }));
};
