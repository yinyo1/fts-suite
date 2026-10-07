/* retardos/panel · Code - Puerta (#334, #123)
 * JWT de la Suite + HMAC firmado con el propio token + nonce (anti-replay).
 * TODO va en try/catch y el item de salida es un objeto NUEVO: el secreto del nodo
 * anterior no viaja aguas abajo ni aparece en un payload de error (CLAUDE.md §9).
 */
try {
var module = { exports: {} };
/*__SESION__*/
var S = module.exports;
var sec = String($input.first().json.secreto || '');
var body = $('Webhook').first().json.body || {};
var v = S.puerta(body, sec);
if (!v.ok) return [{ json: { ok: false, error: v.error } }];
var datos = Object.assign({}, v.datos, { actor: v.actor, rol: v.rol, nonce: v.nonce });
return [{ json: { ok: true, payload: datos } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_PUERTA' } }];
}
