import type { BrokerResult } from './result.ts';
declare const providerContractSeal: unique symbol;
declare const providerRegistrySeal: unique symbol;
declare const providerScopeSetSeal: unique symbol;
declare const providerWitnessSeal: unique symbol;
export type ProviderCapability = 'identity-introspection' | 'refresh' | 'revocation' | 'scoped-client' | 'signed-operation' | 'static-validation' | 'token-exchange';
export type ProviderScopeImplication<Scope extends string> = Readonly<{
    granted: Scope;
    implies: readonly Scope[];
}>;
export type ProviderRedactedRequest = Readonly<{
    accountLabel: string | null;
    environmentLabel: string;
    scopeLabels: readonly string[];
    summary: string;
}>;
export type ProviderContractDefinition<ProviderId extends string, Scope extends string, Account = unknown, Environment = unknown, SecretKind extends string = string, Metadata = unknown, Request = unknown> = Readonly<{
    facts: ProviderContractFacts<ProviderId, Scope, SecretKind>;
    codecs: ProviderContractCodecs<Account, Environment, Metadata, Request>;
}>;
export type ProviderContractFacts<ProviderId extends string, Scope extends string, SecretKind extends string> = Readonly<{
    providerId: ProviderId;
    schemaVersion: number;
    scopeVocabulary: readonly [Scope, ...Scope[]];
    scopeImplications: readonly ProviderScopeImplication<Scope>[];
    secretKinds: readonly [SecretKind, ...SecretKind[]];
    capabilities: readonly [ProviderCapability, ...ProviderCapability[]];
}>;
export type ProviderContractCodecs<Account, Environment, Metadata, Request> = Readonly<{
    decodeAccount: (value: unknown) => BrokerResult<Account>;
    decodeEnvironment: (value: unknown) => BrokerResult<Environment>;
    decodeMetadata: (value: unknown) => BrokerResult<Metadata>;
    decodeRequest: (value: unknown) => BrokerResult<Request>;
    projectRedactedRequest: (request: Request) => ProviderRedactedRequest;
}>;
export type ProviderContract<ProviderId extends string, Scope extends string, Account = unknown, Environment = unknown, SecretKind extends string = string, Metadata = unknown, Request = unknown> = ProviderContractDefinition<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request> & Readonly<{
    [providerContractSeal]: true;
}>;
export type ProviderScopeSet<ProviderId extends string, Scope extends string> = Readonly<{
    providerId: ProviderId;
    values: readonly [Scope, ...Scope[]];
    [providerScopeSetSeal]: true;
}>;
export type ProviderScopeIntersection<ProviderId extends string, Scope extends string> = Readonly<{
    outcome: 'empty';
    providerId: ProviderId;
}> | Readonly<{
    outcome: 'nonempty';
    scopes: ProviderScopeSet<ProviderId, Scope>;
}>;
export type ProviderDispatchPlan = Readonly<{
    providerId: string;
    schemaVersion: number;
    capability: ProviderCapability;
    request: ProviderRedactedRequest;
}>;
export type ProviderDispatchRequest = Readonly<{
    providerId: string;
    capability: ProviderCapability;
    request: unknown;
}>;
export type ProviderWitness = Readonly<{
    facts: ProviderWitnessFacts;
    planner: ProviderWitnessPlanner;
    [providerWitnessSeal]: true;
}>;
export type ProviderWitnessFacts = Readonly<{
    providerId: string;
    schemaVersion: number;
    capabilities: readonly ProviderCapability[];
}>;
export type ProviderWitnessPlanner = Readonly<{
    plan: (capability: ProviderCapability, request: unknown) => BrokerResult<ProviderDispatchPlan>;
}>;
export type ProviderRegistry = Readonly<{
    providerIds: readonly string[];
    witnesses: readonly ProviderWitness[];
    [providerRegistrySeal]: true;
}>;
type ProviderScopeRules<Scope extends string> = Readonly<{
    scopeVocabulary: readonly [Scope, ...Scope[]];
    scopeImplications: readonly ProviderScopeImplication<Scope>[];
}>;
type ProviderScopeContract<ProviderId extends string, Scope extends string> = ProviderScopeRules<Scope> & Readonly<{
    providerId: ProviderId;
}>;
export type ProviderScopeAlgebra<ProviderId extends string, Scope extends string> = Readonly<{
    facts: ProviderScopeContract<ProviderId, Scope>;
}>;
export declare const defineProviderContract: <ProviderId extends string, Scope extends string, Account, Environment, SecretKind extends string, Metadata, Request>(facts: ProviderContractFacts<ProviderId, Scope, SecretKind>, codecs: ProviderContractCodecs<Account, Environment, Metadata, Request>) => BrokerResult<ProviderContract<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request>>;
export declare const decodeProviderScopeSet: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, value: unknown) => BrokerResult<ProviderScopeSet<ProviderId, Scope>>;
export declare const providerScopesContain: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, granted: ProviderScopeSet<ProviderId, Scope>, required: ProviderScopeSet<ProviderId, Scope>) => boolean;
export declare const providerScopesEqual: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, left: ProviderScopeSet<ProviderId, Scope>, right: ProviderScopeSet<ProviderId, Scope>) => boolean;
export declare const intersectProviderScopes: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, left: ProviderScopeSet<ProviderId, Scope>, right: ProviderScopeSet<ProviderId, Scope>) => ProviderScopeIntersection<ProviderId, Scope>;
export declare const unionProviderScopeRequest: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, left: ProviderScopeSet<ProviderId, Scope>, right: ProviderScopeSet<ProviderId, Scope>) => BrokerResult<ProviderScopeSet<ProviderId, Scope>>;
export declare const differenceProviderScopes: <ProviderId extends string, Scope extends string>(contract: ProviderScopeAlgebra<ProviderId, Scope>, left: ProviderScopeSet<ProviderId, Scope>, right: ProviderScopeSet<ProviderId, Scope>) => readonly Scope[];
export declare const eraseProviderContract: <ProviderId extends string, Scope extends string, Account, Environment, SecretKind extends string, Metadata, Request>(contract: ProviderContract<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request>) => ProviderWitness;
export declare const createProviderRegistry: (witnesses: readonly ProviderWitness[]) => BrokerResult<ProviderRegistry>;
export declare const planProviderDispatch: (registry: ProviderRegistry, request: ProviderDispatchRequest) => BrokerResult<ProviderDispatchPlan>;
export {};
