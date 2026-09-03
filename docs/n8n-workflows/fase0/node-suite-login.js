// == CRIPTO EN JS PURO - recortado de fase0/, no transcrito ==
function sha256Bytes(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const ml = bytes.length * 8;
  const withPad = bytes.slice();
  withPad.push(0x80);
  while (withPad.length % 64 !== 56) withPad.push(0);
  for (let i = 7; i >= 0; i--) withPad.push((ml / Math.pow(2, i * 8)) & 0xff);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < withPad.length; i += 64) {
    const w = new Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = (withPad[i+j*4] << 24) | (withPad[i+j*4+1] << 16) | (withPad[i+j*4+2] << 8) | withPad[i+j*4+3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rr(w[j-15],7) ^ rr(w[j-15],18) ^ (w[j-15] >>> 3);
      const s1 = rr(w[j-2],17) ^ rr(w[j-2],19) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H = [(H[0]+a)|0,(H[1]+b)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  const out = [];
  for (const x of H) { out.push((x>>>24)&0xff,(x>>>16)&0xff,(x>>>8)&0xff,x&0xff); }
  return out;
}
function strBytes(s) { const o=[]; for (const ch of unescape(encodeURIComponent(s))) o.push(ch.charCodeAt(0)); return o; }
function hmacSha256(keyStr, msgStr) {
  let key = strBytes(keyStr);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36), opad = key.map(b => b ^ 0x5c);
  return sha256Bytes(opad.concat(sha256Bytes(ipad.concat(strBytes(msgStr)))));
}

function b64urlFromBytes(bytes) {
  const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out='';
  for (let i=0;i<bytes.length;i+=3){
    const b0=bytes[i],b1=bytes[i+1],b2=bytes[i+2];
    out+=A[b0>>2]; out+=A[((b0&3)<<4)|((b1===undefined?0:b1)>>4)];
    if(b1!==undefined){ out+=A[((b1&15)<<2)|((b2===undefined?0:b2)>>6)]; if(b2!==undefined) out+=A[b2&63]; }
  }
  return out;
}

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

// == auth/suite-login · logica ==============================================
// Todo lo criptografico de arriba viene RECORTADO de docs/n8n-workflows/fase0/,
// donde esta probado 19/19 contra los vectores estandar de PBKDF2-HMAC-SHA256
// y contra crypto de Node. No se transcribio a mano.
const ITER = 100000, KEYLEN = 32, TTL_SEG = 8 * 3600;
const MAX_INTENTOS = 5, BLOQUEO_MIN = 15;

const inp   = $('Code - Validar payload').item.json;
const sec   = $('Set - secreto').item.json.secret;
const filas = $input.all().map(function (i) { return i.json; });

if (inp._error) {
  return [{ json: { ok: false, error: inp._error, mensaje: inp._mensaje || 'Payload invalido.' } }];
}
if (!sec || ('' + sec).length < 32) {
  // Falla ruidosa a proposito: sin secreto NO se emite token, y se dice por que.
  return [{ json: { ok: false, error: 'SECRETO_NO_CONFIGURADO',
    mensaje: 'SUITE_JWT_SECRET no esta definida o es muy corta en el entorno de n8n.' } }];
}

// -- Lockout por usuario, en staticData --
const sd = $getWorkflowStaticData('global');
if (!sd.intentos) sd.intentos = {};
const ahoraMs = Date.now();
const reg = sd.intentos[inp.username] || { n: 0, hasta: 0 };

if (reg.hasta && ahoraMs < reg.hasta) {
  const faltan = Math.ceil((reg.hasta - ahoraMs) / 60000);
  return [{ json: { ok: false, error: 'BLOQUEADO',
    mensaje: 'Demasiados intentos. Vuelve a intentar en ' + faltan + ' minuto(s).' } }];
}
if (reg.hasta && ahoraMs >= reg.hasta) { reg.n = 0; reg.hasta = 0; }

function fallo() {
  reg.n += 1;
  if (reg.n >= MAX_INTENTOS) { reg.hasta = ahoraMs + BLOQUEO_MIN * 60000; reg.n = 0; }
  sd.intentos[inp.username] = reg;
  // MISMO mensaje para usuario inexistente, inactivo y contrasena mala: si
  // difieren, el error se vuelve un oraculo para enumerar usuarios validos.
  return [{ json: { ok: false, error: 'CREDENCIALES_INVALIDAS',
    mensaje: 'Usuario o contrasena incorrectos.' } }];
}

const u = filas.find(function (f) { return f && f.username === inp.username; });
if (!u) return fallo();
if (u.activo !== true) return fallo();
if (!u.salt || !u.hash) return fallo();

const calc = hexFromBytes(pbkdf2Sha256(inp.password, u.salt, ITER, KEYLEN));
if (!safeEqHex(calc, u.hash)) return fallo();

delete sd.intentos[inp.username];

const scopes = ('' + (u.scopes || '')).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const iat = Math.floor(ahoraMs / 1000);
const payload = {
  sub: u.username,
  nombre: u.nombre || u.username,
  empleado_id: (typeof u.empleado_id === 'number') ? u.empleado_id : null,
  scopes: scopes,
  iat: iat,
  exp: iat + TTL_SEG
};

const h = b64urlFromBytes(strBytes(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const p = b64urlFromBytes(strBytes(JSON.stringify(payload)));
const firma = b64urlFromBytes(hmacBytes(strBytes(sec), strBytes(h + '.' + p)));

return [{ json: {
  ok: true,
  token: h + '.' + p + '.' + firma,
  actor: u.username,
  nombre: payload.nombre,
  empleado_id: payload.empleado_id,
  scopes: scopes,
  exp: payload.exp,
  debe_cambiar_password: (u.debe_cambiar_password === true)
} }];
