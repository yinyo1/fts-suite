/* retardos/enviar · Code - Preparar (#334)
 * Arma el sendMail de Graph de cada correo que la base dejó listo. Los destinatarios
 * EFECTIVOS (sombra o real) ya vienen resueltos por retardos.por_enviar(): este nodo no
 * decide a quién se escribe. El PDF se genera aquí con retardos/lib/pdf.js (embebido).
 * Sin diagonales invertidas (CLAUDE.md §17 quirk 2c).
 */
var module = { exports: {} };
/*__PDF__*/
var PDF = module.exports;
var fila = $('Postgres - Por enviar').first().json || {};
var lista = fila.lista || [];
var remitente = String(fila.remitente || 'sales@fts.mx');
if (remitente.toLowerCase() === 'estebandelacruz@fts.mx') remitente = 'sales@fts.mx';
function dir(a) { return (a || []).map(function (x) { return { emailAddress: { address: String(x) } }; }); }
var out = [];
for (var i = 0; i < lista.length; i++) {
  var e = lista[i];
  var msg = {
    subject: e.asunto,
    body: { contentType: 'HTML', content: e.html },
    toRecipients: dir(e.para),
    ccRecipients: dir(e.cc),
    replyTo: e.responder_a ? dir([e.responder_a]) : []
  };
  var adj = null;
  if (e.pdf && e.caso) {
    try {
      var d = Object.assign({}, e.caso, { accion: e.pdf });
      var h = PDF.hoja(d);
      adj = h.nombre;
      msg.attachments = [{ '@odata.type': '#microsoft.graph.fileAttachment', name: h.nombre, contentType: 'application/pdf', contentBytes: h.base64 }];
    } catch (err) { adj = 'ERROR_PDF'; }
  }
  out.push({ json: { id: e.id, tipo: e.tipo, modo: e.modo, remitente: remitente, para_efectivo: e.para, adjunto: adj,
                     graph: { message: msg, saveToSentItems: true } } });
}
return out;
