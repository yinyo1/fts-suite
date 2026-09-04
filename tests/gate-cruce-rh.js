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
const fs = require('fs');
const RAIZ = path.join(__dirname, '..');
const Cruce = require(path.join(RAIZ, 'operaciones', 'carga-mo', 'js', 'cruce-rh.js'));
const Des = require(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'js', 'despacho.js'));
const Cat = require(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'js', 'catalogo.js'));

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

  // Vacaciones y prima van JUNTAS en la vida real: CONTPAQi paga la prima sola en
  // cuanto hay vacaciones. El fixture traía las vacaciones peladas, que es un estado
  // que no existe — y por eso ahora el motor lo caza como prima faltante.
  const cap = Cruce.cruzar(dVac,
    [emp('013', 'SOLIS', { VACACIONES_A_TIEMPO: 900, PRIMA_VACACIONAL_A_TIEMPO: 225 })], 'S36/2026');
  check('capturadas con su prima de ley → sin hallazgo', cap.hallazgos.length === 0, codigos(cap.hallazgos).join(','));

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
    // `isr` entra por la misma razón que `motivo`: el catálogo lo exige, y sin él la
    // persona sale marcada en REVISAR y ensucia lo que este caso quiere medir.
    declaraciones: [{ tipo: 'bono_productividad', fuente: 'J96',
                      valores: { monto: 2500, motivo: 'cierre de Topo Chico',
                                 isr: 'Con ISR a cargo del empleado' } }] });
  const dif = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pBono])),
    [emp('029', 'ROMERO', { BONO: 1500 })], 'S36/2026');
  check('capturado con OTRO monto → se dice, con los dos numeros',
    tiene(dif.hallazgos, 'MONTO_DISTINTO') &&
    /\$2,?500\.00.*\$1,?500\.00|2500\.00.*1500\.00/.test(dif.hallazgos.find(x => x.codigo === 'MONTO_DISTINTO').dato),
    (dif.hallazgos.find(x => x.codigo === 'MONTO_DISTINTO') || {}).dato);

  const igual = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pBono])),
    [emp('029', 'ROMERO', { BONO: 2500 })], 'S36/2026');
  check('capturado con el monto correcto → sin hallazgo', igual.hallazgos.length === 0, codigos(igual.hallazgos).join(','));

  // ── El bono libre de impuestos ──
  // RH escribe lo que le LLEGA al empleado; Ulises captura el BRUTO que lo produce.
  // Exigir que fueran iguales convertía el trabajo bien hecho en siete hallazgos.
  const FUENTE = Object.keys(Cat.JOURNALS)[0];
  const pLibre = persona({ id: 79, codigo: '029', ppa: { aplica: false },
    declaraciones: [{ tipo: 'bono_productividad', fuente: FUENTE,
      valores: { monto: 1000, motivo: 'PRODUCTIVIDAD', isr: Cat.LIBRE } }] });
  const dLibre = Cruce.parseDespacho(archivoRH([pLibre]));
  check('el archivo dice que el bono va libre de impuestos',
    /LIBRE DE IMPUESTOS/.test(dLibre.filas[0].instruccion), dLibre.filas[0].instruccion);
  check('y el parser lo lee', dLibre.filas[0].conceptos.items[0].libre === true);

  const brutoOk = Cruce.cruzar(dLibre, [emp('029', 'ROMERO', { BONO: 1271.62 })], 'S36/2026');
  check('un bruto mayor coherente con el ISR no es un error',
    Cruce.contar(brutoOk.hallazgos, 'INTEGRIDAD') === 0 && Cruce.contar(brutoOk.hallazgos, 'REVISION') === 0,
    codigos(brutoOk.hallazgos).join(','));
  check('y se dice la cuenta, con el ISR implícito',
    /21\.36%/.test((brutoOk.hallazgos.find(h => h.codigo === 'BONO_LIBRE_OK') || {}).dato || ''),
    (brutoOk.hallazgos.find(h => h.codigo === 'BONO_LIBRE_OK') || {}).dato);

  // El error que esta regla SÍ tiene que cazar: capturar el neto como si fuera
  // bruto. Al empleado le llegan ~$790 de los $1,000 que le prometieron.
  const sinCalcular = Cruce.cruzar(dLibre, [emp('029', 'ROMERO', { BONO: 1000 })], 'S36/2026');
  check('capturar el neto como bruto SÍ es INTEGRIDAD',
    tiene(sinCalcular.hallazgos, 'BONO_LIBRE_SIN_CALCULAR') &&
    sinCalcular.hallazgos.find(h => h.codigo === 'BONO_LIBRE_SIN_CALCULAR').nivel === 'INTEGRIDAD');

  const absurdo = Cruce.cruzar(dLibre, [emp('029', 'ROMERO', { BONO: 10000 })], 'S36/2026');
  check('y un factor que ninguna tasa explica también se reporta',
    tiene(absurdo.hallazgos, 'BONO_LIBRE_DESPROPORCIONADO'));

  // Con ISR al empleado, el monto es el bruto y se compara tal cual.
  const pIsr = persona({ id: 79, codigo: '029', ppa: { aplica: false },
    declaraciones: [{ tipo: 'bono_productividad', fuente: FUENTE,
      valores: { monto: 1000, motivo: 'X', isr: 'Con ISR a cargo del empleado' } }] });
  const dIsr = Cruce.parseDespacho(archivoRH([pIsr]));
  check('con ISR al empleado el parser NO lo marca libre', dIsr.filas[0].conceptos.items[0].libre === false);
  const isrDif = Cruce.cruzar(dIsr, [emp('029', 'ROMERO', { BONO: 1271.62 })], 'S36/2026');
  check('y ahí un bruto distinto SÍ es diferencia de monto', tiene(isrDif.hallazgos, 'MONTO_DISTINTO'),
    codigos(isrDif.hallazgos).join(','));

  // Archivo viejo, sin la marca: no se puede saber cuál de los dos casos es. Se dice
  // la diferencia y se pide declararla, en vez de afirmar que está mal. Es el lado
  // TOLERANTE del contrato, que es el que debe ir primero (CLAUDE.md §8).
  const viejo = Cruce.parseDespacho(archivoRH([pLibre]).replace(/ · LIBRE DE IMPUESTOS/g, ''));
  check('sin la marca, el parser no inventa un valor', viejo.filas[0].conceptos.items[0].libre === null);
  const sinMarca = Cruce.cruzar(viejo, [emp('029', 'ROMERO', { BONO: 1271.62 })], 'S36/2026');
  check('sin la marca se pide declararlo, no se afirma que está mal',
    tiene(sinMarca.hallazgos, 'MONTO_MAYOR_SIN_DECLARAR') &&
    Cruce.contar(sinMarca.hallazgos, 'INTEGRIDAD') === 0);

  // Un concepto sin fila en la tabla NO se calla: se dice que no se pudo cruzar.
  // Es la diferencia entre "no encontre problema" y "no supe mirar".
  // Los conceptos de DÍAS tienen su propio camino: la lista de raya no trae columna
  // de días ni sueldo diario, así que NO se pueden verificar. Decir 'no sé compararlo'
  // suena a que falta configurar algo; lo honesto es decir que no hay contra qué.
  const pUsa = persona({ id: 75, codigo: '027', dias_mexico: 2, ppa: { aplica: false },
    declaraciones: [{ tipo: 'trabajo_usa', valores: { dias: 3, so: 'SO1' } }] });
  const usa = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pUsa])), [emp('027', 'SALAZAR', {})], 'S36/2026');
  check('un ajuste de días se declara NO VERIFICABLE, no "no capturado"',
    tiene(usa.hallazgos, 'DIAS_NO_VERIFICABLES'), codigos(usa.hallazgos).join(','));
  check('y es AVISO: es un límite del layout, no una sospecha sobre este archivo',
    usa.hallazgos.find(h => h.codigo === 'DIAS_NO_VERIFICABLES').nivel === 'AVISO');
  check('y dice qué mirar a mano',
    /Sueldo.*sueldo diario/i.test(usa.hallazgos.find(h => h.codigo === 'DIAS_NO_VERIFICABLES').accion),
    usa.hallazgos.find(h => h.codigo === 'DIAS_NO_VERIFICABLES').accion);
  const pFuera = persona({ id: 6, codigo: '005', ppa: { aplica: false }, fuente: Object.keys(Cat.JOURNALS)[0],
    declaraciones: [{ tipo: 'pagado_fts_usa', fuente: Object.keys(Cat.JOURNALS)[0], valores: { monto: 800 } }] });
  const fuera = Cruce.cruzar(Cruce.parseDespacho(archivoRH([pFuera])), [emp('005', 'X', {})], 'S36/2026');
  check('un concepto SIN días que no está en la tabla se declara NO CRUZABLE',
    tiene(fuera.hallazgos, 'CONCEPTO_NO_CRUZABLE'), codigos(fuera.hallazgos).join(','));
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

seccion('El MAPA contra el catálogo real de nómina');
{
  // ⚠️ ESTE ES EL ASSERT QUE FALTABA. El MAPA decía 'Descuento DE préstamo' y
  // 'Compensación de deuda'; el catálogo dice 'Descuento POR préstamo' y 'Compensa
  // contra deuda'. Ninguna de las dos calzaba, así que esos conceptos NUNCA se
  // cruzaron: RH los pedía, Ulises los capturaba bien, y la pantalla reportaba
  // 'RH pidió algo que este cruce no sabe comparar'. Una preposición apagó un
  // control entero y no hubo error en ningún lado.
  const etiquetas = new Set();
  for (const g of Object.keys(Cat.CATALOGO)) {
    const items = (Cat.CATALOGO[g] && Cat.CATALOGO[g].items) || {};
    for (const k of Object.keys(items)) if (items[k].label) etiquetas.add(items[k].label);
  }
  const rotas = Cruce.MAPA.filter(m => !etiquetas.has(m.etiqueta)).map(m => m.etiqueta);
  check('toda etiqueta del MAPA existe LETRA POR LETRA en el catálogo de nómina',
    rotas.length === 0, rotas.join(' | '));

  // Y las claves tienen que existir del lado de CONTPAQi, o el cruce busca un
  // concepto que el resolver nunca va a producir.
  const cat = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/operaciones/contpaqi_conceptos.json'), 'utf8'));
  const claves = new Set(Object.keys(cat.conceptos || {}));
  const sinClave = Cruce.MAPA.filter(m => !claves.has(m.clave)).map(m => m.clave);
  check('toda clave del MAPA existe en el catálogo de CONTPAQi', sinClave.length === 0, sinClave.join(' | '));
  check('la clave del premio también', claves.has(Cruce.CLAVE_PPA), Cruce.CLAVE_PPA);
}

seccion('Percepciones y deducciones: las dos mitades del renglón');
{
  // Un descuento por préstamo vive del lado de las DEDUCCIONES. El cruce solo miraba
  // percepciones, así que lo daba por no capturado estando capturado — y con la
  // etiqueta arreglada ese bug habría salido a la luz como un falso INTEGRIDAD.
  const p = persona({ id: 6, codigo: '005',
    declaraciones: [{ tipo: 'descuento_prestamo', valores: { monto: 500, pago: 2 } }] });
  const e = emp('005', 'CRUZ CRISTOBAL LEONEL', {});
  e.deducciones = { PRESTAMO_EMPRESA: 500 };
  const r = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])), [e], 'S36/2026');
  check('un descuento capturado en deducciones se ve como capturado',
    !tiene(r.hallazgos, 'INSTRUCCION_NO_CAPTURADA'),
    (r.hallazgos.find(h => h.codigo === 'INSTRUCCION_NO_CAPTURADA') || {}).dato || '');

  const sinNada = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])), [emp('005', 'X', {})], 'S36/2026');
  check('y si de verdad NO está, se sigue reportando',
    tiene(sinNada.hallazgos, 'INSTRUCCION_NO_CAPTURADA'));
}

seccion('Lo que CONTPAQi paga solo porque es ley');
{
  // RH pide 'Vacaciones'; CONTPAQi paga vacaciones Y prima vacacional, que es el 25%
  // de ley (LFT art. 80). Reclamar la prima como 'movimiento que RH no pidió' era
  // exigirle a Magaly que declarara una obligación legal, y apagaba el botón de
  // enviar con tres INTEGRIDAD sobre una nómina correcta.
  const p = persona({ id: 25, codigo: '002', dias_mexico: 2,
    declaraciones: [{ tipo: 'vacaciones', valores: { dias: 3 } }] });
  const conPrima = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])),
    [emp('002', 'CRUZ HERNANDEZ HECTOR', { VACACIONES_A_TIEMPO: 3478, PRIMA_VACACIONAL_A_TIEMPO: 869.5 })], 'S36/2026');
  check('la prima vacacional del 25% NO se reporta como no pedida',
    !tiene(conPrima.hallazgos, 'CAPTURA_SIN_INSTRUCCION'),
    (conPrima.hallazgos.find(h => h.codigo === 'CAPTURA_SIN_INSTRUCCION') || {}).dato || '');
  check('ni ningún otro hallazgo sobre esa persona', conPrima.hallazgos.length === 0,
    conPrima.hallazgos.map(h => h.codigo).join(','));

  // Pero SÍ se verifica el porcentaje: es el control que de verdad importa.
  const corta = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])),
    [emp('002', 'X', { VACACIONES_A_TIEMPO: 3478, PRIMA_VACACIONAL_A_TIEMPO: 500 })], 'S36/2026');
  check('una prima por debajo del 25% de ley SÍ se reporta', tiene(corta.hallazgos, 'DERIVADO_CORTO'));
  check('y dice el porcentaje real contra el mínimo',
    /14\.4%.*25%/.test(corta.hallazgos.find(h => h.codigo === 'DERIVADO_CORTO').dato),
    corta.hallazgos.find(h => h.codigo === 'DERIVADO_CORTO').dato);

  const falta = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p])),
    [emp('002', 'X', { VACACIONES_A_TIEMPO: 3478 })], 'S36/2026');
  check('vacaciones SIN prima también se reporta', tiene(falta.hallazgos, 'DERIVADO_FALTANTE'));

  // Prima sin vacaciones no tiene de dónde salir: eso sigue siendo un movimiento
  // que RH no pidió, y no se debe tapar con la regla de arriba.
  const p2 = persona({ id: 25, codigo: '002' });
  const huerfana = Cruce.cruzar(Cruce.parseDespacho(archivoRH([p2])),
    [emp('002', 'X', { PRIMA_VACACIONAL_A_TIEMPO: 869.5 })], 'S36/2026');
  check('una prima SIN vacaciones sigue siendo hallazgo', tiene(huerfana.hallazgos, 'CAPTURA_SIN_INSTRUCCION'));
}

seccion('El calendario del frontend contra el del workflow');
{
  // Carga MO le pide una semana a nom/despacho por su id 'Snn/aaaa'. Si el frontend
  // y el workflow numeran distinto, Ulises pide una semana y RH le contesta con
  // otra — y las dos pantallas se ven perfectamente bien mientras hablan de cosas
  // distintas. Por eso el calculo del html se lee del html y se compara contra el
  // del workflow, no contra una copia de este archivo.
  const html = fs.readFileSync(path.join(RAIZ, 'operaciones/carga-mo/index.html'), 'utf8');
  const m = /function semanaDeViernes\(vie\)\{[\s\S]*?\n\}/.exec(html);
  check('el html define semanaDeViernes', !!m);
  const semanaDeViernes = new Function('return ' + String(m[0]).replace('function semanaDeViernes', 'function'))();

  const ANCLA = Date.UTC(2026, 6, 23), MS = 864e5;
  const idDelWorkflow = jue => 'S' + (30 + Math.round((jue - ANCLA) / (7 * MS))) + '/' + new Date(jue).getUTCFullYear();

  check('el ancla: el viernes 17-jul-2026 es la S30/2026', semanaDeViernes('2026-07-17') === 'S30/2026');

  let divergen = 0, primera = null;
  for (let k = -60; k <= 60; k++) {
    const jue = ANCLA + k * 7 * MS;
    const vie = new Date(jue - 6 * MS).toISOString().slice(0, 10);
    if (semanaDeViernes(vie) !== idDelWorkflow(jue)) { divergen++; if (!primera) primera = vie; }
  }
  check('120 semanas seguidas dan el mismo id que el workflow', divergen === 0,
    divergen ? divergen + ' divergen, la primera el ' + primera : '');

  // El anio del id sale del JUEVES que cierra, no del viernes que abre: el workflow
  // rechaza el id si el anio no cuadra, asi que equivocarse aqui es un 400.
  check('en el cruce de anio manda el jueves', /\/2027$/.test(semanaDeViernes('2027-01-01')));
  check('entrada vacia no truena', semanaDeViernes('') === null);
  check('entrada basura no truena', semanaDeViernes('no-es-fecha') === null);

  // La semana que se propone al abrir es la ULTIMA CERRADA. Un viernes la semana en
  // curso lleva un dia de vida y no hay nada que capturar en ella; lo que se procesa
  // es la que acaba de cerrar. Tiene que ser la MISMA regla que usa nom/semana del
  // lado de RH, o las dos pantallas abren en semanas distintas.
  const m2 = /function arrancarSemana\(\)\{[\s\S]*?\n\}/.exec(html);
  check('el html define arrancarSemana', !!m2);
  check('arrancarSemana retrocede cuando la semana sigue abierta', /jue >= d\) jue -= 7\*864e5/.test(String(m2[0])));

  const propuesta = hoyIso => {
    const hoy = new Date(hoyIso + 'T12:00:00');
    const d = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let jue = d + ((4 - new Date(d).getUTCDay() + 7) % 7) * 864e5;
    if (jue >= d) jue -= 7 * 864e5;
    return new Date(jue - 6 * 864e5).toISOString().slice(0, 10);
  };
  const semanaDelViernes4 = ['2026-09-04', '2026-09-05', '2026-09-07', '2026-09-10']
    .every(dia => propuesta(dia) === '2026-08-28');
  check('del vie 4-sep al jue 10-sep se propone la semana que cerro el 3-sep', semanaDelViernes4);
  check('el viernes siguiente ya salta a la que cerro', propuesta('2026-09-11') === '2026-09-04');
  check('la propuesta del 4-sep es la S36/2026', semanaDeViernes(propuesta('2026-09-04')) === 'S36/2026');
}

seccion('Contrato con nom/despacho');
{
  // El endpoint devuelve el TEXTO del csv congelado, y el motor lo lee con el mismo
  // parseDespacho que antes leia el archivo subido a mano. Que siga siendo el mismo
  // camino es lo que hace que quitar el drop manual no cambie el resultado.
  const html = fs.readFileSync(path.join(RAIZ, 'operaciones/carga-mo/index.html'), 'utf8');
  check('la pantalla ya NO pide el archivo de RH a mano',
    !/id="file-rh"/.test(html) && !/id="drop-rh"/.test(html));
  check('lo que llega del endpoint se lee con parseDespacho',
    /RH = CruceRH\.parseDespacho\(j\.archivo\)/.test(html));
  check('se manda el token de Finanzas en el body, no en un header',
    /body: JSON\.stringify\(\{ semana: semId, token:/.test(html));
  check('una respuesta de una semana vieja se descarta',
    /if\(pedida !== RH_SEM\) return;/.test(html));
  check('un borrador no se pinta como enviado', /if\(!j\.enviada\)/.test(html));

  // Los tres 'no hay nada que cruzar' NO son el mismo problema: uno lo resuelve
  // Ulises, otro Magaly y el tercero nosotros. Fundirlos manda a Ulises a hablar con
  // la persona equivocada.
  check('el estado distingue falta de RH y falla nuestra',
    /RH_EST = \{ estado:'falta'/.test(html) && /RH_EST = \{ estado:'error'/.test(html));
  check('cuando no se pudo consultar, se DICE que no se comparo nada',
    /nadie comparó<\/b> si trae lo que RH pidió/.test(html));

  // El texto que devuelve el endpoint es el mismo que produce el generador de RH,
  // asi que el parser tiene que sacarle la semana y la version igual que siempre.
  const comoDelEndpoint = Cruce.parseDespacho(archivoRH([persona({ id: 62, codigo: '013' })]));
  check('del texto del endpoint sale la semana', comoDelEndpoint.semana === 'S36/2026', comoDelEndpoint.semana);
  check('y sale sin error', !comoDelEndpoint.error, comoDelEndpoint.error || '');
  check('y salen las personas', comoDelEndpoint.filas.length === 1);
}

console.log('\n' + '═'.repeat(64));
if (fail) { console.log('FALLARON ' + fail + ' de ' + (ok + fail)); process.exit(1); }
console.log('GATE VERDE — ' + ok + '/' + ok + ' asserts');
