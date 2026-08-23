import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  brokerErr,
  brokerOk,
  decodeProviderScopeSet,
  defineProviderContract,
  differenceProviderScopes,
  intersectProviderScopes,
  providerScopesContain,
  providerScopesEqual,
  unionProviderScopeRequest,
  type BrokerResult
} from './public.ts';

type LawScope = 'admin' | 'read' | 'write';

const decodeText = (value: unknown): BrokerResult<string> =>
  typeof value === 'string' && value.length > 0
    ? brokerOk(value)
    : brokerErr({ code: 'provider-request-invalid', message: 'Provider law input is invalid.' });

const contract = defineProviderContract({
  providerId: 'law-provider',
  schemaVersion: 1,
  scopeVocabulary: ['admin', 'read', 'write'] as const,
  scopeImplications: [
    { granted: 'admin', implies: ['write'] },
    { granted: 'write', implies: ['read'] }
  ] as const,
  secretKinds: ['token'] as const,
  capabilities: ['static-validation'] as const
}, {
  decodeAccount: decodeText,
  decodeEnvironment: decodeText,
  decodeMetadata: decodeText,
  decodeRequest: decodeText,
  projectRedactedRequest: request => ({
    accountLabel: null,
    environmentLabel: 'law',
    scopeLabels: [],
    summary: request
  })
});

const scopeInput = fc.uniqueArray(fc.constantFrom<LawScope>('admin', 'read', 'write'), {
  minLength: 1,
  maxLength: 3
});

describe('provider scope algebra laws', () => {
  it('is normalized idempotently and deterministically', () => {
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;
    fc.assert(fc.property(scopeInput, scopes => {
      const first = decodeProviderScopeSet(contract.value, scopes);
      expect(first.isOk()).toBe(true);
      if (first.isErr()) return;
      const second = decodeProviderScopeSet(contract.value, first.value.values);
      expect(second.isOk()).toBe(true);
      if (second.isErr()) return;
      expect(providerScopesEqual(contract.value, first.value, second.value)).toBe(true);
      expect(first.value.values).toEqual(first.value.values.toSorted());
    }));
  });

  it('keeps intersection commutative and idempotent without widening', () => {
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;
    fc.assert(fc.property(scopeInput, scopeInput, (leftInput, rightInput) => {
      const left = decodeProviderScopeSet(contract.value, leftInput);
      const right = decodeProviderScopeSet(contract.value, rightInput);
      expect(left.isOk() && right.isOk()).toBe(true);
      if (left.isErr() || right.isErr()) return;
      const leftRight = intersectProviderScopes(contract.value, left.value, right.value);
      const rightLeft = intersectProviderScopes(contract.value, right.value, left.value);
      expect(leftRight.outcome).toBe(rightLeft.outcome);
      if (leftRight.outcome === 'nonempty' && rightLeft.outcome === 'nonempty') {
        expect(providerScopesEqual(contract.value, leftRight.scopes, rightLeft.scopes)).toBe(true);
        expect(providerScopesContain(contract.value, left.value, leftRight.scopes)).toBe(true);
        expect(providerScopesContain(contract.value, right.value, leftRight.scopes)).toBe(true);
      }
      const identity = intersectProviderScopes(contract.value, left.value, left.value);
      expect(identity.outcome).toBe('nonempty');
      if (identity.outcome === 'nonempty') {
        expect(providerScopesEqual(contract.value, identity.scopes, left.value)).toBe(true);
      }
    }));
  });

  it('makes union a request-only upper bound and difference exact', () => {
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;
    fc.assert(fc.property(scopeInput, scopeInput, (leftInput, rightInput) => {
      const left = decodeProviderScopeSet(contract.value, leftInput);
      const right = decodeProviderScopeSet(contract.value, rightInput);
      expect(left.isOk() && right.isOk()).toBe(true);
      if (left.isErr() || right.isErr()) return;
      const union = unionProviderScopeRequest(contract.value, left.value, right.value);
      expect(union.isOk()).toBe(true);
      if (union.isErr()) return;
      expect(providerScopesContain(contract.value, union.value, left.value)).toBe(true);
      expect(providerScopesContain(contract.value, union.value, right.value)).toBe(true);
      const difference = differenceProviderScopes(contract.value, left.value, right.value);
      expect(difference.every(scope => left.value.values.includes(scope) &&
        !right.value.values.includes(scope))).toBe(true);
    }));
  });
});
