import { isAbsolute, relative, sep } from 'node:path';

import {
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  type AdmittedRecipe,
  type RecipeRevision as ContractRecipeRevision,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';
import type {
  BrokerAuthorityPorts,
  BrokerAuthorityTaskResult,
  BrokerGrant,
  ResolvedRecipe
} from './authority.ts';
import type { CheckedInRecipeFileOutcome } from './current-recipe.ts';
import {
  createBunGitCurrentRecipeRuntime,
  createGitCurrentRecipePorts,
  GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES,
  GIT_RECIPE_DEFAULT_DEADLINE_MS,
  GIT_RECIPE_MAX_BLOB_LIMIT_BYTES,
  GIT_RECIPE_MAX_DEADLINE_MS,
  GIT_RECIPE_METADATA_LIMIT_BYTES,
  GIT_RECIPE_STDERR_LIMIT_BYTES,
  type GitCommandOutcome,
  type GitCurrentRecipeOptions,
  type GitCurrentRecipeRuntime
} from './git-current-recipe.ts';
import {
  parseCheckedInRecipeLocator,
  type GrantJournal,
  type GrantJournalRecord,
  type JournalResult
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId
} from './primitives.ts';
import {
  brokerErr,
  brokerOk,
  brokerTry,
  type BrokerIssue,
  type BrokerResult
} from './result.ts';

export type GitJournalExecutionAuthorityOptions = Readonly<{
  git: GitCurrentRecipeOptions;
  grants: Pick<GrantJournal, 'readGrant'>;
  sha256: RecipeRevisionDigestPort;
}>;

const repositoryIssue = (): BrokerIssue => ({
  code: 'repository-invalid',
  message: 'Caller repository authority could not be resolved through Git.'
});

const recipeIssue = (): BrokerIssue => ({
  code: 'recipe-drift',
  message: 'The selected checked-in recipe does not satisfy its canonical contract.'
});

const authorityIssue = (): BrokerIssue => ({
  code: 'authority-denied',
  message: 'Repository-scoped recipe authority is unavailable.'
});

const rejected = <T>(issue: BrokerIssue): BrokerResult<T> => brokerErr(issue);

const projectForeignTask = <Foreign, Value>(
  effect: () => Promise<Foreign>,
  project: (result: Foreign) => BrokerResult<Value>,
  issue: BrokerIssue
): BrokerAuthorityTaskResult<Value> => {
  const invoked = brokerTry(effect, issue);
  if (invoked.isErr()) return Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)));
  return invoked.value.then(
    result => brokerTry(() => project(result), issue).match(
      projected => projected,
      errors => brokerErr(errors[0], ...errors.slice(1))
    ),
    () => rejected(issue)
  );
};

const projectRecipeContract = <T>(result: RecipeRunnerResult<T>): BrokerResult<T> =>
  result.isOk() ? brokerOk(result.value) : rejected(recipeIssue());

const invokeRecipeContract = <T>(
  effect: () => RecipeRunnerResult<T>
): BrokerResult<T> => brokerTry(effect, recipeIssue()).andThen(projectRecipeContract);

type ValidHintGitConfiguration = Readonly<{
  gitExecutable: string;
  deadlineMs: number;
}>;

const isWellFormedUnicode = (value: string): boolean => Array.from(value).every(character => {
  const firstCodeUnit = character.charCodeAt(0);
  return character.length === 2 || firstCodeUnit < 0xD800 || firstCodeUnit > 0xDFFF;
});

const isPositiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const isLocalAbsolutePath = (path: string): boolean => isAbsolute(path) &&
  (process.platform !== 'win32' || !/^[\\/]{2}/u.test(path));

const hintGitConfiguration = (
  options: GitCurrentRecipeOptions,
  runtime: GitCurrentRecipeRuntime
): ValidHintGitConfiguration | null => {
  const deadlineMs = options.deadlineMs ?? GIT_RECIPE_DEFAULT_DEADLINE_MS;
  const blobLimitBytes = options.blobLimitBytes ?? GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES;
  if (!isLocalAbsolutePath(options.gitExecutable) || options.gitExecutable.length > 32_767 ||
      options.gitExecutable.includes('\0') || !isWellFormedUnicode(options.gitExecutable) ||
      !isPositiveBound(deadlineMs, GIT_RECIPE_MAX_DEADLINE_MS) ||
      !isPositiveBound(blobLimitBytes, GIT_RECIPE_MAX_BLOB_LIMIT_BYTES)) {
    return null;
  }
  const canonicalExecutable = runtime.canonicalizeExistingPath(options.gitExecutable);
  return canonicalExecutable !== null && isLocalAbsolutePath(canonicalExecutable) &&
    runtime.pathsEqual(options.gitExecutable, canonicalExecutable)
    ? { gitExecutable: canonicalExecutable, deadlineMs }
    : null;
};

const validGitArgument = (value: string): boolean =>
  value.length <= 32_767 && !value.includes('\0') && isWellFormedUnicode(value);

const runHintGit = (
  configuration: ValidHintGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  expiresAtMonotonicMs: number,
  repositoryHint: string,
  command: readonly string[]
): GitCommandOutcome => {
  const timeoutMs = Math.floor(expiresAtMonotonicMs - runtime.monotonicNowMs());
  const argv: readonly string[] = [
    '--no-replace-objects',
    '--literal-pathspecs',
    '-c',
    'core.quotepath=false',
    '-C',
    repositoryHint,
    ...command
  ];
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !argv.every(validGitArgument)) {
    return { status: 'failed' };
  }
  const outcome = runtime.run({
    executable: configuration.gitExecutable,
    argv,
    timeoutMs,
    stdoutLimitBytes: GIT_RECIPE_METADATA_LIMIT_BYTES,
    stderrLimitBytes: GIT_RECIPE_STDERR_LIMIT_BYTES
  });
  return outcome.status === 'exited' && Number.isSafeInteger(outcome.exitCode) &&
    outcome.stdout.byteLength <= GIT_RECIPE_METADATA_LIMIT_BYTES &&
    Number.isSafeInteger(outcome.stderrByteLength) && outcome.stderrByteLength >= 0 &&
    outcome.stderrByteLength <= GIT_RECIPE_STDERR_LIMIT_BYTES
    ? outcome
    : { status: 'failed' };
};

const oneOutputLine = (outcome: GitCommandOutcome): string | null => {
  if (outcome.status !== 'exited' || outcome.exitCode !== 0) return null;
  const decoded = brokerTry(
    () => new TextDecoder('utf-8', { fatal: true }).decode(outcome.stdout),
    repositoryIssue()
  );
  if (decoded.isErr()) return null;
  const value = decoded.value.endsWith('\r\n')
    ? decoded.value.slice(0, -2)
    : decoded.value.endsWith('\n')
      ? decoded.value.slice(0, -1)
      : decoded.value;
  return value.length > 0 && !value.includes('\r') && !value.includes('\n') ? value : null;
};

const pathIsWithin = (
  root: string,
  candidate: string,
  runtime: GitCurrentRecipeRuntime
): boolean => {
  if (runtime.pathsEqual(root, candidate)) return true;
  const suffix = relative(root, candidate);
  return suffix.length > 0 && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
};

const resolveRepositoryHint = (
  configuration: ValidHintGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  pathHint: string
): BrokerResult<CanonicalRepository> => {
  if (!isAbsolute(pathHint) || !validGitArgument(pathHint)) return rejected(repositoryIssue());
  const canonicalHint = runtime.canonicalizeExistingPath(pathHint);
  if (canonicalHint === null || !isAbsolute(canonicalHint) || !validGitArgument(canonicalHint)) {
    return rejected(repositoryIssue());
  }
  const expiresAt = runtime.monotonicNowMs() + configuration.deadlineMs;
  const inside = runHintGit(configuration, runtime, expiresAt, canonicalHint, ['rev-parse', '--is-inside-work-tree']);
  if (oneOutputLine(inside) !== 'true') return rejected(repositoryIssue());
  const bare = runHintGit(configuration, runtime, expiresAt, canonicalHint, ['rev-parse', '--is-bare-repository']);
  if (oneOutputLine(bare) !== 'false') return rejected(repositoryIssue());
  const root = runHintGit(configuration, runtime, expiresAt, canonicalHint, [
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel'
  ]);
  const rootValue = oneOutputLine(root);
  const canonicalRoot = rootValue === null ? null : runtime.canonicalizeExistingPath(rootValue);
  if (canonicalRoot === null || !isAbsolute(canonicalRoot) || !validGitArgument(canonicalRoot) ||
      !pathIsWithin(canonicalRoot, canonicalHint, runtime)) {
    return rejected(repositoryIssue());
  }
  const parsed = parseCanonicalRepository(canonicalRoot);
  return parsed.isOk() ? brokerOk(parsed.value) : rejected(repositoryIssue());
};

type CheckedInRecipeFile = Extract<
  CheckedInRecipeFileOutcome,
  { status: 'checked-in-regular-file' }
>;

const checkedInRecipeFile = (
  outcome: CheckedInRecipeFileOutcome
): BrokerResult<CheckedInRecipeFile> => {
  switch (outcome.status) {
    case 'checked-in-regular-file': return brokerOk(outcome);
    case 'untracked': return rejected(recipeIssue());
    case 'missing': return rejected(recipeIssue());
    case 'symlink': return rejected(repositoryIssue());
    case 'path-escape': return rejected(repositoryIssue());
    case 'not-regular-file': return rejected(repositoryIssue());
    case 'unavailable': return rejected(repositoryIssue());
  }
};

const brokerSlot = (slotId: string): BrokerResult<CredentialSlotId> => {
  const parsed = parseCredentialSlotId(slotId);
  return parsed.isOk() ? brokerOk(parsed.value) : rejected(recipeIssue());
};

const brokerSlots = (recipe: AdmittedRecipe): BrokerResult<readonly CredentialSlotId[]> =>
  recipe.semantic.credentialSlots.reduce<BrokerResult<readonly CredentialSlotId[]>>(
    (resolved, slot) => resolved.andThen(slots => brokerSlot(slot.id.value).map(current => Object.freeze([...slots, current]))),
    brokerOk([])
  );

const admittedRecipe = (xml: string): BrokerResult<AdmittedRecipe> =>
  invokeRecipeContract(() => decodeAndAdmitRecipeXml(xml));

const contractRevision = (
  recipe: AdmittedRecipe,
  sha256: RecipeRevisionDigestPort
): BrokerResult<ContractRecipeRevision> =>
  invokeRecipeContract(() => computeRecipeRevision(recipe, sha256));

const resolvedRecipe = (
  repository: CanonicalRepository,
  expectedRelativePath: string,
  file: CheckedInRecipeFile,
  sha256: RecipeRevisionDigestPort
): BrokerResult<ResolvedRecipe> => {
  if (file.relativeLocator !== expectedRelativePath) return rejected<ResolvedRecipe>(repositoryIssue());
  return admittedRecipe(file.xml).andThen(recipe => contractRevision(recipe, sha256).andThen(revision => {
    const brokerRevision = parseRecipeRevision(revision.value);
    if (brokerRevision.isErr()) return rejected<ResolvedRecipe>(recipeIssue());
    return brokerSlots(recipe).map<ResolvedRecipe>(credentialSlotIds => ({
      repository,
      relativePath: expectedRelativePath,
      revision: brokerRevision.value,
      credentialSlotIds,
      admittedRecipe: recipe
    }));
  }));
};

const journalGrant = (
  selectedGrantId: GrantId,
  result: JournalResult<GrantJournalRecord | null>
): BrokerResult<BrokerGrant> => {
  if (result.type === 'err') return rejected(authorityIssue());
  if (result.value === null) {
    return brokerErr({ code: 'grant-missing', message: 'The selected repository-scoped grant does not exist.' });
  }
  if (result.value.id !== selectedGrantId) return rejected(authorityIssue());
  return brokerOk({
    id: result.value.id,
    generation: result.value.generation,
    repository: result.value.repository,
    recipeRevision: result.value.recipeRevision,
    credentialBindings: result.value.credentialBindings,
    expiresAtMs: result.value.expiresAtMs,
    revoked: result.value.state === 'revoked'
  });
};

export const createGitJournalExecutionAuthorityPorts = (
  options: GitJournalExecutionAuthorityOptions,
  runtime?: GitCurrentRecipeRuntime
): BrokerAuthorityPorts => {
  const setup = brokerTry(() => {
    const effectiveRuntime = runtime ?? createBunGitCurrentRecipeRuntime();
    return {
      effectiveRuntime,
      configuration: hintGitConfiguration(options.git, effectiveRuntime),
      files: createGitCurrentRecipePorts(options.git, effectiveRuntime).files
    };
  }, repositoryIssue());
  return {
    canonicalizeRepository: pathHint => setup.isErr()
      ? Promise.resolve(rejected(repositoryIssue()))
      : projectForeignTask(
          () => Promise.resolve(setup.value.configuration === null
            ? rejected<CanonicalRepository>(repositoryIssue())
            : resolveRepositoryHint(setup.value.configuration, setup.value.effectiveRuntime, pathHint)),
          result => result,
          repositoryIssue()
        ),
    resolveRecipe: (repository, relativePathHint) => {
      if (setup.isErr()) return Promise.resolve(rejected(repositoryIssue()));
      const locator = parseCheckedInRecipeLocator(relativePathHint);
      if (locator.type === 'err') {
        return Promise.resolve(brokerErr({ code: 'request-invalid', message: 'Recipe path hint is invalid.' }));
      }
      return projectForeignTask(
        () => setup.value.files.readCheckedInRegularFile({
          worktree: { state: 'canonical-git-worktree', canonicalRepository: repository },
          expectedRelativeLocator: locator.value
        }),
        result => result
          .andThen(checkedInRecipeFile)
          .andThen(file => resolvedRecipe(repository, locator.value.value, file, options.sha256)),
        repositoryIssue()
      );
    },
    readGrant: grantId => projectForeignTask(
      () => options.grants.readGrant(grantId),
      result => journalGrant(grantId, result),
      authorityIssue()
    )
  };
};
