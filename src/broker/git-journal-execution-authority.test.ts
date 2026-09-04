import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  decodeBrokerControlMessage,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import {
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  recipeOk,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';
import { resolveAndAuthorizeExecution } from './authority.ts';
import {
  type GitCommandOutcome,
  type GitCommandRequest,
  type GitCurrentRecipeRuntime
} from './git-current-recipe.ts';
import { createGitJournalExecutionAuthorityPorts } from './git-journal-execution-authority.ts';
import {
  journalErr,
  journalOk,
  parseConsentId,
  parseJournalOperationId,
  type GrantJournalRecord,
  type JournalResult
} from './journal.ts';
import { parseCredentialReference, type SecretLeaseResult } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type RecipeRevision
} from './primitives.ts';
import type { BrokerResult } from './result.ts';

const encoder = new TextEncoder();
const gitExecutable = resolve('fixture-git.exe');
const repositoryPath = resolve('fixture-execution-repository');
const nestedRepositoryHint = resolve(repositoryPath, 'packages', 'api');
const recipePath = '.nebular/recipes/weather.xml';
const headObjectId = 'a'.repeat(40);
const blobObjectId = 'b'.repeat(40);

const recipeXml = (argument: string = 'forecast'): string => `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source task="weather" tool="mise" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="packages/api" tool="mise">
    <arg>run</arg><arg>${argument}</arg><env name="MODE" value="production" />
  </exec>
  <port name="http" value="8080" host="127.0.0.1" />
  <probe url="http://127.0.0.1:8080/health" status="200" />
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

const repository = (value: string = repositoryPath): CanonicalRepository =>
  brokerValue(parseCanonicalRepository(value));

const revision = (xml: string = recipeXml()): RecipeRevision => brokerValue(parseRecipeRevision(
  recipeValue(computeRecipeRevision(recipeValue(decodeAndAdmitRecipeXml(xml)), sha256)).value
));

const slot = (): CredentialSlotId => brokerValue(parseCredentialSlotId('weather-api'));
const grantId = (value: string = 'grant-1'): GrantId => brokerValue(parseGrantId(value));

const grant = (
  id: GrantId = grantId(),
  canonicalRepository: CanonicalRepository = repository()
): GrantJournalRecord => ({
  id,
  operationId: journalValue(parseJournalOperationId('operation-1')),
  repository: canonicalRepository,
  recipeRevision: revision(),
  credentialBindings: [{
    slotId: slot(),
    credentialReference: leaseValue(parseCredentialReference('credential-1'))
  }],
  consentId: journalValue(parseConsentId('consent-1')),
  generation: 1,
  issuedAtMs: 500,
  expiresAtMs: 2_000,
  state: 'active'
});

const request = (
  pathHint: string = recipePath,
  claimedRevision: string = revision()
): BrokerRequestMessage => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'request-1',
    sequence: 0,
    sentAtMs: 1_000,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: nestedRepositoryHint,
      recipePathHint: pathHint,
      recipeRevision: claimedRevision,
      credentialSlotIds: ['weather-api']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('request fixture construction failed');
  return decoded.value;
};

const exited = (stdout: string | Uint8Array, exitCode: number = 0): GitCommandOutcome => ({
  status: 'exited',
  exitCode,
  stdout: typeof stdout === 'string' ? encoder.encode(stdout) : stdout,
  stderrByteLength: 0
});

const commandTail = (command: GitCommandRequest): readonly string[] => command.argv.slice(6);

const gitHandler = (xml: string = recipeXml()) => (command: GitCommandRequest): GitCommandOutcome => {
  const argv = commandTail(command);
  if (argv[0] === 'rev-parse' && argv[1] === '--is-inside-work-tree') return exited('true\n');
  if (argv[0] === 'rev-parse' && argv[1] === '--is-bare-repository') return exited('false\n');
  if (argv[0] === 'rev-parse' && argv.includes('--show-toplevel')) return exited(`${repositoryPath}\n`);
  if (argv[0] === 'rev-parse' && argv.includes('HEAD^{commit}')) return exited(`${headObjectId}\n`);
  if (argv[0] === 'ls-tree') return exited(`100644 blob ${blobObjectId}\t${recipePath}\0`);
  if (argv[0] === 'cat-file') return exited(xml);
  if (argv[0] === 'ls-files') return exited(new Uint8Array());
  return { status: 'failed' };
};

const runtime = (
  handler: (command: GitCommandRequest) => GitCommandOutcome,
  observed: GitCommandRequest[] = []
): GitCurrentRecipeRuntime => ({
  run: command => {
    observed.push(command);
    return handler(command);
  },
  canonicalizeExistingPath: path => path,
  pathsEqual: (left, right) => resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US'),
  monotonicNowMs: () => 1_000
});

describe('Git and grant-journal execution authority adapter', () => {
  it('derives the full admitted execution contract from the pinned HEAD blob and selects the grant by ID', async () => {
    const reads: string[] = [];
    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: {
        readGrant: id => {
          reads.push(id);
          return Promise.resolve(journalOk(grant()));
        }
      },
      sha256
    }, runtime(gitHandler()));

    const authorized = await resolveAndAuthorizeExecution(request(), 1_000, ports);

    expect(authorized).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        admittedSlotIds: ['weather-api'],
        grant: expect.objectContaining({ id: 'grant-1', generation: 1 }),
        recipe: expect.objectContaining({
          repository: repositoryPath,
          relativePath: recipePath,
          admittedRecipe: expect.objectContaining({
            semantic: expect.objectContaining({
              receiver: 'pm2',
              lifecycle: 'one-shot',
              stopPolicy: 'ephemeral-safe-to-stop',
              timeoutMs: 20_000,
              execution: expect.objectContaining({
                processName: 'weather-once',
                cwd: 'packages/api',
                tool: 'mise',
                argv: ['run', 'forecast'],
                environment: [expect.objectContaining({ value: 'production' })]
              }),
              ports: [expect.objectContaining({ name: 'http', value: '8080' })],
              probes: [{ url: 'http://127.0.0.1:8080/health', status: 200 }]
            })
          })
        })
      })
    }));
    if (authorized.isErr()) return;
    expect(authorized.value.grant).toEqual({
      id: 'grant-1',
      generation: 1,
      repository: repositoryPath,
      recipeRevision: revision(),
      credentialSlotIds: ['weather-api'],
      expiresAtMs: 2_000,
      revoked: false
    });
    expect(JSON.stringify(authorized.value.grant)).not.toContain('credential-1');
    expect(reads).toEqual(['grant-1']);
  });

  it('rejects path traversal before reading a Git object or journal grant', async () => {
    const commands: GitCommandRequest[] = [];
    const reads: string[] = [];
    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: {
        readGrant: id => {
          reads.push(id);
          return Promise.resolve(journalOk(grant()));
        }
      },
      sha256
    }, runtime(gitHandler(), commands));

    const denied = await resolveAndAuthorizeExecution(request('../outside.xml'), 1_000, ports);

    expect(denied).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'request-invalid' })] }));
    expect(commands.some(command => ['ls-tree', 'cat-file'].includes(commandTail(command)[0] ?? ''))).toBe(false);
    expect(reads).toEqual([]);
  });

  it('rejects invalid committed recipe semantics before consulting the journal', async () => {
    const reads: string[] = [];
    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: {
        readGrant: id => {
          reads.push(id);
          return Promise.resolve(journalOk(grant()));
        }
      },
      sha256
    }, runtime(gitHandler('<recipe>not admitted</recipe>')));

    const denied = await resolveAndAuthorizeExecution(request(), 1_000, ports);

    expect(denied).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'recipe-drift' })] }));
    expect(reads).toEqual([]);
  });

  it('maps missing, mismatched, failed, and rejected journal reads to closed typed outcomes', async () => {
    const cases = [
      {
        readGrant: () => Promise.resolve(journalOk<GrantJournalRecord | null>(null)),
        code: 'grant-missing'
      },
      {
        readGrant: () => Promise.resolve(journalOk<GrantJournalRecord | null>(grant(grantId('grant-other')))),
        code: 'authority-denied'
      },
      {
        readGrant: () => Promise.resolve(journalErr({ code: 'journal-corrupt', message: 'private journal detail' })),
        code: 'authority-denied'
      },
      {
        readGrant: () => Promise.reject(new Error('private journal rejection')),
        code: 'authority-denied'
      }
    ] as const;

    const outcomes = await Promise.all(cases.map(async testCase => {
      const ports = createGitJournalExecutionAuthorityPorts({
        git: { gitExecutable },
        grants: { readGrant: testCase.readGrant },
        sha256
      }, runtime(gitHandler()));
      return {
        code: testCase.code,
        result: await resolveAndAuthorizeExecution(request(), 1_000, ports)
      };
    }));

    outcomes.forEach(outcome => {
      expect(outcome.result).toEqual(expect.objectContaining({
        error: [expect.objectContaining({ code: outcome.code })]
      }));
      expect(JSON.stringify(outcome.result)).not.toMatch(/private journal/iu);
    });
  });

  it('contains a throwing Git runtime as a redacted Promise result', async () => {
    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: { readGrant: () => Promise.resolve(journalOk(grant())) },
      sha256
    }, runtime(() => {
      throw new Error('private Git runtime failure');
    }));

    const denied = await resolveAndAuthorizeExecution(request(), 1_000, ports);

    expect(denied).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'repository-invalid' })] }));
    expect(JSON.stringify(denied)).not.toContain('private Git runtime failure');
  });

  it('contains a Git configuration canonicalizer defect during adapter construction', async () => {
    const baseRuntime = runtime(gitHandler());
    const defectiveRuntime: GitCurrentRecipeRuntime = {
      ...baseRuntime,
      canonicalizeExistingPath: () => {
        throw new Error('private canonicalizer construction failure');
      }
    };

    const ports = createGitJournalExecutionAuthorityPorts({
      git: { gitExecutable },
      grants: { readGrant: () => Promise.resolve(journalOk(grant())) },
      sha256
    }, defectiveRuntime);
    const denied = await resolveAndAuthorizeExecution(request(), 1_000, ports);

    expect(denied).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'repository-invalid' })] }));
    expect(JSON.stringify(denied)).not.toContain('private canonicalizer construction failure');
  });
});
