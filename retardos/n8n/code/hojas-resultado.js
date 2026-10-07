/* retardos/hojas · Code - Resultado (#334)
 * Arma el payload de retardos.registrar_lectura(). La sugerencia la decide Postgres y la
 * decisión es de RH: aquí sólo se pasa lo que el procesador vio (o su error).
 */
var ins = $('Code - A binario').all();
return $input.all().map(function (it, i) {
  var r = it.json || {};
  var hoja = ins[i] ? ins[i].json.hoja_id : null;
  var ok = r.ok === true && Array.isArray(r.paginas);
  var e = r.error;
  if (e && typeof e === 'object') e = e.message || e.description || JSON.stringify(e);
  var err = ok ? null : String(e || (r.message ? 'HTTP: ' + r.message : 'SIN_RESPUESTA')).slice(0, 300);
  return { json: { hoja_id: hoja, ok: ok, error: err, motor: r.motor || null, paginas: ok ? r.paginas : [] } };
});
