import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import type { OneShotReceiverIssue } from './one-shot-receiver.ts';
import type { OneShotResult } from './one-shot-slots.ts';
import {
  createBunWindowsNamedMutexNativePort,
  createWindowsNamedMutexAllocationPort,
  deriveWindowsNamedMutexName,
  type WindowsNamedMutexAcquisition,
  type WindowsNamedMutexAllocationConfig,
  type WindowsNamedMutexNativePort
} from './windows-named-mutex-allocation.ts';

const config = (
  namespace = 'nebular-test',
  profile = 'C:\\Users\\Broker\\AppData\\Local',
  timeoutMs = 100
): WindowsNamedMutexAllocationConfig => ({
  namespace,
  trustedProfileRoot: { kind: 'trusted-profile-root', value: profile },
  timeoutMs
});

const ok = <Value>(value: Value): OneShotResult<Value, OneShotReceiverIssue> => ({
  outcome: 'success',
  value
});

const acquired = (release: () => Promise<boolean> = () => Promise.resolve(true)):
WindowsNamedMutexAcquisition => ({
  status: 'acquired',
  disposition: 'ordinary',
  lease: { release }
});

const native = (acquire: WindowsNamedMutexNativePort['acquire']): WindowsNamedMutexNativePort => ({ acquire });

describe('Windows named-mutex allocation lock', () => {
  it('derives a stable opaque Local mutex name scoped by trusted user and receiver namespace', () => {
    const first = deriveWindowsNamedMutexName(config());
    const sameNormalizedScope = deriveWindowsNamedMutexName(config(
      'nebular-test',
      'c:\\users\\broker\\appdata\\local\\.'
    ));
    const otherUser = deriveWindowsNamedMutexName(config(
      'nebular-test',
      'C:\\Users\\Other\\AppData\\Local'
    ));
    const otherNamespace = deriveWindowsNamedMutexName(config('other-test'));

    expect(first).toEqual(sameNormalizedScope);
    expect(first).toEqual({
      outcome: 'success',
      value: expect.stringMatching(/^Local\\epsilonode\.nebular\.one-shot\.v1\.[a-f0-9]{64}$/u)
    });
    expect(otherUser).not.toEqual(first);
    expect(otherNamespace).not.toEqual(first);
    expect(JSON.stringify(first)).not.toContain('Users');
    expect(JSON.stringify(first)).not.toContain('Broker');
  });

  it.each([
    config('UPPERCASE'),
    config('x', '\\\\server\\share'),
    config('x', 'relative\\profile'),
    config('x', 'C:\\profile\0suffix'),
    config('x', 'C:\\profile', 0),
    config('x', 'C:\\profile', 10_001)
  ])('rejects invalid authority configuration without revealing its value', invalid => {
    const result = deriveWindowsNamedMutexName(invalid);

    expect(result).toEqual({
      outcome: 'failure',
      issue: {
        code: 'allocation-lock-unavailable',
        operation: 'lock',
        safeMessage: 'The bounded Windows allocation lock failed closed.'
      }
    });
    expect(JSON.stringify(result)).not.toContain(invalid.trustedProfileRoot.value);
  });

  it('acquires, runs, and releases exactly once while preserving the typed work outcome', async () => {
    const release = vi.fn(() => Promise.resolve(true));
    const acquire = vi.fn<WindowsNamedMutexNativePort['acquire']>(
      () => Promise.resolve(acquired(release))
    );
    const work = vi.fn(() => Promise.resolve(ok('complete')));
    const port = createWindowsNamedMutexAllocationPort<string>(config(), native(acquire));

    await expect(port.withAllocationLock('nebular-test', work)).resolves.toEqual(ok('complete'));
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire.mock.calls[0]?.[0]).toMatch(/^Local\\epsilonode\.nebular/u);
    expect(acquire.mock.calls[0]?.[1]).toBeGreaterThan(0);
    expect(acquire.mock.calls[0]?.[1]).toBeLessThanOrEqual(100);
    expect(work).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('admits an abandoned kernel mutex for the allocation domain to re-observe and reconcile', async () => {
    const release = vi.fn(() => Promise.resolve(true));
    const port = createWindowsNamedMutexAllocationPort<string>(config(), native(
      () => Promise.resolve({ status: 'acquired', disposition: 'abandoned', lease: { release } })
    ));

    await expect(port.withAllocationLock('nebular-test', () => Promise.resolve(ok('reconciled'))))
      .resolves.toEqual(ok('reconciled'));
    expect(release).toHaveBeenCalledOnce();
  });

  it('serializes concurrent local callers before invoking the recursive kernel mutex', async () => {
    let finishFirst: (() => void) | undefined;
    const firstGate = new Promise<void>(resolve => { finishFirst = resolve; });
    let active = 0;
    let maximumActive = 0;
    const acquire = vi.fn(() => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return Promise.resolve(acquired(() => {
        active -= 1;
        return Promise.resolve(true);
      }));
    });
    const port = createWindowsNamedMutexAllocationPort<string>(config('local-fifo', undefined, 500), native(acquire));
    const first = port.withAllocationLock('local-fifo', () => firstGate.then(() => ok('first')));
    const secondWork = vi.fn(() => Promise.resolve(ok('second')));
    const second = port.withAllocationLock('local-fifo', secondWork);

    await delay(20);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(secondWork).not.toHaveBeenCalled();
    finishFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual([ok('first'), ok('second')]);
    expect(maximumActive).toBe(1);
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('bounds local queue admission without executing an expired queued effect later', async () => {
    let finishFirst: (() => void) | undefined;
    const firstGate = new Promise<void>(resolve => { finishFirst = resolve; });
    const acquire = vi.fn(() => Promise.resolve(acquired()));
    const port = createWindowsNamedMutexAllocationPort<string>(config('bounded-fifo', undefined, 20), native(acquire));
    const first = port.withAllocationLock('bounded-fifo', () => firstGate.then(() => ok('first')));
    const secondWork = vi.fn(() => Promise.resolve(ok('second')));
    const second = port.withAllocationLock('bounded-fifo', secondWork);

    await expect(second).resolves.toEqual(expect.objectContaining({ outcome: 'failure' }));
    expect(secondWork).not.toHaveBeenCalled();
    finishFirst?.();
    await expect(first).resolves.toEqual(ok('first'));
    await delay(5);
    expect(secondWork).not.toHaveBeenCalled();
    expect(acquire).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 'timeout' as const },
    { status: 'unavailable' as const }
  ])('fails closed when native acquisition reports $status', async acquisition => {
    const work = vi.fn(() => Promise.resolve(ok('unsafe')));
    const port = createWindowsNamedMutexAllocationPort<string>(config(), native(
      () => Promise.resolve(acquisition)
    ));

    const result = await port.withAllocationLock('nebular-test', work);

    expect(result).toEqual(expect.objectContaining({ outcome: 'failure' }));
    expect(work).not.toHaveBeenCalled();
  });

  it('fails closed and releases after rejected or synchronously throwing work', async () => {
    const release = vi.fn(() => Promise.resolve(true));
    const port = createWindowsNamedMutexAllocationPort<string>(config(), native(
      () => Promise.resolve(acquired(release))
    ));
    const results = await Promise.all([
      port.withAllocationLock('nebular-test', () => Promise.reject(new Error('private rejection'))),
      port.withAllocationLock('nebular-test', () => { throw new Error('private throw'); })
    ]);

    expect(results).toEqual([
      expect.objectContaining({ outcome: 'failure' }),
      expect.objectContaining({ outcome: 'failure' })
    ]);
    expect(JSON.stringify(results)).not.toContain('private');
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('fails closed after a release failure even when work succeeded', async () => {
    const port = createWindowsNamedMutexAllocationPort<string>(config(), native(
      () => Promise.resolve(acquired(() => Promise.resolve(false)))
    ));

    await expect(port.withAllocationLock('nebular-test', () => Promise.resolve(ok('ran'))))
      .resolves.toEqual(expect.objectContaining({ outcome: 'failure' }));
  });

  it('rejects a mismatched namespace and a non-Windows native runtime before host authority', async () => {
    const acquire = vi.fn(() => Promise.resolve(acquired()));
    const work = vi.fn(() => Promise.resolve(ok('unsafe')));
    const configured = createWindowsNamedMutexAllocationPort<string>(config(), native(acquire));
    const foreignPlatform = createBunWindowsNamedMutexNativePort('linux');

    const mismatch = await configured.withAllocationLock('other-test', work);
    const unavailable = await foreignPlatform.acquire(
      'Local\\epsilonode.nebular.one-shot.v1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      10
    );

    expect(mismatch).toEqual(expect.objectContaining({ outcome: 'failure' }));
    expect(unavailable).toEqual({ status: 'unavailable' });
    expect(acquire).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
});
