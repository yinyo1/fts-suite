// memoria/db-migrate · Code - Validar entrada (candado, fts-chats#8 · fts-suite#485, 11-nov-2026)
// Va DESPUÉS de «Set - secreto» ($env.SUITE_JWT_SECRET). Todo el cuerpo en try/catch y devuelve un
// objeto NUEVO: el secreto nunca viaja río abajo ni sale en un payload de error (CLAUDE.md §9).
// Candado:
//  1) token JWT HS256 firmado con el secreto de la suite, vigente, emitido hace menos de 10 min,
//     con el scope de administración SCOPE_REQUERIDO;
//  2) anti-replay: ts del cuerpo dentro de ±5 min y nonce de un solo uso (staticData, 30 min);
//     el cuerpo va firmado con HMAC(token) como en Chats (modo|ts|nonce|sha256(cuerpo canónico));
//  3) lista CERRADA de migraciones: el cuerpo solo elige `archivo`; el commit (`sha`) y la huella
//     (`sha256`) salen de PERMITIDAS, nunca del cuerpo. Nada de SQL en el cuerpo.
// Un rechazo NO lanza: devuelve { autorizado:false, error } y el workflow responde con eso.
const SCOPE_REQUERIDO = 'chats:admin';
const PERMITIDAS = [
  // Ya aplicada (2026-09-28): correrla da YA_APLICADA. Sirve de prueba positiva sin escribir nada.
  { archivo: 'memoria/memoria_0007_evidencia_avance_revision.sql', sha: '9f4ae9680a3717eb24ebbf93654622ec10202de1',
    sha256: 'ca0ad3ed12b9a2568ea6266dc412563e758218308f10f83b1ec8215bb0168e69' }
];
const VENTANA_MS = 5 * 60 * 1000, TOKEN_MAX_EDAD_S = 600, NONCE_VIDA_MS = 30 * 60 * 1000;

function sha256Bytes(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const ml = bytes.length * 8, p = bytes.slice();
  p.push(0x80); while (p.length % 64 !== 56) p.push(0);
  for (let i = 7; i >= 0; i--) p.push((ml / Math.pow(2, i * 8)) & 0xff);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < p.length; i += 64) {
    const w = new Array(64);
    for (let j = 0; j < 16; j++) w[j] = (p[i + j * 4] << 24) | (p[i + j * 4 + 1] << 16) | (p[i + j * 4 + 2] << 8) | p[i + j * 4 + 3];
    for (let j = 16; j < 64; j++) { const s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3); const s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) { const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0; const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
    H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
  }
  const out = []; for (const x of H) out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff); return out;
}
function strBytes(s) { const o = []; for (const ch of unescape(encodeURIComponent(s))) o.push(ch.charCodeAt(0)); return o; }
function hmac(k, m) { let key = strBytes(k); if (key.length > 64) key = sha256Bytes(key); while (key.length < 64) key.push(0);
  return sha256Bytes(key.map(b => b ^ 0x5c).concat(sha256Bytes(key.map(b => b ^ 0x36).concat(strBytes(m))))); }
const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64u(bytes) { let o = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
  o += A64[b0 >> 2] + A64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
  if (b1 !== undefined) { o += A64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)]; if (b2 !== undefined) o += A64[b2 & 63]; } } return o; }
function b64uTexto(s) { let bits = '', out = []; for (const ch of s) { const i = A64.indexOf(ch); if (i < 0) continue; bits += i.toString(2).padStart(6, '0'); }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return decodeURIComponent(escape(String.fromCharCode.apply(null, out))); }
function igual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function hex(bytes) { return bytes.map(x => (x < 16 ? '0' : '') + x.toString(16)).join(''); }
function canon(v) { if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; }

function validar(b, secreto, ahoraMs, vistos) {
  const no = (error) => ({ autorizado: false, error: error });
  if (String(secreto || '').length < 32) return no('SECRETO_NO_CONFIGURADO');
  if (!b || typeof b !== 'object' || Array.isArray(b)) return no('PEDIDO_INVALIDO');
  for (const k of ['sql', 'query', 'sha', 'sha256_esperado']) if (b[k] !== undefined) return no('CAMPO_NO_PERMITIDO');
  const tok = String(b.token || ''), p = tok.split('.');
  if (p.length !== 3) return no('NO_AUTORIZADO');
  let cab, pl;
  try { cab = JSON.parse(b64uTexto(p[0])); pl = JSON.parse(b64uTexto(p[1])); } catch (e) { return no('NO_AUTORIZADO'); }
  if (!cab || cab.alg !== 'HS256') return no('NO_AUTORIZADO');
  if (!igual(b64u(hmac(secreto, p[0] + '.' + p[1])), p[2])) return no('NO_AUTORIZADO');
  const ahora = Math.floor(ahoraMs / 1000);
  if (!pl.exp || pl.exp <= ahora) return no('TOKEN_VENCIDO');
  if (typeof pl.iat !== 'number' || pl.iat > ahora + 60 || ahora - pl.iat > TOKEN_MAX_EDAD_S) return no('TOKEN_NO_RECIENTE');
  if (!pl.sub || !Array.isArray(pl.scopes) || pl.scopes.indexOf(SCOPE_REQUERIDO) < 0) return no('SCOPE_INSUFICIENTE');
  const ts = Number(b.ts), nonce = String(b.nonce || '');
  if (!isFinite(ts) || Math.abs(ahoraMs - ts) > VENTANA_MS) return no('FUERA_DE_VENTANA');
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) return no('SIN_NONCE');
  const cuerpo = {}; Object.keys(b).forEach(k => { if (k !== 'token' && k !== 'firma') cuerpo[k] = b[k]; });
  const firma = b64u(hmac(tok, ['migrar', ts, nonce, hex(sha256Bytes(strBytes(canon(cuerpo))))].join(String.fromCharCode(10))));
  if (!igual(firma, String(b.firma || ''))) return no('FIRMA_INVALIDA');
  for (const k of Object.keys(vistos)) if (vistos[k] < ahoraMs - NONCE_VIDA_MS) delete vistos[k];
  if (vistos[nonce]) return no('REPLAY');
  const m = PERMITIDAS.filter(x => x.archivo === String(b.archivo || ''))[0];
  if (!m) return no('MIGRACION_NO_PERMITIDA');
  vistos[nonce] = ahoraMs;
  const mm = m.archivo.match(/^memoria[/](memoria)_([0-9]{4})_[a-z0-9_]+[.]sql$/);
  return { autorizado: true, actor: String(pl.sub), archivo: m.archivo, sha: m.sha, sha256_esperado: m.sha256,
    modulo: mm[1], numero: parseInt(mm[2], 10), version: mm[1] + '_' + mm[2], dry_run: b.dry_run !== false };
}

if (typeof $input === 'undefined') { module.exports = { validar, PERMITIDAS, SCOPE_REQUERIDO, canon, hex, sha256Bytes, strBytes }; }
else {
  try {
    const b = ($('Entrada (solo manual)').first().json || {}).body || {};
    const secreto = '' + ($('Set - secreto').first().json.secret || '');
    let vistos = {};
    try { const sd = $getWorkflowStaticData('global'); sd.nonces = sd.nonces || {}; vistos = sd.nonces; } catch (e) { vistos = {}; }
    return [{ json: validar(b, secreto, Date.now(), vistos) }];
  } catch (e) { return [{ json: { autorizado: false, error: 'FALLO_VALIDAR' } }]; }
}
