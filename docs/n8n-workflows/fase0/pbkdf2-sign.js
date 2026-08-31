// ── PBKDF2-HMAC-SHA256 + firma JWT, JS PURO ──────────────────────────────────
// El sandbox de Code de n8n no expone require ni crypto (CLAUDE.md §15 conv. 1),
// asi que todo lo criptografico va a mano. Los primitivos SHA-256/HMAC/b64url
// se reusan de jwt-verify.js, que ya esta validado 9/9 contra crypto de Node.
//
// OJO con el salt: generate-suite-hash.js llama a crypto.pbkdf2Sync(pass, salt, …)
// pasando el salt como STRING HEX, y Node toma los bytes UTF-8 de esa cadena —
// NO el hex decodificado. Aqui se hace igual (strBytes del hex). Si algun dia
// alguien "arregla" esto decodificando el hex, todos los hashes existentes dejan
// de validar en silencio.
const { sha256Bytes, strBytes, b64urlFromBytes } = require('./jwt-verify.js');

// HMAC sobre BYTES (el de jwt-verify.js toma strings; PBKDF2 necesita bytes).
function hmacBytes(keyBytes, msgBytes) {
  let key = keyBytes.slice();
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36);
  const opad = key.map(b => b ^ 0x5c);
  return sha256Bytes(opad.concat(sha256Bytes(ipad.concat(msgBytes))));
}

function pbkdf2Sha256(passStr, saltStr, iter, keylen) {
  const S = strBytes(saltStr);

  // El pad de la clave se precalcula UNA vez y se reusa en las 100k vueltas.
  // Sin esto son 100k paddings redundantes y el login tarda de mas.
  let key = strBytes(passStr);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36);
  const opad = key.map(b => b ^ 0x5c);
  const prf = function (msgBytes) {
    return sha256Bytes(opad.concat(sha256Bytes(ipad.concat(msgBytes))));
  };

  const bloques = Math.ceil(keylen / 32);
  let out = [];
  for (let i = 1; i <= bloques; i++) {
    const idx = [(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff];
    let u = prf(S.concat(idx));
    const t = u.slice();
    for (let j = 1; j < iter; j++) {
      u = prf(u);
      for (let k = 0; k < 32; k++) t[k] ^= u[k];
    }
    out = out.concat(t);
  }
  return out.slice(0, keylen);
}

function hexFromBytes(bytes) {
  let s = '';
  for (const b of bytes) s += (b < 16 ? '0' : '') + b.toString(16);
  return s;
}

// Comparacion en tiempo constante: no cortar al primer byte distinto.
function safeEqHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function verificarPassword(passStr, saltHex, hashHexEsperado, iter, keylen) {
  const calc = hexFromBytes(pbkdf2Sha256(passStr, saltHex, iter || 100000, keylen || 32));
  return safeEqHex(calc, hashHexEsperado);
}

// ── Firma del JWT (HS256) ────────────────────────────────────────────────────
function hmacSha256Str(keyStr, msgStr) {
  return hmacBytes(strBytes(keyStr), strBytes(msgStr));
}

function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlFromBytes(strBytes(JSON.stringify(header)));
  const p = b64urlFromBytes(strBytes(JSON.stringify(payload)));
  const firma = b64urlFromBytes(hmacSha256Str(secret, h + '.' + p));
  return h + '.' + p + '.' + firma;
}

module.exports = { hmacBytes, pbkdf2Sha256, hexFromBytes, safeEqHex, verificarPassword, signJWT };
