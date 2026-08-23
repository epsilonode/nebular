import { defineConfig } from 'vitest/config';
import { conservativeProjectTestConfig } from './vitest.shared.ts';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html']
    },
    projects: [
      {
        extends: true,
        test: {
          ...conservativeProjectTestConfig('configuration', 0),
          include: ['vitest.shared.test.ts']
        }
      },
      {
        extends: true,
        test: {
          ...conservativeProjectTestConfig('kernel', 1),
          include: ['src/cartridge.test.ts']
        }
      },
      {
        extends: true,
        test: {
          ...conservativeProjectTestConfig('restore', 2),
          include: ['src/restore-executor.test.ts']
        }
      },
      {
        extends: true,
        test: {
          ...conservativeProjectTestConfig('seam', 3),
          include: ['src/**/*.seam.test.ts']
        }
      },
      {
        extends: true,
        test: {
          ...conservativeProjectTestConfig('live', 4),
          include: ['src/**/*.live.test.ts']
        }
      }
    ],
    reporters: [
      'default',
      ['junit', { outputFile: 'reports/junit.xml' }],
      ['json', { outputFile: 'reports/results.json' }]
    ]
  }
});
