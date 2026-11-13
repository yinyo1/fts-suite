// Prueba de pantalla de Seguridad → Instructor DC-3 (#505).
// Uso:  BASE=http://localhost:8765 node seguridad/tests/dc3-pantalla.e2e.js [carpeta_capturas]
//       BASE=https://yinyo1.github.io/fts-suite node seguridad/tests/dc3-pantalla.e2e.js
// Crea una sesión FTSAuth de prueba SOLO en el navegador de la prueba (localStorage);
// no llama a Odoo, n8n ni escribe nada en el servidor. Trabajadores y CURP son inventados.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = (process.env.BASE || 'http://localhost:8765').replace(/\/$/, '');
const SHOTS = process.argv[2] || null;
const ESPERADO_VER = '1.2.0';
const resultados = [];
function check(nombre, ok, detalle) { resultados.push({ nombre, ok: !!ok, detalle }); console.log((ok ? 'OK   ' : 'FALLA ') + nombre + (detalle ? '  → ' + detalle : '')); }

async function sesion(page) {
  await page.addInitScript(() => {
    localStorage.setItem('fts_session', JSON.stringify({ userId: 'e2e', username: 'prueba.e2e', nombre: 'PRUEBA E2E', role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now() }));
  });
}
// Registra los textos que jsPDF escribe para leer el «Periodo de ejecución» de cada página.
async function espiaPDF(page) {
  await page.evaluate(() => {
    window.__periodos = [];
    if (window.__espiaPuesta) return;
    window.__espiaPuesta = true;
    const Orig = window.jspdf.jsPDF;
    window.jspdf.jsPDF = new Proxy(Orig, { construct(T, args) {
      const doc = new T(...args), orig = doc.text;
      let cola = null;
      doc.text = function (t) {
        const s = Array.isArray(t) ? t.join(' ') : String(t);
        if (s === 'De') cola = [];
        else if (cola && s !== 'a' && /^\d$/.test(s)) {
          cola.push(s);
          if (cola.length === 16) { const x = cola.join(''); window.__periodos.push(x.slice(0, 4) + '/' + x.slice(4, 6) + '/' + x.slice(6, 8) + ' a ' + x.slice(8, 12) + '/' + x.slice(12, 14) + '/' + x.slice(14, 16)); cola = null; }
        }
        return orig.apply(this, arguments);
      };
      return doc;
    } });
  });
}
async function shot(page, nombre, full) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, nombre + '.png'), fullPage: !!full }); }
async function tab(page, texto) { await page.locator('#s-inst .tab-row .tab', { hasText: texto }).click(); await page.waitForTimeout(150); }

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  const errores = [];

  // ── 1. Login y lanzador intactos ──
  {
    const ctx = await b.newContext({ viewport: { width: 380, height: 800 } });
    const p = await ctx.newPage(); p.on('pageerror', e => errores.push('lanzador: ' + e.message));
    await p.goto(BASE + '/seguridad/index.html'); await p.waitForTimeout(1500);
    check('Sin sesión, Seguridad regresa al lanzador', /\/index\.html$|\/fts-suite\/?$|\/$/.test(p.url()) && !/seguridad/.test(p.url()), p.url());
    await sesion(p);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(1500);
    check('Lanzador con sesión muestra la tarjeta Seguridad', await p.locator('#card-seguridad').isVisible());
    await ctx.close();
  }

  const ctx = await b.newContext({ viewport: { width: 380, height: 820 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => { errores.push('alerta: ' + d.message().slice(0, 200)); d.dismiss(); });
  await sesion(p);
  await p.goto(BASE + '/seguridad/index.html?e2e=' + Date.now()); await p.waitForTimeout(2000);
  await p.evaluate(() => goInstPin()); await p.waitForTimeout(400);

  // ── 2. Versión, pestañas y detalles visuales ──
  const ver = await p.textContent('#dc3-ver-inst'), sb = await p.getAttribute('#dc3-ver-inst', 'title');
  check('Versión visible en el panel', ver.trim() === 'v' + ESPERADO_VER, ver + ' · ' + sb);
  const tabs = await p.$$eval('#s-inst .tab-row .tab', ts => ts.map(t => ({ t: t.textContent.trim(), cortado: t.scrollWidth > t.clientWidth + 1 })));
  check('4 pestañas en orden', tabs.map(t => t.t).join(' | ') === '👷 Trabajadores | 📋 Cursos | 📄 Generar DC-3 | 🗂️ Impresión por Lote', tabs.map(t => t.t).join(' | '));
  check('Ninguna pestaña corta su texto', tabs.every(t => !t.cortado));
  check('La página no se desplaza de lado', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const solapa = await p.evaluate(() => {
    const a = document.getElementById('btn-suite-global').getBoundingClientRect();
    const t = document.querySelector('#s-inst .tb-info strong').getBoundingClientRect();
    return { suiteDer: Math.round(a.right), tituloIzq: Math.round(t.left), choca: a.right > t.left && a.bottom > t.top };
  });
  check('«← Suite» ya no tapa «Panel del Instructor»', !solapa.choca, JSON.stringify(solapa));
  await shot(p, '01-panel-380');

  await p.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await p.waitForTimeout(200);
  const pwa = await p.evaluate(() => { const el = [...document.querySelectorAll('#pwa-bar div')].find(d => d.textContent.trim() === 'Instalar FTS Capacitación'); return el ? getComputedStyle(el).color : null; });
  check('Aviso PWA: título claro sobre fondo oscuro', pwa === 'rgb(255, 255, 255)', pwa);
  await shot(p, '02-pwa-380');
  await p.evaluate(() => { const x = document.getElementById('pwa-x'); if (x) x.click(); });

  // ── 3. Trabajadores (sin cambios): alta de 2 de ejemplo ──
  for (const [ap, am, nom, curp] of [['PRUEBA', 'UNO', 'ANA', 'XEXX010101MNLXXX01'], ['PRUEBA', 'DOS', 'BRUNO', 'XEXX010101HNLXXX02']]) {
    await p.fill('#new-ap', ap); await p.fill('#new-am', am); await p.fill('#new-nom', nom); await p.fill('#new-curp', curp);
    await p.click('#tp-workers button.btn-p');
  }
  check('Trabajadores: alta funciona igual', (await p.locator('#worker-list .worker-row').count()) === 2);

  // ── 4. Cursos (sin cambios) + curso personalizado de 4 h ──
  await tab(p, 'Cursos');
  await p.click('button:has-text("✗ Ninguno")');
  await p.click('button:has-text("Curso personalizado")');
  await p.fill('#nc-nombre', 'CURSO PRUEBA CUATRO HORAS'); await p.fill('#nc-hrs', '4');
  await p.click('button:has-text("Agregar y seleccionar")');
  const sel = await p.evaluate(() => [...inst.selCourses]);
  check('Cursos: selección y curso personalizado funcionan igual', sel.length === 1, JSON.stringify(sel));
  await p.evaluate(() => { inst.selCourses.clear(); inst.selCourses.add(1); renderCourseSelector(); }); // LO-TO 8 h

  // ── 5. Generar DC-3 individual con periodo real ──
  await tab(p, 'Generar DC-3');
  await p.fill('#inst-fecha', '2026-11-20'); await p.dispatchEvent('#inst-fecha', 'change');
  await p.fill('#inst-fecha-fin', '2026-11-20'); await p.dispatchEvent('#inst-fecha-fin', 'change');
  await espiaPDF(p);
  const descargas = [];
  p.on('download', d => descargas.push(d));
  await p.evaluate(() => { inst.selWorkers.clear(); inst.selWorkers.add(0); renderGenSummary(); });
  await shot(p, '03-generar-ok-380', true);
  await p.click('#tp-generate button.btn-p'); await p.waitForTimeout(1500);
  const per1 = await p.evaluate(() => window.__periodos.slice());
  check('DC-3 individual: periodo real, sin año de vigencia', per1.length === 1 && per1[0] === '2026/11/20 a 2026/11/20', JSON.stringify(per1));
  check('DC-3 individual: descarga el PDF', descargas.length === 1 && /\.pdf$/.test(descargas[0].suggestedFilename()), descargas.map(d => d.suggestedFilename()).join(','));

  // 16 h en un día: bloquea
  await p.evaluate(() => { inst.selCourses.clear(); inst.selCourses.add(9); renderGenSummary(); }); // ARC FLASH 16 h
  const err16 = await p.textContent('#gen-val');
  await p.evaluate(() => { window.__periodos = []; }); const antes = descargas.length;
  await p.click('#tp-generate button.btn-p'); await p.waitForTimeout(800);
  check('DC-3 individual: 16 h en 1 día bloquea con mensaje claro', /al menos 2 días/.test(err16) && descargas.length === antes, err16.trim().slice(0, 140));
  await shot(p, '04-generar-16h-bloquea-380', true);
  await p.fill('#inst-fecha-fin', '2026-11-21'); await p.dispatchEvent('#inst-fecha-fin', 'change');
  await p.click('#tp-generate button.btn-p'); await p.waitForTimeout(1500);
  const per16 = await p.evaluate(() => window.__periodos.slice());
  check('DC-3 individual: 16 h del vie 20 al sáb 21-nov pasa', per16[0] === '2026/11/20 a 2026/11/21' && descargas.length === antes + 1, JSON.stringify(per16));

  // ── 6. Impresión por Lote ──
  await tab(p, 'Impresión por Lote');
  await p.fill('#lote-ini', '2026-11-20');
  const cel = (w, c) => p.locator(`#lote-mx td.lm-cel input[data-w="${w}"][data-c="${c}"]`);
  await cel(0, 1).check(); await cel(0, 2).check(); // ANA: 8 h + 6 h el mismo día
  await p.waitForTimeout(150);
  const eCel = await p.locator('#lote-mx td.lm-cel.err .lm-e').first().textContent().catch(() => '');
  const dis1 = await p.locator('#lote-btn').isDisabled();
  check('Lote: 8 h + 6 h misma persona bloquea, error en la celda con día y horas', /20\/11: 14 h sumadas/.test(eCel) && dis1, eCel);
  await shot(p, '05-lote-error-380', true);
  await cel(0, 2).uncheck();
  await cel(0, 9001).check(); // ANA: 8 h + 4 h → 12 h
  await cel(1, 9).check();    // BRUNO: 16 h → fin mínima 21-nov (sábado)
  await cel(1, 7).check();    // BRUNO: 12 h el 20-nov → 8 (parejo) + 12 = 20 → bloquea
  await p.waitForTimeout(150);
  const dis2 = await p.locator('#lote-btn').isDisabled();
  const eB = await p.locator('#lote-asg .li-e').first().textContent().catch(() => '');
  check('Lote: 16 h (20–21) + 12 h el 20 misma persona bloquea (reparto parejo 8 + 12)', dis2 && /20 h sumadas/.test(eB), eB);
  await cel(1, 7).uncheck();
  // Columna completa: el mismo curso de 12 h a las dos personas el mismo día no se suma entre ellas
  await p.waitForTimeout(150);
  const fin16 = await p.evaluate(() => lote.asg.find(a => a.empleado === 1 && String(a.curso) === '9').fin);
  check('Lote: 16 h sale del vie 20 al sáb 21-nov', fin16 === '2026-11-21', fin16);
  const dis3 = await p.locator('#lote-btn').isDisabled();
  check('Lote: 8 h + 4 h misma persona pasa; botón habilitado', !dis3);
  await shot(p, '06-lote-ok-380', true);

  await espiaPDF(p);
  const [zipDl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#lote-btn')]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc3e2e-'));
  const zp = path.join(tmp, zipDl.suggestedFilename()); await zipDl.saveAs(zp);
  const lista = execFileSync('unzip', ['-Z1', zp]).toString().trim().split('\n');
  const perL = await p.evaluate(() => window.__periodos.slice());
  check('Lote: descarga ZIP con un PDF por trabajador', /^DC3_lote_\d{4}-\d{2}-\d{2}\.zip$/.test(zipDl.suggestedFilename()) && lista.length === 2 && lista.every(n => /\.pdf$/.test(n)), zipDl.suggestedFilename() + ' → ' + lista.join(', '));
  check('Lote: una página por curso con su periodo real', JSON.stringify(perL) === JSON.stringify(['2026/11/20 a 2026/11/20', '2026/11/20 a 2026/11/20', '2026/11/20 a 2026/11/21']), JSON.stringify(perL));
  fs.rmSync(tmp, { recursive: true, force: true });

  // Dos personas, mismo curso de 12 h, mismo día
  await p.evaluate(() => { lote.asg = []; renderLote(); });
  await p.locator('#lote-mx th.lm-cur input[data-c="7"]').check(); await p.waitForTimeout(150);
  check('Lote: dos personas, mismo curso de 12 h el mismo día pasa', !(await p.locator('#lote-btn').isDisabled()) && (await p.evaluate(() => lote.asg.length)) === 2);
  // Repetir (mismo curso duplicado a una persona el mismo día)
  await p.evaluate(() => { lote.asg = []; renderLote(); });
  await cel(0, 1).check(); await p.locator('#lote-asg .li-act button', { hasText: 'Repetir' }).first().click(); await p.waitForTimeout(150);
  check('Lote: mismo curso 8 h duplicado a una persona el mismo día bloquea', await p.locator('#lote-btn').isDisabled());
  await p.evaluate(() => { lote.asg = []; renderLote(); });
  await p.locator('#lote-mx td.lm-emp input[data-w="0"]').check(); await p.waitForTimeout(150);
  await shot(p, '07-lote-fila-completa-380', true);

  for (const w of [760, 900, 1280]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(200);
    check('Sin scroll lateral de la página a ' + w + ' px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot(p, '08-lote-' + w, false);
  }

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await b.close();
  const f = resultados.filter(r => !r.ok).length;
  console.log(f ? `\n${f} FALLA(S) de ${resultados.length}` : `\nTodas pasan (${resultados.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
