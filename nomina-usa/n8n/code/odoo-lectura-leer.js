/* nomina-usa/odoo-lectura · Code - Leer Odoo (#448, MVP pasos 3 y 4)
 * SOLO LECTURA de Odoo: cargos del banco BUS COMPLETE CHK (account.bank.statement.line) para la
 * conciliación de Auris, y la cuenta analítica de cada SO (project.project.account_id) para el
 * asiento de costo. No escribe nada en Odoo.
 * TODO el cuerpo va en try/catch: este nodo cuelga del Set del secreto y si lanzara, n8n
 * publicaría su ENTRADA, que ES la credencial (CLAUDE.md §9). Devuelve un objeto NUEVO.
 * Si Odoo no contesta: ok:false, nunca una lista vacía (§20 #11).
 */
try {
  var s = $('Set - secreto').first().json;
  var URL = '' + (s.ourl || ''), DB = '' + (s.odb || ''), USER = '' + (s.ouser || ''), KEY = '' + (s.okey || '');
  if (KEY.length < 8) return [{ json: { ok: false, error: 'SIN_LLAVE_ODOO' } }];
  var par = $('Postgres - Parametros').first().json.p || {};
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
  var uid = lg.val;
  var J = Number(par.journal_id || 122), dias = Number(par.dias || 35);
  var desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  var bl = await rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, 'account.bank.statement.line', 'search_read',
    [[['journal_id', '=', J], ['date', '>=', desde], ['amount', '<', 0]]],
    { fields: ['id', 'date', 'payment_ref', 'amount', 'is_reconciled'], order: 'date asc', limit: 2000 }] });
  if (bl.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:account.bank.statement.line', detalle: bl.err } }];
  var cargos = (bl.val || []).map(function (x) {
    return { id: x.id, journal_id: J, fecha: x.date, ref: String(x.payment_ref || '').slice(0, 200), monto: x.amount, conciliado: !!x.is_reconciled };
  });
  var ids = (par.so_ids || []).map(Number).filter(function (n) { return n > 0; });
  var analiticas = [];
  if (ids.length) {
    var pj = await rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, 'project.project', 'search_read',
      [[['id', 'in', ids]]], { fields: ['id', 'name', 'account_id'], limit: 500 }] });
    if (pj.err) return [{ json: { ok: false, error: 'CONTRATO_ROTO:project.project', detalle: pj.err } }];
    analiticas = (pj.val || []).filter(function (p) { return Array.isArray(p.account_id) && p.account_id[0]; }).map(function (p) {
      return { so_id: p.id, analytic_id: p.account_id[0], nombre: String(p.name || '').split(' - ')[0] };
    });
  }
  return [{ json: { ok: true, payload: { cargos: cargos, analiticas: analiticas }, leidos: { cargos: cargos.length, analiticas: analiticas.length, desde: desde } } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_ODOO_LECTURA', detalle: String((e && e.message) || e).slice(0, 200) } }];
}
