import { type TeleportResult } from './result';
import type { TeleportCapabilityCodec } from './types';
type TeleportHistoricalFixtureData = Readonly<{
    readonly version: number;
    readonly bytes: Uint8Array;
}>;
type TeleportHistoricalFixtureOperations<TCurrent> = Readonly<{
    readonly assertCurrent?: (value: TCurrent) => boolean;
}>;
export type TeleportHistoricalFixture<TCurrent> = TeleportHistoricalFixtureData & TeleportHistoricalFixtureOperations<TCurrent>;
export interface TeleportInvalidFixture {
    readonly version: number;
    readonly bytes: Uint8Array;
}
export interface TeleportCodecConformanceInput<TCurrent> {
    readonly codec: TeleportCapabilityCodec<TCurrent>;
    readonly currentValue: TCurrent;
    readonly historical?: readonly TeleportHistoricalFixture<TCurrent>[];
    readonly invalid?: readonly TeleportInvalidFixture[];
}
export interface TeleportCodecConformanceReport {
    readonly capabilityId: string;
    readonly canonicalCid: string;
    readonly historicalVersions: readonly number[];
    readonly invalidFixturesRejected: number;
}
export declare const runTeleportCodecConformance: <TCurrent>(input: TeleportCodecConformanceInput<TCurrent>) => Promise<TeleportResult<TeleportCodecConformanceReport>>;
export {};
