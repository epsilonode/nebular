import { resolve } from 'node:path';
import { ESLint } from 'eslint';

type NegativeFixture = Readonly<{
  file: string;
  rules: readonly string[];
}>;

type ExceptionSurface = Readonly<{
  file: string;
  rules: readonly string[];
}>;

const projectRoot = resolve(import.meta.dir, '..');
const fixtures: readonly NegativeFixture[] = [
  {
    file: 'src/teleport/__lint_negative__/ambient.fixture.ts',
    rules: ['no-restricted-globals']
  },
  {
    file: 'src/teleport/__lint_negative__/effects.fixture.ts',
    rules: [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/switch-exhaustiveness-check',
      'functional/no-throw-statements'
    ]
  },
  {
    file: 'src/teleport/__lint_negative__/forbidden-import.fixture.ts',
    rules: ['boundaries/dependencies']
  },
  {
    file: 'src/teleport/__lint_negative__/mutation.fixture.ts',
    rules: ['functional/immutable-data', 'functional/no-let']
  },
  {
    file: 'src/broker-client/__lint_negative__/privileged-import.fixture.ts',
    rules: ['boundaries/dependencies']
  },
  {
    file: 'src/recipe-runner/__lint_negative__/privileged-import.fixture.ts',
    rules: ['boundaries/dependencies']
  },
  {
    file: 'src/broker/__lint_negative__/deep-teleport.fixture.ts',
    rules: ['no-restricted-imports']
  },
  {
    file: 'src/broker/__lint_negative__/reverse-import.fixture.ts',
    rules: ['boundaries/dependencies']
  }
];

const strictRuleIds = [
  '@typescript-eslint/no-unsafe-type-assertion',
  'functional/immutable-data',
  'functional/no-class-inheritance',
  'functional/no-classes',
  'functional/no-let',
  'functional/no-loop-statements',
  'functional/no-mixed-types',
  'functional/no-promise-reject',
  'functional/no-this-expressions',
  'functional/no-throw-statements',
  'functional/no-try-statements',
  'functional/prefer-immutable-types',
  'functional/prefer-property-signatures',
  'functional/type-declaration-immutability'
] as const;

const exceptionSurfaces: readonly ExceptionSurface[] = [
  {
    file: 'src/teleport/browser-device-key-provider.ts',
    rules: [
      'functional/immutable-data',
      'functional/no-classes',
      'functional/no-let',
      'functional/no-promise-reject',
      'functional/no-this-expressions',
      'functional/no-throw-statements',
      'functional/no-try-statements',
      'functional/prefer-immutable-types'
    ]
  },
  { file: 'src/broker-client/primitives.ts', rules: ['@typescript-eslint/no-unsafe-type-assertion'] },
  {
    file: 'src/broker-client/inherited-ipc.ts',
    rules: ['functional/immutable-data', 'functional/no-let', 'functional/prefer-immutable-types']
  },
  {
    file: 'src/broker-client/bootstrap/bun-inherited-ipc.ts',
    rules: ['functional/immutable-data', 'functional/no-let', 'functional/prefer-immutable-types']
  },
  {
    file: 'src/broker-client/bootstrap/bun-process-environment.ts',
    rules: ['functional/immutable-data', 'functional/prefer-immutable-types']
  },
  {
    file: 'src/broker-client/result.ts',
    rules: ['functional/prefer-immutable-types', 'functional/type-declaration-immutability']
  },
  { file: 'src/broker-client/ipc.ts', rules: ['functional/prefer-immutable-types', 'functional/type-declaration-immutability'] },
  { file: 'src/broker/primitives.ts', rules: ['@typescript-eslint/no-unsafe-type-assertion'] },
  { file: 'src/broker/result.ts', rules: ['functional/prefer-immutable-types', 'functional/type-declaration-immutability'] },
  { file: 'src/broker/authority.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/bootstrap-authority.ts', rules: ['functional/prefer-immutable-types'] },
  {
    file: 'src/broker/bun-bootstrap-inherited-ipc.ts',
    rules: ['functional/immutable-data', 'functional/prefer-immutable-types']
  },
  {
    file: 'src/broker/bun-inherited-ipc.ts',
    rules: ['functional/immutable-data', 'functional/no-let', 'functional/prefer-immutable-types']
  },
  { file: 'src/broker/bun-secret-store.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/bun-sqlite-journal.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/effect-runtime.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/lease.ts', rules: ['functional/prefer-immutable-types', 'functional/type-declaration-immutability'] },
  { file: 'src/broker/operation.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/provider-contract.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/receiver.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/secret-delivery.ts', rules: ['functional/prefer-immutable-types'] },
  { file: 'src/broker/trusted-prompt.ts', rules: ['functional/prefer-immutable-types', 'functional/type-declaration-immutability'] }
];

const eslint = new ESLint({
  cwd: projectRoot,
  ignore: false,
  overrideConfigFile: resolve(projectRoot, 'eslint.config.js')
});

const results = await eslint.lintFiles(fixtures.map(fixture => resolve(projectRoot, fixture.file)));
const resultByFile = new Map(results.map(result => [resolve(result.filePath), result]));

fixtures.forEach(fixture => {
  const absolutePath = resolve(projectRoot, fixture.file);
  const result = resultByFile.get(absolutePath);
  if (result === undefined) throw new Error(`ESLint did not inspect negative fixture ${fixture.file}.`);

  const observedRules = new Set(result.messages.flatMap(message =>
    message.ruleId === null ? [] : [message.ruleId]
  ));
  const missingRules = fixture.rules.filter(rule => !observedRules.has(rule));
  if (missingRules.length > 0) {
    throw new Error(
      `Negative fixture ${fixture.file} failed to prove: ${missingRules.join(', ')}. ` +
      `Observed: ${[...observedRules].toSorted().join(', ') || 'none'}.`
    );
  }
});

const normalizedPath = (path: string): string => path.replaceAll('\\', '/');
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isProductionSource = (path: string): boolean => path.endsWith('.ts') &&
  !path.endsWith('.test.ts') && !path.includes('/__lint_negative__/') && !path.includes('/__type_negative__/');
const severityIsOff = (configuration: unknown): boolean => configuration === 0 || configuration === 'off' ||
  (Array.isArray(configuration) && (configuration[0] === 0 || configuration[0] === 'off'));
const sameRuleSet = (left: readonly string[], right: readonly string[]): boolean =>
  JSON.stringify(left.toSorted()) === JSON.stringify(right.toSorted());

const scannedSourceFiles = await Array.fromAsync(new Bun.Glob('src/**/*.ts').scan({
  cwd: projectRoot,
  onlyFiles: true
}));
const productionSourceFiles = [
  'teleport.ts',
  'broker-client.ts',
  'recipe-runner.ts',
  'broker.ts',
  ...scannedSourceFiles.map(normalizedPath).filter(isProductionSource)
].toSorted();
const expectedExceptions = new Map(exceptionSurfaces.map(surface => [surface.file, surface.rules]));

for (const file of productionSourceFiles) {
  const configuration: unknown = await eslint.calculateConfigForFile(resolve(projectRoot, file));
  if (!isRecord(configuration) || !isRecord(configuration['rules'])) {
    throw new Error(`ESLint did not calculate production policy for ${file}.`);
  }
  const configuredRules = configuration['rules'];
  const actualOffRules = strictRuleIds.filter(rule => severityIsOff(configuredRules[rule]));
  const expectedOffRules = expectedExceptions.get(file) ?? [];
  if (!sameRuleSet(actualOffRules, expectedOffRules)) {
    throw new Error(
      `Lint exception drift for ${file}. Expected [${expectedOffRules.join(', ')}], ` +
      `observed [${actualOffRules.join(', ')}].`
    );
  }
}

const missingExceptionFiles = exceptionSurfaces
  .map(surface => surface.file)
  .filter(file => !productionSourceFiles.includes(file));
if (missingExceptionFiles.length > 0) {
  throw new Error(`Lint exception inventory names missing production files: ${missingExceptionFiles.join(', ')}.`);
}

console.log(
  `Lint-policy conformance passed for ${fixtures.length} negative fixtures and ` +
  `${exceptionSurfaces.length} exact production exception surfaces.`
);
