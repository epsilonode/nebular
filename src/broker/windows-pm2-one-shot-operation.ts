import type { BrokerRequestMessage } from '../broker-client/public.ts';
import {
  createSystemGrantQualifiedOneShotTerminalWaitPorts
} from './grant-qualified-one-shot-terminal-observer.ts';
import {
  createPm2AwareBrokerOperationPort,
  type BrokerOperationContext,
  type BrokerOperationOutcome,
  type BrokerOperationPort
} from './operation.ts';
import { PM2_WINDOWS_RPC_PIPE } from './pm2-rpc.ts';
import {
  createRecipeExecutionOperationPort
} from './recipe-execution-operation.ts';
import { brokerErr, type BrokerResult } from './result.ts';
import {
  createWindowsOneShotExecutionPort
} from './windows-one-shot-execution.ts';
import {
  resolveWindowsPm2OneShotComposition,
  type WindowsPm2OneShotComposition,
  type WindowsPm2OneShotCompositionResolverOptions,
  type WindowsPm2OneShotCompositionResolverRuntime
} from './windows-pm2-one-shot-composition.ts';

export type WindowsPm2OneShotBrokerOperationOptions = Readonly<{
  composition: WindowsPm2OneShotCompositionResolverOptions;
  doctorTimeoutMs?: number;
}>;

export type WindowsPm2OneShotBrokerOperationRuntime = Readonly<{
  resolveComposition: (
    options: WindowsPm2OneShotCompositionResolverOptions
  ) => Promise<BrokerResult<WindowsPm2OneShotComposition>>;
}>;

const operationFailure = <Value>(): BrokerResult<Value> => brokerErr({
  code: 'receiver-failed',
  message: 'The production Windows broker operation is unavailable.'
});

const defaultRuntime = (): WindowsPm2OneShotBrokerOperationRuntime => ({
  resolveComposition: options => resolveWindowsPm2OneShotComposition(options)
});

const resolveExecutorOperation = (
  request: BrokerRequestMessage,
  nowMs: number,
  context: BrokerOperationContext | undefined,
  options: WindowsPm2OneShotBrokerOperationOptions,
  fallback: BrokerOperationPort,
  runtime: WindowsPm2OneShotBrokerOperationRuntime
): Promise<BrokerResult<BrokerOperationOutcome>> => Promise.resolve()
  .then(() => runtime.resolveComposition(options.composition))
  .then(
    resolved => resolved.isErr()
      ? operationFailure<BrokerOperationOutcome>()
      : createRecipeExecutionOperationPort({
          authority: resolved.value.authority,
          executor: createWindowsOneShotExecutionPort({
            pool: resolved.value.launchConfig.pool,
            trustedProfileRoot: resolved.value.launchConfig.trustedProfileRoot
          }, {
            launch: resolved.value.launch,
            terminalWait: createSystemGrantQualifiedOneShotTerminalWaitPorts(
              resolved.value.capabilities.receiver.observe
            ),
            cleanup: {
              attempts: resolved.value.journal.attempts,
              leases: resolved.value.journal.leases,
              containment: resolved.value.capabilities.containment,
              rootProcesses: resolved.value.capabilities.processIncarnations,
              pm2: resolved.value.capabilities.pm2Deletion,
              clock: resolved.value.capabilities.clock
            },
            artifacts: resolved.value.capabilities.artifacts
          }),
          fallback
        }).execute(request, nowMs, context),
    () => operationFailure<BrokerOperationOutcome>()
  );

/**
 * Privileged, host-owned PM2 composition. It resolves the broker's own
 * canonical authority context for every execute request; caller hints are
 * revalidated below this boundary and PM2 daemon lifecycle is never managed.
 */
export const createWindowsPm2OneShotBrokerOperationPort = (
  options: WindowsPm2OneShotBrokerOperationOptions,
  injectedRuntime: WindowsPm2OneShotBrokerOperationRuntime = defaultRuntime()
): BrokerOperationPort => {
  const fallback = createPm2AwareBrokerOperationPort({
    controlSurface: { kind: 'named-pipe', endpoint: PM2_WINDOWS_RPC_PIPE },
    timeoutMs: options.doctorTimeoutMs ?? 2_000
  });
  return {
    execute: (request, nowMs, context) => request.payload.operation === 'execute-recipe'
      ? resolveExecutorOperation(request, nowMs, context, options, fallback, injectedRuntime)
      : fallback.execute(request, nowMs, context)
  };
};

export const createWindowsPm2OneShotBrokerOperationTestRuntime = (
  resolver: WindowsPm2OneShotBrokerOperationRuntime['resolveComposition']
): WindowsPm2OneShotBrokerOperationRuntime => ({ resolveComposition: resolver });

export type WindowsPm2OneShotBrokerOperationResolverRuntime =
  WindowsPm2OneShotCompositionResolverRuntime;
