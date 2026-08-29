#!/usr/bin/env node
// ═══ L5 · Depurar el selection x_studio_dndole (#131 dec.6) ═══
//
//   node lote-5-selection-dndole.js --dry-run    (default y único modo)
//
// Este lote NO escribe: las opciones de un selection de Studio viven en
// `ir.model.fields.selection`, la capa meta de Odoo. Tocarla por RPC es
// exactamente el tipo de cambio que rompe en silencio (y CLAUDE.md §9 ya
// documenta un caso donde el ORM descartó campos sin avisar). Además el MCP
// tiene la capa meta en denylist, así que ni siquiera se puede leer para verificar.
//
// Salida: el instructivo EXACTO para que Esteban lo aplique en Studio, más el
// guardarraíl de que ningún lead vivo siga usando un valor que se va a quitar.

'use strict';

const M = require('./lib/mapping');
const { conectar, parseArgs, log } = require('./lib/odoo-client');

// Los 5 usuarios iniciales del login comercial (#131 dec.4).
const USUARIOS_1_0 = ['Esteban', 'Aldo Mendez', 'Montalvo', 'Ricardo', 'Pablo'];

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.write) {
    throw new Error('L5 no tiene modo escritura: el selection de Studio se edita en la UI. ' +
                    'Este script produce el instructivo y verifica que sea seguro aplicarlo.');
  }
  log('═══ L5 · Depuración del selection "Dándole" ═══');

  const odoo = await conectar();

  // Valores realmente en uso, separando vivos de archivados.
  const vivos = await odoo.ejecutar('crm.lead', 'read_group',
    [[['active', '=', true]], ['id'], ['x_studio_dndole']], { lazy: false });
  const todos = await odoo.ejecutar('crm.lead', 'read_group',
    [[['active', 'in', [true, false]]], ['id'], ['x_studio_dndole']], { lazy: false });

  const enUsoVivo = new Map(vivos.map((g) => [g.x_studio_dndole || '(vacío)', g.__count]));
  const enUsoTotal = new Map(todos.map((g) => [g.x_studio_dndole || '(vacío)', g.__count]));

  log('\nValores en uso (vivos / incluyendo archivados):');
  for (const [v, n] of enUsoTotal) log(`  ${String(v).padEnd(16)} ${String(enUsoVivo.get(v) || 0).padStart(5)} / ${n}`);

  const exftsVivos = M.EXFTS_DNDOLE.filter((v) => (enUsoVivo.get(v) || 0) > 0);
  log('\n── Guardarraíl ──');
  if (exftsVivos.length) {
    log(`⚠ Estos valores de ex-FTS SIGUEN en leads vivos: ${exftsVivos.join(', ')}`);
    log('  L5 no debe aplicarse antes que L1, L3 y L4: si se quita la opción del');
    log('  selection mientras un lead vivo la usa, el registro queda con un valor');
    log('  huérfano que la UI no sabe pintar.');
  } else {
    log('✓ Ningún lead vivo usa valores de ex-FTS. Es seguro depurar el selection.');
  }
  log('  (Los leads ARCHIVADOS conservan el valor viejo a propósito: es su historia.');
  log('   Por eso las opciones se quitan del selector, pero el dato archivado no se toca.)');

  log('\n── Instructivo para Esteban (Odoo → Studio → crm.lead → campo "Dándole") ──');
  log('\n  QUITAR estas opciones (personas que ya no están en FTS):');
  M.EXFTS_DNDOLE.forEach((v) => log(`    − ${v}   (${enUsoTotal.get(v) || 0} leads históricos conservan el valor)`));
  log('\n  CONSERVAR / AGREGAR (los 5 usuarios de 1.0, #131 dec.4):');
  USUARIOS_1_0.forEach((v) => {
    const n = enUsoTotal.get(v) || 0;
    log(`    ${n > 0 ? '✓ ya existe' : '+ AGREGAR   '} ${v}${n > 0 ? `   (${n} leads)` : ''}`);
  });
  const otros = [...enUsoTotal.keys()].filter(
    (v) => v !== '(vacío)' && !M.EXFTS_DNDOLE.includes(v) && !USUARIOS_1_0.includes(v));
  if (otros.length) {
    log('\n  DECIDIR (en uso pero fuera de la lista de los 5):');
    otros.forEach((v) => log(`    ? ${v}   (${enUsoTotal.get(v)} leads)`));
  }

  log('\nSUPUESTO: el selection puede tener opciones NO usadas por ningún lead que');
  log('este script no ve (la capa meta de Odoo no es legible por RPC acotado).');
  log('Al abrir Studio, comparar la lista real contra este instructivo.');
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
