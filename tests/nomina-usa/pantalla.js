#!/usr/bin/env node
// Capturas de la pantalla de Nómina USA (#448) en modo práctica, a 380/760/900/1280 px
// (CLAUDE.md §20 #20) y por cada rol. Falla si hay un error de JavaScript en la página o si
// algo desborda horizontalmente la página. NO toca ningún servidor: modo práctica.
//   SHOTS_DIR=docs/nomina-usa/capturas node tests/nomina-usa/pantalla.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('./lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium']
  .find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const ANCHOS = (process.env.ANCHOS || '380,760,900,1280').split(',').map(Number);
// [rol, pestaña, acción opcional dentro de la página]
const CASOS = require('./pantalla-casos.js');
(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  for (const c of CASOS) {
    seccion(c.rol + ' · ' + c.tab + (c.nombre ? ' · ' + c.nombre : ''));
    const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 404, body: 'bloqueado en prueba' }));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/modulos/rh/nomina-usa/index.html?practica=' + c.rol);
    await page.waitForSelector('#tabs .tab');
    await page.evaluate(id => NusaApp.abrir(id), c.tab);
    await page.waitForFunction(() => !/Cargando/.test(document.getElementById('vista').textContent));
    if (c.accion) { await page.evaluate(c.accion); await page.waitForTimeout(150); }
    if (c.espera) check(c.espera.nombre, await page.evaluate(c.espera.fn), await page.evaluate(() => document.getElementById('vista').innerText.slice(0, 300)));
    for (const w of ANCHOS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(80);
      const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check('sin desborde horizontal a ' + w + ' px', !desborda);
      if (OUT) await page.screenshot({ path: path.join(OUT, [c.rol, c.tab, c.nombre || ''].filter(Boolean).join('-') + '-' + w + '.png'), fullPage: true });
    }
    check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close(); fin();
})();
