#!/usr/bin/env node
// #485 · Entrada del portal con login_dual_v1: apagado = idéntica a main; prendido = enlace discreto,
// ventanita, acceso anterior intacto, cuenta personal abre la Suite, «Volver» y registro de la medición.
//   node tests/seguridad/portal-login-dual.js [raiz_main]   (SHOTS_DIR=<dir> captura 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..'), MAIN = process.argv[2] || null;
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PASS = 'prueba-' + crypto.randomBytes(4).toString('hex');
const USERS = { users: [{ id: 'zz1', username: 'zz.anterior', password_hash: crypto.createHash('sha256').update(PASS).digest('hex'), nombre: 'ZZ Anterior', activo: true, vigencia: null, role: 'user', modulos: { operaciones: { acceso: true } } }] };
let FLAG = false; const reg = [];

function servir(raiz) { return new Promise(res => { const s = http.createServer((q, r) => { let p = path.join(raiz, decodeURIComponent(q.url.split('?')[0]));
  if (p.endsWith('/shared/public-config.json')) { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8')); c.login_dual_v1 = FLAG; r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify(c)); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(raiz) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

async function contexto(browser, extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 860 } });
  await ctx.route(/api\.github\.com|raw\.githubusercontent\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/users-suite/.test(r.request().url()) ? USERS : {}) }));
  await ctx.route('https://primary-production-5c3c.up.railway.app/**', r => { const u = r.request().url();
    if (u.endsWith('/webhook/suite/acceso-registro')) { reg.push(JSON.parse(r.request().postData() || '{}')); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  if (extraInit) await ctx.addInitScript(extraInit);
  return ctx;
}

(async () => {
  const srv = await servir(RAIZ), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(), errs = [];
  const nueva = (ctx) => ctx.newPage().then(p => { p.on('pageerror', e => errs.push(e.message)); return p; });

  seccion('Interruptor APAGADO');
  FLAG = false;
  let ctx = await contexto(browser), page = await nueva(ctx);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  check('el enlace no se ve', !(await page.isVisible('#dual-enlace')));
  const shotApagado = await page.screenshot();
  if (MAIN) {
    const srvM = await servir(MAIN), ctxM = await contexto(browser), pm = await nueva(ctxM);
    await pm.goto('http://127.0.0.1:' + srvM.address().port + '/index.html', { waitUntil: 'networkidle' }); await pm.waitForTimeout(400);
    const shotMain = await pm.screenshot(); srvM.close(); await ctxM.close();
    check('pantalla idéntica a main, byte por byte', Buffer.compare(shotApagado, shotMain) === 0);
  }
  await ctx.close();

  seccion('Interruptor PRENDIDO');
  FLAG = true; reg.length = 0;
  ctx = await contexto(browser); page = await nueva(ctx);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  check('el enlace se ve, debajo de «Ingresar»', await page.isVisible('#dual-enlace'));
  check('el texto es el pedido', (await page.textContent('#dual-enlace')).trim() === '¿Ya tienes usuario y contraseña personales? Entra aquí');
  if (OUT) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(100); await page.screenshot({ path: path.join(OUT, 'a-enlace-' + w + '.png') }); }
  await page.setViewportSize({ width: 380, height: 860 });
  await page.click('#dual-enlace');
  check('abre la ventanita', await page.isVisible('#dual-modal'));
  if (OUT) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(100); await page.screenshot({ path: path.join(OUT, 'b-ventanita-' + w + '.png') }); }
  await page.click('#dual-no');
  check('«Todavía no» la cierra y deja la entrada', !(await page.isVisible('#dual-modal')) && await page.isVisible('#login-btn'));
  // acceso anterior intacto
  await page.fill('#login-user', 'zz.anterior'); await page.fill('#login-pass', PASS); await page.click('#login-btn');
  await page.waitForFunction(() => document.getElementById('login-overlay').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
  check('el acceso anterior entra igual por «Ingresar»', await page.evaluate(() => document.getElementById('login-overlay').style.display === 'none' && !!FTSAuth.getSession()));
  await page.waitForTimeout(300);
  check('registro: dual_enlace, dual_no, portal_anterior', ['dual_enlace', 'dual_no', 'portal_anterior'].every(t => reg.some(x => x.tipo === t)), JSON.stringify(reg.map(x => x.tipo)));
  check('el registro nunca lleva la contraseña', !JSON.stringify(reg).includes(PASS));
  await ctx.close();

  seccion('«Sí, los tengo» y la cuenta personal');
  reg.length = 0;
  ctx = await contexto(browser); page = await nueva(ctx);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.click('#dual-enlace'); await page.click('#dual-si'); await page.waitForURL(/shared\/login\.html/, { timeout: 8000 });
  check('lleva a shared/login.html', /shared\/login\.html/.test(page.url()));
  check('trae «Volver a la entrada anterior»', await page.isVisible('#volver'));
  if (OUT) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(100); await page.screenshot({ path: path.join(OUT, 'c-login-nuevo-' + w + '.png') }); }
  await page.click('#volver'); await page.waitForURL(/\/index\.html$/, { timeout: 8000 });
  check('«Volver» regresa a la entrada', /\/index\.html$/.test(page.url()) && await page.isVisible('#login-btn'));
  await page.waitForTimeout(300);
  check('registro: dual_si y dual_volver', ['dual_si', 'dual_volver'].every(t => reg.some(x => x.tipo === t)), JSON.stringify(reg.map(x => x.tipo)));
  await ctx.close();
  // sesión de cuenta personal ya hecha → la Suite se abre con ella
  const exp = Math.floor(Date.now() / 1000) + 3600;
  ctx = await contexto(browser, `localStorage.setItem('fts_suite_session', JSON.stringify({token:'x.y.z',actor:'zz.nuevo',nombre:'ZZ Nuevo',scopes:['comercial:zz'],exp:${exp}}))`);
  page = await nueva(ctx);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  check('con cuenta personal llega a su portal (sin pedir la entrada anterior)', await page.evaluate(() => document.getElementById('login-overlay').style.display === 'none'));
  check('la barra dice su nombre', /ZZ Nuevo/.test(await page.textContent('#user-info')));
  await page.evaluate(() => doLogout()); await page.waitForTimeout(200);
  check('«Cerrar sesión» cierra también la cuenta personal', await page.evaluate(() => !SuiteAuth.getSession() && document.getElementById('login-overlay').style.display === 'flex'));
  await ctx.close();

  seccion('Higiene'); check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
