import { createTeleportCartridge } from './cartridge';
import { encodeCapability } from './codec';
import { err, ok, type TeleportResult } from './result';
import type { TeleportCapabilityCodec } from './types';

export interface TeleportGoldenVectorV1 {
  readonly capabilityCid: string;
  readonly cartridgeRoot: string;
  readonly archiveSha256Hex: string;
  readonly archiveByteLength: number;
}

export const TELEPORT_GOLDEN_VECTOR_V1: TeleportGoldenVectorV1 = Object.freeze({
  capabilityCid: 'bafyreig2xbhupqigptpj7jag27ikm6l26bnme3nphjwhkxzmldj6dpxrbq',
  cartridgeRoot: 'bafyreic7coz5dpgv7v3qup27dq7kawikvzjzqxqnavctuqoqv5kuirrfdu',
  archiveSha256Hex: '8af3d480a227a376fff91d14863f31890f5241980bb67a389a0bf7f88d9fda8e',
  archiveByteLength: 514
});

type TeleportGoldenPayload = Readonly<{ count: number; label: string }>;

const GOLDEN_VECTOR_FIELDS: readonly (keyof TeleportGoldenVectorV1)[] = [
  'capabilityCid',
  'cartridgeRoot',
  'archiveSha256Hex',
  'archiveByteLength'
];

const decodeGoldenPayload = (version: number, value: unknown): TeleportResult<TeleportGoldenPayload> => {
  if (
    version !== 1
    || typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || !('count' in value)
    || !('label' in value)
  ) {
    return err({ code: 'decode-failed', message: 'Golden vector payload is invalid.' });
  }
  const count = value.count;
  const label = value.label;
  return typeof count === 'number' && typeof label === 'string'
    ? ok({ count, label })
    : err({ code: 'decode-failed', message: 'Golden vector payload is invalid.' });
};

const goldenCodec: TeleportCapabilityCodec<TeleportGoldenPayload> = {
  capabilityId: 'wx.conformance.golden',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: value => ok({ count: value.count, label: value.label }),
  decode: decodeGoldenPayload
};

const hex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

export const createTeleportGoldenVectorV1 = async (): Promise<TeleportResult<TeleportGoldenVectorV1>> => {
  const capability = await encodeCapability({
    codec: goldenCodec,
    value: { count: 42, label: 'wx-teleport-browser-golden-v1' },
    instanceId: 'golden:one',
    required: true,
    restoreMode: 'merge'
  });
  if (!capability.ok) return capability;
  const archive = await createTeleportCartridge({
    capabilities: [capability.value],
    createdAt: '2026-08-22T00:00:00.000Z'
  });
  if (!archive.ok) return archive;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(archive.value.bytes).buffer));
  return ok({
    capabilityCid: capability.value.cid.toString(),
    cartridgeRoot: archive.value.root.toString(),
    archiveSha256Hex: hex(digest),
    archiveByteLength: archive.value.bytes.byteLength
  });
};

export const verifyTeleportGoldenVectorV1 = async (): Promise<TeleportResult<TeleportGoldenVectorV1>> => {
  const actual = await createTeleportGoldenVectorV1();
  if (!actual.ok) return actual;
  const mismatch = GOLDEN_VECTOR_FIELDS.find(field => actual.value[field] !== TELEPORT_GOLDEN_VECTOR_V1[field]);
  return mismatch
    ? err({ code: 'verification-failed', message: `Teleport golden vector mismatch at ${mismatch}.` })
    : actual;
};
