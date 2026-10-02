/* Dos raíces: los originales (recursivo) y el buzón (sólo su primer nivel). */
const U = '__U__';
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const sel = '$select=id,name,size,file,folder,parentReference,createdDateTime,lastModifiedDateTime&$top=200';
return [
  { json: { raiz: 'originales', url: U + '/root:/' + enc('FTS Finanzas - Bancos/01 Estados de cuenta originales - Servicios FTS SA de CV') + ':/children?' + sel } },
  { json: { raiz: 'buzon', url: U + '/root:/' + enc('FTS Finanzas - Bancos/00 Buzon de carga - subir aqui') + ':/children?' + sel } },
];
