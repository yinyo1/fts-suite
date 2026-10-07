/* retardos/enviar · Code - Resultado: Graph contesta 202 sin cuerpo cuando acepta el correo. */
var ins = $('Code - Preparar').all();
var outs = $input.all();
var r = [];
for (var i = 0; i < outs.length; i++) {
  var j = outs[i].json || {}, e = (ins[i] || { json: {} }).json;
  var st = Number(j.statusCode || 0);
  var ok = st === 202;
  var err = null;
  if (!ok) {
    var b = j.body || {};
    err = 'HTTP ' + st + ' ' + (b.error ? String(b.error.code || '') + ' ' + String(b.error.message || '').slice(0, 200) : '');
  }
  r.push({ json: { id: e.id, ok: ok, error: err, modo: e.modo, para_efectivo: e.para_efectivo } });
}
return r;
