import { describe, expect, it } from 'vitest';

import { MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT } from '../broker-client/public.ts';
import { decodeAmpV1Chunk, emptyAmpV1StreamState, encodeAmpV1Message } from './amp-v1.ts';
import {
  decodeAndWipePm2ApplicationFrame,
  encodePm2ApplicationRpcRequest,
  type Pm2ApplicationStartConfig,
  type Pm2EncodedApplicationRequest
} from './pm2-application-rpc.ts';
import {
  PM2_METADATA_ATTEMPT_ID,
  PM2_METADATA_DEADLINE_AT_MS,
  PM2_METADATA_DIGEST,
  PM2_METADATA_JOB_IDENTITY,
  PM2_METADATA_SLOT_ID,
  PM2_METADATA_STARTED_AT_MS
} from './pm2-monitor-projection.ts';

const name = 'nebular-rpc-00';
const canary = 'APPLICATION_RPC_SECRET_CANARY';

const config: Pm2ApplicationStartConfig = {
  name,
  namespace: 'nebular-rpc',
  pm_exec_path: 'R:/runtime/bun.exe',
  pm_cwd: 'R:/work/repo',
  args: ['R:/work/repo/script.ts'],
  exec_mode: 'fork_mode',
  exec_interpreter: 'none',
  env: {
    [PM2_METADATA_SLOT_ID]: 'nebular-rpc:00',
    [PM2_METADATA_ATTEMPT_ID]: 'attempt-1',
    [PM2_METADATA_DIGEST]: 'b'.repeat(64),
    [PM2_METADATA_STARTED_AT_MS]: '1000',
    [PM2_METADATA_DEADLINE_AT_MS]: '2000',
    [PM2_METADATA_JOB_IDENTITY]: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`,
    [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: 'R:\\Code\\nebular\\broker.js'
  },
  autorestart: false,
  autostart: true,
  treekill: true,
  windowsHide: true,
  merge_logs: true,
  pm_out_log_path: 'R:/logs/out.log',
  pm_err_log_path: 'R:/logs/err.log',
  pm_pid_path: 'R:/pids/app.pid',
  vizion: false,
  watch: false,
  kill_retry_time: 100
};

const unwrapRequest = (request: ReturnType<typeof encodePm2ApplicationRpcRequest>): Pm2EncodedApplicationRequest => {
  if (request.outcome === 'failure') throw new Error(request.code);
  return request.value;
};

const processFixture = (status = 'online') => ({
  pid: status === 'online' ? 51 : 0,
  name,
  pm_id: 7,
  pm2_env: {
    name,
    pm_id: 7,
    status,
    autorestart: false,
    treekill: true,
    env: { TOKEN: canary },
    ...config.env
  }
});

const replyFrame = (
  request: Pm2EncodedApplicationRequest,
  body: unknown,
  correlation = request.correlationId
): Uint8Array => {
  const encoded = encodeAmpV1Message([
    new TextEncoder().encode(`j:${JSON.stringify(body)}`),
    new TextEncoder().encode(`s:${correlation}`)
  ]);
  if (encoded.outcome === 'failure') throw new Error(encoded.code);
  return Uint8Array.from(encoded.value);
};

describe('PM2 application RPC wire', () => {
  it.each([
    ['prepare', { method: 'prepare' as const, config }],
    ['stopProcessId', { method: 'stopProcessId' as const, pmId: 7, expectedName: name }],
    ['deleteProcessId', { method: 'deleteProcessId' as const, pmId: 7, expectedName: name }],
    ['getMonitorData', { method: 'getMonitorData' as const, allowedNames: [name] }]
  ])('encodes only the admitted %s method as a one-call AMP request', (method, operation) => {
    const request = unwrapRequest(encodePm2ApplicationRpcRequest(operation));
    const decoded = decodeAmpV1Chunk(emptyAmpV1StreamState(), request.bytes);
    expect(decoded.outcome).toBe('success');
    if (decoded.outcome === 'failure') return;
    const body = new TextDecoder().decode(decoded.value.messages[0]?.arguments[0]);

    expect(body).toContain(`"method":"${method}"`);
    expect(body).not.toContain('killMe');
    expect(body).not.toContain('dumpProcessList');
  });

  it('projects a prepare confirmation without exposing its nested environment and wipes the full frame', () => {
    const request = unwrapRequest(encodePm2ApplicationRpcRequest({ method: 'prepare', config }));
    const process = processFixture();
    const frame = replyFrame(request, { args: [[{ pm2_env: process.pm2_env, process: { pid: 51 } }]] });
    const outcome = decodeAndWipePm2ApplicationFrame(request, frame);

    expect(outcome).toEqual(expect.objectContaining({
      outcome: 'success',
      value: expect.objectContaining({ method: 'prepare', process: expect.objectContaining({ name, pmId: 7 }) })
    }));
    expect(JSON.stringify(outcome)).not.toContain(canary);
    expect(frame.every(byte => byte === 0)).toBe(true);
  });

  it('projects stop/delete receipts by exact expected name', () => {
    (['stopProcessId', 'deleteProcessId'] as const).forEach(method => {
      const request = unwrapRequest(encodePm2ApplicationRpcRequest({ method, pmId: 7, expectedName: name }));
      const frame = replyFrame(request, { args: [processFixture('stopped')] });
      const outcome = decodeAndWipePm2ApplicationFrame(request, frame);
      expect(outcome).toEqual(expect.objectContaining({
        outcome: 'success',
        value: expect.objectContaining({ method, process: expect.objectContaining({ status: 'stopped', pid: 0 }) })
      }));
      expect(JSON.stringify(outcome)).not.toContain(canary);
      expect(frame.every(byte => byte === 0)).toBe(true);
    });
  });

  it('projects monitor data through the byte allowlist and skips every foreign environment', () => {
    const request = unwrapRequest(encodePm2ApplicationRpcRequest({ method: 'getMonitorData', allowedNames: [name] }));
    const foreign = { ...processFixture(), name: 'foreign-app', pm2_env: {
      ...processFixture().pm2_env,
      name: 'foreign-app',
      env: { FOREIGN_TOKEN: canary }
    } };
    const frame = replyFrame(request, { args: [[foreign, processFixture()]] });
    const outcome = decodeAndWipePm2ApplicationFrame(request, frame);

    expect(outcome).toEqual(expect.objectContaining({
      outcome: 'success',
      value: { method: 'getMonitorData', processes: [expect.objectContaining({ name })] }
    }));
    expect(JSON.stringify(outcome)).not.toContain(canary);
    expect(frame.every(byte => byte === 0)).toBe(true);
  });

  it.each([
    ['wrong correlation', (request: Pm2EncodedApplicationRequest) =>
      replyFrame(request, { args: [[processFixture()]] }, 'wrong-correlation'), 'pm2-rpc-correlation-mismatch'],
    ['RPC error', (request: Pm2EncodedApplicationRequest) =>
      replyFrame(request, { error: canary, stack: canary }), 'pm2-rpc-rejected'],
    ['trailing bytes', (request: Pm2EncodedApplicationRequest) =>
      Uint8Array.from([...replyFrame(request, { args: [[processFixture()]] }), 0x11]), 'pm2-rpc-trailing-data'],
    ['malformed frame', (_request: Pm2EncodedApplicationRequest) => Uint8Array.of(0x10), 'pm2-rpc-malformed']
  ] as const)('fails closed for %s, redacts diagnostics, and wipes bytes', (_case, makeFrame, code) => {
    const request = unwrapRequest(encodePm2ApplicationRpcRequest({ method: 'getMonitorData', allowedNames: [name] }));
    const frame = makeFrame(request);
    const outcome = decodeAndWipePm2ApplicationFrame(request, frame);

    expect(outcome).toEqual({ outcome: 'failure', code });
    expect(JSON.stringify(outcome)).not.toContain(canary);
    expect(frame.every(byte => byte === 0)).toBe(true);
  });
});
