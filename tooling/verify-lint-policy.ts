import { resolve } from 'node:path';
import { ESLint } from 'eslint';

type NegativeFixture = Readonly<{
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

console.log(`Lint-policy conformance passed for ${fixtures.length} negative fixtures.`);
