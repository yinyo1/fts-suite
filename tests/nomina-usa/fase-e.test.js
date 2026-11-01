#!/usr/bin/env node
// Fase E (#448): solicitud del miércoles, candados, revisión (Magaly → Erick → Gerardo) y archivo para Auris.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const N = require('../../shared/nomina-usa/nomina.js');

seccion('Semana FTS y reglas puras');
const sem = N.semanaFTS('2026-11-04');
check('el miércoles 4-nov cae en la semana vie 30-oct → jue 5-nov', sem.inicio === '2026-10-30' && sem.fin === '2026-11-05' && sem.miercoles === '2026-11-04');
check('el viernes abre su propia semana', N.semanaFTS('2026-11-06').inicio === '2026-11-06');
check('estimado de jueves menor al de miércoles NO se acepta', /jueves no puede ser menor/.test(N.validarEstimados(80, 90, 85)));
check('estimado de miércoles menor al último reportado no se acepta', /miércoles no puede ser menor/.test(N.validarEstimados(80, 70, 90)));
check('80 → 90 → 100 pasa', N.validarEstimados(80, 90, 100) === null);
const rs = N.repartoSugerido(2160, { 75: 18, 79: 16 });
check('reparto sugerido de técnicos por horas cuadra al centavo (2,160)', Math.round((rs[75] + rs[79]) * 100) === 216000 && rs[75] > rs[79], rs);
check('comercial: 140 × 30 % = 42 por día', N.pagoComercial([{ fecha: 'x', pct: 30 }]).total === 42);
check('fijo 700 con 1 falta confirmada = 560', N.fijoAsistencia(700, 1) === 560);
const cd = N.candados({ personas: [75, 79, 98], alertas: [{ id: 9, employee_id: 79, estado: 'en_disputa' }], dias_pendientes: [{ employee_id: 98, fecha: '2026-11-02' }],
  sos: [{ so_id: 1, so_nombre: 'SO11842', bolsa: { supervisor: 3200, tecnicos: 7200 }, avance_jueves: 100, pagado: { supervisor: 2240, tecnicos: 5040 }, reparto: { supervisor: { 98: 960 }, tecnicos: { 75: 1440, 79: 1440 } } },
        { so_id: 2, so_nombre: 'SO11791', bolsa: null, reparto: { tecnicos: { 75: 100 } } }] });
check('JS: repartir 2,880 de técnicos en SO11842 bloquea', cd.envio.some(e => e.codigo === 'EXCEDE_DISPONIBLE' && e.rol === 'tecnicos'));
check('JS: supervisor 960 pasa', !cd.envio.some(e => e.codigo === 'EXCEDE_DISPONIBLE' && e.rol === 'supervisor'));
check('JS: SO sin bolsa bloquea', cd.envio.some(e => e.codigo === 'SIN_BOLSA'));
check('JS: disputa bloquea el envío con «Valídala con Magaly»', cd.envio.some(e => e.codigo === 'EN_DISPUTA' && /Valídala con Magaly/.test(e.mensaje)));
check('JS: día sin validar bloquea la autorización', cd.autorizacion.some(e => e.codigo === 'DIA_SIN_VALIDAR'));
const csv = N.csvAuris([{ persona: 'Mateo', employee_id: 75, neto: 1080, cuenta: 'SO11842', semana: '2026-10-30' }, { persona: 'Ricardo, R.', employee_id: 98, neto: 42.5, cuenta: 'COMERCIAL-USA', semana: '2026-10-30' }, { persona: 'X', employee_id: 1, neto: 0, cuenta: 'SO1', semana: 's' }]);
check('CSV de Auris: cabecera, dos decimales, comillas cuando hace falta, sin ceros', csv === 'persona,employee_id,neto_usd,cuenta,semana\nMateo,75,1080.00,SO11842,2026-10-30\n"Ricardo, R.",98,42.50,COMERCIAL-USA,2026-10-30\n', csv);

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Solicitud en la base (Postgres real)');
const db = pg.crear();
const SEM = '2026-10-30';
db.panel({ accion: 'bolsa_provisional', so_id: 501, so_nombre: 'SO11842 - prensas', supervisor: 3200, tecnicos: 7200, pagado_previo_supervisor: 2240, pagado_previo_tecnicos: 5040, folio: 'EDC-PRUEBA' });
db.q(`INSERT INTO nomina_usa.avance_so (so_id, so_nombre, fecha, pct, reporta) VALUES (501, 'SO11842 - prensas', '2026-11-02', 100, 98), (502, 'SO11791', '2026-11-02', 40, 98);
      SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":1,"employee_id":75,"fecha":"2026-11-02","so_id":501,"so_nombre":"SO11842 - prensas","horas":18},{"attendance_id":2,"employee_id":79,"fecha":"2026-11-02","so_id":501,"horas":16},{"attendance_id":3,"employee_id":98,"fecha":"2026-11-02","so_id":501,"horas":9},{"attendance_id":4,"employee_id":75,"fecha":"2026-11-03","so_id":502,"so_nombre":"SO11791","horas":9}]}'::jsonb);
      UPDATE nomina_usa.ficha SET fijo_semanal_usd = 700 WHERE employee_id = 97;`);
const R = ['nomina_usa:kiosko'], MAG = ['nomina_usa:validar'], ER = ['nomina_usa:autorizar'], GE = ['nomina_usa:archivo'];
let ctx = db.panel({ accion: 'solicitud_contexto', semana: SEM }, R, 'ricardo');
const s501 = ctx.sos && ctx.sos.find(s => s.so_id === 501);
check('contexto: SO11842 con bolsa, pagado previo y horas por persona', ctx.ok && s501 && Number(s501.pagado.tecnicos) === 5040 && Number(s501.horas['75']) === 18, ctx);
check('contexto: SO11791 aparece SIN bolsa', ctx.sos.some(s => s.so_id === 502 && s.bolsa === null));
const base = { semana: SEM, sos: [{ so_id: 501, so_nombre: 'SO11842 - prensas', est_mie: 100, est_jue: 100, reparto: { supervisor: { 98: 960 }, tecnicos: { 75: 1440, 79: 1440 } } }],
  comercial: [{ employee_id: 98, fecha: '2026-11-04', pct: 20, estimado: true, sugerido: 20 }], fijos: [{ employee_id: 97 }] };
let r = db.panel({ accion: 'solicitud_enviar', envio: base }, R, 'ricardo');
check('SO11842: repartir 2,880 a técnicos se bloquea en la base', r.error === 'CANDADOS' && r.errores.some(e => e.codigo === 'EXCEDE_DISPONIBLE' && e.rol === 'tecnicos' && Number(e.disponible) === 2160), r);
r = db.panel({ accion: 'solicitud_enviar', envio: Object.assign({}, base, { sos: [{ so_id: 502, so_nombre: 'SO11791', est_mie: 40, est_jue: 50, reparto: { tecnicos: { 75: 100 } } }] }) }, R, 'ricardo');
check('SO sin bolsa no permite pedir pago', r.error === 'CANDADOS' && r.errores.some(e => e.codigo === 'SIN_BOLSA'), r);
r = db.panel({ accion: 'solicitud_enviar', envio: Object.assign({}, base, { sos: [{ so_id: 501, so_nombre: 'SO11842', est_mie: 100, est_jue: 90, reparto: {} }] }) }, R, 'ricardo');
check('estimado de jueves menor al de miércoles no se acepta', r.error === 'CANDADOS' && r.errores[0].codigo === 'ESTIMADO_INVALIDO', r);
// disputa
db.q(`INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, modo_al_crear, estado) VALUES ('d1', 'incidencia_periodo', 79, '2026-11-02', 'sombra', 'en_disputa')`);
const ok = Object.assign({}, base, { sos: [{ so_id: 501, so_nombre: 'SO11842 - prensas', est_mie: 100, est_jue: 100, sugerido: { tecnicos: { 75: 1143.53, 79: 1016.47 } }, reparto: { supervisor: { 98: 960 }, tecnicos: { 75: 1143.53, 79: 1016.47 } } }] });
r = db.panel({ accion: 'solicitud_enviar', envio: ok }, R, 'ricardo');
check('incidencia en disputa BLOQUEA el envío: «Valídala con Magaly»', r.error === 'EN_DISPUTA' && /Valídala con Magaly/.test(r.mensaje), r);
const aid = Number(db.q("SELECT id FROM nomina_usa.alerta WHERE clave='d1'"));
r = db.panel({ accion: 'pedir_revision', id: aid }, R, 'ricardo');
check('«Pedir a Magaly que la revise» deja la marca; en sombra no encola correo', r.ok && r.notificada === false && db.q('SELECT revision_pedida_por FROM nomina_usa.alerta WHERE id=' + aid) === 'ricardo' && db.q('SELECT count(*) FROM retardos.envio') === '0', r);
check('sigue bloqueado mientras Magaly no la libere', db.panel({ accion: 'solicitud_enviar', envio: ok }, R, 'ricardo').error === 'EN_DISPUTA');
db.panel({ accion: 'alerta_marcar', id: aid, estado: 'error_corregido', nota: 'checada corregida' }, MAG, 'magaly');
r = db.panel({ accion: 'solicitud_enviar', envio: ok }, R, 'ricardo');
check('liberada por Magaly: la solicitud se envía', r.ok, r);
const sid = r.id;
check('una sola solicitud viva por semana', db.panel({ accion: 'solicitud_enviar', envio: ok }, R, 'ricardo').error === 'YA_ENVIADA');
let v = db.panel({ accion: 'solicitud_ver', id: sid }, ER);
check('líneas: 2 técnicos + 1 supervisor + 1 comercial + 1 fijo', v.lineas.length === 5, v.lineas.map(l => l.tipo + ':' + l.monto));
check('cada línea con su analítica (SO11842 o COMERCIAL-USA)', v.lineas.every(l => l.cuenta === 'SO11842' || l.cuenta === 'COMERCIAL-USA'));
check('el comercial lo recalcula la base: 140 × 20 % = 28', v.lineas.some(l => l.tipo === 'comercial' && Number(l.monto) === 28));
check('el fijo de Rissia sale de su ficha: 700', v.lineas.some(l => l.tipo === 'fijo' && Number(l.monto) === 700));
// días sin validar → no se autoriza
db.q(`INSERT INTO nomina_usa.dia (employee_id, fecha, pais, origen, pendiente_rh) VALUES (75, '2026-11-02', 'USA', 'declarado', true)`);
check('Erick no autoriza lo que Magaly no validó', db.panel({ accion: 'solicitud_autorizar', id: sid }, ER, 'erick').error === 'NO_VALIDADA');
check('Magaly no valida con un día sin validar', db.panel({ accion: 'solicitud_validar', id: sid }, MAG, 'magaly').error === 'DIA_SIN_VALIDAR');
db.panel({ accion: 'dia_validar', employee_id: 75, fecha: '2026-11-02', pais: 'USA' }, MAG, 'magaly');
check('validado el día, Magaly valida', db.panel({ accion: 'solicitud_validar', id: sid }, MAG, 'magaly').ok);
check('Richard no puede autorizar', db.panel({ accion: 'solicitud_autorizar', id: sid }, R, 'ricardo').error === 'SCOPE_INSUFICIENTE');
const lin = v.lineas.find(l => l.rol === 'tecnicos' && l.employee_id === 75);
r = db.panel({ accion: 'solicitud_autorizar', id: sid, decisiones: [{ linea_id: lin.id, decision: 'monto', monto: 2000 }] }, ER, 'erick');
check('Erick no autoriza más de lo pedido sin folio de Esteban', r.ok === false && /sl_tope_ck/.test(r.detalle || ''), r);
r = db.panel({ accion: 'solicitud_autorizar', id: sid }, ER, 'erick');
check('Erick autoriza', r.ok, r);
check('Gerardo no marca subido sin descargar el archivo', db.panel({ accion: 'solicitud_subida', id: sid }, GE, 'gerardo').error === 'ARCHIVO_NO_DESCARGADO');
r = db.panel({ accion: 'solicitud_archivo', id: sid }, GE, 'gerardo');
check('archivo de netos: una fila por persona y cuenta', r.ok && r.lineas.length === 5 && r.lineas.some(x => x.employee_id === 98 && x.cuenta === 'SO11842' && Number(x.neto) === 960), r);
check('Gerardo marca subido', db.panel({ accion: 'solicitud_subida', id: sid }, GE, 'gerardo').ok && db.q('SELECT estado FROM nomina_usa.solicitud WHERE id=' + sid) === 'subida');
check('lo autorizado cuenta como pagado: SO11842 técnicos ya sin disponible', Number(db.q("SELECT nomina_usa.disponible(501, 'tecnicos', 100)")) === 0 && db.q("SELECT nomina_usa.pagado(501, 'supervisor')") === '3200.00');
check('pagado acumulado nunca > bolsa', db.q("SELECT nomina_usa.pagado(501,'tecnicos') <= 7200") === 't');
// comercial con excepción
db.q(`INSERT INTO nomina_usa.avance_so (so_id, so_nombre, fecha, pct, reporta) VALUES (501, 'SO11842 - prensas', '2026-11-09', 100, 98)`);
const ex = { semana: '2026-11-06', sos: [], comercial: [{ employee_id: 98, fecha: '2026-11-09', pct: 50, sugerido: 30, excepcion: true, explicacion: 'corto' }] };
check('comercial con excepción sin explicación no se envía', db.panel({ accion: 'solicitud_enviar', envio: ex }, R, 'ricardo').errores.some(e => e.codigo === 'EXCEPCION_SIN_EXPLICACION'));
ex.comercial[0].explicacion = 'Visita a cliente nuevo para levantamiento';
const s2 = db.panel({ accion: 'solicitud_enviar', envio: ex }, R, 'ricardo').id;
db.panel({ accion: 'solicitud_validar', id: s2 }, MAG, 'magaly');
check('Erick no puede autorizar sin decidir la excepción', db.panel({ accion: 'solicitud_autorizar', id: s2 }, ER, 'erick').error === 'EXCEPCION_SIN_DECISION');
const ls2 = db.panel({ accion: 'solicitud_ver', id: s2 }, ER).lineas, lc = ls2.find(l => l.tipo === 'comercial');
check('con la 0006, la semana siguiente trae además el ajuste del viernes (−28 del 4-nov estimado)', ls2.some(l => l.tipo === 'ajuste' && Number(l.monto) === -28));
check('comercial 50 % = 70, sugerido 30 % = 42', Number(lc.monto) === 70 && Number(lc.sugerido) === 42);
r = db.panel({ accion: 'solicitud_autorizar', id: s2, decisiones: [{ linea_id: lc.id, decision: 'bajar_sugerido' }] }, ER, 'erick');
check('Erick la baja al sugerido: se autorizan 42', r.ok && db.q('SELECT autorizado_monto FROM nomina_usa.solicitud_linea WHERE id=' + lc.id) === '42.00', r);
check('todo el flujo quedó en bitácora', Number(db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento IN ('solicitud_enviada','solicitud_validada','solicitud_autorizada','archivo_descargado','subida_auris','revision_pedida')")) >= 7);
fin();
