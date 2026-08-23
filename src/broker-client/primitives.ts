import { clientErr, clientOk, type BrokerClientResult } from './result.ts';

declare const brokerPrimitive: unique symbol;
type BrokerPrimitive<Value, Name extends string> = Value & Readonly<{ [brokerPrimitive]: Name }>;

export type BrokerRequestId = BrokerPrimitive<string, 'BrokerRequestId'>;
export type BrokerAttemptId = BrokerPrimitive<string, 'BrokerAttemptId'>;
export type BrokerSequence = BrokerPrimitive<number, 'BrokerSequence'>;
export type BrokerTimestampMs = BrokerPrimitive<number, 'BrokerTimestampMs'>;

const validId = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

const parseId = <Name extends 'BrokerRequestId' | 'BrokerAttemptId'>(
  value: unknown,
  name: Name
): BrokerClientResult<BrokerPrimitive<string, Name>> =>
  typeof value === 'string' && validId(value)
    ? clientOk(value as BrokerPrimitive<string, Name>)
    : clientErr({ code: 'invalid-input', message: `${name} is invalid.` });

export const parseBrokerRequestId = (value: unknown): BrokerClientResult<BrokerRequestId> =>
  parseId(value, 'BrokerRequestId');

export const parseBrokerAttemptId = (value: unknown): BrokerClientResult<BrokerAttemptId> =>
  parseId(value, 'BrokerAttemptId');

export const parseBrokerSequence = (value: unknown): BrokerClientResult<BrokerSequence> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? clientOk(value as BrokerSequence)
    : clientErr({ code: 'invalid-input', message: 'BrokerSequence is invalid.' });

export const parseBrokerTimestampMs = (value: unknown): BrokerClientResult<BrokerTimestampMs> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? clientOk(value as BrokerTimestampMs)
    : clientErr({ code: 'invalid-input', message: 'BrokerTimestampMs is invalid.' });
