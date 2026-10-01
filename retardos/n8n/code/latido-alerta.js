/* retardos/latido · Code - Armar alerta (#334, #220)
 * El dead man's switch: si retardos.salud() reporta problemas, arma UN correo de alerta
 * que sale DIRECTO por Graph (no por el outbox: si el outbox está atorado, la alerta no
 * puede depender de él). Si todo está bien, no produce items y no se manda nada.
 */
var j = $('Postgres - Salud').first().json || {};
var s = j.s || {}, cfg = j;
if (s.ok === true) return [];
var para = Array.isArray(cfg.alertas) && cfg.alertas.length ? cfg.alertas : ['estebandelacruz@fts.mx'];
var remitente = String(cfg.remitente || 'sales@fts.mx');
if (remitente.toLowerCase() === 'estebandelacruz@fts.mx') remitente = 'sales@fts.mx';
var ps = s.problemas || [];
var lis = ps.map(function (p) { return '<li><b>' + p.codigo + '</b>: ' + p.detalle + '</li>'; }).join('');
var html = '<p>El monitor de Retardos encontró problemas.</p><ul>' + lis + '</ul>'
  + '<p>Modo: ' + s.modo + '. Última detección: ' + (s.ultima_deteccion || 'nunca') + ' (leyó ' + (s.ultima_deteccion_leidos == null ? '?' : s.ultima_deteccion_leidos) + ').'
  + ' Casos abiertos: ' + s.casos_abiertos + '. Correos pendientes: ' + s.outbox_pendiente + '.</p>'
  + '<p>Qué revisar: BLINDAJE.md, sección Runbook.</p>';
return [{ json: { remitente: remitente, codigos: ps.map(function (p) { return p.codigo; }),
  graph: { message: { subject: '[ALERTA] Retardos: ' + ps.map(function (p) { return p.codigo; }).join(', '),
    body: { contentType: 'HTML', content: html },
    toRecipients: para.map(function (a) { return { emailAddress: { address: String(a) } }; }) }, saveToSentItems: true } } }];
