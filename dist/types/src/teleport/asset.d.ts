import { CID } from 'multiformats/cid';
import { type TeleportResult } from './result';
import type { EncodedCapabilityBlock, TeleportCapabilityCodec } from './types';
export declare const ASSET_BLOB_CAPABILITY_ID: "wx.asset.blob";
export declare const ASSET_METADATA_CAPABILITY_ID: "wx.asset.metadata";
export interface TeleportAssetMetadata {
    readonly name: string;
    readonly mediaType: string;
    readonly byteLength: number;
    readonly blobInstanceId: string;
    readonly blob: CID;
}
export declare const assetBlobCapabilityCodec: TeleportCapabilityCodec<Uint8Array>;
export declare const assetMetadataCapabilityCodec: TeleportCapabilityCodec<TeleportAssetMetadata>;
export declare const encodeTeleportAsset: (input: Readonly<{
    name: string;
    mediaType: string;
    bytes: Uint8Array;
    instanceId: string;
    required?: boolean;
}>) => Promise<TeleportResult<Readonly<{
    metadata: EncodedCapabilityBlock<TeleportAssetMetadata>;
    blob: EncodedCapabilityBlock<Uint8Array>;
}>>>;
