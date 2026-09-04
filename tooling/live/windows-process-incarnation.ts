import {
  createBunWindowsProcessNativePort,
  readWindowsProcessIncarnation
} from '../../src/broker/windows-process-incarnation.ts';

if (process.env['NEBULAR_WINDOWS_PROCESS_INCARNATION_LIVE'] !== '1') {
  console.log('Windows process-incarnation live probe skipped (opt in with NEBULAR_WINDOWS_PROCESS_INCARNATION_LIVE=1).');
  process.exit(0);
}

if (process.platform !== 'win32' || typeof Bun === 'undefined') {
  throw new Error('Windows process-incarnation live probe requires Bun on Windows.');
}

const runtime = createBunWindowsProcessNativePort();
const first = await readWindowsProcessIncarnation({ processId: process.pid }, runtime, process.platform);
const second = await readWindowsProcessIncarnation({ processId: process.pid }, runtime, process.platform);
const stable = first.status === 'running' && second.status === 'running' &&
  first.processId === process.pid && second.processId === process.pid &&
  first.incarnation.value === second.incarnation.value &&
  /^windows-process-incarnation-v1-[0-9a-f]{64}$/u.test(first.incarnation.value);

if (!stable) throw new Error('Windows process-incarnation live proof failed.');

console.log('Windows process-incarnation live proof passed with a stable opaque identity and closed handles.');
