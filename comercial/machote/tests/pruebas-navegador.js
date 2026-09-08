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

  const paso = async (n, fn) => {
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
  await paso('la lista carga con machotes y órdenes', async () => {
    await ir('#/');
    const n = await p.locator('.item').count();
    if (n < 6) throw new Error('pocas tarjetas: ' + n);
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

  await paso('los diez renglones de mano de obra están siempre, en sus tres grupos', async () => {
    await ir('#/m/M-1041');
    await hoja('Suministro');
    const g = await p.locator('#hoja tr.grupo').allTextContents();
    const esperados = ['Diseño y Programación', 'En Planta', 'Extras'];
    for (const e of esperados) if (!g.some(x => x.indexOf(e) >= 0)) throw new Error('falta grupo ' + e);
    const rot = await p.locator('#hoja td.rotulo').allTextContents();
    const soloMo = rot.filter(x => x !== 'TOTAL');
    if (soloMo.length !== 10) throw new Error('renglones de MO: ' + soloMo.length);
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

  await paso('la estación 3.0 no deja cerrar el handoff incompleto', async () => {
    await ir('#/orden/O-9001');
    if (!(await p.locator('#btnConf').isDisabled())) throw new Error('el botón estaba habilitado');
  });

  await paso('marcar todo habilita el cierre, y la marca no se pierde', async () => {
    await ir('#/orden/O-9001');
    for (let i = 0; i < 12; i++) {
      const pend = p.locator('[data-ent]:not(:checked)');
      if (await pend.count() === 0) break;
      await pend.first().check(); await p.waitForTimeout(120);
    }
    if (await p.locator('#btnConf').isDisabled()) throw new Error('sigue deshabilitado');
    await p.click('#btnConf'); await p.waitForTimeout(250);
    if (!/Handoff cerrado/.test(await p.textContent('#vista'))) throw new Error('no cerró');
  });

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
    for (const h of ['#/', '#/m/M-1041', '#/rev/M-1044', '#/orden/O-9002', '#/ap/M-1041']) {
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
      const td = document.querySelector('.rejilla.tarjetas tbody td');
      const th = document.querySelector('.rejilla.tarjetas thead');
      return { disp: td && getComputedStyle(td).display,
               cabOculta: th ? getComputedStyle(th).display === 'none' : false,
               rotulo: !!document.querySelector('.rejilla.tarjetas td.rotulo') };
    });
    if (r.disp !== 'flex') throw new Error('las celdas no se apilan: ' + r.disp);
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
    for (const h of ['#/', '#/m/M-1041', '#/orden/O-9002']) {
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
    const n = await p.locator('#hoja .rejilla.tarjetas').first()
      .locator('tbody tr:not(.grupo):not(.total):visible').count();
    if (n !== 10) throw new Error('renglones de mano de obra visibles: ' + n);
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

  await paso('al entrar, el filtro de persona arranca en los propios', async () => {
    /* Es lo que alguien quiere ver al abrir. Y como es un filtro PUESTO que
     * nadie eligió, la pantalla tiene que decirlo: si no, se ve una lista
     * corta y parece que faltan machotes. */
    await ir('#/');
    const v = await p.$eval('#fPersona', el => el.value);
    if (v !== 'zz.prueba') throw new Error('no arrancó en el usuario de la sesión: «' + v + '»');
    const t = (await p.textContent('#vista')).replace(/\s+/g, ' ');
    if (!/Viendo sólo lo tuyo/i.test(t)) throw new Error('no avisa que hay un filtro puesto');
    // Y se puede quitar: «Todas las personas» devuelve la lista completa.
    const propios = await p.$$eval('[data-hist]', e => e.length);
    await p.selectOption('#fPersona', ''); await p.waitForTimeout(320);
    const todos = await p.$$eval('[data-hist]', e => e.length);
    if (todos < propios) throw new Error('quitar el filtro enseñó MENOS: ' + propios + ' → ' + todos);
    console.log('    míos ' + propios + ' · todos ' + todos);
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
    if (r.mo !== 10) throw new Error('renglones de mano de obra: ' + r.mo);
    if (r.conTarifa !== 10) throw new Error('sin tarifa de plantilla: ' + (10 - r.conTarifa));
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
    await p.locator('[data-borrar]').first().click();
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
    if (r.mo !== 10) throw new Error('nació con ' + r.mo + ' renglones de mano de obra, no 10');
    if (r.part !== 30) throw new Error('nació con ' + r.part + ' partidas, no 30');
    if (r.mg === null) throw new Error('nació sin multiplicadores propios');
    console.log('    10 de mano de obra · 30 partidas · materiales ' + r.mg);
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

  await paso('los dos botones de respaldo están y se alcanzan', async () => {
    await ir('#/');
    const r = await p.evaluate(() => {
      const b = document.querySelector('#bExportar');
      const f = document.querySelector('#fImportar');
      const lab = f && f.closest('label');
      const rb = b && b.getBoundingClientRect();
      const rl = lab && lab.getBoundingClientRect();
      return { hayB: !!b, hayF: !!f, txt: b && b.textContent,
               altoB: rb && Math.round(rb.height), altoL: rl && Math.round(rl.height),
               acepta: f && f.getAttribute('accept') };
    });
    if (!r.hayB || !r.hayF) throw new Error('faltan los controles');
    if (!/Exportar todo \(\d+\)/.test(r.txt || '')) throw new Error('el botón dice: ' + r.txt);
    if (r.altoB < 44 || r.altoL < 44)
      throw new Error('no se alcanzan con el pulgar: ' + r.altoB + ' / ' + r.altoL + ' px');
    if (!/json/.test(r.acepta || '')) throw new Error('el input no filtra .json');
    console.log('    ' + r.txt + ' · ' + r.altoB + ' y ' + r.altoL + ' px de alto');
  });

  await paso('cuando el guardado falla, el aviso tapa y no se puede ignorar', async () => {
    /* El pulso dice la verdad pero se puede no ver. Esto no. */
    const q = await b.newPage({ viewport: { width: 380, height: 780 } });
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

  /* ── La franja de sincronización (#140 · A) ────────────────────────────
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

  await paso('franja: "a salvo" cuando lo local coincide con el servidor real', async () => {
    const q = await frPagina([FR_IGUAL]);
    try {
      const t = (await q.textContent('#franjaSync')).trim();
      if (!/1 de 1 a salvo/.test(t)) throw new Error('dice: ' + t);
      const cls = await q.getAttribute('#franjaSync', 'class');
      if (!/f-ok/.test(cls)) throw new Error('no está en tono discreto: ' + cls);
      console.log('    "' + t + '" · ' + cls);
    } finally { await q.close(); }
  });

  await paso('franja: el orden de las llaves NO cuenta como cambio (la trampa de jsonb)', async () => {
    const q = await frPagina([FR_VOLTEADO]);
    try {
      const t = (await q.textContent('#franjaSync')).trim();
      if (!/1 de 1 a salvo/.test(t)) throw new Error('lo dio por pendiente sólo por el orden: ' + t);
      console.log('    con las llaves al revés sigue diciendo: "' + t + '"');
    } finally { await q.close(); }
  });

  await paso('franja: uno que el servidor NO tiene sale como por subir', async () => {
    const q = await frPagina([FR_IGUAL, { id: 'M-SOLO-AQUI', nombre: 'Nunca subió' }], false);
    try {
      const t = (await q.textContent('#franjaSync')).trim();
      if (!/1 por subir/.test(t) || !/1 de 2 a salvo/.test(t)) throw new Error('dice: ' + t);
      const cls = await q.getAttribute('#franjaSync', 'class');
      if (!/f-pend/.test(cls)) throw new Error('no se nota: ' + cls);
      console.log('    "' + t + '" · ' + cls);
    } finally { await q.close(); }
  });

  await paso('franja: editar lo ya subido vuelve a ponerlo por subir', async () => {
    const q = await frPagina([{ id: 'M-PRUEBA-140-H', nombre: 'Cotizacion historial v2 EDITADA' }], false);
    try {
      const t = (await q.textContent('#franjaSync')).trim();
      if (!/0 de 1 subidos/.test(t)) throw new Error('dice: ' + t);
      console.log('    "' + t + '"');
    } finally { await q.close(); }
  });

  await paso('franja: "Cuáles faltan" marca DENTRO de la lista, sin cambiar de vista', async () => {
    const q = await frPagina([FR_IGUAL, { id: 'M-SOLO-AQUI', nombre: 'Nunca subió' }], false);
    try {
      const urlAntes = q.url();
      await q.click('#fjMarcar'); await q.waitForTimeout(200);
      const marcadas = await q.$$eval('.fila.solo-aqui', els => els.map(e => e.getAttribute('data-mid')));
      if (q.url() !== urlAntes) throw new Error('cambió de vista');
      if (JSON.stringify(marcadas) !== JSON.stringify(['M-SOLO-AQUI']))
        throw new Error('marcó: ' + JSON.stringify(marcadas));
      if (!/Quitar/.test(await q.textContent('#fjMarcar')))
        throw new Error('el botón no ofrece quitar la marca');
      await q.click('#fjMarcar'); await q.waitForTimeout(150);
      if ((await q.$$('.fila.solo-aqui')).length) throw new Error('no quitó la marca');
      console.log('    marcó ' + JSON.stringify(marcadas) + ' y la quita al volver a apretar');
    } finally { await q.close(); }
  });

  await paso('franja: "Subir ahora" rescata al rezagado que el arranque no pudo subir', async () => {
    /* El botón es para cuando el rescate automático del arranque NO alcanzó
     * —servidor caído en ese momento—. Así que el servidor rechaza mientras
     * carga y se cura justo antes de apretar. */
    const q = await frPagina([FR_IGUAL, { id: 'M-REZAGADO', nombre: 'No pudo subir al arrancar' }], false);
    try {
      const antes = await q.evaluate(() => window.__guard.length);
      if (antes) throw new Error('subió con el servidor caído: ' + antes);
      const t1 = (await q.textContent('#franjaSync')).trim();
      if (!/1 por subir/.test(t1)) throw new Error('la franja no lo ve pendiente: ' + t1);

      await q.evaluate(() => { window.__permitir = true; });
      await q.click('#fjSubir'); await q.waitForTimeout(2000);

      const ids = await q.evaluate(() => window.__guard.map(x => x.id_local));
      if (ids.indexOf('M-REZAGADO') < 0) throw new Error('no rescató al rezagado: ' + JSON.stringify(ids));
      if (new Set(ids).size !== ids.length) throw new Error('lo subió dos veces: ' + JSON.stringify(ids));
      console.log('    con el servidor caído: 0 subidas · tras el botón subió ' + JSON.stringify(ids));
    } finally { await q.close(); }
  });

  await paso('franja: subir dos veces NO duplica — el servidor reconcilia por id_local', async () => {
    const q = await frPagina([{ id: 'M-DOBLE', nombre: 'Se sube dos veces' }]);
    try {
      // El arranque ya lo subió una vez. Se aprieta el botón dos veces más.
      const b1 = await q.$('#fjSubir'); if (b1) { await b1.click(); await q.waitForTimeout(900); }
      const b2 = await q.$('#fjSubir'); if (b2) { await b2.click(); await q.waitForTimeout(900); }
      const ids = await q.evaluate(() => window.__guard.map(x => x.id_local));
      const veces = ids.filter(x => x === 'M-DOBLE').length;
      if (veces !== 1) throw new Error('mandó M-DOBLE ' + veces + ' veces (debía ser 1)');
      console.log('    un solo envío de M-DOBLE aunque se apretó de más · ' + JSON.stringify(ids));
    } finally { await q.close(); }
  });

  await paso('franja: sin poder preguntar al servidor lo DICE, no lo inventa', async () => {
    /* El modo de fallo que esto cierra: una franja que ante un servidor mudo
     * asuma "todo bien". Diría "a salvo" justo el día que no lo está. */
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await q.addInitScript(() => {
      try {
        localStorage.setItem('fts_suite_session', JSON.stringify({
          token: 'prueba.prueba.prueba', actor: 'zz.prueba.140', nombre: 'ZZ',
          empleado_id: null, scopes: ['comercial:read'],
          exp: Math.floor(Date.now() / 1000) + 3600, debe_cambiar_password: false }));
        localStorage.setItem('fts_machote_v1', JSON.stringify({
          v: 1, guardado_at: new Date().toISOString(), handoff: {},
          machotes: [{ id: 'M-X', nombre: 'algo' }] }));
      } catch (e) {}
      const o = window.fetch;
      window.fetch = function (u) {
        if (String(u).indexOf('/comercial/') >= 0) return Promise.reject(new Error('sin red'));
        return o.apply(this, arguments);
      };
    });
    try {
      await q.goto(BASE); await q.waitForTimeout(1600);
      const t = (await q.textContent('#franjaSync')).trim();
      const cls = await q.getAttribute('#franjaSync', 'class');
      if (/a salvo en el servidor/.test(t))
        throw new Error('afirmó que está a salvo sin poder preguntar: ' + t);
      if (!/No se pudo confirmar/.test(t)) throw new Error('dice: ' + t);
      if (!/f-duda/.test(cls)) throw new Error('tono: ' + cls);
      console.log('    "' + t.replace(/Cuáles.*/, '') + '"');
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

  await paso('la demo no se cuenta como pendiente en la franja', async () => {
    /* Si se contara, la franja diría «4 por subir» para siempre y «Subir
     * ahora» nunca podría bajar el número: un pendiente que no se puede
     * resolver es peor que no avisar. */
    await ir('#/'); await p.waitForTimeout(400);
    {
      const q = p;
      const e = await q.evaluate(() => window.MachoteAlmacen.estadoServidor(window.DEMO.MACHOTES));
      if (e.total !== 0) throw new Error('cuenta ' + e.total + ' machote(s) que no son de nadie');
      if (!e.demos) throw new Error('no reporta cuántos ejemplos descontó');
      const t = (await q.textContent('#franjaSync')) || '';
      if (/por subir/i.test(t)) throw new Error('la franja pide subir la demo: ' + t.slice(0, 90));
      console.log('    0 contados · ' + e.demos + ' ejemplos descontados · «' + t.replace(/\s+/g, ' ').trim().slice(0, 60) + '»');
    }
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

  await paso('sin errores de consola propios del prototipo', async () => {
    if (errs.length) throw new Error(errs.slice(0, 4).join(' | '));
    if (delEntorno.length) console.log('   (' + delEntorno.length +
      ' fallo(s) de red del sandbox, filtrados: fts-styles.css importa Google Fonts)');
  });

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron.');
  if (errs.length) { console.log('\nErrores de consola:'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  await b.close();
  process.exit(mal ? 1 : 0);
})();
