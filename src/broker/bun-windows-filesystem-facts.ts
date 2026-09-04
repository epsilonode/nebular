import { win32 } from 'node:path';

import type * as BunFfiApi from 'bun:ffi';
import type { Library } from 'bun:ffi';

import {
  isCanonicalLocalWindowsAbsolutePath,
  type WindowsExecutionDirectoryFactsPort,
  type WindowsExecutionDirectoryInspectionRequest,
  type WindowsExecutionDirectoryObservation
} from './windows-execution-paths.ts';
import {
  readCurrentWindowsExecutionProcessFacts,
  type WindowsExecutionFileInspectionRequest,
  type WindowsExecutionFileObservation,
  type WindowsExecutionToolRuntimePort
} from './windows-tool-registry.ts';

const FILE_READ_ATTRIBUTES = 0x80;
const FILE_SHARE_READ = 0x1;
const FILE_SHARE_WRITE = 0x2;
const OPEN_EXISTING = 3;
const FILE_ATTRIBUTE_DIRECTORY = 0x10;
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;
const FILE_FLAG_OPEN_REPARSE_POINT = 0x0020_0000;
const FILE_FLAG_BACKUP_SEMANTICS = 0x0200_0000;
const FILE_TYPE_DISK = 1;
const WINDOWS_FINAL_PATH_BUFFER_CODE_UNITS = 32_768;
const INVALID_HANDLE_VALUE = 0xffff_ffff_ffff_ffffn;

const kernel32FilesystemSymbols = {
  CreateFileW: {
    args: ['ptr', 'u32', 'u32', 'ptr', 'u32', 'u32', 'u64'],
    returns: 'u64'
  },
  GetFileInformationByHandle: {
    args: ['u64', 'ptr'],
    returns: 'bool'
  },
  GetFileType: {
    args: ['u64'],
    returns: 'u32'
  },
  GetFinalPathNameByHandleW: {
    args: ['u64', 'ptr', 'u32', 'u32'],
    returns: 'u32'
  },
  CloseHandle: {
    args: ['u64'],
    returns: 'bool'
  }
} as const;

export type WindowsFilesystemComponentKind = 'directory' | 'regular-file' | 'other';

export type WindowsFilesystemComponentInspection =
  | Readonly<{
      status: 'observed';
      canonicalPath: string;
      kind: WindowsFilesystemComponentKind;
      reparsePoint: boolean;
    }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsOpenedFilesystemComponent = Readonly<{
  inspect: () => Promise<WindowsFilesystemComponentInspection>;
  close: () => Promise<boolean>;
}>;

export type WindowsFilesystemComponentOpenObservation =
  | Readonly<{ status: 'opened'; component: WindowsOpenedFilesystemComponent }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsFilesystemNativeSession = Readonly<{
  openComponent: (path: string) => Promise<WindowsFilesystemComponentOpenObservation>;
  /** Unloads the native library after all component handles have been closed. */
  close: () => Promise<boolean>;
}>;

export type WindowsFilesystemSessionOpenObservation =
  | Readonly<{ status: 'opened'; session: WindowsFilesystemNativeSession }>
  | Readonly<{ status: 'unavailable' }>;

export type WindowsFilesystemPathObservation = Readonly<{
  requestedPath: string;
  canonicalPath: string;
  kind: WindowsFilesystemComponentKind;
  traversesReparsePoint: boolean;
}>;

export type WindowsFilesystemPathFactsPort = Readonly<{
  inspectExistingPath: (path: string) => Promise<
    WindowsFilesystemPathObservation | Readonly<{ status: 'unavailable' }>
  >;
}>;

export type WindowsFilesystemNativePort = Readonly<{
  openSession: () => Promise<WindowsFilesystemSessionOpenObservation>;
}>;

export type BunWindowsFilesystemFactsRuntime = WindowsExecutionDirectoryFactsPort &
  WindowsExecutionToolRuntimePort & WindowsFilesystemPathFactsPort;

type BunFfiModule = Readonly<Pick<typeof BunFfiApi, 'dlopen' | 'ptr'>>;
type Kernel32FilesystemLibrary = Readonly<Library<typeof kernel32FilesystemSymbols>>;
type NativeHandle = bigint;

type HeldFilesystemComponent = Readonly<{
  requestedPath: string;
  component: WindowsOpenedFilesystemComponent;
}>;

type OpenedComponentBatch =
  | Readonly<{ status: 'opened'; components: readonly HeldFilesystemComponent[] }>
  | Readonly<{ status: 'unavailable'; components: readonly HeldFilesystemComponent[] }>;

type InspectedFilesystemComponent = Readonly<{
  requestedPath: string;
  canonicalPath: string;
  kind: WindowsFilesystemComponentKind;
  reparsePoint: boolean;
}>;

type InspectedComponentBatch =
  | Readonly<{ status: 'observed'; components: readonly InspectedFilesystemComponent[] }>
  | Readonly<{ status: 'unavailable' }>;

type ProvedFilesystemPath = Readonly<{
  requestedPath: string;
  canonicalPath: string;
  kind: WindowsFilesystemComponentKind;
  traversesReparsePoint: boolean;
}>;

type ProvedFilesystemPathBatch =
  | Readonly<{ status: 'observed'; paths: readonly ProvedFilesystemPath[] }>
  | Readonly<{ status: 'unavailable' }>;

const unavailable = (): Readonly<{ status: 'unavailable' }> => ({ status: 'unavailable' });

const closeLibrary = (library: Readonly<{ close: () => void }>): Promise<boolean> =>
  Promise.resolve().then(() => library.close()).then(
    () => true,
    () => false
  );

const normalizeNativeHandle = (value: unknown): NativeHandle | null =>
  typeof value === 'bigint' && value > 0n && value < INVALID_HANDLE_VALUE
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value) && value > 0
      ? BigInt(value)
      : null;

const encodeWide = (value: string): Uint16Array => Uint16Array.from(
  Array.from({ length: value.length + 1 }, (_unused, index) =>
    index === value.length ? 0 : value.charCodeAt(index))
);

const stripExtendedDosPrefix = (value: string): string | null =>
  value.startsWith('\\\\?\\') && !value.startsWith('\\\\?\\UNC\\')
    ? value.slice(4)
    : null;

const observedComponent = (
  canonicalPath: string,
  kind: WindowsFilesystemComponentKind,
  reparsePoint: boolean
): WindowsFilesystemComponentInspection => ({
  status: 'observed',
  canonicalPath,
  kind,
  reparsePoint
});

const finalPathForHandle = (
  ffi: BunFfiModule,
  library: Kernel32FilesystemLibrary,
  handle: NativeHandle
): string | null => {
  const buffer = new Uint16Array(WINDOWS_FINAL_PATH_BUFFER_CODE_UNITS);
  const length = library.symbols.GetFinalPathNameByHandleW(
    handle,
    ffi.ptr(buffer),
    buffer.length,
    0
  );
  if (length <= 0 || length >= buffer.length) return null;
  const decoded = new TextDecoder('utf-16le').decode(
    new Uint8Array(buffer.buffer, buffer.byteOffset, length * Uint16Array.BYTES_PER_ELEMENT)
  );
  return stripExtendedDosPrefix(decoded);
};

const inspectNativeComponent = (
  ffi: BunFfiModule,
  library: Kernel32FilesystemLibrary,
  handle: NativeHandle
): Promise<WindowsFilesystemComponentInspection> => Promise.resolve().then(() => {
  const information = new Uint32Array(13);
  if (!library.symbols.GetFileInformationByHandle(handle, ffi.ptr(information))) return unavailable();
  const canonicalPath = finalPathForHandle(ffi, library, handle);
  if (canonicalPath === null) return unavailable();
  const attributes = information.at(0) ?? 0;
  const fileType = library.symbols.GetFileType(handle);
  const kind: WindowsFilesystemComponentKind = (attributes & FILE_ATTRIBUTE_DIRECTORY) !== 0
    ? 'directory'
    : fileType === FILE_TYPE_DISK ? 'regular-file' : 'other';
  return observedComponent(
    canonicalPath,
    kind,
    (attributes & FILE_ATTRIBUTE_REPARSE_POINT) !== 0
  );
}).then(
  inspection => inspection,
  unavailable
);

const closeNativeComponent = (
  library: Kernel32FilesystemLibrary,
  handle: NativeHandle
): Promise<boolean> => Promise.resolve().then(() => library.symbols.CloseHandle(handle)).then(
  closed => closed,
  () => false
);

const openedNativeComponent = (
  ffi: BunFfiModule,
  library: Kernel32FilesystemLibrary,
  handle: NativeHandle
): WindowsFilesystemComponentOpenObservation => ({
  status: 'opened',
  component: {
    inspect: () => inspectNativeComponent(ffi, library, handle),
    close: () => closeNativeComponent(library, handle)
  }
});

const openNativeComponent = (
  ffi: BunFfiModule,
  library: Kernel32FilesystemLibrary,
  path: string
): Promise<WindowsFilesystemComponentOpenObservation> => Promise.resolve().then(() => {
  if (!isCanonicalLocalWindowsAbsolutePath(path)) return null;
  const encodedPath = encodeWide(path);
  return normalizeNativeHandle(library.symbols.CreateFileW(
    ffi.ptr(encodedPath),
    FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    null,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    0n
  ));
}).then(
  handle => handle === null ? unavailable() : openedNativeComponent(ffi, library, handle),
  unavailable
);

const openedNativeSession = (
  ffi: BunFfiModule,
  library: Kernel32FilesystemLibrary
): WindowsFilesystemSessionOpenObservation => ({
  status: 'opened',
  session: {
    openComponent: path => openNativeComponent(ffi, library, path),
    close: () => closeLibrary(library)
  }
});

const openKernel32 = (ffi: BunFfiModule): Kernel32FilesystemLibrary =>
  ffi.dlopen('kernel32.dll', kernel32FilesystemSymbols);

const openNativeSession = (): Promise<WindowsFilesystemSessionOpenObservation> => Promise.resolve()
  .then(() => import(/* @vite-ignore */ 'bun:ffi')).then(
    (ffi: BunFfiModule) => Promise.resolve().then(() => openKernel32(ffi)).then(
      library => openedNativeSession(ffi, library),
      unavailable
    ),
    unavailable
  );

export const createBunWindowsFilesystemNativePort = (
  platform: string = process.platform
): WindowsFilesystemNativePort => ({
  openSession: () => platform === 'win32'
    ? openNativeSession()
    : Promise.resolve(unavailable())
});

const pathComponents = (path: string): readonly string[] => {
  const root = win32.parse(path).root;
  const segments = path.slice(root.length).split('\\').filter(segment => segment.length > 0);
  return segments.reduce<Readonly<{ current: string; paths: readonly string[] }>>(
    (state, segment) => {
      const current = win32.join(state.current, segment);
      return { current, paths: [...state.paths, current] };
    },
    { current: root, paths: [root] }
  ).paths;
};

const uniqueComponents = (paths: readonly string[]): readonly string[] => paths
  .flatMap(pathComponents)
  .reduce<readonly string[]>(
    (components, component) => components.includes(component) ? components : [...components, component],
    []
  );

const openAllComponents = (
  session: WindowsFilesystemNativeSession,
  paths: readonly string[],
  index: number = 0,
  components: readonly HeldFilesystemComponent[] = []
): Promise<OpenedComponentBatch> => {
  const requestedPath = paths[index];
  if (requestedPath === undefined) return Promise.resolve({ status: 'opened', components });
  return Promise.resolve().then(() => session.openComponent(requestedPath)).then(
    observation => observation.status === 'opened'
      ? openAllComponents(session, paths, index + 1, [
          ...components,
          { requestedPath, component: observation.component }
        ])
      : { status: 'unavailable', components },
    () => ({ status: 'unavailable', components })
  );
};

const inspectAllComponents = (
  components: readonly HeldFilesystemComponent[],
  index: number = 0,
  inspections: readonly InspectedFilesystemComponent[] = []
): Promise<InspectedComponentBatch> => {
  const held = components[index];
  if (held === undefined) return Promise.resolve({ status: 'observed', components: inspections });
  return Promise.resolve().then(() => held.component.inspect()).then(
    inspection => inspection.status === 'observed'
      ? inspectAllComponents(components, index + 1, [
          ...inspections,
          { requestedPath: held.requestedPath, ...inspection }
        ])
      : unavailable(),
    unavailable
  );
};

const closeAllComponents = (
  components: readonly HeldFilesystemComponent[]
): Promise<boolean> => components.reduceRight<Promise<boolean>>(
  (closed, held) => closed.then(previousClosed => Promise.resolve()
    .then(() => held.component.close())
    .then(
      componentClosed => previousClosed && componentClosed,
      () => false
    )),
  Promise.resolve(true)
);

const exactInspectedComponents = (
  components: readonly InspectedFilesystemComponent[]
): boolean => components.every(component =>
  component.canonicalPath === component.requestedPath &&
  isCanonicalLocalWindowsAbsolutePath(component.canonicalPath));

const proveOnePath = (
  path: string,
  inspections: readonly InspectedFilesystemComponent[]
): ProvedFilesystemPath | null => {
  const components = pathComponents(path);
  const observed = components.map(component =>
    inspections.find(inspection => inspection.requestedPath === component) ?? null);
  const leaf = observed.at(-1);
  return leaf !== null && leaf !== undefined && observed.every(component => component !== null) &&
    observed.slice(0, -1).every(component => component.kind === 'directory')
    ? {
        requestedPath: path,
        canonicalPath: leaf.canonicalPath,
        kind: leaf.kind,
        traversesReparsePoint: observed.some(component => component.reparsePoint)
      }
    : null;
};

const projectInspections = (
  paths: readonly string[],
  batch: InspectedComponentBatch
): ProvedFilesystemPathBatch => {
  if (batch.status !== 'observed' || !exactInspectedComponents(batch.components)) return unavailable();
  const proved = paths.map(path => proveOnePath(path, batch.components));
  return proved.every((path): path is ProvedFilesystemPath => path !== null)
    ? { status: 'observed', paths: proved }
    : unavailable();
};

const finalizeSession = (
  session: WindowsFilesystemNativeSession,
  components: readonly HeldFilesystemComponent[],
  result: ProvedFilesystemPathBatch
): Promise<ProvedFilesystemPathBatch> => closeAllComponents(components).then(
  componentsClosed => Promise.resolve().then(() => session.close()).then(
    sessionClosed => componentsClosed && sessionClosed ? result : unavailable(),
    unavailable
  ),
  () => Promise.resolve().then(() => session.close()).then(
    unavailable,
    unavailable
  )
);

const proveWithSession = (
  session: WindowsFilesystemNativeSession,
  paths: readonly string[]
): Promise<ProvedFilesystemPathBatch> => openAllComponents(session, uniqueComponents(paths)).then(
  opened => (opened.status === 'opened'
    ? inspectAllComponents(opened.components).then(batch => projectInspections(paths, batch))
    : Promise.resolve(unavailable())
  ).then(result => finalizeSession(session, opened.components, result)),
  () => Promise.resolve().then(() => session.close()).then(unavailable, unavailable)
);

const provePaths = (
  native: WindowsFilesystemNativePort,
  paths: readonly string[],
  platform: string
): Promise<ProvedFilesystemPathBatch> => platform === 'win32' && paths.length > 0 &&
  paths.every(isCanonicalLocalWindowsAbsolutePath)
  ? Promise.resolve().then(() => native.openSession()).then(
      observation => observation.status === 'opened'
        ? proveWithSession(observation.session, paths)
        : unavailable(),
      unavailable
    ).then(result => result, unavailable)
  : Promise.resolve(unavailable());

const directoryObservation = (
  path: ProvedFilesystemPath
): WindowsExecutionDirectoryObservation => ({
  requestedPath: path.requestedPath,
  canonicalPath: path.canonicalPath,
  kind: path.kind,
  traversesReparsePoint: path.traversesReparsePoint
});

const inspectDirectories = (
  native: WindowsFilesystemNativePort,
  platform: string,
  request: WindowsExecutionDirectoryInspectionRequest
): Promise<unknown> => provePaths(
  native,
  [request.repositoryPath, request.workingDirectoryPath],
  platform
).then(batch => batch.status === 'observed' && batch.paths[0] !== undefined && batch.paths[1] !== undefined
  ? {
      platform: 'win32',
      repository: directoryObservation(batch.paths[0]),
      workingDirectory: directoryObservation(batch.paths[1])
    }
  : unavailable());

const fileObservation = (
  request: WindowsExecutionFileInspectionRequest,
  path: ProvedFilesystemPath
): WindowsExecutionFileObservation => ({
  role: request.role,
  requestedPath: path.requestedPath,
  canonicalPath: path.canonicalPath,
  kind: path.kind,
  traversesReparsePoint: path.traversesReparsePoint
});

const pathObservation = (
  path: ProvedFilesystemPath
): WindowsFilesystemPathObservation => ({
  requestedPath: path.requestedPath,
  canonicalPath: path.canonicalPath,
  kind: path.kind,
  traversesReparsePoint: path.traversesReparsePoint
});

const inspectFile = (
  native: WindowsFilesystemNativePort,
  platform: string,
  request: WindowsExecutionFileInspectionRequest
): Promise<unknown> => provePaths(native, [request.path], platform).then(
  batch => batch.status === 'observed' && batch.paths[0] !== undefined
    ? fileObservation(request, batch.paths[0])
    : unavailable()
);

const inspectPath = (
  native: WindowsFilesystemNativePort,
  platform: string,
  path: string
): Promise<WindowsFilesystemPathObservation | Readonly<{ status: 'unavailable' }>> =>
  provePaths(native, [path], platform).then(
    batch => batch.status === 'observed' && batch.paths[0] !== undefined
      ? pathObservation(batch.paths[0])
      : unavailable()
  );

export const createBunWindowsFilesystemFactsRuntime = (
  native: WindowsFilesystemNativePort = createBunWindowsFilesystemNativePort(),
  platform: string = process.platform
): BunWindowsFilesystemFactsRuntime => ({
  currentProcess: readCurrentWindowsExecutionProcessFacts,
  inspect: request => inspectDirectories(native, platform, request),
  inspectExistingFile: request => inspectFile(native, platform, request),
  inspectExistingPath: path => inspectPath(native, platform, path)
});
