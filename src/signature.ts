import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import { createTeleportCartridge, type TeleportCartridgeArchive, type VerifiedTeleportCartridge } from './cartridge';
import { err, ok, type TeleportResult } from './result';
import type { TeleportCartridgeManifestV1, TeleportSignatureBlock } from './types';

const bytesBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;

export interface TeleportSigner {
  readonly keyId: string;
  readonly privateKey: CryptoKey;
}

export interface TeleportSignatureVerifier {
  readonly keyId: string;
  readonly publicKey: CryptoKey;
}

export const teleportSignedPayloadBytes = (manifest: TeleportCartridgeManifestV1): Uint8Array => coerce(dagCbor.encode({
  type: 'wx-teleport-signed-graph',
  version: 1,
  ...(manifest.createdAt ? { createdAt: manifest.createdAt } : {}),
  capabilities: manifest.capabilities,
  keyEnvelopes: manifest.keyEnvelopes
}));

const payloadCid = async (bytes: Uint8Array): Promise<CID> => CID.createV1(dagCbor.code, await sha256.digest(bytes));

export const createTeleportSignature = async (
  manifest: TeleportCartridgeManifestV1,
  signer: TeleportSigner,
  id = signer.keyId
): Promise<TeleportResult<TeleportSignatureBlock>> => {
  if (!id || !signer.keyId || signer.privateKey.algorithm.name !== 'Ed25519') return err({ code: 'signature-invalid', message: 'An Ed25519 signing key and stable key identity are required.' });
  try {
    const payload = teleportSignedPayloadBytes(manifest);
    const bytes = new Uint8Array(await crypto.subtle.sign('Ed25519', signer.privateKey, bytesBuffer(payload)));
    return ok({
      descriptor: {
        id,
        mode: 'ed25519-v1',
        signerKeyId: signer.keyId,
        signedPayload: await payloadCid(payload),
        block: CID.createV1(raw.code, await sha256.digest(bytes))
      },
      bytes
    });
  } catch {
    return err({ code: 'signature-invalid', message: 'Teleport graph signing failed.' });
  }
};

export const addTeleportSignature = async (
  cartridge: VerifiedTeleportCartridge,
  signer: TeleportSigner,
  id = signer.keyId
): Promise<TeleportResult<TeleportCartridgeArchive>> => {
  if (cartridge.signatures.some(signature => signature.descriptor.id === id)) return err({ code: 'signature-invalid', message: `Teleport signature id ${id} already exists.` });
  const signature = await createTeleportSignature(cartridge.manifest, signer, id);
  if (!signature.ok) return signature;
  return createTeleportCartridge({
    ...(cartridge.manifest.createdAt ? { createdAt: cartridge.manifest.createdAt } : {}),
    capabilities: cartridge.capabilities.map(({ descriptor, storedBytes }) => ({
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId,
      schemaVersion: descriptor.schemaVersion,
      securityClass: descriptor.securityClass,
      required: descriptor.required,
      restoreMode: descriptor.restoreMode,
      codec: descriptor.codec,
      dependencies: descriptor.dependencies,
      bytes: storedBytes,
      cid: descriptor.block,
      protection: descriptor.protection
    })),
    keyEnvelopes: cartridge.keyEnvelopes.map(envelope => ({ descriptor: envelope.descriptor, bytes: envelope.bytes })),
    signatures: [...cartridge.signatures.map(existing => ({ descriptor: existing.descriptor, bytes: existing.bytes })), signature.value]
  });
};

export const verifyTeleportSignatures = async (
  cartridge: VerifiedTeleportCartridge,
  verifiers: readonly TeleportSignatureVerifier[],
  requiredSignerKeyIds: readonly string[] = []
): Promise<TeleportResult<Readonly<{ verifiedSignerKeyIds: readonly string[] }>>> => {
  const byKey = new Map(verifiers.map(verifier => [verifier.keyId, verifier.publicKey] as const));
  const payload = teleportSignedPayloadBytes(cartridge.manifest);
  const expectedPayload = await payloadCid(payload);
  const verified: string[] = [];
  for (const signature of cartridge.signatures) {
    const key = byKey.get(signature.descriptor.signerKeyId);
    if (!key) continue;
    if (!signature.descriptor.signedPayload.equals(expectedPayload)) return err({ code: 'signature-invalid', message: 'Teleport signature is bound to a different graph.' });
    const valid = await crypto.subtle.verify('Ed25519', key, bytesBuffer(signature.bytes), bytesBuffer(payload));
    if (!valid) return err({ code: 'signature-invalid', message: `Teleport signature ${signature.descriptor.id} is invalid.` });
    verified.push(signature.descriptor.signerKeyId);
  }
  const verifiedSet = new Set(verified);
  const missing = requiredSignerKeyIds.filter(keyId => !verifiedSet.has(keyId));
  return missing.length
    ? err({ code: 'signature-invalid', message: `Required Teleport signer ${missing[0]} is missing or untrusted.` })
    : ok({ verifiedSignerKeyIds: [...verifiedSet].toSorted() });
};
