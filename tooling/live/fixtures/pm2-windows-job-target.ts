import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  createBunManagedWindowsJobFirstEffectGate,
  createBunManagedWindowsJobNativePort,
  readManagedWindowsJobFirstEffectIdentity
} from '../../../src/broker-client/public.ts';

const TARGET_ARGUMENT = '--pm2-windows-job-target';
const DESCENDANT_ARGUMENT = '--pm2-windows-job-descendant';
const READY_FORMAT = 'pm2-windows-job-target-ready/v1';

type TargetReady = Readonly<{
  format: typeof READY_FORMAT;
  outcome: 'contained';
  rootProcessId: number;
  descendantProcessId: number;
}>;

type TargetRejected = Readonly<{
  format: typeof READY_FORMAT;
  outcome: 'precontained-other-job' | 'containment-unavailable';
  rootProcessId: number;
}>;

const writeReady = (path: string, value: TargetReady | TargetRejected): Promise<boolean> =>
  writeFile(path, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' }).then(
    () => true,
    () => false
  );

const diagnoseRejectedContainment = async (): Promise<TargetRejected['outcome']> => {
  const identity = readManagedWindowsJobFirstEffectIdentity({ read: name => process.env[name] });
  if (identity.isErr()) return 'containment-unavailable';
  const opened = await createBunManagedWindowsJobNativePort().openCurrentProcess(identity.value.job);
  if (opened.status !== 'opened') return 'containment-unavailable';
  const [anyJob, exactJob] = await Promise.all([
    opened.session.isCurrentProcessInAnyJob(),
    opened.session.isCurrentProcessInThisJob()
  ]);
  const closed = await opened.session.close();
  return closed && anyJob.status === 'observed' && anyJob.value &&
    exactJob.status === 'observed' && !exactJob.value
    ? 'precontained-other-job'
    : 'containment-unavailable';
};

const runTarget = async (readyPath: string): Promise<boolean> => {
  // This must remain the target's first native action: no application import,
  // process creation, filesystem write, or broker IPC may precede containment.
  const containment = await createBunManagedWindowsJobFirstEffectGate().enter();
  if (containment.isErr()) {
    const outcome = await diagnoseRejectedContainment();
    await writeReady(readyPath, { format: READY_FORMAT, outcome, rootProcessId: process.pid });
    return false;
  }
  const retained = await containment.value.authority.proveRetained();
  if (retained.isErr()) {
    await writeReady(readyPath, {
      format: READY_FORMAT,
      outcome: 'containment-unavailable',
      rootProcessId: process.pid
    });
    return false;
  }

  const descendant = Bun.spawn({
    cmd: [process.execPath, import.meta.path, DESCENDANT_ARGUMENT],
    cwd: resolve(import.meta.dir, '..', '..', '..'),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  });
  const announced = await writeReady(readyPath, {
    format: READY_FORMAT,
    outcome: 'contained',
    rootProcessId: process.pid,
    descendantProcessId: descendant.pid
  });
  if (!announced) return false;

  await delay(120_000);
  return (await containment.value.authority.proveRetained()).isOk();
};

const runDescendant = async (): Promise<boolean> => {
  await delay(120_000);
  return true;
};

const targetIndex = process.argv.indexOf(TARGET_ARGUMENT);
const readyPath = targetIndex >= 0 ? process.argv.at(targetIndex + 1) : undefined;
const passed = readyPath !== undefined
  ? await runTarget(readyPath)
  : process.argv.includes(DESCENDANT_ARGUMENT) && await runDescendant();

if (!passed) process.exitCode = 1;
