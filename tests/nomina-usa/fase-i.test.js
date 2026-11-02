#!/usr/bin/env node
// Fase I (#448, MVP de punta a punta): avisos entre pasos, vigilante, costo por SO para Odoo,
// conciliación del registro de Auris contra el banco y «Traer del machote» por odoo_so_id.
// Todo en sombra o apagado: la prueba dura es que en sombra NO aparece ni una fila en retardos.envio.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const AU = require('../../shared/nomina-usa/auris.js');

seccion('Registro de Auris: lector con formato configurable (shared/nomina-usa/auris.js)');
const FMT = { separador: ',', columnas: { employee_id: ['employee id'], persona: ['employee', 'name'], neto: ['net pay'], imp_empleado: ['employee taxes'], imp_patron: ['employer taxes'], fee: ['fee'] } };
let lec = AU.leer('Employee,Employee ID,Net Pay,Employee Taxes,Employer Taxes,Fee\n"Salazar, Mateo",75,"1,080.00",210.10,95.25,0\nRicardo,98,960.00,180.5,80.4,\nFee Auris,,,,,45.00\n', FMT);
check('lee las 3 filas con encabezados en otro orden y en mayúsculas', lec.ok && lec.filas.length === 3, lec);
check('número con coma de miles y comillas: 1,080.00 → 1080', lec.ok && lec.filas[0].neto === 1080 && lec.filas[0].persona === 'Salazar, Mateo');
check('celda vacía = 0', lec.ok && lec.filas[1].fee === 0);
check('totales: neto 2,040 · impuestos 566.25 · fee 45 · total 2,651.25', lec.ok && lec.totales.neto === 2040 && lec.totales.impuestos === 566.25 && lec.totales.fee === 45 && lec.totales.total === 2651.25, lec.totales);
lec = AU.leer('Nombre,Neto\nMateo,10\n', FMT);
check('si falta una columna obligatoria, falla con su nombre (no devuelve vacío)', !lec.ok && lec.error === 'COLUMNA_FALTANTE' && lec.faltan.indexOf('neto') >= 0, lec);
lec = AU.leer('Employee,Net Pay\nMateo,abc\n', { columnas: { persona: ['employee'], neto: ['net pay'] } });
check('un número ilegible se rechaza con su fila', !lec.ok && lec.error === 'NUMERO_INVALIDO' && lec.fila === 2, lec);
check('el CSV de ejemplo de la guía se lee', AU.leer(AU.EJEMPLO, FMT).ok);


(async () => {
seccion('Code de los workflows nuevos (Odoo simulado: no se toca Odoo real)');
const fs = require('fs'), path = require('path');
const AF = Object.getPrototypeOf(async function () {}).constructor;
const code = n => fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code', n), 'utf8');
['odoo-lectura-leer.js', 'costo-crear.js'].forEach(n => {
  const c = code(n);
  check(n + ': sin diagonales invertidas (§17 quirk 2c)', !/\\/.test(c));
  check(n + ': todo el cuerpo en try/catch (cuelga del Set del secreto, §9)', /^\s*try \{[\s\S]*\} catch \(e\) \{[\s\S]*\}\s*$/.test(c.replace(/^\/\*[\s\S]*?\*\/\s*/, '')));
});
check('costo-crear.js nunca publica: no llama action_post ni button_validate', !/action_post|button_validate|_post\(/.test(code('costo-crear.js')));
const nodos = (pend) => n => ({ first: () => ({ json: n === 'Set - secreto' ? { okey: 'llave-de-prueba', ourl: 'http://odoo', odb: 'db', ouser: 'u' } : n === 'Postgres - Pendientes' ? { p: pend } : { p: { journal_id: 122, dias: 35, so_ids: [2362] } } }) });
function odoo(estado) {
  const llamadas = [];
  return { llamadas, helpers: { httpRequest: async (q) => {
    const pr = q.body.params; llamadas.push(pr.service === 'common' ? 'login' : pr.args[3] + '.' + pr.args[4]);
    if (pr.service === 'common') return { body: { result: 7 } };
    const [, , , model, method, args] = pr.args;
    if (model === 'account.move' && method === 'search_read') return { body: { result: estado.existe ? [{ id: 900, state: 'draft' }] : [] } };
    if (model === 'account.move' && method === 'create') { estado.creado = args[0]; return { body: { result: 901 } }; }
    if (model === 'account.move' && method === 'read') return { body: { result: [{ id: args[0][0], state: estado.estadoLeido || 'draft' }] } };
    if (model === 'account.bank.statement.line') return { body: { result: [{ id: 34056, date: '2026-10-29', payment_ref: 'Online ACH Payment', amount: -507.69, is_reconciled: false }] } };
    if (model === 'project.project') return { body: { result: [{ id: 2362, name: 'SO11842 - prensas', account_id: [3104, 'SO11842 - prensas'] }] } };
    return { body: { result: [] } };
  } } };
}
const ASI = { id: 1, solicitud_id: 7, payload: { company_id: 6, journal_id: 50, date: '2026-11-06', ref: 'NUSA-SOL-7 · Nómina USA semana 30/10/2026',
  lineas: [{ name: 'a', account_id: 301, debit: 960, credit: 0, analytic_distribution: { 3104: 100 } }, { name: 'p', account_id: 400, debit: 0, credit: 960 }] } };
let o = odoo({}), rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: false, asientos: [ASI] }), o.helpers))[0].json;
check('costo-crear con la bandera apagada: no llama a Odoo', rc.nota === 'APAGADO' && o.llamadas.length === 0, o.llamadas);
const est = {}; o = odoo(est);
rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: true, asientos: [ASI] }), o.helpers))[0].json;
check('bandera prendida: crea UN account.move en borrador con su analítica y lo lee de vuelta', rc.resultados[0].ok && rc.resultados[0].move_id === 901 && est.creado.move_type === 'entry' && est.creado.line_ids[0][2].analytic_distribution['3104'] === 100 && o.llamadas.join() === 'login,account.move.search_read,account.move.create,account.move.read', [rc, o.llamadas]);
o = odoo({ existe: true });
rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: true, asientos: [ASI] }), o.helpers))[0].json;
check('idempotente por ref: si ya existe NUSA-SOL-7, lo reusa y NO crea otro', rc.resultados[0].ok && rc.resultados[0].move_id === 900 && rc.resultados[0].reusado && !o.llamadas.includes('account.move.create'), [rc, o.llamadas]);
o = odoo({ estadoLeido: 'posted' });
rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: true, asientos: [ASI] }), o.helpers))[0].json;
check('si Odoo lo devolviera publicado, se reporta error (se exige borrador)', !rc.resultados[0].ok && /ESTADO_posted/.test(rc.resultados[0].error), rc);
const malo = JSON.parse(JSON.stringify(ASI)); malo.payload.lineas[1].credit = 900; o = odoo({});
rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: true, asientos: [malo] }), o.helpers))[0].json;
check('un asiento que no cuadra no se manda', !rc.resultados[0].ok && /NO_CUADRA/.test(rc.resultados[0].error) && !o.llamadas.includes('account.move.create'), rc);
const sinDiario = JSON.parse(JSON.stringify(ASI)); sinDiario.payload.journal_id = null; o = odoo({});
rc = (await new AF('$', '$helpers', code('costo-crear.js'))(nodos({ activo: true, asientos: [sinDiario] }), o.helpers))[0].json;
check('sin diario no se manda (PAYLOAD_INCOMPLETO)', rc.resultados[0].error === 'PAYLOAD_INCOMPLETO' && !o.llamadas.includes('account.move.create'));
o = odoo({});
rc = (await new AF('$', '$helpers', code('odoo-lectura-leer.js'))(nodos(null), o.helpers))[0].json;
check('odoo-lectura: cargos del banco y analítica de la SO, solo lecturas (search_read)', rc.ok && rc.payload.cargos[0].monto === -507.69 && rc.payload.analiticas[0].analytic_id === 3104 && o.llamadas.every(x => x === 'login' || /search_read$/.test(x)), [rc, o.llamadas]);
rc = (await new AF('$', '$helpers', code('odoo-lectura-leer.js'))(n => ({ first: () => ({ json: n === 'Set - secreto' ? { okey: 'x' } : { p: {} } }) }), o.helpers))[0].json;
check('odoo-lectura sin llave: ok:false, no lista vacía', rc.ok === false && rc.error === 'SIN_LLAVE_ODOO');

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
const db = pg.crear();
db.q(`INSERT INTO retardos.empleado (employee_id, nombre, activo, hora_entrada, email, email_valido, parent_id, correos) VALUES
  (98, 'c', true, 8, 'richard98@fts.mx', true, 32, '[{"campo":"work_email","email":"richard98@fts.mx"}]'),
  (63, 'm', true, 8, 'magaly63@fts.mx', true, 32, '[{"campo":"work_email","email":"magaly63@fts.mx"}]'),
  (149, 'k', true, 8, 'erick149@fts.mx', true, 32, '[{"campo":"work_email","email":"erick149@fts.mx"}]'),
  (59, 'g', true, 8, 'gerardo59@fts.mx', true, 149, '[{"campo":"work_email","email":"gerardo59@fts.mx"}]'),
  (32, 'e', true, 8, 'esteban32@fts.mx', true, null, '[{"campo":"work_email","email":"esteban32@fts.mx"}]'),
  (9, 'z', true, 8, 'mx9@fts.mx', true, 112, '[{"campo":"work_email","email":"mx9@fts.mx"}]')`);
const envio = () => Number(db.q('SELECT count(*) FROM retardos.envio'));
const aviso = clave => db.j(`SELECT coalesce((SELECT to_jsonb(a) FROM nomina_usa.aviso a WHERE clave = '${clave}'), 'null'::jsonb)`);
const R = ['nomina_usa:kiosko'], MAG = ['nomina_usa:validar'], ER = ['nomina_usa:autorizar'], GE = ['nomina_usa:archivo'];
const SEM = '2026-10-30';

seccion('Banderas nuevas: todo nace apagado o en sombra');
const cfg = db.panel({ accion: 'config_ver' }, R).config;
check('avisos_modo = sombra, vigilante_modo = sombra', cfg.avisos_modo === 'sombra' && cfg.vigilante_modo === 'sombra', cfg);
check('costo_odoo_activo = false, conciliacion_activa = false', cfg.costo_odoo_activo === false && cfg.conciliacion_activa === false);
check('avisos_personas: Richard 98, Magaly 63, Erick 149, Gerardo 59, Esteban 32', JSON.stringify(cfg.avisos_personas) === '{"erick": [149], "magaly": [63], "esteban": [32], "gerardo": [59], "richard": [98]}' || (cfg.avisos_personas.richard[0] === 98 && cfg.avisos_personas.gerardo[0] === 59), cfg.avisos_personas);
check('solo Esteban mueve avisos_modo', db.panel({ accion: 'config_guardar', clave: 'avisos_modo', valor: 'real', motivo: 'x' }, ER).error === 'SCOPE_INSUFICIENTE');
check('avisos_modo solo acepta sombra o real', db.panel({ accion: 'config_guardar', clave: 'avisos_modo', valor: 'medio', motivo: 'x' }).error === 'MODO_INVALIDO');
check('costo_odoo_activo solo acepta true/false', db.panel({ accion: 'config_guardar', clave: 'costo_odoo_activo', valor: 'si', motivo: 'x' }).error === 'VALOR_INVALIDO');
check('la bandera vieja alertas_modo sigue rechazada', db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real', motivo: 'x' }).error === 'CLAVE_OBSOLETA');

seccion('Ciclo del miércoles en SOMBRA: cada paso deja su aviso y NO encola nada');
db.panel({ accion: 'bolsa_provisional', so_id: 2362, so_nombre: 'SO11842 - prensas materials - Mission Foods', supervisor: 3200, tecnicos: 7200, pagado_previo_supervisor: 2240, pagado_previo_tecnicos: 5040, folio: 'BP-2026-001' });
db.q(`INSERT INTO nomina_usa.avance_so (so_id, so_nombre, fecha, pct, reporta) VALUES (2362, 'SO11842 - prensas materials - Mission Foods', '2026-11-02', 100, 98);
      UPDATE nomina_usa.ficha SET fijo_semanal_usd = 507.59, cuenta_analitica = 'Sales FTS USA' WHERE employee_id = 97;
      SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":1,"employee_id":75,"fecha":"2026-10-30","so_id":2362,"so_nombre":"SO11842 - prensas materials - Mission Foods","horas":12.11},{"attendance_id":2,"employee_id":79,"fecha":"2026-10-30","so_id":2362,"horas":10.37},{"attendance_id":3,"employee_id":98,"fecha":"2026-10-30","so_id":2362,"horas":19.88}]}'::jsonb);`);
const e0 = envio();
const ok = { semana: SEM, sos: [{ so_id: 2362, so_nombre: 'SO11842 - prensas materials - Mission Foods', est_mie: 100, est_jue: 100, reparto: { supervisor: { 98: 960 }, tecnicos: { 75: 1163.27, 79: 996.73 } } }],
  comercial: [{ employee_id: 98, fecha: '2026-11-04', pct: 20, estimado: true, sugerido: 20 }], fijos: [{ employee_id: 97 }] };
let r = db.panel({ accion: 'solicitud_enviar', envio: ok }, R, 'ricardo');
check('Richard envía', r.ok, r);
const sid = r.id;
let a = aviso('enviada:' + sid);
check('al enviar: aviso a Magaly, en sombra, sin encolar', a && a.evento === 'enviada' && a.roles[0] === 'magaly' && a.modo_al_crear === 'sombra' && a.encolada === false, a);
check('…con su correo calculado (1 destinatario) y el total pedido en el texto', a.para.length === 1 && /USD 3,655\.59/.test(a.html), [a.para.length, a.html]);
db.panel({ accion: 'solicitud_validar', id: sid }, MAG, 'magaly');
check('al validar Magaly: aviso a Erick', aviso('validada:' + sid).roles.join() === 'erick');
db.panel({ accion: 'solicitud_autorizar', id: sid }, ER, 'erick');
a = aviso('autorizada:' + sid);
check('al autorizar Erick: aviso a Gerardo con la liga a la pantalla', a.roles.join() === 'gerardo' && /yinyo1\.github\.io\/fts-suite\/modulos\/rh\/nomina-usa/.test(a.html), a.html);
db.panel({ accion: 'solicitud_archivo', id: sid }, GE, 'gerardo');
db.panel({ accion: 'solicitud_subida', id: sid }, GE, 'gerardo');
check('al marcar subido: confirmación a Richard, Magaly y Erick', aviso('subida:' + sid).roles.join() === 'richard,magaly,erick');
check('EN SOMBRA: cero filas nuevas en retardos.envio después de todo el ciclo', envio() === e0, envio());
check('ninguna fila nomina_usa:aviso:% en retardos.envio', db.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe LIKE 'nomina_usa:aviso:%'") === '0');
check('ningún aviso en sombra quedó encolado (CHECK aviso_sombra_ck)', db.q("SELECT count(*) FROM nomina_usa.aviso WHERE modo_al_crear = 'sombra' AND encolada") === '0');
let falla = '';
try { db.q("INSERT INTO nomina_usa.aviso (clave, origen, evento, roles, asunto, html, modo_al_crear, encolada) VALUES ('x','aviso','x','{esteban}','x','x','sombra',true)"); } catch (e) { falla = String(e.message); }
check('la base impide un aviso en sombra marcado como encolado', /aviso_sombra_ck/.test(falla), falla);

seccion('Devolución y «Pedir a Magaly que la revise»');
const s2 = db.panel({ accion: 'solicitud_enviar', envio: { semana: '2026-11-06', sos: [], comercial: [], fijos: [{ employee_id: 97 }] } }, R, 'ricardo').id;
db.panel({ accion: 'solicitud_devolver', id: s2, motivo: 'Falta el avance de SO11791' }, ER, 'erick');
a = aviso('devuelta:' + s2);
check('devolución con motivo: aviso a Richard con el motivo', a.roles.join() === 'richard' && /Falta el avance de SO11791/.test(a.html), a);
db.q(`INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, modo_al_crear, estado) VALUES ('d1', 'incidencia_periodo', 79, '2026-11-06', 'sombra', 'en_disputa')`);
const aid = db.q("SELECT id FROM nomina_usa.alerta WHERE clave='d1'");
db.panel({ accion: 'pedir_revision', id: Number(aid) }, R, 'ricardo');
db.panel({ accion: 'pedir_revision', id: Number(aid) }, R, 'ricardo');
check('«Pedir a Magaly que la revise»: un aviso a Magaly, aunque se pida dos veces', db.q("SELECT count(*) FROM nomina_usa.aviso WHERE clave = 'revision:" + aid + "'") === '1' && aviso('revision:' + aid).roles.join() === 'magaly');
check('todo en sombra: retardos.envio sigue igual', envio() === e0);

seccion('Avisos por reloj (CST) y dedupe');
db.q("UPDATE nomina_usa.solicitud SET estado = 'devuelta' WHERE semana = '2026-11-06'");
const T = h => `SELECT nomina_usa.avisos_reloj('${h}')`;
check('miércoles 11-nov 07:59 CST: todavía no', db.j(T('2026-11-11T13:59:00Z')).avisos.length === 0);
r = db.j(T('2026-11-11T14:00:00Z'));
check('miércoles 08:00 CST sin envío: recordatorio a Richard', r.avisos.length === 1 && aviso('recordatorio:2026-11-06').roles.join() === 'richard', r);
r = db.j(T('2026-11-11T15:00:00Z'));
check('09:00 CST sin envío: aviso a Magaly y Erick (y el recordatorio no se repite)', r.avisos.some(x => x.clave === 'sin_envio_9:2026-11-06' && x.nuevo) && !r.avisos.some(x => x.clave === 'recordatorio:2026-11-06' && x.nuevo), r);
check('repetir la corrida no duplica', db.j(T('2026-11-11T15:15:00Z')).avisos.every(x => !x.nuevo) && db.q("SELECT count(*) FROM nomina_usa.aviso WHERE clave LIKE '%2026-11-06'") === '2');
check('con la solicitud viva, el miércoles 4-nov no hay recordatorio', db.j(T('2026-11-04T15:00:00Z')).avisos.length === 0);
db.q(`INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido) VALUES (98, '2026-11-04', 'real', '[{"clave":"COMERCIAL","pct":0}]', true)`);
r = db.j(T('2026-11-06T17:00:00Z'));
a = aviso('resumen_ajuste:2026-10-30');
check('viernes 6-nov 11:00 CST: resumen del ajuste a Richard y Erick (comercial 20 % estimado, 0 % real → −28)', a && a.roles.join() === 'richard,erick' && /USD -28\.00/.test(a.html), a && a.html);
check('el resumen no sale dos veces', db.j(T('2026-11-06T18:00:00Z')).avisos.every(x => !x.nuevo));

seccion('Vigilante (sombra): un aviso por evento, a Esteban y Erick');
const V = h => db.j(`SELECT nomina_usa.vigilante('${h}')`);
db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-11T14:00:00Z'");
r = V('2026-11-11T14:20:00Z');
check('alertas corrió hace 20 min: sin aviso de alertas', !r.avisos.some(x => /^vig_alertas/.test(x.clave)), r);
r = V('2026-11-11T14:31:00Z');
check('alertas sin correr 31 min: aviso a Esteban y Erick', r.avisos.some(x => /^vig_alertas/.test(x.clave) && x.nuevo) && aviso(r.avisos.find(x => /^vig_alertas/.test(x.clave)).clave).roles.join() === 'esteban,erick', r);
check('…y no se repite en la siguiente corrida de la misma caída', V('2026-11-11T14:46:00Z').avisos.filter(x => /^vig_alertas/.test(x.clave)).every(x => !x.nuevo));
db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-11T17:59:00Z'");
r = V('2026-11-11T15:31:00Z');
check('miércoles 9:31 CST sin envío: aviso del vigilante', r.avisos.some(x => x.clave === 'vig_sin_envio:2026-11-06' && x.nuevo), r);
r = V('2026-11-11T17:01:00Z');
check('11:01 CST no autorizada: aviso', r.avisos.some(x => x.clave === 'vig_sin_autorizar:2026-11-06' && x.nuevo));
r = V('2026-11-11T18:01:00Z');
check('12:01 CST no subida: aviso', r.avisos.some(x => x.clave === 'vig_sin_subir:2026-11-06' && x.nuevo));
db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-04T18:00:00Z'");
check('semana 30-oct ya subida: a las 12:01 del 4-nov no avisa de subida', !V('2026-11-04T18:01:00Z').avisos.some(x => /vig_sin_(envio|autorizar|subir):2026-10-30/.test(x.clave)));
db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-06T17:59:00Z'");
// El envío de la semana siguiente ya lo guardó (a_solicitud_enviar_con_ajuste): se borra para simular que nadie lo corrió.
db.q("DELETE FROM nomina_usa.ajuste WHERE semana_origen = '2026-10-30'");
r = V('2026-11-06T18:00:00Z');
check('viernes 12:00 CST: el ajuste del 30-oct no se guardó → aviso «ajuste del viernes no corrió»', r.avisos.some(x => x.clave === 'vig_ajuste:2026-10-30' && x.nuevo), r);
db.q("SELECT nomina_usa.ajuste_viernes('2026-10-30')");
db.q("DELETE FROM nomina_usa.aviso WHERE clave = 'vig_ajuste:2026-10-30'");
check('corrido el ajuste, ya no avisa', !V('2026-11-06T18:15:00Z').avisos.some(x => x.clave === 'vig_ajuste:2026-10-30'));
db.q(`SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":11,"employee_id":75,"fecha":"2026-11-03","so_id":2362,"horas":10},{"attendance_id":12,"employee_id":75,"fecha":"2026-11-04","so_id":2362,"horas":10},{"attendance_id":13,"employee_id":75,"fecha":"2026-11-05","so_id":2362,"horas":10}]}'::jsonb)`);
db.q("UPDATE nomina_usa.horas_dia SET updated_at = '2026-11-05T20:00:00Z'");
r = V('2026-11-05T20:10:00Z');
check('SO11842 con 3 días de checadas después de su último avance (2-nov): aviso «sin avance»', r.avisos.some(x => x.clave === 'vig_so_sin_avance:2362:2026-11-02' && x.nuevo), r);
check('con 2 días no avisaría (umbral «más de 2»)', (() => { db.q('DELETE FROM nomina_usa.horas_dia WHERE attendance_id = 13'); db.q("DELETE FROM nomina_usa.aviso WHERE clave LIKE 'vig_so_sin_avance%'"); return !V('2026-11-05T20:11:00Z').avisos.some(x => /vig_so_sin_avance/.test(x.clave)); })());
check('vigilante en sombra: retardos.envio sigue igual', envio() === e0);

seccion('Avisos en REAL: se encolan en la bandeja de Retardos, una vez');
db.panel({ accion: 'config_guardar', clave: 'avisos_modo', valor: 'real', motivo: 'prueba' });
const s3 = db.panel({ accion: 'solicitud_enviar', envio: { semana: '2026-11-06', sos: [], comercial: [], fijos: [{ employee_id: 97 }] } }, R, 'ricardo').id;
a = aviso('enviada:' + s3);
check('en real el aviso de envío se encola para Magaly', a.modo_al_crear === 'real' && a.encolada && db.q("SELECT para::text FROM retardos.envio WHERE clave_dedupe = 'nomina_usa:aviso:enviada:" + s3 + "'") === '["magaly63@fts.mx"]', a);
check('una sola fila nueva en retardos.envio', envio() === e0 + 1, envio());
db.panel({ accion: 'config_guardar', clave: 'avisos_modo', valor: 'sombra', motivo: 'prueba' });
db.panel({ accion: 'solicitud_validar', id: s3 }, MAG, 'magaly');
check('de vuelta en sombra: el siguiente aviso ya no se encola', aviso('validada:' + s3).encolada === false && envio() === e0 + 1);
check('el vigilante sigue en sombra aunque avisos esté en real (bandera aparte)', db.q("SELECT count(*) FROM nomina_usa.aviso WHERE origen = 'vigilante' AND encolada") === '0');

seccion('Un aviso que falla NO tumba la acción del usuario');
db.q("UPDATE nomina_usa.config SET valor = '{\"magaly\":\"no-es-lista\"}' WHERE clave = 'avisos_personas'");
r = db.panel({ accion: 'solicitud_devolver', id: s3, motivo: 'prueba de falla del aviso' }, ER, 'erick');
check('la devolución pasa aunque el aviso no se pueda armar', r.ok && db.q('SELECT estado FROM nomina_usa.solicitud WHERE id=' + s3) === 'devuelta', r);
db.q(`UPDATE nomina_usa.config SET valor = '{"richard":[98],"magaly":[63],"erick":[149],"gerardo":[59],"esteban":[32]}' WHERE clave = 'avisos_personas'`);

seccion('Costo en Odoo por SO (bandera apagada: solo payload)');
const as = db.j('SELECT to_jsonb(a) FROM nomina_usa.asiento a WHERE solicitud_id = ' + sid);
check('al marcar «subido» la base armó el asiento en vista previa', as && as.estado === 'vista_previa', as);
const L = as.payload.lineas;
const de = (cuenta, analytic) => L.filter(l => l.cuenta === cuenta && l.analytic_distribution && l.analytic_distribution[analytic] === 100);
check('SO11842 supervisor 960 → analítica 3104 (SO11842)', de('SO11842', '3104').some(l => l.employee_id === 98 && Number(l.debit) === 960), L);
check('SO11842 técnicos suman 2,160 → analítica 3104', Math.round(de('SO11842', '3104').filter(l => l.employee_id !== 98).reduce((s, l) => s + Number(l.debit), 0) * 100) === 216000);
check('Rissia 507.59 → «Sales FTS USA» (3089)', de('Sales FTS USA', '3089').some(l => l.employee_id === 97 && Number(l.debit) === 507.59), L.map(l => l.cuenta + ':' + l.debit));
check('comercial de Ricardo 28 → COMERCIAL-USA (3089)', de('COMERCIAL-USA', '3089').some(l => Number(l.debit) === 28));
const deb = L.reduce((s, l) => s + Number(l.debit), 0), cre = L.reduce((s, l) => s + Number(l.credit), 0);
check('el asiento cuadra: debe = haber = 3,655.59 (contra la cuenta puente)', Math.round(deb * 100) === Math.round(cre * 100) && Math.round(cre * 100) === 365559 && L.some(l => l.cuenta === 'PUENTE' && Number(l.credit) === 3655.59), [deb, cre]);
check('ref NUSA-SOL-<id>, fecha el viernes de pago (6-nov), diario de la empresa 6', as.payload.ref.indexOf('NUSA-SOL-' + sid) === 0 && as.payload.date === '2026-11-06' && as.payload.company_id === 6);
check('faltantes visibles: diario y cuenta puente (la empresa 6 no los tiene)', as.faltantes.some(f => /^DIARIO/.test(f)) && as.faltantes.some(f => /^CUENTA_PUENTE/.test(f)), as.faltantes);
check('bandera apagada: el workflow no recibe nada', JSON.stringify(db.j('SELECT nomina_usa.costo_pendientes()')) === '{"activo":false,"asientos":[]}');
db.q(`UPDATE nomina_usa.config SET valor = '{"company_id":6,"journal_id":999,"cuenta_gasto_id":301,"cuenta_puente_id":998,"analiticas":{"COMERCIAL-USA":3089,"Sales FTS USA":3089}}' WHERE clave = 'costo_odoo_mapa'`);
db.panel({ accion: 'costo_preparar', id: sid }, GE, 'gerardo');
check('con diario y puente puestos, el asiento queda sin faltantes', db.q('SELECT jsonb_array_length(faltantes) FROM nomina_usa.asiento WHERE solicitud_id=' + sid) === '0');
check('…pero con la bandera apagada sigue sin salir', db.j('SELECT nomina_usa.costo_pendientes()').asientos.length === 0);
db.panel({ accion: 'config_guardar', clave: 'costo_odoo_activo', valor: true, motivo: 'prueba' });
const pend = db.j('SELECT nomina_usa.costo_pendientes()');
check('bandera prendida: el workflow recibe el asiento completo', pend.activo === true && pend.asientos.length === 1 && pend.asientos[0].payload.journal_id === 999);
db.q(`SELECT nomina_usa.costo_resultado('{"resultados":[{"id":${pend.asientos[0].id},"ok":true,"move_id":555}]}'::jsonb)`);
check('resultado del workflow: borrador_creado con su move id, y ya no se vuelve a mandar', db.q('SELECT estado || \':\' || odoo_move_id FROM nomina_usa.asiento WHERE solicitud_id=' + sid) === 'borrador_creado:555' && db.j('SELECT nomina_usa.costo_pendientes()').asientos.length === 0);
check('un asiento ya creado en Odoo no se recalcula', db.panel({ accion: 'costo_preparar', id: sid }, GE, 'gerardo').sin_cambios === true);
db.panel({ accion: 'config_guardar', clave: 'costo_odoo_activo', valor: false, motivo: 'prueba' });
check('Richard no ve el costo', db.panel({ accion: 'costo_ver', id: sid }, R).error === 'SCOPE_INSUFICIENTE');

seccion('Conciliación de Auris contra el banco (vista previa)');
const filas = [{ employee_id: 98, persona: 'Ricardo', neto: 988, imp_empleado: 180.5, imp_patron: 80.4, fee: 0 }, { employee_id: 75, persona: 'Mateo', neto: 1163.27, imp_empleado: 210.1, imp_patron: 95.25, fee: 0 },
  { employee_id: 79, persona: 'José Luis', neto: 996.73, imp_empleado: 190, imp_patron: 85, fee: 0 }, { employee_id: 97, persona: 'Rissia', neto: 507.59, imp_empleado: 90, imp_patron: 40, fee: 0 },
  { persona: 'Fee Auris', neto: 0, imp_empleado: 0, imp_patron: 0, fee: 45 }];
// total = 3,655.59 neto + 971.25 impuestos + 45 fee = 4,671.84 → en dos cargos
db.q(`SELECT nomina_usa.banco_registrar('{"cargos":[{"id":9001,"journal_id":122,"fecha":"2026-11-05","ref":"AURIS PAYROLL NET 1105","monto":-3655.59},{"id":9002,"journal_id":122,"fecha":"2026-11-05","ref":"AURIS PAYROLL TAX 1105","monto":-1016.25},{"id":9003,"journal_id":122,"fecha":"2026-11-05","ref":"Home Depot","monto":-1016.25}]}'::jsonb)`);
r = db.panel({ accion: 'auris_importar', semana: SEM, fecha_pago: '2026-11-06', filas }, GE, 'gerardo');
check('importa el registro, la base calcula los totales', r.ok && Number(r.totales.total) === 4671.84 && Number(r.totales.neto) === 3655.59, r);
check('cuadra con DOS cargos del banco (neto + impuestos y fee), sin tomar el de Home Depot', r.revision.cuadra === true && JSON.stringify(r.revision.cargos) === '[9001,9002]', r.revision);
let cv = db.panel({ accion: 'conciliacion_ver', semana: SEM }, GE).conciliacion;
check('propuesta: neto 3,655.59 → puente · impuestos 971.25 → impuestos pagados · fee 45 → gasto admin', Number(cv.propuesta[0].debe) === 3655.59 && Number(cv.propuesta[1].debe) === 971.25 && Number(cv.propuesta[2].debe) === 45, cv.propuesta);
check('diferencia por persona contra lo autorizado: Ricardo 988 en Auris vs 988 autorizado → sin diferencias', cv.diferencias_persona.length === 0, cv.diferencias_persona);
check('el registro bueno no avisa a Gerardo', aviso('concilia_no_cuadra:' + r.id) === null);
db.q(`SELECT nomina_usa.banco_registrar('{"cargos":[{"id":9101,"journal_id":122,"fecha":"2026-11-12","ref":"AURIS PAYROLL","monto":-100.00},{"id":9102,"journal_id":122,"fecha":"2026-11-12","ref":"AURIS PAYROLL","monto":-200.00},{"id":9103,"journal_id":122,"fecha":"2026-11-13","ref":"AURIS FEE","monto":-45.00}]}'::jsonb)`);
r = db.panel({ accion: 'auris_importar', semana: '2026-11-06', fecha_pago: '2026-11-13', filas: [{ employee_id: 97, persona: 'Rissia', neto: 250, imp_empleado: 30, imp_patron: 20, fee: 45 }] }, GE, 'gerardo');
check('cuadra con TRES cargos (100 + 200 + 45 = 345)', r.revision.cuadra === true && r.revision.cargos.length === 3, r.revision);
r = db.panel({ accion: 'auris_importar', semana: '2026-11-06', fecha_pago: '2026-11-13', filas: [{ employee_id: 97, persona: 'Rissia', neto: 260, imp_empleado: 30, imp_patron: 20, fee: 45 }] }, GE, 'gerardo');
check('si no cuadra (355 contra 345 del banco): aviso a Gerardo, en sombra', r.revision.cuadra === false && aviso('concilia_no_cuadra:' + r.id).roles.join() === 'gerardo' && aviso('concilia_no_cuadra:' + r.id).modo_al_crear === 'sombra', r.revision);
check('el registro nuevo deja al anterior como no vigente (uno por semana)', db.q("SELECT count(*) FROM nomina_usa.auris_registro WHERE semana = '2026-11-06' AND vigente") === '1');
check('un número negativo en el registro se rechaza', db.panel({ accion: 'auris_importar', semana: SEM, filas: [{ persona: 'x', neto: -5 }] }, GE, 'gerardo').error === 'REGISTRO_INVALIDO');
const pr = db.j("SELECT nomina_usa.prorrateo_impuestos('2026-11-06')");
const sumaPr = pr.lineas.reduce((s, l) => s + Number(l.impuestos), 0);
check('prorrateo de noviembre: los impuestos se reparten a las cuentas en proporción al neto y suman exacto', Math.round(sumaPr * 100) === Math.round(Number(pr.impuestos) * 100) && pr.lineas.some(l => l.cuenta === 'SO11842' && l.analytic_id === 3104), pr);
check('SO11842 se lleva la parte de su neto (3,120 de 3,655.59 en la semana 30-oct)', (() => { const l = pr.lineas.find(x => x.cuenta === 'SO11842'); return l && Number(l.neto) === 3120; })(), pr.lineas);
check('conciliación en sombra: retardos.envio sigue igual que con avisos en sombra', envio() === e0 + 1);

seccion('«Traer del machote» también por comercial.machote.odoo_so_id (0013)');
const DOC = { secciones: [{ mo: [{ rol: 'supervisor_sr', qty: 16, personas: 1, pu: 200, moneda: 'USD' }, { rol: 'tecnicos', qty: 40, personas: 1, pu: 140, moneda: 'USD' }] }] };
db.q(`INSERT INTO comercial.machote (id, dueno, odoo_so_id, odoo_so_name, orden_creada_at, orden_creada_por) VALUES ('22222222-2222-2222-2222-222222222222', 'prueba', 12345, 'SO11999', now(), 'prueba');
      INSERT INTO comercial.machote_version (machote_id, version, autor, estado, documento, moneda) VALUES ('22222222-2222-2222-2222-222222222222', 1, 'prueba', 'enviado', '${JSON.stringify(DOC)}'::jsonb, 'USD');`);
const bm = db.j('SELECT nomina_usa.bolsa_de_machote(12345)');
check('SO ligada solo por machote.odoo_so_id: 3,200 supervisor / 5,600 técnicos', bm && Number(bm.supervisor) === 3200 && Number(bm.tecnicos) === 5600, bm);
check('orden sin machote → NULL (no inventa)', db.q('SELECT nomina_usa.bolsa_de_machote(54321) IS NULL') === 't');
fin();
})();
