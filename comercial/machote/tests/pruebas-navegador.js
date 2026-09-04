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

    await ir('#/m/M-1041');
    const barra = await p.textContent('#tbS');
    if (barra.indexOf(ver.version) < 0) throw new Error('la barra superior dice: ' + barra);
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
    await p.fill('[data-cel="margenes.materiales"]', '3.2');
    await p.dispatchEvent('[data-cel="margenes.materiales"]', 'input');
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

    await p.fill('[data-cel="factor_proteccion"]', '0.10');
    await p.dispatchEvent('[data-cel="factor_proteccion"]', 'change');
    await p.waitForTimeout(280);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('cambiarlo no movió el precio: ' + antes);
    console.log('   con tc=18:', antes.trim(), '→ con factor 0.10:', desp.trim());
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

  await paso('los filtros por estado cuentan sobre el total, no sobre lo filtrado', async () => {
    await ir('#/');
    const total = await p.locator('.item[href^="#/m/"]').count();
    const antes = await p.locator('.fchip').allTextContents();
    await p.locator('.fchip', { hasText: 'En revisión' }).first().click();
    await p.waitForTimeout(300);
    const desp = await p.locator('.fchip').allTextContents();
    if (antes.join('|') !== desp.join('|'))
      throw new Error('los contadores cambiaron al filtrar: ' + antes.join(' ') + ' → ' + desp.join(' '));
    const enRev = await p.locator('.item[href^="#/m/"]').count();
    if (!(enRev > 0 && enRev < total)) throw new Error('el filtro no filtró: ' + total + ' → ' + enRev);
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
    const r = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('.fila')];
      const f = filas.find(x => x.textContent.indexOf('M-1042') >= 0);
      return f ? { borrar: !!f.querySelector('[data-borrar]'), candado: !!f.querySelector('.candado') } : null;
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
    // Se pega DESDE el tercer renglón: los dos de arriba no se tocan.
    await p.locator('[data-pegar]').nth(2).click(); await p.waitForTimeout(300);
    const titulo = await p.textContent('.modal h3');
    if (titulo.indexOf('renglón 3') < 0) throw new Error('el modal no dice desde dónde: ' + titulo);
    await p.fill('#pg-txt', '- 4 pzas Rodamiento lineal LM25UU  $4,200.00\n- 1 Placa de acero A36  $38,000');
    await p.waitForTimeout(400);
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
    await p.check('input[name="pg-modo"][value="inserta"]');
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

  await paso('la sesión dice quién entró y deja salir', async () => {
    await ir('#/m/M-1041');
    const t = await p.locator('#tbUser').textContent();
    if (t.trim() !== 'zz.prueba') throw new Error('la barra dice: ' + t);
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
