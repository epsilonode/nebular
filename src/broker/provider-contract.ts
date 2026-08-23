import type { BrokerResult } from './result.ts';
import { brokerErr, brokerOk } from './result.ts';

const providerContractSeal = Symbol('nebular-provider-contract');
const providerRegistrySeal = Symbol('nebular-provider-registry');
const providerScopeSetSeal = Symbol('nebular-provider-scope-set');
const providerWitnessSeal = Symbol('nebular-provider-witness');

export type ProviderCapability =
  | 'identity-introspection'
  | 'refresh'
  | 'revocation'
  | 'scoped-client'
  | 'signed-operation'
  | 'static-validation'
  | 'token-exchange';

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

export type ProviderContractDefinition<
  ProviderId extends string,
  Scope extends string,
  Account = unknown,
  Environment = unknown,
  SecretKind extends string = string,
  Metadata = unknown,
  Request = unknown
> = Readonly<{
  facts: ProviderContractFacts<ProviderId, Scope, SecretKind>;
  codecs: ProviderContractCodecs<Account, Environment, Metadata, Request>;
}>;

export type ProviderContractFacts<
  ProviderId extends string,
  Scope extends string,
  SecretKind extends string
> = Readonly<{
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

export type ProviderContract<
  ProviderId extends string,
  Scope extends string,
  Account = unknown,
  Environment = unknown,
  SecretKind extends string = string,
  Metadata = unknown,
  Request = unknown
> = ProviderContractDefinition<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request> & Readonly<{
  [providerContractSeal]: true;
}>;

export type ProviderScopeSet<ProviderId extends string, Scope extends string> = Readonly<{
  providerId: ProviderId;
  values: readonly [Scope, ...Scope[]];
  [providerScopeSetSeal]: true;
}>;

export type ProviderScopeIntersection<ProviderId extends string, Scope extends string> =
  | Readonly<{ outcome: 'empty'; providerId: ProviderId }>
  | Readonly<{ outcome: 'nonempty'; scopes: ProviderScopeSet<ProviderId, Scope> }>;

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

type ProviderScopeContract<ProviderId extends string, Scope extends string> =
  ProviderScopeRules<Scope> & Readonly<{ providerId: ProviderId }>;

export type ProviderScopeAlgebra<ProviderId extends string, Scope extends string> = Readonly<{
  facts: ProviderScopeContract<ProviderId, Scope>;
}>;

const PROVIDER_MAX_IDENTITY_LENGTH = 128;
const PROVIDER_MAX_SCOPE_COUNT = 128;
const PROVIDER_MAX_DISPLAY_LENGTH = 512;

const boundedIdentity = (value: string): boolean =>
  value.length > 0 && value.length <= PROVIDER_MAX_IDENTITY_LENGTH &&
  !value.includes('\0') && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);

const unique = <Value>(values: readonly Value[]): boolean => new Set(values).size === values.length;

const directImplications = <Scope extends string>(
  contract: Pick<ProviderScopeRules<Scope>, 'scopeImplications'>,
  scope: Scope
): readonly Scope[] => contract.scopeImplications
  .filter(rule => rule.granted === scope)
  .flatMap(rule => rule.implies);

const implicationClosure = <Scope extends string>(
  contract: Pick<ProviderScopeRules<Scope>, 'scopeImplications'>,
  pending: readonly Scope[],
  admitted: readonly Scope[]
): readonly Scope[] => {
  const scope = pending[0];
  if (scope === undefined) return admitted;
  if (admitted.includes(scope)) return implicationClosure(contract, pending.slice(1), admitted);
  return implicationClosure(
    contract,
    [...pending.slice(1), ...directImplications(contract, scope)],
    [...admitted, scope]
  );
};

const hasImplicationCycle = <Scope extends string>(
  definition: ProviderScopeRules<Scope>
): boolean => definition.scopeVocabulary.some(scope =>
  implicationClosure(definition, directImplications(definition, scope), []).includes(scope)
);

const validImplications = <Scope extends string>(
  definition: ProviderScopeRules<Scope>
): boolean => unique(definition.scopeImplications.map(rule => rule.granted)) &&
  definition.scopeImplications.every(rule =>
    definition.scopeVocabulary.includes(rule.granted) &&
    rule.implies.length > 0 &&
    unique(rule.implies) &&
    rule.implies.every(implied => definition.scopeVocabulary.includes(implied) && implied !== rule.granted)
  ) && !hasImplicationCycle(definition);

export const defineProviderContract = <
  ProviderId extends string,
  Scope extends string,
  Account,
  Environment,
  SecretKind extends string,
  Metadata,
  Request
>(
  facts: ProviderContractFacts<ProviderId, Scope, SecretKind>,
  codecs: ProviderContractCodecs<Account, Environment, Metadata, Request>
): BrokerResult<ProviderContract<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request>> => {
  const identityValues: readonly string[] = [
    facts.providerId,
    ...facts.scopeVocabulary,
    ...facts.secretKinds
  ];
  const valid = boundedIdentity(facts.providerId) &&
    Number.isSafeInteger(facts.schemaVersion) && facts.schemaVersion > 0 &&
    facts.scopeVocabulary.length <= PROVIDER_MAX_SCOPE_COUNT &&
    unique(facts.scopeVocabulary) && unique(facts.secretKinds) &&
    unique(facts.capabilities) && identityValues.every(boundedIdentity) &&
    validImplications(facts);
  return valid
    ? brokerOk({ facts, codecs, [providerContractSeal]: true })
    : brokerErr({
        code: 'provider-contract-invalid',
        message: 'Provider contract vocabulary, capabilities, or implication rules are invalid.'
      });
};

const matchingScope = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  value: unknown
): Scope | undefined => typeof value === 'string'
  ? contract.facts.scopeVocabulary.find(scope => scope === value)
  : undefined;

const scopeSetFromKnownValues = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  values: readonly Scope[]
): BrokerResult<ProviderScopeSet<ProviderId, Scope>> => {
  const normalized: readonly Scope[] = implicationClosure(contract.facts, values, []).toSorted();
  const first = normalized[0];
  return first === undefined
    ? brokerErr({ code: 'provider-scope-invalid', message: 'Provider scope authority cannot be empty.' })
    : brokerOk({
        providerId: contract.facts.providerId,
        values: [first, ...normalized.slice(1)],
        [providerScopeSetSeal]: true
      });
};

export const decodeProviderScopeSet = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  value: unknown
): BrokerResult<ProviderScopeSet<ProviderId, Scope>> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > PROVIDER_MAX_SCOPE_COUNT) {
    return brokerErr({ code: 'provider-scope-invalid', message: 'Provider scope collection is invalid.' });
  }
  const decoded = value.reduce<BrokerResult<readonly Scope[]>>(
    (result, candidate) => result.andThen(scopes => {
      const scope = matchingScope(contract, candidate);
      return scope === undefined
        ? brokerErr({ code: 'provider-scope-invalid', message: 'Provider scope is outside the admitted vocabulary.' })
        : brokerOk([...scopes, scope]);
    }),
    brokerOk([])
  );
  return decoded.andThen(scopes => scopeSetFromKnownValues(contract, scopes));
};

const sameProvider = <ProviderId extends string, Scope extends string>(
  contract: Readonly<{ facts: Readonly<{ providerId: ProviderId }> }>,
  left: ProviderScopeSet<ProviderId, Scope>,
  right: ProviderScopeSet<ProviderId, Scope>
): boolean => left.providerId === contract.facts.providerId && right.providerId === contract.facts.providerId;

export const providerScopesContain = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  granted: ProviderScopeSet<ProviderId, Scope>,
  required: ProviderScopeSet<ProviderId, Scope>
): boolean => sameProvider(contract, granted, required) &&
  required.values.every(scope => granted.values.includes(scope));

export const providerScopesEqual = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  left: ProviderScopeSet<ProviderId, Scope>,
  right: ProviderScopeSet<ProviderId, Scope>
): boolean => providerScopesContain(contract, left, right) && providerScopesContain(contract, right, left);

export const intersectProviderScopes = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  left: ProviderScopeSet<ProviderId, Scope>,
  right: ProviderScopeSet<ProviderId, Scope>
): ProviderScopeIntersection<ProviderId, Scope> => {
  const common: readonly Scope[] = sameProvider(contract, left, right)
    ? left.values.filter(scope => right.values.includes(scope))
    : [];
  const scopes = scopeSetFromKnownValues(contract, common);
  return scopes.isErr()
    ? { outcome: 'empty', providerId: contract.facts.providerId }
    : { outcome: 'nonempty', scopes: scopes.value };
};

export const unionProviderScopeRequest = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  left: ProviderScopeSet<ProviderId, Scope>,
  right: ProviderScopeSet<ProviderId, Scope>
): BrokerResult<ProviderScopeSet<ProviderId, Scope>> => sameProvider(contract, left, right)
  ? scopeSetFromKnownValues(contract, [...left.values, ...right.values])
  : brokerErr({ code: 'provider-scope-invalid', message: 'Provider scope union crossed a provider boundary.' });

export const differenceProviderScopes = <ProviderId extends string, Scope extends string>(
  contract: ProviderScopeAlgebra<ProviderId, Scope>,
  left: ProviderScopeSet<ProviderId, Scope>,
  right: ProviderScopeSet<ProviderId, Scope>
): readonly Scope[] => sameProvider(contract, left, right)
  ? left.values.filter(scope => !right.values.includes(scope))
  : left.values;

const validRedactedText = (value: string): boolean =>
  value.length > 0 && value.length <= PROVIDER_MAX_DISPLAY_LENGTH && !value.includes('\0');

const validRedactedRequest = (request: ProviderRedactedRequest): boolean =>
  (request.accountLabel === null || validRedactedText(request.accountLabel)) &&
  validRedactedText(request.environmentLabel) && validRedactedText(request.summary) &&
  request.scopeLabels.length <= PROVIDER_MAX_SCOPE_COUNT &&
  request.scopeLabels.every(validRedactedText);

export const eraseProviderContract = <
  ProviderId extends string,
  Scope extends string,
  Account,
  Environment,
  SecretKind extends string,
  Metadata,
  Request
>(
  contract: ProviderContract<ProviderId, Scope, Account, Environment, SecretKind, Metadata, Request>
): ProviderWitness => ({
  facts: {
    providerId: contract.facts.providerId,
    schemaVersion: contract.facts.schemaVersion,
    capabilities: contract.facts.capabilities
  },
  planner: {
    plan: (capability, request) => {
      if (!contract.facts.capabilities.includes(capability)) {
        return brokerErr({
          code: 'provider-operation-unsupported',
          message: 'Provider operation is not declared by the selected contract.'
        });
      }
      return contract.codecs.decodeRequest(request).andThen(decoded => {
        const projected = contract.codecs.projectRedactedRequest(decoded);
        return validRedactedRequest(projected)
          ? brokerOk({
              providerId: contract.facts.providerId,
              schemaVersion: contract.facts.schemaVersion,
              capability,
              request: projected
            })
          : brokerErr({
              code: 'provider-request-invalid',
              message: 'Provider request redaction projection is invalid.'
            });
      });
    }
  },
  [providerWitnessSeal]: true
});

export const createProviderRegistry = (
  witnesses: readonly ProviderWitness[]
): BrokerResult<ProviderRegistry> => {
  const providerIds: readonly string[] = witnesses.map(witness => witness.facts.providerId).toSorted();
  const valid = witnesses.length > 0 && unique(providerIds) &&
    witnesses.every(witness => boundedIdentity(witness.facts.providerId) &&
      Number.isSafeInteger(witness.facts.schemaVersion) && witness.facts.schemaVersion > 0 &&
      witness.facts.capabilities.length > 0 && unique(witness.facts.capabilities));
  return valid
    ? brokerOk({ providerIds, witnesses: [...witnesses], [providerRegistrySeal]: true })
    : brokerErr({
        code: 'provider-registry-conflict',
        message: 'Provider registry contains a duplicate or invalid witness.'
      });
};

export const planProviderDispatch = (
  registry: ProviderRegistry,
  request: ProviderDispatchRequest
): BrokerResult<ProviderDispatchPlan> => {
  const witness = registry.witnesses.find(candidate => candidate.facts.providerId === request.providerId);
  return witness === undefined
    ? brokerErr({ code: 'provider-unavailable', message: 'Requested provider is not registered.' })
    : witness.planner.plan(request.capability, request.request);
};
