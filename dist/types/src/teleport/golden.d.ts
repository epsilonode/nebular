import { type TeleportResult } from './result';
export interface TeleportGoldenVectorV1 {
    readonly capabilityCid: string;
    readonly cartridgeRoot: string;
    readonly archiveSha256Hex: string;
    readonly archiveByteLength: number;
}
export declare const TELEPORT_GOLDEN_VECTOR_V1: TeleportGoldenVectorV1;
export declare const createTeleportGoldenVectorV1: () => Promise<TeleportResult<TeleportGoldenVectorV1>>;
export declare const verifyTeleportGoldenVectorV1: () => Promise<TeleportResult<TeleportGoldenVectorV1>>;
