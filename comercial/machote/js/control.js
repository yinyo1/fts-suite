/* ═══ Machote · vista de control (sólo lectura) ═══
 *
 * Lo que Esteban pidió (#140, noche del 7-sep): «cuántos machotes hay en el
 * servidor, de quién, y cuándo subió cada persona por última vez». Nada más.
 * No se abre ningún machote ajeno desde aquí, no se edita, no se borra: es un
 * TABLERO, no una bandeja de entrada. Por eso todo lo que se pinta son
 * conteos y fechas, y el documento de nadie viaja hasta este navegador.
 *
 * ── QUIÉN LA VE ──────────────────────────────────────────────────────────
 * Hace falta el scope `comercial:admin`, que HOY NO TIENE NADIE. La decisión
 * fue hacerlo en el orden seguro: primero existe la puerta, después se le da
 * la llave a quien toca. Mientras tanto la pantalla NO es un callejón — dice
 * exactamente qué falta y enseña, marcado como demostración, cómo se va a ver.
 *
 * Darle la llave a Esteban es UN campo en la base:
 *     UPDATE comercial.suite_usuario
 *        SET scopes = scopes || '{comercial:admin}'
 *      WHERE actor = '<el usuario de Esteban>';
 * (lo aplica quien tenga la credencial de escritura; no va en una migración
 *  porque es un permiso, no una estructura.)
 *
 * ── DE DÓNDE SALEN LOS NÚMEROS ───────────────────────────────────────────
 * Del webhook `comercial/machotes-control`, que agrega EN LA BASE (un
 * `group by`, no trae filas y cuenta aquí). El navegador no puede calcular
 * esto: sólo conoce sus propios machotes.
 */
(function (G) {
  'use strict';

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_CONTROL = BASE + '/comercial/machotes-control';
  var SCOPE = 'comercial:admin';
  var TIMEOUT_MS = 12000;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Una fecha en un tablero se lee para saber "¿hace cuánto?", no para
   * fecharla al segundo. Se pone lo uno y lo otro: el relativo manda y el
   * absoluto va al lado, chico, para quien necesite el dato exacto. */
  function haceCuanto(iso) {
    if (!iso) return { rel: 'nunca', abs: '', frio: true };
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { rel: '—', abs: '', frio: true };
    var min = Math.floor((Date.now() - d.getTime()) / 60000);
    var rel;
    if (min < 1) rel = 'hace un momento';
    else if (min < 60) rel = 'hace ' + min + ' min';
    else if (min < 60 * 24) rel = 'hace ' + Math.floor(min / 60) + ' h';
    else if (min < 60 * 24 * 30) rel = 'hace ' + Math.floor(min / 1440) + ' d';
    else rel = 'hace más de un mes';
    return {
      rel: rel,
      abs: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      frio: min > 60 * 24 * 7          // más de una semana sin subir nada
    };
  }

  function pedir(token) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var reloj = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(URL_CONTROL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),      // el token va en el CUERPO
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: 'RESPUESTA_INVALIDA',
                 mensaje: 'El servidor respondió algo que no se entiende.' };
      });
    }).catch(function () {
      return { ok: false, error: 'SIN_RED',
               mensaje: 'No se pudo contactar al servidor.' };
    }).then(function (d) { if (reloj) clearTimeout(reloj); return d || { ok: false }; });
  }

  /* Lo que se enseña cuando todavía no hay llave. Va marcado DEMOSTRACIÓN en
   * cada celda visible, no sólo en un rótulo arriba: un tablero con números
   * inventados que se confundan con reales es peor que no tener tablero. */
  var DEMO = {
    ok: true, demo: true,
    total_machotes: 0, total_versiones: 0, total_personas: 0,
    personas: []
  };

  /** La hora en que el servidor contestó, en palabras. Sale del `_meta` que
   *  manda el propio endpoint, no del reloj de este navegador: si mañana la
   *  respuesta se cachea en algún lado, la hora sigue siendo la buena. */
  function sello(d) {
    var iso = d && d._meta && d._meta.leido;
    if (!iso) return 'ahora';
    var c = haceCuanto(iso);
    return c.rel === 'nunca' ? 'ahora' : c.rel + (c.abs ? ' · ' + c.abs : '');
  }

  function tarjeta(n, etiqueta, nota) {
    return '<div class="ctrl-kpi"><div class="ctrl-kpi-n">' + esc(n) + '</div>' +
           '<div class="ctrl-kpi-e">' + esc(etiqueta) + '</div>' +
           (nota ? '<div class="ctrl-kpi-x tiny">' + esc(nota) + '</div>' : '') + '</div>';
  }

  function tabla(personas, demo) {
    if (!personas || !personas.length) {
      return '<div class="vacio">' + (demo
        ? 'Aquí va una fila por persona en cuanto haya llave y alguien haya subido algo.'
        : 'Nadie ha subido un machote al servidor todavía.') + '</div>';
    }
    var f = personas.map(function (p) {
      var c = haceCuanto(p.ultima_subida);
      return '<tr>' +
        '<td data-th="Persona"><strong>' + esc(p.nombre || p.actor || '—') + '</strong>' +
          (p.nombre && p.actor ? '<div class="tiny mono">' + esc(p.actor) + '</div>' : '') + '</td>' +
        '<td class="num" data-th="Machotes">' + esc(p.machotes) + '</td>' +
        '<td class="num" data-th="Versiones">' + esc(p.versiones) + '</td>' +
        '<td data-th="Última subida" class="' + (c.frio ? 'frio' : '') + '">' + esc(c.rel) +
          (c.abs ? '<div class="tiny mono">' + esc(c.abs) + '</div>' : '') + '</td>' +
      '</tr>';
    }).join('');
    /* Los `data-th` no son adorno: en teléfono la tabla se convierte en
     * tarjetas (CSS) y cada celda necesita decir de qué columna era. Cuatro
     * columnas en 380 px dejaban «ÚLTIMA VEZ QUE SUBIÓ» partido en cuatro
     * renglones y las fechas cortadas. Es el mismo remedio que ya usa la
     * lista de machotes desde V1.01. */
    return '<div class="tabla-wrap"><table class="ctrl-t">' +
      '<thead><tr><th>Persona</th><th class="num">Machotes</th>' +
      '<th class="num">Versiones</th><th>Última vez que subió</th></tr></thead>' +
      '<tbody>' + f + '</tbody></table></div>';
  }

  function pintar(host, r, opciones) {
    var demo = !!(r && r.demo);
    var sinLlave = !!(opciones && opciones.sinLlave);

    var cabeza = sinLlave
      ? '<div class="aviso">' +
        '<strong>Esta pantalla todavía no tiene llave.</strong> Hace falta el permiso ' +
        '<code>' + esc(SCOPE) + '</code>, que hoy no tiene nadie: se construyó primero la puerta ' +
        'y el permiso se da después, que es el orden seguro. Lo de abajo es una ' +
        '<strong>demostración</strong> de cómo se va a ver — los números no son reales.' +
        '</div>'
      : '';

    var err = (r && r.ok === false)
      ? '<div class="aviso bad">' + esc(r.mensaje || 'No se pudo leer el tablero.') +
        (r.error ? ' <span class="tiny mono">(' + esc(r.error) + ')</span>' : '') + '</div>'
      : '';

    /* Un fallo de lectura NO se pinta con ceros. Poner un «0» grande junto al
     * aviso rojo es peor que no poner nada: el ojo lee el número y descarta el
     * texto, y el dueño del tablero concluye que nadie está capturando cuando
     * lo que pasó es que no se pudo preguntar. Cuando no hay respuesta, no hay
     * tablero — hay el porqué. */
    if (r && r.ok === false && !sinLlave) {
      host.innerHTML =
        '<div class="pad">' + err +
        '<h3>Machotes en el servidor</h3>' +
        '<p class="tiny nota">No se pinta ningún número porque no se pudo leer ninguno. ' +
        'Enseñar ceros aquí se leería como «nadie ha subido nada», que es lo contrario ' +
        'de lo que se sabe.</p>' +
        '<div class="ctrl-pie"><span class="tiny nota">Sin lectura del servidor.</span>' +
        '<button class="btn fantasma f-min" id="ct-releer">Reintentar</button></div>' +
        '<p class="tiny nota"><a href="#/">‹ Volver a la lista</a></p></div>';
      var r0 = document.getElementById('ct-releer');
      if (r0) r0.onclick = function () { montar(host); };
      return;
    }

    var d = (r && r.ok) ? r : DEMO;

    host.innerHTML =
      '<div class="pad">' +
      cabeza + err +
      '<h3>Machotes en el servidor' + (demo ? ' <span class="chip demo">demostración</span>' : '') + '</h3>' +
      '<div class="ctrl-kpis">' +
        tarjeta(d.total_machotes, 'machotes guardados', 'no lo que hay en cada navegador') +
        tarjeta(d.total_versiones, 'versiones', 'cada guardado deja una') +
        tarjeta(d.total_personas, 'personas han subido', 'no es el tamaño del equipo') +
      '</div>' +
      tabla(d.personas, demo) +

      /* CUÁNDO se leyó. Un tablero sin hora se lee como si fuera de ahora, y
       * el día que el servidor no conteste seguiría enseñando los números de
       * hace horas sin que nadie lo note. Es la misma regla que ya gobierna
       * la franja: si no se puede confirmar, se dice. */
      '<div class="ctrl-pie">' +
        '<span class="tiny nota">' +
          (demo ? 'Números de demostración: no se leyó nada del servidor.'
                : 'Leído del servidor ' + esc(sello(d)) + '.') + '</span>' +
        (demo ? '' : '<button class="btn fantasma f-min" id="ct-releer">Volver a contar</button>') +
      '</div>' +

      '<p class="tiny nota">Sólo lectura. Desde aquí no se abre, ' +
      'no se edita y no se borra el machote de nadie: los números salen de un conteo en la ' +
      'base, el contenido no viaja hasta este navegador. ' +
      '<strong>Sólo aparece quien ya subió algo</strong>: quien no ha subido nunca no tiene ' +
      'última vez, y este endpoint no conoce la lista del equipo — eso se compara aparte.</p>' +
      '<p class="tiny nota"><a href="#/">‹ Volver a la lista</a></p>' +
      '</div>';

    var rel = document.getElementById('ct-releer');
    if (rel) rel.onclick = function () { montar(host); };
  }

  /** Pinta la vista dentro de `host`. Resuelve siempre. */
  function montar(host) {
    if (!host) return Promise.resolve(null);
    var S = G.SuiteAuth;
    var tiene = !!(S && S.tieneScope && S.tieneScope(SCOPE));
    var token = (S && S.getToken) ? S.getToken() : null;

    if (!tiene || !token) {
      pintar(host, DEMO, { sinLlave: true });
      return Promise.resolve({ ok: true, demo: true });
    }

    host.innerHTML = '<div class="pad"><div class="tiny nota">Contando en el servidor…</div></div>';
    return pedir(token).then(function (r) {
      /* Que el servidor diga que no —aunque el token traiga el scope— también
       * se muestra tal cual, con la demostración debajo: la pantalla nunca se
       * queda en blanco ni finge números. */
      if (r && r.ok === false && r.error === 'NO_AUTORIZADO') {
        pintar(host, DEMO, { sinLlave: true });
      } else {
        pintar(host, r, {});
      }
      return r;
    });
  }

  G.MachoteControl = { montar: montar, SCOPE: SCOPE, _haceCuanto: haceCuanto };
})(window);
