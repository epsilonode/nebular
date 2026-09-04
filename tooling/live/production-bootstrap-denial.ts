import { resolve } from 'node:path';

import {
  bunProcessEnvironmentNames,
  createBootstrapRequest,
  createBunCooperativeBootstrapTransportPort,
  createBunProcessEnvironmentInstallPort,
  prepareRecipeEnvironment
} from '../../broker-client.ts';

const request = createBootstrapRequest({
  exchangeId: `live-denial-${crypto.randomUUID()}`,
  repository: process.cwd(),
  recipeRevision: 'live-denial-revision',
  grantId: 'live-denial-grant',
  grantGeneration: 1,
  receiverId: 'pm2',
  processAttemptId: `live-denial-attempt-${crypto.randomUUID()}`,
  slots: [{ slotId: 'live-denial-slot', environmentName: 'NEBULAR_LIVE_DENIAL_SECRET' }]
});

if (request.isErr()) throw new Error('The production bootstrap denial fixture request is invalid.');

const brokerEntrypoint = resolve(import.meta.dir, '..', '..', 'broker.ts');
const result = await prepareRecipeEnvironment({
  request: request.value,
  inheritedEnvironmentNames: bunProcessEnvironmentNames()
}, {
  clock: { nowMs: () => Date.now() },
  environment: createBunProcessEnvironmentInstallPort(),
  transport: createBunCooperativeBootstrapTransportPort({
    brokerEntrypoint,
    cwd: process.cwd(),
    timeoutMs: 10_000
  })
});

if (result.isOk() || result.error[0].code !== 'bootstrap-rejected' ||
    process.env['NEBULAR_LIVE_DENIAL_SECRET'] !== undefined) {
  throw new Error('The production bootstrap root did not fail closed for absent durable authority.');
}

console.log(JSON.stringify({
  outcome: 'success',
  code: 'production-bootstrap-denial-proven'
}));
