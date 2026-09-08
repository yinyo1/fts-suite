/* ═══ Machote · el PDF de la orden, traído de Odoo ═══════════════════════
 *
 * Habla con el webhook `comercial/cotizacion`. Dos modos, un endpoint:
 *   · 'pdf'    → devuelve el documento que Odoo le genera al cliente.
 *   · 'enviar' → lo manda por correo con ese mismo PDF adjunto.
 *
 * ── POR QUÉ EL PDF LO TRAE EL SERVIDOR Y NO EL NAVEGADOR ────────────────
 * Odoo publica el PDF de una orden en un enlace de portal que lleva un
 * `access_token`. Ese token es una LLAVE DE CAPACIDAD: quien lo tenga ve la
 * orden completa sin necesidad de entrar a Odoo. Si el navegador armara el
 * enlace, la llave quedaría en el historial, en el portapapeles y en
 * cualquier captura de pantalla. Por eso el servidor baja los bytes y
 * devuelve los bytes; aquí nunca se ve el token.
 *
 * ── EL CAMPO QUE LIGA LAS DOS COSAS ─────────────────────────────────────
 * `comercial.machote.odoo_so_id` (migración 003). Es una referencia externa
 * SIN llave foránea, a propósito: el día que un dominio salga de Odoo, el
 * machote no queda apuntando a un id que dejó de existir.
 * Vacío significa que la cotización todavía no se volvió orden en Odoo, y
 * ese es el estado NORMAL de un machote recién capturado. La pantalla tiene
 * que DECIRLO, no fallar: el servidor contesta `SIN_ORDEN` con su frase, y
 * aquí se pinta tal cual.
 */
(function (G) {
  'use strict';

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_COTIZACION = BASE + '/comercial/cotizacion';
  /* Más generoso que los otros endpoints (12 s): esta llamada entra a Odoo,
   * le pide renderizar un PDF y se lo trae. En la prueba tardó ~6 s; un
   * documento largo o un Odoo ocupado tardan más, y cortar a los 12 s
   * convertiría una lentitud normal en un error. */
  var TIMEOUT_MS = 45000;

  function postear(cuerpo) {
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var corta = null;
    var opciones = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El token va en el CUERPO, no en Authorization: el header dispara un
      // preflight CORS que el webhook de n8n no contesta (CLAUDE.md §15 #5).
      body: JSON.stringify(cuerpo)
    };
    if (ctrl) opciones.signal = ctrl.signal;
    if (ctrl) corta = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);

    return fetch(URL_COTIZACION, opciones)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (corta) clearTimeout(corta);
        if (!d || typeof d !== 'object') {
          return { ok: false, error: 'RESPUESTA_ILEGIBLE',
            mensaje: 'El servidor contestó algo que no se entiende.' };
        }
        return d;
      })
      .catch(function (e) {
        if (corta) clearTimeout(corta);
        /* Se resuelve, no se rechaza: quien llama decide cómo degradar, y
         * ninguna pantalla del machote debe romperse porque el servidor no
         * contestó. Lo capturado sigue en el navegador. */
        return { ok: false, error: 'SIN_RED',
          mensaje: 'No se pudo hablar con el servidor: ' +
                   String((e && e.message) || e).slice(0, 90) };
      });
  }

  /* Traduce el «de qué cotización» a lo que el servidor entiende, y ataja
   * antes de gastar una llamada los dos casos que ya se saben aquí. */
  function referencia(m) {
    var S = G.SuiteAuth;
    var token = S && S.getToken && S.getToken();
    if (!token) {
      return { error: 'SIN_SESION',
        mensaje: 'No hay sesión. Vuelve a entrar para traer el documento.' };
    }
    var A = G.MachoteAlmacen;
    var idServidor = (A && A.idServidor) ? A.idServidor(m && m.id) : null;
    if (!idServidor) {
      return { error: 'NUNCA_SUBIDO',
        mensaje: 'Este machote todavía no llega al servidor, así que el servidor ' +
                 'no sabe de qué cotización le estás hablando. Súbelo primero.' };
    }
    return { token: token, machote_id: idServidor };
  }

  /** Trae el PDF. Resuelve SIEMPRE con `{ok:true, archivo, orden}` o
   *  `{ok:false, error, mensaje}`. `SIN_ORDEN` no es una falla del sistema:
   *  es la respuesta correcta a un machote que todavía no es orden. */
  function pdf(m) {
    var ref = referencia(m);
    if (ref.error) return Promise.resolve({ ok: false, error: ref.error, mensaje: ref.mensaje });
    return postear({ token: ref.token, modo: 'pdf', machote_id: ref.machote_id });
  }

  /** Manda la cotización. `para`, `asunto` y `cuerpo` los edita el vendedor.
   *  ⚠ El servidor tiene un candado: mientras esté en modo prueba sólo acepta
   *  sales@fts.mx y contesta `DESTINO_NO_PERMITIDO` a cualquier otro. */
  function enviar(m, para, asunto, cuerpo) {
    var ref = referencia(m);
    if (ref.error) return Promise.resolve({ ok: false, error: ref.error, mensaje: ref.mensaje });
    return postear({ token: ref.token, modo: 'enviar', machote_id: ref.machote_id,
      para: para || '', asunto: asunto || '', cuerpo: cuerpo || '' });
  }

  /** Convierte el base64 que llegó en un archivo y lo baja.
   *
   *  Devuelve true/false en vez de no devolver nada: quien llama tiene que
   *  poder decir «no se pudo bajar» en la pantalla. Que el servidor haya
   *  contestado bien no significa que el navegador haya podido guardar el
   *  archivo — es la misma regla de siempre, sólo que un paso más adelante. */
  function bajar(archivo) {
    if (!archivo || typeof archivo.base64 !== 'string') return false;
    try {
      var bin = atob(archivo.base64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = archivo.nombre || 'cotizacion.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Se suelta después: revocar de inmediato cancela la descarga en algunos
      // navegadores, que todavía no han leído el blob cuando vuelve el click.
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return true;
    } catch (e) {
      return false;
    }
  }

  G.MachoteCotizacion = {
    pdf: pdf,
    enviar: enviar,
    bajar: bajar,
    _url: URL_COTIZACION
  };
})(window);
