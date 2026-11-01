#!/usr/bin/env node
// Kiosko real (operaciones/kiosk/index.html) en Chromium con el flujo USA de nómina (#448, fase B).
// Lo que importa primero: un empleado de México checa EXACTAMENTE igual que hoy, con el
// interruptor prendido o apagado (se compara el cuerpo del POST a /kiosk/checkin contra la
// línea base campo por campo). Después: Mateo desde Texas no entra sin SO, desde Monterrey
// entra normal y el día queda MX, sin ubicación pregunta país; Ricardo no baja avance, su día
// suma 100 y el comercial con exceso exige explicación.
// No toca Odoo ni n8n: todo interceptado. Empleados 75/79/98 por id; nombres inventados.
//   SHOTS_DIR=docs/nomina-usa/capturas/fase-b node tests/nomina-usa/kiosko-e2e.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('./lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium']
  .find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };

const PUNTO = { mty: { latitude: 25.6889759, longitude: -100.2916779 }, houston: { latitude: 29.7604, longitude: -95.3698 } };
const EMP = {
  mx:    { id: 9101, name: 'Prueba México', pin: '1234', department_id: 3, department_name: 'Operaciones', manager_id: 9100, manager_name: 'Sup', x_studio_cuenta_indirecta_default: [9513, 'Bolsa'] },
  mateo: { id: 75, name: 'Prueba Mateo', pin: '1234', department_id: 3, department_name: 'Operaciones', manager_id: 112, manager_name: 'Sup' },
  rich:  { id: 98, name: 'Prueba Ricardo', pin: '1234', department_id: 6, department_name: 'Comercial', manager_id: 32, manager_name: 'Dir', x_studio_cuenta_indirecta_default: [9608, 'Ventas'] }
};
const SOS_MX = [{ id: 9201, name: 'SO9201 - Proyecto MX', cliente: 'Cliente MX' }];
const SOS_US = [{ id: 11842, name: 'SO11842 - prensas materials', cliente: 'Client US' }, { id: 11791, name: 'SO11791 - Power and control panels', cliente: 'Client US 2' }];
const ON = { activo: true, personas: { 75: { perfil: 'so_entrada', activo: true }, 79: { perfil: 'so_entrada', activo: true }, 98: { perfil: 'plan_avance', activo: true } } };

function servir() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

async function escenario(browser, base, nombre, o, fn) {
  seccion(nombre);
  const ctx = await browser.newContext(Object.assign({ viewport: { width: o.ancho || 380, height: 860 } },
    o.punto ? { geolocation: o.punto, permissions: ['geolocation'] } : {}));
  const posts = [], nusa = [], errs = [];
  const pub = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8'));
  pub.n8n_url = 'https://n8n.prueba.local';
  await ctx.addInitScript(() => { localStorage.setItem('ops_demo_mode', '0'); localStorage.setItem('ops_n8n_url', 'https://n8n.prueba.local'); });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pub) }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  if (o.kcfg !== undefined) await ctx.route('**/shared/nomina-usa/kiosko.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o.kcfg) }));
  await ctx.route('https://n8n.prueba.local/**', async r => {
    const url = r.request().url(), body = JSON.parse(r.request().postData() || '{}');
    const ok = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.endsWith('/webhook/kiosk/empleados')) return ok({ empleados: [o.emp], total: 1 });
    if (url.endsWith('/webhook/kiosk/sos')) return ok({ sos: body.company_id === 6 ? SOS_US : SOS_MX });
    if (url.endsWith('/webhook/planeacion/dia')) return ok({ plan: false });
    if (url.endsWith('/webhook/kiosk/checkin')) { posts.push(body); return ok({ success: true, accion_valida: true, attendance_id: 99999 }); }
    if (url.endsWith('/webhook/nomina-usa/kiosko')) {
      nusa.push(body);
      if (o.nusaCae) return r.fulfill({ status: 404, body: 'no' });
      if (body.accion === 'contexto') return ok(Object.assign({ ok: true, activo: true, perfil: o.emp.id === 98 ? 'plan_avance' : 'so_entrada', config: { tope_excepcion_puntos: 10, tope_contra_plan_puntos: 20 } }, o.ctx || {}));
      return ok({ ok: true });
    }
    return ok({});
  });
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + '/operaciones/kiosk/index.html');
  await page.waitForFunction(() => typeof K !== 'undefined' && K.empleadosState === 'ok' && K.sosState === 'ok' && window.KioskoUSA && KioskoUSA._st.cfg, null, { timeout: 15000 });
  try { await fn(page, posts, nusa); } catch (e) { check('el escenario terminó sin excepción', false, e.message.split('\n')[0]); }
  check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  await ctx.close();
  return { posts, nusa };
}
const checar = (page, tipo) => page.evaluate(t => { K.seleccionado = K.empleados[0]; K.tipo = t; afterVerifyContinue(); }, tipo);
async function esperar(arr, n, ms) { for (let i = 0; i < (ms || 6000) / 100 && arr.length < n; i++) await new Promise(r => setTimeout(r, 100)); return arr[n - 1]; }
const overlay = page => page.waitForSelector('#nusaOverlay', { timeout: 8000 }).then(() => true).catch(() => false);
const sinVolatiles = p => { const c = Object.assign({}, p); delete c.timestamp; delete c.foto_b64; return c; };
async function fotos(page, nombre) { if (!OUT) return; for (const w of [380, 1280]) { await page.setViewportSize({ width: w, height: 860 }); await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, nombre + '-' + w + '.png'), fullPage: true }); } await page.setViewportSize({ width: 380, height: 860 }); }

(async () => {
  const srv = await servir(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });

  // ── México igual que hoy ──
  const linea = await escenario(browser, base, 'México · línea base: kiosko.json del repo (apagado)', { punto: PUNTO.mty, emp: EMP.mx }, async (page, posts) => {
    check('el kiosko.json del repo viene APAGADO', await page.evaluate(() => KioskoUSA._st.cfg.activo === false));
    await checar(page, 'entrada'); await esperar(posts, 1);
  });
  for (const [nombre, kcfg] of [['interruptor PRENDIDO', ON], ['interruptor apagado explícito', { activo: false, personas: ON.personas }]]) {
    const r = await escenario(browser, base, 'México · ' + nombre + ': mismo POST que la línea base', { punto: PUNTO.mty, emp: EMP.mx, kcfg }, async (page, posts) => {
      await checar(page, 'entrada'); await esperar(posts, 1);
      check('no hubo pantalla USA', !(await page.$('#nusaOverlay')));
    });
    check('se envió una entrada', r.posts.length === 1 && linea.posts.length === 1);
    check('el cuerpo del POST es idéntico campo por campo', JSON.stringify(sinVolatiles(r.posts[0])) === JSON.stringify(sinVolatiles(linea.posts[0])),
      JSON.stringify(sinVolatiles(r.posts[0])) + ' vs ' + JSON.stringify(sinVolatiles(linea.posts[0])));
    check('cero llamadas al webhook nuevo', r.nusa.length === 0);
  }
  await escenario(browser, base, 'México · salida en Monterrey con interruptor prendido: flujo de hoy (banner de bolsa)', { punto: PUNTO.mty, emp: EMP.mx, kcfg: ON }, async (page, posts, nusa) => {
    await checar(page, 'salida');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('ksProjectPlan')).display !== 'none', null, { timeout: 15000 });
    check('banner de bolsa de hoy', /Tu bolsa/.test(await page.evaluate(() => document.getElementById('ksProjectPlan').textContent)));
    check('sin webhook nuevo', nusa.length === 0);
  });

  // ── Mateo ──
  await escenario(browser, base, 'Mateo · Texas, entrada: no entra sin SO', { punto: PUNTO.houston, emp: EMP.mateo, kcfg: ON }, async (page, posts, nusa) => {
    await checar(page, 'entrada');
    check('aparece la pantalla «¿En qué SO trabajas hoy?»', await overlay(page));
    await page.waitForSelector('#nusaLista .nusa-so');
    await new Promise(r => setTimeout(r, 400));
    check('sin elegir SO no se envió la checada', posts.length === 0);
    check('la lista trae SO de USA', await page.evaluate(() => /USA/.test(document.getElementById('nusaLista').textContent)));
    await fotos(page, 'kiosko-mateo-so-entrada');
    await page.click('#nusaLista [data-so="11842"]');
    const p = await esperar(posts, 1);
    const e = nusa.find(x => x.accion === 'evento');
    check('evento entrada_so con la SO elegida', e && e.tipo === 'entrada_so' && e.so && e.so.id === 11842 && e.so.company_id === 6 && e.pais === 'USA', e);
    check('la checada sale como entrada normal (sin SO en el payload de Odoo)', p && p.tipo === 'entrada' && p.so_id === null && p.geo_zona === 'usa' && p.geo_status === 'autorizado', p && { t: p.tipo, so: p.so_id, z: p.geo_zona });
  });
  await escenario(browser, base, 'Mateo · Monterrey: entra normal y el día queda MX', { punto: PUNTO.mty, emp: EMP.mateo, kcfg: ON }, async (page, posts, nusa) => {
    await checar(page, 'entrada');
    const p = await esperar(posts, 1);
    check('sin pantalla USA', !(await page.$('#nusaOverlay')));
    check('entrada normal en sitio', p && p.geo_zona === 'sitio' && p.so_id === null);
    await esperar(nusa, 2);
    const d = nusa.find(x => x.accion === 'evento');
    check('evento día MX por ubicación', d && d.tipo === 'dia' && d.pais === 'MX' && d.pais_origen === 'geo', d);
  });
  await escenario(browser, base, 'Mateo · sin ubicación: pregunta país y queda pendiente de RH', { punto: null, emp: EMP.mateo, kcfg: ON }, async (page, posts, nusa) => {
    await checar(page, 'entrada');
    check('pregunta «¿Hoy trabajas en USA o en México?»', await overlay(page) && /USA o en México/.test(await page.textContent('#nusaOverlay')));
    await fotos(page, 'kiosko-pregunta-pais');
    await page.click('[data-pais="USA"]');
    await page.waitForSelector('#nusaLista .nusa-so');
    await page.click('#nusaLista [data-so="11791"]');
    const p = await esperar(posts, 1);
    const e = nusa.find(x => x.tipo === 'entrada_so');
    check('evento declarado y pendiente de RH', e && e.pais === 'USA' && e.pais_origen === 'declarado' && e.pendiente_rh === true, e);
    check('la checada va a aprobación con motivo', p && p.geo_status === 'pendiente_aprobacion' && /RH/.test(p.geo_motivo || ''), p && { s: p.geo_status, m: p.geo_motivo });
  });
  await escenario(browser, base, 'Mateo · sin ubicación, eligió México: flujo de hoy (fuera de zona con motivo)', { punto: null, emp: EMP.mateo, kcfg: ON }, async (page, posts, nusa) => {
    await checar(page, 'entrada'); await overlay(page);
    await page.click('[data-pais="MX"]');
    check('abre el modal de fuera de zona de hoy', await page.waitForSelector('#geoModal', { timeout: 5000 }).then(() => true).catch(() => false));
    await esperar(nusa, 2);
    const d = nusa.find(x => x.tipo === 'dia');
    check('día MX declarado, pendiente de RH', d && d.pais === 'MX' && d.pendiente_rh === true, d);
  });
  await escenario(browser, base, 'Mateo · webhook de nómina caído: la checada NO se bloquea, el evento queda en cola', { punto: PUNTO.houston, emp: EMP.mateo, kcfg: ON, nusaCae: true }, async (page, posts) => {
    await checar(page, 'entrada'); await overlay(page);
    await page.waitForSelector('#nusaLista .nusa-so'); await page.click('#nusaLista [data-so="11842"]');
    const p = await esperar(posts, 1, 15000);
    check('se checó la entrada', !!p && p.tipo === 'entrada');
    check('el evento quedó en la cola del dispositivo', await page.evaluate(() => KioskoUSA._cola().some(e => e.tipo === 'entrada_so' && e.so.id === 11842)));
  });
  await escenario(browser, base, 'Mateo · la base dice «apagado» (segunda llave): flujo de hoy', { punto: PUNTO.houston, emp: EMP.mateo, kcfg: ON, ctx: { activo: false } }, async (page, posts) => {
    await checar(page, 'entrada'); const p = await esperar(posts, 1);
    check('sin pantalla USA y entrada normal en USA', !(await page.$('#nusaOverlay')) && p && p.geo_zona === 'usa');
  });

  // ── Ricardo ──
  const CTX_SALIDA = { sos_avance_hoy: [{ so_id: 11842, so_nombre: 'SO11842 - prensas materials', ultimo: 55 }], plan_hoy: [{ clave: '11842', so_id: 11842, so_nombre: 'SO11842', pct: 70 }, { clave: 'COMERCIAL', pct: 30 }], sugerido_comercial: 30 };
  await escenario(browser, base, 'Ricardo · entrada en USA: plan que suma 100', { punto: PUNTO.houston, emp: EMP.rich, kcfg: ON, ctx: { pendientes_avance: [{ so_id: 11791, so_nombre: 'SO11791 - Power and control panels', ultimo: 40 }] } }, async (page, posts, nusa) => {
    await checar(page, 'entrada'); await overlay(page);
    check('pide el avance pendiente de la cuadrilla (SO11791)', /SO11791/.test(await page.textContent('#nusaPend')));
    await page.selectOption('#nusaPlan select[data-clave]', '11842');
    await page.fill('#nusaPlan [data-fila]:first-child [data-pct]', '60');
    await page.fill('#nusaPlan [data-fila]:last-child [data-pct]', '30');
    await page.click('#nusaOk');
    check('suma 90: no deja checar', /sumar 100/.test(await page.textContent('.nusa-err')) && posts.length === 0);
    await page.fill('#nusaPlan [data-fila]:first-child [data-pct]', '70');
    await page.fill('#nusaPend [data-pct]', '45');
    await fotos(page, 'kiosko-ricardo-plan');
    await page.click('#nusaOk');
    const p = await esperar(posts, 1);
    const e = nusa.find(x => x.tipo === 'plan');
    check('plan enviado 70/30 con el avance pendiente', e && e.plan.length === 2 && e.plan[0].so_id === 11842 && e.plan[0].pct === 70 && e.avances[0].so_id === 11791 && e.avances[0].pct === 45, e);
    check('la entrada se checó', p && p.tipo === 'entrada');
  });
  await escenario(browser, base, 'Ricardo · salida en USA: avance no baja, día suma 100, excepción con explicación', { punto: PUNTO.houston, emp: EMP.rich, kcfg: ON, ctx: CTX_SALIDA }, async (page, posts, nusa) => {
    await checar(page, 'salida'); await overlay(page);
    check('dos secciones separadas (A avance, B tu día)', await page.$('.nusa-a') && await page.$('.nusa-b') ? true : false);
    check('avance precargado con el último (55)', await page.inputValue('#nusaAv [data-pct]') === '55');
    await page.fill('#nusaAv [data-pct]', '50'); await page.click('#nusaOk');
    check('55% no acepta 50%', /no puede bajar/.test(await page.textContent('.nusa-err')) && posts.length === 0);
    await page.fill('#nusaAv [data-pct]', '80');
    await page.fill('#nusaDia [data-fila]:first-child [data-pct]', '40');
    await page.fill('#nusaDia [data-fila]:last-child [data-pct]', '50');
    await page.click('#nusaOk');
    check('su día suma 90: no deja', /sumar 100/.test(await page.textContent('.nusa-err')));
    await page.fill('#nusaDia [data-fila]:first-child [data-pct]', '50');
    check('comercial 50 con sugerido 30: aviso de excepción', await page.isVisible('#nusaExc') && /CON EXCEPCIÓN/.test(await page.textContent('#nusaExcTxt')));
    await fotos(page, 'kiosko-ricardo-salida');
    await page.click('#nusaOk');
    check('sin explicación no deja', /Explica/.test(await page.textContent('.nusa-err')) && posts.length === 0);
    await page.fill('#nusaExplica', 'Visita a cliente nuevo en Mission para levantamiento');
    await page.click('#nusaOk');
    const p = await esperar(posts, 1);
    const e = nusa.find(x => x.tipo === 'salida');
    check('salida con excepción, declarado 50 contra sugerido 30, guarda la explicación', e && e.comercial.estado === 'excepcion' && e.comercial.declarado === 50 && e.comercial.sugerido === 30 && /Mission/.test(e.comercial.explicacion), e && e.comercial);
    check('avance 80 enviado', e && e.avances[0].pct === 80);
    check('la checada de salida va a Odoo con la SO principal', p && p.tipo === 'salida' && p.so_id === 11842 && p.so_company_id === 6, p && { so: p.so_id, c: p.so_company_id });
  });
  await escenario(browser, base, 'Ricardo · comercial 30 con sugerido 30: aprobado sin explicación', { punto: PUNTO.houston, emp: EMP.rich, kcfg: ON, ctx: CTX_SALIDA }, async (page, posts, nusa) => {
    await checar(page, 'salida'); await overlay(page);
    check('sin aviso de excepción', !(await page.isVisible('#nusaExc')));
    await page.click('#nusaOk'); await esperar(posts, 1);
    const e = nusa.find(x => x.tipo === 'salida');
    check('comercial aprobado', e && e.comercial.estado === 'aprobado' && e.comercial.explicacion === null, e && e.comercial);
  });

  await browser.close(); srv.close(); fin();
})();
