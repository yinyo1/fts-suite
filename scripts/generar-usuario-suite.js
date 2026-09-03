#!/usr/bin/env node
/*
 * ═══ Alta de usuario para `auth/suite-login` ═══
 *
 *   node scripts/generar-usuario-suite.js <username> "<Nombre completo>" "<scopes>" [empleado_id]
 *   node scripts/generar-usuario-suite.js aldo "Aldo Méndez" "comercial:read" 118
 *
 * Pide el password por stdin, NO por argv: argv queda en el historial del shell.
 * Imprime `salt` y `hash` para el renglón de la Data Table `suite_usuarios`.
 *
 * ⚠️ La SALIDA no es secreta (salt y hash no son el password) pero el PASSWORD sí:
 *    no lo escribas en el chat, ni en un issue, ni en el repo. Se lo dices a la
 *    persona por un canal aparte y ella lo cambia. (CLAUDE.md §15 #4.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POR QUÉ ESTE ARCHIVO EXISTE, HABIENDO YA UN `comercial/scripts/generar-hash.js`
 *
 * Porque el otro NO SIRVE para este workflow, y el fallo es invisible.
 *
 * Los dos usan PBKDF2-HMAC-SHA256, 100,000 iteraciones, dkLen 32. Lo que difiere
 * es cómo se interpreta el salt:
 *
 *   `comercial/scripts/generar-hash.js`  →  salt = los 16 BYTES crudos
 *   `auth/suite-login`                   →  salt = los 32 CARACTERES del hex
 *
 * El workflow hace `strBytes(saltStr)` sobre el valor de la columna, o sea toma
 * la cadena "68d1f0…" letra por letra. Comprobado ejecutando el algoritmo del
 * workflow contra `crypto.pbkdf2Sync` (2026-09-03):
 *
 *   workflow (JS puro)           2fbf1d39fd529a38a63b9b644d3ad02f…
 *   salt como TEXTO (utf8)       2fbf1d39fd529a38a63b9b644d3ad02f…   ← coincide
 *   salt como BYTES (hex-decode) 26bf2b5fed1f09a6141636bde1ddd557…   ← NO
 *
 * Un hash generado con el otro script se guardaría sin queja y el login diría
 * "Usuario o contraseña incorrectos" para siempre, sin un solo error en ningún
 * lado. Por eso este script se autoverifica corriendo el algoritmo REAL del
 * workflow —copiado del nodo, no reescrito de memoria— antes de imprimir nada.
 */
'use strict';
const crypto = require('crypto');
const readline = require('readline');

const ITER = 100000, DKLEN = 32, SALT_BYTES = 16;

/* ── El algoritmo del workflow, verbatim ──────────────────────────────────
 * Copiado del jsCode de `Code - Verificar y firmar` (workflow kLhyPxVSMbDRwxfC).
 * Está aquí para UNA cosa: comprobar que lo que este script produce es lo que
 * ese workflow va a verificar. Si alguien edita el workflow, la autoverificación
 * de abajo deja de coincidir y el script se niega a imprimir. */
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
function pbkdf2ComoElWorkflow(passStr, saltStr, iter, keylen) {
  const S = strBytes(saltStr);
  let key = strBytes(passStr);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);
  const ipad = key.map(b => b ^ 0x36);
  const opad = key.map(b => b ^ 0x5c);
  const prf = (msgBytes) => sha256Bytes(opad.concat(sha256Bytes(ipad.concat(msgBytes))));
  const bloques = Math.ceil(keylen / 32);
  let out = [];
  for (let i = 1; i <= bloques; i++) {
    const idx = [(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff];
    let u = prf(S.concat(idx));
    const t = u.slice();
    for (let j = 1; j < iter; j++) { u = prf(u); for (let k = 0; k < 32; k++) t[k] ^= u[k]; }
    out = out.concat(t);
  }
  return out.slice(0, keylen);
}
const hexDe = (b) => b.map(x => (x < 16 ? '0' : '') + x.toString(16)).join('');

/** Deriva como lo hace el workflow, usando crypto de Node (rápido). */
function derivar(password, saltHex) {
  return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'),
                           Buffer.from(saltHex, 'utf8'),   // ← TEXTO, no bytes
                           ITER, DKLEN, 'sha256').toString('hex');
}

/** Se niega a seguir si este script y el workflow derivan distinto. */
function autoverificar() {
  const pw = 'prueba-de-paridad', salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const rapido = derivar(pw, salt);
  const workflow = hexDe(pbkdf2ComoElWorkflow(pw, salt, ITER, DKLEN));
  if (rapido !== workflow) {
    console.error('FALLÓ la autoverificación: este script y el workflow derivan distinto.');
    console.error('  este script       : ' + rapido);
    console.error('  algoritmo workflow: ' + workflow);
    console.error('\nNo se generó nada. Alguien cambió uno de los dos.');
    process.exit(1);
  }
}

function main() {
  const [username, nombre, scopes, empleadoId] = process.argv.slice(2);
  if (!username || !nombre) {
    console.error('uso: node scripts/generar-usuario-suite.js <username> "<Nombre>" "<scopes>" [empleado_id]');
    console.error('ej : node scripts/generar-usuario-suite.js aldo "Aldo Méndez" "comercial:read" 118');
    process.exit(1);
  }
  autoverificar();

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl.question('Password para "' + username + '" (temporal, se lo das a la persona aparte): ', (pw) => {
    rl.close();
    if (!pw || pw.length < 8) { console.error('Password vacío o de menos de 8 caracteres. Nada que generar.'); process.exit(1); }
    const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
    const hash = derivar(pw, salt);
    console.error('\n── Renglón para la Data Table `suite_usuarios` (n8n) ──');
    console.error('── El PASSWORD no va aquí y no debe ir al chat ni al repo. ──\n');
    console.log(JSON.stringify({
      username: String(username).trim().toLowerCase(),
      nombre: nombre,
      salt: salt,
      hash: hash,
      scopes: scopes || 'comercial:read',
      activo: true,
      empleado_id: empleadoId ? Number(empleadoId) : null,
      debe_cambiar_password: true
    }, null, 2));
  });
}

main();
