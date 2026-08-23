import { CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it } from 'vitest';

import {
  createTeleportCartridge,
  createPrivateInventoryCartridge,
  addTeleportSignature,
  assetBlobCapabilityCodec,
  assetMetadataCapabilityCodec,
  createTeleportS3Store,
  createTeleportS3Source,
  collectTeleportS3Object,
  composeTeleportRestorePlan,
  decodeTeleportInventory,
  encodeCapability,
  encodeTeleportAsset,
  err,
  ok,
  protectCapabilityBlocks,
  protectCapabilityBlocksForRecipient,
  protectCapabilityBlocksForRecipients,
  planTeleportCloudPublication,
  planTeleportReachabilityRetention,
  publishTeleportCloudCartridge,
  reexportVerifiedCartridge,
  runTeleportCodecConformance,
  streamTeleportCartridge,
  TeleportCodecRegistry,
  unlockTeleportCartridge,
  unlockPrivateInventoryCartridge,
  unlockTeleportCartridgeForRecipient,
  unlockTeleportCartridgeWithUnwrapProvider,
  verifyTeleportCartridge,
  verifyTeleportSignatures,
  verifyTeleportCartridgeStream,
  verifyTeleportGoldenVectorV1,
  writeTeleportCartridge,
  type TeleportCapabilityCodec
} from '../src';

interface FixtureValue {
  readonly count: number;
  readonly label: string;
}

const fixtureCodec: TeleportCapabilityCodec<FixtureValue> = {
  capabilityId: 'wx.fixture.value',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: value => ok({ count: value.count, label: value.label }),
  decode: (version, value) => {
    if (version !== 1 || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return err({ code: 'decode-failed', message: 'Fixture value is invalid.' });
    }
    const record = value as Record<string, unknown>;
    return Object.keys(record).toSorted().join(',') === 'count,label' && Number.isInteger(record.count) && typeof record.label === 'string'
      ? ok({ count: record.count as number, label: record.label })
      : err({ code: 'decode-failed', message: 'Fixture value is invalid.' });
  },
  restorePlan: (_value, context) => ok([{
    id: `restore:${context.instanceId}`,
    capabilityInstanceId: context.instanceId,
    effect: 'safe-local',
    dependsOn: [],
    resources: [],
    requiresConfirmation: false,
    reversible: true,
    verification: 'fixture value committed',
    rollback: 'restore previous fixture value'
  }])
};

describe('Teleport codec kernel', () => {
  it('produces stable canonical bytes and CIDs', async () => {
    const first = await encodeCapability({ codec: fixtureCodec, value: { label: 'alpha', count: 3 }, instanceId: 'fixture:1' });
    const second = await encodeCapability({ codec: fixtureCodec, value: { count: 3, label: 'alpha' }, instanceId: 'fixture:1' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect([...first.value.bytes]).toEqual([...second.value.bytes]);
    expect(first.value.cid.toString()).toBe(second.value.cid.toString());
  });

  it('rejects duplicate codec ownership', () => {
    const registry = new TeleportCodecRegistry();
    expect(registry.register(fixtureCodec).ok).toBe(true);
    const duplicate = registry.register(fixtureCodec);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issues[0]?.code).toBe('codec-duplicate');
  });

  it.each([
    ['Date', new Date('2026-08-23T00:00:00Z')],
    ['Map', new Map([['value', 1]])],
    ['Set', new Set(['value'])],
    ['class instance', new (class RuntimeValue { value = 1; })()]
  ])('rejects an unprojected %s instead of silently encoding an empty object', async (_label, runtimeValue) => {
    const codec: TeleportCapabilityCodec<unknown> = {
      capabilityId: 'wx.fixture.runtime-object',
      currentVersion: 1,
      acceptedVersions: [1],
      securityClass: 'private',
      encode: value => ok({ value }),
      decode: (_version, value) => ok(value)
    };
    expect(await encodeCapability({ codec, value: runtimeValue, instanceId: 'runtime:one' })).toMatchObject({
      ok: false,
      issues: [{ code: 'capability-invalid' }]
    });
  });

  it('rejects cycles and shared aliases before DAG-CBOR encoding', async () => {
    const codec: TeleportCapabilityCodec<unknown> = {
      capabilityId: 'wx.fixture.graph-value',
      currentVersion: 1,
      acceptedVersions: [1],
      securityClass: 'private',
      encode: value => ok(value),
      decode: (_version, value) => ok(value)
    };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const shared = { label: 'shared' };
    const aliased = { first: shared, second: shared };
    expect(await encodeCapability({ codec, value: cyclic, instanceId: 'graph:cycle' })).toMatchObject({ ok: false, issues: [{ code: 'capability-invalid' }] });
    expect(await encodeCapability({ codec, value: aliased, instanceId: 'graph:alias' })).toMatchObject({ ok: false, issues: [{ code: 'capability-invalid' }] });
  });
});

describe('Teleport cartridge dependency graph', () => {
  it('refuses to emit a capability whose bytes do not match its CID', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'original' }, instanceId: 'fixture:tampered' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const tampered = { ...encoded.value, bytes: encoded.value.bytes.map((byte, index) => index === 0 ? byte ^ 0xff : byte) };
    expect(await createTeleportCartridge({ capabilities: [tampered] })).toMatchObject({ ok: false, issues: [{ code: 'cid-mismatch' }] });
  });

  it('rejects missing required dependency targets before assembly', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'dependent' }, instanceId: 'fixture:dependent' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const dependent = {
      ...encoded.value,
      dependencies: [{ kind: 'hard-decode' as const, capabilityId: 'wx.fixture.value', instanceId: 'fixture:missing', required: true }]
    };
    expect(await createTeleportCartridge({ capabilities: [dependent] })).toMatchObject({
      ok: false,
      issues: [{ code: 'dependency-invalid' }]
    });
  });

  it('rejects dependency targets whose instance has the wrong capability id', async () => {
    const first = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'first' }, instanceId: 'fixture:first' });
    const second = await encodeCapability({ codec: fixtureCodec, value: { count: 2, label: 'second' }, instanceId: 'fixture:second' });
    if (!first.ok || !second.ok) throw new Error('fixture encoding failed');
    const dependent = {
      ...first.value,
      dependencies: [{ kind: 'hard-decode' as const, capabilityId: 'wx.other.value', instanceId: 'fixture:second', required: true }]
    };
    expect(await createTeleportCartridge({ capabilities: [dependent, second.value] })).toMatchObject({
      ok: false,
      issues: [{ code: 'dependency-invalid' }]
    });
  });

  it('rejects cyclic hard-decode and restore-order dependencies', async () => {
    const first = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'first' }, instanceId: 'fixture:first' });
    const second = await encodeCapability({ codec: fixtureCodec, value: { count: 2, label: 'second' }, instanceId: 'fixture:second' });
    if (!first.ok || !second.ok) throw new Error('fixture encoding failed');
    const capabilities = [
      { ...first.value, dependencies: [{ kind: 'hard-decode' as const, capabilityId: fixtureCodec.capabilityId, instanceId: second.value.instanceId, required: true }] },
      { ...second.value, dependencies: [{ kind: 'restore-order' as const, capabilityId: fixtureCodec.capabilityId, instanceId: first.value.instanceId, required: true }] }
    ];
    expect(await createTeleportCartridge({ capabilities })).toMatchObject({
      ok: false,
      issues: [{ code: 'dependency-invalid' }]
    });
  });

  it('allows an absent optional dependency without weakening required graph checks', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'optional' }, instanceId: 'fixture:optional' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const capability = {
      ...encoded.value,
      dependencies: [{ kind: 'hard-decode' as const, capabilityId: 'wx.optional.value', instanceId: 'optional:missing', required: false }]
    };
    expect((await createTeleportCartridge({ capabilities: [capability] })).ok).toBe(true);
  });

  it('canonicalizes capability and dependency ordering into identical roots and CAR bytes', async () => {
    const first = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'first' }, instanceId: 'fixture:first' });
    const second = await encodeCapability({ codec: fixtureCodec, value: { count: 2, label: 'second' }, instanceId: 'fixture:second' });
    if (!first.ok || !second.ok) throw new Error('fixture encoding failed');
    const dependencies = [
      { kind: 'optional-enhancement' as const, capabilityId: 'wx.optional.zed', required: false },
      { kind: 'hard-decode' as const, capabilityId: fixtureCodec.capabilityId, instanceId: first.value.instanceId, required: true }
    ];
    const forward = await createTeleportCartridge({ capabilities: [first.value, { ...second.value, dependencies }], createdAt: '2026-08-23T00:00:00Z' });
    const reverse = await createTeleportCartridge({ capabilities: [{ ...second.value, dependencies: dependencies.toReversed() }, first.value], createdAt: '2026-08-23T00:00:00Z' });
    if (!forward.ok || !reverse.ok) throw new Error('cartridge assembly failed');
    expect(reverse.value.root.equals(forward.value.root)).toBe(true);
    expect(Array.from(reverse.value.bytes)).toEqual(Array.from(forward.value.bytes));
  });
});

describe('Teleport cartridge graph', () => {
  it('round trips a supported capability', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 7, label: 'roundtrip' }, instanceId: 'fixture:roundtrip' });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const archive = await createTeleportCartridge({ capabilities: [encoded.value], createdAt: '2026-08-22T00:00:00.000Z' });
    expect(archive.ok).toBe(true);
    if (!archive.ok) return;
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const registry = new TeleportCodecRegistry();
    registry.register(fixtureCodec);
    const inventory = decodeTeleportInventory(verified.value, registry);
    expect(inventory).toMatchObject([{ status: 'supported', value: { count: 7, label: 'roundtrip' } }]);
    const plan = composeTeleportRestorePlan(inventory, registry);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value.steps.map(step => step.id)).toEqual(['restore:fixture:roundtrip']);
  });

  it('retains an unsupported optional capability byte-for-byte', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 4, label: 'opaque' }, instanceId: 'fixture:opaque', required: false });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value], createdAt: '2026-08-22T00:00:00.000Z' });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    expect(decodeTeleportInventory(verified.value, new TeleportCodecRegistry())[0]?.status).toBe('unsupported-optional');
    const retainedPlan = composeTeleportRestorePlan(decodeTeleportInventory(verified.value, new TeleportCodecRegistry()), new TeleportCodecRegistry());
    expect(retainedPlan.ok).toBe(true);
    if (retainedPlan.ok) expect(retainedPlan.value.unresolvedOptionalInstances).toEqual(['fixture:opaque']);
    const reexported = await reexportVerifiedCartridge(verified.value);
    expect(reexported.ok).toBe(true);
    if (!reexported.ok) return;
    expect([...reexported.value.bytes]).toEqual([...archive.value.bytes]);
  });

  it('classifies an unsupported required capability as a blocker', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 'required' }, instanceId: 'fixture:required' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    expect(decodeTeleportInventory(verified.value, new TeleportCodecRegistry())[0]?.status).toBe('unsupported-required');
  });

  it('rejects unreferenced blocks', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 2, label: 'extra' }, instanceId: 'fixture:extra' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('archive creation failed');
    const extraBytes = coerce(dagCbor.encode({ extra: true }));
    const extraCid = CID.createV1(dagCbor.code, await sha256.digest(extraBytes));
    const manifestBytes = coerce(dagCbor.encode(archive.value.manifest));
    const { writer, out } = CarWriter.create([archive.value.root]);
    const chunksPromise = (async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of out) chunks.push(chunk);
      return chunks;
    })();
    await writer.put({ cid: archive.value.root, bytes: manifestBytes });
    await writer.put({ cid: encoded.value.cid, bytes: encoded.value.bytes });
    await writer.put({ cid: extraCid, bytes: extraBytes });
    await writer.close();
    const chunks = await chunksPromise;
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const verified = await verifyTeleportCartridge(bytes);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.issues[0]?.message).toContain('unreferenced');
  });
});

describe('Teleport protection profiles', () => {
  it('supports protected and selective cartridges without changing capability codecs', async () => {
    const secret = await encodeCapability({ codec: fixtureCodec, value: { count: 9, label: 'secret' }, instanceId: 'fixture:secret' });
    const visible = await encodeCapability({ codec: fixtureCodec, value: { count: 10, label: 'visible' }, instanceId: 'fixture:visible', required: false });
    if (!secret.ok || !visible.ok) throw new Error('fixture encoding failed');
    const protectedSet = await protectCapabilityBlocks([secret.value], 'correct horse battery staple');
    expect(protectedSet.ok).toBe(true);
    if (!protectedSet.ok) return;
    const archive = await createTeleportCartridge({
      capabilities: [...protectedSet.value.capabilities, visible.value],
      keyEnvelopes: protectedSet.value.keyEnvelopes,
      createdAt: '2026-08-22T00:00:00.000Z'
    });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    const registry = new TeleportCodecRegistry();
    registry.register(fixtureCodec);
    expect(decodeTeleportInventory(verified.value, registry).map(entry => entry.status)).toEqual(['invalid', 'supported']);

    const wrong = await unlockTeleportCartridge(verified.value, 'wrong passphrase');
    expect(wrong.ok).toBe(false);
    const unlocked = await unlockTeleportCartridge(verified.value, 'correct horse battery staple');
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) return;
    expect(decodeTeleportInventory(unlocked.value, registry)).toMatchObject([
      { status: 'supported', value: { count: 9, label: 'secret' } },
      { status: 'supported', value: { count: 10, label: 'visible' } }
    ]);
    const reexported = await reexportVerifiedCartridge(verified.value);
    expect(reexported.ok).toBe(true);
    if (reexported.ok) expect([...reexported.value.bytes]).toEqual([...archive.value.bytes]);
  });
});

describe('Teleport cloud transport profile', () => {
  it('publishes immutable children before the root and the conditional head last', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 12, label: 'cloud' }, instanceId: 'fixture:cloud' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    const planned = planTeleportCloudPublication(verified.value);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.objects.at(-1)?.kind).toBe('root');

    const events: string[] = [];
    const published = await publishTeleportCloudCartridge(verified.value, {
      putImmutable: async object => {
        events.push(`put:${object.kind}:${object.cid}`);
        return ok('created');
      },
      publishHead: async head => {
        events.push(`head:${head.workspaceId}:${head.root}:${head.previousVersion}`);
        return ok({ version: 'head-v2' });
      }
    }, { workspaceId: 'analyst', previousHeadVersion: 'head-v1' });
    expect(published).toMatchObject({ ok: true, value: { headVersion: 'head-v2' } });
    expect(events.at(-1)).toContain('head:analyst:');
    expect(events.at(-2)).toContain('put:root:');
  });

  it('maps immutable blocks and conditional heads onto tenant-scoped S3 operations', async () => {
    const puts: Array<{ key: string; ifMatch?: string; ifNoneMatch?: '*'; checksumSha256: string }> = [];
    const store = createTeleportS3Store({
      putObject: async input => {
        puts.push({ key: input.key, checksumSha256: input.checksumSha256, ...(input.ifMatch ? { ifMatch: input.ifMatch } : {}), ...(input.ifNoneMatch ? { ifNoneMatch: input.ifNoneMatch } : {}) });
        return ok({ version: `v${puts.length}` });
      }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    expect(store.ok).toBe(true);
    if (!store.ok) return;
    const immutable = await store.value.putImmutable({ cid: (await encodeCapability({ codec: fixtureCodec, value: { count: 1, label: 's3' }, instanceId: 'fixture:s3' }) as { ok: true; value: { cid: CID } }).value.cid, bytes: Uint8Array.of(1), kind: 'capability' });
    expect(immutable.ok).toBe(true);
    const head = await store.value.publishHead?.({ workspaceId: 'main', root: 'bafy-root', previousVersion: 'etag-v1' });
    expect(head?.ok).toBe(true);
    expect(puts[0]).toMatchObject({ key: expect.stringContaining('tenant/acme/blocks/'), ifNoneMatch: '*', checksumSha256: expect.any(String) });
    expect(puts[1]).toMatchObject({ key: 'tenant/acme/heads/main.json', ifMatch: 'etag-v1' });
  });

  it('preserves idempotent immutable-object exists outcomes from an S3 adapter', async () => {
    const store = createTeleportS3Store({
      putObject: async () => ok({ version: 'existing-version', outcome: 'exists' })
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    if (!store.ok) throw new Error('S3 store creation failed');
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 23, label: 'exists' }, instanceId: 'fixture:exists' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    expect(await store.value.putImmutable({ cid: encoded.value.cid, bytes: encoded.value.bytes, kind: 'capability' }))
      .toMatchObject({ ok: true, value: 'exists' });
  });

  it('uses the multipart seam for large objects and computes reachability deletion candidates', async () => {
    const calls: string[] = [];
    const store = createTeleportS3Store({
      putObject: async () => { calls.push('single'); return ok({ version: 'single' }); },
      putMultipart: async input => { calls.push(`multipart:${input.partSizeBytes}`); return ok({ version: 'multi' }); }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme', multipartThresholdBytes: 2, multipartPartSizeBytes: 2 });
    if (!store.ok) throw new Error('S3 store creation failed');
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 19, label: 'retention' }, instanceId: 'fixture:retention' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    await store.value.putImmutable({ cid: encoded.value.cid, bytes: encoded.value.bytes, kind: 'capability' });
    expect(calls).toEqual(['multipart:2']);
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    const publication = planTeleportCloudPublication(verified.value);
    if (!publication.ok) throw new Error('publication plan failed');
    const retention = planTeleportReachabilityRetention([publication.value], [publication.value.root], [...publication.value.objects.map(object => object.cid.toString()), 'bafy-orphan']);
    expect(retention).toMatchObject({ ok: true, value: { deleteCandidateCids: ['bafy-orphan'] } });
  });
});

describe('raw capability codec', () => {
  it('retains opaque bytes and uses a raw CID', async () => {
    const codec: TeleportCapabilityCodec<Uint8Array> = {
      capabilityId: 'wx.asset.blob',
      currentVersion: 1,
      acceptedVersions: [1],
      securityClass: 'opaque-native',
      codec: 'raw',
      encode: value => ok(value.slice()),
      decode: (_version, value) => value instanceof Uint8Array ? ok(value.slice()) : err({ code: 'decode-failed', message: 'Expected bytes.' })
    };
    const encoded = await encodeCapability({ codec, value: Uint8Array.of(1, 2, 3), instanceId: 'asset:one' });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.codec).toBe('raw');
    expect(encoded.value.cid.code).toBe(0x55);
  });
});

describe('recipient protection profile', () => {
  it('unlocks only for the addressed RSA-OAEP recipient', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 14, label: 'recipient' }, instanceId: 'fixture:recipient' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const protectedSet = await protectCapabilityBlocksForRecipient([encoded.value], { keyId: 'recipient-one', publicKey: pair.publicKey });
    expect(protectedSet.ok).toBe(true);
    if (!protectedSet.ok) return;
    const archive = await createTeleportCartridge({ capabilities: protectedSet.value.capabilities, keyEnvelopes: protectedSet.value.keyEnvelopes });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    const unlocked = await unlockTeleportCartridgeForRecipient(verified.value, { keyId: 'recipient-one', privateKey: pair.privateKey });
    expect(unlocked.ok).toBe(true);
    const wrongIdentity = await unlockTeleportCartridgeForRecipient(verified.value, { keyId: 'recipient-two', privateKey: pair.privateKey });
    expect(wrongIdentity).toMatchObject({ ok: false, issues: [{ code: 'policy-rejected' }] });
  });

  it('supports recipient rotation without re-encrypting capability blocks', async () => {
    const first = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
    const second = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 18, label: 'rotated' }, instanceId: 'fixture:rotated' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const protectedSet = await protectCapabilityBlocksForRecipients([encoded.value], [{ keyId: 'device-old', publicKey: first.publicKey }, { keyId: 'device-new', publicKey: second.publicKey }]);
    if (!protectedSet.ok) throw new Error('recipient protection failed');
    expect(protectedSet.value.keyEnvelopes).toHaveLength(2);
    const archive = await createTeleportCartridge({ capabilities: protectedSet.value.capabilities, keyEnvelopes: protectedSet.value.keyEnvelopes });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    expect((await unlockTeleportCartridgeForRecipient(verified.value, { keyId: 'device-old', privateKey: first.privateKey })).ok).toBe(true);
    expect((await unlockTeleportCartridgeForRecipient(verified.value, { keyId: 'device-new', privateKey: second.privateKey })).ok).toBe(true);
  });

  it('supports operation-mediated account unwrap without exposing a private key', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 19, label: 'account' }, instanceId: 'fixture:account' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const protectedSet = await protectCapabilityBlocksForRecipient([encoded.value], { keyId: 'account-kms:tenant-key', publicKey: pair.publicKey });
    if (!protectedSet.ok) throw new Error('recipient protection failed');
    const archive = await createTeleportCartridge({ capabilities: protectedSet.value.capabilities, keyEnvelopes: protectedSet.value.keyEnvelopes });
    if (!archive.ok) throw new Error('archive creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('archive verification failed');
    const requestedKeyIds: string[] = [];
    const unlocked = await unlockTeleportCartridgeWithUnwrapProvider(verified.value, {
      providerId: 'account-kms',
      unwrapKey: async (keyId, wrappedKey) => {
        requestedKeyIds.push(keyId);
        return ok(new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, wrappedKey)));
      }
    });
    expect(unlocked.ok).toBe(true);
    expect(requestedKeyIds).toEqual(['tenant-key']);
  });
});

describe('bounded CAR stream ingestion', () => {
  it('accepts chunked input and stops once the configured byte budget is exceeded', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 15, label: 'stream' }, instanceId: 'fixture:stream' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('archive creation failed');
    const archiveBytes = archive.value.bytes;
    async function* chunks() {
      for (let offset = 0; offset < archiveBytes.length; offset += 11) yield archiveBytes.slice(offset, offset + 11);
    }
    expect((await verifyTeleportCartridgeStream(chunks())).ok).toBe(true);
    expect(await verifyTeleportCartridgeStream(chunks(), { maxCarBytes: 8 })).toMatchObject({ ok: false, issues: [{ code: 'budget-exceeded' }] });
  });

  it('writes incrementally with backpressure without requiring an archive-sized buffer', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 20, label: 'incremental'.repeat(400) }, instanceId: 'fixture:incremental' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const chunks: Uint8Array[] = [];
    let writes = 0;
    const written = await writeTeleportCartridge({ capabilities: [encoded.value] }, {
      write: async chunk => { writes += 1; chunks.push(chunk.slice()); await Promise.resolve(); }
    });
    expect(written.ok).toBe(true);
    expect(writes).toBeGreaterThan(1);
    async function* replay() { for (const chunk of chunks) yield chunk; }
    expect((await verifyTeleportCartridgeStream(replay())).ok).toBe(true);
    const streamed = await streamTeleportCartridge({ capabilities: [encoded.value] });
    expect(streamed.ok).toBe(true);
    if (!streamed.ok) return;
    let observed = 0;
    for await (const chunk of streamed.value.chunks) observed += chunk.byteLength;
    expect(observed).toBe(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  });

  it('propagates sink failure as a typed execution error', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 21, label: 'sink-failure' }, instanceId: 'fixture:sink' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    expect(await writeTeleportCartridge({ capabilities: [encoded.value] }, { write: async () => { throw new Error('storage unavailable'); } }))
      .toMatchObject({ ok: false, issues: [{ code: 'execution-failed', message: 'storage unavailable' }] });
  });
});

describe('tenant-scoped S3 range source', () => {
  it('maps immutable CID ranges and enforces declared stream lengths and budgets', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 22, label: 'range' }, instanceId: 'fixture:range' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const requests: Array<{ key: string; start?: number; endExclusive?: number }> = [];
    const source = createTeleportS3Source({
      putObject: async () => ok({ version: 'unused' }),
      getObject: async input => {
        requests.push({ key: input.key, ...(input.range ? input.range : {}) });
        const selected = input.range ? encoded.value.bytes.slice(input.range.start, input.range.endExclusive) : encoded.value.bytes;
        async function* body() { for (let offset = 0; offset < selected.length; offset += 3) yield selected.slice(offset, offset + 3); }
        return ok({ body: body(), contentLength: selected.length, totalLength: encoded.value.bytes.length, version: 'etag-1' });
      }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const ranged = await source.value.readObject(encoded.value.cid.toString(), 'capability', { start: 1, endExclusive: 6 });
    expect(ranged.ok).toBe(true);
    if (!ranged.ok) return;
    expect(await collectTeleportS3Object(ranged.value, 5)).toMatchObject({ ok: true });
    expect(requests).toEqual([{ key: `tenant/acme/blocks/${encoded.value.cid}`, start: 1, endExclusive: 6 }]);
    expect(await source.value.readObject('../escape', 'capability')).toMatchObject({ ok: false, issues: [{ code: 'dependency-invalid' }] });
    expect(await source.value.readObject(encoded.value.cid.toString(), 'capability', { start: 6, endExclusive: 1 })).toMatchObject({ ok: false });
  });
});

describe('cross-runtime golden vector', () => {
  it('locks canonical capability, root, and complete archive bytes', async () => {
    expect(await verifyTeleportGoldenVectorV1()).toMatchObject({ ok: true, value: { archiveByteLength: 514 } });
  });
});

describe('self-contained graph signatures', () => {
  it('binds an Ed25519 signature to the canonical capability and envelope graph', async () => {
    const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 16, label: 'signed' }, instanceId: 'fixture:signed' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const unsigned = await createTeleportCartridge({ capabilities: [encoded.value], createdAt: '2026-08-22T00:00:00Z' });
    if (!unsigned.ok) throw new Error('archive creation failed');
    const verifiedUnsigned = await verifyTeleportCartridge(unsigned.value.bytes);
    if (!verifiedUnsigned.ok) throw new Error('archive verification failed');
    const signed = await addTeleportSignature(verifiedUnsigned.value, { keyId: 'release-key', privateKey: pair.privateKey });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const verifiedSigned = await verifyTeleportCartridge(signed.value.bytes);
    expect(verifiedSigned.ok).toBe(true);
    if (!verifiedSigned.ok) return;
    expect(verifiedSigned.value.signatures).toHaveLength(1);
    expect(await verifyTeleportSignatures(verifiedSigned.value, [{ keyId: 'release-key', publicKey: pair.publicKey }], ['release-key']))
      .toMatchObject({ ok: true, value: { verifiedSignerKeyIds: ['release-key'] } });

    const otherPair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    expect(await verifyTeleportSignatures(verifiedSigned.value, [{ keyId: 'release-key', publicKey: otherPair.publicKey }], ['release-key']))
      .toMatchObject({ ok: false, issues: [{ code: 'signature-invalid' }] });
  });
});

describe('private inventory profile', () => {
  it('hides the manifest and reconstructs the exact verified graph only after unlock', async () => {
    const encoded = await encodeCapability({ codec: fixtureCodec, value: { count: 17, label: 'private-inventory-secret-marker' }, instanceId: 'fixture:private' });
    if (!encoded.ok) throw new Error('fixture encoding failed');
    const protectedSet = await protectCapabilityBlocks([encoded.value], 'capability-passphrase');
    if (!protectedSet.ok) throw new Error('capability protection failed');
    const standard = await createTeleportCartridge({ capabilities: protectedSet.value.capabilities, keyEnvelopes: protectedSet.value.keyEnvelopes });
    if (!standard.ok) throw new Error('archive creation failed');
    const privateArchive = await createPrivateInventoryCartridge(standard.value, 'inventory-passphrase');
    expect(privateArchive.ok).toBe(true);
    if (!privateArchive.ok) return;
    expect(new TextDecoder().decode(privateArchive.value.bytes)).not.toContain('wx.fixture.value');
    expect(await unlockPrivateInventoryCartridge(privateArchive.value.bytes, 'wrong')).toMatchObject({ ok: false });
    const unlockedInventory = await unlockPrivateInventoryCartridge(privateArchive.value.bytes, 'inventory-passphrase');
    expect(unlockedInventory.ok).toBe(true);
    if (!unlockedInventory.ok) return;
    expect(unlockedInventory.value.root.equals(standard.value.root)).toBe(true);
    const unlockedContent = await unlockTeleportCartridge(unlockedInventory.value, 'capability-passphrase');
    expect(unlockedContent.ok).toBe(true);
  });
});

describe('migration chains and codec conformance', () => {
  it('runs a pure historical chain and rejects migration gaps at registration', async () => {
    const codec: TeleportCapabilityCodec<{ label: string; count: number }> = {
      capabilityId: 'wx.fixture.migrating',
      currentVersion: 3,
      acceptedVersions: [1, 2, 3],
      securityClass: 'public',
      encode: value => ok({ count: value.count, label: value.label }),
      decode: (version, value) => {
        if (version !== 3 || typeof value !== 'object' || value === null) return err({ code: 'decode-failed', message: 'Current migrating fixture is invalid.' });
        const record = value as Record<string, unknown>;
        return typeof record.label === 'string' && Number.isInteger(record.count) ? ok({ label: record.label, count: record.count as number }) : err({ code: 'decode-failed', message: 'Current migrating fixture is invalid.' });
      },
      decodeHistorical: (version, value) => version === 1 || version === 2 ? ok(value) : err({ code: 'decode-failed', message: 'Historical fixture is invalid.' }),
      migrations: [
        { fromVersion: 1, toVersion: 2, lossyFields: [], migrate: value => typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).name === 'string' ? ok({ label: (value as Record<string, unknown>).name, count: 0 }) : err({ code: 'migration-failed', message: 'v1 invalid' }) },
        { fromVersion: 2, toVersion: 3, lossyFields: [], migrate: value => ok(value) }
      ]
    };
    const registry = new TeleportCodecRegistry();
    expect(registry.register(codec).ok).toBe(true);
    const historicalBytes = coerce(dagCbor.encode({ name: 'legacy' }));
    const report = await runTeleportCodecConformance({ codec, currentValue: { label: 'current', count: 2 }, historical: [{ version: 1, bytes: historicalBytes, assertCurrent: value => value.label === 'legacy' && value.count === 0 }] });
    expect(report).toMatchObject({ ok: true, value: { historicalVersions: [1] } });

    const gapRegistry = new TeleportCodecRegistry();
    expect(gapRegistry.register({ ...codec, capabilityId: 'wx.fixture.gap', migrations: codec.migrations!.slice(1) })).toMatchObject({ ok: false, issues: [{ code: 'migration-failed' }] });
  });
});

describe('portable asset capabilities', () => {
  it('keeps raw bytes content-addressed and metadata independently composable', async () => {
    const asset = await encodeTeleportAsset({ name: 'storm.png', mediaType: 'image/png', bytes: Uint8Array.of(137, 80, 78, 71), instanceId: 'asset:storm' });
    expect(asset.ok).toBe(true);
    if (!asset.ok) return;
    expect(asset.value.blob.codec).toBe('raw');
    expect(asset.value.metadata.dependencies).toEqual([{ kind: 'hard-decode', capabilityId: 'wx.asset.blob', instanceId: 'asset:storm:blob', required: true }]);
    const registry = new TeleportCodecRegistry();
    expect(registry.register(assetBlobCapabilityCodec).ok).toBe(true);
    expect(registry.register(assetMetadataCapabilityCodec).ok).toBe(true);
    const archive = await createTeleportCartridge({ capabilities: [asset.value.metadata, asset.value.blob] });
    if (!archive.ok) throw new Error('asset archive failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('asset archive verification failed');
    expect(decodeTeleportInventory(verified.value, registry).every(entry => entry.status === 'supported')).toBe(true);
  });
});
