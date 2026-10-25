// e2e · Confirmar Horas con zona y tipo de día (#396 fase a).
// Página real en Chromium; n8n interceptado; datos inventados. NO toca Odoo ni n8n.
//   NODE_PATH=/opt/node22/lib/node_modules node tests/asistencia/e2e-confirmar-horas-tipo.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

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

// Filas como las devuelve planeacion/horas-dia (forma real medida en la ejecución 135232).
function fila(o) {
  return Object.assign({ department_name: 'Operaciones', es_operaciones: true, solo_bolsa: false, bolsa_default_id: null,
    check_in_cst: '2026-10-19 07:00', check_out_cst: '2026-10-19 17:30', abierta: false, worked_hours: 10.5,
    so_id: null, so_nombre: null, cuenta_id: null, cuenta_nombre: null, confirmado: false, en_disputa: false,
    out_mode: 'kiosk', budget_mo: { estado: 'exento' } }, o);
}
const FILAS = [
  fila({ attendance_id: 9101, empleado_id: 75, empleado_nombre: 'Mateo S. (demo)', check_in_cst: '2026-10-19 05:10', check_out_cst: '2026-10-19 17:40', worked_hours: 12.5, so_id: 2377, so_nombre: 'SO11854 · Chiller Irving (demo)', budget_mo: { estado: 'ok' } }),
  fila({ attendance_id: 9102, empleado_id: 75, empleado_nombre: 'Mateo S. (demo)', check_in_cst: '2026-10-22 05:00', check_out_cst: '2026-10-22 15:30', so_id: 2377, so_nombre: 'SO11854 · Chiller Irving (demo)', budget_mo: { estado: 'ok' } }),
  fila({ attendance_id: 9103, empleado_id: 8, empleado_nombre: 'Francisco M. (demo)', department_name: 'Comercial', es_operaciones: false, check_in_cst: '2026-10-12 05:40' }),
  fila({ attendance_id: 9104, empleado_id: 98, empleado_nombre: 'Ricardo H. (demo)', department_name: 'Comercial', es_operaciones: false, check_in_cst: '2026-10-19 08:30', check_out_cst: '2026-10-19 18:00', so_id: 2381, so_nombre: 'SO11877 · Assessment CA (demo)', budget_mo: { estado: 'ok' } }),
  fila({ attendance_id: 9105, empleado_id: 63, empleado_nombre: 'Persona RH (demo)', department_name: 'Recursos Humanos', es_operaciones: false, cuenta_id: 478, cuenta_nombre: 'RH' }),
  fila({ attendance_id: 9106, empleado_id: 76, empleado_nombre: 'Técnico 1 (demo)', so_id: 2382, so_nombre: 'SO11855 · Proyecto TCh (demo)', confirmado: true, budget_mo: { estado: 'ok' } })
];
const SOS = [
  { id: 2382, name: 'SO11855 · Proyecto TCh (demo)', cliente: 'Cliente MX', company_id: 1, company: 'SERVICIOS FTS' },
  { id: 2377, name: 'SO11854 · Chiller Irving (demo)', cliente: 'Cliente TX', company_id: 6, company: 'FTS FULL TECHNOLOGY SYSTEMS LLC' },
  { id: 2381, name: 'SO11877 · Assessment CA (demo)', cliente: 'Cliente CA', company_id: 6, company: 'FTS FULL TECHNOLOGY SYSTEMS LLC' }
];
// Lo que devolvería asistencia/eventos (asistencia.leer).
const EVENTOS = {
  9101: { tiene_evento: true, zona_in: 'sitio:FTS Monterrey', zona_out: 'usa', tz_in: 'America/Monterrey', tz_out: 'America/Chicago', tipo_dia_propuesto: 'viaje_usa', origen_propuesto: 'zona', tipo_dia: null },
  9102: { tiene_evento: true, zona_in: 'usa', zona_out: 'sitio:FTS Monterrey', tz_in: 'America/Chicago', tz_out: 'America/Monterrey', tipo_dia_propuesto: 'viaje_mexico', origen_propuesto: 'zona', tipo_dia: null },
  9103: { tiene_evento: true, zona_in: 'fuera', zona_out: 'fuera', geo_motivo_in: 'Aeropuerto, vuelo a Tijuana', tipo_dia_propuesto: 'mexico', origen_propuesto: 'zona', tipo_dia: null },
  9104: { tiene_evento: true, zona_in: 'usa', zona_out: 'usa', tz_in: 'America/Los_Angeles', tz_out: 'America/Los_Angeles', tipo_dia_propuesto: 'proyecto_usa', origen_propuesto: 'zona', tipo_dia: null },
  9105: { tiene_evento: false, tipo_dia_propuesto: 'mexico', origen_propuesto: 'empresa_proyecto', tipo_dia: null },
  9106: { tiene_evento: false, tipo_dia_propuesto: 'mexico', origen_propuesto: 'empresa_proyecto', tipo_dia: 'mexico' }
};

async function montar(ctx, op) {
  const log = [];
  await ctx.addInitScript(() => {
    localStorage.setItem('fts_session', JSON.stringify({ userId: 1, username: 'felipe.perez', nombre: 'Felipe (demo)', role: 'supervisor', modulos: {}, loginTime: Date.now(), lastActivity: Date.now() }));
  });
  const json = (r, o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
  const cuerpo = r => JSON.parse(r.request().postData() || '{}');
  await ctx.route('**/webhook/planeacion/horas-dia', r => json(r, { success: true, count: FILAS.length, rows: JSON.parse(JSON.stringify(FILAS)) }));
  await ctx.route('**/webhook/kiosk/sos', r => json(r, { sos: SOS, total: SOS.length }));
  await ctx.route('**/webhook/asistencia/eventos', r => {
    log.push({ url: 'eventos', body: cuerpo(r) });
    if (op.eventos === 404) return r.fulfill({ status: 404, body: 'not registered' });
    const b = cuerpo(r);
    return json(r, { success: true, filas: b.filas.map(f => Object.assign({ attendance_id: f.attendance_id }, EVENTOS[f.attendance_id] || {})), empresas: { 2377: 6, 2381: 6, 2382: 1 } });
  });
  await ctx.route('**/webhook/asistencia/tipo-dia', r => {
    const b = cuerpo(r); log.push({ url: 'tipo-dia', body: b });
    if (op.tipoDia === 500) return r.fulfill({ status: 500, body: 'x' });
    if (op.tipoDiaRegla && op.tipoDiaRegla[b.attendance_id]) return json(r, { success: false, regla: true, codigo: op.tipoDiaRegla[b.attendance_id], mensaje: 'Regla: ' + op.tipoDiaRegla[b.attendance_id] });
    return json(r, { success: true, attendance_id: b.attendance_id, tipo_dia: b.tipo_dia, cambio: true });
  });
  await ctx.route('**/webhook/planeacion/corregir-bolsa', r => { const b = cuerpo(r); log.push({ url: 'corregir-bolsa', body: b }); return json(r, { success: true, attendance_id: b.attendance_id }); });
  await ctx.route('**/webhook/planeacion/confirmar-horas', r => { const b = cuerpo(r); log.push({ url: 'confirmar-horas', body: b }); return json(r, { success: true, attendance_id: b.attendance_id, manager_approval: true }); });
  await ctx.route(/api\.github\.com|raw\.githubusercontent|fonts\.g/, r => r.abort());
  return log;
}

async function abrir(browser, base, op, ancho) {
  const ctx = await browser.newContext({ viewport: { width: ancho || 1280, height: 900 }, colorScheme: 'light' });
  const log = await montar(ctx, op);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(base + '/operaciones/confirmar-horas/index.html');
  await page.waitForSelector('table.ch-table');
  await page.waitForTimeout(400);
  return { ctx, page, log, errores };
}
async function marcarYEnviar(page, atts) {
  for (const a of atts) await page.check('input.ch-mark[data-att="' + a + '"]');
  await page.click('#btn-tanda');
  await page.waitForSelector('#pop-tanda', { state: 'visible' });
  const pop = await page.textContent('#pop-tanda-body');
  await page.click('#pop-tanda-confirm');
  await page.waitForFunction(() => document.getElementById('ch-overlay').style.display === 'none');
  await page.waitForTimeout(200);
  return pop;
}

(async () => {
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

  esc = '1 · eventos sin publicar (404): la pantalla de hoy';
  console.log('▶ ' + esc);
  { const { ctx, page, log, errores } = await abrir(browser, base, { eventos: 404 });
    const ths = await page.$$eval('table.ch-table th', t => t.map(x => x.textContent));
    check('sin columnas Zona ni Tipo de día', !ths.some(t => /Zona|Tipo de día/.test(t)), ths.join('|'));
    check('sin aviso (404 = no publicado)', !(await page.isVisible('#ch-tipo-aviso')));
    await marcarYEnviar(page, [9105]);
    check('confirma por el camino de siempre', log.some(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9105 && l.body.action === 'confirm'));
    check('no llama a tipo-dia', !log.some(l => l.url === 'tipo-dia'));
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }

  esc = '2 · columnas, propuesto y etiquetas';
  console.log('▶ ' + esc);
  { const { ctx, page, log, errores } = await abrir(browser, base, {});
    const ths = await page.$$eval('table.ch-table th', t => t.map(x => x.textContent));
    check('columnas Zona y Tipo de día', ths.some(t => /Zona/.test(t)) && ths.some(t => /Tipo de día/.test(t)));
    check('eventos pidió todas las filas con su SO', log.find(l => l.url === 'eventos').body.filas.length === FILAS.length);
    check('9101 propone Viaje a USA', await page.$eval('select.ch-tipo[data-att="9101"]', s => s.value) === 'viaje_usa');
    check('9101 zona MX→USA', /MX→USA/.test(await page.textContent('tr[data-att="9101"] .cell-zona')));
    check('9103 muestra «fuera» con el motivo', /fuera/.test(await page.textContent('tr[data-att="9103"] .cell-zona')));
    check('9105 dice «por empresa»', /por empresa/.test(await page.textContent('tr[data-att="9105"] .cell-tipo')));
    check('9102 avisa el recobro (Viaje a México con SO de USA)', /ADMIN DE OPERACIONES con recobro/.test(await page.textContent('tr[data-att="9102"] .cell-tipo')));
    check('opción propuesta marcada en el selector', /Viaje a USA \(propuesto\)/.test(await page.textContent('select.ch-tipo[data-att="9101"]')));
    // modal con empresa
    await page.click('button[data-act="editso"][data-att="9105"]');
    await page.waitForSelector('.ch-so-item[data-tipo="proyecto"]');
    const items = await page.$$eval('.ch-so-item[data-tipo="proyecto"] .n', x => x.map(e => e.innerHTML));
    check('modal: SO de USA con etiqueta USA', items.some(h => /ch-emp-usa/.test(h) && /Irving/.test(h)));
    check('modal: SO de MX con etiqueta MX', items.some(h => /ch-emp-mx/.test(h) && /TCh/.test(h)));
    for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'ch-modal-so-' + w + '.png') }); }
    await page.click('#modal-so-close');
    for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'ch-tipo-dia-' + w + '.png'), fullPage: true });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth); check('a ' + w + ' px la página no scrollea de lado (la tabla scrollea dentro)', sw <= w, 'scrollWidth ' + sw); }
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }

  esc = '3 · envío: tipo antes que aprobación, candados y D-7';
  console.log('▶ ' + esc);
  { const { ctx, page, log, errores } = await abrir(browser, base, {});
    // Felipe cambia 9103 a Viaje a México (sin cargo) → debe detenerse
    await page.selectOption('select.ch-tipo[data-att="9103"]', 'viaje_mexico');
    check('al cambiarlo dice «cambiado por ti» y avisa viaje sin cargo', /cambiado por ti/.test(await page.textContent('tr[data-att="9103"] .cell-tipo')) && /viaje sin SO/.test(await page.textContent('tr[data-att="9103"] .cell-tipo')));
    const pop = await marcarYEnviar(page, [9101, 9102, 9103, 9104]);
    check('popup: días que paga FTS USA', /2<\/b> día\(s\) que paga FTS USA|2 día\(s\) que paga FTS USA/.test(pop), pop.slice(0, 300));
    check('popup: recobro D-7', /Viaje a México con SO de USA/.test(pop));
    check('popup: viaje sin cargo no se confirmará', /SIN SO ni centro de costos/.test(pop));
    const iT = log.findIndex(l => l.url === 'tipo-dia' && l.body.attendance_id === 9101);
    const iC = log.findIndex(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9101);
    check('9101: tipo-dia (viaje_usa) ANTES de confirmar-horas', iT >= 0 && iC > iT && log[iT].body.tipo_dia === 'viaje_usa' && log[iT].body.es_viaje === true);
    const cb = log.find(l => l.url === 'corregir-bolsa' && l.body.attendance_id === 9102);
    check('9102 D-7: corrige a la cuenta 3096', !!cb && cb.body.action === 'correct_bolsa' && cb.body.cuenta_id === 3096);
    const td = log.find(l => l.url === 'tipo-dia' && l.body.attendance_id === 9102);
    check('9102 D-7: tipo viaje_mexico con recobro y SO original', !!td && td.body.tipo_dia === 'viaje_mexico' && td.body.recobro_usa === true && td.body.so_original_id === 2377);
    check('9102 D-7: NO pasa por confirmar-horas (la corrección ya confirma)', !log.some(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9102));
    check('9103 detenido: ni tipo ni aprobación', !log.some(l => (l.url === 'confirmar-horas' || l.url === 'tipo-dia') && l.body.attendance_id === 9103));
    check('9104 Proyecto USA guardado y confirmado', log.some(l => l.url === 'tipo-dia' && l.body.attendance_id === 9104 && l.body.tipo_dia === 'proyecto_usa') && log.some(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9104));
    const msg = await page.textContent('#ch-msg');
    check('mensaje: 3 confirmados, 1 detenido con su motivo', /3 registro\(s\) confirmados/.test(msg) && /viaje sin SO ni centro de costos/.test(msg), msg);
    check('9102 ahora muestra la cuenta 3096', /ADMIN DE OPERACIONES/.test(await page.textContent('tr[data-att="9102"] .cell-so')));
    for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'ch-tras-envio-' + w + '.png'), fullPage: true }); }
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }

  esc = '4 · regla del servidor y red caída';
  console.log('▶ ' + esc);
  { const { ctx, page, log, errores } = await abrir(browser, base, { tipoDiaRegla: { 9104: 'EMPRESA_INCOHERENTE' } });
    await marcarYEnviar(page, [9104]);
    check('regla del servidor detiene la aprobación', !log.some(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9104));
    check('y lo dice', /EMPRESA_INCOHERENTE/.test(await page.textContent('#ch-msg')));
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }
  { const { ctx, page, log, errores } = await abrir(browser, base, { tipoDia: 500 });
    await marcarYEnviar(page, [9101]);
    check('red caída: SÍ confirma (mitad tolerante)', log.some(l => l.url === 'confirmar-horas' && l.body.attendance_id === 9101));
    check('y avisa que el tipo quedó pendiente', /Tipo de día NO guardado/.test(await page.textContent('#ch-msg')));
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }

  esc = '5 · renglón ya confirmado: el cambio de tipo se guarda al momento';
  console.log('▶ ' + esc);
  { const { ctx, page, log, errores } = await abrir(browser, base, {});
    check('9106 confirmado muestra «guardado»', /guardado/.test(await page.textContent('tr[data-att="9106"] .cell-tipo')));
    await page.selectOption('select.ch-tipo[data-att="9106"]', 'viaje_usa');
    await page.waitForTimeout(300);
    check('llama a tipo-dia sin pasar por confirmar-horas', log.some(l => l.url === 'tipo-dia' && l.body.attendance_id === 9106 && l.body.tipo_dia === 'viaje_usa') && !log.some(l => l.url === 'confirmar-horas'));
    check('sin errores de JS', !errores.length, errores.join(' | '));
    await ctx.close(); }

  await browser.close(); srv.close();
  console.log('\n' + pass + ' ✓   ' + fails.length + ' ✗' + (fails.length ? '\n' + fails.join('\n') : ''));
  console.log('Capturas: ' + OUT);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
