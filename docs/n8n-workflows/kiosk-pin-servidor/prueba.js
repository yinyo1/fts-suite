// Prueba local del nodo `Code - Validar empleado` (fts-suite#486).
// Corre el jsCode real dentro de un simulador mínimo de n8n. PINs INVENTADOS.
//   node docs/n8n-workflows/kiosk-pin-servidor/prueba.js
'use strict';
const fs = require('fs');
const path = require('path');
const CODE = fs.readFileSync(path.join(__dirname, 'validar-empleado.js'), 'utf8');

function correr({ code = CODE, body = {}, odoo, sd, headers = {}, params }) {
  params = params || { empleado_id: 900001, empleado_nombre: 'ZZ Prueba', tipo: 'entrada' };
  const nodos = {
    'Code - Preparar parámetros': { item: { json: params } },
    'Webhook': { first: () => ({ json: { body, headers } }) },
  };
  const $ = (n) => { if (!nodos[n]) throw new Error('nodo ' + n); return nodos[n]; };
  const $input = { all: () => (odoo || []).map(j => ({ json: j })) };
  const $getWorkflowStaticData = () => { if (sd === null) throw new Error('sin staticData'); return sd; };
  const fn = new Function('$', '$input', '$getWorkflowStaticData', code);
  return fn($, $input, $getWorkflowStaticData)[0].json;
}

let pasan = 0, fallan = 0;
function ok(nombre, cond, info) { if (cond) { pasan++; console.log('  ✓', nombre); } else { fallan++; console.log('  ✗', nombre, info || ''); } }
const emp = (o) => Object.assign({ id: 900001, name: 'ZZ Prueba', active: true, pin: '4821' }, o || {});
const sinFuga = (r) => !JSON.stringify(r).includes('4821');

// 1 tolerante sin pin
let sd = {}; let r = correr({ odoo: [emp()], sd });
ok('sin pin → sigue (_valido) en tolerante', r._valido === true && !r._error && r.pin_verificado === false);
ok('sin pin → no fuga el PIN real', sinFuga(r));
ok('sin pin → cuenta sin_pin', Object.values(sd.pin_metricas)[0].sin_pin === 1);
ok('odoo_employee_data sin campo pin', r.odoo_employee_data && !('pin' in r.odoo_employee_data));

// 2 bueno
sd = {}; r = correr({ odoo: [emp()], sd, body: { pin: '4821' } });
ok('pin bueno → _valido y pin_verificado', r._valido === true && r.pin_verificado === true && !r._error);
ok('pin bueno → no fuga', sinFuga(r));

// 3 malo
r = correr({ odoo: [emp()], sd, body: { pin: '0000' } });
ok('pin malo → PIN_INCORRECTO', r._error === true && r.codigo_error === 'PIN_INCORRECTO' && r.intentos_restantes === 4, JSON.stringify(r));
ok('pin malo → no dice cuál era', sinFuga(r) && !/4821/.test(r.mensaje));

// 4 bloqueo tras 5
sd = {}; let ult;
for (let i = 0; i < 5; i++) ult = correr({ odoo: [emp()], sd, body: { pin: '1111', dispositivo_id: 'A' } });
ok('5º fallo → PIN_BLOQUEADO', ult.codigo_error === 'PIN_BLOQUEADO' && ult.minutos_bloqueo === 15, ult.codigo_error);
r = correr({ odoo: [emp()], sd, body: { pin: '4821', dispositivo_id: 'B' } });
ok('bloqueado → aun el PIN bueno se rechaza', r.codigo_error === 'PIN_BLOQUEADO');
// otro empleado en otro dispositivo no se afecta
r = correr({ odoo: [emp({ id: 900002 })], sd, params: { empleado_id: 900002, tipo: 'entrada' }, body: { pin: '4821', dispositivo_id: 'B' } });
ok('otro empleado no se bloquea', r._valido === true);
// vence el bloqueo
for (const k of Object.keys(sd.pin_intentos)) if (sd.pin_intentos[k].hasta) sd.pin_intentos[k].hasta = Date.now() - 1;
r = correr({ odoo: [emp()], sd, body: { pin: '4821', dispositivo_id: 'B' } });
ok('bloqueo vencido → entra', r._valido === true);
ok('acierto limpia el contador del empleado', !sd.pin_intentos['e:900001']);

// 5 bloqueo por dispositivo (20 fallos repartidos en empleados distintos)
sd = {};
for (let i = 0; i < 20; i++) ult = correr({ odoo: [emp({ id: 910000 + i })], sd, params: { empleado_id: 910000 + i, tipo: 'entrada' }, body: { pin: '9999', dispositivo_id: 'X' } });
r = correr({ odoo: [emp()], sd, body: { pin: '4821', dispositivo_id: 'X' } });
ok('20 fallos en un dispositivo → lo bloquea', r.codigo_error === 'PIN_BLOQUEADO');
r = correr({ odoo: [emp()], sd, body: { pin: '4821', dispositivo_id: 'Y' } });
ok('otro dispositivo sigue entrando', r._valido === true);
// sin dispositivo_id cae a la IP
sd = {};
for (let i = 0; i < 20; i++) correr({ odoo: [emp({ id: 920000 + i })], sd, params: { empleado_id: 920000 + i, tipo: 'entrada' }, body: { pin: '9999' }, headers: { 'x-forwarded-for': '10.0.0.1, 1.1.1.1' } });
r = correr({ odoo: [emp()], sd, body: { pin: '4821' }, headers: { 'x-forwarded-for': '10.0.0.1' } });
ok('sin dispositivo_id → límite por IP', r.codigo_error === 'PIN_BLOQUEADO');

// 6 sin PIN en Odoo → falla cerrado (ya no hay 0000)
sd = {};
r = correr({ odoo: [emp({ pin: false })], sd, body: { pin: '0000' } });
ok('sin PIN en Odoo + 0000 → PIN_NO_CONFIGURADO', r.codigo_error === 'PIN_NO_CONFIGURADO');

// 7 solo verificar
sd = {};
r = correr({ odoo: [emp()], sd, body: { pin: '4821', solo_verificar_pin: true } });
ok('solo_verificar bueno → PIN_VERIFICADO sin seguir', r._error === true && r.codigo_error === 'PIN_VERIFICADO' && r.pin_verificado === true && !r._valido);
r = correr({ odoo: [emp()], sd, body: { pin: '1234', solo_verificar_pin: true } });
ok('solo_verificar malo → PIN_INCORRECTO', r.codigo_error === 'PIN_INCORRECTO');
r = correr({ odoo: [emp()], sd, body: { solo_verificar_pin: true } });
ok('solo_verificar sin pin → PIN_REQUERIDO (nunca deja pasar)', r.codigo_error === 'PIN_REQUERIDO' && !r._valido);

// 8 lo de antes
r = correr({ odoo: [], sd: {}, body: { pin: '4821' } });
ok('empleado no existe → EMPLEADO_NO_EXISTE', r.codigo_error === 'EMPLEADO_NO_EXISTE');
r = correr({ odoo: [emp({ active: false })], sd: {}, body: { pin: '4821' } });
ok('inactivo → EMPLEADO_INACTIVO', r.codigo_error === 'EMPLEADO_INACTIVO');

// 9 falla cerrado
r = correr({ odoo: [emp()], sd: null, body: { pin: '4821' } });
ok('sin staticData + pin → PIN_ERROR_SERVIDOR (cerrado)', r.codigo_error === 'PIN_ERROR_SERVIDOR' && !r._valido);
r = correr({ odoo: [emp()], sd: null });
ok('sin staticData + sin pin → sigue (tolerante)', r._valido === true);

// 10 estricto
const EST = CODE.replace("const PIN_MODO = 'tolerante';", "const PIN_MODO = 'estricto';");
ok('el interruptor existe una sola vez', CODE.split("const PIN_MODO = 'tolerante';").length === 2);
r = correr({ code: EST, odoo: [emp()], sd: {} });
ok('estricto sin pin → PIN_REQUERIDO', r.codigo_error === 'PIN_REQUERIDO' && !r._valido);
r = correr({ code: EST, odoo: [emp()], sd: {}, body: { pin: '4821' } });
ok('estricto con pin bueno → entra', r._valido === true);

// 11 respuesta de error: lista blanca, sin PIN
const RE = fs.readFileSync(path.join(__dirname, 'respuesta-error.js'), 'utf8');
const resp = new Function('$input', RE)({ first: () => ({ json: Object.assign({ pin: '4821', odoo_employee_data: { pin: '4821' } }, correr({ odoo: [emp()], sd: {}, body: { pin: '1' } })) }) })[0].json;
ok('Respuesta Error no trae el PIN aunque venga en la entrada', sinFuga(resp) && resp.codigo_error === 'PIN_INCORRECTO' && resp.intentos_restantes === 4);

console.log(`\n${pasan} pasan, ${fallan} fallan`);
process.exit(fallan ? 1 : 0);
