/* ═══ Conceptualizador · «Hay versión nueva · Actualizar» (V1.35, #4 pendiente 6177746433 punto 1) ═══
 *
 * La pantalla compara su versión (CzApp.VERSION) con version.json del servidor al abrir, cada 5 min,
 * al volver a la pestaña y al volver la red. Si difieren, muestra una franja arriba con «Actualizar».
 * Al tocarlo recarga SIN perder lo pendiente:
 *   · lo que falta por enviar vive en IndexedDB (cz-cola.js) y la cola lo retoma sola al recargar
 *     (cada mensaje lleva cliente_id y cada adjunto su sha256: un reintento no duplica nada);
 *   · si el teléfono NO guarda la cola (modo privado: la cola vive en memoria) y hay pendientes,
 *     pregunta antes, porque ahí sí se perderían;
 *   · con una grabación en curso no recarga: pide terminarla primero; sin señal tampoco (la página no
 *     cargaría): espera a que vuelva;
 *   · lo escrito y no enviado (la caja de mensaje y las cajitas de «Corregir») se guarda en
 *     sessionStorage y se repone después de recargar.
 * La recarga lleva `?v=<versión>` para que el navegador no sirva el HTML viejo de su caché.
 */
(function (G) {
  'use strict';
  var CADA_MS = 5 * 60 * 1000, LLAVE = 'cz_recarga';
  var ultima = 0, nueva = null, el = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function actual() { return G.CzApp && G.CzApp.VERSION; }
  function toast(t) { var e = document.getElementById('toast'); if (!e) return; e.textContent = t; e.classList.add('on'); setTimeout(function () { e.classList.remove('on'); }, 3400); }

  async function revisar(forzar) {
    if (!forzar && Date.now() - ultima < 60000) return null;
    ultima = Date.now();
    try {
      var r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      var j = await r.json();
      if (j && j.version && actual() && j.version !== actual()) mostrar(j.version);
      return j && j.version;
    } catch (e) { return null; }
  }

  function mostrar(v) {
    nueva = v;
    if (!el) {
      el = document.createElement('div'); el.id = 'nuevaVer'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = '<span>Hay versión nueva · <b>' + esc(v) + '</b></span><button type="button" id="bActualizar">Actualizar</button>';
    el.querySelector('button').onclick = actualizar;
    el.classList.add('on'); document.body.classList.add('con-version');
  }

  /** Lo escrito y no enviado: la caja de mensaje y las cajitas abiertas de «Corregir». */
  function guardarBorrador() {
    var st = (G.CzApp && G.CzApp._st) || {}, borr = {};
    Object.keys(st.borr || {}).forEach(function (k) { var b = st.borr[k]; if (b && b.texto) borr[k] = b.texto; });
    var i = document.getElementById('in');
    try { sessionStorage.setItem(LLAVE, JSON.stringify({ en: Date.now(), de: actual(), a: nueva, texto: i ? i.value : '', borr: borr })); } catch (e) {}
  }

  async function actualizar() {
    var GR = G.CzGrabadora, Q = G.CzCola;
    if (GR && GR.algunaActiva && GR.algunaActiva()) return toast('Termina o envía la grabación primero.');
    // Sin red, recargar dejaría la pantalla en blanco (no hay service worker): se espera a que vuelva.
    if (G.navigator && G.navigator.onLine === false) return toast('Sin conexión. Actualiza cuando vuelva la señal.');
    if (Q && Q.persistente && !Q.persistente()) {
      var n = 0;
      try { n = ((await Q.salida()) || []).length + ((await Q.dictados()) || []).length; } catch (e) {}
      if (n && !G.confirm('Este teléfono no guarda lo que falta por enviar (' + n + '). Si actualizas ahora, se pierde. ¿Actualizar de todos modos?')) return;
    }
    guardarBorrador();
    var b = document.getElementById('bActualizar'); if (b) { b.disabled = true; b.textContent = 'Actualizando…'; }
    G.location.replace(G.location.pathname + '?v=' + encodeURIComponent(nueva || Date.now()) + G.location.hash);
  }

  /** Antes de arrancar la app: las cajitas de «Corregir» vuelven abiertas con su texto. */
  var guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(LLAVE) || 'null'); sessionStorage.removeItem(LLAVE); } catch (e) {}
  if (guardado && Date.now() - guardado.en > 10 * 60 * 1000) guardado = null;   // solo lo de una recarga recién hecha
  if (guardado && G.CzApp && G.CzApp._st) {
    var st = G.CzApp._st; st.borr = st.borr || {};
    Object.keys(guardado.borr || {}).forEach(function (k) { st.borr[k] = { abierto: true, texto: guardado.borr[k] }; });
  }

  /* V1.38 (#4 punto 8) · ¿Este teléfono acaba de pasar a esta versión? Sí, si vino del botón «Actualizar» (guardado.de)
   * o si la última versión que vio es otra. La primera vez que un teléfono trae esta marca (de V1.37 a V1.38) cuenta
   * como salto si ya había usado el conceptualizador (hay llaves cz_ suyas); un teléfono nuevo, no. El salto se GUARDA
   * (cz_salto_de / cz_salto_a) para toda la versión: una segunda recarga no debe dejar sin ponerse al día los casos
   * que todavía no se abren. Cada caso lo muestra una sola vez (cz-app.js). */
  var VISTA = 'cz_version_vista', salto = null;
  try {
    var antes = localStorage.getItem(VISTA), usado = false, de = null;
    for (var i = 0; i < localStorage.length; i++) { var kk = localStorage.key(i); if (kk && kk.indexOf('cz_') === 0 && kk !== VISTA) { usado = true; break; } }
    if (guardado && guardado.de && guardado.de !== actual()) de = guardado.de;
    else if (antes && antes !== actual()) de = antes;
    else if (!antes && usado) de = 'anterior';
    if (de && actual()) { localStorage.setItem('cz_salto_de', de); localStorage.setItem('cz_salto_a', actual()); }
    if (actual()) localStorage.setItem(VISTA, actual());
    if (actual() && localStorage.getItem('cz_salto_a') === actual()) salto = localStorage.getItem('cz_salto_de') || 'anterior';
  } catch (e) {}

  G.CzVersion = {
    /** La versión de la que venía, si esta carga es un salto; si no, null. */
    salto: function () { return salto; },
    /** Después de CzApp.arrancar(): repone la caja de mensaje y empieza a revisar. */
    iniciar: function () {
      if (guardado && guardado.texto) {
        var i = document.getElementById('in');
        if (i && !i.value) { i.value = guardado.texto; i.dispatchEvent(new Event('input')); }
      }
      if (guardado) toast('Actualizado a ' + (actual() || 'la versión nueva') + '.');
      revisar(true);
      setInterval(function () { if (!document.hidden) revisar(true); }, CADA_MS);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) revisar(false); });
      G.addEventListener('online', function () { revisar(false); });
    },
    revisar: revisar, _mostrar: mostrar
  };
})(window);
