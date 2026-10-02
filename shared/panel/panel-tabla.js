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
 *   3. UN SUBTOTAL DE DINERO NUNCA CRUZA MONEDAS. Hasta #332 el subtotal de un
 *      grupo era UN número con el signo de pesos, y los grupos de este panel
 *      mezclan: 5 de las 8 etapas con proyectos traen MXN y USD juntas, así que
 *      «Done Operations · $…» estaba sumando 3 proyectos en pesos con 3 en
 *      dólares. Ahora cada moneda sale con su propia cifra y su propio signo, y
 *      si ninguna fila del grupo tiene número sale RAYA, no `$0` — que es la
 *      regla 1 aplicada al subtotal. Es el mismo bug que `total_native_by_company`
 *      de facturas-core (CLAUDE.md §15 Hallazgo #16, pendiente 1).
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

  /**
   * Regla 3: las sumas de una columna, PARTIDAS POR MONEDA. Devuelve una entrada
   * por moneda que de verdad aparezca entre las filas con número — nunca una
   * moneda inventada, y nunca una sola cifra cuando hay dos.
   */
  function sumasPorMoneda(rs, c) {
    var por = {}, claves = [];
    rs.forEach(function (r) {
      var v = r[c.id];
      if (typeof v !== 'number') return;     // Regla 1: sin dato no suma como 0
      var mon = r.moneda || '';
      if (!(mon in por)) { por[mon] = 0; claves.push(mon); }
      por[mon] += v;
    });
    claves.sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
    return claves.map(function (m) { return { moneda: m, suma: por[m] }; });
  }

  /**
   * Renglón de grupo. `g` = { clave, etiqueta, nota } y `rs` sus filas (puede
   * venir VACÍO a propósito: un grupo declarado con `siempre` existe aunque hoy
   * no tenga nadie — una etapa que desaparece de la pantalla es una etapa que
   * nadie recuerda que existe, igual que el kanban de Odoo la muestra).
   */
  function filaGrupo(op, g, rs, abierto, colapsable) {
    var P = G.Panel;
    var conDato = op.enSubtotal ? rs.filter(op.enSubtotal) : rs;
    var sinDato = rs.length - conDato.length;
    var uni = (op.grupos && op.grupos.unidad) || null;
    var cuenta = uni ? (rs.length + ' ' + uni) : String(rs.length);
    /* La etiqueta ocupa TODAS las columnas iniciales que no suman, no sólo la
       primera. En Rentabilidad eso son cinco (proyecto, cliente, etapa, empresa,
       estado), y sin el colspan el nombre se parte a la mitad —«To / Do · 32 /
       proyectos …»— porque la columna de proyecto se encoge cuando el grupo está
       cerrado y no hay nombres que la estiren. Las columnas que sí suman
       conservan su sitio, así que los subtotales siguen alineados con su título. */
    var nEti = 1;
    while (nEti < op.columnas.length && !op.columnas[nEti].suma) nEti++;
    return '<tr class="grupo' + (colapsable ? (abierto ? ' abierto' : ' cerrado') : '') +
      '" data-grupo="' + P.esc(g.clave) + '">' + op.columnas.map(function (c, i) {
      if (i > 0 && i < nEti) return '';     // absorbidas por el colspan
      if (i === 0) {
        var txt = (colapsable ? ('<span class="g-flecha" aria-hidden="true">' + (abierto ? '▾' : '▸') + '</span>') : '') +
          P.esc(g.etiqueta) + ' <span class="g-cuenta">· ' + P.esc(cuenta) + '</span>' +
          (g.nota ? (' <span class="falta">' + P.esc(g.nota) + '</span>') : '') +
          (sinDato ? (' <span class="falta">(' + sinDato + ' sin dato, fuera del subtotal)</span>') : '');
        var td0 = '<td class="g-eti" colspan="' + nEti + '">';
        if (!colapsable) return td0 + txt + '</td>';
        return td0 + '<button type="button" class="g-tog" data-grupo="' + P.esc(g.clave) +
               '" aria-expanded="' + (abierto ? 'true' : 'false') + '">' + txt + '</button></td>';
      }
      /* `data-col` para que una prueba (o una hoja de estilo) pueda apuntar a la
         celda por el ID de su columna y no por su posición, que el colspan movió. */
      var dc = ' data-col="' + P.esc(c.id) + '"';
      if (!c.suma) return '<td' + dc + '></td>';       // Regla 2
      if (c.kind === 'dinero') {                        // Regla 3
        var ss = sumasPorMoneda(conDato, c);
        if (!ss.length) return '<td class="num"' + dc + '><span class="raya">—</span></td>';
        return '<td class="num"' + dc + '>' + ss.map(function (x) {
          return P.dinero(x.suma, x.moneda);
        }).join('<span class="g-sep"> · </span>') + '</td>';
      }
      /* Las columnas numéricas que NO son dinero (horas) no tienen moneda que
         cruzar, así que siguen saliendo con una sola cifra, como siempre. */
      var hay = conDato.some(function (r) { return typeof r[c.id] === 'number'; });
      if (!hay) return '<td class="num"' + dc + '><span class="raya">—</span></td>';
      var s = conDato.reduce(function (a, r) {
        var v = r[c.id]; return a + (typeof v === 'number' ? v : 0);
      }, 0);
      return '<td class="num"' + dc + '>' + P.nfm(s) + '</td>';
    }).join('') + '</tr>';
  }

  /**
   * El ORDEN de los grupos y cuáles existen. Sin `op.grupos.orden` es el de
   * siempre: alfabético por la clave, y sólo los que tienen filas. Con orden
   * declarado manda el servidor — en Rentabilidad es el `sequence` de las etapas
   * de Odoo, no el nombre ni el monto, para que la lista se lea como el kanban;
   * si Esteban mueve una etapa allá, esto la sigue sin tocar una línea. Lo que
   * aparezca en los datos y NO esté declarado va después, alfabético: un grupo
   * nunca se pierde por no estar en la lista.
   */
  function gruposDe(op, filas) {
    var campo = op.grupo, mapa = {}, vistos = [];
    filas.forEach(function (r) {
      var k = r[campo] == null ? '(vacío)' : String(r[campo]);
      if (!mapa[k]) { mapa[k] = []; vistos.push(k); }
      mapa[k].push(r);
    });
    var decl = (op.grupos && op.grupos.orden) || null;
    if (!decl) {
      vistos.sort(function (a, b) { return a.localeCompare(b, 'es'); });
      return vistos.map(function (k) { return { g: { clave: k, etiqueta: k }, rs: mapa[k] }; });
    }
    var usada = {}, out = [];
    decl.forEach(function (d) {
      var k = String(d.clave);
      var rs = mapa[k] || [];
      usada[k] = 1;
      if (!rs.length && !d.siempre) return;
      out.push({ g: { clave: k, etiqueta: d.etiqueta || k, nota: d.nota || null }, rs: rs });
    });
    vistos.filter(function (k) { return !usada[k]; })
          .sort(function (a, b) { return a.localeCompare(b, 'es'); })
          .forEach(function (k) { out.push({ g: { clave: k, etiqueta: k }, rs: mapa[k] }); });
    return out;
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
   *        repintar, alClic:{sel,fn}, grupos }
   *
   * `grupos` es OPCIONAL y sólo hace algo cuando hay `grupo`. Sin él, el
   * agrupado es el de siempre (alfabético, sólo los grupos con filas, todo
   * desplegado). Con él:
   *   expandido : {clave:true} — el mapa del panel. Su PRESENCIA enciende lo
   *               colapsable, y una clave ausente significa CERRADO.
   *   orden     : [{clave, etiqueta, nota, siempre}] — el orden lo manda el
   *               servidor; `siempre` pinta el grupo aunque tenga 0 filas.
   *   unidad    : 'proyectos' — qué se está contando en la cabecera.
   *   vistas    : lo ESCRIBE esta función en cada pintada, con las claves que
   *               acabó mostrando; es lo que usan «expandir todo» / «colapsar
   *               todo» del panel, para no tener que re-derivarlas por su cuenta
   *               (un índice que sólo cubre parte del universo contesta «no» por
   *               lo que no cubre — CLAUDE.md §20 #13).
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
    /* `f.length` y no sólo `op.grupo`: si el filtro no dejó NINGUNA fila, lo que
       toca es el letrero de «sin filas», no una pared de grupos declarados con
       cero. Un grupo vacío informa cuando hay lista; cuando no hay nada, tapa el
       único mensaje que explica por qué. */
    if (op.grupo && f.length) {
      /* Colapsable sólo si el panel trajo DÓNDE guardar el estado. Sin ese mapa
         el render es el de antes, renglón por renglón: así una pantalla que no
         pidió grupos colapsables no cambia ni un pixel. Y la ausencia de una
         clave en el mapa significa CERRADO, no abierto — por eso un grupo nuevo,
         o un cambio de agrupación, arranca colapsado sin que nadie lo reinicie. */
      var colapsable = !!(op.grupos && op.grupos.expandido);
      var gs = gruposDe(op, f);
      if (op.grupos) op.grupos.vistas = gs.map(function (x) { return x.g.clave; });
      gs.forEach(function (x) {
        var abierto = colapsable ? (op.grupos.expandido[x.g.clave] === true) : true;
        html += filaGrupo(op, x.g, x.rs, abierto, colapsable);
        if (abierto) x.rs.forEach(function (r) { html += fila(op, r); });
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
    /* Clic en la cabecera de un grupo = abrir o cerrar. El estado lo MUTA aquí,
       en el mapa del panel, y le pide repintar: igual que el orden. */
    Array.prototype.forEach.call(t.querySelectorAll('.g-tog'), function (el) {
      el.onclick = function () {
        var k = el.getAttribute('data-grupo');
        if (op.grupos.expandido[k] === true) delete op.grupos.expandido[k];
        else op.grupos.expandido[k] = true;
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
