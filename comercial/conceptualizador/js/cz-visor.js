/* ═══ Conceptualizador · «Ver cotización»: el visor de la cotización en Odoo y el ciclo de corrección (V1.51) ═══
 *
 * Prototipo aprobado por Esteban: fts-conceptualizador, prototipos/v150/visor-cotizacion.html (frente 3 de #4).
 *
 *  · BOTÓN: cuando el caso ya tiene cotización en Odoo (acción `crear_borrador` hecha con `resultado.orden_id`), el chat
 *    lleva una tarjeta tipo documento: «Cotización SO11925 · borrador», «1 partida · Total $ 6,445.00 USD» y, si hubo una
 *    versión anterior, la píldora verde «Cambió: …».
 *  · VISOR: casi a pantalla completa (pantalla completa abajo de 720 px) con la cotización como HOJA CARTA blanca, como la
 *    ve el cliente: empresa, cliente, número y estado, fecha, vigencia, descripción del proyecto, partidas con sus viñetas,
 *    opcionales (NO suman), subtotal / impuesto / total, términos y anticipo. Nunca costos.
 *    «Descargar PDF» = window.print con hoja carta (solo sale la hoja). Se cierra con «Cerrar», Esc, Atrás del navegador y
 *    tocando fuera del panel.
 *  · CORRECCIÓN: «Corregir por texto» / «Corregir por voz» llaman `opciones.alCorregir(modo, version)`; quien integra
 *    enfoca la caja de texto con «Corrección a la cotización SO11925: ». Las versiones anteriores se ven (solo lectura).
 *
 * De dónde sale cada cosa: la ESTRUCTURA (partidas con viñetas, opcionales, idioma, impuesto, anticipo) de lo que el motor
 * mandó (`accion.datos.cotizacion`); los MONTOS y el estado, del read-back de Odoo (`accion.resultado`), que es la verdad (§8).
 * Este archivo no escribe nada ni llama a la red: solo pinta.
 */
(function (G) {
  'use strict';
  var D = G.document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (x) { return x === null || x === undefined || x === '' || !isFinite(Number(x)) ? null : Number(x); };
  var fmt = function (n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  /** «$ 6,445.00 USD» (con espacio, como el prototipo). */
  var din = function (n, mon) { return num(n) === null ? '—' : '$ ' + fmt(n) + (mon ? ' ' + mon : ''); };
  /** «$6,445.00» (sin espacio): el de la línea «Cambió». */
  var dinC = function (n) { return '$' + fmt(n); };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var dos = function (n) { return (n < 10 ? '0' : '') + n; };

  var TX = {
    es: { cot: 'Cotización', borrador: 'Borrador', enviada: 'Enviada', cliente: 'Cliente', fecha: 'Fecha', vence: 'Vence', moneda: 'Moneda',
      proyecto: 'Proyecto', desc: 'Descripción', qty: 'Cantidad', pu: 'Precio unitario', imp: 'Impuestos', importe: 'Importe', lote: 'Lote',
      sub: 'Subtotal', tax: 'Impuestos', total: 'Total', terminos: 'Términos y condiciones', opc: 'Opcionales', fuera: 'No incluidos en el total',
      ant: function (p, m) { return 'Anticipo: ' + p + ' % (' + m + ') con la orden de compra.'; }, pag: 'Página 1 / 1' },
    en: { cot: 'Quotation', borrador: 'Draft', enviada: 'Sent', cliente: 'Customer', fecha: 'Quotation Date', vence: 'Expiration', moneda: 'Currency',
      proyecto: 'Project', desc: 'Description', qty: 'Quantity', pu: 'Unit Price', imp: 'Taxes', importe: 'Amount', lote: 'Lot',
      sub: 'Untaxed Amount', tax: 'Taxes', total: 'Total', terminos: 'Terms and conditions', opc: 'Optional items', fuera: 'Not included in the total',
      ant: function (p, m) { return 'Down payment: ' + p + ' % (' + m + ') with the purchase order.'; }, pag: 'Page 1 / 1' }
  };
  var EMPRESA = {
    // Nombre y ciudad tal como están en Odoo (res.company 1 y 6, leídos el 16-oct-2026).
    1: { nombre: 'Servicios FTS', lugar: 'Monterrey, Nuevo León · México', corto: 'FTS México',
      // V1.53b · datos fiscales leídos de Odoo (res.company 1, 18-oct-2026): vat, street, city, zip.
      fiscal: 'RFC SFT170905L43 · Luis G Urbina 2213, Monterrey, Nuevo León, C.P. 64550' },
    6: { nombre: 'FTS Full Technology Systems LLC', lugar: 'Hayward, California · United States', corto: 'FTS USA',
      fiscal: 'Tax ID 32088797249 · 23415 Cabot Blvd, Hayward, California 94545' }
  };
  var on = function (n) { try { return !!(G.CzInterruptor && G.CzInterruptor(n)); } catch (e) { return false; } };

  // ── datos ───────────────────────────────────────────────────────────────
  /** Las versiones de la cotización del caso, de la más vieja a la más nueva. */
  function ordenes(hilo) {
    var A = (hilo && hilo.acciones) || [];
    return A.map(function (a, i) { return { a: a, i: i }; })
      .filter(function (x) { var a = x.a; return a && a.tipo === 'crear_borrador' && a.estado === 'hecha' && a.resultado && a.resultado.orden_id; })
      .sort(function (x, y) { var tx = Date.parse(x.a.hecha_at || x.a.at || ''), ty = Date.parse(y.a.hecha_at || y.a.at || '');
        return (isFinite(tx) && isFinite(ty) && tx !== ty) ? tx - ty : x.i - y.i; })
      .map(function (x) { var a = x.a; return { accion_id: a.id, at: a.hecha_at || a.at || a.creada_at || null, resultado: a.resultado,
        cotizacion: (a.datos && a.datos.cotizacion) || null }; });
  }
  /** «enviada» posterior gana: el estado vigente de la versión. */
  function estadoDe(hilo, v, esUltima) {
    var e = (v.resultado && v.resultado.estado) || 'draft';
    if (!esUltima) return e;
    var tv = Date.parse(v.at || '');
    ((hilo && hilo.acciones) || []).forEach(function (a) {
      if (!a || a.tipo !== 'enviada' || a.estado !== 'hecha' || !a.resultado || !a.resultado.estado) return;
      var ta = Date.parse(a.hecha_at || a.at || '');
      if (!isFinite(tv) || !isFinite(ta) || ta >= tv) e = a.resultado.estado;
    });
    return e;
  }
  var idiomaDe = function (v) { var c = v.cotizacion || {}; return c.idioma === 'en' || c.idioma === 'es' ? c.idioma : (Number(c.empresa_id) === 6 ? 'en' : 'es'); };
  var monedaDe = function (v) { return (v.resultado && v.resultado.moneda) || (v.cotizacion && v.cotizacion.moneda) || ''; };
  var totalDe = function (v) { var r = v.resultado || {}; return num(r.total) !== null ? num(r.total) : num((v.cotizacion || {}).suma); };
  /** Partidas con precio: de los bloques del motor; el precio, del read-back cuando cuadran uno a uno. */
  function partidas(v) {
    var c = v.cotizacion || {}, R = ((v.resultado || {}).renglones) || [], out = [], sec = null;
    if ((c.bloques || []).length) {
      c.bloques.forEach(function (b) {
        if (b.display_type === 'line_section') { sec = String(b.nombre || ''); out.push({ tipo: 'sec', texto: sec }); return; }
        if (b.display_type === 'line_note') { out.push({ tipo: 'nota', texto: String(b.nombre || '') }); return; }
        out.push({ tipo: 'lin', nombre: String(b.nombre || ''), cantidad: num(b.cantidad) === null ? 1 : num(b.cantidad), precio: num(b.precio) });
      });
      var L = out.filter(function (x) { return x.tipo === 'lin'; });
      if (L.length === R.length) L.forEach(function (x, i) { if (num(R[i].precio) !== null) x.precio = num(R[i].precio); });
      return out;
    }
    return R.map(function (r) { return { tipo: 'lin', nombre: String(r.texto || ''), cantidad: 1, precio: num(r.precio) }; });
  }
  var conPrecio = function (v) { return partidas(v).filter(function (x) { return x.tipo === 'lin'; }); };
  var titulo = function (nombre) { return String(nombre || '').split('\n')[0].trim(); };
  var nOpc = function (v) { var o = (v.cotizacion || {}).opcionales; return o && o.lineas ? o.lineas.length : (((v.resultado || {}).opcionales) || []).length; };
  var plural = function (n, s, p) { return n + ' ' + (n === 1 ? s : p); };

  /** El impuesto en una frase corta: «sales tax MS 7 % propuesto», «IVA 16 %», «sin impuesto». */
  function impuestoFrase(v) {
    var c = v.cotizacion || {}, I = c.impuesto, usa = Number(c.empresa_id) === 6 || I && I.pais === 'US';
    if (!I || I.ok === false || !I.decision || I.decision === 'sin_dato' || num(I.tasa) === null) return 'sin impuesto';
    var nom = usa ? 'sales tax' + (I.estado ? ' ' + I.estado : '') : 'IVA';
    var base = nom + ' ' + num(I.tasa) + ' %';
    return I.decision === 'aplicar' ? base : I.decision === 'confirmar' ? base + ' por confirmar' : base + ' propuesto';
  }

  /** Qué cambió entre dos versiones, en una línea. */
  function queCambio(antes, despues) {
    if (!antes || !despues) return 'Sin cambios contra la versión anterior';
    var P = [], la = conPrecio(antes), ld = conPrecio(despues), ia = idiomaDe(antes), id = idiomaDe(despues);
    if (la.length !== ld.length) P.push(la.length + ' ' + (la.length === 1 ? 'partida' : 'partidas') + ' → ' + ld.length);
    if (ia !== id) P.push(id === 'en' ? 'todo en inglés' : 'todo en español');
    var fa = impuestoFrase(antes), fd = impuestoFrase(despues);
    if (fa !== fd) P.push(fd === 'sin impuesto' ? 'sin impuesto (antes ' + fa + ')' : fd);
    if (ia === id) {
      var da = String((antes.cotizacion || {}).descripcion_proyecto || '').trim(), dd = String((despues.cotizacion || {}).descripcion_proyecto || '').trim();
      if (da !== dd) P.push(!da ? 'descripción del proyecto nueva' : !dd ? 'sin descripción del proyecto' : 'descripción del proyecto cambió');
      if (la.length === ld.length) {
        var ren = ld.filter(function (x, i) { return titulo(x.nombre) !== titulo(la[i].nombre); }).length;
        if (ren) P.push(ren === 1 ? '1 partida renombrada' : ren + ' partidas renombradas');
        else {
          var vin = ld.filter(function (x, i) { return x.nombre !== la[i].nombre; }).length;
          if (vin) P.push(vin === 1 ? 'viñetas de 1 partida' : 'viñetas de ' + vin + ' partidas');
        }
      }
    }
    var oa = nOpc(antes), od = nOpc(despues);
    if (oa !== od) P.push('opcionales ' + oa + ' → ' + od);
    var ta = totalDe(antes), td = totalDe(despues), ma = monedaDe(antes), md = monedaDe(despues);
    if (ta !== null && td !== null && (Math.round(ta * 100) !== Math.round(td * 100) || ma !== md))
      P.push('total ' + dinC(ta) + (ma !== md ? ' ' + ma : '') + ' → ' + dinC(td) + (md ? ' ' + md : ''));
    else if (ma !== md) P.push('moneda ' + ma + ' → ' + md);
    return P.length ? P.join(' · ') : 'Sin cambios contra la versión anterior';
  }

  // ── la tarjeta del chat ─────────────────────────────────────────────────
  var ICO = {
    ojo: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    pdf: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    x: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    lapiz: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    mic: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    izq: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    der: '<svg class="vco-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  var estadoTxt = function (e) { return e === 'sent' ? 'enviada' : e === 'sale' ? 'confirmada' : 'borrador'; };

  function boton(hilo) {
    var V = ordenes(hilo); if (!V.length) return '';
    css();
    var v = V[V.length - 1], r = v.resultado || {}, n = conPrecio(v).length, nom = r.orden_nombre || ('#' + r.orden_id);
    var cam = V.length > 1 ? queCambio(V[V.length - 2], v) : '';
    return '<div class="vco-doc"><div class="vco-doc-top"><div class="vco-doc-ic">PDF</div><div class="vco-doc-tx"><b>Cotización ' + esc(nom) + ' · ' + estadoTxt(estadoDe(hilo, v, true)) + '</b>' +
      '<span>' + plural(n, 'partida', 'partidas') + ' · Total ' + esc(din(totalDe(v), monedaDe(v))) + '</span>' +
      (cam ? '<span class="vco-cambio">Cambió: ' + esc(cam) + '</span>' : '') + '</div></div>' +
      '<button type="button" class="vco-doc-ver" data-cz-visor="' + esc(v.accion_id == null ? '' : v.accion_id) + '">' + ICO.ojo + 'Vista rápida</button></div>';   // V1.56 · «Ver cotización» es el PDF de Odoo (cz-enviar.js)
  }

  // ── la hoja ─────────────────────────────────────────────────────────────
  function fechaDe(iso, en) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else { var t = new Date(iso); if (!isFinite(t.getTime())) return ''; y = t.getFullYear(); mo = t.getMonth() + 1; d = t.getDate(); }
    return en ? dos(mo) + '/' + dos(d) + '/' + y : dos(d) + '/' + dos(mo) + '/' + y;
  }
  function cuando(iso) { var t = new Date(iso || ''); return isFinite(t.getTime()) ? t.getDate() + '-' + MESES[t.getMonth()] + ' ' + dos(t.getHours()) + ':' + dos(t.getMinutes()) : ''; }

  /** «Título \n El servicio incluye: \n - a \n - b» → título en negritas, encabezado y viñetas. */
  function descripcion(nombre) {
    var L = String(nombre || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!L.length) return '';
    var h = '<b>' + esc(L[0]) + '</b>', ul = [], resto = [];
    L.slice(1).forEach(function (x) { if (/^[-•*]\s*/.test(x)) ul.push(x.replace(/^[-•*]\s*/, '')); else { if (ul.length) { resto.push({ ul: ul }); ul = []; } resto.push({ p: x }); } });
    if (ul.length) resto.push({ ul: ul });
    resto.forEach(function (b) { h += b.p ? '<p>' + esc(b.p) + '</p>' : '<ul>' + b.ul.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; });
    return h;
  }

  /** Los términos de Odoo son HTML: solo <p>, <b>, <ul>, <li>, <br>; lo demás se quita (texto adentro sí, sin atributos). */
  var PERMITIDAS = { P: 'p', B: 'b', STRONG: 'b', UL: 'ul', LI: 'li', BR: 'br' };
  var FUERA = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, IMG: 1, SVG: 1, MATH: 1, VIDEO: 1, AUDIO: 1, SOURCE: 1, PICTURE: 1, LINK: 1, META: 1, TEMPLATE: 1, NOSCRIPT: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, CANVAS: 1, FRAME: 1, FRAMESET: 1, HEAD: 1, TITLE: 1 };
  function limpio(html) {
    var s = String(html || ''); if (!s.trim()) return '';
    var doc;
    try { doc = new G.DOMParser().parseFromString('<!doctype html><body>' + s, 'text/html'); } catch (e) { return '<p>' + esc(s.replace(/<[^>]*>/g, ' ')) + '</p>'; }
    function rec(n) {
      var o = '';
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { o += esc(c.nodeValue); continue; }
        if (c.nodeType !== 1) continue;
        var t = c.tagName.toUpperCase();
        if (FUERA[t]) continue;
        var k = PERMITIDAS[t];
        if (k === 'br') o += '<br>';
        else if (k) o += '<' + k + '>' + rec(c) + '</' + k + '>';
        else o += rec(c);
      }
      return o;
    }
    return rec(doc.body);
  }

  function hoja(hilo, V, idx) {
    var v = V[idx], c = v.cotizacion || {}, r = v.resultado || {}, lg = idiomaDe(v), en = lg === 'en', X = TX[lg];
    var emp = EMPRESA[Number(c.empresa_id)] || (en ? EMPRESA[6] : EMPRESA[1]), mon = monedaDe(v), I = c.impuesto || null;
    var est = estadoDe(hilo, v, idx === V.length - 1), estTx = est === 'sent' ? X.enviada : est === 'sale' ? (en ? 'Confirmed' : 'Confirmada') : X.borrador;
    var aplica = I && I.decision === 'aplicar' && num(I.tasa) !== null;
    var taxLin = aplica ? ((Number(c.empresa_id) === 6 || I.pais === 'US') ? 'Sales tax ' + (I.estado ? I.estado + ' ' : '') + num(I.tasa) + ' %' : 'IVA ' + num(I.tasa) + ' %') : '';
    var h = '';
    h += '<header class="vco-h-cab"><div class="vco-logo"><i>FTS</i></div><div class="vco-emp"><b>' + esc(emp.nombre) + '</b>' + esc(emp.lugar) + '</div></header>';
    if (on('pantalla_v153')) {
      cssV153();
      // V1.53b (#6, punto 11) · datos fiscales de FTS y del cliente, y quién cotiza. El RFC del cliente sale de lo que releyó
      // orden-odoo (`resultado.partner_vat`, V1.53b.1); en una orden guardada antes, su nombre como está en Odoo.
      // Un nombre, nunca el usuario: «Esteban De La Cruz» si la base lo trae; si no, el nombre de pila del usuario («Esteban»).
      var cs = (hilo && hilo.caso) || {}, an = String(cs.autor_nombre || '').trim(), pila = String(cs.autor || '').split('.')[0];
      var quien = /\s/.test(an) ? an : pila ? pila.charAt(0).toUpperCase() + pila.slice(1) : '';
      h += '<div class="vco-h-fis"><div><small>' + (en ? 'From' : 'De') + '</small><b>' + esc(emp.nombre) + '</b>' + esc(emp.fiscal || emp.lugar) + (quien ? '<span>' + (en ? 'Quoted by: ' : 'Cotizó: ') + esc(quien) + '</span>' : '') + '</div>' +
        '<div><small>' + X.cliente + '</small><b>' + esc(r.partner || '—') + '</b>' + (r.partner_vat ? esc((en ? 'Tax ID ' : 'RFC ') + r.partner_vat) : '') + (r.partner_domicilio ? '<span>' + esc(r.partner_domicilio) + '</span>' : '') + '</div></div>';
    } else h += '<div class="vco-h-cli"><div><small>' + X.cliente + '</small><b>' + esc(r.partner || '—') + '</b></div></div>';
    h += '<h1 class="vco-h-tit">' + X.cot + ' <b>' + esc(r.orden_nombre || ('#' + r.orden_id)) + '</b> <span class="vco-est vco-est-' + esc(est) + '">' + esc(estTx) + '</span></h1>';
    h += '<div class="vco-h-info">' + (v.at ? '<div><small>' + X.fecha + '</small>' + esc(fechaDe(v.at, en)) + '</div>' : '') +
      (r.vence_el ? '<div><small>' + X.vence + '</small>' + esc(fechaDe(r.vence_el, en)) + '</div>' : '') +
      (mon ? '<div><small>' + X.moneda + '</small>' + esc(mon) + '</div>' : '') + '</div>';
    if (c.descripcion_proyecto) h += '<p class="vco-h-proy"><small>' + X.proyecto + '</small>' + esc(c.descripcion_proyecto) + '</p>';
    var cols = aplica ? ' vco-con-imp' : '';
    h += '<div class="vco-tabla"><div class="vco-lin vco-cab-t' + cols + '"><div class="vco-c-desc">' + X.desc + '</div><div>' + X.qty + '</div><div>' + X.pu + '</div>' + (aplica ? '<div>' + X.imp + '</div>' : '') + '<div>' + X.importe + '</div></div>';
    partidas(v).forEach(function (p) {
      if (p.tipo === 'sec') { h += '<div class="vco-lin vco-sec">' + esc(p.texto) + '</div>'; return; }
      if (p.tipo === 'nota') { h += '<div class="vco-lin vco-nota">' + esc(p.texto) + '</div>'; return; }
      var imp = p.precio === null ? null : p.precio * p.cantidad;
      h += '<div class="vco-lin' + cols + '"><div class="vco-c-desc">' + descripcion(p.nombre) + '</div>' +
        '<div data-l="' + X.qty + '">' + fmt(p.cantidad) + ' ' + X.lote + '</div><div data-l="' + X.pu + '">' + (p.precio === null ? '—' : fmt(p.precio)) + '</div>' +
        (aplica ? '<div data-l="' + X.imp + '">' + esc(taxLin) + '</div>' : '') + '<div data-l="' + X.importe + '"><b>' + esc(din(imp)) + '</b></div></div>';
    });
    h += '</div>';
    // totales
    var sub = num(r.subtotal) !== null ? num(r.subtotal) : num(c.suma), tot = totalDe(v), impN = num(r.impuesto);
    if (impN === null && sub !== null && tot !== null) impN = Math.round((tot - sub) * 100) / 100;
    var ley = I && (I.decision === 'proponer' || I.decision === 'confirmar') ? ((I.leyenda && (I.leyenda[lg] || I.leyenda.en)) || (en ? 'Sales tax not included, if applicable.' : 'No incluye impuesto sobre ventas, si aplica.')) : '';
    h += '<div class="vco-tot"><table><tr><td>' + X.sub + '</td><td>' + esc(din(sub, mon)) + '</td></tr>';
    if (aplica) h += '<tr><td>' + esc(taxLin) + '</td><td>' + esc(din(impN, mon)) + '</td></tr>';
    else if (ley) h += '<tr><td colspan="2" class="vco-ley">' + esc(ley) + '</td></tr>';
    else if (impN !== null) h += '<tr><td>' + X.tax + '</td><td>' + esc(din(impN, mon)) + '</td></tr>';
    h += '<tr class="vco-gran"><td>' + X.total + '</td><td>' + esc(din(tot, mon)) + '</td></tr></table></div>';
    var A = c.anticipo;
    if (A && A.aplica && num(A.pct)) h += '<p class="vco-ant">' + esc(X.ant(num(A.pct), din(num(A.monto) !== null ? A.monto : (sub || 0) * A.pct / 100, mon))) + '</p>';
    // opcionales: fuera del total
    var O = c.opcionales;
    if (O && (O.lineas || []).length) {
      h += '<section class="vco-opc"><h3>' + esc(O.titulo || X.opc) + ' <span class="vco-fuera">' + X.fuera + '</span></h3>' + (O.nota ? '<p class="vco-opc-nota">' + esc(O.nota) + '</p>' : '') +
        '<div class="vco-tabla">' + O.lineas.map(function (l) {
          var q = num(l.cantidad) === null ? 1 : num(l.cantidad), pr = num(l.precio);
          return '<div class="vco-lin"><div class="vco-c-desc">' + descripcion(l.nombre) + '</div><div data-l="' + X.qty + '">' + fmt(q) + ' ' + X.lote + '</div>' +
            '<div data-l="' + X.pu + '">' + (pr === null ? '—' : fmt(pr)) + '</div><div data-l="' + X.importe + '"><b>' + esc(din(pr === null ? null : pr * q)) + '</b></div></div>';
        }).join('') + '</div></section>';
    } else if ((r.opcionales || []).length) {
      h += '<section class="vco-opc"><h3>' + X.opc + ' <span class="vco-fuera">' + X.fuera + '</span></h3><ul>' + r.opcionales.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>';
    }
    var nota = limpio(String(r.nota_orden || '').trim() ? r.nota_orden : c.nota_orden);
    if (nota) h += '<section class="vco-terminos"><h3>' + X.terminos + '</h3>' + nota + '</section>';
    // V1.53b · la página la pone el navegador al imprimir («Página 1 de 2»), no un texto fijo.
    h += '<footer class="vco-h-pie"><span>' + esc(emp.nombre) + '</span>' + (on('pantalla_v153') ? '' : '<span>' + X.pag + '</span>') + '</footer>';
    return h;
  }

  // ── el visor ────────────────────────────────────────────────────────────
  var S = { el: null, abierto: false, hilo: null, V: [], idx: 0, op: {}, foco: null, empujado: false };
  function montar() {
    if (S.el) return S.el;
    css();
    var el = D.createElement('div');
    el.id = 'cz-visor'; el.className = 'vco'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'vcoTit');
    el.innerHTML = '<div class="vco-panel"><div class="vco-bar"><div class="vco-tit"><b id="vcoTit"></b><span id="vcoSub"></span></div>' +
      '<button type="button" class="vco-btn vco-pdf" id="vcoPdf">' + ICO.pdf + '<span class="vco-largo">Descargar&nbsp;</span><span>PDF</span></button>' +
      '<button type="button" class="vco-btn vco-cer" id="vcoCerrar" aria-label="Cerrar">' + ICO.x + '<span class="vco-largo">Cerrar</span></button></div>' +
      '<div class="vco-franja" id="vcoFranja" hidden></div>' +
      '<div class="vco-acc" id="vcoAcc"><div class="vco-vers" id="vcoVers" hidden><button type="button" class="vco-flecha" id="vcoAnt" aria-label="Versión anterior">' + ICO.izq + '</button>' +
      '<span id="vcoVersTx"></span><button type="button" class="vco-flecha" id="vcoSig" aria-label="Versión siguiente">' + ICO.der + '</button></div>' +
      '<div class="vco-corr" id="vcoCorr"><button type="button" class="vco-btn vco-c" data-vco-corr="texto">' + ICO.lapiz + 'Corregir por texto</button>' +
      '<button type="button" class="vco-btn vco-c" data-vco-corr="voz">' + ICO.mic + 'Corregir por voz</button></div></div>' +
      '<div class="vco-scroll" id="vcoScroll"><article class="vco-hoja" id="vcoHoja"></article></div></div>';
    D.body.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    q('#vcoCerrar').onclick = cerrar;
    q('#vcoPdf').onclick = function () { G.print(); };
    q('#vcoAnt').onclick = function () { if (S.idx > 0) { S.idx--; pintar(); } };
    q('#vcoSig').onclick = function () { if (S.idx < S.V.length - 1) { S.idx++; pintar(); } };
    Array.prototype.forEach.call(el.querySelectorAll('[data-vco-corr]'), function (b) {
      b.onclick = function () {
        var modo = b.getAttribute('data-vco-corr'), v = S.V[S.idx], f = S.op && S.op.alCorregir;
        cerrar();
        if (typeof f === 'function') f(modo, v);
      };
    });
    el.addEventListener('click', function (e) { if (e.target === el) cerrar(); });
    G.addEventListener('popstate', function () { if (S.abierto) { S.empujado = false; ocultar(); } });
    D.addEventListener('keydown', function (e) { if (S.abierto && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); cerrar(); } });
    S.el = el;
    return el;
  }
  function pintar() {
    var el = S.el, q = function (s) { return el.querySelector(s); }, V = S.V, v = V[S.idx], r = v.resultado || {}, c = v.cotizacion || {};
    var ult = S.idx === V.length - 1, nom = r.orden_nombre || ('#' + r.orden_id), est = estadoDe(S.hilo, v, ult);
    var emp = EMPRESA[Number(c.empresa_id)] || (idiomaDe(v) === 'en' ? EMPRESA[6] : EMPRESA[1]);
    q('#vcoTit').textContent = 'Cotización ' + nom;
    q('#vcoSub').textContent = ult ? (est === 'sent' ? 'Enviada' : est === 'sale' ? 'Confirmada' : 'Borrador') + ' en Odoo · ' + emp.corto + (monedaDe(v) ? ' · ' + monedaDe(v) : '')
      : 'Solo lectura · versión anterior' + (v.at ? ' del ' + cuando(v.at) : '');
    var f = q('#vcoFranja');
    if (S.idx > 0) { var t = queCambio(V[S.idx - 1], v); f.innerHTML = '<b>Cambió:</b> ' + esc(t); f.title = 'Cambió: ' + t; f.hidden = false; }
    else { f.hidden = true; f.innerHTML = ''; }
    var vs = q('#vcoVers');
    vs.hidden = V.length < 2;
    q('#vcoVersTx').textContent = 'Versión ' + (S.idx + 1) + ' de ' + V.length;
    q('#vcoAnt').disabled = S.idx === 0; q('#vcoSig').disabled = ult;
    q('#vcoCorr').hidden = !ult;
    q('#vcoAcc').hidden = V.length < 2 && !ult;
    q('#vcoHoja').innerHTML = hoja(S.hilo, V, S.idx);
    q('#vcoScroll').scrollTop = 0;
  }
  /**
   * Abre el visor. opciones: { version: accion_id o índice (por omisión, la última), alCorregir: function(modo, version) }.
   * Devuelve false si el caso no tiene cotización en Odoo.
   */
  function abrir(hilo, opciones) {
    var V = ordenes(hilo); if (!V.length) return false;
    var op = opciones || {}, el = montar(), idx = V.length - 1;
    if (op.version !== undefined && op.version !== null) {
      var k = -1; V.forEach(function (v, i) { if (String(v.accion_id) === String(op.version)) k = i; });
      if (k < 0 && typeof op.version === 'number' && V[op.version]) k = op.version;
      if (k >= 0) idx = k;
    }
    S.hilo = hilo; S.V = V; S.idx = idx; S.op = op;
    if (!S.abierto) S.foco = D.activeElement;
    pintar();
    el.hidden = false; S.abierto = true;
    D.documentElement.classList.add('vco-abierto');
    if (!S.empujado) { try { G.history.pushState({ czVisor: 1 }, ''); S.empujado = true; } catch (e) { S.empujado = false; } }
    var b = el.querySelector('#vcoCerrar'); if (b) b.focus();
    return true;
  }
  function ocultar() {
    if (!S.el) return;
    S.el.hidden = true; S.abierto = false;
    D.documentElement.classList.remove('vco-abierto');
    var f = S.foco; S.foco = null;
    if (f && f.focus && D.contains(f)) { try { f.focus(); } catch (e) { /* nada */ } }
  }
  /** Cierra: si abrimos con una entrada en el historial, se regresa (así Atrás no queda «gastado»). */
  function cerrar() {
    if (!S.abierto) return;
    if (S.empujado && G.history.state && G.history.state.czVisor) { S.empujado = false; ocultar(); G.history.back(); return; }
    S.empujado = false; ocultar();
  }
  function abierto() { return S.abierto; }
  /** Clic delegado en las tarjetas: `obtener()` devuelve { hilo, opciones } al momento del clic. */
  function enlazar(raiz, obtener) {
    (raiz || D).addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-cz-visor]'); if (!b) return;
      var o = (obtener && obtener()) || {}, op = {}, k;
      for (k in (o.opciones || {})) op[k] = o.opciones[k];
      if (b.getAttribute('data-cz-visor') !== '') op.version = b.getAttribute('data-cz-visor');
      abrir(o.hilo, op);
    });
  }

  // ── estilos (una vez) ───────────────────────────────────────────────────
  /** V1.53b · al imprimir: el número de página real («Página 1 de 2») y sin el sello de borrador en lo que va al cliente. */
  function cssV153() {
    if (D.getElementById('cz-visor-v153')) return;
    var s = D.createElement('style'); s.id = 'cz-visor-v153';
    s.textContent = '@media print{@page{size:letter;margin:12mm 12mm 16mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font-size:9pt;color:#5f6368}}' +
      ' html.vco-abierto #cz-visor .vco-est{display:none !important}}';
    (D.head || D.documentElement).appendChild(s);
  }
  function css() {
    if (D.getElementById('cz-visor-css')) return;
    var s = D.createElement('style'); s.id = 'cz-visor-css';
    s.textContent = [
      '.vco-ico{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;display:block}',
      /* tarjeta del chat */
      '.vco-doc{margin-top:8px;border:1px solid var(--linea,#e7e3dd);border-radius:10px;background:var(--sup2,#f6f5f3);overflow:hidden;max-width:100%}',
      '.vco-doc-top{display:flex;gap:10px;align-items:center;padding:10px}',
      '.vco-doc-ic{width:38px;height:46px;border-radius:4px;background:#fff;border:1px solid #d8d8d8;display:flex;align-items:center;justify-content:center;color:#b3261e;font-size:10px;font-weight:700;flex-shrink:0}',
      '.vco-doc-tx{min-width:0;flex:1}',
      '.vco-doc-tx b{display:block;font-size:14px;color:var(--texto,#111b21);overflow-wrap:anywhere}',
      '.vco-doc-tx span{display:block;font-size:12.5px;color:var(--sec,#667781)}',
      '.vco-doc-tx .vco-cambio{display:inline-block;margin-top:4px;font-size:12px;background:#e7f6ee;border:1px solid #b8e3cb;color:#0b6b45;border-radius:8px;padding:1px 7px;overflow-wrap:anywhere}',
      '.vco-doc-ver{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:42px;border:0;border-top:1px solid var(--linea,#e7e3dd);background:none;color:var(--acento-osc,#008069);font:inherit;font-weight:600;font-size:14.5px;cursor:pointer}',
      /* visor */
      'html.vco-abierto,html.vco-abierto body{overflow:hidden}',
      '.vco{position:fixed;inset:0;z-index:300;background:rgba(11,20,26,.55);display:flex;padding:14px;font-family:Roboto,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.4;color:var(--texto,#111b21)}',
      '.vco[hidden]{display:none}',
      '.vco button{font:inherit;cursor:pointer}',
      '.vco-panel{flex:1;min-width:0;display:flex;flex-direction:column;background:#525659;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}',
      '.vco-bar{display:flex;align-items:center;gap:8px;padding:0 8px 0 14px;min-height:54px;background:var(--sup,#fff);border-bottom:1px solid var(--linea,#e7e3dd);flex-shrink:0}',
      '.vco-tit{flex:1;min-width:0}',
      '.vco-tit b{display:block;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.vco-tit span{display:block;font-size:12px;color:var(--sec,#667781);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.vco-btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:19px;font-weight:600;font-size:14px;white-space:nowrap;flex-shrink:0;border:0;background:none;color:var(--texto,#111b21)}',
      '.vco-pdf{background:var(--acento-osc,#008069);color:#fff}',
      '.vco-cer{border:1px solid var(--linea,#e7e3dd)}',
      '.vco-franja{flex-shrink:0;font-size:13px;padding:7px 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--linea,#e7e3dd);background:#e7f6ee;color:#0b6b45}',
      '.vco-franja[hidden]{display:none}',
      '.vco-franja b{font-weight:700}',
      '.vco-acc{flex-shrink:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:6px 10px;background:var(--sup2,#f6f5f3);border-bottom:1px solid var(--linea,#e7e3dd)}',
      '.vco-acc[hidden],.vco-vers[hidden],.vco-corr[hidden]{display:none}',
      '.vco-vers{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--sec,#667781);white-space:nowrap}',
      '.vco-flecha{width:34px;height:34px;border-radius:50%;border:1px solid var(--linea,#e7e3dd);background:var(--sup,#fff);color:var(--texto,#111b21);display:flex;align-items:center;justify-content:center}',
      '.vco-flecha:disabled{opacity:.35;cursor:default}',
      '.vco-corr{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}',
      '.vco-c{height:34px;padding:0 12px;font-size:13.5px;background:var(--sup,#fff);border:1px solid var(--linea,#e7e3dd);color:var(--acento-osc,#008069)}',
      '.vco-scroll{flex:1;overflow:auto;overflow-x:hidden;padding:20px 16px 40px;-webkit-overflow-scrolling:touch}',
      /* la hoja: siempre blanca, como un PDF */
      '.vco-hoja{max-width:816px;margin:0 auto;background:#fff;color:#1f1f1f;box-shadow:0 2px 12px rgba(0,0,0,.35);padding:44px 52px 36px;font-family:Lato,Roboto,"Helvetica Neue",Arial,sans-serif;font-size:13px;line-height:1.45;color-scheme:light;overflow-wrap:anywhere}',
      '.vco-hoja *{box-sizing:border-box}',
      '.vco-h-cab{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #714b67}',
      '.vco-logo i{display:inline-block;font-style:normal;font-weight:800;font-size:26px;letter-spacing:1px;color:#fff;background:#714b67;padding:4px 10px;border-radius:4px;line-height:1.1}',
      '.vco-emp{font-size:12px;color:#5f6368;text-align:right;min-width:0}',
      '.vco-emp b{display:block;color:#1f1f1f;font-size:12.5px}',
      '.vco-h-cli{display:flex;justify-content:flex-end;margin:18px 0 8px}',
      '.vco-h-fis{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0 8px;font-size:12.5px}.vco-h-fis div{border:1px solid #e3e3e3;border-radius:6px;padding:8px 10px;min-width:0;overflow-wrap:anywhere}',
      '.vco-h-fis small{display:block;color:#5f6368;font-size:11.5px}.vco-h-fis b{display:block;font-size:13px}.vco-h-fis span{display:block;margin-top:4px;color:#3c4043}',
      '@media (max-width:560px){.vco-h-fis{grid-template-columns:1fr}}',
      '.vco-h-cli div{min-width:220px;max-width:100%;font-size:13px}',
      '.vco-h-cli small,.vco-h-proy small{display:block;color:#5f6368;font-size:11.5px}',
      '.vco-h-tit{font-size:24px;font-weight:400;margin:10px 0 12px;line-height:1.25}',
      '.vco-h-tit b{font-weight:700}',
      '.vco-est{display:inline-block;vertical-align:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-radius:6px;padding:1px 7px;background:#eef0f2;color:#5f6368;border:1px solid #d9d9d9}',
      '.vco-est-sent{background:#e7f6ee;color:#0b6b45;border-color:#b8e3cb}',
      '.vco-h-info{display:flex;flex-wrap:wrap;gap:10px 40px;margin-bottom:14px}',
      '.vco-h-info div{font-size:12.5px}',
      '.vco-h-info small{display:block;font-weight:700;font-size:12px}',
      '.vco-h-proy{margin:0 0 18px;font-size:13px}',
      '.vco-tabla{border-top:1px solid #1f1f1f}',
      '.vco-lin{display:grid;grid-template-columns:minmax(0,1fr) 84px 96px 112px;gap:10px;padding:8px 4px;border-bottom:1px solid #d9d9d9;align-items:start}',
      '.vco-lin.vco-con-imp{grid-template-columns:minmax(0,1fr) 78px 92px 104px 104px}',
      '.vco-lin>div:not(.vco-c-desc){text-align:right;white-space:nowrap}',
      '.vco-lin.vco-cab-t{font-weight:700;font-size:12.5px;border-bottom:1px solid #1f1f1f}',
      '.vco-lin.vco-cab-t>div{white-space:normal}',
      '.vco-lin.vco-sec{display:block;background:#eef0f2;font-weight:700}',
      '.vco-lin.vco-nota{display:block;font-style:italic;color:#5f6368}',
      '.vco-c-desc ul{margin:3px 0 0 18px;padding:0}',
      '.vco-c-desc li{margin:1px 0}',
      '.vco-c-desc p{margin:3px 0 0}',
      '.vco-tot{display:flex;justify-content:flex-end;margin-top:14px}',
      '.vco-tot table{border-collapse:collapse;min-width:300px;font-size:13px}',
      '.vco-tot td{padding:5px 4px;border-bottom:1px solid #d9d9d9}',
      '.vco-tot td+td{text-align:right;white-space:nowrap;padding-left:16px}',
      '.vco-tot td.vco-ley{text-align:left;color:#5f6368;font-style:italic;white-space:normal}',
      '.vco-tot tr.vco-gran td{font-weight:700;font-size:14px;border-top:1px solid #1f1f1f;border-bottom:0}',
      '.vco-ant{margin:10px 0 0;text-align:right;font-size:12.5px}',
      '.vco-opc{margin-top:24px}',
      '.vco-opc h3,.vco-terminos h3{font-size:13px;margin:0 0 6px}',
      '.vco-fuera{display:inline-block;font-size:10.5px;font-weight:700;color:#7a5600;background:#fff3c4;border:1px solid #f0dc8c;border-radius:6px;padding:0 5px;margin-left:6px;vertical-align:1px}',
      '.vco-opc-nota{margin:0 0 6px;font-size:12.5px;color:#5f6368}',
      '.vco-opc>ul{margin:3px 0 0 18px}',
      '.vco-terminos{margin-top:26px;font-size:12px}',
      '.vco-terminos p{margin:3px 0}',
      '.vco-terminos ul{margin:2px 0 4px 18px;padding:0}',
      '.vco-terminos b{font-weight:700}',
      '.vco-h-pie{margin-top:30px;padding-top:8px;border-top:1px solid #d9d9d9;font-size:11px;color:#5f6368;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}',
      /* la franja de en medio (721–980): la hoja se angosta sin perder columnas */
      '@media (max-width:980px){.vco-hoja{padding:32px 28px 28px}.vco-lin{grid-template-columns:minmax(0,1fr) 70px 84px 100px;gap:8px}.vco-lin.vco-con-imp{grid-template-columns:minmax(0,1fr) 66px 80px 86px 96px}}',
      /* celular: pantalla completa, renglones apilados */
      '@media (max-width:720px){',
      ' .vco{padding:0}.vco-panel{border-radius:0}.vco-scroll{padding:0}',
      ' .vco-hoja{padding:22px 18px 26px;box-shadow:none}',
      ' .vco-h-cab{flex-direction:column;gap:8px}.vco-emp{text-align:left}',
      ' .vco-h-cli{justify-content:flex-start}.vco-h-cli div{min-width:0}',
      ' .vco-h-info{gap:8px 24px}.vco-h-tit{font-size:21px}',
      ' .vco-lin.vco-cab-t{display:none}',
      ' .vco-lin,.vco-lin.vco-con-imp{grid-template-columns:1fr 1fr;gap:4px 10px;padding:10px 2px}',
      ' .vco-lin .vco-c-desc{grid-column:1/-1}',
      ' .vco-lin>div:not(.vco-c-desc){text-align:left;font-size:12.5px;white-space:normal}',
      ' .vco-lin>div[data-l]::before{content:attr(data-l);display:block;font-size:11px;color:#5f6368}',
      ' .vco-tot table{min-width:0;width:100%}.vco-ant{text-align:left}',
      ' .vco-franja{white-space:normal;overflow:visible;line-height:1.35}',
      ' .vco-corr{margin-left:0;width:100%}.vco-c{flex:1;justify-content:center}',
      '}',
      '@media (max-width:480px){.vco-largo{display:none}.vco-btn{padding:0 12px}.vco-c{padding:0 8px}}',
      ':root[data-theme="dark"] .vco-panel{background:#2b2e31}',
      ':root[data-theme="dark"] .vco-franja{background:#103a2b;color:#8fe0b7}',
      ':root[data-theme="dark"] .vco-pdf{color:#0b141a}',
      /* imprimir: solo la hoja, carta */
      '@media print{',
      ' @page{size:letter;margin:12mm}',
      ' html.vco-abierto body>*:not(#cz-visor){display:none !important}',
      ' html.vco-abierto,html.vco-abierto body{overflow:visible !important;height:auto !important;background:#fff !important}',
      ' html.vco-abierto body{display:block !important}',
      ' html.vco-abierto #cz-visor.vco{position:static;display:block !important;background:#fff;padding:0}',
      ' html.vco-abierto #cz-visor .vco-panel{display:block;background:#fff;box-shadow:none;border-radius:0}',
      ' html.vco-abierto #cz-visor :is(.vco-bar,.vco-franja,.vco-acc){display:none !important}',
      ' html.vco-abierto #cz-visor .vco-scroll{overflow:visible;padding:0}',
      ' html.vco-abierto #cz-visor .vco-hoja{box-shadow:none;max-width:none;padding:0}',
      '}'
    ].join('\n');
    (D.head || D.documentElement).appendChild(s);
  }

  G.CzVisor = { ordenes: ordenes, boton: boton, queCambio: queCambio, abrir: abrir, cerrar: cerrar, abierto: abierto, enlazar: enlazar,
    _limpio: limpio };
})(window);
