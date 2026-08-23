import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type CommandReceipt = Readonly<{
  stderr: string;
  stdout: string;
}>;

type CommandOutcome =
  | Readonly<{ type: 'ok'; receipt: CommandReceipt }>
  | Readonly<{ type: 'err'; message: string }>;

type InstalledRuntimeReceipt = Readonly<{
  exportCounts: readonly number[];
  resolved: readonly string[];
}>;

const projectRoot = resolve(import.meta.dir, '..');
const entrypointNames = ['teleport', 'broker-client', 'recipe-runner', 'broker'] as const;

const run = async (command: readonly string[], cwd: string): Promise<CommandOutcome> => {
  const child = Bun.spawn({
    cmd: [...command],
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ]);
  return exitCode === 0
    ? { type: 'ok', receipt: { stdout, stderr } }
    : { type: 'err', message: `Installed-package command failed (${exitCode}): ${stderr || stdout}` };
};

const requireCommand = (outcome: CommandOutcome): CommandReceipt => {
  if (outcome.type === 'err') throw new Error(outcome.message);
  return outcome.receipt;
};

const parseRuntimeReceipt = (source: string): InstalledRuntimeReceipt => {
  const value: unknown = JSON.parse(source);
  if (typeof value !== 'object' || value === null || !('resolved' in value) || !('exportCounts' in value) ||
      !Array.isArray(value.resolved) || !value.resolved.every(item => typeof item === 'string') ||
      !Array.isArray(value.exportCounts) || !value.exportCounts.every(item => Number.isSafeInteger(item))) {
    throw new Error('Installed-package runtime receipt has an invalid shape.');
  }
  return { resolved: value.resolved, exportCounts: value.exportCounts };
};

const runtimeSmokeSource = (receiptPath: string): string => `
const specifiers = [
  '@epsilonode/nebular',
  '@epsilonode/nebular/broker-client',
  '@epsilonode/nebular/recipe-runner',
  '@epsilonode/nebular/broker'
];
const resolved = specifiers.map(specifier => import.meta.resolve(specifier));
const modules = await Promise.all(specifiers.map(specifier => import(specifier)));
const required = [
  'createTeleportCodecRegistry',
  'decodeBrokerControlMessage',
  'decodeAndAdmitRecipeXml',
  'resolveAndAuthorizeExecution'
];
if (!modules.every((module, index) => typeof module[required[index]] === 'function')) {
  throw new Error('Installed Nebular entrypoint is missing its public runtime witness.');
}
await Bun.write(${JSON.stringify(receiptPath)}, JSON.stringify({
  resolved,
  exportCounts: modules.map(module => Object.keys(module).length)
}));
`;

const fixturePackage = (tarballPath: string): string => JSON.stringify({
  name: 'nebular-installed-consumer-proof',
  private: true,
  type: 'module',
  dependencies: {
    '@epsilonode/nebular': `file:${tarballPath}`
  },
  devDependencies: {
    '@types/bun': '1.4.0',
    typescript: '6.0.2'
  }
}, undefined, 2);

const fixtureTsconfig = JSON.stringify({
  compilerOptions: {
    allowImportingTsExtensions: true,
    exactOptionalPropertyTypes: true,
    lib: ['ES2023', 'DOM', 'DOM.Iterable'],
    module: 'Preserve',
    moduleResolution: 'Bundler',
    noEmit: true,
    noUncheckedIndexedAccess: true,
    strict: true,
    target: 'ES2023',
    types: ['bun'],
    verbatimModuleSyntax: true
  },
  include: ['consumer.ts']
}, undefined, 2);

const temporaryRoot = await mkdtemp(join(tmpdir(), 'nebular-installed-package-'));
try {
  const packageDirectory = join(temporaryRoot, 'package');
  const consumerDirectory = join(temporaryRoot, 'consumer');
  const runtimeReceiptPath = join(consumerDirectory, 'runtime-receipt.json');
  await Promise.all([
    mkdir(packageDirectory, { recursive: true }),
    mkdir(consumerDirectory, { recursive: true })
  ]);

  requireCommand(await run([
    process.execPath,
    'pm',
    'pack',
    '--destination',
    packageDirectory,
    '--ignore-scripts',
    '--quiet'
  ], projectRoot));
  const packedNames = (await readdir(packageDirectory)).filter(name => name.endsWith('.tgz'));
  if (packedNames.length !== 1 || packedNames[0] === undefined) {
    throw new Error('Nebular pack must emit exactly one tarball.');
  }
  const tarballPath = join(packageDirectory, packedNames[0]);
  await Promise.all([
    Bun.write(join(consumerDirectory, 'package.json'), fixturePackage(tarballPath)),
    Bun.write(join(consumerDirectory, 'tsconfig.json'), fixtureTsconfig),
    Bun.write(join(consumerDirectory, 'runtime-smoke.ts'), runtimeSmokeSource(runtimeReceiptPath)),
    copyFile(join(projectRoot, 'tooling', 'fixtures', 'package-consumer.ts'), join(consumerDirectory, 'consumer.ts'))
  ]);

  requireCommand(await run([process.execPath, 'install', '--ignore-scripts'], consumerDirectory));
  const installedRoot = join(consumerDirectory, 'node_modules', '@epsilonode', 'nebular');
  const [installedStat, installedRealPath, tarballStat] = await Promise.all([
    lstat(installedRoot),
    realpath(installedRoot),
    stat(tarballPath)
  ]);
  if (installedStat.isSymbolicLink()) throw new Error('Installed Nebular package must not be a workspace symlink.');
  const normalizedTemporaryRoot = temporaryRoot.replaceAll('\\', '/');
  if (!installedRealPath.replaceAll('\\', '/').startsWith(`${normalizedTemporaryRoot}/`)) {
    throw new Error('Installed Nebular package escaped the isolated consumer directory.');
  }

  const installedManifest: unknown = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
  if (typeof installedManifest !== 'object' || installedManifest === null ||
      !('name' in installedManifest) || installedManifest.name !== '@epsilonode/nebular') {
    throw new Error('Installed tarball does not contain the Nebular package manifest.');
  }

  const typescriptEntrypoint = join(consumerDirectory, 'node_modules', 'typescript', 'bin', 'tsc');
  requireCommand(await run([
    process.execPath,
    typescriptEntrypoint,
    '--noEmit',
    '-p',
    'tsconfig.json'
  ], consumerDirectory));
  requireCommand(await run([process.execPath, 'runtime-smoke.ts'], consumerDirectory));
  const runtimeReceipt = parseRuntimeReceipt(await readFile(runtimeReceiptPath, 'utf8'));
  const expectedResolvedSuffixes = entrypointNames.map(name =>
    `/node_modules/@epsilonode/nebular/dist/${name}.js`
  );
  if (runtimeReceipt.resolved.length !== expectedResolvedSuffixes.length ||
      !runtimeReceipt.resolved.every((url, index) => url.startsWith('file:') &&
        url.replaceAll('\\', '/').endsWith(expectedResolvedSuffixes[index] ?? ''))) {
    throw new Error('Installed entrypoint resolution fell outside the packed Nebular runtime artifacts.');
  }
  if (runtimeReceipt.exportCounts.length !== entrypointNames.length ||
      runtimeReceipt.exportCounts.some(count => count <= 0)) {
    throw new Error('Installed entrypoint runtime exports are empty.');
  }

  console.log(JSON.stringify({
    artifact: '@epsilonode/nebular@0.1.0',
    entrypoints: entrypointNames,
    exportCounts: runtimeReceipt.exportCounts,
    resolvedFromInstalledTarball: true,
    tarballBytes: tarballStat.size,
    typesResolvedFromInstalledTarball: true
  }));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
