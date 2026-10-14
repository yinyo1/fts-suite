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
 *   crear_borrador → comercial/orden-crear-v2, detrás del MISMO interruptor
 *                    que el machote (issue #387): apagado, no sale nada.
 *   alta_contacto  → conceptualizador/odoo-alta (busca antes de crear)
 *
 * El PDF al cliente y la orden usan MachoteDocumento de la suite: una línea
 * por sección con su precio, notas de plantilla, y NUNCA el costo.
 */
(function (G) {
  'use strict';
  var C = G.CzCliente;
  /* Igual que `EMITIR_ENCENDIDO` de comercial/machote/js/almacen.js: los dos se
   * encienden juntos, cuando el ciclo de #387 se haya recorrido desde pantalla. */
  var EMITIR_ENCENDIDO = false;
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
  /** Los bloques de la orden: una sección con su línea de precio, como las órdenes reales de FTS. */
  async function bloques(datos, caso) {
    var D = await cargarDocumento();
    await D.plantillas();
    var secs = (datos.secciones || []).map(function (s) { return { nombre: s.nombre, lineas: [{ nombre: s.alcance || s.nombre, cantidad: 1, precio: s.precio }] }; });
    return D.proponer({ empresa_id: caso.pais === 'usa' ? 6 : 1 }, secs, datos.tipo || 'instalacion').bloques;
  }

  // ── crear machote ───────────────────────────────────────────────────────
  async function crearMachote(a, ctx) {
    var d = a.datos || {}, caso = ctx.caso;
    if (!d.documento) return { ok: false, mensaje: 'El motor no mandó el machote. Pídele que lo arme otra vez.' };
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
    res.texto = 'Machote ' + (res.folio || '') + ' creado a tu nombre' + ligado + '. Ábrelo en Comercial → Machote.';
    return { ok: true, resultado: res };
  }

  // ── crear borrador en Odoo ──────────────────────────────────────────────
  async function crearBorrador(a, ctx) {
    var caso = ctx.caso, H = ctx.hilo;
    var cm = (H.acciones || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop();
    if (!caso.machote_id || !cm) return { ok: false, mensaje: 'Primero crea el machote: el borrador sale de él.' };
    if (!EMITIR_ENCENDIDO) {
      return { ok: false, mensaje: 'Crear la orden en Odoo está apagado a propósito, igual que en el machote (issue #387). ' +
        'El borrador está listo: cuando se encienda, este botón lo crea. Mientras, ábrelo desde el machote.' };
    }
    var b = await bloques(a.datos || {}, caso);
    var r = await C.suite('/webhook/comercial/orden-crear-v2', { machote_id: caso.machote_id, version_leida: (cm.resultado || {}).version || 1,
      bloques: G.MachoteDocumento.paraOdoo(b), compromisos: {}, lead_id: caso.oportunidad_id || null }, 60000);
    if (!r.ok || !r.odoo_so_id) return { ok: false, mensaje: r.mensaje || ('No se creó el borrador: ' + (r.error || 'sin orden')) };
    return { ok: true, resultado: { orden_id: r.odoo_so_id, orden_nombre: r.odoo_so_name || null, texto: 'Borrador ' + (r.odoo_so_name || r.odoo_so_id) + ' creado en Odoo.' } };
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

  G.CzAcciones = { crear_machote: crearMachote, crear_borrador: crearBorrador, alta_contacto: altaContacto,
    _pdfCliente: pdfCliente, _bloques: bloques, EMITIR_ENCENDIDO: EMITIR_ENCENDIDO };
})(window);
