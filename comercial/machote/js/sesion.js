/* ═══ Machote · la sesión no debe poder mentir ═══════════════════════════
 *
 * ── EL DEFECTO QUE ESTO ARREGLA ─────────────────────────────────────────
 * El 8-sep-2026 Esteban rotó `SUITE_JWT_SECRET`. A partir de ese momento el
 * navegador siguió mandando el token viejo —que vive en `localStorage` y NO
 * se borra con Ctrl+Shift+R—, el servidor lo rechazó con `FIRMA_INVALIDA`, y
 * la franja dijo **«No se pudo confirmar con el servidor»**.
 *
 * Ese mensaje es falso y además es el peor de los tres posibles:
 *   · «no se pudo confirmar» invita a esperar y volver a intentar,
 *   · lo que hacía falta era volver a entrar,
 *   · y el token muerto se quedaba ahí, así que reintentar no arreglaba nada.
 * Se resolvió a mano, borrando la llave desde la consola del navegador. Nadie
 * más del equipo va a saber hacer eso.
 *
 * ── LAS TRES COSAS QUE LA APLICACIÓN CONFUNDÍA ──────────────────────────
 *   SESIÓN  el servidor contestó, y dijo que tu credencial no vale.
 *           → borrar la llave y volver a entrar. Reintentar NUNCA sirve.
 *   RED     no hubo respuesta: sin internet, servidor caído, tiempo agotado.
 *           → esperar y reintentar. Lo capturado sigue aquí.
 *   SERVER  contestó, pero con un error suyo (base caída, consulta rota).
 *           → no es culpa de quien captura y volver a entrar no lo arregla.
 * Las tres decían lo mismo y llevan a acciones distintas.
 *
 * ── LA REGLA DURA ───────────────────────────────────────────────────────
 * Al caducar se borra **SÓLO** la llave de sesión. NUNCA `fts_machote_v1`
 * (los machotes capturados) ni `fts_machote_sync_v1` (qué subió y qué no).
 * Ahí dentro hay captura real de tres personas, y una sesión vencida no es
 * motivo para perder trabajo. Está afirmado con una comprobación explícita
 * abajo, no sólo con cuidado al escribir.
 */
(function (G) {
  'use strict';

  /* Llaves que esta pieza NO puede tocar jamás. Se declaran para poder
   * comprobarlo en tiempo de ejecución y en las pruebas. */
  var INTOCABLES = ['fts_machote_v1', 'fts_machote_sync_v1'];

  /* Errores que significan «tu credencial no vale», y sólo esos.
   *
   * `SIN_SESION` NO está en la lista a propósito: significa que aquí no hay
   * llave que borrar. Meterlo provocaría un rebote al login en cuanto alguien
   * abriera la pantalla sin haber entrado, y de eso ya se encarga el gate de
   * `index.html`. */
  var DE_SESION = {
    TOKEN_EXPIRADO: 1, TOKEN_MALFORMADO: 1, TOKEN_AUSENTE: 1,
    FIRMA_INVALIDA: 1, PAYLOAD_ILEGIBLE: 1, TOKEN_SIN_SUJETO: 1,
    SCOPE_INSUFICIENTE: 1, FALLO_VERIFICACION: 1
  };

  /* Errores que significan «no hubo respuesta». Los produce el propio cliente
   * cuando el `fetch` no llegó a ningún lado. */
  var DE_RED = { SIN_RED: 1, RESPUESTA_VACIA: 1, RESPUESTA_ILEGIBLE: 1, RESPUESTA_INVALIDA: 1 };

  var _caducada = false;

  /** En cuál de los tres mundos cae esta respuesta.
   *  Devuelve 'ok' | 'sesion' | 'red' | 'servidor'. */
  function clasificar(r) {
    if (!r) return 'red';
    if (r.ok === true) return 'ok';
    var e = r.error;
    if (e && DE_SESION[e]) return 'sesion';
    if (e && DE_RED[e]) return 'red';
    /* `SIN_SESION` es un caso propio: no hay con qué preguntar. Se trata como
     * de sesión para el TEXTO —hay que entrar— pero no dispara el borrado,
     * porque no hay nada que borrar. */
    if (e === 'SIN_SESION') return 'sesion';
    return 'servidor';
  }

  function esDeSesion(r) { return !!(r && r.ok !== true && DE_SESION[r.error]); }

  /** La frase corta que va en pantalla, según el mundo. Una por caso, y cada
   *  una nombra la acción que sí sirve. */
  function motivo(r) {
    var c = clasificar(r);
    if (c === 'sesion') {
      return (r && r.error === 'SCOPE_INSUFICIENTE')
        ? 'Tu usuario no tiene acceso al módulo comercial.'
        : 'Tu sesión expiró. Vuelve a entrar.';
    }
    if (c === 'red') return 'Sin conexión con el servidor. Lo capturado sigue en este navegador.';
    if (c === 'servidor') return 'El servidor contestó con un error. No es tu sesión: vuelve a intentar en un rato.';
    return '';
  }

  function _quitarSoloLaSesion() {
    var S = G.SuiteAuth;
    var llave = (S && S.LLAVE_SESION) || 'fts_suite_session';

    /* Cinturón: si algún día alguien renombra la llave de sesión y la deja
     * coincidiendo con una de las de datos, esto NO borra nada y lo dice.
     * Es barato y cubre el único error que no tendría vuelta atrás. */
    if (INTOCABLES.indexOf(llave) >= 0) {
      try { console.error('[sesion] la llave de sesión coincide con una de datos: no se borra nada'); } catch (e) {}
      return false;
    }
    try {
      if (S && S.logout) S.logout(); else localStorage.removeItem(llave);
    } catch (e) {}
    return true;
  }

  /** El aviso. Tapa la pantalla porque no hay nada útil que hacer detrás: sin
   *  sesión válida no se guarda en el servidor, y seguir capturando creyendo
   *  que sí es el anti-patrón del kiosko (CLAUDE.md hallazgo #15).
   *
   *  Lo capturado NO se pierde: sigue en este navegador y vuelve a aparecer al
   *  entrar de nuevo. Eso se dice en el aviso, porque si no se dice, la gente
   *  supone lo contrario. */
  function _avisar(texto) {
    if (document.getElementById('sesionMuerta')) return;
    var d = document.createElement('div');
    d.id = 'sesionMuerta';
    d.className = 'sesion-muerta';
    d.setAttribute('role', 'alertdialog');
    d.innerHTML =
      '<div class="sm-caja">' +
        '<strong class="sm-t">' + String(texto || 'Tu sesión expiró.') + '</strong>' +
        '<p class="sm-p">Lo que capturaste <strong>no se perdió</strong>: sigue guardado en este ' +
        'navegador y vuelve a aparecer en cuanto entres.</p>' +
        '<button class="btn" id="smEntrar" type="button">Volver a entrar</button>' +
      '</div>';
    document.body.appendChild(d);
    var b = document.getElementById('smEntrar');
    if (b) b.onclick = irAlLogin;
  }

  function irAlLogin() {
    try { location.href = '../login.html'; } catch (e) {}
  }

  /** Caduca la sesión: borra SÓLO la llave, avisa y manda al login.
   *  Idempotente — si ya se disparó, no vuelve a hacer nada. */
  function caducar(r) {
    if (_caducada) return true;
    _caducada = true;
    _quitarSoloLaSesion();
    _avisar(motivo(r) || 'Tu sesión expiró. Vuelve a entrar.');
    /* Un respiro para leer el aviso antes de saltar. Sin él, la pantalla
     * cambia de golpe y nadie alcanza a saber por qué. */
    try { setTimeout(irAlLogin, 4000); } catch (e) {}
    return true;
  }

  /** Se le pasa TODA respuesta del servidor. Si dice que la credencial no
   *  vale, caduca; en cualquier otro caso devuelve la respuesta tal cual.
   *
   *  Que viva en un solo lugar es lo que evita que un endpoint nuevo se
   *  olvide de manejarlo: `almacen.js` y `cotizacion.js` lo llaman desde su
   *  única función de POST. */
  function vigilar(r) {
    if (esDeSesion(r)) caducar(r);
    return r;
  }

  G.MachoteSesion = {
    clasificar: clasificar,
    esDeSesion: esDeSesion,
    motivo: motivo,
    caducar: caducar,
    vigilar: vigilar,
    caducada: function () { return _caducada; },
    LLAVES_INTOCABLES: INTOCABLES,
    _reset: function () { _caducada = false; var d = document.getElementById('sesionMuerta'); if (d) d.remove(); }
  };
})(window);
