#!/usr/bin/env node
// Fase H (#448, ajustes de Esteban del 2-nov): bandera de alertas por país, zona de la última
// checada, destinatarios por ficha y fijo de Rissia todo o nada. (Evidencia de compras: fase-g.)
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const A = require('../../shared/nomina-usa/alertas.js');
const fs = require('fs'), path = require('path');
const Z75 = require('./fixtures/zonas-octubre-75.json');

seccion('Zona por coordenadas (centros de ciudad públicos)');
const CIUDAD = { 'America/Los_Angeles': [38.2494, -122.04], 'America/Chicago': [32.7459, -96.9978], 'America/Monterrey': [25.6866, -100.3161] };
const casos = [['Fairfield, CA', 38.2494, -122.04, 'America/Los_Angeles'], ['Grand Prairie, TX', 32.7459, -96.9978, 'America/Chicago'],
  ['Monterrey', 25.6866, -100.3161, 'America/Monterrey'], ['Nuevo Laredo', 27.47, -99.52, 'America/Monterrey'], ['Laredo, TX', 27.53, -99.48, 'America/Chicago'],
  ['El Paso, TX', 31.76, -106.48, 'America/Denver'], ['Ciudad Juárez', 31.69, -106.42, 'America/Monterrey'], ['Phoenix', 33.45, -112.07, 'America/Phoenix'],
  ['Hayward, CA', 37.67, -122.08, 'America/Los_Angeles'], ['Reynosa', 26.08, -98.29, 'America/Monterrey'], ['McAllen, TX', 26.2, -98.23, 'America/Chicago'],
  ['Atlanta', 33.75, -84.39, 'America/New_York']];
casos.forEach(c => check(c[0] + ' → ' + c[3], A.zonaDeCoordenadas(c[1], c[2]) === c[3], A.zonaDeCoordenadas(c[1], c[2])));
check('0,0 (Odoo sin ubicación) → null, no inventa', A.zonaDeCoordenadas(0, 0) === null);
check('sin checada con ubicación → la zona de la ficha', A.zonaUltimaChecada([], '2026-11-02T14:00:00Z', 'America/Chicago').zona === 'America/Chicago');
check('sin checada ni ficha → Monterrey', A.zonaUltimaChecada([], '2026-11-02T14:00:00Z', null).zona === 'America/Monterrey');
check('la checada posterior a «ahora» no cuenta', A.zonaUltimaChecada([{ check_in: '2026-11-02 15:00:00', in_latitude: 38.2494, in_longitude: -122.04 }], '2026-11-02T14:00:00Z', 'America/Chicago').zona === 'America/Chicago');

seccion('Octubre de Mateo (75): Fairfield (PDT) y Grand Prairie (CDT), cada entrada en su zona');
// Coordenadas representativas por zona (centro de ciudad), en lugar de las reales.
const atts = Z75.asistencias.map(a => ({ id: a.id, check_in: a.check_in, check_out: a.check_out,
  in_latitude: a.zona_in ? CIUDAD[a.zona_in][0] : 0, in_longitude: a.zona_in ? CIUDAD[a.zona_in][1] : 0,
  out_latitude: a.zona_out ? CIUDAD[a.zona_out][0] : 0, out_longitude: a.zona_out ? CIUDAD[a.zona_out][1] : 0 }));
const P75 = { employee_id: 75, hora_ref: '08:00', zona: 'America/Chicago', fuente: 'ficha' };
// Repite el cron cada 15 min del 21 al 31-oct, con lo que existía en cada instante.
function corre(persona, desde, hasta) {
  const out = [], zonas = {};
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += 15 * 60000) {
    const ahora = new Date(t);
    const vistas = atts.filter(a => A.utc(a.check_in) <= ahora).map(a => (a.check_out && A.utc(a.check_out) > ahora) ? Object.assign({}, a, { check_out: false }) : a);
    const mias = vistas.filter(a => !a.check_out || ahora - A.utc(a.check_in) <= 40 * 3600000);
    const r = A.alertasPersona(persona, mias, vistas, ahora, { tolerancia_min: 15, salida_horas: 14, festivos: [] });
    const dia = A.local(ahora, r.zona.zona).fecha;
    if (r.entrada && r.entrada.fecha && !zonas[dia]) zonas[dia] = r.zona.zona;
    r.alertas.forEach(x => { if (!out.some(y => y.clave === x.clave)) out.push(x); });
  }
  return { alertas: out, zonas };
}
const rz = corre(P75, '2026-10-21T12:00:00Z', '2026-10-31T06:00:00Z');
const ent = rz.alertas.filter(a => a.tipo === 'entrada_faltante');
['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'].forEach(d =>
  check(d + ' (Fairfield) se evalúa en America/Los_Angeles', rz.zonas[d] === 'America/Los_Angeles', rz.zonas[d]));
['2026-10-28', '2026-10-29', '2026-10-30'].forEach(d =>
  check(d + ' (Grand Prairie) se evalúa en America/Chicago', rz.zonas[d] === 'America/Chicago', rz.zonas[d]));
check('23-oct: entró 08:14:45 PDT → SIN alerta en su zona', !ent.some(a => a.fecha === '2026-10-23'), ent.map(a => a.fecha));
check('22-oct: entró 08:55 PDT → alerta a las 08:15:01 PDT (15:15 UTC), en Los Ángeles', ent.some(a => a.fecha === '2026-10-22' && a.detalle.zona === 'America/Los_Angeles' && a.detalle.zona_fuente === 'ultima_checada'));
check('26-oct: entró 10:18 PDT → alerta, en Los Ángeles', ent.some(a => a.fecha === '2026-10-26' && a.detalle.zona === 'America/Los_Angeles'));
check('28, 29 y 30-oct: entró antes de las 08:15 CDT → sin alerta', !ent.some(a => ['2026-10-28', '2026-10-29', '2026-10-30'].indexOf(a.fecha) >= 0));
check('sábado 24 y domingo 25 no alertan', !ent.some(a => a.fecha === '2026-10-24' || a.fecha === '2026-10-25'));
// Contraste: con la zona fija de la ficha (Chicago) el 23-oct habría salido una alerta falsa.
const fija = corre(Object.assign({}, P75, { fuente: 'padron' }), '2026-10-21T12:00:00Z', '2026-10-31T06:00:00Z');
check('contraste: con zona fija Chicago el 23-oct da alerta FALSA (por eso se usa la última checada)', fija.alertas.some(a => a.tipo === 'entrada_faltante' && a.fecha === '2026-10-23'));
check('el padrón de México (fuente padron) no usa la última checada: siempre su zona', A.alertasPersona({ employee_id: 9, hora_ref: '08:00', zona: 'America/Monterrey', fuente: 'padron' }, [],
  [{ check_in: '2026-11-01 15:00:00', in_latitude: 38.2494, in_longitude: -122.04 }], new Date('2026-11-02T14:16:00Z'), { tolerancia_min: 15 }).zona.zona === 'America/Monterrey');

seccion('Workflow nomina-usa/alertas (código embebido)');
{
  const sdk = require('../../nomina-usa/n8n/armar.js').armar('alertas');
  check('se arma con alertasPersona y la consulta de ubicación', /alertasPersona/.test(sdk) && /in_latitude/.test(sdk));
  check('sin diagonales invertidas (§17 quirk 2c)', !/\\/.test(fs.readFileSync(path.join(__dirname, '../../shared/nomina-usa/alertas.js'), 'utf8')) && !/\\/.test(fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/alertas-leer.js'), 'utf8')));
}

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Base: bandera por país (0009)');
const db = pg.crear();
db.q(`INSERT INTO retardos.empleado (employee_id, nombre, activo, hora_entrada, email, email_valido, parent_id, correos) VALUES
  (75, 'x', true, 7.5, 'persona75@fts.mx', true, 112, '[{"campo":"work_email","email":"persona75@fts.mx"}]'),
  (97, 'r', true, 8, 'persona97@fts.mx', true, 32, '[{"campo":"work_email","email":"persona97@fts.mx"}]'),
  (98, 'c', true, 8, 'persona98@fts.mx', true, 32, '[{"campo":"work_email","email":"persona98@fts.mx"}]'),
  (32, 'j', true, 8, 'jefe32@fts.mx', true, null, '[{"campo":"work_email","email":"jefe32@fts.mx"}]'),
  (63, 'm', true, 8, 'rh63@fts.mx', true, 32, '[{"campo":"work_email","email":"rh63@fts.mx"}]'),
  (149, 'k', true, 8, 'aut149@fts.mx', true, 32, '[{"campo":"work_email","email":"aut149@fts.mx"}]'),
  (112, 'y', true, 8, 'jefe112@fts.mx', true, 32, '[{"campo":"work_email","email":"jefe112@fts.mx"}]'),
  (9, 'z', true, 8, 'mx9@fts.mx', true, 112, '[{"campo":"work_email","email":"mx9@fts.mx"}]'),
  (10, 'w', true, 8, 'mx10@fts.mx', true, 112, '[{"campo":"work_email","email":"mx10@fts.mx"}]')`);
check('nacen las dos en sombra', db.q("SELECT nomina_usa.modos_alertas()") === '{"mx": "sombra", "usa": "sombra"}');
check('pais: Rissia (ficha USA) → USA', db.q("SELECT nomina_usa.pais_alerta(97, '2026-11-02', NULL)") === 'USA');
check('pais: Mateo híbrido con zona USA → USA', db.q("SELECT nomina_usa.pais_alerta(75, '2026-11-02', 'America/Chicago')") === 'USA');
check('pais: Mateo híbrido con zona Monterrey → MX', db.q("SELECT nomina_usa.pais_alerta(75, '2026-11-02', 'America/Monterrey')") === 'MX');
db.q("INSERT INTO nomina_usa.dia (employee_id, fecha, pais, origen) VALUES (75, '2026-11-03', 'MX', 'geo')");
check('pais: el día clasificado MX gana a la zona', db.q("SELECT nomina_usa.pais_alerta(75, '2026-11-03', 'America/Chicago')") === 'MX');
check('pais: alguien sin ficha (padrón) → MX aunque su zona fuera de USA', db.q("SELECT nomina_usa.pais_alerta(9, '2026-11-02', 'America/Chicago')") === 'MX');

const reg = al => db.j("SELECT nomina_usa.alertas_registrar($q$" + JSON.stringify({ alertas: al }) + "$q$::jsonb)");
const MX = n => ({ clave: 'entrada:9:2026-11-0' + n, tipo: 'entrada_faltante', employee_id: 9, fecha: '2026-11-0' + n, detalle: { zona: 'America/Monterrey' } });
const MX10 = n => ({ clave: 'salida:9' + n, tipo: 'salida_faltante', employee_id: 10, fecha: '2026-11-0' + n, attendance_id: 90 + n, detalle: { zona: 'America/Monterrey' } });
const US = n => ({ clave: 'entrada:75:2026-11-0' + n, tipo: 'entrada_faltante', employee_id: 75, fecha: '2026-11-0' + n, detalle: { zona: 'America/Chicago' } });
let r = db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'real', motivo: 'prueba: USA a real' });
check('USA pasa a real con motivo, México sigue en sombra', r.ok && db.q("SELECT nomina_usa.modos_alertas()") === '{"mx": "sombra", "usa": "real"}', r);
check('el cambio queda en bitácora', db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='config' AND objeto='alertas_modo_usa'") === '1');
r = reg([MX(2), MX10(2), US(4)]);
check('USA real + MX sombra: se registran las 3, solo 1 en real', r.nuevas === 3 && r.en_real === 1 && r.encoladas === 1, r);
check('NINGÚN empleado de México genera fila en retardos.envio', db.q("SELECT count(*) FROM retardos.envio WHERE para::text LIKE '%mx9@%' OR para::text LIKE '%mx10@%' OR cc::text LIKE '%mx9@%'") === '0'
  && db.q('SELECT count(*) FROM retardos.envio') === '1');
check('las alertas de México quedaron en sombra, con país MX', db.q("SELECT string_agg(modo_al_crear || ':' || pais, ',' ORDER BY id) FROM nomina_usa.alerta WHERE employee_id IN (9, 10)") === 'sombra:MX,sombra:MX');
check('la de Mateo en zona USA quedó en real, con país USA y encolada', db.q("SELECT modo_al_crear || ':' || pais || ':' || encolada FROM nomina_usa.alerta WHERE clave='entrada:75:2026-11-04'") === 'real:USA:true');
r = reg([Object.assign(US(3), {})]);
check('Mateo con día MX ese día usa la bandera de México (sombra): sin correo', r.en_real === 0 && db.q("SELECT modo_al_crear || ':' || pais FROM nomina_usa.alerta WHERE clave='entrada:75:2026-11-03'") === 'sombra:MX');
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'sombra', motivo: 'regreso' });
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_mx', valor: 'real', motivo: 'prueba: México a real' });
r = reg([MX(5), US(5)]);
check('al revés (MX real, USA sombra): México sí encola y Mateo no', r.en_real === 1 && db.q("SELECT count(*) FROM retardos.envio WHERE para::text LIKE '%mx9@%'") === '1'
  && db.q("SELECT count(*) FROM retardos.envio WHERE para::text LIKE '%persona75@%' AND clave_dedupe LIKE '%2026-11-05'") === '0', r);
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_mx', valor: 'sombra', motivo: 'regreso' });
check('la clave vieja alertas_modo ya no se puede mover', db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real', motivo: 'x' }).error === 'CLAVE_OBSOLETA');
check('a_alertas devuelve los dos modos', (x => x.modos.usa === 'sombra' && x.modos.mx === 'sombra')(db.panel({ accion: 'alertas' }, ['nomina_usa:validar'])));

seccion('Base: destinatarios por ficha (Ricardo → Magaly y Erick, sin Esteban)');
r = db.panel({ accion: 'ficha_guardar', ficha: Object.assign(db.j("SELECT to_jsonb(f) FROM nomina_usa.ficha f WHERE employee_id=98"), { destinatarios_alerta: ['x'] }), motivo: 'm' });
check('destinatario que no es número se rechaza', r.error === 'DESTINATARIO_INVALIDO', r);
r = db.panel({ accion: 'ficha_guardar', ficha: Object.assign(db.j("SELECT to_jsonb(f) FROM nomina_usa.ficha f WHERE employee_id=98"), { destinatarios_alerta: [63, 149] }), motivo: 'prueba destinatarios' });
check('la ficha guarda destinatarios [63,149] y el jefe sigue en 32', r.ok && JSON.stringify(r.ficha.destinatarios_alerta) === '[63,149]' && r.ficha.jefe_employee_id === 32, r);
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'real', motivo: 'prueba' });
r = reg([{ clave: 'entrada:98:2026-11-04', tipo: 'entrada_faltante', employee_id: 98, fecha: '2026-11-04', detalle: { zona: 'America/Los_Angeles' } },
         { clave: 'salida_rh:777', tipo: 'salida_faltante_rh', employee_id: 98, fecha: '2026-11-04', attendance_id: 777, detalle: { zona: 'America/Los_Angeles' } }]);
const e1 = db.j("SELECT jsonb_build_object('para', para, 'cc', cc) FROM retardos.envio WHERE clave_dedupe = 'nomina_usa:entrada:98:2026-11-04'");
check('entrada faltante de Ricardo: a él, con copia a Magaly y Erick', JSON.stringify(e1.para).includes('persona98@') && JSON.stringify(e1.cc).includes('rh63@') && JSON.stringify(e1.cc).includes('aut149@'), e1);
check('…y SIN copia a Esteban (jefe 32)', !JSON.stringify(e1).includes('jefe32@'), e1);
const e2 = db.j("SELECT jsonb_build_object('para', para, 'cc', cc) FROM retardos.envio WHERE clave_dedupe = 'nomina_usa:salida_rh:777'");
check('salida sin cerrar al día siguiente: a Magaly y Erick en lugar de RH, sin Esteban', JSON.stringify(e2.para).includes('rh63@') && JSON.stringify(e2.para).includes('aut149@') && !JSON.stringify(e2).includes('jefe32@'), e2);
check('Mateo (sin destinatarios) sigue con su jefe en copia', JSON.stringify(db.j("SELECT cc FROM retardos.envio WHERE clave_dedupe = 'nomina_usa:entrada:75:2026-11-04'")).includes('jefe112@'));
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'sombra', motivo: 'regreso' });

seccion('Base: fijo de Rissia TODO O NADA, cuenta de su ficha');
r = db.panel({ accion: 'ficha_guardar', ficha: Object.assign(db.j("SELECT to_jsonb(f) FROM nomina_usa.ficha f WHERE employee_id=97"), { fijo_semanal_usd: '507.59', cuenta_analitica: 'Sales FTS USA' }), motivo: 'prueba' });
check('la ficha guarda fijo 507.59 y cuenta Sales FTS USA', r.ok && Number(r.ficha.fijo_semanal_usd) === 507.59 && r.ficha.cuenta_analitica === 'Sales FTS USA', r);
const enviar = (sem, actor) => db.panel({ accion: 'solicitud_enviar', envio: { semana: sem, sos: [], comercial: [], fijos: [{ employee_id: 97 }] } }, ['nomina_usa:kiosko'], actor || 'richard');
const fijoDe = id => db.q('SELECT monto || \':\' || cuenta FROM nomina_usa.solicitud_linea WHERE tipo = \'fijo\' AND solicitud_id = ' + id);
r = enviar('2026-11-06');
check('sin faltas: 507.59 a Sales FTS USA', r.ok && fijoDe(r.id) === '507.59:Sales FTS USA', [r, r.ok && fijoDe(r.id)]);
db.q("INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, modo_al_crear, estado) VALUES ('t1','incidencia_periodo',97,'2026-11-16','sombra','falta_justificada')");
r = enviar('2026-11-13');
check('falta JUSTIFICADA (permiso o vacaciones): se paga completo 507.59', r.ok && fijoDe(r.id) === '507.59:Sales FTS USA', [r, r.ok && fijoDe(r.id)]);
db.q("INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, modo_al_crear, estado) VALUES ('t2','incidencia_periodo',97,'2026-11-23','sombra','falta_injustificada')");
r = enviar('2026-11-20');
check('UNA falta injustificada confirmada por RH: el fijo de la semana no se paga (0)', r.ok && fijoDe(r.id) === '0.00:Sales FTS USA', [r, r.ok && fijoDe(r.id)]);
check('la línea en 0 no sale en el CSV de Auris (HAVING <> 0)', db.q("SELECT count(*) FROM nomina_usa.solicitud_linea WHERE solicitud_id = " + r.id + " AND monto <> 0") === '0');
fin();
