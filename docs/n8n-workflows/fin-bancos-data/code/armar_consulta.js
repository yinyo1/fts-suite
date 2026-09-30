/* ── fin/bancos-data · armar la respuesta de la consulta (issue #370) ─────────
 * El SQL ya devuelve el sobre; aquí se pone quién preguntó y se distingue un fallo de la base
 * (la consulta tronó: 500 con su código) de una consulta que no trajo filas (eso es un 200 con total 0). */
let r = null, v = {};
try { r = $input.first().json.r; } catch (e) { r = null; }
try { v = $('Code - Verificar').first().json; } catch (e) { v = {}; }
if (!r || typeof r !== 'object' || !Array.isArray(r.filas)) {
  let det = ''; try { det = String($input.first().json.error || $input.first().json.message || '').slice(0, 160); } catch (e) {}
  return [{ json: { http:500, cuerpo:{ ok:false, error:'CONSULTA_FALLO', clase:'servidor', mensaje:'La base no contestó la consulta.', detalle:det } } }];
}
return [{ json: { http:200, cuerpo: Object.assign({ ok:true, panel:'data-bancos', contrato:1,
  actor:{ nombre:v.actor || null }, filtro:v.filtro || null }, r) } }];
