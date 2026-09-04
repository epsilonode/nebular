import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  e2eErr,
  e2eOk,
  decodeTargetDigestMatchReceipt,
  type FourArtifactE2eProductionCompletion,
  type FourArtifactE2eProductionInput,
  type FourArtifactE2eProductionPort,
  type FourArtifactE2eReceiverCleanupProof,
  type FourArtifactE2eResult
} from './four-artifact-e2e-contract.ts';

type IsolatedBrokerWrapperConfig = Readonly<{
  adapterTimeoutMs: number;
  authorityDatabasePath: string;
  brokerEntrypointPath: string;
  gitExecutablePath: string;
  namespace: string;
  pm2Endpoint: string;
  repositoryPath: string;
  trustedProfileRoot: string;
}>;

type InstalledAuthoritySeedReceipt = Readonly<{
  format: 'nebular-four-artifact-e2e/v1';
  proof: 'ordinary-authority-seeded';
  attemptId: string;
  attemptDigest: string;
  expectedJobIdentityCommitment: string;
}>;

type InstalledExecutionState = Readonly<{
  seed: InstalledAuthoritySeedReceipt;
  attemptIdentityProof: 'trusted-matches-seed' | 'trusted-differs-from-seed' | 'trusted-receipt-missing';
  brokerBootstrap: InstalledBrokerBootstrapOutcome;
  runnerTerminal: InstalledRunnerTerminalReceipt | null;
  targetBootstrap: InstalledTargetBootstrapOutcome;
  targetFirstEffect: InstalledTargetFirstEffectState;
  targetJobIdentity: InstalledTargetJobIdentityRelation;
  terminalDisposition: 'succeeded' | 'failed' | 'cancelled';
}>;

type InstalledTargetFirstEffectReceipt =
  | Readonly<{
      format: 'nebular-four-artifact-e2e/v1';
      proof: 'target-first-effect';
      state: 'assigned' | 'already-contained';
      jobIdentityCommitment: string;
    }>
  | Readonly<{
      format: 'nebular-four-artifact-e2e/v1';
      proof: 'target-first-effect';
      state: 'failed';
      jobIdentityCommitment: null;
    }>;

type InstalledTargetFirstEffectState = 'assigned' | 'already-contained' | 'failed' | 'missing';
type InstalledTargetJobIdentityRelation = 'matches' | 'differs' | 'missing';

type InstalledBrokerBootstrapOutcome =
  | 'succeeded'
  | 'receiver-verification-denied'
  | 'receiver-verification-durable-attempt-invalid'
  | 'receiver-verification-broker-process-unavailable'
  | 'receiver-verification-broker-process-invalid'
  | 'receiver-verification-broker-parent-mismatch'
  | 'receiver-verification-receiver-observation-unavailable'
  | 'receiver-verification-receiver-fact-invalid'
  | 'receiver-verification-receiver-fact-mismatch'
  | 'receiver-verification-incarnation-observation-unavailable'
  | 'receiver-verification-incarnation-fact-invalid'
  | 'receiver-verification-incarnation-mismatch'
  | 'authority-identity-mismatch'
  | 'durable-authority-unavailable'
  | 'authority-adapter-unavailable'
  | 'authority-reference-invalid'
  | 'grant-missing'
  | 'attempt-missing'
  | 'binding-missing'
  | 'authority-timing-invalid'
  | 'protocol-message-invalid'
  | 'secret-staging-invalid'
  | 'delivery-ambiguous'
  | 'inherited-ipc-unavailable'
  | 'ipc-send-failed'
  | 'ipc-disconnected'
  | 'ipc-timeout'
  | 'secret-operation-rejected'
  | 'issue-attempt-not-ready'
  | 'issue-bootstrap-rejected'
  | 'issue-grant-expired'
  | 'issue-grant-revoked'
  | 'issue-lease-expired'
  | 'issue-lease-invalid'
  | 'issue-lease-transition-invalid'
  | 'issue-recipe-drift'
  | 'issue-secret-input-invalid'
  | 'issue-secret-store-failed'
  | 'issue-secret-unavailable'
  | 'issue-slot-not-authorized'
  | 'issue-unknown'
  | 'missing';

type InstalledBrokerBootstrapReceipt = Readonly<{
  format: 'nebular-four-artifact-e2e/v1';
  proof: 'broker-bootstrap-terminal';
  outcome: Exclude<InstalledBrokerBootstrapOutcome, 'missing'>;
}>;

type InstalledTargetBootstrapOutcome =
  | 'prepared'
  | 'application-import-failed'
  | 'bootstrap-expired'
  | 'bootstrap-not-ready'
  | 'bootstrap-rejected'
  | 'bootstrap-rejected-attempt-mismatch'
  | 'bootstrap-rejected-authority-denied'
  | 'bootstrap-rejected-grant-expired'
  | 'bootstrap-rejected-grant-revoked'
  | 'bootstrap-rejected-protocol-invalid'
  | 'bootstrap-rejected-recipe-drift'
  | 'bootstrap-rejected-secret-unavailable'
  | 'bootstrap-rejected-slot-not-authorized'
  | 'environment-invalid'
  | 'invalid-input'
  | 'message-too-large'
  | 'protocol-mismatch'
  | 'sequence-invalid'
  | 'session-closed'
  | 'transport-unavailable'
  | 'missing';

type InstalledTargetBootstrapReceipt = Readonly<{
  format: 'nebular-four-artifact-e2e/v1';
  proof: 'target-bootstrap-terminal';
  outcome: Exclude<InstalledTargetBootstrapOutcome, 'missing'>;
}>;

type InstalledAttemptIdentityReceipt = Readonly<{
  format: 'nebular-four-artifact-e2e/v1';
  proof: 'trusted-broker-attempt-identity';
  attemptId: string;
}>;

type InstalledRunnerTerminalOutcome =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'protocol-error'
  | 'disconnected'
  | 'invalid'
  | 'control-error';

type InstalledRunnerTerminalReceipt = Readonly<{
  format: 'nebular-four-artifact-e2e/v1';
  proof: 'runner-terminal-observed';
  terminalAttempt: 'present' | 'absent';
  outcome: InstalledRunnerTerminalOutcome;
  code: string;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).toSorted();
  const expected = [...keys].toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

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

const isolatedEnvironment = (): Readonly<Record<string, string>> =>
  inheritedEnvironmentNames.reduce<Readonly<Record<string, string>>>((environment, name) => {
    const value = process.env[name];
    return value === undefined ? environment : { ...environment, [name]: value };
  }, {});

const runBoundedSilent = async (
  command: readonly string[],
  cwd: string,
  timeoutMs: number
): Promise<boolean> => {
  const child = Bun.spawn({
    cmd: [...command],
    cwd,
    env: isolatedEnvironment(),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>(resolveTimeout => {
    deadline = setTimeout(() => {
      child.kill();
      resolveTimeout(-1);
    }, timeoutMs);
  });
  const exitCode = await Promise.race([
    child.exited.then(code => code, () => -1),
    timeout
  ]);
  clearTimeout(deadline);
  return exitCode === 0;
};

const readBoundedJson = async (path: string): Promise<unknown> => {
  try {
    const facts = await stat(path);
    return facts.isFile() && facts.size > 1 && facts.size <= 16 * 1024
      ? JSON.parse(await readFile(path, 'utf8')) as unknown
      : undefined;
  } catch {
    return undefined;
  }
};

const decodeSeedReceipt = (value: unknown): InstalledAuthoritySeedReceipt | undefined =>
  isRecord(value) && hasExactKeys(value, [
    'format',
    'proof',
    'attemptId',
    'attemptDigest',
    'expectedJobIdentityCommitment'
  ]) &&
  value['format'] === 'nebular-four-artifact-e2e/v1' && value['proof'] === 'ordinary-authority-seeded' &&
  typeof value['attemptId'] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value['attemptId']) &&
  typeof value['attemptDigest'] === 'string' && /^[a-f0-9]{64}$/u.test(value['attemptDigest']) &&
  typeof value['expectedJobIdentityCommitment'] === 'string' &&
  /^[a-f0-9]{64}$/u.test(value['expectedJobIdentityCommitment'])
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'ordinary-authority-seeded',
        attemptId: value['attemptId'],
        attemptDigest: value['attemptDigest'],
        expectedJobIdentityCommitment: value['expectedJobIdentityCommitment']
      }
    : undefined;

const decodeAttemptIdentityReceipt = (value: unknown): InstalledAttemptIdentityReceipt | undefined =>
  isRecord(value) && hasExactKeys(value, ['format', 'proof', 'attemptId']) &&
  value['format'] === 'nebular-four-artifact-e2e/v1' &&
  value['proof'] === 'trusted-broker-attempt-identity' &&
  typeof value['attemptId'] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value['attemptId'])
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'trusted-broker-attempt-identity',
        attemptId: value['attemptId']
      }
    : undefined;

const decodeTargetFirstEffectReceipt = (value: unknown): InstalledTargetFirstEffectReceipt | undefined => {
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'proof', 'state', 'jobIdentityCommitment']) ||
      value['format'] !== 'nebular-four-artifact-e2e/v1' || value['proof'] !== 'target-first-effect') {
    return undefined;
  }
  if ((value['state'] === 'assigned' || value['state'] === 'already-contained') &&
      typeof value['jobIdentityCommitment'] === 'string' &&
      /^[a-f0-9]{64}$/u.test(value['jobIdentityCommitment'])) {
    return {
      format: 'nebular-four-artifact-e2e/v1',
      proof: 'target-first-effect',
      state: value['state'],
      jobIdentityCommitment: value['jobIdentityCommitment']
    };
  }
  return value['state'] === 'failed' && value['jobIdentityCommitment'] === null
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'target-first-effect',
        state: 'failed',
        jobIdentityCommitment: null
      }
    : undefined;
};

const targetBootstrapOutcomes = [
  'prepared',
  'application-import-failed',
  'bootstrap-expired',
  'bootstrap-not-ready',
  'bootstrap-rejected',
  'bootstrap-rejected-attempt-mismatch',
  'bootstrap-rejected-authority-denied',
  'bootstrap-rejected-grant-expired',
  'bootstrap-rejected-grant-revoked',
  'bootstrap-rejected-protocol-invalid',
  'bootstrap-rejected-recipe-drift',
  'bootstrap-rejected-secret-unavailable',
  'bootstrap-rejected-slot-not-authorized',
  'environment-invalid',
  'invalid-input',
  'message-too-large',
  'protocol-mismatch',
  'sequence-invalid',
  'session-closed',
  'transport-unavailable'
] as const;

const isTargetBootstrapOutcome = (
  value: unknown
): value is InstalledTargetBootstrapReceipt['outcome'] =>
  targetBootstrapOutcomes.some(outcome => outcome === value);

const decodeTargetBootstrapReceipt = (value: unknown): InstalledTargetBootstrapReceipt | undefined =>
  isRecord(value) && hasExactKeys(value, ['format', 'proof', 'outcome']) &&
  value['format'] === 'nebular-four-artifact-e2e/v1' && value['proof'] === 'target-bootstrap-terminal' &&
  isTargetBootstrapOutcome(value['outcome'])
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'target-bootstrap-terminal',
        outcome: value['outcome']
      }
    : undefined;

const brokerBootstrapOutcomes = [
  'succeeded',
  'receiver-verification-denied',
  'receiver-verification-durable-attempt-invalid',
  'receiver-verification-broker-process-unavailable',
  'receiver-verification-broker-process-invalid',
  'receiver-verification-broker-parent-mismatch',
  'receiver-verification-receiver-observation-unavailable',
  'receiver-verification-receiver-fact-invalid',
  'receiver-verification-receiver-fact-mismatch',
  'receiver-verification-incarnation-observation-unavailable',
  'receiver-verification-incarnation-fact-invalid',
  'receiver-verification-incarnation-mismatch',
  'authority-identity-mismatch',
  'durable-authority-unavailable',
  'authority-adapter-unavailable',
  'authority-reference-invalid',
  'grant-missing',
  'attempt-missing',
  'binding-missing',
  'authority-timing-invalid',
  'protocol-message-invalid',
  'secret-staging-invalid',
  'delivery-ambiguous',
  'inherited-ipc-unavailable',
  'ipc-send-failed',
  'ipc-disconnected',
  'ipc-timeout',
  'secret-operation-rejected',
  'issue-attempt-not-ready',
  'issue-bootstrap-rejected',
  'issue-grant-expired',
  'issue-grant-revoked',
  'issue-lease-expired',
  'issue-lease-invalid',
  'issue-lease-transition-invalid',
  'issue-recipe-drift',
  'issue-secret-input-invalid',
  'issue-secret-store-failed',
  'issue-secret-unavailable',
  'issue-slot-not-authorized',
  'issue-unknown'
] as const;

const isBrokerBootstrapOutcome = (
  value: unknown
): value is InstalledBrokerBootstrapReceipt['outcome'] =>
  brokerBootstrapOutcomes.some(outcome => outcome === value);

const decodeBrokerBootstrapReceipt = (value: unknown): InstalledBrokerBootstrapReceipt | undefined =>
  isRecord(value) && hasExactKeys(value, ['format', 'proof', 'outcome']) &&
  value['format'] === 'nebular-four-artifact-e2e/v1' && value['proof'] === 'broker-bootstrap-terminal' &&
  isBrokerBootstrapOutcome(value['outcome'])
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'broker-bootstrap-terminal',
        outcome: value['outcome']
      }
    : undefined;

const allowedRunnerTerminalCodes = [
  'recipe-execution-succeeded',
  'recipe-execution-failed',
  'request-cancelled',
  'receiver-failed',
  'receiver-unavailable',
  'receiver-incompatible',
  'receiver-launch-failed',
  'receiver-launch-configuration-failed',
  'receiver-launch-canonical-plan-failed',
  'receiver-launch-receiver-probe-failed',
  'receiver-launch-durable-reservation-failed',
  'receiver-launch-exact-start-failed',
  'receiver-launch-exact-start-invalid',
  'receiver-launch-exact-start-admission-failed',
  'receiver-launch-exact-start-lock-failed',
  'receiver-launch-exact-start-observation-failed',
  'receiver-launch-exact-start-artifact-preparation-failed',
  'receiver-launch-exact-start-receiver-start-failed',
  'receiver-launch-bootstrap-artifact-failed',
  'receiver-launch-bootstrap-job-pending',
  'receiver-launch-bootstrap-job-name-missing',
  'receiver-launch-bootstrap-job-empty',
  'receiver-launch-bootstrap-job-unavailable',
  'receiver-launch-bootstrap-job-multiple',
  'receiver-launch-bootstrap-job-policy-failed',
  'receiver-launch-bootstrap-process-incarnation-failed',
  'receiver-launch-bootstrap-job-membership-failed',
  'receiver-launch-bootstrap-journal-bind-failed',
  'receiver-launch-exact-start-ownership-failed',
  'receiver-launch-exact-start-confirmation-failed',
  'receiver-launch-exact-start-timing-failed',
  'receiver-launch-terminal-before-containment',
  'receiver-launch-process-incarnation-failed',
  'receiver-launch-job-containment-failed',
  'receiver-launch-bootstrap-binding-failed',
  'receiver-terminal-observation-failed',
  'receiver-clock-failed',
  'authority-denied',
  'request-invalid',
  'process-plan-invalid',
  'ipc-invalid',
  'ipc-disconnected',
  'cleanup-request-failed',
  'cleanup-durable-binding-failed',
  'cleanup-job-tree-failed',
  'cleanup-root-exit-failed',
  'cleanup-exposure-closure-failed',
  'cleanup-pm2-deletion-failed',
  'cleanup-journal-finalization-failed',
  'cleanup-artifact-release-failed',
  'redacted-terminal-code',
  'control-error'
] as const;

const isRunnerTerminalOutcome = (value: unknown): value is InstalledRunnerTerminalOutcome =>
  value === 'success' || value === 'failure' || value === 'cancelled' ||
  value === 'protocol-error' || value === 'disconnected' || value === 'invalid' ||
  value === 'control-error';

const isAllowedRunnerTerminalCode = (value: unknown): value is string =>
  typeof value === 'string' && allowedRunnerTerminalCodes.some(code => code === value);

const decodeRunnerTerminalReceipt = (value: unknown): InstalledRunnerTerminalReceipt | undefined =>
  isRecord(value) && hasExactKeys(value, ['format', 'proof', 'terminalAttempt', 'outcome', 'code']) &&
  value['format'] === 'nebular-four-artifact-e2e/v1' &&
  value['proof'] === 'runner-terminal-observed' &&
  (value['terminalAttempt'] === 'present' || value['terminalAttempt'] === 'absent') &&
  isRunnerTerminalOutcome(value['outcome']) && isAllowedRunnerTerminalCode(value['code'])
    ? {
        format: 'nebular-four-artifact-e2e/v1',
        proof: 'runner-terminal-observed',
        terminalAttempt: value['terminalAttempt'],
        outcome: value['outcome'],
        code: value['code']
      }
    : undefined;

const decodeCleanupProof = (value: unknown): FourArtifactE2eReceiverCleanupProof | undefined =>
  isRecord(value) && hasExactKeys(value, [
    'format',
    'proof',
    'pm2Record',
    'windowsJob',
    'trustedArtifacts',
    'secretExposures'
  ]) && value['format'] === 'nebular-four-artifact-e2e/v1' &&
  value['proof'] === 'receiver-cleanup-proved' && value['pm2Record'] === 'absent' &&
  value['windowsJob'] === 'absent' && value['trustedArtifacts'] === 'absent' &&
  value['secretExposures'] === 'closed'
    ? {
        pm2Record: 'absent',
        windowsJob: 'absent',
        trustedArtifacts: 'absent',
        secretExposures: 'closed'
      }
    : undefined;

const decodeAdminProgress = (value: unknown): string | undefined => {
  if (isRecord(value) && hasExactKeys(value, ['format', 'proof', 'phase', 'operation', 'code']) &&
      value['format'] === 'nebular-four-artifact-e2e/v1' &&
      value['proof'] === 'installed-production-failure' &&
      typeof value['code'] === 'string' && /^[a-z][a-z-]+$/u.test(value['code'])) {
    if (value['phase'] === 'journal' &&
        (value['operation'] === 'read' || value['operation'] === 'commit' || value['operation'] === 'reuse') &&
        value['code'].startsWith('journal-')) {
      return `journal-${value['operation']}-${value['code']}`;
    }
    if ((value['phase'] === 'request' || value['phase'] === 'plan') && value['operation'] === 'resolve') {
      return `${value['phase']}-${value['code']}`;
    }
    if (value['phase'] === 'reconcile' && typeof value['operation'] === 'string' &&
        /^[a-z][a-z-]+$/u.test(value['operation'])) {
      return `reconcile-${value['operation']}-${value['code']}`;
    }
  }
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'proof', 'phase']) ||
      value['format'] !== 'nebular-four-artifact-e2e/v1' ||
      value['proof'] !== 'installed-production-progress') return undefined;
  const phase = value['phase'];
  return typeof phase === 'string' && [
    'context',
    'repository',
    'recipe',
    'identities',
    'journal',
    'request',
    'plan',
    'artifacts'
  ].includes(phase)
    ? phase
    : undefined;
};

const importInstalledProductionArtifacts = async (
  installedPackageRoot: string
): Promise<FourArtifactE2eResult<Readonly<{ loaded: true }>>> => {
  try {
    const broker: unknown = await import(
      pathToFileURL(join(installedPackageRoot, 'dist', 'broker.js')).href
    );
    const recipeRunner: unknown = await import(
      pathToFileURL(join(installedPackageRoot, 'dist', 'recipe-runner.js')).href
    );
    return isRecord(broker) && isRecord(recipeRunner) &&
      typeof broker['createWindowsPm2OneShotComposition'] === 'function' &&
      typeof broker['createWindowsPm2OneShotBrokerOperationPort'] === 'function' &&
      typeof broker['BROKER_IPC_CHILD_ARGUMENT'] === 'string' &&
      typeof broker['BROKER_BOOTSTRAP_CHILD_MARKER'] === 'string' &&
      typeof broker['brokerIpcChildRequestId'] === 'function' &&
      typeof broker['brokerBootstrapChildExchangeId'] === 'function' &&
      typeof broker['resolveWindowsBrokerBootstrapChildPorts'] === 'function' &&
      typeof broker['runBrokerBootstrapInheritedIpcChild'] === 'function' &&
      typeof broker['runBrokerInheritedIpcChild'] === 'function' &&
      typeof recipeRunner['runRecipeRunnerCli'] === 'function' &&
      typeof recipeRunner['recipeOk'] === 'function'
      ? e2eOk({ loaded: true })
      : e2eErr('production-operation-api-unavailable', 'production-readiness');
  } catch {
    return e2eErr('production-operation-api-unavailable', 'production-readiness');
  }
};

const isolatedNamespace = (repositoryPath: string): string =>
  `nebular-e2e-${createHash('sha256').update(repositoryPath.toLocaleLowerCase('en-US')).digest('hex').slice(0, 24)}`;

const wrapperConfig = (
  input: Parameters<FourArtifactE2eProductionPort['materializeBrokerComposition']>[0]
): IsolatedBrokerWrapperConfig => ({
  adapterTimeoutMs: Math.min(input.timeoutMs, 10_000),
  authorityDatabasePath: input.authorityDatabasePath,
  brokerEntrypointPath: input.brokerEntrypointPath,
  gitExecutablePath: input.gitExecutablePath,
  namespace: isolatedNamespace(input.repositoryPath),
  pm2Endpoint: input.pm2Endpoint,
  repositoryPath: input.repositoryPath,
  trustedProfileRoot: input.trustedProfileRoot
});

const renderInstalledBrokerWrapper = (config: IsolatedBrokerWrapperConfig): string => `
import { createHash } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as broker from '@epsilonode/nebular/broker';
import * as recipeRunner from '@epsilonode/nebular/recipe-runner';

const CONFIG = Object.freeze(${JSON.stringify(config)});
const BOOTSTRAP_TERMINAL_RECEIPT = join(
  CONFIG.repositoryPath,
  '.nebular-e2e',
  'broker-bootstrap-terminal.json'
);
const BOOTSTRAP_TERMINAL_PENDING_RECEIPT = \`\${BOOTSTRAP_TERMINAL_RECEIPT}.pending\`;
const bootstrapAuthorityOutcome = result => {
  if (result.isOk()) return 'succeeded';
  const issue = result.error[0];
  const receiverVerification = /^Current managed process authority could not be verified \\(([a-z-]+)\\)\\.$/u
    .exec(issue.message);
  const receiverVerificationReasons = [
    'durable-attempt-invalid',
    'broker-process-unavailable',
    'broker-process-invalid',
    'broker-parent-mismatch',
    'receiver-observation-unavailable',
    'receiver-fact-invalid',
    'receiver-fact-mismatch',
    'incarnation-observation-unavailable',
    'incarnation-fact-invalid',
    'incarnation-mismatch'
  ];
  if (receiverVerification?.[1] !== undefined &&
      receiverVerificationReasons.includes(receiverVerification[1])) {
    return 'receiver-verification-' + receiverVerification[1];
  }
  const exactMessages = {
    'Current managed process authority could not be verified.': 'receiver-verification-denied',
    'Current recipe, grant, receiver, or attempt authority does not match.': 'authority-identity-mismatch',
    'Durable bootstrap authority is unavailable.': 'durable-authority-unavailable',
    'A privileged bootstrap authority adapter is unavailable.': 'authority-adapter-unavailable',
    'Bootstrap authority references are invalid.': 'authority-reference-invalid',
    'The requested grant does not exist.': 'grant-missing',
    'The requested process attempt does not exist.': 'attempt-missing',
    'The requested process attempt has no current bootstrap binding.': 'binding-missing',
    'Bootstrap authority timing is invalid.': 'authority-timing-invalid',
    'Secret-bearing bootstrap protocol message is invalid.': 'protocol-message-invalid',
    'Bootstrap secret staging rejected an invalid or duplicate slot.': 'secret-staging-invalid',
    'Secret delivery is ambiguous and requires exact process-tree recovery.': 'delivery-ambiguous',
    'Bootstrap inherited IPC is unavailable.': 'inherited-ipc-unavailable',
    'Bootstrap IPC send failed.': 'ipc-send-failed',
    'Bootstrap IPC disconnected before the expected message.': 'ipc-disconnected',
    'Bootstrap IPC receive exceeded its bounded deadline.': 'ipc-timeout',
    'The scoped secret operation was rejected.': 'secret-operation-rejected'
  };
  return exactMessages[issue.message] ?? (
    [
      'attempt-not-ready',
      'bootstrap-rejected',
      'grant-expired',
      'grant-revoked',
      'lease-expired',
      'lease-invalid',
      'lease-transition-invalid',
      'recipe-drift',
      'secret-input-invalid',
      'secret-store-failed',
      'secret-unavailable',
      'slot-not-authorized'
    ].includes(issue.code) ? \`issue-\${issue.code}\` : 'issue-unknown'
  );
};
const writeBootstrapTerminal = async result => {
  try {
    await mkdir(dirname(BOOTSTRAP_TERMINAL_RECEIPT), { recursive: true });
    await rm(BOOTSTRAP_TERMINAL_PENDING_RECEIPT, { force: true });
    await Bun.write(BOOTSTRAP_TERMINAL_PENDING_RECEIPT, JSON.stringify({
      format: 'nebular-four-artifact-e2e/v1',
      proof: 'broker-bootstrap-terminal',
      outcome: bootstrapAuthorityOutcome(result)
    }));
    await rename(BOOTSTRAP_TERMINAL_PENDING_RECEIPT, BOOTSTRAP_TERMINAL_RECEIPT);
  } catch {
    await rm(BOOTSTRAP_TERMINAL_PENDING_RECEIPT, { force: true }).catch(() => undefined);
  }
};
const clock = Object.freeze({ nowMs: () => Date.now() });
const trustedProfileRoot = Object.freeze({
  kind: 'trusted-profile-root',
  value: CONFIG.trustedProfileRoot
});
const gitExecutable = Object.freeze({
  kind: 'canonical-git-executable',
  value: CONFIG.gitExecutablePath
});
const localApplicationData = Object.freeze({
  resolveCurrentUserRoot: () => Promise.resolve(broker.journalOk(trustedProfileRoot))
});
const profilePath = broker.createTestOnlyProfilePathPort(CONFIG.authorityDatabasePath);
const journal = broker.createBunSqliteAuthorityJournal({
  profilePath,
  applicationVersion: broker.WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION,
  busyTimeoutMs: 250,
  clock
});
const defaultAuthorityRuntime = broker.createWindowsExecutionAuthorityContextRuntime();
const authorityContext = await broker.resolveWindowsExecutionAuthorityContext({
  adapterTimeoutMs: CONFIG.adapterTimeoutMs,
  journalBusyTimeoutMs: 250
}, {
  ...defaultAuthorityRuntime,
  journals: { create: () => journal }
});
if (authorityContext.isErr() ||
    authorityContext.value.trustedProfileRoot.value.toLocaleLowerCase('en-US') !==
      CONFIG.trustedProfileRoot.toLocaleLowerCase('en-US')) process.exit(78);
const oneShot = Object.freeze({
  brokerEntrypointPath: CONFIG.brokerEntrypointPath,
  namespace: CONFIG.namespace,
  slotCapacity: 1,
  pm2Endpoint: CONFIG.pm2Endpoint,
  adapterTimeoutMs: CONFIG.adapterTimeoutMs,
  allowedNonsecretEnvironmentNames: ['E2E_EXPECTED_PROVIDER_SHA256']
});
const operationRuntime = broker.createWindowsPm2OneShotBrokerOperationTestRuntime(
  () => Promise.resolve(broker.createWindowsPm2OneShotComposition(authorityContext.value, oneShot))
);
const operation = broker.createWindowsPm2OneShotBrokerOperationPort(
  { composition: { oneShot }, doctorTimeoutMs: CONFIG.adapterTimeoutMs },
  operationRuntime
);
const hostConfiguration = Object.freeze({
  read: () => Promise.resolve({
    type: 'ok',
    value: {
      kind: 'broker-host-configuration',
      schema: broker.BROKER_HOST_CONFIGURATION_SCHEMA,
      gitExecutable
    }
  })
});

const controlCount = Bun.argv.filter(value => value === broker.BROKER_IPC_CHILD_ARGUMENT).length;
const bootstrapCount = Bun.argv.filter(value => value === broker.BROKER_BOOTSTRAP_CHILD_MARKER).length;
if (controlCount + bootstrapCount !== 1) process.exit(64);
if (controlCount === 1 && Bun.argv.indexOf(broker.BROKER_IPC_CHILD_ARGUMENT) !== Bun.argv.length - 2) {
  process.exit(64);
}
if (bootstrapCount === 1 && Bun.argv.indexOf(broker.BROKER_BOOTSTRAP_CHILD_MARKER) !== Bun.argv.length - 2) {
  process.exit(64);
}
if (bootstrapCount === 1) {
  const exchangeId = broker.brokerBootstrapChildExchangeId(Bun.argv);
  if (exchangeId.isErr() || exchangeId.value === undefined) process.exit(64);
  const defaults = broker.createWindowsBrokerBootstrapCompositionRuntime({
    adapterTimeoutMs: CONFIG.adapterTimeoutMs
  });
  const ports = await broker.resolveWindowsBrokerBootstrapChildPorts({}, {
    ...defaults,
    localApplicationData,
    hostConfiguration,
    journal,
    clock
  });
  if (ports.isErr()) process.exit(78);
  const served = await broker.runBrokerBootstrapInheritedIpcChild(
    { exchangeId: exchangeId.value },
    ports.value
  );
  await writeBootstrapTerminal(served);
  process.exit(served.isOk() ? 0 : 1);
}
const requestId = broker.brokerIpcChildRequestId(Bun.argv);
if (requestId.isErr() || requestId.value === undefined) process.exit(64);
const served = await broker.runBrokerInheritedIpcChild(
  { requestId: requestId.value },
  broker.createBunInheritedIpcChildRuntime(),
  operation
);
process.exit(served.isOk() ? 0 : 1);
`;

const materializeInstalledBrokerWrapper = async (
  input: Parameters<FourArtifactE2eProductionPort['materializeBrokerComposition']>[0]
): Promise<FourArtifactE2eResult<Readonly<{ materialized: true }>>> => {
  const imported = await importInstalledProductionArtifacts(input.installedPackageRoot);
  if (imported.type === 'err') return e2eErr(imported.issue.code, 'production-composition');
  const pendingPath = `${input.brokerEntrypointPath}.pending`;
  try {
    await rm(pendingPath, { force: true });
    await Bun.write(pendingPath, renderInstalledBrokerWrapper(wrapperConfig(input)));
    const built = await Bun.build({
      entrypoints: [pendingPath],
      target: 'bun',
      external: ['@epsilonode/nebular/broker', '@epsilonode/nebular/recipe-runner']
    });
    if (!built.success) {
      await rm(pendingPath, { force: true });
      return e2eErr('production-operation-failed', 'production-composition');
    }
    await rename(pendingPath, input.brokerEntrypointPath);
    const facts = await lstat(input.brokerEntrypointPath);
    return facts.isFile() && !facts.isSymbolicLink()
      ? e2eOk({ materialized: true })
      : e2eErr('production-operation-failed', 'production-composition');
  } catch {
    await rm(pendingPath, { force: true });
    return e2eErr('production-operation-failed', 'production-composition');
  }
};

const adminDirectory = (input: FourArtifactE2eProductionInput): string =>
  join(input.repositoryPath, '.nebular-e2e');

const adminInput = (
  input: FourArtifactE2eProductionInput,
  terminalDisposition: InstalledExecutionState['terminalDisposition'],
  seed?: InstalledAuthoritySeedReceipt,
  attemptIdentityProof: InstalledExecutionState['attemptIdentityProof'] = 'trusted-receipt-missing'
): Readonly<Record<string, unknown>> => ({
  attemptDigest: seed?.attemptDigest ?? null,
  attemptIdentityProof,
  attemptId: seed?.attemptId ?? null,
  authorityDatabasePath: input.authorityDatabasePath,
  brokerEntrypointPath: input.brokerEntrypointPath,
  credentialReference: input.credentialReference,
  gitExecutablePath: input.gitExecutablePath,
  grantId: input.grantId,
  namespace: isolatedNamespace(input.repositoryPath),
  pm2Endpoint: input.pm2Endpoint,
  recipeRelativePath: input.recipeRelativePath,
  repositoryPath: input.repositoryPath,
  terminalDisposition,
  timeoutMs: input.timeoutMs,
  trustedProfileRoot: input.trustedProfileRoot
});

const invokeInstalledAdmin = async (
  input: FourArtifactE2eProductionInput,
  command: 'seed' | 'reconcile',
  terminalDisposition: InstalledExecutionState['terminalDisposition'],
  seed?: InstalledAuthoritySeedReceipt,
  attemptIdentityProof?: InstalledExecutionState['attemptIdentityProof']
): Promise<FourArtifactE2eResult<unknown>> => {
  const directory = adminDirectory(input);
  const inputPath = join(directory, 'production-input.json');
  const receiptPath = join(directory, `production-${command}-receipt.json`);
  const adminEntrypoint = join(input.repositoryPath, 'broker-e2e-installed-production.ts');
  try {
    await mkdir(directory, { recursive: true });
    await Promise.all([
      Bun.write(inputPath, JSON.stringify(adminInput(input, terminalDisposition, seed, attemptIdentityProof))),
      rm(receiptPath, { force: true })
    ]);
    const completed = await runBoundedSilent([
      process.execPath,
      adminEntrypoint,
      command,
      '--input',
      inputPath,
      '--receipt',
      receiptPath
    ], input.repositoryPath, input.timeoutMs + 15_000);
    if (!completed) {
      const progress = decodeAdminProgress(await readBoundedJson(receiptPath));
      return e2eErr(
        'production-operation-failed',
        progress === undefined ? `production-${command}` : `production-${command}-${progress}`
      );
    }
    const receipt = await readBoundedJson(receiptPath);
    return receipt === undefined
      ? e2eErr('receipt-invalid', `production-${command}`)
      : e2eOk(receipt);
  } catch {
    return e2eErr('production-operation-failed', `production-${command}`);
  }
};

const seedInstalledAuthority = async (
  input: FourArtifactE2eProductionInput
): Promise<FourArtifactE2eResult<InstalledAuthoritySeedReceipt>> => {
  const invoked = await invokeInstalledAdmin(input, 'seed', 'failed');
  if (invoked.type === 'err') return invoked;
  const decoded = decodeSeedReceipt(invoked.value);
  return decoded === undefined
    ? e2eErr('receipt-invalid', 'production-seed')
    : e2eOk(decoded);
};

const runInstalledRecipeRunner = (
  input: FourArtifactE2eProductionInput
): Promise<boolean> => runBoundedSilent([
  process.execPath,
  join(input.repositoryPath, 'broker-e2e-installed-runner.ts'),
  'run',
  '--broker',
  input.brokerEntrypointPath,
  '--cwd',
  input.repositoryPath,
  '--recipe',
  input.recipeRelativePath,
  '--grant-id',
  input.grantId,
  '--timeout-ms',
  String(input.timeoutMs)
], input.repositoryPath, input.timeoutMs + 15_000);

const runnerAttemptReceiptPath = (input: FourArtifactE2eProductionInput): string =>
  join(adminDirectory(input), 'runner-attempt.json');

const runnerTerminalReceiptPath = (input: FourArtifactE2eProductionInput): string =>
  join(adminDirectory(input), 'runner-terminal.json');

const readRunnerAttemptIdentity = async (
  input: FourArtifactE2eProductionInput
): Promise<InstalledAttemptIdentityReceipt | undefined> =>
  decodeAttemptIdentityReceipt(await readBoundedJson(runnerAttemptReceiptPath(input)));

const readRunnerTerminal = async (
  input: FourArtifactE2eProductionInput
): Promise<InstalledRunnerTerminalReceipt | undefined> =>
  decodeRunnerTerminalReceipt(await readBoundedJson(runnerTerminalReceiptPath(input)));

const runnerTerminalPhase = (
  receipt: InstalledRunnerTerminalReceipt | null,
  brokerBootstrap: InstalledBrokerBootstrapOutcome,
  targetBootstrap: InstalledTargetBootstrapOutcome,
  targetFirstEffect: InstalledTargetFirstEffectState,
  targetJobIdentity: InstalledTargetJobIdentityRelation
): string =>
  receipt === null
    ? `production-runner-terminal-receipt-missing-broker-bootstrap-${brokerBootstrap}` +
      `-target-bootstrap-${targetBootstrap}` +
      `-target-first-effect-${targetFirstEffect}` +
      `-target-job-identity-${targetJobIdentity}`
    : `production-runner-terminal-${receipt.outcome}-${receipt.terminalAttempt}-${receipt.code}` +
      `-broker-bootstrap-${brokerBootstrap}-target-bootstrap-${targetBootstrap}` +
      `-target-first-effect-${targetFirstEffect}` +
      `-target-job-identity-${targetJobIdentity}`;

const brokerBootstrapReceiptPath = (input: FourArtifactE2eProductionInput): string =>
  join(adminDirectory(input), 'broker-bootstrap-terminal.json');

const readBrokerBootstrap = async (
  input: FourArtifactE2eProductionInput
): Promise<InstalledBrokerBootstrapOutcome> =>
  decodeBrokerBootstrapReceipt(await readBoundedJson(brokerBootstrapReceiptPath(input)))?.outcome ?? 'missing';

const readTargetBootstrap = async (
  input: FourArtifactE2eProductionInput
): Promise<InstalledTargetBootstrapOutcome> =>
  decodeTargetBootstrapReceipt(await readBoundedJson(input.targetBootstrapReceiptPath))?.outcome ?? 'missing';

const readTargetFirstEffect = async (
  input: FourArtifactE2eProductionInput,
  expectedJobIdentityCommitment: string
): Promise<Readonly<{
  state: InstalledTargetFirstEffectState;
  jobIdentity: InstalledTargetJobIdentityRelation;
}>> => {
  const receipt = decodeTargetFirstEffectReceipt(await readBoundedJson(input.targetFirstEffectReceiptPath));
  return receipt === undefined
    ? { state: 'missing', jobIdentity: 'missing' }
    : receipt.jobIdentityCommitment === null
      ? { state: receipt.state, jobIdentity: 'missing' }
      : {
          state: receipt.state,
          jobIdentity: receipt.jobIdentityCommitment === expectedJobIdentityCommitment
            ? 'matches'
            : 'differs'
        };
};

const readTargetReceipt = async (
  input: FourArtifactE2eProductionInput
): Promise<FourArtifactE2eResult<FourArtifactE2eProductionCompletion['targetReceipt']>> => {
  try {
    const facts = await lstat(input.targetReceiptPath);
    if (!facts.isFile() || facts.isSymbolicLink() || facts.size < 2 || facts.size > 16 * 1024) {
      return e2eErr('receipt-invalid', 'target-receipt');
    }
    const decoded = decodeTargetDigestMatchReceipt(JSON.parse(
      await readFile(input.targetReceiptPath, 'utf8')
    ) as unknown);
    return decoded.type === 'ok'
      ? decoded
      : e2eErr('receipt-invalid', 'target-receipt');
  } catch {
    return e2eErr('receipt-invalid', 'target-receipt');
  }
};

const proveInstalledCleanup = async (
  input: FourArtifactE2eProductionInput,
  disposition: InstalledExecutionState['terminalDisposition'],
  seed: InstalledAuthoritySeedReceipt,
  attemptIdentityProof: InstalledExecutionState['attemptIdentityProof']
): Promise<FourArtifactE2eResult<FourArtifactE2eReceiverCleanupProof>> => {
  const invoked = await invokeInstalledAdmin(
    input,
    'reconcile',
    disposition,
    seed,
    attemptIdentityProof
  );
  if (invoked.type === 'err') return invoked;
  const decoded = decodeCleanupProof(invoked.value);
  return decoded === undefined
    ? e2eErr('resource-cleanup-failed', 'production-cleanup')
    : e2eOk(decoded);
};

/**
 * Tooling-only composition point. It imports the packed consumer artifacts
 * directly; all authority and receiver effects remain behind their general
 * public production factories.
 */
export const createFourArtifactE2eProductionPort = (): FourArtifactE2eProductionPort => {
  const executions = new Map<string, InstalledExecutionState>();
  const seedOnlyFailures = new Set<string>();
  const executionKey = (input: FourArtifactE2eProductionInput): string =>
    `${input.repositoryPath}\0${input.grantId}`;
  return {
    inspectReadiness: async input => {
      const artifacts = await importInstalledProductionArtifacts(input.installedPackageRoot);
      return artifacts.type === 'ok'
        ? e2eOk({ ready: true })
        : artifacts;
    },
    materializeBrokerComposition: materializeInstalledBrokerWrapper,
    runToTerminalAndCleanup: async input => {
      const key = executionKey(input);
      const seeded = await seedInstalledAuthority(input);
      if (seeded.type === 'err') {
        seedOnlyFailures.add(key);
        return seeded;
      }
      executions.set(key, {
        seed: seeded.value,
        attemptIdentityProof: 'trusted-receipt-missing',
        brokerBootstrap: 'missing',
        runnerTerminal: null,
        targetBootstrap: 'missing',
        targetFirstEffect: 'missing',
        targetJobIdentity: 'missing',
        terminalDisposition: 'failed'
      });
      await Promise.all([
        rm(brokerBootstrapReceiptPath(input), { force: true }),
        rm(`${brokerBootstrapReceiptPath(input)}.pending`, { force: true }),
        rm(input.targetBootstrapReceiptPath, { force: true }),
        rm(`${input.targetBootstrapReceiptPath}.pending`, { force: true }),
        rm(input.targetFirstEffectReceiptPath, { force: true }),
        rm(`${input.targetFirstEffectReceiptPath}.pending`, { force: true }),
        rm(input.targetReceiptPath, { force: true }),
        rm(runnerAttemptReceiptPath(input), { force: true }),
        rm(`${runnerAttemptReceiptPath(input)}.pending`, { force: true }),
        rm(runnerTerminalReceiptPath(input), { force: true }),
        rm(`${runnerTerminalReceiptPath(input)}.pending`, { force: true })
      ]);
      const completed = await runInstalledRecipeRunner(input);
      const [attempt, terminal, brokerBootstrap, targetBootstrap, targetFirstEffect] = await Promise.all([
        readRunnerAttemptIdentity(input),
        readRunnerTerminal(input),
        readBrokerBootstrap(input),
        readTargetBootstrap(input),
        readTargetFirstEffect(input, seeded.value.expectedJobIdentityCommitment)
      ]);
      const target = await readTargetReceipt(input);
      const disposition: InstalledExecutionState['terminalDisposition'] = target.type === 'ok'
        ? 'succeeded'
        : 'failed';
      const cleanupSeed = attempt === undefined
        ? seeded.value
        : { ...seeded.value, attemptId: attempt.attemptId };
      const attemptIdentityProof: InstalledExecutionState['attemptIdentityProof'] = attempt === undefined
        ? 'trusted-receipt-missing'
        : attempt.attemptId === seeded.value.attemptId
          ? 'trusted-matches-seed'
          : 'trusted-differs-from-seed';
      executions.set(key, {
        seed: cleanupSeed,
        attemptIdentityProof,
        brokerBootstrap,
        runnerTerminal: terminal ?? null,
        targetBootstrap,
        targetFirstEffect: targetFirstEffect.state,
        targetJobIdentity: targetFirstEffect.jobIdentity,
        terminalDisposition: disposition
      });
      const cleanup = await proveInstalledCleanup(input, disposition, cleanupSeed, attemptIdentityProof);
      if (cleanup.type === 'err') return cleanup;
      if (!completed) {
        return e2eErr(
          'production-operation-failed',
          runnerTerminalPhase(
            terminal ?? null,
            brokerBootstrap,
            targetBootstrap,
            targetFirstEffect.state,
            targetFirstEffect.jobIdentity
          )
        );
      }
      if (target.type === 'err') return target;
      return e2eOk({ targetReceipt: target.value, cleanup: cleanup.value });
    },
    reconcileAndProveCleanup: async input => {
      const key = executionKey(input);
      if (seedOnlyFailures.has(key)) {
        return e2eOk({
          pm2Record: 'absent',
          windowsJob: 'absent',
          trustedArtifacts: 'absent',
          secretExposures: 'closed'
        });
      }
      const prior = executions.get(key);
      if (prior !== undefined) {
        if (prior.attemptIdentityProof === 'trusted-receipt-missing') {
          return e2eErr(
            'production-operation-failed',
            runnerTerminalPhase(
              prior.runnerTerminal,
              prior.brokerBootstrap,
              prior.targetBootstrap,
              prior.targetFirstEffect,
              prior.targetJobIdentity
            )
          );
        }
        return proveInstalledCleanup(
          input,
          prior.terminalDisposition,
          prior.seed,
          prior.attemptIdentityProof
        );
      }
      return e2eErr('production-operation-failed', 'production-reconcile-state');
    }
  };
};
