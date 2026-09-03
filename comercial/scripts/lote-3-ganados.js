#!/usr/bin/env node
// ═══ L3 · Archivar los "Proyecto Ganado" activos (#131 dec.3) ═══
//
//   node lote-3-ganados.js --dry-run    (default)
//   node lote-3-ganados.js --write
//
// La hoja del CRM solo muestra pipeline VIVO. Un ganado ya cerró su ciclo
// comercial: sigue existiendo (archivado, recuperable) pero deja de contaminar
// la vista y los conteos por etapa.
//
// Orden importante: L3 corre DESPUÉS de L2, para que los 2 leads de
// "Proyecto Ganado - Con PO" ya estén fusionados en "Proyecto Ganado" y se
// archiven en el mismo lote (hoy esa etapa ni siquiera tiene is_won).

'use strict';

const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');

const ETAPAS_GANADO = [8, 4]; // 8 Proyecto Ganado · 4 Proyecto Ganado - Con PO

async function main() {
  const opts = parseArgs(process.argv);
  log('═══ L3 · Archivar ganados ═══');
  log(`modo: ${opts.write ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)'}`);

  const odoo = await conectar();
  const leads = await odoo.searchRead('crm.lead',
    [['active', '=', true], ['stage_id', 'in', ETAPAS_GANADO]],
    ['id', 'name', 'partner_id', 'stage_id', 'x_studio_dndole', 'expected_revenue']);

  const porEtapa = {};
  leads.forEach((l) => {
    const k = Array.isArray(l.stage_id) ? l.stage_id[1] : l.stage_id;
    porEtapa[k] = (porEtapa[k] || 0) + 1;
  });

  log(`\nLeads ganados activos: ${leads.length}`);
  Object.entries(porEtapa).forEach(([k, v]) => log(`  ${k}: ${v}`));
  log('\nCambio propuesto: active → false (archivar). NO se toca stage_id ni dndole.');
  log('\nMuestra de 5:');
  leads.slice(0, 5).forEach((l) => log(`  ${l.id} · ${l.name} · ${l.partner_id ? l.partner_id[1] : '(sin cuenta)'}`));

  if (!opts.write) { log('\nDRY-RUN: nada se escribió a Odoo.'); return; }

  const ids = leads.map((l) => l.id);
  const LOTE = 200;
  for (let i = 0; i < ids.length; i += LOTE) {
    const trozo = ids.slice(i, i + LOTE);
    await odoo.write('crm.lead', trozo, { active: false });
    log(`  lote ${i / LOTE + 1}: ${trozo.length} leads`);
  }

  const quedan = await odoo.searchRead('crm.lead',
    [['active', '=', true], ['stage_id', 'in', ETAPAS_GANADO]], ['id']);
  log(`\n✓ Read-back: quedan ${quedan.length} ganados activos (esperado 0).`);
  if (quedan.length) throw new Error('El archivado no quedó completo.');

  for (const l of leads) {
    await odoo.notaChatter('crm.lead', l.id,
      `${M.MARCA_CHATTER} L3: proyecto ganado archivado (cierre de ciclo comercial). ` +
      'Sigue existiendo y es recuperable; solo sale del pipeline vivo.');
  }
  log(`✓ ${leads.length} notas de chatter escritas.`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
