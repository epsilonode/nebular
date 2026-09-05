import { type BrokerOperationPort } from './operation.ts';
import { type BrokerResult } from './result.ts';
import { type WindowsPm2OneShotComposition, type WindowsPm2OneShotCompositionResolverOptions, type WindowsPm2OneShotCompositionResolverRuntime } from './windows-pm2-one-shot-composition.ts';
export type WindowsPm2OneShotBrokerOperationOptions = Readonly<{
    composition: WindowsPm2OneShotCompositionResolverOptions;
    doctorTimeoutMs?: number;
}>;
export type WindowsPm2OneShotBrokerOperationRuntime = Readonly<{
    resolveComposition: (options: WindowsPm2OneShotCompositionResolverOptions) => Promise<BrokerResult<WindowsPm2OneShotComposition>>;
}>;
/**
 * Privileged, host-owned PM2 composition. It resolves the broker's own
 * canonical authority context for every execute request; caller hints are
 * revalidated below this boundary and PM2 daemon lifecycle is never managed.
 */
export declare const createWindowsPm2OneShotBrokerOperationPort: (options: WindowsPm2OneShotBrokerOperationOptions, injectedRuntime?: WindowsPm2OneShotBrokerOperationRuntime) => BrokerOperationPort;
export declare const createWindowsPm2OneShotBrokerOperationTestRuntime: (resolver: WindowsPm2OneShotBrokerOperationRuntime["resolveComposition"]) => WindowsPm2OneShotBrokerOperationRuntime;
export type WindowsPm2OneShotBrokerOperationResolverRuntime = WindowsPm2OneShotCompositionResolverRuntime;
