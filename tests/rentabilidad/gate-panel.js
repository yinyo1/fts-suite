#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * GATE DEL PANEL · finanzas/rentabilidad/ · issue #332 pendiente 4
 *
 *   NODE_PATH=<ruta-a-node_modules> node tests/rentabilidad/gate-panel.js [salida.json]
 *
 * Carga el panel REAL en jsdom con el armazón REAL, le sirve una salida del
 * motor por un `fetch` falso, y verifica que pinte. Sin red y sin Odoo.
 *
 * Lo que este gate atrapa y una revisión a ojo no:
 *   · que el panel siga leyendo los campos que el motor manda (si el motor
 *     renombra algo, aquí truena en vez de en el celular de Esteban);
 *   · errores de consola, que en un panel son invisibles hasta que alguien
 *     abre las herramientas de desarrollo;
 *   · que la tabla tenga TANTAS filas como proyectos manda el contrato.
 *
 * Por qué se stubea `SuiteAuth` y no se prueba el login: el gate de sesión
 * decide si se PINTA la pantalla, no si se puede leer el dato — eso lo exige
 * el endpoint en el servidor. Probar aquí el login probaría el stub.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
const SCRATCH = process.argv[2] || path.join(__dirname, 'golden-pre-extension.json');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.error('✗ falta jsdom. Correr con NODE_PATH apuntando a un node_modules que lo tenga.');
  process.exit(2);
}

/* El gate acepta el sobre pelado o el golden; si le dan el golden, lo re-arma
   en forma de sobre para poder servirlo por el fetch falso. */
let j = JSON.parse(fs.readFileSync(SCRATCH, 'utf8'));
let sobre = j.datos ? j : {
  ok: true, panel: j.panel, contrato: j.contrato,
  alcance: { tipo: 'periodo', desde: null, hasta: j.leido.slice(0, 10), en: j.leido.slice(0, 10) },
  actor: null, salvedades: (j.salvedades_codigos || []).map(c => ({ codigo: c, dice: 'salvedad ' + c + ' (reconstruida por el gate desde el golden)' })),
  datos: { moneda_presentacion: j.moneda_presentacion,
           tipo_cambio: { usd_mxn: 17.6425, fecha: j.leido.slice(0, 10), fuente: j.tipo_cambio_fuente },
           resumen: j.resumen, columnas: j.columnas, filas: j.filas, detalle: null },
  _meta: j.meta
};

const html = fs.readFileSync(path.join(RAIZ, 'finanzas/rentabilidad/index.html'), 'utf8');
const shell = fs.readFileSync(path.join(RAIZ, 'shared/panel/panel-shell.js'), 'utf8');
const tabla = fs.readFileSync(path.join(RAIZ, 'shared/panel/panel-tabla.js'), 'utf8');
/* el script del panel es el último bloque inline sin src */
const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)
  .map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
const scriptPanel = inline[inline.length - 1];

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://yinyo1.github.io/fts-suite/finanzas/rentabilidad/' });
const W = dom.window;

const errores = [];
W.console.error = (...a) => errores.push(a.join(' '));
W.onerror = (m) => errores.push('onerror: ' + m);

/* ── stubs mínimos ──────────────────────────────────────────────────────── */
W.SuiteAuth = {
  LLAVE: 'fts_suite_session', LLAVE_SESION: 'fts_suite_session',
  requerir: () => true,
  getToken: () => 'token-de-prueba-del-gate',
  getSession: () => ({ usuario: 'gate', nombre: 'Gate de prueba', scopes: ['rentabilidad:read'] }),
  logout: () => {}
};
let nPedidos = 0;
W.fetch = async () => { nPedidos++; return { ok: true, status: 200, json: async () => sobre }; };

/* ── correr el armazón y el panel ───────────────────────────────────────── */
let fallo = null;
try { W.eval(shell); W.eval(tabla); W.eval(scriptPanel); }
catch (e) { fallo = e; }

function asserts() {
  const D = W.document, out = [];
  const t = (nom, cond, det) => out.push({ nom, cond: !!cond, det: det || '' });

  t('el armazón cargó (window.Panel existe)', !!W.Panel);
  t('el panel montó sin excepción', !fallo, fallo ? String(fallo.message).slice(0, 120) : '');
  t('la cabecera se pintó', !!D.querySelector('header h1'));
  t('el badge de versión está en la cabecera',
    /v1\.0\d/.test((D.querySelector('header .sub') || {}).textContent || ''),
    (D.querySelector('header .sub') || {}).textContent || '(sin .sub)');
  t('el panel pidió el dato al endpoint una vez', nPedidos >= 1, 'pedidos=' + nPedidos);

  const filas = D.querySelectorAll('#tabla tbody tr');
  t('la tabla pintó una fila por proyecto', filas.length === sobre.datos.filas.length,
    filas.length + ' de ' + sobre.datos.filas.length);
  const kpis = D.querySelectorAll('#kpis .kpi');
  t('los KPIs se pintaron', kpis.length >= 4, kpis.length + ' tarjetas');
  t('el conteo de la barra se pintó', /\d+\s+de\s+\d+/.test((D.getElementById('conteo') || {}).textContent || ''),
    (D.getElementById('conteo') || {}).textContent || '');
  t('las salvedades se pintaron', (D.getElementById('salvCuerpo') || {}).innerHTML.length > 20);

  /* ── v1.01 · sólo cuando el sobre trae la extensión ────────────────────────
     Condicionales A PROPÓSITO: el gate tiene que seguir corriendo contra el
     golden del contrato 1, que no trae nada de esto. Si fueran incondicionales,
     el gate dejaría de poder medir la línea base — y la línea base es su razón
     de ser. */
  const esV101 = sobre._meta && sobre._meta.contrato_version === '1.01';
  if (esV101) {
    const k2 = D.querySelectorAll('#kpis2 .kpi');
    t('v1.01 · la segunda fila de tarjetas se pintó', k2.length >= 4, k2.length + ' tarjetas');
    t('v1.01 · la leyenda dice los umbrales vigentes',
      /rojo/.test((D.getElementById('leyenda') || {}).textContent || '') &&
      String((D.getElementById('leyenda') || {}).textContent || '')
        .indexOf(String(sobre.datos.semaforo_umbrales.costo_adelante_pts)) >= 0,
      (D.getElementById('leyenda') || {}).textContent.slice(0, 90));
    /* La hora del dato en CST, NO el ISO en UTC. Es el hallazgo #1 de §11 y el
       que más veces se ha colado: se comprueba que NO quede una `Z` a la vista. */
    t('v1.01 · la hora del dato está en CST, no el ISO crudo',
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test((D.getElementById('leyenda') || {}).textContent || '') &&
      !/T\d{2}:\d{2}.*Z/.test((D.getElementById('leyenda') || {}).textContent || ''));
    /* Una celda de semáforo por fila: si la columna llega y el panel no la
       entiende, el armazón pintaría el valor crudo y nadie lo notaría. */
    const chips = D.querySelectorAll('#tabla tbody tr .chip[class*="s-"]');
    t('v1.01 · cada fila pinta su chip de semáforo',
      chips.length === D.querySelectorAll('#tabla tbody tr').length,
      chips.length + ' chips en ' + D.querySelectorAll('#tabla tbody tr').length + ' filas');
    /* Y que el filtro FILTRE: un select que no hace nada se ve igual que uno
       que sí, hasta que alguien lo usa (regla §20 #11). */
    const antes = D.querySelectorAll('#tabla tbody tr').length;
    D.getElementById('fSemaforo').value = 'rojo';
    D.getElementById('fSemaforo').onchange();
    const despues = D.querySelectorAll('#tabla tbody tr').length;
    D.getElementById('fSemaforo').value = '';
    D.getElementById('fSemaforo').onchange();
    t('v1.01 · el filtro de semáforo de verdad filtra',
      despues === sobre.datos.resumen.semaforo_rojo && despues < antes,
      despues + ' filas en rojo, esperadas ' + sobre.datos.resumen.semaforo_rojo + ' (de ' + antes + ')');
    t('v1.01 · el filtro se restauró', D.querySelectorAll('#tabla tbody tr').length === antes);
  }

  t('cero errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));
  return out;
}

/* `cargar()` es async y espera al fetch: el render ocurre en microtareas
   DESPUÉS de que `eval` regresa. Sin esta espera el gate se medía a sí mismo y
   reportaba «0 de 222 filas» con el panel perfectamente sano. Se ceden varios
   turnos en vez de uno fijo, y se corta en cuanto la tabla aparece. */
async function esperarRender(intentos) {
  for (let i = 0; i < intentos; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (W.document.querySelectorAll('#tabla tbody tr').length > 0) return i + 1;
  }
  return null;
}

(async () => {
const turnos = await esperarRender(50);
const res = asserts();
console.log('─── Gate del panel · finanzas/rentabilidad/ ───');
console.log('   render listo tras ' + (turnos === null ? 'NUNCA (agotó 50 turnos)' : turnos + ' turno(s)'));
res.forEach(r => console.log('   ' + (r.cond ? '✓' : '✗') + ' ' + r.nom + (r.det ? ('   →  ' + r.det) : '')));
const malos = res.filter(r => !r.cond).length;
console.log('\n   ' + (res.length - malos) + '/' + res.length + ' verificaciones');
if (malos) { console.log('   ✗ ROJO'); process.exit(1); }
console.log('   ✓ verde');
})();
