/* retardos/db-migrate · decidir (#334)
 * Copia del patrón de bancos/db-migrate con numeración POR MÓDULO: versión = 'retardos_NNNN'.
 * UNA migración por corrida; el orden se exige; un archivo aplicado no se edita. */
var cfg = $('Set - Config').item.json;
var archivo = String(cfg.archivo || '').trim();
var contenido = String($('HTTP - Bajar .sql del repo').item.json.data || '');
var sha256 = String($('Crypto - sha256').item.json.sha256 || '');
var dryRun = String(cfg.dry_run) === 'true' || cfg.dry_run === true;
if (!contenido || contenido.length < 20) return [{ json: { aplicar:false, error:'ARCHIVO_VACIO', mensaje:'El .sql llegó vacío.' } }];
if (!/^[0-9a-f]{64}/.test(sha256)) return [{ json: { aplicar:false, error:'SIN_SHA', mensaje:'No se pudo calcular el sha256.' } }];
var hoja = (archivo.split('/').pop() || '');
var m = hoja.match(/^(retardos_[0-9]{4})_/);
if (!m) return [{ json: { aplicar:false, error:'NOMBRE_INVALIDO', mensaje:'Debe llamarse retardos_NNNN_algo.sql. Recibí: ' + archivo } }];
var version = m[1];
var filas = [];
try { filas = $('Postgres - Estado bitacora').all().map(function(i){ return i.json; }); } catch(e) { filas = []; }
filas = filas.filter(function(f){ return f && f.version; });
var ya = filas.filter(function(f){ return String(f.version) === version; })[0];
if (ya) {
  var mismo = String(ya.sha256) === sha256;
  return [{ json: { aplicar:false, error: mismo ? 'YA_APLICADA' : 'CHECKSUM_DISTINTO', version: version, sha256: sha256, sha256_en_base: ya.sha256,
    mensaje: mismo ? 'Ya aplicada y el archivo es el mismo.' : 'Ya aplicada pero el archivo CAMBIÓ: corrige con uno nuevo.' } }];
}
var n = parseInt(version.slice(9), 10), faltan = [];
for (var i = 1; i < n; i++) { var v = 'retardos_' + ('000' + i).slice(-4); if (!filas.some(function(f){ return f.version === v; })) faltan.push(v); }
if (faltan.length) return [{ json: { aplicar:false, error:'FUERA_DE_ORDEN', version: version, mensaje:'Falta aplicar ' + faltan.join(', ') } }];
if (contenido.indexOf('{' + '{') >= 0) return [{ json: { aplicar:false, error:'LLAVES_DOBLES', mensaje:'El .sql trae dos llaves juntas: el nodo Postgres las evaluaria como expresion.' } }];
if (contenido.indexOf('$' + '$') >= 0) return [{ json: { aplicar:false, error:'DOLAR_DOBLE', mensaje:'El .sql trae dos signos de dólar juntos (db/README regla 4).' } }];
return [{ json: { aplicar: !dryRun, dry_run: dryRun, version: version, archivo: archivo, sha256: sha256, bytes: contenido.length, sql: contenido,
  ya_aplicadas: filas.map(function(f){ return f.version; }).join(', ') || '(ninguna)',
  mensaje: dryRun ? 'ENSAYO: la ' + version + ' se aplicaría. Nada se escribió.' : 'Aplicando la ' + version } }];
