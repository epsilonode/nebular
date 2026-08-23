export * from './src/recipe-runner/public.ts';

import {
  createBunInheritedIpcRuntime,
  runBrokerControlOverInheritedIpc
} from './src/broker-client/public.ts';

if (import.meta.main) {
  const argv: readonly string[] = Bun.argv.slice(2);
  const brokerFlag = argv.indexOf('--broker');
  const cwdFlag = argv.indexOf('--cwd');
  const brokerEntrypoint = brokerFlag < 0 ? undefined : argv[brokerFlag + 1];
  const cwd = cwdFlag < 0 ? process.cwd() : argv[cwdFlag + 1];
  if (argv[0] !== 'doctor' || brokerEntrypoint === undefined || cwd === undefined) process.exit(64);
  const result = await runBrokerControlOverInheritedIpc({
    brokerEntrypoint,
    cwd,
    payload: { operation: 'doctor', credentialSlotIds: [] }
  }, createBunInheritedIpcRuntime());
  if (result.isErr()) {
    console.error(JSON.stringify({ outcome: 'failure', code: result.error[0].code }));
    process.exit(1);
  }
  console.log(JSON.stringify({
    outcome: result.value.terminal.outcome,
    code: result.value.terminal.outcome === 'disconnected' ? 'ipc-disconnected' : result.value.terminal.code,
    progressCount: result.value.progress.length,
    helperExitCode: result.value.helperExitCode
  }));
  process.exit(result.value.terminal.outcome === 'success' ? 0 : 1);
}
