#!/usr/bin/env node
// Fase D (#448): bolsas por SO (machote o provisional) y avance diario.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const N = require('../../shared/nomina-usa/nomina.js');

seccion('Bolsa desde el machote digital');
const DOC = { secciones: [
  { mo: [{ rol: 'supervisor_sr', qty: 16, personas: 1, pu: 200, moneda: 'USD' }, { rol: 'tecnicos', qty: 40, personas: 1, pu: 140, moneda: 'USD' },
         { rol: 'diseno', qty: 10, personas: 1, pu: 200, moneda: 'USD' }, { rol: 'programador', qty: 5, personas: 1, pu: 300, moneda: 'USD' }] },
  { mo: [{ rol: 'tecnicos', qty: 10, personas: 1, pu: 160, moneda: 'USD' }, { rol: 'he_tecnicos', qty: '', personas: 1, pu: 140 }, { rol: 'dias_viaje', qty: 2, personas: 1, pu: 300 }] }
] };
const b = N.bolsaDeMachote(DOC);
check('supervisor = 16 h × 200 = 3,200', b.supervisor === 3200, b);
check('técnicos = 40 × 140 + 10 × 160 = 7,200', b.tecnicos === 7200, b);
check('diseño, programación y viaje NO entran a la bolsa de campo', b.supervisor + b.tecnicos === 10400);
check('machote sin MO de campo = bolsa 0', (x => x.supervisor === 0 && x.tecnicos === 0)(N.bolsaDeMachote({ secciones: [{ mo: [{ rol: 'tecnicos', qty: '' }] }] })));

seccion('SO11842 (criterio de aceptación)');
check('supervisor: bolsa 3,200, pagado 2,240, avance 100 % → disponible 960', N.disponible(3200, 100, 2240) === 960);
check('técnicos: bolsa 7,200, pagado 5,040 → disponible 2,160', N.disponible(7200, 100, 5040) === 2160);
check('repartir 2,880 a técnicos se bloquea', N.validarReparto({ 75: 1440, 79: 1440 }, 2160).error === 'EXCEDE_DISPONIBLE');
check('repartir 2,160 pasa', N.validarReparto({ 75: 1080, 79: 1080 }, 2160).ok);
check('el disponible nunca supera bolsa − pagado (avance 150 % se topa en 100)', N.disponible(1000, 150, 0) === 1000);
check('el disponible nunca es negativo (pagado más que bolsa × avance)', N.disponible(1000, 50, 700) === 0);
check('centavos: 0.1 + 0.2 no abre el candado', N.validarReparto({ a: 0.1, b: 0.2 }, 0.3).ok);

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Bolsas en la base (Postgres real, con el esquema comercial)');
const db = pg.crear();
// Machote real de comercial ligado a la orden 7001, con el documento de arriba.
db.q(`INSERT INTO comercial.machote (id, dueno) VALUES ('11111111-1111-1111-1111-111111111111', 'prueba');
      INSERT INTO comercial.machote_version (machote_id, version, autor, estado, documento, moneda)
        VALUES ('11111111-1111-1111-1111-111111111111', 1, 'prueba', 'enviado', $j$${JSON.stringify(DOC)}$j$::jsonb, 'USD');
      INSERT INTO comercial.machote_orden (machote_id, odoo_so_id, principal, origen, ligado_por) VALUES ('11111111-1111-1111-1111-111111111111', 7001, true, 'manual', 'prueba');`);
check('bolsa_de_machote lee comercial: 3,200 / 7,200', (m => Number(m.supervisor) === 3200 && Number(m.tecnicos) === 7200)(db.j('SELECT nomina_usa.bolsa_de_machote(7001)')));
check('orden sin machote → NULL (no inventa)', db.q('SELECT nomina_usa.bolsa_de_machote(9999) IS NULL') === 't');
let r = db.panel({ accion: 'bolsa_machote', so_id: 501, so_nombre: 'SO11842 - prensas', sale_order_id: 7001 }, ['nomina_usa:validar']);
check('solo Esteban trae bolsas', r.error === 'SCOPE_INSUFICIENTE');
r = db.panel({ accion: 'bolsa_machote', so_id: 501, so_nombre: 'SO11842 - prensas', sale_order_id: 7001 });
check('admin trae la bolsa del machote', r.ok && Number(r.bolsa.supervisor) === 3200 && r.bolsa.origen === 'machote', r);
r = db.panel({ accion: 'bolsa_machote', so_id: 502, so_nombre: 'SO11791', sale_order_id: 9999 });
check('SO sin MO en machote → SIN_MO_EN_MACHOTE con instrucción', r.error === 'SIN_MO_EN_MACHOTE', r);
r = db.panel({ accion: 'bolsa_provisional', so_id: 502, so_nombre: 'SO11791', supervisor: 2000, tecnicos: 6000 });
check('provisional sin folio se rechaza', r.error === 'FOLIO_REQUERIDO');
r = db.panel({ accion: 'bolsa_provisional', so_id: 502, so_nombre: 'SO11791', supervisor: 2000, tecnicos: 6000, folio: 'EDC-2026-11-01' }, ['nomina_usa:kiosko']);
check('Richard no puede capturar provisionales', r.error === 'SCOPE_INSUFICIENTE');
r = db.panel({ accion: 'bolsa_provisional', so_id: 502, so_nombre: 'SO11791', supervisor: 2000, tecnicos: 6000, folio: 'EDC-2026-11-01' });
check('Esteban captura la provisional con folio', r.ok && r.bolsa.origen === 'provisional' && r.bolsa.folio === 'EDC-2026-11-01', r);
check('una provisional no pisa una bolsa de machote', db.panel({ accion: 'bolsa_provisional', so_id: 501, supervisor: 1, tecnicos: 1, folio: 'XYZ' }).error === 'YA_TIENE_BOLSA_DE_MACHOTE');
r = db.panel({ accion: 'bolsa_provisional', so_id: 503, supervisor: 100, tecnicos: 0, pagado_previo_supervisor: 200, folio: 'EDC-1' });
check('pagado previo mayor a la bolsa se rechaza en la base', r.ok === false && /bolsa_previo_ck/.test(r.detalle || ''), r);
check('una sola bolsa vigente por SO', db.q('SELECT count(*) FROM nomina_usa.bolsa WHERE vigente AND so_id=502') === '1');
check('la provisional queda en bitácora con su folio', db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='bolsa_provisional' AND motivo='EDC-2026-11-01'") === '1');
db.q(`SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":16339,"employee_id":98,"fecha":"2026-10-28","so_id":501,"so_nombre":"SO11842","horas":10.68},{"attendance_id":1,"employee_id":75,"fecha":"2026-10-28","so_id":501,"horas":9.5}]}'::jsonb)`);
db.q(`INSERT INTO nomina_usa.avance_so (so_id, fecha, pct, reporta) VALUES (501, '2026-10-28', 70, 98), (501, '2026-10-30', 100, 98)`);
r = db.panel({ accion: 'avance_diario', so_id: 501, desde: '2026-10-28', hasta: '2026-10-30' }, ['nomina_usa:kiosko']);
check('avance diario: 28-oct 70 % con quién trabajó y horas', r.ok && r.dias[0].avance === 70 && r.dias[0].horas.length === 2, r.dias && r.dias[0]);
check('día sin reporte arrastra el avance vigente (29-oct = 70 %)', r.dias[1].avance === null && r.dias[1].avance_al === 70);
check('30-oct 100 %', r.dias[2].avance_al === 100);
check('re-subir las horas de una asistencia no duplica', (db.q(`SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":1,"employee_id":75,"fecha":"2026-10-28","so_id":501,"horas":9.6}]}'::jsonb)`), db.q('SELECT count(*)||\'/\'||sum(horas) FROM nomina_usa.horas_dia')) === '2/20.28');
r = db.panel({ accion: 'bolsas' }, ['nomina_usa:validar']);
check('bolsas trae catálogo de SO con y sin bolsa (para la provisional en modo real)', r.ok && Array.isArray(r.catalogo) && r.catalogo.some(c => c.so_id === 501) && r.catalogo.some(c => c.so_id === 502), r.catalogo);
fin();
