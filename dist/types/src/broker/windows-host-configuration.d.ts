import type { TrustedLocalApplicationDataPort } from './journal.ts';
export declare const BROKER_HOST_CONFIGURATION_SCHEMA: "epsilonode.nebular.broker-host-configuration/v1";
export declare const BROKER_HOST_CONFIGURATION_MAX_BYTES: number;
export declare const BROKER_HOST_CONFIGURATION_RELATIVE_PATH: readonly ["epsilonode", "nebular", "broker", "v1", "host-configuration.v1.json"];
export type CanonicalGitExecutable = Readonly<{
    kind: 'canonical-git-executable';
    value: string;
}>;
export type BrokerHostConfiguration = Readonly<{
    kind: 'broker-host-configuration';
    schema: typeof BROKER_HOST_CONFIGURATION_SCHEMA;
    gitExecutable: CanonicalGitExecutable;
}>;
export type InitializeBrokerHostConfiguration = Readonly<{
    gitExecutable: string;
}>;
export type BrokerHostConfigurationIssueCode = 'host-configuration-invalid' | 'host-configuration-not-initialized' | 'host-configuration-unavailable';
export type BrokerHostConfigurationIssue = Readonly<{
    code: BrokerHostConfigurationIssueCode;
    message: string;
}>;
export type BrokerHostConfigurationFailure = Readonly<{
    type: 'err';
    issues: readonly [BrokerHostConfigurationIssue];
}>;
export type BrokerHostConfigurationResult<T> = Readonly<{
    type: 'ok';
    value: T;
}> | BrokerHostConfigurationFailure;
export type BrokerHostConfigurationFileReadOutcome = Readonly<{
    status: 'read';
    text: string;
}> | Readonly<{
    status: 'missing';
}> | Readonly<{
    status: 'invalid-file';
}> | Readonly<{
    status: 'unavailable';
}>;
export type CanonicalExistingFileOutcome = Readonly<{
    status: 'resolved';
    canonicalPath: string;
}> | Readonly<{
    status: 'missing';
}> | Readonly<{
    status: 'not-regular-file';
}> | Readonly<{
    status: 'unavailable';
}>;
export type BrokerHostConfigurationAtomicWriteOutcome = Readonly<{
    status: 'written';
}> | Readonly<{
    status: 'failed';
}>;
export type BrokerHostConfigurationRuntimePort = Readonly<{
    readBoundedUtf8File: (path: string, maximumBytes: number) => Promise<BrokerHostConfigurationFileReadOutcome>;
    canonicalizeExistingRegularFile: (path: string) => Promise<CanonicalExistingFileOutcome>;
    writeUtf8FileAtomically: (path: string, text: string, maximumBytes: number) => Promise<BrokerHostConfigurationAtomicWriteOutcome>;
}>;
export type WindowsBrokerHostConfigurationPort = Readonly<{
    read: () => Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>>;
    initialize: (request: InitializeBrokerHostConfiguration) => Promise<BrokerHostConfigurationResult<BrokerHostConfiguration>>;
}>;
export declare const createWindowsBrokerHostConfigurationRuntime: () => BrokerHostConfigurationRuntimePort;
export declare const createWindowsBrokerHostConfigurationPort: (localApplicationData: TrustedLocalApplicationDataPort, runtime?: BrokerHostConfigurationRuntimePort) => WindowsBrokerHostConfigurationPort;
