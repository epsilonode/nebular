import {
  clientErr,
  clientOk,
  clientTry,
  type BrokerClientResult
} from '../result.ts';
import { MANAGED_ATTEMPT_ENVIRONMENT } from './managed-attempt.ts';

export const MANAGED_WINDOWS_JOB_ENVIRONMENT = Object.freeze({
  jobIdentity: 'NEBULAR_PM2_JOB_IDENTITY',
  processAttemptId: MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId
} as const);

export type ManagedWindowsJobIdentity = Readonly<{
  kind: 'managed-windows-job-identity';
  value: string;
}>;

export type ManagedWindowsJobAttemptIdentity = Readonly<{
  kind: 'managed-windows-job-attempt-identity';
  value: string;
}>;

export type ManagedWindowsJobFirstEffectIdentity = Readonly<{
  job: ManagedWindowsJobIdentity;
  attempt: ManagedWindowsJobAttemptIdentity;
}>;

export type ManagedWindowsJobAnchorReceipt = Readonly<{
  state: 'assigned' | 'already-contained';
  job: ManagedWindowsJobIdentity;
  attempt: ManagedWindowsJobAttemptIdentity;
  processId: number;
}>;

export type ManagedWindowsJobLifetimeAnchorAuthority = Readonly<{
  proveRetained: () => Promise<BrokerClientResult<ManagedWindowsJobAnchorReceipt>>;
}>;

export type ManagedWindowsJobLifetimeAnchor = Readonly<{
  identity: ManagedWindowsJobAnchorReceipt;
  authority: ManagedWindowsJobLifetimeAnchorAuthority;
}>;

export type ManagedWindowsJobFirstEffectGatePort = Readonly<{
  enter: () => Promise<BrokerClientResult<ManagedWindowsJobLifetimeAnchor>>;
}>;

export type ManagedWindowsJobEnvironmentPort = Readonly<{
  read: (name: string) => unknown;
}>;

export type ManagedWindowsJobPolicyObservation =
  | Readonly<{ status: 'compatible' }>
  | Readonly<{ status: 'incompatible' | 'unavailable' }>;

export type ManagedWindowsJobBooleanObservation =
  | Readonly<{ status: 'observed'; value: boolean }>
  | Readonly<{ status: 'unavailable' }>;

export type ManagedWindowsJobActiveProcessObservation =
  | Readonly<{ status: 'observed'; activeProcesses: number }>
  | Readonly<{ status: 'unavailable' }>;

export type ManagedWindowsJobNativeAction = Readonly<{
  status: 'succeeded' | 'failed';
}>;

export type ManagedWindowsJobNativeSession = Readonly<{
  queryPolicy: () => Promise<ManagedWindowsJobPolicyObservation>;
  queryActiveProcesses: () => Promise<ManagedWindowsJobActiveProcessObservation>;
  isCurrentProcessInAnyJob: () => Promise<ManagedWindowsJobBooleanObservation>;
  isCurrentProcessInThisJob: () => Promise<ManagedWindowsJobBooleanObservation>;
  assignCurrentProcess: () => Promise<ManagedWindowsJobNativeAction>;
  close: () => Promise<boolean>;
}>;

export type ManagedWindowsJobNativeOpenOutcome =
  | Readonly<{
      status: 'opened';
      processId: number;
      session: ManagedWindowsJobNativeSession;
    }>
  | Readonly<{ status: 'unavailable' }>;

export type ManagedWindowsJobNativePort = Readonly<{
  openCurrentProcess: (
    job: ManagedWindowsJobIdentity
  ) => Promise<ManagedWindowsJobNativeOpenOutcome>;
}>;

const invalidAuthority = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'invalid-input',
  message: 'The managed Windows containment authority environment is invalid.'
});

const unavailable = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'transport-unavailable',
  message: 'The managed Windows containment first effect is unavailable.'
});

const incompatible = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'transport-unavailable',
  message: 'The current process has incompatible Windows containment authority.'
});

const readEnvironment = (
  environment: ManagedWindowsJobEnvironmentPort,
  name: string
): BrokerClientResult<unknown> => clientTry(
  () => environment.read(name),
  {
    code: 'invalid-input',
    message: 'The managed Windows containment authority environment is unavailable.'
  }
);

const parseIdentity = (
  jobValue: unknown,
  attemptValue: unknown
): BrokerClientResult<ManagedWindowsJobFirstEffectIdentity> =>
  typeof jobValue === 'string' &&
    /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(jobValue) &&
    typeof attemptValue === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(attemptValue)
    ? clientOk({
        job: { kind: 'managed-windows-job-identity', value: jobValue },
        attempt: { kind: 'managed-windows-job-attempt-identity', value: attemptValue }
      })
    : invalidAuthority();

export const readManagedWindowsJobFirstEffectIdentity = (
  environment: ManagedWindowsJobEnvironmentPort
): BrokerClientResult<ManagedWindowsJobFirstEffectIdentity> =>
  readEnvironment(environment, MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity).andThen(job =>
    readEnvironment(environment, MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId).andThen(attempt =>
      parseIdentity(job, attempt)
    )
  );

const processIdIsValid = (processId: number): boolean =>
  Number.isSafeInteger(processId) && processId > 0 && processId <= 0xffff_ffff;

const receipt = (
  identity: ManagedWindowsJobFirstEffectIdentity,
  processId: number,
  state: ManagedWindowsJobAnchorReceipt['state']
): BrokerClientResult<ManagedWindowsJobAnchorReceipt> => clientOk({
  state,
  job: identity.job,
  attempt: identity.attempt,
  processId
});

const operationUnavailable = (): BrokerClientResult<ManagedWindowsJobAnchorReceipt> => unavailable();
const operationIncompatible = (): BrokerClientResult<ManagedWindowsJobAnchorReceipt> => incompatible();

const proveContained = (
  identity: ManagedWindowsJobFirstEffectIdentity,
  processId: number,
  state: ManagedWindowsJobAnchorReceipt['state'],
  session: ManagedWindowsJobNativeSession
): Promise<BrokerClientResult<ManagedWindowsJobAnchorReceipt>> => Promise.resolve()
  .then(() => session.isCurrentProcessInThisJob())
  .then(
    membership => {
      if (membership.status === 'observed' && !membership.value) return operationIncompatible();
      if (membership.status !== 'observed') return operationUnavailable();
      return Promise.resolve().then(() => session.queryPolicy()).then(
        policy => {
          if (policy.status === 'incompatible') return operationIncompatible();
          if (policy.status !== 'compatible') return operationUnavailable();
          return Promise.resolve().then(() => session.queryActiveProcesses()).then(
            active => active.status === 'observed' && active.activeProcesses > 0
              ? receipt(identity, processId, state)
              : operationUnavailable(),
            operationUnavailable
          );
        },
        operationUnavailable
      );
    },
    operationUnavailable
  ).then(
    result => result,
    operationUnavailable
  );

const assignAfterPreconditions = (
  identity: ManagedWindowsJobFirstEffectIdentity,
  processId: number,
  session: ManagedWindowsJobNativeSession
): Promise<BrokerClientResult<ManagedWindowsJobAnchorReceipt>> => Promise.resolve()
  .then(() => session.isCurrentProcessInAnyJob())
  .then(
    anyJob => {
      if (anyJob.status !== 'observed') return operationUnavailable();
      if (anyJob.value) return operationIncompatible();
      return Promise.resolve().then(() => session.queryActiveProcesses()).then(
        active => {
          if (active.status !== 'observed') return operationUnavailable();
          if (active.activeProcesses !== 0) return operationIncompatible();
          return Promise.resolve().then(() => session.assignCurrentProcess()).then(
            assigned => assigned.status === 'succeeded'
              ? proveContained(identity, processId, 'assigned', session)
              : operationIncompatible(),
            operationUnavailable
          );
        },
        operationUnavailable
      );
    },
    operationUnavailable
  ).then(
    result => result,
    operationUnavailable
  );

const enterSession = (
  identity: ManagedWindowsJobFirstEffectIdentity,
  processId: number,
  session: ManagedWindowsJobNativeSession
): Promise<BrokerClientResult<ManagedWindowsJobAnchorReceipt>> => Promise.resolve()
  .then(() => session.queryPolicy())
  .then(
    policy => {
      if (policy.status === 'incompatible') return operationIncompatible();
      if (policy.status !== 'compatible') return operationUnavailable();
      return Promise.resolve().then(() => session.isCurrentProcessInThisJob()).then(
        membership => membership.status === 'observed'
          ? membership.value
            ? proveContained(identity, processId, 'already-contained', session)
            : assignAfterPreconditions(identity, processId, session)
          : operationUnavailable(),
        operationUnavailable
      );
    },
    operationUnavailable
  ).then(
    result => result,
    operationUnavailable
  );

const anchor = (
  identity: ManagedWindowsJobAnchorReceipt,
  source: ManagedWindowsJobFirstEffectIdentity,
  session: ManagedWindowsJobNativeSession
): ManagedWindowsJobLifetimeAnchor => ({
  identity,
  authority: {
    proveRetained: () => proveContained(source, identity.processId, 'already-contained', session)
  }
});

const anchorFailure = (): BrokerClientResult<ManagedWindowsJobLifetimeAnchor> => unavailable();

const transferLifetimeAnchor = (
  source: ManagedWindowsJobFirstEffectIdentity,
  processId: number,
  session: ManagedWindowsJobNativeSession
): Promise<BrokerClientResult<ManagedWindowsJobLifetimeAnchor>> => enterSession(
  source,
  processId,
  session
).then(
  entered => entered.isOk()
    ? clientOk(anchor(entered.value, source, session))
    : Promise.resolve().then(() => session.close()).then(
        closed => closed ? clientErr(entered.error[0], ...entered.error.slice(1)) : anchorFailure(),
        anchorFailure
      ),
  () => Promise.resolve().then(() => session.close()).then(
    anchorFailure,
    anchorFailure
  )
);

const openLifetimeAnchor = (
  identity: ManagedWindowsJobFirstEffectIdentity,
  native: ManagedWindowsJobNativePort
): Promise<BrokerClientResult<ManagedWindowsJobLifetimeAnchor>> => Promise.resolve()
  .then(() => native.openCurrentProcess(identity.job))
  .then(
    opened => opened.status === 'opened' && processIdIsValid(opened.processId)
      ? transferLifetimeAnchor(identity, opened.processId, opened.session)
      : anchorFailure(),
    anchorFailure
  ).then(
    result => result,
    anchorFailure
  );

export const createManagedWindowsJobFirstEffectGate = (
  environment: ManagedWindowsJobEnvironmentPort,
  native: ManagedWindowsJobNativePort
): ManagedWindowsJobFirstEffectGatePort => ({
  enter: () => {
    const identity = readManagedWindowsJobFirstEffectIdentity(environment);
    return identity.isOk()
      ? openLifetimeAnchor(identity.value, native)
      : Promise.resolve(clientErr(identity.error[0], ...identity.error.slice(1)));
  }
});
