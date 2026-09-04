import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { win32 } from 'node:path';

import type { TrustedLocalApplicationDataPort, TrustedProfileRoot } from './journal.ts';
import { brokerTry } from './result.ts';

export const BROKER_HOST_CONFIGURATION_SCHEMA = 'epsilonode.nebular.broker-host-configuration/v1' as const;
export const BROKER_HOST_CONFIGURATION_MAX_BYTES = 256 * 1024;
export const BROKER_HOST_CONFIGURATION_RELATIVE_PATH = [
  'epsilonode',
  'nebular',
  'broker',
  'v1',
  'host-configuration.v1.json'
] as const;

const MAXIMUM_WINDOWS_PATH_CODE_UNITS = 32_767;

export type CanonicalGitExecutable = Readonly<{
  kind: 'canonical-git-executable';
  value: string;
}>;

export type BrokerHostConfiguration = Readonly<{
  kind: 'broker-host-configuration';
  schema: typeof BROKER_HOST_CONFIGURATION_SCHEMA;
  gitExecutable: CanonicalGitExecutable;
}>;

export type InitializeBrokerHostConfiguration = Readonly<{
  gitExecutable: string;
}>;

export type BrokerHostConfigurationIssueCode =
  | 'host-configuration-invalid'
  | 'host-configuration-not-initialized'
  | 'host-configuration-unavailable';

export type BrokerHostConfigurationIssue = Readonly<{
  code: BrokerHostConfigurationIssueCode;
  message: string;
}>;

export type BrokerHostConfigurationFailure = Readonly<{
  type: 'err';
  issues: readonly [BrokerHostConfigurationIssue];
}>;

export type BrokerHostConfigurationResult<T> =
  | Readonly<{ type: 'ok'; value: T }>
  | BrokerHostConfigurationFailure;

export type BrokerHostConfigurationFileReadOutcome =
  | Readonly<{ status: 'read'; text: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'invalid-file' }>
  | Readonly<{ status: 'unavailable' }>;

export type CanonicalExistingFileOutcome =
  | Readonly<{ status: 'resolved'; canonicalPath: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'not-regular-file' }>
  | Readonly<{ status: 'unavailable' }>;

export type BrokerHostConfigurationAtomicWriteOutcome =
  | Readonly<{ status: 'written' }>
  | Readonly<{ status: 'failed' }>;

export type BrokerHostConfigurationRuntimePort = Readonly<{
  readBoundedUtf8File: (
    path: string,
    maximumBytes: number
  ) => Promise<BrokerHostConfigurationFileReadOutcome>;
  canonicalizeExistingRegularFile: (path: string) => Promise<CanonicalExistingFileOutcome>;
  writeUtf8FileAtomically: (
    path: string,
    text: string,
    maximumBytes: number
  ) => Promise<BrokerHostConfigurationAtomicWriteOutcome>;
}>;

export type WindowsBrokerHostConfigurationPort = Readonly<{
  read: () => Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>>;
  initialize: (
    request: InitializeBrokerHostConfiguration
  ) => Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>>;
}>;

type PersistedBrokerHostConfiguration = Readonly<{
  schema: typeof BROKER_HOST_CONFIGURATION_SCHEMA;
  gitExecutable: string;
}>;

type LocalFilesystemFacts = Readonly<{
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}>;

type LocalFilesystemKind = 'directory' | 'file' | 'other' | 'symbolic-link';

const invalidIssue = (): BrokerHostConfigurationIssue => ({
  code: 'host-configuration-invalid',
  message: 'The broker host configuration is invalid.'
});

const missingIssue = (): BrokerHostConfigurationIssue => ({
  code: 'host-configuration-not-initialized',
  message: 'The broker host configuration has not been initialized.'
});

const unavailableIssue = (): BrokerHostConfigurationIssue => ({
  code: 'host-configuration-unavailable',
  message: 'The broker host configuration is unavailable.'
});

const configurationOk = <T>(value: T): BrokerHostConfigurationResult<T> => ({ type: 'ok', value });
const configurationErr = (issue: BrokerHostConfigurationIssue): BrokerHostConfigurationFailure => ({
  type: 'err',
  issues: [issue]
});

const invalid = (): BrokerHostConfigurationFailure => configurationErr(invalidIssue());
const missing = (): BrokerHostConfigurationFailure => configurationErr(missingIssue());
const unavailable = (): BrokerHostConfigurationFailure => configurationErr(unavailableIssue());

const isWellFormedUnicode = (value: string): boolean => Array.from(value).every(character => {
  const firstCodeUnit = character.charCodeAt(0);
  return character.length === 2 || firstCodeUnit < 0xD800 || firstCodeUnit > 0xDFFF;
});

const slashNormalized = (value: string): string => value.replaceAll('/', '\\');

const hasWindowsDevicePrefix = (value: string): boolean => {
  const normalized = slashNormalized(value);
  return normalized.startsWith('\\\\?\\') || normalized.startsWith('\\\\.\\') ||
    normalized.startsWith('\\??\\');
};

const isLocalAbsoluteWindowsPath = (value: string): boolean => {
  const normalizedSlashes = slashNormalized(value);
  return value.length > 0 && value.length <= MAXIMUM_WINDOWS_PATH_CODE_UNITS &&
    isWellFormedUnicode(value) && !value.includes('\0') && !hasWindowsDevicePrefix(value) &&
    !normalizedSlashes.startsWith('\\\\') && /^[A-Za-z]:\\/u.test(normalizedSlashes) &&
    win32.isAbsolute(normalizedSlashes) && !normalizedSlashes.slice(2).includes(':');
};

const isCanonicalLocalAbsoluteWindowsPath = (value: string): boolean =>
  isLocalAbsoluteWindowsPath(value) && value === win32.normalize(value);

const windowsPathsEqual = (left: string, right: string): boolean =>
  win32.normalize(left).toLocaleLowerCase('en-US') ===
  win32.normalize(right).toLocaleLowerCase('en-US');

const projectFilesystemKind = (facts: LocalFilesystemFacts): LocalFilesystemKind =>
  facts.isSymbolicLink()
    ? 'symbolic-link'
    : facts.isFile()
      ? 'file'
      : facts.isDirectory()
        ? 'directory'
        : 'other';

const localFilesystemKind = (path: string): LocalFilesystemKind =>
  projectFilesystemKind(lstatSync(path));

const configurationPath = (
  root: TrustedProfileRoot
): BrokerHostConfigurationResult<string> => {
  if (!isCanonicalLocalAbsoluteWindowsPath(root.value)) return invalid();
  const path = win32.join(root.value, ...BROKER_HOST_CONFIGURATION_RELATIVE_PATH);
  return isCanonicalLocalAbsoluteWindowsPath(path) ? configurationOk(path) : invalid();
};

const persistedConfiguration = (gitExecutable: string): PersistedBrokerHostConfiguration => ({
  schema: BROKER_HOST_CONFIGURATION_SCHEMA,
  gitExecutable
});

const encodeConfiguration = (configuration: PersistedBrokerHostConfiguration): string =>
  `${JSON.stringify(configuration)}\n`;

type ParsedJsonOutcome =
  | Readonly<{ status: 'parsed'; value: unknown }>
  | Readonly<{ status: 'failed' }>;

const parsedJson = (text: string): ParsedJsonOutcome => brokerTry<unknown>(
  () => JSON.parse(text) as unknown,
  { code: 'bootstrap-failed', message: 'The broker host configuration could not be decoded.' }
).match(
  value => ({ status: 'parsed', value }),
  () => ({ status: 'failed' })
);

const decodeConfiguration = (
  text: string
): BrokerHostConfigurationResult<PersistedBrokerHostConfiguration> => {
  const parsed = parsedJson(text);
  if (parsed.status === 'failed') return invalid();
  const decoded = parsed.value;
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return invalid();
  const schema: unknown = Reflect.get(decoded, 'schema');
  const gitExecutable: unknown = Reflect.get(decoded, 'gitExecutable');
  if (Object.keys(decoded).length !== 2 || schema !== BROKER_HOST_CONFIGURATION_SCHEMA ||
      typeof gitExecutable !== 'string') return invalid();
  const configuration = persistedConfiguration(gitExecutable);
  return encodeConfiguration(configuration) === text ? configurationOk(configuration) : invalid();
};

const domainConfiguration = (gitExecutable: string): BrokerHostConfiguration => ({
  kind: 'broker-host-configuration',
  schema: BROKER_HOST_CONFIGURATION_SCHEMA,
  gitExecutable: { kind: 'canonical-git-executable', value: gitExecutable }
});

const isMissingFilesystemError = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && Reflect.get(cause, 'code') === 'ENOENT';

const readFailure = (cause: unknown): BrokerHostConfigurationFileReadOutcome =>
  isMissingFilesystemError(cause) ? { status: 'missing' } : { status: 'unavailable' };

const canonicalFailure = (cause: unknown): CanonicalExistingFileOutcome =>
  isMissingFilesystemError(cause) ? { status: 'missing' } : { status: 'unavailable' };

const decodeFatalUtf8 = (bytes: Uint8Array): string | null => brokerTry(
  () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  { code: 'bootstrap-failed', message: 'The broker host configuration could not be decoded.' }
).match(value => value, () => null);

const atomicWriteFailed = (): BrokerHostConfigurationAtomicWriteOutcome => ({ status: 'failed' });
const atomicWriteSucceeded = (): BrokerHostConfigurationAtomicWriteOutcome => ({ status: 'written' });

const prepareCanonicalParentDirectory = (path: string): Promise<boolean> => {
  const parent = win32.dirname(path);
  return Promise.resolve().then(() => mkdir(parent, { recursive: true })).then(
    () => realpath(parent).then(
      canonicalParent => localFilesystemKind(parent) === 'directory' &&
        isCanonicalLocalAbsoluteWindowsPath(canonicalParent) && windowsPathsEqual(parent, canonicalParent),
      () => false
    ),
    () => false
  );
};

/*
 * The file is flushed before a same-directory rename so cooperative readers
 * observe a complete old or new document. V1 relies on inherited LocalAppData
 * ACLs: the POSIX mode is best effort on Windows, and this does not claim
 * parent-directory fsync/power-loss durability or resistance to same-user races.
 */
const writeOwnedTemporaryFile = (
  targetPath: string,
  temporaryPath: string,
  text: string
): Promise<BrokerHostConfigurationAtomicWriteOutcome> => open(temporaryPath, 'wx', 0o600).then(
  handle => {
    const removeOwnedTemporary = (): Promise<BrokerHostConfigurationAtomicWriteOutcome> =>
      handle.close().then(
        () => unlink(temporaryPath).then(atomicWriteFailed, atomicWriteFailed),
        () => unlink(temporaryPath).then(atomicWriteFailed, atomicWriteFailed)
      );
    return handle.writeFile(text, { encoding: 'utf8' }).then(() => handle.sync()).then(
      () => handle.close().then(
        () => rename(temporaryPath, targetPath).then(atomicWriteSucceeded, () =>
          unlink(temporaryPath).then(atomicWriteFailed, atomicWriteFailed)
        ),
        () => unlink(temporaryPath).then(atomicWriteFailed, atomicWriteFailed)
      ),
      removeOwnedTemporary
    );
  },
  atomicWriteFailed
);

export const createWindowsBrokerHostConfigurationRuntime = (): BrokerHostConfigurationRuntimePort => ({
  readBoundedUtf8File: (path, maximumBytes) => {
    if (!isCanonicalLocalAbsoluteWindowsPath(path) || !Number.isSafeInteger(maximumBytes) ||
        maximumBytes < 1 || maximumBytes > BROKER_HOST_CONFIGURATION_MAX_BYTES) {
      return Promise.resolve({ status: 'invalid-file' });
    }
    return Promise.resolve().then(() => localFilesystemKind(path)).then(
      kind => kind === 'file'
        ? open(path, 'r').then(
            handle => {
              const buffer = new Uint8Array(maximumBytes + 1);
              const readNext = (offset: number): Promise<number> => offset >= buffer.byteLength
                ? Promise.resolve(offset)
                : handle.read(buffer, offset, buffer.byteLength - offset, offset).then(
                    ({ bytesRead }: Readonly<{ bytesRead: number }>) => bytesRead === 0
                      ? offset
                      : readNext(offset + bytesRead)
                  );
              return readNext(0).then(
                bytesRead => handle.close().then(
                  (): BrokerHostConfigurationFileReadOutcome => {
                    if (bytesRead > maximumBytes) return { status: 'invalid-file' };
                    const text = decodeFatalUtf8(buffer.subarray(0, bytesRead));
                    return text === null ? { status: 'invalid-file' } : { status: 'read', text };
                  },
                  () => ({ status: 'unavailable' })
                ),
                () => handle.close().then(
                  () => ({ status: 'unavailable' }),
                  () => ({ status: 'unavailable' })
                )
              );
            },
            readFailure
          )
        : Promise.resolve({ status: 'invalid-file' }),
      readFailure
    );
  },
  canonicalizeExistingRegularFile: path => isLocalAbsoluteWindowsPath(path)
    ? Promise.resolve().then(() => realpath(path)).then(
        canonicalPath => Promise.resolve().then((): CanonicalExistingFileOutcome =>
          localFilesystemKind(canonicalPath) === 'file'
            ? { status: 'resolved', canonicalPath }
            : { status: 'not-regular-file' }
        ).then(
          outcome => outcome,
          canonicalFailure
        ),
        canonicalFailure
      )
    : Promise.resolve({ status: 'not-regular-file' }),
  writeUtf8FileAtomically: (path, text, maximumBytes) => {
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (!isCanonicalLocalAbsoluteWindowsPath(path) || !Number.isSafeInteger(maximumBytes) ||
        maximumBytes < 1 || maximumBytes > BROKER_HOST_CONFIGURATION_MAX_BYTES ||
        byteLength > maximumBytes) return Promise.resolve(atomicWriteFailed());
    const parent = win32.dirname(path);
    return prepareCanonicalParentDirectory(path).then(prepared => prepared
      ? Promise.resolve().then(() => randomUUID()).then(
          token => writeOwnedTemporaryFile(
            path,
            win32.join(parent, `.${win32.basename(path)}.${token}.tmp`),
            text
          ),
          atomicWriteFailed
        )
      : atomicWriteFailed());
  }
});

const resolveConfigurationPath = (
  localApplicationData: TrustedLocalApplicationDataPort
): Promise<BrokerHostConfigurationResult<string>> => Promise.resolve()
  .then(() => localApplicationData.resolveCurrentUserRoot())
  .then(
    root => root.type === 'ok' ? configurationPath(root.value) : unavailable(),
    () => unavailable()
  );

const readCanonicalConfiguration = (
  path: string,
  runtime: BrokerHostConfigurationRuntimePort
): Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>> => Promise.resolve()
  .then(() => runtime.readBoundedUtf8File(path, BROKER_HOST_CONFIGURATION_MAX_BYTES))
  .then(
    outcome => {
      if (outcome.status === 'missing') return Promise.resolve(missing());
      if (outcome.status === 'invalid-file') return Promise.resolve(invalid());
      if (outcome.status === 'unavailable') return Promise.resolve(unavailable());
      const decoded = decodeConfiguration(outcome.text);
      if (decoded.type === 'err' || !isCanonicalLocalAbsoluteWindowsPath(decoded.value.gitExecutable)) {
        return Promise.resolve(invalid());
      }
      return Promise.resolve()
        .then(() => runtime.canonicalizeExistingRegularFile(decoded.value.gitExecutable))
        .then(
          canonical => canonical.status === 'resolved' &&
            isCanonicalLocalAbsoluteWindowsPath(canonical.canonicalPath) &&
            canonical.canonicalPath === decoded.value.gitExecutable
            ? configurationOk(domainConfiguration(canonical.canonicalPath))
            : canonical.status === 'unavailable' ? unavailable() : invalid(),
          () => unavailable()
        );
    },
    () => unavailable()
  );

const initializeCanonicalConfiguration = (
  path: string,
  request: InitializeBrokerHostConfiguration,
  runtime: BrokerHostConfigurationRuntimePort
): Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>> => {
  if (!isLocalAbsoluteWindowsPath(request.gitExecutable)) return Promise.resolve(invalid());
  return Promise.resolve()
    .then(() => runtime.canonicalizeExistingRegularFile(request.gitExecutable))
    .then(
      canonical => {
        if (canonical.status !== 'resolved') {
          return Promise.resolve(canonical.status === 'unavailable' ? unavailable() : invalid());
        }
        if (!isCanonicalLocalAbsoluteWindowsPath(canonical.canonicalPath)) return Promise.resolve(invalid());
        const configuration = persistedConfiguration(canonical.canonicalPath);
        const text = encodeConfiguration(configuration);
        if (new TextEncoder().encode(text).byteLength > BROKER_HOST_CONFIGURATION_MAX_BYTES) {
          return Promise.resolve(invalid());
        }
        return Promise.resolve()
          .then(() => runtime.writeUtf8FileAtomically(
            path,
            text,
            BROKER_HOST_CONFIGURATION_MAX_BYTES
          ))
          .then(
            written => written.status === 'written'
              ? configurationOk(domainConfiguration(canonical.canonicalPath))
              : unavailable(),
            () => unavailable()
          );
      },
      () => unavailable()
    );
};

export const createWindowsBrokerHostConfigurationPort = (
  localApplicationData: TrustedLocalApplicationDataPort,
  runtime: BrokerHostConfigurationRuntimePort = createWindowsBrokerHostConfigurationRuntime()
): WindowsBrokerHostConfigurationPort => ({
  read: () => resolveConfigurationPath(localApplicationData).then(path => path.type === 'ok'
    ? readCanonicalConfiguration(path.value, runtime)
    : path),
  initialize: request => resolveConfigurationPath(localApplicationData).then(path => path.type === 'ok'
    ? initializeCanonicalConfiguration(path.value, request, runtime)
    : path)
});
