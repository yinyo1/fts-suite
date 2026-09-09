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
  /* Arranca en `true`: los que faltan se marcan solos en cuanto se sabe cuáles
   * son. Antes había que apretar «Cuáles faltan» para verlos, y eso es pedirle
   * a alguien que pregunte por un problema que ya existe. El botón se queda
   * para poder QUITAR la marca cuando estorba. */
  var _resaltando = true;
  var _evidencia = false;    // ¿está desplegada la tabla de comprobación?

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
      /* TRES casos, no uno. Decían todos «no se pudo confirmar», que invita a
       * esperar y reintentar — y con la sesión vencida reintentar no arregla
       * nada, porque el token muerto sigue ahí. Es el defecto que se vio al
       * rotar el secreto el 8-sep. La clasificación vive en `sesion.js`. */
      var S = G.MachoteSesion;
      var caso = S ? S.clasificar(e) : (e.error === 'SIN_SESION' ? 'sesion' : 'servidor');
      if (caso === 'sesion') {
        return (S ? S.motivo(e) : 'Tu sesión expiró. Vuelve a entrar.') +
               ' Lo capturado sigue aquí.';
      }
      if (caso === 'red') {
        return e.total
          ? 'Sin conexión con el servidor. ' + e.total +
            ' machote(s) siguen guardados en este navegador.'
          : 'Sin conexión con el servidor. En pantalla sólo hay ejemplos, que no suben nunca.';
      }
      return 'El servidor contestó con un error (' + esc(e.error || 'desconocido') + '). ' +
             'No es tu sesión; vuelve a intentar en un rato.';
    }
    /* «0 machotes» a secas confunde cuando la pantalla enseña cuatro: los que
     * se ven son los ejemplos que trae la aplicación, y ésos no suben nunca.
     * Decir el motivo evita que alguien reporte como fallo lo que es diseño. */
    if (e.total === 0) {
      return e.demos ? 'Sólo hay ejemplos en pantalla: no hay nada que subir.'
                     : 'No hay machotes que subir.';
    }
    if (e.pendientes === 0) {
      /* «TUYAS» no es adorno. Desde V1.22 la lista de dirección enseña también
       * el trabajo del equipo, así que «2 de 2 a salvo» al lado de siete
       * renglones se lee como un fallo de la aplicación. La franja SÓLO habla
       * de lo propio —lo ajeno no le toca subirlo a nadie más— y tiene que
       * decirlo. Lo cazó la captura, no el diff (CLAUDE.md §20 #12), igual que
       * el «4 cotizaciones» al lado de «Exportar todo (1)» de V1.22. */
      return e.total === 1 ? '1 de 1 tuya a salvo en el servidor'
                           : e.total + ' de ' + e.total + ' tuyas a salvo en el servidor';
    }
    if (e.subidos === 0) return '0 de ' + e.total + ' subidos';
    return e.pendientes + ' por subir · ' + e.subidos + ' de ' + e.total + ' a salvo';
  }

  function tono(e) {
    if (!e) return 'cargando';
    if (!e.ok) {
      /* La sesión vencida se pinta como ALGO QUE HACER (ámbar), no como duda
       * gris: hay una acción concreta y es del usuario. La falta de red y el
       * error del servidor sí son duda: no hay nada que hacer más que esperar. */
      var S = G.MachoteSesion;
      return (S && S.clasificar(e) === 'sesion') ? 'pend' : 'duda';
    }
    if (e.total === 0 || e.pendientes === 0) return 'ok';
    return 'pend';
  }

  /* ── La comprobación ──────────────────────────────────────────────────
   * Renglón por renglón: qué versión tiene el servidor de cada machote y las
   * DOS huellas del mismo documento calculadas por separado —una sobre lo de
   * aquí, otra sobre lo que devolvió el servidor—. Si coinciden, los dos
   * documentos son idénticos carácter por carácter; no es una marca que
   * alguien puso, es una comparación que se puede repetir.
   *
   * Esto es lo que pidió Esteban: «que se pueda comprobar de verdad que están
   * sincronizados, no sólo leer un número». */
  function pintarEvidencia() {
    var host = document.getElementById('franjaEvi');
    if (!host) return;
    if (!_evidencia) { host.innerHTML = ''; return; }

    var e = _ultimo;
    if (_cargando || !e) {
      host.innerHTML = '<div class="evi"><div class="pie tiny">Preguntando al servidor…</div></div>';
      return;
    }
    /* Sin respuesta no se puede comprobar nada. El PORQUÉ ya está escrito en la
     * franja, un renglón más arriba: repetirlo aquí era la misma frase dos
     * veces seguidas. Lo que sí falta —y sólo se puede decir aquí— es QUÉ va a
     * enseñar este panel cuando el servidor conteste; si no, quien lo abre en
     * mal momento se queda sin saber para qué sirve el botón. */
    if (!e.ok) {
      host.innerHTML = '<div class="evi"><div class="pie tiny">' +
        'No se puede comprobar mientras el servidor no conteste. Cuando conteste, ' +
        'aquí sale renglón por renglón qué versión tiene de cada cotización y si ' +
        'coincide letra por letra con la de este navegador.</div></div>';
      return;
    }
    var filas = (e.detalle || []).map(function (d) {
      var alla = d.estado === 'nunca'
        ? '<span style="color:var(--ambar)">no ha llegado</span>'
        : esc(String(d.huella_servidor || '').slice(0, 8)) + ' · v' + esc(d.version);
      var cuando = d.confirmado_at ? esc(String(d.confirmado_at).replace('T', ' ').slice(0, 16)) : '—';
      var mismo = d.estado === 'igual';
      return '<tr><td>' + esc(String(d.nombre || d.id).slice(0, 48)) +
        (String(d.nombre || '').length > 48 ? '…' : '') +
        (mismo ? '' : ' <span style="color:var(--ambar)">·</span>') + '</td>' +
        '<td class="hu mono">' + esc(String(d.huella_aqui || '').slice(0, 8)) + '</td>' +
        '<td class="hu mono">' + alla + '</td>' +
        '<td class="hu">' + cuando + '</td></tr>';
    }).join('');

    var demos = e.demos
      ? ' No se cuentan ' + e.demos + ' ejemplo(s) que trae la aplicación: ésos no suben nunca.'
      : '';

    host.innerHTML = '<div class="evi">' +
      (filas
        ? '<table><thead><tr><th>Cotización</th><th>Aquí</th><th>En el servidor</th>' +
          '<th>Guardada</th></tr></thead><tbody>' + filas + '</tbody></table>'
        : '') +
      '<div class="pie tiny nota">Las dos huellas son del <strong>mismo documento</strong> ' +
      'calculadas por separado —una sobre lo de este navegador y otra sobre lo que acaba de ' +
      'devolver el servidor—: si coinciden, son idénticos carácter por carácter.' + esc(demos) +
      '</div></div>';
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
          : '') +
        /* «Comprobar» está SIEMPRE, falten machotes o no. Justo cuando la
         * franja dice que todo está a salvo es cuando hace falta poder
         * verificarlo: un número en verde pide fe, y de poder enseñar la
         * evidencia depende quitar esta franja en la versión que viene. */
        '<button class="btn fantasma f-min" id="fjComprobar">' +
          (_evidencia ? 'Ocultar' : 'Comprobar') + '</button>' +
      '</span>';

    if (hayPend) {
      var bm = document.getElementById('fjMarcar');
      if (bm) bm.onclick = function () { _resaltando = !_resaltando; aplicarMarca(); pintar(); };
      var bs = document.getElementById('fjSubir');
      if (bs) bs.onclick = subirAhora;
    }
    var bc = document.getElementById('fjComprobar');
    if (bc) bc.onclick = function () {
      _evidencia = !_evidencia;
      if (_evidencia) refrescar(true); else { pintarEvidencia(); pintar(); }
    };

    pintarEvidencia();
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
