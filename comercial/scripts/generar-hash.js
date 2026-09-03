#!/usr/bin/env node
/*
 * ═══ Generador de salt+hash para auth/comercial-login ═══
 *
 *   node comercial/scripts/generar-hash.js aldo "Aldo Mendez" comercial:vendedor
 *
 * Pide el password por stdin (no por argv: argv queda en el historial del shell).
 * Imprime el renglón JSON que va dentro de la env var COMERCIAL_USERS de Railway.
 *
 * ⚠ Este archivo NO contiene secretos y por eso SÍ se commitea: la convención de
 *   CLAUDE.md §15 #4 manda los generadores a scripts/local/ (gitignored), pero un
 *   script invisible no se puede revisar en el PR y se pierde. Lo sensible es la
 *   SALIDA, no el código. La salida va directo a Railway: nunca al repo, ni al
 *   chat, ni a un issue.
 *
 * Parámetros de derivación: PBKDF2-HMAC-SHA256, 100,000 iteraciones, dkLen 32,
 * salt de 16 bytes. Son EXACTAMENTE los del Code node del workflow; si alguien
 * cambia uno de los dos, los logins dejan de funcionar sin ningún error visible.
 * Por eso el script se autoverifica contra una reimplementación del algoritmo
 * del workflow antes de imprimir nada.
 */
'use strict';
const crypto = require('crypto');
const readline = require('readline');

const ITER = 100000, DKLEN = 32, SALT_BYTES = 16;

// Reimplementación del _pbkdf2 del workflow (1 bloque, XOR acumulado sobre HMAC)
// para comprobar que produce lo mismo que crypto.pbkdf2Sync.
function pbkdf2ComoElWorkflow(pass, salt, iter) {
  const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
  const blk = Buffer.concat([salt, Buffer.from([0, 0, 0, 1])]);
  let u = hmac(pass, blk);
  const t = Buffer.from(u);
  for (let i = 1; i < iter; i++) {
    u = hmac(pass, u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

function autoverificar() {
  const pass = Buffer.from('prueba-de-paridad');
  const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const a = crypto.pbkdf2Sync(pass, salt, ITER, DKLEN, 'sha256').toString('hex');
  const b = pbkdf2ComoElWorkflow(pass, salt, ITER).toString('hex');
  if (a !== b) {
    console.error('FALLÓ la autoverificación: este generador y el workflow derivan distinto.');
    console.error('  crypto.pbkdf2Sync : ' + a);
    console.error('  algoritmo workflow: ' + b);
    process.exit(1);
  }
  return a;
}

function main() {
  const [usuario, dndole, ...roles] = process.argv.slice(2);
  if (!usuario) {
    console.error('uso: node generar-hash.js <usuario> [dndole] [rol...]');
    console.error('ej : node generar-hash.js aldo "Aldo Mendez" comercial:vendedor');
    process.exit(1);
  }
  autoverificar();

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl.question('Password para "' + usuario + '" (no se muestra en pantalla ni se guarda): ', (pw) => {
    rl.close();
    if (!pw) { console.error('Password vacío. Nada que generar.'); process.exit(1); }
    const salt = crypto.randomBytes(SALT_BYTES);
    const hash = crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), salt, ITER, DKLEN, 'sha256');
    const fila = {
      u: String(usuario).trim().toLowerCase(),
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
      roles: roles.length ? roles : ['comercial:vendedor'],
      dndole: dndole && dndole !== '-' ? dndole : null,
    };
    console.error('\n── Pega esto DENTRO del array de COMERCIAL_USERS en Railway ──');
    console.error('── No lo pegues en el repo, ni en un issue, ni en el chat. ──\n');
    console.log(JSON.stringify(fila));
  });
}

main();
