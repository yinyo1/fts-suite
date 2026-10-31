/* ═══ Conceptualizador · lo que hacen los botones del motor ═══
 *
 * Cada manejador recibe la acción propuesta y hace la escritura con el
 * endpoint de la suite que ya existe para eso, SIEMPRE por el clic de la
 * persona. Devuelve {ok, resultado} — el resultado queda registrado en la
 * acción (api_suite modo 'accion') y el motor sigue desde ahí. El resultado
 * NUNCA lleva correos ni teléfonos: va a la base y al repo del motor.
 *
 *   crear_machote  → comercial/machote-guardar (a nombre de quien da el clic)
 *                    y comercial/oportunidades modo 'ligar' (folio en el CRM)
 *   crear_borrador → conceptualizador/orden-odoo (V1.42): crea la cotización
 *                    en Odoo como BORRADOR, o actualiza la MISMA orden si ya
 *                    existe. Nunca confirma. Solo para quien el servidor tenga
 *                    habilitado (hoy solo Dirección); los demás ven la leyenda.
 *   enviada        → la misma ruta, modo `enviada`: state=sent sin correo.
 *   alta_contacto  → conceptualizador/odoo-alta (busca antes de crear)
 *
 * El PDF al cliente y la orden usan MachoteDocumento de la suite: una línea
 * por sección con su precio, notas de plantilla, y NUNCA el costo.
 */
(function (G) {
  'use strict';
  var C = G.CzCliente;
  /* V1.42 · ya no hay interruptor en la pantalla: quién puede crear la cotización en Odoo lo decide el
   * SERVIDOR (EMISION_HABILITADA en conceptualizador/orden-odoo, hoy solo Dirección). `EMITIR_ENCENDIDO` y
   * `CONFIRMAR_ENCENDIDO` de comercial/machote/js/almacen.js NO se tocan: son el machote, no esto. */
  var RUTA_ORDEN = '/webhook/conceptualizador/orden-odoo';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var dinero = function (n, m) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (m ? ' ' + m : ''); };

  // ── la suite, a demanda: documento.js y sus plantillas de notas ──────────
  var _doc = null;
  function cargarDocumento() {
    if (G.MachoteDocumento) return Promise.resolve(G.MachoteDocumento);
    if (_doc) return _doc;
    _doc = new Promise(function (ok, mal) {
      var s = document.createElement('script'); s.src = '../machote/js/documento.js';
      s.onload = function () { ok(G.MachoteDocumento); }; s.onerror = function () { _doc = null; mal(new Error('No se pudo cargar el documento del machote.')); };
      document.head.appendChild(s);
    });
    return _doc;
  }
  /* V1.52 · el motor de cálculo del machote, para el resumen de una versión que NO armó el conceptualizador (la de
   * «lo que editaste a mano no se tocó»). Sin resumen la versión queda sin total ni moneda y la cotización en Odoo la
   * rechaza (MONEDA_INVALIDA / MACHOTE_SIN_TOTAL): pasó con COT-0046 v4 del caso 21fec6 (17-oct, issue #5). */
  var _calc = null;
  function cargarCalc() {
    if (G.MachoteCalc && G.MachoteCalc.calcular) return Promise.resolve(G.MachoteCalc);
    if (_calc) return _calc;
    _calc = new Promise(function (ok, mal) {
      var s = document.createElement('script'); s.src = '../machote/js/calc.js?v=V1.53';
      s.onload = function () { G.MachoteCalc && G.MachoteCalc.calcular ? ok(G.MachoteCalc) : (_calc = null, mal(new Error('sin MachoteCalc'))); };
      s.onerror = function () { _calc = null; mal(new Error('No se pudo cargar el cálculo del machote.')); };
      document.head.appendChild(s);
    });
    return _calc;
  }
  /** Resumen de una versión armada en la pantalla: total y moneda salen del MISMO cálculo que usa el editor del machote. */
  async function resumenDe(doc) {
    var r = { total: null, margen: isFinite(Number(doc.margen_deseado)) ? Number(doc.margen_deseado) : null, moneda: doc.moneda || null,
      tc: isFinite(Number(doc.tc)) && Number(doc.tc) > 0 ? Number(doc.tc) : null, tc_fuente: doc.tc_fuente || null,
      comision_fts: isFinite(Number(doc.comision_fts)) ? Number(doc.comision_fts) : null, comision_cliente: isFinite(Number(doc.comision_cliente)) ? Number(doc.comision_cliente) : 0 };
    try { var c = (await cargarCalc()).calcular(doc); if (c && isFinite(Number(c.precio))) r.total = Math.round(Number(c.precio) * 100) / 100; } catch (e) {}
    return r;
  }
  /** Los bloques de la orden: una sección con su línea de precio, como las órdenes reales de FTS. */
  async function bloques(datos, caso) {
    var D = await cargarDocumento();
    await D.plantillas();
    var secs = (datos.secciones || []).map(function (s) { return { nombre: s.nombre, lineas: [{ nombre: s.alcance || s.nombre, cantidad: 1, precio: s.precio }] }; });
    return D.proponer({ empresa_id: caso.pais === 'usa' ? 6 : 1 }, secs, datos.tipo || 'instalacion').bloques;
  }

  // ── V1.36 · lo que falta para cotizar en Odoo ───────────────────────────
  /** Pendientes del machote vigente: los del último «crear/actualizar machote» que se hizo.
   *  El machote se crea CON pendientes (renglones sin precio, diagnóstico, tarifa, viaje);
   *  la cotización en Odoo, el PDF y el envío esperan a que no quede ninguno. */
  function pendientes(H) {
    var hecho = ((H && H.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop();
    var d = (hecho && hecho.datos) || {};
    return { n: Number(d.n_pendientes) || 0, lista: d.pendientes || [], hay_machote: !!hecho };
  }
  /** «Faltan 6 para cotizar en Odoo: 6 precios de proveedor». */
  var NOMBRE = { 'partida-sin-precio': ['precio de proveedor', 'precios de proveedor'], 'mo-sin-tarifa': ['tarifa de mano de obra', 'tarifas de mano de obra'],
    'sin-tipo-proyecto': ['tipo de proyecto', 'tipo de proyecto'], 'criticas-sin-responder': ['respuesta del diagnóstico', 'respuestas del diagnóstico'],
    'viaje-sin-resolver': ['concepto de viaje', 'conceptos de viaje'], 'sin-lugar-ejecucion': ['lugar de ejecución', 'lugar de ejecución'],
    'budget-no-cuadra': ['reparto de venta', 'reparto de venta'], 'reparto-descuadrado': ['reparto de comisiones', 'reparto de comisiones'],
    'margen-bajo-duro': ['margen abajo del piso', 'margen abajo del piso'] };
  function textoPendientes(p) {
    if (!p.n) return '';
    var partes = p.lista.map(function (h) { var k = Math.max(1, (h.items || []).length), nm = NOMBRE[h.id] || [h.titulo, h.titulo];
      return k + ' ' + (k === 1 ? nm[0] : nm[1]); });
    return 'Faltan ' + p.n + ' para cotizar en Odoo' + (partes.length ? ': ' + partes.join(', ') : '') + '.';
  }

  // ── crear machote ───────────────────────────────────────────────────────
  async function crearMachote(a, ctx) {
    var d = a.datos || {}, caso = ctx.caso;
    if (!d.documento) return { ok: false, mensaje: 'El motor no mandó el machote. Pídele que lo arme otra vez.' };
    if (d.actualiza) return actualizarMachote(a, ctx);
    // V1.64a (#20, `una_cotizacion_v164`) · una sola cotización por caso: si el caso YA tiene machote, «Crear» guarda una versión del
    // MISMO y nunca crea otro (8894ce: una tarjeta «Crear» de antes de que el robot armara COT-0062 creó COT-0064 sin orden y desde ahí
    // cada actualización salió SIN_ORDEN). Sin la versión leída no se pisa lo editado a mano: solo se llenan renglones sin precio.
    if (caso && prendido('una_cotizacion_v164', caso.id) && caso.machote_id)
      return actualizarMachote({ tipo: a.tipo, datos: Object.assign({}, d, { actualiza: { machote_id: caso.machote_id, folio: caso.machote_folio || null } }) }, ctx);
    var S = G.SuiteAuth.getSession() || {};
    var m = JSON.parse(JSON.stringify(d.documento));
    /* Id de la forma que genera la aplicación (`M-<epoch>`): así se distingue
     * siempre de los de ejemplo escritos a mano (§20 #12c de la suite). */
    m.id = 'M-' + Date.now();
    m.nombre = caso.titulo || m.nombre;
    m.cliente = caso.cliente || m.cliente || '';
    m.cliente_id = caso.cliente_odoo_id || null;
    m.creado_por = S.actor || ''; m.creado_por_nombre = S.nombre || '';
    m.origen = { modulo: 'conceptualizador', caso_id: caso.id };
    if (caso.oportunidad_id) m.oportunidad = { lead_id: Number(caso.oportunidad_id), nombre: null, cliente_id: m.cliente_id, ligado_at: new Date().toISOString(), origen: 'conceptualizador' };
    var r = await C.suite('/webhook/comercial/machote-guardar', { id_local: m.id, cliente_odoo_id: m.cliente_id, version_leida: 0,
      estado: 'borrador', motivo: 'Creado desde el conceptualizador', documento: m, resumen: d.resumen || null });
    if (!r.ok) return { ok: false, mensaje: r.mensaje || ('No se guardó el machote: ' + (r.error || 'error')) };
    var res = { machote_id: r.machote_id, folio: r.folio_txt || (r.folio ? String(r.folio) : null), version: r.version, id_local: m.id };
    var ligado = '';
    if (caso.oportunidad_id && r.machote_id) {
      var l = await C.suite('/webhook/comercial/oportunidades', { modo: 'ligar', machote_id: r.machote_id, version_leida: r.version, lead_id: Number(caso.oportunidad_id) });
      res.ligado = !!l.ok;
      ligado = l.ok ? ' y ligado a la oportunidad ' + caso.oportunidad_id : ' (no se pudo ligar a la oportunidad: ' + (l.mensaje || l.error) + '; lígala desde el machote)';
    }
    var tp = textoPendientes({ n: Number(d.n_pendientes) || 0, lista: d.pendientes || [] });
    res.texto = 'Machote ' + (res.folio || '') + ' creado a tu nombre' + ligado + '. Ábrelo en Comercial → Machote.' + (tp ? ' ' + tp : '');
    return { ok: true, resultado: res };
  }

  /* V1.36 · el precio que llega actualiza el MISMO machote (decisión de Esteban, #4): versión nueva, mismo
   * id_local, mismo folio. Si nadie lo tocó desde que se creó (la versión del servidor es la que guardó el
   * conceptualizador), sube el machote recalculado entero. Si alguien lo editó en el editor, NO pisa nada:
   * solo llena los renglones que seguían sin precio y que en el nuevo ya traen uno (misma sección y
   * descripción), y dice cuáles no encontró. */
  async function actualizarMachote(a, ctx) {
    var d = a.datos || {}, u = d.actualiza || {};
    var l = await C.suite('/webhook/comercial/machotes-leer', {});
    if (!l.ok || !Array.isArray(l.machotes)) return { ok: false, mensaje: l.mensaje || ('No se pudo leer el machote: ' + (l.error || 'error')) };
    // V1.59 (`delegacion_v159`) · el machote de otro se actualiza si la base dice que puedes (hilo.machote_mueve, la misma regla
    // que machote-guardar y orden-odoo). La pantalla solo deja intentarlo: quien decide sigue siendo el servidor.
    var M = (ctx && ctx.hilo && ctx.hilo.machote_mueve) || null, ajenoOk = prendido('delegacion_v159') && !!M && M.puede === true;
    var fila = l.machotes.filter(function (f) { return f && (!f.ajeno || ajenoOk) && ((u.machote_id && f.id === u.machote_id) || (u.id_local && f.id_local === u.id_local)); })[0];
    if (!fila || !fila.documento) return { ok: false, mensaje: 'No encontré el machote ' + (u.folio || '') + ' entre los tuyos. Si es de otra persona, que lo actualice ella' + (prendido('delegacion_v159') ? ' o que Esteban te lo delegue en el panel.' : '.') };
    var actual = fila.documento, nuevo = JSON.parse(JSON.stringify(d.documento)), doc, llenos = [], sinLugar = [];
    var intacto = u.version && Number(fila.version) === Number(u.version);
    // V1.65 (fts-suite#442) · recotización: se parte de lo GUARDADO y solo entran las secciones que la persona palomeó
    // (cz-deltas.js). Lo demás se queda exactamente como estaba, aunque la propuesta lo traiga distinto.
    var recot = d.recotizacion === true && Array.isArray(d.aprobadas) && G.CzDeltas ? G.CzDeltas.mezclar(actual, nuevo, d.aprobadas) : null;
    if (recot) {
      doc = recot.documento; intacto = false;
      ['id', 'nombre', 'cliente', 'cliente_id', 'creado_por', 'creado_por_nombre', 'origen', 'oportunidad'].forEach(function (k) { if (actual[k] !== undefined) doc[k] = actual[k]; });
      var rR = await C.suite('/webhook/comercial/machote-guardar', { id_local: fila.id_local, cliente_odoo_id: doc.cliente_id || null, version_leida: Number(fila.version) || 0,
        estado: fila.estado || 'borrador', motivo: ('Recotización: ' + recot.aplicadas.length + ' sección(es) aprobada(s)' + (recot.rechazadas.length ? ', ' + recot.rechazadas.length + ' rechazada(s)' : '') + ' (conceptualizador)').slice(0, 300),
        documento: doc, resumen: await resumenDe(doc) });
      if (!rR.ok) return { ok: false, error: rR.error, mensaje: rR.error === 'CONFLICTO_DE_VERSION' ? 'Alguien guardó el machote en este momento. Vuelve a tocar.' :
        rR.error === 'MACHOTE_DE_OTRA_PERSONA' ? 'El machote es de ' + (fila.dueno_nombre || fila.dueno || 'otra persona') + ': pídele que te lo ceda o te lo preste.' : (rR.mensaje || ('No se guardó: ' + (rR.error || 'error'))) };
      return { ok: true, resultado: { machote_id: rR.machote_id || fila.id, folio: rR.folio_txt || fila.folio_txt || u.folio || '', version: rR.version, id_local: fila.id_local, actualizado: true,
        recotizacion: { aplicadas: recot.aplicadas, rechazadas: recot.rechazadas },
        texto: 'Machote ' + (rR.folio_txt || fila.folio_txt || '') + ' actualizado (versión ' + rR.version + '): ' + recot.aplicadas.length + ' sección(es) aprobada(s)' +
          (recot.rechazadas.length ? '; ' + recot.rechazadas.length + ' se quedaron como estaban' : '') + '. La orden de Odoo no se tocó.' } };
    }
    if (intacto) {
      doc = nuevo;
      ['id', 'nombre', 'cliente', 'cliente_id', 'creado_por', 'creado_por_nombre', 'origen', 'oportunidad'].forEach(function (k) { if (actual[k] !== undefined) doc[k] = actual[k]; });
    } else {
      doc = JSON.parse(JSON.stringify(actual));
      var clave = function (sec, l) { return String(sec.nombre || '').trim().toLowerCase() + '|' + String(l.descripcion || '').trim().toLowerCase(); };
      var conPrecio = {};
      (nuevo.secciones || []).forEach(function (sec) { (sec.partidas || []).forEach(function (l) { if (l.pu !== null && l.pu !== undefined && l.pu !== '') conPrecio[clave(sec, l)] = l; }); });
      (doc.secciones || []).forEach(function (sec) { (sec.partidas || []).forEach(function (l) {
        if (l.pu !== null && l.pu !== undefined && l.pu !== '') return;
        var n = conPrecio[clave(sec, l)]; if (!n) return;
        ['pu', 'moneda', 'link', 'comentario'].forEach(function (k) { if (n[k] !== undefined) l[k] = n[k]; });
        llenos.push(l.descripcion); delete conPrecio[clave(sec, l)];
      }); });
      // Precios nuevos que el editor ya no tiene igual (alguien cambió la descripción o la sección).
      Object.keys(conPrecio).forEach(function (k) { var p = conPrecio[k];
        (actual.secciones || []).some(function (sec) { return (sec.partidas || []).some(function (l) { return clave(sec, l) === k; }); }) || sinLugar.push(p.descripcion); });
    }
    var r = await C.suite('/webhook/comercial/machote-guardar', { id_local: fila.id_local, cliente_odoo_id: doc.cliente_id || null, version_leida: Number(fila.version) || 0,
      estado: fila.estado || 'borrador', motivo: 'Actualizado desde el conceptualizador', documento: doc, resumen: intacto ? (d.resumen || null) : await resumenDe(doc) });
    if (!r.ok) return { ok: false, error: r.error, mensaje: r.error === 'CONFLICTO_DE_VERSION' ? 'Alguien guardó el machote en este momento. Vuelve a tocar «Actualizar machote».' :
      r.error === 'MACHOTE_DE_OTRA_PERSONA' ? 'El servidor no te deja guardar el machote de ' + (fila.dueno_nombre || fila.dueno || 'otra persona') + ' (MACHOTE_DE_OTRA_PERSONA). Esteban lo configura en el panel.' :
      (r.mensaje || ('No se actualizó el machote: ' + (r.error || 'error'))) };
    var S0 = G.SuiteAuth.getSession() || {}, deOtro = fila.ajeno ? (S0.nombre || S0.actor || 'Alguien') + ' actualizó el machote de ' + (fila.dueno_nombre || fila.dueno || 'otra persona') + '. ' : '';
    var tp = textoPendientes({ n: Number(d.n_pendientes) || 0, lista: d.pendientes || [] });
    var folio = r.folio_txt || fila.folio_txt || u.folio || '';
    return { ok: true, resultado: { machote_id: r.machote_id || fila.id, folio: folio, version: r.version, id_local: fila.id_local, actualizado: true, intacto: !!intacto,
      llenos: intacto ? undefined : llenos.length,
      sin_lugar: intacto ? undefined : sinLugar,
      ajeno: fila.ajeno ? { dueno: fila.dueno || null, dueno_nombre: fila.dueno_nombre || null, por: S0.actor || null } : undefined,
      texto: deOtro + 'Machote ' + folio + ' actualizado (versión ' + r.version + ')' + (intacto ? '' : ': ' + llenos.length + ' precio' + (llenos.length === 1 ? '' : 's') + ' en renglones que seguían sin precio; lo que editaste a mano no se tocó') +
        '.' + (sinLugar.length ? ' No encontré en el machote (¿le cambiaste el nombre?): ' + sinLugar.join('; ') + '. Captúralo a mano.' : '') +
        (tp ? ' ' + tp : ' Ya no falta nada para cotizar en Odoo.') } };
  }

  // ── V1.42 · cotización en Odoo: permiso, borrador, la misma orden, enviada ──
  var _permiso = null;
  /** ¿Puede este usuario crear la cotización en Odoo? Lo contesta el servidor (modo `permiso`). */
  function permiso() {
    if (_permiso) return _permiso;
    _permiso = C.suite(RUTA_ORDEN, { modo: 'permiso' }, 20000).then(function (r) {
      if (!r.ok) { _permiso = null; return { habilitado: false, mensaje: r.mensaje || '', error: r.error || 'SIN_RESPUESTA' }; }
      return { habilitado: r.habilitado === true, mensaje: r.mensaje || '', referencias: r.referencias === true };
    });
    return _permiso;
  }
  /** La orden que ya se creó para este caso (la última «crear borrador» hecha). */
  function ordenDe(H) {
    var b = ((H && H.acciones) || []).filter(function (x) { return x.tipo === 'crear_borrador' && x.estado === 'hecha' && x.resultado && x.resultado.orden_id; }).pop();
    return b ? b.resultado : null;
  }
  /** Lo releído de Odoo, en corto: se guarda en la acción y se pinta desde ahí, no desde el 200. */
  function releido(r) {
    var base = (r.renglones || []).filter(function (x) { return x.tipo === 'linea'; });
    return { orden_id: r.odoo_so_id, orden_nombre: r.odoo_so_name || null, estado: r.estado || null, partner: r.partner || null,
      // V1.53b.1 (#6) · el RFC del cliente: orden-odoo ya lo trae (`rfc`, el `vat` del partner leído de Odoo); antes no se guardaba.
      partner_vat: r.rfc || r.partner_vat || null,
      lista_precios: r.lista_precios || null, moneda: r.moneda || null, subtotal: r.subtotal, total: r.total, vence_el: r.vence_el || null,
      renglones: base.map(function (x) { return { texto: x.texto, precio: x.precio }; }),
      opcionales: (r.renglones || []).filter(function (x) { return x.tipo === 'line_note' && /no incluido en el total|not included in the total/.test(x.texto || ''); }).map(function (x) { return x.texto; }),
      // V1.51 · lo que necesita el visor de la cotización (cz-visor.js): impuesto, nota y todos los renglones, releídos de Odoo.
      impuesto: r.impuesto == null ? null : r.impuesto, nota_orden: r.nota_orden || null,
      todos: (r.renglones || []).map(function (x) { return { tipo: x.tipo, texto: x.texto, precio: x.precio, opcional: !!x.opcional }; }),
      avisos: r.avisos || [] };
  }
  /** V1.64a (`relee_orden_v164`) · ¿el machote ya tiene orden en Odoo? comercial/machotes-leer en modo historial (solo lectura). Hasta 4
   *  lecturas, 5 s entre una y otra: tras un tiempo de espera el servidor normalmente ya terminó. {leido, so, nombre}. */
  async function releerOrden(machoteId) {
    var leido = false;
    for (var i = 0; i < 4; i++) {
      if (i) await new Promise(function (ok) { setTimeout(ok, G.__czReleerMs === undefined ? 5000 : G.__czReleerMs); });
      var l = await C.suite('/webhook/comercial/machotes-leer', { machote_id: machoteId }, 20000);
      if (!l || !l.ok || !Array.isArray(l.versiones)) continue;
      leido = true;
      var v = l.versiones.filter(function (x) { return x && Number(x.odoo_so_id) > 0; })[0];
      if (v) return { leido: true, so: Number(v.odoo_so_id), nombre: v.odoo_so_name || null };
    }
    return { leido: leido, so: null, nombre: null };
  }
  function textoOrden(o, que) {
    return que + ' ' + (o.orden_nombre || o.orden_id) + ' · ' + (o.partner || '') + ' · subtotal ' + dinero(o.subtotal, o.moneda) +
      ' · total con IVA ' + dinero(o.total, o.moneda) + (o.avisos.length ? '. Revisa: ' + o.avisos.join(' ') : '.');
  }

  // ── crear borrador en Odoo ──────────────────────────────────────────────
  /** V1.52 §12 · la moneda del caso que dice el servidor (caso.moneda, la cambia un decreto); si no la trae, la de la empresa. */
  /** V1.52 §15 · interruptores (los da el servidor; cz-app.js expone G.CzInterruptor). Sin él, apagado. */
  function prendido(n, cid) { return typeof G.CzInterruptor === 'function' && G.CzInterruptor(n, cid) === true; }
  function monedaCaso(caso) {
    var m = String((caso && caso.moneda) || '').toUpperCase();
    if (m === 'USD' || m === 'MXN') return m;
    var e = String((caso && caso.empresa) || '');
    return e === 'mx_usd' || e === 'usa_usd' ? 'USD' : e === 'mx_mxn' ? 'MXN' : null;
  }
  async function crearBorrador(a, ctx) {
    var caso = ctx.caso, H = ctx.hilo;
    var cm = (H.acciones || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop();
    if (!caso.machote_id || !cm) return { ok: false, mensaje: 'Primero crea el machote: el borrador sale de él.' };
    // V1.62b (`todo_hecho_v162b`, #12 resultado 4) · la orden ya se envió: UN botón hace las tres cosas con tu clic. Primero el machote
    // (la misma actualización de siempre, mismo folio), luego la orden con la versión que quedó, y el PDF nuevo queda abajo.
    var comb = prendido('todo_hecho_v162b') && (a.datos || {}).combinado, vComb = null, txtComb = '';
    if (comb && comb.machote && comb.documento) {
      var rm = await actualizarMachote({ tipo: 'crear_machote', datos: { actualiza: comb.machote, documento: comb.documento, resumen: comb.resumen || null } }, ctx);
      if (!rm.ok) return rm;
      vComb = Number((rm.resultado || {}).version) || null; txtComb = (rm.resultado || {}).texto || '';
    }
    // V1.36 · la cotización en Odoo espera a que no quede ninguna regla dura (precio, diagnóstico, tarifa).
    var pend = pendientes(H);
    // V1.63e bloque 2b (#12, `borrador_n5_v163e`) · los renglones sin precio (N5) ya no frenan el BORRADOR: van «precio por confirmar».
    // Lo demás que falta sí frena, y «Ya la mandé» espera a cero N5 en el servidor.
    if (prendido('borrador_n5_v163e')) { var L5 = pend.lista.filter(function (h) { return h.id !== 'partida-sin-precio' && h.id !== 'sin-secciones'; });
      pend = { n: L5.reduce(function (n, h) { return n + Math.max(1, (h.items || []).length); }, 0), lista: L5, hay_machote: pend.hay_machote }; }
    if (pend.n) return { ok: false, mensaje: textoPendientes(pend) + ' Nunca se estima un precio: cuando lleguen, se actualiza el machote y aquí se enciende.' };
    var cot = (a.datos || {}).cotizacion;
    if (!cot || !(cot.bloques || []).length) return { ok: false, mensaje: 'El motor no mandó la cotización armada (renglones, suma y anticipo). Pídele el botón otra vez.' };
    // V1.57b (#12, Esteban 21-oct) · sin la tabla de pagos (hitos) no se crea ni se actualiza el borrador; el servidor también lo frena.
    if (!String(((cot.x_fts || {}).x_fts_hitos) || '').trim()) return { ok: false, mensaje: 'Esta cotización no trae la tabla de pagos (hitos). Pídele al agente que la vuelva a armar con la condición de pago del caso.' };
    var p = await permiso();
    if (!p.habilitado) return { ok: false, mensaje: p.error && p.mensaje ? p.mensaje : 'Crear la cotización en Odoo todavía no está habilitado para tu usuario.' };
    // V1.43 · precios de referencia (N3/N4): cuentan como precio, pero los acepta quien cotiza con «Cotizar con referencias».
    var R = (a.datos || {}).referencias, conRef = !!(R && R.n);
    if (conRef && !p.referencias) return { ok: false, mensaje: 'El servidor de Odoo todavía no acepta cotizar con referencias (falta publicar el workflow). El machote sí está al día.' };
    // V1.62b (`revision_v162b`, 6342660185) · las referencias ya no frenan el borrador: se aceptan en la revisión final antes de enviar.
    if (conRef && !ctx.aceptaReferencias && !prendido('revision_v162b')) return { ok: false, mensaje: 'Revisa las referencias y toca «Cotizar con referencias».' };
    // V1.57b (`regla15_v157`) · los textos limpios elegidos se aplican aquí con CzRegla15 (el mismo código que el motor y el
    // servidor) y las frases liberadas viajan con su razón; el servidor vuelve a revisar y no escribe si falta una.
    var R15 = ctx.r15 || null;
    if (R15 && R15.faltan) return { ok: false, mensaje: 'Primero decide las frases de la regla 15: texto limpio o liberar con su razón.' };
    if (R15) cot = R15.cotizacion;
    // V1.59 (`vendedor_v159`) · la oportunidad del caso; si no tiene, la ligada al machote o la que ya tiene la orden; si tampoco,
    // se pregunta: ligar una del cliente o crear una a nombre del autor del caso. Nunca se adivina, y si la persona cierra la
    // ventana no se escribe nada. La elección la crea o la liga orden-odoo del lado del servidor (opción b de Esteban, #12): con la
    // misma regla de quién mueve qué y sin pedir comercial:write. Aquí solo se leen las candidatas.
    // V1.63a P7 (#12, Esteban 23-oct 15:27 CST, `flujo_v163`) · crear o actualizar lo decide la verdad del SERVIDOR, no si hay una
    // tarjeta «crear borrador» hecha: un caso dado de alta por script (Mattel SO11919) ya trae `orden_id` del machote sin esa tarjeta,
    // y mandar «crear» daba YA_TIENE_ORDEN y un «Volver a armar» que volvía al mismo error.
    var prev = ordenDe(H) || (prendido('flujo_v163') && caso.orden_id ? { orden_id: caso.orden_id, orden_nombre: caso.orden_nombre || null } : null);
    var modo = prev ? 'actualizar' : 'crear', eleccion = null;
    if (prendido('vendedor_v159') && !caso.oportunidad_id && !ctx.oportunidadLista && !(prev && prev.oportunidad && prev.oportunidad.id)) {
      var op = await oportunidadDelMachote(caso.machote_id);
      if (!op.ok) return { ok: false, error: op.error || 'SIN_OPORTUNIDAD', mensaje: op.mensaje };
      // V1.62a (`oportunidad_v162`, #12 resultado 3) · la elección ya guardada en el caso se reusa (no se vuelve a preguntar); una nueva
      // se guarda en el caso AL ELEGIRLA, antes de mandar la orden: si la orden falla por otra razón, la elección no se pierde.
      var el0 = prendido('oportunidad_v162') ? eleccionGuardada(H) : null;
      if (!op.lead_id && el0) eleccion = el0;
      else if (!op.lead_id) {
        var el = await elegirOportunidad(caso, ctx);
        if (!el.ok) return { ok: false, error: el.error || 'SIN_OPORTUNIDAD', mensaje: el.mensaje || 'Sin oportunidad no se crea el borrador: liga una del cliente o crea una.' };
        eleccion = el.oportunidad;
        if (prendido('oportunidad_v162')) await guardarEleccion(caso, eleccion);
      }
    }
    // V1.64a (#20, `una_cotizacion_v164`) · la orden sale del machote que ACABA de guardarse (el combinado), no de otro: en 8894ce el botón
    // guardaba COT-0062 y pedía la orden con COT-0064 → SIN_ORDEN en cada clic, y la orden se quedaba igual.
    var mOrden = (prendido('una_cotizacion_v164', caso.id) && rm && rm.ok && rm.resultado && rm.resultado.machote_id) || caso.machote_id;
    var cuerpo = { modo: modo, machote_id: mOrden, version_leida: vComb || (cm.resultado || {}).version || 1,
      caso_id: caso.id, cotizacion: cot, acepta_referencias: conRef && (!!ctx.aceptaReferencias || !prendido('revision_v162b')) },
      // V1.52 §12 · la moneda del caso (la decide el servidor, p. ej. por decreto): orden-odoo la compara con la del machote.
      // Solo con el interruptor `moneda_decreto` prendido; apagado, el cuerpo es el de V1.51.
      md = prendido('moneda_decreto');
    if (md) cuerpo.moneda_caso = monedaCaso(caso);
    if (R15 && R15.liberadas.length) cuerpo.regla15_liberadas = R15.liberadas;
    if (eleccion) cuerpo.oportunidad = eleccion;
    var r = await C.suite(RUTA_ORDEN, cuerpo, 120000);
    // V1.64a (#20, Esteban 31-oct 00:05 CST, `relee_orden_v164`) · un tiempo de espera NO es «no se creó». ZZ2, 31-oct 04:55 UTC: Odoo creó
    // SO11945 a los 10 s y la pantalla dijo «No se creó la cotización en Odoo · No se escribió nada en Odoo». Antes de decir que falló se
    // relee el machote (comercial/machotes-leer, solo lectura): si ya tiene su orden, se dice «se creó» con ella y la tarjeta se cierra
    // con esa orden (así el caso la conoce y nadie crea otra). Si no, se dice que no se pudo comprobar, nunca que no se escribió.
    if (!r.ok && modo === 'crear' && (r.error === 'SIN_RED' || r.clase === 'red') && prendido('relee_orden_v164', caso.id)) {
      var rl = await releerOrden(mOrden);
      if (rl.so) r = { ok: true, odoo_so_id: rl.so, odoo_so_name: rl.nombre, estado: null, renglones: [], releida_tras_espera: true };
      else return { ok: false, error: 'SIN_CONFIRMAR', sin_confirmar: true, mensaje: 'El servidor tardó en contestar y no pude comprobar si la cotización llegó a Odoo' +
        (rl.leido ? ': el machote todavía no tiene orden. Espera un minuto y vuelve a mirar antes de reintentar.' : ' (tampoco pude releer el machote).') };
    }
    // El servidor encontró una frase que la pantalla no vio (la cotización cambió): se dice cuál, no se escribe nada.
    if (!r.ok && r.error === 'REGLA15_CALCULOS') return { ok: false, error: r.error, mensaje: r.mensaje || 'La cotización trae cálculos que vería el cliente.' };
    if (md && !r.ok && r.error === 'MONEDA_DISTINTA_AL_CASO') {
      var mm = r.moneda_machote || (cot && cot.moneda) || '¿?', mc = r.moneda_caso || monedaCaso(caso) || '¿?';
      return { ok: false, error: r.error, mensaje: 'El machote está en ' + mm + ' y el caso en ' + mc + ': actualiza el machote antes de crear la cotización.' };
    }
    // V1.62a (`oportunidad_v162`) · la orden no salió pero la oportunidad que pidió crear sí: su id queda en el caso.
    if (!r.ok && prendido('oportunidad_v162') && r.oportunidad_creada && r.oportunidad_creada.id)
      await guardarEleccion(caso, { modo: 'ligar', id: r.oportunidad_creada.id, nombre: r.oportunidad_creada.nombre, creada: true });
    if (!r.ok || !r.odoo_so_id) return { ok: false, error: r.error || 'SIN_ORDEN', mensaje: r.mensaje || ('No se creó el borrador: ' + (r.error || 'sin orden')),   // V1.58 · el código va a la tarjeta de estado
      oportunidad_creada: r.oportunidad_creada || undefined };
    var o = releido(r);
    o.texto = textoOrden(o, modo === 'crear' ? 'Borrador' : 'Actualizado');
    if (r.releida_tras_espera) { o.releida_tras_espera = true;
      o.texto = 'Se creó la cotización en Odoo: ' + (r.odoo_so_name || 'orden ' + r.odoo_so_id) + '. El servidor tardó en contestar; lo confirmé releyendo el machote, no lo supuse. ' +
        'El detalle (renglones y PDF) se ve en Odoo; el siguiente «Actualizar» trabaja sobre esta misma orden, no crea otra.'; }
    if (comb && vComb) { o.texto = txtComb + ' ' + o.texto + ' El PDF nuevo está abajo.'; o.combinado = { machote_version: vComb }; }
    // V1.61 (`barra_v161`, #12 punto 9, D96) · la línea fija del redondeo la arma orden-odoo con el subtotal RELEÍDO de Odoo.
    if (prendido('barra_v161') && r.linea_redondeo && r.linea_redondeo.texto) { o.linea_redondeo = r.linea_redondeo; o.texto += ' ' + r.linea_redondeo.texto; }
    if (prendido('barra_v161') && r.mismos_precios && r.mismos_precios.texto) { o.mismos_precios = r.mismos_precios; o.texto += ' (' + r.mismos_precios.texto + ')'; }
    // V1.59 · lo releído de Odoo: vendedor, oportunidad y quién movió lo de quién (orden-odoo lo devuelve con los interruptores prendidos).
    if (r.vendedor) o.vendedor = r.vendedor;
    if (r.oportunidad) o.oportunidad = r.oportunidad;
    if (r.ajeno) { o.ajeno = r.ajeno; o.texto = (r.ajeno.actor_nombre || r.ajeno.actor) + ' movió la cotización del machote de ' + (r.ajeno.dueno_nombre || r.ajeno.dueno) + '. ' + o.texto; }
    if (r.vendedor && r.vendedor.nombre) o.texto += ' Vendedor: ' + r.vendedor.nombre + (r.oportunidad && r.oportunidad.id ? ' · oportunidad ' + (r.oportunidad.nombre || r.oportunidad.id) : ' · sin oportunidad') + '.';
    // Queda en la acción (y por ella en hilo.md): qué frase, qué se hizo, quién y por qué. El motor lo lee en la vuelta siguiente.
    if (R15 && R15.registro.hallazgos) { o.regla15 = R15.registro; o.texto += ' Regla 15: ' + R15.registro.limpios + ' texto' + (R15.registro.limpios === 1 ? '' : 's') + ' limpio' + (R15.registro.limpios === 1 ? '' : 's') + (R15.registro.liberadas ? ', ' + R15.registro.liberadas + ' liberada' + (R15.registro.liberadas === 1 ? '' : 's') : '') + '.'; }
    if (conRef && (ctx.aceptaReferencias || !prendido('revision_v162b'))) {   // queda en la acción y por ella en hilo.md: quién aceptó qué y cuándo
      var S = G.SuiteAuth.getSession() || {};
      o.referencias_aceptadas = { pct: R.pct, n3: R.n3, n4: R.n4, importe: R.importe, por: S.actor || null, at: new Date().toISOString() };
      // V1.52 · un solo dato (CzIndicadores): el mismo % y las mismas alertas que el mensaje, la tarjeta y la franja.
      var IN = prendido('un_solo_dato') ? G.CzIndicadores : null, I = IN ? IN.calcular({ referencias: R, sensatez: ((a.datos || {}).sensatez || []).filter(function (x) { return x && x.alerta; }) }) : null;
      o.texto += I ? ' Cotizada con referencias: ' + (I.referencia_pct || 0) + ' % del costo' + (I.alertas.total ? ', ' + IN.textoAlertas(I) : '') + ' (aceptado).'
        : ' Cotizada con referencias: ' + R.pct + ' % del costo' + (R.n3 ? ', ' + R.n3 + ' alerta' + (R.n3 === 1 ? '' : 's') + ' N3' : '') + ' (aceptado).';
    }
    return { ok: true, resultado: o };
  }

  // ── V1.62a · la elección de la oportunidad queda en el caso (`oportunidad_v162`) ──
  /** La elección guardada en el caso (hilo.oportunidad_elegida), lista para orden-odoo: {modo:'crear', nombre} o {modo:'ligar', id}. */
  function eleccionGuardada(H) {
    var e = H && H.oportunidad_elegida; if (!e || !e.modo) return null;
    if (e.modo === 'ligar' && Number(e.id) > 0) return { modo: 'ligar', id: Number(e.id) };
    if (e.modo === 'crear' && String(e.nombre || '').length >= 3) return { modo: 'crear', nombre: String(e.nombre) };
    return null;
  }
  /** Guarda la elección en el caso (evento sin trabajo). Si no se pudo, no frena la orden: se intenta como en la V1.59. */
  async function guardarEleccion(caso, el) {
    try { await C.evento({ caso_id: caso.id, tipo: 'oportunidad_elegida', datos: { modo: el.modo, id: el.id || null, nombre: el.nombre || null, creada: el.creada === true } }); } catch (e) { /* sigue */ }
  }

  // ── V1.59 · la oportunidad de la orden ─────────────────────────────────
  /** ¿El machote ya está ligado a una oportunidad? (comercial.machote.odoo_lead_id, la escribe SOLO comercial/oportunidades). */
  async function oportunidadDelMachote(machoteId) {
    var l = await C.suite('/webhook/comercial/machotes-leer', {});
    if (!l.ok || !Array.isArray(l.machotes)) return { ok: false, error: l.error || 'SIN_LECTURA', mensaje: l.mensaje || 'No se pudo leer el machote para ver su oportunidad.' };
    var f = l.machotes.filter(function (x) { return x && x.id === machoteId; })[0];
    return { ok: true, lead_id: f && Number(f.odoo_lead_id) > 0 ? Number(f.odoo_lead_id) : null, version: f ? Number(f.version) || 0 : 0 };
  }
  /** La ventana: las del cliente (puntuadas por el servidor) o «Crear» con el nombre del caso. NO escribe nada: devuelve la
   *  elección ({modo:'ligar', id} o {modo:'crear', nombre}) y orden-odoo la valida, la crea o la liga al escribir la orden. */
  function elegirOportunidad(caso, ctx) {
    // El nombre de la persona, no su usuario de la suite («Francisco Montalvo», no «francisco.montalvo»).
    var esNombre = function (x) { return !!x && /\s/.test(String(x).trim()) && !/^[a-z0-9._-]+$/.test(String(x).trim()); };
    var S1 = G.SuiteAuth.getSession() || {}, dueno = (esNombre(caso.autor_nombre) && caso.autor_nombre) || (caso.autor && caso.autor === S1.actor && esNombre(S1.nombre) && S1.nombre) ||
      String(caso.autor || 'el dueño del caso').split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); });
    // V1.62a (#12 6353778672, `oportunidad_v162`) · el nombre sugerido ya escrito: el título del caso (el agente lo pone en cuanto hay
    // machote, «Cliente · alcance · ciudad»), nunca «Cotización nueva»; sin título con sentido, el cliente y el folio.
    var tit = String(caso.titulo || '').trim(), deOrigen = /^(cotizaci[oó]n nueva|new quote)?$/i.test(tit);
    var sugerido = prendido('oportunidad_v162') && deOrigen ? [caso.cliente, caso.machote_folio].filter(Boolean).join(' · ') : tit;
    return new Promise(async function (listo) {
      ctx.modal('<h3>¿De qué oportunidad es esta cotización?</h3><p class="sub">La orden en Odoo va ligada a su oportunidad. Elige una del cliente o crea una a nombre de ' + esc(dueno) + '.</p><div id="opLista"><p class="sub">Buscando las del cliente…</p></div>');
      var c = caso.cliente_odoo_id ? await C.suite('/webhook/comercial/oportunidades', { modo: 'candidatas', cliente_id: Number(caso.cliente_odoo_id), q: sugerido || '', limite: 8 }) : { ok: true, candidatas: [] };
      var L = (c.ok && Array.isArray(c.candidatas)) ? c.candidatas : [];
      var caja = document.getElementById('opLista'); if (!caja) return listo({ ok: false, error: 'SIN_OPORTUNIDAD' });
      var fila = 'display:flex;gap:8px;align-items:flex-start;margin:6px 0;cursor:pointer', rad = 'flex:0 0 auto;margin-top:3px';
      caja.innerHTML = (L.length ? '<div class="op-lista" role="radiogroup">' + L.map(function (o, i) { return '<label style="' + fila + '"><input style="' + rad + '" type="radio" name="opSel" value="' + Number(o.id) + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + esc(o.nombre) + '</b> <small>' + esc([o.etapa, o.por_que].filter(Boolean).join(' · ')) + '</small></span></label>'; }).join('') + '</div>' :
          '<p class="sub">' + esc(c.ok ? 'Este cliente no tiene oportunidades abiertas.' : (c.mensaje || 'No se pudieron leer las del cliente.')) + '</p>') +
        '<label style="' + fila + '"><input style="' + rad + '" type="radio" name="opSel" value="nueva"' + (L.length ? '' : ' checked') + '><span><b>Crear una nueva</b> <small>a nombre de ' + esc(dueno) + '</small></span></label>' +
        '<label class="lb">Nombre de la oportunidad nueva<input id="opNom" maxlength="240" value="' + esc(sugerido || '') + '"></label>' +
        '<p class="err-bt" id="opErr" hidden></p><div class="acc der"><button class="boton" id="opNo">Cancelar</button><button class="boton si" id="opOk">Seguir</button></div>';
      var err = function (t) { var e = document.getElementById('opErr'); e.textContent = t; e.hidden = !t; };
      document.getElementById('opNo').onclick = function () { ctx.cerrarModal(); listo({ ok: false, error: 'SIN_OPORTUNIDAD', mensaje: 'No se creó el borrador: falta elegir la oportunidad.' }); };
      document.getElementById('opOk').onclick = async function () {
        var b = this, sel = (document.querySelector('input[name="opSel"]:checked') || {}).value, lead = Number(sel) || 0;
        b.disabled = true; err('');
        if (sel === 'nueva') {
          var nom = document.getElementById('opNom').value.trim();
          if (nom.length < 3) { b.disabled = false; return err('Escribe el nombre de la oportunidad.'); }
          ctx.cerrarModal(); return listo({ ok: true, oportunidad: { modo: 'crear', nombre: nom } });
        }
        if (!lead) { b.disabled = false; return err('Elige una oportunidad.'); }
        ctx.cerrarModal(); listo({ ok: true, oportunidad: { modo: 'ligar', id: lead } });
      };
    });
  }

  // ── «Ya la mandé»: state=sent, sin correo desde Odoo ─────────────────────
  async function enviada(a, ctx) {
    var o = ordenDe(ctx.hilo);
    if (!o) return { ok: true, resultado: { texto: 'Marcada como enviada al cliente (no hay cotización en Odoo de este caso).' } };
    var p = await permiso();
    if (!p.habilitado) return { ok: true, resultado: { texto: 'Marcada como enviada aquí. En Odoo la marca quien tiene la emisión habilitada: ' + (o.orden_nombre || o.orden_id) + '.' } };
    // V1.63b C (`secciones_v163`) · «Ya la mandé» solo con todas las secciones del machote revisadas en la vista ejecutiva.
    if (prendido('secciones_v163')) {
      var Hs = ctx.hilo || {}, Ms = ((Hs.propuesta || Hs.ultima || {}).machote) || {}, rev = (Hs.secciones_revisadas || []).map(function (x) { return x && x.seccion; });
      var faltan = (Ms.secciones || []).map(function (x, i) { return x.nombre || 'Sección ' + (i + 1); }).filter(function (n) { return rev.indexOf(n) < 0; });
      if (faltan.length) return { ok: false, mensaje: 'Antes de «Ya la mandé» revisa ' + (faltan.length === 1 ? 'la sección ' : 'las secciones ') + faltan.map(function (n) { return '«' + n + '»'; }).join(', ') +
        ' en la vista ejecutiva (⋮ → Vista ejecutiva) y márcalas revisadas.' };
    }
    // V1.62b (`revision_v162b`, #12 resultado 8) · la revisión final, una sola vez: cuadre, hitos, PDF vigente y, si hay, las referencias.
    var rv = prendido('revision_v162b') ? await revisionFinal(ctx, o) : null;
    if (rv && !rv.ok) return rv;
    var r = await C.suite(RUTA_ORDEN, { modo: 'enviada', machote_id: ctx.caso.machote_id, caso_id: ctx.caso.id, acepta_referencias: !!(rv && rv.acepta) }, 60000);
    if (!r.ok) return { ok: false, mensaje: r.mensaje || ('No se marcó como enviada en Odoo: ' + (r.error || 'error')) };
    if (r.estado !== 'sent') return { ok: false, mensaje: 'Odoo dice que ' + (r.odoo_so_name || '') + ' quedó en «' + r.estado + '», no en «Cotización enviada». No se marcó.' };
    var x = releido(r);
    x.texto = (r.odoo_so_name || '') + ' quedó como «Cotización enviada» en Odoo, sin mandar correo desde Odoo. El correo lo mandas tú.';
    if (rv && rv.registro) { x.revision_final = rv.registro; if (rv.registro.referencias) x.texto += ' Se envió con ' + rv.registro.referencias.pct + ' % del costo en precios de referencia (aceptado en la revisión final).'; }
    return { ok: true, resultado: x };
  }
  /** V1.62b · la revisión final antes de «Ya la mandé»: lo que ya cuadra (machote = Odoo, nota = hitos, el PDF vigente) y, si hay
   *  precios de referencia, su % y sus renglones con un solo «Acepto». Queda en el hilo (quién, cuándo, qué %). */
  function revisionFinal(ctx, o) {
    var H = ctx.hilo || {}, acc = H.acciones || [];
    var b = acc.filter(function (x) { return x.tipo === 'crear_borrador' && x.estado === 'hecha'; }).pop() || {};
    var cm = acc.filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop() || {};
    var R = (b.datos || {}).referencias || (cm.datos || {}).referencias || null, conRef = !!(R && R.n);
    var din = function (n) { return n == null || n === '' ? '¿?' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var tM = Number((cm.resultado || {}).total || ((cm.datos || {}).resumen || {}).total), tO = Number(o.subtotal);
    var cuadra = isFinite(tM) && isFinite(tO) && Math.abs(Math.ceil(tM - 0.005) - tO) <= ((o.renglones || []).length || 1);
    var P = H.ultimo_pdf || null, S = G.SuiteAuth.getSession() || {};
    var lin = function (okk, t, sub) { return '<li class="' + (okk ? 'rf-si' : 'rf-no') + '">' + (okk ? '✓ ' : '⚠ ') + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</li>'; };
    return new Promise(function (listo) {
      ctx.modal('<h3>Revisión final antes de enviar ' + esc(o.orden_nombre || '') + '</h3>' +
        '<p class="sub">' + din(o.subtotal) + ' más IVA · queda en el hilo con tu nombre y la hora.</p><ul class="rf-lista">' +
        lin(cuadra, 'Machote y Odoo cuadran', din(tM) + ' en el machote · ' + din(tO) + ' en Odoo (al peso, renglón por renglón)') +
        lin(true, 'Nota y tabla de hitos dicen lo mismo', 'el servidor no escribe la orden si no') +
        lin(true, P ? 'El PDF es la versión vigente' : 'El PDF se genera al descargarlo', P ? (P.orden_nombre || '') + ' v' + P.version + ' · ' + new Date(P.at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</ul>' +
        (conRef ? '<div class="rf-ref"><b>Se envía con ' + esc(R.pct) + ' % del costo en precios de referencia</b> (N3 ' + esc(R.n3 || 0) + ' · N4 ' + esc(R.n4 || 0) + ', ' + din(R.importe) + '). ' +
          'El agente sigue buscando precio de proveedor; si lo encuentra, te avisa.</div>' : '') +
        '<div class="acc der"><button class="boton" id="rfNo">Todavía no</button><button class="boton si" id="rfSi">' + (conRef ? 'Acepto las referencias · Ya la mandé' : 'Ya la mandé al cliente') + '</button></div>');
      document.getElementById('rfNo').onclick = function () { ctx.cerrarModal(); listo({ ok: false, mensaje: 'No se marcó como enviada.' }); };
      document.getElementById('rfSi').onclick = function () { ctx.cerrarModal();
        listo({ ok: true, acepta: conRef, registro: { por: S.actor || null, at: new Date().toISOString(), cuadra: cuadra, pdf: P ? { orden: P.orden_nombre, version: P.version } : null,
          referencias: conRef ? { pct: R.pct, n3: R.n3 || 0, n4: R.n4 || 0, importe: R.importe } : null } }); };
    });
  }

  // ── alta de contacto o empresa ──────────────────────────────────────────
  function altaContacto(a, ctx) {
    var d = a.datos || {}, esEmpresa = !d.empresa_id && !ctx.caso.cliente_odoo_id;
    return new Promise(function (listo) {
      ctx.modal('<h3>' + (esEmpresa ? 'Dar de alta la empresa en Odoo' : 'Dar de alta el contacto en Odoo') + '</h3>' +
        '<p class="sub">Se crea con tu clic y queda a tu nombre en las notas del contacto. Si ya existe, no se crea otro.</p>' +
        (esEmpresa ? '<label class="lb">Empresa<input id="aNom" maxlength="120" value="' + esc(d.empresa || ctx.caso.cliente || '') + '"></label>'
          : '<label class="lb">Puesto<input id="aPue" maxlength="120" value="' + esc(d.puesto || '') + '"></label>' +
            '<label class="lb">Nombre (si lo sabes)<input id="aNom" maxlength="120"></label>') +
        '<label class="lb">Correo (opcional)<input id="aCor" type="email" maxlength="120"></label>' +
        '<label class="lb">Teléfono (opcional)<input id="aTel" type="tel" maxlength="40"></label>' +
        '<div class="acc der"><button class="boton" id="aNo">Cancelar</button><button class="boton si" id="aOk">Dar de alta</button></div>');
      var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
      document.getElementById('aNo').onclick = function () { ctx.cerrarModal(); listo({ ok: false }); };
      document.getElementById('aOk').onclick = async function () {
        this.disabled = true;
        var r = await C.alta({ tipo: esEmpresa ? 'empresa' : 'contacto', empresa_id: esEmpresa ? '' : String(d.empresa_id || ctx.caso.cliente_odoo_id),
          nombre: v('aNom'), puesto: v('aPue'), email: v('aCor'), telefono: v('aTel') });
        if (!r.ok) { this.disabled = false; ctx.toast(r.mensaje || ('No se dio de alta: ' + (r.error || 'error'))); return; }
        ctx.cerrarModal();
        listo({ ok: true, resultado: { contacto_id: r.contacto_id, ya_existia: !!r.ya_existia, puesto: v('aPue') || null,
          texto: (r.ya_existia ? 'Ya existía en Odoo (id ' : 'Dado de alta en Odoo (id ') + r.contacto_id + ')' } });
      };
    });
  }

  // ── V1.55 (`ficha_cliente`, #12 Mejora 5) · «Esto voy a poner en la ficha de <cliente>» ─────────────────
  /* La tarjeta enseña lo que va a quedar en Odoo (razón social, RFC, dirección fiscal, régimen y el contacto por su
   * puesto). El clic abre el modal: primero BUSCA (RFC exacto → alias conocido → nombre parecido) y, si encuentra, propone
   * ligar en vez de crear. Escribe solo con «Ligar…» o «Crear», relee la ficha y compara. El contacto se da de alta como
   * hijo de la empresa con odoo-alta; su correo y su teléfono se escriben aquí y van del navegador a Odoo: nunca al repo. */
  var REGIMEN = { '601': 'General de Ley Personas Morales', '603': 'Personas Morales con Fines no Lucrativos', '612': 'Personas Físicas con Actividades Empresariales y Profesionales', '626': 'Régimen Simplificado de Confianza' };
  function fichaCampos(d, caso) {
    var dir = d.direccion || {};
    return { razon_social: d.razon_social || '', nombre: d.nombre || caso.cliente || '', rfc: String(d.rfc || '').toUpperCase().replace(/[\s-]/g, ''),
      calle: dir.calle || '', ciudad: dir.ciudad || '', cp: dir.cp || '', estado: dir.estado || '', pais: dir.pais === 'usa' || caso.pais === 'usa' ? 'usa' : 'mx',
      regimen: d.regimen ? String(d.regimen) : '', alias_id: d.alias_id ? String(d.alias_id) : '' };
  }
  function fichaHtml(d, caso) {
    var f = fichaCampos(d || {}, caso || {}), c = (d && d.contacto) || {};
    var fila = function (k, v) { return v ? '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>' : ''; };
    return '<dl class="cz-ficha">' + fila('Razón social', f.razon_social) + fila('RFC', f.rfc) +
      fila('Dirección fiscal', [f.calle, f.ciudad, f.cp, f.estado].filter(Boolean).join(', ')) +
      fila('Régimen', f.regimen ? f.regimen + (REGIMEN[f.regimen] ? ' · ' + REGIMEN[f.regimen] : '') : '') +
      fila('Contacto', [c.puesto, c.nombre].filter(Boolean).join(' · ') + (c.puesto || c.nombre ? ' · hijo de la empresa' : '')) + '</dl>';
  }
  function actualizarCliente(a, ctx) {
    var d = a.datos || {}, caso = ctx.caso || {}, f = fichaCampos(d, caso), c = d.contacto || {};
    return new Promise(function (listo) {
      ctx.modal('<h3>Ficha de ' + esc(f.nombre || f.razon_social) + ' en Odoo</h3>' + fichaHtml(d, caso) +
        '<div id="fBus" class="nota">Buscando si ya existe en Odoo…</div>' +
        (c.puesto || c.nombre ? '<label class="lb">Correo del contacto (opcional, no se guarda en el repo)<input id="fCor" type="email" maxlength="120" autocomplete="off"></label>' +
          '<label class="lb">Teléfono (opcional, no se guarda en el repo)<input id="fTel" type="tel" maxlength="40" autocomplete="off"></label>' : '') +
        '<div class="acc der" id="fAcc"><button class="boton" id="fNo">Cancelar</button></div>');
      var cerrar = function (x) { ctx.cerrarModal(); listo(x); };
      document.getElementById('fNo').onclick = function () { cerrar({ ok: false }); };
      var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
      var escribir = async function (btn, partnerId) {
        btn.disabled = true;
        var r = await C.ficha('escribir', Object.assign({}, f, { partner_id: partnerId ? String(partnerId) : '' }));
        if (!r.ok) { btn.disabled = false; ctx.toast(r.mensaje || ('No se escribió en Odoo: ' + (r.error || 'error'))); return; }
        var res = { partner_id: r.partner_id, partner_nombre: r.partner_nombre, ligada: !!partnerId, creada: !!r.creada, leido: r.leido, cambio: r.cambio || null,
          texto: (partnerId ? 'Ligada y actualizada' : 'Creada') + ' en Odoo: ' + r.partner_nombre + ' (id ' + r.partner_id + ')' };
        if (c.puesto || c.nombre) {
          var k = await C.alta({ tipo: 'contacto', empresa_id: String(r.partner_id), nombre: c.nombre || '', puesto: c.puesto || '', email: v('fCor'), telefono: v('fTel') });
          if (k.ok) { res.contacto_id = k.contacto_id; res.texto += ' · contacto ' + (k.ya_existia ? 'ya existía' : 'dado de alta') + ' (id ' + k.contacto_id + ')'; }
          else res.texto += ' · el contacto no se dio de alta: ' + (k.mensaje || k.error || 'error');
        }
        cerrar({ ok: true, resultado: res });
      };
      C.ficha('buscar', f).then(function (r) {
        var bus = document.getElementById('fBus'), acc = document.getElementById('fAcc'); if (!bus || !acc) return;
        if (!r.ok) { bus.textContent = 'No se pudo buscar en Odoo: ' + String(r.mensaje || r.error || 'error').replace(/[.\s]+$/, '') + '. No se escribe nada.'; return; }
        var L = r.candidatos || [], fuerte = L.filter(function (x) { return x.por === 'rfc' || x.por === 'alias'; })[0], POR = { rfc: 'el RFC', alias: 'el alias conocido', nombre: 'nombre parecido' };
        bus.innerHTML = !L.length ? 'No hay ninguna empresa con ese RFC ni con ese nombre en Odoo: se crea una nueva.' :
          '<b>Ya existe en Odoo:</b><ul>' + L.slice(0, 4).map(function (x) { return '<li><label><input type="radio" name="fPar" value="' + esc(x.id) + '"' + (x === (fuerte || L[0]) ? ' checked' : '') + '> ' +
            esc(x.nombre) + ' (id ' + esc(x.id) + (x.rfc ? ' · ' + esc(x.rfc) : '') + ') · por ' + esc(POR[x.por] || x.por) + '</label></li>'; }).join('') + '</ul>Propongo ligarla en vez de crear otra.';
        var b1 = document.createElement('button'); b1.className = 'boton si';
        b1.textContent = L.length ? 'Ligar y actualizar' : 'Crear en Odoo';
        b1.onclick = function () { var sel = document.querySelector('input[name="fPar"]:checked'); escribir(b1, L.length && sel ? Number(sel.value) : 0); };
        acc.appendChild(b1);
        if (L.length && !fuerte) { var b2 = document.createElement('button'); b2.className = 'boton'; b2.textContent = 'Crear otra'; b2.onclick = function () { escribir(b2, 0); }; acc.appendChild(b2); }
      });
    });
  }

  // ── lo que ve el cliente ────────────────────────────────────────────────
  function md(t) {
    return esc(t).split('\n').map(function (l) {
      var x = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^#{1,4}\s/.test(l)) return '<h4>' + x.replace(/^#+\s/, '') + '</h4>';
      if (/^\s*([-*•]|\d+\.)\s+/.test(l)) return '<li>' + x.replace(/^\s*([-*•]|\d+\.)\s+/, '') + '</li>';
      return x.trim() ? '<p>' + x + '</p>' : '';
    }).join('');
  }
  /** Vista imprimible: una línea por sección, notas, total, opciones aparte y el resumen. Sin costo. */
  async function pdfCliente(entrega, caso) {
    var moneda = caso.pais === 'usa' ? 'USD' : 'MXN', b = [];
    try { b = await bloques({ secciones: entrega.secciones }, caso); } catch (e) {
      b = (entrega.secciones || []).map(function (s) { return { tipo: 'linea', texto: s.nombre, cantidad: 1, precio: s.precio }; });
    }
    var total = b.reduce(function (t, x) { return x.tipo === 'linea' ? t + (Number(x.cantidad) || 0) * (Number(x.precio) || 0) : t; }, 0);
    var filas = b.map(function (x) {
      if (x.tipo === 'seccion') return '<tr class="sec"><td colspan="2">' + esc(x.texto) + '</td></tr>';
      if (x.tipo === 'linea') return '<tr><td>' + esc(x.texto) + '</td><td class="r">' + dinero((x.cantidad || 1) * x.precio) + '</td></tr>';
      return '<tr class="nt"><td colspan="2">' + esc(x.texto).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('');
    return '<div class="pdf"><div class="pdf-cab"><b>' + esc(caso.titulo) + '</b><span>' + esc(caso.cliente || '') + '</span></div>' +
      '<div class="pdf-md">' + md(entrega.resumen) + '</div>' +
      '<table class="tabla pdf-t"><tr><th>Concepto</th><th class="r">Importe ' + moneda + '</th></tr>' + filas +
      '<tr class="tot"><td>Total antes de IVA</td><td class="r">' + dinero(total) + '</td></tr></table>' +
      ((entrega.opciones || []).length ? '<p class="nota"><b>Opciones aparte (se elige una):</b> ' + entrega.opciones.map(function (o) { return esc(o.nombre) + ' ' + dinero(o.precio); }).join(' · ') + '</p>' : '') +
      '</div>';
  }

  G.CzAcciones = { cargarCalc: cargarCalc, crear_machote: crearMachote, crear_borrador: crearBorrador, alta_contacto: altaContacto, actualizar_cliente: actualizarCliente, fichaHtml: fichaHtml, enviada: enviada,
    pendientes: pendientes, textoPendientes: textoPendientes, permiso: permiso, ordenDe: ordenDe,
    _pdfCliente: pdfCliente, _bloques: bloques, _releido: releido };
})(window);
