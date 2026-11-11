#!/usr/bin/env node
// Corre el código generado como lo correría n8n ($input, $) con un secreto de PRUEBA (no el real).
'use strict';
const { execFileSync } = require('child_process'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? ' → ' + JSON.stringify(d) : '')); } };
const SECRETO = 'secreto-de-prueba-' + 'x'.repeat(40);
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt(p, s) { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), q = b64u(JSON.stringify(p));
  return h + '.' + q + '.' + b64u(crypto.createHmac('sha256', s || SECRETO).update(h + '.' + q).digest()); }
const ahora = Math.floor(Date.now() / 1000);
function correr(modo, body, secret) {
  const code = execFileSync('node', [path.join(__dirname, 'construir.js'), modo, 'chat-apply']).toString();
  const f = new Function('$input', '$', code);
  return f({ first: () => ({ json: { secret: secret === undefined ? SECRETO : secret } }) }, () => ({ first: () => ({ json: { body } }) }))[0].json;
}
const bueno = jwt({ sub: 'ricardo', scopes: ['pmo:write'], exp: ahora + 3600 });
const legado = { message: 'C1-15 a 50%', userId: '7', timestamp: new Date().toISOString(), signature: 'ab' };
console.log('▶ tolerante');
let r = correr('tolerante', legado); ok('sin token → camino legado con el body intacto', r._legado === true && r.body.signature === 'ab' && !('secret' in r));
r = correr('tolerante', { message: 'hola', token: bueno, history: [1, 2] });
ok('token válido → JWT, userId del TOKEN (no del body)', r._error === false && r._auth === 'jwt' && r.userId === 'ricardo' && r.message === 'hola', r);
r = correr('tolerante', { message: 'x', userId: 'esteban', token: bueno }); ok('el userId del body se ignora', r.userId === 'ricardo');
r = correr('tolerante', { message: 'x', token: jwt({ sub: 'r', scopes: ['pmo:write'], exp: ahora + 3600 }, 'otro-secreto-' + 'y'.repeat(40)) });
ok('firma de otro secreto → 401, NO cae al legado', r._error && r.http === 401 && r._legado === false, r);
r = correr('tolerante', { message: 'x', token: jwt({ sub: 'r', scopes: ['pmo:write'], exp: ahora - 5 }) }); ok('vencido → 401 TOKEN_EXPIRADO', r.http === 401 && r.code === 'TOKEN_EXPIRADO');
r = correr('tolerante', { message: 'x', token: jwt({ sub: 'r', scopes: ['comercial:read'], exp: ahora + 60 }) }); ok('sin scope pmo:write → 403', r.http === 403);
r = correr('tolerante', { message: 'x', token: 'basura' }); ok('token malformado → 401', r.http === 401);
r = correr('tolerante', { message: 'x', token: bueno }, ''); ok('sin SUITE_JWT_SECRET → 500 sin lanzar', r.http === 500 && r.code === 'SECRETO_NO_CONFIGURADO');
ok('ninguna salida trae el secreto', !JSON.stringify([correr('tolerante', legado), correr('tolerante', { message: 'x', token: bueno })]).includes(SECRETO));
console.log('▶ estricto');
r = correr('estricto', legado); ok('sin token → 401, el HMAC ya no entra', r._error && r.http === 401 && r._legado === false);
r = correr('estricto', { message: 'x', token: bueno }); ok('token válido → pasa', r._error === false && r.userId === 'ricardo');
console.log('\n' + pass + ' pasan, ' + fail + ' fallan'); process.exit(fail ? 1 : 0);
