export const conservativeProjectTestConfig = (name: string, groupOrder: number) => ({
  name,
  environment: 'node' as const,
  fileParallelism: false,
  isolate: true,
  maxConcurrency: 1,
  maxWorkers: 1,
  minWorkers: 1,
  passWithNoTests: true,
  pool: 'forks' as const,
  sequence: {
    concurrent: false,
    groupOrder,
    hooks: 'list' as const,
    setupFiles: 'list' as const
  }
});
