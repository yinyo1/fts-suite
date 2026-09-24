// tests/kiosko-blindaje/b1/n8nfetch.test.js
//
// B1 (#269): n8nFetch clasifica cada falla y lee el cuerpo DENTRO del try.
// Carga operaciones/kiosk/js/odoo.js en un vm con fetch, AbortController y
// setTimeout simulados (sin red y sin esperar los 10 s reales).
//
// Run: node tests/kiosko-blindaje/b1/n8nfetch.test.js

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../../operaciones/kiosk/js/odoo.js'), 'utf8');

function cargar(fetchImpl) {
  const llamadas = [];
  const ctx = {
    console: { log() {}, warn() {} },
    localStorage: { getItem: () => 'https://n8n.test' },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    setTimeout: (fn, ms) => { if (ms === 10000) return 1; fn(); return 1; },   // el reintento de 2 s corre ya; el timeout de 10 s no
    clearTimeout: () => {},
    fetch: (url, opts) => { llamadas.push({ url, body: JSON.parse(opts.body) }); return fetchImpl(llamadas.length, opts); },
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { api: ctx.window.OdooKiosk, llamadas };
}
const res = (status, texto) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });

let ok = 0, mal = 0;
async function caso(desc, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + desc); }
  catch (e) { mal++; console.log('  ✗ ' + desc + '\n      ' + e.message); }
}
function igual(a, b, m) { if (a !== b) throw new Error((m || '') + ' esperaba ' + JSON.stringify(b) + ', llegó ' + JSON.stringify(a)); }

(async () => {
  console.log('\n=== n8nFetch (odoo.js) ===');

  await caso('200 con JSON: devuelve el objeto en el primer intento', async () => {
    const { api, llamadas } = cargar(() => res(200, '{"success":true,"attendance_id":7}'));
    const r = await api.registrarCheckin({ intento_id: 'a' });
    igual(r.attendance_id, 7); igual(llamadas.length, 1);
  });

  await caso('200 vacío (workflow que truena sin Respond): 3 intentos y error tipo "respuesta"', async () => {
    const { api, llamadas } = cargar(() => res(200, ''));
    let e = null; try { await api.registrarCheckin({ intento_id: 'b' }); } catch (x) { e = x; }
    igual(e && e.tipo, 'respuesta'); igual(llamadas.length, 3);
  });

  await caso('200 con HTML: error tipo "respuesta", ya no escapa del try', async () => {
    const { api } = cargar(() => res(200, '<html>oops</html>'));
    let e = null; try { await api.registrarCheckin({}); } catch (x) { e = x; }
    igual(e && e.tipo, 'respuesta');
  });

  await caso('Abort (10 s): error tipo "timeout"', async () => {
    const { api } = cargar(() => { const er = new Error('aborted'); er.name = 'AbortError'; return Promise.reject(er); });
    let e = null; try { await api.registrarCheckin({}); } catch (x) { e = x; }
    igual(e && e.tipo, 'timeout');
  });

  await caso('Sin red: error tipo "red"', async () => {
    const { api } = cargar(() => Promise.reject(new TypeError('Failed to fetch')));
    let e = null; try { await api.registrarCheckin({}); } catch (x) { e = x; }
    igual(e && e.tipo, 'red');
  });

  await caso('HTTP 502: error tipo "http" con status', async () => {
    const { api } = cargar(() => res(502, 'Bad Gateway'));
    let e = null; try { await api.registrarCheckin({}); } catch (x) { e = x; }
    igual(e && e.tipo, 'http'); igual(e.status, 502);
  });

  await caso('Los reintentos reenvían el MISMO intento_id', async () => {
    const { api, llamadas } = cargar((n) => n < 3 ? Promise.reject(new TypeError('Failed to fetch')) : res(200, '{"success":true,"attendance_id":1}'));
    await api.registrarCheckin({ intento_id: 'mismo-123' });
    igual(llamadas.length, 3);
    igual(new Set(llamadas.map(l => l.body.intento_id)).size, 1);
    igual(llamadas[2].body.intento_id, 'mismo-123');
  });

  await caso('consultarIntento va a /webhook/kiosk/intento con intento_id y empleado_id, 2 intentos máx.', async () => {
    const { api, llamadas } = cargar(() => Promise.reject(new TypeError('Failed to fetch')));
    try { await api.consultarIntento('q-1', 124); } catch (x) {}
    igual(llamadas.length, 2);
    igual(llamadas[0].url, 'https://n8n.test/webhook/kiosk/intento');
    igual(llamadas[0].body.intento_id, 'q-1'); igual(llamadas[0].body.empleado_id, 124);
  });

  console.log('\n' + ok + ' ✓   ' + mal + ' ✗');
  process.exit(mal ? 1 : 0);
})();
