import { err, errAsync, ok, okAsync, Result, type Result as NeverthrowResult, type ResultAsync } from 'neverthrow';

export type BrokerIssueCode =
  | 'authority-denied'
  | 'bootstrap-failed'
  | 'bootstrap-replayed'
  | 'cleanup-partial'
  | 'credential-slot-invalid'
  | 'grant-expired'
  | 'grant-missing'
  | 'ipc-disconnected'
  | 'ipc-invalid'
  | 'lease-expired'
  | 'lease-invalid'
  | 'output-gap'
  | 'process-plan-invalid'
  | 'process-state-invalid'
  | 'provider-contract-invalid'
  | 'provider-operation-unsupported'
  | 'provider-registry-conflict'
  | 'provider-request-invalid'
  | 'provider-scope-invalid'
  | 'provider-unavailable'
  | 'recipe-drift'
  | 'receiver-cancel-failed'
  | 'receiver-conflict'
  | 'repository-invalid'
  | 'receiver-failed'
  | 'receiver-incompatible'
  | 'receiver-unavailable'
  | 'request-invalid';

export type BrokerIssue = Readonly<{
  code: BrokerIssueCode;
  message: string;
}>;

export type BrokerIssues = readonly [BrokerIssue, ...BrokerIssue[]];
export type BrokerResult<T> = NeverthrowResult<T, BrokerIssues>;
export type BrokerTaskResult<T> = ResultAsync<T, BrokerIssues>;

export const brokerOk = <T>(value: T): BrokerResult<T> => ok(value);
export const brokerErr = <T = never>(issue: BrokerIssue, ...rest: readonly BrokerIssue[]): BrokerResult<T> =>
  err([issue, ...rest]);
export const brokerTaskErr = <T = never>(issue: BrokerIssue, ...rest: readonly BrokerIssue[]): BrokerTaskResult<T> =>
  errAsync([issue, ...rest]);
export const brokerTaskOk = <T>(value: T): BrokerTaskResult<T> => okAsync(value);
export const brokerTry = <T>(operation: () => T, issue: BrokerIssue): BrokerResult<T> =>
  Result.fromThrowable(operation, () => [issue] as const)();
