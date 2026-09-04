import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  PM2_WINDOWS_RPC_PIPE,
  allocateOneShotAttempt,
  createBunWindowsNamedJobNativePort,
  createBunWindowsProcessNativePort,
  createNodeNetPm2ApplicationRpcClient,
  createOneShotSlotPool,
  createPm2ExactNameOneShotPorts,
  createPm2ProtocolCompatibilityRuntimePort,
  createWindowsKnownFolderLocalApplicationDataPort,
  createWindowsNamedJobContainmentPort,
  createWindowsNamedMutexAllocationPort,
  derivePm2ManagedWindowsContainment,
  parseProcessAttemptId,
  pm2OneShotMetadataDigest,
  probePm2Prerequisite,
  readWindowsProcessIncarnation,
  requestOneShotCancellation,
  type OneShotAttemptHandle,
  type OneShotCleanupProof,
  type OneShotLaunchAllocationPort,
  type OneShotSlotDefinition,
  type Pm2ApplicationRpcClientPort,
  type Pm2ProjectedProcess,
  type ProcessIncarnation,
  type WindowsNamedJobIdentity
} from '../../src/broker/public.ts';

const LIVE_OPT_IN = 'NEBULAR_PM2_WINDOWS_JOB_LIVE';
const READY_FORMAT = 'pm2-windows-job-target-ready/v1';

type TargetObservation =
  | Readonly<{
      outcome: 'contained';
      rootProcessId: number;
      descendantProcessId: number;
    }>
  | Readonly<{
      outcome: 'precontained-other-job' | 'containment-unavailable';
      rootProcessId: number;
    }>;

const failed = (message: string): false => {
  console.error(message);
  return false;
};

const processId = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 0xffff_ffff ? parsed : undefined;
};

const parseTargetObservation = (value: string): TargetObservation | undefined => {
  const contained = new RegExp(
    `^\\{"format":"${READY_FORMAT}","outcome":"contained","rootProcessId":(?<root>[1-9][0-9]{0,9}),` +
    '"descendantProcessId":(?<descendant>[1-9][0-9]{0,9})\\}$',
    'u'
  ).exec(value);
  const rootProcessId = processId(contained?.groups?.['root']);
  const descendantProcessId = processId(contained?.groups?.['descendant']);
  if (rootProcessId !== undefined && descendantProcessId !== undefined) {
    return { outcome: 'contained', rootProcessId, descendantProcessId };
  }
  const rejected = new RegExp(
    `^\\{"format":"${READY_FORMAT}","outcome":"(?<outcome>precontained-other-job|containment-unavailable)",` +
    '"rootProcessId":(?<root>[1-9][0-9]{0,9})\\}$',
    'u'
  ).exec(value);
  const rejectedRoot = processId(rejected?.groups?.['root']);
  const outcome = rejected?.groups?.['outcome'];
  return rejectedRoot !== undefined &&
    (outcome === 'precontained-other-job' || outcome === 'containment-unavailable')
    ? { outcome, rootProcessId: rejectedRoot }
    : undefined;
};

const readTargetObservation = (
  path: string,
  attemptsRemaining = 200
): Promise<TargetObservation | undefined> => readFile(path, 'utf8').then(
  value => parseTargetObservation(value),
  () => undefined
).then(observed => observed !== undefined || attemptsRemaining <= 1
  ? observed
  : delay(25).then(() => readTargetObservation(path, attemptsRemaining - 1)));

const observeProcess = (processIdValue: number) => readWindowsProcessIncarnation(
  { processId: processIdValue },
  createBunWindowsProcessNativePort(),
  process.platform
);

const exactProcessExited = async (
  processIdValue: number,
  incarnation: ProcessIncarnation,
  attemptsRemaining = 200
): Promise<boolean> => {
  const observed = await observeProcess(processIdValue);
  if (observed.status === 'stopped' || observed.status === 'missing') return true;
  if (observed.status === 'running' && observed.incarnation.value !== incarnation.value) return true;
  if (attemptsRemaining <= 1) return false;
  await delay(25);
  return exactProcessExited(processIdValue, incarnation, attemptsRemaining - 1);
};

const exactJobNameMissing = async (
  job: WindowsNamedJobIdentity,
  attemptsRemaining = 100
): Promise<boolean> => {
  const opened = await createBunWindowsNamedJobNativePort().openTermination(job);
  if (opened.status === 'missing') return true;
  if (opened.status === 'opened') await opened.session.close();
  if (attemptsRemaining <= 1) return false;
  await delay(25);
  return exactJobNameMissing(job, attemptsRemaining - 1);
};

const exactHandle = (process: Pm2ProjectedProcess, handle: OneShotAttemptHandle): boolean =>
  process.name === handle.processName.value && process.pmId === handle.pmId &&
  process.ownership.kind === 'owned' && process.ownership.slotId === handle.slotId.value &&
  process.ownership.attemptId === handle.attemptId && process.ownership.metadataDigest === handle.metadataDigest;

const readExactPm2Process = async (
  rpc: Pm2ApplicationRpcClientPort,
  slot: OneShotSlotDefinition
): Promise<Pm2ProjectedProcess | undefined> => {
  const observed = await rpc.execute({
    endpoint: PM2_WINDOWS_RPC_PIPE,
    timeoutMs: 2_000,
    operation: { method: 'getMonitorData', allowedNames: [slot.processName.value] }
  });
  return observed.outcome === 'success' && observed.value.method === 'getMonitorData' &&
    observed.value.processes.length === 1
    ? observed.value.processes.at(0)
    : undefined;
};

const waitExactPm2Terminal = async (
  rpc: Pm2ApplicationRpcClientPort,
  slot: OneShotSlotDefinition,
  handle: OneShotAttemptHandle,
  attemptsRemaining = 100
): Promise<Pm2ProjectedProcess | undefined> => {
  const process = await readExactPm2Process(rpc, slot);
  if (process !== undefined && exactHandle(process, handle) &&
      (process.status === 'stopped' || process.status === 'errored')) return process;
  if (attemptsRemaining <= 1) return undefined;
  await delay(25);
  return waitExactPm2Terminal(rpc, slot, handle, attemptsRemaining - 1);
};

const main = async (): Promise<boolean> => {
  if (process.platform !== 'win32' || typeof Bun === 'undefined') {
    return failed('The PM2 Windows Job live proof requires Bun on Windows.');
  }
  const projectRoot = resolve(import.meta.dir, '../..');
  const suffix = randomBytes(6).toString('hex');
  const namespace = `nebular-job-${suffix}`;
  const pool = createOneShotSlotPool(namespace, 1);
  if (pool.outcome === 'failure') return failed('The live PM2 Job slot namespace was not admitted.');
  const slot = pool.value.slots.at(0);
  if (slot === undefined) return failed('The live PM2 Job slot was unavailable.');
  const attemptId = parseProcessAttemptId(`live-${suffix}`);
  if (attemptId.isErr()) return failed('The live PM2 Job attempt identity was not admitted.');
  const attempt = {
    attemptId: attemptId.value,
    attemptDigest: createHash('sha256')
      .update(`epsilonode-nebular-pm2-job-live/v1\0${suffix}`)
      .digest('hex')
  };
  const trustedProfile = await createWindowsKnownFolderLocalApplicationDataPort().resolveCurrentUserRoot();
  if (trustedProfile.type === 'err') return failed('The trusted current-user Job scope was unavailable.');
  const containment = derivePm2ManagedWindowsContainment({
    trustedProfileRoot: trustedProfile.value,
    namespace
  }, attempt);
  if (containment.outcome === 'failure') return failed('The live PM2 Job identity was not admitted.');

  const generatedRoot = resolve(projectRoot, '.generated', 'live', 'pm2-job');
  const attemptRoot = resolve(generatedRoot, namespace);
  const relativeAttemptRoot = relative(generatedRoot, attemptRoot);
  if (relativeAttemptRoot.startsWith('..') || isAbsolute(relativeAttemptRoot)) {
    return failed('The live PM2 Job output root escaped its generated directory.');
  }
  await mkdir(attemptRoot, { recursive: true });
  const readyPath = resolve(attemptRoot, 'target-ready.json');
  const payload = {
    executablePath: process.execPath,
    cwd: projectRoot,
    args: [
      resolve(import.meta.dir, 'fixtures', 'pm2-windows-job-target.ts'),
      '--pm2-windows-job-target',
      readyPath
    ],
    stdoutPath: resolve(attemptRoot, 'stdout.log'),
    stderrPath: resolve(attemptRoot, 'stderr.log'),
    pidPath: resolve(attemptRoot, 'process.pid'),
    nonsecretEnvironment: [] as const,
    managedContainment: containment.value,
    managedBootstrap: {
      format: 'pm2-managed-bun-recipe-bootstrap/v1' as const,
      brokerEntrypoint: {
        kind: 'canonical-broker-entrypoint' as const,
        value: resolve(projectRoot, 'broker.ts')
      }
    }
  };
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + 30_000;
  const launch = {
    attemptId: attemptId.value,
    metadataDigest: pm2OneShotMetadataDigest(attemptId.value, payload, startedAtMs, deadlineAtMs),
    startedAtMs,
    deadlineAtMs,
    payload
  };
  const rpc = createNodeNetPm2ApplicationRpcClient();
  const compatibilityRuntime = createPm2ProtocolCompatibilityRuntimePort();
  let cleanupConfirmed = false;
  let admittedHandle: OneShotAttemptHandle | undefined;
  const sameHandle = (candidate: OneShotAttemptHandle): boolean => admittedHandle !== undefined &&
    candidate.slotId.value === admittedHandle.slotId.value && candidate.processName.value === admittedHandle.processName.value &&
    candidate.attemptId === admittedHandle.attemptId && candidate.metadataDigest === admittedHandle.metadataDigest &&
    candidate.pmId === admittedHandle.pmId;
  const cleanupProof = (candidate: OneShotAttemptHandle): Promise<OneShotCleanupProof> => Promise.resolve(
    cleanupConfirmed && sameHandle(candidate) ? 'confirmed' : 'unconfirmed'
  );
  const ports = createPm2ExactNameOneShotPorts({
    endpoint: PM2_WINDOWS_RPC_PIPE,
    timeoutMs: 2_000,
    namespace,
    allowedNonsecretEnvironmentNames: [],
    killRetryTimeMs: 100
  }, {
    rpc,
    compatibility: {
      probeCompatible: () => probePm2Prerequisite({
        controlSurface: { kind: 'named-pipe', endpoint: PM2_WINDOWS_RPC_PIPE },
        timeoutMs: 2_000
      }, compatibilityRuntime).then(status => status.status === 'compatible')
    },
    cleanupProofs: { readProof: cleanupProof },
    allocation: createWindowsNamedMutexAllocationPort<typeof payload>({
      namespace,
      trustedProfileRoot: trustedProfile.value,
      timeoutMs: 2_000
    })
  });
  const allocation: OneShotLaunchAllocationPort = {
    allocateLaunch: () => Promise.resolve({ outcome: 'success', value: undefined })
  };
  let deleted = false;

  try {
    const started = await allocateOneShotAttempt(pool.value, launch, ports, allocation);
    if (started.outcome === 'failure' || started.value.binding.status !== 'finalization-required') {
      return failed('The exact-name PM2 Job launch failed before binding finalization.');
    }
    admittedHandle = started.value.handle;
    const rootProcessId = started.value.binding.processId;
    const initialPm2 = await readExactPm2Process(rpc, slot);
    const root = await observeProcess(rootProcessId);
    if (initialPm2 === undefined || !exactHandle(initialPm2, admittedHandle) || initialPm2.pid !== rootProcessId ||
        initialPm2.ownership.kind !== 'owned' ||
        initialPm2.ownership.managedContainment.jobIdentity !== containment.value.jobIdentity.value ||
        initialPm2.ownership.managedBootstrap.brokerEntrypoint !== payload.managedBootstrap.brokerEntrypoint.value ||
        root.status !== 'running') {
      return failed('The broker could not observe the exact PM2 PID/incarnation and managed authority.');
    }
    const target = await readTargetObservation(readyPath);
    if (target === undefined) return failed('The PM2 target did not publish a bounded first-effect result.');
    if (target.outcome !== 'contained') {
      return failed(target.outcome === 'precontained-other-job'
        ? 'PM2 launched the target inside another Windows Job; first-effect assignment correctly rejected it.'
        : 'The PM2 target could not establish or diagnose first-effect Job containment.');
    }
    if (target.rootProcessId !== rootProcessId) {
      return failed('The target-reported root PID did not match the exact PM2 binding.');
    }
    const descendant = await observeProcess(target.descendantProcessId);
    if (descendant.status !== 'running') return failed('The target descendant was not observable by exact incarnation.');
    const containmentPort = createWindowsNamedJobContainmentPort({
      trustedProfileRoot: trustedProfile.value,
      namespace
    });
    const [verifiedRoot, verifiedDescendant] = await Promise.all([
      containmentPort.verifyExactProcess({
        ...attempt,
        processId: rootProcessId,
        processIncarnation: root.incarnation
      }),
      containmentPort.verifyExactProcess({
        ...attempt,
        processId: target.descendantProcessId,
        processIncarnation: descendant.incarnation
      })
    ]);
    if (verifiedRoot.isErr() || verifiedDescendant.isErr()) {
      return failed('Read-only broker verification did not prove the exact PM2 root-plus-descendant Job.');
    }

    const stopped = await ports.stopExact(admittedHandle);
    if (stopped.outcome === 'failure') return failed('The exact-name PM2 stop was rejected.');
    const terminal = await waitExactPm2Terminal(rpc, slot, admittedHandle);
    if (terminal === undefined || terminal.exitCode === undefined || !Number.isSafeInteger(terminal.exitCode)) {
      return failed('PM2 did not expose a typed terminal exit code for the exact stopped attempt.');
    }
    const [rootExited, descendantExited, jobMissing] = await Promise.all([
      exactProcessExited(rootProcessId, root.incarnation),
      exactProcessExited(target.descendantProcessId, descendant.incarnation),
      exactJobNameMissing(containment.value.jobIdentity)
    ]);
    if (!rootExited || !descendantExited || !jobMissing) {
      return failed('PM2 stop did not prove exact root exit, Job close, and descendant exit.');
    }

    cleanupConfirmed = true;
    const confirmed = await requestOneShotCancellation(pool.value, admittedHandle, ports);
    if (confirmed.outcome === 'failure' || confirmed.value.state !== 'terminal-cleanup-confirmed' ||
        confirmed.value.cleanupReceipt === undefined) {
      return failed('The proven Job teardown did not produce an exact cleanup receipt.');
    }
    const deletion = await ports.deleteExact(admittedHandle, confirmed.value.cleanupReceipt);
    if (deletion.outcome === 'failure') return failed('PM2 refused exact record deletion after cleanup proof.');
    deleted = true;
    const absent = await rpc.execute({
      endpoint: PM2_WINDOWS_RPC_PIPE,
      timeoutMs: 2_000,
      operation: { method: 'getMonitorData', allowedNames: [slot.processName.value] }
    });
    if (absent.outcome === 'failure' || absent.value.method !== 'getMonitorData' ||
        absent.value.processes.length !== 0) return failed('The exact PM2 record remained after proven deletion.');

    console.log(`PM2 launch was compatible with first-effect Job assignment; exact stop produced terminal exit ${
      terminal.exitCode.toString(10)
    }, closed the Job, and terminated the descendant before record deletion.`);
    return true;
  } finally {
    if (!deleted && admittedHandle !== undefined) {
      const observed = await readExactPm2Process(rpc, slot);
      if (observed !== undefined && exactHandle(observed, admittedHandle) && observed.status === 'online') {
        await ports.stopExact(admittedHandle);
      }
    }
    if (deleted) await rm(attemptRoot, { recursive: true, force: true });
  }
};

if (process.env[LIVE_OPT_IN] !== '1') {
  console.log(`PM2 Windows Job live proof skipped (opt in with ${LIVE_OPT_IN}=1).`);
} else if (!(await main())) {
  process.exitCode = 1;
}
