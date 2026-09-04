import { describe, expect, it } from 'vitest';

import { createUnadmittedPm2OneShotCleanupProofPort } from './pm2-cleanup-proof.ts';
import type { OneShotAttemptHandle } from './one-shot-slots.ts';
import type { ProcessAttemptId } from './primitives.ts';

const handle: OneShotAttemptHandle = {
  slotId: { kind: 'one-shot-slot-id', value: 'nebular:0' },
  processName: { kind: 'one-shot-process-name', value: 'nebular-0' },
  attemptId: 'attempt-1' as ProcessAttemptId,
  metadataDigest: 'a'.repeat(64),
  pmId: 7
};

describe('unadmitted PM2 cleanup proof', () => {
  it('never promotes structural terminal state or an in-memory handle to durable cleanup proof', async () => {
    await expect(createUnadmittedPm2OneShotCleanupProofPort().readProof(handle))
      .resolves.toBe('unconfirmed');
  });
});
