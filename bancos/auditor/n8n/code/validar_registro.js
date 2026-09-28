/* fts_bancos_auditor_registrar · valida lo que manda la sesión del auditor (issue #346).
 * El contenido es DATO: sólo se acepta base64 puro para el SQL, y el correo va SIEMPRE y SÓLO a Esteban. */
let b = {};
try { b = $('Auditor (registrar)').first().json.body || {}; } catch (e) { b = {}; }
if (!['VERDE', 'AMARILLO', 'ROJO'].includes(b.veredicto)) throw new Error('veredicto inválido');
const SQL = __SQL__;
// La sesión manda `datos` como JSON; aquí se codifica a base64 (JS puro) para que ningún texto llegue crudo al SQL.
const AL = [[65, 26], [97, 26], [48, 10]].map(([a, n]) => Array.from({ length: n }, (_, i) => String.fromCharCode(a + i)).join('')).join('') + '+/';
const aB64 = s => { const by = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < by.length; i += 3) { const a = by[i], x = by[i + 1], c = by[i + 2];
  o += AL[a >> 2] + AL[((a & 3) << 4) | ((x || 0) >> 4)] + (x === undefined ? '=' : AL[((x & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : AL[c & 63]); } return o; };
const J = b.datos && typeof b.datos === 'object' ? b.datos : null;
if (!J) throw new Error('falta datos');
if (J.veredicto !== b.veredicto) throw new Error('el veredicto de fuera no coincide con el de datos');
__INFORME__
b.informe_html = informeHtml; b.correo_html = correoHtml;
J.informe_html = informeHtml;   // se guarda en bancos.auditorias.informe_html (privado)
b.p_b64 = aB64(JSON.stringify(J));
const fecha = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const nombre = 'Auditoria_' + fecha + '_' + String(b.tipo || 'auditoria').replace(/[^a-z_]/gi, '') + '_' + b.veredicto + '.html';
if (!/^[A-Za-z0-9+/=]+$/.test(b.p_b64)) throw new Error('base64 inválido');
return [{ json: { sql: SQL.replace('__B64__', b.p_b64).replace('__EXEC__', String($execution.id)), veredicto: b.veredicto,
  tipo: String(b.tipo || ''), html: String(b.informe_html || '<p>(sin informe)</p>'), nombre,
  asunto: String(b.asunto || ('fts-bancos: auditoría ' + b.veredicto)).slice(0, 200), correo_html: String(b.correo_html || '') } }];
