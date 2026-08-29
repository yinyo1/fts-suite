#!/usr/bin/env node
/**
 * generate-suite-hash.js — GENERA {salt, hash} PARA UN USUARIO DE LA SUITE
 *
 * SE CORRE EN LA LAPTOP DE ESTEBAN. Nunca en un servidor, nunca en un chat.
 * La contraseña en claro no se imprime, no se guarda y no viaja a ningún lado:
 * lo único que sale por pantalla es {salt, hash, scopes}, que es lo que se pega
 * en la Data Table `suite_usuarios` de n8n.
 *
 * Este archivo vive en scripts/local-ejemplo/ (versionado) como PLANTILLA —
 * no contiene ningún secreto. Misma receta que auth/finanzas-login (CLAUDE.md §15).
 *
 *   node generate-suite-hash.js ana.acevedo "nomina:write,rh:read"
 */
const crypto = require('crypto');
const readline = require('readline');

const ITER = 100000, KEYLEN = 32, DIGEST = 'sha256';
const SCOPES_VALIDOS = ['nomina:write', 'nomina:read', 'rh:write', 'rh:read', 'finanzas:read', 'finanzas:write'];

const username = process.argv[2];
const scopesArg = process.argv[3];

if (!username || !scopesArg) {
  console.error('uso: node generate-suite-hash.js <username> "<scope1,scope2>"');
  console.error('scopes válidos: ' + SCOPES_VALIDOS.join(' · '));
  process.exit(1);
}

const scopes = scopesArg.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const malos = scopes.filter(function (s) { return SCOPES_VALIDOS.indexOf(s) < 0; });
if (malos.length) {
  console.error('scope no reconocido: ' + malos.join(', '));
  console.error('válidos: ' + SCOPES_VALIDOS.join(' · '));
  process.exit(1);
}

// Lectura sin eco: se apaga el modo raw del TTY mientras se teclea.
function preguntarSinEco(prompt) {
  return new Promise(function (resolve) {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const eraRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    function onData(ch) {
      if (ch === '\n' || ch === '\r' || ch === '') {
        if (stdin.isTTY) stdin.setRawMode(eraRaw);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '') {
        process.stdout.write('\n');
        process.exit(1);
      } else if (ch === '' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    }
    stdin.on('data', onData);
  });
}

(async function () {
  const p1 = await preguntarSinEco('Contraseña para ' + username + ': ');
  if (p1.length < 12) {
    console.error('Mínimo 12 caracteres. Nada generado.');
    process.exit(1);
  }
  const p2 = await preguntarSinEco('Repítela: ');
  if (p1 !== p2) {
    console.error('No coinciden. Nada generado.');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(p1, salt, ITER, KEYLEN, DIGEST).toString('hex');

  console.log('');
  console.log('── Pegar esto en la Data Table suite_usuarios ──');
  console.log('');
  console.log(JSON.stringify({ username: username, salt: salt, hash: hash, scopes: scopes.join(','), activo: true }, null, 2));
  console.log('');
  console.log('PBKDF2-' + DIGEST.toUpperCase() + ' · ' + ITER + ' iteraciones · salt de 16 bytes, único por usuario.');
  console.log('La contraseña NO se guardó en ningún lado. Si se pierde, se regenera; no se recupera.');
  console.log('');
})();
