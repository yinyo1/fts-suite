/* ═══ Capturas de la V1.45 · los candados de la CONFIRMACIÓN ════════════════
 *
 *   node comercial/machote/tests/capturas-v145.js [carpeta]
 *
 * Cuatro anchos —380, 760, 900 y 1280— y cuatro estados del bloque nuevo,
 * dentro del modal de «Pasar a orden de venta»:
 *   1. VACÍO · todo lo que falta, con su qué / por qué / dónde
 *   2. CUADRA · la PO contra el subtotal, con los tres números lado a lado
 *   3. NO CUADRA · el descuadre, con la salida de «cubre varias»
 *   4. ANTICIPO · arriba del umbral, con el monto calculado sobre el subtotal
 *
 * Los dos anchos de en medio son EL PUNTO (§20 #20): lo que se rompe se rompe
 * entre 721 y 980, donde una media query ya se apagó y la otra no ha entrado.
 * En este módulo esa franja se ha roto DOS veces por cosas distintas, y las dos
 * se vieron de un golpe en la primera captura de 760.
 *
 * ── LO QUE MIDE, ADEMÁS DE RETRATAR ────────────────────────────────────────
 * Un guion que sólo tira PNG y termina en verde no prueba nada: la V1.34 estuvo
 * rota de 380 a 980 px durante días con todas sus pruebas pasando. Así que aquí
 * se mide, y se falla:
 *   · que la página no desborde a ninguno de los cuatro anchos;
 *   · que NINGÚN campo del bloque tenga cero de ancho —que es exactamente cómo
 *     se rompió la barra del precio: medía 0 px a 760 y se derramaba—;
 *   · que ningún elemento del bloque se salga por la derecha;
 *   · y que la consola no emita un solo `pageerror`.
 * Aun así, los PNG se MIRAN: un guion en verde no es una pantalla revisada.
 *
 * ⚠️ NO se suben al repo: es público (§20 #7). La carpeta por omisión está
 * fuera del árbol del repositorio, y todos los datos son inventados.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SALIDA = process.argv[2] || path.join(require('os').tmpdir(), 'capturas-v145');

const CAND = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CAND.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const GEO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared', 'comercial', 'geo.json'), 'utf8'));

/* El machote de la captura se ARMA aquí, con un precio redondo, para que los
 * tres números del cuadre se puedan verificar de un vistazo en la imagen:
 * 100,000 · 116,000 · lo que diga la PO. Un machote de la demo tiene un precio
 * cualquiera y la imagen deja de ser legible para quien la revisa. */
const MACHOTE = (function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pad-hoja.js'), 'utf8') + '\n' +
              fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx);
  const C = ctx.window.MachoteCalc;
  const m = C.machoteNuevo({ nombre: 'Cotización de prueba para las capturas',
                             creado_por: 'zz.prueba', empresa_id: 1 });
  m.id = 'M-9145';
  m.cliente_id = 49;
  m.cliente = 'Cliente Industrial Inventado, SA de CV';
  m.escenario = 'costo';           /* precio == costo → 100,000 exactos */
  m.diagnostico = { tipo: 'instalacion', respuestas: {} };
  const s = m.secciones[0];
  s.nombre = 'SUMINISTRO E INSTALACIÓN';
  s.partidas[0].desc = 'Partida inventada para la captura';
  s.partidas[0].qty = 1; s.partidas[0].pu = 100000;
  s.partidas[0].tipo = 'Materiales'; s.partidas[0].fuente = 'lista'; s.partidas[0].unidad = 'lote';
  s.mo.find(l => l.rol === 'tecnicos').qty = 0;
  /* Los compromisos y la oportunidad, ya resueltos: lo que la captura viene a
   * retratar son los candados NUEVOS, y si los viejos siguen bloqueando la
   * imagen sale llena de ruido que no es de esta versión. */
  m.compromisos = { pago: { dias: 30, termino_texto: '30 días', termino_id: null, hitos: [] },
                    incoterm: 'DAP', entrega: { texto: '8 a 10 semanas', fecha: null },
                    vigencia: { dias: 30, hasta: null }, at: null, por: null };
  m.oportunidad = { lead_id: 901, nombre: 'Oportunidad inventada para la captura' };
  return JSON.parse(JSON.stringify(m));
})();

/* Cuatro estados del bloque, y cada uno es una imagen distinta. */
const ESTADOS = [
  { id: 'vacio', titulo: 'todo lo que falta', conf: null },
  { id: 'cuadra', titulo: 'la PO cuadra contra el subtotal',
    conf: { contacto: { partner_id: 1, nombre: 'Contacto Inventado Del Cliente',
                        tel: '81 1234 5678', correo: 'contacto@ejemplo.invalid' },
            iva: { decision: 'lleva', leyenda_id: null, leyenda_texto: '' },
            po: { numero: 'PO-INVENTADA-4471', importe: 100000,
                  archivo: { nombre: 'orden-de-compra-inventada.pdf', tipo: 'application/pdf',
                             bytes: 184320, paginas: 3, con_texto: true,
                             subido_at: '2026-09-28T00:00:00Z' },
                  veredicto: null, varias: null },
            anticipo: { aplica: false, pct: null } } },
  { id: 'no-cuadra', titulo: 'el descuadre, con su salida',
    conf: { contacto: { partner_id: 1, nombre: 'Contacto Inventado Del Cliente',
                        tel: '81 1234 5678', correo: 'contacto@ejemplo.invalid' },
            iva: { decision: 'lleva', leyenda_id: null, leyenda_texto: '' },
            po: { numero: 'PO-INVENTADA-4471', importe: 234567.89,
                  archivo: { nombre: 'orden-de-compra-escaneada-inventada.pdf',
                             tipo: 'application/pdf', bytes: 2411520, paginas: 5,
                             con_texto: false, subido_at: '2026-09-28T00:00:00Z' },
                  veredicto: null, varias: null },
            anticipo: { aplica: null, pct: null } } },
  { id: 'anticipo', titulo: 'arriba del umbral, con el monto sobre el subtotal',
    grande: true,
    conf: { contacto: { partner_id: 1, nombre: 'Contacto Inventado Del Cliente',
                        tel: '81 1234 5678', correo: 'contacto@ejemplo.invalid' },
            iva: { decision: 'no_lleva', leyenda_id: 'exportacion', leyenda_texto: '' },
            po: { numero: 'PO-INVENTADA-4471', importe: 850000,
                  archivo: { nombre: 'orden-de-compra-inventada.pdf', tipo: 'application/pdf',
                             bytes: 184320, paginas: 3, con_texto: true,
                             subido_at: '2026-09-28T00:00:00Z' },
                  veredicto: null, varias: null },
            anticipo: { aplica: true, pct: 30 } } }
];

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errores = [], hechas = [];

  for (const [w, h] of [[380, 1100], [760, 1100], [900, 1100], [1280, 1100]]) {
    for (const est of ESTADOS) {
      const m = JSON.parse(JSON.stringify(MACHOTE));
      if (est.conf) m.confirmacion = est.conf;
      /* El estado del anticipo necesita una orden ARRIBA del umbral: 850,000,
       * que con 30% da 255,000 — un número que se lee de un golpe en la imagen. */
      if (est.grande) m.secciones[0].partidas[0].pu = 850000;

      const p = await b.newPage({ viewport: { width: w, height: h } });
      p.on('pageerror', e => errores.push(w + 'px ' + est.id + ' PAGEERROR: ' + e.message));
      await p.route('**/geo.json*', r => r.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify(GEO) }));
      await p.addInitScript((cfg) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'p.p.p', actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
            scopes: ['comercial:read', 'comercial:write'],
            exp: Math.floor(Date.now() / 1000) + 3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1,
            guardado_at: new Date().toISOString(), machotes: [cfg.m], handoff: {} }));
          /* La libreta de sincronización, para que el modal no se trabe en «esta
           * cotización todavía no ha subido al servidor» — un estorbo real, pero
           * de otra versión, que llenaría la imagen de ruido. */
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({ v: 1, filas: [
            { id_local: cfg.m.id, machote_id: 'uuid-inventado', version: 3, folio: 77,
              folio_txt: 'COT-0077', subido_at: new Date().toISOString(),
              huella: 'x', odoo_lead_id: 901 }] }));
        } catch (e) {}
        const orig = window.fetch;
        window.fetch = function (u, o) {
          const s = String(u);
          if (s.indexOf('/comercial/clientes') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, total: 1,
              clientes: [{ id: 49, nombre: 'Cliente Industrial Inventado, SA de CV' }] }) });
          }
          if (s.indexOf('/comercial/machotes-leer') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true,
              modo: 'lista', actor: 'zz.prueba', machotes: [], total: 0 }) });
          }
          if (s.indexOf('/comercial/machote-guardar') >= 0 ||
              s.indexOf('/comercial/machote-archivar') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, hecho: true,
              machote_id: 'uuid-inventado', version: 4, versiones: 4 }) });
          }
          if (s.indexOf('/comercial/oportunidades') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true,
              modo: 'buscar', oportunidades: [], total: 0 }) });
          }
          if (s.indexOf('/comercial/beneficiarios') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true,
              modo: 'catalogo', internos: [], externos: [] }) });
          }
          return orig(u, o);
        };
      }, { m: m });

      await p.goto(BASE); await p.waitForTimeout(900);
      await p.evaluate((id) => { location.hash = '#/m/' + id; }, m.id);
      await p.waitForTimeout(700);

      /* Se abre el modal de la orden. El botón se busca por su texto y NO por un
       * id inventado: un selector que no calza haría que el guion tire la
       * captura del libro y la declare buena — un falso verde. */
      const abierto = await p.evaluate(() => {
        const bs = Array.prototype.slice.call(document.querySelectorAll('button, a'));
        const b2 = bs.find(x => /orden de venta|pasar a orden/i.test(x.textContent || ''));
        if (!b2) return false;
        b2.click(); return true;
      });
      if (!abierto) { errores.push(w + 'px ' + est.id + ': no encontré el botón de pasar a orden'); await p.close(); continue; }
      await p.waitForTimeout(1100);

      const hay = await p.$('#or-confirmables');
      if (!hay) { errores.push(w + 'px ' + est.id + ': el bloque de la confirmación NO se pintó'); await p.close(); continue; }
      /* Se desplaza el bloque a la vista antes de retratar: una captura del alto
       * de la ventana con el bloque fuera de cuadro es una imagen que pasa la
       * prueba y no enseña nada. */
      await p.evaluate(() => {
        const e = document.getElementById('or-confirmables');
        if (e) e.scrollIntoView({ block: 'start' });
      });
      await p.waitForTimeout(350);

      const f = path.join(SALIDA, w + '-' + est.id + '.png');
      await p.screenshot({ path: f });
      hechas.push(path.basename(f) + '  (' + est.titulo + ')');

      /* ── Las tres mediciones ─────────────────────────────────────────── */
      const med = await p.evaluate((ancho) => {
        const host = document.getElementById('or-confirmables');
        const out = { cero: [], sale: [], campos: 0 };
        if (!host) return out;
        const cs = host.querySelectorAll('input, select, .cfx-c, .cfx-cuadre, .cfx-falta');
        out.campos = cs.length;
        Array.prototype.forEach.call(cs, function (e) {
          const r = e.getBoundingClientRect();
          const visible = r.height > 0;
          if (visible && r.width < 1) {
            out.cero.push((e.className || e.tagName) + ' [' +
              (e.getAttribute('data-cfx') || '') + ']');
          }
          if (r.right > ancho + 2) {
            out.sale.push((e.className || e.tagName) + ' se sale ' + Math.round(r.right - ancho) + 'px');
          }
        });
        return out;
      }, w);
      if (!med.campos) errores.push(w + 'px ' + est.id + ': el bloque no tiene ni un campo');
      med.cero.forEach(x => errores.push(w + 'px ' + est.id + ': ancho CERO en ' + x));
      med.sale.forEach(x => errores.push(w + 'px ' + est.id + ': ' + x));

      const desb = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (desb > 2) errores.push(w + 'px ' + est.id + ': la página desborda ' + desb + 'px');
      await p.close();
    }
  }
  await b.close();
  console.log('Capturas en ' + SALIDA + '\n');
  hechas.forEach(x => console.log('  ' + x));
  if (errores.length) {
    console.log('\nPROBLEMAS:');
    errores.forEach(e => console.log('  ' + e));
    process.exit(1);
  }
  console.log('\n' + hechas.length + ' capturas · sin desbordes, sin anchos en cero, sin errores de página.');
  console.log('⚠️ Ahora hay que MIRARLAS: un guion en verde no es una pantalla revisada.');
})();
