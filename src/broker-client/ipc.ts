import { z } from 'zod';

import {
  parseBrokerAttemptId,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerAttemptId,
  type BrokerRequestId,
  type BrokerSequence,
  type BrokerTimestampMs
} from './primitives.ts';
import { clientErr, clientOk, clientTry, type BrokerClientResult } from './result.ts';

export const BROKER_PROTOCOL_VERSION = 1 as const;
export const BROKER_MAX_MESSAGE_BYTES = 64 * 1024;
export const BROKER_MAX_OUTPUT_CHUNK_BYTES = 16 * 1024;

export type BrokerOperation =
  | 'execute-recipe'
  | 'status'
  | 'cancel'
  | 'grant'
  | 'revoke'
  | 'export-car'
  | 'import-car'
  | 'doctor';

export type BrokerRequestPayload = Readonly<{
  operation: BrokerOperation;
  repositoryPathHint?: string;
  recipePathHint?: string;
  recipeRevision?: string;
  credentialSlotIds: readonly string[];
}>;

type EnvelopeBase = Readonly<{
  protocolVersion: typeof BROKER_PROTOCOL_VERSION;
  requestId: BrokerRequestId;
  sequence: BrokerSequence;
  sentAtMs: BrokerTimestampMs;
  attemptId?: BrokerAttemptId;
}>;

export type BrokerHelloMessage = EnvelopeBase & Readonly<{
  messageKind: 'hello';
  payload: Readonly<{ buildId: string; capabilities: readonly string[] }>;
}>;

export type BrokerRequestMessage = EnvelopeBase & Readonly<{
  messageKind: 'request';
  payload: BrokerRequestPayload;
}>;

export type BrokerCancelMessage = EnvelopeBase & Readonly<{
  messageKind: 'cancel';
  payload: Readonly<{ expectedGeneration: number }>;
}>;

export type BrokerProgressMessage = EnvelopeBase & Readonly<{
  messageKind: 'progress';
  payload: Readonly<{ phase: string; detail: string }>;
}>;

export type BrokerTerminalMessage = EnvelopeBase & Readonly<{
  messageKind: 'terminal-success' | 'terminal-failure' | 'protocol-error';
  payload: Readonly<{ code: string; message: string }>;
}>;

export type BrokerControlMessage =
  | BrokerHelloMessage
  | BrokerRequestMessage
  | BrokerCancelMessage
  | BrokerProgressMessage
  | BrokerTerminalMessage;

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const baseSchema = z.object({
  protocolVersion: z.literal(BROKER_PROTOCOL_VERSION),
  requestId: idSchema,
  sequence: z.number().int().nonnegative().safe(),
  sentAtMs: z.number().int().nonnegative().safe(),
  attemptId: idSchema.optional()
}).strict();

const requestPayloadSchema = z.object({
  operation: z.enum(['execute-recipe', 'status', 'cancel', 'grant', 'revoke', 'export-car', 'import-car', 'doctor']),
  repositoryPathHint: z.string().min(1).max(4096).optional(),
  recipePathHint: z.string().min(1).max(1024).optional(),
  recipeRevision: z.string().min(1).max(256).optional(),
  credentialSlotIds: z.array(z.string().min(1).max(128)).max(64)
}).strict();

const wireSchema = z.discriminatedUnion('messageKind', [
  baseSchema.extend({
    messageKind: z.literal('hello'),
    payload: z.object({
      buildId: z.string().min(1).max(128),
      capabilities: z.array(z.string().min(1).max(128)).max(64)
    }).strict()
  }).strict(),
  baseSchema.extend({ messageKind: z.literal('request'), payload: requestPayloadSchema }).strict(),
  baseSchema.extend({
    messageKind: z.literal('cancel'),
    payload: z.object({ expectedGeneration: z.number().int().nonnegative().safe() }).strict()
  }).strict(),
  baseSchema.extend({
    messageKind: z.literal('progress'),
    payload: z.object({ phase: z.string().min(1).max(128), detail: z.string().max(2048) }).strict()
  }).strict(),
  baseSchema.extend({
    messageKind: z.enum(['terminal-success', 'terminal-failure', 'protocol-error']),
    payload: z.object({ code: z.string().min(1).max(128), message: z.string().max(2048) }).strict()
  }).strict()
]);

type WireMessage = z.infer<typeof wireSchema>;

const decodeBase = (wire: WireMessage): BrokerClientResult<EnvelopeBase> =>
  parseBrokerRequestId(wire.requestId).andThen(requestId =>
    parseBrokerSequence(wire.sequence).andThen(sequence =>
      parseBrokerTimestampMs(wire.sentAtMs).andThen(sentAtMs => {
        const attempt = wire.attemptId === undefined ? clientOk<BrokerAttemptId | undefined>(undefined) : parseBrokerAttemptId(wire.attemptId);
        return attempt.map(attemptId => ({
          protocolVersion: BROKER_PROTOCOL_VERSION,
          requestId,
          sequence,
          sentAtMs,
          ...(attemptId === undefined ? {} : { attemptId })
        }));
      })
    )
  );

const projectWire = (wire: WireMessage, base: EnvelopeBase): BrokerControlMessage => {
  switch (wire.messageKind) {
    case 'hello': return { ...base, messageKind: wire.messageKind, payload: { buildId: wire.payload.buildId, capabilities: wire.payload.capabilities } };
    case 'request': return {
      ...base,
      messageKind: wire.messageKind,
      payload: {
        operation: wire.payload.operation,
        credentialSlotIds: wire.payload.credentialSlotIds,
        ...(wire.payload.repositoryPathHint === undefined ? {} : { repositoryPathHint: wire.payload.repositoryPathHint }),
        ...(wire.payload.recipePathHint === undefined ? {} : { recipePathHint: wire.payload.recipePathHint }),
        ...(wire.payload.recipeRevision === undefined ? {} : { recipeRevision: wire.payload.recipeRevision })
      }
    };
    case 'cancel': return { ...base, messageKind: wire.messageKind, payload: { expectedGeneration: wire.payload.expectedGeneration } };
    case 'progress': return { ...base, messageKind: wire.messageKind, payload: { phase: wire.payload.phase, detail: wire.payload.detail } };
    case 'terminal-success':
    case 'terminal-failure':
    case 'protocol-error': return { ...base, messageKind: wire.messageKind, payload: { code: wire.payload.code, message: wire.payload.message } };
  }
};

export const decodeBrokerControlMessage = (input: unknown): BrokerClientResult<BrokerControlMessage> => {
  const parsed = wireSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return clientErr({
      code: 'invalid-input',
      message: 'Broker control message is invalid.',
      ...(first === undefined ? {} : { path: first.path.map(part => typeof part === 'symbol' ? String(part) : part) })
    });
  }
  return decodeBase(parsed.data).map(base => projectWire(parsed.data, base));
};

export const encodeBrokerControlMessage = (message: BrokerControlMessage): BrokerClientResult<string> => {
  const decoded = decodeBrokerControlMessage(message);
  if (decoded.isErr()) return clientErr(...decoded.error);
  const json = JSON.stringify(message);
  return new TextEncoder().encode(json).byteLength <= BROKER_MAX_MESSAGE_BYTES
    ? clientOk(json)
    : clientErr({ code: 'message-too-large', message: 'Broker control message exceeds its byte budget.' });
};

export const decodeBrokerControlJson = (json: string): BrokerClientResult<BrokerControlMessage> => {
  if (new TextEncoder().encode(json).byteLength > BROKER_MAX_MESSAGE_BYTES) {
    return clientErr({ code: 'message-too-large', message: 'Broker control message exceeds its byte budget.' });
  }
  return clientTry(
    () => JSON.parse(json) as unknown,
    { code: 'invalid-input', message: 'Broker control message is not valid JSON.' }
  ).andThen(decodeBrokerControlMessage);
};
