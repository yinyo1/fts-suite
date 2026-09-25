// ═══ COPIA del cuerpo del nodo "Code - verificar cuentas" ═════════════════
//
// El original vive en n8n: workflow carga-mo/cuentas-verificar, id Bu2WI47L9897kBxL.
//
// ⚠️ ESTE ARCHIVO NO SE IMPORTA CON require(): no es un módulo. Es el texto que
// n8n ejecuta dentro de su propia envoltura async, y tiene `await` y `return` en
// el nivel superior. `tests/gate-cuentas-verificar.js` lo LEE como texto y lo
// envuelve igual que n8n — así prueba el mismo cuerpo que corre en producción,
// no una versión traducida para que compile aquí.
//
// ⚠️ n8n MANDA. Esta copia existe por una sola razón: que se pueda probar la
// lógica de los veredictos sin salir a la red y sin tocar una cuenta real. Es el
// único pedazo del sistema que decide si una transferencia va al destinatario
// correcto, y no tener forma de probarlo sería peor que la deuda de dos copias.
//
// Para re-sincronizar después de editar el nodo en n8n:
//   get_workflow_details(Bu2WI47L9897kBxL, nodeNames:['Code - verificar cuentas'])
//   → reemplazar todo lo que está debajo del marcador → correr el gate.
// El gate NO detecta la divergencia (no puede leer n8n); la detecta quien edite.
//
// Cero secretos: la credencial vive en el nodo Set de arriba, no aquí.
// Cero diagonales invertidas: el update_workflow del MCP se come un nivel de
// escape (CLAUDE.md §17 quirk 2c), así que este cuerpo no lleva ni una.

// ════════════════ CUERPO DEL NODO · TODO LO DE ABAJO ES DE n8n ════════════════
/* carga-mo/cuentas-verificar (#313) - Nivel 2 de la escalera.
 *
 * Contesta UNA pregunta por renglon del TXT: la cuenta a la que se le va a
 * transferir, es la que esa persona tiene en Odoo?
 *
 * Es el unico control de toda la cadena que protege contra el error que NO se
 * corrige: dinero al destinatario equivocado. Los Niveles 1 y 1b viven en el
 * navegador y cuadran importes; este necesita Odoo, y por eso vive aqui.
 *
 * LO QUE SALE DE AQUI: veredicto + ultimos 4. Nunca un numero completo, ni del
 * TXT ni de Odoo. Lo que ENTRA por HTTP si es la salida del nodo webhook - en
 * n8n eso no se puede evitar - por eso el workflow lleva saveData en none para
 * exito y para error, puesto ANTES de la primera corrida.
 */
try {
  var s = $('Set - secreto').first().json;
  var URL  = '' + (s.ourl  || '');
  var DB   = '' + (s.odb   || '');
  var USER = '' + (s.ouser || '');
  var KEY  = '' + (s.okey  || '');
  if (KEY.length < 8) return [{ json: { ok:false, error:'SIN_LLAVE_ODOO' } }];

  var b = {};
  try { var w = $('Webhook cuentas').first().json; b = (w && w.body) ? w.body : (w || {}); } catch (e) { b = {}; }

  var filas = Array.isArray(b.filas) ? b.filas : [];
  if (!filas.length) return [{ json: { ok:false, error:'SIN_FILAS' } }];
  if (filas.length > 300) return [{ json: { ok:false, error:'DEMASIADAS_FILAS', cuantas: filas.length } }];

  var DIG = '0123456789';
  function soloDig(t) {
    var o = ''; t = '' + (t == null ? '' : t);
    for (var i = 0; i < t.length; i++) { var ch = t.charAt(i); if (DIG.indexOf(ch) >= 0) o += ch; }
    return o;
  }
  // El codigo vive con ceros a la izquierda en los dos lados ('002'), pero
  // compararlos crudos apostaria a que nadie los guarde nunca como '2'.
  function sinCeros(t) {
    var i = 0; t = '' + (t == null ? '' : t).toString().trim();
    while (i < t.length - 1 && t.charAt(i) === '0') i++;
    return t.slice(i);
  }

  var hh = null;
  try { if (typeof $helpers !== 'undefined' && $helpers && $helpers.httpRequest) hh = $helpers; } catch (e) {}
  if (!hh) { try { if (this && this.helpers && this.helpers.httpRequest) hh = this.helpers; } catch (e) {} }
  if (!hh) return [{ json: { ok:false, error:'SIN_CLIENTE_HTTP' } }];

  var uid = 0;
  async function rpc(params) {
    var r = await hh.httpRequest({ method:'POST', url: URL + '/jsonrpc', json:true,
      body: { jsonrpc:'2.0', method:'call', params: params },
      returnFullResponse:true, ignoreHttpStatusErrors:true });
    var x = r.body || {};
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = {}; } }
    if (x.error) return { err: 'RPC' };
    return { val: x.result };
  }
  function kw(model, metodo, args, kwargs) {
    return rpc({ service:'object', method:'execute_kw', args:[DB, uid, KEY, model, metodo, args, kwargs || {}] });
  }

  var lg = await rpc({ service:'common', method:'login', args:[DB, USER, KEY] });
  if (lg.err || !lg.val) return [{ json: { ok:false, error:'LOGIN_FALLO' } }];
  uid = lg.val;

  // ACTIVOS E INACTIVOS a proposito: a quien se dio de baja a media semana se le
  // paga igual, y es justo el renglon que mas facil se teclea mal. Filtrar por
  // active lo dejaria como PERSONA_NO_ENCONTRADA, que manda a buscar donde no es.
  var emp = await kw('hr.employee','search_read',
    [[['company_id','=',1],['active','in',[true,false]]]],
    { fields:['id','name','x_studio_codigo_contpaqi','work_contact_id','active'], limit:600 });
  if (emp.err) return [{ json: { ok:false, error:'PADRON_LECTURA_FALLO' } }];
  var padron = emp.val || [];

  var porCod = {}, porId = {}, pids = [], i, k;
  for (i = 0; i < padron.length; i++) {
    var p = padron[i];
    var pid = Array.isArray(p.work_contact_id) ? p.work_contact_id[0] : p.work_contact_id;
    var reg = { id: p.id, nombre: p.name || '', pid: pid || null, activo: p.active === true };
    porId['i' + p.id] = reg;
    var c = sinCeros(p.x_studio_codigo_contpaqi || '');
    // Un codigo repetido no se resuelve adivinando: se marca y se pregunta.
    if (c) { if (porCod['c' + c]) porCod['c' + c] = 'DUP'; else porCod['c' + c] = reg; }
    if (pid && pids.indexOf(pid) < 0) pids.push(pid);
  }

  var porPartner = {};
  if (pids.length) {
    // Solo ACTIVAS: una cuenta archivada no es un destino valido, y darla por
    // buena seria aprobar una transferencia a algo que Odoo ya dio de baja.
    var bk = await kw('res.partner.bank','search_read',
      [[['partner_id','in',pids],['active','=',true]]],
      { fields:['id','partner_id','acc_number','allow_out_payment'], limit:600 });
    if (bk.err) return [{ json: { ok:false, error:'CUENTAS_LECTURA_FALLO' } }];
    var cuentas = bk.val || [];
    for (i = 0; i < cuentas.length; i++) {
      var q = cuentas[i];
      var qp = Array.isArray(q.partner_id) ? q.partner_id[0] : q.partner_id;
      k = 'p' + qp;
      if (!porPartner[k]) porPartner[k] = [];
      porPartner[k].push({ num: soloDig(q.acc_number), permite: q.allow_out_payment === true });
    }
  }

  var hallazgos = [], coinciden = 0;
  for (i = 0; i < filas.length; i++) {
    var f = filas[i] || {};
    var n = f.n == null ? (i + 1) : f.n;
    var numTxt = soloDig(f.cuenta);
    var u4 = numTxt.length >= 4 ? numTxt.slice(-4) : '????';
    var etiqueta = ('' + (f.nombre == null ? '' : f.nombre)).slice(0, 60);

    var reg2 = null;
    if (f.empleado_id != null) reg2 = porId['i' + parseInt(f.empleado_id, 10)] || null;
    else if (f.cod != null)    reg2 = porCod['c' + sinCeros(f.cod)] || null;

    if (reg2 === 'DUP') {
      hallazgos.push({ n: n, veredicto:'CODIGO_DUPLICADO', quien: etiqueta, ult4_txt: u4 });
      continue;
    }
    if (!reg2) {
      hallazgos.push({ n: n, veredicto:'PERSONA_NO_ENCONTRADA', quien: etiqueta, ult4_txt: u4,
                       buscado: f.empleado_id != null ? ('id ' + f.empleado_id) : ('codigo ' + f.cod) });
      continue;
    }
    if (!reg2.pid) {
      hallazgos.push({ n: n, veredicto:'SIN_CONTACTO', quien: reg2.nombre, ult4_txt: u4 });
      continue;
    }
    var lista = porPartner['p' + reg2.pid] || [];
    if (!lista.length) {
      hallazgos.push({ n: n, veredicto:'SIN_CUENTA_EN_ODOO', quien: reg2.nombre, ult4_txt: u4 });
      continue;
    }
    var match = null;
    for (k = 0; k < lista.length; k++) { if (lista[k].num === numTxt) { match = lista[k]; break; } }
    if (match) {
      coinciden++;
      if (!match.permite) {
        hallazgos.push({ n: n, veredicto:'COINCIDE_PERO_NO_AUTORIZADA', quien: reg2.nombre, ult4_txt: u4 });
      }
      continue;
    }
    var otros = [];
    for (k = 0; k < lista.length; k++) { var nn = lista[k].num; otros.push(nn.length >= 4 ? nn.slice(-4) : '????'); }
    hallazgos.push({ n: n, veredicto: lista.length > 1 ? 'NO_COINCIDE_CON_NINGUNA' : 'NO_COINCIDE',
                     quien: reg2.nombre, ult4_txt: u4, ult4_odoo: otros,
                     dado_de_baja: reg2.activo ? undefined : true });
  }

  return [{ json: { ok:true, semana: ('' + (b.semana == null ? '' : b.semana)).slice(0, 20),
                    total: filas.length, coinciden: coinciden,
                    por_revisar: hallazgos.length, hallazgos: hallazgos,
                    padron_leido: padron.length } }];
} catch (err) {
  var d = String(err && err.message ? err.message : err).slice(0, 300);
  var lim = '';
  for (var q2 = 0; q2 < d.length; q2++) { lim += ('0123456789'.indexOf(d.charAt(q2)) >= 0 ? '#' : d.charAt(q2)); }
  return [{ json: { ok:false, error:'FALLO_VERIFICAR', detalle: lim } }];
}