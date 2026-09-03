#!/usr/bin/env node
// ═══ L4 · Reasignación de leads de ex-FTS (#131 dec.2) ═══
//
//   node lote-4-reasignacion.js --dry-run            (default: NO escribe)
//   node lote-4-reasignacion.js --write              (requiere ODOO_* en el entorno)
//   node lote-4-reasignacion.js --dry-run --fixture  (usa el JSON capturado, sin tocar Odoo)
//
// Universo REAL: los leads ex-FTS que están en etapas VIVAS. Los que están en
// CANCELADO o Proyecto Ganado los archivan L1 y L3 — reasignarlos sería trabajo
// tirado sobre registros que van a quedar fuera del pipeline.

'use strict';

const fs = require('fs');
const path = require('path');
const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');

const RAIZ = path.resolve(__dirname, '..');
const CSV = path.join(RAIZ, 'data', 'clientes-usuarios.csv');
const FIXTURE = path.join(RAIZ, 'data', 'l4-leads-vivos-exfts.json');

// Etapas terminales que consumen L1 (CANCELADO) y L3 (Ganado / Ganado-Con PO).
const ETAPAS_TERMINALES = [9, 8, 4];

async function obtenerLeads(opts) {
  if (opts.fixture) {
    const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    log(`fixture: ${f.leads.length} leads (capturados ${f._meta.generado})`);
    return f.leads;
  }
  const odoo = await conectar();
  return odoo.searchRead('crm.lead', [
    ['active', '=', true],
    ['x_studio_dndole', 'in', M.EXFTS_DNDOLE],
    ['stage_id', 'not in', ETAPAS_TERMINALES],
  ], ['id', 'name', 'partner_id', 'partner_name', 'stage_id', 'x_studio_dndole', 'user_id']);
}

function planear(leads, hoja) {
  const plan = [];
  for (const lead of leads) {
    // La cuenta se resuelve por partner_id (la cuenta real); partner_name es el
    // texto libre del lead y solo sirve de respaldo cuando no hay partner.
    const cuenta = lead.partner_id || lead.partner_name || '';
    const r = M.resolverDueno(cuenta, hoja);

    const accion = r.dueno
      ? { tipo: 'reasignar',
          cambios: { x_studio_dndole: M.DNDOLE_ODOO[r.dueno] } }
      : { tipo: 'a_revisar',
          cambios: { x_studio_dndole: false, stage_id: M.ETAPAS_DESTINO.REVISAR.id } };

    plan.push({
      id: lead.id,
      cuenta,
      etapa_actual: lead.stage_name || lead.stage_id,
      dndole_actual: lead.x_studio_dndole,
      dueno_nuevo: r.dueno,
      via: r.via,
      detalle: r.detalle,
      conflicto: r.conflicto,
      ...accion,
    });
  }
  return plan;
}

function reportar(plan) {
  const porVia = {};
  const porDueno = {};
  for (const p of plan) {
    porVia[p.via] = (porVia[p.via] || 0) + 1;
    const k = p.dueno_nuevo || '(sin dueño → Revisar)';
    porDueno[k] = (porDueno[k] || 0) + 1;
  }
  log(`\nTotal en el universo de L4: ${plan.length} leads`);
  log('\nPor vía de resolución:');
  for (const [k, v] of Object.entries(porVia).sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(18)} ${v}`);
  log('\nDestino por dueño:');
  for (const [k, v] of Object.entries(porDueno).sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(26)} ${v}`);

  const conflictos = plan.filter((p) => p.conflicto);
  if (conflictos.length) {
    log(`\n⚠ ${conflictos.length} con conflicto hoja-vs-cartera (requieren ojo de Esteban):`);
    for (const c of conflictos) log(`  lead ${c.id} · ${c.cuenta} → ${c.dueno_nuevo} · ${c.conflicto}`);
  }
  const revisar = plan.filter((p) => p.tipo === 'a_revisar');
  if (revisar.length) {
    log(`\n→ ${revisar.length} sin dueño resoluble (van a Revisar con dndole vacío):`);
    for (const r of revisar) log(`  lead ${r.id} · ${r.cuenta} · ${r.detalle}`);
  }
  return { porVia, porDueno, conflictos, revisar };
}

async function main() {
  const opts = parseArgs(process.argv);
  log('═══ L4 · Reasignación de leads ex-FTS ═══');
  log(`modo: ${opts.write ? 'ESCRITURA' : 'DRY-RUN (no escribe nada)'}`);

  const hoja = M.cargarHoja(fs.readFileSync(CSV, 'utf8'));
  log(`hoja 06_Clientes-Usuarios: ${hoja.size} cuentas distintas`);

  const leads = await obtenerLeads(opts);
  const plan = planear(leads, hoja);
  const resumen = reportar(plan);

  const salida = path.join(RAIZ, 'data', 'l4-plan.json');
  fs.writeFileSync(salida, JSON.stringify({
    _meta: { generado: new Date().toISOString(), modo: opts.write ? 'write' : 'dry-run', total: plan.length },
    plan,
  }, null, 1));
  log(`\nplan escrito en ${path.relative(RAIZ, salida)}`);

  if (!opts.write) { log('\nDRY-RUN: nada se escribió a Odoo.'); return; }

  // ── Escritura real (solo con --write y tras el "va" de Esteban) ──
  const odoo = await conectar();
  let ok = 0;
  for (const p of plan) {
    await odoo.write('crm.lead', [p.id], p.cambios);
    await odoo.notaChatter('crm.lead', p.id,
      `${M.MARCA_CHATTER} L4 reasignación: dándole "${p.dndole_actual}" (ex-FTS) → ` +
      `"${p.dueno_nuevo || '(vacío)'}" vía ${p.via}. ${p.detalle}`);
    ok += 1;
  }
  log(`\n✓ ${ok}/${plan.length} leads reasignados con nota en chatter.`);
  if (resumen.conflictos.length) log(`  (${resumen.conflictos.length} llevaban conflicto marcado en la nota)`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
