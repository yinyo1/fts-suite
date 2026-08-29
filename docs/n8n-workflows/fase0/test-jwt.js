// Suite de pruebas de jwt-verify.js contra el crypto nativo de Node.
const crypto = require('crypto');
const m = require('./jwt-verify.js');
const hex = b => b.map(x => x.toString(16).padStart(2, '0')).join('');
let fails = 0;
for (const c of ['', 'abc', 'The quick brown fox jumps over the lazy dog', 'ñáéí über 🚀', 'x'.repeat(1000)]) {
  if (hex(m.sha256Bytes(m.strBytes(c))) !== crypto.createHash('sha256').update(c, 'utf8').digest('hex')) { console.log('SHA256 FALLA'); fails++; }
}
for (const [k, msg] of [['key', 'The quick brown fox jumps over the lazy dog'], ['', ''], ['k'.repeat(100), 'msg largo '.repeat(50)], ['sécret-ñ', 'payload con acentos áé']]) {
  if (hex(m.hmacSha256(k, msg)) !== crypto.createHmac('sha256', k).update(msg, 'utf8').digest('hex')) { console.log('HMAC FALLA'); fails++; }
}
const SEC = 'secreto-de-prueba-no-real';
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const mint = p => { const h = b64u({ alg: 'HS256', typ: 'JWT' }), pp = b64u(p); return h + '.' + pp + '.' + crypto.createHmac('sha256', SEC).update(h + '.' + pp).digest('base64url'); };
const now = Math.floor(Date.now() / 1000);
const t1 = mint({ sub: 'ana.acevedo', scopes: ['nomina:write'], exp: now + 3600 });
const t4 = mint({ sub: 'legacy', exp: now + 3600 });
const T = [
  ['valido', m.verifyJWT(t1, SEC, 'nomina:write'), r => r.ok && r.actor === 'ana.acevedo'],
  ['expirado', m.verifyJWT(mint({ sub: 'a', scopes: ['nomina:write'], exp: now - 10 }), SEC, 'nomina:write'), r => r.error === 'TOKEN_EXPIRADO'],
  ['scope insuficiente', m.verifyJWT(mint({ sub: 'x', scopes: ['finanzas:read'], exp: now + 3600 }), SEC, 'nomina:write'), r => r.error === 'SCOPE_INSUFICIENTE'],
  ['secreto equivocado', m.verifyJWT(t1, 'otro', 'nomina:write'), r => r.error === 'FIRMA_INVALIDA'],
  ['payload manipulado', m.verifyJWT(t1.split('.')[0] + '.' + b64u({ sub: 'hacker', scopes: ['nomina:write'], exp: now + 3600 }) + '.' + t1.split('.')[2], SEC, 'nomina:write'), r => r.error === 'FIRMA_INVALIDA'],
  ['malformado', m.verifyJWT('abc', SEC, 'nomina:write'), r => r.error === 'TOKEN_MALFORMADO'],
  ['ausente', m.verifyJWT(undefined, SEC, 'nomina:write'), r => r.error === 'TOKEN_AUSENTE'],
  ['legacy hereda finanzas', m.verifyJWT(t4, SEC, 'finanzas:read'), r => r.ok],
  ['legacy NO alcanza nomina', m.verifyJWT(t4, SEC, 'nomina:write'), r => r.error === 'SCOPE_INSUFICIENTE'],
];
for (const [n, r, p] of T) { const ok = p(r); if (!ok) fails++; console.log((ok ? '  OK   ' : '  FALLA') + '  ' + n); }
console.log(fails === 0 ? '\n*** 9/9 en verde ***' : '\n*** ' + fails + ' FALLAS ***');
process.exit(fails ? 1 : 0);
