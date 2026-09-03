// ═══ FTS Suite · Comercial — cliente de autenticación ═══
//
// Auth propia del módulo comercial (issue #140 alcance A). Login vía webhook
// n8n /auth/comercial-login → JWT firmado HMAC-SHA256.
//
// ⚠ LLAVE DE SESIÓN PROPIA, distinta de Finanzas.
//   Hasta la sesión 2, comercial se autenticaba con FinAuth y compartía
//   localStorage['fts_fin_session']. Eso significaba que cerrar sesión en
//   Finanzas tumbaba comercial y viceversa. Aquí la llave es fts_com_session.
//
// ⚠ El token trae la forma FINAL del ROADMAP §5.2: sub / roles[] / dndole.
//   NO es la forma de Finanzas (app / role). Un cliente copiado de auth-fin.js
//   leería campos que aquí no existen.
//
// API: window.ComAuth.login(u,p) · .getSession() · .isValid() · .logout()
//      .getToken() · .getDndole() · .tieneRol('comercial:direccion')

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var LOGIN_PATH  = '/webhook/auth/comercial-login';
  var SESSION_KEY = 'fts_com_session';

  function n8nBase() {
    var url = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  // Decodifica el payload SIN verificar la firma: la firma la valida el server.
  // Esto es solo para pintar la UI (nombre, rol); nunca para decidir permisos.
  function decodeJwtPayload(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length !== 3) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  async function login(user, password) {
    var res, data;
    try {
      res = await fetch(n8nBase() + LOGIN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: String(user || ''), password: String(password || '') })
      });
    } catch (e) {
      return { ok: false, code: 'NETWORK', msg: 'No se pudo conectar al servidor. Revisa tu conexión.', http: 0 };
    }
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data) return { ok: false, code: 'BAD_RESPONSE', msg: 'Respuesta inválida del servidor.', http: res.status };

    if (data._error || !data.token) {
      return {
        ok: false,
        code: data.code || 'AUTH_FAILED',
        msg: data.msg || 'No se pudo iniciar sesión.',
        http: data.http || res.status,
        retry_after_s: data.retry_after_s
      };
    }

    var claims = decodeJwtPayload(data.token) || {};
    var session = {
      token:      data.token,
      expires_at: data.expires_at || (claims.exp ? new Date(claims.exp * 1000).toISOString() : null),
      sub:        claims.sub || String(user || ''),
      roles:      Array.isArray(claims.roles) ? claims.roles : [],
      dndole:     claims.dndole !== undefined ? claims.dndole : null,
      app:        claims.app || 'comercial'
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return { ok: true, session: session };
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  function isValid() {
    var s = getSession();
    if (!s || !s.token || !s.expires_at) return false;
    return new Date(s.expires_at).getTime() > Date.now();
  }

  function logout() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function getToken()  { var s = getSession(); return s && s.token ? s.token : null; }
  function getDndole() { var s = getSession(); return s ? s.dndole : null; }
  function tieneRol(r) { var s = getSession(); return !!(s && s.roles && s.roles.indexOf(r) !== -1); }

  window.ComAuth = {
    login: login, getSession: getSession, isValid: isValid, logout: logout,
    getToken: getToken, getDndole: getDndole, tieneRol: tieneRol,
    SESSION_KEY: SESSION_KEY
  };
})();
