/* nomina-usa/kiosko · Code - Validar (#448)
 * Webhook sin sesión de la suite (mismo modelo que kiosk/checkin). Aquí solo se valida la
 * FORMA y se recorta lo que no se guarda; las reglas (avance que no baja, suma 100) las
 * revisa nomina_usa.kiosko() en la base, que además marca —no tira— lo que no cuadra.
 * Todo en try/catch y el item de salida es un objeto NUEVO (CLAUDE.md §9).
 */
try {
var b = $('Webhook').first().json.body || {};
var ACC = { contexto: 1, evento: 1 }, TIPOS = { dia: 1, entrada_so: 1, plan: 1, salida: 1 };
if (!ACC[b.accion]) return [{ json: { ok: false, error: 'ACCION_DESCONOCIDA' } }];
if (!/^\d{1,7}$/.test(String(b.employee_id || ''))) return [{ json: { ok: false, error: 'EMPLEADO_INVALIDO' } }];
if (JSON.stringify(b).length > 20000) return [{ json: { ok: false, error: 'DEMASIADO_GRANDE' } }];
var p = { accion: b.accion, employee_id: Number(b.employee_id), tz_evento: typeof b.tz_evento === 'string' ? b.tz_evento.slice(0, 64) : null, checada: b.checada === 'salida' ? 'salida' : (b.checada === 'entrada' ? 'entrada' : null) };
if (b.accion === 'evento') {
  if (!TIPOS[b.tipo]) return [{ json: { ok: false, error: 'TIPO_INVALIDO' } }];
  if (!/^ev_[A-Za-z0-9_]{6,80}$/.test(String(b.ev_id || ''))) return [{ json: { ok: false, error: 'EV_ID_INVALIDO' } }];
  var CAMPOS = ['ev_id', 'tipo', 'ts_evento', 'pais', 'pais_origen', 'pendiente_rh', 'utc_offset_min', 'lat', 'lng', 'geo_zona', 'kiosk_build',
                'so', 'so_pendiente', 'motivo', 'plan', 'avances', 'dia', 'comercial'];
  CAMPOS.forEach(function (k) { if (b[k] !== undefined) p[k] = b[k]; });
  if (p.pais != null && p.pais !== 'USA' && p.pais !== 'MX') return [{ json: { ok: false, error: 'PAIS_INVALIDO' } }];
}
return [{ json: { ok: true, payload: p } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_VALIDAR' } }];
}
