/*
 * FTS Suite — auto version-check (PR-7)
 * ─────────────────────────────────────
 * Detecta cuando el navegador sirve un bundle VIEJO cacheado y fuerza refresh.
 * Motivación: GitHub Pages sirve los assets con Cache-Control: max-age=600 (10 min)
 * SIN service worker; una pestaña de kiosco de larga vida (o el navegador móvil que
 * no re-navega) puede correr el bundle stale durante DÍAS y generar huecos de datos
 * (ej. checkout sin `cuenta_id`). Ver docs/operaciones/FASE15_CUENTAS_WATCHDOGS.md
 * Parte 12 (evidencia execution n8n 33625) + CLAUDE.md Hallazgo #14.
 *
 * Uso (después de que el build local esté disponible):
 *   FTSVersionCheck.run({ versionUrl:'version.json', localBuild: KIOSK_BUILD, tag:'kiosk' });
 *
 * Contrato de version.json:  { "build": "<mismo string que el build en pantalla>" }
 * Convención de deploy: al bumpear KIOSK_BUILD / CH_BUILD, bumpear version.json.build
 * al MISMO string (misma disciplina que "bump de build obligatorio", CLAUDE.md §8).
 *
 * ES5-safe (navegadores móviles viejos). Sin dependencias.
 */
(function () {
  var COOLDOWN_MS = 11 * 60 * 1000; // > max-age 600s de GH Pages: si el 1er reload cayó
                                    // dentro de la ventana y trajo JS viejo, reintenta pasada la ventana.

  // Limpieza defensiva: hoy NO hay service worker, pero si algún día se agrega, esto
  // lo desregistra + borra Cache Storage antes del reload. No-op si no existen.
  function cleanupCaches() {
    var tasks = [];
    try {
      if (navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        tasks.push(
          navigator.serviceWorker.getRegistrations().then(function (rs) {
            return Promise.all((rs || []).map(function (r) {
              try { return r.unregister(); } catch (e) { return null; }
            }));
          })['catch'](function () {})
        );
      }
    } catch (e) {}
    try {
      if (window.caches && caches.keys) {
        tasks.push(
          caches.keys().then(function (ks) {
            return Promise.all((ks || []).map(function (k) { return caches['delete'](k); }));
          })['catch'](function () {})
        );
      }
    } catch (e) {}
    if (window.Promise) return Promise.all(tasks);
    return { then: function (cb) { cb(); } }; // fallback si no hay Promise (no debería pasar; hay fetch)
  }

  function check(opts) {
    var url = opts.versionUrl || 'version.json';
    var local = opts.localBuild || '';
    var tag = opts.tag || 'app';
    if (!local) return; // sin build local no hay con qué comparar
    var sep = url.indexOf('?') < 0 ? '?' : '&';
    fetch(url + sep + 'ts=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.build) return;
        var guard = 'fts_vc_' + tag + '_' + v.build;
        if (v.build === local) {
          // Ya estamos en el build servido: limpiar el guard por si venía de un reload previo.
          try { sessionStorage.removeItem(guard); } catch (e) {}
          return;
        }
        // build local != servido → el bundle en memoria es viejo (cacheado).
        try {
          var last = parseInt(sessionStorage.getItem(guard) || '0', 10);
          if (last && (Date.now() - last) < COOLDOWN_MS) return; // reintentado hace <11 min → esperar
          sessionStorage.setItem(guard, String(Date.now()));
        } catch (e) {}
        cleanupCaches().then(function () {
          try {
            // ?v= busta el cache del DOCUMENTO. GH Pages ignora el query (sirve index.html);
            // pasada la ventana de max-age los subrecursos (js) también llegan frescos.
            location.replace(location.pathname + '?v=' + encodeURIComponent(v.build));
          } catch (e) { location.reload(); }
        });
      })
      ['catch'](function () { /* offline / sin version.json → no-op silencioso */ });
  }

  // Debounce: focus + visibilitychange pueden dispararse juntos.
  var running = false;
  function safeCheck(opts) {
    if (running) return;
    running = true;
    try { check(opts); } finally {
      setTimeout(function () { running = false; }, 3000);
    }
  }

  window.FTSVersionCheck = {
    run: function (opts) {
      opts = opts || {};
      if (!('fetch' in window)) return; // navegadores muy viejos: no-op (no rompe nada)
      safeCheck(opts);
      // Pestañas de larga vida (kiosco / panel abierto todo el día): re-chequear al volver el foco.
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') safeCheck(opts);
        });
        window.addEventListener('focus', function () { safeCheck(opts); });
      } catch (e) {}
    }
  };
})();
