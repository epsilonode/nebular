import { type TeleportCartridgeArchive, type VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
import type { TeleportCartridgeManifestV1, TeleportSignatureBlock } from './types';
export interface TeleportSigner {
    readonly keyId: string;
    readonly privateKey: CryptoKey;
}
export interface TeleportSignatureVerifier {
    readonly keyId: string;
    readonly publicKey: CryptoKey;
}
export declare const teleportSignedPayloadBytes: (manifest: TeleportCartridgeManifestV1) => Uint8Array;
export declare const createTeleportSignature: (manifest: TeleportCartridgeManifestV1, signer: TeleportSigner, id?: string) => Promise<TeleportResult<TeleportSignatureBlock>>;
export declare const addTeleportSignature: (cartridge: VerifiedTeleportCartridge, signer: TeleportSigner, id?: string) => Promise<TeleportResult<TeleportCartridgeArchive>>;
export declare const verifyTeleportSignatures: (cartridge: VerifiedTeleportCartridge, verifiers: readonly TeleportSignatureVerifier[], requiredSignerKeyIds?: readonly string[]) => Promise<TeleportResult<Readonly<{
    verifiedSignerKeyIds: readonly string[];
}>>>;
