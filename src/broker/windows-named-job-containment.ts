import { createHash } from 'node:crypto';
import { win32 } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import {
  parseProcessIncarnation,
  type ProcessIncarnation,
  type TrustedProfileRoot
} from './journal.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { brokerErr, brokerOk, type BrokerIssue, type BrokerResult } from './result.ts';

export const WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_ATTEMPTS = 40;
export const WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_ATTEMPTS = 100;
export const WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_INTERVAL_MS = 25;
export const WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_INTERVAL_MS = 100;

const JOB_NAME_PREFIX = 'Local\\epsilonode.nebular.job.v1.';
const JOB_OBJECT_QUERY = 0x0004;
const JOB_OBJECT_TERMINATE = 0x0008;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SYNCHRONIZE = 0x0010_0000;
const PROCESS_IDENTITY_ACCESS = PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE;
const JOB_VERIFICATION_ACCESS = JOB_OBJECT_QUERY;
const JOB_TERMINATION_ACCESS = JOB_OBJECT_QUERY | JOB_OBJECT_TERMINATE;
const JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1;
const JOB_OBJECT_BASIC_PROCESS_ID_LIST = 3;
const JOB_OBJECT_BASIC_UI_RESTRICTIONS = 4;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x0000_2000;
const BASIC_ACCOUNTING_INFORMATION_BYTES = 48;
const BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET = 40;
const BASIC_PROCESS_ID_LIST_HEADER_BYTES = 8;
const BASIC_PROCESS_ID_LIST_MAXIMUM_PROCESSES = 8;
const BASIC_PROCESS_ID_LIST_BYTES = BASIC_PROCESS_ID_LIST_HEADER_BYTES +
  (BASIC_PROCESS_ID_LIST_MAXIMUM_PROCESSES * 8);
const BASIC_UI_RESTRICTIONS_BYTES = 4;
const EXTENDED_LIMIT_INFORMATION_BYTES_64 = 144;
const EXTENDED_LIMIT_FLAGS_OFFSET_64 = 16;
const WAIT_OBJECT_0 = 0;
const WAIT_TIMEOUT = 0x102;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_ACCESS_DENIED = 5;
const ERROR_INVALID_PARAMETER = 87;
const TERMINATION_EXIT_CODE = 1;
const MAXIMUM_FILETIME = 0xffff_ffff_ffff_ffffn;
const MAXIMUM_HANDLE = 0xffff_ffff_ffff_ffffn;

const kernel32JobSymbols = {
  GetLastError: {
    args: [],
    returns: 'u32'
  },
  OpenJobObjectW: {
    args: ['u32', 'bool', 'ptr'],
    returns: 'u64'
  },
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
  QueryInformationJobObject: {
    args: ['u64', 'i32', 'ptr', 'u32', 'ptr'],
    returns: 'bool'
  },
  IsProcessInJob: {
    args: ['u64', 'u64', 'ptr'],
    returns: 'bool'
  },
  TerminateJobObject: {
    args: ['u64', 'u32'],
    returns: 'bool'
  },
  CloseHandle: {
    args: ['u64'],
    returns: 'bool'
  }
} as const;

export type WindowsNamedJobIdentity = Readonly<{
  kind: 'windows-named-job-identity';
  value: string;
}>;

export type WindowsNamedJobContainmentConfig = Readonly<{
  trustedProfileRoot: TrustedProfileRoot;
  namespace: string;
  terminationPollAttempts?: number;
  terminationPollIntervalMs?: number;
}>;

export type WindowsNamedJobAttemptIdentity = Readonly<{
  attemptId: ProcessAttemptId;
  attemptDigest: string;
}>;

export type WindowsNamedJobVerificationRequest = WindowsNamedJobAttemptIdentity & Readonly<{
  processId: number;
  processIncarnation: ProcessIncarnation;
}>;

export type WindowsNamedJobTerminationRequest = WindowsNamedJobAttemptIdentity;

export type WindowsNamedJobTerminationReceipt = Readonly<{
  state: 'terminated-empty' | 'already-empty';
  job: WindowsNamedJobIdentity;
  activeProcesses: 0;
}>;

export type WindowsNamedJobTerminationObservation =
  | Readonly<{ status: 'proved-empty'; receipt: WindowsNamedJobTerminationReceipt }>
  | Readonly<{ status: 'missing'; job: WindowsNamedJobIdentity }>
  | Readonly<{
      status: 'ambiguous';
      reason: 'cleanup-unconfirmed' | 'policy-conflict' | 'unavailable';
    }>;

export type WindowsNamedJobVerificationReceipt = Readonly<{
  state: 'verified-contained';
  job: WindowsNamedJobIdentity;
  processId: number;
  processIncarnation: ProcessIncarnation;
}>;

export type WindowsNamedJobBootstrapRootObservation =
  | Readonly<{
      status: 'pending';
      reason: 'job-name-missing' | 'job-empty';
      job: WindowsNamedJobIdentity;
    }>
  | Readonly<{ status: 'ready'; job: WindowsNamedJobIdentity; processId: number }>
  | Readonly<{
      status: 'ambiguous';
      reason: 'multiple-processes' | 'policy-conflict' | 'unavailable';
    }>;

export type WindowsNamedJobContainmentPort = Readonly<{
  observeBootstrapRoot: (
    request: WindowsNamedJobAttemptIdentity
  ) => Promise<WindowsNamedJobBootstrapRootObservation>;
  verifyExactProcess: (
    request: WindowsNamedJobVerificationRequest
  ) => Promise<BrokerResult<WindowsNamedJobVerificationReceipt>>;
  terminateAndProveEmpty: (
    request: WindowsNamedJobTerminationRequest
  ) => Promise<BrokerResult<WindowsNamedJobTerminationReceipt>>;
}>;

export type WindowsNamedJobTerminalObservationPort = Readonly<{
  /**
   * Preserves a missing-name observation for the durable terminal-cleanup
   * composer. Missing is not proof here; only that composer may combine it
   * with a prior exact membership binding and exact root-incarnation exit.
   */
  terminateAndObserve: (
    request: WindowsNamedJobTerminationRequest
  ) => Promise<WindowsNamedJobTerminationObservation>;
}>;

export type WindowsNamedJobContainmentCapabilities =
  WindowsNamedJobContainmentPort & WindowsNamedJobTerminalObservationPort;

export type WindowsNamedJobProcessInspection =
  | Readonly<{ status: 'running'; creationFileTime: bigint }>
  | Readonly<{ status: 'stopped' | 'unavailable' }>;

export type WindowsNamedJobPolicyObservation =
  | Readonly<{ status: 'compatible' }>
  | Readonly<{ status: 'incompatible' | 'unavailable' }>;

export type WindowsNamedJobBooleanObservation =
  | Readonly<{ status: 'observed'; value: boolean }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsNamedJobActiveProcessObservation =
  | Readonly<{ status: 'observed'; activeProcesses: number }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsNamedJobProcessIdsObservation =
  | Readonly<{ status: 'observed'; processIds: readonly number[] }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsNamedJobNativeAction = Readonly<{
  status: 'succeeded' | 'failed';
}>;

export type WindowsNamedJobTerminationSession = Readonly<{
  queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
  queryActiveProcesses: () => Promise<WindowsNamedJobActiveProcessObservation>;
  terminate: (exitCode: number) => Promise<WindowsNamedJobNativeAction>;
  close: () => Promise<boolean>;
}>;

export type WindowsNamedJobObservationSession = Readonly<{
  queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
  queryProcessIds: () => Promise<WindowsNamedJobProcessIdsObservation>;
  close: () => Promise<boolean>;
}>;

export type WindowsNamedJobVerificationSession = Readonly<{
  inspectProcess: () => Promise<WindowsNamedJobProcessInspection>;
  queryPolicy: () => Promise<WindowsNamedJobPolicyObservation>;
  queryActiveProcesses: () => Promise<WindowsNamedJobActiveProcessObservation>;
  isProcessInThisJob: () => Promise<WindowsNamedJobBooleanObservation>;
  close: () => Promise<boolean>;
}>;

export type WindowsNamedJobTerminationOpenOutcome =
  | Readonly<{ status: 'opened'; session: WindowsNamedJobTerminationSession }>
  | Readonly<{ status: 'missing' | 'unavailable' }>;

export type WindowsNamedJobObservationOpenOutcome =
  | Readonly<{ status: 'opened'; session: WindowsNamedJobObservationSession }>
  | Readonly<{ status: 'missing' | 'unavailable' }>;

export type WindowsNamedJobVerificationOpenOutcome =
  | Readonly<{ status: 'opened'; session: WindowsNamedJobVerificationSession }>
  | Readonly<{
      status: 'job-missing' | 'process-missing' | 'process-inaccessible' | 'unavailable';
    }>;

export type WindowsNamedJobNativePort = Readonly<{
  openObservation: (
    name: WindowsNamedJobIdentity
  ) => Promise<WindowsNamedJobObservationOpenOutcome>;
  openTermination: (
    name: WindowsNamedJobIdentity
  ) => Promise<WindowsNamedJobTerminationOpenOutcome>;
  openVerification: (
    name: WindowsNamedJobIdentity,
    processId: number
  ) => Promise<WindowsNamedJobVerificationOpenOutcome>;
  delay: (milliseconds: number) => Promise<void>;
}>;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr'>>;
type Kernel32JobLibrary = Readonly<Library<typeof kernel32JobSymbols>>;
type NativeHandle = bigint;

type ValidWindowsNamedJobContainmentConfig = Readonly<{
  trustedProfileRoot: TrustedProfileRoot;
  namespace: string;
  terminationPollAttempts: number;
  terminationPollIntervalMs: number;
}>;

type NativeTerminationOpen = Readonly<{
  jobHandle: NativeHandle | null;
  errorCode: number;
}>;

type NativeProcessOpen = Readonly<{
  processHandle: NativeHandle | null;
  errorCode: number;
}>;

const issue = (
  code: BrokerIssue['code'],
  message: string
): BrokerIssue => ({ code, message });

const configurationFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'process-plan-invalid',
  'Windows named-job containment configuration is invalid.'
));

const unavailableFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'receiver-unavailable',
  'Windows named-job containment is unavailable.'
));

const processDriftFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'process-state-invalid',
  'The observed Windows process incarnation is no longer current.'
));

const conflictFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'receiver-conflict',
  'The Windows process or named job has incompatible containment authority.'
));

const verificationFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'receiver-failed',
  'The exact Windows process could not be verified in the retained named job.'
));

const cleanupFailure = <Value>(): BrokerResult<Value> => brokerErr(issue(
  'cleanup-partial',
  'The Windows named job could not prove complete process-tree cleanup.'
));

const namespaceIsValid = (namespace: string): boolean =>
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(namespace);

const profileRootIsValid = (profile: TrustedProfileRoot): boolean => {
  const normalized = win32.normalize(profile.value);
  return profile.value === normalized &&
    /^[A-Za-z]:\\/u.test(normalized) && !normalized.startsWith('\\\\') &&
    !normalized.includes('\0') && normalized.length <= 32_767;
};

const attemptIdentityIsValid = (identity: WindowsNamedJobAttemptIdentity): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(identity.attemptId) &&
  /^[a-f0-9]{64}$/u.test(identity.attemptDigest);

const positiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const validateConfig = (
  config: WindowsNamedJobContainmentConfig
): BrokerResult<ValidWindowsNamedJobContainmentConfig> => {
  const terminationPollAttempts = config.terminationPollAttempts ??
    WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_ATTEMPTS;
  const terminationPollIntervalMs = config.terminationPollIntervalMs ??
    WINDOWS_NAMED_JOB_DEFAULT_TERMINATION_POLL_INTERVAL_MS;
  return namespaceIsValid(config.namespace) && profileRootIsValid(config.trustedProfileRoot) &&
    positiveBound(terminationPollAttempts, WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_ATTEMPTS) &&
    positiveBound(terminationPollIntervalMs, WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_INTERVAL_MS)
    ? brokerOk({
        trustedProfileRoot: config.trustedProfileRoot,
        namespace: config.namespace,
        terminationPollAttempts,
        terminationPollIntervalMs
      })
    : configurationFailure();
};

export const deriveWindowsNamedJobIdentity = (
  config: Pick<WindowsNamedJobContainmentConfig, 'trustedProfileRoot' | 'namespace'>,
  attempt: WindowsNamedJobAttemptIdentity
): BrokerResult<WindowsNamedJobIdentity> => {
  if (!namespaceIsValid(config.namespace) || !profileRootIsValid(config.trustedProfileRoot) ||
      !attemptIdentityIsValid(attempt)) return configurationFailure();
  const digest = createHash('sha256').update(JSON.stringify([
    'epsilonode/nebular/windows-named-job-containment/v1',
    win32.normalize(config.trustedProfileRoot.value).toLocaleLowerCase('en-US'),
    config.namespace,
    attempt.attemptId,
    attempt.attemptDigest
  ])).digest('hex');
  return brokerOk({ kind: 'windows-named-job-identity', value: `${JOB_NAME_PREFIX}${digest}` });
};

const processIdIsValid = (processId: number): boolean =>
  Number.isSafeInteger(processId) && processId > 0 && processId <= 0xffff_ffff;

const expectedIncarnationIsValid = (incarnation: ProcessIncarnation): boolean =>
  /^windows-process-incarnation-v1-[a-f0-9]{64}$/u.test(incarnation.value);

const normalizeHandle = (handle: unknown): NativeHandle | null =>
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

const closeNativeHandle = (
  library: Kernel32JobLibrary,
  handle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.CloseHandle(handle)).then(
  closed => closed,
  () => false
);

const closeHandlesAndLibrary = (
  library: Kernel32JobLibrary,
  handles: readonly NativeHandle[]
): Promise<boolean> => Promise.all(handles.map(handle => closeNativeHandle(library, handle)))
  .then((handleResults: readonly boolean[]) => closeLibrary(library).then(libraryClosed =>
    libraryClosed && handleResults.every(Boolean)));

const unavailablePolicy = (): WindowsNamedJobPolicyObservation => ({ status: 'unavailable' });
const compatiblePolicy = (): WindowsNamedJobPolicyObservation => ({ status: 'compatible' });
const incompatiblePolicy = (): WindowsNamedJobPolicyObservation => ({ status: 'incompatible' });
const unavailableActiveProcesses = (): WindowsNamedJobActiveProcessObservation => ({
  status: 'unavailable'
});
const observedActiveProcesses = (activeProcesses: number): WindowsNamedJobActiveProcessObservation => ({
  status: 'observed',
  activeProcesses
});
const unavailableProcessIds = (): WindowsNamedJobProcessIdsObservation => ({ status: 'unavailable' });
const observedProcessIds = (processIds: readonly number[]): WindowsNamedJobProcessIdsObservation => ({
  status: 'observed',
  processIds
});
const unavailableInspection = (): WindowsNamedJobProcessInspection => ({ status: 'unavailable' });
const stoppedInspection = (): WindowsNamedJobProcessInspection => ({ status: 'stopped' });
const runningInspection = (creationFileTime: bigint): WindowsNamedJobProcessInspection => ({
  status: 'running',
  creationFileTime
});
const unavailableBoolean = (): WindowsNamedJobBooleanObservation => ({ status: 'unavailable' });
const observedBoolean = (value: boolean): WindowsNamedJobBooleanObservation => ({
  status: 'observed',
  value
});

const queryJobPolicy = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle
): Promise<WindowsNamedJobPolicyObservation> => Promise.resolve().then(() => {
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
  const limitsView = new DataView(limits.buffer, limits.byteOffset, limits.byteLength);
  const limitFlags = limitsView.getUint32(EXTENDED_LIMIT_FLAGS_OFFSET_64, true);
  return limitFlags === JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE && uiRestrictions[0] === 0
    ? compatiblePolicy()
    : incompatiblePolicy();
}).then(
  observation => observation,
  unavailablePolicy
);

const queryActiveProcesses = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle
): Promise<WindowsNamedJobActiveProcessObservation> => Promise.resolve().then(() => {
  const accounting = new BigUint64Array(BASIC_ACCOUNTING_INFORMATION_BYTES / 8);
  const queried = library.symbols.QueryInformationJobObject(
    jobHandle,
    JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION,
    ffi.ptr(accounting),
    BASIC_ACCOUNTING_INFORMATION_BYTES,
    null
  );
  if (!queried) return unavailableActiveProcesses();
  const view = new DataView(accounting.buffer, accounting.byteOffset, accounting.byteLength);
  return observedActiveProcesses(view.getUint32(BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET, true));
}).then(
  observation => observation,
  unavailableActiveProcesses
);

const queryProcessIds = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle
): Promise<WindowsNamedJobProcessIdsObservation> => Promise.resolve().then(() => {
  const storage = new BigUint64Array(BASIC_PROCESS_ID_LIST_BYTES / 8);
  const queried = library.symbols.QueryInformationJobObject(
    jobHandle,
    JOB_OBJECT_BASIC_PROCESS_ID_LIST,
    ffi.ptr(storage),
    BASIC_PROCESS_ID_LIST_BYTES,
    null
  );
  if (!queried) return unavailableProcessIds();
  const view = new DataView(storage.buffer, storage.byteOffset, storage.byteLength);
  const count = view.getUint32(4, true);
  if (count > BASIC_PROCESS_ID_LIST_MAXIMUM_PROCESSES) return unavailableProcessIds();
  const processIds: readonly number[] = Object.freeze(Array.from(
    { length: count },
    (_unused, index) => Number(view.getBigUint64(BASIC_PROCESS_ID_LIST_HEADER_BYTES + (index * 8), true))
  ));
  return processIds.every(processIdIsValid) && new Set(processIds).size === processIds.length
    ? observedProcessIds(processIds)
    : unavailableProcessIds();
}).then(
  observation => observation,
  unavailableProcessIds
);

const combineFileTime = (low: number, high: number): bigint =>
  (BigInt(high) << 32n) | BigInt(low);

const inspectProcess = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  processHandle: NativeHandle
): Promise<WindowsNamedJobProcessInspection> => Promise.resolve().then(() => {
  const creation = new Uint32Array(2);
  const exit = new Uint32Array(2);
  const kernel = new Uint32Array(2);
  const user = new Uint32Array(2);
  const hasTimes = library.symbols.GetProcessTimes(
    processHandle,
    ffi.ptr(creation),
    ffi.ptr(exit),
    ffi.ptr(kernel),
    ffi.ptr(user)
  );
  if (!hasTimes) return unavailableInspection();
  const wait = library.symbols.WaitForSingleObject(processHandle, 0);
  if (wait === WAIT_OBJECT_0) return stoppedInspection();
  const creationFileTime = combineFileTime(creation.at(0) ?? 0, creation.at(1) ?? 0);
  return wait === WAIT_TIMEOUT && creationFileTime > 0n && creationFileTime <= MAXIMUM_FILETIME
    ? runningInspection(creationFileTime)
    : unavailableInspection();
}).then(
  inspection => inspection,
  unavailableInspection
);

const processMembership = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  processHandle: NativeHandle,
  jobHandle: NativeHandle
): Promise<WindowsNamedJobBooleanObservation> => Promise.resolve().then(() => {
  const membership = new Uint32Array(1);
  return library.symbols.IsProcessInJob(
    processHandle,
    jobHandle,
    ffi.ptr(membership)
  )
    ? observedBoolean(membership[0] !== 0)
    : unavailableBoolean();
}).then(
  observation => observation,
  unavailableBoolean
);

const nativeAction = (effect: () => boolean): Promise<WindowsNamedJobNativeAction> =>
  Promise.resolve().then(effect).then(
    succeeded => ({ status: succeeded ? 'succeeded' : 'failed' }),
    () => ({ status: 'failed' })
  );

const observationSession = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle
): WindowsNamedJobObservationOpenOutcome => ({
  status: 'opened',
  session: {
    queryPolicy: () => queryJobPolicy(ffi, library, jobHandle),
    queryProcessIds: () => queryProcessIds(ffi, library, jobHandle),
    close: () => closeHandlesAndLibrary(library, [jobHandle])
  }
});

const terminationSession = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle
): WindowsNamedJobTerminationOpenOutcome => ({
  status: 'opened',
  session: {
    queryPolicy: () => queryJobPolicy(ffi, library, jobHandle),
    queryActiveProcesses: () => queryActiveProcesses(ffi, library, jobHandle),
    terminate: exitCode => nativeAction(() => library.symbols.TerminateJobObject(jobHandle, exitCode)),
    close: () => closeHandlesAndLibrary(library, [jobHandle])
  }
});

const verificationSession = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle,
  processHandle: NativeHandle
): WindowsNamedJobVerificationOpenOutcome => ({
  status: 'opened',
  session: {
    inspectProcess: () => inspectProcess(ffi, library, processHandle),
    queryPolicy: () => queryJobPolicy(ffi, library, jobHandle),
    queryActiveProcesses: () => queryActiveProcesses(ffi, library, jobHandle),
    isProcessInThisJob: () => processMembership(ffi, library, processHandle, jobHandle),
    close: () => closeHandlesAndLibrary(library, [processHandle, jobHandle])
  }
});

const openObservationWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  name: WindowsNamedJobIdentity
): Promise<WindowsNamedJobObservationOpenOutcome> => Promise.resolve().then((): NativeTerminationOpen => {
  const encodedName = encodeWideAscii(name.value);
  const jobHandle = normalizeHandle(library.symbols.OpenJobObjectW(
    JOB_VERIFICATION_ACCESS,
    false,
    ffi.ptr(encodedName)
  ));
  return jobHandle === null
    ? { jobHandle, errorCode: library.symbols.GetLastError() }
    : { jobHandle, errorCode: 0 };
}).then(
  (opened: NativeTerminationOpen) => opened.jobHandle !== null
    ? observationSession(ffi, library, opened.jobHandle)
    : closeLibrary(library).then(closed => closed
      ? { status: opened.errorCode === ERROR_FILE_NOT_FOUND ? 'missing' as const : 'unavailable' as const }
      : { status: 'unavailable' as const }),
  () => closeLibrary(library).then(() => ({ status: 'unavailable' as const }))
);

const openTerminationWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  name: WindowsNamedJobIdentity
): Promise<WindowsNamedJobTerminationOpenOutcome> => Promise.resolve().then((): NativeTerminationOpen => {
  const encodedName = encodeWideAscii(name.value);
  const jobHandle = normalizeHandle(library.symbols.OpenJobObjectW(
    JOB_TERMINATION_ACCESS,
    false,
    ffi.ptr(encodedName)
  ));
  return jobHandle === null
    ? { jobHandle, errorCode: library.symbols.GetLastError() }
    : { jobHandle, errorCode: 0 };
}).then(
  (opened: NativeTerminationOpen) => opened.jobHandle !== null
    ? terminationSession(ffi, library, opened.jobHandle)
    : closeLibrary(library).then(closed => closed
      ? { status: opened.errorCode === ERROR_FILE_NOT_FOUND ? 'missing' : 'unavailable' }
      : { status: 'unavailable' }),
  () => closeLibrary(library).then(() => ({ status: 'unavailable' }))
);

const openVerificationAfterJob = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  jobHandle: NativeHandle,
  processId: number
): Promise<WindowsNamedJobVerificationOpenOutcome> => Promise.resolve().then((): NativeProcessOpen => {
  const processHandle = normalizeHandle(library.symbols.OpenProcess(
    PROCESS_IDENTITY_ACCESS,
    false,
    processId
  ));
  return processHandle === null
    ? { processHandle, errorCode: library.symbols.GetLastError() }
    : { processHandle, errorCode: 0 };
}).then(
  (opened: NativeProcessOpen) => opened.processHandle !== null
    ? verificationSession(ffi, library, jobHandle, opened.processHandle)
    : closeHandlesAndLibrary(library, [jobHandle]).then(closed => closed
      ? {
          status: opened.errorCode === ERROR_INVALID_PARAMETER
            ? 'process-missing' as const
            : opened.errorCode === ERROR_ACCESS_DENIED
              ? 'process-inaccessible' as const
              : 'unavailable' as const
        }
      : { status: 'unavailable' }),
  () => closeHandlesAndLibrary(library, [jobHandle]).then(() => ({ status: 'unavailable' }))
);

const openVerificationWithLibrary = (
  ffi: BunFfiModule,
  library: Kernel32JobLibrary,
  name: WindowsNamedJobIdentity,
  processId: number
): Promise<WindowsNamedJobVerificationOpenOutcome> => Promise.resolve().then((): NativeTerminationOpen => {
  const encodedName = encodeWideAscii(name.value);
  const jobHandle = normalizeHandle(library.symbols.OpenJobObjectW(
    JOB_VERIFICATION_ACCESS,
    false,
    ffi.ptr(encodedName)
  ));
  return jobHandle === null
    ? { jobHandle, errorCode: library.symbols.GetLastError() }
    : { jobHandle, errorCode: 0 };
}).then(
  (opened: NativeTerminationOpen) => opened.jobHandle !== null
    ? openVerificationAfterJob(ffi, library, opened.jobHandle, processId)
    : closeLibrary(library).then(closed => closed
      ? {
          status: opened.errorCode === ERROR_FILE_NOT_FOUND
            ? 'job-missing' as const
            : 'unavailable' as const
        }
      : { status: 'unavailable' }),
  () => closeLibrary(library).then(() => ({ status: 'unavailable' }))
);

const openKernel32 = (ffi: BunFfiModule): Kernel32JobLibrary =>
  ffi.dlopen('kernel32.dll', kernel32JobSymbols);

const openNativeTermination = (
  name: WindowsNamedJobIdentity
): Promise<WindowsNamedJobTerminationOpenOutcome> => Promise.resolve()
  .then(() => import(/* @vite-ignore */ 'bun:ffi'))
  .then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => openTerminationWithLibrary(ffi, library, name),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

const openNativeObservation = (
  name: WindowsNamedJobIdentity
): Promise<WindowsNamedJobObservationOpenOutcome> => Promise.resolve()
  .then(() => import(/* @vite-ignore */ 'bun:ffi'))
  .then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => openObservationWithLibrary(ffi, library, name),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

const openNativeVerification = (
  name: WindowsNamedJobIdentity,
  processId: number
): Promise<WindowsNamedJobVerificationOpenOutcome> => Promise.resolve()
  .then(() => import(/* @vite-ignore */ 'bun:ffi'))
  .then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => openVerificationWithLibrary(ffi, library, name, processId),
      () => ({ status: 'unavailable' })
    ),
    () => ({ status: 'unavailable' })
  );

const nativeIdentityIsValid = (name: WindowsNamedJobIdentity): boolean =>
  /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(name.value);

export const createBunWindowsNamedJobNativePort = (
  platform: string = process.platform,
  architecture: string = process.arch
): WindowsNamedJobNativePort => ({
  openObservation: name => platform === 'win32' &&
    (architecture === 'x64' || architecture === 'arm64') && nativeIdentityIsValid(name)
    ? openNativeObservation(name)
    : Promise.resolve({ status: 'unavailable' }),
  openTermination: name => platform === 'win32' &&
    (architecture === 'x64' || architecture === 'arm64') && nativeIdentityIsValid(name)
    ? openNativeTermination(name)
    : Promise.resolve({ status: 'unavailable' }),
  openVerification: (name, processId) => platform === 'win32' &&
    (architecture === 'x64' || architecture === 'arm64') &&
    nativeIdentityIsValid(name) && processIdIsValid(processId)
    ? openNativeVerification(name, processId)
    : Promise.resolve({ status: 'unavailable' }),
  delay: milliseconds => positiveBound(milliseconds, WINDOWS_NAMED_JOB_MAX_TERMINATION_POLL_INTERVAL_MS)
    ? delay(milliseconds, undefined, { ref: false })
    : Promise.resolve()
});

const opaqueIncarnation = (
  processId: number,
  creationFileTime: bigint
): ProcessIncarnation | null => {
  const digest = createHash('sha256')
    .update(`windows-process-incarnation/v1\0${processId}\0${creationFileTime.toString(10)}`)
    .digest('hex');
  const incarnation = parseProcessIncarnation(`windows-process-incarnation-v1-${digest}`);
  return incarnation.type === 'ok' ? incarnation.value : null;
};

const inspectionMatches = (
  request: WindowsNamedJobVerificationRequest,
  inspection: WindowsNamedJobProcessInspection
): boolean => {
  if (inspection.status !== 'running') return false;
  const observed = opaqueIncarnation(request.processId, inspection.creationFileTime);
  return observed !== null && observed.value === request.processIncarnation.value;
};

const useTerminationSession = <Value>(
  session: WindowsNamedJobTerminationSession,
  work: () => Promise<BrokerResult<Value>>
): Promise<BrokerResult<Value>> => Promise.resolve().then(work).then(
  result => Promise.resolve().then(() => session.close()).then(
    closed => closed ? result : cleanupFailure(),
    () => cleanupFailure()
  ),
  () => Promise.resolve().then(() => session.close()).then(
    () => cleanupFailure(),
    () => cleanupFailure()
  )
);

const ambiguousBootstrapRoot = (
  reason: Extract<WindowsNamedJobBootstrapRootObservation, { status: 'ambiguous' }>['reason']
): WindowsNamedJobBootstrapRootObservation => ({ status: 'ambiguous', reason });

const useObservationSession = (
  session: WindowsNamedJobObservationSession,
  work: () => Promise<WindowsNamedJobBootstrapRootObservation>
): Promise<WindowsNamedJobBootstrapRootObservation> => Promise.resolve().then(work).then(
  result => Promise.resolve().then(() => session.close()).then(
    closed => closed ? result : ambiguousBootstrapRoot('unavailable'),
    () => ambiguousBootstrapRoot('unavailable')
  ),
  () => Promise.resolve().then(() => session.close()).then(
    () => ambiguousBootstrapRoot('unavailable'),
    () => ambiguousBootstrapRoot('unavailable')
  )
);

const useVerificationSession = <Value>(
  session: WindowsNamedJobVerificationSession,
  work: () => Promise<BrokerResult<Value>>
): Promise<BrokerResult<Value>> => Promise.resolve().then(work).then(
  result => Promise.resolve().then(() => session.close()).then(
    closed => closed ? result : verificationFailure(),
    () => verificationFailure()
  ),
  () => Promise.resolve().then(() => session.close()).then(
    () => verificationFailure(),
    () => verificationFailure()
  )
);

const verificationReceipt = (
  request: WindowsNamedJobVerificationRequest,
  job: WindowsNamedJobIdentity
): BrokerResult<WindowsNamedJobVerificationReceipt> => brokerOk({
  state: 'verified-contained',
  job,
  processId: request.processId,
  processIncarnation: request.processIncarnation
});

const verificationOperationFailure = (): BrokerResult<WindowsNamedJobVerificationReceipt> =>
  verificationFailure();
const verificationOperationConflict = (): BrokerResult<WindowsNamedJobVerificationReceipt> =>
  conflictFailure();
const verificationOperationProcessDrift = (): BrokerResult<WindowsNamedJobVerificationReceipt> =>
  processDriftFailure();

const observeBootstrapRootInSession = (
  session: WindowsNamedJobObservationSession,
  job: WindowsNamedJobIdentity
): Promise<WindowsNamedJobBootstrapRootObservation> => Promise.resolve()
  .then(() => session.queryPolicy())
  .then(
    policy => policy.status === 'compatible'
      ? Promise.resolve().then(() => session.queryProcessIds()).then(
          observed => observed.status !== 'observed'
            ? ambiguousBootstrapRoot('unavailable')
            : observed.processIds.length === 0
              ? { status: 'pending' as const, reason: 'job-empty' as const, job }
              : observed.processIds.length === 1 && observed.processIds[0] !== undefined
                ? { status: 'ready' as const, job, processId: observed.processIds[0] }
                : ambiguousBootstrapRoot('multiple-processes'),
          () => ambiguousBootstrapRoot('unavailable')
        )
      : ambiguousBootstrapRoot(policy.status === 'incompatible' ? 'policy-conflict' : 'unavailable'),
    () => ambiguousBootstrapRoot('unavailable')
  );

const observeBootstrapRoot = (
  config: ValidWindowsNamedJobContainmentConfig,
  request: WindowsNamedJobAttemptIdentity,
  native: WindowsNamedJobNativePort
): Promise<WindowsNamedJobBootstrapRootObservation> => {
  if (!attemptIdentityIsValid(request)) return Promise.resolve(ambiguousBootstrapRoot('unavailable'));
  const job = deriveWindowsNamedJobIdentity(config, request);
  if (job.isErr()) return Promise.resolve(ambiguousBootstrapRoot('unavailable'));
  return Promise.resolve().then(() => native.openObservation(job.value)).then(
    opened => opened.status === 'opened'
      ? useObservationSession(
          opened.session,
          () => observeBootstrapRootInSession(opened.session, job.value)
        )
      : opened.status === 'missing'
        ? { status: 'pending' as const, reason: 'job-name-missing' as const, job: job.value }
        : ambiguousBootstrapRoot('unavailable'),
    () => ambiguousBootstrapRoot('unavailable')
  );
};

const verifyInSession = (
  session: WindowsNamedJobVerificationSession,
  request: WindowsNamedJobVerificationRequest,
  job: WindowsNamedJobIdentity
): Promise<BrokerResult<WindowsNamedJobVerificationReceipt>> => Promise.resolve()
  .then(() => session.queryPolicy())
  .then(
    policy => {
      if (policy.status === 'incompatible') return verificationOperationConflict();
      if (policy.status !== 'compatible') return verificationOperationFailure();
      return Promise.resolve().then(() => session.inspectProcess()).then(
        inspection => {
          if (!inspectionMatches(request, inspection)) return verificationOperationProcessDrift();
          return Promise.resolve().then(() => session.isProcessInThisJob()).then(
            membership => {
              if (membership.status === 'observed' && !membership.value) {
                return verificationOperationConflict();
              }
              if (membership.status !== 'observed') return verificationOperationFailure();
              return Promise.resolve().then(() => session.queryActiveProcesses()).then(
                active => {
                  if (active.status !== 'observed' || active.activeProcesses === 0) {
                    return verificationOperationFailure();
                  }
                  return Promise.resolve().then(() => session.inspectProcess()).then(
                    finalInspection => {
                      if (!inspectionMatches(request, finalInspection)) {
                        return verificationOperationProcessDrift();
                      }
                      return Promise.resolve().then(() => session.queryPolicy()).then(
                        finalPolicy => finalPolicy.status === 'compatible'
                          ? verificationReceipt(request, job)
                          : finalPolicy.status === 'incompatible'
                            ? verificationOperationConflict()
                            : verificationOperationFailure(),
                        verificationOperationFailure
                      );
                    },
                    verificationOperationFailure
                  );
                },
                verificationOperationFailure
              );
            },
            verificationOperationFailure
          );
        },
        verificationOperationFailure
      );
    },
    verificationOperationFailure
  ).then(
    result => result,
    verificationOperationFailure
  );

const verifyExactProcess = (
  config: ValidWindowsNamedJobContainmentConfig,
  request: WindowsNamedJobVerificationRequest,
  native: WindowsNamedJobNativePort
): Promise<BrokerResult<WindowsNamedJobVerificationReceipt>> => {
  if (!attemptIdentityIsValid(request) || !processIdIsValid(request.processId) ||
      !expectedIncarnationIsValid(request.processIncarnation)) {
    return Promise.resolve(configurationFailure<WindowsNamedJobVerificationReceipt>());
  }
  const job = deriveWindowsNamedJobIdentity(config, request);
  if (job.isErr()) return Promise.resolve(configurationFailure<WindowsNamedJobVerificationReceipt>());
  return Promise.resolve().then(() => native.openVerification(job.value, request.processId)).then(
    opened => opened.status === 'opened'
      ? useVerificationSession(opened.session, () => verifyInSession(opened.session, request, job.value))
      : opened.status === 'process-missing'
        ? verificationOperationProcessDrift()
        : opened.status === 'process-inaccessible' || opened.status === 'job-missing'
          ? verificationOperationConflict()
          : unavailableFailure<WindowsNamedJobVerificationReceipt>(),
    () => unavailableFailure<WindowsNamedJobVerificationReceipt>()
  ).then(
    result => result,
    verificationOperationFailure
  );
};

const emptyReceipt = (
  job: WindowsNamedJobIdentity,
  state: WindowsNamedJobTerminationReceipt['state']
): BrokerResult<WindowsNamedJobTerminationReceipt> => brokerOk({
  state,
  job,
  activeProcesses: 0
});

const terminationOperationCleanupFailure = (): BrokerResult<WindowsNamedJobTerminationReceipt> =>
  cleanupFailure();
const terminationOperationConflict = (): BrokerResult<WindowsNamedJobTerminationReceipt> =>
  conflictFailure();
const terminationOperationUnavailable = (): BrokerResult<WindowsNamedJobTerminationReceipt> =>
  unavailableFailure();

const pollUntilEmpty = (
  session: WindowsNamedJobTerminationSession,
  job: WindowsNamedJobIdentity,
  attemptsRemaining: number,
  intervalMs: number,
  native: WindowsNamedJobNativePort
): Promise<BrokerResult<WindowsNamedJobTerminationReceipt>> => Promise.resolve()
  .then(() => session.queryActiveProcesses())
  .then(active => {
    if (active.status !== 'observed') return cleanupFailure<WindowsNamedJobTerminationReceipt>();
    if (active.activeProcesses === 0) return emptyReceipt(job, 'terminated-empty');
    return attemptsRemaining > 1
      ? Promise.resolve().then(() => native.delay(intervalMs)).then(() => pollUntilEmpty(
          session,
          job,
          attemptsRemaining - 1,
          intervalMs,
          native
        ))
      : cleanupFailure<WindowsNamedJobTerminationReceipt>();
  }).then(
    result => result,
    terminationOperationCleanupFailure
  );

const terminateInSession = (
  session: WindowsNamedJobTerminationSession,
  job: WindowsNamedJobIdentity,
  config: ValidWindowsNamedJobContainmentConfig,
  native: WindowsNamedJobNativePort
): Promise<BrokerResult<WindowsNamedJobTerminationReceipt>> => Promise.resolve()
  .then(() => session.queryPolicy())
  .then(
    policy => {
      if (policy.status === 'incompatible') return terminationOperationConflict();
      if (policy.status !== 'compatible') return terminationOperationCleanupFailure();
      return Promise.resolve().then(() => session.queryActiveProcesses()).then(
        active => {
          if (active.status !== 'observed') return terminationOperationCleanupFailure();
          if (active.activeProcesses === 0) return emptyReceipt(job, 'already-empty');
          return Promise.resolve().then(() => session.terminate(TERMINATION_EXIT_CODE)).then(
            terminated => terminated.status === 'succeeded'
              ? pollUntilEmpty(
                  session,
                  job,
                  config.terminationPollAttempts,
                  config.terminationPollIntervalMs,
                  native
                )
              : terminationOperationCleanupFailure(),
            terminationOperationCleanupFailure
          );
        },
        terminationOperationCleanupFailure
      );
    },
    terminationOperationCleanupFailure
  ).then(
    result => result,
    terminationOperationCleanupFailure
  );

const terminateAndProveEmpty = (
  config: ValidWindowsNamedJobContainmentConfig,
  request: WindowsNamedJobTerminationRequest,
  native: WindowsNamedJobNativePort
): Promise<BrokerResult<WindowsNamedJobTerminationReceipt>> => {
  if (!attemptIdentityIsValid(request)) {
    return Promise.resolve(configurationFailure<WindowsNamedJobTerminationReceipt>());
  }
  const job = deriveWindowsNamedJobIdentity(config, request);
  if (job.isErr()) return Promise.resolve(configurationFailure<WindowsNamedJobTerminationReceipt>());
  return Promise.resolve().then(() => native.openTermination(job.value)).then(
    opened => opened.status === 'missing'
      ? terminationOperationCleanupFailure()
      : opened.status === 'opened'
        ? useTerminationSession(
            opened.session,
            () => terminateInSession(opened.session, job.value, config, native)
          )
        : terminationOperationUnavailable(),
    terminationOperationUnavailable
  ).then(
    result => result,
    terminationOperationCleanupFailure
  );
};

const ambiguousTermination = (
  reason: Extract<WindowsNamedJobTerminationObservation, { status: 'ambiguous' }>['reason']
): WindowsNamedJobTerminationObservation => ({ status: 'ambiguous', reason });

const projectTerminationResult = (
  result: BrokerResult<WindowsNamedJobTerminationReceipt>
): WindowsNamedJobTerminationObservation => result.isOk()
  ? { status: 'proved-empty', receipt: result.value }
  : ambiguousTermination(result.error[0].code === 'receiver-conflict'
    ? 'policy-conflict'
    : result.error[0].code === 'receiver-unavailable'
      ? 'unavailable'
      : 'cleanup-unconfirmed');

const terminateAndObserve = (
  config: ValidWindowsNamedJobContainmentConfig,
  request: WindowsNamedJobTerminationRequest,
  native: WindowsNamedJobNativePort
): Promise<WindowsNamedJobTerminationObservation> => {
  if (!attemptIdentityIsValid(request)) return Promise.resolve(ambiguousTermination('unavailable'));
  const job = deriveWindowsNamedJobIdentity(config, request);
  if (job.isErr()) return Promise.resolve(ambiguousTermination('unavailable'));
  return Promise.resolve().then(() => native.openTermination(job.value)).then(
    opened => opened.status === 'missing'
      ? { status: 'missing' as const, job: job.value }
      : opened.status === 'opened'
        ? useTerminationSession(
            opened.session,
            () => terminateInSession(opened.session, job.value, config, native)
          ).then(projectTerminationResult)
        : ambiguousTermination('unavailable'),
    () => ambiguousTermination('unavailable')
  ).then(
    result => result,
    () => ambiguousTermination('cleanup-unconfirmed')
  );
};

/**
 * The ephemeral-safe-to-stop policy is exact: KILL_ON_JOB_CLOSE is the only
 * extended limit and UI restrictions are zero, so no breakaway mode can omit a
 * descendant. An admitted target self-assigns as its first effect and retains a
 * non-inheritable opaque lifetime anchor until process exit. Closing that last
 * owned anchor then terminates any surviving descendants without a wrapper.
 * Query-only broker handles are temporary and verification always closes them.
 * A missing object name is never accepted as standalone proof of an empty tree;
 * higher-level cleanup must combine prior containment with root and descendant
 * exit evidence.
 */
export const createWindowsNamedJobContainmentPort = (
  config: WindowsNamedJobContainmentConfig,
  native: WindowsNamedJobNativePort = createBunWindowsNamedJobNativePort()
): WindowsNamedJobContainmentCapabilities => {
  const validated = validateConfig(config);
  return {
    observeBootstrapRoot: request => validated.isErr()
      ? Promise.resolve(ambiguousBootstrapRoot('unavailable'))
      : observeBootstrapRoot(validated.value, request, native),
    verifyExactProcess: request => validated.isErr()
      ? Promise.resolve(configurationFailure())
      : verifyExactProcess(validated.value, request, native),
    terminateAndProveEmpty: request => validated.isErr()
      ? Promise.resolve(configurationFailure())
      : terminateAndProveEmpty(validated.value, request, native),
    terminateAndObserve: request => validated.isErr()
      ? Promise.resolve(ambiguousTermination('unavailable'))
      : terminateAndObserve(validated.value, request, native)
  };
};
