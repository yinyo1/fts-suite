// e2e · Reporte RH «Días México / USA» + propuesta trabajo_usa en Nómina · Incidencias (#396 fase a).
// Páginas reales en Chromium; n8n interceptado; datos inventados. NO toca Odoo ni n8n.
//   NODE_PATH=/opt/node-tools/node_modules node tests/asistencia/e2e-dias-mx-usa.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const L = require('../../asistencia/lib/dias-mx-usa.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || path.join(RAIZ, 'docs/kiosko/viajes/capturas-fase-a');
fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

let pass = 0; const fails = []; let esc = '';
function check(n, c, d) { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push('[' + esc + '] ' + n + (d ? ' → ' + d : '')); console.log('  ✗ ' + n + (d ? ' → ' + d : '')); } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// La semana que la página propone por defecto: la cerrada (la anterior a la que contiene hoy, CST).
const HOY = new Date(Date.now() - 6 * 36e5).toISOString().slice(0, 10);
const SEM = L.semanaDe(new Date(Date.parse(L.semanaDe(HOY).desde + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10));
const d = SEM.dias;
function att(id, emp, nom, i, tipo, conf, so, cia, extra) {
  return Object.assign({ attendance_id: id, employee_id: emp, empleado_nombre: nom, check_in: d[i] + ' 13:00:00', check_out: d[i] + ' 23:06:00', worked_hours: 10.1,
    confirmado: conf, so_id: so ? so[0] : null, so_nombre: so ? so[1] : null, so_company_id: so ? cia : null, cuenta_id: null, evento: tipo ? { tipo_dia: tipo } : null }, extra || {});
}
// El nombre más largo que hay en producción entra a propósito: es el que rompe anchos (§20 #20).
const LARGO = 'Gilberto Gibran Solís Carrillo de la Garza Montemayor';
const MF = [7001, 'SO11842 Mission Foods - Dallas'], VT = [7002, 'SO9428 Vertiv 2da Fase'];
const ASIS = [
  att(1, 11, 'Laura (demo)', 1, 'mexico', true, VT, 1), att(2, 11, 'Laura (demo)', 2, 'mexico', true, VT, 1),
  att(3, 12, LARGO, 1, 'viaje_usa', true, MF, 6), att(4, 12, LARGO, 2, 'proyecto_usa', true, MF, 6),
  att(5, 12, LARGO, 3, 'proyecto_usa', false, MF, 6), att(6, 12, LARGO, 4, 'viaje_mexico', true, null, null, { cuenta_id: 3096, cuenta_nombre: 'ADMIN DE OPERACIONES', evento: { tipo_dia: 'viaje_mexico', recobro_usa: true } }),
  att(7, 13, 'Tomás (demo)', 1, null, true, VT, 1)
];
const REP = L.armarReporte({ semana: SEM.id, asistencias: ASIS });
const CUADRE = { at: new Date().toISOString(), ok: true, desde: d[0], hasta: d[6], n_sin_evento: 1, sin_evento: [7], n_sin_odoo: 0, sin_odoo: [] };

function sesion(scopes) {
  return { token: 'x.y.z', actor: 'magaly', nombre: 'Magaly (demo)', scopes: scopes, exp: Math.floor(Date.now() / 1000) + 3600,
           expires_at: new Date(Date.now() + 3600e3).toISOString(), user: 'magaly' };
}
async function contexto(browser, w, scopes, extra) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  await ctx.addInitScript(([s, x]) => {
    try { localStorage.setItem('fts_suite_session', JSON.stringify(s)); if (x) Object.keys(x).forEach(k => localStorage.setItem(k, x[k])); } catch (e) {}
  }, [sesion(scopes), extra || null]);
  return ctx;
}
async function sinScrollH(page) { return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); }

(async () => {
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });

  // ── 1. Reporte con datos «del servidor», a los cuatro anchos ──
  for (const w of [380, 760, 900, 1280]) {
    esc = 'reporte-' + w;
    const ctx = await contexto(browser, w, ['rh:dias-mx-usa']);
    let cuerpo = null;
    await ctx.route('**/webhook/rh/dias-mx-usa', r => { cuerpo = JSON.parse(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, reporte: REP, cuadre: CUADRE, leido_por: 'Magaly', generado_at: new Date().toISOString() }) }); });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    await page.goto(base + '/modulos/rh/dias-mx-usa/index.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('.per', { timeout: 8000 });
    check('pide la semana cerrada con el token en el cuerpo', cuerpo && cuerpo.semana === SEM.id && cuerpo.token === 'x.y.z', JSON.stringify(cuerpo));
    const t = await page.evaluate(() => ({
      cubetas: Array.from(document.querySelectorAll('.cubeta .n')).map(x => x.textContent),
      personas: document.querySelectorAll('.per').length,
      pendRojo: document.querySelectorAll('.dia.pendiente').length,
      pendCard: document.querySelectorAll('.per.con-pend').length,
      como: document.querySelector('.per[data-emp="12"] .como').textContent,
      prop: Array.from(document.querySelectorAll('.per[data-emp="12"] .prop')).map(x => x.textContent),
      cuadre: document.querySelector('#cuadre').textContent,
      rango: document.querySelector('#rango').textContent,
      chips: document.querySelector('.per[data-emp="12"] .tot').textContent
    }));
    check('totales: 3 personas · 3 MX · 2 USA · 2 pendientes', JSON.stringify(t.cubetas) === JSON.stringify(['3', '3', '2', '2']), JSON.stringify(t.cubetas));
    check('pendientes en rojo (2 días, 2 personas)', t.pendRojo === 2 && t.pendCard === 2, t.pendRojo + '/' + t.pendCard);
    check('chips de la persona: México 1 · FTS USA 2 · Pendientes 1', /México 1/.test(t.chips) && /FTS USA 2/.test(t.chips) && /Pendientes 1/.test(t.chips), t.chips);
    check('cómo salió: USA = viaje + proyecto con sus att', /FTS USA 2 = .*Viaje a USA, att 3.*Proyecto USA, att 4/.test(t.como), t.como);
    check('cómo salió: el pendiente dice el motivo', /sin confirmar \(att 5\)/.test(t.como));
    check('recobro D-7 marcado', /recobro a FTS USA/.test(t.como));
    check('propuesta trabajo_usa por SO', t.prop.length === 1 && /Trabajó en USA · 2 días · SO11842 Mission Foods - Dallas/.test(t.prop[0]), JSON.stringify(t.prop));
    check('aviso de cuadre con la asistencia sin evento', /no cuadran/.test(t.cuadre) && /att 7/.test(t.cuadre), t.cuadre);
    check('rango viernes a jueves', t.rango.indexOf(SEM.desde) >= 0 && t.rango.indexOf(SEM.hasta) >= 0, t.rango);
    check('sin scroll horizontal de página', await sinScrollH(page));
    check('el nombre largo no desborda su tarjeta', await page.evaluate(() => { const c = document.querySelector('.per[data-emp="12"]'); return c.scrollWidth <= c.clientWidth + 1; }));
    await page.screenshot({ path: path.join(OUT, 'rh-dias-mx-usa-' + w + '.png'), fullPage: true });
    if (w === 1280) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#excel')]);
      const f = await dl.path(); const b = fs.readFileSync(f);
      check('Excel: nombre con la semana', dl.suggestedFilename() === 'dias-mx-usa-' + SEM.id.replace('/', '-') + '.xlsx', dl.suggestedFilename());
      check('Excel: es un ZIP (PK) con Resumen y Detalle', b[0] === 0x50 && b[1] === 0x4b && b.includes(Buffer.from('Resumen')) && b.includes(Buffer.from('Detalle')));
      await page.selectOption('#filtro', 'usa');
      check('filtro con FTS USA deja 1 persona', await page.evaluate(() => document.querySelectorAll('.per').length) === 1);
    }
    check('cero errores de JavaScript', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }

  // ── 2. Respuestas que no son el reporte ──
  for (const [nombre, resp, esperado] of [
    ['firma-invalida', { status: 401, body: { success: false, error: 'FIRMA_INVALIDA' } }, 'puerta'],
    ['sin-permiso', { status: 401, body: { success: false, error: 'SCOPE_INSUFICIENTE' } }, 'mensaje'],
    ['postgres-caido', { status: 200, body: { success: false, codigo: 'POSTGRES_NO_RESPONDE', mensaje: 'x' } }, 'mensaje'],
    ['sin-red', null, 'mensaje']
  ]) {
    esc = nombre;
    const ctx = await contexto(browser, 900, ['rh:dias-mx-usa']);
    await ctx.route('**/webhook/rh/dias-mx-usa', r => resp ? r.fulfill({ status: resp.status, contentType: 'application/json', body: JSON.stringify(resp.body) }) : r.abort());
    const page = await ctx.newPage();
    await page.goto(base + '/modulos/rh/dias-mx-usa/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ puerta: !document.querySelector('#puerta').classList.contains('hid'), lista: document.querySelector('#lista').textContent,
      err: document.querySelector('#login-err').textContent, ses: localStorage.getItem('fts_suite_session') }));
    if (esperado === 'puerta') {
      check('sesión muerta: vuelve a la puerta y borra la llave', s.puerta && !s.ses && /no es válida/.test(s.err), JSON.stringify(s));
    } else {
      check('se queda en la página, dice el error y NO borra la sesión', !s.puerta && !!s.ses && s.lista.length > 10, JSON.stringify(s));
    }
    if (nombre === 'sin-permiso') check('dice qué permiso falta', /rh:dias-mx-usa/.test(s.lista));
    if (nombre === 'sin-red') check('dice que no hubo respuesta', /Sin respuesta/.test(s.lista));
    await ctx.close();
  }

  // ── 3. Puerta: sin el permiso no entra; el ejemplo funciona sin servidor ──
  {
    esc = 'puerta';
    const ctx = await contexto(browser, 380, ['nomina:write']);
    let pegó = false;
    await ctx.route('**/webhook/rh/dias-mx-usa', r => { pegó = true; r.abort(); });
    const page = await ctx.newPage();
    await page.goto(base + '/modulos/rh/dias-mx-usa/index.html', { waitUntil: 'networkidle' });
    check('sesión sin rh:dias-mx-usa: se queda en la puerta', await page.evaluate(() => !document.querySelector('#puerta').classList.contains('hid')));
    await page.click('#demo');
    await page.waitForSelector('.per', { timeout: 8000 });
    const s = await page.evaluate(() => ({ n: document.querySelectorAll('.per').length, modo: !document.querySelector('#modo').classList.contains('hid'), pend: document.querySelectorAll('.dia.pendiente').length }));
    check('ejemplo: 4 personas, insignia EJEMPLO, con pendientes', s.n === 4 && s.modo && s.pend >= 2, JSON.stringify(s));
    check('el ejemplo no llamó al servidor', !pegó);
    await page.screenshot({ path: path.join(OUT, 'rh-dias-mx-usa-ejemplo-380.png'), fullPage: true });
    await ctx.close();
  }

  // ── 4. Nómina · Incidencias: la propuesta se acepta una vez ──
  for (const w of [380, 1280]) {
    esc = 'nomina-demo-' + w;
    const ctx = await contexto(browser, w, ['nomina:write'], { fts_nomina_modo: 'demo' });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    await page.goto(base + '/modulos/rh/nomina-incidencias/index.html', { waitUntil: 'networkidle' });
    await page.click('#indice-lista [data-sem="S36/2026"]');
    await page.waitForSelector('#tb tr[data-id]', { timeout: 8000 });
    const id = await page.evaluate(() => { const p = window.__nomS ? null : null; const tr = document.querySelector('#tb tr[data-id]'); return tr.getAttribute('data-id'); });
    await page.click('#tb tr[data-id="' + id + '"]');
    await page.waitForSelector('#propMxUsa [data-prop-mu]', { timeout: 8000 }).catch(() => {});
    const antes = await page.evaluate(() => ({ caja: document.querySelector('#propMxUsa').textContent, n: document.querySelectorAll('#dbody .item:not(.prop-mu)').length }));
    check('la caja de propuesta aparece con días y botón aceptar', /Propuesta del reporte Días México \/ USA/.test(antes.caja) && /aceptar/.test(antes.caja), antes.caja);
    if (w === 380) await page.screenshot({ path: path.join(OUT, 'nomina-propuesta-antes-380.png'), fullPage: false });
    await page.click('#propMxUsa [data-prop-mu="0"]');
    await page.waitForTimeout(200);
    const despues = await page.evaluate(() => ({ caja: document.querySelector('#propMxUsa').textContent,
      decl: Array.from(document.querySelectorAll('#dbody .item:not(.prop-mu) .tit')).map(x => x.textContent),
      det: Array.from(document.querySelectorAll('#dbody .item:not(.prop-mu) .det')).map(x => x.textContent) }));
    check('aceptar agrega UNA declaración Trabajó en USA con la SO de la lista', despues.decl.filter(x => x === 'Trabajó en USA').length === 1 && despues.det.some(x => /Días: 2/.test(x) && /Mission Foods/.test(x)), JSON.stringify(despues));
    check('y la propuesta queda como aceptada (no se puede capturar dos veces)', /aceptada/.test(despues.caja) && !/>aceptar</.test(await page.innerHTML('#propMxUsa')));
    check('sin scroll horizontal de página', await sinScrollH(page));
    await page.screenshot({ path: path.join(OUT, 'nomina-propuesta-aceptada-' + w + '.png'), fullPage: false });
    check('cero errores de JavaScript', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }

  // ── 5. Nómina en real: si el reporte falla, NO se cierra la sesión de Nómina ──
  {
    esc = 'nomina-real-401';
    const ctxD = await contexto(browser, 1280, ['nomina:write'], { fts_nomina_modo: 'demo' });
    const pD = await ctxD.newPage();
    await pD.goto(base + '/modulos/rh/nomina-incidencias/index.html', { waitUntil: 'networkidle' });
    const FIX = await pD.evaluate(() => ({ semana: window.NomClient.semanaDemo(), semanas: window.NomClient.semanasDemo() }));
    await ctxD.close();
    const ctx = await contexto(browser, 1280, ['nomina:write'], { fts_nomina_modo: 'real' });
    let pedido = null;
    await ctx.route('**/webhook/nom/semanas', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX.semanas) }));
    await ctx.route('**/webhook/nom/semana', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX.semana) }));
    await ctx.route('**/webhook/rh/dias-mx-usa', r => { pedido = JSON.parse(r.request().postData()); r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'SCOPE_INSUFICIENTE' }) }); });
    const page = await ctx.newPage();
    await page.goto(base + '/modulos/rh/nomina-incidencias/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#indice-lista [data-sem]', { timeout: 15000 });
    await page.click('#indice-lista [data-sem="S36/2026"]');
    await page.waitForSelector('#tb tr[data-id]', { timeout: 15000 });
    await page.click('#tb tr[data-id]');
    await page.waitForFunction(() => /Sin propuesta/.test((document.querySelector('#propMxUsa') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const s = await page.evaluate(() => ({ caja: document.querySelector('#propMxUsa').textContent, ses: localStorage.getItem('fts_suite_session') }));
    check('pidió el reporte de la MISMA semana con el token', pedido && pedido.semana === 'S36/2026' && pedido.token === 'x.y.z', JSON.stringify(pedido));
    check('sin permiso: dice por qué y deja capturar como siempre', /Sin propuesta: tu usuario no tiene el permiso rh:dias-mx-usa/.test(s.caja), s.caja);
    check('la sesión de Nómina sigue viva', !!s.ses);
    await ctx.close();
  }

  await browser.close(); srv.close();
  console.log('\n' + (fails.length ? 'ROJO' : 'VERDE') + ' — ' + pass + '/' + (pass + fails.length) + ' checks');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
