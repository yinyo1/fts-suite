#!/usr/bin/env node
// Prueba de punta a punta del kiosko con la zona región USA.
//
// LO QUE ES: la página real del kiosko (operaciones/kiosk/index.html, servida desde el
// disco), en Chromium, con la ubicación del navegador fijada a puntos reales y el
// cuerpo del POST a /kiosk/checkin capturado. Corre los escenarios del requerimiento:
// sitio, USA, mixto en los dos sentidos, Nuevo Laredo, interruptor apagado, catálogo
// USA caído o ignorado, y contorno que no carga.
//
// LO QUE NO ES: no toca Odoo ni n8n. Todos los webhooks y GitHub están interceptados.
// Los empleados y las SO son inventados (ids 9xxx) — cero datos personales.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`):
//   node tests/kiosko-usa/e2e-kiosko-usa.js
//   SHOTS_DIR=docs/kiosko/usa/capturas node tests/kiosko-usa/e2e-kiosko-usa.js   (guarda capturas)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const EXE = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium']
  .filter(Boolean).find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const OUT = process.env.SHOTS_DIR || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

let pass = 0; const fails = []; let esc = '';
function check(n, c, d) {
  if (c) { pass++; console.log('  ✓ ' + n); return true; }
  fails.push('[' + esc + '] ' + n + (d ? ' → ' + d : '')); console.log('  ✗ ' + n + (d ? ' → ' + d : '')); return false;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// ── Puntos (centros de ciudad / sitio de oficina ya público en public-config) ──
const PUNTO = {
  oficinaMty:  { latitude: 25.6889759, longitude: -100.2916779 },   // sitio "FTS Monterrey"
  houston:     { latitude: 29.7604,    longitude: -95.3698 },
  paloAlto:    { latitude: 37.4419,    longitude: -122.1430 },
  nuevoLaredo: { latitude: 27.4763,    longitude: -99.5164 },
  laredoTx:    { latitude: 27.5306,    longitude: -99.4803 },
};

// ── Datos inventados ──
const EMPLEADO = { id: 9101, name: 'Prueba Uno', cargo: 'Técnico', pin: '1234', department_id: 6,
  department_name: 'Comercial', manager_id: 9100, manager_name: 'Prueba Supervisor',
  x_studio_cuenta_indirecta_default: [9513, 'Bolsa de prueba'] };
const SOS_MX = [ { id: 9201, name: 'SO9201 - Proyecto MX de prueba', cliente: 'Cliente MX' },
                 { id: 9202, name: 'SO9202 - Otro proyecto MX', cliente: 'Cliente MX 2' } ];
const SOS_US = [ { id: 9301, name: 'SO9301 - Proyecto USA de prueba', cliente: 'Client US' } ];

async function escenario(browser, base, nombre, opts, fn) {
  esc = nombre; console.log('\n▶ ' + nombre);
  const ctx = await browser.newContext({ viewport: { width: opts.ancho || 380, height: 820 }, geolocation: opts.punto, permissions: ['geolocation'] });
  const posts = [];
  const errores = [];
  const pub = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/public-config.json'), 'utf8'));
  if (opts.zonaUsa === false) pub.zonas_region = { usa: { activo: false } };
  if (opts.zonaUsa === 'ausente') delete pub.zonas_region;
  pub.n8n_url = 'https://n8n.prueba.local';

  await ctx.addInitScript(() => {
    localStorage.setItem('ops_demo_mode', '0');
    localStorage.setItem('ops_n8n_url', 'https://n8n.prueba.local');
  });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pub) }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  if (opts.contornoFalla) await ctx.route('**/shared/geo/usa-continental.json', r => r.fulfill({ status: 404, body: 'no' }));
  await ctx.route('https://n8n.prueba.local/**', async r => {
    const url = r.request().url(); const body = JSON.parse(r.request().postData() || '{}');
    const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/webhook/kiosk/empleados')) return ok({ empleados: [EMPLEADO], total: 1 });
    if (url.endsWith('/webhook/kiosk/sos')) {
      if (body.company_id === 6) {
        if (opts.sosUsa === 'error') return r.fulfill({ status: 500, body: 'error' });
        if (opts.sosUsa === 'ignora') return ok({ sos: SOS_MX });
        return ok({ sos: SOS_US });
      }
      return ok({ sos: SOS_MX });
    }
    if (url.endsWith('/webhook/planeacion/dia')) return ok({ plan: false });
    if (url.endsWith('/webhook/kiosk/checkin')) { posts.push(body); return ok({ success: true, accion_valida: true, attendance_id: 99999 }); }
    return ok({});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(base + '/operaciones/kiosk/index.html');
  await page.waitForFunction(() => typeof K !== 'undefined' && K.empleadosState === 'ok' && K.sosState === 'ok', null, { timeout: 15000 });
  try { await fn(page, posts); }
  catch (e) { check('el escenario terminó sin excepción', false, e.message.split('\n')[0]); }
  check('cero errores de JavaScript en la página', errores.length === 0, errores.join(' | '));
  await ctx.close();
}

// Simula: empleado elegido, PIN correcto, tipo elegido → captura de ubicación.
async function checar(page, tipo) {
  await page.evaluate(async (t) => {
    K.seleccionado = K.empleados[0]; K.tipo = t;
    await afterVerifyContinue();
  }, tipo);
}
const pantalla = page => page.evaluate(() => (document.querySelector('.kiosk-screen.active') || {}).id || null);
const modalGeo = page => page.evaluate(() => !!document.getElementById('geoModal'));
async function esperarPost(posts, n) { for (let i = 0; i < 60 && posts.length < n; i++) await new Promise(r => setTimeout(r, 100)); return posts[n - 1]; }

(async () => {
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });

  await escenario(browser, base, '1 · Entrada en sitio de oficina (comportamiento de hoy)', { punto: PUNTO.oficinaMty }, async (page, posts) => {
    await checar(page, 'entrada');
    const p = await esperarPost(posts, 1);
    check('se envió la entrada', !!p);
    check('geo_zona = sitio', p && p.geo_zona === 'sitio', p && p.geo_zona);
    check('geo_sitio = FTS Monterrey', p && p.geo_sitio === 'FTS Monterrey', p && p.geo_sitio);
    check('geo_status = autorizado', p && p.geo_status === 'autorizado');
    check('trae zona horaria del evento', p && typeof p.tz_evento === 'string' && typeof p.utc_offset_min === 'number', JSON.stringify({ tz: p && p.tz_evento, off: p && p.utc_offset_min }));
  });

  await escenario(browser, base, '2 · Salida en Houston: SO MX+USA obligatoria', { punto: PUNTO.houston, ancho: 380 }, async (page, posts) => {
    await checar(page, 'salida');
    await page.waitForFunction(() => document.querySelectorAll('#ksSOsList .kiosk-so-card').length > 0, null, { timeout: 15000 });
    check('no pidió aprobación (sin modal de fuera de zona)', !(await modalGeo(page)));
    check('está en la pantalla de proyecto', (await pantalla(page)) === 'ks-project');
    const info = await page.evaluate(() => ({
      zona: K.geoZona, pais: K.geoPais, obligatoria: K.soObligatoria,
      tarjetas: [...document.querySelectorAll('#ksSOsList .kiosk-so-card')].map(c => c.textContent),
      bolsaVisible: getComputedStyle(document.getElementById('ksProjectPlan')).display !== 'none',
      sinSO: !!document.querySelector('#ksProjectNoSO .ksp-sinso-btn'),
      aviso: (document.querySelector('#ksProjectNoSO .ksp-usa-aviso') || {}).textContent || ''
    }));
    check('zona usa / país US', info.zona === 'usa' && info.pais === 'US', JSON.stringify(info));
    check('SO obligatoria', info.obligatoria === true);
    check('lista con 3 SO (2 MX + 1 USA)', info.tarjetas.length === 3, info.tarjetas.join(' | '));
    check('cada renglón muestra su empresa', info.tarjetas.filter(t => /^MX/.test(t)).length === 2 && info.tarjetas.filter(t => /^USA/.test(t)).length === 1, info.tarjetas.join(' | '));
    check('la bolsa default NO se ofrece', !info.bolsaVisible);
    check('no hay botón "sin proyecto" ni "mi bolsa"', !info.sinSO);
    check('aviso de obligatoriedad visible', /elige la SO/.test(info.aviso), info.aviso);
    // registrarSinSO / confirmarBolsa no pasan en zona USA
    await page.evaluate(() => { registrarSinSO(); confirmarBolsa(); });
    await new Promise(r => setTimeout(r, 300));
    check('registrarSinSO/confirmarBolsa bloqueados', posts.length === 0);
    if (OUT) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 820 }); await page.screenshot({ path: path.join(OUT, 'so-usa-' + w + '.png'), fullPage: true }); }
    await page.setViewportSize({ width: 380, height: 820 });
    await page.evaluate(() => { _lastTap = 0; selectSO(9301); });
    const p = await esperarPost(posts, 1);
    check('salida enviada con SO USA', p && p.so_id === 9301 && p.so_company_id === 6 && p.so_empresa === 'USA', JSON.stringify(p && { so: p.so_id, c: p.so_company_id, e: p.so_empresa }));
    check('geo_sitio = USA (región), autorizado', p && p.geo_sitio === 'USA (región)' && p.geo_status === 'autorizado' && p.geo_autorizada === true);
    check('sin cuenta/bolsa', p && p.cuenta_id === null);
    const confirm = await page.evaluate(() => document.getElementById('confirm-so').textContent);
    check('confirmación muestra empresa', /^USA · SO9301/.test(confirm), confirm);
    if (OUT) await page.screenshot({ path: path.join(OUT, 'confirmacion-usa-380.png') });
  });

  await escenario(browser, base, '3 · Mixto: entrada en Monterrey (sitio) → salida en Laredo TX', { punto: PUNTO.oficinaMty }, async (page, posts) => {
    await checar(page, 'entrada');
    const e = await esperarPost(posts, 1);
    check('entrada validada como sitio', e && e.geo_zona === 'sitio');
    await page.context().setGeolocation(PUNTO.laredoTx);
    await checar(page, 'salida');
    await page.waitForFunction(() => document.querySelectorAll('#ksSOsList .kiosk-so-card').length > 0, null, { timeout: 15000 });
    await page.evaluate(() => { _lastTap = 0; selectSO(9201); });
    const s = await esperarPost(posts, 2);
    check('salida validada como usa', s && s.geo_zona === 'usa' && s.geo_pais === 'US', s && s.geo_zona);
    check('salida con SO MX elegida en USA', s && s.so_id === 9201 && s.so_company_id === 1 && s.so_empresa === 'MX');
    check('cada evento guarda su propia zona', e && s && e.geo_zona !== s.geo_zona);
  });

  await escenario(browser, base, '4 · Mixto inverso: entrada en Palo Alto → salida en oficina Monterrey', { punto: PUNTO.paloAlto }, async (page, posts) => {
    await checar(page, 'entrada');
    const e = await esperarPost(posts, 1);
    check('entrada validada como usa sin aprobación', e && e.geo_zona === 'usa' && e.geo_status === 'autorizado', e && JSON.stringify({ z: e.geo_zona, s: e.geo_status }));
    await page.context().setGeolocation(PUNTO.oficinaMty);
    await checar(page, 'salida');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('ksProjectPlan')).display !== 'none' || document.querySelectorAll('#ksSOsList .kiosk-so-card').length > 0, null, { timeout: 15000 });
    const st = await page.evaluate(() => ({ usa: K.usaSalida, plan: document.getElementById('ksProjectPlan').textContent }));
    check('fuera de USA: flujo de hoy (banner de bolsa)', st.usa === false && /Tu bolsa/.test(st.plan), JSON.stringify(st));
    await page.evaluate(() => confirmarBolsa());
    const s = await esperarPost(posts, 2);
    check('salida en sitio con bolsa, sin SO', s && s.geo_zona === 'sitio' && s.cuenta_id === 9513 && s.so_id === null);
  });

  await escenario(browser, base, '5 · Nuevo Laredo (Laredo NL) → fuera de zona, a aprobación', { punto: PUNTO.nuevoLaredo }, async (page, posts) => {
    await checar(page, 'entrada');
    check('abre el modal de fuera de zona', await modalGeo(page));
    const st = await page.evaluate(() => ({ z: K.geoZona, p: K.geoPais }));
    check('zona fuera / país NO_US', st.z === 'fuera' && st.p === 'NO_US', JSON.stringify(st));
    check('no se envió nada sin motivo', posts.length === 0);
  });

  await escenario(browser, base, '6 · Interruptor APAGADO: Houston va a aprobación', { punto: PUNTO.houston, zonaUsa: false }, async (page, posts) => {
    check('kiosko leyó el interruptor apagado', await page.evaluate(() => K.config.zonaUsa === false));
    await checar(page, 'entrada');
    check('abre el modal de fuera de zona', await modalGeo(page));
    await page.evaluate(() => { document.getElementById('geoMotivo').value = 'Prueba con zona USA apagada'; confirmarGeo(); });
    const p = await esperarPost(posts, 1);
    check('entrada pendiente de aprobación con motivo', p && p.geo_status === 'pendiente_aprobacion' && p.geo_motivo === 'Prueba con zona USA apagada' && p.geo_zona === 'fuera');
  });

  await escenario(browser, base, '7 · Config sin la llave zonas_region: default ENCENDIDO', { punto: PUNTO.houston, zonaUsa: 'ausente' }, async (page, posts) => {
    check('kiosko asume encendido', await page.evaluate(() => K.config.zonaUsa === true));
    await checar(page, 'entrada');
    const p = await esperarPost(posts, 1);
    check('Houston autorizado como usa', p && p.geo_zona === 'usa');
  });

  await escenario(browser, base, '8 · Servidor ignora company_id: no se etiqueta como USA ni se obliga', { punto: PUNTO.houston, sosUsa: 'ignora' }, async (page, posts) => {
    await checar(page, 'salida');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('ksProjectPlan')).display !== 'none' || document.querySelectorAll('#ksSOsList .kiosk-so-card').length > 0, null, { timeout: 15000 });
    const st = await page.evaluate(() => ({ ob: K.soObligatoria, mot: K.sosUsaMotivo, lista: (K.sosUsa || []).map(s => s._empresa) }));
    check('SO no obligatoria, motivo SERVIDOR_IGNORA_COMPANY_ID', st.ob === false && st.mot === 'SERVIDOR_IGNORA_COMPANY_ID', JSON.stringify(st));
    check('ningún renglón etiquetado USA', st.lista.every(e => e === 'MX'), st.lista.join(','));
    await page.evaluate(() => expandirListaBolsa());
    const aviso = await page.evaluate(() => (document.querySelector('#ksProjectNoSO .ksp-usa-aviso') || {}).textContent || '');
    check('aviso de lista USA no cargada', /no cargó/.test(aviso), aviso);
    if (OUT) await page.screenshot({ path: path.join(OUT, 'so-usa-degradado-380.png'), fullPage: true });
  });

  await escenario(browser, base, '9 · Catálogo USA con error 500: salida no se bloquea', { punto: PUNTO.houston, sosUsa: 'error' }, async (page, posts) => {
    await checar(page, 'salida');
    await page.waitForFunction(() => K.planLoading === false && (getComputedStyle(document.getElementById('ksProjectPlan')).display !== 'none' || document.querySelectorAll('#ksSOsList .kiosk-so-card').length > 0), null, { timeout: 40000 });
    const st = await page.evaluate(() => ({ ob: K.soObligatoria, mot: K.sosUsaMotivo }));
    check('SO no obligatoria con motivo de error', st.ob === false && /CATALOGO_USA_ERROR/.test(st.mot || ''), JSON.stringify(st));
    await page.evaluate(() => confirmarBolsa());
    const p = await esperarPost(posts, 1);
    check('la salida sí se pudo registrar', !!p && p.geo_zona === 'usa');
  });

  await escenario(browser, base, '10 · Contorno no carga: NO se autoriza a ciegas', { punto: PUNTO.houston, contornoFalla: true }, async (page, posts) => {
    await checar(page, 'entrada');
    check('va al modal de fuera de zona', await modalGeo(page));
    const st = await page.evaluate(() => ({ z: K.geoZona, e: K.geoRegionError }));
    check('zona fuera con region_error', st.z === 'fuera' && /CONTORNO_USA_HTTP_404/.test(st.e || ''), JSON.stringify(st));
  });

  await browser.close(); srv.close();
  console.log('\n' + pass + ' ✓   ' + fails.length + ' ✗');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})();
