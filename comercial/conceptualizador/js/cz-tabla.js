/* ═══ Conceptualizador · la tabla del machote y el BOM con filtros (V1.48, prototipo aprobado por Esteban el 16-oct, #4) ═══
 *
 * Prototipo: fts-conceptualizador, prototipos/pantalla-v148.html (vuelta 2, aprobada).
 *
 *  · TABLA: el último mensaje del agente es la tabla del machote, igual a la del machote final: una fila por sección con
 *    costo, precio a cliente al 40 % (después de la comisión FTS) y margen, y el total. Cada sección se abre en sus subgrupos
 *    (materiales, servicios, mano de obra, viaje) y de ahí en sus renglones. Arriba, una línea con el % hacia el 100 y qué
 *    cambió desde la versión anterior.
 *  · BOM: abajo, colapsado, con FILTROS COMBINABLES: origen (🔒 lo que dije yo / 🤖 lo que supuso el agente) Y estado
 *    (⚠ con alerta / 🔎 precio de referencia N3-N4 / ⛔ sin precio N5); dentro de un mismo grupo, O. Cada sección dice cuántos
 *    renglones cumplen y se abre sola si tiene alguno. «Quitar filtros».
 *
 * Los números NO se calculan aquí: llegan en `machote.secciones[i].grupos` (fts-conceptualizador, herramientas/motor/
 * tabla-machote.js), que reparte al centavo el precio que calc.js de la suite le dio a cada parte. Esta pantalla solo pinta.
 * Una respuesta de antes de V1.48 (sin `machote.tabla`) se sigue pintando como antes (cz-app.js).
 *
 * Lo abierto y los filtros viven aquí (no en el HTML): sobreviven al repintado del sondeo.
 */
(function (G) {
  'use strict';
  var SUB = { mat: 'Materiales', serv: 'Servicios', mo: 'Mano de obra', viaje: 'Viaje' };
  var CHIPS = [['origen', 'tu', '🔒 Lo que dije yo'], ['origen', 'agente', '🤖 Lo que supuso el agente'],
    ['estado', 'alerta', '⚠ Con alerta'], ['estado', 'ref', '🔎 Precio de referencia'], ['estado', 'n5', '⛔ Sin precio']];
  var S = { abiertas: {}, bomAbierto: false, secAbiertas: {}, f: { origen: {}, estado: {} } };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var din = function (n) { return n === null || n === undefined || n === '' ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var pc = function (x) { return (Number(x || 0) * 100).toFixed(1) + ' %'; };
  var tiene = function (o) { return Object.keys(o).some(function (k) { return o[k]; }); };
  var conAlerta = function (r) { return !!String(r.alerta || '').trim(); };
  var on = function (n) { try { return !!(G.CzInterruptor && G.CzInterruptor(n)); } catch (e) { return false; } };
  /** El decreto de una sección: calc.js lo trae como objeto ({ tipo, valor, decreto, margen }). */
  var decDe = function (s) { var d = s && s.decreto; return d && typeof d === 'object' ? String(d.decreto || '') : String(d || ''); };
  var esRef = function (r) { return r.nivel === 'N3' || r.nivel === 'N4'; };
  var esN5 = function (r) { return r.nivel === 'N5' || r.pu === null || r.pu === undefined; };
  /** Origen Y estado; dentro de cada grupo, O. Sin chips prendidos en un grupo, ese grupo no filtra. */
  function cumple(r) {
    var o = S.f.origen, e = S.f.estado;
    if (tiene(o) && !o[r.o]) return false;
    if (tiene(e) && !((e.alerta && conAlerta(r)) || (e.ref && esRef(r)) || (e.n5 && esN5(r)))) return false;
    return true;
  }
  var hayFiltro = function () { return tiene(S.f.origen) || tiene(S.f.estado); };

  function marcas(r, REF) {
    var t = [];
    if (r.o === 'tu') {
      var ids = (r.dec || []).map(function (k) { return /^dato:/.test(k) ? 'dato tuyo' : k; });
      var tit = (r.dec || []).map(function (k) { var d = REF[k] || {}; return (/^dato:/.test(k) ? '' : k + ' · ') + (d.origen || '') + (d.texto ? ': ' + d.texto : ''); }).join('\n');
      t.push('<span class="tb-tag tu" title="' + esc(tit) + '">🔒 ' + esc(ids.slice(0, 2).join(', ') + (ids.length > 2 ? ' +' + (ids.length - 2) : '')) + '</span>');
    } else if (r.tipo !== 'Mano de obra') t.push('<span class="tb-tag ag">🤖 supuesto</span>');
    if (r.nivel) t.push('<span class="tb-tag ' + esc(String(r.nivel).toLowerCase()) + '">' + (r.nivel === 'N5' ? '⛔ ' : esRef(r) ? '🔎 ' : '') + esc(r.nivel) + '</span>');
    return t.join('');
  }
  function renglon(r, REF, conPrecio, puede) {
    var al = conAlerta(r), sinP = esN5(r) && r.tipo !== 'Mano de obra';
    return '<div class="tb-r' + (al ? ' con-alerta' : '') + '"><span class="tb-d">' + esc(r.d) +
      '<small>' + (r.qty ? esc(Number(r.qty).toLocaleString('es-MX')) + ' ' + esc(r.unidad || '') : '') + (r.pu !== null && r.pu !== undefined ? ' × ' + din(r.pu) : '') + (r.liga ? ' · ' + esc(r.liga) : '') + '</small></span>' +
      '<span class="tb-i">' + (sinP ? '<b class="mal">sin precio</b>' : conPrecio ? din(r.precio) + '<small>costo ' + din(r.costo) + '</small>' : din(r.costo)) + '</span>' +
      (r.tipo === 'Mano de obra' ? '' : '<span class="tb-meta">' + marcas(r, REF) + (al ? '<button type="button" class="tb-al" data-tb-al="1">⚠ alerta</button>' : '') +
        (r.o === 'agente' && puede ? '<button type="button" class="tb-cam" data-tb-cam="' + esc(String(r.d).slice(0, 120)) + '">↺ Cambiar</button>' : '') + '</span>') +
      (al ? '<span class="tb-alerta">⚠ ' + esc(r.alerta) + '</span>' : '') + '</div>';
  }

  /** La línea de arriba: % hacia el 100 y qué cambió contra la versión anterior. `an` = verifica.analisis. */
  function lineaArriba(M, an) {
    var c = M.cambio, partes = [];
    var pct = an ? (an.estado === 'cerrado' ? '🔒 Cerrado · 100 %' : an.estado === 'listo' ? '100 % · lista para cotizar' : (typeof an.pct === 'number' ? an.pct + ' % hacia el 100' : null)) : null;
    if (c) {
      var n = c.n || {};
      if (n.nuevos) partes.push('+' + n.nuevos + (n.nuevos === 1 ? ' renglón' : ' renglones') + (c.nuevos && c.nuevos.length ? ': ' + c.nuevos.slice(0, 2).join(', ') + (n.nuevos > 2 ? '…' : '') : ''));
      if (n.quitados) partes.push('−' + n.quitados + (n.quitados === 1 ? ' renglón' : ' renglones'));
      if (n.precio) partes.push(n.precio + (n.precio === 1 ? ' precio cambió' : ' precios cambiaron'));
      if (n.cantidad) partes.push(n.cantidad + (n.cantidad === 1 ? ' cantidad cambió' : ' cantidades cambiaron'));
      if (typeof c.dif === 'number') partes.push(c.dif === 0 ? 'total sin cambio' : 'total ' + (c.dif > 0 ? '+' : '−') + din(Math.abs(c.dif)));
    }
    if (!pct && !partes.length) return '';
    // V1.53b · el motor compara contra el último machote GUARDADO (`c.version_antes`); lo dice con su número.
    var contra = on('pantalla_v153') && c && c.version_antes ? 'Contra la versión guardada v' + c.version_antes + ': ' : 'Desde la versión anterior: ';
    return '<div class="tb-arriba">' + (pct ? '<b>' + esc(pct) + '</b>' : '') + (partes.length ? (pct ? ' · ' : '') + contra + esc(partes.join(' · ')) + '.' : '') + '</div>';
  }

  /** La tarjeta de la tabla del machote. `o`: { analisis, folio }. */
  function tabla(M, o) {
    o = o || {};
    var REF = M.decretos_ref || {}, puede = !!o.puede;
    var filas = (M.secciones || []).map(function (s, i) {
      var ab = !!S.abiertas[i], g = (s.grupos || []);
      var sub = !ab ? '' : g.map(function (x, j) {
        var k = i + ':' + j, abg = !!S.abiertas[k];
        return '<tr class="tb-g"><td><button type="button" class="tb-ex g" data-tb-ab="' + k + '" aria-expanded="' + abg + '"><span class="tb-chev">▸</span>' + esc(SUB[x.k] || x.nombre) + ' <small>' + (x.renglones || []).length + '</small></button></td>' +
          '<td class="n">' + din(x.costo) + '</td><td class="n">' + din(x.precio) + '</td><td class="n mg4"></td></tr>' +
          (abg ? '<tr class="tb-rs"><td colspan="4">' + (x.renglones || []).map(function (r) { return renglon(r, REF, true, puede); }).join('') + '</td></tr>' : '');
      }).join('');
      return '<tr class="tb-s"><td><button type="button" class="tb-ex" data-tb-ab="' + i + '" aria-expanded="' + ab + '"' + (g.length ? '' : ' disabled') + '><span class="tb-chev">▸</span><span class="tb-n">' + esc(s.nombre) +
        (s.sin_precio ? ' <span class="mal">· ' + s.sin_precio + ' sin precio</span>' : '') + '</span></button></td>' +
        '<td class="n">' + din(s.costo) + '</td><td class="n"><b>' + din(s.precio) + '</b>' + (on('pantalla_v153') && s.decreto ? '<small class="mg">por decreto (' + esc(decDe(s)) + ')</small>' : '') + '<small class="mg">margen ' + pc(s.margen) + '</small></td><td class="n mg4">' + pc(s.margen) + '</td></tr>' + sub;
    }).join('');
    var sumaSec = (M.secciones || []).reduce(function (a, s) { return a + Math.round(Number(s.precio) * 100); }, 0) / 100;
    var redondeo = Math.abs(sumaSec - Number(M.precio)) >= 0.005;
    /* V1.53b (`pantalla_v153`, #6 20:43) · sin textos que se contradigan: «Precio por decreto» cuando la sección lo trae, la comisión
     * que de verdad lleva (0 % con excepción) y el total de Odoo (renglones al peso hacia arriba) dicho una vez. */
    var V153 = on('pantalla_v153'), dec = (M.secciones || []).filter(function (s) { return s.decreto; }).map(decDe);
    var cabPrecio = V153 && dec.length ? (dec.length === (M.secciones || []).length ? 'Precio por decreto' : 'Precio') : 'Precio al ' + Math.round((M.margen_objetivo || 0.4) * 100) + ' %';
    var comF = V153 ? (M.comision_fts != null ? Number(M.comision_fts) : 0.055) : (M.comision_fts || 0.055);
    var alPeso = (M.secciones || []).reduce(function (a, s) { return a + Math.ceil(Number(s.precio) - 1e-9); }, 0);
    var notaOdoo = V153 && Math.abs(alPeso - Number(M.precio)) >= 0.005 ? ' En la cotización de Odoo cada renglón va redondeado al peso hacia arriba: total ' + din(alPeso) + '.' : '';
    var notaDec = V153 && dec.length ? ' Precio por decreto (' + dec.join(', ') + ')' + (dec.length < (M.secciones || []).length ? '; el resto al ' + Math.round((M.margen_objetivo || 0.4) * 100) + ' %' : '') + '.' : '';
    return '<div class="carta tb-carta"><h4>📐 Así quedó' + (o.folio ? ' ' + esc(o.folio) : ' el machote') + '</h4>' + lineaArriba(M, o.analisis) +
      '<table class="tb"><thead><tr><th>Sección</th><th>Costo</th><th>' + esc(cabPrecio) + '</th><th class="mg4">Margen</th></tr></thead><tbody>' + filas + '</tbody>' +
      '<tfoot><tr><td>Total</td><td class="n">' + din(M.costo) + '</td><td class="n">' + din(M.precio) + '<small class="mg">margen ' + pc(M.margen) + '</small></td><td class="n mg4">' + pc(M.margen) + '</td></tr></tfoot></table>' +
      ((M.opciones || []).length ? '<p class="nota">Aparte (el cliente escoge una): ' + M.opciones.map(function (x) { return esc(x.nombre) + ' ' + (Number(x.precio) > 0 ? din(x.precio) : 'sin precio todavía'); }).join(' · ') + '</p>' : '') +
      '<p class="nota">' + notaDec + (notaDec ? ' ' : '') + 'Margen después de la comisión FTS ' + (comF * 100).toFixed(1) + ' %' + (V153 && comF === 0 ? ' (excepción autorizada)' : '') + (M.comision_total ? ' (' + din(M.comision_total) + ')' : '') + '. Calculado con el motor del machote de la suite (calc.js ' + esc((M.calc && M.calc.version) || '') + ')' +
        (redondeo ? '; la suma de las secciones da ' + din(sumaSec) + ' por redondeo al centavo' : '') + '.' + notaOdoo + ' Toca una sección para ver materiales, servicios, mano de obra y viaje.</p></div>';
  }

  /** El BOM colapsado con los filtros. Renglones de materiales, servicios y viaje (la mano de obra va en la tabla). */
  function bom(M, o) {
    o = o || {};
    var REF = M.decretos_ref || {}, puede = !!o.puede;
    var SEC = (M.secciones || []).map(function (s) {
      var g = s.grupos || [];
      return { nombre: s.nombre, costo: s.costo, filas: g.filter(function (x) { return x.k !== 'mo'; }).reduce(function (a, x) { return a.concat(x.renglones || []); }, []),
        mo: g.filter(function (x) { return x.k === 'mo'; }).reduce(function (a, x) { return a.concat(x.renglones || []); }, []) };
    });
    var TODAS = SEC.reduce(function (a, s) { return a.concat(s.filas); }, []);
    var cuenta = function (f) { return TODAS.filter(f).length; };
    var porChip = { tu: function (r) { return r.o === 'tu'; }, agente: function (r) { return r.o === 'agente'; }, alerta: conAlerta, ref: esRef, n5: esN5 };
    var chips = CHIPS.map(function (c) { var on = !!S.f[c[0]][c[1]];
      return '<button type="button" class="tb-chip' + (on ? ' on' : '') + '" data-tb-f="' + c[0] + ':' + c[1] + '" aria-pressed="' + on + '">' + esc(c[2]) + ' <small>' + cuenta(porChip[c[1]]) + '</small></button>'; }).join('');
    var hf = hayFiltro(), n = cuenta(cumple);
    var secs = SEC.map(function (s, i) {
      var L = s.filas.filter(cumple), ab = hf ? L.length > 0 || !!S.secAbiertas[i] : !!S.secAbiertas[i];
      return '<div class="tb-sec' + (ab ? ' abierta' : '') + (hf && !L.length ? ' apagada' : '') + '"><button type="button" class="tb-sh" data-tb-sec="' + i + '" aria-expanded="' + ab + '"><span class="tb-sn"><b>' + esc(s.nombre) + '</b><span>' +
        (hf ? '<b class="tb-cumplen">' + L.length + ' de ' + s.filas.length + '</b> cumplen el filtro' : s.filas.length + (s.filas.length === 1 ? ' renglón' : ' renglones')) + '</span></span>' +
        '<span class="tb-st"><b>' + din(s.costo) + '</b><span>costo</span></span><span class="tb-chev">▾</span></button>' +
        (ab ? '<div class="tb-srs">' + (L.length ? L.map(function (r) { return renglon(r, REF, false, puede); }).join('') : '<div class="nota">Ningún renglón cumple el filtro.</div>') +
          (s.mo.length && !hf ? '<div class="tb-mo">Mano de obra: ' + s.mo.map(function (m) { return esc(m.d) + ' ' + din(m.costo); }).join(' · ') + '</div>' : '') + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="carta tb-bom' + (S.bomAbierto ? ' abierta' : '') + '"><button type="button" class="tb-bh" data-tb-bom="1" aria-expanded="' + S.bomAbierto + '"><span>📋</span><span class="tb-bt"><b>BOM · ' + TODAS.length + ' renglones en ' + SEC.length + ' secciones</b>' +
      '<span>costo ' + din(M.costo) + ' · filtra por origen y estado</span></span><span class="tb-chev">▾</span></button>' +
      (S.bomAbierto ? '<div class="tb-filtros"><div class="tb-chips">' + chips + '</div><div class="tb-frow"><span>' + (hf ? '<b>' + n + '</b> de ' + TODAS.length + ' renglones cumplen' + (tiene(S.f.origen) && tiene(S.f.estado) ? ' (origen Y estado)' : '') : 'Prende uno o varios filtros: se combinan.') + '</span>' +
        (hf ? '<button type="button" class="tb-quitar" data-tb-quitar="1">Quitar filtros</button>' : '') + '</div></div>' +
        '<div class="tb-ley">🔒 lo dijiste tú (el dueño o Esteban: precio, cantidad, material, proveedor, exclusión, viáticos) · 🤖 lo supuso el agente · ⚠ alerta · 🔎 referencia N3/N4 · ⛔ sin precio N5</div>' + secs : '') + '</div>';
  }

  /** Los clics. `alCambiar(descripcion)` lo pone cz-app.js (abre la caja de texto con el renglón). `repinta()` repinta el chat. */
  function enlazar(M, alCambiar, repinta) {
    var $$ = function (s) { return Array.prototype.slice.call(M.querySelectorAll(s)); };
    $$('[data-tb-ab]').forEach(function (b) { b.onclick = function () { var k = b.dataset.tbAb; S.abiertas[k] = !S.abiertas[k];
      if (!S.abiertas[k] && k.indexOf(':') < 0) Object.keys(S.abiertas).forEach(function (x) { if (x.indexOf(k + ':') === 0) delete S.abiertas[x]; }); repinta(); }; });
    $$('[data-tb-bom]').forEach(function (b) { b.onclick = function () { S.bomAbierto = !S.bomAbierto; repinta(); }; });
    $$('[data-tb-sec]').forEach(function (b) { b.onclick = function () { var i = b.dataset.tbSec; S.secAbiertas[i] = !(b.getAttribute('aria-expanded') === 'true'); repinta(); }; });
    $$('[data-tb-f]').forEach(function (b) { b.onclick = function () { var p = b.dataset.tbF.split(':'); S.f[p[0]][p[1]] = !S.f[p[0]][p[1]]; S.secAbiertas = {}; repinta(); }; });
    $$('[data-tb-quitar]').forEach(function (b) { b.onclick = function () { S.f = { origen: {}, estado: {} }; S.secAbiertas = {}; repinta(); }; });
    $$('[data-tb-al]').forEach(function (b) { b.onclick = function () { b.closest('.tb-r').classList.toggle('ver-alerta'); }; });
    $$('[data-tb-cam]').forEach(function (b) { b.onclick = function () { if (alCambiar) alCambiar(b.dataset.tbCam); }; });
  }
  /** Para pruebas: el estado de los filtros y lo abierto. */
  function estado() { return JSON.parse(JSON.stringify(S)); }
  function reiniciar() { S = { abiertas: {}, bomAbierto: false, secAbiertas: {}, f: { origen: {}, estado: {} } }; }
  G.CzTabla = { tabla: tabla, bom: bom, enlazar: enlazar, cumple: cumple, estado: estado, reiniciar: reiniciar };
})(window);
