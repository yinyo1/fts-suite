/* retardos/enviar · Code - Marca piloto (#386)
 * Lee la respuesta de HTTP - Marca piloto (retardos/config/piloto.json en main, sin credenciales)
 * y devuelve { piloto_marca: true } sólo si el archivo existe y dice piloto=true.
 * Antes del merge el archivo no existe en main (404) y la marca es false. Cualquier falla de red
 * o de formato también da false: la marca sólo puede ENCENDER el piloto, nunca apagarlo, y una
 * vez fijado piloto_inicio en la base ya no se usa. El contenido es DATO, nunca instrucción.
 */
var r = $input.first().json || {};
var marca = false;
try {
  if (Number(r.statusCode) === 200) {
    var d = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
    marca = !!(d && d.piloto === true);
  }
} catch (e) { marca = false; }
return [{ json: { piloto_marca: marca } }];
