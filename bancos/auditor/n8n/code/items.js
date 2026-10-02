/* Hasta 25 archivos por llamada (para no cargar la memoria compartida de n8n, §20 #14). */
const p = $('Code - Pedido').first().json;
return (p.items || []).filter(x => x && x.drive_id && x.item_id).map(x => ({ json: { drive_id: String(x.drive_id), item_id: String(x.item_id) } }));
