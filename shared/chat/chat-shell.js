/* ═══ shared/chat · carcasa: burbujas, cola pintada, red y delegación (#407 §2.2) ═══
 * Junto con chat-archivos.js (visor) y chat-grabadora.js (barra y nota de voz) forma ChatUI.
 *
 * Burbujas tipo WhatsApp, barra de escribir con foto / archivo / nota de voz, grabadora y visor
 * de adjuntos. No sabe de ningún producto: el producto decide qué tarjetas pintar debajo de
 * un mensaje (opts.extra) y qué hacer con lo que se escribe (callbacks de barra()).
 *
 * Regla de la suite que aquí se cumple: un mensaje en cola dice «pendiente de enviar» y NUNCA
 * lleva ✓ hasta que el servidor lo devuelve en el hilo (CLAUDE.md §15).
 */
(function (G) {
  'use strict';
  var Me = function () { return G.ChatMedios; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hora(ts) { var d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
  function fecha(ts) {
    var d = new Date(ts); if (isNaN(d)) return '';
    var hoy = new Date(); if (d.toDateString() === hoy.toDateString()) return hora(ts);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  }
  function dur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  var tt = null;
  function toast(t, ms) {
    var e = document.getElementById('ch-toast');
    if (!e) { e = document.createElement('div'); e.id = 'ch-toast'; e.className = 'ch-toast ch-oculto'; e.setAttribute('role', 'status'); document.body.appendChild(e); }
    e.textContent = t; e.classList.remove('ch-oculto'); clearTimeout(tt); tt = setTimeout(function () { e.classList.add('ch-oculto'); }, ms || 2800);
  }
  function adjuntoHtml(a) {
    var ic = a.clase === 'foto' ? '📷' : a.clase === 'audio' ? '🎙️' : a.clase === 'pdf' ? '📄' : a.clase === 'ficha' ? '🗂️' : '📎';
    var et = a.clase === 'audio' ? 'Nota de voz ' + dur(a.duracion_s) : a.nombre;
    return '<div class="ch-adj" data-adj="' + esc(a.id) + '" data-mime="' + esc(a.mime) + '" role="button" tabindex="0">' + ic + ' ' + esc(et) + '</div>' +
      (a.transcripcion ? '<div class="ch-transc">«' + esc(a.transcripcion.slice(0, 600)) + '»</div>' : '');
  }
  /** Un mensaje del servidor. yo = actor de la sesión. opts.extra(m) → HTML debajo del texto. */
  function burbuja(m, yo, opts) {
    opts = opts || {};
    if (m.rol === 'sistema') return '<div class="ch-sistema">' + esc(m.texto) + '</div>';
    var mio = m.rol === 'persona' && m.autor === yo;
    var quien = (m.rol === 'persona' && !mio) ? '<div style="font-size:11px;font-weight:700;color:var(--blue)">' + esc(m.autor) + '</div>' : '';
    return '<div class="ch-msg ' + (mio ? 'yo' : 'el') + '">' + quien + (m.adjuntos || []).map(adjuntoHtml).join('') +
      (m.texto ? esc(m.texto) : '') + (opts.extra ? opts.extra(m) : '') +
      '<span class="hora">' + fecha(m.escrito_at || m.created_at) + (mio ? ' ✓✓' : '') + '</span></div>';
  }
  /** Lo que sigue en la cola del teléfono: sin ✓, con su estado real. */
  function pendiente(it, cola) {
    var adj = (it.archivos || []).map(function (a) {
      var p = cola && cola.progreso(a.local);
      return '<div class="ch-adj">' + (a.clase === 'foto' ? '📷' : a.clase === 'audio' ? '🎙️' : '📎') + ' ' + esc(a.clase === 'audio' ? 'Nota de voz ' + dur(a.duracion_s) : a.nombre) +
        (p !== undefined ? ' · subiendo ' + Math.round(p * 100) + '%' : a.adjunto_id ? ' · subido' : '') + '</div>';
    }).join('');
    var est = it.estado === 'error' ? '<span class="hora malo">no se mandó: ' + esc(it.error) + ' · <a href="#" data-reintentar="' + esc(it.cliente_id) + '">reintentar</a> · <a href="#" data-descartar="' + esc(it.cliente_id) + '">quitar</a></span>'
      : '<span class="hora pend">' + hora(it.escrito_at) + ' pendiente de enviar</span>';
    return '<div class="ch-msg yo" data-pendiente="' + esc(it.cliente_id) + '">' + adj + esc(it.texto) + est + '</div>';
  }

  /** Delegación: clic en un adjunto abre el visor; reintentar/quitar en la cola. */
  function enlazar(cont, cliente, cola) {
    cont.addEventListener('click', function (e) {
      var a = e.target.closest('[data-adj]'); if (a) { G.ChatUI.visor(cliente, a.getAttribute('data-adj')); return; }
      var r = e.target.closest('[data-reintentar]'); if (r) { e.preventDefault(); cola.reintentar(r.getAttribute('data-reintentar')); return; }
      var d = e.target.closest('[data-descartar]'); if (d) { e.preventDefault(); cola.descartar(d.getAttribute('data-descartar')); }
    });
  }
  /** Píldora de red: «en línea» o «sin señal · se guarda en el teléfono». */
  function red(el) {
    function pinta() { var on = navigator.onLine; el.className = 'ch-red ' + (on ? 'on' : 'off'); el.textContent = on ? '● en línea' : '○ sin señal · se guarda en el teléfono'; }
    G.addEventListener('online', pinta); G.addEventListener('offline', pinta); pinta();
  }
  G.ChatUI = Object.assign(G.ChatUI || {}, { esc: esc, hora: hora, fecha: fecha, dur: dur, toast: toast, burbuja: burbuja, pendiente: pendiente, enlazar: enlazar, red: red });
})(window);
