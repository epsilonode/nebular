import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  clientErr,
  clientOk,
  parseBrokerRequestId,
  type BrokerClientTerminalOutcome,
  type BrokerInheritedIpcReceipt,
  type BrokerInheritedIpcRuntime,
  type BrokerIpcObserver,
  type BrokerIpcSpawnPlan
} from '../broker-client/public.ts';
import {
  parseRecipeRelativePath,
  recipeErr,
  recipeOk,
  RECIPE_XML_MAX_BYTES
} from '../recipe-contract/public.ts';
import {
  createBunNodeRecipeRunnerCliRuntime,
  parseRecipeRunnerCliPlan,
  runRecipeRunnerCli,
  type RecipeRunnerCliRuntime
} from './cli.ts';

const REPOSITORY = 'R:/Code/weather';
const BROKER = 'R:/Code/nebular/broker.ts';
const REVISION = 'a'.repeat(64);

const recipeXml = `<recipe schema="wx.recipe/v1" id="weather" receiver="pm2">
  <timeout ms="20000" />
  <exec name="weather-once" cwd="." tool="mise"><arg>run</arg><arg>weather</arg></exec>
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const receipt = (
  terminal: BrokerClientTerminalOutcome = {
    outcome: 'success',
    code: 'recipe-started',
    message: 'sensitive broker terminal detail'
  }
): BrokerInheritedIpcReceipt => {
  const requestId = parseBrokerRequestId('runner-test-request');
  if (requestId.isErr()) throw new Error('typed request fixture failed');
  return {
    requestId: requestId.value,
    progress: [{ phase: 'private-phase', detail: 'sensitive progress detail' }],
    terminal,
    helperExitCode: terminal.outcome === 'success' ? 0 : 1
  };
};

const runtime = (
  overrides: Partial<RecipeRunnerCliRuntime> = {}
): RecipeRunnerCliRuntime => ({
  workingDirectory: { read: () => REPOSITORY },
  localRecipe: {
    read: () => Promise.resolve({
      type: 'bytes',
      bytes: new TextEncoder().encode(recipeXml)
    })
  },
  digest: { sha256: () => recipeOk(REVISION) },
  brokerControl: { send: () => Promise.resolve(clientOk(receipt())) },
  ...overrides
});

const runArgv = (recipe = 'recipes/weather.xml'): readonly string[] => [
  'run',
  '--grant-id',
  'grant-weather',
  '--recipe',
  recipe,
  '--broker',
  BROKER,
  '--cwd',
  REPOSITORY,
  '--timeout-ms',
  '45000'
];

describe('recipe-runner CLI plan parser', () => {
  it('parses exact doctor and run plans from argv arrays', () => {
    expect(parseRecipeRunnerCliPlan(['doctor', '--broker', BROKER], REPOSITORY)).toEqual(expect.objectContaining({
      value: {
        command: 'doctor',
        brokerEntrypoint: BROKER,
        cwd: REPOSITORY,
        timeoutMs: 30000
      }
    }));
    expect(parseRecipeRunnerCliPlan([
      'doctor', '--cwd', 'R:/Code/other', '--broker', BROKER, '--timeout-ms', '1000'
    ], REPOSITORY)).toEqual(expect.objectContaining({
      value: expect.objectContaining({ cwd: 'R:/Code/other', timeoutMs: 1000 })
    }));
    expect(parseRecipeRunnerCliPlan(runArgv(), REPOSITORY)).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        command: 'run',
        brokerEntrypoint: BROKER,
        repositoryPathHint: REPOSITORY,
        recipePathHint: { kind: 'recipe-relative-path', value: 'recipes/weather.xml' },
        grantIdHint: 'grant-weather',
        timeoutMs: 45000
      })
    }));
  });

  it('rejects missing, duplicate, unknown, trailing, and unbounded arguments', () => {
    const invalid: readonly (readonly string[])[] = [
      [],
      ['unknown'],
      ['doctor'],
      ['doctor', '--broker', BROKER, '--broker', BROKER],
      ['doctor', '--broker', BROKER, '--unknown', 'value'],
      ['doctor', '--broker', BROKER, 'trailing'],
      ['doctor', '--broker', BROKER, '--timeout-ms', '0'],
      ['doctor', '--broker', BROKER, '--timeout-ms', '300001'],
      ['run', '--broker', BROKER, '--cwd', REPOSITORY, '--recipe', 'recipes/weather.xml'],
      ['run', '--broker', BROKER, '--cwd', REPOSITORY, '--recipe', 'recipes/weather.xml', '--grant-id', 'invalid grant']
    ];
    invalid.forEach(argv => expect(parseRecipeRunnerCliPlan(argv, REPOSITORY).isErr()).toBe(true));
  });

  it.each([
    '../secret.xml',
    'recipes/../secret.xml',
    './recipes/weather.xml',
    '/recipes/weather.xml',
    'C:/recipes/weather.xml',
    'recipes//weather.xml'
  ])('rejects the non-checked-in-style locator %s before effects', async recipe => {
    expect(parseRecipeRunnerCliPlan(runArgv(recipe), REPOSITORY).isErr()).toBe(true);
    const read = vi.fn(runtime().localRecipe.read);
    const send = vi.fn(runtime().brokerControl.send);
    const result = await runRecipeRunnerCli(runArgv(recipe), runtime({
      localRecipe: { read },
      brokerControl: { send }
    }));
    expect(result.isErr()).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('recipe-runner CLI execution kernel', () => {
  it('preserves doctor IPC behavior without reading or hashing a recipe', async () => {
    const read = vi.fn(() => Promise.resolve({ type: 'unavailable' } as const));
    const sha256 = vi.fn(() => recipeErr({ code: 'digest-failed', message: 'must not run' }));
    const send = vi.fn(() => Promise.resolve(clientOk(receipt())));
    const result = await runRecipeRunnerCli(
      ['doctor', '--broker', BROKER],
      runtime({ localRecipe: { read }, digest: { sha256 }, brokerControl: { send } })
    );

    expect(result.isOk() ? result.value : undefined).toEqual({
      command: 'doctor',
      outcome: 'success',
      code: 'recipe-started',
      progressCount: 1,
      helperExitCode: 0
    });
    expect(send).toHaveBeenCalledWith({
      brokerEntrypoint: BROKER,
      cwd: REPOSITORY,
      payload: { operation: 'doctor', credentialSlotIds: [] },
      timeoutMs: 30000
    });
    expect(read).not.toHaveBeenCalled();
    expect(sha256).not.toHaveBeenCalled();
  });

  it('admits the local recipe, computes its revision, and sends only authority hints', async () => {
    const read = vi.fn(runtime().localRecipe.read);
    const sha256 = vi.fn(() => Promise.resolve(recipeOk(REVISION)));
    const send = vi.fn(() => Promise.resolve(clientOk(receipt())));
    const result = await runRecipeRunnerCli(
      runArgv(),
      runtime({ localRecipe: { read }, digest: { sha256 }, brokerControl: { send } })
    );

    expect(result.isOk() ? result.value : undefined).toEqual({
      command: 'run',
      outcome: 'success',
      code: 'recipe-started',
      progressCount: 1,
      helperExitCode: 0
    });
    expect(read).toHaveBeenCalledWith({
      repositoryPathHint: REPOSITORY,
      recipePathHint: { kind: 'recipe-relative-path', value: 'recipes/weather.xml' },
      maximumBytes: RECIPE_XML_MAX_BYTES,
      timeoutMs: 3000
    });
    expect(sha256).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      brokerEntrypoint: BROKER,
      cwd: REPOSITORY,
      payload: {
        operation: 'execute-recipe',
        grantIdHint: 'grant-weather',
        repositoryPathHint: REPOSITORY,
        recipePathHint: 'recipes/weather.xml',
        recipeRevision: REVISION,
        credentialSlotIds: ['weather-api']
      },
      timeoutMs: 45000
    });
    expect(JSON.stringify(result)).not.toContain(REPOSITORY);
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('WEATHER_TOKEN');
  });

  it('does not consult ambient cwd when run supplies its repository hint explicitly', async () => {
    const workingDirectory = vi.fn(() => { throw new Error('ambient cwd must not be read'); });
    const result = await runRecipeRunnerCli(runArgv(), runtime({
      workingDirectory: { read: workingDirectory }
    }));

    expect(result.isOk()).toBe(true);
    expect(workingDirectory).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'too-large' as const },
    { type: 'bytes' as const, bytes: new Uint8Array(RECIPE_XML_MAX_BYTES + 1) }
  ])('rejects an oversized local recipe before digest or IPC', async outcome => {
    const sha256 = vi.fn(() => recipeOk(REVISION));
    const send = vi.fn(() => Promise.resolve(clientOk(receipt())));
    const result = await runRecipeRunnerCli(runArgv(), runtime({
      localRecipe: { read: () => Promise.resolve(outcome) },
      digest: { sha256 },
      brokerControl: { send }
    }));

    expect(result.isErr() ? result.error[0] : undefined).toEqual({
      code: 'resource-limit',
      message: 'The local recipe exceeds its byte budget.'
    });
    expect(sha256).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('redacts malformed XML diagnostics and does not contact the broker', async () => {
    const sensitiveMalformedXml = '<recipe schema="wx.recipe/v1"><top-secret-value /></recipe>';
    const send = vi.fn(() => Promise.resolve(clientOk(receipt())));
    const result = await runRecipeRunnerCli(runArgv(), runtime({
      localRecipe: {
        read: () => Promise.resolve({
          type: 'bytes',
          bytes: new TextEncoder().encode(sensitiveMalformedXml)
        })
      },
      brokerControl: { send }
    }));

    expect(result.isErr() ? result.error[0] : undefined).toEqual({
      code: 'invalid-recipe',
      message: 'The local recipe did not pass canonical recipe admission.'
    });
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
    expect(send).not.toHaveBeenCalled();
  });

  it('totalizes synchronous throws and rejected adapter tasks with static diagnostics', async () => {
    const readThrow = await runRecipeRunnerCli(runArgv(), runtime({
      localRecipe: { read: () => { throw new Error('sensitive read failure'); } }
    }));
    const readReject = await runRecipeRunnerCli(runArgv(), runtime({
      localRecipe: { read: () => Promise.reject(new Error('sensitive rejected read')) }
    }));
    const digestReject = await runRecipeRunnerCli(runArgv(), runtime({
      digest: { sha256: () => Promise.reject(new Error('sensitive digest failure')) }
    }));
    const brokerReject = await runRecipeRunnerCli(runArgv(), runtime({
      brokerControl: { send: () => Promise.reject(new Error('sensitive broker failure')) }
    }));

    expect(readThrow.isErr() ? readThrow.error[0].code : undefined).toBe('invalid-input');
    expect(readReject.isErr() ? readReject.error[0].code : undefined).toBe('invalid-input');
    expect(digestReject.isErr() ? digestReject.error[0].code : undefined).toBe('digest-failed');
    expect(brokerReject.isErr() ? brokerReject.error[0].code : undefined).toBe('client-contract-invalid');
    expect(JSON.stringify([readThrow, readReject, digestReject, brokerReject])).not.toContain('sensitive');
  });

  it('returns a bounded receipt and replaces an unsafe terminal code', async () => {
    const result = await runRecipeRunnerCli(runArgv(), runtime({
      brokerControl: {
        send: () => Promise.resolve(clientOk(receipt({
          outcome: 'failure',
          code: 'token=sensitive credential',
          message: 'sensitive broker failure detail'
        })))
      }
    }));

    expect(result.isOk() ? result.value : undefined).toEqual({
      command: 'run',
      outcome: 'failure',
      code: 'broker-terminal',
      progressCount: 1,
      helperExitCode: 1
    });
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('private-phase');
  });
});

describe('Bun/Node recipe-runner CLI adapter', () => {
  it('reads no more than the requested bounded local recipe bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nebular-runner-'));
    const path = parseRecipeRelativePath('recipe.xml');
    if (path.isErr()) throw new Error('typed path fixture failed');
    const ipcRuntime: BrokerInheritedIpcRuntime = {
      nowMs: () => 0,
      newRequestId: () => 'unused-request',
      spawn: (_plan: BrokerIpcSpawnPlan, _observer: BrokerIpcObserver) => clientErr({
        code: 'transport-unavailable',
        message: 'unused test IPC'
      })
    };
    const adapter = createBunNodeRecipeRunnerCliRuntime(ipcRuntime);

    try {
      await writeFile(join(directory, 'recipe.xml'), recipeXml, 'utf8');
      const bounded = await adapter.localRecipe.read({
        repositoryPathHint: directory,
        recipePathHint: path.value,
        maximumBytes: RECIPE_XML_MAX_BYTES,
        timeoutMs: 3000
      });
      await writeFile(join(directory, 'recipe.xml'), new Uint8Array(RECIPE_XML_MAX_BYTES + 1));
      const oversized = await adapter.localRecipe.read({
        repositoryPathHint: directory,
        recipePathHint: path.value,
        maximumBytes: RECIPE_XML_MAX_BYTES,
        timeoutMs: 3000
      });

      expect(bounded.type).toBe('bytes');
      expect(oversized).toEqual({ type: 'too-large' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
