import { describe, expect, it, vi } from 'vitest';

import { currentRecipeTaskErr } from './current-recipe.ts';
import { journalErr, journalOk, type AuthorityJournal } from './journal.ts';
import { secretLeaseErr, secretLeaseTaskErr } from './lease.ts';
import type { SecretStoreLeasePort } from './secret-delivery.ts';
import {
  resolveWindowsBrokerBootstrapChildPorts,
  type WindowsBrokerBootstrapCompositionRuntime
} from './windows-bootstrap-composition.ts';

const failJournal = <Value>(): ReturnType<typeof journalErr<Value>> => journalErr<Value>({
  code: 'journal-unavailable',
  message: 'fixture journal is unavailable'
});

const journal = (): AuthorityJournal => ({
  grants: {
    commitWithConsent: () => Promise.resolve(failJournal()),
    readGrant: () => Promise.resolve(journalOk(null)),
    readConsent: () => Promise.resolve(journalOk(null))
  },
  leases: {
    create: () => Promise.resolve(failJournal()),
    claimAuthorized: () => Promise.resolve(failJournal()),
    transition: () => Promise.resolve(failJournal()),
    read: () => Promise.resolve(journalOk(null)),
    readNonterminalForAttempt: () => Promise.resolve(journalOk([])),
    readClosedCountForAttempt: () => Promise.resolve(journalOk(0))
  },
  attempts: {
    reserve: () => Promise.resolve(failJournal()),
    reserveGrantQualifiedMaterializing: () => Promise.resolve(failJournal()),
    readGrantQualifiedMaterializing: () => Promise.resolve(journalOk(null)),
    readGrantQualifiedAttempt: () => Promise.resolve(journalOk(null)),
    bindVerifiedWindowsContainmentAndStart: () => Promise.resolve(failJournal()),
    readGrantQualifiedContainedAttempt: () => Promise.resolve(journalOk(null)),
    finalizeVerifiedWindowsTerminalCleanup: () => Promise.resolve(failJournal()),
    readVerifiedWindowsTerminalCleanup: () => Promise.resolve(journalOk(null)),
    bindBootstrap: () => Promise.resolve(failJournal()),
    transition: () => Promise.resolve(failJournal()),
    read: () => Promise.resolve(journalOk(null))
  },
  transfers: {
    consume: () => Promise.resolve(failJournal()),
    read: () => Promise.resolve(journalOk(null))
  }
});

const secretStore: SecretStoreLeasePort = {
  withSecret: () => secretLeaseTaskErr({
    code: 'secret-unavailable',
    message: 'fixture secret is unavailable'
  })
};

const runtime = (
  hostRead: WindowsBrokerBootstrapCompositionRuntime['hostConfiguration']['read']
): WindowsBrokerBootstrapCompositionRuntime => ({
  localApplicationData: {
    resolveCurrentUserRoot: () => Promise.resolve(journalErr({
      code: 'journal-unavailable',
      message: 'fixture profile is unavailable'
    }))
  },
  hostConfiguration: {
    read: hostRead,
    initialize: () => Promise.resolve({
      type: 'err',
      issues: [{
        code: 'host-configuration-unavailable',
        message: 'fixture configuration is unavailable'
      }]
    })
  },
  journal: journal(),
  currentRecipes: {
    create: () => ({
      resolveCurrentRecipe: () => currentRecipeTaskErr({
        code: 'recipe-drift',
        message: 'fixture recipe is unavailable'
      })
    })
  },
  currentReceiverAttempt: {
    verifyCurrentAttempt: () => Promise.resolve(secretLeaseErr({
      code: 'bootstrap-rejected',
      message: 'fixture receiver is unavailable'
    }))
  },
  bootstrapRuntime: {
    send: () => secretLeaseTaskErr({
      code: 'bootstrap-rejected',
      message: 'fixture transport is unavailable'
    }),
    receive: () => secretLeaseTaskErr({
      code: 'bootstrap-rejected',
      message: 'fixture transport is unavailable'
    }),
    disconnect: () => secretLeaseErr({
      code: 'bootstrap-rejected',
      message: 'fixture transport is unavailable'
    })
  },
  secretStore,
  clock: { nowMs: () => 1_000 }
});

describe('Windows broker bootstrap composition', () => {
  it('composes durable authority only after reading the exact host-owned Git executable', async () => {
    const gitExecutable = 'C:\\Program Files\\Git\\cmd\\git.exe';
    const hostRead = vi.fn(() => Promise.resolve({
      type: 'ok' as const,
      value: {
        kind: 'broker-host-configuration' as const,
        schema: 'epsilonode.nebular.broker-host-configuration/v1' as const,
        gitExecutable: { kind: 'canonical-git-executable' as const, value: gitExecutable }
      }
    }));
    const fixture = runtime(hostRead);
    const currentRecipe = vi.fn(fixture.currentRecipes.create);

    const result = await resolveWindowsBrokerBootstrapChildPorts(
      { leaseLifetimeMs: 30_000, adapterTimeoutMs: 1_000 },
      { ...fixture, currentRecipes: { create: currentRecipe } }
    );

    expect(result.isOk()).toBe(true);
    expect(hostRead).toHaveBeenCalledOnce();
    expect(currentRecipe).toHaveBeenCalledWith(gitExecutable);
    if (result.isOk()) {
      expect(result.value.runtime).toBe(fixture.bootstrapRuntime);
      expect(result.value.secretStore).toBe(fixture.secretStore);
      expect(result.value.clock).toBe(fixture.clock);
    }
  });

  it('fails closed without constructing Git authority when host configuration is unavailable', async () => {
    const fixture = runtime(() => Promise.resolve({
      type: 'err',
      issues: [{
        code: 'host-configuration-not-initialized',
        message: 'fixture configuration is missing'
      }]
    }));
    const currentRecipe = vi.fn(fixture.currentRecipes.create);

    const result = await resolveWindowsBrokerBootstrapChildPorts({}, {
      ...fixture,
      currentRecipes: { create: currentRecipe }
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0] : undefined).toEqual({
      code: 'bootstrap-failed',
      message: 'The Windows broker bootstrap composition is unavailable.'
    });
    expect(currentRecipe).not.toHaveBeenCalled();
  });

  it('redacts rejected host reads and synchronous adapter construction defects', async () => {
    const rejected = await resolveWindowsBrokerBootstrapChildPorts({}, runtime(() => Promise.reject(
      new Error('sensitive host path')
    )));
    const fixture = runtime(() => Promise.resolve({
      type: 'ok',
      value: {
        kind: 'broker-host-configuration',
        schema: 'epsilonode.nebular.broker-host-configuration/v1',
        gitExecutable: {
          kind: 'canonical-git-executable',
          value: 'C:\\Program Files\\Git\\cmd\\git.exe'
        }
      }
    }));
    const thrown = await resolveWindowsBrokerBootstrapChildPorts({}, {
      ...fixture,
      currentRecipes: {
        create: () => {
          throw new Error('sensitive adapter failure');
        }
      }
    });

    expect(rejected.isErr() ? rejected.error[0].message : '').not.toContain('sensitive');
    expect(thrown.isErr() ? thrown.error[0].message : '').not.toContain('sensitive');
  });

  it('rejects invalid bounds before touching host authority', async () => {
    const hostRead = vi.fn(() => Promise.resolve({
      type: 'err' as const,
      issues: [{
        code: 'host-configuration-unavailable' as const,
        message: 'fixture configuration is unavailable'
      }] as const
    }));

    const result = await resolveWindowsBrokerBootstrapChildPorts(
      { leaseLifetimeMs: 0, adapterTimeoutMs: 20_000 },
      runtime(hostRead)
    );
    const oversizedLease = await resolveWindowsBrokerBootstrapChildPorts(
      { leaseLifetimeMs: 60_001, adapterTimeoutMs: 1_000 },
      runtime(hostRead)
    );

    expect(result.isErr()).toBe(true);
    expect(oversizedLease.isErr()).toBe(true);
    expect(hostRead).not.toHaveBeenCalled();
  });
});
