#!/usr/bin/env node
/* Capturas del prototipo a 380/900/1280 + comprobaciones básicas (sin scroll horizontal, sin pageerror, paridad de medidas con cz-medidas.json). */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const HTML = process.argv[2], OUT = process.argv[3], MED = JSON.parse(fs.readFileSync(path.join(OUT, 'cz-medidas.json'), 'utf8'));
let fallas = 0; const ok = (n, c, x) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c || x === undefined ? '' : '  ' + JSON.stringify(x).slice(0, 300))); if (!c) fallas++; };
(async () => {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errores = [];
  for (const p of ['cz', 'mkt']) for (const w of [380, 900, 1280]) {
    const pg = await nav.newPage({ viewport: { width: w, height: w < 900 ? 820 : 860 } });
    pg.on('pageerror', e => errores.push(p + w + ' ' + e.message));
    await pg.goto('file://' + HTML + '?p=' + p + '&abrir=1&limpio=1'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { const m = document.querySelector('.chn-msgs'); m.scrollTop = m.scrollHeight; }); await pg.waitForTimeout(200);
    const sc = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(p + ' ' + w + ' px sin scroll horizontal', sc <= 0, sc);
    await pg.screenshot({ path: path.join(OUT, 'nucleo-' + p + '-' + w + '.png') });
    if (p === 'cz' && w === 380) {
      const m = await pg.evaluate(() => { const g = (s, k) => { const e = document.querySelector(s); const c = getComputedStyle(e), o = {}; k.forEach(x => o[x] = c[x]); o.h = e.getBoundingClientRect().height; return o; };
        return { cab: g('.chn-cc', ['backgroundColor', 'borderBottomColor']), msgs: g('.chn-msgs', ['backgroundColor', 'backgroundImage', 'backgroundSize']),
          yo: g('.chn-fila.sig .chn-b.yo', ['backgroundColor', 'borderRadius', 'boxShadow', 'fontSize', 'paddingTop', 'paddingLeft']), caja: g('.chn-caja', ['backgroundColor', 'borderRadius', 'boxShadow']),
          redondo: g('.chn-redondo', ['backgroundColor', 'width']), body: g('.chn', ['fontFamily']) }; });
      for (const [k, v] of Object.entries(m)) for (const [kk, vv] of Object.entries(v)) if (kk !== 'h' || k === 'cab' || k === 'caja' || k === 'redondo')
        ok('paridad ' + k + '.' + kk + ' = conceptualizador', String(MED[k][kk]) === String(vv), { cz: MED[k][kk], nucleo: vv });
    }
    await pg.close();
  }
  // la lista sola a 380 y la escena de comparar
  const pg = await nav.newPage({ viewport: { width: 380, height: 820 } });
  for (const p of ['cz', 'mkt']) { await pg.goto('file://' + HTML + '?p=' + p + '&limpio=1'); await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(OUT, 'nucleo-' + p + '-380-lista.png') }); }
  ok('sin pageerror', !errores.length, errores);
  await nav.close(); console.log(fallas ? 'FALLAS: ' + fallas : 'TODO VERDE'); process.exit(fallas ? 1 : 0);
})();
