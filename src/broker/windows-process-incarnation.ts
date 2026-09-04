import { createHash } from 'node:crypto';

import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import { parseProcessIncarnation } from './journal.ts';
import type {
  CurrentProcessIncarnationPort,
  ProcessIncarnationObservation,
  ProcessIncarnationQuery
} from './receiver-attempt-verifier.ts';

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SYNCHRONIZE = 0x0010_0000;
const PROCESS_IDENTITY_ACCESS = PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE;
const WAIT_OBJECT_0 = 0;
const WAIT_TIMEOUT = 0x102;
const ERROR_ACCESS_DENIED = 5;
const ERROR_INVALID_PARAMETER = 87;
const MAXIMUM_FILETIME = 0xffff_ffff_ffff_ffffn;
const MAXIMUM_HANDLE = 0xffff_ffff_ffff_ffffn;

const kernel32Symbols = {
  OpenProcess: {
    args: ['u32', 'bool', 'u32'],
    returns: 'u64'
  },
  GetProcessTimes: {
    args: ['u64', 'ptr', 'ptr', 'ptr', 'ptr'],
    returns: 'bool'
  },
  WaitForSingleObject: {
    args: ['u64', 'u32'],
    returns: 'u32'
  },
  GetLastError: {
    args: [],
    returns: 'u32'
  },
  CloseHandle: {
    args: ['u64'],
    returns: 'bool'
  }
} as const;

export type WindowsOpenedProcessInspection =
  | Readonly<{ status: 'running'; creationFileTime: bigint }>
  | Readonly<{ status: 'stopped' }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsOpenedProcess = Readonly<{
  inspect: () => Promise<WindowsOpenedProcessInspection>;
  /** Closes both the process handle and its native-library lifetime. */
  close: () => Promise<boolean>;
}>;

export type WindowsNativeProcessOpenObservation =
  | Readonly<{ status: 'opened'; process: WindowsOpenedProcess }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'inaccessible' }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsProcessNativePort = Readonly<{
  openProcess: (processId: number) => Promise<WindowsNativeProcessOpenObservation>;
}>;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr'>>;
type Kernel32Library = Readonly<Library<typeof kernel32Symbols>>;
type NativeHandle = bigint;

const processIdIsValid = (processId: number): boolean =>
  Number.isSafeInteger(processId) && processId > 0 && processId <= 0xffff_ffff;

const unavailable = (processId: number): ProcessIncarnationObservation => ({
  status: 'unavailable',
  processId
});

const closeLibrary = (library: Readonly<{ close: () => void }>): Promise<boolean> =>
  Promise.resolve().then(() => library.close()).then(
    () => true,
    () => false
  );

const closeHandleAndLibrary = (
  library: Kernel32Library,
  handle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.CloseHandle(handle)).then(
  handleClosed => closeLibrary(library).then(libraryClosed => handleClosed && libraryClosed),
  () => closeLibrary(library).then(() => false)
);

const combineFileTime = (words: Uint32Array): bigint =>
  (BigInt(words.at(1) ?? 0) << 32n) | BigInt(words.at(0) ?? 0);

const runningInspection = (creationFileTime: bigint): WindowsOpenedProcessInspection => ({
  status: 'running',
  creationFileTime
});
const stoppedInspection = (): WindowsOpenedProcessInspection => ({ status: 'stopped' });
const unavailableInspection = (): WindowsOpenedProcessInspection => ({ status: 'unavailable' });

const inspectOpenedProcess = (
  ffi: BunFfiModule,
  library: Kernel32Library,
  handle: NativeHandle
): Promise<WindowsOpenedProcessInspection> => Promise.resolve().then(() => {
  const creation = new Uint32Array(2);
  const exit = new Uint32Array(2);
  const kernel = new Uint32Array(2);
  const user = new Uint32Array(2);
  const hasTimes = library.symbols.GetProcessTimes(
    handle,
    ffi.ptr(creation),
    ffi.ptr(exit),
    ffi.ptr(kernel),
    ffi.ptr(user)
  );
  if (!hasTimes) return unavailableInspection();
  const waitStatus = library.symbols.WaitForSingleObject(handle, 0);
  if (waitStatus === WAIT_OBJECT_0) return stoppedInspection();
  const creationFileTime = combineFileTime(creation);
  return waitStatus === WAIT_TIMEOUT && creationFileTime > 0n && creationFileTime <= MAXIMUM_FILETIME
    ? runningInspection(creationFileTime)
    : unavailableInspection();
}).then(
  inspection => inspection,
  unavailableInspection
);

const openedProcess = (
  ffi: BunFfiModule,
  library: Kernel32Library,
  handle: NativeHandle
): WindowsNativeProcessOpenObservation => ({
  status: 'opened',
  process: {
    inspect: () => inspectOpenedProcess(ffi, library, handle),
    close: () => closeHandleAndLibrary(library, handle)
  }
});

const normalizeNativeHandle = (handle: unknown): NativeHandle | null =>
  typeof handle === 'bigint' && handle > 0n && handle <= MAXIMUM_HANDLE
    ? handle
    : typeof handle === 'number' && Number.isSafeInteger(handle) && handle > 0
      ? BigInt(handle)
      : null;

const openFailure = (errorCode: number): Exclude<WindowsNativeProcessOpenObservation, { status: 'opened' }> => {
  switch (errorCode) {
    case ERROR_ACCESS_DENIED:
      return { status: 'inaccessible' };
    case ERROR_INVALID_PARAMETER:
      return { status: 'missing' };
    default:
      return { status: 'unavailable' };
  }
};

const closeLibraryThen = (
  library: Kernel32Library,
  observation: Exclude<WindowsNativeProcessOpenObservation, { status: 'opened' }>
): Promise<WindowsNativeProcessOpenObservation> => closeLibrary(library).then(
  closed => closed ? observation : { status: 'unavailable' }
);

const openWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32Library,
  processId: number
): Promise<WindowsNativeProcessOpenObservation> => Promise.resolve().then(() => normalizeNativeHandle(
  library.symbols.OpenProcess(PROCESS_IDENTITY_ACCESS, false, processId)
)).then(
  handle => handle !== null
    ? openedProcess(ffi, library, handle)
    : Promise.resolve().then(() => library.symbols.GetLastError()).then(
        errorCode => closeLibraryThen(library, openFailure(errorCode)),
        () => closeLibraryThen(library, { status: 'unavailable' })
      ),
  () => closeLibraryThen(library, { status: 'unavailable' })
);

const openKernel32 = (ffi: BunFfiModule): Kernel32Library => ffi.dlopen('kernel32.dll', kernel32Symbols);

const openNativeProcess = (processId: number): Promise<WindowsNativeProcessOpenObservation> =>
  Promise.resolve().then(() => import(/* @vite-ignore */ 'bun:ffi')).then(
    (ffi: BunFfiModule) => Promise.resolve().then(
      () => openKernel32(ffi)
    ).then(
      library => openWithLibrary(ffi, library, processId),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

export const createBunWindowsProcessNativePort = (): WindowsProcessNativePort => ({
  openProcess: openNativeProcess
});

const opaqueIncarnation = (
  processId: number,
  creationFileTime: bigint
): ProcessIncarnationObservation => {
  const digest = createHash('sha256')
    .update(`windows-process-incarnation/v1\0${processId}\0${creationFileTime.toString(10)}`)
    .digest('hex');
  const incarnation = parseProcessIncarnation(`windows-process-incarnation-v1-${digest}`);
  return incarnation.type === 'ok'
    ? { status: 'running', processId, incarnation: incarnation.value }
    : unavailable(processId);
};

const projectInspection = (
  processId: number,
  inspection: WindowsOpenedProcessInspection
): ProcessIncarnationObservation => {
  switch (inspection.status) {
    case 'running':
      return inspection.creationFileTime > 0n && inspection.creationFileTime <= MAXIMUM_FILETIME
        ? opaqueIncarnation(processId, inspection.creationFileTime)
        : unavailable(processId);
    case 'stopped':
      return { status: 'stopped', processId };
    case 'unavailable':
      return unavailable(processId);
  }
};

const inspectAndClose = (
  processId: number,
  opened: WindowsOpenedProcess
): Promise<ProcessIncarnationObservation> => Promise.resolve().then(() => opened.inspect()).then(
  inspection => Promise.resolve().then(() => opened.close()).then(
    closed => closed ? projectInspection(processId, inspection) : unavailable(processId),
    () => unavailable(processId)
  ),
  () => Promise.resolve().then(() => opened.close()).then(
    () => unavailable(processId),
    () => unavailable(processId)
  )
);

const projectOpenObservation = (
  processId: number,
  observation: WindowsNativeProcessOpenObservation
): Promise<ProcessIncarnationObservation> => {
  switch (observation.status) {
    case 'opened':
      return inspectAndClose(processId, observation.process);
    case 'missing':
      return Promise.resolve({ status: 'missing', processId });
    case 'inaccessible':
      return Promise.resolve({ status: 'inaccessible', processId });
    case 'unavailable':
      return Promise.resolve(unavailable(processId));
  }
};

export const readWindowsProcessIncarnation = (
  query: ProcessIncarnationQuery,
  runtime: WindowsProcessNativePort,
  platform: string
): Promise<ProcessIncarnationObservation> => {
  if (platform !== 'win32' || !processIdIsValid(query.processId)) {
    return Promise.resolve(unavailable(query.processId));
  }
  return Promise.resolve().then(() => runtime.openProcess(query.processId)).then(
    observation => projectOpenObservation(query.processId, observation),
    () => unavailable(query.processId)
  ).then(
    observation => observation,
    () => unavailable(query.processId)
  );
};

export const createWindowsProcessIncarnationPort = (
  runtime: WindowsProcessNativePort = createBunWindowsProcessNativePort(),
  platform: string = process.platform
): CurrentProcessIncarnationPort => ({
  readCurrentIncarnation: query => readWindowsProcessIncarnation(query, runtime, platform)
});
