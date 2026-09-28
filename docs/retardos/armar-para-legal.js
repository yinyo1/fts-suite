#!/usr/bin/env node
/* Arma docs/retardos/PARA_LEGAL.md y los PDF de muestra de docs/retardos/muestras/ (#334).
 * Los textos NO se copian a mano: salen de la migración que los sembró en la base
 * (retardos_0002, tabla retardos.plantilla) y de retardos/lib/pdf.js, que genera las hojas.
 * Así el documento dice exactamente lo que sale hoy. Datos de la muestra: inventados.
 * Uso: node docs/retardos/armar-para-legal.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.resolve(__dirname, '..', '..');
const PDF = require(path.join(R, 'retardos', 'lib', 'pdf.js'));

// 1) Plantillas de correo tal como se sembraron.
//    retardos_0006 agrega las del flujo "RH recolecta" (complemento de la sesión 2).
const P = {};
// retardos_0007 (reglas R3) reemplaza el aviso y agrega los de jornada semanal: va al final para ganar.
for (const mig of ['retardos_0002_logica.sql', 'retardos_0006_rh_recolecta_hojas_y_sanciones.sql', 'retardos_0007_reglas_jornada_semanal.sql']) {
  const sql = fs.readFileSync(path.join(R, 'db', 'migrations', 'retardos', mig), 'utf8');
  const i = sql.indexOf('INSERT INTO retardos.plantilla (clave, asunto, cuerpo_html) VALUES');
  if (i < 0) throw new Error('Sin plantillas en ' + mig);
  const bloque = sql.slice(i, sql.indexOf(';\n', i));
  const re = /\('([a-z0-9_]+)', '((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g; let m;
  while ((m = re.exec(bloque))) P[m[1]] = { asunto: m[2].replace(/''/g, "'"), cuerpo: m[3].replace(/''/g, "'") };
}
for (const k of ['rh_recolectar', 'aviso_trabajador', 'recordatorio_rh_recolectar', 'escalamiento_rh', 'jornada_aviso', 'jornada_aviso_3', 'jornada_rh_recolectar', 'comunicado_arranque']) if (!P[k]) throw new Error('Falta plantilla ' + k);
if (PDF.PENDIENTE_RH.indexOf('aviso_jornada_3') < 0) throw new Error('aviso_jornada_3 ya no está marcada como pendiente de RH: revisar PARA_LEGAL.');

// 2) Títulos y cuerpos de las hojas, leídos del generador de PDF.
const src = fs.readFileSync(path.join(R, 'retardos', 'lib', 'pdf.js'), 'utf8');
const cap = (nombre) => { const i = src.indexOf('var ' + nombre + ' = {'); const j = src.indexOf('};', i); return vm.runInNewContext('(' + src.slice(i + ('var ' + nombre + ' = ').length, j + 1) + ')'); };
const TITULOS = cap('TITULOS'), CUERPO = cap('CUERPO');
const CONST = (nombre) => { const r = new RegExp('var ' + nombre + " = '((?:[^'\\\\]|\\\\.)*)';"); const x = src.match(r); if (!x) throw new Error('Sin ' + nombre); return x[1]; };
const REINCIDENCIA = CONST('REINCIDENCIA'), PIE = CONST('PIE');
if (PDF.PENDIENTE_LEGAL.indexOf('REINCIDENCIA') < 0) throw new Error('REINCIDENCIA ya no está marcada como pendiente de Legal: revisar el texto de PARA_LEGAL.');

// 3) Datos de muestra (inventados).
// Hora de llegada al segundo (reglas R3: la tolerancia se compara en segundos, hora del centro).
const retardos = [
  { fecha: '01/09/2026', llegada: '07:31:12', esperada: '07:00', minutos: 31 },
  { fecha: '03/09/2026', llegada: '07:15:01', esperada: '07:00', minutos: 15 },
  { fecha: '08/09/2026', llegada: '07:47:40', esperada: '07:00', minutos: 47 },
  { fecha: '10/09/2026', llegada: '07:26:05', esperada: '07:00', minutos: 26 },
  { fecha: '14/09/2026', llegada: '08:05:33', esperada: '07:00', minutos: 65 },
  { fecha: '17/09/2026', llegada: '07:22:19', esperada: '07:00', minutos: 22 },
  { fecha: '22/09/2026', llegada: '07:38:50', esperada: '07:00', minutos: 38 }
];
// Semana FTS de ejemplo (viernes a jueves), horas en horas:minutos.
const JDIAS = [['Vie', '18/09', '10:06', '0:30', '9:36'], ['Sáb', '19/09', '0:00', '0:00', '0:00'], ['Dom', '20/09', '0:00', '0:00', '0:00'],
  ['Lun', '21/09', '10:00', '0:30', '9:30'], ['Mar', '22/09', '0:00', '0:00', '0:00', 'no checó'], ['Mié', '23/09', '10:06', '0:30', '9:36'], ['Jue', '24/09', '9:54', '0:30', '9:24']];
const JOR = { semana: 'S39/2026', desde: '18/09/2026', hasta: '24/09/2026', horas_efectivas: '38:06', umbral: '48:00', faltante: '9:54',
  dias: JDIAS.map((d) => ({ dia: d[0], fecha: d[1], brutas: d[2], comida: d[3], efectivas: d[4], nota: d[5] || '' })) };
const NIV = { aviso: [1, 'Aviso'], carta_compromiso: [3, 'Carta compromiso'], acta: [5, 'Acta administrativa'], suspension: [7, 'Suspensión'] };
function datos(accion) {
  const n = NIV[accion][0];
  return { accion, folio: 'RET-2026-0041', fecha_emision: '28/09/2026', nombre: 'Laura Demo', puesto: 'Técnica de campo',
           departamento: 'Operaciones', periodo: '2026-09', retardos_n: n, retardos: retardos.slice(0, n),
           motivo_apertura: accion === 'suspension' ? 'reincidencia' : 'umbral', requiere_testigos: accion === 'acta' || accion === 'suspension',
           accion_desde: accion === 'suspension' ? '12/10/2026' : null, accion_hasta: accion === 'suspension' ? '12/10/2026' : null, dias_suspension: 1 };
}
function tablaTexto(n) { return '\n\n| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |\n|---|---|---|---|\n' + retardos.slice(0, n).map((r) => `| ${r.fecha} | ${r.llegada} | ${r.esperada} | ${r.minutos} |`).join('\n') + '\n\n'; }
function render(t, v) { return t.replace(/\[\[([a-z_]+)\]\]/g, (_, k) => (v[k] == null ? '' : String(v[k]))); }
function aTexto(html) {
  return html.replace(/<ol>/g, '\n').replace(/<li>/g, '\n1. ').replace(/<\/ol>/g, '\n\n').replace(/<br>/g, '  \n').replace(/<\/p>/g, '\n\n').replace(/<p>/g, '').replace(/<b>/g, '**').replace(/<\/b>/g, '**')
             .replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function tablaJornada() { return '\n\n| Día | Registradas | Comida | Efectivas | Nota |\n|---|---|---|---|---|\n' + JOR.dias.map((d) => `| ${d.dia} ${d.fecha} | ${d.brutas} | ${d.comida} | ${d.efectivas} | ${d.nota} |`).join('\n') + '\n\n'; }
function correo(clave, accion, extra) {
  const n = NIV[accion] ? NIV[accion][0] : 0;
  const jor = String(clave).indexOf('jornada') === 0;
  const v = Object.assign({ folio: jor ? 'JOR-2026-0003' : 'RET-2026-0041', nombre: 'Laura Demo', periodo: '2026-09', retardos_n: n, vence: '01/10/2026', vence_rh: '01/10/2026',
              nombre_nivel: NIV[accion] ? NIV[accion][1] : '', detalle: '@@TABLA@@', puesto: 'Técnica de campo', departamento: 'Operaciones', correo_trabajador: 'laura.demo@ejemplo.com',
              tolerancia_min: 15, umbral_carta: 3, semana_id: JOR.semana, semana_desde: JOR.desde, semana_hasta: JOR.hasta, umbral_horas: JOR.umbral,
              horas_efectivas: JOR.horas_efectivas, faltante_horas: JOR.faltante, plazo_correccion: '01/10/2026', n: 2, fecha_arranque: '1 de octubre de 2026' }, extra || {});
  const p = P[clave];
  return '**Asunto:** ' + render(p.asunto, v) + '\n\n' + aTexto(render(p.cuerpo, v)).replace('@@TABLA@@', jor ? tablaJornada() : tablaTexto(n)).replace(/\n{3,}/g, '\n\n');
}

// 4) PDF de muestra.
const muestras = [];
for (const acc of Object.keys(NIV)) {
  const h = PDF.hoja(datos(acc));
  const archivo = 'muestra-' + acc.replace('_', '-') + '.pdf';
  fs.writeFileSync(path.join(__dirname, 'muestras', archivo), Buffer.from(h.binario, 'latin1'));
  muestras.push([NIV[acc][1].toLowerCase(), archivo, h.bytes]);
}
{
  const h = PDF.hoja({ accion: 'aviso_jornada_3', folio: 'JOR-2026-0003', fecha_emision: '25/09/2026', nombre: 'Laura Demo', puesto: 'Técnica de campo',
                       departamento: 'Operaciones', periodo: JOR.semana, jornada: Object.assign({ aviso_n: 3 }, JOR) });
  fs.writeFileSync(path.join(__dirname, 'muestras', 'muestra-aviso-jornada-3.pdf'), Buffer.from(h.binario, 'latin1'));
  muestras.push(['tercer aviso de jornada semanal', 'muestra-aviso-jornada-3.pdf', h.bytes]);
}

const hoy = '28 de septiembre de 2026';
let md = fs.readFileSync(path.join(__dirname, 'para-legal.plantilla.md'), 'utf8');
const bloques = {
  CORREO_AVISO: correo('notificacion_aviso', 'aviso'),
  CORREO_CARTA: correo('notificacion_carta_compromiso', 'carta_compromiso'),
  CORREO_ACTA: correo('notificacion_acta', 'acta'),
  CORREO_SUSPENSION: correo('notificacion_suspension', 'suspension'),
  CORREO_SUPERVISOR: correo('ruta_supervisor', 'carta_compromiso'),
  CORREO_PIDE_HOJA: correo('pide_hoja', 'carta_compromiso'),
  CORREO_RECORDATORIO: correo('recordatorio', 'carta_compromiso'),
  CORREO_RH_RECOLECTAR: correo('rh_recolectar', 'acta'),
  CORREO_AVISO_TRABAJADOR: correo('aviso_trabajador', 'acta'),
  CORREO_RECORDATORIO_RH: correo('recordatorio_rh_recolectar', 'acta'),
  CORREO_ESCALAMIENTO_RH: correo('escalamiento_rh', 'acta'),
  HOJA_REINCIDENCIA: REINCIDENCIA,
  HOJA_PIE: PIE,
  HOJA_AVISO: '**' + TITULOS.aviso + '**\n\n' + CUERPO.aviso,
  HOJA_CARTA: '**' + TITULOS.carta_compromiso + '**\n\n' + CUERPO.carta_compromiso,
  HOJA_ACTA: '**' + TITULOS.acta + '**\n\n' + CUERPO.acta,
  HOJA_SUSPENSION: '**' + TITULOS.suspension + '**\n\n' + CUERPO.suspension,
  MUESTRAS: muestras.map(([a, f, b]) => `- [${f}](muestras/${f}): ${a} (${b.toLocaleString('en-US')} bytes)`).join('\n'),
  CORREO_JOR_1: correo('jornada_aviso', null, { aviso_n: 1 }),
  CORREO_JOR_3: correo('jornada_aviso_3', null, { aviso_n: 3 }),
  CORREO_JOR_RH: correo('jornada_rh_recolectar', null, { aviso_n: 3 }),
  CORREO_COMUNICADO: correo('comunicado_arranque', null),
  HOJA_JOR3: '**' + TITULOS.aviso_jornada_3 + '**\n\n' + CUERPO.aviso_jornada_3,
  FECHA: hoy
};
for (const k of Object.keys(bloques)) md = md.split('@@' + k + '@@').join(bloques[k]);
if (/@@[A-Z_]+@@/.test(md)) throw new Error('Marcador sin llenar: ' + md.match(/@@[A-Z_]+@@/)[0]);
if (md.includes('—')) throw new Error('Guion largo en PARA_LEGAL.md');
fs.writeFileSync(path.join(__dirname, 'PARA_LEGAL.md'), md);
console.log('PARA_LEGAL.md', md.length, 'caracteres ·', muestras.length, 'PDF de muestra');
