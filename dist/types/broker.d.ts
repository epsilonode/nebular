export * from './src/broker/public.ts';
import { type BrokerRequestId, type BrokerResult } from './src/broker/public.ts';
export type BrokerEntrypointChildMode = Readonly<{
    mode: 'none';
}> | Readonly<{
    mode: 'control';
    requestId: BrokerRequestId;
}> | Readonly<{
    mode: 'bootstrap';
    exchangeId: string;
}>;
export declare const parseBrokerEntrypointChildMode: (argv: readonly string[]) => BrokerResult<BrokerEntrypointChildMode>;
