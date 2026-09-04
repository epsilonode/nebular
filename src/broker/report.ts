export type BrokerReportRedaction = 'public' | 'redacted' | 'restricted';

export type BrokerReportWarning = Readonly<{
  id: string;
  code: string;
  message: string;
  redaction: BrokerReportRedaction;
}>;

export type BrokerAuditFact = Readonly<{
  id: string;
  transactionId: string;
  sequence: number;
  kind: string;
  message: string;
  redaction: BrokerReportRedaction;
}>;

export type BrokerRecoveryEntry = Readonly<{
  stepId: string;
  attempted: boolean;
  succeeded: boolean;
  failed: boolean;
  skipped: boolean;
  retryable: boolean;
  journalRequired: boolean;
  redaction: BrokerReportRedaction;
}>;

export type BrokerReport = Readonly<{
  warnings: readonly BrokerReportWarning[];
  audit: readonly BrokerAuditFact[];
  recovery: readonly BrokerRecoveryEntry[];
}>;

const redactionRank = (value: BrokerReportRedaction): number =>
  value === 'public' ? 0 : value === 'redacted' ? 1 : 2;

const strictestRedaction = (
  left: BrokerReportRedaction,
  right: BrokerReportRedaction
): BrokerReportRedaction => redactionRank(left) >= redactionRank(right) ? left : right;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalMessage = (left: string, right: string): string =>
  compareText(left, right) <= 0 ? left : right;

const warningIdentity = (value: BrokerReportWarning): string => `${value.code}\u0000${value.id}`;

const auditIdentity = (value: BrokerAuditFact): string =>
  `${value.transactionId}\u0000${value.sequence}\u0000${value.kind}\u0000${value.id}`;

const compareWarnings = (left: BrokerReportWarning, right: BrokerReportWarning): number =>
  compareText(warningIdentity(left), warningIdentity(right));

const compareAuditFacts = (left: BrokerAuditFact, right: BrokerAuditFact): number =>
  compareText(left.transactionId, right.transactionId) ||
  left.sequence - right.sequence ||
  compareText(left.kind, right.kind) ||
  compareText(left.id, right.id);

const compareRecoveryEntries = (left: BrokerRecoveryEntry, right: BrokerRecoveryEntry): number =>
  compareText(left.stepId, right.stepId);

const mergeWarning = (
  left: BrokerReportWarning,
  right: BrokerReportWarning
): BrokerReportWarning => ({
  id: left.id,
  code: left.code,
  message: canonicalMessage(left.message, right.message),
  redaction: strictestRedaction(left.redaction, right.redaction)
});

const mergeAuditFact = (left: BrokerAuditFact, right: BrokerAuditFact): BrokerAuditFact => ({
  id: left.id,
  transactionId: left.transactionId,
  sequence: left.sequence,
  kind: left.kind,
  message: canonicalMessage(left.message, right.message),
  redaction: strictestRedaction(left.redaction, right.redaction)
});

const mergeRecoveryEntry = (
  left: BrokerRecoveryEntry,
  right: BrokerRecoveryEntry
): BrokerRecoveryEntry => ({
  stepId: left.stepId,
  attempted: left.attempted || right.attempted,
  succeeded: left.succeeded || right.succeeded,
  failed: left.failed || right.failed,
  skipped: left.skipped || right.skipped,
  retryable: left.retryable || right.retryable,
  journalRequired: left.journalRequired || right.journalRequired,
  redaction: strictestRedaction(left.redaction, right.redaction)
});

const combineByIdentity = <Value>(
  left: readonly Value[],
  right: readonly Value[],
  identity: (value: Value) => string,
  compare: (left: Value, right: Value) => number,
  merge: (left: Value, right: Value) => Value,
  pending: readonly Value[] = [...left, ...right].toSorted(compare),
  combined: readonly Value[] = []
): readonly Value[] => {
  const first = pending[0];
  if (first === undefined) return combined;
  const second = pending[1];
  if (second !== undefined && identity(first) === identity(second)) {
    return combineByIdentity(
      left,
      right,
      identity,
      compare,
      merge,
      [merge(first, second), ...pending.slice(2)].toSorted(compare),
      combined
    );
  }
  return combineByIdentity(left, right, identity, compare, merge, pending.slice(1), [...combined, first]);
};

export const combineBrokerWarnings = (
  left: readonly BrokerReportWarning[],
  right: readonly BrokerReportWarning[]
): readonly BrokerReportWarning[] => combineByIdentity(left, right, warningIdentity, compareWarnings, mergeWarning);

export const combineBrokerAuditFacts = (
  left: readonly BrokerAuditFact[],
  right: readonly BrokerAuditFact[]
): readonly BrokerAuditFact[] => combineByIdentity(left, right, auditIdentity, compareAuditFacts, mergeAuditFact);

export const combineBrokerRecovery = (
  left: readonly BrokerRecoveryEntry[],
  right: readonly BrokerRecoveryEntry[]
): readonly BrokerRecoveryEntry[] => combineByIdentity(
  left,
  right,
  entry => entry.stepId,
  compareRecoveryEntries,
  mergeRecoveryEntry
);

export const emptyBrokerReport = (): BrokerReport => ({ warnings: [], audit: [], recovery: [] });

export const combineBrokerReports = (left: BrokerReport, right: BrokerReport): BrokerReport => ({
  warnings: combineBrokerWarnings(left.warnings, right.warnings),
  audit: combineBrokerAuditFacts(left.audit, right.audit),
  recovery: combineBrokerRecovery(left.recovery, right.recovery)
});

export const brokerReportRedactionAtLeast = (
  candidate: BrokerReportRedaction,
  minimum: BrokerReportRedaction
): boolean => redactionRank(candidate) >= redactionRank(minimum);
