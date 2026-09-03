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

let ok = 0, mal = 0;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
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
  const ir = async (h) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(220); };

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

  // ── Pantallas ────────────────────────────────────────────────────────
  await paso('la lista carga con machotes y órdenes', async () => {
    const n = await p.locator('.item').count();
    if (n < 6) throw new Error('pocas tarjetas: ' + n);
    console.log('   tarjetas:', n);
  });

  await paso('las cinco pestañas de la estación 2.0 pintan', async () => {
    await ir('#/m/M-1041');
    for (const t of ['diag', 'secc', 'gen', 'com', 'sim']) {
      await p.click('[data-tab="' + t + '"]'); await p.waitForTimeout(160);
      const h = await p.locator('#pane').innerHTML();
      if (!h || h.length < 60) throw new Error('pestaña vacía: ' + t);
    }
  });

  await paso('bajo CON UTILIDAD, cambiar un multiplicador mueve el precio', async () => {
    await ir('#/m/M-1041'); await p.click('[data-tab="sim"]'); await p.waitForTimeout(160);
    await p.click('[data-esc="con_utilidad"]'); await p.waitForTimeout(160);
    await p.click('[data-tab="gen"]'); await p.waitForTimeout(160);
    const antes = await p.textContent('.fija .mono');
    await p.fill('[data-bind="margenes.materiales"]', '3.5');
    await p.dispatchEvent('[data-bind="margenes.materiales"]', 'input');
    await p.waitForTimeout(200);
    const desp = await p.textContent('.fija .mono');
    if (antes === desp) throw new Error('el precio no se movió: ' + antes);
    console.log('   ', antes.trim(), '→', desp.trim());
  });

  // Propiedad real del machote, no un bug: bajo MARGEN DESEADO el precio sale
  // de costo / (1 - margen - comisiones). Los multiplicadores no entran en esa
  // cuenta, asi que moverlos NO cambia el precio: solo cambian el escenario
  // CON UTILIDAD y, con el, el reparto entre secciones. Vale la pena fijarlo
  // en una prueba porque es lo primero que confunde a quien abre el machote.
  await paso('bajo MARGEN DESEADO, el multiplicador NO mueve el precio', async () => {
    await ir('#/m/M-1042'); await p.click('[data-tab="sim"]'); await p.waitForTimeout(160);
    await p.click('[data-esc="margen_deseado"]'); await p.waitForTimeout(160);
    await p.click('[data-tab="gen"]'); await p.waitForTimeout(160);
    const antes = await p.textContent('.fija .mono');
    await p.fill('[data-bind="margenes.materiales"]', '4.2');
    await p.dispatchEvent('[data-bind="margenes.materiales"]', 'input');
    await p.waitForTimeout(200);
    const desp = await p.textContent('.fija .mono');
    if (antes !== desp) throw new Error('cambió y no debía: ' + antes + ' → ' + desp);
  });

  await paso('los tres escenarios dan tres precios distintos', async () => {
    await ir('#/m/M-1041'); await p.click('[data-tab="sim"]'); await p.waitForTimeout(160);
    const v = [];
    for (const e of ['costo', 'con_utilidad', 'margen_deseado']) {
      await p.click('[data-esc="' + e + '"]'); await p.waitForTimeout(160);
      v.push((await p.textContent('.fija .mono')).trim());
    }
    if (new Set(v).size !== 3) throw new Error('escenarios iguales: ' + v.join(' | '));
    console.log('   costo', v[0], '· con utilidad', v[1], '· margen deseado', v[2]);
  });

  await paso('el revisador encuentra la partida sin precio', async () => {
    await ir('#/rev/M-1041');
    const t = await p.textContent('#vista');
    if (!/Partidas sin precio/.test(t)) throw new Error('no la reportó');
  });

  await paso('el revisador encuentra el reparto de comisiones descuadrado', async () => {
    await ir('#/rev/M-1044');
    const t = await p.textContent('#vista');
    if (!/no suma 100/.test(t)) throw new Error('no lo reportó');
    if (!/BUDGET ODOO no cuadra/.test(t)) throw new Error('no reportó el descuadre del budget');
  });

  await paso('el revisador exige tipo de cambio cuando hay dos monedas', async () => {
    await ir('#/rev/M-1043');
    const t = await p.textContent('#vista');
    if (!/no hay tipo de cambio/.test(t)) throw new Error('no lo reportó');
  });

  await paso('"Ir a arreglarlo" lleva a la pestaña correcta', async () => {
    await ir('#/rev/M-1043');
    await p.click('[data-goto]'); await p.waitForTimeout(250);
    if (!/#\/m\//.test(await p.evaluate(() => location.hash))) throw new Error('no navegó');
  });

  await paso('la estación 3.0 no deja cerrar el handoff incompleto', async () => {
    await ir('#/orden/O-9001');
    if (!(await p.locator('#btnConf').isDisabled())) throw new Error('el botón estaba habilitado');
  });

  await paso('marcar todo habilita el cierre, y la marca no se pierde', async () => {
    await ir('#/orden/O-9001');
    // La vista se repinta en cada cambio, asi que hay que volver a buscar el
    // pendiente en cada vuelta: guardar los locators de antemano no sirve.
    for (let i = 0; i < 12; i++) {
      const pend = p.locator('[data-ent]:not(:checked)');
      if (await pend.count() === 0) break;
      await pend.first().check();
      await p.waitForTimeout(120);
    }
    if (await p.locator('[data-ent]:not(:checked)').count()) throw new Error('quedaron casillas sin marcar');
    if (await p.locator('#btnConf').isDisabled()) throw new Error('sigue deshabilitado');
    await p.click('#btnConf'); await p.waitForTimeout(250);
    if (!/Handoff cerrado/.test(await p.textContent('#vista'))) throw new Error('no cerró');
  });

  await paso('la aprobación muestra el cuadre del BUDGET ODOO', async () => {
    await ir('#/ap/M-1044');
    const t = await p.textContent('#vista');
    if (!/BUDGET ODOO cuadra/.test(t)) throw new Error('no lo muestra');
  });

  // ── Diseño ───────────────────────────────────────────────────────────
  await paso('nada desborda a 380 px', async () => {
    for (const h of ['#/', '#/m/M-1041', '#/rev/M-1044', '#/orden/O-9002', '#/ap/M-1041']) {
      await ir(h);
      const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 2) throw new Error(h + ' desborda ' + d + ' px');
    }
  });

  await paso('nada desborda a 1280 px', async () => {
    await p.setViewportSize({ width: 1280, height: 900 });
    for (const h of ['#/', '#/m/M-1041', '#/rev/M-1044']) {
      await ir(h);
      const d = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 2) throw new Error(h + ' desborda ' + d + ' px');
    }
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
