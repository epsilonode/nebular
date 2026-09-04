import { isAbsolute, join, relative, resolve } from 'node:path';

import {
  BROKER_E2E_RECIPE_RELATIVE_PATH,
  decodeTargetDigestMatchReceipt,
  e2eErr,
  e2eOk,
  projectFourArtifactE2eFailure,
  type CanaryCleanupReceipt,
  type CanaryProvisionReceipt,
  type FourArtifactE2eProductionCompletion,
  type FourArtifactE2eProductionBootstrapInput,
  type FourArtifactE2eProductionInput,
  type FourArtifactE2eProductionPort,
  type FourArtifactE2ePublicReceipt,
  type FourArtifactE2eReceiverCleanupProof,
  type FourArtifactE2eResult
} from './four-artifact-e2e-contract.ts';
import type {
  CommittedFourArtifactE2eWorkspace,
  PreparedFourArtifactE2eWorkspace
} from './four-artifact-e2e-workspace.ts';

export const FOUR_ARTIFACT_E2E_TIMEOUT_MS = 60_000;
export const FOUR_ARTIFACT_E2E_PM2_ENDPOINT = '\\\\.\\pipe\\rpc.sock' as const;

export type FourArtifactE2eWorkspacePort = Readonly<{
  prepare: (gitExecutablePath: string) => Promise<FourArtifactE2eResult<PreparedFourArtifactE2eWorkspace>>;
  commitRecipe: (
    workspace: PreparedFourArtifactE2eWorkspace,
    expectedSha256: string
  ) => Promise<FourArtifactE2eResult<CommittedFourArtifactE2eWorkspace>>;
  provisionCanary: (
    workspace: PreparedFourArtifactE2eWorkspace,
    credentialReference: string
  ) => Promise<FourArtifactE2eResult<CanaryProvisionReceipt>>;
  deleteCanary: (
    workspace: PreparedFourArtifactE2eWorkspace,
    credentialReference: string
  ) => Promise<FourArtifactE2eResult<CanaryCleanupReceipt>>;
  cleanup: (
    workspace: Pick<PreparedFourArtifactE2eWorkspace, 'temporaryRoot'>
  ) => Promise<FourArtifactE2eResult<Readonly<{ temporaryWorkspace: 'absent' }>>>;
}>;

export type FourArtifactE2eEntropyPort = Readonly<{
  createRunId: () => string;
}>;

export type FourArtifactE2eHarnessPorts = Readonly<{
  workspace: FourArtifactE2eWorkspacePort;
  production: FourArtifactE2eProductionPort;
  entropy: FourArtifactE2eEntropyPort;
}>;

const invoke = async <Value>(
  operation: () => Promise<FourArtifactE2eResult<Value>>,
  phase: string
): Promise<FourArtifactE2eResult<Value>> => {
  try {
    return await operation();
  } catch {
    return e2eErr('production-operation-failed', phase);
  }
};

const safeRunId = (value: string): boolean => /^[a-f0-9-]{16,64}$/u.test(value);

const trustedRunRoot = (trustedProfileRoot: string, runId: string): FourArtifactE2eResult<string> => {
  const path = resolve(trustedProfileRoot, 'epsilonode', 'nebular', 'broker', 'v1', 'e2e', runId);
  const fromProfile = relative(resolve(trustedProfileRoot), path);
  return isAbsolute(path) && fromProfile.length > 0 && !fromProfile.startsWith('..') && !isAbsolute(fromProfile)
    ? e2eOk(path)
    : e2eErr('fixture-invalid', 'trusted-artifact-root');
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactCleanup = (value: unknown): value is FourArtifactE2eReceiverCleanupProof =>
  isRecord(value) && Object.keys(value).length === 4 &&
  value['pm2Record'] === 'absent' &&
  value['windowsJob'] === 'absent' &&
  value['trustedArtifacts'] === 'absent' &&
  value['secretExposures'] === 'closed';

const validCompletion = (value: unknown): value is FourArtifactE2eProductionCompletion =>
  isRecord(value) && Object.keys(value).length === 2 &&
  decodeTargetDigestMatchReceipt(value['targetReceipt']).type === 'ok' && exactCleanup(value['cleanup']);

const cleanupWorkspaceThen = async (
  workspace: PreparedFourArtifactE2eWorkspace,
  prior: FourArtifactE2eResult<FourArtifactE2ePublicReceipt>,
  port: FourArtifactE2eWorkspacePort
): Promise<FourArtifactE2eResult<FourArtifactE2ePublicReceipt>> => {
  const cleaned = await invoke(() => port.cleanup(workspace), 'workspace-cleanup');
  return cleaned.type === 'err' ? cleaned : prior;
};

export const runFourArtifactE2ePreflight = async (
  gitExecutablePath: string,
  ports: Pick<FourArtifactE2eHarnessPorts, 'workspace'>
): Promise<FourArtifactE2eResult<FourArtifactE2ePublicReceipt>> => {
  const prepared = await invoke(() => ports.workspace.prepare(gitExecutablePath), 'workspace-prepare');
  if (prepared.type === 'err') return prepared;
  const committed = await invoke(
    () => ports.workspace.commitRecipe(prepared.value, '0'.repeat(64)),
    'recipe-commit'
  );
  const outcome: FourArtifactE2eResult<FourArtifactE2ePublicReceipt> = committed.type === 'err'
    ? committed
    : e2eOk({
        outcome: 'success',
        proof: 'four-artifact-preflight',
        deliverableCount: 4,
        committedRecipe: true,
        cleanup: 'complete'
      });
  return cleanupWorkspaceThen(prepared.value, outcome, ports.workspace);
};

const productionInput = (
  workspace: PreparedFourArtifactE2eWorkspace,
  runId: string
): FourArtifactE2eResult<FourArtifactE2eProductionInput> => {
  const artifactRoot = trustedRunRoot(workspace.trustedProfileRoot, runId);
  return artifactRoot.type === 'err'
    ? artifactRoot
    : e2eOk({
        authorityDatabasePath: workspace.authorityDatabasePath,
        brokerEntrypointPath: workspace.brokerEntrypointPath,
        credentialReference: `e2e-credential-${runId}`,
        gitExecutablePath: workspace.gitExecutablePath,
        grantId: `e2e-grant-${runId}`,
        installedPackageRoot: workspace.installedPackageRoot,
        pm2Endpoint: FOUR_ARTIFACT_E2E_PM2_ENDPOINT,
        pm2ProcessName: `nebular-e2e-${runId}`,
        recipeRunnerEntrypointPath: join(workspace.installedPackageRoot, 'dist', 'recipe-runner.js'),
        recipeRelativePath: BROKER_E2E_RECIPE_RELATIVE_PATH,
        repositoryPath: workspace.repositoryPath,
        targetBootstrapReceiptPath: workspace.targetBootstrapReceiptPath,
        targetFirstEffectReceiptPath: workspace.targetFirstEffectReceiptPath,
        targetReceiptPath: workspace.targetReceiptPath,
        timeoutMs: FOUR_ARTIFACT_E2E_TIMEOUT_MS,
        trustedArtifactRunRoot: artifactRoot.value,
        trustedProfileRoot: workspace.trustedProfileRoot
      });
};

const publicFailure = <Value>(
  result: Extract<FourArtifactE2eResult<Value>, { type: 'err' }>
): FourArtifactE2eResult<FourArtifactE2ePublicReceipt> => e2eErr(result.issue.code, result.issue.phase);

const readinessInput = (
  input: FourArtifactE2eProductionInput
): FourArtifactE2eProductionBootstrapInput => ({
  authorityDatabasePath: input.authorityDatabasePath,
  brokerEntrypointPath: input.brokerEntrypointPath,
  gitExecutablePath: input.gitExecutablePath,
  installedPackageRoot: input.installedPackageRoot,
  pm2Endpoint: input.pm2Endpoint,
  recipeRunnerEntrypointPath: input.recipeRunnerEntrypointPath,
  recipeRelativePath: input.recipeRelativePath,
  repositoryPath: input.repositoryPath,
  targetBootstrapReceiptPath: input.targetBootstrapReceiptPath,
  targetFirstEffectReceiptPath: input.targetFirstEffectReceiptPath,
  targetReceiptPath: input.targetReceiptPath,
  timeoutMs: input.timeoutMs,
  trustedArtifactRunRoot: input.trustedArtifactRunRoot,
  trustedProfileRoot: input.trustedProfileRoot
});

const cleanupAfterCanary = async (
  workspace: PreparedFourArtifactE2eWorkspace,
  input: FourArtifactE2eProductionInput,
  prior: FourArtifactE2eResult<FourArtifactE2ePublicReceipt>,
  ports: FourArtifactE2eHarnessPorts
): Promise<FourArtifactE2eResult<FourArtifactE2ePublicReceipt>> => {
  const keychain = await invoke(
    () => ports.workspace.deleteCanary(workspace, input.credentialReference),
    'canary-cleanup'
  );
  const afterKeychain = keychain.type === 'err' ? keychain : prior;
  return cleanupWorkspaceThen(workspace, afterKeychain, ports.workspace);
};

const executeAndFinalize = async (
  workspace: CommittedFourArtifactE2eWorkspace,
  input: FourArtifactE2eProductionInput,
  ports: FourArtifactE2eHarnessPorts
): Promise<FourArtifactE2eResult<FourArtifactE2ePublicReceipt>> => {
  const execution = await invoke(
    () => ports.production.runToTerminalAndCleanup(input),
    'production-execution'
  );
  const cleanup = await invoke(
    () => ports.production.reconcileAndProveCleanup(input),
    'production-cleanup'
  );
  const productionOutcome: FourArtifactE2eResult<FourArtifactE2ePublicReceipt> = cleanup.type === 'err'
    ? cleanup
    : !exactCleanup(cleanup.value)
      ? e2eErr('resource-cleanup-failed', 'production-cleanup')
      : execution.type === 'err'
        ? execution
        : !validCompletion(execution.value)
          ? e2eErr('receipt-invalid', 'production-completion')
          : e2eOk({
              outcome: 'success',
              proof: 'credential-digest-match',
              deliverableCount: 4,
              installedTarball: true,
              cleanup: 'complete'
            });
  return cleanupAfterCanary(workspace, input, productionOutcome, ports);
};

export const runFourArtifactBrokerE2e = async (
  gitExecutablePath: string,
  ports: FourArtifactE2eHarnessPorts
): Promise<FourArtifactE2eResult<FourArtifactE2ePublicReceipt>> => {
  const runId = ports.entropy.createRunId().toLowerCase();
  if (!safeRunId(runId)) return e2eErr('fixture-invalid', 'run-identity');
  const prepared = await invoke(() => ports.workspace.prepare(gitExecutablePath), 'workspace-prepare');
  if (prepared.type === 'err') return prepared;
  const input = productionInput(prepared.value, runId);
  if (input.type === 'err') return cleanupWorkspaceThen(prepared.value, publicFailure(input), ports.workspace);
  const readiness = await invoke(
    () => ports.production.inspectReadiness(readinessInput(input.value)),
    'production-readiness'
  );
  if (readiness.type === 'err') {
    return cleanupWorkspaceThen(prepared.value, publicFailure(readiness), ports.workspace);
  }
  const composition = await invoke(
    () => ports.production.materializeBrokerComposition(readinessInput(input.value)),
    'production-composition'
  );
  if (composition.type === 'err') {
    return cleanupWorkspaceThen(prepared.value, publicFailure(composition), ports.workspace);
  }
  const canary = await invoke(
    () => ports.workspace.provisionCanary(prepared.value, input.value.credentialReference),
    'canary-provision'
  );
  if (canary.type === 'err') {
    return cleanupAfterCanary(prepared.value, input.value, publicFailure(canary), ports);
  }
  const committed = await invoke(
    () => ports.workspace.commitRecipe(prepared.value, canary.value.expectedSha256),
    'recipe-commit'
  );
  return committed.type === 'err'
    ? cleanupAfterCanary(prepared.value, input.value, publicFailure(committed), ports)
    : executeAndFinalize(committed.value, input.value, ports);
};

export const fourArtifactE2ePublicJson = (
  outcome: FourArtifactE2eResult<FourArtifactE2ePublicReceipt>
): string => JSON.stringify(outcome.type === 'ok'
  ? outcome.value
  : projectFourArtifactE2eFailure(outcome.issue));
