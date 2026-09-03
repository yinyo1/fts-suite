#!/usr/bin/env node
/**
 * transform-resolver-attid.js — ARREGLO DEL RESOLVER incidencias/resolver (Oc2ceMHX2O0L0y2X)
 *
 * Issue #137. Corrige el guard `limpiaTAG`, que exige `inc.attendance_id` — campo
 * que las incidencias `auto_cierre_pendiente` NO tienen (usan `attendance_id_cerrado`).
 * Resultado del bug: el TAG de disputa en Odoo nunca se limpia para ese tipo (0 de 64).
 *
 * SE CORRE EN LA LAPTOP DE ESTEBAN. Método §17 quirk 2 (PUT al API público).
 * El contenedor remoto de Claude Code no tiene la N8N_API_KEY y su proxy de salida
 * bloquea el dominio de n8n, así que el PUT no se puede hacer desde allá.
 *
 * DOS MODOS:
 *   node transform-resolver-attid.js build     cur.json  -> put_body.json + .esperado.json
 *   node transform-resolver-attid.js verify    rb.json   vs .esperado.json  (grita y aborta si algo no cuadra)
 *
 * El jsCode NUNCA se transcribe: se lee de cur.json y se modifica con regex validadas
 * por conteo de ocurrencias. Si un find no calza EXACTAMENTE una vez, aborta sin escribir.
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const NODO = 'Code - Aplicar accion';
const F_CUR = 'cur.json';
const F_PUT = 'put_body.json';
const F_RB = 'rb.json';
const F_ESP = '.esperado.json';

// settings que el schema del PUT ACEPTA. El resto se filtra (§17 quirk 2).
const SETTINGS_PERMITIDOS = ['executionOrder', 'timezone', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'saveExecutionProgress', 'saveManualExecutions',
  'executionTimeout', 'errorWorkflow'];

// settings que el PUT NO acepta y que n8n repone del lado del server.
// binaryMode/callerPolicy/timeSavedMode suelen venir en su default -> deben volver iguales.
// availableInMCP hoy está en `true`, que NO es su default -> es el que puede perderse.
const SETTINGS_FRAGILES = ['binaryMode', 'callerPolicy', 'timeSavedMode', 'availableInMCP'];

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const corto = (h) => h.slice(0, 16);

function morir(msg) {
  console.error('\n╔═══════════════════════════════════════════════════════════════');
  console.error('║  ✗ ABORTADO — no se escribió nada');
  console.error('╚═══════════════════════════════════════════════════════════════');
  console.error('   ' + msg + '\n');
  process.exit(1);
}

function leerJson(f) {
  if (!fs.existsSync(f)) morir('no existe ' + f + ' — ¿corriste el curl del GET?');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { morir('no se pudo parsear ' + f + ': ' + e.message); }
}

function sacarNodo(w) {
  if (!w || !Array.isArray(w.nodes)) morir('el JSON no trae `nodes` — ¿el GET devolvió un error en vez del workflow?');
  const n = w.nodes.find((x) => x.name === NODO);
  if (!n) morir('no se encontró el nodo "' + NODO + '"');
  if (!n.parameters || typeof n.parameters.jsCode !== 'string') morir('el nodo "' + NODO + '" no trae jsCode');
  return n;
}

// ───────────────────────────────── BUILD ─────────────────────────────────
function build() {
  const w = leerJson(F_CUR);
  const nodo = sacarNodo(w);
  const antes = nodo.parameters.jsCode;
  const shaAntes = sha(antes);

  // Regex con espacios flexibles: inmunes a diferencias de indentación.
  const RE1 = /\/\/ CALCULAR limpiaTAG[^\n]*\n\s*const limpiaTAG = esEstadoTerminal\(nuevoStatus\)\s*&&\s*!!inc\.attendance_id\s*&&\s*inc\.tag_disputa_activo === true;/;
  const RE2 = /attendance_id:\s*inc\.attendance_id \|\| null,/;

  const T1 = '// CALCULAR limpiaTAG — el id se resuelve con fallback:\n' +
    '// olvido_* traen attendance_id; auto_cierre_pendiente trae attendance_id_cerrado.\n' +
    'const attId = inc.attendance_id || inc.attendance_id_cerrado || null;\n' +
    'const limpiaTAG = esEstadoTerminal(nuevoStatus)\n' +
    '                  && !!attId\n' +
    '                  && inc.tag_disputa_activo === true;';
  const T2 = 'attendance_id: attId,';

  // §17: todo find se valida por conteo ANTES de reemplazar.
  const cuenta = (re) => (antes.match(new RegExp(re.source, 'g')) || []).length;
  const c1 = cuenta(RE1), c2 = cuenta(RE2);
  console.log('\n── conteo de ocurrencias (debe ser 1 y 1) ──');
  console.log('   guard limpiaTAG .......... ' + c1);
  console.log('   return attendance_id ..... ' + c2);
  if (c1 !== 1) morir('el guard limpiaTAG calzó ' + c1 + ' veces, no 1. ¿El workflow ya cambió?');
  if (c2 !== 1) morir('el return attendance_id calzó ' + c2 + ' veces, no 1. ¿El workflow ya cambió?');

  const despues = antes.replace(RE1, T1).replace(RE2, T2);

  // Guard final: debe quedar EXACTAMENTE 1 `inc.attendance_id` (el de la línea nueva del attId).
  // \b evita que `inc.attendance_id_cerrado` cuente (después de "id" viene "_", que es word char).
  const sueltos = (despues.match(/inc\.attendance_id\b/g) || []).length;
  if (sueltos !== 1) morir('quedaron ' + sueltos + ' referencias a inc.attendance_id (se esperaba 1, la del attId)');
  if (!despues.includes('inc.attendance_id_cerrado')) morir('el fallback a attendance_id_cerrado no quedó en el código');
  if (despues === antes) morir('el código quedó idéntico — el reemplazo no aplicó');

  nodo.parameters.jsCode = despues;
  const shaDespues = sha(despues);

  const st = {};
  for (const k of SETTINGS_PERMITIDOS) if (w.settings && w.settings[k] !== undefined) st[k] = w.settings[k];

  fs.writeFileSync(F_PUT, JSON.stringify({
    name: w.name, nodes: w.nodes, connections: w.connections, settings: st
  }));

  const fragilesAntes = {};
  for (const k of SETTINGS_FRAGILES) fragilesAntes[k] = w.settings ? w.settings[k] : undefined;

  fs.writeFileSync(F_ESP, JSON.stringify({
    shaAntes, shaDespues,
    active: w.active,
    triggerCount: w.triggerCount,
    fragilesAntes,
    settingsEnviados: st
  }, null, 2));

  console.log('\n── sha256 del jsCode ──');
  console.log('   ANTES ....... ' + shaAntes);
  console.log('   DESPUÉS ..... ' + shaDespues);
  console.log('\n── delta ──');
  console.log('   caracteres ... ' + antes.length + ' → ' + despues.length + '  (' +
    (despues.length - antes.length >= 0 ? '+' : '') + (despues.length - antes.length) + ')');
  console.log('   líneas ....... ' + antes.split('\n').length + ' → ' + despues.split('\n').length);
  console.log('\n── estado que se espera conservar tras el PUT ──');
  console.log('   active ............ ' + w.active);
  console.log('   triggerCount ...... ' + w.triggerCount);
  for (const k of SETTINGS_FRAGILES) console.log('   ' + (k + ' ').padEnd(18, '.') + ' ' + JSON.stringify(fragilesAntes[k]));
  console.log('\n✓ ' + F_PUT + ' listo (' + fs.statSync(F_PUT).size + ' bytes) · ' + F_ESP + ' guardado');
  console.log('  Ahora: PUT, luego el GET a ' + F_RB + ', luego `node ' + process.argv[1].split('/').pop() + ' verify`\n');
}

// ──────────────────────────────── VERIFY ────────────────────────────────
function verify() {
  const esp = leerJson(F_ESP);
  const w = leerJson(F_RB);
  const nodo = sacarNodo(w);
  const shaLeido = sha(nodo.parameters.jsCode);

  const filas = [];
  const ok = (t, d) => filas.push({ estado: 'OK', t, d });
  const fail = (t, d) => filas.push({ estado: 'FALLA', t, d });
  const warn = (t, d) => filas.push({ estado: 'AVISO', t, d });

  // 1. sha del jsCode
  if (shaLeido === esp.shaDespues) ok('sha256 del jsCode', 'coincide con el esperado (' + corto(shaLeido) + '…)');
  else if (shaLeido === esp.shaAntes) fail('sha256 del jsCode', 'sigue siendo el VIEJO — el PUT no se aplicó');
  else fail('sha256 del jsCode', 'no coincide con nada.\n         esperado ' + esp.shaDespues + '\n         leído    ' + shaLeido);

  // 2. el arreglo está presente en el código leído del server
  const cod = nodo.parameters.jsCode;
  if (cod.includes('inc.attendance_id_cerrado') && /&&\s*!!attId/.test(cod)) ok('el arreglo', 'attId con fallback presente en el server');
  else fail('el arreglo', 'NO se ve el fallback attendance_id_cerrado en el código del server');

  // 3. active
  if (w.active === true) ok('active', 'true');
  else fail('active', String(w.active) + ' — EL WORKFLOW QUEDÓ APAGADO. Reactivar a mano en la UI YA.');

  // 4. triggerCount
  if (w.triggerCount === undefined) warn('triggerCount', 'el API no lo devolvió en este GET (no es falla)');
  else if (w.triggerCount === esp.triggerCount) ok('triggerCount', String(w.triggerCount));
  else fail('triggerCount', esp.triggerCount + ' → ' + w.triggerCount);

  // 5. los 4 settings frágiles
  for (const k of SETTINGS_FRAGILES) {
    const a = esp.fragilesAntes[k], d = w.settings ? w.settings[k] : undefined;
    if (JSON.stringify(a) === JSON.stringify(d)) ok('settings.' + k, JSON.stringify(d));
    else if (k === 'availableInMCP') warn('settings.' + k, JSON.stringify(a) + ' → ' + JSON.stringify(d) +
      ' — solo afecta la lectura por MCP, NO la producción. Se vuelve a activar con el toggle de la UI.');
    else fail('settings.' + k, JSON.stringify(a) + ' → ' + JSON.stringify(d) + ' — esto SÍ afecta el runtime');
  }

  const fallas = filas.filter((f) => f.estado === 'FALLA');
  const avisos = filas.filter((f) => f.estado === 'AVISO');

  console.log('\n╔═══════════════════════════════════════════════════════════════');
  console.log('║  READ-BACK · incidencias/resolver (Oc2ceMHX2O0L0y2X)');
  console.log('╚═══════════════════════════════════════════════════════════════');
  for (const f of filas) {
    const icono = f.estado === 'OK' ? '  ✓' : (f.estado === 'AVISO' ? '  ⚠' : '  ✗');
    console.log(icono + ' ' + (f.t + ' ').padEnd(26, '.') + ' ' + f.d);
  }
  console.log('');

  if (fallas.length) {
    console.log('╔═══════════════════════════════════════════════════════════════');
    console.log('║  ✗✗✗  ' + fallas.length + ' FALLA(S) — NO DES EL ARREGLO POR BUENO  ✗✗✗');
    console.log('╚═══════════════════════════════════════════════════════════════');
    for (const f of fallas) console.log('   · ' + f.t + ': ' + f.d);
    console.log('\n   Pégale esta salida a Claude antes de tocar nada más.\n');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════════════════════════');
  console.log('║  ✓  READ-BACK LIMPIO' + (avisos.length ? '  (con ' + avisos.length + ' aviso/s, ver arriba)' : ''));
  console.log('╚═══════════════════════════════════════════════════════════════');
  console.log('   El código en el server es exactamente el esperado, y el workflow sigue activo.');
  console.log('');
  console.log('   ⚠ Esto NO prueba todavía que el arreglo FUNCIONE (regla §9): la prueba real');
  console.log('     es que Ana resuelva una auto_cierre_pendiente y el TAG quede apagado en');
  console.log('     Odoo. Hay 7 pendientes. Verificación agendada en el issue #137.\n');
}

const modo = (process.argv[2] || '').toLowerCase();
if (modo === 'build') build();
else if (modo === 'verify') verify();
else {
  console.error('uso:  node transform-resolver-attid.js build    # cur.json -> put_body.json');
  console.error('      node transform-resolver-attid.js verify   # rb.json  -> checklist');
  process.exit(1);
}
