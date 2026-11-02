/* nomina-usa/costo-odoo · Code - Crear borrador en Odoo (#448, MVP paso 3)
 * Solo llega aquí si nomina_usa.costo_pendientes() dice activo=true (costo_odoo_activo, clic de
 * Esteban) y hay asientos SIN faltantes. Crea el account.move en BORRADOR: nunca lo publica
 * (no hay ninguna llamada de publicar en este nodo). Idempotente por ref: si ya existe un movimiento con «NUSA-SOL-<id> », lo reusa.
 * Lee de vuelta el estado y exige 'draft'.
 * TODO el cuerpo va en try/catch (cuelga del Set del secreto, CLAUDE.md §9). Devuelve un objeto NUEVO.
 */
try {
  var s = $('Set - secreto').first().json;
  var URL = '' + (s.ourl || ''), DB = '' + (s.odb || ''), USER = '' + (s.ouser || ''), KEY = '' + (s.okey || '');
  if (KEY.length < 8) return [{ json: { ok: false, error: 'SIN_LLAVE_ODOO', resultados: [] } }];
  var p = $('Postgres - Pendientes').first().json.p || {};
  if (p.activo !== true) return [{ json: { ok: true, resultados: [], nota: 'APAGADO' } }];
  var hh = null;
  try { if (typeof $helpers !== 'undefined' && $helpers && $helpers.httpRequest) hh = $helpers; } catch (e) {}
  if (!hh) { try { if (this && this.helpers && this.helpers.httpRequest) hh = this.helpers; } catch (e) {} }
  if (!hh) return [{ json: { ok: false, error: 'SIN_CLIENTE_HTTP', resultados: [] } }];
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
  if (lg.err || !lg.val) return [{ json: { ok: false, error: 'LOGIN_ODOO', resultados: [] } }];
  var uid = lg.val, out = [];
  function kw(model, method, args, opts) { return rpc({ service: 'object', method: 'execute_kw', args: [DB, uid, KEY, model, method, args, opts || {}] }); }
  var cents = function (n) { return Math.round(Number(n || 0) * 100); };
  for (var i = 0; i < (p.asientos || []).length; i++) {
    var a = p.asientos[i], m = a.payload || {}, L = m.lineas || [];
    var deb = L.reduce(function (t, l) { return t + cents(l.debit); }, 0), cre = L.reduce(function (t, l) { return t + cents(l.credit); }, 0);
    if (!m.journal_id || !m.company_id || L.some(function (l) { return !l.account_id; })) { out.push({ id: a.id, ok: false, error: 'PAYLOAD_INCOMPLETO' }); continue; }
    if (deb !== cre || deb === 0) { out.push({ id: a.id, ok: false, error: 'NO_CUADRA ' + deb + ' vs ' + cre }); continue; }
    var pref = 'NUSA-SOL-' + a.solicitud_id + ' ';
    var ya = await kw('account.move', 'search_read', [[['ref', '=like', pref + '%'], ['company_id', '=', m.company_id]]], { fields: ['id', 'state'], limit: 2 });
    if (ya.err) { out.push({ id: a.id, ok: false, error: 'BUSCAR: ' + ya.err }); continue; }
    var mid = ya.val && ya.val.length ? ya.val[0].id : null;
    if (!mid) {
      var vals = { move_type: 'entry', journal_id: m.journal_id, company_id: m.company_id, date: m.date, ref: m.ref,
        line_ids: L.map(function (l) { var v = { name: l.name, account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0) };
          if (l.analytic_distribution) v.analytic_distribution = l.analytic_distribution; return [0, 0, v]; }) };
      var cr = await kw('account.move', 'create', [vals], { context: { allowed_company_ids: [m.company_id] } });
      if (cr.err) { out.push({ id: a.id, ok: false, error: 'CREAR: ' + cr.err }); continue; }
      mid = Array.isArray(cr.val) ? cr.val[0] : cr.val;
    }
    var rb = await kw('account.move', 'read', [[mid]], { fields: ['id', 'state', 'ref'] });
    var st = rb.val && rb.val[0] && rb.val[0].state;
    if (st !== 'draft') { out.push({ id: a.id, ok: false, error: 'ESTADO_' + String(st || 'ILEGIBLE') + ' move ' + mid }); continue; }
    out.push({ id: a.id, ok: true, move_id: mid, reusado: !!(ya.val && ya.val.length) });
  }
  return [{ json: { ok: true, resultados: out } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_COSTO_ODOO', detalle: String((e && e.message) || e).slice(0, 200), resultados: [] } }];
}
