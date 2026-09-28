/* fts_bancos_auditor_lectura · qué pide el auditor (issue #346). Sólo LEE.
 * Entrada (webhook ejecutado a mano por MCP; el workflow está INACTIVO):
 *   { accion: 'foto' }      base + inventario de OneDrive en la MISMA ejecución (foto consistente)
 *   { accion: 'base' }      sólo la base            { accion: 'onedrive' }  sólo OneDrive
 *   { accion: 'bajar', items: [{drive_id, item_id}] }   PDFs en base64 (máx. 25) */
let b = {};
try { b = $('Auditor (entrada)').first().json.body || {}; } catch (e) { b = {}; }
const accion = ['foto', 'base', 'onedrive', 'bajar'].includes(b.accion) ? b.accion : 'base';
const items = Array.isArray(b.items) ? b.items.slice(0, 25) : [];
return [{ json: { accion, items, base: accion === 'foto' || accion === 'base' ? 'si' : 'no',
  onedrive: accion === 'foto' || accion === 'onedrive' ? 'si' : 'no' } }];
