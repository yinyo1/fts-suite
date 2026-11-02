#!/usr/bin/env node
// Fase K (#448, activación del 2-nov): bolsa «por confirmar» (SO11791, pagos previos por confirmar
// con Richard) y ajuste de avance informativo visible en el contexto de la solicitud (0015).
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
const db = pg.crear();
const ADM = ['nomina_usa:admin'];
db.panel({ accion: 'bolsa_provisional', so_id: 2362, so_nombre: 'SO11842 - prensas materials - Mission Foods', sale_order_id: 12041, supervisor: 3200, tecnicos: 7200,
  pagado_previo_supervisor: 2240, pagado_previo_tecnicos: 5040, folio: 'BP-2026-001' }, ADM, 'esteban.delacruz');
db.panel({ accion: 'bolsa_provisional', so_id: 2361, so_nombre: 'SO11791 - Power and control panels - Calbee Fairfield', sale_order_id: 11990, supervisor: 4000, tecnicos: 6000, folio: 'BP-2026-002' }, ADM, 'esteban.delacruz');
const TXT = 'Pagos previos por confirmar con Richard. Por ahora pagado = 0.';

seccion('0015 · marcar la bolsa por confirmar');
check('nace sin marca', db.q("SELECT count(*) FROM nomina_usa.bolsa WHERE por_confirmar IS NOT NULL") === '0');
let r = db.panel({ accion: 'bolsa_por_confirmar', so_id: 2361, texto: TXT, motivo: 'x' }, ['nomina_usa:kiosko'], 'richard');
check('Richard (kiosko) no puede marcarla', r.error === 'SCOPE_INSUFICIENTE', r);
r = db.panel({ accion: 'bolsa_por_confirmar', so_id: 2361, texto: TXT, motivo: '' }, ADM, 'esteban.delacruz');
check('sin motivo se rechaza', r.error === 'MOTIVO_REQUERIDO', r);
r = db.panel({ accion: 'bolsa_por_confirmar', so_id: 9999, texto: TXT, motivo: 'm' }, ADM, 'esteban.delacruz');
check('SO sin bolsa vigente se rechaza', r.error === 'SIN_BOLSA_VIGENTE', r);
r = db.panel({ accion: 'bolsa_por_confirmar', so_id: 2361, texto: TXT, motivo: 'Esteban 2-nov' }, ADM, 'esteban.delacruz');
check('admin la marca; pagado sigue en 0', r.ok && r.bolsa.por_confirmar === TXT && Number(r.bolsa.pagado_previo_supervisor) === 0 && Number(r.bolsa.pagado_previo_tecnicos) === 0, r);
check('…queda en bitácora', db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='bolsa_por_confirmar' AND objeto='so:2361'") === '1');
check('la bolsa de SO11842 no se tocó', db.q("SELECT coalesce(por_confirmar,'-') FROM nomina_usa.bolsa WHERE so_id=2362 AND vigente") === '-');

seccion('0015 · el contexto de la solicitud trae el aviso aunque la SO no tenga horas');
for (const [quien, sc] of [['Richard', ['nomina_usa:kiosko']], ['Magaly', ['nomina_usa:validar']], ['Erick', ['nomina_usa:autorizar']]]) {
  const x = db.panel({ accion: 'solicitud_contexto', semana: '2026-10-30' }, sc, quien);
  const b = (x.bolsas_por_confirmar || [])[0] || {};
  check(quien + ' ve «SO11791 · pagos previos por confirmar»', x.ok && x.bolsas_por_confirmar.length === 1 && b.so_id === 2361 && b.texto === TXT && b.folio === 'BP-2026-002', x.bolsas_por_confirmar);
}
check('SO11791 no tiene horas esa semana (no está en sos) y aun así se avisa', !db.panel({ accion: 'solicitud_contexto', semana: '2026-10-30' }, ['nomina_usa:kiosko']).sos.some(s => s.so_id === 2361));
check('el contexto sigue trayendo lo de antes (ajustes, ajustes_previos)', (x => Array.isArray(x.ajustes) && Array.isArray(x.ajustes_previos) && Array.isArray(x.ajustes_info))(db.panel({ accion: 'solicitud_contexto', semana: '2026-10-30' }, ['nomina_usa:kiosko'])));
r = db.panel({ accion: 'bolsa_por_confirmar', so_id: 2361, texto: '', motivo: 'Richard confirmó: no hubo pagos previos' }, ADM, 'esteban.delacruz');
check('quitar la marca (texto vacío) la apaga', r.ok && r.bolsa.por_confirmar === null && db.panel({ accion: 'solicitud_contexto', semana: '2026-10-30' }, ['nomina_usa:kiosko']).bolsas_por_confirmar.length === 0, r);

seccion('0015 · ajuste de avance informativo visible');
// Semana 30-oct autorizada con SO11842 estimada al jueves en 80 %; el real reportado es 90 %.
db.q(`INSERT INTO nomina_usa.solicitud (semana, estado, envio, enviada_por) VALUES ('2026-10-30', 'autorizada', '{}'::jsonb, 'richard');
      INSERT INTO nomina_usa.solicitud_so (solicitud_id, so_id, avance_ultimo, est_mie, est_jue) SELECT id, 2362, 70, 80, 80 FROM nomina_usa.solicitud WHERE semana = '2026-10-30';
      INSERT INTO nomina_usa.avance_so (so_id, fecha, pct, reporta, estado) VALUES (2362, '2026-11-05', 90, 98, 'aceptado');`);
const x = db.panel({ accion: 'solicitud_contexto', semana: '2026-11-06' }, ['nomina_usa:validar'], 'magaly');
const info = x.ajustes_info || [];
check('Magaly ve el ajuste de avance de SO11842 (80 % → 90 %) por rol', x.ok && info.length === 2 && info.every(a => a.tipo === 'avance' && a.so_id === 2362 && a.estimado === 80 && a.real === 90 && a.informativo === true), info);
check('montos: supervisor 320 y técnicos 720 (bolsa × 10 %)', info.some(a => a.rol === 'supervisor' && Number(a.monto) === 320) && info.some(a => a.rol === 'tecnicos' && Number(a.monto) === 720), info);
check('…con el nombre de la SO', info.every(a => /SO11842/.test(a.so_nombre || '')));
check('no se mete a los ajustes que suman (no se descuenta dos veces)', !(x.ajustes || []).concat(x.ajustes_previos || []).some(a => a.tipo === 'avance' && !a.informativo));
fin();
