import { CID } from 'multiformats/cid';
import type { VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
export type TeleportCloudObjectKind = 'capability' | 'key-envelope' | 'signature' | 'root';
export interface TeleportCloudObject {
    readonly cid: CID;
    readonly bytes: Uint8Array;
    readonly kind: TeleportCloudObjectKind;
}
export interface TeleportCloudHead {
    readonly workspaceId: string;
    readonly root: string;
    readonly previousVersion?: string;
}
export interface TeleportCloudPublication {
    readonly root: string;
    readonly objects: readonly TeleportCloudObject[];
}
export interface PublishTeleportCloudOptions {
    readonly workspaceId?: string;
    readonly previousHeadVersion?: string;
}
export interface TeleportS3PutInput {
    readonly bucket: string;
    readonly key: string;
    readonly body: Uint8Array;
    readonly checksumSha256: string;
    readonly contentType: string;
    readonly ifMatch?: string;
    readonly ifNoneMatch?: '*';
}
export interface TeleportByteRange {
    readonly start: number;
    readonly endExclusive: number;
}
export interface TeleportS3GetInput {
    readonly bucket: string;
    readonly key: string;
    readonly range?: TeleportByteRange;
}
export interface TeleportS3GetOutput {
    readonly body: AsyncIterable<Uint8Array>;
    readonly contentLength: number;
    readonly totalLength: number;
    readonly version?: string;
}
export interface TeleportS3PutOutput {
    readonly version: string;
    readonly outcome?: 'created' | 'exists';
}
export interface TeleportS3Port {
    readonly putObject: (input: TeleportS3PutInput) => Promise<TeleportResult<TeleportS3PutOutput>>;
    readonly putMultipart?: (input: TeleportS3PutInput & Readonly<{
        partSizeBytes: number;
    }>) => Promise<TeleportResult<TeleportS3PutOutput>>;
    readonly getObject?: (input: TeleportS3GetInput) => Promise<TeleportResult<TeleportS3GetOutput>>;
}
export interface TeleportS3StoreOptions {
    readonly bucket: string;
    readonly tenantPrefix: string;
    readonly multipartThresholdBytes?: number;
    readonly multipartPartSizeBytes?: number;
}
export interface TeleportS3Scope {
    readonly bucket: string;
    readonly prefix: string;
}
export interface TeleportS3PutPlan {
    readonly bucket: string;
    readonly key: string;
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly ifMatch?: string;
    readonly ifNoneMatch?: '*';
}
export interface TeleportRetentionPlan {
    readonly retainedRoots: readonly string[];
    readonly reachableObjectCids: readonly string[];
    readonly deleteCandidateCids: readonly string[];
}
/** Pure projection: immutable graph objects are deduplicated and the root is ordered last. */
export declare const planTeleportCloudPublication: (cartridge: VerifiedTeleportCartridge) => TeleportResult<TeleportCloudPublication>;
/** Pure validation and normalization of the caller-owned tenant namespace. */
export declare const planTeleportS3Scope: (options: Pick<TeleportS3StoreOptions, "bucket" | "tenantPrefix">) => TeleportResult<TeleportS3Scope>;
/** Pure, tenant-confined range-read request projection. */
export declare const planTeleportS3Read: (scope: TeleportS3Scope, cid: string, kind: TeleportCloudObjectKind, range?: TeleportByteRange) => TeleportResult<TeleportS3GetInput>;
/** Pure, create-only request projection for content-addressed graph objects. */
export declare const planTeleportS3ImmutablePut: (scope: TeleportS3Scope, object: TeleportCloudObject, checksumSha256: string) => TeleportS3PutInput;
/**
 * Pure mutable-head projection. Existing heads are compare-and-swapped with
 * If-Match; first publication is create-only. Neither path can overwrite a
 * head whose version changed after the caller observed it.
 */
export declare const planTeleportS3HeadPut: (scope: TeleportS3Scope, head: TeleportCloudHead) => TeleportResult<TeleportS3PutPlan>;
export declare const completeTeleportS3PutPlan: (plan: TeleportS3PutPlan, checksumSha256: string) => TeleportS3PutInput;
export declare const useTeleportMultipartPut: (bodyLength: number, options: TeleportS3StoreOptions, multipartAvailable: boolean) => boolean;
/** Pure reachability policy; deletion remains an explicit host-owned effect. */
export declare const planTeleportReachabilityRetention: (publications: readonly TeleportCloudPublication[], retainedRoots: readonly string[], allObjectCids: readonly string[]) => TeleportResult<TeleportRetentionPlan>;
