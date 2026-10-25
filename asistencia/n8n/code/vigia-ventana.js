/* asistencia/vigia-cuadre · Code - Ventana: los 7 días CST anteriores a hoy. */
var hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
function mas(iso, n) { return new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
var desde = mas(hoy, -7), hasta = mas(hoy, -1);
return [{ json: { desde: desde, hasta: hasta, desde_utc: desde + ' 06:00:00', hasta_utc: hoy + ' 05:59:59' } }];
