import { type TeleportCapabilityCodec } from '../teleport/public.ts';
import { type TransferId } from './journal.ts';
import { type SecretTransferPortableFacts, type SecretTransferResult, type SecretTransferTaskResult } from './secret-transfer.ts';
export declare const SECRET_TRANSFER_PREVIEW_CAPABILITY_ID = "dev.credential.secret-transfer-preview";
export declare const SECRET_TRANSFER_INVENTORY_CAPABILITY_ID = "dev.credential.secret-transfer-inventory";
export declare const SECRET_TRANSFER_PREVIEW_VERSION = 1;
export declare const SECRET_TRANSFER_MAX_INVENTORY_BYTES: number;
export type SecretTransferAuthenticatedPreviewV1 = Readonly<{
    type: typeof SECRET_TRANSFER_PREVIEW_CAPABILITY_ID;
    version: typeof SECRET_TRANSFER_PREVIEW_VERSION;
    transferId: TransferId;
    provider: string;
    accountHint: string;
    environment: string;
    secretKind: string;
    providerScopes: readonly string[];
    intendedRecipientKeyId: string;
    issuedAtMs: number;
    transferExpiresAtMs: number;
    upstreamExpiresAtMs: number | null;
    portableFactsBinding: string;
    inventoryInstanceId: string;
    inventoryCid: string;
}>;
export type SecretTransferEncryptedInventory = Readonly<{
    bytes: Uint8Array;
}>;
export declare const createSecretTransferPortableFactsBinding: (facts: SecretTransferPortableFacts) => SecretTransferTaskResult<string>;
export declare const secretTransferPreviewCapabilityCodec: TeleportCapabilityCodec<SecretTransferAuthenticatedPreviewV1>;
export declare const secretTransferInventoryCapabilityCodec: TeleportCapabilityCodec<SecretTransferEncryptedInventory>;
export declare const secretTransferPreviewInstanceId: (transferId: TransferId) => string;
export declare const secretTransferInventoryInstanceId: (transferId: TransferId) => string;
export declare const createSecretTransferAuthenticatedPreview: (input: Readonly<{
    facts: SecretTransferPortableFacts;
    inventoryCid: string;
}>) => SecretTransferTaskResult<SecretTransferAuthenticatedPreviewV1>;
export declare const validateSecretTransferPreviewAdmission: (input: Readonly<{
    preview: SecretTransferAuthenticatedPreviewV1;
    recipientKeyId: string;
    atMs: number;
}>) => SecretTransferResult<SecretTransferAuthenticatedPreviewV1>;
export declare const verifySecretTransferPreviewBinding: (preview: SecretTransferAuthenticatedPreviewV1, facts: SecretTransferPortableFacts) => SecretTransferTaskResult<void>;
