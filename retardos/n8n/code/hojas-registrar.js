/* retardos/hojas · Code - A base64 (#334)
 * n8n sólo mueve datos: convierte el archivo bajado de Graph a base64 para retardos.hoja_registrar().
 */
var out = [];
var items = $input.all();
for (var i = 0; i < items.length; i++) {
  var meta = $('Code - Archivos de la carpeta').all()[i].json;
  var b64 = null;
  try { b64 = (await this.helpers.getBinaryDataBuffer(i, 'data')).toString('base64'); } catch (e) { b64 = null; }
  if (!b64) continue;
  out.push({ json: { payload: { nombre: meta.nombre, mime: meta.mime, contenido_b64: b64, origen: 'carpeta',
                                graph_item_id: meta.item_id, subido_por: 'carpeta' },
                     drive_id: meta.drive_id, item_id: meta.item_id, procesados_id: meta.procesados_id } });
}
return out;
