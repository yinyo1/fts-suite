/* retardos/lector · Code - Decidir (#334)
 * Mientras retardos.config.buzon_receptor sea null, el lector está APAGADO por diseño:
 * no hay buzón de RH autorizado en la Application Access Policy de Graph todavía
 * (pendiente de clic de Esteban). Devuelve cero items y nada se lee.
 */
var c = $input.first().json || {};
var buzon = c.buzon ? String(c.buzon).trim() : '';
if (!buzon || buzon.indexOf('@') < 1) return [];
var desde = new Date(Date.now() - 3 * 86400000).toISOString();
return [{ json: { buzon: buzon, desde: desde } }];
