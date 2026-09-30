/* ── fin/bancos-data · verificación (issue #370) ──────────────────────────────
 * ALCANCE = 'consulta' | 'exportar' (lo pone el generador en la constante; el resto es igual en los dos).
 *
 * TODO EL CUERPO VA EN try/catch A PROPÓSITO. Este nodo cuelga de 'Set - secreto', o sea que su
 * ENTRADA es el secreto. Si lanzara, n8n adjunta el input del nodo que falló al payload de error y
 * ahí viaja el secreto en claro (CLAUDE.md §9, regla del 8-sep). Un nodo que no lanza no produce ese
 * payload. El fallo se devuelve como DATO, y lo que sale es un objeto NUEVO: el secreto no sigue.
 *
 * Scope requerido: bancos_data:read. Sin fallback de scopes de tokens viejos: sin el scope, no hay
 * acceso — y la respuesta es HTTP 403 (401 para una sesión que no vale; 500 para lo del servidor).
 *
 * El filtro del usuario se valida contra LISTAS BLANCAS y viaja al SQL como UN parámetro en base64:
 * nada se concatena. */
const ALCANCE = '__ALCANCE__';
const SORTS = ['fecha','monto','mon','desc','banco','cuenta','ref','tipo','periodo','fuente'];
const COLS  = ['fecha','monto','mon','desc','banco','cuenta','ref','tipo','periodo','fuente'];
function b64std(bytes) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i+1], b2 = bytes[i+2];
    out += A[b0 >> 2] + A[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : A[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : A[b2 & 63];
  }
  return out;
}
function fecha(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null; }
function falla(http, error, clase, mensaje) {
  return [{ json: { ok:false, http:http, cuerpo:{ ok:false, error:error, clase:clase, mensaje:mensaje } } }];
}
try {
  const ENTRADA = $input.first().json;
  const cuerpo  = ENTRADA.body || ENTRADA || {};
  const secreto = $('Set - secreto').item.json.secret;
  if (!secreto || ('' + secreto).length < 32) {
    return falla(500, 'SECRETO_NO_CONFIGURADO', 'servidor', 'SUITE_JWT_SECRET no está definida o es muy corta en el entorno de n8n.');
  }
  const v = verifyJWT(cuerpo.token, '' + secreto, 'bancos_data:read');
  if (!v.ok) {
    const scope = v.error === 'SCOPE_INSUFICIENTE';
    return falla(scope ? 403 : 401, v.error, 'sesion',
      v.error === 'TOKEN_EXPIRADO' ? 'La sesión venció. Vuelve a entrar.'
      : scope ? 'Tu cuenta no carga el permiso bancos_data:read.' : 'Sesión no válida. Vuelve a entrar.');
  }
  const f = {};
  f.desde = fecha(cuerpo.desde);
  f.hasta = fecha(cuerpo.hasta);
  f.cuentas = Array.isArray(cuerpo.cuentas)
    ? cuerpo.cuentas.filter(c => typeof c === 'string' && /^[a-z0-9-]{1,80}$/.test(c)).slice(0, 50) : null;
  f.texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim().slice(0, 100) : '';
  f.tipo = (cuerpo.tipo === 'cargo' || cuerpo.tipo === 'abono') ? cuerpo.tipo : '';
  f.sort = SORTS.indexOf(cuerpo.sort) >= 0 ? cuerpo.sort : 'fecha';
  f.dir = Number(cuerpo.dir) === 1 ? 1 : -1;
  const off = Math.floor(Number(cuerpo.offset) || 0);
  f.offset = off > 0 && off < 1000000 ? off : 0;
  const json = JSON.stringify(f);
  const bytes = []; for (const ch of unescape(encodeURIComponent(json))) bytes.push(ch.charCodeAt(0));
  const salida = { ok:true, alcance:ALCANCE, actor:v.actor, scopes:v.scopes, filtro:f, filtro_b64:b64std(bytes) };
  if (ALCANCE === 'exportar') {
    salida.formato = cuerpo.formato === 'filas' ? 'filas' : 'csv';
    const cols = Array.isArray(cuerpo.cols) ? COLS.filter(c => cuerpo.cols.indexOf(c) >= 0) : [];
    salida.cols = cols.length ? cols : ['fecha','monto','mon','desc','banco','cuenta'];
  }
  return [{ json: salida }];
} catch (e) {
  return falla(500, 'FALLO_VERIFICACION', 'servidor', 'No se pudo verificar la sesión.');
}
