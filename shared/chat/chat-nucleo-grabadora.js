/* ═══ GENERADO por shared/chat/subir-del-conceptualizador.js desde comercial/conceptualizador/js/cz-grabadora.js · NO SE EDITA A MANO ═══
 * Para cambiarlo se cambia en el conceptualizador y se vuelve a generar (y se revisa con --revisar). */
/* ═══ Conceptualizador · grabadora de notas de voz, igual que WhatsApp ═══
 *
 * La misma pieza para la caja principal del chat y para las cajitas de
 * corregir/rechazar (en chiquito). Mientras graba, la barra se vuelve:
 *   basura · punto rojo + cronómetro · onda en vivo · pausa · enviar
 * En pausa:
 *   basura · ▶ escuchar lo grabado (con su onda) · reanudar · enviar
 * Nunca muestra solo «Grabando» en letras rojas.
 *
 * El estado vive aquí, por llave (`k`), y no en el HTML: el chat se repinta
 * cada 2.5 s y la grabación sigue. Quien la usa pinta `html(k)` donde quiera y
 * llama `enlazar(raiz)`; la onda y el reloj se actualizan solos cuadro a cuadro.
 *
 * Fuente única: fts-conceptualizador/prototipos/comun/cz-grabadora.js. El
 * prototipo la incrusta y la suite la sirve igual (comercial/conceptualizador/js/).
 */
(function (G) {
  'use strict';
  var TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  var MAX_SEG = 10 * 60, CADA_MS = 90;
  var E = {};        // k → estado
  var raf = null;

  var IC = {
    basura: '<path d="M5 7h14"/><path d="M10 7V4.5h4V7"/><path d="M7 7l1 12.5a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7"/><path d="M10.5 11v6M13.5 11v6"/>',
    pausa: '<rect x="7" y="5.5" width="3.6" height="13" rx="1"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    enviar: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>'
  };
  function ico(n, lleno) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="ico"' + (lleno ? ' style="fill:currentColor;stroke:none"' : '') + '>' + IC[n] + '</svg>';
  }
  function tipo() {
    if (!G.MediaRecorder) return null;
    for (var i = 0; i < TIPOS.length; i++) { try { if (MediaRecorder.isTypeSupported(TIPOS[i])) return TIPOS[i]; } catch (e) {} }
    return '';
  }
  function puede() { return !!(G.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && tipo() !== null); }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function seg(e) { return (e.acum + (e.fase === 'grabando' ? Date.now() - e.desde : 0)) / 1000; }

  /** Empieza a grabar en la llave `k`.
   *  op.chico: versión de cajita · op.alTerminar(nota) · op.alCancelar() · op.alCambiar() (repintar)
   *  op.simular: sin micrófono (solo el prototipo) */
  async function iniciar(k, op) {
    op = op || {};
    if (E[k]) return E[k];
    var e = { k: k, op: op, fase: 'grabando', acum: 0, desde: Date.now(), inicio: Date.now(), barras: [], partes: [],
              escuchando: null, pos: 0, rec: null, flujo: null, an: null, ctx: null, buf: null, ult: 0, url: null };
    if (!op.simular) {
      var t = tipo();
      if (t === null) throw new Error('Este navegador no puede grabar audio.');
      // Safari iOS: el AudioContext tiene que nacer DENTRO del toque. Después del await de getUserMedia ya no
      // cuenta como gesto, nace suspendido y resume() se rechaza: la grabación sale bien pero la onda queda plana.
      var AC = G.AudioContext || G.webkitAudioContext, ctx0 = null;
      try { ctx0 = AC ? new AC() : null; if (ctx0 && ctx0.state === 'suspended' && ctx0.resume) ctx0.resume().catch(function () {}); } catch (er) { ctx0 = null; }
      try { e.flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (er) { if (ctx0) { try { ctx0.close(); } catch (e2) {} } throw er; }
      e.rec = new MediaRecorder(e.flujo, t ? { mimeType: t, audioBitsPerSecond: 32000 } : undefined);
      e.mime = (e.rec.mimeType || t || 'audio/webm').split(';')[0];
      e.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) e.partes.push(ev.data); };
      e.rec.start(1000);
      try {
        e.ctx = ctx0 || new AC(); var src = e.ctx.createMediaStreamSource(e.flujo);
        e.an = e.ctx.createAnalyser(); e.an.fftSize = 512; src.connect(e.an); e.buf = new Uint8Array(e.an.fftSize);
        if (e.ctx.state === 'suspended' && e.ctx.resume) e.ctx.resume().catch(function () {});
      } catch (er) { e.an = null; }
    } else { e.mime = 'audio/webm'; }
    E[k] = e; ciclo(); if (op.alCambiar) op.alCambiar();
    return e;
  }
  function nivel(e) {
    if (e.an) {
      e.an.getByteTimeDomainData(e.buf); var m = 0;
      for (var i = 0; i < e.buf.length; i++) { var v = Math.abs(e.buf[i] - 128); if (v > m) m = v; }
      return Math.min(1, Math.sqrt(m / 90));   // raíz: la voz baja también se ve, como en WhatsApp
    }
    var t = Date.now() / 1000;   // simulado: parece voz
    return Math.max(0.06, Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1)) * (0.5 + 0.5 * Math.random()));
  }
  function pausar(k) {
    var e = E[k]; if (!e || e.fase !== 'grabando') return;
    e.acum += Date.now() - e.desde; e.fase = 'pausa';
    if (e.rec) { try { e.rec.requestData(); } catch (er) {} try { e.rec.pause(); } catch (er) {} }
    pinta(k); if (e.op.alCambiar) e.op.alCambiar();
  }
  function reanudar(k) {
    var e = E[k]; if (!e || e.fase !== 'pausa') return;
    pararEscucha(e);
    e.fase = 'grabando'; e.desde = Date.now();
    if (e.rec) { try { e.rec.resume(); } catch (er) {} }
    pinta(k); if (e.op.alCambiar) e.op.alCambiar(); ciclo();
  }
  function blobDe(e) { return new Blob(e.partes, { type: e.mime || 'audio/webm' }); }
  /** En pausa: escuchar lo grabado antes de mandarlo. */
  function escuchar(k) {
    var e = E[k]; if (!e || e.fase !== 'pausa') return;
    if (e.escuchando) { pararEscucha(e); return pinta(k); }
    if (!e.partes.length) { e.pos = 0; e.escuchando = { sim: true, t0: Date.now() }; pinta(k); return ciclo(); }
    if (e.url) URL.revokeObjectURL(e.url);
    e.url = URL.createObjectURL(blobDe(e));
    var a = new Audio(e.url); e.escuchando = { audio: a };
    a.onended = function () { pararEscucha(e); e.pos = 0; pinta(k); };
    a.play().catch(function () { pararEscucha(e); pinta(k); });
    pinta(k); ciclo();
  }
  function pararEscucha(e) { if (e.escuchando && e.escuchando.audio) e.escuchando.audio.pause(); e.escuchando = null; }
  function soltar(e) {
    pararEscucha(e);
    if (e.flujo) e.flujo.getTracks().forEach(function (t) { t.stop(); });
    if (e.ctx) { try { e.ctx.close(); } catch (er) {} }
    if (e.url) URL.revokeObjectURL(e.url);
    delete E[e.k];
  }
  function basura(k) {
    var e = E[k]; if (!e) return;
    if (e.rec) { e.rec.onstop = null; try { e.rec.stop(); } catch (er) {} }
    soltar(e); if (e.op.alCancelar) e.op.alCancelar(); if (e.op.alCambiar) e.op.alCambiar();
  }
  /** Enviar: detiene y entrega la nota. Quien llama decide qué hacer (encolar, transcribir…). */
  function enviar(k) {
    var e = E[k]; if (!e) return Promise.resolve(null);
    var s = Math.round(seg(e));
    var listo = function () {
      var ext = /mp4/.test(e.mime) ? 'm4a' : /ogg/.test(e.mime) ? 'ogg' : 'webm';
      var blob = e.partes.length ? blobDe(e) : new Blob([new Uint8Array(0)], { type: e.mime });
      var nota = { blob: blob, mime: e.mime, clase: 'audio', bytes: blob.size, duracion_s: s, barras: e.barras.slice(),
                   escrito_at: e.inicio, nombre: 'nota-de-voz-' + new Date(e.inicio).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext };
      var op = e.op; soltar(e);
      if (op.alCambiar) op.alCambiar();
      return op.alTerminar ? Promise.resolve(op.alTerminar(nota)).then(function () { return nota; }) : nota;
    };
    if (!e.rec) return Promise.resolve(listo());
    return new Promise(function (ok) {
      e.rec.onstop = function () { ok(listo()); };
      try { if (e.rec.state === 'paused') e.rec.resume(); e.rec.stop(); } catch (er) { ok(listo()); }
    });
  }

  // ── pintar ──────────────────────────────────────────────────────────────
  function ondaVivaHtml(e, n) {
    var B = e.barras.slice(-n), h = '';
    for (var i = 0; i < n - B.length; i++) h += '<i style="height:2px"></i>';
    return h + B.map(function (v) { return '<i style="height:' + Math.max(2, Math.round(v * 22)) + 'px"></i>'; }).join('');
  }
  function ondaGrabadaHtml(e, n) {
    // Toda la grabación comprimida a n barras; las ya escuchadas van en color.
    var B = e.barras, out = [], f = 0;
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * B.length / n), b = Math.max(a + 1, Math.floor((i + 1) * B.length / n)), m = 0;
      for (var j = a; j < b && j < B.length; j++) m = Math.max(m, B[j]);
      out.push(m);
    }
    if (e.escuchando) f = posEscucha(e);
    var corte = Math.round(f * n);
    return out.map(function (v, i) { return '<i style="height:' + Math.max(2, Math.round(v * 22)) + 'px"' + (i < corte ? ' class="ya"' : '') + '></i>'; }).join('');
  }
  function posEscucha(e) {
    var es = e.escuchando; if (!es) return 0;
    var D = seg(e);
    if (es.audio) return D ? Math.min(1, es.audio.currentTime / D) : 0;
    return D ? Math.min(1, (Date.now() - es.t0) / 1000 / D) : 0;
  }
  /** Markup de la barra de grabación de la llave `k` (vacío si no está grabando). */
  function html(k) {
    var e = E[k]; if (!e) return '';
    var ch = e.op.chico, n = e.n || (ch ? 22 : 34), sk = String(k).replace(/"/g, '');
    var h = '<div class="grab' + (ch ? ' chico' : '') + (e.fase === 'pausa' ? ' pausa' : '') + '" data-grab="' + sk + '" role="group" aria-label="Grabando nota de voz">' +
      '<button type="button" class="g-bt g-basura" data-g="basura" aria-label="Borrar la grabación">' + ico('basura') + '</button>';
    if (e.fase === 'grabando') {
      h += '<span class="g-rec"><i class="g-punto"></i><b data-g-t>' + mmss(seg(e)) + '</b></span>' +
        '<span class="g-onda viva" data-g-onda>' + ondaVivaHtml(e, n) + '</span>' +
        '<button type="button" class="g-bt g-pausa" data-g="pausa" aria-label="Pausar">' + ico('pausa', true) + '</button>';
    } else {
      h += '<button type="button" class="g-bt g-oir" data-g="oir" aria-label="' + (e.escuchando ? 'Detener' : 'Escuchar lo grabado') + '">' + ico(e.escuchando ? 'pausa' : 'play', true) + '</button>' +
        '<span class="g-onda" data-g-onda>' + ondaGrabadaHtml(e, n) + '</span><b class="g-dur" data-g-t>' + mmss(seg(e)) + '</b>' +
        '<button type="button" class="g-bt g-reanuda" data-g="reanuda" aria-label="Seguir grabando">' + ico('mic') + '</button>';
    }
    return h + '<button type="button" class="g-bt g-enviar" data-g="enviar" aria-label="' + esc(e.op.etiquetaEnviar || 'Enviar') + '">' + ico('enviar') + '</button></div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* V1.42 · TODAS las barras de la llave, no la primera. Desde V1.40 la cajita de «✎ Corregir» sale dos veces con
   * la misma llave (en el chat y en la hoja del rubro, encima). Con querySelector se movía la del chat, escondida
   * detrás de la hoja: el reloj y la onda no avanzaban en la que se ve, y ▶ Escuchar no cambiaba (reporte de
   * campo, #4). Sigue siendo UNA pieza: la caja principal y las cajitas usan esta misma. */
  function barras(k) {
    return G.document ? Array.prototype.slice.call(document.querySelectorAll('[data-grab="' + String(k).replace(/"/g, '') + '"]')) : [];
  }
  function pinta(k) {
    var L = barras(k); if (!L.length) return;
    L.forEach(function (el) { el.outerHTML = html(k); }); enlazar(document);
  }
  function enlazar(raiz) {
    Array.prototype.forEach.call((raiz || document).querySelectorAll('[data-grab]'), function (el) {
      var k = el.getAttribute('data-grab');
      Array.prototype.forEach.call(el.querySelectorAll('[data-g]'), function (b) {
        b.onclick = function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          var a = b.getAttribute('data-g');
          if (a === 'basura') basura(k); else if (a === 'pausa') pausar(k); else if (a === 'reanuda') reanudar(k);
          else if (a === 'oir') escuchar(k); else if (a === 'enviar') { b.disabled = true; enviar(k); }
        };
      });
    });
  }
  function ciclo() {
    cancelAnimationFrame(raf);
    var vivo = false;
    Object.keys(E).forEach(function (k) {
      var e = E[k], L = barras(k);
      if (e.fase === 'grabando') {
        vivo = true;
        if (Date.now() - e.ult >= CADA_MS) { e.ult = Date.now(); e.barras.push(nivel(e)); }
        if (seg(e) >= MAX_SEG) { enviar(k); return; }
      }
      if (e.escuchando) { vivo = true; if (posEscucha(e) >= 1 && !e.escuchando.audio) { e.escuchando = null; pinta(k); return; } }
      L.forEach(function (el) {
        var t = el.querySelector('[data-g-t]'), o = el.querySelector('[data-g-onda]');
        if (o && o.clientWidth) e.n = Math.max(12, Math.min(120, Math.floor(o.clientWidth / 5)));
        var n = e.n || (e.op.chico ? 22 : 34);
        if (t) t.textContent = mmss(seg(e));
        if (o) o.innerHTML = e.fase === 'grabando' ? ondaVivaHtml(e, n) : ondaGrabadaHtml(e, n);
      });
    });
    if (vivo) raf = requestAnimationFrame(ciclo);
  }

  G.ChatNucleoGrabadora = { puede: puede, iniciar: iniciar, html: html, enlazar: enlazar, pausar: pausar, reanudar: reanudar,
    escuchar: escuchar, basura: basura, enviar: enviar, activa: function (k) { return !!E[k]; },
    fase: function (k) { return E[k] ? E[k].fase : null; }, segundos: function (k) { return E[k] ? seg(E[k]) : 0; },
    algunaActiva: function () { return Object.keys(E).length > 0; },
    limpiar: function () { Object.keys(E).forEach(basura); } };
})(window);
