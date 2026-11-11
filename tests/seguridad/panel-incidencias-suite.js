// Prueba del interruptor incidencias_suite_v1 (#485, 11-nov-2026) en el panel de incidencias.
// Todo con datos ZZ inventados: se interceptan public-config, derivar-roles y el almacén de
// incidencias. No toca Odoo ni GitHub ni n8n.
//   node tests/seguridad/panel-incidencias-suite.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');

const ZZ = {
  sup:   { id: 900001, roles: ['supervisor'], depto: 'Operaciones' },
  rh:    { id: 900002, roles: ['rh'],         depto: 'Recursos Humanos' },
  aud:   { id: 900003, roles: ['supervisor', 'direccion'], depto: 'Dirección' },
  nadie: { id: 900004, roles: [], depto: 'Operaciones' }
};
const INC = [
  { id_interno: 'ZZ-1', tipo: 'olvido_entrada',  status: 'pendiente_supervisor', empleado_id: 900011, empleado_nombre: 'ZZ gente de sup', supervisor_id: 900001, fecha_creacion: '2026-11-11T10:00:00Z' },
  { id_interno: 'ZZ-2', tipo: 'olvido_entrada',  status: 'pendiente_supervisor', empleado_id: 900021, empleado_nombre: 'ZZ gente de otro', supervisor_id: 900099, fecha_creacion: '2026-11-11T10:01:00Z' },
  { id_interno: 'ZZ-3', tipo: 'olvido_checkout', status: 'pendiente_rh',         empleado_id: 900012, empleado_nombre: 'ZZ para RH', supervisor_id: null, fecha_creacion: '2026-11-11T10:02:00Z' },
  { id_interno: 'ZZ-4', tipo: 'olvido_checkout', status: 'pendiente_rh',         empleado_id: 900002, empleado_nombre: 'ZZ la propia de RH', supervisor_id: null, fecha_creacion: '2026-11-11T10:03:00Z' },
  { id_interno: 'ZZ-5', tipo: 'olvido_entrada',  status: 'pendiente_supervisor', empleado_id: 900001, empleado_nombre: 'ZZ la propia del sup', supervisor_id: 900001, fecha_creacion: '2026-11-11T10:04:00Z' },
  { id_interno: 'ZZ-6', tipo: 'olvido_entrada',  status: 'pendiente_direccion',  empleado_id: 900013, empleado_nombre: 'ZZ para Dir', supervisor_id: null, fecha_creacion: '2026-11-11T10:05:00Z' },
  { id_interno: 'ZZ-7', tipo: 'olvido_entrada',  status: 'pendiente_supervisor', empleado_id: 900014, empleado_nombre: 'ZZ gente del aud', supervisor_id: 900003, fecha_creacion: '2026-11-11T10:06:00Z' }
];

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
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errores = [], alertas = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('dialog', d => { alertas.push(d.message()); d.accept(); });
  await page.route('**/shared/public-config.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ login_dual_v1: true, incidencias_suite_v1: o.flag }) }));
  await page.route('**/webhook/panel/derivar-roles*', r => {
    const id = Number(new URL(r.request().url()).searchParams.get('empleado_id'));
    const z = Object.values(ZZ).find(x => x.id === id);
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(z ? { success: true, empleado_id: id, empleado_nombre: 'ZZ ' + id, department_name: z.depto, roles_derivados: z.roles } : { success: false }) });
  });
  await page.route('**/api.github.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'zz', incidencias: INC }) }));
  await page.route('**/index.html', r => r.request().url().includes('panel-incidencias') ? r.continue() : r.fulfill({ contentType: 'text/html', body: '<p>fuera</p>' }));
  await page.addInitScript(o2 => {
    if (o2.mp) sessionStorage.setItem('fts_mi_perfil_session', JSON.stringify({ empleado_id: o2.mp, empleado_nombre: 'ZZ mp', ts: Date.now() }));
    if (o2.suite) localStorage.setItem('fts_suite_session', JSON.stringify({ token: 'zz.no.firmado', actor: 'zz.prueba', nombre: 'ZZ suite', empleado_id: o2.suite.id, scopes: o2.suite.scopes, exp: Math.floor(Date.now() / 1000) + 600 }));
  }, o);
  await page.goto(base + '/shared/mi-perfil/panel-incidencias/index.html');
  await page.waitForTimeout(900);
  const fuera = page.url().indexOf('panel-incidencias') < 0;
  const tabs = fuera ? [] : await page.$$eval('.pi-tab', b => b.map(x => x.dataset.rol));
  const porTab = {};
  for (const t of tabs) {
    await page.click('.pi-tab[data-rol="' + t + '"]');
    await page.waitForTimeout(150);
    porTab[t] = await page.$$eval('.pi-card .pi-card-id', cs => cs.map(c => (c.textContent.match(/\d+/) || [''])[0]));
  }
  await ctx.close();
  return { fuera, tabs, porTab, errores, alertas };
}

(async () => {
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  let ok = 0, mal = 0; const errs = [];
  const chk = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { mal++; console.log('  ✗ ' + n + ' → ' + JSON.stringify(d)); } };
  try {
    const AUD = { id: 900003, scopes: ['incidencias:resolver', 'rh:read'] };
    let r;
    console.log('A · interruptor APAGADO, solo cuenta personal → igual que antes: fuera');
    r = await caso(browser, base, { flag: false, suite: { id: 900001, scopes: [] } });
    errs.push(...r.errores);
    chk('sin sesión de Mi Perfil lo regresa', r.fuera && /Sesión no válida/.test(r.alertas.join()), r);
    console.log('B · APAGADO, sesión de Mi Perfil del supervisor zz → igual que antes');
    r = await caso(browser, base, { flag: false, mp: 900001 });
    errs.push(...r.errores);
    chk('tabs = supervisor', JSON.stringify(r.tabs) === '["supervisor"]', r.tabs);
    chk('solo ve a su gente (900011), ni la de otro ni la propia', JSON.stringify(r.porTab.supervisor) === '["900011"]', r.porTab);
    console.log('C · PRENDIDO, solo cuenta personal del supervisor zz');
    r = await caso(browser, base, { flag: true, suite: { id: 900001, scopes: ['chats:usar'] } });
    errs.push(...r.errores);
    chk('entra con la cuenta personal', !r.fuera, r);
    chk('tabs = supervisor (sin RH ni Dirección)', JSON.stringify(r.tabs) === '["supervisor"]', r.tabs);
    chk('solo su gente', JSON.stringify(r.porTab.supervisor) === '["900011"]', r.porTab);
    console.log('D · PRENDIDO, RH zz por cuenta personal');
    r = await caso(browser, base, { flag: true, suite: { id: 900002, scopes: ['rh:read'] } });
    errs.push(...r.errores);
    chk('tabs = rh', JSON.stringify(r.tabs) === '["rh"]', r.tabs);
    chk('ve lo de RH, no la suya', JSON.stringify(r.porTab.rh) === '["900012"]', r.porTab);
    console.log('E · PRENDIDO, auditor zz (incidencias:resolver) por cuenta personal');
    r = await caso(browser, base, { flag: true, suite: AUD });
    errs.push(...r.errores);
    chk('tabs = supervisor, direccion, rh', JSON.stringify(r.tabs) === '["supervisor","direccion","rh"]', r.tabs);
    chk('supervisor: solo su gente', JSON.stringify(r.porTab.supervisor) === '["900014"]', r.porTab);
    chk('rh: ve las de RH (900012 y la de RH 900002)', JSON.stringify((r.porTab.rh || []).slice().sort()) === '["900002","900012"]', r.porTab);
    chk('dirección: ve la de Dirección', JSON.stringify(r.porTab.direccion) === '["900013"]', r.porTab);
    console.log('F · PRENDIDO, Mi Perfil del auditor + cuenta personal de OTRA persona con el scope → no hereda');
    r = await caso(browser, base, { flag: true, mp: 900003, suite: { id: 900001, scopes: ['incidencias:resolver'] } });
    errs.push(...r.errores);
    chk('tabs = supervisor, direccion (sin RH)', JSON.stringify(r.tabs) === '["supervisor","direccion"]', r.tabs);
    console.log('G · PRENDIDO, Mi Perfil + cuenta personal de la MISMA persona con el scope → RH de auditor');
    r = await caso(browser, base, { flag: true, mp: 900003, suite: AUD });
    errs.push(...r.errores);
    chk('tabs incluyen rh', r.tabs.indexOf('rh') >= 0, r.tabs);
    console.log('H · APAGADO con el scope → no hay RH de auditor');
    r = await caso(browser, base, { flag: false, mp: 900003, suite: AUD });
    errs.push(...r.errores);
    chk('tabs = supervisor, direccion', JSON.stringify(r.tabs) === '["supervisor","direccion"]', r.tabs);
    console.log('I · PRENDIDO, sin roles derivados ni scope → fuera, como antes');
    r = await caso(browser, base, { flag: true, suite: { id: 900004, scopes: [] } });
    errs.push(...r.errores);
    chk('lo regresa con el aviso de sin roles', r.fuera && /No tienes roles/.test(r.alertas.join()), r);
    console.log('J · #501 "scope:incidencias:resolver", auditor con el scope por cuenta personal → prendido para él');
    r = await caso(browser, base, { flag: 'scope:incidencias:resolver', suite: AUD });
    errs.push(...r.errores);
    chk('tabs = supervisor, direccion, rh', JSON.stringify(r.tabs) === '["supervisor","direccion","rh"]', r.tabs);
    console.log('K · #501 "scope:incidencias:resolver", supervisor SIN el scope → apagado para él (como antes: fuera)');
    r = await caso(browser, base, { flag: 'scope:incidencias:resolver', suite: { id: 900001, scopes: ['chats:usar'] } });
    errs.push(...r.errores);
    chk('sin sesión de Mi Perfil lo regresa', r.fuera && /Sesión no válida/.test(r.alertas.join()), r);
    console.log('L · #501 un arreglo (forma no admitida) = apagado');
    r = await caso(browser, base, { flag: ['zz.prueba'], suite: AUD });
    errs.push(...r.errores);
    chk('lo regresa', r.fuera, r);
    chk('ningún pageerror en los casos', errs.length === 0, errs);
  } finally { await browser.close(); srv.close(); }
  console.log((mal ? '✗ ' : '✓ ') + ok + '/' + (ok + mal));
  process.exit(mal ? 1 : 0);
})();
