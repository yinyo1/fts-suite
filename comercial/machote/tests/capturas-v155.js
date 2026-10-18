/* Capturas de la celda Link de la V1.55 (fts-conceptualizador#12 G), a los cuatro anchos.
 *
 *   node comercial/machote/tests/capturas-v155.js
 *
 * Con liga: «✓ dominio ↗» clicable (la liga completa en el tooltip), la foto del producto al pasar el mouse y ✎ para
 * editarla. Sin liga, o con una escrita a mano que no es liga, la celda de siempre. Comprueba además que ✎ muestra la
 * celda para editar y que nada se sale de la fila. pageerror = falla.
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v155');
const ANCHOS = [380, 760, 900, 1280];
const CAND = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const GEO = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));
const HD = 'https://www.homedepot.com.mx/p/bosch-disco-de-corte-metal-para-esmeriladora-angular-4-1-2-2608619383-226216';
const ODOO = 'https://serviciosfts.odoo.com/odoo/action-account.action_move_in_invoice_type/62948';
const GR = 'https://www.grainger.com.mx/producto/Ancla/p/NA4053';
const MACH = (function () {
  const vm = require('vm');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const c = { window: {}, console }; c.window.window = c.window; vm.createContext(c); vm.runInContext(src, c);
  const m = JSON.parse(JSON.stringify(c.window.DEMO.MACHOTES[0])); delete m._demo; m.id = 'M-9155';
  const s = m.secciones[0];
  s.partidas = [
    { descripcion: 'Disco de corte metal 4 1/2" Bosch 2608619383', qty: 40, unidad: 'Pieza', tipo: 'Materiales', pu: 8.12, moneda: 'MXN', margen: null, link: HD, link_estado: 'verificada', link_foto: 'https://cdn.homedepot.com.mx/productos/226216/226216-d.jpg', comentario: '' },
    { descripcion: 'Eslinga de poliéster ojo-ojo 6 ft', qty: 4, unidad: 'Pieza', tipo: 'Materiales', pu: 380.7, moneda: 'MXN', margen: null, link: ODOO, link_estado: 'verificada', comentario: 'BILL3408' },
    { descripcion: 'Ancla arpón 5/8 × 5 in NA4053', qty: 32, unidad: 'Pieza', tipo: 'Materiales', pu: 17.24, moneda: 'MXN', margen: null, link: GR, link_estado: 'revisar_precio', comentario: '' },
    { descripcion: 'Renglón capturado a mano, sin liga', qty: 1, unidad: 'Servicio', tipo: 'Servicios', pu: 1500, moneda: 'MXN', margen: null, link: 'cotización de Juan', comentario: '' }].concat(s.partidas.slice(4));
  return m;
})();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errs = []; let mal = 0;
  for (const w of ANCHOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.route(/cdn\.homedepot\.com\.mx/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#c9d1d6"/><circle cx="60" cy="60" r="34" fill="#8a979e"/></svg>' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(w + 'px :: ' + e.message));
    await p.addInitScript((c) => { try { localStorage.clear();
      localStorage.setItem('fts_suite_session', JSON.stringify({ token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null, scopes: ['comercial:read', 'comercial:write'], exp: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1, guardado_at: new Date().toISOString(), machotes: [c.m], handoff: {} })); } catch (e) {}
      const orig = window.fetch; window.fetch = function (u, init) {
        if (String(u).indexOf('geo.json') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(c.geo) });
        if (String(u).indexOf('/comercial/') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        return orig(u, init); }; }, { m: MACH, geo: GEO });
    await p.goto(BASE + '#/m/M-9155'); await p.waitForTimeout(900);
    await p.click('[data-hoja="' + MACH.secciones[0].id + '"]').catch(() => p.click('.pestana[data-hoja^="s-"]')); await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const L = Array.prototype.slice.call(document.querySelectorAll('.lk')).map(x => ({ a: (x.querySelector('a') || {}).textContent, href: (x.querySelector('a') || {}).href, title: (x.querySelector('a') || {}).title, img: !!x.querySelector('.lk-pv img'), vis: x.querySelector('a') && x.querySelector('a').getBoundingClientRect().width > 0 }));
      const mano = Array.prototype.slice.call(document.querySelectorAll('input[data-cel$="link"]')).filter(i => i.value === 'cotización de Juan' && !i.closest('.lk')).length;
      return { L, mano };
    });
    const hd = r.L.find(x => x.href === HD) || {}, od = r.L.find(x => x.href === ODOO) || {}, gr = r.L.find(x => x.href === GR) || {};
    const lk = await p.$('.lk.con'); if (lk) { await lk.scrollIntoViewIfNeeded(); await lk.hover(); await p.waitForTimeout(300); }
    const fila = await p.$('tr:has(.lk.con)');
    if (fila) await p.screenshot({ path: `${OUT}/link-${w}.png` });
    // ✎ → la celda para editar, enfocada
    const ed = await p.$('.lk.con .lk-ed'); let edita = false;
    if (ed) { await ed.click(); await p.waitForTimeout(200); edita = await p.evaluate(() => { const e = document.activeElement; if (window.__dbg) {} return !!(e && e.matches('input[data-cel$="link"]') && e.getBoundingClientRect().width > 0); }); }
    if (ed) await p.screenshot({ path: `${OUT}/link-editar-${w}.png` });
    const mueve = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const bien = /✓ homedepot\.com\.mx ↗/.test(hd.a || '') && hd.title === HD && hd.img && /✓ Odoo ↗/.test(od.a || '') && /⚠ grainger\.com\.mx ↗/.test(gr.a || '') && r.mano === 1 && edita;
    if (!bien) mal++;
    console.log(`${String(w).padEnd(5)} ${bien ? '✓' : '✗'} hd=${hd.a} img=${hd.img} odoo=${od.a} grainger=${gr.a} a_mano=${r.mano} edita=${edita} scrollH=${mueve}`);
    await ctx.close();
  }
  await b.close();
  if (errs.length) { console.log('pageerror:', errs); mal++; }
  console.log(mal ? `✗ ${mal} falla(s)` : '✓ celda Link: todo bien a los cuatro anchos');
  process.exit(mal ? 1 : 0);
})();
