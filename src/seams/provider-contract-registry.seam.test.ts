import { describe, expect, it } from 'vitest';

import {
  brokerErr,
  brokerOk,
  createProviderRegistry,
  defineProviderContract,
  eraseProviderContract,
  planProviderDispatch,
  type BrokerResult
} from '../broker/public.ts';

const decodeText = (value: unknown): BrokerResult<string> =>
  typeof value === 'string' && value.length > 0
    ? brokerOk(value)
    : brokerErr({ code: 'provider-request-invalid', message: 'Provider seam input is invalid.' });

describe('typed provider contract -> erased dynamic registry seam', () => {
  it('rejects unavailable capability before invoking the selected provider decoder', () => {
    let decoderCalls = 0;
    const contract = defineProviderContract({
      providerId: 'seam-provider',
      schemaVersion: 1,
      scopeVocabulary: ['read'] as const,
      scopeImplications: [] as const,
      secretKinds: ['api-token'] as const,
      capabilities: ['static-validation'] as const
    }, {
      decodeAccount: decodeText,
      decodeEnvironment: decodeText,
      decodeMetadata: decodeText,
      decodeRequest: (value: unknown): BrokerResult<string> => {
        decoderCalls += 1;
        return decodeText(value);
      },
      projectRedactedRequest: request => ({
        accountLabel: null,
        environmentLabel: 'development',
        scopeLabels: ['read'],
        summary: request
      })
    });
    expect(contract.isOk()).toBe(true);
    if (contract.isErr()) return;
    const registry = createProviderRegistry([eraseProviderContract(contract.value)]);
    expect(registry.isOk()).toBe(true);
    if (registry.isErr()) return;

    const unsupported = planProviderDispatch(registry.value, {
      providerId: 'seam-provider',
      capability: 'refresh',
      request: 'must-not-decode'
    });
    expect(unsupported.isErr()).toBe(true);
    expect(decoderCalls).toBe(0);

    const admitted = planProviderDispatch(registry.value, {
      providerId: 'seam-provider',
      capability: 'static-validation',
      request: 'redacted-request'
    });
    expect(admitted.isOk()).toBe(true);
    expect(decoderCalls).toBe(1);
    if (admitted.isOk()) {
      expect(admitted.value).toEqual({
        providerId: 'seam-provider',
        schemaVersion: 1,
        capability: 'static-validation',
        request: {
          accountLabel: null,
          environmentLabel: 'development',
          scopeLabels: ['read'],
          summary: 'redacted-request'
        }
      });
    }
  });
});
