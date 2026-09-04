import {
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  type AdmittedRecipe,
  type RecipeRevision as ContractRecipeRevision,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';
import type {
  CurrentBootstrapRecipeAuthority,
  VerifiedBootstrapReceiverAttempt
} from './bootstrap-authority.ts';
import {
  parseCheckedInRecipeLocator,
  type CheckedInRecipeLocator
} from './journal.ts';
import {
  parseCredentialSlotId,
  parseRecipeRevision,
  type CanonicalRepository
} from './primitives.ts';
import {
  brokerErr,
  brokerOk,
  brokerTry,
  type BrokerIssue,
  type BrokerResult
} from './result.ts';

export type CurrentRecipeTaskResult<T> = Promise<BrokerResult<T>>;

export const currentRecipeTaskOk = <T>(value: T): CurrentRecipeTaskResult<T> =>
  Promise.resolve(brokerOk(value));

export const currentRecipeTaskErr = <T = never>(issue: BrokerIssue): CurrentRecipeTaskResult<T> =>
  Promise.resolve(brokerErr(issue));

export type CanonicalGitWorktree = Readonly<{
  state: 'canonical-git-worktree';
  canonicalRepository: CanonicalRepository;
}>;

export type CanonicalGitWorktreeOutcome =
  | Readonly<{ status: 'resolved'; worktree: CanonicalGitWorktree }>
  | Readonly<{ status: 'not-git-worktree' }>
  | Readonly<{ status: 'ambiguous-worktree' }>
  | Readonly<{ status: 'unavailable' }>;

export type CurrentRecipeWorktreePort = Readonly<{
  resolveCanonicalWorktree: (
    expectedRepository: CanonicalRepository
  ) => CurrentRecipeTaskResult<CanonicalGitWorktreeOutcome>;
}>;

export type CheckedInRecipeReadRequest = Readonly<{
  worktree: CanonicalGitWorktree;
  expectedRelativeLocator: CheckedInRecipeLocator;
}>;

export type CheckedInRecipeFileOutcome =
  | Readonly<{
      status: 'checked-in-regular-file';
      relativeLocator: string;
      xml: string;
    }>
  | Readonly<{ status: 'untracked' }>
  | Readonly<{ status: 'symlink' }>
  | Readonly<{ status: 'path-escape' }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'not-regular-file' }>
  | Readonly<{ status: 'unavailable' }>;

export type CurrentRecipeCheckedInFilePort = Readonly<{
  readCheckedInRegularFile: (
    request: CheckedInRecipeReadRequest
  ) => CurrentRecipeTaskResult<CheckedInRecipeFileOutcome>;
}>;

export type CurrentRecipeSha256Port = RecipeRevisionDigestPort;

export type BrokerCurrentRecipePorts = Readonly<{
  worktrees: CurrentRecipeWorktreePort;
  files: CurrentRecipeCheckedInFilePort;
  sha256: CurrentRecipeSha256Port;
}>;

export type BrokerCurrentRecipeResolver = Readonly<{
  resolveCurrentRecipe: (
    attempt: VerifiedBootstrapReceiverAttempt
  ) => CurrentRecipeTaskResult<CurrentBootstrapRecipeAuthority>;
}>;

const recipeDrift = <T>(message: string): BrokerResult<T> =>
  brokerErr({ code: 'recipe-drift', message });

const repositoryInvalid = <T>(message: string): BrokerResult<T> =>
  brokerErr({ code: 'repository-invalid', message });

const projectRecipeResult = <T>(result: RecipeRunnerResult<T>): BrokerResult<T> => result.isOk()
  ? brokerOk(result.value)
  : recipeDrift('The current checked-in recipe does not satisfy its canonical contract.');

const worktreeResult = (
  expectedRepository: CanonicalRepository,
  outcome: CanonicalGitWorktreeOutcome
): BrokerResult<CanonicalGitWorktree> => {
  switch (outcome.status) {
    case 'resolved':
      return outcome.worktree.canonicalRepository === expectedRepository
        ? brokerOk(outcome.worktree)
        : repositoryInvalid('Canonical Git worktree identity drifted from durable authority.');
    case 'not-git-worktree':
      return repositoryInvalid('Durable recipe authority no longer resolves to a Git worktree.');
    case 'ambiguous-worktree':
      return repositoryInvalid('Git worktree resolution is ambiguous.');
    case 'unavailable':
      return repositoryInvalid('Canonical Git worktree resolution is unavailable.');
  }
};

const checkedInFileResult = (
  outcome: CheckedInRecipeFileOutcome
): BrokerResult<Extract<CheckedInRecipeFileOutcome, { status: 'checked-in-regular-file' }>> => {
  switch (outcome.status) {
    case 'checked-in-regular-file': return brokerOk(outcome);
    case 'untracked': return recipeDrift('The current recipe is not checked in.');
    case 'symlink': return repositoryInvalid('The current recipe resolves through a symbolic link.');
    case 'path-escape': return repositoryInvalid('The current recipe path escapes its canonical Git worktree.');
    case 'missing': return recipeDrift('The current checked-in recipe is missing.');
    case 'not-regular-file': return repositoryInvalid('The current recipe is not a regular file.');
    case 'unavailable': return repositoryInvalid('The checked-in recipe could not be read.');
  }
};

const exactLocator = (
  candidate: string,
  expected: CheckedInRecipeLocator
): BrokerResult<CheckedInRecipeLocator> => {
  const parsed = parseCheckedInRecipeLocator(candidate);
  return parsed.type === 'ok' && parsed.value.value === expected.value
    ? brokerOk(parsed.value)
    : recipeDrift('The current checked-in recipe locator drifted from durable authority.');
};

type CurrentRecipeSlot = CurrentBootstrapRecipeAuthority['slots'][number];

const currentSlot = (
  slotIdValue: string,
  environmentName: string
): BrokerResult<CurrentRecipeSlot> => {
  const slotId = parseCredentialSlotId(slotIdValue);
  return slotId.isOk()
    ? brokerOk({ slotId: slotId.value, environmentName })
    : recipeDrift('The current recipe contains an invalid credential-slot identity.');
};

const currentSlots = (recipe: AdmittedRecipe): BrokerResult<readonly CurrentRecipeSlot[]> =>
  recipe.semantic.credentialSlots.reduce<BrokerResult<readonly CurrentRecipeSlot[]>>(
    (resolved, slot) => resolved.andThen(slots =>
      currentSlot(slot.id.value, slot.inject.value).map(current => [...slots, current] as const)
    ),
    brokerOk([])
  );

const currentAuthority = (
  attempt: VerifiedBootstrapReceiverAttempt,
  file: Extract<CheckedInRecipeFileOutcome, { status: 'checked-in-regular-file' }>,
  sha256: CurrentRecipeSha256Port
): BrokerResult<CurrentBootstrapRecipeAuthority> => {
  const relativePath = exactLocator(file.relativeLocator, attempt.recipeLocator);
  if (relativePath.isErr()) return brokerErr(...relativePath.error);
  const recipe = projectRecipeResult<AdmittedRecipe>(decodeAndAdmitRecipeXml(file.xml));
  if (recipe.isErr()) return brokerErr(...recipe.error);
  const contractRevision = projectRecipeResult<ContractRecipeRevision>(computeRecipeRevision(recipe.value, sha256));
  if (contractRevision.isErr()) return brokerErr(...contractRevision.error);
  const recipeRevision = parseRecipeRevision(contractRevision.value.value);
  if (recipeRevision.isErr() || recipeRevision.value !== attempt.recipeRevision) {
    return recipeDrift('The current checked-in recipe revision drifted from durable authority.');
  }
  const slots = currentSlots(recipe.value);
  return slots.isErr()
    ? brokerErr(...slots.error)
    : brokerOk({
        state: 'current-checked-in-recipe',
        repository: attempt.repository,
        recipeRevision: recipeRevision.value,
        relativePath: relativePath.value,
        slots: slots.value
      });
};

const portFailureIssue = (): BrokerIssue => ({
  code: 'repository-invalid',
  message: 'The current Git recipe authority port failed.'
});

const invokeCurrentRecipePort = <T>(
  effect: () => CurrentRecipeTaskResult<T>
): CurrentRecipeTaskResult<T> => {
  const issue = portFailureIssue();
  const invoked = brokerTry(effect, issue);
  return invoked.isErr()
    ? Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)))
    : invoked.value.then(
        result => result,
        () => brokerErr(issue)
      );
};

const resolveCheckedInAuthority = (
  attempt: VerifiedBootstrapReceiverAttempt,
  worktree: CanonicalGitWorktree,
  ports: BrokerCurrentRecipePorts
): CurrentRecipeTaskResult<CurrentBootstrapRecipeAuthority> => invokeCurrentRecipePort(
  () => ports.files.readCheckedInRegularFile({
    worktree,
    expectedRelativeLocator: attempt.recipeLocator
  })
).then(result => result
  .andThen(checkedInFileResult)
  .andThen(file => currentAuthority(attempt, file, ports.sha256)));

export const createBrokerCurrentRecipeResolver = (
  ports: BrokerCurrentRecipePorts
): BrokerCurrentRecipeResolver => ({
  resolveCurrentRecipe: attempt => invokeCurrentRecipePort(
    () => ports.worktrees.resolveCanonicalWorktree(attempt.repository)
  ).then(result => {
    const worktree = result.andThen(outcome => worktreeResult(attempt.repository, outcome));
    return worktree.isErr()
      ? brokerErr<CurrentBootstrapRecipeAuthority>(worktree.error[0], ...worktree.error.slice(1))
      : resolveCheckedInAuthority(attempt, worktree.value, ports);
  })
});
