import { type WindowsBrokerHostConfigurationPort } from './windows-host-configuration.ts';
import { type BrokerResult } from './result.ts';
export type BrokerAdminCliPlan = Readonly<{
    command: 'host-configure';
    gitExecutable: string;
}> | Readonly<{
    command: 'host-status';
}>;
export type BrokerAdminCliReceipt = Readonly<{
    outcome: 'success';
    code: 'host-configuration-ready' | 'host-configuration-missing';
    configured: boolean;
}>;
export type BrokerAdminCliRuntime = Readonly<{
    hostConfiguration: WindowsBrokerHostConfigurationPort;
}>;
export declare const parseBrokerAdminCliPlan: (argv: readonly string[]) => BrokerResult<BrokerAdminCliPlan>;
export declare const runBrokerAdminCli: (argv: readonly string[], runtime: BrokerAdminCliRuntime) => Promise<BrokerResult<BrokerAdminCliReceipt>>;
export declare const createWindowsBrokerAdminCliRuntime: () => BrokerAdminCliRuntime;
