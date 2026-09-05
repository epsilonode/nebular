import { type TeleportResult } from './result';
import type { TeleportRecipientKeyProvider } from './key-provider';
export interface BrowserDeviceKeyProviderOptions {
    readonly providerId?: string;
    readonly databaseName?: string;
}
/** Browser platform adapter that retains non-extractable RSA private keys in IndexedDB. */
export declare class BrowserDeviceRecipientKeyProvider implements TeleportRecipientKeyProvider {
    #private;
    readonly providerId: string;
    constructor(options?: BrowserDeviceKeyProviderOptions);
    getPublicKey(keyId: string): Promise<TeleportResult<CryptoKey>>;
    getPrivateKey(keyId: string): Promise<TeleportResult<CryptoKey>>;
    deleteKey(keyId: string): Promise<TeleportResult<void>>;
}
