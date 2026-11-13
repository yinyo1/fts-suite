// Prueba del PROTOTIPO de la Fase 2 del DC-3 (#507) contra la app publicada v1.2.0.
// Uso:  node seguridad/tests/dc3-prototipo.e2e.js <carpeta_salida>
//   PROTO=<ruta del .html>   (por omisión seguridad/prototipos/dc3-fase2/dc3-fase2-prototipo.html)
//   PROD=<base publicada>     (por omisión https://yinyo1.github.io/fts-suite)
// El prototipo se abre como archivo y SIN RED (contexto offline). Producción se abre con una
// sesión FTSAuth de prueba solo en el navegador de la prueba. Todos los datos son inventados.
// Rondas: R1 individual · R2 lote · R3 fallas · R4 coherencia y almacenamiento.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { espia, leerPagina, PROHIBIDOS } = require('./lib/dc3-pdf');

const PROTO = path.resolve(process.env.PROTO || 'seguridad/prototipos/dc3-fase2/dc3-fase2-prototipo.html');
const PROD = (process.env.PROD || 'https://yinyo1.github.io/fts-suite').replace(/\/$/, '');
const OUT = path.resolve(process.argv[2] || 'dc3-prototipo-salida');
fs.mkdirSync(OUT, { recursive: true });
const R = [];
let ronda = '';
function check(nombre, ok, detalle) { R.push({ ronda, nombre, ok: !!ok, detalle: detalle == null ? '' : String(detalle) }); console.log((ok ? 'OK   ' : 'FALLA ') + '[' + ronda + '] ' + nombre + (detalle ? '  → ' + String(detalle).slice(0, 220) : '')); }
const espera = ms => new Promise(r => setTimeout(r, ms));

// ── Abrir ──
async function abrirProto(b, w) {
  const ctx = await b.newContext({ viewport: { width: w || 380, height: 820 }, acceptDownloads: true, offline: true });
  const p = await ctx.newPage(); p.__err = [];
  p.on('pageerror', e => p.__err.push(e.message));
  p.on('dialog', d => { p.__err.push('alerta: ' + d.message()); d.dismiss(); });
  await p.goto('file://' + PROTO); await p.waitForTimeout(1500);
  return p;
}
async function abrirProd(b, w) {
  const ctx = await b.newContext({ viewport: { width: w || 380, height: 820 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.__err = [];
  p.on('pageerror', e => p.__err.push(e.message));
  await p.addInitScript(() => localStorage.setItem('fts_session', JSON.stringify({ userId: 'e2e', username: 'prueba.e2e', nombre: 'PRUEBA E2E', role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now() })));
  await p.goto(PROD + '/seguridad/index.html?e2e=' + Date.now()); await p.waitForTimeout(2500);
  await p.evaluate(() => goInstPin()); await p.waitForTimeout(400);
  return p;
}
async function tab(p, t) { await p.locator('#s-inst .tab-row .tab', { hasText: t }).click(); await p.waitForTimeout(150); }
async function alta(p, ap, am, nom, curp) { await tab(p, 'Trabajadores'); await p.fill('#new-ap', ap); await p.fill('#new-am', am); await p.fill('#new-nom', nom); await p.fill('#new-curp', curp); await p.click('#tp-workers button.btn-p'); await p.waitForTimeout(100); }
async function buscarElegir(p, ctx, q, quien) {
  await p.fill('#po-q-' + ctx, q);
  const it = p.locator('#po-res-' + ctx + ' .po-it', { hasText: quien });
  await it.first().waitFor({ timeout: 5000 }); await it.first().click(); await p.waitForTimeout(400);
}
async function soloSel(p, idx) { await p.evaluate(i => { inst.selWorkers.clear(); i.forEach(x => inst.selWorkers.add(x)); renderWorkerList(); renderGenSummary(); }, idx); }
async function cursos(p, ids) { await p.evaluate(ids => { inst.selCourses.clear(); ids.forEach(i => inst.selCourses.add(i)); renderCourseSelector(); renderGenSummary(); }, ids); }
async function fechas(p, ini, fin) {
  await tab(p, 'Generar DC-3');
  await p.fill('#inst-fecha', ini); await p.dispatchEvent('#inst-fecha', 'change');
  await p.fill('#inst-fecha-fin', fin); await p.dispatchEvent('#inst-fecha-fin', 'change');
}
async function generar(p, archivo) {
  await espia(p);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]);
  const f = path.join(OUT, archivo); await dl.saveAs(f);
  const pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
  return { f, pags, nombre: dl.suggestedFilename() };
}
async function noDescarga(p, sel) {
  let hubo = false; const h = () => { hubo = true; }; p.on('download', h);
  await p.click(sel); await p.waitForTimeout(1500); p.off('download', h); return !hubo;
}
function puestoDe(pg) { const t = pg.textos, a = t.indexOf('Puesto*'), b = t.indexOf('DATOS DE LA EMPRESA'); return t.slice(a + 1, b).join(' '); }
function png(pdf, pref) { execFileSync('pdftoppm', ['-r', '100', '-png', pdf, pref]); return fs.readdirSync(path.dirname(pref)).filter(n => n.startsWith(path.basename(pref) + '-') && n.endsWith('.png')).sort().map(n => path.join(path.dirname(pref), n)); }
// Diferencia de pixeles entre dos imágenes (python + PIL): {n, caja_mm}
function difPx(a, b) {
  const s = execFileSync('python3', ['-I', '-c', 'import sys,json\nfrom PIL import Image,ImageChops\na=Image.open(sys.argv[1]).convert("L");b=Image.open(sys.argv[2]).convert("L")\nif a.size!=b.size: print(json.dumps({"n":-1}));sys.exit()\nd=ImageChops.difference(a,b).point(lambda v:255 if v>24 else 0)\nbb=d.getbbox();n=sum(1 for v in d.tobytes() if v)\nk=25.4/100\nprint(json.dumps({"n":n,"caja_mm":[round(x*k,1) for x in bb] if bb else None}))', a, b]).toString();
  return JSON.parse(s);
}
function texto(pdf) { return execFileSync('pdftotext', ['-layout', pdf, '-']).toString(); }
function revisarProhibidos(etq, pdf) { const tx = texto(pdf), m = PROHIBIDOS.filter(x => tx.includes(x)); check(etq + ': sin datos retirados (registro patronal, D4247032…)', !m.length, m.join(',')); }
async function almacen(p) {
  return p.evaluate(async () => {
    const RE = /[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d?/;
    const vol = s => { const o = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); o.push(k + '=' + s.getItem(k)); } return o.join('\n'); };
    let ls = '', ss = '', cc = [], idb = [];
    try { ls = vol(localStorage); } catch (e) {}
    try { ss = vol(sessionStorage); } catch (e) {}
    try { cc = await caches.keys(); } catch (e) {}
    try { idb = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : []; } catch (e) {}
    let sw = 0; try { sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0; } catch (e) { sw = navigator.serviceWorker && navigator.serviceWorker.controller ? 1 : 0; }
    return { curpLS: RE.test(ls), curpSS: RE.test(ss), caches: cc, idb, sw, lsLlaves: ls.split('\n').filter(Boolean).map(x => x.split('=')[0]) };
  });
}
async function cap(p, nombre, full) { const f = path.join(OUT, nombre + '.png'); await p.screenshot({ path: f, fullPage: !!full }); return f; }

(async () => {
  const b = await chromium.launch();

  // ══════════════ RONDA 1 · INDIVIDUAL ══════════════
  ronda = 'R1';
  {
    const p = await abrirProto(b), q = await abrirProd(b);
    check('Prototipo abre sin red en el Panel del Instructor, v1.2.0 y marca PROTOTIPO', await p.evaluate(() => document.querySelector('.scr.on').id === 's-inst' && document.getElementById('dc3-ver-inst').textContent.trim() === 'v1.2.0' && /PROTOTIPO · datos demo/.test(document.getElementById('po-tira').textContent)));
    // a) Odoo completo · curso de 12 h en un día
    await tab(p, 'Trabajadores'); await buscarElegir(p, 'w', 'laura', 'Laura Patricia');
    check('Odoo completo: entra con nombre en orden DC-3, CURP y puesto', await p.evaluate(() => { const w = inst.workers[0]; return w.name === 'GOMEZ TREVIÑO LAURA PATRICIA' && w.curp === 'GOTL900215MNLXXX04' && w.puesto === 'Segurista' && w.fuente === 'odoo'; }));
    await cursos(p, [7]); await fechas(p, '2026-11-20', '2026-11-20'); await soloSel(p, [0]);
    const A = await generar(p, 'R1-A-odoo-completo-12h.pdf');
    const pa = A.pags[0];
    check('A · PDF: nombre, CURP 18 casillas, 12 h el mismo día', pa.nombre === 'GOMEZ TREVIÑO LAURA PATRICIA' && pa.curpN === 18 && pa.curp === 'GOTL900215MNLXXX04' && pa.horas === '12' && pa.periodo === '2026-11-20 a 2026-11-20', [pa.nombre, pa.curpN, pa.horas, pa.periodo].join(' · '));
    check('A · PDF: Puesto* lleno desde Odoo', puestoDe(pa) === 'Segurista', puestoDe(pa));
    check('A · PDF: tres firmas y logo', JSON.stringify(pa.firmas) === '["dc3_sig_e","dc3_sig_t","dc3_sig_f"]');
    revisarProhibidos('A', A.f);
    // misma persona capturada a mano en producción
    await alta(q, 'GOMEZ', 'TREVIÑO', 'LAURA PATRICIA', 'GOTL900215MNLXXX04'); await cursos(q, [7]); await fechas(q, '2026-11-20', '2026-11-20'); await soloSel(q, [0]);
    const Aq = await generar(q, 'R1-A-produccion.pdf');
    const extra = pa.textos.filter(t => !Aq.pags[0].textos.includes(t)), falta = Aq.pags[0].textos.filter(t => !pa.textos.includes(t));
    check('A vs producción: el texto es el mismo salvo «Segurista» en Puesto*', JSON.stringify(extra) === '["Segurista"]' && !falta.length, 'extra=' + JSON.stringify(extra) + ' falta=' + JSON.stringify(falta));
    const ia = png(A.f, path.join(OUT, 'R1-A-proto')), iq = png(Aq.f, path.join(OUT, 'R1-A-prod'));
    const dA = difPx(ia[0], iq[0]);
    check('A vs producción: los pixeles solo cambian en la fila Puesto* (71.5–81.5 mm)', dA.n > 0 && dA.caja_mm && dA.caja_mm[1] >= 71.5 && dA.caja_mm[3] <= 81.5, JSON.stringify(dA));

    // b) Odoo sin CURP: bloquea hasta capturarla
    await tab(p, 'Trabajadores'); await buscarElegir(p, 'w', 'elizondo', 'Martín');
    await soloSel(p, [1]); await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20');
    const gv = await p.textContent('#gen-val');
    check('B · sin CURP: Generar muestra el motivo', /sin CURP/.test(gv), gv.trim().slice(0, 140));
    check('B · sin CURP: no descarga nada', await noDescarga(p, '#tp-generate button.btn-p'));
    await cap(p, 'R1-B-sin-curp-bloquea-380', true);
    await tab(p, 'Trabajadores');
    await p.fill('.po-fix input[data-i="1"][data-k="curp"]', 'EICM850101HNLXXX07'); await p.click('.po-fix-ok[data-i="1"]');
    check('B · CURP capturada a mano: el trabajador queda completo', await p.evaluate(() => window.PROTO_ODOO.faltan(inst.workers[1]).length === 0 && inst.workers[1].curp === 'EICM850101HNLXXX07'));
    await fechas(p, '2026-11-20', '2026-11-20');
    const B = await generar(p, 'R1-B-curp-capturada.pdf');
    check('B · ya genera: CURP en casillas y puesto Soldador', B.pags[0].curp === 'EICM850101HNLXXX07' && puestoDe(B.pags[0]) === 'Soldador');
    png(B.f, path.join(OUT, 'R1-B'));

    // c) 100 % manual: idéntico a producción
    await alta(p, 'PRUEBA', 'MANUAL', 'CARLOS', 'PUMC800101HNLXXX01');
    await soloSel(p, [2]); await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20');
    const C = await generar(p, 'R1-C-manual.pdf');
    await alta(q, 'PRUEBA', 'MANUAL', 'CARLOS', 'PUMC800101HNLXXX01'); await soloSel(q, [1]); await cursos(q, [1]); await fechas(q, '2026-11-20', '2026-11-20');
    const Cq = await generar(q, 'R1-C-produccion.pdf');
    check('C · manual: texto idéntico a producción', JSON.stringify(C.pags[0].textos) === JSON.stringify(Cq.pags[0].textos));
    const dC = difPx(png(C.f, path.join(OUT, 'R1-C-proto'))[0], png(Cq.f, path.join(OUT, 'R1-C-prod'))[0]);
    check('C · manual: imagen idéntica a producción (0 pixeles distintos)', dC.n === 0, JSON.stringify(dC));
    check('C · manual: mismo nombre de archivo que producción', C.nombre === Cq.nombre, C.nombre);

    // d) 16 h en un día bloquea; en dos días pasa
    await cursos(p, [9]); await fechas(p, '2026-11-20', '2026-11-20');
    const g16 = await p.textContent('#gen-val');
    check('D · 16 h en un día: bloquea con mensaje', /al menos 2 días/.test(g16) && await noDescarga(p, '#tp-generate button.btn-p'), g16.trim().slice(0, 120));
    await fechas(p, '2026-11-20', '2026-11-21');
    const D = await generar(p, 'R1-D-16h-2dias.pdf');
    check('D · 16 h en dos días: pasa, periodo 20→21', D.pags[0].periodo === '2026-11-20 a 2026-11-21' && D.pags[0].horas === '16');
    png(D.f, path.join(OUT, 'R1-D'));
    check('Sin errores de JavaScript (prototipo)', !p.__err.length, p.__err.join(' | '));
    await p.context().close(); await q.context().close();
  }

  // ══════════════ RONDA 2 · LOTE ══════════════
  ronda = 'R2';
  const plan4 = [[4, '2026-11-02'], [7, '2026-11-03'], [8, '2026-11-04'], [11, '2026-11-05']];
  const plan7 = plan4.concat([[5, '2026-11-06'], [3, '2026-11-09'], [6, '2026-11-10']]);
  const planDe = [plan4, plan7, plan4, plan4, plan7];
  async function armarLote(p, quien) {
    await tab(p, 'Impresión por Lote');
    await p.fill('#lote-ini', '2026-11-02'); await p.click('button:has-text("Aplicar a todas")');
    for (const wi of quien) for (const [c] of planDe[wi]) await p.locator(`#lote-mx td.lm-cel input[data-w="${wi - quien[0]}"][data-c="${c}"]`).check();
    // fechas en bloque: todas al 2-nov; después por renglón
    await p.click('button:has-text("Aplicar a todas")'); await p.waitForTimeout(150);
    const ids = await p.evaluate(() => lote.asg.map(a => ({ id: a.id, w: a.empleado, c: String(a.curso) })));
    for (const a of ids) {
      const d = planDe[a.w + quien[0]].find(x => String(x[0]) === a.c)[1];
      for (const k of ['ini', 'fin']) { const sel = `#lote-asg input[data-id="${a.id}"][data-k="${k}"]`; await p.fill(sel, d); await p.dispatchEvent(sel, 'change'); }
    }
  }
  async function zip(p, nombre) {
    await espia(p);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#lote-btn')]);
    const zp = path.join(OUT, nombre + '.zip'); await dl.saveAs(zp);
    const dz = path.join(OUT, nombre); fs.rmSync(dz, { recursive: true, force: true }); fs.mkdirSync(dz);
    // python zipfile respeta la marca UTF-8 de JSZip (el `unzip` del sistema no, y cambia la Ñ)
    execFileSync('python3', ['-I', '-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zp, dz]);
    const utf8 = JSON.parse(execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json; print(json.dumps([bool(i.flag_bits & 0x800) or i.filename.isascii() for i in zipfile.ZipFile(sys.argv[1]).infolist()]))', zp]).toString());
    check('ZIP ' + nombre + ': nombres con acento/Ñ marcados como UTF-8', utf8.every(Boolean));
    return { dz, nombre: dl.suggestedFilename(), pdfs: fs.readdirSync(dz).filter(n => n.endsWith('.pdf')).sort(), pags: (await p.evaluate(() => window.__pags)).map(leerPagina) };
  }
  {
    const p = await abrirProto(b);
    await tab(p, 'Impresión por Lote');
    await buscarElegir(p, 'l', 'laura', 'Laura Patricia');
    await buscarElegir(p, 'l', 'rodrigo', 'Rodrigo');
    await buscarElegir(p, 'l', 'gabriela', 'Gabriela');
    await alta(p, 'MANUAL', 'UNO', 'ANDREA', 'MAUA900101MNLXXX01');
    await alta(p, 'MANUAL', 'DOS', 'BENITO', 'MADB910202HNLXXX02');
    check('5 trabajadores: 3 de Odoo y 2 manuales', await p.evaluate(() => inst.workers.length === 5 && inst.workers.filter(w => w.fuente === 'odoo').length === 3));
    await tab(p, 'Impresión por Lote');
    // tope diario por persona
    await p.fill('#lote-ini', '2026-11-20'); await p.fill('#lote-fin', '');
    const cel = (w, c) => p.locator(`#lote-mx td.lm-cel input[data-w="${w}"][data-c="${c}"]`);
    await cel(0, 1).check(); await cel(0, 2).check(); await p.waitForTimeout(150);
    const e14 = await p.locator('#lote-mx td.lm-cel.err .lm-e').first().textContent().catch(() => '');
    check('Tope: 8 h + 6 h la misma persona el mismo día bloquea', /14 h sumadas/.test(e14) && await p.locator('#lote-btn').isDisabled(), e14);
    await cel(0, 2).uncheck();
    await tab(p, 'Cursos'); await p.click('button:has-text("Curso personalizado")'); await p.fill('#nc-nombre', 'CURSO PRUEBA CUATRO HORAS'); await p.fill('#nc-hrs', '4'); await p.click('button:has-text("Agregar y seleccionar")');
    await tab(p, 'Impresión por Lote'); await cel(0, 9001).check(); await p.waitForTimeout(150);
    check('Tope: 8 h + 4 h la misma persona pasa', !(await p.locator('#lote-btn').isDisabled()));
    await p.evaluate(() => { lote.asg = []; renderLote(); });
    await p.locator('#lote-mx th.lm-cur input[data-c="7"]').check(); await p.waitForTimeout(150);
    check('Dos o más personas, mismo curso de 12 h el mismo día: pasa', !(await p.locator('#lote-btn').isDisabled()) && (await p.evaluate(() => lote.asg.length)) === 5);
    await p.evaluate(() => { lote.asg = []; renderLote(); });
    // lote principal: 4 y 7 cursos, fechas en bloque y por renglón
    await armarLote(p, [0, 1, 2, 3, 4]);
    const total = await p.evaluate(() => lote.asg.length);
    check('Lote: 26 DC-3 (3×4 + 2×7), sin errores', total === 26 && !(await p.locator('#lote-btn').isDisabled()), String(total));
    await cap(p, 'R2-lote-listo-380', true);
    const Z = await zip(p, 'R2-lote-proto');
    check('ZIP: nombre DC3_lote_AAAA-MM-DD.zip y 5 PDF', /^DC3_lote_\d{4}-\d{2}-\d{2}\.zip$/.test(Z.nombre) && Z.pdfs.length === 5, Z.nombre + ' → ' + Z.pdfs.join(', '));
    const W = await p.evaluate(() => inst.workers.map(w => ({ name: w.name, curp: w.curp, puesto: w.puesto || '' })));
    let k = 0, okP = true, det = [];
    W.forEach((w, wi) => planDe[wi].forEach(([c, d]) => { const pg = Z.pags[k++]; const bien = pg.nombre === w.name && pg.curp === w.curp && pg.periodo === d + ' a ' + d && puestoDe(pg) === w.puesto && pg.firmas.length === 3; if (!bien) { okP = false; det.push(k + ':' + pg.nombre + '/' + pg.periodo + '/' + puestoDe(pg)); } }));
    check('Cada página: nombre, CURP, su fecha por renglón, Puesto* (Odoo lleno, manual vacío), 3 firmas', okP && k === 26, det.join(' | '));
    for (const n of Z.pdfs) { const pz = texto(path.join(Z.dz, n)).split('\f').length - 1; const w = W.find(x => 'DC3_' + x.name.replace(/\s+/g, '_') + '.pdf' === n); check('ZIP · ' + n + ': ' + (w ? planDe[W.indexOf(w)].length : '?') + ' páginas', w && pz === planDe[W.indexOf(w)].length, pz); revisarProhibidos('ZIP · ' + n, path.join(Z.dz, n)); }
    // comparación contra producción: los dos manuales, mismo plan
    const q = await abrirProd(b);
    await alta(q, 'MANUAL', 'UNO', 'ANDREA', 'MAUA900101MNLXXX01'); await alta(q, 'MANUAL', 'DOS', 'BENITO', 'MADB910202HNLXXX02');
    await armarLote(q, [3, 4]);
    const Zq = await zip(q, 'R2-lote-prod');
    for (const n of Zq.pdfs) {
      const a = png(path.join(Z.dz, n), path.join(OUT, 'R2-cmp-proto-' + n.replace('.pdf', ''))), c = png(path.join(Zq.dz, n), path.join(OUT, 'R2-cmp-prod-' + n.replace('.pdf', '')));
      const d = a.map((x, i) => difPx(x, c[i]).n);
      check('Lote vs producción · ' + n + ': ' + a.length + ' páginas idénticas en pixeles', a.length === c.length && d.every(x => x === 0), JSON.stringify(d));
    }
    png(path.join(Z.dz, Z.pdfs[0]), path.join(OUT, 'R2-muestra-' + Z.pdfs[0].replace('.pdf', '')));
    check('Sin errores de JavaScript (prototipo)', !p.__err.length, p.__err.join(' | '));
    R.__almR2 = await almacen(p);
    await p.context().close(); await q.context().close();
  }

  // ══════════════ RONDA 3 · FALLAS ══════════════
  ronda = 'R3';
  {
    const p = await abrirProto(b);
    await tab(p, 'Trabajadores'); await buscarElegir(p, 'w', 'laura', 'Laura Patricia');
    await alta(p, 'MANUAL', 'UNO', 'ANDREA', 'MAUA900101MNLXXX01');
    await tab(p, 'Impresión por Lote'); await p.fill('#lote-ini', '2026-11-20');
    await p.locator('#lote-mx th.lm-cur input[data-c="1"]').check(); await p.waitForTimeout(150);
    const antes = await p.evaluate(() => ({ w: inst.workers.length, a: lote.asg.length, s: [...inst.selWorkers].join(',') }));
    // Odoo cae a media captura
    await p.click('#po-off'); await p.fill('#po-q-l', 'rodri');
    await p.waitForSelector('#tp-workers .po-caida', { timeout: 8000 }).catch(() => {});
    const desp = await p.evaluate(() => ({ w: inst.workers.length, a: lote.asg.length, s: [...inst.selWorkers].join(','), tab: document.querySelector('.tab-pane.on').id, foco: document.activeElement && document.activeElement.id, aviso: !!document.querySelector('#tp-workers .po-caida') }));
    check('Odoo no responde: aviso y pasa a captura manual', desp.aviso && desp.tab === 'tp-workers' && desp.foco === 'new-ap', JSON.stringify(desp));
    check('Odoo no responde: no se pierde lo ya elegido (trabajadores, selección, asignaciones)', antes.w === desp.w && antes.a === desp.a && antes.s === desp.s, JSON.stringify({ antes, desp }));
    await cap(p, 'R3-odoo-caido-380', true);
    await alta(p, 'MANUAL', 'TRES', 'CECILIA', 'MATC920303MNLXXX03');
    check('Odoo caído: la captura manual sigue funcionando', await p.evaluate(() => inst.workers.length === 3 && inst.workers[2].fuente === 'manual'));
    await tab(p, 'Impresión por Lote'); await p.locator('#lote-mx td.lm-cel input[data-w="2"][data-c="1"]').check();
    const Zf = await zip(p, 'R3-lote-tras-caida');
    check('Odoo caído: el ZIP sale con los 3 (Odoo + manuales)', Zf.pdfs.length === 3, Zf.pdfs.join(', '));
    await p.click('#po-on'); await p.fill('#po-q-l', 'gabri'); await p.locator('#po-res-l .po-it').first().waitFor({ timeout: 5000 });
    check('Odoo vuelve: el buscador responde y el aviso se quita', !(await p.locator('#tp-lote .po-caida').count()));
    await p.fill('#po-q-l', '');
    // CURP inválida
    await tab(p, 'Trabajadores'); await buscarElegir(p, 'w', 'saldivar', 'Héctor');
    const hi = await p.evaluate(() => inst.workers.length - 1);
    await soloSel(p, [hi]); await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20');
    check('CURP inválida: se marca y bloquea Generar', /CURP inválida/.test(await p.textContent('#gen-val')) && await noDescarga(p, '#tp-generate button.btn-p'));
    await tab(p, 'Trabajadores');
    await p.fill(`.po-fix input[data-i="${hi}"][data-k="curp"]`, 'SAPH910310HNLXXX0'); await p.click(`.po-fix-ok[data-i="${hi}"]`);
    check('CURP inválida: corregirla con 17 caracteres se rechaza', await p.evaluate(i => window.PROTO_ODOO.faltan(inst.workers[i]).length > 0, hi));
    await p.fill(`.po-fix input[data-i="${hi}"][data-k="curp"]`, 'SAPH910310HNLXXX08'); await p.click(`.po-fix-ok[data-i="${hi}"]`);
    check('CURP inválida: con la CURP correcta queda listo', await p.evaluate(i => window.PROTO_ODOO.faltan(inst.workers[i]).length === 0, hi));
    // Nombre incompleto
    await buscarElegir(p, 'w', 'sofia', 'Sofía');
    const si = await p.evaluate(() => inst.workers.length - 1);
    await tab(p, 'Impresión por Lote'); await p.locator(`#lote-mx td.lm-cel input[data-w="${si}"][data-c="8"]`).check(); await p.waitForTimeout(150);
    const est = await p.textContent('#lote-estado');
    check('Nombre sin separar: se marca y el ZIP queda bloqueado', await p.locator('#lote-btn').isDisabled() && /con error/.test(est), est.trim());
    await cap(p, 'R3-nombre-incompleto-lote-380', true);
    await tab(p, 'Trabajadores');
    for (const [k, v] of [['ap', 'RAMIREZ'], ['am', 'GARZA'], ['nom', 'SOFIA']]) await p.fill(`.po-fix input[data-i="${si}"][data-k="${k}"]`, v);
    await p.click(`.po-fix-ok[data-i="${si}"]`);
    await tab(p, 'Impresión por Lote');
    check('Nombre completado a mano: queda «RAMIREZ GARZA SOFIA» y el ZIP se habilita', (await p.evaluate(i => inst.workers[i].name, si)) === 'RAMIREZ GARZA SOFIA' && !(await p.locator('#lote-btn').isDisabled()));
    // Duplicados
    await tab(p, 'Trabajadores'); await p.fill('#po-q-w', 'villarreal'); await p.locator('#po-res-w .po-it').first().waitFor();
    check('Duplicado archivado: la búsqueda muestra a la persona una sola vez', (await p.locator('#po-res-w .po-it').count()) === 1);
    await p.locator('#po-res-w .po-it').first().click(); await p.waitForTimeout(400);
    await buscarElegir(p, 'w', 'villarreal', 'Rodrigo');
    check('Duplicado: elegirla dos veces no la repite en la lista', await p.evaluate(() => inst.workers.filter(w => w.odoo_id === 9002).length === 1));
    // Fecha fin antes que inicio
    await soloSel(p, [0]); await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-19');
    check('Fin antes que inicio: Generar bloquea', /anterior al inicio/.test(await p.textContent('#gen-val')) && await noDescarga(p, '#tp-generate button.btn-p'));
    await tab(p, 'Impresión por Lote');
    const a0 = await p.evaluate(() => lote.asg[0].id);
    await p.fill(`#lote-asg input[data-id="${a0}"][data-k="fin"]`, '2026-11-19'); await p.dispatchEvent(`#lote-asg input[data-id="${a0}"][data-k="fin"]`, 'change');
    check('Fin antes que inicio: el lote bloquea', await p.locator('#lote-btn').isDisabled() && /anterior al inicio/.test(await p.textContent('#lote-asg')));
    // CURP con formato inválido en la captura manual
    const n0 = await p.evaluate(() => inst.workers.length);
    await alta(p, 'FORMATO', 'MALO', 'PEDRO', 'ABCD123456HNLXXX01');
    check('Captura manual: CURP con formato inválido no se agrega', (await p.evaluate(() => inst.workers.length)) === n0);
    check('Sin errores de JavaScript (prototipo)', !p.__err.length, p.__err.join(' | '));
    R.__almR3 = await almacen(p);
    await p.context().close();
  }

  // ══════════════ RONDA 4 · COHERENCIA, CELULAR, ALMACENAMIENTO ══════════════
  ronda = 'R4';
  {
    const pares = [];
    for (const w of [380, 1280]) {
      const p = await abrirProto(b, w), q = await abrirProd(b, w);
      // HALLAZGO de producción (#507): entrando desde la Suite, goInstPin() no llama loadInstDashboard()
      // y Cursos/Instructor salen vacíos (con los 11 cursos seleccionados en silencio). Se registra y,
      // para comparar pantalla contra pantalla, se pinta producción como la deja el login de instructor.
      const vacio = await q.evaluate(() => document.querySelectorAll('#course-selector .course-chk').length);
      check(w + ' px · [hallazgo producción] Cursos vacío al entrar desde la Suite: ' + (vacio === 0 ? 'sí ocurre' : 'ya no ocurre'), true, vacio + ' cursos pintados');
      await q.evaluate(() => loadInstDashboard());
      for (const [t, k] of [['Trabajadores', 'trabajadores'], ['Cursos', 'cursos'], ['Generar DC-3', 'generar'], ['Impresión por Lote', 'lote']]) {
        await tab(p, t); await tab(q, t);
        const a = await cap(p, 'R4-' + w + '-' + k + '-proto', w === 380), c = await cap(q, 'R4-' + w + '-' + k + '-prod', w === 380);
        pares.push([a, c, 'R4-lado-' + w + '-' + k + '.png']);
        const pane = { workers: 'tp-workers', courses: 'tp-courses', generate: 'tp-generate', lote: 'tp-lote' };
        const textoApp = pg => pg.evaluate(id => { const el = document.querySelector('.tab-pane.on').cloneNode(true); el.querySelectorAll('.po-card').forEach(x => x.remove()); const vals = [...document.querySelectorAll('.tab-pane.on input')].filter(i => !i.closest('.po-card')).map(i => i.id + '=' + (i.type === 'checkbox' ? i.checked : i.value)).join(';'); return el.innerText.replace(/\s+/g, ' ').trim() + ' ¦ ' + vals; });
        const [tp, tq] = [await textoApp(p), await textoApp(q)];
        check(w + ' px · ' + t + ': fuera del buscador nuevo, los mismos textos que producción', tp === tq, tp === tq ? '' : 'proto=' + tp.slice(0, 160) + ' | prod=' + tq.slice(0, 160));
        check(w + ' px · ' + t + ': sin scroll lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      check(w + ' px · el heartbeat de GitHub no corre en el prototipo (no cierra la sesión sin red)', await p.evaluate(() => _heartbeatTimer === null));
      const tabsP = await p.$$eval('#s-inst .tab-row .tab', ts => ts.map(x => x.textContent.trim()).join(' | ')), tabsQ = await q.$$eval('#s-inst .tab-row .tab', ts => ts.map(x => x.textContent.trim()).join(' | '));
      check(w + ' px · mismas 4 pestañas y en el mismo orden', tabsP === tabsQ, tabsP);
      await p.context().close(); await q.context().close();
    }
    // capturas lado a lado
    for (const [a, c, n] of pares) execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image,ImageDraw\na=Image.open(sys.argv[1]).convert("RGB");c=Image.open(sys.argv[2]).convert("RGB")\nh=max(a.height,c.height)+30;o=Image.new("RGB",(a.width+c.width+30,h),"white");o.paste(a,(0,30));o.paste(c,(a.width+30,30));d=ImageDraw.Draw(o);d.text((6,8),"PROTOTIPO",fill=(180,90,0));d.text((a.width+36,8),"PRODUCCION v1.2.0",fill=(0,110,0))\no.save(sys.argv[3])', a, c, path.join(OUT, n)]);
    // almacenamiento
    for (const [n, x] of [['R2', R.__almR2], ['R3', R.__almR3]]) {
      check('Tras ' + n + ': ninguna CURP en localStorage ni sessionStorage', !x.curpLS && !x.curpSS, JSON.stringify({ llaves: x.lsLlaves }));
      check('Tras ' + n + ': sin caché, IndexedDB ni service worker', !x.caches.length && !x.idb.length && x.sw === 0, JSON.stringify({ caches: x.caches, idb: x.idb, sw: x.sw }));
    }
    // dentro del visor de claude.ai: la descarga va por la capacidad «downloads»
    const ctx = await b.newContext({ viewport: { width: 380, height: 820 }, offline: true });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.__guardados = []; window.claude = { use: async n => n === 'downloads' ? { save: async o => { window.__guardados.push({ filename: o.filename, size: o.data.size || 0 }); return { status: 'saved' }; } } : null }; });
    await p.goto('file://' + PROTO); await p.waitForTimeout(1500);
    await alta(p, 'VISOR', 'PRUEBA', 'DIANA', 'VIPD900101MNLXXX01'); await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20');
    await p.click('#tp-generate button.btn-p'); await p.waitForTimeout(1500);
    await tab(p, 'Impresión por Lote'); await p.locator('#lote-mx th.lm-cur input[data-c="1"]').check(); await p.click('#lote-btn'); await p.waitForTimeout(2500);
    const g = await p.evaluate(() => window.__guardados);
    check('Visor claude.ai: PDF y ZIP se entregan por la capacidad «downloads»', g.length === 2 && /\.pdf$/.test(g[0].filename) && /\.zip$/.test(g[1].filename) && g.every(x => x.size > 1000), JSON.stringify(g));
    await ctx.close();
  }

  await b.close();
  const f = R.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(R, null, 1));
  const porRonda = {}; R.forEach(r => { porRonda[r.ronda] = porRonda[r.ronda] || [0, 0]; porRonda[r.ronda][r.ok ? 0 : 1]++; });
  console.log('\n' + Object.entries(porRonda).map(([k, v]) => k + ': ' + v[0] + ' ok, ' + v[1] + ' fallas').join(' · '));
  console.log(f ? `${f} FALLA(S) de ${R.length}` : `Todas pasan (${R.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
