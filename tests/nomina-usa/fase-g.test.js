#!/usr/bin/env node
// Fase G (#448, paso 6 de la sesión del 2-nov): alimentador de evidencia comercial para el
// sugerido de «Tu día» de Ricardo, detrás de evidencia_activa = false.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const E = require('../../shared/nomina-usa/evidencia.js');
const fs = require('fs'), path = require('path');
const OCT = require('./fixtures/evidencia-octubre-98.json');

// Coordenadas sintéticas alrededor de 10,10 (0,0 es «sin ubicación» en Odoo y la regla lo descarta).
const PLANTA = { lat: 10, lng: 10 };
const cerca = m => ({ lat: 10 + m / 111000, lng: 10 });

seccion('Reglas puras');
check('distancia: 0,0 a 0.001 grados ≈ 111 m', Math.abs(E.distanciaM(PLANTA, { lat: 10.001, lng: 10 }) - 111) < 2);
check('planta con 2 checadas de la cuadrilla en el mismo punto', (p => p && p.puntos === 2 && Math.abs(p.lat - 10) < 0.001)(E.plantaDe([cerca(0), cerca(30), cerca(90000)], 500, 2)));
check('una sola checada no fija planta (no se inventa)', E.plantaDe([cerca(0), cerca(90000)], 500, 2) === null);
check('0,0 de Odoo (sin ubicación) no cuenta como punto', E.plantaDe([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }], 500, 2) === null);
check('Platt, Grainger, Home Depot y Lowe\'s son material', ['PLATT ELECTRIC 032', 'GRAINGER', 'Home Depot', "Lowe's Home Improvement"].every(x => E.esCompraMaterial(x)));
check('AutoZone, Staples, comida y vuelos no son material', ['AutoZone', 'Staples', 'Chick-fil-A', 'UNITED 0162150854649', 'AA GAS INC'].every(x => !E.esCompraMaterial(x)));
const pl = { 7: { lat: 10.0001, lng: 10 } };
check('bloque con SO en planta = obra → sugerido 0', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: 7, lat: 10, lng: 10 }], [], pl).sugerido === 0);
check('bloque sin SO = comercial → sugerido 100', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: null, lat: 10, lng: 10 }], [], pl).sugerido === 100);
check('con SO, fuera de planta y sin compra = comercial', (d => d.sugerido === 100 && d.bloques[0].motivo === 'FUERA_DE_PLANTA')(E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: 7, lat: 11, lng: 10 }], [], pl)));
// 2-nov: una compra cuenta como obra SOLO 1 hora alrededor de la compra (antes: todo el bloque).
check('con SO, fuera de planta y compra de material = 1 h de obra de 8 → 87.5 % → 90 %', (d => d.sugerido === 90 && d.bloques[0].motivo === 'COMPRA_MATERIAL_1H' && d.bloques[0].obra_horas === 1)(E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: 7, lat: 11, lng: 10 }], [{ monto: -50, proveedor: 'GRAINGER' }], pl)));
check('una compra vale 1 hora también en un bloque sin SO (8 h → 90 %), nunca el bloque entero', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: null }], [{ monto: -50, proveedor: 'GRAINGER' }], pl).sugerido === 90);
check('dos renglones del mismo proveedor el mismo día son UNA visita = 1 h', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: null }], [{ monto: -50, proveedor: 'GRAINGER' }, { monto: -9, proveedor: 'GRAINGER #2' }], pl).visitas_compra === 1);
check('dos proveedores distintos = 2 visitas = 2 h (8 h → 75 % → 80 %)', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: null }], [{ monto: -50, proveedor: 'GRAINGER' }, { monto: -9, proveedor: 'Home Depot' }], pl).sugerido === 80);
check('con hora de la compra: solo cuenta la hora que cae dentro del bloque (compra 30 min antes de entrar = 30 min)', (d => d.bloques[0].obra_horas === 0.5)(E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: null, ent: '2026-10-27T15:00:00Z', sal: '2026-10-27T23:00:00Z' }], [{ monto: -50, proveedor: 'GRAINGER', hora: '2026-10-27T15:00:00Z' }], pl)));
check('una compra nunca hace obra más horas que las del bloque', E.evaluarDia([{ attendance_id: 1, horas: 0.5, so_id: null }], [{ monto: -50, proveedor: 'GRAINGER' }], pl).sugerido === 0);
check('un reembolso (monto positivo) no cuenta como compra', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: 7, lat: 11, lng: 10 }], [{ monto: 20.58, proveedor: 'GRAINGER' }], pl).sugerido === 100);
check('mezcla: 6 h obra + 2 h comercial = 25 % → redondeado a 30 %', E.evaluarDia([{ attendance_id: 1, horas: 6, so_id: 7, lat: 10, lng: 10 }, { attendance_id: 2, horas: 2, so_id: null }], [], pl).sugerido === 30);
check('sin horas checadas → 0 (no divide entre cero)', E.evaluarDia([], [], pl).sugerido === 0);
check('planta desconocida y sin compra = comercial, con su motivo', E.evaluarDia([{ attendance_id: 1, horas: 8, so_id: 9, lat: 10, lng: 10 }], [], {}).bloques[0].motivo === 'PLANTA_DESCONOCIDA_SIN_COMPRA');

seccion('Días reales de octubre (Ricardo 98, America/Los_Angeles)');
const coords = u => u === 'planta' ? cerca(25) : { lat: 10.45, lng: 10 };   // fuera = ~50 km
const atts = OCT.ricardo.map(a => ({ id: a.id, check_in: a.check_in, check_out: a.check_out, x_studio_project_id: a.so_id ? [a.so_id, 'SO'] : false,
  in_latitude: coords(a.ubicacion).lat, in_longitude: coords(a.ubicacion).lng }));
const cuad = OCT.cuadrilla_so.map((so, i) => ({ id: 900 + i, x_studio_project_id: [so, 'SO'], in_latitude: cerca(i * 20).lat, in_longitude: 10 }));
const dias = E.evaluarPersona(atts, cuad, OCT.compras, { zona: OCT.zona, ahora: '2026-11-02T00:00:00Z' });
const dia = f => dias.find(d => d.fecha === f) || {};
check('los tres días caen en su fecha local de Los Ángeles', ['2026-10-21', '2026-10-23', '2026-10-27'].every(f => dias.some(d => d.fecha === f)), dias.map(d => d.fecha));
check('21-oct (SO11791, en planta, compra en Platt) → sugerido BAJO (0 %)', dia('2026-10-21').sugerido === 0, dia('2026-10-21'));
check('21-oct reconoce la compra de material de Platt', (dia('2026-10-21').compras_material || []).some(c => /PLATT/.test(c.proveedor)));
check('23-oct (SO11791, en planta) → sugerido BAJO (0 %)', dia('2026-10-23').sugerido === 0, dia('2026-10-23'));
check('23-oct: Staples no es material; cuenta como obra por la ubicación', (d => d.compras_material.length === 0 && d.bloques[0].motivo === 'EN_PLANTA')(dia('2026-10-23')));
check('27-oct (sin SO, fuera de planta, 2 compras de Grainger) → sugerido 90 % (antes 100 %): 1 h de obra de 9.6', dia('2026-10-27').sugerido === 90, dia('2026-10-27'));
check('27-oct: las dos de Grainger son UNA visita y valen 1 hora, no el bloque', (d => d.compras_material.length === 2 && d.visitas_compra === 1 && d.bloques[0].obra_horas === 1 && d.bloques[0].motivo === 'COMPRA_MATERIAL_1H')(dia('2026-10-27')));
check('las horas se topan en 14 (la del 22-oct sin cerrar no infla el día)', dias.every(d => d.horas_checadas <= 14));

seccion('Código embebido en n8n');
const A = require('../../nomina-usa/n8n/armar.js');
const sdk = A.armar('evidencia');
check('armar.js evidencia arma el SDK con la librería embebida', /evaluarPersona/.test(sdk) && !/__LEER__|__EVIDENCIA__/.test(sdk));
check('sin diagonales invertidas en la librería ni en el Code (§17 quirk 2c)', !/\\/.test(fs.readFileSync(path.join(__dirname, '../../shared/nomina-usa/evidencia.js'), 'utf8')) && !/\\/.test(fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/evidencia-leer.js'), 'utf8')));
check('el Code va en try/catch total (cuelga del Set del secreto, §9)', /^\s*try \{[\s\S]*\} catch \(e\) \{[\s\S]*FALLO_EVIDENCIA[\s\S]*\}\s*$/.test(fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/evidencia-leer.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '')));
check('con la bandera apagada el workflow no llega a leer Odoo (IF antes del secreto)', /siActiva\.onTrue\(secreto/.test(fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/evidencia.sdk.js'), 'utf8')));

if (!pg.disponible()) { check('Postgres de pruebas disponible', false); fin(); }
seccion('Base (Postgres real): 0008 detrás de evidencia_activa');
const db = pg.crear();
check('evidencia_activa nace en false', db.q("SELECT nomina_usa.cfg('evidencia_activa')") === 'false');
check('la tarjeta 123 es de Ricardo (98)', db.q("SELECT nomina_usa.cfg('evidencia_tarjetas')->>'123'") === '98');
check('parametros: solo personas supervisor_comercial (Ricardo)', (p => p.activa === false && p.personas.length === 1 && p.personas[0].employee_id === 98)(db.j('SELECT nomina_usa.evidencia_parametros()')));
const payload = JSON.stringify({ dias: dias.map(d => Object.assign({ employee_id: 98 }, d)) });
let r = db.j("SELECT nomina_usa.evidencia_registrar($q$" + payload + "$q$::jsonb)");
check('APAGADA: registrar no escribe nada', r.activa === false && r.escritas === 0 && db.q('SELECT count(*) FROM nomina_usa.evidencia_comercial') === '0', r);
db.q("UPDATE nomina_usa.config SET valor = 'true'::jsonb WHERE clave = 'evidencia_activa'");
r = db.j("SELECT nomina_usa.evidencia_registrar($q$" + payload + "$q$::jsonb)");
check('PRENDIDA: escribe un renglón por día', r.escritas === dias.length && db.q('SELECT count(*) FROM nomina_usa.evidencia_comercial') === String(dias.length), r);
r = db.j("SELECT nomina_usa.evidencia_registrar($q$" + payload + "$q$::jsonb)");
check('repetir la corrida no duplica (reemplaza por persona y día)', db.q('SELECT count(*) FROM nomina_usa.evidencia_comercial') === String(dias.length));
check('27-oct guarda horas comerciales = horas checadas; 21-oct guarda 0', db.q("SELECT string_agg(fecha || ':' || horas, ',' ORDER BY fecha) FROM nomina_usa.evidencia_comercial WHERE fecha IN ('2026-10-21','2026-10-27')") ===
  '2026-10-21:0.00,2026-10-27:' + dia('2026-10-27').horas_comerciales.toFixed(2));
check('lo que no puso el alimentador (otra fuente) no se borra', (() => {
  db.q("INSERT INTO nomina_usa.evidencia_comercial (employee_id, fecha, horas, fuente) VALUES (98, '2026-10-21', 1, 'correo')");
  db.j("SELECT nomina_usa.evidencia_registrar($q$" + payload + "$q$::jsonb)");
  return db.q("SELECT count(*) FROM nomina_usa.evidencia_comercial WHERE fuente = 'correo'") === '1';
})());
check('el sugerido del kiosko sale de la evidencia (función sin cambios)', db.q('SELECT nomina_usa.sugerido_comercial(2, 8)') === '30');
fin();
