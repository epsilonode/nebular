import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { parseProcessIncarnation, type ProcessIncarnation } from './journal.ts';
import { parseProcessAttemptId } from './primitives.ts';
import type { BrokerResult } from './result.ts';
import {
  createBunWindowsNamedJobNativePort,
  createWindowsNamedJobContainmentPort,
  deriveWindowsNamedJobIdentity,
  type WindowsNamedJobActiveProcessObservation,
  type WindowsNamedJobBooleanObservation,
  type WindowsNamedJobContainmentConfig,
  type WindowsNamedJobNativePort,
  type WindowsNamedJobObservationSession,
  type WindowsNamedJobTerminationSession,
  type WindowsNamedJobVerificationRequest,
  type WindowsNamedJobVerificationSession
} from './windows-named-job-containment.ts';

const unwrap = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const config = (
  namespace = 'job-test',
  profileRoot = 'C:\\Users\\Broker\\AppData\\Local',
  terminationPollAttempts = 3
): WindowsNamedJobContainmentConfig => ({
  trustedProfileRoot: { kind: 'trusted-profile-root', value: profileRoot },
  namespace,
  terminationPollAttempts,
  terminationPollIntervalMs: 1
});

const incarnation = (processId: number, creationFileTime: bigint): ProcessIncarnation => {
  const digest = createHash('sha256')
    .update(`windows-process-incarnation/v1\0${processId}\0${creationFileTime.toString(10)}`)
    .digest('hex');
  const parsed = parseProcessIncarnation(`windows-process-incarnation-v1-${digest}`);
  if (parsed.type === 'err') throw new Error(parsed.issues[0].message);
  return parsed.value;
};

const creationFileTime = 133_801_234_567_890_123n;
const request = (
  processId = 4_100,
  observedCreationFileTime = creationFileTime,
  attemptDigest = 'ab'.repeat(32)
): WindowsNamedJobVerificationRequest => ({
  attemptId: unwrap(parseProcessAttemptId('attempt-job-1')),
  attemptDigest,
  processId,
  processIncarnation: incarnation(processId, observedCreationFileTime)
});

const observedBoolean = (value: boolean): WindowsNamedJobBooleanObservation => ({
  status: 'observed',
  value
});

const observedActive = (activeProcesses: number): WindowsNamedJobActiveProcessObservation => ({
  status: 'observed',
  activeProcesses
});

const sequence = <Value>(values: readonly Value[], fallback: Value): (() => Promise<Value>) => {
  let index = 0;
  return () => Promise.resolve(values[index++] ?? fallback);
};

const terminationSession = (
  overrides: Partial<WindowsNamedJobTerminationSession> = {}
): WindowsNamedJobTerminationSession => ({
  queryPolicy: vi.fn(() => Promise.resolve({ status: 'compatible' as const })),
  queryActiveProcesses: vi.fn(() => Promise.resolve(observedActive(0))),
  terminate: vi.fn(() => Promise.resolve({ status: 'succeeded' as const })),
  close: vi.fn(() => Promise.resolve(true)),
  ...overrides
});

const verificationSession = (
  overrides: Partial<WindowsNamedJobVerificationSession> = {}
): WindowsNamedJobVerificationSession => ({
  inspectProcess: vi.fn(() => Promise.resolve({ status: 'running' as const, creationFileTime })),
  queryPolicy: vi.fn(() => Promise.resolve({ status: 'compatible' as const })),
  queryActiveProcesses: vi.fn(() => Promise.resolve(observedActive(1))),
  isProcessInThisJob: vi.fn(() => Promise.resolve(observedBoolean(true))),
  close: vi.fn(() => Promise.resolve(true)),
  ...overrides
});

const observationSession = (
  processIds: readonly number[] = [4_100],
  overrides: Partial<WindowsNamedJobObservationSession> = {}
): WindowsNamedJobObservationSession => ({
  queryPolicy: vi.fn(() => Promise.resolve({ status: 'compatible' as const })),
  queryProcessIds: vi.fn(() => Promise.resolve({ status: 'observed' as const, processIds })),
  close: vi.fn(() => Promise.resolve(true)),
  ...overrides
});

const nativePort = (
  overrides: Partial<WindowsNamedJobNativePort> = {}
): WindowsNamedJobNativePort => ({
  openObservation: vi.fn(() => Promise.resolve({ status: 'missing' as const })),
  openTermination: vi.fn(() => Promise.resolve({ status: 'missing' as const })),
  openVerification: vi.fn(() => Promise.resolve({ status: 'unavailable' as const })),
  delay: vi.fn(() => Promise.resolve()),
  ...overrides
});

const issueCode = (result: BrokerResult<unknown>): string =>
  result.isErr() ? result.error[0].code : 'success';

describe('Windows named Job Object containment boundary', () => {
  it('derives a stable opaque Local name from every exact authority dimension', () => {
    const exact = request();
    const first = deriveWindowsNamedJobIdentity(config(), exact);
    const same = deriveWindowsNamedJobIdentity(config(), exact);
    const variants = [
      deriveWindowsNamedJobIdentity(config(
        'job-test',
        'C:\\Users\\Other\\AppData\\Local'
      ), exact),
      deriveWindowsNamedJobIdentity(config('other-job'), exact),
      deriveWindowsNamedJobIdentity(config(), {
        ...exact,
        attemptId: unwrap(parseProcessAttemptId('attempt-job-2'))
      }),
      deriveWindowsNamedJobIdentity(config(), { ...exact, attemptDigest: 'cd'.repeat(32) })
    ];

    expect(first).toEqual(same);
    expect(first.isOk() && first.value.value).toMatch(
      /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u
    );
    expect(variants).not.toContainEqual(first);
    expect(JSON.stringify(first)).not.toContain('Users');
    expect(JSON.stringify(first)).not.toContain(exact.attemptDigest);
    expect(JSON.stringify(first)).not.toContain(exact.attemptId);
  });

  it('admits exactly one Job member as a candidate root and rejects ambiguous membership', async () => {
    const single = observationSession([4_100]);
    const multiple = observationSession([4_100, 4_101]);
    const singlePort = createWindowsNamedJobContainmentPort(config(), nativePort({
      openObservation: () => Promise.resolve({ status: 'opened', session: single })
    }));
    const multiplePort = createWindowsNamedJobContainmentPort(config(), nativePort({
      openObservation: () => Promise.resolve({ status: 'opened', session: multiple })
    }));

    await expect(singlePort.observeBootstrapRoot(request())).resolves.toMatchObject({
      status: 'ready',
      processId: 4_100
    });
    await expect(multiplePort.observeBootstrapRoot(request())).resolves.toEqual({
      status: 'ambiguous',
      reason: 'multiple-processes'
    });
    expect(single.close).toHaveBeenCalledOnce();
    expect(multiple.close).toHaveBeenCalledOnce();
  });

  it('distinguishes a missing Job name from an opened Job with no members', async () => {
    const empty = observationSession([]);
    const missingPort = createWindowsNamedJobContainmentPort(config(), nativePort());
    const emptyPort = createWindowsNamedJobContainmentPort(config(), nativePort({
      openObservation: () => Promise.resolve({ status: 'opened', session: empty })
    }));

    await expect(missingPort.observeBootstrapRoot(request())).resolves.toMatchObject({
      status: 'pending',
      reason: 'job-name-missing'
    });
    await expect(emptyPort.observeBootstrapRoot(request())).resolves.toMatchObject({
      status: 'pending',
      reason: 'job-empty'
    });
    expect(empty.close).toHaveBeenCalledOnce();
  });

  it.each([
    config('UPPERCASE'),
    config('-leading'),
    config('job-test', '\\\\server\\profile'),
    config('job-test', 'C:\\Users\\Broker\\AppData\\Local\\..\\Roaming'),
    { ...config(), terminationPollAttempts: 0 },
    { ...config(), terminationPollIntervalMs: 101 }
  ])('rejects invalid authority configuration before native access', async invalid => {
    const openTermination = vi.fn(() => Promise.resolve({ status: 'missing' as const }));
    const openVerification = vi.fn(() => Promise.resolve({ status: 'unavailable' as const }));
    const port = createWindowsNamedJobContainmentPort(
      invalid,
      nativePort({ openTermination, openVerification })
    );

    const [verified, terminated] = await Promise.all([
      port.verifyExactProcess(request()),
      port.terminateAndProveEmpty(request())
    ]);

    expect([issueCode(verified), issueCode(terminated)]).toEqual([
      'process-plan-invalid',
      'process-plan-invalid'
    ]);
    expect(openVerification).not.toHaveBeenCalled();
    expect(openTermination).not.toHaveBeenCalled();
  });

  it('uses query-only verification in exact fail-closed effect order', async () => {
    const effects: string[] = [];
    const session = verificationSession({
      queryPolicy: vi.fn(() => {
        effects.push('policy');
        return Promise.resolve({ status: 'compatible' as const });
      }),
      inspectProcess: vi.fn(() => {
        effects.push('incarnation');
        return Promise.resolve({ status: 'running' as const, creationFileTime });
      }),
      isProcessInThisJob: vi.fn(() => {
        effects.push('membership');
        return Promise.resolve(observedBoolean(true));
      }),
      queryActiveProcesses: vi.fn(() => {
        effects.push('active');
        return Promise.resolve(observedActive(2));
      }),
      close: vi.fn(() => {
        effects.push('close');
        return Promise.resolve(true);
      })
    });
    const openVerification = vi.fn(() => {
      effects.push('open-query-only');
      return Promise.resolve({ status: 'opened' as const, session });
    });
    const result = await createWindowsNamedJobContainmentPort(
      config(),
      nativePort({ openVerification })
    ).verifyExactProcess(request());

    expect(result.isOk() && result.value.state).toBe('verified-contained');
    expect(effects).toEqual([
      'open-query-only',
      'policy',
      'incarnation',
      'membership',
      'active',
      'incarnation',
      'policy',
      'close'
    ]);
    expect(openVerification).toHaveBeenCalledOnce();
  });

  it.each([
    ['job-missing', 'receiver-conflict'],
    ['process-missing', 'process-state-invalid'],
    ['process-inaccessible', 'receiver-conflict'],
    ['unavailable', 'receiver-unavailable']
  ] as const)('maps verification open status %s without assignment recovery', async (
    status,
    expected
  ) => {
    const result = await createWindowsNamedJobContainmentPort(config(), nativePort({
      openVerification: () => Promise.resolve({ status })
    })).verifyExactProcess(request());

    expect(issueCode(result)).toBe(expected);
  });

  it('rejects incompatible policy, membership loss, zero active membership, and PID drift', async () => {
    const drift = creationFileTime + 1n;
    const cases = [
      verificationSession({ queryPolicy: () => Promise.resolve({ status: 'incompatible' }) }),
      verificationSession({ isProcessInThisJob: () => Promise.resolve(observedBoolean(false)) }),
      verificationSession({ queryActiveProcesses: () => Promise.resolve(observedActive(0)) }),
      verificationSession({
        inspectProcess: sequence([
          { status: 'running' as const, creationFileTime },
          { status: 'running' as const, creationFileTime: drift }
        ], { status: 'running' as const, creationFileTime: drift })
      })
    ];
    const outcomes = await Promise.all(cases.map(session =>
      createWindowsNamedJobContainmentPort(config(), nativePort({
        openVerification: () => Promise.resolve({ status: 'opened', session })
      })).verifyExactProcess(request())));

    expect(outcomes.map(issueCode)).toEqual([
      'receiver-conflict',
      'receiver-conflict',
      'receiver-failed',
      'process-state-invalid'
    ]);
    expect(cases.every(session => vi.mocked(session.close).mock.calls.length === 1)).toBe(true);
  });

  it('contains verification defects, redacts them, and requires close success', async () => {
    const throwing = verificationSession({
      queryPolicy: () => { throw new Error('private-policy'); }
    });
    const closeFailure = verificationSession({ close: () => Promise.resolve(false) });
    const outcomes = await Promise.all([throwing, closeFailure].map(session =>
      createWindowsNamedJobContainmentPort(config(), nativePort({
        openVerification: () => Promise.resolve({ status: 'opened', session })
      })).verifyExactProcess(request())));

    expect(outcomes.map(issueCode)).toEqual(['receiver-failed', 'receiver-failed']);
    expect(JSON.stringify(outcomes)).not.toContain('private-policy');
  });

  it('never treats a missing name as standalone empty-tree proof', async () => {
    const result = await createWindowsNamedJobContainmentPort(
      config(),
      nativePort()
    ).terminateAndProveEmpty(request());

    expect(issueCode(result)).toBe('cleanup-partial');
  });

  it('returns already-empty only from an opened exact-policy job observed at zero', async () => {
    const session = terminationSession();
    const result = await createWindowsNamedJobContainmentPort(config(), nativePort({
      openTermination: () => Promise.resolve({ status: 'opened', session })
    })).terminateAndProveEmpty(request());

    expect(result.isOk() && result.value).toMatchObject({
      state: 'already-empty',
      activeProcesses: 0
    });
    expect(session.terminate).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('terminates an opened exact-policy tree and polls to a proven zero', async () => {
    const queryActiveProcesses = vi.fn(sequence([
      observedActive(2),
      observedActive(1),
      observedActive(0)
    ], observedActive(0)));
    const session = terminationSession({ queryActiveProcesses });
    const delay = vi.fn(() => Promise.resolve());
    const result = await createWindowsNamedJobContainmentPort(config(), nativePort({
      openTermination: () => Promise.resolve({ status: 'opened', session }),
      delay
    })).terminateAndProveEmpty(request());

    expect(result.isOk() && result.value.state).toBe('terminated-empty');
    expect(session.terminate).toHaveBeenCalledExactlyOnceWith(1);
    expect(queryActiveProcesses).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledExactlyOnceWith(1);
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('fails closed for incompatible policy, failed termination, poll exhaustion, or close loss', async () => {
    const sessions = [
      terminationSession({ queryPolicy: () => Promise.resolve({ status: 'incompatible' }) }),
      terminationSession({
        queryActiveProcesses: () => Promise.resolve(observedActive(1)),
        terminate: () => Promise.resolve({ status: 'failed' })
      }),
      terminationSession({ queryActiveProcesses: () => Promise.resolve(observedActive(1)) }),
      terminationSession({ close: () => Promise.resolve(false) })
    ];
    const outcomes = await Promise.all(sessions.map(session =>
      createWindowsNamedJobContainmentPort(
        config('job-test', 'C:\\Users\\Broker\\AppData\\Local', 1),
        nativePort({ openTermination: () => Promise.resolve({ status: 'opened', session }) })
      ).terminateAndProveEmpty(request())));

    expect(outcomes.map(issueCode)).toEqual([
      'receiver-conflict',
      'cleanup-partial',
      'cleanup-partial',
      'cleanup-partial'
    ]);
  });

  it('keeps unsupported native access query-only and unavailable', async () => {
    const native = createBunWindowsNamedJobNativePort('linux', 'x64');
    const identity = unwrap(deriveWindowsNamedJobIdentity(config(), request()));

    const [verification, termination] = await Promise.all([
      native.openVerification(identity, request().processId),
      native.openTermination(identity)
    ]);

    expect(verification).toEqual({ status: 'unavailable' });
    expect(termination).toEqual({ status: 'unavailable' });
  });
});
