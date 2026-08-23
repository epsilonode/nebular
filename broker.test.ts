import { describe, expect, it } from 'vitest';

import * as broker from './broker.ts';

describe('broker public entrypoint', () => {
  it('exports privileged contracts without starting a resident service on import', () => {
    expect(Object.keys(broker)).toContain('resolveAndAuthorizeExecution');
    expect(Object.keys(broker)).toContain('authorizeExecution');
    expect(Object.keys(broker)).not.toContain('startServer');
  });
});
