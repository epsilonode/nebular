import { resolve } from 'node:path';

import {
  brokerBootstrapChildExchangeId,
  createBunBootstrapInheritedIpcChildRuntime,
  runBrokerBootstrapInheritedIpcChild
} from '../../src/broker/bun-bootstrap-inherited-ipc.ts';
import {
  authorizeSecretLease,
  parseCredentialReference,
  parseSecretExposureCorrelation,
  parseSecretLeaseId,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type AuthorizedSecretLease,
  type SecretDeliveryGrant,
  type SecretLeaseRequest,
  type SecretSlotBinding
} from '../../src/broker/lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from '../../src/broker/primitives.ts';
import type { ScopedSecret, SecretStoreLeasePort } from '../../src/broker/secret-delivery.ts';
import {
  bunProcessEnvironmentNames,
  createBootstrapRequest,
  createBunCooperativeBootstrapTransportPort,
  createBunProcessEnvironmentInstallPort,
  prepareRecipeEnvironmentThenImport
} from '../../src/broker-client/public.ts';

const LIVE_ENVIRONMENT_NAME = 'NEBULAR_LIVE_BOOTSTRAP_TOKEN';
const LIVE_SECRET_CANARY = 'NEBULAR_LIVE_SECRET_CANARY';
const LIVE_REPOSITORY = 'R:/Code/web/wx-teleport-cartridge';
const LIVE_RECIPE_REVISION = 'live-bootstrap-revision-1';
const LIVE_GRANT_ID = 'live-bootstrap-grant-1';
const LIVE_SLOT_ID = 'live-bootstrap-slot-1';
const LIVE_CREDENTIAL_REFERENCE = 'live-bootstrap-credential-1';
const LIVE_LEASE_ID = 'live-bootstrap-lease-1';
const LIVE_EXPOSURE_CORRELATION = 'live-bootstrap-exposure-1';
const LIVE_RECEIVER_ID = 'pm2';
const LIVE_PROCESS_ATTEMPT_ID = 'live-bootstrap-attempt-1';
const LIVE_EXCHANGE_ID = 'live-bootstrap-exchange-1';

type LiveBootstrapOutcome =
  | Readonly<{ outcome: 'passed' }>
  | Readonly<{ outcome: 'failed'; message: string }>;

const livePassed = (): LiveBootstrapOutcome => ({ outcome: 'passed' });
const liveFailed = (message: string): LiveBootstrapOutcome => ({ outcome: 'failed', message });

const liveAuthorizedLease = (nowMs: number): AuthorizedSecretLease => {
  const repository = parseCanonicalRepository(LIVE_REPOSITORY);
  const recipeRevision = parseRecipeRevision(LIVE_RECIPE_REVISION);
  const grantId = parseGrantId(LIVE_GRANT_ID);
  const slotId = parseCredentialSlotId(LIVE_SLOT_ID);
  const credentialReference = parseCredentialReference(LIVE_CREDENTIAL_REFERENCE);
  const leaseId = parseSecretLeaseId(LIVE_LEASE_ID);
  const exposureCorrelation = parseSecretExposureCorrelation(LIVE_EXPOSURE_CORRELATION);
  const receiverId = parseReceiverId(LIVE_RECEIVER_ID);
  const processAttemptId = parseProcessAttemptId(LIVE_PROCESS_ATTEMPT_ID);
  if (repository.isErr() || recipeRevision.isErr() || grantId.isErr() || slotId.isErr() ||
      credentialReference.isErr() || leaseId.isErr() || exposureCorrelation.isErr() || receiverId.isErr() ||
      processAttemptId.isErr()) {
    throw new Error('Live bootstrap authority fixture could not be constructed.');
  }
  const binding: SecretSlotBinding = {
    slotId: slotId.value,
    credentialReference: credentialReference.value,
    environmentName: LIVE_ENVIRONMENT_NAME
  };
  const grant: SecretDeliveryGrant = {
    id: grantId.value,
    generation: 3,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    bindings: [binding],
    expiresAtMs: nowMs + 30_000,
    revoked: false,
    exposureMode: 'cooperative-bootstrap'
  };
  const request: SecretLeaseRequest = {
    id: leaseId.value,
    grantId: grantId.value,
    grantGeneration: grant.generation,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    receiverId: receiverId.value,
    processAttemptId: processAttemptId.value,
    exposureCorrelation: exposureCorrelation.value,
    bindings: [binding],
    requestedAtMs: nowMs,
    expiresAtMs: nowMs + 20_000,
    exposureMode: 'cooperative-bootstrap'
  };
  const authorized = authorizeSecretLease(grant, request, nowMs);
  if (authorized.isErr()) throw new Error('Live bootstrap lease was not authorized.');
  return authorized.value;
};

const liveSecretStore = (): SecretStoreLeasePort => ({
  withSecret: (reference, use) => {
    if (reference.value !== LIVE_CREDENTIAL_REFERENCE) {
      return secretLeaseTaskErr({
        code: 'secret-unavailable',
        message: 'Live bootstrap requested an unexpected credential reference.'
      });
    }
    const secret: ScopedSecret = {
      deliverTo: (sink, slot) => sink.install(slot, LIVE_SECRET_CANARY)
    };
    const used = use(secret);
    return used.isErr()
      ? secretLeaseTaskErr(used.error[0], ...used.error.slice(1))
      : secretLeaseTaskOk(undefined);
  }
});

const runChild = async (exchangeId: string): Promise<LiveBootstrapOutcome> => {
  const nowMs = Date.now();
  const lease = liveAuthorizedLease(nowMs);
  const result = await runBrokerBootstrapInheritedIpcChild({ exchangeId }, {
    authority: {
      resolveAuthorizedLease: () => secretLeaseTaskOk(lease),
      transitionLease: () => secretLeaseTaskOk(undefined)
    },
    clock: { nowMs: () => Date.now() },
    runtime: createBunBootstrapInheritedIpcChildRuntime(),
    secretStore: liveSecretStore()
  });
  return result.isErr()
    ? liveFailed(`Live broker bootstrap child failed: ${result.error[0].code}.`)
    : livePassed();
};

const runParent = async (): Promise<LiveBootstrapOutcome> => {
  if (process.env[LIVE_ENVIRONMENT_NAME] !== undefined) {
    return liveFailed('Live bootstrap environment name already exists; refusing to overwrite it.');
  }
  const request = createBootstrapRequest({
    exchangeId: LIVE_EXCHANGE_ID,
    repository: LIVE_REPOSITORY,
    recipeRevision: LIVE_RECIPE_REVISION,
    grantId: LIVE_GRANT_ID,
    grantGeneration: 3,
    receiverId: LIVE_RECEIVER_ID,
    processAttemptId: LIVE_PROCESS_ATTEMPT_ID,
    slots: [{ slotId: LIVE_SLOT_ID, environmentName: LIVE_ENVIRONMENT_NAME }]
  });
  if (request.isErr()) return liveFailed('Live bootstrap request could not be constructed.');
  const projectRoot = resolve(import.meta.dir, '..', '..');
  const helperEntrypoint = resolve(import.meta.dir, 'bun-secret-bootstrap.ts');
  const prepared = await prepareRecipeEnvironmentThenImport({
    request: request.value,
    inheritedEnvironmentNames: bunProcessEnvironmentNames()
  }, {
    clock: { nowMs: () => Date.now() },
    environment: createBunProcessEnvironmentInstallPort(),
    transport: createBunCooperativeBootstrapTransportPort({
      brokerEntrypoint: helperEntrypoint,
      cwd: projectRoot,
      timeoutMs: 20_000
    })
  }, () => Promise.resolve({
    evaluatedAfterInstall: process.env[LIVE_ENVIRONMENT_NAME] === LIVE_SECRET_CANARY
  })).finally(() => {
    delete process.env[LIVE_ENVIRONMENT_NAME];
  });

  if (prepared.isErr()) return liveFailed(`Live cooperative bootstrap failed: ${prepared.error[0].code}.`);
  if (!prepared.value.application.evaluatedAfterInstall ||
      prepared.value.environment.installedSlots.length !== 1 ||
      JSON.stringify(prepared).includes(LIVE_SECRET_CANARY)) {
    return liveFailed('Live cooperative bootstrap returned an invalid or secret-bearing receipt.');
  }
  return livePassed();
};

const childExchangeId = brokerBootstrapChildExchangeId(Bun.argv);
if (childExchangeId.isErr()) {
  throw new Error(`Live bootstrap child argument failed: ${childExchangeId.error[0].code}.`);
}
const isChild = childExchangeId.value !== undefined;
const outcome = isChild
  ? await runChild(childExchangeId.value)
  : await runParent();
if (outcome.outcome === 'failed') {
  throw new Error(outcome.message);
}
if (!isChild) {
  console.log('Bun secret-bootstrap E2E passed with authority revalidation, atomic environment install, and helper exit.');
}
