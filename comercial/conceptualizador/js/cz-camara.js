/* ═══ Conceptualizador · ráfaga de fotos (V1.43, pedido de Montalvo, #4 punto 8) ═══
 *
 * Al tocar Cámara entra a un modo de captura DENTRO de la app (getUserMedia): cada toque toma una foto sin pedir
 * aceptar; abajo a la izquierda un cuadrito con la miniatura de la última y el contador; arriba «Aceptar (N)».
 * Al aceptar, las fotos pasan al flujo que ya existe (previsualizar todas, borrar alguna, enviar).
 * Si el navegador no da cámara en vivo (sin permiso, sin HTTPS, sin getUserMedia), cae al flujo de antes: el
 * <input type=file capture> del sistema. Nunca se rompe: lo peor es la cámara de siempre.
 *
 *   CzCamara.puede()                      → ¿hay getUserMedia?
 *   CzCamara.abrir({ alAceptar(files), alFallar(err), aviso(texto) })   → Promise<boolean> (false = usar el input de siempre)
 */
(function (G) {
  'use strict';
  var CSS = '.czc{position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;color:#fff;touch-action:none}' +
    '.czc video{flex:1;min-height:0;width:100%;object-fit:cover;background:#000}' +
    '.czc-arr{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;padding-top:max(12px,env(safe-area-inset-top));background:linear-gradient(#0009,#0000)}' +
    '.czc-arr button{font:inherit;font-size:15px;border:0;border-radius:20px;padding:9px 16px;cursor:pointer}' +
    '.czc-x{background:#ffffff26;color:#fff}.czc-ok{background:#25d366;color:#05351b;font-weight:600}.czc-ok:disabled{background:#ffffff40;color:#ffffffa0}' +
    '.czc-aba{position:absolute;left:0;right:0;bottom:0;height:120px;padding-bottom:env(safe-area-inset-bottom);display:flex;align-items:center;justify-content:center;background:linear-gradient(#0000,#000a)}' +
    '.czc-disp{width:72px;height:72px;border-radius:50%;border:5px solid #fff;background:#ffffff33;cursor:pointer;padding:0}' +
    '.czc-disp:active{background:#fff}' +
    '.czc-min{position:absolute;left:16px;bottom:calc(24px + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:8px;border:2px solid #fff;overflow:hidden;background:#222;display:none}' +
    '.czc-min img{width:100%;height:100%;object-fit:cover}.czc-min b{position:absolute;right:-1px;top:-1px;background:#25d366;color:#05351b;font-size:13px;min-width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;padding:0 5px}' +
    '.czc-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .15s}';
  var abierta = null;

  function puede() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && G.isSecureContext !== false); }

  async function abrir(op) {
    op = op || {};
    if (abierta || !puede()) return false;
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); }
    catch (e) { if (op.alFallar) op.alFallar(e); return false; }
    if (!document.getElementById('czc-css')) { var st = document.createElement('style'); st.id = 'czc-css'; st.textContent = CSS; document.head.appendChild(st); }
    var fotos = [], urls = [];
    var raiz = document.createElement('div'); raiz.className = 'czc'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-label', 'Cámara: ráfaga de fotos');
    raiz.innerHTML = '<video playsinline autoplay muted></video><div class="czc-flash"></div>' +
      '<div class="czc-arr"><button type="button" class="czc-x" data-czc="cerrar">✕ Cancelar</button><button type="button" class="czc-ok" data-czc="aceptar" disabled>Aceptar (0)</button></div>' +
      '<div class="czc-aba"><button type="button" class="czc-disp" data-czc="foto" aria-label="Tomar foto"></button></div>' +
      '<div class="czc-min" data-czc="min"><img alt="Última foto"><b>0</b></div>';
    document.body.appendChild(raiz);
    var v = raiz.querySelector('video'); v.srcObject = stream;
    try { await v.play(); } catch (e) {}
    abierta = raiz;
    var pintar = function () {
      var ok = raiz.querySelector('[data-czc="aceptar"]'); ok.textContent = 'Aceptar (' + fotos.length + ')'; ok.disabled = !fotos.length;
      var m = raiz.querySelector('.czc-min'); m.style.display = fotos.length ? 'block' : 'none';
      if (fotos.length) { m.querySelector('img').src = urls[urls.length - 1]; m.querySelector('b').textContent = fotos.length; }
    };
    var cerrar = function () {
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      raiz.remove(); abierta = null; document.removeEventListener('keydown', tecla);
    };
    var tomar = function () {
      var w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) { if (op.aviso) op.aviso('La cámara todavía no está lista.'); return; }
      var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
      var fl = raiz.querySelector('.czc-flash'); fl.style.opacity = '.7'; setTimeout(function () { fl.style.opacity = '0'; }, 120);
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
      c.toBlob(function (b) {
        if (!b) return;
        var n = fotos.length + 1, d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
        var nombre = 'foto-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + n + '.jpg';
        var f; try { f = new File([b], nombre, { type: 'image/jpeg', lastModified: Date.now() }); } catch (e) { f = b; f.name = nombre; }
        fotos.push(f); urls.push(URL.createObjectURL(b)); pintar();
      }, 'image/jpeg', 0.85);
    };
    var tecla = function (e) { if (e.key === 'Escape') cerrar(); else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tomar(); } };
    document.addEventListener('keydown', tecla);
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-czc]'), q = b && b.getAttribute('data-czc');
      if (q === 'cerrar') { if (!fotos.length || confirm('¿Descartar las ' + fotos.length + ' fotos?')) cerrar(); return; }
      if (q === 'aceptar') { var L = fotos.slice(); cerrar(); if (op.alAceptar) op.alAceptar(L); return; }
      if (q === 'foto' || e.target === v) tomar();
    });
    return true;
  }

  G.CzCamara = { puede: puede, abrir: abrir, abierta: function () { return !!abierta; } };
})(window);
