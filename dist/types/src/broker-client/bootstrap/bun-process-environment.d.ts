import { type BrokerClientResult } from '../result.ts';
import type { BootstrapEnvironmentInstallPort } from './cooperative.ts';
export type BunProcessEnvironmentRuntime = Readonly<{
    names: () => readonly string[];
    write: (name: string, value: string) => BrokerClientResult<void>;
    remove: (name: string) => BrokerClientResult<void>;
}>;
export declare const createBunProcessEnvironmentRuntime: () => BunProcessEnvironmentRuntime;
export declare const createBunProcessEnvironmentInstallPort: (runtime?: BunProcessEnvironmentRuntime) => BootstrapEnvironmentInstallPort;
export declare const bunProcessEnvironmentNames: () => readonly string[];
