import { rename } from 'node:fs/promises';
import { join } from 'node:path';

// Replaced with installed package subpaths in the isolated consumer.
import { createBunInheritedIpcRuntime } from '../../../broker-client.ts';
import {
  createBunNodeRecipeRunnerCliRuntime,
  runRecipeRunnerCli
} from '../../../recipe-runner.ts';

const inheritedIpc = createBunInheritedIpcRuntime();
const cliRuntime = createBunNodeRecipeRunnerCliRuntime({
  ...inheritedIpc,
  newRequestId: () => 'recipe-runner-local-plan'
});
const attemptReceiptPath = join(process.cwd(), '.nebular-e2e', 'runner-attempt.json');
const attemptReceiptPendingPath = `${attemptReceiptPath}.pending`;
const terminalReceiptPath = join(process.cwd(), '.nebular-e2e', 'runner-terminal.json');
const terminalReceiptPendingPath = `${terminalReceiptPath}.pending`;
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const allowedTerminalCodes = [
  'recipe-execution-succeeded',
  'recipe-execution-failed',
  'request-cancelled',
  'receiver-failed',
  'receiver-unavailable',
  'receiver-incompatible',
  'receiver-launch-failed',
  'receiver-launch-configuration-failed',
  'receiver-launch-canonical-plan-failed',
  'receiver-launch-receiver-probe-failed',
  'receiver-launch-durable-reservation-failed',
  'receiver-launch-exact-start-failed',
  'receiver-launch-exact-start-invalid',
  'receiver-launch-exact-start-admission-failed',
  'receiver-launch-exact-start-lock-failed',
  'receiver-launch-exact-start-observation-failed',
  'receiver-launch-exact-start-artifact-preparation-failed',
  'receiver-launch-exact-start-receiver-start-failed',
  'receiver-launch-bootstrap-artifact-failed',
  'receiver-launch-bootstrap-job-pending',
  'receiver-launch-bootstrap-job-name-missing',
  'receiver-launch-bootstrap-job-empty',
  'receiver-launch-bootstrap-job-unavailable',
  'receiver-launch-bootstrap-job-multiple',
  'receiver-launch-bootstrap-job-policy-failed',
  'receiver-launch-bootstrap-process-incarnation-failed',
  'receiver-launch-bootstrap-job-membership-failed',
  'receiver-launch-bootstrap-journal-bind-failed',
  'receiver-launch-exact-start-ownership-failed',
  'receiver-launch-exact-start-confirmation-failed',
  'receiver-launch-exact-start-timing-failed',
  'receiver-launch-terminal-before-containment',
  'receiver-launch-process-incarnation-failed',
  'receiver-launch-job-containment-failed',
  'receiver-launch-bootstrap-binding-failed',
  'receiver-terminal-observation-failed',
  'receiver-clock-failed',
  'authority-denied',
  'request-invalid',
  'process-plan-invalid',
  'ipc-invalid',
  'ipc-disconnected',
  'cleanup-request-failed',
  'cleanup-durable-binding-failed',
  'cleanup-job-tree-failed',
  'cleanup-root-exit-failed',
  'cleanup-exposure-closure-failed',
  'cleanup-pm2-deletion-failed',
  'cleanup-journal-finalization-failed',
  'cleanup-artifact-release-failed'
] as const;
const safeTerminalCode = (value: unknown): string =>
  typeof value === 'string' && allowedTerminalCodes.some(code => code === value)
    ? value
    : 'redacted-terminal-code';
const result = await runRecipeRunnerCli(
  Bun.argv.slice(2),
  {
    ...cliRuntime,
    brokerControl: {
      send: async request => {
        const response = await cliRuntime.brokerControl.send(request);
        if (response.isOk()) {
          const terminal: unknown = response.value.terminal;
          const attemptId: unknown = isRecord(terminal)
            ? terminal['attemptId']
            : undefined;
          const exactAttempt = typeof attemptId === 'string' &&
            /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(attemptId);
          const outcome = isRecord(terminal) &&
            (terminal['outcome'] === 'success' || terminal['outcome'] === 'failure' ||
              terminal['outcome'] === 'cancelled' || terminal['outcome'] === 'protocol-error' ||
              terminal['outcome'] === 'disconnected')
            ? terminal['outcome']
            : 'invalid';
          await Bun.write(terminalReceiptPendingPath, JSON.stringify({
            format: 'nebular-four-artifact-e2e/v1',
            proof: 'runner-terminal-observed',
            terminalAttempt: exactAttempt ? 'present' : 'absent',
            outcome,
            code: safeTerminalCode(isRecord(terminal) ? terminal['code'] : undefined)
          }));
          await rename(terminalReceiptPendingPath, terminalReceiptPath);
          if (exactAttempt) {
            await Bun.write(attemptReceiptPendingPath, JSON.stringify({
              format: 'nebular-four-artifact-e2e/v1',
              proof: 'trusted-broker-attempt-identity',
              attemptId
            }));
            await rename(attemptReceiptPendingPath, attemptReceiptPath);
          }
        } else {
          await Bun.write(terminalReceiptPendingPath, JSON.stringify({
            format: 'nebular-four-artifact-e2e/v1',
            proof: 'runner-terminal-observed',
            terminalAttempt: 'absent',
            outcome: 'control-error',
            code: 'control-error'
          }));
          await rename(terminalReceiptPendingPath, terminalReceiptPath);
        }
        return response;
      }
    }
  }
);

process.exitCode = result.isOk() && result.value.outcome === 'success' ? 0 : 1;
