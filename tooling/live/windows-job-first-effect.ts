import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createWindowsKnownFolderLocalApplicationDataPort } from '../../src/broker/bun-windows-profile.ts';
import type { ProcessIncarnation } from '../../src/broker/journal.ts';
import { parseProcessAttemptId, type ProcessAttemptId } from '../../src/broker/primitives.ts';
import {
  createBunWindowsNamedJobNativePort,
  createWindowsNamedJobContainmentPort,
  deriveWindowsNamedJobIdentity,
  type WindowsNamedJobContainmentConfig,
  type WindowsNamedJobContainmentPort,
  type WindowsNamedJobIdentity
} from '../../src/broker/windows-named-job-containment.ts';
import {
  createBunWindowsProcessNativePort,
  readWindowsProcessIncarnation
} from '../../src/broker/windows-process-incarnation.ts';
import { createBunManagedWindowsJobFirstEffectGate } from '../../src/broker-client/bootstrap/bun-windows-job-first-effect.ts';
import { MANAGED_WINDOWS_JOB_ENVIRONMENT } from '../../src/broker-client/bootstrap/windows-job-first-effect.ts';

const TARGET_ARGUMENT = '--managed-windows-job-target';
const DESCENDANT_ARGUMENT = '--managed-windows-job-descendant';
const TARGET_READY = 'NEBULAR_WINDOWS_JOB_FIRST_EFFECT_READY';
const TARGET_FAILED = 'NEBULAR_WINDOWS_JOB_FIRST_EFFECT_FAILED';
const LIVE_OPT_IN = 'NEBULAR_WINDOWS_JOB_FIRST_EFFECT_LIVE';
const namespace = 'nebular-live-target-job';

type LiveAttempt = Readonly<{
  attemptId: ProcessAttemptId;
  attemptDigest: string;
}>;

type LiveAuthority = Readonly<{
  config: WindowsNamedJobContainmentConfig;
  port: WindowsNamedJobContainmentPort;
}>;

type LiveChildExit = Readonly<{
  exited: Promise<number>;
}>;

const createAttempt = (): LiveAttempt | undefined => {
  const nonce = randomUUID();
  const attemptId = parseProcessAttemptId(`live-${nonce}`);
  return attemptId.isOk()
    ? {
        attemptId: attemptId.value,
        attemptDigest: createHash('sha256')
          .update(`epsilonode-nebular-live-target-job/v1\0${nonce}`)
          .digest('hex')
      }
    : undefined;
};

const resolveAuthority = async (): Promise<LiveAuthority | undefined> => {
  const root = await createWindowsKnownFolderLocalApplicationDataPort().resolveCurrentUserRoot();
  if (root.type !== 'ok') return undefined;
  const config = {
    trustedProfileRoot: root.value,
    namespace,
    terminationPollAttempts: 40,
    terminationPollIntervalMs: 25
  } as const;
  return { config, port: createWindowsNamedJobContainmentPort(config) };
};

const runManagedTarget = async (): Promise<boolean> => {
  // First native/runtime effect: no application import or child precedes it.
  const containment = await createBunManagedWindowsJobFirstEffectGate().enter();
  if (containment.isErr()) {
    console.log(`${TARGET_FAILED}:${containment.error[0].code}`);
    return false;
  }
  const retained = await containment.value.authority.proveRetained();
  if (retained.isErr()) {
    console.log(`${TARGET_FAILED}:${retained.error[0].code}`);
    return false;
  }

  // Default Windows process creation inherits Job membership, but the Job
  // HANDLE itself is non-inheritable because CreateJobObjectW received NULL
  // security attributes. Only this root owns the opaque lifetime anchor.
  const descendant = Bun.spawn({
    cmd: [process.execPath, import.meta.path, DESCENDANT_ARGUMENT],
    cwd: resolve(import.meta.dir, '..', '..'),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  });
  console.log(`${TARGET_READY}:${descendant.pid}`);
  await delay(30_000);

  // This later reference keeps the anchor reachable for the target lifetime.
  const finalProof = await containment.value.authority.proveRetained();
  return finalProof.isOk();
};

const runDescendant = async (): Promise<boolean> => {
  await delay(30_000);
  return true;
};

const readTargetProof = async (
  stdout: ReadableStream<Uint8Array>
): Promise<number | undefined> => {
  const reader = stdout.getReader();
  const outcome = await Promise.race([
    reader.read().then(chunk => ({ status: 'read' as const, chunk })),
    delay(5_000).then(() => ({ status: 'timeout' as const }))
  ]);
  reader.releaseLock();
  if (outcome.status !== 'read' || outcome.chunk.done) return undefined;
  const message = new TextDecoder().decode(outcome.chunk.value);
  if (message.includes(TARGET_FAILED)) console.error(message.trim());
  const matched = new RegExp(`${TARGET_READY}:(?<processId>[1-9][0-9]{0,9})`, 'u').exec(message);
  const processId = Number(matched?.groups?.['processId']);
  return Number.isSafeInteger(processId) && processId > 0 && processId <= 0xffff_ffff
    ? processId
    : undefined;
};

const observeProcess = async (processId: number) => readWindowsProcessIncarnation(
  { processId },
  createBunWindowsProcessNativePort(),
  process.platform
);

const boundedExit = async (child: LiveChildExit): Promise<boolean> => {
  const outcome = await Promise.race([
    child.exited.then(() => ({ status: 'exited' as const })),
    delay(5_000).then(() => ({ status: 'timeout' as const }))
  ]);
  return outcome.status === 'exited';
};

const exactProcessExited = async (
  processId: number,
  incarnation: ProcessIncarnation,
  attemptsRemaining = 100
): Promise<boolean> => {
  const observed = await observeProcess(processId);
  if (observed.status === 'stopped' || observed.status === 'missing') return true;
  if (observed.status === 'running' && observed.incarnation.value !== incarnation.value) return true;
  if (attemptsRemaining <= 1) return false;
  await delay(25);
  return exactProcessExited(processId, incarnation, attemptsRemaining - 1);
};

const exactJobNameMissing = async (
  job: WindowsNamedJobIdentity,
  attemptsRemaining = 40
): Promise<boolean> => {
  const opened = await createBunWindowsNamedJobNativePort().openTermination(job);
  if (opened.status === 'missing') return true;
  if (opened.status === 'opened') await opened.session.close();
  if (attemptsRemaining <= 1) return false;
  await delay(25);
  return exactJobNameMissing(job, attemptsRemaining - 1);
};

const exactTreePolicyAndCountProven = async (
  job: WindowsNamedJobIdentity,
  minimumActiveProcesses: number
): Promise<boolean> => {
  const opened = await createBunWindowsNamedJobNativePort().openTermination(job);
  if (opened.status !== 'opened') return false;
  const [policy, active] = await Promise.all([
    opened.session.queryPolicy(),
    opened.session.queryActiveProcesses()
  ]);
  const closed = await opened.session.close();
  if (policy.status !== 'compatible' || active.status !== 'observed' ||
      active.activeProcesses < minimumActiveProcesses || !closed) {
    console.error(`Exact tree diagnostic: policy=${policy.status}; active=${
      active.status === 'observed' ? active.activeProcesses.toString(10) : active.status
    }; closed=${closed.toString()}.`);
  }
  return closed && policy.status === 'compatible' && active.status === 'observed' &&
    active.activeProcesses >= minimumActiveProcesses;
};

const stopExactProcess = async (
  processId: number | undefined,
  incarnation: ProcessIncarnation | undefined
): Promise<void> => {
  if (processId === undefined || incarnation === undefined) return;
  const observed = await observeProcess(processId);
  if (observed.status !== 'running' || observed.incarnation.value !== incarnation.value) return;
  try {
    process.kill(processId);
  } catch {
    // Bounded best-effort cleanup for a live-only process created by this proof.
  }
};

const runParentProof = async (): Promise<boolean> => {
  const attempt = createAttempt();
  const authority = await resolveAuthority();
  if (attempt === undefined || authority === undefined) return false;
  const job = deriveWindowsNamedJobIdentity(authority.config, attempt);
  if (job.isErr()) return false;
  const child = Bun.spawn({
    cmd: [process.execPath, import.meta.path, TARGET_ARGUMENT],
    cwd: resolve(import.meta.dir, '..', '..'),
    detached: true,
    env: {
      [LIVE_OPT_IN]: '1',
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: job.value.value,
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: attempt.attemptId
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  });
  let descendantProcessId: number | undefined;
  let descendantIncarnation: ProcessIncarnation | undefined;
  let rootExited = false;

  try {
    descendantProcessId = await readTargetProof(child.stdout);
    if (descendantProcessId === undefined) {
      console.error('Managed Windows target stopped before retained containment and child creation.');
      return false;
    }
    const [root, descendant] = await Promise.all([
      observeProcess(child.pid),
      observeProcess(descendantProcessId)
    ]);
    if (root.status !== 'running' || descendant.status !== 'running') {
      console.error('Managed Windows target tree stopped before exact incarnation observation.');
      return false;
    }
    descendantIncarnation = descendant.incarnation;

    // Verification reopens with query-only authority, proves exact policy and
    // membership, then closes before root exit so it cannot delay kill-on-close.
    const [verifiedRoot, verifiedDescendant] = await Promise.all([
      authority.port.verifyExactProcess({
        ...attempt,
        processId: child.pid,
        processIncarnation: root.incarnation
      }),
      authority.port.verifyExactProcess({
        ...attempt,
        processId: descendantProcessId,
        processIncarnation: descendant.incarnation
      })
    ]);
    if (verifiedRoot.isErr() || verifiedDescendant.isErr()) {
      console.error('Managed Windows target root/descendant verification failed.');
      return false;
    }
    if (!await exactTreePolicyAndCountProven(job.value, 2)) {
      console.error('Managed Windows target did not prove its exact root-plus-descendant tree.');
      return false;
    }

    child.kill();
    rootExited = await boundedExit(child);
    if (!rootExited) {
      console.error('Managed Windows root did not exit within the proof bound.');
      return false;
    }
    const afterRoot = await createBunWindowsNamedJobNativePort().openTermination(job.value);
    if (afterRoot.status === 'opened') {
      const active = await afterRoot.session.queryActiveProcesses();
      await afterRoot.session.close();
      console.error(`Exact Job name remained after root exit; active=${
        active.status === 'observed' ? active.activeProcesses.toString(10) : active.status
      }.`);
      return false;
    }
    if (afterRoot.status !== 'missing') {
      console.error('Exact Job name state was unavailable after root exit.');
      return false;
    }
    if (!await exactProcessExited(descendantProcessId, descendant.incarnation)) {
      console.error('Kill-on-close did not terminate the exact descendant within the proof bound.');
      return false;
    }
    if (!await exactJobNameMissing(job.value)) {
      console.error('Exact Job name remained after root and descendant termination.');
      return false;
    }

    // Missing is expected only after combining the prior exact policy/membership
    // proof with exact root and descendant exit. The containment port itself
    // deliberately refuses to turn name absence into standalone cleanup proof.
    const standalone = await authority.port.terminateAndProveEmpty(attempt);
    return standalone.isErr() && standalone.error[0].code === 'cleanup-partial';
  } finally {
    if (!rootExited) {
      const cleanup = await authority.port.terminateAndProveEmpty(attempt);
      if (cleanup.isErr()) child.kill();
    }
    if (!await boundedExit(child)) {
      child.kill();
      await boundedExit(child);
    }
    await stopExactProcess(descendantProcessId, descendantIncarnation);
  }
};

if (process.env[LIVE_OPT_IN] !== '1') {
  console.log(`Managed Windows target live proof skipped (opt in with ${LIVE_OPT_IN}=1).`);
  process.exit(0);
}

if (process.platform !== 'win32' || typeof Bun === 'undefined') {
  throw new Error('Managed Windows target live proof requires Bun on Windows.');
}

const target = process.argv.includes(TARGET_ARGUMENT);
const descendant = process.argv.includes(DESCENDANT_ARGUMENT);
const passed = target
  ? await runManagedTarget()
  : descendant ? await runDescendant() : await runParentProof();

if (!passed) throw new Error('The managed Windows target first-effect live proof failed closed.');
if (!target && !descendant) {
  console.log('Exact policy, first-effect containment, and root-plus-descendant kill-on-close passed.');
}
