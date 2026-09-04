import { describe, expect, it, vi } from 'vitest';

import {
  createWindowsProcessIncarnationPort,
  readWindowsProcessIncarnation,
  type WindowsNativeProcessOpenObservation,
  type WindowsOpenedProcessInspection,
  type WindowsProcessNativePort
} from './windows-process-incarnation.ts';

const runtime = (
  openProcess: WindowsProcessNativePort['openProcess']
): WindowsProcessNativePort => ({ openProcess });

const opened = (
  inspection: () => Promise<WindowsOpenedProcessInspection>,
  close: () => Promise<boolean>
): WindowsNativeProcessOpenObservation => ({
  status: 'opened',
  process: { inspect: inspection, close }
});

describe('Windows process incarnation adapter', () => {
  it('derives a stable opaque incarnation from the PID and creation FILETIME', async () => {
    const close = vi.fn(() => Promise.resolve(true));
    const native = runtime(() => Promise.resolve(opened(
      () => Promise.resolve({ status: 'running', creationFileTime: 133_801_234_567_890_123n }),
      close
    )));

    const first = await readWindowsProcessIncarnation({ processId: 4_100 }, native, 'win32');
    const second = await readWindowsProcessIncarnation({ processId: 4_100 }, native, 'win32');
    const differentPid = await readWindowsProcessIncarnation({ processId: 4_101 }, native, 'win32');

    expect(first).toEqual(second);
    expect(first).toEqual({
      status: 'running',
      processId: 4_100,
      incarnation: {
        kind: 'process-incarnation',
        value: expect.stringMatching(/^windows-process-incarnation-v1-[0-9a-f]{64}$/u)
      }
    });
    expect(differentPid).not.toEqual(first);
    expect(JSON.stringify(first)).not.toContain('133801234567890123');
    expect(close).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ status: 'missing' }, 'missing'],
    [{ status: 'inaccessible' }, 'inaccessible'],
    [{ status: 'unavailable' }, 'unavailable']
  ] as const)('keeps the native %s outcome redacted and typed', async (nativeOutcome, expectedStatus) => {
    const result = await readWindowsProcessIncarnation(
      { processId: 4_100 },
      runtime(() => Promise.resolve(nativeOutcome)),
      'win32'
    );

    expect(result).toEqual({ status: expectedStatus, processId: 4_100 });
  });

  it('reports a terminated handle as stopped and closes it exactly once', async () => {
    const close = vi.fn(() => Promise.resolve(true));
    const result = await readWindowsProcessIncarnation(
      { processId: 4_100 },
      runtime(() => Promise.resolve(opened(
        () => Promise.resolve({ status: 'stopped' }),
        close
      ))),
      'win32'
    );

    expect(result).toEqual({ status: 'stopped', processId: 4_100 });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([0n, -1n, 0x1_0000_0000_0000_0000n])(
    'rejects an invalid creation FILETIME and still closes the handle: %s',
    async creationFileTime => {
      const close = vi.fn(() => Promise.resolve(true));
      const result = await readWindowsProcessIncarnation(
        { processId: 4_100 },
        runtime(() => Promise.resolve(opened(
          () => Promise.resolve({ status: 'running', creationFileTime }),
          close
        ))),
        'win32'
      );

      expect(result).toEqual({ status: 'unavailable', processId: 4_100 });
      expect(close).toHaveBeenCalledOnce();
    }
  );

  it('closes the handle after a rejected or synchronously throwing inspection', async () => {
    const rejectedClose = vi.fn(() => Promise.resolve(true));
    const throwingClose = vi.fn(() => Promise.resolve(true));
    const results = await Promise.all([
      readWindowsProcessIncarnation(
        { processId: 4_100 },
        runtime(() => Promise.resolve(opened(
          () => Promise.reject(new Error('private native detail')),
          rejectedClose
        ))),
        'win32'
      ),
      readWindowsProcessIncarnation(
        { processId: 4_101 },
        runtime(() => Promise.resolve(opened(
          () => { throw new Error('private native detail'); },
          throwingClose
        ))),
        'win32'
      )
    ]);

    expect(results).toEqual([
      { status: 'unavailable', processId: 4_100 },
      { status: 'unavailable', processId: 4_101 }
    ]);
    expect(rejectedClose).toHaveBeenCalledOnce();
    expect(throwingClose).toHaveBeenCalledOnce();
    expect(JSON.stringify(results)).not.toContain('private native detail');
  });

  it('refuses to claim a process identity when handle or library cleanup fails', async () => {
    const result = await readWindowsProcessIncarnation(
      { processId: 4_100 },
      runtime(() => Promise.resolve(opened(
        () => Promise.resolve({ status: 'running', creationFileTime: 10n }),
        () => Promise.resolve(false)
      ))),
      'win32'
    );

    expect(result).toEqual({ status: 'unavailable', processId: 4_100 });
  });

  it('closes a throwing close capability into a redacted unavailable result', async () => {
    const result = await readWindowsProcessIncarnation(
      { processId: 4_100 },
      runtime(() => Promise.resolve(opened(
        () => Promise.resolve({ status: 'running', creationFileTime: 10n }),
        () => { throw new Error('private close detail'); }
      ))),
      'win32'
    );

    expect(result).toEqual({ status: 'unavailable', processId: 4_100 });
  });

  it('does not load native authority on another platform or for an invalid Windows PID', async () => {
    const openProcess = vi.fn(() => Promise.resolve({ status: 'unavailable' as const }));
    const native = runtime(openProcess);
    const results = await Promise.all([
      readWindowsProcessIncarnation({ processId: 4_100 }, native, 'linux'),
      readWindowsProcessIncarnation({ processId: 0 }, native, 'win32'),
      readWindowsProcessIncarnation({ processId: 0x1_0000_0000 }, native, 'win32')
    ]);

    expect(results.every(result => result.status === 'unavailable')).toBe(true);
    expect(openProcess).not.toHaveBeenCalled();
  });

  it('maps rejected and synchronously throwing native opens to one redacted outcome', async () => {
    const results = await Promise.all([
      readWindowsProcessIncarnation(
        { processId: 4_100 },
        runtime(() => Promise.reject(new Error('private open detail'))),
        'win32'
      ),
      readWindowsProcessIncarnation(
        { processId: 4_101 },
        runtime(() => { throw new Error('private open detail'); }),
        'win32'
      )
    ]);

    expect(results).toEqual([
      { status: 'unavailable', processId: 4_100 },
      { status: 'unavailable', processId: 4_101 }
    ]);
    expect(JSON.stringify(results)).not.toContain('private open detail');
  });

  it('constructs the verifier-facing port without widening its observation surface', async () => {
    const port = createWindowsProcessIncarnationPort(runtime(
      () => Promise.resolve({ status: 'missing' })
    ), 'win32');
    expect(await port.readCurrentIncarnation({ processId: 4_100 })).toEqual({
      status: 'missing',
      processId: 4_100
    });
  });
});
