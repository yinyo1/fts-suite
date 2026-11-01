/* nomina-usa/panel · Code - Puerta (#448)
 * JWT de la Suite (cualquier scope nomina_usa:*) + HMAC firmado con el propio token + nonce.
 * Las scopes que viajan a SQL salen del JWT VERIFICADO, nunca del body: el despachador
 * nomina_usa.panel() decide con ellas qué acción se puede correr.
 * TODO en try/catch y el item de salida es un objeto NUEVO: el secreto del nodo anterior
 * no viaja aguas abajo ni aparece en un payload de error (CLAUDE.md §9).
 */
try {
var module = { exports: {} };
/*__SESION__*/
var S = module.exports;
var sec = String($input.first().json.secreto || '');
var body = $('Webhook').first().json.body || {};
if (sec.length < 32) return [{ json: { ok: false, error: 'SECRETO_NO_CONFIGURADO' } }];
var v = S.verificarJWT(String(body.token || ''), sec, null);
if (!v.ok) return [{ json: { ok: false, error: v.error } }];
var mias = v.scopes.filter(function (s) { return /^nomina_usa:/.test(s); });
if (!mias.length) return [{ json: { ok: false, error: 'SCOPE_INSUFICIENTE' } }];
var ts = Number(body.ts);
if (!isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return [{ json: { ok: false, error: 'FUERA_DE_VENTANA' } }];
var nonce = String(body.nonce || '');
if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return [{ json: { ok: false, error: 'NONCE_INVALIDO' } }];
var datos = body.datos || {};
var esperada = S.firmar(String(body.token), ts, nonce, datos), sig = String(body.sig || '').toLowerCase();
var d = esperada.length === sig.length ? 0 : 1;
for (var i = 0; i < esperada.length && i < sig.length; i++) d |= esperada.charCodeAt(i) ^ sig.charCodeAt(i);
if (d) return [{ json: { ok: false, error: 'HMAC_INVALIDO' } }];
var payload = Object.assign({}, datos, { actor: v.actor, scopes: mias, nonce: nonce });
return [{ json: { ok: true, payload: payload } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_PUERTA' } }];
}
