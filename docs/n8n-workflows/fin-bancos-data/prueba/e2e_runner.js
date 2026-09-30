/* ── fin/bancos-data-e2e (TMP) · la secuencia de la pantalla contra PRODUCCIÓN (#370) ─────────────
 * Manda a los endpoints publicados EXACTAMENTE los cuerpos que arma finanzas/data-bancos/ en cada
 * acción del usuario (cargar, buscar, droplist, ordenar, descargar). Las respuestas quedan en las
 * ejecuciones de los webhooks, de donde las toma el e2e del navegador. Aquí sólo se devuelve el resumen.
 * TODO en try/catch: este nodo recibe el secreto (§9, regla del 8-sep). */
async function correr(ctx) {
  const E = $input.first().json, SEC = '' + E.secret;
  const b64 = s => b64urlFromBytes(strBytes(s));
  const jwt = p => { const h = b64(JSON.stringify({ alg:'HS256', typ:'JWT' })), b = b64(JSON.stringify(p));
                     return h + '.' + b + '.' + b64urlFromBytes(hmacSha256(SEC, h + '.' + b)); };
  const TOK = jwt({ sub:'e2e-data-bancos', scopes:['bancos_data:read'], exp: Math.floor(Date.now() / 1000) + 600 });
  const H = (typeof $helpers !== 'undefined' && $helpers.httpRequest) ? $helpers.httpRequest.bind($helpers) : ctx.helpers.httpRequest.bind(ctx.helpers);
  const BASE = 'https://primary-production-5c3c.up.railway.app/webhook/';
  const PASOS = [{"paso": 1, "ruta": "fin/bancos-data", "cuerpo": {"cuentas": null, "desde": "2026-01-01", "dir": -1, "hasta": "2026-09-30", "offset": 0, "sort": "fecha", "texto": "", "tipo": ""}}, {"paso": 2, "ruta": "fin/bancos-data", "cuerpo": {"cuentas": null, "desde": "2026-01-01", "dir": -1, "hasta": "2026-09-30", "offset": 0, "sort": "fecha", "texto": "spei", "tipo": ""}}, {"paso": 3, "ruta": "fin/bancos-data", "cuerpo": {"cuentas": ["bbva-general-3326", "bbva-nomina-1293"], "desde": "2026-01-01", "dir": -1, "hasta": "2026-09-30", "offset": 0, "sort": "fecha", "texto": "spei", "tipo": ""}}, {"paso": 4, "ruta": "fin/bancos-data", "cuerpo": {"cuentas": ["bbva-general-3326"], "desde": "2026-01-01", "dir": -1, "hasta": "2026-09-30", "offset": 0, "sort": "fecha", "texto": "spei", "tipo": ""}}, {"paso": 5, "ruta": "fin/bancos-data", "cuerpo": {"cuentas": ["bbva-general-3326"], "desde": "2026-01-01", "dir": 1, "hasta": "2026-09-30", "offset": 0, "sort": "monto", "texto": "spei", "tipo": ""}}, {"paso": 6, "ruta": "fin/bancos-data-exportar", "cuerpo": {"cols": ["fecha", "monto", "mon", "desc", "banco", "cuenta", "ref"], "cuentas": ["bbva-general-3326"], "desde": "2026-01-01", "dir": 1, "formato": "csv", "hasta": "2026-09-30", "sort": "monto", "texto": "spei", "tipo": ""}}, {"paso": 7, "ruta": "fin/bancos-data-exportar", "cuerpo": {"cols": ["fecha", "monto", "mon", "desc", "banco", "cuenta", "ref"], "cuentas": ["bbva-general-3326"], "desde": "2026-01-01", "dir": 1, "formato": "filas", "hasta": "2026-09-30", "sort": "monto", "texto": "spei", "tipo": ""}}];
  const out = { cuando: new Date().toISOString(), pasos: [] };
  for (const p of PASOS) {
    const r = await H({ method:'POST', url: BASE + p.ruta, body: Object.assign({ token:TOK }, p.cuerpo), json:true, returnFullResponse:true, ignoreHttpStatusErrors:true, timeout:60000 });
    let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) {} }
    out.pasos.push({ paso:p.paso, status:r.statusCode, total: b && b.total, filas: b && b.filas ? b.filas.length : null, csv_bytes: b && b.csv ? b.csv.length : null,
                     por_moneda: b && b.por_moneda ? b.por_moneda.map(x => x.mon + ':' + x.n) : null });
  }
  out.directo = E.d;
  out.ok = out.pasos.every(p => p.status === 200);
  return out;
}
try { return [{ json: await correr(this) }]; }
catch (e) { return [{ json: { ok:false, error:'RUNNER_FALLO', detalle: String(e && e.message || e).slice(0, 200) } }]; }
