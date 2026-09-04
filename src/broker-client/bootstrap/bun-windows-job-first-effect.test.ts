import { describe, expect, it, vi } from 'vitest';

import {
  createBunManagedWindowsJobFirstEffectGate,
  createBunManagedWindowsJobNativePort
} from './bun-windows-job-first-effect.ts';
import {
  MANAGED_WINDOWS_JOB_ENVIRONMENT,
  type ManagedWindowsJobNativeSession
} from './windows-job-first-effect.ts';

const JOB_IDENTITY = `Local\\epsilonode.nebular.job.v1.${'ab'.repeat(32)}`;

const session = (): ManagedWindowsJobNativeSession => ({
  queryPolicy: () => Promise.resolve({ status: 'compatible' }),
  queryActiveProcesses: () => Promise.resolve({ status: 'observed', activeProcesses: 1 }),
  isCurrentProcessInAnyJob: () => Promise.resolve({ status: 'observed', value: false }),
  isCurrentProcessInThisJob: () => Promise.resolve({ status: 'observed', value: true }),
  assignCurrentProcess: () => Promise.resolve({ status: 'succeeded' }),
  close: vi.fn(() => Promise.resolve(true))
});

describe('Bun Windows Job first-effect native leaf', () => {
  it('rejects unsupported platform and architecture before loading native authority', async () => {
    const identity = { kind: 'managed-windows-job-identity' as const, value: JOB_IDENTITY };
    const outcomes = await Promise.all([
      createBunManagedWindowsJobNativePort('linux', 'x64').openCurrentProcess(identity),
      createBunManagedWindowsJobNativePort('win32', 'ia32').openCurrentProcess(identity),
      createBunManagedWindowsJobNativePort('win32', 'x64').openCurrentProcess({
        kind: 'managed-windows-job-identity',
        value: 'Local\\forged'
      })
    ]);

    expect(outcomes).toEqual([
      { status: 'unavailable' },
      { status: 'unavailable' },
      { status: 'unavailable' }
    ]);
  });

  it('composes the fixed process environment reader with an injected opaque native capability', async () => {
    const read = vi.fn((name: string): unknown => ({
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity]: JOB_IDENTITY,
      [MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId]: 'attempt-1'
    })[name]);
    const opened = session();
    const openCurrentProcess = vi.fn(() => Promise.resolve({
      status: 'opened' as const,
      processId: 4_100,
      session: opened
    }));
    const gate = createBunManagedWindowsJobFirstEffectGate({ read }, { openCurrentProcess });

    const result = await gate.enter();

    expect(result.isOk() && result.value.identity.state).toBe('already-contained');
    expect(read.mock.calls.map(call => call[0])).toEqual([
      MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity,
      MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId
    ]);
    expect(openCurrentProcess).toHaveBeenCalledExactlyOnceWith({
      kind: 'managed-windows-job-identity',
      value: JOB_IDENTITY
    });
    expect(opened.close).not.toHaveBeenCalled();
  });
});
