import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { win32 } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { journalErr, journalOk, type TrustedLocalApplicationDataPort } from './journal.ts';
import {
  BROKER_HOST_CONFIGURATION_MAX_BYTES,
  BROKER_HOST_CONFIGURATION_RELATIVE_PATH,
  BROKER_HOST_CONFIGURATION_SCHEMA,
  createWindowsBrokerHostConfigurationPort,
  createWindowsBrokerHostConfigurationRuntime,
  type BrokerHostConfigurationRuntimePort
} from './windows-host-configuration.ts';

const PROFILE_ROOT = 'C:\\Users\\Broker\\AppData\\Local';
const CONFIGURATION_PATH = win32.join(PROFILE_ROOT, ...BROKER_HOST_CONFIGURATION_RELATIVE_PATH);
const GIT_EXECUTABLE = 'C:\\Program Files\\Git\\cmd\\git.exe';

const encodedConfiguration = (gitExecutable: string = GIT_EXECUTABLE): string =>
  `${JSON.stringify({ schema: BROKER_HOST_CONFIGURATION_SCHEMA, gitExecutable })}\n`;

const trustedProfile = (
  root: string = PROFILE_ROOT
): TrustedLocalApplicationDataPort => ({
  resolveCurrentUserRoot: () => Promise.resolve(journalOk({ kind: 'trusted-profile-root', value: root }))
});

const fakeRuntime = (
  overrides: Partial<BrokerHostConfigurationRuntimePort> = {}
): BrokerHostConfigurationRuntimePort => ({
  readBoundedUtf8File: () => Promise.resolve({ status: 'read', text: encodedConfiguration() }),
  canonicalizeExistingRegularFile: path => Promise.resolve({ status: 'resolved', canonicalPath: path }),
  writeUtf8FileAtomically: () => Promise.resolve({ status: 'written' }),
  ...overrides
});

const invalidOutcome = {
  type: 'err',
  issues: [{
    code: 'host-configuration-invalid',
    message: 'The broker host configuration is invalid.'
  }]
} as const;

const temporaryDirectories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(win32.join(tmpdir(), 'nebular-host-configuration-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('Windows broker host-configuration authority', () => {
  it('derives the fixed broker-owned path and re-realpaths Git on every read', async () => {
    const readBoundedUtf8File = vi.fn(() => Promise.resolve({
      status: 'read' as const,
      text: encodedConfiguration()
    }));
    const canonicalizeExistingRegularFile = vi.fn(() => Promise.resolve({
      status: 'resolved' as const,
      canonicalPath: GIT_EXECUTABLE
    }));
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      readBoundedUtf8File,
      canonicalizeExistingRegularFile
    }));

    expect(await port.read()).toEqual({
      type: 'ok',
      value: {
        kind: 'broker-host-configuration',
        schema: BROKER_HOST_CONFIGURATION_SCHEMA,
        gitExecutable: { kind: 'canonical-git-executable', value: GIT_EXECUTABLE }
      }
    });
    expect(await port.read()).toEqual(expect.objectContaining({ type: 'ok' }));
    expect(readBoundedUtf8File).toHaveBeenNthCalledWith(
      1,
      CONFIGURATION_PATH,
      BROKER_HOST_CONFIGURATION_MAX_BYTES
    );
    expect(readBoundedUtf8File).toHaveBeenCalledTimes(2);
    expect(canonicalizeExistingRegularFile).toHaveBeenCalledTimes(2);
    expect(canonicalizeExistingRegularFile).toHaveBeenCalledWith(GIT_EXECUTABLE);
  });

  it('canonicalizes a local alias before persisting only the canonical executable', async () => {
    const alias = 'C:\\Tools\\CurrentGit\\git.exe';
    const canonicalizeExistingRegularFile = vi.fn(() => Promise.resolve({
      status: 'resolved' as const,
      canonicalPath: GIT_EXECUTABLE
    }));
    const writeUtf8FileAtomically = vi.fn(() => Promise.resolve({ status: 'written' as const }));
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      canonicalizeExistingRegularFile,
      writeUtf8FileAtomically
    }));

    expect(await port.initialize({ gitExecutable: alias })).toEqual(expect.objectContaining({ type: 'ok' }));
    expect(canonicalizeExistingRegularFile).toHaveBeenCalledWith(alias);
    expect(writeUtf8FileAtomically).toHaveBeenCalledWith(
      CONFIGURATION_PATH,
      encodedConfiguration(GIT_EXECUTABLE),
      BROKER_HOST_CONFIGURATION_MAX_BYTES
    );
  });

  it.each([
    ['', 'empty'],
    ['{"schema":', 'partial JSON'],
    [JSON.stringify({ schema: BROKER_HOST_CONFIGURATION_SCHEMA, gitExecutable: GIT_EXECUTABLE }), 'missing canonical newline'],
    [`${JSON.stringify({ gitExecutable: GIT_EXECUTABLE, schema: BROKER_HOST_CONFIGURATION_SCHEMA })}\n`, 'reordered keys'],
    [`${JSON.stringify({ schema: BROKER_HOST_CONFIGURATION_SCHEMA, gitExecutable: GIT_EXECUTABLE, extra: true })}\n`, 'extra key'],
    [`{"schema":"${BROKER_HOST_CONFIGURATION_SCHEMA}","gitExecutable":"C:\\\\Git\\\\git.exe","gitExecutable":"C:\\\\Other\\\\git.exe"}\n`, 'duplicate key'],
    [`{"schema":"wrong","gitExecutable":"${GIT_EXECUTABLE.replaceAll('\\', '\\\\')}"}\n`, 'wrong schema'],
    [encodedConfiguration('relative\\git.exe'), 'relative executable'],
    [encodedConfiguration('\\\\server\\share\\git.exe'), 'UNC executable'],
    [encodedConfiguration('\\\\?\\C:\\Git\\git.exe'), 'Win32 device executable'],
    [encodedConfiguration('\\\\.\\C:\\Git\\git.exe'), 'Win32 device namespace executable'],
    [encodedConfiguration('\\??\\C:\\Git\\git.exe'), 'NT device executable'],
    [encodedConfiguration('C:\\Git\\git.exe\0tail'), 'NUL executable'],
    [encodedConfiguration('C:\\Git\\\uD800\\git.exe'), 'ill-formed Unicode executable'],
    [encodedConfiguration('C:\\Git\\.\\git.exe'), 'noncanonical executable']
  ])('rejects %s (%s) before resolving an executable', async (text, _label) => {
    const canonicalizeExistingRegularFile = vi.fn(() => Promise.resolve({
      status: 'resolved' as const,
      canonicalPath: GIT_EXECUTABLE
    }));
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      readBoundedUtf8File: () => Promise.resolve({ status: 'read', text }),
      canonicalizeExistingRegularFile
    }));

    expect(await port.read()).toEqual(invalidOutcome);
    expect(canonicalizeExistingRegularFile).not.toHaveBeenCalled();
  });

  it('rejects a substituted symlink alias when realpath no longer equals the persisted path', async () => {
    const alias = 'C:\\Tools\\CurrentGit\\git.exe';
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      readBoundedUtf8File: () => Promise.resolve({ status: 'read', text: encodedConfiguration(alias) }),
      canonicalizeExistingRegularFile: () => Promise.resolve({
        status: 'resolved',
        canonicalPath: GIT_EXECUTABLE
      })
    }));

    expect(await port.read()).toEqual(invalidOutcome);
  });

  it.each([
    [{ status: 'missing' as const }, 'host-configuration-not-initialized'],
    [{ status: 'invalid-file' as const }, 'host-configuration-invalid'],
    [{ status: 'unavailable' as const }, 'host-configuration-unavailable']
  ])('keeps file-read outcome %j distinct and redacted', async (readOutcome, expectedCode) => {
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      readBoundedUtf8File: () => Promise.resolve(readOutcome)
    }));
    const result = await port.read();

    expect(result).toEqual(expect.objectContaining({ type: 'err' }));
    expect(result.type === 'err' ? result.issues[0].code : '').toBe(expectedCode);
    expect(JSON.stringify(result)).not.toContain(PROFILE_ROOT);
    expect(JSON.stringify(result)).not.toContain(GIT_EXECUTABLE);
  });

  it.each([
    { status: 'missing' as const },
    { status: 'not-regular-file' as const }
  ])('fails closed when the executable disappears or changes kind during validation: %j', async canonicalOutcome => {
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      canonicalizeExistingRegularFile: () => Promise.resolve(canonicalOutcome)
    }));

    expect(await port.read()).toEqual(invalidOutcome);
  });

  it('maps rejected profile and filesystem effects to redacted unavailable outcomes', async () => {
    const readBoundedUtf8File = vi.fn(() => Promise.resolve({ status: 'unavailable' as const }));
    const rejectedProfile: TrustedLocalApplicationDataPort = {
      resolveCurrentUserRoot: () => Promise.reject(new Error(`private ${PROFILE_ROOT}`))
    };
    const deniedProfile: TrustedLocalApplicationDataPort = {
      resolveCurrentUserRoot: () => Promise.resolve(journalErr({
        code: 'journal-unavailable',
        message: `private ${PROFILE_ROOT}`
      }))
    };
    const ports = [rejectedProfile, deniedProfile].map(profile =>
      createWindowsBrokerHostConfigurationPort(profile, fakeRuntime({ readBoundedUtf8File }))
    );
    const outcomes = await Promise.all(ports.map(port => port.read()));

    expect(outcomes).toEqual(outcomes.map(() => ({
      type: 'err',
      issues: [{
        code: 'host-configuration-unavailable',
        message: 'The broker host configuration is unavailable.'
      }]
    })));
    expect(readBoundedUtf8File).not.toHaveBeenCalled();
    expect(JSON.stringify(outcomes)).not.toContain(PROFILE_ROOT);
  });

  it.each([
    'relative\\git.exe',
    '\\\\server\\share\\git.exe',
    '\\\\?\\C:\\Git\\git.exe',
    '\\\\.\\C:\\Git\\git.exe',
    '\\??\\C:\\Git\\git.exe',
    'C:\\Git\\git.exe\0tail',
    'C:\\Git\\\uD800\\git.exe'
  ])('rejects an unsafe initialization path without touching the filesystem: %j', async gitExecutable => {
    const canonicalizeExistingRegularFile = vi.fn(() => Promise.resolve({
      status: 'resolved' as const,
      canonicalPath: GIT_EXECUTABLE
    }));
    const writeUtf8FileAtomically = vi.fn(() => Promise.resolve({ status: 'written' as const }));
    const port = createWindowsBrokerHostConfigurationPort(trustedProfile(), fakeRuntime({
      canonicalizeExistingRegularFile,
      writeUtf8FileAtomically
    }));

    expect(await port.initialize({ gitExecutable })).toEqual(invalidOutcome);
    expect(canonicalizeExistingRegularFile).not.toHaveBeenCalled();
    expect(writeUtf8FileAtomically).not.toHaveBeenCalled();
  });

  it('does not disclose paths when atomic persistence fails or rejects', async () => {
    const ports = [
      fakeRuntime({ writeUtf8FileAtomically: () => Promise.resolve({ status: 'failed' }) }),
      fakeRuntime({ writeUtf8FileAtomically: () => Promise.reject(new Error(`private ${GIT_EXECUTABLE}`)) })
    ].map(runtime => createWindowsBrokerHostConfigurationPort(trustedProfile(), runtime));
    const outcomes = await Promise.all(ports.map(port => port.initialize({ gitExecutable: GIT_EXECUTABLE })));

    expect(outcomes.every(outcome => outcome.type === 'err' &&
      outcome.issues[0].code === 'host-configuration-unavailable')).toBe(true);
    expect(JSON.stringify(outcomes)).not.toContain(GIT_EXECUTABLE);
  });
});

describe('Windows broker host-configuration filesystem runtime', () => {
  it('writes and replaces one complete file without leaving temporary files', async () => {
    const directory = await temporaryDirectory();
    const target = win32.join(directory, 'nested', 'host-configuration.v1.json');
    const runtime = createWindowsBrokerHostConfigurationRuntime();

    expect(await runtime.writeUtf8FileAtomically(target, 'first\n', 64)).toEqual({ status: 'written' });
    expect(await runtime.writeUtf8FileAtomically(target, 'second\n', 64)).toEqual({ status: 'written' });
    expect(await readFile(target, 'utf8')).toBe('second\n');
    expect(await readdir(win32.dirname(target))).toEqual(['host-configuration.v1.json']);
  });

  it('cleans its owned temporary file when the final rename fails', async () => {
    const directory = await temporaryDirectory();
    const target = win32.join(directory, 'nested', 'host-configuration.v1.json');
    await mkdir(target, { recursive: true });
    const runtime = createWindowsBrokerHostConfigurationRuntime();

    expect(await runtime.writeUtf8FileAtomically(target, 'content\n', 64)).toEqual({ status: 'failed' });
    expect(await readdir(win32.dirname(target))).toEqual(['host-configuration.v1.json']);
  });

  it('bounds reads, decodes UTF-8 fatally, and distinguishes a missing file', async () => {
    const directory = await temporaryDirectory();
    const target = win32.join(directory, 'host-configuration.v1.json');
    const runtime = createWindowsBrokerHostConfigurationRuntime();

    await writeFile(target, Uint8Array.from([0xC3, 0x28]));
    expect(await runtime.readBoundedUtf8File(target, 8)).toEqual({ status: 'invalid-file' });
    await writeFile(target, '123456789', 'utf8');
    expect(await runtime.readBoundedUtf8File(target, 8)).toEqual({ status: 'invalid-file' });
    await rm(target);
    expect(await runtime.readBoundedUtf8File(target, 8)).toEqual({ status: 'missing' });
  });

  it('resolves only an existing regular file and rechecks the same path after replacement', async () => {
    const directory = await temporaryDirectory();
    const executable = win32.join(directory, 'git.exe');
    const replacement = win32.join(directory, 'git-replacement.exe');
    const runtime = createWindowsBrokerHostConfigurationRuntime();
    await writeFile(executable, 'first', 'utf8');
    await writeFile(replacement, 'second', 'utf8');

    expect(await runtime.canonicalizeExistingRegularFile(executable)).toEqual({
      status: 'resolved',
      canonicalPath: executable
    });
    await rm(executable);
    expect(await runtime.canonicalizeExistingRegularFile(executable)).toEqual({ status: 'missing' });
    await writeFile(executable, await readFile(replacement));
    expect(await runtime.canonicalizeExistingRegularFile(executable)).toEqual({
      status: 'resolved',
      canonicalPath: executable
    });
    expect(await runtime.canonicalizeExistingRegularFile(directory)).toEqual({ status: 'not-regular-file' });
  });
});
