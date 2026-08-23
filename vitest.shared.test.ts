import { describe, expect, it } from 'vitest';
import { conservativeProjectTestConfig } from './vitest.shared.ts';

describe('conservativeProjectTestConfig', () => {
  it('serializes files, tests, hooks, and workers', () => {
    expect(conservativeProjectTestConfig('kernel', 1)).toMatchObject({
      fileParallelism: false,
      isolate: true,
      maxConcurrency: 1,
      maxWorkers: 1,
      minWorkers: 1,
      passWithNoTests: true,
      pool: 'forks',
      sequence: {
        concurrent: false,
        groupOrder: 1,
        hooks: 'list',
        setupFiles: 'list'
      }
    });
  });
});
