import { describe, expect, it } from 'vitest';

import {
  collectTeleportS3Object,
  createTeleportS3Source,
  createTeleportS3Store,
  encodeCapability,
  err,
  ok,
  planTeleportS3Read,
  planTeleportS3Scope,
  type TeleportCapabilityCodec,
  type TeleportS3PutInput
} from './public';

const transportCodec: TeleportCapabilityCodec<string> = {
  capabilityId: 'nebular.test.transport-policy',
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: value => ok({ value }),
  decode: (_version, value) => typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Readonly<Record<string, unknown>>)['value'] === 'string'
    ? ok((value as Readonly<Record<string, string>>)['value'] ?? '')
    : err({ code: 'decode-failed', message: 'Transport fixture is invalid.' }),
  restorePlan: () => ok([])
};

const encodedTransportFixture = () => encodeCapability({
  codec: transportCodec,
  value: 'transport',
  instanceId: 'transport:test'
});

describe('Teleport transport policy', () => {
  it('confines read plans to the normalized tenant prefix', async () => {
    const encoded = await encodedTransportFixture();
    if (!encoded.ok) throw new Error('transport fixture encoding failed');
    const scope = planTeleportS3Scope({
      bucket: 'teleport-bucket',
      tenantPrefix: '/tenant//acme/'
    });
    expect(scope).toMatchObject({
      ok: true,
      value: { bucket: 'teleport-bucket', prefix: 'tenant/acme' }
    });
    if (!scope.ok) return;
    expect(planTeleportS3Read(
      scope.value,
      encoded.value.cid.toString(),
      'capability',
      { start: 2, endExclusive: 5 }
    )).toMatchObject({
      ok: true,
      value: {
        bucket: 'teleport-bucket',
        key: `tenant/acme/blocks/${encoded.value.cid.toString()}`,
        range: { start: 2, endExclusive: 5 }
      }
    });
    expect(planTeleportS3Scope({
      bucket: 'teleport-bucket',
      tenantPrefix: 'tenant/../escape'
    })).toMatchObject({ ok: false, issues: [{ code: 'dependency-invalid' }] });
  });

  it('uses one If-Match attempt and preserves a stale-head refusal', async () => {
    const requests: TeleportS3PutInput[] = [];
    const store = createTeleportS3Store({
      putObject: async input => {
        requests.push(input);
        return err({ code: 'policy-rejected', message: 'S3 precondition failed.' });
      }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    if (!store.ok || store.value.publishHead === undefined) {
      throw new Error('S3 store creation failed');
    }
    const published = await store.value.publishHead({
      workspaceId: 'main',
      root: 'bafy-root',
      previousVersion: 'etag-observed'
    });
    expect(published).toMatchObject({
      ok: false,
      issues: [{ code: 'policy-rejected', message: 'S3 precondition failed.' }]
    });
    expect(requests).toHaveLength(1);
    expect(requests.at(0)).toMatchObject({
      key: 'tenant/acme/heads/main.json',
      ifMatch: 'etag-observed'
    });
    expect(requests.at(0)).not.toHaveProperty('ifNoneMatch');
  });

  it('normalizes rejected object-store effects into typed failures', async () => {
    const encoded = await encodedTransportFixture();
    if (!encoded.ok) throw new Error('transport fixture encoding failed');
    const store = createTeleportS3Store({
      putObject: async () => { throw new Error('socket reset'); }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    if (!store.ok) throw new Error('S3 store creation failed');
    expect(await store.value.putImmutable({
      cid: encoded.value.cid,
      bytes: encoded.value.bytes,
      kind: 'capability'
    })).toMatchObject({
      ok: false,
      issues: [{ code: 'execution-failed' }]
    });

    const source = createTeleportS3Source({
      putObject: async () => ok({ version: 'unused' }),
      getObject: async () => { throw new Error('socket reset'); }
    }, { bucket: 'teleport-bucket', tenantPrefix: 'tenant/acme' });
    if (!source.ok) throw new Error('S3 source creation failed');
    expect(await source.value.readObject(
      encoded.value.cid.toString(),
      'capability'
    )).toMatchObject({
      ok: false,
      issues: [{ code: 'execution-failed' }]
    });
  });
});

describe('Teleport S3 stream adapter', () => {
  it('normalizes iterator rejection into a typed execution failure', async () => {
    const body: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('stream reset'))
      })
    };
    expect(await collectTeleportS3Object({
      body,
      contentLength: 1,
      totalLength: 1
    }, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'execution-failed' }]
    });
  });

  it('closes a stream after it crosses its declared byte boundary', async () => {
    let closed = false;
    async function* overflowingBody() {
      try {
        yield Uint8Array.of(1, 2, 3);
      } finally {
        closed = true;
      }
    }
    expect(await collectTeleportS3Object({
      body: overflowingBody(),
      contentLength: 2,
      totalLength: 2
    }, 3)).toMatchObject({
      ok: false,
      issues: [{ code: 'budget-exceeded' }]
    });
    expect(closed).toBe(true);
  });
});
