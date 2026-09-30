/* ── fin/bancos-data-exportar · armar la descarga (issue #370) ────────────────
 * formato 'csv'   → el CSV se genera AQUÍ, en el servidor, con BOM UTF-8 (Excel lee bien los acentos).
 * formato 'filas' → las filas en JSON; el XLSX lo arma el navegador con SheetJS (Monto numérico,
 *                   Moneda en su columna, Fecha como fecha).
 * Columnas: las visibles que manda la pantalla, en el orden de la pantalla. Monto es NÚMERO PURO con
 * signo, sin símbolo de divisa. Filas en el orden del prototipo: fecha descendente. */
const TIT = { fecha:'Fecha', monto:'Monto', mon:'Moneda', desc:'Descripción', banco:'Banco', cuenta:'Cuenta',
              ref:'Referencia', tipo:'Tipo', periodo:'Mes del estado', fuente:'Fuente (PDF)' };
let r = null, v = {};
try { r = $input.first().json.r; } catch (e) { r = null; }
try { v = $('Code - Verificar').first().json; } catch (e) { v = {}; }
if (!r || typeof r !== 'object' || !Array.isArray(r.filas)) {
  let det = ''; try { det = String($input.first().json.error || $input.first().json.message || '').slice(0, 160); } catch (e) {}
  return [{ json: { http:500, cuerpo:{ ok:false, error:'CONSULTA_FALLO', clase:'servidor', mensaje:'La base no contestó la exportación.', detalle:det } } }];
}
const cols = (v.cols || []).filter(c => TIT[c]);
const base = { ok:true, panel:'data-bancos', contrato:1, actor:{ nombre:v.actor || null }, filtro:v.filtro || null,
               total:r.total, por_moneda:r.por_moneda, cols:cols };
if (v.formato === 'filas') {
  return [{ json: { http:200, cuerpo: Object.assign(base, { formato:'filas', filas: r.filas.map(f => {
    const o = {}; cols.forEach(c => { o[c] = f[c]; }); return o; }) }) } }];
}
const esc = x => { x = String(x == null ? '' : x); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
const lineas = [cols.map(c => esc(TIT[c])).join(',')];
for (const f of r.filas) lineas.push(cols.map(c => esc(f[c])).join(','));
return [{ json: { http:200, cuerpo: Object.assign(base, { formato:'csv', csv: '\uFEFF' + lineas.join('\r\n') }) } }];
