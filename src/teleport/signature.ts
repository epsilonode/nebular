import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import {
  createTeleportCartridge,
  type TeleportCartridgeArchive,
  type VerifiedSignature,
  type VerifiedTeleportCartridge
} from './cartridge';
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

const captureSignatureEffect = <T>(
  effect: () => T | PromiseLike<T>,
  failureMessage: string
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    value => ok(value),
    () => err({ code: 'signature-invalid', message: failureMessage })
  );

export const createTeleportSignature = async (
  manifest: TeleportCartridgeManifestV1,
  signer: TeleportSigner,
  id = signer.keyId
): Promise<TeleportResult<TeleportSignatureBlock>> => {
  if (!id || !signer.keyId || signer.privateKey.algorithm.name !== 'Ed25519') return err({ code: 'signature-invalid', message: 'An Ed25519 signing key and stable key identity are required.' });
  return captureSignatureEffect(async () => {
    const payload = teleportSignedPayloadBytes(manifest);
    const bytes = new Uint8Array(await crypto.subtle.sign('Ed25519', signer.privateKey, bytesBuffer(payload)));
    return {
      descriptor: {
        id,
        mode: 'ed25519-v1',
        signerKeyId: signer.keyId,
        signedPayload: await payloadCid(payload),
        block: CID.createV1(raw.code, await sha256.digest(bytes))
      },
      bytes
    };
  }, 'Teleport graph signing failed.');
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

const verifyKnownSignature = async (
  verified: TeleportResult<readonly string[]>,
  signature: VerifiedSignature,
  verifiers: readonly TeleportSignatureVerifier[],
  expectedPayload: CID,
  payload: Uint8Array
): Promise<TeleportResult<readonly string[]>> => {
  if (!verified.ok) return verified;
  const verifier = verifiers.findLast(candidate => candidate.keyId === signature.descriptor.signerKeyId);
  if (!verifier) return verified;
  if (!signature.descriptor.signedPayload.equals(expectedPayload)) {
    return err({ code: 'signature-invalid', message: 'Teleport signature is bound to a different graph.' });
  }
  const valid = await captureSignatureEffect(
    () => crypto.subtle.verify('Ed25519', verifier.publicKey, bytesBuffer(signature.bytes), bytesBuffer(payload)),
    `Teleport signature ${signature.descriptor.id} verification failed.`
  );
  if (!valid.ok) return valid;
  return valid.value
    ? ok([...verified.value, signature.descriptor.signerKeyId], verified.warnings)
    : err({ code: 'signature-invalid', message: `Teleport signature ${signature.descriptor.id} is invalid.` });
};

export const verifyTeleportSignatures = async (
  cartridge: VerifiedTeleportCartridge,
  verifiers: readonly TeleportSignatureVerifier[],
  requiredSignerKeyIds: readonly string[] = []
): Promise<TeleportResult<Readonly<{ verifiedSignerKeyIds: readonly string[] }>>> => {
  const preparedPayload = await captureSignatureEffect(async () => {
    const payload = teleportSignedPayloadBytes(cartridge.manifest);
    return { expectedPayload: await payloadCid(payload), payload };
  }, 'Teleport signature verification payload preparation failed.');
  if (!preparedPayload.ok) return preparedPayload;
  const verified = await cartridge.signatures.reduce<Promise<TeleportResult<readonly string[]>>>(
    (prior, signature) => prior.then(state => verifyKnownSignature(
      state,
      signature,
      verifiers,
      preparedPayload.value.expectedPayload,
      preparedPayload.value.payload
    )),
    Promise.resolve(ok<readonly string[]>([]))
  );
  if (!verified.ok) return verified;
  const verifiedSignerKeyIds: readonly string[] = verified.value
    .filter((keyId, index, keyIds) => keyIds.indexOf(keyId) === index)
    .toSorted();
  const missing = requiredSignerKeyIds.find(keyId => !verifiedSignerKeyIds.includes(keyId));
  return missing === undefined
    ? ok({ verifiedSignerKeyIds }, verified.warnings)
    : err({ code: 'signature-invalid', message: `Required Teleport signer ${missing} is missing or untrusted.` });
};
