import { createHash } from 'node:crypto';

import { recipeOk, type RecipeRevisionDigestPort } from '../recipe-contract/public.ts';
import type { BrokerAuthorityPorts } from './authority.ts';
import {
  createBunSqliteAuthorityJournal,
  createWindowsProfilePathPort,
  type BunSqliteJournalOptions
} from './bun-sqlite-journal.ts';
import {
  createBunWindowsKnownFolderRuntimePort,
  createWindowsKnownFolderLocalApplicationDataPort,
  type WindowsKnownFolderRuntimePort
} from './bun-windows-profile.ts';
import {
  createGitJournalExecutionAuthorityPorts,
  type GitJournalExecutionAuthorityOptions
} from './git-journal-execution-authority.ts';
import {
  createBunGitCurrentRecipeRuntime,
  GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES,
  GIT_RECIPE_MAX_BLOB_LIMIT_BYTES,
  type GitCurrentRecipeRuntime
} from './git-current-recipe.ts';
import {
  journalOk,
  type AuthorityJournal,
  type TrustedLocalApplicationDataPort,
  type TrustedProfileRoot
} from './journal.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';
import {
  createWindowsBrokerHostConfigurationPort,
  createWindowsBrokerHostConfigurationRuntime,
  type BrokerHostConfigurationRuntimePort,
  type CanonicalGitExecutable
} from './windows-host-configuration.ts';
import type { WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION } from './windows-bootstrap-composition.ts';

export const WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION:
  typeof WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION = 'epsilonode-nebular-v1';
export const WINDOWS_EXECUTION_AUTHORITY_DEFAULT_ADAPTER_TIMEOUT_MS = 2_000;
export const WINDOWS_EXECUTION_AUTHORITY_MAX_ADAPTER_TIMEOUT_MS = 10_000;
export const WINDOWS_EXECUTION_AUTHORITY_DEFAULT_JOURNAL_BUSY_TIMEOUT_MS = 250;
export const WINDOWS_EXECUTION_AUTHORITY_MAX_JOURNAL_BUSY_TIMEOUT_MS = 5_000;

export type WindowsExecutionAuthorityContextOptions = Readonly<{
  adapterTimeoutMs?: number;
  recipeBlobLimitBytes?: number;
  journalBusyTimeoutMs?: number;
}>;

export type WindowsExecutionAuthorityJournalFactoryPort = Readonly<{
  create: (options: BunSqliteJournalOptions) => AuthorityJournal;
}>;

export type WindowsExecutionAuthorityFactoryPort = Readonly<{
  create: (
    options: GitJournalExecutionAuthorityOptions,
    runtime: GitCurrentRecipeRuntime
  ) => BrokerAuthorityPorts;
}>;

export type WindowsExecutionAuthorityContextRuntime = Readonly<{
  platform: string;
  knownFolder: WindowsKnownFolderRuntimePort;
  hostConfiguration: BrokerHostConfigurationRuntimePort;
  git: GitCurrentRecipeRuntime;
  journals: WindowsExecutionAuthorityJournalFactoryPort;
  authorities: WindowsExecutionAuthorityFactoryPort;
  clock: Readonly<{ nowMs: () => number }>;
}>;

export type WindowsExecutionAuthorityContext = Readonly<{
  authority: BrokerAuthorityPorts;
  journal: AuthorityJournal;
  trustedProfileRoot: TrustedProfileRoot;
  gitExecutable: CanonicalGitExecutable;
}>;

type ValidWindowsExecutionAuthorityContextOptions = Readonly<{
  adapterTimeoutMs: number;
  recipeBlobLimitBytes: number;
  journalBusyTimeoutMs: number;
}>;

const contextFailure = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'bootstrap-failed',
  message: 'The Windows execution authority context is unavailable.'
});

const validPositiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const validateOptions = (
  options: WindowsExecutionAuthorityContextOptions
): BrokerResult<ValidWindowsExecutionAuthorityContextOptions> => {
  const adapterTimeoutMs = options.adapterTimeoutMs ??
    WINDOWS_EXECUTION_AUTHORITY_DEFAULT_ADAPTER_TIMEOUT_MS;
  const recipeBlobLimitBytes = options.recipeBlobLimitBytes ??
    GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES;
  const journalBusyTimeoutMs = options.journalBusyTimeoutMs ??
    WINDOWS_EXECUTION_AUTHORITY_DEFAULT_JOURNAL_BUSY_TIMEOUT_MS;
  return validPositiveBound(adapterTimeoutMs, WINDOWS_EXECUTION_AUTHORITY_MAX_ADAPTER_TIMEOUT_MS) &&
    validPositiveBound(recipeBlobLimitBytes, GIT_RECIPE_MAX_BLOB_LIMIT_BYTES) &&
    validPositiveBound(journalBusyTimeoutMs, WINDOWS_EXECUTION_AUTHORITY_MAX_JOURNAL_BUSY_TIMEOUT_MS)
    ? brokerOk({ adapterTimeoutMs, recipeBlobLimitBytes, journalBusyTimeoutMs })
    : contextFailure();
};

const recipeRevisionDigest: RecipeRevisionDigestPort = {
  sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
};

const fixedLocalApplicationData = (
  root: TrustedProfileRoot
): TrustedLocalApplicationDataPort => ({
  resolveCurrentUserRoot: () => Promise.resolve(journalOk(root))
});

export const createWindowsExecutionAuthorityContextRuntime = (): WindowsExecutionAuthorityContextRuntime => ({
  platform: process.platform,
  knownFolder: createBunWindowsKnownFolderRuntimePort(),
  hostConfiguration: createWindowsBrokerHostConfigurationRuntime(),
  git: createBunGitCurrentRecipeRuntime(),
  journals: { create: createBunSqliteAuthorityJournal },
  authorities: {
    create: (options, runtime) => createGitJournalExecutionAuthorityPorts(options, runtime)
  },
  clock: { nowMs: () => Date.now() }
});

const composeContext = (
  options: ValidWindowsExecutionAuthorityContextOptions,
  runtime: WindowsExecutionAuthorityContextRuntime,
  trustedProfileRoot: TrustedProfileRoot,
  gitExecutable: CanonicalGitExecutable
): BrokerResult<WindowsExecutionAuthorityContext> => {
  const currentGitExecutable = runtime.git.canonicalizeExistingPath(gitExecutable.value);
  if (currentGitExecutable === null ||
      !runtime.git.pathsEqual(gitExecutable.value, currentGitExecutable)) return contextFailure();
  const localApplicationData = fixedLocalApplicationData(trustedProfileRoot);
  const journal = runtime.journals.create({
    profilePath: createWindowsProfilePathPort(localApplicationData),
    applicationVersion: WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION,
    busyTimeoutMs: options.journalBusyTimeoutMs,
    clock: runtime.clock
  });
  const authority = runtime.authorities.create({
    git: {
      gitExecutable: gitExecutable.value,
      deadlineMs: options.adapterTimeoutMs,
      blobLimitBytes: options.recipeBlobLimitBytes
    },
    grants: journal.grants,
    sha256: recipeRevisionDigest
  }, runtime.git);
  return brokerOk({ authority, journal, trustedProfileRoot, gitExecutable });
};

const readHostConfiguration = (
  options: ValidWindowsExecutionAuthorityContextOptions,
  runtime: WindowsExecutionAuthorityContextRuntime,
  trustedProfileRoot: TrustedProfileRoot
): Promise<BrokerResult<WindowsExecutionAuthorityContext>> => {
  const localApplicationData = fixedLocalApplicationData(trustedProfileRoot);
  return Promise.resolve()
    .then(() => createWindowsBrokerHostConfigurationPort(
      localApplicationData,
      runtime.hostConfiguration
    ).read())
    .then(configuration => configuration.type === 'ok'
      ? composeContext(
          options,
          runtime,
          trustedProfileRoot,
          configuration.value.gitExecutable
        )
      : contextFailure());
};

const resolveWithRuntime = (
  options: ValidWindowsExecutionAuthorityContextOptions,
  runtime: WindowsExecutionAuthorityContextRuntime
): Promise<BrokerResult<WindowsExecutionAuthorityContext>> => {
  const localApplicationData = createWindowsKnownFolderLocalApplicationDataPort(
    runtime.knownFolder,
    runtime.platform
  );
  return Promise.resolve()
    .then(() => localApplicationData.resolveCurrentUserRoot())
    .then(root => root.type === 'ok'
      ? readHostConfiguration(options, runtime, root.value)
      : contextFailure());
};

export const resolveWindowsExecutionAuthorityContext = (
  options: WindowsExecutionAuthorityContextOptions = {},
  injectedRuntime?: WindowsExecutionAuthorityContextRuntime
): Promise<BrokerResult<WindowsExecutionAuthorityContext>> => Promise.resolve()
  .then(() => validateOptions(options))
  .then(validated => validated.isErr()
    ? contextFailure<WindowsExecutionAuthorityContext>()
    : Promise.resolve()
      .then(() => injectedRuntime ?? createWindowsExecutionAuthorityContextRuntime())
      .then(runtime => resolveWithRuntime(validated.value, runtime)))
  .then(
    result => result,
    () => contextFailure<WindowsExecutionAuthorityContext>()
  );
