import { type TeleportResult } from './result';
import type { TeleportRestorePlan, TeleportRestoreStep } from './types';
export interface TeleportRestoreAuthorization {
    readonly allowEffects: readonly TeleportRestoreStep['effect'][];
    readonly confirmedStepIds?: readonly string[];
}
export interface TeleportRestoreReceipt {
    readonly stepId: string;
    readonly capabilityInstanceId: string;
    readonly token: unknown;
}
export interface TeleportRestoreExecutionReport {
    readonly status: 'committed' | 'rolled-back';
    readonly receipts: readonly TeleportRestoreReceipt[];
    readonly rolledBackStepIds: readonly string[];
}
export interface TeleportRestoreExecutorPort {
    readonly stage: (step: TeleportRestoreStep) => Promise<TeleportResult<unknown>>;
    readonly commit: (step: TeleportRestoreStep, staged: unknown) => Promise<TeleportResult<unknown>>;
    readonly verify: (step: TeleportRestoreStep, receipt: unknown) => Promise<TeleportResult<void>>;
    readonly rollback: (step: TeleportRestoreStep, receipt: unknown) => Promise<TeleportResult<void>>;
    readonly cleanup: (step: TeleportRestoreStep, staged: unknown) => Promise<void>;
}
export declare const executeTeleportRestorePlan: (plan: TeleportRestorePlan, authorization: TeleportRestoreAuthorization, port: TeleportRestoreExecutorPort) => Promise<TeleportResult<TeleportRestoreExecutionReport>>;
