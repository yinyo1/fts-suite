/* ── adaptador n8n: fts_bancos_acuse · Code - Armar ──
 * Cada item viene de "Postgres - f_acuse" (columna d = bancos.f_acuse(...)). Un acuse por tanda. */
return $('Postgres - f_acuse').all().map(it => {
  const d = typeof it.json.d === 'string' ? JSON.parse(it.json.d) : it.json.d;
  const c = armar('acuse', d, '');
  return { json: { hoy: d.hoy, modo: d.modo, corrida_id: d.corrida_id, accion: d.modo === 'real' ? 'enviar' : 'registrar',
    validados: d.validados.length, duplicados: d.duplicados.length, rechazados: d.rechazados.length, ...c } };
});
