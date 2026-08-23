import { describe, expect, it } from 'vitest';
import {
  TeleportCodecRegistry,
  composeTeleportRestorePlan,
  createTeleportCartridge,
  decodeTeleportInventory,
  encodeCapability,
  executeTeleportRestorePlan,
  ok,
  protectCapabilityBlocks,
  unlockTeleportCartridge,
  verifyTeleportCartridge,
  type TeleportCapabilityCodec
} from './index';

interface SeamValue {
  readonly label: string;
}

const seamCodec: TeleportCapabilityCodec<SeamValue> = {
  capabilityId: 'nebular.seam.restore',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'private',
  encode: value => ok({ label: value.label }),
  decode: (_version, value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, issues: [{ code: 'decode-failed', message: 'Seam value is invalid.' }] };
    }
    const label = (value as Record<string, unknown>).label;
    return typeof label === 'string'
      ? ok({ label })
      : { ok: false, issues: [{ code: 'decode-failed', message: 'Seam label is invalid.' }] };
  },
  restorePlan: (_value, context) => ok([{
    id: `restore:${context.instanceId}`,
    capabilityInstanceId: context.instanceId,
    effect: 'safe-local',
    dependsOn: [],
    resources: [],
    requiresConfirmation: false,
    reversible: true,
    verification: 'seam value committed',
    rollback: 'restore previous seam value'
  }])
};

describe('codec -> protection -> cartridge -> restore seam', () => {
  it('keeps effects inert until an authorized plan is executed', async () => {
    const encoded = await encodeCapability({ codec: seamCodec, value: { label: 'portable' }, instanceId: 'seam:one' });
    if (!encoded.ok) throw new Error('seam encoding failed');
    const protectedSet = await protectCapabilityBlocks([encoded.value], 'seam passphrase');
    if (!protectedSet.ok) throw new Error('seam protection failed');
    const archive = await createTeleportCartridge({
      capabilities: protectedSet.value.capabilities,
      keyEnvelopes: protectedSet.value.keyEnvelopes
    });
    if (!archive.ok) throw new Error('seam cartridge creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('seam verification failed');
    const registry = new TeleportCodecRegistry();
    expect(registry.register(seamCodec).ok).toBe(true);
    expect(decodeTeleportInventory(verified.value, registry)[0]?.status).toBe('invalid');
    const unlocked = await unlockTeleportCartridge(verified.value, 'seam passphrase');
    if (!unlocked.ok) throw new Error('seam unlock failed');
    const plan = composeTeleportRestorePlan(decodeTeleportInventory(unlocked.value, registry), registry);
    if (!plan.ok) throw new Error('seam planning failed');
    const events: string[] = [];
    const result = await executeTeleportRestorePlan(plan.value, { allowEffects: ['safe-local'] }, {
      stage: async step => { events.push(`stage:${step.id}`); return ok(undefined); },
      commit: async step => { events.push(`commit:${step.id}`); return ok(undefined); },
      verify: async step => { events.push(`verify:${step.id}`); return ok(undefined); },
      rollback: async step => { events.push(`rollback:${step.id}`); return ok(undefined); },
      cleanup: async step => { events.push(`cleanup:${step.id}`); }
    });
    expect(result.ok).toBe(true);
    expect(events).toEqual(['stage:restore:seam:one', 'commit:restore:seam:one', 'verify:restore:seam:one', 'cleanup:restore:seam:one']);
  });
});
