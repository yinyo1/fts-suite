#!/usr/bin/env node
// Fase B (#448): reglas del kiosko USA y su almacén (nomina_usa_0002).
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const R = require('../../shared/nomina-usa/kiosko.js');

seccion('País de la checada');
check('región USA → USA', R.clasificarPais({ zona: 'usa', pais: 'US' }) === 'USA');
check('sitio de Monterrey → MX', R.clasificarPais({ zona: 'sitio', pais: null, autorizado: true }) === 'MX');
check('fuera de zona en México (NO_US) → MX', R.clasificarPais({ zona: 'fuera', pais: 'NO_US' }) === 'MX');
check('sin ubicación → null (hay que preguntar)', R.clasificarPais({ zona: 'fuera', pais: null }) === null);
check('contorno no cargó → null', R.clasificarPais({ zona: 'fuera', pais: null, region_error: 'X' }) === null);

seccion('Qué flujo corre');
const ON = { activo: true }, OFF = { activo: false };
const MATEO = { perfil: 'so_entrada', activo: true }, RICH = { perfil: 'plan_avance', activo: true };
check('Mateo desde Texas, entrada → so_entrada', R.flujo(ON, MATEO, 'entrada', 'USA') === 'so_entrada');
check('Mateo desde Monterrey → mx (normal)', R.flujo(ON, MATEO, 'entrada', 'MX') === 'mx');
check('Mateo sin ubicación → pregunta país', R.flujo(ON, MATEO, 'entrada', null) === 'pregunta_pais');
check('Mateo salida en USA → flujo normal de USA (ya pide SO)', R.flujo(ON, MATEO, 'salida', 'USA') === 'usa_normal');
check('Ricardo entrada USA → plan', R.flujo(ON, RICH, 'entrada', 'USA') === 'plan_entrada');
check('Ricardo salida USA → avance y tu día', R.flujo(ON, RICH, 'salida', 'USA') === 'avance_salida');
check('interruptor apagado → mx aunque esté en Texas', R.flujo(OFF, MATEO, 'entrada', 'USA') === 'mx');
check('persona sin bandera → mx', R.flujo(ON, { perfil: 'so_entrada', activo: false }, 'entrada', 'USA') === 'mx');
check('empleado de México (no está en la lista) → mx', R.flujo(ON, null, 'entrada', 'USA') === 'mx');
check('comida/otros tipos → mx', R.flujo(ON, MATEO, 'comida', 'USA') === 'mx');

seccion('Avance y reparto');
check('55% no acepta 50%', /no puede bajar/.test(R.validarAvance(50, 55)));
check('55% acepta 55%', R.validarAvance(55, 55) === null);
check('55% acepta 60%', R.validarAvance(60, 55) === null);
check('avance vacío se rechaza', !!R.validarAvance('', 0));
check('avance > 100 se rechaza', !!R.validarAvance(101, 0));
check('día que suma 90 se rechaza', /sumar 100/.test(R.validarReparto([{ clave: '11842', pct: 60 }, { clave: 'COMERCIAL', pct: 30 }])));
check('día que suma 100 pasa', R.validarReparto([{ clave: '11842', pct: 70 }, { clave: 'COMERCIAL', pct: 30 }]) === null);
check('SO repetida se rechaza', !!R.validarReparto([{ clave: '1', pct: 50 }, { clave: '1', pct: 50 }]));

seccion('Comercial: sugerido y excepción');
check('sugerido redondea a 10 % (2.9 de 10 h → 30 %)', R.sugeridoComercial(2.9, 10) === 30);
check('sugerido sin horas checadas = 0', R.sugeridoComercial(3, 0) === 0);
let e = R.evaluarComercial(30, 30, null);
check('comercial 30 con sugerido 30 → aprobado', e.estado === 'aprobado' && !e.exige_explicacion);
e = R.evaluarComercial(40, 30, null);
check('comercial 40 con sugerido 30 (10 puntos) → aprobado', e.estado === 'aprobado');
e = R.evaluarComercial(50, 30, null);
check('comercial 50 con sugerido 30 → procede con excepción y exige explicación', e.estado === 'excepcion' && e.exige_explicacion);
check('subir más de 20 contra el plan se marca', R.evaluarComercial(50, 50, 20).contra_plan === true && R.evaluarComercial(40, 40, 20).contra_plan === false);
check('explicación de una línea con sustancia', R.validarExplicacion('Junta con cliente en planta') === null && !!R.validarExplicacion('x') && !!R.validarExplicacion('dos\nlíneas aquí'));

seccion('SO de la cuadrilla después de su salida');
const ent = [{ so_id: 11842, ts: '2026-10-28T15:00:00Z' }, { so_id: 11791, ts: '2026-10-29T03:00:00Z' }];
let s = R.sosParaAvance(ent, '2026-10-29T01:00:00Z', [11842]);
check('la que entró antes de la salida se pide en la salida', s.en_salida.join() === '11842');
check('la que entró después se pide en su siguiente entrada', s.para_siguiente_entrada.join() === '11791');

seccion('Webhook nomina-usa/kiosko (Code - Validar)');
{
  const fs = require('fs'), path = require('path');
  const sdk = require('../../nomina-usa/n8n/armar.js').armar('kiosko');
  check('kiosko se arma sin marcadores sueltos', !/__VALIDAR__/.test(sdk));
  const code = fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/kiosko-validar.js'), 'utf8');
  const run = body => new Function('$', code)(() => ({ first: () => ({ json: { body } }) }))[0].json;
  check('evento válido pasa y se recorta lo que no se guarda', (() => { const r = run({ accion: 'evento', employee_id: 75, tipo: 'entrada_so', ev_id: 'ev_75_1730000000000_entrada_so', pais: 'USA', foto_b64: 'xxx' }); return r.ok && !('foto_b64' in r.payload); })());
  check('employee_id inválido se rechaza', run({ accion: 'evento', employee_id: 'x', tipo: 'dia', ev_id: 'ev_1_2_3_dia' }).error === 'EMPLEADO_INVALIDO');
  check('tipo desconocido se rechaza', run({ accion: 'evento', employee_id: 75, tipo: 'borrar', ev_id: 'ev_75_1_borrar' }).error === 'TIPO_INVALIDO');
  check('país raro se rechaza', run({ accion: 'evento', employee_id: 75, tipo: 'dia', ev_id: 'ev_75_1234567_dia', pais: 'CA' }).error === 'PAIS_INVALIDO');
}

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Almacén del kiosko (Postgres real)');
const db = pg.crear();
const k = p => db.j("SELECT nomina_usa.kiosko($q$" + JSON.stringify(p) + "$q$::jsonb)");
const ev = (o) => Object.assign({ accion: 'evento', ev_id: 'ev_' + Math.random().toString(36).slice(2, 12), tz_evento: 'America/Chicago' }, o);
let r = k({ accion: 'contexto', employee_id: 75 });
check('contexto con todo apagado: activo=false (el kiosko sigue el flujo de México)', r.ok && r.activo === false && r.perfil === 'so_entrada', r);
check('contexto de alguien sin ficha: activo=false', k({ accion: 'contexto', employee_id: 5 }).activo === false);
check('evento de alguien sin ficha se rechaza', k(ev({ employee_id: 5, tipo: 'dia', pais: 'MX' })).error === 'SIN_FICHA');
const e1 = ev({ employee_id: 75, tipo: 'entrada_so', checada: 'entrada', pais: 'USA', pais_origen: 'geo', ts_evento: '2026-10-28T14:00:00Z', so: { id: 11842, nombre: 'SO11842', company_id: 6 } });
r = k(e1);
check('SO al entrar se guarda con su fecha local (Chicago)', r.ok && r.fecha === '2026-10-28', r);
check('reintento del mismo evento = DUPLICADO, no doble', k(e1).error === 'DUPLICADO' && db.q("SELECT count(*) FROM nomina_usa.evento_kiosko") === '1');
check('el día queda USA por ubicación', db.q("SELECT pais||'/'||origen||'/'||pendiente_rh FROM nomina_usa.dia WHERE employee_id=75") === 'USA/geo/false');
k(ev({ employee_id: 79, tipo: 'dia', checada: 'entrada', pais: 'MX', pais_origen: 'declarado', pendiente_rh: true, ts_evento: '2026-10-28T14:00:00Z' }));
check('sin ubicación y declaró México: pendiente de RH', db.q("SELECT pais||'/'||pendiente_rh FROM nomina_usa.dia WHERE employee_id=79") === 'MX/true');
k(ev({ employee_id: 79, tipo: 'dia', checada: 'salida', pais: 'USA', pais_origen: 'geo', ts_evento: '2026-10-28T23:00:00Z' }));
check('luego checó con ubicación USA: la ubicación gana y deja de estar pendiente', db.q("SELECT pais||'/'||pendiente_rh FROM nomina_usa.dia WHERE employee_id=79") === 'USA/false');
r = db.panel({ accion: 'dia_validar', employee_id: 79, fecha: '2026-10-28', pais: 'MX', nota: 'corrección' }, ['nomina_usa:validar'], 'magaly');
check('Magaly valida/corrige el día', r.ok && db.q("SELECT pais||'/'||origen FROM nomina_usa.dia WHERE employee_id=79") === 'MX/rh');
k(ev({ employee_id: 79, tipo: 'dia', checada: 'entrada', pais: 'USA', pais_origen: 'geo', ts_evento: '2026-10-28T23:30:00Z' }));
check('lo validado por RH no lo pisa el kiosko', db.q("SELECT pais FROM nomina_usa.dia WHERE employee_id=79") === 'MX');
// avances
k(ev({ employee_id: 98, tipo: 'salida', checada: 'salida', pais: 'USA', ts_evento: '2026-10-28T23:00:00Z', avances: [{ so_id: 11842, so_nombre: 'SO11842', pct: 55 }], dia: [{ clave: '11842', so_id: 11842, pct: 70 }, { clave: 'COMERCIAL', pct: 30 }], comercial: { declarado: 30, sugerido: 30, estado: 'aprobado' } }));
check('avance 55 vigente', db.q('SELECT nomina_usa.avance_vigente(11842)') === '55');
r = k(ev({ employee_id: 98, tipo: 'salida', checada: 'salida', pais: 'USA', ts_evento: '2026-10-29T23:00:00Z', avances: [{ so_id: 11842, so_nombre: 'SO11842', pct: 50 }], dia: [{ clave: '11842', so_id: 11842, pct: 100 }] }));
check('un avance que baja (55→50) se guarda RECHAZADO y no cuenta', r.ok && r.avances_rechazados === 1 && db.q('SELECT nomina_usa.avance_vigente(11842)') === '55' && db.q("SELECT count(*) FROM nomina_usa.avance_so WHERE estado='rechazado'") === '1', r);
check('su día real válido (100) queda guardado', db.q("SELECT valido FROM nomina_usa.reparto_dia WHERE employee_id=98 AND fecha='2026-10-28' AND tipo='real'") === 't');
k(ev({ employee_id: 98, tipo: 'plan', checada: 'entrada', pais: 'USA', ts_evento: '2026-10-30T14:00:00Z', plan: [{ clave: '11842', so_id: 11842, pct: 60 }, { clave: 'COMERCIAL', pct: 30 }] }));
check('un plan que suma 90 se guarda marcado como inválido', db.q("SELECT valido FROM nomina_usa.reparto_dia WHERE employee_id=98 AND tipo='plan'") === 'f');
// SO de la cuadrilla después de su salida → pendiente en la siguiente entrada
k(ev({ employee_id: 75, tipo: 'entrada_so', checada: 'entrada', pais: 'USA', ts_evento: '2026-10-29T23:30:00Z', so: { id: 11791, nombre: 'SO11791', company_id: 6 } }));
r = k({ accion: 'contexto', employee_id: 98, tz_evento: 'America/Chicago' });
check('SO11791 (entró después de la salida del 29) se pide en su siguiente entrada', r.ok && r.pendientes_avance.some(x => x.so_id === 11791) && !r.pendientes_avance.some(x => x.so_id === 11842), r.pendientes_avance);
db.q("UPDATE nomina_usa.config SET valor='true' WHERE clave='kiosko_activo'; UPDATE nomina_usa.ficha SET kiosko_usa=true WHERE employee_id=98");
check('con las dos llaves prendidas: activo=true', k({ accion: 'contexto', employee_id: 98 }).activo === true);
check('sugerido en SQL igual que en JS (2.9/10 → 30)', db.q('SELECT nomina_usa.sugerido_comercial(2.9, 10)') === '30');
check('evento mal formado no truena: EVENTO_INVALIDO', k(ev({ employee_id: 98, tipo: 'raro' })).error === 'EVENTO_INVALIDO');
fin();
