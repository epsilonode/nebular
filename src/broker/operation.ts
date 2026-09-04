import {
  BROKER_PROTOCOL_VERSION,
  parseBrokerSequence,
  parseBrokerAttemptId,
  type BrokerAttemptId,
  type BrokerControlMessage,
  type BrokerClientResult,
  type BrokerProgressMessage,
  type BrokerRequestMessage,
  type BrokerSequence,
  type BrokerTerminalMessage,
  type BrokerTimestampMs
} from '../broker-client/public.ts';
import {
  probePm2Prerequisite,
  type Pm2PrerequisiteConfig,
  type Pm2PrerequisiteRuntimePort,
  type Pm2PrerequisiteStatus
} from './pm2-prerequisite.ts';
import { createPm2ProtocolCompatibilityRuntimePort } from './pm2-rpc.ts';
import { brokerErr, brokerOk, brokerTry, type BrokerIssue, type BrokerResult } from './result.ts';

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
  execute: (
    request: BrokerRequestMessage,
    nowMs: number,
    context?: BrokerOperationContext
  ) => Promise<BrokerResult<BrokerOperationOutcome>>;
}>;

const receiverInspectionFailure = (): BrokerIssue => ({
  code: 'receiver-unavailable',
  message: 'Broker receiver prerequisite inspection failed.'
});

const invokeOperationTask = <T>(
  task: () => Promise<T>,
  project: (value: T) => BrokerResult<BrokerOperationOutcome>
): Promise<BrokerResult<BrokerOperationOutcome>> => {
  const issue = receiverInspectionFailure();
  const invoked = brokerTry(task, issue);
  return invoked.isErr()
    ? Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)))
    : invoked.value.then(
        value => project(value),
        () => brokerErr(issue)
      );
};

const validText = (value: string, maximumLength: number, allowEmpty: boolean): boolean =>
  value.length <= maximumLength && (allowEmpty || value.length > 0) && !value.includes('\0');

export const validateBrokerOperationOutcome = (
  outcome: BrokerOperationOutcome
): BrokerResult<BrokerOperationOutcome> => {
  const progressValid = outcome.progress.length <= BROKER_MAX_OPERATION_PROGRESS &&
    outcome.progress.every(item => validText(item.phase, 128, false) && validText(item.detail, 2048, true));
  const attemptValid = outcome.attemptId === undefined || parseBrokerAttemptId(outcome.attemptId).isOk();
  return progressValid && attemptValid && validText(outcome.code, 128, false) && validText(outcome.message, 2048, true)
    ? brokerOk(outcome)
    : brokerErr({ code: 'ipc-invalid', message: 'Broker operation emitted invalid diagnostic metadata.' });
};

const responseIdentity = (request: BrokerRequestMessage) => ({
  requestId: request.requestId,
  ...(request.attemptId === undefined ? {} : { attemptId: request.attemptId })
});

const terminalResponseIdentity = (
  request: BrokerRequestMessage,
  outcome: BrokerOperationOutcome
): Readonly<{ requestId: BrokerRequestMessage['requestId']; attemptId?: BrokerAttemptId }> => ({
  requestId: request.requestId,
  ...(outcome.attemptId === undefined
    ? request.attemptId === undefined ? {} : { attemptId: request.attemptId }
    : { attemptId: outcome.attemptId })
});

export const projectBrokerOperationMessages = (
  request: BrokerRequestMessage,
  outcome: BrokerOperationOutcome,
  sentAtMs: BrokerTimestampMs
): BrokerResult<readonly BrokerControlMessage[]> =>
  validateBrokerOperationOutcome(outcome).andThen(validated => {
    const sequenceResults: readonly BrokerClientResult<BrokerSequence>[] = [...validated.progress, validated].map((_item, index) =>
      parseBrokerSequence(request.sequence + index + 1)
    );
    const invalidSequence = sequenceResults.find(result => result.isErr());
    if (invalidSequence?.isErr()) {
      return brokerErr({ code: 'ipc-invalid', message: 'Broker operation response sequence cannot advance.' });
    }
    const sequences: readonly BrokerSequence[] = sequenceResults.reduce<readonly BrokerSequence[]>(
      (values, result) => result.isOk() ? [...values, result.value] : values,
      []
    );
    const progress: readonly BrokerProgressMessage[] = validated.progress.reduce<readonly BrokerProgressMessage[]>((messages, item, index) => {
      const sequence = sequences[index];
      return sequence === undefined ? messages : [...messages, {
        protocolVersion: BROKER_PROTOCOL_VERSION,
        messageKind: 'progress',
        ...responseIdentity(request),
        sequence,
        sentAtMs,
        payload: item
      }];
    }, []);
    const terminalSequence = sequences.at(-1);
    if (terminalSequence === undefined) {
      return brokerErr({ code: 'ipc-invalid', message: 'Broker terminal response sequence is unavailable.' });
    }
    const terminal: BrokerTerminalMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: validated.outcome === 'success' ? 'terminal-success' : 'terminal-failure',
      ...terminalResponseIdentity(request, validated),
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

const unavailableOperation = (): BrokerOperationOutcome => ({
  outcome: 'failure',
  code: 'operation-unavailable',
  message: 'The requested broker operation is not admitted by this runtime profile.',
  progress: []
});

export const createDefaultBrokerOperationPort = (): BrokerOperationPort => ({
  execute: request => Promise.resolve(brokerOk(isDoctorRequest(request)
    ? {
        outcome: 'success',
        code: 'broker-runtime-ready',
        message: 'Nebular broker runtime is available; receiver execution readiness was not evaluated.',
        progress: [{ phase: 'doctor', detail: 'Broker runtime and inherited IPC are available; no receiver was evaluated.' }]
      }
    : unavailableOperation()))
});

const pm2DoctorOutcome = (status: Pm2PrerequisiteStatus): BrokerOperationOutcome => ({
  outcome: status.status === 'compatible' ? 'success' : 'failure',
  code: status.code,
  message: status.message,
  progress: [
    { phase: 'doctor', detail: 'Broker runtime and inherited IPC are available.' },
    { phase: 'receiver-prerequisite', detail: status.message }
  ]
});

/**
 * Opt-in production composition for a broker doctor that includes the
 * host-owned PM2 protocol prerequisite. The default broker operation remains explicit
 * and does not inspect ambient host infrastructure.
 */
export const createPm2AwareBrokerOperationPort = (
  config: Pm2PrerequisiteConfig,
  runtime: Pm2PrerequisiteRuntimePort = createPm2ProtocolCompatibilityRuntimePort()
): BrokerOperationPort => ({
  execute: request => isDoctorRequest(request)
    ? invokeOperationTask(
        () => probePm2Prerequisite(config, runtime),
        status => brokerOk(pm2DoctorOutcome(status))
      )
    : Promise.resolve(brokerOk(unavailableOperation()))
});
