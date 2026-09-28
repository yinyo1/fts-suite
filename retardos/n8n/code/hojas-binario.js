/* retardos/hojas · Code - A binario (#334)
 * Cada hoja pendiente (base64 que dejó Postgres) se vuelve un binario para mandarlo tal cual
 * al procesador retardos-hojas, que no tiene base ni herramientas: recibe bytes, devuelve JSON.
 */
var out = [];
$input.all().forEach(function (it) {
  var h = it.json.h;
  if (!h || !h.hoja_id) return;
  out.push({ json: { hoja_id: h.hoja_id, mime: h.mime || 'application/pdf' },
             binary: { data: { data: h.contenido_b64, mimeType: h.mime || 'application/pdf', fileName: h.nombre || 'hoja' } } });
});
return out;
