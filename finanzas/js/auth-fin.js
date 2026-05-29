// ═══ FTS Suite · Finanzas — cliente de autenticación ═══
// Auth server-side dedicada (NO usa FTSAuth/users-suite.json).
// Login via webhook n8n /auth/finanzas-login → JWT firmado HMAC-SHA256.
// El token (8h) se guarda en localStorage['fts_fin_session'].
//
// API: window.FinAuth.login(user, password), .getSession(), .isValid(), .logout(), .getToken()

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var LOGIN_PATH  = '/webhook/auth/finanzas-login';
  var SESSION_KEY = 'fts_fin_session';

  function n8nBase() {
    var url = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  // ─── Decodificar payload del JWT (sin verificar firma; la firma la valida el server) ───
  function decodeJwtPayload(token) {
    try {
      var parts = String(token).split('.');
      if (parts.length !== 3) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  // ─── Login ───
  // Devuelve { ok:true, session } | { ok:false, code, msg, http }
  async function login(user, password) {
    var body = { user: String(user || ''), password: String(password || '') };
    var res, data;
    try {
      res = await fetch(n8nBase() + LOGIN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return { ok: false, code: 'NETWORK', msg: 'No se pudo conectar al servidor. Revisa tu conexión.', http: 0 };
    }
    try { data = await res.json(); } catch (e) { data = null; }

    if (!data) return { ok: false, code: 'BAD_RESPONSE', msg: 'Respuesta inválida del servidor.', http: res.status };

    if (data._error || !data.token) {
      return { ok: false, code: data.code || 'AUTH_FAILED', msg: data.msg || 'No se pudo iniciar sesión.', http: data.http || res.status, retry_after_s: data.retry_after_s };
    }

    // Sesión válida: persistir token + metadata
    var claims = decodeJwtPayload(data.token) || {};
    var session = {
      token:      data.token,
      expires_at: data.expires_at || (claims.exp ? new Date(claims.exp * 1000).toISOString() : null),
      user:       String(user || ''),
      app:        claims.app || 'finanzas',
      role:       (claims.role !== undefined ? claims.role : null)
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session: session };
  }

  // ─── Sesión ───
  function getSession() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // ¿Hay sesión y el token NO ha expirado?
  function isValid() {
    var s = getSession();
    if (!s || !s.token || !s.expires_at) return false;
    return new Date(s.expires_at).getTime() > Date.now();
  }

  function getToken() {
    var s = getSession();
    return (s && isValid()) ? s.token : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  window.FinAuth = {
    login: login,
    getSession: getSession,
    isValid: isValid,
    getToken: getToken,
    logout: logout,
    decodeJwtPayload: decodeJwtPayload,
    SESSION_KEY: SESSION_KEY
  };
})();
