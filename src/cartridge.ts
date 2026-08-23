import { CarReader, CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import { decodeCapability, TeleportCodecRegistry } from './codec';
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
  type TeleportSignatureBlock,
  type TeleportSignatureDescriptor,
  type TeleportRestoreMode,
  type TeleportSecurityClass
} from './types';

const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]);

const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const dependencyKey = (dependency: TeleportCapabilityDependency): string =>
  `${dependency.kind}\u0000${dependency.capabilityId}\u0000${dependency.instanceId ?? ''}\u0000${dependency.required ? '1' : '0'}`;
const isOrdered = <T>(values: readonly T[], key: (value: T) => string): boolean =>
  values.every((value, index) => index === 0 || compareText(key(values[index - 1] as T), key(value)) <= 0);

const strictObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).toSorted();
  const expected = [...keys].toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isSecurityClass = (value: unknown): value is TeleportSecurityClass =>
  value === 'public' || value === 'private' || value === 'secret' || value === 'opaque-native';

const isRestoreMode = (value: unknown): value is TeleportRestoreMode =>
  value === 'merge' || value === 'replace' || value === 'rebase' || value === 'exact-replay' || value === 'retain';

const parseDependency = (value: unknown): TeleportCapabilityDependency | undefined => {
  const keys = typeof value === 'object' && value !== null && 'instanceId' in value
    ? ['capabilityId', 'instanceId', 'kind', 'required']
    : ['capabilityId', 'kind', 'required'];
  if (!strictObject(value, keys)) return undefined;
  if (
    typeof value.capabilityId !== 'string' ||
    typeof value.required !== 'boolean' ||
    (value.kind !== 'hard-decode' && value.kind !== 'restore-order' && value.kind !== 'optional-enhancement' && value.kind !== 'application-availability') ||
    ('instanceId' in value && typeof value.instanceId !== 'string')
  ) return undefined;
  return value as unknown as TeleportCapabilityDependency;
};

const parseProtection = (value: unknown): TeleportCapabilityProtection | undefined => {
  if (strictObject(value, ['mode']) && value.mode === 'plain') return { mode: 'plain' };
  if (!strictObject(value, ['iv', 'keyEnvelopeId', 'keyId', 'mode', 'plaintextCid']) || value.mode !== 'aes-256-gcm-v1') return undefined;
  if (
    typeof value.keyEnvelopeId !== 'string' ||
    typeof value.keyId !== 'string' ||
    !(value.iv instanceof Uint8Array) || value.iv.byteLength !== 12 ||
    !(value.plaintextCid instanceof CID)
  ) return undefined;
  return value as unknown as TeleportCapabilityProtection;
};

const parseKeyEnvelope = (value: unknown): TeleportKeyEnvelopeDescriptor | undefined => {
  if (strictObject(value, ['block', 'hash', 'id', 'iterations', 'iv', 'mode', 'salt'])) {
    if (
      typeof value.id !== 'string' || value.mode !== 'pbkdf2-aes-256-gcm-v1' ||
      !(value.block instanceof CID) || value.block.code !== raw.code ||
      !(value.salt instanceof Uint8Array) || value.salt.byteLength !== 16 ||
      !(value.iv instanceof Uint8Array) || value.iv.byteLength !== 12 ||
      value.iterations !== 310_000 || value.hash !== 'SHA-256'
    ) return undefined;
    return value as unknown as TeleportKeyEnvelopeDescriptor;
  }
  if (strictObject(value, ['block', 'hash', 'id', 'iv', 'mode', 'recipientKeyId'])) {
    if (
      typeof value.id !== 'string' || value.mode !== 'rsa-oaep-aes-256-gcm-v1' ||
      typeof value.recipientKeyId !== 'string' || !value.recipientKeyId ||
      !(value.block instanceof CID) || value.block.code !== raw.code ||
      !(value.iv instanceof Uint8Array) || value.iv.byteLength !== 12 || value.hash !== 'SHA-256'
    ) return undefined;
    return value as unknown as TeleportKeyEnvelopeDescriptor;
  }
  return undefined;
};

const parseSignature = (value: unknown): TeleportSignatureDescriptor | undefined => {
  if (!strictObject(value, ['block', 'id', 'mode', 'signedPayload', 'signerKeyId'])) return undefined;
  if (
    typeof value.id !== 'string' || !value.id || value.mode !== 'ed25519-v1' ||
    typeof value.signerKeyId !== 'string' || !value.signerKeyId ||
    !(value.signedPayload instanceof CID) || value.signedPayload.code !== dagCbor.code ||
    !(value.block instanceof CID) || value.block.code !== raw.code
  ) return undefined;
  return value as unknown as TeleportSignatureDescriptor;
};

const parseDescriptor = (value: unknown): TeleportCapabilityDescriptor | undefined => {
  if (!strictObject(value, ['block', 'capabilityId', 'codec', 'dependencies', 'instanceId', 'protection', 'required', 'restoreMode', 'schemaVersion', 'securityClass'])) return undefined;
  if (
    typeof value.capabilityId !== 'string' || !CAPABILITY_ID.test(value.capabilityId) ||
    typeof value.instanceId !== 'string' || !INSTANCE_ID.test(value.instanceId) ||
    !Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1 ||
    !isSecurityClass(value.securityClass) ||
    typeof value.required !== 'boolean' ||
    !isRestoreMode(value.restoreMode) ||
    (value.codec !== 'dag-cbor' && value.codec !== 'raw') ||
    !(value.block instanceof CID) ||
    !Array.isArray(value.dependencies) || !parseProtection(value.protection)
  ) return undefined;
  const dependencies = value.dependencies.map(parseDependency);
  if (dependencies.some(entry => entry === undefined)) return undefined;
  return {
    ...(value as unknown as Omit<TeleportCapabilityDescriptor, 'dependencies' | 'protection'>),
    dependencies: dependencies as TeleportCapabilityDependency[],
    protection: parseProtection(value.protection) as TeleportCapabilityProtection
  };
};

const validateCapabilityGraph = (
  descriptors: readonly TeleportCapabilityDescriptor[]
): TeleportResult<void> => {
  const byInstance = new Map(descriptors.map(descriptor => [descriptor.instanceId, descriptor] as const));
  const byCapability = new Map<string, TeleportCapabilityDescriptor[]>();
  for (const descriptor of descriptors) {
    const entries = byCapability.get(descriptor.capabilityId) ?? [];
    entries.push(descriptor);
    byCapability.set(descriptor.capabilityId, entries);

    const dependencyKeys = new Set<string>();
    for (const dependency of descriptor.dependencies) {
      if (!CAPABILITY_ID.test(dependency.capabilityId) || (dependency.instanceId !== undefined && !INSTANCE_ID.test(dependency.instanceId))) {
        return err({ code: 'dependency-invalid', message: 'Capability dependency identity is invalid.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
      }
      const key = `${dependency.kind}\u0000${dependency.capabilityId}\u0000${dependency.instanceId ?? ''}`;
      if (dependencyKeys.has(key)) {
        return err({ code: 'dependency-invalid', message: 'Capability descriptor contains a duplicate dependency.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
      }
      dependencyKeys.add(key);
    }
  }

  const edges = new Map<string, string[]>();
  for (const descriptor of descriptors) {
    const targets: string[] = [];
    for (const dependency of descriptor.dependencies) {
      if (dependency.kind !== 'hard-decode' && dependency.kind !== 'restore-order') continue;
      if (dependency.instanceId) {
        const target = byInstance.get(dependency.instanceId);
        if (!target || target.capabilityId !== dependency.capabilityId) {
          if (dependency.required) return err({ code: 'dependency-invalid', message: 'Required capability dependency target is missing or has the wrong capability id.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
          continue;
        }
        targets.push(target.instanceId);
        continue;
      }
      const matches = byCapability.get(dependency.capabilityId) ?? [];
      if (dependency.required && matches.length === 0) {
        return err({ code: 'dependency-invalid', message: 'Required capability dependency is missing.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
      }
      targets.push(...matches.map(match => match.instanceId));
    }
    edges.set(descriptor.instanceId, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (instanceId: string): boolean => {
    if (visiting.has(instanceId)) return false;
    if (visited.has(instanceId)) return true;
    visiting.add(instanceId);
    for (const target of edges.get(instanceId) ?? []) if (!visit(target)) return false;
    visiting.delete(instanceId);
    visited.add(instanceId);
    return true;
  };
  for (const descriptor of descriptors) {
    if (!visit(descriptor.instanceId)) {
      return err({ code: 'dependency-invalid', message: 'Capability dependency graph contains a cycle.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
    }
  }
  return ok(undefined);
};

const validateBlockIdentity = async (
  cid: CID,
  bytes: Uint8Array,
  expectedCodec: number,
  limits: TeleportCartridgeLimits,
  label: string
): Promise<TeleportResult<void>> => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limits.maxBlockBytes) {
    return err({ code: 'budget-exceeded', message: `${label} exceeds its byte budget.` });
  }
  if (cid.code !== expectedCodec || cid.multihash.code !== sha256.code) {
    return err({ code: 'cid-mismatch', message: `${label} CID uses an unexpected codec or hash.` });
  }
  const digest = await sha256.digest(bytes);
  return equalBytes(digest.bytes, cid.multihash.bytes)
    ? ok(undefined)
    : err({ code: 'cid-mismatch', message: `${label} bytes do not match their CID.` });
};

const parseManifest = (value: unknown, limits: TeleportCartridgeLimits): TeleportResult<TeleportCartridgeManifestV1> => {
  const keys = [
    'capabilities', 'keyEnvelopes', 'type', 'version',
    ...(typeof value === 'object' && value !== null && 'createdAt' in value ? ['createdAt'] : []),
    ...(typeof value === 'object' && value !== null && 'signatures' in value ? ['signatures'] : [])
  ];
  if (!strictObject(value, keys) || value.type !== 'wx-teleport-cartridge' || value.version !== 1 || !Array.isArray(value.capabilities) || !Array.isArray(value.keyEnvelopes)) {
    return err({ code: 'manifest-invalid', message: 'Teleport cartridge manifest is invalid.' });
  }
  if (value.capabilities.length > limits.maxCapabilities) {
    return err({ code: 'budget-exceeded', message: 'Teleport cartridge has too many capabilities.' });
  }
  if ('createdAt' in value && typeof value.createdAt !== 'string') {
    return err({ code: 'manifest-invalid', message: 'Teleport cartridge creation time is invalid.' });
  }
  const capabilities = value.capabilities.map(parseDescriptor);
  if (capabilities.some(entry => entry === undefined)) {
    return err({ code: 'manifest-invalid', message: 'Teleport capability descriptor is invalid.' });
  }
  const descriptors = capabilities as TeleportCapabilityDescriptor[];
  const keyEnvelopes = value.keyEnvelopes.map(parseKeyEnvelope);
  if (keyEnvelopes.some(entry => entry === undefined)) {
    return err({ code: 'manifest-invalid', message: 'Teleport key envelope descriptor is invalid.' });
  }
  const envelopeDescriptors = keyEnvelopes as TeleportKeyEnvelopeDescriptor[];
  const signatures = 'signatures' in value && Array.isArray(value.signatures) ? value.signatures.map(parseSignature) : [];
  if (signatures.some(entry => entry === undefined)) return err({ code: 'manifest-invalid', message: 'Teleport signature descriptor is invalid.' });
  const signatureDescriptors = signatures as TeleportSignatureDescriptor[];
  if (!isOrdered(descriptors, entry => entry.instanceId) || descriptors.some(entry => !isOrdered(entry.dependencies, dependencyKey))) {
    return err({ code: 'manifest-invalid', message: 'Teleport capabilities and dependencies must use canonical ordering.' });
  }
  if (!isOrdered(envelopeDescriptors, entry => entry.id) || !isOrdered(signatureDescriptors, entry => entry.id)) {
    return err({ code: 'manifest-invalid', message: 'Teleport envelopes and signatures must use canonical ordering.' });
  }
  if (new Set(signatureDescriptors.map(entry => entry.id)).size !== signatureDescriptors.length) return err({ code: 'manifest-invalid', message: 'Teleport signature ids must be unique.' });
  const envelopeIds = new Set(envelopeDescriptors.map(entry => entry.id));
  if (envelopeIds.size !== envelopeDescriptors.length) {
    return err({ code: 'manifest-invalid', message: 'Teleport key envelope ids must be unique.' });
  }
  if (descriptors.some(entry => entry.protection.mode !== 'plain' && !envelopeIds.has(entry.protection.keyEnvelopeId))) {
    return err({ code: 'manifest-invalid', message: 'Protected capability references a missing key envelope.' });
  }
  const instanceIds = new Set(descriptors.map(entry => entry.instanceId));
  if (instanceIds.size !== descriptors.length) {
    return err({ code: 'manifest-invalid', message: 'Teleport capability instance ids must be unique.' });
  }
  const graph = validateCapabilityGraph(descriptors);
  if (!graph.ok) return graph;
  return ok({
    type: 'wx-teleport-cartridge',
    version: 1,
    ...('createdAt' in value ? { createdAt: value.createdAt as string } : {}),
    capabilities: descriptors,
    keyEnvelopes: envelopeDescriptors,
    signatures: signatureDescriptors
  });
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
  write(chunk: Uint8Array): Promise<void>;
}

const limitsFor = (overrides?: Partial<TeleportCartridgeLimits>): TeleportCartridgeLimits => ({
  ...DEFAULT_CARTRIDGE_LIMITS,
  ...overrides
});

const prepareTeleportCartridge = async (input: CreateTeleportCartridgeInput): Promise<TeleportResult<Readonly<{
  capabilities: readonly EncodedCapabilityBlock[];
  keyEnvelopes: readonly TeleportKeyEnvelopeBlock[];
  signatures: readonly TeleportSignatureBlock[];
  limits: TeleportCartridgeLimits;
  manifest: TeleportCartridgeManifestV1;
  manifestBytes: Uint8Array;
  root: CID;
}>>> => {
  const limits = limitsFor(input.limits);
  if (input.capabilities.length > limits.maxCapabilities) {
    return err({ code: 'budget-exceeded', message: 'Teleport cartridge has too many capabilities.' });
  }
  const instanceIds = new Set(input.capabilities.map(entry => entry.instanceId));
  if (instanceIds.size !== input.capabilities.length) {
    return err({ code: 'manifest-invalid', message: 'Teleport capability instance ids must be unique.' });
  }
  const capabilities = [...input.capabilities].sort((left, right) => compareText(left.instanceId, right.instanceId));
  const keyEnvelopes = [...(input.keyEnvelopes ?? [])].sort((left, right) => compareText(left.descriptor.id, right.descriptor.id));
  const signatures = [...(input.signatures ?? [])].sort((left, right) => compareText(left.descriptor.id, right.descriptor.id));
  for (const capability of capabilities) {
    const storedCodec = capability.protection?.mode === 'aes-256-gcm-v1'
      ? raw.code
      : capability.codec === 'dag-cbor' ? dagCbor.code : raw.code;
    const block = await validateBlockIdentity(capability.cid, capability.bytes, storedCodec, limits, `Capability ${capability.instanceId}`);
    if (!block.ok) return block;
    if (capability.protection?.mode === 'aes-256-gcm-v1') {
      const plaintextCodec = capability.codec === 'dag-cbor' ? dagCbor.code : raw.code;
      if (capability.protection.plaintextCid.code !== plaintextCodec || capability.protection.plaintextCid.multihash.code !== sha256.code) {
        return err({ code: 'cid-mismatch', message: `Protected capability ${capability.instanceId} has an invalid plaintext CID.`, capabilityId: capability.capabilityId, instanceId: capability.instanceId });
      }
    }
  }
  for (const envelope of keyEnvelopes) {
    const block = await validateBlockIdentity(envelope.descriptor.block, envelope.bytes, raw.code, limits, `Key envelope ${envelope.descriptor.id}`);
    if (!block.ok) return block;
  }
  for (const signature of signatures) {
    const block = await validateBlockIdentity(signature.descriptor.block, signature.bytes, raw.code, limits, `Signature ${signature.descriptor.id}`);
    if (!block.ok) return block;
  }
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
      dependencies: [...entry.dependencies].sort((left, right) => compareText(dependencyKey(left), dependencyKey(right)))
    }))
  };
  const validated = parseManifest(manifest, limits);
  if (!validated.ok) return validated;
  const manifestBytes = coerce(dagCbor.encode(manifest));
  if (manifestBytes.byteLength > limits.maxManifestBytes) {
    return err({ code: 'budget-exceeded', message: 'Teleport manifest exceeds its byte budget.' });
  }
  const root = CID.createV1(dagCbor.code, await sha256.digest(manifestBytes));
  return ok({ capabilities, keyEnvelopes, signatures, limits, manifest, manifestBytes, root });
};

export const streamTeleportCartridge = async (
  input: CreateTeleportCartridgeInput
): Promise<TeleportResult<TeleportCartridgeStreamArchive>> => {
  const prepared = await prepareTeleportCartridge(input);
  if (!prepared.ok) return prepared;
  const { capabilities, keyEnvelopes, signatures, limits, manifest, manifestBytes, root } = prepared.value;
  const chunks = (async function* (): AsyncIterable<Uint8Array> {
    const { writer, out } = CarWriter.create([root]);
    const produce = (async () => {
      await writer.put({ cid: root, bytes: manifestBytes });
      const written = new Set([root.toString()]);
      for (const capability of capabilities) {
        if (written.has(capability.cid.toString())) continue;
        await writer.put({ cid: capability.cid, bytes: capability.bytes });
        written.add(capability.cid.toString());
      }
      for (const envelope of keyEnvelopes) {
        if (written.has(envelope.descriptor.block.toString())) continue;
        await writer.put({ cid: envelope.descriptor.block, bytes: envelope.bytes });
        written.add(envelope.descriptor.block.toString());
      }
      for (const signature of signatures) {
        if (written.has(signature.descriptor.block.toString())) continue;
        await writer.put({ cid: signature.descriptor.block, bytes: signature.bytes });
        written.add(signature.descriptor.block.toString());
      }
      await writer.close();
    })();
    let total = 0;
    let exceeded = false;
    for await (const chunk of out) {
      total += chunk.byteLength;
      if (total > limits.maxCarBytes) exceeded = true;
      if (!exceeded) yield chunk;
    }
    await produce;
    if (exceeded) throw new RangeError('Teleport cartridge exceeds its byte budget.');
  })();
  return ok({ chunks, root, rootBytes: manifestBytes, manifest });
};

export const writeTeleportCartridge = async (
  input: CreateTeleportCartridgeInput,
  sink: TeleportCartridgeChunkSink
): Promise<TeleportResult<Omit<TeleportCartridgeArchive, 'bytes'>>> => {
  const streamed = await streamTeleportCartridge(input);
  if (!streamed.ok) return streamed;
  try {
    for await (const chunk of streamed.value.chunks) await sink.write(chunk);
    return ok({ root: streamed.value.root, rootBytes: streamed.value.rootBytes, manifest: streamed.value.manifest });
  } catch (cause) {
    return err({
      code: cause instanceof RangeError ? 'budget-exceeded' : 'execution-failed',
      message: cause instanceof Error ? cause.message : 'Teleport cartridge stream write failed.'
    });
  }
};

export const createTeleportCartridge = async (input: CreateTeleportCartridgeInput): Promise<TeleportResult<TeleportCartridgeArchive>> => {
  const chunks: Uint8Array[] = [];
  const written = await writeTeleportCartridge(input, { write: async chunk => { chunks.push(chunk.slice()); } });
  return written.ok
    ? ok({ ...written.value, bytes: concatBytes(chunks) })
    : written;
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

export const verifyTeleportCartridge = async (
  bytes: Uint8Array,
  overrides?: Partial<TeleportCartridgeLimits>
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const limits = limitsFor(overrides);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > limits.maxCarBytes) {
    return err({ code: 'budget-exceeded', message: 'Teleport cartridge exceeds its byte budget.' });
  }
  try {
    const reader = await CarReader.fromBytes(bytes);
    const roots = await reader.getRoots();
    if (roots.length !== 1) return err({ code: 'car-invalid', message: 'Teleport cartridge must have exactly one root.' });
    const blocks = new Map<string, Readonly<{ cid: CID; bytes: Uint8Array }>>();
    for await (const block of reader.blocks()) {
      if (blocks.size >= limits.maxBlocks) return err({ code: 'budget-exceeded', message: 'Teleport cartridge has too many blocks.' });
      if (block.bytes.byteLength > limits.maxBlockBytes) return err({ code: 'budget-exceeded', message: 'Teleport block exceeds its byte budget.' });
      const id = block.cid.toString();
      if (blocks.has(id)) return err({ code: 'car-invalid', message: 'Teleport cartridge contains a duplicate block.' });
      if (block.cid.multihash.code !== sha256.code) return err({ code: 'cid-mismatch', message: 'Teleport blocks must use SHA-256.' });
      const digest = await sha256.digest(coerce(block.bytes));
      if (!equalBytes(digest.bytes, block.cid.multihash.bytes)) return err({ code: 'cid-mismatch', message: 'Teleport block bytes do not match their CID.' });
      blocks.set(id, { cid: block.cid, bytes: block.bytes });
    }
    const root = roots[0];
    if (!root || root.code !== dagCbor.code) return err({ code: 'manifest-invalid', message: 'Teleport root must use DAG-CBOR.' });
    const rootBlock = blocks.get(root.toString());
    if (!rootBlock) return err({ code: 'missing-block', message: 'Teleport root block is missing.' });
    if (rootBlock.bytes.byteLength > limits.maxManifestBytes) return err({ code: 'budget-exceeded', message: 'Teleport manifest exceeds its byte budget.' });
    const manifestResult = parseManifest(dagCbor.decode(rootBlock.bytes), limits);
    if (!manifestResult.ok) return manifestResult;
    const referenced = new Set([root.toString()]);
    const capabilities: VerifiedCapability[] = [];
    for (const descriptor of manifestResult.value.capabilities) {
      const block = blocks.get(descriptor.block.toString());
      if (!block) return err({ code: 'missing-block', message: `Capability block ${descriptor.block} is missing.`, capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
      const expectedCode = descriptor.protection.mode === 'plain'
        ? descriptor.codec === 'dag-cbor' ? dagCbor.code : raw.code
        : raw.code;
      if (block.cid.code !== expectedCode) return err({ code: 'manifest-invalid', message: 'Capability block codec does not match its descriptor.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId });
      referenced.add(descriptor.block.toString());
      capabilities.push({
        descriptor,
        storedBytes: block.bytes,
        ...(descriptor.protection.mode === 'plain' ? { contentBytes: block.bytes } : {})
      });
    }
    const keyEnvelopes: VerifiedKeyEnvelope[] = [];
    for (const descriptor of manifestResult.value.keyEnvelopes) {
      const block = blocks.get(descriptor.block.toString());
      if (!block) return err({ code: 'missing-block', message: `Key envelope block ${descriptor.block} is missing.` });
      if (block.cid.code !== raw.code) return err({ code: 'manifest-invalid', message: 'Key envelope block must use the raw codec.' });
      referenced.add(descriptor.block.toString());
      keyEnvelopes.push({ descriptor, bytes: block.bytes });
    }
    const signatures: VerifiedSignature[] = [];
    for (const descriptor of manifestResult.value.signatures) {
      const block = blocks.get(descriptor.block.toString());
      if (!block) return err({ code: 'missing-block', message: `Signature block ${descriptor.block} is missing.` });
      if (block.cid.code !== raw.code) return err({ code: 'manifest-invalid', message: 'Signature block must use the raw codec.' });
      referenced.add(descriptor.block.toString());
      signatures.push({ descriptor, bytes: block.bytes });
    }
    if (referenced.size !== blocks.size) return err({ code: 'car-invalid', message: 'Teleport cartridge contains unreferenced blocks.' });
    return ok({ root, rootBytes: rootBlock.bytes, manifest: manifestResult.value, capabilities, keyEnvelopes, signatures });
  } catch (cause) {
    return err({ code: 'car-invalid', message: cause instanceof Error ? cause.message : 'Teleport cartridge parsing failed.' });
  }
};

export const verifyTeleportCartridgeStream = async (
  chunks: AsyncIterable<Uint8Array>,
  limits: Partial<TeleportCartridgeLimits> = {}
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const bounded = { ...DEFAULT_CARTRIDGE_LIMITS, ...limits };
  const collected: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) return err({ code: 'car-invalid', message: 'CAR stream yielded a non-byte chunk.' });
    total += chunk.byteLength;
    if (total > bounded.maxCarBytes) return err({ code: 'budget-exceeded', message: 'CAR stream exceeds its byte budget.' });
    collected.push(chunk);
  }
  return verifyTeleportCartridge(concatBytes(collected), bounded);
};

export type TeleportInventoryEntry =
  | Readonly<{ status: 'supported'; capability: VerifiedCapability; value: unknown }>
  | Readonly<{ status: 'unsupported-optional'; capability: VerifiedCapability }>
  | Readonly<{ status: 'unsupported-required'; capability: VerifiedCapability; issue: TeleportIssue }>
  | Readonly<{ status: 'invalid'; capability: VerifiedCapability; issues: readonly TeleportIssue[] }>;

export const decodeTeleportInventory = (
  cartridge: VerifiedTeleportCartridge,
  registry: TeleportCodecRegistry
): readonly TeleportInventoryEntry[] => cartridge.capabilities.map(capability => {
  const { descriptor } = capability;
  const codec = registry.codec(descriptor.capabilityId);
  if (!codec || !codec.acceptedVersions.includes(descriptor.schemaVersion)) {
    if (!descriptor.required) return { status: 'unsupported-optional', capability };
    const issue: TeleportIssue = {
      code: 'required-capability-unsupported',
      message: `Required capability ${descriptor.capabilityId}@${descriptor.schemaVersion} is unsupported.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    };
    return { status: 'unsupported-required', capability, issue };
  }
  if (!capability.contentBytes) {
    return { status: 'invalid', capability, issues: [{ code: 'decode-failed', message: 'Protected capability must be unlocked before decode.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId }] };
  }
  if ((codec.codec ?? 'dag-cbor') !== descriptor.codec) {
    return { status: 'invalid', capability, issues: [{ code: 'decode-failed', message: 'Capability block codec does not match its registered codec.', capabilityId: descriptor.capabilityId, instanceId: descriptor.instanceId }] };
  }
  const decoded = decodeCapability(codec, descriptor.schemaVersion, capability.contentBytes);
  return decoded.ok
    ? { status: 'supported', capability, value: decoded.value }
    : { status: 'invalid', capability, issues: decoded.issues };
});

export const reexportVerifiedCartridge = async (
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
  keyEnvelopes: cartridge.keyEnvelopes.map(envelope => ({ descriptor: envelope.descriptor, bytes: envelope.bytes })),
  signatures: cartridge.signatures.map(signature => ({ descriptor: signature.descriptor, bytes: signature.bytes }))
});
