import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decodeCapability, encodeCapability } from './codec.ts';
import { err, ok } from './result.ts';
import type { TeleportCapabilityCodec } from './types.ts';

type CanonicalFixture = Readonly<{
  first: string;
  second: string;
  reverse: boolean;
}>;

const canonicalFixtureCodec: TeleportCapabilityCodec<CanonicalFixture> = {
  capabilityId: 'nebular.codec.canonical-property',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: value => ok(value.reverse
    ? { second: value.second, first: value.first }
    : { first: value.first, second: value.second }),
  decode: (version, value) => {
    if (version !== 1 || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return err({ code: 'decode-failed', message: 'Canonical fixture is invalid.' });
    }
    const record = value as Readonly<Record<string, unknown>>;
    return typeof record['first'] === 'string' && typeof record['second'] === 'string'
      ? ok({ first: record['first'], second: record['second'], reverse: false })
      : err({ code: 'decode-failed', message: 'Canonical fixture fields are invalid.' });
  }
};

const text = fc.stringMatching(/^[A-Za-z0-9._-]{1,64}$/u);

const bytes = (value: Uint8Array): readonly number[] => [...value];

describe('canonical Teleport codec laws', () => {
  it('is independent of source object insertion order and preserves decode-reencode bytes', async () => {
    await fc.assert(fc.asyncProperty(text, text, async (first, second) => {
      const normal = await encodeCapability({
        codec: canonicalFixtureCodec,
        value: { first, second, reverse: false },
        instanceId: 'canonical-property'
      });
      const reversed = await encodeCapability({
        codec: canonicalFixtureCodec,
        value: { first, second, reverse: true },
        instanceId: 'canonical-property'
      });

      expect(normal.ok && reversed.ok).toBe(true);
      if (!normal.ok || !reversed.ok) return;
      expect(bytes(reversed.value.bytes)).toEqual(bytes(normal.value.bytes));
      expect(reversed.value.cid.toString()).toBe(normal.value.cid.toString());

      const decoded = decodeCapability(canonicalFixtureCodec, 1, normal.value.bytes);
      expect(decoded).toEqual({ ok: true, value: { first, second, reverse: false }, warnings: [] });
      if (!decoded.ok) return;
      const reencoded = await encodeCapability({
        codec: canonicalFixtureCodec,
        value: decoded.value,
        instanceId: 'canonical-property'
      });
      expect(reencoded.ok).toBe(true);
      if (!reencoded.ok) return;
      expect(bytes(reencoded.value.bytes)).toEqual(bytes(normal.value.bytes));
      expect(reencoded.value.cid.toString()).toBe(normal.value.cid.toString());
    }));
  });
});
