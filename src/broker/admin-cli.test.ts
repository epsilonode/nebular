import { describe, expect, it, vi } from 'vitest';

import {
  parseBrokerAdminCliPlan,
  runBrokerAdminCli,
  type BrokerAdminCliRuntime
} from './admin-cli.ts';

const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';

const runtime = (
  read: BrokerAdminCliRuntime['hostConfiguration']['read'],
  initialize: BrokerAdminCliRuntime['hostConfiguration']['initialize']
): BrokerAdminCliRuntime => ({ hostConfiguration: { read, initialize } });

const configured = {
  type: 'ok' as const,
  value: {
    kind: 'broker-host-configuration' as const,
    schema: 'epsilonode.nebular.broker-host-configuration/v1' as const,
    gitExecutable: { kind: 'canonical-git-executable' as const, value: GIT }
  }
};

const unavailableInitialize: BrokerAdminCliRuntime['hostConfiguration']['initialize'] = () => Promise.resolve({
  type: 'err',
  issues: [{
    code: 'host-configuration-unavailable',
    message: 'fixture unavailable detail'
  }]
});

describe('broker administration CLI', () => {
  it('parses only exact host commands and bounded absolute Git paths', () => {
    expect(parseBrokerAdminCliPlan(['host-status'])).toEqual(expect.objectContaining({
      value: { command: 'host-status' }
    }));
    expect(parseBrokerAdminCliPlan(['host-configure', '--git', GIT])).toEqual(expect.objectContaining({
      value: { command: 'host-configure', gitExecutable: GIT }
    }));
    expect(parseBrokerAdminCliPlan(['host-configure', '--git', '.\\git.exe']).isErr()).toBe(true);
    expect(parseBrokerAdminCliPlan(['host-status', 'trailing']).isErr()).toBe(true);
    expect(parseBrokerAdminCliPlan(['host-configure', '--git', GIT, '--extra']).isErr()).toBe(true);
  });

  it('reports configured and intentionally missing states without exposing the path', async () => {
    const ready = await runBrokerAdminCli(['host-status'], runtime(
      () => Promise.resolve(configured),
      unavailableInitialize
    ));
    const missing = await runBrokerAdminCli(['host-status'], runtime(
      () => Promise.resolve({
        type: 'err',
        issues: [{
          code: 'host-configuration-not-initialized',
          message: 'fixture missing detail'
        }]
      }),
      unavailableInitialize
    ));

    expect(ready.isOk() ? ready.value : undefined).toEqual({
      outcome: 'success',
      code: 'host-configuration-ready',
      configured: true
    });
    expect(missing.isOk() ? missing.value : undefined).toEqual({
      outcome: 'success',
      code: 'host-configuration-missing',
      configured: false
    });
    expect(JSON.stringify([ready, missing])).not.toContain(GIT);
  });

  it('initializes through the host authority and returns a redacted receipt', async () => {
    const initialize = vi.fn(() => Promise.resolve(configured));
    const result = await runBrokerAdminCli(['host-configure', '--git', GIT], runtime(
      () => Promise.resolve(configured),
      initialize
    ));

    expect(result.isOk()).toBe(true);
    expect(initialize).toHaveBeenCalledWith({ gitExecutable: GIT });
    expect(JSON.stringify(result)).not.toContain(GIT);
  });

  it('redacts adapter failures and rejects malformed commands before effects', async () => {
    const read = vi.fn(() => Promise.reject(new Error('sensitive host path')));
    const failed = await runBrokerAdminCli(['host-status'], runtime(read, unavailableInitialize));
    const malformed = await runBrokerAdminCli(['unknown'], runtime(read, unavailableInitialize));

    expect(failed.isErr()).toBe(true);
    expect(failed.isErr() ? failed.error[0].message : '').not.toContain('sensitive');
    expect(malformed.isErr()).toBe(true);
    expect(read).toHaveBeenCalledOnce();
  });
});
