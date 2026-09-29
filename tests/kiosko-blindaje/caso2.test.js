// tests/kiosko-blindaje/caso2.test.js
//
// Caso 2: salida con SO11855 del 28-sep-2026. Cuatro fallas reproducibles:
//   1. llave foránea inválida en el campo de SO (x_studio_sales_order_2 = id de proyecto)
//   2. auto-rescates simultáneos con choque de sha en el almacén de incidencias
//   3. olvido de salida "05:02" interpretado como 5 am del día siguiente
//   4. ajuste de RH a un auto-cierre que no se aplica en Odoo
//
// Demuestra que HOY falla, que el diseño completo (B1..B13) pasa, mide el árbol de falla
// quitando una pieza a la vez, y corre la aceptación de los bloques nuevos.
//
// Run: node tests/kiosko-blindaje/caso2.test.js [--narrar]
// Sale en 1 si el caso deja de reproducirse, si el diseño nuevo viola algo, si un bloque
// construido regresiona o si el escenario de un bloque pendiente ya no falla.

'use strict';

const { correrCaso2, correrBloque, POR_BLOQUE_CASO2, TODOS, con, invariantesCaso2, E } = require('./caso2');
const { cst } = require('./odoo-modelo');
const { H } = require('./sistema');
const cfg = require('./bloques.json');

let ok = 0, fallo = 0;
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fallo++; console.log('  ✗ ' + nombre + (detalle ? '\n      ' + detalle : '')); }
}
// Las invariantes de estado (I10 a I12) se miden al final; las de acción, durante.
const { finales } = require('./caso2');
function porInv(vs) { const r = {}; vs.forEach(v => { r[v.inv] = (r[v.inv] || 0) + 1; }); return r; }
const reg = (m, id) => m.sim.odoo.leer(id);
const horas = r => r && r.check_out != null ? (r.check_out - r.check_in) / H : null;
// Una salida del lunes "llegó" si el registro cerró a menos de 10 min de la hora en que el
// empleado quiso salir (por la salida normal o por un olvido declarado esa tarde).
const SIETE = E.filter(x => x.emp !== 131);
function salidasGuardadas(m) {
  return SIETE.filter(x => { const r = reg(m, x.att); const quiso = cst(2026, 9, 28, ...x.sale);
    return r && r.check_out != null && Math.abs(r.check_out - quiso) <= 10 * 60 * 1000; }).length;
}

// ─── 1. HOY ─────────────────────────────────────────────────────────────────
console.log('\n=== Caso 2, diseño de HOY (versión feb04c42 hasta el hotfix de las 06:53 CST) ===');
const hoy = correrCaso2(con([]));
if (process.argv.includes('--narrar')) console.log(hoy.narrar());
const vh = finales(hoy), ph = porInv(vh);
const FK = 'insert or update on table "hr_attendance" violates foreign key constraint "hr_attendance_x_studio_many2one_field_gHzp7_fkey"';
const erroresFk = hoy.sim.odoo.log.filter(x => x.error === FK);
t('la salida con SO11855 falla por llave foránea, con el mismo texto que producción (' + erroresFk.length + ' veces)', erroresFk.length >= 8);
t('ninguna de las 7 salidas del lunes llega a Odoo con su hora', salidasGuardadas(hoy) === 0, 'llegaron ' + salidasGuardadas(hoy));
const r57 = reg(hoy, 15734);
t('"05:02" deja a hr.employee 57 con 22.16 h (producción: 22.16 h)', r57 && Math.abs(horas(r57) - 22.16) < 0.01, 'horas: ' + (r57 && horas(r57)));
const r79 = reg(hoy, 15737);
t('hr.employee 79: TAG de disputa apuntando a una incidencia que no existe (fantasma)', r79 && r79.disputa && !hoy.sim.incidencias.some(i => i.id === r79.incidencia));
const r131 = reg(hoy, 15729);
t('Confirmar Horas hacia SO11855 falla por la misma llave (el hotfix del kiosko no lo tocó)', hoy.pasos.some(x => x.p.tipo === 'ch' && x.p.so === 2382 && x.res.panel === 'error'));
t('Confirmar Horas hacia SO11547 graba 2302 en el campo de SO: SO2286 de 2022, en silencio', hoy.pasos.some(x => x.p.tipo === 'ch' && x.p.so === 2302 && x.res.panel === 'aplicada'));
for (const i of ['I2', 'I3', 'I6', 'I8', 'I10', 'I11', 'I12']) t(i + ' violada (' + (ph[i] || 0) + ')', (ph[i] || 0) > 0);

// ─── 2. Diseño nuevo ────────────────────────────────────────────────────────
console.log('\n=== Caso 2, diseño nuevo (B1..B13) ===');
const nuevo = correrCaso2(con(TODOS));
const vn = finales(nuevo);
t('ninguna invariante violada', vn.length === 0, vn.map(v => v.inv + ': ' + v.msg).join('\n      '));
t('la salida del lunes queda con proyecto 2382 y SO 12054', (() => { const r = reg(nuevo, 15728); return r && r.proyecto === 2382 && r.so2 === 12054 && r.check_out != null; })());

// ─── 3. Árbol de falla: quitar una pieza a la vez ───────────────────────────
console.log('\n=== Árbol de falla del caso 2 (una pieza a la vez) ===');
const variantes = [
  ['nada (lo que pasó)', []],
  ['Q1 · B11: el id del proyecto nunca va al campo de SO', ['B11']],
  ['Q2 · B1: la falla se ve y el empleado declara su salida esa tarde', ['B1']],
  ['Q3 · B9: guarda AM/PM en olvidé salida', ['B9']],
  ['Q4 · B12: el PUT del almacén reintenta con sha fresco', ['B12']],
  ['Q5 · B4: resolver aplica la hora de RH al auto-cierre', ['B4']]
];
const arbol = {};
console.log('  ' + ['pieza quitada'.padEnd(58), 'salidas', '   57 h', 'fantasma', 'I6', 'SO mala'].join(' | '));
for (const [nombre, bloques] of variantes) {
  const m = correrCaso2(con(bloques));
  const v = porInv(finales(m));
  const r = reg(m, 15734);
  const h57 = horas(r) == null ? 'abierto' : horas(r).toFixed(2);
  console.log('  ' + [nombre.padEnd(58), String(salidasGuardadas(m)).padStart(3) + '/7', h57.padStart(7), v.I11 ? 'sí' : 'no', v.I6 ? 'sí' : 'no', v.I10 ? 'sí' : 'no'].join(' | '));
  arbol[bloques.join('') || 'hoy'] = { salidas: salidasGuardadas(m), h57, v };
}

t('Q1 (B11) sola evita todo el caso: 7 de 7 salidas, 57 en 10.16 h, sin fantasma', arbol.B11.salidas === 7 && arbol.B11.h57 === '10.16' && !arbol.B11.v.I11);
t('B9 (refinada: la hora confirmada no cae en el límite de 12 h) deja a 57 en 10.16 h', arbol.B9.h57 === '10.16', 'horas: ' + arbol.B9.h57);

// ─── 4. Aceptación de bloques del caso 2 ────────────────────────────────────
console.log('\n=== Aceptación de bloques del caso 2 ===');
let pend = 0, regr = 0, sosp = 0, pasan = 0;
for (const b of Object.keys(POR_BLOQUE_CASO2)) {
  const esc = POR_BLOQUE_CASO2[b];
  const construido = cfg[b] && cfg[b].construido;
  const construidos = Object.keys(cfg).filter(k => cfg[k] && cfg[k].construido);
  const req = (cfg[b] && cfg[b].requiere) || [];
  const sin = correrBloque(b, con(construidos.filter(x => x !== b)));
  const conB = correrBloque(b, con(construidos.concat([b], req)));
  const etiqueta = b + ' ' + esc.titulo + ' [' + esc.inv.join(', ') + ']';
  if (construido) {
    if (conB.length === 0) { pasan++; console.log('  ✓ PASA       ' + etiqueta); }
    else { regr++; console.log('  ✗ REGRESIÓN  ' + etiqueta + '\n      ' + conB.map(v => v.inv + ': ' + v.msg).join('\n      ')); }
  } else if (sin.length > 0 && conB.length === 0) {
    pend++; console.log('  · PENDIENTE  ' + etiqueta + '  (falla hoy: ' + sin[0].inv + ' ' + sin[0].msg + '; pasa con ' + b + ')');
  } else {
    sosp++; console.log('  ? SOSPECHOSO ' + etiqueta + '  (sin ' + b + ': ' + sin.length + ' violaciones; con ' + b + ': ' + conB.length + ')');
  }
}
console.log('  ' + pasan + ' pasan · ' + pend + ' pendientes · ' + regr + ' regresiones · ' + sosp + ' sospechosos');

console.log('\n' + ok + ' ✓   ' + fallo + ' ✗');
process.exit(fallo || regr || sosp ? 1 : 0);
