import type { TeleportDecodeBudget } from './types';
import { err, ok, type TeleportResult } from './result';
import { CID } from 'multiformats/cid';

const encoder = new TextEncoder();

type ProtocolPath = readonly (string | number)[];
type ProtocolEntry = readonly [string | number, unknown];
type ProtocolObjectOccurrence = Readonly<{
  value: object;
  path: ProtocolPath;
}>;
type ProtocolTraversalSummary = Readonly<{
  nodeCount: number;
  occurrences: readonly ProtocolObjectOccurrence[];
}>;

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isPlainRecord = (value: object): value is Readonly<Record<string, unknown>> =>
  Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;

const emptySummary = (): ProtocolTraversalSummary => ({ nodeCount: 0, occurrences: [] });

const mergeSummaries = (
  left: ProtocolTraversalSummary,
  right: ProtocolTraversalSummary
): TeleportResult<ProtocolTraversalSummary> => {
  const leftObjects: ReadonlySet<object> = new Set(left.occurrences.map(occurrence => occurrence.value));
  const duplicate = right.occurrences.find(occurrence => leftObjects.has(occurrence.value));
  return duplicate === undefined
    ? ok({
        nodeCount: left.nodeCount + right.nodeCount,
        occurrences: [...left.occurrences, ...right.occurrences]
      })
    : err({
        code: 'capability-invalid',
        message: 'Capability values cannot contain cycles or aliases.',
        path: duplicate.path
      });
};

export const validateProtocolValue = (
  value: unknown,
  budget: TeleportDecodeBudget
): TeleportResult<void> => {
  const visit = (
    current: unknown,
    depth: number,
    path: ProtocolPath,
    ancestors: readonly object[],
    remainingNodes: number
  ): TeleportResult<ProtocolTraversalSummary> => {
    if (remainingNodes < 1) {
      return err({ code: 'budget-exceeded', message: 'Capability exceeds the node budget.', path });
    }
    if (depth > budget.maxDepth) {
      return err({ code: 'budget-exceeded', message: 'Capability exceeds the nesting budget.', path });
    }
    if (current === null || typeof current === 'boolean') return ok({ nodeCount: 1, occurrences: [] });
    if (typeof current === 'string') {
      return encoder.encode(current).byteLength <= budget.maxStringBytes
        ? ok({ nodeCount: 1, occurrences: [] })
        : err({ code: 'budget-exceeded', message: 'Capability string exceeds the byte budget.', path });
    }
    if (typeof current === 'number') {
      return Number.isFinite(current)
        ? ok({ nodeCount: 1, occurrences: [] })
        : err({ code: 'capability-invalid', message: 'Capability numbers must be finite.', path });
    }
    if (typeof current === 'bigint' || Object.prototype.toString.call(current) === '[object Uint8Array]' || CID.asCID(current)) {
      return ok({ nodeCount: 1, occurrences: [] });
    }
    if (typeof current !== 'object') {
      return err({ code: 'capability-invalid', message: 'Capability contains a non-protocol value.', path });
    }
    if (ancestors.includes(current)) {
      return err({ code: 'capability-invalid', message: 'Capability values cannot contain cycles or aliases.', path });
    }
    if (!isUnknownArray(current) && !isPlainRecord(current)) {
      return err({ code: 'capability-invalid', message: 'Capability contains a non-plain runtime object that must be projected by its codec.', path });
    }
    const entries: readonly ProtocolEntry[] = isUnknownArray(current)
      ? current.map((entry, index): ProtocolEntry => [index, entry])
      : Object.keys(current).map((key): ProtocolEntry => [key, current[key]]);
    if (entries.length > budget.maxCollectionEntries) {
      return err({ code: 'budget-exceeded', message: 'Capability collection exceeds the entry budget.', path });
    }
    const visitRange = (start: number, end: number, nodeBudget: number): TeleportResult<ProtocolTraversalSummary> => {
      if (start >= end) return ok(emptySummary());
      if (end - start === 1) {
        const protocolEntry = entries[start];
        if (protocolEntry === undefined) return ok(emptySummary());
        const [key, entry] = protocolEntry;
        return visit(entry, depth + 1, [...path, key], [...ancestors, current], nodeBudget);
      }
      const midpoint = start + Math.floor((end - start) / 2);
      const left = visitRange(start, midpoint, nodeBudget);
      if (!left.ok) return left;
      const right = visitRange(midpoint, end, nodeBudget - left.value.nodeCount);
      if (!right.ok) return right;
      return mergeSummaries(left.value, right.value);
    };
    const children = visitRange(0, entries.length, remainingNodes - 1);
    return children.ok
      ? ok({
          nodeCount: children.value.nodeCount + 1,
          occurrences: [{ value: current, path }, ...children.value.occurrences]
        })
      : children;
  };

  const result = visit(value, 0, [], [], budget.maxNodes);
  return result.ok ? ok(undefined, result.warnings) : result;
};
