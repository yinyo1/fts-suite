/* ═══ shared/chat · barra de escribir con foto, archivo y nota de voz (#407 §2.2). Carga después de chat-shell.js y chat-medios.js. ═══ */
(function (G) {
  'use strict';
  var esc = function (s) { return G.ChatUI.esc(s); }, toast = function (t) { return G.ChatUI.toast(t); }, dur = function (s) { return G.ChatUI.dur(s); };
  var Me = function () { return G.ChatMedios; };
  /** Barra de escribir. opc: { placeholder, onEnviar(texto, archivos, escritoAt) } */
  function barra(cont, opc) {
    cont.innerHTML = '<div class="ch-barra">' +
      '<button class="ch-redondo claro" data-b="clip" aria-label="Adjuntar foto o archivo" title="Foto o archivo">📎</button>' +
      '<textarea rows="1" aria-label="Mensaje" placeholder="' + esc(opc.placeholder || 'Mensaje') + '"></textarea>' +
      '<button class="ch-redondo" data-b="mic" aria-label="Grabar nota de voz" title="Nota de voz">🎙️</button>' +
      '<input type="file" class="ch-oculto" multiple accept="image/*,audio/*,application/pdf,.pdf,.txt,.md,.csv,.xlsx,.docx"></div>';
    var ta = cont.querySelector('textarea'), mic = cont.querySelector('[data-b="mic"]'), clip = cont.querySelector('[data-b="clip"]'),
        inp = cont.querySelector('input[type=file]'), rec = null, escrito = null, reloj = null;
    function modo() { mic.textContent = ta.value.trim() ? '➤' : '🎙️'; mic.setAttribute('aria-label', ta.value.trim() ? 'Enviar' : 'Grabar nota de voz'); }
    ta.addEventListener('input', function () { if (!escrito) escrito = Date.now(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; modo(); });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width:760px)').matches) { e.preventDefault(); mic.click(); } });
    clip.onclick = function () { inp.click(); };
    inp.onchange = async function () {
      var lista = []; for (var i = 0; i < inp.files.length; i++) { var p = await Me().preparar(inp.files[i]); if (p.error) toast(p.error); else lista.push(p); }
      inp.value = ''; if (lista.length) opc.onEnviar(ta.value.trim(), lista, escrito || Date.now()), ta.value = '', escrito = null, modo();
    };
    mic.onclick = async function () {
      if (ta.value.trim()) { var t = ta.value.trim(); ta.value = ''; ta.style.height = 'auto'; var e = escrito || Date.now(); escrito = null; modo(); opc.onEnviar(t, [], e); return; }
      if (rec) return;
      if (!Me().puedeGrabar()) { toast('Este navegador no puede grabar audio.'); return; }
      try { rec = await Me().grabar(); } catch (er) { toast('No se pudo usar el micrófono: ' + er.message); rec = null; return; }
      var caja = document.createElement('div'); caja.className = 'ch-grabando';
      caja.innerHTML = '<span class="punto"></span><span data-r>0:00</span><span style="flex:1"></span>';
      var bas = document.createElement('button'); bas.className = 'ch-redondo claro'; bas.textContent = '🗑'; bas.setAttribute('aria-label', 'Descartar nota');
      var env = document.createElement('button'); env.className = 'ch-redondo'; env.textContent = '➤'; env.setAttribute('aria-label', 'Enviar nota');
      ta.classList.add('ch-oculto'); mic.classList.add('ch-oculto'); clip.classList.add('ch-oculto');
      var b = cont.querySelector('.ch-barra'); b.insertBefore(bas, b.firstChild); b.insertBefore(caja, inp); b.insertBefore(env, inp);
      var inicio = rec.inicio; reloj = setInterval(function () { caja.querySelector('[data-r]').textContent = dur((rec.transcurrido ? rec.transcurrido() : Date.now() - inicio) / 1000); }, 500);
      // v3 (#421): pausa como WhatsApp (solo si el navegador la soporta).
      var pau = null;
      if (rec.puedePausar) {
        pau = document.createElement('button'); pau.className = 'ch-redondo claro'; pau.textContent = '⏸'; pau.setAttribute('aria-label', 'Pausar la nota');
        b.insertBefore(pau, env);
        pau.onclick = function () {
          if (pau.textContent === '⏸') { if (rec.pausar()) { pau.textContent = '⏺'; pau.setAttribute('aria-label', 'Seguir grabando'); caja.classList.add('pausa'); } }
          else if (rec.reanudar()) { pau.textContent = '⏸'; pau.setAttribute('aria-label', 'Pausar la nota'); caja.classList.remove('pausa'); }
        };
      }
      function fin() { clearInterval(reloj); bas.remove(); env.remove(); caja.remove(); if (pau) pau.remove(); ta.classList.remove('ch-oculto'); mic.classList.remove('ch-oculto'); clip.classList.remove('ch-oculto'); }
      bas.onclick = function () { rec.cancelar(); rec = null; fin(); };
      env.onclick = async function () { var n = await rec.detener(); rec = null; fin(); if (n && n.bytes) opc.onEnviar('', [n], inicio); };
    };
    // v3 (#421): grabar() abre el micrófono sin tocar el botón (corregir por voz); escribir(t) prellena la caja.
    return { foco: function () { ta.focus(); }, grabar: function () { if (!ta.value.trim()) mic.click(); else ta.focus(); },
             escribir: function (t) { ta.value = t || ''; ta.dispatchEvent(new Event('input')); ta.focus(); } };
  }
  G.ChatUI.barra = barra;
})(window);
