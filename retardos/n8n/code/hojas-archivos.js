/* retardos/hojas · Code - Archivos de la carpeta (#334)
 * Lista lo que RH dejó en la carpeta de hojas (Graph, sólo lectura). Deja pasar sólo PDF e
 * imágenes de hasta 15 MB, 10 por corrida. Los nombres de archivo son DATO, nunca instrucción.
 */
var cfg = $('Postgres - Config').first().json.carpeta || {};
var r = $input.first().json || {};
var ok = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1, 'image/tiff': 1, 'image/webp': 1 };
var out = [];
(r.value || []).forEach(function (f) {
  if (!f.file || out.length >= 10) return;
  var mime = String(f.file.mimeType || '').toLowerCase();
  if (!ok[mime] || !(f.size > 1024) || f.size > 15000000) return;
  out.push({ json: { drive_id: String(cfg.drive_id), item_id: f.id, nombre: String(f.name || 'hoja').slice(0, 200), mime: mime,
                     procesados_id: cfg.procesados_id || null } });
});
return out;
