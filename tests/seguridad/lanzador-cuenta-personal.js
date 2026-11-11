#!/usr/bin/env node
// #501 · Lanzador y portada de RH con la CUENTA PERSONAL (SuiteAuth): cada tarjeta se decide
// por los scopes del token (SUITE_TARJETAS); la entrada anterior queda igual que en main.
// Y el interruptor del panel de incidencias en su forma "scope:<s>".
// Todo con cuentas ZZ inventadas y servidores interceptados: no toca n8n, Odoo ni GitHub.
//   node tests/seguridad/lanzador-cuenta-personal.js [raiz_main]   (SHOTS_DIR=<dir> captura 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..'), MAIN = process.argv[2] || null;
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PASS = 'prueba-' + crypto.randomBytes(4).toString('hex');
const USERS = { users: [{ id: 'zz1', username: 'zz.anterior', password_hash: crypto.createHash('sha256').update(PASS).digest('hex'), nombre: 'ZZ Anterior', activo: true, vigencia: null, role: 'user', modulos: { operaciones: { acceso: true } } }] };

// Los 29 de Dirección de hoy + suite:direccion (chats_0014).
const DIRECCION = ['bancos_data:read', 'chats:admin', 'chats:residente', 'chats:usar', 'comercial:admin', 'comercial:orden', 'comercial:read', 'comercial:supervisor', 'comercial:write', 'conceptualizador:admin', 'conceptualizador:usar', 'incidencias:resolver', 'marketing:bandeja', 'marketing:crm', 'marketing:equipo', 'marketing:usar', 'nomina:write', 'nomina_usa:admin', 'nomina_usa:archivo', 'nomina_usa:autorizar', 'nomina_usa:kiosko', 'nomina_usa:validar', 'planeacion:confirmar', 'pmo:write', 'rentabilidad:read', 'retardos:read', 'retardos:write', 'rh:read', 'usuarios:alta_codigo', 'suite:direccion'];
const CARDS = ['card-operaciones', 'card-comercial', 'card-finanzas', 'card-pmo', 'card-rh', 'card-config-master', 'card-hatch', 'card-seguridad', 'card-ingenieria'];

function servir(raiz) { return new Promise(res => { const s = http.createServer((q, r) => { let p = path.join(raiz, decodeURIComponent(q.url.split('?')[0]));
  if (p.endsWith('/shared/public-config.json')) { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8')); c.login_dual_v1 = true; r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify(c)); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(raiz) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

async function contexto(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 860 } });
  await ctx.route(/api\.github\.com|raw\.githubusercontent\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/users-suite/.test(r.request().url()) ? USERS : {}) }));
  await ctx.route('https://primary-production-5c3c.up.railway.app/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  if (init) await ctx.addInitScript(init);
  return ctx;
}
const sesion = (actor, scopes) => `localStorage.setItem('fts_suite_session', JSON.stringify({token:'x.y.z',actor:'${actor}',nombre:'${actor.toUpperCase()}',empleado_id:900100,scopes:${JSON.stringify(scopes)},exp:${Math.floor(Date.now() / 1000) + 3600}}));sessionStorage.setItem('fts_portal_via_nuevo','1');`;

async function estado(page) {
  return page.evaluate((ids) => {
    const o = {};
    ids.forEach(id => { const c = document.getElementById(id); if (!c) return;
      const vis = getComputedStyle(c).display !== 'none';
      const bloq = !!c.querySelector('.access-badge') || c.style.pointerEvents === 'none' || c.classList.contains('disabled');
      o[id] = !vis ? 'oculta' : bloq ? 'bloqueada' : (c.querySelector('.suite-sello') ? 'c4' : 'abre'); });
    return o;
  }, CARDS);
}
async function capturas(page, nombre) {
  if (!OUT) return;
  for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT, nombre + '-' + w + '.png'), fullPage: true });
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(nombre + ' a ' + w + ' px sin scroll horizontal', !scroll); }
  await page.setViewportSize({ width: 380, height: 860 });
}

(async () => {
  const srv = await servir(RAIZ), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(), errs = [];
  const nueva = (ctx) => ctx.newPage().then(p => { p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; });
  const abrir = async (init) => { const ctx = await contexto(browser, init), page = await nueva(ctx);
    await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(500); return { ctx, page }; };

  seccion('Dirección con la cuenta personal');
  let { ctx, page } = await abrir(sesion('zz.direccion', DIRECCION));
  let e = await estado(page);
  check('entra sin la entrada anterior', await page.evaluate(() => document.getElementById('login-overlay').style.display === 'none'));
  check('Comercial y RH abren directo', e['card-comercial'] === 'abre' && e['card-rh'] === 'abre', JSON.stringify(e));
  check('los 7 módulos de la entrada anterior se ven y abren con sello', ['card-operaciones', 'card-finanzas', 'card-pmo', 'card-seguridad', 'card-ingenieria', 'card-config-master', 'card-hatch'].every(k => e[k] === 'c4'), JSON.stringify(e));
  check('ninguna tarjeta de módulo «Sin acceso» (Odoo sigue «Próximamente»)', await page.evaluate(() => [...document.querySelectorAll('.access-badge')].every(b => b.closest('#card-odoo'))));
  await capturas(page, 'a-direccion');
  await page.click('#card-rh'); await page.waitForURL(/modulos\/rh\/index\.html/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  check('la tarjeta RH abre la portada de RH', /modulos\/rh\/index\.html/.test(page.url()));
  check('la portada de RH entra con la cuenta personal', /ZZ\.DIRECCION/.test(await page.textContent('#rh-user-name')));
  check('RH marca las 3 tarjetas que piden la entrada anterior', (await page.$$eval('.rh-card .rh-sello', xs => xs.filter(x => /entrada anterior/.test(x.textContent)).length)) === 3);
  await capturas(page, 'b-rh-direccion');
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await page.evaluate(() => doLogout()); await page.waitForTimeout(200);
  e = await estado(page);
  check('«Cerrar sesión» quita sellos y vuelve a esconder Config y Hatch', await page.evaluate(() => !document.querySelector('.suite-sello')) && e['card-config-master'] === 'oculta' && e['card-hatch'] === 'oculta', JSON.stringify(e));
  await ctx.close();

  seccion('Cuenta comercial (sin Dirección)');
  ({ ctx, page } = await abrir(sesion('zz.comercial', ['chats:usar', 'comercial:read', 'conceptualizador:usar'])));
  e = await estado(page);
  check('Comercial abre', e['card-comercial'] === 'abre', JSON.stringify(e));
  check('RH sigue dormida y lo demás bloqueado u oculto', e['card-rh'] === 'bloqueada' && ['card-operaciones', 'card-finanzas', 'card-seguridad', 'card-ingenieria'].every(k => e[k] === 'bloqueada') && e['card-hatch'] === 'oculta' && e['card-config-master'] === 'oculta', JSON.stringify(e));
  await ctx.close();

  seccion('Cuenta de RH');
  ({ ctx, page } = await abrir(sesion('zz.rh', ['nomina:write', 'rh:read', 'retardos:read', 'retardos:write', 'nomina_usa:validar', 'usuarios:alta_codigo'])));
  e = await estado(page);
  check('RH abre y Comercial no', e['card-rh'] === 'abre' && e['card-comercial'] === 'bloqueada', JSON.stringify(e));
  await page.goto(base + '/modulos/rh/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  check('la portada de RH entra', /ZZ\.RH/.test(await page.textContent('#rh-user-name')));
  await ctx.close();

  seccion('Solo Nómina USA (prefijo nomina_usa:)');
  ({ ctx, page } = await abrir(sesion('zz.usa', ['nomina_usa:kiosko'])));
  e = await estado(page); check('RH abre', e['card-rh'] === 'abre', JSON.stringify(e)); await ctx.close();

  seccion('Técnico (solo chats)');
  ({ ctx, page } = await abrir(sesion('zz.tecnico', ['chats:usar'])));
  e = await estado(page);
  check('ninguna tarjeta de módulo abre', CARDS.every(k => e[k] === 'bloqueada' || e[k] === 'oculta'), JSON.stringify(e));
  await page.goto(base + '/modulos/rh/index.html', { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(400);
  check('la portada de RH lo regresa', !/modulos\/rh/.test(page.url()));
  await ctx.close();

  seccion('Entrada anterior: igual que main');
  const viejo = async (raiz) => { const s2 = await servir(raiz), c2 = await contexto(browser), p2 = await nueva(c2);
    await p2.goto('http://127.0.0.1:' + s2.address().port + '/index.html', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.fill('#login-user', 'zz.anterior'); await p2.fill('#login-pass', PASS); await p2.click('#login-btn');
    await p2.waitForFunction(() => document.getElementById('login-overlay').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
    await p2.waitForTimeout(300); await p2.addStyleTag({ content: '#sb-clock{visibility:hidden}' }); const r = { e: await estado(p2), shot: await p2.screenshot() }; await c2.close(); s2.close(); return r; };
  const yo = await viejo(RAIZ);
  check('con módulos de la entrada anterior: Operaciones abre, Comercial «Sin acceso»', yo.e['card-operaciones'] === 'abre' && yo.e['card-comercial'] === 'bloqueada', JSON.stringify(yo.e));
  if (MAIN) { const m = await viejo(MAIN); check('mismas tarjetas que main', JSON.stringify(m.e) === JSON.stringify(yo.e), JSON.stringify(m.e)); check('pantalla idéntica a main, byte por byte', Buffer.compare(m.shot, yo.shot) === 0); }

  seccion('Higiene'); check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
