export * from './src/broker/public.ts';

import {
  brokerIpcChildRequestId,
  createBunInheritedIpcChildRuntime,
  runBrokerInheritedIpcChild
} from './src/broker/public.ts';

if (import.meta.main) {
  const requestId = brokerIpcChildRequestId(Bun.argv);
  if (requestId.isErr() || requestId.value === undefined) process.exit(64);
  const served = await runBrokerInheritedIpcChild(
    { requestId: requestId.value },
    createBunInheritedIpcChildRuntime()
  );
  process.exit(served.isOk() ? 0 : 1);
}
