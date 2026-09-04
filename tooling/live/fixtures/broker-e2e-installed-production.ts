import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

// Replaced with installed package subpaths in the isolated consumer.
import * as broker from '../../../broker.ts';
import * as recipeRunner from '../../../recipe-runner.ts';

const FORMAT = 'nebular-four-artifact-e2e/v1' as const;
const RECEIPT_LIMIT = 16 * 1024;

type AdminInput = Readonly<{
  attemptDigest: string | null;
  attemptIdentityProof: 'trusted-matches-seed' | 'trusted-differs-from-seed' | 'trusted-receipt-missing';
  attemptId: string | null;
  authorityDatabasePath: string;
  brokerEntrypointPath: string;
  credentialReference: string;
  gitExecutablePath: string;
  grantId: string;
  namespace: string;
  pm2Endpoint: string;
  recipeRelativePath: string;
  repositoryPath: string;
  terminalDisposition: 'succeeded' | 'failed' | 'cancelled';
  timeoutMs: number;
  trustedProfileRoot: string;
}>;

type SeededAuthority = Readonly<{
  attemptDigest: string;
  attemptId: broker.ProcessAttemptId;
  artifactPlan: broker.WindowsOneShotArtifactPlan;
  composition: broker.WindowsPm2OneShotComposition;
  expectedJobIdentityCommitment: string;
}>;

type AdminPlan = Readonly<{
  command: 'seed' | 'reconcile';
  inputPath: string;
  receiptPath: string;
}>;

type AdminPhase =
  | 'context'
  | 'repository'
  | 'recipe'
  | 'identities'
  | 'journal'
  | 'request'
  | 'plan'
  | 'artifacts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).toSorted();
  const expected = [...keys].toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const boundedText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum && !value.includes('\0');

const decodeInput = (value: unknown): AdminInput | undefined => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'attemptDigest',
    'attemptIdentityProof',
    'attemptId',
    'authorityDatabasePath',
    'brokerEntrypointPath',
    'credentialReference',
    'gitExecutablePath',
    'grantId',
    'namespace',
    'pm2Endpoint',
    'recipeRelativePath',
    'repositoryPath',
    'terminalDisposition',
    'timeoutMs',
    'trustedProfileRoot'
  ])) return undefined;
  const attemptDigest = value['attemptDigest'];
  const attemptIdentityProof = value['attemptIdentityProof'];
  const attemptId = value['attemptId'];
  const authorityDatabasePath = value['authorityDatabasePath'];
  const brokerEntrypointPath = value['brokerEntrypointPath'];
  const gitExecutablePath = value['gitExecutablePath'];
  const repositoryPath = value['repositoryPath'];
  const trustedProfileRoot = value['trustedProfileRoot'];
  const credentialReference = value['credentialReference'];
  const grantId = value['grantId'];
  const namespace = value['namespace'];
  const pm2Endpoint = value['pm2Endpoint'];
  const recipeRelativePath = value['recipeRelativePath'];
  const timeoutMs = value['timeoutMs'];
  const disposition = value['terminalDisposition'];
  const noAttempt = attemptDigest === null && attemptId === null;
  const exactAttempt = typeof attemptDigest === 'string' && /^[a-f0-9]{64}$/u.test(attemptDigest) &&
    boundedText(attemptId, 512);
  return (noAttempt || exactAttempt) &&
    (attemptIdentityProof === 'trusted-matches-seed' ||
      attemptIdentityProof === 'trusted-differs-from-seed' ||
      attemptIdentityProof === 'trusted-receipt-missing') &&
    boundedText(authorityDatabasePath, 32_767) && isAbsolute(authorityDatabasePath) &&
    boundedText(brokerEntrypointPath, 32_767) && isAbsolute(brokerEntrypointPath) &&
    boundedText(gitExecutablePath, 32_767) && isAbsolute(gitExecutablePath) &&
    boundedText(repositoryPath, 32_767) && isAbsolute(repositoryPath) &&
    boundedText(trustedProfileRoot, 32_767) && isAbsolute(trustedProfileRoot) &&
    boundedText(credentialReference, 256) && boundedText(grantId, 128) &&
    boundedText(namespace, 40) && boundedText(pm2Endpoint, 1_024) &&
    boundedText(recipeRelativePath, 4_096) && Number.isSafeInteger(timeoutMs) &&
    typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 60_000 &&
    (disposition === 'succeeded' || disposition === 'failed' || disposition === 'cancelled')
    ? {
        attemptDigest,
        attemptIdentityProof,
        attemptId,
        authorityDatabasePath,
        brokerEntrypointPath,
        credentialReference,
        gitExecutablePath,
        grantId,
        namespace,
        pm2Endpoint,
        recipeRelativePath,
        repositoryPath,
        terminalDisposition: disposition,
        timeoutMs,
        trustedProfileRoot
      }
    : undefined;
};

const parsePlan = (argv: readonly string[]): AdminPlan | undefined => {
  const command = argv[0];
  return (command === 'seed' || command === 'reconcile') && argv.length === 5 &&
    argv[1] === '--input' && argv[3] === '--receipt' &&
    boundedText(argv[2], 32_767) && isAbsolute(argv[2]) &&
    boundedText(argv[4], 32_767) && isAbsolute(argv[4])
    ? { command, inputPath: argv[2], receiptPath: argv[4] }
    : undefined;
};

const readInput = async (path: string): Promise<AdminInput | undefined> => {
  try {
    const file = Bun.file(path);
    return file.size > 1 && file.size <= RECEIPT_LIMIT
      ? decodeInput(await file.json())
      : undefined;
  } catch {
    return undefined;
  }
};

const writeReceipt = (path: string, value: unknown): Promise<void> =>
  Bun.write(path, JSON.stringify(value)).then(() => undefined);

const writeProgress = (path: string | undefined, phase: AdminPhase): Promise<void> =>
  path === undefined
    ? Promise.resolve()
    : writeReceipt(path, { format: FORMAT, proof: 'installed-production-progress', phase });

const writeJournalFailure = (
  path: string | undefined,
  operation: 'read' | 'commit' | 'reuse',
  code: broker.JournalIssueCode
): Promise<void> => path === undefined
  ? Promise.resolve()
  : writeReceipt(path, {
      format: FORMAT,
      proof: 'installed-production-failure',
      phase: 'journal',
      operation,
      code
    });

const writeBrokerFailure = (
  path: string | undefined,
  phase: 'request' | 'plan',
  code: broker.BrokerIssue['code']
): Promise<void> => path === undefined
  ? Promise.resolve()
  : writeReceipt(path, {
      format: FORMAT,
      proof: 'installed-production-failure',
      phase,
      operation: 'resolve',
      code
    });

type ReconcileFailureOperation =
  | 'identity-restore'
  | 'prior-cleanup-read'
  | 'contained-attempt-read'
  | 'terminal-cleanup'
  | 'artifact-release'
  | 'lease-read'
  | 'lease-present'
  | 'final-cleanup-read'
  | 'attempt-read'
  | 'final-state';

const writeReconcileFailure = (
  path: string,
  operation: ReconcileFailureOperation,
  code: string
): Promise<void> => writeReceipt(path, {
  format: FORMAT,
  proof: 'installed-production-failure',
  phase: 'reconcile',
  operation,
  code
});

const sha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const jobIdentityCommitment = (identity: string): string => sha256([
  'epsilonode/nebular/job-identity-commitment/v1',
  identity
]);

const createContext = async (
  input: AdminInput
): Promise<Readonly<{
  authority: broker.BrokerAuthorityPorts;
  composition: broker.WindowsPm2OneShotComposition;
  journal: broker.AuthorityJournal;
}> | undefined> => {
  const clock = { nowMs: () => Date.now() };
  const journal = broker.createBunSqliteAuthorityJournal({
    profilePath: broker.createTestOnlyProfilePathPort(input.authorityDatabasePath),
    applicationVersion: broker.WINDOWS_EXECUTION_AUTHORITY_APPLICATION_VERSION,
    busyTimeoutMs: 250,
    clock
  });
  const defaultRuntime = broker.createWindowsExecutionAuthorityContextRuntime();
  const authorityContext = await broker.resolveWindowsExecutionAuthorityContext({
    adapterTimeoutMs: Math.min(input.timeoutMs, 10_000),
    journalBusyTimeoutMs: 250
  }, {
    ...defaultRuntime,
    journals: { create: () => journal }
  });
  if (authorityContext.isErr() ||
      authorityContext.value.trustedProfileRoot.value.toLocaleLowerCase('en-US') !==
        input.trustedProfileRoot.toLocaleLowerCase('en-US')) return undefined;
  const composed = broker.createWindowsPm2OneShotComposition(authorityContext.value, {
    brokerEntrypointPath: input.brokerEntrypointPath,
    namespace: input.namespace,
    slotCapacity: 1,
    pm2Endpoint: input.pm2Endpoint,
    adapterTimeoutMs: Math.min(input.timeoutMs, 10_000),
    allowedNonsecretEnvironmentNames: ['E2E_EXPECTED_PROVIDER_SHA256']
  });
  return composed.isOk()
    ? { authority: authorityContext.value.authority, composition: composed.value, journal }
    : undefined;
};

const seedAuthority = async (
  input: AdminInput,
  progressPath?: string
): Promise<SeededAuthority | undefined> => {
  await writeProgress(progressPath, 'context');
  const context = await createContext(input);
  if (context === undefined) return undefined;
  await writeProgress(progressPath, 'repository');
  const repository = await context.authority.canonicalizeRepository(input.repositoryPath);
  if (repository.isErr()) return undefined;
  await writeProgress(progressPath, 'recipe');
  const resolvedRecipe = await context.authority.resolveRecipe(repository.value, input.recipeRelativePath);
  if (resolvedRecipe.isErr() || resolvedRecipe.value.credentialSlotIds.length !== 1) return undefined;
  await writeProgress(progressPath, 'identities');
  const slotId = resolvedRecipe.value.credentialSlotIds[0];
  const grantId = broker.parseGrantId(input.grantId);
  const credentialReference = broker.parseCredentialReference(input.credentialReference);
  const operationId = broker.parseJournalOperationId(`e2e-grant-operation-${sha256([
    input.grantId,
    repository.value,
    resolvedRecipe.value.revision
  ])}`);
  const consentId = broker.parseConsentId(`e2e-consent-${sha256(input.grantId)}`);
  const authorityDigest = broker.parseRedactedAuthorityDigest(`sha256:${sha256([
    repository.value,
    resolvedRecipe.value.revision,
    slotId,
    input.credentialReference
  ])}`);
  if (slotId === undefined || grantId.isErr() || credentialReference.isErr() ||
      operationId.type === 'err' || consentId.type === 'err' || authorityDigest.type === 'err') return undefined;
  await writeProgress(progressPath, 'journal');
  const existing = await context.journal.grants.readGrant(grantId.value);
  if (existing.type === 'err') {
    await writeJournalFailure(progressPath, 'read', existing.issues[0].code);
    return undefined;
  }
  const issuedAtMs = Date.now();
  const expiresAtMs = issuedAtMs + 24 * 60 * 60_000;
  let grant: broker.GrantJournalRecord;
  if (existing.value === null) {
    const command: broker.CommitGrantWithConsent = {
      operationId: operationId.value,
      consent: {
        id: consentId.value,
        operationId: operationId.value,
        repository: repository.value,
        recipeRevision: resolvedRecipe.value.revision,
        authorityDigest: authorityDigest.value,
        promptVersion: 'nebular-four-artifact-e2e/v1',
        credentialSlotIds: [slotId],
        deliveryMode: 'cooperative-bootstrap',
        grantExpiresAtMs: expiresAtMs,
        occurredAtMs: issuedAtMs,
        outcome: 'approved'
      },
      grant: {
        id: grantId.value,
        operationId: operationId.value,
        repository: repository.value,
        recipeRevision: resolvedRecipe.value.revision,
        credentialBindings: [{ slotId, credentialReference: credentialReference.value }],
        consentId: consentId.value,
        generation: 1,
        issuedAtMs,
        expiresAtMs,
        state: 'active'
      }
    };
    const committed = await context.journal.grants.commitWithConsent(command);
    if (committed.type === 'err') {
      await writeJournalFailure(progressPath, 'commit', committed.issues[0].code);
      return undefined;
    }
    grant = committed.value.record;
  } else {
    grant = existing.value;
    const binding = grant.credentialBindings[0];
    if (grant.id !== grantId.value || grant.repository !== repository.value ||
        grant.recipeRevision !== resolvedRecipe.value.revision || grant.state !== 'active' ||
        grant.expiresAtMs <= issuedAtMs || grant.credentialBindings.length !== 1 ||
        binding.slotId !== slotId || binding.credentialReference.value !== credentialReference.value.value) {
      await writeJournalFailure(progressPath, 'reuse', 'journal-conflict');
      return undefined;
    }
  }
  await writeProgress(progressPath, 'request');
  const recipePath = recipeRunner.parseRecipeRelativePath(input.recipeRelativePath);
  if (recipePath.isErr()) return undefined;
  const contractRevision = recipeRunner.computeRecipeRevision(
    resolvedRecipe.value.admittedRecipe,
    {
      sha256: bytes => recipeRunner.recipeOk(
        createHash('sha256').update(Uint8Array.from(bytes)).digest('hex')
      )
    }
  );
  if (contractRevision.isErr()) return undefined;
  const request = recipeRunner.buildExecuteRecipeRequest({
    recipe: resolvedRecipe.value.admittedRecipe,
    grantIdHint: input.grantId,
    repositoryPathHint: input.repositoryPath,
    recipePathHint: recipePath.value,
    recipeRevision: contractRevision.value,
    requestId: 'recipe-runner-local-plan',
    sequence: 0,
    sentAtMs: 0
  });
  if (request.isErr()) return undefined;
  const execution = broker.authorizeExecution(
    request.value,
    resolvedRecipe.value,
    {
      id: grant.id,
      generation: grant.generation,
      repository: grant.repository,
      recipeRevision: grant.recipeRevision,
      credentialBindings: grant.credentialBindings,
      expiresAtMs: grant.expiresAtMs,
      revoked: false
    },
    issuedAtMs
  );
  if (execution.isErr()) {
    await writeBrokerFailure(progressPath, 'request', execution.error[0].code);
    return undefined;
  }
  await writeProgress(progressPath, 'plan');
  const filesystem = context.composition.capabilities.filesystem;
  const plan = await broker.planAuthorizedRecipeMaterialization(execution.value, {
    paths: broker.createWindowsExecutionPathResolver(filesystem),
    tools: broker.createWindowsExecutionToolRegistry({
      brokerEntrypointPath: input.brokerEntrypointPath
    }, filesystem),
    targetEntrypoints: broker.createWindowsExecutionTargetEntrypointResolver(filesystem)
  });
  if (plan.isErr()) {
    await writeBrokerFailure(progressPath, 'plan', plan.error[0].code);
    return undefined;
  }
  const identity = broker.deriveGrantQualifiedOneShotIdentity(plan.value);
  if (identity.outcome === 'failure' || !identity.value.slotIndependentPlanDigest.value.startsWith('sha256:')) {
    return undefined;
  }
  await writeProgress(progressPath, 'artifacts');
  const artifactPlan = broker.planWindowsOneShotArtifacts(
    context.composition.launchConfig.trustedProfileRoot,
    identity.value.attemptId,
    identity.value.slotIndependentPlanDigest.value
  );
  const attemptDigest = identity.value.slotIndependentPlanDigest.value.slice('sha256:'.length);
  const expectedContainment = broker.derivePm2ManagedWindowsContainment({
    trustedProfileRoot: context.composition.launchConfig.trustedProfileRoot,
    namespace: context.composition.launchConfig.pool.namespace
  }, {
    attemptId: identity.value.attemptId,
    attemptDigest
  });
  return artifactPlan.isOk() && expectedContainment.outcome === 'success'
    ? {
        attemptDigest,
        attemptId: identity.value.attemptId,
        artifactPlan: artifactPlan.value,
        composition: context.composition,
        expectedJobIdentityCommitment: jobIdentityCommitment(
          expectedContainment.value.jobIdentity.value
        )
      }
    : undefined;
};

const seedReceipt = async (input: AdminInput, receiptPath: string): Promise<boolean> => {
  if (input.attemptId !== null || input.attemptDigest !== null) return false;
  const seeded = await seedAuthority(input, receiptPath);
  if (seeded === undefined) return false;
  await writeReceipt(receiptPath, {
    format: FORMAT,
    proof: 'ordinary-authority-seeded',
    attemptId: seeded.attemptId,
    attemptDigest: seeded.attemptDigest,
    expectedJobIdentityCommitment: seeded.expectedJobIdentityCommitment
  });
  return true;
};

const restoreCleanupAuthority = async (
  input: AdminInput,
  receiptPath: string
): Promise<SeededAuthority | undefined> => {
  if (input.attemptId === null || input.attemptDigest === null) {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'attempt-identity-missing');
    return undefined;
  }
  if (input.attemptIdentityProof === 'trusted-receipt-missing') {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'trusted-attempt-receipt-missing');
    return undefined;
  }
  const context = await createContext(input);
  if (context === undefined) {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'context-unavailable');
    return undefined;
  }
  const attemptId = broker.parseProcessAttemptId(input.attemptId);
  if (attemptId.isErr()) {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'attempt-identity-invalid');
    return undefined;
  }
  const attempt = await context.journal.attempts.read(attemptId.value);
  if (attempt.type === 'err') {
    await writeReconcileFailure(receiptPath, 'identity-restore', attempt.issues[0].code);
    return undefined;
  }
  if (attempt.value === null) {
    await writeReconcileFailure(
      receiptPath,
      'identity-restore',
      input.attemptIdentityProof === 'trusted-matches-seed'
        ? 'matching-attempt-record-missing'
        : 'different-attempt-record-missing'
    );
    return undefined;
  }
  const contained = await context.journal.attempts.readGrantQualifiedContainedAttempt(attemptId.value);
  if (contained.type === 'err') {
    await writeReconcileFailure(receiptPath, 'identity-restore', contained.issues[0].code);
    return undefined;
  }
  if (contained.value === null) {
    await writeReconcileFailure(
      receiptPath,
      'identity-restore',
      `attempt-${attempt.value.state}-without-containment`
    );
    return undefined;
  }
  const durableDigest = contained.value.containmentBinding.slotIndependentPlanDigest.value;
  const artifactPlan = broker.planWindowsOneShotArtifacts(
    context.composition.launchConfig.trustedProfileRoot,
    attemptId.value,
    durableDigest
  );
  if (artifactPlan.isErr()) {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'artifact-plan-failed');
    return undefined;
  }
  const attemptDigest = durableDigest.startsWith('sha256:')
    ? durableDigest.slice('sha256:'.length)
    : durableDigest;
  const expectedContainment = broker.derivePm2ManagedWindowsContainment({
    trustedProfileRoot: context.composition.launchConfig.trustedProfileRoot,
    namespace: context.composition.launchConfig.pool.namespace
  }, {
    attemptId: attemptId.value,
    attemptDigest
  });
  if (expectedContainment.outcome === 'failure') {
    await writeReconcileFailure(receiptPath, 'identity-restore', 'job-identity-derivation-failed');
    return undefined;
  }
  return {
        attemptDigest,
        attemptId: attemptId.value,
        artifactPlan: artifactPlan.value,
        composition: context.composition,
        expectedJobIdentityCommitment: jobIdentityCommitment(
          expectedContainment.value.jobIdentity.value
        )
      };
};

const reconcileCleanup = async (input: AdminInput, receiptPath: string): Promise<boolean> => {
  const seeded = await restoreCleanupAuthority(input, receiptPath);
  if (seeded === undefined) return false;
  const journal = seeded.composition.journal;
  const prior = await journal.attempts.readVerifiedWindowsTerminalCleanup(seeded.attemptId);
  if (prior.type === 'err') {
    await writeReconcileFailure(receiptPath, 'prior-cleanup-read', prior.issues[0].code);
    return false;
  }
  if (prior.value === null) {
    const contained = await journal.attempts.readGrantQualifiedContainedAttempt(seeded.attemptId);
    if (contained.type === 'err') {
      await writeReconcileFailure(receiptPath, 'contained-attempt-read', contained.issues[0].code);
      return false;
    }
    if (contained.value !== null) {
      const cleaned = await broker.cleanupVerifiedWindowsOneShotAttempt({
        format: 'windows-pm2-one-shot-terminal-signal/v1',
        processAttemptId: seeded.attemptId,
        terminalDisposition: input.terminalDisposition,
        observedAtMs: Date.now()
      }, {
        attempts: journal.attempts,
        leases: journal.leases,
        containment: seeded.composition.capabilities.containment,
        rootProcesses: seeded.composition.capabilities.processIncarnations,
        pm2: seeded.composition.capabilities.pm2Deletion,
        clock: seeded.composition.capabilities.clock
      });
      if (cleaned.state === 'recovery-required') {
        await writeReconcileFailure(
          receiptPath,
          'terminal-cleanup',
          `recovery-${cleaned.stage}`
        );
        return false;
      }
    }
  }
  const released = await broker.releaseWindowsOneShotArtifacts(
    seeded.artifactPlan,
    seeded.composition.capabilities.artifacts
  );
  if (released.isErr()) {
    await writeReconcileFailure(receiptPath, 'artifact-release', released.error[0].code);
    return false;
  }
  const nonterminal = await journal.leases.readNonterminalForAttempt(seeded.attemptId);
  if (nonterminal.type === 'err') {
    await writeReconcileFailure(receiptPath, 'lease-read', nonterminal.issues[0].code);
    return false;
  }
  if (nonterminal.value.length !== 0) {
    await writeReconcileFailure(receiptPath, 'lease-present', 'nonterminal-lease-present');
    return false;
  }
  const finalCleanup = await journal.attempts.readVerifiedWindowsTerminalCleanup(seeded.attemptId);
  const attempt = await journal.attempts.read(seeded.attemptId);
  if (finalCleanup.type === 'err') {
    await writeReconcileFailure(receiptPath, 'final-cleanup-read', finalCleanup.issues[0].code);
    return false;
  }
  if (attempt.type === 'err') {
    await writeReconcileFailure(receiptPath, 'attempt-read', attempt.issues[0].code);
    return false;
  }
  const finalStateFailure = finalCleanup.value === null
    ? 'cleanup-missing'
    : finalCleanup.value.processAttemptId !== seeded.attemptId
      ? 'cleanup-attempt-mismatch'
      : finalCleanup.value.pm2Deletion.processAttemptId !== seeded.attemptId
        ? 'deletion-attempt-mismatch'
        : finalCleanup.value.terminalDisposition !== input.terminalDisposition
          ? 'disposition-mismatch'
          : attempt.value?.state !== 'cleaned'
            ? 'attempt-not-cleaned'
            : undefined;
  if (finalStateFailure !== undefined) {
    await writeReconcileFailure(receiptPath, 'final-state', finalStateFailure);
    return false;
  }
  await writeReceipt(receiptPath, {
    format: FORMAT,
    proof: 'receiver-cleanup-proved',
    pm2Record: 'absent',
    windowsJob: 'absent',
    trustedArtifacts: 'absent',
    secretExposures: 'closed'
  });
  return true;
};

const main = async (): Promise<boolean> => {
  const plan = parsePlan(Bun.argv.slice(2));
  if (plan === undefined) return false;
  const input = await readInput(plan.inputPath);
  if (input === undefined) return false;
  return plan.command === 'seed'
    ? seedReceipt(input, plan.receiptPath)
    : reconcileCleanup(input, plan.receiptPath);
};

if (!(await main())) process.exitCode = 1;
