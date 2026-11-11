#!/usr/bin/env node
// #486 · El kiosko no imprime el PIN en la consola, y el PIN sigue funcionando igual.
// Kiosko real en Chromium con todo interceptado (no toca n8n ni Odoo). PIN y empleado inventados.
//   node tests/seguridad/kiosk-pin-consola.js            (con SHOTS_DIR=<dir> toma capturas a 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const PIN = '4817';
const EMP = { id: 9101, name: 'Prueba Kiosko', pin: PIN, department_id: 3, department_name: 'Operaciones', manager_id: 9100, manager_name: 'Sup' };

function servir() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await servir(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 860 } });
  const pub = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8')); pub.n8n_url = 'https://n8n.prueba.local';
  await ctx.addInitScript(() => { localStorage.setItem('ops_demo_mode', '0'); localStorage.setItem('ops_n8n_url', 'https://n8n.prueba.local'); localStorage.setItem('ops_kiosk_face_enabled', '0'); });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pub) }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('https://n8n.prueba.local/**', r => {
    const url = r.request().url(), ok = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.endsWith('/webhook/kiosk/empleados')) return ok({ empleados: [EMP], total: 1 });
    if (url.endsWith('/webhook/kiosk/sos')) return ok({ sos: [] });
    // Desde #487 el PIN se verifica en el servidor (tipo verificar_pin): se simula su respuesta.
    if (url.endsWith('/webhook/kiosk/checkin')) {
      const b = JSON.parse(r.request().postData() || '{}');
      if (b.tipo === 'verificar_pin') return ok(b.pin === PIN
        ? { pin_verificado: true, codigo_error: 'PIN_VERIFICADO' }
        : { pin_verificado: false, codigo_error: 'PIN_INCORRECTO', error_msg: 'PIN incorrecto — intenta de nuevo' });
    }
    return ok({});
  });
  const page = await ctx.newPage(), consola = [], errs = [];
  page.on('console', m => consola.push(m.text())); page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/operaciones/kiosk/index.html');
  await page.waitForFunction(() => typeof K !== 'undefined' && K.empleadosState === 'ok', null, { timeout: 15000 });
  const build = await page.evaluate(() => window.KIOSK_BUILD);
  const vj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'operaciones/kiosk/version.json'), 'utf8')).build;
  check('KIOSK_BUILD coincide con version.json', build === vj, build + ' vs ' + vj);

  async function teclear(pin) {
    return page.evaluate(async p => {
      let llamado = false; const orig = window.afterVerifyContinue; window.afterVerifyContinue = () => { llamado = true; };
      K.seleccionado = K.empleados[0]; K.pin = p; await verifyPin();
      window.afterVerifyContinue = orig; return { llamado, status: (document.getElementById('pin-status') || {}).textContent || '' };
    }, pin);
  }
  seccion('PIN incorrecto');
  const mal = await teclear('0000');
  check('no continúa', !mal.llamado); check('dice «PIN incorrecto»', /PIN incorrecto/.test(mal.status), mal.status);
  seccion('PIN correcto');
  const bien = await teclear(PIN);
  check('continúa al checado', bien.llamado);
  seccion('Consola');
  check('el PIN no aparece en ningún mensaje de consola', !consola.some(t => t.indexOf(PIN) >= 0), consola.filter(t => t.indexOf(PIN) >= 0));
  check('no hay mensajes [KIOSK PIN]', !consola.some(t => /KIOSK PIN|Esperado:/.test(t)));
  check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  if (OUT) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(120); await page.screenshot({ path: path.join(OUT, 'kiosk-' + w + '.png'), fullPage: true }); }
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
