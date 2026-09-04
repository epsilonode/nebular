import { setTimeout as delay } from 'node:timers/promises';

import { Result, ResultAsync } from 'neverthrow';

import {
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  type CredentialReference,
  type SecretLeaseIssue,
  type SecretLeaseResult,
  type SecretLeaseTaskResult
} from './lease.ts';
import type {
  BootstrapSecretSink,
  BootstrapSecretSlot,
  ScopedSecret,
  SecretStoreLeasePort
} from './secret-delivery.ts';

export const BUN_SECRET_SERVICE = 'dev.epsilonode.nebular.broker.v1' as const;
export const SECRET_INPUT_MAX_CODE_UNITS = 16 * 1024;
export const BUN_SECRET_OPERATION_TIMEOUT_MS = 5_000;
export const BUN_SECRET_MAX_OPERATION_TIMEOUT_MS = 60_000;

const secretInputSeal: unique symbol = Symbol('nebular.secret-input/v1');
const secretInputNonceSeal: unique symbol = Symbol('nebular.secret-input-nonce/v1');

type SecretInputState = Readonly<{
  nonce: SecretInputNonce;
  secretText: string;
}>;

type SecretInputNonceState = Readonly<{
  accepting: boolean;
  inputs: readonly object[];
}>;

type ScopedSecretState =
  | Readonly<{ delivery: 'available'; secretText: string; violated: false }>
  | Readonly<{ delivery: 'invoked' | 'succeeded' | 'failed'; violated: boolean }>;

const secretInputValues = new WeakMap<object, SecretInputState>();
const secretInputNonceStates = new WeakMap<object, SecretInputNonceState>();
const scopedSecretStates = new WeakMap<object, ScopedSecretState>();

export type BunSecretsReadPort = Readonly<{
  get: (options: Readonly<{ service: string; name: string }>) => Promise<string | null>;
}>;

export type BunSecretsWritePort = Readonly<{
  set: (options: Readonly<{ service: string; name: string; value: string }>) => Promise<void>;
  delete: (options: Readonly<{ service: string; name: string }>) => Promise<boolean>;
}>;

export type BunSecretStoreOptions = Readonly<{
  /**
   * Bounds how long the broker waits for a Bun.secrets operation. Bun exposes no
   * cancellation primitive, so a timed-out native mutation may still complete
   * later and must be reconciled by durable enrollment recovery.
   */
  operationTimeoutMs?: number;
}>;

export type SecretInput = Readonly<{
  [secretInputSeal]: true;
}>;

export type SecretInputNonce = Readonly<{
  [secretInputNonceSeal]: true;
}>;

export type SecretInputCapturePort = Readonly<{
  capture: (secretText: unknown) => SecretLeaseResult<SecretInput>;
}>;

export type SecretInputScope = Readonly<{
  nonce: SecretInputNonce;
  capture: SecretInputCapturePort;
}>;

export type SecretStoreWriteOutcome = Readonly<{ outcome: 'stored' }>;
export type SecretStoreDeleteOutcome = Readonly<{ outcome: 'deleted' | 'missing' }>;

export type SecretStoreAdminPort = Readonly<{
  store: (
    reference: CredentialReference,
    input: SecretInput,
    nonce: SecretInputNonce
  ) => SecretLeaseTaskResult<SecretStoreWriteOutcome>;
  delete: (reference: CredentialReference) => SecretLeaseTaskResult<SecretStoreDeleteOutcome>;
}>;

const isWellFormedUnicode = (value: string): boolean => Array.from(value).every(character => {
  const firstCodeUnit = character.charCodeAt(0);
  return character.length === 2 || firstCodeUnit < 0xD800 || firstCodeUnit > 0xDFFF;
});

const isValidSecretText = (candidate: unknown): candidate is string =>
  typeof candidate === 'string' &&
  candidate.length > 0 &&
  candidate.length <= SECRET_INPUT_MAX_CODE_UNITS &&
  !candidate.includes('\0') &&
  isWellFormedUnicode(candidate);

const invalidSecretInput = <Value = never>(): SecretLeaseResult<Value> => secretLeaseErr({
  code: 'secret-input-invalid',
  message: 'Credential input is invalid.'
});

const captureSecretInput = (
  nonce: SecretInputNonce,
  secretText: unknown
): SecretLeaseResult<SecretInput> => {
  const nonceState = secretInputNonceStates.get(nonce);
  if (nonceState === undefined || !nonceState.accepting || !isValidSecretText(secretText)) {
    return invalidSecretInput();
  }
  const input: SecretInput = Object.freeze({ [secretInputSeal]: true });
  secretInputValues.set(input, { nonce, secretText });
  secretInputNonceStates.set(nonce, { accepting: true, inputs: [...nonceState.inputs, input] });
  return secretLeaseOk(input);
};

export const openSecretInputScope = (): SecretInputScope => {
  const nonce: SecretInputNonce = Object.freeze({ [secretInputNonceSeal]: true });
  secretInputNonceStates.set(nonce, { accepting: true, inputs: [] });
  return Object.freeze({
    nonce,
    capture: Object.freeze({ capture: (secretText: unknown) => captureSecretInput(nonce, secretText) })
  });
};

export const secretInputBelongsToScope = (
  nonce: SecretInputNonce,
  candidate: unknown
): candidate is SecretInput => {
  if (typeof candidate !== 'object' || candidate === null || !secretInputNonceStates.has(nonce)) return false;
  return secretInputValues.get(candidate)?.nonce === nonce;
};

export const sealSecretInputScope = (scope: SecretInputScope): void => {
  const nonceState = secretInputNonceStates.get(scope.nonce);
  if (nonceState !== undefined) {
    secretInputNonceStates.set(scope.nonce, { accepting: false, inputs: nonceState.inputs });
  }
};

const removeSecretInput = (nonce: SecretInputNonce, input: object): void => {
  secretInputValues.delete(input);
  const nonceState = secretInputNonceStates.get(nonce);
  if (nonceState !== undefined) {
    secretInputNonceStates.set(nonce, {
      accepting: nonceState.accepting,
      inputs: nonceState.inputs.filter(candidate => candidate !== input)
    });
  }
};

export const disposeSecretInputScope = (scope: SecretInputScope): void => {
  const nonceState = secretInputNonceStates.get(scope.nonce);
  nonceState?.inputs.forEach(input => secretInputValues.delete(input));
  secretInputNonceStates.delete(scope.nonce);
};

const takeSecretInput = (
  nonce: SecretInputNonce,
  candidate: unknown
): SecretLeaseResult<string> => {
  if (!secretInputBelongsToScope(nonce, candidate)) return invalidSecretInput();
  const secretText = secretInputValues.get(candidate)?.secretText;
  if (!isValidSecretText(secretText)) return invalidSecretInput();
  removeSecretInput(nonce, candidate);
  return secretLeaseOk(secretText);
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

const credentialReferenceValue = (candidate: unknown): string | null => {
  if (typeof candidate !== 'object' || candidate === null ||
      !('kind' in candidate) || !('value' in candidate)) return null;
  const kind = candidate.kind;
  const value = candidate.value;
  return kind === 'credential-reference' &&
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes('\0') &&
    isWellFormedUnicode(value)
    ? value
    : null;
};

const storeFailureIssue = (): SecretLeaseIssue => ({
  code: 'secret-store-failed',
  message: 'The operating-system credential operation failed.'
});

const storeFailed = <Value>(): SecretLeaseResult<Value> => secretLeaseErr(storeFailureIssue());

export const deriveBunSecretName = (
  reference: CredentialReference
): SecretLeaseTaskResult<string> => {
  const inspected = Result.fromThrowable(
    () => credentialReferenceValue(reference),
    () => [storeFailureIssue()] as const
  )();
  if (inspected.isErr()) return secretLeaseTaskErr(inspected.error[0], ...inspected.error.slice(1));
  if (inspected.value === null) return secretLeaseTaskErr({
    code: 'lease-invalid',
    message: 'The credential reference is invalid.'
  });
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`epsilonode.nebular.credential-reference/v1\0${inspected.value}`)
    )),
    () => [storeFailureIssue()] as const
  ).map(digest => `credential-${bytesToHex(new Uint8Array(digest))}`);
};

const unavailableIssue = (): SecretLeaseIssue => ({
  code: 'secret-unavailable',
  message: 'The requested operating-system credential is unavailable.'
});

const unavailable = <Value = never>(): SecretLeaseResult<Value> => secretLeaseErr(unavailableIssue());

const bootstrapRejected = <Value = never>(): SecretLeaseResult<Value> => secretLeaseErr({
  code: 'bootstrap-rejected',
  message: 'The scoped secret operation was rejected.'
});

const bootstrapRejectedIssue = (): SecretLeaseIssue => ({
  code: 'bootstrap-rejected',
  message: 'The scoped secret operation was rejected.'
});

const invokeSecretSink = (
  sink: BootstrapSecretSink,
  slot: BootstrapSecretSlot,
  secretText: string
): SecretLeaseResult<void> => Result.fromThrowable(
  () => sink.install(slot, secretText),
  () => [bootstrapRejectedIssue()] as const
)().andThen(result => result);

const deliverScopedSecret = (
  handle: ScopedSecret,
  sink: BootstrapSecretSink,
  slot: BootstrapSecretSlot
): SecretLeaseResult<void> => {
  const state = scopedSecretStates.get(handle);
  if (state === undefined) return unavailable();
  if (state.delivery !== 'available') {
    scopedSecretStates.set(handle, { delivery: state.delivery, violated: true });
    return bootstrapRejected();
  }
  scopedSecretStates.set(handle, { delivery: 'invoked', violated: false });
  const delivered = invokeSecretSink(sink, slot, state.secretText);
  scopedSecretStates.set(handle, {
    delivery: delivered.isOk() ? 'succeeded' : 'failed',
    violated: scopedSecretStates.get(handle)?.violated ?? false
  });
  return delivered;
};

const openScopedSecret = (secretText: string): ScopedSecret => {
  const handle: ScopedSecret = Object.freeze({
    deliverTo: (sink: BootstrapSecretSink, slot: BootstrapSecretSlot) =>
      deliverScopedSecret(handle, sink, slot)
  });
  scopedSecretStates.set(handle, { delivery: 'available', secretText, violated: false });
  return handle;
};

const invokeScopedSecretUse = (
  secretText: string,
  use: (secret: ScopedSecret) => SecretLeaseResult<void>
): SecretLeaseResult<void> => {
  const handle = openScopedSecret(secretText);
  const invoked = Result.fromThrowable(
    () => use(handle),
    () => [bootstrapRejectedIssue()] as const
  )();
  const state = scopedSecretStates.get(handle);
  scopedSecretStates.delete(handle);
  if (invoked.isErr()) return secretLeaseErr(invoked.error[0], ...invoked.error.slice(1));
  const callbackResult = invoked.value;
  if (callbackResult.isErr()) return callbackResult;
  return state?.delivery === 'succeeded' && !state.violated
    ? callbackResult
    : bootstrapRejected();
};

type BoundedEffectOutcome<Value> =
  | Readonly<{ outcome: 'completed'; value: Value }>
  | Readonly<{ outcome: 'failed' | 'timed-out' }>;

const boundedEffect = <Value>(
  timeoutMs: number,
  effect: () => Promise<Value>
): Promise<BoundedEffectOutcome<Value>> => {
  const cancellation = new AbortController();
  const operation = Promise.resolve().then(effect).then(
    value => ({ outcome: 'completed', value } as const),
    () => ({ outcome: 'failed' } as const)
  );
  const deadline = delay(
    timeoutMs,
    { outcome: 'timed-out' } as const,
    { signal: cancellation.signal }
  ).then(
    outcome => outcome,
    () => ({ outcome: 'failed' } as const)
  );
  return Promise.race([operation, deadline]).then(
    outcome => {
      cancellation.abort();
      return outcome;
    },
    () => {
      cancellation.abort();
      return { outcome: 'failed' };
    }
  );
};

const operationTimeout = (options: BunSecretStoreOptions): number | null => {
  const timeoutMs = options.operationTimeoutMs ?? BUN_SECRET_OPERATION_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BUN_SECRET_MAX_OPERATION_TIMEOUT_MS
    ? timeoutMs
    : null;
};

const boundedSecretTask = <Value>(
  timeoutMs: number,
  effect: () => Promise<Value>,
  failure: () => SecretLeaseResult<Value>
): SecretLeaseTaskResult<Value> => ResultAsync.fromSafePromise(
  boundedEffect(timeoutMs, effect)
).andThen(outcome => outcome.outcome === 'completed'
  ? secretLeaseOk(outcome.value)
  : failure());

const readAndUseSecret = (
  runtime: BunSecretsReadPort,
  timeoutMs: number,
  name: string,
  use: (secret: ScopedSecret) => SecretLeaseResult<void>
): SecretLeaseTaskResult<void> => boundedSecretTask(
  timeoutMs,
  () => runtime.get({ service: BUN_SECRET_SERVICE, name }),
  unavailable
).andThen(value => isValidSecretText(value)
  ? invokeScopedSecretUse(value, use)
  : unavailable());

export const createBunSecretStoreLeasePort = (
  runtime: BunSecretsReadPort = Bun.secrets,
  options: BunSecretStoreOptions = {}
): SecretStoreLeasePort => ({
  withSecret: (reference, use): SecretLeaseTaskResult<void> => {
    const timeoutMs = operationTimeout(options);
    if (timeoutMs === null) return secretLeaseTaskErr(unavailableIssue());
    return deriveBunSecretName(reference)
      .andThen(name => readAndUseSecret(runtime, timeoutMs, name, use));
  }
});

export const createBunSecretStoreAdminPort = (
  runtime: BunSecretsWritePort = Bun.secrets,
  options: BunSecretStoreOptions = {}
): SecretStoreAdminPort => ({
  store: (reference, input, nonce) => {
    const secretText = takeSecretInput(nonce, input);
    if (secretText.isErr()) return secretLeaseTaskErr(secretText.error[0], ...secretText.error.slice(1));
    const timeoutMs = operationTimeout(options);
    if (timeoutMs === null) return secretLeaseTaskErr(storeFailureIssue());
    return deriveBunSecretName(reference).andThen(name => boundedSecretTask(
      timeoutMs,
      () => runtime.set({ service: BUN_SECRET_SERVICE, name, value: secretText.value }),
      storeFailed
    )).map(() => ({ outcome: 'stored' }));
  },
  delete: reference => {
    const timeoutMs = operationTimeout(options);
    if (timeoutMs === null) return secretLeaseTaskErr(storeFailureIssue());
    return deriveBunSecretName(reference).andThen(name => boundedSecretTask(
      timeoutMs,
      () => runtime.delete({ service: BUN_SECRET_SERVICE, name }),
      storeFailed
    )).map(deleted => ({ outcome: deleted ? 'deleted' : 'missing' }));
  }
});
