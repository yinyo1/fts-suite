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
  // El contenedor no tiene salida a fonts.googleapis.com, que fts-styles.css
  // importa. Ese fallo es del entorno de prueba, no del prototipo: se filtra
  // por nombre y se reporta aparte, nunca callando el resto.
  const delEntorno = [];
  const esDelEntorno = (t) => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|fonts\.googleapis|fonts\.gstatic/.test(t);
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
                 boton: b ? Math.round(b.getBoundingClientRect().width) : -1 };
      });
      if (r.ancho < 120) throw new Error('a ' + w + 'px el precio mide ' + r.ancho + 'px de ancho');
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
    // Y lo guardado sigue siendo la RAZÓN, no el porcentaje.
    const guardado = await p.evaluate(() => {
      const c = localStorage.getItem('fts_machote_v1');
      if (!c) return null;
      const m = JSON.parse(c).machotes.find(x => x.id === 'M-1043');
      return m ? m.factor_proteccion : null;
    });
    if (guardado !== null && Math.abs(guardado - 0.10) > 1e-6)
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

  await paso('se puede borrar un machote en creación', async () => {
    await ir('#/');
    const antes = await p.locator('.item[href^="#/m/"]').count();
    p.once('dialog', d => d.accept());
    /* `:visible` NO es un adorno. Desde V1.21 cada machote se pinta DOS veces
     * —el renglón de la tabla y la tarjeta— y sólo una de las dos se ve según
     * el ancho. A 380 px la primera coincidencia es el botón de la tabla, que
     * está oculto, y `click()` se queda esperando a que aparezca hasta agotar
     * el tiempo. Hay que apretar el que la persona ve. */
    await p.locator('[data-borrar]:visible').first().click();
    await p.waitForTimeout(400);
    const desp = await p.locator('.item[href^="#/m/"]').count();
    if (desp !== antes - 1) throw new Error('no borró: ' + antes + ' → ' + desp);
  });

  await paso('un machote enviado a Odoo no se puede borrar', async () => {
    await ir('#/m/M-1042'); await hoja('DESGLOSE');
    await p.locator('[data-estado]').selectOption('enviado'); await p.waitForTimeout(400);
    await irSuave('#/');
    /* Se engancha por `[data-mid]`, que es el mismo en las DOS pinturas —el
     * renglón de la tabla y la tarjeta del teléfono— y se exige en ambas: el
     * candado tiene que estar donde sea que la persona esté mirando. */
    const r = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('[data-mid="M-1042"]')];
      if (!filas.length) return null;
      return {
        n: filas.length,
        borrar: filas.some(f => f.querySelector('[data-borrar]')),
        candado: filas.every(f => f.querySelector('.candado'))
      };
    });
    if (!r) throw new Error('no encontré M-1042 en la lista');
    if (r.borrar) throw new Error('le dejó el botón de borrar');
    if (!r.candado) throw new Error('no muestra por qué no se puede');
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
    const campo = p.locator('[data-cel="comision_fts"]');
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
      return m ? m.comision_fts : null;
    });
    if (guardado === null) throw new Error('no alcanzó a guardar');
    if (Math.abs(guardado - 0.08) > 1e-8) throw new Error('guardó ' + guardado + ', esperaba 0.08');
    console.log('    pantalla 5.5% · almacén 0.055 · tecleado 8% → 0.08');
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

  await paso('las comisiones SÍ son de toda la cotización', async () => {
    /* La otra mitad de lo que pidió: "lo unico compartido es la comision de
     * fts y del usuario". Una prueba que sólo mirara la separación dejaría
     * pasar que se separara TAMBIÉN esto, que es justo lo que no debe pasar. */
    await ir('#/m/M-1041');
    await p.locator('.pestana').nth(1).click(); await p.waitForTimeout(300);
    await p.fill('[data-cel="comision_fts"]', '9');
    await p.dispatchEvent('[data-cel="comision_fts"]', 'change');
    await p.waitForTimeout(900);
    await p.locator('.pestana').nth(2).click(); await p.waitForTimeout(350);
    const enDos = await p.inputValue('[data-cel="comision_fts"]');
    if (Number(enDos) !== 9)
      throw new Error('la comisión no se compartió entre secciones: ' + enDos);
    const guardado = await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('fts_machote_v1'));
      return d.machotes.find(x => x.id === 'M-1041').comision_fts;
    });
    if (Math.abs(Number(guardado) - 0.09) > 1e-9)
      throw new Error('en el almacén quedó ' + guardado + ', se esperaba 0.09');
    console.log('    9 % en las dos secciones · almacén 0.09, una sola vez');
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
      if (t.indexOf('BBVA México') < 0)
        throw new Error('siguió mostrando el nombre guardado: ' + t);
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

  await paso('la DEMO no se sube al servidor: no es trabajo de nadie', async () => {
    await ir('#/');                      // localStorage limpio => en pantalla va la demo
    await p.evaluate(() => { window.__guardadosAlServidor = 0; });
    await p.reload(); await p.waitForTimeout(1200);
    const n = await p.evaluate(() => window.__guardadosAlServidor || 0);
    if (n) throw new Error('subió ' + n + ' machote(s) de ejemplo al servidor');
    // Y la pantalla sigue mostrando la demo, no una lista vacía.
    const filas = await p.$$eval('[data-hist]', els => els.length);
    if (!filas) throw new Error('se quedó sin machotes: borró la demo');
    console.log('    0 subidas · ' + filas + ' machote(s) de ejemplo intactos en pantalla');
  });

  await paso('con el servidor colgado: se guarda aquí y el pulso NO miente', async () => {
    /* Página propia, sin el guion que limpia: aquí se mide justo lo contrario
     * —que lo tecleado sobreviva— y con el servidor sin contestar. */
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
await sembrarGeo(q);
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba', nombre: 'ZZ Prueba',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false
        }));
        localStorage.removeItem('fts_machote_v1');
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
      // El webhook que no existe SIEMPRE tiene que estar: es el tapón de fondo.
      if (!/orden-crear/.test(t)) throw new Error('no dice que el webhook no existe: ' + t.slice(0, 120));
      if (!/No se arregla aquí/i.test(t)) throw new Error('no separa lo que no toca al analista');
      console.log('    ' + t.slice(0, 100) + '…');
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
          dice_de_quien: !!(aj && /Ricardo/.test(aj.textContent)),
          /* LO IMPORTANTE: el trabajo de otro NO entra al almacén de uno. */
          en_el_almacen: (JSON.parse(localStorage.getItem('fts_machote_v1') || '{"machotes":[]}')
            .machotes || []).map(m => m.nombre)
        };
      });
      if (!r.salen_los_dos) throw new Error('no salieron los dos machotes');
      if (!r.el_ajeno_se_marca) throw new Error('el ajeno no se distingue del propio');
      if (!r.el_ajeno_no_se_borra) throw new Error('le dejó el botón de borrar al ajeno');
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

      q.once('dialog', d => d.accept());
      await q.click('tr.rw:has-text("Ejemplo que estorba") [data-borrar]');
      await q.waitForTimeout(500);
      if ((await hay()).some(t => t.indexOf('Ejemplo que estorba') >= 0))
        throw new Error('no se borró ni siquiera en pantalla');

      // LO QUE IMPORTA: recargar, con el servidor todavía sirviéndolo.
      await q.reload(); await q.waitForTimeout(1800);
      const despues = await hay();
      if (despues.some(t => t.indexOf('Ejemplo que estorba') >= 0))
        throw new Error('VOLVIÓ al recargar: la lápida no lo detuvo');
      if (!despues.some(t => t.indexOf('Uno que se queda') >= 0))
        throw new Error('se llevó de más: desapareció el que NO se borró');

      const lapida = await q.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('fts_machote_borrados_v1') || '{}'); }
        catch (e) { return {}; }
      });
      if (!lapida['M-1041']) throw new Error('no quedó lápida de M-1041');
      if (lapida['M-OTRO']) throw new Error('sepultó uno que nadie borró');
      console.log('    borrado, recargado y no volvió · lápidas: ' + Object.keys(lapida).join(', '));
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

  await paso('V1.26 · foránea sin viaje: se ve el bloqueo y se dice qué hacer', async () => {
    await ir('#/m/M-1041');
    await p.click('[data-frec*="San Antonio"]');
    await p.waitForTimeout(500);
    await hoja('Suministro');
    await p.waitForTimeout(500);

    const t = (await p.textContent('.viaje-blk')).replace(/\s+/g, ' ');
    if (!/no la deja terminar/i.test(t))
      throw new Error('no dice que bloquea: ' + t.slice(0, 160));
    if (!/San Antonio/.test(t)) throw new Error('no dice dónde se ejecuta: ' + t.slice(0, 160));
    if (!/marca arriba que no se ocupa/i.test(t))
      throw new Error('no ofrece la salida explícita: ' + t.slice(0, 160));

    // Y los cinco conceptos, elegibles: no aparecen todos puestos, se agregan.
    const chips = await p.$$eval('[data-concepto]', e => e.map(x => x.textContent.trim()));
    if (chips.length !== 5) throw new Error('conceptos ofrecidos: ' + JSON.stringify(chips));

    // La barra tiene que contarlo como dura.
    const barra = (await p.textContent('.fija')).replace(/\s+/g, ' ');
    if (!/duras/.test(barra)) throw new Error('la barra no cuenta duras: ' + barra);

    // Agregar UNO desbloquea, y el renglón entra como Viaje.
    await p.click('[data-concepto*="vuelos"]');
    await p.waitForTimeout(700);
    /* ⚠️ `textContent` NO ve el valor de un `<input>`, y la descripción de una
     * partida es un campo, no texto. Buscar «Vuelos» con `:has-text` o con
     * `textContent` no encuentra nada aunque el renglón esté ahí — que es
     * exactamente lo que pasó la primera vez que corrió esta prueba. */
    const r = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('table.rejilla tbody tr')];
      const f = filas.find(x => {
        const d = x.querySelector('[data-cel$=":descripcion"]');
        return d && /Vuelos/i.test(d.value);
      });
      const sel = f && f.querySelector('[data-cel$=":tipo"]');
      return { hay: !!f, tipo: sel ? sel.value : null,
               sigue_avisando: !!document.querySelector('.viaje-blk .aviso.bad') };
    });
    if (!r.hay) throw new Error('no entró el renglón de vuelos');
    if (r.tipo !== 'Viaje') throw new Error('entró con tipo: ' + r.tipo);
    if (r.sigue_avisando) throw new Error('sigue avisando después de agregarlo');
    console.log('    bloquea, dice dónde y qué hacer · «+ Vuelos» lo resuelve y entra como Viaje');
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
    await p.waitForTimeout(500);
    await p.click('[data-concepto*="vuelos"]');
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

  await paso('sin errores de consola propios del prototipo', async () => {
    if (errs.length) throw new Error(errs.slice(0, 4).join(' | '));
    if (delEntorno.length) console.log('   (' + delEntorno.length +
      ' fallo(s) de red del sandbox, filtrados: fts-styles.css importa Google Fonts)');
  });

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron.' +
              (saltadas ? '  (' + saltadas + ' saltadas por SOLO=' + process.env.SOLO + ')' : ''));
  if (errs.length) { console.log('\nErrores de consola:'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  await b.close();
  process.exit(mal ? 1 : 0);
})();
