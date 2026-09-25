/*
 * FTS Suite — chequeo de dependencias de arranque (FTSDeps)
 * ─────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. Los módulos de la Suite cargan varios <script> clásicos que se
 * hablan por variables globales (window.PLANEACION_TURNOS, window.FTSAuth…). Si UNO
 * de ellos no llega —un 404 de un instante, una conexión cortada a media descarga,
 * una extensión que lo bloquea— el navegador sigue con los demás y la página se ve
 * normal. El hueco aparece después, en el botón que lo usa, con un error técnico
 * que nadie entiende. Caso real: 24-sep-2026, Planeación Operativa, `turnos.js` no
 * cargó en el navegador de Felipe y "Generar PNG" dijo «Cannot read properties of
 * undefined (reading 'agruparPorProyectoYTurno')».
 *
 * QUÉ HACE.
 *   1. Al cargarse (va PRIMERO en el <head>) escucha en fase de captura los errores
 *      de carga de <script>/<link> y los errores de sintaxis de un archivo, así sabe
 *      el NOMBRE del que falló.
 *   2. FTSDeps.verificar({...}) se llama al final del <body>, después de todos los
 *      <script>: revisa que cada global declarado exista y, si falta alguno, pinta un
 *      banner rojo que nombra el archivo y pide recargar con Ctrl+Shift+R.
 *   3. FTSDeps.faltantes() lo pueden consultar los botones para explicar su error.
 *
 * USO (ver operaciones/planeacion/index.html):
 *   <head>  <script src="../../shared/deps-check.js?v=BUILD"></script>  (antes que todo)
 *   ...todos los <script> del módulo...
 *   <script>
 *     FTSDeps.verificar({ modulo: 'Planeación', build: 'BUILD', requeridos: [
 *       { global: 'FTSAuth',           archivo: 'shared/auth-suite.js' },
 *       { global: 'PLANEACION_TURNOS', archivo: 'js/turnos.js' } ] });
 *   </script>
 *
 * Y un respaldo en línea por si ESTE archivo es el que no llegó:
 *   if (!window.FTSDeps) { ...banner mínimo... }
 *
 * ES5 (navegadores viejos de campo). Sin dependencias. No hace red.
 */
(function () {
  if (window.FTSDeps) return;

  var fallos = [];   // [{ archivo, tipo: 'carga'|'sintaxis', detalle }]
  var faltan = [];   // [{ global, archivo }]

  function nombreArchivo(url) {
    if (!url) return '';
    try { url = String(url).split('#')[0].split('?')[0]; } catch (e) { return ''; }
    var i = url.indexOf('/fts-suite/');
    if (i >= 0) return url.slice(i + '/fts-suite/'.length);
    var m = url.match(/^[a-z]+:\/\/[^/]+\/(.*)$/i);
    return m ? m[1] : url;
  }

  function registrar(archivo, tipo, detalle) {
    for (var i = 0; i < fallos.length; i++) if (fallos[i].archivo === archivo) return;
    fallos.push({ archivo: archivo, tipo: tipo, detalle: detalle || '' });
  }

  // Captura: los errores de carga de recursos NO burbujean, sólo se ven en captura.
  try {
    window.addEventListener('error', function (ev) {
      var t = ev && ev.target;
      if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        registrar(nombreArchivo(t.src || t.href), 'carga', 'no se pudo descargar');
        return;
      }
      // Error de JavaScript con archivo: si pasa DURANTE la carga es casi siempre un
      // archivo truncado o corrupto (sintaxis), que deja su global sin definir.
      if (ev && ev.filename && document.readyState === 'loading') {
        registrar(nombreArchivo(ev.filename), 'sintaxis', ev.message || '');
      }
    }, true);
  } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function estilos() {
    if (document.getElementById('fts-deps-css')) return;
    var st = document.createElement('style');
    st.id = 'fts-deps-css';
    st.textContent =
      '.fts-deps-banner{position:sticky;top:0;z-index:10000;background:#b42318;color:#fff;' +
      'font:14px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:12px 16px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.25);overflow-wrap:anywhere}' +
      '.fts-deps-banner b{font-weight:700}' +
      '.fts-deps-banner ul{margin:6px 0 8px 18px;padding:0}' +
      '.fts-deps-banner code{background:rgba(255,255,255,.18);padding:1px 5px;border-radius:4px;' +
      'font:13px/1.4 ui-monospace,Menlo,Consolas,monospace}' +
      '.fts-deps-banner kbd{background:#fff;color:#b42318;border-radius:4px;padding:1px 6px;font-weight:700;' +
      'font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}' +
      '.fts-deps-banner button{margin-left:8px;background:#fff;color:#b42318;border:0;border-radius:6px;' +
      'padding:5px 12px;font-weight:700;cursor:pointer;font-size:13px}' +
      '.fts-deps-banner .fts-deps-pie{opacity:.85;font-size:12px;margin-top:4px}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Banner rojo. `lineas` es un arreglo de strings YA escapados o de {archivo, detalle}.
  function banner(titulo, lineas, pie) {
    estilos();
    var el = document.querySelector('.fts-deps-banner');
    if (!el) {
      el = document.createElement('div');
      el.className = 'fts-deps-banner';
      el.setAttribute('role', 'alert');
      var body = document.body || document.documentElement;
      body.insertBefore(el, body.firstChild);
    }
    var items = '';
    for (var i = 0; i < (lineas || []).length; i++) {
      var l = lineas[i];
      items += '<li>' + (typeof l === 'string' ? l
        : '<code>' + esc(l.archivo) + '</code>' + (l.detalle ? ' — ' + esc(l.detalle) : '')) + '</li>';
    }
    el.innerHTML =
      '<div><b>⚠️ ' + esc(titulo) + '</b></div>' +
      (items ? '<ul>' + items + '</ul>' : '') +
      '<div>Recarga la página con <kbd>Ctrl+Shift+R</kbd> (en Mac <kbd>Cmd+Shift+R</kbd>).' +
      '<button type="button" onclick="location.reload()">Recargar</button></div>' +
      (pie ? '<div class="fts-deps-pie">' + esc(pie) + '</div>' : '');
    return el;
  }

  function verificar(opts) {
    opts = opts || {};
    var req = opts.requeridos || [];
    faltan = [];
    for (var i = 0; i < req.length; i++) {
      var r = req[i];
      var existe = false;
      try { existe = typeof window[r.global] !== 'undefined' && window[r.global] !== null; } catch (e) {}
      if (!existe) faltan.push({ global: r.global, archivo: r.archivo });
    }
    if (!faltan.length) return { ok: true, faltantes: [] };

    var lineas = [];
    for (var j = 0; j < faltan.length; j++) {
      var f = faltan[j], det = 'no cargó';
      for (var k = 0; k < fallos.length; k++) {
        var a = fallos[k].archivo;
        if (a && (a === f.archivo || a.slice(-f.archivo.length) === f.archivo)) {
          det = fallos[k].tipo === 'sintaxis' ? 'llegó dañado (' + fallos[k].detalle + ')' : 'no se pudo descargar';
        }
      }
      lineas.push({ archivo: f.archivo, detalle: det });
    }
    var n = faltan.length;
    banner((opts.modulo ? opts.modulo + ': ' : '') +
      (n === 1 ? 'no cargó 1 archivo' : 'no cargaron ' + n + ' archivos') +
      '. Lo que dependa de ' + (n === 1 ? 'él' : 'ellos') + ' no va a funcionar.',
      lineas, opts.build ? 'build ' + opts.build : '');
    try { console.error('[FTSDeps] faltan:', faltan, 'fallos de carga:', fallos); } catch (e) {}
    if (typeof opts.reportar === 'function') {
      try { opts.reportar({ modulo: opts.modulo, build: opts.build, faltantes: faltan, fallos: fallos }); } catch (e) {}
    }
    return { ok: false, faltantes: faltan.slice() };
  }

  // Texto corto para mensajes de error de un botón: "falta js/turnos.js" o ''.
  function explicar() {
    if (!faltan.length) return '';
    var a = [];
    for (var i = 0; i < faltan.length; i++) a.push(faltan[i].archivo);
    return 'No cargó ' + a.join(', ') + ' — recarga con Ctrl+Shift+R.';
  }

  window.FTSDeps = {
    verificar: verificar,
    banner: banner,
    explicar: explicar,
    faltantes: function () { return faltan.slice(); },
    fallosDeCarga: function () { return fallos.slice(); }
  };
})();
