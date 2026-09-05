import { type BootstrapRequestMessage, type CreateBootstrapRequestInput } from './protocol.ts';
import { type BrokerClientResult } from '../result.ts';
export declare const MANAGED_ATTEMPT_ENVIRONMENT: Readonly<{
    readonly repository: "NEBULAR_PM2_REPOSITORY";
    readonly recipeRevision: "NEBULAR_PM2_RECIPE_REVISION";
    readonly grantId: "NEBULAR_PM2_GRANT_ID";
    readonly grantGeneration: "NEBULAR_PM2_GRANT_GENERATION";
    readonly receiverId: "NEBULAR_PM2_RECEIVER_ID";
    readonly processAttemptId: "NEBULAR_PM2_ATTEMPT_ID";
}>;
export type ManagedAttemptEnvironmentPort = Readonly<{
    read: (name: string) => unknown;
    createExchangeId: () => unknown;
}>;
export type ManagedBootstrapRequestInput = Readonly<{
    slots: CreateBootstrapRequestInput['slots'];
}>;
export declare const createManagedBootstrapRequest: (input: ManagedBootstrapRequestInput, port: ManagedAttemptEnvironmentPort) => BrokerClientResult<BootstrapRequestMessage>;
export declare const createBunManagedAttemptEnvironmentPort: () => ManagedAttemptEnvironmentPort;
