/* ═══ Capturas de la V1.44 · la oportunidad y el beneficiario ══════════════
 *
 *   node comercial/machote/tests/capturas-v144.js [carpeta]
 *
 * Cuatro anchos —380, 760, 900 y 1280— y las cuatro superficies nuevas:
 *   · la FRANJA de la oportunidad que falta, sobre el libro
 *   · el DIÁLOGO de la oportunidad con candidatas
 *   · la PASTILLA de ya-ligada
 *   · el SELECTOR de beneficiarios abierto, con un ambiguo y un pendiente
 *
 * Los dos anchos de en medio son el punto (§20 #20): lo que se rompe se rompe
 * entre 721 y 980, donde una media query ya se apagó y la otra no ha entrado.
 * En este módulo esa franja ya se rompió DOS veces por cosas distintas.
 *
 * ⚠️ NO se suben al repo: es público (§20 #7). La carpeta por omisión está
 * fuera del árbol del repositorio.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SALIDA = process.argv[2] || path.join(require('os').tmpdir(), 'capturas-v144');

const CAND = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const GEO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared', 'comercial', 'geo.json'), 'utf8'));
const MACHOTES = (function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.join(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES)).map(m => { delete m._demo; return m; });
})();

/* El catálogo se finge, con nombres INVENTADOS: la captura no puede depender de
 * lo que haya hoy en Odoo, y los nombres de verdad no salen de Odoo en una
 * imagen que alguien podría pegar en cualquier parte. */
const CATALOGO = {
  oportunidades: [
    { id: 901, nombre: 'Reubicación de chillers entre posiciones 3 y 4 de la planta',
      cliente: 'Cliente Industrial Inventado, SA de CV', etapa: 'Cotizacion Enviada',
      puntos: 6, por_que: 'coinciden 2 palabras · etapa viva' },
    { id: 902, nombre: 'Adecuación eléctrica para la nueva empacadora',
      cliente: 'Cliente Industrial Inventado, SA de CV', etapa: 'Prospecto Lead',
      puntos: 2, por_que: 'mismo cliente' },
    { id: 903, nombre: 'Suministro e instalación de tubería de acero inoxidable',
      cliente: 'Cliente Industrial Inventado, SA de CV', etapa: 'Lead Calificado/Por cotizar',
      puntos: 2, por_que: 'mismo cliente' }
  ],
  internos: [
    { cuenta_id: 1156, cuenta_nombre: '3.4 Comisiones Apellido Repetido',
      nombre: '3.4 Comisiones Apellido Repetido', tipo: 'interno', empleado_id: null,
      vigente: true, pendiente: false, ambiguo: true, como: 'varios empleados casan' },
    { cuenta_id: 1179, cuenta_nombre: '3.1.1 Comisiones Apellido Único',
      nombre: '3.1.1 Comisiones Apellido Único', tipo: 'interno', empleado_id: 97,
      vigente: true, pendiente: false, ambiguo: false, como: 'nombre de la cuenta contra el padron' }
  ],
  externos: [
    { cuenta_id: 9001, cuenta_nombre: '5. Comisiones Clientes externo · Contacto Inventado Del Cliente',
      nombre: 'Contacto Inventado Del Cliente', tipo: 'externo', vigente: true,
      pendiente: true, ambiguo: false, como: 'guardado en la base' }
  ]
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errores = [];
  const hechas = [];
  for (const [w, h] of [[380, 900], [760, 900], [900, 900], [1280, 950]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errores.push(w + 'px PAGEERROR: ' + e.message));
    await p.route('**/geo.json*', r => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify(GEO) }));
    await p.addInitScript((cfg) => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
          scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600 }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1,
          guardado_at: new Date().toISOString(), machotes: cfg.m, handoff: {} }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/oportunidades') >= 0) {
          const cuerpo = JSON.parse((o && o.body) || '{}');
          return Promise.resolve({ ok: true, json: () => Promise.resolve(
            cuerpo.modo === 'candidatas'
              ? { ok: true, modo: 'candidatas', candidatas: cfg.c.oportunidades, total_del_cliente: 3 }
              : { ok: true, modo: 'buscar', oportunidades: [], total: 0 }) });
        }
        if (s.indexOf('/comercial/beneficiarios') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(
            { ok: true, modo: 'catalogo', internos: cfg.c.internos, externos: cfg.c.externos }) });
        }
        return orig(u, o);
      };
    }, { m: MACHOTES, c: CATALOGO });

    const tirar = async (nombre) => {
      const f = path.join(SALIDA, w + '-' + nombre + '.png');
      await p.screenshot({ path: f });
      hechas.push(f);
    };

    await p.goto(BASE); await p.waitForTimeout(900);
    await p.evaluate(() => { location.hash = '#/m/M-1041'; }); await p.waitForTimeout(800);

    // 1 · la franja de la oportunidad que falta, en su sitio, sobre el libro
    await tirar('franja');

    // 2 · el diálogo con las candidatas
    await p.click('#opElegir'); await p.waitForTimeout(800);
    await tirar('dialogo-oportunidad');

    // 3 · elegida: la pastilla
    await p.click('#opCandsCuerpo [data-opid]'); await p.waitForTimeout(800);
    await tirar('pastilla');

    // 4 · el selector de beneficiarios, con el ambiguo y el pendiente a la vista
    const cel = '[data-ben="eq:venta:0:nombre"]';
    if (await p.$(cel)) {
      await p.click(cel); await p.waitForTimeout(800);
      await tirar('selector-beneficiario');
      const caja = await p.$('#benCaja .caja');
      if (caja) {
        const r = await caja.boundingBox();
        if (r && r.x + r.width > w + 2) errores.push(w + 'px: el selector se sale ' + Math.round(r.x + r.width - w) + 'px');
      }
    } else {
      errores.push(w + 'px: no se encontró la celda del beneficiario');
    }

    const desb = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (desb > 2) errores.push(w + 'px: la página desborda ' + desb + 'px');
    await p.close();
  }
  await b.close();
  console.log('Capturas en ' + SALIDA);
  hechas.forEach(f => console.log('  ' + path.basename(f)));
  if (errores.length) { console.log('\nPROBLEMAS:'); errores.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\nSin desbordes ni errores de página.');
})();
