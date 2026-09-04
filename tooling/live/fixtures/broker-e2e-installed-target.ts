import { createHash } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Replaced with `@epsilonode/nebular/broker-client` in the isolated consumer.
import {
  clientErr,
  createManagedBunRecipeBootstrapRuntime,
  prepareManagedBunRecipeEnvironmentThenImport,
  type BrokerClientIssueCode
} from '../../../broker-client.ts';

const TARGET_RECEIPT_PATH = join(import.meta.dir, '.nebular-e2e', 'target-receipt.json');
const PENDING_RECEIPT_PATH = `${TARGET_RECEIPT_PATH}.pending`;
const TARGET_FIRST_EFFECT_RECEIPT_PATH = join(
  import.meta.dir,
  '.nebular-e2e',
  'target-first-effect.json'
);
const PENDING_TARGET_FIRST_EFFECT_RECEIPT_PATH = `${TARGET_FIRST_EFFECT_RECEIPT_PATH}.pending`;
const TARGET_BOOTSTRAP_RECEIPT_PATH = join(
  import.meta.dir,
  '.nebular-e2e',
  'target-bootstrap-terminal.json'
);
const PENDING_TARGET_BOOTSTRAP_RECEIPT_PATH = `${TARGET_BOOTSTRAP_RECEIPT_PATH}.pending`;
const CONTAINMENT_CONFIRMATION_WINDOW_MS = 1_000;
const BROKER_BINDING_RETRY_POLICY = Object.freeze({
  maximumAttempts: 32,
  delayMs: 500
});

type TargetFirstEffectState = 'assigned' | 'already-contained' | 'failed';
type TargetBootstrapRejection =
  | 'bootstrap-rejected-attempt-mismatch'
  | 'bootstrap-rejected-authority-denied'
  | 'bootstrap-rejected-grant-expired'
  | 'bootstrap-rejected-grant-revoked'
  | 'bootstrap-rejected-protocol-invalid'
  | 'bootstrap-rejected-recipe-drift'
  | 'bootstrap-rejected-secret-unavailable'
  | 'bootstrap-rejected-slot-not-authorized';
type TargetBootstrapOutcome = 'prepared' | BrokerClientIssueCode | TargetBootstrapRejection;

const bootstrapRejectionOutcomes: Readonly<Record<string, TargetBootstrapRejection>> = {
  'The broker rejected the managed process attempt.': 'bootstrap-rejected-attempt-mismatch',
  'The broker denied bootstrap authority.': 'bootstrap-rejected-authority-denied',
  'The repository-scoped grant has expired.': 'bootstrap-rejected-grant-expired',
  'The repository-scoped grant is revoked.': 'bootstrap-rejected-grant-revoked',
  'The broker rejected the bootstrap protocol exchange.': 'bootstrap-rejected-protocol-invalid',
  'The validated recipe revision has changed.': 'bootstrap-rejected-recipe-drift',
  'A requested credential is unavailable.': 'bootstrap-rejected-secret-unavailable',
  'A requested credential slot is not authorized.': 'bootstrap-rejected-slot-not-authorized'
};

const targetBootstrapOutcome = (
  issue: Readonly<{ code: BrokerClientIssueCode; message: string }>
): TargetBootstrapOutcome => issue.code === 'bootstrap-rejected'
  ? bootstrapRejectionOutcomes[issue.message] ?? issue.code
  : issue.code;

const jobIdentityCommitment = (identity: string): string => createHash('sha256').update(JSON.stringify([
  'epsilonode/nebular/job-identity-commitment/v1',
  identity
])).digest('hex');

const observeTargetFirstEffect = async (
  state: TargetFirstEffectState,
  commitment: string | null
): Promise<void> => {
  try {
    await mkdir(dirname(TARGET_FIRST_EFFECT_RECEIPT_PATH), { recursive: true });
    await rm(PENDING_TARGET_FIRST_EFFECT_RECEIPT_PATH, { force: true });
    await Bun.write(PENDING_TARGET_FIRST_EFFECT_RECEIPT_PATH, JSON.stringify({
      format: 'nebular-four-artifact-e2e/v1',
      proof: 'target-first-effect',
      state,
      jobIdentityCommitment: commitment
    }));
    await rename(PENDING_TARGET_FIRST_EFFECT_RECEIPT_PATH, TARGET_FIRST_EFFECT_RECEIPT_PATH);
  } catch {
    await rm(PENDING_TARGET_FIRST_EFFECT_RECEIPT_PATH, { force: true }).catch(() => undefined);
  }
};

const observeTargetBootstrap = async (outcome: TargetBootstrapOutcome): Promise<void> => {
  try {
    await mkdir(dirname(TARGET_BOOTSTRAP_RECEIPT_PATH), { recursive: true });
    await rm(PENDING_TARGET_BOOTSTRAP_RECEIPT_PATH, { force: true });
    await Bun.write(PENDING_TARGET_BOOTSTRAP_RECEIPT_PATH, JSON.stringify({
      format: 'nebular-four-artifact-e2e/v1',
      proof: 'target-bootstrap-terminal',
      outcome
    }));
    await rename(PENDING_TARGET_BOOTSTRAP_RECEIPT_PATH, TARGET_BOOTSTRAP_RECEIPT_PATH);
  } catch {
    await rm(PENDING_TARGET_BOOTSTRAP_RECEIPT_PATH, { force: true }).catch(() => undefined);
  }
};

const baseRuntime = createManagedBunRecipeBootstrapRuntime();
const runtime = {
  ...baseRuntime,
  containment: {
    enter: () => Promise.resolve().then(() => baseRuntime.containment.enter()).then(
      async result => {
        await observeTargetFirstEffect(
          result.isErr() ? 'failed' : result.value.identity.state,
          result.isErr() ? null : jobIdentityCommitment(result.value.identity.job.value)
        );
        return result;
      },
      async () => {
        await observeTargetFirstEffect('failed', null);
        return clientErr({
          code: 'transport-unavailable',
          message: 'The target first-effect gate was unavailable.'
        });
      }
    )
  }
};

const prepared = await prepareManagedBunRecipeEnvironmentThenImport(
  {
    slots: [{
      slotId: 'e2e-provider',
      environmentName: 'E2E_PROVIDER_VALUE'
    }],
    // This is the target side of the explicit broker-binding handshake, not
    // an application delay. Its 16-second bound stays inside the committed
    // recipe's 20-second one-shot deadline.
    retryPolicy: BROKER_BINDING_RETRY_POLICY
  },
  () => import('./broker-e2e-application.ts'),
  runtime
);

await observeTargetBootstrap(prepared.isErr()
  ? targetBootstrapOutcome(prepared.error[0])
  : 'prepared');

if (prepared.isErr()) {
  process.exit(1);
}

try {
  const receipt = prepared.value.application.run();
  await mkdir(dirname(TARGET_RECEIPT_PATH), { recursive: true });
  await Bun.write(PENDING_RECEIPT_PATH, JSON.stringify(receipt));
  await rename(PENDING_RECEIPT_PATH, TARGET_RECEIPT_PATH);
  // Keep the exact managed root alive long enough for the host to bind and
  // durably verify containment before this intentionally tiny target exits.
  await delay(CONTAINMENT_CONFIRMATION_WINDOW_MS);
} catch {
  await rm(PENDING_RECEIPT_PATH, { force: true });
  process.exit(1);
}
