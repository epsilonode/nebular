import { describe, expect, it } from 'vitest';

import {
  composeTeleportRestorePlan,
  createTeleportCodecRegistryWith,
  createTeleportCartridge,
  decodeTeleportInventory,
  decodeCapability,
  encodeCapability,
  runTeleportCodecConformance,
  verifyTeleportCartridge
} from '../teleport/public.ts';
import {
  CREDENTIAL_REQUIREMENT_CAPABILITY_ID,
  CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
  credentialRequirementCapabilityCodec,
  type CredentialRequirementV1
} from './credential-requirement.ts';

const fixture = (): CredentialRequirementV1 => ({
  type: CREDENTIAL_REQUIREMENT_CAPABILITY_ID,
  version: CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
  provider: 'weather-provider',
  environment: 'production',
  scopes: ['forecast.read', 'alerts.read'],
  operations: ['completion', 'models.read'],
  projectBinding: { policy: 'exact-repository', repository: 'R:/Code/weather-client' },
  injectionName: 'WEATHER_PROVIDER_TOKEN',
  accountConstraint: { accountId: 'account-7', accountLabel: 'Development' }
});

describe('credential-requirement capability codec', () => {
  it('passes canonical conformance and retains requirements without an authority effect', async () => {
    const report = await runTeleportCodecConformance({
      codec: credentialRequirementCapabilityCodec,
      currentValue: fixture()
    });
    expect(report).toMatchObject({
      ok: true,
      value: { capabilityId: CREDENTIAL_REQUIREMENT_CAPABILITY_ID }
    });

    const plan = credentialRequirementCapabilityCodec.restorePlan?.(fixture(), {
      instanceId: 'credential:weather',
      restoreMode: 'merge'
    });
    expect(plan).toMatchObject({
      ok: true,
      value: [expect.objectContaining({
        effect: 'unresolved-retain',
        resources: [],
        requiresConfirmation: false
      })]
    });
  });

  it('canonicalizes scopes and operations while preserving exact project and account constraints', async () => {
    const encoded = await encodeCapability({
      codec: credentialRequirementCapabilityCodec,
      value: {
        ...fixture(),
        scopes: ['forecast.read', 'alerts.read'],
        operations: ['models.read', 'completion']
      },
      instanceId: 'credential:weather'
    });
    if (!encoded.ok) throw new Error('credential requirement encoding failed');
    const decoded = decodeCapability(
      credentialRequirementCapabilityCodec,
      CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
      encoded.value.bytes
    );
    expect(decoded).toMatchObject({
      ok: true,
      value: {
        scopes: ['alerts.read', 'forecast.read'],
        operations: ['completion', 'models.read'],
        projectBinding: { policy: 'exact-repository', repository: 'R:/Code/weather-client' },
        accountConstraint: { accountId: 'account-7', accountLabel: 'Development' }
      }
    });
  });

  it('plans a verified requirement as retained and unresolved without invoking authority', async () => {
    const encoded = await encodeCapability({
      codec: credentialRequirementCapabilityCodec,
      value: fixture(),
      instanceId: 'credential:weather'
    });
    if (!encoded.ok) throw new Error('credential requirement encoding failed');
    const archive = await createTeleportCartridge({ capabilities: [encoded.value] });
    if (!archive.ok) throw new Error('credential requirement cartridge creation failed');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('credential requirement cartridge verification failed');
    const registry = createTeleportCodecRegistryWith(credentialRequirementCapabilityCodec);
    if (!registry.ok) throw new Error('credential requirement registry creation failed');
    const plan = composeTeleportRestorePlan(
      decodeTeleportInventory(verified.value, registry.value),
      registry.value
    );
    expect(plan).toMatchObject({
      ok: true,
      value: {
        confirmations: [],
        unresolvedOptionalInstances: [],
        steps: [expect.objectContaining({
          effect: 'unresolved-retain',
          capabilityInstanceId: 'credential:weather',
          resources: []
        })]
      }
    });
  });

  it('rejects unknown fields, duplicate requirements, invalid project binding, and unsupported versions', () => {
    const wire = {
      type: CREDENTIAL_REQUIREMENT_CAPABILITY_ID,
      version: CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
      provider: 'weather-provider',
      environment: 'production',
      scopes: ['forecast.read'],
      operations: ['completion'],
      projectBindingPolicy: 'any-project',
      repository: null,
      injectionName: 'WEATHER_PROVIDER_TOKEN',
      accountId: null,
      accountLabel: null
    };
    expect(credentialRequirementCapabilityCodec.decode(1, { ...wire, secret: 'forbidden' }))
      .toMatchObject({ ok: false });
    expect(credentialRequirementCapabilityCodec.decode(1, {
      ...wire,
      scopes: ['forecast.read', 'forecast.read']
    })).toMatchObject({ ok: false });
    expect(credentialRequirementCapabilityCodec.decode(1, {
      ...wire,
      projectBindingPolicy: 'exact-repository',
      repository: null
    })).toMatchObject({ ok: false });
    expect(credentialRequirementCapabilityCodec.decode(2, wire)).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-version' }]
    });
  });
});
