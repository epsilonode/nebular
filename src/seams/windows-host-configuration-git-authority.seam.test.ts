import { win32 } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createWindowsKnownFolderLocalApplicationDataPort } from '../broker/bun-windows-profile.ts';
import {
  BROKER_HOST_CONFIGURATION_MAX_BYTES,
  BROKER_HOST_CONFIGURATION_RELATIVE_PATH,
  BROKER_HOST_CONFIGURATION_SCHEMA,
  createWindowsBrokerHostConfigurationPort,
  type BrokerHostConfigurationRuntimePort
} from '../broker/windows-host-configuration.ts';

const PROFILE_ROOT = 'C:\\Users\\Broker\\AppData\\Local';
const CANONICAL_GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const GIT_ALIAS = 'C:\\Tools\\Git\\git.exe';

const encodedConfiguration = (gitExecutable: string): string =>
  `${JSON.stringify({ schema: BROKER_HOST_CONFIGURATION_SCHEMA, gitExecutable })}\n`;

describe('Known Folder to canonical Git host-configuration seam', () => {
  it('persists and revalidates canonical Git authority only at the fixed broker-owned location', async () => {
    let persistedText = '';
    const expectedPath = win32.join(PROFILE_ROOT, ...BROKER_HOST_CONFIGURATION_RELATIVE_PATH);
    const readBoundedUtf8File = vi.fn(() => Promise.resolve({
      status: 'read' as const,
      text: persistedText
    }));
    const writeUtf8FileAtomically = vi.fn((_path: string, text: string) => {
      persistedText = text;
      return Promise.resolve({ status: 'written' as const });
    });
    const canonicalizeExistingRegularFile = vi.fn((path: string) => Promise.resolve({
      status: 'resolved' as const,
      canonicalPath: path === GIT_ALIAS ? CANONICAL_GIT : path
    }));
    const filesystem: BrokerHostConfigurationRuntimePort = {
      readBoundedUtf8File,
      canonicalizeExistingRegularFile,
      writeUtf8FileAtomically
    };
    const knownFolder = createWindowsKnownFolderLocalApplicationDataPort({
      resolveLocalApplicationData: () => Promise.resolve({ status: 'resolved', path: PROFILE_ROOT })
    });
    const host = createWindowsBrokerHostConfigurationPort(knownFolder, filesystem);

    expect(await host.initialize({ gitExecutable: GIT_ALIAS })).toEqual(expect.objectContaining({ type: 'ok' }));
    expect(persistedText).toBe(encodedConfiguration(CANONICAL_GIT));
    expect(await host.read()).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({
        gitExecutable: { kind: 'canonical-git-executable', value: CANONICAL_GIT }
      })
    }));
    expect(writeUtf8FileAtomically).toHaveBeenCalledWith(
      expectedPath,
      encodedConfiguration(CANONICAL_GIT),
      BROKER_HOST_CONFIGURATION_MAX_BYTES
    );
    expect(readBoundedUtf8File).toHaveBeenCalledWith(
      expectedPath,
      BROKER_HOST_CONFIGURATION_MAX_BYTES
    );
    expect(canonicalizeExistingRegularFile).toHaveBeenNthCalledWith(1, GIT_ALIAS);
    expect(canonicalizeExistingRegularFile).toHaveBeenNthCalledWith(2, CANONICAL_GIT);
  });

  it('fails before filesystem access when Known Folder does not establish a local profile root', async () => {
    const readBoundedUtf8File = vi.fn(() => Promise.resolve({ status: 'unavailable' as const }));
    const writeUtf8FileAtomically = vi.fn(() => Promise.resolve({ status: 'failed' as const }));
    const filesystem: BrokerHostConfigurationRuntimePort = {
      readBoundedUtf8File,
      canonicalizeExistingRegularFile: () => Promise.resolve({ status: 'unavailable' }),
      writeUtf8FileAtomically
    };
    const knownFolder = createWindowsKnownFolderLocalApplicationDataPort({
      resolveLocalApplicationData: () => Promise.resolve({
        status: 'resolved',
        path: '\\\\server\\share\\profile'
      })
    });
    const host = createWindowsBrokerHostConfigurationPort(knownFolder, filesystem);

    expect(await host.read()).toEqual({
      type: 'err',
      issues: [{
        code: 'host-configuration-unavailable',
        message: 'The broker host configuration is unavailable.'
      }]
    });
    expect(readBoundedUtf8File).not.toHaveBeenCalled();
    expect(writeUtf8FileAtomically).not.toHaveBeenCalled();
  });

  it('rejects a complete atomic config replacement that substitutes a noncanonical alias', async () => {
    const knownFolder = createWindowsKnownFolderLocalApplicationDataPort({
      resolveLocalApplicationData: () => Promise.resolve({ status: 'resolved', path: PROFILE_ROOT })
    });
    const host = createWindowsBrokerHostConfigurationPort(knownFolder, {
      readBoundedUtf8File: () => Promise.resolve({
        status: 'read',
        text: encodedConfiguration(GIT_ALIAS)
      }),
      canonicalizeExistingRegularFile: () => Promise.resolve({
        status: 'resolved',
        canonicalPath: CANONICAL_GIT
      }),
      writeUtf8FileAtomically: () => Promise.resolve({ status: 'failed' })
    });

    expect(await host.read()).toEqual({
      type: 'err',
      issues: [{
        code: 'host-configuration-invalid',
        message: 'The broker host configuration is invalid.'
      }]
    });
  });
});
