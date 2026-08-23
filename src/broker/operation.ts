import {
  BROKER_PROTOCOL_VERSION,
  parseBrokerSequence,
  type BrokerControlMessage,
  type BrokerProgressMessage,
  type BrokerRequestMessage,
  type BrokerTerminalMessage,
  type BrokerTimestampMs
} from '../broker-client/public.ts';
import { brokerErr, brokerOk, brokerTaskOk, type BrokerResult, type BrokerTaskResult } from './result.ts';

export const BROKER_MAX_OPERATION_PROGRESS = 64;

export type BrokerOperationProgress = Readonly<{
  phase: string;
  detail: string;
}>;

export type BrokerOperationOutcome = Readonly<{
  outcome: 'success' | 'failure';
  code: string;
  message: string;
  progress: readonly BrokerOperationProgress[];
}>;

export type BrokerOperationPort = Readonly<{
  execute: (request: BrokerRequestMessage, nowMs: number) => BrokerTaskResult<BrokerOperationOutcome>;
}>;

const validText = (value: string, maximumLength: number, allowEmpty: boolean): boolean =>
  value.length <= maximumLength && (allowEmpty || value.length > 0) && !value.includes('\0');

export const validateBrokerOperationOutcome = (
  outcome: BrokerOperationOutcome
): BrokerResult<BrokerOperationOutcome> => {
  const progressValid = outcome.progress.length <= BROKER_MAX_OPERATION_PROGRESS &&
    outcome.progress.every(item => validText(item.phase, 128, false) && validText(item.detail, 2048, true));
  return progressValid && validText(outcome.code, 128, false) && validText(outcome.message, 2048, true)
    ? brokerOk(outcome)
    : brokerErr({ code: 'ipc-invalid', message: 'Broker operation emitted invalid diagnostic metadata.' });
};

const responseIdentity = (request: BrokerRequestMessage) => ({
  requestId: request.requestId,
  ...(request.attemptId === undefined ? {} : { attemptId: request.attemptId })
});

export const projectBrokerOperationMessages = (
  request: BrokerRequestMessage,
  outcome: BrokerOperationOutcome,
  sentAtMs: BrokerTimestampMs
): BrokerResult<readonly BrokerControlMessage[]> =>
  validateBrokerOperationOutcome(outcome).andThen(validated => {
    const sequenceResults = [...validated.progress, validated].map((_item, index) =>
      parseBrokerSequence(request.sequence + index + 1)
    );
    const invalidSequence = sequenceResults.find(result => result.isErr());
    if (invalidSequence?.isErr()) {
      return brokerErr({ code: 'ipc-invalid', message: 'Broker operation response sequence cannot advance.' });
    }
    const sequences = sequenceResults.flatMap(result => result.isOk() ? [result.value] : []);
    const progress: readonly BrokerProgressMessage[] = validated.progress.flatMap((item, index) => {
      const sequence = sequences[index];
      return sequence === undefined ? [] : [{
        protocolVersion: BROKER_PROTOCOL_VERSION,
        messageKind: 'progress',
        ...responseIdentity(request),
        sequence,
        sentAtMs,
        payload: item
      }];
    });
    const terminalSequence = sequences.at(-1);
    if (terminalSequence === undefined) {
      return brokerErr({ code: 'ipc-invalid', message: 'Broker terminal response sequence is unavailable.' });
    }
    const terminal: BrokerTerminalMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: validated.outcome === 'success' ? 'terminal-success' : 'terminal-failure',
      ...responseIdentity(request),
      sequence: terminalSequence,
      sentAtMs,
      payload: { code: validated.code, message: validated.message }
    };
    return brokerOk([...progress, terminal]);
  });

const isDoctorRequest = (request: BrokerRequestMessage): boolean =>
  request.payload.operation === 'doctor' &&
  request.payload.credentialSlotIds.length === 0 &&
  request.payload.repositoryPathHint === undefined &&
  request.payload.recipePathHint === undefined &&
  request.payload.recipeRevision === undefined;

export const createDefaultBrokerOperationPort = (): BrokerOperationPort => ({
  execute: request => brokerTaskOk(isDoctorRequest(request)
    ? {
        outcome: 'success',
        code: 'broker-ready',
        message: 'Nebular broker runtime is ready.',
        progress: [{ phase: 'doctor', detail: 'Broker runtime and inherited IPC are available.' }]
      }
    : {
        outcome: 'failure',
        code: 'operation-unavailable',
        message: 'The requested broker operation is not admitted by this runtime profile.',
        progress: []
      })
});
