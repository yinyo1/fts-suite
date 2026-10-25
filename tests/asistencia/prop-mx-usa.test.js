// Unitarias de modulos/rh/nomina-incidencias/js/prop-mx-usa.js (#396 D-10).  node --test tests/asistencia/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../modulos/rh/nomina-incidencias/js/prop-mx-usa.js');
const L = require('../../asistencia/lib/dias-mx-usa.js');

const PROY = ['SO9428 Vertiv 2da Fase', 'SO11842 Mission Foods - Dallas', 'SO11547 Topo Chico'];
const prop = (dias, so) => ({ tipo: 'trabajo_usa', valores: { dias, so } });

test('el nombre de SO se toma de la lista de Nómina: exacto, luego por código, si no tal cual', () => {
  assert.equal(P.resolverSo('SO9428 Vertiv 2da Fase', PROY), 'SO9428 Vertiv 2da Fase');
  assert.equal(P.resolverSo('SO11842 Mission Foods', PROY), 'SO11842 Mission Foods - Dallas');
  assert.equal(P.resolverSo('so11842 algo', PROY), 'SO11842 Mission Foods - Dallas');
  assert.equal(P.resolverSo('Proyecto sin código', PROY), 'Proyecto sin código');
});

test('estado: nueva, aceptada y distinta; otra SO u otro tipo no cuentan', () => {
  const decl = [{ tipo: 'vacaciones', valores: { dias: 1 } }, { tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO9428 Vertiv 2da Fase' } }];
  assert.equal(P.estado(prop(3, 'SO11842 Mission Foods'), decl, PROY).estado, 'nueva');
  assert.equal(P.estado(prop(2, 'SO9428 Vertiv'), decl, PROY).estado, 'aceptada');
  const d = P.estado(prop(3, 'SO9428 Vertiv 2da Fase'), decl, PROY);
  assert.equal(d.estado, 'distinta'); assert.equal(d.idx, 1); assert.equal(d.dias_declarados, 2);
});

test('aceptar no captura dos veces: agrega, luego no hace nada, y corrige los días si cambiaron', () => {
  const decl = [];
  assert.equal(P.aceptar(prop(2, 'SO11842 Mission Foods'), decl, PROY), 'agregada');
  assert.deepEqual(decl, [{ tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO11842 Mission Foods - Dallas' } }]);
  assert.equal(P.aceptar(prop(2, 'SO11842 Mission Foods'), decl, PROY), 'sin_cambio');
  assert.equal(decl.length, 1);
  assert.equal(P.aceptar(prop(3, 'SO11842 Mission Foods'), decl, PROY), 'corregida');
  assert.equal(decl.length, 1); assert.equal(decl[0].valores.dias, 3);
});

test('de punta a punta: la propuesta del reporte entra a Nómina con el formato de la declaración', () => {
  const rep = L.armarReporte({ semana: 'S43/2026', asistencias: [
    { attendance_id: 1, employee_id: 7, check_in: '2026-10-19 13:00:00', check_out: '2026-10-19 23:00:00', worked_hours: 10, confirmado: true, so_id: 50, so_nombre: 'SO11842 Mission Foods', so_company_id: 6, evento: { tipo_dia: 'viaje_usa' } },
    { attendance_id: 2, employee_id: 7, check_in: '2026-10-20 13:00:00', check_out: '2026-10-20 23:00:00', worked_hours: 10, confirmado: true, so_id: 50, so_nombre: 'SO11842 Mission Foods', so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } },
    { attendance_id: 3, employee_id: 7, check_in: '2026-10-21 13:00:00', check_out: '2026-10-21 23:00:00', worked_hours: 10, confirmado: false, so_id: 50, so_nombre: 'SO11842 Mission Foods', so_company_id: 6, evento: { tipo_dia: 'proyecto_usa' } }
  ] });
  const x = P.indexar(rep)[7];
  assert.equal(x.paga_usa, 2); assert.equal(x.pendientes, 1);
  const decl = [];
  x.propuesta_trabajo_usa.forEach((pr) => P.aceptar(pr, decl, PROY));
  assert.deepEqual(decl, [{ tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO11842 Mission Foods - Dallas' } }]);
});

test('la lectura nunca lanza ni cierra sesión: cada fallo es un motivo', async () => {
  const orig = global.fetch;
  try {
    assert.deepEqual(await P.leer('S43/2026', 'https://x', null), { ok: false, motivo: 'sin_sesion' });
    global.fetch = async () => { throw new Error('red'); };
    assert.equal((await P.leer('S43/2026', 'https://x', 't')).motivo, 'sin_red');
    global.fetch = async () => ({ status: 404, json: async () => { throw new Error('vacío'); } });
    assert.equal((await P.leer('S43/2026', 'https://x', 't')).motivo, 'no_publicado');
    global.fetch = async () => ({ status: 401, json: async () => ({ success: false, error: 'SCOPE_INSUFICIENTE' }) });
    assert.equal((await P.leer('S43/2026', 'https://x', 't')).motivo, 'sin_permiso');
    global.fetch = async () => ({ status: 200, json: async () => ({ success: true, reporte: { semana: 'S42/2026', personas: [] } }) });
    assert.equal((await P.leer('S43/2026', 'https://x', 't')).motivo, 'otra_semana');
    let cuerpo = null;
    global.fetch = async (url, o) => { cuerpo = { url, body: JSON.parse(o.body) }; return { status: 200, json: async () => ({ success: true, reporte: { semana: 'S43/2026', personas: [{ employee_id: 7 }] } }) }; };
    const r = await P.leer('S43/2026', 'https://x/', 't');
    assert.equal(r.ok, true); assert.ok(r.porEmpleado[7]);
    assert.equal(cuerpo.url, 'https://x/webhook/rh/dias-mx-usa');
    assert.deepEqual(cuerpo.body, { token: 't', semana: 'S43/2026' });
  } finally { global.fetch = orig; }
});
