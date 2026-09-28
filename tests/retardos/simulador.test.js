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
    config(B, 'modo', 'real');
    const r = B.j('SELECT retardos.por_enviar(10)').find((x) => x.tipo === 'aviso_trabajador');
    assert.deepEqual(r.para, ['demo1@example.com']);
    assert.doesNotMatch(r.asunto, /SOMBRA/);
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
    assert.ok(B.j("SELECT jsonb_agg(tipo) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id WHERE c.employee_id = 2 AND c.accion = 'suspension'").includes('notificacion'));
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
