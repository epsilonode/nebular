import {
  PM2_WINDOWS_RPC_PIPE,
  createPm2ProtocolCompatibilityRuntimePort,
  probePm2Prerequisite
} from '../../src/broker/public.ts';

if (process.platform !== 'win32') {
  throw new Error('The PM2 read-only compatibility live harness currently admits Windows only.');
}

const outcome = await probePm2Prerequisite({
  controlSurface: { kind: 'named-pipe', endpoint: PM2_WINDOWS_RPC_PIPE },
  timeoutMs: 2_000
}, createPm2ProtocolCompatibilityRuntimePort());

if (outcome.status !== 'compatible') {
  throw new Error(`PM2 read-only compatibility failed with closed status ${outcome.code}.`);
}

console.log('PM2 AMP v1 methods/version compatibility passed with redacted read-only receipts.');
