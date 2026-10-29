// Cuerpo del nodo «Code - Leer adjuntos» del runner TMP de n8n (fts-suite#440).
// Se pega tal cual en un workflow INACTIVO: Manual Trigger → Set «Set - secretos»
// (okey = {{ $env.ODOO_RPC_KEY }}, ouser = {{ $env.ODOO_USER }}) → este Code.
// Se ejecuta por MCP en modo manual, se lee SOLO la salida de este nodo (nunca la
// del Set) y se archiva al terminar. Corrió así la prueba: ejecuciones 923791 y 923861.
//
// Lee metadatos de cada adjunto y, SOLO si le falta, genera su access_token
// (ir.attachment.generate_access_token). Es la única escritura: llena el campo
// del token, no toca el archivo. Nunca devuelve datas.
// try/catch total: la entrada es un Set que materializa secretos (CLAUDE.md §9).
try {
  const sec = $('Set - secretos').first().json;
  const BASE = 'https://serviciosfts.odoo.com';
  const DB = 'serviciosfts';
  const GENERAR_TOKEN = true;
  const TARGETS = [
    { move_id: 58356, attachment_id: 104121 }, // INV171 Corporate USA
    { move_id: 58491, attachment_id: 104238 }, // INV172 GRUMA Mission Foods
    { move_id: 60838, attachment_id: 104521 }, // INV174 Calbee America
    { move_id: 61472, attachment_id: 104791 }, // INV175 Calbee America
    { move_id: 62723, attachment_id: 105258 }, // INV177 Mission Foods
    { move_id: 62843, attachment_id: 105409 }, // INV178 GRUMA Mission Foods
    { move_id: 62856, attachment_id: 105419 }  // INV179 Mission Foods
  ];
  const H = (typeof $helpers !== 'undefined' && $helpers && $helpers.httpRequest)
    ? $helpers.httpRequest.bind($helpers) : this.helpers.httpRequest.bind(this.helpers);
  async function rpc(params) {
    const r = await H({ method: 'POST', url: BASE + '/jsonrpc', json: true, timeout: 60000,
      returnFullResponse: true, ignoreHttpStatusErrors: true,
      body: { jsonrpc: '2.0', method: 'call', params: params } });
    return r.body;
  }
  const auth = await rpc({ service: 'common', method: 'authenticate', args: [DB, '' + sec.ouser, '' + sec.okey, {}] });
  const uid = auth && auth.result;
  if (!uid) return [{ json: { ok: false, error: 'ODOO_SIN_SESION' } }];
  async function call(model, method, args) {
    const r = await rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, '' + sec.okey, model, method, args] });
    if (r && r.error) return { error: ('' + ((r.error.data && r.error.data.message) || r.error.message)).slice(0, 200) };
    return { result: r && r.result };
  }
  const F = ['name', 'mimetype', 'file_size', 'res_model', 'res_id', 'checksum', 'access_token', 'create_date'];
  const out = [];
  for (const t of TARGETS) {
    const a = await call('ir.attachment', 'read', [[t.attachment_id], F]);
    let adj = a.error ? { error: a.error } : ((a.result || [])[0] || null);
    let gen = null;
    // Candado: sólo se genera token si el adjunto es de ESA factura.
    if (GENERAR_TOKEN && adj && !adj.error && !adj.access_token && adj.res_model === 'account.move' && adj.res_id === t.move_id) {
      gen = await call('ir.attachment', 'generate_access_token', [[t.attachment_id]]);
      const a2 = await call('ir.attachment', 'read', [[t.attachment_id], F]);
      adj = a2.error ? { error: a2.error } : ((a2.result || [])[0] || null);
    }
    out.push({ move_id: t.move_id, attachment_id: t.attachment_id, adjunto: adj,
      token_generado: gen ? (gen.error ? { error: gen.error } : true) : false });
  }
  return [{ json: { ok: true, uid: uid, resultados: out } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO', detalle: ('' + (e && e.message)).slice(0, 200) } }];
}
