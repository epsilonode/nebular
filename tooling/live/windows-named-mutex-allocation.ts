import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createWindowsKnownFolderLocalApplicationDataPort } from '../../src/broker/bun-windows-profile.ts';
import type { OneShotReceiverIssue } from '../../src/broker/one-shot-receiver.ts';
import type { OneShotResult } from '../../src/broker/one-shot-slots.ts';
import {
  createWindowsNamedMutexAllocationPort,
  type WindowsNamedMutexAllocationConfig
} from '../../src/broker/windows-named-mutex-allocation.ts';

const HOLDER_ARGUMENT = '--hold-windows-named-mutex';
const HOLDER_READY = 'NEBULAR_WINDOWS_NAMED_MUTEX_HELD';
const namespace = 'nebular-live-mutex';

const ok = <Value>(value: Value): OneShotResult<Value, OneShotReceiverIssue> => ({
  outcome: 'success',
  value
});

const resolveConfig = async (timeoutMs: number): Promise<WindowsNamedMutexAllocationConfig | undefined> => {
  const root = await createWindowsKnownFolderLocalApplicationDataPort().resolveCurrentUserRoot();
  return root.type === 'err' ? undefined : { namespace, trustedProfileRoot: root.value, timeoutMs };
};

const runHolder = async (): Promise<boolean> => {
  const configuration = await resolveConfig(10_000);
  if (configuration === undefined) return false;
  const port = createWindowsNamedMutexAllocationPort<undefined>(configuration);
  const result = await port.withAllocationLock(namespace, async () => {
    console.log(HOLDER_READY);
    await delay(30_000);
    return ok(undefined);
  });
  return result.outcome === 'success';
};

const readHolderReady = async (
  stdout: ReadableStream<Uint8Array>
): Promise<boolean> => {
  const reader = stdout.getReader();
  const first = await Promise.race([
    reader.read().then(chunk => ({ status: 'read' as const, chunk })),
    delay(5_000).then(() => ({ status: 'timeout' as const }))
  ]);
  return first.status === 'read' && !first.chunk.done &&
    new TextDecoder().decode(first.chunk.value).includes(HOLDER_READY);
};

const runParentProof = async (): Promise<boolean> => {
  const projectRoot = resolve(import.meta.dir, '..', '..');
  const child = Bun.spawn({
    cmd: [process.execPath, import.meta.path, HOLDER_ARGUMENT],
    cwd: projectRoot,
    env: {},
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const ready = await readHolderReady(child.stdout);
  if (!ready) {
    child.kill();
    await child.exited;
    return false;
  }

  const contendingConfig = await resolveConfig(250);
  if (contendingConfig === undefined) {
    child.kill();
    await child.exited;
    return false;
  }
  const contendingPort = createWindowsNamedMutexAllocationPort<string>(contendingConfig);
  const contendedWork = (): Promise<OneShotResult<string, OneShotReceiverIssue>> => Promise.resolve(ok('unsafe'));
  const contended = await contendingPort.withAllocationLock(namespace, contendedWork);

  child.kill();
  await child.exited;

  const recoveryConfig = await resolveConfig(2_000);
  if (recoveryConfig === undefined) return false;
  const recoveryPort = createWindowsNamedMutexAllocationPort<string>(recoveryConfig);
  const recovered = await recoveryPort.withAllocationLock(namespace, () => Promise.resolve(ok('recovered')));
  const stderr = await new Response(child.stderr).text();

  const passed = contended.outcome === 'failure' && recovered.outcome === 'success' &&
    recovered.value === 'recovered' && stderr.trim().length === 0;
  if (passed) {
    console.log('Windows named-mutex cross-process exclusion and process-death recovery proof passed.');
  }
  return passed;
};

const passed = process.argv.includes(HOLDER_ARGUMENT) ? await runHolder() : await runParentProof();
if (!passed) throw new Error('The Windows named-mutex live proof failed closed.');
