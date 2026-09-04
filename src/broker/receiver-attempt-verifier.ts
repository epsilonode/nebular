import { setTimeout as delay } from 'node:timers/promises';

import type {
  VerifiedBootstrapReceiverAttempt
} from './bootstrap-authority.ts';
import {
  parseCheckedInRecipeLocator,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  type BootstrapAttemptJournalRecord,
  type ProcessIncarnation,
  type ReceiverCorrelation,
  type ReceiverEntryIdentity
} from './journal.ts';
import {
  secretLeaseErr,
  secretLeaseOk,
  type SecretLeaseResult
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision,
  type CanonicalRepository,
  type GrantId,
  type ProcessAttemptId,
  type ReceiverId,
  type RecipeRevision
} from './primitives.ts';

export const RECEIVER_ATTEMPT_VERIFICATION_MAX_TIMEOUT_MS = 10_000;

export type CurrentBrokerProcessObservation =
  | Readonly<{
      status: 'resolved';
      processId: number;
      parentProcessId: number;
    }>
  | Readonly<{ status: 'unavailable' }>;

export type CurrentBrokerProcessPort = Readonly<{
  readCurrentProcess: () => Promise<unknown>;
}>;

export type ReceiverAttemptProjectionQuery = Readonly<{
  format: 'bootstrap-receiver-attempt-query/v1';
  receiverId: ReceiverId;
  receiverEntryIdentity: ReceiverEntryIdentity;
}>;

export type StrictReceiverAttemptOwnership = Readonly<{
  processAttemptId: ProcessAttemptId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  grantGeneration: number;
  bindingGeneration: number;
}>;

export type StrictReceiverAttemptFact = Readonly<{
  format: 'bootstrap-receiver-attempt-projection/v1';
  receiverId: ReceiverId;
  receiverEntryIdentity: ReceiverEntryIdentity;
  receiverCorrelation: ReceiverCorrelation;
  processId: number;
  lifecycleState: 'launching' | 'online' | 'stopping' | 'stopped' | 'errored';
  ownership: StrictReceiverAttemptOwnership;
}>;

export type ReceiverAttemptProjectionObservation =
  | Readonly<{ status: 'resolved'; fact: StrictReceiverAttemptFact }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'ambiguous' }>
  | Readonly<{ status: 'unavailable' }>;

/**
 * Implementations must project only the fields in
 * `ReceiverAttemptProjectionObservation`. Raw PM2 process records, environment
 * objects, command arguments, or logs are never admissible values here.
 */
export type StrictReceiverAttemptProjectionPort = Readonly<{
  readStrictProjection: (query: ReceiverAttemptProjectionQuery) => Promise<unknown>;
}>;

export type ProcessIncarnationQuery = Readonly<{
  processId: number;
}>;

export type ProcessIncarnationObservation =
  | Readonly<{
      status: 'running';
      processId: number;
      incarnation: ProcessIncarnation;
    }>
  | Readonly<{ status: 'missing'; processId: number }>
  | Readonly<{ status: 'stopped'; processId: number }>
  | Readonly<{ status: 'inaccessible'; processId: number }>
  | Readonly<{ status: 'unavailable'; processId: number }>;

export type CurrentProcessIncarnationPort = Readonly<{
  readCurrentIncarnation: (query: ProcessIncarnationQuery) => Promise<unknown>;
}>;

export type BootstrapReceiverAttemptVerifierPorts = Readonly<{
  brokerProcess: CurrentBrokerProcessPort;
  processIncarnations: CurrentProcessIncarnationPort;
  receiverAttempts: StrictReceiverAttemptProjectionPort;
}>;

/**
 * Lift-ready strict verifier contract. The privileged bootstrap-authority
 * boundary performs the one-line conversion to its class-backed ResultAsync
 * port so this OS/receiver seam remains under the default hard-FP rules.
 */
export type CurrentReceiverAttemptVerificationPort = Readonly<{
  verifyCurrentAttempt: (
    attempt: BootstrapAttemptJournalRecord
  ) => Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>>;
}>;

type BoundedObservation =
  | Readonly<{ status: 'received'; value: unknown }>
  | Readonly<{ status: 'unavailable' }>;

type DecodedCurrentProcess = Extract<CurrentBrokerProcessObservation, { status: 'resolved' }>;
type DecodedReceiverProjection = Extract<ReceiverAttemptProjectionObservation, { status: 'resolved' }>;
type DecodedProcessIncarnation = Extract<ProcessIncarnationObservation, { status: 'running' }>;

export type ReceiverAttemptVerificationDenialReason =
  | 'durable-attempt-invalid'
  | 'broker-process-unavailable'
  | 'broker-process-invalid'
  | 'broker-parent-mismatch'
  | 'receiver-observation-unavailable'
  | 'receiver-fact-invalid'
  | 'receiver-fact-mismatch'
  | 'incarnation-observation-unavailable'
  | 'incarnation-fact-invalid'
  | 'incarnation-mismatch';

const denied = <Value>(reason: ReceiverAttemptVerificationDenialReason): SecretLeaseResult<Value> => secretLeaseErr({
  code: 'bootstrap-rejected',
  message: `Current managed process authority could not be verified (${reason}).`
});
const verificationDenied = (
  reason: ReceiverAttemptVerificationDenialReason
): SecretLeaseResult<VerifiedBootstrapReceiverAttempt> => denied(reason);

const unavailableObservation = (): BoundedObservation => ({ status: 'unavailable' });
const receivedObservation = (value: unknown): BoundedObservation => ({ status: 'received', value });

const boundedObservation = (
  effect: () => Promise<unknown>,
  timeoutMs: number
): Promise<BoundedObservation> => {
  const cancellation: Readonly<AbortController> = new AbortController();
  const operation = Promise.resolve().then(effect).then(
    receivedObservation,
    unavailableObservation
  );
  const deadline = delay(timeoutMs, undefined, { signal: cancellation.signal }).then(
    unavailableObservation,
    unavailableObservation
  );
  return Promise.race([operation, deadline]).then(
    observation => {
      cancellation.abort();
      return observation;
    },
    () => {
      cancellation.abort();
      return unavailableObservation();
    }
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean => {
  const actual: readonly string[] = Object.keys(value);
  return actual.length === keys.length && keys.every(key => actual.includes(key));
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isGeneration = (value: unknown): value is number => isPositiveInteger(value);

const decodeCurrentProcess = (value: unknown): DecodedCurrentProcess | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['status', 'processId', 'parentProcessId']) ||
      value['status'] !== 'resolved' || !isPositiveInteger(value['processId']) ||
      !isPositiveInteger(value['parentProcessId'])) {
    return null;
  }
  return {
    status: 'resolved',
    processId: value['processId'],
    parentProcessId: value['parentProcessId']
  };
};

const decodeReceiverOwnership = (value: unknown): StrictReceiverAttemptOwnership | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'processAttemptId',
    'repository',
    'recipeRevision',
    'grantId',
    'grantGeneration',
    'bindingGeneration'
  ])) return null;
  const processAttemptId = parseProcessAttemptId(value['processAttemptId']);
  const repository = parseCanonicalRepository(value['repository']);
  const recipeRevision = parseRecipeRevision(value['recipeRevision']);
  const grantId = parseGrantId(value['grantId']);
  return processAttemptId.isOk() && repository.isOk() && recipeRevision.isOk() && grantId.isOk() &&
    isGeneration(value['grantGeneration']) && isGeneration(value['bindingGeneration'])
    ? {
        processAttemptId: processAttemptId.value,
        repository: repository.value,
        recipeRevision: recipeRevision.value,
        grantId: grantId.value,
        grantGeneration: value['grantGeneration'],
        bindingGeneration: value['bindingGeneration']
      }
    : null;
};

const decodeLifecycleState = (value: unknown): StrictReceiverAttemptFact['lifecycleState'] | null => {
  switch (value) {
    case 'launching':
    case 'online':
    case 'stopping':
    case 'stopped':
    case 'errored':
      return value;
    default:
      return null;
  }
};

const decodeReceiverEntryIdentity = (value: unknown): ReceiverEntryIdentity | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['kind', 'value']) ||
      value['kind'] !== 'receiver-entry-identity') return null;
  const parsed = parseReceiverEntryIdentity(value['value']);
  return parsed.type === 'ok' ? parsed.value : null;
};

const decodeReceiverCorrelation = (value: unknown): ReceiverCorrelation | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['kind', 'value']) ||
      value['kind'] !== 'receiver-correlation') return null;
  const parsed = parseReceiverCorrelation(value['value']);
  return parsed.type === 'ok' ? parsed.value : null;
};

const decodeReceiverFact = (value: unknown): StrictReceiverAttemptFact | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'format',
    'receiverId',
    'receiverEntryIdentity',
    'receiverCorrelation',
    'processId',
    'lifecycleState',
    'ownership'
  ]) || value['format'] !== 'bootstrap-receiver-attempt-projection/v1' ||
      !isPositiveInteger(value['processId'])) return null;
  const receiverId = parseReceiverId(value['receiverId']);
  const receiverEntryIdentity = decodeReceiverEntryIdentity(value['receiverEntryIdentity']);
  const receiverCorrelation = decodeReceiverCorrelation(value['receiverCorrelation']);
  const lifecycleState = decodeLifecycleState(value['lifecycleState']);
  const ownership = decodeReceiverOwnership(value['ownership']);
  return receiverId.isOk() && receiverEntryIdentity !== null && receiverCorrelation !== null &&
    lifecycleState !== null && ownership !== null
    ? {
        format: 'bootstrap-receiver-attempt-projection/v1',
        receiverId: receiverId.value,
        receiverEntryIdentity,
        receiverCorrelation,
        processId: value['processId'],
        lifecycleState,
        ownership
      }
    : null;
};

const decodeReceiverProjection = (value: unknown): DecodedReceiverProjection | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['status', 'fact']) || value['status'] !== 'resolved') return null;
  const fact = decodeReceiverFact(value['fact']);
  return fact === null ? null : { status: 'resolved', fact };
};

const decodeProcessIncarnation = (value: unknown): DecodedProcessIncarnation | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['status', 'processId', 'incarnation']) ||
      value['status'] !== 'running' || !isPositiveInteger(value['processId'])) return null;
  const incarnationValue = value['incarnation'];
  if (!isRecord(incarnationValue) || !hasExactKeys(incarnationValue, ['kind', 'value']) ||
      incarnationValue['kind'] !== 'process-incarnation') return null;
  const incarnation = parseProcessIncarnation(incarnationValue['value']);
  return incarnation.type === 'ok'
    ? { status: 'running', processId: value['processId'], incarnation: incarnation.value }
    : null;
};

const validTimeout = (timeoutMs: number): boolean => Number.isSafeInteger(timeoutMs) && timeoutMs > 0 &&
  timeoutMs <= RECEIVER_ATTEMPT_VERIFICATION_MAX_TIMEOUT_MS;

const durableAttemptIsEligible = (attempt: BootstrapAttemptJournalRecord): boolean => {
  const binding = attempt.bootstrapBinding;
  return (attempt.state === 'materializing' || attempt.state === 'running') &&
    isGeneration(attempt.stateVersion) && attempt.receiverCorrelation !== null &&
    parseProcessAttemptId(attempt.id).isOk() && parseCanonicalRepository(attempt.repository).isOk() &&
    parseRecipeRevision(attempt.recipeRevision).isOk() && isGeneration(binding.bindingGeneration) &&
    parseGrantId(binding.grantId).isOk() && isGeneration(binding.grantGeneration) &&
    parseReceiverId(binding.receiverId).isOk() &&
    parseReceiverEntryIdentity(binding.receiverEntryIdentity.value).type === 'ok' &&
    isPositiveInteger(binding.helperParentProcessId) &&
    parseProcessIncarnation(binding.helperParentProcessIncarnation.value).type === 'ok' &&
    parseCheckedInRecipeLocator(binding.recipeLocator.value).type === 'ok' &&
    parseReceiverCorrelation(attempt.receiverCorrelation.value).type === 'ok';
};

const receiverLifecycleIsEligible = (
  attempt: BootstrapAttemptJournalRecord,
  fact: StrictReceiverAttemptFact
): boolean => fact.lifecycleState === 'online' ||
  (attempt.state === 'materializing' && fact.lifecycleState === 'launching');

const receiverFactMatchesAttempt = (
  attempt: BootstrapAttemptJournalRecord,
  fact: StrictReceiverAttemptFact
): boolean => {
  const binding = attempt.bootstrapBinding;
  const ownership = fact.ownership;
  return fact.receiverId === binding.receiverId &&
    fact.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
    attempt.receiverCorrelation !== null &&
    fact.receiverCorrelation.value === attempt.receiverCorrelation.value &&
    fact.processId === binding.helperParentProcessId &&
    ownership.processAttemptId === attempt.id && ownership.repository === attempt.repository &&
    ownership.recipeRevision === attempt.recipeRevision && ownership.grantId === binding.grantId &&
    ownership.grantGeneration === binding.grantGeneration &&
    ownership.bindingGeneration === binding.bindingGeneration &&
    receiverLifecycleIsEligible(attempt, fact);
};

const verifiedAttempt = (
  attempt: BootstrapAttemptJournalRecord
): VerifiedBootstrapReceiverAttempt => ({
  state: 'verified-current-attempt',
  processAttemptId: attempt.id,
  repository: attempt.repository,
  recipeRevision: attempt.recipeRevision,
  grantId: attempt.bootstrapBinding.grantId,
  grantGeneration: attempt.bootstrapBinding.grantGeneration,
  receiverId: attempt.bootstrapBinding.receiverId,
  bindingGeneration: attempt.bootstrapBinding.bindingGeneration,
  receiverEntryIdentity: attempt.bootstrapBinding.receiverEntryIdentity,
  helperParentProcessId: attempt.bootstrapBinding.helperParentProcessId,
  helperParentProcessIncarnation: attempt.bootstrapBinding.helperParentProcessIncarnation,
  recipeLocator: attempt.bootstrapBinding.recipeLocator
});

const queryForAttempt = (attempt: BootstrapAttemptJournalRecord): ReceiverAttemptProjectionQuery => ({
  format: 'bootstrap-receiver-attempt-query/v1',
  receiverId: attempt.bootstrapBinding.receiverId,
  receiverEntryIdentity: attempt.bootstrapBinding.receiverEntryIdentity
});

const verifyObservedFacts = (
  attempt: BootstrapAttemptJournalRecord,
  processObservation: BoundedObservation,
  receiverObservation: BoundedObservation,
  incarnationObservation: BoundedObservation
): SecretLeaseResult<VerifiedBootstrapReceiverAttempt> => {
  if (processObservation.status !== 'received') return denied('broker-process-unavailable');
  if (receiverObservation.status !== 'received') return denied('receiver-observation-unavailable');
  if (incarnationObservation.status !== 'received') return denied('incarnation-observation-unavailable');
  const currentProcess = decodeCurrentProcess(processObservation.value);
  const receiver = decodeReceiverProjection(receiverObservation.value);
  const incarnation = decodeProcessIncarnation(incarnationObservation.value);
  const parentProcessId = attempt.bootstrapBinding.helperParentProcessId;
  if (currentProcess === null) return denied('broker-process-invalid');
  if (currentProcess.parentProcessId !== parentProcessId) return denied('broker-parent-mismatch');
  if (receiver === null) return denied('receiver-fact-invalid');
  if (!receiverFactMatchesAttempt(attempt, receiver.fact)) return denied('receiver-fact-mismatch');
  if (incarnation === null) return denied('incarnation-fact-invalid');
  return incarnation.processId === parentProcessId &&
    incarnation.incarnation.value === attempt.bootstrapBinding.helperParentProcessIncarnation.value
    ? secretLeaseOk(verifiedAttempt(attempt))
    : denied('incarnation-mismatch');
};

export const verifyCurrentReceiverAttempt = (
  attempt: BootstrapAttemptJournalRecord,
  ports: BootstrapReceiverAttemptVerifierPorts,
  timeoutMs: number
): Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>> => {
  if (!validTimeout(timeoutMs) || !durableAttemptIsEligible(attempt)) {
    return Promise.resolve(verificationDenied('durable-attempt-invalid'));
  }
  const processRead = boundedObservation(() => ports.brokerProcess.readCurrentProcess(), timeoutMs);
  return processRead.then(processObservation => {
    if (processObservation.status !== 'received') return verificationDenied('broker-process-unavailable');
    const processFact = decodeCurrentProcess(processObservation.value);
    if (processFact === null) return verificationDenied('broker-process-invalid');
    if (processFact.parentProcessId !== attempt.bootstrapBinding.helperParentProcessId) {
      return verificationDenied('broker-parent-mismatch');
    }
    const receiverRead = boundedObservation(
      () => ports.receiverAttempts.readStrictProjection(queryForAttempt(attempt)),
      timeoutMs
    );
    const incarnationRead = boundedObservation(
      () => ports.processIncarnations.readCurrentIncarnation({
        processId: attempt.bootstrapBinding.helperParentProcessId
      }),
      timeoutMs
    );
    return Promise.all([receiverRead, incarnationRead]).then(
      (observations: readonly [BoundedObservation, BoundedObservation]) => verifyObservedFacts(
        attempt,
        processObservation,
        observations[0],
        observations[1]
      ),
      () => verificationDenied('receiver-observation-unavailable')
    );
  }, () => verificationDenied('broker-process-unavailable')).then(
    result => result,
    () => verificationDenied('broker-process-unavailable')
  );
};

export const createCurrentReceiverAttemptVerifier = (
  ports: BootstrapReceiverAttemptVerifierPorts,
  timeoutMs: number = 2_000
) => ({
  verifyCurrentAttempt: (attempt: BootstrapAttemptJournalRecord) => verifyCurrentReceiverAttempt(
    attempt,
    ports,
    timeoutMs
  )
}) satisfies CurrentReceiverAttemptVerificationPort;

export const createCurrentBrokerProcessPort = (): CurrentBrokerProcessPort => ({
  readCurrentProcess: () => Promise.resolve({
    status: 'resolved',
    processId: process.pid,
    parentProcessId: process.ppid
  } satisfies CurrentBrokerProcessObservation)
});
