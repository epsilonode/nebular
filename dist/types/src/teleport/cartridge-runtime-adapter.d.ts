import { CID } from 'multiformats/cid';
import { type TeleportResult } from './result';
export interface TeleportCarRuntimeBlock {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
export interface TeleportCarRuntimeContents {
    readonly roots: readonly CID[];
    readonly blocks: readonly TeleportCarRuntimeBlock[];
}
export interface TeleportCarRuntimeChunkSink {
    readonly write: (chunk: Uint8Array) => Promise<void>;
}
export declare const encodeTeleportManifestBytes: (value: unknown) => Promise<TeleportResult<Uint8Array>>;
export declare const decodeTeleportManifestBytes: (bytes: Uint8Array) => Promise<TeleportResult<unknown>>;
export declare const digestTeleportBlockBytes: (bytes: Uint8Array) => Promise<TeleportResult<Uint8Array>>;
export declare const createTeleportBlockCid: (codec: number, bytes: Uint8Array) => Promise<TeleportResult<CID>>;
export declare const measureTeleportCarBytes: (root: CID, blocks: readonly TeleportCarRuntimeBlock[]) => Promise<TeleportResult<number>>;
export declare const createTeleportCarChunkStream: (root: CID, blocks: readonly TeleportCarRuntimeBlock[]) => Promise<TeleportResult<AsyncIterable<Uint8Array>>>;
export declare const writeTeleportCarChunks: (chunks: AsyncIterable<Uint8Array>, sink: TeleportCarRuntimeChunkSink) => Promise<TeleportResult<void>>;
export declare const collectTeleportCarChunks: (chunks: AsyncIterable<Uint8Array>, maxBytes: number) => Promise<TeleportResult<Uint8Array>>;
export declare const readTeleportCarBytes: (bytes: Uint8Array) => Promise<TeleportResult<TeleportCarRuntimeContents>>;
