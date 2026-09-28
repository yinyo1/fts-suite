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
function base() {
  if (!plantillaLista) {
    try { psql('postgres', 'DROP DATABASE IF EXISTS ret_tpl'); } catch (e) { /* nada */ }
    psql('postgres', 'CREATE DATABASE ret_tpl');
    psql('ret_tpl', 'CREATE TABLE public.schema_migrations(version text primary key, nombre text, sha256 text)');
    for (const f of fs.readdirSync(MIG).filter((x) => /^retardos_[0-9]{4}_.*[.]sql$/.test(x)).sort()) {
      psqlFile('ret_tpl', path.join(MIG, f));
    }
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
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), h + 6, m));
  return Object.assign({ attendance_id: ++attSeq, employee_id: emp, check_in_utc: d.toISOString(), disputa: false, incidencia_pendiente: '' }, extra || {});
}
function ingestar(B, checadas, empleados, extra) {
  const p = Object.assign({ workflow: 'retardos/detectar', desde: '2026-09-01', hasta: '2026-09-30',
    empleados: empleados || [EMP(1), SUP], checadas, olvido_entrada_att: [] }, extra || {});
  return B.j('SELECT retardos.ingestar(' + lit(p) + ')');
}
function habilitarTodo(B) { config(B, 'nivel_maximo_habilitado', 4); config(B, 'suspensiones_habilitadas', true); }
function config(B, clave, valor) { B.q("UPDATE retardos.config SET valor = " + lit(valor) + " WHERE clave = '" + clave + "'"); }
function enviarTodo(B) {
  const lista = B.j('SELECT retardos.por_enviar(100)') || [];
  for (const e of lista) B.j('SELECT retardos.marcar_envio(' + lit({ id: e.id, ok: true, modo: e.modo, para_efectivo: e.para }) + ')');
  return lista;
}
const tres = (emp) => [chec(emp, '2026-09-01', '07:45'), chec(emp, '2026-09-02', '08:00'), chec(emp, '2026-09-03', '07:30')];
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
    const env = enviarTodo(B);
    assert.equal(env.length, 1);
    assert.equal(env[0].pdf, 'carta_compromiso');
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'ESPERANDO_FIRMA');
    const resp = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm1', remitente: 'demo1@example.com',
      asunto: 'RE: [' + folio + '] Carta compromiso', adjuntos: [{ nombre: 'hoja.pdf', mime: 'application/pdf', contenido_b64: pdfB64() }] }) + ')');
    assert.equal(resp.clasificacion, 'ok');
    assert.equal(B.q("SELECT estado FROM retardos.caso WHERE folio = '" + folio + "'"), 'FIRMA_RECIBIDA');
    const v = B.j('SELECT retardos.panel(' + lit({ accion: 'validar_firma', folio, actor: 'rh-demo', rol: 'editor' }) + ')');
    assert.equal(v.ok, true);
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
    B.q("INSERT INTO retardos.festivo (fecha, nombre) VALUES ('2026-09-16', 'Festivo demo')");
    const r = ingestar(B, [chec(1, '2026-09-16', '09:00'), chec(1, '2026-09-19', '09:00'),
                           chec(1, '2026-09-21', '06:55'), chec(1, '2026-09-21', '09:00')]);
    assert.equal(r.contados, 0);
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE motivo = 'festivo'"), '1');
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE fecha = '2026-09-19'"), '0');
    assert.equal(B.q("SELECT count(*) FROM retardos.retardo WHERE fecha = '2026-09-21'"), '0');
  } finally { B.fin(); }
});

conPg('tolerancia: 20 min exactos no es retardo, 21 sí', () => {
  const B = base();
  try {
    const r = ingestar(B, [chec(1, '2026-09-01', '07:20'), chec(1, '2026-09-02', '07:21')]);
    assert.equal(r.contados, 1);
    assert.equal(B.q("SELECT fecha FROM retardos.retardo"), '2026-09-02');
  } finally { B.fin(); }
});

conPg('empleado sin correo válido: ruta alterna por supervisor', () => {
  const B = base();
  try {
    const r = ingestar(B, tres(2), [EMP(2, { email: 'demo@gmai.com' }), SUP]);
    const folio = r.casos_nuevos[0];
    assert.equal(B.q("SELECT ruta FROM retardos.caso WHERE folio = '" + folio + "'"), 'supervisor');
    const env = B.j('SELECT retardos.por_enviar(10)');
    assert.equal(env[0].tipo, 'ruta_supervisor');
    assert.match(env[0].html, /supervisor@example[.]com/);   // destinatario real escrito en el cuerpo (sombra)
  } finally { B.fin(); }
});

conPg('modo sombra: redirige a sombra_destinatarios con [SOMBRA]; modo real: al empleado', () => {
  const B = base();
  try {
    config(B, 'sombra_destinatarios', ['sombra@example.com']);
    ingestar(B, tres(1));
    const s = B.j('SELECT retardos.por_enviar(10)');
    assert.deepEqual(s[0].para, ['sombra@example.com']);
    assert.match(s[0].asunto, /^\[SOMBRA\] /);
    assert.match(s[0].html, /demo1@example[.]com/);
    config(B, 'modo', 'real');
    const r = B.j('SELECT retardos.por_enviar(10)');
    assert.deepEqual(r[0].para, ['demo1@example.com']);
    assert.doesNotMatch(r[0].asunto, /SOMBRA/);
  } finally { B.fin(); }
});

conPg('respuesta sin adjunto → se pide la hoja, el caso no avanza', () => {
  const B = base();
  try {
    const folio = ingestar(B, tres(1)).casos_nuevos[0]; enviarTodo(B);
    const r = B.j('SELECT retardos.registrar_respuesta(' + lit({ message_id: 'm2', remitente: 'demo1@example.com', asunto: 'RE: [' + folio + ']', adjuntos: [] }) + ')');
    assert.equal(r.clasificacion, 'sin_adjunto');
    assert.equal(B.q("SELECT estado FROM retardos.caso"), 'ESPERANDO_FIRMA');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'pide_hoja' AND estado = 'pendiente'"), '1');
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
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'pide_hoja'"), '1');
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
    assert.equal(B.q("SELECT count(*) FROM retardos.evidencia"), '1');
    assert.equal(B.q("SELECT count(*) FROM retardos.envio WHERE tipo = 'revision_rh'"), '1');
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
    assert.equal(B.q('SELECT count(*) FROM retardos.envio'), '1');
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
    assert.match(B.q("SELECT cc::text FROM retardos.envio WHERE tipo = 'escalamiento'"), /estebandelacruz@fts[.]mx/);
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
    assert.equal(B.j('SELECT retardos.panel_seguro(' + lit(sub) + ')').ok, true);
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
conPg('arranque suave: por defecto sólo se notifica hasta carta; acta y suspensión quedan RETENIDO sin correo', () => {
  const B = base();
  try {
    const cfg = B.j("SELECT jsonb_object_agg(clave, jsonb_build_object('v', valor, 'c', confirmado)) FROM retardos.config WHERE clave IN ('nivel_maximo_habilitado','suspensiones_habilitadas')");
    assert.deepEqual(cfg, { nivel_maximo_habilitado: { v: 2, c: false }, suspensiones_habilitadas: { v: false, c: false } });
    const abiertos = diaPorDia(B, siete(1));   // como en producción: cada umbral cruzado abre su caso
    const casos = B.j("SELECT jsonb_object_agg(nivel, estado) FROM retardos.caso WHERE employee_id = 1");
    assert.deepEqual(Object.keys(casos).sort(), ['1', '2', '3', '4']);
    assert.notEqual(casos['1'], 'RETENIDO');
    assert.notEqual(casos['2'], 'RETENIDO');
    assert.equal(casos['3'], 'RETENIDO');
    assert.equal(casos['4'], 'RETENIDO');
    for (const f of abiertos) {
      const nivel = B.j("SELECT nivel FROM retardos.caso WHERE folio = '" + f + "'");
      const tipos = envios(B, f);
      if (nivel >= 3) assert.deepEqual(tipos, [], 'un caso retenido no genera ningún correo');
      else assert.ok(tipos.includes('notificacion'));
    }
    assert.equal(B.j("SELECT count(*) FROM retardos.bitacora WHERE a = 'RETENIDO' AND motivo LIKE 'Nivel alcanzado, no notificado%'"), 2);
    const lista = B.j('SELECT retardos.panel(' + lit({ accion: 'listar', actor: 'rh', rol: 'lector' }) + ')');
    assert.equal(lista.casos.filter((c) => c.estado === 'RETENIDO').length, 2, 'RH los ve en el panel');
  } finally { B.fin(); }
});

conPg('arranque suave: con nivel máximo 4 y suspensiones deshabilitadas, se notifica el acta y se retiene la suspensión', () => {
  const B = base();
  try {
    config(B, 'nivel_maximo_habilitado', 4);
    diaPorDia(B, siete(1));
    const casos = B.j("SELECT jsonb_object_agg(nivel, estado) FROM retardos.caso WHERE employee_id = 1");
    assert.notEqual(casos['3'], 'RETENIDO');
    assert.equal(casos['4'], 'RETENIDO');
    habilitarTodo(B);
    assert.equal(B.j('SELECT to_jsonb(retardos.nivel_habilitado(4::smallint))'), true);
  } finally { B.fin(); }
});

conPg('arranque suave: un caso RETENIDO sólo puede cerrarse o cancelarse', () => {
  const B = base();
  try {
    diaPorDia(B, siete(1));
    const folio = B.j("SELECT to_jsonb(folio) FROM retardos.caso WHERE employee_id = 1 AND nivel = 3");
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
    assert.equal(B.q('SELECT estado || intentos FROM retardos.envio'), 'fallido1');
    assert.equal(B.j('SELECT retardos.por_enviar(10)').length, 1);   // se reintenta
    B.q("UPDATE retardos.envio SET creado_at = now() - interval '5 hours'");
    assert.ok(B.j('SELECT retardos.salud()').problemas.some((x) => x.codigo === 'OUTBOX_ATORADO'));
  } finally { B.fin(); }
});

// ── pruebas de JS puro (corren siempre) ────────────────────────────────────
test('cambio de campo en Odoo: el contrato truena con CONTRATO_ROTO en vez de seguir vacío', () => {
  const N = require('../../retardos/lib/normalizar.js');
  const att = [{ id: 1, employee_id: [5, 'Demo'], check_in: '2026-09-01 13:10:00', x_studio_horario_en_disputa: false, x_studio_incidencia_pendiente_id: false }];
  const emp = [{ id: 5, name: 'Demo', job_title: 'x', company_id: [1, 'FTS'], active: true, x_studio_hora_entrada: 7, work_email: 'd@example.com', parent_id: false, department_id: false, resource_calendar_id: [2, 'Ops'] }];
  const ok = N.normalizar({ att, emp, cal: [{ calendar_id: [2, 'Ops'], dayofweek: '0', hour_from: 7 }], desde: '2026-09-01', hasta: '2026-09-01' });
  assert.equal(ok.checadas[0].check_in_utc, '2026-09-01T13:10:00Z');
  assert.equal(ok.empleados[0].hora_calendario, 7);
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
