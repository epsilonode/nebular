import { describe, expect, it } from 'vitest';

import * as broker from './broker.ts';

describe('broker public entrypoint', () => {
  it('exports privileged contracts without starting a resident service on import', () => {
    expect(Object.keys(broker)).toContain('resolveAndAuthorizeExecution');
    expect(Object.keys(broker)).toContain('authorizeExecution');
    expect(Object.keys(broker)).not.toContain('startServer');
  });

  it('selects exactly one bounded child mode and rejects ambiguous or trailing arguments', () => {
    expect(broker.parseBrokerEntrypointChildMode([
      'bun',
      'broker.ts',
      '--nebular-ipc-child',
      'control-1'
    ])).toEqual(expect.objectContaining({
      value: expect.objectContaining({ mode: 'control', requestId: 'control-1' })
    }));
    expect(broker.parseBrokerEntrypointChildMode([
      'bun',
      'broker.ts',
      '--nebular-bootstrap-child',
      'bootstrap-1'
    ])).toEqual(expect.objectContaining({
      value: { mode: 'bootstrap', exchangeId: 'bootstrap-1' }
    }));
    expect(broker.parseBrokerEntrypointChildMode(['bun', 'broker.ts'])).toEqual(expect.objectContaining({
      value: { mode: 'none' }
    }));
    expect(broker.parseBrokerEntrypointChildMode([
      'bun',
      'broker.ts',
      '--nebular-ipc-child',
      'control-1',
      '--nebular-bootstrap-child',
      'bootstrap-1'
    ])).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'request-invalid' })] }));
    expect(broker.parseBrokerEntrypointChildMode([
      'bun',
      'broker.ts',
      '--nebular-bootstrap-child',
      'bootstrap-1',
      'trailing'
    ])).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'request-invalid' })] }));
  });
});
