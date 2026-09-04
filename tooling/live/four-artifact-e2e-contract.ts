export const FOUR_ARTIFACT_E2E_FORMAT = 'nebular-four-artifact-e2e/v1' as const;

export const FOUR_ARTIFACT_PACKAGE_SPECIFIERS = [
  '@epsilonode/nebular',
  '@epsilonode/nebular/broker-client',
  '@epsilonode/nebular/recipe-runner',
  '@epsilonode/nebular/broker'
] as const;

export const FOUR_TYPESCRIPT_DELIVERABLES = [
  'teleport.ts',
  'broker-client.ts',
  'recipe-runner.ts',
  'broker.ts'
] as const;

export const FOUR_ARTIFACT_RUNTIME_PATHS = [
  'dist/teleport.js',
  'dist/broker-client.js',
  'dist/recipe-runner.js',
  'dist/broker.js'
] as const;

export const BROKER_E2E_RECIPE_RELATIVE_PATH = 'recipes/broker-e2e.xml' as const;
export const BROKER_E2E_TARGET_RECEIPT_RELATIVE_PATH = '.nebular-e2e/target-receipt.json' as const;
export const BROKER_E2E_TARGET_FIRST_EFFECT_RECEIPT_RELATIVE_PATH =
  '.nebular-e2e/target-first-effect.json' as const;
export const BROKER_E2E_TARGET_BOOTSTRAP_RECEIPT_RELATIVE_PATH =
  '.nebular-e2e/target-bootstrap-terminal.json' as const;
export const BROKER_E2E_CREDENTIAL_SLOT_ID = 'e2e-provider' as const;
export const BROKER_E2E_EXPECTED_DIGEST_PLACEHOLDER = '__E2E_EXPECTED_PROVIDER_SHA256__' as const;

export type FourArtifactE2eIssueCode =
  | 'canary-cleanup-failed'
  | 'canary-provision-failed'
  | 'command-failed'
  | 'fixture-invalid'
  | 'git-unavailable'
  | 'installed-artifact-invalid'
  | 'production-operation-api-unavailable'
  | 'production-operation-failed'
  | 'receipt-invalid'
  | 'recipe-invalid'
  | 'resource-cleanup-failed'
  | 'workspace-prepare-failed';

export type FourArtifactE2eIssue = Readonly<{
  code: FourArtifactE2eIssueCode;
  phase: string;
}>;

export type FourArtifactE2eResult<Value> =
  | Readonly<{ type: 'ok'; value: Value }>
  | Readonly<{ type: 'err'; issue: FourArtifactE2eIssue }>;

export const e2eOk = <Value>(value: Value): FourArtifactE2eResult<Value> => ({ type: 'ok', value });

export const e2eErr = <Value = never>(
  code: FourArtifactE2eIssueCode,
  phase: string
): FourArtifactE2eResult<Value> => ({ type: 'err', issue: { code, phase } });

export type InstalledFourArtifactProbeReceipt = Readonly<{
  format: typeof FOUR_ARTIFACT_E2E_FORMAT;
  proof: 'installed-four-artifact-imports';
  importedSpecifiers: typeof FOUR_ARTIFACT_PACKAGE_SPECIFIERS;
  resolvedRuntimePaths: typeof FOUR_ARTIFACT_RUNTIME_PATHS;
  trustedProfileRoot: string;
}>;

export type CommittedRecipeProbeReceipt = Readonly<{
  format: typeof FOUR_ARTIFACT_E2E_FORMAT;
  proof: 'committed-recipe-admitted';
  lifecycle: 'one-shot';
  receiver: 'pm2';
  credentialSlotCount: 1;
}>;

export type CanaryProvisionReceipt = Readonly<{
  format: typeof FOUR_ARTIFACT_E2E_FORMAT;
  proof: 'temporary-keychain-canary-stored';
  expectedSha256: string;
}>;

export type CanaryCleanupReceipt = Readonly<{
  format: typeof FOUR_ARTIFACT_E2E_FORMAT;
  proof: 'temporary-keychain-canary-absent';
}>;

export type TargetDigestMatchReceipt = Readonly<{
  outcome: 'success';
  proof: 'credential-digest-match';
}>;

export type FourArtifactE2eReceiverCleanupProof = Readonly<{
  pm2Record: 'absent';
  windowsJob: 'absent';
  trustedArtifacts: 'absent';
  secretExposures: 'closed';
}>;

export type FourArtifactE2eProductionCompletion = Readonly<{
  targetReceipt: TargetDigestMatchReceipt;
  cleanup: FourArtifactE2eReceiverCleanupProof;
}>;

/**
 * Tooling-only input to the eventual production adapter. Every privileged
 * dependency remains explicit; the adapter must compose general public broker
 * factories and ordinary journal mutations rather than an E2E-only broker API.
 */
export type FourArtifactE2eProductionInput = Readonly<{
  authorityDatabasePath: string;
  brokerEntrypointPath: string;
  credentialReference: string;
  gitExecutablePath: string;
  grantId: string;
  installedPackageRoot: string;
  pm2Endpoint: string;
  pm2ProcessName: string;
  recipeRunnerEntrypointPath: string;
  recipeRelativePath: typeof BROKER_E2E_RECIPE_RELATIVE_PATH;
  repositoryPath: string;
  targetBootstrapReceiptPath: string;
  targetFirstEffectReceiptPath: string;
  targetReceiptPath: string;
  timeoutMs: number;
  trustedArtifactRunRoot: string;
  trustedProfileRoot: string;
}>;

export type FourArtifactE2eProductionBootstrapInput = Omit<
  FourArtifactE2eProductionInput,
  'credentialReference' | 'grantId' | 'pm2ProcessName'
>;

export type FourArtifactE2eProductionPort = Readonly<{
  /** Must not mutate the keychain, journal, PM2, Job, or artifact filesystem. */
  inspectReadiness: (
    input: FourArtifactE2eProductionBootstrapInput
  ) => Promise<FourArtifactE2eResult<Readonly<{ ready: true }>>>;
  /**
   * Writes the tooling-only isolated broker wrapper at the exact supplied
   * entrypoint before Git commit. The wrapper imports only the installed broker
   * artifact and composes general factories with the explicit database/profile,
   * Git, PM2, artifact, and timeout dependencies in this input.
   */
  materializeBrokerComposition: (
    input: FourArtifactE2eProductionBootstrapInput
  ) => Promise<FourArtifactE2eResult<Readonly<{ materialized: true }>>>;
  /**
   * Seeds authority through normal typed journal commands, launches through the
   * real PM2/Windows path, observes one exact target receipt, then proves all
   * receiver-owned resources absent before returning. The target receipt must
   * be read from `input.targetReceiptPath` after terminal exit; PM2 logs are not
   * an admissible success signal and may already have been released.
   */
  runToTerminalAndCleanup: (
    input: FourArtifactE2eProductionInput
  ) => Promise<FourArtifactE2eResult<FourArtifactE2eProductionCompletion>>;
  /**
   * Idempotently re-reads the exact attempt/PM2/Job/artifact/exposure facts and
   * proves absence. It is invoked even after an execution failure and may never
   * delete a foreign receiver record selected only by name.
   */
  reconcileAndProveCleanup: (
    input: FourArtifactE2eProductionInput
  ) => Promise<FourArtifactE2eResult<FourArtifactE2eReceiverCleanupProof>>;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const isAbsoluteWindowsPath = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z]:\\[^\0]+$/u.test(value);

export const decodeInstalledFourArtifactProbeReceipt = (
  value: unknown
): FourArtifactE2eResult<InstalledFourArtifactProbeReceipt> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'format',
    'proof',
    'importedSpecifiers',
    'resolvedRuntimePaths',
    'trustedProfileRoot'
  ])) return e2eErr('receipt-invalid', 'installed-probe');
  const imported = value['importedSpecifiers'];
  const resolved = value['resolvedRuntimePaths'];
  const exactSpecifiers = Array.isArray(imported) && imported.length === FOUR_ARTIFACT_PACKAGE_SPECIFIERS.length &&
    imported.every((specifier, index) => specifier === FOUR_ARTIFACT_PACKAGE_SPECIFIERS[index]);
  const exactRuntimePaths = Array.isArray(resolved) && resolved.length === FOUR_ARTIFACT_RUNTIME_PATHS.length &&
    resolved.every((path, index) => path === FOUR_ARTIFACT_RUNTIME_PATHS[index]);
  return value['format'] === FOUR_ARTIFACT_E2E_FORMAT &&
    value['proof'] === 'installed-four-artifact-imports' &&
    exactSpecifiers &&
    exactRuntimePaths &&
    isAbsoluteWindowsPath(value['trustedProfileRoot'])
    ? e2eOk({
        format: FOUR_ARTIFACT_E2E_FORMAT,
        proof: 'installed-four-artifact-imports',
        importedSpecifiers: FOUR_ARTIFACT_PACKAGE_SPECIFIERS,
        resolvedRuntimePaths: FOUR_ARTIFACT_RUNTIME_PATHS,
        trustedProfileRoot: value['trustedProfileRoot']
      })
    : e2eErr('receipt-invalid', 'installed-probe');
};

export const decodeCommittedRecipeProbeReceipt = (
  value: unknown
): FourArtifactE2eResult<CommittedRecipeProbeReceipt> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'format',
    'proof',
    'lifecycle',
    'receiver',
    'credentialSlotCount'
  ])) return e2eErr('receipt-invalid', 'recipe-probe');
  return value['format'] === FOUR_ARTIFACT_E2E_FORMAT &&
    value['proof'] === 'committed-recipe-admitted' &&
    value['lifecycle'] === 'one-shot' &&
    value['receiver'] === 'pm2' &&
    value['credentialSlotCount'] === 1
    ? e2eOk({
        format: FOUR_ARTIFACT_E2E_FORMAT,
        proof: 'committed-recipe-admitted',
        lifecycle: 'one-shot',
        receiver: 'pm2',
        credentialSlotCount: 1
      })
    : e2eErr('receipt-invalid', 'recipe-probe');
};

export const decodeCanaryProvisionReceipt = (
  value: unknown
): FourArtifactE2eResult<CanaryProvisionReceipt> => {
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'proof', 'expectedSha256'])) {
    return e2eErr('receipt-invalid', 'canary-provision');
  }
  return value['format'] === FOUR_ARTIFACT_E2E_FORMAT &&
    value['proof'] === 'temporary-keychain-canary-stored' &&
    isSha256(value['expectedSha256'])
    ? e2eOk({
        format: FOUR_ARTIFACT_E2E_FORMAT,
        proof: 'temporary-keychain-canary-stored',
        expectedSha256: value['expectedSha256']
      })
    : e2eErr('receipt-invalid', 'canary-provision');
};

export const decodeCanaryCleanupReceipt = (
  value: unknown
): FourArtifactE2eResult<CanaryCleanupReceipt> =>
  isRecord(value) && hasExactKeys(value, ['format', 'proof']) &&
  value['format'] === FOUR_ARTIFACT_E2E_FORMAT &&
  value['proof'] === 'temporary-keychain-canary-absent'
    ? e2eOk({ format: FOUR_ARTIFACT_E2E_FORMAT, proof: 'temporary-keychain-canary-absent' })
    : e2eErr('receipt-invalid', 'canary-cleanup');

export const decodeTargetDigestMatchReceipt = (
  value: unknown
): FourArtifactE2eResult<TargetDigestMatchReceipt> =>
  isRecord(value) && hasExactKeys(value, ['outcome', 'proof']) &&
  value['outcome'] === 'success' && value['proof'] === 'credential-digest-match'
    ? e2eOk({ outcome: 'success', proof: 'credential-digest-match' })
    : e2eErr('receipt-invalid', 'target-receipt');

export const renderBrokerE2eRecipe = (
  template: string,
  expectedSha256: string
): FourArtifactE2eResult<string> => {
  const placeholderCount = template.split(BROKER_E2E_EXPECTED_DIGEST_PLACEHOLDER).length - 1;
  return placeholderCount === 1 && isSha256(expectedSha256)
    ? e2eOk(template.replace(BROKER_E2E_EXPECTED_DIGEST_PLACEHOLDER, expectedSha256))
    : e2eErr('fixture-invalid', 'recipe-render');
};

export const createUnconfiguredFourArtifactE2eProductionPort = (): FourArtifactE2eProductionPort => ({
  inspectReadiness: () => Promise.resolve(e2eErr(
    'production-operation-api-unavailable',
    'production-readiness'
  )),
  materializeBrokerComposition: () => Promise.resolve(e2eErr(
    'production-operation-api-unavailable',
    'production-composition'
  )),
  runToTerminalAndCleanup: () => Promise.resolve(e2eErr(
    'production-operation-api-unavailable',
    'production-execution'
  )),
  reconcileAndProveCleanup: () => Promise.resolve(e2eErr(
    'production-operation-api-unavailable',
    'production-cleanup'
  ))
});

export type FourArtifactE2ePublicReceipt =
  | Readonly<{
      outcome: 'success';
      proof: 'four-artifact-preflight';
      deliverableCount: 4;
      committedRecipe: true;
      cleanup: 'complete';
    }>
  | Readonly<{
      outcome: 'success';
      proof: 'credential-digest-match';
      deliverableCount: 4;
      installedTarball: true;
      cleanup: 'complete';
    }>
  | Readonly<{ outcome: 'failure'; code: FourArtifactE2eIssueCode; phase: string }>;

export const projectFourArtifactE2eFailure = (
  issue: FourArtifactE2eIssue
): FourArtifactE2ePublicReceipt => ({ outcome: 'failure', code: issue.code, phase: issue.phase });
