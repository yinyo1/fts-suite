// Prueba de la migración asistencia_0001 contra un Postgres 16 local (#396).
//
//   ASISTENCIA_PG="-h /var/tmp/asispg -p 5433 -U postgres" node --test tests/asistencia/
//
// Sin la variable, las pruebas de base se saltan (como tests/retardos/simulador.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PG = process.env.ASISTENCIA_PG ? process.env.ASISTENCIA_PG.split(' ') : null;
const conPg = PG ? test : test.skip;
const DIR = path.join(__dirname, '..', '..', 'db', 'migrations', 'asistencia');
const ARCHIVOS = fs.readdirSync(DIR).filter(f => /^asistencia_[0-9]{4}_.*[.]sql$/.test(f)).sort();

function psql(db, sql, extra) {
  return execFileSync('psql', [...PG, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...(extra || []), '-c', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function psqlFile(db, file) {
  execFileSync('psql', [...PG, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', file],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function j(db, sql) { return JSON.parse(psql(db, sql)); }
function lit(o) { return "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb"; }
let n = 0;
function baseNueva() {
  const db = 'asis_t' + process.pid + '_' + (++n);
  psql('postgres', 'DROP DATABASE IF EXISTS ' + db);
  psql('postgres', 'CREATE DATABASE ' + db);
  psql(db, 'CREATE TABLE public.schema_migrations (version text PRIMARY KEY, nombre text NOT NULL, sha256 text NOT NULL, aplicada_at timestamptz NOT NULL DEFAULT now(), aplicada_por text NOT NULL DEFAULT current_user)');
  for (const f of ARCHIVOS) psqlFile(db, path.join(DIR, f));
  return db;
}

test('los .sql no traen patrones que el runner de n8n mutila', () => {
  for (const f of ARCHIVOS) {
    const s = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.equal(s.indexOf('{' + '{'), -1, f + ': llaves dobles');
    assert.equal(s.indexOf('$' + '$'), -1, f + ': dólar doble');
    assert.doesNotMatch(s, /[$]['&`0-9]/, f + ': dólar seguido de comilla, &, acento o dígito');
  }
});

conPg('se aplica dos veces sin romper (idempotente) y el read-back cuadra', () => {
  const db = baseNueva();
  for (const f of ARCHIVOS) psqlFile(db, path.join(DIR, f));   // segunda pasada
  const tablas = psql(db, "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='asistencia'");
  assert.equal(tablas, 'corrida,evento,tipo_dia_bitacora');
  const fns = psql(db, "SELECT string_agg(p.proname, ',' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='asistencia'");
  assert.equal(fns, 'bitacora_inmutable,confirmar_tipo,cuadre,dia_cst,leer,pais_zona,registrar_evento,tipo_por_empresa,tipo_por_zonas,txt,ultimo_cuadre');
  assert.equal(psql(db, "SELECT rolcanlogin FROM pg_roles WHERE rolname='asistencia_app'"), 'f');
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('tipo propuesto por zonas: las 4 combinaciones, y todo lo que no es usa cuenta como mx', () => {
  const db = baseNueva();
  const casos = [
    ['sitio:FTS Monterrey', 'sitio:FTS Monterrey', 'mexico'],
    ['usa', 'usa', 'proyecto_usa'],
    ['sitio:FTS Monterrey', 'usa', 'viaje_usa'],
    ['usa', 'fuera', 'viaje_mexico'],
    ['fuera', 'sin_restriccion', 'mexico'],
    ['USA', 'usa', 'proyecto_usa'],
  ];
  casos.forEach(([zin, zout, esperado], i) => {
    const att = 1000 + i;
    const e = j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'entrada', attendance_id: att, employee_id: 7, check_in_utc: '2026-10-05T13:30:00Z', geo_zona: zin, tz_evento: 'America/Monterrey', utc_offset_min: -360, geo_status: 'autorizado' }) + ')');
    assert.equal(e.ok, true);
    assert.equal(e.tipo_dia_propuesto, null, 'con solo la entrada no hay propuesto');
    const s = j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'salida', attendance_id: att, employee_id: 7, check_out_utc: '2026-10-06T00:00:00Z', geo_zona: zout, tz_evento: 'America/Los_Angeles', utc_offset_min: -420, so_id: 2381, so_company_id: 6 }) + ')');
    assert.equal(s.tipo_dia_propuesto, esperado, zin + ' → ' + zout);
    assert.equal(s.origen_propuesto, 'zona');
  });
  // fecha = día CST del check_in, aunque la salida caiga en otro día UTC
  assert.equal(psql(db, 'SELECT fecha FROM asistencia.evento WHERE attendance_id=1000'), '2026-10-05');
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('idempotente: la misma entrada y salida dos veces dejan una fila igual', () => {
  const db = baseNueva();
  const ent = { momento: 'entrada', attendance_id: 55, employee_id: 9, check_in_utc: '2026-10-05T13:00:00Z', geo_zona: 'fuera', geo_status: 'pendiente_aprobacion', geo_motivo: 'Cliente nuevo, sin geocerca' };
  const sal = { momento: 'salida', attendance_id: 55, employee_id: 9, check_out_utc: '2026-10-05T23:00:00Z', geo_zona: 'fuera', cuenta_id: 608 };
  for (let k = 0; k < 2; k++) { j(db, 'SELECT asistencia.registrar_evento(' + lit(ent) + ')'); j(db, 'SELECT asistencia.registrar_evento(' + lit(sal) + ')'); }
  assert.equal(psql(db, 'SELECT count(*) FROM asistencia.evento'), '1');
  const r = j(db, "SELECT row_to_json(e) FROM asistencia.evento e WHERE attendance_id=55");
  assert.equal(r.geo_motivo_in, 'Cliente nuevo, sin geocerca');
  assert.equal(r.geo_status_in, 'pendiente_aprobacion');
  assert.equal(r.tipo_dia_propuesto, 'mexico');
  assert.equal(r.tipo_dia, null, 'el kiosko nunca confirma');
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('asistencia anterior al cambio: propuesto por empresa del proyecto', () => {
  const db = baseNueva();
  // salida sin fila de entrada, con empresa 6 → proyecto_usa (empresa_proyecto)
  const s = j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'salida', attendance_id: 70, employee_id: 3, check_in_utc: '2026-10-01T14:00:00Z', check_out_utc: '2026-10-01T23:00:00Z', geo_zona: 'usa', so_id: 2381, so_company_id: 6 }) + ')');
  assert.equal(s.tipo_dia_propuesto, 'proyecto_usa');
  assert.equal(s.origen_propuesto, 'empresa_proyecto');
  // y leer() cubre las que ni siquiera tienen evento
  const l = j(db, 'SELECT asistencia.leer(' + lit({ filas: [{ attendance_id: 70 }, { attendance_id: 71, so_company_id: 6 }, { attendance_id: 72, so_company_id: 1 }, { attendance_id: 73 }] }) + ')');
  const m = Object.fromEntries(l.map(x => [x.attendance_id, x]));
  assert.equal(m[70].tiene_evento, true);
  assert.equal(m[71].tiene_evento, false);
  assert.equal(m[71].tipo_dia_propuesto, 'proyecto_usa');
  assert.equal(m[71].origen_propuesto, 'empresa_proyecto');
  assert.equal(m[72].tipo_dia_propuesto, 'mexico');
  assert.equal(m[73].tipo_dia_propuesto, 'mexico');
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('confirmar_tipo: candados, bitácora y recobro D-7', () => {
  const db = baseNueva();
  const base = { attendance_id: 90, employee_id: 75, check_in_utc: '2026-10-22T11:00:00Z', actor: 'felipe.perez' };
  j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'entrada', attendance_id: 90, employee_id: 75, check_in_utc: '2026-10-22T11:00:00Z', geo_zona: 'usa' }) + ')');
  j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'salida', attendance_id: 90, employee_id: 75, check_out_utc: '2026-10-22T21:30:00Z', geo_zona: 'sitio:FTS Monterrey', so_id: 2377, so_company_id: 6 }) + ')');
  assert.equal(psql(db, 'SELECT tipo_dia_propuesto FROM asistencia.evento WHERE attendance_id=90'), 'viaje_mexico');

  let r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'viaje_mexico' }) + ')');
  assert.equal(r.codigo, 'VIAJE_SIN_CARGO');
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'viaje_mexico', so_id: 2377, so_company_id: 6 }) + ')');
  assert.equal(r.codigo, 'EMPRESA_INCOHERENTE');
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'viaje_usa', so_id: 2377, so_company_id: 6, recobro_usa: true }) + ')');
  assert.equal(r.codigo, 'RECOBRO_INVALIDO');
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'raro', cuenta_id: 3096 }) + ')');
  assert.equal(r.codigo, 'TIPO_INVALIDO');
  assert.equal(psql(db, 'SELECT count(*) FROM asistencia.tipo_dia_bitacora'), '0', 'un rechazo no deja rastro de cambio');

  // D-7: cargo a 3096, recobro marcado con la SO original
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'viaje_mexico', cuenta_id: 3096, recobro_usa: true, so_original_id: 2377, so_original_company_id: 6 }) + ')');
  assert.equal(r.ok, true);
  assert.equal(r.cambio, true);
  assert.equal(r.cambiado_por_felipe, false);
  const ev = j(db, 'SELECT row_to_json(e) FROM asistencia.evento e WHERE attendance_id=90');
  assert.equal(ev.recobro_usa, true);
  assert.equal(ev.so_original_id, 2377);
  assert.equal(ev.cuenta_id, 3096);
  assert.equal(ev.confirmado_por, 'felipe.perez');

  // misma confirmación otra vez: sin bitácora nueva
  j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'viaje_mexico', cuenta_id: 3096, recobro_usa: true, so_original_id: 2377, so_original_company_id: 6 }) + ')');
  assert.equal(psql(db, 'SELECT count(*) FROM asistencia.tipo_dia_bitacora'), '1');

  // Felipe la cambia: bitácora de qué a qué y «cambiado por Felipe»
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ ...base, tipo_dia: 'mexico', cuenta_id: 3096 }) + ')');
  assert.equal(r.anterior, 'viaje_mexico');
  assert.equal(r.cambiado_por_felipe, true);
  assert.equal(psql(db, "SELECT de || '>' || a FROM asistencia.tipo_dia_bitacora ORDER BY id DESC LIMIT 1"), 'viaje_mexico>mexico');
  assert.equal(psql(db, 'SELECT recobro_usa FROM asistencia.evento WHERE attendance_id=90'), 'f');

  // asistencia sin evento del kiosko (anterior al cambio): la confirmación crea la fila
  r = j(db, 'SELECT asistencia.confirmar_tipo(' + lit({ attendance_id: 91, employee_id: 98, check_in_utc: '2026-10-01T15:00:00Z', actor: 'felipe.perez', tipo_dia: 'proyecto_usa', so_id: 2381, so_company_id: 6 }) + ')');
  assert.equal(r.ok, true);
  assert.equal(psql(db, "SELECT origen || '|' || fecha || '|' || tipo_dia_propuesto FROM asistencia.evento WHERE attendance_id=91"), 'confirmacion|2026-10-01|proyecto_usa');

  // la bitácora es inmutable
  assert.throws(() => psql(db, "UPDATE asistencia.tipo_dia_bitacora SET a='mexico'"), /inmutable/);
  assert.throws(() => psql(db, 'DELETE FROM asistencia.tipo_dia_bitacora'), /inmutable/);
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('CHECKs: tipo inválido y tipo sin confirmado_at no entran', () => {
  const db = baseNueva();
  assert.throws(() => psql(db, "INSERT INTO asistencia.evento (attendance_id, employee_id, fecha, tipo_dia, confirmado_at) VALUES (1,1,'2026-10-01','usa',now())"), /check/i);
  assert.throws(() => psql(db, "INSERT INTO asistencia.evento (attendance_id, employee_id, fecha, tipo_dia) VALUES (2,1,'2026-10-01','mexico')"), /check/i);
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('rol de aplicación: escribe por las funciones y no puede borrar', () => {
  const db = baseNueva();
  psql(db, "SET ROLE asistencia_app; SELECT asistencia.registrar_evento('" + JSON.stringify({ momento: 'entrada', attendance_id: 5, employee_id: 5, check_in_utc: '2026-10-05T13:00:00Z', geo_zona: 'usa' }) + "'::jsonb)");
  assert.equal(psql(db, 'SELECT count(*) FROM asistencia.evento'), '1');
  assert.throws(() => psql(db, 'SET ROLE asistencia_app; DELETE FROM asistencia.evento'), /permission denied/);
  assert.throws(() => psql(db, 'SET ROLE asistencia_app; CREATE TABLE asistencia.x (a int)'), /permission denied/);
  psql('postgres', 'DROP DATABASE ' + db);
});

conPg('cuadre: los dos lados del descuadre y la corrida queda escrita', () => {
  const db = baseNueva();
  for (const att of [1, 2, 3]) j(db, 'SELECT asistencia.registrar_evento(' + lit({ momento: 'entrada', attendance_id: att, employee_id: 1, check_in_utc: '2026-10-06T14:00:00Z', geo_zona: 'usa' }) + ')');
  // Odoo trae 2..5 y una vieja (99, del 1-oct) anterior al arranque: ésa no es descuadre.
  const r = j(db, 'SELECT asistencia.cuadre(' + lit({ desde: '2026-10-01', hasta: '2026-10-08', odoo: [{ id: 2, fecha: '2026-10-06' }, { id: 3, fecha: '2026-10-06' }, { id: 4, fecha: '2026-10-07' }, 5, { id: 99, fecha: '2026-10-01' }] }) + ')');
  assert.equal(r.ok, true);
  assert.equal(r.arranque, '2026-10-06');
  assert.deepEqual(r.sin_evento, [4, 5]);
  assert.deepEqual(r.sin_odoo, [1]);
  assert.equal(r.odoo, 5);
  // sin ningún evento todavía (antes de publicar el kiosko) no hay descuadre que reportar
  const db2 = baseNueva();
  assert.deepEqual(j(db2, 'SELECT asistencia.cuadre(' + lit({ desde: '2026-10-01', hasta: '2026-10-08', odoo: [1, 2] }) + ')').sin_evento, []);
  psql('postgres', 'DROP DATABASE ' + db2);
  const u = j(db, 'SELECT asistencia.ultimo_cuadre()');
  assert.equal(u.n_sin_evento, 2);
  assert.equal(j(db, 'SELECT asistencia.cuadre(' + lit({ desde: '2026-10-08', hasta: '2026-10-02', odoo: [] }) + ')').codigo, 'RANGO_INVALIDO');
  assert.equal(j(db, 'SELECT asistencia.cuadre(' + lit({ desde: '2026-10-02', hasta: '2026-10-08' }) + ')').codigo, 'FALTA_LISTA_ODOO');
  psql('postgres', 'DROP DATABASE ' + db);
});
