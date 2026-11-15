// v1.2.1 (#507, Etapa 1): al entrar al Panel del Instructor DESDE LA SUITE, Cursos e Instructor
// se pintan y la selección visible es la real. Antes salían vacíos con 11 cursos seleccionados.
// Uso:  BASE=http://localhost:8765 node seguridad/tests/dc3-entrada-suite.e2e.js [carpeta_capturas]
//       BASE=https://yinyo1.github.io/fts-suite node seguridad/tests/dc3-entrada-suite.e2e.js [carpeta]
// Sesiones de prueba solo en el navegador de la prueba; trabajadores y CURP inventados;
// users.json se sustituye en la prueba (no toca el archivo real ni ninguna contraseña).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = (process.env.BASE || 'http://localhost:8765').replace(/\/$/, '');
const SHOTS = process.argv[2] || null;
const ESPERADO_VER = process.env.ESPERADO_VER || '1.3.0';
// Dos juegos de datos (Ronda 1 y Ronda 2): SET=2 usa otro trabajador, otros cursos y otras fechas.
const D = process.env.SET === '2'
  ? { w: ['DEMO', 'RONDA', 'DOS', 'XEXX020202MNLXXX02'], cursos: ['SEGURIDAD ELECTRICA', 'USO DE HERRAMIENTAS MANUALES'], ini: '2026-12-01', fin: '2026-12-02', lote: [[2, '2026-12-07'], [5, '2026-12-08'], [6, '2026-12-09']] }
  : { w: ['PRUEBA', 'ETAPA', 'UNO', 'XEXX010101HNLXXX01'], cursos: ['USO DE EXTINTORES', 'SEGURIDAD INDUSTRIAL'], ini: '2026-11-20', fin: '2026-11-21', lote: [[1, '2026-11-02'], [3, '2026-11-03'], [8, '2026-11-04']] };
const R = [];
function check(n, ok, d) { R.push({ n, ok: !!ok }); console.log((ok ? 'OK   ' : 'FALLA ') + n + (d ? '  → ' + d : '')); }
const SES = m => JSON.stringify({ userId: 'e2e', username: 'prueba.e2e', nombre: 'PRUEBA E2E', role: m ? 'user' : 'master', modulos: m || 'all', loginTime: Date.now(), lastActivity: Date.now() });
const paginas = f => (execFileSync('pdftotext', [f, '-']).toString().match(/\f/g) || []).length;
const cursosDe = f => execFileSync('pdftotext', ['-layout', f, '-']).toString().split('\f').filter(Boolean).map(pg => { const L = pg.split('\n').map(s => s.trim()).filter(Boolean); const i = L.findIndex(s => s.startsWith('Nombre del curso')); return L[i + 1]; });
async function shot(p, n, full) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: !!full }); } }
async function estado(p) {
  return p.evaluate(() => {
    const vis = [...document.querySelectorAll('#course-selector .course-chk')];
    const marcados = vis.filter(x => x.classList.contains('sel')).map(x => x.querySelector('strong').textContent.trim()).sort();
    const reales = CURSOS.filter(c => inst.selCourses.has(c.id)).map(c => c.nombre).sort();
    return { pantalla: document.querySelector('.scr.on').id, cursosPintados: vis.length, instructores: document.querySelectorAll('#inst-selector .inst-radio').length, marcados, reales, version: (document.getElementById('dc3-ver-inst') || {}).textContent };
  });
}

(async () => {
  const b = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc3e1-'));
  const errores = [];

  // ── 1. Desde la Suite: lanzador → tarjeta Seguridad → tarjeta «Instructor DC-3» ──
  const ctx = await b.newContext({ viewport: { width: 380, height: 820 }, acceptDownloads: true });
  await ctx.addInitScript(s => localStorage.setItem('fts_session', s), SES());
  const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message));
  await p.goto(BASE + '/index.html?e2e=' + Date.now()); await p.waitForTimeout(1500);
  await p.click('#card-seguridad'); await p.waitForURL(/seguridad/); await p.waitForTimeout(2000);
  await p.locator('[onclick="goInstPin()"]').first().click(); await p.waitForTimeout(500);
  let e = await estado(p);
  check('Entró por clic real al Panel del Instructor (v' + ESPERADO_VER + ')', e.pantalla === 's-inst' && e.version.trim() === 'v' + ESPERADO_VER, e.version);
  await p.locator('#s-inst .tab-row .tab', { hasText: 'Cursos' }).click(); await p.waitForTimeout(200);
  e = await estado(p);
  check('Cursos pintados al entrar desde la Suite (11)', e.cursosPintados === 11, String(e.cursosPintados));
  check('Instructores pintados (3)', e.instructores === 3, String(e.instructores));
  check('La selección visible es la real', JSON.stringify(e.marcados) === JSON.stringify(e.reales), e.marcados.length + ' visibles / ' + e.reales.length + ' reales');
  await shot(p, 'E1-cursos-desde-suite-380', true);

  // Marcar exactamente 2 cursos con clics
  await p.click('button:has-text("✗ Ninguno")');
  for (const n of D.cursos) await p.locator('#course-selector .course-chk', { hasText: n }).click();
  e = await estado(p);
  check('Tras marcar 2 cursos: visible = real = 2', e.marcados.length === 2 && JSON.stringify(e.marcados) === JSON.stringify(e.reales), JSON.stringify(e.marcados));
  // Salir y volver a entrar: sigue coincidiendo
  await p.locator('#s-inst .tb-badge', { hasText: 'Salir' }).click(); await p.waitForTimeout(300);
  await p.locator('[onclick="goInstPin()"]').first().click(); await p.waitForTimeout(400);
  await p.locator('#s-inst .tab-row .tab', { hasText: 'Cursos' }).click(); await p.waitForTimeout(200);
  e = await estado(p);
  check('Salir y volver a entrar: la selección sigue visible y coincide', JSON.stringify(e.marcados) === JSON.stringify(e.reales) && e.marcados.length === 2, JSON.stringify(e.marcados));

  // Generar DC-3 individual: exactamente las 2 constancias marcadas
  await p.locator('#s-inst .tab-row .tab', { hasText: 'Trabajadores' }).click();
  await p.fill('#new-ap', D.w[0]); await p.fill('#new-am', D.w[1]); await p.fill('#new-nom', D.w[2]); await p.fill('#new-curp', D.w[3]); await p.click('#tp-workers button.btn-p');
  await p.locator('#s-inst .tab-row .tab', { hasText: 'Generar DC-3' }).click();
  await p.fill('#inst-fecha', D.ini); await p.dispatchEvent('#inst-fecha', 'change');
  // 8 h + 8 h: dos días (el tope de 12 h por persona y día no deja hacerlos el mismo día)
  await p.fill('#inst-fecha-fin', D.fin); await p.dispatchEvent('#inst-fecha-fin', 'change');
  const resumen = await p.textContent('#gen-sub');
  check('Resumen de Generar: 1 trabajador · 2 cursos', /1 trabajador\(es\) · 2 curso\(s\)/.test(resumen), resumen);
  p.on('console', m => { if (m.type() === 'error' || /PDF/.test(m.text())) errores.push('consola: ' + m.text().slice(0, 200)); }); p.on('dialog', d => { errores.push('alerta: ' + d.message().slice(0, 200)); d.dismiss(); });
  let [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]);
  const f1 = path.join(tmp, 'ind.pdf'); await dl.saveAs(f1);
  check('DC-3 individual: exactamente 2 constancias, las marcadas', paginas(f1) === 2 && JSON.stringify(cursosDe(f1).sort()) === JSON.stringify(D.cursos.slice().sort()), cursosDe(f1).join(' | '));
  if (SHOTS) execFileSync('pdftoppm', ['-r', '100', '-png', '-f', '1', '-l', '1', f1, path.join(SHOTS, 'E1-pdf-individual')]);
  // Lote: 3 casillas → 3 constancias
  await p.locator('#s-inst .tab-row .tab', { hasText: 'Impresión por Lote' }).click();
  await p.fill('#lote-ini', D.lote[0][1]);
  for (const [c, d] of D.lote) {
    await p.locator(`#lote-mx td.lm-cel input[data-w="0"][data-c="${c}"]`).check();
    const id = await p.evaluate(c => lote.asg.find(a => String(a.curso) === String(c)).id, c);
    for (const k of ['ini', 'fin']) { const s = `#lote-asg input[data-id="${id}"][data-k="${k}"]`; await p.fill(s, d); await p.dispatchEvent(s, 'change'); }
  }
  [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#lote-btn')]);
  const z = path.join(tmp, 'lote.zip'); await dl.saveAs(z);
  const dz = path.join(tmp, 'lote'); fs.mkdirSync(dz);
  execFileSync('python3', ['-I', '-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', z, dz]);
  const pdfs = fs.readdirSync(dz);
  check('Lote: 1 PDF con exactamente las 3 constancias marcadas', pdfs.length === 1 && paginas(path.join(dz, pdfs[0])) === 3, pdfs.join(',') + ' · ' + (pdfs[0] ? cursosDe(path.join(dz, pdfs[0])).join(' | ') : ''));
  await ctx.close();

  // ── 2. Login con usuario y contraseña (sesión de Suite sin acceso directo a instructor) ──
  const ctx2 = await b.newContext({ viewport: { width: 380, height: 820 } });
  await ctx2.addInitScript(s => localStorage.setItem('fts_session', s), SES({ seguridad: { acceso: true, submodulos: { instructor: false, empleado: true } } }));
  await ctx2.route(/users\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ user: 'zz.prueba.e1', pass: 'zz-prueba-e1', expira: '2099-12-31', acceso: 'ambos' }] }) }));
  const q = await ctx2.newPage(); q.on('pageerror', x => errores.push('login: ' + x.message));
  await q.goto(BASE + '/seguridad/index.html?e2e=' + Date.now()); await q.waitForTimeout(2000);
  await q.evaluate(() => goInstPin()); await q.waitForTimeout(300);
  check('Sin permiso directo, pide usuario y contraseña', await q.evaluate(() => document.querySelector('.scr.on').id === 's-pin'));
  await q.fill('#auth-user', 'zz.prueba.e1'); await q.fill('#auth-pass', 'zz-prueba-e1');
  await q.evaluate(() => authLogin()); await q.waitForTimeout(800);
  await q.locator('#s-inst .tab-row .tab', { hasText: 'Cursos' }).click(); await q.waitForTimeout(200);
  e = await estado(q);
  check('Login con usuario y contraseña: entra con cursos e instructores pintados', e.pantalla === 's-inst' && e.cursosPintados === 11 && e.instructores === 3 && JSON.stringify(e.marcados) === JSON.stringify(e.reales), JSON.stringify({ c: e.cursosPintados, i: e.instructores }));
  await ctx2.close();

  check('Sin errores de JavaScript', !errores.length, errores.join(' | '));
  await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
  const f = R.filter(r => !r.ok).length;
  console.log(f ? `\n${f} FALLA(S) de ${R.length}` : `\nTodas pasan (${R.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
