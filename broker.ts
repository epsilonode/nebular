export * from './src/broker/public.ts';

import {
  BROKER_BOOTSTRAP_CHILD_MARKER,
  BROKER_IPC_CHILD_ARGUMENT,
  brokerBootstrapChildExchangeId,
  brokerIpcChildRequestId,
  brokerErr,
  brokerOk,
  createBunInheritedIpcChildRuntime,
  runBrokerInheritedIpcChild,
  type BrokerRequestId,
  type BrokerResult
} from './src/broker/public.ts';

export type BrokerEntrypointChildMode =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'control'; requestId: BrokerRequestId }>
  | Readonly<{ mode: 'bootstrap'; exchangeId: string }>;

const occurrenceCount = (argv: readonly string[], marker: string): number =>
  argv.filter(argument => argument === marker).length;

const hasExactMarkerSuffix = (argv: readonly string[], marker: string): boolean =>
  argv.indexOf(marker) === argv.length - 2;

export const parseBrokerEntrypointChildMode = (
  argv: readonly string[]
): BrokerResult<BrokerEntrypointChildMode> => {
  const controlCount = occurrenceCount(argv, BROKER_IPC_CHILD_ARGUMENT);
  const bootstrapCount = occurrenceCount(argv, BROKER_BOOTSTRAP_CHILD_MARKER);
  if (controlCount + bootstrapCount === 0) return brokerOk({ mode: 'none' });
  if (controlCount + bootstrapCount !== 1) {
    return brokerErr({ code: 'request-invalid', message: 'Broker child mode is ambiguous.' });
  }
  if (controlCount === 1) {
    if (!hasExactMarkerSuffix(argv, BROKER_IPC_CHILD_ARGUMENT)) {
      return brokerErr({ code: 'request-invalid', message: 'Broker control child arguments are invalid.' });
    }
    const requestId = brokerIpcChildRequestId(argv);
    return requestId.isOk() && requestId.value !== undefined
      ? brokerOk({ mode: 'control', requestId: requestId.value })
      : brokerErr({ code: 'request-invalid', message: 'Broker control child identity is invalid.' });
  }
  if (!hasExactMarkerSuffix(argv, BROKER_BOOTSTRAP_CHILD_MARKER)) {
    return brokerErr({ code: 'request-invalid', message: 'Broker bootstrap child arguments are invalid.' });
  }
  const exchangeId = brokerBootstrapChildExchangeId(argv);
  return exchangeId.isOk() && exchangeId.value !== undefined
    ? brokerOk({ mode: 'bootstrap', exchangeId: exchangeId.value })
    : brokerErr({ code: 'request-invalid', message: 'Broker bootstrap child identity is invalid.' });
};

if (import.meta.main) {
  const childMode = parseBrokerEntrypointChildMode(Bun.argv);
  if (childMode.isErr() || childMode.value.mode === 'none') process.exit(64);
  // The production durable authority/receiver adapters are not admitted yet.
  // Recognize bootstrap invocations but fail before opening a doomed handshake.
  if (childMode.value.mode === 'bootstrap') process.exit(78);
  const served = await runBrokerInheritedIpcChild(
    { requestId: childMode.value.requestId },
    createBunInheritedIpcChildRuntime()
  );
  process.exit(served.isOk() ? 0 : 1);
}
