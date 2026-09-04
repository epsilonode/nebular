import { describe, expect, it } from 'vitest';

import {
  PM2_PREREQUISITE_MAX_TIMEOUT_MS,
  createSocketPm2PrerequisiteRuntimePort,
  probePm2Prerequisite,
  type Pm2PrerequisiteRuntimePort,
  type Pm2SocketProbeObservation,
  type Pm2SocketProbeRequest
} from './pm2-prerequisite.ts';

const namedPipe = '\\\\.\\pipe\\pm2-rpc';

const runtime = (
  observation: Pm2SocketProbeObservation,
  inspect: (request: Pm2SocketProbeRequest) => void = () => undefined
): Pm2PrerequisiteRuntimePort => ({
  supportsEndpointKind: kind => kind === 'named-pipe',
  probeSocket: async request => {
    inspect(request);
    return observation;
  }
});

describe('host-owned PM2 prerequisite', () => {
  it('returns unavailable without probing when no control surface is configured', async () => {
    let probes = 0;
    const outcome = await probePm2Prerequisite({
      controlSurface: { kind: 'unconfigured' },
      timeoutMs: 250
    }, runtime({ status: 'reachable-unverified' }, () => {
      probes += 1;
    }));

    expect(probes).toBe(0);
    expect(outcome).toEqual(expect.objectContaining({
      status: 'unavailable',
      code: 'pm2-unavailable'
    }));
  });

  it.each([
    [{ status: 'compatible' }, 'compatible', 'pm2-compatible'],
    [{ status: 'unavailable' }, 'unavailable', 'pm2-unavailable'],
    [{ status: 'unreachable' }, 'unreachable', 'pm2-unreachable'],
    [{ status: 'incompatible' }, 'incompatible', 'pm2-incompatible'],
    [{ status: 'timeout' }, 'timeout', 'pm2-timeout'],
    [{ status: 'reachable-unverified' }, 'reachable-unverified', 'pm2-compatibility-unverified']
  ] as const)('keeps the %s observation closed and typed', async (observation, status, code) => {
    const outcome = await probePm2Prerequisite({
      controlSurface: { kind: 'named-pipe', endpoint: namedPipe },
      timeoutMs: 250
    }, runtime(observation, request => {
      expect(request).toEqual({ endpointKind: 'named-pipe', endpoint: namedPipe, timeoutMs: 250 });
    }));

    expect(outcome).toEqual(expect.objectContaining({ status, code }));
    expect(JSON.stringify(outcome)).not.toContain(namedPipe);
  });

  it('fails incompatible before I/O for invalid deadlines, endpoints, or runtime transport support', async () => {
    let probes = 0;
    const unsupported: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'unix-socket',
      probeSocket: async () => {
        probes += 1;
        return { status: 'reachable-unverified' };
      }
    };
    const configurations = [
      { controlSurface: { kind: 'named-pipe' as const, endpoint: namedPipe }, timeoutMs: 0 },
      { controlSurface: { kind: 'named-pipe' as const, endpoint: namedPipe }, timeoutMs: PM2_PREREQUISITE_MAX_TIMEOUT_MS + 1 },
      { controlSurface: { kind: 'named-pipe' as const, endpoint: 'pm2-rpc' }, timeoutMs: 250 },
      { controlSurface: { kind: 'named-pipe' as const, endpoint: namedPipe }, timeoutMs: 250 }
    ];

    const outcomes = await Promise.all(configurations.map(configuration =>
      probePm2Prerequisite(configuration, unsupported)
    ));
    expect(probes).toBe(0);
    expect(outcomes.every(outcome => outcome.status === 'incompatible')).toBe(true);
  });

  it('closes a rejected runtime effect as unreachable without exposing its error', async () => {
    const secretCanary = 'pm2-endpoint-secret-canary';
    const rejecting: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: () => Promise.reject(new Error(secretCanary))
    };
    const outcome = await probePm2Prerequisite({
      controlSurface: { kind: 'named-pipe', endpoint: namedPipe },
      timeoutMs: 250
    }, rejecting);

    expect(outcome).toEqual(expect.objectContaining({ status: 'unreachable', code: 'pm2-unreachable' }));
    expect(JSON.stringify(outcome)).not.toContain(secretCanary);
  });

  it.each([
    undefined,
    null,
    { status: 'ready' },
    { status: 'unknown', detail: 'runtime-secret-canary' },
    { outcome: 'reachable' }
  ])('closes a malformed or overclaiming runtime observation as incompatible', async observation => {
    const adversarial: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: async () => observation
    };
    const outcome = await probePm2Prerequisite({
      controlSurface: { kind: 'named-pipe', endpoint: namedPipe },
      timeoutMs: 250
    }, adversarial);

    expect(outcome).toEqual(expect.objectContaining({ status: 'incompatible', code: 'pm2-incompatible' }));
    expect(JSON.stringify(outcome)).not.toContain('runtime-secret-canary');
  });

  it('enforces its own deadline when an injected runtime port never settles', async () => {
    const hung: Pm2PrerequisiteRuntimePort = {
      supportsEndpointKind: kind => kind === 'named-pipe',
      probeSocket: () => new Promise(() => undefined)
    };
    const startedAt = Date.now();
    const outcome = await probePm2Prerequisite({
      controlSurface: { kind: 'named-pipe', endpoint: namedPipe },
      timeoutMs: 20
    }, hung);

    expect(outcome).toEqual(expect.objectContaining({ status: 'timeout', code: 'pm2-timeout' }));
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('advertises only the platform-compatible IPC surface in the production socket leaf', () => {
    const windows = createSocketPm2PrerequisiteRuntimePort('win32');
    const linux = createSocketPm2PrerequisiteRuntimePort('linux');
    expect(windows.supportsEndpointKind('named-pipe')).toBe(true);
    expect(windows.supportsEndpointKind('unix-socket')).toBe(false);
    expect(linux.supportsEndpointKind('named-pipe')).toBe(false);
    expect(linux.supportsEndpointKind('unix-socket')).toBe(true);
  });
});
