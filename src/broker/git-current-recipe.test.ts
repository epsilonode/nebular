import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  recipeOk,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';
import type { VerifiedBootstrapReceiverAttempt } from './bootstrap-authority.ts';
import { createBrokerCurrentRecipeResolver } from './current-recipe.ts';
import {
  createGitCurrentRecipePorts,
  GIT_RECIPE_METADATA_LIMIT_BYTES,
  GIT_RECIPE_STDERR_LIMIT_BYTES,
  type GitCommandOutcome,
  type GitCommandRequest,
  type GitCurrentRecipeRuntime
} from './git-current-recipe.ts';
import {
  parseCheckedInRecipeLocator,
  parseProcessIncarnation,
  parseReceiverEntryIdentity,
  type CheckedInRecipeLocator,
  type JournalResult
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision,
  parseReceiverId,
  type CanonicalRepository
} from './primitives.ts';
import type { BrokerResult } from './result.ts';

const encoder = new TextEncoder();
const executable = resolve('fixture-git.exe');
const repositoryPath = resolve('fixture-repository');
const recipeLocatorText = '.nebular/recipes/weather.xml';
const headObjectId = 'a'.repeat(40);
const blobObjectId = 'b'.repeat(40);

const canonicalXml = (argument: string = 'forecast'): string => `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source task="weather" tool="mise" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise">
    <arg>run</arg><arg>${argument}</arg>
  </exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope><operation>forecast</operation>
  </credential-slot>
</recipe>`;

const formattingVariant = `<recipe lifecycle="one-shot" receiver="pm2" id="weather" schema="wx.recipe/v1">
  <credential-slot inject="WEATHER_TOKEN" delivery="environment" environment="production" provider="weather" id="weather-api">
    <operation>forecast</operation><scope>alerts:read</scope>
  </credential-slot>
  <exec tool="mise" cwd="." name="weather-once"><arg>run</arg><arg>forecast</arg></exec>
  <timeout ms="20000" />
  <source tool="mise" task="weather" />
</recipe>`;

const brokerValue = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const journalValue = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const recipeValue = <Value>(result: RecipeRunnerResult<Value>): Value => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const repository = (path: string = repositoryPath): CanonicalRepository =>
  brokerValue(parseCanonicalRepository(path));
const locator = (path: string = recipeLocatorText): CheckedInRecipeLocator =>
  journalValue(parseCheckedInRecipeLocator(path));

const exited = (stdout: string | Uint8Array, exitCode: number = 0): GitCommandOutcome => ({
  status: 'exited',
  exitCode,
  stdout: typeof stdout === 'string' ? encoder.encode(stdout) : stdout,
  stderrByteLength: 0
});

const commandTail = (request: GitCommandRequest): readonly string[] => request.argv.slice(6);

type CommandHandler = (request: GitCommandRequest) => GitCommandOutcome;

const fakeRuntime = (
  handler: CommandHandler,
  observed: GitCommandRequest[] = [],
  canonicalize: (path: string) => string | null = value => value
): GitCurrentRecipeRuntime => ({
  run: request => {
    observed.push(request);
    return handler(request);
  },
  canonicalizeExistingPath: canonicalize,
  pathsEqual: (left, right) => resolve(left).toLocaleLowerCase('en-US') ===
    resolve(right).toLocaleLowerCase('en-US'),
  monotonicNowMs: () => 1_000
});

const treeRecord = (
  mode: string = '100644',
  type: 'blob' | 'tree' | 'commit' = 'blob',
  path: string = recipeLocatorText
): Uint8Array => encoder.encode(`${mode} ${type} ${blobObjectId}\t${path}\0`);

const gitFixtureHandler = (
  xml: string = canonicalXml(),
  tree: Uint8Array = treeRecord()
): CommandHandler => request => {
  const command = commandTail(request);
  if (command[0] === 'rev-parse' && command[1] === '--is-inside-work-tree') return exited('true\n');
  if (command[0] === 'rev-parse' && command[1] === '--is-bare-repository') return exited('false\n');
  if (command[0] === 'rev-parse' && command.includes('--show-toplevel')) return exited(`${repositoryPath}\n`);
  if (command[0] === 'rev-parse' && command.includes('HEAD^{commit}')) return exited(`${headObjectId}\n`);
  if (command[0] === 'ls-tree') return exited(tree);
  if (command[0] === 'cat-file') return exited(xml);
  if (command[0] === 'ls-files') return exited(new Uint8Array());
  return { status: 'failed' };
};

const fileRequest = (path: CheckedInRecipeLocator = locator()) => ({
  worktree: {
    state: 'canonical-git-worktree' as const,
    canonicalRepository: repository()
  },
  expectedRelativeLocator: path
});

const sha256: RecipeRevisionDigestPort = {
  sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
};

const revision = (xml: string): string => recipeValue(computeRecipeRevision(
  recipeValue(decodeAndAdmitRecipeXml(xml)),
  sha256
)).value;

const attempt = (repository_: CanonicalRepository, revision_: string): VerifiedBootstrapReceiverAttempt => ({
  state: 'verified-current-attempt',
  processAttemptId: brokerValue(parseProcessAttemptId('attempt-git-1')),
  repository: repository_,
  recipeRevision: brokerValue(parseRecipeRevision(revision_)),
  grantId: brokerValue(parseGrantId('grant-git-1')),
  grantGeneration: 1,
  receiverId: brokerValue(parseReceiverId('pm2')),
  bindingGeneration: 1,
  receiverEntryIdentity: journalValue(parseReceiverEntryIdentity('nebular-weather-attempt-git-1')),
  helperParentProcessId: 400,
  helperParentProcessIncarnation: journalValue(parseProcessIncarnation('process-incarnation-git-1')),
  recipeLocator: locator()
});

describe('Git current recipe adapter atomic boundaries', () => {
  it('requires an explicitly configured absolute Git executable before invoking a command', async () => {
    const observed: GitCommandRequest[] = [];
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: 'git' },
      fakeRuntime(gitFixtureHandler(), observed)
    );

    const outcome = await ports.worktrees.resolveCanonicalWorktree(repository());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'unavailable' });
    expect(observed).toEqual([]);
  });

  it('rejects a Git executable alias that does not equal its canonical local path', async () => {
    const observed: GitCommandRequest[] = [];
    const alias = resolve('git-alias.exe');
    const canonical = resolve('git-canonical.exe');
    const runtime = fakeRuntime(
      gitFixtureHandler(),
      observed,
      value => value === alias ? canonical : value
    );

    const outcome = await createGitCurrentRecipePorts({ gitExecutable: alias }, runtime)
      .worktrees.resolveCanonicalWorktree(repository());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'unavailable' });
    expect(observed).toEqual([]);
  });

  it('proves an exact canonical non-bare worktree with bounded argv-only Git calls', async () => {
    const observed: GitCommandRequest[] = [];
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable, deadlineMs: 2500 },
      fakeRuntime(gitFixtureHandler(), observed)
    );

    const outcome = await ports.worktrees.resolveCanonicalWorktree(repository());

    expect(outcome._unsafeUnwrap()).toEqual({
      status: 'resolved',
      worktree: { state: 'canonical-git-worktree', canonicalRepository: repository() }
    });
    expect(observed).toHaveLength(3);
    expect(observed.every(request => request.executable === executable)).toBe(true);
    expect(observed.every(request => request.argv.slice(0, 6).includes('--no-replace-objects'))).toBe(true);
    expect(observed.every(request => request.argv.slice(0, 6).includes('--literal-pathspecs'))).toBe(true);
    expect(observed.every(request => request.timeoutMs === 2500)).toBe(true);
    expect(observed.every(request => request.stdoutLimitBytes === GIT_RECIPE_METADATA_LIMIT_BYTES)).toBe(true);
    expect(observed.every(request => request.stderrLimitBytes === GIT_RECIPE_STDERR_LIMIT_BYTES)).toBe(true);
  });

  it('rejects nested, aliased, and different roots instead of weakening durable canonical identity', async () => {
    const nested = resolve(repositoryPath, 'packages', 'api');
    const runtime = fakeRuntime(
      request => commandTail(request).includes('--show-toplevel')
        ? exited(`${repositoryPath}\n`)
        : gitFixtureHandler()(request),
      [],
      value => value
    );
    const ports = createGitCurrentRecipePorts({ gitExecutable: executable }, runtime);

    const outcome = await ports.worktrees.resolveCanonicalWorktree(repository(nested));

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'ambiguous-worktree' });
  });

  it('rejects a forged relative durable repository before invoking Git', async () => {
    const observed: GitCommandRequest[] = [];
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(), observed)
    );

    const outcome = await ports.worktrees.resolveCanonicalWorktree(repository('.'));

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'ambiguous-worktree' });
    expect(observed).toEqual([]);
  });

  it.each([
    ['true\n', 'true\n'],
    ['false\n', 'true\n'],
    ['malformed\n', 'false\n']
  ])('rejects a non-worktree or bare repository (%s, %s)', async (inside, bare) => {
    const runtime = fakeRuntime(request => {
      const command = commandTail(request);
      if (command[1] === '--is-inside-work-tree') return exited(inside);
      if (command[1] === '--is-bare-repository') return exited(bare);
      if (command.includes('--show-toplevel')) return exited(`${repositoryPath}\n`);
      return { status: 'failed' };
    });
    const outcome = await createGitCurrentRecipePorts({ gitExecutable: executable }, runtime)
      .worktrees.resolveCanonicalWorktree(repository());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'not-git-worktree' });
  });

  it('reads only the exact regular blob pinned through one HEAD commit and object id', async () => {
    const observed: GitCommandRequest[] = [];
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(formattingVariant), observed)
    );

    const outcome = await ports.files.readCheckedInRegularFile(fileRequest());

    expect(outcome._unsafeUnwrap()).toEqual({
      status: 'checked-in-regular-file',
      relativeLocator: recipeLocatorText,
      xml: formattingVariant
    });
    const lsTree = observed.find(request => commandTail(request)[0] === 'ls-tree');
    const catFile = observed.find(request => commandTail(request)[0] === 'cat-file');
    expect(lsTree === undefined ? [] : commandTail(lsTree)).toEqual([
      'ls-tree', '-z', '--full-tree', headObjectId, '--', recipeLocatorText
    ]);
    expect(catFile === undefined ? [] : commandTail(catFile)).toEqual(['cat-file', 'blob', blobObjectId]);
    expect(observed.some(request => commandTail(request)[0] === 'show')).toBe(false);
  });

  it.each([
    ['120000', 'blob', 'symlink'],
    ['160000', 'commit', 'not-regular-file'],
    ['040000', 'tree', 'not-regular-file']
  ] as const)('rejects Git mode %s/type %s as %s', async (mode, type, status) => {
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(canonicalXml(), treeRecord(mode, type)))
    );

    const outcome = await ports.files.readCheckedInRegularFile(fileRequest());

    expect(outcome._unsafeUnwrap()).toEqual({ status });
  });

  it('rejects a forged traversal locator before invoking Git', async () => {
    const observed: GitCommandRequest[] = [];
    const forged = { kind: 'checked-in-recipe-locator', value: '../outside.xml' } as CheckedInRecipeLocator;
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(), observed)
    );

    const outcome = await ports.files.readCheckedInRegularFile(fileRequest(forged));

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'path-escape' });
    expect(observed).toEqual([]);
  });

  it('requires the returned Git tree locator to equal the durable literal locator', async () => {
    const ports = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(canonicalXml(), treeRecord('100644', 'blob', 'other.xml')))
    );

    const outcome = await ports.files.readCheckedInRegularFile(fileRequest());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'path-escape' });
  });

  it('distinguishes an untracked worktree path from a missing path without reading either file', async () => {
    const runtime = fakeRuntime(request => {
      const command = commandTail(request);
      if (command[0] === 'ls-tree') return exited(new Uint8Array());
      if (command[0] === 'ls-files') return exited(`${recipeLocatorText}\0`);
      return gitFixtureHandler()(request);
    });
    const untracked = await createGitCurrentRecipePorts({ gitExecutable: executable }, runtime)
      .files.readCheckedInRegularFile(fileRequest());
    const missingRuntime = fakeRuntime(request => commandTail(request)[0] === 'ls-tree'
      ? exited(new Uint8Array())
      : gitFixtureHandler()(request));
    const missing = await createGitCurrentRecipePorts({ gitExecutable: executable }, missingRuntime)
      .files.readCheckedInRegularFile(fileRequest());

    expect(untracked._unsafeUnwrap()).toEqual({ status: 'untracked' });
    expect(missing._unsafeUnwrap()).toEqual({ status: 'missing' });
  });

  it('classifies an index-only staged-new recipe as untracked rather than missing', async () => {
    const runtime = fakeRuntime(request => {
      const command = commandTail(request);
      if (command[0] === 'ls-tree') return exited(new Uint8Array());
      if (command[0] === 'ls-files' && command[1] === '--stage') {
        return exited(`100644 ${blobObjectId} 0\t${recipeLocatorText}\0`);
      }
      return gitFixtureHandler()(request);
    });

    const outcome = await createGitCurrentRecipePorts({ gitExecutable: executable }, runtime)
      .files.readCheckedInRegularFile(fileRequest());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'untracked' });
  });

  it('classifies a staged recipe in an unborn repository as untracked', async () => {
    const runtime = fakeRuntime(request => {
      const command = commandTail(request);
      if (command[0] === 'rev-parse' && command.includes('HEAD^{commit}')) return exited('', 128);
      if (command[0] === 'ls-files' && command[1] === '--stage') {
        return exited(`100644 ${blobObjectId} 0\t${recipeLocatorText}\0`);
      }
      return gitFixtureHandler()(request);
    });

    const outcome = await createGitCurrentRecipePorts({ gitExecutable: executable }, runtime)
      .files.readCheckedInRegularFile(fileRequest());

    expect(outcome._unsafeUnwrap()).toEqual({ status: 'untracked' });
  });

  it('keeps the first HEAD commit and blob pinned when HEAD changes before cat-file', async () => {
    const observed: GitCommandRequest[] = [];
    let headChanged = false;
    const runtime = fakeRuntime(request => {
      const command = commandTail(request);
      if (command[0] === 'rev-parse' && command.includes('HEAD^{commit}')) return exited(`${headObjectId}\n`);
      if (command[0] === 'ls-tree') {
        headChanged = true;
        return exited(treeRecord());
      }
      if (command[0] === 'cat-file') {
        return command[2] === blobObjectId ? exited(canonicalXml()) : exited(canonicalXml('changed-head'));
      }
      return gitFixtureHandler()(request);
    }, observed);

    const outcome = await createGitCurrentRecipePorts({ gitExecutable: executable }, runtime)
      .files.readCheckedInRegularFile(fileRequest());

    expect(headChanged).toBe(true);
    expect(outcome._unsafeUnwrap()).toEqual({
      status: 'checked-in-regular-file',
      relativeLocator: recipeLocatorText,
      xml: canonicalXml()
    });
    expect(observed.filter(request => commandTail(request).includes('HEAD^{commit}'))).toHaveLength(1);
    expect(observed.find(request => commandTail(request)[0] === 'ls-tree')?.argv).toContain(headObjectId);
    expect(observed.find(request => commandTail(request)[0] === 'cat-file')?.argv).toContain(blobObjectId);
  });

  it('fails closed on oversized command receipts and malformed UTF-8 blobs', async () => {
    const oversizedRuntime = fakeRuntime(request => {
      const command = commandTail(request);
      return command[1] === '--is-inside-work-tree'
        ? exited(new Uint8Array(GIT_RECIPE_METADATA_LIMIT_BYTES + 1))
        : gitFixtureHandler()(request);
    });
    const oversized = await createGitCurrentRecipePorts({ gitExecutable: executable }, oversizedRuntime)
      .worktrees.resolveCanonicalWorktree(repository());
    const invalidUtf8 = Uint8Array.from([0xC3, 0x28]);
    const invalidRuntime = fakeRuntime(request => commandTail(request)[0] === 'cat-file'
      ? exited(invalidUtf8)
      : gitFixtureHandler()(request));
    const invalid = await createGitCurrentRecipePorts({ gitExecutable: executable }, invalidRuntime)
      .files.readCheckedInRegularFile(fileRequest());

    expect(oversized._unsafeUnwrap()).toEqual({ status: 'unavailable' });
    expect(invalid._unsafeUnwrap()).toEqual({ status: 'unavailable' });
  });

  it('keeps semantic formatting equivalence and rejects effective recipe drift through the full resolver seam', async () => {
    const equivalentPorts = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(formattingVariant))
    );
    const equivalent = await createBrokerCurrentRecipeResolver({ ...equivalentPorts, sha256 })
      .resolveCurrentRecipe(attempt(repository(), revision(canonicalXml())));
    const driftPorts = createGitCurrentRecipePorts(
      { gitExecutable: executable },
      fakeRuntime(gitFixtureHandler(canonicalXml('alerts')))
    );
    const drifted = await createBrokerCurrentRecipeResolver({ ...driftPorts, sha256 })
      .resolveCurrentRecipe(attempt(repository(), revision(canonicalXml())));

    expect(equivalent.isOk()).toBe(true);
    expect(drifted.isErr() ? drifted.error[0].code : null).toBe('recipe-drift');
  });
});

const temporaryRoots: string[] = [];

afterEach(() => {
  temporaryRoots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
});

const locateGit = (): string | null => {
  const systemRoot = process.env['SystemRoot'];
  const locatorExecutable = process.platform === 'win32' && systemRoot !== undefined
    ? join(systemRoot, 'System32', 'where.exe')
    : '/usr/bin/which';
  if (!existsSync(locatorExecutable)) return null;
  const located = spawnSync(locatorExecutable, ['git'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5_000
  });
  const first = located.status === 0 ? located.stdout.split(/\r?\n/u)[0] : undefined;
  return first === undefined || !isAbsolute(first) ? null : realpathSync.native(first);
};

const gitExecutable = locateGit();

const runFixtureGit = (git: string, cwd: string, argv: readonly string[]): void => {
  const outcome = spawnSync(git, [...argv], {
    cwd,
    stdio: 'pipe',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  if (outcome.status !== 0) throw new Error(`Git fixture command failed with exit ${String(outcome.status)}.`);
};

const nodeGitRuntime = (): GitCurrentRecipeRuntime => ({
  run: request => {
    const outcome = spawnSync(request.executable, [...request.argv], {
      stdio: 'pipe',
      timeout: request.timeoutMs,
      maxBuffer: request.stdoutLimitBytes + request.stderrLimitBytes + 1,
      windowsHide: true,
      env: {
        PATH: dirname(request.executable),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_CONFIG_COUNT: '0',
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
        LANG: 'C'
      }
    });
    const stdout = outcome.stdout ?? new Uint8Array();
    const stderr = outcome.stderr ?? new Uint8Array();
    return outcome.error !== undefined || outcome.status === null ||
      stdout.byteLength > request.stdoutLimitBytes || stderr.byteLength > request.stderrLimitBytes
      ? { status: 'failed' }
      : {
          status: 'exited',
          exitCode: outcome.status,
          stdout: Uint8Array.from(stdout),
          stderrByteLength: stderr.byteLength
        };
  },
  canonicalizeExistingPath: path => {
    try {
      return realpathSync.native(path);
    } catch {
      return null;
    }
  },
  pathsEqual: (left, right) => {
    const normalized = (value: string): string => resolve(value).replaceAll('\\', '/');
    return process.platform === 'win32'
      ? normalized(left).toLocaleLowerCase('en-US') === normalized(right).toLocaleLowerCase('en-US')
      : normalized(left) === normalized(right);
  },
  monotonicNowMs: () => performance.now()
});

describe.skipIf(gitExecutable === null)('Git current recipe real object-store seam', () => {
  it('supports a linked worktree, ignores unstaged bytes, and tracks equivalent versus semantic HEAD drift', async () => {
    if (gitExecutable === null) throw new Error('Git is required by this test.');
    const base = mkdtempSync(join(tmpdir(), 'nebular-git-recipe-'));
    temporaryRoots.push(base);
    const main = join(base, 'main');
    const linked = join(base, 'linked');
    mkdirSync(main);
    runFixtureGit(gitExecutable, main, ['init', '-b', 'main']);
    runFixtureGit(gitExecutable, main, ['config', 'user.email', 'nebular@example.invalid']);
    runFixtureGit(gitExecutable, main, ['config', 'user.name', 'Nebular Test']);
    const mainRecipe = join(main, '.nebular', 'recipes', 'weather.xml');
    mkdirSync(join(main, '.nebular', 'recipes'), { recursive: true });
    writeFileSync(mainRecipe, canonicalXml(), 'utf8');
    runFixtureGit(gitExecutable, main, ['add', '--', recipeLocatorText]);
    runFixtureGit(gitExecutable, main, ['commit', '-m', 'fixture']);
    runFixtureGit(gitExecutable, main, ['worktree', 'add', '-b', 'linked', linked, 'HEAD']);
    const canonicalLinked = realpathSync.native(linked);
    const linkedRepository = repository(canonicalLinked);
    const ports = createGitCurrentRecipePorts({ gitExecutable }, nodeGitRuntime());

    const worktree = await ports.worktrees.resolveCanonicalWorktree(linkedRepository);
    expect(worktree._unsafeUnwrap()).toEqual({
      status: 'resolved',
      worktree: { state: 'canonical-git-worktree', canonicalRepository: linkedRepository }
    });
    const resolvedWorktree = worktree._unsafeUnwrap();
    if (resolvedWorktree.status !== 'resolved') throw new Error('Fixture worktree did not resolve.');

    const linkedRecipe = join(linked, '.nebular', 'recipes', 'weather.xml');
    writeFileSync(linkedRecipe, canonicalXml('unstaged-change'), 'utf8');
    const pinned = await ports.files.readCheckedInRegularFile({
      worktree: resolvedWorktree.worktree,
      expectedRelativeLocator: locator()
    });
    expect(pinned._unsafeUnwrap()).toEqual(expect.objectContaining({
      status: 'checked-in-regular-file',
      xml: canonicalXml()
    }));

    const stagedLocatorText = '.nebular/recipes/staged.xml';
    const stagedRecipe = join(linked, '.nebular', 'recipes', 'staged.xml');
    writeFileSync(stagedRecipe, canonicalXml(), 'utf8');
    runFixtureGit(gitExecutable, linked, ['add', '--', stagedLocatorText]);
    const staged = await ports.files.readCheckedInRegularFile({
      worktree: { state: 'canonical-git-worktree', canonicalRepository: linkedRepository },
      expectedRelativeLocator: locator(stagedLocatorText)
    });
    expect(staged._unsafeUnwrap()).toEqual({ status: 'untracked' });

    writeFileSync(linkedRecipe, formattingVariant, 'utf8');
    runFixtureGit(gitExecutable, linked, ['add', '--', recipeLocatorText]);
    runFixtureGit(gitExecutable, linked, ['commit', '-m', 'format only']);
    const equivalent = await createBrokerCurrentRecipeResolver({ ...ports, sha256 })
      .resolveCurrentRecipe(attempt(linkedRepository, revision(canonicalXml())));
    expect(equivalent.isOk()).toBe(true);

    writeFileSync(linkedRecipe, canonicalXml('semantic-change'), 'utf8');
    runFixtureGit(gitExecutable, linked, ['add', '--', recipeLocatorText]);
    runFixtureGit(gitExecutable, linked, ['commit', '-m', 'semantic drift']);
    const drifted = await createBrokerCurrentRecipeResolver({ ...ports, sha256 })
      .resolveCurrentRecipe(attempt(linkedRepository, revision(canonicalXml())));
    expect(drifted.isErr() ? drifted.error[0].code : null).toBe('recipe-drift');
  });

  it('returns the pinned blob when a real Git HEAD and worktree change between ls-tree and cat-file', async () => {
    if (gitExecutable === null) throw new Error('Git is required by this test.');
    const base = mkdtempSync(join(tmpdir(), 'nebular-git-race-'));
    temporaryRoots.push(base);
    const repositoryRoot = join(base, 'repository');
    mkdirSync(repositoryRoot);
    runFixtureGit(gitExecutable, repositoryRoot, ['init', '-b', 'main']);
    runFixtureGit(gitExecutable, repositoryRoot, ['config', 'user.email', 'nebular@example.invalid']);
    runFixtureGit(gitExecutable, repositoryRoot, ['config', 'user.name', 'Nebular Test']);
    const recipePath = join(repositoryRoot, '.nebular', 'recipes', 'weather.xml');
    mkdirSync(join(repositoryRoot, '.nebular', 'recipes'), { recursive: true });
    writeFileSync(recipePath, canonicalXml(), 'utf8');
    runFixtureGit(gitExecutable, repositoryRoot, ['add', '--', recipeLocatorText]);
    runFixtureGit(gitExecutable, repositoryRoot, ['commit', '-m', 'pinned head']);
    const canonicalRoot = realpathSync.native(repositoryRoot);
    const canonicalRepository = repository(canonicalRoot);
    const baseRuntime = nodeGitRuntime();
    let changedHead = false;
    const racingRuntime: GitCurrentRecipeRuntime = {
      ...baseRuntime,
      run: request => {
        const result = baseRuntime.run(request);
        if (!changedHead && commandTail(request)[0] === 'ls-tree' && result.status === 'exited') {
          writeFileSync(recipePath, canonicalXml('new-head'), 'utf8');
          runFixtureGit(gitExecutable, repositoryRoot, ['add', '--', recipeLocatorText]);
          runFixtureGit(gitExecutable, repositoryRoot, ['commit', '-m', 'move head during read']);
          changedHead = true;
        }
        return result;
      }
    };
    const ports = createGitCurrentRecipePorts({ gitExecutable }, racingRuntime);

    const outcome = await ports.files.readCheckedInRegularFile({
      worktree: { state: 'canonical-git-worktree', canonicalRepository },
      expectedRelativeLocator: locator()
    });

    expect(changedHead).toBe(true);
    expect(outcome._unsafeUnwrap()).toEqual({
      status: 'checked-in-regular-file',
      relativeLocator: recipeLocatorText,
      xml: canonicalXml()
    });
  });
});
