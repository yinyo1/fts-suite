#!/usr/bin/env node
// ═══ L1 · CANCELADO → lost + archivar (#131) ═══
//
//   node lote-1-cancelado-lost.js --dry-run     (default)
//   node lote-1-cancelado-lost.js --write
//
// 1,173 leads viven en la etapa "CANCELADO" en vez de estar marcados como
// perdidos. En Odoo "perdido" NO es una etapa: es `active=false` + `lost_reason_id`.
// Por eso este lote no remapea etapa — marca lost y archiva.
//
// ⚠ Requiere un crm.lost.reason llamado como M.LOST_REASON_NOMBRE. Hoy NO existe
// (los 16 motivos actuales son de negocio: "Muy caro", "No confian en FTS"...).
// Este es el ÚNICO create de toda la limpieza y se hace una sola vez.

'use strict';

const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');

const ETAPA_CANCELADO = 9;

async function main() {
  const opts = parseArgs(process.argv);
  log('═══ L1 · CANCELADO → lost + archivar ═══');
  log(`modo: ${opts.write ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)'}`);

  const odoo = await conectar();

  // Guardarraíl: si las etapas cambiaron desde el 29-ago, abortar.
  const etapas = await odoo.searchRead('crm.stage', [], ['id', 'name', 'sequence', 'is_won']);
  const problemas = M.verificarEtapas(etapas);
  if (problemas.length) {
    log('⚠ Las etapas de Odoo ya no son las que asume el mapping:');
    problemas.forEach((p) => log(`   - ${p}`));
    throw new Error('Abortado: revisa lib/mapping.js contra Odoo antes de continuar.');
  }

  const leads = await odoo.searchRead('crm.lead',
    [['active', '=', true], ['stage_id', '=', ETAPA_CANCELADO]],
    ['id', 'name', 'partner_id', 'x_studio_dndole', 'create_date']);
  log(`\nLeads activos en CANCELADO: ${leads.length}`);
  log('Cambio propuesto por lead:');
  log(`  · lost_reason_id → "${M.LOST_REASON_NOMBRE}"`);
  log('  · active         → false  (archivar, NUNCA unlink)');
  log(`  · nota chatter   → "${M.MARCA_CHATTER} L1 ..."`);
  log('\nMuestra de 5:');
  leads.slice(0, 5).forEach((l) => log(`  ${l.id} · ${l.name} · ${l.partner_id ? l.partner_id[1] : '(sin cuenta)'}`));

  if (!opts.write) { log('\nDRY-RUN: nada se escribió a Odoo.'); return; }

  // ── Escritura real ──
  let motivo = await odoo.searchRead('crm.lost.reason', [['name', '=', M.LOST_REASON_NOMBRE]], ['id']);
  let motivoId;
  if (motivo.length) {
    motivoId = motivo[0].id;
    log(`motivo de pérdida existente: id ${motivoId}`);
  } else {
    motivoId = await odoo.create('crm.lost.reason', { name: M.LOST_REASON_NOMBRE });
    log(`motivo de pérdida CREADO: id ${motivoId}`);
  }

  const ids = leads.map((l) => l.id);
  const LOTE = 200;
  for (let i = 0; i < ids.length; i += LOTE) {
    const trozo = ids.slice(i, i + LOTE);
    // action_set_lost marca lost_reason + archiva en un solo paso nativo.
    await odoo.ejecutar('crm.lead', 'action_set_lost', [trozo], { lost_reason_id: motivoId });
    log(`  lote ${i / LOTE + 1}: ${trozo.length} leads`);
  }

  // Read-back obligatorio: el write que no falla NO prueba que quedó (CLAUDE.md §9).
  const quedanActivos = await odoo.searchRead('crm.lead',
    [['active', '=', true], ['stage_id', '=', ETAPA_CANCELADO]], ['id']);
  log(`\n✓ Read-back: quedan ${quedanActivos.length} activos en CANCELADO (esperado 0).`);
  if (quedanActivos.length) throw new Error('El archivado no quedó completo. Revisar antes de seguir.');

  for (const l of leads) {
    await odoo.notaChatter('crm.lead', l.id,
      `${M.MARCA_CHATTER} L1: estaba en etapa CANCELADO → marcada como perdida ` +
      `(motivo "${M.LOST_REASON_NOMBRE}") y archivada. Reversible con el dump pre-limpieza.`);
  }
  log(`✓ ${leads.length} notas de chatter escritas.`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
