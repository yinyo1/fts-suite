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

  const permisoSinGoce = persona({ dias_mexico: 4, declaraciones: [{ tipo: 'permiso', valores: { dias: 1 } }] });
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
  check('19 tipos declarables + 7 estados = 26', decl.length + est.length === 26, decl.length + '+' + est.length);
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

// ═══════════════════ 7 · CONTRATO CON auth/suite-login ═══════════════════
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

// ═══════════════════ 8 · RENDER EN JSDOM ═══════════════════
seccion('Render (jsdom, sobre el index.html real)');
function arrancarRender() { (async function () {
  const html = fs.readFileSync(path.join(MOD, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.org/modulos/rh/nomina-incidencias/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;

  // Stubs del entorno: sin red y sin sesión real. El de fetch tiene que existir ANTES
  // de que corra el script de arranque, que pide version.json.
  w.fetch = () => Promise.resolve({ json: () => Promise.resolve({ version: 'V1.00' }) });

  for (const f of ['catalogo.js', 'logica.js', 'nom-auth.js', 'nom-client.js', 'app.js']) {
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

  console.log('\n' + '═'.repeat(64));
  if (fails.length) {
    console.log('FALLARON ' + fails.length + ' de ' + (pass + fails.length));
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('GATE VERDE — ' + pass + '/' + pass + ' asserts');
})(); }
