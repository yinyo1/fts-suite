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
  // Asignar el mismo hash que ya está puesto NO dispara `hashchange`, así que
  // la vista no se repinta y la prueba mide la pantalla anterior. Se pasa por
  // '#/' primero para forzar el repintado.
  const ir = async (h) => {
    await p.evaluate(() => { location.hash = '#/'; });
    await p.waitForTimeout(80);
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
    await ir('#/rev/M-1041');
    await p.evaluate(() => { location.hash = '#/m/M-1041'; }); await p.waitForTimeout(260);
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
        if (td.classList.contains('rotulo') || td.classList.contains('acc')) return;
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
