import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { describe, expect, it } from 'vitest';

import {
  createTeleportCodecRegistry,
  createTeleportCodecRegistryWith,
  decodeCapability,
  registerTeleportCodec,
  teleportCodecFromRegistry,
  teleportCodecRegistrySupports
} from './codec';
import { err, ok } from './result';
import type { TeleportCapabilityCodec } from './types';

type CodecFixture = Readonly<{ label: string }>;

const fixtureCodec = (acceptedVersions: readonly number[] = [1]): TeleportCapabilityCodec<CodecFixture> => ({
  capabilityId: 'nebular.codec.fixture',
  currentVersion: 1,
  acceptedVersions,
  securityClass: 'public',
  encode: value => ok({ label: value.label }),
  decode: (version, value) => {
    if (version !== 1 || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return err({ code: 'decode-failed', message: 'Fixture is invalid.' });
    }
    const label = Object.entries(value).find(([key]) => key === 'label')?.[1];
    return typeof label === 'string'
      ? ok({ label })
      : err({ code: 'decode-failed', message: 'Fixture label is invalid.' });
  },
  restorePlan: (value, context) => ok([{
    id: `restore:${value.label}`,
    capabilityInstanceId: context.instanceId,
    effect: 'safe-local',
    dependsOn: [],
    resources: [],
    requiresConfirmation: false,
    reversible: true,
    verification: 'fixture restored'
  }])
});

describe('immutable Teleport codec registry', () => {
  it('returns a new frozen registry and leaves the source value unchanged', () => {
    const empty = createTeleportCodecRegistry();
    const registered = registerTeleportCodec(empty, fixtureCodec());

    expect(registered.ok).toBe(true);
    expect(empty).toHaveLength(0);
    if (!registered.ok) return;
    expect(registered.value).toHaveLength(1);
    expect(Object.isFrozen(registered.value)).toBe(true);
    expect(Object.isFrozen(registered.value[0]?.acceptedVersions)).toBe(true);
    expect(teleportCodecRegistrySupports(empty, 'nebular.codec.fixture', 1)).toBe(false);
    expect(teleportCodecRegistrySupports(registered.value, 'nebular.codec.fixture', 1)).toBe(true);
  });

  it('snapshots codec metadata instead of retaining a mutable version array', () => {
    const acceptedVersions: number[] = [1];
    const registered = createTeleportCodecRegistryWith(fixtureCodec(acceptedVersions));
    if (!registered.ok) return;

    acceptedVersions.push(2);

    expect(teleportCodecRegistrySupports(registered.value, 'nebular.codec.fixture', 2)).toBe(false);
  });

  it('rejects duplicate ownership without changing the registered value', () => {
    const registered = createTeleportCodecRegistryWith(fixtureCodec());
    if (!registered.ok) return;
    const duplicate = registerTeleportCodec(registered.value, fixtureCodec());

    expect(duplicate).toMatchObject({ ok: false, issues: [{ code: 'codec-duplicate' }] });
    expect(registered.value).toHaveLength(1);
  });

  it('keeps decode and restore coupled behind the registered existential projection', () => {
    const registered = createTeleportCodecRegistryWith(fixtureCodec());
    if (!registered.ok) return;
    const codec = teleportCodecFromRegistry(registered.value, 'nebular.codec.fixture');
    const bytes = coerce(dagCbor.encode({ label: 'portable' }));

    expect(codec?.decode(1, bytes)).toMatchObject({ ok: true, value: { label: 'portable' } });
    expect(codec?.restorePlan(1, bytes, { instanceId: 'fixture:one', restoreMode: 'merge' })).toMatchObject({
      ok: true,
      value: [{ id: 'restore:portable', capabilityInstanceId: 'fixture:one' }]
    });
  });

  it('maps malformed foreign codec bytes into a typed decode failure', () => {
    expect(decodeCapability(fixtureCodec(), 1, Uint8Array.of(0xff))).toMatchObject({
      ok: false,
      issues: [{ code: 'decode-failed' }]
    });
  });
});
