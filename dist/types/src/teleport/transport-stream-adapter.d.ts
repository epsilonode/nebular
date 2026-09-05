import { type TeleportResult } from './result';
import type { TeleportS3GetOutput } from './transport-policy';
/**
 * Consumes the foreign AsyncIterable once, translating iterator rejection,
 * malformed chunks, declaration drift, and budget overflow into typed results.
 */
export declare const collectTeleportS3Object: (output: TeleportS3GetOutput, maxBytes: number) => Promise<TeleportResult<Uint8Array>>;
