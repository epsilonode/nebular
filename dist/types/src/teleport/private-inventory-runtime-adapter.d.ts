import { CID } from 'multiformats/cid';
import { type TeleportIssue, type TeleportResult } from './result';
export interface PrivateInventoryCarBlock {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
export interface PrivateInventoryCarContents {
    readonly roots: readonly CID[];
    readonly blocks: readonly PrivateInventoryCarBlock[];
}
export interface PrivateInventoryRandomMaterial {
    readonly salt: Uint8Array;
    readonly iv: Uint8Array;
}
export interface PrivateInventoryCipherInput {
    readonly passphrase: string;
    readonly manifest: CID;
    readonly salt: Uint8Array;
    readonly iv: Uint8Array;
    readonly bytes: Uint8Array;
}
export declare const createPrivateInventoryRandomMaterial: (issue: TeleportIssue) => Promise<TeleportResult<PrivateInventoryRandomMaterial>>;
export declare const encryptPrivateInventoryBytes: (input: PrivateInventoryCipherInput, issue: TeleportIssue) => Promise<TeleportResult<Uint8Array>>;
export declare const decryptPrivateInventoryBytes: (input: PrivateInventoryCipherInput, issue: TeleportIssue) => Promise<TeleportResult<Uint8Array>>;
export declare const encodePrivateInventoryDagCbor: (value: unknown, issue: TeleportIssue) => Promise<TeleportResult<Uint8Array>>;
export declare const decodePrivateInventoryDagCbor: (bytes: Uint8Array, issue: TeleportIssue) => Promise<TeleportResult<unknown>>;
export declare const createPrivateInventoryCid: (codec: number, bytes: Uint8Array, issue: TeleportIssue) => Promise<TeleportResult<CID>>;
export declare const digestPrivateInventoryBytes: (bytes: Uint8Array, issue: TeleportIssue) => Promise<TeleportResult<Uint8Array>>;
export declare const readPrivateInventoryCar: (bytes: Uint8Array, issue: TeleportIssue) => Promise<TeleportResult<PrivateInventoryCarContents>>;
export declare const writePrivateInventoryCar: (root: CID, blocks: readonly PrivateInventoryCarBlock[], issue: TeleportIssue) => Promise<TeleportResult<Uint8Array>>;
