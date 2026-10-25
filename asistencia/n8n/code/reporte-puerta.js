/* rh/dias-mx-usa · Code - Puerta (#396 fase a)
 * JWT de la Suite con scope rh:dias-mx-usa. TODO en try/catch y la salida es un objeto NUEVO:
 * el secreto del nodo anterior no viaja aguas abajo ni a un payload de error (CLAUDE.md §9). */
try {
  var module = { exports: {} };
  /*__JWT__*/
  var J = module.exports;
  // Semana FTS (viernes a jueves, ancla jue 2026-07-23 = S30). Misma cuenta que
  // asistencia/lib/dias-mx-usa.js semanaPorId/semanaDe; una prueba exige que coincidan.
  var DIA = 864e5, ANCLA = Date.parse('2026-07-23T12:00:00Z');
  function semDesdeJueves(jueMs) {
    var jue = new Date(jueMs).toISOString().slice(0, 10);
    var n = 30 + Math.round((jueMs - ANCLA) / (7 * DIA));
    return { id: 'S' + n + '/' + jue.slice(0, 4), desde: new Date(jueMs - 6 * DIA).toISOString().slice(0, 10), hasta: jue };
  }
  function semanaPorId(id) {
    var m = /^S([0-9]+)\/([0-9]{4})/.exec(String(id || ''));
    return m ? semDesdeJueves(ANCLA + (Number(m[1]) - 30) * 7 * DIA) : null;
  }
  function semanaCerrada(ahoraMs) {
    var hoy = Date.parse(new Date(ahoraMs - 6 * 3600e3).toISOString().slice(0, 10) + 'T12:00:00Z');
    var dow = new Date(hoy).getUTCDay();                 // 4 = jueves
    var jueEstaSemana = hoy + ((4 - dow + 7) % 7) * DIA;  // el jueves que cierra la semana en curso
    return semDesdeJueves(jueEstaSemana - 7 * DIA);
  }
  // Autoprueba: el SHA-256/HMAC en JS puro viaja copiado al nodo; si una sola constante se
  // corrompe, TODAS las firmas fallan igual que un token malo. Vectores conocidos lo distinguen.
  var hex = function (u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += ('0' + u8[i].toString(16)).slice(-2); return s; };
  if (hex(J.sha256Bytes(J.strBytes('abc'))) !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' ||
      hex(J.hmacSha256('Jefe', 'what do ya want for nothing?')) !== '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843' ||
      semanaPorId('S43/2026').desde !== '2026-10-16') {
    return [{ json: { ok: false, error: 'AUTOPRUEBA_CRIPTO' } }];
  }
  var sec = String($input.first().json.secreto || '');
  var body = $('Webhook').first().json.body || {};
  var v = J.verifyJWT(body.token, sec, 'rh:dias-mx-usa');
  if (!v.ok) return [{ json: { ok: false, error: v.error } }];
  var sem = (body.semana ? semanaPorId(body.semana) : null) || semanaCerrada(Date.now());
  var fin = new Date(Date.parse(sem.hasta + 'T06:00:00Z') + 864e5 - 1000).toISOString().slice(0, 19).replace('T', ' ');
  return [{ json: { ok: true, actor: v.actor, nombre: v.nombre, semana: sem.id, desde_utc: sem.desde + ' 06:00:00', hasta_utc: fin } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_PUERTA' } }];
}
