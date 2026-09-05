import type { VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
import { type PublishTeleportCloudOptions, type TeleportByteRange, type TeleportCloudHead, type TeleportCloudObject, type TeleportCloudObjectKind, type TeleportS3GetOutput, type TeleportS3Port, type TeleportS3StoreOptions } from './transport-policy';
export interface TeleportCloudStore {
    readonly putImmutable: (object: TeleportCloudObject) => Promise<TeleportResult<'created' | 'exists'>>;
    readonly publishHead?: (head: TeleportCloudHead) => Promise<TeleportResult<Readonly<{
        version: string;
    }>>>;
}
export interface TeleportS3Source {
    readonly readObject: (cid: string, kind: TeleportCloudObjectKind, range?: TeleportByteRange) => Promise<TeleportResult<TeleportS3GetOutput>>;
}
/**
 * Stateful orchestration boundary: immutable graph writes complete in order,
 * then (and only then) the optional CAS-protected mutable head is published.
 */
export declare const publishTeleportCloudCartridge: (cartridge: VerifiedTeleportCartridge, store: TeleportCloudStore, options?: PublishTeleportCloudOptions) => Promise<TeleportResult<Readonly<{
    root: string;
    headVersion?: string;
}>>>;
/** Creates a tenant-scoped, range-capable reader for immutable DAG objects. */
export declare const createTeleportS3Source: (port: TeleportS3Port, options: Pick<TeleportS3StoreOptions, "bucket" | "tenantPrefix">) => TeleportResult<TeleportS3Source>;
/** Binds pure S3 projections to caller-supplied object-store effects. */
export declare const createTeleportS3Store: (port: TeleportS3Port, options: TeleportS3StoreOptions) => TeleportResult<TeleportCloudStore>;
