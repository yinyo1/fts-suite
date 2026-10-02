/* Junta todos los archivos vistos (originales en 4 niveles + primer nivel del buzón). Sólo metadatos:
 * el sha256 lo calcula el auditor bajando el archivo. Un error de Graph se reporta, no se esconde. */
const niveles = ['HTTP - Listar 1', 'HTTP - Listar 2', 'HTTP - Listar 3', 'HTTP - Listar 4'];
const vistos = new Set(), archivos = [], errores = [];
let carpetas = 0;
for (const n of niveles) {
  let items = [];
  try { items = $(n).all(); } catch (e) { items = []; }
  for (const it of items) {
    const j = it.json || {};
    if (j.error) errores.push({ nivel: n, error: String(j.error.message || j.error).slice(0, 200) });
    for (const v of (j.value || [])) {
      if (v.folder) { carpetas++; continue; }
      if (!v.file || vistos.has(v.id)) continue;
      vistos.add(v.id);
      const pr = v.parentReference || {};
      const ruta = String(pr.path || '').replace(/^\/drive(s\/[^/]+)?\/root:/, '');
      archivos.push({ item_id: v.id, drive_id: pr.driveId, nombre: v.name, ruta, size: v.size,
        creado: v.createdDateTime, modificado: v.lastModifiedDateTime,
        en_buzon: ruta.indexOf('00 Buzon de carga') >= 0, quickxor: v.file && v.file.hashes && v.file.hashes.quickXorHash || null });
    }
  }
}
return [{ json: { leido_at: new Date().toISOString(), carpetas, n_archivos: archivos.length, errores, archivos } }];
