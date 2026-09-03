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
// Esquema de versión: V<mayor>.<menor de dos dígitos>, +0.01 por merge a main; al pasar de
// .99 sube el mayor y el menor vuelve a 00. Igual que comercial/machote.
const VER = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'finanzas', 'version.json'), 'utf8'));
let pass = 0; const fails = []; let vp = '';
function check(n, c, d) { if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : '')); console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : '')); return false; }

// Errores del ENTORNO (fuentes bloqueadas por el proxy) se separan, no se callan.
const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|fonts\.googleapis|fonts\.gstatic|net::ERR/.test(t);

(async () => {
  console.log('Chromium: ' + (EXE || '(default)'));
  vp = 'version';
  check('el formato de versión es V<mayor>.<menor de dos dígitos> (' + VER.version + ')',
    /^V\d+\.\d{2}$/.test(VER.version), VER.version);
  check('el menor no pasa de 99',
    (/^V\d+\.(\d{2})$/.exec(VER.version) || [])[1] <= '99', VER.version);
  check('version.json lleva el esquema escrito y su historial',
    !!VER.esquema && Array.isArray(VER.historial) && VER.historial.length > 0 &&
    VER.historial[0].version === VER.version,
    'esquema=' + !!VER.esquema + ' historial[0]=' + JSON.stringify(VER.historial && VER.historial[0]));

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
    // La versión en pantalla tiene que ser la de version.json. Separadas, la pantalla miente
    // sobre qué build estás viendo — que es exactamente para lo que sirve el badge.
    check('el badge coincide con finanzas/version.json (' + VER.version + ')',
      medidas.badge && medidas.badge.texto === VER.version,
      'pantalla "' + (medidas.badge && medidas.badge.texto) + '" vs archivo "' + VER.version + '"');

    // Las filas nuevas no deben ser mucho más altas que las demás (= texto envolviendo feo).
    // Tope ajustado tras la revisión visual: la versión larga de Desconciliada medía 110 px
    // contra una mediana de 80. Con un tope generoso (mediana×2) pasaba. Ahora no.
    // Solo en anchos donde la tabla ES una tabla: bajo 700 px cada fila es una tarjeta y su
    // alto no mide envoltura de texto, mide cuántos campos traía la línea.
    if (dev.w > 700) {
      const tope = medidas.altoFilaMediana + 24;
      check('la fila Desconciliada no se dispara de alto (' + medidas.altoFilaDesc + 'px vs mediana ' + medidas.altoFilaMediana + 'px)',
        medidas.altoFilaDesc > 0 && medidas.altoFilaDesc <= tope, 'tope ' + tope);
      check('la fila Fondeo no se dispara de alto (' + medidas.altoFilaFon + 'px vs mediana ' + medidas.altoFilaMediana + 'px)',
        medidas.altoFilaFon > 0 && medidas.altoFilaFon <= tope, 'tope ' + tope);
    }

    // ── Semáforo: contraste y apilado ────────────────────────────────────────────────
    // El semáforo vive dentro de .sem, que es el contenedor OSCURO y declara color:#dfe6ec.
    // Cuando una tarjeta blanca hereda ese color queda a 1.26:1 (WCAG AA pide 4.5:1) y el
    // texto se vuelve casi invisible: fue el reporte de Esteban "blancos con letras grises,
    // casi no se ve". Se mide compuesto sobre los fondos de los ancestros — sin eso, un chip
    // con background rgba(...,.10) se mide como si fuera sólido y da un falso 1:1.
    const sem = await p.evaluate(() => {
      const num = c => (String(c).match(/[\d.]+/g) || []).map(Number);
      const componer = (color, sobre) => { const m = num(color); if (m.length < 3) return sobre;
        const a = m.length > 3 ? m[3] : 1, b = num(sobre);
        return 'rgb(' + [0,1,2].map(i => Math.round(m[i]*a + b[i]*(1-a))).join(',') + ')'; };
      const fondo = el => { const pila = []; let e = el;
        while (e) { const bg = getComputedStyle(e).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') pila.push(bg); e = e.parentElement; }
        let acc = 'rgb(255,255,255)';
        for (let i = pila.length - 1; i >= 0; i--) acc = componer(pila[i], acc); return acc; };
      const lum = rgb => { const m = num(rgb); if (m.length < 3) return null;
        const f = m.slice(0,3).map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
        return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
      const host = document.querySelector('#ip-semrows');
      const raiz = host ? host.parentElement : null;
      const peores = [];
      if (raiz) raiz.querySelectorAll('*').forEach(el => {
        const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (!t || t.length < 3) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const bg = fondo(el), fg = componer(cs.color, bg);
        const L1 = lum(fg), L2 = lum(bg); if (L1 == null || L2 == null) return;
        const r = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
        const px = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight,10)||400) >= 700;
        const min = (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5;
        if (r < min) peores.push({ txt: t.slice(0,36), ratio: Math.round(r*100)/100, min, px });
      });
      // Apilado: los paneles del semáforo van uno debajo de otro (antes eran una rejilla de 3
      // columnas de igual alto, que estiraba dos <details> colapsados ~450 px en blanco).
      const paneles = [...(host ? host.children : [])].map(el => Math.round(el.getBoundingClientRect().width));
      const anchoHost = host ? Math.round(host.getBoundingClientRect().width) : 0;
      return { peores, nMedidos: raiz ? raiz.querySelectorAll('*').length : 0, paneles, anchoHost };
    });
    check('todo el texto del semáforo pasa WCAG AA', sem.peores.length === 0,
      sem.peores.slice(0,4).map(x => x.ratio + ':1 (min ' + x.min + ') «' + x.txt + '»').join(' | '));
    // Las TRES fuentes con el mismo formato (V1.02): foco, barra y porcentaje, también las que
    // el motor no evalúa. Antes las sin-motor se pintaban sin barra ni número.
    const cards = await p.evaluate(() => [...document.querySelectorAll('#ip-semrows .s2card')].map(c => ({
      titulo: (c.querySelector('.s2ct') || {}).textContent || '',
      foco: !!c.querySelector('.light'),
      barra: !!c.querySelector('.bar i'),
      pct: /\d+(\.\d+)?%/.test((c.querySelector('.s2cn') || {}).textContent || '')
    })));
    check('las 3 fuentes traen foco, barra y porcentaje (' + cards.length + ' tarjetas)',
      cards.length === 3 && cards.every(c => c.foco && c.barra && c.pct), JSON.stringify(cards));
    check('la leyenda ya no dice que las fuentes sin motor no llevan porcentaje',
      ((await p.locator('.semnote').textContent().catch(() => '')) || '').indexOf('no llevan porcentaje') < 0);
    check('los paneles del semáforo van apilados a todo el ancho',
      sem.paneles.length > 0 && sem.paneles.every(w => w >= sem.anchoHost - 2),
      'anchos ' + JSON.stringify(sem.paneles) + ' vs host ' + sem.anchoHost);

    // ── Operabilidad en celular ──────────────────────────────────────────────────────
    // Medido antes del cambio: 12 columnas dentro de 324 px con scrollWidth == clientWidth.
    // La tabla no se desbordaba para poder deslizarla: se comprimía, y la columna de estado
    // —la única que dice qué hacer— quedaba fuera sin scroll al que llegar.
    if (dev.w <= 700) {
      const mob = await p.evaluate(() => {
        const tr = document.querySelector('#ip-tblwrap tbody tr');
        const td = tr ? tr.querySelector('td:not(.chk)') : null;
        const chicos = [];
        document.querySelectorAll('.ip-view .ip-filters input, .ip-view .ip-filters select, .ip-view .ip-toolbar button')
          .forEach(el => { const r = el.getBoundingClientRect();
            if (r.height > 0 && r.height < 40) chicos.push((el.id || el.tagName) + ':' + Math.round(r.height)); });
        return {
          theadOculto: getComputedStyle(document.querySelector('#ip-tblwrap thead')).display === 'none',
          celdaEnBloque: td ? getComputedStyle(td).display === 'flex' : false,
          etiqueta: td ? (td.getAttribute('data-lbl') || '') : '',
          anchoFila: tr ? Math.round(tr.getBoundingClientRect().width) : 0,
          chicos: chicos
        };
      });
      check('la tabla se convierte en tarjetas (thead oculto)', mob.theadOculto);
      check('cada celda lleva su etiqueta («' + mob.etiqueta + '»)', mob.celdaEnBloque && !!mob.etiqueta, JSON.stringify(mob));
      check('los controles llegan a 40 px de alto táctil', mob.chicos.length === 0, mob.chicos.join(', '));
    }

    // ── NO_SUSPENSE_UNICA sobre una línea de FTS-USA ────────────────────────────────
    // El server responde «línea ya parcialmente desenredada», y sobre una línea de FTS-USA eso
    // es FALSO: comprobado en Odoo el 2026-09-03 que la 33235 tiene exactamente una pata de
    // suspense, intacta, en la 309. El guard cuenta filtrando por la 184 (FTS-MX), encuentra 0,
    // y culpa a la línea. El panel no debe repetir esa acusación.
    if (dev.w > 700) {
      const fila = await p.evaluate(() => {
        const tr = [...document.querySelectorAll('#ip-tblwrap tbody tr')]
          .find(t => t.textContent.indexOf('DLO*UBER') >= 0);
        const b = tr ? tr.querySelector('button[data-expand]') : null;
        if (b) b.click();
        return !!b;
      });
      if (check('la línea de Chase se puede desplegar', fila)) {
        await p.waitForSelector('button[data-conc]', { timeout: 5000 }).catch(() => {});
        await p.evaluate(() => { const b = document.querySelector('button[data-conc]'); if (b) b.click(); });
        await p.waitForTimeout(400);
        const txt = (await p.locator('.ip-res.bad').first().textContent().catch(() => '')) || '';
        console.log('   guard: ' + txt.replace(/\s+/g, ' ').trim().slice(0, 150));
        // Desde el fix de P1 el server dice en qué cuenta buscó y cuántas encontró, y eso es más
        // preciso que cualquier texto del panel: se pasa tal cual.
        check('el guard nombra la cuenta de suspense que el motor miró (309)',
          txt.indexOf('309') >= 0, txt.slice(0, 140));
        check('el guard dice cuántas patas encontró', /se encontraron 0/i.test(txt), txt.slice(0, 140));
        // Si el panel cayera al genérico, estaría tirando el detalle del server a la basura.
        check('el guard NO cae al mensaje genérico',
          txt.indexOf('No se pudo conciliar') < 0, txt.slice(0, 140));
        check('el guard deja ver el código técnico', txt.indexOf('NO_SUSPENSE_UNICA') >= 0, txt.slice(0, 120));
        await p.evaluate(() => { const b = document.querySelector('button[data-expand]'); if (b) b.click(); });
        await p.waitForTimeout(200);
      }
    }

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
