import { type BootstrapLeaseAuthorityPort } from './bootstrap-authority.ts';
import { type SecretLeaseResult, type SecretLeaseTaskResult } from './lease.ts';
import { type ExposedSecretDelivery, type SecretDeliveryClock, type SecretStoreLeasePort } from './secret-delivery.ts';
export declare const BROKER_BOOTSTRAP_BROKER_BUILD_ID: "epsilonode-nebular-bootstrap-v1";
export declare const BROKER_BOOTSTRAP_CHILD_MARKER: "--nebular-bootstrap-child";
export declare const BROKER_BOOTSTRAP_CHILD_TIMEOUT_MS = 15000;
export declare const BROKER_BOOTSTRAP_CHILD_MAX_TIMEOUT_MS = 60000;
export type BrokerBootstrapInheritedIpcRuntime = Readonly<{
    send: (message: unknown) => SecretLeaseTaskResult<void>;
    receive: (timeoutMs: number) => SecretLeaseTaskResult<unknown>;
    disconnect: () => SecretLeaseResult<void>;
}>;
export type BrokerBootstrapChildInput = Readonly<{
    exchangeId: unknown;
    timeoutMs?: number;
    buildId?: string;
}>;
export type BrokerBootstrapChildPorts = Readonly<{
    authority: BootstrapLeaseAuthorityPort;
    clock: SecretDeliveryClock;
    runtime: BrokerBootstrapInheritedIpcRuntime;
    secretStore: SecretStoreLeasePort;
}>;
export declare const runBrokerBootstrapInheritedIpcChild: (input: BrokerBootstrapChildInput, ports: BrokerBootstrapChildPorts) => SecretLeaseTaskResult<ExposedSecretDelivery>;
export declare const createBunBootstrapInheritedIpcChildRuntime: () => BrokerBootstrapInheritedIpcRuntime;
export declare const brokerBootstrapChildExchangeId: (argv: readonly string[]) => SecretLeaseResult<string | undefined>;
