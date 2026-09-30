/* ═══ Capturas de la V1.46 · órdenes, liga, engrane y puerta ════════════════
 *
 * 380 · 760 · 900 · 1280, que es la regla de CLAUDE.md §20 #20, y MIRADAS.
 * Mide además anchos en cero, desbordes y errores de página: eso caza lo que
 * el ojo perdona, pero no sustituye al ojo — el corte de la columna Machote a
 * 900px pasaba todas las medidas y estaba mal.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tests/capturas-v146.js [carpeta]
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ANCHOS = [380, 760, 900, 1280];

/* ── LA COTIZACIÓN DE EJEMPLO, FABRICADA CON EL MOTOR REAL ─────────────────
 * Con `vm`, igual que `pruebas-navegador.js`: si `machoteNuevo` cambia, la
 * fixtura cambia con él y no se queda con la forma de hace tres versiones. */
const MACHOTE = (function () {
  const vm = require('vm');
  const ctx = { window: {}, console: { log() {} } };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8'), ctx);
  const m = ctx.window.MachoteCalc.machoteNuevo({
    nombre: 'Cotización de ejemplo V1.46', creado_por: 'zz.prueba', empresa_id: 1 });
  m.id = 'M-9146';
  m.cliente = 'Industrias Inventadas del Norte';
  m.cliente_id = 49;
  return m;
})();
const EXE = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'].filter(Boolean)
  .find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

/* Datos INVENTADOS. El repositorio es público: aquí no entran nombres de
 * cliente, importes ni contactos reales. */
const ORDENES = [
  { id: 70001, nombre: 'SO-DEMO-9001', estado: 'sent', empresa_id: 1,
    cliente: 'Industrias Inventadas del Norte, SA de CV',
    descripcion: 'Mantenimiento de centro de control de motores en planta 2',
    po: '', cotizador: 'Ricardo', cotizador_estado: 'activo',
    total: 1234567.89, moneda: 'MXN', fecha: '29/09/2026 09:14', pricelist: 'MXN público',
    machote: { id: 'uuid-demo-1', id_local: 'M-9146', folio_txt: 'COT-0077',
               nombre: 'Planta 2 · MCC', duenio: 'zz.prueba', version: 4 } },
  { id: 70002, nombre: 'SO-DEMO-9002', estado: 'sale', empresa_id: 6,
    cliente: 'Manufacturas Ficticias', descripcion: '',
    po: 'PO-INVENTADA-4471', cotizador: 'Aldo', cotizador_estado: 'archivado',
    total: 48250, moneda: 'USD', fecha: '28/09/2026 17:02', pricelist: 'USD público',
    machote: null },
  { id: 70003, nombre: 'SO-DEMO-9003', estado: 'draft', empresa_id: 1,
    cliente: 'Alimentos Imaginarios', descripcion: 'Adecuación eléctrica para nueva empacadora',
    po: '', cotizador: 'Monty', cotizador_estado: 'sin_casar',
    total: 98000, moneda: 'MXN', fecha: '27/09/2026 11:40', pricelist: 'MXN público',
    machote: { id: 'uuid-demo-3', id_local: 'M-9147', folio_txt: 'COT-0074',
               nombre: 'Tableros · preventivo', duenio: 'otra.persona', version: 2 } },
  /* V1.47 · el caso más común: Odoo vacío y el machote sí la trae. */
  { id: 70005, nombre: 'SO-DEMO-9005', estado: 'draft', empresa_id: 1,
    cliente: 'Plásticos Hipotéticos', descripcion: '',
    po: 'PO-INVENTADA-8812', cotizador: 'Monty', cotizador_estado: 'sin_casar',
    total: 312400, moneda: 'MXN', fecha: '30/09/2026 07:05', pricelist: 'MXN público',
    machote: { id: 'uuid-demo-5', id_local: 'M-9146', folio_txt: 'COT-0077',
               nombre: 'Subestación · protecciones y pruebas de aceptación',
               duenio: 'zz.prueba', version: 4 } },
  /* V1.47 · y el caso que hay que poder VER: los dos textos discrepan. */
  { id: 70006, nombre: 'SO-DEMO-9006', estado: 'sent', empresa_id: 1,
    cliente: 'Bebidas Ficticias', descripcion: 'aaa',
    po: '', cotizador: 'Angel', cotizador_estado: 'sin_casar',
    total: 75500, moneda: 'MXN', fecha: '30/09/2026 08:20', pricelist: 'MXN público',
    machote: { id: 'uuid-demo-6', id_local: 'M-9146', folio_txt: 'COT-0077',
               nombre: 'Línea de llenado · instrumentación',
               duenio: 'zz.prueba', version: 4 } },
  { id: 70004, nombre: 'SO-DEMO-9004', estado: 'cancel', empresa_id: 1,
    cliente: 'Metales Supuestos', descripcion: 'Reubicación de polipasto',
    po: '', cotizador: '', cotizador_estado: null,
    total: null, moneda: 'MXN', fecha: '20/09/2026 08:00', pricelist: 'MXN público',
    machote: null }
];

const ESTADOS = [
  { id: 'lista', que: 'la lista, con el filtro anunciado', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/ordenes'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), null)); } },
  { id: 'detalle', que: 'el detalle con machote ligado', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70001'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70001')); } },
  { id: 'sin-machote', que: 'el detalle SIN machote ligado', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70002'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70002')); } },
  { id: 'hoja', que: 'el machote a media pantalla, sobre la orden', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70001'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70001'));
      await p.waitForTimeout(250);
      await p.evaluate(() => { const b = document.querySelector('#orAbrirHoja'); if (b) b.click(); });
      await p.waitForTimeout(500); } },
  { id: 'hoja-min', que: 'la hoja minimizada a su barra', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70001'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70001'));
      await p.waitForTimeout(250);
      await p.evaluate(() => { const b = document.querySelector('#orAbrirHoja'); if (b) b.click(); });
      await p.waitForTimeout(300);
      await p.evaluate(() => { const b = document.querySelector('#orHojaMin'); if (b) b.click(); });
      await p.waitForTimeout(400); } },
  { id: 'puerta', que: 'la puerta de confirmación, bloqueando', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70002'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70002'));
      await p.waitForTimeout(200);
      await p.evaluate(() => { const b = document.querySelector('#orConfirmar'); if (b) b.click(); });
      await p.waitForTimeout(500); } },
  { id: 'ligar', que: 'el selector para ligar una cotización', ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70002'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70002'));
      await p.waitForTimeout(200);
      await p.evaluate(() => window.OrdenLigar.abrir(70002, null, 'SO-DEMO-9002'));
      await p.waitForTimeout(400); } },
  /* ══ V1.47 ══════════════════════════════════════════════════════════════ */
  { id: 'desc-copiar', que: 'la descripción del machote, con Odoo vacío y la oferta de copiar',
    ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70005'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70005')); } },
  { id: 'desc-difiere', que: 'los dos textos discrepando, y lo de Odoo a la vista',
    ir: async (p) => {
      await p.evaluate((o) => { window.Ordenes._sembrar(o, 1546); location.hash = '#/so/70006'; }, ORDENES);
      await p.waitForTimeout(400);
      await p.evaluate(() => window.Ordenes.montar(document.querySelector('#vista'), '70006')); } },
  { id: 'puerta-abstiene', que: 'la puerta con la confirmación del servidor: 4 candados y 2 abstenciones',
    ir: async (p) => {
      /* El caso nuevo de la V1.47: la cotización NO está en este navegador,
       * pero la Compuerta 2 mandó su `confirmacion`. Cuatro candados se
       * aplican y los dos que dependen del precio DECLARAN que se abstienen. */
      await p.evaluate(() => {
        const v = window.PuertaConfirmar.evaluar({
          machote: null, machoteAjeno: true, calc: null, desde: 'confirmar',
          servidor: { ok: true, cuadra: true, dentro_politica: true, moneda: 'MXN',
            confirmacion: {
              contacto: { nombre: '', correo: 'esto-no-es-un-correo', tel: '12' },
              iva: { decision: null },
              po: { numero: '', importe: null, archivo: null },
              anticipo: { aplica: null, pct: null } } } });
        const caja = document.createElement('div');
        caja.className = 'pad';
        caja.innerHTML = '<div class="caja">' + window.PuertaConfirmar.html(v) + '</div>';
        const v2 = document.querySelector('#vista');
        v2.innerHTML = ''; v2.appendChild(caja);
      });
      await p.waitForTimeout(300); } },
  { id: 'engrane', que: 'el engrane abierto en la lista de cotizaciones', ir: async (p) => {
      await p.evaluate(() => { location.hash = '#/'; });
      await p.waitForTimeout(600);
      /* El VISIBLE: la lista pinta cada machote dos veces (renglón y ficha) y
       * cuál se ve depende del ancho. Apretar el primero del documento
       * capturaba el oculto y la imagen mentía sobre la pantalla. */
      await p.evaluate(() => {
        const bs = [].slice.call(document.querySelectorAll('[data-engr]'));
        const b = bs.find(x => x.getBoundingClientRect().width > 0);
        if (b) b.click();
      });
      await p.waitForTimeout(300); } }
];

(async () => {
  const destino = process.argv[2] || path.join(__dirname, '_capturas-v147');
  fs.mkdirSync(destino, { recursive: true });
  const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const problemas = [];
  let n = 0;

  for (const w of ANCHOS) {
    for (const st of ESTADOS) {
      /* ⚠️ UN CONTEXTO POR CAPTURA, no una pestaña más del mismo.
       * `newPage` sobre el mismo navegador COMPARTE `localStorage`, así que lo
       * que sembraba una captura lo pisaba la siguiente y la siembra dejaba de
       * llegar a mitad de la corrida — pasaban las once primeras y fallaba la
       * doceava. Medido con el diagnóstico puesto (`enLs: -1`), no deducido.
       * Un contexto propio arranca limpio y la única escritura es la siembra. */
      const ctx = await b.newContext({ viewport: { width: w, height: 1100 } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
      p.on('console', m => { if (m.type() === 'error' &&
        !/Failed to load resource|net::ERR|version\.json|fonts\.g/i.test(m.text()))
        errs.push('CONSOLA: ' + m.text()); });

      await p.addInitScript((cfg) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
            scopes: ['comercial:read', 'comercial:write'],
            exp: Math.floor(Date.now() / 1000) + 3600 }));
          /* La cotización de ejemplo, ANTES de que corra una sola línea de la
           * aplicación. Así no hay orden que respetar ni carrera que perder. */
          localStorage.setItem('fts_machote_v1', JSON.stringify({
            v: 1, guardado_at: new Date().toISOString(), machotes: [cfg.m], handoff: {} }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-9146': { machote_id: 'uuid-demo-1', version: 4, folio: 77,
                        folio_txt: 'COT-0077', subido_at: new Date().toISOString(),
                        huella: 'x' } }));
        } catch (e) {}
        const o = window.fetch;
        window.fetch = function (u, x) {
          if (String(u).indexOf('/comercial/') >= 0)
            return Promise.resolve({ ok: true, json: () => Promise.resolve(
              { code: 404, message: 'The requested webhook is not registered.' }) });
          return o(u, x);
        };
      }, { m: MACHOTE });
      await p.goto(BASE);
      await p.waitForTimeout(900);

      /* ⚠️ LA SIEMBRA VA EN EL GUION DE ARRANQUE (arriba), no después de
       * cargar. Sembrar y recargar COMPITE con el arranque de la aplicación:
       * la misma siembra daba 1 cotización a 380px y 0 a 760px en la misma
       * corrida, y con un contexto por captura llegó a perderse en la
       * primera. Una captura de un selector vacío se ve idéntica a un
       * selector roto, así que la carrera no se espera: se elimina.
       * Esto de aquí abajo se queda como red, no como mecanismo. */
      let listo = false;
      for (let i = 0; i < 12 && !listo; i++) {
        listo = await p.evaluate(() =>
          !!(window.MachoteApp && window.MachoteApp.todos &&
             window.MachoteApp.todos().length > 0));
        if (!listo) await p.waitForTimeout(250);
      }
      if (!listo) {
        const diag = await p.evaluate(() => {
          let ls = null;
          try { ls = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null'); } catch (e) {}
          return { hayApp: !!window.MachoteApp, hayTodos: !!(window.MachoteApp || {}).todos,
                   enApp: (window.MachoteApp && window.MachoteApp.todos)
                     ? window.MachoteApp.todos().length : -1,
                   enLs: ls && ls.machotes ? ls.machotes.length : -1,
                   hash: location.hash };
        });
        await b.close();
        throw new Error('la cotización sembrada nunca llegó al estado de la aplicación (' +
          w + 'px · ' + st.id + '): ' + JSON.stringify(diag));
      }

      await st.ir(p);
      await p.waitForTimeout(250);

      const medida = await p.evaluate((ancho) => {
        const ceros = [], derrames = [];
        document.querySelectorAll('input,select,textarea,button,td,th,.or-est,.chip-mini,.or-fac')
          .forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.height === 0 && r.width === 0) return;
            if (r.width === 0) ceros.push((el.tagName + '.' + (el.className || '')).slice(0, 46));
            if (r.right > ancho + 1)
              derrames.push((el.tagName + '.' + (el.className || '')).slice(0, 46) +
                            ' → ' + Math.round(r.right));
          });
        return { ceros: ceros.slice(0, 5), derrames: derrames.slice(0, 5),
                 scrollX: document.documentElement.scrollWidth > ancho + 1 };
      }, w);

      await p.screenshot({ path: path.join(destino, w + '-' + st.id + '.png'), fullPage: true });
      n++;
      if (medida.ceros.length) problemas.push(w + 'px · ' + st.id + ' · ancho CERO: ' + medida.ceros.join(' | '));
      if (medida.derrames.length) problemas.push(w + 'px · ' + st.id + ' · se derrama: ' + medida.derrames.join(' | '));
      if (medida.scrollX) problemas.push(w + 'px · ' + st.id + ' · la PÁGINA desborda a lo ancho');
      if (errs.length) problemas.push(w + 'px · ' + st.id + ' · ' + errs.join(' | '));
      await p.close();
      await ctx.close();
    }
  }
  await b.close();

  console.log('\nCapturas en ' + destino + '\n');
  ESTADOS.forEach(s => console.log('  ' + s.id.padEnd(12) + ' (' + s.que + ')'));
  console.log('\n' + n + ' capturas V1.47 · ' + ANCHOS.join(' · ') + ' px');
  if (problemas.length) {
    console.log('\n' + problemas.length + ' PROBLEMA(S):');
    problemas.forEach(x => console.log('  ✗ ' + x));
    process.exit(1);
  }
  console.log('sin desbordes, sin anchos en cero, sin errores de página.');
  console.log('⚠️ Ahora hay que MIRARLAS.');
})();
