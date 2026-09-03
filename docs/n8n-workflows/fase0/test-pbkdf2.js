// Valida el PBKDF2 y la firma JWT en JS puro contra DOS oraculos independientes:
//   1. los vectores estandar publicados de PBKDF2-HMAC-SHA256
//   2. crypto de Node
// Que coincida con Node solo probaria que reproduzco a Node; los vectores
// prueban que ambos implementan el algoritmo correcto.
const crypto = require('crypto');
const { pbkdf2Sha256, hexFromBytes, verificarPassword, signJWT, safeEqHex } = require('./pbkdf2-sign.js');
const { verifyJWT } = require('./jwt-verify.js');

let ok = 0, fail = 0;
function chk(nombre, cond, extra) {
  if (cond) { ok++; console.log('  OK    ' + nombre); }
  else { fail++; console.log('  FALLA ' + nombre + (extra ? '\n        ' + extra : '')); }
}

console.log('\n── PBKDF2-HMAC-SHA256 · vectores estandar ──');
const VECTORES = [
  ['password', 'salt', 1,    32, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
  ['password', 'salt', 2,    32, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
  ['password', 'salt', 4096, 32, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a']
];
for (const [p, s, c, dk, esperado] of VECTORES) {
  const got = hexFromBytes(pbkdf2Sha256(p, s, c, dk));
  chk('c=' + c + ' dkLen=' + dk, got === esperado, 'esperado ' + esperado + '\n        obtuve   ' + got);
}

console.log('\n── PBKDF2 · contra crypto de Node ──');
const CASOS = [
  ['password corta', 'abc', 'deadbeef', 1000, 32],
  ['con acentos y emoji', 'contraseña con ñ y 🔐', 'a1b2c3d4e5f60718', 1000, 32],
  ['salt hex de 32 chars (el formato real)', 'Password-Larga-2026', '9f86d081884c7d659a2feaa0c55ad015', 1000, 32],
  ['dkLen 64 (dos bloques)', 'otra', 'salt-largo-de-prueba', 500, 64],
  ['password > 64 bytes (se hashea la clave)', 'x'.repeat(100), 'sal', 500, 32]
];
for (const [nombre, p, s, c, dk] of CASOS) {
  const mio = hexFromBytes(pbkdf2Sha256(p, s, c, dk));
  const node = crypto.pbkdf2Sync(p, s, c, dk, 'sha256').toString('hex');
  chk(nombre, mio === node, 'node ' + node + '\n        mio  ' + mio);
}

console.log('\n── Parametros REALES del generador (100k · 32 bytes) ──');
const salt = crypto.randomBytes(16).toString('hex');
const pass = 'Contrasena-De-Prueba-2026';
const t0 = Date.now();
const mio100k = hexFromBytes(pbkdf2Sha256(pass, salt, 100000, 32));
const ms = Date.now() - t0;
const node100k = crypto.pbkdf2Sync(pass, salt, 100000, 32, 'sha256').toString('hex');
chk('100k iteraciones coincide con Node', mio100k === node100k);
console.log('        tiempo en JS puro: ' + ms + ' ms');

console.log('\n── verificarPassword ──');
chk('acepta la correcta', verificarPassword(pass, salt, node100k, 100000, 32) === true);
chk('rechaza la incorrecta', verificarPassword(pass + 'x', salt, node100k, 100000, 32) === false);
chk('rechaza salt distinto', verificarPassword(pass, crypto.randomBytes(16).toString('hex'), node100k, 100000, 32) === false);
chk('rechaza hash de largo distinto', verificarPassword(pass, salt, node100k.slice(0, 40), 100000, 32) === false);
chk('safeEqHex rechaza null', safeEqHex(null, node100k) === false);

console.log('\n── signJWT ↔ verifyJWT (ida y vuelta) ──');
const SECRET = crypto.randomBytes(32).toString('hex');
const ahora = Math.floor(Date.now() / 1000);
const tok = signJWT({ sub: 'ana.acevedo', scopes: ['nomina:write', 'rh:read'], empleado_id: 101, iat: ahora, exp: ahora + 28800 }, SECRET);

const v1 = verifyJWT(tok, SECRET, 'nomina:write');
chk('token valido con el scope pedido', v1.ok === true && v1.actor === 'ana.acevedo');
const v2 = verifyJWT(tok, SECRET, 'rh:write');
chk('mismo token, scope que NO tiene -> SCOPE_INSUFICIENTE', v2.ok === false && v2.error === 'SCOPE_INSUFICIENTE');
const v3 = verifyJWT(tok, crypto.randomBytes(32).toString('hex'), 'nomina:write');
chk('secreto equivocado -> FIRMA_INVALIDA', v3.ok === false && v3.error === 'FIRMA_INVALIDA');
const expirado = signJWT({ sub: 'x', scopes: ['nomina:write'], iat: ahora - 40000, exp: ahora - 100 }, SECRET);
chk('token expirado -> TOKEN_EXPIRADO', verifyJWT(expirado, SECRET, 'nomina:write').error === 'TOKEN_EXPIRADO');
const partes = tok.split('.');
const manipulado = partes[0] + '.' + Buffer.from(JSON.stringify({ sub: 'ana.acevedo', scopes: ['rh:write'], exp: ahora + 28800 })).toString('base64url') + '.' + partes[2];
chk('payload manipulado -> FIRMA_INVALIDA', verifyJWT(manipulado, SECRET, 'rh:write').error === 'FIRMA_INVALIDA');

console.log('\n' + (fail === 0 ? 'TODO EN VERDE' : '*** ' + fail + ' FALLAS ***') + '  —  ' + ok + '/' + (ok + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);
