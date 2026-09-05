import { type BrokerClientResult } from '../result.ts';
export declare const BROKER_BOOTSTRAP_PROTOCOL_VERSION: "epsilonode.bootstrap/v1";
export declare const BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES: number;
export declare const BROKER_BOOTSTRAP_MAX_SLOTS = 32;
export declare const BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS: number;
type BootstrapReference<Kind extends string> = Readonly<{
    kind: Kind;
    value: string;
}>;
export type BootstrapExchangeId = BootstrapReference<'bootstrap-exchange-id'>;
export type BootstrapRepository = BootstrapReference<'bootstrap-repository'>;
export type BootstrapRecipeRevision = BootstrapReference<'bootstrap-recipe-revision'>;
export type BootstrapGrantId = BootstrapReference<'bootstrap-grant-id'>;
export type BootstrapReceiverId = BootstrapReference<'bootstrap-receiver-id'>;
export type BootstrapProcessAttemptId = BootstrapReference<'bootstrap-process-attempt-id'>;
export type BootstrapSlotId = BootstrapReference<'bootstrap-slot-id'>;
export type BootstrapLeaseId = BootstrapReference<'bootstrap-lease-id'>;
export type BootstrapAuthorityReference = Readonly<{
    repository: BootstrapRepository;
    recipeRevision: BootstrapRecipeRevision;
    grantId: BootstrapGrantId;
    grantGeneration: number;
}>;
export type BootstrapAttemptReference = Readonly<{
    receiverId: BootstrapReceiverId;
    processAttemptId: BootstrapProcessAttemptId;
}>;
export type BootstrapSlotDeclaration = Readonly<{
    slotId: BootstrapSlotId;
    environmentName: string;
}>;
/**
 * A secret has no value property, useful string conversion, JSON projection,
 * equality, or cloning API. JavaScript callers can retain callback values, so
 * this is accidental-disclosure discipline rather than a sandbox guarantee.
 */
export type OpaqueBootstrapSecret = Readonly<{
    withValue: <T>(use: (secretText: string) => T) => T;
}>;
export type BootstrapDeliveredSlot = BootstrapSlotDeclaration & Readonly<{
    secret: OpaqueBootstrapSecret;
}>;
export type OpaqueBootstrapSecretBundle = Readonly<{
    slots: readonly BootstrapDeliveredSlot[];
}>;
type BootstrapEnvelope<Kind extends string> = Readonly<{
    protocolVersion: typeof BROKER_BOOTSTRAP_PROTOCOL_VERSION;
    messageKind: Kind;
    exchangeId: BootstrapExchangeId;
}>;
export type BootstrapHelloMessage = BootstrapEnvelope<'bootstrap-hello'> & Readonly<{
    payload: Readonly<{
        buildId: string;
        capabilities: readonly ('atomic-environment-v1' | 'secret-bundle-v1')[];
    }>;
}>;
export type BootstrapRequestMessage = BootstrapEnvelope<'bootstrap-request'> & Readonly<{
    payload: Readonly<{
        authority: BootstrapAuthorityReference;
        attempt: BootstrapAttemptReference;
        slots: readonly BootstrapSlotDeclaration[];
    }>;
}>;
export type BootstrapDeliveryMessage = BootstrapEnvelope<'bootstrap-delivery'> & Readonly<{
    payload: Readonly<{
        leaseId: BootstrapLeaseId;
        processAttemptId: BootstrapProcessAttemptId;
        expiresAtMs: number;
        secrets: OpaqueBootstrapSecretBundle;
    }>;
}>;
export type BootstrapRejectionCode = 'attempt-mismatch' | 'attempt-not-ready' | 'authority-denied' | 'grant-expired' | 'grant-revoked' | 'protocol-invalid' | 'recipe-drift' | 'secret-unavailable' | 'slot-not-authorized';
export type BootstrapRejectedMessage = BootstrapEnvelope<'bootstrap-rejected'> & Readonly<{
    payload: Readonly<{
        code: BootstrapRejectionCode;
    }>;
}>;
export type BootstrapAcknowledgementMessage = BootstrapEnvelope<'bootstrap-acknowledgement'> & Readonly<{
    payload: Readonly<{
        leaseId: BootstrapLeaseId;
        processAttemptId: BootstrapProcessAttemptId;
        installedSlotIds: readonly BootstrapSlotId[];
        installedSlotCount: number;
    }>;
}>;
export type BootstrapProtocolMessage = BootstrapHelloMessage | BootstrapRequestMessage | BootstrapDeliveryMessage | BootstrapRejectedMessage | BootstrapAcknowledgementMessage;
export type BootstrapResponseMessage = BootstrapDeliveryMessage | BootstrapRejectedMessage;
export type CreateBootstrapRequestInput = Readonly<{
    exchangeId: unknown;
    repository: unknown;
    recipeRevision: unknown;
    grantId: unknown;
    grantGeneration: unknown;
    receiverId: unknown;
    processAttemptId: unknown;
    slots: readonly Readonly<{
        slotId: unknown;
        environmentName: unknown;
    }>[];
}>;
export type CreateBootstrapAcknowledgementInput = Readonly<{
    exchangeId: BootstrapExchangeId;
    leaseId: BootstrapLeaseId;
    processAttemptId: BootstrapProcessAttemptId;
    installedSlotIds: readonly BootstrapSlotId[];
}>;
export declare const decodeBootstrapProtocolMessage: (input: unknown) => BrokerClientResult<BootstrapProtocolMessage>;
export declare const decodeBootstrapProtocolJson: (json: string) => BrokerClientResult<BootstrapProtocolMessage>;
export declare const createBootstrapRequest: (input: CreateBootstrapRequestInput) => BrokerClientResult<BootstrapRequestMessage>;
export declare const createBootstrapAcknowledgement: (input: CreateBootstrapAcknowledgementInput) => BrokerClientResult<BootstrapAcknowledgementMessage>;
export declare const isBootstrapResponseMessage: (message: BootstrapProtocolMessage) => message is BootstrapResponseMessage;
export {};
