import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createBrokerCurrentRecipeResolver,
  currentRecipeTaskOk,
  parseCanonicalRepository,
  parseCredentialSlotId as parseBrokerCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision as parseBrokerRecipeRevision,
  parseReceiverId,
  type BrokerCurrentRecipePorts,
  type BrokerResult,
  type CanonicalRepository,
  type CheckedInRecipeFileOutcome,
  type VerifiedBootstrapReceiverAttempt
} from '../broker/public.ts';
import {
  parseCheckedInRecipeLocator,
  parseProcessIncarnation,
  parseReceiverEntryIdentity,
  type JournalResult
} from '../broker/journal.ts';
import {
  buildExecuteRecipeRequest,
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  parseRecipeRelativePath,
  parseRecipeRevision,
  recipeOk,
  type AdmittedRecipe,
  type RecipeRevisionDigestPort,
  type RecipeRunnerResult
} from '../recipe-runner/public.ts';

const canonicalXml = (argument: string = 'forecast'): string => `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <source task="weather" tool="mise" />
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise">
    <arg>run</arg><arg>${argument}</arg>
    <env name="MODE" value="development" />
  </exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope><operation>forecast</operation>
  </credential-slot>
</recipe>`;

const formattingVariant = `<recipe lifecycle="one-shot" receiver="pm2" id="weather" schema="wx.recipe/v1">
  <credential-slot inject="WEATHER_TOKEN" delivery="environment" environment="production" provider="weather" id="weather-api">
    <operation>forecast</operation>
    <scope>alerts:read</scope>
  </credential-slot>
  <exec tool="mise" cwd="." name="weather-once"><arg>run</arg><arg>forecast</arg><env value="development" name="MODE" /></exec>
  <timeout ms="20000" />
  <source tool="mise" task="weather" />
</recipe>`;

const sha256: RecipeRevisionDigestPort = {
  sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
};

const recipeValue = <T>(result: RecipeRunnerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const brokerValue = <T>(result: BrokerResult<T>): T => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const journalValue = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const admitted = (xml: string): AdmittedRecipe => recipeValue(decodeAndAdmitRecipeXml(xml));
const revisionValue = (xml: string): string =>
  recipeValue(computeRecipeRevision(admitted(xml), sha256)).value;

const repository = (): CanonicalRepository => brokerValue(parseCanonicalRepository('R:/Code/weather'));

const attempt = (revision: string = revisionValue(canonicalXml())): VerifiedBootstrapReceiverAttempt => ({
  state: 'verified-current-attempt',
  processAttemptId: brokerValue(parseProcessAttemptId('attempt-1')),
  repository: repository(),
  recipeRevision: brokerValue(parseBrokerRecipeRevision(revision)),
  grantId: brokerValue(parseGrantId('grant-1')),
  grantGeneration: 1,
  receiverId: brokerValue(parseReceiverId('pm2')),
  bindingGeneration: 1,
  receiverEntryIdentity: journalValue(parseReceiverEntryIdentity('nebular-weather-attempt-1')),
  helperParentProcessId: 400,
  helperParentProcessIncarnation: journalValue(parseProcessIncarnation('process-incarnation-1')),
  recipeLocator: journalValue(parseCheckedInRecipeLocator('.nebular/recipes/weather.xml'))
});

const ports = (
  file: CheckedInRecipeFileOutcome,
  expectedRepository: CanonicalRepository = repository()
): BrokerCurrentRecipePorts => ({
  worktrees: {
    resolveCanonicalWorktree: () => currentRecipeTaskOk({
      status: 'resolved',
      worktree: { state: 'canonical-git-worktree', canonicalRepository: expectedRepository }
    })
  },
  files: { readCheckedInRegularFile: () => currentRecipeTaskOk(file) },
  sha256
});

const currentFile = (xml: string): CheckedInRecipeFileOutcome => ({
  status: 'checked-in-regular-file',
  relativeLocator: '.nebular/recipes/weather.xml',
  xml
});

describe('neutral recipe contract to broker authority seam', () => {
  it('gives runner and broker identical decode, canonical revision, locator, and slot facts', async () => {
    const runnerRecipe = admitted(canonicalXml());
    const runnerRevision = recipeValue(computeRecipeRevision(runnerRecipe, sha256));
    const resolved = await createBrokerCurrentRecipeResolver(ports(currentFile(formattingVariant)))
      .resolveCurrentRecipe(attempt(runnerRevision.value));

    expect(resolved).toEqual(expect.objectContaining({
      value: {
        state: 'current-checked-in-recipe',
        repository: repository(),
        recipeRevision: brokerValue(parseBrokerRecipeRevision(runnerRevision.value)),
        relativePath: journalValue(parseCheckedInRecipeLocator('.nebular/recipes/weather.xml')),
        slots: [{
          slotId: brokerValue(parseBrokerCredentialSlotId('weather-api')),
          environmentName: 'WEATHER_TOKEN'
        }]
      }
    }));
  });

  it('keeps formatting equivalent but rejects semantic revision drift', async () => {
    expect(revisionValue(formattingVariant)).toBe(revisionValue(canonicalXml()));
    const drifted = await createBrokerCurrentRecipeResolver(ports(currentFile(canonicalXml('alerts'))))
      .resolveCurrentRecipe(attempt(revisionValue(canonicalXml())));

    expect(drifted).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'recipe-drift' })]
    }));
  });

  it.each([
    ['untracked', 'recipe-drift'],
    ['symlink', 'repository-invalid'],
    ['path-escape', 'repository-invalid']
  ] as const)('fails closed when the checked-in-file port reports %s', async (status, code) => {
    const resolved = await createBrokerCurrentRecipeResolver(ports({ status }))
      .resolveCurrentRecipe(attempt());

    expect(resolved).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code })]
    }));
  });

  it('derives repository and locator only from durable attempt authority, never caller recipe hints', async () => {
    const runnerRecipe = admitted(canonicalXml());
    const callerPath = recipeValue(parseRecipeRelativePath('caller/other.xml'));
    const callerRevision = recipeValue(parseRecipeRevision('caller-claimed-revision'));
    const callerRequest = recipeValue(buildExecuteRecipeRequest({
      recipe: runnerRecipe,
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:/Caller/Hint',
      recipePathHint: callerPath,
      recipeRevision: callerRevision,
      requestId: 'caller-request-1',
      sequence: 0,
      sentAtMs: 1_000
    }));
    const durableAttempt = attempt();
    const observedRepositories: CanonicalRepository[] = [];
    const observedLocators: string[] = [];
    const authorityPorts: BrokerCurrentRecipePorts = {
      worktrees: {
        resolveCanonicalWorktree: expectedRepository => {
          observedRepositories.push(expectedRepository);
          return currentRecipeTaskOk({
            status: 'resolved',
            worktree: { state: 'canonical-git-worktree', canonicalRepository: expectedRepository }
          });
        }
      },
      files: {
        readCheckedInRegularFile: request => {
          observedLocators.push(request.expectedRelativeLocator.value);
          return currentRecipeTaskOk(currentFile(canonicalXml()));
        }
      },
      sha256
    };

    const resolved = await createBrokerCurrentRecipeResolver(authorityPorts).resolveCurrentRecipe(durableAttempt);
    expect(resolved.isOk()).toBe(true);
    expect(callerRequest.payload.repositoryPathHint).toBe('R:/Caller/Hint');
    expect(callerRequest.payload.recipePathHint).toBe('caller/other.xml');
    expect(callerRequest.payload.recipeRevision).toBe('caller-claimed-revision');
    expect(observedRepositories).toEqual([durableAttempt.repository]);
    expect(observedLocators).toEqual([durableAttempt.recipeLocator.value]);
  });

  it('turns a synchronous worktree-port defect into a typed redacted failure', async () => {
    const authorityPorts: BrokerCurrentRecipePorts = {
      ...ports(currentFile(canonicalXml())),
      worktrees: {
        resolveCanonicalWorktree: () => {
          throw new Error('foreign adapter defect');
        }
      }
    };

    const resolved = await createBrokerCurrentRecipeResolver(authorityPorts).resolveCurrentRecipe(attempt());

    expect(resolved.isErr() ? resolved.error[0] : null).toEqual({
      code: 'repository-invalid',
      message: 'The current Git recipe authority port failed.'
    });
  });

  it('turns a rejected checked-in-file task into a typed redacted failure', async () => {
    const authorityPorts: BrokerCurrentRecipePorts = {
      ...ports(currentFile(canonicalXml())),
      files: {
        readCheckedInRegularFile: () => Promise.reject(new Error('foreign adapter rejection'))
      }
    };

    const resolved = await createBrokerCurrentRecipeResolver(authorityPorts).resolveCurrentRecipe(attempt());

    expect(resolved.isErr() ? resolved.error[0] : null).toEqual({
      code: 'repository-invalid',
      message: 'The current Git recipe authority port failed.'
    });
  });
});
