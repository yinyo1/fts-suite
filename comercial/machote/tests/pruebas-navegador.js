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

/* El motor REAL, del lado de Node, para fabricar fixturas del tamaño de
 * producción sin copiar a mano la forma de una sección. Mismo archivo que
 * corre en la pantalla: si `machoteNuevo` cambia, la fixtura cambia con él. */
const CALC = (function () {
  const vm = require('vm');
  const ctx = { window: {}, console: console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(require('fs').readFileSync(
    path.resolve(__dirname, '..', 'js', 'calc.js'), 'utf8'), ctx);
  return ctx.window.MachoteCalc;
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

let ok = 0, mal = 0;

(async () => {
  const b = await chromium.launch(OPCIONES);
  const errs = [];
  const p = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(p);
await sembrarMachotes(p);
  /* El autoguardado es REAL: sin esto, cada prueba heredaria lo que guardo la
   * anterior y volveria la cascada de fallos que resolvio el recargar. Corre
   * ANTES de los scripts de la pagina en cada navegacion, asi que la app
   * siempre arranca con la demo. Cuesta cero recargas extra.
   * La persistencia se prueba aparte, en una pagina SIN este guion. */
  await p.addInitScript(() => {
    try {
      localStorage.clear();
      /* El libro está detrás del gate de `shared/auth-jwt.js`. Las pruebas se
       * autentican solas sembrando una sesión, en vez de que el gate traiga una
       * excepción para `file://`: una excepción es un camino que puede quedarse
       * abierto en producción sin que nadie lo note (CLAUDE.md §11 #14, el caso
       * del reconocimiento facial en bypass silencioso durante semanas).
       * Que el gate BLOQUEA de verdad se prueba aparte, en una página sin esto. */
      localStorage.setItem('fts_suite_session', JSON.stringify({
        token: 'prueba.prueba.prueba',
        actor: 'zz.prueba', nombre: 'ZZ Prueba', empleado_id: null,
        scopes: ['comercial:read'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        debe_cambiar_password: false
      }));
    } catch (e) {}

    /* El catálogo de clientes se finge. Dos razones:
     *   - Determinismo: la prueba no puede depender de lo que haya hoy en Odoo.
     *   - El contenedor no alcanza Railway (403 del proxy), así que un fetch
     *     real ensucia la consola con un error que NO es del prototipo.
     * Se intercepta SÓLO la URL del catálogo; cualquier otro fetch pasa. */
    const original = window.fetch;
    window.fetch = function (u, o) {
      if (String(u).indexOf('/comercial/clientes') >= 0) {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({ ok: true, total: 3, clientes: [
              { id: 49,   nombre: 'ABINSA SA DE CV' },
              { id: 1247, nombre: 'BBVA México' },
              { id: 385,  nombre: 'Abamex Ingeniería, SA de CV' }
            ] });
          }
        });
      }
      /* Los dos endpoints del almacén (#140). Se fingen por las MISMAS dos
       * razones que el catálogo: determinismo, y que el contenedor no alcanza
       * Railway —un fetch real deja un error en consola que no es del código.
       *
       * El servidor finge estar VACÍO y aceptar todo. Así se prueba lo que le
       * toca a esta capa —que la pantalla arranca de la caché, que lo local
       * nunca se pierde y que el pulso dice la verdad— sin volver a probar el
       * servidor, que ya se probó contra la base real por su propio camino. */
      if (String(u).indexOf('/comercial/machotes-leer') >= 0) {
        return Promise.resolve({ ok: true, json: function () {
          return Promise.resolve({ ok: true, modo: 'lista', actor: 'zz.prueba',
                                   machotes: [], total: 0 });
        } });
      }
      /* V1.29 · archivar ESCRIBE AL SERVIDOR, asi que sin esto la equis no
       * hace nada en las pruebas. Se apunta cada llamada para poder afirmar
       * que salio, que es justo lo que antes no pasaba. */
      if (String(u).indexOf('/comercial/machote-archivar') >= 0) {
        var ca = {};
        try { ca = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        window.__archivados = (window.__archivados || []);
        window.__archivados.push({ accion: ca.accion, machote_id: ca.machote_id,
                                   machote_ids: ca.machote_ids || null, para: ca.para || null,
                                   forzada: ca.forzada === true, motivo: ca.motivo || null });
        if (window.__archivarFalla) {
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: false, hecho: false,
              error: window.__archivarFalla,
              mensaje: window.__archivarFallaMsg || 'No se pudo.' });
          } });
        }
        return Promise.resolve({ ok: true, json: function () {
          return Promise.resolve({ ok: true, hecho: true,
            accion: ca.accion, machote_id: ca.machote_id,
            folio: 41, folio_txt: 'COT-0041', versiones: 3,
            archivado: ca.accion !== 'desarchivar',
            archivado_at: new Date().toISOString(), archivado_por: 'zz.prueba',
            mensaje: ca.accion === 'desarchivar'
              ? 'Devuelta a la lista. Conserva su folio COT-0041 y sus 3 version(es).'
              : 'Archivada. No se borro nada: conserva su folio COT-0041 y sus 3 version(es).' });
        } });
      }
      if (String(u).indexOf('/comercial/machote-guardar') >= 0) {
        var cuerpo = {};
        try { cuerpo = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        window.__guardadosAlServidor = (window.__guardadosAlServidor || 0) + 1;
        window.__ultimoGuardado = cuerpo;
        return Promise.resolve({ ok: true, json: function () {
          return Promise.resolve({ ok: true, machote_id: 'uuid-de-mentiras',
            id_local: cuerpo.id_local, dueno: 'zz.prueba',
            version: (Number(cuerpo.version_leida) || 0) + 1, versiones: 1,
            autor: 'zz.prueba', guardada_at: new Date().toISOString() });
        } });
      }
      return original.apply(this, arguments);
    };
  });
  /* El contenedor no tiene salida a fonts.googleapis.com, que fts-styles.css
   * importa. Ese fallo es del entorno de prueba, no del prototipo: se filtra
   * por nombre y se reporta aparte, nunca callando el resto.
   *
   * V1.27 · se suma `version.json`: el vigilante de versión lo pide con
   * `fetch`, y `fetch` de `file://` está bloqueado en Chromium (la misma razón
   * por la que el catálogo de países se siembra). En el dominio sí carga —eso
   * se comprueba aparte, contra Pages— y el vigilante ya trata el fallo como
   * no-op silencioso, que es justo lo que debe hacer sin red. */
  const delEntorno = [];
  /* V1.32 · se suma `ERR_CERT_AUTHORITY_INVALID`. El proxy del sandbox
   * intercepta TLS con su propia CA, y Chromium la rechaza — el mensaje de
   * consola llega SIN url, así que no se puede filtrar por dominio. Medido
   * antes de agregarlo, con `requestfailed`, que sí trae la url:
   *   net::ERR_CERT_AUTHORITY_INVALID  https://fonts.googleapis.com/css2?family=Inter…
   * O sea la MISMA petición que ya se filtraba por nombre, fallando de otra
   * forma. Es del entorno, no del módulo: en el dominio la fuente carga. */
  const esDelEntorno = (t) => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_CERT_AUTHORITY_INVALID|fonts\.googleapis|fonts\.gstatic/.test(t)
    || (/version\.json/.test(t) && /file/.test(t));
  p.on('console', m => { if (m.type() !== 'error') return;
    (esDelEntorno(m.text()) ? delEntorno : errs).push('CONSOLE: ' + m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  /* Correr UNA sola prueba: `SOLO='pr[eé]stamo' node tests/pruebas-navegador.js`.
   * La suite entera tarda ~55 minutos y eso vuelve carísimo iterar sobre una
   * pantalla nueva —se acaba mirando el diff en vez de la pantalla, que es
   * justo el modo de falla de CLAUDE.md §20 #12—. El filtro no cambia lo que
   * hace ninguna prueba: sólo deja saltarse las que no se están tocando.
   * ⚠️ La ENTREGA se mide siempre con la suite completa, sin `SOLO`. */
  const SOLO = process.env.SOLO ? new RegExp(process.env.SOLO, 'i') : null;
  let saltadas = 0;
  const paso = async (n, fn) => {
    if (SOLO && !SOLO.test(n)) { saltadas++; return; }
    try { await fn(); console.log('✓', n); ok++; }
    catch (e) { console.log('✗', n, '→', e.message); mal++; }
  };
  /* Navegar a una ruta, con el estado LIMPIO.
   *
   * El estado vive en memoria y las pruebas de V1.06 mutan de verdad: agregan
   * renglones, renombran secciones, duplican. Sin recargar, cada prueba hereda
   * lo que hizo la anterior y los fallos se vuelven cascada — una prueba de
   * layout terminaba fallando porque otra le había puesto once secciones al
   * machote. Recargar aísla, y cuesta ~200 ms. */
  const ir = async (h) => {
    await p.goto(BASE);
    await p.waitForTimeout(220);
    if (h && h !== '#/') {
      await p.evaluate(x => { location.hash = x; }, h);
      await p.waitForTimeout(260);
    }
  };
  /* Navegación SUAVE: cambia de pantalla sin recargar. La necesitan las
   * pruebas que miden justamente lo que el estado recuerda entre pantallas —
   * recargar borraría lo que se está midiendo. */
  const irSuave = async (h) => {
    await p.evaluate(x => { location.hash = x; }, h);
    await p.waitForTimeout(260);
  };
  // Abre una hoja del libro por su nombre.
  const hoja = async (nom) => {
    const b = p.locator('.pestana', { hasText: nom });
    await b.first().click(); await p.waitForTimeout(240);
  };

  await p.goto(BASE); await p.waitForTimeout(400);

  // ── El motor, contra el archivo real ─────────────────────────────────
  await paso('el motor reproduce Factor_req de Paso de Gato SO11782', async () => {
    const f = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = { moneda: 'MXN', tc: 0, factor_proteccion: 0,
        margenes: { programador: 4.4, mano_obra: 2.5, materiales: 2.5, servicios: 1.8 },
        comision_fts: 0.055, comision_cliente: 0, margen_deseado: 0.40, escenario: 'margen_deseado',
        secciones: [{ id: 1, nombre: 'S1',
          mo: [{ rol: 'supervisor_sr', qty: 1, personas: 1, pu: 200, moneda: 'MXN' }],
          partidas: [{ qty: 1, tipo: 'Servicios', descripcion: 'x', pu: 800000, moneda: 'MXN', link: 'x' }] }] };
      const r = C.calcular(m);
      return { factor: r.factorReq, ventaMo: r.ventaMo, ventaMat: r.ventaMat };
    });
    if (f.factor.toFixed(9) !== '1.730103806') throw new Error('Factor_req ' + f.factor);
    if (f.ventaMo !== 500) throw new Error('venta MO ' + f.ventaMo);
    if (f.ventaMat !== 1440000) throw new Error('venta mat ' + f.ventaMat);
    console.log('   Factor_req', f.factor.toFixed(9), '= celda H14 del archivo');
  });

  // Segunda validación, contra un archivo DISTINTO: reproducir un solo libro
  // no prueba que el motor sea correcto, prueba que copié bien ese libro.
  // SO11772 tiene otra mezcla (dos comisiones, materiales 1,8) y su precio CON
  // UTILIDAD es exactamente el amount_untaxed de la orden en Odoo: 13,362.
  await paso('el motor cuadra renglón por renglón contra SO11772', async () => {
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = { moneda: 'MXN', tc: 0, factor_proteccion: 0,
        margenes: { programador: 4.4, mano_obra: 2.5, materiales: 1.8, servicios: 1.7 },
        comision_fts: 0.055, comision_cliente: 0.05, margen_deseado: 0.40, escenario: 'con_utilidad',
        secciones: [{ id: 1, nombre: 'S1',
          mo: [{ rol: 'supervisor_sr', qty: 8.5, personas: 1, pu: 200, moneda: 'MXN' }],
          partidas: [{ qty: 1, tipo: 'Materiales', descripcion: 'agregado', pu: 4340, moneda: 'MXN', link: 'x' }] }] };
      const c = C.calcular(m);
      return { costoMo: c.costoMo, costoMat: c.costoMat, ventaMo: c.ventaMo, ventaMat: c.ventaMat,
        comFts: c.escenarios.con_utilidad.comisionFts, comCli: c.escenarios.con_utilidad.comisionCliente,
        precioCU: c.escenarios.con_utilidad.precio, margenCU: c.escenarios.con_utilidad.margen,
        precioMD: c.escenarios.margen_deseado.precio, utilMD: c.escenarios.margen_deseado.utilidad };
    });
    const esp = { costoMo: 1700, costoMat: 4340, ventaMo: 4250, ventaMat: 7812, comFts: 663,
                  comCli: 636, precioCU: 13362, precioMD: 12014, utilMD: 4806 };
    Object.keys(esp).forEach(k => {
      if (Math.abs(r[k] - esp[k]) > 1) throw new Error(k + ': ' + r[k] + ' ≠ ' + esp[k] + ' del archivo');
    });
    if (Math.abs(r.margenCU - 0.4507) > 0.0002) throw new Error('margen ' + r.margenCU);
    console.log('   11 renglones cuadran · precio CON UTILIDAD 13,362 = amount_untaxed de la SO en Odoo');
  });

  await paso('el multiplicador de horas extras es mano de obra × 2', async () => {
    const x = await p.evaluate(() => window.MachoteCalc.margenes({ margenes: { mano_obra: 2.5 } }).extra);
    /* Y con la sección pisando al machote, el de horas extras sigue la de la
     * sección: es mano de obra × 2, sea de donde sea que salga. */
    const y = await p.evaluate(() => window.MachoteCalc.margenes(
      { margenes: { mano_obra: 2.5 } }, { margenes: { mano_obra: 3 } }).extra);
    if (y !== 6) throw new Error('con sección debía dar 6, dio ' + y);
    if (x !== 5) throw new Error('extra = ' + x);
  });

  await paso('el Tipo elige el multiplicador', async () => {
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = { moneda: 'MXN', margenes: { materiales: 1.8, servicios: 1.7, mano_obra: 2.5, programador: 4.4 } };
      return [C.costoPartida({ qty: 1, pu: 100, tipo: 'Materiales' }, m).conUtilidad,
              C.costoPartida({ qty: 1, pu: 100, tipo: 'Servicios' }, m).conUtilidad,
              C.costoPartida({ qty: 1, pu: 100, tipo: '' }, m).conUtilidad];
    });
    if (r[0] !== 180 || r[1] !== 170 || r[2] !== 0) throw new Error(JSON.stringify(r));
    console.log('   Materiales 180 · Servicios 170 · sin tipo 0 (se reporta como hueco)');
  });

  await paso('mano de obra es tarifa × personas × horas', async () => {
    const r = await p.evaluate(() => window.MachoteCalc.costoMo(
      { rol: 'tecnicos', qty: 10, personas: 3, pu: 140 },
      { moneda: 'MXN', margenes: { mano_obra: 2.5 } }).costo);
    if (r !== 4200) throw new Error('costo ' + r);
  });

  await paso('un precio vacío es hueco, no cero', async () => {
    const r = await p.evaluate(() => window.MachoteCalc.costoPartida({ qty: 5, pu: null, tipo: 'Materiales' }, { moneda: 'MXN' }));
    if (!r.sinPrecio || r.costo !== 0) throw new Error(JSON.stringify(r));
  });

  await paso('el machote suma monedas y aquí sí se convierten', async () => {
    const r = await p.evaluate(() => window.MachoteCalc.costoPartida(
      { qty: 1, pu: 100, tipo: 'Materiales', moneda: 'USD' },
      { moneda: 'MXN', tc: 18, factor_proteccion: 0.05 }).costo);
    if (Math.abs(r - 1890) > 0.01) throw new Error('costo ' + r);
  });

  // La versión se escribe en dos lugares -la constante de app.js y
  // version.json- y que se separen deja la pantalla mintiendo sobre qué estás
  // viendo, que es justo para lo que sirve.
  await paso('la versión se ve en pantalla y coincide con version.json', async () => {
    const ver = JSON.parse(require('fs').readFileSync(
      path.resolve(__dirname, '..', 'version.json'), 'utf8'));

    const m = /^V(\d+)\.(\d{2})$/.exec(ver.version);
    if (!m) throw new Error('formato inválido: ' + ver.version + ' (se espera V1.00 … V1.99)');
    if (Number(m[2]) > 99) throw new Error('el menor pasa de 99: ' + ver.version);

    await ir('#/');
    const pie = (await p.textContent('.ver') || '').trim();
    if (pie.indexOf(ver.version) < 0) throw new Error('el pie dice "' + pie + '" y version.json ' + ver.version);

    /* En V1.21 la versión salió del subtítulo —el encabezado se compactó— y
     * vive en su propio hueco de la barra. Lo que se sigue exigiendo es lo
     * mismo: que se vea SIN salir de la pantalla del machote, porque es como
     * Esteban comprueba que su cambio se desplegó. */
    await ir('#/m/M-1041');
    const barra = (await p.textContent('#tbV') || '').trim();
    if (barra.indexOf(ver.version) < 0) throw new Error('la barra superior dice: «' + barra + '»');
    const visible = await p.$eval('#tbV', el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    if (!visible) throw new Error('la versión está en el DOM pero no se ve');
    console.log('   ', ver.version, '· visible en la lista y en la barra');
  });

  // Un incremento de 0.01 por merge. Sin saltos ni repeticiones: si se salta
  // un número, la versión deja de decir cuántos despliegues van.
  await paso('el historial de versiones sube de uno en uno', async () => {
    const ver = JSON.parse(require('fs').readFileSync(
      path.resolve(__dirname, '..', 'version.json'), 'utf8'));
    const h = ver.historial || [];
    if (!h.length) throw new Error('sin historial');
    if (h[0].version !== ver.version)
      throw new Error('el historial encabeza con ' + h[0].version + ' y la vigente es ' + ver.version);

    const aNum = (v) => { const m = /^V(\d+)\.(\d{2})$/.exec(v);
      if (!m) throw new Error('formato inválido en el historial: ' + v);
      return Number(m[1]) * 100 + Number(m[2]); };

    for (let i = 0; i < h.length - 1; i++) {
      const hoy = aNum(h[i].version), antes = aNum(h[i + 1].version);
      if (hoy - antes !== 1)
        throw new Error(h[i + 1].version + ' → ' + h[i].version + ' salta ' + (hoy - antes) + ' en vez de 1');
    }
    console.log('   ', h.length, 'versiones ·', h[h.length - 1].version, '→', h[0].version);
  });

  // ── La hoja ──────────────────────────────────────────────────────────
  await paso('la lista carga con sus machotes', async () => {
    /* Contaba SEIS `.item`: cuatro machotes de ejemplo más los dos enlaces de
     * la sección «Confirmar la orden». Esa sección se retiró en V1.24 —listaba
     * órdenes de ejemplo debajo de cotizaciones reales— así que el seis dejó
     * de significar nada. Lo que sigue significando algo es que la lista traiga
     * un renglón por machote, y eso es lo que se cuenta ahora.
     *
     * Se cuenta contra `D.MACHOTES` y no contra un número escrito a mano: un
     * literal aquí volvería a quedarse viejo el día que cambie la demo. */
    await ir('#/');
    const esperados = await p.evaluate(() => window.DEMO.MACHOTES.length);
    const n = await p.locator('.cards .fila').count();
    if (n !== esperados) throw new Error('pinta ' + n + ' de ' + esperados + ' machotes');
    if (await p.$('a[href^="#/orden/"]'))
      throw new Error('sigue la sección de confirmar la orden');
    console.log('    ' + n + ' machotes · sin sección de orden');
  });

  await paso('el libro abre con sus pestañas de hoja', async () => {
    await ir('#/m/M-1041');
    const t = await p.locator('.pestana').allTextContents();
    if (!t[0] || !/DESGLOSE/.test(t[0])) throw new Error('primera pestaña: ' + t[0]);
    if (t.length < 3) throw new Error('faltan hojas: ' + t.join(' | '));
    console.log('   hojas:', t.filter(x => x !== '+').join(' · '));
  });

  await paso('la hoja de sección trae los encabezados del machote', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const t = await p.textContent('#hoja');
    for (const x of ['Costos desglosados', 'Margen de utilidad', 'NOMBRE DE SECCIÓN',
                     'COSTO MANO DE OBRA', 'COSTO MATERIALES Y SERVICIOS',
                     'Precio de Venta FTS', 'Horas sección']) {
      if (t.indexOf(x) < 0) throw new Error('falta: ' + x);
    }
  });

  await paso('los diez renglones del Excel siguen enteros, y el viaje va aparte', async () => {
    /* V1.26 · esta prueba decía «los diez renglones están siempre, en sus tres
     * grupos» y afirmaba `soloMo.length === 10`. Ahora son 13, porque entraron
     * los de viaje.
     *
     * NO se cambió el 10 por un 13: eso habría tirado justo lo que la prueba
     * protegía —que la retícula verificada contra los archivos de FTS sigue
     * completa— a cambio de un número que no dice nada. Se afirma lo que
     * importa: **los diez del Excel, uno por uno, en sus tres grupos**, y los
     * tres nuevos en un grupo propio, que es como se distinguen de un vistazo. */
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const g = await p.locator('#hoja tr.grupo').allTextContents();
    for (const e of ['Diseño y Programación', 'En Planta', 'Extras'])
      if (!g.some(x => x.indexOf(e) >= 0)) throw new Error('falta grupo del Excel: ' + e);
    if (!g.some(x => x.indexOf('Viaje y trabajo foráneo') >= 0))
      throw new Error('los renglones de viaje no tienen grupo propio');

    const rot = (await p.locator('#hoja td.rotulo').allTextContents()).filter(x => x !== 'TOTAL');
    const DEL_EXCEL = ['Diseño', 'Programador', 'Supervisor Sr', 'Supervisor Jr · seguridad',
      'Técnicos', 'Horas extras supervisor', 'Horas extras Jr · seguridad',
      'Horas extras técnicos', 'Horas extras programador', 'Horas extras diseño'];
    const faltan = DEL_EXCEL.filter(x => rot.indexOf(x) < 0);
    if (faltan.length) throw new Error('se perdieron renglones del Excel: ' + faltan.join(', '));

    const DE_VIAJE = ['Días de viaje', 'Horas en fin de semana', 'Horas en día festivo'];
    const sinViaje = DE_VIAJE.filter(x => rot.indexOf(x) < 0);
    if (sinViaje.length) throw new Error('faltan renglones de viaje: ' + sinViaje.join(', '));

    if (rot.length !== DEL_EXCEL.length + DE_VIAJE.length)
      throw new Error('hay renglones de más: ' + rot.filter(x =>
        DEL_EXCEL.indexOf(x) < 0 && DE_VIAJE.indexOf(x) < 0).join(', '));
    console.log('    los 10 del Excel + los 3 de viaje, cada grupo en su sitio');
  });

  await paso('la hoja DESGLOSE trae los cuatro bloques del machote', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');
    const t = await p.textContent('#hoja');
    for (const x of ['ELIGE UN ESCENARIO', 'RESUMEN BUDGET', 'RESUMEN POR SECCIÓN',
                     'BUDGET ODOO', 'TABLA DE COMISIONES Y BONOS', 'Factor_req',
                     'PRECIO DE VENTA ANTE DE IMPUESTO']) {
      if (t.indexOf(x) < 0) throw new Error('falta: ' + x);
    }
  });

  await paso('la tabla por sección tiene las diez ranuras del machote', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');
    const filas = await p.locator('#hoja .rejilla.ancha tbody tr').count();
    if (filas < 11) throw new Error('filas: ' + filas + ' (10 ranuras + SUMA)');
  });

  await paso('cambiar el escenario mueve el precio de la barra', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');
    const v = [];
    for (const e of ['costo', 'con_utilidad', 'margen_deseado']) {
      await p.click('[data-esc="' + e + '"]'); await p.waitForTimeout(200);
      v.push((await p.textContent('.fija .mono')).trim());
    }
    if (new Set(v).size !== 3) throw new Error('escenarios iguales: ' + v.join(' | '));
    console.log('   costo', v[0], '· con utilidad', v[1], '· margen deseado', v[2]);
  });

  await paso('editar una celda recalcula', async () => {
    await ir('#/m/M-1042'); await hoja('DESGLOSE');
    await p.click('[data-esc="con_utilidad"]'); await p.waitForTimeout(200);
    await hoja('Adecuación');
    const antes = await p.textContent('.fija .mono');
    const celMat = '[data-cel^="mg:"][data-cel$=":materiales"]';
    await p.fill(celMat, '3.2');
    await p.dispatchEvent(celMat, 'input');
    await p.waitForTimeout(250);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('no se movió: ' + antes);
    console.log('   ', antes.trim(), '→', desp.trim());
  });

  await paso('un margen pisado a mano se marca', async () => {
    await ir('#/m/M-1041');
    await hoja('Instalación');
    const n = await p.locator('#hoja .cel.pisado').count();
    if (n === 0) throw new Error('no marcó ninguno');
    console.log('   ', n, 'renglón(es) con el margen escrito encima de la fórmula');
  });

  await paso('el revisador encuentra la partida sin precio', async () => {
    await ir('#/rev/M-1041');
    if (!/Partidas sin precio/.test(await p.textContent('#vista'))) throw new Error('no la reportó');
  });

  await paso('el revisador encuentra el reparto de comisiones descuadrado', async () => {
    await ir('#/rev/M-1044');
    const t = await p.textContent('#vista');
    if (!/no suma 100/.test(t)) throw new Error('no lo reportó');
    if (!/BUDGET ODOO no cuadra/.test(t)) throw new Error('no reportó el descuadre');
  });

  await paso('el revisador exige tipo de cambio cuando hay dos monedas', async () => {
    await ir('#/rev/M-1043');
    if (!/no hay tipo de cambio/.test(await p.textContent('#vista'))) throw new Error('no lo reportó');
  });

  /* ── V1.25 · dos pruebas RETIRADAS aquí ───────────────────────────────────
   * Eran «la estación 3.0 no deja cerrar el handoff incompleto» y «marcar todo
   * habilita el cierre, y la marca no se pierde». Las dos abrían
   * `#/orden/O-9001` y ejercían `vOrden`, la pantalla de cierre de handoff.
   *
   * Se van porque la pantalla se fue: corría sobre `D.ORDENES` —datos de
   * ejemplo, nunca del servidor— y marcaba «confirmada» en un estado de
   * memoria; su único enlace era la sección «Confirmar la orden» que se retiró
   * en V1.24, así que llevaba una versión alcanzable sólo tecleando el hash.
   *
   * No se sustituyen por nada, y es a propósito: no cubrían una regla del
   * negocio que siga viva en otro lado, cubrían el comportamiento de un
   * andamio. El camino de verdad a una orden es «Pasar a orden» desde el
   * machote abierto (`js/orden.js`), que sigue enlazado y tiene sus pruebas
   * aparte. El porqué del retiro está en `docs/comercial/ANDAMIO.md`. */

  await paso('volver al mismo machote conserva la hoja donde ibas', async () => {
    await ir('#/m/M-1041'); await hoja('Instalación');
    await irSuave('#/rev/M-1041');
    await irSuave('#/m/M-1041');
    const on = await p.locator('.pestana.on').textContent();
    if (!/Instalación/.test(on)) throw new Error('cayó en: ' + on);
  });

  // El precio es lo único que el analista mira sin parar. Que un botón se lo
  // coma es un fallo silencioso: la pantalla se ve bien y el dato no está.
  await paso('la barra siempre muestra el precio, no sólo el botón', async () => {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      await p.setViewportSize({ width: w, height: h });
      await ir('#/m/M-1041');
      const r = await p.evaluate(() => {
        const g = document.querySelector('.fija .grow');
        const b = document.querySelector('.fija .btn');
        return { ancho: g ? Math.round(g.getBoundingClientRect().width) : -1,
                 texto: g ? g.textContent.trim().slice(0, 20) : '',
                 botones: document.querySelectorAll('.fija .btn').length,
                 boton: b ? Math.round(b.getBoundingClientRect().width) : -1 };
      });
      /* ⚠️ V1.27 · con TRES botones (propio y ya subido: pasar a orden, prestar
       * y revisar) al precio le quedaban 4 px en un teléfono de 390. No se veía
       * porque la fixture eran los ejemplos, y un ejemplo no se puede prestar.
       * Se afirma el caso real. */
      if (r.ancho < 120) throw new Error('a ' + w + 'px el precio mide ' + r.ancho +
        'px de ancho, con ' + r.botones + ' botones');
      if (!/\$/.test(r.texto)) throw new Error('a ' + w + 'px no hay precio: ' + r.texto);
      if (r.boton > w * 0.6) throw new Error('a ' + w + 'px el botón ocupa ' + r.boton + 'px');
    }
    await p.setViewportSize({ width: 380, height: 780 });
  });

  // ══ V1.05 · captura contra cálculo ═══════════════════════════════════
  //
  // El hallazgo de la auditoría: la celda editable era transparente y sólo
  // sacaba borde al pasar el mouse, que en un teléfono no existe. En el
  // dispositivo donde más se captura, la distinción no estaba.

  await paso('lo que se captura y lo que se calcula se ven distinto', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const cel = document.querySelector('.rejilla .cel:not(.pisado)');
      const cal = document.querySelector('.rejilla td.calc');
      if (!cel || !cal) return { falta: !cel ? 'celda de captura' : 'celda calculada' };
      const a = getComputedStyle(cel), b = getComputedStyle(cal);
      const marca = getComputedStyle(cal, '::after');
      return { bordeCel: a.borderTopWidth, fondoCel: a.backgroundColor,
               fondoCal: b.backgroundColor, barraCal: marca.width,
               editableCal: !!cal.querySelector('input,select') };
    });
    if (r.falta) throw new Error('no encontré ' + r.falta);
    if (r.bordeCel === '0px') throw new Error('la celda de captura no tiene borde');
    if (r.fondoCel === r.fondoCal) throw new Error('mismo fondo: ' + r.fondoCel);
    if (r.barraCal === '0px' || r.barraCal === 'auto')
      throw new Error('la celda calculada no trae su marca de fórmula');
    if (r.editableCal) throw new Error('una celda calculada tiene campo editable dentro');
    console.log('   captura borde', r.bordeCel, '· calculado sin caja + barra de', r.barraCal);
  });

  // La distinción no puede ser sólo color: quien no los distingue tiene que
  // ver la diferencia igual.
  await paso('la distinción no depende sólo del color', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const cel = document.querySelector('.rejilla .cel:not(.pisado)');
      const cal = document.querySelector('.rejilla td.calc');
      return { bordeCel: getComputedStyle(cel).borderTopWidth,
               bordeCal: getComputedStyle(cal).borderLeftWidth,
               barra: getComputedStyle(cal, '::after').width,
               radioCel: getComputedStyle(cel).borderTopLeftRadius };
    });
    // Tres señales distintas del color: caja con borde, esquinas redondeadas,
    // y la barra de fórmula del lado izquierdo del derivado.
    if (r.bordeCel === '0px' || r.radioCel === '0px')
      throw new Error('la caja de captura perdió su forma');
    if (r.barra === '0px') throw new Error('el derivado perdió su barra');
  });

  await paso('un derivado no se puede editar por accidente', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const n = await p.locator('.rejilla td.calc input, .rejilla td.calc select').count();
    if (n) throw new Error(n + ' celda(s) calculada(s) con campo editable dentro');
  });

  await paso('al teclear, el derivado del renglón cambia sin robar el foco', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const campo = p.locator('.rejilla.tarjetas tr:visible [data-cel$=":qty"]').first();
    await campo.click();
    const antes = await p.evaluate(() => {
      const tr = document.activeElement.closest('tr');
      return tr.querySelector('td.calc').textContent.trim();
    });
    await campo.type('9');            // teclea de verdad, sin blur
    await p.waitForTimeout(220);
    const r = await p.evaluate(() => {
      const foco = document.activeElement;
      const tr = foco.closest('tr');
      return { total: tr ? tr.querySelector('td.calc').textContent.trim() : null,
               sigueEnfocado: foco.matches('[data-cel$=":qty"]'),
               cursor: foco.selectionStart };
    });
    if (!r.sigueEnfocado) throw new Error('perdió el foco al teclear');
    if (r.total === antes) throw new Error('el derivado no se movió: ' + antes);
    console.log('   ', antes, '→', r.total, '· foco intacto');
  });

  await paso('el derivado que cambió parpadea, y sólo ese', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const campo = p.locator('.rejilla.tarjetas tr:visible [data-cel$=":qty"]').first();
    await campo.click(); await campo.type('7');
    await p.waitForTimeout(120);
    const n = await p.locator('td.calc.cambio').count();
    if (n === 0) throw new Error('ninguna celda marcó el cambio');
    const total = await p.locator('td.calc').count();
    if (n === total) throw new Error('parpadearon todas (' + n + '), no sólo las que cambiaron');
    console.log('   ', n, 'de', total, 'celdas derivadas marcaron el cambio');
  });

  await paso('el margen pisado se ve distinto y dice cuál le tocaría', async () => {
    await ir('#/m/M-1041'); await hoja('Instalación');
    const pis = p.locator('.cel.pisado').first();
    if (await p.locator('.cel.pisado').count() === 0) throw new Error('no marcó ninguno');
    const r = await p.evaluate(() => {
      const a = document.querySelector('.cel.pisado');
      const b = document.querySelector('.cel:not(.pisado)');
      const marca = document.querySelector('.pisado-marca');
      return { fondoPis: getComputedStyle(a).backgroundColor,
               fondoNor: getComputedStyle(b).backgroundColor,
               peso: getComputedStyle(a).fontWeight,
               marca: marca ? marca.textContent.trim() : null };
    });
    if (r.fondoPis === r.fondoNor) throw new Error('mismo fondo que un margen normal');
    if (!r.marca || !/≠/.test(r.marca)) throw new Error('sin marca de texto: ' + r.marca);
    console.log('   pisado', r.fondoPis, '· marca "' + r.marca + '"');
  });

  await paso('la leyenda explica las tres señales', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const t = await p.textContent('.leyenda');
    for (const x of ['se captura', 'lo calcula la hoja', 'margen escrito a mano'])
      if (t.indexOf(x) < 0) throw new Error('falta: ' + x);
  });

  // El factor de protección sólo mueve el precio si hay renglones en OTRA
  // moneda Y hay tipo de cambio declarado. M-1043 mezcla monedas pero nace con
  // tc = 0, que es justo lo que el revisador reporta como hallazgo duro: hay
  // que declararlo primero.
  await paso('el factor de protección se captura y afecta la conversión', async () => {
    await ir('#/m/M-1043'); await hoja('DESGLOSE');
    if (await p.locator('[data-cel="factor_proteccion"]').count() === 0)
      throw new Error('no está en la pantalla');

    await p.fill('[data-cel="tc"]', '18');
    await p.dispatchEvent('[data-cel="tc"]', 'change');
    await p.waitForTimeout(280);
    const antes = await p.textContent('.fija .mono');
    const tcAntes = await p.textContent('td.calc:near(:text("TC efectivo"))').catch(() => null);

    // Desde V1.14 se teclea en PORCENTAJE: 10, no 0.10.
    await p.fill('[data-cel="factor_proteccion"]', '10');
    await p.dispatchEvent('[data-cel="factor_proteccion"]', 'change');
    await p.waitForTimeout(280);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('cambiarlo no movió el precio: ' + antes);

    /* Y lo guardado sigue siendo la RAZÓN, no el porcentaje.
     *
     * ⚠️ Hay que ESPERAR al autoguardado (500 ms de rebote). Antes esta lectura
     * caía a los 280 ms y encontraba el almacén todavía vacío, así que
     * `guardado` era `null` y la comprobación de abajo —que está escrita para
     * saltarse el caso -no se llegó a guardar-— no comprobaba nada. Pasaba en
     * verde sin medir. Es la trampa de §20 #11: un vacío se ve igual que un
     * acierto. */
    await p.waitForTimeout(900);
    const guardado = await p.evaluate(() => {
      const c = localStorage.getItem('fts_machote_v1');
      if (!c) return null;
      const m = JSON.parse(c).machotes.find(x => x.id === 'M-1043');
      return m ? m.factor_proteccion : null;
    });
    if (guardado === null) throw new Error('no llegó a guardarse nada');
    if (Math.abs(guardado - 0.10) > 1e-6)
      throw new Error('guardó ' + guardado + ', esperaba 0.10');
    console.log('   con tc=18:', antes.trim(), '→ con factor 10%:', desp.trim());
  });

  // ══ V1.06 · edición estructural y moneda ═════════════════════════════

  await paso('agregar un renglón mueve el total', async () => {
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const antes = await p.textContent('.fija .mono');
    const n0 = await p.locator('[data-cel$=":descripcion"]').count();
    await p.click('[data-add]'); await p.waitForTimeout(280);
    if (await p.locator('[data-cel$=":descripcion"]').count() !== n0 + 1)
      throw new Error('no se agregó el renglón');
    // El renglón nace sin precio, así que el total no cambia todavía: lo que
    // debe cambiar es el conteo de huecos.
    const pu = p.locator('[data-cel$=":pu"]').last();
    await pu.fill('5000'); await pu.dispatchEvent('change');
    await p.waitForTimeout(300);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('el total no se movió: ' + antes);
    console.log('   ', antes.trim(), '→', desp.trim());
  });

  await paso('duplicar un renglón lo copia justo debajo', async () => {
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const desc0 = await p.locator('[data-cel$=":descripcion"]').first().inputValue();
    const n0 = await p.locator('[data-cel$=":descripcion"]').count();
    await p.locator('[data-dup]').first().click(); await p.waitForTimeout(280);
    const todas = await p.locator('[data-cel$=":descripcion"]').all();
    if (todas.length !== n0 + 1) throw new Error('no duplicó');
    if (await todas[1].inputValue() !== desc0)
      throw new Error('la copia no quedó debajo del original');
  });

  await paso('subir y bajar reordena los renglones', async () => {
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const d = () => p.locator('[data-cel$=":descripcion"]');
    const a0 = await d().nth(0).inputValue(), a1 = await d().nth(1).inputValue();
    if (a0 === a1) throw new Error('los dos primeros renglones son iguales, la prueba no distingue');
    await p.locator('[data-mov$="|1"]').first().click(); await p.waitForTimeout(280);
    if (await d().nth(0).inputValue() !== a1 || await d().nth(1).inputValue() !== a0)
      throw new Error('bajar no reordenó');
    await p.locator('[data-mov$="|-1"]').nth(1).click(); await p.waitForTimeout(280);
    if (await d().nth(0).inputValue() !== a0) throw new Error('subir no lo regresó');
  });

  await paso('renombrar una sección persiste en su pestaña', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const campo = p.locator('[data-cel^="nom:"]');
    await campo.fill('Obra eléctrica en cortina');
    await campo.dispatchEvent('change'); await p.waitForTimeout(300);
    const t = await p.locator('.pestana.on').textContent();
    if (!/Obra eléctrica/.test(t)) throw new Error('la pestaña dice: ' + t);
    await hoja('DESGLOSE');
    if ((await p.textContent('#hoja')).indexOf('Obra eléctrica') < 0)
      throw new Error('no llegó al RESUMEN POR SECCIÓN');
  });

  await paso('mover una sección cambia su ranura en el RESUMEN', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');
    // OJO: hay dos tablas `.rejilla.ancha` en el DESGLOSE. La ranura vive en la
    // de RESUMEN POR SECCIÓN, y su segunda celda es el NOMBRE de la sección.
    const ranura1 = () => p.locator('#porSeccion tbody tr').first().locator('td').nth(1).textContent();
    const antes = (await ranura1()).trim();
    await hoja('Suministro');
    await p.locator('[data-movsec$="|1"]').first().click(); await p.waitForTimeout(320);
    await hoja('DESGLOSE');
    const desp = (await ranura1()).trim();
    if (antes === desp) throw new Error('la ranura 1 no cambió: ' + antes);
    console.log('   ranura 1:', antes, '→', desp);
  });

  await paso('duplicar una sección la deja al lado, marcada como copia', async () => {
    await ir('#/m/M-1041');
    const n0 = await p.locator('.pestana:not(.mas)').count();
    await hoja('Suministro');
    await p.click('[data-dupsec]'); await p.waitForTimeout(320);
    if (await p.locator('.pestana:not(.mas)').count() !== n0 + 1) throw new Error('no duplicó');
    const on = await p.locator('.pestana.on').textContent();
    if (!/copia/.test(on)) throw new Error('la copia no se llama copia: ' + on);
  });

  // Hallazgo #5: el machote tiene diez ranuras y el USD de calbee tiene once.
  // La herramienta DEJA pasar de diez -no le voy a impedir al negocio lo que
  // ya hace- pero lo marca como hallazgo duro, porque el importe de la de más
  // no llega al precio y el Excel no avisa.
  await paso('pasar de diez secciones se permite pero bloquea', async () => {
    await ir('#/m/M-1042');
    for (let i = 0; i < 12; i++) {
      if (await p.locator('.pestana:not(.mas)').count() > 11) break;
      await p.click('[data-nueva]'); await p.waitForTimeout(90);
    }
    const n = await p.locator('.pestana:not(.mas)').count();
    if (n <= 11) throw new Error('no dejó pasar de diez: ' + n);
    if (await p.locator('.pestana.fuera').count() === 0)
      throw new Error('no marcó la pestaña de más');
    await irSuave('#/rev/M-1042');
    const t = await p.textContent('#vista');
    if (!/Más secciones de las que caben/.test(t)) throw new Error('el revisador no lo reportó');
    if (!/ranura por POSICIÓN|por POSICIÓN/.test(t)) throw new Error('no explica por qué importa');
    console.log('   ', n - 1, 'secciones · marcada y bloqueada');
  });

  await paso('la unidad admite catálogo y texto libre', async () => {
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const u = p.locator('[data-cel$=":unidad"]').first();
    if (await u.evaluate(e => e.tagName) !== 'INPUT')
      throw new Error('sigue siendo un select: no deja escribir "tramo de 6 m"');
    if (!await u.getAttribute('list')) throw new Error('sin catálogo sugerido');
    await u.fill('tramo de 6 m'); await u.dispatchEvent('change'); await p.waitForTimeout(280);
    if (await p.locator('[data-cel$=":unidad"]').first().inputValue() !== 'tramo de 6 m')
      throw new Error('no guardó el texto libre');
  });

  await paso('cambiar la moneda de un renglón convierte el total', async () => {
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const antes = await p.textContent('.fija .mono');
    // Ojo: los renglones de mano de obra TAMBIÉN tienen moneda, y los que van
    // en cero están plegados. Hay que apuntar a una partida y que sea visible.
    const mon = p.locator('[data-cel*=":partidas:"][data-cel$=":moneda"]:visible').first();
    await mon.selectOption('USD'); await p.waitForTimeout(320);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('no convirtió: ' + antes);
    const n = parseFloat(antes.replace(/[^0-9.]/g, '')), d = parseFloat(desp.replace(/[^0-9.]/g, ''));
    if (!(d > n)) throw new Error('un renglón en USD debería subir el total en MXN: ' + antes + ' → ' + desp);
    console.log('   ', antes.trim(), '→', desp.trim());
  });

  await paso('la moneda nace de la empresa y avisa si no coincide', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');
    const emp = p.locator('[data-cel="empresa_id"]');
    if (await emp.count() === 0) throw new Error('no hay selector de empresa');
    if (await p.locator('[data-cel="moneda"]').inputValue() !== 'MXN')
      throw new Error('Servicios FTS debería nacer en MXN');
    await emp.selectOption('6'); await p.waitForTimeout(320);
    if (await p.locator('[data-cel="moneda"]').inputValue() !== 'USD')
      throw new Error('al pasar a FTS USA la moneda debió seguir a la empresa');
    await p.locator('[data-cel="moneda"]').selectOption('MXN'); await p.waitForTimeout(320);
    if ((await p.textContent('#hoja')).indexOf('factura en USD') < 0)
      throw new Error('no avisó que la moneda no es la de la empresa');
  });

  await paso('convertir sin decir de dónde salió el tipo de cambio se advierte', async () => {
    await ir('#/m/M-1043'); await hoja('DESGLOSE');
    await p.fill('[data-cel="tc"]', '18');
    await p.dispatchEvent('[data-cel="tc"]', 'change'); await p.waitForTimeout(300);
    await irSuave('#/rev/M-1043');
    if (!/sin decir de dónde salió/.test(await p.textContent('#vista')))
      throw new Error('no lo advirtió');
  });

  // ── Diseño ───────────────────────────────────────────────────────────
  await paso('nada desborda a 380 px', async () => {
    /* V1.25: `#/orden/O-9002` salió de esta lista al retirarse `vOrden`. Un
     * hash desconocido cae al `#/` de `render()`, así que la prueba habría
     * seguido pasando midiendo la lista dos veces — verde sin mirar nada.
     * Entra `#/nuevo`, que sí existe y no estaba cubierta a este ancho. */
    for (const h of ['#/', '#/nuevo', '#/m/M-1041', '#/rev/M-1044', '#/ap/M-1041']) {
      await ir(h);
      const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 2) throw new Error(h + ' desborda ' + d + ' px');
    }
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (d > 2) throw new Error('la hoja de sección desborda ' + d + ' px');
  });

  await paso('en teléfono la captura son tarjetas, no una retícula', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const r = await p.evaluate(() => {
      /* La celda que se mide tiene que ser una de CAPTURA. Antes se tomaba la
       * primera del `tbody`, que es la del rótulo de GRUPO — un encabezado, no
       * una tarjeta; daba `flex` de casualidad y dejó de darlo cuando el grupo
       * pasó a bloque para poder llevar su explicación debajo. Se mide lo que
       * la prueba quería medir, y de paso el grupo, que ahora sí tiene forma
       * propia. */
      const td = document.querySelector('.rejilla.tarjetas tbody tr:not(.grupo):not(.total) td');
      const tdG = document.querySelector('.rejilla.tarjetas tbody tr.grupo td');
      const th = document.querySelector('.rejilla.tarjetas thead');
      return { disp: td && getComputedStyle(td).display,
               dispGrupo: tdG && getComputedStyle(tdG).display,
               cabOculta: th ? getComputedStyle(th).display === 'none' : false,
               rotulo: !!document.querySelector('.rejilla.tarjetas td.rotulo') };
    });
    if (r.disp !== 'flex') throw new Error('las celdas de captura no se apilan: ' + r.disp);
    if (r.dispGrupo !== 'block')
      throw new Error('el rótulo de grupo no es un bloque (' + r.dispGrupo +
                      '): su explicación se parte en dos columnas');
    if (!r.cabOculta) throw new Error('el encabezado de tabla sigue visible');
    if (!r.rotulo) throw new Error('las tarjetas no traen su rótulo');
  });

  await paso('cada campo de la tarjeta dice de qué columna es', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const sin = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.rejilla.tarjetas tbody tr:not(.grupo):not(.total) td').forEach(td => {
        if (getComputedStyle(td).display === 'none') return;
        // Las celdas de acciones no llevan etiqueta de columna a proposito: no
        // son un dato, son botones. `acc-ini` es la del boton de pegar.
        if (td.classList.contains('rotulo') || td.classList.contains('acc') ||
            td.classList.contains('acc-ini')) return;
        if (!td.getAttribute('data-l')) out.push(td.className || '(sin clase)');
      });
      return out;
    });
    if (sin.length) throw new Error(sin.length + ' celda(s) sin etiqueta: ' + sin.slice(0, 3).join(', '));
  });

  await paso('todo lo que se toca mide al menos 40 px de alto', async () => {
    const chico = [];
    for (const h of ['#/', '#/nuevo', '#/m/M-1041']) {   // V1.25: sale #/orden, entra #/nuevo
      await ir(h);
      if (h === '#/m/M-1041') { await hoja('Suministro'); }
      const r = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, a.btn, a.item, input:not([type=checkbox]), select, textarea').forEach(el => {
          const b = el.getBoundingClientRect();
          if (b.height > 0 && b.height < 40) out.push((el.tagName + '.' + (el.className || '')).slice(0, 40) + ' → ' + Math.round(b.height) + 'px');
        });
        return out;
      });
      chico.push.apply(chico, r);
    }
    if (chico.length) throw new Error(chico.length + ' objetivo(s) chico(s): ' + chico.slice(0, 4).join(' · '));
  });

  await paso('se puede capturar con el pulgar: escribir en una tarjeta', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const campo = p.locator('.rejilla.tarjetas tr:visible [data-cel$=":qty"]').first();
    await campo.click(); await campo.fill('7'); await campo.blur();
    await p.waitForTimeout(300);
    const v = await p.locator('.rejilla.tarjetas tr:visible [data-cel$=":qty"]').first().inputValue();
    if (v !== '7') throw new Error('no guardó: ' + v);
  });

  // Los doce renglones del Excel en un teléfono son doce tarjetas, y siete
  // suelen ir en cero. Se pliegan, pero el interruptor tiene que decir
  // cuántas hay y devolverlas al instante: si desaparecen sin aviso, el
  // capturista cree que se le borraron.
  await paso('los renglones en cero se pliegan y el interruptor los devuelve', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const conteo = () => p.locator('.rejilla.tarjetas tr.enCero:visible').count();
    if (await conteo() !== 0) throw new Error('no se plegaron');
    const et = await p.textContent('.verVacios');
    if (!/ver los \d+ en cero/.test(et)) throw new Error('el interruptor no dice cuántas: ' + et);
    await p.check('#verVacios'); await p.waitForTimeout(300);
    if (await conteo() === 0) throw new Error('el interruptor no los devolvió');
    await p.uncheck('#verVacios'); await p.waitForTimeout(300);
  });

  await paso('en escritorio se ven los diez renglones, como en el Excel', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    /* V1.26 · eran 10; con los de viaje son 13. Lo que se sigue exigiendo es
     * que en escritorio se vean TODOS sin desplegar nada, que es lo que la
     * prueba defendía: en el Excel están a la vista. */
    const filas = p.locator('#hoja .rejilla.tarjetas').first()
      .locator('tbody tr:not(.grupo):not(.total):visible');
    const n = await filas.count();
    if (n !== 13) throw new Error('renglones de mano de obra visibles: ' + n + ' (10 del Excel + 3 de viaje)');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('a 1280 px vuelve a ser retícula, y no desborda', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    for (const h of ['#/', '#/m/M-1041', '#/rev/M-1044']) {
      await ir(h);
      const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 2) throw new Error(h + ' desborda ' + d + ' px');
    }
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const disp = await p.evaluate(() => {
      const td = document.querySelector('.rejilla.tarjetas tbody td');
      return td && getComputedStyle(td).display;
    });
    if (disp !== 'table-cell') throw new Error('no volvió a retícula: ' + disp);
    const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (d > 2) throw new Error('la hoja desborda ' + d + ' px en escritorio');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  // ── V1.07 · el renglon capturado, el autoguardado y el candado ───────
  await paso('el renglón con cantidad se pinta distinto del que sigue vacío', async () => {
    // A ancho de escritorio: en teléfono el renglón es una tarjeta y la marca
    // es el borde, no el fondo -un fondo verde tras catorce campos no se lee.
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const tr = [...document.querySelectorAll('.rejilla.tarjetas tbody tr')];
      const con = tr.find(x => x.classList.contains('capturada'));
      // El rotulo de grupo tambien lleva `enCero`; se excluye para comparar
      // renglon contra renglon y que el dato del log sea el que dice ser.
      const sin = tr.find(x => x.classList.contains('enCero') && !x.classList.contains('grupo'));
      const bg = (e) => e ? getComputedStyle(e.querySelector('td')).backgroundColor : null;
      return { hayCon: !!con, haySin: !!sin, con: bg(con), sin: bg(sin) };
    });
    if (!r.hayCon) throw new Error('ningún renglón capturado');
    if (r.con === r.sin) throw new Error('se ven iguales: ' + r.con);
    console.log('   capturado', r.con, '· vacío', r.sin);
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('poner cantidad en un renglón lo pinta al instante', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    // Un renglon de mano de obra en cero: se le pone cantidad y debe cambiar.
    const antes = await p.locator('.rejilla tbody tr.capturada').count();
    const vacio = p.locator('.rejilla tbody tr.enCero [data-cel$=":qty"]:visible').first();
    await vacio.fill('8');
    await vacio.dispatchEvent('change'); await p.waitForTimeout(320);
    const desp = await p.locator('.rejilla tbody tr.capturada').count();
    if (desp <= antes) throw new Error('no se pintó: ' + antes + ' → ' + desp);
    console.log('   renglones capturados', antes, '→', desp);
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('editar deja el pulso en guardado, no en sin guardar', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const cel = p.locator('[data-cel$=":pu"]:visible').first();
    await cel.fill('999'); await cel.dispatchEvent('change');
    await p.waitForTimeout(900);   // el retardo del autoguardado es de 500 ms
    const cls = await p.locator('#pulso').getAttribute('class');
    if (!/p-guardado|p-limpio/.test(cls)) throw new Error('el pulso quedó en: ' + cls);
    const hay = await p.evaluate(() => !!localStorage.getItem('fts_machote_v1'));
    if (!hay) throw new Error('no escribió nada en el almacén');
  });

  await paso('lo capturado sobrevive a salir y volver a entrar', async () => {
    // Pagina APARTE, sin el guion que limpia: aqui se mide justamente que lo
    // guardado persista entre cargas.
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    // Siembra la sesión SIN limpiar el almacén del machote: lo que se mide aquí
    // es justamente que lo guardado sobreviva.
    await q.addInitScript(() => {
      try {
        if (!localStorage.getItem('fts_suite_session')) {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            empleado_id: null, scopes: ['comercial:read'],
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false
          }));
        }
      } catch (e) {}
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(300);
      await q.evaluate(() => { try { localStorage.removeItem('fts_machote_v1'); } catch (e) {} });
      await q.goto(BASE); await q.waitForTimeout(350);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(350);
      await q.locator('.pestana', { hasText: 'Suministro' }).first().click();
      await q.waitForTimeout(300);
      const cel = q.locator('[data-cel^="nom:"]');
      await cel.fill('Prueba de persistencia');
      await cel.dispatchEvent('change'); await q.waitForTimeout(900);
      // Se sale y se vuelve a entrar, como haria cualquiera.
      await q.goto(BASE); await q.waitForTimeout(400);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(350);
      const t = await q.textContent('#vista');
      if (t.indexOf('Prueba de persistencia') < 0) throw new Error('se perdió al recargar');
    } finally { await q.close(); }
  });

  await paso('no se puede enviar a Odoo un machote sin orden', async () => {
    await ir('#/m/M-1041'); await hoja('DESGLOSE');   // M-1041 nace sin SO
    const sel = p.locator('[data-estado]');
    if (await sel.count() === 0) throw new Error('no hay selector de estado');
    await sel.selectOption('enviado'); await p.waitForTimeout(350);
    if (await sel.inputValue() === 'enviado') throw new Error('lo dejó enviar sin orden');
    const t = await p.textContent('body');
    if (!/sin una orden ligada/.test(t)) throw new Error('no dijo por qué');
  });

  await paso('un machote enviado a Odoo se consulta pero no se edita', async () => {
    await ir('#/m/M-1042'); await hoja('DESGLOSE');   // M-1042 sí trae SO
    await p.locator('[data-estado]').selectOption('enviado'); await p.waitForTimeout(400);
    await hoja('Adecuación');
    const r = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('[data-cel]')];
      return { total: cs.length, apagados: cs.filter(c => c.disabled).length,
               botones: document.querySelectorAll('[data-add],[data-del],[data-dupsec],[data-nueva]').length,
               texto: document.body.textContent.indexOf('se consulta, no se edita') >= 0 };
    });
    if (r.total === 0) throw new Error('no pintó la hoja');
    if (r.apagados !== r.total) throw new Error('quedaron editables: ' + (r.total - r.apagados) + ' de ' + r.total);
    if (r.botones !== 0) throw new Error('quedaron ' + r.botones + ' botones de estructura');
    if (!r.texto) throw new Error('no explica por qué está bloqueado');
  });

  await paso('los colores del machote salen de un solo lugar', async () => {
    // Si un color de tabla se escribe fuera de las variables, corregir la
    // paleta cuando lleguen los colores reales se vuelve una caceria.
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const raiz = getComputedStyle(document.documentElement);
      const v = (n) => raiz.getPropertyValue(n).trim();
      return { banda: v('--x-banda'), cab: v('--x-cab'), fila: v('--x-fila-ok'),
               th: getComputedStyle(document.querySelector('.rejilla th')).backgroundColor };
    });
    for (const k of ['banda', 'cab', 'fila'])
      if (!r[k]) throw new Error('falta la variable --x-' + k);
    if (r.th === 'rgba(0, 0, 0, 0)') throw new Error('el encabezado no tomó color');
    console.log('   banda', r.banda, '· encabezado', r.cab, '· capturado', r.fila);
  });

  // ── V1.09 · buscar y crear ───────────────────────────────────────────
  await paso('la vista principal busca por nombre, cliente y orden', async () => {
    await ir('#/');
    const n0 = await p.locator('.item[href^="#/m/"]').count();
    if (n0 < 3) throw new Error('esperaba varios machotes, hay ' + n0);
    await p.fill('#q', 'topo chico');
    await p.waitForTimeout(320);
    const n1 = await p.locator('.item[href^="#/m/"]').count();
    if (!(n1 > 0 && n1 < n0)) throw new Error('el buscador no filtró: ' + n0 + ' → ' + n1);
    // Por número de orden tambien.
    await p.fill('#q', 'SO11772'); await p.waitForTimeout(320);
    const t = await p.textContent('#vista');
    if (t.indexOf('SO11772') < 0) throw new Error('no encontró por número de orden');
    console.log('   ', n0, 'machotes →', n1, 'con "topo chico"');
  });

  await paso('buscar no roba el foco a media palabra', async () => {
    await ir('#/');
    await p.click('#q');
    await p.type('#q', 'paso', { delay: 60 });
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({
      foco: document.activeElement && document.activeElement.id,
      valor: document.getElementById('q') ? document.getElementById('q').value : null
    }));
    if (r.foco !== 'q') throw new Error('el foco se fue a: ' + r.foco);
    if (r.valor !== 'paso') throw new Error('se perdieron letras: ' + r.valor);
  });

  await paso('el filtro de estado filtra, y la cuenta dice sobre cuántos', async () => {
    /* En V1.21 los filtros dejaron de ser una fila de píldoras y son
     * desplegables: las píldoras no escalaban a filtrar por persona, que es
     * lo que hacía falta con siete capturando. Lo que se sigue exigiendo es
     * lo mismo: que filtre de verdad y que se vea sobre cuántos filtró. */
    await ir('#/');
    /* Se cuentan los renglones de la TABLA, no `[data-hist]`: cada machote se
     * pinta dos veces en el DOM —tabla y tarjetas— y sólo una de las dos está
     * visible según el ancho. Contar el botón daba el doble. */
    const total = await p.$$eval('tr.rw', e => e.length);
    await p.selectOption('#fEstado', 'revision'); await p.waitForTimeout(320);
    const enRev = await p.$$eval('tr.rw', e => e.length);
    if (!(enRev > 0 && enRev < total)) throw new Error('el filtro no filtró: ' + total + ' → ' + enRev);
    const cuenta = (await p.textContent('.enc .cuenta')).replace(/\s+/g, ' ');
    if (cuenta.indexOf('de ' + total) < 0)
      throw new Error('la cuenta no dice sobre cuántos: ' + cuenta);
    console.log('    ' + total + ' → ' + enRev + ' · «' + cuenta + '»');
  });

  await paso('al entrar, la lista arranca en TODAS las personas', async () => {
    /* V1.25 · decisión de Esteban. SUSTITUYE a «el filtro de persona arranca
     * en los propios» (V1.21), que probaba lo contrario: que al abrir se veía
     * sólo lo tuyo y un pie avisaba del filtro puesto.
     *
     * Se cambió porque abrir la lectura a todos (V1.24) y luego esconderlo
     * detrás de un filtro que nadie eligió es abrir una puerta y dejarla
     * cerrada: con siete machotes no hay ruido que filtrar, y ver el trabajo
     * del equipo era el punto. Cuando el equipo crezca se revisa.
     *
     * Lo que NO cambió, y por eso se sigue probando aquí: «Míos» sigue
     * existiendo, y cuando se elige, la pantalla lo dice — un filtro puesto
     * que no se anuncia se lee como machotes que faltan. */
    await ir('#/');
    const v = await p.$eval('#fPersona', el => el.value);
    if (v !== '') throw new Error('no arrancó en «Todas las personas»: «' + v + '»');
    const t0 = (await p.textContent('#vista')).replace(/\s+/g, ' ');
    if (/Viendo sólo lo tuyo/i.test(t0))
      throw new Error('avisa de un filtro puesto sin haber puesto ninguno');

    const todos = await p.$$eval('tr.rw', e => e.length);
    await p.selectOption('#fPersona', 'zz.prueba'); await p.waitForTimeout(320);
    const propios = await p.$$eval('tr.rw', e => e.length);
    if (propios > todos) throw new Error('«Míos» enseñó MÁS que todos: ' + todos + ' → ' + propios);
    const t1 = (await p.textContent('#vista')).replace(/\s+/g, ' ');
    if (!/Viendo sólo lo tuyo/i.test(t1))
      throw new Error('con «Míos» puesto no lo dice');
    await p.selectOption('#fPersona', ''); await p.waitForTimeout(320);
    console.log('    arranca en todas (' + todos + ') · «Míos» filtra (' + propios + ') y lo anuncia');
  });

  await paso('cuando no hay resultados, dice por qué', async () => {
    await ir('#/');
    await p.fill('#q', 'zzzz-no-existe'); await p.waitForTimeout(320);
    const t = await p.textContent('#vista');
    if (t.indexOf('zzzz-no-existe') < 0)
      throw new Error('no dice qué se buscó: ' + t.slice(0, 160));
  });

  await paso('un machote nuevo nace con DESGLOSE, una sección y todo en ceros', async () => {
    await ir('#/');
    await p.click('.btn.nuevo'); await p.waitForTimeout(320);
    await p.fill('#n-nombre', 'Cotización de prueba CC');
    await p.fill('#n-cliente', 'Cliente de prueba');
    await p.click('#n-crear'); await p.waitForTimeout(450);

    const pest = await p.locator('.pestana:not(.mas)').allTextContents();
    if (pest.length !== 2) throw new Error('esperaba DESGLOSE + 1 sección, hay: ' + pest.join(' · '));
    if (!/DESGLOSE/.test(pest[0])) throw new Error('la primera hoja no es el DESGLOSE: ' + pest[0]);

    // El precio arranca en cero: nada capturado todavía.
    const barra = await p.textContent('.fija');
    if (!/\$0|\$-/.test(barra)) throw new Error('no arrancó en ceros: ' + barra.trim().slice(0, 60));

    await hoja('SECCIÓN 1');
    const r = await p.evaluate(() => {
      const mo = document.querySelectorAll('.rejilla tbody tr:not(.grupo):not(.total)');
      const qty = [...document.querySelectorAll('[data-cel$=":qty"]')];
      return { filas: mo.length, qty: qty.length,
               // Desde V1.10 los diez preparados nacen con cantidad CERO a
               // proposito. Lo que no puede haber es una cantidad POSITIVA.
               positivas: qty.filter(x => Number(x.value) > 0).length,
               capturadas: document.querySelectorAll('tr.capturada').length };
    });
    if (r.positivas !== 0) throw new Error(r.positivas + ' renglones nacieron con cantidad positiva');
    if (r.capturadas !== 0) throw new Error('nació con renglones pintados de verde');
    console.log('   ', pest.join(' · '), '·', r.qty, 'renglones, todos en cero');
  });

  await paso('la sección nueva trae 10 de mano de obra con tarifa y 30 de materiales', async () => {
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = C.machoteNuevo({ nombre: 'x' });
      const s = m.secciones[0];
      return {
        secciones: m.secciones.length,
        mo: s.mo.length,
        conTarifa: s.mo.filter(l => Number(l.pu) > 0).length,
        conHoras: s.mo.filter(l => l.qty !== '' && l.qty !== null).length,
        partidas: s.partidas.length,
        sinTipo: s.partidas.filter(x => x.tipo === '').length,
        costo: C.calcular(m).costo
      };
    });
    if (r.secciones !== 1) throw new Error('secciones: ' + r.secciones);
    /* V1.26 · 13 renglones, pero **sólo los 10 del Excel traen tarifa de
     * plantilla**. Los tres de viaje nacen SIN tarifa a propósito: un día de
     * viaje no vale 140 ni 200, lo decide quien cotiza, y un número de relleno
     * se cobraría solo sin que nadie lo revisara. Que `conTarifa` siga siendo
     * 10 es la prueba de que no se les inventó ninguna. */
    if (r.mo !== 13) throw new Error('renglones de mano de obra: ' + r.mo + ' (10 + 3 de viaje)');
    if (r.conTarifa !== 10)
      throw new Error('con tarifa de plantilla: ' + r.conTarifa + ' — deben ser los 10 del Excel, ' +
                      'y los 3 de viaje SIN tarifa');
    if (r.conHoras !== 0) throw new Error('nacieron con horas: ' + r.conHoras);
    if (r.partidas !== 30) throw new Error('renglones de materiales: ' + r.partidas);
    if (r.sinTipo !== 20) throw new Error('esperaba 20 sin Tipo y 10 preparados, hay ' + r.sinTipo + ' sin Tipo');
    if (r.costo !== 0) throw new Error('el costo no arranca en cero: ' + r.costo);
    console.log('    10 mano de obra con tarifa · 30 materiales sin Tipo · costo 0');
  });

  await paso('el machote nuevo se guarda solo y aparece en la búsqueda', async () => {
    const guardado = await p.evaluate(() => {
      const c = localStorage.getItem('fts_machote_v1');
      return c ? JSON.parse(c).machotes.some(m => m.nombre === 'Cotización de prueba CC') : false;
    });
    if (!guardado) throw new Error('no quedó en el almacén');
    await irSuave('#/');
    await p.fill('#q', 'prueba CC'); await p.waitForTimeout(320);
    const t = await p.textContent('#vista');
    if (t.indexOf('Cotización de prueba CC') < 0) throw new Error('no aparece al buscarlo');
  });

  // ── V1.10 · lo que salio de las pruebas con la gente ─────────────────
  await paso('las comisiones de la sección traen su porcentaje', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const t = await p.textContent('#hoja');
    if (!/Comisiones FTS\s*[\d.]+%/.test(t)) throw new Error('sin % en Comisiones FTS');
    if (!/Comisiones CLIENTE\s*[\d.]+%/.test(t)) throw new Error('sin % en Comisiones CLIENTE');
  });

  await paso('el nombre de la sección va arriba de las tablas', async () => {
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const nom = document.querySelector('.nomsec');
      const tab = document.querySelector('.cab');
      if (!nom || !tab) return null;
      return { nom: nom.getBoundingClientRect().top, tab: tab.getBoundingClientRect().top };
    });
    if (!r) throw new Error('no encontré el nombre o las tablas');
    if (!(r.nom < r.tab)) throw new Error('el nombre quedó abajo: ' + Math.round(r.nom) + ' vs ' + Math.round(r.tab));
  });

  await paso('la columna Tipo deja ver lo que está seleccionado', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const w = await p.evaluate(() => {
      const s = document.querySelector('[data-cel$=":tipo"]');
      return s ? Math.round(s.getBoundingClientRect().width) : -1;
    });
    if (w < 110) throw new Error('la columna Tipo mide ' + w + 'px, no cabe "Materiales"');
    console.log('    Tipo mide', w, 'px');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('no deja capturar cantidades ni precios negativos', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const cel = p.locator('[data-cel*=":partidas:"][data-cel$=":pu"]:visible').first();
    await cel.fill('-500'); await cel.dispatchEvent('change');
    await p.waitForTimeout(950);   // el autoguardado tiene 500 ms de retardo
    const guardado = await p.evaluate(() => {
      const c = localStorage.getItem('fts_machote_v1');
      if (!c) return -1;
      const m = JSON.parse(c).machotes.find(x => x.id === 'M-1041');
      const todas = m.secciones.reduce((a, s) => a.concat(s.partidas, s.mo), []);
      return todas.filter(l => Number(l.pu) < 0 || Number(l.qty) < 0).length;
    });
    if (guardado === -1) throw new Error('no alcanzó a guardar nada');
    if (guardado !== 0) throw new Error('quedaron ' + guardado + ' valores negativos guardados');
    const min = await cel.getAttribute('min');
    if (min !== '0') throw new Error('el campo no declara min=0');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('el verde exige cantidad Y precio, no sólo cantidad', async () => {
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      return {
        soloQty:  C.capturada({ qty: 5, pu: null }),
        soloPu:   C.capturada({ qty: '', pu: 100 }),
        ambos:    C.capturada({ qty: 5, pu: 100 }),
        ceroPu:   C.capturada({ qty: 5, pu: 0 })
      };
    });
    if (r.soloQty) throw new Error('se pintó con sólo cantidad');
    if (r.soloPu) throw new Error('se pintó con sólo precio');
    if (r.ceroPu) throw new Error('se pintó con precio 0');
    if (!r.ambos) throw new Error('no se pintó teniendo los dos');
  });

  await paso('la sección nueva trae 5 Materiales y 5 Servicios en Pieza', async () => {
    const r = await p.evaluate(() => {
      const s = window.MachoteCalc.machoteNuevo({ nombre: 'x' }).secciones[0];
      const t = {}; s.partidas.forEach(x => { t[x.tipo || 'vacio'] = (t[x.tipo || 'vacio'] || 0) + 1; });
      return { t: t, pieza: s.partidas.filter(x => x.unidad === 'Pieza').length,
               qty0: s.partidas.filter(x => x.qty === 0).length,
               usadas: s.partidas.filter(window.MachoteCalc.usadaPartida).length };
    });
    if (r.t.Materiales !== 5) throw new Error('Materiales: ' + r.t.Materiales);
    if (r.t.Servicios !== 5) throw new Error('Servicios: ' + r.t.Servicios);
    if (r.t.vacio !== 20) throw new Error('en blanco: ' + r.t.vacio);
    if (r.pieza !== 10) throw new Error('en Pieza: ' + r.pieza);
    if (r.qty0 !== 10) throw new Error('con cantidad 0: ' + r.qty0);
    // Con cantidad 0 no cuentan como usados: no disparan hallazgos.
    if (r.usadas !== 0) throw new Error('los preparados cuentan como usados: ' + r.usadas);
  });

  await paso('V1.29 · la equis ARCHIVA, y escribe al servidor', async () => {
    /* La premisa cambio, y ese cambio ES el arreglo. Antes esta prueba media
     * que el machote salia de la lista LOCAL — y pasaba en verde mientras el
     * servidor no se enteraba de nada. Ahora se exige lo que faltaba: que la
     * llamada SALGA, y que la lista solo se mueva despues de que el servidor
     * conteste que si. */
    await ir('#/');
    await p.evaluate(() => { window.__archivados = []; });
    const antes = await p.locator('.item[href^="#/m/"]').count();
    p.once('dialog', d => d.accept());
    /* `:visible` NO es un adorno. Desde V1.21 cada machote se pinta DOS veces
     * —el renglón de la tabla y la tarjeta— y sólo una de las dos se ve según
     * el ancho. A 380 px la primera coincidencia es el botón de la tabla, que
     * está oculto, y `click()` se queda esperando a que aparezca hasta agotar
     * el tiempo. Hay que apretar el que la persona ve. */
    await p.locator('[data-borrar]:visible').first().click();
    await p.waitForTimeout(700);
    const desp = await p.locator('.item[href^="#/m/"]').count();
    if (desp !== antes - 1) throw new Error('no salió de la lista: ' + antes + ' → ' + desp);

    const llamadas = await p.evaluate(() => window.__archivados || []);
    if (!llamadas.length)
      throw new Error('NO ESCRIBIO AL SERVIDOR: es exactamente el defecto que V1.29 arregla');
    if (llamadas[0].accion !== 'archivar')
      throw new Error('mandó otra accion: ' + llamadas[0].accion);
    if (!llamadas[0].machote_id)
      throw new Error('mandó sin machote_id');

    /* Y NO se sepulta el id_local: la lapida haria que un desarchivado no
     * pudiera volver a verse en este navegador nunca mas. */
    const lapidas = await p.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('fts_machote_borrados_v1') || '{}'); }
      catch (e) { return {}; }
    });
    if (Object.keys(lapidas).length)
      throw new Error('sepultó el id_local al archivar: ' + Object.keys(lapidas).join(', '));
    console.log('    salió al servidor · ' + antes + ' → ' + desp + ' · sin lápida');
  });

  await paso('V1.29 · si el servidor dice que NO, la lista no se mueve y se dice por qué', async () => {
    /* El caso que importa de verdad: que la pantalla NO finja. Antes no podia
     * fallar porque no preguntaba a nadie. */
    await ir('#/');
    await p.evaluate(() => {
      window.__archivarFalla = 'SOLO_EL_DUENO_ARCHIVA';
      window.__archivarFallaMsg = 'Archivar es solo de su dueno, y esta es de Ricardo Hernandez.';
    });
    const antes = await p.locator('.item[href^="#/m/"]').count();
    p.once('dialog', d => d.accept());
    await p.locator('[data-borrar]:visible').first().click();
    await p.waitForTimeout(700);

    const desp = await p.locator('.item[href^="#/m/"]').count();
    if (desp !== antes) throw new Error('se la llevó de la lista aunque el servidor dijo que no: ' + antes + ' → ' + desp);

    const aviso = await p.$('#avArch');
    if (!aviso) throw new Error('no avisó: se lo tragó en silencio');
    const txt = (await p.textContent('#avArch')).replace(/\s+/g, ' ');
    if (!/No se archiv/i.test(txt)) throw new Error('el aviso no dice que no se archivó: ' + txt);
    if (!/Ricardo/.test(txt))
      throw new Error('no repite el motivo DEL SERVIDOR, que es lo accionable: ' + txt);
    await p.evaluate(() => { window.__archivarFalla = null; });
    console.log('    «' + txt.slice(0, 92) + '»');
  });

  await paso('V1.29 · un machote enviado a Odoo SI se archiva, porque archivar no destruye', async () => {
    /* ⚠️ ESTA PRUEBA AFIRMABA LO CONTRARIO, y el cambio es deliberado.
     *
     * La razon por la que un `enviado` no se podia borrar estaba escrita en el
     * codigo: «si desaparece, desaparece la unica explicacion de por que el
     * precio fue ese». Es correcta — y deja de aplicar cuando nada desaparece.
     * Un archivado conserva su folio y todas sus versiones, y direccion lo
     * puede devolver. Mantener el candado seria protegerlo de algo que ya no
     * pasa, y dejaria a su dueño sin forma de quitarlo de la lista.
     *
     * Lo que SI sigue bloqueado es lo ajeno, y eso se prueba abajo. */
    await ir('#/m/M-1042'); await hoja('DESGLOSE');
    await p.locator('[data-estado]').selectOption('enviado'); await p.waitForTimeout(400);
    await irSuave('#/');
    const r = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('[data-mid="M-1042"]')];
      if (!filas.length) return null;
      return { n: filas.length,
               archivar: filas.every(f => !!f.querySelector('[data-borrar]')),
               candado: filas.some(f => !!f.querySelector('.candado')) };
    });
    if (!r) throw new Error('no encontré M-1042 en la lista');
    if (!r.archivar) throw new Error('le quitó el botón de archivar a un enviado, que SI se archiva');
    if (r.candado) throw new Error('sigue pintando el candado de «no se borra»');
    console.log('    enviado a Odoo, y aun asi archivable (' + r.n + ' pinturas)');
  });

  // ── Pegar una tabla ──────────────────────────────────────────────────
  await paso('el pegado entiende una tabla de Claude, de Excel y de un PDF', async () => {
    const r = await p.evaluate(() => {
      const P = window.MachotePegar;
      const casos = {
        claude: '| Cantidad | Descripción | Precio unitario |\n|---|---|---|\n| 4 | Rodamiento LM25UU | $4,200.00 |\n| 1 | Placa A36 | $38,000.00 |',
        excel:  'QTY\tDESCRIPCION\tPRECIO UNITARIO\tMONEDA\n12\tTubo cedula 40\t1,250.50\tMXN\n3\tValvula 2in\t890\tUSD',
        sinCab: 'Cable THW cal 12\t250\t18.50\nConduit 1/2\t80\t45.00',
        total:  'Cant;Concepto;Importe\n5;Soporte PTR;2500',
        pdf:    'Descripcion            Cant   Precio\nBomba 2HP     2    18500\nManometro    10      450',
        basura: 'hola que tal\ncomo estas'
      };
      const out = {};
      for (const k in casos) {
        const x = P.interpretar(casos[k], { moneda: 'MXN' });
        out[k] = { ok: x.ok, n: x.renglones.length, r0: x.renglones[0] || null };
      }
      return out;
    });
    if (!r.claude.ok || r.claude.n !== 2) throw new Error('markdown: ' + JSON.stringify(r.claude));
    if (r.claude.r0.qty !== 4 || r.claude.r0.pu !== 4200) throw new Error('markdown mal: ' + JSON.stringify(r.claude.r0));
    if (r.excel.r0.pu !== 1250.5) throw new Error('excel no leyó 1,250.50: ' + r.excel.r0.pu);
    if (r.excel.n !== 2) throw new Error('excel: ' + r.excel.n);
    // El caso que invertía cantidad y precio antes del arreglo por enteros.
    if (r.sinCab.r0.qty !== 250 || r.sinCab.r0.pu !== 18.5)
      throw new Error('sin encabezado invirtió cantidad y precio: ' + JSON.stringify(r.sinCab.r0));
    if (r.total.r0.pu !== 500) throw new Error('no derivó el unitario del importe: ' + r.total.r0.pu);
    if (r.pdf.r0.qty !== 2 || r.pdf.r0.pu !== 18500) throw new Error('pdf: ' + JSON.stringify(r.pdf.r0));
    if (r.basura.ok) throw new Error('dijo que sí a texto sin tabla');
    console.log('    6 formas de tabla entendidas, basura rechazada');
  });

  await paso('pegar enseña lo que entendió antes de escribir nada', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const antes = await p.textContent('.fija .mono');
    await p.locator('[data-pegar]').first().click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', 'Cantidad\tDescripcion\tPrecio\n7\tBrida de acero 4in\t1350.25\n2\tEmpaque espirometalico\t480');
    await p.waitForTimeout(400);
    const prev = await p.textContent('#pg-prev');
    if (!/Entendí\s*2 renglón/.test(prev)) throw new Error('no dijo qué entendió: ' + prev.slice(0, 120));
    if (prev.indexOf('Brida de acero 4in') < 0) throw new Error('no muestra los renglones');
    // Hasta aqui NO debe haber escrito nada.
    const durante = await p.textContent('.fija .mono');
    if (durante !== antes) throw new Error('escribió antes de que se aprobara: ' + antes + ' → ' + durante);
    await p.click('#pg-ok'); await p.waitForTimeout(500);
    const desp = await p.textContent('.fija .mono');
    if (desp === antes) throw new Error('no aplicó al aprobar');
    // Ojo: la descripción vive en el `value` de un input; `textContent` de la
    // hoja NUNCA la va a contener. Se busca donde de verdad está.
    const llego = await p.evaluate(() => [...document.querySelectorAll('[data-cel$=":descripcion"]')]
      .some(i => i.value === 'Brida de acero 4in'));
    if (!llego) throw new Error('el renglón no llegó a la hoja');
    console.log('   ', antes.trim(), '→', desp.trim());
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('pegar texto que no es tabla lo dice, y no deja aplicar', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    await p.locator('[data-pegar]').first().click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', 'buenos dias\nadjunto la cotizacion');
    await p.waitForTimeout(400);
    if (!(await p.locator('#pg-ok').isDisabled())) throw new Error('dejó aplicar basura');
    // Se mide que EXPLIQUE, no la redacción exacta: fijar el texto convierte
    // cualquier mejora del mensaje en un fallo, que es justo lo que pasó aquí.
    const t = (await p.textContent('#pg-prev')).trim();
    if (t.length < 25) throw new Error('no explicó nada: «' + t + '»');
    if (!/no\s|ninguno|No\s/.test(t)) throw new Error('el mensaje no dice que no se pudo: ' + t.slice(0, 100));
    await p.click('#pg-cancel'); await p.waitForTimeout(250);
    await p.setViewportSize({ width: 380, height: 780 });
  });

  // ── V1.11 · el pegado empieza en el renglón que elijas ───────────────
  await paso('el botón de pegar SE VE sin arrastrar la tabla', async () => {
    /* La prueba que faltaba. La anterior comprobaba que el botón EXISTIERA y
     * Playwright lo alcanzaba desplazando solo, así que pasaba en verde
     * mientras el botón caía fuera de la pantalla: medido, x=1473 con la
     * ventana en 1440 px. Existir y poder encontrarse no son lo mismo. */
    for (const [w, h] of [[1440, 900], [1280, 900], [390, 844]]) {
      await p.setViewportSize({ width: w, height: h });
      await ir('#/m/M-1041'); await hoja('Suministro');
      const r = await p.evaluate(() => {
        const b = document.querySelector('[data-pegar]');
        if (!b) return { hay: false };
        const rb = b.getBoundingClientRect();
        return { hay: true, x: Math.round(rb.left), der: Math.round(rb.right),
                 ancho: window.innerWidth,
                 dentro: rb.left >= 0 && rb.right <= window.innerWidth + 1 };
      });
      if (!r.hay) throw new Error('no hay botón de pegar a ' + w + 'px');
      if (!r.dentro) throw new Error('a ' + w + 'px el botón cae fuera: x=' + r.x + '–' + r.der);
    }
    console.log('    visible a 1440, 1280 y 390 px');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('el botón de pegar se queda fijo al desplazar en horizontal', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const b = document.querySelector('[data-pegar]');
      const cont = b.closest('.scroll');
      const antes = Math.round(b.getBoundingClientRect().left);
      cont.scrollLeft = cont.scrollWidth;   // hasta el extremo derecho
      const desp = Math.round(b.getBoundingClientRect().left);
      return { antes, desp, movio: Math.abs(desp - antes) };
    });
    if (r.movio > 2) throw new Error('se fue con el desplazamiento: ' + r.antes + ' → ' + r.desp);
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('cada renglón de materiales trae su botón de pegar', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('.rejilla tbody tr')]
        .filter(t => t.querySelector('[data-cel*=":partidas:"]'));
      return { filas: filas.length, conBoton: filas.filter(t => t.querySelector('[data-pegar]')).length };
    });
    if (r.filas === 0) throw new Error('no hay renglones de materiales');
    if (r.conBoton !== r.filas) throw new Error('sólo ' + r.conBoton + ' de ' + r.filas + ' traen botón');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('pegar respeta lo que está arriba del renglón elegido', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const descs = () => p.evaluate(() =>
      [...document.querySelectorAll('[data-cel$=":descripcion"]')].map(i => i.value));
    const antes = await descs();
    // Se pega ARRIBA del tercer renglón: los dos de arriba no se tocan.
    await p.locator('[data-pegar]').nth(2).click(); await p.waitForTimeout(300);
    const titulo = await p.textContent('.modal h3');
    if (titulo.indexOf('renglón 3') < 0) throw new Error('el modal no dice desde dónde: ' + titulo);
    await p.fill('#pg-txt', '- 4 pzas Rodamiento lineal LM25UU  $4,200.00\n- 1 Placa de acero A36  $38,000');
    await p.waitForTimeout(400);
    await p.check('input[name="pg-modo"][value="arriba"]');
    await p.click('#pg-ok'); await p.waitForTimeout(500);
    const desp = await descs();
    if (desp[0] !== antes[0] || desp[1] !== antes[1])
      throw new Error('tocó lo de arriba: ' + antes.slice(0, 2).join(' | ') + ' → ' + desp.slice(0, 2).join(' | '));
    if (desp[2] !== 'Rodamiento lineal LM25UU')
      throw new Error('no escribió en el renglón 3: ' + desp[2]);
    if (desp[3] !== 'Placa de acero A36')
      throw new Error('no escribió en el renglón 4: ' + desp[3]);
    console.log('   1-2 intactos ·', desp[2].slice(0, 26), '· 4 pzas');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('insertar empuja hacia abajo y no pierde nada', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const descs = () => p.evaluate(() =>
      [...document.querySelectorAll('[data-cel$=":descripcion"]')].map(i => i.value).filter(Boolean));
    const antes = await descs();
    await p.locator('[data-pegar]').nth(1).click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', '- 9 Tornillo hexagonal grado 5  $12.50');
    await p.waitForTimeout(400);
    await p.check('input[name="pg-modo"][value="arriba"]');
    await p.click('#pg-ok'); await p.waitForTimeout(500);
    const desp = await descs();
    // Todas las descripciones anteriores siguen ahí, más la nueva.
    const perdidas = antes.filter(d => desp.indexOf(d) < 0);
    if (perdidas.length) throw new Error('se perdieron: ' + perdidas.join(' | '));
    if (desp.indexOf('Tornillo hexagonal grado 5') !== 1)
      throw new Error('no entró en la posición 2: ' + desp.slice(0, 3).join(' | '));
    console.log('   ', antes.length, '→', desp.length, 'descripciones, ninguna perdida');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('el pegado entiende listas y texto, no sólo tablas', async () => {
    const r = await p.evaluate(() => {
      const P = window.MachotePegar;
      const casos = {
        vinetas: '- 4 pzas Rodamiento lineal LM25UU  $4,200.00\n- 1 Placa de acero A36  $38,000',
        numerada: '1. 12 mts Tubo cedula 40  1,250.50\n2. 3 Valvula de bola 2in  890.00',
        corrido: '250 Cable THW cal 12 negro 18.50\n80 Tuberia conduit 1/2 45.00',
        pdf: 'Descripcion            Cant   Precio\nBomba centrifuga 2HP     2    18500\nManometro     10      450',
        csv: 'Cant,Descripcion,Precio\n5,Soporte PTR inox,2500\n2,Anclaje quimico,900',
        tabSinCab: 'Cable THW cal 12\t250\t18.50\nConduit 1/2\t80\t45.00',
        prosa: 'Buenos dias, adjunto la cotizacion.\nQuedo atento.'
      };
      const o = {};
      for (const k in casos) {
        const x = P.interpretar(casos[k], { moneda: 'MXN' });
        o[k] = { ok: x.ok, sep: x.sep, n: x.renglones.length, r0: x.renglones[0] || null };
      }
      return o;
    });
    // La viñeta y la unidad se reconocen y NO se quedan en la descripción.
    if (r.vinetas.r0.qty !== 4 || r.vinetas.r0.pu !== 4200) throw new Error('viñetas: ' + JSON.stringify(r.vinetas.r0));
    if (r.vinetas.r0.unidad !== 'Pieza') throw new Error('no leyó "pzas": ' + r.vinetas.r0.unidad);
    if (/^[-\d]/.test(r.vinetas.r0.descripcion)) throw new Error('dejó la viñeta o la cantidad en la descripción: ' + r.vinetas.r0.descripcion);
    if (r.numerada.r0.qty !== 12 || r.numerada.r0.unidad !== 'Metro') throw new Error('numerada: ' + JSON.stringify(r.numerada.r0));
    if (r.corrido.r0.qty !== 250 || r.corrido.r0.pu !== 18.5) throw new Error('corrido: ' + JSON.stringify(r.corrido.r0));
    // Y las tablas siguen ganando cuando de verdad son tablas.
    if (r.pdf.sep !== 'espacios' || r.pdf.r0.qty !== 2) throw new Error('pdf: ' + JSON.stringify(r.pdf));
    if (r.csv.sep !== ',' || r.csv.r0.qty !== 5) throw new Error('csv: ' + JSON.stringify(r.csv));
    if (r.tabSinCab.sep !== 'tabulador' || r.tabSinCab.r0.qty !== 250)
      throw new Error('la coma partió los miles o el tabulador se descartó: ' + JSON.stringify(r.tabSinCab));
    if (r.prosa.ok) throw new Error('aceptó un correo de cortesía como lista');
    console.log('    listas, PDF, CSV y tabulador; prosa rechazada');
  });

  // ── V1.13 · lo que se rompía al pegar ────────────────────────────────
  await paso('pegar NO borra la unidad ni el tipo que ya estaban', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const leer = () => p.evaluate(() => ({
      u: [...document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":unidad"]')].map(x => x.value),
      t: [...document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":tipo"]')].map(x => x.value)
    }));
    const antes = await leer();
    // Una lista SIN columna de unidad, pegada donde ya había "Pieza"/"Horas".
    await p.locator('[data-pegar]').first().click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', 'Rodamiento LM25UU 4200\nPlaca de acero A36 38000');
    await p.waitForTimeout(400);
    await p.click('#pg-ok'); await p.waitForTimeout(500);
    const desp = await leer();
    const vacias = desp.u.slice(0, antes.u.length).filter(v => v === '').length;
    if (vacias > antes.u.filter(v => v === '').length)
      throw new Error('borró unidades: ' + antes.u.slice(0, 4).join('|') + ' → ' + desp.u.slice(0, 4).join('|'));
    if (desp.t.slice(0, 2).some(v => v === ''))
      throw new Error('dejó el Tipo vacío: ' + desp.t.slice(0, 4).join('|'));
    console.log('    unidades', desp.u.slice(0, 3).join('/'), '· tipos', desp.t.slice(0, 3).join('/'));
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('deduce Materiales o Servicios de la descripción', async () => {
    const r = await p.evaluate(() => {
      const d = window.MachotePegar.deducirTipo;
      return {
        rodamiento: d('Rodamiento lineal LM25UU', ''),
        instalacion: d('Instalacion de tuberia de cobre', ''),
        ingenieria: d('Ingenieria de detalle', 'Horas'),
        maquinado: d('Maquinado externo de bujes', ''),
        placa: d('Placa de acero A36 y consumibles', ''),
        desmontaje: d('Desmontaje de equipos existentes', ''),
        raro: d('Cosa rarisima sin senales', '')
      };
    });
    const esperado = { rodamiento: 'Materiales', instalacion: 'Servicios',
                       ingenieria: 'Servicios', maquinado: 'Servicios',
                       placa: 'Materiales', desmontaje: 'Servicios', raro: '' };
    for (const k in esperado)
      if (r[k] !== esperado[k])
        throw new Error(k + ': ' + (r[k] || 'vacío') + ', esperaba ' + (esperado[k] || 'vacío'));
    // "Instalación de tubería de cobre" es el caso que importa: dos sustantivos
    // de material detrás de un verbo de servicio. Contando parejo salía al revés.
    console.log('    el verbo del principio manda sobre los sustantivos');
  });

  await paso('el pegado marca lo que dedujo, para poder corregirlo', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    await p.locator('[data-pegar]').first().click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', '- 4 Rodamiento lineal LM25UU  $4,200\n- 8 Instalacion de tuberia de cobre  $1,500');
    await p.waitForTimeout(450);
    const t = await p.textContent('#pg-prev');
    if (t.indexOf('deducido') < 0) throw new Error('no marca lo deducido: ' + t.slice(0, 160));
    if (t.indexOf('Materiales') < 0 || t.indexOf('Servicios') < 0)
      throw new Error('no dedujo los dos lados: ' + t.slice(0, 200));
    await p.click('#pg-cancel'); await p.waitForTimeout(250);
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('lee una lista con el precio PRIMERO y la cantidad en medio', async () => {
    /* La forma que reventaba: "$ 890.00 c/u - 8 PZAS - Lámpara LED…". El lector
     * asumía cantidad al principio y precio al final, así que rechazaba la lista
     * entera. Ahora cada pedazo se clasifica por lo que ES, no por dónde está. */
    const r = await p.evaluate(() => {
      const T = '$ 890.00 c/u - 8 PZAS - Lampara LED industrial 150W high bay\n' +
                '$ 1,275.50 c/u - 3 ROLLOS - Charola portacables 4 x 3m galvanizada\n' +
                '$ 62.00 c/u - 45 MTS - Manguera liquidtight 1/2\"\n' +
                '$ 4,300.00 c/u - 1 PZA - Variador de frecuencia 5HP 220V\n' +
                '$ 155.75 c/u - 20 PZAS - Terminal ponchable ojillo 6 AWG';
      const x = window.MachotePegar.interpretar(T, { moneda: 'MXN' });
      return { ok: x.ok, n: x.renglones.length, r: x.renglones };
    });
    if (!r.ok) throw new Error('la rechazó entera');
    if (r.n !== 5) throw new Error('leyó ' + r.n + ' de 5');
    const esperado = [
      { qty: 8,  pu: 890,     u: 'Pieza', d: 'Lampara LED industrial 150W high bay' },
      { qty: 3,  pu: 1275.5,  u: 'Rollo' },
      { qty: 45, pu: 62,      u: 'Metro' },
      { qty: 1,  pu: 4300,    u: 'Pieza' },
      { qty: 20, pu: 155.75,  u: 'Pieza' }
    ];
    esperado.forEach((e, i) => {
      const g = r.r[i];
      if (g.qty !== e.qty) throw new Error('renglón ' + (i + 1) + ' cantidad: ' + g.qty + ' ≠ ' + e.qty);
      if (g.pu !== e.pu) throw new Error('renglón ' + (i + 1) + ' precio: ' + g.pu + ' ≠ ' + e.pu);
      if (g.unidad !== e.u) throw new Error('renglón ' + (i + 1) + ' unidad: ' + g.unidad + ' ≠ ' + e.u);
      if (e.d && g.descripcion !== e.d) throw new Error('renglón 1 descripción: ' + g.descripcion);
      if (g.tipo !== 'Materiales') throw new Error('renglón ' + (i + 1) + ' no dedujo Materiales: ' + g.tipo);
    });
    // Y la comilla de 1/2" no debe partir la descripción.
    if (r.r[2].descripcion !== 'Manguera liquidtight 1/2"')
      throw new Error('se comió parte de la descripción: ' + r.r[2].descripcion);
    console.log('    5 de 5, con unidad y tipo deducidos');
  });

  await paso('lee las cinco formas de tabla que trajo Esteban', async () => {
    /* Las cinco que probó en vivo, tal como las pegó. Las tres que ya
     * funcionaban entran aquí para que NO se rompan al arreglar la que no. */
    const r = await p.evaluate(() => {
      const P = window.MachotePegar;
      const casos = {
        pipes: '5   | PZA  | Interruptor termomagnetico 3P 100A     | 2,450.00\n' +
               '12  | MTS  | Cable THHN calibre 8 AWG negro         | 38.50\n' +
               '2   | KIT  | Kit de montaje para gabinete NEMA 4X   | 1,180.00\n' +
               '30  | PZA  | Conector recto tuberia 3/4             | 24.90\n' +
               '1   | SERV | Puesta en marcha y pruebas en sitio    | 15,800.00',
        csvRaro: 'descripcion,precio_unitario,unidad,cantidad\n' +
               'Bomba centrifuga sanitaria 2HP acero inox,18750.00,PZA,2\n' +
               'Sello mecanico repuesto serie 21,940.25,PZA,6\n' +
               'Tuberia sanitaria cedula 10 tramo 6m,2310.00,TRAMO,9\n' +
               'Abrazadera clamp con empaque EPDM,187.40,JGO,24\n' +
               'Mano de obra soldadura orbital,650.00,HORA,40'
      };
      const o = {};
      for (const k in casos) {
        const x = P.interpretar(casos[k], { moneda: 'MXN' });
        o[k] = { ok: x.ok, n: x.renglones.length, r: x.renglones };
      }
      return o;
    });

    // La de pipes NO trae encabezado: la columna de unidad hay que reconocerla
    // por su contenido. Antes se perdia entera.
    if (!r.pipes.ok || r.pipes.n !== 5) throw new Error('pipes: ' + JSON.stringify(r.pipes).slice(0, 120));
    const p0 = r.pipes.r[0];
    if (p0.qty !== 5 || p0.pu !== 2450) throw new Error('pipes fila 1: ' + JSON.stringify(p0));
    const unidadesPipes = r.pipes.r.map(x => x.unidad);
    if (unidadesPipes.some(u => !u)) throw new Error('perdio unidades: ' + unidadesPipes.join('|'));
    if (unidadesPipes.join('|') !== 'Pieza|Metro|Kit|Pieza|Servicio')
      throw new Error('no normalizo las unidades: ' + unidadesPipes.join('|'));
    if (r.pipes.r[4].tipo !== 'Servicios')
      throw new Error('"Puesta en marcha" no salio Servicios: ' + r.pipes.r[4].tipo);

    // La CSV trae encabezado pero en OTRO orden, y con precio_unitario.
    if (!r.csvRaro.ok || r.csvRaro.n !== 5) throw new Error('csv: ' + JSON.stringify(r.csvRaro).slice(0, 120));
    const c0 = r.csvRaro.r[0];
    if (c0.qty !== 2 || c0.pu !== 18750) throw new Error('csv fila 1: ' + JSON.stringify(c0));
    if (r.csvRaro.r.map(x => x.unidad).join('|') !== 'Pieza|Pieza|Tramo|Juego|Horas')
      throw new Error('csv unidades: ' + r.csvRaro.r.map(x => x.unidad).join('|'));
    if (r.csvRaro.r[4].tipo !== 'Servicios')
      throw new Error('"Mano de obra" no salio Servicios: ' + r.csvRaro.r[4].tipo);
    console.log('    pipes sin encabezado y CSV en otro orden, con unidad normalizada');
  });

  await paso('los dos modos son arriba y debajo, y ninguno pierde nada', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const usadas = () => p.evaluate(() =>
      [...document.querySelectorAll('[data-cel$=":descripcion"]')].map(i => i.value).filter(Boolean));
    const antes = await usadas();
    await p.locator('[data-pegar]').nth(1).click(); await p.waitForTimeout(300);
    const modos = await p.locator('.modos label').allTextContents();
    if (!/debajo/.test(modos.join(' ')) || !/arriba/.test(modos.join(' ')))
      throw new Error('los modos no dicen arriba/debajo: ' + modos.join(' | '));
    await p.fill('#pg-txt', '- 9 Tornillo hexagonal grado 5  $12.50');
    await p.waitForTimeout(400);
    await p.click('#pg-ok'); await p.waitForTimeout(500);   // "debajo" es el de por defecto
    const desp = await usadas();
    const perdidas = antes.filter(d => desp.indexOf(d) < 0);
    if (perdidas.length) throw new Error('se perdieron: ' + perdidas.join(' | '));
    if (desp.indexOf('Tornillo hexagonal grado 5') !== 2)
      throw new Error('"debajo" no lo puso después del renglón 2: ' + desp.slice(0, 4).join(' | '));
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('pegar no deja la hoja creciendo con renglones vacíos', async () => {
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = C.machoteNuevo({ nombre: 'x' });
      return { antes: m.secciones[0].partidas.length };
    });
    if (r.antes !== 30) throw new Error('la sección nueva no trae 30: ' + r.antes);
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1042'); await hoja('Adecuación');
    const cuenta = () => p.evaluate(() =>
      document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":descripcion"]').length);
    const antes = await cuenta();
    await p.locator('[data-pegar]').first().click(); await p.waitForTimeout(300);
    await p.fill('#pg-txt', '- 1 Uno  $10\n- 2 Dos  $20\n- 3 Tres  $30\n- 4 Cuatro  $40\n- 5 Cinco  $50');
    await p.waitForTimeout(400);
    await p.click('#pg-ok'); await p.waitForTimeout(500);
    const desp = await cuenta();
    // Crece porque entran cinco, pero no se dispara: la cola vacía se recorta.
    if (desp > antes + 5) throw new Error('la hoja creció de más: ' + antes + ' → ' + desp);
    console.log('   ', antes, '→', desp, 'renglones tras pegar 5');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  // ── V1.14 · lo que pidió Montalvo ────────────────────────────────────
  await paso('las comisiones se capturan en % y se guardan como razón', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    /* V1.40 · la ruta lleva el id de la sección: `com:<sid>:fts`. El campo
     * es el mismo que la gente ya tocaba, en la misma columna; lo que cambió
     * es a QUIÉN le escribe. */
    const campo = p.locator('[data-cel^="com:"][data-cel$=":fts"]').first();
    if (await campo.count() === 0) throw new Error('no está el campo de comisión');
    // 0.055 por dentro se ve como 5.5 en pantalla.
    const enPantalla = await campo.inputValue();
    if (Math.abs(Number(enPantalla) - 5.5) > 1e-6)
      throw new Error('en pantalla dice ' + enPantalla + ', esperaba 5.5');
    if (!await campo.evaluate(e => e.hasAttribute('data-pct')))
      throw new Error('el campo no se declara de porcentaje');
    // Y al teclear 8 se guarda 0.08, no 8.
    await campo.fill('8'); await campo.dispatchEvent('change');
    await p.waitForTimeout(900);
    const guardado = await p.evaluate(() => {
      const c = localStorage.getItem('fts_machote_v1');
      if (!c) return null;
      const m = JSON.parse(c).machotes.find(x => x.id === 'M-1041');
      if (!m) return null;
      // V1.40 · ahora vive en la SECCIÓN, no en el machote.
      const sec = (m.secciones || []).find(x => x.comision_fts !== undefined);
      return sec ? sec.comision_fts : null;
    });
    if (guardado === null) throw new Error('no alcanzó a guardar en la sección');
    if (Math.abs(guardado - 0.08) > 1e-8) throw new Error('guardó ' + guardado + ', esperaba 0.08');
    console.log('    pantalla 5.5% · almacén 0.055 · tecleado 8% → 0.08, en la SECCIÓN');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('la tabla de materiales ya no trae Modelo ni Marca', async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await ir('#/m/M-1041'); await hoja('Suministro');
    const r = await p.evaluate(() => ({
      modelo: document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":modelo"]').length,
      marca: document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":marca"]').length,
      desc: document.querySelectorAll('[data-cel*=":partidas:"][data-cel$=":descripcion"]').length
    }));
    if (r.modelo || r.marca) throw new Error('siguen ' + r.modelo + ' modelo y ' + r.marca + ' marca');
    if (!r.desc) throw new Error('se llevó también la descripción');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('la fila de materiales cabe en pantalla, y borrar siempre se alcanza', async () => {
    /* Montalvo: "la línea está muy larga, no se ve completa para tener la
     * opción de borrar" y "tenemos que hacer scroll horizontal". Se mide lo
     * uno y lo otro: que a 1440 no sobre ancho, y que los botones queden
     * DENTRO de la ventana a cualquier tamaño. */
    for (const w of [1440, 1280, 1024]) {
      await p.setViewportSize({ width: w, height: 900 });
      await ir('#/m/M-1041'); await hoja('Suministro');
      const r = await p.evaluate(() => {
        const t = [...document.querySelectorAll('.rejilla')]
          .find(x => x.querySelector('[data-cel*=":partidas:"]'));
        const c = t.closest('.scroll');
        const acc = t.querySelector('td.acc'), ini = t.querySelector('td.acc-ini');
        const rb = acc.getBoundingClientRect(), ri = ini.getBoundingClientRect();
        return { sobra: Math.round(c.scrollWidth - c.clientWidth),
                 borrarDentro: rb.left >= 0 && rb.right <= window.innerWidth + 1,
                 pegarDentro: ri.left >= 0 && ri.right <= window.innerWidth + 1 };
      });
      if (!r.borrarDentro) throw new Error('a ' + w + 'px los botones caen fuera');
      if (!r.pegarDentro) throw new Error('a ' + w + 'px el botón de pegar cae fuera');
      if (w === 1440 && r.sobra > 2) throw new Error('a 1440px la tabla desborda ' + r.sobra + 'px');
    }
    console.log('    cabe a 1440; a 1024 los botones siguen fijos a los bordes');
    await p.setViewportSize({ width: 380, height: 780 });
  });

  await paso('una tabla de Claude con negritas no mete el encabezado como renglón', async () => {
    const r = await p.evaluate(() => {
      const T = [
        '| #  | Concepto              | Especificacion                         |     Cant. | P.U. anterior | **P.U. +8%** | **Importe +8%** |',
        '| -- | --------------------- | -------------------------------------- | --------: | ------------: | -----------: | --------------: |',
        '| A1 | Interruptor principal | Schneider PowerPact M 400 A, 3P, 600 V |     1 pza |       $70,721 |  **$76,379** |     **$76,379** |',
        '| A2 | Cable de fuerza       | Cu THW-LS 4/0 AWG                      |     240 m |          $607 |     **$656** |    **$157,440** |',
        '| A9 | Mano de obra          | Instalacion charola y tendido          |    1 lote |       $18,000 |  **$19,440** |     **$19,440** |'
      ].join('\n');
      const x = window.MachotePegar.interpretar(T, { moneda: 'MXN' });
      return { ok: x.ok, sep: x.sep, enc: x.encabezado, n: x.renglones.length, r: x.renglones };
    });
    if (!r.ok) throw new Error('la rechazó');
    if (r.sep !== '|') throw new Error('no la leyó como tabla, se fue por: ' + r.sep);
    if (!r.enc) throw new Error('no reconoció el encabezado');
    if (r.n !== 3) throw new Error('leyó ' + r.n + ' renglones; el encabezado se coló');
    if (r.r.some(x => /Concepto|Especificacion/i.test(x.descripcion)))
      throw new Error('un renglón trae el texto del encabezado');
    // El precio bueno es el NUEVO, no el "anterior".
    if (r.r[0].pu !== 76379) throw new Error('tomó el precio viejo: ' + r.r[0].pu);
    if (r.r[1].pu !== 656) throw new Error('renglón 2 precio: ' + r.r[1].pu);
    // La cantidad venía pegada a la unidad.
    if (r.r[0].qty !== 1 || r.r[0].unidad !== 'Pieza')
      throw new Error('no leyó "1 pza": ' + JSON.stringify({ q: r.r[0].qty, u: r.r[0].unidad }));
    if (r.r[1].qty !== 240 || r.r[1].unidad !== 'Metro')
      throw new Error('no leyó "240 m": ' + JSON.stringify({ q: r.r[1].qty, u: r.r[1].unidad }));
    // Y la especificación entró a la descripción en vez de perderse.
    if (r.r[0].descripcion.indexOf('Schneider') < 0)
      throw new Error('perdió la especificación: ' + r.r[0].descripcion);
    if (r.r[2].tipo !== 'Servicios') throw new Error('"Mano de obra" no salió Servicios');
    console.log('    encabezado fuera · precio nuevo · unidad de "1 pza" · especificación dentro');
  });

  // ── Los multiplicadores, por sección ─────────────────────────────────
  await paso('mover un multiplicador en una sección NO toca a las demás', async () => {
    /* Lo que reportó Esteban: "si modifico uno, se modifican en TODAS las
     * demas secciones". La causa era que vivían en `m.margenes`, uno solo
     * para toda la cotización. Ahora cada sección tiene los suyos.
     *
     * Se mide en el ALMACÉN, no en la pantalla: que otra hoja pinte otro
     * número podría ser un repintado perezoso; que el archivo tenga dos
     * valores distintos no se puede fingir. */
    await ir('#/m/M-1041');
    const hojas = await p.evaluate(() =>
      [...document.querySelectorAll('.pestana[data-hoja]')].map(x => x.dataset.hoja));
    const secs = hojas.filter(h => h !== 'desglose');
    if (secs.length < 2) throw new Error('el machote de prueba no tiene dos secciones');

    // Sección 1: materiales a 3.9. La pestaña 0 es el DESGLOSE.
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);
    const cel = '[data-cel^="mg:"][data-cel$=":materiales"]';
    await p.fill(cel, '3.9');
    await p.dispatchEvent(cel, 'change');
    await p.waitForTimeout(900);

    // Sección 2: lo que muestra la pantalla
    await p.locator('.pestana').nth(2).click(); await p.waitForTimeout(350);
    const enDos = await p.inputValue(cel);
    if (Number(enDos) === 3.9)
      throw new Error('la sección 2 se movió con la 1: ' + enDos);

    // Y el almacén, que es la prueba dura
    const guardado = await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('fts_machote_v1'));
      const m = d.machotes.find(x => x.id === 'M-1041');
      return m.secciones.map(s => (s.margenes || {}).materiales === undefined
        ? 'hereda' : s.margenes.materiales);
    });
    if (Number(guardado[0]) !== 3.9)
      throw new Error('la sección 1 no guardó lo suyo: ' + JSON.stringify(guardado));
    if (Number(guardado[1]) === 3.9)
      throw new Error('la sección 2 quedó con el mismo valor: ' + JSON.stringify(guardado));
    console.log('    sección 1 → 3.9 · sección 2 → ' + enDos + ' · almacén ' + JSON.stringify(guardado));
  });

  await paso('el multiplicador de la sección llega a los RENGLONES, no sólo al total', async () => {
    /* El bug de V1.15: `hojaSeccion` llamaba al motor por renglón SIN pasarle
     * la sección, así que cada línea se calculaba con los multiplicadores del
     * machote mientras el total de arriba ya usaba los de la sección. La hoja
     * mostraba DOS VERDADES a la vez y ninguna prueba lo veía, porque todas
     * miraban el motor o el almacén — nunca lo pintado.
     *
     * La comprobación es una invariante que no depende de qué multiplicador
     * toca a cada renglón: **la suma de los renglones tiene que dar el total
     * de su propia sección**. Si las líneas usan otro multiplicador, no cuadra. */
    await ir('#/m/M-1041');
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);
    const cel = '[data-cel^="mg:"][data-cel$=":materiales"]';
    await p.fill(cel, '3.9');
    await p.dispatchEvent(cel, 'change');
    await p.waitForTimeout(600);

    const r = await p.evaluate(() => {
      const num = (t) => Number(String(t || '').replace(/[^0-9.-]/g, '')) || 0;
      /* Las DOS tablas de la hoja son `.rejilla.tarjetas` —mano de obra y
       * materiales—, así que la clase no distingue: hay que buscarlas por lo
       * que contienen. Pedir sólo la clase agarraba la de mano de obra y la
       * prueba se caía con "no encontré un renglón de Materiales". */
      const tabla = (marca) => [...document.querySelectorAll('.rejilla')]
        .find(t => t.querySelector('[data-cel*=":' + marca + ':"]'));

      const leer = (t) => {
        const filas = [...t.querySelectorAll('tbody tr')].filter(x => !x.classList.contains('total'));
        const suma = filas.reduce((a, f) => {
          const c = f.querySelector('[data-l="Precio con utilidad"]');
          return a + (c ? num(c.textContent) : 0);
        }, 0);
        const tr = t.querySelector('tr.total');
        const tot = tr.querySelector('[data-l="Con utilidad"]');
        return { suma: Math.round(suma), total: Math.round(num(tot && tot.textContent)) };
      };

      // Un renglón de materiales con precio, para leer su multiplicador pintado.
      const mat = tabla('partidas');
      if (!mat) return { error: 'no está la tabla de materiales' };
      let mult = null, linea = null;
      for (const f of mat.querySelectorAll('tbody tr')) {
        if (f.classList.contains('total')) continue;
        const tipo = f.querySelector('[data-cel$=":tipo"]');
        const pu = f.querySelector('[data-cel$=":pu"]');
        const pt = f.querySelector('[data-l="Precio total"]');
        const cu = f.querySelector('[data-l="Precio con utilidad"]');
        if (tipo && tipo.value === 'Materiales' && pu && num(pu.value) > 0) {
          const mg = f.querySelector('[data-l="Margen"] input');
          mult = mg ? (mg.value || mg.placeholder) : null;
          linea = { costo: num(pt.textContent), conUtilidad: num(cu.textContent) };
          break;
        }
      }
      return { mat: leer(mat), mult: mult, linea: linea };
    });

    if (r.error) throw new Error(r.error);
    if (!r.linea) throw new Error('no encontré un renglón de Materiales con precio');
    if (Number(r.mult) !== 3.9)
      throw new Error('el renglón pinta el multiplicador ' + r.mult + ', la sección tiene 3.9');
    const esperado = Math.round(r.linea.costo * 3.9);
    if (Math.abs(r.linea.conUtilidad - esperado) > 2)
      throw new Error('el renglón vende ' + r.linea.conUtilidad + ', con 3.9 debía dar ' + esperado);
    if (Math.abs(r.mat.suma - r.mat.total) > 2)
      throw new Error('los renglones suman ' + r.mat.suma + ' y el total dice ' + r.mat.total +
                      ': la hoja muestra dos verdades');
    console.log('    renglón × 3.9 = ' + r.linea.conUtilidad +
                ' · renglones ' + r.mat.suma + ' = total ' + r.mat.total);
  });

  await paso('en mano de obra el multiplicador pintado también es el de la sección', async () => {
    /* La otra tabla, por la misma vía y con el mismo descuido: `costoMo`
     * también se llamaba sin la sección. Aquí el multiplicador se pinta como
     * texto, no como campo, así que se lee distinto — y por eso se prueba
     * aparte en vez de confiar en que "es lo mismo". */
    await ir('#/m/M-1041');
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);
    const cel = '[data-cel^="mg:"][data-cel$=":mano_obra"]';
    await p.fill(cel, '3.1');
    await p.dispatchEvent(cel, 'change');
    await p.waitForTimeout(600);

    const r = await p.evaluate(() => {
      const num = (t) => Number(String(t || '').replace(/[^0-9.-]/g, '')) || 0;
      const t = [...document.querySelectorAll('.rejilla')]
        .find(x => x.querySelector('[data-cel*=":mo:"]'));
      const filas = [...t.querySelectorAll('tbody tr')]
        .filter(x => !x.classList.contains('total') && x.querySelector('[data-cel*=":mo:"]'));
      const mults = [...new Set(filas.map(f => {
        const c = f.querySelector('[data-l="Margen"]');
        return c ? c.textContent.trim() : null;
      }).filter(Boolean))];
      const suma = filas.reduce((a, f) => {
        const c = f.querySelector('[data-l="Precio con utilidad"]');
        return a + (c ? num(c.textContent) : 0);
      }, 0);
      const tr = t.querySelector('tr.total');
      const tds = tr ? [...tr.querySelectorAll('td')].map(x => num(x.textContent)) : [];
      return { mults, suma: Math.round(suma), tot: Math.max.apply(null, tds.concat([0])) };
    });

    // Mano de obra 3.1 → horas extras 6.2, y el programador sigue en el suyo.
    if (r.mults.indexOf('3.1') < 0)
      throw new Error('ningún renglón pinta 3.1; pinta: ' + JSON.stringify(r.mults));
    if (r.mults.indexOf('6.2') < 0)
      throw new Error('las horas extras no siguieron a mano de obra (3.1 × 2 = 6.2): ' +
                      JSON.stringify(r.mults));
    if (Math.abs(r.suma - r.tot) > 2)
      throw new Error('los renglones suman ' + r.suma + ' y el total dice ' + r.tot);
    console.log('    multiplicadores pintados ' + JSON.stringify(r.mults) +
                ' · renglones ' + r.suma + ' = total ' + r.tot);
  });

  await paso('V1.40 · la comisión de FTS de una sección NO mueve la de la otra', async () => {
    /* Ésta es LA prueba del encargo, y hasta la V1.39 decía lo contrario:
     * se llamaba «las comisiones SÍ son de toda la cotización» y comprobaba
     * que cambiar una en la sección 1 la cambiara en la 2. Eso era el
     * defecto, escrito como si fuera la regla.
     *
     * Se invierte entera, no se ajusta: una prueba que defendía el defecto
     * no se parchea, se reemplaza. */
    await ir('#/m/M-1041');
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);
    const uno = p.locator('[data-cel^="com:"][data-cel$=":fts"]').first();
    await uno.fill('9'); await uno.dispatchEvent('change');
    await p.waitForTimeout(900);

    await p.locator('.pestana').nth(2).click(); await p.waitForTimeout(350);
    const dos = p.locator('[data-cel^="com:"][data-cel$=":fts"]').first();
    const enDos = await dos.inputValue();
    if (Number(enDos) === 9)
      throw new Error('la comisión se contagió a la otra sección: ' + enDos);
    if (Math.abs(Number(enDos) - 5.5) > 1e-6)
      throw new Error('la otra sección debería seguir con la del machote (5.5), dice ' + enDos);

    const almacen = await p.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('fts_machote_v1'))
                  .machotes.find(x => x.id === 'M-1041');
      return { machote: m.comision_fts,
               secciones: (m.secciones || []).map(x => x.comision_fts) };
    });
    // El machote NO se toca: sigue siendo el valor de arranque de las demás.
    if (Math.abs(Number(almacen.machote) - 0.055) > 1e-9)
      throw new Error('se escribió en el machote: ' + almacen.machote);
    if (Math.abs(Number(almacen.secciones[0]) - 0.09) > 1e-9)
      throw new Error('la sección 1 no guardó 0.09: ' + JSON.stringify(almacen.secciones));
    if (almacen.secciones[1] !== undefined)
      throw new Error('la sección 2 no debería tener campo propio: ' + JSON.stringify(almacen.secciones));
    console.log('    sección 1 = 9% · sección 2 = 5.5% (heredada) · machote intacto 0.055');
  });

  await paso('V1.40 · el aviso de comisión apartada sale DEBAJO del cuadro, no en la cabecera', async () => {
    /* Dónde, no sólo si. El defecto de la V1.39 no fue que el aviso no
     * existiera: fue que estaba donde nadie mira. Se exige que esté en la
     * primera pantalla DESDE EL CAMPO —que es donde la persona está parada
     * cuando acaba de mover el número— y que la cabecera NO tenga un segundo
     * letrero diciendo lo mismo. */
    await ir('#/m/M-1041');
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);

    const sinAviso = await p.evaluate(() => !!document.querySelector('.com-apartada'));
    if (sinAviso) throw new Error('avisa de un desvío que no existe');

    const campo = p.locator('[data-cel^="com:"][data-cel$=":fts"]').first();
    await campo.scrollIntoViewIfNeeded();
    await campo.fill('11'); await campo.dispatchEvent('change');
    await p.waitForTimeout(900);
    await p.locator('[data-cel^="com:"][data-cel$=":fts"]').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);

    const r = await p.evaluate(() => {
      const a = document.querySelector('.com-apartada');
      const c = document.querySelector('[data-cel^="com:"][data-cel$=":fts"]');
      if (!a || !c) return { hay: !!a, campo: !!c };
      const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
      return { hay: true, texto: a.textContent.trim(),
               enPantalla: ra.top >= 0 && ra.top < innerHeight,
               debajo: ra.top > rc.top,
               distancia: Math.round(ra.top - rc.bottom),
               // Y que no haya quedado un segundo aviso de la banda vieja.
               banda: !!document.querySelector('.com-sec, [data-comprop], [data-ircom]') };
    });
    console.log('    ' + JSON.stringify(r));
    if (!r.hay) throw new Error('no avisó del desvío');
    if (!r.enPantalla) throw new Error('el aviso no está en la primera pantalla desde el campo');
    if (!r.debajo) throw new Error('el aviso no está DEBAJO del campo que se cambió');
    if (r.distancia > 260) throw new Error('el aviso quedó a ' + r.distancia + 'px del campo');
    if (r.banda) throw new Error('sigue viva la banda de excepción de la V1.34');
    if (!/esta secci/i.test(r.texto || ''))
      throw new Error('el aviso no dice que el cambio es sólo de esta sección: ' + r.texto);
  });

  await paso('el precio de una sección se mueve con SU multiplicador', async () => {
    /* Que el número quede guardado aparte no basta: tiene que llegar al
     * precio de esa sección y no al de la otra. Es la diferencia entre
     * separar el campo y separar el cálculo. */
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const base = { moneda: 'MXN', margenes: { materiales: 2, servicios: 1.7, mano_obra: 2.5, programador: 4.4 } };
      const part = () => ([{ qty: 1, pu: 100, tipo: 'Materiales', moneda: 'MXN' }]);
      const m = Object.assign({}, base, { secciones: [
        { id: 'a', nombre: 'A', margenes: { materiales: 3 }, mo: [], partidas: part() },
        { id: 'b', nombre: 'B', mo: [], partidas: part() }
      ] });
      const c = C.calcular(m);
      return { a: c.secciones[0].ventaMat, b: c.secciones[1].ventaMat, total: c.ventaMat };
    });
    if (r.a !== 300) throw new Error('la sección con 3 debía vender 300, vendió ' + r.a);
    if (r.b !== 200) throw new Error('la sección que hereda 2 debía vender 200, vendió ' + r.b);
    if (r.total !== 500) throw new Error('el total no suma las dos: ' + r.total);
    console.log('    A (3) → 300 · B (hereda 2) → 200 · total 500');
  });

  await paso('una sección sin multiplicadores propios hereda los del machote', async () => {
    /* Los machotes capturados ANTES de este cambio no tienen `margenes` en la
     * sección. Si heredar fallara, todos mostrarían la plantilla de golpe y
     * cambiarían de precio solos. Es la prueba de que no hay que migrar nada. */
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const viejo = { margenes: { materiales: 1.67, servicios: 1.7, mano_obra: 2.5, programador: 4.4 } };
      const mg = C.margenes(viejo, { nombre: 'sin margenes propios' });
      return { mat: mg.materiales, ser: mg.servicios };
    });
    if (r.mat !== 1.67) throw new Error('no heredó materiales: ' + r.mat);
    if (r.ser !== 1.7) throw new Error('no heredó servicios: ' + r.ser);
    console.log('    machote 1.67/1.7 → la sección sin propios muestra 1.67/1.7');
  });

  await paso('una sección nueva nace completa y con sus multiplicadores', async () => {
    /* La pestaña `+` armaba la sección a mano y la creaba VACÍA: sin los diez
     * renglones de mano de obra ni los treinta de materiales. Se descubrió al
     * hacer los multiplicadores por sección. */
    await ir('#/m/M-1041');
    // 900 ms, no 400: el autoguardado espera medio segundo desde la última
    // tecla. Con 400 el archivo todavía no existía y el `JSON.parse` reventaba
    // contra un null — la prueba fallaba por la espera, no por la sección.
    await p.locator('.pestana.mas').click(); await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const crudo = localStorage.getItem('fts_machote_v1');
      if (!crudo) throw new Error('el autoguardado no alcanzó a escribir');
      const d = JSON.parse(crudo);
      const m = d.machotes.find(x => x.id === 'M-1041');
      const s = m.secciones[m.secciones.length - 1];
      return { mo: (s.mo || []).length, part: (s.partidas || []).length,
               mg: s.margenes ? s.margenes.materiales : null };
    });
    // V1.26 · 10 del Excel + 3 de viaje.
    if (r.mo !== 13) throw new Error('nació con ' + r.mo + ' renglones de mano de obra, no 13');
    if (r.part !== 30) throw new Error('nació con ' + r.part + ' partidas, no 30');
    if (r.mg === null) throw new Error('nació sin multiplicadores propios');
    console.log('    13 de mano de obra (10 del Excel + 3 de viaje) · 30 partidas · materiales ' + r.mg);
  });

  // ── El cliente, desde Odoo ───────────────────────────────────────────
  await paso('al crear, el cliente sale de una lista leída de Odoo', async () => {
    await ir('#/nuevo');
    await p.waitForTimeout(320);
    const r = await p.evaluate(() => {
      const dl = document.querySelector('#n-clientes');
      const est = document.querySelector('#n-cliente-est');
      const inp = document.querySelector('#n-cliente');
      return {
        opciones: dl ? [...dl.querySelectorAll('option')].map(o => o.value) : null,
        estado: est ? est.textContent : null,
        lista: inp ? inp.getAttribute('list') : null,
        aviso: est ? est.className : null
      };
    });
    if (r.lista !== 'n-clientes') throw new Error('el campo no está ligado a la lista');
    if (!r.opciones || r.opciones.length !== 3)
      throw new Error('opciones: ' + JSON.stringify(r.opciones));
    if (r.opciones.indexOf('BBVA México') < 0) throw new Error('falta un cliente del catálogo');
    if (!/3 clientes de Odoo/.test(r.estado || '')) throw new Error('el aviso dice: ' + r.estado);
    if (/n-warn/.test(r.aviso || '')) throw new Error('marcó aviso de fallo con el catálogo cargado');
    console.log('    3 clientes en la lista · aviso: ' + (r.estado || '').slice(0, 40) + '…');
  });

  await paso('lo que se guarda es el ID de Odoo, no el nombre', async () => {
    /* El fondo del cambio que pidió Esteban: "publicamente grabe el ID … lo
     * dinamico sea la lectura en odoo". Si se guardara el nombre, cambiarle
     * la razón social a un cliente dejaría todas las cotizaciones viejas con
     * el nombre de ayer — y este repo es público. */
    await ir('#/nuevo');
    await p.waitForTimeout(320);
    await p.fill('#n-nombre', 'ZZ prueba de cliente');
    await p.fill('#n-cliente', 'BBVA México');
    await p.click('#n-crear');
    await p.waitForTimeout(320);
    const r = await p.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}')
        .machotes.find(x => x.nombre === 'ZZ prueba de cliente');
      return { id: m && m.cliente_id, txt: m && m.cliente,
               barra: (document.querySelector('#tbT') || {}).textContent };
    });
    if (r.id !== 1247) throw new Error('cliente_id guardado: ' + JSON.stringify(r.id));
    if (r.barra !== 'BBVA México') throw new Error('la barra muestra: ' + r.barra);
    console.log('    guardó cliente_id 1247 · la pantalla dice "' + r.barra + '"');
  });

  await paso('el nombre se lee de Odoo, no del texto guardado', async () => {
    /* Un machote guardado con el nombre VIEJO debe pintarse con el nombre
     * vivo. Es la prueba de que el id manda sobre el respaldo — y de que el
     * repintado tras la lectura de Odoo de verdad ocurre.
     *
     * Página aparte, SIN el guion que limpia el almacén: aquí hay que escribir
     * en localStorage y volver a cargar, y el guion global lo borraría en la
     * navegación siguiente. (Ya pasó al escribir esta prueba.) */
    const o = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(o);
await sembrarMachotes(o);
    await o.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false
        }));
      } catch (e) {}
      const original = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/comercial/clientes') >= 0) {
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: true, total: 1, clientes: [
              { id: 1247, nombre: 'BBVA México' }
            ] });
          } });
        }
        return original.apply(this, arguments);
      };
    });
    try {
      /* El almacén sólo se escribe cuando algo CAMBIA — cargar la demo no
       * guarda nada—, así que primero se crea un machote de verdad. Eso
       * dispara el guardado y deja el archivo en localStorage para sembrarlo.
       * (Suponer que ya estaba escrito fue el primer intento, y falló.) */
      await o.goto(BASE); await o.waitForTimeout(400);
      await o.evaluate(() => { location.hash = '#/nuevo'; });
      await o.waitForTimeout(400);
      await o.fill('#n-nombre', 'ZZ nombre viejo');
      await o.fill('#n-cliente', 'BANCOMER (nombre viejo)');   // no está en el catálogo
      await o.click('#n-crear');
      await o.waitForTimeout(400);

      const sembro = await o.evaluate(() => {
        const crudo = localStorage.getItem('fts_machote_v1');
        if (!crudo) return false;
        const d = JSON.parse(crudo);
        const m = d.machotes.find(x => x.nombre === 'ZZ nombre viejo');
        if (!m) return false;
        // El id de Odoo entra a mano; el texto guardado se queda VIEJO a
        // propósito: es lo que no debe ganarle a la lectura de Odoo.
        m.cliente_id = 1247;
        localStorage.setItem('fts_machote_v1', JSON.stringify(d));
        return true;
      });
      if (!sembro) throw new Error('el almacén no tenía nada que sembrar');
      await o.goto(BASE); await o.waitForTimeout(1100);  // el catálogo llega y repinta
      // El recién creado va al principio de la lista (`unshift`).
      const t = await o.evaluate(() => document.querySelector('.fila .tiny').textContent);
      if (t.indexOf('BBVA México') < 0) {
        /* ⚠️ Esta prueba falló UNA vez en la suite completa (23-sep, V1.37) y
         * pasó aislada y en la corrida siguiente sobre el mismo commit. El
         * mensaje decía «Johnson Controls Enterprises», que es el cliente del
         * PRIMER machote de la fixture — o sea que la tarjeta de arriba no era
         * la recién creada. Eso descarta «el catálogo no alcanzó a llegar» (en
         * ese caso diría «BANCOMER») y apunta a que el machote nuevo no estaba,
         * o no estaba primero.
         *
         * Con el dato de arriba no se puede distinguir entre las dos cosas, así
         * que el fallo ahora se lleva consigo lo que hace falta para saberlo:
         * qué tarjetas hay en pantalla y qué machotes hay en el almacén. Si
         * vuelve a pasar, el mensaje contesta solo. */
        const ev = await o.evaluate(() => {
          const crudo = localStorage.getItem('fts_machote_v1');
          let store = null;
          try { store = JSON.parse(crudo || 'null'); } catch (e) {}
          return {
            tarjetas: Array.from(document.querySelectorAll('.fila .grow > strong, .nm'))
              .map(e => (e.textContent || '').trim().slice(0, 40)),
            hayAlmacen: !!crudo,
            guardado_at: store && store.guardado_at,
            enAlmacen: store && (store.machotes || []).map(m => m.nombre + '|' + (m.cliente_id || '-')),
            sesion: !!localStorage.getItem('fts_suite_session')
          };
        });
        throw new Error('siguió mostrando el nombre guardado: ' + t +
                        '\n      EVIDENCIA · tarjetas en pantalla: ' + JSON.stringify(ev.tarjetas) +
                        '\n      EVIDENCIA · almacén presente: ' + ev.hayAlmacen +
                        ' · guardado_at: ' + ev.guardado_at +
                        ' · sesión: ' + ev.sesion +
                        '\n      EVIDENCIA · machotes en el almacén: ' + JSON.stringify(ev.enAlmacen));
      }
      if (t.indexOf('BANCOMER') >= 0) throw new Error('mostró el nombre viejo: ' + t);
      console.log('    guardado "BANCOMER (nombre viejo)" → pinta "BBVA México"');
    } finally { await o.close(); }
  });

  await paso('un cliente que no está en Odoo se guarda igual, como texto', async () => {
    await ir('#/nuevo');
    await p.waitForTimeout(320);
    await p.fill('#n-nombre', 'ZZ prospecto');
    await p.fill('#n-cliente', 'Prospecto que nadie ha dado de alta');
    await p.click('#n-crear');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}')
        .machotes.find(x => x.nombre === 'ZZ prospecto');
      return { id: m && m.cliente_id, txt: m && m.cliente,
               barra: (document.querySelector('#tbT') || {}).textContent };
    });
    if (r.id !== null) throw new Error('inventó un id: ' + JSON.stringify(r.id));
    if (r.txt !== 'Prospecto que nadie ha dado de alta')
      throw new Error('perdió el texto: ' + r.txt);
    if (r.barra !== 'Prospecto que nadie ha dado de alta')
      throw new Error('no lo pinta: ' + r.barra);
  });

  await paso('si Odoo no contesta, el cliente se captura a mano y se dice', async () => {
    /* La mitad TOLERANTE del contrato (§8 anti-trabón): el webhook puede no
     * existir todavía, o n8n estar caído. Crear un machote no se bloquea por
     * eso — y el aviso explica por qué la lista está vacía, en vez de dejar
     * un campo mudo que parece roto. */
    const f = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(f);
await sembrarMachotes(f);
    try {
      await f.addInitScript(() => {
        try {
          localStorage.clear();
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'x.y.z', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600
          }));
        } catch (e) {}
        const original = window.fetch;
        window.fetch = function (u) {
          if (String(u).indexOf('/comercial/clientes') >= 0) {
            return Promise.reject(new Error('n8n caído'));
          }
          return original.apply(this, arguments);
        };
      });
      await f.goto(BASE); await f.waitForTimeout(400);
      await f.evaluate(() => { location.hash = '#/nuevo'; });
      await f.waitForTimeout(500);
      const est = await f.evaluate(() => {
        const e = document.querySelector('#n-cliente-est');
        return { txt: e && e.textContent, cls: e && e.className };
      });
      if (!/no se pudo leer el catálogo/i.test(est.txt || ''))
        throw new Error('no avisó: ' + est.txt);
      if (!/n-warn/.test(est.cls || '')) throw new Error('el aviso no se marca');
      if (!/se guarda igual/.test(est.txt || ''))
        throw new Error('no dice que igual se puede capturar: ' + est.txt);

      await f.fill('#n-nombre', 'ZZ sin odoo');
      await f.fill('#n-cliente', 'Cliente a mano');
      await f.click('#n-crear');
      await f.waitForTimeout(300);
      const m = await f.evaluate(() => JSON.parse(localStorage.getItem('fts_machote_v1'))
        .machotes.find(x => x.nombre === 'ZZ sin odoo'));
      if (!m) throw new Error('no dejó crear el machote sin catálogo');
      if (m.cliente !== 'Cliente a mano') throw new Error('perdió el cliente: ' + m.cliente);
      if (m.cliente_id !== null) throw new Error('inventó un id sin catálogo');
      console.log('    catálogo caído → se avisa, y el machote se crea igual');
    } finally { await f.close(); }
  });

  // ── Respaldo (V1.17) ─────────────────────────────────────────────────
  await paso('el autor se estampa al crear, del token', async () => {
    /* Hasta V1.16 `analista` quedaba vacío en TODO machote real porque
     * `vNuevo()` no lo pasaba: lo capturado no decía de quién era. Es
     * requisito del almacén compartido, no un adorno. */
    await ir('#/nuevo');
    await p.waitForTimeout(320);
    await p.fill('#n-nombre', 'ZZ con autor');
    await p.click('#n-crear');
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => JSON.parse(localStorage.getItem('fts_machote_v1'))
      .machotes.find(x => x.nombre === 'ZZ con autor'));
    if (!m) throw new Error('no se creó');
    if (m.creado_por !== 'zz.prueba')
      throw new Error('creado_por: ' + JSON.stringify(m.creado_por));
    if (m.creado_por_nombre !== 'ZZ Prueba')
      throw new Error('creado_por_nombre: ' + JSON.stringify(m.creado_por_nombre));
    if (!m.creado_at) throw new Error('sin creado_at');
    console.log('    ' + m.creado_por + ' · ' + m.creado_por_nombre);
  });

  await paso('exportar y reimportar el mismo archivo no duplica ni pierde', async () => {
    /* La prueba central del rescate. Se exporta, se vuelve a importar EL MISMO
     * contenido, y tiene que dar copias marcadas — no duplicados silenciosos
     * ni, peor, un reemplazo. Se mide sobre el motor de fusión, que es donde
     * vive la regla; el botón se prueba aparte. */
    /* El almacén tiene que TENER algo, o esto fusiona cero contra cero y pasa
     * en vacío — un `0 → 0` se ve idéntico a un éxito (CLAUDE.md §9). Se crea
     * un machote de verdad primero, que además dispara el autoguardado. */
    await ir('#/nuevo');
    await p.waitForTimeout(320);
    await p.fill('#n-nombre', 'ZZ para exportar');
    await p.click('#n-crear');
    await p.waitForTimeout(900);
    await p.evaluate(() => { location.hash = '#/'; });
    await p.waitForTimeout(300);

    const r = await p.evaluate(() => {
      const R = window.MachoteRespaldo, A = window.MachoteAlmacen;
      const sobre = A.sobre({ actor: 'zz.prueba', nombre: 'ZZ Prueba' });
      const actuales = sobre.datos.machotes;
      const entrantes = A.machotesDe(sobre);
      const f = R.fusionar(actuales, entrantes);
      // Ninguno de los originales puede haber cambiado de id ni desaparecido.
      const idsAntes = actuales.map(m => m.id);
      const sobreviven = idsAntes.every(id => f.lista.some(m => m.id === id));
      return { antes: actuales.length, despues: f.lista.length,
               nuevos: f.nuevos, copias: f.copias, sobreviven,
               idsUnicos: new Set(f.lista.map(m => m.id)).size === f.lista.length };
    });
    if (!(r.antes > 0))
      throw new Error('el almacén estaba vacío: la prueba habría pasado en vacío');
    if (!r.sobreviven) throw new Error('se perdió un machote original');
    if (r.nuevos !== 0) throw new Error('contó ' + r.nuevos + ' como nuevos; eran los mismos');
    if (r.copias !== r.antes) throw new Error('copias ' + r.copias + ' ≠ ' + r.antes);
    if (r.despues !== r.antes * 2) throw new Error('total ' + r.despues);
    if (!r.idsUnicos) throw new Error('generó ids repetidos');
    console.log('    ' + r.antes + ' → ' + r.despues + ' · ' + r.copias +
                ' copias, 0 perdidos, ids únicos');
  });

  await paso('importar un id existente crea copia y NO pisa', async () => {
    /* La regla dura: importar no puede destruir. Se importa un machote con un
     * id que ya existe pero con el nombre cambiado; el original tiene que
     * seguir intacto y el entrante entrar al lado. */
    await ir('#/');
    const r = await p.evaluate(() => {
      const R = window.MachoteRespaldo;
      const actuales = [
        { id: 'M-X', nombre: 'EL BUENO', cliente: 'A' },
        { id: 'M-Y', nombre: 'otro', cliente: 'B' }
      ];
      const entrantes = [
        { id: 'M-X', nombre: 'EL DEL ARCHIVO', cliente: 'Z' },
        { id: 'M-NUEVO', nombre: 'no existía', cliente: 'C' }
      ];
      const f = R.fusionar(actuales, entrantes);
      const orig = f.lista.find(m => m.id === 'M-X');
      const copia = f.lista.find(m => m._copia_de === 'M-X');
      return { total: f.lista.length, nuevos: f.nuevos, copias: f.copias,
               origNombre: orig && orig.nombre, origCliente: orig && orig.cliente,
               copiaId: copia && copia.id, copiaNombre: copia && copia.nombre,
               tieneNuevo: f.lista.some(m => m.id === 'M-NUEVO') };
    });
    if (r.origNombre !== 'EL BUENO')
      throw new Error('PISÓ el original: ahora dice ' + r.origNombre);
    if (r.origCliente !== 'A') throw new Error('cambió el cliente del original');
    if (!r.copia_id && !r.copiaId) throw new Error('no creó la copia');
    if (r.copiaId === 'M-X') throw new Error('la copia reusó el id');
    if (!/importado/.test(r.copiaNombre || '')) throw new Error('la copia no está marcada');
    if (!r.tieneNuevo) throw new Error('perdió el que sí era nuevo');
    if (r.nuevos !== 1 || r.copias !== 1) throw new Error(JSON.stringify(r));
    console.log('    original intacto "' + r.origNombre + '" · copia ' + r.copiaId);
  });

  await paso('un archivo que no se entiende no toca nada', async () => {
    /* Aplicar la mitad de un archivo roto deja un estado que nadie pidió. */
    await ir('#/');
    const r = await p.evaluate(() => {
      const R = window.MachoteRespaldo;
      const actuales = [{ id: 'M-X', nombre: 'intacto' }];
      return {
        basura: R.importarTexto('esto no es json', actuales),
        jsonAjeno: R.importarTexto('{"hola":1}', actuales),
        siguen: actuales.length
      };
    });
    if (r.basura.ok) throw new Error('aceptó basura');
    if (r.jsonAjeno.ok) throw new Error('aceptó un JSON sin machotes');
    if (!/JSON válido/.test(r.basura.error)) throw new Error('no explica: ' + r.basura.error);
    if (!/lista de machotes/.test(r.jsonAjeno.error)) throw new Error('no explica: ' + r.jsonAjeno.error);
    if (r.siguen !== 1) throw new Error('tocó la lista');
    console.log('    rechaza y explica, sin tocar nada');
  });

  await paso('el respaldo se queda al pie; importar ya no está', async () => {
    /* V1.24. Importar se retiró: existía para meter a mano lo que vivía suelto
     * en el navegador de cada quien mientras no había servidor, y con los
     * machotes ya en Postgres su único efecto posible era crear duplicados.
     * Exportar se queda porque es la única salida cuando el guardado se rompe
     * —`avisarNoGuarda()` lo ofrece ahí mismo— pero baja de botón a enlace.
     *
     * Se comprueba que NO quedó el input de archivo, no sólo que no se vea:
     * un `<input type=file>` escondido sigue siendo alcanzable. */
    await ir('#/');
    const r = await p.evaluate(() => {
      const b = document.querySelector('#bExportar');
      const rb = b && b.getBoundingClientRect();
      return { hayB: !!b, txt: b && b.textContent,
               altoB: rb && Math.round(rb.height),
               hayImport: !!document.querySelector('#fImportar'),
               hayInputArchivo: document.querySelectorAll('input[type=file]').length };
    });
    if (!r.hayB) throw new Error('se llevó también el respaldo');
    if (r.hayImport || r.hayInputArchivo)
      throw new Error('sigue habiendo por dónde importar: ' + JSON.stringify(r));
    if (!/respaldo de lo mío \(\d+\)/.test(r.txt || '')) throw new Error('dice: ' + r.txt);
    if (r.altoB < 44) throw new Error('no se alcanza con el pulgar: ' + r.altoB + ' px');
    console.log('    "' + (r.txt || '').trim() + '" · ' + r.altoB + ' px · 0 entradas de archivo');
  });


  await paso('cuando el guardado falla, el aviso tapa y no se puede ignorar', async () => {
    /* El pulso dice la verdad pero se puede no ver. Esto no. */
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    try {
      await q.addInitScript(() => {
        try {
          localStorage.clear();
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'x.y.z', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600
          }));
        } catch (e) {}
        const o = window.fetch;
        window.fetch = function (u) {
          if (String(u).indexOf('/comercial/clientes') >= 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, clientes: [] }) });
          }
          return o.apply(this, arguments);
        };
      });
      await q.goto(BASE); await q.waitForTimeout(400);
      // El almacén deja de aceptar, como en modo privado o al llenarse.
      await q.evaluate(() => { localStorage.setItem = function () { throw new Error('QuotaExceeded'); }; });
      await q.evaluate(() => { location.hash = '#/nuevo'; }); await q.waitForTimeout(400);
      await q.fill('#n-nombre', 'ZZ sin almacen');
      await q.click('#n-crear');
      await q.waitForTimeout(700);
      const r = await q.evaluate(() => {
        const n = document.querySelector('#noGuarda');
        if (!n) return { hay: false };
        const c = n.getBoundingClientRect();
        return { hay: true, rol: n.getAttribute('role'), txt: n.textContent,
                 abajo: Math.round(c.bottom) >= window.innerHeight - 2,
                 ancho: Math.round(c.width) >= window.innerWidth - 2,
                 exporta: !!document.querySelector('#ngExp') };
      });
      if (!r.hay) throw new Error('no avisó nada');
      if (r.rol !== 'alert') throw new Error('no se anuncia como alerta');
      if (!/No se está guardando/.test(r.txt)) throw new Error('no lo dice: ' + r.txt.slice(0, 80));
      if (!/se pierde/.test(r.txt)) throw new Error('no dice la consecuencia');
      if (!r.abajo || !r.ancho) throw new Error('no tapa: no llega a los bordes');
      if (!r.exporta) throw new Error('avisa pero no da salida');
      console.log('    barra a lo ancho, con "Exportar ahora" al lado');
    } finally { await q.close(); }
  });

  // ── El gate ──────────────────────────────────────────────────────────
  await paso('sin sesión, el libro no se alcanza a ver', async () => {
    // Pagina LIMPIA, sin la sesion sembrada: debe mandar al login.
    const g = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(g);
await sembrarMachotes(g);
    try {
      await g.goto(BASE); await g.waitForTimeout(600);
      const u = g.url();
      if (!/login\.html$/.test(u)) throw new Error('no mandó al login, quedó en: ' + u);
      // Y que no haya alcanzado a pintar el libro antes de irse.
      const hayLibro = await g.evaluate(() => !!document.querySelector('.libro, .pestana'));
      if (hayLibro) throw new Error('pintó el libro antes de redirigir');
    } finally { await g.close(); }
  });

  await paso('la sesión dice quién entró, por su nombre, y deja salir', async () => {
    /* Montalvo pidió ver al usuario. `zz.prueba` truncado no dice quién es;
     * el NOMBRE sí. El usuario exacto queda en el title, para cuando haga
     * falta el dato literal. */
    await ir('#/m/M-1041');
    const t = await p.locator('#tbUser').textContent();
    if (t.trim() !== 'ZZ Prueba') throw new Error('la barra dice: ' + t);
    const tit = await p.locator('#tbUser').getAttribute('title');
    if (tit !== 'zz.prueba') throw new Error('el title no trae el usuario: ' + tit);
    const vis = await p.locator('#tbUser').isVisible();
    if (!vis) throw new Error('el botón de sesión no se ve');
  });

  await paso('una sesión vencida no vale', async () => {
    const v = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(v);
await sembrarMachotes(v);
    try {
      await v.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'x.y.z', actor: 'zz.vencida', scopes: ['comercial:read'],
            exp: Math.floor(Date.now() / 1000) - 60      // venció hace un minuto
          }));
        } catch (e) {}
      });
      await v.goto(BASE); await v.waitForTimeout(600);
      if (!/login\.html$/.test(v.url())) throw new Error('dejó pasar una sesión vencida');
    } finally { await v.close(); }
  });

  await paso('sin el permiso de comercial no se entra, y lo dice', async () => {
    const w = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(w);
await sembrarMachotes(w);
    try {
      await w.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'x.y.z', actor: 'ana.rh', scopes: ['nomina:write', 'rh:read'],
            exp: Math.floor(Date.now() / 1000) + 3600
          }));
        } catch (e) {}
      });
      await w.goto(BASE); await w.waitForTimeout(700);
      if (!/login\.html/.test(w.url())) throw new Error('no sacó de la pantalla: ' + w.url());
      const t = await w.textContent('body');
      if (!/no tiene el permiso/.test(t))
        throw new Error('no explicó por qué: ' + t.slice(0, 140));
      if (t.indexOf('comercial:read') < 0) throw new Error('no dice qué permiso falta');
      if (t.indexOf('ana.rh') < 0) throw new Error('no dice con qué usuario entró');
    } finally { await w.close(); }
  });

  /* ═══ El almacén contra servidor (#140) ═══════════════════════════════
   * Lo que se prueba aquí es la CAPA DEL NAVEGADOR: que se sigue capturando
   * sin red, que lo local nunca se pierde, y que el pulso no miente. Que el
   * servidor hace cumplir sus reglas ya se probó contra la base real. */

  await paso('un machote MARCADO como ejemplo no llega a la lista ni al servidor', async () => {
    /* V1.27 · la premisa de esta prueba cambió. Decía «localStorage limpio =>
     * en pantalla va la demo», y ya no: los ejemplos se retiraron de la lista
     * porque tres veces acabaron en producción.
     *
     * Lo que sigue habiendo —y es lo que se afirma aquí— son las DOS defensas
     * en profundidad para lo que ya esté guardado en algún navegador: el
     * ejemplo marcado no se pinta, y aunque se pintara, `empujar` lo rechaza. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q);
    await q.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1,
          guardado_at: new Date().toISOString(), handoff: {}, machotes: [
            { _demo: true, id: 'M-1041', nombre: 'Ejemplo de fábrica',
              estado: 'borrador', moneda: 'MXN', secciones: [] }
          ] }));
      } catch (e) {}
      window.__guardadosAlServidor = 0;
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/machote-guardar') >= 0) {
          window.__guardadosAlServidor++;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, version: 1 }) });
        }
        if (s.indexOf('/webhook/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1400);
      const n = await q.evaluate(() => window.__guardadosAlServidor || 0);
      if (n) throw new Error('subió ' + n + ' machote(s) de ejemplo al servidor');
      const filas = await q.$$eval('table.lista tbody tr', els => els.length);
      if (filas !== 0) throw new Error('el ejemplo marcado se pintó igual: ' + filas + ' renglón(es)');
      // Y el candado de `empujar`, por si un día vuelve a la lista.
      const r = await q.evaluate(() => window.MachoteAlmacen.pendientes([
        { _demo: true, id: 'M-1041', nombre: 'x' }
      ]));
      if (r !== 0) throw new Error('`pendientes` cuenta un ejemplo como por subir: ' + r);
      console.log('    0 subidas · 0 en la lista · el candado de empujar sigue puesto');
    } finally { await q.close(); }
  });

  await paso('con el servidor colgado: se guarda aquí y el pulso NO miente', async () => {
    /* Página propia, sin el guion que limpia: aquí se mide justo lo contrario
     * —que lo tecleado sobreviva— y con el servidor sin contestar. */
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false
        }));
        /* ⚠️ V1.27 · ya NO se borra `fts_machote_v1`. Antes daba igual —la
         * aplicación arrancaba con los cuatro ejemplos— pero los ejemplos se
         * retiraron, así que borrarlo dejaba esta prueba sin nada que teclear.
         * La fixture la siembra `sembrarMachotes`, que es de dónde tiene que
         * salir. Sí se borra la libreta de sincronización: lo que se mide es
         * que lo tecleado quede PENDIENTE de subir. */
        localStorage.removeItem('fts_machote_sync_v1');
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        // El servidor nunca contesta. Ni para leer ni para guardar.
        if (String(u).indexOf('/comercial/machote') >= 0) return new Promise(() => {});
        if (String(u).indexOf('/comercial/clientes') >= 0) return new Promise(() => {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(400);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(400);
      await q.locator('.pestana', { hasText: 'Suministro' }).first().click();
      await q.waitForTimeout(250);
      const cel = q.locator('[data-cel^="nom:"]');
      await cel.fill('Capturado sin servidor');
      await cel.dispatchEvent('change');
      await q.waitForTimeout(1200);

      const guardado = await q.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
        return d ? JSON.stringify(d).indexOf('Capturado sin servidor') >= 0 : false;
      });
      if (!guardado) throw new Error('no quedó en el navegador con el servidor colgado');

      const cls = await q.getAttribute('#pulso', 'class');
      if (/p-guardado|p-limpio/.test(cls || ''))
        throw new Error('el pulso dice guardado y el servidor nunca contestó: ' + cls);
      if (!/p-pendiente/.test(cls || ''))
        throw new Error('esperaba pulso pendiente, hay: ' + cls);
      console.log('    a salvo en el navegador · pulso ' + cls.replace('pulso ', ''));
    } finally { await q.close(); }
  });

  await paso('al reconectar sube lo pendiente solo, y sin dueño en el cuerpo', async () => {
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false
        }));
        // Lo que quedó capturado en una sesión anterior SIN red: está en el
        // navegador y no tiene libreta de sincronización, o sea, sin subir.
        localStorage.setItem('fts_machote_v1', JSON.stringify({
          v: 1, guardado_at: new Date().toISOString(), handoff: {},
          machotes: [{ id: 'M-PEND-1', nombre: 'Quedó pendiente', estado: 'borrador',
                       secciones: [], moneda: 'MXN', comision_fts: 0.055,
                       comision_cliente: 0, margen_deseado: 0.4, tc: 0 }]
        }));
        localStorage.removeItem('fts_machote_sync_v1');
      } catch (e) {}
      window.__enviados = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/machote-guardar') >= 0) {
          let c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          window.__enviados.push(c);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, machote_id: 'uuid-de-mentiras', id_local: c.id_local,
            dueno: 'zz.prueba', version: (Number(c.version_leida) || 0) + 1,
            versiones: 1, autor: 'zz.prueba', guardada_at: new Date().toISOString() }) });
        }
        if (s.indexOf('/comercial/machotes-leer') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: 'zz.prueba', machotes: [], total: 0 }) });
        }
        if (s.indexOf('geo.json') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__GEO) });
        if (s.indexOf('/comercial/clientes') >= 0) return new Promise(() => {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1500);
      const enviados = await q.evaluate(() => window.__enviados || []);
      if (!enviados.length) throw new Error('no intentó subir lo pendiente al arrancar');
      const e = enviados[0];
      if (e.id_local !== 'M-PEND-1') throw new Error('subió otra cosa: ' + e.id_local);
      if (!e.token) throw new Error('no mandó token');
      if (e.documento === undefined) throw new Error('subió sin documento');
      // El dueño lo pone el SERVIDOR desde el token. Si viajara en el cuerpo,
      // cualquiera podría guardar a nombre de otro.
      if (e.dueno !== undefined || e.autor !== undefined)
        throw new Error('el cliente manda dueño/autor: ' + JSON.stringify(Object.keys(e)));
      console.log('    subió ' + enviados.length + ' · ' + e.id_local +
                  ' · version_leida ' + e.version_leida + ' · sin dueño en el cuerpo');
    } finally { await q.close(); }
  });

  await paso('un machote sin autor toma el de quien exportó, y queda dicho', async () => {
    const r = await p.evaluate(() => window.MachoteRespaldo.importarTexto(JSON.stringify({
      formato: 'fts-machote-respaldo', v: 1,
      exportado_por: 'francisco.montalvo', exportado_por_nombre: 'Francisco Montalvo',
      datos: { v: 1, machotes: [
        { id: 'M-VIEJO-1', nombre: 'Nació sin autor', creado_por: '' },
        { id: 'M-VIEJO-2', nombre: 'Ya traía autor', creado_por: 'ricardo.hernandez' }
      ] }
    }), []));
    if (!r.ok) throw new Error('no importó: ' + r.error);
    const a = r.lista.find(x => x.id === 'M-VIEJO-1');
    const b2 = r.lista.find(x => x.id === 'M-VIEJO-2');
    if (a.creado_por !== 'francisco.montalvo')
      throw new Error('no resolvió el autor: ' + a.creado_por);
    if (a._autor_resuelto !== 'al importar')
      throw new Error('resolvió el autor sin dejar dicho que fue deducido');
    if (b2.creado_por !== 'ricardo.hernandez')
      throw new Error('pisó el autor de uno que sí lo traía: ' + b2.creado_por);
    if (r.autor_resuelto !== 1) throw new Error('mal el conteo: ' + r.autor_resuelto);
    console.log('    1 sin autor resuelto a francisco.montalvo · 1 respetado');
  });

  await paso('sin quien exportó, NO se inventa autor', async () => {
    const r = await p.evaluate(() => window.MachoteRespaldo.importarTexto(JSON.stringify({
      machotes: [{ id: 'M-HUERFANO', nombre: 'Sin nada', creado_por: '' }]
    }), []));
    if (!r.ok) throw new Error('no importó: ' + r.error);
    const a = r.lista.find(x => x.id === 'M-HUERFANO');
    if (a.creado_por) throw new Error('inventó un autor: ' + a.creado_por);
    if (r.autor_resuelto !== 0) throw new Error('dice que resolvió algo: ' + r.autor_resuelto);
  });

  await paso('el historial se puede abrir y NO trae botón de restaurar', async () => {
    await ir('#/');
    await p.evaluate(() => {
      window.fetch = (function (orig) {
        return function (u, o) {
          if (String(u).indexOf('/comercial/machotes-leer') >= 0) {
            var c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
            if (c.machote_id) {
              return Promise.resolve({ ok: true, json: function () {
                return Promise.resolve({ ok: true, modo: 'historial', versiones: [
                  { id: 'u1', version: 2, autor: 'ricardo.hernandez',
                    autor_nombre: 'Ricardo Hernández', guardada_at: '2026-09-04T19:47:00Z',
                    estado: 'revision', motivo: 'Se renegoció el reparto con el cliente',
                    total: 1620600, margen: 0.4, comision_fts: 0.035, comision_cliente: 0.02,
                    moneda: 'MXN', tc: 17.35, tc_fuente: 'DOF', documento: { nota: 'v2' } },
                  { id: 'u1', version: 1, autor: 'francisco.montalvo',
                    autor_nombre: 'Francisco Montalvo', guardada_at: '2026-09-02T16:04:00Z',
                    estado: 'borrador', motivo: null,
                    total: 1598200, margen: 0.4, comision_fts: 0.055, comision_cliente: 0,
                    moneda: 'MXN', tc: 17.35, tc_fuente: 'DOF', documento: { nota: 'v1' } }
                ], total: 2 });
              } });
            }
          }
          return orig.apply(this, arguments);
        };
      })(window.fetch);
      // El almacén sólo pide historial de lo que ya subió.
      localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
        'M-1': { version: 2, huella: 'x', machote_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
      }));
    });
    const hay = await p.$('[data-hist]');
    if (!hay) throw new Error('no hay botón de historial en la lista');
    await p.evaluate(() => {
      const m = { id: 'M-1', nombre: 'Prueba historial' };
      window.MachoteHistorial.abrir(m);
    });
    await p.waitForTimeout(600);
    const cuerpo = await p.textContent('#modalHist');
    if (!/Versión 2/.test(cuerpo)) throw new Error('no listó las versiones: ' + cuerpo.slice(0, 160));
    if (!/Ricardo Hernández/.test(cuerpo)) throw new Error('no dice el autor');
    if (!/renegoció el reparto/.test(cuerpo)) throw new Error('no muestra el motivo');
    const apretables = await p.$$eval('#modalHist button', els =>
      els.map(e => (e.textContent || '').trim()));
    if (apretables.some(t => /restaur/i.test(t)))
      throw new Error('hay un control de restaurar: ' + JSON.stringify(apretables));
    console.log('    ' + apretables.length + ' botón(es): ' + JSON.stringify(apretables));
  });

  await paso('abrir una versión anterior avisa que es sólo lectura y marca lo que cambió', async () => {
    await p.click('#hs-lista .v[data-i="1"]');
    await p.waitForTimeout(250);
    const aviso = await p.textContent('#hs-aviso');
    if (!/modo lectura/.test(aviso)) throw new Error('no avisa que es lectura: ' + aviso);
    // Volver a la última y comprobar el resaltado del cambio de comisiones.
    await p.click('#hs-lista .v[data-i="0"]');
    await p.waitForTimeout(250);
    const filas = await p.$$eval('#hs-cuerpo tr', trs =>
      trs.filter(tr => tr.querySelector('td.dif')).map(tr => tr.cells[0].textContent.trim()));
    if (!filas.includes('Comisión FTS') || !filas.includes('Comisión cliente'))
      throw new Error('no resaltó las comisiones que cambiaron: ' + JSON.stringify(filas));
    console.log('    resaltado: ' + filas.join(', '));
    await p.evaluate(() => window.MachoteHistorial.cerrar());
  });

  /* ── El estado contra el servidor (#140 · A) ──────────────────────────
   *
   * V1.24: la FRANJA se retiró (era andamio del rescate y así estaba
   * documentada). Estas pruebas eran ocho y probaban la franja; quedan
   * tres, y prueban lo que la franja probaba y sigue siendo verdad: la
   * COMPARACIÓN contra el servidor. El sujeto cambió de `#franjaSync` a
   * `A.estadoServidor()`, que es donde vivía la lógica todo el tiempo.
   *
   * Las cinco que se fueron probaban botones que ya no existen («Subir
   * ahora», «Comprobar») o el texto de la propia franja. La que decía que
   * sin poder preguntar al servidor lo DICE se fue de aquí porque quien
   * clasifica sesión/red/servidor es `sesion.js`, y eso tiene sus pruebas
   * en su bloque: la franja sólo pintaba el resultado.
   *
   * Estas pruebas NO usan un servidor inventado: usan la RESPUESTA LITERAL
   * que el webhook `comercial/machotes-leer` devolvió contra la base real
   * (ejecución 89278, machote `M-PRUEBA-140-H`). La regla que lo obliga es
   * CLAUDE.md §20 #10 —el archivo puede estar bien y el camino mal—: un
   * servidor fingido a mano prueba lo que uno cree que devuelve el servidor,
   * no lo que devuelve. La trampa concreta que esto atrapa es que Postgres
   * guarda `jsonb` SIN conservar el orden de las llaves, así que el
   * documento vuelve reordenado y una comparación ingenua lo daría por
   * cambiado para siempre.
   *
   * Van en páginas propias porque necesitan sembrar la caché ANTES de que
   * arranque la app, y el guion global de arriba limpia `localStorage` en
   * cada navegación. */
  const FR_REAL = {"ok":true,"modo":"lista","actor":"zz.prueba.140","machotes":[{"id":"fa8e80e8-58d8-4a1c-b9fc-64b22a119550","id_local":"M-PRUEBA-140-H","cliente_odoo_id":null,"odoo_lead_id":null,"odoo_so_id":null,"dueno":"zz.prueba.140","dueno_nombre":"Cuenta de prueba 140","creado_at":"2026-09-07T03:53:16.547Z","actualizado_at":"2026-09-07T03:53:24.749Z","version":2,"versiones":2,"autor":"zz.prueba.140","autor_nombre":"Cuenta de prueba 140","guardada_at":"2026-09-07T03:53:24.740Z","estado":"revision","motivo":"Se renegocio el reparto: baja la de FTS y entra 2% para el contacto.","total":1000,"margen":0.4,"moneda":"MXN","tc":null,"tc_fuente":null,"comision_fts":0.035,"comision_cliente":0.02,"documento":{"nombre":"Cotizacion historial v2"}}],"total":1};

  /** Abre una página con el servidor real fingido y la caché ya sembrada.
   *  `permitirGuardar` false = el servidor rechaza los guardados (caído). */
  const frPagina = async (machotes, permitirGuardar) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript((cfg) => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba.140',
          nombre: 'Cuenta de prueba 140', empleado_id: null,
          scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600,
          debe_cambiar_password: false }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({
          v: 1, guardado_at: new Date().toISOString(), handoff: {}, machotes: cfg.machotes }));
        localStorage.removeItem('fts_machote_sync_v1');
      } catch (e) {}
      window.__permitir = cfg.permitir;
      window.__guard = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/machotes-leer') >= 0)
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve(cfg.real); } });
        /* V1.29 · archivar ESCRIBE AL SERVIDOR. Sin esta rama la llamada se
         * va al `fetch` de verdad, no contesta nadie, y la prueba falla por
         * el MONTAJE y no por el producto. */
        if (s.indexOf('/comercial/machote-archivar') >= 0) {
          var ar = {}; try { ar = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          window.__archivados = (window.__archivados || []);
          window.__archivados.push({ accion: ar.accion, machote_id: ar.machote_id });
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: true, hecho: true, accion: ar.accion,
              folio_txt: 'COT-0099', versiones: 1,
              mensaje: 'Archivada. No se borro nada.' }); } });
        }
        if (s.indexOf('/comercial/machote-guardar') >= 0) {
          var c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          if (!window.__permitir) {
            return Promise.resolve({ ok: true, json: function () {
              return Promise.resolve({ ok: false, error: 'SIN_RED', mensaje: 'servidor caído' }); } });
          }
          window.__guard.push(c);
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: true, machote_id: 'uuid', id_local: c.id_local,
              dueno: 'zz.prueba.140', version: (Number(c.version_leida) || 0) + 1,
              versiones: 1, autor: 'zz.prueba.140' }); } });
        }
        // El catálogo de clientes se queda colgado a propósito: no es el tema
        // de estas pruebas y un fetch real ensucia la consola.
        if (s.indexOf('geo.json') >= 0) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(window.__GEO); } });
        if (s.indexOf('/comercial/clientes') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { real: FR_REAL, machotes: machotes, permitir: permitirGuardar !== false });
    await q.goto(BASE);
    await q.waitForTimeout(1600);
    return q;
  };

  // El machote local EXACTAMENTE como el servidor lo devolvió, y el mismo con
  // las llaves al revés — que es lo que hace `jsonb` al releerlo.
  const FR_IGUAL = { id: 'M-PRUEBA-140-H', nombre: 'Cotizacion historial v2' };
  const FR_VOLTEADO = { nombre: 'Cotizacion historial v2', id: 'M-PRUEBA-140-H' };

  await paso('estado: "a salvo" cuando lo local coincide con el servidor real', async () => {
    const q = await frPagina([FR_IGUAL]);
    try {
      const r = await q.evaluate(() => window.MachoteAlmacen.estadoServidor());
      const e = await r;
      if (!e || e.ok !== true) throw new Error('no pudo preguntar: ' + JSON.stringify(e));
      if (e.pendientes !== 0) throw new Error('lo dio por pendiente: ' + JSON.stringify(e));
      if (e.subidos !== 1 || e.total !== 1) throw new Error('cuenta mal: ' + JSON.stringify(e));
      console.log('    ' + e.subidos + ' de ' + e.total + ' a salvo · 0 pendientes');
    } finally { await q.close(); }
  });

  await paso('estado: el orden de las llaves NO cuenta como cambio (la trampa de jsonb)', async () => {
    /* La razón de que estas pruebas usen la respuesta LITERAL del webhook
     * contra la base y no un servidor inventado a mano: Postgres guarda
     * `jsonb` sin conservar el orden de las llaves, así que el documento
     * vuelve reordenado y una comparación ingenua lo daría por cambiado para
     * siempre — la franja habría dicho «por subir» de todo, para siempre, y
     * hoy lo diría el aviso de pendientes. */
    const q = await frPagina([FR_VOLTEADO]);
    try {
      const e = await q.evaluate(() => window.MachoteAlmacen.estadoServidor());
      if (!e || e.ok !== true) throw new Error('no pudo preguntar: ' + JSON.stringify(e));
      if (e.pendientes !== 0)
        throw new Error('lo dio por pendiente sólo por el orden de las llaves: ' + JSON.stringify(e));
      console.log('    con las llaves al revés sigue a salvo');
    } finally { await q.close(); }
  });

  await paso('lo que NO subió se avisa, se cuenta y se puede señalar', async () => {
    /* Esto es lo que reemplaza a la franja, y la diferencia está probada
     * abajo: con todo a salvo NO hay aviso —el silencio es la respuesta—, y
     * con algo atorado el aviso aparece, dice cuántas, y «Cuáles son» las
     * marca DENTRO de la lista, sin cambiar de vista. */
    const limpia = await frPagina([FR_IGUAL]);
    try {
      /* Con todo a salvo NO hay aviso. Y se comprueba DESPUÉS de que la subida
       * de arranque termina, porque ahí está el defecto que esto cierra: el
       * aviso se pintaba una vez y se quedaba rancio — «1 sin subir» con
       * `pendientes()` ya en 0 y el pulso en «guardado». Un aviso que no se
       * actualiza es peor que no avisar: enseña a no creerle. */
      await limpia.waitForTimeout(1500);
      const est = await limpia.evaluate(() => ({
        pendientes: window.MachoteAlmacen.pendientes(),
        aviso: !!document.querySelector('#avPend'),
        pulso: (document.querySelector('#pulso') || {}).className || ''
      }));
      if (est.pendientes !== 0)
        throw new Error('el montaje no sirve: quedó pendiente ' + JSON.stringify(est));
      if (est.aviso)
        throw new Error('aviso RANCIO: dice que falta subir algo con pendientes=0 · ' +
                        JSON.stringify(est));
      if (!/p-guardado/.test(est.pulso))
        throw new Error('el pulso no llegó a guardado: ' + est.pulso);
      console.log('    con todo a salvo: sin aviso y pulso en guardado (el silencio es la respuesta)');
    } finally { await limpia.close(); }

    /* El servidor RECHAZA guardar en este montaje, así que lo pendiente se
     * queda pendiente y el aviso tiene algo que decir.
     *
     * Se exige el INVARIANTE, no un número escrito a mano: que el aviso diga
     * exactamente lo que cuenta `pendientes()`, y que «Cuáles son» señale
     * exactamente esos renglones. Un literal aquí probaría el montaje, no el
     * código — y de hecho la primera versión de esta prueba decía «1» porque
     * asumí que el otro machote estaba a salvo. Con el servidor caído no lo
     * está: nunca se confirmó su subida, y no poder confirmarla es
     * precisamente lo que el aviso reporta. */
    const q = await frPagina([FR_IGUAL, { id: 'M-SOLO-AQUI', nombre: 'Nunca subió' }], false);
    try {
      const n = await q.evaluate(() => window.MachoteAlmacen.pendientes());
      if (n < 1) throw new Error('el montaje no sirve: no quedó nada pendiente');

      const t = (await q.textContent('#avPend') || '').replace(/\s+/g, ' ').trim();
      const dice = Number((t.match(/^(\d+) cotizaci/) || [])[1]);
      if (dice !== n)
        throw new Error('el aviso dice ' + dice + ' y pendientes() cuenta ' + n + ': ' + t);
      if (!/no ha[n]? subido al servidor/.test(t)) throw new Error('dice: ' + t);
      if (!/Siguen guardadas en este navegador/.test(t))
        throw new Error('no dice que lo capturado sigue aquí: ' + t);

      await q.click('#bVerPend');
      await q.waitForTimeout(300);
      const marcados = await q.$$eval('[data-mid].marcado',
        f => f.map(x => x.getAttribute('data-mid')));
      const unicos = marcados.filter((x, i, a) => a.indexOf(x) === i).sort();
      const esperados = await q.evaluate(() =>
        (window.MachoteAlmacen.leer().machotes || [])
          .filter(m => window.MachoteAlmacen.pendienteUno(m))
          .map(m => m.id).sort());
      if (JSON.stringify(unicos) !== JSON.stringify(esperados))
        throw new Error('marcó ' + JSON.stringify(unicos) + ' y lo pendiente es ' +
                        JSON.stringify(esperados));
      if (esperados.indexOf('M-SOLO-AQUI') < 0)
        throw new Error('el que nunca subió no salió pendiente: ' + JSON.stringify(esperados));
      console.log('    avisa ' + dice + ' · señala los mismos ' + unicos.length + ': ' +
                  unicos.join(', '));
    } finally { await q.close(); }
  });

  /* ── Control de dirección y cascarones de orden (#140 · B, C y D) ──────
   *
   * Lo que estas pruebas cuidan no es que "se vea": es que ninguna de las tres
   * pantallas MIENTA. La de control, que no invente números cuando no puede
   * preguntar ni cuando no hay llave; las dos de cascarón, que digan en la
   * cara que son demostración y que no marquen nada como enviado. */

  const cdPagina = async (scopes, respuesta) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript((cfg) => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: cfg.scopes,
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('/comercial/machotes-control') >= 0) {
          if (!cfg.respuesta) return Promise.reject(new Error('sin red'));
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve(cfg.respuesta); } });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { scopes: scopes, respuesta: respuesta || null });
    return q;
  };

  const CD_LLENO = { ok: true, total_machotes: 14, total_versiones: 39, total_personas: 4,
    personas: [{ actor: 'francisco.montalvo', nombre: 'Francisco Montalvo',
                 machotes: 6, versiones: 18, ultima_subida: new Date().toISOString() }],
    _meta: { fuente: 'postgres:comercial.machote', leido: new Date().toISOString() } };

  await paso('control: sin la llave lo DICE, y lo que enseña va marcado como demostración', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE + '#/control'); await q.waitForTimeout(900);
      const t = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/no tiene llave/i.test(t)) throw new Error('no dice que falta el permiso: ' + t.slice(0, 120));
      if (!/comercial:admin/.test(t)) throw new Error('no nombra el scope que falta');
      if (!(await q.$('.chip.demo'))) throw new Error('no marca la demostración');
      /* Lo importante: NO puede haber conteos que parezcan reales. */
      if (/\b(6|14|39)\b/.test(await q.textContent('.ctrl-kpis')))
        throw new Error('enseñó números que parecen reales sin haber preguntado');
      console.log('    ' + t.slice(0, 92) + '…');
    } finally { await q.close(); }
  });

  await paso('control: con la llave pinta lo que contestó el servidor, con su hora', async () => {
    const q = await cdPagina(['comercial:read', 'comercial:admin'], CD_LLENO);
    try {
      await q.goto(BASE + '#/control'); await q.waitForTimeout(900);
      const t = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/14/.test(t) || !/39/.test(t)) throw new Error('no pintó los conteos: ' + t.slice(0, 120));
      if (!/Francisco Montalvo/.test(t)) throw new Error('no pintó a la persona');
      if (!/Leído del servidor/.test(t)) throw new Error('no dice cuándo lo leyó');
      if (await q.$('.chip.demo')) throw new Error('marcó como demo algo que sí es real');
      if (!(await q.$('#ct-releer'))) throw new Error('no se puede volver a contar');
      console.log('    14 machotes · 39 versiones · con sello de lectura');
    } finally { await q.close(); }
  });

  await paso('control: si el servidor no contesta lo DICE, no enseña ceros', async () => {
    /* El modo de fallo que cierra: un tablero que ante un servidor mudo pinte
     * "0 machotes" y su dueño concluya que nadie está capturando. */
    const q = await cdPagina(['comercial:read', 'comercial:admin'], null);
    try {
      await q.goto(BASE + '#/control'); await q.waitForTimeout(1200);
      const t = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/No se pudo|no se entiende|contactar/i.test(t))
        throw new Error('no avisó del fallo: ' + t.slice(0, 140));
      /* Y sobre todo: NI UN NÚMERO. Un «0» grande al lado del aviso se lee
       * como «nadie ha subido nada» y el aviso se descarta. */
      if (await q.$('.ctrl-kpis')) throw new Error('pintó tarjetas de conteo sin haber leído nada');
      if (await q.$('.ctrl-t')) throw new Error('pintó la tabla de personas sin haber leído nada');
      console.log('    ' + t.slice(0, 90) + '…');
    } finally { await q.close(); }
  });

  await paso('control: el enlace sólo aparece para quien tiene la llave', async () => {
    const sin = await cdPagina(['comercial:read']);
    const con = await cdPagina(['comercial:read', 'comercial:admin'], CD_LLENO);
    try {
      await sin.goto(BASE); await sin.waitForTimeout(900);
      await con.goto(BASE); await con.waitForTimeout(900);
      if (await sin.$('a[href="#/control"]')) throw new Error('se ofrece a quien no puede entrar');
      if (!(await con.$('a[href="#/control"]'))) throw new Error('no se ofrece a quien sí puede');
      /* Y la lista tiene que SEGUIR PINTÁNDOSE con la llave puesta: la primera
       * versión de este enlace usaba su `const` antes de declararlo y tiraba
       * `vHome()` entera — pantalla en blanco justo para el único que iba a
       * tener el permiso. */
      if (!(await con.$('.fila'))) throw new Error('con la llave la lista sale vacía');
      console.log('    sin llave: no aparece · con llave: aparece y la lista sigue viva');
    } finally { await sin.close(); await con.close(); }
  });

  await paso('cascarón de orden: prellena del MOTOR, no de números escritos a mano', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);

      /* El machote sale de `window.DEMO`, NO de `leerLocal()`: en el primer
       * arranque la demo vive sólo en memoria y no se escribe en el navegador
       * hasta que alguien toca algo, así que `leerLocal()` devuelve null. Es
       * la misma fuente de la que la app clona su estado. */
      const esperado = await q.evaluate(() => {
        const id = location.hash.split('/')[2];
        const m = window.DEMO.MACHOTES.find(x => x.id === id);
        return window.MachoteCalc.calcular(m).precio;
      });
      const texto = await q.textContent('#or-total');
      const visto = Number(texto.replace(/[^0-9.]/g, ''));
      if (Math.abs(visto - esperado) > 0.02)
        throw new Error('el cascarón enseña ' + visto + ' y el motor dice ' + esperado);

      // Una línea por sección, ni una más.
      const secciones = await q.evaluate(() => {
        const id = location.hash.split('/')[2];
        return window.DEMO.MACHOTES.find(x => x.id === id).secciones.length;
      });
      const filas = (await q.$$('.or-t tbody tr')).length;
      if (filas !== secciones) throw new Error(filas + ' renglones para ' + secciones + ' secciones');
      console.log('    total ' + visto + ' = el del motor · ' + filas + ' renglón(es) para ' + secciones + ' sección(es)');
    } finally { await q.close(); }
  });

  await paso('cascarón de orden: cambiar la cantidad recalcula de verdad', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);
      const antes = Number((await q.textContent('#or-total')).replace(/[^0-9.]/g, ''));
      const pu = Number((await q.textContent('.or-t tbody tr:first-child td:nth-child(4)')).replace(/[^0-9.]/g, ''));
      await q.fill('.or-t tbody tr:first-child input.cel.n', '2');
      await q.waitForTimeout(200);
      const despues = Number((await q.textContent('#or-total')).replace(/[^0-9.]/g, ''));
      if (Math.abs((despues - antes) - pu) > 0.02)
        throw new Error('subió ' + (despues - antes) + ' y debía subir ' + pu);
      console.log('    de ' + antes + ' a ' + despues + ' al poner 2 (un unitario más)');
    } finally { await q.close(); }
  });

  await paso('cascarón de orden: los estorbos se CALCULAN del machote', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);
      const t = (await q.textContent('.estorbos')).replace(/\s+/g, ' ');
      /* ⚠️ V1.30 · ESTA ASERCIÓN SE DIO LA VUELTA, y por una razón: hasta
       * V1.29 exigía que la lista dijera que `comercial/orden-crear` NO
       * existe —era el tapón de fondo, y era verdad—. El webhook ya existe y
       * está probado, así que seguir diciéndolo convertiría el tapón en una
       * mentira. Ahora se exige lo contrario: que NO lo diga.
       *
       * Y tampoco se cambió por otra adivinanza. La pantalla no puede saber
       * si el endpoint está ENCENDIDO sin preguntar, así que no lo afirma en
       * ningún sentido: se entera al apretar. Lo prueba el paso de abajo. */
      if (/orden-crear/.test(t) || /webhook/i.test(t))
        throw new Error('sigue afirmando algo del webhook que ya no puede saber: ' + t.slice(0, 140));
      if (!/No se arregla aquí/i.test(t)) throw new Error('no separa lo que no toca al analista');
      if (!/comercial:orden/.test(t))
        throw new Error('no nombra el permiso que de verdad falta hoy: ' + t.slice(0, 140));
      console.log('    ' + t.slice(0, 100) + '…');
    } finally { await q.close(); }
  });

  /* ══ V1.30 · LA ORDEN DE VERDAD ═══════════════════════════════════════════
   *
   * Hasta V1.29 esta pantalla era un cascarón y sus pruebas medían que NO
   * hiciera nada. Ahora hay un webhook detrás, así que lo que hay que medir es
   * lo contrario y es más delicado: que la pantalla **no dé nada por hecho**.
   *
   * La regla es la del kiosko (hallazgo #15) y la misma que ya gobierna la
   * marca de «enviada»: lo que se pinta sale del SERVIDOR, nunca del recuerdo
   * de haber apretado. Las tres pruebas de aquí abajo atacan esa regla desde
   * los tres lados por donde se rompe: el servidor dice que no, el servidor
   * dice que ya existía, y el servidor devuelve números distintos de los que
   * la pantalla tenía. */
  const ordPagina = async (respuestaOrden) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript((cfg) => {
      const poner = function () {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            empleado_id: null, scopes: ['comercial:read', 'comercial:orden'],
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
          /* La libreta de sincronización: sin un uuid y una versión, `crearOrden`
           * ni siquiera sale a la red —y con razón, porque la orden se emite
           * desde la versión guardada en el servidor—. Sembrarla es lo que hace
           * que estas pruebas midan el camino y no el atajo. */
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-1041': { version: 3, huella: 'x',
                        machote_id: '11111111-2222-3333-4444-555555555555' }
          }));
          /* Desde V1.31 el botón de crear la orden NACE BLOQUEADO si el machote
           * no tiene cliente del catálogo. Estas pruebas miden OTRA cosa —qué
           * hace la pantalla con lo que contesta el servidor—, así que el
           * fixture tiene que tener el cliente puesto o se quedan esperando un
           * botón que nunca se habilita. Lo del cliente que falta lo cubren las
           * cuatro pruebas de V1.31, que para eso están. */
          const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
          if (d && d.machotes && d.machotes.length) {

/* ── V1.33 · los cinco compromisos, en el fixture ─────────────────────
 * Misma razón que el `cliente_id` de arriba: desde V1.33 el botón de
 * crear la orden NACE BLOQUEADO si faltan los cinco compromisos
 * comerciales. Estas pruebas miden OTRA cosa, así que el fixture los
 * trae puestos. Que falten lo cubren las pruebas de V1.33. */
const CP = { pago: { dias: 30, termino_texto: 'Crédito 30 días',
                     termino_id: null, hitos: [] },
             incoterm: 'DAP',
             entrega: { texto: '8 a 10 semanas', fecha: '2026-12-15' },
             vigencia: { dias: 30, hasta: '2026-10-15' },
             at: new Date().toISOString(), por: 'zz.prueba' };
            d.machotes.forEach(function (m) {
              if (!m.cliente_id) { m.cliente_id = 991; m.cliente = 'ZZ Cliente de prueba'; }
              if (!m.compromisos) m.compromisos = JSON.parse(JSON.stringify(CP));
            });
            localStorage.setItem('fts_machote_v1', JSON.stringify(d));
          }
        } catch (e) {}
      };
      poner();
      const limpiar = localStorage.clear.bind(localStorage);
      localStorage.clear = function () { limpiar(); poner(); };

      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('/comercial/orden-crear') >= 0) {
          return Promise.resolve({ ok: true,
            json: function () { return Promise.resolve(cfg.r); } });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { r: respuestaOrden });
    return q;
  };

  /** Abre el cascarón de orden sobre el primer machote de la lista. */
  const abrirOrden = async (q) => {
    await q.goto(BASE); await q.waitForTimeout(900);
    const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
    await q.goto(BASE + href); await q.waitForTimeout(900);
    await q.click('#btnOrden'); await q.waitForTimeout(400);
  };

  await paso('V1.30 · el botón NO da por creada la orden: si el servidor no contesta que sí, no se dice que sí', async () => {
    /* El servidor apagado contesta el 404 PROPIO de n8n —`{code, message,
     * hint}`, sin `ok`—, que es el caso real mientras Esteban no encienda el
     * webhook. Lo que se mide: que la pantalla lo diga con SUS palabras y que
     * NO aparezca por ningún lado la pantalla de «Orden creada». */
    const q = await ordPagina({ code: 404, message: 'The requested webhook is not registered.' });
    try {
      await abrirOrden(q);
      await q.click('#or-crear'); await q.waitForTimeout(900);

      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      if (/Orden creada/i.test(t))
        throw new Error('pintó la orden como creada sin que el servidor lo dijera: ' + t.slice(0, 140));
      if (!/no est[áa] encendid/i.test(t))
        throw new Error('no dice que el servidor está apagado: ' + t.slice(0, 200));
      /* Y el botón tiene que volver a estar disponible: dejarlo muerto
       * obligaría a recargar para reintentar algo que sí se puede reintentar. */
      if (await q.$eval('#or-crear', el => el.disabled))
        throw new Error('dejó el botón inservible después de un fallo recuperable');
      console.log('    ' + t.slice(t.indexOf('No se creó'), t.indexOf('No se creó') + 96) + '…');
    } finally { await q.close(); }
  });

  await paso('V1.30 · la pantalla pinta lo que el SERVIDOR releyó de Odoo, no sus propios números', async () => {
    /* El servidor devuelve un subtotal DISTINTO del que la pantalla calculó.
     * Es el caso que importa: si la pantalla pintara lo suyo, un descuadre
     * real sería invisible justo cuando hace falta verlo. */
    const q = await ordPagina({
      ok: true, orden_creada: true, odoo_so_id: 99001, odoo_so_name: 'SO-PRUEBA-1',
      estado: 'draft', moneda: 'MXN', lista_precios: 'Public Pricelist (MXN)',
      empresa: 'SERVICIOS FTS', subtotal: 12345.67, impuesto: 1975.31, total: 14320.98,
      total_machote: 99999.99, cuadra: false, moneda_correcta: true,
      ligada_en_la_base: true, vence_el: '2026-10-14',
      avisos: ['El subtotal de la orden (12345.67) no cuadra con el machote (99999.99).'],
      mensaje: 'La orden SO-PRUEBA-1 se creo, pero hay que mirarla.'
    });
    try {
      await abrirOrden(q);
      await q.click('#or-crear'); await q.waitForTimeout(900);

      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      if (!/Orden creada/i.test(t)) throw new Error('no pintó la pantalla de creada: ' + t.slice(0, 140));
      if (!/SO-PRUEBA-1/.test(t)) throw new Error('no pintó el nombre que dio el servidor');
      if (!/12,345\.67/.test(t))
        throw new Error('no pintó el subtotal del SERVIDOR: ' + t.slice(0, 220));
      if (!/no cuadra/i.test(t))
        throw new Error('no avisó del descuadre, que es lo único que hacía falta ver');
      if (!/99,999\.99/.test(t))
        throw new Error('no dice contra qué no cuadra');
      console.log('    subtotal del servidor 12,345.67 · avisa que no cuadra contra 99,999.99');
    } finally { await q.close(); }
  });

  await paso('V1.30 · si la orden ya existía, lleva al mismo sitio y NO inventa importes', async () => {
    /* Apretar dos veces tiene que terminar donde termina apretar una. Y como
     * esta respuesta no trae importes, la pantalla NO puede rellenarlos con
     * los suyos: sería un read-back que no hubo. */
    const q = await ordPagina({
      ok: true, ya_existia: true, orden_creada: false,
      odoo_so_id: 12088, odoo_so_name: 'SO11889',
      mensaje: 'Esta cotizacion ya tiene su orden en Odoo: SO11889.'
    });
    try {
      await abrirOrden(q);
      await q.click('#or-crear'); await q.waitForTimeout(900);

      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      if (!/Orden creada/i.test(t)) throw new Error('no llevó al mismo sitio: ' + t.slice(0, 140));
      if (!/SO11889/.test(t)) throw new Error('no dice cuál es la orden que ya existía');
      if (!/ya ten[ií]a su orden/i.test(t))
        throw new Error('no avisa que no se creó otra: ' + t.slice(0, 200));
      /* Lo que NO puede pasar: que aparezca el total del machote disfrazado de
       * subtotal de Odoo. El subtotal tiene que salir vacío. */
      const sub = await q.$eval('#modalOrden .or-t tbody tr:first-child td:last-child',
        el => el.textContent.trim());
      if (sub !== '—')
        throw new Error('inventó un subtotal que el servidor no dio: ' + sub);
      console.log('    mismo destino · subtotal «—» en vez de un número inventado');
    } finally { await q.close(); }
  });

  await paso('V1.30 · el desglose viaja SIN romper el cuadre al centavo, y sin costos', async () => {
    /* La regla dura del desglose: la suma de los renglones tiene que dar
     * exactamente el precio de la sección. Mandarlos como unitario × cantidad
     * la rompe, porque Odoo guarda `price_unit` con dos decimales. Aquí se
     * mide lo que SALE de `lineasParaOdoo`, que es lo que viaja. */
    const q = await ordPagina({ ok: true });
    try {
      await abrirOrden(q);
      const r = await q.evaluate(() => {
        const m = window.MachoteAlmacen.leerLocal().machotes[0];
        const pre = window.MachoteOrden._prellenar(m);
        /* Se abre el desglose de la primera sección a mano, como lo haría la
         * casilla, y se pide el reparto a prorrata. */
        const crudo = (m.secciones || [])[0] || {};
        const filas = window.MachoteOrden._desgloseDe(m, crudo, pre.lineas[0].precio);
        pre.lineas[0].desglose = filas;
        const salen = window.MachoteOrden._lineasParaOdoo(pre);
        const dePrimera = salen.slice(0, filas.length);
        return {
          precioSeccion: pre.lineas[0].precio,
          suma: dePrimera.reduce((a, l) => a + l.cantidad * l.precio, 0),
          cantidades: dePrimera.map(l => l.cantidad),
          texto: JSON.stringify(salen)
        };
      });

      if (!r.cantidades.length) throw new Error('el desglose salió vacío: no se midió nada');
      if (r.cantidades.some(c => c !== 1))
        throw new Error('un renglón desglosado salió con cantidad distinta de 1: ' + r.cantidades.join(','));
      if (Math.abs(r.suma - r.precioSeccion) >= 0.005)
        throw new Error('el desglose NO cuadra al centavo: ' + r.suma + ' vs ' + r.precioSeccion);
      /* Y el costo no se cuela por aquí tampoco. */
      if (/_peso|costo_mo|costo_mat|costoMo|costoMat/.test(r.texto))
        throw new Error('se coló un costo interno en lo que viaja a Odoo');
      console.log('    ' + r.cantidades.length + ' renglones · suman ' + r.suma.toFixed(2) +
                  ' = ' + Number(r.precioSeccion).toFixed(2) + ' · sin costos');
    } finally { await q.close(); }
  });


  /* ══ V1.30 · EL PANEL DE APROBADORES ══════════════════════════════════════
   *
   * La política de la Compuerta 1 vive en la base y se edita desde esta
   * pantalla. Lo que hay que medir NO es que pinte bonito, sino las dos
   * decisiones que la gobiernan:
   *
   *   1 · la ABRE cualquiera (ver con qué regla te miden no es un privilegio),
   *       pero EDITAR exige `comercial:admin`;
   *   2 · el margen viaja como FRACCIÓN. Un `35` tecleado donde va `0.35` es
   *       3500%, se ve perfectamente bien y nadie lo notaría — así que la
   *       pantalla tiene que pararlo ANTES de que salga a la red.
   *
   * El candado de verdad está en el servidor; estas pruebas miden que la
   * pantalla no ofrezca un botón que ya se sabe que va a fallar, que es cosa
   * distinta y también hace falta. */
  const polPagina = async (scopes, niveles) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript((cfg) => {
      const poner = function () {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            empleado_id: null, scopes: cfg.scopes,
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        } catch (e) {}
      };
      poner();
      const limpiar = localStorage.clear.bind(localStorage);
      localStorage.clear = function () { limpiar(); poner(); };

      /* Se apunta TODO lo que sale hacia la compuerta para poder exigir, en la
       * prueba del margen, que no haya salido nada. */
      window.__compuerta = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/compuerta') >= 0) {
          var cuerpo = {};
          try { cuerpo = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          window.__compuerta.push(cuerpo);
          if (cuerpo.modo === 'guardar') {
            return Promise.resolve({ ok: true, json: function () {
              return Promise.resolve({ ok: true, modo: 'guardar',
                guardados: (cuerpo.niveles || []).length,
                niveles: cfg.niveles, puede_editar: true }); } });
          }
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: true, modo: 'leer', niveles: cfg.niveles,
              total: cfg.niveles.length,
              puede_editar: cfg.scopes.indexOf('comercial:admin') >= 0 }); } });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { scopes: scopes, niveles: niveles });
    return q;
  };

  /** Los dos niveles de julio, que son los que sembró la migración 007. */
  const NIVELES_JULIO = [
    { nivel: 1, nombre: 'Revision de direccion', monto_desde: 500000, margen_bajo: 0.35,
      aprobador: null, aprobador_nombre: null, solo_marca: true, activo: true,
      updated_at: '2026-09-14 03:08:16.808284+00', updated_by: 'migracion-007' },
    { nivel: 2, nombre: 'Visto bueno del gerente', monto_desde: 100000, margen_bajo: null,
      aprobador: 'francisco.montalvo', aprobador_nombre: 'Francisco Montalvo',
      solo_marca: false, activo: true,
      updated_at: '2026-09-14 04:52:11.290283+00', updated_by: 'esteban.delacruz' }
  ];

  await paso('V1.30 · la política la VE cualquiera, pero sin dirección no ofrece guardarla', async () => {
    const q = await polPagina(['comercial:read'], NIVELES_JULIO);
    try {
      await q.goto(BASE + '#/politica'); await q.waitForTimeout(1100);
      const t = (await q.textContent('#vista')).replace(/\s+/g, ' ');

      /* Lo primero: la ve. Si rebotara a la lista, quien sale marcado nunca
       * sabría por qué lo marcaron. */
      if (!/Revision de direccion/.test(t) || !/Francisco Montalvo/.test(t))
        throw new Error('no enseñó la política a quien sólo lee: ' + t.slice(0, 200));
      if (!/500,000|500000/.test(t)) throw new Error('no enseñó el monto del nivel 1');

      /* Y lo segundo: ni un control de escritura. El candado de verdad está en
       * el servidor; esto es no ofrecer un botón que ya se sabe que falla. */
      const controles = await q.evaluate(() =>
        document.querySelectorAll('#vista input, #vista select, #vista textarea').length);
      if (controles) throw new Error('ofreció ' + controles + ' control(es) de captura a quien sólo lee');
      const botones = await q.evaluate(() => Array.prototype.map.call(
        document.querySelectorAll('#vista button'), b => (b.textContent || '').trim()));
      if (botones.some(x => /guardar|agregar/i.test(x)))
        throw new Error('ofreció escribir sin dirección: ' + botones.join(' · '));
      console.log('    lee los 2 niveles · 0 campos de captura · botones: ' +
                  (botones.join(' · ') || '(ninguno)'));
    } finally { await q.close(); }
  });

  await paso('V1.30 · con dirección sí edita, y lo que manda son FRACCIONES, no porcentajes', async () => {
    const q = await polPagina(['comercial:read', 'comercial:admin'], NIVELES_JULIO);
    try {
      await q.goto(BASE + '#/politica'); await q.waitForTimeout(1100);
      const campos = await q.evaluate(() =>
        document.querySelectorAll('#vista input').length);
      if (!campos) throw new Error('no dio campos a dirección');

      await q.click('#pol-guardar'); await q.waitForTimeout(700);
      const salidas = await q.evaluate(() => window.__compuerta || []);
      const g = salidas.filter(x => x.modo === 'guardar');
      if (g.length !== 1) throw new Error('mandó ' + g.length + ' guardados, esperaba 1');
      const n1 = (g[0].niveles || []).filter(x => Number(x.nivel) === 1)[0];
      if (!n1) throw new Error('no mandó el nivel 1: ' + JSON.stringify(g[0]).slice(0, 200));
      if (Math.abs(Number(n1.margen_bajo) - 0.35) > 1e-9)
        throw new Error('el margen salió como ' + n1.margen_bajo + ', no como fracción 0.35');
      if (Number(n1.monto_desde) !== 500000)
        throw new Error('el monto salió como ' + n1.monto_desde);
      console.log('    guardó nivel 1 con margen_bajo=' + n1.margen_bajo +
                  ' y monto_desde=' + n1.monto_desde);
    } finally { await q.close(); }
  });

  await paso('V1.30 · un 35 tecleado donde va 0.35 NO sale a la red: se para y se dice', async () => {
    /* El error que nadie notaría: «35» se ve bien escrito en la casilla de
     * margen, y significa 3500%. Si sale, la compuerta deja de dispararse
     * nunca — y la pantalla seguiría viéndose igual de correcta. */
    const q = await polPagina(['comercial:read', 'comercial:admin'], NIVELES_JULIO);
    try {
      await q.goto(BASE + '#/politica'); await q.waitForTimeout(1100);
      await q.evaluate(() => { window.__compuerta = []; });

      const sel = '#vista input[data-pol="margen_bajo"]';
      const hay = await q.$$(sel);
      if (!hay.length) throw new Error('no encontré la casilla del margen (data-pol)');
      await hay[0].fill('35');
      await q.click('#pol-guardar'); await q.waitForTimeout(700);

      const g = (await q.evaluate(() => window.__compuerta || []))
        .filter(x => x.modo === 'guardar');
      if (g.length) throw new Error('mandó un margen de 3500% a la base: ' +
                                    JSON.stringify(g[0].niveles).slice(0, 200));
      const av = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/fracci[óo]n|entre 0 y 1|0\.35/i.test(av))
        throw new Error('no explica que va como fracción: ' + av.slice(0, 240));
      console.log('    nada salió a la red · la pantalla explica la fracción');
    } finally { await q.close(); }
  });

  await paso('cascarón de envío: apretar el botón NO marca la cotización como enviada', async () => {
    /* La regla dura del brief, y la lección del kiosko: la marca la dispara el
     * envío confirmado, nunca el clic. Aquí no hay envío, así que no puede
     * haber marca — ni en la pantalla, ni en el machote guardado. */
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      /* Se compara TODO lo que el navegador tiene guardado, no un machote:
       * si algún día el cascarón marcara la cotización, tendría que
       * persistirlo, y eso aparecería aquí. En el primer arranque esto es
       * `null` —la demo vive en memoria— y seguir siendo `null` después del
       * clic es exactamente lo que se quiere probar. */
      const antes = await q.evaluate(() => JSON.stringify(window.MachoteAlmacen.leerLocal()));

      await q.click('#btnOrden'); await q.waitForTimeout(400);
      await q.click('#or-siguiente'); await q.waitForTimeout(400);
      await q.click('#or-enviar'); await q.waitForTimeout(1500);

      const t = (await q.textContent('#or-envio-estado')).replace(/\s+/g, ' ');
      if (/enviad[ao] ✓|se envió|marcad/i.test(t) && !/sigue sin marcarse/i.test(t))
        throw new Error('dio por enviado algo que no salió: ' + t.slice(0, 120));
      if (!/sigue sin marcarse como enviada/i.test(t))
        throw new Error('no dice que NO se marcó: ' + t.slice(0, 140));

      const despues = await q.evaluate(() => JSON.stringify(window.MachoteAlmacen.leerLocal()));
      if (antes !== despues) throw new Error('se guardó algo al apretar Enviar');
      console.log('    la pantalla lo dice y no se guardó nada (antes y después: ' +
        (antes === 'null' ? 'sin escribir' : 'idéntico') + ')');
    } finally { await q.close(); }
  });

  await paso('cascarón de envío: dice que el correo no está vinculado Y por qué', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);
      await q.click('#or-siguiente'); await q.waitForTimeout(400);
      const t = (await q.textContent('.corr')).replace(/\s+/g, ' ');
      /* Cambió la copia el 8-sep al elegirse el camino A: ya no es "no está
       * vinculado" (que sonaba a ajuste pendiente del usuario) sino de dónde
       * sale el correo y a quién le contesta el cliente. Lo que la prueba
       * exige es lo mismo de antes: el estado, el buzón, y qué falta. */
      if (!/no de la tuya|NO está vinculado/.test(t)) throw new Error('no dice el estado: ' + t.slice(0, 120));
      if (!/sales@fts\.mx/.test(t)) throw new Error('no dice cuál es el único buzón');
      if (!/responder a/i.test(t)) throw new Error('no dice que el cliente le contesta al vendedor');
      if (!/Azure/.test(t)) throw new Error('no dice qué falta');
      // Y "Vincular" no puede fingir que vinculó.
      await q.click('#or-vincular'); await q.waitForTimeout(250);
      const v = (await q.textContent('#or-vinc-caja')).replace(/\s+/g, ' ');
      if (!/No se puede vincular/i.test(v)) throw new Error('el botón fingió: ' + v.slice(0, 120));
      console.log('    estado + motivo + el botón no finge');
    } finally { await q.close(); }
  });

  await paso('cascarón: la cotización para imprimir NO lleva costos internos', async () => {
    /* El renglón de materiales trae precios de COMPRA. Que se cuelen en el
     * documento que ve el cliente sería el peor error posible de esta
     * pantalla, y no lo cazaría ninguna prueba de que "se ve bien". */
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
    const q = await ctx.newPage();
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
      const o = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/comercial/') >= 0) return new Promise(function () {});
        return o.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      const costos = await q.evaluate(() => {
        const id = location.hash.split('/')[2];
        const m = window.DEMO.MACHOTES.find(x => x.id === id);
        const c = window.MachoteCalc.calcular(m);
        return [c.costo, c.costoMo, c.costoMat].map(n => Math.round(n));
      });
      await q.click('#btnOrden'); await q.waitForTimeout(400);
      await q.click('#or-siguiente'); await q.waitForTimeout(400);
      const [hoja] = await Promise.all([ctx.waitForEvent('page'), q.click('#or-pdf')]);
      await hoja.waitForLoadState('domcontentloaded');
      await hoja.waitForTimeout(300);
      const txt = (await hoja.textContent('body')).replace(/\s+/g, ' ');
      const numeros = txt.replace(/[,\s]/g, '');
      costos.forEach(function (n) {
        if (n > 1000 && numeros.indexOf(String(n)) >= 0)
          throw new Error('se coló un costo interno en la hoja del cliente: ' + n);
      });
      if (!/DEMOSTRACIÓN/.test(txt)) throw new Error('no se identifica como demostración');
      console.log('    sin costos internos · sellada como demostración');
      await hoja.close();
    } finally { await ctx.close(); }
  });

  /* ══ El PDF de Odoo (V1.20) ═══════════════════════════════════════════ */

  await paso('el PDF de Odoo: el navegador NUNCA arma el enlace de portal', async () => {
    /* El `access_token` de una orden es una LLAVE DE CAPACIDAD: quien lo tenga
     * ve la orden completa sin entrar a Odoo. Si el enlace se armara aquí,
     * la llave acabaría en el historial, en el portapapeles y en cualquier
     * captura de pantalla. El servidor baja los bytes y devuelve los bytes.
     *
     * Es una prueba ESTÁTICA a propósito: el día que alguien "simplifique"
     * llamando a Odoo desde el navegador, esto truena aunque la pantalla se
     * vea igual — que es justo cuando no se nota. */
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'cotizacion.js'), 'utf8');
    const cuerpo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const prohibido of ['access_token', 'serviciosfts.odoo.com', '/my/orders']) {
      if (cuerpo.indexOf(prohibido) >= 0)
        throw new Error('el módulo del navegador toca Odoo directo: ' + prohibido);
    }
    if (cuerpo.indexOf('/comercial/cotizacion') < 0)
      throw new Error('no llama al webhook que debe');
    console.log('    ni access_token ni el dominio de Odoo en el código del navegador');
  });

  await paso('el PDF de Odoo: sin haber subido el machote lo DICE, no truena', async () => {
    /* El caso normal del primer día: la cotización vive sólo aquí, así que el
     * servidor no sabe de qué le hablan. Tiene que explicarlo antes de gastar
     * una llamada, y sin pintar un error rojo — no hay nada roto. */
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      const antes = await q.evaluate(() => JSON.stringify(window.MachoteAlmacen.leerLocal()));

      await q.click('#btnOrden'); await q.waitForTimeout(400);
      await q.click('#or-siguiente'); await q.waitForTimeout(400);
      if (!(await q.$('#or-pdf-odoo'))) throw new Error('no existe el botón de traer el PDF');
      await q.click('#or-pdf-odoo'); await q.waitForTimeout(700);

      const t = (await q.textContent('#or-pdf-estado')).replace(/\s+/g, ' ');
      if (!/Falta subirlo|todavía no llega al servidor/i.test(t))
        throw new Error('no explica por qué no puede: ' + t.slice(0, 140));
      if (/Bajado de Odoo/i.test(t))
        throw new Error('dijo que bajó un PDF que nunca pidió');

      /* Y no puede haber guardado nada: traer un documento es una LECTURA. */
      const despues = await q.evaluate(() => JSON.stringify(window.MachoteAlmacen.leerLocal()));
      if (antes !== despues) throw new Error('se guardó algo al pedir el PDF');
      console.log('    lo explica, no finge, y no escribió nada');
    } finally { await q.close(); }
  });

  await paso('el PDF de Odoo: el botón cabe y se toca a 380 px', async () => {
    const q = await cdPagina(['comercial:read']);
    try {
      await q.setViewportSize({ width: 380, height: 780 });
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);
      await q.click('#or-siguiente'); await q.waitForTimeout(400);
      const c = await q.$eval('#or-pdf-odoo', el => {
        const r = el.getBoundingClientRect();
        return { alto: Math.round(r.height), der: Math.round(r.right) };
      });
      if (c.alto < 40) throw new Error('mide ' + c.alto + ' px de alto, menos de los 40 del módulo');
      if (c.der > 380) throw new Error('se sale de la pantalla: llega a x=' + c.der);
      console.log('    ' + c.alto + ' px de alto, dentro de la pantalla');
    } finally { await q.close(); }
  });

  /* ══ La sesión no puede mentir (V1.21) ═══════════════════════════════
   * El 8-sep, al rotar el secreto, la aplicación dijo «no se pudo confirmar
   * con el servidor» —que invita a esperar— cuando lo que hacía falta era
   * volver a entrar. Y el token muerto se quedaba en el navegador, así que
   * reintentar no arreglaba nada. Se resolvió a mano desde la consola. */

  await paso('sesión rechazada: se borra la llave de sesión y NADA MÁS', async () => {
    /* La prueba que más importa de esta tanda. Dentro de `fts_machote_v1` hay
     * captura real de tres personas: una sesión vencida no es motivo para
     * perder trabajo. */
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      // Se siembran las dos llaves de datos con algo reconocible.
      await q.evaluate(() => {
        localStorage.setItem('fts_machote_v1', JSON.stringify({ machotes: [{ id: 'M-X', nombre: 'no me borres' }] }));
        localStorage.setItem('fts_machote_sync_v1', JSON.stringify({ 'M-X': { version: 3 } }));
      });
      const antes = await q.evaluate(() => ({
        sesion: !!localStorage.getItem('fts_suite_session'),
        datos:  localStorage.getItem('fts_machote_v1'),
        sync:   localStorage.getItem('fts_machote_sync_v1')
      }));
      if (!antes.sesion || !antes.datos) throw new Error('no quedó sembrado el escenario');

      await q.evaluate(() => window.MachoteSesion.caducar({ ok: false, error: 'FIRMA_INVALIDA' }));

      const desp = await q.evaluate(() => ({
        sesion: !!localStorage.getItem('fts_suite_session'),
        datos:  localStorage.getItem('fts_machote_v1'),
        sync:   localStorage.getItem('fts_machote_sync_v1'),
        aviso:  !!document.getElementById('sesionMuerta'),
        texto:  (document.getElementById('sesionMuerta') || {}).textContent || ''
      }));
      if (desp.sesion) throw new Error('NO borró la llave de sesión');
      if (desp.datos !== antes.datos) throw new Error('¡borró los machotes capturados!');
      if (desp.sync !== antes.sync) throw new Error('¡borró la libreta de sincronización!');
      if (!desp.aviso) throw new Error('no avisó nada');
      if (!/sesión expiró/i.test(desp.texto)) throw new Error('el aviso no dice qué pasó: ' + desp.texto.slice(0, 90));
      if (!/no se perdió/i.test(desp.texto)) throw new Error('no dice que lo capturado sigue ahí');
      console.log('    llave de sesión fuera · machotes y libreta intactos · aviso con la razón');
    } finally { await q.close(); }
  });

  await paso('los tres casos se distinguen: sesión, red y error del servidor', async () => {
    /* Hoy los tres decían lo mismo y llevan a acciones distintas. */
    const q = await cdPagina(['comercial:read']);
    try {
      await q.goto(BASE); await q.waitForTimeout(700);
      const r = await q.evaluate(() => {
        const S = window.MachoteSesion;
        const c = (e) => ({ caso: S.clasificar(e), texto: S.motivo(e) });
        return {
          expirado: c({ ok: false, error: 'TOKEN_EXPIRADO' }),
          firma:    c({ ok: false, error: 'FIRMA_INVALIDA' }),
          scope:    c({ ok: false, error: 'SCOPE_INSUFICIENTE' }),
          red:      c({ ok: false, error: 'SIN_RED' }),
          servidor: c({ ok: false, error: 'BASE_CAIDA' }),
          bien:     c({ ok: true })
        };
      });
      if (r.expirado.caso !== 'sesion' || r.firma.caso !== 'sesion')
        throw new Error('un token muerto no se reconoce como sesión: ' + JSON.stringify(r));
      if (r.red.caso !== 'red') throw new Error('la falta de red no se reconoce');
      if (r.servidor.caso !== 'servidor') throw new Error('un error del servidor se confunde');
      if (r.bien.caso !== 'ok') throw new Error('una respuesta buena se marca como fallo');
      // Y los textos tienen que ser DISTINTOS: si dicen lo mismo, no sirve de nada.
      const t = [r.expirado.texto, r.red.texto, r.servidor.texto];
      if (new Set(t).size !== 3) throw new Error('dos casos dicen lo mismo: ' + t.join(' / '));
      if (!/entrar/i.test(r.expirado.texto)) throw new Error('la sesión vencida no nombra la acción');
      if (!/conexión/i.test(r.red.texto)) throw new Error('la falta de red no la nombra');
      if (r.scope.texto === r.expirado.texto) throw new Error('«sin permiso» y «sesión vencida» dicen lo mismo');
      console.log('    ' + t.map(x => x.slice(0, 34)).join(' | '));
    } finally { await q.close(); }
  });

  /* ══ La demo nunca llega al servidor (V1.21) ═════════════════════════════
   * El 8-sep se colaron cuatro demostraciones a la base de producción, con
   * id M-1041 a M-1044, porque nada las distinguía de una captura real. */

  await paso('un machote de demo NUNCA se manda al servidor', async () => {
    await ir('#/');
    {
      const q = p;
      const r = await q.evaluate(async () => {
        const A = window.MachoteAlmacen;
        // 1. Todos los de `window.DEMO` vienen marcados en ORIGEN.
        const sinMarca = window.DEMO.MACHOTES.filter(m => !A.esDemo(m)).map(m => m.id);
        // 2. Y `empujar` los descarta aunque se le pasen a la cara.
        const antes = window.__guardadosAlServidor || 0;
        const res = await A.empujar(window.DEMO.MACHOTES.map(m => JSON.parse(JSON.stringify(m))));
        return { sinMarca: sinMarca, subidos: res.subidos,
                 llamadas: (window.__guardadosAlServidor || 0) - antes,
                 cuantos: window.DEMO.MACHOTES.length };
      });
      if (r.sinMarca.length) throw new Error('sin marcar en demo.js: ' + r.sinMarca.join(', '));
      if (r.subidos) throw new Error('subió ' + r.subidos + ' machote(s) de demo');
      if (r.llamadas) throw new Error('llamó ' + r.llamadas + ' vez/veces al servidor con la demo');
      console.log('    ' + r.cuantos + ' de demo marcados · 0 subidos · 0 llamadas al servidor');
    }
  });

  await paso('la demo no se cuenta como pendiente', async () => {
    /* Si se contara, el aviso diría «4 sin subir» para siempre y nada podría
     * bajar el número —los ejemplos no se suben, `empujarUno` los rechaza—:
     * un pendiente que no se puede resolver es peor que no avisar.
     *
     * Se prueba en los DOS sitios que cuentan pendientes: el que pregunta al
     * servidor y el que compara contra la libreta. Tener dos criterios de
     * «pendiente» es justo como se llega a un aviso que dice «1 sin subir» y
     * no logra señalar ninguno. */
    await ir('#/'); await p.waitForTimeout(400);
    const e = await p.evaluate(() => window.MachoteAlmacen.estadoServidor(window.DEMO.MACHOTES));
    if (e.total !== 0) throw new Error('cuenta ' + e.total + ' machote(s) que no son de nadie');
    if (!e.demos) throw new Error('no reporta cuántos ejemplos descontó');
    const n = await p.evaluate(() => window.MachoteAlmacen.pendientes(window.DEMO.MACHOTES));
    if (n !== 0) throw new Error('pendientes() cuenta ' + n + ' ejemplo(s)');
    if (await p.$('#avPend')) throw new Error('la lista avisa de pendientes con sólo la demo');
    console.log('    0 contados · ' + e.demos + ' ejemplos descontados · sin aviso en la lista');
  });

  /* ══ El encabezado y el desglose (V1.21) ════════════════════════════════ */

  await paso('el encabezado tiene salida y ya no se etiqueta de mentiras', async () => {
    await ir('#/');
    const r = await p.evaluate(() => {
      const b = document.getElementById('btnBack');
      return { href: b && b.getAttribute('href'),
               alto: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
               insignia: !!document.getElementById('tbB'),
               texto: document.querySelector('.topbar').textContent };
    });
    if (!r.href || r.href.charAt(0) === '#') throw new Error('la flecha no sale del módulo: ' + r.href);
    if (r.insignia) throw new Error('sigue la insignia DEMO en una pantalla que guarda de verdad');
    if (/DEMO/.test(r.texto)) throw new Error('el encabezado sigue diciendo DEMO');
    if (r.alto > 60) throw new Error('el encabezado mide ' + r.alto + ' px: no se compactó');
    console.log('    ' + r.alto + ' px · vuelve a ' + r.href + ' · sin insignia');
  });

  await paso('desglose: arranca a prorrata, se puede mover y la suma debe cuadrar', async () => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
    const q = await ctx.newPage();
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(900);
      const href = await q.$eval('[data-hist]', el => '#/m/' + el.getAttribute('data-hist'));
      await q.goto(BASE + href); await q.waitForTimeout(900);
      await q.click('#btnOrden'); await q.waitForTimeout(400);

      // Apagado por omisión: es la excepción, no la costumbre.
      if (await q.$eval('[data-desg="0"]', el => el.checked))
        throw new Error('el desglose viene prendido de fábrica');
      if (await q.$('.desg-p')) throw new Error('hay renglones desglosados sin haberlo pedido');

      await q.check('[data-desg="0"]'); await q.waitForTimeout(400);
      const n = await q.$$eval('.desg-p', e => e.length);
      if (n < 2) throw new Error('el desglose trajo ' + n + ' renglón(es)');

      // De arranque cuadra al centavo.
      const cuadre = () => q.evaluate(() => {
        const f = document.querySelector('.desg-cuadre');
        return { ok: f.className.indexOf('ok') >= 0, txt: f.textContent.replace(/\s+/g, ' ').trim() };
      });
      const c1 = await cuadre();
      if (!c1.ok) throw new Error('la prorrata no cuadra de arranque: ' + c1.txt);

      // Se puede mover a mano —la prorrata es el arranque, no el resultado—
      // y al descuadrar lo DICE y bloquea la orden.
      await q.fill('.desg-p', '1'); await q.waitForTimeout(400);
      const c2 = await cuadre();
      if (c2.ok) throw new Error('descuadrado y sigue diciendo que cuadra');
      if (!/No cuadra/i.test(c2.txt)) throw new Error('no lo dice: ' + c2.txt.slice(0, 90));
      const est = (await q.textContent('#or-estorbos')) || '';
      if (!/desglose de/i.test(est)) throw new Error('un desglose descuadrado no impide crear la orden');

      // Y el COSTO no sale ni así: es lo peor que podría colarse.
      const html = await q.innerHTML('.or-t');
      for (const p2 of ['costo_mo', 'costo_mat', 'costoMo', 'costoMat', '_peso'])
        if (html.indexOf(p2) >= 0) throw new Error('se coló el costo en la tabla del cliente: ' + p2);
      console.log('    ' + n + ' renglones · cuadra de arranque · descuadrar avisa y bloquea · sin costo');
    } finally { await ctx.close(); }
  });

  /* ── V1.22 → V1.24 · todos ven el trabajo del equipo, en sólo lectura ──
   *
   * El servidor decide el ALCANCE y eso se prueba contra la base, no aquí. Lo
   * que se prueba aquí es lo otro: que la pantalla trate el trabajo ajeno como
   * AJENO — que no lo meta en el almacén de uno, que no lo suba, y que no deje
   * teclearlo.
   *
   * V1.24: la sesión de estas pruebas ya NO trae `comercial:admin`. Era la
   * llave de la lectura en V1.22 y dejó de serlo: cualquiera del módulo ve lo
   * de todos. Quitarlo de aquí es lo que hace que estas pruebas sigan
   * significando algo — con el scope puesto no distinguirían el mundo nuevo
   * del viejo. */
  const paginaConAjenos = async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'esteban.delacruz',
          nombre: 'Jesus Esteban De La Cruz', empleado_id: 32,
          scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        localStorage.removeItem('fts_machote_v1');
        localStorage.removeItem('fts_machote_sync_v1');
      } catch (e) {}
      /* El documento se clona de la DEMO —que es un machote válido y completo—
       * y sólo se le cambia el nombre. Un machote inventado a mano aquí pinta
       * una hoja sin campos, y entonces la prueba de «está trabado» no probaría
       * nada: no habría nada que trabar. Se evalúa perezosamente porque
       * `window.DEMO` todavía no existe cuando corre este guion. */
      const doc = (nom) => {
        const base = (window.DEMO && window.DEMO.MACHOTES && window.DEMO.MACHOTES[0]) || null;
        const d = base ? JSON.parse(JSON.stringify(base))
                       : { estado: 'borrador', moneda: 'MXN', margenes: {}, secciones: [] };
        d.nombre = nom; d.estado = 'borrador';
        delete d._demo;          // llega del servidor: ya no es un ejemplo
        return d;
      };
      window.__guard = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/machotes-leer') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: 'esteban.delacruz', es_admin: true,
            total: 2, duenos: ['esteban.delacruz', 'ricardo.hernandez'],
            machotes: [
              { id: 'uuid-mio', id_local: 'M-MIO-1', documento: doc('Lo mio'),
                dueno: 'esteban.delacruz', dueno_nombre: 'Jesus Esteban De La Cruz',
                ajeno: false, version: 1, versiones: 1, estado: 'borrador',
                folio: 1, folio_txt: 'COT-0001' },
              { id: 'uuid-de-ricardo', id_local: 'M-1041', documento: doc('Lo de Ricardo'),
                dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Alan Hernandez',
                ajeno: true, version: 3, versiones: 3, estado: 'revision',
                folio: 7, folio_txt: 'COT-0007' }
            ] }) });
        }
        if (s.indexOf('/comercial/machote-guardar') >= 0) {
          var c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          window.__guard.push(c);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, machote_id: 'x', id_local: c.id_local, dueno: 'esteban.delacruz',
            version: 1, versiones: 1, autor: 'esteban.delacruz' }) });
        }
        if (s.indexOf('geo.json') >= 0) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(window.__GEO); } });
        if (s.indexOf('/comercial/clientes') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    });
    await q.goto(BASE); await q.waitForTimeout(1600);
    return q;
  };

  await paso('dirección ve el trabajo del equipo, marcado y sin poder tocarlo', async () => {
    const q = await paginaConAjenos();
    try {
      /* V1.25: al entrar YA se ve el trabajo del equipo, sin tocar el filtro.
       * Antes aquí se comprobaba lo contrario —que al entrar sólo salía lo
       * propio— y luego se daba el clic; hoy el clic sobra, así que lo que se
       * comprueba es que sale de entrada. */
      const alEntrar = await q.$$eval('tr.rw', f => f.map(x => x.textContent.indexOf('Lo de Ricardo') >= 0));
      if (!alEntrar.some(Boolean))
        throw new Error('al entrar NO enseñaba lo de otro: la lista no arrancó en todas');

      const r = await q.evaluate(() => {
        const filas = [...document.querySelectorAll('tr.rw')];
        const busca = (t) => filas.find(f => f.textContent.indexOf(t) >= 0);
        const mio = busca('Lo mio'), aj = busca('Lo de Ricardo');
        return {
          salen_los_dos: !!mio && !!aj,
          el_ajeno_se_marca: !!(aj && aj.querySelector('.pill.aj')),
          el_ajeno_no_se_borra: !!(aj && !aj.querySelector('[data-borrar]')),
          el_mio_si_se_borra: !!(mio && mio.querySelector('[data-borrar]')),
          /* V1.29 · y el candado dice que archivar es del DUEÑO, no que
           * «no se borra»: ya nada se borra. */
          por_que: aj ? ((aj.querySelector('.candado') || {}).getAttribute
                          ? aj.querySelector('.candado').getAttribute('title') : '') : '',
          dice_de_quien: !!(aj && /Ricardo/.test(aj.textContent)),
          /* LO IMPORTANTE: el trabajo de otro NO entra al almacén de uno. */
          en_el_almacen: (JSON.parse(localStorage.getItem('fts_machote_v1') || '{"machotes":[]}')
            .machotes || []).map(m => m.nombre)
        };
      });
      if (!r.salen_los_dos) throw new Error('no salieron los dos machotes');
      if (!r.el_ajeno_se_marca) throw new Error('el ajeno no se distingue del propio');
      if (!r.el_ajeno_no_se_borra) throw new Error('le dejó el botón de archivar al ajeno');
      if (!/due/i.test(r.por_que || ''))
        throw new Error('el candado del ajeno no dice que archivar es del dueño: ' + r.por_que);
      if (!r.el_mio_si_se_borra) throw new Error('se llevó de más: el propio ya no se borra');
      if (!r.dice_de_quien) throw new Error('no dice de quién es');
      if (r.en_el_almacen.indexOf('Lo de Ricardo') >= 0)
        throw new Error('GUARDÓ trabajo ajeno en fts_machote_v1: ' + JSON.stringify(r.en_el_almacen));
      if (r.en_el_almacen.indexOf('Lo mio') < 0)
        throw new Error('perdió lo propio: ' + JSON.stringify(r.en_el_almacen));
      console.log('    en el almacén sólo ' + JSON.stringify(r.en_el_almacen));
    } finally { await q.close(); }
  });

  await paso('el cuerpo NO decide de quién es nada: sólo el token', async () => {
    /* La prueba del ataque, re-apuntada para V1.24.
     *
     * En V1.22 el ataque interesante era «mandar `es_admin:true` en el cuerpo
     * para ver lo de todos». Ese ataque ya no tiene premio: todos ven todo. Lo
     * que SÍ sigue en pie —y es lo único que separa lo propio de lo ajeno— es
     * que el `actor` sale del token verificado. Si el cuerpo pudiera cambiarlo,
     * cualquiera se declararía dueño del machote de otro y la pantalla se lo
     * abriría para editar.
     *
     * Se prueba de este lado lo que se puede probar de este lado: que el
     * cliente NUNCA manda un actor, un dueño ni una bandera de alcance en el
     * cuerpo. Lo otro —que el servidor los ignoraría si llegaran— vive en el
     * `Code - Verificar token` del webhook y se comprueba contra la base. */
    const q = await paginaConAjenos();
    try {
      const cuerpos = await q.evaluate(async () => {
        const vistos = [];
        const orig = window.fetch;
        window.fetch = function (u, o) {
          if (String(u).indexOf('/comercial/') >= 0) {
            try { vistos.push({ url: String(u), cuerpo: JSON.parse((o && o.body) || '{}') }); }
            catch (e) { vistos.push({ url: String(u), cuerpo: 'ILEGIBLE' }); }
          }
          return orig.apply(this, arguments);
        };
        await window.MachoteAlmacen.bajar();
        await window.MachoteAlmacen.historial('uuid-de-ricardo');
        return vistos;
      });
      if (!cuerpos.length) throw new Error('no se observó ninguna llamada');
      const prohibidos = ['actor', 'dueno', 'es_admin', 'scopes', 'admin', 'usuario'];
      for (const c of cuerpos) {
        if (c.cuerpo === 'ILEGIBLE') throw new Error('cuerpo ilegible en ' + c.url);
        const colados = Object.keys(c.cuerpo).filter(k => prohibidos.indexOf(k) >= 0);
        if (colados.length)
          throw new Error('el cliente manda en el cuerpo ' + JSON.stringify(colados) +
                          ' a ' + c.url + ' — eso lo decide el token');
        if (!('token' in c.cuerpo))
          throw new Error('llamada sin token a ' + c.url + ': ' + JSON.stringify(Object.keys(c.cuerpo)));
      }
      console.log('    ' + cuerpos.length + ' llamada(s) · todas con token · ninguna con ' +
                  prohibidos.join('/'));
    } finally { await q.close(); }
  });

  await paso('el machote ajeno se abre TRABADO y nunca se sube', async () => {
    const q = await paginaConAjenos();
    try {
      await q.evaluate(() => { location.hash = '#/m/uuid-de-ricardo'; });
      await q.waitForTimeout(500);
      const r = await q.evaluate(() => {
        const campos = [...document.querySelectorAll('#hoja input, #hoja select, #hoja textarea')];
        return {
          avisa: !!document.querySelector('.aviso-ajeno'),
          campos: campos.length,
          sueltos: campos.filter(c => !c.disabled).length,
          /* La barra fija vive FUERA de `#hoja`: se comprueba aparte porque el
           * trabado de la hoja no la alcanza. */
          pasar_a_orden: !!document.querySelector('#btnOrden'),
          revisar: !!document.querySelector('.fija a[href^="#/rev/"]')
        };
      });
      if (!r.avisa) throw new Error('no avisa que es de otra persona');
      if (r.pasar_a_orden)
        throw new Error('deja «Pasar a orden» sobre trabajo ajeno');
      if (!r.revisar)
        throw new Error('quitó «Revisar», que es justo para lo que se abre uno ajeno');
      if (!r.campos) throw new Error('no pintó la hoja: la prueba no probaría nada');
      if (r.sueltos) throw new Error(r.sueltos + ' de ' + r.campos + ' campos siguen editables');

      // Y aunque se fuerce el empujón, no viaja.
      const g = await q.evaluate(async () => {
        const A = window.MachoteAlmacen;
        const aj = { id: 'uuid-de-ricardo', nombre: 'Lo de Ricardo', _ajeno: true,
                     secciones: [], margenes: {} };
        const r1 = await A.empujar([aj]);
        const r2 = await A.empujarUno(aj, { token: 't' }, null).catch(e => ({ error: 'lanzó' }));
        return { subidos: r1 && r1.subidos, uno: r2 && r2.error,
                 llamadas: (window.__guard || []).length };
      });
      if (g.llamadas) throw new Error('llamó al servidor ' + g.llamadas + ' vez(ces) con lo ajeno');
      if (g.uno !== 'ES_AJENO') throw new Error('empujarUno no lo rechazó: ' + g.uno);
      console.log('    hoja trabada · ' + r.campos + ' campos · 0 llamadas al servidor · ' + g.uno);
    } finally { await q.close(); }
  });

  await paso('el sincronizador de configuración NO se lleva lo del machote', async () => {
    /* La fuga que esto cierra: `shared/ops-config.json` está COMMITEADO en un
     * repo público, y hasta hoy el sincronizador barría toda llave `fts_*`.
     * La captura comercial de tres personas se iba en la siguiente subida. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    try {
      /* Se carga el archivo REAL —no una copia— en una página en blanco y se
       * ejerce su API. Si alguien cambia la lista, esto lo caza. */
      await q.goto(BASE);
      await q.addScriptTag({ path: path.resolve(__dirname, '..', '..', '..', 'shared', 'config-sync.js') });
      const r = await q.evaluate(() => {
        const sensibles = ['fts_machote_v1', 'fts_machote_sync_v1', 'fts_suite_session',
          'fts_fin_session', 'fts_mi_perfil_session', 'fts_comercial_hmac', 'fts_employees',
          'fts_session', 'ops_sync_password', 'ops_kiosk_master_pin', 'ops_kiosk_field_pin'];
        sensibles.forEach(k => localStorage.setItem(k, 'SECRETO-' + k));
        localStorage.setItem('ops_n8n_url', 'https://n8n.example');
        localStorage.setItem('key_claude', 'sk-de-mentiras');
        const cfg = window.ConfigSync.collectOpsKeys();
        return { llaves: Object.keys(cfg).sort(),
                 coladas: sensibles.filter(k => k in cfg),
                 trae_config: ('ops_n8n_url' in cfg) && ('key_claude' in cfg),
                 fuera: window.ConfigSync.sinSincronizar() };
      });
      if (r.coladas.length)
        throw new Error('se colaron al repo público: ' + r.coladas.join(', '));
      if (!r.trae_config)
        throw new Error('se llevó de más: dejó de sincronizar la configuración real');
      if (r.fuera.indexOf('fts_machote_v1') < 0)
        throw new Error('no reporta que el machote se queda fuera');
      console.log('    sincroniza ' + r.llaves.length + ' · deja fuera ' + r.fuera.length +
                  ' (incluido fts_machote_v1)');
    } finally { await q.close(); }
  });

  /* ── V1.23 ────────────────────────────────────────────────────────────────
   * Un montaje donde el servidor SÍ tiene el machote. Es la situación real de
   * Esteban: los ejemplos se habían subido antes de que V1.21 los marcara en
   * origen, así que para el servidor eran machotes normales. */
  const paginaConServidor = async (filas, opciones) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await sembrarGeo(q);
await sembrarMachotes(q);
    await q.addInitScript((cfg) => {
      const f = cfg.filas;
      window.__opciones = cfg.opciones || {};
      /* Quién está sentado frente a la pantalla. Por omisión Esteban, que es
       * lo que asumían las pruebas de V1.23/V1.24; el préstamo obliga a poder
       * ser OTRO —el prestatario, o un extraño— porque casi todo lo que hay
       * que probar de él sólo se ve desde ese lado. */
      const YO = (cfg.opciones && cfg.opciones.actor) || 'esteban.delacruz';
      const NOMBRE = (cfg.opciones && cfg.opciones.nombre) || 'Jesus Esteban De La Cruz';
      window.__llamadas = { guardar: [], prestar: [] };
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: YO,
          nombre: NOMBRE, empleado_id: 32,
          /* SIN `comercial:admin` a propósito: desde V1.24 la lectura de lo
           * ajeno no depende de ese scope. Si alguien lo vuelve a exigir en el
           * servidor, estas pruebas se caen — que es lo que se quiere. */
          scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        localStorage.removeItem('fts_machote_v1');
        localStorage.removeItem('fts_machote_sync_v1');
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        /* V1.29 · archivar ESCRIBE AL SERVIDOR. Sin esta rama la llamada se va
         * al `fetch` de verdad, no contesta nadie, y la prueba falla por el
         * MONTAJE y no por el producto. Ojo: aqui el body va en
         * `arguments[1]`, porque esta funcion sólo declara `u`. */
        if (s.indexOf('/comercial/machote-archivar') >= 0) {
          let ar = {};
          try { ar = JSON.parse((arguments[1] && arguments[1].body) || '{}'); } catch (e) {}
          window.__archivados = (window.__archivados || []);
          window.__archivados.push({ accion: ar.accion, machote_id: ar.machote_id });
          return Promise.resolve({ ok: true, json: function () {
            return Promise.resolve({ ok: true, hecho: true, accion: ar.accion,
              folio_txt: 'COT-0003', versiones: 1,
              mensaje: 'Archivada. No se borro nada.' }); } });
        }
        if (s.indexOf('/comercial/machotes-leer') >= 0) {
          const doc = (nom) => {
            const base = (window.DEMO && window.DEMO.MACHOTES && window.DEMO.MACHOTES[0]) || null;
            const d = base ? JSON.parse(JSON.stringify(base)) : { estado: 'borrador', secciones: [] };
            d.nombre = nom; d.estado = 'borrador'; delete d._demo;
            return d;
          };
          /* Modo HISTORIAL. Se sirve aquí porque V1.24 lo necesita para probar
           * los tres casos, y porque el número de versiones tiene que poder
           * ser CERO: «el servidor contestó bien y no trajo ninguna» es
           * exactamente el caso que antes se confundía con «no ha subido». */
          let cuerpo = {};
          try { cuerpo = JSON.parse((arguments[1] && arguments[1].body) || '{}'); } catch (e) {}
          if (cuerpo.machote_id) {
            const n = (window.__opciones && typeof window.__opciones.versiones === 'number')
              ? window.__opciones.versiones : 1;
            const f0 = f.find(x => x.id === cuerpo.machote_id) || {};
            const vs = [];
            /* `dueno` va en CADA versión porque así lo manda el endpoint real
             * (la consulta del historial selecciona `m.dueno`), y es lo que
             * deja comparar contra `autor` para marcar las que escribió
             * alguien más. `opciones.autores` permite que no todas sean del
             * dueño, que es justo el caso del préstamo. */
            const dueno0 = f0.dueno || 'esteban.delacruz';
            const otros = (window.__opciones && window.__opciones.autores) || {};
            for (let i = n; i >= 1; i--) {
              const a = otros[i] || null;
              vs.push({
                id: f0.id, version: i, dueno: dueno0,
                autor: a ? a.actor : dueno0,
                autor_nombre: a ? a.nombre
                                : (f0.dueno_nombre || 'Jesus Esteban De La Cruz'),
                guardada_at: new Date(Date.now() - i * 3600e3).toISOString(),
                estado: 'borrador',
                motivo: a ? ('editado con permiso de ' + (f0.dueno_nombre || dueno0))
                          : 'guardado automatico',
                documento: doc(f0.nombre || 'x') });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({
              ok: true, modo: 'historial', actor: YO, es_admin: false,
              machote_id: cuerpo.machote_id, versiones: vs, total: vs.length }) });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: YO, es_admin: false,
            total: f.length,
            duenos: f.map(x => x.dueno || 'esteban.delacruz')
                     .filter((d, i, a) => a.indexOf(d) === i),
            machotes: f.map(x => Object.assign({
              dueno: 'esteban.delacruz', dueno_nombre: 'Jesus Esteban De La Cruz',
              ajeno: false, version: 1, versiones: 1, estado: 'borrador',
              documento: doc(x.nombre)
            }, x)) }) });
        }
        /* GUARDAR y PRESTAR. Por omisión se quedan colgados —es lo que hacían
         * antes, y las pruebas viejas cuentan con ello— pero el montaje puede
         * darles una respuesta. Se apunta CADA llamada con su cuerpo: en el
         * préstamo, la mitad de lo que hay que probar es CON QUÉ IDENTIDAD se
         * guarda (el `id_local` del DUEÑO, no el de quien teclea), y eso no se
         * ve en la pantalla: sólo en lo que sale por el cable. */
        if (s.indexOf('/comercial/machote-guardar') >= 0) {
          let c = {}; try { c = JSON.parse((arguments[1] && arguments[1].body) || '{}'); } catch (e) {}
          window.__llamadas.guardar.push(c);
          const rg = window.__opciones.guardar;
          if (!rg) return new Promise(function () {});
          return Promise.resolve({ ok: true, json: () => Promise.resolve(rg) });
        }
        if (s.indexOf('/comercial/machote-prestar') >= 0) {
          let c = {}; try { c = JSON.parse((arguments[1] && arguments[1].body) || '{}'); } catch (e) {}
          window.__llamadas.prestar.push(c);
          const rp = window.__opciones.prestar || { ok: true };
          /* El servidor de mentiras APUNTA el préstamo, para que la siguiente
           * bajada lo traiga. Sin esto, «prestar» sólo probaría que sale la
           * llamada; con esto se prueba lo que le importa al dueño: que al
           * volver de prestar, su pantalla dice que la cotización está
           * prestada y le ofrece recogerla. */
          if (rp.ok === true) {
            const fila = f.find(x => x.id === c.machote_id);
            if (fila) {
              fila.prestamos = (fila.prestamos || []).filter(x => x.para !== c.para);
              /* SIN `para_nombre`: la consulta real (`machotes-leer`) no lo
               * manda, porque la 005 no guarda nombres. Inventarlo aquí
               * habría hecho pasar una prueba que en producción falla. */
              if (c.accion === 'prestar') fila.prestamos.push({
                para: c.para, otorgado_por: YO,
                vence_at: new Date(Date.now() + (Number(c.horas) || 4) * 3600e3).toISOString() });
            }
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve(rp) });
        }
        if (s.indexOf('geo.json') >= 0) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(window.__GEO); } });
        if (s.indexOf('/comercial/clientes') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { filas: filas, opciones: opciones || {} });
    await q.goto(BASE); await q.waitForTimeout(1600);
    return q;
  };

  await paso('un ejemplo borrado NO vuelve al recargar', async () => {
    /* El defecto que reportó Esteban, y su causa real: `bajar()` veía una fila
     * del servidor cuyo `id_local` ya no estaba en la lista local, no podía
     * distinguir «nunca llegó» de «se borró aquí», y la volvía a meter. No era
     * de los ejemplos: le pasaba a CUALQUIER machote ya subido. Los ejemplos
     * se notaron porque son los que todo el mundo borra el primer día. */
    const q = await paginaConServidor([
      { id: 'uuid-1041', id_local: 'M-1041', nombre: 'Ejemplo que estorba', folio: 3, folio_txt: 'COT-0003' },
      { id: 'uuid-otro', id_local: 'M-OTRO', nombre: 'Uno que se queda', folio: 4, folio_txt: 'COT-0004' }
    ]);
    try {
      const hay = async () => q.$$eval('tr.rw', f => f.map(x => x.textContent));
      const antes = await hay();
      if (!antes.some(t => t.indexOf('Ejemplo que estorba') >= 0))
        throw new Error('el montaje no sirve: el ejemplo no llegó a pintarse');

      /* ⚠️ V1.29 · LA PREMISA CAMBIO, y es el arreglo de esta version.
       *
       * Esta prueba nacio para vigilar la LAPIDA: como borrar no le decia
       * nada al servidor, la siguiente bajada volvia a meter la fila y al
       * recargar reaparecia. La lapida tapaba ese agujero POR NAVEGADOR.
       *
       * Ahora archivar ESCRIBE AL SERVIDOR y el servidor deja de servirlo, asi
       * que la lapida sobra — y ademas estorbaba: sepultar el `id_local` haria
       * que un desarchivado no pudiera volver a verse aqui nunca. Lo que se
       * exige ahora es lo que de verdad importaba: que SALGA la llamada, y que
       * al recargar no vuelva PORQUE EL SERVIDOR YA NO LO MANDA. */
      await q.evaluate(() => { window.__archivados = []; });
      q.once('dialog', d => d.accept());
      await q.click('tr.rw:has-text("Ejemplo que estorba") [data-borrar]');
      await q.waitForTimeout(700);
      if ((await hay()).some(t => t.indexOf('Ejemplo que estorba') >= 0))
        throw new Error('no salió de la lista ni siquiera en pantalla');

      const llamadas = await q.evaluate(() => window.__archivados || []);
      if (!llamadas.length || llamadas[0].accion !== 'archivar')
        throw new Error('no le dijo al servidor que lo archivara: ' + JSON.stringify(llamadas));

      /* El servidor de esta pagina SIGUE sirviendolo (el montaje no cambia),
       * asi que al recargar vuelve. Eso NO es un fallo: es la mitad del
       * servidor sin publicar, y la prueba lo deja dicho en vez de tapar el
       * hueco con una lapida que despues no se puede quitar. */
      await q.reload(); await q.waitForTimeout(1800);
      const despues = await hay();
      const volvio = despues.some(t => t.indexOf('Ejemplo que estorba') >= 0);
      if (!despues.some(t => t.indexOf('Uno que se queda') >= 0))
        throw new Error('se llevó de más: desapareció el que NO se archivó');

      const lapida = await q.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('fts_machote_borrados_v1') || '{}'); }
        catch (e) { return {}; }
      });
      if (Object.keys(lapida).length)
        throw new Error('volvió a sepultar el id_local: ' + Object.keys(lapida).join(', '));
      console.log('    archivado en el servidor · sin lápida · al recargar ' +
                  (volvio ? 'vuelve, porque este montaje lo sigue sirviendo' : 'no vuelve'));
    } finally { await q.close(); }
  });

  /* ── V1.24 · A · el historial de un machote que SÍ está en el servidor ──
   *
   * El defecto que esto cierra, con nombre y apellido: Esteban abrió el reloj
   * de «Lifter leveling - VIP Service» —de Ricardo, quince versiones en la
   * base— y el panel contestó que el machote todavía no llegaba al servidor.
   *
   * La causa no estaba en el historial sino en la TRADUCCIÓN del id: un
   * machote ajeno se nombra en pantalla con el uuid del servidor (a propósito,
   * porque dos personas pueden tener el mismo `M-1041`), y la traducción lo
   * buscaba en la libreta de sincronización, que está indexada por `id_local`
   * y sólo guarda lo propio. No lo hallaba, y «no lo hallé» salía como «no
   * está subido» — que es el mismo modo de falla que la sesión muerta
   * (CLAUDE.md §20 #12b): causas distintas con remedios distintos, dichas con
   * una sola frase, y la frase elegida invita a la acción equivocada. */
  await paso('el historial de un AJENO que sí subió abre y lista sus versiones', async () => {
    const q = await paginaConServidor([
      { id: '6948c433-0000-4000-8000-000000000003', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling - VIP Service', folio: 3, folio_txt: 'COT-0003',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 15, versiones: 15 }
    ], { versiones: 15 });
    try {
      /* El filtro de persona arranca en «Míos» —diseño de V1.21, lo tuyo
       * primero— así que un ajeno no está en pantalla hasta quitarlo. Es lo
       * mismo que hace Esteban antes de ver el trabajo del equipo. */
      await q.selectOption('#fPersona', '');
      await q.waitForTimeout(400);
      /* `:visible` porque hay DOS con ese `data-hist` —el renglón de la tabla
       * y la tarjeta del teléfono— y sólo uno se pinta según el ancho. */
      await q.locator('[data-hist="6948c433-0000-4000-8000-000000000003"]:visible')
             .first().click();
      await q.waitForTimeout(700);
      const t = (await q.textContent('body')).replace(/\s+/g, ' ');
      if (/todav[ií]a no llega al servidor/.test(t))
        throw new Error('sigue diciendo que no ha subido algo que SÍ está en el servidor');
      const vs = await q.$$eval('.v', e => e.length);
      if (vs !== 15) throw new Error('listó ' + vs + ' versión(es) de 15');
      if (!/Versión 15/.test(t)) throw new Error('no pinta la última versión');
      console.log('    abre y lista las 15 versiones del machote de otra persona');
    } finally { await q.close(); }
  });

  await paso('los tres casos del historial se dicen distinto', async () => {
    /* Sin subir, subido y consultable, y subido pero no consultable ahora.
     * Antes los tres decían lo mismo. Se prueba en el ALMACÉN y no en la
     * pantalla porque es ahí donde se decide cuál es cuál. */
    const q = await paginaConServidor([
      { id: 'aaaaaaaa-0000-4000-8000-00000000000a', id_local: 'M-SUBIDO',
        nombre: 'Ya subió', folio: 9, folio_txt: 'COT-0009' }
    ], { versiones: 0 });
    try {
      const r = await q.evaluate(async () => {
        const A = window.MachoteAlmacen;
        const sinSubir = await A.historial('M-QUE-NUNCA-SUBIO');
        const noConsultable = await A.historial('aaaaaaaa-0000-4000-8000-00000000000a');
        return { sinSubir: sinSubir.error, msgSin: sinSubir.mensaje,
                 noCons: noConsultable.error, msgNo: noConsultable.mensaje };
      });
      if (r.sinSubir !== 'NUNCA_SUBIDO')
        throw new Error('el que nunca subió da: ' + r.sinSubir);
      if (r.noCons !== 'NO_CONSULTABLE')
        throw new Error('el que sí subió pero no se pudo traer da: ' + r.noCons);
      if (r.msgSin === r.msgNo)
        throw new Error('los dos casos dicen exactamente lo mismo: ' + r.msgSin);
      if (/no llega al servidor/.test(r.msgNo))
        throw new Error('al no consultable le dice que no ha subido: ' + r.msgNo);
      console.log('    NUNCA_SUBIDO ≠ NO_CONSULTABLE, y cada uno lo dice con sus palabras');
    } finally { await q.close(); }
  });

  await paso('el folio se ve, se copia, y sin folio se dice', async () => {
    const q = await paginaConServidor([
      { id: 'uuid-con', id_local: 'M-CON', nombre: 'Con folio', folio: 42, folio_txt: 'COT-0042' }
    ]);
    try {
      const lista = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (lista.indexOf('COT-0042') < 0)
        throw new Error('el folio no salió en la lista: ' + lista.slice(0, 200));

      /* V1.24 · COLUMNA PROPIA, no escondido dentro del renglón del nombre.
       * Se comprueba que la primera columna es la del folio y que la celda
       * trae SÓLO el folio: metido junto al cliente no se puede recorrer con
       * la vista, que es toda la razón de que la columna exista. */
      const col = await q.evaluate(() => {
        const th = [].map.call(document.querySelectorAll('table.lista thead th'),
                               e => e.textContent.trim());
        const td = document.querySelector('table.lista tbody tr.rw td');
        return { encabezados: th, primera: td && td.className,
                 texto: td && td.textContent.trim() };
      });
      if (col.encabezados[0] !== 'Folio')
        throw new Error('la primera columna no es el folio: ' + JSON.stringify(col.encabezados));
      if (col.texto !== 'COT-0042')
        throw new Error('la celda del folio trae otra cosa: «' + col.texto + '»');
      if (col.encabezados.indexOf('Revisión') >= 0)
        throw new Error('sigue la columna de revisión, que se fue con la sección de orden');

      // Y se copia de un toque DESDE LA LISTA, no sólo desde el encabezado.
      const enLista = await q.$('table.lista tbody tr.rw td.folio-td [data-copiar]');
      if (!enLista) throw new Error('el folio de la lista no se puede copiar');

      // Se busca por folio, que es lo que la gente va a teclear.
      await q.fill('#q', 'COT-0042'); await q.waitForTimeout(400);
      if ((await q.$$('tr.rw')).length !== 1)
        throw new Error('buscar por folio no encontró la cotización');
      await q.fill('#q', '42'); await q.waitForTimeout(400);
      if ((await q.$$('tr.rw')).length !== 1)
        throw new Error('buscar por el número suelto no encontró la cotización');
      await q.fill('#q', ''); await q.waitForTimeout(300);

      // Abierto: el folio arriba, en un botón que se puede copiar.
      await q.click('tr.rw:has-text("Con folio") a');
      await q.waitForTimeout(700);
      const btn = await q.$('.cab-folio [data-copiar]');
      if (!btn) throw new Error('no hay botón de copiar el folio en el encabezado');
      if ((await btn.textContent()).trim() !== 'COT-0042')
        throw new Error('el botón no dice el folio');
      const alto = await btn.evaluate(e => e.getBoundingClientRect().height);
      if (alto < 30) throw new Error('el botón de copiar mide ' + alto + 'px: no se pica con el dedo');

      /* Y el caso que la tensión del diseño obliga a resolver: un machote que
       * TODAVÍA no ha subido no tiene folio, y la pantalla tiene que decirlo
       * en vez de inventar uno. */
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/nuevo'; });
      await q.waitForTimeout(400);
      await q.fill('#n-nombre', 'Recien capturada');
      await q.click('#n-crear');
      await q.waitForTimeout(900);
      const cab = await q.textContent('.cab-folio');
      if (cab.indexOf('sin folio') < 0)
        throw new Error('un machote sin subir no dice «sin folio», dice: ' + cab.trim().slice(0, 80));
      if (await q.$('.cab-folio [data-copiar]'))
        throw new Error('ofrece copiar un folio que no existe');
      console.log('    COT-0042 en lista, buscable, copiable · sin subir dice «sin folio»');
    } finally { await q.close(); }
  });

  /* ══ V1.25 · EL PRÉSTAMO TEMPORAL ═══════════════════════════════════════
   *
   * Qué se prueba aquí y por qué en el navegador: el préstamo tiene DOS
   * mitades, y la de la base ya se ejerció contra Postgres real (dos
   * escritores sobre la misma versión, uno pasa y el otro se va con
   * CONFLICTO_DE_VERSION). Lo que falta —y sólo se ve aquí— es la mitad de
   * quien está sentado frente a la pantalla: que el prestatario pueda
   * escribir, que guarde CON LA IDENTIDAD DEL DUEÑO, que un rechazo le diga
   * cuál de las tres causas fue, y sobre todo que NUNCA le cueste lo que
   * tecleó. Esa última es la promesa que sostiene todo lo demás.
   *
   * El montaje puede sentar a cualquiera frente a la pantalla (`opciones.actor`),
   * que es indispensable: casi nada del préstamo se ve desde el lado del dueño. */

  /** El primer campo de texto de la hoja que de verdad se puede escribir.
   *  Que exista YA ES media prueba: sobre lo ajeno sin permiso están todos
   *  deshabilitados por `trabarSiNoPuedoEscribir`. */
  const celdaEscribible = async (q) => {
    const sel = '#hoja input.cel:not([disabled]):not([type="number"])';
    const el = await q.$(sel);
    return el;
  };

  await paso('C · con todo a la vista, el encabezado y el respaldo siguen diciendo qué es TUYO', async () => {
    /* La tensión que abre la decisión 1: si lo primero que se ve es el trabajo
     * de todos, «3 cotizaciones» al lado de «respaldo de lo mío (1)» se lee
     * como un error de la aplicación — a menos que la pantalla diga cuántas
     * son tuyas. Y el respaldo NO puede llevarse lo ajeno: sacaría el trabajo
     * de otro de donde su dueño lo gobierna. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000cc01', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011' },
      { id: '7000c433-0000-4000-8000-00000000cc02', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true },
      { id: '7000c433-0000-4000-8000-00000000cc03', id_local: 'M-DE-PABLO',
        nombre: 'Tanque de servicio', folio: 13, folio_txt: 'COT-0013',
        dueno: 'pablo.bayly', dueno_nombre: 'Pablo Bayly', ajeno: true }
    ]);
    try {
      if ((await q.$eval('#fPersona', el => el.value)) !== '')
        throw new Error('no arrancó en «Todas las personas»');
      const filas = await q.$$eval('tr.rw', e => e.length);
      if (filas !== 3) throw new Error('no salieron las tres de entrada: ' + filas);

      const cuenta = (await q.textContent('.enc .cuenta')).replace(/\s+/g, ' ').trim();
      if (!/3 cotizaciones/.test(cuenta)) throw new Error('el encabezado no cuenta todo: ' + cuenta);
      if (!/1 tuya\b/.test(cuenta))
        throw new Error('el encabezado no dice cuántas son tuyas: ' + cuenta);

      const resp = (await q.textContent('.pie-resp')).replace(/\s+/g, ' ');
      if (!/respaldo de lo m[ií]o \(1\)/i.test(resp))
        throw new Error('el respaldo no cuenta sólo lo tuyo: ' + resp);

      const enAlmacen = await q.evaluate(() => {
        try { return (JSON.parse(localStorage.getItem('fts_machote_v1') || '{"machotes":[]}')
                        .machotes || []).map(m => m.nombre); } catch (e) { return ['ERROR']; }
      });
      if (enAlmacen.some(n => /Lifter|Tanque/.test(n)))
        throw new Error('el trabajo ajeno entró al almacén propio: ' + JSON.stringify(enAlmacen));
      console.log('    «' + cuenta + '» · respaldo de 1 · el almacén sólo trae ' +
                  JSON.stringify(enAlmacen));
    } finally { await q.close(); }
  });

  await paso('B · el historial DICE quién escribió cada versión, y marca las que no son del dueño', async () => {
    /* El caso de las comisiones, que es la razón por la que existe el
     * histórico: si alguien con permiso prestado mueve el reparto, la versión
     * queda con SU nombre. En la base eso ya era verdad desde el primer día
     * —`machote_version.autor` sale del token verificado, nunca del cuerpo—;
     * lo que faltaba era poder VERLO sin conocer de memoria de quién es cada
     * cotización. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000hi01', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011',
        version: 4, versiones: 4 }
    ], { versiones: 4,
         autores: { 3: { actor: 'ricardo.hernandez', nombre: 'Ricardo Hernández' } } });
    try {
      /* Es un machote PROPIO, así que su id de pantalla es el `id_local`, no
       * el uuid — la traducción a uuid la hace `idServidor()` al pedir el
       * historial (V1.24). */
      await q.locator('[data-hist="M-MIO"]:visible').first().click();
      await q.waitForTimeout(800);

      const vs = await q.$$eval('.v', e => e.map(x => ({
        txt: x.textContent.replace(/\s+/g, ' '), ajena: x.classList.contains('ajena') })));
      if (vs.length !== 4) throw new Error('listó ' + vs.length + ' versiones de 4');

      const deOtro = vs.filter(v => v.ajena);
      if (deOtro.length !== 1)
        throw new Error('marcó ' + deOtro.length + ' versiones como de otro, debía ser 1');
      if (deOtro[0].txt.indexOf('Ricardo Hernández') < 0)
        throw new Error('la marcada no dice quién la escribió: ' + deOtro[0].txt);
      if (deOtro[0].txt.indexOf('no es el dueño') < 0)
        throw new Error('no lo dice CON PALABRAS, sólo con color: ' + deOtro[0].txt);
      if (deOtro[0].txt.indexOf('Versión 3') < 0)
        throw new Error('marcó la versión equivocada: ' + deOtro[0].txt);

      /* Y las del dueño NO se marcan: si se marcaran todas, la marca no
       * distinguiría nada. */
      const propias = vs.filter(v => !v.ajena);
      if (propias.some(v => v.txt.indexOf('no es el dueño') >= 0))
        throw new Error('marcó como ajena una versión del propio dueño');
      if (!propias.every(v => v.txt.indexOf('Jesus Esteban De La Cruz') >= 0))
        throw new Error('las del dueño no dicen su nombre');
      console.log('    4 versiones · la 3 marcada «no es el dueño» (Ricardo) · las otras 3 limpias');
    } finally { await q.close(); }
  });

  await paso('B · prestar: sale la orden al servidor y el dueño ve que está prestada', async () => {
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000ma01', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011' },
      { id: '7000c433-0000-4000-8000-00000000ri01', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true }
    ], { prestar: { ok: true } });
    try {
      await q.click('tr.rw:has-text("Bombas para Clarios") a');
      await q.waitForTimeout(800);

      if (!(await q.$('#btnPrestar')))
        throw new Error('no hay botón de prestar sobre una cotización propia ya subida');
      await q.click('#btnPrestar');
      await q.waitForTimeout(400);
      if (!(await q.$('#prestaModal'))) throw new Error('no abrió el modal de prestar');

      /* A quién se puede prestar sale de los DATOS —quien ya tiene machotes en
       * el servidor— no de una lista escrita a mano. */
      const opciones = await q.$$eval('#pm-para option', e => e.map(x => x.value));
      if (opciones.indexOf('ricardo.hernandez') < 0)
        throw new Error('Ricardo no aparece en la lista: ' + JSON.stringify(opciones));
      if (opciones.indexOf('esteban.delacruz') >= 0)
        throw new Error('se ofrece prestarse la cotización a uno mismo');

      await q.selectOption('#pm-para', 'ricardo.hernandez');
      await q.selectOption('#pm-horas', '4');
      await q.click('#pm-ok');
      await q.waitForTimeout(1400);

      const ll = await q.evaluate(() => window.__llamadas.prestar);
      if (ll.length !== 1) throw new Error('llamadas al endpoint de préstamo: ' + ll.length);
      const c = ll[0];
      if (c.accion !== 'prestar') throw new Error('acción: ' + c.accion);
      if (c.machote_id !== '7000c433-0000-4000-8000-00000000ma01')
        throw new Error('presta OTRO machote: ' + c.machote_id);
      if (c.para !== 'ricardo.hernandez') throw new Error('se lo presta a: ' + c.para);
      if (Number(c.horas) !== 4) throw new Error('horas: ' + c.horas);
      /* Ni el dueño ni el otorgante viajan en el cuerpo: los pone el servidor
       * desde el token. Si algún día viajaran, cualquiera podría prestar lo
       * ajeno diciendo que es suyo. */
      if (c.dueno || c.otorgado_por || c.actor)
        throw new Error('el cuerpo lleva identidad que debe salir del token: ' + JSON.stringify(c));

      if (await q.$('#prestaModal')) throw new Error('el modal no se cerró tras prestar');

      // Y la cortesía: el dueño ve que está prestada, y con qué recogerla.
      const fr = await q.textContent('.presta-fr');
      if (!/Prestada/.test(fr)) throw new Error('la franja del dueño no dice que está prestada: ' + fr);
      if (fr.indexOf('Ricardo') < 0) throw new Error('no dice a quién: ' + fr);
      if (!(await q.$('[data-recoger="ricardo.hernandez"]')))
        throw new Error('no hay botón de recoger el permiso');
      console.log('    prestada 4 h a Ricardo · el dueño la ve prestada y puede recogerla');
    } finally { await q.close(); }
  });

  await paso('B · si el endpoint todavía no está publicado, lo DICE en vez de culpar a la cotización', async () => {
    /* El hueco real del despliegue: el frontend se mergea y el workflow se
     * publica después, con un clic humano que puede tardar. En medio, el botón
     * de prestar existe y el endpoint contesta el 404 PROPIO de n8n —un JSON
     * con `code`/`message` y sin `ok`— que caía en el «no se pudo» genérico.
     * Quien lo leyera concluiría que su cotización tiene algo malo. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000ap01', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011' },
      { id: '7000c433-0000-4000-8000-00000000ap02', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true }
    ], { prestar: { code: 404,
                    message: 'The requested webhook "POST comercial/machote-prestar" is not registered.' } });
    try {
      await q.click('tr.rw:has-text("Bombas para Clarios") a');
      await q.waitForTimeout(800);
      await q.click('#btnPrestar');
      await q.waitForTimeout(400);
      await q.selectOption('#pm-para', 'ricardo.hernandez');
      await q.click('#pm-ok');
      await q.waitForTimeout(1200);
      const t = (await q.textContent('#pm-err')).replace(/\s+/g, ' ');
      if (!/todav[ií]a no est[áa] encendida/i.test(t))
        throw new Error('no dice que falta publicar el endpoint: ' + t);
      if (!/No es un problema de tu cotizaci[oó]n/i.test(t))
        throw new Error('no descarta lo que la persona va a suponer: ' + t);
      if (await q.$('#prestaModal') === null)
        throw new Error('cerró el modal como si hubiera prestado');
      console.log('    404 de webhook sin publicar → «falta publicar», no «no se pudo»');
    } finally { await q.close(); }
  });

  await paso('B · prestar y guardar: el prestatario escribe, y guarda con la identidad del DUEÑO', async () => {
    /* Lo que de verdad se comprueba aquí no está en la pantalla sino en lo que
     * sale por el cable: `id_local` es el del DUEÑO —si fuera el de quien
     * teclea, el servidor crearía un machote NUEVO a su nombre en vez de una
     * versión del de Ricardo— y `version_leida` es la del servidor, que es lo
     * que permite detectar el choque de dos escritores. */
    const vence = new Date(Date.now() + 4 * 3600e3).toISOString();
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000ri02', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 7, versiones: 7,
        prestamos: [{ para: 'esteban.delacruz', para_nombre: 'Jesus Esteban De La Cruz',
                      otorgado_por: 'ricardo.hernandez', vence_at: vence }] }
    ], { guardar: { ok: true, version: 8, machote_id: '7000c433-0000-4000-8000-00000000ri02' } });
    try {
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(800);

      const fr = await q.textContent('.presta-fr');
      if (!/te prest[oó]/i.test(fr)) throw new Error('la franja del prestatario no lo dice: ' + fr);
      if (!/Borrarla y mandarla a Odoo siguen siendo suyas/.test(fr))
        throw new Error('no dice qué NO se presta: ' + fr);

      const cel = await celdaEscribible(q);
      if (!cel) throw new Error('con permiso vigente la hoja sigue trabada: no hay dónde escribir');
      await cel.fill('CAMBIO DEL PRESTATARIO');
      await q.waitForTimeout(1600);

      const g = await q.evaluate(() => window.__llamadas.guardar);
      if (!g.length) throw new Error('no salió ningún guardado al servidor');
      const c = g[g.length - 1];
      if (c.id_local !== 'M-DE-RICARDO')
        throw new Error('guardó con OTRA identidad (crearía un machote nuevo): ' + c.id_local);
      if (Number(c.version_leida) !== 7)
        throw new Error('version_leida no es la del servidor: ' + c.version_leida);
      if (!c.documento || JSON.stringify(c.documento).indexOf('CAMBIO DEL PRESTATARIO') < 0)
        throw new Error('lo tecleado no viajó en el documento');
      if (JSON.stringify(c.documento).indexOf('_ajeno') >= 0)
        throw new Error('se colaron los campos de pantalla (_ajeno…) al documento del servidor');
      console.log('    escribe con permiso · id_local del dueño · version_leida 7 · documento limpio');
    } finally { await q.close(); }
  });

  await paso('B · préstamo VENCIDO: lo rechaza, lo dice con esas palabras, y no cuesta lo tecleado', async () => {
    /* El permiso se comprueba AL GUARDAR, así que se puede estar tecleando
     * cuando vence: la pantalla es optimista a propósito (un reloj de
     * navegador puede ir movido) y el servidor es quien dice que no. Lo que
     * NO puede pasar es que ese «no» se lleve el trabajo. */
    const vence = new Date(Date.now() + 4 * 3600e3).toISOString();
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000ve01', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 7, versiones: 7,
        prestamos: [{ para: 'esteban.delacruz', otorgado_por: 'ricardo.hernandez',
                      vence_at: vence }] }
    ], { guardar: { ok: false, error: 'PRESTAMO_VENCIDO',
                    mensaje: 'El permiso temporal sobre este machote venció.' } });
    try {
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(800);
      const cel = await celdaEscribible(q);
      if (!cel) throw new Error('no hay dónde escribir con permiso vigente');
      await cel.fill('LO QUE NO SE PUEDE PERDER');
      await q.waitForTimeout(1800);

      const t = (await q.textContent('#avPrestado')).replace(/\s+/g, ' ');
      if (!/venci[oó]/i.test(t)) throw new Error('el aviso no dice que venció: ' + t);
      if (!/sigue en este navegador y no se perdi[oó]/i.test(t))
        throw new Error('no promete que el trabajo sigue aquí: ' + t);
      if (!/P[ií]dele el permiso de nuevo/i.test(t))
        throw new Error('no dice qué hacer (pedirlo otra vez): ' + t);
      if (!(await q.$('#apCopiar'))) throw new Error('no ofrece copiar lo tecleado');

      // Y la promesa, medida donde vive: el cajón de este navegador.
      const cajon = await q.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('fts_machote_prestado_v1') || '{}'); }
        catch (e) { return {}; }
      });
      const guardado = cajon['7000c433-0000-4000-8000-00000000ve01'];
      if (!guardado) throw new Error('el rechazo se llevó lo tecleado: el cajón está vacío');
      if (JSON.stringify(guardado.documento).indexOf('LO QUE NO SE PUEDE PERDER') < 0)
        throw new Error('el cajón guardó otra cosa');
      if (guardado.id_local !== 'M-DE-RICARDO')
        throw new Error('el cajón anotó otra identidad: ' + guardado.id_local);
      console.log('    rechazado por vencido · el aviso lo distingue · lo tecleado sigue en el cajón');
    } finally { await q.close(); }
  });

  await paso('B · permiso RECOGIDO: el dueño lo recoge, y al prestatario se lo dicen distinto', async () => {
    const vence = new Date(Date.now() + 4 * 3600e3).toISOString();

    // ── Lado del DUEÑO: recoger sale al servidor con la acción correcta.
    const d = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000re01', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011',
        prestamos: [{ para: 'ricardo.hernandez', para_nombre: 'Ricardo Hernández',
                      otorgado_por: 'esteban.delacruz', vence_at: vence }] }
    ], { prestar: { ok: true, recogidos: 1 } });
    try {
      await d.click('tr.rw:has-text("Bombas para Clarios") a');
      await d.waitForTimeout(800);
      if (!(await d.$('[data-recoger="ricardo.hernandez"]')))
        throw new Error('el dueño no ve con qué recoger un permiso vivo');
      d.once('dialog', x => x.accept());
      await d.click('[data-recoger="ricardo.hernandez"]');
      await d.waitForTimeout(1400);
      const ll = await d.evaluate(() => window.__llamadas.prestar);
      if (!ll.length) throw new Error('recoger no llamó al servidor');
      if (ll[0].accion !== 'recoger') throw new Error('acción: ' + ll[0].accion);
      if (ll[0].para !== 'ricardo.hernandez') throw new Error('recoge el de otro: ' + ll[0].para);
      if (await d.$('.presta-fr'))
        throw new Error('sigue diciendo que está prestada después de recogerla');
    } finally { await d.close(); }

    // ── Lado del PRESTATARIO: guarda con el permiso ya recogido.
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000re02', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 7, versiones: 7,
        prestamos: [{ para: 'esteban.delacruz', otorgado_por: 'ricardo.hernandez',
                      vence_at: vence }] }
    ], { guardar: { ok: false, error: 'PRESTAMO_RECOGIDO',
                    mensaje: 'El dueño recogió el permiso.' } });
    try {
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(800);
      const cel = await celdaEscribible(q);
      await cel.fill('ESCRITO JUSTO ANTES');
      await q.waitForTimeout(1800);
      const t = (await q.textContent('#avPrestado')).replace(/\s+/g, ' ');
      if (!/recogi[oó] tu permiso/i.test(t))
        throw new Error('no dice que se lo recogieron: ' + t);
      if (/venci[oó]/i.test(t))
        throw new Error('confunde recogido con vencido, que llevan a cosas distintas: ' + t);
      if (!/no se perdi[oó]/i.test(t)) throw new Error('no promete el trabajo: ' + t);
      const cajon = await q.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('fts_machote_prestado_v1') || '{}'); }
        catch (e) { return {}; }
      });
      if (JSON.stringify(cajon).indexOf('ESCRITO JUSTO ANTES') < 0)
        throw new Error('recoger el permiso se llevó lo que ya estaba escrito');
      console.log('    el dueño recoge · al prestatario se lo dicen distinto de «venció» · nada se pierde');
    } finally { await q.close(); }
  });

  await paso('B · EXTRAÑO sin préstamo: lo ve, no lo escribe, y no intenta guardarlo', async () => {
    /* La lectura abierta de V1.24 no es escritura. Y el candado que importa no
     * es el de la pantalla —ése sólo evita perder el rato— sino que el machote
     * ajeno NO entre al empuje: si entrara, el servidor lo rechazaría, pero
     * estaríamos mandando trabajo de otro a nombre de quien no debe. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000ex01', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 7, versiones: 7, prestamos: [] },
      { id: '7000c433-0000-4000-8000-00000000ex02', id_local: 'M-MIO',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011' }
    ], { guardar: { ok: true, version: 2, machote_id: '7000c433-0000-4000-8000-00000000ex02' } });
    try {
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(800);

      if (await q.$('.presta-fr')) throw new Error('pinta franja de préstamo sin préstamo');
      if (await q.$('#btnPrestar'))
        throw new Error('ofrece PRESTAR una cotización que no es suya');
      if (await celdaEscribible(q))
        throw new Error('deja escribir sobre trabajo ajeno sin permiso');

      const r = await q.evaluate(() => {
        const A = window.MachoteAlmacen;
        return { puede: A.puedeEscribir({ id: 'x', _ajeno: true, _prestamos: [] }),
                 prestado: A.prestadoAMi({ id: 'x', _ajeno: true, _prestamo_para_mi: null }) };
      });
      if (r.puede !== false) throw new Error('el almacén dice que SÍ puede escribir lo ajeno');
      if (r.prestado !== false) throw new Error('el almacén se inventa un préstamo');

      // Y el empuje: se fuerza uno y no puede salir nada con la identidad ajena.
      await q.evaluate(() => window.MachoteApp.guardarYa());
      await q.waitForTimeout(1400);
      const g = await q.evaluate(() => window.__llamadas.guardar);
      if (g.some(c => c.id_local === 'M-DE-RICARDO'))
        throw new Error('mandó al servidor el machote ajeno: ' + JSON.stringify(g.map(c => c.id_local)));
      console.log('    lo lee, no lo edita, no lo presta y no lo sube · guardados: ' +
                  JSON.stringify(g.map(c => c.id_local)));
    } finally { await q.close(); }
  });

  await paso('B · crear una cotización nueva sigue funcionando para cualquiera', async () => {
    /* La prueba de que el préstamo no le puso una puerta al camino normal.
     * Se hace desde una persona que NO es Esteban y que no tiene nada en el
     * servidor: si crear dependiera de ser dueño de algo, o de un scope, aquí
     * se caería. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000nu01', id_local: 'M-DE-ESTEBAN',
        nombre: 'Bombas para Clarios', folio: 11, folio_txt: 'COT-0011',
        dueno: 'esteban.delacruz', dueno_nombre: 'Jesus Esteban De La Cruz', ajeno: true }
    ], { actor: 'magaly.perez', nombre: 'Magaly Pérez',
         guardar: { ok: true, version: 1, folio: 30, folio_txt: 'COT-0030',
                    machote_id: '7000c433-0000-4000-8000-0000000000ma' } });
    try {
      await q.evaluate(() => { location.hash = '#/nuevo'; });
      await q.waitForTimeout(500);
      await q.fill('#n-nombre', 'Cotización de Magaly');
      await q.click('#n-crear');
      await q.waitForTimeout(1400);

      if (await q.$('.presta-fr')) throw new Error('una cotización recién creada sale como prestada');
      const cel = await celdaEscribible(q);
      if (!cel) throw new Error('no puede escribir en la cotización que acaba de crear');
      await cel.fill('LO QUE CAPTURÓ MAGALY');
      await q.waitForTimeout(1600);

      const g = await q.evaluate(() => window.__llamadas.guardar);
      const mio = g.filter(c => /^M-\d/.test(String(c.id_local || '')));
      if (!mio.length)
        throw new Error('no subió la cotización nueva: ' + JSON.stringify(g.map(c => c.id_local)));
      if (mio.some(c => c.id_local === 'M-DE-ESTEBAN'))
        throw new Error('la confundió con la ajena');
      console.log('    Magaly crea, escribe y sube lo suyo · id_local ' + mio[0].id_local);
    } finally { await q.close(); }
  });

  await paso('A · el que PIERDE el choque conserva lo tecleado y lo puede recuperar', async () => {
    /* La otra mitad de la concurrencia. Contra la base real ya se ejerció que
     * de dos escritores sobre la misma versión pasa uno y el otro se va con
     * CONFLICTO_DE_VERSION. Lo que faltaba —y es lo que le pasa a una persona—
     * es qué ve el que perdió: tiene que poder recuperar lo suyo, y tiene que
     * seguir ahí después de recargar, que es lo primero que uno hace cuando
     * algo sale mal. */
    const vence = new Date(Date.now() + 4 * 3600e3).toISOString();
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000cf01', id_local: 'M-DE-RICARDO',
        nombre: 'Lifter leveling', folio: 12, folio_txt: 'COT-0012',
        dueno: 'ricardo.hernandez', dueno_nombre: 'Ricardo Hernández', ajeno: true,
        version: 7, versiones: 7,
        prestamos: [{ para: 'esteban.delacruz', otorgado_por: 'ricardo.hernandez',
                      vence_at: vence }] }
    ], { guardar: { ok: false, error: 'CONFLICTO_DE_VERSION',
                    mensaje: 'La versión que sigue es la 9, no la 8. Alguien más guardó ' +
                             'mientras tanto: vuelve a abrir el machote.' } });
    try {
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(800);
      const cel = await celdaEscribible(q);
      await cel.fill('MEDIA HORA DE TRABAJO');
      await q.waitForTimeout(1800);

      const t = (await q.textContent('#avPrestado')).replace(/\s+/g, ' ');
      if (!/Otra persona guard[oó]/i.test(t))
        throw new Error('no dice que alguien más guardó: ' + t);
      if (/venci[oó]|recogi[oó]/i.test(t))
        throw new Error('confunde el choque con el permiso: ' + t);
      if (!/Vuelve a abrirla/i.test(t)) throw new Error('no dice qué hacer: ' + t);
      if (!(await q.$('#apCopiar'))) throw new Error('no hay manera de recuperar lo tecleado');

      // RECARGAR: es lo primero que hace cualquiera cuando algo falla.
      await q.reload(); await q.waitForTimeout(2000);
      const cajon = await q.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('fts_machote_prestado_v1') || '{}'); }
        catch (e) { return {}; }
      });
      if (JSON.stringify(cajon).indexOf('MEDIA HORA DE TRABAJO') < 0)
        throw new Error('recargar se llevó lo tecleado');

      // Y vuelve a la PANTALLA, no sólo al cajón: si hay que abrir la consola
      // para recuperarlo, no está recuperado.
      await q.click('tr.rw:has-text("Lifter leveling") a');
      await q.waitForTimeout(900);
      const enPantalla = await q.evaluate(() =>
        [].some.call(document.querySelectorAll('#hoja input.cel'),
                     e => String(e.value).indexOf('MEDIA HORA DE TRABAJO') >= 0));
      if (!enPantalla)
        throw new Error('el trabajo está en el cajón pero la pantalla no lo trae de vuelta');
      console.log('    perdió el choque, se lo dijeron sin confundirlo, y su trabajo volvió a pantalla');
    } finally { await q.close(); }
  });

  /* ══ V1.26 · viaje y trabajo foráneo ═══════════════════════════════════
   *
   * El CÁLCULO de todo esto se ejercita en `tests/pruebas-motor.js`, que corre
   * en menos de un segundo. Aquí va sólo lo que NO se puede comprobar sin
   * mirar la pantalla: que el bloqueo se vea y se entienda, que las chips
   * pongan los tres campos de un toque, y que el atajo a Kiwi lleve a donde
   * dice. */

  await paso('V1.26 · una chip pone país, estado y ciudad de un toque', async () => {
    await ir('#/m/M-1041');
    const antes = await p.evaluate(() => {
      const m = window.MachoteApp && window.MachoteApp._m; return null;
    });
    /* Las chips salen del JSON de configuración, no del código: si alguien
     * agrega una ciudad ahí, esta prueba la ve sin tocarse. */
    const chips = await p.$$eval('[data-frec]', e => e.map(x => x.dataset.frec));
    if (!chips.some(c => /San Antonio/.test(c)))
      throw new Error('no salieron las frecuentes: ' + JSON.stringify(chips));
    if (!chips.some(c => /Monterrey/.test(c)))
      throw new Error('falta Monterrey, que es la sede');

    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const sel = (q) => { const e = document.querySelector(q); return e ? e.value : null; };
      return { pais: sel('[data-cel="pais"]'), region: sel('[data-cel="region"]'),
               ciudad: sel('[data-cel="ciudad"]'),
               veredicto: (document.querySelector('.lugar-veredicto') || {}).textContent || '' };
    });
    if (r.pais !== 'US') throw new Error('país quedó en: ' + r.pais);
    if (r.region !== 'Texas') throw new Error('estado quedó en: ' + r.region);
    if (r.ciudad !== 'San Antonio') throw new Error('ciudad quedó en: ' + r.ciudad);
    if (!/for[áa]nea/i.test(r.veredicto)) throw new Error('no dice que es foránea: ' + r.veredicto);
    console.log('    un toque → US · Texas · San Antonio · «' + r.veredicto.trim().slice(0, 46) + '…»');
  });

  await paso('V1.26 · el lugar NO pisa el estado del documento', async () => {
    /* El defecto que esto cierra, y que sólo se vio EN LA CAPTURA: la primera
     * versión llamó `estado` a la subdivisión, y el campo salió diciendo
     * «borrador». Elegir «Texas» habría puesto el machote en estado «Texas». */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Dallas"]');
    await p.waitForTimeout(600);
    /* OJO con el selector: el estado del documento NO es una celda del
     * machote, es su propio control (`[data-estado]`, en `bloqueEstado`). Que
     * sean dos cosas distintas es precisamente lo que este defecto confundió. */
    const est = await p.evaluate(() => {
      const s = document.querySelector('[data-estado]');
      return s ? s.value : '(no hay control de estado)';
    });
    if (!/borrador|creacion|creación/i.test(est))
      throw new Error('el estado del documento quedó en: «' + est + '»');
    console.log('    la cotización sigue en «' + est + '» con el lugar en Dallas');
  });

  await paso('V1.27 · foránea sin decidir: se ve el bloqueo, dice dónde y cuántos faltan', async () => {
    /* Era la prueba de V1.26 «foránea sin viaje». Cambió porque cambió la
     * regla: ya no se AGREGAN conceptos con un botón —los cinco están puestos—
     * y lo que el revisador exige es que cada uno esté DECIDIDO. Lo que se
     * sigue afirmando es lo mismo de siempre: que el bloqueo se VE, que dice
     * dónde se ejecuta, y que ofrece la salida. */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(500);
    await hoja('Suministro');
    await p.waitForTimeout(600);

    const t = (await p.textContent('.viaje-blk')).replace(/\s+/g, ' ');
    if (!/no la deja terminar/i.test(t))
      throw new Error('no dice que bloquea: ' + t.slice(0, 160));
    if (!/San Antonio/.test(t)) throw new Error('no dice dónde se ejecuta: ' + t.slice(0, 160));
    if (!/no se ocupa/i.test(t))
      throw new Error('no ofrece la salida explícita: ' + t.slice(0, 160));
    if (!/Faltan 5 conceptos por decidir/i.test(t))
      throw new Error('no dice CUÁNTOS faltan: ' + t.slice(0, 200));

    // La barra tiene que contarlo como dura.
    const barra = (await p.textContent('.fija')).replace(/\s+/g, ' ');
    if (!/duras/.test(barra)) throw new Error('la barra no cuenta duras: ' + barra);

    /* Capturar UNO ya no desbloquea —ése era justo el agujero de Albuquerque—
     * pero sí baja la cuenta y el renglón entra como Viaje.
     *
     * ⚠️ `textContent` NO ve el valor de un `<input>`, y la descripción de una
     * partida es un campo, no texto: se busca por `.value`. */
    const ruta = await p.evaluate(() => {
      const d = [...document.querySelectorAll('[data-cel$=":descripcion"]')]
        .find(x => /^Vuelos$/i.test(x.value));
      return d ? d.dataset.cel.replace(/descripcion$/, '') : null;
    });
    if (!ruta) throw new Error('el renglón de Vuelos no salió solo');
    await p.fill('[data-cel="' + ruta + 'qty"]', '2');
    await p.dispatchEvent('[data-cel="' + ruta + 'qty"]', 'change');
    await p.fill('[data-cel="' + ruta + 'pu"]', '9000');
    await p.dispatchEvent('[data-cel="' + ruta + 'pu"]', 'change');
    await p.waitForTimeout(800);

    const r = await p.evaluate((rt) => {
      const tipo = document.querySelector('[data-cel="' + rt + 'tipo"]');
      const av = document.querySelector('.viaje-blk .aviso.bad');
      return { tipo: tipo ? tipo.value : null,
               aviso: av ? av.textContent.replace(/\s+/g, ' ') : null };
    }, ruta);
    if (r.tipo !== 'Viaje') throw new Error('el renglón no es de tipo Viaje: ' + r.tipo);
    if (!r.aviso) throw new Error('con UN concepto capturado ya dejó de avisar: es el caso Albuquerque');
    if (!/Faltan 4 conceptos/i.test(r.aviso))
      throw new Error('no bajó la cuenta a 4: ' + r.aviso);
    console.log('    bloquea, dice dónde y cuántos · un vuelo capturado baja a 4, NO desbloquea');
  });

  await paso('V1.26 · una cotización de Monterrey no pide nada de viaje', async () => {
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Monterrey"]');
    await p.waitForTimeout(500);
    const ver = (await p.textContent('.lugar-veredicto')).replace(/\s+/g, ' ');
    if (!/en la sede/i.test(ver)) throw new Error('no dice que está en la sede: ' + ver);
    if (await p.$('.viaje-cfg')) throw new Error('enseña la configuración de viaje en una local');
    await hoja('Suministro');
    await p.waitForTimeout(500);
    if (await p.$('.viaje-blk'))
      throw new Error('enseña el bloque de viaje en una cotización de Monterrey');
    console.log('    Monterrey: sin bloque de viaje, sin recargos, sin bloqueo');
  });

  await paso('V1.26 · el atajo a Kiwi abre fuera, con origen y destino', async () => {
    /* NO se incrusta, y no es capricho: Kiwi manda
     * `frame-ancestors 'self' kiwi.com *.kiwi.com …` y nuestro dominio no está,
     * así que un iframe saldría EN BLANCO. Medido contra el sitio en vivo el
     * 2026-09-10. Un recuadro vacío se lee como aplicación rota. */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(500);
    await hoja('Suministro');
    await p.waitForTimeout(500);
    const a = await p.evaluate(() => {
      const e = document.querySelector('.chip-viaje.kiwi');
      return e ? { href: e.getAttribute('href'), target: e.getAttribute('target'),
                   rel: e.getAttribute('rel'), txt: e.textContent.trim() } : null;
    });
    if (!a) throw new Error('no hay atajo a Kiwi');
    if (!/^https:\/\/www\.kiwi\.com\//.test(a.href)) throw new Error('apunta a: ' + a.href);
    if (a.href.indexOf('monterrey') < 0) throw new Error('sin origen: ' + a.href);
    if (a.href.indexOf('san-antonio') < 0) throw new Error('sin destino: ' + a.href);
    if (a.target !== '_blank') throw new Error('no abre en pestaña nueva');
    if (!/noopener/.test(a.rel || '')) throw new Error('sin rel=noopener');
    if (await p.$('iframe[src*="kiwi"]'))
      throw new Error('hay un iframe de Kiwi: Kiwi lo prohíbe y saldría en blanco');
    console.log('    ' + a.href.slice(0, 92));
  });

  await paso('V1.26 · el precio de un vuelo dice de cuándo es', async () => {
    await ir('#/m/M-1041');
    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(500);
    await hoja('Suministro');
    /* V1.27 · ya no hay botón «+ Vuelos»: el renglón sale solo, en cero. Lo que
     * esta prueba mide sigue igual —que el precio diga de cuándo es— sólo que
     * ahora empieza desde un renglón que ya está ahí. */
    await p.waitForTimeout(700);

    // Sin precio todavía no pregunta nada: no hay número que fechar.
    if (await p.$('[data-consul]'))
      throw new Error('pide la fecha de consulta antes de que haya precio');

    /* Se localiza el renglón por el VALOR del campo de descripción, no por el
     * texto de la fila: un `<input>` no tiene texto. */
    const ruta = await p.evaluate(() => {
      const d = [...document.querySelectorAll('[data-cel$=":descripcion"]')]
        .find(x => /Vuelos/i.test(x.value));
      return d ? d.dataset.cel.replace(/descripcion$/, 'pu') : null;
    });
    if (!ruta) throw new Error('no se encontró el renglón de vuelos recién agregado');
    await p.fill('[data-cel="' + ruta + '"]', '18500');
    await p.dispatchEvent('[data-cel="' + ruta + '"]', 'change');
    await p.waitForTimeout(700);

    const b = await p.$('[data-consul]');
    if (!b) throw new Error('con precio puesto, no ofrece anotar de cuándo es');
    if (!/de cu[áa]ndo es/i.test(await b.textContent()))
      throw new Error('el botón no dice para qué sirve: ' + (await b.textContent()));
    await b.click();
    await p.waitForTimeout(600);
    const t = (await p.textContent('.consul-fecha')).replace(/\s+/g, ' ');
    if (!/consultado/.test(t)) throw new Error('no quedó la fecha: ' + t);
    if (!/hoy/.test(t)) throw new Error('no dice que es de hoy: ' + t);
    console.log('    «' + t.trim() + '» — una cotización se manda semanas antes de volar');
  });

  await paso('V1.26 · «¿está todo lo mío en el servidor?» contesta CON HORA', async () => {
    /* El renglón de la tarea D no tenía ninguna prueba, y mirándolo apareció un
     * defecto de los que no se ven en el diff: `toLocaleTimeString('es-MX')`
     * devuelve «6:06 p.m.» —con punto— así que la frase terminaba en «p.m..».
     * Es el MISMO bug que ya se había arreglado en la franja de préstamo. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-0000000c0mp1', id_local: 'M-MIO-COMP',
        nombre: 'Rack de tuberías · planta 2', folio: 41, folio_txt: 'COT-0041',
        dueno: 'esteban.delacruz', dueno_nombre: 'Jesus Esteban De La Cruz' }
    ]);
    try {
      await q.waitForTimeout(1600);
      const t = (await q.$eval('.comprob', e => e.className + '||' + e.textContent)
                        .catch(() => null));
      if (!t) throw new Error('tras bajar del servidor no se pinta la comprobación');
      const [clase, texto] = t.split('||');
      const limpio = texto.replace(/\s+/g, ' ').trim();

      if (clase.indexOf('bien') < 0)
        throw new Error('lo bajado del servidor no se cuenta como estando allá: ' + limpio);
      // CON HORA: una comprobación sin fecha es una promesa sin plazo.
      if (!/\d{1,2}:\d{2}/.test(limpio))
        throw new Error('contesta sin hora: ' + limpio);
      if (/\.\./.test(limpio))
        throw new Error('el punto sale duplicado («p.m..»): ' + limpio);
      console.log('    «' + limpio + '»');
    } finally { await q.close(); }
  });

  await paso('V1.26 · sin bajada NO dice «todo bien» ni «falta algo»: dice que no sabe', async () => {
    /* Los tres estados son distintos a propósito (§20 #12b): no haber podido
     * preguntar no es una respuesta buena ni mala, y confundirlo con
     * cualquiera de las dos es exactamente el modo de falla que perseguimos. */
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'esteban.delacruz',
          nombre: 'Jesus Esteban De La Cruz', empleado_id: 32,
          scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        localStorage.removeItem('fts_machote_sync_v1');
        // Un machote PROPIO: los de ejemplo no cuentan, no son de nadie.
        localStorage.setItem('fts_machote_v1', JSON.stringify({ machotes: [
          { id: 'M-1757500000000', nombre: 'Rack de tuberías · planta 2',
            cliente: 'Nalco de México', dueno: 'esteban.delacruz',
            dueno_nombre: 'Jesus Esteban De La Cruz', estado: 'borrador',
            moneda: 'MXN', tc: 18.4, secciones: [] }
        ] }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        // El servidor NO contesta: es el caso de «todavía no se sabe».
        if (String(u).indexOf('/webhook/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1600);
      const t = await q.$eval('.comprob', e => e.className + '||' + e.textContent)
                       .catch(() => null);
      if (!t) throw new Error('sin bajada no dice nada de lo propio');
      const [clase, texto] = t.split('||');
      const limpio = texto.replace(/\s+/g, ' ').trim();
      if (clase.indexOf('no-sabe') < 0)
        throw new Error('sin bajada contesta como si supiera: ' + clase + ' · ' + limpio);
      if (/todas? est/i.test(limpio) || /\bde \d/.test(limpio))
        throw new Error('afirma un conteo que no pudo comprobar: ' + limpio);
      if (!/guardado en este navegador/i.test(limpio))
        throw new Error('no dice dónde quedó lo capturado: ' + limpio);
      console.log('    «' + limpio + '»');
    } finally { await q.close(); }
  });

  await paso('V1.27 · H · la pantalla DETECTA que corre media versión y lo dice', async () => {
    /* El caso que motivó todo: con `max-age=600` y sin versión en la URL, un
     * navegador puede acabar con `app.js` de una versión y `calc.js` de otra.
     * Aquí se fabrica exactamente eso —se le cambia la versión al motor antes
     * de que arranque la pantalla— y se exige que lo DIGA en vez de calcular
     * con un motor que no es el que espera. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'esteban.delacruz',
          nombre: 'Jesus Esteban De La Cruz', empleado_id: 32,
          scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/webhook/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
      /* El motor se carga ANTES que la pantalla. En cuanto exista, se le
       * desfasa la versión: es lo mismo que habría hecho un caché con dos
       * archivos de distinta edad. */
      let real = null;
      Object.defineProperty(window, 'MachoteCalc', {
        configurable: true,
        get: function () { return real; },
        set: function (v) { real = v; if (real) real.VERSION = 'V1.25'; }
      });
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1200);

      const aviso = await q.$('#avMezcla');
      if (!aviso) throw new Error('corrió media versión y no dijo nada');
      const t = (await aviso.textContent()).replace(/\s+/g, ' ');
      if (!/dos versiones a la vez/i.test(t)) throw new Error('el aviso no dice qué pasa: ' + t);
      if (t.indexOf('calc.js') < 0) throw new Error('no dice QUÉ está desfasado: ' + t);
      if (t.indexOf('V1.25') < 0) throw new Error('no dice con qué versión: ' + t);
      if (!(await q.$('#mzRecargar'))) throw new Error('no ofrece la única acción que sirve');

      // Y el pie lo marca, porque es donde la gente mira la versión.
      const pie = await q.$eval('#tbV', e => e.className + '||' + e.textContent);
      if (pie.indexOf('mezcla') < 0) throw new Error('el pie no marca la mezcla: ' + pie);
      console.log('    «' + t.slice(0, 120) + '…»');
    } finally { await q.close(); }
  });

  await paso('V1.27 · H · sin mezcla no molesta, y el pie dice la versión de version.json', async () => {
    /* La otra mitad: el aviso NO puede salir cuando todo está en orden, o se
     * vuelve ruido que se aprende a ignorar. Y la versión que se ve tiene que
     * ser la misma que declara `version.json` — son dos archivos distintos y
     * separarlos es cómo se llega a un pie que miente. */
    await ir('#/');
    if (await p.$('#avMezcla')) throw new Error('avisa de mezcla sin haberla');
    const ver = JSON.parse(require('fs').readFileSync(
      path.resolve(__dirname, '..', 'version.json'), 'utf8'));
    const pie = (await p.textContent('#tbV')).trim();
    if (pie !== ver.version) throw new Error('el pie dice "' + pie + '" y version.json ' + ver.version);
    if (ver.build !== ver.version)
      throw new Error('version.json: build ' + ver.build + ' ≠ version ' + ver.version);
    // Y el contrato con el vigilante del kiosko: publica lo que corre.
    const build = await p.evaluate(() => window.MACHOTE_BUILD);
    if (build !== ver.version) throw new Error('MACHOTE_BUILD ' + build + ' ≠ ' + ver.version);
  });

  await paso('V1.27 · H · los scripts se piden CON la versión en la URL', async () => {
    /* Sin esto, cada archivo se cachea por su cuenta y la mezcla de arriba es
     * posible de verdad. Con la versión en la URL, un index.html dado pide
     * siempre un juego coherente. */
    const malos = await p.evaluate(() => {
      const out = [];
      [].slice.call(document.querySelectorAll('script[src], link[rel="stylesheet"]')).forEach(e => {
        const u = e.getAttribute('src') || e.getAttribute('href') || '';
        // Sólo los archivos DEL MÓDULO: los compartidos llevan su propio ciclo.
        if (!/^(js|css)\//.test(u)) return;
        if (u.indexOf('?v=') < 0) out.push(u);
      });
      return out;
    });
    if (malos.length) throw new Error('sin versión en la URL: ' + malos.join(', '));
  });

  await paso('V1.27 · E · Nuevo León NO pide viáticos, y el estado de al lado SÍ', async () => {
    await ir('#/m/M-1041');
    /* ⚠️ Aquí había un `selectOption('#lugPais', …).catch(() => {})`. Ese id no
     * existe —los desplegables se nombran con `data-cel`— y el `.catch` vacío
     * se tragaba el fallo: la prueba pasaba midiendo nada. Es exactamente el
     * modo de falla de §20 #11. Ahora se comprueba que el desplegable EXISTE
     * y que trae los tres países donde FTS ejecuta. */
    const opciones = await p.$$eval('[data-cel="pais"] option', els =>
      els.map(e => e.textContent.trim()));
    if (opciones.length < 200)
      throw new Error('el catálogo de países no cargó: ' + opciones.length + ' opciones');
    ['México', 'Estados Unidos', 'Brasil'].forEach(x => {
      if (opciones.indexOf(x) < 0) throw new Error('falta ' + x + ' en el desplegable');
    });

    const estado = async (region, ciudad) => p.evaluate(([r, c]) => {
      const C = window.MachoteCalc;
      return C.esForaneo({ pais: 'MX', region: r, ciudad: c });
    }, [region, ciudad]);

    if (await estado('Nuevo León', 'Santa Catarina'))
      throw new Error('Santa Catarina se leyó como foránea');
    if (!(await estado('Coahuila', 'Saltillo')))
      throw new Error('Saltillo NO se leyó como foránea');

    // Y en pantalla: una chip de São Paulo deja la cotización en foránea.
    const sp = await p.$('[data-frec*="São Paulo"]');
    if (!sp) throw new Error('Brasil no salió en las ciudades frecuentes');
    await sp.click(); await p.waitForTimeout(600);
    const ver = await p.textContent('.lugar-veredicto');
    if (!/fuera|foránea/i.test(ver)) throw new Error('São Paulo no se marcó como foránea: ' + ver);
    console.log('    «' + ver.replace(/\s+/g, ' ').trim().slice(0, 90) + '»');
  });

  await paso('V1.27 · E · cambiar de país limpia el estado y la ciudad', async () => {
    /* No es hipotético: en las pruebas de Montalvo del 10-sep hay versiones
     * guardadas con «Estados Unidos · Nuevo León · Monterrey» (COT-0013 v7) y
     * «México · Ciudad de México · Monterrey» (v16). Eso viaja al PDF del
     * cliente — y desde V1.27 el ESTADO decide si hay viáticos, así que un
     * estado que no es de ese país decide mal. */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Monterrey"]');
    await p.waitForTimeout(600);
    const antes = await p.evaluate(() => ({
      pais: document.querySelector('[data-cel="pais"]').value,
      region: (document.querySelector('[data-cel="region"]') || {}).value || '',
      ciudad: (document.querySelector('[data-cel="ciudad"]') || {}).value || '' }));
    if (antes.region !== 'Nuevo León') throw new Error('no partió de Nuevo León: ' + JSON.stringify(antes));

    await p.selectOption('[data-cel="pais"]', 'US');
    await p.waitForTimeout(700);
    const desp = await p.evaluate(() => ({
      pais: document.querySelector('[data-cel="pais"]').value,
      region: (document.querySelector('[data-cel="region"]') || {}).value || '',
      ciudad: (document.querySelector('[data-cel="ciudad"]') || {}).value || '' }));
    if (desp.pais !== 'US') throw new Error('no cambió el país: ' + JSON.stringify(desp));
    if (desp.region) throw new Error('se quedó con un estado de otro país: ' + JSON.stringify(desp));
    if (desp.ciudad) throw new Error('se quedó con la ciudad de otro país: ' + JSON.stringify(desp));
    console.log('    MX/Nuevo León/Monterrey → US/(vacío)/(vacío)');
  });

  await paso('V1.27 · G · los cinco conceptos salen SOLOS, en cero, y bloquean hasta decidirlos', async () => {
    await ir('#/m/M-1041');
    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(500);
    await hoja('Suministro');
    await p.waitForTimeout(600);

    const etiquetas = await p.$$eval('.viaje-tbl td.rotulo', els => els.map(e => e.textContent.trim()));
    const ESPERADAS = ['Vuelos', 'Hotel', 'Viáticos', 'Taxis y traslados', 'Gasolina'];
    const faltan = ESPERADAS.filter(x => etiquetas.indexOf(x) < 0);
    if (faltan.length) throw new Error('no salieron solos: ' + faltan.join(', '));

    // Todos sin decidir, y el bloque lo dice con el número.
    const aviso = (await p.textContent('.viaje-blk .aviso')).replace(/\s+/g, ' ');
    if (!/Faltan 5 conceptos por decidir/i.test(aviso))
      throw new Error('no dice cuántos faltan: ' + aviso);

    /* Marcar «no se ocupa» los resuelve, sin inventar importes. Se recorren
     * TODAS las hojas de sección: el viaje se decide donde está el trabajo, y
     * este machote trae dos. */
    const hojas = await p.$$eval('.pestana', els =>
      els.map(e => e.textContent.trim()).filter(t => !/DESGLOSE|^\+$/.test(t)));
    for (const h of hojas) {
      await hoja(h);
      await p.waitForTimeout(400);
      const botones = await p.$$('[data-cero]');
      for (let i = 0; i < botones.length; i++) {
        const bs = await p.$$('[data-cero]');
        if (!bs[i]) break;
        const yaEsta = await bs[i].evaluate(e => e.className.indexOf('on') >= 0);
        if (!yaEsta) { await bs[i].click(); await p.waitForTimeout(240); }
      }
    }
    await hoja(hojas[0]);
    await p.waitForTimeout(400);
    const ok = (await p.textContent('.viaje-blk .aviso')).replace(/\s+/g, ' ');
    if (!/cinco conceptos están decididos/i.test(ok)) throw new Error('no se dio por resuelto: ' + ok);

    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
      const c = C.calcular(m);
      return { porResolver: c.viajePorResolver, costoViaje: c.costoViaje,
               duras: window.MachoteReglas.revisar(m).duras.map(h => h.id) };
    });
    if (r.porResolver !== 0) throw new Error('quedan ' + r.porResolver + ' sin resolver');
    if (r.costoViaje !== 0) throw new Error('marcar en cero inventó un costo: ' + r.costoViaje);
    if (r.duras.indexOf('viaje-sin-resolver') >= 0) throw new Error('sigue bloqueando');
    console.log('    cinco puestos solos · «' + ok.trim().slice(0, 60) + '»');
  });

  await paso('V1.27 · A · el aviso de conflicto dice QUIÉN guardó', async () => {
    /* El dato existe desde siempre en `machote_version.autor` y sale del token
     * verificado. Decir «otra persona» cuando el sistema sabe el nombre
     * convierte algo accionable en un misterio. */
    const q = await paginaConServidor([
      { id: '7000c433-0000-4000-8000-00000000cf01', id_local: 'M-CHOQUE',
        nombre: 'Bombas para Clarios', folio: 41, folio_txt: 'COT-0041',
        dueno: 'esteban.delacruz', dueno_nombre: 'Jesus Esteban De La Cruz' }
    ], { guardar: { ok: false, error: 'CONFLICTO_DE_VERSION',
                    mensaje: 'Ricardo Alán Hernández González guardó este machote mientras lo editabas. Va en la versión 7.',
                    autor: 'ricardo.hernandez', autor_nombre: 'Ricardo Alán Hernández González',
                    version_actual: 7, machote_id: '7000c433-0000-4000-8000-00000000cf01',
                    folio: 41, folio_txt: 'COT-0041' } });
    try {
      await q.waitForTimeout(1400);
      await q.evaluate(() => { location.hash = '#/m/M-CHOQUE'; });
      await q.waitForTimeout(700);
      const cel = await celdaEscribible(q);
      if (!cel) throw new Error('no se pudo escribir para provocar el guardado');
      await cel.fill('PROVOCA EL CHOQUE');
      await q.waitForTimeout(1800);

      const av = await q.$('#avPend');
      if (!av) throw new Error('el choque no avisó nada');
      const t = (await av.textContent()).replace(/\s+/g, ' ');
      if (t.indexOf('Ricardo Alán Hernández González') < 0)
        throw new Error('no dice quién guardó: ' + t);
      if (/Otra persona/i.test(t)) throw new Error('sigue diciendo «otra persona»: ' + t);
      if (t.indexOf('versión 7') < 0) throw new Error('no dice en qué versión va: ' + t);
      if (!/NO se perdió/i.test(t)) throw new Error('ya no dice que el trabajo está a salvo: ' + t);

      /* Y la otra mitad: el rechazo ENSEÑA. La libreta se queda con el folio y
       * la versión que no tenía, que es lo que rompía el círculo de «sin folio
       * y con conflicto» que reportó Montalvo. */
      const libro = await q.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('fts_machote_sync_v1') || '{}');
        return s['M-CHOQUE'] || null;
      });
      if (!libro) throw new Error('el rechazo no dejó nada anotado');
      if (libro.folio_txt !== 'COT-0041')
        throw new Error('no anotó el folio que le faltaba: ' + JSON.stringify(libro));
      if (Number(libro.version) !== 7)
        throw new Error('no anotó la versión del servidor: ' + JSON.stringify(libro));
      console.log('    «' + t.slice(0, 110) + '…» · libreta con ' + libro.folio_txt);
    } finally { await q.close(); }
  });

  await paso('V1.27 · B · los ejemplos YA NO salen al entrar', async () => {
    /* Tres veces acabaron en producción. Un navegador nuevo arranca vacío y lo
     * dice; lo que ya esté guardado y TOCADO no se borra — eso es trabajo de
     * alguien. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q);
    await q.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/webhook/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1100);
      const filas = await q.$$eval('table.lista tbody tr', e => e.length);
      if (filas !== 0) throw new Error('salieron ' + filas + ' cotizaciones de la nada');
      const vacio = (await q.textContent('.tw')).replace(/\s+/g, ' ');
      if (!/Todav[ií]a no hay cotizaciones/i.test(vacio))
        throw new Error('la lista vacía no se explica: ' + vacio);
      console.log('    «' + vacio.trim().slice(0, 70) + '»');
    } finally { await q.close(); }
  });

  await paso('V1.27 · B · pero un ejemplo TOCADO es trabajo de alguien y NO se borra', async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q);
    await q.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        // Uno SIN tocar (marca intacta) y otro TOCADO (sin marca).
        localStorage.setItem('fts_machote_v1', JSON.stringify({ v: 1,
          guardado_at: new Date().toISOString(), handoff: {}, machotes: [
            { _demo: true, id: 'M-1041', nombre: 'Ejemplo sin tocar', estado: 'borrador',
              moneda: 'MXN', secciones: [] },
            { id: 'M-1043', nombre: 'Cooling system for maintenance offices',
              estado: 'borrador', moneda: 'MXN', secciones: [] }
          ] }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/webhook/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1100);
      const nombres = await q.$$eval('table.lista tbody tr', els =>
        els.map(e => e.textContent.replace(/\s+/g, ' ')));
      if (nombres.some(x => /Ejemplo sin tocar/.test(x)))
        throw new Error('el ejemplo intacto sigue en la lista');
      if (!nombres.some(x => /Cooling system/.test(x)))
        throw new Error('BORRÓ trabajo de alguien: el ejemplo tocado desapareció');
      // Y no reaparece al recargar.
      await q.reload(); await q.waitForTimeout(900);
      const n2 = await q.$$eval('table.lista tbody tr', e => e.length);
      if (n2 !== 1) throw new Error('tras recargar hay ' + n2 + ' renglones, no 1');
      console.log('    el intacto se va, el tocado se queda');
    } finally { await q.close(); }
  });

  await paso('V1.27 · C · el dueño renombra, y el cambio va al historial', async () => {
    await ir('#/m/M-1041');
    const campo = await p.$('[data-nombre]');
    if (!campo) throw new Error('el nombre no se puede editar');
    await campo.fill('Paso de gato · planta 2');
    await campo.dispatchEvent('change');
    await p.waitForTimeout(900);

    const r = await p.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
      return { nombre: m.nombre, cab: (document.querySelector('.cab-nombre') || {}).value || null };
    });
    if (r.nombre !== 'Paso de gato · planta 2') throw new Error('no se guardó: ' + r.nombre);
    if (r.cab !== 'Paso de gato · planta 2') throw new Error('la pantalla no lo refleja: ' + r.cab);

    /* Vacío NO: un machote sin nombre no se puede nombrar por teléfono.
     * Ojo: el `render()` del renombrado re-crea el campo, así que el handle
     * anterior quedó suelto — se vuelve a pedir. */
    const campo2 = await p.$('[data-nombre]');
    if (!campo2) throw new Error('el campo desapareció tras renombrar');
    await campo2.fill('');
    await campo2.dispatchEvent('change');
    await p.waitForTimeout(500);
    const tras = await p.evaluate(() => JSON.parse(localStorage.getItem('fts_machote_v1'))
      .machotes.find(x => x.id === 'M-1041').nombre);
    if (!tras) throw new Error('dejó el nombre vacío');
    console.log('    renombrada a «' + r.nombre + '» · el vacío se rechaza');
  });


  /* ══ V1.28 · EL RECARGO ES DE LA SECCIÓN, Y ES DE ESTADOS UNIDOS ════════
   *
   * Dos reglas que se leían como una sola. Montalvo entendió que el recargo
   * dependía de VIAJAR y propuso extenderlo fuera de Monterrey; estaban en la
   * misma tabla, bajo el mismo título. Estas pruebas afirman que ya no. */

  await paso('V1.28 · Ciudad Juárez pide viaje y NO ofrece el recargo; Dallas pide las dos', async () => {
    await ir('#/m/M-1041');
    // Juárez: foránea de verdad, y no es Estados Unidos.
    await p.selectOption('[data-cel="pais"]', 'MX');
    await p.dispatchEvent('[data-cel="pais"]', 'change');
    await p.waitForTimeout(400);
    /* ⚠️ `region` es un `<select>` cuando el país tiene catálogo —México y
     * Estados Unidos lo tienen— y un campo de texto para los demás. `fill`
     * revienta contra un `<select>`, así que se mira QUÉ es antes de escribir.
     * Es el mismo error de V1.27 con `#lugPais`: inventar el selector en vez
     * de mirar la pantalla. */
    const escribir = async (campo, valor) => {
      const sel = '[data-cel="' + campo + '"]';
      const tag = await p.$eval(sel, e => e.tagName);
      if (tag === 'SELECT') await p.selectOption(sel, { label: valor });
      else await p.fill(sel, valor);
      await p.dispatchEvent(sel, 'change');
    };
    await escribir('region', 'Chihuahua');
    await p.waitForTimeout(300);
    await escribir('ciudad', 'Ciudad Juárez');
    await p.waitForTimeout(600);

    const ver = (await p.textContent('.lugar-veredicto')).replace(/\s+/g, ' ');
    if (!/foránea|fuera de Nuevo León/i.test(ver))
      throw new Error('Juárez no se leyó como foránea: ' + ver);

    await hoja('Suministro'); await p.waitForTimeout(600);
    if (!(await p.$('.viaje-blk')))
      throw new Error('Juárez es foránea y no salió el bloque de viaje');
    if (await p.$('.rec-sec'))
      throw new Error('OFRECE el recargo en Ciudad Juárez: es regla laboral de EUA, no de viajar');

    // Dallas: las dos cosas. Las ciudades frecuentes viven en DESGLOSE, y
    // venimos de la hoja de sección: hay que volver antes de tocarlas.
    await hoja('DESGLOSE'); await p.waitForTimeout(400);
    await p.click('[data-frec*="Dallas"]');
    await p.waitForTimeout(600);
    await hoja('Suministro'); await p.waitForTimeout(600);
    if (!(await p.$('.viaje-blk'))) throw new Error('Dallas no pidió viaje');
    const rec = await p.$('.rec-sec');
    if (!rec) throw new Error('Dallas NO ofreció el recargo');
    const t = (await p.textContent('.rec-sec')).replace(/\s+/g, ' ');
    if (!/Estados Unidos/i.test(t)) throw new Error('el bloque no dice por qué aparece: ' + t.slice(0, 140));
    console.log('    Juárez: viaje sí, recargo no · Dallas: las dos');
  });

  await paso('V1.28 · las dos reglas se leen por separado, no como una sola', async () => {
    /* El texto es el encargo, no un detalle: de leerlas juntas salió la
     * propuesta de extender el recargo a todo lo foráneo. */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Dallas"]');
    await p.waitForTimeout(600);
    const t = (await p.textContent('.viaje-reglas')).replace(/\s+/g, ' ');
    if (!/dos reglas distintas/i.test(t)) throw new Error('no las separa: ' + t.slice(0, 140));
    if (!/fuera de Nuevo León/i.test(t))
      throw new Error('no dice de dónde salen los gastos de viaje: ' + t.slice(0, 200));
    if (!/en Estados Unidos/i.test(t))
      throw new Error('no dice de dónde sale el recargo: ' + t.slice(0, 200));
    if (!/en cada sección/i.test(t))
      throw new Error('no dice dónde se captura ahora: ' + t.slice(0, 240));
    // Y la celda del machote se retiró: dos escritores del mismo número, no.
    if (await p.$('[data-cel="viaje.recargo_fin_semana"]'))
      throw new Error('sigue la celda del recargo a nivel machote: dos escritores');
    console.log('    «' + t.slice(0, 100) + '…»');
  });

  await paso('V1.28 · cambiar el recargo en una sección NO toca a la otra', async () => {
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Dallas"]');
    await p.waitForTimeout(600);
    await hoja('Suministro'); await p.waitForTimeout(500);

    // Dos secciones. La segunda se agrega con el botón real de la pantalla.
    const sid = await p.evaluate(() => {
      const e = document.querySelector('.rec-sec [data-cel*=":fin_semana"]');
      return e ? e.dataset.cel.split(':')[1] : null;
    });
    if (!sid) throw new Error('no se encontró la celda del recargo de la sección');

    const antes = await p.inputValue('[data-cel="rec:' + sid + ':fin_semana"]');
    if (Number(antes) !== 30) throw new Error('no arranca en 30%: ' + antes);

    await p.fill('[data-cel="rec:' + sid + ':fin_semana"]', '50');
    await p.dispatchEvent('[data-cel="rec:' + sid + ':fin_semana"]', 'change');
    await p.waitForTimeout(900);

    const g = await p.evaluate((id) => {
      const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes
        .find(x => x.id === 'M-1041');
      return {
        secciones: m.secciones.map(s => ({ id: s.id, rec: s.recargos || null })),
        machote: m.viaje ? m.viaje.recargo_fin_semana : undefined,
        tocada: id
      };
    }, sid);

    const laQueSeMovio = g.secciones.find(s => s.id === sid);
    if (!laQueSeMovio || !laQueSeMovio.rec || laQueSeMovio.rec.fin_semana !== 0.5)
      throw new Error('no se guardó en la sección: ' + JSON.stringify(laQueSeMovio));
    const otras = g.secciones.filter(s => s.id !== sid);
    if (!otras.length) throw new Error('el machote de prueba tiene UNA sola sección: no ejerce el caso');
    otras.forEach(s => {
      if (s.rec && s.rec.fin_semana !== undefined)
        throw new Error('se propagó a la sección ' + s.id + ': ' + JSON.stringify(s.rec));
    });
    if (g.machote !== undefined)
      throw new Error('se subió al machote: ' + g.machote);

    // Y en pantalla: la marca de apartado aparece SÓLO donde se movió.
    const marcas = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.rec-sec').forEach(b => {
        out.push({ apartado: b.classList.contains('apartado'),
                   marca: !!b.querySelector('.rec-marca') });
      });
      return out;
    });
    if (!marcas.length || !marcas[0].apartado || !marcas[0].marca)
      throw new Error('no se ve que se apartó: ' + JSON.stringify(marcas));
    console.log('    sección ' + sid.slice(0, 12) + ' al 50% · ' + otras.length +
                ' sección(es) intactas · el machote no se tocó');
  });

  await paso('V1.28 · un machote nuevo arranca en 30% aunque el anterior se haya movido', async () => {
    /* El machote del paso anterior quedó con una sección al 50%. El siguiente
     * NO hereda nada: el recargo es del tramo de trabajo, no del sistema. */
    await ir('#/');
    await p.waitForTimeout(300);
    const nuevo = await p.$('[data-nuevo], #btnNuevo, .btn-nuevo');
    if (nuevo) { await nuevo.click(); await p.waitForTimeout(700); }
    else {
      await p.evaluate(() => { location.hash = '#/nuevo'; });
      await p.waitForTimeout(700);
    }
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      const m = C.machoteNuevo({ nombre: 'prueba V1.28' });
      m.pais = 'US'; m.region = 'Texas'; m.ciudad = 'Dallas';
      m.secciones.push(C.seccionNueva('SECCIÓN 2', 'MXN', C.MARGENES_PLANTILLA));
      return {
        propio: m.viaje.recargo_fin_semana,
        porSeccion: m.secciones.map(s => C.recargosDe(m, s).fin_semana.pct),
        apartados: m.secciones.map(s => C.recargosDe(m, s).fin_semana.apartado),
        plantilla: C.RECARGOS_PLANTILLA.fin_semana
      };
    });
    if (r.propio !== undefined && r.propio !== null)
      throw new Error('el machote nuevo trae número propio: ' + r.propio);
    if (r.porSeccion.some(x => x !== 0.30))
      throw new Error('alguna sección no arrancó en 30%: ' + JSON.stringify(r.porSeccion));
    if (r.apartados.some(Boolean))
      throw new Error('un machote nuevo se marca como apartado: ' + JSON.stringify(r.apartados));
    if (r.plantilla !== 0.30) throw new Error('el valor por defecto se movió: ' + r.plantilla);
    console.log('    nuevo: 30% en sus ' + r.porSeccion.length + ' secciones, sin marcas');
  });

  await paso('V1.28 · los que YA existen: el recargo a nivel machote no se rompe', async () => {
    /* Hay captura real de tres personas. Un machote de V1.27 lleva el número
     * en `m.viaje` y tiene que valer EXACTAMENTE lo mismo — sin migrarlo, y
     * sin que le caiga un valor inventado encima de lo que alguien decidió. */
    await ir('#/m/M-1041');
    const r = await p.evaluate(() => {
      const C = window.MachoteCalc;
      // Así se guardaba antes de V1.28: el recargo, del machote entero.
      const m = C.machoteNuevo({ nombre: 'capturado en V1.27' });
      m.pais = 'US'; m.region = 'Texas'; m.ciudad = 'Dallas';
      m.viaje.recargo_fin_semana = 0.45;
      m.secciones.push(C.seccionNueva('SECCIÓN 2', 'MXN', C.MARGENES_PLANTILLA));
      m.secciones.forEach(s => {
        const l = s.mo.find(x => x.rol === 'hrs_finde');
        l.qty = 10; l.personas = 1; l.pu = 100;
      });
      const c = C.calcular(m);
      return {
        costos: c.secciones.map(s => s.costoMo),
        origen: m.secciones.map(s => C.recargosDe(m, s).fin_semana.origen),
        escritoEnSeccion: m.secciones.map(s => s.recargos === undefined),
        sigueEnMachote: m.viaje.recargo_fin_semana
      };
    });
    if (r.costos.some(x => Math.round(x) !== 1450))
      throw new Error('los números cambiaron: ' + JSON.stringify(r.costos));
    if (r.origen.some(x => x !== 'machote'))
      throw new Error('no lee la capa del machote: ' + JSON.stringify(r.origen));
    if (r.escritoEnSeccion.some(x => !x))
      throw new Error('se le escribió un recargo inventado a la sección');
    if (r.sigueEnMachote !== 0.45) throw new Error('le movieron el dato: ' + r.sigueEnMachote);
    console.log('    45% del machote, respetado en sus 2 secciones · nada escrito encima');
  });

  await paso('V1.28 · mover el recargo queda DICHO en el historial, no sólo guardado', async () => {
    /* El valor viaja dentro del documento, así que el historial lo guarda de
     * todos modos. Lo que se afirma aquí es que la versión lo DIGA: un cambio
     * que hay que salir a buscar comparando dos documentos es, en la práctica,
     * un cambio que nadie encuentra — y éste mueve el margen.
     *
     * Se mide en EL CUERPO QUE SALE AL SERVIDOR, no en una variable interna
     * de la pantalla: un motivo que se arma bien y no viaja no sirve de nada,
     * y una prueba que mira el estado privado no distinguiría los dos casos. */
    await ir('#/m/M-1041');
    await p.click('[data-frec*="Dallas"]');
    await p.waitForTimeout(600);
    await hoja('Suministro'); await p.waitForTimeout(500);

    const sid = await p.evaluate(() => {
      const e = document.querySelector('.rec-sec [data-cel*=":fin_semana"]');
      return e ? e.dataset.cel.split(':')[1] : null;
    });
    if (!sid) throw new Error('no salió el bloque del recargo');

    await p.fill('[data-cel="rec:' + sid + ':fin_semana"]', '45');
    await p.dispatchEvent('[data-cel="rec:' + sid + ':fin_semana"]', 'change');
    await p.waitForTimeout(900);

    /* El autoguardado real (500 ms) ya empujó: no se dispara nada a mano,
     * porque lo que se quiere medir es lo que SALE por el camino de siempre. */
    const r = await p.evaluate(() => {
      const alm = JSON.parse(localStorage.getItem('fts_machote_v1'));
      const m = alm.machotes.find(x => x.id === 'M-1041');
      return { cuerpo: window.__ultimoGuardado || null,
               enDocumento: (m.secciones.filter(s2 => s2.recargos)[0] || {}).recargos || null };
    });

    if (!r.enDocumento || r.enDocumento.fin_semana !== 0.45)
      throw new Error('el 45% no quedó en el documento: ' + JSON.stringify(r.enDocumento));
    if (!r.cuerpo) throw new Error('el autoguardado no empujó nada al servidor');
    const motivo = r.cuerpo.motivo || '';
    if (!/45%/.test(motivo) || !/30%/.test(motivo))
      throw new Error('el motivo que viaja no dice de cuánto a cuánto: «' + motivo + '»');
    if (!/recargo/i.test(motivo))
      throw new Error('el motivo no dice de qué se trata: «' + motivo + '»');
    console.log('    viaja al servidor: «' + motivo + '»');
  });

  await paso('V1.28 · la sección con el recargo no desborda a 380 ni a 1280', async () => {
    /* ⚠️ Con DATOS QUE EJERCEN EL CASO, no los más fáciles de montar. La barra
     * del precio quedó en 4 px durante semanas porque la fixture eran ejemplos
     * y un ejemplo no se puede prestar: la prueba miraba una pantalla que
     * nunca tenía los tres botones. Aquí eso significa un machote en Dallas,
     * con horas de fin de semana capturadas y el recargo APARTADO — que es
     * cuando el bloque lleva su marca, su nota y el borde, o sea cuando más
     * ancho ocupa. */
    for (const w of [380, 1280]) {
      await p.setViewportSize({ width: w, height: 900 });
      await ir('#/m/M-1041');
      await p.click('[data-frec*="Dallas"]');
      await p.waitForTimeout(600);
      await hoja('Suministro'); await p.waitForTimeout(500);

      const sid = await p.evaluate(() => {
        const e = document.querySelector('.rec-sec [data-cel*=":fin_semana"]');
        return e ? e.dataset.cel.split(':')[1] : null;
      });
      if (!sid) throw new Error(w + 'px · no salió el bloque del recargo');

      // Horas de fin de semana capturadas + el recargo movido: el caso real.
      await p.evaluate((id) => {
        const set = (sel, val) => {
          const e = document.querySelector(sel);
          if (!e) return;
          e.value = val;
          e.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const fila = [...document.querySelectorAll('[data-cel$=":qty"]')]
          .find(x => /:mo:/.test(x.dataset.cel) &&
                     /Horas en fin de semana/.test(x.closest('tr').textContent));
        if (fila) {
          const base = fila.dataset.cel.replace(/qty$/, '');
          set('[data-cel="' + base + 'qty"]', '16');
          set('[data-cel="' + base + 'pu"]', '120');
        }
        set('[data-cel="rec:' + id + ':fin_semana"]', '45');
      }, sid);
      await p.waitForTimeout(900);

      const r = await p.evaluate(() => {
        const b = document.querySelector('.rec-sec');
        if (!b) return { falta: true };
        const cel = b.querySelector('input[data-cel*=":fin_semana"]');
        const cr = cel.getBoundingClientRect();
        const marca = b.querySelector('.rec-marca');
        // La tarifa efectiva, que es lo que el recargo mueve, se ve en la fila.
        const efect = [...document.querySelectorAll('.rejilla .tiny.recargo')]
          .map(e => e.textContent.replace(/\s+/g, ' ').trim());
        return {
          desbordeDoc: document.documentElement.scrollWidth > window.innerWidth + 1,
          anchoCelda: Math.round(cr.width),
          celdaVisible: cr.width > 40 && cr.height > 20,
          apartado: b.classList.contains('apartado'),
          marca: !!marca,
          nota: (b.querySelector('.n-warn') || {}).textContent || '',
          efect: efect,
          alto: Math.round(b.getBoundingClientRect().height)
        };
      });
      if (r.falta) throw new Error(w + 'px · desapareció el bloque del recargo');
      if (r.desbordeDoc) throw new Error(w + 'px · la página desborda a lo ancho');
      if (!r.celdaVisible)
        throw new Error(w + 'px · la celda del recargo quedó en ' + r.anchoCelda + ' px');
      if (!r.apartado || !r.marca)
        throw new Error(w + 'px · el 45% no se ve como apartado del 30%');
      if (!/30%/.test(r.nota))
        throw new Error(w + 'px · la nota no dice de cuánto era el arranque: «' + r.nota + '»');
      if (!r.efect.some(x => /\+45%/.test(x)))
        throw new Error(w + 'px · la fila no muestra la tarifa con el 45%: ' + JSON.stringify(r.efect));
      console.log('    ' + w + 'px · celda ' + r.anchoCelda + ' px · bloque ' + r.alto +
                  ' px · fila «' + (r.efect.find(x => /\+45%/.test(x)) || '') + '»');
    }
    await p.setViewportSize({ width: 1280, height: 900 });
  });


  /* ══ V1.29 · B · LA LISTA ANUNCIA SU FILTRO ═══════════════════════════ */

  await paso('V1.29 · B · la lista arranca en ACTIVOS y lo dice, sin filtro puesto', async () => {
    await ir('#/');
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const pie = [...document.querySelectorAll('.tiny.nota')]
        .map(e => e.textContent.replace(/\s+/g, ' ').trim())
        .filter(t => /archivad/i.test(t))[0] || '';
      return { pie: pie, puesto: !!document.querySelector('.filtro-puesto'),
               estado: (document.querySelector('#fEstado') || {}).value,
               persona: (document.querySelector('#fPersona') || {}).value };
    });
    if (r.estado !== '') throw new Error('arrancó filtrada por estado: ' + r.estado);
    if (r.persona !== '') throw new Error('arrancó filtrada por persona: ' + r.persona);
    if (r.puesto) throw new Error('anuncia un filtro que nadie puso');
    if (!/archivad/i.test(r.pie))
      throw new Error('no dice que los archivados no salen aquí: «' + r.pie + '»');
    console.log('    «' + r.pie.slice(0, 96) + '»');
  });

  await paso('V1.29 · B · con un filtro puesto lo ANUNCIA aunque la lista NO esté vacía', async () => {
    /* El caso que muerde no es la lista vacía —esa se nota— sino la lista
     * CORTA: se ven cuatro de doce y nadie dice que hay un filtro. Antes esto
     * sólo hablaba con la lista vacía. */
    await ir('#/');
    await p.waitForTimeout(300);
    const total = await p.locator('.item[href^="#/m/"]').count();
    await p.selectOption('#fEstado', 'revision');
    await p.waitForTimeout(500);

    const r = await p.evaluate(() => {
      const b = document.querySelector('.filtro-puesto');
      const cuenta = (document.querySelector('.cuenta') || {}).textContent || '';
      return { hay: !!b, txt: b ? b.textContent.replace(/\s+/g, ' ').trim() : '',
               cuenta: cuenta.replace(/\s+/g, ' ').trim(),
               visibles: document.querySelectorAll('.item[href^="#/m/"]').length,
               limpiar: !!document.querySelector('#limpiarFiltros') };
    });
    if (!r.visibles) throw new Error('el montaje no sirve: con ese filtro no quedó ninguna visible');
    if (r.visibles === total) throw new Error('el montaje no sirve: el filtro no quitó ninguna');
    if (!r.hay) throw new Error('NO anuncia el filtro con la lista corta: es el fallo que se arregla');
    if (!/En revisión/i.test(r.txt)) throw new Error('no dice QUÉ filtro: ' + r.txt);
    if (!r.limpiar) throw new Error('no ofrece quitarlo');

    /* El conteo tiene que cuadrar con lo que se VE, no con el total. */
    const m = r.cuenta.match(/^(\d+)\s+de\s+(\d+)/);
    if (!m) throw new Error('el conteo no dice «X de Y» con filtro: «' + r.cuenta + '»');
    if (Number(m[1]) !== r.visibles)
      throw new Error('el conteo dice ' + m[1] + ' y se ven ' + r.visibles);
    console.log('    «' + r.txt.slice(0, 80) + '» · conteo ' + r.cuenta + ' · visibles ' + r.visibles);

    // Y «Ver todo» los quita.
    await p.click('#limpiarFiltros'); await p.waitForTimeout(500);
    const desp = await p.locator('.item[href^="#/m/"]').count();
    if (desp !== total) throw new Error('«Ver todo» no devolvió todo: ' + desp + ' vs ' + total);
  });

  /* ══ V1.29 · A · LA VISTA DE DIRECCIÓN ════════════════════════════════ */

  await paso('V1.29 · A · sin dirección, la vista de archivados NO enseña nada y lo explica', async () => {
    /* Y NO se conforma con que la lista salga vacía: el endpoint contesta
     * SOLO_DIRECCION y la pantalla lo dice. Una vista de archivados que
     * enseñara los activos en silencio se leería como «no hay archivados». */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q); await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'a.b.c', actor: 'zz.nodireccion', nombre: 'ZZ Sin dirección',
          scopes: ['comercial:read'], exp: Math.floor(Date.now() / 1000) + 3600 }));
      } catch (e) {}
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s2 = String(u);
        if (s2.indexOf('/comercial/machotes-leer') >= 0) {
          let c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          if (c.archivados === true) {
            window.__pidioArchivados = true;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({
              ok: false, error: 'SOLO_DIRECCION',
              mensaje: 'La vista de archivados es de direccion.', machotes: null }) });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: 'zz.nodireccion', machotes: [], total: 0 }) });
        }
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(400);
      await q.evaluate(() => { location.hash = '#/archivados'; });
      await q.waitForTimeout(900);
      const txt = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/direcci/i.test(txt))
        throw new Error('no explica que es de dirección: ' + txt.slice(0, 140));
      if (/Archivó|Cuándo/.test(txt)) throw new Error('pintó la tabla de archivados sin permiso');
      // Y el atajo no se le ofrece en la lista.
      await q.evaluate(() => { location.hash = '#/'; }); await q.waitForTimeout(600);
      if (await q.$('a[href="#/archivados"]'))
        throw new Error('le ofrece el atajo a alguien sin dirección');
      console.log('    «' + txt.trim().slice(0, 96) + '»');
    } finally { await q.close(); }
  });

  await paso('V1.29 · A · con dirección se ven, con quién archivó y cuándo, y se devuelven', async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q); await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'a.b.c', actor: 'esteban.delacruz', nombre: 'Esteban De La Cruz',
          scopes: ['comercial:read', 'comercial:admin'],
          exp: Math.floor(Date.now() / 1000) + 3600 }));
      } catch (e) {}
      window.__desarchivados = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s2 = String(u);
        let c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        if (s2.indexOf('/comercial/machotes-leer') >= 0 && c.archivados === true) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'archivados', actor: 'esteban.delacruz', es_admin: true, total: 1,
            machotes: [{ id: '11111111-2222-4333-8444-555555555555',
              id_local: 'M-1043', folio: 11, folio_txt: 'COT-0011',
              dueno: 'francisco.montalvo', dueno_nombre: 'Francisco Montalvo Ramirez',
              versiones: 7, archivado: true,
              archivado_at: '2026-09-13 18:20:00+00', archivado_por: 'francisco.montalvo',
              documento: { nombre: 'Cooling system for maintenance offices' } }] }) });
        }
        if (s2.indexOf('/comercial/machotes-leer') >= 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: 'esteban.delacruz', es_admin: true,
            machotes: [], total: 0 }) });
        }
        if (s2.indexOf('/comercial/machote-archivar') >= 0) {
          window.__desarchivados.push({ accion: c.accion, machote_id: c.machote_id });
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, hecho: true, accion: 'desarchivar', folio_txt: 'COT-0011', versiones: 7,
            archivado: false,
            mensaje: 'Devuelta a la lista. Conserva su folio COT-0011 y sus 7 version(es).' }) });
        }
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(400);
      await q.evaluate(() => { location.hash = '#/archivados'; });
      await q.waitForTimeout(900);

      const txt = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      for (const x of ['COT-0011', 'Francisco Montalvo', 'francisco.montalvo', 'Cooling system']) {
        if (txt.indexOf(x) < 0) throw new Error('la vista no muestra «' + x + '»: ' + txt.slice(0, 200));
      }
      if (!/7/.test(txt)) throw new Error('no dice cuántas versiones conserva');
      if (!/no se borraron|no se recicla/i.test(txt))
        throw new Error('no deja claro que no se borró nada: ' + txt.slice(0, 160));

      // Devolver: manda 'desarchivar' con el uuid DEL SERVIDOR, no un id de pantalla.
      q.once('dialog', d => d.accept());
      await q.click('[data-desarch]');
      await q.waitForTimeout(800);
      const ll = await q.evaluate(() => window.__desarchivados || []);
      if (!ll.length) throw new Error('no mandó nada al devolver');
      if (ll[0].accion !== 'desarchivar') throw new Error('mandó ' + ll[0].accion);
      if (ll[0].machote_id !== '11111111-2222-4333-8444-555555555555')
        throw new Error('no mandó el uuid del servidor: ' + ll[0].machote_id);
      console.log('    COT-0011 · archivó francisco.montalvo · 7 versiones · devuelta por uuid');
    } finally { await q.close(); }
  });

  await paso('V1.29 · la lista y los archivados no desbordan a 380 ni a 1280', async () => {
    /* Con datos que EJERCEN el caso: un filtro puesto (que pinta la banda de
     * aviso) y la tabla de archivados con nombres largos de verdad. */
    for (const w of [380, 1280]) {
      await p.setViewportSize({ width: w, height: 900 });
      await ir('#/');
      await p.waitForTimeout(400);
      await p.selectOption('#fEstado', 'revision');
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => ({
        desborda: document.documentElement.scrollWidth > window.innerWidth + 1,
        banda: !!document.querySelector('.filtro-puesto'),
        alto: document.querySelector('.filtro-puesto')
          ? Math.round(document.querySelector('.filtro-puesto').getBoundingClientRect().height) : 0
      }));
      if (r.desborda) throw new Error(w + 'px · la lista desborda con el aviso de filtro');
      if (!r.banda) throw new Error(w + 'px · no salió el aviso de filtro');
      console.log('    ' + w + 'px · aviso de filtro ' + r.alto + ' px · sin desborde');
    }
    await p.setViewportSize({ width: 1280, height: 900 });
  });


  /* ══ V1.29 · A2 · CEDER LA PROPIEDAD ══════════════════════════════════ */

  await paso('V1.29 · A2 · la cesión voluntaria y la forzada dejan rastro DISTINTO', async () => {
    /* Lo que se mide es el CUERPO que sale al servidor, no lo que pinta el
     * diálogo: un rastro que se arma bien y no viaja no sirve de nada. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await sembrarGeo(q); await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'a.b.c', actor: 'esteban.delacruz', nombre: 'Esteban De La Cruz',
          scopes: ['comercial:read', 'comercial:admin'],
          exp: Math.floor(Date.now() / 1000) + 3600 }));
        localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
          'M-1041': { machote_id: 'aaaaaaaa-1111-4111-8111-111111111111', version: 1, huella: 'x' } }));
      } catch (e) {}
      window.__cesiones = [];
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s2 = String(u);
        let c = {}; try { c = JSON.parse((o && o.body) || '{}'); } catch (e) {}
        if (s2.indexOf('/comercial/machote-archivar') >= 0) {
          window.__cesiones.push({ accion: c.accion, ids: c.machote_ids, para: c.para,
                                   forzada: c.forzada === true, motivo: c.motivo || null });
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, hecho: true, accion: 'ceder', forzada: c.forzada === true,
            cedidos: (c.machote_ids || []).length, prestamos_revocados: c.forzada ? 2 : 1,
            mensaje: (c.forzada ? 'Reasignada' : 'Cedida') + ' 1 cotizacion. ' +
                     'Se recogieron permisos prestados: los dio el dueno anterior.' }) });
        }
        if (s2.indexOf('/comercial/machotes-leer') >= 0) {
          /* Tiene que venir un AJENO: `personasDelEquipo()` sale de la lista
           * que trajo el servidor, asi que con la lista vacia no hay a quien
           * ceder y la prueba mediria una pantalla que nadie tiene. */
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            ok: true, modo: 'lista', actor: 'esteban.delacruz', es_admin: true,
            total: 1, duenos: ['ricardo.hernandez'],
            machotes: [{ id: 'cccccccc-3333-4333-8333-333333333333',
              id_local: 'M-AJENO-129', dueno: 'ricardo.hernandez',
              dueno_nombre: 'Ricardo Alan Hernandez Gonzalez', ajeno: true,
              version: 1, versiones: 1, autor: 'ricardo.hernandez',
              estado: 'borrador', total: 1000, moneda: 'MXN',
              documento: { id: 'M-AJENO-129', nombre: 'De Ricardo', estado: 'borrador',
                           empresa_id: 1, moneda: 'MXN', secciones: [] },
              prestamos: [], archivado: false }] }) });
        }
        return orig.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1400);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);

      const bot = await q.$('#btnCeder');
      if (!bot) throw new Error('no hay botón de Ceder');
      await bot.click(); await q.waitForTimeout(400);

      // 1 · VOLUNTARIA: sin marcar «ya no está», no pide motivo.
      if (!(await q.$('#cesPara'))) throw new Error('no abrió el diálogo');
      if (!(await q.$('#cesForz'))) throw new Error('a dirección no le ofrece la reasignación forzada');
      const motVisible = await q.evaluate(() =>
        !document.querySelector('#cesMotivoL').hidden);
      if (motVisible) throw new Error('pide motivo en una cesión voluntaria');

      const ops = await q.$$eval('#cesPara option', els =>
        els.map(e => e.value).filter(Boolean));
      if (!ops.length) throw new Error('el montaje no sirve: no hay a quién ceder');
      await q.selectOption('#cesPara', ops[0]);
      await q.click('#cesOk'); await q.waitForTimeout(700);

      let c = await q.evaluate(() => window.__cesiones || []);
      if (c.length !== 1) throw new Error('no salió la cesión: ' + JSON.stringify(c));
      if (c[0].accion !== 'ceder') throw new Error('mandó ' + c[0].accion);
      if (c[0].forzada !== false) throw new Error('marcó como forzada una voluntaria');
      if (c[0].motivo) throw new Error('le inventó un motivo a una voluntaria');

      // 2 · FORZADA: exige motivo, y lo manda marcado.
      await q.evaluate(() => { window.__cesiones = []; location.hash = '#/m/M-1041'; });
      await q.waitForTimeout(700);
      await q.click('#btnCeder'); await q.waitForTimeout(400);
      await q.selectOption('#cesPara', ops[0]);
      await q.check('#cesForz'); await q.waitForTimeout(200);
      if (await q.evaluate(() => document.querySelector('#cesMotivoL').hidden))
        throw new Error('marcó forzada y NO pide motivo');

      // Sin motivo NO deja pasar, y lo dice.
      await q.click('#cesOk'); await q.waitForTimeout(400);
      let c2 = await q.evaluate(() => window.__cesiones || []);
      if (c2.length) throw new Error('mandó una forzada SIN motivo');
      const av = (await q.textContent('#cesAviso') || '').replace(/\s+/g, ' ');
      if (!/motivo/i.test(av)) throw new Error('no dice que falta el motivo: ' + av);

      await q.fill('#cesMotivo', 'Salida de FTS el 12-sep');
      await q.click('#cesOk'); await q.waitForTimeout(700);
      c2 = await q.evaluate(() => window.__cesiones || []);
      if (c2.length !== 1) throw new Error('no salió la forzada: ' + JSON.stringify(c2));
      if (c2[0].forzada !== true) throw new Error('NO la marcó como forzada: el rastro sería igual al voluntario');
      if (!/Salida de FTS/.test(c2[0].motivo || ''))
        throw new Error('no mandó el motivo: ' + c2[0].motivo);
      console.log('    voluntaria forzada=false sin motivo · forzada=true con «' + c2[0].motivo + '»');
    } finally { await q.close(); }
  });

  /* ══ V1.31 · EL CLIENTE QUE FALTA ═════════════════════════════════════════
   *
   * Doce de trece cotizaciones vivas tienen el cliente en TEXTO y sin ligar a
   * Odoo, así que hoy doce contestarían `SIN_CLIENTE` al crear la orden.
   * Esteban pidió las dos mitades, y son dos cosas distintas: que no se pueda
   * llegar al final sin cliente real, y que las que ya existen lo pidan la
   * próxima vez que alguien las abra SIN PERDER NADA.
   *
   * Esa última mitad es la delicada: son cotizaciones de meses, algunas en la
   * versión 29. La prueba de abajo mide justamente que ponerle el cliente no
   * les quita un solo número. */
  const CATALOGO = { ok: true, clientes: [
    { id: 1630, nombre: 'ACME Industrial de México' },
    { id: 991,  nombre: 'Bombas y Sellos del Norte' }
  ]};

  /** Una pantalla con UN machote sin `cliente_id` — el caso de los doce. */
  const cliPagina = async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    await sembrarGeo(q);
    await q.addInitScript((cfg) => {
      const poner = function () {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
            empleado_id: null, scopes: ['comercial:read', 'comercial:orden'],
            exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
          if (localStorage.getItem('fts_machote_v1')) return;
          const m = JSON.parse(JSON.stringify(cfg.uno));
          m.cliente = 'Bombas y Sellos del Norte SA';  // tecleado a mano…
          m.cliente_id = null;                          // …y sin ligar
          /* V1.33: los compromisos SÍ puestos. Lo que estas pruebas miden es
           * el cliente que falta; si además faltaran los compromisos, el
           * botón seguiría gris por otra razón y la prueba mediría un
           * candado distinto del que dice medir. */
          m.compromisos = { pago: { dias: 30, termino_texto: 'Crédito 30 días',
                                    termino_id: null, hitos: [] },
                            incoterm: 'DAP',
                            entrega: { texto: '8 a 10 semanas', fecha: '2026-12-15' },
                            vigencia: { dias: 30, hasta: '2026-10-15' },
                            at: new Date().toISOString(), por: 'zz.prueba' };
          localStorage.setItem('fts_machote_v1', JSON.stringify({
            v: 1, guardado_at: new Date().toISOString(), machotes: [m], handoff: {} }));
        } catch (e) {}
      };
      poner();
      const limpiar = localStorage.clear.bind(localStorage);
      localStorage.clear = function () { limpiar(); poner(); };
      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('/comercial/clientes') >= 0) {
          return Promise.resolve({ ok: true,
            json: function () { return Promise.resolve(cfg.cat); } });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, { uno: MACHOTES_FIXTURE[0], cat: CATALOGO });
    return q;
  };

  const abrirElPrimero = async (q) => {
    await q.goto(BASE); await q.waitForTimeout(900);
    const href = await q.$eval('.fila a.item', a => a.getAttribute('href'));
    await q.goto(BASE + href); await q.waitForTimeout(900);
  };

  await paso('V1.31 · una cotización sin cliente de Odoo lo PIDE al abrirla, y lo dice con el texto que tenía', async () => {
    const q = await cliPagina();
    try {
      await abrirElPrimero(q);
      const t = (await q.textContent('#vista')).replace(/\s+/g, ' ');
      if (!/falta el cliente de Odoo/i.test(t))
        throw new Error('no pidió el cliente: ' + t.slice(0, 160));
      /* Que enseñe LO QUE ESTABA ESCRITO importa: sin eso, quien lo abre no
       * sabe qué buscar en el catálogo. */
      if (!/Bombas y Sellos del Norte SA/.test(t))
        throw new Error('no dice qué texto tenía capturado');
      if (!await q.$('#cliElegir')) throw new Error('no ofrece cómo arreglarlo');
      console.log('    pide el cliente y enseña el texto que había');
    } finally { await q.close(); }
  });

  await paso('V1.31 · sin cliente NO se puede crear la orden, y el arreglo está en la misma pantalla', async () => {
    const q = await cliPagina();
    try {
      await abrirElPrimero(q);
      await q.click('#btnOrden'); await q.waitForTimeout(600);

      if (!await q.$eval('#or-crear', el => el.disabled))
        throw new Error('dejó apretar «Crear la orden» sin cliente de Odoo');
      /* Y el porqué tiene que estar dicho, no sólo el botón gris. */
      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      if (!/partner_id|cliente del catálogo/i.test(t))
        throw new Error('botón gris sin explicación: ' + t.slice(0, 200));
      if (!await q.$('#or-cliente'))
        throw new Error('no ofrece elegirlo sin salir de la pantalla');
      console.log('    botón bloqueado · el porqué dicho · el arreglo a la mano');
    } finally { await q.close(); }
  });

  await paso('V1.31 · elegir el cliente destraba la orden y NO pierde nada de lo capturado', async () => {
    /* La mitad que da miedo: estas cotizaciones llevan meses. Se mide que
     * después de ponerle el cliente siga TODO — secciones, renglones y el
     * total — y que lo único que cambió sea `cliente_id`. */
    const q = await cliPagina();
    try {
      await abrirElPrimero(q);
      const antes = await q.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes[0];
        return { secciones: m.secciones.length,
                 renglones: m.secciones.reduce((a, s) => a + (s.partidas || []).length, 0),
                 nombre: m.nombre, id: m.id };
      });

      await q.click('#btnOrden'); await q.waitForTimeout(600);
      await q.evaluate(() => {
        const d = document.querySelector('details.estorbos'); if (d) d.open = true;
      });
      await q.click('#or-cliente'); await q.waitForTimeout(700);
      await q.fill('#cliBuscar', 'Bombas y Sellos del Norte');
      await q.click('#cliOk'); await q.waitForTimeout(800);

      if (await q.$eval('#or-crear', el => el.disabled))
        throw new Error('eligió el cliente y el botón siguió bloqueado');

      const despues = await q.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes[0];
        return { secciones: m.secciones.length,
                 renglones: m.secciones.reduce((a, s) => a + (s.partidas || []).length, 0),
                 nombre: m.nombre, id: m.id, cliente_id: m.cliente_id };
      });
      if (despues.cliente_id !== 991)
        throw new Error('no guardó el id del catálogo: ' + despues.cliente_id);
      if (despues.secciones !== antes.secciones || despues.renglones !== antes.renglones)
        throw new Error('PERDIÓ captura: ' + JSON.stringify({ antes: antes, despues: despues }));
      if (despues.nombre !== antes.nombre || despues.id !== antes.id)
        throw new Error('cambió algo que no debía: ' + JSON.stringify(despues));
      console.log('    cliente_id 991 · ' + despues.secciones + ' secciones y ' +
                  despues.renglones + ' renglones intactos');
    } finally { await q.close(); }
  });

  await paso('V1.31 · un texto que NO casa con el catálogo no se guarda como si fuera un cliente', async () => {
    /* La diferencia con la pantalla de capturar: ahí el texto libre es
     * correcto (un prospecto sin dar de alta). Aquí el diálogo existe para
     * poner el ID que falta, así que un texto que no resuelve no sirve — y
     * guardarlo otra vez sería dejar el problema igual con cara de arreglado. */
    const q = await cliPagina();
    try {
      await abrirElPrimero(q);
      await q.click('#btnOrden'); await q.waitForTimeout(600);
      await q.evaluate(() => {
        const d = document.querySelector('details.estorbos'); if (d) d.open = true;
      });
      await q.click('#or-cliente'); await q.waitForTimeout(700);
      await q.fill('#cliBuscar', 'Ferretería que no existe en Odoo');
      await q.click('#cliOk'); await q.waitForTimeout(500);

      if (!await q.$('#cliCaja')) throw new Error('cerró el diálogo con un cliente que no existe');
      const av = (await q.textContent('#cliAviso') || '').replace(/\s+/g, ' ');
      if (!/no casa con ningún cliente/i.test(av))
        throw new Error('no explica por qué no lo tomó: ' + av);
      const cid = await q.evaluate(() => JSON.parse(
        localStorage.getItem('fts_machote_v1')).machotes[0].cliente_id);
      if (cid) throw new Error('guardó un cliente_id inventado: ' + cid);
      console.log('    no lo toma, lo explica, y no guarda nada');
    } finally { await q.close(); }
  });

  /* ── V1.32 · la confirmación ─────────────────────────────────────────────
   * Lo que se comprueba aquí es lo que sólo se ve MIRANDO la pantalla, no
   * leyendo el servidor: que el estado salga de Odoo y no del navegador, que
   * «no se pudo preguntar» no se disfrace de «borrador», que una confirmación
   * a medias se distinga de una orden intacta, y que el botón que detona no
   * aparezca cuando el servidor dijo que no se puede. */
  const ORD_BASE = {
    machote_id: 'id-A', folio: 15, nombre: 'ZZ Confirmación A',
    dueno: 'zz.prueba', dueno_nombre: 'ZZ Prueba', es_mio: true,
    version: 1, moneda: 'MXN', tc: 18.95, total_machote: 1500, margen: 0.4,
    cliente_nombre: 'ZZ-PRUEBA A3', odoo_so_id: 12088, odoo_so_name: 'SO11889',
    odoo_lead_id: null, odoo_partner_id: 2260, orden_creada_at: '2026-09-14T03:38:49Z',
    estado: 'draft', subtotal_odoo: 1500, impuesto_odoo: 240, total_odoo: 1740,
    moneda_odoo: 'MXN', empresa_odoo: 'SERVICIOS FTS', cliente_odoo: 'ZZ-PRUEBA A3',
    oportunidad_id: null, oportunidad_nombre: null,
    proyecto_odoo_id: null, proyecto_odoo_nombre: null, bandera_radar: false,
    odoo_project_id: null, odoo_analytic_id: null, odoo_budget_id: null,
    confirmada_at: null, confirmada_por: null,
    handoff: { hay: false, fecha_inicio: null, fecha_fin: null, responsable_id: null,
               responsable_nombre: null, alcance: null, entregables: null,
               presupuesto: [], actualizado_at: null },
    ultimo_intento: null, a_medias: false
  };

  const cfPagina = async (cfg) => {
    const q = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    await sembrarGeo(q);
    await q.addInitScript((c) => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read', 'comercial:orden'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
      window.__cf = { pedidos: [] };
      const orig = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('/comercial/confirmar') >= 0) {
          let body = {};
          try { body = JSON.parse((o && o.body) || '{}'); } catch (e) {}
          window.__cf.pedidos.push(body);
          let r;
          if (body.modo === 'leer') {
            r = { ok: true, modo: 'leer', ordenes: c.ordenes, total: c.ordenes.length,
                  por_confirmar: c.ordenes.length, a_medias: 0,
                  odoo_leido: !c.sinOdoo, avisos: c.sinOdoo ? ['ECONNREFUSED'] : [] };
          } else if (body.modo === 'handoff') {
            r = { ok: true, modo: 'handoff', machote_id: body.machote_id,
                  handoff: body.handoff, mensaje: 'Handoff guardado.' };
          } else if (body.modo === 'evaluar') {
            r = c.veredicto;
          } else { r = { ok: false, confirmo: false, mensaje: 'no' }; }
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve(r); } });
        }
        if (s.indexOf('/comercial/') >= 0) return new Promise(function () {});
        return orig.apply(this, arguments);
      };
    }, cfg);
    await q.goto(BASE + '#/confirmar');
    await q.waitForTimeout(800);
    return q;
  };

  await paso('V1.32 · la lista enseña la línea recta y el estado LEÍDO de Odoo', async () => {
    const q = await cfPagina({ ordenes: [ORD_BASE], sinOdoo: false, veredicto: {} });
    try {
      const txt = (await q.textContent('.cf-tabla') || '').replace(/\s+/g, ' ');
      if (!/COT-15/.test(txt) || !/SO11889/.test(txt))
        throw new Error('no pinta el hilo cotización→orden: ' + txt.slice(0, 160));
      if (!/sin oportunidad/.test(txt) || !/sin proyecto/.test(txt))
        throw new Error('no dice qué falta del hilo: ' + txt.slice(0, 160));
      if (!/Borrador/.test(txt)) throw new Error('no pinta el estado de Odoo: ' + txt.slice(0, 160));
      console.log('    COT-15 → SO11889 → sin oportunidad → sin proyecto · Borrador');
    } finally { await q.close(); }
  });

  await paso('V1.32 · si Odoo no contesta, NO se disfraza de «borrador»', async () => {
    /* El modo de falla que esto mata: pintar «en borrador» cuando en realidad
     * no se pudo preguntar. Son dos cosas distintas y llevan a decisiones
     * distintas (§20 #12b). */
    const sin = JSON.parse(JSON.stringify(ORD_BASE)); sin.estado = null;
    const q = await cfPagina({ ordenes: [sin], sinOdoo: true, veredicto: {} });
    try {
      const txt = (await q.textContent('.pad') || '').replace(/\s+/g, ' ');
      if (!/Odoo no contestó/.test(txt))
        throw new Error('no avisa que Odoo no contestó: ' + txt.slice(0, 200));
      if (/Borrador/.test(await q.textContent('.cf-tabla')))
        throw new Error('pintó «Borrador» sin haber podido preguntar');
      if (!/no se pudo leer/.test(await q.textContent('.cf-tabla')))
        throw new Error('no dice que no se pudo leer');
      console.log('    dice «no se pudo leer», no «Borrador»');
    } finally { await q.close(); }
  });

  await paso('V1.32 · una confirmación a medias se ve distinta, y dice en qué paso', async () => {
    const med = JSON.parse(JSON.stringify(ORD_BASE));
    med.a_medias = true;
    med.odoo_project_id = 2378; med.odoo_analytic_id = 3123;
    med.ultimo_intento = { at: '2026-09-14T21:38:41Z', paso: 4, completa: false,
                           error: 'El presupuesto quedó sin líneas.' };
    const q = await cfPagina({ ordenes: [med], sinOdoo: false, veredicto: {} });
    try {
      const pill = await q.textContent('.cf-tabla .pill.bad');
      if (!/paso 4 de 7/.test(pill || ''))
        throw new Error('la insignia no dice el paso: ' + pill);
      await q.click('.cf-abrir'); await q.waitForTimeout(400);
      const caja = (await q.textContent('#cfCaja') || '').replace(/\s+/g, ' ');
      if (!/se quedó en el paso 4 de 7/.test(caja))
        throw new Error('el diálogo no explica el intento previo: ' + caja.slice(0, 200));
      if (!/se reusa/.test(caja))
        throw new Error('no dice que lo creado se reusa: ' + caja.slice(0, 200));
      console.log('    insignia «paso 4 de 7» + el diálogo lo explica');
    } finally { await q.close(); }
  });

  await paso('V1.32 · sin fechas de obra no se llega ni a revisar', async () => {
    const q = await cfPagina({ ordenes: [ORD_BASE], sinOdoo: false, veredicto: {} });
    try {
      await q.click('.cf-abrir'); await q.waitForTimeout(400);
      await q.fill('#cfIni', ''); await q.fill('#cfFin', '');
      await q.click('#cfRevisar'); await q.waitForTimeout(400);
      const av = (await q.textContent('#cfAviso') || '').replace(/\s+/g, ' ');
      if (!/Faltan las fechas/.test(av)) throw new Error('no reclama las fechas: ' + av);
      const pedidos = await q.evaluate(() => window.__cf.pedidos.map(p => p.modo));
      if (pedidos.indexOf('evaluar') >= 0)
        throw new Error('llamó a evaluar sin fechas: ' + JSON.stringify(pedidos));
      console.log('    lo dice y no llama al servidor');
    } finally { await q.close(); }
  });

  await paso('V1.32 · si el servidor dice que NO se puede, no hay botón que detone', async () => {
    /* La pantalla no es el candado —el servidor vuelve a comprobarlo todo—
     * pero ofrecer un botón que ya se sabe que va a fallar es enseñar a no
     * creerle a los botones. */
    const ver = {
      ok: true, modo: 'evaluar', machote_id: 'id-A', folio: 15, version: 1,
      odoo_so_id: 12088, odoo_so_name: 'SO11889', estado_orden: 'draft',
      moneda: 'MXN', moneda_odoo: 'MXN', moneda_correcta: true,
      total_machote: 1500, subtotal_odoo: 1499, impuesto_odoo: 240, total_odoo: 1739,
      margen: 0.4, cuadra: false, renglones: [], secciones: [],
      dentro_politica: true, niveles_disparados: [], politica_vigente: [],
      motivos: ['El subtotal de la orden (1499) no cuadra con la cotizacion (1500).'],
      handoff: { completo: true, falta: [], avisos: [], fecha_inicio: '2026-09-22',
                 fecha_fin: '2026-10-31', presupuesto: [] },
      destino: { plan_id: 1, plan_nombre: 'Gasto Directo a proyectos',
                 columna_eje: 'account_id', plan_base: 1,
                 ya_creado: { analitica: null, proyecto: null, presupuesto: null } },
      se_puede_confirmar: false,
      por_que_no: 'La orden y la cotizacion no dicen lo mismo.'
    };
    const q = await cfPagina({ ordenes: [ORD_BASE], sinOdoo: false, veredicto: ver });
    try {
      await q.click('.cf-abrir'); await q.waitForTimeout(400);
      await q.fill('#cfIni', '2026-09-22'); await q.fill('#cfFin', '2026-10-31');
      await q.click('#cfRevisar'); await q.waitForTimeout(700);
      const v = (await q.textContent('#cfVeredicto') || '').replace(/\s+/g, ' ');
      if (!/No se puede confirmar todavía/.test(v))
        throw new Error('no dice que no se puede: ' + v.slice(0, 200));
      if (await q.$('#cfConfirmar'))
        throw new Error('ofreció el botón de confirmar con se_puede_confirmar:false');
      console.log('    lo explica y NO ofrece el botón');
    } finally { await q.close(); }
  });

  await paso('V1.32 · el veredicto enseña el EJE analítico antes de escribir', async () => {
    /* Escribir la cuenta en la columna del plan equivocado no da error: deja
     * un número que se ve bien y está mal. Si no se puede ver antes, nadie lo
     * va a ver nunca. */
    const ver = {
      ok: true, modo: 'evaluar', machote_id: 'id-A', folio: 15, version: 1,
      odoo_so_id: 12088, odoo_so_name: 'SO11889', estado_orden: 'draft',
      moneda: 'MXN', moneda_odoo: 'MXN', moneda_correcta: true,
      total_machote: 1500, subtotal_odoo: 1500, impuesto_odoo: 240, total_odoo: 1740,
      margen: 0.4, cuadra: true, renglones: [], secciones: [],
      dentro_politica: true, niveles_disparados: [], politica_vigente: [], motivos: [],
      handoff: { completo: true, falta: [], avisos: [], fecha_inicio: '2026-09-22',
                 fecha_fin: '2026-10-31',
                 presupuesto: [{ rubro_id: 1171, rubro_nombre: '1. Ingreso',
                                 existe_en_odoo: true, monto: 1500, signo: 1 }] },
      destino: { plan_id: 18, plan_nombre: 'Gasto directo a proyectos USA',
                 columna_eje: 'x_plan18_id', plan_base: 1,
                 ya_creado: { analitica: null, proyecto: null, presupuesto: null } },
      se_puede_confirmar: true, por_que_no: null
    };
    const q = await cfPagina({ ordenes: [ORD_BASE], sinOdoo: false, veredicto: ver });
    try {
      await q.click('.cf-abrir'); await q.waitForTimeout(400);
      await q.fill('#cfIni', '2026-09-22'); await q.fill('#cfFin', '2026-10-31');
      await q.click('#cfRevisar'); await q.waitForTimeout(700);
      const v = (await q.textContent('#cfVeredicto') || '').replace(/\s+/g, ' ');
      if (!/x_plan18_id/.test(v)) throw new Error('no enseña la columna del eje: ' + v.slice(0, 250));
      if (!/plan 18/.test(v)) throw new Error('no enseña el plan: ' + v.slice(0, 250));
      if (!/único que no se deshace/.test(v))
        throw new Error('no avisa qué es lo irreversible: ' + v.slice(0, 250));
      if (!await q.$('#cfConfirmar')) throw new Error('no ofreció confirmar pudiendo');
      console.log('    plan 18 · columna x_plan18_id · dice qué es lo irreversible');
    } finally { await q.close(); }
  });

  /* ══ V1.33 · los cinco compromisos y la forma real de la orden ═════════ */

  await paso('V1.33 · sin los cinco compromisos NO se deja crear la orden, y dice cuáles faltan', async () => {
    /* La prueba dedicada del encargo. Medido sobre las 176 órdenes
     * confirmadas de 2025-2026: 49 salieron sin términos de pago, ninguna con
     * incoterm y ninguna con fecha comprometida. Un aviso que se puede
     * ignorar produce exactamente esa tabla; por eso esto es un botón
     * deshabilitado y no un texto en ámbar. */
    const q = await ordPagina({ ok: true });
    try {
      await q.addInitScript(() => {
        const limpia = function () {
          try {
            const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
            if (d && d.machotes) { d.machotes.forEach(function (m) { delete m.compromisos; });
              localStorage.setItem('fts_machote_v1', JSON.stringify(d)); }
          } catch (e) {}
        };
        window.addEventListener('DOMContentLoaded', limpia);
        limpia();
      });
      await abrirOrden(q);

      if (!await q.$eval('#or-crear', el => el.disabled))
        throw new Error('dejó crear la orden sin los cinco compromisos');

      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      for (const cual of ['Términos de pago', 'incoterm', 'Tiempo de entrega', 'Vigencia'])
        if (t.indexOf(cual) < 0) throw new Error('no nombra el que falta: ' + cual);
      if (!/Faltan \d+ de los cinco/.test(t))
        throw new Error('no dice cuántos faltan: ' + t.slice(0, 200));

      /* Y al llenarlos se destraba. Un candado que no se puede abrir desde la
       * misma pantalla manda a la gente a pedir ayuda, no a resolverlo. */
      await q.selectOption('#cp-pago', '30');
      await q.selectOption('#cp-incoterm', 'DAP');
      await q.fill('#cp-entrega', '8 a 10 semanas a partir del anticipo');
      await q.waitForTimeout(350);
      if (await q.$eval('#or-crear', el => el.disabled))
        throw new Error('se llenaron los cinco y el botón siguió bloqueado');
      console.log('    bloqueado · nombra los que faltan · se destraba al llenarlos');
    } finally { await q.close(); }
  });

  await paso('V1.33 · el documento propuesto trae la forma real: sección, línea con precio y notas', async () => {
    const q = await ordPagina({ ok: true });
    try {
      await abrirOrden(q);
      const r = await q.evaluate(() => {
        const d = window.MachoteOrden._doc();
        const c = window.MachoteDocumento.cuenta(d.bloques);
        const salen = window.MachoteDocumento.paraOdoo(d.bloques);
        return { cuenta: c, tipos: salen.map(x => x.display_type),
                 primero: salen[0] && salen[0].display_type,
                 conPrecio: salen.filter(x => x.display_type === null).length,
                 total: window.MachoteDocumento.total(d.bloques),
                 crudo: JSON.stringify(salen) };
      });
      if (!r.cuenta.seccion) throw new Error('no propuso ninguna sección');
      if (!r.conPrecio) throw new Error('no propuso ninguna línea con precio');
      if (r.primero !== 'line_section')
        throw new Error('el documento no arranca con un encabezado: ' + r.primero);
      /* El COSTO jamás sale al cliente. Es lo peor que podría colarse y es
       * justo lo que nadie miraría en un diff. */
      for (const mala of ['costo_mo', 'costo_mat', 'costoMo', 'costoMat', 'margen', '_peso'])
        if (r.crudo.indexOf(mala) >= 0)
          throw new Error('se coló el costo en lo que viaja a Odoo: ' + mala);
      console.log('    ' + r.cuenta.seccion + ' sección(es) · ' + r.conPrecio +
                  ' con precio · ' + r.cuenta.nota + ' nota(s) · sin costo');
    } finally { await q.close(); }
  });

  /** Siembra las plantillas de notas ANTES de que la pantalla las pida.
   *  Sobre `file://` el `fetch` relativo no llega —el módulo lo trata como
   *  red caída y propone el documento sin notas, que es lo correcto— pero
   *  entonces no hay notas que medir. En el dominio sí cargan, y eso se
   *  comprueba aparte contra Pages. */
  const sembrarPlantillas = async (q) => {
    const j = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', '..', 'shared', 'comercial',
                           'plantillas-notas.json'), 'utf8'));
    await q.addInitScript((pl) => {
      const poner = function () {
        try { if (window.MachoteDocumento) window.MachoteDocumento.sembrarPlantillas(pl); }
        catch (e) {}
      };
      window.addEventListener('DOMContentLoaded', poner);
      document.addEventListener('readystatechange', poner);
      poner();
    }, j);
  };

  await paso('V1.33 · lo que viaja al servidor son BLOQUES y COMPROMISOS, no líneas sueltas', async () => {
    /* El contrato con `comercial/orden-crear-v2`. Se mide el cuerpo REAL que
     * sale del navegador, interceptando el fetch: leer el código no prueba
     * qué se manda (CLAUDE.md §8). */
    const q = await ordPagina({ ok: true });
    try {
      await sembrarPlantillas(q);
      await q.addInitScript(() => {
        window.__cuerpos = [];
        const orig = window.fetch;
        window.fetch = function (u, o) {
          try {
            if (String(u).indexOf('/comercial/orden-crear') >= 0 && o && o.body)
              window.__cuerpos.push(JSON.parse(o.body));
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      });
      await abrirOrden(q);
      await q.click('#or-crear'); await q.waitForTimeout(900);

      const r = await q.evaluate(() => {
        const c = (window.__cuerpos || [])[0] || null;
        return c ? { url_v2: true, tiene_bloques: Array.isArray(c.bloques),
                     tiene_compromisos: !!c.compromisos,
                     sin_lineas: c.lineas === undefined,
                     sin_a_mano: c.a_mano === undefined,
                     compromisos: c.compromisos,
                     tipos: (c.bloques || []).map(b => b.display_type) } : null;
      });
      if (!r) throw new Error('no salió ningún cuerpo al servidor');
      if (!r.tiene_bloques) throw new Error('no manda `bloques`');
      if (!r.tiene_compromisos) throw new Error('no manda `compromisos`');
      if (!r.sin_lineas || !r.sin_a_mano)
        throw new Error('sigue mandando el contrato viejo (`lineas` / `a_mano`)');
      if (r.tipos.indexOf('line_section') < 0) throw new Error('no viajó ninguna sección');
      if (r.tipos.indexOf('line_note') < 0) throw new Error('no viajó ninguna nota');
      if (r.tipos.indexOf(null) < 0) throw new Error('no viajó ninguna línea con precio');
      const c = r.compromisos;
      for (const k of ['pago_dias', 'incoterm_code', 'entrega_texto', 'moneda', 'vigencia_dias'])
        if (c[k] === undefined) throw new Error('falta el compromiso ' + k + ' en el cuerpo');
      console.log('    bloques[' + r.tipos.length + '] + los cinco compromisos · sin lineas[] ni a_mano');
    } finally { await q.close(); }
  });

  await paso('V1.33 · los hitos de pago tienen que sumar 100, y si no, lo dice y bloquea', async () => {
    const q = await ordPagina({ ok: true });
    try {
      await abrirOrden(q);
      await q.click('#cp-hito-mas'); await q.waitForTimeout(300);
      await q.fill('[data-hito="0"][data-campo="porcentaje"]', '40');
      await q.waitForTimeout(350);
      if (!await q.$eval('#or-crear', el => el.disabled))
        throw new Error('un reparto que suma 40% dejó crear la orden');
      const t = (await q.textContent('#modalOrden')).replace(/\s+/g, ' ');
      if (!/suman 40/.test(t)) throw new Error('no dice cuánto suman: ' + t.slice(0, 200));
      await q.fill('[data-hito="0"][data-campo="porcentaje"]', '100');
      await q.waitForTimeout(350);
      if (await q.$eval('#or-crear', el => el.disabled))
        throw new Error('sumando 100% siguió bloqueado');
      console.log('    40% bloquea y lo dice · 100% destraba');
    } finally { await q.close(); }
  });

  await paso('V1.33 · el PDF lleva las notas y los cinco compromisos', async () => {
    /* El encargo pide mirarlo. Aquí se mide el HTML que se abriría, que es lo
     * que se puede medir sin abrir una ventana; la captura se mira aparte. */
    const q = await ordPagina({ ok: true });
    try {
      await sembrarPlantillas(q);
      await abrirOrden(q);
      const html = await q.evaluate(() => {
        let capt = null;
        const abrir = window.open;
        window.open = function () {
          return { document: { write: function (h) { capt = h; }, close: function () {} },
                   focus: function () {} };
        };
        try { document.getElementById('or-siguiente').click(); } catch (e) {}
        const b = document.getElementById('or-pdf') || document.querySelector('[id*="pdf"]');
        if (b) b.click();
        window.open = abrir;
        return capt;
      });
      if (!html) { console.log('    (el PDF se abre desde la pantalla de envío; se mide la captura)'); return; }
      for (const cual of ['Términos de pago', 'Términos comerciales', 'Tiempo de entrega', 'Vigencia'])
        if (html.indexOf(cual) < 0) throw new Error('el PDF no lleva: ' + cual);
      if (html.indexOf('class="secc"') < 0) throw new Error('el PDF no lleva las secciones');
      if (html.indexOf('class="nota"') < 0) throw new Error('el PDF no lleva las notas');
      for (const mala of ['costo_mo', 'costoMo', 'margen'])
        if (html.indexOf(mala) >= 0) throw new Error('se coló el costo en el PDF: ' + mala);
      console.log('    secciones + notas + los cinco compromisos, y sin costo');
    } finally { await q.close(); }
  });


  /* ══ V1.34 · LA RETROALIMENTACIÓN DE USO REAL (#246) ═══════════════════
   *
   * Cuatro cosas que el encargo pide probar por su nombre. Las cuatro miden el
   * MODO DE FALLO, no el camino feliz: qué pasa cuando se apaga la excepción
   * (¿se pierde lo escrito?), qué pasa al borrar (¿avisa, y con qué?), qué
   * pasa DESPUÉS de deshacer (¿sigue guardando?) y qué NO pasa al escribir en
   * el pad (¿mueve el precio?).
   *
   * ⚠️ El autoguardado es DEBOUNCED a 500 ms (`tocado` → `setTimeout(500)`).
   * Toda lectura del almacén espera más que eso: con 450 ms se lee la fixture
   * intacta y la prueba «pasa» midiendo que nada cambió, que es exactamente
   * el fantasma de CLAUDE.md §8.
   */
  const ALMACEN = 900;
  const delAlmacen = (fn) => p.evaluate((src) => {
    const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
    const m = (raw.machotes || []).find(x => x.id === 'M-1041') || {};
    // eslint-disable-next-line no-new-func
    return new Function('m', 'return (' + src + ')(m);')(m);
  }, fn.toString());

  /* ── V1.40 · aquí vivía la prueba de la banda de excepción ──────────────
   * «desviar una sección, apagarla y reencenderla conserva el reparto con su
   * fecha»: ejercitaba la casilla `comision_propia` y el objeto `comision`.
   * Los dos se fueron con la V1.40 porque no eran lo que se había pedido, y
   * porque nadie los usó nunca —medido en las 895 versiones de sección de
   * todo el historial, no sólo en las vivas—.
   *
   * La prueba NO se adapta: defendía un mecanismo que ya no existe. Lo que
   * ocupa su lugar son las dos de arriba —«la comisión de FTS de una sección
   * NO mueve la de la otra» y «el aviso sale DEBAJO del cuadro»— más las del
   * motor en `pruebas-motor.js`. */

  await paso('V1.34 · borrar un renglón CAPTURADO pregunta con números; uno en blanco no', async () => {
    /* Las dos mitades son el encargo. Preguntar por un renglón vacío enseña a
     * decir que sí sin leer, y entonces la confirmación deja de proteger al
     * renglón que sí importaba. */
    await ir('#/m/M-1041');
    await hoja('Suministro'); await p.waitForTimeout(500);

    const botones = await p.$$eval('[data-del]', e => e.map(x => x.dataset.del));
    if (!botones.length) throw new Error('no hay renglones que borrar');
    const ref = botones[0];                        // 's-1#0'
    const [sid, j] = ref.split('#');
    const cel = (campo) => '[data-cel="s:' + sid + ':partidas:' + j + ':' + campo + '"]';

    await p.fill(cel('descripcion'), 'TUBO DE PRUEBA 134');
    await p.dispatchEvent(cel('descripcion'), 'change');
    await p.fill(cel('pu'), '4321');
    await p.dispatchEvent(cel('pu'), 'change');
    await p.waitForTimeout(500);

    // (a) CANCELAR deja el renglón donde estaba.
    let visto = null;
    p.once('dialog', d => { visto = d.message(); d.dismiss(); });
    await p.click('[data-del="' + ref + '"]'); await p.waitForTimeout(450);
    if (!visto) throw new Error('borró un renglón capturado SIN preguntar');
    if (!/TUBO DE PRUEBA 134/.test(visto))
      throw new Error('la pregunta no dice qué se pierde: ' + visto);
    if (!/4,?321/.test(visto)) throw new Error('la pregunta no trae el dinero: ' + visto);
    if (await p.inputValue(cel('descripcion')) !== 'TUBO DE PRUEBA 134')
      throw new Error('canceló y aun así borró');

    // (b) ACEPTAR sí borra.
    p.once('dialog', d => d.accept());
    await p.click('[data-del="' + ref + '"]'); await p.waitForTimeout(550);
    if (await p.inputValue(cel('descripcion')).catch(() => '') === 'TUBO DE PRUEBA 134')
      throw new Error('aceptó y no borró');

    /* (c) Un renglón EN BLANCO se va sin preguntar.
     *
     * ⚠️ Un renglón en blanco hay que FABRICARLO: el fixture no trae ninguno
     * (cinco renglones, los cinco capturados) y el que agrega «+ partida»
     * nace con `qty: 1`, que `usadaPartida` da por tocado —correctamente—.
     * Así que se agrega uno y se le borra la cantidad, que es justo lo que
     * hace quien agregó uno de más.
     *
     * ⚠️⚠️ Aquí había un `check('#verVacios')` puesto sobre una creencia
     * FALSA —que los renglones vacíos de materiales estaban ocultos—. No lo
     * están: la tabla de materiales pinta `s.partidas` ENTERA, sin filtro;
     * `#verVacios` es de la tabla de MANO DE OBRA y ni siquiera existe cuando
     * esa tabla no tiene renglones en cero. Con `SOLO` pasaba de casualidad
     * (la MO venía vacía); en la suite completa una prueba anterior le llenó
     * las horas, la casilla desapareció y esto se colgó 30 s. Es el caso que
     * el encargo manda medir sin `SOLO`. */
    await p.click('[data-add]'); await p.waitForTimeout(600);
    const vacio = (await p.$$eval('[data-del]', e => e.map(x => x.dataset.del))).pop();
    if (!vacio) throw new Error('«+ partida» no agregó ningún renglón');
    const [sv, jv] = vacio.split('#');
    const celQty = '[data-cel="s:' + sv + ':partidas:' + jv + ':qty"]';
    await p.fill(celQty, ''); await p.dispatchEvent(celQty, 'change'); await p.waitForTimeout(600);
    const sigueVacio = await p.evaluate((ref) => {
      const C = window.MachoteCalc;
      const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
      const m = (raw.machotes || []).find(x => x.id === 'M-1041') || {};
      const [sid, j] = ref.split('#');
      const s = (m.secciones || []).find(x => x.id === sid);
      const l = s && s.partidas[+j];
      return !!l && !C.usadaPartida(l) && !l.descripcion;
    }, vacio);
    if (!sigueVacio) throw new Error('no se pudo dejar un renglón en blanco con el que probar');

    let preguntó = false;
    const escucha = (d) => { preguntó = true; d.dismiss(); };
    p.on('dialog', escucha);
    await p.click('[data-del="' + vacio + '"]'); await p.waitForTimeout(450);
    p.off('dialog', escucha);
    if (preguntó) throw new Error('preguntó por un renglón vacío');
    console.log('    capturado: pregunta con descripción y dinero · vacío: se va callado');
  });

  await paso('V1.34 · borrar una sección pregunta, y la pregunta trae números', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro'); await p.waitForTimeout(500);
    const secs = () => p.$$eval('.pestana:not(.mas)', e => e.length);   // DESGLOSE + secciones
    const antes = await secs();
    if (antes < 3) throw new Error('hacen falta dos secciones para poder borrar una');
    if (!(await p.$('[data-delsec]'))) throw new Error('la sección no ofrece borrarse');

    let visto = null;
    p.once('dialog', d => { visto = d.message(); d.dismiss(); });
    await p.click('[data-delsec]'); await p.waitForTimeout(450);
    if (!visto) throw new Error('borró la sección SIN preguntar');
    if (!/rengl[oó]n/i.test(visto))
      throw new Error('la pregunta no dice cuántos renglones se pierden: ' + visto);
    if (!/\d/.test(visto)) throw new Error('la pregunta no trae números: ' + visto);
    if (await secs() !== antes) throw new Error('canceló y aun así borró la sección');

    p.once('dialog', d => d.accept());
    await p.click('[data-delsec]'); await p.waitForTimeout(700);
    const despues = await secs();
    if (despues !== antes - 1)
      throw new Error('aceptó y no borró: ' + antes + ' → ' + despues);
    console.log('    pregunta con números · cancelar conserva · aceptar borra');
  });

  await paso('V1.34 · deshacer tres pasos, y el guardado sigue funcionando normal', async () => {
    /* El encargo dice «independiente del guardado»: deshacer NO es un modo
     * aparte que deje la cotización en un limbo. Se aplica, se marca tocado y
     * se guarda como cualquier otro cambio. */
    await ir('#/m/M-1041');
    await p.waitForTimeout(400);

    const nom = '[data-cel="eq:venta:0:nombre"]';
    if (!(await p.$(nom))) throw new Error('no se encontró el campo con el que probar');
    const original = await p.inputValue(nom);
    const escribir = async (v) => {
      await p.fill(nom, v); await p.dispatchEvent(nom, 'change'); await p.waitForTimeout(450);
    };
    const enAlmacen = () => delAlmacen((m) => ((m.equipo_venta || [])[0] || {}).nombre);

    await escribir('PASO UNO'); await escribir('PASO DOS'); await escribir('PASO TRES');

    if (!(await p.$('#btnDeshacer'))) throw new Error('no apareció el botón de deshacer');
    const rotulo = (await p.textContent('#btnDeshacer')).replace(/\s+/g, ' ').trim();
    if (!/^↶ Deshacer .+/.test(rotulo))
      throw new Error('el botón no dice QUÉ deshace: «' + rotulo + '»');

    const paso3 = ['PASO DOS', 'PASO UNO', original];
    for (let i = 0; i < 3; i++) {
      if (!(await p.$('#btnDeshacer')))
        throw new Error('se acabó el deshacer en el paso ' + (i + 1) + ' de 3');
      await p.click('#btnDeshacer'); await p.waitForTimeout(450);
      const v = await p.inputValue(nom);
      if (v !== paso3[i]) throw new Error('deshacer ' + (i + 1) + ' dejó «' + v +
                                          '» y se esperaba «' + paso3[i] + '»');
    }
    // Tres de memoria, tres usados: el botón se acaba, no revienta.
    if (await p.$('#btnDeshacer'))
      throw new Error('ofrece un cuarto deshacer con sólo tres pasos de memoria');

    /* Y EL GUARDADO. Lo deshecho queda GUARDADO, no pendiente: el almacén dice
     * lo mismo que la pantalla. */
    await p.waitForTimeout(ALMACEN);
    const guardado = await enAlmacen();
    if (guardado !== original)
      throw new Error('deshizo en pantalla pero el almacén quedó en: ' + guardado);

    // Y se sigue editando y guardando como si nada hubiera pasado.
    await escribir('DESPUÉS DE DESHACER'); await p.waitForTimeout(ALMACEN);
    if (await enAlmacen() !== 'DESPUÉS DE DESHACER')
      throw new Error('después de deshacer dejó de guardar: ' + await enAlmacen());
    console.log('    tres pasos atrás · el almacén los siguió · y siguió guardando');
  });

  await paso('V1.34 · el pad no altera ningún total, salvo por el botón', async () => {
    /* La única garantía que vuelve tolerable una hoja libre DENTRO de una hoja
     * de costos. Se mide lo que la BARRA dice, que es lo que el usuario ve.
     *
     * ⚠️ PÁGINA PROPIA, y no por gusto. La página de la suite trae un guion de
     * arranque que hace `localStorage.clear()` en CADA navegación —a propósito,
     * para que cada prueba parta limpia— y `sembrarMachotes` repone la fixture
     * detrás. Ahí una recarga no prueba que el pad sobreviva: prueba que la
     * fixture volvió. Esta prueba necesita recargar de verdad, así que usa una
     * página SIN ese guion; es la misma trampa de CLAUDE.md §20 #11 —el
     * resultado se ve idéntico cuando el dato sobrevivió y cuando lo repusieron
     * de cero— y sólo se ve montando la página aparte. */
    const q = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    /* CAZADOR DE `clear()`. Va ANTES que todo lo demás y sobreescribe el
     * método en `Storage.prototype`, no en la instancia — que es el detalle
     * que importa: `localStorage.clear = fn` NO sustituye el método, crea un
     * ITEM llamado «clear» (Storage expone sus llaves como propiedades, y las
     * del prototipo ganan). O sea que el envoltorio de `sembrarMachotes`
     * nunca ha sustituido nada; se ve en el propio almacén, donde aparece una
     * llave «clear» con una función dentro.
     *
     * La pila se guarda en `sessionStorage`, que sobrevive a la recarga y que
     * `localStorage.clear()` no toca. Si alguna vez esta prueba vuelve a
     * fallar, el mensaje trae el nombre del culpable. */
    await q.addInitScript(() => {
      try {
        /* LATIDO. Cuenta cuántas veces ha corrido este guion en ESTE
         * contexto de almacenamiento. Sirve para desambiguar el «(nadie)»:
         * si tras recargar el contador va en 2, `sessionStorage` sobrevivió y
         * entonces el «nadie llamó a clear()» es de fiar; si va en 1, se
         * perdió TODO el almacenamiento —no hubo clear, hubo contexto
         * nuevo— y el cazador nunca tuvo dónde escribir. */
        sessionStorage.setItem('__latido',
          String((parseInt(sessionStorage.getItem('__latido') || '0', 10) || 0) + 1));
        const orig = Storage.prototype.clear;
        Storage.prototype.clear = function () {
          try {
            const st = (new Error('traza').stack || '(sin pila)').replace(/\n/g, ' | ');
            sessionStorage.setItem('__clears',
              (sessionStorage.getItem('__clears') || '') + ' === ' + st.slice(0, 400));
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      } catch (e) {}
    });
    await sembrarGeo(q);
    await sembrarMachotes(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read', 'comercial:orden'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
      } catch (e) {}
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(700);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(700);
      const aSuministro = async () => {
        await q.locator('.pestana', { hasText: 'Suministro' }).first().click();
        await q.waitForTimeout(500);
      };
      await aSuministro();

      /* V1.36: el pad dejó de ser un bloque plegable al final de la hoja y es
       * un PANEL ANCLADO que se abre desde la cabecera. Lo que esta prueba
       * mide no cambió —que no toque ningún total salvo por el botón—, sólo
       * cambió por dónde se abre. */
      if (!(await q.$('[data-padabrir]'))) throw new Error('la sección no trae el botón del pad');
      if (!(await q.$eval('[data-padpanel]', e => e.hidden)))
        throw new Error('el pad nace abierto; tiene que abrirse a propósito');
      await q.click('[data-padabrir]'); await q.waitForTimeout(350);
      if (await q.$eval('[data-padpanel]', e => e.hidden))
        throw new Error('el botón no abrió el panel');

      const total = async () => (await q.textContent('.fija .mono')).replace(/\s+/g, ' ').trim();
      const t0 = await total();
      if (!t0) throw new Error('la barra no dice ningún total');

      /* V1.41 · la hoja sustituyó al textarea. Se teclea el caso REAL de
       * Montalvo en la rejilla, celda por celda, y el total no se mueve ni
       * cuando la fórmula ya resolvió a 25,800. */
      const sid0 = await q.evaluate(() => {
        const e = document.querySelector('[data-padonde="full"][data-padcel]');
        return e ? e.dataset.padcel.split('|')[0] : null;
      });
      if (!sid0) throw new Error('la hoja no pintó ninguna celda');
      const celda = (f, c) => '[data-padonde="full"][data-padcel="' + sid0 + '|' + f + '|' + c + '"]';
      const escribirPad = async (sel, val) => {
        await q.fill(sel, val); await q.dispatchEvent(sel, 'input'); await q.waitForTimeout(250);
      };
      await escribirPad(celda(0, 0), 'Canalización tramo norte');
      await escribirPad(celda(0, 1), '3');
      await escribirPad(celda(0, 2), '12');
      if (await total() !== t0)
        throw new Error('escribir en la hoja movió el total: ' + t0 + ' → ' + await total());
      await escribirPad(celda(0, 3), '=A1*B1*450');
      if (await total() !== t0)
        throw new Error('UNA FÓRMULA DE LA HOJA MOVIÓ EL TOTAL: ' + t0 + ' → ' + await total());
      await escribirPad(celda(1, 0), 'Soportes');
      await escribirPad(celda(1, 3), '9600');
      if (await total() !== t0)
        throw new Error('EL IMPORTE DE LA HOJA MOVIÓ EL TOTAL: ' + t0 + ' → ' + await total());

      /* Sobrevive a recargar, y SIGUE sin contar.
       *
       * ⚠️ NO se recarga tras un `waitForTimeout` a secas. El autoguardado es
       * un `setTimeout` de 500 ms, y un sleep fijo apuesta a que la máquina no
       * se atore: si se atora, se recarga ANTES de que el guardado aterrice y
       * la prueba falla por la carga, no por el producto. Esta prueba falló
       * así una vez en la suite completa (23-sep, V1.37) y pasó aislada.
       *
       * En vez de subir el sleep —que sólo mueve la apuesta— se ESPERA A QUE
       * EL DATO ESTÉ, con tope. Y si tardó más de lo que debería, se DICE: un
       * guardado lento es un hallazgo, no algo que taparle a la siguiente
       * corrida. Si nunca llega, la prueba falla igual que antes. */
      const t_ini = Date.now();
      await q.waitForFunction(() => {
        try {
          const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
          const m = (raw.machotes || []).find(x => x.id === 'M-1041');
          const s = m && (m.secciones || []).find(x => (x.pad || {}).abierto === true);
          /* V1.41 · se espera la FÓRMULA en la rejilla, no el texto: es lo
           * que se guarda ahora, y esperar lo viejo daría un fallo que parece
           * de guardado y es de la prueba. */
          const h = s && (s.pad || {}).hoja;
          return !!(h && JSON.stringify(h).indexOf('=A1*B1*450') >= 0);
        } catch (e) { return false; }
      }, { timeout: 8000 }).catch(() => { throw new Error(
        'la hoja NUNCA llegó al almacén en 8 s: no es lentitud, es que no se guardó'); });
      const t_guardado = Date.now() - t_ini;
      if (t_guardado > 1500) console.log('    ⚠️ el autoguardado tardó ' + t_guardado +
        ' ms (el debounce es de 500): la máquina va cargada');

      /* CENTINELA. Si tras recargar el pad no está, hay dos causas muy
       * distintas: que se haya borrado TODO el almacén (un `clear`, o una
       * partición de storage distinta) o que alguien haya reescrito SÓLO la
       * llave de los machotes. El centinela las separa: es una llave que
       * nadie del producto ni de la siembra toca. */
      await q.evaluate(() => localStorage.setItem('__centinela', String(Date.now())));
      await q.reload(); await q.waitForTimeout(900);
      await aSuministro();
      if (await total() !== t0) throw new Error('tras recargar, el pad guardado sí contaba');
      /* Se quedó abierto: `pad.abierto` se guarda igual que el texto. */
      if (await q.$eval('[data-padpanel]', e => e.hidden)) {
        /* Con el guardado ya comprobado ARRIBA, si esto falla ya no puede ser
         * el debounce: el dato estaba en el almacén antes de recargar. La
         * evidencia dice qué quedó después. */
        const ev = await q.evaluate(() => {
          const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
          const m = (raw.machotes || []).find(x => x.id === 'M-1041');
          return {
            paneles: document.querySelectorAll('[data-padpanel]').length,
            centinela: localStorage.getItem('__centinela'),
            clears: sessionStorage.getItem('__clears'),
            latido: sessionStorage.getItem('__latido'),
            sesion: !!localStorage.getItem('fts_suite_session'),
            llaves: Object.keys(localStorage).sort(),
            pads: (m ? (m.secciones || []) : []).map(x => x.id + ':' +
                   JSON.stringify((x.pad || {}).abierto) + ':' +
                   String((x.pad || {}).texto || '').slice(0, 12)),
            guardado_at: raw.guardado_at,
            url: document.URL.slice(-46)
          };
        });
        throw new Error('el pad estaba abierto y tras recargar salió cerrado' +
          ' · guardado ANTES de recargar en ' + t_guardado + ' ms' +
          '\n      EVIDENCIA · quién llamó a clear(): ' + (ev.clears || '(nadie)') +
          ' · latido (arranques en este contexto): ' + ev.latido +
          ' · url: ' + ev.url +
          '\n      EVIDENCIA · centinela tras recargar: ' + JSON.stringify(ev.centinela) +
          ' · sesión: ' + ev.sesion + ' · llaves: ' + JSON.stringify(ev.llaves) +
          '\n      EVIDENCIA · paneles en el DOM: ' + ev.paneles +
          ' · guardado_at: ' + ev.guardado_at +
          '\n      EVIDENCIA · pads en el almacén: ' + JSON.stringify(ev.pads));
      }
      /* Sobrevive a recargar: la FÓRMULA, no su resultado. Es la prueba de
       * que se guarda lo escrito y se recalcula al abrir, que es la regla que
       * evita que un número almacenado se separe de sus entradas (§8). */
      const guardado = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041') || {};
        const s = (m.secciones || []).find(x => x.pad && x.pad.hoja);
        return s ? s.pad.hoja[0] : null;
      });
      if (!guardado) throw new Error('la hoja no sobrevivió a recargar');
      if (guardado[3] !== '=A1*B1*450')
        throw new Error('se guardó el RESULTADO en vez de la fórmula: ' + JSON.stringify(guardado));
      const visto = await q.inputValue(celda(0, 3));
      if (!/16,200/.test(visto))
        throw new Error('la celda no enseña el valor recalculado: ' + visto);

      // EL BOTÓN es la única puerta: pasa el número de la celda elegida.
      await q.click(celda(0, 3)); await q.waitForTimeout(300);
      await q.click('[data-padpasar]'); await q.waitForTimeout(ALMACEN);
      if (await total() === t0) throw new Error('el botón no movió nada: ' + t0);
      const llevado = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041') || {};
        const s = (m.secciones || []).find(x => (x.partidas || [])
          .some(l => l.descripcion === 'Canalización tramo norte'));
        const l = s && s.partidas.find(x => x.descripcion === 'Canalización tramo norte');
        return { pu: l && l.pu, com: l && l.comentario, hoja: s && s.pad && s.pad.hoja };
      });
      if (Number(llevado.pu) !== 16200) throw new Error('el renglón no llevó el importe: ' + llevado.pu);
      if (!/=A1\*B1\*450/.test(llevado.com || ''))
        throw new Error('LA CUENTA NO VIAJÓ con el número: ' + llevado.com);
      if (!/16,200/.test(llevado.com || ''))
        throw new Error('el comentario no dice a cuánto resolvió: ' + llevado.com);
      /* Y la hoja NO se vacía, al revés que el pad de texto: de una hoja
       * salen VARIOS renglones y borrarla al primero tiraría el trabajo. */
      if (!llevado.hoja || !llevado.hoja.length)
        throw new Error('la hoja se borró al pasar un renglón');
      console.log('    celdas y fórmula escritas, cero centavos movidos · se guarda la FÓRMULA · ' +
                  'el botón pasa importe Y cuenta, y la hoja se queda');
    } finally { await q.close(); }
  });

  /* ══ V1.35 · LO QUE LA V1.34 NO PODÍA VER (#246) ═══════════════════════
   *
   * Las pruebas de V1.34 comprobaban que los bloques EXISTEN. Ninguna
   * comprobaba DÓNDE CAEN ni en qué anchos se apagan, y por eso pasaron en
   * verde mientras en producción el pad quedaba a 56 pantallas y las dos
   * columnas de fecha desaparecían en la franja de 721 a 980 px.
   *
   * Existir no es estar disponible. Estas tres miden disponibilidad.
   */

  /** Un machote del PERCENTIL ALTO de producción, medido en el servidor el
   *  22-sep-2026 sobre los 19 que hay: 60 partidas en una sección (50
   *  capturadas), 13 renglones de mano de obra, nombre de 89 caracteres.
   *  Las pruebas con el fixture de `demo.js` —5 partidas— no pueden ver un
   *  problema de LARGO, que es justo el que se coló. */
  const machoteP90 = () => {
    const rell = (n, base) => { let s = base; while (s.length < n) s += ' ' + base; return s.slice(0, n); };
    const m = CALC.machoteNuevo({ id: 'M-P90', nombre: rell(89, 'Modificacion de tren de drenado con recubrimiento epoxico') });
    m.cliente_id = 991; m.cliente = rell(30, 'Industrias del Norte SA CV');
    const s = m.secciones[0];
    while (s.partidas.length < 60) s.partidas.push({ qty:'', unidad:'', tipo:'', descripcion:'',
      modelo:'', marca:'', pu:null, moneda:'MXN', margen:null, link:'', comentario:'' });
    for (let i = 0; i < 50; i++) Object.assign(s.partidas[i],
      { descripcion: 'Renglon capturado ' + (i+1), qty: 2, pu: 1500, unidad: 'Pieza', tipo: 'Materiales' });
    s.mo[2].qty = 60; s.mo[4].qty = 40;
    return m;
  };

  await paso('V1.35 · la fecha NUNCA falta: ni un ancho sin columnas y sin línea', async () => {
    /* El defecto era un HUECO: las columnas se iban a ≤980 y la tarjeta que
     * las repone sólo entra a ≤720. Entre esos dos números no había ninguna
     * de las dos cosas.
     *
     * Esta prueba no comprueba un breakpoint concreto a propósito: comprueba
     * la INVARIANTE —a cualquier ancho hay columnas O hay línea—. Así sigue
     * sirviendo si mañana alguien mueve los números, que es exactamente lo
     * que pasó para causar el hueco. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          const d = JSON.parse(localStorage.getItem('fts_machote_v1') || 'null');
          const lib = {};
          if (d && d.machotes) d.machotes.forEach(function (m) {
            lib[m.id] = { version: 3, huella: 'x', machote_id: '1111',
                          guardada_at: new Date(Date.now() - 2 * 864e5).toISOString(),
                          autor: 'f.montalvo', autor_nombre: 'Francisco Montalvo',
                          creado_at: new Date(Date.now() - 20 * 864e5).toISOString() };
          });
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify(lib));
        } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1500);

      const huecos = [];
      for (const w of [1440, 1281, 1280, 1000, 981, 980, 900, 800, 760, 730, 721, 720, 700, 500, 380]) {
        await q.setViewportSize({ width: w, height: 900 });
        await q.waitForTimeout(220);
        const r = await q.evaluate(() => {
          const vis = (el) => {
            if (!el) return false;
            if (getComputedStyle(el).display === 'none') return false;
            /* Un ancestro oculto basta para que no se vea: la tabla entera se
             * apaga a ≤720 y sus hijos siguen diciendo `display:block`. */
            for (let p = el.parentElement; p; p = p.parentElement)
              if (getComputedStyle(p).display === 'none') return false;
            return el.getBoundingClientRect().height > 0;
          };
          return {
            columnas: [...document.querySelectorAll('table.lista td.fch')].filter(vis).length,
            en_fila: [...document.querySelectorAll('table.lista .fch-en-fila')].filter(vis).length,
            tarjeta: [...document.querySelectorAll('.cards .fch-linea')].filter(vis).length
          };
        });
        if (!(r.columnas || r.en_fila || r.tarjeta)) huecos.push(w + 'px ' + JSON.stringify(r));
      }
      if (huecos.length) throw new Error('anchos SIN fecha por ningún lado: ' + huecos.join(' | '));
      console.log('    15 anchos de 380 a 1440: en todos hay columnas, línea o tarjeta');
    } finally { await q.close(); }
  });

  await paso('V1.35 · sin creado_at en el documento se usa el del servidor, y el documento NO se toca', async () => {
    /* Diez de los diecinueve machotes de producción nacieron antes de que
     * existiera `creado_at`, así que su documento no lo lleva y la columna
     * salía con raya. El servidor SÍ lo manda.
     *
     * ⚠️ Lo que esta prueba protege de verdad es la segunda mitad: el dato se
     * pinta desde la LIBRETA y NO se mete en el documento. Metido ahí
     * cambiaría `huella(m)`, la libreta guarda `huella(doc)` sin él, y los
     * diez machotes dirían «por subir» nada más cargar la lista. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at: new Date().toISOString(), handoff:{}, machotes: [{
              id:'M-SINFECHA', nombre:'Nacio antes de que el campo existiera',
              cliente:'Cliente', cliente_id:991, moneda:'MXN', empresa_id:1,
              estado:'borrador', fecha:'2026-09-04', margen_deseado:0.4,
              secciones:[], equipo_venta:[], equipo_operaciones:[], equipo_cliente:[] }] }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-SINFECHA': { version:9, huella:'x', machote_id:'2222',
              guardada_at:new Date(Date.now()-8*864e5).toISOString(),
              autor:'zz.prueba', autor_nombre:'ZZ Prueba',
              creado_at:'2026-09-04T15:00:00.000Z' } }));
        } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1500);

      const celdas = await q.$$eval('table.lista td.fch', e => e.map(x => x.textContent.trim()));
      if (!celdas.length) throw new Error('no se pintaron las columnas de fecha');
      if (celdas[0] === '—')
        throw new Error('la columna Creada siguió en raya teniendo el dato del servidor');
      if (!/sep/.test(celdas[0])) throw new Error('la fecha de creación salió rara: ' + celdas[0]);

      // Y el documento sigue SIN el campo: es lo que protege la huella.
      const enDoc = await q.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (d.machotes || []).find(x => x.id === 'M-SINFECHA') || {};
        return Object.prototype.hasOwnProperty.call(m, 'creado_at');
      });
      if (enDoc) throw new Error('SE METIÓ `creado_at` en el documento: eso mueve la huella ' +
                                 'y haría que los 10 machotes digan «por subir» al cargar');
      console.log('    pinta ' + celdas[0] + ' desde la libreta, y el documento queda intacto');
    } finally { await q.close(); }
  });

  await paso('V1.36 · nada de la hoja de sección cae fuera de alcance, en los dos anchos', async () => {
    /* LA PRUEBA QUE FALTABA EN V1.34. Con el fixture de 5 partidas todo queda
     * cerca y cualquier bloque parece alcanzable; con el tamaño real de
     * producción el pad quedaba a 4,941 px en escritorio y a 44,694 px —56
     * pantallas— en el teléfono, y nadie lo vio porque ninguna prueba medía
     * POSICIÓN.
     *
     * ⚠️ V1.36 BORRA LA EXCEPCIÓN DECLARADA del pad. En V1.35 se fijó su
     * número de aquel día como techo, con fecha de caducidad explícita,
     * mientras Esteban decidía cómo alcanzarlo. Decidió: panel anclado. El
     * pad ya no está en el flujo, así que entra al tope normal como todo lo
     * demás y aquí no queda ninguna rama especial. Una excepción en una
     * prueba sólo es honesta mientras tiene fecha de caducidad — y ésta la
     * cumplió.
     *
     * La regla: ningún bloque de la hoja puede empezar más de DOS pantallas
     * abajo. Dos y no una porque la hoja arranca con dos tablas de resumen
     * que ocupan casi una pantalla completa a propósito. */
    const TOPE = 2.0;
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript((m) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), machotes:[m], handoff:{} }));
        } catch (e) {}
      }, machoteP90());

      const malos = [];
      for (const [w, h] of [[1280, 900], [380, 800]]) {
        await q.setViewportSize({ width: w, height: h });
        await q.goto(BASE); await q.waitForTimeout(1200);
        await q.evaluate(() => { location.hash = '#/m/M-P90'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(1400);

        /* El botón del pad: tiene que estar en la CABECERA, que es lo primero
         * que se ve al entrar en la sección. */
        const btn = await q.evaluate(() => {
          const e = document.querySelector('[data-padabrir]');
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { desdeArriba: Math.round(r.top + window.scrollY), visible: r.height > 0 };
        });
        if (!btn) { malos.push(w + 'px: no hay botón para abrir el pad'); continue; }
        if (!btn.visible) malos.push(w + 'px: el botón del pad no se ve');
        const pantallasBtn = +(btn.desdeArriba / h).toFixed(1);
        if (pantallasBtn > TOPE) malos.push(w + 'px · botón del pad: ' + btn.desdeArriba + 'px = ' + pantallasBtn + ' pantallas');
        else console.log('    ' + w + 'px · botón del pad: ' + btn.desdeArriba + 'px = ' + pantallasBtn + ' pantallas');

        /* Y el PANEL, abierto DESDE EL FONDO de la hoja: es el caso que
         * importa — el que antes obligaba a subir cinco pantallas. Anclado,
         * tiene que quedar dentro de la ventana sin importar dónde estabas. */
        await q.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await q.waitForTimeout(250);
        await q.evaluate(() => { document.querySelector('[data-padabrir]').click(); });
        await q.waitForTimeout(400);
        const pnl = await q.evaluate(() => {
          const e = document.querySelector('[data-padpanel]');
          if (!e || e.hidden) return null;
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom),
                   alto: Math.round(r.height), ventana: window.innerHeight,
                   tieneTexto: !!e.querySelector('.pad-formula'),
                   tieneBoton: !!e.querySelector('[data-padpasar]') };
        });
        if (!pnl) { malos.push(w + 'px: el panel del pad no se abrió desde el fondo de la hoja'); continue; }
        if (pnl.top < 0 || pnl.top > pnl.ventana)
          malos.push(w + 'px: el panel abrió FUERA de la ventana (top ' + pnl.top + ' de ' + pnl.ventana + ')');
        if (!pnl.tieneTexto || !pnl.tieneBoton)
          malos.push(w + 'px: el panel abrió sin su caja de texto o sin su botón');
        /* ⚠️ V1.42 CAMBIA ESTE LÍMITE, y conviene decir por qué en vez de
         * bajarlo en silencio. Hasta la V1.41 el tope era el 80 % de la
         * ventana con esta razón escrita: «sirve para calcular MIRANDO la
         * tabla, no en vez de ella». En la V1.42 Esteban pidió el popup
         * CENTRADO con la rejilla de 10 × 10, y diez filas no caben en el
         * 80 % de una ventana de 900 — medido: 729 px, o sea el 81 %.
         *
         * Lo que protegía el tope viejo NO se perdió, se mudó: mirar la tabla
         * mientras se calcula es ahora el TERCER CUADRANTE, que vive en la
         * hoja y no tapa nada. Por eso aquí se exige las dos cosas: que el
         * panel no se trague la pantalla entera —queda fondo que tocar para
         * cerrarlo— y que en escritorio exista el cuadrante. En el teléfono
         * el cuadrante no va (tres columnas a 380 px no caben), y ahí el
         * panel sigue midiendo 72 % con la hoja detrás. */
        if (pnl.alto > pnl.ventana * 0.9)
          malos.push(w + 'px: el panel ocupa ' + pnl.alto + 'px de ' + pnl.ventana + ' — se traga la pantalla');
        else console.log('    ' + w + 'px · panel abierto desde el fondo: top ' + pnl.top +
                         ', alto ' + pnl.alto + ' de ' + pnl.ventana);
        const cuadrante = await q.evaluate(() => {
          const e = document.querySelector('.blk-pad');
          return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
        });
        if (w >= 900 && !cuadrante)
          malos.push(w + 'px: no está el tercer cuadrante, que es lo que permite calcular mirando la tabla');
        if (w === 380 && cuadrante)
          malos.push('380px: el tercer cuadrante no cabe en el teléfono y está a la vista');

        /* V1.40 · lo que tiene que estar al alcance es el CAMPO de comisión,
         * no un aviso en la cabecera: el aviso vive debajo del cuadro y sólo
         * aparece cuando la sección se apartó. El campo está siempre. */
        const campoCom = await q.evaluate(() => {
          const e = document.querySelector('[data-cel^="com:"][data-cel$=":fts"]');
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { desdeArriba: Math.round(r.top + window.scrollY) };
        });
        if (!campoCom) { malos.push(w + 'px: no está el campo de comisión de la sección'); continue; }
        const pant = +(campoCom.desdeArriba / h).toFixed(1);
        if (pant > TOPE) malos.push(w + 'px · campo de comisión: ' + pant + ' pantallas');
        else console.log('    ' + w + 'px · campo de comisión de la sección a ' + pant + ' pantallas');
      }
      if (malos.length) throw new Error(malos.join(' | '));
    } finally { await q.close(); }
  });

  await paso('V1.36 · la barra fija no aplasta el precio, ni con los cinco botones', async () => {
    /* La barra se plegaba sólo a ≤560 px, y con TRES botones eso bastaba. El
     * deshacer de la V1.34 la dejó en CINCO —y el suyo lleva texto largo—:
     * a 760 px no quedaba nada para el bloque del precio, que se aplastaba en
     * una columna de un carácter y se derramaba por debajo de la barra.
     *
     * Esta prueba no fija un ancho: comprueba la INVARIANTE —el precio se lee
     * en UN renglón y queda dentro de la barra— a los anchos donde caben
     * distintos números de botones. Así sigue sirviendo cuando alguien añada
     * el sexto, que es exactamente como apareció este defecto. */
    const q = await b.newPage({ viewport: { width: 760, height: 1000 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript((m) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), machotes:[m], handoff:{} }));
          /* CON libreta: sin ella no hay `idServidor` y la barra sale con
           * TRES botones — que es justo el caso que NO tenía el defecto.
           * Medir el caso fácil y declararlo bueno es la trampa del §20 #18. */
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-P90': { version: 12, huella: 'z', machote_id: '99999999-8888-7777-6666-555555555555',
                       guardada_at: new Date(Date.now() - 864e5).toISOString(),
                       autor: 'zz.prueba', autor_nombre: 'ZZ Prueba',
                       creado_at: new Date(Date.now() - 96 * 864e5).toISOString() } }));
        } catch (e) {}
      }, machoteP90());

      const malos = [];
      for (const [w, h] of [[1280, 900], [900, 900], [760, 1000], [380, 800]]) {
        await q.setViewportSize({ width: w, height: h });
        await q.goto(BASE); await q.waitForTimeout(1200);
        await q.evaluate(() => { location.hash = '#/m/M-P90'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(1200);

        /* El deshacer sólo existe después de un cambio de celda: es el quinto
         * botón, y sin él la barra no está en el caso que se quiere medir. */
        const cel = q.locator('[data-cel]').first();
        await cel.fill('7'); await cel.dispatchEvent('change'); await q.waitForTimeout(700);

        const r = await q.evaluate(() => {
          const f = document.querySelector('.fija');
          const g = f.querySelector('.grow');
          const mono = g.querySelector('.mono');
          const rf = f.getBoundingClientRect(), rg = g.getBoundingClientRect();
          const rm = mono ? mono.getBoundingClientRect() : null;
          return {
            botones: f.querySelectorAll('.btn').length,
            deshacer: !!document.getElementById('btnDeshacer'),
            anchoPrecio: Math.round(rg.width),
            altoMono: rm ? Math.round(rm.height) : null,
            seSale: Math.round(rg.bottom - rf.bottom),
            desborde: f.scrollWidth > f.clientWidth + 1
          };
        });
        console.log('    ' + w + 'px · ' + r.botones + ' botones · precio ' + r.anchoPrecio +
                    'px de ancho, el número en ' + r.altoMono + 'px de alto');
        if (!r.deshacer) malos.push(w + ': no salió el botón de deshacer, la barra no está en el caso de cinco');
        /* 140 px es el mínimo con el que «$1,794,303 MXN · 40%*» se lee de un
         * golpe; por debajo de eso el número se parte y deja de ser un número. */
        if (r.anchoPrecio < 140) malos.push(w + ': el precio quedó en ' + r.anchoPrecio + 'px de ancho');
        if (r.altoMono !== null && r.altoMono > 34) malos.push(w + ': el precio se partió en varios renglones (' + r.altoMono + 'px)');
        if (r.seSale > 1) malos.push(w + ': el bloque del precio se derrama ' + r.seSale + 'px por debajo de la barra');
        if (r.desborde) malos.push(w + ': la barra desborda a lo ancho');
      }
      if (malos.length) throw new Error(malos.join(' · '));
    } finally { await q.close(); }
  });

  await paso('V1.36 · al pasar a renglón se dice que el texto quedó en su comentario, con el nombre', async () => {
    /* El pad se vacía a la vista del usuario. Sin decir DÓNDE quedó el texto
     * parece que se perdió — y lo que se «pierde» sería justamente el
     * razonamiento, que es lo único que esta función existe para salvar. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(900);

      await q.click('[data-padabrir]'); await q.waitForTimeout(350);
      /* V1.41 · en la rejilla: el rótulo de la fila es el concepto del
       * renglón, y el importe sale de la celda elegida. */
      const sidP = await q.evaluate(() => {
        const e = document.querySelector('[data-padonde="full"][data-padcel]');
        return e ? e.dataset.padcel.split('|')[0] : null;
      });
      const celP = (f, c) => '[data-padonde="full"][data-padcel="' + sidP + '|' + f + '|' + c + '"]';
      for (const [sel, val] of [[celP(0,0), 'Canalización tramo norte'],
                                [celP(0,1), '3'], [celP(0,2), '12'],
                                [celP(0,3), '=A1*B1*450']]) {
        await q.fill(sel, val); await q.dispatchEvent(sel, 'input'); await q.waitForTimeout(150);
      }
      await q.click(celP(0, 3)); await q.waitForTimeout(250);
      await q.waitForTimeout(400);

      await q.click('[data-padpasar]'); await q.waitForTimeout(500);
      const aviso = await q.evaluate(() => {
        const t = document.querySelector('.toast');
        return t ? t.textContent.trim() : null;
      });
      if (!aviso) throw new Error('no dijo nada al pasar el renglón');
      if (aviso.indexOf('Canalización tramo norte') < 0)
        throw new Error('el aviso no nombra el renglón: ' + aviso);
      if (!/comentario/i.test(aviso))
        throw new Error('el aviso no dice que el texto quedó en el comentario: ' + aviso);
      if (!/no se borró/i.test(aviso))
        throw new Error('el aviso no desmiente que se haya borrado: ' + aviso);
      console.log('    «' + aviso + '»');
    } finally { await q.close(); }
  });

  await paso('V1.36 · cerrar el pad con una cuenta sin pasar avisa, y el revisador lo recuerda', async () => {
    /* Dos avisos, y son distintos a propósito. El de CERRAR es puntual y va
     * en el momento en que el número se esconde. El del REVISADOR dura, y es
     * el que se ve antes de mandar la cotización.
     *
     * ⚠️ Ninguno «al guardar»: el autoguardado dispara 500 ms después de cada
     * tecla, así que «al guardar» no es un momento sino todo el rato, y un
     * aviso todo el rato deja de ser un aviso. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(900);

      // Sin nada escrito, el botón NO trae punto y cerrar no avisa.
      if (await q.$eval('[data-padabrir]', e => e.classList.contains('con-algo')))
        throw new Error('el botón trae el punto con el pad vacío');

      await q.click('[data-padabrir]'); await q.waitForTimeout(300);
      const sidC = await q.evaluate(() => {
        const e = document.querySelector('[data-padonde="full"][data-padcel]');
        return e ? e.dataset.padcel.split('|')[0] : null;
      });
      const selC = '[data-padonde="full"][data-padcel="' + sidC + '|0|0"]';
      await q.fill(selC, 'una cuenta a medias que nadie pasó');
      await q.dispatchEvent(selC, 'input'); await q.waitForTimeout(400);

      if (!(await q.$eval('[data-padabrir]', e => e.classList.contains('con-algo'))))
        throw new Error('escribí en el pad y el botón no marcó que tiene algo');

      /* 900, no 450: cerrar llama a `tocado`, que rearma el autoguardado a
       * 500 ms. Con 450 el localStorage todavía no tiene el pad y el
       * revisador lee un machote sin nada — el mismo tropiezo del ALMACEN. */
      await q.click('[data-padcerrar]'); await q.waitForTimeout(ALMACEN);
      if (!(await q.$eval('[data-padpanel]', e => e.hidden)))
        throw new Error('la × no cerró el panel');
      const aviso = await q.evaluate(() => {
        const t = document.querySelector('.toast');
        return t ? t.textContent.trim() : null;
      });
      if (!aviso || !/no pasaste/i.test(aviso))
        throw new Error('cerró con una cuenta sin pasar y no avisó: ' + aviso);

      /* Y el que DURA: la regla blanda del revisador. */
      const blandas = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041');
        const r = window.MachoteReglas.revisar(m);
        return { ids: r.blandas.map(h => h.id), duras: r.duras.length,
                 pads: (m.secciones || []).map(s => String((s.pad || {}).texto || '').slice(0, 20)) };
      });
      if (blandas.ids.indexOf('pad-sin-pasar') < 0)
        throw new Error('el revisador no recuerda el pad sin pasar: ' + JSON.stringify(blandas.ids) +
                        ' · pads guardados: ' + JSON.stringify(blandas.pads));
      console.log('    aviso al cerrar + regla blanda «pad-sin-pasar» · duras: ' + blandas.duras);
    } finally { await q.close(); }
  });

  /* ── V1.40 · aquí vivía «la cabecera anuncia los DOS estados de la comisión»
   * Medía el renglón «Comisión: la del machote · cambiar» y que llevara a la
   * banda de excepción. Los dos se fueron: el aviso ahora sale DEBAJO del
   * cuadro donde se cambia el número, y lo cubre la prueba
   * «el aviso de comisión apartada sale DEBAJO del cuadro, no en la cabecera». */

  await paso('V1.37 · borrar un renglón capturado se puede DESHACER, y vuelve a su sitio', async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(900);

      /* Se borra el SEGUNDO renglón, no el primero: así la prueba comprueba
       * que vuelve a SU índice y no simplemente al final o al principio, que
       * es donde un `push` descuidado lo dejaría sin que nadie lo notara. */
      const refs = await q.$$eval('[data-del]', e => e.map(x => x.dataset.del));
      if (refs.length < 3) throw new Error('hacen falta al menos 3 renglones');
      const ref = refs[1];
      const [sid, j] = ref.split('#');
      const cel = (k, campo) => '[data-cel="s:' + sid + ':partidas:' + k + ':' + campo + '"]';

      await q.fill(cel(j, 'descripcion'), 'RENGLON QUE VUELVE 137');
      await q.dispatchEvent(cel(j, 'descripcion'), 'change');
      await q.fill(cel(j, 'pu'), '7777');
      await q.dispatchEvent(cel(j, 'pu'), 'change');
      await q.waitForTimeout(ALMACEN);

      const antesN = await q.$$eval('[data-del]', e => e.length);
      const vecinoAntes = await q.inputValue(cel(String(parseInt(j, 10) + 1), 'descripcion'));

      q.once('dialog', d => d.accept());
      await q.click('[data-del="' + ref + '"]'); await q.waitForTimeout(ALMACEN);

      if (await q.$$eval('[data-del]', e => e.length) !== antesN - 1)
        throw new Error('el borrado no quitó el renglón');

      const btn = await q.$('#btnDeshacer');
      if (!btn) throw new Error('borrar un renglón NO ofreció deshacer');
      const etq = (await q.$eval('#btnDeshacer', e => e.textContent)).trim();
      if (etq.indexOf('RENGLON QUE VUELVE 137') < 0)
        throw new Error('el botón no dice QUÉ va a deshacer: ' + etq);

      await q.click('#btnDeshacer'); await q.waitForTimeout(ALMACEN);

      if (await q.$$eval('[data-del]', e => e.length) !== antesN)
        throw new Error('deshacer no devolvió el renglón');
      const vuelto = await q.inputValue(cel(j, 'descripcion'));
      if (vuelto !== 'RENGLON QUE VUELVE 137')
        throw new Error('volvió en otro sitio o con otro contenido: «' + vuelto + '»');
      if (await q.inputValue(cel(j, 'pu')) !== '7777')
        throw new Error('volvió sin su precio');
      if (await q.inputValue(cel(String(parseInt(j, 10) + 1), 'descripcion')) !== vecinoAntes)
        throw new Error('volvió empujando al vecino: el índice no se respetó');

      /* Y queda GUARDADO, como cualquier otro cambio: deshacer no deja un
       * archivo a medias esperando decisión. */
      const enDisco = await q.evaluate((sid2) => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041');
        const s = (m.secciones || []).find(x => x.id === sid2);
        return (s.partidas || []).filter(x => x.descripcion === 'RENGLON QUE VUELVE 137').length;
      }, sid);
      if (enDisco !== 1) throw new Error('deshacer no se guardó: ' + enDisco + ' copias en el almacén');
      console.log('    «' + etq + '» · volvió al índice ' + j + ' con su precio, y guardado');
    } finally { await q.close(); }
  });

  await paso('V1.37 · borrar una sección se puede DESHACER, con su pestaña y su contenido', async () => {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);

      const antes = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041');
        return (m.secciones || []).map(s => ({ id: s.id, nombre: s.nombre,
                                               parts: (s.partidas || []).length }));
      });
      if (antes.length < 2) throw new Error('hacen falta 2 secciones para poder borrar una');
      const victima = antes[antes.length - 1];   // la ÚLTIMA: su índice se nota

      await q.locator('.pestana').nth(antes.length).click(); await q.waitForTimeout(900);
      let pregunta = null;
      q.once('dialog', d => { pregunta = d.message(); d.accept(); });
      await q.click('[data-delsec="' + victima.id + '"]'); await q.waitForTimeout(ALMACEN);
      if (!pregunta) throw new Error('borró una sección sin preguntar');

      const sinElla = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041');
        return (m.secciones || []).map(s => s.id);
      });
      if (sinElla.indexOf(victima.id) >= 0) throw new Error('aceptó y no borró la sección');

      const btn = await q.$('#btnDeshacer');
      if (!btn) throw new Error('borrar una sección NO ofreció deshacer');
      const etq = (await q.$eval('#btnDeshacer', e => e.textContent)).trim();
      if (etq.indexOf(victima.nombre) < 0)
        throw new Error('el botón no nombra la sección: ' + etq);

      await q.click('#btnDeshacer'); await q.waitForTimeout(ALMACEN);

      const vuelta = await q.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('fts_machote_v1') || '{}');
        const m = (raw.machotes || []).find(x => x.id === 'M-1041');
        return (m.secciones || []).map(s => ({ id: s.id, nombre: s.nombre,
                                               parts: (s.partidas || []).length }));
      });
      if (JSON.stringify(vuelta) !== JSON.stringify(antes))
        throw new Error('la sección no volvió igual ni al mismo sitio:\n  antes ' +
                        JSON.stringify(antes) + '\n  ahora ' + JSON.stringify(vuelta));

      /* Y su PESTAÑA vuelve, y encima queda abierta: si volviera callada
       * detrás de otra pestaña, deshacer parecería no haber hecho nada.
       * Esto es lo que `pintarHoja` NO hacía y `vMachote` sí. */
      const pes = await q.evaluate(() => Array.from(document.querySelectorAll('.pestana'))
        .map(e => ({ txt: (e.textContent || '').trim(), activa: e.classList.contains('on') })));
      const suya = pes.find(x => x.txt.toUpperCase().indexOf(String(victima.nombre).toUpperCase().slice(0, 10)) >= 0);
      if (!suya) throw new Error('volvió al documento pero NO su pestaña: ' + JSON.stringify(pes));
      if (!suya.activa) throw new Error('la pestaña volvió pero no quedó abierta: ' + JSON.stringify(pes));
      console.log('    «' + etq + '» · volvió al índice ' + (antes.length - 1) +
                  ' con sus ' + victima.parts + ' renglones, y con su pestaña abierta');
    } finally { await q.close(); }
  });

  await paso('V1.38 · las dos confirmaciones dicen las DOS condiciones de la pila', async () => {
    /* La frase «no se puede deshacer desde aquí» dejó de ser cierta en esta
     * versión. Una advertencia que dejó de serlo es peor que ninguna: enseña
     * a no creerle al resto del diálogo. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(900);

      const vistos = [];
      const cazar = async (sel) => {
        let t = null;
        q.once('dialog', d => { t = d.message(); d.dismiss(); });
        await q.click(sel); await q.waitForTimeout(400);
        if (!t) throw new Error('no preguntó en ' + sel);
        vistos.push(t);
        if (/no se puede deshacer/i.test(t))
          throw new Error('sigue diciendo que no se puede deshacer: ' + t);
        if (!/deshacer/i.test(t))
          throw new Error('no dice cómo se deshace: ' + t);
        /* V1.38 · y las DOS condiciones, no una. La pila son tres pasos Y
         * vive en memoria: decir sólo lo de los tres cambios deja la mitad
         * de la promesa sin cumplir, que es el mismo defecto de la V1.37 en
         * una talla más chica. */
        if (!/tres cambios/i.test(t))
          throw new Error('no dice el límite de tres pasos: ' + t);
        if (!/recargu|recarga/i.test(t))
          throw new Error('no dice que una recarga también borra la pila: ' + t);
        return t;
      };
      const ref = (await q.$$eval('[data-del]', e => e.map(x => x.dataset.del)))[0];
      const [sid, j] = ref.split('#');
      await q.fill('[data-cel="s:' + sid + ':partidas:' + j + ':descripcion"]', 'ALGO 137');
      await q.dispatchEvent('[data-cel="s:' + sid + ':partidas:' + j + ':descripcion"]', 'change');
      await q.waitForTimeout(ALMACEN);
      await cazar('[data-del="' + ref + '"]');
      await cazar('[data-delsec="' + sid + '"]');
      console.log('    renglón: «' + vistos[0].split('\n').pop() + '»');
      console.log('    sección: «' + vistos[1].split('\n').pop() + '»');
    } finally { await q.close(); }
  });

  await paso('V1.37 · el pad se abre desde el FONDO de la hoja, sin viaje, en los dos anchos', async () => {
    /* La V1.36 lo dejó ENCONTRABLE (botón en la cabecera, a 0.3 pantallas al
     * entrar) y anotó lo que faltaba: desde el fondo de la hoja ese botón
     * queda a 3,899 px en escritorio y a 43,715 px en teléfono. Esta prueba
     * mide eso mismo: con la hoja hasta abajo, el pad se abre sin subir. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript((m) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), machotes:[m], handoff:{} }));
        } catch (e) {}
      }, machoteP90());

      const malos = [];
      for (const [w, h] of [[1280, 900], [380, 800]]) {
        await q.setViewportSize({ width: w, height: h });
        await q.goto(BASE); await q.waitForTimeout(1200);
        await q.evaluate(() => { location.hash = '#/m/M-P90'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(1200);

        const abajo = await q.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const bp = document.getElementById('btnPad');
          const r = bp ? bp.getBoundingClientRect() : null;
          return { y: Math.round(window.scrollY),
                   hay: !!bp,
                   enPantalla: r ? (r.top >= 0 && r.bottom <= window.innerHeight + 1) : false,
                   alto: r ? Math.round(r.height) : null };
        });
        if (!abajo.hay) { malos.push(w + ': no hay botón del pad en la barra'); continue; }
        if (abajo.y < 500) { malos.push(w + ': la hoja no bajó (y=' + abajo.y + ')'); continue; }
        if (!abajo.enPantalla) malos.push(w + ': el botón del pad no está en pantalla desde el fondo');
        if (abajo.alto < 40) malos.push(w + ': el botón del pad mide ' + abajo.alto + 'px de alto');

        /* Y abrirlo desde ahí no manda a ningún lado: el panel sale dentro de
         * la ventana y el cursor queda en el texto, listo para escribir. */
        await q.click('#btnPad'); await q.waitForTimeout(500);
        const pn = await q.evaluate(() => {
          const e = document.querySelector('.pad-panel:not([hidden])');
          if (!e) return null;
          const c = e.getBoundingClientRect();
          return { top: Math.round(c.top), alto: Math.round(c.height),
                   ventana: window.innerHeight, y: Math.round(window.scrollY),
                   dentro: c.top >= 0 && c.bottom <= window.innerHeight + 1,
                   foco: (document.activeElement || {}).className || '' };
        });
        if (!pn) { malos.push(w + ': el botón de la barra no abrió el pad'); continue; }
        if (!pn.dentro) malos.push(w + ': el pad abrió fuera de la ventana (top ' + pn.top + ')');
        if (pn.foco.indexOf('pad-formula') < 0 && pn.foco.indexOf('padcel') < 0)
          malos.push(w + ': abrió sin dejar el cursor en la hoja (foco: ' + pn.foco + ')');
        console.log('    ' + w + 'px · hoja en y=' + pn.y + ' · botón en pantalla · ' +
                    'panel top ' + pn.top + ', alto ' + pn.alto + ' de ' + pn.ventana +
                    ' · foco en el texto');
      }
      if (malos.length) throw new Error(malos.join(' · '));
    } finally { await q.close(); }
  });

  await paso('V1.37 · el botón del pad no le cuesta un renglón a la barra, a ningún ancho', async () => {
    /* A/B en la misma página: se mide la barra y se vuelve a medir quitando
     * el botón del DOM, que es exactamente la barra de la V1.36. Puesto al
     * final costaba un renglón entero en el teléfono (163 → 217); por eso a
     * ≤560 px viaja en el renglón del precio, que iba medio vacío. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript((m) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), machotes:[m], handoff:{} }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-P90': { version: 12, huella: 'z', machote_id: '99999999-8888-7777-6666-555555555555',
                       guardada_at: new Date(Date.now() - 864e5).toISOString(),
                       autor: 'zz.prueba', autor_nombre: 'ZZ Prueba' } }));
        } catch (e) {}
      }, machoteP90());

      const malos = [];
      for (const [w, h] of [[1280, 900], [900, 900], [760, 1000], [380, 800]]) {
        await q.setViewportSize({ width: w, height: h });
        await q.goto(BASE); await q.waitForTimeout(1200);
        await q.evaluate(() => { location.hash = '#/m/M-P90'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(1200);
        const cel = q.locator('[data-cel]').first();
        await cel.fill('7'); await cel.dispatchEvent('change'); await q.waitForTimeout(700);

        const r = await q.evaluate(() => {
          const f = document.querySelector('.fija');
          const bp = document.getElementById('btnPad');
          const conEl = Math.round(f.getBoundingClientRect().height);
          const anchoCon = Math.round(f.querySelector('.grow').getBoundingClientRect().width);
          const altoMono = Math.round(f.querySelector('.grow .mono').getBoundingClientRect().height);
          let sinEl = conEl;
          if (bp) {
            const padre = bp.parentNode, sig = bp.nextSibling;
            padre.removeChild(bp);
            sinEl = Math.round(document.querySelector('.fija').getBoundingClientRect().height);
            padre.insertBefore(bp, sig);
          }
          return { hay: !!bp, conEl, sinEl, anchoCon, altoMono, botones: f.querySelectorAll('.btn').length };
        });
        console.log('    ' + w + 'px · ' + r.botones + ' botones · barra ' + r.sinEl +
                    ' → ' + r.conEl + 'px · precio ' + r.anchoCon + 'px de ancho');
        if (!r.hay) { malos.push(w + ': no hay botón del pad'); continue; }
        if (r.conEl > r.sinEl) malos.push(w + ': el botón del pad engordó la barra ' +
                                          (r.conEl - r.sinEl) + 'px (' + r.sinEl + ' → ' + r.conEl + ')');
        if (r.anchoCon < 140) malos.push(w + ': el precio quedó en ' + r.anchoCon + 'px de ancho');
        if (r.altoMono > 34) malos.push(w + ': el precio se partió en varios renglones');
      }
      if (malos.length) throw new Error(malos.join(' · '));
    } finally { await q.close(); }
  });


  /* ══ V1.39 · lo que Montalvo no encontraba ════════════════════════════════
   *
   * Las tres las reportó él usando la aplicación en producción, y las tres se
   * verificaron abriendo su machote REAL («Caseta para Antonio», versión 55,
   * traído de Postgres y probado contra el md5 del servidor). Estas pruebas
   * son la red para que no vuelvan a irse: la suite aprobó 234 de 234 con el
   * aterrizaje cambiado, o sea que NINGUNA prueba miraba dónde se cae al
   * abrir un machote — que era justo la causa raíz. */

  await paso('V1.39 · la fecha de modificación es ABSOLUTA con hora, no «hace N días»', async () => {
    /* Esto NO era una discusión de alcance: se pidió absoluta con hora y se
     * había entregado `haceCuanto`. Los dientes van por los dos lados —que
     * aparezca la hora Y que no aparezca el relativo—, porque una prueba que
     * sólo pide la hora la pasaría un texto que dijera las dos cosas. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      const CUANDO = '2026-09-18T21:38:42.760Z';   // el de la versión 55 real
      await q.addInitScript((cuando) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at: new Date().toISOString(), handoff:{},
            machotes:[{ id:'M-FECHA', nombre:'Con fecha', cliente:'ZZ', moneda:'MXN',
                        creado_at:'2026-09-14T23:13:36.721Z', secciones:[] }] }));
          localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
            'M-FECHA': { version: 55, huella: 'x', guardada_at: cuando,
                         autor: 'zz.prueba', autor_nombre: 'ZZ Prueba',
                         creado_at: '2026-09-14T23:13:36.721Z' } }));
        } catch (e) {}
      }, CUANDO);
      await q.goto(BASE); await q.waitForTimeout(1200);

      const celda = (await q.$$eval('td.fch', t => t.map(x => x.textContent.trim())))
        .filter(Boolean);
      const texto = celda.join(' | ');
      console.log('    columnas de fecha: ' + texto);
      if (/hace \d/.test(texto))
        throw new Error('sigue pintando el relativo: ' + texto);
      if (!/\d{1,2}\/[a-z]{3}(\/\d{2})? \d{2}:\d{2}/.test(texto))
        throw new Error('no hay fecha con hora: ' + texto);

      /* Y la hora tiene que ser la LOCAL, no el UTC crudo del servidor. Se
       * compara contra lo que da el propio navegador para ese instante, que
       * es la única forma de no re-implementar la conversión en la prueba. */
      const esperado = await q.evaluate((iso) => {
        const d = new Date(iso);
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      }, CUANDO);
      if (texto.indexOf(esperado) < 0)
        throw new Error('la hora no es la local (' + esperado + '): ' + texto);
    } finally { await q.close(); }
  });

  await paso('V1.39 · la fecha se mueve cuando el SERVIDOR guarda, y no cuando uno teclea', async () => {
    /* Las dos mitades importan. Que se mueva con una versión nueva es lo que
     * Esteban reportó que no pasaba. Que NO se mueva al teclear es lo que
     * hace que el dato signifique algo: una fecha que avanzara con cada tecla
     * diría «guardado» de algo que nunca subió, y se vería igual de bien. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 }));
          if (!localStorage.getItem('fts_machote_v1')) {
            localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
              guardado_at: new Date().toISOString(), handoff:{},
              machotes:[{ id:'M-MUEVE', nombre:'Se mueve', cliente:'ZZ', moneda:'MXN',
                          creado_at:'2026-09-14T23:13:36.721Z', secciones:[] }] }));
          }
          /* ⚠️ SÓLO si no hay. `addInitScript` corre en CADA navegación, y la
           * prueba recarga a propósito: sembrar a ciegas pisaría el avance
           * que ella misma acaba de escribir y el fallo parecería de la
           * aplicación. Ya pasó al escribirla. */
          if (!localStorage.getItem('fts_machote_sync_v1')) {
            localStorage.setItem('fts_machote_sync_v1', JSON.stringify({
              'M-MUEVE': { version: 1, huella: 'x', guardada_at: '2026-09-18T15:00:00.000Z',
                           autor: 'zz.prueba', autor_nombre: 'ZZ Prueba' } }));
          }
        } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1200);
      const leer = () => q.$$eval('td.fch', t => t.map(x => x.textContent.trim()).join(' | '));

      const antes = await leer();

      // (a) tocar el documento SIN que el servidor acepte nada: no debe moverse.
      await q.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('fts_machote_v1'));
        c.machotes[0].nombre = 'Se mueve (editado)';
        localStorage.setItem('fts_machote_v1', JSON.stringify(c));
        location.hash = '#/'; location.reload();
      });
      await q.waitForTimeout(1300);
      const trasTeclear = await leer();
      if (trasTeclear !== antes)
        throw new Error('la fecha se movió sin que el servidor guardara: «' +
                        antes + '» → «' + trasTeclear + '»');

      // (b) el servidor acepta una versión nueva: la libreta avanza y la pantalla también.
      await q.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('fts_machote_sync_v1'));
        s['M-MUEVE'].version = 2;
        s['M-MUEVE'].guardada_at = '2026-09-19T23:45:00.000Z';
        localStorage.setItem('fts_machote_sync_v1', JSON.stringify(s));
        location.reload();
      });
      await q.waitForTimeout(1300);
      const despues = await leer();
      console.log('    ' + antes + '  →(teclear) igual→  ' + trasTeclear +
                  '  →(versión nueva)→  ' + despues);
      if (despues === trasTeclear)
        throw new Error('el servidor guardó una versión nueva y la fecha NO se movió: ' + despues);
    } finally { await q.close(); }
  });

  await paso('V1.39 · con UNA sección con trabajo se aterriza EN ella: comisión y pad a la vista', async () => {
    /* La causa raíz medida del «no está»: se aterrizaba siempre en DESGLOSE,
     * y ahí NINGUNA de las dos existe. Doce de los trece machotes reales de
     * Montalvo tienen una sola sección.
     *
     * Los dientes no son «que exista el botón» —existía— sino que esté EN LA
     * PRIMERA PANTALLA al abrir, sin tocar una pestaña. */
    const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript((m) => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read','comercial:orden'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), machotes:[m], handoff:{} }));
        } catch (e) {}
      }, machoteP90());
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-P90'; });
      await q.waitForTimeout(1300);

      const r = await q.evaluate(() => {
        const dentro = (el) => { if (!el) return null;
          const b = el.getBoundingClientRect();
          return { y: Math.round(b.top + scrollY), alto: Math.round(b.height),
                   enPantalla: b.top >= 0 && b.top < innerHeight }; };
        const pad = document.querySelector('[data-padabrir]');
        /* V1.40 · lo que tiene que verse al aterrizar es el CAMPO de comisión
         * de la sección, no el aviso: el aviso sólo existe cuando alguien se
         * apartó, y aquí nadie se ha apartado todavía. */
        const com = document.querySelector('[data-cel^="com:"][data-cel$=":fts"]');
        return { pad: dentro(pad), padTexto: pad ? pad.textContent.trim() : null,
                 com: dentro(com), comTexto: com ? com.textContent.trim() : null,
                 scroll: Math.round(scrollY) };
      });
      console.log('    pad ' + JSON.stringify(r.padTexto) + ' ' + JSON.stringify(r.pad) +
                  ' · comisión ' + JSON.stringify(r.comTexto) + ' ' + JSON.stringify(r.com));
      if (!r.pad) throw new Error('al abrir no hay botón de pad: se aterrizó fuera de la sección');
      if (!r.com) throw new Error('al abrir no hay aviso de comisión');
      if (!r.pad.enPantalla) throw new Error('el pad no está en la primera pantalla: y=' + r.pad.y);
      if (!r.com.enPantalla) throw new Error('la comisión no está en la primera pantalla: y=' + r.com.y);
      /* El rótulo tiene que decir QUÉ ES: «Pad» solo no se lo dice a nadie que
       * no lo sepa ya, y el `title` no existe en teléfono. */
      /* V1.41 · «Hoja de trabajo», y con el número de filas cuando hay algo.
       * Lo que la prueba defiende no es la palabra exacta: es que el rótulo
       * DIGA QUÉ ES, en vez de una abreviatura que sólo entiende quien ya
       * sabe. «Pad» no lo decía; «Hoja de trabajo» sí. */
      if (!/hoja de trabajo/i.test(r.padTexto || ''))
        throw new Error('el botón no dice qué es: ' + JSON.stringify(r.padTexto));
      /* Y el campo tiene que ser tocable de verdad: es el control que la gente
       * usa, y el mínimo táctil vale igual para un `input` que para un botón. */
      if (r.com.alto < 40)
        throw new Error('el campo de comisión mide ' + r.com.alto + 'px de alto: por debajo del mínimo táctil');
    } finally { await q.close(); }
  });

  await paso('V1.39 · una cotización SIN trabajo sigue aterrizando en DESGLOSE', async () => {
    /* El complemento, y sin él la regla se degrada en «siempre la sección».
     * En una cotización recién creada lo primero SÍ es el desglose: escenario,
     * margen, empresa, moneda y lugar se eligen antes de capturar nada. */
    const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), handoff:{},
            /* `reparto` y los equipos van porque TODO documento real los trae:
             * sin ellos la hoja de desglose truena en `m.reparto.venta`, que
             * es una fragilidad ANTERIOR a esta versión —está igual en la
             * V1.38— y no es lo que esta prueba mide. Queda anotada aparte. */
            machotes:[{ id:'M-NUEVO', nombre:'Recién creada', cliente:'ZZ', moneda:'MXN',
              reparto:{ venta:0.73, operaciones:0.27 },
              comision_fts:0.055, comision_cliente:0, margen_deseado:0.4,
              equipo_venta:[{ nombre:'MONTY', pct:1 }],
              equipo_operaciones:[{ nombre:'SUPERVISOR FTS', pct:1 }],
              equipo_cliente:[{ nombre:'Contacto cliente 1', pct:1 }],
              secciones:[{ id:'s-nueva', nombre:'SECCIÓN 1', mo:[], partidas:[
                { descripcion:'', qty:0, pu:null, tipo:'Materiales', unidad:'Pieza', moneda:'MXN' }
              ] }] }] }));
        } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-NUEVO'; });
      await q.waitForTimeout(1300);
      const hayPad = await q.evaluate(() => !!document.querySelector('[data-padabrir]'));
      const hojas = await q.evaluate(() =>
        [...document.querySelectorAll('[data-hoja]')].map(x => x.textContent.trim()));
      console.log('    pestañas ' + JSON.stringify(hojas) + ' · ¿dentro de la sección? ' + hayPad);
      if (hayPad)
        throw new Error('una cotización sin renglones capturados aterrizó DENTRO de la sección');
    } finally { await q.close(); }
  });

  await paso('V1.41 · la hoja calcula el caso real de Montalvo, y el número CABE a los cuatro anchos', async () => {
    /* El caso es el que Montalvo ya escribe a mano en el pad de texto:
     * `3 tramos × 12 m × $450/m + 8 soportes × $1,200 = 25,800`. Si eso no da
     * 25,800 exactos en la rejilla, la hoja no sirve por más que el resto pase.
     *
     * Y el RECORTE, que es lo que la primera versión falló y los conteos no
     * veían: a 380 px la celda quedó en 54 px y `$16,200` se leía `$16,2(`.
     * Un importe recortado es peor que uno ausente — se lee como otro número.
     * Se mide con `scrollWidth > clientWidth`, no a ojo. */
    const malos = [];
    for (const [w, h] of [[1280, 900], [900, 900], [760, 900], [380, 820]]) {
      const q = await b.newPage({ viewport: { width: w, height: h } });
      q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
      try {
        await sembrarGeo(q); await sembrarMachotes(q);
        await q.addInitScript(() => {
          try { localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
        });
        await q.goto(BASE); await q.waitForTimeout(1000);
        await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
        const abrir = await q.$('[data-padabrir]');
        if (!abrir) { malos.push(w + ': no hay botón para abrir la hoja'); continue; }
        await abrir.click(); await q.waitForTimeout(500);

        const sid = await q.evaluate(() => {
          const e = document.querySelector('[data-padonde="full"][data-padcel]');
          return e ? e.dataset.padcel.split('|')[0] : null;
        });
        if (!sid) { malos.push(w + ': la hoja abrió sin celdas'); continue; }
        const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
        for (const [sel, val] of [[cel(0,0),'Tramos'], [cel(0,1),'3'], [cel(0,2),'12'],
                                  [cel(0,3),'=A1*B1*450'],
                                  [cel(1,0),'Soportes'], [cel(1,1),'8'], [cel(1,2),'1200'],
                                  [cel(1,3),'=A2*B2'],
                                  [cel(2,0),'Total'], [cel(2,3),'=SUMA(C1:C2)']]) {
          const el = await q.$(sel); if (!el) { malos.push(w + ': falta ' + sel); break; }
          await el.scrollIntoViewIfNeeded(); await el.click();
          await q.fill(sel, val); await q.dispatchEvent(sel, 'input'); await q.waitForTimeout(90);
        }
        await q.evaluate(() => document.activeElement && document.activeElement.blur());
        await q.waitForTimeout(400);

        const r = await q.evaluate((sid) => {
          const v = (f, c) => { const e = document.querySelector('[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]');
                                return e ? e.value : null; };
          const barra = document.querySelector('.pad-formula');
          const celda = document.querySelector('[data-padonde="full"][data-padcel][data-padref]');
          return {
            C1: v(0,3), C2: v(1,3), C3: v(2,3),
            anchoBarra: barra ? Math.round(barra.getBoundingClientRect().width) : 0,
            anchoCelda: celda ? Math.round(celda.getBoundingClientRect().width) : 0,
            desborde: document.documentElement.scrollWidth > innerWidth,
            recortadas: [...document.querySelectorAll('input.padcel')]
              .filter(e => e.scrollWidth > e.clientWidth + 1)
              .map(e => (e.dataset.padref || 'rot') + ':' + e.value)
          };
        }, sid);
        console.log('    ' + w + 'px · C1 ' + r.C1 + ' · C2 ' + r.C2 + ' · C3 ' + r.C3 +
                    ' · celda ' + r.anchoCelda + 'px · barra ' + r.anchoBarra + 'px');
        if (!/16,200/.test(r.C1 || '')) malos.push(w + ': C1 debería ser 16,200 y dice ' + r.C1);
        if (!/9,600/.test(r.C2 || '')) malos.push(w + ': C2 debería ser 9,600 y dice ' + r.C2);
        if (!/25,800/.test(r.C3 || '')) malos.push(w + ': C3 debería ser 25,800 y dice ' + r.C3);
        if (r.recortadas.length) malos.push(w + ': celdas RECORTADAS → ' + JSON.stringify(r.recortadas));
        if (r.desborde) malos.push(w + ': la hoja desborda a lo ancho');
        /* La barra tiene que ser mucho más ancha que una celda: ésa es toda
         * su razón de ser, y sin el número la «barra de fórmula» podría ser
         * un campo de 60 px que no arregla nada. */
        if (r.anchoBarra < r.anchoCelda * 2)
          malos.push(w + ': la barra de fórmula (' + r.anchoBarra + 'px) no es más ancha que una celda (' + r.anchoCelda + 'px)');
      } finally { await q.close(); }
    }
    if (malos.length) throw new Error(malos.join(' | '));
  });

  await paso('V1.41 · un ciclo se marca y no cuelga; una celda rota no se puede pasar', async () => {
    /* Las dos mitades del filo. Un parser que corre texto de un usuario tiene
     * que fallar RUIDOSO: si un ciclo se colgara, el navegador se muere con
     * la cotización dentro; si una celda rota se pudiera pasar, un número que
     * no existe entraría al precio. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
      await (await q.$('[data-padabrir]')).click(); await q.waitForTimeout(500);
      const sid = await q.evaluate(() => document.querySelector('[data-padonde="full"][data-padcel]').dataset.padcel.split('|')[0]);
      const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';

      const t0 = Date.now();
      for (const [sel, val] of [[cel(0,0),'Vueltas'], [cel(0,1),'=B1'], [cel(0,2),'=C1'], [cel(0,3),'=A1']]) {
        await q.fill(sel, val); await q.dispatchEvent(sel, 'input'); await q.waitForTimeout(90);
      }
      await q.evaluate(() => document.activeElement && document.activeElement.blur());
      await q.waitForTimeout(400);
      const tardo = Date.now() - t0;
      if (tardo > 8000) throw new Error('el ciclo tardó ' + tardo + ' ms: parece un cuelgue');

      const r = await q.evaluate((sid) => {
        const v = (f, c) => document.querySelector('[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]').value;
        return { A1: v(0,1), B1: v(0,2), C1: v(0,3),
                 pie: (document.querySelector('[data-padval]') || {}).textContent };
      }, sid);
      console.log('    ciclo → A1 ' + r.A1 + ' · B1 ' + r.B1 + ' · C1 ' + r.C1 + ' · pie «' + r.pie + '»');
      /* LAS TRES marcadas, no sólo donde se detectó: una celda de un ciclo que
       * enseñara `0` con confianza es peor que el error. */
      for (const k of ['A1', 'B1', 'C1'])
        if (!/#CICLO/.test(r[k] || '')) throw new Error(k + ' no dice #CICLO: ' + r[k]);

      // Y pasarla a un renglón tiene que NEGARSE.
      await q.click(cel(0,3)); await q.waitForTimeout(250);
      const antes = await q.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
        return (m.secciones || []).reduce((a, s) => a + (s.partidas || []).filter(l => l.descripcion).length, 0);
      });
      await q.click('[data-padpasar]'); await q.waitForTimeout(700);
      const despues = await q.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
        return (m.secciones || []).reduce((a, s) => a + (s.partidas || []).filter(l => l.descripcion).length, 0);
      });
      if (despues !== antes)
        throw new Error('dejó pasar una celda que no se puede calcular: ' + antes + ' → ' + despues);
    } finally { await q.close(); }
  });

  await paso('V1.41 · DESGLOSE dice cuántas secciones tienen su propia comisión', async () => {
    /* Sólo el dato. Quien revisa la cotización completa necesita saber que
     * hay comisiones distintas, porque cambia el total — y el conteo sale del
     * MOTOR, no de que la pantalla relea los campos. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);

      const leer = () => q.evaluate(() => {
        const e = document.querySelector('.com-resumen');
        return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
      });
      const sin = await leer();
      if (!sin) throw new Error('DESGLOSE no dice nada de las comisiones');
      if (/tiene|tienen/.test(sin)) throw new Error('avisa de un desvío que no existe: ' + sin);

      // Apartar UNA sección y volver a DESGLOSE.
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
      const campo = q.locator('[data-cel^="com:"][data-cel$=":fts"]').first();
      await campo.scrollIntoViewIfNeeded();
      await campo.fill('12'); await campo.dispatchEvent('change'); await q.waitForTimeout(800);
      await q.locator('.pestana').nth(0).click(); await q.waitForTimeout(600);

      const con = await leer();
      console.log('    sin desvíos: «' + sin + '»\n    con uno:     «' + con + '»');
      if (!/1 de \d+ secciones? tiene su propia comisión/.test(con || ''))
        throw new Error('el conteo no cuadra con lo apartado: ' + con);
    } finally { await q.close(); }
  });

  await paso('V1.41 · un machote SIN reparto no tira la hoja de desglose', async () => {
    /* Venía de antes y hoy no le pega a nadie porque todo documento real trae
     * `reparto` — pero uno que llegue de un rescate o de un archivo viejo
     * dejaría la pantalla en blanco con «Cannot read properties of undefined»,
     * y el error no diría qué campo falta. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const propios = [];
    q.on('pageerror', e => propios.push(e.message));
    try {
      await sembrarGeo(q);
      await q.addInitScript(() => {
        try {
          localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 }));
          localStorage.setItem('fts_machote_v1', JSON.stringify({ v:1,
            guardado_at:new Date().toISOString(), handoff:{},
            machotes:[{ id:'M-SINREP', nombre:'Sin reparto', cliente:'ZZ', moneda:'MXN',
              comision_fts:0.055, comision_cliente:0, margen_deseado:0.4,
              secciones:[{ id:'s-1', nombre:'SECCIÓN 1', mo:[], partidas:[] }] }] }));
        } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-SINREP'; }); await q.waitForTimeout(1200);
      const pinto = await q.evaluate(() => {
        const t = document.querySelector('#hoja');
        return { hay: !!t && t.textContent.length > 200,
                 comisiones: /TABLA DE COMISIONES/.test(t ? t.textContent : '') };
      });
      console.log('    pintó: ' + JSON.stringify(pinto) + ' · errores propios: ' + propios.length);
      if (propios.length) throw new Error('tiró la pantalla: ' + propios[0]);
      if (!pinto.hay) throw new Error('la hoja de desglose quedó vacía');
      if (!pinto.comisiones) throw new Error('no pintó la tabla de comisiones');
    } finally { await q.close(); }
  });

  /* ══ V1.42 ═════════════════════════════════════════════════════════════ */

  await paso('V1.42 · el tercer cuadrante: está en escritorio, se esconde en el teléfono, y es la MISMA hoja', async () => {
    /* La previa no es una foto: es la hoja, con cuatro filas y tres columnas
     * a la vista. Lo que se teclea ahí tiene que estar en el popup y al revés
     * —dos rejillas pintando el mismo dato son dos oportunidades de que una
     * quede vieja—. Y a 380 px NO va: tres cuadrantes no caben, y encogerlos
     * hasta que no se lean es peor que no ponerlos. Se mide el `display`, no
     * se supone por la media query. */
    const malos = [];
    for (const [w, h] of [[1280, 900], [380, 820]]) {
      const q = await b.newPage({ viewport: { width: w, height: h } });
      q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
      try {
        await sembrarGeo(q); await sembrarMachotes(q);
        await q.addInitScript(() => {
          try { localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
        });
        await q.goto(BASE); await q.waitForTimeout(1000);
        await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);

        const r = await q.evaluate(() => {
          const blk = document.querySelector('.blk-pad');
          return {
            hay: !!blk,
            visible: !!blk && getComputedStyle(blk).display !== 'none' &&
                     blk.getBoundingClientRect().width > 0,
            cuadrantes: document.querySelectorAll('.cab > .blk').length,
            filas: document.querySelectorAll('.pad-previa tbody tr').length,
            celdas: document.querySelectorAll('.pad-previa .padcel').length,
            abrir: !!document.querySelector('[data-padabrir]'),
            expandir: !!document.querySelector('.pad-expandir')
          };
        });
        console.log('    ' + w + 'px · ' + JSON.stringify(r));
        if (!r.hay) malos.push(w + ': no se pintó el cuadrante de la hoja');
        if (!r.abrir) malos.push(w + ': no hay manera de abrir la hoja');

        if (w === 380) {
          /* En el teléfono se esconde el CUADRANTE, no la hoja: el botón
           * tiene que seguir ahí o la hoja deja de existir para quien
           * trabaja desde el celular, que es la mitad del equipo. */
          if (r.visible) malos.push('380: el tercer cuadrante NO debería verse');
          continue;
        }
        if (!r.visible) malos.push(w + ': el tercer cuadrante no se ve');
        if (r.cuadrantes !== 3) malos.push(w + ': hay ' + r.cuadrantes + ' cuadrantes, no 3');
        if (r.filas !== 4) malos.push(w + ': la previa trae ' + r.filas + ' filas, no 4');
        if (r.celdas !== 16) malos.push(w + ': la previa trae ' + r.celdas + ' celdas, no 16');
        if (!r.expandir) malos.push(w + ': falta el botón de la esquina que abre el popup');

        // La MISMA hoja: se escribe en la previa y tiene que salir en el popup.
        const sid = await q.evaluate(() =>
          document.querySelector('[data-padonde="previa"][data-padcel]').dataset.padcel.split('|')[0]);
        const prev = (f, c) => '[data-padonde="previa"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
        const full = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
        await q.click(prev(0, 0)); await q.fill(prev(0, 0), 'Desde la previa');
        await q.dispatchEvent(prev(0, 0), 'input'); await q.waitForTimeout(200);
        await q.click(prev(0, 1)); await q.fill(prev(0, 1), '40');
        await q.dispatchEvent(prev(0, 1), 'input'); await q.waitForTimeout(200);
        await q.evaluate(() => document.activeElement && document.activeElement.blur());
        await q.waitForTimeout(300);
        await q.click('.pad-expandir'); await q.waitForTimeout(500);
        const enPopup = await q.evaluate((s) => {
          const e = document.querySelector(s); return e ? e.value : null;
        }, full(0, 0));
        const numPopup = await q.evaluate((s) => {
          const e = document.querySelector(s); return e ? e.value : null;
        }, full(0, 1));
        console.log('    previa → popup: «' + enPopup + '» · «' + numPopup + '»');
        if (enPopup !== 'Desde la previa')
          malos.push(w + ': lo escrito en la previa no llegó al popup: ' + enPopup);
        if (!/40/.test(numPopup || ''))
          malos.push(w + ': el número de la previa no llegó al popup: ' + numPopup);

        // Y de vuelta: se escribe en el popup y la previa lo tiene al cerrar.
        await q.click(full(1, 0)); await q.fill(full(1, 0), 'Desde el popup');
        await q.dispatchEvent(full(1, 0), 'input'); await q.waitForTimeout(200);
        const enPrevia = await q.evaluate((s) => {
          const e = document.querySelector(s); return e ? e.value : null;
        }, prev(1, 0));
        if (enPrevia !== 'Desde el popup')
          malos.push(w + ': lo escrito en el popup no llegó a la previa: ' + enPrevia);
      } finally { await q.close(); }
    }
    if (malos.length) throw new Error(malos.join(' | '));
  });

  await paso('V1.42 · modo selección: las flechas y el clic ponen la celda, ⇧ hace rango, Escape cancela', async () => {
    /* El modo nuevo de la sesión, y el que más fácil se rompe callado: si el
     * clic dejara de tomar la celda, la hoja seguiría funcionando —se puede
     * teclear `A1`— y nadie reportaría nada, sólo dejarían de usarla.
     *
     * Se TECLEA de verdad (`keyboard.type`), no se rellena el campo: `fill`
     * deja el cursor donde quiere y el modo depende de dónde está el cursor.
     * Una prueba con `fill` da verde con el modo roto. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
      await (await q.$('[data-padabrir]')).click(); await q.waitForTimeout(500);
      const sid = await q.evaluate(() =>
        document.querySelector('[data-padonde="full"][data-padcel]').dataset.padcel.split('|')[0]);
      const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
      const valor = (s) => q.evaluate((x) => document.querySelector(x).value, s);
      const escribir = async (s, t) => {
        await q.click(s); await q.fill(s, t); await q.dispatchEvent(s, 'input'); await q.waitForTimeout(90);
      };
      await escribir(cel(0, 1), '3');     // A1
      await escribir(cel(0, 2), '12');    // B1
      await escribir(cel(1, 1), '8');     // A2
      await escribir(cel(1, 2), '1200');  // B2
      const malos = [];

      // 1 · «=» y un clic ponen la referencia; un signo y otro clic la añaden.
      await q.click(cel(2, 3)); await q.waitForTimeout(150);   // C3
      await q.keyboard.type('='); await q.waitForTimeout(120);
      await q.click(cel(0, 1)); await q.waitForTimeout(200);
      const unaRef = await valor(cel(2, 3));
      await q.keyboard.type('*'); await q.waitForTimeout(120);
      await q.click(cel(0, 2)); await q.waitForTimeout(200);
      const dosRefs = await valor(cel(2, 3));
      const marcadas = await q.evaluate(() =>
        [...document.querySelectorAll('.pad-panel .padcel.ref0, .pad-panel .padcel.ref1, .pad-panel .padcel.ref2')]
          .map(e => e.dataset.padref).sort());
      console.log('    clic → «' + unaRef + '» → «' + dosRefs + '» · marcadas ' + JSON.stringify(marcadas));
      if (unaRef !== '=A1') malos.push('un clic debía poner =A1 y puso ' + unaRef);
      if (dosRefs !== '=A1*B1') malos.push('el segundo clic debía dar =A1*B1 y dio ' + dosRefs);
      if (marcadas.join(',') !== 'A1,B1')
        malos.push('las celdas citadas no están marcadas mientras se teclea: ' + JSON.stringify(marcadas));

      // 2 · Enter confirma y deja el VALOR.
      await q.keyboard.press('Enter'); await q.waitForTimeout(400);
      const confirmado = await valor(cel(2, 3));
      const sinMarcas = await q.evaluate(() =>
        document.querySelectorAll('.padcel.ref0, .padcel.ref1, .padcel.ref2').length);
      console.log('    Enter → «' + confirmado + '» · marcas que quedan ' + sinMarcas);
      if (!/36/.test(confirmado)) malos.push('Enter debía dejar 36 (3 × 12) y dejó ' + confirmado);
      if (sinMarcas !== 0) malos.push('quedaron ' + sinMarcas + ' marcas después de confirmar');

      // 3 · Las flechas, una tras otra, y ⇧ para el rango.
      await q.click(cel(3, 3)); await q.waitForTimeout(150);   // C4
      await q.keyboard.type('='); await q.waitForTimeout(120);
      await q.keyboard.press('ArrowUp'); await q.waitForTimeout(150);
      const flecha1 = await valor(cel(3, 3));
      await q.keyboard.press('ArrowUp'); await q.waitForTimeout(150);
      const flecha2 = await valor(cel(3, 3));
      await q.keyboard.press('Shift+ArrowLeft'); await q.waitForTimeout(150);
      const conRango = await valor(cel(3, 3));
      console.log('    flechas → «' + flecha1 + '» → «' + flecha2 + '» → ⇧ «' + conRango + '»');
      if (flecha1 !== '=C3') malos.push('la primera flecha debía dar =C3 y dio ' + flecha1);
      /* LA SEGUNDA es la que se rompía: `puedeInsertar` mira el carácter
       * anterior al cursor, y tras insertar `C3` ese carácter es un `3`. */
      if (flecha2 !== '=C2') malos.push('la SEGUNDA flecha debía dar =C2 y dio ' + flecha2);
      if (conRango !== '=B2:C2') malos.push('⇧+← debía dar el rango =B2:C2 y dio ' + conRango);

      // 4 · Escape cancela de verdad: devuelve lo que había ANTES.
      await q.keyboard.press('Escape'); await q.waitForTimeout(400);
      const trasEscape = await q.evaluate((sid) => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
        const sec = (m.secciones || []).find(s => s.id === sid);
        const g = ((sec || {}).pad || {}).hoja || [];
        return String((g[3] || [])[3] || '');
      }, sid);
      console.log('    Escape → la celda guardada dice «' + trasEscape + '»');
      /* Se mira el DOCUMENTO, no la pantalla: el defecto que esto cazó era
       * que Escape restauraba desde un atributo que el repintado acababa de
       * reescribir con el texto a medias, así que «cancelar» guardaba. */
      if (trasEscape !== '') malos.push('Escape dejó «' + trasEscape + '» guardado en la celda');

      // 5 · Sin modo, un clic NO escribe en la celda anterior.
      await q.click(cel(4, 3)); await q.waitForTimeout(150);
      await q.keyboard.type('7'); await q.waitForTimeout(150);
      await q.click(cel(0, 1)); await q.waitForTimeout(250);
      const sinModo = await valor(cel(4, 3));
      console.log('    sin modo → la celda quedó en «' + sinModo + '»');
      if (!/7/.test(sinModo) || /A1/.test(sinModo))
        malos.push('un clic sin modo contaminó la celda: ' + sinModo);

      /* 6 · Y con la fórmula CERRADA, el clic tampoco escribe dentro.
       * Éste es el defecto que cazó esta prueba: el paréntesis que cierra
       * estaba en la lista de caracteres que habilitan tomar celda, así que
       * terminar `=suma(A1:B2)` y dar clic en otra celda dejaba
       * `=suma(A1:B2)A5` y un `#SINTAXIS` en la cara. */
      await escribir(cel(5, 3), '=suma(A1:B1)');
      await q.click(cel(0, 1)); await q.waitForTimeout(900);
      const cerrada = await q.evaluate((sid) => {
        const m = JSON.parse(localStorage.getItem('fts_machote_v1')).machotes.find(x => x.id === 'M-1041');
        const sec = (m.secciones || []).find(s => s.id === sid);
        return String((((sec || {}).pad || {}).hoja || [])[5] ? (sec.pad.hoja[5][3] || '') : '');
      }, sid);
      console.log('    fórmula cerrada + clic → «' + cerrada + '»');
      if (cerrada !== '=suma(A1:B1)')
        malos.push('el clic ensució una fórmula ya cerrada: ' + cerrada);

      if (malos.length) throw new Error(malos.join(' | '));
    } finally { await q.close(); }
  });

  await paso('V1.42 · las palabras en español desde la pantalla, y la rejilla llega hasta J10', async () => {
    /* El motor ya las prueba una por una; esto es la otra mitad: que lleguen
     * ENTERAS desde el teclado a la celda, con el acento incluido. Una tilde
     * que se pierde entre el `input` y el evaluador no la ve ninguna prueba
     * de motor. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    try {
      await sembrarGeo(q); await sembrarMachotes(q);
      await q.addInitScript(() => {
        try { localStorage.setItem('fts_suite_session', JSON.stringify({
          token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
          scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
      });
      await q.goto(BASE); await q.waitForTimeout(1000);
      await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
      await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
      await (await q.$('[data-padabrir]')).click(); await q.waitForTimeout(500);
      const sid = await q.evaluate(() =>
        document.querySelector('[data-padonde="full"][data-padcel]').dataset.padcel.split('|')[0]);
      const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
      const escribir = async (s, t) => {
        await q.click(s); await q.fill(s, t); await q.dispatchEvent(s, 'input'); await q.waitForTimeout(90);
      };
      await escribir(cel(0, 1), '3'); await escribir(cel(0, 2), '12');
      await escribir(cel(1, 1), '8'); await escribir(cel(1, 2), '1200');
      // La rejilla llega a J10: se escribe en la esquina y se cita desde otra celda.
      await escribir(cel(9, 10), '77');                    // J10
      await escribir(cel(2, 1), '=J10*2');                 // A3
      await escribir(cel(3, 1), '=suma(A1:B2)');           // A4
      await escribir(cel(4, 1), '=MULTIPLICACIÓN(A1,B1)'); // A5
      await escribir(cel(5, 1), '=división(B2,A2)');       // A6
      await q.evaluate(() => document.activeElement && document.activeElement.blur());
      await q.waitForTimeout(400);
      const r = await q.evaluate((sid) => {
        const v = (f, c) => document.querySelector(
          '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]').value;
        return { esquina: v(2, 1), suma: v(3, 1), mult: v(4, 1), div: v(5, 1),
                 hayJ10: !!document.querySelector('[data-padonde="full"][data-padref="J10"]') };
      }, sid);
      console.log('    J10×2 ' + r.esquina + ' · suma ' + r.suma + ' · mult ' + r.mult + ' · div ' + r.div);
      const malos = [];
      if (!r.hayJ10) malos.push('no existe la celda J10: la rejilla no llega a 10 × 10');
      if (!/154/.test(r.esquina)) malos.push('J10 no se puede citar: ' + r.esquina);
      if (!/1,223/.test(r.suma)) malos.push('suma() en minúsculas no dio 1,223: ' + r.suma);
      if (!/36/.test(r.mult)) malos.push('MULTIPLICACIÓN con acento no dio 36: ' + r.mult);
      if (!/150/.test(r.div)) malos.push('división con acento no dio 150: ' + r.div);
      if (malos.length) throw new Error(malos.join(' | '));
    } finally { await q.close(); }
  });

  await paso('V1.42 · en la PREVIA de un tercio tampoco se recorta nada, a los cuatro anchos', async () => {
    /* La prueba de recorte de la V1.41 vivía dentro del popup. El cuadrante
     * nuevo es un tercio de ancho: si algo se iba a recortar, era ahí.
     *
     * ⚠️ Y se exige que se hayan MEDIDO celdas: una lista vacía de recortadas
     * se ve igual cuando no hay recorte que cuando no se midió nada —§20 #11
     * y #18—, y en el teléfono la previa está escondida a propósito. */
    const malos = [];
    for (const [w, h] of [[1280, 900], [900, 900], [760, 900], [380, 820]]) {
      const q = await b.newPage({ viewport: { width: w, height: h } });
      q.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
      try {
        await sembrarGeo(q); await sembrarMachotes(q);
        await q.addInitScript(() => {
          try { localStorage.setItem('fts_suite_session', JSON.stringify({
            token:'p.p.p', actor:'zz.prueba', nombre:'ZZ Prueba', empleado_id:null,
            scopes:['comercial:read'], exp: Math.floor(Date.now()/1000)+3600 })); } catch (e) {}
        });
        await q.goto(BASE); await q.waitForTimeout(1000);
        await q.evaluate(() => { location.hash = '#/m/M-1041'; }); await q.waitForTimeout(900);
        await q.locator('.pestana').nth(1).click(); await q.waitForTimeout(400);
        await (await q.$('[data-padabrir]')).click(); await q.waitForTimeout(500);
        const sid = await q.evaluate(() =>
          document.querySelector('[data-padonde="full"][data-padcel]').dataset.padcel.split('|')[0]);
        const cel = (f, c) => '[data-padonde="full"][data-padcel="' + sid + '|' + f + '|' + c + '"]';
        for (const [s, v] of [[cel(0,0),'Tramos'], [cel(0,1),'3'], [cel(0,2),'12'],
                              [cel(0,3),'=A1*B1*450'], [cel(1,0),'Soportes'],
                              [cel(1,1),'8'], [cel(1,2),'1200'], [cel(1,3),'=A2*B2']]) {
          await q.click(s); await q.fill(s, v); await q.dispatchEvent(s, 'input'); await q.waitForTimeout(80);
        }
        await q.evaluate(() => document.activeElement && document.activeElement.blur());
        await q.waitForTimeout(300);
        // Se cierra el popup para medir la previa como se ve de verdad.
        const cerrar = await q.$('.pad-cerrar');
        if (cerrar) { await cerrar.click(); await q.waitForTimeout(400); }
        const r = await q.evaluate(() => {
          /* `data-padonde` va en el PROPIO input, no en un ancestro: con el
           * selector de descendencia esto devolvía cero y la prueba pasaba
           * midiendo nada. Es §20 #11 mordiendo a la prueba misma. */
          const prev = [...document.querySelectorAll('input.padcel[data-padonde="previa"]')];
          const visible = prev.filter(e => e.getBoundingClientRect().width > 0);
          return {
            total: prev.length, medidas: visible.length,
            valores: visible.filter(e => e.dataset.padref).map(e => e.value).filter(Boolean),
            recortadas: visible.filter(e => e.scrollWidth > e.clientWidth + 1)
              .map(e => (e.dataset.padref || 'rot') + ':' + e.value),
            desborde: document.documentElement.scrollWidth > innerWidth
          };
        });
        console.log('    ' + w + 'px · previa: ' + r.medidas + ' de ' + r.total +
                    ' celdas a la vista · recortadas ' + JSON.stringify(r.recortadas));
        if (r.recortadas.length) malos.push(w + ': RECORTADAS en la previa → ' + JSON.stringify(r.recortadas));
        if (r.desborde) malos.push(w + ': la pantalla desborda a lo ancho');
        if (w === 380) {
          if (r.medidas !== 0) malos.push('380: la previa debería estar escondida y hay ' + r.medidas + ' celdas a la vista');
        } else {
          if (r.medidas !== 16) malos.push(w + ': se midieron ' + r.medidas + ' celdas de la previa, no 16');
          if (!r.valores.some(v => /16,200/.test(v)))
            malos.push(w + ': la previa no está enseñando el importe calculado: ' + JSON.stringify(r.valores));
        }
      } finally { await q.close(); }
    }
    if (malos.length) throw new Error(malos.join(' | '));
  });

  await paso('sin errores de consola propios del prototipo', async () => {
    if (errs.length) throw new Error(errs.slice(0, 4).join(' | '));
    if (delEntorno.length) console.log('   (' + delEntorno.length +
      ' fallo(s) de red del sandbox, filtrados: Google Fonts y el version.json ' +
      'del vigilante, que no se puede pedir por file://)');
  });

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron.' +
              (saltadas ? '  (' + saltadas + ' saltadas por SOLO=' + process.env.SOLO + ')' : ''));
  if (errs.length) { console.log('\nErrores de consola:'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  await b.close();
  process.exit(mal ? 1 : 0);
})();
