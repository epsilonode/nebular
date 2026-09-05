import { type BrokerAttemptId, type BrokerRequestId, type BrokerSequence, type BrokerTimestampMs } from './primitives.ts';
import { type BrokerClientResult } from './result.ts';
export declare const BROKER_PROTOCOL_VERSION: 1;
export declare const BROKER_MAX_MESSAGE_BYTES: number;
export declare const BROKER_MAX_OUTPUT_CHUNK_BYTES: number;
export type BrokerOperation = 'execute-recipe' | 'status' | 'cancel' | 'grant' | 'revoke' | 'export-car' | 'import-car' | 'doctor';
type BrokerRequestAuthorityHints = Readonly<{
    repositoryPathHint?: string;
    recipePathHint?: string;
    recipeRevision?: string;
    credentialSlotIds: readonly string[];
}>;
export type ExecuteRecipeRequestPayload = BrokerRequestAuthorityHints & Readonly<{
    operation: 'execute-recipe';
    grantIdHint: string;
}>;
export type NonExecuteBrokerOperation = Exclude<BrokerOperation, 'execute-recipe'>;
export type NonExecuteRequestPayload = BrokerRequestAuthorityHints & Readonly<{
    operation: NonExecuteBrokerOperation;
    grantIdHint?: never;
}>;
export type BrokerRequestPayload = ExecuteRecipeRequestPayload | NonExecuteRequestPayload;
type EnvelopeBase = Readonly<{
    protocolVersion: typeof BROKER_PROTOCOL_VERSION;
    requestId: BrokerRequestId;
    sequence: BrokerSequence;
    sentAtMs: BrokerTimestampMs;
    attemptId?: BrokerAttemptId;
}>;
export type BrokerHelloMessage = EnvelopeBase & Readonly<{
    messageKind: 'hello';
    payload: Readonly<{
        buildId: string;
        capabilities: readonly string[];
    }>;
}>;
export type BrokerRequestMessage = EnvelopeBase & Readonly<{
    messageKind: 'request';
    payload: BrokerRequestPayload;
}>;
export type BrokerCancelMessage = EnvelopeBase & Readonly<{
    messageKind: 'cancel';
    payload: Readonly<{
        expectedGeneration: number;
    }>;
}>;
export type BrokerProgressMessage = EnvelopeBase & Readonly<{
    messageKind: 'progress';
    payload: Readonly<{
        phase: string;
        detail: string;
    }>;
}>;
export type BrokerTerminalMessage = EnvelopeBase & Readonly<{
    messageKind: 'terminal-success' | 'terminal-failure' | 'protocol-error';
    payload: Readonly<{
        code: string;
        message: string;
    }>;
}>;
export type BrokerControlMessage = BrokerHelloMessage | BrokerRequestMessage | BrokerCancelMessage | BrokerProgressMessage | BrokerTerminalMessage;
export declare const decodeBrokerControlMessage: (input: unknown) => BrokerClientResult<BrokerControlMessage>;
export declare const encodeBrokerControlMessage: (message: BrokerControlMessage) => BrokerClientResult<string>;
export declare const decodeBrokerControlJson: (json: string) => BrokerClientResult<BrokerControlMessage>;
export {};
