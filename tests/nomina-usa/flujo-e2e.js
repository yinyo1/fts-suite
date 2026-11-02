#!/usr/bin/env node
// Flujo completo del miércoles en la pantalla real (modo práctica, #448 fase E):
// Richard arma y envía → una disputa lo bloquea → pide revisión → Magaly libera → envía →
// Magaly valida (primero el día sin ubicación) → Erick autoriza decidiendo la excepción →
// Gerardo descarga el CSV para Auris y marca subido. Cero errores JS; capturas a 380 y 1280.
//   SHOTS_DIR=docs/nomina-usa/capturas/fase-e node tests/nomina-usa/flujo-e2e.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('./lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 404, body: 'bloqueado' }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept(page._resp || 'ok'));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/modulos/rh/nomina-usa/index.html?practica=richard');
  await page.waitForSelector('#tabs .tab');
  const como = async (q, tab) => { await page.selectOption('#como', q); await page.waitForTimeout(100); await page.evaluate(t => NusaApp.abrir(t), tab); await page.waitForFunction(() => !/Cargando/.test(document.getElementById('vista').textContent)); };
  const txt = () => page.evaluate(() => document.getElementById('vista').innerText);
  const fotos = async (n) => { if (!OUT) return; for (const w of [380, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, n + '-' + w + '.png'), fullPage: true }); } await page.setViewportSize({ width: 380, height: 900 }); };
  const desborda = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  seccion('Richard arma la solicitud');
  await como('richard', 'solicitud');
  let t = await txt();
  check('semana vie 30-oct a jue 5-nov', /2026-10-30/.test(t) && /2026-11-05/.test(t));
  check('SO11791 sin bolsa: no se puede pedir pago', /SO11791[\s\S]*sin bolsa/i.test(t) && /no se puede pedir pago de esta SO/.test(t));
  const disp = await page.evaluate(() => [...document.querySelectorAll('.nu-so[data-so] .nu-rol')].map(r => r.dataset.rol + ':' + r.querySelector('[data-disp]').textContent));
  check('SO11842: disponible supervisor $960 y técnicos $2,160', disp.includes('supervisor:$960.00') && disp.includes('tecnicos:$2,160.00'), disp);
  const sug = await page.evaluate(() => [...document.querySelectorAll('.nu-rol[data-rol=tecnicos] [data-emp]')].map(i => Number(i.value)));
  check('reparto sugerido de técnicos por horas suma 2,160', Math.round(sug.reduce((a, b) => a + b, 0) * 100) === 216000, sug);
  await fotos('richard-solicitud');
  check('sin desborde a 380', !(await desborda()));
  await page.evaluate(() => { document.querySelectorAll('.nu-rol[data-rol=tecnicos] [data-emp]').forEach(i => { i.value = '1440'; i.dispatchEvent(new Event('input', { bubbles: true })); }); });
  check('repartir 2,880 a técnicos: error visible y botón apagado', /el disponible es \$2160\.00/.test(await txt()) && await page.isDisabled('#nu-enviar'));
  await page.evaluate(() => { const card = [...document.querySelectorAll('.nu-so[data-so]')].find(c => c.querySelector('.nu-rol')); card.querySelector('[data-est=jue]').value = '90'; card.querySelector('[data-est=jue]').dispatchEvent(new Event('change', { bubbles: true })); });
  check('estimado de jueves menor al de miércoles: no se acepta', /jueves no puede ser menor al del miércoles/.test(await txt()) && await page.isDisabled('#nu-enviar'));
  await page.evaluate(() => NusaApp.abrir('solicitud'));
  await page.waitForTimeout(150);

  seccion('Una disputa bloquea el envío');
  await como('magaly', 'alertas');
  page._resp = 'La persona dice que sí checó';
  await page.click('[data-marca$="|en_disputa"]');
  await page.waitForTimeout(150);
  await como('richard', 'solicitud');
  t = await txt();
  check('«Hay una incidencia en disputa. Valídala con Magaly.»', /Hay una incidencia en disputa\. Valídala con Magaly\./.test(t));
  check('botón de envío apagado', await page.isDisabled('#nu-enviar'));
  await fotos('richard-solicitud-disputa');
  await page.click('[data-revision]'); await page.waitForTimeout(150);
  check('«Pedir a Magaly que la revise» deja la revisión pedida y sigue bloqueado', /revisión pedida/.test(await txt()) && await page.isDisabled('#nu-enviar'));
  await como('magaly', 'alertas');
  page._resp = 'Checada corregida';
  await page.evaluate(() => NusaApp._st.todasAlertas = false);
  await page.click('[data-marca$="|error_corregido"]'); await page.waitForTimeout(150);
  await como('richard', 'solicitud');
  check('liberada: el botón se habilita', !(await page.isDisabled('#nu-enviar')));
  // Jueves 5-nov: estima 20 % comercial (el viernes se comparará contra lo real).
  await page.fill('#nu-com tr[data-fecha="2026-11-05"] [data-pct]', '20');
  await page.click('#nu-enviar'); await page.waitForTimeout(200);
  check('solicitud enviada', /Ya enviada: enviada/.test(await txt()), await txt());

  seccion('Magaly valida');
  await como('magaly', 'revision');
  await page.click('[data-acc=solicitud_validar]'); await page.waitForTimeout(150);
  check('con un día sin ubicación sin validar no avanza', /DIA_SIN_VALIDAR/.test(await txt()));
  await como('magaly', 'alertas');
  await page.click('[data-dia$="|USA"]'); await page.waitForTimeout(150);
  await como('magaly', 'revision');
  await page.click('[data-acc=solicitud_validar]'); await page.waitForTimeout(150);
  check('validada', /Validada por Magaly/.test(await txt()) && await page.$('.nu-paso.actual') && /Autorizada por Erick/.test(await page.textContent('.nu-paso.actual')));

  seccion('Erick autoriza');
  await como('erick', 'revision');
  await fotos('erick-revision');
  check('sin desborde a 380', !(await desborda()));
  await page.click('[data-acc=solicitud_autorizar]'); await page.waitForTimeout(150);
  check('no autoriza sin decidir la excepción', /Aprueba o baja al sugerido/.test(await txt()));
  await page.check('input[value=bajar_sugerido]');
  await page.click('[data-acc=solicitud_autorizar]'); await page.waitForTimeout(150);
  t = await txt();
  check('autorizada, con la excepción bajada al sugerido ($42 en vez de $70)', /Subida a Auris/.test(await page.textContent('.nu-paso.actual')) && /\$70\.00\s+\$42\.00/.test(t), t.slice(-600));

  seccion('Gerardo: archivo para Auris');
  await como('gerardo', 'revision');
  await page.click('[data-acc=solicitud_archivo]'); await page.waitForTimeout(150);
  const csv = await page.evaluate(() => NusaApp._st.ultimoCsv);
  check('CSV con cabecera y netos por persona y cuenta', /^persona,employee_id,neto_usd,cuenta,semana\n/.test(csv || '') && /Ricardo,98,960\.00,SO11842,2026-10-30/.test(csv) && /Rissia,97,700\.00,COMERCIAL-USA/.test(csv), csv);
  check('sumas por persona: técnicos de SO11842 dan 2,160', (() => { const m = (csv || '').split('\n').filter(l => /,SO11842,/.test(l) && !/^Ricardo/.test(l)).map(l => Number(l.split(',')[2])); return Math.round(m.reduce((a, b) => a + b, 0) * 100) === 216000; })(), csv);
  await page.click('[data-acc=solicitud_subida]'); await page.waitForTimeout(150);
  check('marcada como subida', /subido/.test(await txt()));
  await fotos('gerardo-revision');

  seccion('MVP: costo por SO (vista previa) y conciliación de Auris');
  t = await txt();
  check('Gerardo ve el asiento de costo guardado al marcar subido, con la bandera APAGADA', /Costo en Odoo por SO/.test(t) && /vista previa guardada/.test(t) && /APAGADA/.test(t), t.slice(-1500));
  const costo = await page.evaluate(() => [...document.querySelectorAll('#nu-costo tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  check('Ricardo $960 a SO11842 · analítica 3104', costo.some(x => /Ricardo/.test(x) && /SO11842/.test(x) && /3104/.test(x) && /\$960\.00/.test(x)), costo);
  check('faltantes a la vista: diario y cuenta puente de la empresa 6', /Falta para crearlo en Odoo: DIARIO/.test(t) && /CUENTA_PUENTE/.test(t));
  check('el asiento cuadra: debe = haber', await page.evaluate(() => { const k = [...document.querySelectorAll('#nu-costo .nu-kpi b')].map(b => b.textContent); return k.length === 2 && k[0] === k[1]; }));
  await page.click('#nu-au-ej'); await page.waitForTimeout(200);
  t = await txt();
  check('registro de Auris de ejemplo: cuadra con 2 cargos del banco', /Cuadra con 2 cargo\(s\) del banco por \$4,671\.84/.test(t), t.slice(-1500));
  check('propuesta: neto → puente, impuestos → impuestos pagados, fee → gasto administrativo', /Nómina USA por pagar \(puente\)/.test(t) && /Impuestos de nómina pagados/.test(t) && /Gasto administrativo/.test(t));
  check('prorrateo de impuestos a las SO en vista previa', /Prorrateo de impuestos de 2026-11/.test(t));
  check('sin desborde a 380', !(await desborda()));
  await fotos('gerardo-costo-conciliacion');

  seccion('MVP: avisos entre pasos (en sombra)');
  await como('esteban', 'avisos');
  t = await txt();
  check('cada paso dejó su aviso: envío → Magaly, validación → Erick, autorización → Gerardo, subida → los tres', /Richard envió la solicitud/.test(t) && /Magaly validó/.test(t) && /súbela a Auris/.test(t) && /ya está en Auris/.test(t), t.slice(0, 1500));
  check('«Pedir a Magaly que la revise» también avisó a Magaly', /revisa una incidencia en disputa/.test(t));
  check('todos en sombra: ninguno salió', /sombra: no salió/.test(t) && !/enviado a la bandeja/.test(t));
  check('cuatro banderas nuevas, todas en sombra o apagadas', await page.evaluate(() => ['avisos_modo', 'vigilante_modo', 'costo_odoo_activo', 'conciliacion_activa'].every(k => /SOMBRA|APAGADO/.test(document.querySelector('[data-band="' + k + '"]').innerText))));
  check('sin desborde a 380', !(await desborda()));
  await fotos('esteban-avisos');

  seccion('Viernes: ajuste precargado en la siguiente solicitud');
  await como('richard', 'solicitud');
  await page.click('[data-sem="7"]'); await page.waitForFunction(() => /2026-11-06/.test(document.getElementById('vista').innerText));
  t = await txt();
  check('la semana del 6-nov trae «Ajuste de la semana anterior» con −28 (jueves estimado 20 %, real 0 %)', /Ajuste de la semana anterior/.test(t) && /\$-28\.00/.test(t), t.slice(0, 800));
  await fotos('richard-ajuste');
  check('cero errores de JavaScript en todo el flujo', errs.length === 0, errs.join(' | '));
  await browser.close(); srv.close(); fin();
})();
