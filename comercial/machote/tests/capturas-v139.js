/* ═══ Pruebas de navegador del prototipo ═══
 *
 *   npm i playwright
 *   node comercial/machote/tests/pruebas-navegador.js
 *
 * Corre contra el archivo local, sin servidor. Verifica que las pantallas
 * navegan, que el motor reproduce el machote real, que el revisador encuentra
 * lo que debe, y que nada desborda a 380 px.
 *
 * Reescritas el 2026-09-03 junto con el motor.
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');

/* ⚠️ El catálogo de países se pide con `fetch`, y **`fetch` de `file://` está
 * bloqueado en Chromium**. Sin servirlo desde aquí, cada montaje de estas
 * pruebas correría en el modo DEGRADADO (los tres campos del lugar como texto
 * libre) y estaríamos midiendo el respaldo en vez de la pantalla. Se lee del
 * archivo real del repo, no de una copia: si el catálogo cambia, las pruebas
 * ven el cambio. */
/** Siembra el catálogo en una página, Y lo sirve.
 *
 *  ⚠️ Las dos cosas, y por eso vive aquí y no en cada montaje: **`fetch` de
 *  `file://` está bloqueado en Chromium**, así que sin interceptarlo la página
 *  corre en modo DEGRADADO —los tres campos del lugar como texto libre— y las
 *  pruebas medirían el respaldo creyendo que miden la pantalla. Es la trampa de
 *  CLAUDE.md §20 #11: el modo degradado se ve igual que «todavía no carga».
 *
 *  Se engancha ANTES que cualquier otro `addInitScript` de la página, así que
 *  los montajes que envuelven `fetch` después reciben éste como el original y
 *  la cadena funciona sola. */
/* El catálogo va ANTES de quien lo usa. Funcionaba al revés porque el valor
 * sólo se lee al llamar a `sembrarGeo`, pero un `const` citado más arriba de su
 * línea es justo la trampa de CLAUDE.md §20 #12: el día que alguien lo lea en
 * la definición, revienta la función entera y no se ve en el diff. */
const GEO_JSON = JSON.parse(require('fs').readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'shared', 'comercial', 'geo.json'), 'utf8'));

/* Los cuatro machotes de ejemplo, leídos del propio `demo.js` y SIN `_demo`.
 * Se cargan en un `vm` mínimo para no duplicar aquí doscientas líneas de
 * fixture que se separarían del original a la primera. */
const MACHOTES_FIXTURE = (function () {
  const vm = require('vm');
  const src = require('fs').readFileSync(
    path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8') + '\n' +
    require('fs').readFileSync(path.resolve(__dirname, '..', 'js', 'demo.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return JSON.parse(JSON.stringify(ctx.window.DEMO.MACHOTES)).map(function (m) {
    delete m._demo; return m;
  });
})();

/* ── V1.27 · las pruebas SIEMBRAN sus datos ──────────────────────────────
 *
 * Hasta V1.26 la pantalla arrancaba con los cuatro ejemplos de `demo.js` y las
 * pruebas se colgaban de ellos. Los ejemplos se retiraron (tres veces acabaron
 * en producción: Esteban, Ricardo y Montalvo, quemando COT-0009 a COT-0012),
 * así que ahora la fixture es explícita — que además es como debió estar
 * siempre: una prueba que depende de datos que la aplicación trae de regalo
 * mide dos cosas a la vez.
 *
 * Se siembran SIN la marca `_demo`: para la aplicación son cotizaciones como
 * cualquier otra, que es exactamente lo que las pruebas quieren ejercitar. */
const sembrarMachotes = (pg) => pg.addInitScript((lista) => {
  const sembrar = function () {
    try {
      /* ⚠️ SÓLO si no hay nada. Sembrar encima pisaría lo que la prueba acaba
       * de capturar — y hay pruebas que miden justamente que lo capturado
       * sobreviva a recargar. La fixture es el punto de partida, no un estado
       * que se reimponga en cada navegación. */
      if (localStorage.getItem('fts_machote_v1')) return;
      localStorage.setItem('fts_machote_v1', JSON.stringify({
        v: 1, guardado_at: new Date().toISOString(), machotes: lista, handoff: {}
      }));
    } catch (e) {}
  };
  /* ⚠️ La suite llama `localStorage.clear()` en SU propio guion de arranque
   * —a propósito, para que cada prueba parta limpia— y ese guion se registra
   * DESPUÉS que éste, así que se lleva la fixture por delante. En vez de pelear
   * con el orden de registro en dieciséis sitios, la fixture se vuelve a poner
   * después de cada `clear()`.
   *
   * `removeItem` NO se toca: las páginas que quieren arrancar SIN nada local
   * (las que traen su propio servidor fingido) lo usan para decirlo, y tienen
   * que seguir pudiendo decirlo. */
  try {
    const clearOriginal = localStorage.clear.bind(localStorage);
    localStorage.clear = function () { clearOriginal(); sembrar(); };
  } catch (e) {}
  sembrar();
}, MACHOTES_FIXTURE);

/* ── La fila del PERCENTIL ALTO ────────────────────────────────────────────
 * Un nombre corto cabe en cualquier parte: capturar con el fixture de ejemplo
 * mide una pantalla fácil. Éste es el caso real que apretó —89 caracteres de
 * nombre, 60 renglones, 50 capturados— y es el que decide si la tabla enseña
 * las fechas o las recorta. Se construye con el motor de verdad para que no
 * se separe del formato del documento a la primera. */
const MACHOTE_P90 = (function () {
  const vm = require('vm');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(require('fs').readFileSync(
    path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8'), ctx);
  const rell = (n, base) => { let s = base; while (s.length < n) s += ' ' + base; return s.slice(0, n); };
  const m = ctx.window.MachoteCalc.machoteNuevo({
    id: 'M-P90', nombre: rell(89, 'Modificacion de tren de drenado con recubrimiento epoxico') });
  m.cliente_id = 991; m.cliente = rell(30, 'Industrias del Norte SA CV');
  const s = m.secciones[0];
  while (s.partidas.length < 60) s.partidas.push({ qty: '', unidad: '', tipo: '', descripcion: '',
    modelo: '', marca: '', pu: null, moneda: 'MXN', margen: null, link: '', comentario: '' });
  for (let i = 0; i < 50; i++) Object.assign(s.partidas[i],
    { descripcion: 'Renglon capturado ' + (i + 1), qty: 2, pu: 1500, unidad: 'Pieza', tipo: 'Materiales' });
  s.mo[2].qty = 60; s.mo[4].qty = 40;
  return m;
})();

const sembrarP90 = (pg) => pg.addInitScript((m) => {
  const meter = function () {
    try {
      const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
      if (!d || !d.machotes || d.machotes.some(function (x) { return x.id === m.id; })) return;
      d.machotes.unshift(m);
      localStorage.setItem('fts_machote_v1', JSON.stringify(d));
    } catch (e) {}
  };
  meter();
  try {
    const clearOriginal = localStorage.clear.bind(localStorage);
    localStorage.clear = function () { clearOriginal(); meter(); };
  } catch (e) {}
}, MACHOTE_P90);

const sembrarGeo = (pg) => pg.addInitScript((g) => {
  window.__GEO = g;
  const orig = window.fetch;
  window.fetch = function (u) {
    if (String(u).indexOf('geo.json') >= 0) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(g); } });
    }
    return orig.apply(this, arguments);
  };
}, GEO_JSON);

/* El navegador con el que se corre.
 *
 * En una laptop basta `chromium.launch()`. En el contenedor de Claude Code el
 * binario vive en una ruta fija y NO se puede descargar (cdn.playwright.dev
 * está fuera de la lista blanca del proxy), así que se apunta a mano.
 * Se prefiere `headless_shell`, que es lo que Playwright usa de todos modos
 * para modo headless desde la 1.49.
 *
 * Si en tu máquina Playwright ya tiene su navegador, borra `executablePath`
 * o exporta CHROMIUM_PATH con la ruta que quieras. */
const fs = require('fs');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const OPCIONES = EXE ? { executablePath: EXE } : {};


/* ═══ Capturas V1.39 ═══════════════════════════════════════════════════════
 * Una pantalla se revisa MIRÁNDOLA, no leyendo su diff (CLAUDE.md §20 #12).
 * Reusa el preámbulo de `pruebas-navegador.js` —mismo fixture, mismo
 * navegador, mismo sembrado— para que lo que se mira sea lo que se prueba.
 *   node comercial/machote/tests/capturas-v139.js
 *
 * CUATRO anchos, y los dos de en medio son el motivo del cambio de la V1.35:
 * 760 y 900 caen en la franja donde la tabla ya no enseña las columnas de
 * fecha y la tarjeta todavía no entra. Ahí es donde hay que MIRAR que el dato
 * siga estando, ahora como línea dentro de la propia fila.
 *
 * Y la fila es la del PERCENTIL ALTO —nombre de 89 caracteres, 60 renglones,
 * 50 capturados—, no un ejemplo corto: con nombres cortos todo cabe y la
 * captura no prueba nada.
 *
 * Lo que hay que MIRAR, no sólo que no truene:
 *   a · la lista: columnas de fecha (1280) · línea en la fila (900, 760) ·
 *       línea en la tarjeta (380) · y la RAYA del machote que no tiene fecha
 *   b · la cabecera de sección: el botón del pad y el aviso de comisión,
 *       los dos sin bajar la hoja
 *   c · el pad ABIERTO como panel anclado al fondo, con su pie
 *   d · el aviso de comisión DESVIADO, en ámbar
 *   e · la barra fija con el botón de deshacer, que dice QUÉ deshace
 *   f · la barra con el botón del PAD, mirada DESDE EL FONDO de la hoja —que
 *       es el caso que la V1.36 dejó anotado y la V1.37 cierra
 *   g · el deshacer de un BORRADO: la etiqueta dice qué renglón vuelve
 */
const OUT = process.env.OUT || '/tmp/capturas-v139';

(async () => {
  try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
  const b = await chromium.launch(OPCIONES);
  const problemas = [];

  for (const [ancho, alto, tag] of [[1280, 1400, '1280'], [900, 1200, '0900'],
                                     [760, 1200, '0760'], [380, 1600, '0380']]) {
    const q = await b.newPage({ viewport: { width: ancho, height: alto } });
    q.setDefaultTimeout(20000);
    q.on('pageerror', e => problemas.push(tag + ' PAGEERROR: ' + e.message));
    q.on('console', m => { if (m.type() === 'error' &&
      !/fonts\.google|gstatic|ERR_CERT|ERR_TUNNEL|ERR_CONNECTION|version\.json/.test(m.text()))
      problemas.push(tag + ' CONSOLE: ' + m.text()); });

    await sembrarGeo(q);
    await sembrarMachotes(q);
    await sembrarP90(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
          scopes: ['comercial:read', 'comercial:orden'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        /* La libreta con las dos fechas: es lo que la lista pinta, y desde
         * la V1.35 `creado_at` viene de AQUÍ y no del documento (los 10 de 19
         * machotes reales que nacieron antes del campo no lo llevan dentro).
         * Fechas fijas, para que la captura sea comparable entre corridas.
         * M-1042 va a propósito SIN `creado_at`: la raya es la respuesta
         * correcta cuando nadie sabe cuándo nació, y la captura tiene que
         * mostrar también ese caso. */
        localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
          'M-1041': { version: 7, huella: 'x',
                      machote_id: '11111111-2222-3333-4444-555555555555',
                      guardada_at: new Date(Date.now() - 2 * 864e5).toISOString(),
                      autor: 'f.montalvo', autor_nombre: 'Francisco Montalvo',
                      creado_at: new Date(Date.now() - 37 * 864e5).toISOString() },
          'M-P90': { version: 12, huella: 'z',
                      machote_id: '99999999-8888-7777-6666-555555555555',
                      guardada_at: new Date(Date.now() - 1 * 864e5).toISOString(),
                      autor: 'f.montalvo', autor_nombre: 'Francisco Montalvo',
                      creado_at: new Date(Date.now() - 96 * 864e5).toISOString() },
          'M-1042': { version: 2, huella: 'y',
                      machote_id: '22222222-3333-4444-5555-666666666666',
                      guardada_at: new Date(Date.now() - 40 * 864e5).toISOString(),
                      autor: 'zz.prueba', autor_nombre: 'ZZ Prueba' }
        }));
      } catch (e) {}
    });

    /* a · LA LISTA. Los cuatro anchos, y en los cuatro tiene que haber fecha:
     *     columnas a 1280, línea dentro de la fila a 900 y 760, línea dentro
     *     de la tarjeta a 380. La franja 721-980 es justo lo que se arregló. */
    await q.goto(BASE); await q.waitForTimeout(1100);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-a-lista.png', fullPage: true });
    const lst = await q.evaluate(() => {
      /* VISIBLE, no la primera que exista: a 380 px la tabla del escritorio
       * sigue en el HTML con altura 0, y medirla devolvía un 0 que se lee
       * como «la fila no tiene alto» en vez de «medí la equivocada». */
      const fila = Array.from(document.querySelectorAll('.nm, .fila .grow > strong'))
        .find(e => (e.textContent || '').length > 60 && e.offsetParent !== null);
      /* La fila del escritorio es un `tr`; la del teléfono es `.fila`. */
      const cont = fila ? (fila.closest('tr') || fila.closest('.fila') || fila.parentElement) : null;
      /* PRESENCIA no basta: los dos existen siempre en el HTML y el CSS
       * apaga uno u otro según el ancho. Lo que se mide es si se VE
       * (§20 #12), que es la invariante del arreglo de la franja muerta. */
      const seVe = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const st = getComputedStyle(e);
        return st.display !== 'none' && st.visibility !== 'hidden' && e.offsetParent !== null;
      };
      return {
        columnas: seVe('td.fch'),
        linea: seVe('.fch-en-fila'),
        tarjeta: seVe('.fila .fch-linea'),
        texto: cont ? (cont.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 150) : null,
        alto: cont ? Math.round(cont.getBoundingClientRect().height) : null,
        desborde: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    });
    console.log(tag + ' lista → columnas:' + lst.columnas + ' · línea en fila:' + lst.linea +
                ' · línea en tarjeta:' + lst.tarjeta +
                ' · alto de la fila del P90: ' + lst.alto + 'px · desborde:' + lst.desborde);
    if (!lst.columnas && !lst.linea && !lst.tarjeta)
      problemas.push(tag + ' SIN FECHA POR NINGÚN LADO — es la franja muerta otra vez');
    console.log('        «' + lst.texto + '»');

    /* b · LA CABECERA de la sección del P90, sin bajar nada: ahí viven el
     *     botón del pad y el aviso de comisión desde la V1.36. */
    await q.evaluate(() => { location.hash = '#/m/M-P90'; }); await q.waitForTimeout(900);
    await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(1200);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-b-cabecera.png' });

    /* c · EL PAD, abierto como panel anclado al fondo. Se abre DESPUÉS de
     *     bajar al final de la hoja: es el caso que antes no se alcanzaba
     *     (el pad quedaba a 4,941 px a 1280 y a 44,694 px a 380). */
    /* Y se COMPRUEBA que bajó: un `scrollTo` a un contenedor que no es el que
     * desplaza no hace nada y la captura saldría igual de bonita desde
     * arriba, probando lo que no es (§20 #12). */
    const bajo = await q.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return { y: Math.round(window.scrollY),
               alto: Math.round(document.documentElement.scrollHeight) };
    });
    await q.waitForTimeout(400);
    console.log('        hoja bajada hasta y=' + bajo.y + ' de ' + bajo.alto + 'px');
    if (bajo.y < 500) problemas.push(tag + ' la hoja NO bajó (y=' + bajo.y + '): el pad se midió desde arriba');
    await q.click('[data-padabrir]'); await q.waitForTimeout(400);
    await q.fill('[data-padtxt]', '3 tramos × 12 m × $450/m\n+ 8 soportes × $1,200\n= 25,800');
    await q.fill('[data-padcon]', 'Canalización tramo norte');
    await q.fill('[data-padimp]', '25800');
    await q.waitForTimeout(600);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-c-pad-anclado.png' });
    const pd = await q.evaluate(() => {
      const r = document.querySelector('.pad-panel:not([hidden])');
      if (!r) return null;
      const c = r.getBoundingClientRect();
      const b = document.querySelector('[data-padabrir]');
      return { top: Math.round(c.top), alto: Math.round(c.height), ventana: window.innerHeight,
               dentro: c.top >= 0 && c.bottom <= window.innerHeight + 1,
               punto: b ? b.classList.contains('con-algo') : null };
    });
    console.log('        pad anclado → top ' + pd.top + ' · alto ' + pd.alto + ' de ' +
                pd.ventana + ' · dentro de la ventana: ' + pd.dentro + ' · punto en el botón: ' + pd.punto);

    /* d · EL AVISO DE COMISIÓN, desviado. Mismo renglón que el estado normal,
     *     en ámbar: un solo lugar, los dos estados. */
    await q.click('[data-padcerrar]'); await q.waitForTimeout(400);
    await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(300);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-d1-comision-normal.png' });
    await q.evaluate(() => {
      const e = document.querySelector('.com-sec'); if (e) e.scrollIntoView({ block: 'center' });
    });
    await q.waitForTimeout(300);
    await q.click('[data-comprop]'); await q.waitForTimeout(700);
    await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(400);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-d2-comision-desviada.png' });
    const cm = await q.evaluate(() => {
      const e = document.querySelector('[data-ircom]');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { texto: (e.textContent || '').trim(), ambar: e.classList.contains('apartado'),
               top: Math.round(r.top + window.scrollY), pantallas: +((r.top + window.scrollY) / window.innerHeight).toFixed(1) };
    });
    console.log('        comisión → «' + cm.texto + '» ámbar:' + cm.ambar +
                ' · a ' + cm.top + 'px = ' + cm.pantallas + ' pantallas');

    /* e · LA BARRA FIJA con el deshacer. Es el punto 5 del #246, y la
     *     pregunta de la auditoría es de ALCANCE: el botón vive en la barra
     *     pegada, así que no hay que bajar — pero a 380 px hay que MIRAR que
     *     no lo empujen fuera los otros botones. */
    /* El deshacer se apunta SÓLO en los cambios de celda (`[data-cel]`), que
     * es lo que el V1.34 decidió: es la captura de costos, no la navegación.
     * Así que hay que teclear en una celda para que el botón exista — si se
     * mide sin hacerlo, sale «no hay» y parece que la función no llegó, que
     * es justo el error de lectura del §20 #18. */
    await q.evaluate(() => {
      const e = document.querySelector('[data-cel]');
      if (e) e.scrollIntoView({ block: 'center' });
    });
    await q.waitForTimeout(300);
    const cel = q.locator('[data-cel]').first();
    await cel.fill('7');
    await cel.dispatchEvent('change');
    await q.waitForTimeout(700);
    const bf = await q.evaluate(() => {
      const d = document.getElementById('btnDeshacer');
      const f = document.querySelector('.fija');
      if (!d || !f) return { hay: !!d, barra: !!f };
      const r = d.getBoundingClientRect(), g = f.getBoundingClientRect();
      return { hay: true, barra: true, texto: (d.textContent || '').trim(),
               dentroX: r.left >= g.left - 1 && r.right <= g.right + 1,
               visible: r.top >= 0 && r.bottom <= window.innerHeight + 1,
               cortada: f.scrollWidth > f.clientWidth + 1 };
    });
    await q.screenshot({ path: OUT + '/v139-' + tag + '-e-barra-deshacer.png' });
    console.log('        deshacer → ' + JSON.stringify(bf));

    /* f · V1.37 · LA BARRA DESDE EL FONDO, con el botón del pad. Es el caso
     *     que la V1.36 midió y no resolvió: 3,899 px a 1280 y 43,715 px a 380
     *     hasta el botón de la cabecera. Aquí se mira que esté a mano. */
    const hastaAbajo = await q.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const bp = document.getElementById('btnPad');
      const r = bp ? bp.getBoundingClientRect() : null;
      return { y: Math.round(window.scrollY), hay: !!bp,
               enPantalla: r ? (r.top >= 0 && r.bottom <= window.innerHeight + 1) : false };
    });
    await q.waitForTimeout(300);
    await q.screenshot({ path: OUT + '/v139-' + tag + '-f-pad-desde-el-fondo.png' });
    console.log('        pad desde el fondo → hoja en y=' + hastaAbajo.y +
                ' · botón en la barra: ' + hastaAbajo.hay +
                ' · en pantalla: ' + hastaAbajo.enPantalla);
    if (!hastaAbajo.hay || !hastaAbajo.enPantalla)
      problemas.push(tag + ' el pad NO se alcanza desde el fondo de la hoja');

    /* g · V1.37 · EL DESHACER DE UN BORRADO. Se borra un renglón capturado y
     *     se mira que el botón diga cuál vuelve — no «deshacer» a secas. */
    await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(300);
    const refDel = await q.$$eval('[data-del]', e => e.map(x => x.dataset.del));
    if (refDel.length) {
      q.once('dialog', d => d.accept());
      await q.click('[data-del="' + refDel[0] + '"]'); await q.waitForTimeout(900);
      await q.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await q.waitForTimeout(300);
      await q.screenshot({ path: OUT + '/v139-' + tag + '-g-deshacer-borrado.png' });
      const etq = await q.evaluate(() => {
        const e = document.getElementById('btnDeshacer');
        return e ? (e.textContent || '').trim() : null;
      });
      console.log('        deshacer un borrado → «' + etq + '»');
      if (!etq || etq.indexOf('borrado') < 0)
        problemas.push(tag + ' borrar un renglón no ofreció deshacerlo');
    }
    await q.close();
  }
  await b.close();
  if (problemas.length) { console.log('\nPROBLEMAS:'); problemas.forEach(e => console.log('  ' + e)); }
  else console.log('\nsin errores de consola propios');
})();
