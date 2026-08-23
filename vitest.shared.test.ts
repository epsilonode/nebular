import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  atomicProjectNames,
  classifyTestFile,
  conservativeProjectTestConfig,
  defaultTestProjectNames,
  pendingAtomicProjectNames,
  testProjectSpecs
} from './vitest.shared.ts';

describe('conservativeProjectTestConfig', () => {
  it('serializes files, tests, hooks, and workers', () => {
    const teleport = testProjectSpecs.find(project => project.name === 'teleport');
    expect(teleport).toBeDefined();
    if (!teleport) return;

    expect(conservativeProjectTestConfig(teleport)).toMatchObject({
      exclude: ['**/*.seam.test.ts', '**/*.live.test.ts', '**/bun-sqlite-journal.test.ts'],
      fileParallelism: false,
      include: ['teleport.test.ts', 'src/teleport/**/*.test.ts'],
      isolate: true,
      maxConcurrency: 1,
      maxWorkers: 1,
      minWorkers: 1,
      passWithNoTests: false,
      pool: 'forks',
      sequence: {
        concurrent: false,
        groupOrder: 1,
        hooks: 'list',
        setupFiles: 'list'
      }
    });
  });

  it('declares every target project once without enabling empty domains by default', () => {
    const names = testProjectSpecs.map(project => project.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'configuration',
      ...atomicProjectNames,
      'seam',
      'live'
    ]);
    expect(defaultTestProjectNames).toEqual([
      'configuration',
      'teleport',
      'broker-client',
      'recipe-runner',
      'broker',
      'seam'
    ]);
    const enabledByDefault = new Set<string>(defaultTestProjectNames);
    expect(pendingAtomicProjectNames.every(name => !enabledByDefault.has(name))).toBe(true);
  });

  it.each([
    ['vitest.shared.test.ts', ['configuration']],
    ['src/teleport/cartridge.test.ts', ['teleport']],
    ['src/teleport/teleport-restore.seam.test.ts', ['seam']],
    ['broker-client.test.ts', ['broker-client']],
    ['src/broker-client/client.test.ts', ['broker-client']],
    ['src/recipe-runner/runner.test.ts', ['recipe-runner']],
    ['src/broker/runtime.live.test.ts', ['live']],
    ['src/broker/bun-sqlite-journal.test.ts', ['bun-live']],
    ['broker.test.ts', ['broker']],
    ['src/broker/policy.test.ts', ['broker']]
  ] as const)('assigns %s to exactly one project', (filePath, expected) => {
    expect(classifyTestFile(filePath)).toEqual(expected);
  });

  it('assigns every committed root and source test to exactly one harness', async () => {
    const projectRoot = import.meta.dirname;
    const [rootEntries, sourceEntries] = await Promise.all([
      readdir(projectRoot),
      readdir(resolve(projectRoot, 'src'), { recursive: true })
    ]);
    const rootTests = rootEntries.filter(path => path.endsWith('.test.ts'));
    const sourceTests = sourceEntries
      .filter(path => path.endsWith('.test.ts'))
      .map(path => `src/${path.replaceAll('\\', '/')}`);
    const tests = [...rootTests, ...sourceTests].toSorted();

    expect(tests.length).toBeGreaterThan(0);
    tests.forEach(path => {
      expect(classifyTestFile(path), path).toHaveLength(1);
    });
  });
});
