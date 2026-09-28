/* ROJO: correo inmediato a Esteban, desde sales@. Destinatario FIJO aquí; no se lee de ningún lado. */
const v = $('Code - Validar').first().json;
const reg = $('Postgres - Registrar').first().json;
const sub = $('HTTP - Subir informe (OneDrive)').first().json || {};
const url = (sub.body && sub.body.webUrl) || sub.webUrl || '';
const html = v.correo_html + (url ? '<p>Informe completo (privado): <a href="' + url + '">' + v.nombre + '</a></p>' : '<p>El informe no se pudo subir a OneDrive; está en bancos.auditorias id ' + reg.auditoria_id + '.</p>');
return [{ json: { enviar: v.veredicto === 'ROJO' ? 'si' : 'no', mail: { message: { subject: v.asunto, body: { contentType: 'HTML', content: html },
  toRecipients: [{ emailAddress: { address: 'estebandelacruz@fts.mx' } }] }, saveToSentItems: true } } }];
