// Ejecuta los Code nodes de asistencia/n8n/code con $ y $input simulados (#396 fase a).
// Prueba el código REAL que se pega en n8n (con sus librerías inyectadas), no una copia.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
const LIBS = { '/*__DIAS__*/': 'asistencia/lib/dias-mx-usa.js', '/*__JWT__*/': 'docs/n8n-workflows/fase0/jwt-verify.js' };
const J = require(path.join(R, 'docs/n8n-workflows/fase0/jwt-verify.js'));

function correr(archivo, nodos, entrada) {
  let js = fs.readFileSync(path.join(R, 'asistencia/n8n/code', archivo), 'utf8');
  for (const [mk, lib] of Object.entries(LIBS)) if (js.includes(mk)) js = js.split(mk).join(fs.readFileSync(path.join(R, lib), 'utf8'));
  const item = (j) => ({ json: j });
  const $ = (n) => {
    if (!(n in nodos)) throw new Error('nodo no simulado: ' + n);
    const v = Array.isArray(nodos[n]) ? nodos[n] : [nodos[n]];
    return { first: () => item(v[0]), all: () => v.map(item), item: item(v[0]) };
  };
  const $input = { first: () => item(entrada), all: () => [item(entrada)] };
  return new Function('$', '$input', js)($, $input).map(i => i.json);
}
function token(scopes, exp) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub: 'magaly', nombre: 'Magaly', scopes, exp: exp || Math.floor(Date.now() / 1000) + 3600 });
  return h + '.' + p + '.' + J.b64urlFromBytes(J.hmacSha256('secreto-de-prueba', h + '.' + p));
}

test('kiosk: evento de entrada lee lo del kiosko (#395) y lo validado', () => {
  const [o] = correr('kiosk-evento-entrada.js', {
    Webhook: { body: { geo_zona: 'usa', tz_evento: 'America/Los_Angeles', utc_offset_min: -420, geo_motivo: 'x' } },
    'Code - Preparar parámetros': { empleado_id: 98, fechaOdoo: '2026-10-08 16:19:49', geo_status: 'autorizado', geo_motivo: '' },
    'Odoo - CREATE Entrada': { id: 15954 } }, {});
  assert.deepEqual(o.payload, { momento: 'entrada', attendance_id: 15954, employee_id: 98, check_in_utc: '2026-10-08T16:19:49Z',
    geo_zona: 'usa', tz_evento: 'America/Los_Angeles', utc_offset_min: -420, geo_regla: null, geo_status: 'autorizado', geo_motivo: null, plan_id: null });
});

test('kiosk: si CREATE no dio id, payload vacío (la función responde FALTA_ID, no truena)', () => {
  const [o] = correr('kiosk-evento-entrada.js', { Webhook: { body: {} }, 'Code - Preparar parámetros': {}, 'Odoo - CREATE Entrada': {} }, {});
  assert.deepEqual(o.payload, {});
});

test('kiosk: evento de salida usa el attendance pendiente y la empresa de la SO', () => {
  const [o] = correr('kiosk-evento-salida.js', {
    Webhook: { body: { geo_zona: 'sitio:FTS Monterrey', tz_evento: 'America/Monterrey', utc_offset_min: -360, so_company_id: 6 } },
    'Code - Preparar parámetros': { empleado_id: 75, fechaOdoo: '2026-10-22 21:30:00', so_id: 2377, cuenta_id: null, geo_status: 'autorizado' },
    'Code - Analizar candados': { attendance_id_pendiente: 90 } }, {});
  assert.equal(o.payload.attendance_id, 90);
  assert.equal(o.payload.momento, 'salida');
  assert.equal(o.payload.so_company_id, 6);
  assert.equal(o.payload.check_out_utc, '2026-10-22T21:30:00Z');
});

test('kiosk: la falla del evento deja la ejecución en error con nombre', () => {
  assert.throws(() => correr('kiosk-falla-evento.js', {}, { error: 'connect ECONNREFUSED' }), /ASISTENCIA_EVENTO_FALLO: connect ECONNREFUSED/);
});

test('tipo-dia: el cargo y su empresa salen de Odoo, no del cliente', () => {
  const nodos = {
    'Code - Validar': { attendance_id: 90, tipo_dia: 'viaje_mexico', actor: 'Felipe', es_viaje: false, recobro_usa: true, so_original_id: 2377, motivo: '' },
    'Odoo - READ asistencia': [{ id: 90, employee_id: [75, 'Mateo'], check_in: '2026-10-22 11:00:00', x_studio_project_id: false, x_studio_many2one_field_GUbBF: [3096, 'ADMIN DE OPERACIONES'] }],
    'Odoo - proyectos': [{ id: 2377, company_id: [6, 'FTS FULL TECHNOLOGY SYSTEMS LLC'] }] };
  assert.deepEqual(correr('tipo-dia-proyectos.js', nodos, {})[0].proj_ids, [2377]);
  const [o] = correr('tipo-dia-payload.js', nodos, {});
  assert.equal(o.payload.cuenta_id, 3096);
  assert.equal(o.payload.so_id, null);
  assert.equal(o.payload.so_original_company_id, 6);
  assert.equal(o.payload.employee_id, 75);
  assert.equal(o.payload.check_in_utc, '2026-10-22T11:00:00Z');
});

test('tipo-dia: validación del body y asistencia inexistente', () => {
  assert.equal(correr('tipo-dia-validar.js', {}, { body: { attendance_id: 1, tipo_dia: 'usa', supervisor_nombre: 'F' } })[0].codigo, 'TIPO_INVALIDO');
  assert.equal(correr('tipo-dia-validar.js', {}, { body: { attendance_id: 1, tipo_dia: 'mexico' } })[0].codigo, 'FALTA_ACTOR');
  const [o] = correr('tipo-dia-payload.js', { 'Code - Validar': { attendance_id: 5 }, 'Odoo - READ asistencia': [{}], 'Odoo - proyectos': [] }, {});
  assert.equal(o.codigo, 'ASISTENCIA_NO_EXISTE');
});

test('tipo-dia: la nota del chatter no usa las frases que vigilan W3/W4', () => {
  const [o] = correr('tipo-dia-nota.js', { 'Code - Payload': { payload: { actor: 'Felipe Pérez', attendance_id: 90, recobro_usa: true, so_original_id: 2377 } } },
    { r: { tipo_dia: 'viaje_mexico', propuesto: 'viaje_mexico', anterior: null } });
  assert.match(o.cuerpo, /^<p>Tipo de día: Viaje a México \(propuesto: Viaje a México\)\. Lo fijó Felipe Pérez al confirmar\. Cargo a ADMIN DE OPERACIONES \(3096\) con recobro/);
  for (const f of ['Correccion de atribucion', 'panel Confirmar Horas', 'Horas confirmadas']) assert.equal(o.cuerpo.indexOf(f), -1, f);
  assert.equal(o.res_id, 90);
});

test('tipo-dia: rechazo distingue regla de negocio de Postgres caído', () => {
  assert.deepEqual(correr('tipo-dia-rechazo.js', {}, { r: { ok: false, codigo: 'VIAJE_SIN_CARGO', mensaje: 'm' } })[0], { success: false, regla: true, codigo: 'VIAJE_SIN_CARGO', mensaje: 'm' });
  assert.equal(correr('tipo-dia-rechazo.js', {}, { error: 'ECONNREFUSED' })[0].codigo, 'POSTGRES_NO_RESPONDE');
  assert.equal(correr('tipo-dia-rechazo.js', {}, { _error: true, codigo: 'FALTA_ACTOR', mensaje: 'x' })[0].regla, false);
});

test('reporte: la puerta exige el scope rh:dias-mx-usa y nunca deja salir el secreto', () => {
  const ok = correr('reporte-puerta.js', { Webhook: { body: { token: token(['rh:dias-mx-usa']), semana: 'S43/2026' } } }, { secreto: 'secreto-de-prueba' })[0];
  assert.equal(ok.ok, true);
  assert.equal(ok.semana, 'S43/2026');
  assert.equal(ok.desde_utc, '2026-10-16 06:00:00');
  assert.equal(ok.hasta_utc, '2026-10-23 05:59:59');
  assert.equal(JSON.stringify(ok).indexOf('secreto-de-prueba'), -1);
  assert.equal(correr('reporte-puerta.js', { Webhook: { body: { token: token(['retardos:read']) } } }, { secreto: 'secreto-de-prueba' })[0].error, 'SCOPE_INSUFICIENTE');
  assert.equal(correr('reporte-puerta.js', { Webhook: { body: { token: token(['rh:dias-mx-usa']) } } }, { secreto: 'otro' })[0].error, 'FIRMA_INVALIDA');
  const roto = correr('reporte-puerta.js', {}, { secreto: 'secreto-de-prueba' })[0];
  assert.deepEqual(roto, { ok: false, error: 'FALLO_PUERTA' });
});

test('reporte: arma el reporte con lo de Odoo + Postgres; empresa 10 fuera', () => {
  const nodos = {
    'Code - Puerta': { ok: true, semana: 'S43/2026', actor: 'magaly', nombre: 'Magaly' },
    'Odoo - empleados': [{ id: 75, name: 'Mateo' }],
    'Odoo - proyectos': [{ id: 2377, company_id: [6, 'USA'] }],
    'Odoo - asistencias': [
      { id: 2, employee_id: [75, 'Mateo'], check_in: '2026-10-19 11:10:00', check_out: '2026-10-19 23:40:00', worked_hours: 12.5, x_studio_manager_approval: true, x_studio_project_id: [2377, 'SO11854'], x_studio_many2one_field_GUbBF: false },
      { id: 3, employee_id: [81, 'Otra empresa'], check_in: '2026-10-19 15:00:00', check_out: '2026-10-19 23:00:00', worked_hours: 8, x_studio_manager_approval: true, x_studio_project_id: false, x_studio_many2one_field_GUbBF: false } ] };
  assert.deepEqual(correr('reporte-payload.js', nodos, {})[0].payload.filas, [{ attendance_id: 2, so_id: 2377, so_company_id: 6 }]);
  const [o] = correr('reporte-armar.js', nodos, { filas: [{ attendance_id: 2, tipo_dia: 'viaje_usa', tipo_dia_propuesto: 'viaje_usa', origen_propuesto: 'zona' }], cuadre: { n_sin_evento: 0 } });
  assert.equal(o.success, true);
  assert.equal(o.reporte.personas.length, 1);
  assert.equal(o.reporte.personas[0].paga_usa, 1);
  assert.equal(o.reporte.personas[0].viaje_usa, 1);
  assert.equal(correr('reporte-armar.js', nodos, { error: 'x' })[0].codigo, 'POSTGRES_NO_RESPONDE');
});

test('vigía: descuadre o cero asistencias dejan la ejecución en error con nombre', () => {
  assert.throws(() => correr('vigia-resultado.js', {}, { r: { ok: true, odoo: 30, n_sin_evento: 2, n_sin_odoo: 0, sin_evento: [7, 8], sin_odoo: [], desde: 'a', hasta: 'b' } }), /VIGIA_CUADRE_DESCUADRE a\.\.b: 2 asistencias de Odoo sin evento \(7,8\)/);
  assert.throws(() => correr('vigia-resultado.js', {}, { r: { ok: true, odoo: 0, desde: 'a', hasta: 'b' } }), /VIGIA_CUADRE_SIN_DATOS/);
  assert.equal(correr('vigia-resultado.js', {}, { r: { ok: true, odoo: 30, n_sin_evento: 0, n_sin_odoo: 0 } })[0].ok, true);
  const [p] = correr('vigia-payload.js', { 'Code - Ventana': { desde: '2026-10-01', hasta: '2026-10-07' }, 'Odoo - asistencias': [{ id: 9, check_in: '2026-10-02 05:00:00' }] }, {});
  assert.deepEqual(p.payload.odoo, [{ id: 9, fecha: '2026-10-01' }]);
});
