#!/usr/bin/env node
// ═══ L2 · Consolidación de etapas 12 → 5 + tags por cliente (#131 dec.1) ═══
//
//   node lote-2-etapas.js --dry-run    (default)
//   node lote-2-etapas.js --write
//
// El mapping vive en lib/mapping.js (MAPPING_ETAPAS). Aquí solo se aplica.
//
// Orden: L2 corre DESPUÉS de L1 (CANCELADO ya archivado, así no se remapea nada
// que de todos modos iba a salir del pipeline) y ANTES de L3 (para que los 2 de
// "Ganado - Con PO" se fusionen y se archiven junto con el resto de ganados).
//
// Las etapas que quedan vacías se ARCHIVAN (active=false), nunca se borran.

'use strict';

const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');

async function main() {
  const opts = parseArgs(process.argv);
  log('═══ L2 · Consolidación de etapas ═══');
  log(`modo: ${opts.write ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)'}`);

  const odoo = await conectar();

  const etapas = await odoo.searchRead('crm.stage', [], ['id', 'name', 'sequence', 'is_won']);
  const problemas = M.verificarEtapas(etapas);
  if (problemas.length) {
    log('⚠ Las etapas de Odoo ya no son las que asume el mapping:');
    problemas.forEach((p) => log(`   - ${p}`));
    throw new Error('Abortado: revisa lib/mapping.js contra Odoo antes de continuar.');
  }

  const leads = await odoo.searchRead('crm.lead', [['active', '=', true]],
    ['id', 'name', 'stage_id', 'partner_id']);

  // Agrupa los movimientos por (origen → destino) para escribir en lote.
  const movimientos = new Map();
  const tags = new Map();
  for (const lead of leads) {
    const origenId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
    const regla = M.MAPPING_ETAPAS[origenId];
    if (!regla || !regla.destino) continue;             // CANCELADO: lo consume L1
    if (regla.destino.id === origenId) continue;        // ya está en su destino
    const clave = `${origenId}→${regla.destino.id}`;
    if (!movimientos.has(clave)) {
      movimientos.set(clave, { origenId, origen: M.ETAPAS_ODOO[origenId].name,
        destino: regla.destino, razon: regla.razon, ids: [] });
    }
    movimientos.get(clave).ids.push(lead.id);
    if (regla.tag) {
      if (!tags.has(regla.tag)) tags.set(regla.tag, []);
      tags.get(regla.tag).push(lead.id);
    }
  }

  log('\nMovimientos de etapa propuestos:');
  let total = 0;
  for (const m of movimientos.values()) {
    log(`  ${m.origen} → ${m.destino.name}: ${m.ids.length} leads`);
    log(`      razón: ${m.razon}`);
    total += m.ids.length;
  }
  log(`  ── total remapeado: ${total} leads`);

  log('\nTags por cliente a aplicar (absorben las variantes de etapa):');
  for (const [tag, ids] of tags) log(`  "${tag}": ${ids.length} leads`);

  log('\nEtapas a archivar tras el remapeo (active=false, nunca unlink):');
  M.ETAPAS_A_ARCHIVAR.forEach((id) => log(`  ${id} · ${M.ETAPAS_ODOO[id].name}`));

  log('\nEtapas finales (5) + el mecanismo lost de L1:');
  Object.values(M.ETAPAS_DESTINO).forEach((e) =>
    log(`  seq ${e.sequence} · ${e.name}${e.is_won ? '  [is_won]' : ''}`));

  const conPo = movimientos.get('4→8');
  if (conPo) {
    log(`\n⚠ Nota: "${M.ETAPAS_ODOO[4].name}" NO tiene is_won hoy, así que sus ` +
        `${conPo.ids.length} leads no contaban como ganados en ningún reporte nativo. ` +
        'Al fusionarse a "Proyecto Ganado" (is_won) pasan a contar.');
  }

  if (!opts.write) { log('\nDRY-RUN: nada se escribió a Odoo.'); return; }

  // ── Escritura real ──
  for (const m of movimientos.values()) {
    await odoo.write('crm.lead', m.ids, { stage_id: m.destino.id });
    for (const id of m.ids) {
      await odoo.notaChatter('crm.lead', id,
        `${M.MARCA_CHATTER} L2: etapa "${m.origen}" → "${m.destino.name}". ${m.razon}`);
    }
    log(`  ✓ ${m.origen} → ${m.destino.name}: ${m.ids.length}`);
  }

  // Tags: crm.tag no es legible por el MCP (fuera de allowlist), pero la
  // credencial de n8n/XML-RPC sí lo alcanza. get-or-create por nombre.
  for (const [nombre, ids] of tags) {
    let tag = await odoo.searchRead('crm.tag', [['name', '=', nombre]], ['id']);
    const tagId = tag.length ? tag[0].id : await odoo.create('crm.tag', { name: nombre });
    await odoo.write('crm.lead', ids, { tag_ids: [[4, tagId]] });  // 4 = link, no reemplaza
    log(`  ✓ tag "${nombre}" (id ${tagId}) aplicado a ${ids.length} leads`);
  }

  // Archivar etapas vacías, verificando que de verdad quedaron vacías.
  for (const id of M.ETAPAS_A_ARCHIVAR) {
    const restantes = await odoo.searchRead('crm.lead',
      [['active', '=', true], ['stage_id', '=', id]], ['id']);
    if (restantes.length) {
      log(`  ⚠ etapa ${id} "${M.ETAPAS_ODOO[id].name}" aún tiene ${restantes.length} leads activos: NO se archiva.`);
      continue;
    }
    await odoo.write('crm.stage', [id], { active: false });
    log(`  ✓ etapa ${id} "${M.ETAPAS_ODOO[id].name}" archivada`);
  }

  // Resecuenciar las 5 que quedan para que el kanban lea de izquierda a derecha.
  for (const e of Object.values(M.ETAPAS_DESTINO)) {
    await odoo.write('crm.stage', [e.id], { sequence: e.sequence });
  }
  log('✓ secuencias de las 5 etapas finales reescritas.');
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
