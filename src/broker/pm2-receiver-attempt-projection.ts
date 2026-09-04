import { parseReceiverCorrelation } from './journal.ts';
import {
  type Pm2ApplicationRpcClientPort,
  type Pm2ApplicationRpcReply,
  type Pm2ApplicationRpcResult
} from './pm2-application-rpc.ts';
import type { Pm2ProjectedProcess } from './pm2-monitor-projection.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision
} from './primitives.ts';
import type {
  ReceiverAttemptProjectionObservation,
  ReceiverAttemptProjectionQuery,
  StrictReceiverAttemptFact,
  StrictReceiverAttemptProjectionPort
} from './receiver-attempt-verifier.ts';

export type Pm2ReceiverAttemptProjectionConfig = Readonly<{
  endpoint: string;
  timeoutMs: number;
}>;

const unavailable = (): ReceiverAttemptProjectionObservation => ({ status: 'unavailable' });
const ambiguous = (): ReceiverAttemptProjectionObservation => ({ status: 'ambiguous' });

const exactProcessName = (query: ReceiverAttemptProjectionQuery): string | undefined => {
  if (query.receiverId !== 'pm2') return undefined;
  const prefix = 'pm2-entry:';
  const identity = query.receiverEntryIdentity.value;
  if (!identity.startsWith(prefix)) return undefined;
  const name = identity.slice(prefix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(name) ? name : undefined;
};

const lifecycleFrom = (process: Pm2ProjectedProcess): StrictReceiverAttemptFact['lifecycleState'] | undefined => {
  switch (process.status) {
    case 'launching':
    case 'online':
    case 'stopping':
    case 'stopped':
    case 'errored': return process.status;
    case 'unknown': return undefined;
  }
};

const strictFact = (
  query: ReceiverAttemptProjectionQuery,
  process: Pm2ProjectedProcess
): StrictReceiverAttemptFact | undefined => {
  const ownership = process.ownership;
  if (ownership.kind !== 'owned' || ownership.receiverAuthority.kind !== 'owned' || process.pid === null ||
      process.pid <= 0 || process.autorestart || !process.treeKill) return undefined;
  const authority = ownership.receiverAuthority;
  const processAttemptId = parseProcessAttemptId(ownership.attemptId);
  const repository = parseCanonicalRepository(authority.repository);
  const recipeRevision = parseRecipeRevision(authority.recipeRevision);
  const grantId = parseGrantId(authority.grantId);
  const receiverCorrelation = parseReceiverCorrelation(authority.receiverCorrelation);
  const lifecycleState = lifecycleFrom(process);
  return authority.receiverId === query.receiverId &&
    authority.receiverEntryIdentity === query.receiverEntryIdentity.value && processAttemptId.isOk() &&
    repository.isOk() && recipeRevision.isOk() && grantId.isOk() && receiverCorrelation.type === 'ok' &&
    lifecycleState !== undefined
    ? {
        format: 'bootstrap-receiver-attempt-projection/v1',
        receiverId: query.receiverId,
        receiverEntryIdentity: query.receiverEntryIdentity,
        receiverCorrelation: receiverCorrelation.value,
        processId: process.pid,
        lifecycleState,
        ownership: {
          processAttemptId: processAttemptId.value,
          repository: repository.value,
          recipeRevision: recipeRevision.value,
          grantId: grantId.value,
          grantGeneration: authority.grantGeneration,
          bindingGeneration: authority.bindingGeneration
        }
      }
    : undefined;
};

const observationFromReply = (
  query: ReceiverAttemptProjectionQuery,
  expectedName: string,
  result: Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>
): ReceiverAttemptProjectionObservation => {
  if (result.outcome === 'failure' || result.value.method !== 'getMonitorData') return unavailable();
  const candidates: readonly Pm2ProjectedProcess[] = result.value.processes
    .filter(process => process.name === expectedName);
  if (candidates.length === 0) return { status: 'missing' };
  if (candidates.length !== 1) return ambiguous();
  const candidate = candidates[0];
  if (candidate === undefined) return ambiguous();
  const fact = strictFact(query, candidate);
  return fact === undefined ? ambiguous() : { status: 'resolved', fact };
};

export const createPm2ReceiverAttemptProjectionPort = (
  config: Pm2ReceiverAttemptProjectionConfig,
  client: Pm2ApplicationRpcClientPort
): StrictReceiverAttemptProjectionPort => ({
  readStrictProjection: query => {
    const expectedName = exactProcessName(query);
    return expectedName === undefined
      ? Promise.resolve(ambiguous())
      : Promise.resolve().then(() => client.execute({
          endpoint: config.endpoint,
          timeoutMs: config.timeoutMs,
          operation: { method: 'getMonitorData', allowedNames: [expectedName] }
        })).then(
          result => observationFromReply(query, expectedName, result),
          unavailable
        );
  }
});
