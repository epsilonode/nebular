import { describe, expect, it, vi } from 'vitest';

import { parseCanonicalRepository } from './primitives.ts';
import {
  createWindowsExecutionTargetEntrypointResolver,
  createWindowsExecutionToolRegistry,
  type WindowsExecutionFileInspectionRequest,
  type WindowsExecutionProcessFacts,
  type WindowsExecutionToolRuntimePort
} from './windows-tool-registry.ts';

const BUN_EXECUTABLE = 'C:\\Tools\\mise\\installs\\bun\\1.4.0\\bun.exe';
const BROKER_ENTRYPOINT = 'R:\\Code\\nebular\\dist\\broker.js';
const REPOSITORY = 'R:\\Code\\repository';
const WORKING_DIRECTORY = 'R:\\Code\\repository\\packages\\api';
const TARGET_ENTRYPOINT = 'R:\\Code\\repository\\packages\\api\\src\\main.ts';

const canonicalRepository = (value: string = REPOSITORY) => {
  const parsed = parseCanonicalRepository(value);
  if (parsed.isErr()) throw new Error('invalid repository fixture');
  return parsed.value;
};

const processFacts = (
  overrides: Partial<WindowsExecutionProcessFacts> = {}
): WindowsExecutionProcessFacts => ({
  platform: 'win32',
  runtime: 'bun',
  executablePath: BUN_EXECUTABLE,
  ...overrides
});

const exactFile = (request: WindowsExecutionFileInspectionRequest): unknown => ({
  role: request.role,
  requestedPath: request.path,
  canonicalPath: request.path,
  kind: 'regular-file',
  traversesReparsePoint: false
});

const runtime = (
  inspect: (request: WindowsExecutionFileInspectionRequest) => unknown = exactFile,
  currentProcess: () => unknown = processFacts
): WindowsExecutionToolRuntimePort => ({
  currentProcess,
  inspectExistingFile: request => Promise.resolve(inspect(request))
});

describe('Windows execution tool registry', () => {
  it('resolves exactly current process.execPath and one fixed canonical broker artifact', async () => {
    const currentProcess = vi.fn(processFacts);
    const inspectExistingFile = vi.fn((request: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(request)));
    const registry = createWindowsExecutionToolRegistry(
      { brokerEntrypointPath: BROKER_ENTRYPOINT },
      { currentProcess, inspectExistingFile }
    );

    expect(await registry.resolve({ declaredTool: 'bun' })).toEqual(expect.objectContaining({
      value: {
        kind: 'cooperative-bun-v1',
        executable: { kind: 'canonical-current-bun-executable', value: BUN_EXECUTABLE },
        brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: BROKER_ENTRYPOINT }
      }
    }));
    expect(currentProcess).toHaveBeenCalledTimes(1);
    expect(inspectExistingFile.mock.calls.map(([request]) => request)).toEqual([
      { role: 'current-bun-executable', path: BUN_EXECUTABLE },
      { role: 'broker-entrypoint', path: BROKER_ENTRYPOINT }
    ]);
  });

  it.each([
    'mise',
    'mise.exe',
    'mise run app',
    'cmd',
    'cmd.exe',
    'powershell',
    'pwsh',
    'bash',
    'sh',
    'native.exe',
    'C:\\Tools\\bun.exe',
    '.\\bun.exe',
    'Bun'
  ])('rejects task, shell, native, path, and noncanonical declarations without resolution: %j', async declaredTool => {
    const currentProcess = vi.fn(processFacts);
    const inspectExistingFile = vi.fn((request: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(request)));
    const registry = createWindowsExecutionToolRegistry(
      { brokerEntrypointPath: BROKER_ENTRYPOINT },
      { currentProcess, inspectExistingFile }
    );
    const result = await registry.resolve({ declaredTool });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-incompatible');
    expect(currentProcess).not.toHaveBeenCalled();
    expect(inspectExistingFile).not.toHaveBeenCalled();
  });

  it.each([
    ['non-Windows host', processFacts({ platform: 'linux' })],
    ['non-Bun host', processFacts({ runtime: 'unsupported' })],
    ['relative current executable', processFacts({ executablePath: 'bun.exe' })],
    ['UNC current executable', processFacts({ executablePath: '\\\\server\\bun.exe' })],
    ['device current executable', processFacts({ executablePath: '\\\\?\\C:\\bun.exe' })]
  ] as const)('rejects %s before file inspection', async (_label, facts) => {
    const inspectExistingFile = vi.fn((request: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(request)));
    const registry = createWindowsExecutionToolRegistry(
      { brokerEntrypointPath: BROKER_ENTRYPOINT },
      { currentProcess: () => facts, inspectExistingFile }
    );
    const result = await registry.resolve({ declaredTool: 'bun' });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-incompatible');
    expect(inspectExistingFile).not.toHaveBeenCalled();
  });

  it.each([
    'relative\\broker.js',
    '\\\\server\\share\\broker.js',
    '\\\\?\\C:\\broker.js',
    'R:/Code/nebular/dist/broker.js'
  ])('rejects a noncanonical fixed broker artifact before file inspection: %j', async brokerEntrypointPath => {
    const inspectExistingFile = vi.fn((request: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(request)));
    const registry = createWindowsExecutionToolRegistry(
      { brokerEntrypointPath },
      { currentProcess: processFacts, inspectExistingFile }
    );

    expect((await registry.resolve({ declaredTool: 'bun' })).isErr()).toBe(true);
    expect(inspectExistingFile).not.toHaveBeenCalled();
  });

  it.each([
    ['executable alias drift', (request: WindowsExecutionFileInspectionRequest) => ({
      ...exactFile(request) as Readonly<Record<string, unknown>>,
      canonicalPath: request.role === 'current-bun-executable' ? 'C:\\Real\\bun.exe' : request.path
    })],
    ['broker alias drift', (request: WindowsExecutionFileInspectionRequest) => ({
      ...exactFile(request) as Readonly<Record<string, unknown>>,
      canonicalPath: request.role === 'broker-entrypoint' ? 'R:\\Real\\broker.js' : request.path
    })],
    ['reparse traversal', (request: WindowsExecutionFileInspectionRequest) => ({
      ...exactFile(request) as Readonly<Record<string, unknown>>,
      traversesReparsePoint: request.role === 'broker-entrypoint'
    })],
    ['non-file artifact', (request: WindowsExecutionFileInspectionRequest) => ({
      ...exactFile(request) as Readonly<Record<string, unknown>>,
      kind: request.role === 'broker-entrypoint' ? 'directory' : 'regular-file'
    })],
    ['swapped role', (request: WindowsExecutionFileInspectionRequest) => ({
      ...exactFile(request) as Readonly<Record<string, unknown>>,
      role: request.role === 'broker-entrypoint' ? 'current-bun-executable' : 'broker-entrypoint'
    })],
    ['malformed observation', () => ({ status: 'resolved' })]
  ] as const)('fails closed for %s', async (_label, inspect) => {
    const registry = createWindowsExecutionToolRegistry(
      { brokerEntrypointPath: BROKER_ENTRYPOINT },
      runtime(inspect)
    );
    const result = await registry.resolve({ declaredTool: 'bun' });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-unavailable');
  });

  it('redacts thrown and rejected runtime failures', async () => {
    const canary = 'tool-resolution-secret-canary';
    const runtimes: readonly WindowsExecutionToolRuntimePort[] = [
      runtime(exactFile, () => { throw new Error(canary); }),
      {
        currentProcess: processFacts,
        inspectExistingFile: () => Promise.reject(new Error(canary))
      }
    ];
    const results = await Promise.all(runtimes.map(candidate =>
      createWindowsExecutionToolRegistry(
        { brokerEntrypointPath: BROKER_ENTRYPOINT },
        candidate
      ).resolve({ declaredTool: 'bun' })
    ));

    expect(results.every(result => result.isErr() && result.error[0].code === 'receiver-unavailable')).toBe(true);
    expect(JSON.stringify(results)).not.toContain(canary);
  });
});

describe('Windows target entrypoint resolver', () => {
  const repository = canonicalRepository();
  const request = {
    repository,
    workingDirectory: {
      kind: 'canonical-windows-working-directory' as const,
      value: WORKING_DIRECTORY,
      repository,
      relativePath: {
        kind: 'repository-relative-windows-directory' as const,
        value: 'packages/api'
      }
    },
    declaredEntrypoint: 'src/main.ts'
  };

  it('resolves argv[0] relative to the proved cwd and inspects only that exact file', async () => {
    const inspectExistingFile = vi.fn((inspection: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(inspection)));
    const resolver = createWindowsExecutionTargetEntrypointResolver({ inspectExistingFile });

    expect(await resolver.resolveTargetEntrypoint(request)).toEqual(expect.objectContaining({
      value: {
        kind: 'canonical-windows-target-entrypoint',
        value: TARGET_ENTRYPOINT,
        repository: REPOSITORY,
        workingDirectory: request.workingDirectory,
        relativePath: {
          kind: 'repository-relative-windows-target-entrypoint',
          value: 'src/main.ts'
        }
      }
    }));
    expect(inspectExistingFile).toHaveBeenCalledExactlyOnceWith({
      role: 'target-entrypoint',
      path: TARGET_ENTRYPOINT
    });
  });

  it.each([
    '../main.ts',
    'src\\main.ts',
    'R:/main.ts',
    '/main.ts',
    '--eval',
    'main'
  ])('rejects an entrypoint that cannot denote one repository-relative Bun file: %j', async declaredEntrypoint => {
    const inspectExistingFile = vi.fn((inspection: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(inspection)));
    const resolver = createWindowsExecutionTargetEntrypointResolver({ inspectExistingFile });

    expect((await resolver.resolveTargetEntrypoint({ ...request, declaredEntrypoint })).isErr()).toBe(true);
    expect(inspectExistingFile).not.toHaveBeenCalled();
  });

  it.each([
    ['alias drift', { canonicalPath: 'R:\\Code\\repository\\real\\main.ts' }],
    ['directory', { kind: 'directory' }],
    ['reparse traversal', { traversesReparsePoint: true }],
    ['wrong role', { role: 'broker-entrypoint' }]
  ] as const)('fails closed for target %s', async (_label, override) => {
    const resolver = createWindowsExecutionTargetEntrypointResolver({
      inspectExistingFile: inspection => Promise.resolve({
        ...exactFile(inspection) as Readonly<Record<string, unknown>>,
        ...override
      })
    });
    const result = await resolver.resolveTargetEntrypoint(request);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].code : '').toBe('receiver-unavailable');
  });

  it('rejects a cwd capability for another repository before inspection', async () => {
    const inspectExistingFile = vi.fn((inspection: WindowsExecutionFileInspectionRequest) =>
      Promise.resolve(exactFile(inspection)));
    const resolver = createWindowsExecutionTargetEntrypointResolver({ inspectExistingFile });
    const result = await resolver.resolveTargetEntrypoint({
      ...request,
      workingDirectory: {
        ...request.workingDirectory,
        repository: canonicalRepository('R:\\Code\\other')
      }
    });

    expect(result.isErr()).toBe(true);
    expect(inspectExistingFile).not.toHaveBeenCalled();
  });
});
