import { createHash } from 'node:crypto';

const SECRET_ENVIRONMENT_NAME = 'E2E_PROVIDER_VALUE';
const EXPECTED_DIGEST_ENVIRONMENT_NAME = 'E2E_EXPECTED_PROVIDER_SHA256';

export type BrokerE2eApplicationReceipt = Readonly<{
  outcome: 'success';
  proof: 'credential-digest-match';
}>;

export const run = (): BrokerE2eApplicationReceipt => {
  const credential = process.env[SECRET_ENVIRONMENT_NAME];
  const expectedDigest = process.env[EXPECTED_DIGEST_ENVIRONMENT_NAME];
  if (credential === undefined || expectedDigest === undefined) {
    throw new Error('The E2E application did not receive its declared inputs.');
  }
  const actualDigest = createHash('sha256').update(credential).digest('hex');
  delete process.env[SECRET_ENVIRONMENT_NAME];
  if (actualDigest !== expectedDigest) {
    throw new Error('The E2E credential proof did not match.');
  }
  return Object.freeze({ outcome: 'success', proof: 'credential-digest-match' });
};
