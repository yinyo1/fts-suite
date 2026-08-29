#!/usr/bin/env node
// ═══ L7 · Leads de "Usuario Taqueria JMZ" y sin user_id (#131) ═══
//
//   node lote-7-usuarios-huerfanos.js --dry-run    (default y ÚNICO modo permitido hoy)
//
// El issue es explícito: "proponer destino, NO mover sin aprobación". Este lote
// no tiene rama de escritura a propósito — si en el futuro se aprueba un destino,
// se agrega aquí con su propia decisión escrita.

'use strict';

const { conectar, parseArgs, log } = require('./lib/odoo-client');

const USUARIO_TAQUERIA = 16;
const ETAPAS_TERMINALES = [9, 8, 4]; // las consumen L1 y L3

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.write) throw new Error('L7 no tiene modo escritura: el issue #131 pide proponer, no mover.');
  log('═══ L7 · Usuarios huérfanos (solo diagnóstico) ═══');

  const odoo = await conectar();

  for (const [etiqueta, dominio] of [
    ['Usuario Taqueria JMZ', [['user_id', '=', USUARIO_TAQUERIA]]],
    ['Sin user_id',          [['user_id', '=', false]]],
  ]) {
    const todos = await odoo.searchRead('crm.lead', [['active', '=', true], ...dominio],
      ['id', 'name', 'stage_id', 'partner_id', 'x_studio_dndole', 'create_date']);
    const vivos = todos.filter((l) => {
      const s = Array.isArray(l.stage_id) ? l.stage_id[0] : l.stage_id;
      return !ETAPAS_TERMINALES.includes(s);
    });

    log(`\n── ${etiqueta} ──`);
    log(`  activos hoy: ${todos.length}`);
    log(`  de esos, en etapas terminales (los archivan L1/L3): ${todos.length - vivos.length}`);
    log(`  RESIDUO VIVO que requiere decisión: ${vivos.length}`);
    vivos.slice(0, 10).forEach((l) => log(
      `    ${l.id} · ${l.name} · ${l.partner_id ? l.partner_id[1] : '(sin cuenta)'} · ` +
      `${Array.isArray(l.stage_id) ? l.stage_id[1] : l.stage_id} · dándole: ${l.x_studio_dndole || '(vacío)'}`));
  }

  log('\nPropuesta (requiere aprobación explícita de Esteban antes de ejecutarse):');
  log('  a) El residuo vivo es chico: revisarlo a mano en la primera revisión semanal.');
  log('  b) "Usuario Taqueria JMZ" (res.users 16) parece un usuario ajeno al negocio:');
  log('     si se confirma, desactivarlo en Odoo evita que reciba leads nuevos.');
  log('  c) Los leads sin user_id no estorban: la atribución real de 1.0 vive en');
  log('     x_studio_dndole, no en user_id (el diseño es un solo usuario Odoo).');
  log('\nNada se escribió: este lote es solo diagnóstico.');
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
