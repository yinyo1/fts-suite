// ═══ FTS Suite · Finanzas — cliente de webhooks /fin/* ═══
// Wrapper de fetch para los webhooks de datos. El token JWT viaja en el BODY
// (campo `token`), NO en header Authorization — evita preflight CORS que n8n
// podría no contestar (RIESGO-2 del PLAN, decisión aprobada).
//
// API: window.FinClient.call(endpoint, params) -> Promise<data>
//   - inyecta el token de FinAuth en el body
//   - si no hay sesión válida, rechaza con {code:'NO_SESSION'} (el caller redirige a login)
//   - si el server responde 401/expirado, limpia sesión y rechaza con {code:'SESSION_EXPIRED'}

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';

  function n8nBase() {
    var url = localStorage.getItem('ops_n8n_url') || localStorage.getItem('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  // endpoint: ej. '/fin/facturas' (debe empezar con /). params: objeto de filtros.
  async function call(endpoint, params) {
    if (!window.FinAuth || !window.FinAuth.isValid()) {
      return Promise.reject({ code: 'NO_SESSION', msg: 'Sesión no válida o expirada. Inicia sesión de nuevo.' });
    }
    var token = window.FinAuth.getToken();
    var path  = '/webhook' + (endpoint.charAt(0) === '/' ? endpoint : '/' + endpoint);
    var body  = Object.assign({}, params || {}, { token: token });

    var res, data;
    try {
      res = await fetch(n8nBase() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return Promise.reject({ code: 'NETWORK', msg: 'No se pudo conectar al servidor.', http: 0 });
    }

    try { data = await res.json(); } catch (e) { data = null; }

    // Token rechazado por el server → sesión muerta
    if (res.status === 401 || (data && data._error && (data.code === 'BAD_TOKEN' || data.code === 'TOKEN_EXPIRED'))) {
      if (window.FinAuth) window.FinAuth.logout();
      return Promise.reject({ code: 'SESSION_EXPIRED', msg: 'Tu sesión expiró. Inicia sesión de nuevo.', http: 401 });
    }
    if (!data) return Promise.reject({ code: 'BAD_RESPONSE', msg: 'Respuesta inválida del servidor.', http: res.status });
    if (data._error) return Promise.reject({ code: data.code || 'ERROR', msg: data.msg || 'Error del servidor.', http: data.http || res.status });

    return data;
  }

  window.FinClient = { call: call };
})();
