import { type Pm2ApplicationRpcClientPort } from './pm2-application-rpc.ts';
import type { StrictReceiverAttemptProjectionPort } from './receiver-attempt-verifier.ts';
export type Pm2ReceiverAttemptProjectionConfig = Readonly<{
    endpoint: string;
    timeoutMs: number;
}>;
export declare const createPm2ReceiverAttemptProjectionPort: (config: Pm2ReceiverAttemptProjectionConfig, client: Pm2ApplicationRpcClientPort) => StrictReceiverAttemptProjectionPort;
