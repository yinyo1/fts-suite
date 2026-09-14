/* Capturas de las pantallas de la orden, V1.30, a los dos anchos.
 * Se miran; no se leen. (CLAUDE.md §20 #12) */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const RAIZ = '/home/user/fts-suite/comercial/machote';
const BASE = 'file://' + path.join(RAIZ, 'index.html');
const OUT = '/tmp/claude-0/-home-user/5bd3453d-06d8-5d19-84f7-8ed3d3007fcc/scratchpad/cap';
const GEO = JSON.parse(fs.readFileSync(
  '/home/user/fts-suite/shared/comercial/geo.json', 'utf8'));

/* Los machotes de ejemplo salen de `demo.js`, igual que en la suite: la
 * aplicacion ya no los trae de regalo desde V1.27. */
const MACHOTES = (function () {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(RAIZ, 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.join(RAIZ, 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES)).map(m => { delete m._demo; return m; });
})();

const RESP = {
  creada: {
    ok: true, orden_creada: true, odoo_so_id: 12088, odoo_so_name: 'SO11889',
    estado: 'draft', moneda: 'MXN', lista_precios: 'Public Pricelist (MXN)',
    empresa: 'SERVICIOS FTS', subtotal: 1794303.11, impuesto: 287088.50,
    total: 2081391.61, total_machote: 1794303.11, cuadra: true,
    moneda_correcta: true, ligada_en_la_base: true, vence_el: '2026-10-14',
    avisos: [], mensaje: 'Orden SO11889 creada en Odoo, en borrador.'
  },
  apagado: { code: 404, message: 'The requested webhook is not registered.' }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const CAND = [process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium'].filter(Boolean);
  const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});

  const pagina = async (ancho, respuesta) => {
    const q = await b.newPage({ viewport: { width: ancho, height: ancho < 500 ? 900 : 1000 } });
    await q.addInitScript((g) => {
      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('geo.json') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(g) });
        }
        return orig.apply(this, arguments);
      };
    }, GEO);
    await q.addInitScript((cfg) => {
      const poner = function () {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'x.y.z', actor: 'esteban.delacruz', nombre: 'Esteban De La Cruz',
            empleado_id: null, scopes: ['comercial:read', 'comercial:orden'],
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-1041': { version: 3, huella: 'x',
                        machote_id: '11111111-2222-3333-4444-555555555555' } }));
          if (!localStorage.getItem('fts_machote_v1')) {
            localStorage.setItem('fts_machote_v1', JSON.stringify({
              v: 1, guardado_at: new Date().toISOString(),
              machotes: cfg.machotes, handoff: {} }));
          }
        } catch (e) {}
      };
      poner();
      const limpiar = localStorage.clear.bind(localStorage);
      localStorage.clear = function () { limpiar(); poner(); };
      const orig2 = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('/comercial/orden-crear') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cfg.r) });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig2.apply(this, arguments);
      };
    }, { r: respuesta, machotes: MACHOTES });
    q.on('pageerror', e => console.log('  ⚠️ PAGEERROR:', e.message));
    return q;
  };

  const abrir = async (q) => {
    await q.goto(BASE); await q.waitForTimeout(900);
    const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
    await q.goto(BASE + href); await q.waitForTimeout(900);
    await q.click('#btnOrden'); await q.waitForTimeout(500);
  };

  for (const ancho of [1280, 380]) {
    let q = await pagina(ancho, RESP.creada);
    await abrir(q);
    await q.screenshot({ path: OUT + '/configurador-' + ancho + '.png', fullPage: true });
    /* El modal tiene su propio scroll, asi que el pie —donde vive el boton
     * nuevo— no sale en un fullPage. Se baja a mano y se captura otra vez. */
    await q.evaluate(() => {
      const d = document.querySelector('#modalOrden .or-caja') || document.querySelector('#modalOrden > div');
      if (d) d.scrollTop = d.scrollHeight;
      const pie = document.querySelector('#modalOrden .or-pie');
      if (pie && pie.scrollIntoView) pie.scrollIntoView({ block: 'end' });
    });
    await q.waitForTimeout(400);
    await q.screenshot({ path: OUT + '/pie-' + ancho + '.png', fullPage: true });
    await q.click('#or-crear'); await q.waitForTimeout(900);
    await q.screenshot({ path: OUT + '/creada-' + ancho + '.png', fullPage: true });
    await q.close();

    q = await pagina(ancho, RESP.apagado);
    await abrir(q);
    await q.click('#or-crear'); await q.waitForTimeout(900);
    await q.screenshot({ path: OUT + '/apagado-' + ancho + '.png', fullPage: true });
    await q.close();
    console.log('capturas listas a', ancho);
  }

  await b.close();
})();
