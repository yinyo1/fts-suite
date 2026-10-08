#!/usr/bin/env node
// Captura del interruptor "Permitir checada en todo USA" en el panel de Operaciones > Config > Kiosk,
// a 380/760/900/1280 px, con public-config.json simulado en APAGADO para probar que el panel
// muestra el valor PUBLICADO y no el del navegador (que se siembra en '1').
//   SHOTS_DIR=docs/kiosko/usa/capturas node tests/kiosko-usa/captura-config.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-kiosko-usa';
fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium']
  .find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext();
  const pub = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8'));
  pub.zonas_region.usa.activo = false;
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pub) }));
  await ctx.addInitScript(() => { localStorage.setItem('ops_master_pin', '9999'); localStorage.setItem('ops_kiosk_zona_usa', '1'); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/operaciones/config/index.html');
  await page.fill('#masterPin', '9999'); await page.evaluate(() => tryAuth()); await page.evaluate(() => showTab('kiosk'));
  await page.waitForFunction(() => document.getElementById('ops_kiosk_zona_usa').checked === false, null, { timeout: 5000 });
  console.log('panel muestra el valor publicado (apagado):', await page.evaluate(() => document.getElementById('ops_kiosk_zona_usa').checked === false));
  for (const w of [380, 760, 900, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    const card = page.locator('.cfg-card', { hasText: 'Zona región USA' });
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(OUT, 'config-zona-usa-' + w + '.png') });
  }
  console.log('errores JS:', errs.length ? errs : 'ninguno');
  await browser.close(); srv.close();
  process.exit(errs.length ? 1 : 0);
})();
