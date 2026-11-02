/* nomina-usa/evidencia · Code - Leer Odoo y calcular (#448, paso 6)
 * TODO el cuerpo va en try/catch: este nodo cuelga del Set del secreto y si lanzara, n8n
 * publicaría su ENTRADA, que ES la credencial (CLAUDE.md §9). Devuelve un objeto NUEVO.
 * Solo LEE Odoo: hr.attendance (con ubicación de entrada) y account.bank.statement.line de
 * la tarjeta de cada persona. La regla es shared/nomina-usa/evidencia.js, embebida: la MISMA
 * función que prueba tests/nomina-usa/fase-g.test.js. Si Odoo no contesta: ok:false.
 */
try {
  var module = { exports: {} };
  /*__EVIDENCIA__*/
  var E = module.exports;
  var s = $('Set - secreto').first().json;
  var URL = '' + (s.ourl || ''), DB = '' + (s.odb || ''), USER = '' + (s.ouser || ''), KEY = '' + (s.okey || '');
  if (KEY.length < 8) return [{ json: { ok: false, error: 'SIN_LLAVE_ODOO' } }];
  var par = $('Postgres - Parametros').first().json.p || {};
  if (par.activa !== true) return [{ json: { ok: true, payload: { dias: [] }, apagado: true } }];
  var personas = par.personas || [];
  if (!personas.length) return [{ json: { ok: true, payload: { dias: [] }, leidos: 0 } }];
  var hh = null;
  try { if (typeof $helpers !== 'undefined' && $helpers && $helpers.httpRequest) hh = $helpers; } catch (e) {}
  if (!hh) { try { if (this && this.helpers && this.helpers.httpRequest) hh = this.helpers; } catch (e) {} }
  if (!hh) return [{ json: { ok: false, error: 'SIN_CLIENTE_HTTP' } }];
  async function rpc(params) {
    var r = await hh.httpRequest({ method: 'POST', url: URL + '/jsonrpc', json: true,
      body: { jsonrpc: '2.0', method: 'call', params: params }, returnFullResponse: true, ignoreHttpStatusErrors: true });
    var x = r.body || {};
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = {}; } }
    if (x.error) return { err: String((x.error.data && x.error.data.message) || x.error.message || 'RPC').slice(0, 200) };
    if (r.statusCode && r.statusCode >= 400) return { err: 'HTTP_' + r.statusCode };
    return { val: x.result };
  }
  var lg = await rpc({ service: 'common', method: 'login', args: [DB, USER, KEY] });
  if (lg.err || !lg.val) return [{ json: { ok: false, error: 'LOGIN_ODOO', detalle: lg.err || null } }];
  var uid = lg.val, ahora = new Date();
  function kw(model, dom, fields, extra) {
    return rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, model, 'search_read', [dom], Object.assign({ fields: fields, limit: 5000 }, extra || {})] });
  }
  var FA = ['id', 'employee_id', 'check_in', 'check_out', 'x_studio_project_id', 'in_latitude', 'in_longitude'];
  var desde2 = new Date(ahora.getTime() - 2 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  var desde30 = new Date(ahora.getTime() - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  var dias = [], tarjetas = par.tarjetas || {};
  for (var i = 0; i < personas.length; i++) {
    var p = personas[i];
    var mias = await kw('hr.attendance', [['employee_id', '=', p.employee_id], ['check_in', '>=', desde2]], FA, { order: 'check_in asc' });
    if (mias.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.attendance', detalle: mias.err } }];
    var sos = [];
    (mias.val || []).forEach(function (a) { var so = Array.isArray(a.x_studio_project_id) ? a.x_studio_project_id[0] : null; if (so && sos.indexOf(so) < 0) sos.push(so); });
    var cuad = { val: [] };
    if (sos.length) {
      cuad = await kw('hr.attendance', [['x_studio_project_id', 'in', sos], ['employee_id', '!=', p.employee_id], ['check_in', '>=', desde30]], FA);
      if (cuad.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.attendance(cuadrilla)', detalle: cuad.err } }];
    }
    var diarios = Object.keys(tarjetas).filter(function (j) { return Number(tarjetas[j]) === Number(p.employee_id); }).map(Number);
    var compras = { val: [] };
    if (diarios.length) {
      compras = await kw('account.bank.statement.line', [['journal_id', 'in', diarios], ['date', '>=', desde2.slice(0, 10)]], ['date', 'amount', 'payment_ref']);
      if (compras.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:account.bank.statement.line', detalle: compras.err } }];
    }
    E.evaluarPersona(mias.val || [], cuad.val || [], compras.val || [], { zona: p.zona, ahora: ahora, radio_m: par.radio_m, min_puntos: par.min_puntos,
      tope_horas: par.tope_horas, proveedores: par.proveedores }).forEach(function (d) {
      dias.push(Object.assign({ employee_id: p.employee_id }, d));
    });
  }
  return [{ json: { ok: true, payload: { dias: dias }, leidos: dias.length } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_EVIDENCIA', detalle: String(e && e.message || e).slice(0, 200) } }];
}
