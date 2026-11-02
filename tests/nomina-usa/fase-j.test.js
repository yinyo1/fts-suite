#!/usr/bin/env node
// Fase J (#448, activación del 2-nov): candado por persona de las alertas USA en real
// (nomina_usa_0014, config alertas_real_solo). Esteban pidió alertas USA en real SOLO para
// Mateo (75), José Luis (79) y Ricardo (98); Rissia (97, ficha USA) y México siguen en sombra.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
const db = pg.crear();
db.q(`INSERT INTO retardos.empleado (employee_id, nombre, activo, hora_entrada, email, email_valido, parent_id, correos) VALUES
  (75, 'x', true, 7.5, 'persona75@fts.mx', true, 112, '[{"campo":"work_email","email":"persona75@fts.mx"}]'),
  (79, 'l', true, 7.5, 'persona79@fts.mx', true, 112, '[{"campo":"work_email","email":"persona79@fts.mx"}]'),
  (97, 'r', true, 8, 'persona97@fts.mx', true, 32, '[{"campo":"work_email","email":"persona97@fts.mx"}]'),
  (98, 'c', true, 8, 'persona98@fts.mx', true, 32, '[{"campo":"work_email","email":"persona98@fts.mx"}]'),
  (32, 'j', true, 8, 'jefe32@fts.mx', true, null, '[{"campo":"work_email","email":"jefe32@fts.mx"}]'),
  (112, 'y', true, 8, 'jefe112@fts.mx', true, 32, '[{"campo":"work_email","email":"jefe112@fts.mx"}]'),
  (9, 'z', true, 8, 'mx9@fts.mx', true, 112, '[{"campo":"work_email","email":"mx9@fts.mx"}]')`);
const reg = al => db.j("SELECT nomina_usa.alertas_registrar($q$" + JSON.stringify({ alertas: al }) + "$q$::jsonb)");
const AL = (emp, tipo, n, zona) => ({ clave: tipo + ':' + emp + ':' + n, tipo, employee_id: emp, fecha: '2026-11-0' + n, attendance_id: tipo === 'entrada_faltante' ? null : emp * 100 + n, detalle: { zona } });
const envio = like => db.q("SELECT count(*) FROM retardos.envio WHERE para::text LIKE '%" + like + "%' OR cc::text LIKE '%" + like + "%'");

seccion('0014 · la clave nace sin candado (compatible con lo de antes)');
check('alertas_real_solo nace null', db.q("SELECT valor::text FROM nomina_usa.config WHERE clave = 'alertas_real_solo'") === 'null');
check('con sombra: modo_alerta_emp = sombra para todos', db.q("SELECT nomina_usa.modo_alerta_emp(97, 'USA') || nomina_usa.modo_alerta_emp(75, 'USA')") === 'sombrasombra');
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'real', motivo: 'prueba' });
check('USA real SIN candado: Rissia también real (como antes de 0014)', db.q("SELECT nomina_usa.modo_alerta_emp(97, 'USA')") === 'real');
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'sombra', motivo: 'regreso' });

seccion('0014 · validación de la lista');
let r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: '75,79,98', motivo: 'x' });
check('un texto se rechaza', r.error === 'VALOR_INVALIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: [75, 'x'], motivo: 'x' });
check('un id no numérico se rechaza', r.error === 'VALOR_INVALIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: [75.5], motivo: 'x' });
check('un id con decimales se rechaza', r.error === 'VALOR_INVALIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: [-1], motivo: 'x' });
check('un id negativo se rechaza', r.error === 'VALOR_INVALIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: [75, 79, 98], motivo: '' });
check('sin motivo se rechaza', r.error === 'MOTIVO_REQUERIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: [75, 79, 98], motivo: 'Activación 2-nov' });
check('[75,79,98] con motivo se guarda', r.ok && JSON.stringify(r.despues) === '[75,79,98]', r);
check('…y queda en bitácora', db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='config' AND objeto='alertas_real_solo'") === '1');
check('las claves de antes se siguen validando igual', db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'x', motivo: 'm' }).error === 'MODO_INVALIDO'
  && db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real', motivo: 'm' }).error === 'CLAVE_OBSOLETA');

seccion('0014 · USA real con candado [75,79,98]');
r = db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'real', motivo: 'prueba: USA a real' });
check('alertas_modo_usa = real, México sigue en sombra', r.ok && db.q("SELECT nomina_usa.modos_alertas()") === '{"mx": "sombra", "usa": "real"}');
r = reg([AL(75, 'entrada_faltante', 4, 'America/Chicago'), AL(79, 'entrada_faltante', 4, 'America/Chicago'), AL(98, 'entrada_faltante', 4, 'America/Los_Angeles'),
         AL(97, 'salida_faltante', 4, 'America/Monterrey'), AL(97, 'salida_faltante_rh', 4, 'America/Monterrey'), AL(9, 'entrada_faltante', 4, 'America/Monterrey')]);
check('se registran las 6; solo 3 en real (75, 79, 98)', r.nuevas === 6 && r.en_real === 3 && r.encoladas === 3, r);
check('Mateo, José Luis y Ricardo: real, USA, encolada', db.q("SELECT string_agg(employee_id || ':' || modo_al_crear || ':' || pais || ':' || encolada, ',' ORDER BY employee_id) FROM nomina_usa.alerta WHERE employee_id IN (75,79,98)")
  === '75:real:USA:true,79:real:USA:true,98:real:USA:true');
check('Rissia (97): país USA pero SOMBRA y sin encolar (las dos)', db.q("SELECT string_agg(modo_al_crear || ':' || pais || ':' || encolada, ',') FROM nomina_usa.alerta WHERE employee_id = 97") === 'sombra:USA:false,sombra:USA:false');
check('cero correos a Rissia ni a RH por Rissia', envio('persona97@') === '0' && db.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe LIKE 'nomina_usa:%:97:%'") === '0');
check('México (9): sombra, cero correos', db.q("SELECT modo_al_crear || ':' || pais FROM nomina_usa.alerta WHERE employee_id = 9") === 'sombra:MX' && envio('mx9@') === '0');
check('retardos.envio: exactamente 3 filas, todas de 75/79/98', db.q('SELECT count(*) FROM retardos.envio') === '3'
  && db.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe IN ('nomina_usa:entrada_faltante:75:4','nomina_usa:entrada_faltante:79:4','nomina_usa:entrada_faltante:98:4')") === '3');
db.q("INSERT INTO nomina_usa.dia (employee_id, fecha, pais, origen) VALUES (75, '2026-11-05', 'MX', 'geo')");
r = reg([AL(75, 'entrada_faltante', 5, 'America/Chicago')]);
check('Mateo con día MX: bandera de México (sombra), aunque esté en la lista', r.en_real === 0 && db.q("SELECT modo_al_crear || ':' || pais FROM nomina_usa.alerta WHERE clave = 'entrada_faltante:75:5'") === 'sombra:MX');

seccion('0014 · reversa');
db.panel({ accion: 'config_guardar', clave: 'alertas_modo_usa', valor: 'sombra', motivo: 'reversa' });
r = reg([AL(98, 'entrada_faltante', 6, 'America/Los_Angeles')]);
check('USA de vuelta a sombra: Ricardo ya no encola', r.en_real === 0 && r.encoladas === 0, r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_real_solo', valor: null, motivo: 'quitar candado' });
check('la lista se puede regresar a null', r.ok && db.q("SELECT valor::text FROM nomina_usa.config WHERE clave = 'alertas_real_solo'") === 'null', r);
fin();
