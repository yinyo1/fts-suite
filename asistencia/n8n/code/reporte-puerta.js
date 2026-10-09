/* rh/dias-mx-usa · Code - Puerta (#396 fase a)
 * JWT de la Suite con scope rh:dias-mx-usa. TODO en try/catch y la salida es un objeto NUEVO:
 * el secreto del nodo anterior no viaja aguas abajo ni a un payload de error (CLAUDE.md §9). */
try {
  var module = { exports: {} };
  /*__JWT__*/
  var J = module.exports;
  module = { exports: {} };
  /*__DIAS__*/
  var D = module.exports;
  var sec = String($input.first().json.secreto || '');
  var body = $('Webhook').first().json.body || {};
  var v = J.verifyJWT(body.token, sec, 'rh:dias-mx-usa');
  if (!v.ok) return [{ json: { ok: false, error: v.error } }];
  var sem = body.semana ? D.semanaPorId(body.semana) : null;
  if (!sem) {
    var hoy = new Date(Date.now() - 6 * 3600e3);
    sem = D.semanaDe(new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10));
  }
  var fin = new Date(Date.parse(sem.hasta + 'T06:00:00Z') + 864e5 - 1000).toISOString().slice(0, 19).replace('T', ' ');
  return [{ json: { ok: true, actor: v.actor, nombre: v.nombre, semana: sem.id, desde_utc: sem.desde + ' 06:00:00', hasta_utc: fin } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_PUERTA' } }];
}
