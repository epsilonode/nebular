import type { Pm2OneShotCleanupProofPort } from './pm2-exact-name-receiver.ts';

/**
 * Honest production default until a durable adapter can prove the exact PM2
 * handle's Windows descendant tree was contained and terminated. Structural
 * PM2 terminal state and an in-memory stop receipt are deliberately not proof.
 * Wiring this port leaves retired slots unavailable for deletion and reuse.
 */
export const createUnadmittedPm2OneShotCleanupProofPort = (): Pm2OneShotCleanupProofPort => ({
  readProof: () => Promise.resolve('unconfirmed')
});
