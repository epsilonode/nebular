import type { TeleportInventoryEntry } from './cartridge';
import { teleportCodecFromRegistry, type TeleportCodecRegistry } from './codec';
import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import type { TeleportRestorePlan, TeleportRestoreStep } from './types';

type CapabilitySteps = Readonly<{
  instanceId: string;
  stepIds: readonly string[];
}>;

type PlanningState = Readonly<{
  steps: readonly TeleportRestoreStep[];
  capabilitySteps: readonly CapabilitySteps[];
  unresolvedOptionalInstances: readonly string[];
}>;

type DependencyReference = Readonly<{
  stepId: string;
  dependencyId: string;
}>;

type PendingStep = Readonly<{
  step: TeleportRestoreStep;
  dependencies: readonly string[];
}>;

const EMPTY_PLANNING_STATE: PlanningState = {
  steps: [],
  capabilitySteps: [],
  unresolvedOptionalInstances: []
};

const mutatesResource = (step: TeleportRestoreStep): boolean => step.effect !== 'unresolved-retain';

const stepById = (
  steps: readonly TeleportRestoreStep[],
  id: string
): TeleportRestoreStep | undefined => steps.find(step => step.id === id);

const hasDependencyPath = (
  from: string,
  to: string,
  steps: readonly TeleportRestoreStep[],
  seen: readonly string[] = []
): boolean => {
  if (from === to) return true;
  if (seen.includes(from)) return false;
  const nextSeen: readonly string[] = [...seen, from];
  return stepById(steps, from)?.dependsOn.some(dependency =>
    hasDependencyPath(dependency, to, steps, nextSeen)
  ) === true;
};

const requiredBlockerIssues = (
  inventory: readonly TeleportInventoryEntry[]
): readonly TeleportIssue[] => inventory.flatMap(entry => {
  if (entry.status === 'unsupported-required') return [entry.issue];
  if (entry.status === 'invalid' && entry.capability.descriptor.required) return entry.issues;
  return [];
});

const retainOpaqueCapability = (
  state: PlanningState,
  entry: TeleportInventoryEntry
): PlanningState => {
  const { instanceId } = entry.capability.descriptor;
  const step: TeleportRestoreStep = {
    id: `retain:${instanceId}`,
    capabilityInstanceId: instanceId,
    effect: 'unresolved-retain',
    dependsOn: [],
    resources: [],
    requiresConfirmation: false,
    reversible: true,
    verification: 'opaque capability bytes retained for relay and re-export',
    rollback: 'retain the original opaque capability bytes'
  };
  return {
    steps: [...state.steps, step],
    capabilitySteps: [...state.capabilitySteps, { instanceId, stepIds: [step.id] }],
    unresolvedOptionalInstances: [...state.unresolvedOptionalInstances, instanceId]
  };
};

const projectSupportedCapability = (
  state: PlanningState,
  entry: Extract<TeleportInventoryEntry, { status: 'supported' }>,
  registry: TeleportCodecRegistry
): TeleportResult<PlanningState> => {
  const { descriptor } = entry.capability;
  const codec = teleportCodecFromRegistry(registry, descriptor.capabilityId);
  if (!codec) {
    return err({
      code: 'unsupported-capability',
      message: `Codec ${descriptor.capabilityId} disappeared during restore planning.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
  }
  const contentBytes = entry.capability.contentBytes;
  if (!contentBytes) {
    return err({
      code: 'decode-failed',
      message: `Decoded capability ${descriptor.capabilityId} no longer has content bytes.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
  }
  const projected = codec.restorePlan(descriptor.schemaVersion, contentBytes, {
    instanceId: descriptor.instanceId,
    restoreMode: descriptor.restoreMode
  });
  if (!projected.ok) return projected;
  const stepIds: readonly string[] = projected.value.map(step => step.id);
  return ok({
    steps: [...state.steps, ...projected.value],
    capabilitySteps: [...state.capabilitySteps, { instanceId: descriptor.instanceId, stepIds }],
    unresolvedOptionalInstances: state.unresolvedOptionalInstances
  });
};

const projectInventoryEntry = (
  state: PlanningState,
  entry: TeleportInventoryEntry,
  registry: TeleportCodecRegistry
): TeleportResult<PlanningState> => {
  if (
    entry.status === 'unsupported-optional'
    || (entry.status === 'invalid' && !entry.capability.descriptor.required)
  ) {
    return ok(retainOpaqueCapability(state, entry));
  }
  if (entry.status === 'supported') return projectSupportedCapability(state, entry, registry);
  return ok(state);
};

const projectInventory = (
  inventory: readonly TeleportInventoryEntry[],
  registry: TeleportCodecRegistry,
  index = 0,
  state: PlanningState = EMPTY_PLANNING_STATE
): TeleportResult<PlanningState> => {
  const entry = inventory[index];
  if (!entry) return ok(state);
  const projected = projectInventoryEntry(state, entry, registry);
  return projected.ok
    ? projectInventory(inventory, registry, index + 1, projected.value)
    : projected;
};

const uniqueSorted = (values: readonly string[]): readonly string[] => values
  .filter((value, index) => values.indexOf(value) === index)
  .toSorted();

const augmentDependencies = (
  steps: readonly TeleportRestoreStep[],
  inventory: readonly TeleportInventoryEntry[],
  capabilitySteps: readonly CapabilitySteps[]
): readonly TeleportRestoreStep[] => steps.map((step): TeleportRestoreStep => {
  const entry = inventory.find(candidate =>
    candidate.capability.descriptor.instanceId === step.capabilityInstanceId
  );
  const dependencyInstances: readonly string[] = entry?.capability.descriptor.dependencies
    .filter(dependency => dependency.kind === 'restore-order' || dependency.kind === 'hard-decode')
    .flatMap((dependency): readonly string[] => dependency.instanceId ? [dependency.instanceId] : []) ?? [];
  const crossDependencies: readonly string[] = dependencyInstances.flatMap(instanceId =>
    capabilitySteps.find(candidate => candidate.instanceId === instanceId)?.stepIds ?? []
  );
  return {
    ...step,
    dependsOn: uniqueSorted([...step.dependsOn, ...crossDependencies])
  };
});

const missingDependency = (
  steps: readonly TeleportRestoreStep[]
): DependencyReference | undefined => steps
  .flatMap((step): readonly DependencyReference[] => step.dependsOn.map(dependencyId => ({
    stepId: step.id,
    dependencyId
  })))
  .find(reference => stepById(steps, reference.dependencyId) === undefined);

const resourcesConflict = (left: TeleportRestoreStep, right: TeleportRestoreStep): boolean =>
  left.resources.some(resource => right.resources.includes(resource));

const findUnorderedResourceConflict = (
  steps: readonly TeleportRestoreStep[],
  leftIndex = 0
): readonly [TeleportRestoreStep, TeleportRestoreStep] | undefined => {
  const left = steps[leftIndex];
  if (!left) return undefined;
  const right = mutatesResource(left)
    ? steps.find((candidate, candidateIndex) =>
      candidateIndex > leftIndex
      && mutatesResource(candidate)
      && resourcesConflict(left, candidate)
      && !hasDependencyPath(left.id, candidate.id, steps)
      && !hasDependencyPath(candidate.id, left.id, steps)
    )
    : undefined;
  return right ? [left, right] : findUnorderedResourceConflict(steps, leftIndex + 1);
};

const compareStepIds = (left: TeleportRestoreStep, right: TeleportRestoreStep): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

const orderSteps = (
  pending: readonly PendingStep[],
  ordered: readonly TeleportRestoreStep[] = []
): TeleportResult<readonly TeleportRestoreStep[]> => {
  if (pending.length === 0) return ok(ordered);
  const ready: readonly TeleportRestoreStep[] = pending
    .filter(candidate => candidate.dependencies.length === 0)
    .map(candidate => candidate.step)
    .toSorted(compareStepIds);
  if (ready.length === 0) {
    return err({ code: 'dependency-invalid', message: 'Restore plan contains a dependency cycle.' });
  }
  const remaining: readonly PendingStep[] = pending
    .filter(candidate => !ready.some(step => step.id === candidate.step.id))
    .map((candidate): PendingStep => ({
      step: candidate.step,
      dependencies: candidate.dependencies.filter(dependency =>
        !ready.some(step => step.id === dependency)
      )
    }));
  return orderSteps(remaining, [...ordered, ...ready]);
};

export const composeTeleportRestorePlan = (
  inventory: readonly TeleportInventoryEntry[],
  registry: TeleportCodecRegistry
): TeleportResult<TeleportRestorePlan> => {
  const blockerIssues: readonly TeleportIssue[] = requiredBlockerIssues(inventory);
  if (blockerIssues.length > 0) return err(...blockerIssues);

  const projected = projectInventory(inventory, registry);
  if (!projected.ok) return projected;

  const invalidStep = projected.value.steps.find((step, index) =>
    step.id.length === 0
    || projected.value.steps.findIndex(candidate => candidate.id === step.id) !== index
  );
  if (invalidStep) {
    return err({
      code: 'dependency-invalid',
      message: `Restore step id ${invalidStep.id || '<empty>'} is invalid or duplicated.`
    });
  }

  const augmented: readonly TeleportRestoreStep[] = augmentDependencies(
    projected.value.steps,
    inventory,
    projected.value.capabilitySteps
  );
  const missing = missingDependency(augmented);
  if (missing) {
    return err({
      code: 'dependency-invalid',
      message: `Restore step ${missing.stepId} depends on missing step ${missing.dependencyId}.`
    });
  }

  const conflict = findUnorderedResourceConflict(augmented);
  if (conflict) {
    return err({
      code: 'dependency-invalid',
      message: `Restore steps ${conflict[0].id} and ${conflict[1].id} have an unordered resource conflict.`
    });
  }

  const ordered = orderSteps(augmented.map((step): PendingStep => ({
    step,
    dependencies: step.dependsOn
  })));
  if (!ordered.ok) return ordered;

  return ok({
    steps: ordered.value,
    confirmations: ordered.value.filter(step => step.requiresConfirmation).map(step => step.id),
    unresolvedOptionalInstances: projected.value.unresolvedOptionalInstances.toSorted()
  });
};
