// Lectura de los PDF del DC-3 (#507): los mismos lectores que usa dc3-formato.e2e.js,
// compartidos con la prueba del prototipo para leer igual prototipo y producción.
'use strict';
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
module.exports = { CURSOS, FIJOS, PROHIBIDOS, espia, leerPagina };
