/* ═══ Machote · pasar la cotización a orden, y mandarla al cliente ═══
 *
 * ⚠️ ESTO ES UN CASCARÓN. No habla con Odoo, no manda correo, no escribe
 * nada en ningún lado. Existe para tres cosas concretas:
 *
 *   1. Que se vea y se recorra el camino completo antes de construirlo, y
 *      que Esteban pueda decir "aquí falta esto" mirándolo, no leyéndolo.
 *   2. Que quede escrito el CONTRATO DE SALIDA —qué campos exactos
 *      necesitaría un webhook `comercial/orden-crear`— y, sobre todo, cuáles
 *      salen del machote y cuáles no puede saber nadie más que quien captura.
 *   3. Que el prellenado y las cuentas sean REALES: los renglones, los
 *      importes y el reparto salen del motor (`calc.js`), no de números
 *      escritos a mano. Un cascarón con cifras inventadas no enseña nada.
 *
 * Cada pantalla lo dice en su propia cabecera: no hay forma de apretar algo
 * aquí y creer que pasó de verdad.
 *
 * ── LO QUE NO SE PUEDE HACER TODAVÍA, Y POR QUÉ ──────────────────────────
 * Mandar el correo DESDE el vendedor no está a un botón de distancia. La
 * aplicación de Microsoft Graph que ya usa la suite (`n8n-mail-sender`)
 * tiene una Application Access Policy que la limita a UN buzón:
 * `sales@fts.mx`. Mandar como Montalvo o como Ricardo exige permisos nuevos
 * en Azure que hoy no existen. Eso no es una tarea de código: es una
 * decisión de Esteban. Está en la pantalla, con sus dos caminos.
 *
 * ── LA REGLA QUE GOBIERNA LA PANTALLA DE ENVÍO ───────────────────────────
 * «La marca de enviada debe dispararse por el envío confirmado, nunca por
 * el clic.» Es la misma lección del kiosko (CLAUDE.md hallazgo #15): la UI
 * que pinta el éxito antes de que el servidor conteste es corrupción
 * silenciosa — el vendedor cree que su cotización salió y no salió. Por eso
 * aquí el botón NO marca nada: deja el estado en "esperando confirmación" y
 * dice quién escribe la marca (el servidor, con el id del mensaje).
 */
(function (G) {
  'use strict';

  var C = null;                        // MachoteCalc, se toma al abrir

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function mx(n, moneda) {
    if (n === null || n === undefined || !isFinite(Number(n))) return '—';
    return (moneda === 'USD' ? 'US$' : '$') +
      Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pc(n) {
    return (n === null || n === undefined) ? '—'
      : (Number(n) * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }
  function hoyMas(dias) {
    var d = new Date(); d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ── Lo que se captura A MANO, porque el machote no lo sabe ──────────────
   * Ésta es la mitad interesante del contrato: el machote es un documento de
   * COSTEO, y una orden de venta necesita cosas que el costeo nunca tuvo.
   * Se declaran aquí, en un solo lugar, para que el día que exista el
   * webhook no haya que ir a buscarlas por la pantalla. */
  var A_MANO = [
    { id: 'condiciones_pago', etiqueta: 'Condiciones de pago', tipo: 'select',
      opciones: ['Anticipo 50% / 50% contra entrega', 'Crédito 30 días',
                 'Crédito 60 días', 'Contado', 'Anticipo 60% / 40% contra entrega'],
      valor: 'Anticipo 50% / 50% contra entrega',
      nota: 'Se negocia por cliente. El machote nunca la tuvo.' },
    { id: 'validez_hasta', etiqueta: 'La cotización vence el', tipo: 'date',
      valor: null,
      nota: 'Por omisión 30 días. Con precios de material volátiles suele ser menos.' },
    { id: 'referencia_cliente', etiqueta: 'Referencia / OC del cliente', tipo: 'text',
      valor: '', nota: 'La que trae el cliente. Casi nunca existe al cotizar.' },
    { id: 'tiempo_entrega', etiqueta: 'Tiempo de entrega', tipo: 'text',
      valor: '', nota: 'Ej. «6 semanas a partir del anticipo». Depende de compras.' },
    { id: 'notas', etiqueta: 'Notas para el cliente', tipo: 'textarea',
      valor: '', nota: 'Va en el cuerpo de la cotización. No es la nota interna.' }
  ];

  var _st = null;      // el estado de la sesión del cascarón

  /* ── El prellenado: TODO sale del motor ─────────────────────────────────
   * Ni un número escrito a mano. Si el machote cambia, esto cambia — que es
   * justo lo que hay que poder ver antes de construir el puente de verdad. */
  function prellenar(m) {
    var c = C.calcular(m);
    var emp = C.empresaDe(m);

    /* UNA LÍNEA POR SECCIÓN. Es la forma que ya tiene el machote: el detalle
     * de materiales es COSTEO INTERNO y no se le manda al cliente renglón por
     * renglón (ahí van los precios de compra). La sección es la unidad que el
     * cliente reconoce y la que el machote ya sabe valuar por sí sola. */
    var lineas = c.secciones.map(function (s, i) {
      return {
        n: i + 1,
        nombre: s.nombre || ('SECCIÓN ' + (i + 1)),
        cantidad: 1,
        unidad: 'Servicio',
        precio: s.precio,
        importe: s.precio,
        // Para el que revisa: de dónde salió ese precio.
        detalle: {
          costo_mo: s.costoMo, costo_mat: s.costoMat,
          horas: s.horas, partidas: (s.partidas_usadas === undefined ? null : s.partidas_usadas)
        }
      };
    });

    return {
      machote_id: m.id,
      // Empresa emisora: decide la moneda y el catálogo de Odoo.
      empresa: { id: emp.id, nombre: emp.nombre, corto: emp.corto },
      cliente: { odoo_partner_id: m.cliente_id || null, nombre_respaldo: m.cliente || '' },
      moneda: m.moneda,
      tc: C.tcEfectivo(m) || null,
      tc_fuente: m.tc_fuente || '',
      escenario: c.escenario.id,
      lineas: lineas,
      totales: {
        subtotal_antes_comisiones: c.venta,
        comision_fts: c.escenario.comisionFts,
        comision_cliente: c.escenario.comisionCliente,
        total: c.precio,
        costo: c.costo,
        utilidad: c.utilidad,
        margen: c.margen
      },
      // Lo que el machote SÍ sabe y una orden necesita.
      referencias: { so_ligada: m.so || null, analista: m.analista || '',
                     capturado_por: m.creado_por || '' },
      _calc: c
    };
  }

  function cerrar() { var d = document.getElementById('modalOrden'); if (d) d.remove(); }

  function cascaron(cuerpo) {
    var viejo = document.getElementById('modalOrden'); if (viejo) viejo.remove();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal" id="modalOrden"><div class="caja orden">' + cuerpo + '</div></div>');
    var d = document.getElementById('modalOrden');
    d.addEventListener('click', function (e) { if (e.target === d) cerrar(); });
    var x = document.getElementById('or-x');
    if (x) x.onclick = cerrar;
  }

  /* ── Lo que HOY impediría crear la orden ────────────────────────────────
   * Se calcula, no se escribe: sale del machote y del revisor que ya existe
   * (`reglas.js`). El cascarón no sirve de nada si enseña un camino despejado
   * cuando el camino real está tapado — el valor de mirarlo antes de
   * construirlo es justamente ver el tapón.
   *
   * Se separan los que dependen de la CAPTURA (los arregla el analista hoy)
   * de los que dependen del SISTEMA (no los arregla nadie apretando botones).
   */
  function estorbos(m, pre) {
    var de_captura = [], de_sistema = [];
    var R = G.REGLAS, c = pre._calc;

    if (!pre.cliente.odoo_partner_id) {
      de_captura.push('No hay cliente del catálogo de Odoo. Sin `partner_id` la orden ' +
        'no se puede crear: Odoo no acepta una venta sin a quién.');
    }
    if (c.costoIncompleto) {
      de_captura.push(c.huecos + ' hueco(s) en el costeo (renglones sin precio o sin ' +
        'tarifa). El precio de arriba sale de un costo incompleto.');
    }
    if (c.mezclaMoneda) {
      de_captura.push('El machote mezcla monedas en sus renglones. Se convierte con el ' +
        'TC, pero conviene revisarlo antes de mandarlo a Odoo.');
    }
    if (R && R.revisar) {
      var rev = R.revisar(m);
      if (rev.duras && rev.duras.length) {
        de_captura.push(rev.duras.length + ' regla(s) dura(s) sin resolver. Están en Revisar.');
      }
    }

    de_sistema.push('El webhook `comercial/orden-crear` NO existe. Es lo que faltaría ' +
      'construir; el contrato de abajo es su especificación.');
    /* Ojo con cómo se dice esto: la credencial de Odoo en n8n SÍ escribe —ya
     * crea proyectos, cuentas analíticas y presupuestos al confirmar una SO
     * (CLAUDE.md §17)—. Lo que no existe es la DECISIÓN de que la suite emita
     * órdenes de venta, ni el workflow que lo haga. Decir «no hay permiso»
     * sería inventar un impedimento técnico donde hay uno de criterio. */
    de_sistema.push('Nadie ha decidido todavía que la suite EMITA órdenes de venta. ' +
      'La credencial de Odoo en n8n sí escribe (ya crea proyectos y presupuestos), ' +
      'pero crear una venta es otra cosa y la decide Esteban.');

    return { de_captura: de_captura, de_sistema: de_sistema };
  }

  /* ══ PANTALLA 1 · el configurador ═══════════════════════════════════════ */

  function bloqueEstorbos() {
    var e = estorbos(_st.machote, _st.pre);
    var lista = function (titulo, arr, clase) {
      if (!arr.length) return '';
      return '<div class="est ' + clase + '"><strong>' + esc(titulo) + '</strong><ul>' +
        arr.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
    };
    if (!e.de_captura.length && !e.de_sistema.length) return '';
    return '<details class="estorbos"' + (e.de_captura.length ? ' open' : '') + '>' +
      '<summary>Lo que hoy impediría crear esta orden' +
      (e.de_captura.length ? ' · <strong>' + e.de_captura.length + ' de captura</strong>' : '') +
      '</summary>' +
      lista('Se arregla capturando', e.de_captura, 'captura') +
      lista('No se arregla aquí', e.de_sistema, 'sistema') +
      '</details>';
  }

  function pintarConfigurador() {
    var p = _st.pre, m = _st.machote;
    var faltaCliente = !p.cliente.odoo_partner_id;

    var filas = p.lineas.map(function (l, i) {
      return '<tr>' +
        '<td class="ln">' + l.n + '</td>' +
        '<td><input class="cel" data-ln="' + i + '" data-campo="nombre" value="' + esc(l.nombre) + '"></td>' +
        '<td class="num"><input class="cel n" data-ln="' + i + '" data-campo="cantidad" ' +
          'type="number" min="0" step="0.01" value="' + esc(l.cantidad) + '"></td>' +
        '<td class="num mono">' + mx(l.precio, p.moneda) + '</td>' +
        '<td class="num mono imp" data-imp="' + i + '">' + mx(l.importe, p.moneda) + '</td>' +
      '</tr>';
    }).join('');

    var campos = A_MANO.map(function (f) {
      var v = _st.aMano[f.id];
      var control;
      if (f.tipo === 'select') {
        control = '<select class="cel" data-mano="' + f.id + '">' +
          f.opciones.map(function (o) {
            return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
          }).join('') + '</select>';
      } else if (f.tipo === 'textarea') {
        control = '<textarea class="cel" rows="2" data-mano="' + f.id + '">' + esc(v || '') + '</textarea>';
      } else {
        control = '<input class="cel" type="' + (f.tipo === 'date' ? 'date' : 'text') +
          '" data-mano="' + f.id + '" value="' + esc(v || '') + '">';
      }
      return '<label class="campo"><span>' + esc(f.etiqueta) + '</span>' + control +
             '<span class="tiny nota">' + esc(f.nota) + '</span></label>';
    }).join('');

    cascaron(
      '<div class="or-cab">' +
        '<div><h3>Pasar a orden de venta <span class="chip demo">demostración</span></h3>' +
        '<div class="tiny nota">' + esc(m.nombre) + ' · ' + esc(m.id) + '</div></div>' +
        '<button class="btn fantasma" id="or-x">Cerrar</button>' +
      '</div>' +

      '<div class="aviso"><strong>Nada de esto llega a Odoo.</strong> Es el camino ' +
      'dibujado para poder verlo antes de construirlo. Los renglones y los importes ' +
      'de abajo <strong>sí son reales</strong>: salen del motor de este machote.</div>' +

      bloqueEstorbos() +

      '<div class="or-grid">' +
        '<div class="or-dato"><span>Empresa</span><strong>' + esc(p.empresa.corto) + '</strong>' +
          '<em class="tiny">del machote</em></div>' +
        '<div class="or-dato"><span>Cliente</span><strong>' +
          (faltaCliente ? '<span class="falta">sin elegir</span>' : esc(_st.clienteNombre)) + '</strong>' +
          '<em class="tiny">' + (faltaCliente ? 'la orden no puede crearse sin él'
                                              : 'id ' + esc(p.cliente.odoo_partner_id) + ' de Odoo') + '</em></div>' +
        '<div class="or-dato"><span>Moneda</span><strong>' + esc(p.moneda) + '</strong>' +
          /* El TC se redondea a cuatro decimales PARA MOSTRARLO. El motor
           * sigue usando el suyo completo: aquí salía `18.951999999999998`,
           * que es la resta de flotantes asomando por la pantalla. */
          '<em class="tiny">' + (p.tc ? 'TC ' + esc(Number(p.tc).toFixed(4)) +
                                        (p.tc_fuente ? ' · ' + esc(p.tc_fuente) : '')
                                      : 'sin conversión') + '</em></div>' +
        '<div class="or-dato"><span>Escenario</span><strong>' +
          esc(p.escenario.replace('_', ' ')) + '</strong><em class="tiny">con el que se calculó</em></div>' +
      '</div>' +

      '<h4 class="or-h">Renglones de la orden</h4>' +
      '<p class="tiny nota">Una línea por sección. El detalle de materiales es costeo ' +
      'interno y no se le manda al cliente renglón por renglón: ahí van los precios de compra.</p>' +
      '<div class="tabla-wrap"><table class="or-t">' +
        '<thead><tr><th>#</th><th>Concepto</th><th class="num">Cant.</th>' +
        '<th class="num">P. unitario</th><th class="num">Importe</th></tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
        '<tfoot><tr><td colspan="4" class="num">Total</td>' +
        '<td class="num mono" id="or-total">' + mx(p.totales.total, p.moneda) + '</td></tr></tfoot>' +
      '</table></div>' +

      '<h4 class="or-h">Lo que el machote no sabe</h4>' +
      '<p class="tiny nota">Estos cinco no están en la cotización porque son de la ' +
      'NEGOCIACIÓN, no del costeo. Es la mitad que siempre se captura a mano.</p>' +
      '<div class="or-campos">' + campos + '</div>' +

      '<div class="or-pie">' +
        '<button class="btn fantasma" id="or-contrato">Ver el contrato de salida</button>' +
        '<button class="btn" id="or-siguiente">Siguiente: mandarla al cliente ›</button>' +
      '</div>' +
      '<div id="or-contrato-caja"></div>');

    // Cantidad × precio, en vivo. Es una cuenta de verdad, no un adorno.
    var recalcular = function () {
      var tot = 0;
      _st.pre.lineas.forEach(function (l, i) {
        l.importe = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);
        tot += l.importe;
        var celda = document.querySelector('[data-imp="' + i + '"]');
        if (celda) celda.textContent = mx(l.importe, _st.pre.moneda);
      });
      var t = document.getElementById('or-total');
      if (t) t.textContent = mx(tot, _st.pre.moneda);
      _st.pre.totales.total_editado = tot;
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-ln]'), function (el) {
      el.oninput = function () {
        var l = _st.pre.lineas[Number(el.dataset.ln)];
        if (!l) return;
        l[el.dataset.campo] = el.dataset.campo === 'cantidad'
          ? (el.value === '' ? 0 : parseFloat(el.value) || 0) : el.value;
        if (el.dataset.campo === 'cantidad') recalcular();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mano]'), function (el) {
      el.onchange = function () { _st.aMano[el.dataset.mano] = el.value; };
      el.oninput  = function () { _st.aMano[el.dataset.mano] = el.value; };
    });

    document.getElementById('or-contrato').onclick = pintarContrato;
    document.getElementById('or-siguiente').onclick = pintarEnvio;
  }

  /* El contrato de salida, a la vista y no enterrado en un documento. Lo que
   * se enseña es el JSON que mandaría el navegador — no una descripción de
   * él: la descripción envejece y el ejemplo no. */
  function pintarContrato() {
    var caja = document.getElementById('or-contrato-caja');
    if (!caja) return;
    if (caja.innerHTML) { caja.innerHTML = ''; return; }
    var p = _st.pre;
    var cuerpo = {
      token: '‹el de la sesión, como en los otros webhooks›',
      machote_id: p.machote_id,
      version_leida: '‹la versión que se está mirando; el servidor rechaza si ya cambió›',
      empresa_id: p.empresa.id,
      partner_id: p.cliente.odoo_partner_id,
      moneda: p.moneda,
      tc: p.tc,
      condiciones_pago: _st.aMano.condiciones_pago,
      validez_hasta: _st.aMano.validez_hasta,
      referencia_cliente: _st.aMano.referencia_cliente,
      tiempo_entrega: _st.aMano.tiempo_entrega,
      notas: _st.aMano.notas,
      lineas: p.lineas.map(function (l) {
        return { nombre: l.nombre, cantidad: l.cantidad, precio_unitario: l.precio };
      })
    };
    caja.innerHTML =
      '<div class="contrato">' +
      '<h4 class="or-h">Contrato de salida · <code>POST comercial/orden-crear</code></h4>' +
      '<p class="tiny nota">Esto es lo que mandaría el navegador. <strong>El webhook no ' +
      'existe todavía</strong>: el contrato se escribe antes para que la pantalla y el ' +
      'servidor no se construyan cada uno por su lado (es lo que trabó el panel de ' +
      'Confirmar Horas en julio).</p>' +
      '<pre class="hist-doc">' + esc(JSON.stringify(cuerpo, null, 2)) + '</pre>' +
      '<h5 class="or-h5">De dónde sale cada cosa</h5>' +
      '<div class="tabla-wrap"><table class="or-t chico">' +
      '<thead><tr><th>Campo</th><th>Origen</th></tr></thead><tbody>' +
      [['machote_id · version_leida', 'del machote · la versión evita pisar a otro'],
       ['empresa_id · moneda · tc', 'del machote (empresa decide moneda)'],
       ['partner_id', 'del machote, si se eligió cliente del catálogo de Odoo'],
       ['lineas[]', 'del MOTOR: una por sección, con su precio calculado'],
       ['condiciones_pago · validez_hasta', 'A MANO — es negociación, no costeo'],
       ['referencia_cliente · tiempo_entrega · notas', 'A MANO — nadie más los sabe']]
        .map(function (r) {
          return '<tr><td class="mono">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      '<p class="tiny nota">Lo que el servidor tendría que devolver: ' +
      '<code>{ ok, odoo_so_id, odoo_so_name, estado }</code>. El <code>odoo_so_id</code> ' +
      'es el que ata la cotización a la orden — y sin él la pantalla no puede decir ' +
      '«enviada», por la misma razón que no puede decirlo por un clic.</p>' +
      '</div>';
  }

  /* ══ PANTALLA 2 · mandarla al cliente ═══════════════════════════════════ */

  /* Los tres estados del correo del vendedor. El de en medio es el real hoy:
   * la app de Graph existe y funciona, pero sólo puede mandar como un buzón. */
  function estadoCorreo() {
    return {
      vinculado: false,
      buzon_unico: 'sales@fts.mx',
      motivo: 'La aplicación de Microsoft Graph que ya usa la suite tiene una ' +
              'Application Access Policy que la limita a un solo buzón.'
    };
  }

  function pintarEnvio() {
    var p = _st.pre, m = _st.machote, cor = estadoCorreo();
    var total = (p.totales.total_editado !== undefined && p.totales.total_editado !== null)
      ? p.totales.total_editado : p.totales.total;

    cascaron(
      '<div class="or-cab">' +
        '<div><h3>Mandarla al cliente <span class="chip demo">demostración</span></h3>' +
        '<div class="tiny nota">' + esc(m.nombre) + ' · ' + mx(total, p.moneda) + ' ' + esc(p.moneda) + '</div></div>' +
        '<button class="btn fantasma" id="or-x">Cerrar</button>' +
      '</div>' +

      '<div class="aviso"><strong>No se manda ningún correo desde aquí.</strong> ' +
      'Ni de prueba. Lo que se ve es el camino y, sobre todo, dónde se atora.</div>' +

      /* El indicador del correo. Se dice el estado REAL y el porqué: un
       * "no vinculado" sin explicación manda al vendedor a buscar un ajuste
       * que no existe. */
      '<div class="corr ' + (cor.vinculado ? 'ok' : 'pend') + '">' +
        '<div class="corr-t"><strong>' +
          (cor.vinculado ? 'Tu correo está vinculado' : 'Tu correo NO está vinculado') +
        '</strong></div>' +
        '<p class="tiny">Hoy la suite sólo puede mandar como <code>' + esc(cor.buzon_unico) +
        '</code>. ' + esc(cor.motivo) + ' Mandar como tú exige <strong>permisos nuevos en ' +
        'Azure que todavía no existen</strong> — no es código, es una decisión.</p>' +
        '<div class="corr-bs">' +
          '<button class="btn fantasma f-min" id="or-vincular">Vincular mi correo</button>' +
          '<button class="btn fantasma f-min" id="or-caminos">¿Qué hace falta?</button>' +
        '</div>' +
        '<div id="or-vinc-caja"></div>' +
      '</div>' +

      '<h4 class="or-h">La cotización</h4>' +
      '<div class="or-pasos">' +
        '<div class="paso"><span class="np">1</span><div>' +
          '<strong>Bajarla en PDF</strong>' +
          '<p class="tiny">Abre la cotización lista para imprimir; desde ahí, ' +
          '«Guardar como PDF». No es un botón de mentiras: eso sí funciona hoy.</p>' +
          '<button class="btn fantasma f-min" id="or-pdf">Ver la cotización para imprimir</button>' +
        '</div></div>' +
        '<div class="paso"><span class="np">2</span><div>' +
          '<strong>Mandarla y marcarla como enviada</strong>' +
          '<p class="tiny">El botón <strong>no marca nada</strong>. La marca la escribe ' +
          'el servidor cuando el correo sale de verdad y devuelve el id del mensaje. ' +
          'Pintar «enviada» al apretar es el error que en el kiosko dejó gente creyendo ' +
          'que había checado salida sin haberlo hecho.</p>' +
          '<button class="btn" id="or-enviar">Enviar al cliente</button>' +
          '<div id="or-envio-estado"></div>' +
        '</div></div>' +
      '</div>' +

      '<div class="or-pie">' +
        '<button class="btn fantasma" id="or-volver">‹ Volver a la orden</button>' +
      '</div>');

    document.getElementById('or-volver').onclick = pintarConfigurador;
    document.getElementById('or-pdf').onclick = imprimible;

    document.getElementById('or-vincular').onclick = function () {
      var c = document.getElementById('or-vinc-caja');
      c.innerHTML = '<div class="aviso bad" style="margin-top:8px">' +
        'No se puede vincular todavía, y decir que sí sería mentir. Falta el permiso ' +
        'en Azure (ver «¿Qué hace falta?»). Este botón queda para cuando exista.</div>';
    };
    document.getElementById('or-caminos').onclick = function () {
      var c = document.getElementById('or-vinc-caja');
      if (c.dataset.abierto === '1') { c.innerHTML = ''; c.dataset.abierto = '0'; return; }
      c.dataset.abierto = '1';
      c.innerHTML =
        '<div class="caminos">' +
        '<div class="cam"><strong>A · Mandar desde el buzón de siempre</strong>' +
          '<p class="tiny">Sale de <code>sales@fts.mx</code> con el vendedor en ' +
          '«responder a». <em>Cero cambios en Azure.</em> El cliente le contesta a ' +
          'quien debe, pero el remitente no es la persona.</p></div>' +
        '<div class="cam"><strong>B · Mandar como cada vendedor</strong>' +
          '<p class="tiny">Ampliar la Application Access Policy a los buzones de ' +
          'comercial, o dar <code>Mail.Send</code> delegado y que cada quien autorice ' +
          'su cuenta. <em>Requiere a Esteban en Azure.</em> Es lo que se ve natural, y ' +
          'también es dar permiso de mandar correo en nombre de una persona.</p></div>' +
        '<p class="tiny nota">Sin decisión, no se construye ninguno de los dos: ' +
        'elegir mal aquí se paga en permisos que después nadie quiere quitar.</p>' +
        '</div>';
    };

    /* El envío. Cuatro estados y el tercero NUNCA llega solo: llega cuando el
     * servidor contesta. Aquí no hay servidor, así que se queda en el segundo
     * y lo dice. Eso ES la demostración. */
    document.getElementById('or-enviar').onclick = function () {
      var b = this, caja = document.getElementById('or-envio-estado');
      b.disabled = true; b.textContent = 'Mandando…';
      caja.innerHTML = '<div class="envio esperando">Esperando la confirmación del servidor…</div>';
      setTimeout(function () {
        b.disabled = false; b.textContent = 'Enviar al cliente';
        caja.innerHTML =
          '<div class="envio parado">' +
          '<strong>Aquí se para, y a propósito.</strong>' +
          '<p class="tiny">No hay a quién preguntarle: el webhook de envío no existe y ' +
          'el permiso de correo tampoco. La cotización <strong>sigue sin marcarse como ' +
          'enviada</strong> — que es exactamente lo correcto, porque no se envió.</p>' +
          '<p class="tiny">Cuando exista, el orden es: el servidor manda → Graph ' +
          'contesta <code>202</code> con el id del mensaje → el servidor escribe la marca ' +
          'y la devuelve → la pantalla la pinta <strong>releyendo</strong>, no recordando ' +
          'que se apretó el botón.</p>' +
          '</div>';
      }, 900);
    };
  }

  /* La cotización lista para imprimir. Se abre en una ventana nueva con su
   * propio HTML: no se puede reusar la hoja del libro, que es de captura y
   * lleva los costos. Al cliente no le va el costo. */
  function imprimible() {
    var p = _st.pre, m = _st.machote;
    var total = (p.totales.total_editado !== undefined && p.totales.total_editado !== null)
      ? p.totales.total_editado : p.totales.total;
    var filas = p.lineas.map(function (l) {
      return '<tr><td>' + esc(l.nombre) + '</td><td class="n">' + esc(l.cantidad) +
        '</td><td class="n">' + mx(l.precio, p.moneda) + '</td><td class="n">' +
        mx(l.importe, p.moneda) + '</td></tr>';
    }).join('');

    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<title>Cotización ' + esc(m.id) + '</title><style>' +
      'body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1c;' +
      'max-width:760px;margin:32px auto;padding:0 20px}' +
      'h1{font-size:19px;margin:0 0 2px}.gris{color:#767676}' +
      'table{width:100%;border-collapse:collapse;margin:18px 0}' +
      'th,td{padding:8px 10px;border-bottom:1px solid #e2e2e2;text-align:left}' +
      'th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#767676}' +
      '.n{text-align:right;font-variant-numeric:tabular-nums}' +
      'tfoot td{font-weight:700;border-bottom:0;border-top:2px solid #1c1c1c}' +
      '.cond{margin-top:22px;font-size:12px}.cond dt{font-weight:600;margin-top:8px}' +
      '.cond dd{margin:0;color:#3d3d3d}' +
      '.sello{margin-top:26px;padding:8px 10px;border:1px dashed #c07a00;color:#c07a00;' +
      'font-size:11px;border-radius:6px}' +
      '@media print{.sello{border-color:#999;color:#666}}' +
      '</style></head><body>' +
      '<h1>' + esc(p.empresa.nombre) + '</h1>' +
      '<div class="gris">Cotización ' + esc(m.id) +
        (p.referencias.so_ligada ? ' · ' + esc(p.referencias.so_ligada) : '') + '</div>' +
      '<p><strong>Cliente:</strong> ' + esc(_st.clienteNombre || 'por definir') + '<br>' +
      '<strong>Proyecto:</strong> ' + esc(m.nombre) + '<br>' +
      '<strong>Moneda:</strong> ' + esc(p.moneda) + '</p>' +
      '<table><thead><tr><th>Concepto</th><th class="n">Cant.</th>' +
      '<th class="n">P. unitario</th><th class="n">Importe</th></tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
      '<tfoot><tr><td colspan="3" class="n">Total</td><td class="n">' +
      mx(total, p.moneda) + ' ' + esc(p.moneda) + '</td></tr></tfoot></table>' +
      '<dl class="cond">' +
      '<dt>Condiciones de pago</dt><dd>' + esc(_st.aMano.condiciones_pago || '—') + '</dd>' +
      '<dt>Vigencia</dt><dd>' + esc(_st.aMano.validez_hasta || '—') + '</dd>' +
      (_st.aMano.tiempo_entrega ? '<dt>Tiempo de entrega</dt><dd>' + esc(_st.aMano.tiempo_entrega) + '</dd>' : '') +
      (_st.aMano.referencia_cliente ? '<dt>Su referencia</dt><dd>' + esc(_st.aMano.referencia_cliente) + '</dd>' : '') +
      (_st.aMano.notas ? '<dt>Notas</dt><dd>' + esc(_st.aMano.notas) + '</dd>' : '') +
      '</dl>' +
      '<div class="sello">Documento de DEMOSTRACIÓN generado desde el machote. ' +
      'No es una cotización emitida: no lleva folio de Odoo ni firma.</div>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) {
      var caja = document.getElementById('or-envio-estado');
      if (caja) caja.innerHTML = '<div class="envio parado">El navegador bloqueó la ' +
        'ventana. Permite las ventanas emergentes de este sitio y vuelve a intentar.</div>';
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  /** Abre el cascarón sobre un machote. */
  function abrir(m) {
    C = G.MachoteCalc;
    if (!C || !m) return;
    var pre = prellenar(m);
    var aMano = {};
    A_MANO.forEach(function (f) { aMano[f.id] = f.valor; });
    if (!aMano.validez_hasta) aMano.validez_hasta = hoyMas(30);
    _st = {
      machote: m, pre: pre, aMano: aMano,
      clienteNombre: G.Clientes ? G.Clientes.nombre(m) : (m.cliente || '')
    };
    pintarConfigurador();
  }

  G.MachoteOrden = { abrir: abrir, cerrar: cerrar, _prellenar: prellenar, _A_MANO: A_MANO };
})(window);
