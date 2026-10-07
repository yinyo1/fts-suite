// ═══ Manual visual de RH · Retardos (#386) ═══
// Toma las capturas del manual desde el panel REAL en modo de ejemplo (nombres inventados,
// sin servidor). Si cambia un botón, se vuelve a correr y el manual se actualiza solo.
//   NODE_PATH=$(npm root -g) node docs/retardos/armar-manual-rh.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'manual-rh', 'img');
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  await new Promise(ok => srv.listen(0, ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/retardos/index.html';
  const nav = await chromium.launch({ executablePath: EXE });
  const errores = [];
  const pg = await nav.newPage({ viewport: { width: 1100, height: 800 }, colorScheme: 'light', deviceScaleFactor: 1 });
  pg.on('pageerror', e => errores.push(e.message));
  const foto = async (nombre, sel) => {
    const el = sel ? await pg.$(sel) : null;
    if (sel && !el) { errores.push('no encontré ' + sel + ' para ' + nombre); return; }
    if (el) await el.screenshot({ path: path.join(OUT, nombre + '.png') });
    else await pg.screenshot({ path: path.join(OUT, nombre + '.png') });
  };
  const caso = async (folio) => {
    await pg.click('[data-vista="lista"]'); await pg.waitForSelector('tr.fila');
    if (await pg.isVisible('#ver-todos')) { await pg.click('#ver-todos'); await pg.waitForSelector('tr.fila'); }
    await pg.click('tr.fila[data-folio="' + folio + '"]'); await pg.waitForSelector('.detalle');
  };
  // Los datos de ejemplo traen casos de suspensión; el módulo ya no suspende. Se ocultan en las capturas.
  const sinSuspension = () => pg.evaluate(() => document.querySelectorAll('tr.fila').forEach(f => { if (/Suspensi/.test(f.textContent)) f.remove(); }));
  const queSigue = 'section.caja:has(h2:text-is("Qué sigue"))';

  await pg.goto(url);
  await pg.waitForSelector('#puerta');
  await foto('01-entrar', '#puerta');
  await pg.click('#demo');
  await pg.waitForSelector('tr.fila');
  await pg.evaluate(() => { const a = document.querySelector('#aviso-demo'); if (a) a.remove(); });
  await foto('02-avisos', '#salud');
  await sinSuspension();
  await foto('03-casos', '#app');

  // Firmas por recolectar
  await pg.click('[data-cubeta="recolectar"]'); await pg.waitForSelector('tr.fila');
  await sinSuspension();
  await foto('04-firmas-por-recolectar', '#app');
  await caso('RET-2026-0041');
  await foto('05-que-sigue', queSigue);
  await pg.click('[data-accion="subir"]'); await pg.waitForSelector('[data-enviar="subir_hoja"]');
  await foto('06-subir-hoja-recolectada', queSigue);
  await caso('RET-2026-0041');
  await pg.click('[data-accion="negativa"]'); await pg.waitForTimeout(200);
  await foto('07-se-nego-a-firmar', queSigue);
  await caso('RET-2026-0041');
  await pg.click('[data-accion="cancelar"]'); await pg.waitForSelector('[data-enviar="cancelar"]');
  await foto('08-cancelar-caso', queSigue);

  // Hojas por confirmar
  await pg.click('[data-vista="hojas"]'); await pg.waitForSelector('#h-subir');
  await foto('09-subir-hojas', 'section.caja:has(h2:text-is("Subir hojas"))');
  await foto('10-hoja-decisiones', '#lectura-71');

  // Jornada
  await pg.click('[data-vista="jornada"]'); await pg.waitForSelector('[data-jrev]');
  await foto('11-jornada-por-revisar', 'section.caja:has(h2:text-is("Jornada por revisar"))');

  // Caso de RH y caso de sombra
  await caso('RET-2026-0050');
  await foto('12-caso-de-rh', '.detalle');
  await pg.click('[data-vista="lista"]'); await pg.waitForSelector('tr.fila');
  if (await pg.isVisible('#ver-todos')) { await pg.click('#ver-todos'); await pg.waitForSelector('tr.fila'); }
  await sinSuspension();
  await foto('13-lista-real-y-sombra', 'table');
  await caso('RET-2026-0042');
  await foto('14-caso-sombra-datos', 'section.caja:has(dt:text-is("Pista"))');

  for (const f of fs.readdirSync(OUT)) if (fs.statSync(path.join(OUT, f)).size < 2000) errores.push('captura casi vacía: ' + f);
  await nav.close(); srv.close();
  if (errores.length) { console.error(errores.join('\n')); process.exit(1); }
  console.log('capturas en', OUT, fs.readdirSync(OUT).length);
})();
