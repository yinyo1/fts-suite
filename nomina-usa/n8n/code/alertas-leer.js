/* nomina-usa/alertas · Code - Leer Odoo y calcular (#448, fase C)
 * TODO el cuerpo va en try/catch: este nodo cuelga del Set del secreto y si lanzara, n8n
 * publicaría su ENTRADA, que ES la credencial (CLAUDE.md §9). Devuelve un objeto NUEVO.
 * Las reglas son las de shared/nomina-usa/alertas.js, embebidas: la MISMA función que prueba
 * tests/nomina-usa/fase-c.test.js. Si Odoo no contesta: ok:false, nunca una lista vacía (§20 #11).
 */
try {
  var module = { exports: {} };
  /*__ALERTAS__*/
  var A = module.exports;
  var s = $('Set - secreto').first().json;
  var URL = '' + (s.ourl || ''), DB = '' + (s.odb || ''), USER = '' + (s.ouser || ''), KEY = '' + (s.okey || '');
  if (KEY.length < 8) return [{ json: { ok: false, error: 'SIN_LLAVE_ODOO' } }];
  var par = $('Postgres - Parametros').first().json.p || {};
  var personas = (par.personas || []).filter(function (x) { return !x.excluido_hoy; });
  if (!personas.length) return [{ json: { ok: true, payload: { alertas: [], horas: [] }, leidos: 0 } }];
  var hh = null;
  try { if (typeof $helpers !== 'undefined' && $helpers && $helpers.httpRequest) hh = $helpers; } catch (e) {}
  if (!hh) { try { if (this && this.helpers && this.helpers.httpRequest) hh = this.helpers; } catch (e) {} }
  if (!hh) return [{ json: { ok: false, error: 'SIN_CLIENTE_HTTP' } }];
  var uid = 0;
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
  uid = lg.val;
  var ahora = new Date();
  var desde = new Date(ahora.getTime() - 40 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  var ids = personas.map(function (x) { return x.employee_id; });
  var att = await rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, 'hr.attendance', 'search_read',
    [[['employee_id', 'in', ids], '|', ['check_in', '>=', desde], ['check_out', '=', false]]],
    { fields: ['id', 'employee_id', 'check_in', 'check_out'], order: 'check_in asc', limit: 5000 }] });
  if (att.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.attendance', detalle: att.err } }];
  // Horas cerradas de los últimos 8 días (para la nómina USA: quién trabajó cuánto en cada SO).
  var desde8 = new Date(ahora.getTime() - 8 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  var cer = await rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, 'hr.attendance', 'search_read',
    [[['employee_id', 'in', ids], ['check_in', '>=', desde8], ['check_out', '!=', false]]],
    { fields: ['id', 'employee_id', 'check_in', 'check_out', 'worked_hours', 'x_studio_project_id'], order: 'check_in asc', limit: 5000 }] });
  if (cer.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.attendance(horas)', detalle: cer.err } }];
  var zonaDe = {}; personas.forEach(function (p) { zonaDe[p.employee_id] = p.zona; });
  var horas = (cer.val || []).map(function (a) {
    var e = Array.isArray(a.employee_id) ? a.employee_id[0] : a.employee_id, so = a.x_studio_project_id;
    return { attendance_id: a.id, employee_id: e, fecha: A.local(A.utc(a.check_in), zonaDe[e]).fecha,
      so_id: Array.isArray(so) ? so[0] : null, so_nombre: Array.isArray(so) ? so[1] : null,
      horas: Math.round((Number(a.worked_hours) || 0) * 100) / 100, check_in_utc: A.utc(a.check_in).toISOString(), check_out_utc: A.utc(a.check_out).toISOString() };
  });
  var porEmp = {};
  (att.val || []).forEach(function (a) { var e = Array.isArray(a.employee_id) ? a.employee_id[0] : a.employee_id; (porEmp[e] = porEmp[e] || []).push(a); });
  var alertas = [];
  personas.forEach(function (p) {
    var mias = porEmp[p.employee_id] || [];
    var hoy = A.local(ahora, p.zona).fecha;
    var entradasHoy = mias.filter(function (a) { return A.local(A.utc(a.check_in), p.zona).fecha === hoy; }).length;
    var e = A.entradaFaltante(p, entradasHoy, ahora, par.tolerancia_min, par.festivos);
    if (e.alerta) alertas.push({ clave: e.clave, tipo: 'entrada_faltante', employee_id: p.employee_id, fecha: e.fecha, attendance_id: null,
      detalle: { hora_ref: p.hora_ref, zona: p.zona, segundos_tarde: e.segundos_tarde, fuente: p.fuente } });
    mias.forEach(function (a) {
      A.salidaFaltante(a, ahora, par.salida_horas, p.zona).forEach(function (x) {
        alertas.push({ clave: x.clave, tipo: x.tipo, employee_id: p.employee_id, fecha: x.fecha, attendance_id: a.id,
          detalle: { check_in_utc: a.check_in, zona: p.zona } });
      });
    });
  });
  return [{ json: { ok: true, payload: { alertas: alertas, horas: horas }, leidos: (att.val || []).length } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_ALERTAS', detalle: String(e && e.message || e).slice(0, 200) } }];
}
