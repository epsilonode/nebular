import { win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import { authorityTaskErr, type BrokerAuthorityPorts } from './authority.ts';
import {
  createBunSqliteAuthorityJournal,
  type BunSqliteJournalOptions
} from './bun-sqlite-journal.ts';
import type { GitJournalExecutionAuthorityOptions } from './git-journal-execution-authority.ts';
import type { GitCurrentRecipeRuntime } from './git-current-recipe.ts';
import type { AuthorityJournal } from './journal.ts';
import type { BrokerResult } from './result.ts';
import {
  BROKER_HOST_CONFIGURATION_MAX_BYTES,
  BROKER_HOST_CONFIGURATION_RELATIVE_PATH,
  BROKER_HOST_CONFIGURATION_SCHEMA,
  type BrokerHostConfigurationRuntimePort
} from './windows-host-configuration.ts';
import {
  resolveWindowsExecutionAuthorityContext,
  WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION,
  WINDOWS_EXECUTION_AUTHORITY_MAX_ADAPTER_TIMEOUT_MS,
  WINDOWS_EXECUTION_AUTHORITY_MAX_JOURNAL_BUSY_TIMEOUT_MS,
  type WindowsExecutionAuthorityContext,
  type WindowsExecutionAuthorityContextRuntime
} from './windows-execution-authority-context.ts';

const profileRoot = 'C:\\Users\\Agent\\AppData\\Local';
const gitExecutable = 'C:\\Program Files\\Git\\cmd\\git.exe';

const authorityFailure = () => ({
  code: 'authority-denied' as const,
  message: 'fixture authority is unavailable'
});

const inertAuthority = (): BrokerAuthorityPorts => ({
  canonicalizeRepository: () => authorityTaskErr(authorityFailure()),
  resolveRecipe: () => authorityTaskErr(authorityFailure()),
  readGrant: () => authorityTaskErr(authorityFailure())
});

const gitRuntime = (): GitCurrentRecipeRuntime => ({
  run: () => ({ status: 'failed' }),
  canonicalizeExistingPath: path => path,
  pathsEqual: (left, right) => left === right,
  monotonicNowMs: () => 1_000
});

const configurationText = (): string => `${JSON.stringify({
  schema: BROKER_HOST_CONFIGURATION_SCHEMA,
  gitExecutable
})}\n`;

const hostConfigurationRuntime = (
  reads: string[] = [],
  canonicalizations: string[] = []
): BrokerHostConfigurationRuntimePort => ({
  readBoundedUtf8File: (path, maximumBytes) => {
    reads.push(`${path}|${maximumBytes}`);
    return Promise.resolve({ status: 'read', text: configurationText() });
  },
  canonicalizeExistingRegularFile: path => {
    canonicalizations.push(path);
    return Promise.resolve({ status: 'resolved', canonicalPath: path });
  },
  writeUtf8FileAtomically: () => Promise.resolve({ status: 'failed' })
});

type RuntimeObservations = Readonly<{
  knownFolderCalls: string[];
  hostReads: string[];
  canonicalizations: string[];
  journalOptions: BunSqliteJournalOptions[];
  authorityOptions: GitJournalExecutionAuthorityOptions[];
  authorityGitRuntimes: GitCurrentRecipeRuntime[];
  journal: AuthorityJournal;
  authority: BrokerAuthorityPorts;
}>;

const runtimeFixture = (): Readonly<{
  runtime: WindowsExecutionAuthorityContextRuntime;
  observed: RuntimeObservations;
}> => {
  const knownFolderCalls: string[] = [];
  const hostReads: string[] = [];
  const canonicalizations: string[] = [];
  const journalOptions: BunSqliteJournalOptions[] = [];
  const authorityOptions: GitJournalExecutionAuthorityOptions[] = [];
  const authorityGitRuntimes: GitCurrentRecipeRuntime[] = [];
  const journal = createBunSqliteAuthorityJournal({
    profilePath: {
      resolveAuthorityDatabasePath: () => Promise.resolve({
        type: 'err',
        issues: [{ code: 'journal-unavailable', message: 'fixture path is unavailable' }]
      })
    },
    applicationVersion: WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION,
    clock: { nowMs: () => 1_000 }
  });
  const authority = inertAuthority();
  const git = gitRuntime();
  return {
    runtime: {
      platform: 'win32',
      knownFolder: {
        resolveLocalApplicationData: () => {
          knownFolderCalls.push('resolve');
          return Promise.resolve({ status: 'resolved', path: profileRoot });
        }
      },
      hostConfiguration: hostConfigurationRuntime(hostReads, canonicalizations),
      git,
      journals: {
        create: options => {
          journalOptions.push(options);
          return journal;
        }
      },
      authorities: {
        create: (options, currentGitRuntime) => {
          authorityOptions.push(options);
          authorityGitRuntimes.push(currentGitRuntime);
          return authority;
        }
      },
      clock: { nowMs: () => 1_000 }
    },
    observed: {
      knownFolderCalls,
      hostReads,
      canonicalizations,
      journalOptions,
      authorityOptions,
      authorityGitRuntimes,
      journal,
      authority
    }
  };
};

const expectFailure = (result: BrokerResult<WindowsExecutionAuthorityContext>): void => {
  expect(result).toEqual({
    error: [{
      code: 'bootstrap-failed',
      message: 'The Windows execution authority context is unavailable.'
    }]
  });
};

describe('Windows execution authority context', () => {
  it('binds Known Folder, host Git, SQLite, SHA-256, and Git authority to one trusted profile root', async () => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({
      adapterTimeoutMs: 3_000,
      recipeBlobLimitBytes: 2_000_000,
      journalBusyTimeoutMs: 750
    }, fixture.runtime);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({
      authority: fixture.observed.authority,
      journal: fixture.observed.journal,
      trustedProfileRoot: { kind: 'trusted-profile-root', value: profileRoot },
      gitExecutable: { kind: 'canonical-git-executable', value: gitExecutable }
    });
    expect(fixture.observed.knownFolderCalls).toEqual(['resolve']);
    expect(fixture.observed.hostReads).toEqual([
      `${win32.join(profileRoot, ...BROKER_HOST_CONFIGURATION_RELATIVE_PATH)}|${BROKER_HOST_CONFIGURATION_MAX_BYTES}`
    ]);
    expect(fixture.observed.canonicalizations).toEqual([gitExecutable]);
    expect(fixture.observed.journalOptions).toHaveLength(1);
    const journalOptions = fixture.observed.journalOptions[0];
    if (journalOptions === undefined) throw new Error('journal options were not composed');
    expect(journalOptions.applicationVersion).toBe('epsilonode-nebular-v1');
    expect(journalOptions.busyTimeoutMs).toBe(750);
    expect(journalOptions.clock).toBe(fixture.runtime.clock);
    const databasePath = await journalOptions.profilePath.resolveAuthorityDatabasePath();
    expect(databasePath).toEqual({
      type: 'ok',
      value: {
        kind: 'authority-database-path',
        value: win32.join(profileRoot, 'epsilonode', 'nebular', 'broker', 'v1', 'authority.sqlite3')
      }
    });
    expect(fixture.observed.authorityOptions).toHaveLength(1);
    const authorityOptions = fixture.observed.authorityOptions[0];
    if (authorityOptions === undefined) throw new Error('authority options were not composed');
    expect(authorityOptions.git).toEqual({
      gitExecutable,
      deadlineMs: 3_000,
      blobLimitBytes: 2_000_000
    });
    expect(authorityOptions.grants).toBe(fixture.observed.journal.grants);
    expect(fixture.observed.authorityGitRuntimes).toEqual([fixture.runtime.git]);
    expect(authorityOptions.sha256.sha256(new TextEncoder().encode('abc'))).toEqual({
      value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    });
  });

  it.each([
    { adapterTimeoutMs: 0 },
    { adapterTimeoutMs: WINDOWS_EXECUTION_AUTHORITY_MAX_ADAPTER_TIMEOUT_MS + 1 },
    { recipeBlobLimitBytes: 0 },
    { journalBusyTimeoutMs: WINDOWS_EXECUTION_AUTHORITY_MAX_JOURNAL_BUSY_TIMEOUT_MS + 1 }
  ] as const)('rejects invalid bounds before resolving host authority: %j', async options => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext(options, fixture.runtime);

    expectFailure(result);
    expect(fixture.observed.knownFolderCalls).toEqual([]);
    expect(fixture.observed.journalOptions).toEqual([]);
    expect(fixture.observed.authorityOptions).toEqual([]);
  });

  it('fails closed when the trusted Known Folder adapter rejects', async () => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({}, {
      ...fixture.runtime,
      knownFolder: {
        resolveLocalApplicationData: () => Promise.reject(new Error('private-profile-path'))
      }
    });

    expectFailure(result);
    expect(JSON.stringify(result)).not.toContain('private-profile-path');
    expect(fixture.observed.hostReads).toEqual([]);
  });

  it('fails closed when the host configuration adapter throws synchronously', async () => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({}, {
      ...fixture.runtime,
      hostConfiguration: {
        ...fixture.runtime.hostConfiguration,
        readBoundedUtf8File: (): ReturnType<BrokerHostConfigurationRuntimePort['readBoundedUtf8File']> => {
          throw new Error('private-host-configuration');
        }
      }
    });

    expectFailure(result);
    expect(JSON.stringify(result)).not.toContain('private-host-configuration');
    expect(fixture.observed.journalOptions).toEqual([]);
  });

  it.each(['journal', 'authority'] as const)('redacts a synchronous %s construction defect', async stage => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({}, {
      ...fixture.runtime,
      journals: stage === 'journal'
        ? {
            create: () => {
              throw new Error('private-journal-construction');
            }
          }
        : fixture.runtime.journals,
      authorities: stage === 'authority'
        ? {
            create: () => {
              throw new Error('private-authority-construction');
            }
          }
        : fixture.runtime.authorities
    });

    expectFailure(result);
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('does not fall back to PATH or construct persistence after invalid host configuration', async () => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({}, {
      ...fixture.runtime,
      hostConfiguration: {
        ...fixture.runtime.hostConfiguration,
        readBoundedUtf8File: () => Promise.resolve({ status: 'missing' })
      }
    });

    expectFailure(result);
    expect(fixture.observed.canonicalizations).toEqual([]);
    expect(fixture.observed.journalOptions).toEqual([]);
    expect(fixture.observed.authorityOptions).toEqual([]);
  });

  it('fails before persistence when Git launch-time canonicalization no longer matches host configuration', async () => {
    const fixture = runtimeFixture();
    const result = await resolveWindowsExecutionAuthorityContext({}, {
      ...fixture.runtime,
      git: {
        ...fixture.runtime.git,
        canonicalizeExistingPath: () => null
      }
    });

    expectFailure(result);
    expect(fixture.observed.canonicalizations).toEqual([gitExecutable]);
    expect(fixture.observed.journalOptions).toEqual([]);
    expect(fixture.observed.authorityOptions).toEqual([]);
  });
});
