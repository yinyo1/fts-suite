/* Capturas de los TRES textos que cambiaron en la V1.51, a los cuatro anchos.
 *
 *   node comercial/machote/tests/capturas-v151.js
 *
 * ── POR QUÉ ESTE GUION EXISTE ───────────────────────────────────────────────
 * La V1.51 no cambió comportamiento: cambió COPY. Cuatro pantallas decían que
 * el webhook tarda ~29 minutos y eso dejó de ser cierto el 7-oct (son ~14 s).
 * Un cambio de texto parece inofensivo y es justo de los que rompen el ancho:
 * el texto nuevo es MÁS LARGO que el viejo en los tres casos, y la franja que
 * se rompe no es 380 ni 1280 sino la de en medio (§20 #20).
 *
 * Lo que se comprueba, por ancho:
 *   (a) que el texto NUEVO está y el VIEJO ya no — un `~29 minutos` en
 *       presente sería la regla de §20 #19 otra vez;
 *   (b) que la página no se desplaza de lado;
 *   (c) que nada se sale de su caja.
 * Y después SE MIRAN las capturas: ninguna de las tres cosas de arriba ve un
 * párrafo feo.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v151');
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
  delete m._demo; m.id = 'M-9151';
  delete m.cliente_id; m.cliente = 'Cliente Tecleado A Mano';
  return m;
})();

const CAND_ORD = [
  { id: 80000, nombre: 'SO11902', estado: 'sent',
    cliente: 'Industrias Inventadas del Norte y Occidente', total: 12845000.5,
    moneda: 'MXN', fecha: '2026-09-01' },
  { id: 80001, nombre: 'SO11901', estado: 'sale',
    cliente: 'Manufacturas Ficticias', total: 62400, moneda: 'USD',
    fecha: '2026-09-02' }
];

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
        'M-9151': { machote_id: 'uuid-151', version: 4, folio: 151,
                    folio_txt: 'COT-0151', subido_at: new Date().toISOString(),
                    huella: 'x' } }));
    } catch (e) {}
    const orig = window.fetch;
    window.fetch = function (u, init) {
      const url = String(u);
      if (url.indexOf('geo.json') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve(c.geo) });
      if (url.indexOf('/comercial/') >= 0) {
        let cu = null; try { cu = JSON.parse((init && init.body) || '{}'); } catch (e) {}
        const modo = (cu && cu.modo) || 'listar';
        if (url.indexOf('/comercial/ordenes') >= 0) {
          if (modo === 'buscar')
            return Promise.resolve({ ok: true, json: () => Promise.resolve(
              { ok: true, ordenes: c.cand, total: c.cand.length, truncado: false }) });
          const filas = c.cand.map(function (x, i) {
            return { id: x.id, nombre: x.nombre, estado: x.estado, empresa_id: 1,
              cliente: x.cliente, descripcion: 'Trabajo inventado ' + i, po: '',
              cotizador: 'Ricardo', cotizador_estado: 'activo', total: x.total,
              moneda: x.moneda, fecha: x.fecha, pricelist: '—', machote: null };
          });
          return Promise.resolve({ ok: true, json: () => Promise.resolve(
            { ok: true, ordenes: filas, total: 1546, ocultas: 9 }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return orig(u, init);
    };
  }, cfg);
}

/* Lo que se exige de cada texto. El `prohibido` es la mitad que importa: que
 * el texto nuevo esté no prueba que el viejo se fue, y los dos juntos en la
 * misma pantalla se contradicen. */
const ESPERADO = {
  ordenes: { debe: ['ya se arregló', '~14 s', 'correo de handoff'],
             prohibido: ['tarda ~29 minutos', 'tres cambios de'] },
  buscar:  { debe: ['ya se', 'arregló', '~14 s', 'desde el navegador'],
             prohibido: ['tarda ~29 minutos'] },
  paso3:   { debe: ['aplicados y publicados', 'aplicada y publicada',
                    'ESTA pantalla', 'correo de handoff'],
             prohibido: ['tarda ~29 minutos'] }
};

function revisar(nombre, texto) {
  const e = ESPERADO[nombre];
  const faltan = e.debe.filter(s => texto.indexOf(s) < 0);
  const sobran = e.prohibido.filter(s => texto.indexOf(s) >= 0);
  return { faltan: faltan, sobran: sobran, ok: !faltan.length && !sobran.length };
}

/* Un elemento que se sale de su contenedor. Es lo que ninguna aserción de
 * texto ve y lo que la captura grita. */
const DESBORDES = (sel) => {
  const raiz = document.querySelector(sel);
  if (!raiz) return null;
  const rr = raiz.getBoundingClientRect();
  const malos = [];
  Array.prototype.slice.call(raiz.querySelectorAll('*')).forEach(function (el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > rr.right + 2 || r.left < rr.left - 2) {
      malos.push((el.tagName + '.' + (el.className || '')).slice(0, 50) +
                 ' ' + Math.round(r.left) + '→' + Math.round(r.right) +
                 ' (caja ' + Math.round(rr.left) + '→' + Math.round(rr.right) + ')');
    }
  });
  return malos.slice(0, 5);
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
    await sembrar(p, { m: MACH, geo: GEO, cand: CAND_ORD });
    await p.goto(BASE);
    await p.waitForTimeout(600);

    /* ── 1 · el aviso de la vista de ÓRDENES ── */
    await p.evaluate(() => { location.hash = '#/ordenes'; });
    await p.waitForTimeout(1300);
    /* ⚠️ El aviso NO está en la pantalla: lo pinta el clic en «Nuevo». La
     * primera versión de este guion leyó `.orl-nota` sin apretar nada, encontró
     * cadena vacía, y la reportó como «falta el texto nuevo» — o sea un fallo
     * de la pantalla que era del instrumento (§20 #19). Un selector que no
     * existe y un texto equivocado se ven idénticos. */
    const hayNuevo = await p.evaluate(() => {
      const b = document.querySelector('[data-nuevo]');
      if (!b) return false;
      b.click(); return true;
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/ordenes-aviso-${w}.png`, fullPage: true });
    const t1 = await p.evaluate(() => {
      const n = document.querySelector('.orl-nota');
      return n ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '';
    });
    const d1 = await p.evaluate(DESBORDES, '.orl-nota');
    const r1 = revisar('ordenes', t1);

    /* ── 2 · el detalle de «si de verdad no hay orden», en el buscador ── */
    await p.evaluate(() => { location.hash = '#/m/M-9151'; });
    await p.waitForTimeout(800);
    await p.evaluate(async () => {
      const esperar = (ms) => new Promise(r => setTimeout(r, ms));
      document.getElementById('btnOrden').click(); await esperar(350);
      document.getElementById('cfLigar').click();  await esperar(500);
      const d = document.querySelector('#obVelo details'); if (d) d.open = true;
    });
    await p.waitForTimeout(350);
    await p.screenshot({ path: `${OUT}/buscar-detalle-${w}.png`, fullPage: true });
    const t2 = await p.evaluate(() => {
      const d = document.querySelector('#obVelo details');
      return d ? (d.textContent || '').replace(/\s+/g, ' ').trim() : '';
    });
    const d2 = await p.evaluate(DESBORDES, '#obVelo .pu-modal');
    const r2 = revisar('buscar', t2);

    /* ── 3 · las condiciones del paso 3, en el checklist ── */
    const llego = await p.evaluate(async () => {
      const esperar = (ms) => new Promise(r => setTimeout(r, ms));
      window.confirm = () => true; window.alert = () => {};
      const q = document.getElementById('obQ');
      if (q) { q.value = 'SO119'; q.dispatchEvent(new Event('input')); }
      const g = document.getElementById('obGo'); if (g) g.click();
      await esperar(550);
      const rr = document.querySelectorAll('input[name="obO"]');
      if (rr[0]) { rr[0].checked = true; rr[0].dispatchEvent(new Event('change')); }
      await esperar(120);
      const ok = document.getElementById('obOk'); if (ok) ok.click();
      await esperar(950);
      const v = document.getElementById('puVelo');
      return !!(v && v.classList.contains('abierto'));
    });
    /* ⚠️ El bloque del paso 3 va al FINAL de un cuadro que se desplaza por
     * dentro. Sin este scroll la captura enseña la mitad de arriba y uno da por
     * bueno un texto que no miró — que es justo lo que §20 #20 viene a impedir. */
    await p.evaluate(() => {
      const c = document.querySelector('#puVelo .pu-cuerpo');
      if (c) c.scrollTop = c.scrollHeight;
    });
    await p.waitForTimeout(250);
    const modal = await p.$('#puVelo .pu-modal');
    if (modal) await modal.screenshot({ path: `${OUT}/paso3-condiciones-${w}.png` });
    else await p.screenshot({ path: `${OUT}/paso3-condiciones-${w}.png`, fullPage: true });
    const t3 = await p.evaluate(() => {
      const v = document.getElementById('puVelo');
      if (!v) return '';
      return (v.textContent || '').replace(/\s+/g, ' ').trim();
    });
    const d3 = await p.evaluate(DESBORDES, '#puVelo .pu-modal');
    const r3 = revisar('paso3', t3);

    const mueve = await p.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);

    const bien = hayNuevo && r1.ok && r2.ok && r3.ok && llego && !mueve &&
                 (d1 || []).length === 0 && (d2 || []).length === 0 && (d3 || []).length === 0;
    if (!bien) mal++;
    console.log(`${String(w).padEnd(5)} ${bien ? '✓' : '✗'} ` +
      `ordenes:${r1.ok ? 'ok' : 'MAL'} buscar:${r2.ok ? 'ok' : 'MAL'} ` +
      `paso3:${r3.ok ? 'ok' : 'MAL'} boton_nuevo=${hayNuevo} checklist_abrio=${llego} ` +
      `pagina_se_mueve=${mueve} desbordes=${(d1||[]).length}/${(d2||[]).length}/${(d3||[]).length}`);
    [['ordenes', r1, d1], ['buscar', r2, d2], ['paso3', r3, d3]].forEach(function (x) {
      if (x[1].faltan.length) console.log('      ' + x[0] + ' FALTA: ' + x[1].faltan.join(' | '));
      if (x[1].sobran.length) console.log('      ' + x[0] + ' SOBRA (texto viejo): ' + x[1].sobran.join(' | '));
      if ((x[2] || []).length) console.log('      ' + x[0] + ' DESBORDA: ' + x[2].join(' ;; '));
    });
    if (w === 1280) {
      console.log('\n--- el texto del paso 3, para leerlo ---\n' +
        t3.replace(/(.{110})/g, '$1\n') + '\n');
    }
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
