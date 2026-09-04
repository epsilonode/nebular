import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { piped } from 'remeda';

import { currentRecipeTaskOk } from './current-recipe.ts';
import type {
  BrokerCurrentRecipePorts,
  CanonicalGitWorktreeOutcome,
  CheckedInRecipeFileOutcome,
  CheckedInRecipeReadRequest,
  CurrentRecipeCheckedInFilePort,
  CurrentRecipeWorktreePort
} from './current-recipe.ts';
import { parseCheckedInRecipeLocator } from './journal.ts';
import type { CanonicalRepository } from './primitives.ts';
import { brokerTry } from './result.ts';

export const GIT_RECIPE_DEFAULT_DEADLINE_MS = 5_000;
export const GIT_RECIPE_MAX_DEADLINE_MS = 60_000;
export const GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES = 1024 * 1024;
export const GIT_RECIPE_MAX_BLOB_LIMIT_BYTES = 16 * 1024 * 1024;
export const GIT_RECIPE_METADATA_LIMIT_BYTES = 64 * 1024;
export const GIT_RECIPE_STDERR_LIMIT_BYTES = 64 * 1024;

export type GitCurrentRecipeOptions = Readonly<{
  gitExecutable: string;
  deadlineMs?: number;
  blobLimitBytes?: number;
}>;

export type GitCommandRequest = Readonly<{
  executable: string;
  argv: readonly string[];
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
}>;

export type GitCommandOutcome =
  | Readonly<{
      status: 'exited';
      exitCode: number;
      stdout: Uint8Array;
      stderrByteLength: number;
    }>
  | Readonly<{ status: 'failed' }>;

export type GitCurrentRecipeRuntime = Readonly<{
  run: (request: GitCommandRequest) => GitCommandOutcome;
  canonicalizeExistingPath: (path: string) => string | null;
  pathsEqual: (left: string, right: string) => boolean;
  monotonicNowMs: () => number;
}>;

type ValidGitConfiguration = Readonly<{
  gitExecutable: string;
  deadlineMs: number;
  blobLimitBytes: number;
}>;

type GitDeadline = Readonly<{
  expiresAtMonotonicMs: number;
}>;

type GitTreeEntry = Readonly<{
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  objectId: string;
  relativeLocator: string;
}>;

const invalidRuntimeOperation = {
  code: 'repository-invalid',
  message: 'The configured Git operation could not be completed.'
} as const;

const isPositiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const isWellFormedUnicode = (value: string): boolean => Array.from(value).every(character => {
  const firstCodeUnit = character.charCodeAt(0);
  return character.length === 2 || firstCodeUnit < 0xD800 || firstCodeUnit > 0xDFFF;
});

const validConfiguration = (options: GitCurrentRecipeOptions): ValidGitConfiguration | null => {
  const deadlineMs = options.deadlineMs ?? GIT_RECIPE_DEFAULT_DEADLINE_MS;
  const blobLimitBytes = options.blobLimitBytes ?? GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES;
  return isAbsolute(options.gitExecutable) && options.gitExecutable.length <= 32_767 &&
    !options.gitExecutable.includes('\0') && isWellFormedUnicode(options.gitExecutable) &&
    isPositiveBound(deadlineMs, GIT_RECIPE_MAX_DEADLINE_MS) &&
    isPositiveBound(blobLimitBytes, GIT_RECIPE_MAX_BLOB_LIMIT_BYTES)
    ? { gitExecutable: options.gitExecutable, deadlineMs, blobLimitBytes }
    : null;
};

const isLocalAbsoluteExecutable = (path: string): boolean => isAbsolute(path) &&
  (process.platform !== 'win32' || !/^[\\/]{2}/u.test(path));

const canonicalConfiguration = (
  options: GitCurrentRecipeOptions,
  runtime: GitCurrentRecipeRuntime
): ValidGitConfiguration | null => {
  const configuration = validConfiguration(options);
  if (configuration === null || !isLocalAbsoluteExecutable(configuration.gitExecutable)) return null;
  const canonicalExecutable = runtime.canonicalizeExistingPath(configuration.gitExecutable);
  return canonicalExecutable !== null && isLocalAbsoluteExecutable(canonicalExecutable) &&
    runtime.pathsEqual(configuration.gitExecutable, canonicalExecutable)
    ? { ...configuration, gitExecutable: canonicalExecutable }
    : null;
};

const gitEnvironment = (executable: string): Readonly<Record<string, string>> => ({
  PATH: dirname(executable),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_CONFIG_COUNT: '0',
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'Never',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
  LANG: 'C'
});

export const createBunGitCurrentRecipeRuntime = (): GitCurrentRecipeRuntime => ({
  run: (request): GitCommandOutcome => {
    const maxBuffer = request.stdoutLimitBytes + request.stderrLimitBytes + 1;
    const invoked = brokerTry(
      () => Object.freeze(Bun.spawnSync({
        cmd: [request.executable, ...request.argv],
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: gitEnvironment(request.executable),
        timeout: request.timeoutMs,
        maxBuffer,
        killSignal: 'SIGKILL',
        windowsHide: true
      })),
      invalidRuntimeOperation
    );
    return invoked.match(
      (subprocess): GitCommandOutcome => subprocess.exitedDueToTimeout === true ||
        subprocess.exitedDueToMaxBuffer === true ||
        subprocess.stdout.byteLength > request.stdoutLimitBytes ||
        subprocess.stderr.byteLength > request.stderrLimitBytes
        ? { status: 'failed' }
        : {
            status: 'exited',
            exitCode: subprocess.exitCode,
            stdout: Uint8Array.from(subprocess.stdout),
            stderrByteLength: subprocess.stderr.byteLength
          },
      () => ({ status: 'failed' })
    );
  },
  canonicalizeExistingPath: path => brokerTry(
    () => realpathSync.native(path),
    invalidRuntimeOperation
  ).match(value => value, () => null),
  pathsEqual: (left, right) => {
    const normalized = (value: string): string => resolve(value)
      .replace(/^\\\\\?\\/u, '')
      .replaceAll('\\', '/');
    const leftPath = normalized(left);
    const rightPath = normalized(right);
    return process.platform === 'win32'
      ? leftPath.toLocaleLowerCase('en-US') === rightPath.toLocaleLowerCase('en-US')
      : leftPath === rightPath;
  },
  monotonicNowMs: () => performance.now()
});

const deadline = (configuration: ValidGitConfiguration, runtime: GitCurrentRecipeRuntime): GitDeadline => ({
  expiresAtMonotonicMs: runtime.monotonicNowMs() + configuration.deadlineMs
});

const remainingMs = (limit: GitDeadline, runtime: GitCurrentRecipeRuntime): number | null => {
  const remaining = Math.floor(limit.expiresAtMonotonicMs - runtime.monotonicNowMs());
  return Number.isSafeInteger(remaining) && remaining > 0 ? remaining : null;
};

const validGitArgument = (value: string): boolean =>
  value.length <= 32_767 && !value.includes('\0') && isWellFormedUnicode(value);

const gitPrefix = (repository: CanonicalRepository): readonly string[] => [
  '--no-replace-objects',
  '--literal-pathspecs',
  '-c',
  'core.quotepath=false',
  '-C',
  repository
];

const runGit = (
  configuration: ValidGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  limit: GitDeadline,
  repository: CanonicalRepository,
  command: readonly string[],
  stdoutLimitBytes: number = GIT_RECIPE_METADATA_LIMIT_BYTES
): GitCommandOutcome => {
  const timeoutMs = remainingMs(limit, runtime);
  const argv: readonly string[] = [...gitPrefix(repository), ...command];
  if (timeoutMs === null || !argv.every(validGitArgument)) return { status: 'failed' };
  const outcome = runtime.run({
    executable: configuration.gitExecutable,
    argv,
    timeoutMs,
    stdoutLimitBytes,
    stderrLimitBytes: GIT_RECIPE_STDERR_LIMIT_BYTES
  });
  return outcome.status === 'exited' && Number.isSafeInteger(outcome.exitCode) &&
    outcome.stdout.byteLength <= stdoutLimitBytes &&
    Number.isSafeInteger(outcome.stderrByteLength) && outcome.stderrByteLength >= 0 &&
    outcome.stderrByteLength <= GIT_RECIPE_STDERR_LIMIT_BYTES
    ? outcome
    : { status: 'failed' };
};

const fatalUtf8 = (bytes: Uint8Array): string | null => brokerTry(
  () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  invalidRuntimeOperation
).match(value => value, () => null);

const oneOutputLine = (outcome: GitCommandOutcome): string | null => {
  if (outcome.status !== 'exited' || outcome.exitCode !== 0) return null;
  const decoded = fatalUtf8(outcome.stdout);
  if (decoded === null) return null;
  const value = decoded.endsWith('\r\n')
    ? decoded.slice(0, -2)
    : decoded.endsWith('\n')
      ? decoded.slice(0, -1)
      : decoded;
  return value.length > 0 && !value.includes('\r') && !value.includes('\n') ? value : null;
};

const worktreeProbe = (
  configuration: ValidGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  limit: GitDeadline,
  repository: CanonicalRepository
): CanonicalGitWorktreeOutcome => {
  if (!isAbsolute(repository) || repository.length > 32_767 || repository.includes('\0') ||
      !isWellFormedUnicode(repository)) {
    return { status: 'ambiguous-worktree' };
  }
  const inside = runGit(configuration, runtime, limit, repository, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status === 'failed') return { status: 'unavailable' };
  if (inside.exitCode !== 0) return { status: 'not-git-worktree' };
  const bare = runGit(configuration, runtime, limit, repository, ['rev-parse', '--is-bare-repository']);
  const root = runGit(configuration, runtime, limit, repository, [
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel'
  ]);
  if (bare.status === 'failed' || root.status === 'failed') return { status: 'unavailable' };
  const insideValue = oneOutputLine(inside);
  const bareValue = oneOutputLine(bare);
  if (insideValue !== 'true' || bareValue !== 'false') return { status: 'not-git-worktree' };
  const rootValue = oneOutputLine(root);
  const durableCanonicalPath = runtime.canonicalizeExistingPath(repository);
  const resolvedCanonicalRoot = rootValue === null ? null : runtime.canonicalizeExistingPath(rootValue);
  if (durableCanonicalPath === null || resolvedCanonicalRoot === null) return { status: 'unavailable' };
  const durableWasCanonical = runtime.pathsEqual(repository, durableCanonicalPath);
  return durableWasCanonical && runtime.pathsEqual(durableCanonicalPath, resolvedCanonicalRoot)
    ? {
        status: 'resolved',
        worktree: { state: 'canonical-git-worktree', canonicalRepository: repository }
      }
    : { status: 'ambiguous-worktree' };
};

const safeLocator = (candidate: unknown): string | null => {
  if (typeof candidate !== 'object' || candidate === null || !('value' in candidate)) return null;
  const raw = candidate.value;
  if (typeof raw !== 'string' || !isWellFormedUnicode(raw)) return null;
  const parsed = parseCheckedInRecipeLocator(raw);
  return parsed.type === 'ok' && parsed.value.value === raw ? raw : null;
};

const parseTreeEntry = (bytes: Uint8Array): GitTreeEntry | null => {
  if (bytes.byteLength < 2 || bytes[bytes.byteLength - 1] !== 0 || bytes.indexOf(0) !== bytes.byteLength - 1) {
    return null;
  }
  const record = bytes.subarray(0, bytes.byteLength - 1);
  const tab = record.indexOf(9);
  if (tab <= 0) return null;
  const header = fatalUtf8(record.subarray(0, tab));
  const relativeLocator = fatalUtf8(record.subarray(tab + 1));
  const matched: Readonly<RegExpMatchArray> | undefined =
    header?.match(/^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64})$/u) ?? undefined;
  const mode = matched?.[1];
  const type = matched?.[2];
  const objectId = matched?.[3];
  return mode !== undefined && (type === 'blob' || type === 'tree' || type === 'commit') &&
    objectId !== undefined && relativeLocator !== null
    ? { mode, type, objectId, relativeLocator }
    : null;
};

const isGitObjectId = (value: string | null): value is string =>
  value !== null && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);

const classifyAbsentHeadEntry = (
  configuration: ValidGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  limit: GitDeadline,
  repository: CanonicalRepository,
  locator: string
): CheckedInRecipeFileOutcome => {
  const staged = runGit(configuration, runtime, limit, repository, [
    'ls-files',
    '--stage',
    '-z',
    '--',
    locator
  ]);
  if (staged.status !== 'exited' || staged.exitCode !== 0) return { status: 'unavailable' };
  if (staged.stdout.byteLength > 0) return { status: 'untracked' };
  const others = runGit(configuration, runtime, limit, repository, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    locator
  ]);
  if (others.status !== 'exited' || others.exitCode !== 0) return { status: 'unavailable' };
  return others.stdout.byteLength === 0 ? { status: 'missing' } : { status: 'untracked' };
};

const readPinnedBlob = (
  configuration: ValidGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  limit: GitDeadline,
  repository: CanonicalRepository,
  locator: string,
  objectId: string
): CheckedInRecipeFileOutcome => {
  const blob = runGit(
    configuration,
    runtime,
    limit,
    repository,
    ['cat-file', 'blob', objectId],
    configuration.blobLimitBytes
  );
  if (blob.status !== 'exited' || blob.exitCode !== 0 || blob.stdout.byteLength > configuration.blobLimitBytes) {
    return { status: 'unavailable' };
  }
  const xml = fatalUtf8(blob.stdout);
  return xml === null
    ? { status: 'unavailable' }
    : { status: 'checked-in-regular-file', relativeLocator: locator, xml };
};

const readCheckedInFile = (
  configuration: ValidGitConfiguration,
  runtime: GitCurrentRecipeRuntime,
  request: CheckedInRecipeReadRequest
): CheckedInRecipeFileOutcome => {
  const locator = safeLocator(request.expectedRelativeLocator);
  if (locator === null) return { status: 'path-escape' };
  const limit = deadline(configuration, runtime);
  const repository = request.worktree.canonicalRepository;
  const currentWorktree = worktreeProbe(configuration, runtime, limit, repository);
  if (currentWorktree.status !== 'resolved') {
    return currentWorktree.status === 'ambiguous-worktree'
      ? { status: 'path-escape' }
      : { status: 'unavailable' };
  }
  const headOutcome = runGit(configuration, runtime, limit, repository, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    'HEAD^{commit}'
  ]);
  if (headOutcome.status === 'failed') return { status: 'unavailable' };
  if (headOutcome.exitCode !== 0) {
    return classifyAbsentHeadEntry(configuration, runtime, limit, repository, locator);
  }
  const head = oneOutputLine(headOutcome);
  if (!isGitObjectId(head)) return { status: 'unavailable' };
  const tree = runGit(configuration, runtime, limit, repository, [
    'ls-tree',
    '-z',
    '--full-tree',
    head,
    '--',
    locator
  ]);
  if (tree.status !== 'exited' || tree.exitCode !== 0) return { status: 'unavailable' };
  if (tree.stdout.byteLength === 0) {
    return classifyAbsentHeadEntry(configuration, runtime, limit, repository, locator);
  }
  const entry = parseTreeEntry(tree.stdout);
  if (entry === null) return { status: 'unavailable' };
  if (entry.relativeLocator !== locator) return { status: 'path-escape' };
  if (entry.mode === '120000') return { status: 'symlink' };
  if ((entry.mode !== '100644' && entry.mode !== '100755') || entry.type !== 'blob') {
    return { status: 'not-regular-file' };
  }
  return readPinnedBlob(configuration, runtime, limit, repository, locator, entry.objectId);
};

export const createGitCurrentRecipePorts = (
  options: GitCurrentRecipeOptions,
  runtime: GitCurrentRecipeRuntime = createBunGitCurrentRecipeRuntime()
) => {
  const configuration = canonicalConfiguration(options, runtime);
  const resolveWorktreeOutcome = (expectedRepository: CanonicalRepository): CanonicalGitWorktreeOutcome =>
    configuration === null
      ? { status: 'unavailable' }
      : worktreeProbe(configuration, runtime, deadline(configuration, runtime), expectedRepository);
  const readFileOutcome = (request: CheckedInRecipeReadRequest): CheckedInRecipeFileOutcome =>
    configuration === null
      ? { status: 'unavailable' }
      : readCheckedInFile(configuration, runtime, request);
  const worktrees = {
    resolveCanonicalWorktree: piped(resolveWorktreeOutcome, currentRecipeTaskOk)
  } satisfies CurrentRecipeWorktreePort;
  const files = {
    readCheckedInRegularFile: piped(readFileOutcome, currentRecipeTaskOk)
  } satisfies CurrentRecipeCheckedInFilePort;
  return { worktrees, files } satisfies Pick<BrokerCurrentRecipePorts, 'worktrees' | 'files'>;
};
