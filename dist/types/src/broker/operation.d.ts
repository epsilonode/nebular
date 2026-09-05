import { type BrokerAttemptId, type BrokerControlMessage, type BrokerRequestMessage, type BrokerTimestampMs } from '../broker-client/public.ts';
import { type Pm2PrerequisiteConfig, type Pm2PrerequisiteRuntimePort } from './pm2-prerequisite.ts';
import { type BrokerResult } from './result.ts';
export declare const BROKER_MAX_OPERATION_PROGRESS = 64;
export type BrokerOperationProgress = Readonly<{
    phase: string;
    detail: string;
}>;
export type BrokerOperationOutcome = Readonly<{
    outcome: 'success' | 'failure';
    code: string;
    message: string;
    progress: readonly BrokerOperationProgress[];
    attemptId?: BrokerAttemptId;
}>;
export type BrokerOperationContext = Readonly<{
    /** Aborted exactly once when the correlated control request is cancelled. */
    signal: AbortSignal;
}>;
export type BrokerOperationPort = Readonly<{
    /**
     * The optional context preserves source compatibility for existing two-arg
     * operation ports. The inherited-IPC composition always supplies it.
     */
    execute: (request: BrokerRequestMessage, nowMs: number, context?: BrokerOperationContext) => Promise<BrokerResult<BrokerOperationOutcome>>;
}>;
export declare const validateBrokerOperationOutcome: (outcome: BrokerOperationOutcome) => BrokerResult<BrokerOperationOutcome>;
export declare const projectBrokerOperationMessages: (request: BrokerRequestMessage, outcome: BrokerOperationOutcome, sentAtMs: BrokerTimestampMs) => BrokerResult<readonly BrokerControlMessage[]>;
export declare const createDefaultBrokerOperationPort: () => BrokerOperationPort;
/**
 * Opt-in production composition for a broker doctor that includes the
 * host-owned PM2 protocol prerequisite. The default broker operation remains explicit
 * and does not inspect ambient host infrastructure.
 */
export declare const createPm2AwareBrokerOperationPort: (config: Pm2PrerequisiteConfig, runtime?: Pm2PrerequisiteRuntimePort) => BrokerOperationPort;
