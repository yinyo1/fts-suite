// Prueba del FORMATO oficial DC-3 (v1.2.0) sobre la app real, con navegador headless.
// Uso:  BASE=http://localhost:8765 node seguridad/tests/dc3-formato.e2e.js <carpeta_salida>
//       BASE=https://yinyo1.github.io/fts-suite node seguridad/tests/dc3-formato.e2e.js <carpeta_salida>
// Opcional: MUESTRA=<archivo.json> reproduce un lote completo [{name,curp,cursos:[{id,ini,fin}]}].
//   Ese archivo puede traer datos personales: va FUERA del repo y la salida también.
// Genera los PDFs por la interfaz (Generar DC-3, Impresión por Lote) y por el botón del
// autoservicio, los guarda en <carpeta_salida>, los pasa a PNG (pdftoppm) y revisa su texto
// (pdftotext). Trabajadores y CURP de los escenarios fijos son inventados.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = (process.env.BASE || 'http://localhost:8765').replace(/\/$/, '');
const OUT = path.resolve(process.argv[2] || 'dc3-formato-salida');
const MUESTRA = process.env.MUESTRA || null;
const ESPERADO_VER = '1.2.0';
fs.mkdirSync(OUT, { recursive: true });
const resultados = [];
function check(nombre, ok, detalle) { resultados.push({ nombre, ok: !!ok, detalle }); console.log((ok ? 'OK   ' : 'FALLA ') + nombre + (detalle ? '  → ' + detalle : '')); }

const CURSOS = { 1: ['BLOQUEO Y ETIQUETADO DE ENERGIAS (LO-TO)', 8, '6000 Seguridad'], 2: ['SELECCION, USO Y CONSERVACION EQUIPOS DE PROTECCION PERSONAL (EPP)', 6, '6000 Seguridad'], 3: ['SEGURIDAD EN TRABAJOS EN ALTURAS', 8, '6000 Seguridad'], 4: ['USO DE HERRAMIENTAS MANUALES', 8, '5000 Mantenimiento y reparación'], 5: ['TRABAJOS DE CORTE Y SOLDADURA CON SEGURIDAD', 8, '6000 Seguridad'], 6: ['TRABAJO SEGURO CON PLATAFORMAS DE ELEVACION PERSONAL', 8, '6000 Seguridad'], 7: ['SEGURIDAD ELECTRICA', 12, '6000 Seguridad'], 8: ['USO DE EXTINTORES', 8, '6000 Seguridad'], 9: ['SEGURIDAD DE ARC FLASH (NFPA 70E)', 16, '6000 Seguridad'], 10: ['SEGURIDAD EN MANIPULACION DE QUIMICOS', 16, '6000 Seguridad'], 11: ['SEGURIDAD INDUSTRIAL', 8, '6000 Seguridad'] };
const FIJOS = ['FORMATO DC-3', 'CONSTANCIA DE COMPETENCIAS O DE HABILIDADES LABORALES', 'En este espacio la empresa puede imprimir su logotipo y, en su caso, también se puede imprimir el del agente capacitador externo.',
  'DATOS DEL TRABAJADOR', 'Nombre (Anotar apellido paterno, apellido materno y nombre (s))', 'Clave Única de Registro de Población', 'Ocupación específica (Catálogo Nacional de Ocupaciones)', 'Puesto*',
  'DATOS DE LA EMPRESA', 'Nombre o razón social (En caso de persona física, anotar apellido paterno, apellido materno y nombre(s))', 'Registro Federal de Contribuyentes con homoclave (SHCP)', 'SERVICIOS FTS SA DE CV',
  'DATOS DEL PROGRAMA DE CAPACITACIÓN, ADIESTRAMIENTO Y PRODUCTIVIDAD', 'Nombre del curso', 'Duración en horas', 'Periodo de', 'ejecución:', 'Área temática del curso', 'Nombre del agente capacitador o STPS',
  'Los datos se asientan en esta constancia bajo protesta de decir verdad, apercibidos de la responsabilidad en que incurre todo', 'aquel que no se conduce con verdad.',
  'Instructor o tutor', 'Patrón o representante legal', 'Representante de los trabajadores', 'TEOFILO TAURINO LUGO VALEZ', 'FRANCISCO MONTALVO RAMIREZ', '04.6 Procesos industriales',
  'INSTRUCCIONES', '- Llenar a máquina o con letra de molde.', '- Deberá entregarse al trabajador dentro de los veinte días hábiles siguientes al término del curso de capacitación aprobado.',
  'Las áreas y subáreas ocupacionales del Catálogo Nacional de Ocupaciones se encuentran disponibles en el reverso de este formato y en la página www.stps.gob.mx',
  'Las áreas temáticas de los cursos se encuentran disponibles en el reverso de este formato y en la página www.stps.gob.mx',
  'Cursos impartidos por el área competente de la Secretaría del Trabajo y Previsión Social.',
  'Para empresas con menos de 51 trabajadores. Para empresas con más de 50 trabajadores firmaría el representante del patrón ante la Comisión mixta de capacitación,',
  'adiestramiento y productividad.', 'Solo para empresas con más de 50 trabajadores.', '* Dato no obligatorio.', 'DC-3', 'ANVERSO'];
const PROHIBIDOS = ['D4247032', 'Operacion de maquinas', 'Operación de máquinas', 'Registro patronal', 'I.M.S.S', 'Actividad o giro', 'Y40-52913', 'Tecnico Electromecanico', 'Anno', 'Seguridad industrial'];

// Lee los textos que jsPDF escribe, por página: así se comprueba el periodo y las casillas sin OCR.
async function espia(page) {
  await page.evaluate(() => {
    window.__pags = [];
    if (window.__espiaF) return; window.__espiaF = true;
    const Orig = window.jspdf.jsPDF;
    window.jspdf.jsPDF = new Proxy(Orig, { construct(T, args) {
      const doc = new T(...args), ot = doc.text, oi = doc.addImage, oa = doc.addPage;
      let pag = { textos: [], imgs: [] }; window.__pags.push(pag);
      doc.addPage = function () { pag = { textos: [], imgs: [] }; window.__pags.push(pag); return oa.apply(this, arguments); };
      doc.text = function (t, x, y) { pag.textos.push({ s: Array.isArray(t) ? t.join(' ') : String(t), x, y }); return ot.apply(this, arguments); };
      doc.addImage = function (d, f, x, y, w, h, alias) { pag.imgs.push({ alias: alias || '', x, y, w, h }); return oi.apply(this, arguments); };
      return doc;
    } });
  });
}
function leerPagina(p) {
  const t = p.textos;
  const i = t.findIndex(z => z.s === 'De');
  const dig = t.slice(i + 1).filter(z => /^\d$/.test(z.s)).slice(0, 16).map(z => z.s).join('');
  const periodo = dig.slice(0, 4) + '-' + dig.slice(4, 6) + '-' + dig.slice(6, 8) + ' a ' + dig.slice(8, 12) + '-' + dig.slice(12, 14) + '-' + dig.slice(14, 16);
  // CURP: 18 textos de un carácter entre «Clave Única…» y «Ocupación…»
  const ic = t.findIndex(z => z.s === 'Clave Única de Registro de Población'), io = t.findIndex(z => z.s.startsWith('Ocupación específica'));
  const curpCel = t.slice(ic + 1, io).filter(z => z.s.length === 1);
  const ir = t.findIndex(z => z.s.startsWith('Registro Federal')), ip = t.findIndex(z => z.s.startsWith('DATOS DEL PROGRAMA'));
  const rfcCel = t.slice(ir + 1, ip).filter(z => z.s.length === 1);
  const despues = (lbl) => { const k = t.findIndex(z => z.s.startsWith(lbl)); return k >= 0 ? t.slice(k + 1).find(z => !/^\d\/$/.test(z.s)) : null; };
  return { periodo, curp: curpCel.map(z => z.s).join(''), curpN: curpCel.length, rfc: rfcCel.map(z => z.s).join(''), rfcX: rfcCel.map(z => +z.x.toFixed(2)),
    nombre: (despues('Nombre (Anotar') || {}).s, curso: (despues('Nombre del curso') || {}).s, horas: (despues('Duración en horas') || {}).s,
    area: (despues('Área temática') || {}).s, agente: (despues('Nombre del agente') || {}).s, firmas: p.imgs.filter(m => /^dc3_sig_/.test(m.alias)).map(m => m.alias), textos: t.map(z => z.s), imgs: p.imgs };
}
function revisarPagina(etq, pg, esperado) {
  const faltan = FIJOS.filter(f => !pg.textos.includes(f));
  check(etq + ': textos oficiales con acentos (' + FIJOS.length + ')', !faltan.length, faltan.join(' | '));
  const malos = PROHIBIDOS.filter(f => pg.textos.some(s => s.includes(f)));
  check(etq + ': sin D4247032 / Operacion de maquinas / Registro patronal / giro', !malos.length, malos.join(','));
  check(etq + ': nombre', pg.nombre === esperado.name, pg.nombre);
  check(etq + ': CURP en 18 casillas', pg.curpN === 18 && pg.curp === esperado.curp, pg.curpN + ' casillas');
  check(etq + ': RFC 13 casillas, primera vacía', pg.rfc === 'SFT170905L43' && Math.abs(pg.rfcX[0] - (9.5 + 6.9 * 1.5)) < 0.01, pg.rfc + ' x0=' + pg.rfcX[0]);
  const c = CURSOS[esperado.curso];
  check(etq + ': curso, horas y área iguales al catálogo', pg.curso === c[0] && pg.horas === String(c[1]) && pg.area === c[2], [pg.curso, pg.horas, pg.area].join(' · '));
  check(etq + ': periodo De/a en casillas', pg.periodo === esperado.ini + ' a ' + esperado.fin, pg.periodo);
  check(etq + ': agente capacitador', pg.agente === 'SERVICIOS FTS SA DE CV (agente capacitador interno). Instructor: ' + esperado.instr, pg.agente);
  const fz = esperado.instr === 'DE LA CRUZ CALDERON JESUS ESTEBAN' ? ['dc3_sig_e', 'dc3_sig_t', 'dc3_sig_f'] : ['dc3_sig_t', 'dc3_sig_f'];
  check(etq + ': firmas impresas (' + fz.length + ')', JSON.stringify(pg.firmas) === JSON.stringify(fz), pg.firmas.join(','));
  check(etq + ': solo un logo (FTS) en el encabezado', pg.imgs.filter(m => !/^dc3_sig_/.test(m.alias)).length === 1 && pg.imgs[0].alias === 'dc3_logo');
}
function aPNG(pdf, pref) { execFileSync('pdftoppm', ['-r', '110', '-png', pdf, pref]); }
function textoPDF(pdf) { return execFileSync('pdftotext', ['-layout', pdf, '-']).toString(); }
function revisarArchivo(etq, pdf, paginas) {
  const tx = textoPDF(pdf);
  const n = (tx.match(/\f/g) || []).length;
  check(etq + ': el PDF tiene ' + paginas + ' página(s)', n === paginas, n + ' páginas');
  const malos = PROHIBIDOS.filter(f => tx.includes(f));
  check(etq + ': pdftotext sin datos retirados', !malos.length, malos.join(','));
  check(etq + ': pdftotext lee los acentos', /Clave Única de Registro de Población/.test(tx) && /Duración en horas/.test(tx) && /Secretaría del Trabajo y Previsión Social/.test(tx));
}

async function tab(page, texto) { await page.locator('#s-inst .tab-row .tab', { hasText: texto }).click(); await page.waitForTimeout(150); }
async function alta(p, ap, am, nom, curp) { await tab(p, 'Trabajadores'); await p.fill('#new-ap', ap); await p.fill('#new-am', am); await p.fill('#new-nom', nom); await p.fill('#new-curp', curp); await p.click('#tp-workers button.btn-p'); }

(async () => {
  const b = await chromium.launch();
  const errores = [];
  const ctx = await b.newContext({ viewport: { width: 380, height: 820 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => { errores.push('alerta: ' + d.message().slice(0, 200)); d.dismiss(); });
  await p.addInitScript(() => localStorage.setItem('fts_session', JSON.stringify({ userId: 'e2e', username: 'prueba.e2e', nombre: 'PRUEBA E2E', role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now() })));
  await p.goto(BASE + '/seguridad/index.html?e2e=' + Date.now()); await p.waitForTimeout(2500);
  await p.evaluate(() => goInstPin()); await p.waitForTimeout(400);
  check('Versión ' + ESPERADO_VER + ' en el panel', (await p.textContent('#dc3-ver-inst')).trim() === 'v' + ESPERADO_VER);
  const INSTR = await p.evaluate(() => INSTRUCTORES[inst.instructor].name);

  if (!MUESTRA) {
    await alta(p, 'MUESTRA', 'PRUEBA', 'ANA SOFIA', 'XEXX010101MNLXXX01');
    await alta(p, 'EJEMPLO', 'DEMO', 'BRUNO', 'XEXX020202HNLXXX02');
    check('Trabajadores: 2 dados de alta', (await p.locator('#worker-list .worker-row').count()) === 2);
    const W = await p.evaluate(() => inst.workers.map(w => ({ name: w.name, curp: w.curp })));

    // ── 1. Individual (Generar DC-3): LO-TO 8 h ──
    await tab(p, 'Cursos'); await p.click('button:has-text("✗ Ninguno")');
    await p.evaluate(() => { inst.selCourses.add(1); renderCourseSelector(); });
    await tab(p, 'Generar DC-3');
    await p.fill('#inst-fecha', '2026-11-20'); await p.dispatchEvent('#inst-fecha', 'change');
    await p.fill('#inst-fecha-fin', '2026-11-20'); await p.dispatchEvent('#inst-fecha-fin', 'change');
    await p.evaluate(() => { inst.selWorkers.clear(); inst.selWorkers.add(0); renderGenSummary(); });
    await espia(p);
    let [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]);
    let f = path.join(OUT, 'A-individual.pdf'); await dl.saveAs(f);
    let pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    revisarPagina('A individual', pags[0], { ...W[0], curso: 1, ini: '2026-11-20', fin: '2026-11-20', instr: INSTR });
    revisarArchivo('A individual', f, 1); aPNG(f, path.join(OUT, 'A-individual'));

    // ── 1b. Otro instructor (sin firma digital registrada): su columna queda para firma autógrafa ──
    await p.evaluate(() => { inst.instructor = 1; renderGenSummary(); });
    const INSTR2 = await p.evaluate(() => INSTRUCTORES[1].name);
    await espia(p);
    [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]);
    f = path.join(OUT, 'A2-otro-instructor.pdf'); await dl.saveAs(f);
    pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    revisarPagina('A2 otro instructor', pags[0], { ...W[0], curso: 1, ini: '2026-11-20', fin: '2026-11-20', instr: INSTR2 });
    aPNG(f, path.join(OUT, 'A2-otro-instructor'));
    await p.evaluate(() => { inst.instructor = 0; renderGenSummary(); });

    // ── 2. Curso de 16 h en 2 días (Generar DC-3) ──
    await p.evaluate(() => { inst.selCourses.clear(); inst.selCourses.add(9); renderGenSummary(); });
    await p.fill('#inst-fecha-fin', '2026-11-21'); await p.dispatchEvent('#inst-fecha-fin', 'change');
    await espia(p);
    [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]);
    f = path.join(OUT, 'B-16h-2dias.pdf'); await dl.saveAs(f);
    pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    revisarPagina('B 16 h', pags[0], { ...W[0], curso: 9, ini: '2026-11-20', fin: '2026-11-21', instr: INSTR });
    revisarArchivo('B 16 h', f, 1); aPNG(f, path.join(OUT, 'B-16h'));

    // ── 3. Lote: 2 trabajadores × 4 cursos (días distintos, tope 12 h) ──
    await tab(p, 'Impresión por Lote');
    const plan = [[4, '2026-11-02'], [7, '2026-11-03'], [8, '2026-11-04'], [11, '2026-11-05']];
    for (const wi of [0, 1]) for (const [c] of plan) await p.locator(`#lote-mx td.lm-cel input[data-w="${wi}"][data-c="${c}"]`).check();
    await p.evaluate((plan) => { lote.asg.forEach(a => { const d = plan.find(x => String(x[0]) === String(a.curso))[1]; a.ini = d; a.fin = d; }); renderLote(); }, plan);
    check('Lote: 8 DC-3 sin errores, botón habilitado', !(await p.locator('#lote-btn').isDisabled()) && (await p.evaluate(() => lote.asg.length)) === 8);
    await espia(p);
    [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#lote-btn')]);
    const zp = path.join(OUT, 'C-lote.zip'); await dl.saveAs(zp);
    const dz = path.join(OUT, 'C-lote'); fs.mkdirSync(dz, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zp, '-d', dz]);
    const pdfs = fs.readdirSync(dz).filter(n => n.endsWith('.pdf')).sort();
    check('Lote: ZIP con 2 PDF (uno por trabajador)', pdfs.length === 2, pdfs.join(', '));
    pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    check('Lote: 8 páginas generadas', pags.length === 8, String(pags.length));
    pags.forEach((pg, i) => { const wi = Math.floor(i / 4), [c, d] = plan[i % 4]; revisarPagina('C lote p' + (i + 1), pg, { ...W[wi], curso: c, ini: d, fin: d, instr: INSTR }); });
    pdfs.forEach((n, i) => { revisarArchivo('C ' + n, path.join(dz, n), 4); aPNG(path.join(dz, n), path.join(OUT, 'C-lote-' + (i + 1))); });

    // ── 4. Autoservicio del empleado: botón «Descargar mis DC-3» con 2 cursos terminados ──
    await p.evaluate(() => {
      emp.nombre = 'AUTOSERVICIO PRUEBA CARLA'; emp.curp = 'XEXX030303MNLXXX03';
      emp.completed = new Map([[2, { score: 100, fechaISO: '2026-11-10' }], [10, { score: 90, fechaISO: '2026-11-11' }]]);
      go('s-emp-done');
    });
    await espia(p);
    [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#s-emp-done button.btn-g')]);
    f = path.join(OUT, 'D-autoservicio.pdf'); await dl.saveAs(f);
    pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    const E = { name: 'AUTOSERVICIO PRUEBA CARLA', curp: 'XEXX030303MNLXXX03', instr: 'DE LA CRUZ CALDERON JESUS ESTEBAN' };
    revisarPagina('D autoservicio p1', pags[0], { ...E, curso: 2, ini: '2026-11-10', fin: '2026-11-10' });
    revisarPagina('D autoservicio p2', pags[1], { ...E, curso: 10, ini: '2026-11-11', fin: '2026-11-12' });
    revisarArchivo('D autoservicio', f, 2); aPNG(f, path.join(OUT, 'D-autoservicio'));
  } else {
    // ── Lote de muestra completo (datos fuera del repo) ──
    const M = JSON.parse(fs.readFileSync(MUESTRA, 'utf8'));
    for (const w of M) { const [ap, am, ...n] = w.name.split(' '); await alta(p, ap, am, n.join(' '), w.curp); }
    await tab(p, 'Impresión por Lote');
    await p.evaluate((M) => { lote.asg = []; M.forEach((w, wi) => w.cursos.forEach(c => lote.asg.push({ id: lote.seq++, empleado: wi, curso: String(c.id), ini: c.ini, fin: c.fin }))); renderLote(); }, M);
    const total = M.reduce((s, w) => s + w.cursos.length, 0);
    check('Muestra: ' + total + ' asignaciones sin error', !(await p.locator('#lote-btn').isDisabled()));
    await espia(p);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#lote-btn')]);
    const zp = path.join(OUT, 'M-lote.zip'); await dl.saveAs(zp);
    const dz = path.join(OUT, 'M-lote'); fs.mkdirSync(dz, { recursive: true }); execFileSync('unzip', ['-o', '-q', zp, '-d', dz]);
    const pags = (await p.evaluate(() => window.__pags)).map(leerPagina);
    check('Muestra: ' + total + ' páginas', pags.length === total, String(pags.length));
    let k = 0; M.forEach(w => w.cursos.forEach(c => { revisarPagina('M p' + (k + 1), pags[k], { name: w.name, curp: w.curp, curso: c.id, ini: c.ini, fin: c.fin, instr: INSTR }); k++; }));
    const pdfs = fs.readdirSync(dz).filter(n => n.endsWith('.pdf'));
    check('Muestra: ' + M.length + ' PDF en el ZIP', pdfs.length === M.length, String(pdfs.length));
    for (const w of M) { const n = pdfs.find(x => x === 'DC3_' + w.name.replace(/\s+/g, '_') + '.pdf'); revisarArchivo('M ' + w.name.split(' ')[0], path.join(dz, n), w.cursos.length); aPNG(path.join(dz, n), path.join(dz, n.replace('.pdf', ''))); }
  }

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await b.close();
  const fl = resultados.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(resultados, null, 1));
  console.log(fl ? `\n${fl} FALLA(S) de ${resultados.length}` : `\nTodas pasan (${resultados.length})`);
  process.exit(fl ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
