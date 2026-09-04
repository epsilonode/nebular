import type { ProcessAttemptId } from './primitives.ts';

export type OneShotSlotId = Readonly<{ kind: 'one-shot-slot-id'; value: string }>;
export type OneShotProcessName = Readonly<{ kind: 'one-shot-process-name'; value: string }>;

export type OneShotResult<Value, Issue> =
  | Readonly<{ outcome: 'success'; value: Value }>
  | Readonly<{ outcome: 'failure'; issue: Issue }>;

export type OneShotSlotDefinition = Readonly<{
  slotId: OneShotSlotId;
  processName: OneShotProcessName;
}>;

export type OneShotSlotPool = Readonly<{
  namespace: string;
  slots: readonly OneShotSlotDefinition[];
}>;

export type OneShotObservedStatus = 'online' | 'launching' | 'stopping' | 'stopped' | 'errored' | 'unknown';
export type OneShotCleanupProof = 'confirmed' | 'unconfirmed';

/** Safe, non-secret ownership facts persisted in PM2's environment. */
export type OneShotOwnershipMetadata = Readonly<{
  slotId: OneShotSlotId;
  attemptId: ProcessAttemptId;
  metadataDigest: string;
  startedAtMs: number;
  deadlineAtMs: number;
}>;

export type OneShotAttemptHandle = Readonly<{
  slotId: OneShotSlotId;
  processName: OneShotProcessName;
  attemptId: ProcessAttemptId;
  metadataDigest: string;
  pmId: number;
}>;

export type OneShotSlotOccupant =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{
      kind: 'foreign';
      reason: 'missing-ownership-metadata' | 'invalid-ownership-metadata' | 'configuration-drift';
    }>
  | Readonly<{
      kind: 'owned';
      pmId: number;
      pid: number | null;
      status: OneShotObservedStatus;
      /** Present only for a terminal observation of this exact PM2 incarnation. */
      exitCode?: number;
      metadata: OneShotOwnershipMetadata;
      cleanupProof: OneShotCleanupProof;
    }>;

export type OneShotSlotObservation = OneShotSlotDefinition & Readonly<{ occupant: OneShotSlotOccupant }>;

export type OneShotSlotConfigurationIssue =
  | Readonly<{ code: 'slot-namespace-invalid'; namespace: string }>
  | Readonly<{ code: 'slot-capacity-invalid'; capacity: number }>;

export type OneShotSlotInventoryIssue =
  | Readonly<{ code: 'slot-inventory-missing'; slotId: OneShotSlotId }>
  | Readonly<{ code: 'slot-inventory-duplicate'; slotId: OneShotSlotId }>
  | Readonly<{ code: 'slot-inventory-unexpected'; slotId: OneShotSlotId }>
  | Readonly<{
      code: 'slot-identity-mismatch';
      slotId: OneShotSlotId;
      expectedName: OneShotProcessName;
      observedName: OneShotProcessName;
    }>
  | Readonly<{
      code: 'slot-metadata-mismatch';
      slotId: OneShotSlotId;
      metadataSlotId: OneShotSlotId;
    }>
  | Readonly<{ code: 'attempt-observed-more-than-once'; attemptId: ProcessAttemptId }>;

export type OneShotSlotSummary = OneShotSlotDefinition & Readonly<{
  state:
    | 'empty'
    | 'active'
    | 'expired-unreconciled'
    | 'terminal-reclaimable'
    | 'terminal-cleanup-unconfirmed'
    | 'indeterminate'
    | 'namespace-conflict';
  attemptId?: ProcessAttemptId;
  deadlineAtMs?: number;
}>;

export type OneShotAllocationIssue =
  | OneShotSlotInventoryIssue
  | Readonly<{
      code: 'slot-namespace-conflict';
      slotId: OneShotSlotId;
      processName: OneShotProcessName;
      reason: Extract<OneShotSlotOccupant, { kind: 'foreign' }>['reason'];
    }>
  | Readonly<{ code: 'attempt-metadata-conflict'; attemptId: ProcessAttemptId }>
  | Readonly<{ code: 'attempt-retired'; attemptId: ProcessAttemptId }>
  | Readonly<{ code: 'slot-capacity-busy'; slots: readonly OneShotSlotSummary[] }>;

export type OneShotAllocationPlan =
  | Readonly<{ kind: 'confirm-existing'; handle: OneShotAttemptHandle; startedAtMs: number }>
  | Readonly<{ kind: 'claim-empty'; slot: OneShotSlotDefinition }>
  | Readonly<{ kind: 'replace-terminal'; slot: OneShotSlotDefinition; retired: OneShotAttemptHandle }>;

export type OneShotSlotSelectionPlan = OneShotAllocationPlan;

export type OneShotAttemptIssue =
  | OneShotSlotInventoryIssue
  | Readonly<{
      code: 'slot-namespace-conflict';
      slotId: OneShotSlotId;
      processName: OneShotProcessName;
      reason: Extract<OneShotSlotOccupant, { kind: 'foreign' }>['reason'];
    }>
  | Readonly<{ code: 'attempt-retired'; handle: OneShotAttemptHandle }>;

export type OneShotReconciliationAction = Readonly<{
  kind: 'request-expired-stop';
  handle: OneShotAttemptHandle;
  deadlineAtMs: number;
}>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({ outcome: 'success', value });
const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const slotId = (value: string): OneShotSlotId => ({ kind: 'one-shot-slot-id', value });
const processName = (value: string): OneShotProcessName => ({ kind: 'one-shot-process-name', value });
export const sameOneShotSlotId = (left: OneShotSlotId, right: OneShotSlotId): boolean => left.value === right.value;
export const sameOneShotProcessName = (left: OneShotProcessName, right: OneShotProcessName): boolean =>
  left.value === right.value;

export const createOneShotSlotPool = (
  namespace: string,
  capacity: number
): OneShotResult<OneShotSlotPool, OneShotSlotConfigurationIssue> => {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(namespace)) {
    return failure({ code: 'slot-namespace-invalid', namespace });
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return failure({ code: 'slot-capacity-invalid', capacity });
  }
  const width = Math.max(2, String(capacity - 1).length);
  return success({
    namespace,
    slots: Array.from({ length: capacity }, (_, index) => {
      const suffix = String(index).padStart(width, '0');
      return {
        slotId: slotId(`${namespace}:${suffix}`),
        processName: processName(`${namespace}-${suffix}`)
      };
    })
  });
};

const occurrences = (observations: readonly OneShotSlotObservation[], id: OneShotSlotId): number =>
  observations.filter(observation => sameOneShotSlotId(observation.slotId, id)).length;

export const validateOneShotSlotInventory = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[]
): OneShotResult<readonly OneShotSlotObservation[], OneShotSlotInventoryIssue> => {
  const expectedIds: readonly OneShotSlotId[] = pool.slots.map(slot => slot.slotId);
  const unexpected = observations.find(observation =>
    !expectedIds.some(expected => sameOneShotSlotId(expected, observation.slotId)));
  if (unexpected !== undefined) return failure({ code: 'slot-inventory-unexpected', slotId: unexpected.slotId });
  const duplicate = pool.slots.find(slot => occurrences(observations, slot.slotId) > 1);
  if (duplicate !== undefined) return failure({ code: 'slot-inventory-duplicate', slotId: duplicate.slotId });
  const missing = pool.slots.find(slot => occurrences(observations, slot.slotId) === 0);
  if (missing !== undefined) return failure({ code: 'slot-inventory-missing', slotId: missing.slotId });
  const identityMismatch: Readonly<{
    slot: OneShotSlotDefinition;
    observation: OneShotSlotObservation | undefined;
  }> | undefined = pool.slots
    .map(slot => ({
      slot,
      observation: observations.find(candidate => sameOneShotSlotId(candidate.slotId, slot.slotId))
    }))
    .find(pair => pair.observation !== undefined &&
      !sameOneShotProcessName(pair.observation.processName, pair.slot.processName));
  if (identityMismatch?.observation !== undefined) {
    return failure({
      code: 'slot-identity-mismatch',
      slotId: identityMismatch.slot.slotId,
      expectedName: identityMismatch.slot.processName,
      observedName: identityMismatch.observation.processName
    });
  }
  const metadataMismatch = observations.find(observation => observation.occupant.kind === 'owned' &&
    !sameOneShotSlotId(observation.occupant.metadata.slotId, observation.slotId));
  if (metadataMismatch?.occupant.kind === 'owned') {
    return failure({
      code: 'slot-metadata-mismatch',
      slotId: metadataMismatch.slotId,
      metadataSlotId: metadataMismatch.occupant.metadata.slotId
    });
  }
  const owned: readonly Extract<OneShotSlotOccupant, { kind: 'owned' }>[] = observations
    .flatMap((observation): readonly Extract<OneShotSlotOccupant, { kind: 'owned' }>[] =>
      observation.occupant.kind === 'owned' ? [observation.occupant] : []);
  const repeated = owned.find((occupant, index) => owned
    .findIndex(candidate => candidate.metadata.attemptId === occupant.metadata.attemptId) !== index);
  return repeated === undefined
    ? success(observations)
    : failure({ code: 'attempt-observed-more-than-once', attemptId: repeated.metadata.attemptId });
};

export const oneShotAttemptHandle = (observation: OneShotSlotObservation): OneShotAttemptHandle | undefined =>
  observation.occupant.kind === 'owned'
    ? {
        slotId: observation.slotId,
        processName: observation.processName,
        attemptId: observation.occupant.metadata.attemptId,
        metadataDigest: observation.occupant.metadata.metadataDigest,
        pmId: observation.occupant.pmId
      }
    : undefined;

const isActive = (status: OneShotObservedStatus): boolean =>
  status === 'online' || status === 'launching' || status === 'stopping';

const isTerminal = (status: OneShotObservedStatus): boolean => status === 'stopped' || status === 'errored';

export const summarizeOneShotSlot = (
  observation: OneShotSlotObservation,
  nowMs: number
): OneShotSlotSummary => {
  const base = { slotId: observation.slotId, processName: observation.processName };
  if (observation.occupant.kind === 'empty') return { ...base, state: 'empty' };
  if (observation.occupant.kind === 'foreign') return { ...base, state: 'namespace-conflict' };
  const { metadata, status, cleanupProof } = observation.occupant;
  if (isActive(status)) {
    return {
      ...base,
      state: metadata.deadlineAtMs <= nowMs ? 'expired-unreconciled' : 'active',
      attemptId: metadata.attemptId,
      deadlineAtMs: metadata.deadlineAtMs
    };
  }
  if (!isTerminal(status)) {
    return { ...base, state: 'indeterminate', attemptId: metadata.attemptId, deadlineAtMs: metadata.deadlineAtMs };
  }
  return {
    ...base,
    state: cleanupProof === 'confirmed' ? 'terminal-reclaimable' : 'terminal-cleanup-unconfirmed',
    attemptId: metadata.attemptId,
    deadlineAtMs: metadata.deadlineAtMs
  };
};

const namespaceConflict = (
  observation: OneShotSlotObservation
): Extract<OneShotAllocationIssue, { code: 'slot-namespace-conflict' }> | undefined =>
  observation.occupant.kind === 'foreign'
    ? {
        code: 'slot-namespace-conflict',
        slotId: observation.slotId,
        processName: observation.processName,
        reason: observation.occupant.reason
      }
    : undefined;

const planOneShotSlotAllocationFor = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  requested: Readonly<{ attemptId: ProcessAttemptId; metadataDigest?: string }>,
  nowMs: number
): OneShotResult<OneShotAllocationPlan, OneShotAllocationIssue> => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return inventory;
  const conflict = inventory.value.map(namespaceConflict).find(issue => issue !== undefined);
  if (conflict !== undefined) return failure(conflict);
  const sameAttempt = inventory.value.find(observation => observation.occupant.kind === 'owned' &&
    observation.occupant.metadata.attemptId === requested.attemptId);
  if (sameAttempt?.occupant.kind === 'owned') {
    if (requested.metadataDigest !== undefined &&
        sameAttempt.occupant.metadata.metadataDigest !== requested.metadataDigest) {
      return failure({ code: 'attempt-metadata-conflict', attemptId: requested.attemptId });
    }
    const handle = oneShotAttemptHandle(sameAttempt);
    if (handle !== undefined && (sameAttempt.occupant.status === 'online' || sameAttempt.occupant.status === 'launching')) {
      return success({ kind: 'confirm-existing', handle, startedAtMs: sameAttempt.occupant.metadata.startedAtMs });
    }
    return failure({ code: 'attempt-retired', attemptId: requested.attemptId });
  }
  const empty = inventory.value.find(observation => observation.occupant.kind === 'empty');
  if (empty !== undefined) {
    return success({ kind: 'claim-empty', slot: { slotId: empty.slotId, processName: empty.processName } });
  }
  const terminal = inventory.value.find(observation => observation.occupant.kind === 'owned' &&
    isTerminal(observation.occupant.status) && observation.occupant.cleanupProof === 'confirmed');
  const retired = terminal === undefined ? undefined : oneShotAttemptHandle(terminal);
  return terminal !== undefined && retired !== undefined
    ? success({
        kind: 'replace-terminal',
        slot: { slotId: terminal.slotId, processName: terminal.processName },
        retired
      })
    : failure({
        code: 'slot-capacity-busy',
        slots: inventory.value.map(observation => summarizeOneShotSlot(observation, nowMs))
      });
};

/**
 * Selects the stable slot for an attempt without requiring slot-dependent
 * launch metadata to exist yet. The caller must finalize that metadata while
 * the same allocation lock is still held, then compare an existing handle's
 * exact digest before treating a retry as idempotent.
 */
export const planOneShotSlotSelection = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  requested: Readonly<{ attemptId: ProcessAttemptId }>,
  nowMs: number
): OneShotResult<OneShotSlotSelectionPlan, OneShotAllocationIssue> =>
  planOneShotSlotAllocationFor(pool, observations, requested, nowMs);

export const planOneShotSlotAllocation = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  requested: Readonly<{ attemptId: ProcessAttemptId; metadataDigest: string }>,
  nowMs: number
): OneShotResult<OneShotAllocationPlan, OneShotAllocationIssue> =>
  planOneShotSlotAllocationFor(pool, observations, requested, nowMs);

export const validateOneShotAttempt = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  handle: OneShotAttemptHandle
): OneShotResult<Extract<OneShotSlotOccupant, { kind: 'owned' }>, OneShotAttemptIssue> => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return inventory;
  const observation = inventory.value.find(candidate => sameOneShotSlotId(candidate.slotId, handle.slotId));
  if (observation?.occupant.kind === 'foreign') {
    return failure({
      code: 'slot-namespace-conflict',
      slotId: observation.slotId,
      processName: observation.processName,
      reason: observation.occupant.reason
    });
  }
  return observation !== undefined && sameOneShotProcessName(observation.processName, handle.processName) &&
    observation.occupant.kind === 'owned' &&
    observation.occupant.pmId === handle.pmId && observation.occupant.metadata.attemptId === handle.attemptId &&
    observation.occupant.metadata.metadataDigest === handle.metadataDigest
    ? success(observation.occupant)
    : failure({ code: 'attempt-retired', handle });
};

export const planOneShotReconciliation = (
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[],
  nowMs: number
): OneShotResult<readonly OneShotReconciliationAction[], OneShotAllocationIssue> => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return inventory;
  const conflict = inventory.value.map(namespaceConflict).find(issue => issue !== undefined);
  if (conflict !== undefined) return failure(conflict);
  return success(inventory.value.flatMap((observation): readonly OneShotReconciliationAction[] => {
    if (observation.occupant.kind !== 'owned' || observation.occupant.status !== 'online' ||
        observation.occupant.metadata.deadlineAtMs > nowMs) return [];
    const handle = oneShotAttemptHandle(observation);
    return handle === undefined
      ? []
      : [{ kind: 'request-expired-stop' as const, handle, deadlineAtMs: observation.occupant.metadata.deadlineAtMs }];
  }));
};
