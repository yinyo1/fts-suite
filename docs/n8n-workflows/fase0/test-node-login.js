// Corre el CUERPO REAL del nodo (node-suite-login.js) dentro de un contexto
// simulado de n8n. No es una reimplementacion: se lee el archivo y se envuelve
// en una funcion, que es exactamente lo que hace el Code node.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { verifyJWT } = require('./jwt-verify.js');

const CUERPO = fs.readFileSync(path.join(__dirname, 'node-suite-login.js'), 'utf8');

let ok = 0, fail = 0;
function chk(n, c, extra) {
  if (c) { ok++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLA ' + n + (extra ? '\n        ' + extra : '')); }
}

const SECRET = crypto.randomBytes(32).toString('hex');
const PASS = 'Contrasena-Real-De-Prueba-2026';
const SALT = crypto.randomBytes(16).toString('hex');
const HASH = crypto.pbkdf2Sync(PASS, SALT, 100000, 32, 'sha256').toString('hex');

const FILA_ANA = { username: 'ana.acevedo', nombre: 'Ana Laura Acevedo', salt: SALT, hash: HASH,
                   scopes: 'nomina:write,rh:read', activo: true, empleado_id: 101,
                   debe_cambiar_password: true };

function correr(inp, filas, secret, staticData) {
  const ctx = {
    'Code - Validar payload': { item: { json: inp } },
    'Set - secreto': { item: { json: { secret: secret } } }
  };
  const $ = function (nombre) { return ctx[nombre]; };
  const $input = { all: function () { return filas.map(function (f) { return { json: f }; }); } };
  const $getWorkflowStaticData = function () { return staticData; };
  const fn = new Function('$', '$input', '$getWorkflowStaticData', CUERPO);
  return fn($, $input, $getWorkflowStaticData)[0].json;
}

console.log('\n-- login correcto --');
let sd = {};
let r = correr({ username: 'ana.acevedo', password: PASS }, [FILA_ANA], SECRET, sd);
chk('ok:true', r.ok === true, JSON.stringify(r).slice(0, 200));
chk('trae token', typeof r.token === 'string' && r.token.split('.').length === 3);
chk('actor y empleado_id correctos', r.actor === 'ana.acevedo' && r.empleado_id === 101);
chk('scopes parseados a array', Array.isArray(r.scopes) && r.scopes.length === 2 && r.scopes[0] === 'nomina:write');
chk('propaga debe_cambiar_password', r.debe_cambiar_password === true);

console.log('\n-- el token emitido lo acepta el verificador --');
const v = verifyJWT(r.token, SECRET, 'nomina:write');
chk('verifyJWT lo acepta con nomina:write', v.ok === true && v.actor === 'ana.acevedo');
chk('el MISMO token NO alcanza para rh:write', verifyJWT(r.token, SECRET, 'rh:write').error === 'SCOPE_INSUFICIENTE');
chk('con otro secreto -> FIRMA_INVALIDA', verifyJWT(r.token, crypto.randomBytes(32).toString('hex'), 'nomina:write').error === 'FIRMA_INVALIDA');
chk('exp a 8 horas', r.exp - Math.floor(Date.now() / 1000) > 28700);

console.log('\n-- casos negativos: TODOS deben dar el mismo mensaje --');
const msgs = new Set();
sd = {};
r = correr({ username: 'ana.acevedo', password: PASS + 'x' }, [FILA_ANA], SECRET, sd);
chk('contrasena mala -> CREDENCIALES_INVALIDAS', r.ok === false && r.error === 'CREDENCIALES_INVALIDAS'); msgs.add(r.mensaje);
sd = {};
r = correr({ username: 'no.existe', password: PASS }, [FILA_ANA], SECRET, sd);
chk('usuario inexistente -> CREDENCIALES_INVALIDAS', r.error === 'CREDENCIALES_INVALIDAS'); msgs.add(r.mensaje);
sd = {};
r = correr({ username: 'ana.acevedo', password: PASS }, [Object.assign({}, FILA_ANA, { activo: false })], SECRET, sd);
chk('usuario inactivo -> CREDENCIALES_INVALIDAS', r.error === 'CREDENCIALES_INVALIDAS'); msgs.add(r.mensaje);
chk('los 3 dan mensaje IDENTICO (no enumera usuarios)', msgs.size === 1, 'mensajes distintos: ' + JSON.stringify([...msgs]));

console.log('\n-- secreto ausente: falla ruidosa, no token --');
sd = {};
r = correr({ username: 'ana.acevedo', password: PASS }, [FILA_ANA], '', sd);
chk('sin secreto -> SECRETO_NO_CONFIGURADO', r.error === 'SECRETO_NO_CONFIGURADO');
chk('sin secreto NO emite token', !r.token);
sd = {};
r = correr({ username: 'ana.acevedo', password: PASS }, [FILA_ANA], 'corto', sd);
chk('secreto corto tambien se rechaza', r.error === 'SECRETO_NO_CONFIGURADO');

console.log('\n-- lockout 5 -> 15 min --');
sd = {};
for (let i = 1; i <= 4; i++) {
  r = correr({ username: 'ana.acevedo', password: 'mala' }, [FILA_ANA], SECRET, sd);
  if (i === 4) chk('intento 4 sigue en CREDENCIALES_INVALIDAS', r.error === 'CREDENCIALES_INVALIDAS');
}
r = correr({ username: 'ana.acevedo', password: 'mala' }, [FILA_ANA], SECRET, sd);
chk('intento 5 arma el bloqueo', r.error === 'CREDENCIALES_INVALIDAS');
r = correr({ username: 'ana.acevedo', password: PASS }, [FILA_ANA], SECRET, sd);
chk('intento 6 con la contrasena BUENA -> BLOQUEADO', r.error === 'BLOQUEADO', JSON.stringify(r));
chk('el bloqueo dice cuantos minutos faltan', /minuto/.test(r.mensaje || ''));

console.log('\n-- el bloqueo es POR USUARIO, no global --');
const FILA_MAG = Object.assign({}, FILA_ANA, { username: 'magaly.perez', empleado_id: 63 });
r = correr({ username: 'magaly.perez', password: PASS }, [FILA_ANA, FILA_MAG], SECRET, sd);
chk('magaly entra aunque ana este bloqueada', r.ok === true && r.actor === 'magaly.perez');

console.log('\n-- el login exitoso limpia el contador --');
sd = {};
correr({ username: 'ana.acevedo', password: 'mala' }, [FILA_ANA], SECRET, sd);
correr({ username: 'ana.acevedo', password: 'mala' }, [FILA_ANA], SECRET, sd);
correr({ username: 'ana.acevedo', password: PASS }, [FILA_ANA], SECRET, sd);
chk('tras exito, el usuario sale de sd.intentos', !sd.intentos['ana.acevedo']);

console.log('\n' + (fail === 0 ? 'TODO EN VERDE' : '*** ' + fail + ' FALLAS ***') + '  —  ' + ok + '/' + (ok + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);
