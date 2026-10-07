/* tests/retardos/simulador.test.js · Simulador de casos de Retardos v2 (#334)
 *
 * Corre contra un Postgres DE VERDAD (no un mock): aplica las migraciones de
 * db/migrations/retardos/ en una base plantilla y cada prueba trabaja en una
 * copia limpia. Todos los datos son DEMO (el repo es público).
 *
 *   RETARDOS_PG="-h /var/tmp/retpg -p 5433 -U postgres" node --test tests/retardos/
 *
 * Sin RETARDOS_PG, las pruebas de base se saltan (las de JS puro corren igual).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PG = process.env.RETARDOS_PG ? process.env.RETARDOS_PG.split(' ') : null;
const RAIZ = path.join(__dirname, '..', '..');
const MIG = path.join(RAIZ, 'db', 'migrations', 'retardos');
let n = 0;

function psql(db, sql) {
  return execFileSync('psql', [...PG, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-c', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function psqlFile(db, file) {
  execFileSync('psql', [...PG, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', file], { stdio: ['ignore', 'ignore', 'pipe'] });
}
function lit(obj) { return "'" + JSON.stringify(obj).replace(/'/g, "''") + "'::jsonb"; }

let plantillaLista = false;
let festivosSembrados = null;
function base() {
  if (!plantillaLista) {
    try { psql('postgres', 'DROP DATABASE IF EXISTS ret_tpl'); } catch (e) { /* nada */ }
    psql('postgres', 'CREATE DATABASE ret_tpl');
    psql('ret_tpl', 'CREATE TABLE public.schema_migrations(version text primary key, nombre text, sha256 text)');
    for (const f of fs.readdirSync(MIG).filter((x) => /^retardos_[0-9]{4}_.*[.]sql$/.test(x)).sort()) {
      psqlFile('ret_tpl', path.join(MIG, f));
    }
    // retardos_0007 siembra los festivos del art. 74 LFT. Se cuentan aquí (prueba propia) y se quitan de la
    // plantilla para que las pruebas que usan "el mes actual" no dependan de en qué mes se corren.
    festivosSembrados = Number(psql('ret_tpl', "SELECT count(*) FROM retardos.festivo WHERE creado_por = 'semilla_lft_art74'"));
    psql('ret_tpl', "DELETE FROM retardos.festivo WHERE creado_por = 'semilla_lft_art74'");
    plantillaLista = true;
  }
  const db = 'ret_t' + process.pid + '_' + (++n);
  psql('postgres', 'DROP DATABASE IF EXISTS ' + db);
  psql('postgres', 'CREATE DATABASE ' + db + ' TEMPLATE ret_tpl');
  return {
    db,
    q: (sql) => psql(db, sql),
    j: (sql) => JSON.parse(psql(db, sql) || 'null'),
    fin: () => psql('postgres', 'DROP DATABASE IF EXISTS ' + db)
  };
}

// ── fábrica de datos DEMO ────────────────────────────────────────────────────
const EMP = (id, extra) => Object.assign({ employee_id: id, nombre: 'Demo ' + id, puesto: 'Puesto demo', company_id: 1,
  activo: true, hora_entrada: 7, hora_calendario: 7, email: 'demo' + id + '@example.com', parent_id: 900,
  departamento: 'Operaciones' }, extra || {});
const SUP = EMP(900, { email: 'supervisor@example.com', parent_id: null, hora_entrada: 8 });
let attSeq = 1000;
// fecha 'AAAA-MM-DD', hora local 'HH:MM' → UTC (Monterrey = UTC−6)
function chec(emp, fecha, hhmm, extra) {
  const [h, m, sg] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), h + 6, m, sg || 0));
  return Object.assign({ attendance_id: ++attSeq, employee_id: emp, check_in_utc: d.toISOString(), disputa: false, incidencia_pendiente: '' }, extra || {});
}
function ingestar(B, checadas, empleados, extra) {
  const p = Object.assign({ workflow: 'retardos/detectar', desde: '2026-09-01', hasta: '2026-09-30',
    empleados: empleados || [EMP(1), SUP], checadas, olvido_entrada_att: [] }, extra || {});
  return B.j('SELECT retardos.ingestar(' + lit(p) + ')');
}
// retardos_0006: el modo con suspensión reemplaza a nivel_maximo_habilitado/suspensiones_habilitadas (0005).
function habilitarTodo(B) { config(B, 'modo_sanciones', 'con_suspension'); }
function config(B, clave, valor) { B.q("UPDATE retardos.config SET valor = " + lit(valor) + " WHERE clave = '" + clave + "'"); }
function enviarTodo(B) {
  const lista = B.j('SELECT retardos.por_enviar(100)') || [];
  for (const e of lista) B.j('SELECT retardos.marcar_envio(' + lit({ id: e.id, ok: true, modo: e.modo, para_efectivo: e.para }) + ')');
  return lista;
}
const tres = (emp) => [chec(emp, '2026-09-01', '07:45'), chec(emp, '2026-09-02', '08:00'), chec(emp, '2026-09-03', '07:30')];
// Resultado del procesador para UNA página (lo que devuelve retardos-hojas). Por defecto: hoja completa.
function pagina(folio, extra) {
  const f = (p) => ({ presente: p, confianza: 0.95 });
  return Object.assign({ pagina: 1, folio, folio_fuente: 'qr', qr_pagina: 1, qr_total: 1, nombre_visible: 'Demo 1',
    firmas: { trabajador: f(true), rh: f(true), jefe: f(true), testigo1: f(false), testigo2: f(false) },
    negativa: { marcada: false, confianza: 0.95 }, comentarios: { presente: false, transcripcion: null, inconformidad: null, fuente: null, confianza: 0.95 },
    legibilidad: 'buena', geometria: true, confianza: 0.93, banderas: [] }, extra || {});
}
function subir(B, b64, extra) {
  return B.j('SELECT retardos.hoja_registrar(' + lit(Object.assign({ nombre: 'hoja.pdf', mime: 'application/pdf', contenido_b64: b64, origen: 'prueba' }, extra || {})) + ')');
}
function leer(B, hojaId, paginas) {
  return B.j('SELECT retardos.registrar_lectura(' + lit({ hoja_id: hojaId, ok: true, motor: 'prueba', paginas }) + ')');
}
let nonceN = 0;
function panelS(B, p) { return B.j('SELECT retardos.panel_seguro(' + lit(Object.assign({ actor: 'rh.demo', rol: 'editor', nonce: 'nonce_prueba_' + String(++nonceN).padStart(8, '0') }, p)) + ')'); }
const b64Unico = (t) => Buffer.from('%PDF-1.4 hoja demo ' + t + ' ' + 'x'.repeat(2000)).toString('base64');
const pdfB64 = () => { const P = require('../../retardos/lib/pdf.js'); return P.hoja({ folio: 'RET-2026-0001', accion: 'carta_compromiso', nombre: 'Demo', retardos: [] }).base64; };

const conPg = PG ? test : test.skip;

// ════════════════════════════════════════════════════════════════════════════
conPg('flujo completo: 3 retardos → carta compromiso → firma → validación → reincidencia sube a acta', () => {
  const B = base();
  try {
    const r = ingestar(B, tres(1));
    assert.equal(r.contados, 3);
    assert.equal(r.casos_nuevos.length, 1);
    const folio = r.casos_nuevos[0];
    assert.match(folio, /^RET-2026-[0-9]{4}$/);
    assert.equal(B.q("SELECT accion FROM retardos.caso WHERE folio = '" + folio + "'"), 'carta_compromiso');
    // Complemento S2: la hoja va a RH (notificacion) y al trabajador un aviso informativo con su hoja.
    const env = enviarTodo(B);
    assert.deepEqual(env.map((e) => e.tipo).sort(), ['aviso_trabajador', 'notificacion']);
    assert.ok(env.every((e) => e.pdf === 'carta_compromiso'));
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'ESPERANDO_FIRMA');
    // Si el trabajador aun así contesta con la hoja, entra al lector: el caso no avanza solo.
    const resp = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm1', remitente: 'demo1@example.com',
      asunto: 'RE: [' + folio + '] Carta compromiso', adjuntos: [{ nombre: 'hoja.pdf', mime: 'application/pdf', contenido_b64: pdfB64() }] }) + ')');
    assert.equal(resp.clasificacion, 'ok');
    assert.equal(resp.hojas.length, 1);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'ESPERANDO_FIRMA');
    const lec = leer(B, resp.hojas[0], [pagina(folio)]);
    assert.equal(lec.lecturas[0].sugerencia, 'lista_para_validar');
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'FIRMA_RECIBIDA');
    const v = panelS(B, { accion: 'hoja_confirmar', lectura_id: lec.lecturas[0].lectura_id, resultado: 'firmada' });
    assert.equal(v.ok, true);
    assert.equal(B.q('SELECT acierto FROM retardos.lectura'), 't');
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'CERRADO');
    // Reincidencia: la validación quedó "hoy"; simulamos que fue el 3-sep y llega tarde el 4-sep.
    B.q("UPDATE retardos.caso SET validado_at = '2026-09-03 20:00-06' WHERE folio = '" + folio + "'");
    const r2 = ingestar(B, [chec(1, '2026-09-04', '07:40')]);
    assert.equal(r2.casos_nuevos.length, 1);
    assert.equal(B.q("SELECT accion || ':' || motivo_apertura FROM retardos.caso WHERE folio = '" + r2.casos_nuevos[0] + "'"), 'acta:reincidencia');
  } finally { B.fin(); }
});

conPg('retardo con permiso aprobado (exclusión) no cuenta', () => {
  const B = base();
  try {
    B.q("INSERT INTO retardos.exclusion (employee_id, desde, hasta, tipo, motivo, creado_por) VALUES (1, '2026-09-02', '2026-09-02', 'permiso', 'Permiso demo', 'prueba')");
    const r = ingestar(B, tres(1));
    assert.equal(r.contados, 2);
    assert.equal(r.excluidos, 1);
    assert.equal(r.casos_nuevos.length, 1);
    assert.equal(B.q("SELECT accion FROM retardos.caso"), 'aviso');
    assert.equal(B.q("SELECT motivo FROM retardos.retardo WHERE fecha = '2026-09-02'"), 'exclusion:permiso');
  } finally { B.fin(); }
});

conPg('horario en disputa (TAG) no cuenta', () => {
  const B = base();
  try {
    const c = tres(1); c[0].disputa = true; c[1].incidencia_pendiente = 'INC-DEMO-1';
    const r = ingestar(B, c);
    assert.equal(r.contados, 1);
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE motivo = 'horario_en_disputa'"), '2');
  } finally { B.fin(); }
});

conPg('días en USA (exclusión) y olvido de entrada no cuentan', () => {
  const B = base();
  try {
    B.q("INSERT INTO retardos.exclusion (employee_id, desde, hasta, tipo, motivo, creado_por) VALUES (1, '2026-09-01', '2026-09-02', 'usa', 'Obra en USA demo', 'prueba')");
    const c = tres(1);
    const r = ingestar(B, c, null, { olvido_entrada_att: [c[2].attendance_id] });
    assert.equal(r.contados, 0);
    assert.equal(r.casos_nuevos.length, 0);
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE motivo = 'exclusion:usa'"), '2');
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE motivo = 'olvido_entrada'"), '1');
  } finally { B.fin(); }
});

conPg('festivo no cuenta; fin de semana no existe; solo la primera checada del día', () => {
  const B = base();
  try {
    B.q("INSERT INTO retardos.festivo (fecha, nombre) VALUES ('2026-09-16', 'Festivo demo') ON CONFLICT (fecha) DO NOTHING");
    const r = ingestar(B, [chec(1, '2026-09-16', '09:00'), chec(1, '2026-09-19', '09:00'),
                           chec(1, '2026-09-21', '06:55'), chec(1, '2026-09-21', '09:00')]);
    assert.equal(r.contados, 0);
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE motivo = 'festivo'"), '1');
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE fecha = '2026-09-19'"), '0');
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE fecha = '2026-09-21'"), '0');
  } finally { B.fin(); }
});

// AJUSTE R3 (28-sep-2026): antes "20 min exactos no es retardo, 21 sí". La regla nueva es 15 min al segundo.
conPg('tolerancia: 14:59 y 15:00 exactos no son retardo, 15:01 sí (al segundo)', () => {
  const B = base();
  try {
    const r = ingestar(B, [chec(1, '2026-09-01', '07:14:59'), chec(1, '2026-09-02', '07:15:00'), chec(1, '2026-09-03', '07:15:01')]);
    assert.equal(r.contados, 1);
    assert.equal(r.tolerancia_min, 15);
    assert.equal(B.q("SELECT fecha || '|' || minutos_tarde || '|' || seg_local || '|' || tolerancia_min FROM retardos.retardo"), '2026-09-03|15|26101|15');
    // Con los segundos en el correo: la hora de checada sale 07:15:01, no 07:15.
    config(B, 'contar_desde', '2000-01-01');
    ingestar(B, [chec(1, '2026-09-03', '07:15:01')]);
    const d = B.j("SELECT retardos.caso_datos(id) FROM retardos.caso LIMIT 1");
    assert.equal(d.retardos[0].llegada, '07:15:01');
    assert.equal(d.tolerancia_min, 15);
    assert.equal(d.leyenda_hora, 'hora del centro, CST');
  } finally { B.fin(); }
});

conPg('hora del centro: una checada cerca de la medianoche UTC se cuenta en el día local (CST)', () => {
  const B = base();
  try {
    // 00:30 UTC del miércoles 2 = 18:30 CST del martes 1. 05:59:59 UTC del lunes 7 = 23:59:59 CST del domingo 6.
    const r = ingestar(B, [
      { attendance_id: 7001, employee_id: 1, check_in_utc: '2026-09-02T00:30:00Z', disputa: false, incidencia_pendiente: '' },
      { attendance_id: 7002, employee_id: 1, check_in_utc: '2026-09-07T05:59:59Z', disputa: false, incidencia_pendiente: '' },
      { attendance_id: 7003, employee_id: 1, check_in_utc: '2026-09-07T06:00:00Z', disputa: false, incidencia_pendiente: '' }]);
    assert.equal(B.q("SELECT string_agg(attendance_id || ':' || fecha || ':' || seg_local, ',' ORDER BY attendance_id) FROM retardos.checada"),
      '7001:2026-09-01:66600,7002:2026-09-06:86399,7003:2026-09-07:0');
    assert.equal(r.contados, 1, 'sólo la del martes es retardo; el domingo no existe y el lunes 00:00 es temprano');
    assert.equal(B.q("SELECT fecha FROM retardos.retardo WHERE estado = 'contado'"), '2026-09-01');
    // La conversión vive en un solo lugar y es UTC-6 todo el año (sin horario de verano).
    assert.equal(B.q("SELECT to_char(retardos.a_local('2026-04-05 12:00Z'), 'HH24:MI') || ' ' || to_char(retardos.a_local('2026-07-01 12:00Z'), 'HH24:MI') || ' ' || to_char(retardos.a_local('2026-12-01 12:00Z'), 'HH24:MI')"), '06:00 06:00 06:00');
  } finally { B.fin(); }
});

conPg('sábado y domingo: llegar tarde nunca es retardo, aunque dias_habiles o el calendario los incluyan', () => {
  const B = base();
  try {
    config(B, 'dias_habiles', [1, 2, 3, 4, 5, 6, 7]);
    const r = ingestar(B, [chec(1, '2026-09-05', '11:00'), chec(1, '2026-09-06', '12:00')]);
    assert.equal(r.contados, 0);
    assert.equal(B.q('SELECT count(*) FROM retardos.retardo'), '0');
    assert.equal(B.q("SELECT retardos.es_habil('2026-09-05') || ' ' || retardos.es_habil('2026-09-04')"), 'false true');
  } finally { B.fin(); }
});

test('los festivos del art. 74 LFT quedan sembrados (2026 y 2027)', () => {
  if (!PG) return;
  base().fin();
  assert.equal(festivosSembrados, 14);
});

conPg('empleado sin correo válido: ruta alterna por supervisor', () => {
  const B = base();
  try {
    const r = ingestar(B, tres(2), [EMP(2, { email: 'demo@gmai.com' }), SUP]);
    const folio = r.casos_nuevos[0];
    assert.equal(B.q("SELECT ruta FROM retardos.caso WHERE folio = '" + folio + "'"), 'supervisor');
    const env = B.j('SELECT retardos.por_enviar(10)');
    // Complemento S2: RH recolecta igual; sin correo utilizable no hay aviso al trabajador.
    assert.deepEqual(env.map((e) => e.tipo), ['notificacion']);
    assert.match(env[0].html, /supervisor@example[.]com/);   // el jefe va en copia (escrito en el cuerpo en sombra)
  } finally { B.fin(); }
});

conPg('modo sombra: redirige a sombra_destinatarios con [SOMBRA]; modo real: al empleado', () => {
  const B = base();
  try {
    config(B, 'sombra_destinatarios', ['sombra@example.com']);
    ingestar(B, tres(1));
    const s = B.j('SELECT retardos.por_enviar(10)').find((x) => x.tipo === 'aviso_trabajador');
    assert.deepEqual(s.para, ['sombra@example.com']);
    assert.match(s.asunto, /^\[SOMBRA\] /);
    assert.match(s.html, /demo1@example[.]com/);
    // AJUSTE #386 (7-oct-2026): antes, cambiar modo a real hacía real lo pendiente de un caso de sombra.
    // Ahora un caso de sombra se queda en sombra: la pista real abre su propio caso desde la activación
    // (prueba "go-live con una bandera" abajo).
    config(B, 'modo', 'real');
    const r = B.j('SELECT retardos.por_enviar(10)').find((x) => x.tipo === 'aviso_trabajador');
    assert.deepEqual(r.para, ['sombra@example.com']);
    assert.match(r.asunto, /^\[SOMBRA\] /);
  } finally { B.fin(); }
});

conPg('respuesta sin adjunto → se pide la hoja, el caso no avanza', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0]; enviarTodo(B);
    const r = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm2', remitente: 'demo1@example.com', asunto: 'RE: [' + folio + ']', adjuntos: [] }) + ')');
    assert.equal(r.clasificacion, 'sin_adjunto');
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'ESPERANDO_FIRMA');
    // Complemento S2: ya no se le pide nada al trabajador; lo revisa RH.
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'pide_hoja'"), '0');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'revision_rh' AND estado = 'pendiente'"), '1');
  } finally { B.fin(); }
});

conPg('adjunto ilegible → adjunto_invalido y se pide de nuevo', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0]; enviarTodo(B);
    const r = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm3', remitente: 'demo1@example.com', asunto: 'RE: [' + folio + ']',
      adjuntos: [{ nombre: 'x.exe', mime: 'application/octet-stream', contenido_b64: pdfB64() }, { nombre: 'y.pdf', mime: 'application/pdf', contenido_b64: 'AAAA' }] }) + ')');
    assert.equal(r.clasificacion, 'adjunto_invalido');
    assert.equal(B.q("SELECT count(*) FROM retardos.evidencia"), '0');
    assert.equal(B.q("SELECT count(*) FROM retardos.hoja"), '0');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'revision_rh'"), '1');   // complemento S2: a RH
  } finally { B.fin(); }
});

conPg('respuesta desde otro remitente → revisión de RH, evidencia guardada, caso sin avanzar', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0]; enviarTodo(B);
    const r = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm4', remitente: 'otra.persona@example.com', asunto: 'RE: [' + folio + ']',
      adjuntos: [{ nombre: 'hoja.pdf', mime: 'application/pdf', contenido_b64: pdfB64() }] }) + ')');
    assert.equal(r.clasificacion, 'remitente_distinto');
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'ESPERANDO_FIRMA');
    // Complemento S2: la hoja entra al lector y RH decide en "Hojas por confirmar".
    assert.equal(B.q("SELECT count(*) FROM retardos.hoja WHERE origen = 'correo'"), '1');
    assert.equal(B.q("SELECT count(*) FROM retardos.evidencia"), '0');
  } finally { B.fin(); }
});

conPg('folio equivocado o ausente → revisión de RH', () => {
  const B = base();
  try {
    ingestar(B, tres(1)); enviarTodo(B);
    const a = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm5', remitente: 'demo1@example.com', asunto: 'RE: [RET-2026-9999]', adjuntos: [] }) + ')');
    const b = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm6', remitente: 'demo1@example.com', asunto: 'Mi hoja', adjuntos: [] }) + ')');
    assert.equal(a.clasificacion, 'folio_inexistente');
    assert.equal(b.clasificacion, 'sin_folio');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'revision_rh'"), '2');
  } finally { B.fin(); }
});

conPg('doble envío e ingesta repetida: nada se duplica', () => {
  const B = base();
  try {
    const c = tres(1);
    const r1 = ingestar(B, c); const r2 = ingestar(B, c);
    assert.equal(r1.casos_nuevos.length, 1);
    assert.equal(r2.casos_nuevos.length, 0);
    assert.equal(r2.retardos_nuevos, 0);
    assert.equal(B.q('SELECT count(*) FROM retardos.envio'), '2');   // complemento S2: RH + aviso al trabajador
    const e = B.j('SELECT retardos.por_enviar(10)')[0];
    B.j('SELECT retardos.marcar_envio(' + lit({ id: e.id, ok: true, modo: 'sombra' }) + ')');
    const otra = B.j('SELECT retardos.marcar_envio(' + lit({ id: e.id, ok: true, modo: 'sombra' }) + ')');
    assert.equal(otra.ya_enviado, true);
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE a = 'NOTIFICADO'"), '1');
    const dup = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'mx', remitente: 'a@example.com', asunto: 'x' }) + ')');
    const dup2 = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'mx', remitente: 'a@example.com', asunto: 'x' }) + ')');
    assert.equal(dup2.clasificacion, 'duplicado');
    assert.notEqual(dup.clasificacion, 'duplicado');
  } finally { B.fin(); }
});

conPg('cron repetido: verificar dos veces el mismo día no duplica recordatorios; el segundo vencimiento escala', () => {
  const B = base();
  try {
    ingestar(B, tres(1)); enviarTodo(B);
    B.q("UPDATE retardos.caso SET vence_at = now() - interval '1 hour'");
    const v1 = B.j("SELECT retardos.verificar('{}'::jsonb)");
    const v2 = B.j("SELECT retardos.verificar('{}'::jsonb)");
    assert.equal(v1.vencidos, 1);
    assert.equal(v2.vencidos, 0);
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'recordatorio'"), '1');
    B.q("UPDATE retardos.caso SET vence_at = now() - interval '1 hour'");
    const v3 = B.j("SELECT retardos.verificar('{}'::jsonb)");
    assert.equal(v3.escalados, 1);
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'ESCALADO');
    assert.match(B.q("SELECT para::text FROM retardos.envio WHERE tipo = 'escalamiento'"), /estebandelacruz@fts[.]mx/);   // complemento S2: a Dirección
    assert.match(B.q("SELECT cuerpo_html FROM retardos.envio WHERE tipo = 'recordatorio'"), /Venció el plazo para subir la hoja/);
  } finally { B.fin(); }
});

conPg('suspensión: se verifica contra checadas y Nómina; si hubo checada, alerta', () => {
  const B = base();
  try {
    B.q("UPDATE retardos.escalera SET umbral = 1 WHERE nivel = 4; UPDATE retardos.escalera SET activo = false WHERE nivel < 4");
    habilitarTodo(B); // retardos_0005: estas pruebas son del flujo CON suspensiones habilitadas
    const folio = ingestar(B, [chec(1, '2026-09-01', '09:00')]).casos_nuevos[0];
    enviarTodo(B);
    B.j('SELECT retardos.panel(' + lit({ accion: 'registrar_negativa', folio, actor: 'rh', rol: 'editor', testigo1: 'Testigo A', testigo2: 'Testigo B' }) + ')');
    const p = B.j('SELECT retardos.panel(' + lit({ accion: 'programar_accion', folio, actor: 'rh', rol: 'editor', desde: '2026-09-07', dias: 2 }) + ')');
    assert.equal(p.ok, true);
    assert.equal(B.q("SELECT accion_hasta FROM retardos.caso"), '2026-09-08');
    ingestar(B, [chec(1, '2026-09-08', '07:00')]);           // ¡checó el día de la suspensión!
    const v = B.j('SELECT retardos.verificar(' + lit({ nom: [{ employee_id: 1, desde: '2026-09-07', hasta: '2026-09-08' }] }) + ')');
    assert.equal(v.acciones_verificadas, 0);
    assert.equal(v.alertas, 1);
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'ACCION_PROGRAMADA');
  } finally { B.fin(); }
});

conPg('suspensión aplicada: sin checadas y en Nómina → ACCION_VERIFICADA y CERRADO', () => {
  const B = base();
  try {
    B.q("UPDATE retardos.escalera SET umbral = 1 WHERE nivel = 4; UPDATE retardos.escalera SET activo = false WHERE nivel < 4");
    habilitarTodo(B); // retardos_0005: estas pruebas son del flujo CON suspensiones habilitadas
    const folio = ingestar(B, [chec(1, '2026-09-01', '09:00')]).casos_nuevos[0];
    enviarTodo(B);
    B.j('SELECT retardos.panel(' + lit({ accion: 'registrar_negativa', folio, actor: 'rh', rol: 'editor', testigo1: 'Testigo A', testigo2: 'Testigo B' }) + ')');
    B.j('SELECT retardos.panel(' + lit({ accion: 'programar_accion', folio, actor: 'rh', rol: 'editor', desde: '2026-09-07', dias: 2 }) + ')');
    const v = B.j('SELECT retardos.verificar(' + lit({ nom: [{ employee_id: 1, desde: '2026-09-07', hasta: '2026-09-08' }] }) + ')');
    assert.equal(v.acciones_verificadas, 1);
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'CERRADO');
  } finally { B.fin(); }
});

conPg('reglas legales: suspensión de más de 8 días rechazada; negativa exige dos testigos; cancelar exige motivo', () => {
  const B = base();
  try {
    B.q("UPDATE retardos.escalera SET umbral = 1 WHERE nivel = 4; UPDATE retardos.escalera SET activo = false WHERE nivel < 4");
    habilitarTodo(B); // retardos_0005: estas pruebas son del flujo CON suspensiones habilitadas
    const folio = ingestar(B, [chec(1, '2026-09-01', '09:00')]).casos_nuevos[0]; enviarTodo(B);
    assert.equal(B.j('SELECT retardos.panel(' + lit({ accion: 'registrar_negativa', folio, actor: 'rh', rol: 'editor', testigo1: 'A' }) + ')').error, 'FALTAN_TESTIGOS');
    assert.equal(B.j('SELECT retardos.panel(' + lit({ accion: 'programar_accion', folio, actor: 'rh', rol: 'editor', desde: '2026-09-07', dias: 9 }) + ')').error, 'DIAS_FUERA_DE_LEY');
    assert.throws(() => B.q('SELECT retardos.panel(' + lit({ accion: 'cancelar', folio, actor: 'rh', rol: 'editor', motivo: '' }) + ')'), /MOTIVO_OBLIGATORIO/);
    assert.equal(B.j('SELECT retardos.panel(' + lit({ accion: 'cancelar', folio, actor: 'lector', rol: 'lector', motivo: 'intento' }) + ')').error, 'SOLO_LECTURA');
  } finally { B.fin(); }
});

conPg('bitácora inmutable: UPDATE y DELETE truenan', () => {
  const B = base();
  try {
    ingestar(B, tres(1));
    assert.throws(() => B.q("UPDATE retardos.bitacora SET motivo = 'x'"), /inmutable/);
    assert.throws(() => B.q('DELETE FROM retardos.bitacora'), /inmutable/);
  } finally { B.fin(); }
});

conPg('transición inválida truena (no se salta la máquina de estados)', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0];
    assert.throws(() => B.q("SELECT retardos.transicionar((SELECT id FROM retardos.caso WHERE folio = '" + folio + "'), 'CERRADO', 'x', 'y')"), /TRANSICION_INVALIDA/);
  } finally { B.fin(); }
});

conPg('anti-replay: el mismo nonce dos veces es REPLAY', () => {
  const B = base();
  try {
    const p = { accion: 'listar', actor: 'rh', rol: 'lector', nonce: 'nonce_demo_000000001' };
    assert.equal(B.j('SELECT retardos.panel_seguro(' + lit(p) + ')').ok, true);
    assert.equal(B.j('SELECT retardos.panel_seguro(' + lit(p) + ')').error, 'REPLAY');
  } finally { B.fin(); }
});

conPg('panel: RH ve la hoja subida y la consulta queda en la bitácora', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0];
    const b64 = Buffer.from('%PDF-1.4 demo ' + 'x'.repeat(2000)).toString('base64');
    const sub = { accion: 'subir_hoja', actor: 'rh.demo', rol: 'editor', nonce: 'nonce_demo_ev_0000001', folio,
                  nombre: 'hoja-demo.pdf', mime: 'application/pdf', contenido_b64: b64 };
    const subida = B.j('SELECT retardos.panel_seguro(' + lit(sub) + ')');
    assert.equal(subida.ok, true);
    // Complemento S2: la hoja entra al lector; al leerse queda ligada como evidencia del caso.
    leer(B, subida.archivos[0].hoja_id, [pagina(folio)]);
    const caso = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'caso', actor: 'rh.demo', rol: 'lector', nonce: 'nonce_demo_ev_0000002', folio }) + ')');
    const ev = caso.evidencias[0];
    const r = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'evidencia', actor: 'rh.demo', rol: 'lector', nonce: 'nonce_demo_ev_0000003', folio, id: ev.id }) + ')');
    assert.equal(r.ok, true);
    assert.equal(r.contenido_b64.replace(/[^A-Za-z0-9+/=]/g, ''), b64);
    const otro = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'evidencia', actor: 'rh.demo', rol: 'lector', nonce: 'nonce_demo_ev_0000004', folio, id: ev.id + 999 }) + ')');
    assert.equal(otro.error, 'EVIDENCIA_INEXISTENTE');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'evidencia_vista'"), '1');
  } finally { B.fin(); }
});

// ── retardos_0005: arranque suave ───────────────────────────────────────────
function siete(emp) {
  const dias = ['01', '02', '03', '04', '07', '08', '09'];
  return dias.map((d) => chec(emp, '2026-09-' + d, '07:45'));
}
function envios(B, folio) {
  return B.j("SELECT coalesce(jsonb_agg(tipo), '[]'::jsonb) FROM retardos.envio WHERE caso_id = (SELECT id FROM retardos.caso WHERE folio = '" + folio + "')");
}
function diaPorDia(B, ch) {
  const abiertos = [];
  for (let i = 0; i < ch.length; i++) abiertos.push(...ingestar(B, ch.slice(0, i + 1)).casos_nuevos);
  return abiertos;
}
conPg('modo sin suspensión (complemento S2): aviso, carta y acta se notifican; la suspensión queda RETENIDO sin correo', () => {
  const B = base();
  try {
    const cfg = B.j("SELECT jsonb_build_object('v', valor, 'c', confirmado) FROM retardos.config WHERE clave = 'modo_sanciones'");
    assert.deepEqual(cfg, { v: 'sin_suspension', c: false });
    assert.match(B.q("SELECT descripcion FROM retardos.config WHERE clave = 'nivel_maximo_habilitado'"), /^OBSOLETA/);
    config(B, 'nivel_maximo_habilitado', 1);            // obsoleta: ya no se lee
    const abiertos = diaPorDia(B, siete(1));   // como en producción: cada umbral cruzado abre su caso
    const casos = B.j("SELECT jsonb_object_agg(nivel, estado) FROM retardos.caso WHERE employee_id = 1");
    assert.deepEqual(Object.keys(casos).sort(), ['1', '2', '3', '4']);
    for (const n of ['1', '2', '3']) assert.notEqual(casos[n], 'RETENIDO');
    assert.equal(casos['4'], 'RETENIDO');
    for (const f of abiertos) {
      const nivel = B.j("SELECT nivel FROM retardos.caso WHERE folio = '" + f + "'");
      const tipos = envios(B, f);
      if (nivel === 4) assert.deepEqual(tipos, [], 'el nivel de suspensión no genera ningún correo');
      else assert.ok(tipos.includes('notificacion'));
      if (nivel === 3) assert.ok(tipos.includes('aviso_trabajador'), 'el acta sí se notifica');
    }
    assert.equal(B.j("SELECT count(*) FROM retardos.bitacora WHERE a = 'RETENIDO' AND motivo LIKE 'Nivel de suspensión alcanzado, no aplicado%'"), 1);
    const lista = B.j('SELECT retardos.panel(' + lit({ accion: 'listar', actor: 'rh', rol: 'lector' }) + ')');
    assert.equal(lista.casos.filter((c) => c.estado === 'RETENIDO').length, 1, 'RH lo ve en el panel');
    const r = B.j('SELECT retardos.panel_reincidencia(' + lit({}) + ')');
    assert.equal(r.personas.find((x) => x.employee_id === 1).suspension_no_aplicada, 1, 'cuenta como antecedente');
    habilitarTodo(B);
    assert.equal(B.j('SELECT to_jsonb(retardos.nivel_habilitado(4::smallint))'), true);
  } finally { B.fin(); }
});

conPg('un caso RETENIDO sólo puede cerrarse o cancelarse', () => {
  const B = base();
  try {
    diaPorDia(B, siete(1));
    const folio = B.j("SELECT to_jsonb(folio) FROM retardos.caso WHERE employee_id = 1 AND nivel = 4");
    assert.throws(() => B.q("SELECT retardos.transicionar((SELECT id FROM retardos.caso WHERE folio = '" + folio + "'), 'ESPERANDO_FIRMA', 'x', 'y')"), /TRANSICION_INVALIDA/);
    const r = B.j('SELECT retardos.panel(' + lit({ accion: 'cerrar', folio, actor: 'rh', rol: 'editor', motivo: 'Se habló en persona; no procede documento' }) + ')');
    assert.equal(r.ok, true);
    assert.equal(r.caso.estado, 'CERRADO');
  } finally { B.fin(); }
});

// ── retardos_0005: calidad de datos ─────────────────────────────────────────
conPg('calidad de datos: banderas, hora sugerida (sin tocar la ficha) y "revisado" con bitácora', () => {
  const B = base();
  try {
    const hoy = B.j("SELECT to_jsonb((now() AT TIME ZONE 'America/Monterrey')::date)");
    const dias = B.j("SELECT jsonb_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d) FROM generate_series(('" + hoy + "'::date - 40), ('" + hoy + "'::date - 1), interval '1 day') d WHERE extract(isodow FROM d) < 6");
    const ch = [];
    dias.forEach((d, i) => { ch.push(chec(1, d, i % 5 === 0 ? '07:05' : '08:10')); ch.push(chec(2, d, '07:00')); });
    const emps = [EMP(1, { hora_entrada: 7, hora_calendario: 8, email: 'demo1@gmai.com' }),
                  EMP(2, { email: 'compartido@example.com' }), EMP(3, { email: 'compartido@example.com' }), SUP];
    B.j('SELECT retardos.ingestar(' + lit({ workflow: 'retardos/detectar', desde: dias[0], hasta: hoy, empleados: emps, checadas: ch, olvido_entrada_att: [] }) + ')');
    const cal = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'calidad', actor: 'rh', rol: 'lector', nonce: 'nonce_demo_cal_000001' }) + ')');
    assert.equal(cal.ok, true);
    const p = (id) => cal.personas.find((x) => x.employee_id === id);
    assert.equal(p(1).banderas.ficha_vs_calendario, true);
    assert.equal(p(1).banderas.correo_personal, true);
    assert.equal(p(1).banderas.dominio_invalido, true);
    assert.ok(Number(p(1).pct_tarde) >= 75, 'llega 08:10 con entrada 07:00 la mayoría de los días');
    assert.equal(Number(p(1).hora_sugerida), 8);
    assert.equal(p(2).banderas.correo_compartido, true);
    assert.equal(Number(p(2).hora_sugerida), 7, 'quien ya llega a tiempo conserva su hora');
    assert.equal(p(3).banderas.sin_checadas, true);
    assert.equal(Number(B.j('SELECT hora_entrada FROM retardos.empleado WHERE employee_id = 1')), 7, 'la sugerida nunca toca la ficha');
    const no = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'calidad_revisar', actor: 'rh', rol: 'lector', nonce: 'nonce_demo_cal_000002', employee_id: 1 }) + ')');
    assert.equal(no.error, 'SOLO_LECTURA');
    const si = B.j('SELECT retardos.panel_seguro(' + lit({ accion: 'calidad_revisar', actor: 'rh.demo', rol: 'editor', nonce: 'nonce_demo_cal_000003', employee_id: 1, revisado: true, nota: 'Su entrada real es 8:00; se corrige en Odoo' }) + ')');
    assert.equal(si.ok, true);
    const cal2 = B.j('SELECT retardos.panel_calidad(' + lit({}) + ')');
    assert.equal(cal2.personas.find((x) => x.employee_id === 1).revisado, true);
    assert.equal(B.j("SELECT count(*) FROM retardos.bitacora WHERE evento = 'calidad_revisado' AND evidencia->>'employee_id' = '1'"), 1);
  } finally { B.fin(); }
});

// ── retardos_0005: simulador de escalera ────────────────────────────────────
conPg('simulador: cuenta casos por umbral cruzado, retiene arriba del nivel máximo y no escribe nada', () => {
  const B = base();
  try {
    ingestar(B, siete(1).concat([chec(2, '2026-09-01', '07:45'), chec(2, '2026-09-02', '11:30')]), [EMP(1), EMP(2), SUP]);
    const antes = B.j("SELECT jsonb_build_array((SELECT count(*) FROM retardos.caso), (SELECT count(*) FROM retardos.envio), (SELECT count(*) FROM retardos.bitacora))");
    const a = B.j('SELECT retardos.simular_escalera(' + lit({ desde: '2026-09-01', hasta: '2026-09-30', umbrales: [1, 3, 5, 7] }) + ')');
    const m = a.por_mes['2026-09'];
    assert.equal(m.retardos, 9);
    assert.deepEqual(m.casos_notificados_por_nivel, { 1: 2, 2: 1, 3: 1, 4: 1 });
    assert.equal(m.correos_a_personas, 5);
    assert.deepEqual(m.personas_por_nivel_maximo, { 1: 1, 4: 1 });
    const f = B.j('SELECT retardos.simular_escalera(' + lit({ desde: '2026-09-01', hasta: '2026-09-30', umbrales: [1, 3, 5, 7], nivel_max: 2, excluir_mas_de_min: 180 }) + ')');
    const mf = f.por_mes['2026-09'];
    assert.equal(mf.retardos, 8, 'el retraso de 4.5 h se excluye');
    assert.deepEqual(mf.casos_retenidos_por_nivel, { 3: 1, 4: 1 });
    assert.equal(mf.correos_a_personas, 3);
    const despues = B.j("SELECT jsonb_build_array((SELECT count(*) FROM retardos.caso), (SELECT count(*) FROM retardos.envio), (SELECT count(*) FROM retardos.bitacora))");
    assert.deepEqual(despues, antes, 'el simulador es de sólo lectura');
  } finally { B.fin(); }
});

conPg('Odoo caído o sin datos: la corrida lee 0 y el latido lo reporta', () => {
  const B = base();
  try {
    ingestar(B, []);
    const s = B.j('SELECT retardos.salud()');
    assert.equal(s.ok, false);
    assert.ok(s.problemas.some((x) => x.codigo === 'DETECTAR_LEYO_CERO'));
  } finally { B.fin(); }
});

conPg('latido sin corrida: nunca corrió / hace demasiado que no corre', () => {
  const B = base();
  try {
    assert.ok(B.j('SELECT retardos.salud()').problemas.some((x) => x.codigo === 'DETECTAR_NUNCA_CORRIO'));
    ingestar(B, tres(1));
    B.q("UPDATE retardos.corrida SET iniciada_at = now() - interval '5 days'");
    const s = B.j('SELECT retardos.salud()');
    // Si hoy es día hábil debe reportar DETECTAR_SIN_CORRER; siempre debe haber problema u ok coherente.
    const habil = B.q("SELECT retardos.es_habil((now() AT TIME ZONE 'America/Monterrey')::date)") === 't';
    assert.equal(s.problemas.some((x) => x.codigo === 'DETECTAR_SIN_CORRER'), habil);
  } finally { B.fin(); }
});

conPg('credencial expirada (Graph 401): el correo queda fallido, reintenta y el latido avisa si se atora', () => {
  const B = base();
  try {
    ingestar(B, tres(1));
    const e = B.j('SELECT retardos.por_enviar(10)')[0];
    B.j('SELECT retardos.marcar_envio(' + lit({ id: e.id, ok: false, error: 'HTTP 401 InvalidAuthenticationToken' }) + ')');
    assert.equal(B.q('SELECT estado || intentos FROM retardos.envio WHERE id = ' + e.id), 'fallido1');
    assert.ok(B.j('SELECT retardos.por_enviar(10)').some((x) => x.id === e.id));   // se reintenta
    B.q("UPDATE retardos.envio SET creado_at = now() - interval '5 hours'");
    assert.ok(B.j('SELECT retardos.salud()').problemas.some((x) => x.codigo === 'OUTBOX_ATORADO'));
  } finally { B.fin(); }
});

// ════════════════════════════════════════════════════════════════════════════
// Complemento S2 (retardos_0006): correos, hojas, modo de sanciones y alertas
// ════════════════════════════════════════════════════════════════════════════
function hoyMty() { return new Date(Date.now() - 6 * 3600 * 1000); }
function ymd(d) { return d.toISOString().slice(0, 10); }
// Primeros n días hábiles (lun a vie) del mes que está `desp` meses después del actual.
function habilesMes(desp, n) {
  const h = hoyMty(); const d = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + desp, 1)); const out = [];
  while (out.length < n) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function tardes(emp, fechas) { return fechas.map((f) => chec(emp, f, '07:45')); }
function ingestarRango(B, checadas, empleados) {
  const fs = checadas.map((c) => c.check_in_utc.slice(0, 10)).sort();
  return ingestar(B, checadas, empleados, { desde: fs[0] || '2026-09-01', hasta: fs[fs.length - 1] || '2026-09-30' });
}
function diaPorDiaRango(B, ch, empleados) {
  const abiertos = [];
  for (let i = 0; i < ch.length; i++) abiertos.push(...ingestarRango(B, ch.slice(0, i + 1), empleados).casos_nuevos);
  return abiertos;
}

conPg('correos: sólo personal, ambos en modo "ambos", sin correo válido y compartido; cada envío guarda de qué campo salió', () => {
  const B = base();
  try {
    const emps = [
      EMP(1, { email: 'uno@gmail.com', correos: [{ campo: 'work_email', email: 'uno@gmail.com' }] }),
      EMP(2, { email: 'dos@fts.mx', correos: [{ campo: 'work_email', email: 'dos@fts.mx' }, { campo: 'private_email', email: 'dos@gmail.com' }] }),
      EMP(3, { email: 'tres@gmai.com', correos: [{ campo: 'work_email', email: 'tres@gmai.com' }] }),
      EMP(4, { email: 'ventas@fts.mx', correos: [{ campo: 'work_email', email: 'ventas@fts.mx' }] }),
      EMP(5, { email: 'ventas@fts.mx', correos: [{ campo: 'work_email', email: 'ventas@fts.mx' }] }),
      EMP(6, { email: 'equipo@fts.mx', correos: [{ campo: 'work_email', email: 'equipo@fts.mx' }] }),
      EMP(7, { email: 'equipo@fts.mx', correos: [{ campo: 'work_email', email: 'equipo@fts.mx' }] }), SUP];
    ingestar(B, [].concat(tres(1), tres(2), tres(3), tres(4), tres(6)), emps);
    const d = (id) => B.j('SELECT retardos.destinatarios(' + id + ')');
    assert.deepEqual(d(1).map((x) => [x.email, x.campo, x.tipo]), [['uno@gmail.com', 'work_email', 'personal']], 'sólo personal: se usa el personal');
    assert.deepEqual(d(2).map((x) => x.email), ['dos@fts.mx'], 'preferente: empresa primero');
    assert.deepEqual(d(3), [], 'dominio mal escrito: ninguno');
    assert.deepEqual(d(4), [], 'buzón genérico compartido: ninguno');
    assert.deepEqual(d(6), [], 'compartido aunque no sea genérico: ninguno');
    assert.equal(B.q("SELECT retardos.correos_de(6)->0->>'motivo'"), 'compartido');
    config(B, 'correo_modo', 'ambos');
    assert.deepEqual(d(2).map((x) => [x.email, x.campo]), [['dos@fts.mx', 'work_email'], ['dos@gmail.com', 'private_email']]);
    // Envíos: el aviso al trabajador guarda el origen del correo; sin correo, sólo va la hoja a RH.
    const orig = B.j("SELECT destinatarios_origen FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.employee_id = 1 AND e.tipo = 'aviso_trabajador'");
    assert.deepEqual(orig.map((x) => x.campo), ['work_email']);
    for (const id of [3, 4, 6]) {
      const tipos = B.j("SELECT jsonb_agg(e.tipo) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.employee_id = " + id);
      assert.deepEqual(tipos, ['notificacion'], 'empleado ' + id + ': sin aviso al trabajador, la hoja va a RH');
    }
    // Calidad de datos muestra qué correo se usa y por qué.
    const cal = B.j('SELECT retardos.panel_calidad(' + lit({}) + ')');
    assert.equal(cal.personas.find((x) => x.employee_id === 3).correo_motivo, 'sin correo utilizable: la hoja va sólo a RH y al jefe');
  } finally { B.fin(); }
});

conPg('hojas: completa, falta firma, negativa con y sin testigos, inconformidad, foto chueca, folio inexistente, inyección', () => {
  const B = base();
  try {
    const emps = [1, 2, 3, 4, 5, 6].map((i) => EMP(i, { nombre: 'Demo ' + i })).concat([SUP]);
    const r = ingestar(B, [].concat(tres(1), tres(2), tres(3), tres(4), tres(5), tres(6)), emps);
    const folio = {}; for (const f of r.casos_nuevos) folio[B.j("SELECT employee_id FROM retardos.caso WHERE folio = '" + f + "'")] = f;
    enviarTodo(B);
    const f = (p) => ({ presente: p, confianza: 0.9 });
    const casos = [
      [1, pagina(folio[1], { nombre_visible: 'Demo 1' }), 'lista_para_validar'],
      [2, pagina(folio[2], { nombre_visible: 'Demo 2', firmas: { trabajador: f(false), rh: f(true), jefe: f(true), testigo1: f(false), testigo2: f(false) } }), 'revisar_falta_firma'],
      [3, pagina(folio[3], { nombre_visible: 'Demo 3', negativa: { marcada: true, confianza: 0.9 }, firmas: { trabajador: f(false), rh: f(true), jefe: f(false), testigo1: f(true), testigo2: f(true) } }), 'lista_para_validar'],
      [4, pagina(folio[4], { nombre_visible: 'Demo 4', negativa: { marcada: true, confianza: 0.9 }, firmas: { trabajador: f(false), rh: f(true), jefe: f(false), testigo1: f(false), testigo2: f(false) } }), 'revisar_falta_firma'],
      [5, pagina(folio[5], { nombre_visible: 'Demo 5', comentarios: { presente: true, transcripcion: 'No estoy de acuerdo, tenía permiso', inconformidad: true, fuente: 'ia', confianza: 0.8 } }), 'revisar_impugnacion'],
      [6, pagina(folio[6], { nombre_visible: 'Demo 6', legibilidad: 'regular', confianza: 0.71, banderas: ['foto_inclinada'] }), 'lista_para_validar']
    ];
    const lect = {};
    for (const [id, pg, esperada] of casos) {
      const h = subir(B, b64Unico('caso' + id));
      const l = leer(B, h.hoja_id, [pg]);
      assert.equal(l.lecturas[0].sugerencia, esperada, 'empleado ' + id);
      lect[id] = l.lecturas[0].lectura_id;
      assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio[id] + "'"), 'FIRMA_RECIBIDA', 'la hoja no cierra el caso sola');
    }
    assert.match(B.q('SELECT sugerencia_texto FROM retardos.lectura WHERE id = ' + lect[4]), /testigo1, testigo2/);
    assert.match(B.q('SELECT sugerencia_texto FROM retardos.lectura WHERE id = ' + lect[2]), /trabajador/);
    // Folio que no existe
    const h7 = subir(B, b64Unico('inexistente'));
    const l7 = leer(B, h7.hoja_id, [pagina('RET-2026-9999')]);
    assert.equal(l7.lecturas[0].sugerencia, 'revisar_folio');
    assert.equal(B.q('SELECT caso_id IS NULL FROM retardos.lectura WHERE id = ' + l7.lecturas[0].lectura_id), 't');
    // Nombre que no coincide
    const h8 = subir(B, b64Unico('otro-nombre'));
    assert.equal(leer(B, h8.hoja_id, [pagina(folio[1], { nombre_visible: 'Persona Distinta' })]).lecturas[0].sugerencia, 'revisar_folio');
    // Texto que intenta dar instrucciones: es dato, va a revisión
    const h9 = subir(B, b64Unico('inyeccion'));
    const l9 = leer(B, h9.hoja_id, [pagina(folio[1], { banderas: ['posible_inyeccion'] })]);
    assert.equal(l9.lecturas[0].sugerencia, 'revisar_inyeccion');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'posible_inyeccion'"), '1');

    // RH decide. Negativa exige testigos; confirmada, cierra la carta.
    assert.equal(panelS(B, { accion: 'hoja_confirmar', lectura_id: lect[3], resultado: 'negativa', testigo1: 'A' }).error, 'FALTAN_TESTIGOS');
    assert.equal(panelS(B, { accion: 'hoja_confirmar', lectura_id: lect[3], resultado: 'negativa', testigo1: 'Testigo Uno', testigo2: 'Testigo Dos' }).ok, true);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio[3] + "'"), 'CERRADO');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE a = 'SE_NEGO_A_FIRMAR'"), '1');
    // Inconformidad confirmada como impugnación
    assert.equal(panelS(B, { accion: 'hoja_confirmar', lectura_id: lect[5], resultado: 'impugnacion' }).ok, true);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio[5] + "'"), 'IMPUGNADO');
    // Falta firma: RH la pide de nuevo; el caso vuelve a esperar a RH
    assert.equal(panelS(B, { accion: 'hoja_pedir_de_nuevo', lectura_id: lect[2], motivo: 'falta_firma' }).ok, true);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio[2] + "'"), 'ESPERANDO_FIRMA');
    // Foto chueca pero legible: lista
    assert.equal(panelS(B, { accion: 'hoja_confirmar', lectura_id: lect[6], resultado: 'firmada' }).ok, true);
    // RH se equivocó el sistema: la lectura 1 dijo lista pero RH ve que falta firma
    assert.equal(panelS(B, { accion: 'hoja_pedir_de_nuevo', lectura_id: lect[1], motivo: 'falta_firma' }).ok, true);
    // Lector (sin editor) no decide
    assert.equal(panelS(B, { accion: 'hoja_confirmar', lectura_id: lect[4], resultado: 'firmada', rol: 'lector' }).error, 'SOLO_LECTURA');
    // Inyección descartada con motivo
    assert.equal(panelS(B, { accion: 'hoja_descartar', lectura_id: l9.lecturas[0].lectura_id, motivo: 'inyeccion', nota: 'Texto ajeno en la hoja' }).ok, true);
    // Folio corregido por RH: liga la hoja al caso correcto sin confirmarla
    assert.equal(panelS(B, { accion: 'hoja_corregir', lectura_id: l7.lecturas[0].lectura_id, folio: folio[4] }).ok, true);
    assert.equal(B.q('SELECT caso_id = (SELECT id FROM retardos.caso WHERE folio = ' + "'" + folio[4] + "'" + ') FROM retardos.lectura WHERE id = ' + l7.lecturas[0].lectura_id), 't');
    // Métrica: 6 decididas (3,5,2,6,1,9); acierta en todas menos la 1.
    const m = B.j('SELECT retardos.metrica_lector(7)');
    assert.equal(m.decididas, 6);
    assert.equal(m.aciertos, 5);
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'hoja_decidida'"), '6');
    // Cada lectura de hoja con caso avisa a RH
    assert.ok(Number(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'aviso_rh' AND cuerpo_html LIKE '%Sugerencia del lector%'")) >= 6);
  } finally { B.fin(); }
});

conPg('hojas: PDF con 3 hojas de distintos folios, página anexa, duplicado idempotente y cola del procesador', () => {
  const B = base();
  try {
    const r = ingestar(B, [].concat(tres(1), tres(2), tres(3)), [EMP(1), EMP(2), EMP(3), SUP]);
    enviarTodo(B);
    const fol = r.casos_nuevos;
    const b64 = b64Unico('lote');
    const h = subir(B, b64, { origen: 'carpeta' });
    assert.equal(h.duplicada, false);
    const dup = subir(B, b64, { origen: 'panel' });
    assert.equal(dup.duplicada, true);
    assert.equal(dup.hoja_id, h.hoja_id, 'la misma hoja dos veces no se procesa dos veces');
    // cola: se toma una vez; no se vuelve a entregar mientras se procesa
    const t1 = B.j('SELECT retardos.hojas_pendientes(5)');
    const t2 = B.j('SELECT retardos.hojas_pendientes(5)');
    assert.equal(t1.length, 1); assert.equal(t2.length, 0);
    const nom = (f) => B.q("SELECT m.nombre FROM retardos.caso c JOIN retardos.empleado m ON m.employee_id = c.employee_id WHERE c.folio = '" + f + "'");
    const l = leer(B, h.hoja_id, [
      pagina(fol[0], { pagina: 1, nombre_visible: nom(fol[0]) }),
      pagina(fol[0], { pagina: 2, qr_pagina: 2, qr_total: 2 }),
      pagina(fol[1], { pagina: 3, nombre_visible: nom(fol[1]) }),
      pagina(fol[2], { pagina: 4, nombre_visible: nom(fol[2]) })]);
    assert.deepEqual(l.lecturas.map((x) => x.sugerencia), ['lista_para_validar', 'anexo', 'lista_para_validar', 'lista_para_validar']);
    for (const f of fol) assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + f + "'"), 'FIRMA_RECIBIDA');
    assert.equal(B.q('SELECT count(DISTINCT caso_id) FROM retardos.evidencia'), '3');
    const ph = B.j('SELECT retardos.panel_hojas(' + lit({}) + ')');
    assert.equal(ph.lecturas.length, 3, 'la página anexa no se confirma aparte');
    // Procesador caído: error, reintento y alerta del latido
    const h2 = subir(B, b64Unico('falla'));
    for (let i = 0; i < 3; i++) {
      B.j('SELECT retardos.hojas_pendientes(5)');
      B.j('SELECT retardos.registrar_lectura(' + lit({ hoja_id: h2.hoja_id, ok: false, error: 'HTTP 502' }) + ')');
    }
    assert.equal(B.j('SELECT retardos.hojas_pendientes(5)').length, 0, 'después de 3 intentos ya no se reintenta');
    const s = B.j('SELECT retardos.salud()');
    assert.ok(s.problemas.some((x) => x.codigo === 'HOJAS_CON_ERROR'));
    assert.ok(s.problemas.some((x) => x.codigo === 'PROCESADOR_CON_ERRORES'));
    subir(B, b64Unico('atorada'));
    B.q("UPDATE retardos.hoja SET creado_at = now() - interval '10 hours' WHERE estado = 'pendiente'");
    assert.ok(B.j('SELECT retardos.salud()').problemas.some((x) => x.codigo === 'HOJAS_ATORADAS'));
  } finally { B.fin(); }
});

conPg('plazos contra RH: vence → recordatorio a RH con copia al jefe; vence otra vez → Dirección', () => {
  const B = base();
  try {
    config(B, 'rh_destinatarios', ['rh.demo@example.com']);
    ingestar(B, tres(1)); enviarTodo(B);
    const plazo = B.j("SELECT to_jsonb(vence_at::date - abierto_at::date) FROM retardos.caso");
    assert.ok(plazo >= 3 && plazo <= 7, 'tres días hábiles');
    B.q("UPDATE retardos.caso SET vence_at = now() - interval '1 hour'");
    B.j("SELECT retardos.verificar('{}'::jsonb)");
    const rec = B.j("SELECT jsonb_build_object('para', para, 'cc', cc) FROM retardos.envio WHERE tipo = 'recordatorio'");
    assert.deepEqual(rec.para, ['rh.demo@example.com']);
    assert.deepEqual(rec.cc, ['supervisor@example.com']);
    B.q("UPDATE retardos.caso SET vence_at = now() - interval '1 hour'");
    B.j("SELECT retardos.verificar('{}'::jsonb)");
    const esc = B.j("SELECT jsonb_build_object('para', para, 'cc', cc) FROM retardos.envio WHERE tipo = 'escalamiento'");
    assert.deepEqual(esc.para, ['estebandelacruz@fts.mx']);
    assert.deepEqual(esc.cc, ['rh.demo@example.com']);
    assert.equal(B.q('SELECT count(*) FROM retardos.envio WHERE tipo IN (\'recordatorio\',\'escalamiento\') AND para::text LIKE \'%demo1%\''), '0', 'al trabajador no se le recuerda nada');
  } finally { B.fin(); }
});

conPg('alertas individuales: suspensión en dos meses, dos actas firmadas y reincidencia tras acta; nunca cambian el modo', () => {
  const B = base();
  try {
    config(B, 'contar_desde', '2000-01-01');
    const emps = [EMP(1), EMP(2), EMP(3), SUP];
    // 1: siete retardos en cada uno de los dos meses anteriores → nivel de suspensión dos veces
    diaPorDiaRango(B, tardes(1, habilesMes(-2, 7)), emps);
    diaPorDiaRango(B, tardes(1, habilesMes(-1, 7)), emps);
    // 2: cinco retardos en cada mes → acta dos veces, las dos firmadas
    diaPorDiaRango(B, tardes(2, habilesMes(-2, 5)), emps);
    diaPorDiaRango(B, tardes(2, habilesMes(-1, 5)), emps);
    B.q("UPDATE retardos.caso SET validado_at = now() - interval '10 days', estado = 'CERRADO' WHERE employee_id = 2 AND accion = 'acta'");
    // 3: acta firmada al final del mes -2 y un retardo en el mes -1
    diaPorDiaRango(B, tardes(3, habilesMes(-2, 5)), emps);
    B.q("UPDATE retardos.caso SET validado_at = (date_trunc('month', now()) - interval '1 month' - interval '1 day') + interval '18 hours', estado = 'CERRADO' WHERE employee_id = 3 AND accion = 'acta'");
    ingestarRango(B, tardes(3, habilesMes(-1, 1)), emps);
    assert.equal(B.q('SELECT count(*) FROM retardos.caso WHERE employee_id = 1 AND accion = \'suspension\' AND estado = \'RETENIDO\''), '2');
    const v = B.j("SELECT retardos.verificar('{}'::jsonb)");
    assert.equal(v.alertas_nuevas, 3);
    const al = B.j("SELECT jsonb_object_agg(disparador, employee_id) FROM retardos.alerta_modo");
    assert.deepEqual(al, { suspension_2_meses: 1, actas_firmadas: 2, reincide_tras_acta: 3 });
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'alerta_modo'"), '3');
    assert.match(B.q("SELECT cuerpo_html FROM retardos.envio WHERE tipo = 'alerta_modo' AND clave_dedupe LIKE 'alerta_modo:' || (SELECT id FROM retardos.alerta_modo WHERE disparador = 'suspension_2_meses') || ':%'"), /Hojas ligadas/);
    assert.equal(B.j("SELECT (retardos.verificar('{}'::jsonb))->'alertas_nuevas'"), 0, 'no se repite la misma alerta');
    assert.equal(B.q("SELECT valor #>> '{}' FROM retardos.config WHERE clave = 'modo_sanciones'"), 'sin_suspension');
    const sem = B.j('SELECT retardos.panel_reincidencia(' + lit({}) + ')');
    for (const id of [1, 2, 3]) assert.equal(sem.personas.find((x) => x.employee_id === id).semaforo, 'rojo');
    // Resumen semanal: repite las abiertas y trae la métrica del lector
    const rs = B.j('SELECT retardos.resumen_semanal()');
    assert.equal(rs.alertas_abiertas, 3);
    assert.match(B.q("SELECT cuerpo_html FROM retardos.envio WHERE tipo = 'resumen'"), /activar modo suspensión/);
    // Atender: posponer vuelve a salir; descartar y cambiar exigen motivo; cambiar NO cambia el modo
    const id1 = B.j("SELECT id FROM retardos.alerta_modo WHERE disparador = 'suspension_2_meses'");
    const id2 = B.j("SELECT id FROM retardos.alerta_modo WHERE disparador = 'actas_firmadas'");
    const id3 = B.j("SELECT id FROM retardos.alerta_modo WHERE disparador = 'reincide_tras_acta'");
    assert.equal(panelS(B, { accion: 'alerta_atender', alerta_id: id1, decision: 'posponer', semanas: 2, motivo: 'x' }).error, 'MOTIVO_OBLIGATORIO');
    assert.equal(panelS(B, { accion: 'alerta_atender', alerta_id: id1, decision: 'posponer', semanas: 2, motivo: 'Se habló con la persona' }).ok, true);
    B.q("UPDATE retardos.alerta_modo SET posponer_hasta = (now() AT TIME ZONE 'America/Monterrey')::date WHERE id = " + id1);
    const v2 = B.j("SELECT retardos.verificar('{}'::jsonb)");
    assert.equal(v2.alertas_reabiertas, 1);
    assert.equal(B.q('SELECT estado FROM retardos.alerta_modo WHERE id = ' + id1), 'abierta');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe LIKE 'alerta_modo:" + id1 + ":reabierta:%'"), '1');
    assert.equal(panelS(B, { accion: 'alerta_atender', alerta_id: id2, decision: 'descartar', motivo: 'Tenía permiso sin capturar' }).ok, true);
    const c = panelS(B, { accion: 'alerta_atender', alerta_id: id3, decision: 'cambiar', motivo: 'Reincidencia clara; revisar con Legal' });
    assert.equal(c.ok, true);
    assert.equal(c.modo_sanciones, 'sin_suspension', 'la decisión se registra; el modo no cambia');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento LIKE 'alerta_modo_%'"), '4');
  } finally { B.fin(); }
});

conPg('alertas globales: sin reducción contra la línea base de sombra y plantilla en acta, sólo después de 8 semanas en real', () => {
  const B = base();
  try {
    config(B, 'contar_desde', '2000-01-01');
    const emps = [1, 2, 3, 4, 5].map((i) => EMP(i)).concat([SUP]);
    ingestar(B, [], emps);
    // Línea base (sombra) y periodo real con casi los mismos retardos por semana.
    B.q(`INSERT INTO retardos.retardo (employee_id, fecha, attendance_id, hora_local, hora_esperada, tolerancia_min, minutos_tarde, estado, motivo, periodo)
         SELECT 1 + (g % 5), d::date, 900000 + g, 7.8, 7, 20, 48, CASE WHEN d::date < (now() AT TIME ZONE 'America/Monterrey')::date - 60 THEN 'excluido' ELSE 'contado' END,
                CASE WHEN d::date < (now() AT TIME ZONE 'America/Monterrey')::date - 60 THEN 'antes_de_contar_desde' END, to_char(d, 'YYYY-MM')
           FROM generate_series((now() AT TIME ZONE 'America/Monterrey')::date - 120, (now() AT TIME ZONE 'America/Monterrey')::date - 1, interval '1 day') WITH ORDINALITY AS t(d, g)
          WHERE extract(isodow FROM d) < 6 ON CONFLICT DO NOTHING`);
    assert.equal(B.j("SELECT (retardos.evaluar_alertas())->'alertas_nuevas'"), 0, 'sin real_desde no hay globales');
    config(B, 'real_desde', ymd(new Date(hoyMty().getTime() - 20 * 86400000)));
    assert.equal(B.j("SELECT (retardos.evaluar_alertas())->'alertas_nuevas'"), 0, 'antes de 8 semanas en real no se evalúa');
    config(B, 'real_desde', ymd(new Date(hoyMty().getTime() - 60 * 86400000)));
    diaPorDiaRango(B, tardes(1, habilesMes(0, 5)), emps);     // 1 de 5 en acta este mes = 20%
    B.j('SELECT retardos.evaluar_alertas()');
    const al = B.j("SELECT jsonb_agg(disparador ORDER BY disparador) FROM retardos.alerta_modo WHERE alcance = 'global'");
    assert.deepEqual(al, ['plantilla_en_acta', 'sin_reduccion']);
    const ev = B.j("SELECT evidencia FROM retardos.alerta_modo WHERE disparador = 'sin_reduccion'");
    assert.ok(Number(ev.reduccion_pct) < 30);
  } finally { B.fin(); }
});

conPg('cambio a con_suspension: no genera suspensiones retroactivas; sólo reincidencias nuevas', () => {
  const B = base();
  try {
    config(B, 'contar_desde', '2000-01-01');
    const emps = [EMP(1), EMP(2), SUP];
    diaPorDiaRango(B, tardes(1, habilesMes(-1, 7)), emps);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE employee_id = 1 AND accion = 'suspension'"), 'RETENIDO');
    // Se activa el modo (SQL de MODO_SUSPENSION.md): modo + fecha de activación.
    config(B, 'modo_sanciones', 'con_suspension');
    config(B, 'modo_suspension_desde', ymd(hoyMty()));
    const antes = B.q('SELECT count(*) FROM retardos.caso');
    ingestarRango(B, tardes(1, habilesMes(-1, 7)), emps);               // re-ingesta del mes viejo
    assert.equal(B.q('SELECT count(*) FROM retardos.caso'), antes, 'nada nuevo por retardos viejos');
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE employee_id = 1 AND accion = 'suspension'"), 'RETENIDO', 'el retenido no se convierte');
    // Retardos de antes y de después en el mismo mes: sólo cuentan los de después para la suspensión.
    const pasados = habilesMes(0, 23).filter((d) => d < ymd(hoyMty())).slice(-4);
    const futuros = habilesMes(1, 7);
    diaPorDiaRango(B, tardes(2, futuros), emps);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE employee_id = 2 AND accion = 'suspension'") !== 'RETENIDO', true, 'siete retardos nuevos sí llegan a suspensión');
    assert.ok(B.j("SELECT jsonb_agg(e.tipo) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.employee_id = 2 AND c.accion = 'suspension'").includes('notificacion'));
    if (pasados.length >= 4) {
      const e3 = [EMP(3), SUP];
      diaPorDiaRango(B, tardes(3, pasados.concat(habilesMes(0, 23).filter((d) => d > ymd(hoyMty())).slice(0, 3))), e3);
      const s3 = B.q("SELECT estado FROM retardos.caso WHERE employee_id = 3 AND accion = 'suspension'");
      if (s3) assert.equal(s3, 'RETENIDO', 'mezcla de retardos viejos y nuevos no alcanza el umbral con los nuevos');
    }
  } finally { B.fin(); }
});

// ── pruebas de JS puro (corren siempre) ────────────────────────────────────
test('cambio de campo en Odoo: el contrato truena con CONTRATO_ROTO en vez de seguir vacío', () => {
  const N = require('../../retardos/lib/normalizar.js');
  const att = [{ id: 1, employee_id: [5, 'Demo'], check_in: '2026-09-01 13:10:00', check_out: '2026-09-01 23:16:00', worked_hours: 10.1,
                  in_mode: 'kiosk', out_mode: 'manual', x_studio_horario_en_disputa: false, x_studio_incidencia_pendiente_id: false }];
  const emp = [{ id: 5, name: 'Demo', job_title: 'x', company_id: [1, 'FTS'], active: true, x_studio_hora_entrada: 7, work_email: 'd@example.com', private_email: 'D.Personal@Example.com', parent_id: false, department_id: false, resource_calendar_id: [2, 'Ops'] }];
  const L = (d, a, b, per) => ({ calendar_id: [2, 'Ops'], dayofweek: d, hour_from: a, hour_to: b, day_period: per || 'morning' });
  const cal = [L('0', 7, 12), L('0', 12, 12.5, 'lunch'), L('0', 12.5, 17.6, 'afternoon'), L('1', 7, 17.1), L('2', 7, 17.1), L('3', 7, 17.1), L('4', 7, 17.1)];
  const incid = { incidencias: [{ tipo: 'olvido_checkout', status: 'pendiente_supervisor', attendance_id: 1 }] };
  const ok = N.normalizar({ att, emp, cal, incidencias: incid, desde: '2026-09-01', hasta: '2026-09-01' });
  assert.equal(ok.checadas[0].check_in_utc, '2026-09-01T13:10:00Z');
  assert.equal(ok.checadas[0].check_out_utc, '2026-09-01T23:16:00Z');
  assert.equal(ok.checadas[0].worked_hours, 10.1);
  assert.equal(ok.checadas[0].out_mode, 'manual');
  assert.equal(ok.checadas[0].incidencia_abierta, true);
  assert.deepEqual(ok.empleados[0].calendario, { id: 2, nombre: 'Ops', horas_semana: 50.5, dias: [1, 2, 3, 4, 5], tiene_comida: true });
  const sinSalida = [Object.assign({}, att[0])]; delete sinSalida[0].check_out;
  assert.throws(() => N.normalizar({ att: sinSalida, emp, cal }), /CONTRATO_ROTO:hr[.]attendance[.]check_out/);
  const abierta = [Object.assign({}, att[0], { check_out: false, worked_hours: 0 })];
  assert.equal(N.normalizar({ att: abierta, emp, cal }).checadas[0].check_out_utc, null);
  assert.equal(ok.empleados[0].hora_calendario, 7);
  assert.deepEqual(ok.empleados[0].correos, [{ campo: 'work_email', email: 'd@example.com' }, { campo: 'private_email', email: 'd.personal@example.com' }]);
  const sinPersonal = [Object.assign({}, emp[0])]; delete sinPersonal[0].private_email;
  assert.throws(() => N.normalizar({ att, emp: sinPersonal, cal: [] }), /CONTRATO_ROTO:hr[.]employee[.]private_email/);
  const sinCampo = [Object.assign({}, emp[0])]; delete sinCampo[0].x_studio_hora_entrada;
  assert.throws(() => N.normalizar({ att, emp: sinCampo, cal: [] }), /CONTRATO_ROTO:hr[.]employee[.]x_studio_hora_entrada/);
  const tipo = [Object.assign({}, emp[0], { x_studio_hora_entrada: '7:00' })];
  assert.throws(() => N.normalizar({ att, emp: tipo, cal: [] }), /CONTRATO_ROTO/);
  const fecha = [Object.assign({}, att[0], { check_in: false })];
  assert.throws(() => N.normalizar({ att: fecha, emp, cal: [] }), /CONTRATO_ROTO:hr[.]attendance[.]check_in/);
});

test('sesión del panel: JWT + HMAC con el token como llave + ventana de 5 min', () => {
  const S = require('../../retardos/lib/sesion.js');
  const secreto = 'x'.repeat(40);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const mk = (scopes, exp) => { const pl = b64({ sub: 'rh-demo', scopes, exp }); return h + '.' + pl + '.' + S._b64url(S._hmac(secreto, h + '.' + pl)); };
  const ahora = Date.UTC(2026, 8, 28, 12, 0, 0);
  const tok = mk(['retardos:read', 'retardos:write'], ahora / 1000 + 3600);
  const datos = { accion: 'validar_firma', folio: 'RET-2026-0001' };
  const nonce = 'abcdefghijklmnop1234';
  const body = { token: tok, ts: ahora, nonce, datos, sig: S.firmar(tok, ahora, nonce, datos) };
  assert.equal(S.puerta(body, secreto, ahora).ok, true);
  assert.equal(S.puerta(body, secreto, ahora).rol, 'editor');
  assert.equal(S.puerta(body, secreto, ahora + 6 * 60 * 1000).error, 'FUERA_DE_VENTANA');
  assert.equal(S.puerta(Object.assign({}, body, { datos: { accion: 'cancelar', folio: 'RET-2026-0001' } }), secreto, ahora).error, 'HMAC_INVALIDO');
  const lector = mk(['retardos:read'], ahora / 1000 + 3600);
  assert.equal(S.puerta({ token: lector, ts: ahora, nonce, datos, sig: S.firmar(lector, ahora, nonce, datos) }, secreto, ahora).error, 'SCOPE_INSUFICIENTE');
  assert.equal(S.puerta(body, 'corto', ahora).error, 'SECRETO_NO_CONFIGURADO');
});

test('PDF: se genera, es PDF, trae el folio y no lleva guiones largos', () => {
  const P = require('../../retardos/lib/pdf.js');
  const r = P.hoja({ folio: 'RET-2026-0007', accion: 'acta', nombre: 'Demo Ñ', periodo: '2026-09', retardos_n: 5,
    retardos: [{ fecha: '01/09/2026', llegada: '07:45', esperada: '07:00', minutos: 45 }], motivo_apertura: 'umbral' });
  const bin = Buffer.from(r.base64, 'base64').toString('latin1');
  assert.match(bin, /^%PDF-1[.]4/);
  assert.match(bin, /RET-2026-0007/);
  assert.ok(bin.indexOf(String.fromCharCode(8212)) < 0);
  assert.match(bin, /%%EOF/);
  for (const a of ['aviso', 'carta_compromiso', 'acta', 'suspension']) assert.ok(P.hoja({ accion: a, folio: 'RET-2026-0001' }).bytes > 800);
  // Tercer aviso de jornada: folio JOR, QR y la tabla por día.
  const j = P.hoja({ folio: 'JOR-2026-0003', accion: 'aviso_jornada_3', nombre: 'Demo', nivel: 3, periodo: 'S38/2026',
    jornada: { semana: 'S38/2026', desde: '11/09/2026', hasta: '17/09/2026', horas_efectivas: '41:30', umbral: '48:00', faltante: '6:30', aviso_n: 3,
      dias: [{ dia: 'viernes', fecha: '11/09/2026', brutas: '10:06', comida: '0:30', efectivas: '9:36' }] } });
  const jb = Buffer.from(j.base64, 'base64').toString('latin1');
  assert.match(jb, /JOR-2026-0003/);
  assert.match(jb, /TERCER AVISO DE JORNADA/);
  assert.equal(P.textoQR('JOR-2026-0003', 3, 1, 1), 'FTS|JOR-2026-0003|N3|P1/1');
});

test('ningún fuente que se embebe en n8n lleva diagonales invertidas', () => {
  for (const f of ['pdf.js', 'normalizar.js', 'sesion.js']) {
    const s = fs.readFileSync(path.join(RAIZ, 'retardos', 'lib', f), 'utf8');
    assert.equal(s.indexOf(String.fromCharCode(92)), -1, f + ' trae una diagonal invertida');
  }
});

test('las migraciones sobreviven el camino de n8n: sin llaves dobles ni patrones de reemplazo de JS', () => {
  // El nodo Postgres evalúa llaves dobles y mete el .sql con String.replace:
  // un dólar seguido de comilla, &, acento grave, dígito u otro dólar muta el SQL.
  for (const f of fs.readdirSync(MIG).filter((x) => x.endsWith('.sql'))) {
    const s = fs.readFileSync(path.join(MIG, f), 'utf8');
    assert.equal(s.indexOf('{' + '{'), -1, f + ' trae llaves dobles');
    assert.equal(/[$]['&`0-9$]/.test(s), false, f + ' trae un patrón de reemplazo de JS');
  }
});

conPg('buzón receptor vacío: el reply-to cae al remitente, nunca al texto null', () => {
  const B = base();
  try {
    ingestar(B, tres(1));
    const e = B.j('SELECT retardos.por_enviar(10)')[0];
    assert.equal(e.responder_a, 'sales@fts.mx');
  } finally { B.fin(); }
});

// ── Jornada semanal FTS (#334, reglas R3) ───────────────────────────────────
// Asistencia con salida. hSal = 'HH:MM' del mismo día o '+1 HH:MM' del día siguiente (hora del centro).
function asis(emp, fecha, hEnt, hSal, extra) {
  const c = chec(emp, fecha, hEnt);
  const sig = hSal.startsWith('+');
  const dd = sig ? Number(hSal.split(' ')[0].slice(1)) : 0;
  const [h, m] = (sig ? hSal.split(' ')[1] : hSal).split(':').map(Number);
  const co = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + dd, h + 6, m));
  return Object.assign(c, { check_out_utc: co.toISOString(), worked_hours: (co - new Date(c.check_in_utc)) / 3600000,
                            in_mode: 'kiosk', out_mode: 'kiosk' }, extra || {});
}
// Días laborables de una semana FTS (viernes + lunes a jueves).
function laborables(vie) {
  const d0 = new Date(vie + 'T00:00:00Z'); const out = [];
  for (const k of [0, 3, 4, 5, 6]) { const d = new Date(d0.getTime() + k * 86400000); out.push(d.toISOString().slice(0, 10)); }
  return out;
}
function semana(emp, vie, horas) {   // horas: 5 duraciones 'HH:MM' desde las 07:00
  return laborables(vie).map((f, i) => {
    const [h, m] = horas[i].split(':').map(Number); const t = 7 * 60 + h * 60 + m;
    return asis(emp, f, '07:00', String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  });
}
function cargar(B, checadas, empleados) {
  const fs = checadas.map((c) => c.check_in_utc.slice(0, 10)).sort();
  return ingestar(B, checadas, empleados || [EMP(1), SUP], { desde: fs[0], hasta: fs[fs.length - 1] });
}
const corte = (B, vie, extra) => B.j('SELECT retardos.jornada_corte(' + lit(Object.assign({ desde: vie }, extra || {})) + ')');
const js = (B, emp, sem) => B.j("SELECT to_jsonb(j) FROM retardos.jornada_semana j WHERE employee_id = " + emp + " AND semana = '" + sem + "'");
const H10 = ['10:06', '10:06', '10:06', '10:06', '10:06'];

conPg('semana FTS: misma numeración que Nómina (ancla jue 23-jul-2026 = S30) y viernes a jueves', () => {
  const B = base();
  try {
    assert.equal(B.q("SELECT retardos.semana_id('2026-08-28') || ' ' || retardos.semana_de_id('S37/2026') || ' ' || retardos.semana_desde('2026-09-10') || ' ' || retardos.semana_desde('2026-09-11')"),
      'S36/2026 2026-09-04 2026-09-04 2026-09-11');
    // Semana todavía abierta: el corte no corre.
    assert.throws(() => B.q("SELECT retardos.jornada_corte(jsonb_build_object('desde', retardos.hoy_local()))"), /SEMANA_ABIERTA/);
  } finally { B.fin(); }
});

conPg('jornada: 5 días de 10.1 h brutas = 48.0 efectivas cumple; 47:59 incumple', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    cargar(B, semana(1, '2026-08-28', H10).concat(semana(2, '2026-08-28', ['10:06', '10:06', '10:06', '10:06', '10:05'])), [EMP(1), EMP(2), SUP]);
    const r = corte(B, '2026-08-28');
    const a = js(B, 1, 'S36/2026'), b = js(B, 2, 'S36/2026');
    assert.equal(a.estado, 'cumple'); assert.equal(Number(a.horas_brutas), 50.5); assert.equal(Number(a.comida_h), 2.5); assert.equal(Number(a.horas_efectivas), 48);
    assert.equal(b.estado, 'incumple'); assert.equal(Number(b.horas_efectivas), 47.98); assert.equal(Number(b.faltante), 0.02);
    assert.equal(r.casos_nuevos.length, 1);
    assert.match(r.casos_nuevos[0], /^JOR-2026-[0-9]{4}$/);
    // desglose por día: comida de 30 min por día laborado
    const d = a.desglose.filter((x) => x.brutas > 0);
    assert.equal(d.length, 5); assert.ok(d.every((x) => x.comida === 0.5 && x.efectivas === 9.6));
  } finally { B.fin(); }
});

conPg('jornada: asistencia que cruza de jueves a viernes se parte en el corte', () => {
  const B = base();
  try {
    cargar(B, [asis(1, '2026-09-03', '22:00', '+1 06:00')]);
    corte(B, '2026-08-28'); corte(B, '2026-09-04');
    const a = js(B, 1, 'S36/2026'), b = js(B, 1, 'S37/2026');
    assert.equal(Number(a.horas_brutas), 2);
    assert.equal(Number(b.horas_brutas), 6);
    assert.equal(a.desglose.find((x) => x.fecha === '2026-09-03').brutas, 2);
    assert.equal(b.desglose.find((x) => x.fecha === '2026-09-04').brutas, 6);
  } finally { B.fin(); }
});

conPg('jornada: comida en día corto, sábado con cada opción y calendario que ya descuenta', () => {
  const B = base();
  try {
    // Lunes 31-ago: una sola checada de 20 min → la comida no puede dejar horas negativas.
    // Sábado 29-ago: 3 h. Domingo 30-ago: 7 h. Martes 1-sep: Odoo ya descontó 1 h (worked_hours = duración - 1).
    // Miércoles 2-sep: Odoo descontó 15 min → sólo se descuentan los 15 que faltan.
    const ch = [asis(1, '2026-08-31', '07:00', '07:20'), asis(1, '2026-08-29', '08:00', '11:00'), asis(1, '2026-08-30', '08:00', '15:00'),
                asis(1, '2026-09-01', '07:00', '17:00', { worked_hours: 9 }), asis(1, '2026-09-02', '07:00', '17:00', { worked_hours: 9.75 })];
    cargar(B, ch);
    const dia = (f) => js(B, 1, 'S36/2026').desglose.find((x) => x.fecha === f);
    config(B, 'jornada_comida_fin_de_semana', 'desde_horas');
    corte(B, '2026-08-28');
    assert.deepEqual([dia('2026-08-31').brutas, dia('2026-08-31').comida, dia('2026-08-31').efectivas], [0.33, 0.33, 0]);
    assert.deepEqual([dia('2026-08-29').comida, dia('2026-08-29').efectivas], [0, 3], 'sábado de 3 h: menos de 6 h, sin comida');
    assert.deepEqual([dia('2026-08-30').comida, dia('2026-08-30').efectivas], [0.5, 6.5], 'domingo de 7 h: sí');
    assert.deepEqual([dia('2026-09-01').comida, dia('2026-09-01').efectivas], [1, 9], 'Odoo ya descontó 1 h: no se duplica');
    assert.deepEqual([dia('2026-09-02').comida, dia('2026-09-02').efectivas], [0.5, 9.5], 'Odoo descontó 15 min: se completan los 30');
    B.q("DELETE FROM retardos.jornada_semana");
    config(B, 'jornada_comida_fin_de_semana', 'siempre'); corte(B, '2026-08-28');
    assert.equal(dia('2026-08-29').comida, 0.5);
    B.q("DELETE FROM retardos.jornada_semana");
    config(B, 'jornada_comida_fin_de_semana', 'nunca'); corte(B, '2026-08-28');
    assert.equal(dia('2026-08-30').comida, 0);
    // Sábado y domingo: suman horas pero nunca son retardo.
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE fecha IN ('2026-08-29','2026-08-30')"), '0');
  } finally { B.fin(); }
});

conPg('jornada: prorrateo por festivo en lunes, permiso (exclusión) e incapacidad (Nómina)', () => {
  const B = base();
  try {
    B.q("INSERT INTO retardos.festivo (fecha, nombre) VALUES ('2026-09-07', 'Festivo demo') ON CONFLICT DO NOTHING");
    const cuatro = laborables('2026-09-04').filter((f) => f !== '2026-09-07').map((f) => asis(1, f, '07:00', '17:06'));
    B.q("INSERT INTO retardos.exclusion (employee_id, desde, hasta, tipo, motivo, creado_por) VALUES (2, '2026-09-08', '2026-09-08', 'permiso', 'Permiso demo', 'prueba')");
    const tres2 = ['2026-09-04', '2026-09-09', '2026-09-10'].map((f) => asis(2, f, '07:00', '17:06'));
    cargar(B, cuatro.concat(tres2), [EMP(1), EMP(2), SUP]);
    corte(B, '2026-09-04', { nomina: [{ employee_id: 2, semana: 'S37/2026', declaraciones: [{ tipo: 'incapacidad', valores: { dias: 1 } }, { tipo: 'descuento_prestamo', valores: { monto: 500 } }] }] });
    const a = js(B, 1, 'S37/2026'), b = js(B, 2, 'S37/2026');
    assert.deepEqual([a.estado, Number(a.dias_prorrateo), Number(a.umbral), Number(a.horas_efectivas)], ['cumple', 1, 38.4, 38.4]);
    assert.equal(a.desglose.find((x) => x.fecha === '2026-09-07').prorrateo, 'festivo');
    // El festivo es de todos: a la persona 2 se le prorratean festivo (lunes) + permiso (martes) + incapacidad declarada en Nómina.
    assert.deepEqual([b.estado, Number(b.dias_prorrateo), Number(b.umbral)], ['cumple', 3, 19.2]);
    assert.deepEqual(b.prorrateo.dias_con_fecha + '|' + b.prorrateo.dias_nomina, '2|1');
  } finally { B.fin(); }
});

conPg('jornada: jornada contratada distinta de 48 (calendario) y calendario de 50 h de presencia (se queda en 48)', () => {
  const B = base();
  try {
    const cal40 = { id: 40, nombre: 'Cuarenta demo', horas_semana: 40, dias: [1, 2, 3, 4, 5], tiene_comida: true };
    const cal50 = { id: 2, nombre: 'Operaciones demo', horas_semana: 50, dias: [1, 2, 3, 4, 5], tiene_comida: false };
    cargar(B, semana(1, '2026-08-28', ['08:30', '08:30', '08:30', '08:30', '08:30']).concat(semana(2, '2026-08-28', H10)),
      [EMP(1, { calendario: cal40 }), EMP(2, { calendario: cal50 }), SUP]);
    corte(B, '2026-08-28');
    const a = js(B, 1, 'S36/2026'), b = js(B, 2, 'S36/2026');
    assert.deepEqual([a.umbral_fuente, Number(a.umbral), a.estado], ['calendario', 40, 'cumple']);
    assert.deepEqual([b.umbral_fuente, Number(b.umbral), b.estado], ['fts', 48, 'cumple']);
    const cal = B.j("SELECT jsonb_object_agg(employee_id, banderas) FROM retardos.v_calidad WHERE employee_id IN (1, 2)");
    assert.equal(cal['1'].jornada_usa_calendario, true);
    assert.equal(cal['2'].jornada_calendario_distinta, true);
    assert.equal(cal['2'].jornada_usa_calendario, undefined);
  } finally { B.fin(); }
});

conPg('jornada: checada sin salida va a Jornada por revisar, no a aviso; RH corrige y ahí sí abre caso', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    const ch = semana(1, '2026-08-28', H10); ch[1].check_out_utc = null; ch[1].worked_hours = 0;
    cargar(B, ch);
    const r = corte(B, '2026-08-28');
    const a = js(B, 1, 'S36/2026');
    assert.equal(a.estado, 'revisar');
    assert.deepEqual(a.motivos_revision[0].motivos, ['sin_salida']);
    assert.equal(r.casos_nuevos.length, 0);
    assert.ok(B.q("SELECT count(*) FROM retardos.envio WHERE clave_dedupe = 'jornada_revisar:S36/2026'") === '1');
    // Un nuevo corte no la cambia sola; RH decide.
    const rv = panelS(B, { accion: 'jornada_revisar', employee_id: 1, semana: 'S36/2026', decision: 'corregir', horas_efectivas: 44, motivo: 'Salida real 13:00 según el supervisor' });
    assert.equal(rv.ok, true); assert.equal(rv.estado, 'incumple'); assert.match(rv.folio, /^JOR-/);
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'jornada_revisada'"), '1');
    corte(B, '2026-08-28');
    assert.equal(B.q("SELECT estado || '|' || horas_corregidas FROM retardos.jornada_semana WHERE employee_id = 1"), 'incumple|44.00');
    // Asistencia de más de 16 h (olvido de salida): también a revisión.
    B.q('DELETE FROM retardos.jornada_semana');
    cargar(B, [asis(2, '2026-09-04', '07:00', '+1 09:00')], [EMP(2), SUP]);
    corte(B, '2026-09-04');
    assert.deepEqual(js(B, 2, 'S37/2026').motivos_revision[0].motivos, ['asistencia_mas_de_max']);
  } finally { B.fin(); }
});

conPg('jornada: escalera 1.º, 2.º y 3.º aviso dentro de la ventana; medida retenida; re-corte sin duplicados', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    const corta = ['10:06', '10:06', '10:06', '10:06', '06:00'];
    for (const vie of ['2026-08-21', '2026-08-28', '2026-09-04']) { cargar(B, semana(1, vie, corta)); corte(B, vie); }
    const casos = B.j("SELECT jsonb_agg(jsonb_build_object('n', nivel, 'a', accion, 'p', periodo, 'f', requiere_firma) ORDER BY nivel) FROM retardos.caso WHERE tipo = 'jornada'");
    assert.deepEqual(casos.map((c) => c.n + ':' + c.p), ['1:S35/2026', '2:S36/2026', '3:S37/2026']);
    assert.deepEqual(casos.map((c) => c.f), [false, false, true]);
    // 1.º aviso: a la persona con copia a RH y al jefe.
    const e1 = B.j("SELECT to_jsonb(e) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.nivel = 1 AND c.tipo = 'jornada'");
    assert.deepEqual(e1.para, ['demo1@example.com']);
    assert.ok(e1.cc.includes('supervisor@example.com'));
    assert.match(e1.cuerpo_html, /viernes 21[/]08[/]2026 al jueves 27[/]08[/]2026/);
    assert.match(e1.cuerpo_html, /hora del centro, CST/);
    assert.match(e1.cuerpo_html, /Faltante: <b>4:06<[/]b>/);
    assert.match(e1.cuerpo_html, /aviso número <b>1<[/]b>/);
    // 3.º: hoja con QR a RH, aviso a la persona con la misma hoja y una propuesta de medida.
    const t3 = B.j("SELECT jsonb_agg(e.tipo || ':' || coalesce(e.pdf, '-') ORDER BY e.id) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.nivel = 3 AND c.tipo = 'jornada'");
    assert.deepEqual(t3, ['notificacion:aviso_jornada_3', 'aviso_trabajador:aviso_jornada_3']);
    assert.equal(B.q("SELECT estado || '|' || horas_propuestas FROM retardos.medida"), 'propuesta|4.10');
    // Re-corte de las tres semanas: nada nuevo.
    const antes = B.q('SELECT count(*) FROM retardos.caso') + '|' + B.q('SELECT count(*) FROM retardos.envio');
    for (const vie of ['2026-08-21', '2026-08-28', '2026-09-04']) corte(B, vie);
    assert.equal(B.q('SELECT count(*) FROM retardos.caso') + '|' + B.q('SELECT count(*) FROM retardos.envio'), antes);
    // RH decide un descuento: queda RETENIDO (modo_medidas_jornada = retenidas).
    const md = B.q('SELECT id FROM retardos.medida');
    const d1 = panelS(B, { accion: 'medida_decidir', medida_id: Number(md), decision: 'descuento', horas: 4.1, motivo: 'Tiempo no laborado documentado' });
    assert.equal(d1.estado, 'retenida');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'medida_decidida'"), '1');
    // El PDF del 3er aviso lleva la tabla por día.
    const d3 = B.j("SELECT retardos.caso_datos(id) FROM retardos.caso WHERE tipo = 'jornada' AND nivel = 3");
    assert.equal(d3.jornada.dias.length, 7);
    assert.equal(d3.jornada.faltante, '4:06');
  } finally { B.fin(); }
});

conPg('jornada: fuera de la ventana el conteo vuelve a empezar', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    config(B, 'jornada_ventana_dias', 10);
    const corta = ['10:06', '10:06', '10:06', '10:06', '06:00'];
    for (const vie of ['2026-08-21', '2026-09-04']) { cargar(B, semana(1, vie, corta)); corte(B, vie); }
    assert.equal(B.q("SELECT string_agg(nivel::text, ',' ORDER BY periodo) FROM retardos.caso WHERE tipo = 'jornada'"), '1,1');
  } finally { B.fin(); }
});

conPg('jornada: 3er aviso firmado y confirmado por RH se cierra; con medidas habilitadas, el descuento se verifica contra Nómina', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    const corta = ['10:06', '10:06', '10:06', '10:06', '06:00'];
    for (const vie of ['2026-08-21', '2026-08-28', '2026-09-04']) { cargar(B, semana(1, vie, corta)); corte(B, vie); }
    enviarTodo(B);
    const folio = B.q("SELECT folio FROM retardos.caso WHERE tipo = 'jornada' AND nivel = 3");
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'ESPERANDO_FIRMA');
    const h = subir(B, b64Unico('jornada3'));
    const lec = leer(B, h.hoja_id, [pagina(folio, { qr_nivel: 3 })]);
    assert.equal(lec.lecturas[0].sugerencia, 'lista_para_validar');
    const v = panelS(B, { accion: 'hoja_confirmar', lectura_id: lec.lecturas[0].lectura_id, resultado: 'firmada' });
    assert.equal(v.ok, true);
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'CERRADO');
    // Medidas habilitadas (sólo en esta prueba: en producción nace 'retenidas').
    config(B, 'modo_medidas_jornada', 'habilitadas');
    const md = Number(B.q('SELECT id FROM retardos.medida'));
    assert.equal(panelS(B, { accion: 'medida_decidir', medida_id: md, decision: 'descuento', horas: 4.1, motivo: 'Tiempo no laborado documentado' }).estado, 'por_aplicar');
    let r = B.j("SELECT retardos.verificar('{}'::jsonb)");
    assert.equal(r.medidas_alertadas, 1);
    const sem = B.q('SELECT retardos.semana_id(retardos.semana_desde(retardos.hoy_local()))');
    r = B.j('SELECT retardos.verificar(' + lit({ nom_semana: [{ employee_id: 1, semana: sem, declaraciones: [{ tipo: 'tiempo_no_laborado', valores: { horas: 4.1 } }] }] }) + ')');
    assert.equal(r.medidas_verificadas, 1);
    assert.equal(B.q('SELECT estado FROM retardos.medida'), 'verificada');
  } finally { B.fin(); }
});

conPg('jornada: envío diferido al lunes y latido del corte del viernes', () => {
  const B = base();
  try {
    config(B, 'jornada_desde', '2026-01-01');
    config(B, 'jornada_envio', 'lunes');
    cargar(B, semana(1, '2026-08-28', ['10:06', '10:06', '10:06', '10:06', '06:00']));
    corte(B, '2026-08-28');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE no_antes_de IS NOT NULL AND extract(isodow FROM retardos.a_local(no_antes_de)) = 1"), '1');
    assert.equal(B.j('SELECT retardos.por_enviar(50)').filter((e) => /jornada semanal/.test(e.asunto)).length, 0);
    // Latido: viernes 25-sep 10:30 sin corte → falta; con corte de las 08:05 → no; jueves → no aplica.
    B.q("DELETE FROM retardos.jornada_semana"); B.q("DELETE FROM retardos.corrida WHERE workflow = 'retardos/jornada'");
    assert.equal(B.q("SELECT retardos.falta_corte_jornada('2026-09-25 10:30')"), 't');
    assert.equal(B.q("SELECT retardos.falta_corte_jornada('2026-09-25 09:30')"), 'f');
    B.q("INSERT INTO retardos.corrida (workflow, iniciada_at, terminada_at, ok) VALUES ('retardos/jornada', '2026-09-25 14:05Z', '2026-09-25 14:06Z', true)");
    assert.equal(B.q("SELECT retardos.falta_corte_jornada('2026-09-25 10:30')"), 'f');
    assert.equal(B.q("SELECT retardos.falta_corte_jornada('2026-09-24 18:00')"), 'f');
  } finally { B.fin(); }
});

conPg('plantillas: aviso de retardo con tolerancia, conteo y umbral de carta; todas pendientes de validación de RH', () => {
  const B = base();
  try {
    config(B, 'contar_desde', '2000-01-01');
    ingestar(B, [chec(1, '2026-09-01', '07:15:01')]);
    const e = B.j("SELECT to_jsonb(e) FROM retardos.envio e WHERE tipo = 'notificacion'");
    assert.match(e.cuerpo_html, /07:15:01/);
    assert.match(e.cuerpo_html, /<b>15 minutos<[/]b>/);
    assert.match(e.cuerpo_html, /A partir de <b>3 retardos<[/]b>/);
    assert.match(e.cuerpo_html, /hora del centro, CST/);
    assert.equal(B.q("SELECT count(*) FROM retardos.plantilla WHERE estado_texto <> 'pendiente_validacion_rh'"), '0');
    const c = B.j("SELECT retardos.comunicado_arranque('{}'::jsonb)");
    assert.equal(c.encolado, null, 'sin lista de distribución no se encola');
    assert.match(c.html, /15 minutos/); assert.match(c.html, /48 horas efectivas/);
    for (const t of B.j("SELECT jsonb_agg(asunto || cuerpo_html) FROM retardos.plantilla")) assert.equal(t.indexOf(String.fromCharCode(8212)), -1);
  } finally { B.fin(); }
});

conPg('calendario que el lector no alcanzó (campos null): la ingesta no truena y la persona queda sin calendario', () => {
  const B = base();
  try {
    const r = ingestar(B, tres(1), [EMP(1, { calendario: { id: 9, nombre: 'Otro', horas_semana: null, dias: null, tiene_comida: null } }), SUP]);
    assert.ok(r.corrida_id);
    assert.equal(B.q("SELECT calendario_id || '|' || coalesce(cal_horas_semana::text, 'null') || '|' || coalesce(cal_dias::text, 'null') FROM retardos.empleado WHERE employee_id = 1"), '9|null|null');
  } finally { B.fin(); }
});

// ════════════════════════════════════════════════════════════════════════════
// #386 · Modo piloto, go-live con una bandera, destinatarios y PPA aparte
// ════════════════════════════════════════════════════════════════════════════
const uno = (emp, fecha, hhmm) => [chec(emp, fecha || '2026-09-01', hhmm || '07:45')];
function correosAviso(B) {
  config(B, 'aviso_cc_rh', ['rh1@example.com', 'rh2@example.com']);
  config(B, 'aviso_cc_sin_jefe', ['direccion@example.com']);
}
const envioDe = (B, tipo) => B.j("SELECT row_to_json(e) FROM retardos.envio e WHERE tipo = '" + tipo + "' ORDER BY id DESC LIMIT 1");

conPg('#386 go-live con una bandera: el trigger fija real_inicio; lo de sombra sigue en sombra; la pista real cuenta desde la activación', () => {
  const B = base();
  try {
    correosAviso(B);
    config(B, 'sombra_destinatarios', ['sombra@example.com']);
    ingestar(B, tres(1));
    assert.equal(B.q("SELECT string_agg(pista || ':' || accion, ',') FROM retardos.caso"), 'sombra:carta_compromiso');
    // La bandera.
    config(B, 'modo', 'real');
    assert.notEqual(B.q("SELECT retardos.cfg_txt('real_inicio')"), '');
    assert.equal(B.q("SELECT retardos.cfg_txt('real_desde') = retardos.hoy_local()::text"), 't');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'paso_a_real'"), '1');
    // Lo pendiente del caso de sombra sale como sombra.
    assert.ok(B.j('SELECT retardos.por_enviar(20)').every((x) => x.modo === 'sombra'));
    // Pista real desde el 2-sep: sólo cuentan los retardos del 2 y 3 de sep → aviso (nivel 1), no carta.
    config(B, 'real_inicio', '2026-09-02T00:00:00-06:00');
    const r = ingestar(B, tres(1));
    assert.equal(r.casos_pista_real.length, 1);
    const c = B.j("SELECT row_to_json(k) FROM retardos.caso k WHERE pista = 'real'");
    assert.equal(c.accion, 'aviso'); assert.equal(c.retardos_n, 2); assert.equal(c.modo_al_abrir, 'real');
    assert.equal(B.q("SELECT count(*) FROM retardos.caso_retardo WHERE caso_id = " + c.id), '2');
    // Otra corrida no duplica.
    assert.equal(ingestar(B, tres(1)).casos_pista_real.length, 0);
    const real = B.j('SELECT retardos.por_enviar(20)').find((x) => x.tipo === 'notificacion' && x.modo === 'real');
    assert.deepEqual(real.para, ['demo1@example.com']);
    assert.deepEqual(real.cc, ['rh1@example.com', 'rh2@example.com', 'supervisor@example.com']);
    assert.doesNotMatch(real.asunto, /SOMBRA/);
    // Reversa: una línea. El mismo envío vuelve a salir como sombra.
    config(B, 'modo', 'sombra');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'regreso_a_sombra'"), '1');
    const otra = B.j('SELECT retardos.por_enviar(20)').find((x) => x.id === real.id);
    assert.equal(otra.modo, 'sombra'); assert.deepEqual(otra.para, ['sombra@example.com']);
  } finally { B.fin(); }
});

conPg('#386 piloto: arranca con la marca del merge, sólo para la lista; el interruptor lo apaga', () => {
  const B = base();
  try {
    correosAviso(B);
    config(B, 'sombra_destinatarios', ['sombra@example.com']);
    config(B, 'piloto_employee_ids', [1]);
    B.j('SELECT retardos.por_enviar(5, ' + lit({ piloto_marca: false }) + ')');
    assert.equal(B.q("SELECT retardos.cfg('piloto_inicio')::text"), 'null');
    B.j('SELECT retardos.por_enviar(5, ' + lit({ piloto_marca: true }) + ')');
    assert.notEqual(B.q("SELECT retardos.cfg('piloto_inicio')::text"), 'null');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora WHERE evento = 'piloto_activado'"), '1');
    const fijo = B.q("SELECT retardos.cfg_txt('piloto_inicio')");
    B.j('SELECT retardos.por_enviar(5, ' + lit({ piloto_marca: true }) + ')');
    assert.equal(B.q("SELECT retardos.cfg_txt('piloto_inicio')"), fijo, 'queda fijado: no se mueve');
    config(B, 'piloto_inicio', '2026-08-31T00:00:00-06:00');
    ingestar(B, [...tres(1), ...tres(2)], [EMP(1), EMP(2), SUP]);
    assert.equal(B.q("SELECT string_agg(employee_id || ':' || pista || ':' || modo_al_abrir, ',' ORDER BY employee_id) FROM retardos.caso"),
      '1:real:piloto,2:sombra:sombra');
    let lista = B.j('SELECT retardos.por_enviar(20)');
    const de = (emp) => lista.filter((x) => x.caso && x.caso.employee_id === emp);
    assert.ok(de(1).length > 0 && de(1).every((x) => x.modo === 'real'));
    assert.ok(de(2).length > 0 && de(2).every((x) => x.modo === 'sombra'));
    assert.equal(B.q("SELECT retardos.cfg_txt('modo')"), 'sombra', 'el piloto no toca el modo global');
    config(B, 'piloto_habilitado', false);
    lista = B.j('SELECT retardos.por_enviar(20)');
    assert.ok(de(1).every((x) => x.modo === 'sombra'));
  } finally { B.fin(); }
});

conPg('#386 destinatarios: CC RH + jefe; sin jefe CC dirección con leyenda y marca; jefe sin correo; dirección; sin repetidos', () => {
  const B = base();
  try {
    correosAviso(B);
    const emps = [EMP(1), EMP(2, { parent_id: null }), EMP(3, { parent_id: 901 }), EMP(4, { parent_id: 4 }),
                  EMP(5, { email: 'rh1@example.com' }), SUP, EMP(901, { email: null, parent_id: null, hora_entrada: 8 })];
    ingestar(B, [1, 2, 3, 4, 5].flatMap((e) => uno(e)), emps);
    const env = (emp) => B.j("SELECT row_to_json(x) FROM (SELECT e.para, e.cc, e.cuerpo_html, k.jefe_estado FROM retardos.envio e JOIN retardos.caso k ON k.id = e.caso_id WHERE k.employee_id = " + emp + ") x");
    let e = env(1);
    assert.deepEqual(e.para, ['demo1@example.com']); assert.deepEqual(e.cc, ['rh1@example.com', 'rh2@example.com', 'supervisor@example.com']);
    assert.equal(e.jefe_estado, 'ok'); assert.doesNotMatch(e.cuerpo_html, /Falta asignarle jefe/);
    e = env(2);
    assert.deepEqual(e.para, ['demo2@example.com']); assert.deepEqual(e.cc, ['rh1@example.com', 'rh2@example.com', 'direccion@example.com']);
    assert.equal(e.jefe_estado, 'sin_jefe');
    assert.ok(e.cuerpo_html.indexOf('Falta asignarle jefe en Odoo') >= 0 && e.cuerpo_html.indexOf('Falta asignarle jefe en Odoo') < 300, 'leyenda arriba');
    assert.equal(B.q("SELECT count(*) FROM retardos.bitacora b JOIN retardos.caso k ON k.id = b.caso_id WHERE b.evento = 'sin_jefe' AND k.employee_id = 2"), '1');
    e = env(3);
    assert.equal(e.jefe_estado, 'jefe_sin_correo'); assert.deepEqual(e.cc, ['rh1@example.com', 'rh2@example.com', 'direccion@example.com']);
    assert.match(e.cuerpo_html, /no tiene un correo utilizable/);
    e = env(4);
    assert.equal(e.jefe_estado, 'direccion'); assert.deepEqual(e.cc, ['rh1@example.com', 'rh2@example.com']);
    assert.doesNotMatch(e.cuerpo_html, /Falta asignarle/);
    e = env(5);
    assert.deepEqual(e.para, ['rh1@example.com']); assert.deepEqual(e.cc, ['rh2@example.com', 'supervisor@example.com'], 'quien va en Para no se repite en CC');
    // El panel marca el caso sin jefe.
    const lista = panelS(B, { accion: 'listar' });
    assert.equal(lista.casos.find((c) => c.employee_id === 2).jefe_estado, 'sin_jefe');
    assert.equal(lista.casos.find((c) => c.employee_id === 1).pista, 'sombra');
    assert.ok(lista.piloto && Array.isArray(lista.piloto.empleados));
    // Carta compromiso: la copia a la persona también lleva CC a RH y jefe (antes iba sin CC).
    ingestar(B, tres(6), [EMP(6), SUP]);
    const t = envioDe(B, 'aviso_trabajador');
    assert.deepEqual(t.para, ['demo6@example.com']); assert.deepEqual(t.cc, ['rh1@example.com', 'rh2@example.com', 'supervisor@example.com']);
  } finally { B.fin(); }
});

conPg('#386 sin aviso_cc_rh configurado: la copia cae a RH (respaldo), nunca sin copia', () => {
  const B = base();
  try {
    config(B, 'rh_destinatarios', ['rhrespaldo@example.com']);
    ingestar(B, uno(1));
    assert.deepEqual(envioDe(B, 'notificacion').cc, ['rhrespaldo@example.com', 'supervisor@example.com']);
  } finally { B.fin(); }
});

conPg('#386 PPA aparte: 10 min tarde no es retardo; mover ppa_minutos no cambia el conteo; el aviso separa las dos reglas', () => {
  const B = base();
  try {
    config(B, 'ppa_minutos', 12);
    const r = ingestar(B, [chec(1, '2026-09-01', '07:10'), chec(1, '2026-09-02', '07:15:00'), chec(1, '2026-09-03', '07:15:01')]);
    assert.equal(r.contados, 1, 'sólo 07:15:01 es retardo; 07:10 y 07:15:00 no, aunque pierdan PPA');
    const h = envioDe(B, 'notificacion').cuerpo_html;
    const iRet = h.indexOf('<b>Retardo.</b>'), iPpa = h.indexOf('Premio de puntualidad (PPA)');
    assert.ok(iRet > 0 && iPpa > iRet, 'dos párrafos, retardo primero');
    assert.match(h, /<b>15 minutos<\/b> de tolerancia/);
    assert.match(h, /a más tardar <b>12 minutos<\/b>/);
    assert.match(h, /lo revisa Nómina/);
    assert.equal(B.q("SELECT estado_texto FROM retardos.plantilla WHERE clave = 'notificacion_aviso'"), 'pendiente_validacion_rh');
  } finally { B.fin(); }
});

conPg('#386 jornada: la semana es real sólo si empieza después de la activación', () => {
  const B = base();
  try {
    config(B, 'modo', 'real');
    config(B, 'real_inicio', '2026-10-05T12:00:00Z');
    assert.equal(B.q("SELECT retardos.pista_semana(1, '2026-10-02')"), 'sombra');
    assert.equal(B.q("SELECT retardos.pista_semana(1, '2026-10-09')"), 'real');
    config(B, 'modo', 'sombra');
    assert.equal(B.q("SELECT retardos.pista_semana(1, '2026-10-09')"), 'sombra');
  } finally { B.fin(); }
});

conPg('#386 simular_aviso: corre el código real y no deja rastro', () => {
  const B = base();
  try {
    correosAviso(B);
    ingestar(B, [chec(1, '2026-09-01', '06:50')]);
    const antes = B.q("SELECT (SELECT count(*) FROM retardos.caso) || '/' || (SELECT count(*) FROM retardos.envio) || '/' || (SELECT count(*) FROM retardos.bitacora) || '/' || (SELECT parent_id FROM retardos.empleado WHERE employee_id = 1)");
    B.q("INSERT INTO retardos.retardo (employee_id, fecha, attendance_id, hora_local, seg_local, hora_esperada, tolerancia_min, minutos_tarde, estado, periodo) VALUES (1, '2026-09-04', 5555, 7.5, 27000, 7, 15, 30, 'contado', '2026-09')");
    const s = B.j("SELECT retardos.simular_aviso(" + lit({ employee_id: 1, periodo: '2026-09', sin_jefe: true }) + ")");
    assert.equal(s.simulado, true);
    assert.equal(s.caso.jefe_estado, 'sin_jefe'); assert.equal(s.caso.pista, 'real');
    assert.equal(s.envios.length, 1);
    assert.deepEqual(s.envios[0].cc, ['rh1@example.com', 'rh2@example.com', 'direccion@example.com']);
    assert.match(s.envios[0].html, /Falta asignarle jefe en Odoo/);
    assert.equal(s.retardos.length, 1);
    B.q("DELETE FROM retardos.retardo WHERE attendance_id = 5555");
    const despues = B.q("SELECT (SELECT count(*) FROM retardos.caso) || '/' || (SELECT count(*) FROM retardos.envio) || '/' || (SELECT count(*) FROM retardos.bitacora) || '/' || (SELECT parent_id FROM retardos.empleado WHERE employee_id = 1)");
    assert.equal(despues, antes);
  } finally { B.fin(); }
});


conPg('#386 retardos_0010: en real, una nota para Odoo sin ejecutor nace omitida y no atora el outbox', () => {
  const B = base();
  try {
    B.q("UPDATE retardos.config SET valor = '\"real\"'::jsonb, actualizado_por = 'prueba' WHERE clave = 'modo'");
    B.q("SELECT retardos.encolar('PRUEBA:odoo_nota:1', NULL, 'odoo_nota', '[]'::jsonb, '[]'::jsonb, 'Hoja firmada', 'nota')");
    assert.equal(B.q("SELECT estado FROM retardos.envio WHERE clave_dedupe = 'PRUEBA:odoo_nota:1'"), 'omitido');
    B.q("UPDATE retardos.envio SET creado_at = now() - interval '10 hours' WHERE clave_dedupe = 'PRUEBA:odoo_nota:1'");
    const s = B.j('SELECT retardos.salud()');
    assert.ok(!(s.problemas || []).some((p) => p.codigo === 'OUTBOX_ATORADO'), JSON.stringify(s.problemas));
    // Con ejecutor, vuelve a quedar pendiente (lo toma ese workflow, no retardos/enviar).
    B.q("UPDATE retardos.config SET valor = 'true'::jsonb WHERE clave = 'odoo_nota_ejecutor'");
    B.q("SELECT retardos.encolar('PRUEBA:odoo_nota:2', NULL, 'odoo_nota', '[]'::jsonb, '[]'::jsonb, 'Hoja firmada', 'nota')");
    assert.equal(B.q("SELECT estado FROM retardos.envio WHERE clave_dedupe = 'PRUEBA:odoo_nota:2'"), 'pendiente');
  } finally { B.fin(); }
});
