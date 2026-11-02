#!/usr/bin/env node
// Guías por rol (#448, MVP paso 6): al día con su generador, sin desborde a 380/1280 px,
// cero errores JS, y enlazadas desde la pantalla. SHOTS_DIR=… para las capturas.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('./lib/t');
const RAIZ = path.resolve(__dirname, '..', '..'), OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
seccion('Generador');
let ok = true; try { execFileSync('node', [path.join(RAIZ, 'docs/nomina-usa/guias/armar.js'), '--revisar']); } catch (e) { ok = false; }
check('las páginas coinciden con armar.js (fuente única)', ok);
check('la pantalla enlaza la guía', /docs\/nomina-usa\/guias\/index\.html/.test(fs.readFileSync(path.join(RAIZ, 'modulos/rh/nomina-usa/index.html'), 'utf8')));
const PAG = ['index', 'richard', 'cuadrilla', 'magaly', 'erick', 'gerardo', 'esteban'];
check('sin hojas de estilo aparte (§20 #23)', PAG.every(p => !/<link[^>]+stylesheet/.test(fs.readFileSync(path.join(RAIZ, 'docs/nomina-usa/guias', p + '.html'), 'utf8'))));
(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const b = await chromium.launch({ executablePath: EXE });
  for (const p of PAG) {
    seccion(p);
    const page = await b.newPage({ viewport: { width: 380, height: 800 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:' + srv.address().port + '/docs/nomina-usa/guias/' + p + '.html');
    for (const w of [380, 1280]) { await page.setViewportSize({ width: w, height: 800 });
      check('sin desborde a ' + w, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      if (OUT) await page.screenshot({ path: path.join(OUT, 'guia-' + p + '-' + w + '.png'), fullPage: true }); }
    check('calendario de la semana presente', /Miércoles 9:00/.test(await page.innerText('body')));
    check('cero errores JS', errs.length === 0, errs.join('|'));
    await page.close();
  }
  await b.close(); srv.close(); fin();
})();
