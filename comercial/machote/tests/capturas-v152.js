/* Capturas de los DOS candados nuevos de la V1.52, a los cuatro anchos.
 *
 *   node comercial/machote/tests/capturas-v152.js
 *
 * Los dos son texto dentro del checklist, y el texto largo es justo lo que se
 * rompe en la franja de en medio —721–980 px, que en este módulo ya se rompió
 * dos veces (§20 #20)—. Las pruebas de arriba comprueban que FRENAN; esto
 * comprueba que se LEEN. Son cosas distintas y la segunda sólo se ve mirando.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v152');
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
  delete m._demo; m.id = 'M-9152';
  /* Declarado adicional de la MISMA orden a la que está ligado: es el caso que
   * dispara el candado nuevo. */
  m.adicional_de = { odoo_so_id: 12110, odoo_so_name: 'SO11911' };
  return m;
})();

function sembrar(p, cfg) {
  return p.addInitScript((c) => {
    try {
      localStorage.clear();
      localStorage.setItem('fts_suite_session', JSON.stringify({
        token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
        scopes: ['comercial:read', 'comercial:write'],
        exp: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem('fts_machote_v1', JSON.stringify({
        v: 1, guardado_at: new Date().toISOString(), machotes: [c.m], handoff: {} }));
      localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
        'M-9152': { machote_id: 'uuid-152', version: 4, folio: 152, folio_txt: 'COT-0152',
                    odoo_so_id: 12110, odoo_so_name: 'SO11911',
                    subido_at: new Date().toISOString(), huella: 'x' } }));
    } catch (e) {}
    const orig = window.fetch;
    window.fetch = function (u, init) {
      if (String(u).indexOf('geo.json') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve(c.geo) });
      if (String(u).indexOf('/comercial/') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      return orig(u, init);
    };
  }, cfg);
}

/* Lo que se sale de su caja. Es lo que ninguna aserción de texto ve. */
const DESBORDES = (sel) => {
  const raiz = document.querySelector(sel);
  if (!raiz) return null;
  const rr = raiz.getBoundingClientRect();
  const malos = [];
  Array.prototype.slice.call(raiz.querySelectorAll('*')).forEach(function (el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > rr.right + 2 || r.left < rr.left - 2) malos.push(el.tagName + '.' + (el.className || ''));
  });
  return malos.slice(0, 4);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errs = [];
  let mal = 0;

  for (const w of ANCHOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(w + 'px :: ' + e.message));
    await sembrar(p, { m: MACH, geo: GEO });
    await p.goto(BASE);
    await p.waitForTimeout(700);

    const r = await p.evaluate(async () => {
      const esperar = (ms) => new Promise(r => setTimeout(r, ms));
      const P = window.PuertaConfirmar, A = window.MachoteApp, K = window.MachoteCalc;
      const m = A.machotePorUuid('uuid-152');
      const calc = K.calcular(m);
      /* El servidor dice que todo bien y manda un presupuesto EN CERO: así los
       * dos candados nuevos salen a la vez y se ven juntos, que es como le
       * van a llegar a quien se equivoque de verdad. */
      const servidor = {
        ok: true, se_puede_confirmar: true, moneda: m.moneda || 'MXN',
        odoo_so_id: 12110, odoo_so_name: 'SO11911', estado_orden: 'draft',
        cuadra: true, moneda_correcta: true, dentro_politica: true,
        subtotal_odoo: 1000, total_machote: 1000,
        handoff: { completo: true, falta: [], avisos: [],
          presupuesto: [{ rubro_id: 1171, monto: 1000, signo: 1 },
                        { rubro_id: 1177, monto: 0, signo: -1 },
                        { rubro_id: 1176, monto: 0, signo: -1 }] }
      };
      /* ⚠️ `abrir` IGNORA el `servidor` que se le pase: pinta primero sin él y
       * después lo va a buscar al webhook. O sea que para ver los candados que
       * dependen de la respuesta del servidor hay que componerlos aquí. Se usa
       * el cascarón real de `abrir` y se le mete el `html` real de la puerta:
       * lo que se mira es el render de verdad, no una maqueta. */
      P.abrir({ machote: m, calc: calc, desde: 'confirmar' });
      await esperar(400);
      const velo = document.getElementById('puVelo');
      const pu = velo ? velo.querySelector('.pu-modal') : null;
      const cuerpo = velo ? velo.querySelector('.pu-cuerpo') : null;
      const v = P.evaluar({ machote: m, calc: calc, servidor: servidor, desde: 'confirmar' });
      if (cuerpo) { cuerpo.innerHTML = P.html(v); cuerpo.scrollTop = cuerpo.scrollHeight; }
      const t = pu ? (pu.textContent || '').replace(/\s+/g, ' ') : '';
      return {
        abierto: !!(velo && velo.classList.contains('abierto')),
        dicePresupuesto: /El presupuesto no cuadra con la cotizaci/i.test(t),
        diceAdicional: /adicional est[áa] ligado a la MISMA orden/i.test(t),
        candados: pu ? pu.querySelectorAll('.pu-c').length : 0
      };
    });

    const modal = await p.$('#puVelo .pu-modal');
    if (modal) await modal.screenshot({ path: `${OUT}/candados-${w}.png` });
    const d = await p.evaluate(DESBORDES, '#puVelo .pu-modal');
    const mueve = await p.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);

    const bien = r.abierto && r.dicePresupuesto && r.diceAdicional &&
                 !mueve && (d || []).length === 0;
    if (!bien) mal++;
    console.log(`${String(w).padEnd(5)} ${bien ? '✓' : '✗'} abierto=${r.abierto} ` +
      `presupuesto=${r.dicePresupuesto} adicional=${r.diceAdicional} ` +
      `candados=${r.candados} pagina_se_mueve=${mueve} desbordes=${(d||[]).length}`);
    if ((d || []).length) console.log('      DESBORDA: ' + d.join(' ;; '));
    await ctx.close();
  }

  await b.close();
  if (errs.length) { console.log('\npageerror:'); errs.forEach(e => console.log('  ' + e)); }
  console.log(`\nCAPTURAS en ${OUT}`);
  console.log(mal === 0 && errs.length === 0
    ? 'RESULTADO: los cuatro anchos bien. AHORA SE MIRAN.'
    : `RESULTADO: ${mal} ancho(s) mal, ${errs.length} pageerror.`);
  process.exit(mal === 0 && errs.length === 0 ? 0 : 1);
})();
