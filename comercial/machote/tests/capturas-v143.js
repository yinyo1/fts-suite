/* ═══ Capturas de la V1.43 · la hoja de trabajo, para MIRARLAS ═══
 *
 *   node comercial/machote/tests/capturas-v143.js [carpeta]
 *
 * CLAUDE.md §20 #20: cuatro anchos —380, 760, 900 y 1280— con la fila más
 * larga que exista de verdad, y MIRADAS una por una. No es un sustituto de las
 * pruebas: es el paso que encuentra lo que ninguna prueba mide, porque en este
 * módulo dos defectos seguidos vivieron en la franja de 721 a 980 px, donde una
 * media query se apagó y la otra todavía no entraba.
 *
 * Se capturan DOS superficies por ancho:
 *   · la PREVIA del tercer cuadrante (sin cinta, cuatro filas);
 *   · el POPUP extendido (con cinta, 30 × 15), con moneda puesta en la columna
 *     del importe — que es el string más largo que va a haber ahí.
 *
 * ⚠️ NO se suben al repo: es público (§20 #7) y aunque estos datos son de la
 * fixture de ejemplo, la regla de la sesión es explícita. La carpeta por
 * omisión está fuera del árbol del repositorio.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SALIDA = process.argv[2] || path.join(require('os').tmpdir(), 'capturas-v143');

const CAND = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const GEO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared', 'comercial', 'geo.json'), 'utf8'));
const MACHOTES = (function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.join(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES)).map(m => { delete m._demo; return m; });
})();

/* La fila más larga que existe de verdad: importes de siete dígitos con formato
 * de moneda, que es lo que hay en una hoja de FTS en cuanto alguien calcula un
 * proyecto completo. Un ejemplo corto cabe en cualquier parte y no prueba nada. */
const FILAS = [
  ['12', '48500', '=A1*B1', 'Estructura principal · PTR 4"'],
  ['3', '128400', '=A2*B2', 'Tablero de control'],
  ['1', '1234567', '=A3*B3', 'Subestación 1,000 kVA'],
  ['', '', '=SUMA(C1:C3)', 'TOTAL DEL ALCANCE']
];

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errores = [];
  for (const [w, h] of [[380, 820], [760, 900], [900, 900], [1280, 950]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errores.push(w + 'px PAGEERROR: ' + e.message));
    await p.route('**/geo.json*', r => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify(GEO) }));
    await p.addInitScript((m) => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
          scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600 }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1,
          guardado_at: new Date().toISOString(), machotes: m, handoff: {} }));
      } catch (e) {}
    }, MACHOTES);
    await p.goto(BASE); await p.waitForTimeout(1000);
    await p.evaluate(() => { location.hash = '#/m/M-1041'; }); await p.waitForTimeout(900);
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(500);

    await (await p.$('[data-padabrir]')).click(); await p.waitForTimeout(600);
    const sid = await p.evaluate(() =>
      document.querySelector('[data-padonde="full"][data-padcel]').dataset.padcel.split('|')[0]);
    const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
    for (let i = 0; i < FILAS.length; i++) {
      for (let j = 0; j < FILAS[i].length; j++) {
        if (!FILAS[i][j]) continue;
        const sl = cel(i, j);
        const e = await p.$(sl); if (!e) continue;
        await e.scrollIntoViewIfNeeded();
        await p.click(sl); await p.fill(sl, FILAS[i][j]);
        await p.dispatchEvent(sl, 'input'); await p.waitForTimeout(70);
      }
    }
    // Moneda en la columna del importe y negrita en el renglón del total.
    await p.click('.pad-panel th[data-padcol="C"]'); await p.waitForTimeout(200);
    await p.click('.pad-cinta [data-padfmt="n"][data-padval="m"]'); await p.waitForTimeout(280);
    await p.click('.pad-panel th[data-padfila="3"]'); await p.waitForTimeout(200);
    await p.click('.pad-cinta .pad-h[data-padfmt="b"]'); await p.waitForTimeout(280);
    await p.click('.pad-cinta [data-padpop="g"]'); await p.waitForTimeout(200);
    await p.click('.pad-cinta .pad-pop[data-padpopfor="g"] .pad-sw[data-padval="FFFF00"]');
    await p.waitForTimeout(400);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    /* ⚠️ Se devuelve la rejilla al principio. Teclear en las celdas la fue
     * desplazando a la derecha (`scrollIntoViewIfNeeded`), y una captura que
     * arranca a media hoja enseña un estado que nadie ve al abrirla: la primera
     * imagen tiene que ser la primera pantalla. */
    await p.evaluate(() => { const r = document.querySelector('.pad-rejilla'); if (r) r.scrollLeft = 0; });
    await p.waitForTimeout(400);

    const f1 = path.join(SALIDA, w + '-popup.png');
    await p.screenshot({ path: f1 });
    console.log('  ' + f1);

    /* La misma hoja desplazada hasta la O, que es la mitad que no se ve en la
     * primera captura y donde vive el congelado del número de fila. */
    await p.evaluate(() => { const r = document.querySelector('.pad-rejilla'); r.scrollLeft = r.scrollWidth; });
    await p.waitForTimeout(300);
    const f2 = path.join(SALIDA, w + '-popup-hasta-O.png');
    await p.screenshot({ path: f2 });
    console.log('  ' + f2);

    // Y la previa del cuadrante, con el popup cerrado.
    await p.click('[data-padcerrar]'); await p.waitForTimeout(500);
    const blk = await p.$('.blk-pad');
    const visible = blk && await blk.evaluate(e =>
      getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
    /* ⚠️ Se LLEVA A LA VISTA antes de capturar. De 721 a 1000 px el cuadrante
     * cae a su propio renglón y queda bajo el pliegue: una captura del principio
     * de la página no lo enseña, y «no aparece en la captura» se lee igual que
     * «no se pintó» — que es justo la franja donde este módulo ya se rompió dos
     * veces (§20 #20). */
    if (visible) { await blk.scrollIntoViewIfNeeded(); await p.waitForTimeout(350); }
    const f3 = path.join(SALIDA, w + '-previa.png');
    await p.screenshot({ path: f3 });
    console.log('  ' + f3 + (visible ? '' : '   (a este ancho el cuadrante se esconde a propósito)'));
    await p.close();
  }
  await b.close();
  if (errores.length) { console.log('\n⚠️ errores de página:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\nCapturas en ' + SALIDA + ' — MIRARLAS una por una (§20 #20).');
})();
