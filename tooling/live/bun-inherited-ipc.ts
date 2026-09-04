import { resolve } from 'node:path';

import {
  createBunInheritedIpcRuntime,
  runBrokerControlOverInheritedIpc
} from '../../src/broker-client/inherited-ipc.ts';

const projectRoot = resolve(import.meta.dir, '..', '..');
const brokerEntrypoint = resolve(projectRoot, 'dist', 'broker.js');
const result = await runBrokerControlOverInheritedIpc({
  brokerEntrypoint,
  cwd: projectRoot,
  timeoutMs: 10_000,
  payload: { operation: 'doctor', credentialSlotIds: [] }
}, createBunInheritedIpcRuntime());

if (result.isErr()) {
  throw new Error(`Inherited IPC live conformance failed: ${result.error[0].code}: ${result.error[0].message}`);
}
if (result.value.helperExitCode !== 0 ||
    result.value.terminal.outcome !== 'success' ||
    result.value.terminal.code !== 'pm2-compatible' ||
    result.value.progress.length !== 2) {
  throw new Error('Inherited IPC live conformance returned an invalid terminal receipt.');
}

console.log('Bun inherited-IPC live conformance passed with terminal helper exit.');
