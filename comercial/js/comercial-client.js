// ═══ FTS Suite · Comercial — cliente de webhooks /comercial/* ═══
// Auth = 2 factores:
//   1. JWT del módulo Finanzas (window.FinAuth, reusado tal cual desde ../finanzas/js/auth-fin.js).
//      El token viaja en el BODY, no en header Authorization — mismo patrón que FinClient
//      (RIESGO-2 del PLAN: el header fuerza preflight CORS que n8n puede no contestar).
//   2. HMAC-SHA256 de dispositivo en el header x-fts-signature.
//
// ── Por qué el HMAC vive en localStorage y no en el código ──
// Esta página es estática y pública (GitHub Pages): CUALQUIER secreto escrito aquí queda
// publicado en el repo y servido a quien lo pida. Por eso el secreto NO se commitea: se
// aprovisiona una vez por dispositivo desde la consola del navegador. Eso convierte al
// HMAC en un factor real (de dispositivo): tener el password de Finanzas no basta, hay
// que estar en un equipo aprovisionado. Ver comercial/SUPUESTOS.md §T3-HMAC.
//
// Aprovisionar un dispositivo:
//   localStorage.setItem('fts_comercial_hmac', '<mismo valor que FTS_COMERCIAL_HMAC en Railway>')
//
// API: window.ComercialClient.capturar({cliente,descripcion,rango,origen}) -> Promise
//      window.ComercialClient.pipeline() -> Promise
//      window.ComercialClient.tieneHmac() -> bool

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var HMAC_KEY = 'fts_comercial_hmac';

  function n8nBase() {
    var url = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  function getHmacSecret() { return localStorage.getItem(HMAC_KEY) || ''; }
  function tieneHmac() { return !!getHmacSecret(); }

  // ─── HMAC-SHA256 vía Web Crypto (requiere contexto seguro: https o localhost) ───
  async function hmacHex(secret, msg) {
    if (!window.crypto || !window.crypto.subtle) {
      throw { code: 'NO_WEBCRYPTO', msg: 'Este navegador no expone Web Crypto (¿estás en http:// en vez de https://?).' };
    }
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
    return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Cadena canónica: DEBE coincidir carácter por carácter con la del nodo
  // "Validar JWT + HMAC" de comercial/captura. Se firman los campos en orden fijo y no el
  // JSON crudo porque re-serializar el body parseado por n8n no es byte-estable respecto a
  // lo que mandó el browser (orden de llaves, espaciado, escapes) => la firma fallaría de
  // forma intermitente e imposible de depurar.
  function canonical(p) {
    return ['v1', p.cliente || '', p.descripcion || '', p.rango || '', p.origen || '', p.ts || ''].join('|');
  }

  async function post(path, body, headers) {
    var res, data;
    try {
      res = await fetch(n8nBase() + '/webhook' + path, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw { code: 'NETWORK', msg: 'No se pudo conectar al servidor. Revisa tu conexión.', http: 0 };
    }
    try { data = await res.json(); } catch (e) { data = null; }

    if (res.status === 401 || (data && data._error && (data.code === 'BAD_TOKEN' || data.code === 'TOKEN_EXPIRED'))) {
      // Ojo: BAD_SIGNATURE / NO_SIGNATURE también son 401 pero NO son sesión muerta —
      // son dispositivo sin aprovisionar. Cerrar sesión ahí solo confundiría al usuario.
      if (data && data.code !== 'BAD_SIGNATURE' && data.code !== 'NO_SIGNATURE' && data.code !== 'STALE_REQUEST') {
        if (window.FinAuth) window.FinAuth.logout();
        throw { code: 'SESSION_EXPIRED', msg: 'Tu sesión expiró. Inicia sesión de nuevo.', http: 401 };
      }
    }
    if (!data) throw { code: 'BAD_RESPONSE', msg: 'Respuesta inválida del servidor.', http: res.status };
    if (data._error) throw { code: data.code || 'ERROR', msg: data.msg || 'Error del servidor.', http: data.http || res.status };
    return data;
  }

  function requireSession() {
    if (!window.FinAuth || !window.FinAuth.isValid()) {
      throw { code: 'NO_SESSION', msg: 'Sesión no válida o expirada. Inicia sesión de nuevo.' };
    }
    return window.FinAuth.getToken();
  }

  // ─── POST /comercial/captura ───
  async function capturar(p) {
    var token = requireSession();
    var secret = getHmacSecret();
    if (!secret) {
      throw { code: 'NO_HMAC', msg: 'Este dispositivo no está aprovisionado para capturar. Pide a Esteban la clave del dispositivo.' };
    }
    var payload = {
      cliente: String(p.cliente || '').trim(),
      descripcion: String(p.descripcion || '').trim(),
      rango: String(p.rango || ''),
      origen: String(p.origen || ''),
      ts: new Date().toISOString()
    };
    var sig = await hmacHex(secret, canonical(payload));
    return post('/comercial/captura', Object.assign({}, payload, { token: token }), { 'x-fts-signature': sig });
  }

  // ─── POST /comercial/pipeline (solo JWT) ───
  async function pipeline() {
    var token = requireSession();
    return post('/comercial/pipeline', { token: token });
  }

  window.ComercialClient = {
    capturar: capturar,
    pipeline: pipeline,
    tieneHmac: tieneHmac,
    HMAC_KEY: HMAC_KEY
  };
})();
