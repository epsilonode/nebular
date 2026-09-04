import { isAbsolute, normalize } from 'node:path';

import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import {
  journalErr,
  journalOk,
  type JournalResult,
  type TrustedLocalApplicationDataPort,
  type TrustedProfileRoot
} from './journal.ts';

const MAXIMUM_WINDOWS_PATH_CODE_UNITS = 32_767;

const LOCAL_APPLICATION_DATA_FOLDER_ID = Uint8Array.from([
  0x85, 0x27, 0xb3, 0xf1,
  0xba, 0x6f,
  0xcf, 0x4f,
  0x9d, 0x55, 0x7b, 0x8e, 0x7f, 0x15, 0x70, 0x91
]);

const shell32Symbols = {
  SHGetKnownFolderPath: {
    args: ['ptr', 'u32', 'ptr', 'ptr'],
    returns: 'i32'
  }
} as const;

const ole32Symbols = {
  CoTaskMemFree: {
    args: ['ptr'],
    returns: 'void'
  }
} as const;

export type WindowsLocalApplicationDataOutcome =
  | Readonly<{ status: 'resolved'; path: string }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsKnownFolderRuntimePort = Readonly<{
  resolveLocalApplicationData: () => Promise<WindowsLocalApplicationDataOutcome>;
}>;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr' | 'read' | 'toArrayBuffer'>>;
type Shell32Library = Readonly<Library<typeof shell32Symbols>>;
type Ole32Library = Readonly<Library<typeof ole32Symbols>>;

const unavailable = (): WindowsLocalApplicationDataOutcome => ({ status: 'unavailable' });

const closeLibrary = (library: Readonly<{ close: () => void }>): Promise<void> =>
  Promise.resolve().then(() => library.close()).then(
    () => undefined,
    () => undefined
  );

const decodeWideString = (ffi: BunFfiModule, pointer: number): string => {
  const length = Array.from(
    { length: MAXIMUM_WINDOWS_PATH_CODE_UNITS + 1 },
    (_value, index) => index
  ).findIndex(index => ffi.read.u16(pointer, index * 2) === 0);
  if (length < 1 || length > MAXIMUM_WINDOWS_PATH_CODE_UNITS) return '';
  return new TextDecoder('utf-16le', { fatal: true }).decode(
    ffi.toArrayBuffer(pointer, 0, length * 2)
  );
};

const resolveWithLibraries = (
  ffi: BunFfiModule,
  shell32: Shell32Library,
  ole32: Ole32Library
): Promise<WindowsLocalApplicationDataOutcome> => {
  const outputPointer = new BigUint64Array(1);
  const invoked = Promise.resolve().then(() => ({
    result: shell32.symbols.SHGetKnownFolderPath(
      ffi.ptr(LOCAL_APPLICATION_DATA_FOLDER_ID),
      0,
      null,
      ffi.ptr(outputPointer)
    ),
    pointer: ffi.read.ptr(ffi.ptr(outputPointer))
  }));
  const resolved = invoked.then(invocation => {
    if (invocation.result !== 0 || invocation.pointer === 0) return unavailable();
    const decoded = Promise.resolve().then(() => decodeWideString(ffi, invocation.pointer));
    return decoded.then(
      path => Promise.resolve().then(() => ole32.symbols.CoTaskMemFree(BigInt(invocation.pointer))).then(
        () => path.length === 0 ? unavailable() : { status: 'resolved' as const, path },
        unavailable
      ),
      () => Promise.resolve().then(() => ole32.symbols.CoTaskMemFree(BigInt(invocation.pointer))).then(
        unavailable,
        unavailable
      )
    );
  }, unavailable);
  return resolved.then(
    outcome => Promise.all([closeLibrary(shell32), closeLibrary(ole32)]).then(() => outcome),
    () => Promise.all([closeLibrary(shell32), closeLibrary(ole32)]).then(unavailable)
  );
};

const openShell32 = (ffi: BunFfiModule): Shell32Library => ffi.dlopen('shell32.dll', shell32Symbols);
const openOle32 = (ffi: BunFfiModule): Ole32Library => ffi.dlopen('ole32.dll', ole32Symbols);

const resolveKnownFolder = (): Promise<WindowsLocalApplicationDataOutcome> =>
  Promise.resolve().then(() => import(/* @vite-ignore */ 'bun:ffi')).then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openShell32(ffi)).then(
      shell32 => Promise.resolve().then(() => openOle32(ffi)).then(
        ole32 => resolveWithLibraries(ffi, shell32, ole32),
        () => closeLibrary(shell32).then(unavailable)
      ),
      unavailable
    ),
    unavailable
  );

export const createBunWindowsKnownFolderRuntimePort = (): WindowsKnownFolderRuntimePort => ({
  resolveLocalApplicationData: resolveKnownFolder
});

const trustedProfileRoot = (value: string): JournalResult<TrustedProfileRoot> => {
  const normalized = normalize(value);
  const isLocal = isAbsolute(normalized) && /^[A-Za-z]:\\/u.test(normalized) &&
    !normalized.startsWith('\\\\') && !normalized.includes('\0') &&
    normalized.length <= MAXIMUM_WINDOWS_PATH_CODE_UNITS;
  return isLocal
    ? journalOk<TrustedProfileRoot>({ kind: 'trusted-profile-root', value: normalized })
    : journalErr({ code: 'journal-unavailable', message: 'The trusted current-user profile location is unavailable.' });
};

export const createWindowsKnownFolderLocalApplicationDataPort = (
  runtime: WindowsKnownFolderRuntimePort = createBunWindowsKnownFolderRuntimePort(),
  platform: string = process.platform
): TrustedLocalApplicationDataPort => ({
  resolveCurrentUserRoot: () => platform === 'win32'
    ? Promise.resolve().then(() => runtime.resolveLocalApplicationData()).then(
        outcome => outcome.status === 'resolved'
          ? trustedProfileRoot(outcome.path)
          : journalErr({ code: 'journal-unavailable', message: 'The trusted current-user profile location is unavailable.' }),
        () => journalErr({ code: 'journal-unavailable', message: 'The trusted current-user profile location is unavailable.' })
      )
    : Promise.resolve(journalErr({
        code: 'journal-unavailable',
        message: 'The Windows trusted-profile adapter is unavailable on this platform.'
      }))
});
