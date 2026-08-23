import type { TeleportInventoryEntry } from './cartridge';
import type { TeleportCodecRegistry } from './codec';
import { err, ok, type TeleportResult } from './result';
import type { TeleportRestorePlan, TeleportRestoreStep } from './types';

const mutatesResource = (step: TeleportRestoreStep): boolean => step.effect !== 'unresolved-retain';

const hasDependencyPath = (
  from: string,
  to: string,
  byId: ReadonlyMap<string, TeleportRestoreStep>,
  seen = new Set<string>()
): boolean => {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return byId.get(from)?.dependsOn.some(dependency => hasDependencyPath(dependency, to, byId, seen)) === true;
};

export const composeTeleportRestorePlan = (
  inventory: readonly TeleportInventoryEntry[],
  registry: TeleportCodecRegistry
): TeleportResult<TeleportRestorePlan> => {
  const requiredBlockers = inventory.filter((entry): entry is Extract<TeleportInventoryEntry, { status: 'unsupported-required' | 'invalid' }> =>
    entry.status === 'unsupported-required' || (entry.status === 'invalid' && entry.capability.descriptor.required)
  );
  if (requiredBlockers.length) {
    return err(...requiredBlockers.flatMap(entry => entry.status === 'invalid' ? entry.issues : [entry.issue]));
  }

  const steps: TeleportRestoreStep[] = [];
  const capabilitySteps = new Map<string, string[]>();
  const unresolvedOptionalInstances: string[] = [];

  for (const entry of inventory) {
    const { descriptor } = entry.capability;
    if (entry.status === 'unsupported-optional' || (entry.status === 'invalid' && !descriptor.required)) {
      unresolvedOptionalInstances.push(descriptor.instanceId);
      const id = `retain:${descriptor.instanceId}`;
      steps.push({
        id,
        capabilityInstanceId: descriptor.instanceId,
        effect: 'unresolved-retain',
        dependsOn: [],
        resources: [],
        requiresConfirmation: false,
        reversible: true,
        verification: 'opaque capability bytes retained for relay and re-export',
        rollback: 'retain the original opaque capability bytes'
      });
      capabilitySteps.set(descriptor.instanceId, [id]);
      continue;
    }
    if (entry.status !== 'supported') continue;
    const codec = registry.codec(descriptor.capabilityId);
    if (!codec) {
      return err({ code: 'unsupported-capability', message: `Codec ${descriptor.capabilityId} disappeared during restore planning.`, capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
    }
    const projected = codec.restorePlan?.(entry.value, {
      instanceId: descriptor.instanceId,
      restoreMode: descriptor.restoreMode
    }) ?? ok([]);
    if (!projected.ok) return projected;
    const ids = projected.value.map(step => step.id);
    capabilitySteps.set(descriptor.instanceId, ids);
    steps.push(...projected.value);
  }

  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id || ids.has(step.id)) {
      return err({ code: 'dependency-invalid', message: `Restore step id ${step.id || '<empty>'} is invalid or duplicated.` });
    }
    ids.add(step.id);
  }

  const augmented = steps.map(step => {
    const entry = inventory.find(candidate => candidate.capability.descriptor.instanceId === step.capabilityInstanceId);
    const crossDependencies = entry?.capability.descriptor.dependencies
      .filter(dependency => dependency.kind === 'restore-order' || dependency.kind === 'hard-decode')
      .flatMap(dependency => dependency.instanceId ? capabilitySteps.get(dependency.instanceId) ?? [] : []) ?? [];
    return { ...step, dependsOn: [...new Set([...step.dependsOn, ...crossDependencies])].toSorted() };
  });
  const byId = new Map(augmented.map(step => [step.id, step] as const));
  for (const step of augmented) {
    for (const dependency of step.dependsOn) {
      if (!byId.has(dependency)) {
        return err({ code: 'dependency-invalid', message: `Restore step ${step.id} depends on missing step ${dependency}.` });
      }
    }
  }

  for (let leftIndex = 0; leftIndex < augmented.length; leftIndex += 1) {
    const left = augmented[leftIndex];
    if (!left || !mutatesResource(left)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < augmented.length; rightIndex += 1) {
      const right = augmented[rightIndex];
      if (!right || !mutatesResource(right)) continue;
      const conflict = left.resources.some(resource => right.resources.includes(resource));
      if (conflict && !hasDependencyPath(left.id, right.id, byId) && !hasDependencyPath(right.id, left.id, byId)) {
        return err({ code: 'dependency-invalid', message: `Restore steps ${left.id} and ${right.id} have an unordered resource conflict.` });
      }
    }
  }

  const incoming = new Map(augmented.map(step => [step.id, new Set(step.dependsOn)] as const));
  const ordered: TeleportRestoreStep[] = [];
  while (incoming.size) {
    const ready = [...incoming.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([id]) => id)
      .toSorted();
    if (!ready.length) return err({ code: 'dependency-invalid', message: 'Restore plan contains a dependency cycle.' });
    for (const id of ready) {
      const step = byId.get(id);
      if (step) ordered.push(step);
      incoming.delete(id);
      for (const dependencies of incoming.values()) dependencies.delete(id);
    }
  }

  return ok({
    steps: ordered,
    confirmations: ordered.filter(step => step.requiresConfirmation).map(step => step.id),
    unresolvedOptionalInstances: unresolvedOptionalInstances.toSorted()
  });
};
