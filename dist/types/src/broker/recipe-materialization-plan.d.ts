import type { BrokerRequestId } from '../broker-client/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import { type CheckedInRecipeLocator } from './journal.ts';
import type { CanonicalRepository, CredentialSlotId, GrantId, RecipeRevision } from './primitives.ts';
import { type BrokerResult } from './result.ts';
import { type CanonicalWindowsWorkingDirectory, type WindowsExecutionPathResolverPort } from './windows-execution-paths.ts';
import { type CanonicalWindowsTargetEntrypoint, type ResolvedCooperativeBunTool, type WindowsExecutionTargetEntrypointResolverPort, type WindowsExecutionToolRegistryPort } from './windows-tool-registry.ts';
export declare const RECIPE_MATERIALIZATION_PLAN_SCHEMA: "epsilonode.nebular.recipe-materialization-plan/v1";
export declare const RECIPE_MATERIALIZATION_DIGEST_DOMAIN: "epsilonode.nebular.recipe-materialization-plan-digest/v1";
export declare const RECIPE_MATERIALIZATION_MAX_ARGUMENTS = 256;
export declare const RECIPE_MATERIALIZATION_MAX_ARGUMENT_BYTES = 4096;
export declare const RECIPE_MATERIALIZATION_MAX_ENVIRONMENT_ENTRIES = 64;
export declare const RECIPE_MATERIALIZATION_MAX_CREDENTIAL_SLOTS = 32;
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
export type RecipeMaterializationCanonicalProjection = Omit<RecipeMaterializationPlan, 'redactedDigestInput'>;
export declare const canonicalRecipeMaterializationDigestInput: (plan: RecipeMaterializationCanonicalProjection) => RedactedRecipeMaterializationDigestInput;
export declare const validateRecipeMaterializationPlan: (plan: RecipeMaterializationPlan) => boolean;
export declare const planAuthorizedRecipeMaterialization: (execution: AuthorizedExecution, ports: RecipeMaterializationPlanningPorts) => Promise<BrokerResult<RecipeMaterializationPlan>>;
