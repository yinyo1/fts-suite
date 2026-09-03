// ═══ Revisión visual — Finanzas · Instrumentos de pago (Bancos) ═══
//
// POR QUÉ. El gate de jsdom (tests/gate-instrumentos-pago.js) prueba lógica y estructura
// del DOM, pero no píxeles: no ve si un texto envuelve en cuatro renglones, si un dato
// existe pero mide 0 px de ancho, o si la página desborda en celular. Esas cosas solo
// salen mirando. Este script las mira en un Chromium real, sin servidor y sin red.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`,
// cdn.playwright.dev está fuera de la lista blanca del proxy):
//   npm i playwright@1.62.1      ← fijar la versión; el prerelease no habla con Chromium 141
//   NODE_PATH=<dir>/node_modules node tests/visual-bancos.js
//   SHOTS_DIR=/ruta node tests/visual-bancos.js    ← para elegir dónde caen las capturas
//
// LO QUE ENCONTRÓ LA PRIMERA VEZ (2026-09-03): la celda "Desconciliada" ocupaba 4 renglones
// (110 px) contra los 2-3 de sus vecinas. El gate de jsdom la daba por buena. Por eso el
// tope de altura de fila es mediana+24 y no algo generoso: ahí es donde estaba el defecto.
//
// NOTA DE ENTORNO: las fuentes de Google están bloqueadas por el proxy, así que el navegador
// cae a una tipografía de respaldo MÁS ANCHA que IBM Plex. Un texto que aquí no envuelve,
// en producción tampoco — la comparación va del lado conservador.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const HARNESS = 'file://' + (path.resolve(__dirname, 'visual-harness-bancos.html'));
const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-bancos';
fs.mkdirSync(OUT, { recursive: true });

// Desbordar la página está PROHIBIDO. Hasta v0.5.35 esto valía 102/262/902 px porque
// .main (item de grid) no podía encogerse; se arregló con .main{min-width:0} y la tabla
// pasó a scrollear dentro de su propia caja. Cero significa cero: si vuelve a desbordar,
// el badge de versión se sale de la pantalla otra vez.
const BASE_DESBORDE = { 'desktop-1440': 0, 'laptop-1280': 0, 'movil-390': 0 };
let pass = 0; const fails = []; let vp = '';
function check(n, c, d) { if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : '')); console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : '')); return false; }

// Errores del ENTORNO (fuentes bloqueadas por el proxy) se separan, no se callan.
const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|fonts\.googleapis|fonts\.gstatic|net::ERR/.test(t);

(async () => {
  console.log('Chromium: ' + (EXE || '(default)'));
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});

  for (const dev of [{ n: 'desktop-1440', w: 1440, h: 900 }, { n: 'laptop-1280', w: 1280, h: 800 }, { n: 'movil-390', w: 390, h: 844 }]) {
    vp = dev.n;
    const ctx = await b.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [], delEntorno = [];
    p.on('console', m => { if (m.type() !== 'error') return; (esDelEntorno(m.text()) ? delEntorno : errs).push(m.text()); });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));

    await p.goto(HARNESS, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#ip-tblwrap table tbody tr', { timeout: 15000 });
    await p.waitForFunction(() => document.body.innerHTML.indexOf('BILL3345') >= 0, null, { timeout: 15000 });
    await p.waitForTimeout(300);

    check('sin errores de consola propios (' + delEntorno.length + ' del entorno, filtrados)', errs.length === 0, errs.slice(0, 3).join(' | '));

    // ── Lo que dice la barra de agregados: tiene que VERSE y no estar en ceros ──
    const aggs = (await p.locator('#ip-aggs').textContent().catch(() => '')) || '';
    console.log('   barra: ' + aggs.replace(/\s+/g, ' ').trim());
    check('la barra no dice "0 conciliadas"', aggs.indexOf('0 conciliadas') < 0, aggs);
    check('la barra no dice residual $0.00', aggs.indexOf('residual $0.00') < 0, aggs);

    const chips = (await p.locator('#ip-chips').textContent().catch(() => '')) || '';
    console.log('   chips: ' + chips.replace(/\s+/g, ' ').trim());

    // ── El bug que más importa: que un dato exista pero mida 0 px ──
    const medidas = await p.evaluate(() => {
      const out = {};
      const vis = el => { if (!el) return null; const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height),
          visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }; };
      const buscaCelda = txt => [...document.querySelectorAll('#ip-tblwrap td')].find(td => td.textContent.indexOf(txt) >= 0) || null;
      out.desconciliada = vis(buscaCelda('Desconciliada'));
      out.devolucion    = vis(buscaCelda('↩ Devolución'));
      out.fondeo        = vis(buscaCelda('⊕ Fondeo'));
      out.parcial       = vis(buscaCelda('Conciliada parcial'));
      out.aggs          = vis(document.querySelector('#ip-aggs'));
      out.chips         = vis(document.querySelector('#ip-chips'));
      // altura de una fila normal, para comparar contra las nuevas
      const filas = [...document.querySelectorAll('#ip-tblwrap tbody tr')];
      out.altoFilaMediana = filas.length ? Math.round(filas.map(t => t.getBoundingClientRect().height).sort((a, b) => a - b)[Math.floor(filas.length / 2)]) : 0;
      const cd = buscaCelda('Desconciliada'); out.altoFilaDesc = cd ? Math.round(cd.closest('tr').getBoundingClientRect().height) : 0;
      const cf = buscaCelda('⊕ Fondeo');     out.altoFilaFon  = cf ? Math.round(cf.closest('tr').getBoundingClientRect().height) : 0;
      out.desbordeH = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      // El badge de versión es el elemento con el que se verifica que un deploy quedó
      // (CLAUDE.md §8). Medir que "existe" no basta: existía, medía 60x22 px y estaba
      // FUERA de la pantalla. Lo que importa es que caiga dentro del viewport.
      const _v = document.querySelector('.ip-ver');
      if (_v) { const _b = _v.getBoundingClientRect(); const _W = document.documentElement.clientWidth;
        out.badge = { texto: _v.textContent.trim(), right: Math.round(_b.right), w: Math.round(_b.width),
                      dentro: _b.right <= _W + 1 && _b.left >= -1 }; }
      else out.badge = null;
      out.nChips = document.querySelectorAll('#ip-chips .ip-chip').length;
      return out;
    });
    console.log('   medidas: ' + JSON.stringify(medidas));

    check('la celda Desconciliada se ve (ancho > 0)', medidas.desconciliada && medidas.desconciliada.visible, JSON.stringify(medidas.desconciliada));
    check('la celda Devolución se ve', medidas.devolucion && medidas.devolucion.visible, JSON.stringify(medidas.devolucion));
    check('la celda Fondeo se ve', medidas.fondeo && medidas.fondeo.visible, JSON.stringify(medidas.fondeo));
    check('la barra de agregados se ve', medidas.aggs && medidas.aggs.visible, JSON.stringify(medidas.aggs));
    check('los chips se ven y aparecieron los 2 nuevos (7 en total)', medidas.chips && medidas.chips.visible && medidas.nChips === 7, 'nChips=' + medidas.nChips);
    check('la página NO desborda horizontalmente', medidas.desbordeH <= BASE_DESBORDE[dev.n], 'desborde ' + medidas.desbordeH + 'px (tope ' + BASE_DESBORDE[dev.n] + ')');
    check('el badge de versión está DENTRO de la pantalla (' + (medidas.badge && medidas.badge.texto) + ')',
      medidas.badge && medidas.badge.dentro && medidas.badge.w > 0, JSON.stringify(medidas.badge));

    // Las filas nuevas no deben ser mucho más altas que las demás (= texto envolviendo feo).
    // Tope ajustado tras la revisión visual: la versión larga de Desconciliada medía 110 px
    // contra una mediana de 80. Con un tope generoso (mediana×2) pasaba. Ahora no.
    const tope = medidas.altoFilaMediana + 24;
    check('la fila Desconciliada no se dispara de alto (' + medidas.altoFilaDesc + 'px vs mediana ' + medidas.altoFilaMediana + 'px)',
      medidas.altoFilaDesc > 0 && medidas.altoFilaDesc <= tope, 'tope ' + tope);
    check('la fila Fondeo no se dispara de alto (' + medidas.altoFilaFon + 'px vs mediana ' + medidas.altoFilaMediana + 'px)',
      medidas.altoFilaFon > 0 && medidas.altoFilaFon <= tope, 'tope ' + tope);

    // Capturas SIN fullPage: lo que se ve de verdad.
    await p.screenshot({ path: path.join(OUT, dev.n + '-1-arriba.png') });
    await p.evaluate(() => { const t = document.querySelector('#ip-tblwrap'); if (t) t.scrollIntoView({ block: 'start' }); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, dev.n + '-2-tabla.png') });
    if (dev.n === 'desktop-1440') {
      await p.screenshot({ path: path.join(OUT, dev.n + '-3-completa.png'), fullPage: true });
    }
    await ctx.close();
  }
  await b.close();

  console.log('\n─── Revisión visual ───');
  console.log('   ' + pass + '/' + (pass + fails.length) + ' checks');
  if (fails.length) { console.log('\n   FALLOS:'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
  console.log('   ✓ verde\n');
  process.exit(0);
})().catch(e => { console.log('EXPLOTÓ: ' + (e && e.stack || e)); process.exit(2); });
