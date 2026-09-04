export const atomicProjectNames = [
  'teleport',
  'broker-client',
  'recipe-runner',
  'broker'
] as const;

export const defaultTestProjectNames = [
  'configuration',
  'teleport',
  'broker-client',
  'recipe-runner',
  'broker',
  'seam'
] as const;

export const pendingAtomicProjectNames = [] as const;

export type AtomicProjectName = (typeof atomicProjectNames)[number];
export type TestProjectName = 'configuration' | AtomicProjectName | 'seam' | 'live';
export type TestHarnessName = TestProjectName | 'bun-live';

export interface TestProjectSpec {
  readonly name: TestProjectName;
  readonly groupOrder: number;
  readonly include: readonly string[];
  readonly exclude?: readonly string[];
}

const atomicTestExcludes = [
  '**/*.seam.test.ts',
  '**/*.live.test.ts',
  '**/bun-sqlite-journal.test.ts'
] as const;

export const testProjectSpecs: readonly TestProjectSpec[] = [
  {
    name: 'configuration',
    groupOrder: 0,
    include: ['vitest.shared.test.ts']
  },
  ...atomicProjectNames.map((name, index): TestProjectSpec => ({
    name,
    groupOrder: index + 1,
    include: [
      `${name}.test.ts`,
      `src/${name}/**/*.test.ts`,
      ...(name === 'recipe-runner' ? ['src/recipe-contract/**/*.test.ts'] : [])
    ],
    exclude: atomicTestExcludes
  })),
  {
    name: 'seam',
    groupOrder: 5,
    include: ['**/*.seam.test.ts'],
    exclude: ['**/*.live.test.ts']
  },
  {
    name: 'live',
    groupOrder: 6,
    include: ['**/*.live.test.ts']
  }
];

export const classifyTestFile = (filePath: string): readonly TestHarnessName[] => {
  const normalized = filePath.replaceAll('\\', '/');
  if (normalized === 'vitest.shared.test.ts') return ['configuration'];
  if (normalized.endsWith('/bun-sqlite-journal.test.ts')) return ['bun-live'];
  if (!normalized.endsWith('.test.ts')) return [];
  if (normalized.endsWith('.live.test.ts')) return ['live'];
  if (normalized.endsWith('.seam.test.ts')) return ['seam'];
  if (normalized.startsWith('src/recipe-contract/')) return ['recipe-runner'];
  return atomicProjectNames.filter(name =>
    normalized === `${name}.test.ts` || normalized.startsWith(`src/${name}/`)
  );
};

export const conservativeProjectTestConfig = (spec: TestProjectSpec) => ({
  name: spec.name,
  environment: 'node' as const,
  ...(spec.exclude ? { exclude: [...spec.exclude] } : {}),
  fileParallelism: false,
  include: [...spec.include],
  isolate: true,
  maxConcurrency: 1,
  maxWorkers: 1,
  minWorkers: 1,
  passWithNoTests: false,
  pool: 'forks' as const,
  sequence: {
    concurrent: false,
    groupOrder: spec.groupOrder,
    hooks: 'list' as const,
    setupFiles: 'list' as const
  }
});
