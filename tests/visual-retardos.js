// ═══ Revisión visual — RH · Retardos (#334) ═══
// Abre el panel en modo de ejemplo (datos inventados, sin servidor), recorre lista,
// detalle con acciones y reglas a CUATRO anchos (§20 #20) y truena ante cualquier
// pageerror (§20 #12). Las capturas se MIRAN; que el guion termine no prueba nada.
//   NODE_PATH=$(npm root -g) node tests/visual-retardos.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..');
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-retardos';
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
(async () => {
  await new Promise(ok => srv.listen(0, ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/retardos/index.html';
  const nav = await chromium.launch({ executablePath: EXE });
  const errores = [];
  for (const ancho of [380, 760, 900, 1280]) {
    for (const tema of ['light', 'dark']) {
      if (tema === 'dark' && ancho !== 380 && ancho !== 1280) continue;
      const pg = await nav.newPage({ viewport: { width: ancho, height: 900 }, colorScheme: tema });
      pg.on('pageerror', e => errores.push(ancho + ' ' + e.message));
      await pg.goto(url);
      await pg.click('#demo');
      await pg.waitForSelector('tr.fila');
      await pg.screenshot({ path: OUT + '/lista-' + ancho + '-' + tema + '.png', fullPage: true });
      const ancho2 = await pg.evaluate(() => document.documentElement.scrollWidth);
      if (ancho2 > ancho) errores.push(ancho + ' desborde horizontal: ' + ancho2);
      await pg.click('tr.fila[data-folio="RET-2026-0043"]');
      await pg.waitForSelector('[data-accion="validar"]');
      await pg.click('[data-ver]');
      await pg.waitForSelector('#visor svg');
      await pg.click('[data-accion="validar"]');
      await pg.screenshot({ path: OUT + '/detalle-' + ancho + '-' + tema + '.png', fullPage: true });
      await pg.click('[data-enviar="validar_firma"]');
      await pg.waitForSelector('.chip.e-cerrado');
      if (tema === 'light') {
        await pg.click('#volver');
        await pg.waitForSelector('tr.fila');
        await pg.click('tr.fila[data-folio="RET-2026-0044"]');
        await pg.click('[data-accion="programar"]');
        await pg.fill('#f-desde', '2026-10-05'); await pg.fill('#f-dias', '9');
        await pg.click('[data-enviar="programar_accion"]');
        await pg.waitForFunction(() => document.querySelector('#f-err').textContent.length > 0);
        const msg = await pg.textContent('#f-err');
        if (!/1 a 8/.test(msg)) errores.push(ancho + ' no rechazó 9 días: ' + msg);
        await pg.click('[data-vista="calidad"]');
        await pg.waitForSelector('[data-revisar]');
        await pg.click('[data-revisar="501"]');
        await pg.fill('#rv-nota', 'Su entrada real es 7:30; se corrige en Odoo');
        await pg.click('[data-guardar-revision="501"]');
        await pg.waitForSelector('[data-revisar="501"][data-valor="0"]');
        await pg.waitForTimeout(3400);
        await pg.screenshot({ path: OUT + '/calidad-' + ancho + '.png', fullPage: true });
        const anchoCal = await pg.evaluate(() => document.documentElement.scrollWidth);
        if (anchoCal > ancho) errores.push(ancho + ' desborde horizontal en calidad: ' + anchoCal);
        await pg.click('[data-vista="lista"]');
        await pg.waitForSelector('[data-cubeta="retenidos"]');
        await pg.click('[data-cubeta="retenidos"]');
        const nRet = await pg.$$eval('tr.fila', (f) => f.length);
        if (nRet !== 1) errores.push(ancho + ' la cubeta de retenidos no filtra: ' + nRet);
        await pg.click('[data-vista="ajustes"]');
        await pg.waitForSelector('#x-agregar');
        await pg.screenshot({ path: OUT + '/reglas-' + ancho + '.png', fullPage: true });
      }
      await pg.close();
    }
  }
  await nav.close(); srv.close();
  if (errores.length) { console.error('FALLAS:\n' + errores.join('\n')); process.exit(1); }
  console.log('OK · capturas en ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
