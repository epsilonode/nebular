import {
  clientErr,
  clientOk,
  clientTry,
  type BrokerClientResult
} from '../result.ts';

export const BROKER_BOOTSTRAP_PROTOCOL_VERSION = 'epsilonode.bootstrap/v1' as const;
export const BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES = 128 * 1024;
export const BROKER_BOOTSTRAP_MAX_SLOTS = 32;
export const BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS = 16 * 1024;

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

export type BootstrapRejectionCode =
  | 'attempt-mismatch'
  | 'attempt-not-ready'
  | 'authority-denied'
  | 'grant-expired'
  | 'grant-revoked'
  | 'protocol-invalid'
  | 'recipe-drift'
  | 'secret-unavailable'
  | 'slot-not-authorized';

export type BootstrapRejectedMessage = BootstrapEnvelope<'bootstrap-rejected'> & Readonly<{
  payload: Readonly<{ code: BootstrapRejectionCode }>;
}>;

export type BootstrapAcknowledgementMessage = BootstrapEnvelope<'bootstrap-acknowledgement'> & Readonly<{
  payload: Readonly<{
    leaseId: BootstrapLeaseId;
    processAttemptId: BootstrapProcessAttemptId;
    installedSlotIds: readonly BootstrapSlotId[];
    installedSlotCount: number;
  }>;
}>;

export type BootstrapProtocolMessage =
  | BootstrapHelloMessage
  | BootstrapRequestMessage
  | BootstrapDeliveryMessage
  | BootstrapRejectedMessage
  | BootstrapAcknowledgementMessage;

export type BootstrapResponseMessage = BootstrapDeliveryMessage | BootstrapRejectedMessage;

export type CreateBootstrapRequestInput = Readonly<{
  exchangeId: unknown;
  repository: unknown;
  recipeRevision: unknown;
  grantId: unknown;
  grantGeneration: unknown;
  receiverId: unknown;
  processAttemptId: unknown;
  slots: readonly Readonly<{ slotId: unknown; environmentName: unknown }>[];
}>;

export type CreateBootstrapAcknowledgementInput = Readonly<{
  exchangeId: BootstrapExchangeId;
  leaseId: BootstrapLeaseId;
  processAttemptId: BootstrapProcessAttemptId;
  installedSlotIds: readonly BootstrapSlotId[];
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !isUnknownArray(value);

const hasExactKeys = (record: UnknownRecord, expected: readonly string[]): boolean => {
  const actual: readonly string[] = Object.keys(record);
  return actual.length === expected.length && expected.every(key => Object.hasOwn(record, key));
};

const validIdentifier = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);

const validEnvironmentName = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value);

const parseReference = <Kind extends string>(
  kind: Kind,
  value: unknown,
  maximumLength: number,
  validate: (text: string) => boolean = () => true
): BrokerClientResult<BootstrapReference<Kind>> =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength &&
    !value.includes('\0') && validate(value)
    ? clientOk({ kind, value })
    : clientErr({ code: 'invalid-input', message: 'Bootstrap reference is invalid.' });

const parseExchangeId = (value: unknown): BrokerClientResult<BootstrapExchangeId> =>
  parseReference('bootstrap-exchange-id', value, 128, validIdentifier);

const parseRepository = (value: unknown): BrokerClientResult<BootstrapRepository> =>
  parseReference('bootstrap-repository', value, 4096);

const parseRecipeRevision = (value: unknown): BrokerClientResult<BootstrapRecipeRevision> =>
  parseReference('bootstrap-recipe-revision', value, 256);

const parseGrantId = (value: unknown): BrokerClientResult<BootstrapGrantId> =>
  parseReference('bootstrap-grant-id', value, 128, validIdentifier);

const parseReceiverId = (value: unknown): BrokerClientResult<BootstrapReceiverId> =>
  parseReference('bootstrap-receiver-id', value, 128, validIdentifier);

const parseProcessAttemptId = (value: unknown): BrokerClientResult<BootstrapProcessAttemptId> =>
  parseReference('bootstrap-process-attempt-id', value, 128, validIdentifier);

const parseSlotId = (value: unknown): BrokerClientResult<BootstrapSlotId> =>
  parseReference('bootstrap-slot-id', value, 128, validIdentifier);

const parseLeaseId = (value: unknown): BrokerClientResult<BootstrapLeaseId> =>
  parseReference('bootstrap-lease-id', value, 128, validIdentifier);

const parseEnvironmentName = (value: unknown): BrokerClientResult<string> =>
  typeof value === 'string' && validEnvironmentName(value) && !value.includes('\0')
    ? clientOk(value)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap environment name is invalid.' });

const parseGeneration = (value: unknown): BrokerClientResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? clientOk(value)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap grant generation is invalid.' });

const parseExpiresAtMs = (value: unknown): BrokerClientResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? clientOk(value)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap lease expiry is invalid.' });

const traverse = <Input, Output>(
  values: readonly Input[],
  decode: (value: Input, index: number) => BrokerClientResult<Output>
): BrokerClientResult<readonly Output[]> => values.reduce<BrokerClientResult<readonly Output[]>>(
  (decoded, value, index) => decoded.andThen(items => decode(value, index).map(item => append(items, item))),
  clientOk([])
);

const append = <Value>(values: readonly Value[], value: Value): readonly Value[] => [...values, value];

const hasUniqueSlotDeclarations = (slots: readonly BootstrapSlotDeclaration[]): boolean => {
  const slotIds: readonly string[] = slots.map(slot => slot.slotId.value);
  const environmentNames: readonly string[] = slots.map(slot => slot.environmentName.toUpperCase());
  return slotIds.every((value, index) => slotIds.indexOf(value) === index) &&
    environmentNames.every((value, index) => environmentNames.indexOf(value) === index);
};

const decodeSlotDeclaration = (value: unknown): BrokerClientResult<BootstrapSlotDeclaration> => {
  if (!isRecord(value) || !hasExactKeys(value, ['slotId', 'environmentName'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap slot declaration is invalid.' });
  }
  return parseSlotId(value['slotId']).andThen(slotId =>
    parseEnvironmentName(value['environmentName']).map(environmentName => ({ slotId, environmentName }))
  );
};

const decodeSlotDeclarations = (value: unknown): BrokerClientResult<readonly BootstrapSlotDeclaration[]> => {
  if (!isUnknownArray(value) || value.length > BROKER_BOOTSTRAP_MAX_SLOTS) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap slot declarations are invalid.' });
  }
  return traverse(value, decodeSlotDeclaration).andThen(slots => hasUniqueSlotDeclarations(slots)
    ? clientOk(slots)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap slot declarations collide.' }));
};

const createOpaqueSecret = (value: string): OpaqueBootstrapSecret => ({
  withValue: use => use(value)
});

const decodeDeliveredSlot = (value: unknown): BrokerClientResult<BootstrapDeliveredSlot> => {
  if (!isRecord(value) || !hasExactKeys(value, ['slotId', 'environmentName', 'secret'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap secret slot is invalid.' });
  }
  const secret = value['secret'];
  if (typeof secret !== 'string' || secret.length === 0 ||
      secret.length > BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS || secret.includes('\0')) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap secret slot is invalid.' });
  }
  return decodeSlotDeclaration({
    slotId: value['slotId'],
    environmentName: value['environmentName']
  }).map(slot => ({ ...slot, secret: createOpaqueSecret(secret) }));
};

const decodeSecretBundle = (value: unknown): BrokerClientResult<OpaqueBootstrapSecretBundle> => {
  if (!isUnknownArray(value) || value.length > BROKER_BOOTSTRAP_MAX_SLOTS) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap secret bundle is invalid.' });
  }
  return traverse(value, decodeDeliveredSlot).andThen(slots => hasUniqueSlotDeclarations(slots)
    ? clientOk({ slots })
    : clientErr({ code: 'invalid-input', message: 'Bootstrap secret slots collide.' }));
};

const measureConservativeJsonBytes = (
  value: unknown,
  depth: number,
  ancestors: readonly unknown[]
): number | undefined => {
  if (depth > 8) return undefined;
  if (value === null) return 4;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number') return Number.isFinite(value) ? 32 : undefined;
  if (typeof value === 'string') return 2 + value.length * 6;
  if (isUnknownArray(value)) {
    if (value.length > 64 || ancestors.includes(value)) return undefined;
    return value.reduce<number | undefined>((total, item) => {
      if (total === undefined) return undefined;
      const measured = measureConservativeJsonBytes(item, depth + 1, [...ancestors, value]);
      return measured === undefined ? undefined : total + measured + 1;
    }, 2);
  }
  if (!isRecord(value) || ancestors.includes(value)) return undefined;
  const keys: readonly string[] = Object.keys(value);
  if (keys.length > 64) return undefined;
  return keys.reduce<number | undefined>((total, key) => {
    if (total === undefined) return undefined;
    const item = value[key];
    const measured = measureConservativeJsonBytes(item, depth + 1, [...ancestors, value]);
    return measured === undefined ? undefined : total + 3 + key.length * 6 + measured;
  }, 2);
};

const validateWireBudget = (input: unknown): BrokerClientResult<void> => {
  const measured = measureConservativeJsonBytes(input, 0, []);
  return measured !== undefined && measured <= BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES
    ? clientOk(undefined)
    : clientErr({ code: 'message-too-large', message: 'Bootstrap message exceeds its structural or byte budget.' });
};

type DecodedBootstrapEnvelope = Readonly<{
  protocolVersion: typeof BROKER_BOOTSTRAP_PROTOCOL_VERSION;
  exchangeId: BootstrapExchangeId;
}>;

const decodeEnvelope = (
  value: UnknownRecord,
  expectedKind: BootstrapProtocolMessage['messageKind']
): BrokerClientResult<DecodedBootstrapEnvelope> => {
  if (value['protocolVersion'] !== BROKER_BOOTSTRAP_PROTOCOL_VERSION) {
    return clientErr({ code: 'protocol-mismatch', message: 'Bootstrap protocol version is unsupported.' });
  }
  if (value['messageKind'] !== expectedKind) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap message kind is invalid.' });
  }
  return parseExchangeId(value['exchangeId']).map(exchangeId => ({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    exchangeId
  }));
};

const decodeHello = (value: UnknownRecord): BrokerClientResult<BootstrapHelloMessage> => {
  const payload = value['payload'];
  const buildId = isRecord(payload) ? payload['buildId'] : undefined;
  const capabilities = isRecord(payload) ? payload['capabilities'] : undefined;
  if (!hasExactKeys(value, ['protocolVersion', 'messageKind', 'exchangeId', 'payload']) ||
      !isRecord(payload) || !hasExactKeys(payload, ['buildId', 'capabilities']) ||
      typeof buildId !== 'string' || buildId.length === 0 || buildId.length > 128 ||
      !isUnknownArray(capabilities) || capabilities.length !== 2 ||
      !capabilities.includes('atomic-environment-v1') ||
      !capabilities.includes('secret-bundle-v1')) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap hello message is invalid.' });
  }
  return decodeEnvelope(value, 'bootstrap-hello').map(envelope => ({
    ...envelope,
    messageKind: 'bootstrap-hello',
    payload: {
      buildId,
      capabilities: ['atomic-environment-v1', 'secret-bundle-v1']
    }
  }));
};

const decodeAuthority = (value: unknown): BrokerClientResult<BootstrapAuthorityReference> => {
  if (!isRecord(value) || !hasExactKeys(value, ['repository', 'recipeRevision', 'grantId', 'grantGeneration'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap authority reference is invalid.' });
  }
  return parseRepository(value['repository']).andThen(repository =>
    parseRecipeRevision(value['recipeRevision']).andThen(recipeRevision =>
      parseGrantId(value['grantId']).andThen(grantId =>
        parseGeneration(value['grantGeneration']).map(grantGeneration => ({
          repository,
          recipeRevision,
          grantId,
          grantGeneration
        }))
      )
    )
  );
};

const decodeAttempt = (value: unknown): BrokerClientResult<BootstrapAttemptReference> => {
  if (!isRecord(value) || !hasExactKeys(value, ['receiverId', 'processAttemptId'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap attempt reference is invalid.' });
  }
  return parseReceiverId(value['receiverId']).andThen(receiverId =>
    parseProcessAttemptId(value['processAttemptId']).map(processAttemptId => ({ receiverId, processAttemptId }))
  );
};

const requestMessage = (
  envelope: DecodedBootstrapEnvelope,
  authority: BootstrapAuthorityReference,
  attempt: BootstrapAttemptReference,
  slots: readonly BootstrapSlotDeclaration[]
): BootstrapRequestMessage => ({
  ...envelope,
  messageKind: 'bootstrap-request',
  payload: { authority, attempt, slots }
});

const decodeRequest = (value: UnknownRecord): BrokerClientResult<BootstrapRequestMessage> => {
  const payload = value['payload'];
  if (!hasExactKeys(value, ['protocolVersion', 'messageKind', 'exchangeId', 'payload']) ||
      !isRecord(payload) || !hasExactKeys(payload, ['authority', 'attempt', 'slots'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap request message is invalid.' });
  }
  return decodeEnvelope(value, 'bootstrap-request').andThen(envelope =>
    decodeAuthority(payload['authority']).andThen(authority =>
      decodeAttempt(payload['attempt']).andThen(attempt =>
        decodeSlotDeclarations(payload['slots']).map(slots => requestMessage(envelope, authority, attempt, slots))
      )
    )
  );
};

const deliveryMessage = (
  envelope: DecodedBootstrapEnvelope,
  leaseId: BootstrapLeaseId,
  processAttemptId: BootstrapProcessAttemptId,
  expiresAtMs: number,
  secrets: OpaqueBootstrapSecretBundle
): BootstrapDeliveryMessage => ({
  ...envelope,
  messageKind: 'bootstrap-delivery',
  payload: { leaseId, processAttemptId, expiresAtMs, secrets }
});

const decodeDelivery = (value: UnknownRecord): BrokerClientResult<BootstrapDeliveryMessage> => {
  const payload = value['payload'];
  if (!hasExactKeys(value, ['protocolVersion', 'messageKind', 'exchangeId', 'payload']) ||
      !isRecord(payload) || !hasExactKeys(payload, ['leaseId', 'processAttemptId', 'expiresAtMs', 'slots'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap delivery message is invalid.' });
  }
  return decodeEnvelope(value, 'bootstrap-delivery').andThen(envelope =>
    parseLeaseId(payload['leaseId']).andThen(leaseId =>
      parseProcessAttemptId(payload['processAttemptId']).andThen(processAttemptId =>
        parseExpiresAtMs(payload['expiresAtMs']).andThen(expiresAtMs =>
          decodeSecretBundle(payload['slots']).map(secrets =>
            deliveryMessage(envelope, leaseId, processAttemptId, expiresAtMs, secrets))
        )
      )
    )
  );
};

const rejectionCodes: readonly BootstrapRejectionCode[] = [
  'attempt-mismatch',
  'attempt-not-ready',
  'authority-denied',
  'grant-expired',
  'grant-revoked',
  'protocol-invalid',
  'recipe-drift',
  'secret-unavailable',
  'slot-not-authorized'
];

const isRejectionCode = (value: unknown): value is BootstrapRejectionCode =>
  typeof value === 'string' && rejectionCodes.some(code => code === value);

const rejectedMessage = (
  envelope: DecodedBootstrapEnvelope,
  code: BootstrapRejectionCode
): BootstrapRejectedMessage => ({
  ...envelope,
  messageKind: 'bootstrap-rejected',
  payload: { code }
});

const decodeRejected = (value: UnknownRecord): BrokerClientResult<BootstrapRejectedMessage> => {
  const payload = value['payload'];
  if (!hasExactKeys(value, ['protocolVersion', 'messageKind', 'exchangeId', 'payload']) ||
      !isRecord(payload) || !hasExactKeys(payload, ['code'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap rejection message is invalid.' });
  }
  const code = payload['code'];
  return isRejectionCode(code)
    ? decodeEnvelope(value, 'bootstrap-rejected').map(envelope => rejectedMessage(envelope, code))
    : clientErr({ code: 'invalid-input', message: 'Bootstrap rejection code is invalid.' });
};

const acknowledgementMessage = (
  envelope: DecodedBootstrapEnvelope,
  leaseId: BootstrapLeaseId,
  processAttemptId: BootstrapProcessAttemptId,
  installedSlotIds: readonly BootstrapSlotId[]
): BootstrapAcknowledgementMessage => ({
  ...envelope,
  messageKind: 'bootstrap-acknowledgement',
  payload: {
    leaseId,
    processAttemptId,
    installedSlotIds,
    installedSlotCount: installedSlotIds.length
  }
});

const decodeAcknowledgement = (value: UnknownRecord): BrokerClientResult<BootstrapAcknowledgementMessage> => {
  const payload = value['payload'];
  if (!hasExactKeys(value, ['protocolVersion', 'messageKind', 'exchangeId', 'payload']) ||
      !isRecord(payload) ||
      !hasExactKeys(payload, ['leaseId', 'processAttemptId', 'installedSlotIds', 'installedSlotCount'])) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap acknowledgement message is invalid.' });
  }
  const rawInstalledSlotIds = payload['installedSlotIds'];
  const installedSlotCount = payload['installedSlotCount'];
  if (!isUnknownArray(rawInstalledSlotIds) || rawInstalledSlotIds.length > BROKER_BOOTSTRAP_MAX_SLOTS ||
      typeof installedSlotCount !== 'number' || installedSlotCount !== rawInstalledSlotIds.length) {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap acknowledgement slots are invalid.' });
  }
  return decodeEnvelope(value, 'bootstrap-acknowledgement').andThen(envelope =>
    parseLeaseId(payload['leaseId']).andThen(leaseId =>
      parseProcessAttemptId(payload['processAttemptId']).andThen(processAttemptId =>
        traverse(rawInstalledSlotIds, parseSlotId).andThen(installedSlotIds => {
          const unique = installedSlotIds.every((slot, index) =>
            installedSlotIds.findIndex(candidate => candidate.value === slot.value) === index);
          return unique
            ? clientOk(acknowledgementMessage(envelope, leaseId, processAttemptId, installedSlotIds))
            : clientErr({ code: 'invalid-input', message: 'Bootstrap acknowledgement slots collide.' });
        })
      )
    )
  );
};

const decodeMeasuredMessage = (input: unknown): BrokerClientResult<BootstrapProtocolMessage> => {
  if (!isRecord(input) || typeof input['messageKind'] !== 'string') {
    return clientErr({ code: 'invalid-input', message: 'Bootstrap message is invalid.' });
  }
  switch (input['messageKind']) {
    case 'bootstrap-hello': return decodeHello(input);
    case 'bootstrap-request': return decodeRequest(input);
    case 'bootstrap-delivery': return decodeDelivery(input);
    case 'bootstrap-rejected': return decodeRejected(input);
    case 'bootstrap-acknowledgement': return decodeAcknowledgement(input);
    default: return clientErr({ code: 'invalid-input', message: 'Bootstrap message kind is unsupported.' });
  }
};

export const decodeBootstrapProtocolMessage = (input: unknown): BrokerClientResult<BootstrapProtocolMessage> =>
  clientTry(
    () => validateWireBudget(input).andThen(() => decodeMeasuredMessage(input)),
    { code: 'invalid-input', message: 'Bootstrap message could not be inspected safely.' }
  ).andThen(result => result);

export const decodeBootstrapProtocolJson = (json: string): BrokerClientResult<BootstrapProtocolMessage> =>
  new TextEncoder().encode(json).byteLength > BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES
    ? clientErr({ code: 'message-too-large', message: 'Bootstrap message exceeds its byte budget.' })
    : clientTry(
        (): unknown => JSON.parse(json),
        { code: 'invalid-input', message: 'Bootstrap message is not valid JSON.' }
      ).andThen(decodeBootstrapProtocolMessage);

export const createBootstrapRequest = (
  input: CreateBootstrapRequestInput
): BrokerClientResult<BootstrapRequestMessage> =>
  decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-request',
    exchangeId: input.exchangeId,
    payload: {
      authority: {
        repository: input.repository,
        recipeRevision: input.recipeRevision,
        grantId: input.grantId,
        grantGeneration: input.grantGeneration
      },
      attempt: {
        receiverId: input.receiverId,
        processAttemptId: input.processAttemptId
      },
      slots: input.slots
    }
  }).andThen(message => message.messageKind === 'bootstrap-request'
    ? clientOk(message)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap request construction produced an invalid kind.' }));

export const createBootstrapAcknowledgement = (
  input: CreateBootstrapAcknowledgementInput
): BrokerClientResult<BootstrapAcknowledgementMessage> =>
  decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-acknowledgement',
    exchangeId: input.exchangeId.value,
    payload: {
      leaseId: input.leaseId.value,
      processAttemptId: input.processAttemptId.value,
      installedSlotIds: input.installedSlotIds.map(slot => slot.value),
      installedSlotCount: input.installedSlotIds.length
    }
  }).andThen(message => message.messageKind === 'bootstrap-acknowledgement'
    ? clientOk(message)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap acknowledgement construction produced an invalid kind.' }));

export const isBootstrapResponseMessage = (
  message: BootstrapProtocolMessage
): message is BootstrapResponseMessage =>
  message.messageKind === 'bootstrap-delivery' || message.messageKind === 'bootstrap-rejected';
