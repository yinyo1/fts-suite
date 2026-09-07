/* ═══ Machote · la franja de sincronización ═══
 *
 * ⚠️ PIEZA TRANSITORIA. Existe sólo mientras dura el cambio de "los machotes
 * viven en este navegador" a "los machotes viven en el servidor". Cuando todo
 * el mundo lleve semanas capturando contra Postgres, esta franja deja de
 * decir algo útil y estorba.
 *
 * ── CÓMO SE QUITA (para que no haya que averiguarlo) ─────────────────────
 *   1. Borrar este archivo y su `<script>` de `comercial/machote/index.html`.
 *   2. Borrar el bloque `.franja*` de `css/machote.css` (está junto, marcado).
 *   3. En `app.js`, quitar las dos llamadas a `G.MachoteFranja` de `vHome()`
 *      y del arranque. Son las únicas; no hay más enganches.
 *   4. En `almacen.js` se puede quedar `estadoServidor()`: la usa también la
 *      vista de control, y es barata.
 *   5. Quitar las pruebas del bloque "franja de sincronización".
 * Nada más depende de esto. Se buscó a propósito que fuera así.
 *
 * ── POR QUÉ EL ESTADO SE PREGUNTA AL SERVIDOR ────────────────────────────
 * Una marca local diría "todo subido" y se borraría junto con los datos del
 * sitio — que es exactamente el accidente contra el que existe todo esto. La
 * franja pregunta al servidor qué tiene y lo compara contra lo que hay aquí.
 * Si no se puede preguntar, lo DICE; no adivina hacia el lado optimista.
 */
(function (G) {
  'use strict';

  var CAJA = 'franjaSync';
  var _ultimo = null;      // último estado leído del servidor
  var _cargando = false;
  var _resaltando = false;

  function $(s) { return document.querySelector(s); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* El texto de la izquierda. En lenguaje llano y sin jerga: quien captura no
   * tiene por qué saber qué es sincronizar, sólo si su trabajo está a salvo. */
  function frase(e) {
    if (!e) return 'Consultando el servidor…';
    if (!e.ok) {
      if (e.error === 'SIN_SESION') return 'Sin sesión: no se puede confirmar qué hay en el servidor.';
      return 'No se pudo confirmar con el servidor. ' + e.total +
             ' machote(s) siguen guardados en este navegador.';
    }
    if (e.total === 0) return 'No hay machotes que subir.';
    if (e.pendientes === 0) {
      return e.total === 1 ? '1 de 1 a salvo en el servidor'
                           : e.total + ' de ' + e.total + ' a salvo en el servidor';
    }
    if (e.subidos === 0) return '0 de ' + e.total + ' subidos';
    return e.pendientes + ' por subir · ' + e.subidos + ' de ' + e.total + ' a salvo';
  }

  function tono(e) {
    if (!e) return 'cargando';
    if (!e.ok) return 'duda';
    if (e.total === 0 || e.pendientes === 0) return 'ok';
    return 'pend';
  }

  function pintar() {
    var caja = document.getElementById(CAJA);
    if (!caja) return;
    var e = _ultimo;
    var t = _cargando ? 'cargando' : tono(e);
    var hayPend = !!(e && e.pendientes);

    caja.className = 'franja f-' + t;
    caja.innerHTML =
      '<span class="f-punto" aria-hidden="true"></span>' +
      '<span class="f-txt">' + esc(_cargando ? 'Consultando el servidor…' : frase(e)) + '</span>' +
      '<span class="f-bs">' +
        (hayPend
          ? '<button class="btn fantasma f-min" id="fjMarcar">' +
              (_resaltando ? 'Quitar marca' : 'Cuáles faltan') + '</button>' +
            '<button class="btn f-min" id="fjSubir">Subir ahora</button>'
          : '<button class="btn fantasma f-min" id="fjRevisar">Revisar</button>') +
      '</span>';

    if (hayPend) {
      var bm = document.getElementById('fjMarcar');
      if (bm) bm.onclick = function () { _resaltando = !_resaltando; aplicarMarca(); pintar(); };
      var bs = document.getElementById('fjSubir');
      if (bs) bs.onclick = subirAhora;
    } else {
      var br = document.getElementById('fjRevisar');
      if (br) br.onclick = function () { refrescar(true); };
    }

    aplicarMarca();
  }

  /* Marcar DENTRO de la lista que ya está en pantalla, sin cambiar de vista:
   * quien pregunta "¿cuáles faltan?" quiere verlos entre los suyos, no en
   * otra pantalla que lo obligue a comparar de memoria. */
  function aplicarMarca() {
    var filas = document.querySelectorAll('[data-mid]');
    var pend = {}, i;
    if (_resaltando && _ultimo && _ultimo.ids_pendientes) {
      for (i = 0; i < _ultimo.ids_pendientes.length; i++) pend[_ultimo.ids_pendientes[i]] = true;
    }
    for (i = 0; i < filas.length; i++) {
      var id = filas[i].getAttribute('data-mid');
      if (pend[id]) filas[i].classList.add('solo-aqui');
      else filas[i].classList.remove('solo-aqui');
    }
  }

  function refrescar(forzar) {
    var A = G.MachoteAlmacen;
    if (!A || !A.estadoServidor) return Promise.resolve(null);
    if (_cargando && !forzar) return Promise.resolve(_ultimo);
    _cargando = true; pintar();
    return A.estadoServidor(G.MachoteFranja._machotes()).then(function (e) {
      _ultimo = e; _cargando = false; pintar();
      return e;
    });
  }

  function subirAhora() {
    var A = G.MachoteAlmacen;
    var b = document.getElementById('fjSubir');
    if (b) { b.disabled = true; b.textContent = 'Subiendo…'; }

    /* Subir dos veces NO duplica: el servidor reconcilia por `id_local` —crea
     * la identidad la primera vez y después sólo agrega una versión— así que
     * darle dos veces al botón, o darle desde dos navegadores, converge en el
     * mismo machote. Lo que sí puede pasar es un choque de versión, y ése se
     * dice con todas sus letras en vez de resolverse solo. */
    return A.empujar(G.MachoteFranja._machotes()).then(function (r) {
      return refrescar(true).then(function () {
        if (r && r.fallos && r.fallos.length) {
          var f = r.fallos[0];
          avisar(f.error === 'CONFLICTO_DE_VERSION'
            ? 'Otra persona guardó "' + (f.nombre || 'un machote') + '" mientras tanto. ' +
              'Lo tuyo NO se perdió: vuelve a abrirlo antes de seguir.'
            : (f.mensaje || 'No se pudieron subir todos.'));
        } else if (r && r.subidos) {
          avisar(r.subidos === 1 ? 'Subió 1 machote.' : 'Subieron ' + r.subidos + ' machotes.');
        }
      });
    });
  }

  function avisar(txt) {
    if (G.MachoteFranja._toast) { G.MachoteFranja._toast(txt); return; }
    var caja = document.getElementById(CAJA);
    if (caja) caja.setAttribute('title', txt);
  }

  /** Se llama al pintar la lista. Inserta la franja y pide el estado. */
  function montar(machotes, toast) {
    G.MachoteFranja._machotes = function () { return machotes; };
    if (toast) G.MachoteFranja._toast = toast;
    var anfitrion = document.getElementById('franjaHost');
    if (!anfitrion) return;
    if (!document.getElementById(CAJA)) {
      anfitrion.innerHTML = '<div class="franja f-cargando" id="' + CAJA + '" role="status"></div>';
    }
    pintar();
    // Sólo se pregunta al servidor una vez por carga: repintar la lista al
    // teclear en el buscador no debe disparar una consulta por letra.
    if (_ultimo === null && !_cargando) refrescar(false);
  }

  G.MachoteFranja = {
    montar: montar,
    refrescar: refrescar,
    estado: function () { return _ultimo; },
    _machotes: function () { return []; },
    _toast: null
  };
})(window);
