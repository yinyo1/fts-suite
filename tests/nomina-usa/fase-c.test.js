#!/usr/bin/env node
// Fase C (#448): alertas de checada en modo sombra e incidencias del periodo.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const A = require('../../shared/nomina-usa/alertas.js');
const fs = require('fs'), path = require('path');
const OCT = require('./fixtures/octubre-98.json');

seccion('Entrada faltante (hora de referencia 07:00 America/Chicago, tolerancia 15)');
const P = { employee_id: 75, hora_ref: '07:00', zona: 'America/Chicago' };
// lunes 2-nov-2026: CST (UTC-6) desde el 1-nov → 07:15:00 local = 13:15:00 UTC
check('a +15:00 no alerta', A.entradaFaltante(P, 0, new Date('2026-11-02T13:15:00Z'), 15).alerta === false);
check('a +15:01 sí alerta', A.entradaFaltante(P, 0, new Date('2026-11-02T13:15:01Z'), 15).alerta === true);
check('si ya checó no alerta', A.entradaFaltante(P, 1, new Date('2026-11-02T14:00:00Z'), 15).alerta === false);
check('sábado no alerta', A.entradaFaltante(P, 0, new Date('2026-10-31T15:00:00Z'), 15).motivo === 'FIN_DE_SEMANA');
check('domingo no alerta', A.entradaFaltante(P, 0, new Date('2026-11-01T15:00:00Z'), 15).motivo === 'FIN_DE_SEMANA');
check('festivo no alerta', A.entradaFaltante(P, 0, new Date('2026-11-02T15:00:00Z'), 15, ['2026-11-02']).motivo === 'FESTIVO');
check('sin hora de referencia no alerta (no se inventa)', A.entradaFaltante({ employee_id: 98, hora_ref: null }, 0, new Date('2026-11-02T20:00:00Z'), 15).motivo === 'SIN_HORA_REFERENCIA');
check('la clave es por persona y fecha local (dedupe)', A.entradaFaltante(P, 0, new Date('2026-11-02T13:30:00Z'), 15).clave === 'entrada:75:2026-11-02');
check('México: 08:00 Monterrey a +15:01', A.entradaFaltante({ employee_id: 9, hora_ref: '08:00', zona: 'America/Monterrey' }, 0, new Date('2026-11-02T14:15:01Z'), 15).alerta === true);

seccion('Salida faltante (14 h)');
const att = { id: 1, check_in: '2026-11-02 13:00:00', check_out: false };
check('13:59 h no alerta', A.salidaFaltante(att, new Date('2026-11-03T02:59:00Z'), 14, 'America/Chicago').length === 0);
check('a 14 h alerta a la persona', (r => r.length === 1 && r[0].tipo === 'salida_faltante')(A.salidaFaltante(att, new Date('2026-11-03T03:00:00Z'), 14, 'America/Chicago')));
check('al día siguiente también a RH', (r => r.some(x => x.tipo === 'salida_faltante_rh'))(A.salidaFaltante(att, new Date('2026-11-03T13:00:00Z'), 14, 'America/Chicago')));
check('con salida no alerta', A.salidaFaltante(Object.assign({}, att, { check_out: '2026-11-02 23:00:00' }), new Date('2026-11-04T00:00:00Z'), 14).length === 0);

seccion('Incidencias reales de octubre (Ricardo, hr.attendance del 21 al 30-oct)');
for (const z of ['America/Los_Angeles', 'America/Chicago']) {
  const inc = A.incidencias(OCT.asistencias, '2026-10-21', '2026-10-30', z);
  const de = t => inc.filter(i => i.tipo === t).map(i => i.fecha.slice(8)).join(',');
  check('[' + z + '] 25-oct sin checada', de('sin_checada') === '25', de('sin_checada'));
  check('[' + z + '] 22, 26 y 30-oct sin cerrar', de('sin_cerrar') === '22,26,30', de('sin_cerrar'));
  check('[' + z + '] 27-oct sin SO (asistencia 16306)', de('sin_so') === '27');
  const so = A.sosPorDia(OCT.asistencias, '2026-10-21', '2026-10-30', z);
  check('[' + z + '] 21, 22, 23, 24 y 26-oct en SO11791', ['21', '22', '23', '24', '26'].every(d => (so['2026-10-' + d] || []).join() === 'SO11791') && !so['2026-10-25']);
  check('[' + z + '] 28 a 30-oct en SO11842', ['28', '29', '30'].every(d => (so['2026-10-' + d] || []).join() === 'SO11842'));
}
check('la checada de 30 s (16169) no cuenta como día', !A.incidencias(OCT.asistencias, '2026-10-20', '2026-10-20', 'America/Los_Angeles').some(i => i.tipo !== 'rafaga' && i.tipo !== 'sin_checada'));
{
  const txt = fs.readFileSync(path.join(__dirname, '../../modulos/rh/nomina-usa/js/demo-octubre.js'), 'utf8');
  const copia = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  check('la copia de práctica es idéntica al fixture', JSON.stringify(copia) === JSON.stringify(OCT));
}

seccion('Workflow nomina-usa/alertas');
{
  const sdk = require('../../nomina-usa/n8n/armar.js').armar('alertas');
  check('se arma sin marcadores sueltos', !/__LEER__|\/\*__ALERTAS__\*\//.test(sdk));
  check('el código embebido no lleva diagonales invertidas (§17 quirk 2c)', !/\\/.test(fs.readFileSync(path.join(__dirname, '../../shared/nomina-usa/alertas.js'), 'utf8')) && !/\\/.test(fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/alertas-leer.js'), 'utf8')));
  check('el secreto entra por $env, sin literal', /\$env\.ODOO_RPC_KEY/.test(sdk));
}

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Almacén de alertas (Postgres real)');
const db = pg.crear();
db.q(`INSERT INTO retardos.empleado (employee_id, nombre, activo, hora_entrada, email, email_valido, parent_id, correos)
      VALUES (75, 'x', true, 7.5, 'persona75@fts.mx', true, 112, '[{"campo":"work_email","email":"persona75@fts.mx"}]'),
             (112, 'y', true, 8, 'jefe112@fts.mx', true, 32, '[{"campo":"work_email","email":"jefe112@fts.mx"}]'),
             (9, 'z', true, 8, 'mx9@fts.mx', true, 112, '[{"campo":"work_email","email":"mx9@fts.mx"}]')`);
db.q("UPDATE nomina_usa.ficha SET hora_entrada_ref='07:00', zona_horaria='America/Chicago' WHERE employee_id=75");
const par = db.j('SELECT nomina_usa.alertas_parametros()');
check('nacen en sombra', par.modo === 'sombra');
check('Mateo se evalúa con su ficha (07:00 Chicago)', par.personas.some(p => p.employee_id === 75 && p.hora_ref === '07:00' && p.zona === 'America/Chicago' && p.fuente === 'ficha'));
check('México se evalúa con el padrón de Retardos (08:00 Monterrey)', par.personas.some(p => p.employee_id === 9 && p.hora_ref === '08:00' && p.zona === 'America/Monterrey'));
check('Ricardo sin hora: va sin hora (no alerta de entrada)', par.personas.some(p => p.employee_id === 98 && p.hora_ref === null));
const reg = al => db.j("SELECT nomina_usa.alertas_registrar($q$" + JSON.stringify({ alertas: al }) + "$q$::jsonb)");
const AL = [{ clave: 'entrada:75:2026-11-02', tipo: 'entrada_faltante', employee_id: 75, fecha: '2026-11-02' }, { clave: 'salida:500', tipo: 'salida_faltante', employee_id: 75, fecha: '2026-11-02', attendance_id: 500 }];
let r = reg(AL);
check('en sombra se registran las alertas', r.ok && r.modo === 'sombra' && r.nuevas === 2 && r.encoladas === 0, r);
check('EN SOMBRA NO SALE NINGÚN CORREO: retardos.envio vacío', db.q('SELECT count(*) FROM retardos.envio') === '0');
check('repetir la corrida no duplica', reg(AL).nuevas === 0 && db.q('SELECT count(*) FROM nomina_usa.alerta') === '2');
let txt = ''; try { db.q("INSERT INTO nomina_usa.alerta (clave,tipo,employee_id,fecha,modo_al_crear,encolada) VALUES ('x','entrada_faltante',1,current_date,'sombra',true)"); } catch (e) { txt = String(e.stderr || e.message); }
check('la base impide una alerta en sombra marcada como encolada', /alerta_sombra_ck/.test(txt));
db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real', motivo: 'prueba de paso a real' });
r = reg([{ clave: 'entrada:75:2026-11-03', tipo: 'entrada_faltante', employee_id: 75, fecha: '2026-11-03' }]);
check('en real se encola en retardos.envio (reusa la bandeja de Retardos)', r.encoladas === 1 && db.q("SELECT count(*) FROM retardos.envio WHERE tipo='alerta' AND clave_dedupe LIKE 'nomina_usa:%'") === '1', r);
const env = db.j("SELECT jsonb_build_object('para', para, 'cc', cc) FROM retardos.envio LIMIT 1");
check('a la persona, con copia al jefe', JSON.stringify(env.para).includes('persona75@fts.mx') && JSON.stringify(env.cc).includes('jefe112@fts.mx'), env);
db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'sombra', motivo: 'regreso' });
// marcas de RH
const id = db.q("SELECT id FROM nomina_usa.alerta WHERE clave='entrada:75:2026-11-02'");
r = db.panel({ accion: 'alerta_marcar', id: Number(id), estado: 'en_disputa' }, ['nomina_usa:validar'], 'magaly');
check('en disputa exige motivo', r.error === 'MOTIVO_REQUERIDO');
r = db.panel({ accion: 'alerta_marcar', id: Number(id), estado: 'en_disputa', nota: 'dice que sí checó' }, ['nomina_usa:autorizar'], 'erick');
check('Erick no puede marcar alertas (es de RH)', r.error === 'SCOPE_INSUFICIENTE');
r = db.panel({ accion: 'alerta_marcar', id: Number(id), estado: 'en_disputa', nota: 'dice que sí checó' }, ['nomina_usa:validar'], 'magaly');
check('Magaly la marca en disputa', r.ok && db.q('SELECT estado FROM nomina_usa.alerta WHERE id=' + id) === 'en_disputa');
r = db.panel({ accion: 'alerta_marcar', id: Number(id), estado: 'error_corregido' }, ['nomina_usa:validar'], 'magaly');
check('liberarla queda en bitácora como alerta_liberada', r.ok && db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='alerta_liberada'") === '1');
const inc = A.incidencias(OCT.asistencias, '2026-10-21', '2026-10-30', 'America/Los_Angeles').filter(i => i.tipo !== 'rafaga');
r = db.panel({ accion: 'incidencias_registrar', employee_id: 98, incidencias: inc }, ['nomina_usa:validar']);
check('las 5 incidencias de octubre quedan registradas para RH, sin correo', r.ok && r.nuevas === 5 && db.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe LIKE 'nomina_usa:inc%'") === '0', r);
fin();
