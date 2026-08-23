import { decodeCapability, encodeCapability } from './codec';
import { err, ok, type TeleportResult } from './result';
import type { TeleportCapabilityCodec } from './types';

export interface TeleportHistoricalFixture<TCurrent> {
  readonly version: number;
  readonly bytes: Uint8Array;
  readonly assertCurrent?: (value: TCurrent) => boolean;
}

export interface TeleportInvalidFixture {
  readonly version: number;
  readonly bytes: Uint8Array;
}

export interface TeleportCodecConformanceInput<TCurrent> {
  readonly codec: TeleportCapabilityCodec<TCurrent>;
  readonly currentValue: TCurrent;
  readonly historical?: readonly TeleportHistoricalFixture<TCurrent>[];
  readonly invalid?: readonly TeleportInvalidFixture[];
}

export interface TeleportCodecConformanceReport {
  readonly capabilityId: string;
  readonly canonicalCid: string;
  readonly historicalVersions: readonly number[];
  readonly invalidFixturesRejected: number;
}

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

export const runTeleportCodecConformance = async <TCurrent>(
  input: TeleportCodecConformanceInput<TCurrent>
): Promise<TeleportResult<TeleportCodecConformanceReport>> => {
  const instanceId = 'conformance:current';
  const before = structuredClone(input.currentValue);
  const first = await encodeCapability({ codec: input.codec, value: input.currentValue, instanceId });
  if (!first.ok) return first;
  const second = await encodeCapability({ codec: input.codec, value: input.currentValue, instanceId });
  if (!second.ok) return second;
  if (!first.value.cid.equals(second.value.cid) || !equalBytes(first.value.bytes, second.value.bytes)) {
    return err({ code: 'codec-invalid', message: `Codec ${input.codec.capabilityId} is not deterministic.` });
  }
  const beforeEncoded = await encodeCapability({ codec: input.codec, value: before, instanceId: 'conformance:before' });
  if (!beforeEncoded.ok || !equalBytes(beforeEncoded.value.bytes, first.value.bytes)) {
    return err({ code: 'codec-invalid', message: `Codec ${input.codec.capabilityId} mutates or aliases its input.` });
  }
  const roundTrip = decodeCapability(input.codec, input.codec.currentVersion, first.value.bytes);
  if (!roundTrip.ok) return roundTrip;

  const historicalVersions: number[] = [];
  for (const fixture of input.historical ?? []) {
    const decoded = decodeCapability(input.codec, fixture.version, fixture.bytes);
    if (!decoded.ok || (fixture.assertCurrent && !fixture.assertCurrent(decoded.value))) {
      return err({ code: 'migration-failed', message: `Codec ${input.codec.capabilityId} failed historical fixture version ${fixture.version}.` });
    }
    historicalVersions.push(fixture.version);
  }
  let rejected = 0;
  for (const fixture of input.invalid ?? []) {
    if (decodeCapability(input.codec, fixture.version, fixture.bytes).ok) {
      return err({ code: 'codec-invalid', message: `Codec ${input.codec.capabilityId} accepted an invalid fixture.` });
    }
    rejected += 1;
  }
  return ok({ capabilityId: input.codec.capabilityId, canonicalCid: first.value.cid.toString(), historicalVersions: historicalVersions.toSorted(), invalidFixturesRejected: rejected });
};
