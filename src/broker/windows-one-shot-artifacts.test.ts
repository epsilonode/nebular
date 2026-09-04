import { describe, expect, it } from 'vitest';

import type { TrustedProfileRoot } from './journal.ts';
import { parseProcessAttemptId } from './primitives.ts';
import {
  observeWindowsOneShotProcessId,
  planWindowsOneShotArtifacts,
  prepareWindowsOneShotArtifacts,
  releaseWindowsOneShotArtifacts,
  type WindowsOneShotArtifactRuntimePort
} from './windows-one-shot-artifacts.ts';

const profile = (): TrustedProfileRoot => ({
  kind: 'trusted-profile-root',
  value: 'R:\\Users\\Example\\AppData\\Local'
});

const attempt = () => {
  const parsed = parseProcessAttemptId('attempt-artifacts-1');
  if (parsed.isErr()) throw new Error('invalid attempt fixture');
  return parsed.value;
};

const plan = () => {
  const planned = planWindowsOneShotArtifacts(profile(), attempt(), `sha256:${'a'.repeat(64)}`);
  if (planned.isErr()) throw new Error('invalid artifact plan fixture');
  return planned.value;
};

type HarnessOptions = Readonly<{
  existingFile?: string;
  reparsePath?: string;
  failedDirectory?: string;
  failedRemoval?: string;
  pidText?: string;
}>;

const harness = (options: HarnessOptions = {}) => {
  const directories = new Set<string>([profile().value]);
  const files = new Set<string>();
  const events: string[] = [];
  const runtime: WindowsOneShotArtifactRuntimePort = {
    ensureDirectory: path => {
      events.push(`mkdir:${path}`);
      if (options.failedDirectory === path) return Promise.resolve('unavailable');
      const outcome = directories.has(path) ? 'existing' as const : 'created' as const;
      directories.add(path);
      return Promise.resolve(outcome);
    },
    createExclusiveFile: path => {
      events.push(`create:${path}`);
      if (options.existingFile === path || files.has(path)) return Promise.resolve('already-exists');
      files.add(path);
      return Promise.resolve('created');
    },
    readBoundedFile: (_path, maximumBytes) => options.pidText === undefined
      ? Promise.resolve({ state: 'pending' })
      : Promise.resolve({
          state: 'read',
          text: options.pidText.slice(0, maximumBytes + 1)
        }),
    inspectExistingPath: path => {
      events.push(`inspect:${path}`);
      const kind = directories.has(path) ? 'directory' as const :
        files.has(path) ? 'regular-file' as const : 'other' as const;
      return Promise.resolve({
        requestedPath: path,
        canonicalPath: path,
        kind,
        traversesReparsePoint: options.reparsePath === path
      });
    },
    removeFile: path => {
      events.push(`unlink:${path}`);
      if (options.failedRemoval === path) return Promise.resolve('unavailable');
      const removed = files.delete(path);
      return Promise.resolve(removed ? 'removed' : 'missing');
    },
    removeDirectoryIfEmpty: path => {
      events.push(`rmdir:${path}`);
      if (options.failedRemoval === path) return Promise.resolve('unavailable');
      const removed = directories.delete(path);
      return Promise.resolve(removed ? 'removed' : 'missing');
    }
  };
  return { runtime, directories, files, events };
};

describe('trusted Windows one-shot artifacts', () => {
  it('derives only stable hashed current-user paths', () => {
    const first = plan();
    const second = plan();

    expect(second).toEqual(first);
    expect(first.directory).toMatch(/\\one-shot-runs\\[a-f0-9]{64}$/u);
    expect(first.directory.startsWith(profile().value)).toBe(true);
    expect(JSON.stringify(first)).not.toContain('credential');
  });

  it('pins each directory before descending and creates exact files exclusively', async () => {
    const planned = plan();
    const fixture = harness();
    const prepared = await prepareWindowsOneShotArtifacts(planned, fixture.runtime);

    expect(prepared.isOk()).toBe(true);
    expect(fixture.files).toEqual(new Set([
      planned.stdoutPath,
      planned.stderrPath,
      planned.pidPath
    ]));
    expect(fixture.events.indexOf(`inspect:${planned.directory}`))
      .toBeLessThan(fixture.events.indexOf(`create:${planned.stdoutPath}`));
  });

  it('rejects a reparse point before creating any output file', async () => {
    const planned = plan();
    const fixture = harness({ reparsePath: planned.directory });
    const prepared = await prepareWindowsOneShotArtifacts(planned, fixture.runtime);

    expect(prepared.isErr()).toBe(true);
    expect(fixture.events.some(event => event.startsWith('create:'))).toBe(false);
  });

  it('never truncates a pre-existing replay artifact and rolls back only new files', async () => {
    const planned = plan();
    const fixture = harness({ existingFile: planned.stderrPath });
    const prepared = await prepareWindowsOneShotArtifacts(planned, fixture.runtime);

    expect(prepared.isErr()).toBe(true);
    expect(fixture.events).toContain(`unlink:${planned.stdoutPath}`);
    expect(fixture.events).not.toContain(`unlink:${planned.stderrPath}`);
    expect(fixture.events).not.toContain(`create:${planned.pidPath}`);
  });

  it('treats the bounded PM2 pid file only as a strict decimal process candidate', async () => {
    const planned = plan();
    const fixture = harness({ pidText: '4200\n' });
    fixture.files.add(planned.pidPath);

    await expect(observeWindowsOneShotProcessId(planned, fixture.runtime)).resolves.toEqual({
      state: 'ready',
      processId: 4_200
    });
  });

  it.each(['0', '04200', '4200 trailing', '4200\n\n', '9'.repeat(17)])(
    'rejects malformed or oversized PM2 pid content: %s',
    async pidText => {
      const planned = plan();
      const fixture = harness({ pidText });
      fixture.files.add(planned.pidPath);

      await expect(observeWindowsOneShotProcessId(planned, fixture.runtime)).resolves.toEqual({
        state: 'invalid'
      });
    }
  );

  it('releases only the three exact files and their attempt leaf after cleanup', async () => {
    const planned = plan();
    const fixture = harness();
    const prepared = await prepareWindowsOneShotArtifacts(planned, fixture.runtime);
    if (prepared.isErr()) throw new Error('artifact preparation fixture failed');

    const released = await releaseWindowsOneShotArtifacts(planned, fixture.runtime);

    expect(released.isOk()).toBe(true);
    expect(fixture.files.size).toBe(0);
    expect(fixture.directories.has(planned.directory)).toBe(false);
    expect(fixture.directories.has(profile().value)).toBe(true);
  });

  it('reports partial release as typed recovery instead of claiming cleanup', async () => {
    const planned = plan();
    const fixture = harness({ failedRemoval: planned.stderrPath });
    const released = await releaseWindowsOneShotArtifacts(planned, fixture.runtime);

    expect(released.isErr()).toBe(true);
  });
});
