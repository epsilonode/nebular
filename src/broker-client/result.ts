import {
  err,
  errAsync,
  ok,
  okAsync,
  Result,
  ResultAsync,
  type Result as NeverthrowResult,
  type ResultAsync as NeverthrowResultAsync
} from 'neverthrow';

export type BrokerClientIssueCode =
  | 'application-import-failed'
  | 'bootstrap-expired'
  | 'bootstrap-not-ready'
  | 'bootstrap-rejected'
  | 'environment-invalid'
  | 'invalid-input'
  | 'message-too-large'
  | 'protocol-mismatch'
  | 'sequence-invalid'
  | 'session-closed'
  | 'transport-unavailable';

export type BrokerClientIssue = Readonly<{
  code: BrokerClientIssueCode;
  message: string;
  path?: readonly (string | number)[];
}>;

export type BrokerClientIssues = readonly [BrokerClientIssue, ...BrokerClientIssue[]];
export type BrokerClientResult<T> = NeverthrowResult<T, BrokerClientIssues>;
export type BrokerClientTaskResult<T> = NeverthrowResultAsync<T, BrokerClientIssues>;

export const clientOk = <T>(value: T): BrokerClientResult<T> => ok(value);

export const clientErr = <T = never>(
  issue: BrokerClientIssue,
  ...rest: readonly BrokerClientIssue[]
): BrokerClientResult<T> => err([issue, ...rest]);

export const clientTaskOk = <T>(value: T): BrokerClientTaskResult<T> => okAsync(value);

export const clientTaskErr = <T = never>(
  issue: BrokerClientIssue,
  ...rest: readonly BrokerClientIssue[]
): BrokerClientTaskResult<T> => errAsync([issue, ...rest]);

export const clientTry = <T>(
  operation: () => T,
  issue: BrokerClientIssue
): BrokerClientResult<T> => Result.fromThrowable(operation, () => [issue] as const)();

export const clientTryAsync = <T>(
  operation: PromiseLike<T>,
  issue: BrokerClientIssue
): BrokerClientTaskResult<T> => ResultAsync.fromPromise(operation, () => [issue] as const);
