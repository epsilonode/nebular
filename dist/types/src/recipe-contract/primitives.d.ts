import { type RecipeRunnerResult } from './result.ts';
export type RecipeId = Readonly<{
    kind: 'recipe-id';
    value: string;
}>;
export type RecipeRelativePath = Readonly<{
    kind: 'recipe-relative-path';
    value: string;
}>;
export type RecipeRevision = Readonly<{
    kind: 'recipe-revision';
    value: string;
}>;
export type CredentialSlotId = Readonly<{
    kind: 'credential-slot-id';
    value: string;
}>;
export type ProviderId = Readonly<{
    kind: 'provider-id';
    value: string;
}>;
export type ProviderEnvironment = Readonly<{
    kind: 'provider-environment';
    value: string;
}>;
export type InjectionName = Readonly<{
    kind: 'injection-name';
    value: string;
}>;
export type AuthorityAtom = Readonly<{
    kind: 'authority-atom';
    value: string;
}>;
export declare const parseRecipeId: (value: unknown) => RecipeRunnerResult<RecipeId>;
export declare const parseRecipeRevision: (value: unknown) => RecipeRunnerResult<RecipeRevision>;
export declare const parseCredentialSlotId: (value: unknown) => RecipeRunnerResult<CredentialSlotId>;
export declare const parseProviderId: (value: unknown) => RecipeRunnerResult<ProviderId>;
export declare const parseProviderEnvironment: (value: unknown) => RecipeRunnerResult<ProviderEnvironment>;
export declare const parseInjectionName: (value: unknown) => RecipeRunnerResult<InjectionName>;
export declare const parseAuthorityAtom: (value: unknown) => RecipeRunnerResult<AuthorityAtom>;
export declare const parseRecipeRelativePath: (value: unknown) => RecipeRunnerResult<RecipeRelativePath>;
