import { win32 } from 'node:path';

import type { CanonicalRepository } from './primitives.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';
import {
  isCanonicalLocalWindowsAbsolutePath,
  type CanonicalWindowsWorkingDirectory
} from './windows-execution-paths.ts';

export const COOPERATIVE_BUN_TOOL_DECLARATION = 'bun' as const;

export type CanonicalCurrentBunExecutable = Readonly<{
  kind: 'canonical-current-bun-executable';
  value: string;
}>;

export type CanonicalBrokerEntrypoint = Readonly<{
  kind: 'canonical-broker-entrypoint';
  value: string;
}>;

export type RepositoryRelativeWindowsTargetEntrypoint = Readonly<{
  kind: 'repository-relative-windows-target-entrypoint';
  value: string;
}>;

export type CanonicalWindowsTargetEntrypoint = Readonly<{
  kind: 'canonical-windows-target-entrypoint';
  value: string;
  repository: CanonicalRepository;
  workingDirectory: CanonicalWindowsWorkingDirectory;
  relativePath: RepositoryRelativeWindowsTargetEntrypoint;
}>;

export type ResolvedCooperativeBunTool = Readonly<{
  kind: 'cooperative-bun-v1';
  executable: CanonicalCurrentBunExecutable;
  brokerEntrypoint: CanonicalBrokerEntrypoint;
}>;

export type WindowsExecutionToolResolutionRequest = Readonly<{
  declaredTool: string;
}>;

export type WindowsExecutionToolRegistryPort = Readonly<{
  resolve: (
    request: WindowsExecutionToolResolutionRequest
  ) => Promise<BrokerResult<ResolvedCooperativeBunTool>>;
}>;

export type WindowsExecutionToolRegistryOptions = Readonly<{
  /** Fixed by the privileged composition root; never copied from a recipe or repository. */
  brokerEntrypointPath: string;
}>;

export type WindowsExecutionProcessFacts = Readonly<{
  platform: string;
  runtime: 'bun' | 'unsupported';
  executablePath: string;
}>;

export type WindowsExecutionFileObservation = Readonly<{
  role: 'current-bun-executable' | 'broker-entrypoint' | 'target-entrypoint';
  requestedPath: string;
  canonicalPath: string | null;
  kind: 'regular-file' | 'directory' | 'other' | 'missing';
  traversesReparsePoint: boolean;
}>;

export type WindowsExecutionFileInspectionRequest = Readonly<{
  role: WindowsExecutionFileObservation['role'];
  path: string;
}>;

export type WindowsExecutionFileFactsPort = Readonly<{
  inspectExistingFile: (request: WindowsExecutionFileInspectionRequest) => Promise<unknown>;
}>;

/**
 * The runtime has no ambient resolver operation by design: no PATH, PATHEXT,
 * `where`, shell, package manifest, or repository override can participate.
 */
export type WindowsExecutionToolRuntimePort = WindowsExecutionFileFactsPort & Readonly<{
  currentProcess: () => unknown;
}>;

export type WindowsExecutionTargetEntrypointRequest = Readonly<{
  repository: CanonicalRepository;
  workingDirectory: CanonicalWindowsWorkingDirectory;
  declaredEntrypoint: string;
}>;

export type WindowsExecutionTargetEntrypointResolverPort = Readonly<{
  resolveTargetEntrypoint: (
    request: WindowsExecutionTargetEntrypointRequest
  ) => Promise<BrokerResult<CanonicalWindowsTargetEntrypoint>>;
}>;

export const readCurrentWindowsExecutionProcessFacts = (): WindowsExecutionProcessFacts => ({
  platform: process.platform,
  runtime: typeof Bun === 'object' && typeof Bun.version === 'string' ? 'bun' : 'unsupported',
  executablePath: process.execPath
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeProcessFacts = (value: unknown): WindowsExecutionProcessFacts | null => {
  if (!isRecord(value)) return null;
  const platform = Reflect.get(value, 'platform');
  const runtime = Reflect.get(value, 'runtime');
  const executablePath = Reflect.get(value, 'executablePath');
  return typeof platform === 'string' && (runtime === 'bun' || runtime === 'unsupported') &&
    typeof executablePath === 'string'
    ? { platform, runtime, executablePath }
    : null;
};

const decodeFileObservation = (value: unknown): WindowsExecutionFileObservation | null => {
  if (!isRecord(value)) return null;
  const role = Reflect.get(value, 'role');
  const requestedPath = Reflect.get(value, 'requestedPath');
  const canonicalPath = Reflect.get(value, 'canonicalPath');
  const kind = Reflect.get(value, 'kind');
  const traversesReparsePoint = Reflect.get(value, 'traversesReparsePoint');
  return (role === 'current-bun-executable' || role === 'broker-entrypoint' ||
    role === 'target-entrypoint') &&
    typeof requestedPath === 'string' &&
    (typeof canonicalPath === 'string' || canonicalPath === null) &&
    (kind === 'regular-file' || kind === 'directory' || kind === 'other' || kind === 'missing') &&
    typeof traversesReparsePoint === 'boolean'
    ? { role, requestedPath, canonicalPath, kind, traversesReparsePoint }
    : null;
};

const exactCanonicalFile = (
  value: unknown,
  role: WindowsExecutionFileObservation['role'],
  requestedPath: string
): boolean => {
  const observation = decodeFileObservation(value);
  return observation !== null && observation.role === role && observation.requestedPath === requestedPath &&
    observation.kind === 'regular-file' && !observation.traversesReparsePoint &&
    observation.canonicalPath === requestedPath &&
    isCanonicalLocalWindowsAbsolutePath(observation.canonicalPath);
};

const unsupported = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'receiver-incompatible',
  message: 'Recipe tool is not admitted by the Windows cooperative Bun registry.'
});

const unavailable = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'receiver-unavailable',
  message: 'Canonical Windows execution tools are unavailable.'
});

const resolveInspectedTool = (
  executablePath: string,
  brokerEntrypointPath: string,
  observations: readonly [unknown, unknown]
): BrokerResult<ResolvedCooperativeBunTool> => exactCanonicalFile(
  observations[0],
  'current-bun-executable',
  executablePath
) && exactCanonicalFile(
  observations[1],
  'broker-entrypoint',
  brokerEntrypointPath
) && executablePath !== brokerEntrypointPath
  ? brokerOk({
      kind: 'cooperative-bun-v1',
      executable: { kind: 'canonical-current-bun-executable', value: executablePath },
      brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: brokerEntrypointPath }
    })
  : unavailable();

const inspectFixedFiles = (
  executablePath: string,
  brokerEntrypointPath: string,
  runtime: WindowsExecutionToolRuntimePort
): Promise<BrokerResult<ResolvedCooperativeBunTool>> => Promise.resolve().then(() => Promise.all([
  runtime.inspectExistingFile({ role: 'current-bun-executable', path: executablePath }),
  runtime.inspectExistingFile({ role: 'broker-entrypoint', path: brokerEntrypointPath })
] as const)).then(
  (observations: readonly [unknown, unknown]) =>
    resolveInspectedTool(executablePath, brokerEntrypointPath, observations),
  () => unavailable()
);

const resolveCooperativeBun = (
  options: WindowsExecutionToolRegistryOptions,
  runtime: WindowsExecutionToolRuntimePort
): Promise<BrokerResult<ResolvedCooperativeBunTool>> => Promise.resolve()
  .then(() => runtime.currentProcess())
  .then(
    value => {
      const facts = decodeProcessFacts(value);
      return facts !== null && facts.platform === 'win32' && facts.runtime === 'bun' &&
        isCanonicalLocalWindowsAbsolutePath(facts.executablePath) &&
        isCanonicalLocalWindowsAbsolutePath(options.brokerEntrypointPath)
        ? inspectFixedFiles(facts.executablePath, options.brokerEntrypointPath, runtime)
        : unsupported<ResolvedCooperativeBunTool>();
    },
    () => unavailable<ResolvedCooperativeBunTool>()
  );

export const createWindowsExecutionToolRegistry = (
  options: WindowsExecutionToolRegistryOptions,
  runtime: WindowsExecutionToolRuntimePort
): WindowsExecutionToolRegistryPort => ({
  resolve: request => request.declaredTool === COOPERATIVE_BUN_TOOL_DECLARATION
    ? resolveCooperativeBun(options, runtime)
    : Promise.resolve(unsupported())
});

const validTargetEntrypointSegment = (segment: string): boolean => segment.length > 0 &&
  segment !== '.' && segment !== '..' && !segment.endsWith('.') && !segment.endsWith(' ') &&
  !/[<>:"|?*]/u.test(segment);

const parseTargetEntrypoint = (
  value: string
): BrokerResult<RepositoryRelativeWindowsTargetEntrypoint> => {
  const segments: readonly string[] = value.split('/');
  return value.length > 0 && value.length <= 4_096 && !value.includes('\0') &&
    !value.includes('\\') && !value.startsWith('/') && !value.startsWith('-') &&
    !/^[A-Za-z]:/u.test(value) && segments.every(validTargetEntrypointSegment) &&
    /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u.test(value)
    ? brokerOk({ kind: 'repository-relative-windows-target-entrypoint', value })
    : brokerErr({ code: 'process-plan-invalid', message: 'Recipe target entrypoint is invalid.' });
};

const pathIsContainedBy = (repository: string, candidate: string): boolean => {
  const relative = win32.relative(repository, candidate);
  return relative === '' || (!relative.startsWith(`..${win32.sep}`) && relative !== '..' &&
    !win32.isAbsolute(relative));
};

const targetCandidate = (
  request: WindowsExecutionTargetEntrypointRequest,
  relativePath: RepositoryRelativeWindowsTargetEntrypoint
): BrokerResult<string> => {
  const candidate = win32.join(request.workingDirectory.value, ...relativePath.value.split('/'));
  return request.workingDirectory.repository === request.repository &&
    isCanonicalLocalWindowsAbsolutePath(request.repository) &&
    isCanonicalLocalWindowsAbsolutePath(request.workingDirectory.value) &&
    isCanonicalLocalWindowsAbsolutePath(candidate) &&
    pathIsContainedBy(request.repository, request.workingDirectory.value) &&
    pathIsContainedBy(request.repository, candidate)
    ? brokerOk(candidate)
    : brokerErr({
        code: 'repository-invalid',
        message: 'Recipe target entrypoint is not repository-contained.'
      });
};

const targetUnavailable = (): BrokerResult<CanonicalWindowsTargetEntrypoint> => brokerErr({
  code: 'receiver-unavailable',
  message: 'Canonical Windows target entrypoint is unavailable.'
});

const projectTargetEntrypoint = (
  request: WindowsExecutionTargetEntrypointRequest,
  relativePath: RepositoryRelativeWindowsTargetEntrypoint,
  candidate: string,
  observation: unknown
): BrokerResult<CanonicalWindowsTargetEntrypoint> => exactCanonicalFile(
  observation,
  'target-entrypoint',
  candidate
)
  ? brokerOk({
      kind: 'canonical-windows-target-entrypoint',
      value: candidate,
      repository: request.repository,
      workingDirectory: request.workingDirectory,
      relativePath
    })
  : targetUnavailable();

const inspectTargetEntrypoint = (
  request: WindowsExecutionTargetEntrypointRequest,
  relativePath: RepositoryRelativeWindowsTargetEntrypoint,
  candidate: string,
  files: WindowsExecutionFileFactsPort
): Promise<BrokerResult<CanonicalWindowsTargetEntrypoint>> => Promise.resolve()
  .then(() => files.inspectExistingFile({ role: 'target-entrypoint', path: candidate }))
  .then(
    observation => projectTargetEntrypoint(request, relativePath, candidate, observation),
    targetUnavailable
  );

const resolveTargetEntrypoint = (
  request: WindowsExecutionTargetEntrypointRequest,
  files: WindowsExecutionFileFactsPort
): Promise<BrokerResult<CanonicalWindowsTargetEntrypoint>> => {
  const relativePath = parseTargetEntrypoint(request.declaredEntrypoint);
  if (relativePath.isErr()) return Promise.resolve(brokerErr(...relativePath.error));
  const candidate = targetCandidate(request, relativePath.value);
  return candidate.isErr()
    ? Promise.resolve(brokerErr(...candidate.error))
    : inspectTargetEntrypoint(request, relativePath.value, candidate.value, files);
};

export const createWindowsExecutionTargetEntrypointResolver = (
  files: WindowsExecutionFileFactsPort
): WindowsExecutionTargetEntrypointResolverPort => ({
  resolveTargetEntrypoint: request => resolveTargetEntrypoint(request, files)
});
