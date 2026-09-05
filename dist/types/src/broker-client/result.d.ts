import { type Result as NeverthrowResult, type ResultAsync as NeverthrowResultAsync } from 'neverthrow';
export type BrokerClientIssueCode = 'application-import-failed' | 'bootstrap-expired' | 'bootstrap-not-ready' | 'bootstrap-rejected' | 'environment-invalid' | 'invalid-input' | 'message-too-large' | 'protocol-mismatch' | 'sequence-invalid' | 'session-closed' | 'transport-unavailable';
export type BrokerClientIssue = Readonly<{
    code: BrokerClientIssueCode;
    message: string;
    path?: readonly (string | number)[];
}>;
export type BrokerClientIssues = readonly [BrokerClientIssue, ...BrokerClientIssue[]];
export type BrokerClientResult<T> = NeverthrowResult<T, BrokerClientIssues>;
export type BrokerClientTaskResult<T> = NeverthrowResultAsync<T, BrokerClientIssues>;
export declare const clientOk: <T>(value: T) => BrokerClientResult<T>;
export declare const clientErr: <T = never>(issue: BrokerClientIssue, ...rest: readonly BrokerClientIssue[]) => BrokerClientResult<T>;
export declare const clientTaskOk: <T>(value: T) => BrokerClientTaskResult<T>;
export declare const clientTaskErr: <T = never>(issue: BrokerClientIssue, ...rest: readonly BrokerClientIssue[]) => BrokerClientTaskResult<T>;
export declare const clientTry: <T>(operation: () => T, issue: BrokerClientIssue) => BrokerClientResult<T>;
export declare const clientTryAsync: <T>(operation: PromiseLike<T>, issue: BrokerClientIssue) => BrokerClientTaskResult<T>;
