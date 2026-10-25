/* ═══ Conceptualizador · estado inmediato de lo que espera a Odoo y visor propio del PDF (V1.58, fts-conceptualizador#12 punto e) ═══
 *
 * Prototipo aprobado: fts-conceptualizador, prototipos/v158/destrabar.html (escenas generando, listo, error, actualizando, visor).
 * Detrás del interruptor `estado_odoo_v158` (apagado: nadie llama a este módulo y la pantalla es la de V1.57b).
 *
 *  · UNA tarjeta de estado abajo del chat (en #estAg, junto a la barra del motor): sale en el MISMO instante del clic con la hora
 *    de inicio y los segundos corriendo («Generando el PDF de SO11930 en Odoo… · Desde las 03:26:04 · 2 s»), y termina en
 *    «✓ Listo · …» con sus botones o en «✕ No se … · <motivo> (CÓDIGO). La orden no cambió.» con Reintentar. La usan «Ver
 *    cotización» y «Descargar PDF» (cz-enviar.js) y «Crear / Actualizar borrador en Odoo» (cz-app.js hacer()), desde el botón de
 *    la tarjeta y desde el rayito: la bolita cierra su menú antes del clic, así que el giro del botón no se veía.
 *  · Visor propio del PDF: pdf.js 3.11.174 de cdnjs (versión fija), cargado al primer uso; pinta cada hoja en un canvas dentro de
 *    ChatNucleo.modal (Hoja N de M, −/+, ⬇ Descargar, ✕), sin depender del lector de PDF del navegador (en el teléfono no hay).
 *    Si pdf.js no carga, cae al iframe de antes con «Descargar».
 *
 * API: CzEstado.on() · inicio({ titulo, detalle, tipico, caso }) → { listo({titulo, sub, acciones}), error({titulo, motivo, codigo,
 *      nota, reintentar, acciones}), cerrar() } · caso(id) · cerrar() · visorPdf({ u8, nombre, titulo }) · hojas(u8)
 */
(function (G) {
  'use strict';
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var S = { el: null, h: null, reloj: null, caso: null, n: 0, pdfjs: null };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function on() { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('estado_odoo_v158') === true; } catch (e) { return false; } }
  /* V1.61 (#12, `barra_v161`) · con la barra única, esta tarjeta NO se pinta: su estado (Odoo trabajando, listo o falla) pasa a la
   * barra de abajo (estados 4 y 5) por vista() y alCambiar(fn). Lo demás (giro en el botón, visor del PDF) sigue igual. */
  function barra() { try { return typeof G.CzInterruptor === 'function' && G.CzInterruptor('barra_v161') === true; } catch (e) { return false; } }
  var OY = [];
  function avisar() { OY.forEach(function (f) { try { f(S.vista); } catch (e) {} }); }
  var dos = function (n) { return (n < 10 ? '0' : '') + n; };
  var hms = function (d) { return dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()); };

  var CSS = '.cze-est{margin:0 10px 6px;background:#fff;border:1px solid #d1d7db;border-left:4px solid #00a884;border-radius:12px;box-shadow:0 1px 3px rgba(11,20,26,.13);padding:9px 8px 9px 12px;display:flex;gap:10px;align-items:flex-start;color:#111b21;min-width:0}' +
    '.cze-est.cze-err{border-left-color:#b42318}.cze-est[hidden]{display:none}' +
    '.cze-t{flex:1;min-width:0}.cze-t b{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}.cze-s{display:block;font-size:12.5px;color:#667781;overflow-wrap:anywhere}' +
    '.cze-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
    '.cze-bt{border:1px solid #d1d7db;background:#fff;color:#111b21;border-radius:18px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;min-height:34px;display:inline-flex;align-items:center;gap:6px;text-decoration:none}' +
    '.cze-bt.si{background:#008069;border-color:#008069;color:#fff}.cze-bt[disabled]{opacity:.45;cursor:not-allowed}' +
    '.cze-giro{width:18px;height:18px;border-radius:50%;border:2.5px solid #e9edef;border-top-color:#00a884;animation:cze-g .9s linear infinite;flex:none;margin-top:2px}' +
    '@keyframes cze-g{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.cze-giro{animation:none;border-top-color:#00a884}}' +
    '.cze-ok{color:#008069;font-size:18px;line-height:20px;flex:none}.cze-x{color:#b42318;font-size:18px;line-height:20px;flex:none}' +
    '.cze-cierra{border:0;background:none;color:#667781;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;flex:none;margin:-4px 0 0}.cze-cierra:hover{background:rgba(11,20,26,.06)}' +
    // visor del PDF
    '.chn-modal.cze-modal-pdf .chn-modal-c{width:min(980px,100%);height:calc(100dvh - 24px)}' +
    '.chn-modal.cze-modal-pdf .chn-modal-cab{gap:4px;padding-left:12px}' +
    '.cze-pg{font-size:13px;color:#667781;white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums}' +
    '.cze-tb{border:1px solid #d1d7db;background:#fff;color:#111b21;border-radius:16px;min-width:34px;height:34px;padding:0 9px;font-size:15px;font-weight:600;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}' +
    '.cze-tb.si{background:#008069;border-color:#008069;color:#fff}' +
    '.cze-lienzo{background:#525659;padding:12px;min-height:100%;box-sizing:border-box}' +
    '.cze-lienzo canvas{display:block;margin:0 auto 12px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4);max-width:none}' +
    '.cze-lienzo .cze-carga{color:#fff;text-align:center;padding:30px 10px;font-size:14px}' +
    '.cze-pdf{display:block;width:100%;height:100%;border:0}' +
    '@media(max-width:520px){.cze-lienzo{padding:6px}.cze-pg .cze-pg-l{display:none}.chn-modal.cze-modal-pdf .chn-modal-c{height:calc(100dvh - 12px)}}';
  function css() { if (document.getElementById('cze-css')) return; var s = document.createElement('style'); s.id = 'cze-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* ── la tarjeta de estado ── */
  function caja() {
    css();
    if (S.el && S.el.isConnected) return S.el;
    var box = document.getElementById('estAg');
    S.el = document.createElement('div'); S.el.className = 'cze-est'; S.el.id = 'czEstOdoo'; S.el.hidden = true;
    S.el.setAttribute('role', 'status'); S.el.setAttribute('aria-live', 'polite');
    if (box) box.insertBefore(S.el, box.firstChild);
    else { S.el.style.cssText = 'position:fixed;left:0;right:0;bottom:70px;z-index:50'; document.body.appendChild(S.el); }
    S.el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cze]'); if (!b || !S.h) return;
      var k = b.getAttribute('data-cze');
      if (k === 'cerrar') return cerrar();
      var fn = S.h.fns && S.h.fns[k]; if (fn) fn(b);
    });
    return S.el;
  }
  function parar() { if (S.reloj) { clearInterval(S.reloj); S.reloj = null; } }
  function cerrar() { parar(); S.h = null; if (S.el) { S.el.hidden = true; S.el.innerHTML = ''; S.el.className = 'cze-est'; } if (S.vista) { S.vista = null; avisar(); } }
  function pintar(icono, titulo, sub, acciones, err) {
    var el = caja(), fns = {};
    var acc = (acciones || []).map(function (a, i) { fns['a' + i] = a.fn; return '<button type="button" class="cze-bt' + (a.si ? ' si' : '') + '" data-cze="a' + i + '">' + esc(a.txt) + '</button>'; }).join('');
    el.className = 'cze-est' + (err ? ' cze-err' : ''); el.hidden = false;
    el.innerHTML = icono + '<div class="cze-t"><b>' + esc(titulo) + '</b><span class="cze-s">' + esc(sub || '') + '</span>' + (acc ? '<div class="cze-acc">' + acc + '</div>' : '') + '</div>' +
      '<button type="button" class="cze-cierra" data-cze="cerrar" aria-label="Cerrar este aviso">✕</button>';
    return fns;
  }
  /** Empieza YA (en el mismo instante del clic) y devuelve el control para terminarla. Una nueva reemplaza a la anterior. */
  function inicio(o) {
    o = o || {}; parar();
    var id = ++S.n, t0 = Date.now(), d0 = new Date(t0);
    var h = { id: id, t0: t0, caso: o.caso || S.caso || null, fns: {} };
    S.h = h; S.caso = h.caso;
    if (barra()) {   // V1.61 · a la barra: el segundero lo lleva ella
      var V = function (fase, x) { S.vista = Object.assign({ fase: fase, desde: t0, caso: h.caso, acciones: [] }, x); avisar(); };
      V('odoo', { titulo: String(o.titulo || 'Trabajando en Odoo').replace(/…$/, ''), sub: [o.detalle, o.tipico].filter(Boolean).join(' · ') });
      var vivoB = function () { return S.h === h; }, segB = function () { return (Date.now() - t0) / 1000; };
      return {
        vivo: vivoB, segundos: function () { return segB().toFixed(1).replace(/\.0$/, '') + ' s'; },
        listo: function (x) { if (!vivoB()) return; x = x || {}; V('listo', { titulo: x.titulo || 'Listo', sub: x.sub || '', seg: segB(), acciones: x.acciones || [] }); },
        error: function (x) { if (!vivoB()) return; x = x || {};
          var mot = String(x.motivo || 'sin respuesta').replace(/\s*Se reintenta solo\.?\s*$/, '').replace(/[.\s]+$/, '');
          V('falla', { titulo: x.titulo || 'No se pudo', sub: mot + '. ' + (x.nota || 'La orden no cambió.'), codigo: x.codigo || null, seg: segB(),
            acciones: (x.reintentar ? [{ txt: 'Reintentar', si: true, fn: x.reintentar }] : []).concat(x.acciones || []) }); },
        cerrar: function () { if (vivoB()) cerrar(); }
      };
    }
    var sub = function () { var s = Math.floor((Date.now() - t0) / 1000); return 'Desde las ' + hms(d0) + ' · ' + s + ' s' + (o.detalle ? ' · ' + o.detalle : '') + (o.tipico ? ' · ' + o.tipico : ''); };
    h.fns = pintar('<div class="cze-giro" aria-hidden="true"></div>', o.titulo || 'Trabajando en Odoo…', sub(), null);
    S.reloj = setInterval(function () { if (S.h !== h) return; var s = S.el && S.el.querySelector('.cze-s'); if (s) s.textContent = sub(); }, 1000);
    var vivo = function () { return S.h === h; };
    var tardo = function () { return ((Date.now() - t0) / 1000).toFixed(1).replace(/\.0$/, '') + ' s'; };
    return {
      vivo: vivo, segundos: tardo,
      listo: function (x) { if (!vivo()) return; parar(); x = x || {};
        h.fns = pintar('<span class="cze-ok" aria-hidden="true">✓</span>', x.titulo || 'Listo', [x.sub, 'tardó ' + tardo()].filter(Boolean).join(' · '), x.acciones); },
      error: function (x) { if (!vivo()) return; parar(); x = x || {};
        var mot = String(x.motivo || 'sin respuesta').replace(/\s*Se reintenta solo\.?\s*$/, '').replace(/[.\s]+$/, '');
        var acc = (x.reintentar ? [{ txt: 'Reintentar', si: true, fn: x.reintentar }] : []).concat(x.acciones || []);
        h.fns = pintar('<span class="cze-x" aria-hidden="true">✕</span>', x.titulo || 'No se pudo', mot + (x.codigo ? ' (' + x.codigo + ')' : '') + '. ' + (x.nota || 'La orden no cambió.'), acc, true); },
      cerrar: function () { if (vivo()) cerrar(); }
    };
  }
  /** La pantalla avisa qué caso está abierto: la tarjeta de otro caso no se queda pegada al cambiar de chat. */
  function caso(id) { if (S.h && S.h.caso && id && String(S.h.caso) !== String(id)) cerrar(); if (!S.h) S.caso = id || null; }

  /* ── el PDF ── */
  /** Cuántas hojas trae (sin pdf.js: cuenta los /Type /Page del archivo; 0 si vienen comprimidos). */
  function hojas(u8) {
    try { var s = '', n = Math.min(u8.length, 4000000); for (var i = 0; i < n; i += 65536) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(n, i + 65536)));
      return (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length; } catch (e) { return 0; }
  }
  function cargarPdfjs() {
    if (G.pdfjsLib) return Promise.resolve(G.pdfjsLib);
    if (S.pdfjs) return S.pdfjs;
    S.pdfjs = new Promise(function (ok, mal) {
      var sc = document.createElement('script'); sc.src = PDFJS; sc.async = true;
      var t = setTimeout(function () { mal(new Error('pdf.js tardó demasiado')); }, 15000);
      sc.onload = function () { clearTimeout(t); if (!G.pdfjsLib) return mal(new Error('pdf.js no quedó cargado')); G.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; ok(G.pdfjsLib); };
      sc.onerror = function () { clearTimeout(t); mal(new Error('No se pudo cargar pdf.js')); };
      document.head.appendChild(sc);
    });
    S.pdfjs.catch(function () { S.pdfjs = null; });   // el siguiente intento vuelve a probar
    return S.pdfjs;
  }
  function descargar(url, nombre) { var a = document.createElement('a'); a.href = url; a.download = nombre || 'cotizacion.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
  /** El visor: cada hoja en un canvas. o = { u8, nombre, titulo }. Si pdf.js no carga, el iframe de antes con «Descargar». */
  function visorPdf(o) {
    css();
    var u8 = o.u8, nombre = o.nombre || 'cotizacion.pdf', url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
    var M = G.ChatNucleo && G.ChatNucleo.modal; if (!M) { G.open(url, '_blank'); return null; }
    var st = { z: 1, pdf: null, n: 0, cerrado: false, gen: 0 };
    var m = M({ titulo: o.titulo || nombre, marca: 'cze-modal-pdf', ancho: '980px',
      cabecera: '<span class="cze-pg" data-cze-pg="1"><span class="cze-pg-l">Hoja </span><span data-cze-i>1</span> de <span data-cze-n>…</span></span>' +
        '<button type="button" class="cze-tb" data-cze-z="-1" aria-label="Alejar">−</button><button type="button" class="cze-tb" data-cze-z="1" aria-label="Acercar">+</button>' +
        '<a class="cze-tb si" href="' + url + '" download="' + esc(nombre) + '" aria-label="Descargar el PDF">' + esc(o.descargarTxt || '⬇') + '</a>',   // V1.63c · «⬇ Descargar» con pdf_unico_v163
      html: '<div class="cze-lienzo" data-cze-visor="cargando"><div class="cze-carga">Abriendo el PDF…</div></div>',
      alCerrar: function () { st.cerrado = true; setTimeout(function () { URL.revokeObjectURL(url); }, 4000); } });
    if (!m) return null;
    var lz = m.el.querySelector('.cze-lienzo'), sc = m.cuerpo, iEl = m.el.querySelector('[data-cze-i]'), nEl = m.el.querySelector('[data-cze-n]');
    var respaldo = function (por) {
      if (st.cerrado) return;
      lz.setAttribute('data-cze-visor', 'iframe'); lz.style.padding = '0'; lz.style.height = '100%';
      lz.innerHTML = '<iframe class="cze-pdf" title="PDF de la cotización" src="' + url + '"></iframe>';
      m.el.querySelector('[data-cze-pg]').innerHTML = '<a class="cze-tb" href="' + url + '" download="' + esc(nombre) + '">Descargar</a>';
      Array.prototype.forEach.call(m.el.querySelectorAll('[data-cze-z]'), function (b) { b.hidden = true; });
      void por;
    };
    var pintarHojas = function () {
      var g = ++st.gen, ancho = Math.max(200, (sc.clientWidth || 600) - 24), dpr = Math.min(2, G.devicePixelRatio || 1);
      lz.innerHTML = ''; var cadena = Promise.resolve();
      for (var i = 1; i <= st.n; i++) (function (i) {
        var cv = document.createElement('canvas'); cv.setAttribute('data-hoja', i); cv.setAttribute('aria-label', 'Hoja ' + i + ' de ' + st.n); lz.appendChild(cv);
        cadena = cadena.then(function () {
          if (st.cerrado || g !== st.gen) return;
          return st.pdf.getPage(i).then(function (pg) {
            var v1 = pg.getViewport({ scale: 1 }), esc1 = ancho / v1.width * st.z, vp = pg.getViewport({ scale: esc1 * dpr });
            cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height); cv.style.width = Math.floor(vp.width / dpr) + 'px'; cv.style.height = Math.floor(vp.height / dpr) + 'px';
            return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          });
        });
      })(i);
      return cadena.then(function () { if (g === st.gen) lz.setAttribute('data-cze-visor', 'listo'); });
    };
    sc.addEventListener('scroll', function () {
      // La hoja que cruza la mitad de la ventana; hasta abajo, la última.
      var L = lz.querySelectorAll('canvas'), y0 = sc.getBoundingClientRect().top + sc.clientHeight / 2, k = 1;
      for (var i = 0; i < L.length; i++) if (L[i].getBoundingClientRect().top <= y0) k = i + 1;
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) k = L.length || 1;
      iEl.textContent = k;
    }, { passive: true });
    Array.prototype.forEach.call(m.el.querySelectorAll('[data-cze-z]'), function (b) {
      b.onclick = function () { if (!st.pdf) return; var Z = [0.5, 0.75, 1, 1.25, 1.6, 2, 2.5, 3], i = Z.indexOf(st.z), d = Number(b.getAttribute('data-cze-z'));
        st.z = Z[Math.max(0, Math.min(Z.length - 1, (i < 0 ? 2 : i) + d))]; lz.setAttribute('data-cze-visor', 'cargando'); pintarHojas(); };
    });
    // Al girar el teléfono o cambiar el ancho de la ventana, las hojas se vuelven a pintar al ancho nuevo.
    var anchoV = sc.clientWidth, tR = null, alCambiar = function () {
      if (st.cerrado) { G.removeEventListener('resize', alCambiar); return; }
      clearTimeout(tR); tR = setTimeout(function () { if (st.pdf && Math.abs(sc.clientWidth - anchoV) > 40) { anchoV = sc.clientWidth; pintarHojas(); } }, 250);
    };
    G.addEventListener('resize', alCambiar);
    cargarPdfjs().then(function (L) {
      if (st.cerrado) return;
      return L.getDocument({ data: u8.slice() }).promise.then(function (pdf) {
        if (st.cerrado) return; st.pdf = pdf; st.n = pdf.numPages; nEl.textContent = st.n; return pintarHojas();
      });
    }).catch(function (e) { respaldo(e && e.message); });
    return { el: m.el, cerrar: m.cerrar, url: url, descargar: function () { descargar(url, nombre); } };
  }

  G.CzEstado = { on: on, inicio: inicio, caso: caso, cerrar: cerrar, barra: barra,
    vista: function () { return S.vista || null; }, alCambiar: function (f) { if (typeof f === 'function' && OY.indexOf(f) < 0) OY.push(f); }, visorPdf: visorPdf, hojas: hojas, descargar: descargar, _estado: S, PDFJS: PDFJS, WORKER: WORKER };
})(window);
