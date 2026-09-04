// ═══ Gate · el cruce entre lo que mandó RH y lo que capturó el despacho ═════
//
// Este gate existe porque el cruce es lo único del sistema que puede decir "la
// nómina está mal" cuando la nómina cuadra consigo misma. Un falso verde aquí es
// exactamente el fallo que el módulo existe para evitar: alguien cobra de más o de
// menos y todos los demás controles siguen en verde.
//
// Los casos NO se inventan: cada uno es una forma real de equivocarse al capturar.
//
//   node tests/gate-cruce-rh.js

'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const Cruce = require(path.join(RAIZ, 'operaciones', 'carga-mo', 'js', 'cruce-rh.js'));
const Des = require(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'js', 'despacho.js'));

let ok = 0, fail = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fail++; console.log('  ✗ ' + nombre + (detalle ? ' → ' + detalle : '')); }
}
function seccion(t) { console.log('\n── ' + t + ' ──'); }

// ── Los dos lados, construidos con el MISMO generador que usa RH ────────────
// El archivo de prueba NO se escribe a mano: sale de Des.texto(), o sea del código
// que de verdad genera lo que Magaly manda. Si el formato cambia, este gate lo ve.
const SEMANA = { id: 'S36/2026', desde: '2026-08-28', hasta: '2026-09-03', dias: 5 };
function persona(o) {
  return Object.assign({ id: 1, nombre: 'X', puesto: 'p', departamento: 'd',
    dias_mexico: 5, declaraciones: [], estados: [], ppa: { aplica: false } }, o);
}
function archivoRH(personas) {
  return Des.texto({ semana: SEMANA, personas: personas, disputas: [] },
                   { version: 1, actor: 'magaly.perez', fecha: '2026-09-04 15:00' });
}
// Un empleado del lado CONTPAQi, con la forma que produce el resolver.
function emp(cod, nombre, conceptos, neto) {
  return { cod: cod, nombre: nombre, conceptos: conceptos || {}, neto: neto || 5000,
           bruto: 5000, deducciones: 0, porColumna: {} };
}
const PPA = Cruce.CLAVE_PPA;
function codigos(h) { return h.map(x => x.codigo).sort(); }
function tiene(h, cod) { return h.some(x => x.codigo === cod); }

// ═══════════════════ 1 · LEER EL ARCHIVO DE RH ═══════════════════
seccion('Leer el archivo de RH');
{
  const p1 = persona({ id: 62, nombre: 'Gibrán Solís', codigo: '013',
    declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }], dias_mexico: 3 });
  const d = Cruce.parseDespacho(archivoRH([p1]));
  check('no hay error de lectura', !d.error, d.error || '');
  check('saca la semana del encabezado', d.semana === 'S36/2026', String(d.semana));
  check('saca la version', d.version === 1, String(d.version));
  check('lee una sola persona (el TOTAL no es persona)', d.filas.length === 1, String(d.filas.length));
  check('lee el codigo', d.filas[0].codigo3 === '013', d.filas[0].codigo3);
  check('lee el id de Odoo', d.filas[0].no_empleado === '62', d.filas[0].no_empleado);
  check('lee la instruccion completa', /PAGAR 2 días · Vacaciones/.test(d.filas[0].instruccion),
    d.filas[0].instruccion);

  // El BOM y el separador son parte del contrato con Excel; si el lector no los
  // aguanta, falla con el archivo real y no con el de prueba.
  check('aguanta el BOM del inicio', Cruce.parseDespacho('﻿' + archivoRH([p1])).filas.length === 1);
  check('un archivo que no es de RH se rechaza con motivo',
    /no dice de qué semana|no tiene la forma/.test(Cruce.parseDespacho('hola\nmundo\n\nx;y').error || ''),
    Cruce.parseDespacho('hola\nmundo\n\nx;y').error);

  // Una instruccion con ';' dentro va entrecomillada. Si el lector parte por ';'
  // a lo bruto, se le recorren TODAS las columnas de ese renglon.
  const pDos = persona({ id: 57, nombre: 'Samuel', codigo: '014', dias_mexico: 4,
    declaraciones: [{ tipo: 'vacaciones', valores: {} }] });
  const dDos = Cruce.parseDespacho(archivoRH([pDos]));
  check('un renglon con comillas no recorre las columnas',
    dDos.filas[0].codigo3 === '014' && /SIN CANTIDAD/.test(dDos.filas[0].instruccion),
    JSON.stringify([dDos.filas[0].codigo3, dDos.filas[0].instruccion]));
}

// El .xlsx es el MISMO archivo que el .csv, y RH manda los dos. Si el lector de
// rejilla no produjera lo mismo que el de texto, Ulises veria un cruce distinto
// segun cual de los dos le haya tocado abrir — que es el peor tipo de bug: el que
// depende de con que archivo llegaste.
{
  const p1 = persona({ id: 62, nombre: 'Gibrán Solís', codigo: '013', dias_mexico: 3,
    ppa: { aplica: false }, declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }] });
  const H = Des.hojas({ semana: SEMANA, personas: [p1], disputas: [] },
                      { version: 1, actor: 'magaly.perez', fecha: '2026-09-04 15:00' });
  // La hoja 1 tal como la devolveria un lector de xlsx: valores planos.
  const rejilla = H[0].filas.map(f => f.map(cl => (cl && typeof cl === 'object') ? cl.v : cl));
  const dHoja = Cruce.desdeFilas(rejilla);
  const dTxt  = Cruce.parseDespacho(archivoRH([p1]));
  check('leer el .xlsx da la MISMA semana que el .csv', dHoja.semana === dTxt.semana, dHoja.semana);
  check('la MISMA gente', dHoja.filas.length === dTxt.filas.length, dHoja.filas.length + ' vs ' + dTxt.filas.length);
  check('el MISMO codigo', dHoja.filas[0].codigo3 === dTxt.filas[0].codigo3, dHoja.filas[0].codigo3);
  check('y la MISMA instruccion',
    dHoja.filas[0].instruccion === dTxt.filas[0].instruccion,
    JSON.stringify([dHoja.filas[0].instruccion, dTxt.filas[0].instruccion]));
}

// ═══════════════════ 2 · LEER UNA INSTRUCCION ═══════════════════
seccion('Leer una instruccion');
{
  const i1 = Cruce.leerInstruccion('PPA. DESCONTAR 2 días · Permiso sin goce (fallecimiento). AGREGAR $2,500.00 · Bono de proyecto (SO11547).');
  check('detecta el premio', i1.ppa === true);
  check('saca los dos conceptos', i1.items.length === 2, String(i1.items.length));
  check('el verbo', i1.items[0].verbo === 'DESCONTAR', i1.items[0].verbo);
  check('los dias', i1.items[0].dias === 2, String(i1.items[0].dias));
  check('el concepto, sin el detalle entre parentesis',
    i1.items[0].concepto === 'Permiso sin goce', i1.items[0].concepto);
  check('el monto, sin la coma de miles', i1.items[1].monto === 2500, String(i1.items[1].monto));

  const i2 = Cruce.leerInstruccion('DESCONTAR 3 días · Trabajó en USA.');
  check('una sola frase tambien se lee', i2.items.length === 1 && i2.items[0].dias === 3);
  check('sin PPA no inventa premio', i2.ppa === false);

  // La linea de contexto NO es una instruccion: no lleva verbo. Si se colara como
  // concepto, el cruce reportaria un movimiento que nadie pidio.
  const i3 = Cruce.leerInstruccion('4 de 5 días trabajados. PAGAR 1 día · Vacaciones.');
  check('la linea de contexto no se lee como instruccion',
    i3.items.length === 1 && i3.items[0].concepto === 'Vacaciones', JSON.stringify(i3.items));

  check('SIN CANTIDAD se marca', Cruce.leerInstruccion('PAGAR SIN CANTIDAD · Vacaciones.').items[0].sin_cantidad === true);
  check('un renglon vacio no produce conceptos', Cruce.leerInstruccion('').items.length === 0);
}

// ═══════════════════ 3 · EL CRUCE ═══════════════════
seccion('El cruce · la semana y el roster');
{
  const p = persona({ id: 62, nombre: 'Gibrán Solís', codigo: '013', ppa: { aplica: false } });
  const d = Cruce.parseDespacho(archivoRH([p]));

  const r1 = Cruce.cruzar(d, [emp('013', 'SOLIS CARRILLO GILBERTO')], 'S37/2026');
  check('una semana distinta se caza ANTES que nada', tiene(r1.hallazgos, 'SEMANA_DISTINTA'), codigos(r1.hallazgos).join(','));
  check('y es INTEGRIDAD: comparar dos semanas distintas no tiene sentido',
    r1.hallazgos.find(x => x.codigo === 'SEMANA_DISTINTA').nivel === 'INTEGRIDAD');

  const r2 = Cruce.cruzar(d, [emp('013', 'SOLIS CARRILLO GILBERTO')], 'S36/2026');
  check('la semana correcta no genera hallazgo', !tiene(r2.hallazgos, 'SEMANA_DISTINTA'));
  check('una semana limpia no genera NINGUN hallazgo', r2.hallazgos.length === 0, codigos(r2.hallazgos).join(','));
  check('y se cuenta como cruzada', r2.resumen.cruzados === 1);

  // El error caro: RH la mando y la nomina no la paga.
  const r3 = Cruce.cruzar(d, [], 'S36/2026');
  check('alguien de RH que no esta en la nomina es INTEGRIDAD',
    tiene(r3.hallazgos, 'RH_SIN_PAGO') &&
    r3.hallazgos.find(x => x.codigo === 'RH_SIN_PAGO').nivel === 'INTEGRIDAD');

  // Y el inverso: la nomina paga a alguien que RH no listo.
  const r4 = Cruce.cruzar(d, [emp('013', 'SOLIS'), emp('099', 'DESCONOCIDO')], 'S36/2026');
  check('un pago que RH no listo tambien se caza', tiene(r4.hallazgos, 'PAGO_SIN_RH'));

  // '13' y '013' son la misma persona.
  const r5 = Cruce.cruzar(d, [emp('13', 'SOLIS')], 'S36/2026');
  check('el codigo cruza con o sin ceros a la izquierda', r5.hallazgos.length === 0, codigos(r5.hallazgos).join(','));

  // Sin codigo no se puede cruzar, pero el archivo sigue siendo revisable.
  const pSin = persona({ id: 32, nombre: 'Esteban', ppa: { aplica: false } });
  const rSin = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pSin])), [], 'S36/2026');
  check('sin codigo se dice y no se cuenta como falta de pago',
    tiene(rSin.hallazgos, 'RH_SIN_CODIGO') && !tiene(rSin.hallazgos, 'RH_SIN_PAGO'),
    codigos(rSin.hallazgos).join(','));
}

seccion('El cruce · el premio de puntualidad');
{
  const conPpa = persona({ id: 6, nombre: 'Leonel', codigo: '005', ppa: { aplica: true, sugerido: true } });
  const sinPpa = persona({ id: 6, nombre: 'Leonel', codigo: '005', ppa: { aplica: true, sugerido: false } });

  const a = Cruce.cruzar(Cruce.parseDespacho(archivoRH([conPpa])), [emp('005', 'CRUZ LEONEL', {})], 'S36/2026');
  check('RH lo otorgo y la nomina no lo trae → INTEGRIDAD',
    tiene(a.hallazgos, 'PPA_NO_PAGADO') && a.hallazgos.find(x => x.codigo === 'PPA_NO_PAGADO').nivel === 'INTEGRIDAD');

  const b = Cruce.cruzar(Cruce.parseDespacho(archivoRH([sinPpa])),
    [emp('005', 'CRUZ LEONEL', { [PPA]: 250 })], 'S36/2026');
  check('la nomina lo paga y RH no lo otorgo → tambien se caza', tiene(b.hallazgos, 'PPA_SIN_INSTRUCCION'));

  const c = Cruce.cruzar(Cruce.parseDespacho(archivoRH([conPpa])),
    [emp('005', 'CRUZ LEONEL', { [PPA]: 250 })], 'S36/2026');
  check('los dos de acuerdo → sin hallazgo', c.hallazgos.length === 0, codigos(c.hallazgos).join(','));

  const dd = Cruce.cruzar(Cruce.parseDespacho(archivoRH([sinPpa])), [emp('005', 'CRUZ LEONEL', {})], 'S36/2026');
  check('los dos de acuerdo en NO darlo → tampoco hallazgo', dd.hallazgos.length === 0, codigos(dd.hallazgos).join(','));
}

seccion('El cruce · concepto por concepto');
{
  const pVac = persona({ id: 62, nombre: 'Gibrán', codigo: '013', dias_mexico: 3,
    ppa: { aplica: false }, declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }] });
  const dVac = Cruce.parseDespacho(archivoRH([pVac]));

  const noCap = Cruce.cruzar(dVac, [emp('013', 'SOLIS', {})], 'S36/2026');
  check('RH pidio vacaciones y la nomina no las trae → INTEGRIDAD',
    tiene(noCap.hallazgos, 'INSTRUCCION_NO_CAPTURADA') &&
    noCap.hallazgos.find(x => x.codigo === 'INSTRUCCION_NO_CAPTURADA').nivel === 'INTEGRIDAD');
  check('y el hallazgo dice QUE pidio, no solo que falta',
    /PAGAR 2 días · Vacaciones/.test(noCap.hallazgos.find(x => x.codigo === 'INSTRUCCION_NO_CAPTURADA').dato));

  const cap = Cruce.cruzar(dVac, [emp('013', 'SOLIS', { VACACIONES_A_TIEMPO: 900 })], 'S36/2026');
  check('capturadas → sin hallazgo', cap.hallazgos.length === 0, codigos(cap.hallazgos).join(','));

  // Movimiento que RH nunca pidio.
  const sobra = Cruce.cruzar(Cruce.parseDespacho(archivoRH([persona({ id: 62, codigo: '013', ppa: { aplica: false } })])),
    [emp('013', 'SOLIS', { BONO: 1500 })], 'S36/2026');
  check('un bono que RH no pidio → INTEGRIDAD', tiene(sobra.hallazgos, 'CAPTURA_SIN_INSTRUCCION'));
  check('y se reporta UNA sola vez aunque tres etiquetas apunten a BONO',
    sobra.hallazgos.filter(x => x.codigo === 'CAPTURA_SIN_INSTRUCCION').length === 1,
    String(sobra.hallazgos.filter(x => x.codigo === 'CAPTURA_SIN_INSTRUCCION').length));

  // Monto distinto: capturado, pero no por lo que RH pidio.
  const pBono = persona({ id: 79, codigo: '029', ppa: { aplica: false },
    // con motivo: el catalogo lo exige y sin el la persona sale marcada en REVISAR,
    // que es un hallazgo legitimo y ensuciaria lo que este caso quiere medir.
    declaraciones: [{ tipo: 'bono_productividad', fuente: 'J96',
                      valores: { monto: 2500, motivo: 'cierre de Topo Chico' } }] });
  const dif = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pBono])),
    [emp('029', 'ROMERO', { BONO: 1500 })], 'S36/2026');
  check('capturado con OTRO monto → se dice, con los dos numeros',
    tiene(dif.hallazgos, 'MONTO_DISTINTO') &&
    /\$2,?500\.00.*\$1,?500\.00|2500\.00.*1500\.00/.test(dif.hallazgos.find(x => x.codigo === 'MONTO_DISTINTO').dato),
    (dif.hallazgos.find(x => x.codigo === 'MONTO_DISTINTO') || {}).dato);

  const igual = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pBono])),
    [emp('029', 'ROMERO', { BONO: 2500 })], 'S36/2026');
  check('capturado con el monto correcto → sin hallazgo', igual.hallazgos.length === 0, codigos(igual.hallazgos).join(','));

  // Un concepto sin fila en la tabla NO se calla: se dice que no se pudo cruzar.
  // Es la diferencia entre "no encontre problema" y "no supe mirar".
  const pUsa = persona({ id: 75, codigo: '027', dias_mexico: 2, ppa: { aplica: false },
    declaraciones: [{ tipo: 'trabajo_usa', valores: { dias: 3, so: 'SO1' } }] });
  const usa = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pUsa])), [emp('027', 'SALAZAR', {})], 'S36/2026');
  check('un concepto fuera de la tabla se declara NO CRUZABLE, no se calla',
    tiene(usa.hallazgos, 'CONCEPTO_NO_CRUZABLE'), codigos(usa.hallazgos).join(','));
}

seccion('El cruce · lo que RH marco para revisar');
{
  const pRev = persona({ id: 130, codigo: '062', dias_mexico: 4, ppa: { aplica: false } });
  const r = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pRev])), [emp('062', 'VAZQUEZ', {})], 'S36/2026');
  check('lo que RH marco en REVISAR viaja hasta Ulises', tiene(r.hallazgos, 'RH_MARCO_REVISAR'),
    codigos(r.hallazgos).join(','));
  check('y dice QUE hay que revisar',
    /no suman 5/.test(r.hallazgos.find(x => x.codigo === 'RH_MARCO_REVISAR').dato),
    r.hallazgos.find(x => x.codigo === 'RH_MARCO_REVISAR').dato);
}

seccion('Forma de los hallazgos');
{
  const p = persona({ id: 62, codigo: '013', ppa: { aplica: false } });
  const r = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])), [emp('013', 'SOLIS', { BONO: 1 })], 'S36/2026');
  const h = r.hallazgos[0];
  check('todo hallazgo trae nivel, codigo, que, dato y accion',
    !!(h.nivel && h.codigo && h.que && h.dato && h.accion), JSON.stringify(Object.keys(h)));
  check('la accion dice que HACER, no solo que pasa', /[a-z]/.test(h.accion) && h.accion.length > 20, h.accion);
  check('los niveles son los tres del resolver',
    r.hallazgos.every(x => ['INTEGRIDAD', 'REVISION', 'AVISO'].indexOf(x.nivel) >= 0));
  check('contar() cuenta por nivel', Cruce.contar(r.hallazgos, 'INTEGRIDAD') >= 1);
}

console.log('\n' + '═'.repeat(64));
if (fail) { console.log('FALLARON ' + fail + ' de ' + (ok + fail)); process.exit(1); }
console.log('GATE VERDE — ' + ok + '/' + ok + ' asserts');
