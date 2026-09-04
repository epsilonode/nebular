import { describe, expect, it } from 'vitest';

import {
  BROKER_E2E_EXPECTED_DIGEST_PLACEHOLDER,
  FOUR_ARTIFACT_E2E_FORMAT,
  FOUR_ARTIFACT_PACKAGE_SPECIFIERS,
  FOUR_ARTIFACT_RUNTIME_PATHS,
  decodeCanaryProvisionReceipt,
  decodeInstalledFourArtifactProbeReceipt,
  decodeTargetDigestMatchReceipt,
  renderBrokerE2eRecipe
} from './four-artifact-e2e-contract.ts';

describe('four-artifact live E2E contract', () => {
  it('admits only the exact installed four-artifact receipt', () => {
    const receipt = {
      format: FOUR_ARTIFACT_E2E_FORMAT,
      proof: 'installed-four-artifact-imports',
      importedSpecifiers: FOUR_ARTIFACT_PACKAGE_SPECIFIERS,
      resolvedRuntimePaths: FOUR_ARTIFACT_RUNTIME_PATHS,
      trustedProfileRoot: 'C:\\Users\\fixture\\AppData\\Local'
    };
    expect(decodeInstalledFourArtifactProbeReceipt(receipt)).toEqual({ type: 'ok', value: receipt });
    expect(decodeInstalledFourArtifactProbeReceipt({ ...receipt, environment: { TOKEN: 'forbidden' } }))
      .toMatchObject({ type: 'err', issue: { code: 'receipt-invalid' } });
    expect(decodeInstalledFourArtifactProbeReceipt({
      ...receipt,
      importedSpecifiers: [...FOUR_ARTIFACT_PACKAGE_SPECIFIERS.slice(0, 3), '@epsilonode/nebular/teleport']
    })).toMatchObject({ type: 'err', issue: { code: 'receipt-invalid' } });
  });

  it('admits only an exact SHA-256 canary receipt', () => {
    const receipt = {
      format: FOUR_ARTIFACT_E2E_FORMAT,
      proof: 'temporary-keychain-canary-stored',
      expectedSha256: 'a'.repeat(64)
    };
    expect(decodeCanaryProvisionReceipt(receipt)).toEqual({ type: 'ok', value: receipt });
    expect(decodeCanaryProvisionReceipt({ ...receipt, expectedSha256: 'raw-canary' }))
      .toMatchObject({ type: 'err', issue: { code: 'receipt-invalid' } });
  });

  it('renders exactly one digest placeholder and never admits an unrendered recipe', () => {
    const template = `<env value="${BROKER_E2E_EXPECTED_DIGEST_PLACEHOLDER}" />`;
    const rendered = renderBrokerE2eRecipe(template, 'b'.repeat(64));
    expect(rendered).toEqual({ type: 'ok', value: `<env value="${'b'.repeat(64)}" />` });
    expect(renderBrokerE2eRecipe(template, 'not-a-digest'))
      .toMatchObject({ type: 'err', issue: { code: 'fixture-invalid' } });
    expect(renderBrokerE2eRecipe(`${template}${template}`, 'b'.repeat(64)))
      .toMatchObject({ type: 'err', issue: { code: 'fixture-invalid' } });
  });

  it('accepts only the two-field target digest receipt', () => {
    expect(decodeTargetDigestMatchReceipt({ outcome: 'success', proof: 'credential-digest-match' }))
      .toEqual({ type: 'ok', value: { outcome: 'success', proof: 'credential-digest-match' } });
    expect(decodeTargetDigestMatchReceipt({
      outcome: 'success',
      proof: 'credential-digest-match',
      stdout: 'forbidden'
    })).toMatchObject({ type: 'err', issue: { code: 'receipt-invalid' } });
  });
});
