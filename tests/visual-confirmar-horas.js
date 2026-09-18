// ═══ Revisión visual — Operaciones · Confirmar Horas (la pantalla de Felipe) ═══
//
// POR QUÉ ESTA PRUEBA. La precarga de destino PROPONE un dato que todavía no está en
// Odoo. Si la propuesta se ve igual que un destino real, deja de ser una propuesta y
// pasa a ser una mentira con forma de dato — el anti-patrón de CLAUDE.md §8 ("la UI
// no es fuente de verdad de estado"). Eso NO se revisa leyendo el diff: se revisa
// mirando la pantalla (§20 #12).
//
// Y contesta la pregunta que abrió el trabajo: ¿qué pasa si alguien le pone la marca
// `solo_bolsa` a quien SÍ va a obra? El caso está en los datos de prueba (Mateo, att
// 9003) y la respuesta se ve en la captura.
//
// LO QUE ESTA PRUEBA NO ES. No toca Odoo ni n8n: los dos webhooks están
// interceptados. Lo que sí es real es la página entera, la sesión, el render y el
// cuerpo del POST que se manda — que es lo que hay que poder mirar antes de encender.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`):
//   node tests/visual-confirmar-horas.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-confirmar-horas';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0; const fails = []; let vp = '';
function check(n, c, d) {
  if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : ''));
  console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : ''));
  return false;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|ERR_TUNNEL|api\.github|raw\.githubusercontent|fonts\.g|net::ERR|Failed to fetch/.test(t);

const VIEWPORTS = [['desktop-1440', 1440, 900], ['laptop-1280', 1280, 800]];

// ── LA TABLA DE LA VERDAD, EN DATOS ────────────────────────────────────────
// Cada renglón es una combinación distinta de (tiene destino / marca solo_bolsa /
// cuenta default / abierta), y entre todos cubren los cinco candados de precargaDe()
// más el caso de la marca mal puesta. Las personas y las cuentas son las reales
// medidas en el histórico; los ids de asistencia son inventados (9xxx) para que
// nadie los confunda con registros de producción.
const FILAS = [
  { attendance_id: 9001, empleado_id: 149, empleado_nombre: 'Erick Belmont Kato',
    department_name: 'Administracion y Finanzas', es_operaciones: false,
    check_in_cst: '2026-09-17 07:16', check_out_cst: '2026-09-17 16:52', worked_hours: 9.6,
    so_id: null, cuenta_id: null, confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: true, cuenta_default_id: 513, cuenta_default_nombre: 'Administración' },

  { attendance_id: 9002, empleado_id: 155, empleado_nombre: 'Juan De La Cruz Maldonado',
    department_name: 'Recursos Humanos', es_operaciones: false,
    check_in_cst: '2026-09-17 06:56', check_out_cst: '2026-09-17 16:32', worked_hours: 9.6,
    so_id: null, cuenta_id: null, confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: false, cuenta_default_id: 513, cuenta_default_nombre: 'Administración' },

  { attendance_id: 9003, empleado_id: 75, empleado_nombre: 'Mateo Salazar',
    department_name: 'Operaciones', es_operaciones: true,
    check_in_cst: '2026-09-17 07:02', check_out_cst: '2026-09-17 16:38', worked_hours: 9.6,
    so_id: null, cuenta_id: null, confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: true, cuenta_default_id: 3096, cuenta_default_nombre: 'ADMIN DE OPERACIONES' },

  { attendance_id: 9004, empleado_id: 75, empleado_nombre: 'Mateo Salazar',
    department_name: 'Operaciones', es_operaciones: true,
    check_in_cst: '2026-09-16 07:00', check_out_cst: '2026-09-16 16:36', worked_hours: 9.6,
    so_id: 11547, so_nombre: 'SO11547 Topo Chico', cuenta_id: null,
    confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: true, cuenta_default_id: 3096, cuenta_default_nombre: 'ADMIN DE OPERACIONES' },

  { attendance_id: 9005, empleado_id: 112, empleado_nombre: 'Felipe Pérez Guzmán',
    department_name: 'Operaciones', es_operaciones: true,
    check_in_cst: '2026-09-17 07:10', check_out_cst: '2026-09-17 16:46', worked_hours: 9.6,
    so_id: null, cuenta_id: 3096, cuenta_nombre: 'ADMIN DE OPERACIONES',
    confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: true, cuenta_default_id: 3096, cuenta_default_nombre: 'ADMIN DE OPERACIONES' },

  { attendance_id: 9006, empleado_id: 62, empleado_nombre: 'Gilberto Gibran Solís Carrillo',
    department_name: 'Operaciones', es_operaciones: true,
    check_in_cst: '2026-09-18 07:05', check_out_cst: null, worked_hours: null,
    so_id: null, cuenta_id: null, confirmado: false, abierta: true, en_disputa: false,
    solo_bolsa: true, cuenta_default_id: 3096, cuenta_default_nombre: 'ADMIN DE OPERACIONES' },

  // El estado de HOY: el endpoint todavía no manda la cuenta default. Sin ese campo
  // no se propone nada — la pantalla se comporta exactamente como antes.
  { attendance_id: 9007, empleado_id: 101, empleado_nombre: 'Ana Laura Acevedo Flores',
    department_name: 'Recursos Humanos', es_operaciones: false,
    check_in_cst: '2026-09-17 07:00', check_out_cst: '2026-09-17 16:36', worked_hours: 9.6,
    so_id: null, cuenta_id: null, confirmado: false, abierta: false, en_disputa: false,
    solo_bolsa: true }
];

async function montar(ctx, escrituras) {
  await ctx.addInitScript(() => {
    localStorage.setItem('fts_session', JSON.stringify({
      userId: 1, username: 'ftsmaster', nombre: 'Esteban De La Cruz',
      role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now()
    }));
  });
  await ctx.route('**/webhook/planeacion/horas-dia', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, count: FILAS.length,
        rows: JSON.parse(JSON.stringify(FILAS)) }) }));
  await ctx.route('**/webhook/planeacion/corregir-bolsa', r => {
    escrituras.push({ url: 'corregir-bolsa', body: JSON.parse(r.request().postData() || '{}') });
    const b = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, attendance_id: b.attendance_id }) });
  });
  await ctx.route('**/webhook/planeacion/confirmar-horas', r => {
    escrituras.push({ url: 'confirmar-horas', body: JSON.parse(r.request().postData() || '{}') });
    const b = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, attendance_id: b.attendance_id, manager_approval: true }) });
  });
  await ctx.route('**/webhook/kiosk/sos', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, sos: [{ id: 11547, nombre: 'SO11547 Topo Chico', cliente: 'Nalco' }] }) }));
}

(async () => {
  console.log('Chromium: ' + (EXE || '(default)'));
  const srv = await servir();
  const raiz = 'http://127.0.0.1:' + srv.address().port + '/operaciones/confirmar-horas/index.html';
  const navegador = await chromium.launch(EXE ? { executablePath: EXE } : {});

  for (const [nombre, w, h] of VIEWPORTS) {
    vp = nombre;
    console.log('\n── ' + nombre + ' ──');

    // ═══ 1 · APAGADA — la pantalla de hoy, sin una sola propuesta ═══════════
    {
      const escrituras = [];
      const ctx = await navegador.newContext({ viewport: { width: w, height: h } });
      await montar(ctx, escrituras);
      const page = await ctx.newPage();
      const excepciones = [];
      page.on('pageerror', e => excepciones.push(String(e)));
      await page.goto(raiz, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ch-table tbody tr', { timeout: 15000 });

      check('apagada: el aviso de prueba NO se ve',
        !(await page.locator('#ch-precarga-aviso').isVisible()));
      check('apagada: cero propuestas en la tabla',
        (await page.locator('.ch-pre').count()) === 0);
      check('apagada: cero marcas de contradicción',
        (await page.locator('.ch-contra').count()) === 0);
      check('apagada: los renglones sin destino siguen diciendo Sin atribución',
        (await page.locator('.ch-sinso').count()) >= 4,
        String(await page.locator('.ch-sinso').count()));
      check('apagada: sin excepciones de JavaScript', excepciones.length === 0, excepciones[0]);
      await page.screenshot({ path: path.join(OUT, nombre + '-1-apagada.png'), fullPage: true });
      await ctx.close();
    }

    // ═══ 2 · ENCENDIDA — la propuesta, y la marca que no cuadra ═════════════
    {
      const escrituras = [];
      const ctx = await navegador.newContext({ viewport: { width: w, height: h } });
      await montar(ctx, escrituras);
      const page = await ctx.newPage();
      const excepciones = [];
      page.on('pageerror', e => excepciones.push(String(e)));
      await page.goto(raiz + '?precarga=1', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ch-table tbody tr', { timeout: 15000 });

      check('encendida: la pantalla ANUNCIA que está proponiendo',
        await page.locator('#ch-precarga-aviso').isVisible());

      const fila = id => page.locator('tr[data-att="' + id + '"]');
      check('9001 Erick (solo-bolsa, sin destino) recibe propuesta',
        (await fila(9001).locator('.ch-pre').count()) === 1);
      check('y la propuesta dice cuál es la cuenta',
        /Administración/.test(await fila(9001).locator('.cell-so').innerText()),
        await fila(9001).locator('.cell-so').innerText());
      check('y se lee como PROPUESTA, no como destino',
        /propuesta/i.test(await fila(9001).locator('.cell-so').innerText()));

      check('9002 Juan (sin la marca) NO recibe propuesta aunque tenga cuenta default',
        (await fila(9002).locator('.ch-pre').count()) === 0 &&
        (await fila(9002).locator('.ch-sinso').count()) === 1);

      check('9003 Mateo (marca mal puesta) NO recibe propuesta',
        (await fila(9003).locator('.ch-pre').count()) === 0);
      check('y la pantalla DICE que la marca no cuadra',
        (await fila(9003).locator('.ch-contra').count()) === 1);

      check('9004 Mateo con proyecto se queda con su proyecto',
        /11547|Topo/.test(await fila(9004).locator('.cell-so').innerText()),
        await fila(9004).locator('.cell-so').innerText());

      check('9005 Felipe, que YA tiene bolsa, no se toca',
        (await fila(9005).locator('.ch-pre').count()) === 0 &&
        (await fila(9005).locator('.ch-bolsa').count()) === 1);

      check('9006 Gibrán con la jornada abierta no recibe propuesta',
        (await fila(9006).locator('.ch-pre').count()) === 0);

      check('9007 sin cuenta default (lo que manda el endpoint HOY) no recibe propuesta',
        (await fila(9007).locator('.ch-pre').count()) === 0 &&
        (await fila(9007).locator('.ch-sinso').count()) === 1);

      check('en toda la tabla hay UNA propuesta y UNA contradicción',
        (await page.locator('.ch-pre').count()) === 1 &&
        (await page.locator('.ch-contra').count()) === 1,
        (await page.locator('.ch-pre').count()) + '/' + (await page.locator('.ch-contra').count()));

      await page.screenshot({ path: path.join(OUT, nombre + '-2-encendida.png'), fullPage: true });

      // ── El popup: lo que se va a escribir, ANTES de escribirlo ────────────
      await fila(9001).locator('input.ch-mark').check();
      await fila(9003).locator('input.ch-mark').check();
      await page.locator('#btn-tanda').click();
      await page.waitForSelector('#pop-tanda', { state: 'visible', timeout: 5000 });
      const pop = await page.locator('#pop-tanda-body').innerText();
      check('el popup enseña el destino PROPUESTO, no "(sin atribución)"',
        /propuesta/i.test(pop) && /Administración/.test(pop), pop.slice(0, 220));
      check('el popup avisa cuántos llevan destino propuesto', /destino PROPUESTO/i.test(pop));
      check('el popup avisa de la marca que no cuadra', /marca en duda/i.test(pop) && /revisa la marca/i.test(pop), pop.slice(0, 220));
      await page.screenshot({ path: path.join(OUT, nombre + '-3-popup.png'), fullPage: true });

      // ── Y lo que de verdad sale por el cable ──────────────────────────────
      await page.locator('#pop-tanda-confirm').click();
      await page.waitForFunction(() => !document.querySelector('.ch-overlay, #ch-overlay') ||
        !/Confirmando/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);

      const conPre = escrituras.filter(e => e.body.attendance_id === 9001);
      const sinPre = escrituras.filter(e => e.body.attendance_id === 9003);
      check('el renglón con propuesta se manda como CORRECCIÓN (destino + aprobación juntos)',
        conPre.length === 1 && conPre[0].url === 'corregir-bolsa' &&
        conPre[0].body.action === 'correct_bolsa' && conPre[0].body.cuenta_id === 513,
        JSON.stringify(conPre));
      check('y lleva la etiqueta de lo que había antes, para el chatter',
        conPre.length === 1 && /sin atribuci/i.test(conPre[0].body.prev_label || ''),
        conPre.length ? conPre[0].body.prev_label : '(nada)');
      check('el renglón SIN propuesta sigue yendo por el confirm de siempre',
        sinPre.length === 1 && sinPre[0].url === 'confirmar-horas' &&
        sinPre[0].body.action === 'confirm' && sinPre[0].body.origen === 'envio',
        JSON.stringify(sinPre));
      check('no se escribió nada de los renglones que no se marcaron',
        escrituras.length === 2, JSON.stringify(escrituras.map(e => e.body.attendance_id)));
      check('tras confirmar, el renglón ya NO se pinta como propuesta',
        (await fila(9001).locator('.ch-pre').count()) === 0 &&
        (await fila(9001).locator('.ch-bolsa').count()) === 1);

      check('encendida: sin excepciones de JavaScript',
        excepciones.filter(t => !esDelEntorno(t)).length === 0, excepciones[0]);
      await page.screenshot({ path: path.join(OUT, nombre + '-4-escrito.png'), fullPage: true });
      await ctx.close();
    }
  }

  await navegador.close();
  srv.close();
  console.log('\nCapturas en: ' + OUT);
  console.log('════════════════════════════════════════════════════════════════');
  if (fails.length) { console.log('VISUAL ROJO — ' + fails.length + ' fallo(s):'); fails.forEach(f => console.log('  • ' + f)); process.exit(1); }
  console.log('VISUAL VERDE — ' + pass + '/' + pass + ' checks en ' + VIEWPORTS.length + ' anchos');
})();
