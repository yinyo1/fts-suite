#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * GATE DE CONTRATO · fin/rentabilidad-motor · issue #332 pendiente 4
 *
 *   node tests/rentabilidad/gate-contrato.js <salida-del-motor.json>
 *
 * Compara la salida del motor contra `golden-pre-extension.json` y verifica
 * que el CONTRATO 1 siga intacto. Corre ANTES y DESPUÉS de cada cambio al
 * motor. Sin gate verde no se publica.
 *
 * LA LÍNEA QUE SEPARA LO DURO DE LO TOLERADO — y por qué:
 *
 *   DURO (rompe el gate): la FORMA. Nombres de campo, tipos, `columnas` al
 *   pie de la letra, los códigos de salvedad, los enums, y las identidades
 *   aritméticas. Nada de esto puede cambiar sin que alguien lo haya decidido:
 *   si cambia, el panel truena o miente.
 *
 *   TOLERADO (avisa, no rompe): los VALORES que Odoo mueve solo. El conteo de
 *   proyectos sube cuando Comercial confirma una SO; los montos suben cuando
 *   Eduardo concilia. Un gate que exija el mismo número que ayer sería un gate
 *   que sólo pasa el día que se escribió.
 *
 *   La excepción: un conteo puede moverse, pero NO puede volverse imposible.
 *   `completo + parcial + sin_presupuesto === total` no es un valor, es una
 *   identidad, y por eso va del lado duro.
 *
 * Extensión ADITIVA: el gate exige que los campos del golden ESTÉN; no prohíbe
 * que haya nuevos. Así el mismo gate sirve antes y después de la extensión.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');

const GOLDEN = path.join(__dirname, 'golden-pre-extension.json');
const argv = process.argv.slice(2);
if (!argv[0]) { console.error('uso: gate-contrato.js <salida-del-motor.json>'); process.exit(2); }

const g = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
let raw = JSON.parse(fs.readFileSync(argv[0], 'utf8'));
/* acepta el sobre pelado, o una ejecución de n8n completa */
const sobre = raw.data
  ? raw.data.resultData.runData['Code - armar respuesta'][0].data.main[0][0].json
  : raw;

/* Un sobre sin `datos` no es un sobre: se dice y se sale, en vez de crashear
   con un TypeError que no explica nada. Pasó al probar el gate contra el propio
   golden, que tiene otra forma a propósito. */
if (!sobre || typeof sobre !== 'object' || !sobre.datos) {
  console.error('✗ el archivo no parece una salida del motor: no tiene `datos`.');
  console.error('  Se espera el sobre del contrato, o una ejecución de n8n completa.');
  process.exit(2);
}

let duros = 0, fallas = [], avisos = [];
const T_DRIFT = 0.15;   /* 15% de deriva tolerada en conteos y montos */

function ok(cond, msg, detalle) {
  duros++;
  if (!cond) fallas.push(msg + (detalle ? ('  →  ' + detalle) : ''));
}
function avisar(msg) { avisos.push(msg); }
function deriva(ahora, antes, que) {
  if (typeof antes !== 'number' || typeof ahora !== 'number') return;
  if (antes === 0) return;
  const d = Math.abs(ahora - antes) / Math.abs(antes);
  if (d > T_DRIFT) avisar(que + ': ' + antes + ' → ' + ahora + '  (' + (d * 100).toFixed(1) + '% de deriva)');
}

/* ── 1 · forma del sobre ─────────────────────────────────────────────────── */
g.sobre_claves.forEach(k => ok(k in sobre, 'falta la clave del sobre `' + k + '`'));
g.datos_claves.forEach(k => ok(sobre.datos && (k in sobre.datos), 'falta `datos.' + k + '`'));
ok(sobre.contrato === g.contrato, 'contrato cambió de número', g.contrato + ' → ' + sobre.contrato);
ok(sobre.panel === g.panel, 'panel cambió de nombre');
ok(sobre.datos.moneda_presentacion === g.moneda_presentacion, 'cambió moneda_presentacion');
ok(sobre.ok === true, '`ok` no es true');

/* ── 2 · columnas, al pie de la letra ────────────────────────────────────── */
const cAhora = sobre.datos.columnas || [];
const porId = {}; cAhora.forEach(c => { porId[c.id] = c; });
g.columnas.forEach(c0 => {
  const c = porId[c0.id];
  ok(!!c, 'desapareció la columna `' + c0.id + '`');
  if (!c) return;
  ['label', 'kind', 'agrupable', 'suma'].forEach(p =>
    ok(c[p] === c0[p], 'la columna `' + c0.id + '` cambió `' + p + '`',
       JSON.stringify(c0[p]) + ' → ' + JSON.stringify(c[p])));
});

/* ── 3 · salvedades: los códigos del golden siguen existiendo ────────────── */
const codAhora = (sobre.salvedades || []).map(s => s.codigo);
g.salvedades_codigos.forEach(c => ok(codAhora.indexOf(c) >= 0, 'desapareció la salvedad `' + c + '`'));
(sobre.salvedades || []).forEach(s => {
  ok(typeof s.codigo === 'string' && s.codigo.length > 0, 'salvedad sin código');
  ok(typeof s.dice === 'string' && s.dice.length > 10, 'salvedad `' + s.codigo + '` sin texto útil');
});

/* ── 4 · filas: forma y enums ────────────────────────────────────────────── */
const filas = sobre.datos.filas || [];
ok(Array.isArray(filas) && filas.length > 0, 'no hay filas');
const ESTADOS = ['completo', 'parcial', 'sin_presupuesto'];
const MONEDAS = ['MXN', 'USD'];
let malEstado = 0, malMoneda = 0, malMargen = 0, malPlaceholder = 0, faltanClaves = {};
filas.forEach(f => {
  g.fila_claves.forEach(k => { if (!(k in f)) faltanClaves[k] = (faltanClaves[k] || 0) + 1; });
  if (ESTADOS.indexOf(f.estado_dato) < 0) malEstado++;
  if (MONEDAS.indexOf(f.moneda) < 0) malMoneda++;
  /* identidad aritmética: el margen real ES ingreso menos costo */
  if (typeof f.margen_real === 'number' &&
      Math.abs(f.margen_real - (f.ingreso_real - f.costo_real)) > 0.01) malMargen++;
  /* D1: un presupuesto de |x|<=1 se cuenta como ausencia, así que jamás puede
     aparecer como base positiva de un porcentaje */
  ['ingreso_pres', 'costo_pres'].forEach(k => {
    const v = f[k];
    if (typeof v === 'number' && v !== 0 && Math.abs(v) <= 1) malPlaceholder++;
  });
  if (f.mxn) g.mxn_claves.forEach(k => { if (!(k in f.mxn)) faltanClaves['mxn.' + k] = 1; });
});
Object.keys(faltanClaves).forEach(k =>
  ok(false, 'falta la clave de fila `' + k + '`', 'en ' + faltanClaves[k] + ' filas'));
ok(malEstado === 0, 'estado_dato fuera del enum', malEstado + ' filas');
ok(malMoneda === 0, 'moneda fuera del enum', malMoneda + ' filas');
ok(malMargen === 0, 'margen_real != ingreso_real - costo_real', malMargen + ' filas');
ok(malPlaceholder === 0, 'un presupuesto de |x|<=1 se colo como base (D1)', malPlaceholder + ' casos');

/* ── 5 · resumen: identidades duras, valores tolerados ───────────────────── */
const r = sobre.datos.resumen || {};
Object.keys(g.resumen).forEach(k => ok(k in r, 'falta `resumen.' + k + '`'));
ok(r.completo + r.parcial + r.sin_presupuesto === r.total,
   'los estados del dato no suman el total',
   r.completo + '+' + r.parcial + '+' + r.sin_presupuesto + ' != ' + r.total);
ok(r.total === filas.length, 'resumen.total no coincide con filas.length',
   r.total + ' vs ' + filas.length);
if (typeof r.margen_real_mxn === 'number')
  ok(Math.abs(r.margen_real_mxn - (r.ingreso_real_mxn - r.costo_real_mxn)) < 0.01,
     'resumen: margen_real_mxn no es ingreso menos costo');
['total', 'completo', 'parcial', 'sin_presupuesto']
  .forEach(k => deriva(r[k], g.resumen[k], 'resumen.' + k));
/* CONTRATO 1.04 (#388) · `ingreso_real_mxn` y `costo_real_mxn` CAMBIARON DE
   DEFINICION: hasta 1.03 salian de `achieved_amount` del presupuesto, desde 1.04
   se suman directo de account.analytic.line. Compararlos contra el golden diria
   "356% de deriva de Odoo" cuando lo que se movio fue la regla, no los datos — un
   aviso que miente sobre su propia causa es peor que no tenerlo. Lo que SI es
   comparable con el golden es el campo que heredo la vieja definicion:
   `achieved_*_mxn`. Ahi la deriva vuelve a significar lo que decia. */
if (typeof r.achieved_ingreso_mxn === 'number') {
  deriva(r.achieved_ingreso_mxn, g.resumen.ingreso_real_mxn, 'resumen.achieved_ingreso_mxn (vs el ingreso_real de 1.03)');
  deriva(r.achieved_costo_mxn,   g.resumen.costo_real_mxn,   'resumen.achieved_costo_mxn (vs el costo_real de 1.03)');
} else {
  deriva(r.ingreso_real_mxn, g.resumen.ingreso_real_mxn, 'resumen.ingreso_real_mxn');
  deriva(r.costo_real_mxn,   g.resumen.costo_real_mxn,   'resumen.costo_real_mxn');
}

/* ── 5b · CONTRATO 1.04 (#388): lo que F2 y F3 agregaron, en DURO ─────────
 * Esto no es "campos nuevos que estaria bien tener": es la unica red que impide
 * que una sesion futura devuelva el costo real al `achieved` del presupuesto sin
 * que nada truene. El bug de #388 era invisible justo porque el contrato no
 * exigia nada de esto. Si el motor deja de traerlo, el gate se pone rojo. */
if (typeof r.achieved_costo_mxn === 'number') {
  const CLAVES_104 = ['ingreso_achieved', 'costo_achieved', 'gasto_fuera_presupuesto',
                      'fuera_desglose', 'lineas_reales', 'sin_gasto_atribuido'];
  const falta104 = {};
  let malFuera = 0, malDesglose = 0, malLineas = 0, malFlag = 0, nFlag = 0;
  filas.forEach(f => {
    CLAVES_104.forEach(k => { if (!(k in f)) falta104[k] = (falta104[k] || 0) + 1; });
    /* identidad: el gasto fuera del presupuesto ES el real menos lo que el
       presupuesto reconoce. Si deja de cumplirse, alguien lo calculo por otro
       lado y ya no se sabe contra que se esta comparando. */
    if (typeof f.gasto_fuera_presupuesto === 'number' &&
        typeof f.costo_real === 'number' && typeof f.costo_achieved === 'number' &&
        Math.abs(f.gasto_fuera_presupuesto - (f.costo_real - f.costo_achieved)) > 0.02) malFuera++;
    const fd = f.fuera_desglose;
    if (!fd || ['sin_rubro','rubro_sin_renglon','fuera_de_ventana','no_explicado']
               .some(k => typeof fd[k] !== 'number')) malDesglose++;
    const lr = f.lineas_reales;
    if (!lr || ['ingreso','costo','costo_sin_rubro'].some(k => typeof lr[k] !== 'number')) malLineas++;
    if (typeof f.sin_gasto_atribuido !== 'boolean') malFlag++;
    if (f.sin_gasto_atribuido === true) nFlag++;
  });
  Object.keys(falta104).forEach(k =>
    ok(false, 'falta la clave de fila del contrato 1.04 `' + k + '`', 'en ' + falta104[k] + ' filas'));
  ok(malFuera === 0, 'gasto_fuera_presupuesto != costo_real - costo_achieved', malFuera + ' filas');
  ok(malDesglose === 0, 'fuera_desglose incompleto (4 causas numericas)', malDesglose + ' filas');
  ok(malLineas === 0, 'lineas_reales incompleto (ingreso/costo/costo_sin_rubro)', malLineas + ' filas');
  ok(malFlag === 0, 'sin_gasto_atribuido no es booleano', malFlag + ' filas');
  /* CERO_NO_ES_DATO: el conteo del resumen tiene que ser el de las filas. Una
     lista que se vacia sola se lee como "ya no pasa" (regla 20 #18). */
  ok(r.sin_gasto_atribuido === nFlag, 'resumen.sin_gasto_atribuido no cuenta las filas marcadas',
     r.sin_gasto_atribuido + ' vs ' + nFlag);
  ok(r.gasto_fuera_con_presupuesto + r.gasto_fuera_sin_presupuesto === r.con_gasto_fuera_presupuesto,
     'el reparto con/sin presupuesto no suma el total de proyectos con gasto fuera',
     r.gasto_fuera_con_presupuesto + '+' + r.gasto_fuera_sin_presupuesto + ' != ' + r.con_gasto_fuera_presupuesto);
  ['REAL_DESDE_LINEAS', 'GASTO_FUERA_DEL_PRESUPUESTO', 'GASTO_SIN_RUBRO'].forEach(cod =>
    ok((sobre.salvedades || []).some(x => x && x.codigo === cod),
       'falta la salvedad del contrato 1.04 `' + cod + '`'));
  const sv = (sobre.salvedades || []).find(x => x && x.codigo === 'MARGEN_SUBESTIMA_COSTO');
  ok(!sv || (Array.isArray(sv.filas) && sv.filas.length === nFlag),
     'MARGEN_SUBESTIMA_COSTO no lista los proyectos sin gasto atribuido',
     sv ? ((sv.filas || []).length + ' vs ' + nFlag) : 'sin salvedad');
}

/* ── 6 · multi-moneda: ningún agregado del contrato mezcla monedas ───────── */
/* Los agregados del resumen llevan el sufijo _mxn por diseño. Cualquier campo
   agregado de dinero SIN moneda declarada en el nombre ni en un campo hermano
   es un candidato a mezcla, y el gate lo dice. */
const sospechosos = Object.keys(r).filter(k =>
  /monto|ingreso|costo|margen|bono|total_/.test(k) &&
  !/_mxn$|_usd$|_pct$/.test(k) && typeof r[k] === 'number' && k !== 'total');
ok(sospechosos.length === 0,
   'agregado de dinero sin moneda en el nombre (riesgo de mezclar MXN y USD)',
   sospechosos.join(', '));

/* ── 7 · solo lectura ───────────────────────────────────────────────────── */
ok(sobre._meta && sobre._meta.solo_lectura === true, '_meta.solo_lectura ya no es true');

/* ── informe ────────────────────────────────────────────────────────────── */
console.log('─── Gate de contrato · fin/rentabilidad-motor ───');
console.log('   golden: ejecución ' + g.execution_id + ' · ' + g.n_filas + ' filas');
console.log('   ahora : ' + filas.length + ' filas · contrato ' + sobre.contrato);
console.log('   ' + (duros - fallas.length) + '/' + duros + ' verificaciones duras');
if (avisos.length) {
  console.log('\n   avisos (deriva tolerada de Odoo, no rompen):');
  avisos.forEach(a => console.log('     · ' + a));
}
if (fallas.length) {
  console.log('\n   ✗ ROJO');
  fallas.forEach(f => console.log('     ✗ ' + f));
  process.exit(1);
}
console.log('\n   ✓ verde — el contrato 1 sigue intacto');
