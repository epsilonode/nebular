import { describe, expect, it } from 'vitest';

import { decodeBrokerControlMessage } from '../broker-client/public.ts';
import { brokerErr } from './result.ts';
import {
  createWindowsPm2OneShotBrokerOperationPort,
  createWindowsPm2OneShotBrokerOperationTestRuntime
} from './windows-pm2-one-shot-operation.ts';

const request = () => {
  const decoded = decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'windows-pm2-operation-1',
    sequence: 1,
    sentAtMs: 1_000,
    payload: {
      operation: 'execute-recipe',
      grantIdHint: 'grant-1',
      repositoryPathHint: 'R:\\Code\\fixture',
      recipePathHint: 'recipes\\fixture.xml',
      recipeRevision: 'revision-1',
      credentialSlotIds: ['credential-1']
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'request') throw new Error('invalid operation fixture');
  return decoded.value;
};

describe('Windows PM2 one-shot broker operation', () => {
  it('fails closed when canonical production composition cannot be resolved', async () => {
    let resolutions = 0;
    const port = createWindowsPm2OneShotBrokerOperationPort({
      composition: { oneShot: { brokerEntrypointPath: 'R:\\Code\\fixture\\broker.ts' } }
    }, createWindowsPm2OneShotBrokerOperationTestRuntime(() => {
      resolutions += 1;
      return Promise.resolve(brokerErr({
        code: 'bootstrap-failed',
        message: 'The isolated authority context is unavailable.'
      }));
    }));

    await expect(port.execute(request(), 1_000)).resolves.toEqual({
      error: [{
        code: 'receiver-failed',
        message: 'The production Windows broker operation is unavailable.'
      }]
    });
    expect(resolutions).toBe(1);
  });
});
