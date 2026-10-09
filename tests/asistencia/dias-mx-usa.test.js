// Unitarias de asistencia/lib/dias-mx-usa.js (#396, fase a).  node --test tests/asistencia/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../asistencia/lib/dias-mx-usa.js');

test('tipo por zonas: las 4 combinaciones; lo que no es usa es mx; sin zona no hay propuesto', () => {
  assert.equal(L.tipoPorZonas('sitio:FTS Monterrey', 'sitio:Topo Chico'), 'mexico');
  assert.equal(L.tipoPorZonas('usa', 'usa'), 'proyecto_usa');
  assert.equal(L.tipoPorZonas('sitio:FTS Monterrey', 'usa'), 'viaje_usa');
  assert.equal(L.tipoPorZonas('usa', 'fuera'), 'viaje_mexico');
  assert.equal(L.tipoPorZonas('fuera', 'sin_restriccion'), 'mexico');
  assert.equal(L.tipoPorZonas('USA ', 'usa'), 'proyecto_usa');
  assert.equal(L.tipoPorZonas(null, 'usa'), null);
  assert.equal(L.tipoPorZonas('usa', ''), null);
});

test('tipo por empresa del proyecto (asistencias sin zona)', () => {
  assert.equal(L.tipoPorEmpresa(6), 'proyecto_usa');
  assert.equal(L.tipoPorEmpresa('6'), 'proyecto_usa');
  assert.equal(L.tipoPorEmpresa(1), 'mexico');
  assert.equal(L.tipoPorEmpresa(null), 'mexico');
  assert.deepEqual(L.propuesto({ so_company_id: 6, evento: null }), { tipo: 'proyecto_usa', origen: 'empresa_proyecto' });
  assert.deepEqual(L.propuesto({ so_company_id: 6, evento: { zona_in: 'sitio:x', zona_out: 'sitio:y' } }), { tipo: 'mexico', origen: 'zona' });
});

test('semana FTS viernes a jueves con el ancla de nómina (jue 23-jul-2026 = S30)', () => {
  assert.equal(L.semanaDe('2026-07-23').id, 'S30/2026');
  assert.equal(L.semanaDe('2026-07-17').desde, '2026-07-17');
  const s = L.semanaDe('2026-10-12');
  assert.deepEqual([s.id, s.desde, s.hasta], ['S42/2026', '2026-10-09', '2026-10-15']);
  assert.equal(L.semanaDe('2026-10-09').id, 'S42/2026', 'el viernes abre la semana');
  assert.equal(L.semanaDe('2026-10-08').id, 'S41/2026', 'el jueves la cierra');
  assert.equal(L.semanaPorId('S43/2026').desde, '2026-10-16');
  assert.equal(L.semanaPorId('basura'), null);
});

test('día CST del check_in: Odoo trae UTC sin Z', () => {
  assert.equal(L.diaCst('2026-10-09 05:30:00'), '2026-10-08');
  assert.equal(L.diaCst('2026-10-09 06:00:00'), '2026-10-09');
  assert.equal(L.horaCst('2026-10-08 13:19:49'), '07:19');
});

// Caso Mateo a Irving (S43): vie MX, lun Viaje a USA, mar y mié Proyecto USA, jue Viaje a México.
function att(id, emp, ci, co, h, extra) {
  return Object.assign({ attendance_id: id, employee_id: emp, empleado_nombre: 'Persona ' + emp, check_in: ci, check_out: co,
    worked_hours: h, confirmado: true, so_id: null, so_nombre: null, so_company_id: null, cuenta_id: null, cuenta_nombre: null, evento: null }, extra || {});
}
const irving = [
  att(1, 75, '2026-10-16 13:25:00', '2026-10-16 23:35:00', 10.2, { so_id: 2382, so_nombre: 'SO11855', so_company_id: 1, evento: { tipo_dia: 'mexico' } }),
  att(2, 75, '2026-10-19 11:10:00', '2026-10-19 23:40:00', 12.5, { so_id: 2377, so_nombre: 'SO11854', so_company_id: 6, evento: { tipo_dia: 'viaje_usa' } }),
  att(3, 75, '2026-10-20 12:00:00', '2026-10-20 22:30:00', 10.5, { so_id: 2377, so_nombre: 'SO11854', so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }),
  att(4, 75, '2026-10-21 12:05:00', '2026-10-21 22:20:00', 10.25, { so_id: 2377, so_nombre: 'SO11854', so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }),
  att(5, 75, '2026-10-22 11:00:00', '2026-10-22 21:30:00', 10.5, { cuenta_id: 3096, cuenta_nombre: 'ADMIN DE OPERACIONES', evento: { tipo_dia: 'viaje_mexico', recobro_usa: true } }),
];

test('reporte: Mateo a Irving suma 2 México y 3 FTS USA, y explica cada total', () => {
  const r = L.armarReporte({ semana: 'S43/2026', asistencias: irving });
  assert.equal(r.desde, '2026-10-16');
  const p = r.personas[0];
  assert.equal(p.paga_mx, 2);
  assert.equal(p.paga_usa, 3);
  assert.equal(p.viaje_usa, 1);
  assert.equal(p.proyecto_usa, 2);
  assert.equal(p.pendientes, 0);
  assert.equal(p.horas.mx, 20.7);
  assert.equal(p.horas.usa, 33.25);
  assert.match(p.como_salio.mx, /^México 2 = vie 16 \(México, att 1, 10\.20 h\) \+ jue 22 \(Viaje a México, att 5, 10\.50 h, recobro a USA\)/);
  assert.match(p.como_salio.usa, /^FTS USA 3 = lun 19 \(Viaje a USA, att 2, 12\.50 h\)/);
  assert.equal(p.como_salio.pendiente, '');
  // D-10: una declaración trabajo_usa por SO
  assert.deepEqual(p.propuesta_trabajo_usa.map(x => [x.tipo, x.valores.dias, x.valores.so, x.so_id]), [['trabajo_usa', 3, 'SO11854', 2377]]);
  assert.equal(r.totales.con_usa, 1);
});

test('pendientes en rojo con su motivo, y no suman en ninguna columna', () => {
  const rows = [
    att(10, 9, '2026-10-12 13:00:00', '2026-10-12 23:00:00', 10, { confirmado: false, evento: { tipo_dia: 'mexico' } }),
    att(11, 9, '2026-10-13 13:00:00', '2026-10-13 23:00:00', 10, { evento: null }),
    att(12, 9, '2026-10-14 13:00:00', '2026-10-14 23:00:00', 10, { evento: { tipo_dia: 'viaje_usa' } }),
    att(13, 9, '2026-10-15 13:00:00', '2026-10-15 17:00:00', 4, { so_id: 1, evento: { tipo_dia: 'mexico' } }),
    att(14, 9, '2026-10-15 18:00:00', '2026-10-15 23:00:00', 5, { so_id: 2, so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }),
    att(15, 9, '2026-10-09 13:00:00', null, 0, { confirmado: false, evento: null }),
  ];
  const p = L.armarReporte({ semana: 'S42/2026', asistencias: rows }).personas[0];
  assert.equal(p.paga_mx + p.paga_usa, 0);
  assert.equal(p.pendientes, 5);
  const m = Object.fromEntries(p.dias.map(d => [d.fecha, d]));
  assert.match(m['2026-10-12'].motivos.join(), /sin confirmar/);
  assert.match(m['2026-10-13'].motivos.join(), /sin tipo/);
  assert.match(m['2026-10-14'].motivos.join(), /viaje sin cargo/);
  assert.match(m['2026-10-15'].motivos.join(), /tipos distintos el mismo día \(México y Proyecto USA\)/);
  assert.deepEqual(m['2026-10-15'].attendance_ids, [13, 14]);
  assert.match(m['2026-10-09'].motivos.join(), /abierta/);
  assert.equal(m['2026-10-10'].estado, 'sin_checadas');
  assert.match(p.como_salio.pendiente, /^Pendiente 5 = /);
});

test('dos asistencias del mismo día con el mismo tipo cuentan UN día', () => {
  const rows = [
    att(20, 98, '2026-10-12 14:30:00', '2026-10-12 19:00:00', 4.5, { so_id: 2381, so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }),
    att(21, 98, '2026-10-12 20:00:00', '2026-10-13 01:00:00', 5, { so_id: 2381, so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }),
  ];
  const p = L.armarReporte({ semana: 'S42/2026', asistencias: rows }).personas[0];
  assert.equal(p.paga_usa, 1);
  assert.equal(p.horas.usa, 9.5);
});

test('fuera de la semana no entra; semana inválida truena con nombre', () => {
  const r = L.armarReporte({ semana: 'S42/2026', asistencias: [att(30, 1, '2026-10-16 13:00:00', '2026-10-16 23:00:00', 10, { evento: { tipo_dia: 'mexico' } })] });
  assert.equal(r.personas.length, 0);
  assert.throws(() => L.armarReporte({ semana: 'nada', asistencias: [] }), /SEMANA_INVALIDA/);
});

test('hojas de Excel: resumen + detalle con los mismos totales', () => {
  const r = L.armarReporte({ semana: 'S43/2026', asistencias: irving });
  const h = L.hojasExcel(r);
  assert.deepEqual(h.map(x => x.nombre), ['Resumen', 'Detalle']);
  const fila = h[0].filas[4];
  assert.equal(fila[1].v, 2);
  assert.equal(fila[2].v, 3);
  assert.equal(h[1].filas.length, 3 + 5, '5 días con checadas en el detalle');
});
