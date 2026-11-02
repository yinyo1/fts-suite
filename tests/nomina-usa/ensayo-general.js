#!/usr/bin/env node
// ENSAYO GENERAL del ciclo completo (#448, MVP paso 5), en MODO PRÁCTICA sobre una base de
// prueba: la pantalla REAL (modo real, no el demo) habla con las funciones REALES de
// nomina_usa en un Postgres desechable, sembrado con los datos REALES de la semana
// vie 30-oct → jue 5-nov leídos de producción (fixtures/semana-30oct-real.json), las fichas y
// las bolsas tal como están en producción. Nada toca el servidor, ni paga, ni escribe en Odoo.
// Reloj del navegador fijo: miércoles 4-nov-2026 08:30 CST.
//   SHOTS_DIR=docs/nomina-usa/capturas/ensayo node tests/nomina-usa/ensayo-general.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const FX = require('./fixtures/semana-30oct-real.json');
const SC = { richard: ['nomina_usa:kiosko'], magaly: ['nomina_usa:validar'], erick: ['nomina_usa:autorizar'], gerardo: ['nomina_usa:archivo'], esteban: ['nomina_usa:admin'] };
const RESUMEN = { pasos: [] };
const nota = (paso, datos) => RESUMEN.pasos.push(Object.assign({ paso }, datos));

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
const db = pg.crear();
// ── Siembra: lo de producción al 2-nov (fichas, bolsas, horas y alertas de la semana) ──
db.q(`UPDATE nomina_usa.ficha SET hora_entrada_ref = '08:00', zona_horaria = 'America/Chicago' WHERE employee_id IN (75, 79);
      UPDATE nomina_usa.ficha SET hora_entrada_ref = '09:00', zona_horaria = 'America/Los_Angeles', destinatarios_alerta = '{63,149}' WHERE employee_id = 98;
      UPDATE nomina_usa.ficha SET fijo_semanal_usd = 507.59, cuenta_analitica = 'Sales FTS USA' WHERE employee_id = 97;`);
db.panel({ accion: 'bolsa_provisional', so_id: 2362, so_nombre: 'SO11842 - prensas materials - Mission Foods', sale_order_id: 12041, supervisor: 3200, tecnicos: 7200,
  pagado_previo_supervisor: 2240, pagado_previo_tecnicos: 5040, folio: 'BP-2026-001' }, SC.esteban, 'esteban.delacruz');
db.panel({ accion: 'bolsa_provisional', so_id: 2361, so_nombre: 'SO11791 - Power and control panels - Calbee Fairfield', sale_order_id: 11990, supervisor: 4000, tecnicos: 6000, folio: 'BP-2026-002' }, SC.esteban, 'esteban.delacruz');
// Como en producción (#448, activación 2-nov): SO11791 con pagado 0 y «pagos previos por confirmar con Richard».
db.panel({ accion: 'bolsa_por_confirmar', so_id: 2361, texto: 'Pagos previos por confirmar con Richard. Por ahora pagado = 0.', motivo: 'Esteban 2-nov (#448)' }, SC.esteban, 'esteban.delacruz');
db.q(`SELECT nomina_usa.horas_registrar($j$${JSON.stringify({ horas: FX.horas })}$j$::jsonb)`);
for (const a of FX.alertas) db.q(`INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, attendance_id, modo_al_crear, pais) VALUES ('${a.clave}', '${a.tipo}', ${a.employee_id}, '${a.fecha}', ${a.attendance_id}, 'sombra', 'USA')`);
// DATO DE ENSAYO (el kiosko USA está apagado, así que nadie ha reportado su día): el lunes 2-nov
// Ricardo reporta 40 % comercial con un sugerido de 20 %, o sea una EXCEPCIÓN con su explicación.
db.q(`INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido, comercial) VALUES (98, '2026-11-02', 'real',
      '[{"clave":"COMERCIAL","pct":40},{"clave":"SO11842","pct":60}]', true,
      '{"sugerido":20,"estado":"excepcion","explicacion":"Visita a Mission HQ para levantar la siguiente cotización"}')`);
const envio0 = db.q('SELECT count(*) FROM retardos.envio');

(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
  let rol = 'richard';
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.fulfill({ status: 404, body: 'bloqueado en el ensayo' }));
  // La pantalla en MODO REAL: la llamada al webhook se contesta con la función real de la base.
  await ctx.route('**/webhook/nomina-usa/panel', async r => {
    const b = JSON.parse(r.request().postData() || '{}');
    const res = db.panel(b.datos || {}, SC[rol], rol + ' (ensayo)');
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  // Sesión de la suite de ensayo: el rol que se esté probando, con sus scopes.
  await ctx.route('**/shared/auth-jwt.js*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body:
    'window.SuiteAuth={isValid:function(){return true},getToken:function(){return "ensayo"},logout:function(){},login:async function(){return {ok:false}},' +
    'getSession:function(){var q=new URLSearchParams(location.search),r=q.get("rol");return {nombre:r+" (ensayo)",scopes:' + JSON.stringify(SC) + '[r],token:"ensayo"}}};' }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept(page._resp || 'ok'));
  await page.clock.setFixedTime(new Date('2026-11-04T14:30:00Z'));
  const como = async (q, tab) => {
    rol = q; await page.goto(base + '/modulos/rh/nomina-usa/index.html?rol=' + q);
    await page.waitForSelector('#tabs .tab'); await page.evaluate(t => NusaApp.abrir(t), tab);
    await page.waitForFunction(() => !/Cargando/.test(document.getElementById('vista').textContent));
  };
  const txt = () => page.evaluate(() => document.getElementById('vista').innerText);
  const desborda = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const fotos = async (n) => { for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(80);
    check(n + ': sin desborde a ' + w + ' px', !(await desborda())); if (OUT) await page.screenshot({ path: path.join(OUT, n + '-' + w + '.png'), fullPage: true }); }
    await page.setViewportSize({ width: 380, height: 900 }); };

  seccion('1 · Richard arma la solicitud del miércoles 4-nov con los datos reales');
  await como('richard', 'solicitud');
  let t = await txt();
  check('pantalla en modo REAL (sin franja de práctica), semana vie 30-oct → jue 5-nov', !(await page.isVisible('#aviso-demo')) && /2026-10-30/.test(t) && /2026-11-05/.test(t), t.slice(0, 300));
  check('SO11842 aparece con su bolsa provisional BP-2026-001', /SO11842/.test(t) && /BP-2026-001/.test(t));
  check('SO11854 (Mateo, 31-oct) y SO94 (José Luis, México) aparecen SIN bolsa', /SO11854/.test(t) && /SO94/.test(t));
  check('aviso: «Por confirmar con Richard» SO11791 · BP-2026-002, aunque SO11791 no tenga horas esta semana', await page.isVisible('#nu-por-confirmar') && /Por confirmar con Richard/.test(t) && /SO11791 · bolsa BP-2026-002: Pagos previos por confirmar con Richard/.test(t), t.slice(0, 900));
  if (process.env.DEBUG) { console.log(t); console.log(await page.evaluate(() => document.getElementById('vista').innerHTML.slice(0, 3000))); }
  const idx = await page.evaluate(() => [...document.querySelectorAll('.nu-so')].find(c => /SO11842/.test(c.querySelector('h3').textContent)).dataset.so);
  let card = '.nu-so[data-so="' + idx + '"]';
  const fijarCard = async () => { card = '.nu-so[data-so="' + await page.evaluate(() => [...document.querySelectorAll('.nu-so')].find(c => /SO11842/.test(c.querySelector('h3').textContent)).dataset.so) + '"]'; };
  await page.fill(card + ' [data-est=mie]', '100'); await page.dispatchEvent(card + ' [data-est=mie]', 'change');
  await page.fill(card + ' [data-est=jue]', '100'); await page.dispatchEvent(card + ' [data-est=jue]', 'change');
  await page.waitForTimeout(150);
  const disp = await page.evaluate(c => [...document.querySelectorAll(c + ' .nu-rol')].map(r => r.dataset.rol + ':' + r.querySelector('[data-disp]').textContent), card);
  check('SO11842 al 100 %: disponible supervisor $960 y técnicos $2,160 (bolsa × avance − ya pagado 70 %)', disp.includes('supervisor:$960.00') && disp.includes('tecnicos:$2,160.00'), disp);
  const rep = await page.evaluate(c => [...document.querySelectorAll(c + ' [data-emp]')].map(i => i.closest('.nu-rol').dataset.rol + ':' + i.dataset.emp + ':' + i.value), card);
  check('reparto sugerido por horas checadas: Mateo 12.11 h es el único técnico en SO11842 → $2,160; Ricardo $960', rep.includes('tecnicos:75:2160.00') && rep.includes('supervisor:98:960.00'), rep);
  await page.fill('#nu-com tr[data-fecha="2026-11-04"] [data-pct]', '20'); await page.dispatchEvent('#nu-com tr[data-fecha="2026-11-04"] [data-pct]', 'input');
  t = await txt();
  check('comercial: lunes 2-nov 40 % CON EXCEPCIÓN (sugerido 20 %) y su explicación; miércoles estimado 20 %', /CON EXCEPCIÓN/.test(t) && /Visita a Mission HQ/.test(t), t.slice(-1200));
  check('Rissia: fijo 507.59 a «Sales FTS USA»', /507\.59/.test(t));
  nota('Richard arma', { so11842: disp, reparto: rep, fuente: 'bolsa BP-2026-001 y horas_dia de producción (16372, 16394)' });
  await fotos('1-richard-arma');

  seccion('2 · Incidencia en disputa: bloquea, Richard pide revisión, Magaly la libera');
  await como('magaly', 'alertas');
  page._resp = 'Ricardo dice que salió a las 18:00 del 31-oct';
  await page.click('[data-marca$="|en_disputa"]'); await page.waitForTimeout(200);
  await como('richard', 'solicitud'); await fijarCard();
  await page.fill(card + ' [data-est=mie]', '100'); await page.dispatchEvent(card + ' [data-est=mie]', 'change');
  await page.fill(card + ' [data-est=jue]', '100'); await page.dispatchEvent(card + ' [data-est=jue]', 'change');
  await page.waitForTimeout(150);
  t = await txt();
  check('«Hay una incidencia en disputa. Valídala con Magaly.» y botón apagado', /Hay una incidencia en disputa\. Valídala con Magaly\./.test(t) && await page.isDisabled('#nu-enviar'));
  await fotos('2-richard-disputa');
  await page.click('[data-revision]'); await page.waitForTimeout(200);
  check('la revisión pedida dejó aviso a Magaly (en sombra)', db.q("SELECT count(*) FROM nomina_usa.aviso WHERE evento = 'revision_pedida' AND modo_al_crear = 'sombra'") === '1');
  await como('magaly', 'alertas');
  page._resp = 'Checada de salida corregida con Ricardo';
  await page.click('[data-marca$="|error_corregido"]'); await page.waitForTimeout(200);

  seccion('3 · Richard envía');
  await como('richard', 'solicitud'); await fijarCard();
  await page.fill(card + ' [data-est=mie]', '100'); await page.dispatchEvent(card + ' [data-est=mie]', 'change');
  await page.fill(card + ' [data-est=jue]', '100'); await page.dispatchEvent(card + ' [data-est=jue]', 'change');
  await page.fill('#nu-com tr[data-fecha="2026-11-04"] [data-pct]', '20'); await page.dispatchEvent('#nu-com tr[data-fecha="2026-11-04"] [data-pct]', 'input');
  await page.waitForTimeout(150);
  check('liberada la disputa, el botón se habilita', !(await page.isDisabled('#nu-enviar')));
  await page.click('#nu-enviar'); await page.waitForTimeout(300);
  const sid = Number(db.q("SELECT coalesce(max(id), 0) FROM nomina_usa.solicitud WHERE semana = '2026-10-30' AND estado = 'enviada'"));
  check('solicitud enviada en la base', sid > 0, await txt());
  const lineas = db.j(`SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'emp', employee_id, 'cuenta', cuenta, 'monto', monto, 'exc', excepcion) ORDER BY id) FROM nomina_usa.solicitud_linea WHERE solicitud_id = ${sid}`);
  nota('Richard envía', { solicitud_id: sid, lineas, total: db.q('SELECT sum(monto) FROM nomina_usa.solicitud_linea WHERE solicitud_id=' + sid) });
  check('líneas: Ricardo 960 y Mateo 2,160 en SO11842; comercial 40 % = 56 (excepción) y 20 % = 28; Rissia 507.59', (() => { const m = l => lineas.some(x => x.emp === l[0] && x.cuenta === l[1] && Number(x.monto) === l[2]); return m([98, 'SO11842', 960]) && m([75, 'SO11842', 2160]) && m([98, 'COMERCIAL-USA', 56]) && m([98, 'COMERCIAL-USA', 28]) && m([97, 'Sales FTS USA', 507.59]); })(), lineas);
  check('aviso a Magaly registrado (sombra)', db.q("SELECT roles::text || modo_al_crear FROM nomina_usa.aviso WHERE clave = 'enviada:" + sid + "'") === '{magaly}sombra');
  await fotos('3-richard-enviada');

  seccion('4 · Magaly valida');
  await como('magaly', 'revision');
  await page.click('[data-acc=solicitud_validar]'); await page.waitForTimeout(250);
  check('validada', db.q('SELECT estado FROM nomina_usa.solicitud WHERE id=' + sid) === 'validada');
  await fotos('4-magaly-valida');

  seccion('5 · Erick autoriza (decide la excepción)');
  await como('erick', 'revision');
  await page.click('[data-acc=solicitud_autorizar]'); await page.waitForTimeout(250);
  check('no autoriza sin decidir la excepción', /Aprueba o baja al sugerido/.test(await txt()));
  await page.check('input[value=aprobar]');
  await page.click('[data-acc=solicitud_autorizar]'); await page.waitForTimeout(250);
  check('autorizada, con la excepción aprobada ($56)', db.q('SELECT estado FROM nomina_usa.solicitud WHERE id=' + sid) === 'autorizada' && db.q("SELECT autorizado_monto FROM nomina_usa.solicitud_linea WHERE solicitud_id=" + sid + " AND excepcion") === '56.00');
  const autorizado = db.q('SELECT sum(autorizado_monto) FROM nomina_usa.solicitud_linea WHERE solicitud_id=' + sid);
  nota('Erick autoriza', { autorizado });
  await fotos('5-erick-autoriza');

  seccion('6 · Gerardo descarga el CSV y marca subido → asiento de costo en vista previa');
  await como('gerardo', 'revision');
  await page.click('[data-acc=solicitud_archivo]'); await page.waitForTimeout(250);
  const csv = await page.evaluate(() => NusaApp._st.ultimoCsv);
  check('CSV para Auris por persona y cuenta', /Ricardo,98,960\.00,SO11842,2026-10-30/.test(csv || '') && /Mateo,75,2160\.00,SO11842/.test(csv) && /Rissia,97,507\.59,Sales FTS USA/.test(csv) && /Ricardo,98,84\.00,COMERCIAL-USA/.test(csv), csv);
  nota('Gerardo CSV', { csv });
  await page.click('[data-acc=solicitud_subida]'); await page.waitForTimeout(400);
  t = await txt();
  check('subida → el asiento quedó en vista previa', /vista previa guardada/.test(t) && /APAGADA/.test(t), t.slice(-1800));
  const as = db.j('SELECT to_jsonb(a) FROM nomina_usa.asiento a WHERE solicitud_id=' + sid);
  check('asiento: SO11842 960 + 2,160 a la analítica 3104; Rissia 507.59 a 3089; comercial 84 a 3089; puente 3,711.59', (() => {
    const L = as.payload.lineas, d = (c, a) => L.filter(l => l.cuenta === c && l.analytic_distribution && l.analytic_distribution[a]).reduce((s, l) => s + Number(l.debit), 0);
    return d('SO11842', '3104') === 3120 && d('Sales FTS USA', '3089') === 507.59 && d('COMERCIAL-USA', '3089') === 84 && L.some(l => l.cuenta === 'PUENTE' && Number(l.credit) === 3711.59); })(), as.payload.lineas);
  nota('Costo vista previa', { lineas: as.payload.lineas.map(l => ({ cuenta: l.cuenta, persona: l.persona, analitica: l.analytic_distribution && Object.keys(l.analytic_distribution)[0], debe: l.debit, haber: l.credit })), faltantes: as.faltantes });
  check('Odoo no se tocó: la bandera de costo está apagada y el workflow no recibe nada', db.j('SELECT nomina_usa.costo_pendientes()').asientos.length === 0);
  await fotos('6-gerardo-subido-costo');

  seccion('7 · Conciliación con un registro de Auris DE EJEMPLO');
  // Registro de EJEMPLO: los netos son los autorizados; impuestos y fee son inventados (no conocemos el formato real).
  const REG = 'Employee,Employee ID,Net Pay,Employee Taxes,Employer Taxes,Fee\nRicardo,98,1044.00,198.36,79.87,0\nMateo,75,2160.00,410.40,165.24,0\nRissia,97,507.59,96.44,38.83,0\nAuris service fee,,0,0,0,45.00\n';
  // Cargos del banco DE EJEMPLO: Auris cobra en dos (neto; impuestos + fee). Se meten a la base de prueba, no a Odoo.
  db.q(`SELECT nomina_usa.banco_registrar('{"cargos":[{"id":990001,"journal_id":122,"fecha":"2026-11-05","ref":"AURIS PAYROLL NET (ejemplo)","monto":-3711.59},{"id":990002,"journal_id":122,"fecha":"2026-11-05","ref":"AURIS PAYROLL TAX+FEE (ejemplo)","monto":-1034.14},{"id":990003,"journal_id":122,"fecha":"2026-11-05","ref":"Home Depot (ejemplo)","monto":-120.00}]}'::jsonb)`);
  await page.fill('#nu-au-txt', REG); await page.click('#nu-au-imp'); await page.waitForTimeout(400);
  t = await txt();
  check('cuadra con 2 cargos por $4,745.73 (sin tomar Home Depot)', /Cuadra con 2 cargo\(s\) del banco por \$4,745\.73/.test(t), t.slice(-1500));
  const cv = db.panel({ accion: 'conciliacion_ver', semana: '2026-10-30' }, SC.gerardo).conciliacion;
  const pr = db.j("SELECT nomina_usa.prorrateo_impuestos('2026-11-06')");
  nota('Conciliación (ejemplo)', { totales: cv.totales, cargos: cv.cargos, propuesta: cv.propuesta, prorrateo: pr.lineas, impuestos: pr.impuestos });
  check('prorrateo: 989.14 de impuestos a SO11842, COMERCIAL-USA y Sales FTS USA en proporción al neto, suma exacta', Math.round(pr.lineas.reduce((s, l) => s + Number(l.impuestos), 0) * 100) === 98914 && pr.lineas.length === 3, pr);
  await fotos('7-gerardo-conciliacion');

  seccion('8 · Avisos y vigilante del miércoles (sombra)');
  db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-04T18:00:00Z'");
  db.q("SELECT nomina_usa.vigilante('2026-11-04T18:05:00Z'), nomina_usa.avisos_reloj('2026-11-04T18:05:00Z')");
  await como('esteban', 'avisos');
  t = await txt();
  check('la cadena completa quedó en avisos: envío, validación, autorización, subida y revisión pedida', /Richard envió/.test(t) && /Magaly validó/.test(t) && /súbela a Auris/.test(t) && /ya está en Auris/.test(t) && /revisa una incidencia/.test(t), t.slice(0, 2000));
  check('el vigilante no avisó de nada del miércoles: la solicitud se subió a tiempo', !/12:00 y no se ha subido|11:00 y la solicitud/.test(t));
  nota('Avisos', { avisos: db.j("SELECT jsonb_agg(jsonb_build_object('evento', evento, 'roles', roles, 'modo', modo_al_crear) ORDER BY id) FROM nomina_usa.aviso") });
  await fotos('8-esteban-avisos');

  seccion('9 · Viernes: ajuste (el miércoles 4-nov fue 0 % comercial, no 20 %)');
  db.q(`INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido) VALUES (98, '2026-11-04', 'real', '[{"clave":"COMERCIAL","pct":0},{"clave":"SO11842","pct":100}]', true)`);
  const aj = db.j("SELECT nomina_usa.ajuste_viernes('2026-10-30')");
  db.q("SELECT nomina_usa.avisos_reloj('2026-11-06T17:05:00Z')");
  check('el ajuste del viernes guarda −28 para la siguiente solicitud', aj.nuevos >= 1 && db.q("SELECT monto FROM nomina_usa.ajuste WHERE semana_origen = '2026-10-30' AND tipo = 'comercial'") === '-28.00', aj);
  check('resumen del ajuste a Richard y Erick (sombra)', db.q("SELECT roles::text FROM nomina_usa.aviso WHERE clave = 'resumen_ajuste:2026-10-30'") === '{richard,erick}');
  await page.clock.setFixedTime(new Date('2026-11-11T14:30:00Z'));
  await como('richard', 'solicitud');
  t = await txt();
  check('la semana del 6-nov trae el ajuste precargado −28', /Ajuste de la semana anterior/.test(t) && /\$-28\.00/.test(t), t.slice(0, 800));
  nota('Ajuste del viernes', { ajuste: db.j("SELECT jsonb_agg(to_jsonb(a)) FROM nomina_usa.ajuste a") });
  await fotos('9-richard-ajuste');

  seccion('Nada salió de la base de prueba');
  check('retardos.envio: cero filas nuevas (todo en sombra)', db.q('SELECT count(*) FROM retardos.envio') === envio0);
  check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
  if (process.env.RESUMEN) fs.writeFileSync(process.env.RESUMEN, JSON.stringify(RESUMEN, null, 1));
  await browser.close(); srv.close(); fin();
})();
