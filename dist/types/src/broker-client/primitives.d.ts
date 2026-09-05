import { type BrokerClientResult } from './result.ts';
declare const brokerPrimitive: unique symbol;
type BrokerPrimitive<Value, Name extends string> = Value & Readonly<{
    [brokerPrimitive]: Name;
}>;
export type BrokerRequestId = BrokerPrimitive<string, 'BrokerRequestId'>;
export type BrokerAttemptId = BrokerPrimitive<string, 'BrokerAttemptId'>;
export type BrokerSequence = BrokerPrimitive<number, 'BrokerSequence'>;
export type BrokerTimestampMs = BrokerPrimitive<number, 'BrokerTimestampMs'>;
export declare const parseBrokerRequestId: (value: unknown) => BrokerClientResult<BrokerRequestId>;
export declare const parseBrokerAttemptId: (value: unknown) => BrokerClientResult<BrokerAttemptId>;
export declare const parseBrokerSequence: (value: unknown) => BrokerClientResult<BrokerSequence>;
export declare const parseBrokerTimestampMs: (value: unknown) => BrokerClientResult<BrokerTimestampMs>;
export {};
