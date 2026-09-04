import { win32 } from 'node:path';

import type { BrokerRequestId } from '../broker-client/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import {
  parseCheckedInRecipeLocator,
  type CheckedInRecipeLocator
} from './journal.ts';
import type {
  CanonicalRepository,
  CredentialSlotId,
  GrantId,
  RecipeRevision
} from './primitives.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';
import { brokerErr, brokerOk, type BrokerIssue, type BrokerResult } from './result.ts';
import {
  isCanonicalLocalWindowsAbsolutePath,
  parseRepositoryRelativeWindowsDirectory,
  type CanonicalWindowsWorkingDirectory,
  type WindowsExecutionPathResolverPort
} from './windows-execution-paths.ts';
import {
  COOPERATIVE_BUN_TOOL_DECLARATION,
  type CanonicalWindowsTargetEntrypoint,
  type ResolvedCooperativeBunTool,
  type WindowsExecutionTargetEntrypointResolverPort,
  type WindowsExecutionToolRegistryPort
} from './windows-tool-registry.ts';

export const RECIPE_MATERIALIZATION_PLAN_SCHEMA =
  'epsilonode.nebular.recipe-materialization-plan/v1' as const;
export const RECIPE_MATERIALIZATION_DIGEST_DOMAIN =
  'epsilonode.nebular.recipe-materialization-plan-digest/v1' as const;
export const RECIPE_MATERIALIZATION_MAX_ARGUMENTS = 256;
export const RECIPE_MATERIALIZATION_MAX_ARGUMENT_BYTES = 4_096;
export const RECIPE_MATERIALIZATION_MAX_ENVIRONMENT_ENTRIES = 64;
export const RECIPE_MATERIALIZATION_MAX_CREDENTIAL_SLOTS = 32;

export type RecipeMaterializationNonsecretEnvironmentEntry = Readonly<{
  name: string;
  value: string;
}>;

export type RecipeMaterializationCredentialSlot = Readonly<{
  slotId: CredentialSlotId;
  injectionName: string;
}>;

export type RedactedRecipeMaterializationDigestInput = Readonly<{
  kind: 'redacted-recipe-materialization-digest-input';
  domain: typeof RECIPE_MATERIALIZATION_DIGEST_DOMAIN;
  canonicalJson: string;
}>;

export type RedactedRecipeMaterializationAuthority = Readonly<{
  grantId: GrantId;
  grantGeneration: number;
  grantExpiresAtMs: number;
}>;

/**
 * Slot-independent admitted input for the later exact-slot launch finalizer.
 * It intentionally contains no credential reference, lease, or secret value.
 */
export type RecipeMaterializationPlan = Readonly<{
  state: 'planned';
  schema: typeof RECIPE_MATERIALIZATION_PLAN_SCHEMA;
  targetContract: 'windows-direct-cooperative-bun-v1';
  platform: 'win32';
  receiver: 'pm2';
  lifecycle: 'one-shot';
  stopPolicy: 'ephemeral-safe-to-stop';
  requestId: BrokerRequestId;
  repository: CanonicalRepository;
  recipeLocator: CheckedInRecipeLocator;
  recipeRevision: RecipeRevision;
  authority: RedactedRecipeMaterializationAuthority;
  declaredProcessName: string;
  tool: ResolvedCooperativeBunTool;
  workingDirectory: CanonicalWindowsWorkingDirectory;
  targetEntrypoint: CanonicalWindowsTargetEntrypoint;
  argv: readonly string[];
  timeoutMs: number;
  nonsecretEnvironment: readonly RecipeMaterializationNonsecretEnvironmentEntry[];
  credentialSlots: readonly RecipeMaterializationCredentialSlot[];
  redactedDigestInput: RedactedRecipeMaterializationDigestInput;
}>;

export type RecipeMaterializationPlanningPorts = Readonly<{
  paths: WindowsExecutionPathResolverPort;
  tools: WindowsExecutionToolRegistryPort;
  targetEntrypoints: WindowsExecutionTargetEntrypointResolverPort;
}>;

export type RecipeMaterializationCanonicalProjection = Omit<
  RecipeMaterializationPlan,
  'redactedDigestInput'
>;

type PureRecipeMaterializationInput = Readonly<{
  requestId: BrokerRequestId;
  repository: CanonicalRepository;
  recipeLocator: CheckedInRecipeLocator;
  recipeRevision: RecipeRevision;
  authority: RedactedRecipeMaterializationAuthority;
  declaredProcessName: string;
  declaredCwd: string;
  declaredTool: typeof COOPERATIVE_BUN_TOOL_DECLARATION;
  argv: readonly string[];
  timeoutMs: number;
  nonsecretEnvironment: readonly RecipeMaterializationNonsecretEnvironmentEntry[];
  credentialSlots: readonly RecipeMaterializationCredentialSlot[];
}>;

const invalidPlan = (message: string = 'Recipe materialization plan is invalid.'): BrokerIssue => ({
  code: 'process-plan-invalid',
  message
});

const invalid = <Value>(message?: string): BrokerResult<Value> => brokerErr(invalidPlan(message));

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const sameTextSet = (left: readonly string[], right: readonly string[]): boolean => {
  const canonicalLeft: readonly string[] = [...new Set(left)].toSorted(compareText);
  const canonicalRight: readonly string[] = [...new Set(right)].toSorted(compareText);
  return canonicalLeft.length === left.length && canonicalRight.length === right.length &&
    canonicalLeft.length === canonicalRight.length &&
    canonicalLeft.every((value, index) => value === canonicalRight[index]);
};

const sensitiveEnvironmentName = (name: string): boolean =>
  /(?:secret|token|credential|password|passphrase|api[_-]?key|pin)/iu.test(name);

const forbiddenEnvironmentNames = [
  'BUN_OPTIONS',
  'CLASSPATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'JAVA_TOOL_OPTIONS',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NEBULAR_BROKER_ENTRYPOINT',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYOPT',
  '_JAVA_OPTIONS'
] as const;

const validNonsecretEnvironmentName = (name: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name) &&
  !name.toUpperCase().startsWith('NEBULAR_') &&
  !sensitiveEnvironmentName(name) &&
  !forbiddenEnvironmentNames.some(forbidden => forbidden === name.toUpperCase());

const validCredentialInjectionName = (name: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name) &&
  !name.toUpperCase().startsWith('NEBULAR_') &&
  !forbiddenEnvironmentNames.some(forbidden => forbidden === name.toUpperCase());

const validEnvironment = (
  entries: readonly Readonly<{ name: Readonly<{ value: string }>; value: string }>[],
  injectionNames: readonly string[]
): BrokerResult<readonly RecipeMaterializationNonsecretEnvironmentEntry[]> => {
  const projected: readonly RecipeMaterializationNonsecretEnvironmentEntry[] = entries.map(entry => ({
    name: entry.name.value,
    value: entry.value
  }));
  const foldedNames: readonly string[] = projected.map(entry => entry.name.toUpperCase());
  const foldedInjections: readonly string[] = injectionNames.map(name => name.toUpperCase());
  return projected.length <= RECIPE_MATERIALIZATION_MAX_ENVIRONMENT_ENTRIES &&
    projected.every(entry => validNonsecretEnvironmentName(entry.name) &&
      entry.value.length <= RECIPE_MATERIALIZATION_MAX_ARGUMENT_BYTES && !entry.value.includes('\0')) &&
    new Set(foldedNames).size === foldedNames.length &&
    foldedNames.every(name => !foldedInjections.includes(name))
    ? brokerOk(projected.toSorted((left, right) => compareText(left.name, right.name)))
    : invalid('Declared nonsecret recipe environment is invalid or reserved.');
};

const validBunEntrypoint = (value: string): boolean => {
  const segments: readonly string[] = value.split('/');
  return value.length > 0 && value.length <= RECIPE_MATERIALIZATION_MAX_ARGUMENT_BYTES &&
    !value.includes('\0') && !value.includes('\\') && !value.startsWith('/') && !value.startsWith('-') &&
    !/^[A-Za-z]:/u.test(value) && segments.every(segment => segment.length > 0 && segment !== '.' &&
      segment !== '..' && !/[<>:"|?*]/u.test(segment)) &&
    /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u.test(value);
};

const validArguments = (argv: readonly string[]): BrokerResult<readonly string[]> =>
  argv.length > 0 && argv.length <= RECIPE_MATERIALIZATION_MAX_ARGUMENTS &&
  argv.every(argument => argument.length > 0 &&
    new TextEncoder().encode(argument).byteLength <= RECIPE_MATERIALIZATION_MAX_ARGUMENT_BYTES &&
    !argument.includes('\0')) && argv[0] !== undefined && validBunEntrypoint(argv[0])
    ? brokerOk([...argv])
    : invalid('Direct cooperative Bun arguments are invalid.');

const validDeclaredProcessName = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);

const directBunSource = (
  source: AuthorizedExecution['recipe']['admittedRecipe']['semantic']['source']
): boolean => source === undefined || (source.task === undefined && source.command === undefined &&
  (source.tool === undefined || source.tool === COOPERATIVE_BUN_TOOL_DECLARATION));

const admittedExecutionShape = (execution: AuthorizedExecution): boolean => {
  const semantic = execution.recipe.admittedRecipe.semantic;
  const target = semantic.execution;
  const grant = execution.grant;
  return execution.request.payload.operation === 'execute-recipe' &&
    semantic.receiver === 'pm2' && semantic.lifecycle === 'one-shot' &&
    semantic.stopPolicy === 'ephemeral-safe-to-stop' && target !== undefined &&
    target.tool === COOPERATIVE_BUN_TOOL_DECLARATION && validDeclaredProcessName(target.processName) &&
    directBunSource(semantic.source) && semantic.ports.length === 0 && semantic.probes.length === 0 &&
    Number.isSafeInteger(semantic.timeoutMs) && semantic.timeoutMs > 0 &&
    Number.isSafeInteger(grant.generation) && grant.generation > 0 &&
    Number.isSafeInteger(grant.expiresAtMs) && grant.expiresAtMs > 0 && !grant.revoked &&
    grant.repository === execution.recipe.repository && grant.recipeRevision === execution.recipe.revision &&
    sameTextSet(grant.credentialSlotIds.map(slotId => String(slotId)),
      execution.admittedSlotIds.map(slotId => String(slotId)));
};

const materializationSlots = (
  execution: AuthorizedExecution
): BrokerResult<readonly RecipeMaterializationCredentialSlot[]> => {
  const recipeSlots: AuthorizedExecution['recipe']['admittedRecipe']['semantic']['credentialSlots'] =
    execution.recipe.admittedRecipe.semantic.credentialSlots;
  const recipeSlotIds: readonly string[] = recipeSlots.map(slot => slot.id.value);
  const admittedSlotIds: readonly string[] = execution.admittedSlotIds.map(slotId => String(slotId));
  const injectionNames: readonly string[] = recipeSlots.map(slot => slot.inject.value);
  if (recipeSlots.length > RECIPE_MATERIALIZATION_MAX_CREDENTIAL_SLOTS ||
      !sameTextSet(recipeSlotIds, admittedSlotIds) ||
      new Set(injectionNames.map(name => name.toUpperCase())).size !== injectionNames.length ||
      !injectionNames.every(validCredentialInjectionName)) {
    return invalid('Recipe credential-slot declarations are invalid.');
  }
  const projected: readonly (RecipeMaterializationCredentialSlot | null)[] = recipeSlots.map(
    (slot): RecipeMaterializationCredentialSlot | null => {
    const slotId = execution.admittedSlotIds.find(candidate => String(candidate) === slot.id.value);
    return slotId === undefined ? null : { slotId, injectionName: slot.inject.value };
    }
  );
  const complete: readonly RecipeMaterializationCredentialSlot[] = projected.flatMap(
    (slot): readonly RecipeMaterializationCredentialSlot[] => slot === null ? [] : [slot]
  );
  return complete.length === projected.length
    ? brokerOk(complete.toSorted((left, right) =>
        compareText(String(left.slotId), String(right.slotId))))
    : invalid('Recipe credential-slot declarations are invalid.');
};

const checkedInRecipeLocator = (relativePath: string): BrokerResult<CheckedInRecipeLocator> => {
  const locator = parseCheckedInRecipeLocator(relativePath);
  return locator.type === 'ok'
    ? brokerOk(locator.value)
    : invalid('Checked-in recipe locator is invalid.');
};

const pureInput = (execution: AuthorizedExecution): BrokerResult<PureRecipeMaterializationInput> => {
  if (!admittedExecutionShape(execution)) {
    return brokerErr({
      code: 'receiver-incompatible',
      message: 'Only Windows PM2 one-shot direct cooperative Bun recipes are admitted.'
    });
  }
  const target = execution.recipe.admittedRecipe.semantic.execution;
  if (target === undefined) return invalid();
  const locator = checkedInRecipeLocator(execution.recipe.relativePath);
  const slots = materializationSlots(execution);
  const argv = validArguments(target.argv);
  if (locator.isErr()) return brokerErr(...locator.error);
  if (slots.isErr()) return brokerErr(...slots.error);
  if (argv.isErr()) return brokerErr(...argv.error);
  const environment = validEnvironment(
    target.environment,
    slots.value.map(slot => slot.injectionName)
  );
  return environment.isErr()
    ? brokerErr(...environment.error)
    : brokerOk({
        requestId: execution.request.requestId,
        repository: execution.recipe.repository,
        recipeLocator: locator.value,
        recipeRevision: execution.recipe.revision,
        authority: {
          grantId: execution.grant.id,
          grantGeneration: execution.grant.generation,
          grantExpiresAtMs: execution.grant.expiresAtMs
        },
        declaredProcessName: target.processName,
        declaredCwd: target.cwd,
        declaredTool: COOPERATIVE_BUN_TOOL_DECLARATION,
        argv: argv.value,
        timeoutMs: execution.recipe.admittedRecipe.semantic.timeoutMs,
        nonsecretEnvironment: environment.value,
        credentialSlots: slots.value
      });
};

export const canonicalRecipeMaterializationDigestInput = (
  plan: RecipeMaterializationCanonicalProjection
): RedactedRecipeMaterializationDigestInput => ({
  kind: 'redacted-recipe-materialization-digest-input',
  domain: RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
  canonicalJson: JSON.stringify([
    RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
    'win32',
    'pm2',
    'one-shot',
    'ephemeral-safe-to-stop',
    'windows-direct-cooperative-bun-v1',
    plan.repository,
    plan.recipeLocator.value,
    plan.recipeRevision,
    plan.authority.grantId,
    plan.authority.grantGeneration,
    plan.authority.grantExpiresAtMs,
    plan.declaredProcessName,
    plan.tool.kind,
    plan.tool.executable.value,
    plan.tool.brokerEntrypoint.value,
    plan.workingDirectory.value,
    plan.workingDirectory.relativePath.value,
    plan.targetEntrypoint.value,
    plan.targetEntrypoint.relativePath.value,
    plan.argv,
    plan.timeoutMs,
    plan.nonsecretEnvironment.map((entry): readonly [string, string] => [entry.name, entry.value]),
    plan.credentialSlots.map((slot): readonly [string, string] => [String(slot.slotId), slot.injectionName])
  ])
});

const exactWorkingDirectory = (
  input: PureRecipeMaterializationInput,
  value: CanonicalWindowsWorkingDirectory
): boolean => value.repository === input.repository &&
  value.relativePath.value === input.declaredCwd.replaceAll('\\', '/') &&
  value.value.length > 0 && !value.value.includes('\0');

const exactTool = (value: ResolvedCooperativeBunTool): boolean => value.executable.value.length > 0 &&
  !value.executable.value.includes('\0') &&
  value.brokerEntrypoint.value.length > 0 && !value.brokerEntrypoint.value.includes('\0');

const exactTargetEntrypoint = (
  input: PureRecipeMaterializationInput,
  workingDirectory: CanonicalWindowsWorkingDirectory,
  value: CanonicalWindowsTargetEntrypoint
): boolean => {
  const declaredEntrypoint = input.argv[0];
  if (declaredEntrypoint === undefined) return false;
  const expected = win32.join(workingDirectory.value, ...declaredEntrypoint.split('/'));
  return value.repository === input.repository &&
    value.workingDirectory.repository === workingDirectory.repository &&
    value.workingDirectory.value === workingDirectory.value &&
    value.workingDirectory.relativePath.value === workingDirectory.relativePath.value &&
    value.relativePath.value === declaredEntrypoint && value.value === expected &&
    isCanonicalLocalWindowsAbsolutePath(value.value);
};

const unknownField = (value: object, key: string): unknown => Reflect.get(value, key);

const sameCanonicalWorkingDirectory = (
  left: CanonicalWindowsWorkingDirectory,
  right: CanonicalWindowsWorkingDirectory
): boolean => left.value === right.value && left.repository === right.repository &&
  left.relativePath.value === right.relativePath.value;

const validCanonicalWorkingDirectory = (plan: RecipeMaterializationCanonicalProjection): boolean => {
  const relative = parseRepositoryRelativeWindowsDirectory(plan.workingDirectory.relativePath.value);
  if (relative.isErr()) return false;
  const expected = relative.value.value === '.'
    ? plan.repository
    : win32.join(plan.repository, ...relative.value.value.split('/'));
  return unknownField(plan.workingDirectory, 'kind') === 'canonical-windows-working-directory' &&
    plan.workingDirectory.repository === plan.repository &&
    unknownField(plan.workingDirectory.relativePath, 'kind') ===
      'repository-relative-windows-directory' &&
    plan.workingDirectory.relativePath.value === relative.value.value &&
    plan.workingDirectory.value === expected && isCanonicalLocalWindowsAbsolutePath(expected);
};

const validCanonicalTargetEntrypoint = (plan: RecipeMaterializationCanonicalProjection): boolean => {
  const declaredEntrypoint = plan.argv[0];
  if (declaredEntrypoint === undefined ||
      plan.targetEntrypoint.relativePath.value !== declaredEntrypoint) return false;
  const expected = win32.join(plan.workingDirectory.value, ...declaredEntrypoint.split('/'));
  return unknownField(plan.targetEntrypoint, 'kind') === 'canonical-windows-target-entrypoint' &&
    unknownField(plan.targetEntrypoint.relativePath, 'kind') ===
      'repository-relative-windows-target-entrypoint' &&
    plan.targetEntrypoint.repository === plan.repository &&
    sameCanonicalWorkingDirectory(plan.targetEntrypoint.workingDirectory, plan.workingDirectory) &&
    plan.targetEntrypoint.value === expected && isCanonicalLocalWindowsAbsolutePath(expected);
};

const validCanonicalTool = (plan: RecipeMaterializationCanonicalProjection): boolean =>
  unknownField(plan.tool, 'kind') === 'cooperative-bun-v1' &&
  unknownField(plan.tool.executable, 'kind') === 'canonical-current-bun-executable' &&
  unknownField(plan.tool.brokerEntrypoint, 'kind') === 'canonical-broker-entrypoint' &&
  isCanonicalLocalWindowsAbsolutePath(plan.tool.executable.value) &&
  isCanonicalLocalWindowsAbsolutePath(plan.tool.brokerEntrypoint.value) &&
  plan.tool.executable.value !== plan.tool.brokerEntrypoint.value;

const validCanonicalEnvironment = (plan: RecipeMaterializationCanonicalProjection): boolean => {
  const projected = validEnvironment(
    plan.nonsecretEnvironment.map(entry => ({ name: { value: entry.name }, value: entry.value })),
    plan.credentialSlots.map(slot => slot.injectionName)
  );
  return projected.isOk() && projected.value.length === plan.nonsecretEnvironment.length &&
    projected.value.every((entry, index) => {
      const candidate = plan.nonsecretEnvironment[index];
      return candidate !== undefined && candidate.name === entry.name && candidate.value === entry.value;
    });
};

const validCanonicalCredentialSlots = (plan: RecipeMaterializationCanonicalProjection): boolean => {
  const sorted: readonly RecipeMaterializationCredentialSlot[] = [...plan.credentialSlots]
    .toSorted((left, right) =>
    compareText(String(left.slotId), String(right.slotId)));
  return plan.credentialSlots.length > 0 &&
    plan.credentialSlots.length <= RECIPE_MATERIALIZATION_MAX_CREDENTIAL_SLOTS &&
    new Set(plan.credentialSlots.map(slot => String(slot.slotId))).size === plan.credentialSlots.length &&
    plan.credentialSlots.every((slot, index) => parseCredentialSlotId(slot.slotId).isOk() &&
      validCredentialInjectionName(slot.injectionName) && sorted[index]?.slotId === slot.slotId);
};

const validCanonicalAuthority = (plan: RecipeMaterializationCanonicalProjection): boolean =>
  parseGrantId(plan.authority.grantId).isOk() &&
  Number.isSafeInteger(plan.authority.grantGeneration) && plan.authority.grantGeneration > 0 &&
  Number.isSafeInteger(plan.authority.grantExpiresAtMs) && plan.authority.grantExpiresAtMs > 0;

const validCanonicalIdentity = (plan: RecipeMaterializationCanonicalProjection): boolean => {
  const locator = parseCheckedInRecipeLocator(plan.recipeLocator.value);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(plan.requestId) &&
    parseCanonicalRepository(plan.repository).isOk() &&
    isCanonicalLocalWindowsAbsolutePath(plan.repository) &&
    locator.type === 'ok' && unknownField(plan.recipeLocator, 'kind') === 'checked-in-recipe-locator' &&
    locator.value.value === plan.recipeLocator.value && parseRecipeRevision(plan.recipeRevision).isOk() &&
    validDeclaredProcessName(plan.declaredProcessName);
};

export const validateRecipeMaterializationPlan = (plan: RecipeMaterializationPlan): boolean => {
  const argumentsResult = validArguments(plan.argv);
  const rawPlan: Readonly<Record<string, unknown>> = plan;
  const rawDigest: Readonly<Record<string, unknown>> = plan.redactedDigestInput;
  return rawPlan['state'] === 'planned' && rawPlan['schema'] === RECIPE_MATERIALIZATION_PLAN_SCHEMA &&
    rawPlan['targetContract'] === 'windows-direct-cooperative-bun-v1' &&
    rawPlan['platform'] === 'win32' && rawPlan['receiver'] === 'pm2' &&
    rawPlan['lifecycle'] === 'one-shot' && rawPlan['stopPolicy'] === 'ephemeral-safe-to-stop' &&
    validCanonicalIdentity(plan) &&
    validCanonicalAuthority(plan) && validCanonicalTool(plan) && validCanonicalWorkingDirectory(plan) &&
    argumentsResult.isOk() && validCanonicalTargetEntrypoint(plan) &&
    Number.isSafeInteger(plan.timeoutMs) && plan.timeoutMs > 0 &&
    validCanonicalEnvironment(plan) && validCanonicalCredentialSlots(plan) &&
    rawDigest['kind'] === 'redacted-recipe-materialization-digest-input' &&
    rawDigest['domain'] === RECIPE_MATERIALIZATION_DIGEST_DOMAIN &&
    plan.redactedDigestInput.canonicalJson === canonicalRecipeMaterializationDigestInput(plan).canonicalJson;
};

const buildPlan = (
  input: PureRecipeMaterializationInput,
  workingDirectory: CanonicalWindowsWorkingDirectory,
  tool: ResolvedCooperativeBunTool,
  targetEntrypoint: CanonicalWindowsTargetEntrypoint
): BrokerResult<RecipeMaterializationPlan> => {
  if (!exactWorkingDirectory(input, workingDirectory) || !exactTool(tool) ||
      !exactTargetEntrypoint(input, workingDirectory, targetEntrypoint)) {
    return invalid('Materialization capability returned inconsistent canonical facts.');
  }
  const plan: RecipeMaterializationCanonicalProjection = {
      state: 'planned',
      schema: RECIPE_MATERIALIZATION_PLAN_SCHEMA,
      targetContract: 'windows-direct-cooperative-bun-v1',
      platform: 'win32',
      receiver: 'pm2',
      lifecycle: 'one-shot',
      stopPolicy: 'ephemeral-safe-to-stop',
      requestId: input.requestId,
      repository: input.repository,
      recipeLocator: input.recipeLocator,
      recipeRevision: input.recipeRevision,
      authority: input.authority,
      declaredProcessName: input.declaredProcessName,
      tool,
      workingDirectory,
      targetEntrypoint,
      argv: input.argv,
      timeoutMs: input.timeoutMs,
      nonsecretEnvironment: input.nonsecretEnvironment,
      credentialSlots: input.credentialSlots
  };
  return brokerOk({
    ...plan,
    redactedDigestInput: canonicalRecipeMaterializationDigestInput(plan)
  });
};

const portFailure = <Value>(message: string): BrokerResult<Value> => brokerErr({
  code: 'receiver-unavailable',
  message
});

const invokePathPort = (
  input: PureRecipeMaterializationInput,
  port: WindowsExecutionPathResolverPort
): Promise<BrokerResult<CanonicalWindowsWorkingDirectory>> => Promise.resolve()
  .then(() => port.resolveWorkingDirectory({
    repository: input.repository,
    declaredCwd: input.declaredCwd
  }))
  .then(
    result => result,
    () => portFailure('Canonical recipe working-directory capability is unavailable.')
  );

const invokeToolPort = (
  input: PureRecipeMaterializationInput,
  port: WindowsExecutionToolRegistryPort
): Promise<BrokerResult<ResolvedCooperativeBunTool>> => Promise.resolve()
  .then(() => port.resolve({ declaredTool: input.declaredTool }))
  .then(
    result => result,
    () => portFailure('Canonical cooperative Bun tool capability is unavailable.')
  );

const invokeTargetEntrypointPort = (
  input: PureRecipeMaterializationInput,
  workingDirectory: CanonicalWindowsWorkingDirectory,
  port: WindowsExecutionTargetEntrypointResolverPort
): Promise<BrokerResult<CanonicalWindowsTargetEntrypoint>> => Promise.resolve()
  .then(() => port.resolveTargetEntrypoint({
    repository: input.repository,
    workingDirectory,
    declaredEntrypoint: input.argv[0] ?? ''
  }))
  .then(
    result => result,
    () => portFailure('Canonical recipe target-entrypoint capability is unavailable.')
  );

const resolvePlanCapabilities = (
  input: PureRecipeMaterializationInput,
  ports: RecipeMaterializationPlanningPorts
): Promise<BrokerResult<RecipeMaterializationPlan>> => Promise.all([
  invokePathPort(input, ports.paths),
  invokeToolPort(input, ports.tools)
] as const).then((results: readonly [
  BrokerResult<CanonicalWindowsWorkingDirectory>,
  BrokerResult<ResolvedCooperativeBunTool>
]) => {
  const [workingDirectory, tool] = results;
  if (workingDirectory.isErr()) return brokerErr(...workingDirectory.error);
  if (tool.isErr()) return brokerErr(...tool.error);
  return invokeTargetEntrypointPort(input, workingDirectory.value, ports.targetEntrypoints).then(
    targetEntrypoint => targetEntrypoint.isErr()
      ? brokerErr(...targetEntrypoint.error)
      : buildPlan(input, workingDirectory.value, tool.value, targetEntrypoint.value)
  );
});

export const planAuthorizedRecipeMaterialization = (
  execution: AuthorizedExecution,
  ports: RecipeMaterializationPlanningPorts
): Promise<BrokerResult<RecipeMaterializationPlan>> => {
  const input = pureInput(execution);
  return input.isErr()
    ? Promise.resolve(brokerErr(...input.error))
    : resolvePlanCapabilities(input.value, ports);
};
