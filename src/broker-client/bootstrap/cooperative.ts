import {
  BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS,
  BROKER_BOOTSTRAP_MAX_SLOTS,
  createBootstrapAcknowledgement,
  type BootstrapAcknowledgementMessage,
  type BootstrapDeliveredSlot,
  type BootstrapDeliveryMessage,
  type BootstrapExchangeId,
  type BootstrapGrantId,
  type BootstrapLeaseId,
  type BootstrapProcessAttemptId,
  type BootstrapRejectedMessage,
  type BootstrapRequestMessage,
  type BootstrapResponseMessage,
  type BootstrapSlotDeclaration
} from './protocol.ts';
import {
  clientErr,
  clientOk,
  type BrokerClientIssues,
  type BrokerClientResult
} from '../result.ts';

export const BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES = [
  'BUN_OPTIONS',
  'CLASSPATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'JAVA_TOOL_OPTIONS',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYOPT',
  '_JAVA_OPTIONS'
] as const;

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
  installAtomically: (
    patch: BootstrapEnvironmentPatch
  ) => Promise<BrokerClientResult<BootstrapEnvironmentInstallReceipt>>;
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
  exchange: <T>(
    request: BootstrapRequestMessage,
    consume: (
      response: BootstrapResponseMessage
    ) => Promise<BrokerClientResult<BootstrapExchangeCompletion<T>>>
  ) => Promise<BrokerClientResult<BootstrapExchangeCompletion<T>>>;
}>;

export type BootstrapClockPort = Readonly<{
  nowMs: () => number;
}>;

export type CooperativeBootstrapPorts = Readonly<{
  clock: BootstrapClockPort;
  environment: BootstrapEnvironmentInstallPort;
  transport: CooperativeBootstrapTransportPort;
}>;

export const BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS = 32;
export const BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS = 1_000;

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

const foldEnvironmentName = (value: string): string => value.toUpperCase();

const isReservedEnvironmentName = (value: string): boolean =>
  foldEnvironmentName(value).startsWith('NEBULAR_') ||
  BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES.some(name => name === foldEnvironmentName(value));

const isValidEnvironmentName = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value) &&
  !value.includes('\0') && !isReservedEnvironmentName(value);

const hasUniqueValues = (values: readonly string[]): boolean =>
  values.every((value, index) => values.indexOf(value) === index);

const hasValidSlotSet = (slots: readonly BootstrapSlotDeclaration[]): boolean =>
  slots.length <= BROKER_BOOTSTRAP_MAX_SLOTS &&
  slots.every(slot => slot.slotId.value.length > 0 && isValidEnvironmentName(slot.environmentName)) &&
  hasUniqueValues(slots.map(slot => slot.slotId.value)) &&
  hasUniqueValues(slots.map(slot => foldEnvironmentName(slot.environmentName)));

const slotsMatchExactly = (
  declared: readonly BootstrapSlotDeclaration[],
  delivered: readonly BootstrapDeliveredSlot[]
): boolean => declared.length === delivered.length && declared.every(declaration =>
  delivered.some(slot =>
    slot.slotId.value === declaration.slotId.value && slot.environmentName === declaration.environmentName));

const secretsAreValid = (slots: readonly BootstrapDeliveredSlot[]): boolean =>
  slots.every(slot => slot.secret.withValue(secretText =>
    secretText.length > 0 &&
    secretText.length <= BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS &&
    !secretText.includes('\0')));

const collidesWithInheritedEnvironment = (
  declared: readonly BootstrapSlotDeclaration[],
  inheritedEnvironmentNames: readonly string[]
): boolean => {
  const foldedInherited: readonly string[] = inheritedEnvironmentNames.map(foldEnvironmentName);
  return inheritedEnvironmentNames.some(name => name.length === 0 || name.includes('\0')) ||
    declared.some(slot => foldedInherited.includes(foldEnvironmentName(slot.environmentName)));
};

const sameExchange = (request: BootstrapRequestMessage, response: BootstrapResponseMessage): boolean =>
  request.exchangeId.value === response.exchangeId.value;

const sameAttempt = (request: BootstrapRequestMessage, delivery: BootstrapDeliveryMessage): boolean =>
  request.payload.attempt.processAttemptId.value === delivery.payload.processAttemptId.value;

const redactedSlots = (slots: readonly BootstrapDeliveredSlot[]): readonly BootstrapSlotDeclaration[] =>
  slots.map(slot => ({ slotId: slot.slotId, environmentName: slot.environmentName }));

const environmentPatch = (
  delivery: BootstrapDeliveryMessage,
  slots: readonly BootstrapDeliveredSlot[]
): BootstrapEnvironmentPatch => ({
  exchangeId: delivery.exchangeId,
  leaseId: delivery.payload.leaseId,
  processAttemptId: delivery.payload.processAttemptId,
  expiresAtMs: delivery.payload.expiresAtMs,
  slots: redactedSlots(slots),
  entries: slots
});

export const planBootstrapEnvironmentPatch = (
  request: BootstrapRequestMessage,
  delivery: BootstrapDeliveryMessage,
  inheritedEnvironmentNames: readonly string[],
  nowMs: number
): BrokerClientResult<BootstrapEnvironmentPatch> => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap clock value is invalid.' });
  }
  if (!sameExchange(request, delivery)) {
    return clientErr({ code: 'protocol-mismatch', message: 'Bootstrap response correlation is invalid.' });
  }
  if (!sameAttempt(request, delivery)) {
    return clientErr({ code: 'bootstrap-rejected', message: 'Bootstrap process attempt does not match.' });
  }
  if (delivery.payload.expiresAtMs <= nowMs) {
    return clientErr({ code: 'bootstrap-expired', message: 'Bootstrap secret lease has expired.' });
  }
  if (!hasValidSlotSet(request.payload.slots) ||
      collidesWithInheritedEnvironment(request.payload.slots, inheritedEnvironmentNames)) {
    return clientErr({
      code: 'environment-invalid',
      message: 'Bootstrap environment names are invalid, reserved, or collide under Windows case folding.'
    });
  }
  const slots = delivery.payload.secrets.slots;
  return slotsMatchExactly(request.payload.slots, slots) && hasValidSlotSet(slots) && secretsAreValid(slots)
    ? clientOk(environmentPatch(delivery, slots))
    : clientErr({
        code: 'environment-invalid',
        message: 'Bootstrap delivery is incomplete, undeclared, invalid, or non-atomic.'
      });
};

const sameSlotDeclarations = (
  left: readonly BootstrapSlotDeclaration[],
  right: readonly BootstrapSlotDeclaration[]
): boolean => left.length === right.length && left.every(slot => right.some(candidate =>
  candidate.slotId.value === slot.slotId.value && candidate.environmentName === slot.environmentName));

const validateInstallReceipt = (
  patch: BootstrapEnvironmentPatch,
  receipt: BootstrapEnvironmentInstallReceipt
): BrokerClientResult<BootstrapEnvironmentInstallReceipt> =>
  receipt.atomic && sameSlotDeclarations(patch.slots, receipt.installedSlots)
    ? clientOk(receipt)
    : clientErr({
        code: 'environment-invalid',
      message: 'Atomic environment installer returned inconsistent redacted receipt facts.'
    });

const failAfterEnvironmentRollback = <Value>(
  receipt: BootstrapEnvironmentInstallReceipt,
  issues: BrokerClientIssues
): Promise<BrokerClientResult<Value>> => receipt.cleanup.rollback().then(
  rolledBack => rolledBack.isOk()
    ? clientErr(...issues)
    : clientErr({
        code: 'environment-invalid',
        message: 'Bootstrap failed after installation and environment rollback did not complete.'
      }),
  () => clientErr({
    code: 'environment-invalid',
    message: 'Bootstrap failed after installation and environment rollback did not complete.'
  })
);

const preparedEnvironment = (
  request: BootstrapRequestMessage,
  patch: BootstrapEnvironmentPatch
): PreparedRecipeEnvironment => ({
  state: 'prepared',
  exchangeId: patch.exchangeId,
  grantId: request.payload.authority.grantId,
  leaseId: patch.leaseId,
  processAttemptId: patch.processAttemptId,
  installedSlots: patch.slots,
  expiresAtMs: patch.expiresAtMs,
  warnings: [{
    code: 'javascript-zeroization-not-guaranteed',
    message: 'JavaScript minimizes secret lifetime but cannot guarantee physical memory zeroization.'
  }]
});

const rejectionMessage = (rejection: BootstrapRejectedMessage): string => {
  switch (rejection.payload.code) {
    case 'attempt-mismatch': return 'The broker rejected the managed process attempt.';
    case 'attempt-not-ready': return 'The managed process is waiting for its current receiver binding.';
    case 'authority-denied': return 'The broker denied bootstrap authority.';
    case 'grant-expired': return 'The repository-scoped grant has expired.';
    case 'grant-revoked': return 'The repository-scoped grant is revoked.';
    case 'protocol-invalid': return 'The broker rejected the bootstrap protocol exchange.';
    case 'recipe-drift': return 'The validated recipe revision has changed.';
    case 'secret-unavailable': return 'A requested credential is unavailable.';
    case 'slot-not-authorized': return 'A requested credential slot is not authorized.';
  }
};

const rejectionIssue = (rejection: BootstrapRejectedMessage) => ({
  code: rejection.payload.code === 'attempt-not-ready'
    ? 'bootstrap-not-ready' as const
    : 'bootstrap-rejected' as const,
  message: rejectionMessage(rejection)
});

const prepareDelivery = (
  input: PrepareRecipeEnvironmentInput,
  response: BootstrapResponseMessage,
  ports: CooperativeBootstrapPorts
): Promise<BrokerClientResult<BootstrapExchangeCompletion<PreparedRecipeEnvironment>>> => {
  if (!sameExchange(input.request, response)) {
    return Promise.resolve(clientErr({
      code: 'protocol-mismatch',
      message: 'Bootstrap response correlation is invalid.'
    }));
  }
  if (response.messageKind === 'bootstrap-rejected') {
    return Promise.resolve(clientErr(rejectionIssue(response)));
  }
  const planned = planBootstrapEnvironmentPatch(
    input.request,
    response,
    input.inheritedEnvironmentNames,
    ports.clock.nowMs()
  );
  if (planned.isErr()) return Promise.resolve(clientErr(planned.error[0], ...planned.error.slice(1)));
  const patch = planned.value;
  return ports.environment.installAtomically(patch).then(installed => {
    if (installed.isErr()) return clientErr(installed.error[0], ...installed.error.slice(1));
    const receipt = installed.value;
    const validated = validateInstallReceipt(patch, receipt);
    if (validated.isErr()) {
      return failAfterEnvironmentRollback<BootstrapExchangeCompletion<PreparedRecipeEnvironment>>(
        receipt,
        [validated.error[0], ...validated.error.slice(1)]
      );
    }
    const acknowledgement = createBootstrapAcknowledgement({
      exchangeId: patch.exchangeId,
      leaseId: patch.leaseId,
      processAttemptId: patch.processAttemptId,
      installedSlotIds: patch.slots.map(slot => slot.slotId)
    });
    return acknowledgement.isErr()
      ? failAfterEnvironmentRollback<BootstrapExchangeCompletion<PreparedRecipeEnvironment>>(
          receipt,
          [acknowledgement.error[0], ...acknowledgement.error.slice(1)]
        )
      : clientOk({
          acknowledgement: acknowledgement.value,
          value: preparedEnvironment(input.request, patch),
          cleanup: receipt.cleanup
        });
  });
};

const prepareRecipeEnvironmentExchange = (
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts
): Promise<BrokerClientResult<BootstrapExchangeCompletion<PreparedRecipeEnvironment>>> =>
  ports.transport.exchange(
    input.request,
    response => prepareDelivery(input, response, ports)
  );

const validRetryPolicy = (policy: BootstrapNotReadyRetryPolicy): boolean =>
  Number.isSafeInteger(policy.maximumAttempts) && policy.maximumAttempts > 0 &&
  policy.maximumAttempts <= BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS &&
  Number.isSafeInteger(policy.delayMs) && policy.delayMs > 0 &&
  policy.delayMs <= BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS;

const retryUnavailable = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'transport-unavailable',
  message: 'Bootstrap retry scheduling is unavailable.'
});

const isNotReady = <Value>(result: BrokerClientResult<Value>): boolean =>
  result.isErr() && result.error[0].code === 'bootstrap-not-ready';

const retryNotReady = <Value>(
  operation: () => Promise<BrokerClientResult<Value>>,
  retry: BootstrapNotReadyRetryPort,
  policy: BootstrapNotReadyRetryPolicy,
  attemptNumber: number
): Promise<BrokerClientResult<Value>> => Promise.resolve().then(operation).then(
  result => isNotReady(result) && attemptNumber < policy.maximumAttempts
    ? Promise.resolve().then(() => retry.wait(policy.delayMs)).then(
        () => retryNotReady(operation, retry, policy, attemptNumber + 1),
        () => retryUnavailable<Value>()
      )
    : result,
  () => retryUnavailable<Value>()
);

const prepareRecipeEnvironmentExchangeWithRetry = (
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts,
  retry: BootstrapNotReadyRetryPort,
  policy: BootstrapNotReadyRetryPolicy
): Promise<BrokerClientResult<BootstrapExchangeCompletion<PreparedRecipeEnvironment>>> =>
  validRetryPolicy(policy)
    ? retryNotReady(() => prepareRecipeEnvironmentExchange(input, ports), retry, policy, 1)
    : Promise.resolve(clientErr({
        code: 'invalid-input',
        message: 'Bootstrap not-ready retry policy is invalid.'
      }));

export const prepareRecipeEnvironment = (
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts
): Promise<BrokerClientResult<PreparedRecipeEnvironment>> =>
  prepareRecipeEnvironmentExchange(input, ports).then(result => result.map(completion => completion.value));

export const prepareRecipeEnvironmentWithRetry = (
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts,
  retry: BootstrapNotReadyRetryPort,
  policy: BootstrapNotReadyRetryPolicy
): Promise<BrokerClientResult<PreparedRecipeEnvironment>> =>
  prepareRecipeEnvironmentExchangeWithRetry(input, ports, retry, policy)
    .then(result => result.map(completion => completion.value));

export const createBootstrapNotReadyRetryPort = (): BootstrapNotReadyRetryPort => ({
  wait: delayMs => new Promise(resolve => setTimeout(resolve, delayMs))
});

const loadDeferredApplication = <Module>(
  deferredImport: () => PromiseLike<Module>
): Promise<BrokerClientResult<Module>> => Promise.resolve()
  .then(deferredImport)
  .then(
    application => clientOk(application),
    () => clientErr({
      code: 'application-import-failed',
      message: 'Deferred application import failed after environment preparation.'
    })
  );

export const prepareRecipeEnvironmentThenImport = <Module>(
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts,
  deferredImport: () => PromiseLike<Module>
): Promise<BrokerClientResult<PreparedApplication<Module>>> =>
  prepareRecipeEnvironmentExchange(input, ports).then(prepared => prepared.isErr()
    ? clientErr(prepared.error[0], ...prepared.error.slice(1))
    : loadDeferredApplication(deferredImport).then(application => application.isOk()
      ? clientOk({
          environment: prepared.value.value,
          application: application.value
        })
      : failAfterEnvironmentRollback<PreparedApplication<Module>>(
          {
            atomic: true,
            installedSlots: prepared.value.value.installedSlots,
            cleanup: prepared.value.cleanup
          },
           [application.error[0], ...application.error.slice(1)]
        )));

export const prepareRecipeEnvironmentThenImportWithRetry = <Module>(
  input: PrepareRecipeEnvironmentInput,
  ports: CooperativeBootstrapPorts,
  retry: BootstrapNotReadyRetryPort,
  policy: BootstrapNotReadyRetryPolicy,
  deferredImport: () => PromiseLike<Module>
): Promise<BrokerClientResult<PreparedApplication<Module>>> =>
  prepareRecipeEnvironmentExchangeWithRetry(input, ports, retry, policy).then(prepared => prepared.isErr()
    ? clientErr(prepared.error[0], ...prepared.error.slice(1))
    : loadDeferredApplication(deferredImport).then(application => application.isOk()
      ? clientOk({
          environment: prepared.value.value,
          application: application.value
        })
      : failAfterEnvironmentRollback<PreparedApplication<Module>>(
          {
            atomic: true,
            installedSlots: prepared.value.value.installedSlots,
            cleanup: prepared.value.cleanup
          },
          [application.error[0], ...application.error.slice(1)]
        )));
