import { describe, expect, it } from 'vitest';
import {
  createTeleportCartridge,
  encodeCapability,
  ok,
  publishTeleportCloudCartridge,
  verifyTeleportCartridge,
  type TeleportCapabilityCodec
} from './public';

const transportSeamCodec: TeleportCapabilityCodec<string> = {
  capabilityId: 'nebular.seam.transport',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: value => ok({ value }),
  decode: (_version, value) => typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>)['value'] === 'string'
    ? ok((value as Record<string, string>)['value'] ?? '')
    : { ok: false, issues: [{ code: 'decode-failed', message: 'Transport seam value is invalid.' }] },
  restorePlan: () => ok([])
};

describe('verified cartridge -> cloud publication seam', () => {
  it('publishes immutable graph objects before the conditional mutable head', async () => {
    const encoded = await encodeCapability({ codec: transportSeamCodec, value: 'cloud', instanceId: 'seam:cloud' });
    if (!encoded.ok) throw new Error('transport seam encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('transport seam cartridge creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('transport seam verification failed');
    const events: string[] = [];
    const published = await publishTeleportCloudCartridge(verified.value, {
      putImmutable: async object => { events.push(`put:${object.kind}`); return ok('created'); },
      publishHead: async head => { events.push(`head:${head.workspaceId}`); return ok({ version: 'v1' }); }
    }, { workspaceId: 'seam-workspace' });
    expect(published).toMatchObject({ ok: true, value: { headVersion: 'v1' } });
    expect(events.at(-1)).toBe('head:seam-workspace');
    expect(events.slice(0, -1).every(event => event.startsWith('put:'))).toBe(true);
  });
});
