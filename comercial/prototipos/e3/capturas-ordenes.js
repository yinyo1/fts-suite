/* ═══ Capturas del prototipo de órdenes, a los CUATRO anchos ═══════════════
 *
 * 380 · 760 · 900 · 1280, que es la regla de CLAUDE.md §20 #20. Los dos de en
 * medio existen porque lo que se rompe está ahí: a 380 entra la media query y
 * a 1280 sobra sitio; entre 721 y 980 una regla ya se apagó y la otra todavía
 * no entra, y en este módulo esa franja se rompió DOS veces seguidas y por
 * cosas distintas.
 *
 * Mide además, en cada ancho y cada estado: campos de ancho CERO, desbordes a
 * la derecha, desborde de la página y errores de consola. Un guion en verde no
 * es una pantalla revisada — las capturas hay que MIRARLAS —, pero estas tres
 * medidas cazan lo que el ojo perdona.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node capturas-ordenes.js [carpeta]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ANCHOS = [380, 760, 900, 1280];
const ESTADOS = [
  { id: 'lista',    que: 'la lista con el filtro anunciado',      fn: async () => {} },
  { id: 'detalle',  que: 'el detalle de una orden con machote',   fn: async (p) => {
      await p.evaluate(() => irDetalle(0)); } },
  { id: 'hoja',     que: 'el machote a media pantalla',           fn: async (p) => {
      await p.evaluate(() => { irDetalle(0); abrirHoja(); }); } },
  { id: 'hoja-min', que: 'el machote minimizado a su barra',      fn: async (p) => {
      await p.evaluate(() => { irDetalle(0); abrirHoja(); alternarMin(null); }); } },
  { id: 'confirmar', que: 'la confirmación, con sus candados',    fn: async (p) => {
      await p.evaluate(() => { irDetalle(4); abrirConfirmar(); }); } },
  { id: 'sin-mach', que: 'una orden SIN machote ligado',          fn: async (p) => {
      await p.evaluate(() => irDetalle(5)); } },
];

const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

(async () => {
  const destino = process.argv[2] || path.join(__dirname, '_capturas');
  fs.mkdirSync(destino, { recursive: true });
  const URL = 'file://' + path.join(__dirname, 'ordenes.html');

  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const problemas = [];
  let n = 0;

  for (const w of ANCHOS) {
    for (const st of ESTADOS) {
      const p = await b.newPage({ viewport: { width: w, height: 1100 } });
      const errs = [];
      p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
      p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLA: ' + m.text()); });

      await p.goto(URL);
      await p.waitForTimeout(160);
      await st.fn(p);
      await p.waitForTimeout(220);

      /* Las tres medidas que el ojo perdona y la regla no. */
      const medida = await p.evaluate((ancho) => {
        const ceros = [], derrames = [];
        document.querySelectorAll('input,select,textarea,button,td,th,.est,.pill,.faceta')
          .forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.height === 0 && r.width === 0) return;            // oculto a propósito
            if (r.width === 0)
              ceros.push((el.tagName + '.' + (el.className || '')).slice(0, 48));
            if (r.right > ancho + 1)
              derrames.push((el.tagName + '.' + (el.className || '')).slice(0, 48) +
                            ' → ' + Math.round(r.right) + 'px');
          });
        return { ceros: ceros.slice(0, 6), derrames: derrames.slice(0, 6),
                 scrollX: document.documentElement.scrollWidth > ancho + 1 };
      }, w);

      const archivo = path.join(destino, w + '-' + st.id + '.png');
      await p.screenshot({ path: archivo, fullPage: true });
      n++;

      if (medida.ceros.length)
        problemas.push(w + 'px · ' + st.id + ' · ancho CERO: ' + medida.ceros.join(' | '));
      if (medida.derrames.length)
        problemas.push(w + 'px · ' + st.id + ' · se derrama: ' + medida.derrames.join(' | '));
      if (medida.scrollX)
        problemas.push(w + 'px · ' + st.id + ' · la PÁGINA desborda a lo ancho');
      if (errs.length)
        problemas.push(w + 'px · ' + st.id + ' · ' + errs.join(' | '));

      await p.close();
    }
  }
  await b.close();

  console.log('\nCapturas en ' + destino + '\n');
  ESTADOS.forEach(s => console.log('  ' + s.id.padEnd(10) + ' (' + s.que + ')'));
  console.log('\n' + n + ' capturas · ' + ANCHOS.join(' · ') + ' px');
  if (problemas.length) {
    console.log('\n' + problemas.length + ' PROBLEMA(S):');
    problemas.forEach(x => console.log('  ✗ ' + x));
    process.exit(1);
  }
  console.log('sin desbordes, sin anchos en cero, sin errores de página.');
  console.log('⚠️ Ahora hay que MIRARLAS: un guion en verde no es una pantalla revisada.');
})();
