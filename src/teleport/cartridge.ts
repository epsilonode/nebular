import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import {
  collectTeleportCarChunks,
  createTeleportBlockCid,
  createTeleportCarChunkStream,
  decodeTeleportManifestBytes,
  digestTeleportBlockBytes,
  encodeTeleportManifestBytes,
  measureTeleportCarBytes,
  readTeleportCarBytes,
  writeTeleportCarChunks,
  type TeleportCarRuntimeBlock
} from './cartridge-runtime-adapter';
import { teleportCodecFromRegistry, type TeleportCodecRegistry } from './codec';
import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import {
  DEFAULT_CARTRIDGE_LIMITS,
  type EncodedCapabilityBlock,
  type TeleportCapabilityDependency,
  type TeleportCapabilityDescriptor,
  type TeleportCapabilityProtection,
  type TeleportCartridgeLimits,
  type TeleportCartridgeManifestV1,
  type TeleportKeyEnvelopeBlock,
  type TeleportKeyEnvelopeDescriptor,
  type TeleportRestoreMode,
  type TeleportSecurityClass,
  type TeleportSignatureBlock,
  type TeleportSignatureDescriptor
} from './types';

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]);

const isCapabilityId = (value: string): boolean =>
  /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value);

const isInstanceId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const dependencyKey = (dependency: TeleportCapabilityDependency): string =>
  `${dependency.kind}\u0000${dependency.capabilityId}\u0000${dependency.instanceId ?? ''}\u0000${dependency.required ? '1' : '0'}`;

const dependencyIdentityKey = (dependency: TeleportCapabilityDependency): string =>
  `${dependency.kind}\u0000${dependency.capabilityId}\u0000${dependency.instanceId ?? ''}`;

const isOrdered = <T extends object>(
  values: readonly T[],
  key: (value: T) => string
): boolean => values.every((value, index) => {
  const previous = values.at(index - 1);
  return index === 0 || previous === undefined || compareText(key(previous), key(value)) <= 0;
});

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const hasDuplicates = (values: readonly string[]): boolean =>
  values.some((value, index) => values.indexOf(value) !== index);

const strictObject = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual: readonly string[] = Object.keys(value).toSorted();
  const expected: readonly string[] = keys.toSorted();
  return actual.length === expected.length && actual.every(
    (key, index) => key === expected[index]
  );
};

const isSecurityClass = (value: unknown): value is TeleportSecurityClass =>
  value === 'public' || value === 'private' || value === 'secret' || value === 'opaque-native';

const isRestoreMode = (value: unknown): value is TeleportRestoreMode =>
  value === 'merge' || value === 'replace' || value === 'rebase' || value === 'exact-replay' || value === 'retain';

const isDependencyKind = (value: unknown): value is TeleportCapabilityDependency['kind'] =>
  value === 'hard-decode' || value === 'restore-order' || value === 'optional-enhancement' || value === 'application-availability';

const parseDependency = (value: unknown): TeleportCapabilityDependency | undefined => {
  const keys: readonly string[] = typeof value === 'object' && value !== null && 'instanceId' in value
    ? ['capabilityId', 'instanceId', 'kind', 'required']
    : ['capabilityId', 'kind', 'required'];
  if (!strictObject(value, keys)) return undefined;
  const capabilityId = value['capabilityId'];
  const required = value['required'];
  const kind = value['kind'];
  const instanceId = value['instanceId'];
  if (
    typeof capabilityId !== 'string' ||
    typeof required !== 'boolean' ||
    !isDependencyKind(kind) ||
    (instanceId !== undefined && typeof instanceId !== 'string')
  ) return undefined;
  return {
    capabilityId,
    required,
    kind,
    ...(typeof instanceId === 'string' ? { instanceId } : {})
  };
};

const parseProtection = (value: unknown): TeleportCapabilityProtection | undefined => {
  if (strictObject(value, ['mode']) && value['mode'] === 'plain') return { mode: 'plain' };
  if (
    !strictObject(value, ['iv', 'keyEnvelopeId', 'keyId', 'mode', 'plaintextCid']) ||
    value['mode'] !== 'aes-256-gcm-v1'
  ) return undefined;
  const keyEnvelopeId = value['keyEnvelopeId'];
  const keyId = value['keyId'];
  const iv = value['iv'];
  const plaintextCid = CID.asCID(value['plaintextCid']) ?? undefined;
  return typeof keyEnvelopeId === 'string' &&
    typeof keyId === 'string' &&
    iv instanceof Uint8Array &&
    iv.byteLength === 12 &&
    plaintextCid !== undefined
    ? { mode: 'aes-256-gcm-v1', keyEnvelopeId, keyId, iv, plaintextCid }
    : undefined;
};

const parsePassphraseKeyEnvelope = (
  value: Readonly<Record<string, unknown>>
): TeleportKeyEnvelopeDescriptor | undefined => {
  const id = value['id'];
  const block = CID.asCID(value['block']) ?? undefined;
  const salt = value['salt'];
  const iv = value['iv'];
  return typeof id === 'string' &&
    value['mode'] === 'pbkdf2-aes-256-gcm-v1' &&
    block !== undefined &&
    block.code === raw.code &&
    salt instanceof Uint8Array &&
    salt.byteLength === 16 &&
    iv instanceof Uint8Array &&
    iv.byteLength === 12 &&
    value['iterations'] === 310_000 &&
    value['hash'] === 'SHA-256'
    ? {
      id,
      mode: 'pbkdf2-aes-256-gcm-v1',
      block,
      salt,
      iv,
      iterations: 310_000,
      hash: 'SHA-256'
    }
    : undefined;
};

const parseRecipientKeyEnvelope = (
  value: Readonly<Record<string, unknown>>
): TeleportKeyEnvelopeDescriptor | undefined => {
  const id = value['id'];
  const recipientKeyId = value['recipientKeyId'];
  const block = CID.asCID(value['block']) ?? undefined;
  const iv = value['iv'];
  return typeof id === 'string' &&
    value['mode'] === 'rsa-oaep-aes-256-gcm-v1' &&
    typeof recipientKeyId === 'string' &&
    recipientKeyId.length > 0 &&
    block !== undefined &&
    block.code === raw.code &&
    iv instanceof Uint8Array &&
    iv.byteLength === 12 &&
    value['hash'] === 'SHA-256'
    ? {
      id,
      mode: 'rsa-oaep-aes-256-gcm-v1',
      block,
      recipientKeyId,
      iv,
      hash: 'SHA-256'
    }
    : undefined;
};

const parseKeyEnvelope = (value: unknown): TeleportKeyEnvelopeDescriptor | undefined =>
  strictObject(value, ['block', 'hash', 'id', 'iterations', 'iv', 'mode', 'salt'])
    ? parsePassphraseKeyEnvelope(value)
    : strictObject(value, ['block', 'hash', 'id', 'iv', 'mode', 'recipientKeyId'])
      ? parseRecipientKeyEnvelope(value)
      : undefined;

const parseSignature = (value: unknown): TeleportSignatureDescriptor | undefined => {
  if (!strictObject(value, ['block', 'id', 'mode', 'signedPayload', 'signerKeyId'])) return undefined;
  const id = value['id'];
  const signerKeyId = value['signerKeyId'];
  const signedPayload = CID.asCID(value['signedPayload']) ?? undefined;
  const block = CID.asCID(value['block']) ?? undefined;
  return typeof id === 'string' &&
    id.length > 0 &&
    value['mode'] === 'ed25519-v1' &&
    typeof signerKeyId === 'string' &&
    signerKeyId.length > 0 &&
    signedPayload !== undefined &&
    signedPayload.code === dagCbor.code &&
    block !== undefined &&
    block.code === raw.code
    ? { id, mode: 'ed25519-v1', signerKeyId, signedPayload, block }
    : undefined;
};

const parseDescriptor = (value: unknown): TeleportCapabilityDescriptor | undefined => {
  if (!strictObject(value, [
    'block',
    'capabilityId',
    'codec',
    'dependencies',
    'instanceId',
    'protection',
    'required',
    'restoreMode',
    'schemaVersion',
    'securityClass'
  ])) return undefined;
  const capabilityId = value['capabilityId'];
  const instanceId = value['instanceId'];
  const schemaVersion = value['schemaVersion'];
  const securityClass = value['securityClass'];
  const required = value['required'];
  const restoreMode = value['restoreMode'];
  const codec = value['codec'];
  const block = CID.asCID(value['block']) ?? undefined;
  const rawDependencies = value['dependencies'];
  const protection = parseProtection(value['protection']);
  if (
    typeof capabilityId !== 'string' ||
    !isCapabilityId(capabilityId) ||
    typeof instanceId !== 'string' ||
    !isInstanceId(instanceId) ||
    !Number.isInteger(schemaVersion) ||
    Number(schemaVersion) < 1 ||
    !isSecurityClass(securityClass) ||
    typeof required !== 'boolean' ||
    !isRestoreMode(restoreMode) ||
    (codec !== 'dag-cbor' && codec !== 'raw') ||
    block === undefined ||
    !Array.isArray(rawDependencies) ||
    protection === undefined
  ) return undefined;
  const dependencies: readonly (TeleportCapabilityDependency | undefined)[] = rawDependencies.map(parseDependency);
  return dependencies.every(isDefined)
    ? {
      capabilityId,
      instanceId,
      schemaVersion: Number(schemaVersion),
      securityClass,
      required,
      restoreMode,
      codec,
      block,
      dependencies,
      protection
    }
    : undefined;
};

const dependencyTargets = (
  descriptors: readonly TeleportCapabilityDescriptor[],
  dependency: TeleportCapabilityDependency
): readonly TeleportCapabilityDescriptor[] => dependency.instanceId === undefined
  ? descriptors.filter(candidate => candidate.capabilityId === dependency.capabilityId)
  : descriptors.filter(candidate =>
    candidate.instanceId === dependency.instanceId &&
    candidate.capabilityId === dependency.capabilityId
  );

const dependencyIssue = (
  descriptors: readonly TeleportCapabilityDescriptor[],
  descriptor: TeleportCapabilityDescriptor
): TeleportIssue | undefined => {
  const invalid = descriptor.dependencies.find(dependency =>
    !isCapabilityId(dependency.capabilityId) ||
    (dependency.instanceId !== undefined && !isInstanceId(dependency.instanceId))
  );
  if (invalid !== undefined) return {
    code: 'dependency-invalid',
    message: 'Capability dependency identity is invalid.',
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  };
  if (hasDuplicates(descriptor.dependencies.map(dependencyIdentityKey))) return {
    code: 'dependency-invalid',
    message: 'Capability descriptor contains a duplicate dependency.',
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  };
  const missing = descriptor.dependencies.find(dependency =>
    dependency.required && dependencyTargets(descriptors, dependency).length === 0
  );
  if (missing === undefined) return undefined;
  return {
    code: 'dependency-invalid',
    message: missing.instanceId === undefined
      ? 'Required capability dependency is missing.'
      : 'Required capability dependency target is missing or has the wrong capability id.',
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  };
};

const hardDependencyTargets = (
  descriptors: readonly TeleportCapabilityDescriptor[],
  instanceId: string
): readonly string[] => descriptors
  .filter(descriptor => descriptor.instanceId === instanceId)
  .flatMap((descriptor): readonly string[] => descriptor.dependencies
    .filter(dependency => dependency.kind === 'hard-decode' || dependency.kind === 'restore-order')
    .flatMap((dependency): readonly string[] =>
      dependencyTargets(descriptors, dependency).map(target => target.instanceId)
    )
  );

const hasDependencyCycleFrom = (
  descriptors: readonly TeleportCapabilityDescriptor[],
  instanceId: string,
  path: readonly string[] = []
): boolean => path.includes(instanceId) || hardDependencyTargets(descriptors, instanceId).some(
  target => hasDependencyCycleFrom(descriptors, target, [...path, instanceId])
);

const validateCapabilityGraph = (
  descriptors: readonly TeleportCapabilityDescriptor[]
): TeleportResult<void> => {
  const issue = descriptors.map(
    descriptor => dependencyIssue(descriptors, descriptor)
  ).find(isDefined);
  if (issue !== undefined) return err(issue);
  const cyclic = descriptors.find(
    descriptor => hasDependencyCycleFrom(descriptors, descriptor.instanceId)
  );
  return cyclic === undefined
    ? ok(undefined)
    : err({
      code: 'dependency-invalid',
      message: 'Capability dependency graph contains a cycle.',
      capabilityId: cyclic.capabilityId,
      instanceId: cyclic.instanceId
    });
};

const parseManifest = (
  value: unknown,
  limits: TeleportCartridgeLimits
): TeleportResult<TeleportCartridgeManifestV1> => {
  const keys: readonly string[] = [
    'capabilities',
    'keyEnvelopes',
    'type',
    'version',
    ...(typeof value === 'object' && value !== null && 'createdAt' in value ? ['createdAt'] : []),
    ...(typeof value === 'object' && value !== null && 'signatures' in value ? ['signatures'] : [])
  ];
  if (
    !strictObject(value, keys) ||
    value['type'] !== 'wx-teleport-cartridge' ||
    value['version'] !== 1 ||
    !Array.isArray(value['capabilities']) ||
    !Array.isArray(value['keyEnvelopes'])
  ) return err({ code: 'manifest-invalid', message: 'Teleport cartridge manifest is invalid.' });
  const rawCapabilities: readonly unknown[] = value['capabilities'];
  const rawKeyEnvelopes: readonly unknown[] = value['keyEnvelopes'];
  const createdAt = value['createdAt'];
  const rawSignatures = value['signatures'];
  if (rawCapabilities.length > limits.maxCapabilities) return err({
    code: 'budget-exceeded',
    message: 'Teleport cartridge has too many capabilities.'
  });
  if (createdAt !== undefined && typeof createdAt !== 'string') return err({
    code: 'manifest-invalid',
    message: 'Teleport cartridge creation time is invalid.'
  });
  const capabilities: readonly (TeleportCapabilityDescriptor | undefined)[] = rawCapabilities.map(parseDescriptor);
  if (!capabilities.every(isDefined)) return err({
    code: 'manifest-invalid',
    message: 'Teleport capability descriptor is invalid.'
  });
  const keyEnvelopes: readonly (TeleportKeyEnvelopeDescriptor | undefined)[] = rawKeyEnvelopes.map(parseKeyEnvelope);
  if (!keyEnvelopes.every(isDefined)) return err({
    code: 'manifest-invalid',
    message: 'Teleport key envelope descriptor is invalid.'
  });
  const signatures: readonly (TeleportSignatureDescriptor | undefined)[] = Array.isArray(rawSignatures)
    ? rawSignatures.map(parseSignature)
    : [];
  if (!signatures.every(isDefined)) return err({
    code: 'manifest-invalid',
    message: 'Teleport signature descriptor is invalid.'
  });
  if (
    !isOrdered(capabilities, entry => entry.instanceId) ||
    capabilities.some(entry => !isOrdered(entry.dependencies, dependencyKey))
  ) return err({
    code: 'manifest-invalid',
    message: 'Teleport capabilities and dependencies must use canonical ordering.'
  });
  if (!isOrdered(keyEnvelopes, entry => entry.id) || !isOrdered(signatures, entry => entry.id)) return err({
    code: 'manifest-invalid',
    message: 'Teleport envelopes and signatures must use canonical ordering.'
  });
  if (hasDuplicates(signatures.map(entry => entry.id))) return err({
    code: 'manifest-invalid',
    message: 'Teleport signature ids must be unique.'
  });
  const envelopeIds: readonly string[] = keyEnvelopes.map(entry => entry.id);
  if (hasDuplicates(envelopeIds)) return err({
    code: 'manifest-invalid',
    message: 'Teleport key envelope ids must be unique.'
  });
  if (capabilities.some(
    entry => entry.protection.mode !== 'plain' && !envelopeIds.includes(entry.protection.keyEnvelopeId)
  )) return err({
    code: 'manifest-invalid',
    message: 'Protected capability references a missing key envelope.'
  });
  if (hasDuplicates(capabilities.map(entry => entry.instanceId))) return err({
    code: 'manifest-invalid',
    message: 'Teleport capability instance ids must be unique.'
  });
  const graph = validateCapabilityGraph(capabilities);
  return graph.ok
    ? ok({
      type: 'wx-teleport-cartridge',
      version: 1,
      ...(typeof createdAt === 'string' ? { createdAt } : {}),
      capabilities,
      keyEnvelopes,
      signatures
    })
    : graph;
};

export interface CreateTeleportCartridgeInput {
  readonly capabilities: readonly EncodedCapabilityBlock[];
  readonly keyEnvelopes?: readonly TeleportKeyEnvelopeBlock[];
  readonly signatures?: readonly TeleportSignatureBlock[];
  readonly createdAt?: string;
  readonly limits?: Partial<TeleportCartridgeLimits>;
}

export interface TeleportCartridgeArchive {
  readonly bytes: Uint8Array;
  readonly root: CID;
  readonly rootBytes: Uint8Array;
  readonly manifest: TeleportCartridgeManifestV1;
}

export interface TeleportCartridgeStreamArchive extends Omit<TeleportCartridgeArchive, 'bytes'> {
  readonly chunks: AsyncIterable<Uint8Array>;
}

export interface TeleportCartridgeChunkSink {
  readonly write: (chunk: Uint8Array) => Promise<void>;
}

interface PreparedTeleportCartridge {
  readonly capabilities: readonly EncodedCapabilityBlock[];
  readonly keyEnvelopes: readonly TeleportKeyEnvelopeBlock[];
  readonly signatures: readonly TeleportSignatureBlock[];
  readonly limits: TeleportCartridgeLimits;
  readonly manifest: TeleportCartridgeManifestV1;
  readonly manifestBytes: Uint8Array;
  readonly root: CID;
}

const limitsFor = (overrides?: Partial<TeleportCartridgeLimits>): TeleportCartridgeLimits => ({
  ...DEFAULT_CARTRIDGE_LIMITS,
  ...overrides
});

const validateBlockIdentity = async (
  cid: CID,
  bytes: Uint8Array,
  expectedCodec: number,
  limits: TeleportCartridgeLimits,
  label: string
): Promise<TeleportResult<void>> => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limits.maxBlockBytes) return err({
    code: 'budget-exceeded',
    message: `${label} exceeds its byte budget.`
  });
  if (cid.code !== expectedCodec || cid.multihash.code !== sha256.code) return err({
    code: 'cid-mismatch',
    message: `${label} CID uses an unexpected codec or hash.`
  });
  const digest = await digestTeleportBlockBytes(bytes);
  return !digest.ok
    ? digest
    : equalBytes(digest.value, cid.multihash.bytes)
      ? ok(undefined)
      : err({ code: 'cid-mismatch', message: `${label} bytes do not match their CID.` });
};

const validateSequentially = <T>(
  values: readonly T[],
  validate: (value: T) => Promise<TeleportResult<void>>
): Promise<TeleportResult<void>> => values.reduce<Promise<TeleportResult<void>>>(
  (pending, value) => pending.then(result => result.ok ? validate(value) : result),
  Promise.resolve(ok(undefined))
);

const validateCapabilityBlock = (
  capability: EncodedCapabilityBlock,
  limits: TeleportCartridgeLimits
): Promise<TeleportResult<void>> => {
  const expectedStoredCodec = capability.protection?.mode === 'aes-256-gcm-v1'
    ? raw.code
    : capability.codec === 'dag-cbor' ? dagCbor.code : raw.code;
  return validateBlockIdentity(
    capability.cid,
    capability.bytes,
    expectedStoredCodec,
    limits,
    `Capability ${capability.instanceId}`
  ).then(result => {
    if (!result.ok || capability.protection?.mode !== 'aes-256-gcm-v1') return result;
    const expectedPlaintextCodec = capability.codec === 'dag-cbor' ? dagCbor.code : raw.code;
    return capability.protection.plaintextCid.code === expectedPlaintextCodec &&
      capability.protection.plaintextCid.multihash.code === sha256.code
      ? ok(undefined)
      : err({
        code: 'cid-mismatch',
        message: `Protected capability ${capability.instanceId} has an invalid plaintext CID.`,
        capabilityId: capability.capabilityId,
        instanceId: capability.instanceId
      });
  });
};

const prepareTeleportCartridge = async (
  input: CreateTeleportCartridgeInput
): Promise<TeleportResult<PreparedTeleportCartridge>> => {
  const limits = limitsFor(input.limits);
  if (input.capabilities.length > limits.maxCapabilities) return err({
    code: 'budget-exceeded',
    message: 'Teleport cartridge has too many capabilities.'
  });
  if (hasDuplicates(input.capabilities.map(entry => entry.instanceId))) return err({
    code: 'manifest-invalid',
    message: 'Teleport capability instance ids must be unique.'
  });
  const capabilities: readonly EncodedCapabilityBlock[] = input.capabilities.toSorted(
    (left, right) => compareText(left.instanceId, right.instanceId)
  );
  const keyEnvelopes: readonly TeleportKeyEnvelopeBlock[] = (input.keyEnvelopes ?? []).toSorted(
    (left, right) => compareText(left.descriptor.id, right.descriptor.id)
  );
  const signatures: readonly TeleportSignatureBlock[] = (input.signatures ?? []).toSorted(
    (left, right) => compareText(left.descriptor.id, right.descriptor.id)
  );
  const capabilitiesValid = await validateSequentially(
    capabilities,
    capability => validateCapabilityBlock(capability, limits)
  );
  if (!capabilitiesValid.ok) return capabilitiesValid;
  const envelopesValid = await validateSequentially(
    keyEnvelopes,
    envelope => validateBlockIdentity(
      envelope.descriptor.block,
      envelope.bytes,
      raw.code,
      limits,
      `Key envelope ${envelope.descriptor.id}`
    )
  );
  if (!envelopesValid.ok) return envelopesValid;
  const signaturesValid = await validateSequentially(
    signatures,
    signature => validateBlockIdentity(
      signature.descriptor.block,
      signature.bytes,
      raw.code,
      limits,
      `Signature ${signature.descriptor.id}`
    )
  );
  if (!signaturesValid.ok) return signaturesValid;
  const manifest: TeleportCartridgeManifestV1 = {
    type: 'wx-teleport-cartridge',
    version: 1,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    keyEnvelopes: keyEnvelopes.map(entry => entry.descriptor),
    signatures: signatures.map(entry => entry.descriptor),
    capabilities: capabilities.map(entry => ({
      capabilityId: entry.capabilityId,
      instanceId: entry.instanceId,
      schemaVersion: entry.schemaVersion,
      securityClass: entry.securityClass,
      required: entry.required,
      restoreMode: entry.restoreMode,
      codec: entry.codec,
      block: entry.cid,
      protection: entry.protection ?? { mode: 'plain' },
      dependencies: entry.dependencies.toSorted(
        (left, right) => compareText(dependencyKey(left), dependencyKey(right))
      )
    }))
  };
  const validated = parseManifest(manifest, limits);
  if (!validated.ok) return validated;
  const manifestBytes = await encodeTeleportManifestBytes(manifest);
  if (!manifestBytes.ok) return manifestBytes;
  if (manifestBytes.value.byteLength > limits.maxManifestBytes) return err({
    code: 'budget-exceeded',
    message: 'Teleport manifest exceeds its byte budget.'
  });
  const root = await createTeleportBlockCid(dagCbor.code, manifestBytes.value);
  return root.ok
    ? ok({
      capabilities,
      keyEnvelopes,
      signatures,
      limits,
      manifest,
      manifestBytes: manifestBytes.value,
      root: root.value
    })
    : root;
};

const uniqueBlocks = (
  blocks: readonly TeleportCarRuntimeBlock[]
): readonly TeleportCarRuntimeBlock[] => blocks.filter(
  (block, index) => blocks.findIndex(candidate => candidate.cid.equals(block.cid)) === index
);

const blocksForPreparedCartridge = (
  prepared: PreparedTeleportCartridge
): readonly TeleportCarRuntimeBlock[] => uniqueBlocks([
  { cid: prepared.root, bytes: prepared.manifestBytes },
  ...prepared.capabilities.map(capability => ({ cid: capability.cid, bytes: capability.bytes })),
  ...prepared.keyEnvelopes.map(envelope => ({ cid: envelope.descriptor.block, bytes: envelope.bytes })),
  ...prepared.signatures.map(signature => ({ cid: signature.descriptor.block, bytes: signature.bytes }))
]);

export const streamTeleportCartridge = async (
  input: CreateTeleportCartridgeInput
): Promise<TeleportResult<TeleportCartridgeStreamArchive>> => {
  const prepared = await prepareTeleportCartridge(input);
  if (!prepared.ok) return prepared;
  const blocks: readonly TeleportCarRuntimeBlock[] = blocksForPreparedCartridge(prepared.value);
  const measured = await measureTeleportCarBytes(prepared.value.root, blocks);
  if (!measured.ok) return measured;
  if (measured.value > prepared.value.limits.maxCarBytes) return err({
    code: 'budget-exceeded',
    message: 'Teleport cartridge exceeds its byte budget.'
  });
  const chunks = await createTeleportCarChunkStream(prepared.value.root, blocks);
  return chunks.ok
    ? ok({
      chunks: chunks.value,
      root: prepared.value.root,
      rootBytes: prepared.value.manifestBytes,
      manifest: prepared.value.manifest
    })
    : chunks;
};

export const writeTeleportCartridge = async (
  input: CreateTeleportCartridgeInput,
  sink: TeleportCartridgeChunkSink
): Promise<TeleportResult<Omit<TeleportCartridgeArchive, 'bytes'>>> => {
  const streamed = await streamTeleportCartridge(input);
  if (!streamed.ok) return streamed;
  const written = await writeTeleportCarChunks(streamed.value.chunks, sink);
  return written.ok
    ? ok({
      root: streamed.value.root,
      rootBytes: streamed.value.rootBytes,
      manifest: streamed.value.manifest
    })
    : written;
};

export const createTeleportCartridge = async (
  input: CreateTeleportCartridgeInput
): Promise<TeleportResult<TeleportCartridgeArchive>> => {
  const streamed = await streamTeleportCartridge(input);
  if (!streamed.ok) return streamed;
  const bytes = await collectTeleportCarChunks(
    streamed.value.chunks,
    limitsFor(input.limits).maxCarBytes
  );
  return bytes.ok
    ? ok({
      root: streamed.value.root,
      rootBytes: streamed.value.rootBytes,
      manifest: streamed.value.manifest,
      bytes: bytes.value
    })
    : bytes;
};

export interface VerifiedCapability {
  readonly descriptor: TeleportCapabilityDescriptor;
  readonly storedBytes: Uint8Array;
  readonly contentBytes?: Uint8Array;
}

export interface VerifiedKeyEnvelope {
  readonly descriptor: TeleportKeyEnvelopeDescriptor;
  readonly bytes: Uint8Array;
}

export interface VerifiedSignature {
  readonly descriptor: TeleportSignatureDescriptor;
  readonly bytes: Uint8Array;
}

export interface VerifiedTeleportCartridge {
  readonly root: CID;
  readonly rootBytes: Uint8Array;
  readonly manifest: TeleportCartridgeManifestV1;
  readonly capabilities: readonly VerifiedCapability[];
  readonly keyEnvelopes: readonly VerifiedKeyEnvelope[];
  readonly signatures: readonly VerifiedSignature[];
}

const validateReadBlock = (
  block: TeleportCarRuntimeBlock,
  limits: TeleportCartridgeLimits
): Promise<TeleportResult<void>> => block.bytes.byteLength > limits.maxBlockBytes
  ? Promise.resolve(err({ code: 'budget-exceeded', message: 'Teleport block exceeds its byte budget.' }))
  : block.cid.multihash.code !== sha256.code
    ? Promise.resolve(err({ code: 'cid-mismatch', message: 'Teleport blocks must use SHA-256.' }))
    : digestTeleportBlockBytes(block.bytes).then(digest =>
      !digest.ok
        ? digest
        : equalBytes(digest.value, block.cid.multihash.bytes)
          ? ok(undefined)
          : err({ code: 'cid-mismatch', message: 'Teleport block bytes do not match their CID.' })
    );

const blockFrom = (
  blocks: readonly TeleportCarRuntimeBlock[],
  cid: CID
): TeleportCarRuntimeBlock | undefined => blocks.find(block => block.cid.equals(cid));

const verifyCapabilityDescriptor = (
  blocks: readonly TeleportCarRuntimeBlock[],
  descriptor: TeleportCapabilityDescriptor
): TeleportResult<VerifiedCapability> => {
  const block = blockFrom(blocks, descriptor.block);
  if (block === undefined) return err({
    code: 'missing-block',
    message: `Capability block ${descriptor.block.toString()} is missing.`,
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  });
  const expectedCode = descriptor.protection.mode === 'plain'
    ? descriptor.codec === 'dag-cbor' ? dagCbor.code : raw.code
    : raw.code;
  return block.cid.code === expectedCode
    ? ok({
      descriptor,
      storedBytes: block.bytes,
      ...(descriptor.protection.mode === 'plain' ? { contentBytes: block.bytes } : {})
    })
    : err({
      code: 'manifest-invalid',
      message: 'Capability block codec does not match its descriptor.',
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
};

const verifyKeyEnvelopeDescriptor = (
  blocks: readonly TeleportCarRuntimeBlock[],
  descriptor: TeleportKeyEnvelopeDescriptor
): TeleportResult<VerifiedKeyEnvelope> => {
  const block = blockFrom(blocks, descriptor.block);
  return block === undefined
    ? err({
      code: 'missing-block',
      message: `Key envelope block ${descriptor.block.toString()} is missing.`
    })
    : block.cid.code !== raw.code
      ? err({ code: 'manifest-invalid', message: 'Key envelope block must use the raw codec.' })
      : ok({ descriptor, bytes: block.bytes });
};

const verifySignatureDescriptor = (
  blocks: readonly TeleportCarRuntimeBlock[],
  descriptor: TeleportSignatureDescriptor
): TeleportResult<VerifiedSignature> => {
  const block = blockFrom(blocks, descriptor.block);
  return block === undefined
    ? err({
      code: 'missing-block',
      message: `Signature block ${descriptor.block.toString()} is missing.`
    })
    : block.cid.code !== raw.code
      ? err({ code: 'manifest-invalid', message: 'Signature block must use the raw codec.' })
      : ok({ descriptor, bytes: block.bytes });
};

const firstFailure = <T>(
  results: readonly TeleportResult<T>[]
): TeleportResult<T> | undefined => results.find(result => !result.ok);

const successfulValues = <T>(
  results: readonly TeleportResult<T>[]
): readonly T[] => results.flatMap(
  (result): readonly T[] => result.ok ? [result.value] : []
);

const referencedBlockIds = (
  root: CID,
  manifest: TeleportCartridgeManifestV1
): readonly string[] => {
  const values: readonly string[] = [
    root.toString(),
    ...manifest.capabilities.map(entry => entry.block.toString()),
    ...manifest.keyEnvelopes.map(entry => entry.block.toString()),
    ...manifest.signatures.map(entry => entry.block.toString())
  ];
  return values.filter((value, index) => values.indexOf(value) === index);
};

export const verifyTeleportCartridge = async (
  bytes: Uint8Array,
  overrides?: Partial<TeleportCartridgeLimits>
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const limits = limitsFor(overrides);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > limits.maxCarBytes) return err({
    code: 'budget-exceeded',
    message: 'Teleport cartridge exceeds its byte budget.'
  });
  const car = await readTeleportCarBytes(bytes);
  if (!car.ok) return car;
  if (car.value.roots.length !== 1) return err({
    code: 'car-invalid',
    message: 'Teleport cartridge must have exactly one root.'
  });
  if (car.value.blocks.length > limits.maxBlocks) return err({
    code: 'budget-exceeded',
    message: 'Teleport cartridge has too many blocks.'
  });
  const blockIds: readonly string[] = car.value.blocks.map(block => block.cid.toString());
  if (hasDuplicates(blockIds)) return err({
    code: 'car-invalid',
    message: 'Teleport cartridge contains a duplicate block.'
  });
  const blocksValid = await validateSequentially(
    car.value.blocks,
    block => validateReadBlock(block, limits)
  );
  if (!blocksValid.ok) return blocksValid;
  const root = car.value.roots.at(0);
  if (root === undefined || root.code !== dagCbor.code) return err({
    code: 'manifest-invalid',
    message: 'Teleport root must use DAG-CBOR.'
  });
  const rootBlock = blockFrom(car.value.blocks, root);
  if (rootBlock === undefined) return err({
    code: 'missing-block',
    message: 'Teleport root block is missing.'
  });
  if (rootBlock.bytes.byteLength > limits.maxManifestBytes) return err({
    code: 'budget-exceeded',
    message: 'Teleport manifest exceeds its byte budget.'
  });
  const decodedManifest = await decodeTeleportManifestBytes(rootBlock.bytes);
  if (!decodedManifest.ok) return decodedManifest;
  const manifest = parseManifest(decodedManifest.value, limits);
  if (!manifest.ok) return manifest;
  const capabilityResults: readonly TeleportResult<VerifiedCapability>[] = manifest.value.capabilities.map(
    descriptor => verifyCapabilityDescriptor(car.value.blocks, descriptor)
  );
  const capabilityFailure = firstFailure(capabilityResults);
  if (capabilityFailure !== undefined && !capabilityFailure.ok) return capabilityFailure;
  const envelopeResults: readonly TeleportResult<VerifiedKeyEnvelope>[] = manifest.value.keyEnvelopes.map(
    descriptor => verifyKeyEnvelopeDescriptor(car.value.blocks, descriptor)
  );
  const envelopeFailure = firstFailure(envelopeResults);
  if (envelopeFailure !== undefined && !envelopeFailure.ok) return envelopeFailure;
  const signatureResults: readonly TeleportResult<VerifiedSignature>[] = manifest.value.signatures.map(
    descriptor => verifySignatureDescriptor(car.value.blocks, descriptor)
  );
  const signatureFailure = firstFailure(signatureResults);
  if (signatureFailure !== undefined && !signatureFailure.ok) return signatureFailure;
  if (referencedBlockIds(root, manifest.value).length !== car.value.blocks.length) return err({
    code: 'car-invalid',
    message: 'Teleport cartridge contains unreferenced blocks.'
  });
  return ok({
    root,
    rootBytes: rootBlock.bytes,
    manifest: manifest.value,
    capabilities: successfulValues(capabilityResults),
    keyEnvelopes: successfulValues(envelopeResults),
    signatures: successfulValues(signatureResults)
  });
};

export const verifyTeleportCartridgeStream = async (
  chunks: AsyncIterable<Uint8Array>,
  limits: Partial<TeleportCartridgeLimits> = {}
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const bounded = limitsFor(limits);
  const bytes = await collectTeleportCarChunks(chunks, bounded.maxCarBytes);
  return bytes.ok ? verifyTeleportCartridge(bytes.value, bounded) : bytes;
};

export type TeleportInventoryEntry =
  | Readonly<{ status: 'supported'; capability: VerifiedCapability; value: unknown }>
  | Readonly<{ status: 'unsupported-optional'; capability: VerifiedCapability }>
  | Readonly<{ status: 'unsupported-required'; capability: VerifiedCapability; issue: TeleportIssue }>
  | Readonly<{ status: 'invalid'; capability: VerifiedCapability; issues: readonly TeleportIssue[] }>;

export const decodeTeleportInventory = (
  cartridge: VerifiedTeleportCartridge,
  registry: TeleportCodecRegistry
): readonly TeleportInventoryEntry[] => cartridge.capabilities.map(
  (capability): TeleportInventoryEntry => {
    const { descriptor } = capability;
    const codec = teleportCodecFromRegistry(registry, descriptor.capabilityId);
    if (codec === undefined || !codec.acceptedVersions.includes(descriptor.schemaVersion)) {
      if (!descriptor.required) return { status: 'unsupported-optional', capability };
      const issue: TeleportIssue = {
        code: 'required-capability-unsupported',
        message: `Required capability ${descriptor.capabilityId}@${descriptor.schemaVersion} is unsupported.`,
        capabilityId: descriptor.capabilityId,
        instanceId: descriptor.instanceId
      };
      return { status: 'unsupported-required', capability, issue };
    }
    if (capability.contentBytes === undefined) return {
      status: 'invalid',
      capability,
      issues: [{
        code: 'decode-failed',
        message: 'Protected capability must be unlocked before decode.',
        capabilityId: descriptor.capabilityId,
        instanceId: descriptor.instanceId
      }]
    };
    if (codec.blockCodec !== descriptor.codec) return {
      status: 'invalid',
      capability,
      issues: [{
        code: 'decode-failed',
        message: 'Capability block codec does not match its registered codec.',
        capabilityId: descriptor.capabilityId,
        instanceId: descriptor.instanceId
      }]
    };
    const decoded = codec.decode(descriptor.schemaVersion, capability.contentBytes);
    return decoded.ok
      ? { status: 'supported', capability, value: decoded.value }
      : { status: 'invalid', capability, issues: decoded.issues };
  }
);

export const reexportVerifiedCartridge = (
  cartridge: VerifiedTeleportCartridge,
  createdAt = cartridge.manifest.createdAt
): Promise<TeleportResult<TeleportCartridgeArchive>> => createTeleportCartridge({
  ...(createdAt ? { createdAt } : {}),
  capabilities: cartridge.capabilities.map(({ descriptor, storedBytes }) => ({
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId,
    schemaVersion: descriptor.schemaVersion,
    securityClass: descriptor.securityClass,
    required: descriptor.required,
    restoreMode: descriptor.restoreMode,
    codec: descriptor.codec,
    dependencies: descriptor.dependencies,
    bytes: storedBytes,
    cid: descriptor.block,
    protection: descriptor.protection
  })),
  keyEnvelopes: cartridge.keyEnvelopes.map(envelope => ({
    descriptor: envelope.descriptor,
    bytes: envelope.bytes
  })),
  signatures: cartridge.signatures.map(signature => ({
    descriptor: signature.descriptor,
    bytes: signature.bytes
  }))
});
