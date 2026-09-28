/* Siguiente nivel de carpetas de los ORIGINALES (el buzón sólo se lee en su primer nivel).
 * Si no hay subcarpetas sale un renglón 'fin' para que la cadena no se corte. */
const out = [];
for (const it of $input.all()) {
  const j = it.json || {};
  for (const v of (j.value || [])) {
    if (!v.folder) continue;
    const ruta = String((v.parentReference && v.parentReference.path) || '');
    if (ruta.indexOf('00 Buzon de carga') >= 0) continue;
    const d = v.parentReference && v.parentReference.driveId;
    out.push({ json: { url: 'https://graph.microsoft.com/v1.0/drives/' + d + '/items/' + v.id + '/children?$select=id,name,size,file,folder,parentReference,createdDateTime,lastModifiedDateTime&$top=200' } });
  }
}
return out.length ? out : [{ json: { fin: true, url: 'https://graph.microsoft.com/v1.0/users/estebandelacruz@fts.mx/drive?$select=id' } }];
