import { type BrokerResult } from './result.ts';
export type BrokerPlanAuthority = 'none' | 'grant' | 'provider' | 'lease';
export type BrokerPlanExposure = 'none' | 'opaque-handle' | 'provider-operation' | 'child-environment' | 'transfer-encryption' | 'elevated-raw';
export type BrokerPlanConfirmation = 'none' | 'standard' | 'elevated';
export type BrokerPlanRetry = 'never' | 'idempotent' | 'conditional-on-version' | 'resume-from-journal';
export type BrokerPlanStep = Readonly<{
    id: string;
    kind: string;
    dependsOn: readonly string[];
    authority: BrokerPlanAuthority;
    resources: readonly string[];
    exposure: BrokerPlanExposure;
    confirmation: BrokerPlanConfirmation;
    deadlineMs: number;
    idempotencyKey: string;
    retry: BrokerPlanRetry;
    verification: string;
    reversible: boolean;
    rollback: string | null;
    journalRequired: boolean;
}>;
export type BrokerPlan = Readonly<{
    state: 'planned';
    steps: readonly BrokerPlanStep[];
    confirmations: readonly BrokerPlanConfirmation[];
}>;
export declare const createBrokerPlan: (steps: readonly BrokerPlanStep[]) => BrokerResult<BrokerPlan>;
export declare const composeBrokerPlans: (left: BrokerPlan, right: BrokerPlan) => BrokerResult<BrokerPlan>;
