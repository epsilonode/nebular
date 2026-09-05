var __create = Object.create;
var { getPrototypeOf: __getProtoOf, defineProperty: __defProp, getOwnPropertyNames: __getOwnPropNames } = Object;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node, __toESMCache_esm, __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= /* @__PURE__ */ new WeakMap : __toESMCache_esm ??= /* @__PURE__ */ new WeakMap, cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  let to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: !0
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
      enumerable: !0,
      configurable: !0,
      set: __exportSetter.bind(all, name)
    });
};

// node_modules/varint/encode.js
var require_encode = __commonJS(function(exports, module) {
  module.exports = encode5;
  var MSB2 = 128, REST2 = 127, MSBALL2 = ~REST2, INT2 = Math.pow(2, 31);
  function encode5(num, out, offset) {
    if (Number.MAX_SAFE_INTEGER && num > Number.MAX_SAFE_INTEGER)
      throw encode5.bytes = 0, RangeError("Could not encode varint");
    out = out || [], offset = offset || 0;
    var oldOffset = offset;
    while (num >= INT2)
      out[offset++] = num & 255 | MSB2, num /= 128;
    while (num & MSBALL2)
      out[offset++] = num & 255 | MSB2, num >>>= 7;
    return out[offset] = num | 0, encode5.bytes = offset - oldOffset + 1, out;
  }
});

// node_modules/varint/decode.js
var require_decode = __commonJS(function(exports, module) {
  module.exports = read2;
  var MSB2 = 128, REST2 = 127;
  function read2(buf, offset) {
    var res = 0, offset = offset || 0, shift = 0, counter = offset, b, l = buf.length;
    do {
      if (counter >= l || shift > 49)
        throw read2.bytes = 0, RangeError("Could not decode varint");
      b = buf[counter++], res += shift < 28 ? (b & REST2) << shift : (b & REST2) * Math.pow(2, shift), shift += 7;
    } while (b >= MSB2);
    return read2.bytes = counter - offset, res;
  }
});

// node_modules/varint/length.js
var require_length = __commonJS(function(exports, module) {
  var N12 = Math.pow(2, 7), N22 = Math.pow(2, 14), N32 = Math.pow(2, 21), N42 = Math.pow(2, 28), N52 = Math.pow(2, 35), N62 = Math.pow(2, 42), N72 = Math.pow(2, 49), N82 = Math.pow(2, 56), N92 = Math.pow(2, 63);
  module.exports = function(value) {
    return value < N12 ? 1 : value < N22 ? 2 : value < N32 ? 3 : value < N42 ? 4 : value < N52 ? 5 : value < N62 ? 6 : value < N72 ? 7 : value < N82 ? 8 : value < N92 ? 9 : 10;
  };
});

// node_modules/varint/index.js
var require_varint = __commonJS(function(exports, module) {
  module.exports = {
    encode: require_encode(),
    decode: require_decode(),
    encodingLength: require_length()
  };
});

// node_modules/cborg/lib/is.js
var objectTypeNames = [
  "Object",
  "RegExp",
  "Date",
  "Error",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Promise",
  "URL",
  "HTMLElement",
  "Int8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Tagged"
];
function is(value) {
  if (value === null)
    return "null";
  if (value === void 0)
    return "undefined";
  if (value === !0 || value === !1)
    return "boolean";
  let typeOf = typeof value;
  if (typeOf === "string" || typeOf === "number" || typeOf === "bigint" || typeOf === "symbol")
    return typeOf;
  if (typeOf === "function")
    return "Function";
  if (Array.isArray(value))
    return "Array";
  if (value instanceof Uint8Array)
    return "Uint8Array";
  if (value.constructor === Object)
    return "Object";
  let objectType = getObjectType(value);
  if (objectType)
    return objectType;
  return "Object";
}
function getObjectType(value) {
  let objectTypeName = Object.prototype.toString.call(value).slice(8, -1);
  if (objectTypeNames.includes(objectTypeName))
    return objectTypeName;
  return;
}

// node_modules/cborg/lib/token.js
class Type {
  constructor(major, name, terminal) {
    this.major = major, this.majorEncoded = major << 5, this.name = name, this.terminal = terminal;
  }
  toString() {
    return `Type[${this.major}].${this.name}`;
  }
  compare(typ) {
    return this.major < typ.major ? -1 : this.major > typ.major ? 1 : 0;
  }
  static equals(a, b) {
    return a === b || a.major === b.major && a.name === b.name;
  }
}
Type.uint = new Type(0, "uint", !0);
Type.negint = new Type(1, "negint", !0);
Type.bytes = new Type(2, "bytes", !0);
Type.string = new Type(3, "string", !0);
Type.array = new Type(4, "array", !1);
Type.map = new Type(5, "map", !1);
Type.tag = new Type(6, "tag", !1);
Type.float = new Type(7, "float", !0);
Type.false = new Type(7, "false", !0);
Type.true = new Type(7, "true", !0);
Type.null = new Type(7, "null", !0);
Type.undefined = new Type(7, "undefined", !0);
Type.break = new Type(7, "break", !0);

class Token {
  constructor(type, value, encodedLength) {
    this.type = type, this.value = value, this.encodedLength = encodedLength, this.encodedBytes = void 0, this.byteValue = void 0;
  }
  toString() {
    return `Token[${this.type}].${this.value}`;
  }
}

// node_modules/cborg/lib/byte-utils.js
var textEncoder = /* @__PURE__ */ new TextEncoder;
function isBuffer(buf) {
  return;
}
function asU8A(buf) {
  if (!(buf instanceof Uint8Array))
    return Uint8Array.from(buf);
  return isBuffer(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf;
}
var FROM_STRING_THRESHOLD_TEXTENCODER = 200, fromString = (string) => string.length >= FROM_STRING_THRESHOLD_TEXTENCODER ? textEncoder.encode(string) : utf8ToBytes(string), fromArray = (arr) => Uint8Array.from(arr), slice = (bytes, start, end) => bytes.slice(start, end), concat = (chunks, length) => {
  let out = new Uint8Array(length), off = 0;
  for (let b of chunks) {
    if (off + b.length > out.length)
      b = b.subarray(0, out.length - off);
    out.set(b, off), off += b.length;
  }
  return out;
}, alloc = (size) => new Uint8Array(size);
function compare(b1, b2) {
  if (isBuffer(b1) && isBuffer(b2))
    return b1.compare(b2);
  for (let i = 0;i < b1.length; i++) {
    if (b1[i] === b2[i])
      continue;
    return b1[i] < b2[i] ? -1 : 1;
  }
  return 0;
}
function utf8ToBytes(str) {
  let out = [], p = 0;
  for (let i = 0;i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 128)
      out[p++] = c;
    else if (c < 2048)
      out[p++] = c >> 6 | 192, out[p++] = c & 63 | 128;
    else if ((c & 64512) === 55296 && i + 1 < str.length && (str.charCodeAt(i + 1) & 64512) === 56320)
      c = 65536 + ((c & 1023) << 10) + (str.charCodeAt(++i) & 1023), out[p++] = c >> 18 | 240, out[p++] = c >> 12 & 63 | 128, out[p++] = c >> 6 & 63 | 128, out[p++] = c & 63 | 128;
    else {
      if (c >= 55296 && c <= 57343)
        c = 65533;
      out[p++] = c >> 12 | 224, out[p++] = c >> 6 & 63 | 128, out[p++] = c & 63 | 128;
    }
  }
  return out;
}

// node_modules/cborg/lib/bl.js
var defaultChunkSize = 256;

class Bl {
  constructor(chunkSize = defaultChunkSize) {
    this.chunkSize = chunkSize, this.cursor = 0, this.maxCursor = -1, this.chunks = [], this._initReuseChunk = null;
  }
  reset() {
    if (this.cursor = 0, this.maxCursor = -1, this.chunks.length)
      this.chunks = [];
    if (this._initReuseChunk !== null)
      this.chunks.push(this._initReuseChunk), this.maxCursor = this._initReuseChunk.length - 1;
  }
  pushByte(byte) {
    let topChunk = this.chunks[this.chunks.length - 1];
    if (this.cursor > this.maxCursor) {
      if (topChunk = alloc(this.chunkSize), this.chunks.push(topChunk), this.maxCursor += topChunk.length, this._initReuseChunk === null)
        this._initReuseChunk = topChunk;
    }
    let chunkPos = topChunk.length - (this.maxCursor - this.cursor) - 1;
    topChunk[chunkPos] = byte, this.cursor++;
  }
  push(bytes) {
    let topChunk = this.chunks[this.chunks.length - 1];
    if (this.cursor + bytes.length <= this.maxCursor + 1) {
      let chunkPos = topChunk.length - (this.maxCursor - this.cursor) - 1;
      topChunk.set(bytes, chunkPos);
    } else {
      if (topChunk) {
        let chunkPos = topChunk.length - (this.maxCursor - this.cursor) - 1;
        if (chunkPos < topChunk.length)
          this.chunks[this.chunks.length - 1] = topChunk.subarray(0, chunkPos), this.maxCursor = this.cursor - 1;
      }
      if (bytes.length < 64 && bytes.length < this.chunkSize) {
        if (topChunk = alloc(this.chunkSize), this.chunks.push(topChunk), this.maxCursor += topChunk.length, this._initReuseChunk === null)
          this._initReuseChunk = topChunk;
        topChunk.set(bytes, 0);
      } else
        this.chunks.push(bytes), this.maxCursor += bytes.length;
    }
    this.cursor += bytes.length;
  }
  toBytes(reset = !1) {
    let byts;
    if (this.chunks.length === 1) {
      let chunk = this.chunks[0];
      if (reset && this.cursor > chunk.length / 2)
        byts = this.cursor === chunk.length ? chunk : chunk.subarray(0, this.cursor), this._initReuseChunk = null, this.chunks = [];
      else
        byts = slice(chunk, 0, this.cursor);
    } else
      byts = concat(this.chunks, this.cursor);
    if (reset)
      this.reset();
    return byts;
  }
}

class U8Bl {
  constructor(dest) {
    this.dest = dest, this.cursor = 0, this.chunks = [dest];
  }
  reset() {
    this.cursor = 0;
  }
  pushByte(byte) {
    if (this.cursor >= this.dest.length)
      throw Error("write out of bounds, destination buffer is too small");
    this.dest[this.cursor++] = byte;
  }
  push(bytes) {
    if (this.cursor + bytes.length > this.dest.length)
      throw Error("write out of bounds, destination buffer is too small");
    this.dest.set(bytes, this.cursor), this.cursor += bytes.length;
  }
  toBytes(reset = !1) {
    let byts = this.dest.subarray(0, this.cursor);
    if (reset)
      this.reset();
    return byts;
  }
}

// node_modules/cborg/lib/common.js
var decodeErrPrefix = "CBOR decode error:", encodeErrPrefix = "CBOR encode error:", uintMinorPrefixBytes = [];
uintMinorPrefixBytes[23] = 1;
uintMinorPrefixBytes[24] = 2;
uintMinorPrefixBytes[25] = 3;
uintMinorPrefixBytes[26] = 5;
uintMinorPrefixBytes[27] = 9;
function assertEnoughData(data, pos, need) {
  if (data.length - pos < need)
    throw Error("CBOR decode error: not enough data for type");
}

// node_modules/cborg/lib/0uint.js
var uintBoundaries = [24, 256, 65536, 4294967296, BigInt("18446744073709551616")];
function readUint8(data, offset, options) {
  assertEnoughData(data, offset, 1);
  let value = data[offset];
  if (options.strict === !0 && value < uintBoundaries[0])
    throw Error(`${decodeErrPrefix} integer encoded in more bytes than necessary (strict decode)`);
  return value;
}
function readUint16(data, offset, options) {
  assertEnoughData(data, offset, 2);
  let value = data[offset] << 8 | data[offset + 1];
  if (options.strict === !0 && value < uintBoundaries[1])
    throw Error(`${decodeErrPrefix} integer encoded in more bytes than necessary (strict decode)`);
  return value;
}
function readUint32(data, offset, options) {
  assertEnoughData(data, offset, 4);
  let value = data[offset] * 16777216 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
  if (options.strict === !0 && value < uintBoundaries[2])
    throw Error(`${decodeErrPrefix} integer encoded in more bytes than necessary (strict decode)`);
  return value;
}
function readUint64(data, offset, options) {
  assertEnoughData(data, offset, 8);
  let hi = data[offset] * 16777216 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3], lo = data[offset + 4] * 16777216 + (data[offset + 5] << 16) + (data[offset + 6] << 8) + data[offset + 7], value = (BigInt(hi) << BigInt(32)) + BigInt(lo);
  if (options.strict === !0 && value < uintBoundaries[3])
    throw Error(`${decodeErrPrefix} integer encoded in more bytes than necessary (strict decode)`);
  if (value <= Number.MAX_SAFE_INTEGER)
    return Number(value);
  if (options.allowBigInt === !0)
    return value;
  throw Error(`${decodeErrPrefix} integers outside of the safe integer range are not supported`);
}
function decodeUint8(data, pos, _minor, options) {
  return new Token(Type.uint, readUint8(data, pos + 1, options), 2);
}
function decodeUint16(data, pos, _minor, options) {
  return new Token(Type.uint, readUint16(data, pos + 1, options), 3);
}
function decodeUint32(data, pos, _minor, options) {
  return new Token(Type.uint, readUint32(data, pos + 1, options), 5);
}
function decodeUint64(data, pos, _minor, options) {
  return new Token(Type.uint, readUint64(data, pos + 1, options), 9);
}
function encodeUint(writer, token) {
  return encodeUintValue(writer, 0, token.value);
}
function encodeUintValue(writer, major, uint) {
  if (uint < uintBoundaries[0]) {
    let nuint = Number(uint);
    writer.pushByte(major | nuint);
  } else if (uint < uintBoundaries[1]) {
    let nuint = Number(uint);
    writer.push([major | 24, nuint]);
  } else if (uint < uintBoundaries[2]) {
    let nuint = Number(uint);
    writer.push([major | 25, nuint >>> 8, nuint & 255]);
  } else if (uint < uintBoundaries[3]) {
    let nuint = Number(uint);
    writer.push([major | 26, nuint >>> 24 & 255, nuint >>> 16 & 255, nuint >>> 8 & 255, nuint & 255]);
  } else {
    let buint = BigInt(uint);
    if (buint < uintBoundaries[4]) {
      let set = [major | 27, 0, 0, 0, 0, 0, 0, 0], lo = Number(buint & BigInt(4294967295)), hi = Number(buint >> BigInt(32) & BigInt(4294967295));
      set[8] = lo & 255, lo = lo >> 8, set[7] = lo & 255, lo = lo >> 8, set[6] = lo & 255, lo = lo >> 8, set[5] = lo & 255, set[4] = hi & 255, hi = hi >> 8, set[3] = hi & 255, hi = hi >> 8, set[2] = hi & 255, hi = hi >> 8, set[1] = hi & 255, writer.push(set);
    } else
      throw Error(`${decodeErrPrefix} encountered BigInt larger than allowable range`);
  }
}
encodeUint.encodedSize = function(token) {
  return encodeUintValue.encodedSize(token.value);
};
encodeUintValue.encodedSize = function(uint) {
  if (uint < uintBoundaries[0])
    return 1;
  if (uint < uintBoundaries[1])
    return 2;
  if (uint < uintBoundaries[2])
    return 3;
  if (uint < uintBoundaries[3])
    return 5;
  return 9;
};
encodeUint.compareTokens = function(tok1, tok2) {
  return tok1.value < tok2.value ? -1 : tok1.value > tok2.value ? 1 : 0;
};

// node_modules/cborg/lib/1negint.js
function decodeNegint8(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint8(data, pos + 1, options), 2);
}
function decodeNegint16(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint16(data, pos + 1, options), 3);
}
function decodeNegint32(data, pos, _minor, options) {
  return new Token(Type.negint, -1 - readUint32(data, pos + 1, options), 5);
}
var neg1b = BigInt(-1), pos1b = BigInt(1);
function decodeNegint64(data, pos, _minor, options) {
  let int = readUint64(data, pos + 1, options);
  if (typeof int !== "bigint") {
    let value = -1 - int;
    if (value >= Number.MIN_SAFE_INTEGER)
      return new Token(Type.negint, value, 9);
  }
  if (options.allowBigInt !== !0)
    throw Error(`${decodeErrPrefix} integers outside of the safe integer range are not supported`);
  return new Token(Type.negint, neg1b - BigInt(int), 9);
}
function encodeNegint(writer, token) {
  let negint = token.value, unsigned = typeof negint === "bigint" ? negint * neg1b - pos1b : negint * -1 - 1;
  encodeUintValue(writer, token.type.majorEncoded, unsigned);
}
encodeNegint.encodedSize = function(token) {
  let negint = token.value, unsigned = typeof negint === "bigint" ? negint * neg1b - pos1b : negint * -1 - 1;
  if (unsigned < uintBoundaries[0])
    return 1;
  if (unsigned < uintBoundaries[1])
    return 2;
  if (unsigned < uintBoundaries[2])
    return 3;
  if (unsigned < uintBoundaries[3])
    return 5;
  return 9;
};
encodeNegint.compareTokens = function(tok1, tok2) {
  return tok1.value < tok2.value ? 1 : tok1.value > tok2.value ? -1 : 0;
};

// node_modules/cborg/lib/2bytes.js
function toToken(data, pos, prefix, length) {
  assertEnoughData(data, pos, prefix + length);
  let buf = data.slice(pos + prefix, pos + prefix + length);
  return new Token(Type.bytes, buf, prefix + length);
}
function decodeBytesCompact(data, pos, minor, _options) {
  return toToken(data, pos, 1, minor);
}
function decodeBytes8(data, pos, _minor, options) {
  return toToken(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeBytes16(data, pos, _minor, options) {
  return toToken(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeBytes32(data, pos, _minor, options) {
  return toToken(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeBytes64(data, pos, _minor, options) {
  let l = readUint64(data, pos + 1, options);
  if (typeof l === "bigint")
    throw Error(`${decodeErrPrefix} 64-bit integer bytes lengths not supported`);
  return toToken(data, pos, 9, l);
}
function tokenBytes(token) {
  if (token.encodedBytes === void 0)
    token.encodedBytes = Type.equals(token.type, Type.string) ? fromString(token.value) : token.value;
  return token.encodedBytes;
}
function encodeBytes(writer, token) {
  let bytes = tokenBytes(token);
  encodeUintValue(writer, token.type.majorEncoded, bytes.length), writer.push(bytes);
}
encodeBytes.encodedSize = function(token) {
  let bytes = tokenBytes(token);
  return encodeUintValue.encodedSize(bytes.length) + bytes.length;
};
encodeBytes.compareTokens = function(tok1, tok2) {
  return compareBytes(tokenBytes(tok1), tokenBytes(tok2));
};
function compareBytes(b1, b2) {
  return b1.length < b2.length ? -1 : b1.length > b2.length ? 1 : compare(b1, b2);
}

// node_modules/cborg/lib/3string.js
var textDecoder = /* @__PURE__ */ new TextDecoder, ASCII_THRESHOLD = 32;
function toStr(bytes, start, end) {
  if (end - start < ASCII_THRESHOLD) {
    let str = "";
    for (let i = start;i < end; i++) {
      let c = bytes[i];
      if (c & 128)
        return textDecoder.decode(bytes.subarray(start, end));
      str += String.fromCharCode(c);
    }
    return str;
  }
  return textDecoder.decode(bytes.subarray(start, end));
}
function toToken2(data, pos, prefix, length, options) {
  let totLength = prefix + length;
  assertEnoughData(data, pos, totLength);
  let tok = new Token(Type.string, toStr(data, pos + prefix, pos + totLength), totLength);
  if (options.retainStringBytes === !0)
    tok.byteValue = data.slice(pos + prefix, pos + totLength);
  return tok;
}
function decodeStringCompact(data, pos, minor, options) {
  return toToken2(data, pos, 1, minor, options);
}
function decodeString8(data, pos, _minor, options) {
  return toToken2(data, pos, 2, readUint8(data, pos + 1, options), options);
}
function decodeString16(data, pos, _minor, options) {
  return toToken2(data, pos, 3, readUint16(data, pos + 1, options), options);
}
function decodeString32(data, pos, _minor, options) {
  return toToken2(data, pos, 5, readUint32(data, pos + 1, options), options);
}
function decodeString64(data, pos, _minor, options) {
  let l = readUint64(data, pos + 1, options);
  if (typeof l === "bigint")
    throw Error(`${decodeErrPrefix} 64-bit integer string lengths not supported`);
  return toToken2(data, pos, 9, l, options);
}
var encodeString = encodeBytes;

// node_modules/cborg/lib/4array.js
function toToken3(_data, _pos, prefix, length) {
  return new Token(Type.array, length, prefix);
}
function decodeArrayCompact(data, pos, minor, _options) {
  return toToken3(data, pos, 1, minor);
}
function decodeArray8(data, pos, _minor, options) {
  return toToken3(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeArray16(data, pos, _minor, options) {
  return toToken3(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeArray32(data, pos, _minor, options) {
  return toToken3(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeArray64(data, pos, _minor, options) {
  let l = readUint64(data, pos + 1, options);
  if (typeof l === "bigint")
    throw Error(`${decodeErrPrefix} 64-bit integer array lengths not supported`);
  return toToken3(data, pos, 9, l);
}
function decodeArrayIndefinite(data, pos, _minor, options) {
  if (options.allowIndefinite === !1)
    throw Error(`${decodeErrPrefix} indefinite length items not allowed`);
  return toToken3(data, pos, 1, 1 / 0);
}
function encodeArray(writer, token) {
  encodeUintValue(writer, Type.array.majorEncoded, token.value);
}
encodeArray.compareTokens = encodeUint.compareTokens;
encodeArray.encodedSize = function(token) {
  return encodeUintValue.encodedSize(token.value);
};

// node_modules/cborg/lib/5map.js
function toToken4(_data, _pos, prefix, length) {
  return new Token(Type.map, length, prefix);
}
function decodeMapCompact(data, pos, minor, _options) {
  return toToken4(data, pos, 1, minor);
}
function decodeMap8(data, pos, _minor, options) {
  return toToken4(data, pos, 2, readUint8(data, pos + 1, options));
}
function decodeMap16(data, pos, _minor, options) {
  return toToken4(data, pos, 3, readUint16(data, pos + 1, options));
}
function decodeMap32(data, pos, _minor, options) {
  return toToken4(data, pos, 5, readUint32(data, pos + 1, options));
}
function decodeMap64(data, pos, _minor, options) {
  let l = readUint64(data, pos + 1, options);
  if (typeof l === "bigint")
    throw Error(`${decodeErrPrefix} 64-bit integer map lengths not supported`);
  return toToken4(data, pos, 9, l);
}
function decodeMapIndefinite(data, pos, _minor, options) {
  if (options.allowIndefinite === !1)
    throw Error(`${decodeErrPrefix} indefinite length items not allowed`);
  return toToken4(data, pos, 1, 1 / 0);
}
function encodeMap(writer, token) {
  encodeUintValue(writer, Type.map.majorEncoded, token.value);
}
encodeMap.compareTokens = encodeUint.compareTokens;
encodeMap.encodedSize = function(token) {
  return encodeUintValue.encodedSize(token.value);
};

// node_modules/cborg/lib/6tag.js
function decodeTagCompact(_data, _pos, minor, _options) {
  return new Token(Type.tag, minor, 1);
}
function decodeTag8(data, pos, _minor, options) {
  return new Token(Type.tag, readUint8(data, pos + 1, options), 2);
}
function decodeTag16(data, pos, _minor, options) {
  return new Token(Type.tag, readUint16(data, pos + 1, options), 3);
}
function decodeTag32(data, pos, _minor, options) {
  return new Token(Type.tag, readUint32(data, pos + 1, options), 5);
}
function decodeTag64(data, pos, _minor, options) {
  return new Token(Type.tag, readUint64(data, pos + 1, options), 9);
}
function encodeTag(writer, token) {
  encodeUintValue(writer, Type.tag.majorEncoded, token.value);
}
encodeTag.compareTokens = encodeUint.compareTokens;
encodeTag.encodedSize = function(token) {
  return encodeUintValue.encodedSize(token.value);
};

// node_modules/cborg/lib/7float.js
var MINOR_FALSE = 20, MINOR_TRUE = 21, MINOR_NULL = 22, MINOR_UNDEFINED = 23;
function decodeUndefined(_data, _pos, _minor, options) {
  if (options.allowUndefined === !1)
    throw Error(`${decodeErrPrefix} undefined values are not supported`);
  else if (options.coerceUndefinedToNull === !0)
    return new Token(Type.null, null, 1);
  return new Token(Type.undefined, void 0, 1);
}
function decodeBreak(_data, _pos, _minor, options) {
  if (options.allowIndefinite === !1)
    throw Error(`${decodeErrPrefix} indefinite length items not allowed`);
  return new Token(Type.break, void 0, 1);
}
function createToken(value, bytes, options) {
  if (options) {
    if (options.allowNaN === !1 && Number.isNaN(value))
      throw Error(`${decodeErrPrefix} NaN values are not supported`);
    if (options.allowInfinity === !1 && (value === 1 / 0 || value === -1 / 0))
      throw Error(`${decodeErrPrefix} Infinity values are not supported`);
  }
  return new Token(Type.float, value, bytes);
}
function decodeFloat16(data, pos, _minor, options) {
  return createToken(readFloat16(data, pos + 1), 3, options);
}
function decodeFloat32(data, pos, _minor, options) {
  return createToken(readFloat32(data, pos + 1), 5, options);
}
function decodeFloat64(data, pos, _minor, options) {
  return createToken(readFloat64(data, pos + 1), 9, options);
}
function encodeFloat(writer, token, options) {
  let float = token.value;
  if (float === !1)
    writer.pushByte(Type.float.majorEncoded | MINOR_FALSE);
  else if (float === !0)
    writer.pushByte(Type.float.majorEncoded | MINOR_TRUE);
  else if (float === null)
    writer.pushByte(Type.float.majorEncoded | MINOR_NULL);
  else if (float === void 0)
    writer.pushByte(Type.float.majorEncoded | MINOR_UNDEFINED);
  else {
    let decoded, success = !1;
    if (!options || options.float64 !== !0) {
      if (encodeFloat16(float), decoded = readFloat16(ui8a, 1), float === decoded || Number.isNaN(float))
        ui8a[0] = 249, writer.push(ui8a.slice(0, 3)), success = !0;
      else if (encodeFloat32(float), decoded = readFloat32(ui8a, 1), float === decoded)
        ui8a[0] = 250, writer.push(ui8a.slice(0, 5)), success = !0;
    }
    if (!success)
      encodeFloat64(float), decoded = readFloat64(ui8a, 1), ui8a[0] = 251, writer.push(ui8a.slice(0, 9));
  }
}
encodeFloat.encodedSize = function(token, options) {
  let float = token.value;
  if (float === !1 || float === !0 || float === null || float === void 0)
    return 1;
  if (!options || options.float64 !== !0) {
    encodeFloat16(float);
    let decoded = readFloat16(ui8a, 1);
    if (float === decoded || Number.isNaN(float))
      return 3;
    if (encodeFloat32(float), decoded = readFloat32(ui8a, 1), float === decoded)
      return 5;
  }
  return 9;
};
var buffer = new ArrayBuffer(9), dataView = new DataView(buffer, 1), ui8a = new Uint8Array(buffer, 0);
function encodeFloat16(inp) {
  if (inp === 1 / 0)
    dataView.setUint16(0, 31744, !1);
  else if (inp === -1 / 0)
    dataView.setUint16(0, 64512, !1);
  else if (Number.isNaN(inp))
    dataView.setUint16(0, 32256, !1);
  else {
    dataView.setFloat32(0, inp);
    let valu32 = dataView.getUint32(0), exponent = (valu32 & 2139095040) >> 23, mantissa = valu32 & 8388607;
    if (exponent === 255)
      dataView.setUint16(0, 31744, !1);
    else if (exponent === 0)
      dataView.setUint16(0, (valu32 & 2147483648) >> 16 | mantissa >> 13, !1);
    else {
      let logicalExponent = exponent - 127;
      if (logicalExponent < -24)
        dataView.setUint16(0, 0);
      else if (logicalExponent < -14)
        dataView.setUint16(0, (valu32 & 2147483648) >> 16 | 1 << 24 + logicalExponent, !1);
      else
        dataView.setUint16(0, (valu32 & 2147483648) >> 16 | logicalExponent + 15 << 10 | mantissa >> 13, !1);
    }
  }
}
function readFloat16(ui8a2, pos) {
  if (ui8a2.length - pos < 2)
    throw Error(`${decodeErrPrefix} not enough data for float16`);
  let half = (ui8a2[pos] << 8) + ui8a2[pos + 1];
  if (half === 31744)
    return 1 / 0;
  if (half === 64512)
    return -1 / 0;
  if (half === 32256)
    return NaN;
  let exp = half >> 10 & 31, mant = half & 1023, val;
  if (exp === 0)
    val = mant * 0.00000005960464477539063;
  else if (exp !== 31)
    val = (mant + 1024) * 2 ** (exp - 25);
  else
    val = mant === 0 ? 1 / 0 : NaN;
  return half & 32768 ? -val : val;
}
function encodeFloat32(inp) {
  dataView.setFloat32(0, inp, !1);
}
function readFloat32(ui8a2, pos) {
  if (ui8a2.length - pos < 4)
    throw Error(`${decodeErrPrefix} not enough data for float32`);
  let offset = (ui8a2.byteOffset || 0) + pos;
  return new DataView(ui8a2.buffer, offset, 4).getFloat32(0, !1);
}
function encodeFloat64(inp) {
  dataView.setFloat64(0, inp, !1);
}
function readFloat64(ui8a2, pos) {
  if (ui8a2.length - pos < 8)
    throw Error(`${decodeErrPrefix} not enough data for float64`);
  let offset = (ui8a2.byteOffset || 0) + pos;
  return new DataView(ui8a2.buffer, offset, 8).getFloat64(0, !1);
}
function encodeMajorSevenBytes(token, float64) {
  let float = token.value;
  if (float === !1)
    return Uint8Array.of(Type.float.majorEncoded | MINOR_FALSE);
  if (float === !0)
    return Uint8Array.of(Type.float.majorEncoded | MINOR_TRUE);
  if (float === null)
    return Uint8Array.of(Type.float.majorEncoded | MINOR_NULL);
  if (float === void 0)
    return Uint8Array.of(Type.float.majorEncoded | MINOR_UNDEFINED);
  if (!float64) {
    if (encodeFloat16(float), float === readFloat16(ui8a, 1) || Number.isNaN(float))
      return ui8a[0] = 249, ui8a.slice(0, 3);
    if (encodeFloat32(float), float === readFloat32(ui8a, 1))
      return ui8a[0] = 250, ui8a.slice(0, 5);
  }
  return encodeFloat64(float), ui8a[0] = 251, ui8a.slice(0, 9);
}
function majorSevenBytes(token, options) {
  let tokenEx = token, float64 = options?.float64 === !0, cached = float64 ? tokenEx._keyBytesFloat64 : tokenEx._keyBytes;
  if (cached !== void 0)
    return cached;
  let bytes = encodeMajorSevenBytes(token, float64);
  if (float64)
    tokenEx._keyBytesFloat64 = bytes;
  else
    tokenEx._keyBytes = bytes;
  return bytes;
}
encodeFloat.compareTokens = function(tok1, tok2, options) {
  let b1 = majorSevenBytes(tok1, options), b2 = majorSevenBytes(tok2, options);
  if (b1.length !== b2.length)
    return b1.length < b2.length ? -1 : 1;
  return compare(b1, b2);
};

// node_modules/cborg/lib/jump.js
function invalidMinor(data, pos, minor) {
  throw Error(`${decodeErrPrefix} encountered invalid minor (${minor}) for major ${data[pos] >>> 5}`);
}
function errorer(msg) {
  return () => {
    throw Error(`${decodeErrPrefix} ${msg}`);
  };
}
var jump = [];
for (let i = 0;i <= 23; i++)
  jump[i] = invalidMinor;
jump[24] = decodeUint8;
jump[25] = decodeUint16;
jump[26] = decodeUint32;
jump[27] = decodeUint64;
jump[28] = invalidMinor;
jump[29] = invalidMinor;
jump[30] = invalidMinor;
jump[31] = invalidMinor;
for (let i = 32;i <= 55; i++)
  jump[i] = invalidMinor;
jump[56] = decodeNegint8;
jump[57] = decodeNegint16;
jump[58] = decodeNegint32;
jump[59] = decodeNegint64;
jump[60] = invalidMinor;
jump[61] = invalidMinor;
jump[62] = invalidMinor;
jump[63] = invalidMinor;
for (let i = 64;i <= 87; i++)
  jump[i] = decodeBytesCompact;
jump[88] = decodeBytes8;
jump[89] = decodeBytes16;
jump[90] = decodeBytes32;
jump[91] = decodeBytes64;
jump[92] = invalidMinor;
jump[93] = invalidMinor;
jump[94] = invalidMinor;
jump[95] = errorer("indefinite length bytes/strings are not supported");
for (let i = 96;i <= 119; i++)
  jump[i] = decodeStringCompact;
jump[120] = decodeString8;
jump[121] = decodeString16;
jump[122] = decodeString32;
jump[123] = decodeString64;
jump[124] = invalidMinor;
jump[125] = invalidMinor;
jump[126] = invalidMinor;
jump[127] = errorer("indefinite length bytes/strings are not supported");
for (let i = 128;i <= 151; i++)
  jump[i] = decodeArrayCompact;
jump[152] = decodeArray8;
jump[153] = decodeArray16;
jump[154] = decodeArray32;
jump[155] = decodeArray64;
jump[156] = invalidMinor;
jump[157] = invalidMinor;
jump[158] = invalidMinor;
jump[159] = decodeArrayIndefinite;
for (let i = 160;i <= 183; i++)
  jump[i] = decodeMapCompact;
jump[184] = decodeMap8;
jump[185] = decodeMap16;
jump[186] = decodeMap32;
jump[187] = decodeMap64;
jump[188] = invalidMinor;
jump[189] = invalidMinor;
jump[190] = invalidMinor;
jump[191] = decodeMapIndefinite;
for (let i = 192;i <= 215; i++)
  jump[i] = decodeTagCompact;
jump[216] = decodeTag8;
jump[217] = decodeTag16;
jump[218] = decodeTag32;
jump[219] = decodeTag64;
jump[220] = invalidMinor;
jump[221] = invalidMinor;
jump[222] = invalidMinor;
jump[223] = invalidMinor;
for (let i = 224;i <= 243; i++)
  jump[i] = errorer("simple values are not supported");
jump[244] = invalidMinor;
jump[245] = invalidMinor;
jump[246] = invalidMinor;
jump[247] = decodeUndefined;
jump[248] = errorer("simple values are not supported");
jump[249] = decodeFloat16;
jump[250] = decodeFloat32;
jump[251] = decodeFloat64;
jump[252] = invalidMinor;
jump[253] = invalidMinor;
jump[254] = invalidMinor;
jump[255] = decodeBreak;
var quick = [];
for (let i = 0;i < 24; i++)
  quick[i] = new Token(Type.uint, i, 1);
for (let i = -1;i >= -24; i--)
  quick[31 - i] = new Token(Type.negint, i, 1);
quick[64] = new Token(Type.bytes, new Uint8Array(0), 1);
quick[96] = new Token(Type.string, "", 1);
quick[128] = new Token(Type.array, 0, 1);
quick[160] = new Token(Type.map, 0, 1);
quick[244] = new Token(Type.false, !1, 1);
quick[245] = new Token(Type.true, !0, 1);
quick[246] = new Token(Type.null, null, 1);
function quickEncodeToken(token) {
  switch (token.type) {
    case Type.false:
      return fromArray([244]);
    case Type.true:
      return fromArray([245]);
    case Type.null:
      return fromArray([246]);
    case Type.bytes:
      if (!token.value.length)
        return fromArray([64]);
      return;
    case Type.string:
      if (token.value === "")
        return fromArray([96]);
      return;
    case Type.array:
      if (token.value === 0)
        return fromArray([128]);
      return;
    case Type.map:
      if (token.value === 0)
        return fromArray([160]);
      return;
    case Type.uint:
      if (token.value < 24)
        return fromArray([Number(token.value)]);
      return;
    case Type.negint:
      if (token.value >= -24)
        return fromArray([31 - Number(token.value)]);
  }
}

// node_modules/cborg/lib/encode.js
var defaultEncodeOptions = {
  float64: !1,
  mapSorter,
  quickEncodeToken
}, rfc8949EncodeOptions = Object.freeze({
  mapSorter: rfc8949MapSorter,
  quickEncodeToken
});
function makeCborEncoders() {
  let encoders = [];
  return encoders[Type.uint.major] = encodeUint, encoders[Type.negint.major] = encodeNegint, encoders[Type.bytes.major] = encodeBytes, encoders[Type.string.major] = encodeString, encoders[Type.array.major] = encodeArray, encoders[Type.map.major] = encodeMap, encoders[Type.tag.major] = encodeTag, encoders[Type.float.major] = encodeFloat, encoders;
}
var cborEncoders = makeCborEncoders(), defaultWriter = new Bl;

class Ref {
  constructor(obj, parent) {
    this.obj = obj, this.parent = parent;
  }
  includes(obj) {
    let p = this;
    do
      if (p.obj === obj)
        return !0;
    while (p = p.parent);
    return !1;
  }
  static createCheck(stack, obj) {
    if (stack && stack.includes(obj))
      throw Error(`${encodeErrPrefix} object contains circular references`);
    return new Ref(obj, stack);
  }
}
var simpleTokens = {
  null: new Token(Type.null, null),
  undefined: new Token(Type.undefined, void 0),
  true: new Token(Type.true, !0),
  false: new Token(Type.false, !1),
  emptyArray: new Token(Type.array, 0),
  emptyMap: new Token(Type.map, 0)
}, typeEncoders = {
  number(obj, _typ, _options, _refStack) {
    if (!Number.isInteger(obj) || !Number.isSafeInteger(obj))
      return new Token(Type.float, obj);
    else if (obj >= 0)
      return new Token(Type.uint, obj);
    else
      return new Token(Type.negint, obj);
  },
  bigint(obj, _typ, _options, _refStack) {
    if (obj >= BigInt(0))
      return new Token(Type.uint, obj);
    else
      return new Token(Type.negint, obj);
  },
  Uint8Array(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, obj);
  },
  string(obj, _typ, _options, _refStack) {
    return new Token(Type.string, obj);
  },
  boolean(obj, _typ, _options, _refStack) {
    return obj ? simpleTokens.true : simpleTokens.false;
  },
  null(_obj, _typ, _options, _refStack) {
    return simpleTokens.null;
  },
  undefined(_obj, _typ, _options, _refStack) {
    return simpleTokens.undefined;
  },
  ArrayBuffer(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, new Uint8Array(obj));
  },
  DataView(obj, _typ, _options, _refStack) {
    return new Token(Type.bytes, new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength));
  },
  Array(obj, _typ, options, refStack) {
    if (!obj.length) {
      if (options.addBreakTokens === !0)
        return [simpleTokens.emptyArray, new Token(Type.break)];
      return simpleTokens.emptyArray;
    }
    refStack = Ref.createCheck(refStack, obj);
    let entries = [], i = 0;
    for (let e of obj)
      entries[i++] = objectToTokens(e, options, refStack);
    if (options.addBreakTokens)
      return [new Token(Type.array, obj.length), entries, new Token(Type.break)];
    return [new Token(Type.array, obj.length), entries];
  },
  Object(obj, typ, options, refStack) {
    let isMap = typ !== "Object", keys = isMap ? obj.keys() : Object.keys(obj), maxLength = isMap ? obj.size : keys.length, entries;
    if (maxLength) {
      entries = Array(maxLength), refStack = Ref.createCheck(refStack, obj);
      let skipUndefined = !isMap && options.ignoreUndefinedProperties, i = 0;
      for (let key of keys) {
        let value = isMap ? obj.get(key) : obj[key];
        if (skipUndefined && value === void 0)
          continue;
        entries[i++] = [
          objectToTokens(key, options, refStack),
          objectToTokens(value, options, refStack)
        ];
      }
      if (i < maxLength)
        entries.length = i;
    }
    if (!entries?.length) {
      if (options.addBreakTokens === !0)
        return [simpleTokens.emptyMap, new Token(Type.break)];
      return simpleTokens.emptyMap;
    }
    if (sortMapEntries(entries, options), options.addBreakTokens)
      return [new Token(Type.map, entries.length), entries, new Token(Type.break)];
    return [new Token(Type.map, entries.length), entries];
  },
  Tagged(obj, _typ, options, refStack) {
    return [
      new Token(Type.tag, obj.tag),
      objectToTokens(obj.value, options, refStack)
    ];
  }
};
typeEncoders.Map = typeEncoders.Object;
typeEncoders.Buffer = typeEncoders.Uint8Array;
for (let typ of "Uint8Clamped Uint16 Uint32 Int8 Int16 Int32 BigUint64 BigInt64 Float32 Float64".split(" "))
  typeEncoders[`${typ}Array`] = typeEncoders.DataView;
function objectToTokens(obj, options = {}, refStack) {
  let typ = is(obj), customTypeEncoder = options && options.typeEncoders && options.typeEncoders[typ] || typeEncoders[typ];
  if (typeof customTypeEncoder === "function") {
    let tokens = customTypeEncoder(obj, typ, options, refStack);
    if (tokens != null)
      return tokens;
  }
  let typeEncoder = typeEncoders[typ];
  if (!typeEncoder)
    throw Error(`${encodeErrPrefix} unsupported type: ${typ}`);
  return typeEncoder(obj, typ, options, refStack);
}
function sortMapEntries(entries, options) {
  let mapSorter = options.mapSorter;
  if (mapSorter)
    entries.sort((e1, e2) => mapSorter(e1, e2, options));
}
function mapSorter(e1, e2, options) {
  let keyToken1 = Array.isArray(e1[0]) ? e1[0][0] : e1[0], keyToken2 = Array.isArray(e2[0]) ? e2[0][0] : e2[0];
  if (keyToken1.type.major !== keyToken2.type.major)
    return keyToken1.type.compare(keyToken2.type);
  let major = keyToken1.type.major, tcmp = cborEncoders[major].compareTokens(keyToken1, keyToken2, options);
  if (tcmp === 0)
    console.warn("WARNING: complex key types used, CBOR key sorting guarantees are gone");
  return tcmp;
}
function rfc8949MapSorter(e1, e2) {
  if (e1[0] instanceof Token && e2[0] instanceof Token) {
    let t1 = e1[0], t2 = e2[0];
    if (!t1._keyBytes)
      t1._keyBytes = encodeRfc8949(t1.value);
    if (!t2._keyBytes)
      t2._keyBytes = encodeRfc8949(t2.value);
    return compare(t1._keyBytes, t2._keyBytes);
  }
  throw Error("rfc8949MapSorter: complex key types are not supported yet");
}
function encodeRfc8949(data) {
  return encodeCustom(data, cborEncoders, rfc8949EncodeOptions);
}
function tokensToEncoded(writer, tokens, encoders, options) {
  if (Array.isArray(tokens))
    for (let token of tokens)
      tokensToEncoded(writer, token, encoders, options);
  else
    encoders[tokens.type.major](writer, tokens, options);
}
var MAJOR_UINT = Type.uint.majorEncoded, MAJOR_NEGINT = Type.negint.majorEncoded, MAJOR_BYTES = Type.bytes.majorEncoded, MAJOR_STRING = Type.string.majorEncoded, MAJOR_ARRAY = Type.array.majorEncoded, MAJOR_MAP = Type.map.majorEncoded, SIMPLE_FALSE = Type.float.majorEncoded | MINOR_FALSE, SIMPLE_TRUE = Type.float.majorEncoded | MINOR_TRUE, SIMPLE_NULL = Type.float.majorEncoded | MINOR_NULL, SIMPLE_UNDEFINED = Type.float.majorEncoded | MINOR_UNDEFINED, neg1b2 = BigInt(-1), pos1b2 = BigInt(1);
function directEncodeUintValue(writer, major, uint) {
  if (uint < 24)
    writer.pushByte(major | Number(uint));
  else
    encodeUintValue(writer, major, uint);
}
function canDirectEncode(options) {
  return options.addBreakTokens !== !0;
}
function directEncodeMap(writer, data, typ, options, refStack) {
  let isMap = typ === "Map", keys = isMap ? data.keys() : Object.keys(data), maxLength = isMap ? data.size : keys.length;
  if (!maxLength) {
    writer.pushByte(MAJOR_MAP);
    return;
  }
  refStack = Ref.createCheck(refStack, data);
  let skipUndefined = !isMap && options.ignoreUndefinedProperties, entries = Array(maxLength), length = 0;
  for (let key of keys) {
    let value = isMap ? data.get(key) : data[key];
    if (skipUndefined && value === void 0)
      continue;
    entries[length++] = [objectToTokens(key, options, refStack), value];
  }
  if (length === 0) {
    writer.pushByte(MAJOR_MAP);
    return;
  }
  if (length < maxLength)
    entries.length = length;
  entries.sort((e1, e2) => mapSorter(e1, e2, options)), directEncodeUintValue(writer, MAJOR_MAP, length);
  for (let [key, value] of entries)
    tokensToEncoded(writer, key, cborEncoders, options), directEncode(writer, value, options, refStack);
}
function directEncode(writer, data, options, refStack) {
  let typ = is(data), customEncoder = options.typeEncoders && options.typeEncoders[typ];
  if (customEncoder) {
    let tokens = customEncoder(data, typ, options, refStack);
    if (tokens != null) {
      tokensToEncoded(writer, tokens, cborEncoders, options);
      return;
    }
  }
  switch (typ) {
    case "null":
      writer.pushByte(SIMPLE_NULL);
      return;
    case "undefined":
      writer.pushByte(SIMPLE_UNDEFINED);
      return;
    case "boolean":
      writer.pushByte(data ? SIMPLE_TRUE : SIMPLE_FALSE);
      return;
    case "number":
      if (!Number.isInteger(data) || !Number.isSafeInteger(data))
        encodeFloat(writer, new Token(Type.float, data), options);
      else if (data >= 0)
        directEncodeUintValue(writer, MAJOR_UINT, data);
      else
        directEncodeUintValue(writer, MAJOR_NEGINT, data * -1 - 1);
      return;
    case "bigint":
      if (data >= BigInt(0))
        directEncodeUintValue(writer, MAJOR_UINT, data);
      else
        directEncodeUintValue(writer, MAJOR_NEGINT, data * neg1b2 - pos1b2);
      return;
    case "string": {
      let bytes = fromString(data);
      directEncodeUintValue(writer, MAJOR_STRING, bytes.length), writer.push(bytes);
      return;
    }
    case "Uint8Array":
      directEncodeUintValue(writer, MAJOR_BYTES, data.length), writer.push(data);
      return;
    case "Array":
      if (!data.length) {
        writer.pushByte(MAJOR_ARRAY);
        return;
      }
      refStack = Ref.createCheck(refStack, data), directEncodeUintValue(writer, MAJOR_ARRAY, data.length);
      for (let elem of data)
        directEncode(writer, elem, options, refStack);
      return;
    case "Object":
    case "Map":
      if (options.mapSorter === mapSorter)
        directEncodeMap(writer, data, typ, options, refStack);
      else {
        let tokens = typeEncoders.Object(data, typ, options, refStack);
        tokensToEncoded(writer, tokens, cborEncoders, options);
      }
      return;
    default: {
      let typeEncoder = typeEncoders[typ];
      if (!typeEncoder)
        throw Error(`${encodeErrPrefix} unsupported type: ${typ}`);
      let tokens = typeEncoder(data, typ, options, refStack);
      tokensToEncoded(writer, tokens, cborEncoders, options);
    }
  }
}
function encodeCustom(data, encoders, options, destination) {
  let hasDest = destination instanceof Uint8Array, writeTo = hasDest ? new U8Bl(destination) : defaultWriter, tokens = objectToTokens(data, options);
  if (!Array.isArray(tokens) && options.quickEncodeToken) {
    let quickBytes = options.quickEncodeToken(tokens);
    if (quickBytes) {
      if (hasDest)
        return writeTo.push(quickBytes), writeTo.toBytes();
      return quickBytes;
    }
    let encoder = encoders[tokens.type.major];
    if (encoder.encodedSize) {
      let size = encoder.encodedSize(tokens, options);
      if (!hasDest)
        writeTo = new Bl(size);
      if (encoder(writeTo, tokens, options), writeTo.chunks.length !== 1)
        throw Error(`Unexpected error: pre-calculated length for ${tokens} was wrong`);
      return hasDest ? writeTo.toBytes() : asU8A(writeTo.chunks[0]);
    }
  }
  return writeTo.reset(), tokensToEncoded(writeTo, tokens, encoders, options), writeTo.toBytes(!0);
}
function encode(data, options) {
  if (options = Object.assign({}, defaultEncodeOptions, options), canDirectEncode(options))
    return defaultWriter.reset(), directEncode(defaultWriter, data, options, void 0), defaultWriter.toBytes(!0);
  return encodeCustom(data, cborEncoders, options);
}

// node_modules/cborg/lib/decode.js
var defaultDecodeOptions = {
  strict: !1,
  allowIndefinite: !0,
  allowUndefined: !0,
  allowBigInt: !0
};

class Tokeniser {
  constructor(data, options = {}) {
    this._pos = 0, this.data = data, this.options = options;
  }
  pos() {
    return this._pos;
  }
  done() {
    return this._pos >= this.data.length;
  }
  next() {
    let byt = this.data[this._pos], token = quick[byt];
    if (token === void 0) {
      let decoder = jump[byt];
      if (!decoder)
        throw Error(`${decodeErrPrefix} no decoder for major type ${byt >>> 5} (byte 0x${byt.toString(16).padStart(2, "0")})`);
      let minor = byt & 31;
      token = decoder(this.data, this._pos, minor, this.options);
    }
    return this._pos += token.encodedLength, token;
  }
}
var DONE = Symbol.for("DONE"), BREAK = Symbol.for("BREAK");
function tokenToArray(token, tokeniser, options) {
  let arr = [];
  for (let i = 0;i < token.value; i++) {
    let value = tokensToObject(tokeniser, options);
    if (value === BREAK) {
      if (token.value === 1 / 0)
        break;
      throw Error(`${decodeErrPrefix} got unexpected break to lengthed array`);
    }
    if (value === DONE)
      throw Error(`${decodeErrPrefix} found array but not enough entries (got ${i}, expected ${token.value})`);
    arr[i] = value;
  }
  return arr;
}
function tokenToMap(token, tokeniser, options) {
  let useMaps = options.useMaps === !0, rejectDuplicateMapKeys = options.rejectDuplicateMapKeys === !0, obj = useMaps ? void 0 : {}, m = useMaps ? /* @__PURE__ */ new Map : void 0;
  for (let i = 0;i < token.value; i++) {
    let key = tokensToObject(tokeniser, options);
    if (key === BREAK) {
      if (token.value === 1 / 0)
        break;
      throw Error(`${decodeErrPrefix} got unexpected break to lengthed map`);
    }
    if (key === DONE)
      throw Error(`${decodeErrPrefix} found map but not enough entries (got ${i} [no key], expected ${token.value})`);
    if (!useMaps && typeof key !== "string")
      throw Error(`${decodeErrPrefix} non-string keys not supported (got ${typeof key})`);
    if (rejectDuplicateMapKeys) {
      if (useMaps && m.has(key) || !useMaps && Object.hasOwn(obj, key))
        throw Error(`${decodeErrPrefix} found repeat map key "${key}"`);
    }
    let value = tokensToObject(tokeniser, options);
    if (value === DONE)
      throw Error(`${decodeErrPrefix} found map but not enough entries (got ${i} [no value], expected ${token.value})`);
    if (useMaps)
      m.set(key, value);
    else
      obj[key] = value;
  }
  return useMaps ? m : obj;
}
function* tokenToMapEntries(token, tokeniser, options) {
  for (let i = 0;i < token.value; i++) {
    let key = tokensToObject(tokeniser, options);
    if (key === BREAK) {
      if (token.value === 1 / 0)
        break;
      throw Error(`${decodeErrPrefix} got unexpected break to lengthed map`);
    }
    if (key === DONE)
      throw Error(`${decodeErrPrefix} found map but not enough entries (got ${i} [no key], expected ${token.value})`);
    let value = tokensToObject(tokeniser, options);
    if (value === DONE)
      throw Error(`${decodeErrPrefix} found map but not enough entries (got ${i} [no value], expected ${token.value})`);
    yield [key, value];
  }
}
function createTagDecodeControl(tokeniser, options) {
  let decode = function() {
    if (decode._called)
      throw Error(`${decodeErrPrefix} tag decode() may only be called once`);
    decode._called = !0;
    let value = tokensToObject(tokeniser, options);
    if (value === DONE)
      throw Error(`${decodeErrPrefix} tag content missing`);
    if (value === BREAK)
      throw Error(`${decodeErrPrefix} got unexpected break in tag content`);
    return value;
  };
  return decode.entries = function() {
    if (decode._called)
      throw Error(`${decodeErrPrefix} tag decode() may only be called once`);
    decode._called = !0;
    let token = tokeniser.next();
    if (!Type.equals(token.type, Type.map))
      throw Error(`${decodeErrPrefix} entries() requires map content, got ${token.type.name}`);
    let entries = [];
    for (let entry of tokenToMapEntries(token, tokeniser, options))
      entries.push(entry);
    return entries;
  }, decode._called = !1, decode;
}
function tokensToObject(tokeniser, options) {
  if (tokeniser.done())
    return DONE;
  let token = tokeniser.next();
  if (Type.equals(token.type, Type.break))
    return BREAK;
  if (token.type.terminal)
    return token.value;
  if (Type.equals(token.type, Type.array))
    return tokenToArray(token, tokeniser, options);
  if (Type.equals(token.type, Type.map))
    return tokenToMap(token, tokeniser, options);
  if (Type.equals(token.type, Type.tag)) {
    if (options.tags && typeof options.tags[token.value] === "function") {
      let decodeControl = createTagDecodeControl(tokeniser, options), result = options.tags[token.value](decodeControl);
      if (!decodeControl._called)
        throw Error(`${decodeErrPrefix} tag decoder must call decode() or entries()`);
      return result;
    }
    throw Error(`${decodeErrPrefix} tag not supported (${token.value})`);
  }
  throw Error("unsupported");
}
function decodeFirst(data, options) {
  if (!(data instanceof Uint8Array))
    throw Error(`${decodeErrPrefix} data to decode must be a Uint8Array`);
  options = Object.assign({}, defaultDecodeOptions, options);
  let u8aData = asU8A(data), tokeniser = options.tokenizer || new Tokeniser(u8aData, options), decoded = tokensToObject(tokeniser, options);
  if (decoded === DONE)
    throw Error(`${decodeErrPrefix} did not find any content to decode`);
  if (decoded === BREAK)
    throw Error(`${decodeErrPrefix} got unexpected break`);
  return [decoded, data.subarray(tokeniser.pos())];
}
function decode(data, options) {
  let [decoded, remainder] = decodeFirst(data, options);
  if (remainder.length > 0)
    throw Error(`${decodeErrPrefix} too many terminals, data makes no sense`);
  return decoded;
}

// node_modules/cborg/lib/tagged.js
class Tagged {
  constructor(tag, value) {
    if (typeof tag !== "number" || !Number.isInteger(tag) || tag < 0)
      throw TypeError("Tagged: tag must be a non-negative integer");
    this.tag = tag, this.value = value;
  }
  static decoder(tag) {
    return (decode2) => new Tagged(tag, decode2());
  }
  static preserve(...tagNumbers) {
    let tags = {};
    for (let tag of tagNumbers)
      tags[tag] = Tagged.decoder(tag);
    return tags;
  }
}
Object.defineProperty(Tagged.prototype, Symbol.toStringTag, {
  value: "Tagged"
});

// node_modules/multiformats/dist/src/bytes.js
var empty = new Uint8Array(0);
function equals(aa, bb) {
  if (aa === bb)
    return !0;
  if (aa.byteLength !== bb.byteLength)
    return !1;
  for (let ii = 0;ii < aa.byteLength; ii++)
    if (aa[ii] !== bb[ii])
      return !1;
  return !0;
}
function coerce(o) {
  if (o instanceof Uint8Array && o.constructor.name === "Uint8Array")
    return toArrayBufferBackedArray(o);
  if (o instanceof ArrayBuffer)
    return new Uint8Array(o);
  if (ArrayBuffer.isView(o))
    return toArrayBufferBackedArray(new Uint8Array(o.buffer, o.byteOffset, o.byteLength));
  throw Error("Unknown type, must be binary type");
}
function isByteArrayWithArrayBuffer(b) {
  return b?.buffer instanceof ArrayBuffer;
}
function toArrayBufferBackedArray(b) {
  if (isByteArrayWithArrayBuffer(b))
    return b;
  return b.slice();
}

// node_modules/multiformats/dist/src/vendor/base-x.js
function base(ALPHABET, name, caseInsensitive) {
  if (ALPHABET.length >= 255)
    throw TypeError("Alphabet too long");
  var BASE_MAP = new Uint8Array(256);
  for (var j = 0;j < BASE_MAP.length; j++)
    BASE_MAP[j] = 255;
  for (var i = 0;i < ALPHABET.length; i++) {
    var x = ALPHABET.charAt(i), xc = x.charCodeAt(0);
    if (BASE_MAP[xc] !== 255)
      throw TypeError(x + " is ambiguous");
    if (BASE_MAP[xc] = i, caseInsensitive) {
      var xl = x.toLowerCase().charCodeAt(0), xu = x.toUpperCase().charCodeAt(0);
      if (xl !== xc)
        BASE_MAP[xl] = i;
      if (xu !== xc)
        BASE_MAP[xu] = i;
    }
  }
  var BASE = ALPHABET.length, LEADER = ALPHABET.charAt(0), FACTOR = Math.log(BASE) / Math.log(256), iFACTOR = Math.log(256) / Math.log(BASE);
  function encode2(source) {
    if (source instanceof Uint8Array)
      ;
    else if (ArrayBuffer.isView(source))
      source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    else if (Array.isArray(source))
      source = Uint8Array.from(source);
    if (!(source instanceof Uint8Array))
      throw TypeError("Expected Uint8Array");
    if (source.length === 0)
      return "";
    var zeroes = 0, length = 0, pbegin = 0, pend = source.length;
    while (pbegin !== pend && source[pbegin] === 0)
      pbegin++, zeroes++;
    var size = (pend - pbegin) * iFACTOR + 1 >>> 0, b58 = new Uint8Array(size);
    while (pbegin !== pend) {
      var carry = source[pbegin], i2 = 0;
      for (var it1 = size - 1;(carry !== 0 || i2 < length) && it1 !== -1; it1--, i2++)
        carry += 256 * b58[it1] >>> 0, b58[it1] = carry % BASE >>> 0, carry = carry / BASE >>> 0;
      if (carry !== 0)
        throw Error("Non-zero carry");
      length = i2, pbegin++;
    }
    var it2 = size - length;
    while (it2 !== size && b58[it2] === 0)
      it2++;
    var str = LEADER.repeat(zeroes);
    for (;it2 < size; ++it2)
      str += ALPHABET.charAt(b58[it2]);
    return str;
  }
  function decodeUnsafe(source) {
    if (typeof source !== "string")
      throw TypeError("Expected String");
    if (source.length === 0)
      return new Uint8Array;
    var psz = 0;
    if (source[psz] === " ")
      return;
    var zeroes = 0, length = 0;
    while (source[psz] === LEADER)
      zeroes++, psz++;
    var size = (source.length - psz) * FACTOR + 1 >>> 0, b256 = new Uint8Array(size);
    while (source[psz]) {
      var carry = BASE_MAP[source.charCodeAt(psz)];
      if (carry === 255)
        return;
      var i2 = 0;
      for (var it3 = size - 1;(carry !== 0 || i2 < length) && it3 !== -1; it3--, i2++)
        carry += BASE * b256[it3] >>> 0, b256[it3] = carry % 256 >>> 0, carry = carry / 256 >>> 0;
      if (carry !== 0)
        throw Error("Non-zero carry");
      length = i2, psz++;
    }
    if (source[psz] === " ")
      return;
    var it4 = size - length;
    while (it4 !== size && b256[it4] === 0)
      it4++;
    var vch = new Uint8Array(zeroes + (size - it4)), j2 = zeroes;
    while (it4 !== size)
      vch[j2++] = b256[it4++];
    return vch;
  }
  function decode2(string) {
    var buffer2 = decodeUnsafe(string);
    if (buffer2)
      return buffer2;
    throw Error(`Non-${name} character`);
  }
  return {
    encode: encode2,
    decodeUnsafe,
    decode: decode2
  };
}
var src = base, _brrp__multiformats_scope_baseX = src, base_x_default = _brrp__multiformats_scope_baseX;

// node_modules/multiformats/dist/src/bases/base.js
class Encoder {
  name;
  prefix;
  baseEncode;
  constructor(name, prefix, baseEncode) {
    this.name = name, this.prefix = prefix, this.baseEncode = baseEncode;
  }
  encode(bytes) {
    if (bytes instanceof Uint8Array)
      return `${this.prefix}${this.baseEncode(bytes)}`;
    else
      throw Error("Unknown type, must be binary type");
  }
}

class Decoder {
  name;
  prefix;
  baseDecode;
  prefixCodePoint;
  constructor(name, prefix, baseDecode) {
    this.name = name, this.prefix = prefix;
    let prefixCodePoint = prefix.codePointAt(0);
    if (prefixCodePoint === void 0)
      throw Error("Invalid prefix character");
    this.prefixCodePoint = prefixCodePoint, this.baseDecode = baseDecode;
  }
  decode(text) {
    if (typeof text === "string") {
      if (text.codePointAt(0) !== this.prefixCodePoint)
        throw Error(`Unable to decode multibase string ${JSON.stringify(text)}, ${this.name} decoder only supports inputs prefixed with ${this.prefix}`);
      return this.baseDecode(text.slice(this.prefix.length));
    } else
      throw Error("Can only multibase decode strings");
  }
  or(decoder) {
    return or(this, decoder);
  }
}

class ComposedDecoder {
  decoders;
  constructor(decoders) {
    this.decoders = decoders;
  }
  or(decoder) {
    return or(this, decoder);
  }
  decode(input) {
    let prefix = input[0], decoder = this.decoders[prefix];
    if (decoder != null)
      return decoder.decode(input);
    else
      throw RangeError(`Unable to decode multibase string ${JSON.stringify(input)}, only inputs prefixed with ${Object.keys(this.decoders)} are supported`);
  }
}
function or(left, right) {
  return new ComposedDecoder({
    ...left.decoders ?? { [left.prefix]: left },
    ...right.decoders ?? { [right.prefix]: right }
  });
}

class Codec {
  name;
  prefix;
  baseEncode;
  baseDecode;
  encoder;
  decoder;
  constructor(name, prefix, baseEncode, baseDecode) {
    this.name = name, this.prefix = prefix, this.baseEncode = baseEncode, this.baseDecode = baseDecode, this.encoder = new Encoder(name, prefix, baseEncode), this.decoder = new Decoder(name, prefix, baseDecode);
  }
  encode(input) {
    return this.encoder.encode(input);
  }
  decode(input) {
    return this.decoder.decode(input);
  }
}
function from({ name, prefix, encode: encode2, decode: decode2 }) {
  return new Codec(name, prefix, encode2, decode2);
}
function baseX({ name, prefix, alphabet, caseInsensitive = !1 }) {
  let { encode: encode2, decode: decode2 } = base_x_default(alphabet, name, caseInsensitive);
  return from({
    prefix,
    name,
    encode: encode2,
    decode: (text) => coerce(decode2(text))
  });
}
function decode2(string, alphabetIdx, bitsPerChar, name) {
  let end = string.length;
  while (string[end - 1] === "=")
    --end;
  let out = new Uint8Array(end * bitsPerChar / 8 | 0), bits = 0, buffer2 = 0, written = 0;
  for (let i = 0;i < end; ++i) {
    let value = alphabetIdx[string[i]];
    if (value === void 0)
      throw SyntaxError(`Non-${name} character`);
    if (buffer2 = buffer2 << bitsPerChar | value, bits += bitsPerChar, bits >= 8)
      bits -= 8, out[written++] = 255 & buffer2 >> bits;
  }
  if (bits >= bitsPerChar || (255 & buffer2 << 8 - bits) !== 0)
    throw SyntaxError("Unexpected end of data");
  return out;
}
function encode2(data, alphabet, bitsPerChar) {
  let pad = alphabet[alphabet.length - 1] === "=", mask = (1 << bitsPerChar) - 1, out = "", bits = 0, buffer2 = 0;
  for (let i = 0;i < data.length; ++i) {
    buffer2 = buffer2 << 8 | data[i], bits += 8;
    while (bits > bitsPerChar)
      bits -= bitsPerChar, out += alphabet[mask & buffer2 >> bits];
  }
  if (bits !== 0)
    out += alphabet[mask & buffer2 << bitsPerChar - bits];
  if (pad)
    while ((out.length * bitsPerChar & 7) !== 0)
      out += "=";
  return out;
}
function createAlphabetIdx(alphabet, caseInsensitive) {
  let alphabetIdx = {};
  for (let i = 0;i < alphabet.length; ++i)
    if (alphabetIdx[alphabet[i]] = i, caseInsensitive) {
      let lower = alphabet[i].toLowerCase(), upper = alphabet[i].toUpperCase();
      if (lower !== alphabet[i])
        alphabetIdx[lower] = i;
      if (upper !== alphabet[i])
        alphabetIdx[upper] = i;
    }
  return alphabetIdx;
}
function rfc4648({ name, prefix, bitsPerChar, alphabet, caseInsensitive = !1 }) {
  let alphabetIdx = createAlphabetIdx(alphabet, caseInsensitive);
  return from({
    prefix,
    name,
    encode(input) {
      return encode2(input, alphabet, bitsPerChar);
    },
    decode(input) {
      return decode2(input, alphabetIdx, bitsPerChar, name);
    }
  });
}

// node_modules/multiformats/dist/src/bases/base32.js
var base32 = rfc4648({
  prefix: "b",
  name: "base32",
  alphabet: "abcdefghijklmnopqrstuvwxyz234567",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32upper = rfc4648({
  prefix: "B",
  name: "base32upper",
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32pad = rfc4648({
  prefix: "c",
  name: "base32pad",
  alphabet: "abcdefghijklmnopqrstuvwxyz234567=",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32padupper = rfc4648({
  prefix: "C",
  name: "base32padupper",
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32hex = rfc4648({
  prefix: "v",
  name: "base32hex",
  alphabet: "0123456789abcdefghijklmnopqrstuv",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32hexupper = rfc4648({
  prefix: "V",
  name: "base32hexupper",
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32hexpad = rfc4648({
  prefix: "t",
  name: "base32hexpad",
  alphabet: "0123456789abcdefghijklmnopqrstuv=",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32hexpadupper = rfc4648({
  prefix: "T",
  name: "base32hexpadupper",
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV=",
  bitsPerChar: 5,
  caseInsensitive: !0
}), base32z = rfc4648({
  prefix: "h",
  name: "base32z",
  alphabet: "ybndrfg8ejkmcpqxot1uwisza345h769",
  bitsPerChar: 5
});

// node_modules/multiformats/dist/src/bases/base36.js
var base36 = baseX({
  prefix: "k",
  name: "base36",
  alphabet: "0123456789abcdefghijklmnopqrstuvwxyz",
  caseInsensitive: !0
}), base36upper = baseX({
  prefix: "K",
  name: "base36upper",
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  caseInsensitive: !0
});

// node_modules/multiformats/dist/src/bases/base58.js
var base58btc = baseX({
  name: "base58btc",
  prefix: "z",
  alphabet: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
}), base58flickr = baseX({
  name: "base58flickr",
  prefix: "Z",
  alphabet: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
});

// node_modules/multiformats/dist/src/vendor/varint.js
var encode_1 = encode3, MSB = 128, REST = 127, MSBALL = ~REST, INT = Math.pow(2, 31);
function encode3(num, out, offset) {
  out = out || [], offset = offset || 0;
  var oldOffset = offset;
  while (num >= INT)
    out[offset++] = num & 255 | MSB, num /= 128;
  while (num & MSBALL)
    out[offset++] = num & 255 | MSB, num >>>= 7;
  return out[offset] = num | 0, encode3.bytes = offset - oldOffset + 1, out;
}
var decode3 = read, MSB$1 = 128, REST$1 = 127;
function read(buf, offset) {
  var res = 0, offset = offset || 0, shift = 0, counter = offset, b, l = buf.length;
  do {
    if (counter >= l)
      throw read.bytes = 0, RangeError("Could not decode varint");
    b = buf[counter++], res += shift < 28 ? (b & REST$1) << shift : (b & REST$1) * Math.pow(2, shift), shift += 7;
  } while (b >= MSB$1);
  return read.bytes = counter - offset, res;
}
var N1 = Math.pow(2, 7), N2 = Math.pow(2, 14), N3 = Math.pow(2, 21), N4 = Math.pow(2, 28), N5 = Math.pow(2, 35), N6 = Math.pow(2, 42), N7 = Math.pow(2, 49), N8 = Math.pow(2, 56), N9 = Math.pow(2, 63), length = function(value) {
  return value < N1 ? 1 : value < N2 ? 2 : value < N3 ? 3 : value < N4 ? 4 : value < N5 ? 5 : value < N6 ? 6 : value < N7 ? 7 : value < N8 ? 8 : value < N9 ? 9 : 10;
}, varint = {
  encode: encode_1,
  decode: decode3,
  encodingLength: length
}, _brrp_varint = varint, varint_default = _brrp_varint;

// node_modules/multiformats/dist/src/varint.js
function decode4(data, offset = 0) {
  let code = varint_default.decode(data, offset), length2 = varint_default.decode.bytes;
  if (length2 > 9)
    throw RangeError("Invalid varint: too long");
  if (length2 > 1 && data[offset + length2 - 1] === 0)
    throw RangeError("Invalid varint: not minimally encoded");
  return [code, length2];
}
function encodeTo(int, target, offset = 0) {
  return varint_default.encode(int, target, offset), target;
}
function encodingLength(int) {
  return varint_default.encodingLength(int);
}

// node_modules/multiformats/dist/src/hashes/digest.js
function create(code, digest) {
  let size = digest.byteLength, sizeOffset = encodingLength(code), digestOffset = sizeOffset + encodingLength(size), bytes = new Uint8Array(digestOffset + size);
  return encodeTo(code, bytes, 0), encodeTo(size, bytes, sizeOffset), bytes.set(digest, digestOffset), new Digest(code, size, digest, bytes);
}
function decode5(multihash) {
  let bytes = coerce(multihash), [code, sizeOffset] = decode4(bytes), [size, digestOffset] = decode4(bytes.subarray(sizeOffset)), digest = bytes.subarray(sizeOffset + digestOffset);
  if (digest.byteLength !== size)
    throw Error("Incorrect length");
  return new Digest(code, size, digest, bytes);
}
function equals2(a, b) {
  if (a === b)
    return !0;
  else {
    let data = b;
    return a.code === data.code && a.size === data.size && data.bytes instanceof Uint8Array && equals(a.bytes, data.bytes);
  }
}

class Digest {
  code;
  size;
  digest;
  bytes;
  constructor(code, size, digest, bytes) {
    this.code = code, this.size = size, this.digest = toArrayBufferBackedArray(digest), this.bytes = toArrayBufferBackedArray(bytes);
  }
}

// node_modules/multiformats/dist/src/cid.js
function format(link, base2) {
  let { bytes, version } = link;
  switch (version) {
    case 0:
      return toStringV0(bytes, baseCache(link), base2 ?? base58btc.encoder);
    default:
      return toStringV1(bytes, baseCache(link), base2 ?? base32.encoder);
  }
}
var cache = /* @__PURE__ */ new WeakMap;
function baseCache(cid) {
  let baseCache2 = cache.get(cid);
  if (baseCache2 == null) {
    let baseCache3 = /* @__PURE__ */ new Map;
    return cache.set(cid, baseCache3), baseCache3;
  }
  return baseCache2;
}

class CID {
  code;
  version;
  multihash;
  bytes;
  "/";
  constructor(version, code, multihash, bytes) {
    this.code = code, this.version = version, this.multihash = multihash, this.bytes = toArrayBufferBackedArray(bytes), this["/"] = this.bytes;
  }
  get asCID() {
    return this;
  }
  get byteOffset() {
    return this.bytes.byteOffset;
  }
  get byteLength() {
    return this.bytes.byteLength;
  }
  toV0() {
    switch (this.version) {
      case 0:
        return this;
      case 1: {
        let { code, multihash } = this;
        if (code !== DAG_PB_CODE)
          throw Error("Cannot convert a non dag-pb CID to CIDv0");
        if (multihash.code !== SHA_256_CODE)
          throw Error("Cannot convert non sha2-256 multihash CID to CIDv0");
        return CID.createV0(multihash);
      }
      default:
        throw Error(`Can not convert CID version ${this.version} to version 0. This is a bug please report`);
    }
  }
  toV1() {
    switch (this.version) {
      case 0: {
        let { code, digest } = this.multihash, multihash = create(code, digest);
        return CID.createV1(this.code, multihash);
      }
      case 1:
        return this;
      default:
        throw Error(`Can not convert CID version ${this.version} to version 1. This is a bug please report`);
    }
  }
  equals(other) {
    return CID.equals(this, other);
  }
  static equals(self, other) {
    let unknown = other;
    return unknown != null && self.code === unknown.code && self.version === unknown.version && equals2(self.multihash, unknown.multihash);
  }
  toString(base2) {
    return format(this, base2);
  }
  toJSON() {
    return { "/": format(this) };
  }
  link() {
    return this;
  }
  [Symbol.toStringTag] = "CID";
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `CID(${this.toString()})`;
  }
  static asCID(input) {
    if (input == null)
      return null;
    let value = input;
    if (value instanceof CID)
      return value;
    else if (value["/"] != null && value["/"] === value.bytes || value.asCID === value) {
      let { version, code, multihash, bytes } = value;
      return new CID(version, code, multihash, bytes ?? encodeCID(version, code, multihash.bytes));
    } else if (value[cidSymbol] === !0) {
      let { version, multihash, code } = value, digest = decode5(multihash);
      return CID.create(version, code, digest);
    } else
      return null;
  }
  static create(version, code, digest) {
    if (typeof code !== "number")
      throw Error("String codecs are no longer supported");
    if (!(digest.bytes instanceof Uint8Array))
      throw Error("Invalid digest");
    switch (version) {
      case 0:
        if (code !== DAG_PB_CODE)
          throw Error(`Version 0 CID must use dag-pb (code: ${DAG_PB_CODE}) block encoding`);
        else
          return new CID(version, code, digest, digest.bytes);
      case 1: {
        let bytes = encodeCID(version, code, digest.bytes);
        return new CID(version, code, digest, bytes);
      }
      default:
        throw Error("Invalid version");
    }
  }
  static createV0(digest) {
    return CID.create(0, DAG_PB_CODE, digest);
  }
  static createV1(code, digest) {
    return CID.create(1, code, digest);
  }
  static decode(bytes) {
    let [cid, remainder] = CID.decodeFirst(bytes);
    if (remainder.length !== 0)
      throw Error("Incorrect length");
    return cid;
  }
  static decodeFirst(bytes) {
    let specs = CID.inspectBytes(bytes), prefixSize = specs.size - specs.multihashSize, multihashBytes = coerce(bytes.subarray(prefixSize, prefixSize + specs.multihashSize));
    if (multihashBytes.byteLength !== specs.multihashSize)
      throw Error("Incorrect length");
    let digestBytes = multihashBytes.subarray(specs.multihashSize - specs.digestSize), digest = new Digest(specs.multihashCode, specs.digestSize, digestBytes, multihashBytes);
    return [specs.version === 0 ? CID.createV0(digest) : CID.createV1(specs.codec, digest), bytes.subarray(specs.size)];
  }
  static inspectBytes(initialBytes) {
    let offset = 0, next = () => {
      let [i, length2] = decode4(initialBytes.subarray(offset));
      return offset += length2, i;
    }, version = next(), codec = DAG_PB_CODE;
    if (version === 18)
      version = 0, offset = 0;
    else
      codec = next();
    if (version !== 0 && version !== 1)
      throw RangeError(`Invalid CID version ${version}`);
    let prefixSize = offset, multihashCode = next(), digestSize = next(), size = offset + digestSize, multihashSize = size - prefixSize;
    return { version, codec, multihashCode, digestSize, multihashSize, size };
  }
  static parse(source, base2) {
    let [prefix, bytes] = parseCIDtoBytes(source, base2), cid = CID.decode(bytes);
    if (cid.version === 0 && source[0] !== "Q")
      throw Error("Version 0 CID string must not include multibase prefix");
    return baseCache(cid).set(prefix, source), cid;
  }
}
function parseCIDtoBytes(source, base2) {
  switch (source[0]) {
    case "Q": {
      let decoder = base2 ?? base58btc;
      return [
        base58btc.prefix,
        decoder.decode(`${base58btc.prefix}${source}`)
      ];
    }
    case base58btc.prefix: {
      let decoder = base2 ?? base58btc;
      return [base58btc.prefix, decoder.decode(source)];
    }
    case base32.prefix: {
      let decoder = base2 ?? base32;
      return [base32.prefix, decoder.decode(source)];
    }
    case base36.prefix: {
      let decoder = base2 ?? base36;
      return [base36.prefix, decoder.decode(source)];
    }
    default: {
      if (base2 == null)
        throw Error("To parse non base32, base36 or base58btc encoded CID multibase decoder must be provided");
      return [source[0], base2.decode(source)];
    }
  }
}
function toStringV0(bytes, cache2, base2) {
  let { prefix } = base2;
  if (prefix !== base58btc.prefix)
    throw Error(`Cannot string encode V0 in ${base2.name} encoding`);
  let cid = cache2.get(prefix);
  if (cid == null) {
    let cid2 = base2.encode(bytes).slice(1);
    return cache2.set(prefix, cid2), cid2;
  } else
    return cid;
}
function toStringV1(bytes, cache2, base2) {
  let { prefix } = base2, cid = cache2.get(prefix);
  if (cid == null) {
    let cid2 = base2.encode(bytes);
    return cache2.set(prefix, cid2), cid2;
  } else
    return cid;
}
var DAG_PB_CODE = 112, SHA_256_CODE = 18;
function encodeCID(version, code, multihash) {
  let codeOffset = encodingLength(version), hashOffset = codeOffset + encodingLength(code), bytes = new Uint8Array(hashOffset + multihash.byteLength);
  return encodeTo(version, bytes, 0), encodeTo(code, bytes, codeOffset), bytes.set(multihash, hashOffset), bytes;
}
var cidSymbol = Symbol.for("@ipld/js-cid/CID");

// node_modules/@ipld/dag-cbor/src/index.js
var CID_CBOR_TAG = 42;
function toByteView(buf) {
  if (buf instanceof ArrayBuffer)
    return new Uint8Array(buf, 0, buf.byteLength);
  return buf;
}
function cidEncoder(obj) {
  if (obj.asCID !== obj && obj["/"] !== obj.bytes)
    return null;
  let cid = CID.asCID(obj);
  if (!cid)
    return null;
  let bytes = new Uint8Array(cid.bytes.byteLength + 1);
  return bytes.set(cid.bytes, 1), [
    new Token(Type.tag, CID_CBOR_TAG),
    new Token(Type.bytes, bytes)
  ];
}
function undefinedEncoder() {
  throw Error("`undefined` is not supported by the IPLD Data Model and cannot be encoded");
}
function numberEncoder(num) {
  if (Number.isNaN(num))
    throw Error("`NaN` is not supported by the IPLD Data Model and cannot be encoded");
  if (num === 1 / 0 || num === -1 / 0)
    throw Error("`Infinity` and `-Infinity` is not supported by the IPLD Data Model and cannot be encoded");
  return null;
}
function mapEncoder(map) {
  for (let key of map.keys())
    if (typeof key !== "string" || key.length === 0)
      throw Error("Non-string Map keys are not supported by the IPLD Data Model and cannot be encoded");
  return null;
}
var _encodeOptions = {
  float64: !0,
  typeEncoders: {
    Map: mapEncoder,
    Object: cidEncoder,
    undefined: undefinedEncoder,
    number: numberEncoder
  }
}, encodeOptions = {
  ..._encodeOptions,
  typeEncoders: {
    ..._encodeOptions.typeEncoders
  }
};
function cidDecoder(decode6) {
  let bytes = decode6();
  if (bytes[0] !== 0)
    throw Error("Invalid CID for CBOR tag 42; expected leading 0x00");
  return CID.decode(bytes.subarray(1));
}
var _decodeOptions = {
  allowIndefinite: !1,
  coerceUndefinedToNull: !0,
  allowNaN: !1,
  allowInfinity: !1,
  allowBigInt: !0,
  strict: !0,
  useMaps: !1,
  rejectDuplicateMapKeys: !0,
  tags: { [CID_CBOR_TAG]: cidDecoder }
}, decodeOptions = {
  ..._decodeOptions,
  tags: { ..._decodeOptions.tags }
};
var code = 113, encode4 = (node) => encode(node, _encodeOptions), decode6 = (data) => decode(toByteView(data), _decodeOptions);

// node_modules/multiformats/dist/src/codecs/raw.js
var code2 = 85;

// node_modules/multiformats/dist/src/hashes/hasher.js
var DEFAULT_MIN_DIGEST_LENGTH = 20;
function from2({ name, code: code3, encode: encode5, minDigestLength, maxDigestLength }) {
  return new Hasher(name, code3, encode5, minDigestLength, maxDigestLength);
}

class Hasher {
  name;
  code;
  encode;
  minDigestLength;
  maxDigestLength;
  constructor(name, code3, encode5, minDigestLength, maxDigestLength) {
    this.name = name, this.code = code3, this.encode = encode5, this.minDigestLength = minDigestLength ?? DEFAULT_MIN_DIGEST_LENGTH, this.maxDigestLength = maxDigestLength;
  }
  digest(input, options) {
    if (options?.truncate != null) {
      if (options.truncate < this.minDigestLength)
        throw Error(`Invalid truncate option, must be greater than or equal to ${this.minDigestLength}`);
      if (this.maxDigestLength != null && options.truncate > this.maxDigestLength)
        throw Error(`Invalid truncate option, must be less than or equal to ${this.maxDigestLength}`);
    }
    if (input instanceof Uint8Array) {
      let result = this.encode(input);
      if (result instanceof Uint8Array)
        return createDigest(result, this.code, options?.truncate);
      return result.then((digest) => createDigest(digest, this.code, options?.truncate));
    } else
      throw Error("Unknown type, must be binary type");
  }
}
function createDigest(digest, code3, truncate) {
  if (truncate != null && truncate !== digest.byteLength) {
    if (truncate > digest.byteLength)
      throw Error(`Invalid truncate option, must be less than or equal to ${digest.byteLength}`);
    digest = digest.subarray(0, truncate);
  }
  return create(code3, digest);
}

// node_modules/multiformats/dist/src/hashes/sha2-browser.js
function sha(name) {
  return async (data) => new Uint8Array(await crypto.subtle.digest(name, data));
}
var sha256 = from2({
  name: "sha2-256",
  code: 18,
  encode: sha("SHA-256")
}), sha512 = from2({
  name: "sha2-512",
  code: 19,
  encode: sha("SHA-512")
});

// node_modules/@ipld/car/src/decoder-common.js
var import_varint2 = __toESM(require_varint(), 1), CIDV0_BYTES = {
  SHA2_256: 18,
  LENGTH: 32,
  DAG_PB: 112
}, V2_HEADER_LENGTH = 40;
function decodeVarint(bytes, seeker) {
  if (!bytes.length)
    throw Error("Unexpected end of data");
  let i = import_varint2.default.decode(bytes);
  return seeker.seek(import_varint2.default.decode.bytes), i;
}
function decodeV2Header(bytes) {
  let dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset = 0;
  return {
    version: 2,
    characteristics: [
      dv.getBigUint64(offset, !0),
      dv.getBigUint64(offset += 8, !0)
    ],
    dataOffset: Number(dv.getBigUint64(offset += 8, !0)),
    dataSize: Number(dv.getBigUint64(offset += 8, !0)),
    indexOffset: Number(dv.getBigUint64(offset += 8, !0))
  };
}
function getMultihashLength(bytes) {
  import_varint2.default.decode(bytes);
  let codeLength = import_varint2.default.decode.bytes, length2 = import_varint2.default.decode(bytes.subarray(import_varint2.default.decode.bytes)), lengthLength = import_varint2.default.decode.bytes;
  return codeLength + lengthLength + length2;
}

// node_modules/@ipld/car/src/header-validator.js
var Kinds = {
  Null: (obj) => obj === null ? obj : void 0,
  Int: (obj) => Number.isInteger(obj) ? obj : void 0,
  Float: (obj) => typeof obj === "number" && Number.isFinite(obj) ? obj : void 0,
  String: (obj) => typeof obj === "string" ? obj : void 0,
  Bool: (obj) => typeof obj === "boolean" ? obj : void 0,
  Bytes: (obj) => obj instanceof Uint8Array ? obj : void 0,
  Link: (obj) => obj !== null && typeof obj === "object" && obj.asCID === obj ? obj : void 0,
  List: (obj) => Array.isArray(obj) ? obj : void 0,
  Map: (obj) => obj !== null && typeof obj === "object" && obj.asCID !== obj && !Array.isArray(obj) && !(obj instanceof Uint8Array) ? obj : void 0
}, Types = {
  "CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)": Kinds.Link,
  "CarV1HeaderOrV2Pragma > roots (anon)": (obj) => {
    if (Kinds.List(obj) === void 0)
      return;
    for (let i = 0;i < obj.length; i++) {
      let v = obj[i];
      if (v = Types["CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)"](v), v === void 0)
        return;
      if (v !== obj[i]) {
        let ret = obj.slice(0, i);
        for (let j = i;j < obj.length; j++) {
          let v2 = obj[j];
          if (v2 = Types["CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)"](v2), v2 === void 0)
            return;
          ret.push(v2);
        }
        return ret;
      }
    }
    return obj;
  },
  Int: Kinds.Int,
  CarV1HeaderOrV2Pragma: (obj) => {
    if (Kinds.Map(obj) === void 0)
      return;
    let entries = Object.entries(obj), ret = obj, requiredCount = 1;
    for (let i = 0;i < entries.length; i++) {
      let [key, value] = entries[i];
      switch (key) {
        case "roots":
          {
            let v = Types["CarV1HeaderOrV2Pragma > roots (anon)"](obj[key]);
            if (v === void 0)
              return;
            if (v !== value || ret !== obj) {
              if (ret === obj) {
                ret = {};
                for (let j = 0;j < i; j++)
                  ret[entries[j][0]] = entries[j][1];
              }
              ret.roots = v;
            }
          }
          break;
        case "version":
          {
            requiredCount--;
            let v = Types.Int(obj[key]);
            if (v === void 0)
              return;
            if (v !== value || ret !== obj) {
              if (ret === obj) {
                ret = {};
                for (let j = 0;j < i; j++)
                  ret[entries[j][0]] = entries[j][1];
              }
              ret.version = v;
            }
          }
          break;
        default:
          return;
      }
    }
    if (requiredCount > 0)
      return;
    return ret;
  }
}, Reprs = {
  "CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)": Kinds.Link,
  "CarV1HeaderOrV2Pragma > roots (anon)": (obj) => {
    if (Kinds.List(obj) === void 0)
      return;
    for (let i = 0;i < obj.length; i++) {
      let v = obj[i];
      if (v = Reprs["CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)"](v), v === void 0)
        return;
      if (v !== obj[i]) {
        let ret = obj.slice(0, i);
        for (let j = i;j < obj.length; j++) {
          let v2 = obj[j];
          if (v2 = Reprs["CarV1HeaderOrV2Pragma > roots (anon) > valueType (anon)"](v2), v2 === void 0)
            return;
          ret.push(v2);
        }
        return ret;
      }
    }
    return obj;
  },
  Int: Kinds.Int,
  CarV1HeaderOrV2Pragma: (obj) => {
    if (Kinds.Map(obj) === void 0)
      return;
    let entries = Object.entries(obj), ret = obj, requiredCount = 1;
    for (let i = 0;i < entries.length; i++) {
      let [key, value] = entries[i];
      switch (key) {
        case "roots":
          {
            let v = Reprs["CarV1HeaderOrV2Pragma > roots (anon)"](value);
            if (v === void 0)
              return;
            if (v !== value || ret !== obj) {
              if (ret === obj) {
                ret = {};
                for (let j = 0;j < i; j++)
                  ret[entries[j][0]] = entries[j][1];
              }
              ret.roots = v;
            }
          }
          break;
        case "version":
          {
            requiredCount--;
            let v = Reprs.Int(value);
            if (v === void 0)
              return;
            if (v !== value || ret !== obj) {
              if (ret === obj) {
                ret = {};
                for (let j = 0;j < i; j++)
                  ret[entries[j][0]] = entries[j][1];
              }
              ret.version = v;
            }
          }
          break;
        default:
          return;
      }
    }
    if (requiredCount > 0)
      return;
    return ret;
  }
}, CarV1HeaderOrV2Pragma = {
  toTyped: Types.CarV1HeaderOrV2Pragma,
  toRepresentation: Reprs.CarV1HeaderOrV2Pragma
};

// node_modules/@ipld/car/src/buffer-writer.js
var exports_buffer_writer = {};
__export(exports_buffer_writer, {
  addBlock: () => addBlock,
  addRoot: () => addRoot,
  blockLength: () => blockLength,
  calculateHeaderLength: () => calculateHeaderLength,
  close: () => close,
  createWriter: () => createWriter,
  estimateHeaderLength: () => estimateHeaderLength,
  headerLength: () => headerLength,
  resizeHeader: () => resizeHeader
});

// node_modules/cborg/lib/length.js
var cborEncoders2 = makeCborEncoders(), defaultEncodeOptions2 = {
  float64: !1,
  quickEncodeToken
};
function tokensToLength(tokens, encoders = cborEncoders2, options = defaultEncodeOptions2) {
  if (Array.isArray(tokens)) {
    let len = 0;
    for (let token of tokens)
      len += tokensToLength(token, encoders, options);
    return len;
  } else {
    let encoder = encoders[tokens.type.major];
    if (encoder.encodedSize === void 0 || typeof encoder.encodedSize !== "function")
      throw Error(`Encoder for ${tokens.type.name} does not have an encodedSize()`);
    return encoder.encodedSize(tokens, options);
  }
}

// node_modules/@ipld/car/src/buffer-writer.js
var import_varint3 = __toESM(require_varint(), 1);

class CarBufferWriter {
  constructor(bytes, headerSize) {
    this.bytes = bytes, this.byteOffset = headerSize, this.roots = [], this.headerSize = headerSize;
  }
  addRoot(root, options) {
    return addRoot(this, root, options), this;
  }
  write(block) {
    return addBlock(this, block), this;
  }
  close(options) {
    return close(this, options);
  }
}
var addRoot = (writer, root, options = {}) => {
  let { resize = !1 } = options, { bytes, headerSize, byteOffset, roots } = writer;
  writer.roots.push(root);
  let size = headerLength(writer);
  if (size > headerSize)
    if (size - headerSize + byteOffset < bytes.byteLength)
      if (resize)
        resizeHeader(writer, size);
      else
        throw roots.pop(), RangeError(`Header of size ${headerSize} has no capacity for new root ${root}.
  However there is a space in the buffer and you could call addRoot(root, { resize: root }) to resize header to make a space for this root.`);
    else
      throw roots.pop(), RangeError(`Buffer has no capacity for a new root ${root}`);
}, blockLength = ({ cid, bytes }) => {
  let size = cid.bytes.byteLength + bytes.byteLength;
  return import_varint3.default.encodingLength(size) + size;
}, addBlock = (writer, { cid, bytes }) => {
  let byteLength = cid.bytes.byteLength + bytes.byteLength, size = import_varint3.default.encode(byteLength);
  if (writer.byteOffset + size.length + byteLength > writer.bytes.byteLength)
    throw RangeError("Buffer has no capacity for this block");
  else
    writeBytes(writer, size), writeBytes(writer, cid.bytes), writeBytes(writer, bytes);
}, close = (writer, options = {}) => {
  let { resize = !1 } = options, { roots, bytes, byteOffset, headerSize } = writer, headerBytes = encode4({ version: 1, roots }), varintBytes = import_varint3.default.encode(headerBytes.length), size = varintBytes.length + headerBytes.byteLength;
  if (headerSize - size === 0)
    return writeHeader(writer, varintBytes, headerBytes), bytes.subarray(0, byteOffset);
  else if (resize)
    return resizeHeader(writer, size), writeHeader(writer, varintBytes, headerBytes), bytes.subarray(0, writer.byteOffset);
  else
    throw RangeError(`Header size was overestimated.
You can use close({ resize: true }) to resize header`);
}, resizeHeader = (writer, byteLength) => {
  let { bytes, headerSize } = writer;
  bytes.set(bytes.subarray(headerSize, writer.byteOffset), byteLength), writer.byteOffset += byteLength - headerSize, writer.headerSize = byteLength;
}, writeBytes = (writer, bytes) => {
  writer.bytes.set(bytes, writer.byteOffset), writer.byteOffset += bytes.length;
}, writeHeader = ({ bytes }, varint4, header) => {
  bytes.set(varint4), bytes.set(header, varint4.length);
}, headerPreludeTokens = [
  new Token(Type.map, 2),
  new Token(Type.string, "version"),
  new Token(Type.uint, 1),
  new Token(Type.string, "roots")
], CID_TAG = new Token(Type.tag, 42), calculateHeaderLength = (rootLengths) => {
  let tokens = [...headerPreludeTokens];
  tokens.push(new Token(Type.array, rootLengths.length));
  for (let rootLength of rootLengths)
    tokens.push(CID_TAG), tokens.push(new Token(Type.bytes, { length: rootLength + 1 }));
  let length2 = tokensToLength(tokens);
  return import_varint3.default.encodingLength(length2) + length2;
}, headerLength = ({ roots }) => calculateHeaderLength(roots.map((cid) => cid.bytes.byteLength)), estimateHeaderLength = (rootCount, rootByteLength = 36) => calculateHeaderLength(Array(rootCount).fill(rootByteLength)), createWriter = (buffer2, options = {}) => {
  let {
    roots = [],
    byteOffset = 0,
    byteLength = buffer2.byteLength,
    headerSize = headerLength({ roots })
  } = options, bytes = new Uint8Array(buffer2, byteOffset, byteLength), writer = new CarBufferWriter(bytes, headerSize);
  for (let root of roots)
    writer.addRoot(root);
  return writer;
};

// node_modules/@ipld/car/src/decoder.js
async function readHeader(reader, strictVersion) {
  let length2 = decodeVarint(await reader.upTo(8), reader);
  if (length2 === 0)
    throw Error("Invalid CAR header (zero length)");
  let header = await reader.exactly(length2, !0), block = decode6(header);
  if (CarV1HeaderOrV2Pragma.toTyped(block) === void 0)
    throw Error("Invalid CAR header format");
  if (block.version !== 1 && block.version !== 2 || strictVersion !== void 0 && block.version !== strictVersion)
    throw Error(`Invalid CAR version: ${block.version}${strictVersion !== void 0 ? ` (expected ${strictVersion})` : ""}`);
  if (block.version === 1) {
    if (!Array.isArray(block.roots))
      throw Error("Invalid CAR header format");
    return block;
  }
  if (block.roots !== void 0)
    throw Error("Invalid CAR header format");
  let v2Header = decodeV2Header(await reader.exactly(V2_HEADER_LENGTH, !0));
  reader.seek(v2Header.dataOffset - reader.pos);
  let v1Header = await readHeader(reader, 1);
  return Object.assign(v1Header, v2Header);
}
async function readCid(reader) {
  let first = await reader.exactly(2, !1);
  if (first[0] === CIDV0_BYTES.SHA2_256 && first[1] === CIDV0_BYTES.LENGTH) {
    let bytes2 = await reader.exactly(34, !0), multihash2 = decode5(bytes2);
    return CID.create(0, CIDV0_BYTES.DAG_PB, multihash2);
  }
  let version = decodeVarint(await reader.upTo(8), reader);
  if (version !== 1)
    throw Error(`Unexpected CID version (${version})`);
  let codec = decodeVarint(await reader.upTo(8), reader), bytes = await reader.exactly(getMultihashLength(await reader.upTo(8)), !0), multihash = decode5(bytes);
  return CID.create(version, codec, multihash);
}
async function readBlockHead(reader) {
  let start = reader.pos, length2 = decodeVarint(await reader.upTo(8), reader);
  if (length2 === 0)
    throw Error("Invalid CAR section (zero length)");
  length2 += reader.pos - start;
  let cid = await readCid(reader), blockLength2 = length2 - Number(reader.pos - start);
  return { cid, length: length2, blockLength: blockLength2 };
}
async function readBlock(reader) {
  let { cid, blockLength: blockLength2 } = await readBlockHead(reader);
  return { bytes: await reader.exactly(blockLength2, !0), cid };
}
async function readBlockIndex(reader) {
  let offset = reader.pos, { cid, length: length2, blockLength: blockLength2 } = await readBlockHead(reader), index = { cid, length: length2, blockLength: blockLength2, offset, blockOffset: reader.pos };
  return reader.seek(index.blockLength), index;
}
function createDecoder(reader) {
  let headerPromise = (async () => {
    let header = await readHeader(reader);
    if (header.version === 2) {
      let v1length = reader.pos - header.dataOffset;
      reader = limitReader(reader, header.dataSize - v1length);
    }
    return header;
  })();
  return {
    header: () => headerPromise,
    async* blocks() {
      await headerPromise;
      while ((await reader.upTo(8)).length > 0)
        yield await readBlock(reader);
    },
    async* blocksIndex() {
      await headerPromise;
      while ((await reader.upTo(8)).length > 0)
        yield await readBlockIndex(reader);
    }
  };
}
function bytesReader(bytes) {
  let pos = 0;
  return {
    async upTo(length2) {
      return bytes.subarray(pos, pos + Math.min(length2, bytes.length - pos));
    },
    async exactly(length2, seek = !1) {
      if (length2 > bytes.length - pos)
        throw Error("Unexpected end of data");
      let out = bytes.subarray(pos, pos + length2);
      if (seek)
        pos += length2;
      return out;
    },
    seek(length2) {
      pos += length2;
    },
    get pos() {
      return pos;
    }
  };
}
function chunkReader(readChunk) {
  let pos = 0, have = 0, offset = 0, currentChunk = new Uint8Array(0), read2 = async (length2) => {
    have = currentChunk.length - offset;
    let bufa = [currentChunk.subarray(offset)];
    while (have < length2) {
      let chunk = await readChunk();
      if (chunk == null)
        break;
      if (have < 0) {
        if (chunk.length > have)
          bufa.push(chunk.subarray(-have));
      } else
        bufa.push(chunk);
      have += chunk.length;
    }
    currentChunk = new Uint8Array(bufa.reduce((p, c) => p + c.length, 0));
    let off = 0;
    for (let b of bufa)
      currentChunk.set(b, off), off += b.length;
    offset = 0;
  };
  return {
    async upTo(length2) {
      if (currentChunk.length - offset < length2)
        await read2(length2);
      return currentChunk.subarray(offset, offset + Math.min(currentChunk.length - offset, length2));
    },
    async exactly(length2, seek = !1) {
      if (currentChunk.length - offset < length2)
        await read2(length2);
      if (currentChunk.length - offset < length2)
        throw Error("Unexpected end of data");
      let out = currentChunk.subarray(offset, offset + length2);
      if (seek)
        pos += length2, offset += length2;
      return out;
    },
    seek(length2) {
      pos += length2, offset += length2;
    },
    get pos() {
      return pos;
    }
  };
}
function asyncIterableReader(asyncIterable) {
  let iterator = asyncIterable[Symbol.asyncIterator]();
  async function readChunk() {
    let next = await iterator.next();
    if (next.done)
      return null;
    return next.value;
  }
  return chunkReader(readChunk);
}
function limitReader(reader, byteLimit) {
  let bytesRead = 0;
  return {
    async upTo(length2) {
      let bytes = await reader.upTo(length2);
      if (bytes.length + bytesRead > byteLimit)
        bytes = bytes.subarray(0, byteLimit - bytesRead);
      return bytes;
    },
    async exactly(length2, seek = !1) {
      let bytes = await reader.exactly(length2, seek);
      if (bytes.length + bytesRead > byteLimit)
        throw Error("Unexpected end of data");
      if (seek)
        bytesRead += length2;
      return bytes;
    },
    seek(length2) {
      bytesRead += length2, reader.seek(length2);
    },
    get pos() {
      return reader.pos;
    }
  };
}

// node_modules/@ipld/car/src/indexer.js
class CarIndexer {
  constructor(version, roots, iterator) {
    this._version = version, this._roots = roots, this._iterator = iterator;
  }
  get version() {
    return this._version;
  }
  async getRoots() {
    return this._roots;
  }
  [Symbol.asyncIterator]() {
    return this._iterator;
  }
  static async fromBytes(bytes) {
    if (!(bytes instanceof Uint8Array))
      throw TypeError("fromBytes() requires a Uint8Array");
    return decodeIndexerComplete(bytesReader(bytes));
  }
  static async fromIterable(asyncIterable) {
    if (!asyncIterable || typeof asyncIterable[Symbol.asyncIterator] !== "function")
      throw TypeError("fromIterable() requires an async iterable");
    return decodeIndexerComplete(asyncIterableReader(asyncIterable));
  }
}
async function decodeIndexerComplete(reader) {
  let decoder = createDecoder(reader), { version, roots } = await decoder.header();
  return new CarIndexer(version, roots, decoder.blocksIndex());
}

// node_modules/@ipld/car/src/iterator.js
class CarIteratorBase {
  constructor(version, roots, iterable) {
    this._version = version, this._roots = roots, this._iterable = iterable, this._decoded = !1;
  }
  get version() {
    return this._version;
  }
  async getRoots() {
    return this._roots;
  }
}

class CarBlockIterator extends CarIteratorBase {
  [Symbol.asyncIterator]() {
    if (this._decoded)
      throw Error("Cannot decode more than once");
    if (!this._iterable)
      throw Error("Block iterable not found");
    return this._decoded = !0, this._iterable[Symbol.asyncIterator]();
  }
  static async fromBytes(bytes) {
    let { version, roots, iterator } = await fromBytes2(bytes);
    return new CarBlockIterator(version, roots, iterator);
  }
  static async fromIterable(asyncIterable) {
    let { version, roots, iterator } = await fromIterable(asyncIterable);
    return new CarBlockIterator(version, roots, iterator);
  }
}

class CarCIDIterator extends CarIteratorBase {
  [Symbol.asyncIterator]() {
    if (this._decoded)
      throw Error("Cannot decode more than once");
    if (!this._iterable)
      throw Error("Block iterable not found");
    this._decoded = !0;
    let iterable = this._iterable[Symbol.asyncIterator]();
    return {
      async next() {
        let next = await iterable.next();
        if (next.done)
          return next;
        return { done: !1, value: next.value.cid };
      }
    };
  }
  static async fromBytes(bytes) {
    let { version, roots, iterator } = await fromBytes2(bytes);
    return new CarCIDIterator(version, roots, iterator);
  }
  static async fromIterable(asyncIterable) {
    let { version, roots, iterator } = await fromIterable(asyncIterable);
    return new CarCIDIterator(version, roots, iterator);
  }
}
async function fromBytes2(bytes) {
  if (!(bytes instanceof Uint8Array))
    throw TypeError("fromBytes() requires a Uint8Array");
  return decodeIterator(bytesReader(bytes));
}
async function fromIterable(asyncIterable) {
  if (!asyncIterable || typeof asyncIterable[Symbol.asyncIterator] !== "function")
    throw TypeError("fromIterable() requires an async iterable");
  return decodeIterator(asyncIterableReader(asyncIterable));
}
async function decodeIterator(reader) {
  let decoder = createDecoder(reader), { version, roots } = await decoder.header();
  return { version, roots, iterator: decoder.blocks() };
}

// node_modules/@ipld/car/src/reader-browser.js
class CarReader {
  constructor(header, blocks) {
    this._header = header, this._blocks = blocks, this._keys = blocks.map((b) => b.cid.toString());
  }
  get version() {
    return this._header.version;
  }
  async getRoots() {
    return this._header.roots;
  }
  async has(key) {
    return this._keys.indexOf(key.toString()) > -1;
  }
  async get(key) {
    let index = this._keys.indexOf(key.toString());
    return index > -1 ? this._blocks[index] : void 0;
  }
  async* blocks() {
    for (let block of this._blocks)
      yield block;
  }
  async* cids() {
    for (let block of this._blocks)
      yield block.cid;
  }
  static async fromBytes(bytes) {
    if (!(bytes instanceof Uint8Array))
      throw TypeError("fromBytes() requires a Uint8Array");
    return decodeReaderComplete(bytesReader(bytes));
  }
  static async fromIterable(asyncIterable) {
    if (!asyncIterable || typeof asyncIterable[Symbol.asyncIterator] !== "function")
      throw TypeError("fromIterable() requires an async iterable");
    return decodeReaderComplete(asyncIterableReader(asyncIterable));
  }
}
async function decodeReaderComplete(reader) {
  let decoder = createDecoder(reader), header = await decoder.header(), blocks = [];
  for await (let block of decoder.blocks())
    blocks.push(block);
  return new CarReader(header, blocks);
}

// node_modules/@ipld/car/src/encoder.js
var import_varint4 = __toESM(require_varint(), 1), CAR_V1_VERSION = 1;
function createHeader(roots) {
  let headerBytes = encode4({ version: CAR_V1_VERSION, roots }), varintBytes = import_varint4.default.encode(headerBytes.length), header = new Uint8Array(varintBytes.length + headerBytes.length);
  return header.set(varintBytes, 0), header.set(headerBytes, varintBytes.length), header;
}
function createEncoder(writer) {
  return {
    async setRoots(roots) {
      let bytes = createHeader(roots);
      await writer.write(bytes);
    },
    async writeBlock(block) {
      let { cid, bytes } = block;
      if (await writer.write(new Uint8Array(import_varint4.default.encode(cid.bytes.length + bytes.length))), await writer.write(cid.bytes), bytes.length)
        await writer.write(bytes);
    },
    async close() {
      await writer.end();
    },
    version() {
      return CAR_V1_VERSION;
    }
  };
}

// node_modules/@ipld/car/src/iterator-channel.js
function noop() {}
function create2() {
  let chunkQueue = [], drainer = null, drainerResolver = noop, ended = !1, outWait = null, outWaitResolver = noop, makeDrainer = () => {
    if (!drainer)
      drainer = new Promise((resolve) => {
        drainerResolver = () => {
          drainer = null, drainerResolver = noop, resolve();
        };
      });
    return drainer;
  }, writer = {
    write(chunk) {
      chunkQueue.push(chunk);
      let drainer2 = makeDrainer();
      return outWaitResolver(), drainer2;
    },
    async end() {
      ended = !0;
      let drainer2 = makeDrainer();
      outWaitResolver(), await drainer2;
    }
  }, iterator = {
    async next() {
      let chunk = chunkQueue.shift();
      if (chunk) {
        if (chunkQueue.length === 0)
          drainerResolver();
        return { done: !1, value: chunk };
      }
      if (ended)
        return drainerResolver(), { done: !0, value: void 0 };
      if (!outWait)
        outWait = new Promise((resolve) => {
          outWaitResolver = () => (outWait = null, outWaitResolver = noop, resolve(iterator.next()));
        });
      return outWait;
    }
  };
  return { writer, iterator };
}

// node_modules/@ipld/car/src/writer-browser.js
class CarWriter {
  constructor(roots, encoder) {
    this._encoder = encoder, this._mutex = encoder.setRoots(roots), this._ended = !1;
  }
  async put(block) {
    if (!(block.bytes instanceof Uint8Array) || !block.cid)
      throw TypeError("Can only write {cid, bytes} objects");
    if (this._ended)
      throw Error("Already closed");
    let cid = CID.asCID(block.cid);
    if (!cid)
      throw TypeError("Can only write {cid, bytes} objects");
    return this._mutex = this._mutex.then(() => this._encoder.writeBlock({ cid, bytes: block.bytes })), this._mutex;
  }
  async close() {
    if (this._ended)
      throw Error("Already closed");
    return await this._mutex, this._ended = !0, this._encoder.close();
  }
  version() {
    return this._encoder.version();
  }
  static create(roots) {
    roots = toRoots(roots);
    let { encoder, iterator } = encodeWriter(), writer = new CarWriter(roots, encoder), out = new CarWriterOut(iterator);
    return { writer, out };
  }
  static createAppender() {
    let { encoder, iterator } = encodeWriter();
    encoder.setRoots = () => Promise.resolve();
    let writer = new CarWriter([], encoder), out = new CarWriterOut(iterator);
    return { writer, out };
  }
  static async updateRootsInBytes(bytes, roots) {
    let reader = bytesReader(bytes);
    await readHeader(reader);
    let newHeader = createHeader(roots);
    if (Number(reader.pos) !== newHeader.length)
      throw Error(`updateRoots() can only overwrite a header of the same length (old header is ${reader.pos} bytes, new header is ${newHeader.length} bytes)`);
    return bytes.set(newHeader, 0), bytes;
  }
}

class CarWriterOut {
  constructor(iterator) {
    this._iterator = iterator;
  }
  [Symbol.asyncIterator]() {
    if (this._iterating)
      throw Error("Multiple iterator not supported");
    return this._iterating = !0, this._iterator;
  }
}
function encodeWriter() {
  let iw = create2(), { writer, iterator } = iw;
  return { encoder: createEncoder(writer), iterator };
}
function toRoots(roots) {
  if (roots === void 0)
    return [];
  if (!Array.isArray(roots)) {
    let cid = CID.asCID(roots);
    if (!cid)
      throw TypeError("roots must be a single CID or an array of CIDs");
    return [cid];
  }
  let _roots = [];
  for (let root of roots) {
    let _root = CID.asCID(root);
    if (!_root)
      throw TypeError("roots must be a single CID or an array of CIDs");
    _roots.push(_root);
  }
  return _roots;
}

// src/teleport/result.ts
var ok = (value, warnings = []) => ({
  ok: !0,
  value,
  warnings
}), err = (...issues) => ({
  ok: !1,
  issues
});

// src/teleport/cartridge-runtime-adapter.ts
var capture = (effect, issueFor) => Promise.resolve().then(effect).then((value) => ok(value), (cause) => err(issueFor(cause))), fixedIssue = (issue) => () => issue, CAR_READ_FAILED = {
  code: "car-invalid",
  message: "Teleport CAR parsing failed."
}, CAR_WRITE_FAILED = {
  code: "execution-failed",
  message: "Teleport CAR encoding failed."
}, MANIFEST_ENCODE_FAILED = {
  code: "manifest-invalid",
  message: "Teleport manifest encoding failed."
}, MANIFEST_DECODE_FAILED = {
  code: "manifest-invalid",
  message: "Teleport manifest decoding failed."
}, HASH_FAILED = {
  code: "verification-failed",
  message: "Teleport block hashing failed."
}, runtimeBlockFrom = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  if (!("cid" in value) || !("bytes" in value))
    return;
  let cid = CID.asCID(value.cid) ?? void 0;
  return cid !== void 0 && value.bytes instanceof Uint8Array ? { cid, bytes: value.bytes } : void 0;
}, collectBlocks = async (iterator, blocks = []) => {
  let next = await capture(() => iterator.next(), fixedIssue(CAR_READ_FAILED));
  if (!next.ok)
    return next;
  if (next.value.done)
    return ok(blocks);
  let value = next.value.value, block = runtimeBlockFrom(value);
  return block !== void 0 ? collectBlocks(iterator, [
    ...blocks,
    { cid: block.cid, bytes: Uint8Array.from(block.bytes) }
  ]) : err(CAR_READ_FAILED);
}, consumeChunks = async (iterator, sink) => {
  let next = await capture(() => iterator.next(), fixedIssue(CAR_WRITE_FAILED));
  if (!next.ok)
    return next;
  if (next.value.done)
    return ok(void 0);
  let chunk = next.value.value;
  if (!(chunk instanceof Uint8Array))
    return err(CAR_WRITE_FAILED);
  let written = await capture(() => sink.write(Uint8Array.from(chunk)), () => ({
    code: "execution-failed",
    message: "Teleport cartridge stream write failed."
  }));
  return written.ok ? consumeChunks(iterator, sink) : written;
}, collectBoundedChunks = async (iterator, maxBytes, total = 0, chunks = []) => {
  let next = await capture(() => iterator.next(), () => ({ code: "car-invalid", message: "Teleport CAR stream read failed." }));
  if (!next.ok)
    return next;
  if (next.value.done)
    return ok(chunks);
  let chunk = next.value.value;
  if (!(chunk instanceof Uint8Array))
    return err({
      code: "car-invalid",
      message: "CAR stream yielded a non-byte chunk."
    });
  let nextTotal = total + chunk.byteLength;
  return nextTotal > maxBytes ? err({ code: "budget-exceeded", message: "CAR stream exceeds its byte budget." }) : collectBoundedChunks(iterator, maxBytes, nextTotal, [...chunks, Uint8Array.from(chunk)]);
}, encodeTeleportManifestBytes = (value) => capture(() => coerce(encode4(value)), fixedIssue(MANIFEST_ENCODE_FAILED)), decodeTeleportManifestBytes = (bytes) => capture(() => decode6(bytes), fixedIssue(MANIFEST_DECODE_FAILED)), digestTeleportBlockBytes = (bytes) => capture(async () => Uint8Array.from((await sha256.digest(bytes)).bytes), fixedIssue(HASH_FAILED)), createTeleportBlockCid = (codec, bytes) => capture(async () => CID.createV1(codec, await sha256.digest(bytes)), fixedIssue(HASH_FAILED)), measureTeleportCarBytes = (root, blocks) => capture(() => exports_buffer_writer.headerLength({ roots: [root] }) + blocks.reduce((total, block) => total + exports_buffer_writer.blockLength(block), 0), fixedIssue(CAR_WRITE_FAILED)), createTeleportCarChunkStream = (root, blocks) => capture(() => {
  let created = CarWriter.create([root]), producerFailure = blocks.reduce((sequence, block) => sequence.then(() => created.writer.put(block)), Promise.resolve()).then(() => created.writer.close()).then(() => new Promise(() => {
    return;
  })), output = created.out[Symbol.asyncIterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.race([output.next(), producerFailure])
    })
  };
}, fixedIssue(CAR_WRITE_FAILED)), writeTeleportCarChunks = async (chunks, sink) => {
  let iterator = await capture(() => chunks[Symbol.asyncIterator](), fixedIssue(CAR_WRITE_FAILED));
  return iterator.ok ? consumeChunks(iterator.value, sink) : iterator;
}, collectTeleportCarChunks = async (chunks, maxBytes) => {
  let iterator = await capture(() => chunks[Symbol.asyncIterator](), () => ({ code: "car-invalid", message: "Teleport CAR stream read failed." }));
  if (!iterator.ok)
    return iterator;
  let collected = await collectBoundedChunks(iterator.value, maxBytes);
  if (!collected.ok)
    return collected;
  return capture(async () => new Uint8Array(await new Blob(collected.value.map((chunk) => Uint8Array.from(chunk).buffer)).arrayBuffer()), () => ({ code: "car-invalid", message: "Teleport CAR stream collection failed." }));
}, readTeleportCarBytes = (bytes) => capture(() => CarReader.fromBytes(bytes), fixedIssue(CAR_READ_FAILED)).then(async (reader) => {
  if (!reader.ok)
    return reader;
  let roots = await capture(() => reader.value.getRoots(), fixedIssue(CAR_READ_FAILED));
  if (!roots.ok)
    return roots;
  let iterator = await capture(() => reader.value.blocks()[Symbol.asyncIterator](), fixedIssue(CAR_READ_FAILED));
  if (!iterator.ok)
    return iterator;
  let blocks = await collectBlocks(iterator.value);
  return blocks.ok ? ok({ roots: roots.value, blocks: blocks.value }) : blocks;
});

// node_modules/neverthrow/dist/index.es.js
var defaultErrorConfig = {
  withStackTrace: !1
}, createNeverThrowError = (message, result, config = defaultErrorConfig) => {
  let data = result.isOk() ? { type: "Ok", value: result.value } : { type: "Err", value: result.error }, maybeStack = config.withStackTrace ? Error().stack : void 0;
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
        step(generator.throw(value));
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
          o = void 0;
        return { value: o && o[i++], done: !o };
      }
    };
  throw TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator)
    throw TypeError("Symbol.asyncIterator is not defined.");
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
      if (i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      }, f)
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
      return (p = !p) ? { value: __await(o[n](v)), done: !1 } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator)
    throw TypeError("Symbol.asyncIterator is not defined.");
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
    let newPromise = promise.then((value) => new Ok(value));
    return new ResultAsync(newPromise);
  }
  static fromPromise(promise, errorFn) {
    let newPromise = promise.then((value) => new Ok(value)).catch((e) => new Err(errorFn(e)));
    return new ResultAsync(newPromise);
  }
  static fromThrowable(fn, errorFn) {
    return (...args) => new ResultAsync((() => __awaiter(this, void 0, void 0, function* () {
      try {
        return new Ok(yield fn(...args));
      } catch (error) {
        return new Err(errorFn ? errorFn(error) : error);
      }
    }))());
  }
  static combine(asyncResultList) {
    return combineResultAsyncList(asyncResultList);
  }
  static combineWithAllErrors(asyncResultList) {
    return combineResultAsyncListWithAllErrors(asyncResultList);
  }
  map(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr())
        return new Err(res.error);
      return new Ok(yield f(res.value));
    })));
  }
  andThrough(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr())
        return new Err(res.error);
      let newRes = yield f(res.value);
      if (newRes.isErr())
        return new Err(newRes.error);
      return new Ok(res.value);
    })));
  }
  andTee(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr())
        return new Err(res.error);
      try {
        yield f(res.value);
      } catch (e) {}
      return new Ok(res.value);
    })));
  }
  orTee(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isOk())
        return new Ok(res.value);
      try {
        yield f(res.error);
      } catch (e) {}
      return new Err(res.error);
    })));
  }
  mapErr(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isOk())
        return new Ok(res.value);
      return new Err(yield f(res.error));
    })));
  }
  andThen(f) {
    return new ResultAsync(this._promise.then((res) => {
      if (res.isErr())
        return new Err(res.error);
      let newValue = f(res.value);
      return newValue instanceof ResultAsync ? newValue._promise : newValue;
    }));
  }
  orElse(f) {
    return new ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr())
        return f(res.error);
      return new Ok(res.value);
    })));
  }
  match(ok2, _err) {
    return this._promise.then((res) => res.match(ok2, _err));
  }
  unwrapOr(t) {
    return this._promise.then((res) => res.unwrapOr(t));
  }
  safeUnwrap() {
    return __asyncGenerator(this, arguments, function* () {
      return yield __await(yield __await(yield* __asyncDelegator(__asyncValues(yield __await(this._promise.then((res) => res.safeUnwrap()))))));
    });
  }
  then(successCallback, failureCallback) {
    return this._promise.then(successCallback, failureCallback);
  }
  [Symbol.asyncIterator]() {
    return __asyncGenerator(this, arguments, function* () {
      let result = yield __await(this._promise);
      if (result.isErr())
        yield yield __await(errAsync(result.error));
      return yield __await(result.value);
    });
  }
}
function errAsync(err2) {
  return new ResultAsync(Promise.resolve(new Err(err2)));
}
var { fromPromise, fromSafePromise, fromThrowable: fromAsyncThrowable } = ResultAsync, combineResultList = (resultList) => {
  let acc = ok2([]);
  for (let result of resultList)
    if (result.isErr()) {
      acc = err2(result.error);
      break;
    } else
      acc.map((list) => list.push(result.value));
  return acc;
}, combineResultAsyncList = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList), combineResultListWithAllErrors = (resultList) => {
  let acc = ok2([]);
  for (let result of resultList)
    if (result.isErr() && acc.isErr())
      acc.error.push(result.error);
    else if (result.isErr() && acc.isOk())
      acc = err2([result.error]);
    else if (result.isOk() && acc.isOk())
      acc.value.push(result.value);
  return acc;
}, combineResultAsyncListWithAllErrors = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultListWithAllErrors), Result;
(function(Result2) {
  function fromThrowable(fn, errorFn) {
    return (...args) => {
      try {
        let result = fn(...args);
        return ok2(result);
      } catch (e) {
        return err2(errorFn ? errorFn(e) : e);
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
function ok2(value) {
  return new Ok(value);
}
function err2(err3) {
  return new Err(err3);
}
class Ok {
  constructor(value) {
    this.value = value;
  }
  isOk() {
    return !0;
  }
  isErr() {
    return !this.isOk();
  }
  map(f) {
    return ok2(f(this.value));
  }
  mapErr(_f) {
    return ok2(this.value);
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
    return ok2(this.value);
  }
  orTee(_f) {
    return ok2(this.value);
  }
  orElse(_f) {
    return ok2(this.value);
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
  match(ok3, _err) {
    return ok3(this.value);
  }
  safeUnwrap() {
    let value = this.value;
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
    return !1;
  }
  isErr() {
    return !this.isOk();
  }
  map(_f) {
    return err2(this.error);
  }
  mapErr(f) {
    return err2(f(this.error));
  }
  andThrough(_f) {
    return err2(this.error);
  }
  andTee(_f) {
    return err2(this.error);
  }
  orTee(f) {
    try {
      f(this.error);
    } catch (e) {}
    return err2(this.error);
  }
  andThen(_f) {
    return err2(this.error);
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
  match(_ok, err3) {
    return err3(this.error);
  }
  safeUnwrap() {
    let error = this.error;
    return function* () {
      throw yield err2(error), Error("Do not use this generator out of `safeTry`");
    }();
  }
  _unsafeUnwrap(config) {
    throw createNeverThrowError("Called `_unsafeUnwrap` on an Err", this, config);
  }
  _unsafeUnwrapErr(_) {
    return this.error;
  }
  *[Symbol.iterator]() {
    let self = this;
    return yield self, self;
  }
}
var fromThrowable = Result.fromThrowable;

// src/teleport/protocol-value.ts
var encoder = /* @__PURE__ */ new TextEncoder, isUnknownArray = (value) => Array.isArray(value), isPlainRecord = (value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, emptySummary = () => ({ nodeCount: 0, occurrences: [] }), mergeSummaries = (left, right) => {
  let leftObjects = new Set(left.occurrences.map((occurrence) => occurrence.value)), duplicate = right.occurrences.find((occurrence) => leftObjects.has(occurrence.value));
  return duplicate === void 0 ? ok({
    nodeCount: left.nodeCount + right.nodeCount,
    occurrences: [...left.occurrences, ...right.occurrences]
  }) : err({
    code: "capability-invalid",
    message: "Capability values cannot contain cycles or aliases.",
    path: duplicate.path
  });
}, validateProtocolValue = (value, budget) => {
  let visit = (current, depth, path, ancestors, remainingNodes) => {
    if (remainingNodes < 1)
      return err({ code: "budget-exceeded", message: "Capability exceeds the node budget.", path });
    if (depth > budget.maxDepth)
      return err({ code: "budget-exceeded", message: "Capability exceeds the nesting budget.", path });
    if (current === null || typeof current === "boolean")
      return ok({ nodeCount: 1, occurrences: [] });
    if (typeof current === "string")
      return encoder.encode(current).byteLength <= budget.maxStringBytes ? ok({ nodeCount: 1, occurrences: [] }) : err({ code: "budget-exceeded", message: "Capability string exceeds the byte budget.", path });
    if (typeof current === "number")
      return Number.isFinite(current) ? ok({ nodeCount: 1, occurrences: [] }) : err({ code: "capability-invalid", message: "Capability numbers must be finite.", path });
    if (typeof current === "bigint" || Object.prototype.toString.call(current) === "[object Uint8Array]" || CID.asCID(current))
      return ok({ nodeCount: 1, occurrences: [] });
    if (typeof current !== "object")
      return err({ code: "capability-invalid", message: "Capability contains a non-protocol value.", path });
    if (ancestors.includes(current))
      return err({ code: "capability-invalid", message: "Capability values cannot contain cycles or aliases.", path });
    if (!isUnknownArray(current) && !isPlainRecord(current))
      return err({ code: "capability-invalid", message: "Capability contains a non-plain runtime object that must be projected by its codec.", path });
    let entries = isUnknownArray(current) ? current.map((entry, index) => [index, entry]) : Object.keys(current).map((key) => [key, current[key]]);
    if (entries.length > budget.maxCollectionEntries)
      return err({ code: "budget-exceeded", message: "Capability collection exceeds the entry budget.", path });
    let visitRange = (start, end, nodeBudget) => {
      if (start >= end)
        return ok(emptySummary());
      if (end - start === 1) {
        let protocolEntry = entries[start];
        if (protocolEntry === void 0)
          return ok(emptySummary());
        let [key, entry] = protocolEntry;
        return visit(entry, depth + 1, [...path, key], [...ancestors, current], nodeBudget);
      }
      let midpoint = start + Math.floor((end - start) / 2), left = visitRange(start, midpoint, nodeBudget);
      if (!left.ok)
        return left;
      let right = visitRange(midpoint, end, nodeBudget - left.value.nodeCount);
      if (!right.ok)
        return right;
      return mergeSummaries(left.value, right.value);
    }, children = visitRange(0, entries.length, remainingNodes - 1);
    return children.ok ? ok({
      nodeCount: children.value.nodeCount + 1,
      occurrences: [{ value: current, path }, ...children.value.occurrences]
    }) : children;
  }, result = visit(value, 0, [], [], budget.maxNodes);
  return result.ok ? ok(void 0, result.warnings) : result;
};

// src/teleport/types.ts
var DEFAULT_CAPABILITY_BUDGET = Object.freeze({
  maxBlockBytes: 1048576,
  maxDepth: 32,
  maxNodes: 50000,
  maxStringBytes: 262144,
  maxCollectionEntries: 1e4
}), DEFAULT_CARTRIDGE_LIMITS = Object.freeze({
  maxCarBytes: 67108864,
  maxBlocks: 1024,
  maxBlockBytes: 16777216,
  maxCapabilities: 512,
  maxManifestBytes: 1048576
});

// src/teleport/codec.ts
var CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/, INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, completeBudget = (input) => ({
  ...DEFAULT_CAPABILITY_BUDGET,
  ...input
}), equalBytes = (left, right) => left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]), isUint8Array = (value) => value instanceof Uint8Array, createTeleportCodecRegistry = () => Object.freeze([]), teleportCodecFromRegistry = (registry, capabilityId) => registry.find((entry) => entry.capabilityId === capabilityId), teleportCodecRegistrySupports = (registry, capabilityId, version) => teleportCodecFromRegistry(registry, capabilityId)?.acceptedVersions.includes(version) === !0, migrationPathFrom = (codec, sourceVersion, version, seen, path) => {
  if (version === codec.currentVersion)
    return ok(path);
  if (seen.includes(version))
    return err({ code: "migration-failed", message: `Codec ${codec.capabilityId} migration chain contains a cycle.` });
  let migration = codec.migrations?.find((candidate) => candidate.fromVersion === version);
  if (!migration || migration.toVersion > codec.currentVersion)
    return err({ code: "migration-failed", message: `Codec ${codec.capabilityId} has no complete migration path from version ${sourceVersion}.` });
  return migrationPathFrom(codec, sourceVersion, migration.toVersion, [...seen, version], [...path, migration]);
}, migrationPath = (codec, sourceVersion) => migrationPathFrom(codec, sourceVersion, sourceVersion, [], []), firstFailedMigrationPath = (codec) => codec.acceptedVersions.filter((version) => version !== codec.currentVersion).map((version) => migrationPath(codec, version)).find((result) => !result.ok), validateTeleportCodec = (codec) => {
  if (!CAPABILITY_ID.test(codec.capabilityId) || !Number.isInteger(codec.currentVersion) || codec.currentVersion < 1)
    return err({ code: "codec-invalid", message: "Codec identity or current version is invalid." });
  if (!codec.acceptedVersions.includes(codec.currentVersion) || codec.acceptedVersions.some((version) => !Number.isInteger(version) || version < 1))
    return err({ code: "codec-invalid", message: "Codec accepted versions must include the current version." });
  let migrations = codec.migrations ?? [], fromVersions = migrations.map((migration) => migration.fromVersion);
  if (migrations.some((migration, index) => !Number.isInteger(migration.fromVersion) || !Number.isInteger(migration.toVersion) || migration.fromVersion < 1 || migration.toVersion <= migration.fromVersion || fromVersions.indexOf(migration.fromVersion) !== index))
    return err({ code: "codec-invalid", message: `Codec ${codec.capabilityId} has an invalid or overlapping migration.` });
  if (migrations.length === 0)
    return ok(void 0);
  if (!codec.decodeHistorical)
    return err({ code: "codec-invalid", message: `Codec ${codec.capabilityId} declares migrations without a historical decoder.` });
  let failedPath = firstFailedMigrationPath(codec);
  return failedPath && !failedPath.ok ? err(...failedPath.issues) : ok(void 0);
}, snapshotTeleportCodec = (codec) => Object.freeze({
  capabilityId: codec.capabilityId,
  currentVersion: codec.currentVersion,
  acceptedVersions: Object.freeze([...codec.acceptedVersions]),
  securityClass: codec.securityClass,
  ...codec.codec === void 0 ? {} : { codec: codec.codec },
  ...codec.budget === void 0 ? {} : { budget: Object.freeze({ ...codec.budget }) },
  ...codec.migrations === void 0 ? {} : { migrations: Object.freeze(codec.migrations.map((migration) => Object.freeze({ ...migration }))) },
  encode: codec.encode,
  decode: codec.decode,
  ...codec.decodeHistorical === void 0 ? {} : { decodeHistorical: codec.decodeHistorical },
  ...codec.dependencies === void 0 ? {} : { dependencies: codec.dependencies },
  ...codec.restorePlan === void 0 ? {} : { restorePlan: codec.restorePlan }
}), createRegisteredTeleportCodec = (codec) => {
  let snapshot = snapshotTeleportCodec(codec);
  return Object.freeze({
    capabilityId: snapshot.capabilityId,
    currentVersion: snapshot.currentVersion,
    acceptedVersions: snapshot.acceptedVersions,
    securityClass: snapshot.securityClass,
    blockCodec: snapshot.codec ?? "dag-cbor",
    decode: (version, bytes) => decodeCapability(snapshot, version, bytes),
    restorePlan: (version, bytes, context) => {
      let decoded = decodeCapability(snapshot, version, bytes);
      if (!decoded.ok)
        return decoded;
      return snapshot.restorePlan?.(decoded.value, context) ?? ok([]);
    }
  });
}, registerTeleportCodec = (registry, codec) => {
  let validation = validateTeleportCodec(codec);
  if (!validation.ok)
    return validation;
  if (teleportCodecFromRegistry(registry, codec.capabilityId))
    return err({ code: "codec-duplicate", message: `Capability codec ${codec.capabilityId} is already registered.` });
  return ok(Object.freeze([...registry, createRegisteredTeleportCodec(codec)]));
}, createTeleportCodecRegistryWith = (codec) => registerTeleportCodec(createTeleportCodecRegistry(), codec), applyMigrationPath = (codec, path, index, current, warnings) => {
  let migration = path[index];
  if (!migration) {
    let final = codec.decode(codec.currentVersion, current);
    return final.ok ? ok(final.value, [...warnings, ...final.warnings]) : final;
  }
  let migrated = migration.migrate(current);
  return migrated.ok ? applyMigrationPath(codec, path, index + 1, migrated.value, [...warnings, ...migrated.warnings]) : migrated;
}, migrateCapabilityValue = (codec, version, value) => {
  if (version === codec.currentVersion || !codec.migrations?.length)
    return codec.decode(version, value);
  if (!codec.decodeHistorical)
    return err({ code: "migration-failed", message: `Codec ${codec.capabilityId} has no historical decoder.` });
  let decoded = codec.decodeHistorical(version, value);
  if (!decoded.ok)
    return decoded;
  let path = migrationPath(codec, version);
  return path.ok ? applyMigrationPath(codec, path.value, 0, decoded.value, decoded.warnings) : path;
}, throwableIssue = (code3, fallbackMessage, cause) => ({
  code: code3,
  message: cause instanceof Error ? cause.message : fallbackMessage
}), captureCodecMechanic = (operation, code3, fallbackMessage) => Result.fromThrowable(operation, (cause) => throwableIssue(code3, fallbackMessage, cause))().match((value) => ok(value), (issue) => err(issue)), encodeCanonicalValue = (codecKind, value, budget) => {
  if (codecKind === "raw")
    return isUint8Array(value) ? ok(Uint8Array.from(value)) : err({ code: "capability-invalid", message: "Raw capability encoder must return Uint8Array." });
  let validation = validateProtocolValue(value, budget);
  return validation.ok ? captureCodecMechanic(() => coerce(encode4(value)), "capability-invalid", "Capability encoding failed.") : validation;
}, decodeCanonicalValue = (codecKind, bytes, budget) => {
  if (codecKind === "raw")
    return ok(bytes.slice());
  let decoded = captureCodecMechanic(() => decode6(bytes), "decode-failed", "Capability decoding failed.");
  if (!decoded.ok)
    return decoded;
  let validation = validateProtocolValue(decoded.value, budget);
  return validation.ok ? ok(decoded.value, decoded.warnings) : validation;
}, encodeCapability = async (input) => {
  if (!INSTANCE_ID.test(input.instanceId))
    return err({ code: "capability-invalid", message: "Capability instance id is invalid.", instanceId: input.instanceId });
  let projected = input.codec.encode(input.value);
  if (!projected.ok)
    return projected;
  let budget = completeBudget(input.codec.budget), codecKind = input.codec.codec ?? "dag-cbor", encoded = encodeCanonicalValue(codecKind, projected.value, budget);
  if (!encoded.ok)
    return encoded;
  if (encoded.value.byteLength > budget.maxBlockBytes)
    return err({ code: "budget-exceeded", message: "Encoded capability exceeds its byte budget." });
  let decoded = decodeCapability(input.codec, input.codec.currentVersion, encoded.value);
  if (!decoded.ok)
    return decoded;
  let roundTrip = input.codec.encode(decoded.value);
  if (!roundTrip.ok)
    return roundTrip;
  let roundTripBytes = encodeCanonicalValue(codecKind, roundTrip.value, budget);
  if (!roundTripBytes.ok)
    return roundTripBytes;
  if (!equalBytes(encoded.value, roundTripBytes.value))
    return err({ code: "capability-invalid", message: "Capability does not produce canonical round-trip bytes." });
  let cid = CID.createV1(codecKind === "raw" ? code2 : code, await sha256.digest(encoded.value));
  return ok({
    capabilityId: input.codec.capabilityId,
    instanceId: input.instanceId,
    schemaVersion: input.codec.currentVersion,
    securityClass: input.codec.securityClass,
    required: input.required ?? !0,
    restoreMode: input.restoreMode ?? "merge",
    codec: codecKind,
    dependencies: input.codec.dependencies?.(decoded.value) ?? [],
    bytes: encoded.value,
    cid,
    value: decoded.value
  });
}, decodeCapability = (codec, version, bytes) => {
  if (!codec.acceptedVersions.includes(version))
    return err({ code: "unsupported-version", message: `Codec ${codec.capabilityId} does not accept version ${version}.` });
  let budget = completeBudget(codec.budget);
  if (bytes.byteLength > budget.maxBlockBytes)
    return err({ code: "budget-exceeded", message: "Encoded capability exceeds its byte budget." });
  let decoded = decodeCanonicalValue(codec.codec ?? "dag-cbor", bytes, budget);
  return decoded.ok ? migrateCapabilityValue(codec, version, decoded.value) : decoded;
};

// src/teleport/cartridge.ts
var equalBytes2 = (left, right) => left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]), isCapabilityId = (value) => /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value), isInstanceId = (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value), compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0, dependencyKey = (dependency) => `${dependency.kind}\x00${dependency.capabilityId}\x00${dependency.instanceId ?? ""}\x00${dependency.required ? "1" : "0"}`, dependencyIdentityKey = (dependency) => `${dependency.kind}\x00${dependency.capabilityId}\x00${dependency.instanceId ?? ""}`, isOrdered = (values, key) => values.every((value, index) => {
  let previous = values.at(index - 1);
  return index === 0 || previous === void 0 || compareText(key(previous), key(value)) <= 0;
}), isDefined = (value) => value !== void 0, hasDuplicates = (values) => values.some((value, index) => values.indexOf(value) !== index), strictObject = (value, keys) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return !1;
  let actual = Object.keys(value).toSorted(), expected = keys.toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}, isSecurityClass = (value) => value === "public" || value === "private" || value === "secret" || value === "opaque-native", isRestoreMode = (value) => value === "merge" || value === "replace" || value === "rebase" || value === "exact-replay" || value === "retain", isDependencyKind = (value) => value === "hard-decode" || value === "restore-order" || value === "optional-enhancement" || value === "application-availability", parseDependency = (value) => {
  let keys = typeof value === "object" && value !== null && "instanceId" in value ? ["capabilityId", "instanceId", "kind", "required"] : ["capabilityId", "kind", "required"];
  if (!strictObject(value, keys))
    return;
  let { capabilityId, required, kind, instanceId } = value;
  if (typeof capabilityId !== "string" || typeof required !== "boolean" || !isDependencyKind(kind) || instanceId !== void 0 && typeof instanceId !== "string")
    return;
  return {
    capabilityId,
    required,
    kind,
    ...typeof instanceId === "string" ? { instanceId } : {}
  };
}, parseProtection = (value) => {
  if (strictObject(value, ["mode"]) && value.mode === "plain")
    return { mode: "plain" };
  if (!strictObject(value, ["iv", "keyEnvelopeId", "keyId", "mode", "plaintextCid"]) || value.mode !== "aes-256-gcm-v1")
    return;
  let { keyEnvelopeId, keyId, iv } = value, plaintextCid = CID.asCID(value.plaintextCid) ?? void 0;
  return typeof keyEnvelopeId === "string" && typeof keyId === "string" && iv instanceof Uint8Array && iv.byteLength === 12 && plaintextCid !== void 0 ? { mode: "aes-256-gcm-v1", keyEnvelopeId, keyId, iv, plaintextCid } : void 0;
}, parsePassphraseKeyEnvelope = (value) => {
  let id = value.id, block = CID.asCID(value.block) ?? void 0, salt = value.salt, iv = value.iv;
  return typeof id === "string" && value.mode === "pbkdf2-aes-256-gcm-v1" && block !== void 0 && block.code === code2 && salt instanceof Uint8Array && salt.byteLength === 16 && iv instanceof Uint8Array && iv.byteLength === 12 && value.iterations === 310000 && value.hash === "SHA-256" ? {
    id,
    mode: "pbkdf2-aes-256-gcm-v1",
    block,
    salt,
    iv,
    iterations: 310000,
    hash: "SHA-256"
  } : void 0;
}, parseRecipientKeyEnvelope = (value) => {
  let { id, recipientKeyId } = value, block = CID.asCID(value.block) ?? void 0, iv = value.iv;
  return typeof id === "string" && value.mode === "rsa-oaep-aes-256-gcm-v1" && typeof recipientKeyId === "string" && recipientKeyId.length > 0 && block !== void 0 && block.code === code2 && iv instanceof Uint8Array && iv.byteLength === 12 && value.hash === "SHA-256" ? {
    id,
    mode: "rsa-oaep-aes-256-gcm-v1",
    block,
    recipientKeyId,
    iv,
    hash: "SHA-256"
  } : void 0;
}, parseKeyEnvelope = (value) => strictObject(value, ["block", "hash", "id", "iterations", "iv", "mode", "salt"]) ? parsePassphraseKeyEnvelope(value) : strictObject(value, ["block", "hash", "id", "iv", "mode", "recipientKeyId"]) ? parseRecipientKeyEnvelope(value) : void 0, parseSignature = (value) => {
  if (!strictObject(value, ["block", "id", "mode", "signedPayload", "signerKeyId"]))
    return;
  let { id, signerKeyId } = value, signedPayload = CID.asCID(value.signedPayload) ?? void 0, block = CID.asCID(value.block) ?? void 0;
  return typeof id === "string" && id.length > 0 && value.mode === "ed25519-v1" && typeof signerKeyId === "string" && signerKeyId.length > 0 && signedPayload !== void 0 && signedPayload.code === code && block !== void 0 && block.code === code2 ? { id, mode: "ed25519-v1", signerKeyId, signedPayload, block } : void 0;
}, parseDescriptor = (value) => {
  if (!strictObject(value, [
    "block",
    "capabilityId",
    "codec",
    "dependencies",
    "instanceId",
    "protection",
    "required",
    "restoreMode",
    "schemaVersion",
    "securityClass"
  ]))
    return;
  let { capabilityId, instanceId, schemaVersion, securityClass, required, restoreMode, codec } = value, block = CID.asCID(value.block) ?? void 0, rawDependencies = value.dependencies, protection = parseProtection(value.protection);
  if (typeof capabilityId !== "string" || !isCapabilityId(capabilityId) || typeof instanceId !== "string" || !isInstanceId(instanceId) || !Number.isInteger(schemaVersion) || Number(schemaVersion) < 1 || !isSecurityClass(securityClass) || typeof required !== "boolean" || !isRestoreMode(restoreMode) || codec !== "dag-cbor" && codec !== "raw" || block === void 0 || !Array.isArray(rawDependencies) || protection === void 0)
    return;
  let dependencies = rawDependencies.map(parseDependency);
  return dependencies.every(isDefined) ? {
    capabilityId,
    instanceId,
    schemaVersion: Number(schemaVersion),
    securityClass,
    required,
    restoreMode,
    codec,
    block,
    dependencies,
    protection
  } : void 0;
}, dependencyTargets = (descriptors, dependency) => dependency.instanceId === void 0 ? descriptors.filter((candidate) => candidate.capabilityId === dependency.capabilityId) : descriptors.filter((candidate) => candidate.instanceId === dependency.instanceId && candidate.capabilityId === dependency.capabilityId), dependencyIssue = (descriptors, descriptor) => {
  if (descriptor.dependencies.find((dependency) => !isCapabilityId(dependency.capabilityId) || dependency.instanceId !== void 0 && !isInstanceId(dependency.instanceId)) !== void 0)
    return {
      code: "dependency-invalid",
      message: "Capability dependency identity is invalid.",
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    };
  if (hasDuplicates(descriptor.dependencies.map(dependencyIdentityKey)))
    return {
      code: "dependency-invalid",
      message: "Capability descriptor contains a duplicate dependency.",
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    };
  let missing = descriptor.dependencies.find((dependency) => dependency.required && dependencyTargets(descriptors, dependency).length === 0);
  if (missing === void 0)
    return;
  return {
    code: "dependency-invalid",
    message: missing.instanceId === void 0 ? "Required capability dependency is missing." : "Required capability dependency target is missing or has the wrong capability id.",
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  };
}, hardDependencyTargets = (descriptors, instanceId) => descriptors.filter((descriptor) => descriptor.instanceId === instanceId).flatMap((descriptor) => descriptor.dependencies.filter((dependency) => dependency.kind === "hard-decode" || dependency.kind === "restore-order").flatMap((dependency) => dependencyTargets(descriptors, dependency).map((target) => target.instanceId))), hasDependencyCycleFrom = (descriptors, instanceId, path = []) => path.includes(instanceId) || hardDependencyTargets(descriptors, instanceId).some((target) => hasDependencyCycleFrom(descriptors, target, [...path, instanceId])), validateCapabilityGraph = (descriptors) => {
  let issue = descriptors.map((descriptor) => dependencyIssue(descriptors, descriptor)).find(isDefined);
  if (issue !== void 0)
    return err(issue);
  let cyclic = descriptors.find((descriptor) => hasDependencyCycleFrom(descriptors, descriptor.instanceId));
  return cyclic === void 0 ? ok(void 0) : err({
    code: "dependency-invalid",
    message: "Capability dependency graph contains a cycle.",
    capabilityId: cyclic.capabilityId,
    instanceId: cyclic.instanceId
  });
}, parseManifest = (value, limits) => {
  let keys = [
    "capabilities",
    "keyEnvelopes",
    "type",
    "version",
    ...typeof value === "object" && value !== null && "createdAt" in value ? ["createdAt"] : [],
    ...typeof value === "object" && value !== null && "signatures" in value ? ["signatures"] : []
  ];
  if (!strictObject(value, keys) || value.type !== "wx-teleport-cartridge" || value.version !== 1 || !Array.isArray(value.capabilities) || !Array.isArray(value.keyEnvelopes))
    return err({ code: "manifest-invalid", message: "Teleport cartridge manifest is invalid." });
  let { capabilities: rawCapabilities, keyEnvelopes: rawKeyEnvelopes, createdAt, signatures: rawSignatures } = value;
  if (rawCapabilities.length > limits.maxCapabilities)
    return err({
      code: "budget-exceeded",
      message: "Teleport cartridge has too many capabilities."
    });
  if (createdAt !== void 0 && typeof createdAt !== "string")
    return err({
      code: "manifest-invalid",
      message: "Teleport cartridge creation time is invalid."
    });
  let capabilities = rawCapabilities.map(parseDescriptor);
  if (!capabilities.every(isDefined))
    return err({
      code: "manifest-invalid",
      message: "Teleport capability descriptor is invalid."
    });
  let keyEnvelopes = rawKeyEnvelopes.map(parseKeyEnvelope);
  if (!keyEnvelopes.every(isDefined))
    return err({
      code: "manifest-invalid",
      message: "Teleport key envelope descriptor is invalid."
    });
  let signatures = Array.isArray(rawSignatures) ? rawSignatures.map(parseSignature) : [];
  if (!signatures.every(isDefined))
    return err({
      code: "manifest-invalid",
      message: "Teleport signature descriptor is invalid."
    });
  if (!isOrdered(capabilities, (entry) => entry.instanceId) || capabilities.some((entry) => !isOrdered(entry.dependencies, dependencyKey)))
    return err({
      code: "manifest-invalid",
      message: "Teleport capabilities and dependencies must use canonical ordering."
    });
  if (!isOrdered(keyEnvelopes, (entry) => entry.id) || !isOrdered(signatures, (entry) => entry.id))
    return err({
      code: "manifest-invalid",
      message: "Teleport envelopes and signatures must use canonical ordering."
    });
  if (hasDuplicates(signatures.map((entry) => entry.id)))
    return err({
      code: "manifest-invalid",
      message: "Teleport signature ids must be unique."
    });
  let envelopeIds = keyEnvelopes.map((entry) => entry.id);
  if (hasDuplicates(envelopeIds))
    return err({
      code: "manifest-invalid",
      message: "Teleport key envelope ids must be unique."
    });
  if (capabilities.some((entry) => entry.protection.mode !== "plain" && !envelopeIds.includes(entry.protection.keyEnvelopeId)))
    return err({
      code: "manifest-invalid",
      message: "Protected capability references a missing key envelope."
    });
  if (hasDuplicates(capabilities.map((entry) => entry.instanceId)))
    return err({
      code: "manifest-invalid",
      message: "Teleport capability instance ids must be unique."
    });
  let graph = validateCapabilityGraph(capabilities);
  return graph.ok ? ok({
    type: "wx-teleport-cartridge",
    version: 1,
    ...typeof createdAt === "string" ? { createdAt } : {},
    capabilities,
    keyEnvelopes,
    signatures
  }) : graph;
}, limitsFor = (overrides) => ({
  ...DEFAULT_CARTRIDGE_LIMITS,
  ...overrides
}), validateBlockIdentity = async (cid, bytes, expectedCodec, limits, label) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limits.maxBlockBytes)
    return err({
      code: "budget-exceeded",
      message: `${label} exceeds its byte budget.`
    });
  if (cid.code !== expectedCodec || cid.multihash.code !== sha256.code)
    return err({
      code: "cid-mismatch",
      message: `${label} CID uses an unexpected codec or hash.`
    });
  let digest = await digestTeleportBlockBytes(bytes);
  return !digest.ok ? digest : equalBytes2(digest.value, cid.multihash.bytes) ? ok(void 0) : err({ code: "cid-mismatch", message: `${label} bytes do not match their CID.` });
}, validateSequentially = (values, validate) => values.reduce((pending, value) => pending.then((result) => result.ok ? validate(value) : result), Promise.resolve(ok(void 0))), validateCapabilityBlock = (capability, limits) => {
  let expectedStoredCodec = capability.protection?.mode === "aes-256-gcm-v1" ? code2 : capability.codec === "dag-cbor" ? code : code2;
  return validateBlockIdentity(capability.cid, capability.bytes, expectedStoredCodec, limits, `Capability ${capability.instanceId}`).then((result) => {
    if (!result.ok || capability.protection?.mode !== "aes-256-gcm-v1")
      return result;
    let expectedPlaintextCodec = capability.codec === "dag-cbor" ? code : code2;
    return capability.protection.plaintextCid.code === expectedPlaintextCodec && capability.protection.plaintextCid.multihash.code === sha256.code ? ok(void 0) : err({
      code: "cid-mismatch",
      message: `Protected capability ${capability.instanceId} has an invalid plaintext CID.`,
      capabilityId: capability.capabilityId,
      instanceId: capability.instanceId
    });
  });
}, prepareTeleportCartridge = async (input) => {
  let limits = limitsFor(input.limits);
  if (input.capabilities.length > limits.maxCapabilities)
    return err({
      code: "budget-exceeded",
      message: "Teleport cartridge has too many capabilities."
    });
  if (hasDuplicates(input.capabilities.map((entry) => entry.instanceId)))
    return err({
      code: "manifest-invalid",
      message: "Teleport capability instance ids must be unique."
    });
  let capabilities = input.capabilities.toSorted((left, right) => compareText(left.instanceId, right.instanceId)), keyEnvelopes = (input.keyEnvelopes ?? []).toSorted((left, right) => compareText(left.descriptor.id, right.descriptor.id)), signatures = (input.signatures ?? []).toSorted((left, right) => compareText(left.descriptor.id, right.descriptor.id)), capabilitiesValid = await validateSequentially(capabilities, (capability) => validateCapabilityBlock(capability, limits));
  if (!capabilitiesValid.ok)
    return capabilitiesValid;
  let envelopesValid = await validateSequentially(keyEnvelopes, (envelope) => validateBlockIdentity(envelope.descriptor.block, envelope.bytes, code2, limits, `Key envelope ${envelope.descriptor.id}`));
  if (!envelopesValid.ok)
    return envelopesValid;
  let signaturesValid = await validateSequentially(signatures, (signature) => validateBlockIdentity(signature.descriptor.block, signature.bytes, code2, limits, `Signature ${signature.descriptor.id}`));
  if (!signaturesValid.ok)
    return signaturesValid;
  let manifest = {
    type: "wx-teleport-cartridge",
    version: 1,
    ...input.createdAt ? { createdAt: input.createdAt } : {},
    keyEnvelopes: keyEnvelopes.map((entry) => entry.descriptor),
    signatures: signatures.map((entry) => entry.descriptor),
    capabilities: capabilities.map((entry) => ({
      capabilityId: entry.capabilityId,
      instanceId: entry.instanceId,
      schemaVersion: entry.schemaVersion,
      securityClass: entry.securityClass,
      required: entry.required,
      restoreMode: entry.restoreMode,
      codec: entry.codec,
      block: entry.cid,
      protection: entry.protection ?? { mode: "plain" },
      dependencies: entry.dependencies.toSorted((left, right) => compareText(dependencyKey(left), dependencyKey(right)))
    }))
  }, validated = parseManifest(manifest, limits);
  if (!validated.ok)
    return validated;
  let manifestBytes = await encodeTeleportManifestBytes(manifest);
  if (!manifestBytes.ok)
    return manifestBytes;
  if (manifestBytes.value.byteLength > limits.maxManifestBytes)
    return err({
      code: "budget-exceeded",
      message: "Teleport manifest exceeds its byte budget."
    });
  let root = await createTeleportBlockCid(code, manifestBytes.value);
  return root.ok ? ok({
    capabilities,
    keyEnvelopes,
    signatures,
    limits,
    manifest,
    manifestBytes: manifestBytes.value,
    root: root.value
  }) : root;
}, uniqueBlocks = (blocks) => blocks.filter((block, index) => blocks.findIndex((candidate) => candidate.cid.equals(block.cid)) === index), blocksForPreparedCartridge = (prepared) => uniqueBlocks([
  { cid: prepared.root, bytes: prepared.manifestBytes },
  ...prepared.capabilities.map((capability) => ({ cid: capability.cid, bytes: capability.bytes })),
  ...prepared.keyEnvelopes.map((envelope) => ({ cid: envelope.descriptor.block, bytes: envelope.bytes })),
  ...prepared.signatures.map((signature) => ({ cid: signature.descriptor.block, bytes: signature.bytes }))
]), streamTeleportCartridge = async (input) => {
  let prepared = await prepareTeleportCartridge(input);
  if (!prepared.ok)
    return prepared;
  let blocks = blocksForPreparedCartridge(prepared.value), measured = await measureTeleportCarBytes(prepared.value.root, blocks);
  if (!measured.ok)
    return measured;
  if (measured.value > prepared.value.limits.maxCarBytes)
    return err({
      code: "budget-exceeded",
      message: "Teleport cartridge exceeds its byte budget."
    });
  let chunks = await createTeleportCarChunkStream(prepared.value.root, blocks);
  return chunks.ok ? ok({
    chunks: chunks.value,
    root: prepared.value.root,
    rootBytes: prepared.value.manifestBytes,
    manifest: prepared.value.manifest
  }) : chunks;
}, writeTeleportCartridge = async (input, sink) => {
  let streamed = await streamTeleportCartridge(input);
  if (!streamed.ok)
    return streamed;
  let written = await writeTeleportCarChunks(streamed.value.chunks, sink);
  return written.ok ? ok({
    root: streamed.value.root,
    rootBytes: streamed.value.rootBytes,
    manifest: streamed.value.manifest
  }) : written;
}, createTeleportCartridge = async (input) => {
  let streamed = await streamTeleportCartridge(input);
  if (!streamed.ok)
    return streamed;
  let bytes = await collectTeleportCarChunks(streamed.value.chunks, limitsFor(input.limits).maxCarBytes);
  return bytes.ok ? ok({
    root: streamed.value.root,
    rootBytes: streamed.value.rootBytes,
    manifest: streamed.value.manifest,
    bytes: bytes.value
  }) : bytes;
}, validateReadBlock = (block, limits) => block.bytes.byteLength > limits.maxBlockBytes ? Promise.resolve(err({ code: "budget-exceeded", message: "Teleport block exceeds its byte budget." })) : block.cid.multihash.code !== sha256.code ? Promise.resolve(err({ code: "cid-mismatch", message: "Teleport blocks must use SHA-256." })) : digestTeleportBlockBytes(block.bytes).then((digest) => !digest.ok ? digest : equalBytes2(digest.value, block.cid.multihash.bytes) ? ok(void 0) : err({ code: "cid-mismatch", message: "Teleport block bytes do not match their CID." })), blockFrom = (blocks, cid) => blocks.find((block) => block.cid.equals(cid)), verifyCapabilityDescriptor = (blocks, descriptor) => {
  let block = blockFrom(blocks, descriptor.block);
  if (block === void 0)
    return err({
      code: "missing-block",
      message: `Capability block ${descriptor.block.toString()} is missing.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
  let expectedCode = descriptor.protection.mode === "plain" ? descriptor.codec === "dag-cbor" ? code : code2 : code2;
  return block.cid.code === expectedCode ? ok({
    descriptor,
    storedBytes: block.bytes,
    ...descriptor.protection.mode === "plain" ? { contentBytes: block.bytes } : {}
  }) : err({
    code: "manifest-invalid",
    message: "Capability block codec does not match its descriptor.",
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId
  });
}, verifyKeyEnvelopeDescriptor = (blocks, descriptor) => {
  let block = blockFrom(blocks, descriptor.block);
  return block === void 0 ? err({
    code: "missing-block",
    message: `Key envelope block ${descriptor.block.toString()} is missing.`
  }) : block.cid.code !== code2 ? err({ code: "manifest-invalid", message: "Key envelope block must use the raw codec." }) : ok({ descriptor, bytes: block.bytes });
}, verifySignatureDescriptor = (blocks, descriptor) => {
  let block = blockFrom(blocks, descriptor.block);
  return block === void 0 ? err({
    code: "missing-block",
    message: `Signature block ${descriptor.block.toString()} is missing.`
  }) : block.cid.code !== code2 ? err({ code: "manifest-invalid", message: "Signature block must use the raw codec." }) : ok({ descriptor, bytes: block.bytes });
}, firstFailure = (results) => results.find((result) => !result.ok), successfulValues = (results) => results.flatMap((result) => result.ok ? [result.value] : []), referencedBlockIds = (root, manifest) => {
  let values = [
    root.toString(),
    ...manifest.capabilities.map((entry) => entry.block.toString()),
    ...manifest.keyEnvelopes.map((entry) => entry.block.toString()),
    ...manifest.signatures.map((entry) => entry.block.toString())
  ];
  return values.filter((value, index) => values.indexOf(value) === index);
}, verifyTeleportCartridge = async (bytes, overrides) => {
  let limits = limitsFor(overrides);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > limits.maxCarBytes)
    return err({
      code: "budget-exceeded",
      message: "Teleport cartridge exceeds its byte budget."
    });
  let car = await readTeleportCarBytes(bytes);
  if (!car.ok)
    return car;
  if (car.value.roots.length !== 1)
    return err({
      code: "car-invalid",
      message: "Teleport cartridge must have exactly one root."
    });
  if (car.value.blocks.length > limits.maxBlocks)
    return err({
      code: "budget-exceeded",
      message: "Teleport cartridge has too many blocks."
    });
  let blockIds = car.value.blocks.map((block) => block.cid.toString());
  if (hasDuplicates(blockIds))
    return err({
      code: "car-invalid",
      message: "Teleport cartridge contains a duplicate block."
    });
  let blocksValid = await validateSequentially(car.value.blocks, (block) => validateReadBlock(block, limits));
  if (!blocksValid.ok)
    return blocksValid;
  let root = car.value.roots.at(0);
  if (root === void 0 || root.code !== code)
    return err({
      code: "manifest-invalid",
      message: "Teleport root must use DAG-CBOR."
    });
  let rootBlock = blockFrom(car.value.blocks, root);
  if (rootBlock === void 0)
    return err({
      code: "missing-block",
      message: "Teleport root block is missing."
    });
  if (rootBlock.bytes.byteLength > limits.maxManifestBytes)
    return err({
      code: "budget-exceeded",
      message: "Teleport manifest exceeds its byte budget."
    });
  let decodedManifest = await decodeTeleportManifestBytes(rootBlock.bytes);
  if (!decodedManifest.ok)
    return decodedManifest;
  let manifest = parseManifest(decodedManifest.value, limits);
  if (!manifest.ok)
    return manifest;
  let capabilityResults = manifest.value.capabilities.map((descriptor) => verifyCapabilityDescriptor(car.value.blocks, descriptor)), capabilityFailure = firstFailure(capabilityResults);
  if (capabilityFailure !== void 0 && !capabilityFailure.ok)
    return capabilityFailure;
  let envelopeResults = manifest.value.keyEnvelopes.map((descriptor) => verifyKeyEnvelopeDescriptor(car.value.blocks, descriptor)), envelopeFailure = firstFailure(envelopeResults);
  if (envelopeFailure !== void 0 && !envelopeFailure.ok)
    return envelopeFailure;
  let signatureResults = manifest.value.signatures.map((descriptor) => verifySignatureDescriptor(car.value.blocks, descriptor)), signatureFailure = firstFailure(signatureResults);
  if (signatureFailure !== void 0 && !signatureFailure.ok)
    return signatureFailure;
  if (referencedBlockIds(root, manifest.value).length !== car.value.blocks.length)
    return err({
      code: "car-invalid",
      message: "Teleport cartridge contains unreferenced blocks."
    });
  return ok({
    root,
    rootBytes: rootBlock.bytes,
    manifest: manifest.value,
    capabilities: successfulValues(capabilityResults),
    keyEnvelopes: successfulValues(envelopeResults),
    signatures: successfulValues(signatureResults)
  });
}, verifyTeleportCartridgeStream = async (chunks, limits = {}) => {
  let bounded = limitsFor(limits), bytes = await collectTeleportCarChunks(chunks, bounded.maxCarBytes);
  return bytes.ok ? verifyTeleportCartridge(bytes.value, bounded) : bytes;
}, decodeTeleportInventory = (cartridge, registry) => cartridge.capabilities.map((capability) => {
  let { descriptor } = capability, codec = teleportCodecFromRegistry(registry, descriptor.capabilityId);
  if (codec === void 0 || !codec.acceptedVersions.includes(descriptor.schemaVersion)) {
    if (!descriptor.required)
      return { status: "unsupported-optional", capability };
    let issue = {
      code: "required-capability-unsupported",
      message: `Required capability ${descriptor.capabilityId}@${descriptor.schemaVersion} is unsupported.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    };
    return { status: "unsupported-required", capability, issue };
  }
  if (capability.contentBytes === void 0)
    return {
      status: "invalid",
      capability,
      issues: [{
        code: "decode-failed",
        message: "Protected capability must be unlocked before decode.",
        capabilityId: descriptor.capabilityId,
        instanceId: descriptor.instanceId
      }]
    };
  if (codec.blockCodec !== descriptor.codec)
    return {
      status: "invalid",
      capability,
      issues: [{
        code: "decode-failed",
        message: "Capability block codec does not match its registered codec.",
        capabilityId: descriptor.capabilityId,
        instanceId: descriptor.instanceId
      }]
    };
  let decoded = codec.decode(descriptor.schemaVersion, capability.contentBytes);
  return decoded.ok ? { status: "supported", capability, value: decoded.value } : { status: "invalid", capability, issues: decoded.issues };
}), reexportVerifiedCartridge = (cartridge, createdAt = cartridge.manifest.createdAt) => createTeleportCartridge({
  ...createdAt ? { createdAt } : {},
  capabilities: cartridge.capabilities.map(({ descriptor, storedBytes }) => ({
    capabilityId: descriptor.capabilityId,
    instanceId: descriptor.instanceId,
    schemaVersion: descriptor.schemaVersion,
    securityClass: descriptor.securityClass,
    required: descriptor.required,
    restoreMode: descriptor.restoreMode,
    codec: descriptor.codec,
    dependencies: descriptor.dependencies,
    bytes: storedBytes,
    cid: descriptor.block,
    protection: descriptor.protection
  })),
  keyEnvelopes: cartridge.keyEnvelopes.map((envelope) => ({
    descriptor: envelope.descriptor,
    bytes: envelope.bytes
  })),
  signatures: cartridge.signatures.map((signature) => ({
    descriptor: signature.descriptor,
    bytes: signature.bytes
  }))
});

// src/teleport/asset.ts
var ASSET_BLOB_CAPABILITY_ID = "wx.asset.blob", ASSET_METADATA_CAPABILITY_ID = "wx.asset.metadata", isUint8Array2 = (value) => Object.prototype.toString.call(value) === "[object Uint8Array]", isUnknownRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value), assetBlobCapabilityCodec = {
  capabilityId: ASSET_BLOB_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: "opaque-native",
  codec: "raw",
  budget: { maxBlockBytes: 16777216 },
  encode: (value) => isUint8Array2(value) ? ok(Uint8Array.from(value)) : err({ code: "capability-invalid", message: "Asset blob must be bytes." }),
  decode: (version, value) => version === 1 && isUint8Array2(value) ? ok(Uint8Array.from(value)) : err({ code: "decode-failed", message: "Asset blob is invalid." }),
  restorePlan: (_value, context) => ok([{ id: `asset-materialize:${context.instanceId}`, capabilityInstanceId: context.instanceId, effect: "asset-materialize", dependsOn: [], resources: [`asset:${context.instanceId}`], requiresConfirmation: !1, reversible: !0, verification: "asset bytes materialized with their verified CID", rollback: "remove the materialized asset" }])
}, validateMetadata = (value) => {
  if (!isUnknownRecord(value))
    return err({ code: "decode-failed", message: "Asset metadata is invalid." });
  let { name, mediaType, byteLength, blobInstanceId } = value, blob = CID.asCID(value.blob);
  if (Object.keys(value).toSorted().join(",") !== "blob,blobInstanceId,byteLength,mediaType,name" || typeof name !== "string" || name.length === 0 || typeof mediaType !== "string" || mediaType.length === 0 || typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0 || typeof blobInstanceId !== "string" || blobInstanceId.length === 0 || blob === null)
    return err({ code: "decode-failed", message: "Asset metadata contract is invalid." });
  return ok({ name, mediaType, byteLength, blobInstanceId, blob });
}, assetMetadataCapabilityCodec = {
  capabilityId: ASSET_METADATA_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: "public",
  encode: validateMetadata,
  decode: (version, value) => version === 1 ? validateMetadata(value) : err({ code: "unsupported-version", message: `Unsupported asset metadata version ${version}.` }),
  dependencies: (value) => [{ kind: "hard-decode", capabilityId: ASSET_BLOB_CAPABILITY_ID, instanceId: value.blobInstanceId, required: !0 }],
  restorePlan: (_value, context) => ok([{ id: `asset-metadata:${context.instanceId}`, capabilityInstanceId: context.instanceId, effect: "safe-local", dependsOn: [], resources: [`asset-metadata:${context.instanceId}`], requiresConfirmation: !1, reversible: !0, verification: "asset metadata points to the materialized blob CID", rollback: "remove the imported asset metadata" }])
}, encodeTeleportAsset = async (input) => {
  let blobInstanceId = `${input.instanceId}:blob`, blob = await encodeCapability({ codec: assetBlobCapabilityCodec, value: input.bytes, instanceId: blobInstanceId, required: input.required ?? !1, restoreMode: "replace" });
  if (!blob.ok)
    return blob;
  let metadata = await encodeCapability({ codec: assetMetadataCapabilityCodec, value: { name: input.name, mediaType: input.mediaType, byteLength: input.bytes.byteLength, blobInstanceId, blob: blob.value.cid }, instanceId: input.instanceId, required: input.required ?? !1, restoreMode: "replace" });
  return metadata.ok ? ok({ metadata: metadata.value, blob: blob.value }) : metadata;
};

// src/teleport/conformance.ts
var equalBytes3 = (left, right) => left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]), runTeleportCodecConformance = async (input) => {
  let before = structuredClone(input.currentValue), first = await encodeCapability({ codec: input.codec, value: input.currentValue, instanceId: "conformance:current" });
  if (!first.ok)
    return first;
  let second = await encodeCapability({ codec: input.codec, value: input.currentValue, instanceId: "conformance:current" });
  if (!second.ok)
    return second;
  if (!first.value.cid.equals(second.value.cid) || !equalBytes3(first.value.bytes, second.value.bytes))
    return err({ code: "codec-invalid", message: `Codec ${input.codec.capabilityId} is not deterministic.` });
  let beforeEncoded = await encodeCapability({ codec: input.codec, value: before, instanceId: "conformance:before" });
  if (!beforeEncoded.ok || !equalBytes3(beforeEncoded.value.bytes, first.value.bytes))
    return err({ code: "codec-invalid", message: `Codec ${input.codec.capabilityId} mutates or aliases its input.` });
  let roundTrip = decodeCapability(input.codec, input.codec.currentVersion, first.value.bytes);
  if (!roundTrip.ok)
    return roundTrip;
  let historical = input.historical ?? [], failedHistorical = historical.find((fixture) => {
    let decoded = decodeCapability(input.codec, fixture.version, fixture.bytes);
    return !decoded.ok || fixture.assertCurrent !== void 0 && !fixture.assertCurrent(decoded.value);
  });
  if (failedHistorical !== void 0)
    return err({ code: "migration-failed", message: `Codec ${input.codec.capabilityId} failed historical fixture version ${failedHistorical.version}.` });
  let invalid = input.invalid ?? [];
  if (invalid.find((fixture) => decodeCapability(input.codec, fixture.version, fixture.bytes).ok) !== void 0)
    return err({ code: "codec-invalid", message: `Codec ${input.codec.capabilityId} accepted an invalid fixture.` });
  return ok({
    capabilityId: input.codec.capabilityId,
    canonicalCid: first.value.cid.toString(),
    historicalVersions: historical.map((fixture) => fixture.version).toSorted(),
    invalidFixturesRejected: invalid.length
  });
};

// src/teleport/golden.ts
var TELEPORT_GOLDEN_VECTOR_V1 = Object.freeze({
  capabilityCid: "bafyreig2xbhupqigptpj7jag27ikm6l26bnme3nphjwhkxzmldj6dpxrbq",
  cartridgeRoot: "bafyreic7coz5dpgv7v3qup27dq7kawikvzjzqxqnavctuqoqv5kuirrfdu",
  archiveSha256Hex: "8af3d480a227a376fff91d14863f31890f5241980bb67a389a0bf7f88d9fda8e",
  archiveByteLength: 514
}), GOLDEN_VECTOR_FIELDS = [
  "capabilityCid",
  "cartridgeRoot",
  "archiveSha256Hex",
  "archiveByteLength"
], decodeGoldenPayload = (version, value) => {
  if (version !== 1 || typeof value !== "object" || value === null || Array.isArray(value) || !("count" in value) || !("label" in value))
    return err({ code: "decode-failed", message: "Golden vector payload is invalid." });
  let { count, label } = value;
  return typeof count === "number" && typeof label === "string" ? ok({ count, label }) : err({ code: "decode-failed", message: "Golden vector payload is invalid." });
}, goldenCodec = {
  capabilityId: "wx.conformance.golden",
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: "public",
  encode: (value) => ok({ count: value.count, label: value.label }),
  decode: decodeGoldenPayload
}, hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""), createTeleportGoldenVectorV1 = async () => {
  let capability = await encodeCapability({
    codec: goldenCodec,
    value: { count: 42, label: "wx-teleport-browser-golden-v1" },
    instanceId: "golden:one",
    required: !0,
    restoreMode: "merge"
  });
  if (!capability.ok)
    return capability;
  let archive = await createTeleportCartridge({
    capabilities: [capability.value],
    createdAt: "2026-08-22T00:00:00.000Z"
  });
  if (!archive.ok)
    return archive;
  let digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(archive.value.bytes).buffer));
  return ok({
    capabilityCid: capability.value.cid.toString(),
    cartridgeRoot: archive.value.root.toString(),
    archiveSha256Hex: hex(digest),
    archiveByteLength: archive.value.bytes.byteLength
  });
}, verifyTeleportGoldenVectorV1 = async () => {
  let actual = await createTeleportGoldenVectorV1();
  if (!actual.ok)
    return actual;
  let mismatch = GOLDEN_VECTOR_FIELDS.find((field) => actual.value[field] !== TELEPORT_GOLDEN_VECTOR_V1[field]);
  return mismatch ? err({ code: "verification-failed", message: `Teleport golden vector mismatch at ${mismatch}.` }) : actual;
};

// src/teleport/protection-webcrypto-runtime.ts
var encoder2 = /* @__PURE__ */ new TextEncoder, arrayBuffer = (bytes) => Uint8Array.from(bytes).buffer, attempt = (effect, issue) => fromThrowable(effect, () => issue)().match(ok, (caught) => err(caught)), attemptAsync = async (effect, issue) => (await fromAsyncThrowable(effect, () => issue)()).match(ok, (caught) => err(caught)), runProtectionEffect = async (effect, issue) => (await fromAsyncThrowable(effect, () => issue)()).match((result) => result, (caught) => err(caught)), protectionRandomId = (issue) => attempt(() => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join(""), issue), protectionRandomBytes = (byteLength, issue) => attempt(() => crypto.getRandomValues(new Uint8Array(byteLength)), issue), protectionEncode = (value, issue) => attempt(() => coerce(encode4(value)), issue), protectionDecode = (bytes, issue) => attempt(() => decode6(bytes), issue), protectionRawCid = async (bytes, issue) => {
  let digest = await attemptAsync(() => Promise.resolve(sha256.digest(bytes)), issue);
  return digest.ok ? attempt(() => CID.createV1(code2, digest.value), issue) : digest;
}, protectionBytesMatchCid = async (bytes, expected, issue) => {
  let digest = await attemptAsync(() => Promise.resolve(sha256.digest(bytes)), issue);
  return digest.ok ? attempt(() => CID.createV1(expected.code, digest.value).equals(expected), issue) : digest;
}, importAesKey = (bytes, usages, issue) => attemptAsync(() => crypto.subtle.importKey("raw", arrayBuffer(bytes), { name: "AES-GCM" }, !1, [...usages]), issue), aesParameters = (iv, additionalData) => additionalData === void 0 ? { name: "AES-GCM", iv: arrayBuffer(iv), tagLength: 128 } : { name: "AES-GCM", iv: arrayBuffer(iv), additionalData: arrayBuffer(additionalData), tagLength: 128 }, protectionEncryptAes = async (keyBytes, plaintext, iv, additionalData, issue) => {
  let key = await importAesKey(keyBytes, ["encrypt"], issue);
  return key.ok ? attemptAsync(async () => new Uint8Array(await crypto.subtle.encrypt(aesParameters(iv, additionalData), key.value, arrayBuffer(plaintext))), issue) : key;
}, protectionDecryptAes = async (keyBytes, ciphertext, iv, additionalData, issue) => {
  let key = await importAesKey(keyBytes, ["decrypt"], issue);
  return key.ok ? attemptAsync(async () => new Uint8Array(await crypto.subtle.decrypt(aesParameters(iv, additionalData), key.value, arrayBuffer(ciphertext))), issue) : key;
}, deriveWrappingKey = async (passphrase, salt, iterations, usage, issue) => {
  let material = await attemptAsync(() => crypto.subtle.importKey("raw", encoder2.encode(passphrase), "PBKDF2", !1, ["deriveKey"]), issue);
  return material.ok ? attemptAsync(() => crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations, salt: arrayBuffer(salt) }, material.value, { name: "AES-GCM", length: 256 }, !1, [usage]), issue) : material;
}, protectionEncryptWithPassphrase = async (passphrase, salt, iterations, plaintext, iv, issue) => {
  let key = await deriveWrappingKey(passphrase, salt, iterations, "encrypt", issue);
  return key.ok ? attemptAsync(async () => new Uint8Array(await crypto.subtle.encrypt(aesParameters(iv), key.value, arrayBuffer(plaintext))), issue) : key;
}, protectionDecryptWithPassphrase = async (passphrase, salt, iterations, ciphertext, iv, issue) => {
  let key = await deriveWrappingKey(passphrase, salt, iterations, "decrypt", issue);
  return key.ok ? attemptAsync(async () => new Uint8Array(await crypto.subtle.decrypt(aesParameters(iv), key.value, arrayBuffer(ciphertext))), issue) : key;
}, protectionEncryptForRecipient = (publicKey, plaintext, issue) => attemptAsync(async () => new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, arrayBuffer(plaintext))), issue), protectionDecryptForRecipient = (privateKey, ciphertext, issue) => attemptAsync(async () => new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, arrayBuffer(ciphertext))), issue), isRsaOaepKey = (key) => key.algorithm.name === "RSA-OAEP";

// src/teleport/protection.ts
var KDF_ITERATIONS = 310000, PROTECTION_FAILED = {
  code: "capability-invalid",
  message: "Capability protection failed."
}, RECIPIENT_PROTECTION_FAILED = {
  code: "capability-invalid",
  message: "Recipient capability protection failed."
}, UNLOCK_FAILED = {
  code: "decode-failed",
  message: "Cartridge unlock failed."
}, RECIPIENT_UNLOCK_FAILED = {
  code: "decode-failed",
  message: "Recipient cartridge unlock failed."
}, RECIPIENT_KEY_UNWRAP_FAILED = {
  code: "decode-failed",
  message: "Recipient key unwrap failed."
}, warningsFrom = (...warnings) => warnings.flat(), traverse = (values, project) => values.reduce((accumulated, value, index) => {
  if (!accumulated.ok)
    return accumulated;
  let projected = project(value, index);
  return projected.ok ? ok([...accumulated.value, projected.value], warningsFrom(accumulated.warnings, projected.warnings)) : projected;
}, ok([])), traverseAsync = (values, project) => values.reduce(async (pending, value, index) => {
  let accumulated = await pending;
  if (!accumulated.ok)
    return accumulated;
  let projected = await project(value, index);
  return projected.ok ? ok([...accumulated.value, projected.value], warningsFrom(accumulated.warnings, projected.warnings)) : projected;
}, Promise.resolve(ok([]))), associatedData = (capability, envelopeId, issue) => protectionEncode({
  type: "wx-teleport-capability-aad",
  version: 1,
  capabilityId: capability.capabilityId,
  instanceId: capability.instanceId,
  schemaVersion: capability.schemaVersion,
  keyEnvelopeId: envelopeId
}, issue), encryptCapability = async (capability, envelopeId) => {
  let keyId = protectionRandomId(PROTECTION_FAILED);
  if (!keyId.ok)
    return keyId;
  let keyBytes = protectionRandomBytes(32, PROTECTION_FAILED);
  if (!keyBytes.ok)
    return keyBytes;
  let iv = protectionRandomBytes(12, PROTECTION_FAILED);
  if (!iv.ok)
    return iv;
  let aad = associatedData(capability, envelopeId, PROTECTION_FAILED);
  if (!aad.ok)
    return aad;
  let ciphertext = await protectionEncryptAes(keyBytes.value, capability.bytes, iv.value, aad.value, PROTECTION_FAILED);
  if (!ciphertext.ok)
    return ciphertext;
  let cid = await protectionRawCid(ciphertext.value, PROTECTION_FAILED);
  return cid.ok ? ok({
    capability: {
      ...capability,
      bytes: ciphertext.value,
      cid: cid.value,
      protection: {
        mode: "aes-256-gcm-v1",
        keyEnvelopeId: envelopeId,
        keyId: keyId.value,
        iv: iv.value,
        plaintextCid: capability.cid
      }
    },
    key: { keyId: keyId.value, key: keyBytes.value }
  }, warningsFrom(keyId.warnings, keyBytes.warnings, iv.warnings, aad.warnings, ciphertext.warnings, cid.warnings)) : cid;
}, encryptCapabilities = async (capabilities, envelopeId) => {
  let encrypted = await traverseAsync(capabilities, (capability) => encryptCapability(capability, envelopeId));
  return encrypted.ok ? ok({
    capabilities: encrypted.value.map((entry) => entry.capability),
    keys: encrypted.value.map((entry) => entry.key)
  }, encrypted.warnings) : encrypted;
}, encodeEnvelopeKeys = (keys, issue) => protectionEncode({
  type: "wx-teleport-key-envelope",
  version: 1,
  keys
}, issue), protectCapabilityBlocks = async (capabilities, passphrase) => {
  if (!passphrase)
    return err({ code: "capability-invalid", message: "A non-empty export passphrase is required." });
  let envelopeId = protectionRandomId(PROTECTION_FAILED);
  if (!envelopeId.ok)
    return envelopeId;
  let encrypted = await encryptCapabilities(capabilities, envelopeId.value);
  if (!encrypted.ok)
    return encrypted;
  let envelopePlaintext = encodeEnvelopeKeys(encrypted.value.keys, PROTECTION_FAILED);
  if (!envelopePlaintext.ok)
    return envelopePlaintext;
  let salt = protectionRandomBytes(16, PROTECTION_FAILED);
  if (!salt.ok)
    return salt;
  let iv = protectionRandomBytes(12, PROTECTION_FAILED);
  if (!iv.ok)
    return iv;
  let envelopeBytes = await protectionEncryptWithPassphrase(passphrase, salt.value, KDF_ITERATIONS, envelopePlaintext.value, iv.value, PROTECTION_FAILED);
  if (!envelopeBytes.ok)
    return envelopeBytes;
  let block = await protectionRawCid(envelopeBytes.value, PROTECTION_FAILED);
  if (!block.ok)
    return block;
  let descriptor = {
    id: envelopeId.value,
    mode: "pbkdf2-aes-256-gcm-v1",
    block: block.value,
    salt: salt.value,
    iv: iv.value,
    iterations: KDF_ITERATIONS,
    hash: "SHA-256"
  };
  return ok({
    capabilities: encrypted.value.capabilities,
    keyEnvelopes: [{ descriptor, bytes: envelopeBytes.value }]
  }, warningsFrom(envelopeId.warnings, encrypted.warnings, envelopePlaintext.warnings, salt.warnings, iv.warnings, envelopeBytes.warnings, block.warnings));
}, recipientSetIsValid = (recipients) => recipients.length > 0 && recipients.every((recipient) => recipient.keyId.length > 0 && isRsaOaepKey(recipient.publicKey)) && new Set(recipients.map((recipient) => recipient.keyId)).size === recipients.length, protectEnvelopeForRecipient = async (recipient, index, primaryEnvelopeId, plaintext) => {
  let envelopeId = index === 0 ? ok(primaryEnvelopeId) : protectionRandomId(RECIPIENT_PROTECTION_FAILED);
  if (!envelopeId.ok)
    return envelopeId;
  let wrappingKey = protectionRandomBytes(32, RECIPIENT_PROTECTION_FAILED);
  if (!wrappingKey.ok)
    return wrappingKey;
  let iv = protectionRandomBytes(12, RECIPIENT_PROTECTION_FAILED);
  if (!iv.ok)
    return iv;
  let ciphertext = await protectionEncryptAes(wrappingKey.value, plaintext, iv.value, void 0, RECIPIENT_PROTECTION_FAILED);
  if (!ciphertext.ok)
    return ciphertext;
  let wrappedKey = await protectionEncryptForRecipient(recipient.publicKey, wrappingKey.value, RECIPIENT_PROTECTION_FAILED);
  if (!wrappedKey.ok)
    return wrappedKey;
  let envelopeBytes = protectionEncode({
    wrappedKey: wrappedKey.value,
    ciphertext: ciphertext.value
  }, RECIPIENT_PROTECTION_FAILED);
  if (!envelopeBytes.ok)
    return envelopeBytes;
  let block = await protectionRawCid(envelopeBytes.value, RECIPIENT_PROTECTION_FAILED);
  if (!block.ok)
    return block;
  let descriptor = {
    id: envelopeId.value,
    mode: "rsa-oaep-aes-256-gcm-v1",
    block: block.value,
    recipientKeyId: recipient.keyId,
    iv: iv.value,
    hash: "SHA-256"
  };
  return ok({ descriptor, bytes: envelopeBytes.value }, warningsFrom(envelopeId.warnings, wrappingKey.warnings, iv.warnings, ciphertext.warnings, wrappedKey.warnings, envelopeBytes.warnings, block.warnings));
}, protectCapabilityBlocksForRecipient = async (capabilities, recipient) => protectCapabilityBlocksForRecipients(capabilities, [recipient]), protectCapabilityBlocksForRecipients = async (capabilities, recipients) => {
  if (!recipientSetIsValid(recipients))
    return err({
      code: "capability-invalid",
      message: "One or more unique RSA-OAEP recipient keys are required."
    });
  let primaryEnvelopeId = protectionRandomId(RECIPIENT_PROTECTION_FAILED);
  if (!primaryEnvelopeId.ok)
    return primaryEnvelopeId;
  let encrypted = await encryptCapabilities(capabilities, primaryEnvelopeId.value);
  if (!encrypted.ok)
    return encrypted;
  let plaintext = encodeEnvelopeKeys(encrypted.value.keys, RECIPIENT_PROTECTION_FAILED);
  if (!plaintext.ok)
    return plaintext;
  let keyEnvelopes = await traverseAsync(recipients, (recipient, index) => protectEnvelopeForRecipient(recipient, index, primaryEnvelopeId.value, plaintext.value));
  return keyEnvelopes.ok ? ok({
    capabilities: encrypted.value.capabilities,
    keyEnvelopes: keyEnvelopes.value
  }, warningsFrom(primaryEnvelopeId.warnings, encrypted.warnings, plaintext.warnings, keyEnvelopes.warnings)) : keyEnvelopes;
}, isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value), parseEnvelopeKey = (value) => {
  if (!isRecord(value))
    return err({ code: "decode-failed", message: "Key envelope item is invalid." });
  let { keyId, key } = value;
  return typeof keyId === "string" && keyId.length > 0 && key instanceof Uint8Array && key.byteLength === 32 ? ok({ keyId, key: Uint8Array.from(key) }) : err({ code: "decode-failed", message: "Key envelope item is invalid." });
}, parseEnvelopePayload = (value) => {
  if (!isRecord(value))
    return err({ code: "decode-failed", message: "Key envelope payload is invalid." });
  let rawKeys = value.keys;
  if (value.type !== "wx-teleport-key-envelope" || value.version !== 1 || !Array.isArray(rawKeys))
    return err({ code: "decode-failed", message: "Key envelope payload is invalid." });
  let parsed = traverse(rawKeys, (entry) => parseEnvelopeKey(entry));
  if (!parsed.ok)
    return parsed;
  return new Set(parsed.value.map((entry) => entry.keyId)).size === parsed.value.length ? parsed : err({ code: "decode-failed", message: "Key envelope item is invalid." });
}, unwrapPassphraseEnvelope = async (envelope, passphrase) => {
  let descriptor = envelope.descriptor;
  if (descriptor.mode !== "pbkdf2-aes-256-gcm-v1")
    return err({
      code: "policy-rejected",
      message: "Cartridge requires a recipient private key rather than a passphrase."
    });
  let plaintext = await protectionDecryptWithPassphrase(passphrase, descriptor.salt, descriptor.iterations, envelope.bytes, descriptor.iv, UNLOCK_FAILED);
  if (!plaintext.ok)
    return plaintext;
  let decoded = protectionDecode(plaintext.value, UNLOCK_FAILED);
  if (!decoded.ok)
    return decoded;
  let parsed = parseEnvelopePayload(decoded.value);
  return parsed.ok ? ok({ envelopeId: descriptor.id, keys: parsed.value }, warningsFrom(plaintext.warnings, decoded.warnings, parsed.warnings)) : parsed;
}, findExactKey = (envelopes, envelopeId, keyId) => envelopes.find((envelope) => envelope.envelopeId === envelopeId)?.keys.find((key) => key.keyId === keyId)?.key, findLastKey = (envelopes, keyId) => envelopes.flatMap((envelope) => envelope.keys).findLast((key) => key.keyId === keyId)?.key, unlockCapability = async (capability, findKey, issue) => {
  let protection = capability.descriptor.protection;
  if (protection.mode === "plain")
    return ok({ ...capability, contentBytes: capability.storedBytes });
  let key = findKey(protection);
  if (key === void 0)
    return err({
      code: "missing-block",
      message: "Protected capability key is unavailable.",
      capabilityId: capability.descriptor.capabilityId,
      instanceId: capability.descriptor.instanceId
    });
  let aad = associatedData(capability.descriptor, protection.keyEnvelopeId, issue);
  if (!aad.ok)
    return aad;
  let plaintext = await protectionDecryptAes(key, capability.storedBytes, protection.iv, aad.value, issue);
  if (!plaintext.ok)
    return plaintext;
  let matchesCid = await protectionBytesMatchCid(plaintext.value, protection.plaintextCid, issue);
  if (!matchesCid.ok)
    return matchesCid;
  return matchesCid.value ? ok({ ...capability, contentBytes: plaintext.value }, warningsFrom(aad.warnings, plaintext.warnings, matchesCid.warnings)) : err({
    code: "cid-mismatch",
    message: "Protected capability plaintext does not match its CID.",
    capabilityId: capability.descriptor.capabilityId,
    instanceId: capability.descriptor.instanceId
  });
}, unlockCapabilities = (capabilities, findKey, issue) => traverseAsync(capabilities, (capability) => unlockCapability(capability, findKey, issue)), unlockTeleportCartridge = async (cartridge, passphrase) => {
  if (!passphrase)
    return err({ code: "decode-failed", message: "A cartridge passphrase is required." });
  let unwrapped = await traverseAsync(cartridge.keyEnvelopes, (envelope) => unwrapPassphraseEnvelope(envelope, passphrase));
  if (!unwrapped.ok)
    return unwrapped;
  let capabilities = await unlockCapabilities(cartridge.capabilities, (protection) => findExactKey(unwrapped.value, protection.keyEnvelopeId, protection.keyId), UNLOCK_FAILED);
  return capabilities.ok ? ok({ ...cartridge, capabilities: capabilities.value }, warningsFrom(unwrapped.warnings, capabilities.warnings)) : capabilities;
}, parseRecipientEnvelope = (envelope) => {
  let decoded = protectionDecode(envelope.bytes, RECIPIENT_UNLOCK_FAILED);
  if (!decoded.ok)
    return decoded;
  let payload = decoded.value;
  if (!isRecord(payload))
    return err({ code: "decode-failed", message: "Recipient key envelope is invalid." });
  let { wrappedKey, ciphertext } = payload;
  return wrappedKey instanceof Uint8Array && ciphertext instanceof Uint8Array ? ok({
    wrappedKey: Uint8Array.from(wrappedKey),
    ciphertext: Uint8Array.from(ciphertext)
  }, decoded.warnings) : err({ code: "decode-failed", message: "Recipient key envelope is invalid." });
}, unwrapRecipientEnvelope = async (envelope, recipient) => {
  let payload = parseRecipientEnvelope(envelope);
  if (!payload.ok)
    return payload;
  let unwrappedKey = await runProtectionEffect(() => recipient.unwrapKey(payload.value.wrappedKey), RECIPIENT_UNLOCK_FAILED);
  if (!unwrappedKey.ok)
    return unwrappedKey;
  if (unwrappedKey.value.byteLength !== 32)
    return err({ code: "decode-failed", message: "Recipient unwrapped key is invalid." });
  let plaintext = await protectionDecryptAes(unwrappedKey.value, payload.value.ciphertext, envelope.descriptor.iv, void 0, RECIPIENT_UNLOCK_FAILED);
  if (!plaintext.ok)
    return plaintext;
  let decoded = protectionDecode(plaintext.value, RECIPIENT_UNLOCK_FAILED);
  if (!decoded.ok)
    return decoded;
  let parsed = parseEnvelopePayload(decoded.value);
  return parsed.ok ? ok({ envelopeId: envelope.descriptor.id, keys: parsed.value }, warningsFrom(payload.warnings, unwrappedKey.warnings, plaintext.warnings, decoded.warnings, parsed.warnings)) : parsed;
}, unlockTeleportCartridgeWithRecipientUnwrapper = async (cartridge, recipient) => {
  if (!recipient.keyId)
    return err({ code: "decode-failed", message: "A recipient key identity is required." });
  let matchingEnvelopes = cartridge.keyEnvelopes.filter((envelope) => {
    let descriptor = envelope.descriptor;
    return descriptor.mode === "rsa-oaep-aes-256-gcm-v1" && descriptor.recipientKeyId === recipient.keyId;
  });
  if (matchingEnvelopes.length === 0)
    return err({
      code: "policy-rejected",
      message: "Cartridge recipient key identity does not match."
    });
  let unwrapped = await traverseAsync(matchingEnvelopes, (envelope) => unwrapRecipientEnvelope(envelope, recipient));
  if (!unwrapped.ok)
    return unwrapped;
  let capabilities = await unlockCapabilities(cartridge.capabilities, (protection) => findExactKey(unwrapped.value, protection.keyEnvelopeId, protection.keyId) ?? findLastKey(unwrapped.value, protection.keyId), RECIPIENT_UNLOCK_FAILED);
  return capabilities.ok ? ok({ ...cartridge, capabilities: capabilities.value }, warningsFrom(unwrapped.warnings, capabilities.warnings)) : capabilities;
}, unlockTeleportCartridgeForRecipient = async (cartridge, recipient) => {
  if (!recipient.keyId || !isRsaOaepKey(recipient.privateKey))
    return err({
      code: "decode-failed",
      message: "An RSA-OAEP recipient private key is required."
    });
  return unlockTeleportCartridgeWithRecipientUnwrapper(cartridge, {
    keyId: recipient.keyId,
    unwrapKey: (wrappedKey) => protectionDecryptForRecipient(recipient.privateKey, wrappedKey, RECIPIENT_KEY_UNWRAP_FAILED)
  });
};

// src/teleport/private-inventory-runtime-adapter.ts
var encoder3 = /* @__PURE__ */ new TextEncoder, ITERATIONS = 310000, buffer2 = (bytes) => Uint8Array.from(bytes).buffer, capture2 = (effect, issue) => Promise.resolve().then(effect).then((value) => ok(value), () => err(issue)), collect = async (iterator, chunks = []) => {
  let next = await iterator.next();
  return next.done ? chunks : collect(iterator, [...chunks, Uint8Array.from(next.value)]);
}, readBlocks = async (iterator, blocks = []) => {
  let next = await iterator.next();
  return next.done ? blocks : readBlocks(iterator, [...blocks, { cid: next.value.cid, bytes: Uint8Array.from(next.value.bytes) }]);
}, aad = (manifest) => coerce(encode4({
  type: "wx-teleport-private-inventory-aad",
  version: 1,
  manifest
})), deriveKey = async (passphrase, salt, usage) => {
  let material = await crypto.subtle.importKey("raw", encoder3.encode(passphrase), "PBKDF2", !1, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: buffer2(salt) }, material, { name: "AES-GCM", length: 256 }, !1, [usage]);
}, createPrivateInventoryRandomMaterial = (issue) => capture2(() => ({
  salt: crypto.getRandomValues(new Uint8Array(16)),
  iv: crypto.getRandomValues(new Uint8Array(12))
}), issue), encryptPrivateInventoryBytes = (input, issue) => capture2(async () => new Uint8Array(await crypto.subtle.encrypt({
  name: "AES-GCM",
  iv: buffer2(input.iv),
  additionalData: buffer2(aad(input.manifest)),
  tagLength: 128
}, await deriveKey(input.passphrase, input.salt, "encrypt"), buffer2(input.bytes))), issue), decryptPrivateInventoryBytes = (input, issue) => capture2(async () => new Uint8Array(await crypto.subtle.decrypt({
  name: "AES-GCM",
  iv: buffer2(input.iv),
  additionalData: buffer2(aad(input.manifest)),
  tagLength: 128
}, await deriveKey(input.passphrase, input.salt, "decrypt"), buffer2(input.bytes))), issue), encodePrivateInventoryDagCbor = (value, issue) => capture2(() => coerce(encode4(value)), issue), decodePrivateInventoryDagCbor = (bytes, issue) => capture2(() => decode6(bytes), issue), createPrivateInventoryCid = (codec, bytes, issue) => capture2(async () => CID.createV1(codec, await sha256.digest(bytes)), issue), digestPrivateInventoryBytes = (bytes, issue) => capture2(async () => Uint8Array.from((await sha256.digest(bytes)).bytes), issue), readPrivateInventoryCar = (bytes, issue) => capture2(async () => {
  let reader = await CarReader.fromBytes(bytes), roots = await reader.getRoots(), blocks = await readBlocks(reader.blocks()[Symbol.asyncIterator]());
  return { roots, blocks };
}, issue), writePrivateInventoryCar = (root, blocks, issue) => capture2(async () => {
  let { writer, out } = CarWriter.create([root]), output = collect(out[Symbol.asyncIterator]());
  await blocks.reduce((sequence, block) => sequence.then(() => writer.put(block)), Promise.resolve()), await writer.close();
  let chunks = await output;
  return new Uint8Array(await new Blob(chunks.map((chunk) => Uint8Array.from(chunk).buffer)).arrayBuffer());
}, issue);

// src/teleport/private-inventory.ts
var ITERATIONS2 = 310000, CREATE_FAILED = {
  code: "car-invalid",
  message: "Private inventory cartridge creation failed."
}, UNLOCK_FAILED2 = {
  code: "decode-failed",
  message: "Private inventory unlock failed."
}, LOCATOR_INVALID = {
  code: "manifest-invalid",
  message: "Private inventory locator is invalid."
}, isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value), equalBytes4 = (left, right) => left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]), parseLocator = (value) => {
  if (!isRecord2(value))
    return err(LOCATOR_INVALID);
  let { kdf: kdfValue, encryption: encryptionValue } = value, kdf = isRecord2(kdfValue) ? kdfValue : void 0, encryption = isRecord2(encryptionValue) ? encryptionValue : void 0, manifest = value.manifest, inventory = value.inventory, salt = kdf?.salt, iv = encryption?.iv;
  if (Object.keys(value).toSorted().join(",") !== "encryption,inventory,kdf,manifest,type,version" || value.type !== "wx-teleport-private-inventory" || value.version !== 1 || !(manifest instanceof CID) || manifest.code !== code || !(inventory instanceof CID) || inventory.code !== code2 || !kdf || Object.keys(kdf).toSorted().join(",") !== "hash,iterations,name,salt" || kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256" || kdf.iterations !== ITERATIONS2 || !(salt instanceof Uint8Array) || salt.byteLength !== 16 || !encryption || Object.keys(encryption).toSorted().join(",") !== "iv,name" || encryption.name !== "AES-GCM" || !(iv instanceof Uint8Array) || iv.byteLength !== 12)
    return err({ code: "manifest-invalid", message: "Private inventory locator contract is invalid." });
  return ok({
    type: "wx-teleport-private-inventory",
    version: 1,
    manifest,
    inventory,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS2, salt },
    encryption: { name: "AES-GCM", iv }
  });
}, uniqueBlocks2 = (blocks) => blocks.filter((block, index) => blocks.findIndex((candidate) => candidate.cid.equals(block.cid)) === index), verifiedGraphBlocks = (cartridge) => uniqueBlocks2([
  ...cartridge.capabilities.map((capability) => ({
    cid: capability.descriptor.block,
    bytes: capability.storedBytes
  })),
  ...cartridge.keyEnvelopes.map((envelope) => ({
    cid: envelope.descriptor.block,
    bytes: envelope.bytes
  })),
  ...cartridge.signatures.map((signature) => ({
    cid: signature.descriptor.block,
    bytes: signature.bytes
  }))
]), verifyOuterBlock = async (block) => {
  let digest = await digestPrivateInventoryBytes(block.bytes, UNLOCK_FAILED2);
  return !digest.ok ? digest : equalBytes4(digest.value, block.cid.multihash.bytes) ? ok(block) : err({
    code: "cid-mismatch",
    message: "Private inventory block bytes do not match their CID."
  });
}, createPrivateInventoryCartridge = async (archive, passphrase) => {
  if (!passphrase)
    return err({
      code: "capability-invalid",
      message: "A private-inventory passphrase is required."
    });
  let verified = await verifyTeleportCartridge(archive.bytes);
  if (!verified.ok)
    return verified;
  let random = await createPrivateInventoryRandomMaterial(CREATE_FAILED);
  if (!random.ok)
    return random;
  let encrypted = await encryptPrivateInventoryBytes({
    passphrase,
    manifest: archive.root,
    salt: random.value.salt,
    iv: random.value.iv,
    bytes: archive.rootBytes
  }, CREATE_FAILED);
  if (!encrypted.ok)
    return encrypted;
  let inventory = await createPrivateInventoryCid(code2, encrypted.value, CREATE_FAILED);
  if (!inventory.ok)
    return inventory;
  let locator = {
    type: "wx-teleport-private-inventory",
    version: 1,
    manifest: archive.root,
    inventory: inventory.value,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS2,
      salt: random.value.salt
    },
    encryption: { name: "AES-GCM", iv: random.value.iv }
  }, locatorBytes = await encodePrivateInventoryDagCbor(locator, CREATE_FAILED);
  if (!locatorBytes.ok)
    return locatorBytes;
  let root = await createPrivateInventoryCid(code, locatorBytes.value, CREATE_FAILED);
  if (!root.ok)
    return root;
  let bytes = await writePrivateInventoryCar(root.value, [
    { cid: root.value, bytes: locatorBytes.value },
    { cid: inventory.value, bytes: encrypted.value },
    ...verifiedGraphBlocks(verified.value)
  ], CREATE_FAILED);
  return bytes.ok ? ok({ bytes: bytes.value, root: root.value, locator }) : bytes;
}, unlockPrivateInventoryCartridge = async (bytes, passphrase) => {
  if (!passphrase)
    return err({
      code: "decode-failed",
      message: "A private-inventory passphrase is required."
    });
  let car = await readPrivateInventoryCar(bytes, UNLOCK_FAILED2);
  if (!car.ok)
    return car;
  if (car.value.roots.length !== 1)
    return err({
      code: "car-invalid",
      message: "Private inventory CAR must have one root."
    });
  let blockIds = car.value.blocks.map((block) => block.cid.toString());
  if (new Set(blockIds).size !== blockIds.length)
    return err({
      code: "car-invalid",
      message: "Private inventory CAR contains a duplicate block."
    });
  let invalidBlock = (await Promise.all(car.value.blocks.map(verifyOuterBlock))).find((result) => !result.ok);
  if (invalidBlock !== void 0)
    return invalidBlock;
  let root = car.value.roots.at(0), rootBlock = root ? car.value.blocks.find((block) => block.cid.equals(root)) : void 0;
  if (!root || !rootBlock || root.code !== code)
    return err({
      code: "manifest-invalid",
      message: "Private inventory locator block is missing."
    });
  let decodedLocator = await decodePrivateInventoryDagCbor(rootBlock.bytes, LOCATOR_INVALID);
  if (!decodedLocator.ok)
    return decodedLocator;
  let locator = parseLocator(decodedLocator.value);
  if (!locator.ok)
    return locator;
  let inventoryBlock = car.value.blocks.find((block) => block.cid.equals(locator.value.inventory));
  if (!inventoryBlock)
    return err({
      code: "missing-block",
      message: "Encrypted private inventory block is missing."
    });
  let manifestBytes = await decryptPrivateInventoryBytes({
    passphrase,
    manifest: locator.value.manifest,
    salt: locator.value.kdf.salt,
    iv: locator.value.encryption.iv,
    bytes: inventoryBlock.bytes
  }, UNLOCK_FAILED2);
  if (!manifestBytes.ok)
    return manifestBytes;
  let manifestDigest = await digestPrivateInventoryBytes(manifestBytes.value, UNLOCK_FAILED2);
  if (!manifestDigest.ok)
    return manifestDigest;
  if (!equalBytes4(manifestDigest.value, locator.value.manifest.multihash.bytes))
    return err({
      code: "cid-mismatch",
      message: "Unlocked private inventory does not match its manifest CID."
    });
  let restoredBytes = await writePrivateInventoryCar(locator.value.manifest, [
    { cid: locator.value.manifest, bytes: manifestBytes.value },
    ...car.value.blocks.filter((block) => !block.cid.equals(root) && !block.cid.equals(locator.value.inventory))
  ], UNLOCK_FAILED2);
  return restoredBytes.ok ? verifyTeleportCartridge(restoredBytes.value) : restoredBytes;
};

// src/teleport/key-provider.ts
var protectCapabilityBlocksWithKeyProvider = async (capabilities, provider, keyId) => {
  let key = await provider.getPublicKey(keyId);
  return key.ok ? protectCapabilityBlocksForRecipient(capabilities, { keyId: `${provider.providerId}:${keyId}`, publicKey: key.value }) : key;
}, unlockTeleportCartridgeWithKeyProvider = async (cartridge, provider) => {
  let descriptor = cartridge.keyEnvelopes.map((envelope) => envelope.descriptor).find((candidate) => candidate.mode === "rsa-oaep-aes-256-gcm-v1" && candidate.recipientKeyId.startsWith(`${provider.providerId}:`));
  if (!descriptor || descriptor.mode !== "rsa-oaep-aes-256-gcm-v1")
    return err({ code: "policy-rejected", message: `Cartridge has no recipient envelope for provider ${provider.providerId}.` });
  let localKeyId = descriptor.recipientKeyId.slice(provider.providerId.length + 1), key = await provider.getPrivateKey(localKeyId);
  return key.ok ? unlockTeleportCartridgeForRecipient(cartridge, { keyId: descriptor.recipientKeyId, privateKey: key.value }) : key;
}, unlockTeleportCartridgeWithUnwrapProvider = async (cartridge, provider) => {
  let descriptor = cartridge.keyEnvelopes.map((envelope) => envelope.descriptor).find((candidate) => candidate.mode === "rsa-oaep-aes-256-gcm-v1" && candidate.recipientKeyId.startsWith(`${provider.providerId}:`));
  if (!descriptor || descriptor.mode !== "rsa-oaep-aes-256-gcm-v1")
    return err({ code: "policy-rejected", message: `Cartridge has no recipient envelope for provider ${provider.providerId}.` });
  let localKeyId = descriptor.recipientKeyId.slice(provider.providerId.length + 1);
  return unlockTeleportCartridgeWithRecipientUnwrapper(cartridge, {
    keyId: descriptor.recipientKeyId,
    unwrapKey: (wrappedKey) => provider.unwrapKey(localKeyId, wrappedKey)
  });
};

// src/teleport/browser-device-key-provider.ts
var KEY_STORE = "recipient-keys", validKeyId = (keyId) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId), validProviderId = (providerId) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(providerId), isStoredKeyPair = (value) => {
  if (typeof value !== "object" || value === null)
    return !1;
  let pair = value;
  return pair.publicKey?.type === "public" && pair.publicKey.algorithm.name === "RSA-OAEP" && pair.publicKey.usages.includes("encrypt") && pair.privateKey?.type === "private" && pair.privateKey.algorithm.name === "RSA-OAEP" && pair.privateKey.extractable === !1 && pair.privateKey.usages.includes("decrypt");
}, requestResult = (request) => new Promise((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: !0 }), request.addEventListener("error", () => reject(request.error ?? Error("IndexedDB request failed.")), { once: !0 });
}), transactionDone = (transaction) => new Promise((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: !0 }), transaction.addEventListener("abort", () => reject(transaction.error ?? Error("IndexedDB transaction aborted.")), { once: !0 }), transaction.addEventListener("error", () => reject(transaction.error ?? Error("IndexedDB transaction failed.")), { once: !0 });
});

class BrowserDeviceRecipientKeyProvider {
  providerId;
  #databaseName;
  #pending = /* @__PURE__ */ new Map;
  constructor(options = {}) {
    if (this.providerId = options.providerId ?? "browser-device", this.#databaseName = options.databaseName ?? "wx-teleport-device-keys-v1", !validProviderId(this.providerId))
      throw Error("Device key provider id is invalid.");
  }
  async#database() {
    let request = indexedDB.open(this.#databaseName, 1);
    return request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE))
        request.result.createObjectStore(KEY_STORE);
    }, { once: !0 }), requestResult(request);
  }
  async#load(keyId) {
    let database = await this.#database();
    try {
      let transaction = database.transaction(KEY_STORE, "readonly"), value = await requestResult(transaction.objectStore(KEY_STORE).get(keyId));
      if (await transactionDone(transaction), value === void 0)
        return;
      if (!isStoredKeyPair(value))
        throw Error("Stored device recipient key is invalid.");
      return value;
    } finally {
      database.close();
    }
  }
  async#create(keyId) {
    let generated = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, !1, ["encrypt", "decrypt"]), database = await this.#database(), conflicted = !1;
    try {
      let transaction = database.transaction(KEY_STORE, "readwrite");
      try {
        await requestResult(transaction.objectStore(KEY_STORE).add(generated, keyId)), await transactionDone(transaction);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "ConstraintError")
          conflicted = !0;
        else
          throw cause;
      }
    } finally {
      database.close();
    }
    if (!conflicted)
      return generated;
    let winner = await this.#load(keyId);
    if (!winner)
      throw Error("Concurrent device recipient key creation failed.");
    return winner;
  }
  async#getOrCreate(keyId) {
    if (!validKeyId(keyId))
      return err({ code: "policy-rejected", message: "Device recipient key id is invalid." });
    let existing = this.#pending.get(keyId);
    if (existing)
      return existing;
    let operation = (async () => {
      try {
        return ok(await this.#load(keyId) ?? await this.#create(keyId));
      } catch {
        return err({ code: "execution-failed", message: "Device recipient key storage is unavailable." });
      } finally {
        this.#pending.delete(keyId);
      }
    })();
    return this.#pending.set(keyId, operation), operation;
  }
  async getPublicKey(keyId) {
    let pair = await this.#getOrCreate(keyId);
    return pair.ok ? ok(pair.value.publicKey) : pair;
  }
  async getPrivateKey(keyId) {
    let pair = await this.#getOrCreate(keyId);
    return pair.ok ? ok(pair.value.privateKey) : pair;
  }
  async deleteKey(keyId) {
    if (!validKeyId(keyId))
      return err({ code: "policy-rejected", message: "Device recipient key id is invalid." });
    try {
      let database = await this.#database();
      try {
        let transaction = database.transaction(KEY_STORE, "readwrite");
        transaction.objectStore(KEY_STORE).delete(keyId), await transactionDone(transaction);
      } finally {
        database.close();
      }
      return ok(void 0);
    } catch {
      return err({ code: "execution-failed", message: "Device recipient key storage is unavailable." });
    }
  }
}

// src/teleport/restore.ts
var EMPTY_PLANNING_STATE = {
  steps: [],
  capabilitySteps: [],
  unresolvedOptionalInstances: []
}, mutatesResource = (step) => step.effect !== "unresolved-retain", stepById = (steps, id) => steps.find((step) => step.id === id), hasDependencyPath = (from3, to, steps, seen = []) => {
  if (from3 === to)
    return !0;
  if (seen.includes(from3))
    return !1;
  let nextSeen = [...seen, from3];
  return stepById(steps, from3)?.dependsOn.some((dependency) => hasDependencyPath(dependency, to, steps, nextSeen)) === !0;
}, requiredBlockerIssues = (inventory) => inventory.flatMap((entry) => {
  if (entry.status === "unsupported-required")
    return [entry.issue];
  if (entry.status === "invalid" && entry.capability.descriptor.required)
    return entry.issues;
  return [];
}), retainOpaqueCapability = (state, entry) => {
  let { instanceId } = entry.capability.descriptor, step = {
    id: `retain:${instanceId}`,
    capabilityInstanceId: instanceId,
    effect: "unresolved-retain",
    dependsOn: [],
    resources: [],
    requiresConfirmation: !1,
    reversible: !0,
    verification: "opaque capability bytes retained for relay and re-export",
    rollback: "retain the original opaque capability bytes"
  };
  return {
    steps: [...state.steps, step],
    capabilitySteps: [...state.capabilitySteps, { instanceId, stepIds: [step.id] }],
    unresolvedOptionalInstances: [...state.unresolvedOptionalInstances, instanceId]
  };
}, projectSupportedCapability = (state, entry, registry) => {
  let { descriptor } = entry.capability, codec = teleportCodecFromRegistry(registry, descriptor.capabilityId);
  if (!codec)
    return err({
      code: "unsupported-capability",
      message: `Codec ${descriptor.capabilityId} disappeared during restore planning.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
  let contentBytes = entry.capability.contentBytes;
  if (!contentBytes)
    return err({
      code: "decode-failed",
      message: `Decoded capability ${descriptor.capabilityId} no longer has content bytes.`,
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId
    });
  let projected = codec.restorePlan(descriptor.schemaVersion, contentBytes, {
    instanceId: descriptor.instanceId,
    restoreMode: descriptor.restoreMode
  });
  if (!projected.ok)
    return projected;
  let stepIds = projected.value.map((step) => step.id);
  return ok({
    steps: [...state.steps, ...projected.value],
    capabilitySteps: [...state.capabilitySteps, { instanceId: descriptor.instanceId, stepIds }],
    unresolvedOptionalInstances: state.unresolvedOptionalInstances
  });
}, projectInventoryEntry = (state, entry, registry) => {
  if (entry.status === "unsupported-optional" || entry.status === "invalid" && !entry.capability.descriptor.required)
    return ok(retainOpaqueCapability(state, entry));
  if (entry.status === "supported")
    return projectSupportedCapability(state, entry, registry);
  return ok(state);
}, projectInventory = (inventory, registry, index = 0, state = EMPTY_PLANNING_STATE) => {
  let entry = inventory[index];
  if (!entry)
    return ok(state);
  let projected = projectInventoryEntry(state, entry, registry);
  return projected.ok ? projectInventory(inventory, registry, index + 1, projected.value) : projected;
}, uniqueSorted = (values) => values.filter((value, index) => values.indexOf(value) === index).toSorted(), augmentDependencies = (steps, inventory, capabilitySteps) => steps.map((step) => {
  let crossDependencies = (inventory.find((candidate) => candidate.capability.descriptor.instanceId === step.capabilityInstanceId)?.capability.descriptor.dependencies.filter((dependency) => dependency.kind === "restore-order" || dependency.kind === "hard-decode").flatMap((dependency) => dependency.instanceId ? [dependency.instanceId] : []) ?? []).flatMap((instanceId) => capabilitySteps.find((candidate) => candidate.instanceId === instanceId)?.stepIds ?? []);
  return {
    ...step,
    dependsOn: uniqueSorted([...step.dependsOn, ...crossDependencies])
  };
}), missingDependency = (steps) => steps.flatMap((step) => step.dependsOn.map((dependencyId) => ({
  stepId: step.id,
  dependencyId
}))).find((reference) => stepById(steps, reference.dependencyId) === void 0), resourcesConflict = (left, right) => left.resources.some((resource) => right.resources.includes(resource)), findUnorderedResourceConflict = (steps, leftIndex = 0) => {
  let left = steps[leftIndex];
  if (!left)
    return;
  let right = mutatesResource(left) ? steps.find((candidate, candidateIndex) => candidateIndex > leftIndex && mutatesResource(candidate) && resourcesConflict(left, candidate) && !hasDependencyPath(left.id, candidate.id, steps) && !hasDependencyPath(candidate.id, left.id, steps)) : void 0;
  return right ? [left, right] : findUnorderedResourceConflict(steps, leftIndex + 1);
}, compareStepIds = (left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0, orderSteps = (pending, ordered = []) => {
  if (pending.length === 0)
    return ok(ordered);
  let ready = pending.filter((candidate) => candidate.dependencies.length === 0).map((candidate) => candidate.step).toSorted(compareStepIds);
  if (ready.length === 0)
    return err({ code: "dependency-invalid", message: "Restore plan contains a dependency cycle." });
  let remaining = pending.filter((candidate) => !ready.some((step) => step.id === candidate.step.id)).map((candidate) => ({
    step: candidate.step,
    dependencies: candidate.dependencies.filter((dependency) => !ready.some((step) => step.id === dependency))
  }));
  return orderSteps(remaining, [...ordered, ...ready]);
}, composeTeleportRestorePlan = (inventory, registry) => {
  let blockerIssues = requiredBlockerIssues(inventory);
  if (blockerIssues.length > 0)
    return err(...blockerIssues);
  let projected = projectInventory(inventory, registry);
  if (!projected.ok)
    return projected;
  let invalidStep = projected.value.steps.find((step, index) => step.id.length === 0 || projected.value.steps.findIndex((candidate) => candidate.id === step.id) !== index);
  if (invalidStep)
    return err({
      code: "dependency-invalid",
      message: `Restore step id ${invalidStep.id || "<empty>"} is invalid or duplicated.`
    });
  let augmented = augmentDependencies(projected.value.steps, inventory, projected.value.capabilitySteps), missing = missingDependency(augmented);
  if (missing)
    return err({
      code: "dependency-invalid",
      message: `Restore step ${missing.stepId} depends on missing step ${missing.dependencyId}.`
    });
  let conflict = findUnorderedResourceConflict(augmented);
  if (conflict)
    return err({
      code: "dependency-invalid",
      message: `Restore steps ${conflict[0].id} and ${conflict[1].id} have an unordered resource conflict.`
    });
  let ordered = orderSteps(augmented.map((step) => ({
    step,
    dependencies: step.dependsOn
  })));
  if (!ordered.ok)
    return ordered;
  return ok({
    steps: ordered.value,
    confirmations: ordered.value.filter((step) => step.requiresConfirmation).map((step) => step.id),
    unresolvedOptionalInstances: projected.value.unresolvedOptionalInstances.toSorted()
  });
};

// src/teleport/restore-executor.ts
var restoreIssue = (code3, message, step) => ({
  code: code3,
  message,
  instanceId: step.capabilityInstanceId
}), settleResult = (operation, step, phase) => operation.then((result) => result, () => err(restoreIssue("execution-failed", `Restore step ${step.id} ${phase} failed unexpectedly.`, step))), settleCleanup = (staged, port) => port.cleanup(staged.step, staged.token).then(() => [], () => [restoreIssue("execution-failed", `Restore step ${staged.step.id} cleanup failed.`, staged.step)]), stageSteps = async (steps, port, index = 0, staged = [], warnings = []) => {
  let step = steps[index];
  if (!step)
    return { ok: !0, staged, warnings };
  let result = await settleResult(port.stage(step), step, "staging");
  if (!result.ok)
    return { ok: !1, issues: result.issues, staged, warnings };
  return stageSteps(steps, port, index + 1, [...staged, { step, token: result.value }], [...warnings, ...result.warnings]);
}, cleanupStaged = async (staged, port, index = 0, issues = []) => {
  let current = staged[index];
  if (!current)
    return issues;
  let cleanupIssues = await settleCleanup(current, port);
  return cleanupStaged(staged, port, index + 1, [...issues, ...cleanupIssues]);
}, commitSteps = async (staged, port, index = 0, committed = [], warnings = []) => {
  let current = staged[index];
  if (!current)
    return { ok: !0, committed, warnings };
  let committedResult = await settleResult(port.commit(current.step, current.token), current.step, "commit");
  if (!committedResult.ok)
    return { ok: !1, issues: committedResult.issues.length > 0 ? committedResult.issues : [restoreIssue("execution-failed", `Restore step ${current.step.id} did not commit.`, current.step)], committed, warnings };
  let receipt = {
    stepId: current.step.id,
    capabilityInstanceId: current.step.capabilityInstanceId,
    token: committedResult.value
  }, nextCommitted = [...committed, { step: current.step, receipt }], nextWarnings = [...warnings, ...committedResult.warnings], verified = await settleResult(port.verify(current.step, receipt.token), current.step, "verification");
  if (!verified.ok)
    return { ok: !1, issues: verified.issues.length > 0 ? verified.issues : [restoreIssue("verification-failed", `Restore step ${current.step.id} did not verify.`, current.step)], committed: nextCommitted, warnings: nextWarnings };
  return commitSteps(staged, port, index + 1, nextCommitted, [...nextWarnings, ...verified.warnings]);
}, rollbackCommitted = async (committed, port, index = committed.length - 1, outcome = { rolledBackStepIds: [], issues: [] }) => {
  let current = committed[index];
  if (!current)
    return outcome;
  if (!current.step.reversible)
    return rollbackCommitted(committed, port, index - 1, outcome);
  let rolledBack = await settleResult(port.rollback(current.step, current.receipt.token), current.step, "rollback");
  return rollbackCommitted(committed, port, index - 1, rolledBack.ok ? {
    rolledBackStepIds: [...outcome.rolledBackStepIds, current.step.id],
    issues: outcome.issues
  } : {
    rolledBackStepIds: outcome.rolledBackStepIds,
    issues: [
      ...outcome.issues,
      ...rolledBack.issues.length > 0 ? rolledBack.issues : [restoreIssue("execution-failed", `Restore step ${current.step.id} rollback failed.`, current.step)]
    ]
  });
}, authorizationIssue = (plan, authorization) => {
  let unauthorized = plan.steps.find((step) => !authorization.allowEffects.includes(step.effect));
  if (unauthorized)
    return restoreIssue("policy-rejected", `Restore effect ${unauthorized.effect} is not authorized.`, unauthorized);
  let unconfirmed = plan.steps.find((step) => step.requiresConfirmation && !authorization.confirmedStepIds?.includes(step.id));
  return unconfirmed ? restoreIssue("policy-rejected", `Restore step ${unconfirmed.id} requires explicit confirmation.`, unconfirmed) : void 0;
}, executeTeleportRestorePlan = async (plan, authorization, port) => {
  let denied = authorizationIssue(plan, authorization);
  if (denied)
    return err(denied);
  let staging = await stageSteps(plan.steps, port);
  if (!staging.ok) {
    let cleanupIssues2 = await cleanupStaged(staging.staged, port);
    return err(...staging.issues, ...cleanupIssues2);
  }
  let execution = await commitSteps(staging.staged, port);
  if (execution.ok) {
    let cleanupIssues2 = await cleanupStaged(staging.staged, port);
    return ok({
      status: "committed",
      receipts: execution.committed.map((entry) => entry.receipt),
      rolledBackStepIds: []
    }, [...staging.warnings, ...execution.warnings, ...cleanupIssues2]);
  }
  let rollback = await rollbackCommitted(execution.committed, port), cleanupIssues = await cleanupStaged(staging.staged, port);
  return err(...execution.issues, ...rollback.issues, ...cleanupIssues);
};

// src/teleport/signature.ts
var bytesBuffer = (bytes) => Uint8Array.from(bytes).buffer, teleportSignedPayloadBytes = (manifest) => coerce(encode4({
  type: "wx-teleport-signed-graph",
  version: 1,
  ...manifest.createdAt ? { createdAt: manifest.createdAt } : {},
  capabilities: manifest.capabilities,
  keyEnvelopes: manifest.keyEnvelopes
})), payloadCid = async (bytes) => CID.createV1(code, await sha256.digest(bytes)), captureSignatureEffect = (effect, failureMessage) => Promise.resolve().then(effect).then((value) => ok(value), () => err({ code: "signature-invalid", message: failureMessage })), createTeleportSignature = async (manifest, signer, id = signer.keyId) => {
  if (!id || !signer.keyId || signer.privateKey.algorithm.name !== "Ed25519")
    return err({ code: "signature-invalid", message: "An Ed25519 signing key and stable key identity are required." });
  return captureSignatureEffect(async () => {
    let payload = teleportSignedPayloadBytes(manifest), bytes = new Uint8Array(await crypto.subtle.sign("Ed25519", signer.privateKey, bytesBuffer(payload)));
    return {
      descriptor: {
        id,
        mode: "ed25519-v1",
        signerKeyId: signer.keyId,
        signedPayload: await payloadCid(payload),
        block: CID.createV1(code2, await sha256.digest(bytes))
      },
      bytes
    };
  }, "Teleport graph signing failed.");
}, addTeleportSignature = async (cartridge, signer, id = signer.keyId) => {
  if (cartridge.signatures.some((signature2) => signature2.descriptor.id === id))
    return err({ code: "signature-invalid", message: `Teleport signature id ${id} already exists.` });
  let signature = await createTeleportSignature(cartridge.manifest, signer, id);
  if (!signature.ok)
    return signature;
  return createTeleportCartridge({
    ...cartridge.manifest.createdAt ? { createdAt: cartridge.manifest.createdAt } : {},
    capabilities: cartridge.capabilities.map(({ descriptor, storedBytes }) => ({
      capabilityId: descriptor.capabilityId,
      instanceId: descriptor.instanceId,
      schemaVersion: descriptor.schemaVersion,
      securityClass: descriptor.securityClass,
      required: descriptor.required,
      restoreMode: descriptor.restoreMode,
      codec: descriptor.codec,
      dependencies: descriptor.dependencies,
      bytes: storedBytes,
      cid: descriptor.block,
      protection: descriptor.protection
    })),
    keyEnvelopes: cartridge.keyEnvelopes.map((envelope) => ({ descriptor: envelope.descriptor, bytes: envelope.bytes })),
    signatures: [...cartridge.signatures.map((existing) => ({ descriptor: existing.descriptor, bytes: existing.bytes })), signature.value]
  });
}, verifyKnownSignature = async (verified, signature, verifiers, expectedPayload, payload) => {
  if (!verified.ok)
    return verified;
  let verifier = verifiers.findLast((candidate) => candidate.keyId === signature.descriptor.signerKeyId);
  if (!verifier)
    return verified;
  if (!signature.descriptor.signedPayload.equals(expectedPayload))
    return err({ code: "signature-invalid", message: "Teleport signature is bound to a different graph." });
  let valid = await captureSignatureEffect(() => crypto.subtle.verify("Ed25519", verifier.publicKey, bytesBuffer(signature.bytes), bytesBuffer(payload)), `Teleport signature ${signature.descriptor.id} verification failed.`);
  if (!valid.ok)
    return valid;
  return valid.value ? ok([...verified.value, signature.descriptor.signerKeyId], verified.warnings) : err({ code: "signature-invalid", message: `Teleport signature ${signature.descriptor.id} is invalid.` });
}, verifyTeleportSignatures = async (cartridge, verifiers, requiredSignerKeyIds = []) => {
  let preparedPayload = await captureSignatureEffect(async () => {
    let payload = teleportSignedPayloadBytes(cartridge.manifest);
    return { expectedPayload: await payloadCid(payload), payload };
  }, "Teleport signature verification payload preparation failed.");
  if (!preparedPayload.ok)
    return preparedPayload;
  let verified = await cartridge.signatures.reduce((prior, signature) => prior.then((state) => verifyKnownSignature(state, signature, verifiers, preparedPayload.value.expectedPayload, preparedPayload.value.payload)), Promise.resolve(ok([])));
  if (!verified.ok)
    return verified;
  let verifiedSignerKeyIds = verified.value.filter((keyId, index, keyIds) => keyIds.indexOf(keyId) === index).toSorted(), missing = requiredSignerKeyIds.find((keyId) => !verifiedSignerKeyIds.includes(keyId));
  return missing === void 0 ? ok({ verifiedSignerKeyIds }, verified.warnings) : err({ code: "signature-invalid", message: `Required Teleport signer ${missing} is missing or untrusted.` });
};

// src/teleport/transport-policy.ts
var safePathSegment = (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value), parseCid = Result.fromThrowable((value) => CID.parse(value), () => {
  return;
}), validCid = (value) => parseCid(value).match((cid) => cid.toString() === value, () => !1), validRange = (range) => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.endExclusive) && range.start >= 0 && range.endExclusive > range.start, uniqueSorted2 = (values) => values.filter((value, index) => values.indexOf(value) === index).toSorted(), compareCloudObjects = (left, right) => {
  if (left.kind === "root")
    return right.kind === "root" ? 0 : 1;
  if (right.kind === "root")
    return -1;
  return left.cid.toString().localeCompare(right.cid.toString());
}, graphObjects = (cartridge) => [
  ...cartridge.capabilities.map((capability) => ({
    cid: capability.descriptor.block,
    bytes: capability.storedBytes,
    kind: "capability"
  })),
  ...cartridge.keyEnvelopes.map((envelope) => ({
    cid: envelope.descriptor.block,
    bytes: envelope.bytes,
    kind: "key-envelope"
  })),
  ...cartridge.signatures.map((signature) => ({
    cid: signature.descriptor.block,
    bytes: signature.bytes,
    kind: "signature"
  })),
  {
    cid: cartridge.root,
    bytes: cartridge.rootBytes,
    kind: "root"
  }
], planTeleportCloudPublication = (cartridge) => {
  let candidates = graphObjects(cartridge), objects = candidates.filter((object, index) => candidates.findLastIndex((candidate) => candidate.cid.equals(object.cid)) === index).toSorted(compareCloudObjects);
  return ok({ root: cartridge.root.toString(), objects });
}, planTeleportS3Scope = (options) => {
  let segments = options.tenantPrefix.split("/").filter(Boolean);
  return options.bucket && segments.length > 0 && segments.every(safePathSegment) ? ok({ bucket: options.bucket, prefix: segments.join("/") }) : err({ code: "dependency-invalid", message: "S3 bucket or tenant prefix is invalid." });
}, planTeleportS3Read = (scope, cid, kind, range) => {
  if (!validCid(cid) || range !== void 0 && !validRange(range))
    return err({ code: "dependency-invalid", message: "S3 object CID or byte range is invalid." });
  return ok({
    bucket: scope.bucket,
    key: `${scope.prefix}/${kind === "root" ? "roots" : "blocks"}/${cid}`,
    ...range === void 0 ? {} : { range }
  });
}, planTeleportS3ImmutablePut = (scope, object, checksumSha256) => ({
  bucket: scope.bucket,
  key: `${scope.prefix}/${object.kind === "root" ? "roots" : "blocks"}/${object.cid.toString()}`,
  body: object.bytes,
  checksumSha256,
  contentType: object.kind === "root" ? "application/vnd.ipld.dag-cbor" : "application/octet-stream",
  ifNoneMatch: "*"
}), planTeleportS3HeadPut = (scope, head) => {
  if (!safePathSegment(head.workspaceId))
    return err({ code: "dependency-invalid", message: "Workspace head identity is invalid." });
  return ok({
    bucket: scope.bucket,
    key: `${scope.prefix}/heads/${head.workspaceId}.json`,
    body: (/* @__PURE__ */ new TextEncoder()).encode(JSON.stringify({ root: head.root })),
    contentType: "application/json",
    ...head.previousVersion === void 0 ? { ifNoneMatch: "*" } : { ifMatch: head.previousVersion }
  });
}, completeTeleportS3PutPlan = (plan, checksumSha256) => ({ ...plan, checksumSha256 }), useTeleportMultipartPut = (bodyLength, options, multipartAvailable) => multipartAvailable && bodyLength >= (options.multipartThresholdBytes ?? 8388608), planTeleportReachabilityRetention = (publications, retainedRoots, allObjectCids) => {
  let retained = uniqueSorted2(retainedRoots), missing = retained.find((root) => !publications.some((publication) => publication.root === root));
  if (missing !== void 0)
    return err({
      code: "missing-block",
      message: `Retained cloud root ${missing} has no publication inventory.`
    });
  let reachableObjectCids = uniqueSorted2(retained.flatMap((root) => publications.findLast((publication) => publication.root === root)?.objects.map((object) => object.cid.toString()) ?? []));
  return ok({
    retainedRoots: retained,
    reachableObjectCids,
    deleteCandidateCids: uniqueSorted2(allObjectCids).filter((cid) => !reachableObjectCids.includes(cid))
  });
};

// src/teleport/transport-object-store-adapter.ts
var captureTransportValue = (effect, issue) => Promise.resolve().then(effect).then((value) => ok(value), () => err(issue)), captureTransportResult = (effect, issue) => Promise.resolve().then(effect).then((result) => result, () => err(issue)), base64 = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")), publishObjects = async (publication, store, index = 0, warnings = []) => {
  let object = publication.objects[index];
  if (object === void 0)
    return ok(void 0, warnings);
  let stored = await captureTransportResult(() => store.putImmutable(object), {
    code: "execution-failed",
    message: `Cloud object ${object.cid.toString()} publication failed unexpectedly.`
  });
  return stored.ok ? publishObjects(publication, store, index + 1, [...warnings, ...stored.warnings]) : stored;
}, publishTeleportCloudCartridge = async (cartridge, store, options = {}) => {
  let publication = planTeleportCloudPublication(cartridge);
  if (!publication.ok)
    return publication;
  let stored = await publishObjects(publication.value, store);
  if (!stored.ok)
    return stored;
  if (!options.workspaceId)
    return ok({ root: publication.value.root }, [...publication.warnings, ...stored.warnings]);
  if (store.publishHead === void 0)
    return err({
      code: "dependency-invalid",
      message: "Cloud store does not support mutable workspace heads."
    });
  let head = {
    workspaceId: options.workspaceId,
    root: publication.value.root,
    ...options.previousHeadVersion === void 0 ? {} : { previousVersion: options.previousHeadVersion }
  }, published = await captureTransportResult(() => store.publishHead?.(head) ?? Promise.resolve(err({
    code: "dependency-invalid",
    message: "Cloud store does not support mutable workspace heads."
  })), {
    code: "execution-failed",
    message: `Workspace head ${options.workspaceId} publication failed unexpectedly.`
  });
  return published.ok ? ok({ root: publication.value.root, headVersion: published.value.version }, [...publication.warnings, ...stored.warnings, ...published.warnings]) : published;
}, createTeleportS3Source = (port, options) => {
  let scope = planTeleportS3Scope(options), getObject = port.getObject;
  if (!scope.ok || getObject === void 0)
    return err({
      code: "dependency-invalid",
      message: "S3 range source configuration is invalid."
    });
  return ok({
    readObject: (cid, kind, range) => {
      let input = planTeleportS3Read(scope.value, cid, kind, range);
      return input.ok ? captureTransportResult(() => getObject(input.value), {
        code: "execution-failed",
        message: `S3 object ${cid} read failed unexpectedly.`
      }) : Promise.resolve(input);
    }
  });
}, putTeleportS3Object = (port, options, input) => {
  let multipart = port.putMultipart, operation = useTeleportMultipartPut(input.body.byteLength, options, multipart !== void 0) && multipart !== void 0 ? () => multipart({
    ...input,
    partSizeBytes: options.multipartPartSizeBytes ?? 8388608
  }) : () => port.putObject(input);
  return captureTransportResult(operation, {
    code: "execution-failed",
    message: `S3 object ${input.key} write failed unexpectedly.`
  });
}, publishTeleportS3Head = async (port, options, scope, head) => {
  let plan = planTeleportS3HeadPut(scope, head);
  if (!plan.ok)
    return plan;
  let digest = await captureTransportValue(() => crypto.subtle.digest("SHA-256", Uint8Array.from(plan.value.body).buffer), {
    code: "execution-failed",
    message: `Workspace head ${head.workspaceId} checksum calculation failed.`
  });
  if (!digest.ok)
    return digest;
  let published = await putTeleportS3Object(port, options, completeTeleportS3PutPlan(plan.value, base64(new Uint8Array(digest.value))));
  return published.ok ? ok({ version: published.value.version }, [...digest.warnings, ...published.warnings]) : published;
}, createTeleportS3Store = (port, options) => {
  let scope = planTeleportS3Scope(options);
  if (!scope.ok)
    return scope;
  return ok({
    putImmutable: async (object) => {
      let published = await putTeleportS3Object(port, options, planTeleportS3ImmutablePut(scope.value, object, base64(object.cid.multihash.digest)));
      return published.ok ? ok(published.value.outcome ?? "created", published.warnings) : published;
    },
    publishHead: (head) => publishTeleportS3Head(port, options, scope.value, head)
  });
};

// src/teleport/transport-stream-adapter.ts
var streamIssue = (code3, message) => ({ code: code3, message }), captureStreamValue = (effect, issue) => Promise.resolve().then(effect).then((value) => ok(value), () => err(issue)), closeStream = (iterator) => Promise.resolve().then(() => iterator.return?.()).then(() => {
  return;
}, () => {
  return;
}), terminateWith = async (iterator, result) => (await closeStream(iterator), result), collectStreamChunks = async (iterator, contentLength, maxBytes, state = { chunks: [], total: 0 }) => {
  let next = await captureStreamValue(() => iterator.next(), streamIssue("execution-failed", "S3 object stream failed unexpectedly."));
  if (!next.ok)
    return next;
  if (next.value.done === !0)
    return state.total === contentLength ? ok(state) : err(streamIssue("car-invalid", "S3 object stream length does not match its declaration."));
  let chunk = next.value.value;
  if (!(chunk instanceof Uint8Array))
    return terminateWith(iterator, err(streamIssue("car-invalid", "S3 object stream yielded a non-byte chunk.")));
  let total = state.total + chunk.byteLength;
  if (total > maxBytes || total > contentLength)
    return terminateWith(iterator, err(streamIssue("budget-exceeded", "S3 object stream exceeds its declared or configured budget.")));
  return collectStreamChunks(iterator, contentLength, maxBytes, {
    chunks: [...state.chunks, Uint8Array.from(chunk)],
    total
  });
}, assembleChunks = (chunks) => captureStreamValue(async () => new Uint8Array(await new Blob(chunks.map((chunk) => Uint8Array.from(chunk).buffer)).arrayBuffer()), streamIssue("execution-failed", "S3 object stream assembly failed unexpectedly.")), collectTeleportS3Object = async (output, maxBytes) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(output.contentLength) || output.contentLength < 0 || !Number.isSafeInteger(output.totalLength) || output.totalLength < output.contentLength || output.contentLength > maxBytes)
    return err(streamIssue("budget-exceeded", "S3 object exceeds its read budget."));
  let iterator = await captureStreamValue(() => output.body[Symbol.asyncIterator](), streamIssue("execution-failed", "S3 object stream could not be opened."));
  if (!iterator.ok)
    return iterator;
  let collected = await collectStreamChunks(iterator.value, output.contentLength, maxBytes);
  if (!collected.ok)
    return collected;
  let assembled = await assembleChunks(collected.value.chunks);
  return assembled.ok && assembled.value.byteLength === collected.value.total ? assembled : err(streamIssue("car-invalid", "S3 object stream assembly changed its byte length."));
};
export {
  ASSET_BLOB_CAPABILITY_ID,
  ASSET_METADATA_CAPABILITY_ID,
  BrowserDeviceRecipientKeyProvider,
  DEFAULT_CAPABILITY_BUDGET,
  DEFAULT_CARTRIDGE_LIMITS,
  TELEPORT_GOLDEN_VECTOR_V1,
  addTeleportSignature,
  assetBlobCapabilityCodec,
  assetMetadataCapabilityCodec,
  collectTeleportS3Object,
  completeTeleportS3PutPlan,
  composeTeleportRestorePlan,
  createPrivateInventoryCartridge,
  createTeleportCartridge,
  createTeleportCodecRegistry,
  createTeleportCodecRegistryWith,
  createTeleportGoldenVectorV1,
  createTeleportS3Source,
  createTeleportS3Store,
  createTeleportSignature,
  decodeCapability,
  decodeTeleportInventory,
  encodeCapability,
  encodeTeleportAsset,
  err,
  executeTeleportRestorePlan,
  migrateCapabilityValue,
  ok,
  planTeleportCloudPublication,
  planTeleportReachabilityRetention,
  planTeleportS3HeadPut,
  planTeleportS3ImmutablePut,
  planTeleportS3Read,
  planTeleportS3Scope,
  protectCapabilityBlocks,
  protectCapabilityBlocksForRecipient,
  protectCapabilityBlocksForRecipients,
  protectCapabilityBlocksWithKeyProvider,
  publishTeleportCloudCartridge,
  reexportVerifiedCartridge,
  registerTeleportCodec,
  runTeleportCodecConformance,
  streamTeleportCartridge,
  teleportCodecFromRegistry,
  teleportCodecRegistrySupports,
  teleportSignedPayloadBytes,
  unlockPrivateInventoryCartridge,
  unlockTeleportCartridge,
  unlockTeleportCartridgeForRecipient,
  unlockTeleportCartridgeWithKeyProvider,
  unlockTeleportCartridgeWithRecipientUnwrapper,
  unlockTeleportCartridgeWithUnwrapProvider,
  useTeleportMultipartPut,
  validateProtocolValue,
  verifyTeleportCartridge,
  verifyTeleportCartridgeStream,
  verifyTeleportGoldenVectorV1,
  verifyTeleportSignatures,
  writeTeleportCartridge
};
