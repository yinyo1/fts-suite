// node docs/n8n-workflows/memoria-db-migrate/prueba.js — candado de memoria/db-migrate con un secreto de PRUEBA.
const crypto = require('crypto'); const V = require('./validar.js');
const S = 'x'.repeat(40) + 'secreto-de-prueba';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function tok(sub, scopes, o) { o = o || {}; const now = Math.floor(Date.now() / 1000);
  const si = b64({ alg: o.alg || 'HS256', typ: 'JWT' }) + '.' + b64({ sub, scopes, iat: o.iat !== undefined ? o.iat : now, exp: o.exp !== undefined ? o.exp : now + 120 });
  return si + '.' + crypto.createHmac('sha256', o.secreto || S).update(si).digest('base64url'); }
function cuerpo(t, extra, o) { o = o || {}; const c = Object.assign({ archivo: V.PERMITIDAS[0].archivo, ts: Date.now(), nonce: crypto.randomBytes(16).toString('base64url') }, extra || {});
  const sha = crypto.createHash('sha256').update(V.canon(c)).digest('hex');
  c.firma = o.firmaMala ? 'x' : crypto.createHmac('sha256', t).update(['migrar', c.ts, c.nonce, sha].join('\n')).digest('base64url'); c.token = t; return c; }
let ok = 0, mal = 0; const chk = (n, r, err) => { const bien = err === true ? r.autorizado === true : r.error === err; if (bien) ok++; else mal++; console.log((bien ? '  ✓ ' : '  ✗ ') + n + ' → ' + (r.autorizado ? 'autorizado ' + r.version + ' dry_run=' + r.dry_run : r.error)); };
const ADM = ['chats:admin'], T = () => tok('zz.admin', ADM);
let vistos = {};
chk('sin token', V.validar({ archivo: 'x' }, S, Date.now(), vistos), 'NO_AUTORIZADO');
chk('firmado con otro secreto', V.validar(cuerpo(tok('zz.admin', ADM, { secreto: 'y'.repeat(50) })), S, Date.now(), vistos), 'NO_AUTORIZADO');
chk('alg none', V.validar(cuerpo(tok('zz.admin', ADM, { alg: 'none' })), S, Date.now(), vistos), 'NO_AUTORIZADO');
chk('token vencido', V.validar(cuerpo(tok('zz.admin', ADM, { exp: Math.floor(Date.now() / 1000) - 5 })), S, Date.now(), vistos), 'TOKEN_VENCIDO');
chk('token viejo (iat 20 min)', V.validar(cuerpo(tok('zz.admin', ADM, { iat: Math.floor(Date.now() / 1000) - 1200, exp: Math.floor(Date.now() / 1000) + 600 })), S, Date.now(), vistos), 'TOKEN_NO_RECIENTE');
chk('sin scope de administración', V.validar(cuerpo(tok('zz.rh', ['usuarios:alta_codigo', 'comercial:admin'])), S, Date.now(), vistos), 'SCOPE_INSUFICIENTE');
chk('ts fuera de ventana', V.validar(cuerpo(T(), { ts: Date.now() - 10 * 60 * 1000 }), S, Date.now(), vistos), 'FUERA_DE_VENTANA');
chk('sin nonce', (() => { const t = T(); const c = cuerpo(t); c.nonce = 'corto'; return V.validar(c, S, Date.now(), vistos); })(), 'SIN_NONCE');
chk('firma del cuerpo mala', V.validar(cuerpo(T(), {}, { firmaMala: true }), S, Date.now(), vistos), 'FIRMA_INVALIDA');
chk('cuerpo alterado después de firmar (otro archivo)', (() => { const c = cuerpo(T()); c.archivo = 'memoria/memoria_0008_x.sql'; return V.validar(c, S, Date.now(), vistos); })(), 'FIRMA_INVALIDA');
chk('trae sql en el cuerpo', V.validar(cuerpo(T(), { sql: 'DROP TABLE x' }), S, Date.now(), vistos), 'CAMPO_NO_PERMITIDO');
chk('trae sha en el cuerpo', V.validar(cuerpo(T(), { sha: 'a'.repeat(40) }), S, Date.now(), vistos), 'CAMPO_NO_PERMITIDO');
chk('trae sha256_esperado', V.validar(cuerpo(T(), { sha256_esperado: 'b'.repeat(64) }), S, Date.now(), vistos), 'CAMPO_NO_PERMITIDO');
chk('migración fuera de la lista', V.validar(cuerpo(T(), { archivo: 'memoria/memoria_0008_otra.sql' }), S, Date.now(), vistos), 'MIGRACION_NO_PERMITIDA');
const buena = cuerpo(T());
const r = V.validar(buena, S, Date.now(), vistos);
chk('de la lista, firmado, fresco → autorizado (dry_run por omisión)', r, true);
console.log('    sha y sha256 salen de la lista:', r.sha === V.PERMITIDAS[0].sha && r.sha256_esperado === V.PERMITIDAS[0].sha256);
chk('la misma petición otra vez', V.validar(buena, S, Date.now(), vistos), 'REPLAY');
chk('secreto vacío', V.validar(cuerpo(T()), '', Date.now(), {}), 'SECRETO_NO_CONFIGURADO');
console.log((mal ? '✗ ' : '✓ ') + ok + '/' + (ok + mal)); process.exit(mal ? 1 : 0);
