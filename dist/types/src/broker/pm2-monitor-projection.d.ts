export declare const PM2_MONITOR_MAX_JSON_BYTES: number;
export declare const PM2_MONITOR_MAX_PROCESSES = 512;
export declare const PM2_MONITOR_MAX_DEPTH = 32;
export declare const PM2_METADATA_SLOT_ID = "NEBULAR_PM2_SLOT_ID";
export declare const PM2_METADATA_ATTEMPT_ID = "NEBULAR_PM2_ATTEMPT_ID";
export declare const PM2_METADATA_DIGEST = "NEBULAR_PM2_METADATA_DIGEST";
export declare const PM2_METADATA_STARTED_AT_MS = "NEBULAR_PM2_STARTED_AT_MS";
export declare const PM2_METADATA_DEADLINE_AT_MS = "NEBULAR_PM2_DEADLINE_AT_MS";
export declare const PM2_METADATA_RECEIVER_ID = "NEBULAR_PM2_RECEIVER_ID";
export declare const PM2_METADATA_RECEIVER_ENTRY_IDENTITY = "NEBULAR_PM2_RECEIVER_ENTRY_IDENTITY";
export declare const PM2_METADATA_RECEIVER_CORRELATION = "NEBULAR_PM2_RECEIVER_CORRELATION";
export declare const PM2_METADATA_REPOSITORY = "NEBULAR_PM2_REPOSITORY";
export declare const PM2_METADATA_RECIPE_REVISION = "NEBULAR_PM2_RECIPE_REVISION";
export declare const PM2_METADATA_GRANT_ID = "NEBULAR_PM2_GRANT_ID";
export declare const PM2_METADATA_GRANT_GENERATION = "NEBULAR_PM2_GRANT_GENERATION";
export declare const PM2_METADATA_BINDING_GENERATION = "NEBULAR_PM2_BINDING_GENERATION";
export declare const PM2_METADATA_JOB_IDENTITY = "NEBULAR_PM2_JOB_IDENTITY";
export type Pm2ProjectedStatus = 'online' | 'stopped' | 'errored' | 'stopping' | 'launching' | 'unknown';
export type Pm2ProjectedOwnership = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'owned';
    slotId: string;
    attemptId: string;
    metadataDigest: string;
    startedAtMs: number;
    deadlineAtMs: number;
    managedContainment: Readonly<{
        kind: 'windows-job-v1';
        jobIdentity: string;
    }>;
    managedBootstrap: Readonly<{
        kind: 'bun-recipe-bootstrap-v1';
        brokerEntrypoint: string;
    }>;
    receiverAuthority: Pm2ProjectedReceiverAuthority;
}>;
export type Pm2ProjectedReceiverAuthority = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'owned';
    receiverId: string;
    receiverEntryIdentity: string;
    receiverCorrelation: string;
    repository: string;
    recipeRevision: string;
    grantId: string;
    grantGeneration: number;
    bindingGeneration: number;
}>;
export type Pm2ProjectedProcess = Readonly<{
    name: string;
    pmId: number;
    pid: number | null;
    status: Pm2ProjectedStatus;
    exitCode?: number;
    autorestart: boolean;
    treeKill: boolean;
    ownership: Pm2ProjectedOwnership;
}>;
export type Pm2MonitorProjection = Readonly<{
    processes: readonly Pm2ProjectedProcess[];
}>;
export type Pm2MonitorProjectionFailureCode = 'pm2-monitor-malformed' | 'pm2-monitor-oversize' | 'pm2-monitor-rpc-error';
export type Pm2MonitorProjectionResult<T> = Readonly<{
    outcome: 'success';
    value: T;
}> | Readonly<{
    outcome: 'failure';
    code: Pm2MonitorProjectionFailureCode;
}>;
export declare const projectAndWipePm2MonitorJson: (bytes: Uint8Array, allowedNames: readonly string[]) => Pm2MonitorProjectionResult<Pm2MonitorProjection>;
export declare const projectAndWipePm2SingleProcessJson: (bytes: Uint8Array, expectedName: string) => Pm2MonitorProjectionResult<Pm2ProjectedProcess>;
