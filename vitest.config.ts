import { defineConfig } from 'vitest/config';
import { conservativeProjectTestConfig, testProjectSpecs } from './vitest.shared.ts';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html']
    },
    projects: testProjectSpecs.map(spec => ({
      extends: true,
      test: conservativeProjectTestConfig(spec)
    })),
    reporters: [
      'default',
      ['junit', { outputFile: 'reports/junit.xml' }],
      ['json', { outputFile: 'reports/results.json' }]
    ]
  }
});
