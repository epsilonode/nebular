import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  brokerReportRedactionAtLeast,
  combineBrokerAuditFacts,
  combineBrokerRecovery,
  combineBrokerReports,
  combineBrokerWarnings,
  emptyBrokerReport,
  type BrokerAuditFact,
  type BrokerRecoveryEntry,
  type BrokerReport,
  type BrokerReportRedaction,
  type BrokerReportWarning
} from './report.ts';

const redaction = fc.constantFrom<BrokerReportRedaction>('public', 'redacted', 'restricted');
const text = fc.stringMatching(/^[a-z]{1,12}$/u);

const warning = fc.record({
  id: text,
  code: text,
  message: text,
  redaction
}) satisfies fc.Arbitrary<BrokerReportWarning>;

const audit = fc.record({
  id: text,
  transactionId: text,
  sequence: fc.integer({ min: 0, max: 32 }),
  kind: text,
  message: text,
  redaction
}) satisfies fc.Arbitrary<BrokerAuditFact>;

const recovery = fc.record({
  stepId: text,
  attempted: fc.boolean(),
  succeeded: fc.boolean(),
  failed: fc.boolean(),
  skipped: fc.boolean(),
  retryable: fc.boolean(),
  journalRequired: fc.boolean(),
  redaction
}) satisfies fc.Arbitrary<BrokerRecoveryEntry>;

const report = fc.record({
  warnings: fc.array(warning, { maxLength: 12 }),
  audit: fc.array(audit, { maxLength: 12 }),
  recovery: fc.array(recovery, { maxLength: 12 })
}) satisfies fc.Arbitrary<BrokerReport>;

describe('broker report combination algebra', () => {
  it('uses empty report as the identity and is associative for every report channel', () => {
    fc.assert(fc.property(report, report, report, (left, middle, right) => {
      expect(combineBrokerReports(emptyBrokerReport(), left)).toEqual(combineBrokerReports(left, emptyBrokerReport()));
      const leftAssociated = combineBrokerReports(combineBrokerReports(left, middle), right);
      const rightAssociated = combineBrokerReports(left, combineBrokerReports(middle, right));
      expect(leftAssociated).toEqual(rightAssociated);
    }), { numRuns: 100 });
  });

  it('uses deterministic ordering and semantic deduplication without lowering redaction', () => {
    const warnings = combineBrokerWarnings([
      { id: 'a', code: 'legacy', message: 'z', redaction: 'public' }
    ], [
      { id: 'a', code: 'legacy', message: 'a', redaction: 'restricted' },
      { id: 'b', code: 'current', message: 'b', redaction: 'redacted' }
    ]);
    const auditFacts = combineBrokerAuditFacts([
      { id: 'first', transactionId: 'z', sequence: 2, kind: 'planned', message: 'z', redaction: 'public' }
    ], [
      { id: 'second', transactionId: 'a', sequence: 1, kind: 'planned', message: 'a', redaction: 'redacted' }
    ]);

    expect(warnings).toEqual([
      { id: 'b', code: 'current', message: 'b', redaction: 'redacted' },
      { id: 'a', code: 'legacy', message: 'a', redaction: 'restricted' }
    ]);
    expect(auditFacts.map(fact => fact.transactionId)).toEqual(['a', 'z']);
    expect(brokerReportRedactionAtLeast(warnings[1]?.redaction ?? 'public', 'restricted')).toBe(true);
  });

  it('merges same-step recovery evidence without discarding failures or journal obligations', () => {
    const combined = combineBrokerRecovery([
      {
        stepId: 'keychain-write', attempted: true, succeeded: true, failed: false,
        skipped: false, retryable: false, journalRequired: false, redaction: 'public'
      }
    ], [
      {
        stepId: 'keychain-write', attempted: true, succeeded: false, failed: true,
        skipped: false, retryable: true, journalRequired: true, redaction: 'restricted'
      }
    ]);
    expect(combined).toEqual([{
      stepId: 'keychain-write', attempted: true, succeeded: true, failed: true,
      skipped: false, retryable: true, journalRequired: true, redaction: 'restricted'
    }]);
  });
});
