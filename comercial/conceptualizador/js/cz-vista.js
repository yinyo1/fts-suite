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
  var NIVEL = { N0: 'N0 · Lo dio la persona', N1: 'N1 · Proveedor', N2: 'N2 · Web MX', N3: 'N3 · Lista de referencia de otro país', N4: 'N4 · Paramétrico', N5: 'N5 · Pendiente: sin precio' };
  var CHEV = '<svg class="vz-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  var S = { abierto: false, o: null, M: null, abiertos: {}, f: { origen: {}, estado: {} }, el: null, hist: false, token: '', hora: '', leyendo: false,
    v: 'fts', aviso: 0, ok2: false,
    preg: null, okInt: false,
    n0: null, n0msg: {},
    rt: {}, revMsg: {} };   // V1.63b (`secciones_v163`) · la pestaña abierta de cada sección y lo que contestó el servidor al marcarla   // V1.62a (`n0_v162`) · el renglón cuyo precio se está corrigiendo y lo que contestó el servidor   // V1.58 (`menu_vista_v158`) · la pregunta antes de lo interno (vista o Excel) y si ya se dijo que sí   // V1.57b · versión FTS o cliente, y el paso de la doble confirmación

  /* ═══ V1.57b (fts-conceptualizador#12 punto 14, `vista_cliente`) · versión cliente y Excel ═══
   * Prototipo aprobado: prototipos/v157/vista-ejecutiva.html. La versión cliente es lo que el cliente puede ver: secciones,
   * conceptos, cantidad e importe, sacados de la cotización armada para Odoo (con las decisiones de la regla 15 aplicadas) y
   * revisados OTRA vez con CzRegla15 sobre el texto que se pinta; un banner dice si pasó. Para verla hay doble confirmación
   * (aviso → palomita «ya revisé») y la página lleva marca de agua «VERSIÓN CLIENTE». Excel con SheetJS 0.18.5 (cdnjs), que
   * se carga solo al tocar el botón; si no carga, CSV con BOM (lo abre Excel). Apagado: la vista de V1.57a. */
  var prendido = function (n) { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor(n) === true; } catch (e) { return false; } };
  function modeloCliente(o) {
    var c = o && o.cotizacion; if (!c || !(c.bloques || []).length) return null;
    var dec = (o.regla15 || []).filter(function (d) { return d && d.uso === 'limpio'; });
    if (G.CzRegla15 && dec.length) { try { c = G.CzRegla15.aplicar(c, dec); } catch (e) { /* sin aplicar: el revisor lo marca */ } }
    var secs = [], cur = null, lineas = function (t) { return String(t || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
    (c.bloques || []).forEach(function (b) {
      if (b.display_type === 'line_section') { cur = { nombre: b.nombre, partidas: [], p: 0 }; secs.push(cur); return; }
      if (!cur) { cur = { nombre: '', partidas: [], p: 0 }; secs.push(cur); }
      if (b.display_type === 'line_note') { cur.partidas.push({ nota: b.nombre }); return; }
      var L = lineas(b.nombre), q = Number(b.cantidad || 1), imp = cent(Number(b.precio || 0) * q);
      cur.partidas.push({ titulo: L[0] || '', vi: L.slice(1).filter(function (x) { return !/:$/.test(x); }).map(function (x) { return x.replace(/^[-•*] */, ''); }), q: q, imp: imp });
      cur.p += imp;
    });
    var op = c.opcionales && (c.opcionales.lineas || []).length ? c.opcionales : null;
    return { secs: secs, total: cent(c.suma), op: op, moneda: c.moneda || '', idioma: c.idioma || 'es' };
  }
  function textoCliente(C, T) {
    var t = [T.lugar, T.tiempo].concat(C.secs.map(function (s) { return [s.nombre].concat(s.partidas.map(function (p) { return p.nota || [p.titulo].concat(p.vi).join(' '); })).join(' '); }));
    if (C.op) t.push(C.op.titulo || '', C.op.nota || '', (C.op.lineas || []).map(function (l) { return l.nombre; }).join(' '));
    return t.filter(Boolean).join(' ');
  }
  function pintarCliente(o, T, folio, verTxt) {
    var C = modeloCliente(o), h = '<div class="vz-agua" aria-hidden="true"><span>VERSIÓN CLIENTE</span></div>';
    h += '<div class="vz-mcli"><span>VERSIÓN CLIENTE</span><span>' + esc(folio) + (verTxt ? ' · ' + esc(verTxt) : '') + '</span></div>';
    if (!C) return h + '<p class="vz-vacio">Todavía no hay cotización armada para el cliente. Sale en cuanto el agente proponga «Crear borrador en Odoo».</p>';
    // Lo liberado a propósito en la tarjeta del borrador (con su razón) no se vuelve a reclamar; se dice cuántas y quién.
    var lib = (o.regla15 || []).filter(function (d) { return d && d.uso === 'liberada' && d.original; });
    var tx = textoCliente(C, T); lib.forEach(function (d) { tx = tx.split(String(d.original).split('\n')[0]).join(' '); });
    var malos = G.CzRegla15 ? G.CzRegla15.revisar(tx).map(function (x) { return x.frase; }) : [];
    var quien = lib.map(function (d) { return d.por; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    h += '<div class="vz-rev' + (malos.length ? ' mal' : '') + '" id="vzRevisor">' + (malos.length ? '⚠ El revisor encontró texto interno: «' + malos.slice(0, 6).map(esc).join('», «') + '». No la compartas así: corrígelo en la tarjeta del borrador (regla 15).'
      : '✓ Revisada: sin costos, márgenes, proveedores ni cálculos internos.') +
      (lib.length ? ' ' + lib.length + (lib.length === 1 ? ' frase liberada' : ' frases liberadas') + ' a propósito' + (quien.length ? ' por ' + quien.map(esc).join(', ') : '') + '.' : '') + '</div>';
    var mon = C.moneda ? ' ' + esc(C.moneda) : '';
    h += '<section class="vz-tiles"><div class="vz-tile"><small>Total (más IVA)</small><b>' + dinero(C.total) + mon + '</b></div>' +
      (T.tiempo ? '<div class="vz-tile"><small>Tiempo</small><b class="t">' + texto(T.tiempo) + '</b></div>' : '') +
      (T.lugar ? '<div class="vz-tile"><small>Lugar</small><b class="t">' + texto(T.lugar) + '</b></div>' : '') + '</section>';
    h += '<div class="vz-cli">' + C.secs.map(function (s, i) {
      return '<section class="vz-csec"><div class="vz-csec-t"><b>' + (s.nombre ? (i + 1) + ' · ' + esc(s.nombre) : 'Conceptos') + '</b><span>' + dinero(s.p) + '</span></div>' +
        '<table><thead><tr><th>Concepto</th><th class="n">Cant.</th><th class="n">Importe</th></tr></thead><tbody>' + s.partidas.map(function (p) {
          if (p.nota) return '<tr><td colspan="3" class="nota">' + esc(p.nota) + '</td></tr>';
          return '<tr><td><b>' + esc(p.titulo) + '</b>' + (p.vi.length ? '<ul>' + p.vi.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</td>' +
            '<td class="n">' + (p.q === 1 ? '1 lote' : esc(p.q)) + '</td><td class="n">' + dinero(p.imp) + '</td></tr>';
        }).join('') + '</tbody></table></section>';
    }).join('') + '</div>';
    if (C.op) h += '<section class="vz-caja"><h2>' + esc(C.op.titulo || 'Opcionales') + ' (no suman al total)</h2>' + (C.op.nota ? '<p class="vz-nada">' + esc(C.op.nota) + '</p>' : '') +
      '<ul class="vz-ops">' + C.op.lineas.map(function (l) { return '<li><span>' + esc(String(l.nombre || '').split('\n')[0]) + '</span><b>' + dinero(cent(l.precio)) + '</b></li>'; }).join('') + '</ul></section>';
    h += '<section class="vz-total"><b>Total (más IVA)</b><span class="vz-nums"><span class="p">' + dinero(C.total) + mon + '</span></span></section>';
    return h;
  }
  /* V1.58 (`menu_vista_v158`, #12 punto g) · la versión cliente se abre DIRECTO (sin la doble confirmación de V1.57b): es la que se
   * puede enseñar. Lo que pregunta antes es lo INTERNO: pasar a la versión FTS desde la del cliente y bajar su Excel. */
  var menuV158 = function () { return prendido('menu_vista_v158'); };
  function preguntaHtml() {
    if (!S.preg) return '';
    var ex = S.preg === 'excel';
    return '<div class="vz-velo" role="dialog" aria-modal="true" aria-label="' + (ex ? 'Excel con datos internos' : 'Vista con datos internos') + '"><div class="vz-modal">' +
      '<p class="vz-alerta">' + (ex ? '¿Descargar el Excel con datos internos?' : '¿Abrir la vista con datos internos?') + '</p>' +
      '<p>' + (ex ? 'Trae costos, precio, margen, nivel y liga de cada renglón. Para mandárselo al cliente, baja el de la versión cliente.'
        : 'Trae <b>costos, márgenes, comisión FTS y fuentes</b> del proyecto. Si estás compartiendo pantalla con el cliente, quédate en la versión cliente.') + '</p>' +
      '<div class="vz-pie"><button type="button" class="vz-bt" data-vz="preg-no">Cancelar</button>' +
      (ex ? '<button type="button" class="vz-bt" data-vz="preg-cli">Bajar el del cliente</button>' : '') +
      '<button type="button" class="vz-bt lleno" data-vz="preg-si">' + (ex ? 'Sí, descargar el interno' : 'Sí, ver la interna') + '</button></div></div></div>';
  }
  function avisoHtml() {
    if (!S.aviso) return preguntaHtml();
    return '<div class="vz-velo" role="dialog" aria-modal="true" aria-label="Pasar a la versión cliente"><div class="vz-modal"><div class="vz-paso">Paso ' + S.aviso + ' de 2</div>' +
      '<p class="vz-alerta">Esta es la versión que se le puede mostrar al cliente.</p>' +
      (S.aviso === 1 ? '<p>Vas a ver solo secciones, conceptos, cantidades e importes. Revisa que no quede nada interno antes de compartir pantalla o mandar el Excel.</p>'
        : '<label class="vz-check"><input type="checkbox" id="vzOk2"' + (S.ok2 ? ' checked' : '') + '> Revisé que esta vista no lleva costos, márgenes, comisión, proveedores ni cálculos internos.</label>') +
      '<div class="vz-pie"><button type="button" class="vz-bt" data-vz="aviso-no">Cancelar</button><button type="button" class="vz-bt lleno" data-vz="aviso-si"' + (S.aviso === 2 && !S.ok2 ? ' disabled' : '') + '>' +
      (S.aviso === 1 ? 'Aceptar' : 'Mostrar versión cliente') + '</button></div></div></div>';
  }
  /** Las filas del Excel (todo expandido). FTS: costo, precio, margen, nivel y liga; cliente: solo lo que ve el cliente. */
  function filasExcel(v) {
    var o = S.o || {}, M = S.M || {};
    if (v === 'cliente') {
      var C = modeloCliente(o); if (!C) return [['Sin cotización armada para el cliente']];
      var out = [['Sección', 'Concepto', 'Incluye', 'Cantidad', 'Importe']];
      C.secs.forEach(function (s, i) { s.partidas.forEach(function (p) {
        if (p.nota) { out.push([(i + 1) + ' · ' + s.nombre, p.nota, '', '', '']); return; }
        out.push([(i + 1) + ' · ' + s.nombre, p.titulo, p.vi[0] || '', p.q, p.imp / 100]);
        p.vi.slice(1).forEach(function (x) { out.push(['', '', x, '', '']); });
      }); });
      if (C.op) C.op.lineas.forEach(function (l) { out.push(['Opcional (no suma)', String(l.nombre || '').split('\n')[0], '', 1, cent(l.precio) / 100]); });
      out.push(['Total (más IVA)', '', '', '', C.total / 100]);
      return out;
    }
    var D = modelo(M), f = [['Sección', 'Subgrupo', 'Descripción', 'Cantidad', 'Unidad', 'P.U. costo', 'Costo', 'Precio', 'Margen', 'Nivel', 'Liga', 'Origen', 'Alerta']];
    D.secs.forEach(function (s, i) {
      s.grupos.forEach(function (g) { g.filas.forEach(function (x) { var r = x.r;
        f.push([(i + 1) + ' · ' + s.nombre, g.nombre, r.d || '', r.qty == null ? '' : Number(r.qty), r.unidad || '', r.pu == null ? '' : Number(r.pu), x.c / 100, x.sin ? '' : x.p / 100,
          x.sin ? '' : Number((margen(x.c, x.p, D.com(x.p)) || 0).toFixed(4)), r.nivel || '', r.liga || '', r.o === 'tu' ? 'lo dijiste tú' : r.o === 'agente' ? 'lo supuso el agente' : '', r.alerta || '']); }); });
      f.push([(i + 1) + ' · ' + s.nombre + ' (subtotal)', '', '', '', '', '', s.c / 100, s.p / 100, Number((margen(s.c, s.p, s.com) || 0).toFixed(4)), '', '', '', '']);
    });
    f.push(['Total', '', '', '', '', '', D.tot.c / 100, D.tot.p / 100, Number((margen(D.tot.c, D.tot.p, D.tot.com) || 0).toFixed(4)), '', '', '', '']);
    return f;
  }
  function excel(vForzada) {
    var o = S.o || {}, caso = o.caso || {}, v = vForzada || S.v;
    var nombre = String((caso.machote_folio || 'vista') + (o.version ? '_v' + o.version : '') + '_' + (v === 'cliente' ? 'cliente' : 'FTS')).replace(/[^A-Za-z0-9_-]+/g, '-');
    var F = filasExcel(v);
    var baja = function (blob, ext) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); };
    var csv = function () { baja(new Blob(['\ufeff' + F.map(function (r) { return r.map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }), '.csv'); };
    var hoja = function () { try { var wb = G.XLSX.utils.book_new(); G.XLSX.utils.book_append_sheet(wb, G.XLSX.utils.aoa_to_sheet(F), v === 'cliente' ? 'Cotización' : 'Machote'); G.XLSX.writeFile(wb, nombre + '.xlsx'); } catch (e) { csv(); } };
    if (G.XLSX) return hoja();
    var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = hoja; sc.onerror = csv; document.head.appendChild(sc);
  }

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
      (esN5(r) && r.tipo !== 'Mano de obra' ? '<span title="Sin precio">⛔</span>' : '') +
      // V1.58 (`ligas_v158`) · el 🔴 de una liga que no abre el producto también en la fila cerrada; el motivo completo, en el detalle.
      (r.liga_mala && G.CzLigas && G.CzLigas.on158 && G.CzLigas.on158() ? '<span title="Liga sin producto: ' + esc(r.liga_mala) + '" data-lg8-fila="1">🔴</span>' : '');
  }
  function liga(h) {
    var s = String(h || '').trim(); if (!s) return '';
    var url = /^https?:\/\//i.test(s) ? s : (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) ? 'https://' + s : '');
    // V1.58 (`ligas_v158`) · el motor manda la liga COMPLETA: el texto se recorta a la vista y el href va entero.
    var L8 = prendido('ligas_v158') && G.CzLigas && G.CzLigas.recorta, txt = L8 ? G.CzLigas.recorta(s) : s.replace(/^https?:\/\//i, '');
    return url ? ' · <a href="' + esc(url) + '" target="_blank" rel="noopener"' + (L8 ? ' title="' + esc(url) + '"' : '') + '>' + esc(txt) + '</a>' : ' · ' + esc(s);
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
      '<dt>Nivel</dt><dd>' + (r.nivel && prendido('niveles_v158') && G.CzNiveles ? esc(G.CzNiveles.nombre(r.nivel)) + '<br><small>' + esc(G.CzNiveles.nota(r.nivel)) + '</small>' :
        r.nivel ? esc(NIVEL[r.nivel] || r.nivel) : (r.tipo === 'Mano de obra' ? 'Mano de obra (sin nivel)' : 'Sin nivel')) + '</dd>' +
      '<dt>Fuente</dt><dd>' + (r.liga ? 'Liga' + liga(r.liga) : (f.sin ? 'PENDIENTE PROVEEDOR' : 'sin liga')) +
        (prendido('ligas_v158') && G.CzLigas && G.CzLigas.piezas ? G.CzLigas.piezas(r, { sinLiga: true }) : '') + '</dd>' +
      '<dt>Fórmula</dt><dd><code>' + form + '</code></dd>' +
      '<dt>Quién</dt><dd>' + quien + '</dd>' +
      (conAlerta(r) ? '<dt>Alerta</dt><dd class="al">⚠ ' + esc(r.alerta) + '</dd>' : '') + '</dl>' + editorN0(f);
  }
  /* ═══ V1.62a (fts-conceptualizador#12 resultado 7, `n0_v162`) · N0 = el precio que dio la persona, corregido sobre el renglón ═══
   * Prototipo aprobado: prototipos/v162/menos-clics.html (escena n0). Solo en la vista INTERNA, solo renglones de material, servicio
   * o viaje (la mano de obra va en horas y tarifa), y solo si la pantalla pasó `al.n0`. Manda el evento `correccion` con
   * `datos.n0` = {seccion, partida, descripcion, pu, antes}; el motor, sin modelo, deja el decreto de la persona, el renglón N0 sin
   * folio ni liga y «Actualizar el machote» con la spec nueva. */
  function puedeN0(f) {
    var r = f.r; return S.v !== 'cliente' && prendido('n0_v162') && S.o && S.o.al && typeof S.o.al.n0 === 'function' &&
      r.tipo !== 'Mano de obra' && r.p !== null && r.p !== undefined && /^r:[0-9]+:/.test(f.k);
  }
  function editorN0(f) {
    if (!puedeN0(f)) return '';
    var r = f.r, m = S.n0msg[f.k];
    if (m) return '<div class="vz-n0 ' + (m.ok ? 'ok' : 'mal') + '" role="status">' + esc(m.texto) + '</div>';
    if (S.n0 !== f.k) return '<div class="vz-n0"><button type="button" class="vz-bt" data-vz-n0="' + esc(f.k) + '">Corregir precio (N0)</button>' +
      '<small>Para un precio que tú das (presupuesto, lo que te dijo el proveedor por teléfono). Queda como tu decreto, sin folio ni liga.</small></div>';
    var v = r.pu === null || r.pu === undefined ? '' : String(r.pu);
    return '<div class="vz-n0 edit"><label>Precio unitario (' + esc(r.moneda || '') + ')<input type="text" inputmode="decimal" id="vzN0v" value="' + esc(v) + '" autocomplete="off"></label>' +
      '<button type="button" class="vz-bt si" data-vz-n0g="' + esc(f.k) + '">Guardar como N0</button><button type="button" class="vz-bt" data-vz-n0x="1">Cancelar</button>' +
      '<small>Al guardar: el agente pone el renglón en N0 con tu decreto y te deja «Actualizar el machote». Queda en el hilo: quién, cuándo y antes → ahora.</small></div>';
  }
  function guardarN0(k) {
    var f = (modelo(S.M || {}).todas || []).filter(function (x) { return x.k === k; })[0]; if (!f) return;
    var inp = S.el && S.el.querySelector('#vzN0v'), pu = Number(String(inp ? inp.value : '').replace(/[$,\s]/g, ''));
    if (!(pu > 0)) { S.n0msg[k] = { ok: false, texto: 'Escribe un precio mayor que cero.' }; pintar(); setTimeout(function () { delete S.n0msg[k]; pintar(); }, 2500); return; }
    var sec = Number(k.split(':')[1]), r = f.r;
    S.n0 = null; S.n0msg[k] = { ok: true, texto: 'Mandando…' }; pintar();
    Promise.resolve(S.o.al.n0({ seccion: sec, partida: r.p, descripcion: r.d, pu: pu, antes: r.pu === undefined ? null : r.pu })).then(function (x) {
      S.n0msg[k] = x && x.ok ? { ok: true, texto: 'Listo: va como N0 (' + dinero(cent(pu)) + '). El agente actualiza el machote y te deja el botón en el chat.' }
        : { ok: false, texto: 'No se guardó: ' + ((x && (x.mensaje || x.error)) || 'sin respuesta') + '.' };
      pintar();
    }, function () { S.n0msg[k] = { ok: false, texto: 'No se guardó: sin señal.' }; pintar(); });
  }
  function abiertoK(k) { if (S.abiertos[k] !== undefined) return S.abiertos[k]; return hayFiltro() && k.charAt(0) === 's'; }
  function hhmm(iso) {
    var d = iso ? new Date(iso) : new Date(); if (isNaN(d)) d = new Date();
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function lista(L) { L = arr(L).filter(function (x) { return String(x || '').trim(); }); return L.length ? '<ul>' + L.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '—'; }
  function texto(x) { return x == null || String(x).trim() === '' ? '—' : esc(Array.isArray(x) ? x.join(' · ') : x); }

  /* ═══ V1.63b C (`secciones_v163`, #12) · revisión por secciones ═══
   * Cada sección del machote trae dos pestañas: «Definición de conceptos» (sus renglones, con su nivel) y «Cosas por definir»
   * (los N5 sin precio, las referencias N3/N4 y lo pendiente que la nombra). Un contador «definidos X de Y» y un toque para darla
   * por revisada, que se guarda en la base (evento `seccion_revisada`, quién y en qué versión). «Ya la mandé» se habilita solo con
   * todas las secciones revisadas (cz-acciones.js). Apagado: la vista de siempre. */
  var secOn = function () { return prendido('secciones_v163'); };
  function revisadas() { var o = S.o || {}, H = o.hilo || {}; return arr(H.secciones_revisadas); }
  function revisadaDe(nombre) { return revisadas().filter(function (x) { return x && x.seccion === nombre; })[0] || null; }
  function bloqueRevision(s, L) {
    var k = s.k, tab = S.rt[k] || 'def', rv = revisadaDe(s.nombre), msg = S.revMsg[k];
    var def = L.filter(function (f) { return !esN5(f.r); }).length;
    var pend = arr((S.o || {}).decisionesPendientes).map(function (p) { return typeof p === 'string' ? p : (p.titulo || p.texto || ''); })
      .filter(function (t) { return t && s.nombre && t.toLowerCase().indexOf(String(s.nombre).toLowerCase()) >= 0; });
    var porDef = L.filter(function (f) { return esN5(f.r); }).map(function (f) { return '⛔ Sin precio (N5): ' + f.r.d; })
      .concat(L.filter(function (f) { return esRef(f.r); }).map(function (f) { return '🔎 Precio de referencia (' + f.r.nivel + '): ' + f.r.d; }))
      .concat(pend.map(function (t) { return '❓ ' + t; }));
    var h = '<div class="vz-rsec" data-sec="' + esc(s.nombre) + '"><div class="vz-rsec-cab"><span class="vz-rsec-cnt">Definidos <b>' + def + ' de ' + L.length + '</b></span>' +
      (rv ? '<span class="vz-rsec-ok">✓ Revisada por ' + esc(persona(rv.por || '')) + (rv.version ? ' · v' + esc(rv.version) : '') + '</span>' +
        '<button type="button" class="vz-bt" data-vz-rev="' + esc(k) + ':0">Deshacer</button>'
        : '<button type="button" class="vz-bt lleno" data-vz-rev="' + esc(k) + ':1">Marcar sección revisada</button>') + '</div>' +
      (msg ? '<p class="vz-rsec-msg ' + (msg.ok ? 'ok' : 'mal') + '">' + esc(msg.texto) + '</p>' : '') +
      '<div class="vz-seg" role="tablist" aria-label="Revisión de ' + esc(s.nombre) + '">' +
      '<button type="button" role="tab" data-vz-rt="' + esc(k) + ':def" aria-selected="' + (tab === 'def') + '">Definición de conceptos</button>' +
      '<button type="button" role="tab" data-vz-rt="' + esc(k) + ':pen" aria-selected="' + (tab === 'pen') + '">Cosas por definir (' + porDef.length + ')</button></div>';
    if (tab === 'def') h += L.length ? '<ul class="vz-rsec-l">' + L.map(function (f) { return '<li>' + (f.r.nivel ? '<span class="vz-badge ' + esc(f.r.nivel) + '">' + esc(f.r.nivel) + '</span> ' : '') +
        esc(f.r.d) + (f.r.qty != null ? ' <small>' + esc(Number(f.r.qty).toLocaleString('es-MX')) + ' ' + esc(f.r.unidad || '') + '</small>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="vz-nada">Sin renglones.</p>';
    else h += porDef.length ? '<ul class="vz-rsec-l">' + porDef.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="vz-nada">Nada por definir en esta sección.</p>';
    return h + '</div>';
  }
  function marcar(k, valor) {
    var D = modelo(S.M || {}), s = D.secs.filter(function (x) { return x.k === k; })[0]; if (!s || !S.o.al || typeof S.o.al.seccion !== 'function') return;
    S.revMsg[k] = { ok: true, texto: 'Guardando…' }; pintar();
    Promise.resolve(S.o.al.seccion({ seccion: s.nombre, version: S.o.version || null, revisada: !!valor })).then(function (r) {
      if (r && r.ok) { if (S.o.hilo) S.o.hilo.secciones_revisadas = r.secciones_revisadas || []; delete S.revMsg[k]; }
      else S.revMsg[k] = { ok: false, texto: 'No se guardó: ' + ((r && (r.mensaje || r.error)) || 'sin respuesta') + '.' };
      pintar();
    }, function () { S.revMsg[k] = { ok: false, texto: 'No se guardó: sin señal.' }; pintar(); });
  }

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
    var VC = prendido('vista_cliente') || menuV158(); if (!VC) S.v = 'fts';
    h += '<div class="vz-acc">' + (VC ? '<div class="vz-seg" role="tablist" aria-label="Versión"><button type="button" role="tab" data-vz="v-fts" aria-selected="' + (S.v === 'fts') + '">Versión FTS</button>' +
      '<button type="button" role="tab" data-vz="v-cliente" aria-selected="' + (S.v === 'cliente') + '">Versión cliente</button></div>' : '') +
      (S.v === 'cliente' ? '' : '<button type="button" class="vz-bt" data-vz="expandir">Expandir todo</button><button type="button" class="vz-bt" data-vz="colapsar">Colapsar todo</button>') +
      '<button type="button" class="vz-bt' + (VC ? '' : ' lleno') + '" data-vz="imprimir">Descargar / imprimir</button>' +
      (VC ? '<button type="button" class="vz-bt lleno" data-vz="excel">⬇ Descargar Excel' + (S.v === 'cliente' ? ' (cliente)' : '') + '</button>' : '') + '</div>';
    if (VC && S.v === 'cliente') {
      h += pintarCliente(o, T, folio, verTxt) + '</main>' + avisoHtml();
      var y0 = S.el.scrollTop; S.el.innerHTML = h; S.el.classList.add('vz-ver-cliente'); S.el.scrollTop = y0; return;
    }
    S.el.classList.remove('vz-ver-cliente');
    if (!todas.length) h += '<p class="vz-vacio">Todavía no hay machote en esta conversación. Cuando el agente mande el BOM, aquí sale todo.</p>';
    h += '<section class="vz-tiles" id="vzResumen" data-costo="' + D.tot.c + '" data-precio="' + D.tot.p + '">' +
      '<div class="vz-tile"><small>Precio a cliente (total' + (mon ? ', ' + esc(mon) : '') + ')</small><b>' + dinero(D.tot.p) + '</b></div>' +
      '<div class="vz-tile"><small>Costo</small><b>' + dinero(D.tot.c) + '</b></div>' +
      '<div class="vz-tile"><small>Margen después de comisión</small><b>' + pc(mar) + '</b></div>' +
      // V1.52 · un solo dato: % de referencia y alertas, los MISMOS del mensaje, la tarjeta y la franja (o.indicadores = CzIndicadores).
      (o.indicadores && G.CzIndicadores ? '<div class="vz-tile" data-vz-ind="ref"><small>Costo en referencia N3/N4</small><b>' + esc((o.indicadores.referencia_pct || 0) + ' %') + '</b></div>' +
        '<div class="vz-tile" data-vz-ind="alertas" title="' + esc(G.CzIndicadores.textoAlertas(o.indicadores) || 'Sin alertas') + '"><small>Alertas</small><b>' + esc(o.indicadores.alertas.total) + '</b>' +
        (o.indicadores.alertas.total ? '<small>' + esc(G.CzIndicadores.textoAlertas(o.indicadores).replace(/^\d+ alertas? /, '')) + '</small>' : '') + '</div>' : '') +
      (secOn() && D.secs.length ? '<div class="vz-tile" data-vz-ind="secciones"><small>Secciones revisadas</small><b>' + D.secs.filter(function (s) { return revisadaDe(s.nombre); }).length + ' de ' + D.secs.length + '</b></div>' : '') +
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
        '<span class="vz-nom"><b>' + esc(s.nombre) + (secOn() && revisadaDe(s.nombre) ? ' <span class="vz-rsec-ok">✓</span>' : '') + '</b><small>' + ren(L.length) + (sinS ? ' · <span class="mal">' + sinS + ' sin precio</span>' : '') + (hayFiltro() ? ' · ' + vis + ' con el filtro' : '') + '</small></span>' +
        nums(s.c, s.p, s.com) + '</button><div class="vz-cuerpo"' + (a1 ? '' : ' hidden') + '>' + (secOn() ? bloqueRevision(s, L) : '') + s.grupos.map(function (g) {
          var a2 = abiertoK(g.k), vg = g.filas.filter(function (f) { return cumple(f.r, S.f); }).length;
          return '<div class="vz-niv vz-n2' + (vg ? '' : ' vz-oculto') + '" data-k="' + g.k + '" data-nivel="grupo"><button type="button" class="vz-fila" aria-expanded="' + a2 + '" data-k="' + g.k + '">' + CHEV +
            '<span class="vz-nom"><b>' + esc(g.nombre) + '</b><small>' + ren(g.filas.length) + '</small></span>' + nums(g.c, g.p, g.com) + '</button>' +
            '<div class="vz-cuerpo"' + (a2 ? '' : ' hidden') + '>' + g.filas.map(function (f) {
              var r = f.r, a3 = S.abiertos[f.k] === true;
              return '<div class="vz-niv vz-n3' + (cumple(r, S.f) ? '' : ' vz-oculto') + '" data-k="' + esc(f.k) + '" data-nivel="renglon" data-costo="' + f.c + '" data-precio="' + f.p + '">' +
                '<button type="button" class="vz-fila" aria-expanded="' + a3 + '" data-k="' + esc(f.k) + '">' + CHEV +
                '<span class="vz-nom"><span class="d">' + (r.nivel ? (prendido('niveles_v158') && G.CzNiveles ? G.CzNiveles.chip(r.nivel, { k: 'vz-' + f.k, corto: true }) + ' ' : '<span class="vz-badge ' + esc(r.nivel) + '">' + esc(r.nivel) + '</span>') : '') + esc(r.d) + '</span>' +
                '<small>' + (r.qty != null ? esc(Number(r.qty).toLocaleString('es-MX')) + ' ' + esc(r.unidad || '') : '') + ' <span class="vz-flags">' + flags(r) + '</span></small></span>' +
                nums(f.c, f.p, D.com(f.p), f.sin) + '</button><div class="vz-det"' + (a3 ? '' : ' hidden') + '>' + detalle(f, REF, mon) + '</div></div>';
            }).join('') + '</div></div>';
        }).join('') + '</div></section>';
    }).join('') + '</div>';
    h += '<section class="vz-total" id="vzTotal" data-costo="' + D.tot.c + '" data-precio="' + D.tot.p + '"><b>Total</b>' + nums(D.tot.c, D.tot.p, D.tot.com) + '</section>';
    h += '</main>' + avisoHtml();
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
    if (b.hasAttribute('data-vz-n0')) { S.n0 = b.getAttribute('data-vz-n0'); pintar(); var i0 = S.el.querySelector('#vzN0v'); if (i0) i0.focus(); return; }
    if (b.hasAttribute('data-vz-n0g')) { guardarN0(b.getAttribute('data-vz-n0g')); return; }
    if (b.hasAttribute('data-vz-n0x')) { S.n0 = null; pintar(); return; }
    if (b.hasAttribute('data-vz-rt')) { var t = b.getAttribute('data-vz-rt').split(':'); S.rt[t[0]] = t[1]; pintar(); return; }
    if (b.hasAttribute('data-vz-rev')) { var t2 = b.getAttribute('data-vz-rev').split(':'); marcar(t2[0], t2[1] === '1'); return; }
    if (a === 'cerrar') cerrar();
    else if (a === 'expandir') todo(true);
    else if (a === 'colapsar') todo(false);
    else if (a === 'quitar') { S.f = { origen: {}, estado: {} }; Object.keys(S.abiertos).forEach(function (x) { if (x.charAt(0) === 's') delete S.abiertos[x]; }); pintar(); }
    else if (a === 'actualizar') actualizar();
    else if (a === 'v-fts' && menuV158() && S.v === 'cliente' && !S.okInt) { S.preg = 'interno'; pintar(); }
    else if (a === 'v-fts') { S.v = 'fts'; S.aviso = 0; pintar(); }
    else if (a === 'v-cliente' && menuV158()) { if (S.v !== 'cliente') { S.v = 'cliente'; S.aviso = 0; S.el.scrollTop = 0; pintar(); } }
    else if (a === 'v-cliente') { if (S.v !== 'cliente') { S.aviso = 1; S.ok2 = false; pintar(); } }
    else if (a === 'preg-no') { S.preg = null; pintar(); }
    else if (a === 'preg-cli') { S.preg = null; pintar(); excel('cliente'); }
    else if (a === 'preg-si') { var q = S.preg; S.preg = null; if (q === 'excel') { pintar(); excel(); } else { S.okInt = true; S.v = 'fts'; S.el.scrollTop = 0; pintar(); } }
    else if (a === 'excel' && menuV158() && S.v !== 'cliente') { S.preg = 'excel'; pintar(); }
    else if (a === 'aviso-no') { S.aviso = 0; pintar(); }
    else if (a === 'aviso-si') { if (S.aviso === 1) { S.aviso = 2; pintar(); } else if (S.ok2) { S.aviso = 0; S.v = 'cliente'; S.el.scrollTop = 0; pintar(); } }
    else if (a === 'excel') excel();
    else if (a === 'imprimir') { S.el.classList.add('vz-imp'); try { G.print(); } finally { setTimeout(function () { if (S.el) S.el.classList.remove('vz-imp'); }, 0); } }
  }
  function tecla(e) { if (S.abierto && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (S.aviso || S.preg) { S.aviso = 0; S.preg = null; pintar(); return; } cerrar(); } }
  function cambio(e) { if (e.target && e.target.id === 'vzOk2') { S.ok2 = !!e.target.checked; var b = S.el.querySelector('[data-vz="aviso-si"]'); if (b) b.disabled = !S.ok2; } }
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
    S.abiertos = {}; S.f = { origen: {}, estado: {} }; S.leyendo = false; S.v = 'fts'; S.aviso = 0; S.ok2 = false; S.preg = null; S.okInt = false;
    // V1.58 (`menu_vista_v158`) · desde el ⋮: «para el cliente» abre en su versión; «interno» ya se confirmó antes de abrir.
    if (menuV158() && S.o.inicio === 'cliente') S.v = 'cliente';
    if (menuV158() && S.o.inicio === 'interna') S.okInt = true;
    var el = document.createElement('div');
    el.id = 'cz-vista'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Vista ejecutiva del proyecto'); el.tabIndex = -1;
    document.body.appendChild(el); S.el = el; S.abierto = true;
    document.documentElement.classList.add('cz-vista-abierta');
    el.addEventListener('click', clic); el.addEventListener('change', cambio);
    document.addEventListener('keydown', tecla, true);
    G.addEventListener('popstate', pop);
    G.addEventListener('beforeprint', antesImp); G.addEventListener('afterprint', despuesImp);
    S.token = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);   // propio de esta apertura: un estado viejo (recarga) no la confunde
    try { G.history.pushState({ czVista: S.token }, ''); S.hist = true; } catch (e) { S.hist = false; }
    pintar();
    try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco no pasa nada */ }
    // V1.63g (`voz_visor_v163g`) · el micrófono de la vista: revisar la cotización por voz (cz-vozvista.js).
    if (prendido('voz_visor_v163g') && G.CzVozVista && S.o.caso && S.o.caso.id) G.CzVozVista.montar({ el: el, caso: S.o.caso, idioma: S.o.idioma, cola: G.CzCola, resolver: S.o.al && S.o.al.resolver });
  }
  function quitar() {
    if (!S.abierto) return;
    S.abierto = false;
    if (G.CzVozVista && G.CzVozVista.montado()) G.CzVozVista.desmontar();
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
    '#cz-vista .vz-rsec{border:1px solid #d1d7db;border-radius:10px;padding:10px 12px;margin:8px 0 10px;background:#fbfcfc}',
    '#cz-vista .vz-rsec-cab{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px}',
    '#cz-vista .vz-rsec-cnt{font-size:13px;color:#54656f}', '#cz-vista .vz-rsec-ok{color:#1f7a4d;font-weight:600;font-size:13px}',
    '#cz-vista .vz-rsec-msg{font-size:12.5px;margin:0 0 6px}', '#cz-vista .vz-rsec-msg.mal{color:#b3261e}',
    '#cz-vista .vz-rsec-l{list-style:none;padding:6px 2px 0;margin:0;display:flex;flex-direction:column;gap:5px;font-size:13.5px;overflow-wrap:anywhere}',
    '#cz-vista .vz-rsec-l small{color:#667781}',
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
    '#cz-vista .vz-n0{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}',
    '#cz-vista .vz-n0 small{flex-basis:100%;color:var(--vz-sec)}',
    '#cz-vista .vz-n0 label{display:flex;flex-direction:column;gap:4px;flex:1 1 160px;min-width:0;color:var(--vz-sec)}',
    '#cz-vista .vz-n0 input{font:inherit;padding:8px 10px;border:1px solid var(--vz-linea);border-radius:8px;background:var(--vz-fondo,#fff);color:inherit;min-width:0}',
    '#cz-vista .vz-n0.ok{color:#166534}#cz-vista .vz-n0.mal{color:#b42318}',
    '#cz-vista .vz-n0 .vz-bt{border:1px solid var(--vz-linea);border-radius:18px;padding:7px 14px;background:transparent;color:inherit;font:inherit;cursor:pointer}',
    '#cz-vista .vz-n0 .vz-bt.si{background:#00a884;border-color:#00a884;color:#fff}',
    '#cz-vista .vz-det dd{min-width:0;overflow-wrap:anywhere}',
    '#cz-vista .vz-det .al{color:var(--vz-rojo-t)}',
    '#cz-vista .vz-det code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;white-space:normal;overflow-wrap:anywhere}',
    '#cz-vista .vz-total{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 8px;margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--vz-sup);border:2px solid var(--vz-marca)}',
    '#cz-vista .vz-total>b{font-size:15px}',
    '#cz-vista .vz-filtros,#cz-vista .vz-niv,#cz-vista .vz-caja{scroll-margin-top:64px}',
    '#cz-vista .vz-marca{display:none}',
    // V1.57b · versión cliente, doble confirmación y marca de agua
    '#cz-vista .vz-seg{display:inline-flex;border:1px solid var(--vz-linea);border-radius:18px;overflow:hidden;background:var(--vz-sup)}',
    '#cz-vista .vz-seg button{padding:6px 12px;font-weight:600;font-size:13.5px;min-height:36px}',
    '#cz-vista .vz-seg button[aria-selected="true"]{background:var(--vz-marca);color:#fff}',
    '#cz-vista .vz-mcli{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:space-between;background:#b42318;color:#fff;font-weight:800;letter-spacing:.06em;font-size:12.5px;padding:5px 12px;border-radius:8px;margin:10px 0 6px}',
    '#cz-vista .vz-agua{position:fixed;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;z-index:0;overflow:hidden}',
    '#cz-vista .vz-agua span{transform:rotate(-24deg);font-weight:900;font-size:clamp(34px,9vw,96px);color:rgba(180,35,24,.08);letter-spacing:.06em;white-space:nowrap}',
    '#cz-vista .vz-pag{position:relative;z-index:1}',
    '#cz-vista .vz-rev{background:var(--vz-ok);color:var(--vz-ok-t);border-radius:8px;padding:7px 10px;font-size:13px;margin:8px 0;font-weight:600}',
    '#cz-vista .vz-rev.mal{background:var(--vz-rojo);color:var(--vz-rojo-t);border:1px solid var(--vz-rojo-b)}',
    '#cz-vista .vz-tile b.t{font-size:14px;line-height:1.3;overflow-wrap:anywhere}',
    '#cz-vista.vz-ver-cliente .vz-tile b{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}',
    '#cz-vista .vz-csec{background:var(--vz-sup);border:1px solid var(--vz-linea);border-radius:10px;margin:10px 0;overflow:hidden}',
    '#cz-vista .vz-csec-t{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--vz-n1);font-size:14px}',
    '#cz-vista .vz-csec-t b{min-width:0;overflow-wrap:anywhere}#cz-vista .vz-csec-t span{white-space:nowrap;font-weight:700}',
    '#cz-vista .vz-csec table{width:100%;border-collapse:collapse;font-size:13.5px}',
    '#cz-vista .vz-csec th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--vz-sec);padding:6px 12px;border-bottom:1px solid var(--vz-linea)}',
    '#cz-vista .vz-csec td{padding:8px 12px;vertical-align:top;border-bottom:1px solid var(--vz-linea);overflow-wrap:anywhere}',
    '#cz-vista .vz-csec .n{text-align:right;white-space:nowrap}#cz-vista .vz-csec td.nota{font-style:italic;color:var(--vz-sec)}',
    '#cz-vista .vz-csec ul{margin:4px 0 0 18px;color:var(--vz-sec)}',
    '#cz-vista .vz-velo{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}',
    '#cz-vista .vz-modal{background:var(--vz-sup);border-radius:12px;max-width:440px;width:100%;padding:16px}',
    '#cz-vista .vz-paso{font-size:12px;color:var(--vz-sec);font-weight:600;text-transform:uppercase;letter-spacing:.05em}',
    '#cz-vista .vz-alerta{color:#b42318;font-weight:800;font-size:16px;line-height:1.35;margin:6px 0 8px}',
    '#cz-vista .vz-modal p{margin:6px 0;font-size:14px}',
    '#cz-vista .vz-check{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:14px}#cz-vista .vz-check input{width:20px;height:20px;margin-top:1px;flex-shrink:0}',
    '#cz-vista .vz-pie{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:12px}',
    '@media (max-width:560px){#cz-vista .vz-csec th:nth-child(2),#cz-vista .vz-csec td.n:nth-child(2){display:none}}',
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
