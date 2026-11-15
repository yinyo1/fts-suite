#!/usr/bin/env node
// #507 Etapa 3 · seguridad/dc3-empleados: el código EXACTO de sus Code nodes (el que arma
// seguridad/n8n/armar.js) corrido con un contexto de n8n simulado. Sin red, sin Odoo.
// Empleados y CURP inventados (con XXX para que se note).
//   node tests/seguridad/dc3-empleados-servidor.js
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');
const S = require(path.join(RAIZ, 'retardos', 'lib', 'sesion.js'));
let pasan = 0, fallan = 0;
const check = (n, c, info) => { if (c) { pasan++; console.log('  ✓', n); } else { fallan++; console.log('  ✗', n, info === undefined ? '' : JSON.stringify(info)); } };

const LIB = fs.readFileSync(path.join(RAIZ, 'retardos', 'lib', 'sesion.js'), 'utf8');
const PUERTA = fs.readFileSync(path.join(RAIZ, 'seguridad', 'n8n', 'code', 'dc3-puerta.js'), 'utf8').split('/*__SESION__*/').join(LIB);
const RESP = fs.readFileSync(path.join(RAIZ, 'seguridad', 'n8n', 'code', 'dc3-responder.js'), 'utf8');
const SECRETO = 'x'.repeat(40) + '-solo-prueba';
const STATIC = {};

function b64j(o) { return S._b64url(Array.from(Buffer.from(JSON.stringify(o)))); }
function token(scopes, exp) { const ahora = Math.floor(Date.now() / 1000); const si = b64j({ alg: 'HS256', typ: 'JWT' }) + '.' + b64j({ sub: 'zz.dc3', scopes, iat: ahora, exp: exp || ahora + 120 }); return si + '.' + S._b64url(S._hmac(SECRETO, si)); }
let n = 0; const nonce = () => 'prueba' + Date.now() + 'n' + (n++) + 'xxxxxxxx';
function cuerpo(tok, datos, o) { o = o || {}; const ts = o.ts || Date.now(), nc = o.nonce || nonce(); return { token: tok, ts, nonce: nc, sig: o.sig || S.firmar(tok, ts, nc, datos), datos }; }

function correr(codigo, ctx) { return new Function('$input', '$', '$getWorkflowStaticData', codigo)(ctx.$input, ctx.$, () => STATIC); }
function puerta(body, secreto) {
  return correr(PUERTA, { $input: { first: () => ({ json: { secreto: secreto === undefined ? SECRETO : secreto } }) }, $: () => ({ first: () => ({ json: { body } }) }) })[0].json;
}
const ODOO = [
  { id: 901, name: 'Laura Patricia Gómez Treviño', job_title: 'Segurista', identification_id: 'GOTL900215MNLXXX04', x_studio_apellido_paterno: 'Gómez', x_studio_apellido_materno: 'Treviño', x_studio_nombres: 'Laura Patricia' },
  { id: 902, name: 'Martín Elizondo Cárdenas', job_title: false, job_id: [40, 'Soldador'], identification_id: false, x_studio_apellido_paterno: false, x_studio_apellido_materno: false, x_studio_nombres: false },
  { id: 903, name: 'Héctor Saldívar Peña', job_title: 'Chofer', identification_id: 'SAPH910310HNLXXX0', x_studio_apellido_paterno: 'SALDIVAR', x_studio_apellido_materno: 'PEÑA', x_studio_nombres: 'HECTOR' },
  { id: 800, name: 'Laura Patricia Gómez Treviño', job_title: 'Segurista', identification_id: 'GOTL900215MNLXXX04', x_studio_apellido_paterno: false, x_studio_apellido_materno: false, x_studio_nombres: false }
];
function responder(p) {
  return correr(RESP, { $input: null, $: nodo => ({ first: () => ({ json: p }), all: () => (nodo === 'Odoo - Empleados' ? ODOO.map(json => ({ json })) : []) }) })[0].json;
}

console.log('\n▶ Puerta');
const T = token(['dc3:empleados']);
let r = puerta(cuerpo(T, { accion: 'buscar', q: 'laura' }));
check('token con dc3:empleados y firma buena: pasa', r.ok === true && r.accion === 'buscar' && r.actor === 'zz.dc3', r);
check('la salida de la puerta NO trae el secreto', !JSON.stringify(r).includes(SECRETO));
check('sin token: TOKEN_AUSENTE', puerta({ datos: { accion: 'buscar' } }).error === 'TOKEN_MALFORMADO' || puerta({ datos: { accion: 'buscar' } }).error === 'TOKEN_AUSENTE', puerta({ datos: { accion: 'buscar' } }));
check('sin scope: SCOPE_INSUFICIENTE', puerta(cuerpo(token([]), { accion: 'buscar', q: 'x' })).error === 'SCOPE_INSUFICIENTE');
check('faltantes con dc3:empleados pero sin rh:read: SCOPE_INSUFICIENTE', puerta(cuerpo(T, { accion: 'faltantes' })).error === 'SCOPE_INSUFICIENTE');
check('faltantes con rh:read: pasa', puerta(cuerpo(token(['rh:read']), { accion: 'faltantes' })).ok === true);
check('token vencido: TOKEN_EXPIRADO', puerta(cuerpo(token(['dc3:empleados'], Math.floor(Date.now() / 1000) - 5), { accion: 'buscar' })).error === 'TOKEN_EXPIRADO');
check('firma de otro secreto: FIRMA_INVALIDA', (() => { const t = T.split('.'); t[2] = t[2].slice(0, -2) + (t[2].slice(-2) === 'AA' ? 'BB' : 'AA'); return puerta(cuerpo(t.join('.'), { accion: 'buscar' })).error === 'FIRMA_INVALIDA'; })());
check('HMAC alterado: HMAC_INVALIDO', puerta(cuerpo(T, { accion: 'buscar', q: 'a' }, { sig: 'ab'.repeat(32) })).error === 'HMAC_INVALIDO');
check('datos cambiados después de firmar: HMAC_INVALIDO', (() => { const b = cuerpo(T, { accion: 'buscar', q: 'laura' }); b.datos = { accion: 'detalle', id: 901 }; return puerta(b).error === 'HMAC_INVALIDO'; })());
check('fuera de la ventana de 5 min: FUERA_DE_VENTANA', puerta(cuerpo(T, { accion: 'buscar' }, { ts: Date.now() - 6 * 60 * 1000 })).error === 'FUERA_DE_VENTANA');
const repetida = cuerpo(T, { accion: 'buscar', q: 'mar' });
check('nonce nuevo: pasa', puerta(repetida).ok === true);
check('el mismo nonce otra vez: NONCE_REPETIDO', puerta(repetida).error === 'NONCE_REPETIDO');
check('acción desconocida: ACCION_INVALIDA', puerta(cuerpo(T, { accion: 'escribir' })).error === 'ACCION_INVALIDA');
check('secreto no configurado: no deja pasar', puerta(cuerpo(T, { accion: 'buscar' }), '').error === 'SECRETO_NO_CONFIGURADO');

console.log('\n▶ Responder');
r = responder({ accion: 'buscar', q: 'laura' });
check('buscar: deduplica (2 registros de Laura → 1, el de id mayor)', r.ok && r.resultados.length === 1 && r.resultados[0].id === 901, r);
check('buscar: NUNCA trae la CURP', !JSON.stringify(responder({ accion: 'buscar', q: 'a' })).includes('GOTL900215'));
check('buscar: nombre en orden DC-3, sin acentos y con Ñ', r.resultados[0].nombre_dc3 === 'GOMEZ TREVIÑO LAURA PATRICIA', r.resultados[0].nombre_dc3);
check('buscar: menos de 3 letras no devuelve nada', responder({ accion: 'buscar', q: 'la' }).resultados.length === 0);
check('buscar por prefijo de CURP encuentra sin devolverla', (() => { const x = responder({ accion: 'buscar', q: 'GOTL90' }); return x.resultados.length === 1 && !JSON.stringify(x).includes('GOTL90'); })());
r = responder({ accion: 'buscar', q: 'elizondo' }).resultados[0];
check('buscar: sin CURP y sin nombre separado, puesto desde job_id', r.tiene_curp === false && r.nombre_separado === false && r.nombre_dc3 === null && r.puesto === 'Soldador', r);
r = responder({ accion: 'buscar', q: 'saldivar' }).resultados[0];
check('buscar: CURP inválida se marca', r.tiene_curp === true && r.curp_valida === false, r);
r = responder({ accion: 'detalle', id: 901 });
check('detalle: trae CURP, apellidos (con Ñ), nombre y puesto', r.ok && r.empleado.curp === 'GOTL900215MNLXXX04' && r.empleado.curp_valida && r.empleado.ap === 'GOMEZ' && r.empleado.am === 'TREVIÑO' && r.empleado.nom === 'LAURA PATRICIA' && r.empleado.puesto === 'Segurista', r);
check('detalle de un id que no existe: NO_ENCONTRADO', responder({ accion: 'detalle', id: 5 }).error === 'NO_ENCONTRADO');
r = responder({ accion: 'faltantes' });
check('faltantes: cuenta activos sin duplicados y lista qué falta, sin CURP', r.ok && r.activos === 3 && r.faltan.length === 2 && !JSON.stringify(r).includes('XXX'), r);
check('faltantes: Martín sin CURP y sin separar; Héctor con CURP inválida', JSON.stringify(r.faltan) === JSON.stringify([{ nombre: 'Héctor Saldívar Peña', falta: ['CURP inválida'] }, { nombre: 'Martín Elizondo Cárdenas', falta: ['nombre sin separar', 'sin CURP'] }]), r.faltan);

console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
process.exit(fallan ? 1 : 0);
