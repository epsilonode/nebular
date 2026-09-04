import { MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT } from '../broker-client/public.ts';
import { brokerTry } from './result.ts';
import { isCanonicalLocalWindowsAbsolutePath } from './windows-execution-paths.ts';

export const PM2_MONITOR_MAX_JSON_BYTES = 512 * 1_024;
export const PM2_MONITOR_MAX_PROCESSES = 512;
export const PM2_MONITOR_MAX_DEPTH = 32;

export const PM2_METADATA_SLOT_ID = 'NEBULAR_PM2_SLOT_ID';
export const PM2_METADATA_ATTEMPT_ID = 'NEBULAR_PM2_ATTEMPT_ID';
export const PM2_METADATA_DIGEST = 'NEBULAR_PM2_METADATA_DIGEST';
export const PM2_METADATA_STARTED_AT_MS = 'NEBULAR_PM2_STARTED_AT_MS';
export const PM2_METADATA_DEADLINE_AT_MS = 'NEBULAR_PM2_DEADLINE_AT_MS';
export const PM2_METADATA_RECEIVER_ID = 'NEBULAR_PM2_RECEIVER_ID';
export const PM2_METADATA_RECEIVER_ENTRY_IDENTITY = 'NEBULAR_PM2_RECEIVER_ENTRY_IDENTITY';
export const PM2_METADATA_RECEIVER_CORRELATION = 'NEBULAR_PM2_RECEIVER_CORRELATION';
export const PM2_METADATA_REPOSITORY = 'NEBULAR_PM2_REPOSITORY';
export const PM2_METADATA_RECIPE_REVISION = 'NEBULAR_PM2_RECIPE_REVISION';
export const PM2_METADATA_GRANT_ID = 'NEBULAR_PM2_GRANT_ID';
export const PM2_METADATA_GRANT_GENERATION = 'NEBULAR_PM2_GRANT_GENERATION';
export const PM2_METADATA_BINDING_GENERATION = 'NEBULAR_PM2_BINDING_GENERATION';
export const PM2_METADATA_JOB_IDENTITY = 'NEBULAR_PM2_JOB_IDENTITY';

export type Pm2ProjectedStatus =
  | 'online'
  | 'stopped'
  | 'errored'
  | 'stopping'
  | 'launching'
  | 'unknown';

export type Pm2ProjectedOwnership =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{
      kind: 'owned';
      slotId: string;
      attemptId: string;
      metadataDigest: string;
      startedAtMs: number;
      deadlineAtMs: number;
      managedContainment: Readonly<{
        kind: 'windows-job-v1';
        jobIdentity: string;
      }>;
      managedBootstrap: Readonly<{
        kind: 'bun-recipe-bootstrap-v1';
        brokerEntrypoint: string;
      }>;
      receiverAuthority: Pm2ProjectedReceiverAuthority;
    }>;

export type Pm2ProjectedReceiverAuthority =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{
      kind: 'owned';
      receiverId: string;
      receiverEntryIdentity: string;
      receiverCorrelation: string;
      repository: string;
      recipeRevision: string;
      grantId: string;
      grantGeneration: number;
      bindingGeneration: number;
    }>;

export type Pm2ProjectedProcess = Readonly<{
  name: string;
  pmId: number;
  pid: number | null;
  status: Pm2ProjectedStatus;
  exitCode?: number;
  autorestart: boolean;
  treeKill: boolean;
  ownership: Pm2ProjectedOwnership;
}>;

export type Pm2MonitorProjection = Readonly<{
  processes: readonly Pm2ProjectedProcess[];
}>;

export type Pm2MonitorProjectionFailureCode =
  | 'pm2-monitor-malformed'
  | 'pm2-monitor-oversize'
  | 'pm2-monitor-rpc-error';

export type Pm2MonitorProjectionResult<T> =
  | Readonly<{ outcome: 'success'; value: T }>
  | Readonly<{ outcome: 'failure'; code: Pm2MonitorProjectionFailureCode }>;

type ParseResult<T> =
  | Readonly<{ outcome: 'success'; value: T; next: number }>
  | Readonly<{ outcome: 'failure' }>;

type JsonStringToken = Readonly<{
  contentStart: number;
  contentEnd: number;
  escaped: boolean;
}>;

type ByteRange = Readonly<{ start: number; end: number }>;

type ProjectedEnvironment = Readonly<{
  name?: string;
  pmId?: number;
  status?: string;
  exitCode?: number;
  autorestart?: boolean;
  treeKill?: boolean;
  slotId?: string;
  attemptId?: string;
  metadataDigest?: string;
  startedAtMs?: string;
  deadlineAtMs?: string;
  receiverId?: string;
  receiverEntryIdentity?: string;
  receiverCorrelation?: string;
  repository?: string;
  recipeRevision?: string;
  grantId?: string;
  grantGeneration?: string;
  bindingGeneration?: string;
  jobIdentity?: string;
  brokerEntrypoint?: string;
}>;

const projectionSuccess = <T>(value: T): Pm2MonitorProjectionResult<T> => ({ outcome: 'success', value });
const projectionFailure = <T = never>(
  code: Pm2MonitorProjectionFailureCode
): Pm2MonitorProjectionResult<T> => ({ outcome: 'failure', code });
const parseSuccess = <T>(value: T, next: number): ParseResult<T> => ({ outcome: 'success', value, next });
const parseFailure = <T = never>(): ParseResult<T> => ({ outcome: 'failure' });

const byteAt = (bytes: Readonly<Uint8Array>, index: number): number | undefined => bytes.at(index);
const whitespace = (byte: number | undefined): boolean =>
  byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;

const afterWhitespace = (bytes: Readonly<Uint8Array>, offset: number): number => {
  let cursor = offset;
  while (whitespace(byteAt(bytes, cursor))) cursor += 1;
  return cursor;
};

const isContinuation = (byte: number | undefined): boolean =>
  byte !== undefined && byte >= 0x80 && byte <= 0xbf;

const validUtf8 = (bytes: Readonly<Uint8Array>): boolean => {
  let cursor = 0;
  while (cursor < bytes.byteLength) {
    const first = byteAt(bytes, cursor);
    if (first === undefined) return false;
    if (first <= 0x7f) {
      cursor += 1;
      continue;
    }
    const second = byteAt(bytes, cursor + 1);
    if (first >= 0xc2 && first <= 0xdf && isContinuation(second)) {
      cursor += 2;
      continue;
    }
    const third = byteAt(bytes, cursor + 2);
    if (first === 0xe0 && second !== undefined && second >= 0xa0 && second <= 0xbf && isContinuation(third)) {
      cursor += 3;
      continue;
    }
    if (((first >= 0xe1 && first <= 0xec) || (first >= 0xee && first <= 0xef)) &&
        isContinuation(second) && isContinuation(third)) {
      cursor += 3;
      continue;
    }
    if (first === 0xed && second !== undefined && second >= 0x80 && second <= 0x9f && isContinuation(third)) {
      cursor += 3;
      continue;
    }
    const fourth = byteAt(bytes, cursor + 3);
    if (first === 0xf0 && second !== undefined && second >= 0x90 && second <= 0xbf &&
        isContinuation(third) && isContinuation(fourth)) {
      cursor += 4;
      continue;
    }
    if (first >= 0xf1 && first <= 0xf3 && isContinuation(second) && isContinuation(third) &&
        isContinuation(fourth)) {
      cursor += 4;
      continue;
    }
    if (first === 0xf4 && second !== undefined && second >= 0x80 && second <= 0x8f &&
        isContinuation(third) && isContinuation(fourth)) {
      cursor += 4;
      continue;
    }
    return false;
  }
  return true;
};

const hex = (byte: number | undefined): boolean => byte !== undefined &&
  ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x46) || (byte >= 0x61 && byte <= 0x66));

const scanString = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<JsonStringToken> => {
  if (byteAt(bytes, offset) !== 0x22) return parseFailure();
  let cursor = offset + 1;
  let escaped = false;
  while (cursor < bytes.byteLength) {
    const byte = byteAt(bytes, cursor);
    if (byte === undefined || byte < 0x20) return parseFailure();
    if (byte === 0x22) return parseSuccess({ contentStart: offset + 1, contentEnd: cursor, escaped }, cursor + 1);
    if (byte !== 0x5c) {
      cursor += 1;
      continue;
    }
    escaped = true;
    const escape = byteAt(bytes, cursor + 1);
    if (escape === 0x22 || escape === 0x5c || escape === 0x2f || escape === 0x62 || escape === 0x66 ||
        escape === 0x6e || escape === 0x72 || escape === 0x74) {
      cursor += 2;
      continue;
    }
    if (escape === 0x75 && hex(byteAt(bytes, cursor + 2)) && hex(byteAt(bytes, cursor + 3)) &&
        hex(byteAt(bytes, cursor + 4)) && hex(byteAt(bytes, cursor + 5))) {
      cursor += 6;
      continue;
    }
    return parseFailure();
  }
  return parseFailure();
};

const asciiText = (
  bytes: Readonly<Uint8Array>,
  token: JsonStringToken,
  maximumBytes: number
): string | undefined => {
  if (token.escaped || token.contentEnd - token.contentStart > maximumBytes) return undefined;
  let cursor = token.contentStart;
  let text = '';
  while (cursor < token.contentEnd) {
    const byte = byteAt(bytes, cursor);
    if (byte === undefined || byte < 0x20 || byte > 0x7e) return undefined;
    text += String.fromCharCode(byte);
    cursor += 1;
  }
  return text;
};

const keyAt = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<string | undefined> => {
  const token = scanString(bytes, offset);
  return token.outcome === 'failure'
    ? token
    : parseSuccess(asciiText(bytes, token.value, 128), token.next);
};

const digit = (byte: number | undefined): boolean => byte !== undefined && byte >= 0x30 && byte <= 0x39;

const skipNumber = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<undefined> => {
  let cursor = offset;
  if (byteAt(bytes, cursor) === 0x2d) cursor += 1;
  const first = byteAt(bytes, cursor);
  if (first === 0x30) cursor += 1;
  else {
    if (first === undefined || first < 0x31 || first > 0x39) return parseFailure();
    cursor += 1;
    while (digit(byteAt(bytes, cursor))) cursor += 1;
  }
  if (byteAt(bytes, cursor) === 0x2e) {
    cursor += 1;
    if (!digit(byteAt(bytes, cursor))) return parseFailure();
    while (digit(byteAt(bytes, cursor))) cursor += 1;
  }
  const exponent = byteAt(bytes, cursor);
  if (exponent === 0x65 || exponent === 0x45) {
    cursor += 1;
    const sign = byteAt(bytes, cursor);
    if (sign === 0x2b || sign === 0x2d) cursor += 1;
    if (!digit(byteAt(bytes, cursor))) return parseFailure();
    while (digit(byteAt(bytes, cursor))) cursor += 1;
  }
  return parseSuccess(undefined, cursor);
};

const literalAt = (
  bytes: Readonly<Uint8Array>,
  offset: number,
  literal: readonly number[]
): boolean => literal.every((byte, index) => byteAt(bytes, offset + index) === byte);

const skipLiteral = (
  bytes: Readonly<Uint8Array>,
  offset: number,
  literal: readonly number[]
): ParseResult<undefined> => literalAt(bytes, offset, literal)
  ? parseSuccess(undefined, offset + literal.length)
  : parseFailure();

const skipValue = (bytes: Readonly<Uint8Array>, offset: number, depth: number): ParseResult<undefined> => {
  if (depth > PM2_MONITOR_MAX_DEPTH) return parseFailure();
  const cursor = afterWhitespace(bytes, offset);
  const first = byteAt(bytes, cursor);
  if (first === 0x22) {
    const string = scanString(bytes, cursor);
    return string.outcome === 'failure' ? string : parseSuccess(undefined, string.next);
  }
  if (first === 0x7b) return skipObject(bytes, cursor, depth + 1);
  if (first === 0x5b) return skipArray(bytes, cursor, depth + 1);
  if (first === 0x74) return skipLiteral(bytes, cursor, [0x74, 0x72, 0x75, 0x65]);
  if (first === 0x66) return skipLiteral(bytes, cursor, [0x66, 0x61, 0x6c, 0x73, 0x65]);
  if (first === 0x6e) return skipLiteral(bytes, cursor, [0x6e, 0x75, 0x6c, 0x6c]);
  return skipNumber(bytes, cursor);
};

const skipObject = (bytes: Readonly<Uint8Array>, offset: number, depth: number): ParseResult<undefined> => {
  let cursor = afterWhitespace(bytes, offset + 1);
  if (byteAt(bytes, cursor) === 0x7d) return parseSuccess(undefined, cursor + 1);
  while (cursor < bytes.byteLength) {
    const key = scanString(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    const value = skipValue(bytes, cursor + 1, depth);
    if (value.outcome === 'failure') return value;
    cursor = afterWhitespace(bytes, value.next);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) return parseSuccess(undefined, cursor + 1);
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const skipArray = (bytes: Readonly<Uint8Array>, offset: number, depth: number): ParseResult<undefined> => {
  let cursor = afterWhitespace(bytes, offset + 1);
  if (byteAt(bytes, cursor) === 0x5d) return parseSuccess(undefined, cursor + 1);
  while (cursor < bytes.byteLength) {
    const value = skipValue(bytes, cursor, depth);
    if (value.outcome === 'failure') return value;
    cursor = afterWhitespace(bytes, value.next);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x5d) return parseSuccess(undefined, cursor + 1);
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const selectedString = (
  bytes: Readonly<Uint8Array>,
  offset: number,
  maximumBytes: number
): ParseResult<string> => {
  const token = scanString(bytes, afterWhitespace(bytes, offset));
  if (token.outcome === 'failure') return token;
  const value = asciiText(bytes, token.value, maximumBytes);
  return value === undefined ? parseFailure() : parseSuccess(value, token.next);
};

const selectedWindowsAuthorityString = (
  bytes: Readonly<Uint8Array>,
  offset: number,
  maximumCodeUnits: number
): ParseResult<string> => {
  const token = scanString(bytes, afterWhitespace(bytes, offset));
  if (token.outcome === 'failure') return token;
  let cursor = token.value.contentStart;
  let value = '';
  while (cursor < token.value.contentEnd) {
    const byte = byteAt(bytes, cursor);
    if (byte === 0x5c) {
      if (byteAt(bytes, cursor + 1) !== 0x5c) return parseFailure();
      value += '\\';
      cursor += 2;
    } else {
      if (byte === undefined || byte < 0x20 || byte > 0x7e) return parseFailure();
      value += String.fromCharCode(byte);
      cursor += 1;
    }
    if (value.length > maximumCodeUnits) return parseFailure();
  }
  return parseSuccess(value, token.next);
};

const selectedInteger = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<number> => {
  let cursor = afterWhitespace(bytes, offset);
  let sign = 1;
  if (byteAt(bytes, cursor) === 0x2d) {
    sign = -1;
    cursor += 1;
  }
  if (!digit(byteAt(bytes, cursor))) return parseFailure();
  let value = 0;
  while (digit(byteAt(bytes, cursor))) {
    const next = byteAt(bytes, cursor);
    if (next === undefined) return parseFailure();
    value = value * 10 + next - 0x30;
    if (!Number.isSafeInteger(value)) return parseFailure();
    cursor += 1;
  }
  return parseSuccess(sign * value, cursor);
};

const selectedNullableInteger = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<number | null> => {
  const cursor = afterWhitespace(bytes, offset);
  return literalAt(bytes, cursor, [0x6e, 0x75, 0x6c, 0x6c])
    ? parseSuccess(null, cursor + 4)
    : selectedInteger(bytes, cursor);
};

const selectedBoolean = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<boolean> => {
  const cursor = afterWhitespace(bytes, offset);
  if (literalAt(bytes, cursor, [0x74, 0x72, 0x75, 0x65])) return parseSuccess(true, cursor + 4);
  return literalAt(bytes, cursor, [0x66, 0x61, 0x6c, 0x73, 0x65])
    ? parseSuccess(false, cursor + 5)
    : parseFailure();
};

const parsePidObject = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<number | null> => {
  let cursor = afterWhitespace(bytes, offset);
  if (byteAt(bytes, cursor) !== 0x7b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  let pid: number | null | undefined;
  while (cursor < bytes.byteLength) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    if (key.value === 'pid') {
      if (pid !== undefined) return parseFailure();
      const value = selectedNullableInteger(bytes, cursor + 1);
      if (value.outcome === 'failure') return value;
      pid = value.value;
      cursor = value.next;
    } else {
      const skipped = skipValue(bytes, cursor + 1, 1);
      if (skipped.outcome === 'failure') return skipped;
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) return pid === undefined ? parseFailure() : parseSuccess(pid, cursor + 1);
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const parseProjectedEnvironment = (
  bytes: Readonly<Uint8Array>,
  offset: number
): ParseResult<ProjectedEnvironment> => {
  if (byteAt(bytes, afterWhitespace(bytes, offset)) !== 0x7b) return parseFailure();
  let cursor = afterWhitespace(bytes, afterWhitespace(bytes, offset) + 1);
  const selected: Record<string, unknown> = {};
  if (byteAt(bytes, cursor) === 0x7d) return parseSuccess({}, cursor + 1);
  while (cursor < bytes.byteLength) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    const valueOffset = cursor + 1;
    const stringKeys = ['name', 'status', PM2_METADATA_SLOT_ID, PM2_METADATA_ATTEMPT_ID, PM2_METADATA_DIGEST,
      PM2_METADATA_STARTED_AT_MS, PM2_METADATA_DEADLINE_AT_MS, PM2_METADATA_RECEIVER_ID,
      PM2_METADATA_RECEIVER_ENTRY_IDENTITY, PM2_METADATA_RECEIVER_CORRELATION, PM2_METADATA_REPOSITORY,
      PM2_METADATA_RECIPE_REVISION, PM2_METADATA_GRANT_ID, PM2_METADATA_GRANT_GENERATION,
      PM2_METADATA_BINDING_GENERATION, PM2_METADATA_JOB_IDENTITY,
      MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT];
    const integerKeys = ['pm_id', 'exit_code'];
    const booleanKeys = ['autorestart', 'treekill'];
    if (key.value !== undefined && (stringKeys.includes(key.value) || integerKeys.includes(key.value) ||
        booleanKeys.includes(key.value)) && key.value in selected) return parseFailure();
    if (key.value !== undefined && stringKeys.includes(key.value)) {
      const maxLength = key.value === PM2_METADATA_DIGEST ? 64
        : key.value === PM2_METADATA_JOB_IDENTITY ? 128
        : key.value === MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT ? 4_096
        : key.value === PM2_METADATA_REPOSITORY ? 4_096
          : key.value === PM2_METADATA_RECIPE_REVISION || key.value === PM2_METADATA_RECEIVER_ENTRY_IDENTITY ||
            key.value === PM2_METADATA_RECEIVER_CORRELATION ? 512
            : 128;
      const value = key.value === PM2_METADATA_JOB_IDENTITY ||
        key.value === PM2_METADATA_REPOSITORY ||
        key.value === MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT
        ? selectedWindowsAuthorityString(bytes, valueOffset, maxLength)
        : selectedString(bytes, valueOffset, maxLength);
      if (value.outcome === 'failure') return value;
      selected[key.value] = value.value;
      cursor = value.next;
    } else if (key.value !== undefined && integerKeys.includes(key.value)) {
      const value = selectedInteger(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      selected[key.value] = value.value;
      cursor = value.next;
    } else if (key.value !== undefined && booleanKeys.includes(key.value)) {
      const value = selectedBoolean(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      selected[key.value] = value.value;
      cursor = value.next;
    } else {
      const skipped = skipValue(bytes, valueOffset, 1);
      if (skipped.outcome === 'failure') return skipped;
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) {
      return parseSuccess({
        ...(typeof selected['name'] === 'string' ? { name: selected['name'] } : {}),
        ...(typeof selected['pm_id'] === 'number' ? { pmId: selected['pm_id'] } : {}),
        ...(typeof selected['status'] === 'string' ? { status: selected['status'] } : {}),
        ...(typeof selected['exit_code'] === 'number' ? { exitCode: selected['exit_code'] } : {}),
        ...(typeof selected['autorestart'] === 'boolean' ? { autorestart: selected['autorestart'] } : {}),
        ...(typeof selected['treekill'] === 'boolean' ? { treeKill: selected['treekill'] } : {}),
        ...(typeof selected[PM2_METADATA_SLOT_ID] === 'string' ? { slotId: selected[PM2_METADATA_SLOT_ID] } : {}),
        ...(typeof selected[PM2_METADATA_ATTEMPT_ID] === 'string' ? { attemptId: selected[PM2_METADATA_ATTEMPT_ID] } : {}),
        ...(typeof selected[PM2_METADATA_DIGEST] === 'string' ? { metadataDigest: selected[PM2_METADATA_DIGEST] } : {}),
        ...(typeof selected[PM2_METADATA_STARTED_AT_MS] === 'string' ? { startedAtMs: selected[PM2_METADATA_STARTED_AT_MS] } : {}),
        ...(typeof selected[PM2_METADATA_DEADLINE_AT_MS] === 'string' ? { deadlineAtMs: selected[PM2_METADATA_DEADLINE_AT_MS] } : {}),
        ...(typeof selected[PM2_METADATA_RECEIVER_ID] === 'string' ? { receiverId: selected[PM2_METADATA_RECEIVER_ID] } : {}),
        ...(typeof selected[PM2_METADATA_RECEIVER_ENTRY_IDENTITY] === 'string'
          ? { receiverEntryIdentity: selected[PM2_METADATA_RECEIVER_ENTRY_IDENTITY] }
          : {}),
        ...(typeof selected[PM2_METADATA_RECEIVER_CORRELATION] === 'string'
          ? { receiverCorrelation: selected[PM2_METADATA_RECEIVER_CORRELATION] }
          : {}),
        ...(typeof selected[PM2_METADATA_REPOSITORY] === 'string' ? { repository: selected[PM2_METADATA_REPOSITORY] } : {}),
        ...(typeof selected[PM2_METADATA_RECIPE_REVISION] === 'string'
          ? { recipeRevision: selected[PM2_METADATA_RECIPE_REVISION] }
          : {}),
        ...(typeof selected[PM2_METADATA_GRANT_ID] === 'string' ? { grantId: selected[PM2_METADATA_GRANT_ID] } : {}),
        ...(typeof selected[PM2_METADATA_GRANT_GENERATION] === 'string'
          ? { grantGeneration: selected[PM2_METADATA_GRANT_GENERATION] }
          : {}),
        ...(typeof selected[PM2_METADATA_BINDING_GENERATION] === 'string'
          ? { bindingGeneration: selected[PM2_METADATA_BINDING_GENERATION] }
          : {}),
        ...(typeof selected[PM2_METADATA_JOB_IDENTITY] === 'string'
          ? { jobIdentity: selected[PM2_METADATA_JOB_IDENTITY] }
          : {}),
        ...(typeof selected[MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT] === 'string'
          ? { brokerEntrypoint: selected[MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT] }
          : {})
      }, cursor + 1);
    }
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const extractEnvironmentName = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<string> => {
  let cursor = afterWhitespace(bytes, offset);
  if (byteAt(bytes, cursor) !== 0x7b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  let name: string | undefined;
  while (cursor < bytes.byteLength) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    if (key.value === 'name') {
      if (name !== undefined) return parseFailure();
      const selected = selectedString(bytes, cursor + 1, 128);
      if (selected.outcome === 'failure') return selected;
      name = selected.value;
      cursor = selected.next;
    } else {
      const skipped = skipValue(bytes, cursor + 1, 1);
      if (skipped.outcome === 'failure') return skipped;
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) return name === undefined ? parseFailure() : parseSuccess(name, cursor + 1);
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const extractProcessName = (bytes: Readonly<Uint8Array>, range: ByteRange): ParseResult<string> => {
  let cursor = afterWhitespace(bytes, range.start);
  if (byteAt(bytes, cursor) !== 0x7b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  let name: string | undefined;
  let environmentName: string | undefined;
  while (cursor < range.end) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    if (key.value === 'name') {
      if (name !== undefined) return parseFailure();
      const selected = selectedString(bytes, cursor + 1, 128);
      if (selected.outcome === 'failure') return selected;
      name = selected.value;
      cursor = selected.next;
    } else if (key.value === 'pm2_env') {
      if (environmentName !== undefined) return parseFailure();
      const selected = extractEnvironmentName(bytes, cursor + 1);
      if (selected.outcome === 'failure') return selected;
      environmentName = selected.value;
      cursor = selected.next;
    } else {
      const skipped = skipValue(bytes, cursor + 1, 1);
      if (skipped.outcome === 'failure') return skipped;
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) {
      if (name !== undefined && environmentName !== undefined && name !== environmentName) return parseFailure();
      const resolved = name ?? environmentName;
      return resolved === undefined ? parseFailure() : parseSuccess(resolved, cursor + 1);
    }
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const safeStatus = (status: string): Pm2ProjectedStatus => {
  switch (status) {
    case 'online': return 'online';
    case 'stopped': return 'stopped';
    case 'errored': return 'errored';
    case 'stopping': return 'stopping';
    case 'launching': return 'launching';
    default: return 'unknown';
  }
};

const safeDecimal = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const receiverAuthorityFrom = (environment: ProjectedEnvironment): Pm2ProjectedReceiverAuthority => {
  const values = [environment.receiverId, environment.receiverEntryIdentity, environment.receiverCorrelation,
    environment.repository, environment.recipeRevision, environment.grantId, environment.grantGeneration,
    environment.bindingGeneration];
  if (values.every(value => value === undefined)) return { kind: 'absent' };
  const grantGeneration = safeDecimal(environment.grantGeneration);
  const bindingGeneration = safeDecimal(environment.bindingGeneration);
  return environment.receiverId !== undefined && environment.receiverId.length > 0 &&
    environment.receiverEntryIdentity !== undefined && environment.receiverEntryIdentity.length > 0 &&
    environment.receiverCorrelation !== undefined && environment.receiverCorrelation.length > 0 &&
    environment.repository !== undefined && environment.repository.length > 0 &&
    environment.recipeRevision !== undefined && environment.recipeRevision.length > 0 &&
    environment.grantId !== undefined && environment.grantId.length > 0 && grantGeneration !== undefined &&
    grantGeneration > 0 && bindingGeneration !== undefined && bindingGeneration > 0
    ? {
        kind: 'owned',
        receiverId: environment.receiverId,
        receiverEntryIdentity: environment.receiverEntryIdentity,
        receiverCorrelation: environment.receiverCorrelation,
        repository: environment.repository,
        recipeRevision: environment.recipeRevision,
        grantId: environment.grantId,
        grantGeneration,
        bindingGeneration
      }
    : { kind: 'invalid' };
};

const ownershipFrom = (environment: ProjectedEnvironment): Pm2ProjectedOwnership => {
  const ownershipValues = [environment.slotId, environment.attemptId, environment.metadataDigest,
    environment.startedAtMs, environment.deadlineAtMs, environment.jobIdentity, environment.brokerEntrypoint];
  if (ownershipValues.every(value => value === undefined)) return { kind: 'absent' };
  const startedAtMs = safeDecimal(environment.startedAtMs);
  const deadlineAtMs = safeDecimal(environment.deadlineAtMs);
  return environment.slotId !== undefined && /^[a-z0-9][a-z0-9:-]{1,127}$/u.test(environment.slotId) &&
    environment.attemptId !== undefined && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(environment.attemptId) &&
    environment.metadataDigest !== undefined && /^[a-f0-9]{64}$/u.test(environment.metadataDigest) &&
    startedAtMs !== undefined && deadlineAtMs !== undefined && deadlineAtMs > startedAtMs &&
    environment.jobIdentity !== undefined &&
    /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(environment.jobIdentity) &&
    isCanonicalLocalWindowsAbsolutePath(environment.brokerEntrypoint) && environment.brokerEntrypoint.length <= 4_096
    ? {
        kind: 'owned',
        slotId: environment.slotId,
        attemptId: environment.attemptId,
        metadataDigest: environment.metadataDigest,
        startedAtMs,
        deadlineAtMs,
        managedContainment: {
          kind: 'windows-job-v1',
          jobIdentity: environment.jobIdentity
        },
        managedBootstrap: {
          kind: 'bun-recipe-bootstrap-v1',
          brokerEntrypoint: environment.brokerEntrypoint
        },
        receiverAuthority: receiverAuthorityFrom(environment)
      }
    : { kind: 'invalid' };
};

const projectProcess = (bytes: Readonly<Uint8Array>, range: ByteRange): ParseResult<Pm2ProjectedProcess> => {
  let cursor = afterWhitespace(bytes, range.start);
  if (byteAt(bytes, cursor) !== 0x7b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  let name: string | undefined;
  let pmId: number | undefined;
  let pid: number | null | undefined;
  let processPid: number | null | undefined;
  let environment: ProjectedEnvironment | undefined;
  while (cursor < range.end) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return key;
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return parseFailure();
    const valueOffset = cursor + 1;
    if (key.value === 'name') {
      if (name !== undefined) return parseFailure();
      const value = selectedString(bytes, valueOffset, 128);
      if (value.outcome === 'failure') return value;
      name = value.value;
      cursor = value.next;
    } else if (key.value === 'pm_id') {
      if (pmId !== undefined) return parseFailure();
      const value = selectedInteger(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      pmId = value.value;
      cursor = value.next;
    } else if (key.value === 'pid') {
      if (pid !== undefined) return parseFailure();
      const value = selectedNullableInteger(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      pid = value.value;
      cursor = value.next;
    } else if (key.value === 'pm2_env') {
      if (environment !== undefined) return parseFailure();
      const value = parseProjectedEnvironment(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      environment = value.value;
      cursor = value.next;
    } else if (key.value === 'process') {
      if (processPid !== undefined) return parseFailure();
      const value = parsePidObject(bytes, valueOffset);
      if (value.outcome === 'failure') return value;
      processPid = value.value;
      cursor = value.next;
    } else {
      const skipped = skipValue(bytes, valueOffset, 1);
      if (skipped.outcome === 'failure') return skipped;
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) break;
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  const resolvedName = name ?? environment?.name;
  const resolvedPmId = pmId ?? environment?.pmId;
  const resolvedPid = pid ?? processPid;
  if (resolvedName === undefined || resolvedPmId === undefined || resolvedPid === undefined || environment === undefined ||
      (name !== undefined && environment.name !== name) ||
      (pmId !== undefined && environment.pmId !== pmId) || environment.status === undefined ||
      environment.autorestart === undefined || environment.treeKill === undefined || resolvedPmId < 0 ||
      (resolvedPid !== null && resolvedPid < 0)) return parseFailure();
  return parseSuccess({
    name: resolvedName,
    pmId: resolvedPmId,
    pid: resolvedPid,
    status: safeStatus(environment.status),
    ...(environment.exitCode === undefined ? {} : { exitCode: environment.exitCode }),
    autorestart: environment.autorestart,
    treeKill: environment.treeKill,
    ownership: ownershipFrom(environment)
  }, cursor + 1);
};

const processRanges = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<readonly ByteRange[]> => {
  let cursor = afterWhitespace(bytes, offset);
  if (byteAt(bytes, cursor) !== 0x5b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  const ranges: ByteRange[] = [];
  if (byteAt(bytes, cursor) === 0x5d) return parseSuccess(ranges, cursor + 1);
  while (cursor < bytes.byteLength) {
    if (ranges.length >= PM2_MONITOR_MAX_PROCESSES || byteAt(bytes, cursor) !== 0x7b) return parseFailure();
    const skipped = skipValue(bytes, cursor, 1);
    if (skipped.outcome === 'failure') return skipped;
    ranges.push({ start: cursor, end: skipped.next });
    cursor = afterWhitespace(bytes, skipped.next);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x5d) return parseSuccess(ranges, cursor + 1);
    if (separator !== 0x2c) return parseFailure();
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return parseFailure();
};

const argsProcessRanges = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<readonly ByteRange[]> => {
  let cursor = afterWhitespace(bytes, offset);
  if (byteAt(bytes, cursor) !== 0x5b) return parseFailure();
  const ranges = processRanges(bytes, cursor + 1);
  if (ranges.outcome === 'failure') return ranges;
  cursor = afterWhitespace(bytes, ranges.next);
  return byteAt(bytes, cursor) === 0x5d
    ? parseSuccess(ranges.value, cursor + 1)
    : parseFailure();
};

const argsSingleProcessRange = (bytes: Readonly<Uint8Array>, offset: number): ParseResult<ByteRange> => {
  let cursor = afterWhitespace(bytes, offset);
  if (byteAt(bytes, cursor) !== 0x5b) return parseFailure();
  cursor = afterWhitespace(bytes, cursor + 1);
  if (byteAt(bytes, cursor) !== 0x7b) return parseFailure();
  const value = skipValue(bytes, cursor, 1);
  if (value.outcome === 'failure') return value;
  const range = { start: cursor, end: value.next };
  cursor = afterWhitespace(bytes, value.next);
  return byteAt(bytes, cursor) === 0x5d
    ? parseSuccess(range, cursor + 1)
    : parseFailure();
};

const envelopeRanges = (bytes: Readonly<Uint8Array>): Pm2MonitorProjectionResult<readonly ByteRange[]> => {
  let cursor = afterWhitespace(bytes, 0);
  if (byteAt(bytes, cursor) !== 0x7b) return projectionFailure('pm2-monitor-malformed');
  cursor = afterWhitespace(bytes, cursor + 1);
  let ranges: readonly ByteRange[] | undefined;
  let rpcError = false;
  while (cursor < bytes.byteLength) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return projectionFailure('pm2-monitor-malformed');
    if (key.value === 'args') {
      if (ranges !== undefined) return projectionFailure('pm2-monitor-malformed');
      const value = argsProcessRanges(bytes, cursor + 1);
      if (value.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
      ranges = value.value;
      cursor = value.next;
    } else {
      if (key.value === 'error') rpcError = true;
      const skipped = skipValue(bytes, cursor + 1, 1);
      if (skipped.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) {
      cursor = afterWhitespace(bytes, cursor + 1);
      if (cursor !== bytes.byteLength) return projectionFailure('pm2-monitor-malformed');
      if (rpcError) return projectionFailure('pm2-monitor-rpc-error');
      return ranges === undefined ? projectionFailure('pm2-monitor-malformed') : projectionSuccess(ranges);
    }
    if (separator !== 0x2c) return projectionFailure('pm2-monitor-malformed');
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return projectionFailure('pm2-monitor-malformed');
};

const envelopeSingleRange = (bytes: Readonly<Uint8Array>): Pm2MonitorProjectionResult<ByteRange> => {
  let cursor = afterWhitespace(bytes, 0);
  if (byteAt(bytes, cursor) !== 0x7b) return projectionFailure('pm2-monitor-malformed');
  cursor = afterWhitespace(bytes, cursor + 1);
  let range: ByteRange | undefined;
  let rpcError = false;
  while (cursor < bytes.byteLength) {
    const key = keyAt(bytes, cursor);
    if (key.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
    cursor = afterWhitespace(bytes, key.next);
    if (byteAt(bytes, cursor) !== 0x3a) return projectionFailure('pm2-monitor-malformed');
    if (key.value === 'args') {
      if (range !== undefined) return projectionFailure('pm2-monitor-malformed');
      const value = argsSingleProcessRange(bytes, cursor + 1);
      if (value.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
      range = value.value;
      cursor = value.next;
    } else {
      if (key.value === 'error') rpcError = true;
      const skipped = skipValue(bytes, cursor + 1, 1);
      if (skipped.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
      cursor = skipped.next;
    }
    cursor = afterWhitespace(bytes, cursor);
    const separator = byteAt(bytes, cursor);
    if (separator === 0x7d) {
      cursor = afterWhitespace(bytes, cursor + 1);
      if (cursor !== bytes.byteLength) return projectionFailure('pm2-monitor-malformed');
      if (rpcError) return projectionFailure('pm2-monitor-rpc-error');
      return range === undefined ? projectionFailure('pm2-monitor-malformed') : projectionSuccess(range);
    }
    if (separator !== 0x2c) return projectionFailure('pm2-monitor-malformed');
    cursor = afterWhitespace(bytes, cursor + 1);
  }
  return projectionFailure('pm2-monitor-malformed');
};

const projectWithoutWipe = (
  bytes: Readonly<Uint8Array>,
  allowedNames: readonly string[]
): Pm2MonitorProjectionResult<Pm2MonitorProjection> => {
  if (bytes.byteLength === 0 || bytes.byteLength > PM2_MONITOR_MAX_JSON_BYTES) {
    return projectionFailure('pm2-monitor-oversize');
  }
  if (!validUtf8(bytes) || allowedNames.length > 100 || allowedNames.some(name =>
    !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(name)
  )) return projectionFailure('pm2-monitor-malformed');
  const ranges = envelopeRanges(bytes);
  if (ranges.outcome === 'failure') return ranges;
  const processes: Pm2ProjectedProcess[] = [];
  for (const range of ranges.value) {
    const name = extractProcessName(bytes, range);
    if (name.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
    if (!allowedNames.includes(name.value)) continue;
    const projected = projectProcess(bytes, range);
    if (projected.outcome === 'failure') return projectionFailure('pm2-monitor-malformed');
    processes.push(projected.value);
  }
  return projectionSuccess({ processes });
};

export const projectAndWipePm2MonitorJson = (
  bytes: Uint8Array,
  allowedNames: readonly string[]
): Pm2MonitorProjectionResult<Pm2MonitorProjection> => {
  const projected = brokerTry(
    () => projectWithoutWipe(bytes, allowedNames),
    { code: 'ipc-invalid', message: 'PM2 monitor projection failed.' }
  );
  bytes.fill(0);
  return projected.isOk() ? projected.value : projectionFailure('pm2-monitor-malformed');
};

export const projectAndWipePm2SingleProcessJson = (
  bytes: Uint8Array,
  expectedName: string
): Pm2MonitorProjectionResult<Pm2ProjectedProcess> => {
  const projected = brokerTry((): Pm2MonitorProjectionResult<Pm2ProjectedProcess> => {
    if (bytes.byteLength === 0 || bytes.byteLength > PM2_MONITOR_MAX_JSON_BYTES) {
      return projectionFailure('pm2-monitor-oversize');
    }
    if (!validUtf8(bytes) || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(expectedName)) {
      return projectionFailure('pm2-monitor-malformed');
    }
    const range = envelopeSingleRange(bytes);
    if (range.outcome === 'failure') return range;
    const process = projectProcess(bytes, range.value);
    return process.outcome === 'failure' || process.value.name !== expectedName
      ? projectionFailure('pm2-monitor-malformed')
      : projectionSuccess(process.value);
  }, { code: 'ipc-invalid', message: 'PM2 process projection failed.' });
  bytes.fill(0);
  return projected.isOk() ? projected.value : projectionFailure('pm2-monitor-malformed');
};
