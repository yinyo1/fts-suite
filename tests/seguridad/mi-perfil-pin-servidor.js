#!/usr/bin/env node
// #486 · Mi Perfil verifica el PIN en el SERVIDOR (kiosk/checkin tipo verificar_pin) y solo cae al
// respaldo del navegador si el servidor no contesta. Mi Perfil real en Chromium, todo interceptado.
//   node tests/seguridad/mi-perfil-pin-servidor.js        (SHOTS_DIR=<dir> captura 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const PIN = '5821', OTRO = '0000';
const EMP = { id: 9201, name: 'Prueba Perfil', pin: PIN, department_name: 'Operaciones' };
let modo = 'ok', demora = 0; const posts = [], registros = [];

function servir() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await servir(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 860 } });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('https://primary-production-5c3c.up.railway.app/**', async r => {
    const url = r.request().url(), ok = (x, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.endsWith('/webhook/kiosk/empleados')) return ok({ empleados: [EMP] });
    if (url.endsWith('/webhook/suite/acceso-registro')) { registros.push(JSON.parse(r.request().postData() || '{}')); return ok({ ok: true }); }
    if (url.endsWith('/webhook/kiosk/checkin')) {
      const b = JSON.parse(r.request().postData() || '{}'); posts.push(b);
      if (demora) await new Promise(z => setTimeout(z, demora));
      if (modo === 'caido') return r.abort('failed');
      if (modo === '503') return ok({ message: 'Bad gateway' }, 503);
      if (modo === 'viejo') return ok({ _error: true, codigo_error: 'DATOS_INCOMPLETOS', mensaje: 'tipo inválido' });
      if (modo === 'bloqueado') return ok({ pin_verificado: false, codigo_error: 'PIN_BLOQUEADO', error_msg: 'PIN bloqueado 15 minutos', minutos_bloqueo: 15 });
      if (modo === 'mal') return ok({ pin_verificado: false, codigo_error: 'PIN_INCORRECTO', error_msg: 'PIN incorrecto — intenta de nuevo', intentos_restantes: 3 });
      return ok(b.pin === PIN ? { pin_verificado: true, codigo_error: 'PIN_VERIFICADO' } : { pin_verificado: false, codigo_error: 'PIN_INCORRECTO', error_msg: 'PIN incorrecto — intenta de nuevo' });
    }
    return ok({});
  });
  const page = await ctx.newPage(), consola = [], errs = [];
  page.on('console', m => consola.push(m.text())); page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/shared/mi-perfil/index.html');
  await page.waitForFunction(() => typeof _empleados !== 'undefined' && _empleados.length === 1, null, { timeout: 15000 });

  async function intento(m, pin) {
    modo = m; posts.length = 0; registros.length = 0;
    await page.evaluate(() => { mp_step('mp-step-pin'); mp_select_empleado(_empleados[0].id); mp_step('mp-step-pin'); });
    await page.evaluate(async p => { _pin = p; await mp_pin_validate(); }, pin);
    await page.waitForTimeout(250);
    return page.evaluate(() => ({ selfie: document.getElementById('mp-step-selfie').classList.contains('active'),
      status: document.getElementById('mp-pin-status').textContent }));
  }
  const sinPin = () => registros.every(x => !('pin' in x) && JSON.stringify(x).indexOf(PIN) < 0);

  seccion('Servidor arriba');
  let r = await intento('ok', PIN);
  check('PIN bueno → selfie', r.selfie); check('una llamada verificar_pin', posts.length === 1 && posts[0].tipo === 'verificar_pin' && posts[0].empleado_id === EMP.id);
  check('registro ok/servidor', registros.length === 1 && registros[0].resultado === 'ok' && registros[0].motivo === 'servidor' && registros[0].usuario === 'emp-9201', JSON.stringify(registros));
  r = await intento('ok', OTRO);
  check('PIN malo → no pasa', !r.selfie && /incorrecto/i.test(r.status), r.status);
  r = await intento('mal', PIN);
  check('servidor dice incorrecto aunque el roster coincida → NO cae al respaldo', !r.selfie, r.status);
  check('registro mal/servidor', registros[0] && registros[0].resultado === 'mal' && registros[0].motivo === 'servidor');
  r = await intento('bloqueado', PIN);
  check('bloqueado → no pasa y lo dice', !r.selfie && /bloquead/i.test(r.status), r.status);
  check('registro bloqueado', registros[0] && registros[0].resultado === 'bloqueado');

  seccion('Servidor sin contestar → respaldo invisible');
  for (const m of ['caido', '503', 'viejo']) {
    r = await intento(m, PIN);
    check(m + ': PIN bueno entra por el respaldo', r.selfie, r.status);
    check(m + ': queda registrado como respaldo', registros[0] && registros[0].resultado === 'ok' && /^respaldo_/.test(registros[0].motivo), JSON.stringify(registros));
    r = await intento(m, OTRO);
    check(m + ': PIN malo no entra', !r.selfie);
  }

  seccion('Nada de éxito antes de la respuesta');
  modo = 'ok'; demora = 1500; posts.length = 0;
  await page.evaluate(() => { mp_step('mp-step-pin'); mp_select_empleado(_empleados[0].id); mp_step('mp-step-pin'); _pin = '5821'; mp_pin_validate(); });
  await page.waitForTimeout(500);
  const antes = await page.evaluate(() => ({ selfie: document.getElementById('mp-step-selfie').classList.contains('active'), status: document.getElementById('mp-pin-status').textContent }));
  check('a los 500 ms sigue en el PIN, «Verificando»', !antes.selfie && /Verificando/.test(antes.status), JSON.stringify(antes));
  await page.waitForTimeout(1600);
  check('después de la respuesta, selfie', await page.evaluate(() => document.getElementById('mp-step-selfie').classList.contains('active')));
  demora = 0;

  seccion('Higiene');
  check('el PIN nunca va en el registro', sinPin());
  check('el PIN no sale en la consola', !consola.some(t => t.indexOf(PIN) >= 0));
  check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  const build = await page.evaluate(() => window.BUILD_DATE), vis = await page.textContent('.mp-build');
  check('build visible == BUILD_DATE', vis.indexOf(build) >= 0, vis + ' vs ' + build);
  if (OUT) { await page.evaluate(() => { mp_step('mp-step-pin'); mp_select_empleado(_empleados[0].id); }); for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'mi-perfil-pin-' + w + '.png'), fullPage: true }); } }
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
