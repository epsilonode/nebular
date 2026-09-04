import { win32 } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseCanonicalRepository, type CanonicalRepository } from './primitives.ts';
import type { BrokerResult } from './result.ts';
import {
  createWindowsExecutionPathResolver,
  parseRepositoryRelativeWindowsDirectory,
  type WindowsExecutionDirectoryFactsPort,
  type WindowsExecutionDirectoryInspectionRequest
} from './windows-execution-paths.ts';

const REPOSITORY_TEXT = 'R:\\Code\\repository';

const unwrap = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error(result.error[0].message);
  return result.value;
};

const repository = (): CanonicalRepository => unwrap(parseCanonicalRepository(REPOSITORY_TEXT));

const exactFacts = (
  request: WindowsExecutionDirectoryInspectionRequest,
  overrides: Readonly<Record<string, unknown>> = {}
): unknown => ({
  platform: 'win32',
  repository: {
    requestedPath: request.repositoryPath,
    canonicalPath: request.repositoryPath,
    kind: 'directory',
    traversesReparsePoint: false
  },
  workingDirectory: {
    requestedPath: request.workingDirectoryPath,
    canonicalPath: request.workingDirectoryPath,
    kind: 'directory',
    traversesReparsePoint: false
  },
  ...overrides
});

const factsPort = (
  project: (request: WindowsExecutionDirectoryInspectionRequest) => unknown = exactFacts
): WindowsExecutionDirectoryFactsPort => ({
  inspect: request => Promise.resolve(project(request))
});

describe('Windows repository-contained execution paths', () => {
  it('normalizes a repository-relative declaration and accepts only matching canonical directory facts', async () => {
    const inspect = vi.fn((request: WindowsExecutionDirectoryInspectionRequest) =>
      Promise.resolve(exactFacts(request)));
    const resolver = createWindowsExecutionPathResolver({ inspect });
    const result = await resolver.resolveWorkingDirectory({
      repository: repository(),
      declaredCwd: 'packages/api'
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value : undefined).toEqual({
      kind: 'canonical-windows-working-directory',
      value: win32.join(REPOSITORY_TEXT, 'packages', 'api'),
      repository: REPOSITORY_TEXT,
      relativePath: { kind: 'repository-relative-windows-directory', value: 'packages/api' }
    });
    expect(inspect).toHaveBeenCalledWith({
      repositoryPath: REPOSITORY_TEXT,
      workingDirectoryPath: win32.join(REPOSITORY_TEXT, 'packages', 'api')
    });
  });

  it('treats the sole dot declaration as the canonical repository root', async () => {
    const resolver = createWindowsExecutionPathResolver(factsPort());

    expect(await resolver.resolveWorkingDirectory({ repository: repository(), declaredCwd: '.' }))
      .toEqual(expect.objectContaining({
        value: expect.objectContaining({
          value: REPOSITORY_TEXT,
          relativePath: { kind: 'repository-relative-windows-directory', value: '.' }
        })
      }));
  });

  it.each([
    '..',
    '../outside',
    'packages/../outside',
    './packages',
    'packages//api',
    'C:\\outside',
    'C:outside',
    '\\rooted',
    '\\\\server\\share',
    '\\\\?\\C:\\device',
    '\\\\.\\C:\\device',
    '\\??\\C:\\device',
    '/rooted',
    'packages/con',
    'packages/trailing.',
    'packages/trailing '
  ])('rejects unsafe or aliased cwd syntax before runtime inspection: %j', async declaredCwd => {
    const inspect = vi.fn(() => Promise.resolve(undefined));
    const resolver = createWindowsExecutionPathResolver({ inspect });
    const result = await resolver.resolveWorkingDirectory({ repository: repository(), declaredCwd });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('process-plan-invalid');
    expect(inspect).not.toHaveBeenCalled();
  });

  it('canonicalizes accepted separators without allowing dot segments', () => {
    expect(parseRepositoryRelativeWindowsDirectory('packages\\api')).toEqual(expect.objectContaining({
      value: { kind: 'repository-relative-windows-directory', value: 'packages/api' }
    }));
  });

  it.each([
    ['repository reparse point', (request: WindowsExecutionDirectoryInspectionRequest) => exactFacts(request, {
      repository: {
        requestedPath: request.repositoryPath,
        canonicalPath: request.repositoryPath,
        kind: 'directory',
        traversesReparsePoint: true
      }
    })],
    ['cwd reparse point', (request: WindowsExecutionDirectoryInspectionRequest) => exactFacts(request, {
      workingDirectory: {
        requestedPath: request.workingDirectoryPath,
        canonicalPath: request.workingDirectoryPath,
        kind: 'directory',
        traversesReparsePoint: true
      }
    })],
    ['cwd alias drift', (request: WindowsExecutionDirectoryInspectionRequest) => exactFacts(request, {
      workingDirectory: {
        requestedPath: request.workingDirectoryPath,
        canonicalPath: `${request.workingDirectoryPath}-real`,
        kind: 'directory',
        traversesReparsePoint: false
      }
    })],
    ['repository alias drift', (request: WindowsExecutionDirectoryInspectionRequest) => exactFacts(request, {
      repository: {
        requestedPath: request.repositoryPath,
        canonicalPath: `${request.repositoryPath}-real`,
        kind: 'directory',
        traversesReparsePoint: false
      }
    })],
    ['non-directory cwd', (request: WindowsExecutionDirectoryInspectionRequest) => exactFacts(request, {
      workingDirectory: {
        requestedPath: request.workingDirectoryPath,
        canonicalPath: request.workingDirectoryPath,
        kind: 'regular-file',
        traversesReparsePoint: false
      }
    })],
    ['foreign platform facts', (request: WindowsExecutionDirectoryInspectionRequest) => ({
      ...exactFacts(request) as Readonly<Record<string, unknown>>,
      platform: 'linux'
    })],
    ['malformed facts', () => ({ status: 'resolved' })]
  ] as const)('fails closed for %s', async (_label, project) => {
    const resolver = createWindowsExecutionPathResolver(factsPort(project));
    const result = await resolver.resolveWorkingDirectory({
      repository: repository(),
      declaredCwd: 'packages/api'
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('repository-invalid');
  });

  it('rejects a noncanonical repository alias before consulting facts', async () => {
    const inspect = vi.fn(() => Promise.resolve(undefined));
    const resolver = createWindowsExecutionPathResolver({ inspect });
    const alias = unwrap(parseCanonicalRepository('R:/Code/repository'));

    const result = await resolver.resolveWorkingDirectory({ repository: alias, declaredCwd: '.' });
    expect(result.isErr()).toBe(true);
    expect(inspect).not.toHaveBeenCalled();
  });

  it('maps thrown and rejected inspection effects to the same redacted failure', async () => {
    const canary = 'private-path-canary';
    const ports: readonly WindowsExecutionDirectoryFactsPort[] = [
      { inspect: () => { throw new Error(canary); } },
      { inspect: () => Promise.reject(new Error(canary)) }
    ];
    const results = await Promise.all(ports.map(port =>
      createWindowsExecutionPathResolver(port).resolveWorkingDirectory({
        repository: repository(),
        declaredCwd: '.'
      })
    ));

    expect(results.every(result => result.isErr() && result.error[0].code === 'repository-invalid')).toBe(true);
    expect(JSON.stringify(results)).not.toContain(canary);
  });
});
