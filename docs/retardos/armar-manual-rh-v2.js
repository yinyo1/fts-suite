// ═══ Manual de RH · Retardos v2 (#386) ═══
// Arma docs/retardos/MANUAL_RH.html: UN solo archivo autocontenido (imágenes en base64)
// para mandarse por correo. Las capturas salen del panel REAL en modo de ejemplo (nombres
// inventados, sin servidor). Los recuadros, flechas y números se calculan con el bounding
// box real de cada elemento, no a ojo: si un botón se mueve, se vuelve a correr y ya.
//   NODE_PATH=$(npm root -g) node docs/retardos/armar-manual-rh-v2.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');
const SALIDA = path.join(__dirname, 'MANUAL_RH.html');
const LIMITE = 2 * 1024 * 1024;
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Datos de ejemplo ajustados SÓLO para las capturas (el panel real no cambia):
// la suspensión ya no aplica, así que los dos casos de nivel 4 se vuelven actas.
const PARCHES_DEMO = [
  ["caso(P[0], 4, 'RETENIDO', 7, 0, null)",
   "caso(P[0], 3, 'RETENIDO', 5, 0, null, { pista: 'real', modo_al_abrir: 'piloto', periodo: '2026-10', conteo_desde: '08/10/2026' })"],
  ["caso(P[3], 4, 'SE_NEGO_A_FIRMAR', 8, -7, -2, { motivo_apertura: 'reincidencia' })",
   "caso(P[3], 3, 'SE_NEGO_A_FIRMAR', 5, -7, -2)"],
  ["caso(P[6], 2, 'IMPUGNADO', 3, -5, 1)", "caso(P[6], 3, 'ESPERANDO_FIRMA', 5, -1, 2)"]
];
function parchar(js) {
  for (const [a, b] of PARCHES_DEMO) {
    if (js.split(a).length !== 2) throw new Error('PARCHE_DEMO_NO_CALZA: ' + a);
    js = js.replace(a, b);
  }
  return js;
}
const srv = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(RAIZ, rel);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); return r.end(); }
    if (rel.endsWith('/modulos/rh/retardos/js/api.js')) b = Buffer.from(parchar(b.toString('utf8')));
    r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(b);
  });
});

// ── Los recorridos. Cada paso: cómo llegar, qué recortar, qué señalar y qué decir. ──
// marca: { sel, n (número), tipo: 'caja' | 'flecha' }. El texto usa los nombres EXACTOS de pantalla.
const ESCENARIOS = [
  { id: 'aviso', titulo: 'Llegó un aviso de retardo', resumen: 'No se hace nada. El aviso es informativo.',
    pasos: [
      { ir: 'lista', clip: 'table', marcas: [{ sel: 'tr.fila[data-folio="RET-2026-0050"]', n: 1 }],
        texto: 'Los avisos (nivel 1, <b>Aviso</b>) aparecen en la pestaña <b>Casos</b> con estado <b>Notificado</b>. El correo ya le llegó a la persona con copia a RH y a su jefe.' },
      { ir: 'caso:RET-2026-0050', clip: '.detalle', marcas: [{ sel: 'section.caja:has(h2:text-is("Qué sigue")) .acciones', n: 1 }],
        texto: '<b>No hay que hacer nada.</b> El aviso no lleva firma. El único botón es <b>Cancelar caso</b>, y sólo se usa si el retardo no existió (ver "Reclama permiso, campo o error de checada").' }
    ] },
  { id: 'carta', titulo: 'Le toca carta compromiso (3er retardo)', resumen: 'Imprimir, citar, recolectar firmas y subir la hoja.',
    pasos: [
      { ir: 'cubeta:recolectar', clip: '#app', marcas: [{ sel: '[data-cubeta="recolectar"]', n: 1 }, { sel: 'tr.fila[data-folio="RET-2026-0041"]', n: 2 }],
        texto: 'En la pestaña <b>Casos</b>, la cubeta <b>Firmas por recolectar</b> (1) junta lo que necesita firma, ordenado por vencimiento. Abre el caso (2).' },
      { ir: 'caso:RET-2026-0041', clip: 'section.caja:has(h2:text-is("Qué sigue"))', marcas: [{ sel: '[data-accion="imprimir"]', n: 1 }],
        texto: 'En <b>Qué sigue</b>, oprime <b>Imprimir hoja</b> (1). Cita a la persona y recolecta su firma, la de RH y la del jefe directo. Tienes 3 días hábiles.' },
      { ir: 'caso:RET-2026-0041', click: '[data-accion="subir"]', esperar: '[data-enviar="subir_hoja"]', clip: 'section.caja:has(h2:text-is("Qué sigue"))',
        marcas: [{ sel: '[data-accion="subir"]', n: 1 }, { sel: '#f-archivo', n: 2 }, { sel: '[data-enviar="subir_hoja"]', n: 3 }],
        texto: 'Con la hoja firmada: <b>Subir hoja recolectada</b> (1), elige el archivo (2, PDF o foto de hasta 8 MB) y oprime <b>Subir hoja</b> (3).' },
      { ir: 'hojas', clip: '#lectura-71', marcas: [{ sel: '[data-ver-hoja][data-lectura="71"]', n: 1 }, { sel: '#lectura-71 button:text-is("Confirmar firmada")', n: 2 }],
        texto: 'En unos minutos aparece en la pestaña <b>Hojas por confirmar</b>. Revísala con <b>Ver hoja</b> (1) y, si trae las firmas, oprime <b>Confirmar firmada</b> (2).' }
    ] },
  { id: 'negativa', titulo: 'La persona se negó a firmar', resumen: 'Se registra con dos testigos.',
    pasos: [
      { ir: 'caso:RET-2026-0041', click: '[data-accion="negativa"]', esperar: '#f-t1', clip: 'section.caja:has(h2:text-is("Qué sigue"))',
        marcas: [{ sel: '[data-accion="negativa"]', n: 1 }, { sel: '#f-t1', n: 2 }, { sel: '#f-t2', n: 3 }, { sel: '[data-enviar="registrar_negativa"]', n: 4 }],
        texto: 'En el caso: <b>Se negó a firmar (sin hoja)</b> (1), escribe los dos testigos (2 y 3) y oprime <b>Registrar negativa</b> (4). Después sube la constancia firmada por los testigos con <b>Subir constancia de negativa</b>.' }
    ] },
  { id: 'hojas', titulo: 'Llegó una hoja escaneada', resumen: 'Las seis decisiones de Hojas por confirmar.',
    pasos: [
      { ir: 'hojas', clip: 'section.caja:has(h2:text-is("Subir hojas"))', marcas: [{ sel: '#h-archivos', n: 1 }, { sel: '#h-subir', n: 2 }],
        texto: 'Para varias a la vez: pestaña <b>Hojas por confirmar</b>, recuadro <b>Subir hojas</b>. Elige los archivos (1, hasta 10) y oprime <b>Subir</b> (2). Varias hojas en un mismo PDF se separan solas por el código QR.' },
      { ir: 'hojas', clip: '#lectura-71', marcas: 'decisiones',
        texto: 'El lector sólo sugiere; decide RH. (1) <b>Confirmar firmada</b> · (2) <b>Confirmar negativa</b> · (3) <b>Registrar impugnación</b> · (4) <b>Corregir folio</b> · (5) <b>Pedir de nuevo</b> · (6) <b>Descartar</b>.' }
    ] },
  { id: 'reclamo', titulo: 'Reclama permiso, campo o error de checada', resumen: 'Se corrige la checada y se cancela el caso con motivo.',
    pasos: [
      { ir: 'caso:RET-2026-0041', clip: '.detalle section.caja:has(h2:has-text("retardos en el periodo"))', marcas: [{ sel: '.detalle section.caja:has(h2:has-text("retardos en el periodo")) table', n: 1 }],
        texto: 'Revisa con la persona los días de la tabla (1). <b>Primero se corrige la checada en Odoo</b> (asistencias), o se registra el permiso.' },
      { ir: 'caso:RET-2026-0041', click: '[data-accion="cancelar"]', esperar: '[data-enviar="cancelar"]', clip: 'section.caja:has(h2:text-is("Qué sigue"))',
        marcas: [{ sel: '[data-accion="cancelar"]', n: 1 }, { sel: '#f-motivo', n: 2 }, { sel: '[data-enviar="cancelar"]', n: 3 }],
        texto: 'Después: <b>Cancelar caso</b> (1), escribe el motivo (2, por ejemplo "Permiso autorizado, checada corregida en Odoo") y confirma con <b>Sí, cancelar el caso</b> (3). <b>Cancelar no tiene reversa</b> y el motivo queda en la bitácora.' },
      { ir: 'ajustes', clip: 'section.caja:has(h2:text-is("Días que no cuentan"))', marcas: [{ sel: 'section.caja:has(h2:text-is("Días que no cuentan")) .form', n: 1 }],
        texto: 'Si fue permiso, vacaciones o trabajo en campo, regístralo también en la pestaña <b>Configuración</b>, recuadro <b>Días que no cuentan</b> (1), para que ese día no vuelva a contar.' }
    ] },
  { id: 'acta', titulo: 'Le toca acta (5º retardo)', resumen: 'Retenida hasta el lunes 12. Después, con testigos.',
    pasos: [
      { ir: 'lista', clip: '.resumen', marcas: [{ sel: '[data-cubeta="retenidos"]', n: 1 }],
        texto: 'Hasta el <b>lunes 12 de octubre</b> el acta queda <b>retenida</b>: no se manda ni se imprime. Aparece en la cubeta <b>Suspensión alcanzada, no aplicada</b> (1). El nombre de la cubeta es viejo: hoy junta las actas retenidas.' },
      { ir: 'caso:RET-2026-0049', clip: 'section.caja:has(h2:text-is("Qué sigue"))', marcas: [{ sel: '[data-accion="cerrar"]', n: 1 }],
        texto: 'Si ya se atendió en persona, <b>Cerrar: ya se atendió en persona</b> (1). Si no, se deja: queda como antecedente.' },
      { ir: 'caso:RET-2026-0047', clip: 'section.caja:has(h2:text-is("Qué sigue"))', marcas: [{ sel: '[data-accion="imprimir"]', n: 1 }, { sel: '[data-accion="negativa"]', n: 2 }],
        texto: 'Desde el <b>lunes 12</b> el acta sigue el mismo camino que la carta: <b>Imprimir hoja</b> (1), citar, recolectar firmas. El acta <b>requiere dos testigos</b>, firme o no la persona (2 si se niega).' }
    ] },
  { id: 'jornada', titulo: 'Jornada semanal por revisar', resumen: 'Confirmar, corregir o marcar que no aplica.',
    pasos: [
      { ir: 'jornada', clip: 'section.caja:has(h2:text-is("Jornada por revisar"))', marcas: 'jornada',
        texto: 'Pestaña <b>Jornada semanal</b>, recuadro <b>Jornada por revisar</b>: semanas con datos incompletos. No sale ningún aviso hasta que RH decide. (1) <b>Confirmar horas</b> · (2) <b>Corregir horas</b> (escribe las horas efectivas correctas, por ejemplo 47.5) · (3) <b>No aplica</b>.' }
    ] },
  { id: 'correo', titulo: 'Empleado sin correo', resumen: 'Calidad de datos y RH · Empleados. Los compartidos no sirven.',
    pasos: [
      { ir: 'calidad', clip: '#calidad table tr:has-text("Noemí Demo")', marcas: [{ sel: '#calidad tr:has-text("Noemí Demo") .chips', n: 1 }, { sel: '#calidad tr:has-text("Noemí Demo") .correo', n: 2 }],
        texto: 'Pestaña <b>Calidad de datos</b>: cada persona trae sus banderas (1), como <b>Sin correo</b> o <b>Correo compartido</b>, y qué correo se usa (2). <b>Un correo compartido (por ejemplo, el de ventas) no sirve</b>: el aviso tiene que llegarle a la persona.' },
      { ir: 'calidad', clip: '#calidad table tr:has-text("Noemí Demo")', marcas: [{ sel: '#calidad tr:has-text("Noemí Demo") [data-revisar]', n: 1 }],
        texto: 'El correo se corrige en el Suite, módulo <b>RH · Empleados</b> (correo de FTS primero; si no tiene, el personal). Se sincroniza solo en la siguiente revisión. Después marca <b>Marcar revisado</b> (1).' }
    ] },
  { id: 'ppa', titulo: 'Preguntan por el PPA', resumen: 'Lo ve Nómina, no Retardos.', pasos: [
      { texto: 'El <b>premio de puntualidad (PPA)</b> no lo calcula Retardos: lo ve <b>Nómina · Incidencias</b>, con su propia regla de <b>5 minutos</b>. Retardos usa <b>15 minutos</b>. Por eso alguien puede perder el PPA (llegó 7:10) sin tener retardo. El aviso de retardo ya lo explica.' }
    ] },
  { id: 'raro', titulo: 'Algo se ve raro', resumen: 'Captura con el folio y a Esteban.', pasos: [
      { ir: 'caso:RET-2026-0041', clip: '.cab', marcas: [{ sel: '.cab .folio', n: 1 }],
        texto: 'Toma una captura de pantalla donde se vea el <b>folio</b> (1, por ejemplo RET-2026-0041) y mándasela a Esteban con una línea de qué esperabas ver. No canceles ni cierres el caso mientras tanto.' }
    ] },
  { id: 'sombra', titulo: 'Veo casos sin la marca "real"', resumen: 'Son de sombra: ensayo, no cuentan y no generan correos.', pasos: [
      { ir: 'lista', clip: 'table', marcas: [{ sel: 'tr.fila[data-folio="RET-2026-0050"] .chips2', n: 1 }, { sel: 'tr.fila[data-folio="RET-2026-0042"]', n: 2 }],
        texto: 'Los casos reales llevan la marca <b>real · piloto</b> o <b>real</b> (1). <b>Un caso sin marca es de sombra</b> (2): es el ensayo del sistema. No cuenta para nada, no es antecedente y sus correos sólo llegan a RH y Dirección con la etiqueta [SOMBRA]. No hay que hacer nada; el lunes 12 Dirección los cancela todos.' },
      { ir: 'caso:RET-2026-0042', clip: 'section.caja:has(h3:text-is("Datos"))', marcas: [{ sel: 'dt:text-is("Pista") + dd', n: 1 }],
        texto: 'Dentro del caso, en <b>Datos</b>, el renglón <b>Pista</b> dice <b>sombra</b> (1).' }
    ] }
];

async function preparar(pg, url, ir) {
  await pg.goto(url); await pg.click('#demo'); await pg.waitForSelector('tr.fila');
  await pg.evaluate(() => { const a = document.querySelector('#aviso-demo'); if (a) a.remove(); });
  const sinSuspension = () => pg.evaluate(() => document.querySelectorAll('tr.fila').forEach(f => { if (/Suspensi/.test(f.querySelector('td:nth-child(3)') ? f.querySelector('td:nth-child(3)').textContent : '')) f.remove(); }));
  if (!ir || ir === 'lista') { await sinSuspension(); return; }
  if (ir.indexOf('cubeta:') === 0) { await pg.click('[data-cubeta="' + ir.slice(7) + '"]'); await pg.waitForSelector('tr.fila'); await sinSuspension(); return; }
  if (ir.indexOf('caso:') === 0) { await pg.click('tr.fila[data-folio="' + ir.slice(5) + '"]'); await pg.waitForSelector('.detalle'); return; }
  if (ir === 'hojas') { await pg.click('[data-vista="hojas"]'); await pg.waitForSelector('#lectura-71'); return; }
  if (ir === 'jornada') { await pg.click('[data-vista="jornada"]'); await pg.waitForSelector('[data-jrev]'); return; }
  if (ir === 'calidad') { await pg.click('[data-vista="calidad"]'); await pg.waitForSelector('#calidad table'); return; }
  if (ir === 'ajustes') { await pg.click('[data-vista="ajustes"]'); await pg.waitForSelector('#x-agregar'); return; }
  throw new Error('IR_DESCONOCIDO ' + ir);
}

async function cajas(pg, sel) {
  return pg.$$eval(sel, els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }));
}

(async () => {
  await new Promise(ok => srv.listen(0, ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/modulos/rh/retardos/index.html';
  const nav = await chromium.launch({ executablePath: EXE });
  const pg = await nav.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1 });
  const errores = [];
  pg.on('pageerror', e => errores.push(e.message));
  const salida = [];
  for (const esc of ESCENARIOS) {
    const pasos = [];
    for (const p of esc.pasos) {
      if (!p.ir) { pasos.push({ texto: p.texto }); continue; }
      await preparar(pg, url, p.ir);
      if (p.click) { await pg.click(p.click); if (p.esperar) await pg.waitForSelector(p.esperar); }
      const [clip] = await cajas(pg, p.clip);
      if (!clip) { errores.push(esc.id + ': no encontré el recorte ' + p.clip); continue; }
      const pad = 10;
      const c = { x: Math.max(0, Math.floor(clip.x - pad)), y: Math.max(0, Math.floor(clip.y - pad)) };
      c.w = Math.ceil(Math.min(1100 - c.x, clip.w + 2 * pad)); c.h = Math.ceil(clip.h + 2 * pad);
      let marcas = [];
      if (p.marcas === 'decisiones') {
        const sels = ['Confirmar firmada', 'Confirmar negativa', 'Registrar impugnación', 'Corregir folio', 'Pedir de nuevo', 'Descartar'];
        for (let i = 0; i < sels.length; i++) marcas.push({ sel: '#lectura-71 button:text-is("' + sels[i] + '")', n: i + 1 });
      } else if (p.marcas === 'jornada') {
        const sels = ['Confirmar horas', 'Corregir horas', 'No aplica'];
        for (let i = 0; i < sels.length; i++) marcas.push({ sel: 'section.caja:has(h2:text-is("Jornada por revisar")) button:text-is("' + sels[i] + '") >> nth=0', n: i + 1 });
      } else marcas = p.marcas || [];
      const cajasOk = [];
      for (const m of marcas) {
        let b;
        if (m.sel.indexOf('>> nth=') >= 0) { const el = pg.locator(m.sel); b = await el.boundingBox(); if (b) b = { x: b.x + await pg.evaluate(() => scrollX), y: b.y + await pg.evaluate(() => scrollY), w: b.width, h: b.height }; }
        else { const loc = pg.locator(m.sel).first(); if (await loc.count()) { const bb = await loc.boundingBox(); const sx = await pg.evaluate(() => scrollX), sy = await pg.evaluate(() => scrollY); b = bb && { x: bb.x + sx, y: bb.y + sy, w: bb.width, h: bb.height }; } }
        if (!b || !b.w) { errores.push(esc.id + ': no encontré la marca ' + m.sel); continue; }
        cajasOk.push({ n: m.n, x: Math.round(b.x - c.x), y: Math.round(b.y - c.y), w: Math.round(b.w), h: Math.round(b.h) });
      }
      const png = await pg.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h }, fullPage: true, type: 'jpeg', quality: 80 });
      pasos.push({ texto: p.texto, img: 'data:image/jpeg;base64,' + png.toString('base64'), w: c.w, h: c.h, marcas: cajasOk });
    }
    salida.push({ id: esc.id, titulo: esc.titulo, resumen: esc.resumen, pasos });
  }
  await nav.close(); srv.close();
  if (errores.length) { console.error(errores.join('\n')); process.exit(1); }
  const plantilla = fs.readFileSync(path.join(__dirname, 'manual-rh-v2.plantilla.html'), 'utf8');
  const marca = '/*__ESCENARIOS__*/[]';
  if (plantilla.split(marca).length !== 2) throw new Error('PLANTILLA_SIN_MARCA');
  const html = plantilla.replace(marca, () => JSON.stringify(salida).replace(/</g, '\\u003c'));
  fs.writeFileSync(SALIDA, html);
  const bytes = fs.statSync(SALIDA).size;
  console.log('MANUAL_RH.html', bytes, 'bytes', (bytes / 1024 / 1024).toFixed(2), 'MB', 'escenarios', salida.length, 'pasos', salida.reduce((a, e) => a + e.pasos.length, 0));
  if (bytes > LIMITE) { console.error('EXCEDE_2MB'); process.exit(1); }
})();
