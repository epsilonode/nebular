import { describe, expect, it } from 'vitest';

import {
  brokerErr,
  brokerOk,
  createProviderRegistry,
  decodeProviderScopeSet,
  defineProviderContract,
  differenceProviderScopes,
  eraseProviderContract,
  intersectProviderScopes,
  planProviderDispatch,
  providerScopesContain,
  providerScopesEqual,
  unionProviderScopeRequest,
  type BrokerResult,
  type ProviderContract
} from './public.ts';

type TestProviderRequest = Readonly<{
  accountLabel: string;
  environmentLabel: string;
  scopes: readonly string[];
  summary: string;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeText = (value: unknown): BrokerResult<string> =>
  typeof value === 'string' && value.length > 0
    ? brokerOk(value)
    : brokerErr({ code: 'provider-request-invalid', message: 'Provider test text is invalid.' });

const decodeRequest = (value: unknown): BrokerResult<TestProviderRequest> => {
  if (!isRecord(value) || typeof value['accountLabel'] !== 'string' ||
      typeof value['environmentLabel'] !== 'string' || typeof value['summary'] !== 'string' ||
      !Array.isArray(value['scopes']) || !value['scopes'].every(scope => typeof scope === 'string')) {
    return brokerErr({ code: 'provider-request-invalid', message: 'Provider test request is invalid.' });
  }
  return brokerOk({
    accountLabel: value['accountLabel'],
    environmentLabel: value['environmentLabel'],
    scopes: value['scopes'],
    summary: value['summary']
  });
};

const alphaContract = (): BrokerResult<ProviderContract<
  'alpha',
  'admin' | 'read' | 'write',
  string,
  string,
  'api-token',
  string,
  TestProviderRequest
>> => defineProviderContract({
  providerId: 'alpha',
  schemaVersion: 1,
  scopeVocabulary: ['admin', 'read', 'write'],
  scopeImplications: [
    { granted: 'admin', implies: ['write'] },
    { granted: 'write', implies: ['read'] }
  ],
  secretKinds: ['api-token'],
  capabilities: ['identity-introspection', 'static-validation']
}, {
  decodeAccount: decodeText,
  decodeEnvironment: decodeText,
  decodeMetadata: decodeText,
  decodeRequest,
  projectRedactedRequest: request => ({
    accountLabel: request.accountLabel,
    environmentLabel: request.environmentLabel,
    scopeLabels: request.scopes,
    summary: request.summary
  })
});

const betaContract = () => defineProviderContract({
  providerId: 'beta',
  schemaVersion: 3,
  scopeVocabulary: ['publish', 'read'] as const,
  scopeImplications: [] as const,
  secretKinds: ['session'] as const,
  capabilities: ['token-exchange'] as const
}, {
  decodeAccount: decodeText,
  decodeEnvironment: decodeText,
  decodeMetadata: decodeText,
  decodeRequest,
  projectRedactedRequest: (request: TestProviderRequest) => ({
    accountLabel: request.accountLabel,
    environmentLabel: request.environmentLabel,
    scopeLabels: request.scopes,
    summary: `beta:${request.summary}`
  })
});

describe('provider-indexed contract algebra', () => {
  it('rejects duplicate, cyclic, and authority-ambiguous contract definitions', () => {
    const duplicateCapability = defineProviderContract({
      providerId: 'invalid-duplicate',
      schemaVersion: 1,
      scopeVocabulary: ['read'] as const,
      scopeImplications: [] as const,
      secretKinds: ['token'] as const,
      capabilities: ['static-validation', 'static-validation'] as const
    }, {
      decodeAccount: decodeText,
      decodeEnvironment: decodeText,
      decodeMetadata: decodeText,
      decodeRequest,
      projectRedactedRequest: (request: TestProviderRequest) => ({
        accountLabel: request.accountLabel,
        environmentLabel: request.environmentLabel,
        scopeLabels: request.scopes,
        summary: request.summary
      })
    });
    const cycle = defineProviderContract({
      providerId: 'invalid-cycle',
      schemaVersion: 1,
      scopeVocabulary: ['read', 'write'] as const,
      scopeImplications: [
        { granted: 'read', implies: ['write'] },
        { granted: 'write', implies: ['read'] }
      ] as const,
      secretKinds: ['token'] as const,
      capabilities: ['static-validation'] as const
    }, {
      decodeAccount: decodeText,
      decodeEnvironment: decodeText,
      decodeMetadata: decodeText,
      decodeRequest,
      projectRedactedRequest: (request: TestProviderRequest) => ({
        accountLabel: request.accountLabel,
        environmentLabel: request.environmentLabel,
        scopeLabels: request.scopes,
        summary: request.summary
      })
    });

    expect(duplicateCapability.isErr()).toBe(true);
    expect(cycle.isErr()).toBe(true);
  });

  it('normalizes explicit implication without string-prefix inference', () => {
    const contract = alphaContract();
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;

    const admin = decodeProviderScopeSet(contract.value, ['admin']);
    const write = decodeProviderScopeSet(contract.value, ['write']);
    const read = decodeProviderScopeSet(contract.value, ['read']);
    expect(admin.isOk() && write.isOk() && read.isOk()).toBe(true);
    if (admin.isErr() || write.isErr() || read.isErr()) return;

    expect(admin.value.values).toEqual(['admin', 'read', 'write']);
    expect(write.value.values).toEqual(['read', 'write']);
    expect(providerScopesContain(contract.value, admin.value, write.value)).toBe(true);
    expect(providerScopesContain(contract.value, write.value, admin.value)).toBe(false);
    expect(providerScopesContain(contract.value, write.value, read.value)).toBe(true);
    expect(decodeProviderScopeSet(contract.value, ['read.prefix-child']).isErr()).toBe(true);
  });

  it('provides deterministic intersection, union, difference, and equality', () => {
    const contract = alphaContract();
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;
    const admin = decodeProviderScopeSet(contract.value, ['admin']);
    const write = decodeProviderScopeSet(contract.value, ['write']);
    const read = decodeProviderScopeSet(contract.value, ['read']);
    expect(admin.isOk() && write.isOk() && read.isOk()).toBe(true);
    if (admin.isErr() || write.isErr() || read.isErr()) return;

    const intersection = intersectProviderScopes(contract.value, admin.value, write.value);
    expect(intersection.outcome).toBe('nonempty');
    if (intersection.outcome === 'nonempty') {
      expect(providerScopesEqual(contract.value, intersection.scopes, write.value)).toBe(true);
    }
    expect(differenceProviderScopes(contract.value, admin.value, write.value)).toEqual(['admin']);
    const union = unionProviderScopeRequest(contract.value, read.value, write.value);
    expect(union.isOk()).toBe(true);
    if (union.isOk()) expect(providerScopesEqual(contract.value, union.value, write.value)).toBe(true);
  });

  it('owns the only dynamic erasure point and rejects unsupported effects before dispatch', () => {
    const alpha = alphaContract();
    const beta = betaContract();
    expect(alpha.isOk() && beta.isOk()).toBe(true);
    if (alpha.isErr() || beta.isErr()) return;

    const registry = createProviderRegistry([
      eraseProviderContract(alpha.value),
      eraseProviderContract(beta.value)
    ]);
    expect(registry.isOk()).toBe(true);
    if (registry.isErr()) return;

    const request = {
      accountLabel: 'development',
      environmentLabel: 'test',
      scopes: ['read'],
      summary: 'inspect identity'
    };
    const alphaPlan = planProviderDispatch(registry.value, {
      providerId: 'alpha',
      capability: 'identity-introspection',
      request
    });
    const betaPlan = planProviderDispatch(registry.value, {
      providerId: 'beta',
      capability: 'token-exchange',
      request
    });
    expect(alphaPlan.isOk() && alphaPlan.value.providerId === 'alpha' &&
      alphaPlan.value.request.summary === 'inspect identity').toBe(true);
    expect(betaPlan.isOk() && betaPlan.value.providerId === 'beta' &&
      betaPlan.value.request.summary === 'beta:inspect identity').toBe(true);
    expect(planProviderDispatch(registry.value, {
      providerId: 'beta',
      capability: 'refresh',
      request
    }).isErr()).toBe(true);
    expect(planProviderDispatch(registry.value, {
      providerId: 'missing',
      capability: 'refresh',
      request
    }).isErr()).toBe(true);
    expect(createProviderRegistry([
      eraseProviderContract(alpha.value),
      eraseProviderContract(alpha.value)
    ]).isErr()).toBe(true);
  });
});
