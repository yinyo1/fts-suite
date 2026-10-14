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
 *
 * Firma v2: además firma el sha256 del adjunto (la base comprueba que el
 * contenido cuadre con él), la acción y su resultado. Misma cadena que
 * n8n/codigo/suite-verificar.js en fts-conceptualizador.
 */
(function (G) {
  'use strict';
  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var RUTA = '/webhook/conceptualizador/suite';
  var TIMEOUT_MS = 20000, TIMEOUT_SUBIR_MS = 180000;
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
  function S(x) { return x === undefined || x === null ? '' : '' + x; }
  /* V1.32.2 (#407 §2.2): la cadena canónica vive en UN solo lugar, shared/chat/chat-firma.js,
   * que también usa Marketing y que n8n lleva pegado. Lista `conceptualizador`: idéntica a la de antes. */
  function canonica(c) { return G.ChatFirma.canonica(c, G.ChatFirma.LISTAS.conceptualizador); }

  /** Clasifica en un solo lugar (fts-suite CLAUDE.md §20 #12b):
   *  sesion → volver a entrar · red → esperar · servidor → avisar. */
  function clase(r) {
    if (!r || r.ok) return null;
    if (ERR_SESION.indexOf(r.error) >= 0) return 'sesion';
    if (r.error === 'SIN_RED') return 'red';
    return 'servidor';
  }

  /** Un solo camino de salida. `progreso(0..1)` solo aplica al subir (XHR da avance de carga; fetch no). */
  async function pedir(modo, campos, opc) {
    opc = opc || {};
    var A = G.SuiteAuth, token = A && A.getToken();
    if (!token) return { ok: false, error: 'SIN_SESION', clase: 'sesion' };
    var c = Object.assign({ token: token, modo: modo, ts: Date.now(), nonce: nonce() }, campos || {});
    try { c.firma = await firmar(token, canonica(c)); }
    catch (e) { return { ok: false, error: 'SIN_CRIPTO', clase: 'servidor', mensaje: 'Este navegador no puede firmar el pedido.' }; }
    var r = await transportar(RUTA, JSON.stringify(c), opc.timeout || TIMEOUT_MS, opc.progreso);
    r = r || { ok: false, error: 'RESPUESTA_VACIA' };
    if (r.code === 404 && r.ok === undefined) r = { ok: false, error: 'NO_PUBLICADO', mensaje: 'El servicio del conceptualizador todavía no está encendido en n8n.' };
    r.clase = clase(r);
    if (r.clase === 'sesion') {
      // Se borra SOLO la llave de sesión y se manda al login. La cola sin
      // señal vive en IndexedDB y sobrevive: al volver a entrar se manda sola.
      try { A.logout(); sessionStorage.setItem('fts_suite_destino', location.href); } catch (e) {}
      location.replace('../../shared/login.html' + (r.error === 'SCOPE_INSUFICIENTE' ? '?falta=conceptualizador:usar' : ''));
    }
    return r;
  }

  function transportar(ruta, cuerpo, timeout, progreso) {
    return new Promise(function (listo) {
      var x = new XMLHttpRequest(), hecho = false;
      var fin = function (r) { if (!hecho) { hecho = true; listo(r); } };
      x.open('POST', base() + ruta, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.timeout = timeout;
      if (progreso && x.upload) x.upload.onprogress = function (e) { if (e.lengthComputable) progreso(e.loaded / e.total); };
      x.onload = function () {
        var r; try { r = JSON.parse(x.responseText); }
        catch (e) { r = { ok: false, error: x.status === 413 ? 'ADJUNTO_GRANDE' : 'RESPUESTA_INVALIDA',
          mensaje: x.status === 413 ? 'El servidor no aceptó un archivo tan grande.' : 'El servidor respondió algo que no se entiende (HTTP ' + x.status + ').' }; }
        fin(r);
      };
      // Un 502 del proxy llega aquí sin CORS: se ve igual que «sin red» (§20 #15). Se reintenta.
      x.onerror = function () { fin({ ok: false, error: 'SIN_RED', mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }); };
      x.ontimeout = function () { fin({ ok: false, error: 'SIN_RED', mensaje: 'El servidor tardó demasiado. Se reintenta solo.' }); };
      try { x.send(cuerpo); } catch (e) { fin({ ok: false, error: 'SIN_RED' }); }
    });
  }

  /** Otros webhooks de la suite (machote-guardar, oportunidades, orden-crear-v2):
   *  el token va en el cuerpo, como en el resto de la suite. */
  async function conToken(ruta, cuerpo, timeout) {
    var A = G.SuiteAuth, token = A && A.getToken();
    if (!token) return { ok: false, error: 'SIN_SESION', clase: 'sesion' };
    return cerrar(await transportar(ruta, JSON.stringify(Object.assign({ token: token }, cuerpo || {})), timeout || 30000));
  }
  function cerrar(r) {
    r = r || { ok: false, error: 'RESPUESTA_VACIA' };
    if (r.code === 404 && r.ok === undefined) r = { ok: false, error: 'NO_PUBLICADO', mensaje: 'Ese servicio todavía no está encendido en n8n.' };
    r.clase = clase(r); return r;
  }

  /** Alta en Odoo (conceptualizador/odoo-alta): firmado con el token como el chat. */
  async function alta(campos) {
    var A = G.SuiteAuth, token = A && A.getToken();
    if (!token) return { ok: false, error: 'SIN_SESION', clase: 'sesion' };
    var c = Object.assign({ token: token, ts: Date.now(), nonce: nonce() }, campos);
    c.firma = await firmar(token, [c.ts, c.nonce, 'alta', S(c.tipo), S(c.empresa_id), S(c.nombre), S(c.puesto), S(c.email), S(c.telefono)].join('\n'));
    return cerrar(await transportar('/webhook/conceptualizador/odoo-alta', JSON.stringify(c), 30000));
  }

  G.CzCliente = {
    alta: alta,
    suite: conToken,
    nueva: function (campos) { return pedir('nueva', campos); },
    subir: function (campos, progreso) { return pedir('subir', campos, { timeout: TIMEOUT_SUBIR_MS, progreso: progreso }); },
    enviar: function (campos) { return pedir('enviar', campos); },
    evento: function (campos) { return pedir('evento', campos); },
    accion: function (campos) { return pedir('accion', campos); },
    verAdjunto: function (id) { return pedir('ver_adjunto', { adjunto_id: id }, { timeout: TIMEOUT_SUBIR_MS }); },
    hilo: function (casoId) { return pedir('hilo', { caso_id: casoId }); },
    casos: function () { return pedir('casos'); },
    aprendio: function () { return pedir('aprendio'); },
    estado: function () { return pedir('estado'); },
    /* V1.31 (db 0005): la sesión a mano. El nombre nuevo viaja en `texto`, que ya
     * va en la firma. Quién puede qué lo decide la base con el actor del token. */
    renombrar: function (casoId, nombre) { return pedir('renombrar', { caso_id: casoId, texto: nombre }); },
    archivar: function (casoId) { return pedir('archivar', { caso_id: casoId }); },
    desarchivar: function (casoId) { return pedir('desarchivar', { caso_id: casoId }); },
    fijar: function (casoId) { return pedir('fijar', { caso_id: casoId }); },
    desfijar: function (casoId) { return pedir('desfijar', { caso_id: casoId }); },
    // V1.32 (0006): «Listo, sigue» de la palomeada, «Es una prueba» (si/no) y la empresa de la sesión.
    palomeadaLista: function (casoId) { return pedir('palomeada_lista', { caso_id: casoId }); },
    prueba: function (casoId, si) { return pedir('prueba', { caso_id: casoId, texto: si ? 'si' : 'no' }); },
    empresa: function (casoId, clave) { return pedir('empresa', { caso_id: casoId, texto: clave }); },
    _canonica: canonica
  };
})(window);
