import { win32 } from 'node:path';

import type { CanonicalRepository } from './primitives.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

export const WINDOWS_EXECUTION_PATH_MAX_CODE_UNITS = 32_767;
export const WINDOWS_EXECUTION_DECLARED_CWD_MAX_CODE_UNITS = 4_096;

export type RepositoryRelativeWindowsDirectory = Readonly<{
  kind: 'repository-relative-windows-directory';
  value: string;
}>;

export type CanonicalWindowsWorkingDirectory = Readonly<{
  kind: 'canonical-windows-working-directory';
  value: string;
  repository: CanonicalRepository;
  relativePath: RepositoryRelativeWindowsDirectory;
}>;

export type WindowsExecutionDirectoryObservation = Readonly<{
  requestedPath: string;
  canonicalPath: string | null;
  kind: 'directory' | 'regular-file' | 'other' | 'missing';
  traversesReparsePoint: boolean;
}>;

export type WindowsExecutionDirectoryFacts = Readonly<{
  platform: string;
  repository: WindowsExecutionDirectoryObservation;
  workingDirectory: WindowsExecutionDirectoryObservation;
}>;

export type WindowsExecutionDirectoryInspectionRequest = Readonly<{
  repositoryPath: string;
  workingDirectoryPath: string;
}>;

/**
 * A production adapter must inspect every traversed component. In particular,
 * `traversesReparsePoint` cannot be implemented as an lstat of only the leaf.
 * The boundary returns unknown so malformed native/FFI observations fail closed.
 */
export type WindowsExecutionDirectoryFactsPort = Readonly<{
  inspect: (request: WindowsExecutionDirectoryInspectionRequest) => Promise<unknown>;
}>;

export type WindowsExecutionWorkingDirectoryRequest = Readonly<{
  repository: CanonicalRepository;
  declaredCwd: string;
}>;

export type WindowsExecutionPathResolverPort = Readonly<{
  resolveWorkingDirectory: (
    request: WindowsExecutionWorkingDirectoryRequest
  ) => Promise<BrokerResult<CanonicalWindowsWorkingDirectory>>;
}>;

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

export const isCanonicalLocalWindowsAbsolutePath = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = slashNormalized(value);
  return value.length > 0 && value.length <= WINDOWS_EXECUTION_PATH_MAX_CODE_UNITS &&
    isWellFormedUnicode(value) && !value.includes('\0') && !hasWindowsDevicePrefix(value) &&
    !normalized.startsWith('\\\\') && /^[A-Za-z]:\\/u.test(normalized) &&
    win32.isAbsolute(normalized) && !normalized.slice(2).includes(':') &&
    value === win32.normalize(value);
};

const reservedWindowsBasename = (segment: string): boolean => {
  const basename = segment.split('.')[0]?.toUpperCase() ?? '';
  return basename === 'CON' || basename === 'PRN' || basename === 'AUX' || basename === 'NUL' ||
    /^COM[1-9]$/u.test(basename) || /^LPT[1-9]$/u.test(basename);
};

const validRelativeSegment = (segment: string): boolean => segment.length > 0 && segment !== '.' &&
  segment !== '..' && !segment.endsWith('.') && !segment.endsWith(' ') &&
  !/[<>:"|?*]/u.test(segment) && !reservedWindowsBasename(segment);

export const parseRepositoryRelativeWindowsDirectory = (
  value: unknown
): BrokerResult<RepositoryRelativeWindowsDirectory> => {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > WINDOWS_EXECUTION_DECLARED_CWD_MAX_CODE_UNITS ||
      !isWellFormedUnicode(value) || value.includes('\0') || hasWindowsDevicePrefix(value)) {
    return brokerErr({ code: 'process-plan-invalid', message: 'Recipe working directory is invalid.' });
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized === '.') return brokerOk({ kind: 'repository-relative-windows-directory', value: '.' });
  const segments: readonly string[] = normalized.split('/');
  return !normalized.startsWith('/') && !win32.isAbsolute(value) &&
    !/^[A-Za-z]:/u.test(normalized) && segments.every(validRelativeSegment)
    ? brokerOk({ kind: 'repository-relative-windows-directory', value: normalized })
    : brokerErr({ code: 'process-plan-invalid', message: 'Recipe working directory is invalid.' });
};

const candidateWorkingDirectory = (
  repository: CanonicalRepository,
  relativePath: RepositoryRelativeWindowsDirectory
): BrokerResult<string> => {
  if (!isCanonicalLocalWindowsAbsolutePath(repository)) {
    return brokerErr({ code: 'repository-invalid', message: 'Canonical repository path is invalid.' });
  }
  const candidate = relativePath.value === '.'
    ? repository
    : win32.join(repository, ...relativePath.value.split('/'));
  return isCanonicalLocalWindowsAbsolutePath(candidate)
    ? brokerOk(candidate)
    : brokerErr({ code: 'process-plan-invalid', message: 'Recipe working directory is invalid.' });
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeObservation = (value: unknown): WindowsExecutionDirectoryObservation | null => {
  if (!isRecord(value)) return null;
  const requestedPath = Reflect.get(value, 'requestedPath');
  const canonicalPath = Reflect.get(value, 'canonicalPath');
  const kind = Reflect.get(value, 'kind');
  const traversesReparsePoint = Reflect.get(value, 'traversesReparsePoint');
  return typeof requestedPath === 'string' &&
    (typeof canonicalPath === 'string' || canonicalPath === null) &&
    (kind === 'directory' || kind === 'regular-file' || kind === 'other' || kind === 'missing') &&
    typeof traversesReparsePoint === 'boolean'
    ? { requestedPath, canonicalPath, kind, traversesReparsePoint }
    : null;
};

const decodeFacts = (value: unknown): WindowsExecutionDirectoryFacts | null => {
  if (!isRecord(value)) return null;
  const platform = Reflect.get(value, 'platform');
  const repository = decodeObservation(Reflect.get(value, 'repository'));
  const workingDirectory = decodeObservation(Reflect.get(value, 'workingDirectory'));
  return typeof platform === 'string' && repository !== null && workingDirectory !== null
    ? { platform, repository, workingDirectory }
    : null;
};

const pathIsContainedBy = (repository: string, candidate: string): boolean => {
  const relative = win32.relative(repository, candidate);
  return relative === '' || (!relative.startsWith(`..${win32.sep}`) && relative !== '..' &&
    !win32.isAbsolute(relative));
};

const exactDirectoryObservation = (
  observation: WindowsExecutionDirectoryObservation,
  requestedPath: string
): boolean => observation.requestedPath === requestedPath && observation.kind === 'directory' &&
  !observation.traversesReparsePoint && observation.canonicalPath === requestedPath &&
  isCanonicalLocalWindowsAbsolutePath(observation.canonicalPath);

const projectFacts = (
  repository: CanonicalRepository,
  relativePath: RepositoryRelativeWindowsDirectory,
  candidate: string,
  value: unknown
): BrokerResult<CanonicalWindowsWorkingDirectory> => {
  const facts = decodeFacts(value);
  return facts !== null && facts.platform === 'win32' &&
    exactDirectoryObservation(facts.repository, repository) &&
    exactDirectoryObservation(facts.workingDirectory, candidate) &&
    pathIsContainedBy(repository, candidate) &&
    pathIsContainedBy(facts.repository.canonicalPath ?? '', facts.workingDirectory.canonicalPath ?? '')
    ? brokerOk({
        kind: 'canonical-windows-working-directory',
        value: candidate,
        repository,
        relativePath
      })
    : brokerErr({
        code: 'repository-invalid',
        message: 'Recipe working directory could not be proved canonical and repository-contained.'
      });
};

const inspectWorkingDirectory = (
  repository: CanonicalRepository,
  relativePath: RepositoryRelativeWindowsDirectory,
  candidate: string,
  facts: WindowsExecutionDirectoryFactsPort
): Promise<BrokerResult<CanonicalWindowsWorkingDirectory>> => Promise.resolve()
  .then(() => facts.inspect({ repositoryPath: repository, workingDirectoryPath: candidate }))
  .then(
    observation => projectFacts(repository, relativePath, candidate, observation),
    () => brokerErr({
      code: 'repository-invalid',
      message: 'Recipe working directory inspection is unavailable.'
    })
  );

const resolveWorkingDirectory = (
  request: WindowsExecutionWorkingDirectoryRequest,
  facts: WindowsExecutionDirectoryFactsPort
): Promise<BrokerResult<CanonicalWindowsWorkingDirectory>> => {
  const relativePath = parseRepositoryRelativeWindowsDirectory(request.declaredCwd);
  if (relativePath.isErr()) return Promise.resolve(brokerErr(...relativePath.error));
  const candidate = candidateWorkingDirectory(request.repository, relativePath.value);
  return candidate.isErr()
    ? Promise.resolve(brokerErr(...candidate.error))
    : inspectWorkingDirectory(request.repository, relativePath.value, candidate.value, facts);
};

export const createWindowsExecutionPathResolver = (
  facts: WindowsExecutionDirectoryFactsPort
): WindowsExecutionPathResolverPort => ({
  resolveWorkingDirectory: request => resolveWorkingDirectory(request, facts)
});
