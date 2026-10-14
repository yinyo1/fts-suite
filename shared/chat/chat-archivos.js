/* ═══ shared/chat · visor de adjuntos (foto, PDF, audio, ficha HTML) (#407 §2.2). Carga después de chat-shell.js. ═══ */
(function (G) {
  'use strict';
  var esc = function (s) { return G.ChatUI.esc(s); }, toast = function (t) { return G.ChatUI.toast(t); }, dur = function (s) { return G.ChatUI.dur(s); };
  var Me = function () { return G.ChatMedios; };
  /** Visor: baja el adjunto por el cliente del producto y lo muestra (foto, PDF, audio, ficha HTML). */
  async function visor(cliente, id) {
    var cap = document.createElement('div'); cap.className = 'ch-visor';
    cap.innerHTML = '<div style="color:#fff">Cargando…</div><button class="ch-btn ch-btn-s">Cerrar</button>';
    cap.querySelector('button').onclick = function () { cap.remove(); };
    document.body.appendChild(cap);
    var r = await cliente.pedir('ver_adjunto', { adjunto_id: id }, { timeout: 120000 });
    if (!r.ok) { cap.firstChild.textContent = 'No se pudo abrir: ' + (r.mensaje || r.error); return; }
    var a = r.adjunto, bin = atob(a.b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([u8], { type: a.mime }));
    var cuerpo = /^image\//.test(a.mime) ? '<img alt="adjunto" src="' + url + '">'
      : /^audio\//.test(a.mime) ? '<audio controls src="' + url + '"></audio>'
      : a.mime === 'text/html' ? '<iframe sandbox="" title="ficha" src="' + url + '"></iframe>'
      : '<iframe title="adjunto" src="' + url + '"></iframe>';
    cap.innerHTML = cuerpo + '<div class="ch-fila" style="max-width:420px;width:100%"><a class="ch-btn ch-btn-s" download="' + esc(a.nombre) + '" href="' + url + '">Descargar</a><button class="ch-btn ch-btn-s">Cerrar</button></div>';
    cap.querySelector('button').onclick = function () { URL.revokeObjectURL(url); cap.remove(); };
  }

  G.ChatUI.visor = visor;
})(window);
