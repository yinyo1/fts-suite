// HMAC SHA-256 pure JS (sandbox-safe — sin crypto.subtle, sin require, sin process, sin $env)
// Implementacion FIPS 180-4 verificada contra Node crypto + RFC test vector.

const SECRET = '<SECRETO_HMAC_VIVE_EN_N8N_NO_COMMITEAR>'; // rotado 2026-07-17; valor real solo en los Code nodes de pmo/chat-apply + pmo/chat-direct

const _K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function _rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

function _sha256(bytes) {
  const len = bytes.length;
  const bitLen = len * 8;
  const padLen = ((len + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[len] = 0x80;
  padded[padLen - 4] = (bitLen >>> 24) & 0xff;
  padded[padLen - 3] = (bitLen >>> 16) & 0xff;
  padded[padLen - 2] = (bitLen >>> 8) & 0xff;
  padded[padLen - 1] = bitLen & 0xff;
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = ((padded[off+i*4] << 24) | (padded[off+i*4+1] << 16) | (padded[off+i*4+2] << 8) | padded[off+i*4+3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = _rotr(W[i-15], 7) ^ _rotr(W[i-15], 18) ^ (W[i-15] >>> 3);
      const s1 = _rotr(W[i-2], 17) ^ _rotr(W[i-2], 19) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let a=H[0], b=H[1], c=H[2], d=H[3], e=H[4], f=H[5], g=H[6], h=H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const t1 = (h + S1 + ch + _K[i] + W[i]) >>> 0;
      const S0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4]   = (H[i] >>> 24) & 0xff;
    out[i*4+1] = (H[i] >>> 16) & 0xff;
    out[i*4+2] = (H[i] >>> 8) & 0xff;
    out[i*4+3] = H[i] & 0xff;
  }
  return out;
}

function _hmacSha256(keyBytes, msgBytes) {
  const blocksize = 64;
  let key = keyBytes;
  if (key.length > blocksize) key = _sha256(key);
  if (key.length < blocksize) {
    const padded = new Uint8Array(blocksize);
    padded.set(key);
    key = padded;
  }
  const ipad = new Uint8Array(blocksize);
  const opad = new Uint8Array(blocksize);
  for (let i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36;
    opad[i] = key[i] ^ 0x5c;
  }
  const inner = new Uint8Array(blocksize + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, blocksize);
  const innerHash = _sha256(inner);
  const outer = new Uint8Array(blocksize + 32);
  outer.set(opad);
  outer.set(innerHash, blocksize);
  return _sha256(outer);
}

function _bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    if (h.length === 1) s += '0';
    s += h;
  }
  return s;
}

function _hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.substr(i, 2), 16);
    if (isNaN(b)) return null;
    out[i / 2] = b;
  }
  return out;
}

function _ctEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// === Self-test al inicio: vector RFC ===
const _enc = new TextEncoder();
const _testHash = _bytesToHex(_hmacSha256(_enc.encode('key'), _enc.encode('The quick brown fox jumps over the lazy dog')));
if (_testHash !== 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8') {
  return [{ json: { _error: true, code: 'INTERNAL_HASH_BROKEN', http: 500, msg: 'Self-test SHA-256 fallo. Got: ' + _testHash } }];
}

// === Validacion del request ===
const body = $input.first().json.body || $input.first().json || {};
const { message, userId, timestamp, signature, history, file_sha } = body;

if (!message || !userId || !timestamp || !signature) {
  return [{ json: { _error: true, code: 'MISSING_FIELDS', http: 400, msg: 'message, userId, timestamp, signature requeridos' } }];
}

const ts = Date.parse(timestamp);
if (isNaN(ts)) {
  return [{ json: { _error: true, code: 'BAD_TIMESTAMP', http: 400, msg: 'timestamp no parseable' } }];
}

if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
  return [{ json: { _error: true, code: 'STALE_TIMESTAMP', http: 401, msg: 'timestamp fuera de ventana 5min' } }];
}

const sigBytes = _hexToBytes(signature);
if (!sigBytes) {
  return [{ json: { _error: true, code: 'BAD_SIGNATURE', http: 401, msg: 'firma no es hex valido' } }];
}

const dataBytes = _enc.encode(timestamp + JSON.stringify({ message, userId }));
const keyBytes = _enc.encode(SECRET);

let expectedHash;
try {
  expectedHash = _hmacSha256(keyBytes, dataBytes);
} catch (e) {
  return [{ json: { _error: true, code: 'CRYPTO_FAIL', http: 500, msg: 'HMAC compute error: ' + (e && e.message || 'unknown') } }];
}

if (!_ctEqualBytes(expectedHash, sigBytes)) {
  return [{ json: { _error: true, code: 'BAD_SIGNATURE', http: 401, msg: 'firma HMAC invalida' } }];
}

return [{
  json: {
    _error: false,
    message: String(message).slice(0, 4000),
    userId: String(userId),
    history: Array.isArray(history) ? history.slice(-10) : [],
    file_sha_client: file_sha || null
  }
}];