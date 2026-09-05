import { CID } from 'multiformats/cid';
import { type TeleportCartridgeArchive, type VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
interface PrivateInventoryLocatorV1 {
    readonly type: 'wx-teleport-private-inventory';
    readonly version: 1;
    readonly manifest: CID;
    readonly inventory: CID;
    readonly kdf: Readonly<{
        name: 'PBKDF2';
        hash: 'SHA-256';
        iterations: 310000;
        salt: Uint8Array;
    }>;
    readonly encryption: Readonly<{
        name: 'AES-GCM';
        iv: Uint8Array;
    }>;
}
export interface PrivateInventoryCartridgeArchive {
    readonly bytes: Uint8Array;
    readonly root: CID;
    readonly locator: PrivateInventoryLocatorV1;
}
export declare const createPrivateInventoryCartridge: (archive: TeleportCartridgeArchive, passphrase: string) => Promise<TeleportResult<PrivateInventoryCartridgeArchive>>;
export declare const unlockPrivateInventoryCartridge: (bytes: Uint8Array, passphrase: string) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export {};
