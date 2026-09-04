import { isAbsolute, win32 } from 'node:path';

import { createWindowsKnownFolderLocalApplicationDataPort } from './bun-windows-profile.ts';
import {
  createWindowsBrokerHostConfigurationPort,
  type BrokerHostConfigurationIssue,
  type WindowsBrokerHostConfigurationPort
} from './windows-host-configuration.ts';
import {
  brokerErr,
  brokerOk,
  brokerTry,
  type BrokerIssue,
  type BrokerResult
} from './result.ts';

export type BrokerAdminCliPlan =
  | Readonly<{ command: 'host-configure'; gitExecutable: string }>
  | Readonly<{ command: 'host-status' }>;

export type BrokerAdminCliReceipt = Readonly<{
  outcome: 'success';
  code: 'host-configuration-ready' | 'host-configuration-missing';
  configured: boolean;
}>;

export type BrokerAdminCliRuntime = Readonly<{
  hostConfiguration: WindowsBrokerHostConfigurationPort;
}>;

const invalidArguments = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'request-invalid',
  message: 'Broker administration arguments are invalid.'
});

const isBoundedPath = (value: string): boolean => value.length > 0 && value.length <= 32_767 &&
  !value.includes('\0') && (isAbsolute(value) || win32.isAbsolute(value));

export const parseBrokerAdminCliPlan = (
  argv: readonly string[]
): BrokerResult<BrokerAdminCliPlan> => {
  if (argv.length === 1 && argv[0] === 'host-status') return brokerOk({ command: 'host-status' });
  if (argv.length === 3 && argv[0] === 'host-configure' && argv[1] === '--git') {
    const gitExecutable = argv[2];
    return gitExecutable !== undefined && isBoundedPath(gitExecutable)
      ? brokerOk({ command: 'host-configure', gitExecutable })
      : invalidArguments();
  }
  return invalidArguments();
};

const hostIssue = (issue: BrokerHostConfigurationIssue): BrokerIssue => ({
  code: issue.code === 'host-configuration-invalid' ? 'request-invalid' : 'bootstrap-failed',
  message: issue.code === 'host-configuration-invalid'
    ? 'The requested broker host configuration is invalid.'
    : 'The broker host configuration is unavailable.'
});

const hostFailure = <Value>(issue: BrokerHostConfigurationIssue): BrokerResult<Value> =>
  brokerErr(hostIssue(issue));

const executeHostStatus = (
  runtime: BrokerAdminCliRuntime
): Promise<BrokerResult<BrokerAdminCliReceipt>> => Promise.resolve()
  .then(() => runtime.hostConfiguration.read())
  .then(
    result => {
      if (result.type === 'ok') {
        return brokerOk({
          outcome: 'success',
          code: 'host-configuration-ready',
          configured: true
        });
      }
      return result.issues[0].code === 'host-configuration-not-initialized'
        ? brokerOk({
            outcome: 'success',
            code: 'host-configuration-missing',
            configured: false
          })
        : hostFailure(result.issues[0]);
    },
    () => brokerErr({
      code: 'bootstrap-failed',
      message: 'The broker host configuration is unavailable.'
    })
  );

const executeHostConfigure = (
  plan: Extract<BrokerAdminCliPlan, { command: 'host-configure' }>,
  runtime: BrokerAdminCliRuntime
): Promise<BrokerResult<BrokerAdminCliReceipt>> => Promise.resolve()
  .then(() => runtime.hostConfiguration.initialize({ gitExecutable: plan.gitExecutable }))
  .then(
    result => result.type === 'ok'
      ? brokerOk({
          outcome: 'success',
          code: 'host-configuration-ready',
          configured: true
        })
      : hostFailure(result.issues[0]),
    () => brokerErr({
      code: 'bootstrap-failed',
      message: 'The broker host configuration is unavailable.'
    })
  );

export const runBrokerAdminCli = (
  argv: readonly string[],
  runtime: BrokerAdminCliRuntime
): Promise<BrokerResult<BrokerAdminCliReceipt>> => {
  const plan = parseBrokerAdminCliPlan(argv);
  if (plan.isErr()) return Promise.resolve(brokerErr(plan.error[0], ...plan.error.slice(1)));
  const invoked = brokerTry(
    () => plan.value.command === 'host-status'
      ? executeHostStatus(runtime)
      : executeHostConfigure(plan.value, runtime),
    {
      code: 'bootstrap-failed',
      message: 'The broker administration operation is unavailable.'
    }
  );
  return invoked.isErr()
    ? Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)))
    : invoked.value.then(
        result => result,
        () => brokerErr({
          code: 'bootstrap-failed',
          message: 'The broker administration operation is unavailable.'
        })
      );
};

export const createWindowsBrokerAdminCliRuntime = (): BrokerAdminCliRuntime => {
  const localApplicationData = createWindowsKnownFolderLocalApplicationDataPort();
  return {
    hostConfiguration: createWindowsBrokerHostConfigurationPort(localApplicationData)
  };
};
