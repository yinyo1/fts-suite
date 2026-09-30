/* fts_bancos_auditor_obj2_lectura · Code - Odoo compacto (issue #365). SOLO LECTURA de Odoo.
 * Deja sólo lo que el cotejo necesita: diario, línea, asiento, pago, fecha y monto
 * (el diario 75 BBVA USD en dólares, amount_currency; los demás en pesos, balance). Sin nombres ni referencias. */
const m2o = v => Array.isArray(v) ? v[0] : (v && typeof v === 'object' ? v.id : v);
const lineas = $('Odoo - Lineas de banco (solo lectura)').all().map(i => i.json).filter(l => l && l.id).map(l => {
  const j = m2o(l.journal_id);
  return { j, id: l.id, move: m2o(l.move_id), pago: m2o(l.payment_id) || null, f: String(l.date).slice(0, 10),
    m: Math.round(Number(j === 75 ? l.amount_currency : l.balance) * 100) / 100 };
});
return [{ json: { odoo: lineas, n_odoo: lineas.length, leido_at: new Date().toISOString() } }];
