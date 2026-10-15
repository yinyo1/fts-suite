/* ═══ shared/chat · cliente del núcleo de chat (#407 §2.2) ═══
 *
 * Paramétrico: ChatCliente.crear({ producto, scope, login, ruta? }) devuelve un cliente para ESE
 * producto. Cada pedido lleva el token de SuiteAuth en el CUERPO (patrón de la suite: un header
 * Authorization fuerza preflight CORS), más ts + nonce + firma. La firma es HMAC-SHA256 con el
 * propio token como llave sobre la cadena canónica de shared/chat/chat-firma.js — UN solo lugar,
 * el mismo que lleva pegado n8n.
 *
 * Errores clasificados en un solo lugar (CLAUDE.md §20 #12b): sesion → volver a entrar ·
 * red → esperar (la cola reintenta) · servidor → avisar. Un 404 de n8n es «no publicado».
 */
(function (G) {
  'use strict';
  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var ERR_SESION = ['TOKEN_EXPIRADO', 'TOKEN_MALFORMADO', 'TOKEN_AUSENTE', 'PAYLOAD_ILEGIBLE', 'TOKEN_SIN_SUJETO', 'SIN_SESION', 'FIRMA_INVALIDA_JWT'];

  function base() {
    var u = null; try { u = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url'); } catch (e) {}
    return String(u || N8N_DEFAULT).replace(/\/$/, '');
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
  function clase(r) {
    if (!r || r.ok) return null;
    if (ERR_SESION.indexOf(r.error) >= 0) return 'sesion';
    if (r.error === 'SIN_RED') return 'red';
    if (r.error === 'SCOPE_INSUFICIENTE') return 'permiso';
    return 'servidor';
  }
  function transportar(url, cuerpo, timeout, progreso) {
    return new Promise(function (listo) {
      var x = new XMLHttpRequest(), hecho = false;
      var fin = function (r) { if (!hecho) { hecho = true; listo(r); } };
      x.open('POST', url, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.timeout = timeout;
      if (progreso && x.upload) x.upload.onprogress = function (e) { if (e.lengthComputable) progreso(e.loaded / e.total); };
      x.onload = function () {
        var r; try { r = JSON.parse(x.responseText); }
        catch (e) { r = { ok: false, error: x.status === 413 ? 'ADJUNTO_GRANDE' : 'RESPUESTA_INVALIDA', mensaje: 'El servidor respondió algo que no se entiende (HTTP ' + x.status + ').' }; }
        if (x.status === 404 && (r.ok === undefined || r.code === 404)) r = { ok: false, error: 'NO_PUBLICADO', mensaje: 'Ese servicio todavía no está encendido.' };
        fin(r);
      };
      // Un 502 del proxy llega sin CORS: se ve igual que «sin red» (CLAUDE.md §20 #15). Se reintenta.
      x.onerror = function () { fin({ ok: false, error: 'SIN_RED', mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }); };
      x.ontimeout = function () { fin({ ok: false, error: 'SIN_RED', mensaje: 'El servidor tardó demasiado. Se reintenta solo.' }); };
      try { x.send(cuerpo); } catch (e) { fin({ ok: false, error: 'SIN_RED' }); }
    });
  }

  function crear(cfg) {
    var producto = cfg.producto, scope = cfg.scope, login = cfg.login || '../../shared/login.html';
    var rutaChat = cfg.ruta || '/webhook/chat/suite';
    async function pedirEn(ruta, modo, campos, opc) {
      opc = opc || {};
      var A = G.SuiteAuth, token = A && A.getToken();
      if (!token) return irAlLogin({ ok: false, error: 'SIN_SESION', clase: 'sesion' });
      var c = Object.assign({ token: token, producto: producto, modo: modo, ts: Date.now(), nonce: nonce() }, campos || {});
      try { c.firma = await firmar(token, G.ChatFirma.canonica(c, G.ChatFirma.LISTAS.chat)); }
      catch (e) { return { ok: false, error: 'SIN_CRIPTO', clase: 'servidor', mensaje: 'Este navegador no puede firmar el pedido.' }; }
      var r = await transportar(base() + ruta, JSON.stringify(c), opc.timeout || 20000, opc.progreso);
      r = r || { ok: false, error: 'RESPUESTA_VACIA' };
      r.clase = clase(r);
      if (r.clase === 'sesion' && !opc.sinLogin) return irAlLogin(r);
      return r;
    }
    function irAlLogin(r) {
      // Se borra SOLO la llave de sesión; la cola sin señal vive en IndexedDB y sobrevive.
      try { G.SuiteAuth.logout(); sessionStorage.setItem('fts_suite_destino', location.href); } catch (e) {}
      try { location.replace(login + '?falta=' + encodeURIComponent(scope)); } catch (e) {}
      return r;
    }
    return {
      producto: producto,
      pedir: function (modo, campos, opc) { return pedirEn(rutaChat, modo, campos, opc); },
      /** Otro webhook del mismo producto (marketing/odoo-buscar, marketing/odoo-lead): misma firma. */
      webhook: function (ruta, modo, campos, opc) { return pedirEn(ruta, modo, campos, opc); },
      subir: function (campos, progreso) { return pedirEn(rutaChat, 'subir', campos, { timeout: 180000, progreso: progreso }); },
      clase: clase
    };
  }
  G.ChatCliente = { crear: crear, nonce: nonce, _clase: clase };
})(window);
