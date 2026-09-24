// ═══ Revisión visual — Operaciones · Planeación Operativa (arranque y exportar) ═══
//
// POR QUÉ ESTA PRUEBA. El 24-sep-2026 `window.PLANEACION_TURNOS` llegó `undefined` al
// navegador de Felipe: el preview de "Compartir plan" quedó vacío, "Copiar texto" no
// hizo nada y "Generar PNG" tronó con un error técnico. La página no dijo que le
// faltaba un archivo. Esta prueba simula exactamente eso —un <script> que no llega—
// y exige que la pantalla lo DIGA, con el nombre del archivo.
//
// Y con todo cargado exige que el texto y el PNG salgan idénticos a la línea base
// (hash del texto y del PNG con el reloj congelado).
//
// LO QUE ESTA PRUEBA NO ES. No toca Odoo, n8n ni GitHub: todo está interceptado.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`):
//   node tests/visual-planeacion.js                     # todo cargado + faltantes
//   BASELINE=1 node tests/visual-planeacion.js          # sólo imprime hashes (código viejo)
//   H2C=/ruta/html2canvas.min.js node tests/visual-planeacion.js
//     (cdnjs puede estar bloqueado en el contenedor; `npm pack html2canvas@1.4.1` da
//      el mismo archivo)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const H2C = process.env.H2C;
const BASELINE = process.env.BASELINE === '1';

const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-planeacion';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0; const fails = []; let ctx = '';
function check(n, c, d) {
  if (c) { pass++; console.log('✓ [' + ctx + '] ' + n); return true; }
  fails.push('[' + ctx + '] ' + n + (d ? ' → ' + d : ''));
  console.log('✗ [' + ctx + '] ' + n + (d ? ' → ' + d : ''));
  return false;
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir(faltante, truncar) {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      if (faltante && rel.endsWith(faltante)) { rep.writeHead(404); return rep.end('Not Found'); }
      const p = path.join(RAIZ, rel);
      if (truncar && rel.endsWith(truncar)) {   // conexión cortada a media descarga
        const b = fs.readFileSync(p); rep.writeHead(200, { 'Content-Type': TIPOS['.js'] });
        return rep.end(b.subarray(0, Math.floor(b.length / 2)));
      }
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// ── Datos: 12 personas de Operaciones y un plan publicado con 3 proyectos ──
// Nombres y actividades LARGOS a propósito (§20 #20): un ejemplo corto cabe en
// cualquier parte y no prueba nada. Ids 9xxx inventados.
const EMPLEADOS = [
  ['Aurelio Bernal Quintanilla de la Garza'], ['Tomás Ibarra Lozano'], ['Nicolás Peña Ríos'],
  ['Octavio Zamora Villalobos'], ['Rubén Cárdenas Olvera'], ['Damián Fuentes'],
  ['Emiliano Tovar Saldívar'], ['Gustavo Leal Montemayor'], ['Iván Rosales'],
  ['Joaquín Serna'], ['Lorenzo Garza'], ['Maximiliano Ochoa'],
  // Nombres INVENTADOS: el repo es público (CLAUDE.md §20 #7).
].map((n, i) => ({ id: 9101 + i, name: n[0], job_title: 'Técnico', active: true, department_id: [3, 'Operaciones'] }));
const SOS = [
  { so_id: 1, so_nombre: 'SO11547 · Topo Chico — Mantenimiento cortina y caseta L6' },
  { so_id: 2, so_nombre: 'SO11760 · Vertiv — Montaje Panel View y soporte PTR inox R4' },
  { so_id: 3, so_nombre: 'SO11759 · Clarios' }
];
const SLOTS = EMPLEADOS.map((e, i) => ({
  empleado_id: e.id, empleado_nombre: e.name,
  entrada: i % 4 === 3 ? '06:00' : '07:00', salida: i % 4 === 3 ? '15:36' : '17:06',
  actividad: i === 0
    ? 'Fabricación adicional polipasto y cuarto multi-panel: re-ingeniería, materiales, corte/soldadura, pruebas, instalación eléctrica + iluminación + extractor'
    : 'Instalación de charola y cableado en tablero ' + (i + 1),
  so_id: SOS[i % 3].so_id, so_nombre: SOS[i % 3].so_nombre
}));

const FECHA_FIJA = new Date('2026-09-24T14:00:00Z'); // 08:00 CST — reloj congelado para el PNG

async function preparar(page) {
  await page.addInitScript(() => {
    localStorage.setItem('fts_session', JSON.stringify({
      userId: 'u-felipe', username: 'felipe.perez', nombre: 'Felipe Pérez',
      role: 'supervisor', modulos: ['operaciones'], loginTime: Date.now(), lastActivity: Date.now()
    }));
  });
  await page.route(/api\.github\.com|raw\.githubusercontent\.com/, r => r.fulfill({ status: 404, body: '{}' }));
  await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas/, r =>
    H2C ? r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(H2C) })
        : r.continue());
  await page.route(/primary-production-5c3c\.up\.railway\.app/, r => {
    const u = r.request().url();
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204 });
    const j = b => r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (u.includes('/kiosk/empleados')) return j({ empleados: EMPLEADOS });
    if (u.includes('/kiosk/sos')) return j({ sos: SOS.map(s => ({ id: s.so_id, name: s.so_nombre })) });
    if (u.includes('/planeacion/dia')) return j({ slots: SLOTS });
    return r.fulfill({ status: 500, body: 'no esperado en prueba: ' + u });
  });
}

async function abrir(browser, base, ancho, alto) {
  const context = await browser.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.clock.install({ time: FECHA_FIJA });
  await preparar(page);
  await page.goto(base + '/operaciones/planeacion/index.html');
  await page.waitForFunction(() => document.querySelector('#export-zone .pl-export-card') ||
                                     document.querySelector('.fts-deps-banner'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return { context, page, errores };
}

async function exportar(page) {
  await page.click('#export-toggle');
  await page.waitForTimeout(200);
  const preview = await page.$eval('#export-preview', el => el.textContent);
  await page.click('#btn-copiar');
  await page.waitForTimeout(300);
  const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  let png = null;
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  page.once('dialog', d => d.dismiss().catch(() => {}));
  await page.click('#btn-imagen');
  const d = await dl;
  if (d) { const p = await d.path(); png = fs.readFileSync(p); }
  return { preview, copiado, png };
}

(async () => {
  if (!EXE) { console.error('No encontré chromium en /opt/pw-browsers'); process.exit(2); }
  const browser = await chromium.launch({ executablePath: EXE });

  // ── 1. Todo cargado: texto y PNG ─────────────────────────────────────────
  ctx = 'completo';
  {
    const srv = await servir(null); const base = 'http://127.0.0.1:' + srv.address().port;
    const { context, page, errores } = await abrir(browser, base, 1280, 900);
    const r = await exportar(page);
    console.log('HASH texto   = ' + sha(r.preview));
    console.log('HASH copiado = ' + sha(r.copiado));
    console.log('HASH png     = ' + (r.png ? sha(r.png) : 'SIN PNG') + (r.png ? '  (' + r.png.length + ' bytes)' : ''));
    fs.writeFileSync(OUT + '/texto.txt', r.preview);
    if (r.png) fs.writeFileSync(OUT + '/plan.png', r.png);
    check('el preview trae el plan', /PLAN OPS/.test(r.preview) && /SO11547/.test(r.preview), r.preview.slice(0, 80));
    check('Copiar texto copia lo mismo que el preview', r.copiado === r.preview);
    check('Generar PNG descarga una imagen', !!r.png && r.png.length > 10000);
    check('cero errores de página', errores.length === 0, errores.join(' | '));
    if (!BASELINE) {
      check('sin banner de dependencias', !(await page.$('.fts-deps-banner')));
      if (process.env.ESPERADO_TEXTO) check('texto idéntico a la línea base', sha(r.preview) === process.env.ESPERADO_TEXTO, sha(r.preview));
      if (process.env.ESPERADO_PNG) check('PNG idéntico a la línea base', r.png && sha(r.png) === process.env.ESPERADO_PNG, r.png && sha(r.png));
      const scripts = await page.$$eval('script[src], link[rel=stylesheet]', els =>
        els.map(e => e.getAttribute('src') || e.getAttribute('href')).filter(s => !/^https?:/.test(s)));
      const build = JSON.parse(fs.readFileSync(path.join(RAIZ, 'operaciones/planeacion/version.json'), 'utf8')).build;
      const sinV = scripts.filter(s => s.indexOf('?v=' + build) < 0);
      check('todo <script>/<link> local lleva ?v=' + build, sinV.length === 0, sinV.join(', '));
      const enPantalla = await page.$eval('#pl-build', el => el.textContent);
      check('el build en pantalla es el del código que corre', enPantalla.indexOf(build) >= 0, enPantalla);
    }
    for (const [n, w, h] of [['380', 380, 800], ['760', 760, 900], ['900', 900, 900], ['1280', 1280, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(150);
      await page.screenshot({ path: OUT + '/completo-' + n + '.png', fullPage: false });
    }
    await context.close(); srv.close();
  }
  if (BASELINE) { await browser.close(); console.log('\n' + pass + ' ok, ' + fails.length + ' fallas'); process.exit(fails.length ? 1 : 0); }

  // ── 2. Falta un archivo: el banner lo dice, y exportar no falla en silencio ──
  const CASOS = [['js/turnos.js'], ['js/jornada.js'], ['js/exportar.js'],
                 ['shared/auth-suite.js', null, '/shared/auth-suite.js'],
                 ['js/turnos.js', 'truncado']];
  for (const [falta, modo, rutaAbs] of CASOS) {
    ctx = (modo ? modo + ' ' : 'falta ') + falta;
    const ruta = rutaAbs || '/operaciones/planeacion/' + falta;
    const srv = modo === 'truncado' ? await servir(null, ruta) : await servir(ruta);
    const base = 'http://127.0.0.1:' + srv.address().port;
    const { context, page } = await abrir(browser, base, 1280, 900);
    const banner = await page.$('.fts-deps-banner');
    const texto = banner ? await banner.innerText() : '';
    check('banner rojo visible', !!banner && await banner.isVisible());
    check('el banner nombra el archivo', texto.indexOf(falta) >= 0, texto);
    if (modo === 'truncado') check('el banner dice que llegó dañado', /dañado/.test(texto), texto);
    check('sigue en la página (no redirige al launcher)', page.url().indexOf('/operaciones/planeacion/') >= 0, page.url());
    check('el banner dice Ctrl+Shift+R', /Ctrl\+Shift\+R/.test(texto), texto);
    const color = banner ? await banner.evaluate(el => getComputedStyle(el).backgroundColor) : '';
    check('el banner es rojo', /rgb\((1[5-9]\d|2\d\d), (\d|[1-5]\d), (\d|[1-5]\d)\)/.test(color), color);

    if (await page.$('#export-toggle')) {
      await page.click('#export-toggle');
      await page.waitForTimeout(200);
      const prev = await page.$eval('#export-preview', el => el.textContent);
      check('el preview muestra el error, no queda vacío', prev.trim().length > 0 && /no se pudo|error/i.test(prev), prev);
      for (const [btn, nombre] of [['#btn-copiar', 'Copiar'], ['#btn-wa', 'WhatsApp'], ['#btn-imagen', 'PNG']]) {
        await page.$eval('#pl-export-msg', el => { el.textContent = ''; });
        page.once('popup', p => p.close().catch(() => {}));
        await page.click(btn);
        await page.waitForTimeout(400);
        const m = await page.$eval('#pl-export-msg', el => el.textContent);
        check(nombre + ' muestra el error en pantalla', /no se pudo/i.test(m), m);
      }
    }
    for (const [n, w, h] of [['380', 380, 800], ['760', 760, 900], ['900', 900, 900], ['1280', 1280, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(150);
      await page.screenshot({ path: OUT + '/' + (modo || 'falta') + '-' + path.basename(falta, '.js') + '-' + n + '.png', fullPage: false });
    }
    await context.close(); srv.close();
  }

  await browser.close();
  console.log('\n' + pass + ' ok, ' + fails.length + ' fallas');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
