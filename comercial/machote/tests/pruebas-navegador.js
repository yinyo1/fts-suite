/* ═══ Pruebas de navegador del prototipo ═══
 *
 *   npm i playwright   (o usa el Chromium ya instalado del contenedor)
 *   node comercial/machote/tests/pruebas-navegador.js
 *
 * Corre contra el archivo local, sin servidor. Verifica que las cuatro
 * pantallas navegan, que los cálculos se mueven de verdad, que el revisador
 * encuentra cosas, y que nada desborda a 380 px.
 *
 * Los dos fallos que encontraron estas pruebas (y que leer el código no
 * habría encontrado) están documentados en el issue #148.
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 380, height: 780 } });
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  const paso = async (n, fn) => { try { await fn(); console.log('✓', n); } catch (e) { console.log('✗', n, '→', e.message); } };

  await p.goto(BASE); await p.waitForTimeout(300);
  await paso('home carga', async () => {
    const t = await p.textContent('#tbT');
    const n = await p.locator('.item').count();
    if (n < 8) throw new Error('pocas tarjetas: ' + n);
    console.log('   topbar:', t, '| tarjetas:', n);
  });

  await paso('abre machote 058', async () => {
    await p.click('[data-ir="#/m/MCH-2026-058"]'); await p.waitForTimeout(250);
    const t = await p.textContent('#tbT'); if (!t.includes('Clarios')) throw new Error('topbar: ' + t);
    const f = await p.textContent('#fMargen'); console.log('   margen en barra fija:', f);
  });

  await paso('barra fija visible', async () => {
    if (!await p.locator('.fija').isVisible()) throw new Error('no visible');
  });

  await paso('tab Secciones', async () => {
    await p.click('[data-tab="secc"]'); await p.waitForTimeout(200);
    const n = await p.locator('.lin').count(); console.log('   renglones:', n);
    if (n < 10) throw new Error('pocos renglones');
    const cerr = await p.locator('.lin.cerrada').count();
    console.log('   plegados de inicio:', cerr);
    if (cerr !== n) throw new Error('deberian nacer todos plegados');
    const sd = await p.locator('.lin-tot.nd').count(); console.log('   SIN DATO visibles plegados:', sd);
    if (sd < 2) throw new Error('no marca sin dato');
  });

  await paso('abrir un renglon lo despliega', async () => {
    await p.locator('.lin.cerrada').first().click(); await p.waitForTimeout(200);
    if (await p.locator('.lin.abierta').count() !== 1) throw new Error('no abrio');
    if (!await p.locator('input[data-bind$=":cant"]').first().isVisible()) throw new Error('campos no visibles');
  });

  await paso('cambiar cantidad mueve el margen', async () => {
    const antes = await p.textContent('#fMargen');
    const inp = p.locator('input[data-bind$=":cant"]').first();
    await inp.fill('999');
    await p.waitForTimeout(150);
    const desp = await p.textContent('#fMargen');
    console.log('   margen', antes, '→', desp);
    if (antes === desp) throw new Error('el margen NO se movió');
  });

  await paso('el foco no se pierde al escribir', async () => {
    const inp = p.locator('input[data-bind$=":cant"]').first();
    await inp.fill('12'); await p.waitForTimeout(120);
    const act = await p.evaluate(() => document.activeElement && document.activeElement.dataset.bind || '');
    if (!act.endsWith(':cant')) throw new Error('foco perdido, activeElement=' + act);
  });

  await paso('tab Generales + widget', async () => {
    await p.click('[data-tab="gen"]'); await p.waitForTimeout(250);
    if (!await p.locator('#wgSel').isVisible()) throw new Error('sin selector de cuadro');
    await p.selectOption('#wgSel', 'viaticos_cuadrilla'); await p.waitForTimeout(200);
    const ins = p.locator('.wgi');
    await ins.nth(0).fill('6'); await ins.nth(1).fill('15'); await ins.nth(2).fill('450');
    await p.waitForTimeout(150);
    console.log('   resultado widget:', await p.textContent('#wgR'));
    await p.click('#wgUsar'); await p.waitForTimeout(300);
  });

  await paso('tab Simulador', async () => {
    await p.click('[data-tab="sim"]'); await p.waitForTimeout(250);
    const a = await p.textContent('#simMg');
    await p.fill('#simP', '3000000'); await p.waitForTimeout(150);
    const d = await p.textContent('#simMg');
    console.log('   margen sim', a, '→', d);
    if (a === d) throw new Error('simulador no responde');
    await p.fill('#objM', '25'); await p.click('#objBtn'); await p.waitForTimeout(150);
    console.log('   inverso:', (await p.textContent('#objR')).slice(0, 90));
  });

  await paso('revisador', async () => {
    await p.goto(BASE + '#/rev/MCH-2026-063'); await p.waitForTimeout(300);
    const d = await p.locator('.hz.dura').count(), bl = await p.locator('.hz.blanda').count();
    console.log('   duras:', d, 'blandas:', bl);
    if (d < 4) throw new Error('pocas duras');
  });

  await paso('orden bloqueada por revisador', async () => {
    await p.goto(BASE + '#/orden/SO12058'); await p.waitForTimeout(300);
    const dis = await p.locator('#btnConf').isDisabled();
    console.log('   botón confirmar deshabilitado:', dis);
    if (!dis) throw new Error('debería estar bloqueado');
  });

  await paso('orden limpia se confirma con handoff', async () => {
    await p.goto(BASE + '#/orden/SO12051'); await p.waitForTimeout(300);
    await p.fill('[data-h="presupuesto"]', '983200');
    await p.fill('[data-h="inicio"]', '2026-09-15');
    await p.fill('[data-h="fin"]', '2026-10-20');
    await p.selectOption('[data-h="responsable"]', 'Mateo Salazar'); await p.waitForTimeout(250);
    await p.fill('[data-h="entregables"]', 'Planos as-built, memoria de cálculo, pruebas de carga');
    await p.waitForTimeout(200);
    const dis = await p.locator('#btnConf').isDisabled();
    if (dis) throw new Error('sigue bloqueado: ' + (await p.textContent('.aviso.ambar').catch(()=>'?')));
    await p.click('#btnConf');
    await p.waitForTimeout(4800);
    const ok = await p.locator('.aviso.verde').first().textContent();
    console.log('   ', ok.trim().slice(0, 60));
    if (!ok.includes('confirmada')) throw new Error('no confirmó');
  });

  await paso('vista de aprobación (teléfono)', async () => {
    await p.goto(BASE + '#/ap/MCH-2026-058'); await p.waitForTimeout(300);
    const k = await p.textContent('.kpi .n'); console.log('   KPI margen:', k);
    const dis = await p.locator('#apOk').isDisabled();
    console.log('   aprobar deshabilitado (tiene bloqueos):', dis);
    await p.fill('[data-ap="precio"]', '3200000'); await p.waitForTimeout(200);
    console.log('   KPI tras ajustar precio:', await p.textContent('.kpi .n'));
  });

  await paso('el costo incompleto no se disfraza', async () => {
    await p.goto(BASE + '#/m/MCH-2026-058'); await p.waitForTimeout(300);
    const mg = await p.textContent('#fMargen');
    const lb = await p.textContent('#fija .b span');
    console.log('   barra fija:', lb, '| margen:', mg);
    if (!mg.includes('*')) throw new Error('el margen no se marca como provisional');
    if (!lb.includes('INCOMPLETO')) throw new Error('el costo no se marca incompleto');
    const cls = await p.getAttribute('#fija .mg', 'class');
    if (cls.includes('ok')) throw new Error('sigue pintandose en verde con huecos');
    await p.goto(BASE + '#/ap/MCH-2026-058'); await p.waitForTimeout(300);
    const k = await p.getAttribute('.kpi .n', 'class');
    console.log('   KPI aprobacion:', await p.textContent('.kpi .n'), '| clase:', k);
    if (k.includes('ok')) throw new Error('el AM ve verde un margen inflado');
    if (!await p.locator('.kpi .aviso.ambar').isVisible()) throw new Error('falta el aviso al AM');
  });

  await paso('un boton bloqueado se ve bloqueado', async () => {
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('#apOk')).backgroundColor);
    console.log('   fondo del boton Aprobar (deshabilitado):', bg);
    if (bg.includes('107, 124, 16') || bg === 'rgb(16, 124, 16)') throw new Error('sigue verde de accion principal');
  });

  await paso('el revisador lleva al punto exacto', async () => {
    await p.goto(BASE + '#/rev/MCH-2026-058'); await p.waitForTimeout(300);
    const n = await p.locator('[data-fix]').count();
    console.log('   hallazgos con "ir a arreglarlo":', n);
    if (n < 5) throw new Error('pocos accionables');
    // el primer bloqueo es "Partidas sin precio": debe abrir Secciones con los renglones desplegados
    await p.locator('.hz.dura [data-fix]').first().click();
    await p.waitForTimeout(500);
    const hash = await p.evaluate(() => location.hash);
    const tabOn = await p.textContent('.tab.on');
    const ab = await p.locator('.lin.abierta').count();
    console.log('   →', hash, '| pestaña:', tabOn, '| renglones desplegados:', ab);
    if (!hash.startsWith('#/m/')) throw new Error('no navegó al machote');
    if (tabOn.trim() !== 'Secciones') throw new Error('pestaña equivocada: ' + tabOn);
    if (ab < 2) throw new Error('no desplegó los renglones señalados');
  });

  await paso('siguiente paso visible en el machote', async () => {
    await p.goto(BASE + '#/m/MCH-2026-063'); await p.waitForTimeout(300);
    const t = await p.textContent('.prox .pd');
    console.log('   siguiente paso:', t);
    if (!await p.locator('.prox [data-fix]').isVisible()) throw new Error('sin boton de accion');
    await p.goto(BASE + '#/m/MCH-2026-041'); await p.waitForTimeout(300);
    const ok = await p.locator('.prox.ok').count();
    console.log('   machote limpio muestra "todo en orden":', ok === 1);
  });

  await paso('tarifa sugerida del oficio', async () => {
    await p.goto(BASE + '#/m/MCH-2026-041'); await p.waitForTimeout(250);
    await p.click('[data-tab="secc"]'); await p.waitForTimeout(250);
    const mo = p.locator('.lin.cerrada').filter({ hasText: 'Mecánico' }).first();
    await mo.click(); await p.waitForTimeout(250);
    const hint = await p.locator('.lin.abierta .tiny').first().textContent();
    console.log('   ', hint);
    if (!/Rango/.test(hint)) throw new Error('sin rango sugerido');
  });

  await paso('sin scroll horizontal a 380px', async () => {
    for (const h of ['#/', '#/m/MCH-2026-052', '#/rev/MCH-2026-058', '#/orden/SO12043', '#/ap/MCH-2026-058']) {
      await p.goto(BASE + h); await p.waitForTimeout(250);
      const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 2) throw new Error(h + ' desborda ' + o + 'px');
    }
  });

  console.log('\nErrores de consola:', errs.length);
  errs.slice(0, 10).forEach(e => console.log('  ', e));
  await b.close();
})();
