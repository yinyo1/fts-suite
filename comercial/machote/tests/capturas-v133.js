/* ═══ Pruebas de navegador del prototipo ═══
 *
 *   npm i playwright
 *   node comercial/machote/tests/pruebas-navegador.js
 *
 * Corre contra el archivo local, sin servidor. Verifica que las pantallas
 * navegan, que el motor reproduce el machote real, que el revisador encuentra
 * lo que debe, y que nada desborda a 380 px.
 *
 * Reescritas el 2026-09-03 junto con el motor.
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* ⚠️ El catálogo de países se pide con `fetch`, y **`fetch` de `file://` está
 * bloqueado en Chromium**. Sin servirlo desde aquí, cada montaje de estas
 * pruebas correría en el modo DEGRADADO (los tres campos del lugar como texto
 * libre) y estaríamos midiendo el respaldo en vez de la pantalla. Se lee del
 * archivo real del repo, no de una copia: si el catálogo cambia, las pruebas
 * ven el cambio. */
/** Siembra el catálogo en una página, Y lo sirve.
 *
 *  ⚠️ Las dos cosas, y por eso vive aquí y no en cada montaje: **`fetch` de
 *  `file://` está bloqueado en Chromium**, así que sin interceptarlo la página
 *  corre en modo DEGRADADO —los tres campos del lugar como texto libre— y las
 *  pruebas medirían el respaldo creyendo que miden la pantalla. Es la trampa de
 *  CLAUDE.md §20 #11: el modo degradado se ve igual que «todavía no carga».
 *
 *  Se engancha ANTES que cualquier otro `addInitScript` de la página, así que
 *  los montajes que envuelven `fetch` después reciben éste como el original y
 *  la cadena funciona sola. */
/* El catálogo va ANTES de quien lo usa. Funcionaba al revés porque el valor
 * sólo se lee al llamar a `sembrarGeo`, pero un `const` citado más arriba de su
 * línea es justo la trampa de CLAUDE.md §20 #12: el día que alguien lo lea en
 * la definición, revienta la función entera y no se ve en el diff. */
const GEO_JSON = JSON.parse(require('fs').readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));

/* Los cuatro machotes de ejemplo, leídos del propio `demo.js` y SIN `_demo`.
 * Se cargan en un `vm` mínimo para no duplicar aquí doscientas líneas de
 * fixture que se separarían del original a la primera. */
const MACHOTES_FIXTURE = (function () {
  const vm = require('vm');
  const src = require('fs').readFileSync(
    path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
    require('fs').readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES)).map(function (m) {
    delete m._demo; return m;
  });
})();

/* ── V1.27 · las pruebas SIEMBRAN sus datos ──────────────────────────────
 *
 * Hasta V1.26 la pantalla arrancaba con los cuatro ejemplos de `demo.js` y las
 * pruebas se colgaban de ellos. Los ejemplos se retiraron (tres veces acabaron
 * en producción: Esteban, Ricardo y Montalvo, quemando COT-0009 a COT-0012),
 * así que ahora la fixture es explícita — que además es como debió estar
 * siempre: una prueba que depende de datos que la aplicación trae de regalo
 * mide dos cosas a la vez.
 *
 * Se siembran SIN la marca `_demo`: para la aplicación son cotizaciones como
 * cualquier otra, que es exactamente lo que las pruebas quieren ejercitar. */
const sembrarMachotes = (pg) => pg.addInitScript((lista) => {
  const sembrar = function () {
    try {
      /* ⚠️ SÓLO si no hay nada. Sembrar encima pisaría lo que la prueba acaba
       * de capturar — y hay pruebas que miden justamente que lo capturado
       * sobreviva a recargar. La fixture es el punto de partida, no un estado
       * que se reimponga en cada navegación. */
      if (localStorage.getItem('fts_machote_v1')) return;
      localStorage.setItem('fts_machote_v1', JSON.stringify({
        v: 1, guardado_at: new Date().toISOString(), machotes: lista, handoff: {}
      }));
    } catch (e) {}
  };
  /* ⚠️ La suite llama `localStorage.clear()` en SU propio guion de arranque
   * —a propósito, para que cada prueba parta limpia— y ese guion se registra
   * DESPUÉS que éste, así que se lleva la fixture por delante. En vez de pelear
   * con el orden de registro en dieciséis sitios, la fixture se vuelve a poner
   * después de cada `clear()`.
   *
   * `removeItem` NO se toca: las páginas que quieren arrancar SIN nada local
   * (las que traen su propio servidor fingido) lo usan para decirlo, y tienen
   * que seguir pudiendo decirlo. */
  try {
    const clearOriginal = localStorage.clear.bind(localStorage);
    localStorage.clear = function () { clearOriginal(); sembrar(); };
  } catch (e) {}
  sembrar();
}, MACHOTES_FIXTURE);

const sembrarGeo = (pg) => pg.addInitScript((g) => {
  window.__GEO = g;
  const orig = window.fetch;
  window.fetch = function (u) {
    if (String(u).indexOf('geo.json') >= 0) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(g); } });
    }
    return orig.apply(this, arguments);
  };
}, GEO_JSON);

/* El navegador con el que se corre.
 *
 * En una laptop basta `chromium.launch()`. En el contenedor de Claude Code el
 * binario vive en una ruta fija y NO se puede descargar (cdn.playwright.dev
 * está fuera de la lista blanca del proxy), así que se apunta a mano.
 * Se prefiere `headless_shell`, que es lo que Playwright usa de todos modos
 * para modo headless desde la 1.49.
 *
 * Si en tu máquina Playwright ya tiene su navegador, borra `executablePath`
 * o exporta CHROMIUM_PATH con la ruta que quieras. */
const fs = require('fs');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const OPCIONES = EXE ? { executablePath: EXE } : {};


/* ═══ Capturas V1.33 ═══════════════════════════════════════════════════════
 * Una pantalla se revisa MIRÁNDOLA, no leyendo su diff (CLAUDE.md §20 #12).
 * Reusa el preámbulo de `pruebas-navegador.js` —mismo fixture, mismo
 * navegador, mismo sembrado— para que lo que se mira sea lo que se prueba.
 *   node comercial/machote/tests/capturas-v133.js
 */
const OUT = process.env.OUT || '/tmp/capturas-v133';
const PLANT = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'plantillas-notas.json'), 'utf8'));

(async () => {
  try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
  const b = await chromium.launch(OPCIONES);
  const problemas = [];

  for (const [ancho, alto, tag] of [[1280, 1400, '1280'], [380, 1600, '380']]) {
    const q = await b.newPage({ viewport: { width: ancho, height: alto } });
    q.setDefaultTimeout(20000);
    q.on('pageerror', e => problemas.push(tag + ' PAGEERROR: ' + e.message));
    q.on('console', m => { if (m.type() === 'error' &&
      !/fonts\.google|gstatic|ERR_CERT|version\.json/.test(m.text()))
      problemas.push(tag + ' CONSOLE: ' + m.text()); });

    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript((pl) => {
      const poner = function () {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
            scopes: ['comercial:read', 'comercial:orden'],
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-1041': { version: 3, huella: 'x',
                        machote_id: '11111111-2222-3333-4444-555555555555' } }));
          const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
          if (d && d.machotes && d.machotes.length) {
            d.machotes.forEach(function (m) {
              if (!m.cliente_id) { m.cliente_id = 991; m.cliente = 'ZZ Cliente de prueba'; }
            });
            localStorage.setItem('fts_machote_v1', JSON.stringify(d));
          }
          if (window.MachoteDocumento) window.MachoteDocumento.sembrarPlantillas(pl);
        } catch (e) {}
      };
      poner();
      window.addEventListener('DOMContentLoaded', poner);
      document.addEventListener('readystatechange', poner);
    }, PLANT);

    await q.goto(BASE); await q.waitForTimeout(900);
    const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
    await q.goto(BASE + href); await q.waitForTimeout(900);
    await q.click('#btnOrden'); await q.waitForTimeout(900);

    await q.screenshot({ path: OUT + '/v133-' + tag + '-a-compromisos-vacios.png', fullPage: true });

    await q.selectOption('#cp-pago', '30');
    await q.selectOption('#cp-incoterm', 'DAP');
    await q.fill('#cp-entrega', '8 a 10 semanas a partir del anticipo');
    await q.fill('#cp-entrega-fecha', '2026-12-15');
    await q.click('#cp-hito-mas'); await q.waitForTimeout(300);
    await q.fill('[data-hito="0"][data-campo="concepto"]', 'Anticipo');
    await q.fill('[data-hito="0"][data-campo="porcentaje"]', '50');
    await q.fill('[data-hito="0"][data-campo="cuando"]', 'contra firma de contrato');
    await q.click('#cp-hito-mas'); await q.waitForTimeout(300);
    await q.fill('[data-hito="1"][data-campo="concepto"]', 'Saldo');
    await q.fill('[data-hito="1"][data-campo="porcentaje"]', '50');
    await q.fill('[data-hito="1"][data-campo="cuando"]', 'contra entrega');
    await q.waitForTimeout(500);
    await q.screenshot({ path: OUT + '/v133-' + tag + '-b-compromisos-llenos.png', fullPage: true });

    await q.evaluate(() => {
      const d = document.getElementById('or-doc');
      if (d) d.scrollIntoView({ block: 'start' });
    });
    await q.waitForTimeout(400);
    await q.screenshot({ path: OUT + '/v133-' + tag + '-c-documento.png' });

    const r = await q.evaluate(() => ({
      trabado: document.getElementById('or-crear').disabled,
      desborde: document.documentElement.scrollWidth > window.innerWidth + 1,
      ancho: document.documentElement.scrollWidth, ventana: window.innerWidth,
      bloques: window.MachoteDocumento.cuenta(window.MachoteOrden._doc().bloques)
    }));
    console.log(tag + ' → trabado:' + r.trabado + ' · desborde:' + r.desborde +
                ' (' + r.ancho + '/' + r.ventana + ') · ' + JSON.stringify(r.bloques));
    await q.close();
  }
  await b.close();
  if (problemas.length) { console.log('\nPROBLEMAS:'); problemas.forEach(e => console.log('  ' + e)); }
  else console.log('\nsin errores de consola propios');
})();
