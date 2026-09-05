import type { ReceiverCorrelation, ReceiverEntryIdentity } from './journal.ts';
import { type Pm2ApplicationRpcClientPort, type Pm2ApplicationPrepareDispatchPort, type Pm2ApplicationStartConfig } from './pm2-application-rpc.ts';
import { type CanonicalRepository, type GrantId, type ProcessAttemptId, type ReceiverId, type RecipeRevision } from './primitives.ts';
import { type ExactNameOneShotPorts, type ExactOneShotStart, type OneShotCleanupReceipt } from './one-shot-receiver.ts';
import { type OneShotAttemptHandle, type OneShotCleanupProof, type OneShotResult } from './one-shot-slots.ts';
import { type WindowsNamedJobAttemptIdentity, type WindowsNamedJobContainmentConfig, type WindowsNamedJobIdentity } from './windows-named-job-containment.ts';
import type { CanonicalBrokerEntrypoint } from './windows-tool-registry.ts';
export declare const PM2_ONE_SHOT_MAX_TIMEOUT_MS = 10000;
export declare const PM2_ONE_SHOT_MAX_ARGUMENTS = 256;
export declare const PM2_ONE_SHOT_MAX_ARGUMENT_BYTES = 4096;
export declare const PM2_ONE_SHOT_MAX_ENVIRONMENT_ENTRIES = 64;
export type Pm2NonsecretEnvironmentAtom = Readonly<{
    kind: 'pm2-nonsecret-environment-atom';
    name: string;
    value: string;
}>;
export type Pm2OneShotAuthorityMetadata = Readonly<{
    receiverId: ReceiverId;
    receiverEntryIdentity: ReceiverEntryIdentity;
    receiverCorrelation: ReceiverCorrelation;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    grantId: GrantId;
    grantGeneration: number;
    bindingGeneration: number;
}>;
export type Pm2ManagedWindowsContainment = Readonly<{
    format: 'pm2-managed-windows-job/v1';
    jobIdentity: WindowsNamedJobIdentity;
}>;
export type Pm2ManagedBunRecipeBootstrap = Readonly<{
    format: 'pm2-managed-bun-recipe-bootstrap/v1';
    brokerEntrypoint: CanonicalBrokerEntrypoint;
}>;
export type Pm2OneShotLaunchPayload = Readonly<{
    executablePath: string;
    cwd: string;
    args: readonly string[];
    stdoutPath: string;
    stderrPath: string;
    pidPath: string;
    nonsecretEnvironment: readonly Pm2NonsecretEnvironmentAtom[];
    managedContainment: Pm2ManagedWindowsContainment;
    managedBootstrap: Pm2ManagedBunRecipeBootstrap;
    authority?: Pm2OneShotAuthorityMetadata;
}>;
export type Pm2OneShotAdapterConfig = Readonly<{
    endpoint: string;
    timeoutMs: number;
    namespace: string;
    allowedNonsecretEnvironmentNames: readonly string[];
    killRetryTimeMs: number;
}>;
export type Pm2OneShotConfigurationIssue = Readonly<{
    code: 'pm2-one-shot-configuration-invalid';
    field: 'adapter' | 'argument' | 'bootstrap' | 'containment' | 'environment' | 'path' | 'ownership';
}>;
export type Pm2OneShotCompatibilityPort = Readonly<{
    probeCompatible: () => Promise<boolean>;
}>;
export type Pm2OneShotCleanupProofPort = Readonly<{
    readProof: (handle: OneShotAttemptHandle) => Promise<OneShotCleanupProof>;
}>;
export type Pm2OneShotAdapterDependencies = Readonly<{
    rpc: Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
    compatibility: Pm2OneShotCompatibilityPort;
    cleanupProofs: Pm2OneShotCleanupProofPort;
    allocation: Readonly<{
        withAllocationLock: ExactNameOneShotPorts<Pm2OneShotLaunchPayload>['withAllocationLock'];
    }>;
}>;
export declare const derivePm2ManagedWindowsContainment: (config: Pick<WindowsNamedJobContainmentConfig, "trustedProfileRoot" | "namespace">, attempt: WindowsNamedJobAttemptIdentity) => OneShotResult<Pm2ManagedWindowsContainment, Pm2OneShotConfigurationIssue>;
export declare const createPm2NonsecretEnvironmentAtom: (name: string, value: string, allowedNames: readonly string[]) => OneShotResult<Pm2NonsecretEnvironmentAtom, Pm2OneShotConfigurationIssue>;
export declare const pm2OneShotMetadataDigest: (attemptId: ProcessAttemptId, payload: Pm2OneShotLaunchPayload, startedAtMs: number, deadlineAtMs: number) => string;
export declare const buildPm2OneShotStartConfig: (config: Pm2OneShotAdapterConfig, request: ExactOneShotStart<Pm2OneShotLaunchPayload>) => OneShotResult<Pm2ApplicationStartConfig, Pm2OneShotConfigurationIssue>;
export declare const createPm2ExactNameOneShotPorts: (config: Pm2OneShotAdapterConfig, dependencies: Pm2OneShotAdapterDependencies) => ExactNameOneShotPorts<Pm2OneShotLaunchPayload>;
export declare const oneShotCleanupReceiptIsExact: (receipt: OneShotCleanupReceipt, handle: OneShotAttemptHandle) => boolean;
