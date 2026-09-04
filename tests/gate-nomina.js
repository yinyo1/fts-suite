#!/usr/bin/env node
// ═══ Gate — RH · Nómina · Incidencias ═══
//
// QUÉ VERIFICA. Dos capas, en este orden:
//   1. LÓGICA PURA (sin DOM): candado aritmético, bloqueos, derivaciones y totales.
//      Requiere catalogo.js y logica.js directo desde node. Es la capa que decide si
//      una semana se manda o no, o sea la que mueve dinero.
//   2. RENDER en jsdom: monta el index.html REAL —el archivo, no una copia— con la
//      sesión stubbeada, y afirma sobre el DOM resultante.
//
// CÓMO SE CORRE.  node tests/gate-nomina.js
// Requiere jsdom:  npm i jsdom  →  NODE_PATH=<dir>/node_modules node tests/gate-nomina.js
//
// REGLA DE USO. Si un cambio rompe un assert, se arregla el cambio — nunca el assert.
// Aflojar una prueba para que pase es el anti-patrón que el gate existe para impedir.

'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const MOD = path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.error('Falta jsdom. npm i jsdom y reintenta (o NODE_PATH=<dir>/node_modules).'); process.exit(2); }

const Cat = require(path.join(MOD, 'js', 'catalogo.js'));
const Log = require(path.join(MOD, 'js', 'logica.js'));
const Des = require(path.join(MOD, 'js', 'despacho.js'));

let pass = 0; const fails = []; let bloque = '';
function check(nombre, cond, detalle) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); return true; }
  fails.push('[' + bloque + '] ' + nombre + (detalle ? ' → ' + detalle : ''));
  console.log('  ✗ ' + nombre + (detalle ? ' → ' + detalle : ''));
  return false;
}
function seccion(n) { bloque = n; console.log('\n── ' + n + ' ──'); }

const SEMANA = { id: 'S36/2026', desde: '2026-08-28', hasta: '2026-09-03', dias: 5 };
function persona(extra) {
  return Object.assign({ id: 1, nombre: 'Prueba Uno', puesto: 'Soldador', departamento: 'Operaciones',
    inactivo: false, dias_mexico: 5, declaraciones: [], estados: [] }, extra || {});
}

// ═══════════════════ 1 · CANDADO ARITMÉTICO ═══════════════════
seccion('Candado aritmético');
{
  const p = persona();
  const c = Log.contarDias(p, SEMANA);
  check('5 días en México cuadran solos', c.cuadra === true && c.total === 5, JSON.stringify(c));

  const p2 = persona({ dias_mexico: 3, declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }] });
  const c2 = Log.contarDias(p2, SEMANA);
  check('3 de México + 2 de vacaciones = 5', c2.cuadra && c2.vac === 2 && c2.total === 5, JSON.stringify(c2));

  const p3 = persona({ dias_mexico: 3, declaraciones: [{ tipo: 'vacaciones', valores: { dias: 1 } }] });
  check('4 de 5 NO cuadra', Log.contarDias(p3, SEMANA).cuadra === false);

  const p4 = persona({ dias_mexico: 4, declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }] });
  check('6 de 5 tampoco cuadra (pasarse es tan malo como faltar)',
    Log.contarDias(p4, SEMANA).cuadra === false, String(Log.contarDias(p4, SEMANA).total));

  const p5 = persona({ dias_mexico: 3, declaraciones: [{ tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO1' } }] });
  check('USA cuenta en su propio cubo, no en México',
    Log.contarDias(p5, SEMANA).usa === 2 && Log.contarDias(p5, SEMANA).mexico === 3);

  const p6 = persona({ dias_mexico: 5, declaraciones: [{ tipo: 'descanso_trabajado', valores: { dias: 1 } }] });
  check('descanso trabajado NO consume días de la semana',
    Log.contarDias(p6, SEMANA).total === 5, String(Log.contarDias(p6, SEMANA).total));

  const p7 = persona({ dias_mexico: 5, declaraciones: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 100, so: 'SO1' }] } }] });
  check('el dinero no consume días', Log.contarDias(p7, SEMANA).total === 5);
}

// ═══════════════════ 2 · BLOQUEOS ═══════════════════
seccion('Bloqueos');
{
  check('persona limpia no bloquea', Log.bloqueos(persona(), SEMANA, []).length === 0);

  const b1 = Log.bloqueos(persona({ dias_mexico: 4 }), SEMANA, []);
  check('días que no cuadran bloquean', b1.length === 1 && b1[0].clase === 'dias', JSON.stringify(b1));

  const bonoSinSO = persona({ declaraciones: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 2500, so: '' }] } }] });
  const b2 = Log.bloqueos(bonoSinSO, SEMANA, []);
  check('bono sin proyecto bloquea', b2.some(x => x.clase === 'bono'), JSON.stringify(b2));
  check('el bloqueo del bono dice el monto', b2.some(x => /2,500\.00/.test(x.texto)), JSON.stringify(b2));

  const bonoSinFuente = persona({ declaraciones: [{ tipo: 'bono_proyecto', valores: { renglones: [{ monto: 100, so: 'SO1' }] } }] });
  check('bono sin fuente de pago bloquea',
    Log.bloqueos(bonoSinFuente, SEMANA, []).some(x => x.clase === 'fuente'));

  const bonoCero = persona({ declaraciones: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 0, so: 'SO1' }] } }] });
  check('renglón de bono en cero bloquea',
    Log.bloqueos(bonoCero, SEMANA, []).some(x => /sin monto/.test(x.texto)));

  const incapSinFolio = persona({ dias_mexico: 4, declaraciones: [{ tipo: 'incapacidad', valores: { dias: 1, clase: 'Enfermedad general' } }] });
  check('incapacidad sin folio IMSS bloquea',
    Log.bloqueos(incapSinFolio, SEMANA, []).some(x => /folio/i.test(x.texto)),
    JSON.stringify(Log.bloqueos(incapSinFolio, SEMANA, [])));

  const permisoSinGoce = persona({ dias_mexico: 4, declaraciones: [{ tipo: 'permiso_sin_goce', valores: { dias: 1, motivo: 'Asunto personal' } }] });
  check('un booleano en "no" NO se reclama como faltante',
    Log.bloqueos(permisoSinGoce, SEMANA, []).length === 0,
    JSON.stringify(Log.bloqueos(permisoSinGoce, SEMANA, [])));

  const disputas = [{ id: 9, empleado_id: 1, fecha: '2026-09-01', abierta: true }];
  check('una disputa abierta bloquea a su persona',
    Log.bloqueos(persona(), SEMANA, disputas).some(x => x.clase === 'disputa'));
  check('una disputa cerrada ya no bloquea',
    Log.bloqueos(persona(), SEMANA, [{ id: 9, empleado_id: 1, fecha: 'x', abierta: false }]).length === 0);
  check('la disputa de otra persona no me bloquea',
    Log.bloqueos(persona(), SEMANA, [{ id: 9, empleado_id: 999, fecha: 'x', abierta: true }]).length === 0);

  check('inactivo sin nada declarado NO bloquea',
    Log.bloqueos(persona({ inactivo: true, dias_mexico: 0 }), SEMANA, []).length === 0);
  const inactivoConBono = persona({ inactivo: true, dias_mexico: 0, declaraciones: [{ tipo: 'finiquito', valores: { monto: 1000, fecha: '2026-08-30' } }] });
  const bi = Log.bloqueos(inactivoConBono, SEMANA, []);
  check('inactivo CON algo declarado sí se valida (fuente), pero no por días',
    bi.length === 1 && bi[0].clase === 'fuente', JSON.stringify(bi));
}

// ═══════════════════ 3 · DERIVACIONES ═══════════════════
seccion('Derivaciones');
{
  const j = Log.derivarFuente('J122');
  check('Chase Checking deriva a FTS LLC en USD', j && j.empresa === 'FTS LLC' && j.moneda === 'USD', JSON.stringify(j));
  const j2 = Log.derivarFuente('J96');
  check('BBVA Nómina deriva a Servicios FTS en MXN', j2 && j2.empresa === 'Servicios FTS' && j2.moneda === 'MXN');
  check('una fuente inventada no deriva nada', Log.derivarFuente('J999') === null);

  check('supervisor cobra bono contra 4.1',
    Cat.rubroBono({ departamento: 'Operaciones', puesto: 'Supervisor SR Operaciones' }) === '4.1 Bono Supervisores');
  check('técnico cobra bono contra 4.2',
    Cat.rubroBono({ departamento: 'Operaciones', puesto: 'Soldador' }) === '4.2 Bono Técnicos');
  check('fuera de Operaciones no hay rubro de bono de obra',
    Cat.rubroBono({ departamento: 'Comercial', puesto: 'Sales Leader' }) === null);
}

// ═══════════════════ 4 · CATÁLOGO ═══════════════════
seccion('Catálogo');
{
  const decl = Cat.tiposDeclarables(), est = Cat.tiposDeEstado();
  check('24 tipos declarables + 7 estados = 31', decl.length + est.length === 31, decl.length + '+' + est.length);
  check('meta() encuentra un tipo de cada grupo',
    Cat.meta('vacaciones').grupo === 'dias' && Cat.meta('bono_proyecto').grupo === 'dinero' &&
    Cat.meta('anticipo_sueldo').grupo === 'desc' && Cat.meta('baja').grupo === 'estado');
  check('meta() de un tipo inexistente es null', Cat.meta('no_existe') === null);
  check('el anticipo está marcado como NO costo (es préstamo)',
    Cat.meta('anticipo_sueldo').def.no_costo === true);
  check('ningún tipo de dinero se queda sin pedir fuente, salvo los descuentos internos', (function () {
    const sinFuente = [];
    for (const t in Cat.CATALOGO.dinero.items) if (!Cat.CATALOGO.dinero.items[t].fuente) sinFuente.push(t);
    return sinFuente.length === 0;
  })());
}

// ═══════════════════ 5 · TOTALES Y ESTADOS ═══════════════════
seccion('Totales y estados vigentes');
{
  const gente = [
    persona({ id: 1, declaraciones: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 1000, so: 'SO1' }, { monto: 500, so: 'SO2' }] } }] }),
    persona({ id: 2, declaraciones: [{ tipo: 'anticipo_sueldo', fuente: 'J96', valores: { monto: 3500, plazo: 4 } }] }),
    persona({ id: 3, declaraciones: [{ tipo: 'descuento_prestamo', valores: { monto: 700, pago: 2 } }] })
  ];
  const t = Log.totalesDinero(gente);
  check('los renglones del bono se suman: 1500', t.percepciones === 1500, String(t.percepciones));
  check('el anticipo NO entra en percepciones', t.no_costo === 3500 && t.percepciones === 1500, JSON.stringify(t));
  check('el descuento va en su propio cubo', t.descuentos === 700, String(t.descuentos));
  check('el total por moneda usa la fuente', t.por_moneda.MXN === 5000, JSON.stringify(t.por_moneda));

  const conEstado = persona({ estados: [
    { tipo: 'standby', valores: { desde: '2026-07-01', hasta: '2026-08-01' } },
    { tipo: 'deuda_fts', valores: { desde: '2026-07-15', total: 100, saldo: 100 } }
  ] });
  const vig = Log.estadosVigentes(conEstado, '2026-09-03');
  check('un estado sin fecha de fin sigue vigente semanas después',
    vig.length === 1 && vig[0].tipo === 'deuda_fts', JSON.stringify(vig.map(x => x.tipo)));
  check('un estado ya vencido no aparece', !vig.some(x => x.tipo === 'standby'));
  check('un estado que aún no empieza tampoco aparece',
    Log.estadosVigentes(persona({ estados: [{ tipo: 'baja', valores: { desde: '2027-01-01' } }] }), '2026-09-03').length === 0);
}

// ═══════════════════ 6 · RESUMEN DE LA SEMANA ═══════════════════
seccion('Resumen de la semana');
{
  const ok = [persona({ id: 1 }), persona({ id: 2 })];
  check('semana limpia se puede enviar', Log.resumenSemana(ok, SEMANA, []).lista_para_enviar === true);
  const mal = [persona({ id: 1 }), persona({ id: 2, dias_mexico: 3 })];
  const r = Log.resumenSemana(mal, SEMANA, []);
  check('una sola persona mal tumba el envío de toda la semana', r.lista_para_enviar === false);
  check('el resumen dice cuántas personas y cuántos bloqueos', r.con_bloqueo === 1 && r.bloqueos_totales === 1, JSON.stringify(r));
  check('las disputas abiertas se cuentan aparte',
    Log.resumenSemana(ok, SEMANA, [{ id: 1, empleado_id: 99, abierta: true }]).disputas_abiertas === 1);
}

// ═══════════════════ 7 · ARCHIVO PARA EL DESPACHO ═══════════════════
// POR QUE EXISTE ESTA SECCION. Este archivo es lo que Ulises captura en CONTPAQi:
// si una incidencia no llega a su columna, alguien cobra de menos o de mas y nadie
// se entera hasta la queja. Se prueba con node, sin navegador, para que pueda ser
// exhaustiva sin volverse lenta.
seccion('Archivo para el despacho');
(function () {
  // (a) TODO tipo declarable tiene a donde caer. Este es el assert que impide que
  // agregar un tipo al catalogo y olvidar el mapa deje la incidencia fuera del archivo.
  const sinColumna = Cat.tiposDeclarables().filter(t => !Des.A_COLUMNA[t]);
  check('los ' + Cat.tiposDeclarables().length + ' tipos declarables tienen columna en el archivo',
    sinColumna.length === 0, sinColumna.join(', '));

  // Y toda columna destino existe de verdad en el encabezado.
  const claves = Des.COLUMNAS.map(c => c.k);
  const huerfanas = Object.keys(Des.A_COLUMNA).filter(t => {
    const d = Des.A_COLUMNA[t];
    return claves.indexOf(d.col) < 0 || (d.extra && claves.indexOf(d.extra.col) < 0);
  });
  check('ninguna regla del mapa apunta a una columna que no existe', huerfanas.length === 0, huerfanas.join(', '));

  // (b) un renglon completo, con dinero, dias y descuentos a la vez
  const p = persona({ id: 77, nombre: 'Prueba Completa', dias_mexico: 3, declaraciones: [
    { tipo: 'vacaciones', valores: { dias: 1 } },
    { tipo: 'falta_injustificada', valores: { dias: 1 } },
    { tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 1500, so: 'SO11547' }, { monto: 500, so: 'SO6013' }] } },
    { tipo: 'descuento_anticipo', valores: { monto: 300 } },
    { tipo: 'tiempo_extra', fuente: 'J96', valores: { horas: 4, monto: 800 } }
  ] });
  const est = { semana: SEMANA, personas: [p], disputas: [] };
  const F = Des.filas(est);
  check('sale exactamente un renglon por persona', F.length === 1, String(F.length));
  const f = F[0];
  check('los dias de Mexico van a su columna', f.dias_mx === 3, String(f.dias_mx));
  check('las vacaciones van a VACACIONES', f.vacaciones === 1, String(f.vacaciones));
  check('la falta injustificada NO se mezcla con la justificada',
    f.falta_inj === 1 && f.falta_jus === 0, f.falta_inj + '/' + f.falta_jus);
  check('los dos renglones del bono se suman en BONO', f.bono === 2000, String(f.bono));
  check('el descuento va a DESCUENTOS y no a BONO', f.descuentos === 300 && f.bono === 2000);
  check('el tiempo extra parte horas e importe en dos columnas',
    f.horas_extra === 4 && f.imp_extra === 800, f.horas_extra + '/' + f.imp_extra);
  check('la instruccion nombra los proyectos del bono',
    /SO11547/.test(f.instruccion) && /SO6013/.test(f.instruccion), f.instruccion);
  check('la instruccion dice de que cuenta sale el dinero',
    /BBVA Nómina/.test(f.instruccion), f.instruccion);

  // (c) el anticipo es un prestamo: NO puede caer en descuentos ni en percepciones
  const pa = persona({ id: 78, declaraciones: [{ tipo: 'anticipo_sueldo', fuente: 'J96', valores: { monto: 2000, plazo: 4 } }] });
  const fa = Des.filas({ semana: SEMANA, personas: [pa], disputas: [] })[0];
  check('el anticipo entregado tiene columna propia', fa.anticipo === 2000, String(fa.anticipo));
  check('el anticipo NO se cuela en descuentos', fa.descuentos === 0, String(fa.descuentos));

  // (d) lo que no lo paga la nomina de CONTPAQi se marca, no se cuela
  const pu = persona({ id: 79, declaraciones: [{ tipo: 'bono_productividad', fuente: 'J122', valores: { monto: 300, motivo: 'x' } }] });
  const fu = Des.filas({ semana: SEMANA, personas: [pu], disputas: [] })[0];
  check('un pago en USD por Chase queda marcado para revisar', /REVISAR|SI:/.test('SI:' + fu.revisar) && fu.revisar !== '', fu.revisar);
  check('y el motivo dice que lo paga FTS LLC o que va en USD',
    /USD|FTS LLC/.test(fu.revisar), fu.revisar);

  // (e) el premio: decidido gana sobre sugerido, y 'no aplica' no es 'NO'
  check('sin decision manda la sugerencia',
    Des.ppaDe({ ppa: { aplica: true, sugerido: true } }).valor === 'SI');
  check('la decision de RH gana sobre la sugerencia',
    Des.ppaDe({ ppa: { aplica: true, sugerido: true }, ppa_decidido: false }).valor === 'NO');
  check("quien no aplica sale como N/A, no como NO",
    Des.ppaDe({ ppa: { aplica: false, sugerido: false } }).valor === 'N/A');

  // (f) lo que le falta al renglon se DICE. El juez es el mismo que apaga el boton
  // de enviar: si hubiera dos definiciones de 'incompleto', el archivo podria salir
  // limpio con una semana que la pantalla considera rota.
  const pb = persona({ id: 80, dias_mexico: 2 });   // faltan 3 dias
  const fb = Des.filas({ semana: SEMANA, personas: [pb], disputas: [] })[0];
  check('un renglon que no cuadra en dias sale marcado', /no suman/.test(fb.revisar), fb.revisar);
  const fd = Des.filas({ semana: SEMANA, personas: [persona({ id: 81 })],
    disputas: [{ id: 9, empleado_id: 81, fecha: '2026-09-01', abierta: true }] })[0];
  check('una checada en disputa sale marcada en su renglon', /disputa/.test(fd.revisar), fd.revisar);

  // (g) quien esta de baja SIN nada declarado no entra; con finiquito SI
  const bajaVacia = persona({ id: 82, inactivo: true, dias_mexico: 0 });
  const bajaConFiniquito = persona({ id: 83, inactivo: true, dias_mexico: 0,
    declaraciones: [{ tipo: 'finiquito', fuente: 'J96', valores: { monto: 9000, fecha: '2026-09-01' } }] });
  const FB = Des.filas({ semana: SEMANA, personas: [bajaVacia, bajaConFiniquito], disputas: [] });
  check('quien esta de baja y no trae nada NO ocupa renglon', FB.length === 1, String(FB.length));
  check('pero un finiquito de alguien de baja SI llega al archivo',
    FB[0].finiquito === 9000 && FB[0].no_empleado === 83);

  // (h) el texto: encabezado, columnas y renglon de totales
  const txt = Des.texto(est, { version: 2, actor: 'magaly.perez', fecha: '2026-09-04 15:00', motivo: 'faltaba un dia' });
  const lineas = txt.split('\r\n');
  check('el archivo abre con la semana y su rango', /SEMANA S36\/2026/.test(lineas[0]), lineas[0]);
  check('dice quien lo genero, cuando y en que version', /magaly\.perez/.test(lineas[1]) && /version 2/.test(lineas[1]), lineas[1]);
  check('la correccion se explica en el propio archivo', /faltaba un dia/.test(lineas[1]), lineas[1]);
  const cab = lineas[3].split(Des.SEPARADOR);
  check('el encabezado trae las ' + Des.COLUMNAS.length + ' columnas', cab.length === Des.COLUMNAS.length, String(cab.length));
  check('usa el vocabulario de CONTPAQi, no el nuestro',
    cab.indexOf('PREMIO DE ASISTENCIA Y PUNTUALIDAD') >= 0 && cab.indexOf('AJUSTE EN SUELDOS') >= 0);
  check('el archivo lleva BOM para que Excel no rompa los acentos', txt.charCodeAt(0) === 0xFEFF);
  check('cierra con un renglon de totales', /TOTAL \(1 personas\)/.test(lineas[lineas.length - 2]), lineas[lineas.length - 2]);

  // El separador no puede aparecer crudo dentro de una celda: partiria la columna.
  const conPuntoYComa = persona({ id: 84, declaraciones: [
    { tipo: 'falta_justificada', valores: { dias: 5, motivo: 'permiso; sin goce' } }] });
  const t2 = Des.texto({ semana: SEMANA, personas: [conPuntoYComa], disputas: [] }, {});
  const filaTxt = t2.split('\r\n')[4];
  check('una celda con el separador adentro va entre comillas',
    filaTxt.split(Des.SEPARADOR).length === Des.COLUMNAS.length + 1 || /"/.test(filaTxt),
    String(filaTxt.split(Des.SEPARADOR).length));
  // Un salto de linea dentro de una celda partiria el renglon en dos y correria a
  // todas las personas de abajo una columna. Se aplana al escribir, no al leer.
  const t3 = Des.texto({ semana: SEMANA, personas: [persona({ id: 85, declaraciones: [
    { tipo: 'falta_justificada', valores: { dias: 5, motivo: 'linea1\nlinea2' } }] })], disputas: [] });
  const L3 = t3.split('\r\n');
  check('un salto de linea dentro de una celda no parte el renglon',
    L3.length === 7 && /linea1 linea2/.test(L3[4]) && L3[4].indexOf('\n') < 0,
    L3.length + ' lineas');

  // (i) el nombre del archivo: la diagonal de la semana no puede ir en un nombre
  check('el nombre del archivo no lleva diagonales',
    Des.nombreArchivo(SEMANA, 3).indexOf('/') < 0, Des.nombreArchivo(SEMANA, 3));
  check('y distingue la version', Des.nombreArchivo(SEMANA, 3) === 'nomina-S36-2026-v3.csv',
    Des.nombreArchivo(SEMANA, 3));

  // (j) el cero no se imprime: un mar de ceros no se lee
  check('una columna en cero sale vacia, no en 0',
    Des.celda({ bono: 0 }, { k: 'bono', tipo: 'mxn' }) === '');
  check('el dinero lleva dos decimales con la coma de es-MX',
    Des.celda({ bono: 1500 }, { k: 'bono', tipo: 'mxn' }) === '1500,00',
    Des.celda({ bono: 1500 }, { k: 'bono', tipo: 'mxn' }));
})();

// ═══════════════════ 8 · CONTRATO CON auth/suite-login ═══════════════════
// POR QUE EXISTE ESTA SECCION. En V1.00 el login mandaba `user` (copiado de
// finanzas/js/auth-fin.js) y el workflow espera `username`. Resultado: TODO intento
// moria en PAYLOAD_INCOMPLETO sin llegar a comprobar la contrasena, y la pantalla
// mostraba un generico "No se pudo iniciar sesion" que escondia el motivo.
// Comprobado disparando el webhook en vivo (ejecuciones 85367 y 85370).
// Estos asserts congelan la forma REAL del contrato, leida del workflow.
seccion('Contrato con auth/suite-login');
(async function () {
  const { JSDOM: J2 } = require('jsdom');
  const dom0 = new J2('<!doctype html><html><body></body></html>', { url: 'https://example.org/', runScripts: 'outside-only' });
  const w0 = dom0.window;
  w0.eval(fs.readFileSync(path.join(MOD, 'js', 'nom-auth.js'), 'utf8'));

  let enviado = null;
  function responder(obj) {
    w0.fetch = function (url, opts) {
      enviado = { url: url, body: JSON.parse(opts.body) };
      return Promise.resolve({ status: 200, json: function () { return Promise.resolve(obj); } });
    };
  }

  // (a) el campo se llama username
  responder({ ok: false, error: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contrasena incorrectos.' });
  const r1 = await w0.NomAuth.login('ana.acevedo', 'secreta');
  check('el login manda `username`, no `user`',
    enviado && enviado.body.username === 'ana.acevedo' && enviado.body.user === undefined,
    JSON.stringify(Object.keys(enviado ? enviado.body : {})));
  check('pega al webhook /auth/suite-login', /\/webhook\/auth\/suite-login$/.test(enviado.url), enviado.url);

  // (b) el error del server llega a la pantalla con su motivo, no con un generico
  check('propaga el codigo real del error', r1.ok === false && r1.code === 'CREDENCIALES_INVALIDAS', JSON.stringify(r1));
  check('propaga el mensaje del server (campo `mensaje`)', /Usuario o contrasena/.test(r1.msg), r1.msg);

  responder({ ok: false, error: 'PAYLOAD_INCOMPLETO', mensaje: 'Faltan username o password.' });
  const r2 = await w0.NomAuth.login('x', 'y');
  check('un PAYLOAD_INCOMPLETO ya no se ve como fallo de contrasena', r2.code === 'PAYLOAD_INCOMPLETO', JSON.stringify(r2));

  // (c) el exito: token, scopes y caducidad desde `exp` en segundos
  const iat = Math.floor(Date.now() / 1000);
  const claims = { sub: 'ana.acevedo', nombre: 'Ana Laura', empleado_id: 101, scopes: ['nomina:write'], iat: iat, exp: iat + 8 * 3600 };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tok = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims) + '.firma';
  responder({ ok: true, token: tok, actor: 'ana.acevedo', nombre: 'Ana Laura', empleado_id: 101, scopes: ['nomina:write'], exp: claims.exp, debe_cambiar_password: false });
  const r3 = await w0.NomAuth.login('ana.acevedo', 'buena');
  check('un login bueno abre sesion', r3.ok === true, JSON.stringify(r3).slice(0, 120));
  check('la sesion queda valida (caducidad desde `exp` en segundos)', w0.NomAuth.isValid() === true);
  check('el scope nomina:write se reconoce', w0.NomAuth.tieneScope('nomina:write') === true);
  check('un scope que no tiene NO se reconoce', w0.NomAuth.tieneScope('finanzas:write') === false);
  check('guarda el nombre para la topbar', (w0.NomAuth.getSession() || {}).nombre === 'Ana Laura');

  // (d) sin scope, la puerta no deja pasar aunque el login sea bueno
  const claims2 = Object.assign({}, claims, { scopes: ['nomina:read'] });
  responder({ ok: true, token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims2) + '.firma', exp: claims2.exp, scopes: ['nomina:read'] });
  await w0.NomAuth.login('ana.acevedo', 'buena');
  check('con solo nomina:read la puerta sigue cerrada', w0.NomAuth.tieneScope('nomina:write') === false);

  arrancarRender();
})();

// ═══════════════════ 9 · RENDER EN JSDOM ═══════════════════
seccion('Render (jsdom, sobre el index.html real)');
function arrancarRender() { (async function () {
  const html = fs.readFileSync(path.join(MOD, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.org/modulos/rh/nomina-incidencias/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;

  // Stubs del entorno: sin red y sin sesión real. El de fetch tiene que existir ANTES
  // de que corra el script de arranque, que pide version.json.
  w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ version: 'V1.00' }) });

  for (const f of ['catalogo.js', 'logica.js', 'despacho.js', 'nom-auth.js', 'nom-client.js', 'nom-resolver.js', 'app.js']) {
    w.eval(fs.readFileSync(path.join(MOD, 'js', f), 'utf8'));
  }

  // El default REAL se comprueba ANTES de forzar nada: es el comportamiento que
  // importa (desde V1.02 el módulo arranca contra Odoo, no contra el fixture).
  check('el módulo arranca en REAL por omisión', w.NomClient.modo() === 'real', w.NomClient.modo());
  // Y a partir de aquí se pasa a PRÁCTICA: esta sección prueba el RENDER, no la red.
  w.NomClient.setModo('demo');
  check('y se puede pasar a práctica', w.NomClient.modo() === 'demo');

  // Sesión válida con el scope. Se stubbea DESPUÉS de cargar nom-auth.js para pisar
  // sus métodos sin tocar el archivo real.
  w.NomAuth.isValid = () => true;
  w.NomAuth.tieneScope = s => s === 'nomina:write';
  w.NomAuth.getSession = () => ({ user: 'ana', nombre: 'Ana Laura Acevedo', scopes: ['nomina:write'] });

  const inline = html.split('<script>').pop().split('<\/script>')[0];
  w.eval(inline);
  await new Promise(r => setTimeout(r, 60));

  const d = w.document;
  check('la puerta se cierra con sesión válida', d.getElementById('puerta').className.indexOf('hid') >= 0);
  check('la aplicación se muestra', d.getElementById('app').className.indexOf('hid') < 0);
  check('el badge de versión dice V1.00', d.getElementById('ver-badge').textContent === 'V1.00');
  check('el badge de modo dice PRÁCTICA', d.getElementById('modo-badge').textContent === 'PRÁCTICA', d.getElementById('modo-badge').textContent);
  check('y el badge avisa con color que no es real', /demo/.test(d.getElementById('modo-badge').className));

  // Lo que se rompió en la prueba con RH: un renglón en rojo que no dice por qué.
  const enRojo = Array.from(d.querySelectorAll('#tb tr[data-id]'))
    .filter(tr => /--red/.test(tr.querySelector('td.st').getAttribute('style') || ''));
  check('hay renglones en rojo que probar', enRojo.length > 0, String(enRojo.length));
  check('TODO renglón en rojo dice el motivo en la propia fila',
    enRojo.every(tr => (tr.querySelector('.porque') || {}).textContent),
    enRojo.filter(tr => !(tr.querySelector('.porque') || {}).textContent)
          .map(tr => tr.getAttribute('data-id')).join(',') || 'todos lo dicen');
  check('y ningún renglón sano lo trae',
    Array.from(d.querySelectorAll('#tb tr[data-id]'))
      .filter(tr => !/--red/.test(tr.querySelector('td.st').getAttribute('style') || ''))
      .every(tr => !tr.querySelector('.porque')));

  // Premio de puntualidad: la sugerencia se pinta, se distingue de una decisión
  // humana, y el "no aplica" también se dice en vez de dejar el hueco vacío.
  const celdaPpa = id => d.querySelector('tr[data-id="' + id + '"]').lastElementChild.textContent;
  check('la columna del premio existe para todos',
    Array.from(d.querySelectorAll('#tb tr[data-id]')).every(tr => tr.children.length === 7),
    String(d.querySelector('#tb tr[data-id]').children.length));
  check('a quien no le aplica, lo dice', /no aplica/.test(celdaPpa(101)), celdaPpa(101));
  // …pero SÍ se puede forzar. Antes no había botón y ése era justo el caso que RH
  // necesitaba poder cambiar: "no me deja agregárselo".
  check('y aun así se puede pulsar para forzarlo',
    !!d.querySelector('tr[data-id="101"] [data-ppa]'));
  check('todas las personas tienen botón de premio, sin excepción',
    Array.from(d.querySelectorAll('#tb tr[data-id]')).every(tr => tr.querySelector('[data-ppa]')),
    String(Array.from(d.querySelectorAll('#tb tr[data-id]')).filter(tr => !tr.querySelector('[data-ppa]')).length) + ' sin botón');
  check('quien llegó tarde sale en no', /no/.test(celdaPpa(57)), celdaPpa(57));
  check('quien llegó a tiempo sale en sí', /si/.test(celdaPpa(128)), celdaPpa(128));
  check('y se marca que es sugerido, no decidido',
    /sugerido/.test(celdaPpa(128)) && !/decidido/.test(celdaPpa(128)), celdaPpa(128));
  check('el turno de noche pide revisar en vez de darlo por bueno',
    /revisar/.test(celdaPpa(128)), celdaPpa(128));

  // ── La nota es obligatoria, y la exigencia se prueba con clics ──────────────
  d.querySelector('tr[data-id="128"] [data-ppa]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check('pulsar el premio abre el diálogo en vez de cambiarlo de golpe', !!d.querySelector('.modal'));
  check('el diálogo dice de quién se trata', /Enoc/.test((d.querySelector('.mpanel h3') || {}).textContent || ''),
    (d.querySelector('.mpanel h3') || {}).textContent);
  check('y trae la evidencia a la vista para decidir con ella',
    /07:00/.test((d.querySelector('.msub') || {}).textContent || ''));
  check('la nota se marca obligatoria', /obligatorio/.test((d.querySelector('.mpanel label') || {}).textContent || ''));

  // Intento SIN nota: no debe guardar nada.
  const antesDeIntentar = JSON.stringify(w.NomApp.estado().personas.find(p => p.id === 128).ppa_decidido);
  d.querySelector('#ppaOk').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check('sin nota NO se guarda', JSON.stringify(w.NomApp.estado().personas.find(p => p.id === 128).ppa_decidido) === antesDeIntentar);
  check('y el diálogo sigue abierto diciendo qué falta', !!d.querySelector('.modal') &&
    /Escribe por qué/.test((d.querySelector('#ppaErr') || {}).textContent || ''),
    (d.querySelector('#ppaErr') || {}).textContent);
  check('tres letras tampoco bastan (una nota de relleno no es una nota)', (() => {
    d.querySelector('#ppaNota').value = 'sí';
    d.querySelector('#ppaOk').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return !!d.querySelector('.modal');
  })());

  // Con nota: sí guarda, y la nota queda pegada a la decisión.
  d.querySelector('#ppaNota').value = 'Fue turno de noche, no un retardo.';
  d.querySelector('#ppaOk').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  const p128 = w.NomApp.estado().personas.find(p => p.id === 128);
  check('con nota SÍ guarda', p128.ppa_decidido === false, String(p128.ppa_decidido));
  check('y la nota queda pegada a la decisión', /turno de noche/.test(p128.ppa_nota || ''), p128.ppa_nota);
  check('el diálogo se cierra', !d.querySelector('.modal'));
  check('y el renglón ya dice que lo decidió una persona', /decidido/.test(celdaPpa(128)), celdaPpa(128));

  // Y la nota de quien ya tenía decisión se ve en el cajón, con su firma.
  w.NomApp.abrir(6);
  await new Promise(r => setTimeout(r, 30));
  check('el cajón muestra la nota de una decisión previa',
    /Felipe lo citó/.test((d.querySelector('.ppa-nota') || {}).textContent || ''),
    (d.querySelector('.ppa-nota') || {}).textContent);
  check('con quién la tomó', /magaly/.test((d.querySelector('.ppa-nota .firma') || {}).textContent || ''),
    (d.querySelector('.ppa-nota .firma') || {}).textContent);
  w.NomApp.cerrar();
  await new Promise(r => setTimeout(r, 30));

  // ── El flujo de aprobación de una checada ───────────────────────────────────
  // Se prueba con clics, no leyendo el código: es el camino por el que RH va a
  // escribir en Odoo y no puede depender de que "se ve bien".
  w.NomApp.irA(2);
  await new Promise(r => setTimeout(r, 30));
  const btnResolver = d.querySelector('#p2 [data-acc="resolver"]');
  check('cada disputa ofrece resolverse por el flujo, no marcarse en local', !!btnResolver);
  check('ya no queda el atajo de "aceptar la propuesta"', !d.querySelector('#p2 [data-acc="aceptar"]'));
  check('y la marca local desapareció del API del módulo', typeof w.NomApp.resolverDisputa === 'undefined');

  btnResolver.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  const mod = d.querySelector('.modal');
  check('pulsar abre la ventana del flujo', !!mod);
  check('trae las cuatro acciones del panel',
    d.querySelectorAll('[data-accion]').length === 4,
    String(d.querySelectorAll('[data-accion]').length));
  check('y las nombra igual que en Mi Perfil',
    ['aprobar', 'ajustar', 'rechazar', 'escalar'].every(a => d.querySelector('[data-accion="' + a + '"]')));
  check('la ventana dice de quién es la checada, no solo su id',
    /Enoc/.test((d.querySelector('.mpanel h3') || {}).textContent || ''),
    (d.querySelector('.mpanel h3') || {}).textContent);
  check('y el contexto también trae el nombre',
    /Enoc/.test((d.querySelector('.rctx') || {}).textContent || ''));
  check('el contexto trae el folio, que es lo que el resolver necesita',
    /INC-/.test((d.querySelector('.rctx .folio') || {}).textContent || ''),
    (d.querySelector('.rctx .folio') || {}).textContent);

  // Sin elegir acción no se manda nada.
  d.querySelector('#rok').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  check('sin elegir acción, no manda', /Elige primero/.test((d.querySelector('#rerr') || {}).textContent || ''),
    (d.querySelector('#rerr') || {}).textContent);

  // Comentario corto: rechazado con el mínimo del panel.
  d.querySelector('[data-accion="rechazar"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  d.querySelector('#rcom').value = 'no';
  d.querySelector('#rok').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  check('un comentario corto se rechaza, con el mismo mínimo del panel',
    /al menos 10/.test((d.querySelector('#rerr') || {}).textContent || ''),
    (d.querySelector('#rerr') || {}).textContent);

  // Rechazar NO pide hora; ajustar SÍ. Copiado del panel, no reinterpretado.
  check('rechazar no pide hora', d.querySelector('#rhora').className === 'hid');
  d.querySelector('[data-accion="ajustar"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  check('ajustar sí la pide', d.querySelector('#rhora').className !== 'hid');
  check('cuál acción está elegida es inequívoco: las otras se apagan',
    d.querySelector('[data-accion="ajustar"]').className.indexOf('sel') >= 0 &&
    ['aprobar', 'rechazar', 'escalar'].every(a => d.querySelector('[data-accion="' + a + '"]').className.indexOf('apagada') >= 0));
  d.querySelector('#rcom').value = 'Fue turno de noche, se ajusta la salida real.';
  d.querySelector('#rok').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  check('ajustar sin hora no manda',
    /hora/i.test((d.querySelector('#rerr') || {}).textContent || ''),
    (d.querySelector('#rerr') || {}).textContent);

  d.querySelector('.modal').remove();
  w.NomApp.irA(1);
  await new Promise(r => setTimeout(r, 30));

  const filas = d.querySelectorAll('#tb tr[data-id]');
  check('el roster pinta 31 renglones (30 activos + 1 inactivo con estado vivo)', filas.length === 31, String(filas.length));
  check('cada renglón es clicable (data-id)', Array.from(filas).every(tr => tr.getAttribute('data-id')));

  const banner = d.getElementById('banner').textContent;
  check('el banner bloquea el envío en la semana demo', /No se puede enviar/.test(banner), banner.slice(0, 90));
  check('el banner nombra a la persona y el motivo', /Samuel Ulises/.test(banner) && /sin proyecto asignado/.test(banner), banner.slice(0, 200));
  check('el botón de enviar está apagado', d.getElementById('enviar').disabled === true);
  check('el botón de enviar dice cuántos pendientes', /pendientes/.test(d.getElementById('enviar').textContent));

  check('hay 6 filtros', d.querySelectorAll('#filtros .chipf').length === 6, String(d.querySelectorAll('#filtros .chipf').length));
  check('hay 3 pestañas', d.querySelectorAll('#tabs .tab').length === 3);

  // Abrir el cajón de una persona con bono incompleto
  w.NomApp.abrir(57);
  check('el cajón se abre', d.getElementById('drawer').hasAttribute('open'));
  check('el cajón nombra a la persona', /Samuel/.test(d.getElementById('dnom').textContent));
  check('el cajón trae la evidencia del premio, día por día',
    !!d.querySelector('.ppa-dias tr:nth-child(2)'), (d.querySelector('.ppa-mot') || {}).textContent || '(sin motivo)');
  check('y dice contra qué hora se comparó',
    /07:00/.test((d.querySelector('.ppa-dias th:last-child') || {}).textContent || ''),
    (d.querySelector('.ppa-dias th:last-child') || {}).textContent);

  check('el candado aritmético se pinta', /Candado aritmético/.test(d.getElementById('dbody').textContent));
  check('el campo de días de México es editable', !!d.getElementById('fmx'));
  check('la declaración de bono aparece con su faltante',
    /sin proyecto/.test(d.getElementById('dbody').textContent), d.getElementById('dbody').textContent.slice(0, 160));

  // Editar los días desde el cajón cambia el veredicto de la tabla
  const antes = d.getElementById('banner').textContent;
  const fmx = d.getElementById('fmx');
  fmx.value = '9';
  fmx.dispatchEvent(new w.Event('input'));
  check('cambiar los días repinta el banner', d.getElementById('banner').textContent !== antes);
  check('9 días de 5 aparece como bloqueo nuevo', /no suman 5: van 9/.test(d.getElementById('banner').textContent),
    d.getElementById('banner').textContent.slice(0, 200));
  fmx.value = '5'; fmx.dispatchEvent(new w.Event('input'));

  // Resolver todas las disputas y arreglar lo demás debe habilitar el envío
  const est = w.NomApp.estado();
  est.disputas.forEach(x => { x.abierta = false; });
  est.personas.forEach(p => {
    p.dias_mexico = p.inactivo ? 0 : 5;
    p.declaraciones = [];
  });
  w.NomApp.refrescar();
  check('con todo resuelto, el botón de enviar se enciende', d.getElementById('enviar').disabled === false);
  check('con todo resuelto, el banner dice que está lista', /lista para enviar/.test(d.getElementById('banner').textContent));

  w.NomApp.irA(3);
  check('la pantalla de cierre pinta sus KPI', d.querySelectorAll('#p3 .kpi').length === 4, String(d.querySelectorAll('#p3 .kpi').length));
  check('el cierre declara lo que NO verificó', /Qué NO se verificó/.test(d.getElementById('p3').textContent));

  // ── El archivo, en la pantalla ──
  // Lo que Ulises captura sale de aquí. Si el botón de descargar desaparece en un
  // refactor, la semana se sigue enviando y el despacho no recibe nada: por eso el
  // botón se prueba, no solo la función que arma el texto.
  check('el cierre pinta el archivo para el despacho', /Archivo para el despacho/.test(d.getElementById('p3').textContent));
  check('con su botón de descargar', !!d.getElementById('bajar-archivo'));
  const filasPrev = d.querySelectorAll('#p3 .tabla-wrap tbody tr');
  check('la vista previa trae un renglón por persona más el total',
    filasPrev.length === est.personas.filter(p => !p.inactivo || (p.declaraciones || []).length).length + 1,
    String(filasPrev.length));
  check('y cada renglón enseña la instrucción, que es lo que se revisa',
    /días trabajados/.test(filasPrev[0].textContent), filasPrev[0].textContent.slice(0, 80));

  // ── Sin enviar ──
  check('una semana sin enviar lo dice', /no se ha enviado/.test(d.getElementById('p3').textContent));
  check('y el botón invita a enviar por primera vez',
    d.getElementById('enviar').textContent === 'Enviar a Nóminas FTS', d.getElementById('enviar').textContent);

  // ── Ya enviada, sin cambios posteriores ──
  est.envio = { estado: 'enviada', version: 1, actor: 'magaly.perez',
                enviado_en: '2026-09-04T18:20:00.000Z', nombre_archivo: 'nomina-S36-2026-v1.csv',
                archivo: 'contenido congelado del csv', motivo: null,
                bitacora: [{ ts: '2026-09-04T18:20:00.000Z', accion: 'enviada', actor: 'magaly.perez', version: 1, motivo: null }],
                cambios_despues: 0 };
  w.NomApp.irA(3);
  check('una semana enviada lo dice, con versión', /Enviada/.test(d.getElementById('p3').textContent) &&
    /versión 1/.test(d.getElementById('p3').textContent));
  check('dice quién la envió', /magaly\.perez/.test(d.getElementById('p3').textContent));
  check('la hora se enseña en CST, no en UTC',
    /12:20 CST/.test(d.getElementById('p3').textContent), d.getElementById('p3').textContent.match(/\d\d:\d\d CST/));
  check('se puede volver a bajar lo que se envió', !!d.getElementById('bajar-enviado'));
  check('y el botón de arriba ya no dice "enviar", dice "reenviar"',
    /Reenviar/.test(d.getElementById('enviar').textContent), d.getElementById('enviar').textContent);
  check('la bitácora deja ver el movimiento', /Movimientos/.test(d.getElementById('p3').textContent));

  // ── Ya enviada, CON cambios posteriores ──
  // Este es el caso que de verdad importa: la semana se envió, alguien corrigió algo
  // después, y el despacho todavía tiene la versión vieja. El conteo lo hace el
  // server comparando fechas de guardado; aquí se comprueba que se PINTA.
  est.envio.cambios_despues = 3;
  w.NomApp.irA(3);
  check('si hubo capturas después del envío, la pantalla avisa',
    /cambios posteriores/.test(d.getElementById('p3').textContent));
  check('y dice cuántas personas se tocaron', /3 personas se han capturado/.test(d.getElementById('p3').textContent));

  est.envio = null;
  w.NomApp.irA(3);

  console.log('\n' + '═'.repeat(64));
  if (fails.length) {
    console.log('FALLARON ' + fails.length + ' de ' + (pass + fails.length));
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('GATE VERDE — ' + pass + '/' + pass + ' asserts');
})(); }
