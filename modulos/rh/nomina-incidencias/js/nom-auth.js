// ═══ Nómina · Incidencias — cliente de autenticación ═══
//
// Auth server-side con SCOPES (Fase 0 del #136). NO usa FTSAuth/users-suite.json:
// esos hashes son SHA-256 sin sal en un repo público, inaceptable para un módulo que
// mueve dinero — el mismo motivo por el que Finanzas estrenó auth propia (CLAUDE.md §15).
//
// Login vía webhook n8n /auth/suite-login → JWT HMAC-SHA256 con `scopes`.
// Mismo patrón que finanzas/js/auth-fin.js a propósito: una sola forma de hacer login
// en el Suite, con distinto emisor, en vez de un tercer sistema.
//
// API: window.NomAuth.login(user, password), .getSession(), .isValid(), .getToken(),
//      .tieneScope(s), .logout()

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var LOGIN_PATH  = '/webhook/auth/suite-login';
  var SESSION_KEY = 'fts_suite_session';
  var SCOPE_MODULO = 'nomina:write';

  // ─── Acceso a localStorage a prueba de excepciones ───
  // No es defensa teórica: `localStorage` LANZA (SecurityError, no devuelve null) en
  // ventana privada de algunos navegadores, con los datos de sitio bloqueados, y dentro
  // de un iframe de origen opaco. Sin esta guarda, la primera línea del arranque revienta
  // y la pantalla queda EN BLANCO, sin mensaje ni pista. Lo detectó la revisión visual en
  // Chromium el 2026-09-03; el módulo entero pasa por aquí.
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) {} }
  // ─── fin helper ───

  function n8nBase() {
    var url = leer('ops_n8n_url') || leer('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  // Decodifica el payload SIN verificar la firma. La firma la valida el server en cada
  // webhook; aquí solo se lee para pintar el nombre y saber cuándo expira. Un token
  // manipulado pasaría este decode y moriría en el server, que es donde importa.
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
    // El workflow espera `username`, NO `user`. Lo verifiqué disparando el webhook:
    // con {user:…} contesta PAYLOAD_INCOMPLETO sin llegar a comprobar la contraseña.
    // Copiar el payload de Finanzas sin leer ESTE workflow fue el error (§8 anti-trabón:
    // el contrato se lee del server que lo sirve, no del vecino que se le parece).
    var body = { username: String(user || ''), password: String(password || '') };
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

    // Forma real de la respuesta de `auth/suite-login`, leída del workflow y comprobada
    // en vivo: { ok:false, error:'CODIGO', mensaje:'texto para la persona' }. Antes esto
    // leía `_error/code/msg` (la forma de Finanzas) y por eso TODO fallo se veía igual:
    // un "No se pudo iniciar sesión." genérico que escondía el motivo real.
    if (data.ok === false || data._error || !data.token) {
      return {
        ok: false,
        code: data.error || data.code || 'AUTH_FAILED',
        msg: data.mensaje || data.msg || 'No se pudo iniciar sesión.',
        http: data.http || res.status
      };
    }

    var claims = decodeJwtPayload(data.token) || {};
    var session = {
      token:       data.token,
      // El workflow devuelve `exp` (segundos unix). Se acepta también `expires_at` ISO
      // y el `exp` del propio JWT, por si el emisor cambia de forma.
      expires_at:  data.expires_at ||
                   (data.exp ? new Date(data.exp * 1000).toISOString() : null) ||
                   (claims.exp ? new Date(claims.exp * 1000).toISOString() : null),
      user:        String(user || ''),
      nombre:      data.nombre || claims.nombre || String(user || ''),
      empleado_id: (data.empleado_id !== undefined ? data.empleado_id : claims.empleado_id) || null,
      scopes:      claims.scopes || data.scopes || [],
      // El server marca cuándo la contraseña es la de alta y hay que cambiarla.
      debe_cambiar_password: !!(data.debe_cambiar_password || claims.debe_cambiar_password)
    };
    guardar(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session: session };
  }

  function getSession() {
    var raw = leer(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function isValid() {
    var s = getSession();
    if (!s || !s.token || !s.expires_at) return false;
    return new Date(s.expires_at).getTime() > Date.now();
  }

  function getToken() {
    var s = getSession();
    return (s && isValid()) ? s.token : null;
  }

  // El scope se comprueba TAMBIÉN en el server, en cada webhook. Aquí solo decide qué
  // se pinta: esconder un botón no protege nada, y confiar en esta función para
  // autorizar sería la misma "puerta buena en pared de papel" que motivó la Fase 0.
  function tieneScope(scope) {
    var s = getSession();
    if (!s || !isValid()) return false;
    var sc = s.scopes || [];
    return sc.indexOf(scope) >= 0;
  }

  function logout() { borrar(SESSION_KEY); }

  window.NomAuth = {
    login: login,
    getSession: getSession,
    isValid: isValid,
    getToken: getToken,
    tieneScope: tieneScope,
    logout: logout,
    decodeJwtPayload: decodeJwtPayload,
    SESSION_KEY: SESSION_KEY,
    SCOPE_MODULO: SCOPE_MODULO
  };
})();
