import { createHash } from 'node:crypto';

import { recipeOk, type RecipeRevisionDigestPort } from '../recipe-contract/public.ts';
import {
  BOOTSTRAP_AUTHORITY_MAX_LEASE_LIFETIME_MS,
  createDurableBootstrapLeaseAuthorityPort,
  liftBootstrapCurrentRecipeTaskPort,
  liftBootstrapCurrentReceiverAttemptTaskPort,
  type BootstrapCurrentRecipeTaskPort,
  type BootstrapCurrentReceiverAttemptTaskPort
} from './bootstrap-authority.ts';
import {
  createBunBootstrapInheritedIpcChildRuntime,
  type BrokerBootstrapChildPorts,
  type BrokerBootstrapInheritedIpcRuntime
} from './bun-bootstrap-inherited-ipc.ts';
import { createBunSecretStoreLeasePort } from './bun-secret-store.ts';
import {
  createBunSqliteAuthorityJournal,
  createWindowsProfilePathPort
} from './bun-sqlite-journal.ts';
import { createWindowsKnownFolderLocalApplicationDataPort } from './bun-windows-profile.ts';
import { createBrokerCurrentRecipeResolver } from './current-recipe.ts';
import { createGitCurrentRecipePorts } from './git-current-recipe.ts';
import type { AuthorityJournal, TrustedLocalApplicationDataPort } from './journal.ts';
import { createNodeNetPm2ApplicationRpcClient } from './pm2-application-rpc.ts';
import { createPm2ReceiverAttemptProjectionPort } from './pm2-receiver-attempt-projection.ts';
import { PM2_WINDOWS_RPC_PIPE } from './pm2-rpc.ts';
import {
  createCurrentBrokerProcessPort,
  createCurrentReceiverAttemptVerifier
} from './receiver-attempt-verifier.ts';
import { brokerErr, brokerOk, brokerTry, type BrokerResult } from './result.ts';
import type { SecretStoreLeasePort } from './secret-delivery.ts';
import {
  createWindowsBrokerHostConfigurationPort,
  type WindowsBrokerHostConfigurationPort
} from './windows-host-configuration.ts';
import { createWindowsProcessIncarnationPort } from './windows-process-incarnation.ts';

export const WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION = 'epsilonode-nebular-v1' as const;
export const WINDOWS_BROKER_BOOTSTRAP_DEFAULT_LEASE_LIFETIME_MS = 30_000;
export const WINDOWS_BROKER_BOOTSTRAP_MAX_LEASE_LIFETIME_MS =
  BOOTSTRAP_AUTHORITY_MAX_LEASE_LIFETIME_MS;
export const WINDOWS_BROKER_BOOTSTRAP_DEFAULT_ADAPTER_TIMEOUT_MS = 2_000;
export const WINDOWS_BROKER_BOOTSTRAP_MAX_ADAPTER_TIMEOUT_MS = 10_000;

export type WindowsBrokerBootstrapCompositionOptions = Readonly<{
  leaseLifetimeMs?: number;
  adapterTimeoutMs?: number;
}>;

export type WindowsBrokerBootstrapCompositionRuntime = Readonly<{
  localApplicationData: TrustedLocalApplicationDataPort;
  hostConfiguration: WindowsBrokerHostConfigurationPort;
  journal: AuthorityJournal;
  currentRecipes: Readonly<{
    create: (gitExecutable: string) => BootstrapCurrentRecipeTaskPort;
  }>;
  currentReceiverAttempt: BootstrapCurrentReceiverAttemptTaskPort;
  bootstrapRuntime: BrokerBootstrapInheritedIpcRuntime;
  secretStore: SecretStoreLeasePort;
  clock: Readonly<{ nowMs: () => number }>;
}>;

type ValidWindowsBrokerBootstrapCompositionOptions = Readonly<{
  leaseLifetimeMs: number;
  adapterTimeoutMs: number;
}>;

const compositionFailure = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'bootstrap-failed',
  message: 'The Windows broker bootstrap composition is unavailable.'
});

const validPositiveBound = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;

const validateOptions = (
  options: WindowsBrokerBootstrapCompositionOptions
): BrokerResult<ValidWindowsBrokerBootstrapCompositionOptions> => {
  const leaseLifetimeMs = options.leaseLifetimeMs ?? WINDOWS_BROKER_BOOTSTRAP_DEFAULT_LEASE_LIFETIME_MS;
  const adapterTimeoutMs = options.adapterTimeoutMs ?? WINDOWS_BROKER_BOOTSTRAP_DEFAULT_ADAPTER_TIMEOUT_MS;
  return validPositiveBound(leaseLifetimeMs, WINDOWS_BROKER_BOOTSTRAP_MAX_LEASE_LIFETIME_MS) &&
    validPositiveBound(adapterTimeoutMs, WINDOWS_BROKER_BOOTSTRAP_MAX_ADAPTER_TIMEOUT_MS)
    ? brokerOk({ leaseLifetimeMs, adapterTimeoutMs })
    : compositionFailure();
};

const recipeRevisionDigest: RecipeRevisionDigestPort = {
  sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
};

export const createWindowsBrokerBootstrapCompositionRuntime = (
  options: WindowsBrokerBootstrapCompositionOptions = {}
): WindowsBrokerBootstrapCompositionRuntime => {
  const validated = validateOptions(options);
  const adapterTimeoutMs = validated.isOk()
    ? validated.value.adapterTimeoutMs
    : WINDOWS_BROKER_BOOTSTRAP_DEFAULT_ADAPTER_TIMEOUT_MS;
  const clock = { nowMs: () => Date.now() };
  const localApplicationData = createWindowsKnownFolderLocalApplicationDataPort();
  const journal = createBunSqliteAuthorityJournal({
    profilePath: createWindowsProfilePathPort(localApplicationData),
    applicationVersion: WINDOWS_BROKER_BOOTSTRAP_APPLICATION_VERSION,
    clock
  });
  const pm2Client = createNodeNetPm2ApplicationRpcClient();
  return {
    localApplicationData,
    hostConfiguration: createWindowsBrokerHostConfigurationPort(localApplicationData),
    journal,
    currentRecipes: {
      create: gitExecutable => createBrokerCurrentRecipeResolver({
        ...createGitCurrentRecipePorts({ gitExecutable, deadlineMs: adapterTimeoutMs }),
        sha256: recipeRevisionDigest
      })
    },
    currentReceiverAttempt: createCurrentReceiverAttemptVerifier({
      brokerProcess: createCurrentBrokerProcessPort(),
      processIncarnations: createWindowsProcessIncarnationPort(),
      receiverAttempts: createPm2ReceiverAttemptProjectionPort({
        endpoint: PM2_WINDOWS_RPC_PIPE,
        timeoutMs: adapterTimeoutMs
      }, pm2Client)
    }, adapterTimeoutMs),
    bootstrapRuntime: createBunBootstrapInheritedIpcChildRuntime(),
    secretStore: createBunSecretStoreLeasePort(),
    clock
  };
};

const composeResolvedRuntime = (
  options: ValidWindowsBrokerBootstrapCompositionOptions,
  runtime: WindowsBrokerBootstrapCompositionRuntime,
  gitExecutable: string
): BrokerResult<BrokerBootstrapChildPorts> => {
  const currentRecipe = brokerTry(
    () => runtime.currentRecipes.create(gitExecutable),
    {
      code: 'bootstrap-failed',
      message: 'The current Git recipe authority could not be composed.'
    }
  );
  return currentRecipe.isErr()
    ? compositionFailure()
    : brokerOk({
        authority: createDurableBootstrapLeaseAuthorityPort({
          attempts: runtime.journal.attempts,
          clock: runtime.clock,
          grants: runtime.journal.grants,
          leaseLifetimeMs: options.leaseLifetimeMs,
          leases: runtime.journal.leases,
          recipes: liftBootstrapCurrentRecipeTaskPort(currentRecipe.value),
          receiverAttempts: liftBootstrapCurrentReceiverAttemptTaskPort(runtime.currentReceiverAttempt)
        }),
        clock: runtime.clock,
        runtime: runtime.bootstrapRuntime,
        secretStore: runtime.secretStore
      });
};

export const resolveWindowsBrokerBootstrapChildPorts = (
  options: WindowsBrokerBootstrapCompositionOptions = {},
  runtime: WindowsBrokerBootstrapCompositionRuntime = createWindowsBrokerBootstrapCompositionRuntime(options)
): Promise<BrokerResult<BrokerBootstrapChildPorts>> => {
  const validated = validateOptions(options);
  if (validated.isErr()) return Promise.resolve(compositionFailure<BrokerBootstrapChildPorts>());
  const read = brokerTry(
    () => runtime.hostConfiguration.read(),
    {
      code: 'bootstrap-failed',
      message: 'The broker host configuration could not be read.'
    }
  );
  if (read.isErr()) return Promise.resolve(compositionFailure<BrokerBootstrapChildPorts>());
  return read.value.then(
    configuration => configuration.type === 'ok'
      ? composeResolvedRuntime(validated.value, runtime, configuration.value.gitExecutable.value)
      : compositionFailure<BrokerBootstrapChildPorts>(),
    () => compositionFailure<BrokerBootstrapChildPorts>()
  );
};
