/* asistencia/vigia-cuadre · Code - Resultado. El cuadre YA quedó escrito en asistencia.corrida y
 * el reporte de RH lo muestra. Si hay descuadre, esta ejecución termina en ERROR a propósito: queda
 * roja en n8n y dispara el workflow de error si Esteban lo conecta. Un cero con odoo=0 no es éxito:
 * también se avisa (§20 #11: un vacío no prueba que la lectura sirva). */
var r = ($input.first().json || {}).r || {};
if (!r.ok) throw new Error('VIGIA_CUADRE_FALLO: ' + JSON.stringify(r).slice(0, 300));
if (!r.odoo) throw new Error('VIGIA_CUADRE_SIN_DATOS: Odoo no devolvió asistencias de ' + r.desde + ' a ' + r.hasta);
if (r.n_sin_evento || r.n_sin_odoo) {
  throw new Error('VIGIA_CUADRE_DESCUADRE ' + r.desde + '..' + r.hasta + ': ' + r.n_sin_evento + ' asistencias de Odoo sin evento (' +
    (r.sin_evento || []).slice(0, 20).join(',') + ') y ' + r.n_sin_odoo + ' eventos sin asistencia (' + (r.sin_odoo || []).slice(0, 20).join(',') + ')');
}
return [{ json: { ok: true, desde: r.desde, hasta: r.hasta, odoo: r.odoo, arranque: r.arranque, mensaje: 'Cuadra: cada asistencia tiene su evento.' } }];
