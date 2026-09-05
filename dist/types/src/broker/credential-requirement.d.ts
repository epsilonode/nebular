import { type TeleportCapabilityCodec } from '../teleport/public.ts';
export declare const CREDENTIAL_REQUIREMENT_CAPABILITY_ID: "dev.credential.requirement";
export declare const CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION: 1;
export type CredentialRequirementProjectBinding = Readonly<{
    policy: 'any-project';
    repository: null;
}> | Readonly<{
    policy: 'exact-repository';
    repository: string;
}>;
export type CredentialRequirementAccountConstraint = null | Readonly<{
    accountId: string | null;
    accountLabel: string | null;
}>;
export type CredentialRequirementV1 = Readonly<{
    type: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_ID;
    version: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION;
    provider: string;
    environment: string;
    scopes: readonly string[];
    operations: readonly string[];
    projectBinding: CredentialRequirementProjectBinding;
    injectionName: string;
    accountConstraint: CredentialRequirementAccountConstraint;
}>;
export declare const credentialRequirementCapabilityCodec: TeleportCapabilityCodec<CredentialRequirementV1>;
