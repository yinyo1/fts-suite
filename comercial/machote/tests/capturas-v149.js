/* Capturas de la LISTA de órdenes, a los cuatro anchos.
 *   node comercial/machote/tests/capturas-v149.js
 * Se MIRAN una por una (CLAUDE.md §20 #12 y #20). */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v149');
const ANCHOS = [380, 760, 900, 1280];
const CAND = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const GEO = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));
const MACH = (function () {
  const vm = require('vm');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const c = { window: {}, console }; c.window.window = c.window;
  vm.createContext(c); vm.runInContext(src, c);
  const m = JSON.parse(JSON.stringify(c.window.DEMO.MACHOTES[0]));
  delete m._demo; m.id = 'M-9149'; return m;
})();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errs = [];
  let mal = 0;
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
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u, init) {
        const url = String(u);
        if (url.indexOf('geo.json') >= 0)
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cfg.geo) });
        if (url.indexOf('/comercial/ordenes') >= 0) {
          const filas = [];
          /* Casos que tienen que verse: importe largo, cliente largo, sin
           * machote, cotizador que no casa, USA, cancelada. Una fila corta
           * cabe en cualquier parte y no prueba nada. */
          const muestras = [
            { n:'SO11902', e:'sent', cli:'Industrias Inventadas del Norte y Occidente', d:'Mantenimiento de centro de control de motores de la planta 2', cot:'Ricardo', ce:'activo', t:12845000.5, mo:'MXN', mach:1 },
            { n:'SO11901', e:'draft', cli:'Manufacturas Ficticias', d:'Proyecto de control de agua', cot:'Ricardo', ce:'activo', t:62400, mo:'USD', usa:1, mach:0 },
            { n:'SO11900', e:'sale', cli:'Alimentos Imaginarios', d:'Mantenimiento preventivo y diagnóstico de tableros', cot:'Monty', ce:'sin_casar', t:128500, mo:'MXN', mach:1 },
            { n:'SO11899', e:'cancel', cli:'Química Supuesta', d:'Fabricación de almacén para residuos', cot:'Aldo', ce:'archivado', t:1940000, mo:'MXN', mach:0 },
            { n:'SO11898', e:'sale', cli:'Ensambles Hipotéticos', d:'', cot:'', ce:null, t:97200.25, mo:'MXN', mach:0 }
          ];
          const out = muestras.map((x, i) => ({
            id: 80000 + i, nombre: x.n, estado: x.e, empresa_id: x.usa ? 6 : 1,
            cliente: x.cli, descripcion: x.d, po: '', cotizador: x.cot,
            cotizador_estado: x.ce, total: x.t, moneda: x.mo, fecha: '—', pricelist: '—',
            machote: x.mach ? { id: 'uuid-' + i, id_local: 'M-9149',
              folio_txt: 'COT-01' + (40 + i), nombre: 'Cotización de prueba ' + i,
              duenio: 'zz.prueba', version: 4 } : null
          }));
          return Promise.resolve({ ok: true, json: () => Promise.resolve(
            { ok: true, ordenes: out, total: 1546, ocultas: 9 }) });
        }
        if (url.indexOf('/comercial/') >= 0)
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        return orig(u, init);
      };
    }, { m: MACH, geo: GEO });

    await p.goto(BASE);
    await p.waitForTimeout(600);
    await p.evaluate(() => { location.hash = '#/ordenes'; });
    await p.waitForTimeout(1100);
    await p.screenshot({ path: `${OUT}/lista-${w}.png`, fullPage: true });

    const m = await p.evaluate(() => {
      const caja = document.querySelector('.or-caja');
      const tab = document.querySelector('table.or-tab');
      const thead = document.querySelector('table.or-tab thead');
      const tot = document.querySelector('td.or-tot');
      const th = document.querySelectorAll('table.or-tab thead th');
      return {
        esLista: !!(thead && getComputedStyle(thead).display !== 'none'),
        columnas: th.length,
        rotulos: Array.prototype.map.call(th, x => x.textContent.trim()).join(' · '),
        pagina_se_mueve: document.documentElement.scrollWidth > window.innerWidth,
        caja_se_mueve: caja ? caja.scrollWidth > caja.clientWidth + 1 : null,
        /* El importe NO puede estar recortado: se compara lo que mide su texto
         * contra lo que mide su celda. */
        total_recortado: tot ? tot.scrollWidth > tot.clientWidth + 1 : null,
        total_texto: tot ? tot.textContent.trim() : null,
        /* ⚠️ La pastilla tiene que decir una PALABRA. Si dijera «q» o «s» sería
         * que el estado no casó con el catálogo y se está pintando el código
         * crudo — que fue exactamente lo que pasó la primera vez, por culpa de
         * esta fixtura y no del código. Una fixtura mal hecha mide otra cosa. */
        estados: Array.prototype.map.call(
          document.querySelectorAll('td[data-th=Estado] .or-est'),
          x => x.textContent.trim()).join('|'),
        nuevo: !!document.querySelector('.orl-nuevo'),
        pie: (document.querySelector('.orl-pie') || {}).textContent || ''
      };
    });
    const letras = /(^|\|)[a-z](\||$)/.test(m.estados);
    const ok = m.esLista && m.columnas === 7 && !m.pagina_se_mueve &&
               !m.total_recortado && !letras;
    if (!ok) mal++;
    console.log(`${String(w).padEnd(5)} ${ok ? '✓' : '✗'} lista=${m.esLista} cols=${m.columnas} ` +
      `pagina_se_mueve=${m.pagina_se_mueve} caja_se_mueve=${m.caja_se_mueve} ` +
      `total="${m.total_texto}" recortado=${m.total_recortado} estados=${m.estados}`);
    if (w === 1280) console.log(`      rótulos: ${m.rotulos}`);
    if (w === 1280) console.log(`      pie: ${m.pie.trim().slice(0, 90)}`);
    await ctx.close();
  }
  await b.close();
  if (errs.length) { console.log('\n!! pageerror:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  if (mal) { console.log('\n' + mal + ' ancho(s) mal'); process.exit(1); }
  console.log('\n4 capturas en ' + OUT + ' · sin pageerror');
})();
