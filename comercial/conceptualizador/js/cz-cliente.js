/* ═══ Conceptualizador · cliente del webhook conceptualizador/suite ═══
 *
 * Cada pedido lleva el token de SuiteAuth en el CUERPO (patrón de la suite:
 * un header Authorization fuerza preflight CORS), más ts + nonce + firma.
 *
 * La firma es HMAC-SHA256 con el PROPIO token como llave sobre una cadena
 * canónica. No es un secreto nuevo en el navegador —este repo es público y
 * un secreto aquí sería decoración—: amarra el pedido a su token, a su
 * momento y a su nonce. La protección real la da el servidor: firma del JWT,
 * ventana de 5 min y nonce único guardado en Postgres (anti-replay).
 * Misma cadena que n8n/codigo/suite-verificar.js en fts-conceptualizador.
 */
(function (G) {
  'use strict';
  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var RUTA = '/webhook/conceptualizador/suite';
  var TIMEOUT_MS = 20000;
  var ERR_SESION = ['TOKEN_EXPIRADO', 'TOKEN_MALFORMADO', 'TOKEN_AUSENTE', 'PAYLOAD_ILEGIBLE',
                    'SCOPE_INSUFICIENTE', 'TOKEN_SIN_SUJETO', 'SIN_SESION'];

  function base() {
    var u = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(u).replace(/\/$/, '');
  }
  function b64url(buf) {
    var s = '', b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function nonce() { var a = new Uint8Array(16); crypto.getRandomValues(a); return b64url(a.buffer); }
  async function firmar(token, canon) {
    var enc = new TextEncoder();
    var k = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(canon)));
  }

  /** Clasifica en un solo lugar (fts-suite CLAUDE.md §20 #12b):
   *  sesion → volver a entrar · red → esperar · servidor → avisar. */
  function clase(r) {
    if (!r || r.ok) return null;
    if (ERR_SESION.indexOf(r.error) >= 0) return 'sesion';
    if (r.error === 'SIN_RED') return 'red';
    return 'servidor';
  }

  async function pedir(modo, campos) {
    var S = G.SuiteAuth, token = S && S.getToken();
    if (!token) return { ok: false, error: 'SIN_SESION', clase: 'sesion' };
    var c = Object.assign({ token: token, modo: modo, ts: Date.now(), nonce: nonce() }, campos || {});
    var canon = [c.ts, c.nonce, modo, c.caso_id || '', c.texto || '', c.tipo || '', c.concepto || '', c.razon || ''].join('\n');
    try { c.firma = await firmar(token, canon); }
    catch (e) { return { ok: false, error: 'SIN_CRIPTO', clase: 'servidor', mensaje: 'Este navegador no puede firmar el pedido.' }; }
    var ctl = new AbortController(), reloj = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS), r;
    try {
      var res = await fetch(base() + RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c), signal: ctl.signal });
      try { r = await res.json(); }
      catch (e) { r = { ok: false, error: 'RESPUESTA_INVALIDA', mensaje: 'El servidor respondió algo que no se entiende (HTTP ' + res.status + ').' }; }
      if (r && r.code === 404 && r.ok === undefined) r = { ok: false, error: 'NO_PUBLICADO', mensaje: 'El servicio del conceptualizador todavía no está encendido en n8n.' };
    } catch (e) {
      r = { ok: false, error: 'SIN_RED', mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' };
    } finally { clearTimeout(reloj); }
    r = r || { ok: false, error: 'RESPUESTA_VACIA' };
    r.clase = clase(r);
    if (r.clase === 'sesion') {
      // Se borra SOLO la llave de sesión y se manda al login.
      try { S.logout(); sessionStorage.setItem('fts_suite_destino', location.href); } catch (e) {}
      location.replace('../../shared/login.html' + (r.error === 'SCOPE_INSUFICIENTE' ? '?falta=conceptualizador:usar' : ''));
    }
    return r;
  }

  G.CzCliente = {
    enviar: function (campos) { return pedir('enviar', campos); },
    evento: function (campos) { return pedir('evento', campos); },
    hilo: function (casoId) { return pedir('hilo', { caso_id: casoId }); },
    casos: function () { return pedir('casos'); },
    aprendio: function () { return pedir('aprendio'); },
    estado: function () { return pedir('estado'); },
    _canonica: function (c) { return [c.ts, c.nonce, c.modo, c.caso_id || '', c.texto || '', c.tipo || '', c.concepto || '', c.razon || ''].join('\n'); }
  };
})(window);
