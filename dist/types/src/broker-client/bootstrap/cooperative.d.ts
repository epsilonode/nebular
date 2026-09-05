import { type BootstrapAcknowledgementMessage, type BootstrapDeliveredSlot, type BootstrapDeliveryMessage, type BootstrapExchangeId, type BootstrapGrantId, type BootstrapLeaseId, type BootstrapProcessAttemptId, type BootstrapRequestMessage, type BootstrapResponseMessage, type BootstrapSlotDeclaration } from './protocol.ts';
import { type BrokerClientResult } from '../result.ts';
export declare const BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES: readonly ["BUN_OPTIONS", "CLASSPATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "JAVA_TOOL_OPTIONS", "LD_LIBRARY_PATH", "LD_PRELOAD", "NODE_OPTIONS", "NODE_PATH", "PATH", "PATHEXT", "PERL5LIB", "PERL5OPT", "PYTHONHOME", "PYTHONPATH", "RUBYOPT", "_JAVA_OPTIONS"];
export type BootstrapEnvironmentPatchEntry = BootstrapDeliveredSlot;
/**
 * Entries expose only callback-opaque values. The redacted slot projection can
 * be observed safely by transport, receipts, and tests.
 */
export type BootstrapEnvironmentPatch = Readonly<{
    exchangeId: BootstrapExchangeId;
    leaseId: BootstrapLeaseId;
    processAttemptId: BootstrapProcessAttemptId;
    expiresAtMs: number;
    slots: readonly BootstrapSlotDeclaration[];
    entries: readonly BootstrapEnvironmentPatchEntry[];
}>;
export type BootstrapEnvironmentRollbackPort = Readonly<{
    rollback: () => Promise<BrokerClientResult<void>>;
}>;
export type BootstrapEnvironmentInstallReceipt = Readonly<{
    atomic: boolean;
    installedSlots: readonly BootstrapSlotDeclaration[];
    /** Capability for removing installed names after a post-install failure. */
    cleanup: BootstrapEnvironmentRollbackPort;
}>;
export type BootstrapEnvironmentInstallPort = Readonly<{
    /** A typed error means no entry was installed. */
    installAtomically: (patch: BootstrapEnvironmentPatch) => Promise<BrokerClientResult<BootstrapEnvironmentInstallReceipt>>;
}>;
export type BootstrapExchangeCompletion<T> = Readonly<{
    acknowledgement: BootstrapAcknowledgementMessage;
    value: T;
    /** Transport invokes this if the helper does not commit and exit cleanly. */
    cleanup: BootstrapEnvironmentRollbackPort;
}>;
export type CooperativeBootstrapTransportPort = Readonly<{
    /**
     * The adapter owns handshake, bounded inherited IPC, acknowledgement send,
     * disconnect, and helper exit. It invokes `consume` once while the decoded
     * secret response is in scope and resolves only after the helper exits.
     */
    exchange: <T>(request: BootstrapRequestMessage, consume: (response: BootstrapResponseMessage) => Promise<BrokerClientResult<BootstrapExchangeCompletion<T>>>) => Promise<BrokerClientResult<BootstrapExchangeCompletion<T>>>;
}>;
export type BootstrapClockPort = Readonly<{
    nowMs: () => number;
}>;
export type CooperativeBootstrapPorts = Readonly<{
    clock: BootstrapClockPort;
    environment: BootstrapEnvironmentInstallPort;
    transport: CooperativeBootstrapTransportPort;
}>;
export declare const BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS = 32;
export declare const BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS = 1000;
export type BootstrapNotReadyRetryPolicy = Readonly<{
    maximumAttempts: number;
    delayMs: number;
}>;
export type BootstrapNotReadyRetryPort = Readonly<{
    wait: (delayMs: number) => Promise<void>;
}>;
export type PrepareRecipeEnvironmentInput = Readonly<{
    request: BootstrapRequestMessage;
    inheritedEnvironmentNames: readonly string[];
}>;
export type PreparedRecipeEnvironment = Readonly<{
    state: 'prepared';
    exchangeId: BootstrapExchangeId;
    grantId: BootstrapGrantId;
    leaseId: BootstrapLeaseId;
    processAttemptId: BootstrapProcessAttemptId;
    installedSlots: readonly BootstrapSlotDeclaration[];
    expiresAtMs: number;
    warnings: readonly Readonly<{
        code: 'javascript-zeroization-not-guaranteed';
        message: string;
    }>[];
}>;
export type PreparedApplication<Module> = Readonly<{
    environment: PreparedRecipeEnvironment;
    application: Module;
}>;
export declare const planBootstrapEnvironmentPatch: (request: BootstrapRequestMessage, delivery: BootstrapDeliveryMessage, inheritedEnvironmentNames: readonly string[], nowMs: number) => BrokerClientResult<BootstrapEnvironmentPatch>;
export declare const prepareRecipeEnvironment: (input: PrepareRecipeEnvironmentInput, ports: CooperativeBootstrapPorts) => Promise<BrokerClientResult<PreparedRecipeEnvironment>>;
export declare const prepareRecipeEnvironmentWithRetry: (input: PrepareRecipeEnvironmentInput, ports: CooperativeBootstrapPorts, retry: BootstrapNotReadyRetryPort, policy: BootstrapNotReadyRetryPolicy) => Promise<BrokerClientResult<PreparedRecipeEnvironment>>;
export declare const createBootstrapNotReadyRetryPort: () => BootstrapNotReadyRetryPort;
export declare const prepareRecipeEnvironmentThenImport: <Module>(input: PrepareRecipeEnvironmentInput, ports: CooperativeBootstrapPorts, deferredImport: () => PromiseLike<Module>) => Promise<BrokerClientResult<PreparedApplication<Module>>>;
export declare const prepareRecipeEnvironmentThenImportWithRetry: <Module>(input: PrepareRecipeEnvironmentInput, ports: CooperativeBootstrapPorts, retry: BootstrapNotReadyRetryPort, policy: BootstrapNotReadyRetryPolicy, deferredImport: () => PromiseLike<Module>) => Promise<BrokerClientResult<PreparedApplication<Module>>>;
