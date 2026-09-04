// ═══ Revisión visual — RH · Nómina · Incidencias ═══
//
// POR QUÉ. El gate de jsdom (tests/gate-nomina.js) prueba lógica y estructura del DOM,
// pero no píxeles: no ve si la tabla desborda en celular, si el cajón de captura tapa
// su propio botón, o si una celda existe midiendo 0 px. Eso solo sale mirando.
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`,
// cdn.playwright.dev está fuera de la lista blanca del proxy):
//   npm i playwright@1.62.1
//   node tests/visual-nomina.js
//   SHOTS_DIR=/ruta node tests/visual-nomina.js     ← dónde caen las capturas
//
// CÓMO ENTRA SIN LOGIN. No se stubbea nada: se siembra en localStorage una sesión con
// fecha futura y el scope, que es exactamente lo que el código real lee. Así se ejercita
// la puerta de verdad en vez de saltársela con un hook de prueba metido en producción.
//
// NOTA DE ENTORNO: las fuentes de Google están bloqueadas por el proxy, así que el
// navegador cae a una tipografía de respaldo MÁS ANCHA. Un texto que aquí no envuelve,
// en producción tampoco — la comparación va del lado conservador.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-nomina';
fs.mkdirSync(OUT, { recursive: true });

const VER = JSON.parse(fs.readFileSync(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'version.json'), 'utf8'));

let pass = 0; const fails = []; let vp = '';
function check(n, c, d) {
  if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : ''));
  console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : ''));
  return false;
}

// Servidor estático mínimo: el módulo se carga por http, no por file://, porque en
// origen opaco el localStorage se comporta distinto y la puerta no se podría probar.
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|fonts\.googleapis|fonts\.gstatic|net::ERR/.test(t);

const VIEWPORTS = [
  ['desktop-1440', 1440, 900],
  ['laptop-1280', 1280, 800],
  ['movil-390', 390, 844]
];

(async () => {
  console.log('Chromium: ' + (EXE || '(default)'));
  vp = 'version';
  check('el formato de versión es V<mayor>.<menor de dos dígitos> (' + VER.version + ')', /^V\d+\.\d{2}$/.test(VER.version), VER.version);
  check('el menor no pasa de 99', (/^V\d+\.(\d{2})$/.exec(VER.version) || [])[1] <= '99', VER.version);
  check('version.json trae esquema e historial', !!VER.esquema && Array.isArray(VER.historial) && VER.historial.length > 0);

  // El badge del HTML es el valor que se VE si el fetch de version.json no contesta
  // (file://, Pages cacheando, red caída). Si se queda atrasado, la pantalla jura que
  // el código es viejo cuando no lo es — un falso negativo justo en el momento en que
  // alguien está verificando que su cambio quedó desplegado. Se bumpean los dos juntos.
  {
    const htmlBadge = (/id="ver-badge"[^>]*>([^<]*)</.exec(
      require('fs').readFileSync(require('path').join(
        __dirname, '..', 'modulos', 'rh', 'nomina-incidencias', 'index.html'), 'utf8')) || [])[1];
    check('el badge del HTML no se quedó atrás de version.json',
      htmlBadge === VER.version, 'html=' + htmlBadge + ' · json=' + VER.version);
  }

  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/nomina-incidencias/index.html';
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

  for (const [nombre, w, h] of VIEWPORTS) {
    vp = nombre;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const errores = [];
    ctx.on('weberror', e => errores.push(String(e.error())));

    // Sesión sembrada: fecha futura + el scope. Es lo que el código real lee.
    // El init script corre en TODO documento, `about:blank` incluido, donde localStorage
    // es de origen opaco y lanza. Se envuelve para que el error del harness no se cuele
    // en el conteo de errores del módulo — que es lo que esta prueba mide.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'x.y.z', expires_at: new Date(Date.now() + 3600e3).toISOString(),
          user: 'ana', nombre: 'Ana Laura Acevedo', scopes: ['nomina:write']
        }));
        localStorage.setItem('fts_nomina_modo', 'demo');
      } catch (e) { /* about:blank: no hay dónde sembrar, y no hace falta */ }
    });

    const page = await ctx.newPage();
    const consola = [];
    page.on('console', m => { if (m.type() === 'error') consola.push(m.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });

    // ── Pantalla 0: la lista de semanas ──────────────────────────────────────
    // El módulo abre aquí, no en una semana: la que toca cerrar casi nunca es la que
    // contiene hoy (la nómina corre VIE→JUE). Se revisa que la lista se vea bien en
    // este ancho ANTES de entrar, porque es la primera pantalla que ve RH.
    await page.waitForSelector('#indice-lista [data-sem]', { timeout: 8000 });
    const desbordeIdx = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check('la lista de semanas no desborda a lo ancho', desbordeIdx === 0, desbordeIdx + ' px');

    const semanas = await page.$$('#indice-lista [data-sem]');
    check('la lista pinta las semanas disponibles', semanas.length === 3, String(semanas.length));

    // Cada renglón tiene que ser clicable de verdad: alto suficiente y dentro del ancho.
    const cajas = [];
    for (const s of semanas) cajas.push(await s.boundingBox());
    check('cada semana es un blanco clicable (≥44 px de alto)',
      cajas.every(b => b && b.height >= 44), JSON.stringify(cajas.map(b => b && Math.round(b.height))));
    check('ningún renglón de semana se sale del ancho',
      cajas.every(b => b && b.x >= 0 && b.x + b.width <= w + 1),
      JSON.stringify(cajas.map(b => b && Math.round(b.x + b.width))));

    check('la semana que toca se distingue por color, no solo por texto',
      await page.evaluate(() => {
        const s = document.querySelector('#indice-lista .sem.sug');
        if (!s) return false;
        const otra = document.querySelector('#indice-lista .sem:not(.sug)');
        return !!otra && getComputedStyle(s).borderColor !== getComputedStyle(otra).borderColor;
      }));
    check('la pantalla dice por qué no abre en la semana de hoy',
      /viernes a jueves/.test(await page.textContent('#indice-aviso')));

    await page.screenshot({ path: path.join(OUT, nombre + '-0-semanas.png'), fullPage: true });

    // Se entra a la semana que toca, y de ahí siguen las pruebas del roster.
    await page.click('#indice-lista [data-sem="S36/2026"]');
    await page.waitForSelector('#tb tr[data-id]', { timeout: 8000 });
    check('al elegir una semana se entra a ella',
      await page.isVisible('#semana-id') && (await page.textContent('#semana-id')) === 'S36/2026');
    check('el botón de volver a la lista es visible', await page.isVisible('#volver'));

    // ── Desbordar la página está PROHIBIDO. Cero significa cero. ──
    const desborde = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check('la página no desborda a lo ancho', desborde === 0, desborde + ' px');

    const filas = await page.$$('#tb tr[data-id]');
    check('el roster pinta 31 renglones', filas.length === 31, String(filas.length));

    // El badge de versión tiene que caer DENTRO de la pantalla: medir que existe no basta
    // (v0.5.36 de finanzas: existía, medía 60x22 y estaba fuera del viewport).
    const badge = await page.$('#ver-badge');
    const bb = await badge.boundingBox();
    check('el badge de versión está dentro del viewport',
      bb && bb.x >= 0 && bb.x + bb.width <= w + 1, bb ? JSON.stringify(bb) : 'sin caja');
    check('el badge dice la versión del archivo', (await badge.textContent()).trim() === VER.version);

    // Ninguna celda con texto puede medir 0 px de ancho.
    const celdasCero = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('#tb td').forEach(td => {
        if (td.textContent.trim() && td.getBoundingClientRect().width === 0) n++;
      });
      return n;
    });
    check('ninguna celda con texto mide 0 px', celdasCero === 0, String(celdasCero));

    // Alturas de fila parejas: una celda que envuelve de más se delata contra la mediana.
    // Se miden SÓLO las filas sin motivo. Una fila en rojo es legítimamente más alta
    // porque carga el motivo del bloqueo — medirla contra la mediana castigaría a la
    // fila por decir algo, que es justo lo que queremos que haga.
    const alturas = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#tb tr'))
        .filter(tr => !tr.querySelector('.porque'))
        .map(tr => Math.round(tr.getBoundingClientRect().height)));
    const orden = alturas.slice().sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    // El tope es proporcional, no un delta fijo. Hay puestos genuinamente largos
    // ("Sr Technical Sales & Engineering support") que en 390 px envuelven a tres
    // líneas, y eso es texto largo, no layout roto. Lo que esta prueba tiene que
    // cazar es una celda que se dispara —el doble de alto, una imagen sin tamaño,
    // una tabla que se sale—, no una fila que dice más porque tiene más que decir.
    const tope = Math.round(mediana * 1.6);
    const altas = await page.evaluate((t) =>
      Array.from(document.querySelectorAll('#tb tr[data-id]'))
        .filter(tr => !tr.querySelector('.porque') && tr.getBoundingClientRect().height > t)
        .map(tr => tr.querySelector('.nm').textContent.trim() + ' (' + Math.round(tr.getBoundingClientRect().height) + 'px)'), tope);
    check('ninguna fila sin motivo se dispara de alto (mediana ' + mediana + ', tope ' + tope + ' px)',
      altas.length === 0, JSON.stringify(altas));

    // Y la que SÍ trae motivo tampoco puede desbordarse: más de tres renglones de
    // texto rojo en un móvil deja de ser una pista y se vuelve un párrafo.
    const conMotivo = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#tb tr'))
        .filter(tr => tr.querySelector('.porque'))
        .map(tr => Math.round(tr.getBoundingClientRect().height)));
    check('la fila con motivo crece, pero con tope', conMotivo.every(x => x <= mediana + 110),
      JSON.stringify(conMotivo) + ' vs mediana ' + mediana);

    // El banner de bloqueo tiene que ser visible sin scroll horizontal y decir el motivo.
    const banner = (await page.textContent('#banner')).trim();
    check('el banner explica por qué no se puede enviar', /No se puede enviar/.test(banner) && /sin proyecto asignado/.test(banner), banner.slice(0, 100));
    check('el botón de enviar está apagado', await page.isDisabled('#enviar'));

    await page.screenshot({ path: path.join(OUT, nombre + '-1-roster.png'), fullPage: true });

    // ── Interacción: abrir a Samuel (bono sin proyecto) ──
    await page.click('#tb tr[data-id="57"]');
    await page.waitForSelector('#drawer[open]');
    const dbox = await (await page.$('.dpanel')).boundingBox();
    check('el cajón cabe en la pantalla', dbox && dbox.width <= w + 1 && dbox.x >= -1, dbox ? JSON.stringify(dbox) : 'sin caja');
    check('el botón Listo del cajón es visible', await page.isVisible('#dcerrar'));
    check('el cajón muestra el candado aritmético', /Candado aritmético/.test(await page.textContent('#dbody')));
    await page.screenshot({ path: path.join(OUT, nombre + '-2-cajon.png') });

    // Agregar una declaración de verdad, desde la interfaz.
    await page.click('#addDecl');
    await page.waitForSelector('#ntipo');
    await page.selectOption('#ntipo', 'anticipo_sueldo');
    await page.waitForSelector('#c_monto');
    check('el aviso de "es préstamo, no costo" aparece al elegir anticipo',
      /préstamo/.test(await page.textContent('#ncampos')), (await page.textContent('#ncampos')).slice(0, 80));
    await page.fill('#c_monto', '3500');
    await page.fill('#c_plazo', '4');
    await page.selectOption('#c_fuente', 'J122');
    check('elegir Chase deriva FTS LLC y USD a la vista',
      /FTS LLC/.test(await page.textContent('#derv')) && /USD/.test(await page.textContent('#derv')),
      await page.textContent('#derv'));
    await page.click('#nok');
    await page.waitForTimeout(80);
    check('la declaración nueva aparece en el cajón', /Anticipo de sueldo/.test(await page.textContent('#dbody')));
    check('y se marca que no es costo del proyecto', /no es costo/.test(await page.textContent('#dbody')));
    await page.screenshot({ path: path.join(OUT, nombre + '-3-declarado.png') });

    await page.click('#dcerrar');
    await page.waitForTimeout(60);
    check('el cajón se cierra', !(await page.$('#drawer[open]')));

    // ── Pantalla de disputas ──
    await page.click('#tabs .tab[data-p="2"]');
    await page.waitForTimeout(80);
    const p2 = await page.textContent('#p2');
    check('las disputas se listan con su evidencia', /Evidencia/.test(p2), p2.slice(0, 80));
    check('cada disputa abierta ofrece resolverse', (await page.$$('#p2 [data-acc]')).length >= 2);
    await page.screenshot({ path: path.join(OUT, nombre + '-4-disputas.png'), fullPage: true });
    const desb2 = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check('la pantalla de disputas tampoco desborda', desb2 === 0, desb2 + ' px');

    // ── Pantalla de cierre ──
    await page.click('#tabs .tab[data-p="3"]');
    await page.waitForTimeout(80);
    check('el cierre pinta 4 KPI', (await page.$$('#p3 .kpi')).length === 4);
    check('el cierre separa el préstamo del costo', /no es costo/i.test(await page.textContent('#p3')));

    // ── El archivo para el despacho ──
    // El botón de descargar es el producto de toda la pantalla: si queda fuera de
    // cuadro en el celular, la semana se envía y nadie baja el archivo.
    check('el cierre ofrece el archivo para el despacho',
      /Archivo para el despacho/.test(await page.textContent('#p3')));
    const bBox = await page.locator('#bajar-archivo').boundingBox();
    check('el botón de descargar es visible y cabe en el ancho',
      !!bBox && bBox.width > 40 && bBox.x >= 0 && (bBox.x + bBox.width) <= w + 1,
      bBox ? Math.round(bBox.x + bBox.width) + ' de ' + w : 'sin botón');
    // El segundo boton es el que Magaly usa para REVISAR antes de mandar. Vive en la
    // misma fila que el del csv, y en 390px una fila de dos botones es justo donde
    // uno se sale de cuadro sin que nadie lo note.
    const xBox = await page.locator('#bajar-excel').boundingBox();
    check('el botón de la previa en Excel también cabe',
      !!xBox && xBox.width > 40 && xBox.x >= 0 && (xBox.x + xBox.width) <= w + 1,
      xBox ? Math.round(xBox.x + xBox.width) + ' de ' + w : 'sin botón');
    // Y de verdad produce un archivo: se llama a la funcion que cuelga del boton y se
    // miden los bytes. Un boton que existe pero baja cero bytes se ve igual de bien.
    const bytesXlsx = await page.evaluate(() => {
      const S = window.NomApp && window.NomApp.estado ? window.NomApp.estado() : null;
      if (!S) return -1;
      const b = window.NomExcel.libro(window.NomDespacho.hojas(S, { version: 1 }));
      return (b[0] === 0x50 && b[1] === 0x4B) ? b.length : -2;
    });
    check('y el Excel que genera pesa algo y empieza con la firma PK',
      bytesXlsx > 2000, String(bytesXlsx));
    check('la vista previa lista a la gente con su instrucción',
      (await page.$$('#p3 .tabla-wrap tbody tr')).length > 5);
    // La tabla ancha tiene que hacer scroll DENTRO de su caja, no empujar la página.
    const scrollPropio = await page.evaluate(() => {
      const caja = document.querySelector('#p3 .tabla-wrap');
      return !!caja && caja.scrollWidth >= caja.clientWidth;
    });
    check('la tabla del archivo se desplaza dentro de su caja', scrollPropio === true);

    await page.screenshot({ path: path.join(OUT, nombre + '-5-cierre.png'), fullPage: true });
    const desb3 = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check('la pantalla de cierre tampoco desborda', desb3 === 0, desb3 + ' px');

    const propios = errores.concat(consola).filter(t => !esDelEntorno(t));
    check('cero errores de JavaScript propios', propios.length === 0, propios.join(' | ').slice(0, 200));

    await ctx.close();
  }

  await browser.close();
  srv.close();

  console.log('\nCapturas en: ' + OUT);
  console.log('═'.repeat(64));
  if (fails.length) {
    console.log('FALLARON ' + fails.length + ' de ' + (pass + fails.length));
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('VISUAL VERDE — ' + pass + '/' + pass + ' checks en ' + VIEWPORTS.length + ' anchos');
})();
