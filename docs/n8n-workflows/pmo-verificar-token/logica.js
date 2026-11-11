/* ── pmo/chat-apply · pmo/chat-direct · verificación del token de sesión (#486) ─────────────────
 * Va DESPUÉS de 'Set - secreto suite' (que resuelve $env.SUITE_JWT_SECRET) y ANTES del nodo legado
 * 'Code - Validar auth' (HMAC). No toca ese nodo: lo deja como camino de compatibilidad.
 *
 * TODO EL CUERPO VA EN try/catch A PROPÓSITO (CLAUDE.md §9, 8-sep): la ENTRADA de este nodo es el
 * secreto. Si lanzara, n8n adjuntaría ese input al payload de error. El fallo sale como DATO y la
 * salida es un objeto NUEVO: el secreto no sigue río abajo.
 *
 * MODO = 'tolerante' | 'estricto'
 *   tolerante: token válido → pasa como JWT · sin token → camino legado (HMAC) · token MALO → 401
 *   estricto : token válido → pasa · sin token o token malo → 401 (el HMAC queda muerto)
 * Un token presente pero inválido NUNCA cae al legado: si alguien manda token, se le exige.
 *
 * Salida:
 *   { _legado:true, body }                          → IF '¿legado?' rama true → 'Code - Validar auth'
 *   { _error:false, ...forma del validador, _auth:'jwt' } → 'IF - Auth Error?'
 *   { _error:true, code, http, msg }                 → 'IF - Auth Error?' → 'Respond - Error'
 */
const MODO = '__MODO__';           // lo pone construir.js
const FLUJO = '__FLUJO__';         // 'chat-apply' | 'chat-direct'
const SCOPE = 'pmo:write';
function err(http, code, msg) { return [{ json: { _error: true, _legado: false, code: code, http: http, msg: msg } }]; }
try {
  const body = ($('Webhook').first().json || {}).body || {};
  const tieneToken = typeof body.token === 'string' && body.token.length > 0;
  if (!tieneToken) {
    if (MODO === 'estricto') return err(401, 'SESION_REQUERIDA', 'Entra a la suite para usar el chat del PMO.');
    const sinToken = {}; for (const k of Object.keys(body)) sinToken[k] = body[k];
    return [{ json: { _legado: true, _auth: 'legado', body: sinToken } }];
  }
  const secreto = $input.first().json.secret;
  if (!secreto || ('' + secreto).length < 32) return err(500, 'SECRETO_NO_CONFIGURADO', 'SUITE_JWT_SECRET no está definida en n8n.');
  const v = verifyJWT(body.token, '' + secreto, SCOPE);
  if (!v.ok) {
    if (v.error === 'SCOPE_INSUFICIENTE') return err(403, v.error, 'Tu cuenta no tiene el permiso pmo:write.');
    return err(401, v.error, v.error === 'TOKEN_EXPIRADO' ? 'La sesión venció. Vuelve a entrar.' : 'Sesión no válida. Vuelve a entrar.');
  }
  const actor = String(v.actor || '');
  if (!actor) return err(401, 'TOKEN_SIN_ACTOR', 'Sesión no válida. Vuelve a entrar.');
  if (FLUJO === 'chat-apply') {
    // Misma forma que devuelve 'Code - Validar auth' en éxito (docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js)
    if (!body.message) return err(400, 'MISSING_FIELDS', 'message requerido');
    return [{ json: { _error: false, _legado: false, _auth: 'jwt',
      message: String(body.message).slice(0, 4000), userId: actor,
      history: Array.isArray(body.history) ? body.history.slice(-10) : [],
      file_sha_client: body.file_sha || null } }];
  }
  // chat-direct: la forma de su validador se LEE del workflow antes de aplicar (no está exportado al repo).
  return err(500, 'FLUJO_SIN_FORMA', 'chat-direct: falta armar la salida con la forma de su validador.');
} catch (e) {
  return err(500, 'FALLO_VERIFICACION', 'No se pudo verificar la sesión.');
}
