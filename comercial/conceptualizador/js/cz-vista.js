/* ═══ Conceptualizador · Vista ejecutiva del proyecto (V1.51, punto F, prototipo aprobado) ═══
 *
 * Prototipo: fts-conceptualizador, prototipos/v150/vista-ejecutiva.html (Montalvo y Esteban, 16-oct). Se construye tal cual,
 * con DATOS EN VIVO: la versión vigente del machote que mandó el motor (herramientas/motor/tabla-machote.js + enriquecer).
 *
 *  · Página completa encima de la app (Atrás, Esc o «Cerrar» la cierran; al abrir se empuja un estado al historial).
 *  · Arriba: «Datos de las HH:MM · machote COT-0043 versión N» con «Actualizar»; resumen (precio, costo, margen, % hacia
 *    el 100), decisiones pendientes y alcance / exclusiones / supuestos / tiempo / lugar / moneda / impuestos.
 *  · Abajo, colapsado: sección → subgrupo → renglón → detalle, con costo, precio y margen en CADA nivel.
 *  · Filtros iguales a los del BOM de la app (cz-tabla.js `cumple`): ENTRE grupos (origen / estado) «todos a la vez»;
 *    DENTRO de un grupo «cualquiera».
 *  · «Descargar / imprimir»: PDF INTERNO con la marca «USO INTERNO», todo expandido; la hoja de impresión solo saca la vista.
 *
 * NÚMEROS: esta página no recalcula precios. Suma los renglones que manda el machote en CENTAVOS ENTEROS (subgrupo = Σ
 * renglones, sección = Σ subgrupos, total = Σ secciones), sin volver a redondear. El margen de cada nivel es el del
 * prototipo: (precio − costo − comisión FTS) ÷ precio, con la comisión de la sección cuando el machote la trae y, abajo de la
 * sección, la misma tasa (precio × c ÷ (1 + c)), que es como calc.js la reparte.
 *
 * API:
 *   CzVista.abrir({ machote, caso, hilo, analisis, supuestos, decisionesPendientes, terminos, pct, version, al })
 *     · Si ya está abierta, repinta con los datos nuevos y conserva lo abierto y los filtros.
 *     · al.actualizar() puede devolver una promesa con { machote, … } nuevos; también se puede volver a llamar abrir().
 *   CzVista.cerrar() · CzVista.abierto() · CzVista.filtrar(renglones, filtros) (pura).
 */
(function (G) {
  'use strict';
  var SUB = { mat: 'Materiales', serv: 'Servicios', mo: 'Mano de obra', viaje: 'Viaje' };
  var ORDEN = ['mat', 'serv', 'mo', 'viaje'];
  var CHIPS = [['origen', 'tu', '🔒 Lo que dije yo'], ['origen', 'agente', '🤖 Lo que supuso el agente'],
    ['estado', 'alerta', '⚠ Con alerta'], ['estado', 'ref', '🔎 Referencia N3/N4'], ['estado', 'n5', '⛔ Sin precio N5']];
  var NIVEL = { N1: 'N1 · Proveedor', N2: 'N2 · Web MX', N3: 'N3 · Lista de referencia de otro país', N4: 'N4 · Paramétrico', N5: 'N5 · Pendiente: sin precio' };
  var CHEV = '<svg class="vz-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  var S = { abierto: false, o: null, M: null, abiertos: {}, f: { origen: {}, estado: {} }, el: null, hist: false, token: '', hora: '', leyendo: false };

  /* ── utilidades ── */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cent = function (x) { var n = Number(x); return isFinite(n) ? Math.round(n * 100) : 0; };
  function dinero(c) {
    var neg = c < 0, v = Math.abs(Math.round(c)), e = Math.floor(v / 100), d = v % 100;
    return (neg ? '−' : '') + '$ ' + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + (d < 10 ? '0' : '') + d;
  }
  var pc = function (m) { return m === null ? '—' : (m * 100).toFixed(1) + ' %'; };
  var ren = function (n) { return n + (n === 1 ? ' renglón' : ' renglones'); };
  var arr = function (x) { return Array.isArray(x) ? x : (x == null || x === '' ? [] : [x]); };

  /* ── filtros: copia de cz-tabla.js (`tiene`, `conAlerta`, `esRef`, `esN5`, `cumple`) ── */
  var tiene = function (o) { return !!o && Object.keys(o).some(function (k) { return o[k]; }); };
  var conAlerta = function (r) { return !!String(r.alerta || '').trim(); };
  var esRef = function (r) { return r.nivel === 'N3' || r.nivel === 'N4'; };
  var esN5 = function (r) { return r.nivel === 'N5' || r.pu === null || r.pu === undefined; };
  /** Origen Y estado; dentro de cada grupo, O. Sin chips prendidos en un grupo, ese grupo no filtra. */
  function cumple(r, f) {
    var o = (f && f.origen) || {}, e = (f && f.estado) || {};
    if (tiene(o) && !o[r.o]) return false;
    if (tiene(e) && !((e.alerta && conAlerta(r)) || (e.ref && esRef(r)) || (e.n5 && esN5(r)))) return false;
    return true;
  }
  function filtrar(renglones, filtros) { return (renglones || []).filter(function (r) { return cumple(r, filtros); }); }
  var hayFiltro = function () { return tiene(S.f.origen) || tiene(S.f.estado); };
  var CHIP_FN = { tu: function (r) { return r.o === 'tu'; }, agente: function (r) { return r.o === 'agente'; }, alerta: conAlerta, ref: esRef, n5: esN5 };

  /* ── modelo: centavos enteros, sumas hacia arriba ── */
  function modelo(M) {
    var tasa = typeof M.comision_fts === 'number' && M.comision_fts < 1 ? M.comision_fts : 0.055;
    var com = function (p) { return p * tasa / (1 + tasa); };
    var secs = (M.secciones || []).map(function (s, i) {
      var gs = (s.grupos || []).slice().sort(function (a, b) { return idx(a.k) - idx(b.k); }).map(function (g) {
        var filas = (g.renglones || []).map(function (r, j) {
          var sin = esN5(r) && r.tipo !== 'Mano de obra';
          return { r: r, k: 'r:' + i + ':' + g.k + ':' + j, c: cent(r.costo), p: sin ? 0 : cent(r.precio), sin: sin };
        });
        var t = suma(filas);
        return { g: g, k: 's' + i + ':' + g.k, nombre: SUB[g.k] || g.nombre || g.k, filas: filas, c: t.c, p: t.p, com: com(t.p) };
      });
      var t = suma(gs), comS = typeof s.comision_fts === 'number' && s.comision_fts >= 1 ? cent(s.comision_fts) : com(t.p);
      return { s: s, k: 's' + i, nombre: s.nombre || 'Sección ' + (i + 1), grupos: gs, c: t.c, p: t.p, com: comS };
    });
    var tot = suma(secs);
    tot.com = secs.reduce(function (a, s) { return a + s.com; }, 0);
    var todas = [];
    secs.forEach(function (s) { s.grupos.forEach(function (g) { g.filas.forEach(function (f) { todas.push(f); }); }); });
    return { secs: secs, tot: tot, todas: todas, tasa: tasa, com: com };
  }
  function idx(k) { var i = ORDEN.indexOf(k); return i < 0 ? 9 : i; }
  function suma(L) { return L.reduce(function (a, x) { a.c += x.c; a.p += x.p; return a; }, { c: 0, p: 0 }); }
  function margen(c, p, com) { return p ? (p - c - com) / p : null; }

  /* ── pintado ── */
  function nums(c, p, com, sinPrecio) {
    return '<span class="vz-nums" data-costo="' + c + '" data-precio="' + p + '"><span><small>Costo</small>' + dinero(c) + '</span>' +
      '<span class="p"><small>Precio</small>' + (sinPrecio ? 'sin precio' : dinero(p)) + '</span>' +
      '<span class="m"><small>Margen</small>' + (sinPrecio ? '—' : pc(margen(c, p, com))) + '</span></span>';
  }
  function quienDe(k, REF) {
    if (/^dato:/.test(k)) return 'dato tuyo';
    var d = REF[k] || {};
    return k + (d.quien ? ', ' + persona(d.quien) : '') + (d.origen ? ', ' + d.origen : '') + (d.texto ? ': ' + d.texto : '');
  }
  function persona(q) { return String(q).split(/[._\s]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function flags(r) {
    return (r.o === 'tu' ? '<span title="Lo dijiste tú">🔒</span>' : r.o === 'agente' ? '<span title="Lo supuso el agente">🤖</span>' : '') +
      (conAlerta(r) ? '<span title="Alerta">⚠</span>' : '') + (esRef(r) ? '<span title="Referencia">🔎</span>' : '') +
      (esN5(r) && r.tipo !== 'Mano de obra' ? '<span title="Sin precio">⛔</span>' : '');
  }
  function liga(h) {
    var s = String(h || '').trim(); if (!s) return '';
    var url = /^https?:\/\//i.test(s) ? s : (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) ? 'https://' + s : '');
    return url ? ' · <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(s.replace(/^https?:\/\//i, '')) + '</a>' : ' · ' + esc(s);
  }
  function detalle(f, REF, mon) {
    var r = f.r, pu = r.pu === null || r.pu === undefined ? 'sin precio' : dinero(cent(r.pu));
    var qty = r.qty == null ? '—' : Number(r.qty).toLocaleString('es-MX');
    var form = f.sin ? 'Sin precio: no se estima (N5).' : esc(qty) + ' × ' + pu + ' = ' + dinero(f.c) + '<br>Precio a cliente = ' + dinero(f.p) + ' (lo reparte el machote)';
    var quien = r.o === 'tu'
      ? '🔒 Lo dijiste tú' + ((r.dec || []).length ? ': ' + (r.dec || []).map(function (k) { return esc(quienDe(k, REF)); }).join('<br>') : '')
      : '🤖 Lo supuso el agente' + (r.tipo === 'Mano de obra' ? ' (tarifa de plantilla del machote)' : ', con la fuente de arriba');
    return '<dl><dt>Descripción completa</dt><dd>' + esc(r.d) + '</dd>' +
      '<dt>Cantidad</dt><dd>' + esc(qty) + ' ' + esc(r.unidad || '') + ' · P. unitario ' + pu + (r.moneda || mon ? ' ' + esc(r.moneda || mon) : '') + '</dd>' +
      '<dt>Nivel</dt><dd>' + (r.nivel ? esc(NIVEL[r.nivel] || r.nivel) : (r.tipo === 'Mano de obra' ? 'Mano de obra (sin nivel)' : 'Sin nivel')) + '</dd>' +
      '<dt>Fuente</dt><dd>' + (r.liga ? 'Liga' + liga(r.liga) : (f.sin ? 'PENDIENTE PROVEEDOR' : 'sin liga')) + '</dd>' +
      '<dt>Fórmula</dt><dd><code>' + form + '</code></dd>' +
      '<dt>Quién</dt><dd>' + quien + '</dd>' +
      (conAlerta(r) ? '<dt>Alerta</dt><dd class="al">⚠ ' + esc(r.alerta) + '</dd>' : '') + '</dl>';
  }
  function abiertoK(k) { if (S.abiertos[k] !== undefined) return S.abiertos[k]; return hayFiltro() && k.charAt(0) === 's'; }
  function hhmm(iso) {
    var d = iso ? new Date(iso) : new Date(); if (isNaN(d)) d = new Date();
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function lista(L) { L = arr(L).filter(function (x) { return String(x || '').trim(); }); return L.length ? '<ul>' + L.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '—'; }
  function texto(x) { return x == null || String(x).trim() === '' ? '—' : esc(Array.isArray(x) ? x.join(' · ') : x); }

  function pintar() {
    var o = S.o || {}, M = S.M || {}, caso = o.caso || {}, H = o.hilo || {}, U = H.ultima || {}, T = o.terminos || {}, an = o.analisis || null;
    var D = modelo(M), REF = M.decretos_ref || {}, todas = D.todas;
    var mon = T.moneda || caso.moneda || M.moneda || ((todas[0] || {}).r || {}).moneda || '';
    var folio = caso.machote_folio || M.folio || '';
    var ver = o.version || U.version || (Array.isArray(H.trabajos) && H.trabajos.length ? H.trabajos.length : null);
    var verTxt = ver ? 'versión ' + ver : (U.trabajo_id ? 'trabajo ' + U.trabajo_id : '');
    var pct = typeof o.pct === 'number' ? o.pct : an ? (an.estado === 'cerrado' || an.estado === 'listo' ? 100 : (typeof an.pct === 'number' ? an.pct : null)) : null;
    var visibles = todas.filter(function (f) { return cumple(f.r, S.f); }).length;
    var nSin = todas.filter(function (f) { return f.sin; }).length;
    var mar = margen(D.tot.c, D.tot.p, D.tot.com);

    var h = '<div class="vz-barra"><button type="button" class="vz-atras" data-vz="cerrar" aria-label="Cerrar la vista ejecutiva">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><b>Vista ejecutiva del proyecto</b>' +
      '<button type="button" class="vz-cerrar" data-vz="cerrar">Cerrar</button></div>';
    h += '<main class="vz-pag">';
    h += '<div class="vz-marca"><span>USO INTERNO · no es la cotización del cliente</span><span>' + esc(folio) + (verTxt ? ' · ' + esc(verTxt) : '') + '</span></div>';
    h += '<header class="vz-cab"><h1>Vista ejecutiva del proyecto</h1><p class="vz-sub">' + esc([caso.titulo, caso.cliente].filter(Boolean).join(' · ') || '—') + '</p>' +
      '<div class="vz-vivo"><span class="vz-dato" id="vzDatos"><i></i>' + (S.leyendo ? 'Leyendo la versión vigente…' :
        'Datos de las ' + esc(S.hora) + (folio || verTxt ? ' · machote ' + esc([folio, verTxt].filter(Boolean).join(' ')) : '')) + '</span>' +
      (o.al && typeof o.al.actualizar === 'function' ? '<button type="button" data-vz="actualizar"' + (S.leyendo ? ' disabled' : '') + '>Actualizar</button>' : '') + '</div></header>';
    h += '<div class="vz-acc"><button type="button" class="vz-bt" data-vz="expandir">Expandir todo</button><button type="button" class="vz-bt" data-vz="colapsar">Colapsar todo</button>' +
      '<button type="button" class="vz-bt lleno" data-vz="imprimir">Descargar / imprimir</button></div>';
    if (!todas.length) h += '<p class="vz-vacio">Todavía no hay machote en esta conversación. Cuando el agente mande el BOM, aquí sale todo.</p>';
    h += '<section class="vz-tiles" id="vzResumen" data-costo="' + D.tot.c + '" data-precio="' + D.tot.p + '">' +
      '<div class="vz-tile"><small>Precio a cliente (total' + (mon ? ', ' + esc(mon) : '') + ')</small><b>' + dinero(D.tot.p) + '</b></div>' +
      '<div class="vz-tile"><small>Costo</small><b>' + dinero(D.tot.c) + '</b></div>' +
      '<div class="vz-tile"><small>Margen después de comisión</small><b>' + pc(mar) + '</b></div>' +
      (pct !== null ? '<div class="vz-tile"><small>Hacia el 100</small><b>' + esc(pct) + ' %</b><div class="vz-barra-av"><i style="width:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '%"></i></div></div>' : '') + '</section>';
    var pend = arr(o.decisionesPendientes).map(function (p) { return typeof p === 'string' ? { t: p } : { t: p.titulo || p.texto || p.q || '', por: p.por || p.id || '' }; }).filter(function (p) { return p.t; });
    var falta = arr(M.pendientes).map(function (p) { return { t: (p.titulo || '') + (arr(p.items).length ? ': ' + arr(p.items).join(' · ') : ''), por: 'para cotizar' }; }).filter(function (p) { return p.t; });
    h += '<section class="vz-caja"><h2>Decisiones pendientes vigentes (' + pend.length + ')</h2>' + (pend.length ? '<ul class="vz-pend">' +
      pend.map(function (p) { return '<li>' + esc(p.t) + (p.por ? ' <small>(' + esc(p.por) + ')</small>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="vz-nada">Ninguna.</p>') +
      (falta.length ? '<h2>Falta para cotizar (' + falta.length + ')</h2><ul class="vz-pend">' + falta.map(function (p) { return '<li>' + esc(p.t) + '</li>'; }).join('') + '</ul>' : '') + '</section>';
    var ops = arr(M.opciones).filter(function (x) { return x && x.nombre; });
    if (ops.length) h += '<section class="vz-caja"><h2>Opciones aparte (el cliente elige; no suman al total)</h2><ul class="vz-ops">' + ops.map(function (x) {
      var c = cent(x.costo), p = cent(x.precio);
      return '<li><span>' + esc(x.nombre) + '</span><b>' + (p ? dinero(p) : 'sin precio') + '</b>' + (c ? '<small>costo ' + dinero(c) + '</small>' : '') + '</li>';
    }).join('') + '</ul></section>';
    var sups = arr(o.supuestos).map(function (x) { return typeof x === 'string' ? x : (x && (x.vigente || x.texto) ? (x.vigente || x.texto) + (x.fuente ? ' (' + x.fuente + ')' : '') : ''); }).concat(arr(T.supuestos));
    var lugar = T.lugar || (M.viaje && typeof M.viaje.lugar === 'string' ? M.viaje.lugar : '');
    var ab = abiertoK('info');
    h += '<section class="vz-caja vz-info vz-n1" data-k="info"><button type="button" class="vz-fila" aria-expanded="' + ab + '" data-k="info">' + CHEV +
      '<span class="vz-nom"><b>Alcance, exclusiones, supuestos, tiempo, lugar, moneda e impuestos</b></span><span></span></button>' +
      '<div class="vz-cuerpo"' + (ab ? '' : ' hidden') + '><dl><dt>Alcance</dt><dd>' + (Array.isArray(T.alcance) ? lista(T.alcance) : texto(T.alcance)) + '</dd>' +
      '<dt>Exclusiones</dt><dd>' + lista(T.exclusiones) + '</dd><dt>Supuestos</dt><dd>' + lista(sups) + '</dd>' +
      '<dt>Tiempo de ejecución</dt><dd>' + texto(T.tiempo) + '</dd><dt>Lugar</dt><dd>' + texto(lugar) + '</dd>' +
      '<dt>Moneda</dt><dd>' + texto(mon) + '</dd><dt>Impuestos</dt><dd>' + texto(T.impuestos) + '</dd></dl></div></section>';
    h += '<div class="vz-filtros" id="vzFiltros">' + CHIPS.map(function (c) {
      var n = todas.filter(function (f) { return CHIP_FN[c[1]](f.r); }).length;
      return '<button type="button" class="vz-chip" data-vz-f="' + c[0] + ':' + c[1] + '" aria-pressed="' + !!S.f[c[0]][c[1]] + '">' + c[2] + '<i>' + n + '</i></button>';
    }).join('') + '<p class="vz-fres" id="vzFres">' + (hayFiltro()
      ? 'Mostrando <b>' + visibles + '</b> de ' + todas.length + ' renglones (cumplen origen Y estado; dentro de cada grupo, cualquiera) · <button type="button" data-vz="quitar">Quitar filtros</button>'
      : ren(todas.length) + ' · ' + nSin + ' sin precio') + '</p></div>';
    h += '<p class="vz-leyenda">🔒 lo dijiste tú · 🤖 lo supuso el agente · ⚠ alerta · 🔎 referencia N3/N4 · ⛔ sin precio N5. Margen después de la comisión FTS (' +
      (D.tasa * 100).toFixed(1) + ' %) en cada nivel. Los totales de cada nivel son siempre los completos.</p>';
    h += '<div class="vz-arbol" id="vzArbol">' + D.secs.map(function (s) {
      var L = []; s.grupos.forEach(function (g) { L = L.concat(g.filas); });
      var vis = L.filter(function (f) { return cumple(f.r, S.f); }).length, a1 = abiertoK(s.k), sinS = L.filter(function (f) { return f.sin; }).length;
      return '<section class="vz-niv vz-n1' + (vis ? '' : ' vz-oculto') + '" data-k="' + s.k + '" data-nivel="seccion"><button type="button" class="vz-fila" aria-expanded="' + a1 + '" data-k="' + s.k + '">' + CHEV +
        '<span class="vz-nom"><b>' + esc(s.nombre) + '</b><small>' + ren(L.length) + (sinS ? ' · <span class="mal">' + sinS + ' sin precio</span>' : '') + (hayFiltro() ? ' · ' + vis + ' con el filtro' : '') + '</small></span>' +
        nums(s.c, s.p, s.com) + '</button><div class="vz-cuerpo"' + (a1 ? '' : ' hidden') + '>' + s.grupos.map(function (g) {
          var a2 = abiertoK(g.k), vg = g.filas.filter(function (f) { return cumple(f.r, S.f); }).length;
          return '<div class="vz-niv vz-n2' + (vg ? '' : ' vz-oculto') + '" data-k="' + g.k + '" data-nivel="grupo"><button type="button" class="vz-fila" aria-expanded="' + a2 + '" data-k="' + g.k + '">' + CHEV +
            '<span class="vz-nom"><b>' + esc(g.nombre) + '</b><small>' + ren(g.filas.length) + '</small></span>' + nums(g.c, g.p, g.com) + '</button>' +
            '<div class="vz-cuerpo"' + (a2 ? '' : ' hidden') + '>' + g.filas.map(function (f) {
              var r = f.r, a3 = S.abiertos[f.k] === true;
              return '<div class="vz-niv vz-n3' + (cumple(r, S.f) ? '' : ' vz-oculto') + '" data-k="' + esc(f.k) + '" data-nivel="renglon" data-costo="' + f.c + '" data-precio="' + f.p + '">' +
                '<button type="button" class="vz-fila" aria-expanded="' + a3 + '" data-k="' + esc(f.k) + '">' + CHEV +
                '<span class="vz-nom"><span class="d">' + (r.nivel ? '<span class="vz-badge ' + esc(r.nivel) + '">' + esc(r.nivel) + '</span>' : '') + esc(r.d) + '</span>' +
                '<small>' + (r.qty != null ? esc(Number(r.qty).toLocaleString('es-MX')) + ' ' + esc(r.unidad || '') : '') + ' <span class="vz-flags">' + flags(r) + '</span></small></span>' +
                nums(f.c, f.p, D.com(f.p), f.sin) + '</button><div class="vz-det"' + (a3 ? '' : ' hidden') + '>' + detalle(f, REF, mon) + '</div></div>';
            }).join('') + '</div></div>';
        }).join('') + '</div></section>';
    }).join('') + '</div>';
    h += '<section class="vz-total" id="vzTotal" data-costo="' + D.tot.c + '" data-precio="' + D.tot.p + '"><b>Total</b>' + nums(D.tot.c, D.tot.p, D.tot.com) + '</section>';
    h += '</main>';
    var y = S.el.scrollTop;
    S.el.innerHTML = h;
    S.el.scrollTop = y;
  }

  function llaves() {
    var k = ['info'], D = modelo(S.M || {});
    D.secs.forEach(function (s) { k.push(s.k); s.grupos.forEach(function (g) { k.push(g.k); g.filas.forEach(function (f) { k.push(f.k); }); }); });
    return k;
  }
  function todo(v) { llaves().forEach(function (k) { S.abiertos[k] = v; }); pintar(); }

  function actualizar() {
    var al = S.o && S.o.al; if (!al || typeof al.actualizar !== 'function' || S.leyendo) return;
    S.leyendo = true; pintar();
    var fin = function (nuevo) {
      S.leyendo = false;
      if (nuevo && typeof nuevo === 'object' && nuevo.machote) { datos(nuevo); }
      else S.hora = hhmm(S.o && S.o.hilo && S.o.hilo.ultima && S.o.hilo.ultima.created_at);
      if (S.abierto) pintar();
    };
    var r;
    try { r = al.actualizar(); } catch (e) { fin(null); return; }
    if (r && typeof r.then === 'function') r.then(fin, function () { fin(null); }); else fin(r);
  }

  function clic(e) {
    var b = e.target.closest ? e.target.closest('button') : null; if (!b || !S.el.contains(b)) return;
    var a = b.getAttribute('data-vz');
    if (b.classList.contains('vz-fila')) { var k = b.getAttribute('data-k'); S.abiertos[k] = b.getAttribute('aria-expanded') !== 'true'; pintar(); return; }
    if (b.hasAttribute('data-vz-f')) {
      var p = b.getAttribute('data-vz-f').split(':'); S.f[p[0]][p[1]] = !S.f[p[0]][p[1]];
      Object.keys(S.abiertos).forEach(function (x) { if (x.charAt(0) === 's') delete S.abiertos[x]; });   // se abre el camino a lo que pasa
      pintar(); return;
    }
    if (a === 'cerrar') cerrar();
    else if (a === 'expandir') todo(true);
    else if (a === 'colapsar') todo(false);
    else if (a === 'quitar') { S.f = { origen: {}, estado: {} }; Object.keys(S.abiertos).forEach(function (x) { if (x.charAt(0) === 's') delete S.abiertos[x]; }); pintar(); }
    else if (a === 'actualizar') actualizar();
    else if (a === 'imprimir') { S.el.classList.add('vz-imp'); try { G.print(); } finally { setTimeout(function () { if (S.el) S.el.classList.remove('vz-imp'); }, 0); } }
  }
  function tecla(e) { if (S.abierto && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } }
  function pop() { if (S.abierto && S.hist && !(G.history.state && G.history.state.czVista === S.token)) { S.hist = false; quitar(); } }
  function antesImp() { if (S.el) S.el.classList.add('vz-imp'); }
  function despuesImp() { if (S.el) S.el.classList.remove('vz-imp'); }

  function css() {
    if (document.getElementById('cz-vista-css')) return;
    var st = document.createElement('style'); st.id = 'cz-vista-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  function datos(o) {
    S.o = o || {}; S.M = S.o.machote || {};
    S.hora = hhmm(S.o.hilo && S.o.hilo.ultima && S.o.hilo.ultima.created_at);
  }

  function abrir(o) {
    css(); datos(o);
    if (S.abierto) { pintar(); return; }
    S.abiertos = {}; S.f = { origen: {}, estado: {} }; S.leyendo = false;
    var el = document.createElement('div');
    el.id = 'cz-vista'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Vista ejecutiva del proyecto'); el.tabIndex = -1;
    document.body.appendChild(el); S.el = el; S.abierto = true;
    document.documentElement.classList.add('cz-vista-abierta');
    el.addEventListener('click', clic);
    document.addEventListener('keydown', tecla, true);
    G.addEventListener('popstate', pop);
    G.addEventListener('beforeprint', antesImp); G.addEventListener('afterprint', despuesImp);
    S.token = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);   // propio de esta apertura: un estado viejo (recarga) no la confunde
    try { G.history.pushState({ czVista: S.token }, ''); S.hist = true; } catch (e) { S.hist = false; }
    pintar();
    try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco no pasa nada */ }
  }
  function quitar() {
    if (!S.abierto) return;
    S.abierto = false;
    document.removeEventListener('keydown', tecla, true);
    G.removeEventListener('popstate', pop);
    G.removeEventListener('beforeprint', antesImp); G.removeEventListener('afterprint', despuesImp);
    if (S.el && S.el.parentNode) S.el.parentNode.removeChild(S.el);
    S.el = null;
    document.documentElement.classList.remove('cz-vista-abierta');
    var al = S.o && S.o.al;
    if (al && typeof al.cerrar === 'function') { try { al.cerrar(); } catch (e) { /* lo de afuera no detiene el cierre */ } }
  }
  /** Cierra. Si abrir() empujó un estado al historial, se regresa (el popstate hace el cierre). */
  function cerrar() {
    if (!S.abierto) return;
    if (S.hist && G.history.state && G.history.state.czVista === S.token) { G.history.back(); return; }
    S.hist = false; quitar();
  }

  var CSS = [
    '#cz-vista{--vz-fondo:var(--fondo,#f0f2f5);--vz-sup:var(--sup,#fff);--vz-sup2:var(--sup2,#f6f7f8);--vz-linea:var(--linea,#e3e6e8);--vz-texto:var(--texto,#111b21);',
    '--vz-sec:var(--sec,#5f6d76);--vz-ter:var(--ter,#8696a0);--vz-marca:var(--acento-osc,#008069);--vz-acento:var(--acento,#1daa61);--vz-sombra:var(--sombra,0 1px 2px rgba(11,20,26,.08));',
    '--vz-n1:#eef1f3;--vz-n2:#f7f9fa;--vz-ambar:var(--aviso,#fff3c4);--vz-ambar-b:#f0dc8c;--vz-ambar-t:#7a5600;--vz-rojo:#fdecec;--vz-rojo-b:#f3b9b9;--vz-rojo-t:var(--rojo,#a1262a);--vz-ok:#e7f6ee;--vz-ok-t:#0b6b45;',
    'position:fixed;inset:0;z-index:9000;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;background:var(--vz-fondo);color:var(--vz-texto);',
    'font-family:Roboto,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:14.5px;line-height:1.4;outline:none}',
    '#cz-vista *{box-sizing:border-box;margin:0;padding:0}',
    '#cz-vista button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}',
    '#cz-vista button:disabled{opacity:.5;cursor:default}',
    '#cz-vista a{color:var(--vz-marca)}',
    '#cz-vista .vz-barra{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;min-height:52px;padding:6px 10px 6px 4px;padding-top:max(6px,env(safe-area-inset-top,0px));background:var(--vz-sup);border-bottom:1px solid var(--vz-linea)}',
    '#cz-vista .vz-barra b{flex:1;min-width:0;font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#cz-vista .vz-atras{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}',
    '#cz-vista .vz-atras svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2.2}',
    '#cz-vista .vz-cerrar{flex-shrink:0;font-weight:600;font-size:13.5px;color:var(--vz-marca);padding:6px 10px;border-radius:16px}',
    '#cz-vista .vz-pag{max-width:1080px;margin:0 auto;padding:14px 16px 40px}',
    '#cz-vista .vz-cab h1{font-size:20px;font-weight:700;line-height:1.25}',
    '#cz-vista .vz-sub{color:var(--vz-sec);font-size:13px;margin-top:2px;overflow-wrap:anywhere}',
    '#cz-vista .vz-vivo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:13px}',
    '#cz-vista .vz-dato{display:inline-flex;align-items:center;gap:6px;background:var(--vz-ok);color:var(--vz-ok-t);border-radius:14px;padding:3px 10px;font-weight:600;max-width:100%}',
    '#cz-vista .vz-dato i{width:7px;height:7px;border-radius:50%;background:var(--vz-acento);flex-shrink:0}',
    '#cz-vista .vz-vivo button{color:var(--vz-marca);font-weight:600;font-size:13px}',
    '#cz-vista .vz-acc{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}',
    '#cz-vista .vz-bt{display:inline-flex;align-items:center;min-height:36px;padding:6px 14px;border-radius:18px;border:1px solid var(--vz-linea);background:var(--vz-sup);font-weight:600;font-size:13.5px;white-space:nowrap}',
    '#cz-vista .vz-bt.lleno{background:var(--vz-marca);border-color:var(--vz-marca);color:#fff}',
    '#cz-vista .vz-vacio{margin:10px 0;padding:10px 12px;border-radius:12px;background:var(--vz-ambar);color:var(--vz-ambar-t);font-size:13.5px}',
    '#cz-vista .vz-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}',
    '#cz-vista .vz-tile{background:var(--vz-sup);border:1px solid var(--vz-linea);border-radius:12px;padding:10px 12px;box-shadow:var(--vz-sombra);min-width:0}',
    '#cz-vista .vz-tile small{display:block;font-size:12px;color:var(--vz-sec)}',
    '#cz-vista .vz-tile b{display:block;font-size:18px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
    '#cz-vista .vz-barra-av{height:6px;border-radius:3px;background:var(--vz-linea);margin-top:7px;overflow:hidden}',
    '#cz-vista .vz-barra-av i{display:block;height:100%;background:var(--vz-acento)}',
    '#cz-vista .vz-caja{background:var(--vz-sup);border:1px solid var(--vz-linea);border-radius:12px;box-shadow:var(--vz-sombra);margin:10px 0;overflow:hidden}',
    '#cz-vista .vz-caja h2{font-size:14px;font-weight:700;padding:10px 12px 0}',
    '#cz-vista .vz-nada{padding:4px 12px 10px;color:var(--vz-sec);font-size:13.5px}',
    '#cz-vista .vz-pend{list-style:none;padding:6px 12px 10px}',
    '#cz-vista .vz-pend li{padding:6px 0 6px 22px;position:relative;border-bottom:1px solid var(--vz-linea);font-size:13.5px;overflow-wrap:anywhere}',
    '#cz-vista .vz-pend li:last-child{border-bottom:0}',
    '#cz-vista .vz-pend li::before{content:"!";position:absolute;left:0;top:7px;width:16px;height:16px;border-radius:50%;background:var(--vz-ambar);color:var(--vz-ambar-t);font-size:11px;font-weight:700;text-align:center;line-height:16px}',
    '#cz-vista .vz-pend small{color:var(--vz-ter)}',
    '#cz-vista .vz-ops{list-style:none;padding:6px 12px 10px}',
    '#cz-vista .vz-ops li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:6px 0;border-bottom:1px solid var(--vz-linea);font-size:13.5px}',
    '#cz-vista .vz-ops li:last-child{border-bottom:0}',
    '#cz-vista .vz-ops span{flex:1 1 220px;min-width:0;overflow-wrap:anywhere}',
    '#cz-vista .vz-ops b{font-variant-numeric:tabular-nums}',
    '#cz-vista .vz-ops small{color:var(--vz-ter);font-size:12px}',
    '#cz-vista .vz-info dl{padding:4px 12px 10px}',
    '#cz-vista .vz-info dt{font-size:12px;font-weight:700;color:var(--vz-marca);text-transform:uppercase;letter-spacing:.3px;margin-top:8px}',
    '#cz-vista .vz-info dd{font-size:13.5px;overflow-wrap:anywhere}',
    '#cz-vista .vz-info dd ul{margin:2px 0 0 18px}',
    '#cz-vista .vz-filtros{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:12px 0 6px}',
    '#cz-vista .vz-chip{height:32px;padding:0 12px;border-radius:16px;border:1px solid var(--vz-linea);background:var(--vz-sup);font-size:13px;white-space:nowrap}',
    '#cz-vista .vz-chip[aria-pressed="true"]{background:var(--vz-marca);border-color:var(--vz-marca);color:#fff}',
    '#cz-vista .vz-chip i{font-style:normal;opacity:.75;margin-left:4px}',
    '#cz-vista .vz-fres{font-size:12.5px;color:var(--vz-sec);width:100%}',
    '#cz-vista .vz-fres button{color:var(--vz-marca);font-weight:600}',
    '#cz-vista .vz-leyenda{font-size:12px;color:var(--vz-ter);margin-bottom:8px}',
    '#cz-vista .vz-arbol{display:flex;flex-direction:column;gap:8px}',
    '#cz-vista .vz-niv{min-width:0}',
    '#cz-vista .vz-n1{background:var(--vz-sup);border:1px solid var(--vz-linea);border-radius:12px;overflow:hidden;box-shadow:var(--vz-sombra)}',
    '#cz-vista .vz-fila{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:4px 8px;align-items:center;width:100%;text-align:left;padding:10px 12px}',
    '#cz-vista .vz-n1>.vz-fila{background:var(--vz-n1)}',
    '#cz-vista .vz-info>.vz-fila{background:var(--vz-sup)}',
    '#cz-vista .vz-n2>.vz-fila{padding-left:22px;background:var(--vz-n2);border-top:1px solid var(--vz-linea)}',
    '#cz-vista .vz-n3>.vz-fila{padding-left:32px;border-top:1px solid var(--vz-linea)}',
    '#cz-vista .vz-chev{width:18px;height:18px;fill:none;stroke:var(--vz-sec);stroke-width:2;transition:transform .15s}',
    '#cz-vista .vz-fila[aria-expanded="true"] .vz-chev{transform:rotate(90deg)}',
    '#cz-vista .vz-nom{min-width:0}',
    '#cz-vista .vz-nom b{font-weight:600}',
    '#cz-vista .vz-n1 .vz-nom b{font-size:15px}',
    '#cz-vista .vz-n3 .vz-nom span.d{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#cz-vista .vz-nom small{display:block;color:var(--vz-sec);font-size:12px}',
    '#cz-vista .mal{color:var(--vz-rojo-t);font-weight:600}',
    '#cz-vista .vz-nums{display:grid;grid-template-columns:repeat(3,auto);gap:0 14px;text-align:right;font-variant-numeric:tabular-nums}',
    '#cz-vista .vz-nums span{display:block;white-space:nowrap}',
    '#cz-vista .vz-nums small{display:block;font-size:10.5px;color:var(--vz-ter);text-transform:uppercase;letter-spacing:.3px}',
    '#cz-vista .vz-nums .p{font-weight:600}',
    '#cz-vista .vz-nums .m{color:var(--vz-ok-t)}',
    '#cz-vista .vz-n1 .vz-nums{font-size:14.5px}',
    '#cz-vista .vz-n3 .vz-nums{font-size:13px}',
    '#cz-vista .vz-cuerpo[hidden],#cz-vista .vz-det[hidden]{display:none}',
    '#cz-vista .vz-badge{display:inline-block;font-size:10.5px;font-weight:700;border-radius:5px;padding:0 5px;margin-right:4px;border:1px solid var(--vz-linea);background:var(--vz-sup2);color:var(--vz-sec);vertical-align:1px}',
    '#cz-vista .vz-badge.N3,#cz-vista .vz-badge.N4{background:var(--vz-ambar);border-color:var(--vz-ambar-b);color:var(--vz-ambar-t)}',
    '#cz-vista .vz-badge.N5{background:var(--vz-rojo);border-color:var(--vz-rojo-b);color:var(--vz-rojo-t)}',
    '#cz-vista .vz-flags{font-size:12px;margin-left:2px;letter-spacing:1px}',
    '#cz-vista .vz-det{padding:4px 12px 12px 54px;border-top:1px dashed var(--vz-linea);background:var(--vz-sup2)}',
    '#cz-vista .vz-det dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:4px 12px;font-size:13px}',
    '#cz-vista .vz-det dt{color:var(--vz-sec)}',
    '#cz-vista .vz-det dd{min-width:0;overflow-wrap:anywhere}',
    '#cz-vista .vz-det .al{color:var(--vz-rojo-t)}',
    '#cz-vista .vz-det code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;white-space:normal;overflow-wrap:anywhere}',
    '#cz-vista .vz-total{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 8px;margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--vz-sup);border:2px solid var(--vz-marca)}',
    '#cz-vista .vz-total>b{font-size:15px}',
    '#cz-vista .vz-filtros,#cz-vista .vz-niv,#cz-vista .vz-caja{scroll-margin-top:64px}',
    '#cz-vista .vz-marca{display:none}',
    '#cz-vista .vz-oculto{display:none !important}',
    /* hasta 900 px: los números bajan debajo del nombre (721–980 es donde se rompían las páginas, §20 #20) */
    '@media (max-width:900px){',
    '  #cz-vista .vz-fila{grid-template-columns:20px minmax(0,1fr)}',
    '  #cz-vista .vz-fila .vz-nums{grid-column:2;justify-content:start;text-align:left;margin-top:2px}',
    '  #cz-vista .vz-n2>.vz-fila{padding-left:16px}',
    '  #cz-vista .vz-n3>.vz-fila{padding-left:22px}',
    '  #cz-vista .vz-det{padding-left:22px}',
    '  #cz-vista .vz-total{grid-template-columns:minmax(0,1fr)}',
    '  #cz-vista .vz-total .vz-nums{justify-content:start;text-align:left}',
    '}',
    '@media (max-width:560px){',
    '  #cz-vista .vz-det dl{grid-template-columns:1fr}',
    '  #cz-vista .vz-det dt{margin-top:4px}',
    '  #cz-vista .vz-nums{gap:0 10px}',
    '  #cz-vista .vz-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '  #cz-vista .vz-tile b{font-size:16px}',
    '}',
    /* impresión: PDF INTERNO, solo la vista, todo expandido */
    '#cz-vista.vz-imp .vz-barra,#cz-vista.vz-imp .vz-acc,#cz-vista.vz-imp .vz-filtros,#cz-vista.vz-imp .vz-leyenda,#cz-vista.vz-imp .vz-vivo button{display:none !important}',
    '#cz-vista.vz-imp .vz-cuerpo,#cz-vista.vz-imp .vz-det,#cz-vista.vz-imp .vz-oculto{display:block !important}',
    '#cz-vista.vz-imp .vz-chev{visibility:hidden}',
    '#cz-vista.vz-imp .vz-marca{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:space-between;border:2px solid #a1262a;color:#a1262a;font-weight:700;font-size:12px;padding:4px 10px;border-radius:6px;margin-bottom:10px;letter-spacing:.5px}',
    '@media print{',
    '  @page{size:letter;margin:12mm}',
    '  html.cz-vista-abierta,html.cz-vista-abierta body{height:auto !important;overflow:visible !important;background:#fff !important}',
    '  html.cz-vista-abierta body>*:not(#cz-vista){display:none !important}',
    '  #cz-vista{position:static !important;inset:auto;overflow:visible !important;background:#fff;color:#111}',
    '  #cz-vista .vz-barra,#cz-vista .vz-acc,#cz-vista .vz-filtros,#cz-vista .vz-leyenda,#cz-vista .vz-vivo button{display:none !important}',
    '  #cz-vista .vz-cuerpo,#cz-vista .vz-det,#cz-vista .vz-oculto{display:block !important}',
    '  #cz-vista .vz-chev{visibility:hidden}',
    '  #cz-vista .vz-marca{display:flex !important;flex-wrap:wrap;gap:4px 12px;justify-content:space-between;border:2px solid #a1262a;color:#a1262a;font-weight:700;font-size:12px;padding:4px 10px;border-radius:6px;margin-bottom:10px;letter-spacing:.5px}',
    '  #cz-vista .vz-pag{max-width:none;padding:0}',
    '  #cz-vista .vz-n1,#cz-vista .vz-caja,#cz-vista .vz-tile{box-shadow:none}',
    '  #cz-vista .vz-n3{break-inside:avoid}',
    '}'
  ].join('\n');

  G.CzVista = { abrir: abrir, cerrar: cerrar, abierto: function () { return S.abierto; }, filtrar: filtrar };
})(typeof window !== 'undefined' ? window : this);
