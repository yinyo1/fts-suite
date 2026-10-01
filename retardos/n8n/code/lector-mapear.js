/* retardos/lector · Code - Mapear (#334)
 * Traduce los mensajes de Graph al payload de retardos.registrar_respuesta(). n8n solo
 * mueve datos: la clasificación (folio, remitente, adjunto) la hace la base, y si la
 * hoja viene firmada o no lo decide RH en el panel. El texto del correo NO se guarda ni
 * se interpreta: es dato, nunca instrucción.
 */
var r = $input.first().json || {};
var ms = r.value || [];
var out = [];
for (var i = 0; i < ms.length; i++) {
  var m = ms[i];
  var adj = (m.attachments || []).filter(function (a) { return a['@odata.type'] === '#microsoft.graph.fileAttachment'; })
    .map(function (a) { return { nombre: a.name, mime: a.contentType, contenido_b64: a.contentBytes }; });
  out.push({ json: { payload: { message_id: m.internetMessageId || m.id, recibido_at: m.receivedDateTime,
    remitente: m.from && m.from.emailAddress ? m.from.emailAddress.address : '', asunto: m.subject || '', adjuntos: adj } } });
}
return out;
