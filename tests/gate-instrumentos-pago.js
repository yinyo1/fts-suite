#!/usr/bin/env node
// ═══ Gate de render — Finanzas · Instrumentos de pago (Bancos) ═══
//
// POR QUÉ EXISTE ESTE ARCHIVO. El gate original del módulo vive en `scripts/local/`,
// que está en .gitignore: no viaja con el repo. Cualquiera que clone (una sesión de
// Claude Code incluida) se queda sin la única red que atrapó el ReferenceError de
// v0.5.7. Este gate es un sustituto RASTREADO, no un reemplazo: si el de
// `scripts/local/` sigue vivo en la laptop de Esteban, córranse los dos.
//
// QUÉ VERIFICA. Monta el módulo de verdad en jsdom —el archivo real, sin copias ni
// stubs de su lógica— y afirma sobre el DOM resultante. Dos escenarios:
//   · DEMO: por el mock del repo, la misma rama que usa el gate original.
//   · REAL: con FinClient stubbeado, que es la única forma de ejercitar rowConc()
//     con fixtures controlados (res_apunte, devoluciones, fondeos, parciales).
//
// CÓMO SE CORRE.  node tests/gate-instrumentos-pago.js
// Requiere jsdom. No está en el repo (no hay package.json); instálalo donde sea:
//   npm install jsdom   →   NODE_PATH=/ruta/node_modules node tests/gate-instrumentos-pago.js
//
// REGLA DE USO. Este gate NO es la meta. Si un cambio lo rompe, se arregla el
// cambio — nunca el assert. Aflojar un assert para que pase es exactamente el
// anti-patrón que el gate existe para impedir.

'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('\n✗ Falta jsdom.\n  npm install jsdom  y vuelve a correr,');
  console.error('  o NODE_PATH=<dir>/node_modules node tests/gate-instrumentos-pago.js\n');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const FIN = path.join(ROOT, 'finanzas');

// ── mini framework de asserts ────────────────────────────────────────────────
let pass = 0;
const fails = [];
let scenario = '';

function check(name, cond, detail) {
  if (cond) { pass++; return true; }
  fails.push({ scenario, name, detail: detail == null ? '' : String(detail) });
  return false;
}
function eq(name, actual, expected) {
  return check(name, actual === expected, `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
}
function has(name, haystack, needle) {
  return check(name, String(haystack).indexOf(needle) >= 0, `no se encontró ${JSON.stringify(needle)}`);
}
function hasNot(name, haystack, needle) {
  return check(name, String(haystack).indexOf(needle) < 0, `se encontró ${JSON.stringify(needle)} y no debía`);
}

// ── fixtures de modo REAL ────────────────────────────────────────────────────
// Cada fila ejercita una rama distinta de rowConc(). Los montos y formas salen de
// casos reales medidos en Odoo durante la auditoría del issue #150, para que el
// gate falle si alguien vuelve a romper justo lo que ya se rompió una vez.
const HOY = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

const ROWS_REAL = [
  // 1 · conciliada limpia: apunte a cero
  { id: 9001, company_id: 1, _jid: 61, d: '2026-08-05', j: 'Jeeves', ref: '[Tarjeta gastos ****4548] Europcar',
    amt: -3511.33, mon: 'MXN', ok: true, res: 0, res_apunte: 0, wd: HOY,
    po: 'PO7001', bill: 'BILL3190', sb: 'PAGADA', ana: 'SO1-X', ff: 'UUID-1', tarj: 'Tarjeta gastos',
    comp: 'Esteban', rs: 'Servicios FTS', art: 'Renta', tk: '', tipo: 'Egreso' },

  // 2 · parcial: el cargo fue mayor que el bill, el apunte conserva saldo PARCIAL
  { id: 9002, company_id: 1, _jid: 61, d: '2026-08-06', j: 'Jeeves', ref: '[Primary ****6831] Ferr',
    amt: -1890.80, mon: 'MXN', ok: true, res: 0, res_apunte: 334.08, wd: HOY,
    po: 'PO7002', bill: 'BILL3100', sb: 'PAGADA', ana: '', ff: '', tarj: 'Primary',
    comp: 'Felipe', rs: 'Servicios FTS', art: '', tk: '', tipo: 'Egreso' },

  // 3 · DESCONCILIADA: bill cancelado → el apunte recuperó el importe COMPLETO.
  //     Caso real: línea 32555 ($54 MercadoPago) ↔ BILL3270 cancelado el 2026-08-20.
  { id: 9003, company_id: 1, _jid: 61, d: '2026-08-05', j: 'Jeeves', ref: '[Tarjeta gastos ****4548] MercadoPago',
    amt: -54.00, mon: 'MXN', ok: true, res: 0, res_apunte: 54.00, wd: HOY,
    po: '', bill: '', sb: '', ana: '', ff: '', tarj: 'Tarjeta gastos',
    comp: 'Esteban', rs: 'Servicios FTS', art: '', tk: '', tipo: 'Egreso' },

  // 4 · devolución (positiva, etiquetada) — nunca entra al motor de sugerencias
  { id: 9004, company_id: 1, _jid: 61, d: '2026-08-09', j: 'Jeeves', ref: '[DEVOLUCIÓN ****Inns] Luis angel',
    amt: 860.98, mon: 'MXN', ok: false, res: 860.98, tarj: '', comp: '', rs: 'Servicios FTS',
    art: '', ana: '', po: '', bill: '', sb: '', ff: '', tk: '', tipo: 'Ingreso' },

  // 5 · fondeo (positivo, etiquetado) — tampoco entra al motor
  { id: 9005, company_id: 1, _jid: 61, d: '2026-08-31', j: 'Jeeves', ref: '[FONDEO] Credit Line',
    amt: 168574.45, mon: 'MXN', ok: false, res: 168574.45, tarj: '', comp: '', rs: 'Servicios FTS',
    art: '', ana: '', po: '', bill: '', sb: '', ff: '', tk: '', tipo: 'Ingreso' },

  // 6 · pendiente normal con candidato (el motor la evaluó y encontró bill)
  { id: 9006, company_id: 1, _jid: 61, d: '2026-08-27', j: 'Jeeves', ref: '[Primary ****6831] PRO Ferrenl',
    amt: -340.96, mon: 'MXN', ok: false, res: 340.96, tarj: 'Primary', comp: 'Felipe',
    rs: 'Servicios FTS', art: '', ana: '', po: '', bill: '', sb: '', ff: '', tk: '', tipo: 'Egreso' },

  // 7 · pendiente evaluada SIN candidato
  { id: 9007, company_id: 1, _jid: 61, d: '2026-08-28', j: 'Jeeves', ref: '[Tarjeta gastos ****4548] Waalaxy',
    amt: -177.00, mon: 'MXN', ok: false, res: 177.00, tarj: 'Tarjeta gastos', comp: 'Esteban',
    rs: 'Servicios FTS', art: '', ana: '', po: '', bill: '', sb: '', ff: '', tk: '', tipo: 'Egreso' },

  // 8 · Chase: journal FUERA del alcance del motor (en_motor:false) → 'noevaluada'
  { id: 9008, company_id: 6, _jid: 123, d: '2026-09-01', j: 'Chase Ink', ref: 'DLO*UBER',
    amt: -31.88, mon: 'USD', ok: false, res: 31.88, tarj: '', comp: '', rs: 'FTS LLC',
    art: '', ana: '', po: '', bill: '', sb: '', ff: '', tk: '', tipo: 'Egreso' }
];

const STATUS_REAL = {
  sources: [],
  runs: [],
  cron: { timezone: 'America/Monterrey', rules: ['0,30 7-16 * * 1-5', '0,10,20,30,40,50 17 * * 1-5', '0 18 * * 1-5'] },
  por_journal: [
    { journal: 61,  label: 'Jeeves Tarjeta Credito', en_motor: true,  post_total: 7, pre_pend: 0 },
    { journal: 123, label: 'Chase Ink Unlimited',    en_motor: false, post_total: 1, pre_pend: 0 }
  ],
  intransit: [],
  hoy: { en_transito: { disponible: false }, conciliable_pendiente: { total: 4 }, conciliadas_hoy: { total: 3, manual: 1, boton: 0, auto: 2 } },
  metricas: null,
  serie: []
};

// Sugerencias: SOLO para la 9006. La 9007 se devuelve evaluada-sin-candidatos.
// Las 9004/9005 NO deben pedirse nunca — el gate lo verifica capturando line_ids.
const SUGERENCIAS_PEDIDAS = [];

function finClientStub(endpoint, params) {
  if (endpoint === '/fin/captura-status') return Promise.resolve(JSON.parse(JSON.stringify(STATUS_REAL)));
  if (endpoint === '/fin/captura-transacciones') {
    return Promise.resolve({
      rows: JSON.parse(JSON.stringify(ROWS_REAL)),
      pagination: { total_count: ROWS_REAL.length, truncado: false, cap: 6000 }
    });
  }
  if (endpoint === '/fin/captura-sugerencias') {
    (params.line_ids || []).forEach(function (x) { SUGERENCIAS_PEDIDAS.push(x); });
    return Promise.resolve({
      lineas: [
        { line_id: 9006, nivel: 'sugerida', candidatos: [{ bill_aml_id: 111, bill_name: 'BILL3345', partner: 'Proferre', score: 0.91, monto_bill: 340.96, banda: 'alta', pre_marcado: true }] },
        { line_id: 9007, nivel: 'sin-documento', candidatos: [] }
      ],
      pagination: { has_more: false }
    });
  }
  if (endpoint === '/fin/captura-pendings-status') return Promise.resolve({ disponible: false });
  return Promise.resolve({});
}

// ── boot de jsdom ────────────────────────────────────────────────────────────
const SHELL = `<!doctype html><html><body>
  <div id="app">
    <button id="navToggle" aria-expanded="true"></button>
    <div id="sidebarBackdrop"></div>
    <nav id="sidebarNav"></nav>
    <span id="bcBlock"></span><span id="bcCurrent"></span>
    <main id="viewContainer"></main>
  </div>
</body></html>`;

// runScripts:'outside-only' es obligatorio: sin él, window.eval es el eval de Node y
// los scripts del módulo no ven `window`. No ejecuta scripts del HTML, solo habilita
// que nosotros inyectemos los archivos reales en el contexto de la ventana.
const dom = new JSDOM(SHELL, {
  url: 'https://yinyo1.github.io/fts-suite/finanzas/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const win = dom.window;

// matchMedia: jsdom no lo implementa y router.js lo usa para el breakpoint del sidebar.
win.matchMedia = function (q) {
  return { matches: false, media: q, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
};
// fetch: sirve el mock del repo desde disco (modo demo).
win.fetch = function (url) {
  const rel = String(url).replace(/^.*finanzas\//, '');
  const p = path.join(FIN, rel);
  if (!fs.existsSync(p)) return Promise.reject(new Error('404 ' + rel));
  const txt = fs.readFileSync(p, 'utf8');
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(txt)); }, text: function () { return Promise.resolve(txt); } });
};

function loadScript(rel) {
  win.eval(fs.readFileSync(path.join(FIN, rel), 'utf8'));
}

loadScript('js/state.js');
loadScript('js/router.js');

win.FinAuth = { isValid: function () { return true; }, getToken: function () { return 'gate-token'; }, getUser: function () { return 'gate'; }, logout: function () {} };
win.FinCompanySelector = { mount: function () {} };
win.FinClient = { call: function (ep, p) { return finClientStub(ep, p); } };

loadScript('js/modules/instrumentos-pago.js');

const MANIFEST = { modules: [{ id: 'instrumentos-pago', name: 'Instrumentos de pago', icon: '▤', block: null }], blocks: {} };

// ── helpers de espera ────────────────────────────────────────────────────────
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitFor(fn, label, timeoutMs) {
  const limit = Date.now() + (timeoutMs || 4000);
  while (Date.now() < limit) {
    try { if (fn()) return true; } catch (e) { /* aún no monta */ }
    await tick(25);
  }
  check('espera: ' + label, false, 'timeout tras ' + (timeoutMs || 4000) + 'ms');
  return false;
}
function view() { return win.document.getElementById('viewContainer'); }
function txt(sel) { const el = view().querySelector(sel); return el ? el.textContent : null; }

function mountModule(mode) {
  win.localStorage.setItem('fts_fin_mode_instrumentos-pago', mode);
  view().innerHTML = '';
  win.FinRouter.init(MANIFEST);
  win.FinRouter.navigate('instrumentos-pago');
}

// ── escenarios ───────────────────────────────────────────────────────────────
async function escenarioDemo() {
  scenario = 'DEMO (mock del repo)';
  mountModule('demo');
  await waitFor(function () { return view().querySelector('#ip-tblwrap'); }, 'contenedor de tabla montado');

  // ⚠ El mock del repo trae filas de JULIO 2026, y la ventana por defecto es RODANTE
  // (inicio del mes pasado → hoy). Desde agosto, la escotilla demo pinta la tabla vacía:
  // no es un bug de producción —Real trae datos vivos— pero deja al gate sin filas que
  // mirar. Se abre el rango por el input real, que además ejercita wireFilters/reload.
  const from = view().querySelector('#ip-fFrom');
  check('existe el filtro de fecha desde', !!from);
  if (from) {
    from.value = '2026-01-01';
    from.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  await waitFor(function () { return view().querySelector('#ip-tblwrap table tbody tr'); }, 'tabla con filas tras abrir el rango');

  const html = view().innerHTML;
  check('el módulo montó sin caer al errorBox del router', html.indexOf('Error al renderizar el módulo') < 0);
  check('pinta la tabla', !!view().querySelector('#ip-tblwrap table'));
  check('pinta el badge de versión', !!view().querySelector('.ip-ver'));
  check('pinta los chips', !!view().querySelector('#ip-chips'));
  check('pinta el semáforo', !!view().querySelector('#ip-semrows'));

  const filas = view().querySelectorAll('#ip-tblwrap table tbody tr');
  check('la tabla trae filas (' + filas.length + ')', filas.length > 0);

  // Regresión v0.5.7: rowState/stateCell viven en el closure; si COLS los llama antes
  // de montar la vista, revienta. Si el estado se pinta, los hooks quedaron cableados.
  check('la columna Estado se pintó (hooks IP_rowState/IP_stateCell cableados)',
    html.indexOf('ip-est') >= 0);
}

async function escenarioReal() {
  scenario = 'REAL (FinClient stubbeado)';
  SUGERENCIAS_PEDIDAS.length = 0;
  mountModule('real');
  await waitFor(function () { return view().querySelector('#ip-tblwrap table tbody tr'); }, 'tabla montada');
  // evalSugg corre en segundo plano tras el render; se espera a que pinte el candidato.
  await waitFor(function () { return view().innerHTML.indexOf('BILL3345') >= 0; }, 'sugerencias aplicadas');

  const html = view().innerHTML;
  check('montó sin caer al errorBox', html.indexOf('Error al renderizar el módulo') < 0);

  // ── Estados por fila (eje B) ──
  has('9001 conciliada limpia → "✓ Conciliada"', html, '✓ Conciliada');
  has('9002 parcial → "◐ Conciliada parcial"', html, '◐ Conciliada parcial');
  has('9002 parcial declara el saldo abierto', html, 'quedan');
  has('9006 con candidato → "◆ Con documento"', html, '◆ Con documento');
  has('9007 evaluada sin candidatos → "○ Sin documento"', html, '○ Sin documento');
  has('9008 Chase (en_motor:false) → "◌ No evaluada"', html, '◌ No evaluada');

  // ── El motor NO debe evaluar fondeos ni devoluciones ──
  check('devolución 9004 NO se mandó a captura-sugerencias',
    SUGERENCIAS_PEDIDAS.indexOf(9004) < 0, 'line_ids pedidos: ' + JSON.stringify(SUGERENCIAS_PEDIDAS));
  check('fondeo 9005 NO se mandó a captura-sugerencias',
    SUGERENCIAS_PEDIDAS.indexOf(9005) < 0, 'line_ids pedidos: ' + JSON.stringify(SUGERENCIAS_PEDIDAS));
  check('pendientes reales SÍ se mandaron (9006 y 9007)',
    SUGERENCIAS_PEDIDAS.indexOf(9006) >= 0 && SUGERENCIAS_PEDIDAS.indexOf(9007) >= 0,
    'line_ids pedidos: ' + JSON.stringify(SUGERENCIAS_PEDIDAS));

  // ── Tipos (eje A): el signo NO decide fondeo/devolución ──
  has('la devolución se clasifica por el marcador del ref, no por el signo', html, 'Devolución');

  // ── Devoluciones y fondeos NO son "sin conciliar" ──
  // Ninguno de los dos casa contra un bill de proveedor: la devolución va contra nota
  // de crédito y el fondeo contra el lado BBVA que aún no existe. Decir "sin conciliar"
  // afirma que les falta una factura que nunca les va a faltar.
  has('la devolución declara qué le falta de verdad', html, 'nota de crédito');
  has('el fondeo declara qué le falta de verdad', html, 'lado BBVA');
  check('ni la devolución ni el fondeo se pintan "Sin conciliar" a secas',
    (html.match(/○ Sin conciliar/g) || []).length === 0,
    'quedan ' + (html.match(/○ Sin conciliar/g) || []).length + ' celdas "○ Sin conciliar"');
  // Reusan las clases que YA existían en instrumentos-pago.css (.ip-est.fon / .ip-est.dev-ret),
  // huérfanas desde que murió el eje de 5 valores. Si alguien inventa clases nuevas, el
  // estado sale sin estilo y este assert lo caza.
  has('el fondeo usa la clase de CSS que ya existía', html, 'ip-est fon');
  has('la devolución usa la clase de CSS que ya existía', html, 'ip-est dev-ret');

  // ── El filtro por columna deja de mostrar llaves crudas ──
  // colValLabel seguía mapeando el vocabulario de 5 valores muerto en v0.5.16, así que
  // los estados nuevos caían al `|| v` y salían como 'conciliada' / 'sindoc' / 'pendiente'.
  const colfil = view().querySelector('.ip-colfil[data-colfil="ok"]');
  check('existe el filtro de la columna Estado', !!colfil);
  if (colfil) {
    colfil.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const pop = view().querySelector('#ip-cflist');
    const popTxt = pop ? pop.textContent : '';
    check('el filtro de columna lista etiquetas humanas, no llaves crudas',
      popTxt.indexOf('Conciliada') >= 0 && popTxt.indexOf('sindoc') < 0 && popTxt.indexOf('pendiente') < 0,
      'contenido: ' + popTxt.replace(/\s+/g, ' ').slice(0, 240));
  }

  // ── Barra de agregados (#ip-aggs) ──
  // Con los 8 fixtures: 3 conciliadas (9001 limpia, 9002 parcial, 9003 desconciliada —
  // las tres con ok:true) y 5 pendientes. Residual = suma de `res` de las NO conciliadas:
  // 860.98 + 168,574.45 + 340.96 + 177.00 + 31.88 = 169,985.27
  const aggs = txt('#ip-aggs');
  check('existe la barra de agregados', aggs != null, 'no se encontró #ip-aggs');
  if (aggs != null) {
    has('la barra reporta el total de líneas', aggs, '8 líneas');
    has('la barra cuenta las conciliadas de verdad', aggs, '3 conciliadas');
    // Tras el cambio de taxonomía: "sin conciliar" son las 3 que esperan documento
    // (9006 con candidato, 9007 sin, 9008 no evaluada). Fondeo y devolución salen del
    // cubo porque no esperan documento, y se cuentan aparte para que Todo siga cuadrando.
    has('la barra cuenta las pendientes de verdad', aggs, '3 sin conciliar');
    has('la barra cuenta el fondeo', aggs, '1 fondeo');
    has('la barra cuenta la devolución', aggs, '1 devolución');
    has('la barra suma el residual pendiente', aggs, '169,985.27');
    hasNot('la barra ya no puede decir "residual $0.00" con filas pendientes', aggs, 'residual $0.00');
    // El vocabulario viejo del eje de 5 valores murió en v0.5.16; si vuelve, la barra
    // vuelve a contar llaves que rowConc() no produce.
    hasNot('la barra ya no habla de "en tránsito" (eje muerto en v0.5.16)', aggs, 'en tránsito');
  }

  // ── Coherencia barra ↔ chips: el defecto era que se contradecían en pantalla ──
  const chipsTxt = txt('#ip-chips') || '';
  const chipsFlat = chipsTxt.replace(/\s+/g, ' ');
  check('el chip "Sin conciliar" y la barra dicen el mismo 3',
    /Sin conciliar 3/.test(chipsFlat), 'chips: ' + chipsFlat);
  check('hay chip propio de Fondeos con su conteo', /Fondeos 1/.test(chipsFlat), 'chips: ' + chipsFlat);
  check('hay chip propio de Devoluciones con su conteo', /Devoluciones 1/.test(chipsFlat), 'chips: ' + chipsFlat);
  // Nada se esconde: los cubos del eje B tienen que sumar el universo.
  const mTodo = chipsFlat.match(/Todo (\d+)/), mConc = chipsFlat.match(/Conciliado (\d+)/),
        mSin = chipsFlat.match(/Sin conciliar (\d+)/), mFon = chipsFlat.match(/Fondeos (\d+)/),
        mDev = chipsFlat.match(/Devoluciones (\d+)/), mPre = chipsFlat.match(/Pre-conciliado (\d+)/);
  if (mTodo && mConc && mSin && mFon && mDev && mPre) {
    const suma = +mConc[1] + +mSin[1] + +mFon[1] + +mDev[1] + +mPre[1];
    check('los chips suman el universo (nada se esconde al sacar fondeos/devoluciones)',
      suma === +mTodo[1], 'Todo=' + mTodo[1] + ' pero las partes suman ' + suma);
  } else {
    check('se pudieron leer todos los chips para cuadrar el universo', false, 'chips: ' + chipsFlat);
  }

  // ── Chips ──
  const chips = txt('#ip-chips');
  check('existen los chips', chips != null);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async function main() {
  const t0 = Date.now();
  try {
    await escenarioDemo();
    await escenarioReal();
  } catch (e) {
    check('el gate corrió hasta el final', false, (e && e.stack) || String(e));
  }

  const total = pass + fails.length;
  console.log('\n─── Gate · Finanzas / Instrumentos de pago ───');
  console.log(`   ${pass}/${total} checks en ${Date.now() - t0} ms`);
  if (fails.length) {
    console.log('\n   FALLOS:');
    fails.forEach(function (f) { console.log(`   ✗ [${f.scenario}] ${f.name}\n       ${f.detail}`); });
    console.log('');
    process.exit(1);
  }
  console.log('   ✓ verde\n');
  process.exit(0);
})();
