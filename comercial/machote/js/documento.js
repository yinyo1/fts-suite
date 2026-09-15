/* ═══ Machote · el documento de la orden, con la forma que FTS ya usa ═══════
 *
 * ── DE DÓNDE SALE ESTA FORMA ────────────────────────────────────────────────
 * No se inventó. Se leyeron las 176 órdenes confirmadas de 2025-2026 de
 * SERVICIOS FTS y de la LLC (TECNOLOGÍAS Y PRODUCTOS YIN queda fuera: es otro
 * negocio, venta de material renglón por renglón). La forma que se repite en
 * los dos países y los dos años es ésta:
 *
 *     ENCABEZADO DE SECCIÓN   (display_type line_section, sin producto,
 *                              sin cantidad, sin precio)
 *     LÍNEA CON PRECIO        (con producto; el NOMBRE del producto ES el
 *                              texto largo del alcance)
 *     NOTAS                   (display_type line_note, donde vive el contrato)
 *
 * Los números crudos: 446 líneas con precio, 308 notas y 33 secciones. Y la
 * proporción importa más que los totales: apenas 23 de 176 órdenes (13%)
 * llevan alguna sección, contra 123 (70%) que llevan notas. **La sección es la
 * excepción y la nota es la regla.** Por eso la propuesta de abajo pone las
 * secciones pero deja quitarlas de un clic: imponerlas sería imponer una forma
 * que el 87% de las órdenes no usa.
 *
 * ── POR QUÉ ESTO ARREGLA LO QUE FALLÓ EN LA SESIÓN 2 ────────────────────────
 * Odoo se niega a confirmar una orden cuyas líneas con precio no traen
 * `product_id` («Some order lines are missing a product»), aunque acepte
 * crearlas. El encabezado de sección NO lleva producto y por eso no choca con
 * esa restricción; la línea con precio SÍ lo lleva. Es la misma forma que el
 * equipo arma a mano hoy, y confirma porque es la que Odoo espera.
 *
 * ── LA SUITE PROPONE, LA PERSONA DISPONE ────────────────────────────────────
 * Todo lo de aquí es un borrador editable: se cambia el texto, se mueve el
 * bloque, se agrega, se quita. Lo único que no se toca es que el COSTO jamás
 * sale al cliente — ni la tarifa, ni el multiplicador, ni el precio de compra.
 * Eso lo vigila una prueba, que es donde de verdad puede colarse.
 */
(function (G) {
  'use strict';

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

  /* Las plantillas se cargan del repo una vez y se quedan. Si no llegan, el
   * documento igual se propone —con secciones y líneas— y sólo se queda sin
   * las notas de plantilla: una red caída no puede impedir crear una orden. */
  var RUTA_PLANTILLAS = '../../shared/comercial/plantillas-notas.json';
  var _plant = null, _pidiendo = null;

  function plantillas() {
    if (_plant) return Promise.resolve(_plant);
    if (_pidiendo) return _pidiendo;
    _pidiendo = fetch(RUTA_PLANTILLAS, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { _plant = j; return j; })
      .catch(function () { return null; });
    return _pidiendo;
  }
  /** Para las pruebas y para quien ya las tenga: se pueden inyectar. */
  function sembrarPlantillas(j) { _plant = j || null; }

  /* El idioma NO lo elige quien captura: lo manda la empresa de la orden. Las
   * órdenes de company 1 están en español y las de la LLC en inglés, sin
   * excepción en las 176 revisadas. */
  function idiomaDe(m) {
    return (m && Number(m.empresa_id) === 6) ? 'en' : 'es';
  }

  // ── La propuesta ─────────────────────────────────────────────────────────

  /** Arma el documento propuesto. Los precios salen del motor a través de
   *  `secciones`: ni un número escrito a mano.
   *
   *  `secciones` es `[{nombre, lineas:[{nombre, cantidad, precio}]}]`, ya
   *  resuelto el desglose por quien llama.
   *
   *  `tipo` es el tipo de trabajo para elegir la plantilla de notas. Por
   *  omisión `instalacion`, que es el que más aparece en las órdenes reales
   *  («El servicio incluye:», 14 veces, todas de México). */
  function proponer(m, secciones, tipo) {
    var idi = idiomaDe(m);
    var P = _plant;
    var bloques = [];
    var secs = secciones || [];

    var tp = null;
    if (P && P.tipos) {
      tp = P.tipos.filter(function (t) { return t.id === (tipo || 'instalacion'); })[0] || null;
    }

    secs.forEach(function (s, i) {
      var nombre = s.nombre || ('SECCIÓN ' + (i + 1));

      // 1 · El encabezado. Sin producto, sin cantidad, sin precio.
      bloques.push({ tipo: 'seccion', texto: nombre, de: 'machote' });

      /* 2 · La(s) línea(s) con precio. Vienen YA CALCULADAS de quien llama:
       * normalmente una por sección, y varias cuando el cliente exigió
       * desglose. Esa regla —y la dura, que la suma cuadre al centavo— vive en
       * `orden.js`, que es donde está probada. Duplicarla aquí sería tener dos
       * versiones de la misma cuenta, y la que se rompiera sería la de acá.
       * El texto ES el alcance: es lo que el equipo pone hoy como nombre del
       * producto, y se edita. */
      (s.lineas || []).forEach(function (l) {
        /* El precio se redondea A DOS DECIMALES aquí, al proponerlo. El motor
         * calcula con todos los decimales —y así debe seguir— pero lo que se
         * le cobra al cliente son pesos y centavos: un `1566510.7266` en la
         * caja de precio se ve mal, invita a editarlo sin querer, y viajaría
         * a Odoo con fracciones de centavo. */
        bloques.push({ tipo: 'linea', texto: l.nombre || nombre,
                       cantidad: Number(l.cantidad) || 1,
                       precio: Math.round((Number(l.precio) || 0) * 100) / 100,
                       de: 'machote' });
      });

      /* 3 · Las notas de ESE tramo. Salen de la plantilla del tipo de trabajo;
       * el machote no tiene notas por sección. */
      if (tp && tp.alcance && tp.alcance[idi]) {
        bloques.push({ tipo: 'nota', texto: tp.alcance[idi].cuerpo,
                       de: 'plantilla:' + tp.id });
      }
    });

    /* 4 · La nota del machote, si la hay. Va antes de las cláusulas de cierre
     * porque es del trabajo, no del contrato. Es la única nota que sale del
     * machote de verdad. */
    if (m && m.nota && String(m.nota).trim()) {
      bloques.push({ tipo: 'nota', texto: String(m.nota).trim(), de: 'machote' });
    }

    /* 5 · Las cláusulas de cierre, que son de la ORDEN y no de la sección:
     * exclusiones, impuestos y limitación de responsabilidad aparecen una vez
     * por orden en las que las traen, no una por tramo. */
    if (tp && P && P.clausulas && P.clausulas[idi]) {
      var porId = {};
      P.clausulas[idi].forEach(function (c) { porId[c.id] = c; });
      (tp.cierra_con || []).forEach(function (id) {
        var c = porId[id];
        if (c) bloques.push({ tipo: 'nota', texto: c.titulo + '\n' + c.cuerpo,
                              de: 'plantilla:' + tp.id + ':' + id });
      });
    }

    /* 6 · Los hitos de pago, si los hay. Van al final porque es donde el
     * cliente los busca, y porque el compromiso se lee después del alcance. */
    var nh = G.MachoteCompromisos && G.MachoteCompromisos.notaDeHitos
           ? G.MachoteCompromisos.notaDeHitos(m) : null;
    if (nh) bloques.push({ tipo: 'nota', texto: nh, de: 'compromisos' });

    return { bloques: bloques, plantilla: tp ? tp.id : null, idioma: idi };
  }

  // ── Lo que viaja a Odoo ──────────────────────────────────────────────────

  /** Traduce los bloques al contrato del webhook. El ORDEN del arreglo es el
   *  orden del documento y es lo que el servidor escribe en `sequence`.
   *
   *  Lo que NO viaja: `de`, que es de dónde salió cada bloque. Sirve para
   *  medir qué plantillas se reescriben siempre y mejorarlas; al cliente no le
   *  importa y a Odoo tampoco. */
  function paraOdoo(bloques) {
    var out = [];
    (bloques || []).forEach(function (b) {
      var texto = String(b.texto || '').trim();
      if (!texto) return;                 // un bloque vacío no se manda
      if (b.tipo === 'seccion') {
        out.push({ display_type: 'line_section', nombre: texto });
      } else if (b.tipo === 'nota') {
        out.push({ display_type: 'line_note', nombre: texto });
      } else {
        out.push({ display_type: null, nombre: texto,
                   cantidad: Number(b.cantidad) || 1,
                   precio: Number(b.precio) || 0 });
      }
    });
    return out;
  }

  /** El total de lo que se le va a cobrar al cliente: sólo las líneas con
   *  precio. Se calcula del documento y no del machote a propósito — si
   *  alguien editó un precio aquí, el total tiene que reflejarlo o la pantalla
   *  miente. */
  function total(bloques) {
    return (bloques || []).reduce(function (a, b) {
      return b.tipo === 'linea'
        ? a + (Number(b.cantidad) || 0) * (Number(b.precio) || 0) : a;
    }, 0);
  }

  /** Cuántos hay de cada tipo. Para que la pantalla pueda decir «3 secciones,
   *  3 líneas, 9 notas» sin recorrer el arreglo tres veces. */
  function cuenta(bloques) {
    var c = { seccion: 0, linea: 0, nota: 0 };
    (bloques || []).forEach(function (b) { if (c[b.tipo] !== undefined) c[b.tipo]++; });
    return c;
  }

  // ── La pantalla ──────────────────────────────────────────────────────────

  var ETIQUETA = { seccion: 'Sección', linea: 'Línea con precio', nota: 'Nota' };

  function html(bloques, moneda) {
    var c = cuenta(bloques);
    var filas = (bloques || []).map(function (b, i) {
      var cuerpo;
      if (b.tipo === 'linea') {
        cuerpo =
          '<textarea class="cel dc-texto" rows="2" data-dc="' + i + '" data-campo="texto" ' +
            'placeholder="El alcance, tal como lo lee el cliente">' + esc(b.texto) + '</textarea>' +
          '<div class="dc-nums">' +
            '<label class="tiny">Cant. <input class="cel n" type="number" min="0" step="0.01" ' +
              'data-dc="' + i + '" data-campo="cantidad" value="' + esc(b.cantidad) + '"></label>' +
            '<label class="tiny">P. unitario <input class="cel n" type="number" min="0" step="0.01" ' +
              'data-dc="' + i + '" data-campo="precio" value="' + esc(b.precio) + '"></label>' +
            '<span class="tiny mono dc-imp" data-imp="' + i + '">' +
              mx((Number(b.cantidad) || 0) * (Number(b.precio) || 0), moneda) + '</span>' +
          '</div>';
      } else if (b.tipo === 'seccion') {
        cuerpo = '<input class="cel dc-texto" data-dc="' + i + '" data-campo="texto" ' +
                 'value="' + esc(b.texto) + '" placeholder="Encabezado de sección">';
      } else {
        cuerpo = '<textarea class="cel dc-texto" rows="5" data-dc="' + i + '" data-campo="texto" ' +
                 'placeholder="El texto que lee el cliente">' + esc(b.texto) + '</textarea>';
      }

      return '<li class="dc-b dc-' + b.tipo + '">' +
        '<div class="dc-cab">' +
          '<span class="dc-tipo">' + esc(ETIQUETA[b.tipo] || b.tipo) + '</span>' +
          (b.de ? '<span class="tiny nota dc-de">' + esc(b.de) + '</span>' : '') +
          '<span class="dc-mover">' +
            '<button class="btn fantasma tiny" data-dc-sube="' + i + '"' +
              (i === 0 ? ' disabled' : '') + ' title="Subir">&#8593;</button>' +
            '<button class="btn fantasma tiny" data-dc-baja="' + i + '"' +
              (i === bloques.length - 1 ? ' disabled' : '') + ' title="Bajar">&#8595;</button>' +
            '<button class="btn fantasma tiny" data-dc-x="' + i + '" title="Quitar">&times;</button>' +
          '</span>' +
        '</div>' + cuerpo +
      '</li>';
    }).join('');

    return '' +
      '<div class="dc-barra">' +
        '<span class="tiny nota">' + c.seccion + ' ' + (c.seccion === 1 ? 'sección' : 'secciones') +
          ' · ' + c.linea + ' con precio · ' + c.nota + ' ' + (c.nota === 1 ? 'nota' : 'notas') +
        '</span>' +
        '<span class="dc-mas">' +
          '<button class="btn fantasma tiny" data-dc-mas="seccion">+ Sección</button>' +
          '<button class="btn fantasma tiny" data-dc-mas="linea">+ Línea</button>' +
          '<button class="btn fantasma tiny" data-dc-mas="nota">+ Nota</button>' +
        '</span>' +
      '</div>' +
      (bloques && bloques.length
        ? '<ol class="dc-lista">' + filas + '</ol>'
        : '<p class="tiny nota">El documento está vacío. Agrega al menos una línea con precio.</p>') +
      '<div class="dc-total">Total al cliente <strong class="mono" id="dc-total">' +
        mx(total(bloques), moneda) + '</strong></div>';
  }

  /** Cablea la lista ya pintada. `onCambio(repintar)` se llama tras cada
   *  cambio; `repintar` dice si hace falta volver a pintar toda la lista
   *  (agregar, quitar, mover) o basta con los números (teclear). */
  function cablear(bloques, moneda, onCambio) {
    function avisa(repintar) { if (typeof onCambio === 'function') onCambio(!!repintar); }

    Array.prototype.forEach.call(document.querySelectorAll('[data-dc]'), function (el) {
      el.oninput = function () {
        var b = bloques[Number(el.dataset.dc)];
        if (!b) return;
        var campo = el.dataset.campo;
        if (campo === 'cantidad' || campo === 'precio') {
          b[campo] = el.value === '' ? 0 : (parseFloat(el.value) || 0);
          var imp = document.querySelector('[data-imp="' + el.dataset.dc + '"]');
          if (imp) imp.textContent = mx((Number(b.cantidad) || 0) * (Number(b.precio) || 0), moneda);
          var t = document.getElementById('dc-total');
          if (t) t.textContent = mx(total(bloques), moneda);
        } else {
          b[campo] = el.value;
          /* Editado a mano deja de ser de la plantilla. Es lo que hace que la
           * medición de «cuáles se reescriben siempre» valga algo. */
          if (b.de && b.de.indexOf('plantilla') === 0) b.de = 'editado';
        }
        avisa(false);
      };
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-dc-x]'), function (el) {
      el.onclick = function () { bloques.splice(Number(el.dataset.dcX), 1); avisa(true); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dc-sube]'), function (el) {
      el.onclick = function () {
        var i = Number(el.dataset.dcSube); if (i <= 0) return;
        var t = bloques[i - 1]; bloques[i - 1] = bloques[i]; bloques[i] = t; avisa(true);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dc-baja]'), function (el) {
      el.onclick = function () {
        var i = Number(el.dataset.dcBaja); if (i >= bloques.length - 1) return;
        var t = bloques[i + 1]; bloques[i + 1] = bloques[i]; bloques[i] = t; avisa(true);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dc-mas]'), function (el) {
      el.onclick = function () {
        var t = el.dataset.dcMas;
        bloques.push(t === 'linea'
          ? { tipo: 'linea', texto: '', cantidad: 1, precio: 0, de: 'a mano' }
          : { tipo: t, texto: '', de: 'a mano' });
        avisa(true);
      };
    });
  }

  G.MachoteDocumento = {
    plantillas: plantillas, sembrarPlantillas: sembrarPlantillas,
    idiomaDe: idiomaDe, proponer: proponer,
    paraOdoo: paraOdoo, total: total, cuenta: cuenta,
    html: html, cablear: cablear
  };
})(window);
