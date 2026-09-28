/* retardos/detectar · Code - Leer Odoo (#334)
 * TODO el cuerpo va en try/catch: este nodo cuelga del Set del secreto y si lanzara,
 * n8n publicaría su ENTRADA, que ES la credencial (CLAUDE.md §9). Devuelve un objeto
 * NUEVO: el secreto no viaja río abajo. Sin diagonales invertidas (§17 quirk 2c).
 * El contrato con Odoo (retardos/lib/normalizar.js) va embebido abajo: si Odoo deja
 * de mandar un campo, esto sale con ok:false y CONTRATO_ROTO, nunca con una lista vacía.
 */
try {
  var module = { exports: {} };
  /*__NORMALIZAR__*/
  var N = module.exports;
  var s = $('Set - secreto').first().json;
  var URL = '' + (s.ourl || ''), DB = '' + (s.odb || ''), USER = '' + (s.ouser || ''), KEY = '' + (s.okey || '');
  if (KEY.length < 8) return [{ json: { ok: false, error: 'SIN_LLAVE_ODOO' } }];
  var cfg = $('Postgres - Config').first().json || {};
  var empresas = cfg.empresas || [1];
  var dias = 7, wfNombre = 'retardos/detectar';
  try { if ($('Manual (pasada 92 dias)').isExecuted) dias = 92; } catch (e) { dias = 7; }
  // retardos/jornada reusa este mismo lector con su propia ventana y su propio nombre de corrida
  // (así su lectura no se confunde con la de detectar en el latido).
  try { var vv = $('Set - Ventana').first().json; if (vv && vv.dias) { dias = Number(vv.dias); wfNombre = String(vv.workflow || wfNombre); } } catch (e) {}
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
  function kw(model, metodo, args, kwargs) { return rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, model, metodo, args, kwargs || {}] }); }
  var lg = await rpc({ service: 'common', method: 'login', args: [DB, USER, KEY] });
  if (lg.err || !lg.val) return [{ json: { ok: false, error: 'LOGIN_ODOO', detalle: lg.err || null } }];
  uid = lg.val;

  var hoy = new Date(Date.now() - 6 * 3600 * 1000);
  var hasta = hoy.toISOString().slice(0, 10);
  var desdeD = new Date(hoy.getTime() - dias * 86400000);
  var desde = desdeD.toISOString().slice(0, 10);
  var desdeUTC = desde + ' 06:00:00';

  var att = await kw('hr.attendance', 'search_read', [[['check_in', '>=', desdeUTC], ['employee_id.company_id', 'in', empresas]]],
    { fields: N.CAMPOS['hr.attendance'], order: 'check_in asc', limit: 20000, context: { active_test: false } });
  if (att.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.attendance', detalle: att.err } }];
  var emp = await kw('hr.employee', 'search_read', [[['company_id', 'in', empresas], ['active', 'in', [true, false]]]],
    { fields: N.CAMPOS['hr.employee'], limit: 2000 });
  if (emp.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:hr.employee', detalle: emp.err } }];
  // Los renglones de los calendarios que de verdad usan las personas (aunque el calendario sea de otra empresa).
  var calIds = [];
  (emp.val || []).forEach(function (e) { var c = N.m2oId(e.resource_calendar_id); if (c != null && calIds.indexOf(c) < 0) calIds.push(c); });
  var cal = await kw('resource.calendar.attendance', 'search_read', [[['calendar_id', 'in', calIds]]],
    { fields: N.CAMPOS['resource.calendar.attendance'], limit: 2000 });
  if (cal.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:resource.calendar.attendance', detalle: cal.err } }];

  // Olvidos de entrada: el almacén de incidencias vive en el repo (lectura pública).
  var incid = null;
  try {
    var ri = await hh.httpRequest({ method: 'GET', url: 'https://raw.githubusercontent.com/yinyo1/fts-suite/main/shared/incidencias-asistencia.json', json: true });
    incid = (typeof ri === 'string') ? JSON.parse(ri) : ri;
  } catch (e) { incid = null; }

  var p;
  try {
    p = N.normalizar({ att: att.val || [], emp: emp.val || [], cal: cal.val || [], incidencias: incid, desde: desde, hasta: hasta, workflow: wfNombre });
  } catch (e) {
    return [{ json: { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) } }];
  }
  return [{ json: { ok: true, dias: dias, leidos: p.checadas.length, empleados: p.empleados.length, incidencias_ok: incid !== null, payload: p } }];
} catch (err) {
  var d = String(err && err.message ? err.message : err).slice(0, 200);
  return [{ json: { ok: false, error: 'FALLO_LECTURA', detalle: d } }];
}
