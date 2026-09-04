import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as setNodeTimeout } from 'node:timers';

import {
  BROKER_DEFAULT_OPERATION_TIMEOUT_MS,
  BROKER_MAX_OPERATION_TIMEOUT_MS,
  createBunInheritedIpcRuntime,
  runBrokerControlOverInheritedIpc,
  type BrokerClientResult,
  type BrokerInheritedIpcReceipt,
  type BrokerInheritedIpcRequest,
  type BrokerInheritedIpcRuntime
} from '../broker-client/public.ts';
import {
  decodeAndAdmitRecipeXml,
  parseRecipeRelativePath,
  parseRecipeRevision,
  recipeErr,
  recipeOk,
  recipeTry,
  recipeRevisionDigestInput,
  RECIPE_XML_MAX_BYTES,
  type AdmittedRecipe,
  type RecipeRelativePath,
  type RecipeRevision,
  type RecipeRunnerIssue,
  type RecipeRunnerResult
} from '../recipe-contract/public.ts';
import { buildExecuteRecipeRequest } from './request.ts';

export const RECIPE_RUNNER_MAX_ARG_COUNT = 16;
export const RECIPE_RUNNER_MAX_PATH_LENGTH = 4096;
export const RECIPE_RUNNER_LOCAL_READ_TIMEOUT_MS = 3_000;

export type RecipeRunnerDoctorCliPlan = Readonly<{
  command: 'doctor';
  brokerEntrypoint: string;
  cwd: string;
  timeoutMs: number;
}>;

export type RecipeRunnerRunCliPlan = Readonly<{
  command: 'run';
  brokerEntrypoint: string;
  repositoryPathHint: string;
  recipePathHint: RecipeRelativePath;
  grantIdHint: string;
  timeoutMs: number;
}>;

export type RecipeRunnerCliPlan = RecipeRunnerDoctorCliPlan | RecipeRunnerRunCliPlan;

export type RecipeRunnerCliReceipt = Readonly<{
  command: RecipeRunnerCliPlan['command'];
  outcome: BrokerInheritedIpcReceipt['terminal']['outcome'];
  code: string;
  progressCount: number;
  helperExitCode: number;
}>;

export type RecipeRunnerLocalReadRequest = Readonly<{
  repositoryPathHint: string;
  recipePathHint: RecipeRelativePath;
  maximumBytes: number;
  timeoutMs: number;
}>;

export type RecipeRunnerLocalReadOutcome =
  | Readonly<{ type: 'bytes'; bytes: Readonly<Uint8Array> }>
  | Readonly<{ type: 'too-large' }>
  | Readonly<{ type: 'deadline' }>
  | Readonly<{ type: 'unavailable' }>;

export type RecipeRunnerSha256Port = Readonly<{
  sha256: (
    input: Readonly<Uint8Array>
  ) => RecipeRunnerResult<unknown> | PromiseLike<RecipeRunnerResult<unknown>>;
}>;

export type RecipeRunnerBrokerControlPort = Readonly<{
  send: (
    request: BrokerInheritedIpcRequest
  ) => BrokerClientResult<BrokerInheritedIpcReceipt> | PromiseLike<BrokerClientResult<BrokerInheritedIpcReceipt>>;
}>;

export type RecipeRunnerCliRuntime = Readonly<{
  workingDirectory: Readonly<{ read: () => string }>;
  localRecipe: Readonly<{
    read: (
      request: RecipeRunnerLocalReadRequest
    ) => RecipeRunnerLocalReadOutcome | PromiseLike<RecipeRunnerLocalReadOutcome>;
  }>;
  digest: RecipeRunnerSha256Port;
  brokerControl: RecipeRunnerBrokerControlPort;
}>;

type CliFlag = '--broker' | '--cwd' | '--grant-id' | '--recipe' | '--timeout-ms';
type CliFlagEntry = readonly [CliFlag, string];

const invalidArgumentsIssue = (): RecipeRunnerIssue => ({
  code: 'invalid-input',
  message: 'Recipe runner arguments are invalid.'
});

const localRecipeUnavailableIssue = (): RecipeRunnerIssue => ({
  code: 'invalid-input',
  message: 'Local recipe diagnostics are unavailable.'
});

const localRecipeInvalidIssue = (): RecipeRunnerIssue => ({
  code: 'invalid-recipe',
  message: 'The local recipe did not pass canonical recipe admission.'
});

const localRecipeTooLargeIssue = (): RecipeRunnerIssue => ({
  code: 'resource-limit',
  message: 'The local recipe exceeds its byte budget.'
});

const digestUnavailableIssue = (): RecipeRunnerIssue => ({
  code: 'digest-failed',
  message: 'The local recipe revision could not be computed.'
});

const brokerUnavailableIssue = (): RecipeRunnerIssue => ({
  code: 'client-contract-invalid',
  message: 'The broker control operation is unavailable.'
});

const invalidArguments = <Value>(): RecipeRunnerResult<Value> => recipeErr(invalidArgumentsIssue());
const localRecipeUnavailable = <Value>(): RecipeRunnerResult<Value> => recipeErr(localRecipeUnavailableIssue());
const localRecipeInvalid = <Value>(): RecipeRunnerResult<Value> => recipeErr(localRecipeInvalidIssue());
const localRecipeTooLarge = <Value>(): RecipeRunnerResult<Value> => recipeErr(localRecipeTooLargeIssue());
const digestUnavailable = <Value>(): RecipeRunnerResult<Value> => recipeErr(digestUnavailableIssue());
const brokerUnavailable = <Value>(): RecipeRunnerResult<Value> => recipeErr(brokerUnavailableIssue());

const validBoundedPath = (value: string): boolean =>
  value.length > 0 && value.length <= RECIPE_RUNNER_MAX_PATH_LENGTH && !value.includes('\0');

const validGrantIdHint = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

const parseTimeout = (value: string | undefined): RecipeRunnerResult<number> => {
  if (value === undefined) return recipeOk(BROKER_DEFAULT_OPERATION_TIMEOUT_MS);
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= BROKER_MAX_OPERATION_TIMEOUT_MS
    ? recipeOk(parsed)
    : invalidArguments();
};

const isCliFlag = (value: string): value is CliFlag =>
  value === '--broker' ||
  value === '--cwd' ||
  value === '--grant-id' ||
  value === '--recipe' ||
  value === '--timeout-ms';

const parseFlagEntries = (
  argv: readonly string[]
): RecipeRunnerResult<readonly CliFlagEntry[]> => {
  if (argv.length === 0) return recipeOk([]);
  const flag = argv[0];
  const value = argv[1];
  if (flag === undefined || value === undefined || !isCliFlag(flag) || value.startsWith('--')) {
    return invalidArguments();
  }
  return parseFlagEntries(argv.slice(2)).map((entries): readonly CliFlagEntry[] => [
    [flag, value] as const,
    ...entries
  ]);
};

const exactFlags = (
  entries: readonly CliFlagEntry[],
  required: readonly CliFlag[],
  optional: readonly CliFlag[]
): boolean => {
  const names: readonly CliFlag[] = entries.map(([name]) => name);
  const allowed: readonly CliFlag[] = [...required, ...optional];
  return names.length >= required.length &&
    names.every(name => allowed.includes(name)) &&
    required.every(name => names.includes(name)) &&
    names.every((name, index) => names.indexOf(name) === index);
};

const flagValue = (entries: readonly CliFlagEntry[], name: CliFlag): string | undefined =>
  entries.find(([candidate]) => candidate === name)?.[1];

const parseDoctorPlan = (
  entries: readonly CliFlagEntry[],
  defaultCwd: string
): RecipeRunnerResult<RecipeRunnerDoctorCliPlan> => {
  if (!exactFlags(entries, ['--broker'], ['--cwd', '--timeout-ms'])) return invalidArguments();
  const brokerEntrypoint = flagValue(entries, '--broker');
  const cwd = flagValue(entries, '--cwd') ?? defaultCwd;
  if (brokerEntrypoint === undefined || !validBoundedPath(brokerEntrypoint) || !validBoundedPath(cwd)) {
    return invalidArguments();
  }
  return parseTimeout(flagValue(entries, '--timeout-ms')).map(timeoutMs => ({
    command: 'doctor',
    brokerEntrypoint,
    cwd,
    timeoutMs
  }));
};

const parseRunPlan = (
  entries: readonly CliFlagEntry[]
): RecipeRunnerResult<RecipeRunnerRunCliPlan> => {
  if (!exactFlags(entries, ['--broker', '--cwd', '--recipe', '--grant-id'], ['--timeout-ms'])) {
    return invalidArguments();
  }
  const brokerEntrypoint = flagValue(entries, '--broker');
  const repositoryPathHint = flagValue(entries, '--cwd');
  const recipePath = parseRecipeRelativePath(flagValue(entries, '--recipe'));
  const grantIdHint = flagValue(entries, '--grant-id');
  if (
    brokerEntrypoint === undefined ||
    repositoryPathHint === undefined ||
    grantIdHint === undefined ||
    !validBoundedPath(brokerEntrypoint) ||
    !validBoundedPath(repositoryPathHint) ||
    !validGrantIdHint(grantIdHint) ||
    recipePath.isErr()
  ) {
    return invalidArguments();
  }
  return parseTimeout(flagValue(entries, '--timeout-ms')).map(timeoutMs => ({
    command: 'run',
    brokerEntrypoint,
    repositoryPathHint,
    recipePathHint: recipePath.value,
    grantIdHint,
    timeoutMs
  }));
};

export const parseRecipeRunnerCliPlan = (
  argv: readonly string[],
  defaultCwd: string
): RecipeRunnerResult<RecipeRunnerCliPlan> => {
  if (
    argv.length < 1 ||
    argv.length > RECIPE_RUNNER_MAX_ARG_COUNT ||
    argv.some(argument => argument.length === 0 || argument.length > RECIPE_RUNNER_MAX_PATH_LENGTH || argument.includes('\0'))
  ) {
    return invalidArguments();
  }
  const command = argv[0];
  if (command !== 'doctor' && command !== 'run') return invalidArguments();
  return parseFlagEntries(argv.slice(1)).andThen(entries => command === 'doctor'
    ? parseDoctorPlan(entries, defaultCwd)
    : parseRunPlan(entries));
};

const attemptTask = <Value>(
  operation: () => RecipeRunnerResult<Value> | PromiseLike<RecipeRunnerResult<Value>>,
  issue: RecipeRunnerIssue
): Promise<RecipeRunnerResult<Value>> => Promise.resolve()
  .then(operation)
  .then(
    result => result,
    () => recipeErr(issue)
  );

const projectLocalRead = (
  outcome: RecipeRunnerLocalReadOutcome
): RecipeRunnerResult<Readonly<Uint8Array>> => {
  switch (outcome.type) {
    case 'bytes': return outcome.bytes.byteLength <= RECIPE_XML_MAX_BYTES
      ? recipeOk(outcome.bytes)
      : localRecipeTooLarge();
    case 'too-large': return localRecipeTooLarge();
    case 'deadline':
    case 'unavailable': return localRecipeUnavailable();
  }
};

const decodeLocalRecipeBytes = (
  bytes: Readonly<Uint8Array>
): RecipeRunnerResult<AdmittedRecipe> => recipeTry<string>(
  () => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)),
  localRecipeInvalidIssue()
).andThen(xml => {
  const admitted = decodeAndAdmitRecipeXml(xml);
  return admitted.isOk()
    ? recipeOk(admitted.value)
    : admitted.error.some(issue => issue.code === 'resource-limit')
      ? localRecipeTooLarge<AdmittedRecipe>()
      : localRecipeInvalid<AdmittedRecipe>();
});

const readAndAdmitLocalRecipe = (
  plan: RecipeRunnerRunCliPlan,
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<AdmittedRecipe>> => attemptTask<Readonly<Uint8Array>>(
  () => Promise.resolve(runtime.localRecipe.read({
    repositoryPathHint: plan.repositoryPathHint,
    recipePathHint: plan.recipePathHint,
    maximumBytes: RECIPE_XML_MAX_BYTES,
    timeoutMs: RECIPE_RUNNER_LOCAL_READ_TIMEOUT_MS
  })).then(projectLocalRead),
  localRecipeUnavailableIssue()
).then(read => read.andThen(decodeLocalRecipeBytes));

const computeLocalRevision = (
  recipe: AdmittedRecipe,
  digest: RecipeRunnerSha256Port
): Promise<RecipeRunnerResult<RecipeRevision>> => attemptTask(
  () => Promise.resolve(digest.sha256(recipeRevisionDigestInput(recipe))).then(result => {
    if (result.isErr()) return digestUnavailable();
    const revision = parseRecipeRevision(result.value);
    return revision.isOk() ? revision : digestUnavailable();
  }),
  digestUnavailableIssue()
);

const safeTerminalCode = (code: string): string =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(code) ? code : 'broker-terminal';

const redactedReceipt = (
  command: RecipeRunnerCliPlan['command'],
  receipt: BrokerInheritedIpcReceipt
): RecipeRunnerResult<RecipeRunnerCliReceipt> => {
  if (!Number.isSafeInteger(receipt.helperExitCode)) return brokerUnavailable();
  return recipeOk({
    command,
    outcome: receipt.terminal.outcome,
    code: receipt.terminal.outcome === 'disconnected'
      ? 'ipc-disconnected'
      : safeTerminalCode(receipt.terminal.code),
    progressCount: receipt.progress.length,
    helperExitCode: receipt.helperExitCode
  });
};

const sendBrokerControl = (
  command: RecipeRunnerCliPlan['command'],
  request: BrokerInheritedIpcRequest,
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => attemptTask(
  () => Promise.resolve(runtime.brokerControl.send(request)).then(result => result.isErr()
    ? brokerUnavailable()
    : redactedReceipt(command, result.value)),
  brokerUnavailableIssue()
);

const executeDoctorPlan = (
  plan: RecipeRunnerDoctorCliPlan,
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => sendBrokerControl('doctor', {
  brokerEntrypoint: plan.brokerEntrypoint,
  cwd: plan.cwd,
  payload: { operation: 'doctor', credentialSlotIds: [] },
  timeoutMs: plan.timeoutMs
}, runtime);

const executeRunPlan = (
  plan: RecipeRunnerRunCliPlan,
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => readAndAdmitLocalRecipe(plan, runtime).then(admitted => {
  if (admitted.isErr()) return recipeErr(admitted.error[0], ...admitted.error.slice(1));
  return computeLocalRevision(admitted.value, runtime.digest).then(revision => {
    if (revision.isErr()) return recipeErr(revision.error[0], ...revision.error.slice(1));
    const request = buildExecuteRecipeRequest({
      recipe: admitted.value,
      grantIdHint: plan.grantIdHint,
      repositoryPathHint: plan.repositoryPathHint,
      recipePathHint: plan.recipePathHint,
      recipeRevision: revision.value,
      requestId: 'recipe-runner-local-plan',
      sequence: 0,
      sentAtMs: 0
    });
    return request.isErr()
      ? brokerUnavailable()
      : sendBrokerControl('run', {
          brokerEntrypoint: plan.brokerEntrypoint,
          cwd: plan.repositoryPathHint,
          payload: request.value.payload,
          timeoutMs: plan.timeoutMs
        }, runtime);
  });
});

export const executeRecipeRunnerCliPlan = (
  plan: RecipeRunnerCliPlan,
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => attemptTask(
  () => plan.command === 'doctor'
    ? executeDoctorPlan(plan, runtime)
    : executeRunPlan(plan, runtime),
  brokerUnavailableIssue()
);

export const runRecipeRunnerCli = (
  argv: readonly string[],
  runtime: RecipeRunnerCliRuntime
): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => {
  const executeWithDefault = (defaultCwd: string): Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>> => {
    const plan = parseRecipeRunnerCliPlan(argv, defaultCwd);
    return Promise.resolve(plan.isErr()
      ? recipeErr<RecipeRunnerCliReceipt>(plan.error[0], ...plan.error.slice(1))
      : executeRecipeRunnerCliPlan(plan.value, runtime));
  };
  const needsWorkingDirectory = argv[0] === 'doctor' && !argv.includes('--cwd');
  return needsWorkingDirectory
    ? attemptTask(
        () => Promise.resolve().then(() => runtime.workingDirectory.read()).then(executeWithDefault),
        invalidArgumentsIssue()
      )
    : executeWithDefault('.');
};

const readIntoBuffer = (
  handle: FileHandle,
  buffer: Uint8Array,
  offset: number
): Promise<number> => offset >= buffer.byteLength
  ? Promise.resolve(offset)
  : handle.read(buffer, offset, buffer.byteLength - offset, offset).then((read: Readonly<Awaited<ReturnType<FileHandle['read']>>>) =>
      read.bytesRead === 0
        ? offset
        : readIntoBuffer(handle, buffer, offset + read.bytesRead)
    );

const closeWithOutcome = (
  handle: FileHandle,
  outcome: RecipeRunnerLocalReadOutcome
): Promise<RecipeRunnerLocalReadOutcome> => Promise.resolve()
  .then(() => handle.close())
  .then(
    () => outcome,
    (): RecipeRunnerLocalReadOutcome => ({ type: 'unavailable' })
  );

const readOpenRecipe = (
  handle: FileHandle,
  maximumBytes: number
): Promise<RecipeRunnerLocalReadOutcome> => Promise.resolve()
  .then(() => handle.stat())
  .then(
    (stats: Readonly<Stats>) => {
      if (!stats.isFile()) return Promise.resolve<RecipeRunnerLocalReadOutcome>({ type: 'unavailable' });
      if (stats.size > maximumBytes) return Promise.resolve<RecipeRunnerLocalReadOutcome>({ type: 'too-large' });
      const buffer = new Uint8Array(maximumBytes + 1);
      return readIntoBuffer(handle, buffer, 0).then((bytesRead): RecipeRunnerLocalReadOutcome => bytesRead > maximumBytes
        ? { type: 'too-large' }
        : { type: 'bytes', bytes: buffer.slice(0, bytesRead) });
    },
    (): RecipeRunnerLocalReadOutcome => ({ type: 'unavailable' })
  )
  .then(
    outcome => outcome,
    (): RecipeRunnerLocalReadOutcome => ({ type: 'unavailable' })
  )
  .then(outcome => closeWithOutcome(handle, outcome));

const localRecipeTarget = (
  request: RecipeRunnerLocalReadRequest
): string | undefined => {
  const repository = resolve(request.repositoryPathHint);
  const target = resolve(repository, ...request.recipePathHint.value.split('/'));
  const fromRepository = relative(repository, target);
  return fromRepository.length > 0 && !fromRepository.startsWith('..') && !isAbsolute(fromRepository)
    ? target
    : undefined;
};

const readLocalRecipeWithNode = (
  request: RecipeRunnerLocalReadRequest
): Promise<RecipeRunnerLocalReadOutcome> => {
  const target = localRecipeTarget(request);
  if (
    target === undefined ||
    !Number.isSafeInteger(request.maximumBytes) ||
    request.maximumBytes < 1 ||
    request.maximumBytes > RECIPE_XML_MAX_BYTES ||
    !Number.isSafeInteger(request.timeoutMs) ||
    request.timeoutMs < 1 ||
    request.timeoutMs > RECIPE_RUNNER_LOCAL_READ_TIMEOUT_MS
  ) {
    return Promise.resolve({ type: 'unavailable' });
  }
  const read = Promise.resolve()
    .then(() => open(target, 'r'))
    .then(
      handle => readOpenRecipe(handle, request.maximumBytes),
      (): RecipeRunnerLocalReadOutcome => ({ type: 'unavailable' })
    );
  const deadline = new Promise<RecipeRunnerLocalReadOutcome>(resolveOutcome => {
    const timer = setNodeTimeout(
      () => resolveOutcome({ type: 'deadline' }),
      request.timeoutMs
    );
    timer.unref();
  });
  return Promise.race([read, deadline]);
};

export const createBunNodeRecipeRunnerCliRuntime = (
  ipcRuntime: BrokerInheritedIpcRuntime = createBunInheritedIpcRuntime()
): RecipeRunnerCliRuntime => ({
  workingDirectory: { read: () => process.cwd() },
  localRecipe: { read: readLocalRecipeWithNode },
  digest: {
    sha256: input => recipeOk(createHash('sha256').update(Uint8Array.from(input)).digest('hex'))
  },
  brokerControl: {
    send: request => runBrokerControlOverInheritedIpc(request, ipcRuntime)
  }
});
