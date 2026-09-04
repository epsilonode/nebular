import { describe, expect, it } from 'vitest';

import {
  MANAGED_ATTEMPT_ENVIRONMENT,
  MANAGED_WINDOWS_JOB_ENVIRONMENT
} from '../broker-client/public.ts';
import {
  PM2_METADATA_ATTEMPT_ID,
  PM2_METADATA_GRANT_GENERATION,
  PM2_METADATA_GRANT_ID,
  PM2_METADATA_JOB_IDENTITY,
  PM2_METADATA_RECEIVER_ID,
  PM2_METADATA_RECIPE_REVISION,
  PM2_METADATA_REPOSITORY
} from '../broker/public.ts';

describe('PM2 managed-attempt to cooperative-bootstrap seam', () => {
  it('keeps the independently compiled client reader aligned with the privileged metadata projection', () => {
    expect(MANAGED_ATTEMPT_ENVIRONMENT).toEqual({
      repository: PM2_METADATA_REPOSITORY,
      recipeRevision: PM2_METADATA_RECIPE_REVISION,
      grantId: PM2_METADATA_GRANT_ID,
      grantGeneration: PM2_METADATA_GRANT_GENERATION,
      receiverId: PM2_METADATA_RECEIVER_ID,
      processAttemptId: PM2_METADATA_ATTEMPT_ID
    });
  });

  it('keeps the independently compiled first-effect Job reader aligned with PM2 internal metadata', () => {
    expect(MANAGED_WINDOWS_JOB_ENVIRONMENT).toEqual({
      jobIdentity: PM2_METADATA_JOB_IDENTITY,
      processAttemptId: PM2_METADATA_ATTEMPT_ID
    });
  });
});
