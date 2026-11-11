#!/usr/bin/env node
// #501 Fase 2 · Jerarquía de incidencias dinámica (incidencias_jerarquia_v1) con una cadena ZZ:
//   técnico 900201 → supervisor 900202 → gerente 900203 → cima 900204 (su propio jefe) · RH 900205 (jefe: cima)
// Se interceptan public-config, empleados-master, panel/aprobadores, derivar-roles, el almacén y el resolver.
// No toca n8n, Odoo ni GitHub. También prueba la función pura shared/lib/jerarquia.js.
//   node tests/seguridad/panel-jerarquia.js        (SHOTS_DIR=<dir> captura 380/760/900/1280)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const J = require('../../shared/lib/jerarquia.js');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
let ok = 0, mal = 0;
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { mal++; console.log('  ✗ ' + n + ' → ' + JSON.stringify(d)); } };

const MASTER = { empleados: [
  { id: 900201, name: 'ZZ Técnico', parent_id: 900202 },
  { id: 900202, name: 'ZZ Supervisor', parent_id: 900203 },
  { id: 900203, name: 'ZZ Gerente', parent_id: 900204 },
  { id: 900204, name: 'ZZ Cima', parent_id: 900204 },
  { id: 900205, name: 'ZZ RH', parent_id: 900204 },
  { id: 900206, name: 'ZZ Sin jefe', parent_id: null },
  { id: 900207, name: 'ZZ Ciclo A', parent_id: 900208 },
  { id: 900208, name: 'ZZ Ciclo B', parent_id: 900207 }
] };
const ROLES = { 900202: ['supervisor'], 900203: ['supervisor'], 900204: ['supervisor', 'direccion'], 900205: ['rh'] };
const INC = [
  { id_interno: 'ZZJ-1', tipo: 'olvido_entrada', status: 'pendiente_supervisor', empleado_id: 900201, empleado_nombre: 'ZZ Técnico', supervisor_id: 900202, fecha_creacion: '2026-11-11T10:00:00Z' },
  { id_interno: 'ZZJ-2', tipo: 'olvido_entrada', status: 'pendiente_supervisor', empleado_id: 900203, empleado_nombre: 'ZZ Gerente (propia)', supervisor_id: 900204, fecha_creacion: '2026-11-11T10:01:00Z' },
  { id_interno: 'ZZJ-3', tipo: 'olvido_checkout', status: 'pendiente_rh', empleado_id: 900202, empleado_nombre: 'ZZ Supervisor', supervisor_id: null, fecha_creacion: '2026-11-11T10:02:00Z' }
];

// ── 1 · Función pura ──
console.log('1 · shared/lib/jerarquia.js');
const ix = J.indice(MASTER);
const todos = () => true, sin = (ids) => (id) => ids.indexOf(id) < 0;
let a = J.aprobador(900201, ix, todos);
chk('normal: su jefe directo', a.destino === 'supervisor' && a.aprobador_id === 900202 && !a.escalada, a);
a = J.aprobador(900201, ix, sin([900202]));
chk('jefe sin cuenta → sube al gerente, escalada', a.destino === 'supervisor' && a.aprobador_id === 900203 && a.escalada && a.saltados[0] === 900202, a);
a = J.aprobador(900201, ix, sin([900202, 900203]));
chk('nadie con cuenta antes de la cima → RH, escalada', a.destino === 'rh' && a.escalada && a.motivo === 'escalada_hasta_la_cima', a);
a = J.aprobador(900203, ix, todos);
chk('reporta directo a la cima → RH (como F2.1)', a.destino === 'rh' && !a.escalada && a.motivo === 'directo_a_la_cima', a);
a = J.aprobador(900204, ix, todos);
chk('la cima → RH', a.destino === 'rh' && a.motivo === 'es_la_cima', a);
a = J.aprobador(900206, ix, todos);
chk('sin jefe → RH', a.destino === 'rh' && a.motivo === 'sin_jefe', a);
a = J.aprobador(900207, ix, sin([900208]));
chk('ciclo → RH', a.destino === 'rh' && a.motivo === 'ciclo', a);
a = J.aprobador(999999, ix, todos);
chk('fuera del padrón → RH', a.destino === 'rh' && a.motivo === 'fuera_del_padron', a);
const h = J.huecos(ix, sin([900202]));
chk('huecos: sin jefe, ciclos y jefe sin cuenta', h.sin_jefe.join() === '900206' && h.ciclos.length === 2 && h.jefes_sin_cuenta.join() === '900202', h);
const ix2 = J.indice({ empleados: MASTER.empleados.map(e => e.id === 900201 ? Object.assign({}, e, { parent_id: 900203 }) : e) });
a = J.aprobador(900201, ix2, todos);
chk('cambia el jefe en Odoo → cambia quién autoriza (dinámico)', a.aprobador_id === 900203, a);

// ── 2 · Panel ──
function servidor() {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/javascript' });
      r.end(fs.readFileSync(f));
    }).listen(0, () => res(s));
  });
}
async function caso(browser, base, o) {
  const ctx = await browser.newContext({ viewport: { width: o.ancho || 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [], alertas = [], resolver = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('dialog', d => { alertas.push(d.message()); d.accept(); });
  await page.route('**/shared/public-config.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ login_dual_v1: true, incidencias_suite_v1: true, incidencias_jerarquia_v1: o.flag }) }));
  await page.route('**/shared/config/empleados-master.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(MASTER) }));
  await page.route('**/webhook/panel/aprobadores', r => o.aprobadores === 'falla' ? r.fulfill({ status: 502, body: '' }) : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, con_cuenta: o.aprobadores }) }));
  await page.route('**/webhook/panel/derivar-roles*', r => { const id = Number(new URL(r.request().url()).searchParams.get('empleado_id'));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, empleado_id: id, empleado_nombre: 'ZZ ' + id, department_name: 'Operaciones', roles_derivados: ROLES[id] || [] }) }); });
  await page.route('**/api.github.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'zz', incidencias: INC }) }));
  await page.route('**/webhook/incidencias/resolver', r => { resolver.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ contentType: 'application/json', body: '{"success":true,"nuevo_status":"pendiente_rh"}' }); });
  await page.route('**/index.html', r => r.request().url().includes('panel-incidencias') ? r.continue() : r.fulfill({ contentType: 'text/html', body: '<p>fuera</p>' }));
  await page.addInitScript(x => localStorage.setItem('fts_suite_session', JSON.stringify({ token: 'zz.no.firmado', actor: 'zz.' + x.yo, nombre: 'ZZ ' + x.yo, empleado_id: x.yo, scopes: x.scopes, exp: Math.floor(Date.now() / 1000) + 600 })), o);
  await page.goto(base + '/shared/mi-perfil/panel-incidencias/index.html');
  await page.waitForTimeout(900);
  const fuera = page.url().indexOf('panel-incidencias') < 0;
  const tabs = fuera ? [] : await page.$$eval('.pi-tab', b => b.map(x => x.dataset.rol));
  const porTab = {}, chips = {};
  for (const t of tabs) {
    await page.click('.pi-tab[data-rol="' + t + '"]'); await page.waitForTimeout(150);
    porTab[t] = await page.$$eval('.pi-card .pi-card-id', cs => cs.map(c => ({ '900201': 'ZZJ-1', '900203': 'ZZJ-2', '900202': 'ZZJ-3' })[(c.textContent.match(/\d+/) || [''])[0]] || '?'));
    chips[t] = await page.$$eval('.pi-chip-escalada', cs => cs.length);
  }
  if (OUT && o.captura) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT, o.captura + '-' + w + '.png'), fullPage: true });
    chk(o.captura + ' a ' + w + ' sin scroll horizontal', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))); }
  if (o.actuar) {
    await page.click('.pi-tab[data-rol="' + o.actuar.tab + '"]'); await page.waitForTimeout(150);
    const esc = page.locator('.pi-card:has(.pi-chip-escalada) .pi-btn-aprobar');
    await ((await esc.count()) ? esc.first() : page.locator('.pi-btn-aprobar').first()).click(); await page.waitForTimeout(150);
    await page.fill('#pi-acc-comentario', 'Aprobado en prueba ZZ de jerarquía'); await page.click('#pi-acc-confirmar'); await page.waitForTimeout(500);
  }
  await ctx.close();
  return { fuera, tabs, porTab, chips, errores, alertas, resolver };
}

(async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port, browser = await chromium.launch(); const errs = [];
  const FLAG = 'scope:zz:jerarquia', SC = ['chats:usar', 'zz:jerarquia'];
  const TODOS = [900202, 900203, 900204, 900205];
  try {
    let r;
    console.log('2 · APAGADO → como antes (supervisor_id congelado)');
    r = await caso(browser, base, { flag: false, yo: 900202, scopes: SC, aprobadores: TODOS }); errs.push(...r.errores);
    chk('supervisor ve la de su técnico', JSON.stringify(r.porTab.supervisor) === '["ZZJ-1"]', r.porTab);
    r = await caso(browser, base, { flag: false, yo: 900203, scopes: SC, aprobadores: [900203] }); errs.push(...r.errores);
    chk('gerente NO la ve aunque su supervisor no tenga cuenta', (r.porTab.supervisor || []).indexOf('ZZJ-1') < 0, r.porTab);

    console.log('3 · PRENDIDO para la cuenta, todos con cuenta → igual que antes');
    r = await caso(browser, base, { flag: FLAG, yo: 900202, scopes: SC, aprobadores: TODOS, captura: 'jer-supervisor' }); errs.push(...r.errores);
    chk('supervisor ve la de su técnico, sin chip', JSON.stringify(r.porTab.supervisor) === '["ZZJ-1"]' && r.chips.supervisor === 0, r);

    console.log('4 · PRENDIDO, el supervisor NO tiene cuenta → escala al gerente');
    r = await caso(browser, base, { flag: FLAG, yo: 900203, scopes: SC, aprobadores: [900203, 900204, 900205], captura: 'jer-escalada', actuar: { tab: 'supervisor' } }); errs.push(...r.errores);
    chk('el gerente la ve, con chip «Escalada»', (r.porTab.supervisor || []).indexOf('ZZJ-1') >= 0 && r.chips.supervisor >= 1, r);
    chk('el gerente no ve la suya', (r.porTab.supervisor || []).indexOf('ZZJ-2') < 0, r.porTab);
    chk('aprueba como supervisor (el resolver lo pasa a RH)', r.resolver.length === 1 && r.resolver[0].rol_ejecutor === 'supervisor' && r.resolver[0].empleado_ejecutor_id === 900203 && r.resolver[0].id_interno === 'ZZJ-1', r.resolver);
    r = await caso(browser, base, { flag: FLAG, yo: 900202, scopes: SC, aprobadores: [900203, 900204, 900205] }); errs.push(...r.errores);
    chk('el supervisor (con el interruptor) ya no la ve: ahora es del gerente', (r.porTab.supervisor || []).indexOf('ZZJ-1') < 0, r.porTab);

    console.log('5 · PRENDIDO, ni supervisor ni gerente con cuenta → RH con aviso');
    r = await caso(browser, base, { flag: FLAG, yo: 900205, scopes: SC, aprobadores: [900204, 900205], captura: 'jer-rh', actuar: { tab: 'rh' } }); errs.push(...r.errores);
    chk('RH la ve junto a lo suyo, con chip', (r.porTab.rh || []).indexOf('ZZJ-1') >= 0 && (r.porTab.rh || []).indexOf('ZZJ-3') >= 0 && r.chips.rh >= 1, r);
    chk('RH la mueve como supervisor (no se atora)', r.resolver.length === 1 && r.resolver[0].rol_ejecutor === 'supervisor', r.resolver);
    r = await caso(browser, base, { flag: false, yo: 900205, scopes: SC, aprobadores: [900204, 900205] }); errs.push(...r.errores);
    chk('APAGADO, RH no ve la escalada (como antes)', (r.porTab.rh || []).indexOf('ZZJ-1') < 0, r.porTab);

    console.log('6 · PRENDIDO pero panel/aprobadores falla → como antes, nunca esconde');
    r = await caso(browser, base, { flag: FLAG, yo: 900202, scopes: SC, aprobadores: 'falla' }); errs.push(...r.errores);
    chk('supervisor ve la de su técnico (congelado)', JSON.stringify(r.porTab.supervisor) === '["ZZJ-1"]', r.porTab);

    console.log('7 · interruptor "scope:" y la cuenta no trae el scope → apagado para ella');
    r = await caso(browser, base, { flag: FLAG, yo: 900203, scopes: ['chats:usar'], aprobadores: [900203] }); errs.push(...r.errores);
    chk('gerente sin el scope no recibe la escalada', (r.porTab.supervisor || []).indexOf('ZZJ-1') < 0, r.porTab);

    chk('ningún pageerror', errs.length === 0, errs);
  } finally { await browser.close(); srv.close(); }
  console.log((mal ? '✗ ' : '✓ ') + ok + '/' + (ok + mal));
  process.exit(mal ? 1 : 0);
})();
