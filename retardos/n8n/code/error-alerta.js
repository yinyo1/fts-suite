/* retardos/error (#334). Si Postgres tambien esta caido, la alerta sale igual con destinatario de respaldo. */
var t = $('Error Trigger').first().json || {};
var ex = t.execution || {}, wf = t.workflow || {}, er = ex.error || {};
var r = $input.first().json || {};
var para = Array.isArray(r.para) && r.para.length ? r.para : ['estebandelacruz@fts.mx'];
var rem = String(r.remitente || 'sales@fts.mx');
if (rem.toLowerCase() === 'estebandelacruz@fts.mx') rem = 'sales@fts.mx';
var pgOk = r.corrida !== undefined && r.corrida !== null;
function esc(s) { return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;'); }
var html = '<p><b>Falló un workflow de Retardos.</b></p>' +
  '<p>Workflow: ' + esc(wf.name) + ' (' + esc(wf.id) + ')<br>Nodo: ' + esc(ex.lastNodeExecuted) + '<br>Ejecución: ' + esc(ex.id) + ' (' + esc(ex.mode) + ')<br>Mensaje: ' + esc(String(er.message || '').slice(0, 400)) + '</p>' +
  '<p>' + (pgOk ? 'La falla quedó registrada en retardos.corrida.' : 'Tampoco se pudo registrar en Postgres: revisar la base.') + '</p>' +
  '<p>Runbook: docs/retardos/BLINDAJE.md, sección Qué revisar.</p>';
return [{ json: { remitente: rem, graph: { message: { subject: 'Alerta Retardos: falló ' + String(wf.name || 'un workflow'), body: { contentType: 'HTML', content: html }, toRecipients: para.map(function (a) { return { emailAddress: { address: String(a) } }; }) }, saveToSentItems: true } } }];
