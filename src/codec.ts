import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';

import { validateProtocolValue } from './protocol-value';
import { err, ok, type TeleportResult } from './result';
import {
  DEFAULT_CAPABILITY_BUDGET,
  type EncodedCapabilityBlock,
  type TeleportCapabilityCodec,
  type TeleportDecodeBudget,
  type TeleportRestoreMode
} from './types';

const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const completeBudget = (input?: Partial<TeleportDecodeBudget>): TeleportDecodeBudget => ({
  ...DEFAULT_CAPABILITY_BUDGET,
  ...input
});

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]);

export class TeleportCodecRegistry {
  readonly #codecs = new Map<string, TeleportCapabilityCodec<unknown>>();

  register<T>(codec: TeleportCapabilityCodec<T>): TeleportResult<void> {
    if (!CAPABILITY_ID.test(codec.capabilityId) || !Number.isInteger(codec.currentVersion) || codec.currentVersion < 1) {
      return err({ code: 'codec-invalid', message: 'Codec identity or current version is invalid.' });
    }
    const accepted = new Set(codec.acceptedVersions);
    if (!accepted.has(codec.currentVersion) || [...accepted].some(version => !Number.isInteger(version) || version < 1)) {
      return err({ code: 'codec-invalid', message: 'Codec accepted versions must include the current version.' });
    }
    if (this.#codecs.has(codec.capabilityId)) {
      return err({ code: 'codec-duplicate', message: `Capability codec ${codec.capabilityId} is already registered.` });
    }
    if (codec.migrations?.length) {
      const fromVersions = new Set<number>();
      for (const migration of codec.migrations) {
        if (!Number.isInteger(migration.fromVersion) || !Number.isInteger(migration.toVersion) || migration.fromVersion < 1 || migration.toVersion <= migration.fromVersion || fromVersions.has(migration.fromVersion)) {
          return err({ code: 'codec-invalid', message: `Codec ${codec.capabilityId} has an invalid or overlapping migration.` });
        }
        fromVersions.add(migration.fromVersion);
      }
      if (!codec.decodeHistorical) return err({ code: 'codec-invalid', message: `Codec ${codec.capabilityId} declares migrations without a historical decoder.` });
      for (const version of codec.acceptedVersions.filter(version => version !== codec.currentVersion)) {
        const path = migrationPath(codec, version);
        if (!path.ok) return path;
      }
    }
    this.#codecs.set(codec.capabilityId, codec as TeleportCapabilityCodec<unknown>);
    return ok(undefined);
  }

  codec(capabilityId: string): TeleportCapabilityCodec<unknown> | undefined {
    return this.#codecs.get(capabilityId);
  }

  supports(capabilityId: string, version: number): boolean {
    return this.#codecs.get(capabilityId)?.acceptedVersions.includes(version) === true;
  }
}

const migrationPath = <T>(codec: TeleportCapabilityCodec<T>, sourceVersion: number): TeleportResult<readonly NonNullable<TeleportCapabilityCodec<T>['migrations']>[number][]> => {
  const byFrom = new Map((codec.migrations ?? []).map(migration => [migration.fromVersion, migration] as const));
  const path = [];
  const seen = new Set<number>();
  let version = sourceVersion;
  while (version !== codec.currentVersion) {
    if (seen.has(version)) return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} migration chain contains a cycle.` });
    seen.add(version);
    const migration = byFrom.get(version);
    if (!migration || migration.toVersion > codec.currentVersion) return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} has no complete migration path from version ${sourceVersion}.` });
    path.push(migration);
    version = migration.toVersion;
  }
  return ok(path);
};

export const migrateCapabilityValue = <T>(codec: TeleportCapabilityCodec<T>, version: number, value: unknown): TeleportResult<T> => {
  if (version === codec.currentVersion || !codec.migrations?.length) return codec.decode(version, value);
  if (!codec.decodeHistorical) return err({ code: 'migration-failed', message: `Codec ${codec.capabilityId} has no historical decoder.` });
  const decoded = codec.decodeHistorical(version, value);
  if (!decoded.ok) return decoded;
  const path = migrationPath(codec, version);
  if (!path.ok) return path;
  let current: unknown = decoded.value;
  const warnings = [...decoded.warnings];
  for (const migration of path.value) {
    const migrated = migration.migrate(current);
    if (!migrated.ok) return migrated;
    current = migrated.value;
    warnings.push(...migrated.warnings);
  }
  const final = codec.decode(codec.currentVersion, current);
  return final.ok ? ok(final.value, [...warnings, ...final.warnings]) : final;
};

export interface EncodeCapabilityInput<T> {
  readonly codec: TeleportCapabilityCodec<T>;
  readonly value: T;
  readonly instanceId: string;
  readonly required?: boolean;
  readonly restoreMode?: TeleportRestoreMode;
}

export const encodeCapability = async <T>(input: EncodeCapabilityInput<T>): Promise<TeleportResult<EncodedCapabilityBlock<T>>> => {
  if (!INSTANCE_ID.test(input.instanceId)) {
    return err({ code: 'capability-invalid', message: 'Capability instance id is invalid.', instanceId: input.instanceId });
  }
  const projected = input.codec.encode(input.value);
  if (!projected.ok) return projected;
  const canonicalValue = projected.value;
  const budget = completeBudget(input.codec.budget);
  const codecKind = input.codec.codec ?? 'dag-cbor';
  let bytes: Uint8Array;
  try {
    if (codecKind === 'raw') {
      if (Object.prototype.toString.call(canonicalValue) !== '[object Uint8Array]') return err({ code: 'capability-invalid', message: 'Raw capability encoder must return Uint8Array.' });
      bytes = Uint8Array.from(canonicalValue as Uint8Array);
    } else {
      const validation = validateProtocolValue(canonicalValue, budget);
      if (!validation.ok) return validation;
      bytes = coerce(dagCbor.encode(canonicalValue));
    }
  } catch (cause) {
    return err({ code: 'capability-invalid', message: cause instanceof Error ? cause.message : 'Capability encoding failed.' });
  }
  if (bytes.byteLength > budget.maxBlockBytes) {
    return err({ code: 'budget-exceeded', message: 'Encoded capability exceeds its byte budget.' });
  }
  const decoded = migrateCapabilityValue(input.codec, input.codec.currentVersion, codecKind === 'raw' ? bytes.slice() : dagCbor.decode(bytes));
  if (!decoded.ok) return decoded;
  const roundTrip = input.codec.encode(decoded.value);
  if (!roundTrip.ok) return roundTrip;
  const canonicalRoundTrip = roundTrip.value;
  const roundTripBytes = codecKind === 'raw'
    ? Object.prototype.toString.call(canonicalRoundTrip) === '[object Uint8Array]' ? Uint8Array.from(canonicalRoundTrip as Uint8Array) : new Uint8Array()
    : coerce(dagCbor.encode(canonicalRoundTrip));
  if (!equalBytes(bytes, roundTripBytes)) {
    return err({ code: 'capability-invalid', message: 'Capability does not produce canonical round-trip bytes.' });
  }
  const cid = CID.createV1(codecKind === 'raw' ? raw.code : dagCbor.code, await sha256.digest(bytes));
  return ok({
    capabilityId: input.codec.capabilityId,
    instanceId: input.instanceId,
    schemaVersion: input.codec.currentVersion,
    securityClass: input.codec.securityClass,
    required: input.required ?? true,
    restoreMode: input.restoreMode ?? 'merge',
    codec: codecKind,
    dependencies: input.codec.dependencies?.(decoded.value) ?? [],
    bytes,
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
  try {
    if ((codec.codec ?? 'dag-cbor') === 'raw') return migrateCapabilityValue(codec, version, bytes.slice());
    const value = dagCbor.decode(bytes);
    const validation = validateProtocolValue(value, budget);
    return validation.ok ? migrateCapabilityValue(codec, version, value) : validation;
  } catch (cause) {
    return err({ code: 'decode-failed', message: cause instanceof Error ? cause.message : 'Capability decoding failed.' });
  }
};
