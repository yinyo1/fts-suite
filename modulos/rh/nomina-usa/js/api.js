/* ═══ RH · Nómina USA · cliente del webhook nomina-usa/panel (#448) ═══
 *
 * Misma forma que modulos/rh/retardos/js/api.js, a propósito:
 *   real → POST firmado: token del Suite + HMAC con ese token + nonce (retardos/lib/sesion.js,
 *          la MISMA librería que verifica del lado del servidor).
 *   demo → handlers en memoria (js/demo.js) con datos de ejemplo y los de octubre.
 *          Nunca toca el servidor.
 * Las respuestas se clasifican en UN solo lugar (CLAUDE.md §20 #12b): sesion · red · servidor.
 */
(function (G) {
  'use strict';
  var URL_PANEL = 'https://primary-production-5c3c.up.railway.app/webhook/nomina-usa/panel';
  var ERR_SESION = { TOKEN_AUSENTE: 1, TOKEN_MALFORMADO: 1, FIRMA_INVALIDA: 1, PAYLOAD_ILEGIBLE: 1, TOKEN_EXPIRADO: 1, HMAC_INVALIDO: 1 };
  var handlers = {};

  function nonce() {
    var A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', o = '', r = new Uint8Array(24);
    try { crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 24; k++) r[k] = Math.floor(Math.random() * 256); }
    for (var i = 0; i < r.length; i++) o += A.charAt(r[i] % A.length);
    return o;
  }

  async function llamarReal(datos) {
    var token = G.SuiteAuth && G.SuiteAuth.getToken ? G.SuiteAuth.getToken() : null;
    if (!token) return { ok: false, tipo: 'sesion', error: 'TOKEN_AUSENTE' };
    var ts = Date.now(), n = nonce();
    var cuerpo = { token: token, ts: ts, nonce: n, sig: G.RetardosSesion.firmar(token, ts, n, datos), datos: datos };
    var res, j;
    try {
      res = await fetch(URL_PANEL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    } catch (e) { return { ok: false, tipo: 'red', error: 'SIN_RED' }; }
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, tipo: 'servidor', error: 'HTTP_' + res.status };
    if (j.ok === false && ERR_SESION[j.error]) {
      if (G.SuiteAuth && G.SuiteAuth.logout) G.SuiteAuth.logout();
      return Object.assign({ tipo: 'sesion' }, j);
    }
    if (j.ok === false) return Object.assign({ tipo: 'servidor' }, j);
    return j;
  }

  async function llamarDemo(datos) {
    var h = handlers[datos && datos.accion];
    if (!h) return { ok: false, tipo: 'servidor', error: 'ACCION_DESCONOCIDA' };
    try {
      var r = h(JSON.parse(JSON.stringify(datos)), api.demoActor);
      return r && r.ok === false ? Object.assign({ tipo: 'servidor' }, r) : r;
    } catch (e) { return { ok: false, tipo: 'servidor', error: (e && e.message) || 'FALLO_DEMO' }; }
  }

  var api = {
    modo: 'real',
    demoActor: { actor: 'demo', scopes: ['nomina_usa:admin'] },
    registrar: function (accion, fn) { handlers[accion] = fn; },
    llamar: function (datos) { return api.modo === 'demo' ? llamarDemo(datos) : llamarReal(datos); }
  };
  G.NusaApi = api;
})(window);
