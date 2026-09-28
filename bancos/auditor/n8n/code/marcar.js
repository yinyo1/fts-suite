/* Deja en bancos.auditorias dónde quedó el informe y el status del correo (si hubo). base64 puro hacia SQL. */
const A = [[65, 26], [97, 26], [48, 10]].map(([a, n]) => Array.from({ length: n }, (_, i) => String.fromCharCode(a + i)).join('')).join('') + '+/';
const b64 = s => { const bytes = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
  o += A[a >> 2] + A[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? '=' : A[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : A[c & 63]); } return o; };
const reg = $('Postgres - Registrar').first().json;
const sub = $('HTTP - Subir informe (OneDrive)').first().json || {};
let st = null;
try { const m = $('HTTP - Correo ROJO a Esteban').first().json; st = m.statusCode || 202; } catch (e) { st = null; }
const d = { id: reg.auditoria_id, ruta: (sub.body && sub.body.webUrl) || null, subida: sub.statusCode || null, correo: st };
const SQL = __SQL__;
return [{ json: { ...d, sql: SQL.replace('__B64__', b64(JSON.stringify(d))) } }];
