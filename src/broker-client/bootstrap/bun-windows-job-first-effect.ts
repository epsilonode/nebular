import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import {
  createManagedWindowsJobFirstEffectGate,
  type ManagedWindowsJobActiveProcessObservation,
  type ManagedWindowsJobBooleanObservation,
  type ManagedWindowsJobEnvironmentPort,
  type ManagedWindowsJobFirstEffectGatePort,
  type ManagedWindowsJobIdentity,
  type ManagedWindowsJobNativeAction,
  type ManagedWindowsJobNativeOpenOutcome,
  type ManagedWindowsJobNativePort,
  type ManagedWindowsJobPolicyObservation
} from './windows-job-first-effect.ts';

const JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1;
const JOB_OBJECT_BASIC_UI_RESTRICTIONS = 4;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x0000_2000;
const BASIC_ACCOUNTING_INFORMATION_BYTES = 48;
const BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET = 40;
const BASIC_UI_RESTRICTIONS_BYTES = 4;
const EXTENDED_LIMIT_INFORMATION_BYTES_64 = 144;
const EXTENDED_LIMIT_FLAGS_OFFSET_64 = 16;
const ERROR_ALREADY_EXISTS = 183;
const HANDLE_FLAG_INHERIT = 0x0000_0001;
const MAXIMUM_HANDLE = 0xffff_ffff_ffff_ffffn;

const kernel32FirstEffectSymbols = {
  SetLastError: {
    args: ['u32'],
    returns: 'void'
  },
  GetLastError: {
    args: [],
    returns: 'u32'
  },
  CreateJobObjectW: {
    args: ['ptr', 'ptr'],
    returns: 'u64'
  },
  GetCurrentProcess: {
    args: [],
    returns: 'u64'
  },
  GetCurrentProcessId: {
    args: [],
    returns: 'u32'
  },
  QueryInformationJobObject: {
    args: ['u64', 'i32', 'ptr', 'u32', 'ptr'],
    returns: 'bool'
  },
  SetInformationJobObject: {
    args: ['u64', 'i32', 'ptr', 'u32'],
    returns: 'bool'
  },
  SetHandleInformation: {
    args: ['u64', 'u32', 'u32'],
    returns: 'bool'
  },
  IsProcessInJob: {
    args: ['u64', 'u64', 'ptr'],
    returns: 'bool'
  },
  AssignProcessToJobObject: {
    args: ['u64', 'u64'],
    returns: 'bool'
  },
  CloseHandle: {
    args: ['u64'],
    returns: 'bool'
  }
} as const;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr'>>;
type Kernel32FirstEffectLibrary = Readonly<Library<typeof kernel32FirstEffectSymbols>>;
type NativeHandle = bigint;

type OpenedCurrentProcess = Readonly<{
  jobHandle: NativeHandle | null;
  currentProcessHandle: NativeHandle | null;
  processId: number;
  createStatus: number;
  inheritanceDisabled: boolean;
}>;

const unavailablePolicy = (): ManagedWindowsJobPolicyObservation => ({ status: 'unavailable' });
const compatiblePolicy = (): ManagedWindowsJobPolicyObservation => ({ status: 'compatible' });
const incompatiblePolicy = (): ManagedWindowsJobPolicyObservation => ({ status: 'incompatible' });
const unavailableActive = (): ManagedWindowsJobActiveProcessObservation => ({ status: 'unavailable' });
const observedActive = (activeProcesses: number): ManagedWindowsJobActiveProcessObservation => ({
  status: 'observed',
  activeProcesses
});
const unavailableBoolean = (): ManagedWindowsJobBooleanObservation => ({ status: 'unavailable' });
const observedBoolean = (value: boolean): ManagedWindowsJobBooleanObservation => ({
  status: 'observed',
  value
});

const normalizeHandle = (handle: unknown): NativeHandle | null =>
  typeof handle === 'bigint' && handle > 0n && handle <= MAXIMUM_HANDLE
    ? handle
    : typeof handle === 'number' && Number.isSafeInteger(handle) && handle > 0
      ? BigInt(handle)
      : null;

const processIdIsValid = (processId: number): boolean =>
  Number.isSafeInteger(processId) && processId > 0 && processId <= 0xffff_ffff;

const identityIsValid = (job: ManagedWindowsJobIdentity): boolean =>
  /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(job.value);

const encodeWideAscii = (value: string): Uint16Array => Uint16Array.from([
  ...Array.from(value, character => character.charCodeAt(0)),
  0
]);

const closeLibrary = (library: Readonly<{ close: () => void }>): Promise<boolean> =>
  Promise.resolve().then(() => library.close()).then(
    () => true,
    () => false
  );

const closeJobAndLibrary = (
  library: Kernel32FirstEffectLibrary,
  jobHandle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.CloseHandle(jobHandle)).then(
  handleClosed => closeLibrary(library).then(libraryClosed => handleClosed && libraryClosed),
  () => closeLibrary(library).then(() => false)
);

const queryPolicy = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  jobHandle: NativeHandle
): Promise<ManagedWindowsJobPolicyObservation> => Promise.resolve().then(() => {
  const limits = new BigUint64Array(EXTENDED_LIMIT_INFORMATION_BYTES_64 / 8);
  const uiRestrictions = new Uint32Array(BASIC_UI_RESTRICTIONS_BYTES / 4);
  const queriedLimits = library.symbols.QueryInformationJobObject(
    jobHandle,
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
    ffi.ptr(limits),
    EXTENDED_LIMIT_INFORMATION_BYTES_64,
    null
  );
  const queriedUi = queriedLimits && library.symbols.QueryInformationJobObject(
    jobHandle,
    JOB_OBJECT_BASIC_UI_RESTRICTIONS,
    ffi.ptr(uiRestrictions),
    BASIC_UI_RESTRICTIONS_BYTES,
    null
  );
  if (!queriedLimits || !queriedUi) return unavailablePolicy();
  const view = new DataView(limits.buffer, limits.byteOffset, limits.byteLength);
  const flags = view.getUint32(EXTENDED_LIMIT_FLAGS_OFFSET_64, true);
  return flags === JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE && uiRestrictions[0] === 0
    ? compatiblePolicy()
    : incompatiblePolicy();
}).then(
  observation => observation,
  unavailablePolicy
);

const setExactJobPolicy = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  jobHandle: NativeHandle
): boolean => {
  const limits = new BigUint64Array(EXTENDED_LIMIT_INFORMATION_BYTES_64 / 8);
  const view = new DataView(limits.buffer, limits.byteOffset, limits.byteLength);
  view.setUint32(
    EXTENDED_LIMIT_FLAGS_OFFSET_64,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    true
  );
  return library.symbols.SetInformationJobObject(
    jobHandle,
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
    ffi.ptr(limits),
    EXTENDED_LIMIT_INFORMATION_BYTES_64
  );
};

const queryActiveProcesses = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  jobHandle: NativeHandle
): Promise<ManagedWindowsJobActiveProcessObservation> => Promise.resolve().then(() => {
  const accounting = new BigUint64Array(BASIC_ACCOUNTING_INFORMATION_BYTES / 8);
  const queried = library.symbols.QueryInformationJobObject(
    jobHandle,
    JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION,
    ffi.ptr(accounting),
    BASIC_ACCOUNTING_INFORMATION_BYTES,
    null
  );
  if (!queried) return unavailableActive();
  const view = new DataView(accounting.buffer, accounting.byteOffset, accounting.byteLength);
  return observedActive(view.getUint32(BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET, true));
}).then(
  observation => observation,
  unavailableActive
);

const membership = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  processHandle: NativeHandle,
  jobHandle: NativeHandle
): Promise<ManagedWindowsJobBooleanObservation> => Promise.resolve().then(() => {
  const member = new Uint32Array(1);
  return library.symbols.IsProcessInJob(processHandle, jobHandle, ffi.ptr(member))
    ? observedBoolean(member[0] !== 0)
    : unavailableBoolean();
}).then(
  observation => observation,
  unavailableBoolean
);

const action = (effect: () => boolean): Promise<ManagedWindowsJobNativeAction> =>
  Promise.resolve().then(effect).then(
    succeeded => ({ status: succeeded ? 'succeeded' : 'failed' }),
    () => ({ status: 'failed' })
  );

const openedSession = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  opened: OpenedCurrentProcess
): ManagedWindowsJobNativeOpenOutcome => {
  if (opened.jobHandle === null || opened.currentProcessHandle === null ||
      !processIdIsValid(opened.processId)) return { status: 'unavailable' };
  const jobHandle = opened.jobHandle;
  const currentProcessHandle = opened.currentProcessHandle;
  return {
    status: 'opened',
    processId: opened.processId,
    session: {
      queryPolicy: () => queryPolicy(ffi, library, jobHandle),
      queryActiveProcesses: () => queryActiveProcesses(ffi, library, jobHandle),
      isCurrentProcessInAnyJob: () => membership(ffi, library, currentProcessHandle, 0n),
      isCurrentProcessInThisJob: () => membership(ffi, library, currentProcessHandle, jobHandle),
      assignCurrentProcess: () => action(() => library.symbols.AssignProcessToJobObject(
        jobHandle,
        currentProcessHandle
      )),
      close: () => closeJobAndLibrary(library, jobHandle)
    }
  };
};

const openWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32FirstEffectLibrary,
  job: ManagedWindowsJobIdentity
): Promise<ManagedWindowsJobNativeOpenOutcome> => Promise.resolve().then((): OpenedCurrentProcess => {
  const encodedName = encodeWideAscii(job.value);
  library.symbols.SetLastError(0);
  const jobHandle = normalizeHandle(library.symbols.CreateJobObjectW(null, ffi.ptr(encodedName)));
  const createStatus = library.symbols.GetLastError();
  return {
    jobHandle,
    currentProcessHandle: normalizeHandle(library.symbols.GetCurrentProcess()),
    processId: library.symbols.GetCurrentProcessId(),
    createStatus,
    inheritanceDisabled: jobHandle !== null && library.symbols.SetHandleInformation(
      jobHandle,
      HANDLE_FLAG_INHERIT,
      0
    )
  };
}).then(
  opened => opened.jobHandle !== null && opened.currentProcessHandle !== null &&
    opened.inheritanceDisabled &&
    (opened.createStatus === 0 || opened.createStatus === ERROR_ALREADY_EXISTS) &&
    processIdIsValid(opened.processId)
    ? opened.createStatus === ERROR_ALREADY_EXISTS ||
      setExactJobPolicy(ffi, library, opened.jobHandle)
      ? openedSession(ffi, library, opened)
      : closeJobAndLibrary(library, opened.jobHandle)
        .then(() => ({ status: 'unavailable' }))
    : opened.jobHandle === null
      ? closeLibrary(library).then(() => ({ status: 'unavailable' }))
      : closeJobAndLibrary(library, opened.jobHandle).then(() => ({ status: 'unavailable' })),
  () => closeLibrary(library).then(() => ({ status: 'unavailable' }))
);

const openKernel32 = (ffi: BunFfiModule): Kernel32FirstEffectLibrary =>
  ffi.dlopen('kernel32.dll', kernel32FirstEffectSymbols);

const openNative = (job: ManagedWindowsJobIdentity): Promise<ManagedWindowsJobNativeOpenOutcome> =>
  Promise.resolve().then(() => import(/* @vite-ignore */ 'bun:ffi')).then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => openWithLibrary(ffi, library, job),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

export const createBunManagedWindowsJobNativePort = (
  platform: string = process.platform,
  architecture: string = process.arch
): ManagedWindowsJobNativePort => ({
  openCurrentProcess: job => platform === 'win32' &&
    (architecture === 'x64' || architecture === 'arm64') && identityIsValid(job)
    ? openNative(job)
    : Promise.resolve({ status: 'unavailable' })
});

export const createBunManagedWindowsJobFirstEffectGate = (
  environment: ManagedWindowsJobEnvironmentPort = { read: name => process.env[name] },
  native: ManagedWindowsJobNativePort = createBunManagedWindowsJobNativePort()
): ManagedWindowsJobFirstEffectGatePort => createManagedWindowsJobFirstEffectGate(environment, native);
