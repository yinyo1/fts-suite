/* ═══ Machote · los cinco compromisos comerciales, como CAMPOS ═══════════════
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * Medido sobre las 176 órdenes confirmadas de 2025-2026 de SERVICIOS FTS y de
 * la LLC:
 *
 *     sin términos de pago ......  49 de 176
 *     con incoterm ..............   0 de 176
 *     con fecha comprometida ....   0 de 176
 *     con vigencia escrita ......   1 de 176   (en el texto de una nota)
 *
 * Y la más grande sin términos de pago es SO11771, de 45,854,038.88 MXN.
 *
 * El compromiso comercial SÍ existe —«se incluye fianza de anticipo del 30%»,
 * «precios sujetos a ajuste si el acero sube 5%», «valid for 30 days»— pero
 * vive DENTRO DEL TEXTO de las notas. Ahí nadie lo puede consultar, ni sumar,
 * ni vigilar. Hoy no se puede contestar cuánto hay vendido a 120 días, ni qué
 * cotización venció. Eso no es un problema de disciplina: es que el dato nunca
 * tuvo dónde vivir.
 *
 * Aquí tiene dónde. Y como CAMPO, no como párrafo: la migración 009 les dio
 * columna propia en `comercial.machote` justamente para que la pregunta
 * agregada se pueda contestar con un SELECT y no leyendo notas a mano.
 *
 * ── LA REGLA DURA ───────────────────────────────────────────────────────────
 * Sin los cinco no se deja crear la orden. No es una advertencia amable: es un
 * botón deshabilitado. Una advertencia que se puede ignorar produce justo la
 * tabla de arriba.
 *
 * ── LOS HITOS NO CABEN EN ODOO, Y NO SE FUERZAN ─────────────────────────────
 * `account.payment.term` de Odoo modela «a cuántos días», no «30% al firmar,
 * 40% contra entrega en planta, 30% contra arranque». Forzarlos ahí es
 * exactamente cómo se llegó a los 45 términos que hay hoy, con «30 days» dos
 * veces con ids distintos y uno llamado «.»: cada trato que no cabía se
 * convirtió en un término nuevo.
 *
 * Así que los hitos NO crean términos. Van a `comercial.machote.pago_hitos`
 * (jsonb), y a la orden viajan por dos caminos que no se pisan:
 *   · `payment_term_id` recibe el plazo de CRÉDITO, que es lo que Odoo sabe
 *     modelar y lo que la cobranza necesita para calcular vencimientos.
 *   · Los hitos se escriben como una NOTA al pie del documento, que es donde
 *     el cliente los lee hoy y donde ya los lee bien.
 * Lo que se gana sobre el estado actual no es el texto —ése ya estaba— sino
 * que ahora además está EN CAMPOS y se puede sumar.
 */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Incoterms 2020 ───────────────────────────────────────────────────────
   * Los once, tal cual. No se inventa ninguno y no se recorta la lista: un
   * catálogo corto «para simplificar» es cómo se acaba metiendo EXW donde iba
   * DDP. El id de Odoo NO se guarda: se guarda el CÓDIGO, que es estable y
   * universal, y el servidor lo resuelve contra `account.incoterms` al emitir.
   * Si mañana alguien recrea el catálogo en Odoo, el código sigue valiendo. */
  var INCOTERMS = [
    { c: 'EXW', n: 'En fábrica — el cliente recoge y asume todo desde nuestra puerta' },
    { c: 'FCA', n: 'Franco transportista — entregamos al transportista que designe el cliente' },
    { c: 'FAS', n: 'Franco al costado del buque' },
    { c: 'FOB', n: 'Franco a bordo' },
    { c: 'CFR', n: 'Costo y flete' },
    { c: 'CIF', n: 'Costo, seguro y flete' },
    { c: 'CPT', n: 'Transporte pagado hasta' },
    { c: 'CIP', n: 'Transporte y seguro pagados hasta' },
    { c: 'DAP', n: 'Entregado en lugar — llega al sitio del cliente, sin descargar' },
    { c: 'DPU', n: 'Entregado en lugar descargado' },
    { c: 'DDP', n: 'Entregado con derechos pagados — todo por nuestra cuenta' }
  ];

  /* ── Plazos de crédito ────────────────────────────────────────────────────
   * Una lista CORTA y a propósito. El catálogo de Odoo tiene 45 términos
   * porque cada quien creó el suyo; si esta pantalla ofreciera los 45, el
   * desorden se perpetuaría desde aquí. Se ofrecen los plazos que la operación
   * usa de verdad, y el servidor resuelve a qué `account.payment.term`
   * corresponde cada uno. La limpieza del catálogo de Odoo es decisión de
   * Esteban y de Gerardo, y va aparte: aquí sólo se deja de ensuciarlo. */
  var PLAZOS = [
    { d: 0,   t: 'Contado' },
    { d: 15,  t: 'Crédito 15 días' },
    { d: 30,  t: 'Crédito 30 días' },
    { d: 45,  t: 'Crédito 45 días' },
    { d: 60,  t: 'Crédito 60 días' },
    { d: 90,  t: 'Crédito 90 días' },
    { d: 120, t: 'Crédito 120 días' }
  ];

  function hoyMas(dias) {
    var d = new Date(); d.setDate(d.getDate() + (Number(dias) || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  /** El objeto vacío. Se separa de `de()` para que el que arranca en blanco y
   *  el que se rehidrata de un machote viejo tengan exactamente la misma
   *  forma: media estructura es peor que ninguna. */
  function vacio() {
    return {
      pago: { dias: null, termino_texto: null, termino_id: null, hitos: [] },
      incoterm: null,
      entrega: { texto: '', fecha: null },
      vigencia: { dias: 30, hasta: null },
      at: null, por: null
    };
  }

  /** Los compromisos de un machote, siempre con forma completa. Un machote
   *  guardado antes de V1.33 no los trae: sale el vacío, no `undefined`. */
  function de(m) {
    var c = (m && m.compromisos) || null;
    var v = vacio();
    if (!c) return v;
    if (c.pago) {
      v.pago.dias = (c.pago.dias === 0 || c.pago.dias) ? Number(c.pago.dias) : null;
      v.pago.termino_texto = c.pago.termino_texto || null;
      v.pago.termino_id = c.pago.termino_id || null;
      v.pago.hitos = Array.isArray(c.pago.hitos) ? c.pago.hitos.slice() : [];
    }
    v.incoterm = c.incoterm || null;
    if (c.entrega) { v.entrega.texto = c.entrega.texto || ''; v.entrega.fecha = c.entrega.fecha || null; }
    if (c.vigencia) {
      v.vigencia.dias = (c.vigencia.dias === 0 || c.vigencia.dias) ? Number(c.vigencia.dias) : 30;
      v.vigencia.hasta = c.vigencia.hasta || null;
    }
    v.at = c.at || null; v.por = c.por || null;
    return v;
  }

  /* ── QUÉ FALTA ────────────────────────────────────────────────────────────
   * Devuelve la lista, no un booleano. Un booleano obliga a la pantalla a
   * adivinar qué decirle a la persona, y lo que la persona necesita saber es
   * CUÁL falta — que es la diferencia entre «no puedes seguir» y «te falta el
   * incoterm».
   *
   * La MONEDA no se pide: la manda el machote y la orden nace con su
   * `pricelist_id`. Pero sí se comprueba, porque un compromiso que se da por
   * cierto sin mirarlo es exactamente cómo se cuelan los otros cuatro. */
  function faltantes(m) {
    var c = de(m), f = [];
    if (c.pago.dias === null) {
      f.push({ id: 'pago', que: 'Términos de pago',
               porque: '49 de las 176 órdenes confirmadas salieron sin ellos.' });
    }
    if (!c.incoterm) {
      f.push({ id: 'incoterm', que: 'Términos comerciales (incoterm)',
               porque: 'Está vacío en las 176. Sin él no se sabe quién paga el flete.' });
    }
    if (!c.entrega.texto || !String(c.entrega.texto).trim()) {
      f.push({ id: 'entrega', que: 'Tiempo de entrega',
               porque: 'La fecha comprometida está vacía en las 176.' });
    }
    if (!m || !m.moneda) {
      f.push({ id: 'moneda', que: 'Moneda',
               porque: 'La manda el machote y este machote no la trae.' });
    }
    if (!c.vigencia.dias) {
      f.push({ id: 'vigencia', que: 'Vigencia de la cotización',
               porque: 'Sin ella no se puede saber qué cotización venció.' });
    }
    /* Los hitos son opcionales, pero si los hay tienen que sumar 100. Un
     * reparto que suma 90 es un error de captura que el cliente descubre
     * cobrando, no nosotros cotizando. */
    var suma = sumaHitos(c.pago.hitos);
    if (c.pago.hitos.length && Math.abs(suma - 100) > 0.001) {
      f.push({ id: 'hitos', que: 'Los hitos de pago suman ' + (Math.round(suma * 100) / 100) + '%',
               porque: 'Tienen que sumar exactamente 100%.' });
    }
    return f;
  }

  function sumaHitos(hitos) {
    return (hitos || []).reduce(function (a, h) { return a + (Number(h.porcentaje) || 0); }, 0);
  }

  function completos(m) { return faltantes(m).length === 0; }

  /** Lo que viaja al servidor. Plano y explícito: el que lea el payload en un
   *  log tiene que poder entenderlo sin abrir este archivo. */
  function paraOrden(m) {
    var c = de(m);
    return {
      pago_dias: c.pago.dias,
      pago_termino_texto: c.pago.termino_texto,
      pago_termino_id: c.pago.termino_id,
      pago_hitos: c.pago.hitos,
      incoterm_code: c.incoterm,
      entrega_texto: c.entrega.texto || null,
      entrega_fecha: c.entrega.fecha || null,
      moneda: (m && m.moneda) || null,
      vigencia_dias: c.vigencia.dias,
      vigencia_hasta: c.vigencia.hasta || (c.vigencia.dias ? hoyMas(c.vigencia.dias) : null)
    };
  }

  /* ── LA NOTA DE LOS HITOS ─────────────────────────────────────────────────
   * Los hitos viajan al cliente como texto porque es como los lee hoy. Que
   * además vivan en campos es lo que cambió; el texto no se pierde. */
  function notaDeHitos(m) {
    var c = de(m);
    if (!c.pago.hitos.length) return null;
    var lineas = c.pago.hitos.map(function (h) {
      return '- ' + (Number(h.porcentaje) || 0) + '% ' + (h.concepto || '') +
             (h.cuando ? ' (' + h.cuando + ')' : '');
    });
    return 'Forma de pago\n' + lineas.join('\n') +
           (c.pago.dias ? '\nCrédito: ' + c.pago.dias + ' días.' : '');
  }

  // ── La pantalla ──────────────────────────────────────────────────────────

  /** El bloque de campos. Devuelve HTML; el cableado va en `cablear()`, que se
   *  llama después de insertarlo. Se parten en dos a propósito: la pantalla
   *  que lo usa repinta seguido y volver a cablear sobre nodos muertos es de
   *  los errores que no se ven en el diff. */
  function html(m) {
    var c = de(m), falta = faltantes(m);
    var faltaDe = {}; falta.forEach(function (f) { faltaDe[f.id] = f; });

    var plazos = PLAZOS.map(function (p) {
      return '<option value="' + p.d + '"' + (c.pago.dias === p.d ? ' selected' : '') +
             '>' + esc(p.t) + '</option>';
    }).join('');

    var inco = INCOTERMS.map(function (i) {
      return '<option value="' + i.c + '"' + (c.incoterm === i.c ? ' selected' : '') +
             '>' + i.c + ' — ' + esc(i.n) + '</option>';
    }).join('');

    /* `data-th` en CADA celda: las tablas `.ctrl-t` de este módulo se vuelven
     * tarjetas en el teléfono y sacan la etiqueta de ahí. Sin él, los hitos
     * salían como tres cajas sin decir cuál era el concepto, cuál el
     * porcentaje y cuál el cuándo. Se vio en la captura a 380, no en el
     * diff (CLAUDE.md §20 #12). */
    var hitos = c.pago.hitos.map(function (h, i) {
      return '<tr>' +
        '<td data-th="Concepto"><input class="cel" data-hito="' + i + '" data-campo="concepto" ' +
          'value="' + esc(h.concepto || '') + '" placeholder="Anticipo"></td>' +
        '<td class="num" data-th="%"><input class="cel n" data-hito="' + i + '" data-campo="porcentaje" ' +
          'type="number" min="0" max="100" step="0.01" value="' + esc(h.porcentaje) + '"></td>' +
        '<td data-th="Cuándo"><input class="cel" data-hito="' + i + '" data-campo="cuando" ' +
          'value="' + esc(h.cuando || '') + '" placeholder="contra firma de contrato"></td>' +
        '<td data-th=""><button class="btn fantasma tiny" data-hito-x="' + i + '">Quitar</button></td>' +
      '</tr>';
    }).join('');

    var suma = sumaHitos(c.pago.hitos);
    var cuadra = !c.pago.hitos.length || Math.abs(suma - 100) <= 0.001;

    return '' +
      '<div class="cp-falta' + (falta.length ? '' : ' ok') + '">' +
        (falta.length
          ? '<strong>Faltan ' + falta.length + ' de los cinco compromisos.</strong>' +
            '<ul>' + falta.map(function (f) {
              return '<li><b>' + esc(f.que) + '</b> — ' + esc(f.porque) + '</li>';
            }).join('') + '</ul>' +
            '<p class="tiny">Hasta que estén, la orden no se puede crear.</p>'
          : '<strong>Los cinco compromisos están.</strong> ' +
            '<span class="tiny">Viajan a sus campos de Odoo y a nuestra base.</span>') +
      '</div>' +

      '<div class="cp-grid">' +

        '<label class="campo"><span>1 · Términos de pago</span>' +
          '<select class="cel" id="cp-pago">' +
            '<option value=""' + (c.pago.dias === null ? ' selected' : '') + '>— elegir —</option>' +
            plazos +
          '</select>' +
          '<span class="tiny nota">A cuántos días. Es lo que Odoo sabe modelar y lo que ' +
          'la cobranza necesita para calcular vencimientos.</span></label>' +

        '<label class="campo"><span>2 · Términos comerciales</span>' +
          '<select class="cel" id="cp-incoterm">' +
            '<option value=""' + (!c.incoterm ? ' selected' : '') + '>— elegir —</option>' +
            inco +
          '</select>' +
          '<span class="tiny nota">Quién paga el flete y hasta dónde llega nuestra ' +
          'responsabilidad. Vacío en las 176 órdenes revisadas.</span></label>' +

        '<label class="campo"><span>3 · Tiempo de entrega</span>' +
          '<input class="cel" id="cp-entrega" value="' + esc(c.entrega.texto) + '" ' +
            'placeholder="8 a 10 semanas a partir del anticipo">' +
          '<span class="tiny nota">Lo que lee el cliente.</span></label>' +

        '<label class="campo"><span>3b · Fecha comprometida</span>' +
          '<input class="cel" id="cp-entrega-fecha" type="date" ' +
            'value="' + esc(c.entrega.fecha || '') + '">' +
          '<span class="tiny nota">La que se puede vigilar. Sin fecha, el compromiso ' +
          'vuelve a ser un párrafo que nadie puede sumar.</span></label>' +

        '<label class="campo"><span>4 · Moneda</span>' +
          '<input class="cel" id="cp-moneda" value="' + esc((m && m.moneda) || '') + '" disabled>' +
          '<span class="tiny nota">La manda el machote. La orden nace con su lista de ' +
          'precios explícita; no se teclea aquí.</span></label>' +

        '<label class="campo"><span>5 · Vigencia</span>' +
          '<input class="cel" id="cp-vigencia" type="number" min="1" max="365" ' +
            'value="' + esc(c.vigencia.dias) + '">' +
          '<span class="tiny nota">Días. Vence el <b id="cp-vence">' +
            esc(c.vigencia.hasta || (c.vigencia.dias ? hoyMas(c.vigencia.dias) : '—')) +
          '</b>.</span></label>' +

      '</div>' +

      '<div class="cp-hitos">' +
        '<div class="cp-hitos-cab">' +
          '<h5>Hitos de pago <span class="tiny nota">opcional</span></h5>' +
          '<button class="btn fantasma tiny" id="cp-hito-mas">Agregar hito</button>' +
        '</div>' +
        '<p class="tiny nota">No caben en el término de pago de Odoo y no se fuerzan ahí: ' +
        'así se llegó a los 45 términos que hay hoy. Se guardan como campos nuestros y ' +
        'viajan al cliente como nota al pie.</p>' +
        (c.pago.hitos.length
          ? '<div class="tabla-wrap"><table class="ctrl-t cp-t">' +
              '<thead><tr><th>Concepto</th><th class="num">%</th><th>Cuándo</th><th></th></tr></thead>' +
              '<tbody>' + hitos + '</tbody>' +
              '<tfoot><tr><td data-th="">Suma</td>' +
                '<td class="num mono' + (cuadra ? '' : ' mal') + '" id="cp-suma" data-th="%">' +
                  (Math.round(suma * 100) / 100) + '%</td>' +
                '<td colspan="2" class="tiny" data-th="">' +
                  (cuadra ? '' : 'Tiene que dar 100%.') + '</td></tr></tfoot>' +
            '</table></div>'
          : '<p class="tiny nota">Sin hitos. Se paga según el plazo de crédito de arriba.</p>') +
      '</div>';
  }

  /** Cablea el bloque ya insertado. `onCambio` se llama después de cada cambio
   *  con el machote ya modificado, para que quien lo use repinte lo suyo
   *  (el botón de crear, típicamente). */
  function cablear(m, onCambio) {
    if (!m.compromisos) m.compromisos = vacio();
    var c = m.compromisos;
    if (!c.pago) c.pago = { dias: null, termino_texto: null, termino_id: null, hitos: [] };
    if (!Array.isArray(c.pago.hitos)) c.pago.hitos = [];
    if (!c.entrega) c.entrega = { texto: '', fecha: null };
    if (!c.vigencia) c.vigencia = { dias: 30, hasta: null };

    function sello() {
      c.at = new Date().toISOString();
      try {
        var s = G.MachoteSesion && G.MachoteSesion.actual && G.MachoteSesion.actual();
        c.por = (s && (s.usuario || s.nombre)) || c.por || 'sin identificar';
      } catch (e) { c.por = c.por || 'sin identificar'; }
    }
    /* `repintar` dice si cambió la ESTRUCTURA (se agregó o se quitó un hito) o
     * sólo un valor. Sin esa distinción, agregar un hito mutaba el arreglo y
     * no pintaba nada: el botón parecía muerto. Y repintar en cada tecla le
     * quitaría el foco a quien escribe a media palabra. */
    function cambio(repintar) {
      sello();
      if (typeof onCambio === 'function') onCambio(!!repintar);
    }

    var pago = document.getElementById('cp-pago');
    if (pago) pago.onchange = function () {
      if (pago.value === '') { c.pago.dias = null; c.pago.termino_texto = null; }
      else {
        c.pago.dias = Number(pago.value);
        var p = PLAZOS.filter(function (x) { return x.d === c.pago.dias; })[0];
        c.pago.termino_texto = p ? p.t : null;
      }
      cambio();
    };

    var ic = document.getElementById('cp-incoterm');
    if (ic) ic.onchange = function () { c.incoterm = ic.value || null; cambio(); };

    var en = document.getElementById('cp-entrega');
    if (en) en.oninput = function () { c.entrega.texto = en.value; cambio(); };

    var ef = document.getElementById('cp-entrega-fecha');
    if (ef) ef.onchange = function () { c.entrega.fecha = ef.value || null; cambio(); };

    var vi = document.getElementById('cp-vigencia');
    if (vi) vi.oninput = function () {
      var d = parseInt(vi.value, 10);
      c.vigencia.dias = (isFinite(d) && d > 0) ? d : null;
      c.vigencia.hasta = c.vigencia.dias ? hoyMas(c.vigencia.dias) : null;
      var v = document.getElementById('cp-vence');
      if (v) v.textContent = c.vigencia.hasta || '—';
      cambio();
    };

    var mas = document.getElementById('cp-hito-mas');
    if (mas) mas.onclick = function () {
      c.pago.hitos.push({ concepto: '', porcentaje: 0, cuando: '' });
      cambio(true);
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-hito]'), function (el) {
      el.oninput = function () {
        var h = c.pago.hitos[Number(el.dataset.hito)];
        if (!h) return;
        h[el.dataset.campo] = el.dataset.campo === 'porcentaje'
          ? (el.value === '' ? 0 : parseFloat(el.value) || 0) : el.value;
        /* La suma del pie se mueve en vivo, sin repintar la tabla: repintarla
         * en cada tecla sacaría el foco del campo que se está escribiendo. */
        if (el.dataset.campo === 'porcentaje') {
          var suma = sumaHitos(c.pago.hitos);
          var celda = document.getElementById('cp-suma');
          if (celda) {
            celda.textContent = (Math.round(suma * 100) / 100) + '%';
            celda.className = 'num mono' + (Math.abs(suma - 100) <= 0.001 ? '' : ' mal');
          }
        }
        cambio();
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-hito-x]'), function (el) {
      el.onclick = function () {
        c.pago.hitos.splice(Number(el.dataset.hitoX), 1);
        cambio(true);
      };
    });
  }

  G.MachoteCompromisos = {
    INCOTERMS: INCOTERMS, PLAZOS: PLAZOS,
    vacio: vacio, de: de, faltantes: faltantes, completos: completos,
    sumaHitos: sumaHitos, paraOrden: paraOrden, notaDeHitos: notaDeHitos,
    html: html, cablear: cablear, hoyMas: hoyMas
  };
})(window);
