/* ═══ Conceptualizador · niveles de precio N1–N5 en UN solo lugar (V1.58, fts-conceptualizador#12 punto f) ═══
 *
 * Prototipo aprobado: fts-conceptualizador, prototipos/v158/destrabar.html (escenas niveles, nivel-nota, referencias, ayuda).
 * Detrás del interruptor `niveles_v158` (apagado: nadie llama a este módulo y la pantalla es la de V1.57b).
 *
 *  · Un nombre corto por nivel: N1 Proveedor · N2 Web MX · N3 Lista extranjera · N4 Estimado · N5 Falta precio, y su nota de
 *    una línea. N3 = lista × FIX × 1.10 de internación, SIN el 15 % de holgura (V1.45); la holgura se quedó solo en N4.
 *  · La insignia se TOCA (no `title`, que en el teléfono no existe): abre y cierra su nota debajo. Una nota abierta a la vez;
 *    sobrevive al repintado del sondeo (se vuelve a poner sobre la insignia con la misma llave).
 *  · La usan: franja de precios, BOM del mensaje, tabla del machote (cz-tabla.js), «Cotizar con referencias», vista
 *    ejecutiva (cz-vista.js) y «Ayuda · niveles de precio» en el ⋮.
 *
 * API: CzNiveles.on() · nombre(n) · nota(n) · chip(n, { k, cuenta }) · textoReferencia(pct) · referenciasHtml(R, opc) ·
 *      ayudaHtml() · ayuda() · NIVELES
 */
(function (G) {
  'use strict';
  var NIVELES = {
    // V1.62a (`n0_v162`) · el precio que dio la persona: su fuente es su decreto, no se busca más.
    N0: ['Lo dio la persona', 'Precio que dio quien cotiza (o Esteban): en el chat o corregido en la vista ejecutiva. Su fuente es su decreto; no pide folio ni liga y el agente no lo vuelve a buscar.'],
    N1: ['Proveedor', 'Precio de un proveedor real: su folio o cotización, o lo que FTS ya pagó por el mismo material en Odoo. Es el más confiable.'],
    N2: ['Web MX', 'Precio publicado por un distribuidor en México, con liga al producto exacto. Confiable; puede cambiar la existencia.'],
    N3: ['Lista extranjera', 'Lista de precios de otro país convertida a pesos (USD × FIX × 1.10 de internación). Es referencia: el precio real en México, la entrega o la garantía pueden cambiar.'],
    N4: ['Estimado', 'Precio unitario publicado × cantidad calculada por ingeniería, con 15 % de holgura. Es referencia: la cantidad o el precio pueden moverse.'],
    N5: ['Falta precio', 'No hay ninguna referencia pública: falta la cotización del proveedor. Frena la cotización hasta que llegue.']
  };
  var S = { abierta: null, obs: null };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function on() { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('niveles_v158') === true; } catch (e) { return false; } }
  function valido(n) { n = String(n || '').toUpperCase(); return NIVELES[n] ? n : null; }
  function nombre(n) { var k = valido(n); return k ? k + ' · ' + NIVELES[k][0] : String(n || ''); }
  function nota(n) { var k = valido(n); return k ? NIVELES[k][1] : ''; }
  var pct = function (x) { var v = Math.round(Number(x || 0) * 10) / 10; return (v % 1 ? v.toFixed(1) : String(Math.round(v))); };
  var pctH = function (x) { return pct(x) + '&nbsp;%'; };   // en HTML, el número y su % no se separan de renglón

  var CSS = '.czn-niv{display:inline-flex;align-items:center;gap:4px;border-radius:10px;padding:0 8px;font-size:12px;font-weight:600;line-height:20px;cursor:pointer;border:1px solid transparent;white-space:nowrap;vertical-align:1px;user-select:none;-webkit-user-select:none}' +
    '.czn-niv:focus-visible{outline:2px solid #00a884;outline-offset:1px}.czn-niv[aria-expanded="true"]{border-color:currentColor}' +
    '.czn-n0{background:#eef2ff;color:#3730a3}.czn-n1{background:#e7f6ec;color:#166534}.czn-n2{background:#e6f4f1;color:#0f766e}.czn-n3{background:#fff4e5;color:#8a4b00}.czn-n4{background:#e8efff;color:#1d4ed8}.czn-n5{background:#fdecea;color:#b42318}' +
    '.czn-niv i{font-style:normal;font-weight:700}' +
    '.czn-nota{display:block;flex-basis:100%;margin:6px 0 4px;background:#111b21;color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:400;line-height:1.4;max-width:420px;white-space:normal;text-align:left;overflow-wrap:anywhere}' +
    '.czn-nota b{color:#fff}' +
    // «Cotizar con referencias» en palabras (prototipo, escena referencias)
    '.czn-refs{border:1px solid #e9edef;border-radius:10px;padding:10px 12px;background:#fff;margin:6px 0;font-size:13.5px;color:#111b21;overflow-wrap:anywhere}' +
    '.czn-refs .alerta{color:#a33a00;font-weight:600}.czn-refs h5{margin:0 0 4px;font-size:14.5px}.czn-refs p{margin:4px 0}' +
    '.czn-med{height:10px;border-radius:5px;background:#e9edef;overflow:hidden;display:flex;margin:8px 0 4px}.czn-med span{display:block;height:100%}' +
    '.czn-ley{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:#667781}.czn-ley i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:0}' +
    '.czn-refs ol{margin:6px 0 6px 20px;padding:0}.czn-refs li{margin:3px 0}.czn-refs .czn-sec{color:#667781;font-size:12.5px}' +
    '.chn-modal.czn-modal-ayuda .chn-modal-c{height:auto;max-height:calc(100dvh - 24px)}' +
    '.czn-ayuda{padding:12px 16px 16px;font-size:14px;color:#111b21}.czn-ayuda p{margin:0 0 8px;color:#667781;font-size:13.5px}' +
    '.czn-ayuda table{width:100%;border-collapse:collapse}.czn-ayuda td{border-top:1px solid #e9edef;padding:8px 4px;vertical-align:top}.czn-ayuda td:first-child{width:1%;white-space:nowrap;padding-right:10px}';
  function css() { if (document.getElementById('czn-css')) return; var s = document.createElement('style'); s.id = 'czn-css'; s.textContent = CSS; document.head.appendChild(s); }

  /** La insignia. `k` = llave para recordar la nota abierta al repintar (única en la pantalla); `cuenta` = «· 18» al lado. */
  function chip(n, o) {
    o = o || {}; var k = valido(n); if (!k) return n ? '<span class="czn-niv">' + esc(n) + '</span>' : '';
    css(); enlazar();
    var abierta = S.abierta && S.abierta.k === String(o.k || k);
    return '<span class="czn-niv czn-' + k.toLowerCase() + '" role="button" tabindex="0" aria-expanded="' + !!abierta + '" data-czn="' + k + '" data-czn-k="' + esc(o.k || k) + '"' +
      ' aria-label="' + esc(nombre(k)) + ': toca para ver qué significa">' + esc(o.corto ? k : nombre(k)) + (o.cuenta != null ? ' <i>' + esc(o.cuenta) + '</i>' : '') + '</span>';
  }
  function notaHtml(k) { return '<span class="czn-nota" role="note"><b>' + esc(nombre(k)) + '.</b> ' + esc(nota(k)) + '</span>'; }
  /** Dónde va la nota: al final del renglón (el bloque que contiene la insignia), para no partir el texto de la línea; si la
   *  insignia vive dentro de un botón o un <summary> (la fila de la vista ejecutiva), justo después de él. */
  function ponerNota(c, html) {
    var a = c.parentNode && c.parentNode.closest ? c.parentNode.closest('button, summary') : null;
    if (a) return a.insertAdjacentHTML('afterend', html);
    var b = c.parentNode && c.parentNode.closest ? c.parentNode.closest('div, li, td, p') : null;
    return b ? b.insertAdjacentHTML('beforeend', html) : c.insertAdjacentHTML('afterend', html);
  }
  function quitarNotas() { Array.prototype.forEach.call(document.querySelectorAll('.czn-nota'), function (x) { x.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('.czn-niv[aria-expanded="true"]'), function (x) { x.setAttribute('aria-expanded', 'false'); }); }
  function abrirEn(c) { var k = c.getAttribute('data-czn'); c.setAttribute('aria-expanded', 'true'); ponerNota(c, notaHtml(k)); }
  function alternar(c) {
    var k = c.getAttribute('data-czn-k'), ya = S.abierta && S.abierta.k === k && c.getAttribute('aria-expanded') === 'true';
    quitarNotas();
    if (ya) { S.abierta = null; return; }
    S.abierta = { k: k }; abrirEn(c);
  }
  /** Tras un repintado (el sondeo reescribe el chat), la nota abierta se vuelve a poner sobre su insignia. */
  function restaurar() {
    if (!S.abierta || document.querySelector('.czn-nota')) return;
    var L = document.querySelectorAll('.czn-niv[data-czn-k]');
    for (var i = 0; i < L.length; i++) if (L[i].getAttribute('data-czn-k') === S.abierta.k) { abrirEn(L[i]); return; }
  }
  var enlazado = false;
  function enlazar() {
    if (enlazado) return; enlazado = true;
    // En captura y con stopPropagation: tocar la insignia NO abre la fila, el renglón o la franja que la contienen.
    document.addEventListener('click', function (e) {
      var c = e.target && e.target.closest && e.target.closest('.czn-niv[data-czn]'); if (!c) return;
      e.preventDefault(); e.stopPropagation(); alternar(c);
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target && e.target.closest && e.target.closest('.czn-niv[data-czn]'); if (!c) return;
      e.preventDefault(); e.stopPropagation(); alternar(c);
    }, true);
    if (G.MutationObserver) { S.obs = new MutationObserver(function () { if (S.abierta) restaurar(); }); S.obs.observe(document.body, { childList: true, subtree: true }); }
  }

  /** «56 % del costo es estimado» (N3 + N4) · '' sin dato. */
  function textoReferencia(p) { var v = Number(p); return v ? pct(v) + ' % del costo es estimado' : ''; }

  /** «Cotizar con referencias» en palabras: el % con montos, la barra por nivel y los 5 renglones que más pesan.
   *  R = datos.referencias del motor ({ n, n3, n4, importe, costo_base, pct, lista[{nivel, descripcion, importe}] }).
   *  opc: { pct (el de CzIndicadores, si lo hay), moneda, alertas (texto) } */
  function referenciasHtml(R, opc) {
    if (!R || !R.n) return '';
    css(); enlazar(); opc = opc || {};
    var L = (R.lista || []).filter(function (x) { return x && valido(x.nivel); });
    var ref = Number(R.importe) || L.reduce(function (s, x) { return s + (Number(x.importe) || 0); }, 0);
    var p = Number(opc.pct != null ? opc.pct : R.pct) || 0;
    var costo = Number(R.costo_base) || (p ? ref * 100 / p : 0);
    var mon = String(opc.moneda || '').toUpperCase();
    var din = function (x) { return (mon === 'USD' ? 'USD ' : '$') + Math.round(Number(x || 0)).toLocaleString('es-MX'); };
    var por = { N3: 0, N4: 0 }; L.forEach(function (x) { if (por[x.nivel] != null) por[x.nivel] += Number(x.importe) || 0; });
    var p3 = costo ? por.N3 / costo * 100 : 0, p4 = costo ? por.N4 / costo * 100 : 0, pOk = Math.max(0, 100 - p3 - p4);
    var n3 = R.n3 != null ? R.n3 : L.filter(function (x) { return x.nivel === 'N3'; }).length, n4 = R.n4 != null ? R.n4 : L.filter(function (x) { return x.nivel === 'N4'; }).length;
    var top = L.slice().sort(function (a, b) { return (Number(b.importe) || 0) - (Number(a.importe) || 0); }).slice(0, 5);
    var suma5 = top.reduce(function (s, x) { return s + (Number(x.importe) || 0); }, 0), baja = costo ? Math.max(0, (ref - suma5) / costo * 100) : null;
    var corta = function (t, n) { t = String(t || '').split('\n')[0].trim(); if (t.length <= n) return t; var c = t.slice(0, n + 1), i = c.lastIndexOf(' '); return (i > n * 0.5 ? c.slice(0, i) : t.slice(0, n)).replace(/[\s,;:.·-]+$/, '') + '…'; };
    var partes = []; if (n3) partes.push(n3 + (n3 === 1 ? ' renglón de ' : ' renglones de ') + chip('N3', { k: 'refs-n3' })); if (n4) partes.push(n4 + (n4 === 1 ? ' renglón de ' : ' renglones de ') + chip('N4', { k: 'refs-n4' }));
    return '<div class="czn-refs"><h5>Cotizar con referencias</h5>' +
      '<p>El <b>' + pctH(p) + ' del costo</b>' + (costo ? ' (' + din(ref) + ' de ' + din(costo) + ')' : '') + ' todavía es <b>precio de referencia</b>, no de proveedor' +
        (partes.length ? ': ' + partes.join(' y ') : '') + '.' + (opc.alertas ? ' <span class="alerta">⚠ ' + esc(opc.alertas) + '</span>' : '') + '</p>' +
      (costo ? '<div class="czn-med" aria-hidden="true"><span style="width:' + pOk.toFixed(1) + '%;background:#00a884"></span><span style="width:' + p3.toFixed(1) + '%;background:#d97706"></span><span style="width:' + p4.toFixed(1) + '%;background:#1d4ed8"></span></div>' +
        '<div class="czn-ley"><span><i style="background:#00a884"></i>Proveedor o web MX ' + Math.round(pOk) + '&nbsp;%</span><span><i style="background:#d97706"></i>Lista extranjera ' + Math.round(p3) + '&nbsp;%</span><span><i style="background:#1d4ed8"></i>Estimado ' + Math.round(p4) + '&nbsp;%</span></div>' : '') +
      (top.length ? '<p style="margin-top:10px"><b>Para bajarlo, pide cotización a un proveedor de</b> (los que más pesan):</p><ol>' + top.map(function (x, i) {
        return '<li>' + esc(corta(x.descripcion, 80)) + ' · ' + din(x.importe) + ' ' + chip(x.nivel, { k: 'refs-top-' + i, corto: true }) + '</li>'; }).join('') + '</ol>' +
        (baja != null ? '<p class="czn-sec">Con ' + (top.length === 1 ? 'ese' : 'esos ' + top.length) + ', lo estimado baja de ' + pctH(p) + ' a ' + pctH(baja) + '. Cuando llegue el folio, mándalo al chat: el renglón pasa a N1 y se actualiza el mismo machote.</p>' : '') : '') +
      '</div>';
  }

  function ayudaHtml() {
    css(); enlazar();
    return '<div class="czn-ayuda"><p>Cada precio del BOM dice de dónde salió. N1 a N4 cuentan como precio; solo N5 frena la cotización.</p><table><tbody>' +
      ['N1', 'N2', 'N3', 'N4', 'N5'].map(function (k) { return '<tr><td>' + chip(k, { k: 'ayuda-' + k }) + '</td><td>' + esc(nota(k)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function ayuda() {
    var m = G.ChatNucleo && G.ChatNucleo.modal;
    if (!m) return null;
    return m({ titulo: 'Ayuda · niveles de precio', marca: 'czn-modal-ayuda', ancho: '560px', html: ayudaHtml() });
  }

  G.CzNiveles = { on: on, NIVELES: NIVELES, nombre: nombre, nota: nota, chip: chip, textoReferencia: textoReferencia, referenciasHtml: referenciasHtml,
    ayudaHtml: ayudaHtml, ayuda: ayuda, _estado: S };
})(window);
