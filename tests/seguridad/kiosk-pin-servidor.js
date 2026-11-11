#!/usr/bin/env node
// Kiosko real en Chromium: el PIN se verifica en el SERVIDOR (fts-suite#486).
// Todo interceptado: no toca Odoo ni n8n. Empleados y PINs INVENTADOS.
//   node tests/seguridad/kiosk-pin-servidor.js
//   SHOTS_DIR=/tmp/x node tests/seguridad/kiosk-pin-servidor.js   (capturas a 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const PIN_BUENO = '4821';
const PUNTO = { latitude: 25.6889759, longitude: -100.2916779 };
const EMP_SIN_PIN = { id: 9101, name: 'Prueba PIN', department_id: 3, department_name: 'Operaciones', manager_id: 9100, manager_name: 'Sup' };
const EMP_CON_PIN = Object.assign({}, EMP_SIN_PIN, { pin: PIN_BUENO });

let pasan = 0, fallan = 0;
const check = (n, c, info) => { if (c) { pasan++; console.log('  ✓', n); } else { fallan++; console.log('  ✗', n, info || ''); } };
const seccion = n => console.log('\n▶ ' + n);

// servidor = 'nuevo' | 'viejo' | 'caido_checkin'
async function escenario(browser, nombre, o, fn) {
  seccion(nombre);
  const host = o.host || 'https://kiosko.prueba.local';
  const ctx = await browser.newContext({ viewport: { width: 380, height: 860 }, geolocation: PUNTO, permissions: ['geolocation'] });
  const posts = [], consola = [], errs = [];
  const pub = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8'));
  pub.n8n_url = 'https://n8n.prueba.local';
  await ctx.addInitScript(o => { localStorage.setItem('ops_demo_mode', o.demo ? '1' : '0'); localStorage.setItem('ops_n8n_url', 'https://n8n.prueba.local'); }, { demo: !!o.demo });
  await ctx.route(host + '/**', r => {
    const u = new URL(r.request().url()); let rel = decodeURIComponent(u.pathname).replace(/^\/fts-suite/, '');
    const p = path.join(RAIZ, rel);
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: T[path.extname(p)] || 'application/octet-stream', body: fs.readFileSync(p) });
  });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pub) }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('https://n8n.prueba.local/**', async r => {
    const url = r.request().url(), body = JSON.parse(r.request().postData() || '{}');
    const ok = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.endsWith('/webhook/kiosk/empleados')) return ok({ empleados: [o.emp || EMP_SIN_PIN], total: 1 });
    if (url.endsWith('/webhook/kiosk/sos')) return ok({ sos: [] });
    if (url.endsWith('/webhook/kiosk/checkin')) {
      posts.push(body);
      if (body.tipo === 'verificar_pin') {
        if (o.servidor === 'viejo') return ok({ success: false, accion_valida: false, codigo_error: 'EMPLEADO_NO_EXISTE', mensaje: 'Empleado no encontrado en el sistema (id: undefined)', empleado_id: null });
        if (o.servidor === 'sin_red_verificar') return r.abort('failed');
        if (o.bloqueado) return ok({ success: false, accion_valida: false, codigo_error: 'PIN_BLOQUEADO', mensaje: 'Demasiados intentos. Espera 15 min o avisa a tu supervisor.', error_msg: 'Demasiados intentos. Espera 15 min o avisa a tu supervisor.', pin_verificado: false, minutos_bloqueo: 15 });
        if (body.pin === PIN_BUENO) return ok({ success: false, accion_valida: false, codigo_error: 'PIN_VERIFICADO', mensaje: 'PIN correcto.', error_msg: 'PIN correcto.', pin_verificado: true });
        return ok({ success: false, accion_valida: false, codigo_error: 'PIN_INCORRECTO', mensaje: 'PIN incorrecto. Intenta de nuevo.', error_msg: 'PIN incorrecto. Intenta de nuevo.', pin_verificado: false, intentos_restantes: 4 });
      }
      if (o.servidor === 'caido_checkin') return r.abort('failed');
      await new Promise(x => setTimeout(x, o.demora || 0));
      return ok({ success: true, accion_valida: true, tipo: body.tipo, attendance_id: 99999 });
    }
    return ok({});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => consola.push(m.text()));
  await page.goto(host + '/fts-suite/operaciones/kiosk/index.html');
  await page.waitForFunction(() => typeof K !== 'undefined' && K.empleadosState === 'ok', null, { timeout: 15000 });
  try { await fn(page, posts); } catch (e) { check('el escenario terminó sin excepción', false, e.message.split('\n')[0]); }
  check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  check('el PIN tecleado nunca sale en la consola', !consola.some(t => t.indexOf(PIN_BUENO) >= 0 || t.indexOf('3907') >= 0), consola.filter(t => /pin/i.test(t)).join(' | '));
  await ctx.close();
  return { posts };
}

async function teclear(page, pin, tipo) {
  await page.evaluate(t => { K.seleccionado = K.empleados[0]; K.tipo = t; K.pin = ''; showScreen('ks-verify'); }, tipo || 'entrada');
  for (const d of pin) await page.click(`.kiosk-pin-btn >> text="${d}"`);
  await page.click('#ksPinOkBtn');
}
const esperar = async (fn, ms) => { for (let i = 0; i < (ms || 8000) / 100; i++) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
async function fotos(page, nombre) {
  if (!OUT) return;
  for (const w of [380, 760, 900, 1280]) {
    await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT, nombre + '-' + w + '.png'), fullPage: true });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${nombre} a ${w}: sin scroll horizontal`, sw <= w, 'scrollWidth=' + sw);
  }
  await page.setViewportSize({ width: 380, height: 860 });
}

(async () => {
  const browser = await chromium.launch();

  await escenario(browser, 'Servidor nuevo · PIN malo: se rechaza y NO hay checada', { servidor: 'nuevo' }, async (page, posts) => {
    await teclear(page, '3907');
    await esperar(async () => posts.length >= 1);
    await page.waitForTimeout(300);
    check('una sola llamada, tipo verificar_pin', posts.length === 1 && posts[0].tipo === 'verificar_pin', JSON.stringify(posts.map(p => p.tipo)));
    check('manda el PIN y el dispositivo al servidor', posts[0].pin === '3907' && /^k-/.test(posts[0].dispositivo_id || ''));
    check('muestra el mensaje del servidor', /PIN incorrecto/.test(await page.textContent('#pin-status')));
    check('sigue en la pantalla del PIN', await page.evaluate(() => document.getElementById('ks-verify').classList.contains('active') || getComputedStyle(document.getElementById('ks-verify')).display !== 'none'));
    check('el PIN tecleado se borró', await page.evaluate(() => K.pin === ''));
    await fotos(page, 'pin-malo');
  });

  await escenario(browser, 'Servidor nuevo · bloqueado: mensaje de espera, sin checada', { servidor: 'nuevo', bloqueado: true }, async (page, posts) => {
    await teclear(page, PIN_BUENO);
    await esperar(async () => posts.length >= 1); await page.waitForTimeout(300);
    check('solo verificar_pin', posts.length === 1 && posts[0].tipo === 'verificar_pin');
    check('dice que espere', /Espera 15 min/.test(await page.textContent('#pin-status')));
    await fotos(page, 'pin-bloqueado');
  });

  await escenario(browser, 'Servidor nuevo · PIN bueno: ⏳ mientras el servidor contesta, ✓ solo después', { servidor: 'nuevo', demora: 2500 }, async (page, posts) => {
    await teclear(page, PIN_BUENO);
    check('llegó la checada de entrada', await esperar(async () => posts.some(p => p.tipo === 'entrada'), 12000));
    const e = posts.find(p => p.tipo === 'entrada') || {};
    check('verificar_pin fue antes que la entrada', posts[0].tipo === 'verificar_pin');
    check('la entrada vuelve a mandar el PIN', e.pin === PIN_BUENO);
    check('la entrada manda el mismo dispositivo', e.dispositivo_id && e.dispositivo_id === posts[0].dispositivo_id);
    const icono = await page.textContent('#confirm-icon');
    check('mientras el servidor no contesta: ⏳ y no ✓', icono.trim() === '⏳', icono);
    await fotos(page, 'confirm-esperando');
    check('al contestar: ✓', await esperar(async () => (await page.textContent('#confirm-icon')).trim() === '✓', 6000));
    await fotos(page, 'confirm-ok');
  });

  await escenario(browser, 'Servidor nuevo · la checada no llega: «SIN CONFIRMAR», nunca ✓', { servidor: 'caido_checkin' }, async (page, posts) => {
    await teclear(page, PIN_BUENO);
    check('pantalla SIN CONFIRMAR', await esperar(async () => /SIN CONFIRMAR/.test(await page.textContent('#confirm-tipo')), 20000));
    check('ícono ✕, no ✓', (await page.textContent('#confirm-icon')).trim() === '✕');
    check('botón Terminado habilitado', await page.evaluate(() => !document.getElementById('btnTerminado').disabled));
    await page.waitForTimeout(5000);
    check('no regresa solo al inicio (la persona lo lee)', await page.evaluate(() => getComputedStyle(document.getElementById('ks-confirm')).display !== 'none'));
    await fotos(page, 'confirm-sin-confirmar');
  });

  await escenario(browser, 'Servidor viejo (reversa) + roster con PIN: respaldo local', { servidor: 'viejo', emp: EMP_CON_PIN }, async (page, posts) => {
    await teclear(page, '3907');
    await page.waitForTimeout(800);
    check('PIN malo → rechazo local, sin checada', !posts.some(p => p.tipo !== 'verificar_pin') && /PIN incorrecto/.test(await page.textContent('#pin-status')));
    await teclear(page, PIN_BUENO);
    check('PIN bueno → checa', await esperar(async () => posts.some(p => p.tipo === 'entrada'), 12000));
  });

  await escenario(browser, 'Servidor viejo + roster SIN PIN (después del paso 3): falla cerrado', { servidor: 'viejo', emp: EMP_SIN_PIN }, async (page, posts) => {
    await teclear(page, PIN_BUENO);
    await page.waitForTimeout(1000);
    check('no hay checada', !posts.some(p => p.tipo !== 'verificar_pin'));
    check('dice que no pudo verificar', /No se pudo verificar/.test(await page.textContent('#pin-status')));
  });

  await escenario(browser, 'Sin red al verificar + roster SIN PIN: falla cerrado con mensaje de conexión', { servidor: 'sin_red_verificar', emp: EMP_SIN_PIN }, async (page, posts) => {
    await teclear(page, PIN_BUENO);
    check('mensaje de conexión', await esperar(async () => /Sin conexión/.test(await page.textContent('#pin-status')), 15000));
    check('no hay checada', !posts.some(p => p.tipo !== 'verificar_pin'));
  });

  await escenario(browser, 'Demo prendido a mano FUERA de producción: se permite, sin PINs', { demo: true }, async (page) => {
    check('demoMode activo', await page.evaluate(() => K.config.demoMode === true));
    check('roster demo sin PINs ni nombres del equipo', await page.evaluate(() => K.empleados.every(e => !('pin' in e) && /Demo/.test(e.nombre))));
  });

  await escenario(browser, 'Demo prendido a mano EN PRODUCCIÓN (yinyo1.github.io): nunca', { demo: true, host: 'https://yinyo1.github.io' }, async (page) => {
    check('demoMode apagado', await page.evaluate(() => K.config.demoMode === false));
    check('carga el roster real (mock)', await page.evaluate(() => K.empleados.length === 1 && K.empleados[0].id === 9101));
  });

  await escenario(browser, 'Sin ops_demo_mode y sin URL de n8n guardada: NO cae en demo', { demo: false }, async (page) => {
    check('demoMode apagado', await page.evaluate(() => K.config.demoMode === false));
  });

  // Estático: el bundle no trae PINs.
  const src = fs.readFileSync(path.join(RAIZ, 'operaciones/kiosk/js/kiosk.js'), 'utf8');
  seccion('Estático');
  check('kiosk.js no trae PINs de demo', !/pin\s*:\s*'\d{4}'/.test(src));
  check('kiosk.js ya no compara contra K.seleccionado.pin como primera opción', /verificarPin\(/.test(src));
  check('no hay console.log de [KIOSK PIN]', src.indexOf('[KIOSK PIN]') < 0);
  check('KIOSK_BUILD == version.json', src.indexOf("'" + JSON.parse(fs.readFileSync(path.join(RAIZ, 'operaciones/kiosk/version.json'), 'utf8')).build + "'") > 0);

  await browser.close();
  console.log(`\n${pasan} pasan, ${fallan} fallan`);
  process.exit(fallan ? 1 : 0);
})();
