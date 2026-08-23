import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

declare const brokerPrimitive: unique symbol;
type BrokerPrimitive<Name extends string> = string & Readonly<{ [brokerPrimitive]: Name }>;

export type CanonicalRepository = BrokerPrimitive<'CanonicalRepository'>;
export type RecipeRevision = BrokerPrimitive<'RecipeRevision'>;
export type GrantId = BrokerPrimitive<'GrantId'>;
export type CredentialSlotId = BrokerPrimitive<'CredentialSlotId'>;
export type ProcessAttemptId = BrokerPrimitive<'ProcessAttemptId'>;
export type ReceiverId = BrokerPrimitive<'ReceiverId'>;
export type ReceiverVersion = BrokerPrimitive<'ReceiverVersion'>;
export type ReceiverPlanId = BrokerPrimitive<'ReceiverPlanId'>;
export type ReceiverHandle = BrokerPrimitive<'ReceiverHandle'>;
export type OutputCursor = BrokerPrimitive<'OutputCursor'>;
export type CleanupId = BrokerPrimitive<'CleanupId'>;

const parseText = <Name extends string>(value: unknown, name: Name, maxLength: number): BrokerResult<BrokerPrimitive<Name>> =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength && !value.includes('\0')
    ? brokerOk(value as BrokerPrimitive<Name>)
    : brokerErr({ code: 'request-invalid', message: `${name} is invalid.` });

export const parseCanonicalRepository = (value: unknown): BrokerResult<CanonicalRepository> =>
  parseText(value, 'CanonicalRepository', 4096);
export const parseRecipeRevision = (value: unknown): BrokerResult<RecipeRevision> =>
  parseText(value, 'RecipeRevision', 256);
export const parseGrantId = (value: unknown): BrokerResult<GrantId> => parseText(value, 'GrantId', 128);
export const parseCredentialSlotId = (value: unknown): BrokerResult<CredentialSlotId> =>
  parseText(value, 'CredentialSlotId', 128);
export const parseProcessAttemptId = (value: unknown): BrokerResult<ProcessAttemptId> =>
  parseText(value, 'ProcessAttemptId', 128);
export const parseReceiverId = (value: unknown): BrokerResult<ReceiverId> => parseText(value, 'ReceiverId', 128);
export const parseReceiverVersion = (value: unknown): BrokerResult<ReceiverVersion> =>
  parseText(value, 'ReceiverVersion', 128);
export const parseReceiverPlanId = (value: unknown): BrokerResult<ReceiverPlanId> =>
  parseText(value, 'ReceiverPlanId', 128);
export const parseReceiverHandle = (value: unknown): BrokerResult<ReceiverHandle> =>
  parseText(value, 'ReceiverHandle', 256);
export const parseOutputCursor = (value: unknown): BrokerResult<OutputCursor> =>
  parseText(value, 'OutputCursor', 256);
export const parseCleanupId = (value: unknown): BrokerResult<CleanupId> => parseText(value, 'CleanupId', 128);
