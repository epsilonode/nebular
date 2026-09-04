import { createHash } from 'node:crypto';
import { win32 } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import type { TrustedProfileRoot } from './journal.ts';
import type {
  ExactNameOneShotPorts,
  OneShotReceiverIssue,
  OneShotReceiverPortIssue
} from './one-shot-receiver.ts';
import type { OneShotResult } from './one-shot-slots.ts';

export const WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS = 10_000;

const WAIT_OBJECT_0 = 0;
const WAIT_ABANDONED = 0x80;
const WAIT_TIMEOUT = 0x102;
const MUTEX_NAME_PREFIX = 'Local\\epsilonode.nebular.one-shot.v1.';
const MAXIMUM_HANDLE = 0xffff_ffff_ffff_ffffn;

const kernel32MutexSymbols = {
  CreateMutexW: {
    args: ['ptr', 'bool', 'ptr'],
    returns: 'u64'
  },
  WaitForSingleObject: {
    args: ['u64', 'u32'],
    returns: 'u32'
  },
  ReleaseMutex: {
    args: ['u64'],
    returns: 'bool'
  },
  CloseHandle: {
    args: ['u64'],
    returns: 'bool'
  }
} as const;

export type WindowsNamedMutexAllocationConfig = Readonly<{
  namespace: string;
  trustedProfileRoot: TrustedProfileRoot;
  timeoutMs: number;
}>;

export type WindowsNamedMutexLease = Readonly<{
  /** Single-use capability. Release is executed on the acquiring Bun JS thread. */
  release: () => Promise<boolean>;
}>;

export type WindowsNamedMutexAcquisition =
  | Readonly<{
      status: 'acquired';
      disposition: 'ordinary' | 'abandoned';
      lease: WindowsNamedMutexLease;
    }>
  | Readonly<{ status: 'timeout' | 'unavailable' }>;

export type WindowsNamedMutexNativePort = Readonly<{
  acquire: (name: string, timeoutMs: number) => Promise<WindowsNamedMutexAcquisition>;
}>;

export type WindowsNamedMutexAllocationPort<Payload> = Readonly<{
  withAllocationLock: ExactNameOneShotPorts<Payload>['withAllocationLock'];
}>;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr'>>;
type Kernel32MutexLibrary = Readonly<Library<typeof kernel32MutexSymbols>>;
type NativeHandle = bigint;

/*
 * Win32 mutexes are recursive for one OS thread. Bun multiplexes async broker
 * requests onto one JS thread, so the kernel object alone does not serialize
 * callers in one process. This module-level tail is the smallest stateful leaf
 * that preserves local FIFO admission before taking the cross-process mutex.
 * It is keyed by the opaque per-user/session mutex name so independently
 * constructed adapters in this module share the same local exclusion domain.
 */
const localAllocationTails = new Map<string, Promise<void>>();

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({
  outcome: 'success',
  value
});

const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const lockFailure = (): OneShotResult<never, OneShotReceiverPortIssue> => failure({
  code: 'allocation-lock-unavailable',
  operation: 'lock',
  safeMessage: 'The bounded Windows allocation lock failed closed.'
});

const namespaceIsValid = (namespace: string): boolean =>
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(namespace);

const profileRootIsValid = (profile: TrustedProfileRoot): boolean => {
  const normalized = win32.normalize(profile.value);
  return /^[A-Za-z]:\\/u.test(normalized) && !normalized.startsWith('\\\\') &&
    !normalized.includes('\0') && normalized.length <= 32_767;
};

const configIsValid = (config: WindowsNamedMutexAllocationConfig): boolean =>
  namespaceIsValid(config.namespace) && profileRootIsValid(config.trustedProfileRoot) &&
  Number.isSafeInteger(config.timeoutMs) && config.timeoutMs > 0 &&
  config.timeoutMs <= WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS;

export const deriveWindowsNamedMutexName = (
  config: WindowsNamedMutexAllocationConfig
): OneShotResult<string, OneShotReceiverPortIssue> => {
  if (!configIsValid(config)) return lockFailure();
  const normalizedUserScope = win32.normalize(config.trustedProfileRoot.value).toLowerCase();
  const digest = createHash('sha256').update(JSON.stringify([
    'epsilonode/nebular/windows-named-mutex-allocation/v1',
    normalizedUserScope,
    config.namespace
  ])).digest('hex');
  return success(`${MUTEX_NAME_PREFIX}${digest}`);
};

const normalizeNativeHandle = (handle: unknown): NativeHandle | null =>
  typeof handle === 'bigint' && handle > 0n && handle <= MAXIMUM_HANDLE
    ? handle
    : typeof handle === 'number' && Number.isSafeInteger(handle) && handle > 0
      ? BigInt(handle)
      : null;

const encodeWideAscii = (value: string): Uint16Array => Uint16Array.from([
  ...Array.from(value, character => character.charCodeAt(0)),
  0
]);

const closeLibrary = (library: Readonly<{ close: () => void }>): Promise<boolean> =>
  Promise.resolve().then(() => library.close()).then(
    () => true,
    () => false
  );

const closeHandleAndLibrary = (
  library: Kernel32MutexLibrary,
  handle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.CloseHandle(handle)).then(
  handleClosed => closeLibrary(library).then(libraryClosed => handleClosed && libraryClosed),
  () => closeLibrary(library).then(() => false)
);

const releaseHandleAndLibrary = (
  library: Kernel32MutexLibrary,
  handle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.ReleaseMutex(handle)).then(
  released => closeHandleAndLibrary(library, handle).then(closed => released && closed),
  () => closeHandleAndLibrary(library, handle).then(() => false)
);

const acquired = (
  library: Kernel32MutexLibrary,
  handle: NativeHandle,
  disposition: 'ordinary' | 'abandoned'
): WindowsNamedMutexAcquisition => ({
  status: 'acquired',
  disposition,
  lease: { release: () => releaseHandleAndLibrary(library, handle) }
});

const closedOutcome = (
  library: Kernel32MutexLibrary,
  handle: NativeHandle,
  status: 'timeout' | 'unavailable'
): Promise<WindowsNamedMutexAcquisition> => closeHandleAndLibrary(library, handle).then(
  closed => closed ? { status } : { status: 'unavailable' }
);

const waitOnHandle = (
  library: Kernel32MutexLibrary,
  handle: NativeHandle,
  timeoutMs: number
): Promise<WindowsNamedMutexAcquisition> => Promise.resolve().then(
  () => library.symbols.WaitForSingleObject(handle, timeoutMs)
).then(
  wait => {
    if (wait === WAIT_OBJECT_0) return acquired(library, handle, 'ordinary');
    if (wait === WAIT_ABANDONED) return acquired(library, handle, 'abandoned');
    return closedOutcome(library, handle, wait === WAIT_TIMEOUT ? 'timeout' : 'unavailable');
  },
  () => closedOutcome(library, handle, 'unavailable')
);

const acquireWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32MutexLibrary,
  name: string,
  timeoutMs: number
): Promise<WindowsNamedMutexAcquisition> => Promise.resolve().then(() => {
  const encodedName = encodeWideAscii(name);
  return normalizeNativeHandle(library.symbols.CreateMutexW(null, false, ffi.ptr(encodedName)));
}).then(
  handle => handle === null
    ? closeLibrary(library).then(() => ({ status: 'unavailable' }))
    : waitOnHandle(library, handle, timeoutMs),
  () => closeLibrary(library).then(() => ({ status: 'unavailable' }))
);

const openKernel32 = (ffi: BunFfiModule): Kernel32MutexLibrary =>
  ffi.dlopen('kernel32.dll', kernel32MutexSymbols);

const acquireNative = (name: string, timeoutMs: number): Promise<WindowsNamedMutexAcquisition> =>
  Promise.resolve().then(() => import(/* @vite-ignore */ 'bun:ffi')).then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => acquireWithLibrary(ffi, library, name, timeoutMs),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

export const createBunWindowsNamedMutexNativePort = (
  platform: string = process.platform
): WindowsNamedMutexNativePort => ({
  acquire: (name, timeoutMs) => platform === 'win32' && name.startsWith(MUTEX_NAME_PREFIX) &&
    /^[\x20-\x7e]+$/u.test(name) && Number.isSafeInteger(timeoutMs) && timeoutMs > 0 &&
    timeoutMs <= WINDOWS_NAMED_MUTEX_MAX_TIMEOUT_MS
    ? acquireNative(name, timeoutMs)
    : Promise.resolve({ status: 'unavailable' })
});

const releaseAfterWork = <Value>(
  lease: WindowsNamedMutexLease,
  work: () => Promise<OneShotResult<Value, OneShotReceiverIssue>>
): Promise<OneShotResult<Value, OneShotReceiverIssue>> => Promise.resolve().then(work).then(
  result => Promise.resolve().then(() => lease.release()).then(
    released => released ? result : lockFailure(),
    lockFailure
  ),
  () => Promise.resolve().then(() => lease.release()).then(
    lockFailure,
    lockFailure
  )
);

const acquireAndRun = <Value>(
  native: WindowsNamedMutexNativePort,
  name: string,
  deadlineAtMs: number,
  work: () => Promise<OneShotResult<Value, OneShotReceiverIssue>>
): Promise<OneShotResult<Value, OneShotReceiverIssue>> => {
  const remainingMs = Math.floor(deadlineAtMs - Date.now());
  if (remainingMs <= 0) return Promise.resolve(lockFailure());
  return Promise.resolve().then(() => native.acquire(name, remainingMs)).then(
    acquisition => acquisition.status === 'acquired'
      ? releaseAfterWork(acquisition.lease, work)
      : lockFailure(),
    lockFailure
  );
};

const settled = (task: Promise<unknown>): Promise<void> => task.then(
  () => undefined,
  () => undefined
);

type LocalAdmission =
  | Readonly<{ status: 'admitted' }>
  | Readonly<{ status: 'timeout' }>;

const serializeLocally = <Value>(
  name: string,
  timeoutMs: number,
  work: (deadlineAtMs: number) => Promise<OneShotResult<Value, OneShotReceiverIssue>>
): Promise<OneShotResult<Value, OneShotReceiverIssue>> => {
  const previous = localAllocationTails.get(name) ?? Promise.resolve();
  const deadlineAtMs = Date.now() + timeoutMs;
  const admission = Promise.race([
    settled(previous).then(() => ({ status: 'admitted' as const })),
    delay(timeoutMs, undefined, { ref: false }).then(() => ({ status: 'timeout' as const }))
  ]);
  const operation = admission.then((outcome: LocalAdmission) => outcome.status === 'admitted'
    ? work(deadlineAtMs)
    : lockFailure());
  localAllocationTails.set(name, Promise.all([settled(previous), settled(operation)]).then(() => undefined));
  return operation;
};

export const createWindowsNamedMutexAllocationPort = <Payload>(
  config: WindowsNamedMutexAllocationConfig,
  native: WindowsNamedMutexNativePort = createBunWindowsNamedMutexNativePort()
): WindowsNamedMutexAllocationPort<Payload> => ({
  withAllocationLock: (namespace, work) => {
    const name = namespace === config.namespace ? deriveWindowsNamedMutexName(config) : lockFailure();
    return name.outcome === 'failure'
      ? Promise.resolve(name)
      : serializeLocally(name.value, config.timeoutMs, deadlineAtMs =>
        acquireAndRun(native, name.value, deadlineAtMs, work));
  }
});
