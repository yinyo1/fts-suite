/* ═══════════════════════════════════════════════════════════════════════════
 * ARMAZÓN DE LOS PANELES · la tabla reagrupable · issue #240
 *
 * Una tabla que el SERVIDOR describe y el NAVEGADOR pinta. El servidor manda
 * `columnas` (id, label, kind, agrupable, suma) y `filas`; esta pieza hace el
 * encabezado con las flechas de orden, el orden al clic, el agrupado con
 * subtotales, y el estado vacío. Requiere `panel.css` y `panel-shell.js`.
 *
 * LAS DOS REGLAS QUE NO SE NEGOCIAN, y por las que esto vive en el armazón en
 * vez de copiarse por panel:
 *
 *   1. UN RENGLÓN SIN DATO NO ES UN RENGLÓN EN CEROS. Los nulos se pintan raya,
 *      y al ordenar van SIEMPRE al final en los dos sentidos: no son «el peor»
 *      ni «el mejor», es que no hay número que ordenar.
 *
 *   2. UN SUBTOTAL SÓLO SUMA LO QUE EL SERVIDOR DECLARÓ SUMABLE, y sólo de los
 *      renglones que tienen dato. Meter los que no tienen como 0 falsearía el
 *      subtotal, que es la misma mentira que la regla prohíbe en el total.
 *      Quién tiene dato lo decide el panel con `enSubtotal`, porque el nombre
 *      de ese estado es vocabulario suyo.
 *
 * Lo que el panel sigue decidiendo: qué filas se ven (el filtro), cómo se pinta
 * una celda especial (`celda`), y qué pasa al clic en una celda-enlace.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function ordenar(filas, orden) {
    var c = orden.col, dir = orden.dir;
    return filas.slice().sort(function (a, b) {
      var x = a[c], y = b[c];
      /* Regla 1: los que no tienen dato, al final en los dos sentidos. */
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'string') return dir * x.localeCompare(y, 'es');
      return dir * (x - y);
    });
  }

  /** Celda por omisión, según el `kind` que declaró el servidor. */
  function celdaPorTipo(c, r) {
    var P = G.Panel, v = r[c.id];
    if (c.kind === 'dinero') return '<td class="num">' + P.dinero(v, r.moneda) + '</td>';
    if (c.kind === 'pct')    return '<td class="num">' + P.pct(v) + '</td>';
    if (c.kind === 'numero') return '<td class="num">' +
      (v === null || v === undefined ? '<span class="raya">—</span>' : P.nfm(v)) + '</td>';
    return '<td>' + P.esc(v) + '</td>';
  }

  function filaGrupo(op, k, rs) {
    var P = G.Panel;
    var conDato = op.enSubtotal ? rs.filter(op.enSubtotal) : rs;
    var sinDato = rs.length - conDato.length;
    return '<tr class="grupo">' + op.columnas.map(function (c, i) {
      if (i === 0) return '<td>' + P.esc(k) + ' · ' + rs.length +
        (sinDato ? (' <span class="falta">(' + sinDato + ' sin dato, fuera del subtotal)</span>') : '') + '</td>';
      if (!c.suma) return '<td></td>';       // Regla 2
      var s = conDato.reduce(function (a, r) {
        var v = r[c.id]; return a + (typeof v === 'number' ? v : 0);
      }, 0);
      return '<td class="num">' + (c.kind === 'dinero' ? P.dinero(s) : P.nfm(s)) + '</td>';
    }).join('') + '</tr>';
  }

  function fila(op, r) {
    return '<tr>' + op.columnas.map(function (c) {
      /* El panel primero: si devuelve algo, manda. Así la guarda de «esta
         columna sale de la línea base y este renglón no la tiene» queda ARRIBA
         de cualquier rama por tipo — si fuera al revés, la rama específica se la
         saltaría, que es exactamente el bug que tuvo `consumo_horas`. */
      if (op.celda) { var td = op.celda(c, r); if (td != null) return td; }
      return celdaPorTipo(c, r);
    }).join('') + '</tr>';
  }

  /**
   * Pinta la tabla. Devuelve cuántas filas quedaron pintadas.
   * op = { tabla, columnas, filas, orden, grupo, celda, enSubtotal, vacio,
   *        repintar, alClic:{sel,fn} }
   */
  function tabla(op) {
    var P = G.Panel;
    var t = typeof op.tabla === 'string' ? document.querySelector(op.tabla) : op.tabla;
    if (!t) return 0;
    var cols = op.columnas, f = ordenar(op.filas, op.orden);

    t.querySelector('thead').innerHTML = '<tr>' + cols.map(function (c) {
      var s = op.orden.col === c.id ? (op.orden.dir > 0 ? ' ▲' : ' ▼') : '';
      return '<th class="' + (c.kind === 'texto' ? '' : 'num') + '" data-col="' +
             P.esc(c.id) + '">' + P.esc(c.label) + s + '</th>';
    }).join('') + '</tr>';

    var html = '';
    if (op.grupo) {
      var mapa = {}, orden = [];
      f.forEach(function (r) {
        var k = r[op.grupo] == null ? '(vacío)' : String(r[op.grupo]);
        if (!mapa[k]) { mapa[k] = []; orden.push(k); }
        mapa[k].push(r);
      });
      orden.sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (k) {
        html += filaGrupo(op, k, mapa[k]);
        mapa[k].forEach(function (r) { html += fila(op, r); });
      });
    } else {
      f.forEach(function (r) { html += fila(op, r); });
    }
    t.querySelector('tbody').innerHTML = html ||
      ('<tr><td colspan="' + cols.length + '" style="color:var(--tinta3)">' +
       P.esc(op.vacio || 'Sin filas con ese filtro.') + '</td></tr>');

    /* Clic en el encabezado = reordenar. El estado de orden lo MUTA aquí y le
       pide al panel que repinte: el panel es quien sabe qué filas se ven. */
    Array.prototype.forEach.call(t.querySelectorAll('th'), function (el) {
      el.onclick = function () {
        var c = el.getAttribute('data-col');
        if (op.orden.col === c) op.orden.dir *= -1;
        else { op.orden.col = c; op.orden.dir = 1; }
        if (op.repintar) op.repintar();
      };
    });
    if (op.alClic) {
      Array.prototype.forEach.call(t.querySelectorAll(op.alClic.sel), function (el) {
        el.onclick = function () { op.alClic.fn(el); };
      });
    }
    return f.length;
  }

  G.Panel = G.Panel || {};
  G.Panel.tabla = tabla;
})(window);
