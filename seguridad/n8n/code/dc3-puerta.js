/* seguridad/dc3-empleados · Code - Puerta (#507 Etapa 3)
 * Mismo candado que Retardos: JWT de la Suite (SUITE_JWT_SECRET) + HMAC firmado con el
 * propio token + nonce anti-replay. El nonce se guarda en el staticData del workflow
 * (sin tabla nueva en Postgres): se rechaza el segundo uso dentro de la ventana de 5 min.
 * Scope: buscar y detalle exigen dc3:empleados; faltantes exige rh:read.
 * TODO va en try/catch y la salida es un objeto NUEVO: el secreto del nodo anterior no
 * viaja aguas abajo ni aparece en un payload de error (CLAUDE.md §9).
 */
try {
var module = { exports: {} };
/*__SESION__*/
var S = module.exports;
var sec = String($input.first().json.secreto || '');
if (sec.length < 32) return [{ json: { ok: false, error: 'SECRETO_NO_CONFIGURADO' } }];
var body = $('Webhook').first().json.body || {};
var datos = body.datos || {};
var accion = String(datos.accion || '');
if (['buscar', 'detalle', 'faltantes'].indexOf(accion) < 0) return [{ json: { ok: false, error: 'ACCION_INVALIDA' } }];
var v = S.verificarJWT(String(body.token || ''), sec, accion === 'faltantes' ? 'rh:read' : 'dc3:empleados');
if (!v.ok) return [{ json: { ok: false, error: v.error } }];
var ts = Number(body.ts), ahora = Date.now();
if (!isFinite(ts) || Math.abs(ahora - ts) > 5 * 60 * 1000) return [{ json: { ok: false, error: 'FUERA_DE_VENTANA' } }];
var nonce = String(body.nonce || '');
if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return [{ json: { ok: false, error: 'NONCE_INVALIDO' } }];
var sig = String(body.sig || '').toLowerCase();
if (sig !== S.firmar(String(body.token), ts, nonce, datos)) return [{ json: { ok: false, error: 'HMAC_INVALIDO' } }];
var st = $getWorkflowStaticData('global');
var vistos = st.nonces || {};
for (var k in vistos) { if (ahora - vistos[k] > 10 * 60 * 1000) delete vistos[k]; }
if (vistos[nonce]) return [{ json: { ok: false, error: 'NONCE_REPETIDO' } }];
vistos[nonce] = ahora; st.nonces = vistos;
var q = String(datos.q || '').slice(0, 60);
var id = parseInt(datos.id, 10);
return [{ json: { ok: true, accion: accion, q: q, id: isFinite(id) ? id : null, actor: v.actor } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_PUERTA' } }];
}
