import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  type BrokerOperation,
  type BrokerRequestMessage
} from '../broker-client/public.ts';
import { decodeAndAdmitRecipeXml, type AdmittedRecipe } from '../recipe-contract/public.ts';
import {
  authorityTaskOk,
  type AuthorizedExecution,
  type BrokerAuthorityPorts,
  type BrokerGrant,
  type ResolvedRecipe
} from './authority.ts';
import {
  type BrokerOperationContext,
  type BrokerOperationOutcome,
  type BrokerOperationPort
} from './operation.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision
} from './primitives.ts';
import {
  createRecipeExecutionOperationPort,
  type AuthorizedRecipeExecutionCompletion,
  type AuthorizedRecipeExecutorPort,
  type RecipeExecutionOperationDependencies
} from './recipe-execution-operation.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

const recipeXml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2" lifecycle="one-shot">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const unwrap = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('typed fixture construction failed');
  return result.value;
};

const credentialReference = () => {
  const parsed = parseCredentialReference('credential-weather');
  if (parsed.isErr()) throw new Error('typed credential reference fixture construction failed');
  return parsed.value;
};

const admittedRecipe = (): AdmittedRecipe => {
  const decoded = decodeAndAdmitRecipeXml(recipeXml);
  if (decoded.isErr()) throw new Error('admitted recipe fixture construction failed');
  return decoded.value;
};

const request = (
  operation: BrokerOperation = 'execute-recipe',
  claimedRevision = 'revision-1'
): BrokerRequestMessage => {
  const payload = operation === 'execute-recipe'
    ? {
        operation,
        grantIdHint: 'grant-1',
        repositoryPathHint: 'R:/private/project',
        recipePathHint: 'private-recipe.xml',
        recipeRevision: claimedRevision,
        credentialSlotIds: ['weather-api']
      }
    : { operation, credentialSlotIds: [] };
  const decoded = decodeBrokerControlMessage({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'request',
    requestId: 'execution-operation-1',
    sequence: 1,
    sentAtMs: 1_000,
    payload
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') {
    throw new Error('typed request fixture construction failed');
  }
  return decoded.value;
};

const fixture = (): Readonly<{
  recipe: ResolvedRecipe;
  grant: BrokerGrant;
  completion: AuthorizedRecipeExecutionCompletion;
}> => {
  const repository = unwrap(parseCanonicalRepository('R:/canonical/project'));
  const recipeRevision = unwrap(parseRecipeRevision('revision-1'));
  const grantId = unwrap(parseGrantId('grant-1'));
  const credentialSlotId = unwrap(parseCredentialSlotId('weather-api'));
  const reference = credentialReference();
  return {
    recipe: {
      repository,
      relativePath: 'private-recipe.xml',
      revision: recipeRevision,
      credentialSlotIds: [credentialSlotId],
      admittedRecipe: admittedRecipe()
    },
    grant: {
      id: grantId,
      generation: 1,
      repository,
      recipeRevision,
      credentialBindings: [{ slotId: credentialSlotId, credentialReference: reference }],
      expiresAtMs: 2_000,
      revoked: false
    },
    completion: {
      attemptId: unwrap(parseProcessAttemptId('attempt-7')),
      lifecycle: 'one-shot',
      state: 'succeeded',
      exitCode: 0,
      cleanup: 'complete'
    }
  };
};

const authority = (
  facts: ReturnType<typeof fixture>,
  overrides: Partial<BrokerAuthorityPorts> = {}
): BrokerAuthorityPorts => ({
  canonicalizeRepository: () => authorityTaskOk(facts.recipe.repository),
  resolveRecipe: () => authorityTaskOk(facts.recipe),
  readGrant: () => authorityTaskOk(facts.grant),
  ...overrides
});

const unavailableFallback = (): BrokerOperationPort => ({
  execute: () => Promise.resolve(brokerOk({
    outcome: 'failure',
    code: 'operation-unavailable',
    message: 'The operation is unavailable.',
    progress: []
  }))
});

const dependencies = (
  executor: AuthorizedRecipeExecutorPort,
  authorityOverrides: Partial<BrokerAuthorityPorts> = {},
  fallback: BrokerOperationPort = unavailableFallback()
): RecipeExecutionOperationDependencies => {
  const facts = fixture();
  return {
    authority: authority(facts, authorityOverrides),
    executor,
    fallback
  };
};

const executionPort = (
  executeToTerminal: AuthorizedRecipeExecutorPort['executeToTerminal'],
  authorityOverrides: Partial<BrokerAuthorityPorts> = {},
  fallback: BrokerOperationPort = unavailableFallback()
): BrokerOperationPort => createRecipeExecutionOperationPort(dependencies({ executeToTerminal }, authorityOverrides, fallback));

describe('authorized recipe execution operation', () => {
  it('runs the complete broker-authorized execution to terminal cleanup and emits only bounded observability facts', async () => {
    const facts = fixture();
    const received: AuthorizedExecution[] = [];
    const result = await executionPort(execution => {
      received.push(execution);
      return Promise.resolve(brokerOk(facts.completion));
    }).execute(request(), 1_000);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(expect.objectContaining({
      recipe: expect.objectContaining({ repository: facts.recipe.repository }),
      grant: {
        id: facts.grant.id,
        generation: facts.grant.generation,
        repository: facts.grant.repository,
        recipeRevision: facts.grant.recipeRevision,
        credentialSlotIds: facts.recipe.credentialSlotIds,
        expiresAtMs: facts.grant.expiresAtMs,
        revoked: false
      },
      admittedSlotIds: facts.recipe.credentialSlotIds
    }));
    expect(JSON.stringify(received[0])).not.toContain('credential-weather');
    expect(result).toEqual({
      value: {
        outcome: 'success',
        code: 'recipe-execution-succeeded',
        message: 'Authorized recipe execution completed successfully.',
        attemptId: 'attempt-7',
        progress: [
          {
            phase: 'authority',
            detail: 'Repository-scoped recipe authority was admitted.'
          },
          {
            phase: 'execution-attempt',
            detail: 'Attempt attempt-7 completed succeeded; lifecycle one-shot.'
          }
        ]
      }
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('R:/private/project');
    expect(serialized).not.toContain('R:/canonical/project');
    expect(serialized).not.toContain('private-recipe.xml');
    expect(serialized).not.toContain('grant-1');
    expect(serialized).not.toContain('weather-api');
  });

  it('passes the exact cooperative cancellation context through the authority boundary', async () => {
    const facts = fixture();
    const controller = new AbortController();
    const context: BrokerOperationContext = { signal: controller.signal };
    const observed: Array<BrokerOperationContext | undefined> = [];

    const result = await executionPort((_execution, _nowMs, materializerContext) => {
      observed.push(materializerContext);
      return Promise.resolve(brokerOk(facts.completion));
    }).execute(request(), 1_000, context);

    expect(result.isOk()).toBe(true);
    expect(observed).toEqual([context]);
  });

  it.each([
    ['failed', 23, 'recipe-execution-failed'],
    ['cancelled', null, 'request-cancelled']
  ] as const)('projects a cleaned terminal %s outcome without converting it to a transport defect', async (
    state,
    exitCode,
    code
  ) => {
    const facts = fixture();
    const result = await executionPort(() => Promise.resolve(brokerOk({
      ...facts.completion,
      state,
      exitCode
    }))).execute(request(), 1_000);

    expect(result).toEqual({
      value: expect.objectContaining({ outcome: 'failure', code })
    });
  });

  it('stops before execution when broker-resolved recipe authority drifts', async () => {
    let executions = 0;
    const result = await executionPort(() => {
      executions += 1;
      return Promise.resolve(brokerOk(fixture().completion));
    }).execute(request('execute-recipe', 'stale-caller-revision'), 1_000);

    expect(executions).toBe(0);
    expect(result).toEqual({
      error: [{
        code: 'recipe-drift',
        message: 'Caller recipe revision does not match broker-resolved recipe.'
      }]
    });
  });

  it.each([
    ['synchronous authority defect', {
      canonicalizeRepository: (): ReturnType<BrokerAuthorityPorts['canonicalizeRepository']> => {
        throw new Error('private-authority-sync-detail');
      }
    }],
    ['rejected authority task', {
      canonicalizeRepository: (): ReturnType<BrokerAuthorityPorts['canonicalizeRepository']> =>
        Promise.reject(new Error('private-authority-rejection-detail'))
    }]
  ] as const)('closes and redacts a %s', async (_label, authorityOverrides) => {
    const result = await executionPort(() => Promise.resolve(brokerOk(fixture().completion)), authorityOverrides)
      .execute(request(), 1_000);

    expect(result).toEqual({
      error: [{
        code: 'authority-denied',
        message: 'Repository-scoped recipe authority is unavailable.'
      }]
    });
    expect(JSON.stringify(result)).not.toContain('private-authority');
  });

  it.each([
    ['synchronous throw', (): Promise<BrokerResult<AuthorizedRecipeExecutionCompletion>> => {
      throw new Error('private-executor-sync-detail');
    }],
    ['rejected task', () => Promise.reject(new Error('private-executor-rejection-detail'))]
  ] as const)('closes and redacts an executor %s', async (_label, executeToTerminal) => {
    const result = await executionPort(executeToTerminal).execute(request(), 1_000);

    expect(result).toEqual({
      error: [{
        code: 'receiver-failed',
        message: 'Authorized recipe execution failed.'
      }]
    });
    expect(JSON.stringify(result)).not.toContain('private-executor');
  });

  it('preserves an executor typed failure without converting it into a rejected task', async () => {
    const result = await executionPort(() => Promise.resolve(brokerErr({
      code: 'receiver-conflict',
      message: 'The exact receiver slot is already owned.'
    }))).execute(request(), 1_000);

    expect(result).toEqual({
      error: [{
        code: 'receiver-conflict',
        message: 'The exact receiver slot is already owned.'
      }]
    });
  });

  it('delegates every non-execution operation to the injected fallback with the original request and time', async () => {
    const observed: Readonly<{
      request: BrokerRequestMessage;
      nowMs: number;
      context: BrokerOperationContext | undefined;
    }>[] = [];
    const fallbackOutcome: BrokerOperationOutcome = {
      outcome: 'success',
      code: 'fallback-status',
      message: 'Fallback status is ready.',
      progress: [{ phase: 'fallback', detail: 'Status was inspected.' }]
    };
    const fallback: BrokerOperationPort = {
      execute: (fallbackRequest, nowMs, context) => {
        observed.push({ request: fallbackRequest, nowMs, context });
        return Promise.resolve(brokerOk(fallbackOutcome));
      }
    };
    let executions = 0;
    const statusRequest = request('status');
    const controller = new AbortController();
    const context: BrokerOperationContext = { signal: controller.signal };
    const result = await executionPort(() => {
      executions += 1;
      return Promise.resolve(brokerOk(fixture().completion));
    }, {}, fallback).execute(statusRequest, 1_111, context);

    expect(result).toEqual({ value: fallbackOutcome });
    expect(observed).toEqual([{ request: statusRequest, nowMs: 1_111, context }]);
    expect(executions).toBe(0);
  });

  it.each([
    ['synchronous throw', (): Promise<BrokerResult<BrokerOperationOutcome>> => {
      throw new Error('private-fallback-sync-detail');
    }],
    ['rejected task', () => Promise.reject(new Error('private-fallback-rejection-detail'))]
  ] as const)('closes and redacts a fallback %s', async (_label, execute) => {
    const result = await executionPort(
      () => Promise.resolve(brokerOk(fixture().completion)),
      {},
      { execute }
    ).execute(request('doctor'), 1_000);

    expect(result).toEqual({
      error: [{ code: 'receiver-failed', message: 'Broker fallback operation failed.' }]
    });
    expect(JSON.stringify(result)).not.toContain('private-fallback');
  });

  it('rejects forged or unbounded terminal completion facts before diagnostic projection', async () => {
    const forged = {
      attemptId: `attempt-${'x'.repeat(4_096)}`,
      lifecycle: 'service',
      state: 'succeeded',
      exitCode: 0,
      cleanup: 'complete'
    } as AuthorizedRecipeExecutionCompletion;
    const result = await executionPort(() => Promise.resolve(brokerOk(forged))).execute(request(), 1_000);

    expect(result).toEqual({
      error: [{ code: 'receiver-failed', message: 'Authorized recipe execution failed.' }]
    });
    expect(JSON.stringify(result)).not.toContain('xxxxxxxx');
  });

  it('rejects an unbounded fallback outcome at the operation boundary', async () => {
    const fallback: BrokerOperationPort = {
      execute: () => Promise.resolve(brokerOk({
        outcome: 'success',
        code: 'fallback-status',
        message: 'x'.repeat(2_049),
        progress: []
      }))
    };
    const result = await executionPort(
      () => Promise.resolve(brokerOk(fixture().completion)),
      {},
      fallback
    ).execute(request('status'), 1_000);

    expect(result).toEqual({
      error: [{ code: 'ipc-invalid', message: 'Broker operation emitted invalid diagnostic metadata.' }]
    });
  });
});
