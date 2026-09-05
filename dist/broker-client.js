// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __require = import.meta.require;

// node_modules/neverthrow/dist/index.es.js
var defaultErrorConfig = {
  withStackTrace: false
};
var createNeverThrowError = (message, result, config = defaultErrorConfig) => {
  const data = result.isOk() ? { type: "Ok", value: result.value } : { type: "Err", value: result.error };
  const maybeStack = config.withStackTrace ? new Error().stack : undefined;
  return {
    data,
    message,
    stack: maybeStack
  };
};
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m)
    return m.call(o);
  if (o && typeof o.length === "number")
    return {
      next: function() {
        if (o && i >= o.length)
          o = undefined;
        return { value: o && o[i++], done: !o };
      }
    };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator)
    throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f)
        i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length)
      resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator)
    throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
}
class ResultAsync {
  constructor(res) {
    this._promise = res;
  }
  static fromSafePromise(promise) {
    const newPromise = promise.then((value) => new Ok(value));
    return new ResultAsync(newPromise);
  }
  static fromPromise(promise, errorFn) {
    const newPromise = promise.then((value) => new Ok(value)).catch((e) => new Err(errorFn(e)));
    return new ResultAsync(newPromise);
  }
  static fromThrowable(fn, errorFn) {
    return (...args) => {
      return new ResultAsync((() => __awaiter(this, undefined, undefined, function* () {
        try {
          return new Ok(yield fn(...args));
        } catch (error) {
          return new Err(errorFn ? errorFn(error) : error);
        }
      }))());
    };
  }
  static combine(asyncResultList) {
    return combineResultAsyncList(asyncResultList);
  }
  static combineWithAllErrors(asyncResultList) {
    return combineResultAsyncListWithAllErrors(asyncResultList);
  }
  map(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      return new Ok(yield f(res.value));
    })));
  }
  andThrough(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      const newRes = yield f(res.value);
      if (newRes.isErr()) {
        return new Err(newRes.error);
      }
      return new Ok(res.value);
    })));
  }
  andTee(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      try {
        yield f(res.value);
      } catch (e) {}
      return new Ok(res.value);
    })));
  }
  orTee(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isOk()) {
        return new Ok(res.value);
      }
      try {
        yield f(res.error);
      } catch (e) {}
      return new Err(res.error);
    })));
  }
  mapErr(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isOk()) {
        return new Ok(res.value);
      }
      return new Err(yield f(res.error));
    })));
  }
  andThen(f) {
    return new ResultAsync(this._promise.then((res) => {
      if (res.isErr()) {
        return new Err(res.error);
      }
      const newValue = f(res.value);
      return newValue instanceof ResultAsync ? newValue._promise : newValue;
    }));
  }
  orElse(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, undefined, undefined, function* () {
      if (res.isErr()) {
        return f(res.error);
      }
      return new Ok(res.value);
    })));
  }
  match(ok, _err) {
    return this._promise.then((res) => res.match(ok, _err));
  }
  unwrapOr(t) {
    return this._promise.then((res) => res.unwrapOr(t));
  }
  safeUnwrap() {
    return __asyncGenerator(this, arguments, function* safeUnwrap_1() {
      return yield __await(yield __await(yield* __asyncDelegator(__asyncValues(yield __await(this._promise.then((res) => res.safeUnwrap()))))));
    });
  }
  then(successCallback, failureCallback) {
    return this._promise.then(successCallback, failureCallback);
  }
  [Symbol.asyncIterator]() {
    return __asyncGenerator(this, arguments, function* _a() {
      const result = yield __await(this._promise);
      if (result.isErr()) {
        yield yield __await(errAsync(result.error));
      }
      return yield __await(result.value);
    });
  }
}
function okAsync(value) {
  return new ResultAsync(Promise.resolve(new Ok(value)));
}
function errAsync(err) {
  return new ResultAsync(Promise.resolve(new Err(err)));
}
var fromPromise = ResultAsync.fromPromise;
var fromSafePromise = ResultAsync.fromSafePromise;
var fromAsyncThrowable = ResultAsync.fromThrowable;
var combineResultList = (resultList) => {
  let acc = ok([]);
  for (const result of resultList) {
    if (result.isErr()) {
      acc = err(result.error);
      break;
    } else {
      acc.map((list) => list.push(result.value));
    }
  }
  return acc;
};
var combineResultAsyncList = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList);
var combineResultListWithAllErrors = (resultList) => {
  let acc = ok([]);
  for (const result of resultList) {
    if (result.isErr() && acc.isErr()) {
      acc.error.push(result.error);
    } else if (result.isErr() && acc.isOk()) {
      acc = err([result.error]);
    } else if (result.isOk() && acc.isOk()) {
      acc.value.push(result.value);
    }
  }
  return acc;
};
var combineResultAsyncListWithAllErrors = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultListWithAllErrors);
var Result;
(function(Result2) {
  function fromThrowable(fn, errorFn) {
    return (...args) => {
      try {
        const result = fn(...args);
        return ok(result);
      } catch (e) {
        return err(errorFn ? errorFn(e) : e);
      }
    };
  }
  Result2.fromThrowable = fromThrowable;
  function combine(resultList) {
    return combineResultList(resultList);
  }
  Result2.combine = combine;
  function combineWithAllErrors(resultList) {
    return combineResultListWithAllErrors(resultList);
  }
  Result2.combineWithAllErrors = combineWithAllErrors;
})(Result || (Result = {}));
function ok(value) {
  return new Ok(value);
}
function err(err2) {
  return new Err(err2);
}
class Ok {
  constructor(value) {
    this.value = value;
  }
  isOk() {
    return true;
  }
  isErr() {
    return !this.isOk();
  }
  map(f) {
    return ok(f(this.value));
  }
  mapErr(_f) {
    return ok(this.value);
  }
  andThen(f) {
    return f(this.value);
  }
  andThrough(f) {
    return f(this.value).map((_value) => this.value);
  }
  andTee(f) {
    try {
      f(this.value);
    } catch (e) {}
    return ok(this.value);
  }
  orTee(_f) {
    return ok(this.value);
  }
  orElse(_f) {
    return ok(this.value);
  }
  asyncAndThen(f) {
    return f(this.value);
  }
  asyncAndThrough(f) {
    return f(this.value).map(() => this.value);
  }
  asyncMap(f) {
    return ResultAsync.fromSafePromise(f(this.value));
  }
  unwrapOr(_v) {
    return this.value;
  }
  match(ok2, _err) {
    return ok2(this.value);
  }
  safeUnwrap() {
    const value = this.value;
    return function* () {
      return value;
    }();
  }
  _unsafeUnwrap(_) {
    return this.value;
  }
  _unsafeUnwrapErr(config) {
    throw createNeverThrowError("Called `_unsafeUnwrapErr` on an Ok", this, config);
  }
  *[Symbol.iterator]() {
    return this.value;
  }
}

class Err {
  constructor(error) {
    this.error = error;
  }
  isOk() {
    return false;
  }
  isErr() {
    return !this.isOk();
  }
  map(_f) {
    return err(this.error);
  }
  mapErr(f) {
    return err(f(this.error));
  }
  andThrough(_f) {
    return err(this.error);
  }
  andTee(_f) {
    return err(this.error);
  }
  orTee(f) {
    try {
      f(this.error);
    } catch (e) {}
    return err(this.error);
  }
  andThen(_f) {
    return err(this.error);
  }
  orElse(f) {
    return f(this.error);
  }
  asyncAndThen(_f) {
    return errAsync(this.error);
  }
  asyncAndThrough(_f) {
    return errAsync(this.error);
  }
  asyncMap(_f) {
    return errAsync(this.error);
  }
  unwrapOr(v) {
    return v;
  }
  match(_ok, err2) {
    return err2(this.error);
  }
  safeUnwrap() {
    const error = this.error;
    return function* () {
      yield err(error);
      throw new Error("Do not use this generator out of `safeTry`");
    }();
  }
  _unsafeUnwrap(config) {
    throw createNeverThrowError("Called `_unsafeUnwrap` on an Err", this, config);
  }
  _unsafeUnwrapErr(_) {
    return this.error;
  }
  *[Symbol.iterator]() {
    const self = this;
    yield self;
    return self;
  }
}
var fromThrowable = Result.fromThrowable;

// src/broker-client/result.ts
var clientOk = (value) => ok(value);
var clientErr = (issue, ...rest) => err([issue, ...rest]);
var clientTaskOk = (value) => okAsync(value);
var clientTaskErr = (issue, ...rest) => errAsync([issue, ...rest]);
var clientTry = (operation, issue) => Result.fromThrowable(operation, () => [issue])();
var clientTryAsync = (operation, issue) => ResultAsync.fromPromise(operation, () => [issue]);

// src/broker-client/bootstrap/protocol.ts
var BROKER_BOOTSTRAP_PROTOCOL_VERSION = "epsilonode.bootstrap/v1";
var BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES = 128 * 1024;
var BROKER_BOOTSTRAP_MAX_SLOTS = 32;
var BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS = 16 * 1024;
var isUnknownArray = (value) => Array.isArray(value);
var isRecord = (value) => typeof value === "object" && value !== null && !isUnknownArray(value);
var hasExactKeys = (record, expected) => {
  const actual = Object.keys(record);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(record, key));
};
var validIdentifier = (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
var validEnvironmentName = (value) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value);
var parseReference = (kind, value, maximumLength, validate = () => true) => typeof value === "string" && value.length > 0 && value.length <= maximumLength && !value.includes("\x00") && validate(value) ? clientOk({ kind, value }) : clientErr({ code: "invalid-input", message: "Bootstrap reference is invalid." });
var parseExchangeId = (value) => parseReference("bootstrap-exchange-id", value, 128, validIdentifier);
var parseRepository = (value) => parseReference("bootstrap-repository", value, 4096);
var parseRecipeRevision = (value) => parseReference("bootstrap-recipe-revision", value, 256);
var parseGrantId = (value) => parseReference("bootstrap-grant-id", value, 128, validIdentifier);
var parseReceiverId = (value) => parseReference("bootstrap-receiver-id", value, 128, validIdentifier);
var parseProcessAttemptId = (value) => parseReference("bootstrap-process-attempt-id", value, 128, validIdentifier);
var parseSlotId = (value) => parseReference("bootstrap-slot-id", value, 128, validIdentifier);
var parseLeaseId = (value) => parseReference("bootstrap-lease-id", value, 128, validIdentifier);
var parseEnvironmentName = (value) => typeof value === "string" && validEnvironmentName(value) && !value.includes("\x00") ? clientOk(value) : clientErr({ code: "invalid-input", message: "Bootstrap environment name is invalid." });
var parseGeneration = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? clientOk(value) : clientErr({ code: "invalid-input", message: "Bootstrap grant generation is invalid." });
var parseExpiresAtMs = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? clientOk(value) : clientErr({ code: "invalid-input", message: "Bootstrap lease expiry is invalid." });
var traverse = (values, decode) => values.reduce((decoded, value, index) => decoded.andThen((items) => decode(value, index).map((item) => append(items, item))), clientOk([]));
var append = (values, value) => [...values, value];
var hasUniqueSlotDeclarations = (slots) => {
  const slotIds = slots.map((slot) => slot.slotId.value);
  const environmentNames = slots.map((slot) => slot.environmentName.toUpperCase());
  return slotIds.every((value, index) => slotIds.indexOf(value) === index) && environmentNames.every((value, index) => environmentNames.indexOf(value) === index);
};
var decodeSlotDeclaration = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ["slotId", "environmentName"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap slot declaration is invalid." });
  }
  return parseSlotId(value["slotId"]).andThen((slotId) => parseEnvironmentName(value["environmentName"]).map((environmentName) => ({ slotId, environmentName })));
};
var decodeSlotDeclarations = (value) => {
  if (!isUnknownArray(value) || value.length > BROKER_BOOTSTRAP_MAX_SLOTS) {
    return clientErr({ code: "invalid-input", message: "Bootstrap slot declarations are invalid." });
  }
  return traverse(value, decodeSlotDeclaration).andThen((slots) => hasUniqueSlotDeclarations(slots) ? clientOk(slots) : clientErr({ code: "invalid-input", message: "Bootstrap slot declarations collide." }));
};
var createOpaqueSecret = (value) => ({
  withValue: (use) => use(value)
});
var decodeDeliveredSlot = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ["slotId", "environmentName", "secret"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap secret slot is invalid." });
  }
  const secret = value["secret"];
  if (typeof secret !== "string" || secret.length === 0 || secret.length > BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS || secret.includes("\x00")) {
    return clientErr({ code: "invalid-input", message: "Bootstrap secret slot is invalid." });
  }
  return decodeSlotDeclaration({
    slotId: value["slotId"],
    environmentName: value["environmentName"]
  }).map((slot) => ({ ...slot, secret: createOpaqueSecret(secret) }));
};
var decodeSecretBundle = (value) => {
  if (!isUnknownArray(value) || value.length > BROKER_BOOTSTRAP_MAX_SLOTS) {
    return clientErr({ code: "invalid-input", message: "Bootstrap secret bundle is invalid." });
  }
  return traverse(value, decodeDeliveredSlot).andThen((slots) => hasUniqueSlotDeclarations(slots) ? clientOk({ slots }) : clientErr({ code: "invalid-input", message: "Bootstrap secret slots collide." }));
};
var measureConservativeJsonBytes = (value, depth, ancestors) => {
  if (depth > 8)
    return;
  if (value === null)
    return 4;
  if (typeof value === "boolean")
    return value ? 4 : 5;
  if (typeof value === "number")
    return Number.isFinite(value) ? 32 : undefined;
  if (typeof value === "string")
    return 2 + value.length * 6;
  if (isUnknownArray(value)) {
    if (value.length > 64 || ancestors.includes(value))
      return;
    return value.reduce((total, item) => {
      if (total === undefined)
        return;
      const measured = measureConservativeJsonBytes(item, depth + 1, [...ancestors, value]);
      return measured === undefined ? undefined : total + measured + 1;
    }, 2);
  }
  if (!isRecord(value) || ancestors.includes(value))
    return;
  const keys = Object.keys(value);
  if (keys.length > 64)
    return;
  return keys.reduce((total, key) => {
    if (total === undefined)
      return;
    const item = value[key];
    const measured = measureConservativeJsonBytes(item, depth + 1, [...ancestors, value]);
    return measured === undefined ? undefined : total + 3 + key.length * 6 + measured;
  }, 2);
};
var validateWireBudget = (input) => {
  const measured = measureConservativeJsonBytes(input, 0, []);
  return measured !== undefined && measured <= BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES ? clientOk(undefined) : clientErr({ code: "message-too-large", message: "Bootstrap message exceeds its structural or byte budget." });
};
var decodeEnvelope = (value, expectedKind) => {
  if (value["protocolVersion"] !== BROKER_BOOTSTRAP_PROTOCOL_VERSION) {
    return clientErr({ code: "protocol-mismatch", message: "Bootstrap protocol version is unsupported." });
  }
  if (value["messageKind"] !== expectedKind) {
    return clientErr({ code: "invalid-input", message: "Bootstrap message kind is invalid." });
  }
  return parseExchangeId(value["exchangeId"]).map((exchangeId) => ({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    exchangeId
  }));
};
var decodeHello = (value) => {
  const payload = value["payload"];
  const buildId = isRecord(payload) ? payload["buildId"] : undefined;
  const capabilities = isRecord(payload) ? payload["capabilities"] : undefined;
  if (!hasExactKeys(value, ["protocolVersion", "messageKind", "exchangeId", "payload"]) || !isRecord(payload) || !hasExactKeys(payload, ["buildId", "capabilities"]) || typeof buildId !== "string" || buildId.length === 0 || buildId.length > 128 || !isUnknownArray(capabilities) || capabilities.length !== 2 || !capabilities.includes("atomic-environment-v1") || !capabilities.includes("secret-bundle-v1")) {
    return clientErr({ code: "invalid-input", message: "Bootstrap hello message is invalid." });
  }
  return decodeEnvelope(value, "bootstrap-hello").map((envelope) => ({
    ...envelope,
    messageKind: "bootstrap-hello",
    payload: {
      buildId,
      capabilities: ["atomic-environment-v1", "secret-bundle-v1"]
    }
  }));
};
var decodeAuthority = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ["repository", "recipeRevision", "grantId", "grantGeneration"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap authority reference is invalid." });
  }
  return parseRepository(value["repository"]).andThen((repository) => parseRecipeRevision(value["recipeRevision"]).andThen((recipeRevision) => parseGrantId(value["grantId"]).andThen((grantId) => parseGeneration(value["grantGeneration"]).map((grantGeneration) => ({
    repository,
    recipeRevision,
    grantId,
    grantGeneration
  })))));
};
var decodeAttempt = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ["receiverId", "processAttemptId"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap attempt reference is invalid." });
  }
  return parseReceiverId(value["receiverId"]).andThen((receiverId) => parseProcessAttemptId(value["processAttemptId"]).map((processAttemptId) => ({ receiverId, processAttemptId })));
};
var requestMessage = (envelope, authority, attempt, slots) => ({
  ...envelope,
  messageKind: "bootstrap-request",
  payload: { authority, attempt, slots }
});
var decodeRequest = (value) => {
  const payload = value["payload"];
  if (!hasExactKeys(value, ["protocolVersion", "messageKind", "exchangeId", "payload"]) || !isRecord(payload) || !hasExactKeys(payload, ["authority", "attempt", "slots"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap request message is invalid." });
  }
  return decodeEnvelope(value, "bootstrap-request").andThen((envelope) => decodeAuthority(payload["authority"]).andThen((authority) => decodeAttempt(payload["attempt"]).andThen((attempt) => decodeSlotDeclarations(payload["slots"]).map((slots) => requestMessage(envelope, authority, attempt, slots)))));
};
var deliveryMessage = (envelope, leaseId, processAttemptId, expiresAtMs, secrets) => ({
  ...envelope,
  messageKind: "bootstrap-delivery",
  payload: { leaseId, processAttemptId, expiresAtMs, secrets }
});
var decodeDelivery = (value) => {
  const payload = value["payload"];
  if (!hasExactKeys(value, ["protocolVersion", "messageKind", "exchangeId", "payload"]) || !isRecord(payload) || !hasExactKeys(payload, ["leaseId", "processAttemptId", "expiresAtMs", "slots"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap delivery message is invalid." });
  }
  return decodeEnvelope(value, "bootstrap-delivery").andThen((envelope) => parseLeaseId(payload["leaseId"]).andThen((leaseId) => parseProcessAttemptId(payload["processAttemptId"]).andThen((processAttemptId) => parseExpiresAtMs(payload["expiresAtMs"]).andThen((expiresAtMs) => decodeSecretBundle(payload["slots"]).map((secrets) => deliveryMessage(envelope, leaseId, processAttemptId, expiresAtMs, secrets))))));
};
var rejectionCodes = [
  "attempt-mismatch",
  "attempt-not-ready",
  "authority-denied",
  "grant-expired",
  "grant-revoked",
  "protocol-invalid",
  "recipe-drift",
  "secret-unavailable",
  "slot-not-authorized"
];
var isRejectionCode = (value) => typeof value === "string" && rejectionCodes.some((code) => code === value);
var rejectedMessage = (envelope, code) => ({
  ...envelope,
  messageKind: "bootstrap-rejected",
  payload: { code }
});
var decodeRejected = (value) => {
  const payload = value["payload"];
  if (!hasExactKeys(value, ["protocolVersion", "messageKind", "exchangeId", "payload"]) || !isRecord(payload) || !hasExactKeys(payload, ["code"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap rejection message is invalid." });
  }
  const code = payload["code"];
  return isRejectionCode(code) ? decodeEnvelope(value, "bootstrap-rejected").map((envelope) => rejectedMessage(envelope, code)) : clientErr({ code: "invalid-input", message: "Bootstrap rejection code is invalid." });
};
var acknowledgementMessage = (envelope, leaseId, processAttemptId, installedSlotIds) => ({
  ...envelope,
  messageKind: "bootstrap-acknowledgement",
  payload: {
    leaseId,
    processAttemptId,
    installedSlotIds,
    installedSlotCount: installedSlotIds.length
  }
});
var decodeAcknowledgement = (value) => {
  const payload = value["payload"];
  if (!hasExactKeys(value, ["protocolVersion", "messageKind", "exchangeId", "payload"]) || !isRecord(payload) || !hasExactKeys(payload, ["leaseId", "processAttemptId", "installedSlotIds", "installedSlotCount"])) {
    return clientErr({ code: "invalid-input", message: "Bootstrap acknowledgement message is invalid." });
  }
  const rawInstalledSlotIds = payload["installedSlotIds"];
  const installedSlotCount = payload["installedSlotCount"];
  if (!isUnknownArray(rawInstalledSlotIds) || rawInstalledSlotIds.length > BROKER_BOOTSTRAP_MAX_SLOTS || typeof installedSlotCount !== "number" || installedSlotCount !== rawInstalledSlotIds.length) {
    return clientErr({ code: "invalid-input", message: "Bootstrap acknowledgement slots are invalid." });
  }
  return decodeEnvelope(value, "bootstrap-acknowledgement").andThen((envelope) => parseLeaseId(payload["leaseId"]).andThen((leaseId) => parseProcessAttemptId(payload["processAttemptId"]).andThen((processAttemptId) => traverse(rawInstalledSlotIds, parseSlotId).andThen((installedSlotIds) => {
    const unique = installedSlotIds.every((slot, index) => installedSlotIds.findIndex((candidate) => candidate.value === slot.value) === index);
    return unique ? clientOk(acknowledgementMessage(envelope, leaseId, processAttemptId, installedSlotIds)) : clientErr({ code: "invalid-input", message: "Bootstrap acknowledgement slots collide." });
  }))));
};
var decodeMeasuredMessage = (input) => {
  if (!isRecord(input) || typeof input["messageKind"] !== "string") {
    return clientErr({ code: "invalid-input", message: "Bootstrap message is invalid." });
  }
  switch (input["messageKind"]) {
    case "bootstrap-hello":
      return decodeHello(input);
    case "bootstrap-request":
      return decodeRequest(input);
    case "bootstrap-delivery":
      return decodeDelivery(input);
    case "bootstrap-rejected":
      return decodeRejected(input);
    case "bootstrap-acknowledgement":
      return decodeAcknowledgement(input);
    default:
      return clientErr({ code: "invalid-input", message: "Bootstrap message kind is unsupported." });
  }
};
var decodeBootstrapProtocolMessage = (input) => clientTry(() => validateWireBudget(input).andThen(() => decodeMeasuredMessage(input)), { code: "invalid-input", message: "Bootstrap message could not be inspected safely." }).andThen((result) => result);
var decodeBootstrapProtocolJson = (json) => new TextEncoder().encode(json).byteLength > BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES ? clientErr({ code: "message-too-large", message: "Bootstrap message exceeds its byte budget." }) : clientTry(() => JSON.parse(json), { code: "invalid-input", message: "Bootstrap message is not valid JSON." }).andThen(decodeBootstrapProtocolMessage);
var createBootstrapRequest = (input) => decodeBootstrapProtocolMessage({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: "bootstrap-request",
  exchangeId: input.exchangeId,
  payload: {
    authority: {
      repository: input.repository,
      recipeRevision: input.recipeRevision,
      grantId: input.grantId,
      grantGeneration: input.grantGeneration
    },
    attempt: {
      receiverId: input.receiverId,
      processAttemptId: input.processAttemptId
    },
    slots: input.slots
  }
}).andThen((message) => message.messageKind === "bootstrap-request" ? clientOk(message) : clientErr({ code: "invalid-input", message: "Bootstrap request construction produced an invalid kind." }));
var createBootstrapAcknowledgement = (input) => decodeBootstrapProtocolMessage({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: "bootstrap-acknowledgement",
  exchangeId: input.exchangeId.value,
  payload: {
    leaseId: input.leaseId.value,
    processAttemptId: input.processAttemptId.value,
    installedSlotIds: input.installedSlotIds.map((slot) => slot.value),
    installedSlotCount: input.installedSlotIds.length
  }
}).andThen((message) => message.messageKind === "bootstrap-acknowledgement" ? clientOk(message) : clientErr({ code: "invalid-input", message: "Bootstrap acknowledgement construction produced an invalid kind." }));
var isBootstrapResponseMessage = (message) => message.messageKind === "bootstrap-delivery" || message.messageKind === "bootstrap-rejected";

// src/broker-client/bootstrap/cooperative.ts
var BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES = [
  "BUN_OPTIONS",
  "CLASSPATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "JAVA_TOOL_OPTIONS",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PATH",
  "PATHEXT",
  "PERL5LIB",
  "PERL5OPT",
  "PYTHONHOME",
  "PYTHONPATH",
  "RUBYOPT",
  "_JAVA_OPTIONS"
];
var BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS = 32;
var BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS = 1000;
var foldEnvironmentName = (value) => value.toUpperCase();
var isReservedEnvironmentName = (value) => foldEnvironmentName(value).startsWith("NEBULAR_") || BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES.some((name) => name === foldEnvironmentName(value));
var isValidEnvironmentName = (value) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(value) && !value.includes("\x00") && !isReservedEnvironmentName(value);
var hasUniqueValues = (values) => values.every((value, index) => values.indexOf(value) === index);
var hasValidSlotSet = (slots) => slots.length <= BROKER_BOOTSTRAP_MAX_SLOTS && slots.every((slot) => slot.slotId.value.length > 0 && isValidEnvironmentName(slot.environmentName)) && hasUniqueValues(slots.map((slot) => slot.slotId.value)) && hasUniqueValues(slots.map((slot) => foldEnvironmentName(slot.environmentName)));
var slotsMatchExactly = (declared, delivered) => declared.length === delivered.length && declared.every((declaration) => delivered.some((slot) => slot.slotId.value === declaration.slotId.value && slot.environmentName === declaration.environmentName));
var secretsAreValid = (slots) => slots.every((slot) => slot.secret.withValue((secretText) => secretText.length > 0 && secretText.length <= BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS && !secretText.includes("\x00")));
var collidesWithInheritedEnvironment = (declared, inheritedEnvironmentNames) => {
  const foldedInherited = inheritedEnvironmentNames.map(foldEnvironmentName);
  return inheritedEnvironmentNames.some((name) => name.length === 0 || name.includes("\x00")) || declared.some((slot) => foldedInherited.includes(foldEnvironmentName(slot.environmentName)));
};
var sameExchange = (request, response) => request.exchangeId.value === response.exchangeId.value;
var sameAttempt = (request, delivery) => request.payload.attempt.processAttemptId.value === delivery.payload.processAttemptId.value;
var redactedSlots = (slots) => slots.map((slot) => ({ slotId: slot.slotId, environmentName: slot.environmentName }));
var environmentPatch = (delivery, slots) => ({
  exchangeId: delivery.exchangeId,
  leaseId: delivery.payload.leaseId,
  processAttemptId: delivery.payload.processAttemptId,
  expiresAtMs: delivery.payload.expiresAtMs,
  slots: redactedSlots(slots),
  entries: slots
});
var planBootstrapEnvironmentPatch = (request, delivery, inheritedEnvironmentNames, nowMs) => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return clientErr({ code: "invalid-input", message: "Bootstrap clock value is invalid." });
  }
  if (!sameExchange(request, delivery)) {
    return clientErr({ code: "protocol-mismatch", message: "Bootstrap response correlation is invalid." });
  }
  if (!sameAttempt(request, delivery)) {
    return clientErr({ code: "bootstrap-rejected", message: "Bootstrap process attempt does not match." });
  }
  if (delivery.payload.expiresAtMs <= nowMs) {
    return clientErr({ code: "bootstrap-expired", message: "Bootstrap secret lease has expired." });
  }
  if (!hasValidSlotSet(request.payload.slots) || collidesWithInheritedEnvironment(request.payload.slots, inheritedEnvironmentNames)) {
    return clientErr({
      code: "environment-invalid",
      message: "Bootstrap environment names are invalid, reserved, or collide under Windows case folding."
    });
  }
  const slots = delivery.payload.secrets.slots;
  return slotsMatchExactly(request.payload.slots, slots) && hasValidSlotSet(slots) && secretsAreValid(slots) ? clientOk(environmentPatch(delivery, slots)) : clientErr({
    code: "environment-invalid",
    message: "Bootstrap delivery is incomplete, undeclared, invalid, or non-atomic."
  });
};
var sameSlotDeclarations = (left, right) => left.length === right.length && left.every((slot) => right.some((candidate) => candidate.slotId.value === slot.slotId.value && candidate.environmentName === slot.environmentName));
var validateInstallReceipt = (patch, receipt) => receipt.atomic && sameSlotDeclarations(patch.slots, receipt.installedSlots) ? clientOk(receipt) : clientErr({
  code: "environment-invalid",
  message: "Atomic environment installer returned inconsistent redacted receipt facts."
});
var failAfterEnvironmentRollback = (receipt, issues) => receipt.cleanup.rollback().then((rolledBack) => rolledBack.isOk() ? clientErr(...issues) : clientErr({
  code: "environment-invalid",
  message: "Bootstrap failed after installation and environment rollback did not complete."
}), () => clientErr({
  code: "environment-invalid",
  message: "Bootstrap failed after installation and environment rollback did not complete."
}));
var preparedEnvironment = (request, patch) => ({
  state: "prepared",
  exchangeId: patch.exchangeId,
  grantId: request.payload.authority.grantId,
  leaseId: patch.leaseId,
  processAttemptId: patch.processAttemptId,
  installedSlots: patch.slots,
  expiresAtMs: patch.expiresAtMs,
  warnings: [{
    code: "javascript-zeroization-not-guaranteed",
    message: "JavaScript minimizes secret lifetime but cannot guarantee physical memory zeroization."
  }]
});
var rejectionMessage = (rejection) => {
  switch (rejection.payload.code) {
    case "attempt-mismatch":
      return "The broker rejected the managed process attempt.";
    case "attempt-not-ready":
      return "The managed process is waiting for its current receiver binding.";
    case "authority-denied":
      return "The broker denied bootstrap authority.";
    case "grant-expired":
      return "The repository-scoped grant has expired.";
    case "grant-revoked":
      return "The repository-scoped grant is revoked.";
    case "protocol-invalid":
      return "The broker rejected the bootstrap protocol exchange.";
    case "recipe-drift":
      return "The validated recipe revision has changed.";
    case "secret-unavailable":
      return "A requested credential is unavailable.";
    case "slot-not-authorized":
      return "A requested credential slot is not authorized.";
  }
};
var rejectionIssue = (rejection) => ({
  code: rejection.payload.code === "attempt-not-ready" ? "bootstrap-not-ready" : "bootstrap-rejected",
  message: rejectionMessage(rejection)
});
var prepareDelivery = (input, response, ports) => {
  if (!sameExchange(input.request, response)) {
    return Promise.resolve(clientErr({
      code: "protocol-mismatch",
      message: "Bootstrap response correlation is invalid."
    }));
  }
  if (response.messageKind === "bootstrap-rejected") {
    return Promise.resolve(clientErr(rejectionIssue(response)));
  }
  const planned = planBootstrapEnvironmentPatch(input.request, response, input.inheritedEnvironmentNames, ports.clock.nowMs());
  if (planned.isErr())
    return Promise.resolve(clientErr(planned.error[0], ...planned.error.slice(1)));
  const patch = planned.value;
  return ports.environment.installAtomically(patch).then((installed) => {
    if (installed.isErr())
      return clientErr(installed.error[0], ...installed.error.slice(1));
    const receipt = installed.value;
    const validated = validateInstallReceipt(patch, receipt);
    if (validated.isErr()) {
      return failAfterEnvironmentRollback(receipt, [validated.error[0], ...validated.error.slice(1)]);
    }
    const acknowledgement = createBootstrapAcknowledgement({
      exchangeId: patch.exchangeId,
      leaseId: patch.leaseId,
      processAttemptId: patch.processAttemptId,
      installedSlotIds: patch.slots.map((slot) => slot.slotId)
    });
    return acknowledgement.isErr() ? failAfterEnvironmentRollback(receipt, [acknowledgement.error[0], ...acknowledgement.error.slice(1)]) : clientOk({
      acknowledgement: acknowledgement.value,
      value: preparedEnvironment(input.request, patch),
      cleanup: receipt.cleanup
    });
  });
};
var prepareRecipeEnvironmentExchange = (input, ports) => ports.transport.exchange(input.request, (response) => prepareDelivery(input, response, ports));
var validRetryPolicy = (policy) => Number.isSafeInteger(policy.maximumAttempts) && policy.maximumAttempts > 0 && policy.maximumAttempts <= BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS && Number.isSafeInteger(policy.delayMs) && policy.delayMs > 0 && policy.delayMs <= BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS;
var retryUnavailable = () => clientErr({
  code: "transport-unavailable",
  message: "Bootstrap retry scheduling is unavailable."
});
var isNotReady = (result) => result.isErr() && result.error[0].code === "bootstrap-not-ready";
var retryNotReady = (operation, retry, policy, attemptNumber) => Promise.resolve().then(operation).then((result) => isNotReady(result) && attemptNumber < policy.maximumAttempts ? Promise.resolve().then(() => retry.wait(policy.delayMs)).then(() => retryNotReady(operation, retry, policy, attemptNumber + 1), () => retryUnavailable()) : result, () => retryUnavailable());
var prepareRecipeEnvironmentExchangeWithRetry = (input, ports, retry, policy) => validRetryPolicy(policy) ? retryNotReady(() => prepareRecipeEnvironmentExchange(input, ports), retry, policy, 1) : Promise.resolve(clientErr({
  code: "invalid-input",
  message: "Bootstrap not-ready retry policy is invalid."
}));
var prepareRecipeEnvironment = (input, ports) => prepareRecipeEnvironmentExchange(input, ports).then((result) => result.map((completion) => completion.value));
var prepareRecipeEnvironmentWithRetry = (input, ports, retry, policy) => prepareRecipeEnvironmentExchangeWithRetry(input, ports, retry, policy).then((result) => result.map((completion) => completion.value));
var createBootstrapNotReadyRetryPort = () => ({
  wait: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
});
var loadDeferredApplication = (deferredImport) => Promise.resolve().then(deferredImport).then((application) => clientOk(application), () => clientErr({
  code: "application-import-failed",
  message: "Deferred application import failed after environment preparation."
}));
var prepareRecipeEnvironmentThenImport = (input, ports, deferredImport) => prepareRecipeEnvironmentExchange(input, ports).then((prepared) => prepared.isErr() ? clientErr(prepared.error[0], ...prepared.error.slice(1)) : loadDeferredApplication(deferredImport).then((application) => application.isOk() ? clientOk({
  environment: prepared.value.value,
  application: application.value
}) : failAfterEnvironmentRollback({
  atomic: true,
  installedSlots: prepared.value.value.installedSlots,
  cleanup: prepared.value.cleanup
}, [application.error[0], ...application.error.slice(1)])));
var prepareRecipeEnvironmentThenImportWithRetry = (input, ports, retry, policy, deferredImport) => prepareRecipeEnvironmentExchangeWithRetry(input, ports, retry, policy).then((prepared) => prepared.isErr() ? clientErr(prepared.error[0], ...prepared.error.slice(1)) : loadDeferredApplication(deferredImport).then((application) => application.isOk() ? clientOk({
  environment: prepared.value.value,
  application: application.value
}) : failAfterEnvironmentRollback({
  atomic: true,
  installedSlots: prepared.value.value.installedSlots,
  cleanup: prepared.value.cleanup
}, [application.error[0], ...application.error.slice(1)])));

// src/broker-client/bootstrap/bun-inherited-ipc.ts
var BROKER_BOOTSTRAP_CHILD_ARGUMENT = "--nebular-bootstrap-child";
var BROKER_BOOTSTRAP_BUILD_ID = "epsilonode-nebular-bootstrap-v1";
var BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS = 15000;
var BROKER_BOOTSTRAP_MAX_TIMEOUT_MS = 60000;
var validPath = (value, maximumLength) => value.length > 0 && value.length <= maximumLength && !value.includes("\x00");
var timeout = (value) => {
  const timeoutMs = value ?? BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_BOOTSTRAP_MAX_TIMEOUT_MS ? clientOk(timeoutMs) : clientErr({ code: "invalid-input", message: "Bootstrap IPC timeout is invalid." });
};
var requestWire = (request) => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: "bootstrap-request",
  exchangeId: request.exchangeId.value,
  payload: {
    authority: {
      repository: request.payload.authority.repository.value,
      recipeRevision: request.payload.authority.recipeRevision.value,
      grantId: request.payload.authority.grantId.value,
      grantGeneration: request.payload.authority.grantGeneration
    },
    attempt: {
      receiverId: request.payload.attempt.receiverId.value,
      processAttemptId: request.payload.attempt.processAttemptId.value
    },
    slots: request.payload.slots.map((slot) => ({
      slotId: slot.slotId.value,
      environmentName: slot.environmentName
    }))
  }
});
var acknowledgementWire = (acknowledgement) => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: "bootstrap-acknowledgement",
  exchangeId: acknowledgement.exchangeId.value,
  payload: {
    leaseId: acknowledgement.payload.leaseId.value,
    processAttemptId: acknowledgement.payload.processAttemptId.value,
    installedSlotIds: acknowledgement.payload.installedSlotIds.map((slot) => slot.value),
    installedSlotCount: acknowledgement.payload.installedSlotCount
  }
});
var validHello = (hello, request, expectedBuildId) => hello.exchangeId.value === request.exchangeId.value && hello.payload.buildId === expectedBuildId;
var executeExchange = (request, consume, options, runtime, timeoutMs) => new Promise((resolve) => {
  let phase = "awaiting-hello";
  let settled = false;
  let finalizing = false;
  let completion;
  let pendingFailure;
  const peerState = {};
  const settle = (result) => {
    if (settled)
      return;
    settled = true;
    clearTimeout(deadline);
    resolve(result);
  };
  const settleFailure = (issues) => {
    if (settled || finalizing)
      return;
    if (completion === undefined) {
      settle(clientErr(issues[0], ...issues.slice(1)));
      return;
    }
    finalizing = true;
    completion.cleanup.rollback().then((rolledBack) => settle(rolledBack.isOk() ? clientErr(issues[0], ...issues.slice(1)) : clientErr({
      code: "environment-invalid",
      message: "Bootstrap helper failed and the installed environment could not be rolled back."
    })), () => settle(clientErr({
      code: "environment-invalid",
      message: "Bootstrap helper failed and the installed environment could not be rolled back."
    })));
  };
  const fail = (issues) => {
    peerState.current?.terminate();
    if (phase === "consuming" && completion === undefined) {
      pendingFailure ??= issues;
      return;
    }
    settleFailure(issues);
  };
  const receiveResponse = (response, target) => {
    phase = "consuming";
    consume(response).then((consumed) => {
      if (consumed.isErr()) {
        settleFailure(pendingFailure ?? consumed.error);
        return;
      }
      completion = consumed.value;
      if (pendingFailure !== undefined) {
        settleFailure(pendingFailure);
        return;
      }
      const sent = target.send(acknowledgementWire(consumed.value.acknowledgement));
      if (sent.isErr())
        return fail(sent.error);
      phase = "awaiting-exit";
    }, () => settleFailure(pendingFailure ?? [{
      code: "transport-unavailable",
      message: "Bootstrap response consumption failed outside the typed outcome channel."
    }]));
  };
  const observer = {
    onMessage: (wire, target) => {
      if (settled || finalizing || pendingFailure !== undefined)
        return;
      const decoded = decodeBootstrapProtocolMessage(wire);
      if (decoded.isErr())
        return fail(decoded.error);
      const message = decoded.value;
      if (phase === "awaiting-hello" && message.messageKind === "bootstrap-hello") {
        if (!validHello(message, request, options.expectedBuildId ?? BROKER_BOOTSTRAP_BUILD_ID)) {
          return fail([{ code: "protocol-mismatch", message: "Bootstrap helper handshake is incompatible." }]);
        }
        const sent = target.send(requestWire(request));
        if (sent.isErr())
          return fail(sent.error);
        phase = "awaiting-response";
        return;
      }
      if (phase === "awaiting-response" && (message.messageKind === "bootstrap-delivery" || message.messageKind === "bootstrap-rejected")) {
        receiveResponse(message, target);
        return;
      }
      fail([{ code: "protocol-mismatch", message: "Bootstrap IPC message is illegal in the current phase." }]);
    },
    onDisconnect: () => {
      if (!settled && phase !== "awaiting-exit") {
        fail([{
          code: "transport-unavailable",
          message: "Bootstrap IPC disconnected before acknowledgement."
        }]);
      }
    },
    onExit: (exitCode) => {
      if (settled || finalizing)
        return;
      if (phase === "awaiting-exit" && completion !== undefined && exitCode === 0) {
        settle(clientOk(completion));
        return;
      }
      fail([{
        code: "transport-unavailable",
        message: "Bootstrap helper exited without a successful acknowledged exchange."
      }]);
    }
  };
  const deadline = setTimeout(() => {
    fail([{
      code: "transport-unavailable",
      message: "Bootstrap IPC exchange exceeded its bounded deadline."
    }]);
  }, timeoutMs);
  const spawned = runtime.spawn({
    brokerEntrypoint: options.brokerEntrypoint,
    cwd: options.cwd,
    exchangeId: request.exchangeId.value
  }, observer);
  if (spawned.isErr())
    return settle(clientErr(spawned.error[0], ...spawned.error.slice(1)));
  peerState.current = spawned.value;
});
var createBunCooperativeBootstrapTransportPort = (options, runtime = createBunBootstrapInheritedIpcRuntime()) => ({
  exchange: (request, consume) => {
    if (!validPath(options.brokerEntrypoint, 4096) || !validPath(options.cwd, 4096)) {
      return Promise.resolve(clientErr({
        code: "invalid-input",
        message: "Bootstrap broker entrypoint or repository directory is invalid."
      }));
    }
    const bounded = timeout(options.timeoutMs);
    return bounded.isErr() ? Promise.resolve(clientErr(bounded.error[0], ...bounded.error.slice(1))) : executeExchange(request, consume, options, runtime, bounded.value);
  }
});
var allowedHelperEnvironmentNames = [
  "APPDATA",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR"
];
var bootstrapHelperEnvironment = () => Object.fromEntries(allowedHelperEnvironmentNames.flatMap((name) => {
  const value = process.env[name];
  return value === undefined || value.includes("\x00") ? [] : [[name, value]];
}));
var createBunBootstrapInheritedIpcRuntime = () => ({
  spawn: (plan, observer) => clientTry(() => {
    const subprocess = Bun.spawn({
      cmd: [
        process.execPath,
        plan.brokerEntrypoint,
        BROKER_BOOTSTRAP_CHILD_ARGUMENT,
        plan.exchangeId
      ],
      cwd: plan.cwd,
      env: bootstrapHelperEnvironment(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      serialization: "json",
      ipc: (message, child) => observer.onMessage(message, {
        send: (outbound) => clientTry(() => child.send(outbound), { code: "transport-unavailable", message: "Bootstrap IPC send failed." }).map(() => {
          return;
        }),
        disconnect: () => child.disconnect(),
        terminate: () => child.kill()
      }),
      onDisconnect: () => observer.onDisconnect(),
      onExit: (_child, exitCode) => observer.onExit(exitCode ?? 1)
    });
    return {
      send: (outbound) => clientTry(() => subprocess.send(outbound), { code: "transport-unavailable", message: "Bootstrap IPC send failed." }).map(() => {
        return;
      }),
      disconnect: () => subprocess.disconnect(),
      terminate: () => subprocess.kill()
    };
  }, {
    code: "transport-unavailable",
    message: "Bootstrap broker helper could not be started."
  })
});

// src/broker-client/bootstrap/bun-process-environment.ts
var foldName = (name) => name.toUpperCase();
var unique = (values) => values.every((value, index) => values.indexOf(value) === index);
var samePatchSlots = (patch) => patch.entries.length === patch.slots.length && patch.entries.every((entry) => patch.slots.some((slot) => slot.slotId.value === entry.slotId.value && slot.environmentName === entry.environmentName));
var stageEntry = (entry) => entry.secret.withValue((value) => value.length > 0 && !value.includes("\x00") ? clientOk({ name: entry.environmentName, value }) : clientErr({
  code: "environment-invalid",
  message: "Bootstrap environment value is invalid."
}));
var stageEntries = (entries) => entries.reduce((staged, entry) => staged.andThen((values) => stageEntry(entry).map((value) => [...values, value])), clientOk([]));
var rollback = (runtime, names) => names.reduceRight((removed, name) => removed.andThen(() => runtime.remove(name)), clientOk(undefined));
var failAfterRollback = (runtime, names, issues) => rollback(runtime, names).andThen(() => clientErr(issues[0], ...issues.slice(1))).orElse(() => clientErr({
  code: "environment-invalid",
  message: "Bootstrap environment installation and rollback failed."
}));
var applyStaged = (runtime, entries, index, installedNames) => {
  const entry = entries[index];
  if (entry === undefined)
    return clientOk(installedNames);
  const written = runtime.write(entry.name, entry.value);
  return written.isErr() ? failAfterRollback(runtime, installedNames, written.error) : applyStaged(runtime, entries, index + 1, [...installedNames, entry.name]);
};
var validatePatch = (patch, existingNames) => {
  const patchNames = patch.slots.map((slot) => foldName(slot.environmentName));
  const existingFolded = existingNames.map(foldName);
  return samePatchSlots(patch) && unique(patchNames) && patch.slots.every((slot) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(slot.environmentName)) && !patchNames.some((name) => existingFolded.includes(name)) ? clientOk(patch) : clientErr({
    code: "environment-invalid",
    message: "Bootstrap environment patch is invalid or collides with the current process."
  });
};
var installPatch = (patch, runtime) => validatePatch(patch, runtime.names()).andThen((validated) => stageEntries(validated.entries).andThen((staged) => applyStaged(runtime, staged, 0, []).map((installedNames) => {
  const rollbackState = { active: true };
  return {
    atomic: true,
    installedSlots: validated.slots,
    cleanup: {
      rollback: () => {
        if (!rollbackState.active)
          return Promise.resolve(clientOk(undefined));
        rollbackState.active = false;
        return Promise.resolve(rollback(runtime, installedNames));
      }
    }
  };
})));
var createBunProcessEnvironmentRuntime = () => ({
  names: () => Object.keys(process.env),
  write: (name, value) => clientTry(() => {
    process.env[name] = value;
  }, {
    code: "environment-invalid",
    message: "Current-process environment installation failed."
  }),
  remove: (name) => clientTry(() => {
    delete process.env[name];
  }, {
    code: "environment-invalid",
    message: "Current-process environment rollback failed."
  })
});
var createBunProcessEnvironmentInstallPort = (runtime = createBunProcessEnvironmentRuntime()) => ({
  installAtomically: (patch) => Promise.resolve(installPatch(patch, runtime))
});
var bunProcessEnvironmentNames = () => Object.keys(process.env);

// src/broker-client/bootstrap/managed-attempt.ts
var MANAGED_ATTEMPT_ENVIRONMENT = Object.freeze({
  repository: "NEBULAR_PM2_REPOSITORY",
  recipeRevision: "NEBULAR_PM2_RECIPE_REVISION",
  grantId: "NEBULAR_PM2_GRANT_ID",
  grantGeneration: "NEBULAR_PM2_GRANT_GENERATION",
  receiverId: "NEBULAR_PM2_RECEIVER_ID",
  processAttemptId: "NEBULAR_PM2_ATTEMPT_ID"
});
var invalidManagedAttempt = () => clientErr({
  code: "invalid-input",
  message: "The current managed recipe authority environment is invalid."
});
var readEnvironment = (port, name) => clientTry(() => port.read(name), {
  code: "invalid-input",
  message: "The current managed recipe authority environment is unavailable."
});
var canonicalPositiveGeneration = (value) => {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/u.test(value))
    return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value ? parsed : null;
};
var readManagedFacts = (port) => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.repository).andThen((repository) => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.recipeRevision).andThen((recipeRevision) => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.grantId).andThen((grantId) => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.grantGeneration).andThen((rawGeneration) => {
  const grantGeneration = canonicalPositiveGeneration(rawGeneration);
  if (grantGeneration === null)
    return invalidManagedAttempt();
  return readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.receiverId).andThen((receiverId) => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId).andThen((processAttemptId) => clientTry(() => port.createExchangeId(), {
    code: "invalid-input",
    message: "A bootstrap exchange identity could not be created."
  }).map((exchangeId) => ({
    repository,
    recipeRevision,
    grantId,
    grantGeneration,
    receiverId,
    processAttemptId,
    exchangeId
  }))));
}))));
var createManagedBootstrapRequest = (input, port) => readManagedFacts(port).andThen((facts) => createBootstrapRequest({ ...facts, slots: input.slots }));
var createBunManagedAttemptEnvironmentPort = () => ({
  read: (name) => process.env[name],
  createExchangeId: () => crypto.randomUUID()
});

// src/broker-client/bootstrap/windows-job-first-effect.ts
var MANAGED_WINDOWS_JOB_ENVIRONMENT = Object.freeze({
  jobIdentity: "NEBULAR_PM2_JOB_IDENTITY",
  processAttemptId: MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId
});
var invalidAuthority = () => clientErr({
  code: "invalid-input",
  message: "The managed Windows containment authority environment is invalid."
});
var unavailable = () => clientErr({
  code: "transport-unavailable",
  message: "The managed Windows containment first effect is unavailable."
});
var incompatible = () => clientErr({
  code: "transport-unavailable",
  message: "The current process has incompatible Windows containment authority."
});
var readEnvironment2 = (environment, name) => clientTry(() => environment.read(name), {
  code: "invalid-input",
  message: "The managed Windows containment authority environment is unavailable."
});
var parseIdentity = (jobValue, attemptValue) => typeof jobValue === "string" && /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(jobValue) && typeof attemptValue === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(attemptValue) ? clientOk({
  job: { kind: "managed-windows-job-identity", value: jobValue },
  attempt: { kind: "managed-windows-job-attempt-identity", value: attemptValue }
}) : invalidAuthority();
var readManagedWindowsJobFirstEffectIdentity = (environment) => readEnvironment2(environment, MANAGED_WINDOWS_JOB_ENVIRONMENT.jobIdentity).andThen((job) => readEnvironment2(environment, MANAGED_WINDOWS_JOB_ENVIRONMENT.processAttemptId).andThen((attempt) => parseIdentity(job, attempt)));
var processIdIsValid = (processId) => Number.isSafeInteger(processId) && processId > 0 && processId <= 4294967295;
var receipt = (identity, processId, state) => clientOk({
  state,
  job: identity.job,
  attempt: identity.attempt,
  processId
});
var operationUnavailable = () => unavailable();
var operationIncompatible = () => incompatible();
var proveContained = (identity, processId, state, session) => Promise.resolve().then(() => session.isCurrentProcessInThisJob()).then((membership) => {
  if (membership.status === "observed" && !membership.value)
    return operationIncompatible();
  if (membership.status !== "observed")
    return operationUnavailable();
  return Promise.resolve().then(() => session.queryPolicy()).then((policy) => {
    if (policy.status === "incompatible")
      return operationIncompatible();
    if (policy.status !== "compatible")
      return operationUnavailable();
    return Promise.resolve().then(() => session.queryActiveProcesses()).then((active) => active.status === "observed" && active.activeProcesses > 0 ? receipt(identity, processId, state) : operationUnavailable(), operationUnavailable);
  }, operationUnavailable);
}, operationUnavailable).then((result) => result, operationUnavailable);
var assignAfterPreconditions = (identity, processId, session) => Promise.resolve().then(() => session.isCurrentProcessInAnyJob()).then((anyJob) => {
  if (anyJob.status !== "observed")
    return operationUnavailable();
  if (anyJob.value)
    return operationIncompatible();
  return Promise.resolve().then(() => session.queryActiveProcesses()).then((active) => {
    if (active.status !== "observed")
      return operationUnavailable();
    if (active.activeProcesses !== 0)
      return operationIncompatible();
    return Promise.resolve().then(() => session.assignCurrentProcess()).then((assigned) => assigned.status === "succeeded" ? proveContained(identity, processId, "assigned", session) : operationIncompatible(), operationUnavailable);
  }, operationUnavailable);
}, operationUnavailable).then((result) => result, operationUnavailable);
var enterSession = (identity, processId, session) => Promise.resolve().then(() => session.queryPolicy()).then((policy) => {
  if (policy.status === "incompatible")
    return operationIncompatible();
  if (policy.status !== "compatible")
    return operationUnavailable();
  return Promise.resolve().then(() => session.isCurrentProcessInThisJob()).then((membership) => membership.status === "observed" ? membership.value ? proveContained(identity, processId, "already-contained", session) : assignAfterPreconditions(identity, processId, session) : operationUnavailable(), operationUnavailable);
}, operationUnavailable).then((result) => result, operationUnavailable);
var anchor = (identity, source, session) => ({
  identity,
  authority: {
    proveRetained: () => proveContained(source, identity.processId, "already-contained", session)
  }
});
var anchorFailure = () => unavailable();
var transferLifetimeAnchor = (source, processId, session) => enterSession(source, processId, session).then((entered) => entered.isOk() ? clientOk(anchor(entered.value, source, session)) : Promise.resolve().then(() => session.close()).then((closed) => closed ? clientErr(entered.error[0], ...entered.error.slice(1)) : anchorFailure(), anchorFailure), () => Promise.resolve().then(() => session.close()).then(anchorFailure, anchorFailure));
var openLifetimeAnchor = (identity, native) => Promise.resolve().then(() => native.openCurrentProcess(identity.job)).then((opened) => opened.status === "opened" && processIdIsValid(opened.processId) ? transferLifetimeAnchor(identity, opened.processId, opened.session) : anchorFailure(), anchorFailure).then((result) => result, anchorFailure);
var createManagedWindowsJobFirstEffectGate = (environment, native) => ({
  enter: () => {
    const identity = readManagedWindowsJobFirstEffectIdentity(environment);
    return identity.isOk() ? openLifetimeAnchor(identity.value, native) : Promise.resolve(clientErr(identity.error[0], ...identity.error.slice(1)));
  }
});

// src/broker-client/bootstrap/bun-windows-job-first-effect.ts
var JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1;
var JOB_OBJECT_BASIC_UI_RESTRICTIONS = 4;
var JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
var JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 8192;
var BASIC_ACCOUNTING_INFORMATION_BYTES = 48;
var BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET = 40;
var BASIC_UI_RESTRICTIONS_BYTES = 4;
var EXTENDED_LIMIT_INFORMATION_BYTES_64 = 144;
var EXTENDED_LIMIT_FLAGS_OFFSET_64 = 16;
var ERROR_ALREADY_EXISTS = 183;
var HANDLE_FLAG_INHERIT = 1;
var MAXIMUM_HANDLE = 0xffffffffffffffffn;
var kernel32FirstEffectSymbols = {
  SetLastError: {
    args: ["u32"],
    returns: "void"
  },
  GetLastError: {
    args: [],
    returns: "u32"
  },
  CreateJobObjectW: {
    args: ["ptr", "ptr"],
    returns: "u64"
  },
  GetCurrentProcess: {
    args: [],
    returns: "u64"
  },
  GetCurrentProcessId: {
    args: [],
    returns: "u32"
  },
  QueryInformationJobObject: {
    args: ["u64", "i32", "ptr", "u32", "ptr"],
    returns: "bool"
  },
  SetInformationJobObject: {
    args: ["u64", "i32", "ptr", "u32"],
    returns: "bool"
  },
  SetHandleInformation: {
    args: ["u64", "u32", "u32"],
    returns: "bool"
  },
  IsProcessInJob: {
    args: ["u64", "u64", "ptr"],
    returns: "bool"
  },
  AssignProcessToJobObject: {
    args: ["u64", "u64"],
    returns: "bool"
  },
  CloseHandle: {
    args: ["u64"],
    returns: "bool"
  }
};
var unavailablePolicy = () => ({ status: "unavailable" });
var compatiblePolicy = () => ({ status: "compatible" });
var incompatiblePolicy = () => ({ status: "incompatible" });
var unavailableActive = () => ({ status: "unavailable" });
var observedActive = (activeProcesses) => ({
  status: "observed",
  activeProcesses
});
var unavailableBoolean = () => ({ status: "unavailable" });
var observedBoolean = (value) => ({
  status: "observed",
  value
});
var normalizeHandle = (handle) => typeof handle === "bigint" && handle > 0n && handle <= MAXIMUM_HANDLE ? handle : typeof handle === "number" && Number.isSafeInteger(handle) && handle > 0 ? BigInt(handle) : null;
var processIdIsValid2 = (processId) => Number.isSafeInteger(processId) && processId > 0 && processId <= 4294967295;
var identityIsValid = (job) => /^Local\\epsilonode\.nebular\.job\.v1\.[a-f0-9]{64}$/u.test(job.value);
var encodeWideAscii = (value) => Uint16Array.from([
  ...Array.from(value, (character) => character.charCodeAt(0)),
  0
]);
var closeLibrary = (library) => Promise.resolve().then(() => library.close()).then(() => true, () => false);
var closeJobAndLibrary = (library, jobHandle) => Promise.resolve().then(() => library.symbols.CloseHandle(jobHandle)).then((handleClosed) => closeLibrary(library).then((libraryClosed) => handleClosed && libraryClosed), () => closeLibrary(library).then(() => false));
var queryPolicy = (ffi, library, jobHandle) => Promise.resolve().then(() => {
  const limits = new BigUint64Array(EXTENDED_LIMIT_INFORMATION_BYTES_64 / 8);
  const uiRestrictions = new Uint32Array(BASIC_UI_RESTRICTIONS_BYTES / 4);
  const queriedLimits = library.symbols.QueryInformationJobObject(jobHandle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ffi.ptr(limits), EXTENDED_LIMIT_INFORMATION_BYTES_64, null);
  const queriedUi = queriedLimits && library.symbols.QueryInformationJobObject(jobHandle, JOB_OBJECT_BASIC_UI_RESTRICTIONS, ffi.ptr(uiRestrictions), BASIC_UI_RESTRICTIONS_BYTES, null);
  if (!queriedLimits || !queriedUi)
    return unavailablePolicy();
  const view = new DataView(limits.buffer, limits.byteOffset, limits.byteLength);
  const flags = view.getUint32(EXTENDED_LIMIT_FLAGS_OFFSET_64, true);
  return flags === JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE && uiRestrictions[0] === 0 ? compatiblePolicy() : incompatiblePolicy();
}).then((observation) => observation, unavailablePolicy);
var setExactJobPolicy = (ffi, library, jobHandle) => {
  const limits = new BigUint64Array(EXTENDED_LIMIT_INFORMATION_BYTES_64 / 8);
  const view = new DataView(limits.buffer, limits.byteOffset, limits.byteLength);
  view.setUint32(EXTENDED_LIMIT_FLAGS_OFFSET_64, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, true);
  return library.symbols.SetInformationJobObject(jobHandle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ffi.ptr(limits), EXTENDED_LIMIT_INFORMATION_BYTES_64);
};
var queryActiveProcesses = (ffi, library, jobHandle) => Promise.resolve().then(() => {
  const accounting = new BigUint64Array(BASIC_ACCOUNTING_INFORMATION_BYTES / 8);
  const queried = library.symbols.QueryInformationJobObject(jobHandle, JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION, ffi.ptr(accounting), BASIC_ACCOUNTING_INFORMATION_BYTES, null);
  if (!queried)
    return unavailableActive();
  const view = new DataView(accounting.buffer, accounting.byteOffset, accounting.byteLength);
  return observedActive(view.getUint32(BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET, true));
}).then((observation) => observation, unavailableActive);
var membership = (ffi, library, processHandle, jobHandle) => Promise.resolve().then(() => {
  const member = new Uint32Array(1);
  return library.symbols.IsProcessInJob(processHandle, jobHandle, ffi.ptr(member)) ? observedBoolean(member[0] !== 0) : unavailableBoolean();
}).then((observation) => observation, unavailableBoolean);
var action = (effect) => Promise.resolve().then(effect).then((succeeded) => ({ status: succeeded ? "succeeded" : "failed" }), () => ({ status: "failed" }));
var openedSession = (ffi, library, opened) => {
  if (opened.jobHandle === null || opened.currentProcessHandle === null || !processIdIsValid2(opened.processId))
    return { status: "unavailable" };
  const jobHandle = opened.jobHandle;
  const currentProcessHandle = opened.currentProcessHandle;
  return {
    status: "opened",
    processId: opened.processId,
    session: {
      queryPolicy: () => queryPolicy(ffi, library, jobHandle),
      queryActiveProcesses: () => queryActiveProcesses(ffi, library, jobHandle),
      isCurrentProcessInAnyJob: () => membership(ffi, library, currentProcessHandle, 0n),
      isCurrentProcessInThisJob: () => membership(ffi, library, currentProcessHandle, jobHandle),
      assignCurrentProcess: () => action(() => library.symbols.AssignProcessToJobObject(jobHandle, currentProcessHandle)),
      close: () => closeJobAndLibrary(library, jobHandle)
    }
  };
};
var openWithLibrary = (ffi, library, job) => Promise.resolve().then(() => {
  const encodedName = encodeWideAscii(job.value);
  library.symbols.SetLastError(0);
  const jobHandle = normalizeHandle(library.symbols.CreateJobObjectW(null, ffi.ptr(encodedName)));
  const createStatus = library.symbols.GetLastError();
  return {
    jobHandle,
    currentProcessHandle: normalizeHandle(library.symbols.GetCurrentProcess()),
    processId: library.symbols.GetCurrentProcessId(),
    createStatus,
    inheritanceDisabled: jobHandle !== null && library.symbols.SetHandleInformation(jobHandle, HANDLE_FLAG_INHERIT, 0)
  };
}).then((opened) => opened.jobHandle !== null && opened.currentProcessHandle !== null && opened.inheritanceDisabled && (opened.createStatus === 0 || opened.createStatus === ERROR_ALREADY_EXISTS) && processIdIsValid2(opened.processId) ? opened.createStatus === ERROR_ALREADY_EXISTS || setExactJobPolicy(ffi, library, opened.jobHandle) ? openedSession(ffi, library, opened) : closeJobAndLibrary(library, opened.jobHandle).then(() => ({ status: "unavailable" })) : opened.jobHandle === null ? closeLibrary(library).then(() => ({ status: "unavailable" })) : closeJobAndLibrary(library, opened.jobHandle).then(() => ({ status: "unavailable" })), () => closeLibrary(library).then(() => ({ status: "unavailable" })));
var openKernel32 = (ffi) => ffi.dlopen("kernel32.dll", kernel32FirstEffectSymbols);
var openNative = (job) => Promise.resolve().then(() => import("bun:ffi")).then((ffi) => Promise.resolve().then(() => openKernel32(ffi)).then((library) => openWithLibrary(ffi, library, job), () => ({ status: "unavailable" })), () => ({ status: "unavailable" }));
var createBunManagedWindowsJobNativePort = (platform = process.platform, architecture = process.arch) => ({
  openCurrentProcess: (job) => platform === "win32" && (architecture === "x64" || architecture === "arm64") && identityIsValid(job) ? openNative(job) : Promise.resolve({ status: "unavailable" })
});
var createBunManagedWindowsJobFirstEffectGate = (environment = { read: (name) => process.env[name] }, native = createBunManagedWindowsJobNativePort()) => createManagedWindowsJobFirstEffectGate(environment, native);

// src/broker-client/bootstrap/bun-managed-recipe.ts
var MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY = Object.freeze({
  maximumAttempts: 32,
  delayMs: 25
});
var MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT = "NEBULAR_BROKER_ENTRYPOINT";
var managedBootstrapFailure = () => clientErr({
  code: "transport-unavailable",
  message: "The managed Bun recipe bootstrap could not be prepared."
});
var createManagedBunRecipeBootstrapRuntime = () => ({
  containment: createBunManagedWindowsJobFirstEffectGate(),
  authorityEnvironment: createBunManagedAttemptEnvironmentPort(),
  environment: createBunProcessEnvironmentInstallPort(),
  inheritedEnvironment: { names: bunProcessEnvironmentNames },
  locations: {
    currentDirectory: () => process.cwd(),
    brokerEntrypoint: () => process.env[MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT]
  },
  retry: createBootstrapNotReadyRetryPort(),
  transports: { create: createBunCooperativeBootstrapTransportPort },
  clock: { nowMs: () => Date.now() }
});
var prepareAfterWindowsContainment = (input, deferredImport, runtime) => {
  const request = createManagedBootstrapRequest({ slots: input.slots }, runtime.authorityEnvironment);
  if (request.isErr())
    return Promise.resolve(clientErr(request.error[0], ...request.error.slice(1)));
  const prepared = clientTry(() => {
    const cwd = input.cwd ?? runtime.locations.currentDirectory();
    const brokerEntrypoint = input.brokerEntrypoint ?? runtime.locations.brokerEntrypoint();
    if (typeof brokerEntrypoint !== "string")
      return { status: "invalid" };
    const transport = runtime.transports.create({
      brokerEntrypoint,
      cwd,
      ...input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }
    });
    return {
      status: "ready",
      cwd,
      inheritedEnvironmentNames: runtime.inheritedEnvironment.names(),
      transport
    };
  }, {
    code: "transport-unavailable",
    message: "The managed Bun recipe bootstrap adapters are unavailable."
  });
  if (prepared.isErr())
    return Promise.resolve(clientErr(prepared.error[0], ...prepared.error.slice(1)));
  const adapters = prepared.value;
  if (adapters.status === "invalid") {
    return Promise.resolve(clientErr({
      code: "invalid-input",
      message: "The managed broker entrypoint is unavailable."
    }));
  }
  return Promise.resolve().then(() => prepareRecipeEnvironmentThenImportWithRetry({
    request: request.value,
    inheritedEnvironmentNames: adapters.inheritedEnvironmentNames
  }, {
    clock: runtime.clock,
    environment: runtime.environment,
    transport: adapters.transport
  }, runtime.retry, input.retryPolicy ?? MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY, deferredImport)).then((result) => result, () => managedBootstrapFailure());
};
var prepareManagedBunRecipeEnvironmentThenImport = (input, deferredImport, runtime = createManagedBunRecipeBootstrapRuntime()) => Promise.resolve().then(() => runtime.containment.enter()).then((contained) => contained.isErr() ? clientErr(contained.error[0], ...contained.error.slice(1)) : prepareAfterWindowsContainment(input, deferredImport, runtime).then((prepared) => prepared.map((application) => ({
  ...application,
  containment: contained.value
}))), () => managedBootstrapFailure()).then((result) => result, () => managedBootstrapFailure());

// node_modules/ts-pattern/dist/index.js
var t = Symbol.for("@ts-pattern/matcher");
var e = Symbol.for("@ts-pattern/isVariadic");
var n = "@ts-pattern/anonymous-select-key";
var r = (t2) => Boolean(t2 && typeof t2 == "object");
var i = (e2) => e2 && !!e2[t];
var o = (n2, s, c) => {
  if (i(n2)) {
    const e2 = n2[t](), { matched: r2, selections: i2 } = e2.match(s);
    return r2 && i2 && Object.keys(i2).forEach((t2) => c(t2, i2[t2])), r2;
  }
  if (r(n2)) {
    if (!r(s))
      return false;
    if (Array.isArray(n2)) {
      if (!Array.isArray(s))
        return false;
      let t2 = [], r2 = [], u = [];
      for (const o2 of n2.keys()) {
        const s2 = n2[o2];
        i(s2) && s2[e] ? u.push(s2) : u.length ? r2.push(s2) : t2.push(s2);
      }
      if (u.length) {
        if (u.length > 1)
          throw new Error("Pattern error: Using `...P.array(...)` several times in a single pattern is not allowed.");
        if (s.length < t2.length + r2.length)
          return false;
        const e2 = s.slice(0, t2.length), n3 = r2.length === 0 ? [] : s.slice(-r2.length), i2 = s.slice(t2.length, r2.length === 0 ? Infinity : -r2.length);
        return t2.every((t3, n4) => o(t3, e2[n4], c)) && r2.every((t3, e3) => o(t3, n3[e3], c)) && (u.length === 0 || o(u[0], i2, c));
      }
      return n2.length === s.length && n2.every((t3, e2) => o(t3, s[e2], c));
    }
    return Reflect.ownKeys(n2).every((e2) => {
      const r2 = n2[e2];
      return ((e2 in s) || i(u = r2) && u[t]().matcherType === "optional") && o(r2, s[e2], c);
      var u;
    });
  }
  return Object.is(s, n2);
};
var s = (e2) => {
  var n2, o2, u;
  return r(e2) ? i(e2) ? (n2 = (o2 = (u = e2[t]()).getSelectionKeys) == null ? undefined : o2.call(u)) != null ? n2 : [] : Array.isArray(e2) ? c(e2, s) : c(Object.values(e2), s) : [];
};
var c = (t2, e2) => t2.reduce((t3, n2) => t3.concat(e2(n2)), []);
function a(t2) {
  return Object.assign(t2, { optional: () => h(t2), and: (e2) => d(t2, e2), or: (e2) => y(t2, e2), select: (e2) => e2 === undefined ? v(t2) : v(e2, t2) });
}
function h(e2) {
  return a({ [t]: () => ({ match: (t2) => {
    let n2 = {};
    const r2 = (t3, e3) => {
      n2[t3] = e3;
    };
    return t2 === undefined ? (s(e2).forEach((t3) => r2(t3, undefined)), { matched: true, selections: n2 }) : { matched: o(e2, t2, r2), selections: n2 };
  }, getSelectionKeys: () => s(e2), matcherType: "optional" }) });
}
function d(...e2) {
  return a({ [t]: () => ({ match: (t2) => {
    let n2 = {};
    const r2 = (t3, e3) => {
      n2[t3] = e3;
    };
    return { matched: e2.every((e3) => o(e3, t2, r2)), selections: n2 };
  }, getSelectionKeys: () => c(e2, s), matcherType: "and" }) });
}
function y(...e2) {
  return a({ [t]: () => ({ match: (t2) => {
    let n2 = {};
    const r2 = (t3, e3) => {
      n2[t3] = e3;
    };
    return c(e2, s).forEach((t3) => r2(t3, undefined)), { matched: e2.some((e3) => o(e3, t2, r2)), selections: n2 };
  }, getSelectionKeys: () => c(e2, s), matcherType: "or" }) });
}
function p(e2) {
  return { [t]: () => ({ match: (t2) => ({ matched: Boolean(e2(t2)) }) }) };
}
function v(...e2) {
  const r2 = typeof e2[0] == "string" ? e2[0] : undefined, i2 = e2.length === 2 ? e2[1] : typeof e2[0] == "string" ? undefined : e2[0];
  return a({ [t]: () => ({ match: (t2) => {
    let e3 = { [r2 != null ? r2 : n]: t2 };
    return { matched: i2 === undefined || o(i2, t2, (t3, n2) => {
      e3[t3] = n2;
    }), selections: e3 };
  }, getSelectionKeys: () => [r2 != null ? r2 : n].concat(i2 === undefined ? [] : s(i2)) }) });
}
function b(t2) {
  return true;
}
function w(t2) {
  return typeof t2 == "number";
}
function S(t2) {
  return typeof t2 == "string";
}
function j(t2) {
  return typeof t2 == "bigint";
}
var K = a(p(b));
var O = a(p(b));
var x = (t2) => Object.assign(a(t2), { startsWith: (e2) => {
  return x(d(t2, (n2 = e2, p((t3) => S(t3) && t3.startsWith(n2)))));
  var n2;
}, endsWith: (e2) => {
  return x(d(t2, (n2 = e2, p((t3) => S(t3) && t3.endsWith(n2)))));
  var n2;
}, minLength: (e2) => x(d(t2, ((t3) => p((e3) => S(e3) && e3.length >= t3))(e2))), length: (e2) => x(d(t2, ((t3) => p((e3) => S(e3) && e3.length === t3))(e2))), maxLength: (e2) => x(d(t2, ((t3) => p((e3) => S(e3) && e3.length <= t3))(e2))), includes: (e2) => {
  return x(d(t2, (n2 = e2, p((t3) => S(t3) && t3.includes(n2)))));
  var n2;
}, regex: (e2) => {
  return x(d(t2, (n2 = e2, p((t3) => S(t3) && Boolean(t3.match(n2))))));
  var n2;
} });
var A = x(p(S));
var N = (t2) => Object.assign(a(t2), { between: (e2, n2) => N(d(t2, ((t3, e3) => p((n3) => w(n3) && t3 <= n3 && e3 >= n3))(e2, n2))), lt: (e2) => N(d(t2, ((t3) => p((e3) => w(e3) && e3 < t3))(e2))), gt: (e2) => N(d(t2, ((t3) => p((e3) => w(e3) && e3 > t3))(e2))), lte: (e2) => N(d(t2, ((t3) => p((e3) => w(e3) && e3 <= t3))(e2))), gte: (e2) => N(d(t2, ((t3) => p((e3) => w(e3) && e3 >= t3))(e2))), int: () => N(d(t2, p((t3) => w(t3) && Number.isInteger(t3)))), finite: () => N(d(t2, p((t3) => w(t3) && Number.isFinite(t3)))), positive: () => N(d(t2, p((t3) => w(t3) && t3 > 0))), negative: () => N(d(t2, p((t3) => w(t3) && t3 < 0))) });
var P = N(p(w));
var k = (t2) => Object.assign(a(t2), { between: (e2, n2) => k(d(t2, ((t3, e3) => p((n3) => j(n3) && t3 <= n3 && e3 >= n3))(e2, n2))), lt: (e2) => k(d(t2, ((t3) => p((e3) => j(e3) && e3 < t3))(e2))), gt: (e2) => k(d(t2, ((t3) => p((e3) => j(e3) && e3 > t3))(e2))), lte: (e2) => k(d(t2, ((t3) => p((e3) => j(e3) && e3 <= t3))(e2))), gte: (e2) => k(d(t2, ((t3) => p((e3) => j(e3) && e3 >= t3))(e2))), positive: () => k(d(t2, p((t3) => j(t3) && t3 > 0))), negative: () => k(d(t2, p((t3) => j(t3) && t3 < 0))) });
var T = k(p(j));
var B = a(p(function(t2) {
  return typeof t2 == "boolean";
}));
var _ = a(p(function(t2) {
  return typeof t2 == "symbol";
}));
var W = a(p(function(t2) {
  return t2 == null;
}));
var $ = a(p(function(t2) {
  return t2 != null;
}));
class I extends Error {
  constructor(t2) {
    let e2;
    try {
      e2 = JSON.stringify(t2);
    } catch (n2) {
      e2 = t2;
    }
    super(`Pattern matching error: no pattern matches value ${e2}`), this.input = undefined, this.input = t2;
  }
}
var L = { matched: false, value: undefined };
function M(t2) {
  return new R(t2, L);
}

class R {
  constructor(t2, e2) {
    this.input = undefined, this.state = undefined, this.input = t2, this.state = e2;
  }
  with(...t2) {
    if (this.state.matched)
      return this;
    const e2 = t2[t2.length - 1], r2 = [t2[0]];
    let i2;
    t2.length === 3 && typeof t2[1] == "function" ? i2 = t2[1] : t2.length > 2 && r2.push(...t2.slice(1, t2.length - 1));
    let s2 = false, c2 = {};
    const u = (t3, e3) => {
      s2 = true, c2[t3] = e3;
    }, a2 = !r2.some((t3) => o(t3, this.input, u)) || i2 && !Boolean(i2(this.input)) ? L : { matched: true, value: e2(s2 ? n in c2 ? c2[n] : c2 : this.input, this.input) };
    return new R(this.input, a2);
  }
  when(t2, e2) {
    if (this.state.matched)
      return this;
    const n2 = Boolean(t2(this.input));
    return new R(this.input, n2 ? { matched: true, value: e2(this.input, this.input) } : L);
  }
  otherwise(t2) {
    return this.state.matched ? this.state.value : t2(this.input);
  }
  exhaustive(t2 = F) {
    return this.state.matched ? this.state.value : t2(this.input);
  }
  run() {
    return this.exhaustive();
  }
  returnType() {
    return this;
  }
  narrow() {
    return this;
  }
}
function F(t2) {
  throw new I(t2);
}

// src/broker-client/primitives.ts
var validId = (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
var parseId = (value, name) => typeof value === "string" && validId(value) ? clientOk(value) : clientErr({ code: "invalid-input", message: `${name} is invalid.` });
var parseBrokerRequestId = (value) => parseId(value, "BrokerRequestId");
var parseBrokerAttemptId = (value) => parseId(value, "BrokerAttemptId");
var parseBrokerSequence = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? clientOk(value) : clientErr({ code: "invalid-input", message: "BrokerSequence is invalid." });
var parseBrokerTimestampMs = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? clientOk(value) : clientErr({ code: "invalid-input", message: "BrokerTimestampMs is invalid." });

// src/broker-client/exchange.ts
var BROKER_REQUEST_CANCELLED_CODE = "request-cancelled";
var BROKER_MAX_DISCONNECT_DETAIL_LENGTH = 2048;
var nextSequence = (sequence) => parseBrokerSequence(sequence + 1);
var openBrokerClientExchange = (requestId) => parseBrokerSequence(0).map((nextSequenceValue) => ({
  state: "awaiting-hello",
  requestId,
  nextSequence: nextSequenceValue
}));
var transitionHello = (exchange, message) => nextSequence(message.sequence).map((sequence) => ({
  state: "ready",
  requestId: exchange.requestId,
  nextSequence: sequence
}));
var transitionRequest = (exchange, message) => nextSequence(message.sequence).map((sequence) => ({
  state: "active",
  requestId: exchange.requestId,
  nextSequence: sequence,
  progress: []
}));
var transitionProgress = (exchange, message) => {
  if (exchange.state !== "active" && exchange.state !== "cancellation-requested" || message.messageKind !== "progress") {
    return clientErr({ code: "protocol-mismatch", message: "Progress is not legal in the current broker exchange state." });
  }
  return nextSequence(message.sequence).map((sequence) => ({
    state: exchange.state,
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: [...exchange.progress, message.payload]
  }));
};
var transitionCancel = (exchange, message) => {
  if (exchange.state !== "active") {
    return clientErr({ code: "protocol-mismatch", message: "Cancellation is not legal in the current broker exchange state." });
  }
  return nextSequence(message.sequence).map((sequence) => ({
    state: "cancellation-requested",
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: exchange.progress
  }));
};
var terminalOutcome = (message) => M(message.messageKind).with("terminal-success", () => ({
  outcome: "success",
  code: message.payload.code,
  message: message.payload.message,
  ...message.attemptId === undefined ? {} : { attemptId: message.attemptId }
})).with("terminal-failure", () => message.payload.code === BROKER_REQUEST_CANCELLED_CODE ? {
  outcome: "cancelled",
  code: BROKER_REQUEST_CANCELLED_CODE,
  message: message.payload.message,
  ...message.attemptId === undefined ? {} : { attemptId: message.attemptId }
} : {
  outcome: "failure",
  code: message.payload.code,
  message: message.payload.message,
  ...message.attemptId === undefined ? {} : { attemptId: message.attemptId }
}).with("protocol-error", () => ({
  outcome: "protocol-error",
  code: message.payload.code,
  message: message.payload.message,
  ...message.attemptId === undefined ? {} : { attemptId: message.attemptId }
})).exhaustive();
var isTerminalMessage = (message) => message.messageKind === "terminal-success" || message.messageKind === "terminal-failure" || message.messageKind === "protocol-error";
var transitionTerminal = (exchange, message) => {
  if (exchange.state !== "active" && exchange.state !== "cancellation-requested" || !isTerminalMessage(message)) {
    return clientErr({ code: "protocol-mismatch", message: "A terminal result is not legal in the current broker exchange state." });
  }
  if (exchange.state === "cancellation-requested" && (message.messageKind !== "terminal-failure" || message.payload.code !== BROKER_REQUEST_CANCELLED_CODE)) {
    return clientErr({
      code: "protocol-mismatch",
      message: "Only cleanup-gated cancellation may complete an accepted broker cancellation."
    });
  }
  return nextSequence(message.sequence).map((sequence) => ({
    state: "terminal",
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: exchange.progress,
    terminal: terminalOutcome(message)
  }));
};
var transitionProtocolError = (exchange, message) => {
  if (!isTerminalMessage(message) || message.messageKind !== "protocol-error") {
    return clientErr({ code: "protocol-mismatch", message: "The broker protocol-error result is invalid." });
  }
  const progress = exchange.state === "active" || exchange.state === "cancellation-requested" ? exchange.progress : [];
  return nextSequence(message.sequence).map((sequence) => ({
    state: "terminal",
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress,
    terminal: terminalOutcome(message)
  }));
};
var reduceControlFrame = (exchange, direction, message) => {
  if (message.requestId !== exchange.requestId || message.sequence !== exchange.nextSequence) {
    return clientErr({ code: "sequence-invalid", message: "Broker exchange correlation or sequence is invalid." });
  }
  return M([exchange.state, direction, message.messageKind]).with(["awaiting-hello", "broker-to-client", "hello"], () => transitionHello(exchange, message)).with(["ready", "client-to-broker", "request"], () => transitionRequest(exchange, message)).with(["active", "broker-to-client", "progress"], () => transitionProgress(exchange, message)).with(["active", "client-to-broker", "cancel"], () => transitionCancel(exchange, message)).with(["active", "broker-to-client", "terminal-success"], () => transitionTerminal(exchange, message)).with(["active", "broker-to-client", "terminal-failure"], () => transitionTerminal(exchange, message)).with(["cancellation-requested", "broker-to-client", "terminal-failure"], () => transitionTerminal(exchange, message)).with(["awaiting-hello", "broker-to-client", "protocol-error"], () => transitionProtocolError(exchange, message)).with(["ready", "broker-to-client", "protocol-error"], () => transitionProtocolError(exchange, message)).with(["active", "broker-to-client", "protocol-error"], () => transitionProtocolError(exchange, message)).with(["cancellation-requested", "broker-to-client", "protocol-error"], () => transitionProtocolError(exchange, message)).otherwise(() => clientErr({
    code: "protocol-mismatch",
    message: "Broker control direction or message kind is not legal in the current exchange state."
  }));
};
var reduceInFlightCompletionThatWonCancelRace = (exchange, direction, message) => {
  const completionFrame = message.messageKind === "progress" || message.messageKind === "terminal-success" || message.messageKind === "terminal-failure" || message.messageKind === "protocol-error";
  if (direction !== "broker-to-client" || !completionFrame || message.sequence + 1 !== exchange.nextSequence) {
    return;
  }
  return reduceControlFrame({
    state: "active",
    requestId: exchange.requestId,
    nextSequence: message.sequence,
    progress: exchange.progress
  }, direction, message);
};
var reduceDisconnect = (exchange, event) => {
  if (event.detail.length === 0 || event.detail.length > BROKER_MAX_DISCONNECT_DETAIL_LENGTH) {
    return clientErr({ code: "invalid-input", message: "Broker disconnect detail is invalid." });
  }
  const progress = exchange.state === "active" || exchange.state === "cancellation-requested" ? exchange.progress : [];
  return clientOk({
    state: "terminal",
    requestId: exchange.requestId,
    nextSequence: exchange.nextSequence,
    progress,
    terminal: { outcome: "disconnected", reason: event.reason, detail: event.detail }
  });
};
var reduceBrokerClientExchange = (exchange, event) => {
  if (exchange.state === "terminal") {
    return clientErr({ code: "session-closed", message: "Broker exchange already has its single terminal outcome." });
  }
  if (event.eventKind === "control" && exchange.state === "cancellation-requested") {
    const raced = reduceInFlightCompletionThatWonCancelRace(exchange, event.direction, event.message);
    if (raced !== undefined)
      return raced;
  }
  return event.eventKind === "disconnect" ? reduceDisconnect(exchange, event) : reduceControlFrame(exchange, event.direction, event.message);
};

// node_modules/zod/v4/core/core.js
var _a;
function $constructor(name, initializer, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _2,
          traits: new Set
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    const proto = _2.prototype;
    const keys = Object.keys(proto);
    for (let i2 = 0;i2 < keys.length; i2++) {
      const k2 = keys[i2];
      if (!(k2 in inst)) {
        inst[k2] = proto[k2].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _2(def) {
    var _a2;
    const inst = params?.Parent ? new Definition : this;
    init(inst, def);
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_2, "init", { value: init });
  Object.defineProperty(_2, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_2, "name", { value: name });
  return _2;
}
var $brand = Symbol("zod_brand");

class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/zod/v4/core/util.js
var exports_util = {};
__export(exports_util, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  slugify: () => slugify,
  stringifyPrimitive: () => stringifyPrimitive,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_2) {}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v2) => typeof v2 === "number");
  const values = Object.entries(entries).filter(([k2, _2]) => numericValues.indexOf(+k2) === -1).map(([_2, v2]) => v2);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_2, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v2) {
      Object.defineProperty(object, key, {
        value: v2
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i2 = 0;i2 < keys.length; i2++) {
      resolvedObj[keys[i2]] = results[i2];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i2 = 0;i2 < length; i2++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F2 = Function;
    new F2("");
    return true;
  } catch (_2) {
    return false;
  }
});
function isPlainObject(o2) {
  if (isObject(o2) === false)
    return false;
  const ctor = o2.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o2) {
  if (isPlainObject(o2))
    return { ...o2 };
  if (Array.isArray(o2))
    return [...o2];
  if (o2 instanceof Map)
    return new Map(o2);
  if (o2 instanceof Set)
    return new Set(o2);
  return o2;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t2 = typeof data;
  switch (t2) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t2}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined"
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_2, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_2, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_2, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_2, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_2) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_2, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_2, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k2) => {
    return shape[k2]._zod.optin === "optional" && shape[k2]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a2, b2) {
  if (a2._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a2._zod.def, {
    get shape() {
      const _shape = { ...a2._zod.def.shape, ...b2._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b2._zod.def.catchall;
    },
    checks: b2._zod.def.checks ?? []
  });
  return clone(a2, def);
}
function partial(Class, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x2, startIndex = 0) {
  if (x2.aborted === true)
    return true;
  for (let i2 = startIndex;i2 < x2.issues.length; i2++) {
    if (x2.issues[i2]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x2, startIndex = 0) {
  if (x2.aborted === true)
    return true;
  for (let i2 = startIndex;i2 < x2.issues.length; i2++) {
    if (x2.issues[i2]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t2 = typeof data;
  switch (t2) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t2;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k2, _2]) => {
    return Number.isNaN(Number.parseInt(k2, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i2 = 0;i2 < binaryString.length; i2++) {
    bytes[i2] = binaryString.charCodeAt(i2);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i2 = 0;i2 < bytes.length; i2++) {
    binaryString += String.fromCharCode(bytes[i2]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i2 = 0;i2 < cleanHex.length; i2 += 2) {
    bytes[i2 / 2] = Number.parseInt(cleanHex.slice(i2, i2 + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b2) => b2.toString(16).padStart(2, "0")).join("");
}

class Class {
  constructor(..._args) {}
}

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error2, path = []) => {
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i2 = 0;
          while (i2 < fullpath.length) {
            const el = fullpath[i2];
            const terminal = i2 === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i2++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  if (result.issues.length) {
    const e2 = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e2, _params?.callee);
    throw e2;
  }
  return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e2 = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e2, params?.callee);
    throw e2;
  }
  return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
// node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time2 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time2}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a2;
    (_a2 = inst2._zod.bag).multipleOf ?? (_a2.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a2, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x2) => x2);
    const minIndent = Math.min(...lines.map((x2) => x2.length - x2.trimStart().length));
    const dedented = lines.map((x2) => x2.slice(minIndent)).map((x2) => " ".repeat(this.indent * 2) + x2);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F2 = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x2) => `  ${x2}`)];
    return new F2(...args, lines.join(`
`));
  }
}

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _2 = ch._zod.check(payload);
        if (_2 instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _2 instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _2;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r2 = safeParse(inst, value);
        return r2.success ? { value: r2.data } : { issues: r2.error?.issues };
      } catch (_2) {
        return safeParseAsync(inst, value).then((r2) => r2.success ? { value: r2.data } : { issues: r2.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _2) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_3) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v2 = versionMap[def.version];
    if (v2 === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v2));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_2) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error;
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error;
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error;
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error;
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c2) => c2 === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_2) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i2 = 0;i2 < input.length; i2++) {
      const item = input[i2];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i2)));
      } else {
        handleArrayResult(result, payload, i2);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k2 of keys) {
    if (!def.shape?.[k2]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k2}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t2 = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t2 === "never") {
      unrecognized.push(key);
      continue;
    }
    const r2 = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r2 instanceof Promise) {
      proms.push(r2.then((r3) => handlePropertyResult(r3, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = new Set);
        for (const v2 of field.values)
          propValues[key].add(v2);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r2 = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r2 instanceof Promise) {
        proms.push(r2.then((r3) => handlePropertyResult(r3, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k2 = esc(key);
      return `shape[${k2}]._zod.run({ value: input[${k2}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k2 = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k2} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k2}, ...iss.path] : [${k2}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k2} in input) {
            newResult[${k2}] = undefined;
          }
        } else {
          newResult[${k2}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k2} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k2}, ...iss.path] : [${k2}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k2}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k2}] = undefined;
          } else {
            newResult[${k2}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k2}, ...iss.path] : [${k2}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k2} in input) {
            newResult[${k2}] = undefined;
          }
        } else {
          newResult[${k2}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r2) => !aborted(r2));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o2) => o2._zod.optin === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "optout", () => def.options.some((o2) => o2._zod.optout === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o2) => o2._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o2) => o2._zod.pattern)) {
      const patterns = def.options.map((o2) => o2._zod.pattern);
      return new RegExp(`^(${patterns.map((p2) => cleanRegex(p2.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k2, v2] of Object.entries(pv)) {
        if (!propValues[k2])
          propValues[k2] = new Set;
        for (const val of v2) {
          propValues[k2].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map = new Map;
    for (const o2 of opts) {
      const values = o2._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o2)}"`);
      for (const v2 of values) {
        if (map.has(v2)) {
          throw new Error(`Duplicate discriminator value "${String(v2)}"`);
        }
        map.set(v2, o2);
      }
    }
    return map;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a2, b2) {
  if (a2 === b2) {
    return { valid: true, data: a2 };
  }
  if (a2 instanceof Date && b2 instanceof Date && +a2 === +b2) {
    return { valid: true, data: a2 };
  }
  if (isPlainObject(a2) && isPlainObject(b2)) {
    const bKeys = Object.keys(b2);
    const sharedKeys = Object.keys(a2).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a2, ...b2 };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a2[key], b2[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a2) && Array.isArray(b2)) {
    if (a2.length !== b2.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a2.length; index++) {
      const itemA = a2[index];
      const itemB = b2[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k2 of iss.keys) {
        if (!unrecKeys.has(k2))
          unrecKeys.set(k2, {});
        unrecKeys.get(k2).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k2 of iss.keys) {
        if (!unrecKeys.has(k2))
          unrecKeys.set(k2, {});
        unrecKeys.get(k2).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k2]) => k2);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k2) => propertyKeyTypes.has(typeof k2)).map((o2) => typeof o2 === "string" ? escapeRegex(o2) : o2.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o2) => typeof o2 === "string" ? escapeRegex(o2) : o2 ? escapeRegex(o2.toString()) : String(o2)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === undefined && (result.issues.length || result.fallback)) {
    return { issues: [], value: undefined };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r2) => handleOptionalResult(r2, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === undefined) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v2 = def.innerType._zod.values;
    return v2 ? new Set([...v2].filter((x2) => x2 !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _2) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r2 = def.fn(input);
    if (r2 instanceof Promise) {
      return r2.then((r3) => handleRefineResult(r3, payload, input, inst));
    }
    handleRefineResult(r2, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/zod/v4/core/registries.js
var _a2;
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");

class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p2 = schema._zod.parent;
    if (p2) {
      const pm = { ...this.get(p2) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/zod/v4/core/api.js
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? undefined
  };
}
function process2(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process2(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    Object.assign(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time") {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else
    json.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json.multipleOf = multipleOf;
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v2) => typeof v2 === "number"))
    json.type = "number";
  if (values.every((v2) => typeof v2 === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v2) => typeof v2 === "number"))
      json.type = "number";
    if (vals.every((v2) => typeof v2 === "string"))
      json.type = "string";
    if (vals.every((v2) => typeof v2 === "boolean"))
      json.type = "boolean";
    if (vals.every((v2) => v2 === null))
      json.type = "null";
    json.enum = vals;
  }
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = process2(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  json.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json.properties[key] = process2(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v2 = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v2.optin === undefined;
    } else {
      return v2.optout === undefined;
    }
  }));
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process2(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x2, i2) => process2(x2, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i2]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a2 = process2(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b2 = process2(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a2) ? a2.allOf : [a2],
    ...isSimpleIntersection(b2) ? b2.allOf : [b2]
  ];
  json.allOf = allOf;
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
// node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
    }
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap;
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = new Set;
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v2) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v2
        });
      }
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse3(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(exports_util.mergeDefs(def2, {
        checks: [
          ...def2.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta2) {
      reg.add(this, meta2);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d2) {
      return _default(this, d2);
    },
    prefault(d2) {
      return prefault(this, d2);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(undefined).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n2, params) {
      return this.check(_minLength(n2, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n2, params) {
      return this.check(_maxLength(n2, params));
    },
    length(n2, params) {
      return this.check(_length(n2, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  exports_util.defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: undefined });
    },
    extend(incoming) {
      return exports_util.extend(this, incoming);
    },
    safeExtend(incoming) {
      return exports_util.safeExtend(this, incoming);
    },
    merge(other) {
      return exports_util.merge(this, other);
    },
    pick(mask) {
      return exports_util.pick(this, mask);
    },
    omit(mask) {
      return exports_util.omit(this, mask);
    },
    partial(...args) {
      return exports_util.partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return exports_util.required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...exports_util.normalizeParams(params)
  };
  return new ZodObject(def);
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...exports_util.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...exports_util.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v2) => [v2, v2])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...exports_util.normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(exports_util.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(exports_util.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}

// src/broker-client/ipc.ts
var BROKER_PROTOCOL_VERSION = 1;
var BROKER_MAX_MESSAGE_BYTES = 64 * 1024;
var BROKER_MAX_OUTPUT_CHUNK_BYTES = 16 * 1024;
var idSchema = string2().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
var baseSchema = object({
  protocolVersion: literal(BROKER_PROTOCOL_VERSION),
  requestId: idSchema,
  sequence: number2().int().nonnegative().safe(),
  sentAtMs: number2().int().nonnegative().safe(),
  attemptId: idSchema.optional()
}).strict();
var authorityHintShape = {
  repositoryPathHint: string2().min(1).max(4096).optional(),
  recipePathHint: string2().min(1).max(1024).optional(),
  recipeRevision: string2().min(1).max(256).optional(),
  credentialSlotIds: array(string2().min(1).max(128)).max(64)
};
var executeRecipeRequestPayloadSchema = object({
  ...authorityHintShape,
  operation: literal("execute-recipe"),
  grantIdHint: string2().min(1).max(128).refine((value) => !value.includes("\x00"))
}).strict();
var nonExecuteRequestPayloadSchema = object({
  ...authorityHintShape,
  operation: _enum(["status", "cancel", "grant", "revoke", "export-car", "import-car", "doctor"])
}).strict();
var requestPayloadSchema = discriminatedUnion("operation", [
  executeRecipeRequestPayloadSchema,
  nonExecuteRequestPayloadSchema
]);
var wireSchema = discriminatedUnion("messageKind", [
  baseSchema.extend({
    messageKind: literal("hello"),
    payload: object({
      buildId: string2().min(1).max(128),
      capabilities: array(string2().min(1).max(128)).max(64)
    }).strict()
  }).strict(),
  baseSchema.extend({ messageKind: literal("request"), payload: requestPayloadSchema }).strict(),
  baseSchema.extend({
    messageKind: literal("cancel"),
    payload: object({ expectedGeneration: number2().int().nonnegative().safe() }).strict()
  }).strict(),
  baseSchema.extend({
    messageKind: literal("progress"),
    payload: object({ phase: string2().min(1).max(128), detail: string2().max(2048) }).strict()
  }).strict(),
  baseSchema.extend({
    messageKind: _enum(["terminal-success", "terminal-failure", "protocol-error"]),
    payload: object({ code: string2().min(1).max(128), message: string2().max(2048) }).strict()
  }).strict()
]);
var decodeBase = (wire) => parseBrokerRequestId(wire.requestId).andThen((requestId) => parseBrokerSequence(wire.sequence).andThen((sequence) => parseBrokerTimestampMs(wire.sentAtMs).andThen((sentAtMs) => {
  const attempt = wire.attemptId === undefined ? clientOk(undefined) : parseBrokerAttemptId(wire.attemptId);
  return attempt.map((attemptId) => ({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    requestId,
    sequence,
    sentAtMs,
    ...attemptId === undefined ? {} : { attemptId }
  }));
})));
var projectWire = (wire, base) => {
  switch (wire.messageKind) {
    case "hello":
      return { ...base, messageKind: wire.messageKind, payload: { buildId: wire.payload.buildId, capabilities: wire.payload.capabilities } };
    case "request":
      return {
        ...base,
        messageKind: wire.messageKind,
        payload: wire.payload.operation === "execute-recipe" ? {
          operation: wire.payload.operation,
          grantIdHint: wire.payload.grantIdHint,
          credentialSlotIds: wire.payload.credentialSlotIds,
          ...wire.payload.repositoryPathHint === undefined ? {} : { repositoryPathHint: wire.payload.repositoryPathHint },
          ...wire.payload.recipePathHint === undefined ? {} : { recipePathHint: wire.payload.recipePathHint },
          ...wire.payload.recipeRevision === undefined ? {} : { recipeRevision: wire.payload.recipeRevision }
        } : {
          operation: wire.payload.operation,
          credentialSlotIds: wire.payload.credentialSlotIds,
          ...wire.payload.repositoryPathHint === undefined ? {} : { repositoryPathHint: wire.payload.repositoryPathHint },
          ...wire.payload.recipePathHint === undefined ? {} : { recipePathHint: wire.payload.recipePathHint },
          ...wire.payload.recipeRevision === undefined ? {} : { recipeRevision: wire.payload.recipeRevision }
        }
      };
    case "cancel":
      return { ...base, messageKind: wire.messageKind, payload: { expectedGeneration: wire.payload.expectedGeneration } };
    case "progress":
      return { ...base, messageKind: wire.messageKind, payload: { phase: wire.payload.phase, detail: wire.payload.detail } };
    case "terminal-success":
    case "terminal-failure":
    case "protocol-error":
      return { ...base, messageKind: wire.messageKind, payload: { code: wire.payload.code, message: wire.payload.message } };
  }
};
var decodeBrokerControlMessage = (input) => {
  const parsed = wireSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return clientErr({
      code: "invalid-input",
      message: "Broker control message is invalid.",
      ...first === undefined ? {} : { path: first.path.map((part) => typeof part === "symbol" ? String(part) : part) }
    });
  }
  return decodeBase(parsed.data).map((base) => projectWire(parsed.data, base));
};
var encodeBrokerControlMessage = (message) => {
  const decoded = decodeBrokerControlMessage(message);
  if (decoded.isErr())
    return clientErr(...decoded.error);
  const json = JSON.stringify(message);
  return new TextEncoder().encode(json).byteLength <= BROKER_MAX_MESSAGE_BYTES ? clientOk(json) : clientErr({ code: "message-too-large", message: "Broker control message exceeds its byte budget." });
};
var decodeBrokerControlJson = (json) => {
  if (new TextEncoder().encode(json).byteLength > BROKER_MAX_MESSAGE_BYTES) {
    return clientErr({ code: "message-too-large", message: "Broker control message exceeds its byte budget." });
  }
  return clientTry(() => JSON.parse(json), { code: "invalid-input", message: "Broker control message is not valid JSON." }).andThen(decodeBrokerControlMessage);
};

// src/broker-client/inherited-ipc.ts
var BROKER_IPC_CHILD_ARGUMENT = "--nebular-ipc-child";
var BROKER_DEFAULT_OPERATION_TIMEOUT_MS = 30000;
var BROKER_MAX_OPERATION_TIMEOUT_MS = 5 * 60000;
var BROKER_DEFAULT_CLEANUP_GRACE_MS = 5000;
var BROKER_MAX_CLEANUP_GRACE_MS = 60000;
var BROKER_INHERITED_IPC_GENERATION = 0;
var validPath2 = (value, maximumLength) => value.length > 0 && value.length <= maximumLength && !value.includes("\x00");
var operationTimeout = (value) => {
  const timeoutMs = value ?? BROKER_DEFAULT_OPERATION_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_MAX_OPERATION_TIMEOUT_MS ? clientOk(timeoutMs) : clientErr({ code: "invalid-input", message: "Broker operation timeout is invalid." });
};
var cleanupGrace = (value) => {
  const cleanupGraceMs = value ?? BROKER_DEFAULT_CLEANUP_GRACE_MS;
  return Number.isSafeInteger(cleanupGraceMs) && cleanupGraceMs > 0 && cleanupGraceMs <= BROKER_MAX_CLEANUP_GRACE_MS ? clientOk(cleanupGraceMs) : clientErr({ code: "invalid-input", message: "Broker cleanup grace is invalid." });
};
var requestMessage2 = (exchange, payload, nowMs) => parseBrokerTimestampMs(nowMs).andThen((sentAtMs) => decodeBrokerControlMessage({
  protocolVersion: BROKER_PROTOCOL_VERSION,
  messageKind: "request",
  requestId: exchange.requestId,
  sequence: exchange.nextSequence,
  sentAtMs,
  payload
}).andThen((message) => message.messageKind === "request" ? clientOk(message) : clientErr({ code: "protocol-mismatch", message: "Broker request projection produced the wrong message kind." })));
var cancelMessage = (exchange, nowMs) => parseBrokerTimestampMs(nowMs).andThen((sentAtMs) => decodeBrokerControlMessage({
  protocolVersion: BROKER_PROTOCOL_VERSION,
  messageKind: "cancel",
  requestId: exchange.requestId,
  sequence: exchange.nextSequence,
  sentAtMs,
  payload: { expectedGeneration: BROKER_INHERITED_IPC_GENERATION }
}).andThen((message) => message.messageKind === "cancel" ? clientOk(message) : clientErr({ code: "protocol-mismatch", message: "Broker cancel projection produced the wrong message kind." })));
var terminalReceipt = (state) => {
  const terminal = state.terminal;
  const exitCode = state.exitCode;
  if (terminal === undefined || exitCode === undefined) {
    return clientErr({ code: "transport-unavailable", message: "Broker IPC did not reach a terminal exit." });
  }
  if (terminal.terminal.outcome === "success" && exitCode !== 0) {
    return clientErr({ code: "transport-unavailable", message: "Broker helper exited unsuccessfully after reporting success." });
  }
  return clientOk({
    requestId: terminal.requestId,
    progress: terminal.progress,
    terminal: terminal.terminal,
    helperExitCode: exitCode
  });
};
var executeExchange2 = (input, runtime, timeoutMs, cleanupGraceMs, requestId, initial) => new Promise((resolve) => {
  let state = { exchange: initial, disconnected: false };
  let settled = false;
  let cleanupTimer;
  const peerCell = {};
  const clearTimers = () => {
    clearTimeout(operationTimer);
    if (cleanupTimer !== undefined)
      clearTimeout(cleanupTimer);
  };
  const settle = (result) => {
    if (settled)
      return;
    settled = true;
    clearTimers();
    resolve(result);
  };
  const settleIfComplete = () => {
    if (state.terminal !== undefined && state.exitCode !== undefined)
      settle(terminalReceipt(state));
  };
  const fail = (issues) => {
    peerCell.current?.terminate();
    settle(clientErr(...issues));
  };
  const beginCleanupGrace = () => {
    if (settled || cleanupTimer !== undefined)
      return;
    cleanupTimer = setTimeout(() => {
      peerCell.current?.terminate();
      settle(clientErr({
        code: "transport-unavailable",
        message: "Broker IPC cancellation cleanup exceeded its bounded grace."
      }));
    }, cleanupGraceMs);
  };
  const advance = (message) => reduceBrokerClientExchange(state.exchange, {
    eventKind: "control",
    direction: "broker-to-client",
    message
  });
  const sendRequest = (ready, target) => {
    const prepared = requestMessage2(ready, input.payload, runtime.nowMs());
    if (prepared.isErr())
      return fail(prepared.error);
    const active = reduceBrokerClientExchange(ready, {
      eventKind: "control",
      direction: "client-to-broker",
      message: prepared.value
    });
    if (active.isErr())
      return fail(active.error);
    state = { ...state, exchange: active.value };
    const sent = target.send(prepared.value);
    if (sent.isErr())
      return fail(sent.error);
  };
  const requestCancellation = (active) => {
    const prepared = cancelMessage(active, runtime.nowMs());
    if (prepared.isErr())
      return fail(prepared.error);
    const cancelling = reduceBrokerClientExchange(active, {
      eventKind: "control",
      direction: "client-to-broker",
      message: prepared.value
    });
    if (cancelling.isErr())
      return fail(cancelling.error);
    state = { ...state, exchange: cancelling.value };
    const sent = peerCell.current?.send(prepared.value);
    if (sent === undefined) {
      fail([{ code: "transport-unavailable", message: "Broker IPC helper was unavailable for cancellation." }]);
      return;
    }
    if (sent.isErr())
      return fail(sent.error);
    beginCleanupGrace();
  };
  const observer = {
    onMessage: (wire, target) => {
      if (settled)
        return;
      const decoded = decodeBrokerControlMessage(wire);
      if (decoded.isErr())
        return fail(decoded.error);
      const advanced = advance(decoded.value);
      if (advanced.isErr())
        return fail(advanced.error);
      state = {
        ...state,
        exchange: advanced.value,
        ...advanced.value.state === "terminal" ? { terminal: advanced.value } : {}
      };
      if (advanced.value.state === "ready")
        sendRequest(advanced.value, target);
      settleIfComplete();
    },
    onDisconnect: () => {
      state = { ...state, disconnected: true };
    },
    onExit: (exitCode) => {
      state = { ...state, exitCode };
      queueMicrotask(() => {
        if (state.terminal === undefined) {
          settle(clientErr({
            code: "transport-unavailable",
            message: state.disconnected ? `Broker IPC disconnected before a terminal result while ${state.exchange.state}.` : `Broker helper exited before a terminal result while ${state.exchange.state}.`
          }));
          return;
        }
        settleIfComplete();
      });
    }
  };
  const operationTimer = setTimeout(() => {
    if (settled)
      return;
    if (state.exchange.state === "active") {
      requestCancellation(state.exchange);
      return;
    }
    if (state.exchange.state === "cancellation-requested" || state.exchange.state === "terminal") {
      beginCleanupGrace();
      return;
    }
    fail([{
      code: "transport-unavailable",
      message: "Broker IPC operation exceeded its bounded deadline before activation."
    }]);
  }, timeoutMs);
  const spawned = runtime.spawn({ brokerEntrypoint: input.brokerEntrypoint, cwd: input.cwd, requestId }, observer);
  if (spawned.isErr()) {
    settle(clientErr(...spawned.error));
    return;
  }
  peerCell.current = spawned.value;
});
var runBrokerControlOverInheritedIpc = (input, runtime) => {
  if (!validPath2(input.brokerEntrypoint, 4096) || !validPath2(input.cwd, 4096)) {
    return ResultAsync.fromSafePromise(Promise.resolve(clientErr({
      code: "invalid-input",
      message: "Broker entrypoint or working directory is invalid."
    }))).andThen((result) => result);
  }
  const prepared = operationTimeout(input.timeoutMs).andThen((timeoutMs) => cleanupGrace(input.cleanupGraceMs).andThen((cleanupGraceMs) => parseBrokerRequestId(runtime.newRequestId()).map((requestId) => ({
    timeoutMs,
    cleanupGraceMs,
    requestId
  })))).andThen(({ timeoutMs, cleanupGraceMs, requestId }) => openBrokerClientExchange(requestId).map((initial) => ({
    timeoutMs,
    cleanupGraceMs,
    requestId,
    initial
  })));
  return prepared.isErr() ? ResultAsync.fromSafePromise(Promise.resolve(clientErr(...prepared.error))).andThen((result) => result) : ResultAsync.fromSafePromise(executeExchange2(input, runtime, prepared.value.timeoutMs, prepared.value.cleanupGraceMs, prepared.value.requestId, prepared.value.initial)).andThen((result) => result);
};
var allowedEnvironmentNames = [
  "APPDATA",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "PM2_HOME",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR"
];
var brokerHelperEnvironment = () => Object.fromEntries(allowedEnvironmentNames.flatMap((name) => {
  const value = process.env[name];
  return value === undefined || value.includes("\x00") ? [] : [[name, value]];
}));
var createBunInheritedIpcRuntime = () => ({
  nowMs: () => Date.now(),
  newRequestId: () => crypto.randomUUID(),
  spawn: (plan, observer) => clientTry(() => {
    const subprocess = Bun.spawn({
      cmd: [process.execPath, plan.brokerEntrypoint, BROKER_IPC_CHILD_ARGUMENT, plan.requestId],
      cwd: plan.cwd,
      env: brokerHelperEnvironment(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      serialization: "json",
      ipc: (message, child) => observer.onMessage(message, {
        send: (outbound) => clientTry(() => child.send(outbound), { code: "transport-unavailable", message: "Broker IPC send failed." }).map(() => {
          return;
        }),
        disconnect: () => child.disconnect(),
        terminate: () => child.kill()
      }),
      onDisconnect: () => observer.onDisconnect(),
      onExit: (_child, exitCode) => observer.onExit(exitCode ?? 1)
    });
    return {
      send: (outbound) => clientTry(() => subprocess.send(outbound), { code: "transport-unavailable", message: "Broker IPC send failed." }).map(() => {
        return;
      }),
      disconnect: () => subprocess.disconnect(),
      terminate: () => subprocess.kill()
    };
  }, { code: "transport-unavailable", message: "Broker IPC helper could not be started." })
});

// src/broker-client/session.ts
var advanceOpen = (session, message, state) => parseBrokerSequence(message.sequence + 1).map((nextSequence2) => ({
  ...session,
  state,
  nextSequence: nextSequence2
}));
var advanceTerminal = (session, message, succeeded) => parseBrokerSequence(message.sequence + 1).map((nextSequence2) => ({
  state: "terminal",
  requestId: session.requestId,
  nextSequence: nextSequence2,
  succeeded
}));
var reduceBrokerClientSession = (session, message) => {
  if (message.requestId !== session.requestId || message.sequence !== session.nextSequence) {
    return clientErr({ code: "sequence-invalid", message: "Broker message correlation or sequence is invalid." });
  }
  if (session.state === "terminal")
    return clientErr({ code: "session-closed", message: "Broker session is already terminal." });
  return M([session.state, message.messageKind]).with(["awaiting-hello", "hello"], () => advanceOpen(session, message, "ready")).with(["ready", "request"], () => advanceOpen(session, message, "active")).with(["active", "progress"], () => advanceOpen(session, message, "active")).with(["active", "terminal-success"], () => advanceTerminal(session, message, true)).with(["active", "terminal-failure"], ["active", "protocol-error"], () => advanceTerminal(session, message, false)).otherwise(() => clientErr({ code: "protocol-mismatch", message: "Broker message is not legal in the current session state." }));
};
export {
  BOOTSTRAP_NOT_READY_MAXIMUM_ATTEMPTS,
  BOOTSTRAP_NOT_READY_MAXIMUM_DELAY_MS,
  BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES,
  BROKER_BOOTSTRAP_BUILD_ID,
  BROKER_BOOTSTRAP_CHILD_ARGUMENT,
  BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS,
  BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES,
  BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS,
  BROKER_BOOTSTRAP_MAX_SLOTS,
  BROKER_BOOTSTRAP_MAX_TIMEOUT_MS,
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  BROKER_DEFAULT_CLEANUP_GRACE_MS,
  BROKER_DEFAULT_OPERATION_TIMEOUT_MS,
  BROKER_INHERITED_IPC_GENERATION,
  BROKER_IPC_CHILD_ARGUMENT,
  BROKER_MAX_CLEANUP_GRACE_MS,
  BROKER_MAX_DISCONNECT_DETAIL_LENGTH,
  BROKER_MAX_MESSAGE_BYTES,
  BROKER_MAX_OPERATION_TIMEOUT_MS,
  BROKER_MAX_OUTPUT_CHUNK_BYTES,
  BROKER_PROTOCOL_VERSION,
  BROKER_REQUEST_CANCELLED_CODE,
  MANAGED_ATTEMPT_ENVIRONMENT,
  MANAGED_BUN_RECIPE_BROKER_ENTRYPOINT_ENVIRONMENT,
  MANAGED_BUN_RECIPE_DEFAULT_RETRY_POLICY,
  MANAGED_WINDOWS_JOB_ENVIRONMENT,
  bunProcessEnvironmentNames,
  clientErr,
  clientOk,
  clientTaskErr,
  clientTaskOk,
  clientTry,
  clientTryAsync,
  createBootstrapAcknowledgement,
  createBootstrapNotReadyRetryPort,
  createBootstrapRequest,
  createBunBootstrapInheritedIpcRuntime,
  createBunCooperativeBootstrapTransportPort,
  createBunInheritedIpcRuntime,
  createBunManagedAttemptEnvironmentPort,
  createBunManagedWindowsJobFirstEffectGate,
  createBunManagedWindowsJobNativePort,
  createBunProcessEnvironmentInstallPort,
  createBunProcessEnvironmentRuntime,
  createManagedBootstrapRequest,
  createManagedBunRecipeBootstrapRuntime,
  createManagedWindowsJobFirstEffectGate,
  decodeBootstrapProtocolJson,
  decodeBootstrapProtocolMessage,
  decodeBrokerControlJson,
  decodeBrokerControlMessage,
  encodeBrokerControlMessage,
  isBootstrapResponseMessage,
  openBrokerClientExchange,
  parseBrokerAttemptId,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  planBootstrapEnvironmentPatch,
  prepareManagedBunRecipeEnvironmentThenImport,
  prepareRecipeEnvironment,
  prepareRecipeEnvironmentThenImport,
  prepareRecipeEnvironmentThenImportWithRetry,
  prepareRecipeEnvironmentWithRetry,
  readManagedWindowsJobFirstEffectIdentity,
  reduceBrokerClientExchange,
  reduceBrokerClientSession,
  runBrokerControlOverInheritedIpc
};
