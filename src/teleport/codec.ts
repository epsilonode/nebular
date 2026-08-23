import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';
import { Result as NeverthrowResult } from 'neverthrow';

import { validateProtocolValue } from './protocol-value';
import { err, ok, type TeleportIssue, type TeleportIssueCode, type TeleportResult } from './result';
import {
  DEFAULT_CAPABILITY_BUDGET,
  type EncodedCapabilityBlock,
  type TeleportCapabilityCodec,
  type TeleportCapabilityMigration,
  type TeleportDecodeBudget,
  type TeleportRestoreMode,
  type TeleportRestoreStep,
  type TeleportSecurityClass
} from './types';

const CAPABILITY_ID: Readonly<RegExp> = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const INSTANCE_ID: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const completeBudget = (input?: Partial<TeleportDecodeBudget>): TeleportDecodeBudget => ({
  ...DEFAULT_CAPABILITY_BUDGET,
  ...input
});

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]);

const isUint8Array = (value: unknown): value is Uint8Array => value instanceof Uint8Array;

type RegisteredTeleportCodecData = Readonly<{
  readonly capabilityId: string;
  readonly currentVersion: number;
  readonly acceptedVersions: readonly number[];
  readonly securityClass: TeleportSecurityClass;
  readonly blockCodec: 'dag-cbor' | 'raw';
}>;

type RegisteredTeleportCodecOperations = Readonly<{
  readonly decode: (version: number, bytes: Uint8Array) => TeleportResult<unknown>;
  readonly restorePlan: (
    version: number,
    bytes: Uint8Array,
    context: Readonly<{ instanceId: string; restoreMode: TeleportRestoreMode }>
  ) => TeleportResult<readonly TeleportRestoreStep[]>;
}>;

export type RegisteredTeleportCodec =
  & RegisteredTeleportCodecData
  & RegisteredTeleportCodecOperations;

export type TeleportCodecRegistry = readonly RegisteredTeleportCodec[];

export const createTeleportCodecRegistry = (): TeleportCodecRegistry => Object.freeze([]);

export const teleportCodecFromRegistry = (
  registry: TeleportCodecRegistry,
  capabilityId: string
): RegisteredTeleportCodec | undefined => registry.find(entry => entry.capabilityId === capabilityId);

export const teleportCodecRegistrySupports = (
  registry: TeleportCodecRegistry,
  capabilityId: string,
  version: number
): boolean => teleportCodecFromRegistry(registry, capabilityId)?.acceptedVersions.includes(version) === true;

const migrationPathFrom = <T>(
  codec: TeleportCapabilityCodec<T>,
  sourceVersion: number,
  version: number,
  seen: readonly number[],
  path: readonly TeleportCapabilityMigration[]
): TeleportResult<readonly TeleportCapabilityMigration[]> => {
  if (version === codec.currentVersion) return ok(path);
  if (seen.includes(version)) {
    return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} migration chain contains a cycle.` });
  }
  const migration = codec.migrations?.find(candidate => candidate.fromVersion === version);
  if (!migration || migration.toVersion > codec.currentVersion) {
    return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} has no complete migration path from version ${sourceVersion}.` });
  }
  return migrationPathFrom(codec, sourceVersion, migration.toVersion, [...seen, version], [...path, migration]);
};

const migrationPath = <T>(
  codec: TeleportCapabilityCodec<T>,
  sourceVersion: number
): TeleportResult<readonly TeleportCapabilityMigration[]> => migrationPathFrom(codec, sourceVersion, sourceVersion, [], []);

const firstFailedMigrationPath = <T>(codec: TeleportCapabilityCodec<T>): TeleportResult<readonly TeleportCapabilityMigration[]> | undefined =>
  codec.acceptedVersions
    .filter(version => version !== codec.currentVersion)
    .map(version => migrationPath(codec, version))
    .find(result => !result.ok);

const validateTeleportCodec = <T>(codec: TeleportCapabilityCodec<T>): TeleportResult<void> => {
  if (!CAPABILITY_ID.test(codec.capabilityId) || !Number.isInteger(codec.currentVersion) || codec.currentVersion < 1) {
    return err({ code: 'codec-invalid', message: 'Codec identity or current version is invalid.' });
  }
  if (
    !codec.acceptedVersions.includes(codec.currentVersion)
    || codec.acceptedVersions.some(version => !Number.isInteger(version) || version < 1)
  ) {
    return err({ code: 'codec-invalid', message: 'Codec accepted versions must include the current version.' });
  }
  const migrations: readonly TeleportCapabilityMigration[] = codec.migrations ?? [];
  const fromVersions: readonly number[] = migrations.map(migration => migration.fromVersion);
  if (migrations.some((migration, index) =>
    !Number.isInteger(migration.fromVersion)
    || !Number.isInteger(migration.toVersion)
    || migration.fromVersion < 1
    || migration.toVersion <= migration.fromVersion
    || fromVersions.indexOf(migration.fromVersion) !== index
  )) {
    return err({ code: 'codec-invalid', message: `Codec ${codec.capabilityId} has an invalid or overlapping migration.` });
  }
  if (migrations.length === 0) return ok(undefined);
  if (!codec.decodeHistorical) {
    return err({ code: 'codec-invalid', message: `Codec ${codec.capabilityId} declares migrations without a historical decoder.` });
  }
  const failedPath = firstFailedMigrationPath(codec);
  return failedPath && !failedPath.ok ? err(...failedPath.issues) : ok(undefined);
};

const snapshotTeleportCodec = <T>(codec: TeleportCapabilityCodec<T>): TeleportCapabilityCodec<T> => Object.freeze({
  capabilityId: codec.capabilityId,
  currentVersion: codec.currentVersion,
  acceptedVersions: Object.freeze([...codec.acceptedVersions]),
  securityClass: codec.securityClass,
  ...(codec.codec === undefined ? {} : { codec: codec.codec }),
  ...(codec.budget === undefined ? {} : { budget: Object.freeze({ ...codec.budget }) }),
  ...(codec.migrations === undefined
    ? {}
    : { migrations: Object.freeze(codec.migrations.map(migration => Object.freeze({ ...migration }))) }),
  encode: codec.encode,
  decode: codec.decode,
  ...(codec.decodeHistorical === undefined ? {} : { decodeHistorical: codec.decodeHistorical }),
  ...(codec.dependencies === undefined ? {} : { dependencies: codec.dependencies }),
  ...(codec.restorePlan === undefined ? {} : { restorePlan: codec.restorePlan })
});

const createRegisteredTeleportCodec = <T>(codec: TeleportCapabilityCodec<T>): RegisteredTeleportCodec => {
  const snapshot = snapshotTeleportCodec(codec);
  return Object.freeze({
    capabilityId: snapshot.capabilityId,
    currentVersion: snapshot.currentVersion,
    acceptedVersions: snapshot.acceptedVersions,
    securityClass: snapshot.securityClass,
    blockCodec: snapshot.codec ?? 'dag-cbor',
    decode: (version: number, bytes: Uint8Array): TeleportResult<unknown> => decodeCapability(snapshot, version, bytes),
    restorePlan: (
      version: number,
      bytes: Uint8Array,
      context: Readonly<{ instanceId: string; restoreMode: TeleportRestoreMode }>
    ): TeleportResult<readonly TeleportRestoreStep[]> => {
      const decoded = decodeCapability(snapshot, version, bytes);
      if (!decoded.ok) return decoded;
      return snapshot.restorePlan?.(decoded.value, context) ?? ok([]);
    }
  });
};

export const registerTeleportCodec = <T>(
  registry: TeleportCodecRegistry,
  codec: TeleportCapabilityCodec<T>
): TeleportResult<TeleportCodecRegistry> => {
  const validation = validateTeleportCodec(codec);
  if (!validation.ok) return validation;
  if (teleportCodecFromRegistry(registry, codec.capabilityId)) {
    return err({ code: 'codec-duplicate', message: `Capability codec ${codec.capabilityId} is already registered.` });
  }
  return ok(Object.freeze([...registry, createRegisteredTeleportCodec(codec)]));
};

export const createTeleportCodecRegistryWith = <T>(
  codec: TeleportCapabilityCodec<T>
): TeleportResult<TeleportCodecRegistry> => registerTeleportCodec(createTeleportCodecRegistry(), codec);

const applyMigrationPath = <T>(
  codec: TeleportCapabilityCodec<T>,
  path: readonly TeleportCapabilityMigration[],
  index: number,
  current: unknown,
  warnings: readonly TeleportIssue[]
): TeleportResult<T> => {
  const migration = path[index];
  if (!migration) {
    const final = codec.decode(codec.currentVersion, current);
    return final.ok ? ok(final.value, [...warnings, ...final.warnings]) : final;
  }
  const migrated = migration.migrate(current);
  return migrated.ok
    ? applyMigrationPath(codec, path, index + 1, migrated.value, [...warnings, ...migrated.warnings])
    : migrated;
};

export const migrateCapabilityValue = <T>(
  codec: TeleportCapabilityCodec<T>,
  version: number,
  value: unknown
): TeleportResult<T> => {
  if (version === codec.currentVersion || !codec.migrations?.length) return codec.decode(version, value);
  if (!codec.decodeHistorical) {
    return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} has no historical decoder.` });
  }
  const decoded = codec.decodeHistorical(version, value);
  if (!decoded.ok) return decoded;
  const path = migrationPath(codec, version);
  return path.ok
    ? applyMigrationPath(codec, path.value, 0, decoded.value, decoded.warnings)
    : path;
};

export interface EncodeCapabilityInput<T> {
  readonly codec: TeleportCapabilityCodec<T>;
  readonly value: T;
  readonly instanceId: string;
  readonly required?: boolean;
  readonly restoreMode?: TeleportRestoreMode;
}

const throwableIssue = (
  code: TeleportIssueCode,
  fallbackMessage: string,
  cause: unknown
): TeleportIssue => ({
  code,
  message: cause instanceof Error ? cause.message : fallbackMessage
});

const captureCodecMechanic = <T>(
  operation: () => T,
  code: TeleportIssueCode,
  fallbackMessage: string
): TeleportResult<T> => NeverthrowResult
  .fromThrowable(operation, cause => throwableIssue(code, fallbackMessage, cause))()
  .match(value => ok(value), issue => err(issue));

const encodeCanonicalValue = (
  codecKind: 'dag-cbor' | 'raw',
  value: unknown,
  budget: TeleportDecodeBudget
): TeleportResult<Uint8Array> => {
  if (codecKind === 'raw') {
    return isUint8Array(value)
      ? ok(Uint8Array.from(value))
      : err({ code: 'capability-invalid', message: 'Raw capability encoder must return Uint8Array.' });
  }
  const validation = validateProtocolValue(value, budget);
  return validation.ok
    ? captureCodecMechanic(
      () => coerce(dagCbor.encode(value)),
      'capability-invalid',
      'Capability encoding failed.'
    )
    : validation;
};

const decodeCanonicalValue = (
  codecKind: 'dag-cbor' | 'raw',
  bytes: Uint8Array,
  budget: TeleportDecodeBudget
): TeleportResult<unknown> => {
  if (codecKind === 'raw') return ok(bytes.slice());
  const decoded = captureCodecMechanic(
    () => dagCbor.decode(bytes),
    'decode-failed',
    'Capability decoding failed.'
  );
  if (!decoded.ok) return decoded;
  const validation = validateProtocolValue(decoded.value, budget);
  return validation.ok ? ok(decoded.value, decoded.warnings) : validation;
};

export const encodeCapability = async <T>(input: EncodeCapabilityInput<T>): Promise<TeleportResult<EncodedCapabilityBlock<T>>> => {
  if (!INSTANCE_ID.test(input.instanceId)) {
    return err({ code: 'capability-invalid', message: 'Capability instance id is invalid.', instanceId: input.instanceId });
  }
  const projected = input.codec.encode(input.value);
  if (!projected.ok) return projected;
  const budget = completeBudget(input.codec.budget);
  const codecKind = input.codec.codec ?? 'dag-cbor';
  const encoded = encodeCanonicalValue(codecKind, projected.value, budget);
  if (!encoded.ok) return encoded;
  if (encoded.value.byteLength > budget.maxBlockBytes) {
    return err({ code: 'budget-exceeded', message: 'Encoded capability exceeds its byte budget.' });
  }
  const decoded = decodeCapability(input.codec, input.codec.currentVersion, encoded.value);
  if (!decoded.ok) return decoded;
  const roundTrip = input.codec.encode(decoded.value);
  if (!roundTrip.ok) return roundTrip;
  const roundTripBytes = encodeCanonicalValue(codecKind, roundTrip.value, budget);
  if (!roundTripBytes.ok) return roundTripBytes;
  if (!equalBytes(encoded.value, roundTripBytes.value)) {
    return err({ code: 'capability-invalid', message: 'Capability does not produce canonical round-trip bytes.' });
  }
  const cid = CID.createV1(codecKind === 'raw' ? raw.code : dagCbor.code, await sha256.digest(encoded.value));
  return ok({
    capabilityId: input.codec.capabilityId,
    instanceId: input.instanceId,
    schemaVersion: input.codec.currentVersion,
    securityClass: input.codec.securityClass,
    required: input.required ?? true,
    restoreMode: input.restoreMode ?? 'merge',
    codec: codecKind,
    dependencies: input.codec.dependencies?.(decoded.value) ?? [],
    bytes: encoded.value,
    cid,
    value: decoded.value
  });
};

export const decodeCapability = <T>(
  codec: TeleportCapabilityCodec<T>,
  version: number,
  bytes: Uint8Array
): TeleportResult<T> => {
  if (!codec.acceptedVersions.includes(version)) {
    return err({ code: 'unsupported-version', message: `Codec ${codec.capabilityId} does not accept version ${version}.` });
  }
  const budget = completeBudget(codec.budget);
  if (bytes.byteLength > budget.maxBlockBytes) {
    return err({ code: 'budget-exceeded', message: 'Encoded capability exceeds its byte budget.' });
  }
  const decoded = decodeCanonicalValue(codec.codec ?? 'dag-cbor', bytes, budget);
  return decoded.ok ? migrateCapabilityValue(codec, version, decoded.value) : decoded;
};
