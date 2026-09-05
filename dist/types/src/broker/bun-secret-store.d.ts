import { type CredentialReference, type SecretLeaseResult, type SecretLeaseTaskResult } from './lease.ts';
import type { SecretStoreLeasePort } from './secret-delivery.ts';
export declare const BUN_SECRET_SERVICE: "dev.epsilonode.nebular.broker.v1";
export declare const SECRET_INPUT_MAX_CODE_UNITS: number;
export declare const BUN_SECRET_OPERATION_TIMEOUT_MS = 5000;
export declare const BUN_SECRET_MAX_OPERATION_TIMEOUT_MS = 60000;
declare const secretInputSeal: unique symbol;
declare const secretInputNonceSeal: unique symbol;
export type BunSecretsReadPort = Readonly<{
    get: (options: Readonly<{
        service: string;
        name: string;
    }>) => Promise<string | null>;
}>;
export type BunSecretsWritePort = Readonly<{
    set: (options: Readonly<{
        service: string;
        name: string;
        value: string;
    }>) => Promise<void>;
    delete: (options: Readonly<{
        service: string;
        name: string;
    }>) => Promise<boolean>;
}>;
export type BunSecretStoreOptions = Readonly<{
    /**
     * Bounds how long the broker waits for a Bun.secrets operation. Bun exposes no
     * cancellation primitive, so a timed-out native mutation may still complete
     * later and must be reconciled by durable enrollment recovery.
     */
    operationTimeoutMs?: number;
}>;
export type SecretInput = Readonly<{
    [secretInputSeal]: true;
}>;
export type SecretInputNonce = Readonly<{
    [secretInputNonceSeal]: true;
}>;
export type SecretInputCapturePort = Readonly<{
    capture: (secretText: unknown) => SecretLeaseResult<SecretInput>;
}>;
export type SecretInputScope = Readonly<{
    nonce: SecretInputNonce;
    capture: SecretInputCapturePort;
}>;
export type SecretStoreWriteOutcome = Readonly<{
    outcome: 'stored';
}>;
export type SecretStoreDeleteOutcome = Readonly<{
    outcome: 'deleted' | 'missing';
}>;
export type SecretStoreAdminPort = Readonly<{
    store: (reference: CredentialReference, input: SecretInput, nonce: SecretInputNonce) => SecretLeaseTaskResult<SecretStoreWriteOutcome>;
    delete: (reference: CredentialReference) => SecretLeaseTaskResult<SecretStoreDeleteOutcome>;
}>;
export declare const openSecretInputScope: () => SecretInputScope;
export declare const secretInputBelongsToScope: (nonce: SecretInputNonce, candidate: unknown) => candidate is SecretInput;
export declare const sealSecretInputScope: (scope: SecretInputScope) => void;
export declare const disposeSecretInputScope: (scope: SecretInputScope) => void;
export declare const deriveBunSecretName: (reference: CredentialReference) => SecretLeaseTaskResult<string>;
export declare const createBunSecretStoreLeasePort: (runtime?: BunSecretsReadPort, options?: BunSecretStoreOptions) => SecretStoreLeasePort;
export declare const createBunSecretStoreAdminPort: (runtime?: BunSecretsWritePort, options?: BunSecretStoreOptions) => SecretStoreAdminPort;
export {};
