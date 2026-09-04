import { describe, expect, it } from 'vitest';

import { MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT } from '../broker-client/public.ts';
import {
  PM2_METADATA_ATTEMPT_ID,
  PM2_METADATA_BINDING_GENERATION,
  PM2_METADATA_DEADLINE_AT_MS,
  PM2_METADATA_DIGEST,
  PM2_METADATA_GRANT_GENERATION,
  PM2_METADATA_GRANT_ID,
  PM2_METADATA_JOB_IDENTITY,
  PM2_METADATA_RECEIVER_CORRELATION,
  PM2_METADATA_RECEIVER_ENTRY_IDENTITY,
  PM2_METADATA_RECEIVER_ID,
  PM2_METADATA_RECIPE_REVISION,
  PM2_METADATA_REPOSITORY,
  PM2_METADATA_SLOT_ID,
  PM2_METADATA_STARTED_AT_MS,
  projectAndWipePm2MonitorJson,
  projectAndWipePm2SingleProcessJson
} from './pm2-monitor-projection.ts';

const targetName = 'nebular-live-00';
const secretCanary = 'MONITOR_SECRET_CANARY_MUST_NEVER_PROJECT';
const brokerEntrypoint = 'R:\\Code\\nebular\\broker.js';

const processFixture = (name: string, overrides: Record<string, unknown> = {}) => ({
  pid: 42,
  name,
  pm_id: 7,
  pm2_env: {
    name,
    pm_id: 7,
    status: 'online',
    autorestart: false,
    treekill: true,
    env: {
      API_TOKEN: secretCanary,
      DEEPLY_SECRET: { nested: [secretCanary, { token: secretCanary }] }
    },
    [PM2_METADATA_SLOT_ID]: 'nebular-live:00',
    [PM2_METADATA_ATTEMPT_ID]: 'attempt-1',
    [PM2_METADATA_DIGEST]: 'a'.repeat(64),
    [PM2_METADATA_STARTED_AT_MS]: '1000',
    [PM2_METADATA_DEADLINE_AT_MS]: '2000',
    [PM2_METADATA_JOB_IDENTITY]: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`,
    [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: brokerEntrypoint,
    ...overrides
  },
  monit: { memory: 1, cpu: 0 }
});

const encoded = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('PM2 monitor byte allowlist projection', () => {
  it('projects only exact allowed names and safe lifecycle/ownership facts, then wipes input', () => {
    const bytes = encoded({ args: [[
      processFixture('foreign-app', { FOREIGN_SECRET: secretCanary }),
      processFixture(targetName)
    ]] });
    const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);

    expect(outcome).toEqual({
      outcome: 'success',
      value: {
        processes: [{
          name: targetName,
          pmId: 7,
          pid: 42,
          status: 'online',
          autorestart: false,
          treeKill: true,
          ownership: {
            kind: 'owned',
            slotId: 'nebular-live:00',
            attemptId: 'attempt-1',
            metadataDigest: 'a'.repeat(64),
            startedAtMs: 1_000,
            deadlineAtMs: 2_000,
            managedContainment: {
              kind: 'windows-job-v1',
              jobIdentity: `Local\\epsilonode.nebular.job.v1.${'b'.repeat(64)}`
            },
            managedBootstrap: {
              kind: 'bun-recipe-bootstrap-v1',
              brokerEntrypoint
            },
            receiverAuthority: { kind: 'absent' }
          }
        }]
      }
    });
    expect(JSON.stringify(outcome)).not.toContain(secretCanary);
    expect(bytes.every(byte => byte === 0)).toBe(true);
  });

  it('does not materialize or expose canaries from skipped nested values or RPC errors', () => {
    const cases = [
      { args: [[processFixture('foreign-app')]] },
      { error: secretCanary, stack: `stack:${secretCanary}` },
      { args: [[processFixture(targetName, { env: { TOKEN: secretCanary } })]], trailing: { secretCanary } }
    ];

    cases.forEach(value => {
      const bytes = encoded(value);
      const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);
      expect(JSON.stringify(outcome)).not.toContain(secretCanary);
      expect(bytes.every(byte => byte === 0)).toBe(true);
    });
  });

  it('projects the complete bounded receiver-authority tuple without admitting adjacent environment data', () => {
    const bytes = encoded({ args: [[processFixture(targetName, {
      [PM2_METADATA_RECEIVER_ID]: 'pm2',
      [PM2_METADATA_RECEIVER_ENTRY_IDENTITY]: `pm2-entry:${targetName}`,
      [PM2_METADATA_RECEIVER_CORRELATION]: `pm2:${targetName}:attempt-1`,
      [PM2_METADATA_REPOSITORY]: 'R:\\Code\\example',
      [PM2_METADATA_RECIPE_REVISION]: 'recipe-v1',
      [PM2_METADATA_GRANT_ID]: 'grant-1',
      [PM2_METADATA_GRANT_GENERATION]: '3',
      [PM2_METADATA_BINDING_GENERATION]: '2',
      SECRET_BESIDE_AUTHORITY: secretCanary
    })]] });
    const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);

    expect(outcome).toEqual(expect.objectContaining({
      outcome: 'success',
      value: { processes: [expect.objectContaining({
        ownership: expect.objectContaining({
          kind: 'owned',
          receiverAuthority: {
            kind: 'owned',
            receiverId: 'pm2',
            receiverEntryIdentity: `pm2-entry:${targetName}`,
            receiverCorrelation: `pm2:${targetName}:attempt-1`,
            repository: 'R:\\Code\\example',
            recipeRevision: 'recipe-v1',
            grantId: 'grant-1',
            grantGeneration: 3,
            bindingGeneration: 2
          }
        })
      })] }
    }));
    expect(JSON.stringify(outcome)).not.toContain(secretCanary);
    expect(bytes.every(byte => byte === 0)).toBe(true);
  });

  it('fails closed on non-backslash escapes in a Windows repository authority value', () => {
    const bytes = encoded({ args: [[processFixture(targetName, {
      [PM2_METADATA_RECEIVER_ID]: 'pm2',
      [PM2_METADATA_RECEIVER_ENTRY_IDENTITY]: `pm2-entry:${targetName}`,
      [PM2_METADATA_RECEIVER_CORRELATION]: `pm2:${targetName}:attempt-1`,
      [PM2_METADATA_REPOSITORY]: 'R:\\Code\\example\nforged',
      [PM2_METADATA_RECIPE_REVISION]: 'recipe-v1',
      [PM2_METADATA_GRANT_ID]: 'grant-1',
      [PM2_METADATA_GRANT_GENERATION]: '3',
      [PM2_METADATA_BINDING_GENERATION]: '2'
    })]] });

    expect(projectAndWipePm2MonitorJson(bytes, [targetName])).toEqual({
      outcome: 'failure',
      code: 'pm2-monitor-malformed'
    });
    expect(bytes.every(byte => byte === 0)).toBe(true);
  });

  it('marks incomplete ownership metadata invalid and never upgrades config drift', () => {
    const incomplete = processFixture(targetName, {
      [PM2_METADATA_DIGEST]: undefined,
      autorestart: true,
      treekill: false
    });
    const bytes = encoded({ args: [[incomplete]] });
    const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);

    expect(outcome).toEqual(expect.objectContaining({
      outcome: 'success',
      value: expect.objectContaining({
        processes: [expect.objectContaining({
          autorestart: true,
          treeKill: false,
          ownership: { kind: 'invalid' }
        })]
      })
    }));
    expect(bytes.every(byte => byte === 0)).toBe(true);
  });

  it('marks missing or malformed managed-containment metadata invalid without projecting adjacent data', () => {
    const cases = [
      processFixture(targetName, { [PM2_METADATA_JOB_IDENTITY]: undefined }),
      processFixture(targetName, { [PM2_METADATA_JOB_IDENTITY]: 'Local\\forged' })
    ];

    cases.forEach(fixture => {
      const bytes = encoded({ args: [[fixture]] });
      const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);
      expect(outcome).toEqual(expect.objectContaining({
        outcome: 'success',
        value: { processes: [expect.objectContaining({ ownership: { kind: 'invalid' } })] }
      }));
      expect(JSON.stringify(outcome)).not.toContain(secretCanary);
      expect(bytes.every(byte => byte === 0)).toBe(true);
    });
  });

  it('requires only the canonical managed broker entrypoint and rejects missing or forged bootstrap metadata', () => {
    const cases = [
      processFixture(targetName, { [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: undefined }),
      processFixture(targetName, { [MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]: 'relative/broker.js' })
    ];

    cases.forEach(fixture => {
      const bytes = encoded({ args: [[fixture]] });
      const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);
      expect(outcome).toEqual(expect.objectContaining({
        outcome: 'success',
        value: { processes: [expect.objectContaining({ ownership: { kind: 'invalid' } })] }
      }));
      expect(JSON.stringify(outcome)).not.toContain(secretCanary);
      expect(bytes.every(byte => byte === 0)).toBe(true);
    });
  });

  it('projects an exact safe-integer terminal exit code and rejects malformed codes', () => {
    const bytes = encoded({ args: [[processFixture(targetName, { status: 'stopped', exit_code: 0 })]] });
    const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);
    expect(outcome).toEqual(expect.objectContaining({
      outcome: 'success',
      value: { processes: [expect.objectContaining({ status: 'stopped', exitCode: 0 })] }
    }));
    expect(bytes.every(byte => byte === 0)).toBe(true);

    const malformed = encoded({ args: [[processFixture(targetName, { status: 'errored', exit_code: 1.5 })]] });
    expect(projectAndWipePm2MonitorJson(malformed, [targetName])).toEqual({
      outcome: 'failure', code: 'pm2-monitor-malformed'
    });
    expect(malformed.every(byte => byte === 0)).toBe(true);
  });

  it('projects a single stop/delete response and a prepare cluster without materializing nested environment values', () => {
    const singleBytes = encoded({ args: [processFixture(targetName)] });
    const single = projectAndWipePm2SingleProcessJson(singleBytes, targetName);
    expect(single).toEqual(expect.objectContaining({
      outcome: 'success',
      value: expect.objectContaining({ name: targetName, pmId: 7, pid: 42 })
    }));
    expect(JSON.stringify(single)).not.toContain(secretCanary);
    expect(singleBytes.every(byte => byte === 0)).toBe(true);

    const formatted = processFixture(targetName) as {
      readonly pm2_env: Readonly<Record<string, unknown>>;
    };
    const prepareBytes = encoded({ args: [[{
      pm2_env: formatted.pm2_env,
      process: { pid: 51, secret: secretCanary }
    }]] });
    const prepare = projectAndWipePm2MonitorJson(prepareBytes, [targetName]);
    expect(prepare).toEqual(expect.objectContaining({
      outcome: 'success',
      value: { processes: [expect.objectContaining({ name: targetName, pmId: 7, pid: 51 })] }
    }));
    expect(JSON.stringify(prepare)).not.toContain(secretCanary);
    expect(prepareBytes.every(byte => byte === 0)).toBe(true);
  });

  it.each([
    new Uint8Array(),
    Uint8Array.of(0x7b, 0x22, 0x61),
    Uint8Array.of(0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc0, 0x80, 0x7d),
    encoded({ args: [[{ name: targetName, pid: 1, pm_id: 1, pm2_env: { name: targetName } }]] })
  ])('fails closed and wipes malformed or incomplete bytes', bytes => {
    const outcome = projectAndWipePm2MonitorJson(bytes, [targetName]);
    expect(outcome.outcome).toBe('failure');
    expect(bytes.every(byte => byte === 0)).toBe(true);
  });
});
