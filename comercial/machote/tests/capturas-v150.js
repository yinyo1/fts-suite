/* Capturas del paso 1 CON PUERTA y del buscador de órdenes, a los cuatro
 * anchos, MÁS el censo de callejones del punto C.
 *
 *   node comercial/machote/tests/capturas-v150.js
 *
 * ── QUÉ ES UN CALLEJÓN, PARA PODER CONTARLOS ────────────────────────────────
 * Una pantalla que ENUNCIA un requisito y no ofrece manera de cumplirlo. El
 * censo no lo decide leyendo el código: recorre el flujo con el caso peor —una
 * cotización SIN orden ligada, SIN cliente del catálogo y SIN oportunidad— y
 * en cada pantalla anota (a) el texto, (b) los botones con su estado, y (c) si
 * el texto manda a un sitio. Después se MIRAN las capturas (§20 #12 y #20): el
 * defecto que se busca es justo de los que se leen bien en el diff.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, '_capturas-v150');
const ANCHOS = [380, 760, 900, 1280];
const CAND = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const GEO = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));

/* El machote del CASO PEOR. Lo que se le quita es tan importante como lo que
 * trae: sin `cliente_id` (escrito a mano), sin orden en la libreta, sin
 * oportunidad. Un caso cómodo no encuentra callejones. */
const MACH = (function () {
  const vm = require('vm');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
              fs.readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const c = { window: {}, console }; c.window.window = c.window;
  vm.createContext(c); vm.runInContext(src, c);
  const m = JSON.parse(JSON.stringify(c.window.DEMO.MACHOTES[0]));
  delete m._demo;
  m.id = 'M-9150';
  delete m.cliente_id;                       // escrito a mano, no del catálogo
  m.cliente = 'Cliente Tecleado A Mano';
  return m;
})();

const CAND_ORD = [
  { id: 80000, nombre: 'SO11902', estado: 'sent',
    cliente: 'Industrias Inventadas del Norte y Occidente', total: 12845000.5,
    moneda: 'MXN', fecha: '2026-09-01', ligada: false, ligada_a: null },
  { id: 80001, nombre: 'SO11901', estado: 'sale',
    cliente: 'Manufacturas Ficticias', total: 62400, moneda: 'USD',
    fecha: '2026-09-02', ligada: true, ligada_a: 'COT-0099' }
];

function sembrar(p, cfg) {
  return p.addInitScript((c) => {
    window.__red = [];
    try {
      localStorage.clear();
      localStorage.setItem('fts_suite_session', JSON.stringify({
        token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
        scopes: ['comercial:read', 'comercial:write'],
        exp: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem('fts_machote_v1', JSON.stringify({
        v: 1, guardado_at: new Date().toISOString(), machotes: [c.m], handoff: {} }));
      /* Con identidad del servidor (para que la liga sea posible) pero SIN
       * `odoo_so_id`: ninguna orden ligada, que es el caso reportado. */
      localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
        'M-9150': { machote_id: 'uuid-150', version: 4, folio: 150,
                    folio_txt: 'COT-0150', subido_at: new Date().toISOString(),
                    huella: 'x' } }));
    } catch (e) {}
    const orig = window.fetch;
    window.fetch = function (u, init) {
      const url = String(u);
      if (url.indexOf('geo.json') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve(c.geo) });
      if (url.indexOf('/comercial/') >= 0) {
        let cu = null; try { cu = JSON.parse((init && init.body) || '{}'); } catch (e) {}
        window.__red.push({ url: url, modo: cu && cu.modo });
        const modo = (cu && cu.modo) || 'listar';
        if (url.indexOf('/comercial/ordenes') >= 0) {
          if (modo === 'buscar')
            return Promise.resolve({ ok: true, json: () => Promise.resolve(
              { ok: true, ordenes: c.cand, total: c.cand.length, truncado: false }) });
          if (modo === 'ligar')
            return Promise.resolve({ ok: true, json: () => Promise.resolve(
              { ok: true, modo: 'ligar', liga: { id: 9, machote_id: 'uuid-150',
                odoo_so_id: cu.odoo_so_id, odoo_so_name: cu.odoo_so_name,
                principal: true } }) });
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

/* Lo que se anota de cada pantalla. `accionables` son los botones y enlaces
 * que de verdad se pueden apretar: un botón deshabilitado NO es una puerta. */
const RADIOGRAFIA = (sel) => {
  const raiz = document.querySelector(sel);
  if (!raiz) return null;
  const btns = Array.prototype.slice.call(raiz.querySelectorAll('button, a[href], summary'));
  return {
    texto: (raiz.textContent || '').replace(/\s+/g, ' ').trim(),
    botones: btns.map(b => ({
      t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44),
      off: !!b.disabled
    })),
    accionables: btns.filter(b => !b.disabled).length,
    apagados: btns.filter(b => !!b.disabled).length
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errs = [];
  const censo = [];
  let mal = 0;

  for (const w of ANCHOS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(w + 'px :: ' + e.message));
    await sembrar(p, { m: MACH, geo: GEO, cand: CAND_ORD });
    await p.goto(BASE);
    await p.waitForTimeout(600);

    // ── 1 · paso 1 desde la COTIZACIÓN, sin orden ligada ──────────────────
    await p.evaluate(() => { location.hash = '#/m/M-9150'; });
    await p.waitForTimeout(700);
    await p.evaluate(() => { const b = document.getElementById('btnOrden'); if (b) b.click(); });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/paso1-sin-orden-${w}.png`, fullPage: true });
    const r1 = await p.evaluate(RADIOGRAFIA, '#cfVelo .pu-modal');

    // ── 2 · el buscador de órdenes, con cliente escrito a mano ────────────
    await p.evaluate(() => { const b = document.getElementById('cfLigar'); if (b) b.click(); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/buscar-numero-${w}.png`, fullPage: true });
    const r2 = await p.evaluate(RADIOGRAFIA, '#obVelo .pu-modal');

    // ── 3 · con candidatas en pantalla ────────────────────────────────────
    const r3 = await p.evaluate(async () => {
      const esperar = (ms) => new Promise(r => setTimeout(r, ms));
      const q = document.getElementById('obQ');
      if (q) { q.value = 'SO119'; q.dispatchEvent(new Event('input')); }
      const g = document.getElementById('obGo'); if (g) g.click();
      await esperar(500);
      const rr = document.querySelectorAll('input[name="obO"]');
      if (rr[0]) { rr[0].checked = true; rr[0].dispatchEvent(new Event('change')); }
      await esperar(120);
      const ok = document.getElementById('obOk');
      const caja = document.querySelector('#obVelo .pu-cuerpo');
      const modal = document.querySelector('#obVelo .pu-modal');
      return {
        candidatas: rr.length,
        okVivo: ok ? !ok.disabled : null,
        /* El botón de abajo tiene que quedar DENTRO de la ventana: el paso 3
         * se salió a 790px en un viewport de 780 y sólo la captura lo vio. */
        okAbajo: ok ? Math.round(ok.getBoundingClientRect().bottom) : null,
        alto: window.innerHeight,
        modalAlto: modal ? Math.round(modal.getBoundingClientRect().height) : null,
        cuerpoScroll: caja ? caja.scrollHeight > caja.clientHeight + 1 : null,
        paginaSeMueve: document.documentElement.scrollWidth > window.innerWidth
      };
    });
    await p.screenshot({ path: `${OUT}/buscar-candidatas-${w}.png`, fullPage: true });

    const bien = r1 && r1.accionables >= 2 && r2 && r3.candidatas === 2 &&
                 r3.okVivo === true && !r3.paginaSeMueve &&
                 r3.okAbajo !== null && r3.okAbajo <= r3.alto;
    if (!bien) mal++;
    console.log(`${String(w).padEnd(5)} ${bien ? '✓' : '✗'} ` +
      `paso1: ${r1 ? r1.accionables + ' accionables / ' + r1.apagados + ' apagados' : 'NO ABRIÓ'} · ` +
      `buscador: ${r3.candidatas} candidatas, Ligar ${r3.okVivo ? 'vivo' : 'APAGADO'} · ` +
      `boton abajo ${r3.okAbajo}/${r3.alto} · pagina_se_mueve=${r3.paginaSeMueve}`);
    if (w === 380 && r1) console.log('      botones paso 1: ' +
      r1.botones.map(x => x.t + (x.off ? ' [apagado]' : '')).join(' | '));

    if (w === 1280) {
      censo.push({ pantalla: 'paso 1 · desde la cotización, sin orden ligada', r: r1 });
      censo.push({ pantalla: 'buscador de órdenes · cliente escrito a mano', r: r2 });
    }
    await ctx.close();
  }

  // ── 4 · el CENSO: recorrer el resto del flujo y anotar cada pantalla ─────
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('censo :: ' + e.message));
  await sembrar(p, { m: MACH, geo: GEO, cand: CAND_ORD });
  await p.goto(BASE);
  await p.waitForTimeout(600);

  /* 4a · el checklist, al que se llega ligando. Es donde viven los 17
   *      candados, y donde un mensaje puede mandar a una pantalla que no se
   *      puede abrir — que es el defecto que cazaron las 28 pruebas. */
  await p.evaluate(() => { location.hash = '#/m/M-9150'; });
  await p.waitForTimeout(700);
  const checklist = await p.evaluate(async () => {
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    window.confirm = () => true; window.alert = () => {};
    document.getElementById('btnOrden').click(); await esperar(300);
    document.getElementById('cfLigar').click();  await esperar(450);
    const q = document.getElementById('obQ');
    if (q) { q.value = 'SO119'; q.dispatchEvent(new Event('input')); }
    document.getElementById('obGo').click();     await esperar(500);
    const rr = document.querySelectorAll('input[name="obO"]');
    if (rr[0]) { rr[0].checked = true; rr[0].dispatchEvent(new Event('change')); }
    await esperar(100);
    document.getElementById('obOk').click();     await esperar(900);

    const velo = document.getElementById('puVelo');
    if (!velo || !velo.classList.contains('abierto'))
      return { error: 'no se llegó al checklist' };
    const pu = velo.querySelector('.pu-modal');
    /* ⚠️ La clase es `pu-c`, NO `candado`. La primera versión de este censo
     * preguntó por `.candado` —la palabra con que hablamos de ellos— y contó
     * CERO, que se lee como «el checklist salió vacío». El instrumento estaba
     * ciego, no la pantalla (§20 #19). */
    const cds = Array.prototype.slice.call(pu.querySelectorAll('.pu-c'));
    return {
      abierto: true,
      candados: cds.length,
      /* Cada candado que NO pasa, con su texto: ahí es donde se mira si dice
       * qué hacer y si ese sitio existe. */
      frenan: cds.filter(c => !/pasa/.test(c.className))
        .map(c => ({ cls: c.className.replace('candado', '').trim(),
                     tx: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 190) })),
      botones: Array.prototype.slice.call(pu.querySelectorAll('button')).map(
        x => ({ t: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
                off: !!x.disabled })),
      /* Los mensajes que mandan a otra pantalla: si el sitio no se puede
       * abrir desde donde se lee el mensaje, es un callejón. */
      mandanA: (pu.textContent.match(/Arriba, en [A-ZÁÉÍÓÚ]+|en DATOS|en Datos/g) || [])
    };
  });
  await p.screenshot({ path: `${OUT}/checklist-1280.png`, fullPage: true });

  /* 4b · el otro camino: desde la vista de ÓRDENES, sobre una orden sin
   *      ninguna cotización ligada. */
  const desdeOrden = await p.evaluate(async () => {
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    const cf = document.getElementById('cfVelo'); if (cf) cf.classList.remove('abierto');
    const pv = document.getElementById('puVelo'); if (pv) pv.classList.remove('abierto');
    location.hash = '#/ordenes';
    await esperar(1300);
    /* ⚠️ El botón de confirmar de este camino es `#orConfirmar` y vive en el
     * DETALLE de la orden, no en el renglón de la lista. La primera versión de
     * este censo buscaba cualquier botón cuyo texto dijera «confirmar» y
     * encontró el del checklist —«Confirmar en Odoo — apagado»—, que está
     * deshabilitado: el clic no hizo nada, el diálogo anterior seguía en el
     * DOM (sólo se le había quitado `abierto`) y la radiografía leyó ESE. Salió
     * «desde la cotización» en el camino de la orden y parecía un bug de la
     * aplicación. Era del guion. Por eso ahora: se abre el detalle, se busca el
     * id exacto, y se exige la clase `abierto`, no la mera existencia. */
    const filas = Array.prototype.slice.call(
      document.querySelectorAll('table.or-tab tbody tr'));
    if (!filas.length) return { error: 'la lista de órdenes salió vacía' };
    const liga = filas[0].querySelector('a, .or-num, td:first-child');
    if (liga) liga.click();
    await esperar(700);
    const conf = document.getElementById('orConfirmar');
    if (!conf) return { error: 'no hay #orConfirmar en el detalle de la orden' };
    if (conf.disabled) return { error: '#orConfirmar está DESHABILITADO' };
    conf.click(); await esperar(450);
    const veloC = document.getElementById('cfVelo');
    if (!veloC || !veloC.classList.contains('abierto'))
      return { error: 'el paso 1 no abrió desde la orden' };
    const v = veloC.querySelector('.pu-modal');
    const bs = Array.prototype.slice.call(v.querySelectorAll('button, summary'));
    const res = {
      texto: (v.textContent || '').replace(/\s+/g, ' ').trim(),
      botones: bs.map(x => ({ t: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44),
                              off: !!x.disabled })),
      accionables: bs.filter(x => !x.disabled).length
    };
    const puerta = document.getElementById('cfLigar');
    if (puerta) {
      puerta.click(); await esperar(400);
      const veloL = document.getElementById('lgVelo');
      const lg = (veloL && veloL.classList.contains('abierto'))
        ? veloL.querySelector('.pu-modal') : null;
      res.abreLigar = !!lg;
      res.ligarTexto = lg ? (lg.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) : null;
      res.ligarAccionables = lg ? Array.prototype.slice.call(lg.querySelectorAll('button'))
        .filter(x => !x.disabled).length : 0;
    }
    return res;
  });
  await p.screenshot({ path: `${OUT}/paso1-desde-orden-1280.png`, fullPage: true });
  await ctx.close();
  await b.close();

  console.log('\n══ CENSO · qué dice cada pantalla y qué se puede apretar ══════════');
  censo.forEach(c => {
    console.log('\n▸ ' + c.pantalla);
    if (!c.r) { console.log('  NO ABRIÓ'); return; }
    console.log('  accionables: ' + c.r.accionables + ' · apagados: ' + c.r.apagados);
    console.log('  botones: ' + c.r.botones.map(x => x.t + (x.off ? ' [apagado]' : '')).join(' | '));
    console.log('  texto: ' + c.r.texto.slice(0, 300));
  });

  console.log('\n▸ checklist (paso 2), al que se llega ligando');
  console.log('  ' + JSON.stringify(checklist.error || {
    candados: checklist.candados, frenan: checklist.frenan.length,
    mandanA: checklist.mandanA,
    botones: checklist.botones.map(x => x.t + (x.off ? ' [apagado]' : ''))
  }));
  if (checklist.frenan) checklist.frenan.forEach(f =>
    console.log('   · [' + f.cls + '] ' + f.tx));

  console.log('\n▸ paso 1 · desde la ORDEN, sin cotización ligada');
  console.log('  ' + JSON.stringify(desdeOrden.error || {
    accionables: desdeOrden.accionables,
    botones: desdeOrden.botones.map(x => x.t + (x.off ? ' [apagado]' : '')),
    abreLigar: desdeOrden.abreLigar, ligarAccionables: desdeOrden.ligarAccionables
  }));
  if (desdeOrden.texto) console.log('  texto: ' + desdeOrden.texto.slice(0, 300));
  if (desdeOrden.ligarTexto) console.log('  ligar: ' + desdeOrden.ligarTexto);

  if (errs.length) { console.log('\n!! pageerror:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  if (mal) { console.log('\n' + mal + ' ancho(s) mal'); process.exit(1); }
  console.log('\ncapturas en ' + OUT + ' · sin pageerror');
})();
