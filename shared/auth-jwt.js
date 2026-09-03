// ═══ FTS Suite · auth con JWT server-side ═══
//
// Cliente de `auth/suite-login` (workflow n8n `kLhyPxVSMbDRwxfC`, Fase 0 del
// issue #136). Login server-side: PBKDF2-SHA256 100k + JWT HS256 de 8 h, con
// los usuarios en la Data Table `suite_usuarios` de n8n.
//
// ⚠️ NO CONFUNDIR CON `shared/auth-suite.js`.
//    Los nombres se parecen y hacen cosas opuestas:
//
//      shared/auth-suite.js  ·  FTSAuth       ·  SHA-256 SIN SAL, en el navegador,
//                                                contra un JSON del repo PÚBLICO.
//                                                Los webhooks no saben quién llama.
//      shared/auth-jwt.js    ·  SuiteAuth     ·  este. La verificación ocurre en el
//                                                servidor y devuelve un token firmado
//                                                que los webhooks pueden exigir.
//
//    Un módulo que mueva dinero o datos de personas usa ESTE. FTSAuth se queda
//    donde ya está mientras se migra, no porque esté bien (issue #136 §2).
//
// ⚠️ LO QUE ESTE GATE **NO** HACE.
//    GitHub Pages es público. Este archivo decide si se PINTA la pantalla, no
//    si se puede DESCARGAR: cualquiera con la URL ve el HTML y el JS, con
//    contraseña o sin ella. Lo que de verdad protege es que cada webhook exija
//    el token y valide su firma en el servidor. Mientras un módulo no tenga
//    datos en servidor, este gate sirve para saber QUIÉN entró, no para
//    esconder nada. Decirlo aquí para que nadie lo confunda con una pared.
//
// API: SuiteAuth.login(u,p) · .getSession() · .isValid() · .logout()
//      .getToken() · .tieneScope('comercial:read') · .requerir(scope, urlLogin)

(function (G) {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var LOGIN_PATH  = '/webhook/auth/suite-login';

  // Llave propia. Finanzas usa `fts_fin_session` y FTSAuth `fts_session`:
  // compartir llave hacía que cerrar sesión en un módulo tumbara el otro.
  var SESSION_KEY = 'fts_suite_session';

  function base() {
    var u = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(u).replace(/\/$/, '');
  }

  function guardar(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); return true; }
    catch (e) { return false; }
  }

  function getSession() {
    try {
      var c = localStorage.getItem(SESSION_KEY);
      if (!c) return null;
      var s = JSON.parse(c);
      return (s && s.token && s.exp) ? s : null;
    } catch (e) { return null; }
  }

  /** Vigente = hay sesión y no ha expirado.
   *  Esto es para PINTAR la pantalla. La decisión que cuenta la toma el
   *  servidor al verificar la firma; aquí sólo se evita mostrar un panel que
   *  el servidor va a rechazar de todos modos. */
  function isValid() {
    var s = getSession();
    if (!s) return false;
    return (Math.floor(Date.now() / 1000) < Number(s.exp));
  }

  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function getToken() { var s = getSession(); return s ? s.token : null; }

  function tieneScope(sc) {
    var s = getSession();
    if (!s || !Array.isArray(s.scopes)) return false;
    return s.scopes.indexOf(sc) >= 0;
  }

  /** Devuelve {ok:true, sesion} o {ok:false, error, mensaje}.
   *  Los errores del servidor se pasan tal cual: el workflow ya devuelve el
   *  MISMO mensaje para usuario inexistente, inactivo y contraseña mala, a
   *  propósito, para que el error no sirva de oráculo para enumerar usuarios. */
  async function login(username, password) {
    var res, data;
    try {
      res = await fetch(base() + LOGIN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El token viaja en el CUERPO, no en un header Authorization: un header
        // fuerza preflight CORS que el webhook de n8n puede no contestar
        // (patrón validado en Finanzas, CLAUDE.md §15 #5).
        body: JSON.stringify({ username: username, password: password })
      });
    } catch (e) {
      return { ok: false, error: 'SIN_RED',
               mensaje: 'No se pudo contactar al servidor de acceso. Revisa tu conexión.' };
    }
    try { data = await res.json(); }
    catch (e) {
      return { ok: false, error: 'RESPUESTA_INVALIDA',
               mensaje: 'El servidor de acceso respondió algo que no se entiende.' };
    }
    if (!data || data.ok !== true) {
      return { ok: false, error: (data && data.error) || 'DESCONOCIDO',
               mensaje: (data && data.mensaje) || 'No se pudo iniciar sesión.' };
    }
    var sesion = {
      token: data.token,
      actor: data.actor,
      nombre: data.nombre,
      empleado_id: (data.empleado_id === undefined ? null : data.empleado_id),
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      exp: data.exp,
      debe_cambiar_password: data.debe_cambiar_password === true
    };
    if (!guardar(sesion)) {
      return { ok: false, error: 'SIN_ALMACEN',
               mensaje: 'Este navegador no deja guardar la sesión (modo privado o datos bloqueados).' };
    }
    return { ok: true, sesion: sesion };
  }

  /** El gate. Si no hay sesión vigente —o le falta el scope— manda al login y
   *  devuelve false, para que la pantalla pueda cortar su propio arranque.
   *  Guarda a dónde iba, para volver ahí después de entrar. */
  function requerir(scope, urlLogin) {
    var destino = urlLogin || 'login.html';

    // ⚠️ Este gate corre en el <head>, y ahí `document.body` TODAVÍA NO EXISTE:
    //    escribir el mensaje en el body reventaba en silencio. Y un `throw` en
    //    un <script> aborta ESE script, no los siguientes — así que la página
    //    seguía cargando su aplicación. Por eso la negativa hace DOS cosas:
    //    manda al login (que es quien explica), y deja una marca que la
    //    aplicación consulta para no arrancar mientras la navegación ocurre.
    function negar(qs) {
      G.__ftsSinAcceso = true;
      try { sessionStorage.setItem('fts_suite_destino', location.href); } catch (e) {}
      location.replace(destino + (qs || ''));
      return false;
    }

    if (!isValid()) return negar('');
    if (scope && !tieneScope(scope)) {
      // El login explica qué permiso falta: es la única pantalla que existe
      // siempre y la única desde la que se puede entrar con otro usuario.
      return negar('?falta=' + encodeURIComponent(scope));
    }
    return true;
  }

  /** A dónde volver después de entrar. Se consume: sólo sirve una vez. */
  function destino(porDefecto) {
    try {
      var d = sessionStorage.getItem('fts_suite_destino');
      sessionStorage.removeItem('fts_suite_destino');
      return d || porDefecto;
    } catch (e) { return porDefecto; }
  }

  G.SuiteAuth = {
    LLAVE_SESION: SESSION_KEY,
    login: login, getSession: getSession, isValid: isValid, logout: logout,
    getToken: getToken, tieneScope: tieneScope, requerir: requerir, destino: destino
  };
})(window);
