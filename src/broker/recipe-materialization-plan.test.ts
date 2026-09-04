import type { BrokerRequestMessage } from '../broker-client/ipc.ts';
import {
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs
} from '../broker-client/primitives.ts';
import {
  decodeAndAdmitRecipeXml,
  type AdmittedRecipe,
  type NormalizedRecipe
} from '../recipe-contract/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';
import {
  planAuthorizedRecipeMaterialization,
  RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
  type RecipeMaterializationPlanningPorts
} from './recipe-materialization-plan.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

import { describe, expect, it, vi } from 'vitest';

const REPOSITORY = 'R:\\Code\\repository';
const WORKING_DIRECTORY = 'R:\\Code\\repository\\packages\\api';
const TARGET_ENTRYPOINT = 'R:\\Code\\repository\\packages\\api\\src\\main.ts';
const BUN_EXECUTABLE = 'C:\\Tools\\mise\\installs\\bun\\1.4.0\\bun.exe';
const BROKER_ENTRYPOINT = 'R:\\Code\\nebular\\dist\\broker.js';
const REVISION = 'revision-0123456789abcdef';
const RECIPE_LOCATOR = '.nebular/recipes/weather.xml';

const recipeXml = `
<recipe schema="wx.recipe/v1" id="weather-once" kind="entrypoint" status="active" receiver="pm2" lifecycle="one-shot">
  <source tool="bun" doc="private-doc-canary" />
  <exec name="weather-once" cwd="packages/api" tool="bun">
    <arg>src/main.ts</arg>
    <arg>--format=json</arg>
    <env name="REGION" value="west" />
    <env name="MODE" value="development" />
  </exec>
  <stop-policy value="ephemeral-safe-to-stop" />
  <timeout ms="24000" />
  <credential-slot id="alerts" provider="private-provider-canary" account="private-account-canary" environment="development" delivery="environment" inject="ALERTS_KEY">
    <operation>private-operation-canary</operation>
    <scope>private-scope-canary</scope>
  </credential-slot>
  <credential-slot id="weather" provider="weather" environment="development" delivery="environment" inject="WEATHER_KEY">
    <operation>forecast.read</operation>
  </credential-slot>
</recipe>`;

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const admittedRecipe = (): AdmittedRecipe => {
  const result = decodeAndAdmitRecipeXml(recipeXml);
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const request = (): BrokerRequestMessage => {
  const requestId = parseBrokerRequestId('materialization-request-1');
  const sequence = parseBrokerSequence(1);
  const sentAtMs = parseBrokerTimestampMs(1_000);
  if (requestId.isErr() || sequence.isErr() || sentAtMs.isErr()) {
    throw new Error('request fixture is invalid');
  }
  return {
    protocolVersion: 1,
    messageKind: 'request',
    requestId: requestId.value,
    sequence: sequence.value,
    sentAtMs: sentAtMs.value,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:\\untrusted-hint-canary',
      recipePathHint: RECIPE_LOCATOR,
      recipeRevision: REVISION,
      credentialSlotIds: ['alerts', 'weather']
    }
  };
};

const authorizedExecution = (): AuthorizedExecution => {
  const recipe = admittedRecipe();
  const repository = unwrapBroker(parseCanonicalRepository(REPOSITORY));
  const revision = unwrapBroker(parseRecipeRevision(REVISION));
  const alerts = unwrapBroker(parseCredentialSlotId('alerts'));
  const weather = unwrapBroker(parseCredentialSlotId('weather'));
  const grantId = unwrapBroker(parseGrantId('grant-1'));
  return {
    request: request(),
    recipe: {
      repository,
      relativePath: RECIPE_LOCATOR,
      revision,
      credentialSlotIds: [alerts, weather],
      admittedRecipe: recipe
    },
    grant: {
      id: grantId,
      generation: 3,
      repository,
      recipeRevision: revision,
      credentialSlotIds: [alerts, weather],
      expiresAtMs: 100_000,
      revoked: false
    },
    admittedSlotIds: [alerts, weather]
  };
};

const planningPorts = (): RecipeMaterializationPlanningPorts => ({
  paths: {
    resolveWorkingDirectory: input => Promise.resolve(brokerOk({
      kind: 'canonical-windows-working-directory',
      value: WORKING_DIRECTORY,
      repository: input.repository,
      relativePath: {
        kind: 'repository-relative-windows-directory',
        value: input.declaredCwd.replaceAll('\\', '/')
      }
    }))
  },
  tools: {
    resolve: () => Promise.resolve(brokerOk({
      kind: 'cooperative-bun-v1',
      executable: { kind: 'canonical-current-bun-executable', value: BUN_EXECUTABLE },
      brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: BROKER_ENTRYPOINT }
    }))
  },
  targetEntrypoints: {
    resolveTargetEntrypoint: input => Promise.resolve(brokerOk({
      kind: 'canonical-windows-target-entrypoint',
      value: TARGET_ENTRYPOINT,
      repository: input.repository,
      workingDirectory: input.workingDirectory,
      relativePath: {
        kind: 'repository-relative-windows-target-entrypoint',
        value: input.declaredEntrypoint
      }
    }))
  }
});

const withSemantic = (
  execution: AuthorizedExecution,
  project: (semantic: NormalizedRecipe) => NormalizedRecipe
): AuthorizedExecution => ({
  ...execution,
  recipe: {
    ...execution.recipe,
    admittedRecipe: {
      state: 'admitted',
      semantic: project(execution.recipe.admittedRecipe.semantic)
    }
  }
});

const withExecution = (
  semantic: NormalizedRecipe,
  project: (execution: NonNullable<NormalizedRecipe['execution']>) => NonNullable<NormalizedRecipe['execution']>
): NormalizedRecipe => {
  if (semantic.execution === undefined) throw new Error('execution fixture is missing');
  return { ...semantic, execution: project(semantic.execution) };
};

describe('authorized recipe materialization plan seam', () => {
  it('projects the minimum direct cooperative Bun plan without credential authority or secret references', async () => {
    const result = await planAuthorizedRecipeMaterialization(authorizedExecution(), planningPorts());
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value).toEqual(expect.objectContaining({
      state: 'planned',
      targetContract: 'windows-direct-cooperative-bun-v1',
      platform: 'win32',
      receiver: 'pm2',
      lifecycle: 'one-shot',
      stopPolicy: 'ephemeral-safe-to-stop',
      requestId: 'materialization-request-1',
      repository: REPOSITORY,
      recipeLocator: { kind: 'checked-in-recipe-locator', value: RECIPE_LOCATOR },
      recipeRevision: REVISION,
      authority: {
        grantId: 'grant-1',
        grantGeneration: 3,
        grantExpiresAtMs: 100_000
      },
      declaredProcessName: 'weather-once',
      tool: {
        kind: 'cooperative-bun-v1',
        executable: { kind: 'canonical-current-bun-executable', value: BUN_EXECUTABLE },
        brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: BROKER_ENTRYPOINT }
      },
      workingDirectory: expect.objectContaining({ value: WORKING_DIRECTORY }),
      targetEntrypoint: expect.objectContaining({
        kind: 'canonical-windows-target-entrypoint',
        value: TARGET_ENTRYPOINT,
        relativePath: {
          kind: 'repository-relative-windows-target-entrypoint',
          value: 'src/main.ts'
        }
      }),
      argv: ['src/main.ts', '--format=json'],
      timeoutMs: 24_000,
      nonsecretEnvironment: [
        { name: 'MODE', value: 'development' },
        { name: 'REGION', value: 'west' }
      ],
      credentialSlots: [
        { slotId: 'alerts', injectionName: 'ALERTS_KEY' },
        { slotId: 'weather', injectionName: 'WEATHER_KEY' }
      ],
      redactedDigestInput: expect.objectContaining({
        kind: 'redacted-recipe-materialization-digest-input',
        domain: RECIPE_MATERIALIZATION_DIGEST_DOMAIN
      })
    }));

    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain('private-provider-canary');
    expect(serialized).not.toContain('private-account-canary');
    expect(serialized).not.toContain('private-operation-canary');
    expect(serialized).not.toContain('private-scope-canary');
    expect(serialized).not.toContain('private-doc-canary');
    expect(serialized).not.toContain('untrusted-hint-canary');
    expect(serialized).not.toContain('credentialReference');
    expect(serialized).not.toContain('credentialBindings');
  });

  it('is deterministic across input ordering and remains independent of a PM2 slot', async () => {
    const original = authorizedExecution();
    const reordered = withSemantic(original, semantic => ({
      ...withExecution(semantic, execution => ({
        ...execution,
        environment: [...execution.environment].reverse()
      })),
      credentialSlots: [...semantic.credentialSlots].reverse()
    }));
    const reorderedExecution: AuthorizedExecution = {
      ...reordered,
      admittedSlotIds: [...reordered.admittedSlotIds].reverse()
    };
    const [first, second, replay] = await Promise.all([
      planAuthorizedRecipeMaterialization(original, planningPorts()),
      planAuthorizedRecipeMaterialization(reorderedExecution, planningPorts()),
      planAuthorizedRecipeMaterialization(original, planningPorts())
    ]);

    expect(first.isOk() && second.isOk() && replay.isOk()).toBe(true);
    if (first.isErr() || second.isErr() || replay.isErr()) return;
    expect(first.value.redactedDigestInput.canonicalJson)
      .toBe(second.value.redactedDigestInput.canonicalJson);
    expect(first.value.redactedDigestInput.canonicalJson)
      .toBe(replay.value.redactedDigestInput.canonicalJson);
    expect(first.value.redactedDigestInput.canonicalJson).not.toContain('slotName');
    expect(first.value.redactedDigestInput.canonicalJson).not.toContain('pm2-entry:');
  });

  it.each([
    ['long-lived lifecycle', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, lifecycle: 'long-lived', stopPolicy: 'service-safe-to-stop'
    })],
    ['service lifecycle', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, lifecycle: 'service', stopPolicy: 'service-safe-to-stop'
    })],
    ['observe-only receiver', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, receiver: 'observe-only', stopPolicy: 'observe-only'
    })],
    ['manual stop policy', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, stopPolicy: 'manual-stop-only'
    })],
    ['Mise tool', (semantic: NormalizedRecipe): NormalizedRecipe =>
      withExecution(semantic, execution => ({ ...execution, tool: 'mise' }))],
    ['cmd shell', (semantic: NormalizedRecipe): NormalizedRecipe =>
      withExecution(semantic, execution => ({ ...execution, tool: 'cmd.exe' }))],
    ['native executable', (semantic: NormalizedRecipe): NormalizedRecipe =>
      withExecution(semantic, execution => ({ ...execution, tool: 'R:\\bin\\native.exe' }))],
    ['Mise task provenance', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, source: { tool: 'mise', task: 'run-app' }
    })],
    ['shell command provenance', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, source: { command: 'cmd /c app' }
    })],
    ['unmaterialized ports', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, ports: [{ name: 'http', value: '8080' }]
    })],
    ['unmaterialized probes', (semantic: NormalizedRecipe): NormalizedRecipe => ({
      ...semantic, probes: [{ url: 'http://127.0.0.1:8080/ready' }]
    })]
  ] as const)('rejects %s before path or tool effects', async (_label, project) => {
    const paths = vi.fn(() => Promise.resolve(brokerErr({
      code: 'repository-invalid' as const,
      message: 'must not run'
    })));
    const tools = vi.fn(() => Promise.resolve(brokerErr({
      code: 'receiver-unavailable' as const,
      message: 'must not run'
    })));
    const targetEntrypoints = vi.fn(() => Promise.resolve(brokerErr({
      code: 'receiver-unavailable' as const,
      message: 'must not run'
    })));
    const execution = withSemantic(authorizedExecution(), project);
    const result = await planAuthorizedRecipeMaterialization(execution, {
      paths: { resolveWorkingDirectory: paths },
      tools: { resolve: tools },
      targetEntrypoints: { resolveTargetEntrypoint: targetEntrypoints }
    });

    expect(result.isErr()).toBe(true);
    expect(paths).not.toHaveBeenCalled();
    expect(tools).not.toHaveBeenCalled();
    expect(targetEntrypoints).not.toHaveBeenCalled();
  });

  it.each([
    ['bun run task', ['run', 'app']],
    ['inline evaluation', ['--eval', 'console.log(1)']],
    ['absolute entrypoint', ['R:\\app.ts']],
    ['parent entrypoint', ['../app.ts']],
    ['extensionless entrypoint', ['app']]
  ] as const)('rejects non-direct Bun argv mode: %s', async (_label, argv) => {
    const execution = withSemantic(authorizedExecution(), semantic =>
      withExecution(semantic, target => ({ ...target, argv })));
    const result = await planAuthorizedRecipeMaterialization(execution, planningPorts());

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
  });

  it.each([
    'API_TOKEN',
    'PASSWORD',
    'PATH',
    'NODE_OPTIONS',
    'NEBULAR_PM2_ATTEMPT_ID',
    'NEBULAR_BROKER_ENTRYPOINT',
    'nebular_pm2_attempt_id',
    'nebular_broker_entrypoint'
  ])(
    'rejects secret-shaped or runtime-authority environment name %s', async name => {
      const execution = withSemantic(authorizedExecution(), semantic =>
        withExecution(semantic, target => ({
          ...target,
          environment: [{ name: { kind: 'injection-name', value: name }, value: 'canary' }]
        })));
      const result = await planAuthorizedRecipeMaterialization(execution, planningPorts());

      expect(result.isErr()).toBe(true);
      expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
    }
  );

  it.each(['PATH', 'NEBULAR_PM2_JOB_IDENTITY', 'nebular_broker_entrypoint'])(
    'rejects reserved credential injection name %s before planning effects', async name => {
      const execution = withSemantic(authorizedExecution(), semantic => ({
        ...semantic,
        credentialSlots: semantic.credentialSlots.map((slot, index) => index === 0
          ? { ...slot, inject: { ...slot.inject, value: name } }
          : slot)
      }));
      const result = await planAuthorizedRecipeMaterialization(execution, planningPorts());

      expect(result.isErr()).toBe(true);
      expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
    }
  );

  it('maps rejected planning capabilities to redacted typed outcomes', async () => {
    const canary = 'planning-port-private-canary';
    const ports: RecipeMaterializationPlanningPorts = {
      paths: { resolveWorkingDirectory: () => Promise.reject(new Error(canary)) },
      tools: { resolve: () => Promise.reject(new Error(canary)) },
      targetEntrypoints: { resolveTargetEntrypoint: () => Promise.reject(new Error(canary)) }
    };
    const result = await planAuthorizedRecipeMaterialization(authorizedExecution(), ports);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-unavailable');
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it('binds the digest to the canonical target while preserving lexical argv', async () => {
    const firstPorts = planningPorts();
    const secondPorts = planningPorts();
    const secondTarget = 'R:\\Code\\repository\\packages\\api\\src\\canonical-main.ts';
    const changedExecution = withSemantic(authorizedExecution(), semantic =>
      withExecution(semantic, target => ({
        ...target,
        argv: ['src/canonical-main.ts', '--format=json']
      })));
    const first = await planAuthorizedRecipeMaterialization(authorizedExecution(), firstPorts);
    const second = await planAuthorizedRecipeMaterialization(changedExecution, {
      ...secondPorts,
      targetEntrypoints: {
        resolveTargetEntrypoint: input => Promise.resolve(brokerOk({
          kind: 'canonical-windows-target-entrypoint',
          value: secondTarget,
          repository: input.repository,
          workingDirectory: input.workingDirectory,
          relativePath: {
            kind: 'repository-relative-windows-target-entrypoint',
            value: input.declaredEntrypoint
          }
        }))
      }
    });

    expect(first.isOk() && second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) return;
    expect(first.value.argv).toEqual(['src/main.ts', '--format=json']);
    expect(second.value.argv).toEqual(['src/canonical-main.ts', '--format=json']);
    expect(JSON.parse(first.value.redactedDigestInput.canonicalJson)).toContain(TARGET_ENTRYPOINT);
    expect(JSON.parse(second.value.redactedDigestInput.canonicalJson)).toContain(secondTarget);
    expect(second.value.redactedDigestInput.canonicalJson)
      .not.toBe(first.value.redactedDigestInput.canonicalJson);
  });

  it('rejects a target capability whose canonical path is inconsistent with cwd and argv[0]', async () => {
    const ports = planningPorts();
    const result = await planAuthorizedRecipeMaterialization(authorizedExecution(), {
      ...ports,
      targetEntrypoints: {
        resolveTargetEntrypoint: input => Promise.resolve(brokerOk({
          kind: 'canonical-windows-target-entrypoint',
          value: 'R:\\Code\\repository\\elsewhere\\main.ts',
          repository: input.repository,
          workingDirectory: input.workingDirectory,
          relativePath: {
            kind: 'repository-relative-windows-target-entrypoint',
            value: input.declaredEntrypoint
          }
        }))
      }
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
  });

  it('rejects inconsistent high-level capability facts instead of constructing a plan', async () => {
    const ports = planningPorts();
    const result = await planAuthorizedRecipeMaterialization(authorizedExecution(), {
      ...ports,
      paths: {
        resolveWorkingDirectory: input => Promise.resolve(brokerOk({
          kind: 'canonical-windows-working-directory',
          value: 'R:\\Code\\other',
          repository: input.repository,
          relativePath: { kind: 'repository-relative-windows-directory', value: 'other' }
        }))
      }
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
  });
});
