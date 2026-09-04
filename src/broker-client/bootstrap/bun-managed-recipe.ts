import {
  createBootstrapNotReadyRetryPort,
  prepareRecipeEnvironmentThenImportWithRetry,
  type BootstrapEnvironmentInstallPort,
  type BootstrapNotReadyRetryPolicy,
  type BootstrapNotReadyRetryPort,
  type PreparedApplication
} from './cooperative.ts';
import {
  createBunCooperativeBootstrapTransportPort,
  type BunBootstrapTransportOptions
} from './bun-inherited-ipc.ts';
import {
  bunProcessEnvironmentNames,
  createBunProcessEnvironmentInstallPort
} from './bun-process-environment.ts';
import {
  createBunManagedAttemptEnvironmentPort,
  createManagedBootstrapRequest,
  type ManagedAttemptEnvironmentPort,
  type ManagedBootstrapRequestInput
} from './managed-attempt.ts';
import { createBunManagedWindowsJobFirstEffectGate } from './bun-windows-job-first-effect.ts';
import type {
  ManagedWindowsJobFirstEffectGatePort,
  ManagedWindowsJobLifetimeAnchor
} from './windows-job-first-effect.ts';
import {
  clientErr,
  clientTry,
  type BrokerClientResult
} from '../result.ts';
import type { CooperativeBootstrapTransportPort } from './cooperative.ts';

export const MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY: BootstrapNotReadyRetryPolicy = Object.freeze({
  maximumAttempts: 32,
  delayMs: 25
});
export const MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT = 'NEBULAR_BROKER_ENTRYPOINT' as const;

export type ManagedBunRecipeBootstrapInput = Readonly<{
  brokerEntrypoint?: string;
  cwd?: string;
  slots: ManagedBootstrapRequestInput['slots'];
  timeoutMs?: number;
  retryPolicy?: BootstrapNotReadyRetryPolicy;
}>;

export type ManagedBunRecipeBootstrapRuntime = Readonly<{
  containment: ManagedWindowsJobFirstEffectGatePort;
  authorityEnvironment: ManagedAttemptEnvironmentPort;
  environment: BootstrapEnvironmentInstallPort;
  inheritedEnvironment: Readonly<{ names: () => readonly string[] }>;
  locations: Readonly<{
    currentDirectory: () => string;
    brokerEntrypoint: () => unknown;
  }>;
  retry: BootstrapNotReadyRetryPort;
  transports: Readonly<{
    create: (options: BunBootstrapTransportOptions) => CooperativeBootstrapTransportPort;
  }>;
  clock: Readonly<{ nowMs: () => number }>;
}>;

export type PreparedManagedBunRecipeApplication<Module> = PreparedApplication<Module> & Readonly<{
  containment: ManagedWindowsJobLifetimeAnchor;
}>;

type PreparedManagedBunRecipeAdapters =
  | Readonly<{ status: 'invalid' }>
  | Readonly<{
      status: 'ready';
      cwd: string;
      inheritedEnvironmentNames: readonly string[];
      transport: CooperativeBootstrapTransportPort;
    }>;

const managedBootstrapFailure = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'transport-unavailable',
  message: 'The managed Bun recipe bootstrap could not be prepared.'
});

export const createManagedBunRecipeBootstrapRuntime = (): ManagedBunRecipeBootstrapRuntime => ({
  containment: createBunManagedWindowsJobFirstEffectGate(),
  authorityEnvironment: createBunManagedAttemptEnvironmentPort(),
  environment: createBunProcessEnvironmentInstallPort(),
  inheritedEnvironment: { names: bunProcessEnvironmentNames },
  locations: {
    currentDirectory: () => process.cwd(),
    brokerEntrypoint: () => process.env[MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]
  },
  retry: createBootstrapNotReadyRetryPort(),
  transports: { create: createBunCooperativeBootstrapTransportPort },
  clock: { nowMs: () => Date.now() }
});

const prepareAfterWindowsContainment = <Module>(
  input: ManagedBunRecipeBootstrapInput,
  deferredImport: () => PromiseLike<Module>,
  runtime: ManagedBunRecipeBootstrapRuntime
): Promise<BrokerClientResult<PreparedApplication<Module>>> => {
  const request = createManagedBootstrapRequest({ slots: input.slots }, runtime.authorityEnvironment);
  if (request.isErr()) return Promise.resolve(clientErr(request.error[0], ...request.error.slice(1)));
  const prepared = clientTry(
    (): PreparedManagedBunRecipeAdapters => {
      const cwd = input.cwd ?? runtime.locations.currentDirectory();
      const brokerEntrypoint = input.brokerEntrypoint ?? runtime.locations.brokerEntrypoint();
      if (typeof brokerEntrypoint !== 'string') return { status: 'invalid' as const };
      const transport = runtime.transports.create({
        brokerEntrypoint,
        cwd,
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs })
      });
      return {
        status: 'ready' as const,
        cwd,
        inheritedEnvironmentNames: runtime.inheritedEnvironment.names(),
        transport
      };
    },
    {
      code: 'transport-unavailable',
      message: 'The managed Bun recipe bootstrap adapters are unavailable.'
    }
  );
  if (prepared.isErr()) return Promise.resolve(clientErr(prepared.error[0], ...prepared.error.slice(1)));
  const adapters = prepared.value;
  if (adapters.status === 'invalid') {
    return Promise.resolve(clientErr({
      code: 'invalid-input',
      message: 'The managed broker entrypoint is unavailable.'
    }));
  }
  return Promise.resolve().then(() => prepareRecipeEnvironmentThenImportWithRetry(
    {
      request: request.value,
      inheritedEnvironmentNames: adapters.inheritedEnvironmentNames
    },
    {
      clock: runtime.clock,
      environment: runtime.environment,
      transport: adapters.transport
    },
    runtime.retry,
    input.retryPolicy ?? MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY,
    deferredImport
  )).then(
    result => result,
    () => managedBootstrapFailure<PreparedApplication<Module>>()
  );
};

export const prepareManagedBunRecipeEnvironmentThenImport = <Module>(
  input: ManagedBunRecipeBootstrapInput,
  deferredImport: () => PromiseLike<Module>,
  runtime: ManagedBunRecipeBootstrapRuntime = createManagedBunRecipeBootstrapRuntime()
): Promise<BrokerClientResult<PreparedManagedBunRecipeApplication<Module>>> => Promise.resolve()
  .then(() => runtime.containment.enter())
  .then(
    contained => contained.isErr()
      ? clientErr(contained.error[0], ...contained.error.slice(1))
      : prepareAfterWindowsContainment(input, deferredImport, runtime).then(prepared => prepared.map(
          application => ({
            ...application,
            containment: contained.value
          })
        )),
    () => managedBootstrapFailure<PreparedManagedBunRecipeApplication<Module>>()
  ).then(
    result => result,
    () => managedBootstrapFailure<PreparedManagedBunRecipeApplication<Module>>()
  );
