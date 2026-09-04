import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  BROKER_E2E_RECIPE_RELATIVE_PATH,
  BROKER_E2E_TARGET_BOOTSTRAP_RECEIPT_RELATIVE_PATH,
  BROKER_E2E_TARGET_FIRST_EFFECT_RECEIPT_RELATIVE_PATH,
  BROKER_E2E_TARGET_RECEIPT_RELATIVE_PATH,
  decodeCanaryCleanupReceipt,
  decodeCanaryProvisionReceipt,
  decodeCommittedRecipeProbeReceipt,
  decodeInstalledFourArtifactProbeReceipt,
  e2eErr,
  e2eOk,
  renderBrokerE2eRecipe,
  type CanaryCleanupReceipt,
  type CanaryProvisionReceipt,
  type CommittedRecipeProbeReceipt,
  type FourArtifactE2eResult,
  type InstalledFourArtifactProbeReceipt
} from './four-artifact-e2e-contract.ts';

const TEMPORARY_ROOT_PREFIX = 'nebular-four-artifact-e2e-';
const RECEIPT_MAX_BYTES = 16 * 1024;

export type PreparedFourArtifactE2eWorkspace = Readonly<{
  authorityDatabasePath: string;
  brokerEntrypointPath: string;
  bridgeEntrypointPath: string;
  commandTemporaryDirectory: string;
  gitExecutablePath: string;
  installedPackageRoot: string;
  packageTarballPath: string;
  receiptDirectory: string;
  recipePath: string;
  recipeTemplate: string;
  repositoryPath: string;
  targetEntrypointPath: string;
  targetBootstrapReceiptPath: string;
  targetFirstEffectReceiptPath: string;
  targetReceiptPath: string;
  temporaryRoot: string;
  trustedProfileRoot: string;
}>;

export type CommittedFourArtifactE2eWorkspace = PreparedFourArtifactE2eWorkspace & Readonly<{
  committedRecipe: CommittedRecipeProbeReceipt;
}>;

type SilentCommand = Readonly<{
  command: readonly string[];
  cwd: string;
  temporaryDirectory: string;
}>;

const projectRoot = resolve(import.meta.dir, '../..');
const fixtureRoot = resolve(import.meta.dir, 'fixtures');

const inheritedEnvironmentNames = [
  'ALLUSERSPROFILE',
  'APPDATA',
  'COMSPEC',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR'
] as const;

const childEnvironment = (temporaryDirectory: string): Readonly<Record<string, string>> => ({
  ...inheritedEnvironmentNames.reduce<Readonly<Record<string, string>>>((environment, name) => {
    const value = process.env[name];
    return value === undefined ? environment : { ...environment, [name]: value };
  }, {}),
  BUN_INSTALL_CACHE_DIR: join(temporaryDirectory, 'bun-cache'),
  TEMP: temporaryDirectory,
  TMP: temporaryDirectory,
  TMPDIR: temporaryDirectory
});

const runSilent = async (input: SilentCommand): Promise<boolean> => {
  const child = Bun.spawn({
    cmd: [...input.command],
    cwd: input.cwd,
    env: childEnvironment(input.temporaryDirectory),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  });
  return (await child.exited) === 0;
};

const readReceipt = async (path: string): Promise<FourArtifactE2eResult<unknown>> => {
  try {
    const facts = await stat(path);
    if (!facts.isFile() || facts.size < 2 || facts.size > RECEIPT_MAX_BYTES) {
      return e2eErr('receipt-invalid', 'receipt-read');
    }
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    return e2eOk(value);
  } catch {
    return e2eErr('receipt-invalid', 'receipt-read');
  }
};

const bridgeFailureCodes = [
  'artifact-resolution',
  'broker-client-witness',
  'broker-witness',
  'profile-witness',
  'recipe-runner-witness',
  'teleport-witness'
] as const;

const isUnknownRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bridgeFailurePhase = (value: unknown): string | undefined => {
  if (!isUnknownRecord(value)) return undefined;
  const record = value;
  const code = record['code'];
  if (record['format'] !== 'nebular-four-artifact-e2e/v1') return undefined;
  if (record['proof'] === 'installed-four-artifact-bridge-started') {
    return 'installed-bridge-operation-failed';
  }
  return record['proof'] === 'installed-four-artifact-probe-failed' &&
    typeof code === 'string' && bridgeFailureCodes.some(candidate => candidate === code)
    ? `installed-bridge-${code}`
    : undefined;
};

const runBridge = async (
  workspace: Pick<
    PreparedFourArtifactE2eWorkspace,
    'bridgeEntrypointPath' | 'commandTemporaryDirectory' | 'repositoryPath'
  >,
  command: readonly string[],
  receiptPath: string
): Promise<FourArtifactE2eResult<unknown>> => {
  await rm(receiptPath, { force: true });
  const completed = await runSilent({
    command: [process.execPath, workspace.bridgeEntrypointPath, ...command, '--receipt', receiptPath],
    cwd: workspace.repositoryPath,
    temporaryDirectory: workspace.commandTemporaryDirectory
  });
  if (completed) return readReceipt(receiptPath);
  const failureReceipt = await readReceipt(receiptPath);
  const phase = failureReceipt.type === 'ok' ? bridgeFailurePhase(failureReceipt.value) : undefined;
  return e2eErr('command-failed', phase ?? 'installed-bridge');
};

const fixturePackage = (tarballPath: string): string => JSON.stringify({
  name: 'nebular-four-artifact-live-consumer',
  private: true,
  type: 'module',
  dependencies: { '@epsilonode/nebular': `file:${tarballPath}` }
}, undefined, 2);

const within = (parent: string, child: string): boolean => {
  const fromParent = relative(resolve(parent), resolve(child));
  return fromParent.length > 0 && !fromParent.startsWith('..') && !isAbsolute(fromParent);
};

const safeTemporaryRoot = (temporaryRoot: string): boolean =>
  basename(temporaryRoot).startsWith(TEMPORARY_ROOT_PREFIX) && within(tmpdir(), temporaryRoot);

const requireSuccessfulCommand = async (
  command: readonly string[],
  cwd: string,
  temporaryDirectory: string,
  phase: string
): Promise<FourArtifactE2eResult<void>> =>
  await runSilent({ command, cwd, temporaryDirectory }) ? e2eOk(undefined) : e2eErr('command-failed', phase);

const installedImportReplacements = [
  ["'../../../teleport.ts'", "'@epsilonode/nebular'"],
  ["'../../../broker-client.ts'", "'@epsilonode/nebular/broker-client'"],
  ["'../../../recipe-runner.ts'", "'@epsilonode/nebular/recipe-runner'"],
  ["'../../../broker.ts'", "'@epsilonode/nebular/broker'"]
] as const;

const materializeInstalledFixture = async (
  sourceName: string,
  targetName: string,
  repositoryPath: string
): Promise<boolean> => {
  const source = await readFile(join(fixtureRoot, sourceName), 'utf8');
  const installed = installedImportReplacements.reduce(
    (text, [development, packageSpecifier]) => text.replaceAll(development, packageSpecifier),
    source
  );
  if (installed.includes("'../../../")) return false;
  await Bun.write(join(repositoryPath, targetName), installed);
  return true;
};

const copyConsumerFixtures = async (repositoryPath: string): Promise<boolean> => {
  const copied = await Promise.all([
    materializeInstalledFixture(
      'broker-e2e-installed-bridge.ts',
      'broker-e2e-installed-bridge.ts',
      repositoryPath
    ),
    materializeInstalledFixture(
      'broker-e2e-installed-broker.ts',
      'broker-e2e-broker.ts',
      repositoryPath
    ),
    materializeInstalledFixture(
      'broker-e2e-installed-target.ts',
      'broker-e2e-target.ts',
      repositoryPath
    ),
    materializeInstalledFixture(
      'broker-e2e-installed-production.ts',
      'broker-e2e-installed-production.ts',
      repositoryPath
    ),
    materializeInstalledFixture(
      'broker-e2e-installed-runner.ts',
      'broker-e2e-installed-runner.ts',
      repositoryPath
    ),
    copyFile(
      join(fixtureRoot, 'broker-e2e-application.ts'),
      join(repositoryPath, 'broker-e2e-application.ts')
    ).then(() => true)
  ]);
  return copied.every(value => value);
};

const verifyInstalledPackage = async (
  temporaryRoot: string,
  repositoryPath: string
): Promise<FourArtifactE2eResult<string>> => {
  const installedRoot = join(repositoryPath, 'node_modules', '@epsilonode', 'nebular');
  try {
    const [facts, canonical] = await Promise.all([lstat(installedRoot), realpath(installedRoot)]);
    return !facts.isSymbolicLink() && within(temporaryRoot, canonical)
      ? e2eOk(canonical)
      : e2eErr('installed-artifact-invalid', 'installed-package');
  } catch {
    return e2eErr('installed-artifact-invalid', 'installed-package');
  }
};

const probeInstalledPackage = async (
  workspace: Omit<PreparedFourArtifactE2eWorkspace, 'trustedProfileRoot'>
): Promise<FourArtifactE2eResult<InstalledFourArtifactProbeReceipt>> => {
  const receiptPath = join(workspace.receiptDirectory, 'installed-probe.json');
  const receipt = await runBridge(workspace, ['probe'], receiptPath);
  return receipt.type === 'ok'
    ? decodeInstalledFourArtifactProbeReceipt(receipt.value)
    : e2eErr(receipt.issue.code, receipt.issue.phase);
};

export const prepareFourArtifactE2eWorkspace = async (
  gitExecutablePath: string
): Promise<FourArtifactE2eResult<PreparedFourArtifactE2eWorkspace>> => {
  if (process.platform !== 'win32' || !isAbsolute(gitExecutablePath)) {
    return e2eErr('git-unavailable', 'workspace-prepare');
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), TEMPORARY_ROOT_PREFIX));
  if (!safeTemporaryRoot(temporaryRoot)) return e2eErr('workspace-prepare-failed', 'temporary-root');
  let ownershipTransferred = false;
  const packageDirectory = join(temporaryRoot, 'package');
  const repositoryPath = join(temporaryRoot, 'consumer-repository');
  const authorityDirectory = join(temporaryRoot, 'authority');
  const receiptDirectory = join(temporaryRoot, 'receipts');
  const commandTemporaryDirectory = join(temporaryRoot, 'command-temp');
  try {
    await Promise.all([
      mkdir(packageDirectory, { recursive: true }),
      mkdir(repositoryPath, { recursive: true }),
      mkdir(authorityDirectory, { recursive: true }),
      mkdir(receiptDirectory, { recursive: true }),
      mkdir(commandTemporaryDirectory, { recursive: true })
    ]);
    const packed = await requireSuccessfulCommand([
      process.execPath,
      'pm',
      'pack',
      '--destination',
      packageDirectory,
      '--ignore-scripts',
      '--quiet'
    ], projectRoot, commandTemporaryDirectory, 'package-pack');
    if (packed.type === 'err') return packed;
    const tarballs = (await readdir(packageDirectory)).filter(name => name.endsWith('.tgz'));
    const tarballName = tarballs.length === 1 ? tarballs[0] : undefined;
    if (tarballName === undefined) return e2eErr('installed-artifact-invalid', 'package-pack');
    const packageTarballPath = join(packageDirectory, tarballName);
    await Promise.all([
      Bun.write(join(repositoryPath, 'package.json'), fixturePackage(packageTarballPath)),
      Bun.write(join(repositoryPath, '.gitignore'), 'node_modules/\n.nebular-e2e/\n')
    ]);
    if (!(await copyConsumerFixtures(repositoryPath))) {
      return e2eErr('fixture-invalid', 'fixture-materialization');
    }
    const installed = await requireSuccessfulCommand(
      [process.execPath, 'install', '--ignore-scripts'],
      repositoryPath,
      commandTemporaryDirectory,
      'package-install'
    );
    if (installed.type === 'err') return installed;
    const installedPackageRoot = await verifyInstalledPackage(temporaryRoot, repositoryPath);
    if (installedPackageRoot.type === 'err') return installedPackageRoot;
    const bridgeEntrypointPath = join(repositoryPath, 'broker-e2e-installed-bridge.ts');
    const base = {
      authorityDatabasePath: join(authorityDirectory, 'authority.sqlite3'),
      brokerEntrypointPath: join(repositoryPath, 'broker-e2e-broker.ts'),
      bridgeEntrypointPath,
      commandTemporaryDirectory,
      gitExecutablePath,
      installedPackageRoot: installedPackageRoot.value,
      packageTarballPath,
      receiptDirectory,
      recipePath: join(repositoryPath, ...BROKER_E2E_RECIPE_RELATIVE_PATH.split('/')),
      recipeTemplate: await readFile(join(fixtureRoot, 'broker-e2e-recipe.xml'), 'utf8'),
      repositoryPath,
      targetEntrypointPath: join(repositoryPath, 'broker-e2e-target.ts'),
      targetBootstrapReceiptPath: join(
        repositoryPath,
        ...BROKER_E2E_TARGET_BOOTSTRAP_RECEIPT_RELATIVE_PATH.split('/')
      ),
      targetFirstEffectReceiptPath: join(
        repositoryPath,
        ...BROKER_E2E_TARGET_FIRST_EFFECT_RECEIPT_RELATIVE_PATH.split('/')
      ),
      targetReceiptPath: join(
        repositoryPath,
        ...BROKER_E2E_TARGET_RECEIPT_RELATIVE_PATH.split('/')
      ),
      temporaryRoot
    };
    const probe = await probeInstalledPackage(base);
    if (probe.type === 'err') return probe;
    ownershipTransferred = true;
    return e2eOk({ ...base, trustedProfileRoot: probe.value.trustedProfileRoot });
  } catch {
    return e2eErr('workspace-prepare-failed', 'workspace-prepare');
  } finally {
    if (!ownershipTransferred && safeTemporaryRoot(temporaryRoot)) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
};

export const commitFourArtifactE2eRecipe = async (
  workspace: PreparedFourArtifactE2eWorkspace,
  expectedSha256: string
): Promise<FourArtifactE2eResult<CommittedFourArtifactE2eWorkspace>> => {
  const rendered = renderBrokerE2eRecipe(workspace.recipeTemplate, expectedSha256);
  if (rendered.type === 'err') return rendered;
  try {
    await mkdir(dirname(workspace.recipePath), { recursive: true });
    await Bun.write(workspace.recipePath, rendered.value);
    const commands: readonly (readonly string[])[] = [
      [workspace.gitExecutablePath, 'init', '--quiet'],
      [workspace.gitExecutablePath, 'config', 'user.name', 'Nebular E2E'],
      [workspace.gitExecutablePath, 'config', 'user.email', 'nebular-e2e@invalid.example'],
      [workspace.gitExecutablePath, 'add', '--all'],
      [workspace.gitExecutablePath, 'commit', '--quiet', '-m', 'test: commit isolated broker E2E recipe'],
      [workspace.gitExecutablePath, 'rev-parse', '--verify', 'HEAD'],
      [workspace.gitExecutablePath, 'ls-files', '--error-unmatch', BROKER_E2E_RECIPE_RELATIVE_PATH],
      [workspace.gitExecutablePath, 'diff', '--quiet'],
      [workspace.gitExecutablePath, 'diff', '--cached', '--quiet']
    ];
    for (const command of commands) {
      const completed = await requireSuccessfulCommand(
        command,
        workspace.repositoryPath,
        workspace.commandTemporaryDirectory,
        'git-commit'
      );
      if (completed.type === 'err') return completed;
    }
    const receiptPath = join(workspace.receiptDirectory, 'recipe-probe.json');
    const receipt = await runBridge(
      workspace,
      ['decode-recipe', '--recipe', workspace.recipePath],
      receiptPath
    );
    if (receipt.type === 'err') return receipt;
    const decoded = decodeCommittedRecipeProbeReceipt(receipt.value);
    return decoded.type === 'ok'
      ? e2eOk({ ...workspace, committedRecipe: decoded.value })
      : decoded;
  } catch {
    return e2eErr('recipe-invalid', 'recipe-commit');
  }
};

export const provisionFourArtifactE2eCanary = async (
  workspace: PreparedFourArtifactE2eWorkspace,
  credentialReference: string
): Promise<FourArtifactE2eResult<CanaryProvisionReceipt>> => {
  const receipt = await runBridge(
    workspace,
    ['provision-canary', '--reference', credentialReference],
    join(workspace.receiptDirectory, 'canary-provision.json')
  );
  return receipt.type === 'ok'
    ? decodeCanaryProvisionReceipt(receipt.value)
    : e2eErr('canary-provision-failed', 'canary-provision');
};

export const deleteFourArtifactE2eCanary = async (
  workspace: PreparedFourArtifactE2eWorkspace,
  credentialReference: string
): Promise<FourArtifactE2eResult<CanaryCleanupReceipt>> => {
  const receipt = await runBridge(
    workspace,
    ['delete-canary', '--reference', credentialReference],
    join(workspace.receiptDirectory, 'canary-cleanup.json')
  );
  return receipt.type === 'ok'
    ? decodeCanaryCleanupReceipt(receipt.value)
    : e2eErr('canary-cleanup-failed', 'canary-cleanup');
};

export const cleanupFourArtifactE2eWorkspace = async (
  workspace: Pick<PreparedFourArtifactE2eWorkspace, 'temporaryRoot'>
): Promise<FourArtifactE2eResult<Readonly<{ temporaryWorkspace: 'absent' }>>> => {
  if (!safeTemporaryRoot(workspace.temporaryRoot)) {
    return e2eErr('resource-cleanup-failed', 'workspace-cleanup');
  }
  try {
    await rm(workspace.temporaryRoot, { recursive: true, force: true });
    const remains = await stat(workspace.temporaryRoot).then(
      () => true,
      () => false
    );
    return remains
      ? e2eErr('resource-cleanup-failed', 'workspace-cleanup')
      : e2eOk({ temporaryWorkspace: 'absent' });
  } catch {
    return e2eErr('resource-cleanup-failed', 'workspace-cleanup');
  }
};
