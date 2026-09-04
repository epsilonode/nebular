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
  decodeBrokerControlMessage,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import { resolveAndAuthorizeExecution } from '../broker/authority.ts';
import {
  type GitCommandOutcome,
  type GitCurrentRecipeRuntime
} from '../broker/git-current-recipe.ts';
import { createGitJournalExecutionAuthorityPorts } from '../broker/git-journal-execution-authority.ts';
import {
  journalOk,
  parseConsentId,
  parseJournalOperationId,
  type GrantJournalRecord,
  type JournalResult
} from '../broker/journal.ts';
import { parseCredentialReference, type SecretLeaseResult } from '../broker/lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type RecipeRevision
} from '../broker/primitives.ts';
import type { BrokerResult } from '../broker/result.ts';
import {
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  recipeOk,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';

const recipePath = '.nebular/recipes/weather.xml';

const recipeXml = (argument: string = 'forecast'): string => `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source task="weather" tool="mise" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>${argument}</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope><operation>forecast</operation>
  </credential-slot>
</recipe>`;

const sha256: RecipeRevisionDigestPort = {
  sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
};

const brokerValue = <T>(result: BrokerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const recipeValue = <T>(result: RecipeRunnerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const journalValue = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const leaseValue = <T>(result: SecretLeaseResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const revision = (): RecipeRevision => brokerValue(parseRecipeRevision(
  recipeValue(computeRecipeRevision(recipeValue(decodeAndAdmitRecipeXml(recipeXml())), sha256)).value
));

const repository = (path: string): CanonicalRepository => brokerValue(parseCanonicalRepository(path));
const grantId = (): GrantId => brokerValue(parseGrantId('grant-real-git-1'));
const slot = (): CredentialSlotId => brokerValue(parseCredentialSlotId('weather-api'));

const grant = (canonicalRepository: CanonicalRepository): GrantJournalRecord => ({
  id: grantId(),
  operationId: journalValue(parseJournalOperationId('operation-real-git-1')),
  repository: canonicalRepository,
  recipeRevision: revision(),
  credentialBindings: [{
    slotId: slot(),
    credentialReference: leaseValue(parseCredentialReference('credential-real-git-1'))
  }],
  consentId: journalValue(parseConsentId('consent-real-git-1')),
  generation: 1,
  issuedAtMs: 500,
  expiresAtMs: 2_000,
  state: 'active'
});

const request = (repositoryHint: string): BrokerRequestMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'request-real-git-1',
    sequence: 0,
    sentAtMs: 1_000,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-real-git-1',
      repositoryPathHint: repositoryHint,
      recipePathHint: recipePath,
      recipeRevision: revision(),
      credentialSlotIds: ['weather-api']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('request fixture construction failed');
  return decoded.value;
};

const locateGit = (): string | null => {
  const systemRoot = process.env['SystemRoot'];
  const locator = process.platform === 'win32' && systemRoot !== undefined
    ? join(systemRoot, 'System32', 'where.exe')
    : '/usr/bin/which';
  if (!existsSync(locator)) return null;
  const outcome = spawnSync(locator, ['git'], {
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true
  });
  const first = outcome.status === 0 ? outcome.stdout.split(/\r?\n/u)[0] : undefined;
  return first === undefined || !isAbsolute(first) ? null : realpathSync.native(first);
};

const gitExecutable = locateGit();
const temporaryRoots: string[] = [];

afterEach(() => {
  temporaryRoots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
});

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
  run: command => {
    const outcome = spawnSync(command.executable, [...command.argv], {
      stdio: 'pipe',
      timeout: command.timeoutMs,
      maxBuffer: command.stdoutLimitBytes + command.stderrLimitBytes + 1,
      windowsHide: true,
      env: {
        PATH: dirname(command.executable),
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
      stdout.byteLength > command.stdoutLimitBytes || stderr.byteLength > command.stderrLimitBytes
      ? { status: 'failed' }
      : {
          status: 'exited',
          exitCode: outcome.status,
          stdout: Uint8Array.from(stdout),
          stderrByteLength: stderr.byteLength
        } satisfies GitCommandOutcome;
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

describe.skipIf(gitExecutable === null)('Git and journal execution authority real seam', () => {
  it('canonicalizes a nested caller hint and reads committed HEAD bytes instead of the mutable worktree', async () => {
    if (gitExecutable === null) throw new Error('Git is required by this test.');
    const root = mkdtempSync(join(tmpdir(), 'nebular-execution-authority-'));
    temporaryRoots.push(root);
    const worktree = join(root, 'repository');
    const nested = join(worktree, 'packages', 'api');
    mkdirSync(join(worktree, '.nebular', 'recipes'), { recursive: true });
    mkdirSync(nested, { recursive: true });
    runFixtureGit(gitExecutable, worktree, ['init', '-b', 'main']);
    runFixtureGit(gitExecutable, worktree, ['config', 'user.email', 'nebular@example.invalid']);
    runFixtureGit(gitExecutable, worktree, ['config', 'user.name', 'Nebular Test']);
    const recipeFile = join(worktree, '.nebular', 'recipes', 'weather.xml');
    writeFileSync(recipeFile, recipeXml(), 'utf8');
    runFixtureGit(gitExecutable, worktree, ['add', '--', recipePath]);
    runFixtureGit(gitExecutable, worktree, ['commit', '-m', 'committed recipe']);
    writeFileSync(recipeFile, recipeXml('mutable-worktree-change'), 'utf8');
    const canonicalRepository = repository(realpathSync.native(worktree));
    const reads: string[] = [];
    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: {
        readGrant: id => {
          reads.push(id);
          return Promise.resolve(journalOk(grant(canonicalRepository)));
        }
      },
      sha256
    }, nodeGitRuntime());

    const authorized = await resolveAndAuthorizeExecution(request(realpathSync.native(nested)), 1_000, ports);

    expect(authorized).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        grant: expect.objectContaining({
          id: 'grant-real-git-1',
          generation: 1,
          credentialSlotIds: ['weather-api']
        }),
        recipe: expect.objectContaining({
          repository: canonicalRepository,
          relativePath: recipePath,
          revision: revision(),
          credentialSlotIds: ['weather-api'],
          admittedRecipe: expect.objectContaining({
            semantic: expect.objectContaining({
              execution: expect.objectContaining({ argv: ['run', 'forecast'] })
            })
          })
        })
      })
    }));
    expect(reads).toEqual(['grant-real-git-1']);
  });
});
