import type { TeleportDecodeBudget } from './types';
import { err, ok, type TeleportResult } from './result';
import { CID } from 'multiformats/cid';

const encoder = new TextEncoder();

export const validateProtocolValue = (
  value: unknown,
  budget: TeleportDecodeBudget
): TeleportResult<void> => {
  let nodes = 0;
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number, path: readonly (string | number)[]): TeleportResult<void> => {
    nodes += 1;
    if (nodes > budget.maxNodes) {
      return err({ code: 'budget-exceeded', message: 'Capability exceeds the node budget.', path });
    }
    if (depth > budget.maxDepth) {
      return err({ code: 'budget-exceeded', message: 'Capability exceeds the nesting budget.', path });
    }
    if (current === null || typeof current === 'boolean') return ok(undefined);
    if (typeof current === 'string') {
      return encoder.encode(current).byteLength <= budget.maxStringBytes
        ? ok(undefined)
        : err({ code: 'budget-exceeded', message: 'Capability string exceeds the byte budget.', path });
    }
    if (typeof current === 'number') {
      return Number.isFinite(current)
        ? ok(undefined)
        : err({ code: 'capability-invalid', message: 'Capability numbers must be finite.', path });
    }
    if (typeof current === 'bigint' || Object.prototype.toString.call(current) === '[object Uint8Array]' || CID.asCID(current)) return ok(undefined);
    if (typeof current !== 'object' || current === undefined) {
      return err({ code: 'capability-invalid', message: 'Capability contains a non-protocol value.', path });
    }
    if (seen.has(current)) {
      return err({ code: 'capability-invalid', message: 'Capability values cannot contain cycles or aliases.', path });
    }
    seen.add(current);
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) {
      return err({ code: 'capability-invalid', message: 'Capability contains a non-plain runtime object that must be projected by its codec.', path });
    }
    const entries: readonly [string | number, unknown][] = Array.isArray(current)
      ? current.map((entry, index) => [index, entry] as const)
      : Object.entries(current as Record<string, unknown>);
    if (entries.length > budget.maxCollectionEntries) {
      return err({ code: 'budget-exceeded', message: 'Capability collection exceeds the entry budget.', path });
    }
    for (const [key, entry] of entries) {
      const result = visit(entry, depth + 1, [...path, key]);
      if (!result.ok) return result;
    }
    return ok(undefined);
  };

  return visit(value, 0, []);
};
