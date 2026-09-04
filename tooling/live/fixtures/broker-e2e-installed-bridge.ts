import { createHash, randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';

// The live materializer replaces these four exact development imports with the
// corresponding installed package subpaths before committing the consumer.
import * as teleport from '../../../teleport.ts';
import * as brokerClient from '../../../broker-client.ts';
import * as recipeRunner from '../../../recipe-runner.ts';
import * as broker from '../../../broker.ts';

const FORMAT = 'nebular-four-artifact-e2e/v1' as const;
const IMPORTED_SPECIFIERS = [
  '@epsilonode/nebular',
  '@epsilonode/nebular/broker-client',
  '@epsilonode/nebular/recipe-runner',
  '@epsilonode/nebular/broker'
] as const;
const RESOLVED_RUNTIME_PATHS = [
  'dist/teleport.js',
  'dist/broker-client.js',
  'dist/recipe-runner.js',
  'dist/broker.js'
] as const;

type BridgePlan =
  | Readonly<{ command: 'probe'; receiptPath: string }>
  | Readonly<{ command: 'decode-recipe'; receiptPath: string; recipePath: string }>
  | Readonly<{ command: 'provision-canary'; credentialReference: string; receiptPath: string }>
  | Readonly<{ command: 'delete-canary'; credentialReference: string; receiptPath: string }>;

const boundedText = (value: string | undefined, maximum: number): value is string =>
  value !== undefined && value.length > 0 && value.length <= maximum && !value.includes('\0');

const parsePlan = (argv: readonly string[]): BridgePlan | undefined => {
  const command = argv[0];
  if (command === 'probe' && argv.length === 3 && argv[1] === '--receipt' &&
      boundedText(argv[2], 32_767) && isAbsolute(argv[2])) {
    return { command, receiptPath: argv[2] };
  }
  if (command === 'decode-recipe' && argv.length === 5 && argv[1] === '--recipe' &&
      argv[3] === '--receipt' && boundedText(argv[2], 32_767) && isAbsolute(argv[2]) &&
      boundedText(argv[4], 32_767) && isAbsolute(argv[4])) {
    return { command, recipePath: argv[2], receiptPath: argv[4] };
  }
  if ((command === 'provision-canary' || command === 'delete-canary') && argv.length === 5 &&
      argv[1] === '--reference' && argv[3] === '--receipt' && boundedText(argv[2], 256) &&
      boundedText(argv[4], 32_767) && isAbsolute(argv[4])) {
    return { command, credentialReference: argv[2], receiptPath: argv[4] };
  }
  return undefined;
};

const writeReceipt = (path: string, value: unknown): Promise<void> =>
  Bun.write(path, JSON.stringify(value)).then(() => undefined);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolvesToExpectedArtifacts = (): boolean => {
  try {
    return IMPORTED_SPECIFIERS.every((specifier, index) => {
      const expected = RESOLVED_RUNTIME_PATHS[index];
      const resolved = import.meta.resolve(specifier).replaceAll('\\', '/');
      return expected !== undefined && resolved.startsWith('file:') &&
        resolved.endsWith(`/${expected}`);
    });
  } catch {
    return false;
  }
};

type ProbeFailureCode =
  | 'artifact-resolution'
  | 'broker-client-witness'
  | 'broker-witness'
  | 'profile-witness'
  | 'recipe-runner-witness'
  | 'teleport-witness';

const probeFailure = async (
  receiptPath: string,
  code: ProbeFailureCode
): Promise<boolean> => {
  await writeReceipt(receiptPath, {
    format: FORMAT,
    proof: 'installed-four-artifact-probe-failed',
    code
  });
  return false;
};

const runProbe = async (plan: Extract<BridgePlan, { command: 'probe' }>): Promise<boolean> => {
  if (typeof broker.createWindowsKnownFolderLocalApplicationDataPort !== 'function' ||
      typeof broker.createBunSqliteAuthorityJournal !== 'function') {
    return probeFailure(plan.receiptPath, 'broker-witness');
  }
  if (typeof recipeRunner.decodeAndAdmitRecipeXml !== 'function') {
    return probeFailure(plan.receiptPath, 'recipe-runner-witness');
  }
  const registry = teleport.createTeleportCodecRegistry();
  const control = brokerClient.decodeBrokerControlMessage({
    protocolVersion: 1,
    messageKind: 'request',
    requestId: 'four-artifact-e2e-probe',
    sequence: 0,
    sentAtMs: 0,
    payload: { operation: 'doctor', credentialSlotIds: [] }
  });
  if (registry.length !== 0) return probeFailure(plan.receiptPath, 'teleport-witness');
  if (control.isErr()) return probeFailure(plan.receiptPath, 'broker-client-witness');
  const profile = await broker.createWindowsKnownFolderLocalApplicationDataPort()
    .resolveCurrentUserRoot()
    .then(value => value, () => undefined);
  if (profile === undefined || profile.type === 'err') {
    return probeFailure(plan.receiptPath, 'profile-witness');
  }
  if (!resolvesToExpectedArtifacts()) return probeFailure(plan.receiptPath, 'artifact-resolution');
  await writeReceipt(plan.receiptPath, {
    format: FORMAT,
    proof: 'installed-four-artifact-imports',
    importedSpecifiers: IMPORTED_SPECIFIERS,
    resolvedRuntimePaths: RESOLVED_RUNTIME_PATHS,
    trustedProfileRoot: profile.value.value
  });
  return true;
};

const runRecipeDecode = async (
  plan: Extract<BridgePlan, { command: 'decode-recipe' }>
): Promise<boolean> => {
  const xml = await Bun.file(plan.recipePath).text();
  const decoded = recipeRunner.decodeAndAdmitRecipeXml(xml);
  if (decoded.isErr()) return false;
  const admitted: unknown = decoded.value;
  const semantic = isRecord(admitted) ? admitted['semantic'] : undefined;
  if (!isRecord(semantic) || semantic['lifecycle'] !== 'one-shot' || semantic['receiver'] !== 'pm2' ||
      !Array.isArray(semantic['credentialSlots']) || semantic['credentialSlots'].length !== 1) return false;
  await writeReceipt(plan.receiptPath, {
    format: FORMAT,
    proof: 'committed-recipe-admitted',
    lifecycle: 'one-shot',
    receiver: 'pm2',
    credentialSlotCount: 1
  });
  return true;
};

const credentialReference = (value: string): broker.CredentialReference | undefined => {
  const parsed = broker.parseCredentialReference(value);
  return parsed.isOk() ? parsed.value : undefined;
};

const runCanaryProvision = async (
  plan: Extract<BridgePlan, { command: 'provision-canary' }>
): Promise<boolean> => {
  const reference = credentialReference(plan.credentialReference);
  if (reference === undefined) return false;
  const canary = randomBytes(32).toString('base64url');
  const expectedSha256 = createHash('sha256').update(canary).digest('hex');
  const scope = broker.openSecretInputScope();
  const captured = scope.capture.capture(canary);
  if (captured.isErr()) {
    broker.disposeSecretInputScope(scope);
    return false;
  }
  const stored = await broker.createBunSecretStoreAdminPort().store(
    reference,
    captured.value,
    scope.nonce
  );
  broker.disposeSecretInputScope(scope);
  if (stored.isErr()) return false;
  await writeReceipt(plan.receiptPath, {
    format: FORMAT,
    proof: 'temporary-keychain-canary-stored',
    expectedSha256
  });
  return true;
};

const runCanaryDelete = async (
  plan: Extract<BridgePlan, { command: 'delete-canary' }>
): Promise<boolean> => {
  const reference = credentialReference(plan.credentialReference);
  if (reference === undefined) return false;
  const removed = await broker.createBunSecretStoreAdminPort().delete(reference);
  if (removed.isErr()) return false;
  const remained = await broker.createBunSecretStoreLeasePort().withSecret(
    reference,
    () => broker.secretLeaseOk(undefined)
  );
  if (remained.isOk()) return false;
  await writeReceipt(plan.receiptPath, {
    format: FORMAT,
    proof: 'temporary-keychain-canary-absent'
  });
  return true;
};

const run = (plan: BridgePlan): Promise<boolean> => {
  switch (plan.command) {
    case 'probe': return runProbe(plan);
    case 'decode-recipe': return runRecipeDecode(plan);
    case 'provision-canary': return runCanaryProvision(plan);
    case 'delete-canary': return runCanaryDelete(plan);
  }
};

const startupReceiptPath = Bun.argv.at(-1);
if (boundedText(startupReceiptPath, 32_767) && isAbsolute(startupReceiptPath)) {
  await writeReceipt(startupReceiptPath, {
    format: FORMAT,
    proof: 'installed-four-artifact-bridge-started'
  });
}
const plan = parsePlan(Bun.argv.slice(2));
if (plan === undefined || !(await run(plan))) process.exitCode = 1;
