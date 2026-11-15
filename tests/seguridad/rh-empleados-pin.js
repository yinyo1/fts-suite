#!/usr/bin/env node
// #507 Etapa 2 · RH Alta/Baja: el PIN del kiosko ya NO se muestra ni viaja de vuelta.
//   - rh/empleado/detalle ahora devuelve pin_registrado (true/false), no el PIN.
//   - En edición el campo PIN nace vacío; vacío = rh/empleado/editar no toca el PIN de Odoo.
//   - Si llega una respuesta VIEJA con `pin`, la pantalla tampoco lo pinta.
// Todo interceptado: no toca Odoo ni n8n. Empleado y PIN inventados.
//   node tests/seguridad/rh-empleados-pin.js        (SHOTS_DIR=<dir> guarda capturas a 380 y 1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
let pasan = 0, fallan = 0;
const PIN_NUEVO = process.env.PIN_NUEVO || '7314'; // inventado; la Ronda 2 usa otro
const check = (n, c, info) => { if (c) { pasan++; console.log('  ✓', n); } else { fallan++; console.log('  ✗', n, info || ''); } };

const LOOKUPS = {
  companies: [{ id: 1, name: 'SERVICIOS FTS' }], departments: [{ id: 3, name: 'Operaciones' }],
  managers: [{ id: 112, name: 'Jefe Prueba' }, { id: 9127, name: 'ZZ Prueba PIN' }], jobs: [{ id: 40, name: 'Soldador' }],
  calendars: [{ id: 2, name: 'Campo', hours_per_week: 48 }], reasons: [{ id: 1, name: 'Fired' }]
};
const base = { id: 9127, name: 'ZZ Prueba PIN', work_email: 'zz@example.invalid', private_email: '', mobile_phone: '', work_phone: '',
  department_id: 3, parent_id: 112, job_id: 40, resource_calendar_id: 2, company_id: 1, x_studio_hora_entrada: 7,
  x_categoria_nomina: '', x_aplica_ppa: true, employee_type: 'employee', x_studio_codigo_contpaqi: '058', image_128: null,
  cuenta_tiene: false, cuentas_registradas: 0 };

function servir() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

async function escenario(browser, url, nombre, ficha, w, fn) {
  console.log('\n▶ ' + nombre + ' (' + w + ' px)');
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('fts_session', JSON.stringify({ userId: 1, username: 'zz.rh', nombre: 'ZZ RH', role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now() })));
  const enviados = [];
  const json = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  await ctx.route('**/webhook/rh/empleado/lookups', r => json(r, LOOKUPS));
  await ctx.route('**/webhook/rh/empleados/archivados', r => json(r, { empleados: [] }));
  await ctx.route('**/webhook/rh/empleado/detalle', r => json(r, { ok: true, empleado: ficha }));
  await ctx.route('**/webhook/rh/empleado/editar', r => { enviados.push(JSON.parse(r.request().postData() || '{}')); return json(r, { ok: true }); });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic/, r => r.abort());
  const p = await ctx.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); p.on('dialog', d => d.dismiss());
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-tab="editar"]').click());
  await p.evaluate(() => { const s = document.getElementById('editEmpSel'); s.value = '9127'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForFunction(() => document.querySelector('#formEditar [name="name"]').value !== '', { timeout: 8000 }).catch(() => {});
  await fn(p, enviados);
  check('sin errores de JavaScript', !err.length, err.join(' | '));
  await ctx.close();
}
const guardar = async p => { await p.evaluate(() => { const f = document.getElementById('formEditar'); f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await p.waitForTimeout(800); };
const estadoPin = p => p.evaluate(() => ({ valor: document.querySelector('#formEditar [name="pin"]').value, requerido: document.querySelector('#formEditar [name="pin"]').required, leyenda: (document.getElementById('editPinEstado') || {}).textContent, html: document.getElementById('formEditar').innerHTML.includes('4821') }));

(async () => {
  const srv = await servir();
  // BASE=<dominio publicado> prueba la pantalla de producción (los webhooks siguen interceptados).
  const url = (process.env.BASE ? process.env.BASE.replace(/\/$/, '') : 'http://127.0.0.1:' + srv.address().port) + '/modulos/rh/empleados/index.html';
  const b = await chromium.launch();
  for (const w of [380, 1280]) {
    await escenario(b, url, 'servidor nuevo: pin_registrado, sin PIN', Object.assign({}, base, { pin_registrado: true }), w, async (p, env) => {
      const s = await estadoPin(p);
      check('el campo PIN nace vacío y no es obligatorio', s.valor === '' && !s.requerido, JSON.stringify(s));
      check('la leyenda dice que hay PIN registrado', /registrado ✓/.test(s.leyenda || ''), s.leyenda);
      check('el encabezado muestra el build nuevo', await p.evaluate(() => /v11-pin-oculto/.test(document.querySelector('.rh-build').textContent)));
      if (OUT) await p.screenshot({ path: path.join(OUT, 'rh-pin-' + w + '.png'), fullPage: true });
      await guardar(p);
      check('guardar sin tocar el PIN manda pin vacío (el servidor no lo toca)', env.length === 1 && env[0].pin === '', JSON.stringify(env.map(x => x.pin)));
      await p.fill('#formEditar [name="pin"]', PIN_NUEVO); await guardar(p);
      check('escribir un PIN nuevo sí lo manda', env.length === 2 && env[1].pin === PIN_NUEVO, JSON.stringify(env.map(x => x.pin)));
    });
    await escenario(b, url, 'servidor viejo: todavía manda el PIN', Object.assign({}, base, { pin: '4821' }), w, async (p, env) => {
      const s = await estadoPin(p);
      check('aun con respuesta vieja, el PIN NO se pinta en la pantalla', s.valor === '' && !s.html, JSON.stringify(s));
      check('la leyenda dice que hay PIN registrado', /registrado ✓/.test(s.leyenda || ''), s.leyenda);
      await guardar(p);
      check('guardar sin tocar el PIN manda pin vacío', env.length === 1 && env[0].pin === '', JSON.stringify(env.map(x => x.pin)));
    });
    await escenario(b, url, 'empleado sin PIN', Object.assign({}, base, { pin_registrado: false }), w, async p => {
      const s = await estadoPin(p);
      check('la leyenda pide capturar uno', /sin PIN registrado/.test(s.leyenda || ''), s.leyenda);
    });
  }
  await b.close(); srv.close();
  console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
