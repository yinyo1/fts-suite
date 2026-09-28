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
const sql = fs.readFileSync(path.join(R, 'db', 'migrations', 'retardos', 'retardos_0002_logica.sql'), 'utf8');
const bloque = sql.slice(sql.indexOf('INSERT INTO retardos.plantilla (clave, asunto, cuerpo_html) VALUES'));
const re = /\('([a-z_]+)', '((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g;
const P = {}; let m;
while ((m = re.exec(bloque))) P[m[1]] = { asunto: m[2].replace(/''/g, "'"), cuerpo: m[3].replace(/''/g, "'") };

// 2) Títulos y cuerpos de las hojas, leídos del generador de PDF.
const src = fs.readFileSync(path.join(R, 'retardos', 'lib', 'pdf.js'), 'utf8');
const cap = (nombre) => { const i = src.indexOf('var ' + nombre + ' = {'); const j = src.indexOf('};', i); return vm.runInNewContext('(' + src.slice(i + ('var ' + nombre + ' = ').length, j + 1) + ')'); };
const TITULOS = cap('TITULOS'), CUERPO = cap('CUERPO');

// 3) Datos de muestra (inventados).
const retardos = [
  { fecha: '01/09/2026', llegada: '07:31', esperada: '07:00', minutos: 31 },
  { fecha: '03/09/2026', llegada: '07:24', esperada: '07:00', minutos: 24 },
  { fecha: '08/09/2026', llegada: '07:47', esperada: '07:00', minutos: 47 },
  { fecha: '10/09/2026', llegada: '07:26', esperada: '07:00', minutos: 26 },
  { fecha: '14/09/2026', llegada: '08:05', esperada: '07:00', minutos: 65 },
  { fecha: '17/09/2026', llegada: '07:22', esperada: '07:00', minutos: 22 },
  { fecha: '22/09/2026', llegada: '07:38', esperada: '07:00', minutos: 38 }
];
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
  return html.replace(/<br>/g, '  \n').replace(/<\/p>/g, '\n\n').replace(/<p>/g, '').replace(/<b>/g, '**').replace(/<\/b>/g, '**')
             .replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function correo(clave, accion) {
  const n = NIV[accion][0];
  const v = { folio: 'RET-2026-0041', nombre: 'Laura Demo', periodo: '2026-09', retardos_n: n, vence: '01/10/2026', nombre_nivel: NIV[accion][1], detalle: '@@TABLA@@' };
  const p = P[clave];
  return '**Asunto:** ' + render(p.asunto, v) + '\n\n' + aTexto(render(p.cuerpo, v)).replace('@@TABLA@@', tablaTexto(n)).replace(/\n{3,}/g, '\n\n');
}

// 4) PDF de muestra.
const muestras = [];
for (const acc of Object.keys(NIV)) {
  const h = PDF.hoja(datos(acc));
  const archivo = 'muestra-' + acc.replace('_', '-') + '.pdf';
  fs.writeFileSync(path.join(__dirname, 'muestras', archivo), Buffer.from(h.binario, 'latin1'));
  muestras.push([acc, archivo, h.bytes]);
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
  HOJA_AVISO: '**' + TITULOS.aviso + '**\n\n' + CUERPO.aviso,
  HOJA_CARTA: '**' + TITULOS.carta_compromiso + '**\n\n' + CUERPO.carta_compromiso,
  HOJA_ACTA: '**' + TITULOS.acta + '**\n\n' + CUERPO.acta,
  HOJA_SUSPENSION: '**' + TITULOS.suspension + '**\n\n' + CUERPO.suspension,
  MUESTRAS: muestras.map(([a, f, b]) => `- [${f}](muestras/${f}): ${NIV[a][1].toLowerCase()} (${b.toLocaleString('en-US')} bytes)`).join('\n'),
  FECHA: hoy
};
for (const k of Object.keys(bloques)) md = md.split('@@' + k + '@@').join(bloques[k]);
if (/@@[A-Z_]+@@/.test(md)) throw new Error('Marcador sin llenar: ' + md.match(/@@[A-Z_]+@@/)[0]);
if (md.includes('—')) throw new Error('Guion largo en PARA_LEGAL.md');
fs.writeFileSync(path.join(__dirname, 'PARA_LEGAL.md'), md);
console.log('PARA_LEGAL.md', md.length, 'caracteres ·', muestras.length, 'PDF de muestra');
