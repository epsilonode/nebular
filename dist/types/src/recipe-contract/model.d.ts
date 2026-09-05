import type { AuthorityAtom, CredentialSlotId, InjectionName, ProviderEnvironment, ProviderId, RecipeId } from './primitives.ts';
export declare const RECIPE_SCHEMA: "wx.recipe/v1";
export declare const RECIPE_CANONICALIZATION: "wx.recipe.canonical/v1";
export type RecipeKind = 'entrypoint' | 'base';
export type RecipeStatus = 'active' | 'deprecated' | 'legacy' | 'retired';
export type RecipeReceiver = 'pm2' | 'observe-only';
export type RecipeLifecycle = 'one-shot' | 'long-lived' | 'service';
export type RecipeStopPolicy = 'ephemeral-safe-to-stop' | 'service-safe-to-stop' | 'manual-stop-only' | 'observe-only';
export type RecipeEnvironmentEntry = Readonly<{
    name: InjectionName;
    value: string;
}>;
export type RecipeSource = Readonly<{
    manifest?: string;
    command?: string;
    task?: string;
    tool?: string;
    doc?: string;
}>;
export type RecipeExecution = Readonly<{
    processName: string;
    cwd: string;
    tool: string;
    argv: readonly string[];
    environment: readonly RecipeEnvironmentEntry[];
}>;
export type RecipePort = Readonly<{
    name: string;
    value?: string;
    rangeStart?: string;
    rangeEnd?: string;
    host?: string;
    hostAlias?: string;
}>;
export type RecipeProbe = Readonly<{
    url: string;
    status?: number;
}>;
export type RecipeCredentialSlot = Readonly<{
    id: CredentialSlotId;
    provider: ProviderId;
    account?: string;
    environment: ProviderEnvironment;
    delivery: 'environment';
    inject: InjectionName;
    operations: readonly AuthorityAtom[];
    scopes: readonly AuthorityAtom[];
}>;
export type RecipeDocument = Readonly<{
    schema: typeof RECIPE_SCHEMA;
    id: RecipeId;
    kind: RecipeKind;
    status: RecipeStatus;
    receiver: RecipeReceiver;
    lifecycle: RecipeLifecycle;
    extendsRecipeId?: RecipeId;
    stopPolicy?: RecipeStopPolicy;
    timeoutMs?: number;
    source?: RecipeSource;
    execution?: RecipeExecution;
    ports: readonly RecipePort[];
    probes: readonly RecipeProbe[];
    credentialSlots: readonly RecipeCredentialSlot[];
}>;
export type NormalizedRecipe = Readonly<{
    schema: typeof RECIPE_SCHEMA;
    canonicalization: typeof RECIPE_CANONICALIZATION;
    id: RecipeId;
    receiver: RecipeReceiver;
    lifecycle: RecipeLifecycle;
    stopPolicy: RecipeStopPolicy;
    timeoutMs: number;
    source?: RecipeSource;
    execution?: RecipeExecution;
    ports: readonly RecipePort[];
    probes: readonly RecipeProbe[];
    credentialSlots: readonly RecipeCredentialSlot[];
}>;
export type AdmittedRecipe = Readonly<{
    state: 'admitted';
    semantic: NormalizedRecipe;
}>;
