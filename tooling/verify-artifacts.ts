import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dir, '..');
const outputDirectory = resolve(projectRoot, 'dist');
const evidenceDirectory = resolve(projectRoot, '.generated', 'build');
const entrypointNames = ['teleport', 'broker-client', 'recipe-runner', 'broker'] as const;
type EntrypointName = (typeof entrypointNames)[number];

type BuildOutputEvidence = Readonly<{
  inputs: Readonly<Record<string, unknown>>;
}>;

type BuildEvidence = Readonly<{
  outputs: Readonly<Record<string, BuildOutputEvidence>>;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseEvidence = (source: string): BuildEvidence => {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || !isRecord(parsed['outputs'])) throw new Error('Artifact metafile has an invalid shape.');
  const outputs = Object.fromEntries(Object.entries(parsed['outputs']).map(([path, output]) => {
    if (!isRecord(output) || !isRecord(output['inputs'])) throw new Error(`Artifact output ${path} has an invalid shape.`);
    return [path, { inputs: output['inputs'] }];
  }));
  return { outputs };
};

const normalized = (path: string): string => path.replaceAll('\\', '/');

const outputFor = (evidence: BuildEvidence, entrypoint: EntrypointName): BuildOutputEvidence => {
  const match = Object.entries(evidence.outputs)
    .find(([path]) => {
      const normalizedPath = normalized(path);
      return normalizedPath.endsWith(`/dist/${entrypoint}.js`) ||
        normalizedPath === `dist/${entrypoint}.js` ||
        normalizedPath === `./${entrypoint}.js`;
    });
  if (match === undefined) throw new Error(`Artifact metafile is missing ${entrypoint}.js.`);
  return match[1];
};

const forbiddenInputs: Readonly<Record<EntrypointName, readonly RegExp[]>> = {
  teleport: [/(^|\/)src\/(broker|broker-client|recipe-runner)(\/|$)/, /(^|\/)(broker|broker-client|recipe-runner)\.ts$/],
  'broker-client': [/(^|\/)src\/(broker|recipe-runner)(\/|$)/, /(^|\/)(broker|recipe-runner)\.ts$/],
  'recipe-runner': [/(^|\/)src\/broker(\/|$)/, /(^|\/)broker\.ts$/],
  broker: [/(^|\/)src\/recipe-runner(\/|$)/, /(^|\/)recipe-runner\.ts$/]
};

const assertAuthorityGraph = (entrypoint: EntrypointName, output: BuildOutputEvidence): void => {
  const invalid = Object.keys(output.inputs)
    .map(normalized)
    .filter(path => forbiddenInputs[entrypoint].some(pattern => pattern.test(path)));
  if (invalid.length > 0) throw new Error(`${entrypoint}.js crosses its authority boundary: ${invalid.join(', ')}`);
};

const expectedRuntimeFiles = entrypointNames.map(name => `${name}.js`).toSorted();
const runtimeEntries = await readdir(outputDirectory, { withFileTypes: true });
const actualRuntimeFiles = runtimeEntries.filter(entry => entry.isFile()).map(entry => entry.name).toSorted();
const unexpectedDirectories = runtimeEntries.filter(entry => entry.isDirectory() && entry.name !== 'types').map(entry => entry.name);
if (JSON.stringify(actualRuntimeFiles) !== JSON.stringify(expectedRuntimeFiles) || unexpectedDirectories.length > 0) {
  throw new Error(`Runtime output must contain exactly four JavaScript artifacts; found ${actualRuntimeFiles.join(', ')}.`);
}

const declarationDirectory = resolve(outputDirectory, 'types');
const expectedDeclarations = entrypointNames.map(name => `${name}.d.ts`).toSorted();
const actualDeclarations = (await readdir(declarationDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => entry.name)
  .toSorted();
if (JSON.stringify(actualDeclarations) !== JSON.stringify(expectedDeclarations)) {
  throw new Error(`Declaration output must expose exactly four root entries; found ${actualDeclarations.join(', ')}.`);
}

const packageSource = await readFile(resolve(projectRoot, 'package.json'), 'utf8');
const packageManifest: unknown = JSON.parse(packageSource);
const packageExports: unknown = isRecord(packageManifest) ? packageManifest['exports'] : undefined;
if (!isRecord(packageExports)) {
  throw new Error('Package manifest must declare the four explicit export maps.');
}
const expectedExportKeys = ['.', './broker-client', './recipe-runner', './broker'].toSorted();
const actualExportKeys = Object.keys(packageExports).toSorted();
if (JSON.stringify(actualExportKeys) !== JSON.stringify(expectedExportKeys)) {
  throw new Error(`Package public surface must expose exactly four entries; found ${actualExportKeys.join(', ')}.`);
}
entrypointNames.forEach(entrypoint => {
  const key = entrypoint === 'teleport' ? '.' : `./${entrypoint}`;
  const declaration: unknown = packageExports[key];
  if (!isRecord(declaration) ||
    declaration['types'] !== `./dist/types/${entrypoint}.d.ts` ||
    declaration['import'] !== `./dist/${entrypoint}.js` ||
    declaration['default'] !== `./dist/${entrypoint}.js`) {
    throw new Error(`Package export ${key} does not map to the ${entrypoint} artifact and declaration.`);
  }
});

const [portableSource, bunSource] = await Promise.all([
  readFile(resolve(evidenceDirectory, 'teleport.meta.json'), 'utf8'),
  readFile(resolve(evidenceDirectory, 'bun.meta.json'), 'utf8')
]);
const portableEvidence = parseEvidence(portableSource);
const bunEvidence = parseEvidence(bunSource);

entrypointNames.forEach(entrypoint => {
  const evidence = entrypoint === 'teleport' ? portableEvidence : bunEvidence;
  assertAuthorityGraph(entrypoint, outputFor(evidence, entrypoint));
});

const sharedRecipeKernelInputs = [
  'src/recipe-contract/canonical.ts',
  'src/recipe-contract/model.ts',
  'src/recipe-contract/primitives.ts',
  'src/recipe-contract/result.ts',
  'src/recipe-contract/xml.ts'
] as const;
(['recipe-runner', 'broker'] as const).forEach(entrypoint => {
  const inputs = Object.keys(outputFor(bunEvidence, entrypoint).inputs).map(normalized);
  const missing = sharedRecipeKernelInputs.filter(required =>
    !inputs.some(input => input.endsWith(required))
  );
  if (missing.length > 0) {
    throw new Error(`${entrypoint}.js does not consume the shared local recipe kernel: ${missing.join(', ')}`);
  }
});
const recipeRunnerPublicSource = await readFile(
  resolve(projectRoot, 'src', 'recipe-runner', 'public.ts'),
  'utf8'
);
if (!recipeRunnerPublicSource.includes("export * from '../recipe-contract/public.ts';")) {
  throw new Error('recipe-runner public authority does not route through the shared recipe-contract barrel.');
}

const forbiddenArtifactText = [
  'R:/Code/',
  'R:\\Code\\',
  '@wx/teleport-cartridge',
  '@bake/'
] as const;
const artifactSources = await Promise.all(entrypointNames.map(name => readFile(resolve(outputDirectory, `${name}.js`), 'utf8')));
artifactSources.forEach((source, index) => {
  const forbidden = forbiddenArtifactText.find(value => source.includes(value));
  if (forbidden !== undefined) throw new Error(`${entrypointNames[index] ?? 'unknown'} artifact contains forbidden text ${forbidden}.`);
});

const credentialLiteralPatterns = [
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u
] as const;
artifactSources.forEach((source, index) => {
  if (credentialLiteralPatterns.some(pattern => pattern.test(source))) {
    throw new Error(`${entrypointNames[index] ?? 'unknown'} artifact contains a credential-shaped literal.`);
  }
});

const forbiddenAuthorityLiterals: Readonly<Record<EntrypointName, readonly RegExp[]>> = {
  teleport: [/\bBun\./u, /\bbun:/u, /\bnode:/u, /Bun\.secrets/u, /bun:sqlite/u],
  'broker-client': [/Bun\.secrets/u, /bun:sqlite/u, /createBunSecretStore/u, /createBunSqliteAuthorityJournal/u],
  'recipe-runner': [/Bun\.secrets/u, /bun:sqlite/u, /createBunSecretStore/u, /createBunSqliteAuthorityJournal/u],
  broker: []
};
artifactSources.forEach((source, index) => {
  const entrypoint = entrypointNames[index];
  if (entrypoint === undefined) throw new Error('Artifact inventory and source inventory are inconsistent.');
  const forbidden = forbiddenAuthorityLiterals[entrypoint].find(pattern => pattern.test(source));
  if (forbidden !== undefined) {
    throw new Error(`${entrypoint} artifact contains forbidden authority literal ${forbidden.source}.`);
  }
});

const declarationSources = await Promise.all(entrypointNames.map(name =>
  readFile(resolve(declarationDirectory, `${name}.d.ts`), 'utf8')
));
declarationSources.forEach((source, index) => {
  if (source.includes('@bake/') || source.includes('R:/Code/')) {
    throw new Error(`${entrypointNames[index] ?? 'unknown'} declaration contains an external workspace path.`);
  }
});

const importedEntrypoints: readonly unknown[] = await Promise.all(entrypointNames.map(name =>
  import(pathToFileURL(resolve(outputDirectory, `${name}.js`)).href)
));
importedEntrypoints.forEach((module, index) => {
  if (!isRecord(module) || Object.keys(module).length === 0) {
    throw new Error(`${entrypointNames[index] ?? 'unknown'} artifact has no public runtime exports.`);
  }
});
