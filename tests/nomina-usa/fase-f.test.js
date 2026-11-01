#!/usr/bin/env node
// Fase F (#448): ajuste del viernes (estimados de miércoles y jueves contra lo real).
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const N = require('../../shared/nomina-usa/nomina.js');

seccion('Reglas puras');
check('jueves estimado 20 % comercial y real 0 % → −28', N.ajusteComercial({ '2026-11-05': 20 }, { '2026-11-05': 0 }, 140).total === -28);
check('miércoles estimado 0 y real 30 → +42', N.ajusteComercial({ '2026-11-04': 0 }, { '2026-11-04': 30 }, 140).total === 42);
check('sin diferencia, sin ajuste', N.ajusteComercial({ x: 20 }, { x: 20 }).dias.length === 0);
check('avance estimado 100 y real 90: −10 % de cada bolsa (informativo)', (a => a.supervisor === -320 && a.tecnicos === -720)(N.ajusteAvance({ supervisor: 3200, tecnicos: 7200 }, 100, 90)));

seccion('Migraciones listas para el aplicador (nomina-usa/db-migrate)');
{
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '../../db/migrations/nomina_usa');
  const arch = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  check('seis migraciones nomina_usa_0001…0006, numeradas sin huecos', arch.length === 6 && arch.every((f, i) => f.startsWith('nomina_usa_' + String(i + 1).padStart(4, '0') + '_')), arch);
  const code = fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/db-migrate-decidir.js'), 'utf8');
  arch.forEach((f, i) => {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const prev = arch.slice(0, i).map(x => ({ version: x.slice(0, 15), sha256: 'x' }));
    const $ = n => ({ 'Set - Config': { item: { json: { archivo: 'nomina_usa/' + f, dry_run: true } } }, 'HTTP - Bajar .sql del repo': { item: { json: { data: sql } } },
      'Crypto - sha256': { item: { json: { sha256: 'a'.repeat(64) } } }, 'Postgres - Estado bitacora': { all: () => prev.map(j => ({ json: j })) } })[n];
    const r = new Function('$', code)($)[0].json;
    check(f + ': el aplicador la acepta (sin llaves dobles ni dólar doble, en orden)', !r.error && r.version === f.slice(0, 15), r.error + ' ' + (r.mensaje || ''));
  });
}

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Ajuste en la base (Postgres real)');
const db = pg.crear();
const R = ['nomina_usa:kiosko'], MAG = ['nomina_usa:validar'], ER = ['nomina_usa:autorizar'];
db.panel({ accion: 'bolsa_provisional', so_id: 501, so_nombre: 'SO11842 - prensas', supervisor: 3200, tecnicos: 7200, folio: 'EDC-PRUEBA' });
db.q(`INSERT INTO nomina_usa.avance_so (so_id, so_nombre, fecha, pct, reporta) VALUES (501, 'SO11842 - prensas', '2026-11-02', 80, 98);
      SELECT nomina_usa.horas_registrar('{"horas":[{"attendance_id":1,"employee_id":75,"fecha":"2026-11-02","so_id":501,"horas":10}]}'::jsonb);`);
let r = db.panel({ accion: 'solicitud_enviar', envio: { semana: '2026-10-30',
  sos: [{ so_id: 501, so_nombre: 'SO11842 - prensas', est_mie: 90, est_jue: 100, reparto: { tecnicos: { 75: 500 } } }],
  comercial: [{ employee_id: 98, fecha: '2026-11-04', pct: 0, estimado: true }, { employee_id: 98, fecha: '2026-11-05', pct: 20, estimado: true, sugerido: 20 }] } }, R, 'ricardo');
check('semana 30-oct enviada con jueves estimado 20 % comercial', r.ok, r);
const s1 = r.id;
db.panel({ accion: 'solicitud_validar', id: s1 }, MAG, 'magaly');
check('autorizada', db.panel({ accion: 'solicitud_autorizar', id: s1 }, ER, 'erick').ok);
// Lo real: el jueves fue 100 % SO (0 % comercial); el avance real al jueves quedó en 90.
db.q(`INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido) VALUES (98, '2026-11-05', 'real', '[{"clave":"501","so_id":501,"pct":100}]', true);
      INSERT INTO nomina_usa.avance_so (so_id, fecha, pct, reporta) VALUES (501, '2026-11-05', 90, 98);`);
const calc = db.j("SELECT nomina_usa.ajuste_calculo('2026-10-30')");
const com = calc.ajustes.filter(a => a.tipo === 'comercial');
check('el cálculo da −28 por el jueves (20 % estimado, 0 % real)', com.length === 1 && Number(com[0].monto) === -28 && com[0].fecha === '2026-11-05', calc.ajustes);
check('el avance (100 estimado, 90 real) sale como informativo, no como línea', calc.ajustes.some(a => a.tipo === 'avance' && a.informativo === true && Number(a.monto) === -720));
let ctx = db.panel({ accion: 'solicitud_contexto', semana: '2026-11-06' }, R, 'ricardo');
check('antes del cron, la siguiente solicitud ya muestra el ajuste en vista previa', ctx.ok && ctx.ajustes_previos.some(a => a.tipo === 'comercial' && Number(a.monto) === -28), ctx.ajustes_previos);
r = db.j("SELECT nomina_usa.ajuste_viernes('2026-10-30')");
check('el cron del viernes guarda los ajustes', r.nuevos === 3, r);
check('correrlo dos veces no duplica', db.j("SELECT nomina_usa.ajuste_viernes('2026-10-30')").nuevos === 0);
ctx = db.panel({ accion: 'solicitud_contexto', semana: '2026-11-06' }, R, 'ricardo');
check('la siguiente solicitud trae −28 precargado como pendiente', ctx.ajustes.length === 1 && Number(ctx.ajustes[0].monto) === -28 && ctx.ajustes_previos.length === 0, ctx.ajustes);
r = db.panel({ accion: 'solicitud_enviar', envio: { semana: '2026-11-06', sos: [], comercial: [{ employee_id: 98, fecha: '2026-11-09', pct: 30, sugerido: 30 }] } }, R, 'ricardo');
check('al enviar la siguiente, la base agrega la línea de ajuste −28', r.ok && db.q("SELECT monto FROM nomina_usa.solicitud_linea WHERE solicitud_id=" + r.id + " AND tipo='ajuste'") === '-28.00', r);
check('el ajuste queda aplicado una sola vez', db.q('SELECT count(*) FROM nomina_usa.ajuste WHERE aplicado_en IS NOT NULL') === '1' && db.panel({ accion: 'solicitud_contexto', semana: '2026-11-13' }, R).ajustes.length === 0);
check('el ajuste va a COMERCIAL-USA', db.q("SELECT cuenta FROM nomina_usa.solicitud_linea WHERE tipo='ajuste'") === 'COMERCIAL-USA');
check('el disponible de la semana siguiente ya usa el avance real (90): 7,200×90 % − 500 = 5,980', db.q("SELECT nomina_usa.disponible(501, 'tecnicos', nomina_usa.avance_al(501, '2026-11-12'))") === '5980.00');
fin();
