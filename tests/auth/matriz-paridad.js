#!/usr/bin/env node
// ═══ Matriz de paridad · FTSAuth (clásico) → SuiteAuth (scopes) ═══
//
// Para cada PERSONA y cada OBJETIVO (tarjeta del lanzador, página, sub-tarjeta)
// compara lo que ve HOY con lo que vería con los scopes PROPUESTOS.
// Sale con código 1 si una sola celda no coincide. Ninguna fase del plan
// (docs/arquitectura/SUITEAUTH_MIGRACION.md) se habilita con este script en rojo.
//
// Reglas del modelo:
//  · Las condiciones "legacy" son COPIA de lo que el código hace hoy, con su
//    archivo:línea al lado. Si el código cambia, este archivo se actualiza en el
//    mismo PR, o la matriz deja de decir la verdad.
//  · Los scopes propuestos son un ESPEJO EXACTO del árbol de users-suite.json,
//    rarezas incluidas (p. ej. Montalvo ve la tarjeta de Planeación y la página
//    lo rechaza). Corregir rarezas es otra decisión, no parte de la paridad.
//  · Ningún objetivo se abre "con cualquier token válido": lo que hoy es
//    "cualquier usuario clásico" pide el scope suite:clasico. Si no, Magaly,
//    Pablo o Erick ganarían PMO e Ingeniería el día del cambio.
//  · rh:read YA existe en suite_usuarios (Ana y Magaly) y ninguna página lo
//    consume. NO se reutiliza para el RH clásico: Magaly ganaría RH · Empleados.
//
// Uso:  node tests/auth/matriz-paridad.js            (tabla + veredicto)
//       node tests/auth/matriz-paridad.js --md       (tabla en markdown)
//       node tests/auth/matriz-paridad.js --propuesta (scopes a sembrar por persona)
//       node tests/auth/matriz-paridad.js --json      (celdas, para la Capa 2)

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const legacyUsers = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/users-suite.json'), 'utf8')).users;
const suiteSnap = JSON.parse(fs.readFileSync(path.join(__dirname, 'suite_usuarios.snapshot.json'), 'utf8'));

// ── Personas: cuenta clásica ↔ cuenta SuiteAuth ──
// ⚠️ ftsmaster → esteban.delacruz es un SUPUESTO: si alguien más usa la clave de
//    ftsmaster, esa persona pierde acceso el día que se retire el clásico. El
//    tablero de adopción (A8) existe para medirlo antes del bloque C.
const PERSONAS = [
  { quien: 'Esteban',   clasico: 'ftsmaster',    suite: 'esteban.delacruz' },
  { quien: 'Felipe',    clasico: 'felipe.perez', suite: 'felipe.perez' },
  { quien: 'Ana',       clasico: 'ana.acevedo',  suite: 'ana.acevedo' },
  { quien: 'Montalvo',  clasico: 'monty',        suite: 'francisco.montalvo' },
  { quien: 'Tere',      clasico: 'Tere Ramos',   suite: null },
  { quien: 'Carolina',  clasico: 'caro.lugo',    suite: null },
  { quien: 'Magaly',    clasico: null,           suite: 'magaly.perez' },
  { quien: 'Pablo',     clasico: null,           suite: 'pablo.bayly' },
  { quien: 'Ricardo',   clasico: null,           suite: 'ricardo.hernandez' },
  { quien: 'Rissia',    clasico: null,           suite: 'rissia.araujo' },
  { quien: 'Erick',     clasico: null,           suite: 'erick.belmont' },
  { quien: 'Aldo',      clasico: null,           suite: 'aldo.mendez' }
];

// ── Sesiones ──
function sesionClasica(username) {
  if (!username) return null;
  const u = legacyUsers.find(x => x.username === username);
  if (!u || !u.activo) return null;
  return { username: u.username, role: u.role, modulos: u.modulos };
}
function scopesActuales(username) {
  if (!username) return new Set();
  const u = suiteSnap.usuarios.find(x => x.username === username);
  if (!u || !u.activo) return new Set();
  return new Set(String(u.scopes || '').split(',').map(s => s.trim()).filter(Boolean));
}

// ── Espejo: árbol clásico → scopes (la regla mecánica, sin juicio) ──
function espejo(ses) {
  const out = new Set();
  if (!ses) return out;
  out.add('suite:clasico');
  if (ses.role === 'master') out.add('suite:master');
  if (ses.modulos === 'all') { out.add('suite:todos_los_modulos'); return out; }
  for (const [m, def] of Object.entries(ses.modulos || {})) {
    if (def && def.acceso === true) out.add(m + ':acceso');
    for (const [s, v] of Object.entries((def && def.submodulos) || {})) {
      if (v === true) out.add(m + ':' + s);
    }
  }
  // Hardcode por nombre (planeacion.js:748, confirmar-horas.js:638) → scope.
  if (ses.username === 'felipe.perez') {
    out.add('operaciones:planeacion_editar');
    out.add('operaciones:confirmar_horas');
  }
  return out;
}
// Autoprueba (CLAUDE.md §20 #19): un instrumento que siempre dice «100%» no
// prueba nada. --autoprueba mete tres errores plausibles y EXIGE que la matriz
// se ponga roja con cada uno.
const SABOTAJE = process.env.PARIDAD_SABOTAJE || '';
function propuestos(p) {
  const s = new Set(scopesActuales(p.suite));
  for (const x of espejo(sesionClasica(p.clasico))) s.add(x);
  if (SABOTAJE === 'rh_read_es_rh_acceso' && s.has('rh:read')) s.add('rh:acceso');
  if (SABOTAJE === 'cualquier_token' && p.suite && scopesActuales(p.suite).size) s.add('suite:clasico');
  if (SABOTAJE === 'sin_hardcode_felipe') { s.delete('operaciones:planeacion_editar'); s.delete('operaciones:confirmar_horas'); }
  return s;
}

// ── Helpers de las dos semánticas ──
const L = {
  sesion: s => !!s,
  master: s => !!s && s.role === 'master',
  masterOAll: s => !!s && (s.role === 'master' || s.modulos === 'all'),
  acceso: (s, m) => !!s && !!(s.modulos && s.modulos[m] && s.modulos[m].acceso === true),
  sub: (s, m, k) => (s && s.modulos && s.modulos[m] && s.modulos[m].submodulos) ? s.modulos[m].submodulos[k] : undefined
};
const S = {
  tiene: (sc, x) => sc.has(x),
  clasico: sc => sc.has('suite:clasico'),
  master: sc => sc.has('suite:master'),
  masterOAll: sc => sc.has('suite:master') || sc.has('suite:todos_los_modulos')
};

// ── Objetivos ── legacy(sesClasica, scopesActuales) vs suite(scopesPropuestos)
// Los objetivos que HOY ya son SuiteAuth usan los scopes actuales en "hoy".
const OBJ = [
  // Lanzador (index.html)
  { id: 'lanzador · entrar', ref: 'index.html:183',
    hoy: s => s ? 'entra' : 'sin lanzador',
    // Interruptor del lanzador: sólo toma la sesión Suite si trae suite:clasico;
    // si no, muestra el login clásico como hoy.
    prop: sc => S.clasico(sc) ? 'entra' : 'sin lanzador' },
  ...['seguridad', 'ingenieria', 'operaciones', 'finanzas', 'comercial', 'hatch', 'odoo'].map(m => ({
    id: 'lanzador · ' + m, ref: 'index.html:369-391',
    hoy: s => !s ? '—' : (L.masterOAll(s) || L.acceso(s, m)) ? 'activa' : 'atenuada',
    prop: sc => !S.clasico(sc) ? '—' : (S.masterOAll(sc) || sc.has(m + ':acceso')) ? 'activa' : 'atenuada'
  })),
  { id: 'lanzador · rh', ref: 'index.html:315',
    hoy: s => !s ? '—' : (L.masterOAll(s) || L.acceso(s, 'rh')) ? 'activa' : 'próximamente',
    prop: sc => !S.clasico(sc) ? '—' : (S.masterOAll(sc) || sc.has('rh:acceso')) ? 'activa' : 'próximamente' },
  { id: 'lanzador · config/hatch visibles', ref: 'index.html:358-363',
    hoy: s => !s ? '—' : L.master(s) ? 'visibles' : 'ocultas',
    prop: sc => !S.clasico(sc) ? '—' : S.master(sc) ? 'visibles' : 'ocultas' },

  // Seguridad
  { id: 'seguridad/ (página)', ref: 'seguridad/index.html:20',
    hoy: s => L.sesion(s) ? 'abre' : 'niega', prop: sc => S.clasico(sc) ? 'abre' : 'niega' },
  { id: 'seguridad · tarjeta instructor', ref: 'seguridad/index.html:697',
    hoy: s => !s ? '—' : (s.modulos === 'all' || !!L.sub(s, 'seguridad', 'instructor')) ? 'visible' : 'oculta',
    prop: sc => !S.clasico(sc) ? '—' : (sc.has('suite:todos_los_modulos') || sc.has('seguridad:instructor')) ? 'visible' : 'oculta' },
  { id: 'seguridad · tarjeta empleado', ref: 'seguridad/index.html:703',
    hoy: s => !s ? '—' : (s.modulos === 'all' || !!L.sub(s, 'seguridad', 'empleado')) ? 'visible' : 'oculta',
    prop: sc => !S.clasico(sc) ? '—' : (sc.has('suite:todos_los_modulos') || sc.has('seguridad:empleado')) ? 'visible' : 'oculta' },
  { id: 'seguridad · tarjeta IPERC', ref: 'seguridad/index.html:711 (oculta sólo si ===false)',
    hoy: s => !s ? '—' : (s.modulos !== 'all' && L.sub(s, 'seguridad', 'iperc') === false) ? 'oculta' : 'visible',
    // Semántica distinta a las demás (!==false en vez de ===true): el espejo usa el
    // scope POSITIVO y la matriz demuestra que hoy coinciden. Si alguien queda con
    // seguridad sin la llave iperc, esta fila se pone roja — que es lo que debe pasar.
    prop: sc => !S.clasico(sc) ? '—' : (S.masterOAll(sc) || sc.has('seguridad:iperc')) ? 'visible' : 'oculta' },
  { id: 'seguridad/iperc/ (página)', ref: 'seguridad/iperc/index.html:10-36',
    hoy: s => !s ? 'niega' : (s.modulos !== 'all' && L.sub(s, 'seguridad', 'iperc') === false) ? 'niega' : 'abre',
    prop: sc => !S.clasico(sc) ? 'niega' : (S.masterOAll(sc) || sc.has('seguridad:iperc')) ? 'abre' : 'niega' },

  // Operaciones
  { id: 'operaciones/ (página)', ref: 'operaciones/index.html:11',
    hoy: s => L.sesion(s) ? 'abre' : 'niega', prop: sc => S.clasico(sc) ? 'abre' : 'niega' },
  ...['kiosk', 'incidencias', 'planeacion', 'dashboard'].map(k => ({
    id: 'operaciones · tarjeta ' + k, ref: 'operaciones/index.html:26-49 (===true)',
    hoy: s => !s ? '—' : (L.masterOAll(s) || L.sub(s, 'operaciones', k) === true) ? 'activa' : 'atenuada',
    prop: sc => !S.clasico(sc) ? '—' : (S.masterOAll(sc) || sc.has('operaciones:' + k)) ? 'activa' : 'atenuada'
  })),
  { id: 'operaciones/planeacion/ (página)', ref: 'planeacion.js:747-748',
    hoy: s => !s ? 'niega' : (L.masterOAll(s) || s.username === 'felipe.perez') ? 'abre' : 'niega',
    prop: sc => (S.masterOAll(sc) || sc.has('operaciones:planeacion_editar')) ? 'abre' : 'niega' },
  { id: 'operaciones/confirmar-horas/', ref: 'confirmar-horas.js:637-638',
    hoy: s => !s ? 'niega' : (L.masterOAll(s) || s.username === 'felipe.perez') ? 'abre' : 'niega',
    prop: sc => (S.masterOAll(sc) || sc.has('operaciones:confirmar_horas')) ? 'abre' : 'niega' },
  { id: 'operaciones/incidencias/ + /empleado', ref: 'incidencias/index.html:11',
    hoy: s => L.sesion(s) ? 'abre' : 'niega', prop: sc => S.clasico(sc) ? 'abre' : 'niega' },
  { id: 'operaciones/incidencias/supervisor', ref: 'supervisor/index.html:17',
    hoy: s => !s ? 'niega' : (L.masterOAll(s) || L.sub(s, 'operaciones', 'supervisor') === true) ? 'abre' : 'niega',
    prop: sc => (S.masterOAll(sc) || sc.has('operaciones:supervisor')) ? 'abre' : 'niega' },

  // RH clásico
  { id: 'modulos/rh/ (hub, visores, empleados)', ref: 'rh/index.html:169 · empleados.js:188',
    hoy: s => !s ? 'niega' : (L.masterOAll(s) || L.acceso(s, 'rh')) ? 'abre' : 'niega',
    prop: sc => (S.masterOAll(sc) || sc.has('rh:acceso')) ? 'abre' : 'niega' },

  // Otros clásicos
  { id: 'ingenieria/', ref: 'ingenieria/index.html:10',
    hoy: s => L.sesion(s) ? 'abre' : 'niega', prop: sc => S.clasico(sc) ? 'abre' : 'niega' },
  { id: 'pmo/', ref: 'pmo/index.html:4',
    hoy: s => L.sesion(s) ? 'abre' : 'niega', prop: sc => S.clasico(sc) ? 'abre' : 'niega' },
  { id: 'hatch/', ref: 'hatch/index.html:1715',
    hoy: s => L.master(s) ? 'abre' : 'niega', prop: sc => S.master(sc) ? 'abre' : 'niega' },
  { id: 'admin/config-master + editor-asistencias', ref: 'config-master.html:1181 · editor:807',
    hoy: s => L.master(s) ? 'abre' : 'niega', prop: sc => S.master(sc) ? 'abre' : 'niega' },

  // Ya SuiteAuth hoy: la propuesta sólo AGREGA scopes, así que deben quedar igual.
  ...[
    ['comercial/ + machote', 'comercial:read'],
    ['machote · dirección', 'comercial:admin'],
    ['comercial/conceptualizador', 'conceptualizador:usar'],
    ['marketing/', 'marketing:usar'],
    ['marketing · bandeja', 'marketing:bandeja'],
    ['marketing · crm/seguimiento', 'marketing:crm'],
    ['finanzas/rentabilidad', 'rentabilidad:read'],
    ['finanzas/data-bancos', 'bancos_data:read'],
    ['rh/nomina-incidencias', 'nomina:write'],
    ['rh/retardos (lectura)', 'retardos:read'],
    ['rh/retardos (editor)', 'retardos:write']
  ].map(([id, sc]) => ({
    id, ref: 'SuiteAuth ' + sc, yaSuite: true,
    hoy: (s, actuales) => actuales.has(sc) ? 'abre' : 'niega',
    prop: p => p.has(sc) ? 'abre' : 'niega'
  }))
];

// ── Cálculo ──
const filas = [];
let rotas = 0;
for (const o of OBJ) {
  const fila = { obj: o.id, ref: o.ref, celdas: [] };
  for (const p of PERSONAS) {
    const ses = sesionClasica(p.clasico);
    const act = scopesActuales(p.suite);
    const hoy = o.hoy(ses, act);
    const prop = o.prop(propuestos(p));
    const ok = hoy === prop;
    if (!ok) rotas++;
    fila.celdas.push({ quien: p.quien, hoy, prop, ok });
  }
  filas.push(fila);
}

const arg = process.argv[2];
if (arg === '--autoprueba') {
  const { execFileSync } = require('child_process');
  let bien = 0;
  for (const sab of ['rh_read_es_rh_acceso', 'cualquier_token', 'sin_hardcode_felipe']) {
    let codigo = 0;
    try { execFileSync(process.execPath, [__filename], { env: { ...process.env, PARIDAD_SABOTAJE: sab }, stdio: 'pipe' }); }
    catch (e) { codigo = e.status; }
    console.log(sab.padEnd(24), codigo === 1 ? 'la matriz lo detecta ✓' : 'NO LO DETECTA ✗');
    if (codigo === 1) bien++;
  }
  process.exit(bien === 3 ? 0 : 1);
}
if (arg === '--propuesta') {
  for (const p of PERSONAS) {
    const add = [...propuestos(p)].filter(x => !scopesActuales(p.suite).has(x));
    console.log(p.quien.padEnd(10), (p.suite || '(SIN CUENTA SUITE)').padEnd(20), add.length ? '+ ' + add.join(',') : '(sin cambios)');
  }
  process.exit(0);
}
if (arg === '--json') {
  // Lo consume tests/auth/navegador-paridad.js (Capa 2): el navegador se compara
  // contra ESTE modelo, celda por celda.
  console.log(JSON.stringify({ personas: PERSONAS, filas }, null, 1));
  process.exit(rotas === 0 ? 0 : 1);
}
if (arg === '--md') {
  console.log('| Objetivo | ' + PERSONAS.map(p => p.quien).join(' | ') + ' |');
  console.log('|---|' + PERSONAS.map(() => '---').join('|') + '|');
  for (const f of filas) {
    console.log('| ' + f.obj + ' | ' + f.celdas.map(c => c.ok ? c.hoy : '❌ ' + c.hoy + '→' + c.prop).join(' | ') + ' |');
  }
} else {
  for (const f of filas) {
    console.log(f.obj.padEnd(42), f.celdas.map(c => (c.ok ? '' : '✗') + c.quien[0] + c.quien[1] + ':' + c.hoy).join('  '));
  }
}
const celdas = filas.length * PERSONAS.length;
console.log('\nVEREDICTO:', rotas === 0 ? 'PARIDAD 100%' : 'NO HAY PARIDAD', `· ${celdas - rotas}/${celdas} celdas · ${OBJ.length} objetivos × ${PERSONAS.length} personas`);
process.exit(rotas === 0 ? 0 : 1);
