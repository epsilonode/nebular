import { describe, expect, it, vi } from 'vitest';

import { parseCanonicalRepository } from './primitives.ts';
import {
  createBunWindowsFilesystemFactsRuntime,
  type WindowsFilesystemComponentInspection,
  type WindowsFilesystemNativePort
} from './bun-windows-filesystem-facts.ts';
import { createWindowsExecutionPathResolver } from './windows-execution-paths.ts';
import { createWindowsExecutionTargetEntrypointResolver } from './windows-tool-registry.ts';

const REPOSITORY = 'R:\\Code\\repository';
const WORKING_DIRECTORY = 'R:\\Code\\repository\\packages\\api';
const TARGET_ENTRYPOINT = 'R:\\Code\\repository\\packages\\api\\src\\main.ts';

type HarnessOptions = Readonly<{
  inspections?: Readonly<Record<string, Partial<WindowsFilesystemComponentInspection>>>;
  unavailableOpenPath?: string;
  rejectedInspectPath?: string;
  falseClosePath?: string;
  sessionCloseResult?: boolean;
}>;

const componentKind = (path: string): 'directory' | 'regular-file' =>
  /\.(?:exe|js|ts)$/u.test(path) ? 'regular-file' : 'directory';

const harness = (options: HarnessOptions = {}) => {
  const events: string[] = [];
  const openSession = vi.fn(() => Promise.resolve({
    status: 'opened' as const,
    session: {
      openComponent: (path: string) => {
        events.push(`open:${path}`);
        if (options.unavailableOpenPath === path) {
          return Promise.resolve({ status: 'unavailable' as const });
        }
        return Promise.resolve({
          status: 'opened' as const,
          component: {
            inspect: () => {
              events.push(`inspect:${path}`);
              if (options.rejectedInspectPath === path) {
                return Promise.reject(new Error('private inspection detail'));
              }
              const exact: WindowsFilesystemComponentInspection = {
                status: 'observed',
                canonicalPath: path,
                kind: componentKind(path),
                reparsePoint: false
              };
              return Promise.resolve({ ...exact, ...options.inspections?.[path] });
            },
            close: () => {
              events.push(`close:${path}`);
              return Promise.resolve(options.falseClosePath !== path);
            }
          }
        });
      },
      close: () => {
        events.push('close:session');
        return Promise.resolve(options.sessionCloseResult ?? true);
      }
    }
  }));
  const native: WindowsFilesystemNativePort = { openSession };
  return { native, events, openSession };
};

const canonicalRepository = () => {
  const result = parseCanonicalRepository(REPOSITORY);
  if (result.isErr()) throw new Error('invalid repository fixture');
  return result.value;
};

const canonicalWorkingDirectory = () => ({
  kind: 'canonical-windows-working-directory' as const,
  value: WORKING_DIRECTORY,
  repository: canonicalRepository(),
  relativePath: {
    kind: 'repository-relative-windows-directory' as const,
    value: 'packages/api'
  }
});

describe('Bun Windows filesystem facts leaf', () => {
  it('pins the unique DOS path chain, inspects every component, then closes in reverse order', async () => {
    const fixture = harness();
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');
    const result = await runtime.inspect({
      repositoryPath: REPOSITORY,
      workingDirectoryPath: WORKING_DIRECTORY
    });

    expect(result).toEqual({
      platform: 'win32',
      repository: {
        requestedPath: REPOSITORY,
        canonicalPath: REPOSITORY,
        kind: 'directory',
        traversesReparsePoint: false
      },
      workingDirectory: {
        requestedPath: WORKING_DIRECTORY,
        canonicalPath: WORKING_DIRECTORY,
        kind: 'directory',
        traversesReparsePoint: false
      }
    });
    expect(fixture.events).toEqual([
      'open:R:\\',
      'open:R:\\Code',
      'open:R:\\Code\\repository',
      'open:R:\\Code\\repository\\packages',
      'open:R:\\Code\\repository\\packages\\api',
      'inspect:R:\\',
      'inspect:R:\\Code',
      'inspect:R:\\Code\\repository',
      'inspect:R:\\Code\\repository\\packages',
      'inspect:R:\\Code\\repository\\packages\\api',
      'close:R:\\Code\\repository\\packages\\api',
      'close:R:\\Code\\repository\\packages',
      'close:R:\\Code\\repository',
      'close:R:\\Code',
      'close:R:\\',
      'close:session'
    ]);
  });

  it.each([
    'R:\\',
    'R:\\Code\\repository\\packages',
    TARGET_ENTRYPOINT
  ])('reports a reparse point at any traversed component so target admission rejects it: %s', async path => {
    const fixture = harness({ inspections: { [path]: { reparsePoint: true } } });
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');
    const resolver = createWindowsExecutionTargetEntrypointResolver(runtime);
    const result = await resolver.resolveTargetEntrypoint({
      repository: canonicalRepository(),
      workingDirectory: canonicalWorkingDirectory(),
      declaredEntrypoint: 'src/main.ts'
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-unavailable');
    expect(fixture.events.at(-1)).toBe('close:session');
  });

  it('fails closed when any native component canonicalizes with case, alias, or 8.3 drift', async () => {
    const fixture = harness({
      inspections: {
        'R:\\Code': { canonicalPath: 'R:\\CODE' }
      }
    });
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');

    expect(await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    })).toEqual({ status: 'unavailable' });
    expect(fixture.events.at(-1)).toBe('close:session');
  });

  it('exposes a role-free exact path fact for trusted runtime-owned artifacts', async () => {
    const fixture = harness();
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');

    expect(await runtime.inspectExistingPath(TARGET_ENTRYPOINT)).toEqual({
      requestedPath: TARGET_ENTRYPOINT,
      canonicalPath: TARGET_ENTRYPOINT,
      kind: 'regular-file',
      traversesReparsePoint: false
    });
    expect(fixture.events.at(-1)).toBe('close:session');
  });

  it('lets the directory capability reject a regular-file repository leaf', async () => {
    const fixture = harness({
      inspections: {
        [REPOSITORY]: { kind: 'regular-file' }
      }
    });
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');
    const resolver = createWindowsExecutionPathResolver(runtime);
    const result = await resolver.resolveWorkingDirectory({
      repository: canonicalRepository(),
      declaredCwd: 'packages/api'
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('repository-invalid');
  });

  it('closes all previously opened handles and the library after a mid-chain open failure', async () => {
    const fixture = harness({ unavailableOpenPath: 'R:\\Code\\repository\\packages' });
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');

    expect(await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    })).toEqual({ status: 'unavailable' });
    expect(fixture.events).toEqual([
      'open:R:\\',
      'open:R:\\Code',
      'open:R:\\Code\\repository',
      'open:R:\\Code\\repository\\packages',
      'close:R:\\Code\\repository',
      'close:R:\\Code',
      'close:R:\\',
      'close:session'
    ]);
  });

  it('closes every handle and the library after an inspection rejection', async () => {
    const fixture = harness({ rejectedInspectPath: 'R:\\Code' });
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');
    const result = await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    });

    expect(result).toEqual({ status: 'unavailable' });
    expect(fixture.events.filter(event => event.startsWith('close:')).length).toBe(8);
    expect(fixture.events.at(-1)).toBe('close:session');
    expect(JSON.stringify(result)).not.toContain('private inspection detail');
  });

  it.each([
    [{ falseClosePath: 'R:\\Code' }, 'component handle'],
    [{ sessionCloseResult: false }, 'native library']
  ] as const)('refuses successful facts when %s cleanup cannot be proved', async (options, _label) => {
    const fixture = harness(options);
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');

    expect(await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    })).toEqual({ status: 'unavailable' });
    expect(fixture.events.at(-1)).toBe('close:session');
  });

  it.each([
    'relative\\main.ts',
    '\\\\server\\share\\main.ts',
    '\\\\?\\R:\\Code\\main.ts',
    'R:/Code/main.ts'
  ])('rejects a noncanonical, UNC, device, or non-DOS path before native authority: %j', async path => {
    const fixture = harness();
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'win32');

    expect(await runtime.inspectExistingFile({ role: 'target-entrypoint', path }))
      .toEqual({ status: 'unavailable' });
    expect(fixture.openSession).not.toHaveBeenCalled();
  });

  it('does not load native authority off Windows', async () => {
    const fixture = harness();
    const runtime = createBunWindowsFilesystemFactsRuntime(fixture.native, 'linux');

    expect(await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    })).toEqual({ status: 'unavailable' });
    expect(fixture.openSession).not.toHaveBeenCalled();
  });

  it('maps a malformed native session observation to unavailable', async () => {
    const native = {
      openSession: () => Promise.resolve({ status: 'opened' })
    } as unknown as WindowsFilesystemNativePort;
    const runtime = createBunWindowsFilesystemFactsRuntime(native, 'win32');

    expect(await runtime.inspectExistingFile({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    })).toEqual({ status: 'unavailable' });
  });
});
