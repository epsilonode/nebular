import { mkdir, rm } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  PM2_WINDOWS_RPC_PIPE,
  allocateOneShotAttempt,
  createNodeNetPm2ApplicationRpcClient,
  createOneShotSlotPool,
  createUnadmittedPm2OneShotCleanupProofPort,
  createPm2ExactNameOneShotPorts,
  derivePm2ManagedWindowsContainment,
  createPm2ProtocolCompatibilityRuntimePort,
  createWindowsKnownFolderLocalApplicationDataPort,
  createWindowsNamedMutexAllocationPort,
  pm2OneShotMetadataDigest,
  probePm2Prerequisite,
  requestOneShotCancellation,
  parseProcessAttemptId,
  type OneShotAttemptHandle,
  type OneShotLaunchAllocationPort,
  type OneShotSlotDefinition
} from '../../src/broker/public.ts';

const failed = (message: string): false => {
  console.error(message);
  return false;
};

const main = async (): Promise<boolean> => {
  if (process.platform !== 'win32') {
    return failed('The exact-name PM2 one-shot live harness currently admits Windows only.');
  }
  const projectRoot = resolve(import.meta.dir, '../..');
  const suffix = randomBytes(6).toString('hex');
  const namespace = `nebular-live-${suffix}`;
  const poolResult = createOneShotSlotPool(namespace, 1);
  if (poolResult.outcome === 'failure') return failed('The live slot namespace was not admitted.');
  const slot: OneShotSlotDefinition | undefined = poolResult.value.slots.at(0);
  if (slot === undefined) return failed('The live slot pool was empty.');
  const attemptResult = parseProcessAttemptId(`live-${suffix}`);
  if (attemptResult.isErr()) return failed('The live attempt identity was not admitted.');
  const generatedRoot = resolve(projectRoot, '.generated/live/pm2');
  const attemptRoot = resolve(generatedRoot, namespace);
  const relativeAttemptRoot = relative(generatedRoot, attemptRoot);
  if (relativeAttemptRoot.startsWith('..') || isAbsolute(relativeAttemptRoot)) {
    return failed('The live output root escaped its generated directory.');
  }
  const trustedProfile = await createWindowsKnownFolderLocalApplicationDataPort().resolveCurrentUserRoot();
  if (trustedProfile.type === 'err') return failed('The trusted current-user mutex scope was unavailable.');
  await mkdir(attemptRoot, { recursive: true });

  const rpc = createNodeNetPm2ApplicationRpcClient();
  const compatibilityRuntime = createPm2ProtocolCompatibilityRuntimePort();
  const adapterConfig = {
    endpoint: PM2_WINDOWS_RPC_PIPE,
    timeoutMs: 2_000,
    namespace,
    allowedNonsecretEnvironmentNames: [] as readonly string[],
    killRetryTimeMs: 100
  };
  const containment = derivePm2ManagedWindowsContainment({
    trustedProfileRoot: trustedProfile.value,
    namespace
  }, {
    attemptId: attemptResult.value,
    attemptDigest: createHash('sha256')
      .update(`epsilonode-nebular-pm2-live/v1\0${suffix}`)
      .digest('hex')
  });
  if (containment.outcome === 'failure') return failed('The live Job identity was not admitted.');
  const payload = {
    executablePath: process.execPath,
    cwd: projectRoot,
    args: [resolve(import.meta.dir, 'fixtures/pm2-one-shot-child.ts')],
    stdoutPath: resolve(attemptRoot, 'stdout.log'),
    stderrPath: resolve(attemptRoot, 'stderr.log'),
    pidPath: resolve(attemptRoot, 'process.pid'),
    nonsecretEnvironment: [] as const,
    managedContainment: containment.value,
    managedBootstrap: {
      format: 'pm2-managed-bun-recipe-bootstrap/v1' as const,
      brokerEntrypoint: {
        kind: 'canonical-broker-entrypoint' as const,
        value: resolve(projectRoot, 'broker.ts')
      }
    }
  };
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + 30_000;
  const launch = {
    attemptId: attemptResult.value,
    metadataDigest: pm2OneShotMetadataDigest(attemptResult.value, payload, startedAtMs, deadlineAtMs),
    startedAtMs,
    deadlineAtMs,
    payload
  };
  const allocation: OneShotLaunchAllocationPort = {
    allocateLaunch: () => Promise.resolve({ outcome: 'success', value: undefined })
  };
  const allocationLock = createWindowsNamedMutexAllocationPort<typeof payload>({
    namespace,
    trustedProfileRoot: trustedProfile.value,
    timeoutMs: 2_000
  });
  const ports = createPm2ExactNameOneShotPorts(adapterConfig, {
    rpc,
    compatibility: {
      probeCompatible: () => probePm2Prerequisite({
        controlSurface: { kind: 'named-pipe', endpoint: PM2_WINDOWS_RPC_PIPE },
        timeoutMs: 2_000
      }, compatibilityRuntime).then(status => status.status === 'compatible')
    },
    cleanupProofs: createUnadmittedPm2OneShotCleanupProofPort(),
    allocation: allocationLock
  });

  const auditAbsent = (): Promise<boolean> => rpc.execute({
    endpoint: PM2_WINDOWS_RPC_PIPE,
    timeoutMs: 2_000,
    operation: { method: 'getMonitorData', allowedNames: [slot.processName.value] }
  }).then(result => result.outcome === 'success' && result.value.method === 'getMonitorData' &&
    result.value.processes.length === 0, () => false);
  const safeDiagnostic = (): Promise<string> => rpc.execute({
    endpoint: PM2_WINDOWS_RPC_PIPE,
    timeoutMs: 2_000,
    operation: { method: 'getMonitorData', allowedNames: [slot.processName.value] }
  }).then(result => {
    if (result.outcome === 'failure' || result.value.method !== 'getMonitorData') return 'unavailable';
    const process = result.value.processes.at(0);
    return process === undefined
      ? 'missing'
      : `${process.status}:exit-${process.exitCode === undefined ? 'unknown' : String(process.exitCode)}`;
  }, () => 'unavailable');

  try {
    if (!(await auditAbsent())) return failed('The unique live PM2 name was unexpectedly occupied.');
    const started = await allocateOneShotAttempt(poolResult.value, launch, ports, allocation);
    if (started.outcome === 'failure') {
      return failed(`The exact-name live launch failed closed at ${started.issue.code} (${await safeDiagnostic()}).`);
    }
    if (started.value.binding.status !== 'finalization-required') {
      return failed('The exact-name live launch remained cooperatively not-ready.');
    }
    const liveHandle: OneShotAttemptHandle = started.value.handle;
    const stopped = await requestOneShotCancellation(poolResult.value, liveHandle, ports);
    if (stopped.outcome === 'failure' || stopped.value.state !== 'terminal-cleanup-unconfirmed' ||
        stopped.value.cleanupReceipt !== undefined) {
      return failed('The exact-name live stop did not remain fail-closed without admitted tree-cleanup proof.');
    }
    console.log('PM2 exact-name reserve/atomic-start/observe/stop proof passed; cleanup remains unadmitted.');
    return true;
  } finally {
    if (!(await auditAbsent())) {
      const observed = await rpc.execute({
        endpoint: PM2_WINDOWS_RPC_PIPE,
        timeoutMs: 2_000,
        operation: { method: 'getMonitorData', allowedNames: [slot.processName.value] }
      });
      const process = observed.outcome === 'success' && observed.value.method === 'getMonitorData' &&
        observed.value.processes.length === 1 ? observed.value.processes[0] : undefined;
      if (process !== undefined && process.name === slot.processName.value) {
        if (process.status === 'online') {
          await rpc.execute({
            endpoint: PM2_WINDOWS_RPC_PIPE,
            timeoutMs: 2_000,
            operation: { method: 'stopProcessId', pmId: process.pmId, expectedName: process.name }
          });
        }
        await rpc.execute({
          endpoint: PM2_WINDOWS_RPC_PIPE,
          timeoutMs: 2_000,
          operation: { method: 'deleteProcessId', pmId: process.pmId, expectedName: process.name }
        });
      }
    }
    await rm(attemptRoot, { recursive: true, force: true });
  }
};

if (!(await main())) process.exitCode = 1;
