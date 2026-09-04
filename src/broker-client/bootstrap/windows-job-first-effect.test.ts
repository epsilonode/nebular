import { describe, expect, it, vi } from 'vitest';

import type { BrokerClientResult } from '../result.ts';
import {
  createManagedWindowsJobFirstEffectGate,
  MANAGED_WINDOWS_JOB_ENVIRONMENT,
  readManagedWindowsJobFirstEffectIdentity,
  type ManagedWindowsJobActiveProcessObservation,
  type ManagedWindowsJobBooleanObservation,
  type ManagedWindowsJobEnvironmentPort,
  type ManagedWindowsJobNativePort,
  type ManagedWindowsJobNativeSession
} from './windows-job-first-effect.ts';

const JOB_IDENTITY = `Local\\epsilonode.nebular.job.v1.${'ab'.repeat(32)}`;
const ATTEMPT_IDENTITY = 'attempt-job-1';

const environment = (
  facts: Readonly<Record<string, unknown>> = {
    [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: JOB_IDENTITY,
    [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: ATTEMPT_IDENTITY
  }
): ManagedWindowsJobEnvironmentPort => ({ read: name => facts[name] });

const observedBoolean = (value: boolean): ManagedWindowsJobBooleanObservation => ({
  status: 'observed',
  value
});

const observedActive = (activeProcesses: number): ManagedWindowsJobActiveProcessObservation => ({
  status: 'observed',
  activeProcesses
});

const sequence = <Value>(values: readonly Value[], fallback: Value): (() => Promise<Value>) => {
  let index = 0;
  return () => Promise.resolve(values[index++] ?? fallback);
};

const session = (
  overrides: Partial<ManagedWindowsJobNativeSession> = {}
): ManagedWindowsJobNativeSession => ({
  queryPolicy: vi.fn(() => Promise.resolve({ status: 'compatible' as const })),
  queryActiveProcesses: vi.fn(() => Promise.resolve(observedActive(1))),
  isCurrentProcessInAnyJob: vi.fn(() => Promise.resolve(observedBoolean(false))),
  isCurrentProcessInThisJob: vi.fn(() => Promise.resolve(observedBoolean(true))),
  assignCurrentProcess: vi.fn(() => Promise.resolve({ status: 'succeeded' as const })),
  close: vi.fn(() => Promise.resolve(true)),
  ...overrides
});

const native = (
  openCurrentProcess: ManagedWindowsJobNativePort['openCurrentProcess']
): ManagedWindowsJobNativePort => ({ openCurrentProcess });

const code = (result: BrokerClientResult<unknown>): string =>
  result.isErr() ? result.error[0].code : 'success';

describe('managed Windows Job first-effect gate', () => {
  it('decodes only the bounded opaque job and attempt identities', () => {
    const read = vi.fn(environment().read);
    const result = readManagedWindowsJobFirstEffectIdentity({ read });

    expect(result.isOk() && result.value).toEqual({
      job: { kind: 'managed-windows-job-identity', value: JOB_IDENTITY },
      attempt: { kind: 'managed-windows-job-attempt-identity', value: ATTEMPT_IDENTITY }
    });
    expect(read.mock.calls.map(call => call[0])).toEqual([
      MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity,
      MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId
    ]);
  });

  it.each([
    { [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: 'Local\\forged',
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: ATTEMPT_IDENTITY },
    { [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: JOB_IDENTITY,
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: '../attempt' },
    { [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: `${JOB_IDENTITY}suffix`,
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: ATTEMPT_IDENTITY },
    { [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: JOB_IDENTITY,
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: 'a'.repeat(129) }
  ])('rejects invalid launch authority before native access', async facts => {
    const openCurrentProcess = vi.fn(() => Promise.resolve({ status: 'unavailable' as const }));
    const result = await createManagedWindowsJobFirstEffectGate(
      environment(facts),
      native(openCurrentProcess)
    ).enter();

    expect(code(result)).toBe('invalid-input');
    expect(openCurrentProcess).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('../attempt');
  });

  it('self-assigns, verifies compatible membership, and transfers an opaque lifetime anchor', async () => {
    const isCurrentProcessInThisJob = vi.fn(sequence([
      observedBoolean(false),
      observedBoolean(true)
    ], observedBoolean(true)));
    const queryActiveProcesses = vi.fn(sequence([
      observedActive(0),
      observedActive(1)
    ], observedActive(1)));
    const assignCurrentProcess = vi.fn(() => Promise.resolve({ status: 'succeeded' as const }));
    const close = vi.fn(() => Promise.resolve(true));
    const opened = session({
      isCurrentProcessInThisJob,
      queryActiveProcesses,
      assignCurrentProcess,
      close
    });
    const openCurrentProcess = vi.fn(() => Promise.resolve({
      status: 'opened' as const,
      processId: 4_100,
      session: opened
    }));

    const result = await createManagedWindowsJobFirstEffectGate(
      environment(),
      native(openCurrentProcess)
    ).enter();

    expect(result.isOk() && result.value.identity).toEqual({
      state: 'assigned',
      job: { kind: 'managed-windows-job-identity', value: JOB_IDENTITY },
      attempt: { kind: 'managed-windows-job-attempt-identity', value: ATTEMPT_IDENTITY },
      processId: 4_100
    });
    expect(assignCurrentProcess).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    if (result.isErr()) throw new Error('Expected an opaque lifetime anchor.');
    expect(Object.keys(result.value)).toEqual(['identity', 'authority']);
    expect(Object.keys(result.value.authority)).toEqual(['proveRetained']);
    expect(JSON.stringify(result.value.identity)).not.toContain('HANDLE');

    const retained = await result.value.authority.proveRetained();
    expect(retained.isOk() && retained.value.state).toBe('already-contained');
    expect(close).not.toHaveBeenCalled();
  });

  it('retains an existing exact parent-created job without attempting assignment', async () => {
    const opened = session();
    const result = await createManagedWindowsJobFirstEffectGate(environment(), native(
      () => Promise.resolve({ status: 'opened', processId: 4_100, session: opened })
    )).enter();

    expect(result.isOk() && result.value.identity.state).toBe('already-contained');
    expect(opened.assignCurrentProcess).not.toHaveBeenCalled();
    expect(opened.close).not.toHaveBeenCalled();
  });

  it('fails closed for an incompatible policy or a nonempty foreign target job and closes authority', async () => {
    const incompatible = session({
      queryPolicy: () => Promise.resolve({ status: 'incompatible' })
    });
    const occupied = session({
      isCurrentProcessInThisJob: () => Promise.resolve(observedBoolean(false)),
      queryActiveProcesses: () => Promise.resolve(observedActive(2))
    });
    const outcomes = await Promise.all([incompatible, occupied].map(opened =>
      createManagedWindowsJobFirstEffectGate(environment(), native(
        () => Promise.resolve({ status: 'opened', processId: 4_100, session: opened })
      )).enter()));

    expect(outcomes.map(code)).toEqual(['transport-unavailable', 'transport-unavailable']);
    expect(incompatible.assignCurrentProcess).not.toHaveBeenCalled();
    expect(occupied.assignCurrentProcess).not.toHaveBeenCalled();
    expect(incompatible.close).toHaveBeenCalledOnce();
    expect(occupied.close).toHaveBeenCalledOnce();
  });

  it('rejects an existing different Job instead of relying on nested assignment behavior', async () => {
    const opened = session({
      isCurrentProcessInThisJob: () => Promise.resolve(observedBoolean(false)),
      isCurrentProcessInAnyJob: () => Promise.resolve(observedBoolean(true)),
      queryActiveProcesses: () => Promise.resolve(observedActive(0))
    });
    const result = await createManagedWindowsJobFirstEffectGate(environment(), native(
      () => Promise.resolve({ status: 'opened', processId: 4_100, session: opened })
    )).enter();

    expect(code(result)).toBe('transport-unavailable');
    expect(opened.assignCurrentProcess).not.toHaveBeenCalled();
    expect(opened.close).toHaveBeenCalledOnce();
  });

  it('does not transfer authority after assignment or post-assignment proof failure', async () => {
    const denied = session({
      isCurrentProcessInThisJob: () => Promise.resolve(observedBoolean(false)),
      queryActiveProcesses: () => Promise.resolve(observedActive(0)),
      assignCurrentProcess: () => Promise.resolve({ status: 'failed' })
    });
    const lost = session({
      isCurrentProcessInThisJob: vi.fn(sequence([
        observedBoolean(false),
        observedBoolean(false)
      ], observedBoolean(false))),
      queryActiveProcesses: () => Promise.resolve(observedActive(0))
    });
    const outcomes = await Promise.all([denied, lost].map(opened =>
      createManagedWindowsJobFirstEffectGate(environment(), native(
        () => Promise.resolve({ status: 'opened', processId: 4_100, session: opened })
      )).enter()));

    expect(outcomes.map(code)).toEqual(['transport-unavailable', 'transport-unavailable']);
    expect(denied.close).toHaveBeenCalledOnce();
    expect(lost.close).toHaveBeenCalledOnce();
  });

  it('contains synchronous and rejected native defects and closes any opened authority', async () => {
    const throwing = session({
      queryPolicy: () => { throw new Error('private-policy-detail'); }
    });
    const outcomes = await Promise.all([
      createManagedWindowsJobFirstEffectGate(environment(), native(
        () => Promise.reject(new Error('private-open-detail'))
      )).enter(),
      createManagedWindowsJobFirstEffectGate(environment(), native(
        () => Promise.resolve({ status: 'opened', processId: 4_100, session: throwing })
      )).enter()
    ]);

    expect(outcomes.map(code)).toEqual(['transport-unavailable', 'transport-unavailable']);
    expect(JSON.stringify(outcomes)).not.toContain('private');
    expect(throwing.close).toHaveBeenCalledOnce();
  });

  it('fails closed when rejected authority cannot be closed', async () => {
    const opened = session({
      queryPolicy: () => Promise.resolve({ status: 'incompatible' }),
      close: () => Promise.resolve(false)
    });
    const result = await createManagedWindowsJobFirstEffectGate(environment(), native(
      () => Promise.resolve({ status: 'opened', processId: 4_100, session: opened })
    )).enter();

    expect(code(result)).toBe('transport-unavailable');
  });
});
