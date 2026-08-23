import { describe, expect, it } from 'vitest';

import {
  canonicalRecipeJson,
  computeRecipeRevision,
  decodeAndAdmitRecipeXml,
  decodeRecipeXml,
  RECIPE_REVISION_DOMAIN,
  RECIPE_XML_MAX_BYTES,
  recipeOk,
  recipeRevisionDigestInput
} from './public.ts';

const validRecipe = (argument = 'forecast'): string => `<?xml version="1.0" encoding="UTF-8"?>
<recipe schema="wx.recipe/v1" id="weather-alerts" kind="entrypoint" receiver="pm2" lifecycle="one-shot">
  <summary>Fetch current warnings.</summary>
  <source task="weather" tool="mise" />
  <timeout ms="30000" />
  <exec name="weather-alerts-once" cwd="." tool="mise">
    <arg>run</arg>
    <arg>${argument}</arg>
    <env name="MODE" value="development" />
  </exec>
  <probe url="http://127.0.0.1:8787/health" status="200" />
  <port name="http" host="127.0.0.1" value="8787" />
  <credential-slot id="weather-api" provider="weather" environment="production" delivery="environment" inject="WEATHER_TOKEN">
    <scope>alerts:read</scope>
    <operation>forecast</operation>
    <scope>alerts:read</scope>
  </credential-slot>
</recipe>`;

const formattingVariant = `
<recipe lifecycle="one-shot" receiver="pm2" kind="entrypoint" id="weather-alerts" schema="wx.recipe/v1">
  <credential-slot inject="WEATHER_TOKEN" delivery="environment" environment="production" provider="weather" id="weather-api">
    <operation>forecast</operation><scope>alerts:read</scope>
  </credential-slot>
  <port value="8787" host="127.0.0.1" name="http" />
  <probe status="200" url="http://127.0.0.1:8787/health" />
  <exec tool="mise" cwd="." name="weather-alerts-once"><arg>run</arg><arg>forecast</arg><env value="development" name="MODE" /></exec>
  <source tool="mise" task="weather" />
  <summary>Different diagnostics are excluded from authority identity.</summary>
  <timeout ms="30000" />
</recipe>`;

describe('wx.recipe/v1 XML admission', () => {
  it('normalizes set-like authority and formatting while preserving semantic changes', () => {
    const first = decodeAndAdmitRecipeXml(validRecipe());
    const equivalent = decodeAndAdmitRecipeXml(formattingVariant);
    const changed = decodeAndAdmitRecipeXml(validRecipe('alerts'));
    if (first.isErr() || equivalent.isErr() || changed.isErr()) throw new Error('valid fixture did not admit');

    expect(first.value.semantic.credentialSlots[0]?.scopes.map(scope => scope.value)).toEqual(['alerts:read']);
    expect(canonicalRecipeJson(first.value)).toBe(canonicalRecipeJson(equivalent.value));
    expect(canonicalRecipeJson(first.value)).not.toBe(canonicalRecipeJson(changed.value));
  });

  it('creates a domain-separated revision input and accepts only a typed digest result', () => {
    const admitted = decodeAndAdmitRecipeXml(validRecipe());
    if (admitted.isErr()) throw new Error('valid fixture did not admit');
    const input = recipeRevisionDigestInput(admitted.value);
    expect(new TextDecoder().decode(Uint8Array.from(input)).startsWith(`${RECIPE_REVISION_DOMAIN}\0`)).toBe(true);
    const revision = computeRecipeRevision(admitted.value, { sha256: () => recipeOk('revision-abc') });
    expect(revision).toEqual(expect.objectContaining({ value: expect.objectContaining({ value: 'revision-abc' }) }));
  });

  it.each([
    ['unversioned', validRecipe().replace(' schema="wx.recipe/v1"', ''), 'unsupported-schema'],
    ['direct receiver', validRecipe().replace('receiver="pm2"', 'receiver="direct"'), 'unsafe-recipe'],
    ['unknown authority field', validRecipe().replace('lifecycle="one-shot"', 'lifecycle="one-shot" shell="true"'), 'unknown-field'],
    ['secret argv', validRecipe().replace('<arg>forecast</arg>', '<secret-arg>forecast</secret-arg>'), 'unknown-field'],
    ['DTD', `<!DOCTYPE recipe [<!ENTITY x "secret">]>${validRecipe()}`, 'unsafe-recipe'],
    ['duplicate attribute', validRecipe().replace('id="weather-alerts"', 'id="weather-alerts" id="other"'), 'invalid-xml']
  ])('rejects %s', (_name, xml, code) => {
    const result = decodeAndAdmitRecipeXml(xml);
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code })] }));
  });

  it('keeps unresolved inheritance and unbounded execution outside the admitted state', () => {
    const inherited = decodeRecipeXml(validRecipe().replace('kind="entrypoint"', 'kind="entrypoint" extends="base"'));
    const unbounded = decodeAndAdmitRecipeXml(validRecipe().replace('  <timeout ms="30000" />\n', ''));
    expect(inherited.isOk()).toBe(true);
    if (inherited.isErr()) throw new Error('inherited fixture did not decode');
    expect(inherited.value.extendsRecipeId?.value).toBe('base');
    expect(decodeAndAdmitRecipeXml(validRecipe().replace('kind="entrypoint"', 'kind="entrypoint" extends="base"')))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'inheritance-unresolved' })] }));
    expect(unbounded).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'unsafe-recipe' })] }));
  });

  it('rejects Windows environment collisions and structural resource exhaustion', () => {
    const collision = validRecipe().replace(
      '<env name="MODE" value="development" />',
      '<env name="WEATHER_token" value="not-secret" />'
    );
    expect(decodeAndAdmitRecipeXml(collision))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'unsafe-recipe' })] }));
    expect(decodeAndAdmitRecipeXml(`<recipe schema="wx.recipe/v1" id="x">${' '.repeat(RECIPE_XML_MAX_BYTES)}</recipe>`))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'resource-limit' })] }));
  });
});
