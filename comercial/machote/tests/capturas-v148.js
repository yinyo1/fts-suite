/* Capturas del flujo de confirmación V1.48, a los cuatro anchos.
 *   node comercial/machote/tests/capturas-v148.js
 * Se MIRAN una por una. Una pantalla no se revisa leyendo su diff
 * (CLAUDE.md §20 #12 y #20). */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v148');
const ANCHOS = [380, 760, 900, 1280];
const CANDIDATOS = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const GEO = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));
const MACH = (function () {
  const vm = require('vm');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  const m = JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES[0]));
  delete m._demo; m.id = 'M-9148'; return m;
})();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errs = [];
  for (const w of ANCHOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(w + 'px :: ' + e.message));
    await p.addInitScript((cfg) => {
      try {
        localStorage.clear();
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
          scopes: ['comercial:read', 'comercial:write'],
          exp: Math.floor(Date.now() / 1000) + 3600 }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({
          v: 1, guardado_at: new Date().toISOString(), machotes: [cfg.m], handoff: {} }));
        localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
          'M-9148': { machote_id: 'uuid-9148', version: 4, folio: 78, folio_txt: 'COT-0148',
                      subido_at: new Date().toISOString(), huella: 'x',
                      odoo_so_id: 80000, odoo_so_name: 'SO-P-0' } }));
      } catch (e) {}
      window.__geo = cfg.geo;
      const orig = window.fetch;
      window.fetch = function (u, init) {
        const url = String(u);
        if (url.indexOf('geo.json') >= 0)
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cfg.geo) });
        if (url.indexOf('/comercial/') >= 0)
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        return orig(u, init);
      };
    }, { m: MACH, geo: GEO });

    await p.goto(BASE);
    await p.waitForTimeout(700);
    await p.evaluate(() => { location.hash = '#/m/M-9148'; });
    await p.waitForTimeout(700);

    // 1 · el botón, que ahora se llama Confirmar orden
    await p.screenshot({ path: `${OUT}/1-boton-${w}.png` });

    // 2 · el paso 1: elegir el par
    await p.evaluate(() => { const b = document.getElementById('btnOrden'); if (b) b.click(); });
    await p.waitForTimeout(350);
    await p.screenshot({ path: `${OUT}/2-paso1-${w}.png` });

    // 3 · el checklist con el paso 3 apagado
    await p.evaluate(() => {
      const r = document.querySelector('input[name=cfSel]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
      const ok = document.getElementById('cfOk'); if (ok) ok.click();
    });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/3-final-${w}.png` });

    const m = await p.evaluate(() => {
      const ok = document.getElementById('puOk');
      return { boton: ok ? (ok.textContent || '').trim() : null,
               apagado: ok ? ok.disabled : null,
               dice: !!document.querySelector('.pu-final'),
               desborde: document.documentElement.scrollWidth > window.innerWidth };
    });
    console.log(`${String(w).padEnd(5)} boton="${m.boton}" apagado=${m.apagado} ` +
                `explica=${m.dice} desborde=${m.desborde}`);
    await ctx.close();
  }
  await b.close();
  if (errs.length) { console.log('\n!! pageerror:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\n12 capturas en ' + OUT + ' · sin pageerror');
})();
