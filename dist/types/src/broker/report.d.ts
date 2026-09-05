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
export declare const combineBrokerWarnings: (left: readonly BrokerReportWarning[], right: readonly BrokerReportWarning[]) => readonly BrokerReportWarning[];
export declare const combineBrokerAuditFacts: (left: readonly BrokerAuditFact[], right: readonly BrokerAuditFact[]) => readonly BrokerAuditFact[];
export declare const combineBrokerRecovery: (left: readonly BrokerRecoveryEntry[], right: readonly BrokerRecoveryEntry[]) => readonly BrokerRecoveryEntry[];
export declare const emptyBrokerReport: () => BrokerReport;
export declare const combineBrokerReports: (left: BrokerReport, right: BrokerReport) => BrokerReport;
export declare const brokerReportRedactionAtLeast: (candidate: BrokerReportRedaction, minimum: BrokerReportRedaction) => boolean;
