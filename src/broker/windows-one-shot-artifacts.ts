import { createHash } from 'node:crypto';
import { mkdir, open, rmdir, unlink } from 'node:fs/promises';
import { win32 } from 'node:path';

import type {
  WindowsFilesystemPathFactsPort,
  WindowsFilesystemPathObservation
} from './bun-windows-filesystem-facts.ts';
import type { TrustedProfileRoot } from './journal.ts';
import type { ProcessAttemptId } from './primitives.ts';
import { parseProcessAttemptId } from './primitives.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';
import { isCanonicalLocalWindowsAbsolutePath } from './windows-execution-paths.ts';

export const WINDOWS_ONE_SHOT_ARTIFACT_FORMAT =
  'windows-one-shot-artifacts/v1' as const;

const ARTIFACT_SEGMENTS = [
  'epsilonode',
  'nebular',
  'broker',
  'v1',
  'one-shot-runs'
] as const;

const EMPTY_PATHS: readonly string[] = Object.freeze([]);

export type WindowsOneShotArtifactPlan = Readonly<{
  format: typeof WINDOWS_ONE_SHOT_ARTIFACT_FORMAT;
  attemptId: ProcessAttemptId;
  attemptDigest: string;
  trustedProfileRoot: TrustedProfileRoot;
  directory: string;
  stdoutPath: string;
  stderrPath: string;
  pidPath: string;
}>;

export type WindowsOneShotArtifactPreparationReceipt = Readonly<{
  state: 'prepared-exact-start-artifacts';
  plan: WindowsOneShotArtifactPlan;
}>;

export type WindowsOneShotArtifactReleaseReceipt = Readonly<{
  state: 'released-after-exact-cleanup';
  plan: WindowsOneShotArtifactPlan;
}>;

export type WindowsOneShotArtifactDirectoryOutcome =
  | 'created'
  | 'existing'
  | 'unavailable';

export type WindowsOneShotArtifactFileCreationOutcome =
  | 'created'
  | 'already-exists'
  | 'unavailable';

export type WindowsOneShotArtifactRemovalOutcome =
  | 'removed'
  | 'missing'
  | 'unavailable';

export type WindowsOneShotArtifactReadOutcome =
  | Readonly<{ state: 'pending' }>
  | Readonly<{ state: 'read'; text: string }>
  | Readonly<{ state: 'unavailable' }>;

export type WindowsOneShotProcessIdObservation =
  | Readonly<{ state: 'pending' }>
  | Readonly<{ state: 'ready'; processId: number }>
  | Readonly<{ state: 'invalid' | 'unavailable' }>;

export type WindowsOneShotArtifactRuntimePort = WindowsFilesystemPathFactsPort & Readonly<{
  ensureDirectory: (path: string) => Promise<WindowsOneShotArtifactDirectoryOutcome>;
  createExclusiveFile: (path: string) => Promise<WindowsOneShotArtifactFileCreationOutcome>;
  readBoundedFile: (
    path: string,
    maximumBytes: number
  ) => Promise<WindowsOneShotArtifactReadOutcome>;
  removeFile: (path: string) => Promise<WindowsOneShotArtifactRemovalOutcome>;
  removeDirectoryIfEmpty: (path: string) => Promise<WindowsOneShotArtifactRemovalOutcome>;
}>;

const artifactFailure = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'receiver-failed',
  message: 'Trusted one-shot receiver artifacts are unavailable.'
});

const validDigest = (value: string): boolean => /^(?:sha256:)?[a-f0-9]{64}$/u.test(value);

const samePath = (left: string, right: string): boolean => left === right;

const expectedPlan = (
  trustedProfileRoot: TrustedProfileRoot,
  attemptId: ProcessAttemptId,
  attemptDigest: string
): WindowsOneShotArtifactPlan => {
  const leaf = createHash('sha256').update(JSON.stringify([
    WINDOWS_ONE_SHOT_ARTIFACT_FORMAT,
    trustedProfileRoot.value.toLocaleLowerCase('en-US'),
    attemptId,
    attemptDigest
  ])).digest('hex');
  const directory = win32.join(trustedProfileRoot.value, ...ARTIFACT_SEGMENTS, leaf);
  return {
    format: WINDOWS_ONE_SHOT_ARTIFACT_FORMAT,
    attemptId,
    attemptDigest,
    trustedProfileRoot,
    directory,
    stdoutPath: win32.join(directory, 'stdout.log'),
    stderrPath: win32.join(directory, 'stderr.log'),
    pidPath: win32.join(directory, 'process.pid')
  };
};

export const planWindowsOneShotArtifacts = (
  trustedProfileRoot: TrustedProfileRoot,
  attemptId: ProcessAttemptId,
  attemptDigest: string
): BrokerResult<WindowsOneShotArtifactPlan> => {
  const parsedAttempt = parseProcessAttemptId(attemptId);
  if (parsedAttempt.isErr() || !validDigest(attemptDigest) ||
      !isCanonicalLocalWindowsAbsolutePath(trustedProfileRoot.value)) return artifactFailure();
  const plan = expectedPlan(trustedProfileRoot, parsedAttempt.value, attemptDigest);
  return [plan.directory, plan.stdoutPath, plan.stderrPath, plan.pidPath]
    .every(isCanonicalLocalWindowsAbsolutePath)
    ? brokerOk(plan)
    : artifactFailure();
};

export const validateWindowsOneShotArtifactPlan = (
  plan: WindowsOneShotArtifactPlan
): boolean => {
  const expected = planWindowsOneShotArtifacts(
    plan.trustedProfileRoot,
    plan.attemptId,
    plan.attemptDigest
  );
  return expected.isOk() &&
    samePath(plan.directory, expected.value.directory) &&
    samePath(plan.stdoutPath, expected.value.stdoutPath) &&
    samePath(plan.stderrPath, expected.value.stderrPath) &&
    samePath(plan.pidPath, expected.value.pidPath);
};

const hasProperty = <Key extends string>(
  value: object,
  key: Key
): value is object & Readonly<Record<Key, unknown>> => key in value;

const isPathObservation = (value: unknown): value is WindowsFilesystemPathObservation => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!hasProperty(value, 'requestedPath') || !hasProperty(value, 'canonicalPath') ||
      !hasProperty(value, 'kind') || !hasProperty(value, 'traversesReparsePoint')) return false;
  return typeof value.requestedPath === 'string' && typeof value.canonicalPath === 'string' &&
    (value.kind === 'directory' || value.kind === 'regular-file' || value.kind === 'other') &&
    typeof value.traversesReparsePoint === 'boolean';
};

const inspectExact = (
  runtime: WindowsOneShotArtifactRuntimePort,
  path: string,
  kind: WindowsFilesystemPathObservation['kind']
): Promise<boolean> => Promise.resolve()
  .then(() => runtime.inspectExistingPath(path))
  .then(
    observation => isPathObservation(observation) && observation.kind === kind &&
      observation.requestedPath === path && observation.canonicalPath === path &&
      !observation.traversesReparsePoint,
    () => false
  );

const directoryChain = (plan: WindowsOneShotArtifactPlan): readonly string[] => {
  const parents = ARTIFACT_SEGMENTS.reduce<readonly string[]>(
    (paths, segment) => Object.freeze([
      ...paths,
      win32.join(paths.at(-1) ?? plan.trustedProfileRoot.value, segment)
    ]),
    EMPTY_PATHS
  );
  return Object.freeze([plan.trustedProfileRoot.value, ...parents, plan.directory]);
};

const ensureExactDirectories = (
  plan: WindowsOneShotArtifactPlan,
  runtime: WindowsOneShotArtifactRuntimePort,
  directories: readonly string[] = directoryChain(plan),
  index: number = 0
): Promise<boolean> => {
  const path = directories[index];
  if (path === undefined) return Promise.resolve(true);
  const ensure = index === 0
    ? Promise.resolve<WindowsOneShotArtifactDirectoryOutcome>('existing')
    : Promise.resolve().then(() => runtime.ensureDirectory(path)).then(
        outcome => outcome,
        (): WindowsOneShotArtifactDirectoryOutcome => 'unavailable'
      );
  return ensure.then(outcome => outcome === 'unavailable'
    ? false
    : inspectExact(runtime, path, 'directory').then(exact => exact
      ? ensureExactDirectories(plan, runtime, directories, index + 1)
      : false));
};

const rollbackCreatedFiles = (
  paths: readonly string[],
  runtime: WindowsOneShotArtifactRuntimePort
): Promise<boolean> => paths.reduceRight<Promise<boolean>>(
  (removed, path) => removed.then(prior => Promise.resolve()
    .then(() => runtime.removeFile(path))
    .then(
      outcome => prior && (outcome === 'removed' || outcome === 'missing'),
      () => false
    )),
  Promise.resolve(true)
);

const createExactFiles = (
  paths: readonly string[],
  runtime: WindowsOneShotArtifactRuntimePort,
  index: number = 0,
  created: readonly string[] = []
): Promise<boolean> => {
  const path = paths[index];
  if (path === undefined) return Promise.resolve(true);
  return Promise.resolve().then(() => runtime.createExclusiveFile(path)).then(
    outcome => outcome === 'created'
      ? inspectExact(runtime, path, 'regular-file').then(exact => exact
        ? createExactFiles(paths, runtime, index + 1, [...created, path])
        : rollbackCreatedFiles([...created, path], runtime).then(() => false))
      : rollbackCreatedFiles(created, runtime).then(() => false),
    () => rollbackCreatedFiles(created, runtime).then(() => false)
  );
};

export const prepareWindowsOneShotArtifacts = (
  plan: WindowsOneShotArtifactPlan,
  runtime: WindowsOneShotArtifactRuntimePort
): Promise<BrokerResult<WindowsOneShotArtifactPreparationReceipt>> =>
  validateWindowsOneShotArtifactPlan(plan)
    ? ensureExactDirectories(plan, runtime).then(directoriesReady => directoriesReady
      ? createExactFiles([plan.stdoutPath, plan.stderrPath, plan.pidPath], runtime).then(filesReady =>
          filesReady
            ? brokerOk({ state: 'prepared-exact-start-artifacts', plan })
            : artifactFailure())
      : artifactFailure())
    : Promise.resolve(artifactFailure());

const PID_FILE_MAXIMUM_BYTES = 16;

const parseProcessIdText = (text: string): number | null => {
  if (text.length === 0 || text.length > PID_FILE_MAXIMUM_BYTES || !/^[1-9][0-9]*(?:\r?\n)?$/u.test(text)) {
    return null;
  }
  const value = Number(text.trimEnd());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

/**
 * PM2 writes this already-pinned file immediately after the process spawns.
 * It is only a candidate-PID readiness signal: callers must still prove the
 * live process incarnation and exact Windows Job membership before granting
 * any authority.
 */
export const observeWindowsOneShotProcessId = (
  plan: WindowsOneShotArtifactPlan,
  runtime: WindowsOneShotArtifactRuntimePort
): Promise<WindowsOneShotProcessIdObservation> => {
  if (!validateWindowsOneShotArtifactPlan(plan)) return Promise.resolve({ state: 'invalid' });
  return inspectExact(runtime, plan.pidPath, 'regular-file').then((
    exactBefore: boolean
  ): Promise<WindowsOneShotProcessIdObservation> | WindowsOneShotProcessIdObservation => exactBefore
    ? Promise.resolve().then(() => runtime.readBoundedFile(plan.pidPath, PID_FILE_MAXIMUM_BYTES)).then(
        read => {
          if (read.state !== 'read') return read;
          const processId = parseProcessIdText(read.text);
          return inspectExact(runtime, plan.pidPath, 'regular-file').then((
            exactAfter: boolean
          ): WindowsOneShotProcessIdObservation => exactAfter && processId !== null
            ? { state: 'ready' as const, processId }
            : { state: 'invalid' as const });
        },
        () => ({ state: 'unavailable' as const })
      )
    : { state: 'unavailable' as const });
};

const removeExactFiles = (
  paths: readonly string[],
  runtime: WindowsOneShotArtifactRuntimePort
): Promise<boolean> => paths.reduce<Promise<boolean>>(
  (removed, path) => removed.then(prior => Promise.resolve()
    .then(() => runtime.removeFile(path))
    .then(
      outcome => prior && (outcome === 'removed' || outcome === 'missing'),
      () => false
    )),
  Promise.resolve(true)
);

export const releaseWindowsOneShotArtifacts = (
  plan: WindowsOneShotArtifactPlan,
  runtime: WindowsOneShotArtifactRuntimePort
): Promise<BrokerResult<WindowsOneShotArtifactReleaseReceipt>> => {
  if (!validateWindowsOneShotArtifactPlan(plan)) return Promise.resolve(artifactFailure());
  return removeExactFiles([plan.stdoutPath, plan.stderrPath, plan.pidPath], runtime).then(filesRemoved =>
    Promise.resolve().then(() => runtime.removeDirectoryIfEmpty(plan.directory)).then(
      directory => filesRemoved && (directory === 'removed' || directory === 'missing')
        ? brokerOk({ state: 'released-after-exact-cleanup', plan })
        : artifactFailure(),
      (): BrokerResult<WindowsOneShotArtifactReleaseReceipt> =>
        artifactFailure<WindowsOneShotArtifactReleaseReceipt>()
    ));
};

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
};

export const createNodeWindowsOneShotArtifactRuntime = (
  facts: WindowsFilesystemPathFactsPort
): WindowsOneShotArtifactRuntimePort => ({
  inspectExistingPath: facts.inspectExistingPath,
  ensureDirectory: path => mkdir(path).then(
    () => 'created' as const,
    error => errorCode(error) === 'EEXIST' ? 'existing' as const : 'unavailable' as const
  ),
  createExclusiveFile: path => open(path, 'wx', 0o600).then(
    handle => handle.close().then(
      () => 'created' as const,
      () => handle.close().then(
        () => undefined,
        () => undefined
      ).then(() => unlink(path)).then(
        () => 'unavailable' as const,
        () => 'unavailable' as const
      )
    ),
    error => errorCode(error) === 'EEXIST' ? 'already-exists' as const : 'unavailable' as const
  ),
  // Node FileHandle/Stats are mutable host capabilities confined to this adapter.
  readBoundedFile: (path, maximumBytes) => open(path, 'r').then(
    // eslint-disable-next-line functional/prefer-immutable-types
    handle => handle.stat().then(stat => {
      if (!stat.isFile() || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || stat.size > maximumBytes) {
        return { state: 'unavailable' as const };
      }
      if (stat.size === 0) return { state: 'pending' as const };
      return handle.readFile({ encoding: 'ascii' }).then((text: string): WindowsOneShotArtifactReadOutcome =>
        text.length <= maximumBytes
        ? { state: 'read' as const, text }
        : { state: 'unavailable' as const });
    }).then(
      result => handle.close().then(() => result, () => ({ state: 'unavailable' as const })),
      () => handle.close().then(
        () => ({ state: 'unavailable' as const }),
        () => ({ state: 'unavailable' as const })
      )
    ),
    (error: unknown): WindowsOneShotArtifactReadOutcome => errorCode(error) === 'ENOENT'
      ? { state: 'pending' as const }
      : { state: 'unavailable' as const }
  ),
  removeFile: path => unlink(path).then(
    () => 'removed' as const,
    error => errorCode(error) === 'ENOENT' ? 'missing' as const : 'unavailable' as const
  ),
  removeDirectoryIfEmpty: path => rmdir(path).then(
    () => 'removed' as const,
    error => errorCode(error) === 'ENOENT' ? 'missing' as const : 'unavailable' as const
  )
});
