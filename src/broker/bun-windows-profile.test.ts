import { describe, expect, it, vi } from 'vitest';

import {
  createWindowsKnownFolderLocalApplicationDataPort,
  type WindowsKnownFolderRuntimePort
} from './bun-windows-profile.ts';

const runtime = (
  resolveLocalApplicationData: WindowsKnownFolderRuntimePort['resolveLocalApplicationData']
): WindowsKnownFolderRuntimePort => ({ resolveLocalApplicationData });

describe('Windows Known Folder trusted profile adapter', () => {
  it('projects the operating-system LocalAppData result into a normalized trusted root', async () => {
    const resolve = vi.fn(() => Promise.resolve({
      status: 'resolved' as const,
      path: 'C:\\Users\\Broker\\AppData\\Local\\.'
    }));
    const result = await createWindowsKnownFolderLocalApplicationDataPort(runtime(resolve))
      .resolveCurrentUserRoot();

    expect(result).toEqual({
      type: 'ok',
      value: { kind: 'trusted-profile-root', value: 'C:\\Users\\Broker\\AppData\\Local' }
    });
    expect(resolve).toHaveBeenCalledOnce();
  });

  it.each([
    '\\\\server\\share\\profile',
    'relative\\profile',
    'C:\\profile\0suffix',
    ''
  ])('rejects an untrusted LocalAppData path without exposing it: %j', async path => {
    const result = await createWindowsKnownFolderLocalApplicationDataPort(runtime(
      () => Promise.resolve({ status: 'resolved', path })
    )).resolveCurrentUserRoot();

    expect(result).toEqual({
      type: 'err',
      issues: [{
        code: 'journal-unavailable',
        message: 'The trusted current-user profile location is unavailable.'
      }]
    });
  });

  it('maps missing, rejected, and synchronously throwing host capabilities to one redacted failure', async () => {
    const ports = [
      createWindowsKnownFolderLocalApplicationDataPort(runtime(
        () => Promise.resolve({ status: 'unavailable' })
      )),
      createWindowsKnownFolderLocalApplicationDataPort(runtime(
        () => Promise.reject(new Error('private host detail'))
      )),
      createWindowsKnownFolderLocalApplicationDataPort(runtime(
        () => { throw new Error('private host detail'); }
      ))
    ];

    expect(await Promise.all(ports.map(port => port.resolveCurrentUserRoot()))).toEqual([
      expect.objectContaining({ type: 'err' }),
      expect.objectContaining({ type: 'err' }),
      expect.objectContaining({ type: 'err' })
    ]);
  });

  it('fails without invoking a Windows FFI capability on other platforms', async () => {
    const resolve = vi.fn(() => Promise.resolve({ status: 'resolved' as const, path: 'C:\\ignored' }));
    const result = await createWindowsKnownFolderLocalApplicationDataPort(runtime(resolve), 'linux')
      .resolveCurrentUserRoot();

    expect(result).toEqual(expect.objectContaining({ type: 'err' }));
    expect(resolve).not.toHaveBeenCalled();
  });
});
