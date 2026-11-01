#!/usr/bin/env node
// Fase A (#448): ficha del empleado, banderas, despachador con scopes y la puerta del webhook.
'use strict';
const { check, seccion, fin } = require('./lib/t');
const pg = require('./lib/pg');
const F = require('../../shared/nomina-usa/ficha.js');
const fs = require('fs'), path = require('path');

seccion('Reglas de la ficha (JS)');
check('ficha híbrida por bolsa con SO al entrar es válida', F.validarFicha({ employee_id: 75, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true }).length === 0);
check('USA sin tipo de pago es inválida', F.validarFicha({ employee_id: 1, pais_nomina: 'USA' }).length === 1);
check('México con tipo de pago USA es inválida', F.validarFicha({ employee_id: 1, pais_nomina: 'MX', tipo_pago_usa: 'bolsa_avance' }).length > 0);
check('«Pide SO al entrar» solo con bolsa', F.validarFicha({ employee_id: 98, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'supervisor_comercial', pide_so_entrada: true }).length === 1);
check('hora mal escrita se rechaza', F.validarFicha({ employee_id: 75, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', hora_entrada_ref: '7:3' }).length === 1);
check('perfil: bandera apagada = México (null)', F.perfilKiosko({ kiosko_usa: false, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true }) === null);
check('perfil: Mateo con bandera = so_entrada', F.perfilKiosko({ kiosko_usa: true, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true }) === 'so_entrada');
check('perfil: Ricardo con bandera = plan_avance', F.perfilKiosko({ kiosko_usa: true, pais_nomina: 'HIBRIDO', tipo_pago_usa: 'supervisor_comercial' }) === 'plan_avance');
check('perfil: empleado de México con bandera sigue en México', F.perfilKiosko({ kiosko_usa: true, pais_nomina: 'MX' }) === null);

seccion('Puerta del webhook (Code - Puerta)');
{
  const S = require('../../retardos/lib/sesion.js');
  const sec = 'x'.repeat(40);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (pl) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(pl); return h + '.' + p + '.' + S._b64url(S._hmac(sec, h + '.' + p)); };
  const code = fs.readFileSync(path.join(__dirname, '../../nomina-usa/n8n/code/panel-puerta.js'), 'utf8')
    .replace('/*__SESION__*/', fs.readFileSync(path.join(__dirname, '../../retardos/lib/sesion.js'), 'utf8'));
  const correr = (body) => new Function('$input', '$', code)({ first: () => ({ json: { secreto: sec } }) }, () => ({ first: () => ({ json: { body } }) }))[0].json;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const firmado = (tok, datos) => { const ts = Date.now(), n = 'abcdefghijklmnop1234'; return { token: tok, ts, nonce: n, sig: S.firmar(tok, ts, n, datos), datos }; };
  const tokR = jwt({ sub: 'ricardo', scopes: ['nomina_usa:kiosko', 'comercial:read'], exp });
  const r1 = correr(firmado(tokR, { accion: 'config_ver', scopes: ['nomina_usa:admin'] }));
  check('token válido pasa', r1.ok === true, r1);
  check('las scopes salen del JWT, no del body (no se cuela admin)', r1.ok && JSON.stringify(r1.payload.scopes) === '["nomina_usa:kiosko"]', r1.payload && r1.payload.scopes);
  const tokX = jwt({ sub: 'otro', scopes: ['comercial:read'], exp });
  check('token sin scopes nomina_usa se rechaza', correr(firmado(tokX, { accion: 'config_ver' })).error === 'SCOPE_INSUFICIENTE');
  const malo = firmado(tokR, { accion: 'config_ver' }); malo.datos = { accion: 'config_guardar' };
  check('datos alterados después de firmar se rechazan', correr(malo).error === 'HMAC_INVALIDO');
  check('token con otra firma se rechaza', correr(firmado(tokR.slice(0, -2) + 'xx', { accion: 'x' })).ok === false);
}

seccion('Armado del SDK');
{
  const { armar } = require('../../nomina-usa/n8n/armar.js');
  const sdk = armar('panel');
  check('panel se arma sin marcadores sueltos', !/__PUERTA__|\/\*__SESION__\*\//.test(sdk));
  check('el SDK no trae literales de secreto', !/SUITE_JWT_SECRET\s*[:=]\s*['"][^$]/.test(sdk) && /\$env\.SUITE_JWT_SECRET/.test(sdk));
}

if (!pg.disponible()) { check('Postgres de pruebas disponible (NUSA_PGHOST)', false, 'arranca el clúster local, ver tests/nomina-usa/README.md'); fin(); }
seccion('Esquema nomina_usa (Postgres real)');
const db = pg.crear();
check('todo nace apagado: kiosko_activo=false', db.q("SELECT nomina_usa.cfg('kiosko_activo')") === 'false');
check('todo nace apagado: alertas en sombra', db.q("SELECT nomina_usa.cfg('alertas_modo')") === '"sombra"');
check('las cuatro fichas con bandera apagada', db.q('SELECT count(*) FROM nomina_usa.ficha WHERE NOT kiosko_usa') === '4');
check('ninguna ficha con hora inventada', db.q('SELECT count(*) FROM nomina_usa.ficha WHERE hora_entrada_ref IS NOT NULL') === '0');
let r = db.panel({ accion: 'ficha_guardar', ficha: { employee_id: 75, alias: 'Mateo', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true, kiosko_usa: true } }, ['nomina_usa:validar']);
check('Magaly (validar) no puede editar fichas', r.error === 'SCOPE_INSUFICIENTE', r);
r = db.panel({ accion: 'ficha_guardar', ficha: { employee_id: 98, alias: 'Ricardo', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'supervisor_comercial', pide_so_entrada: true } });
check('la base rechaza «pide SO» para supervisor+comercial', r.ok === false && /ficha_so_ck/.test(r.detalle || ''), r);
r = db.panel({ accion: 'ficha_guardar', ficha: { employee_id: 75, alias: 'Mateo', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true, hora_entrada_ref: '07:00', zona_horaria: 'America/Chicago' }, motivo: 'prueba' });
check('admin guarda la ficha', r.ok === true && r.ficha.hora_entrada_ref === '07:00:00', r);
check('el cambio queda en bitácora', db.q("SELECT count(*) FROM nomina_usa.bitacora WHERE evento='ficha' AND objeto='75'") === '1');
let txt = ''; try { db.q('DELETE FROM nomina_usa.bitacora'); } catch (e) { txt = String(e.stderr || e.message); }
check('la bitácora no se puede borrar', /BITACORA_INMUTABLE/.test(txt), txt.slice(0, 120));
r = db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real' });
check('cambiar bandera sin motivo se rechaza', r.error === 'MOTIVO_REQUERIDO', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'real', motivo: 'x' }, ['nomina_usa:validar']);
check('solo admin cambia banderas', r.error === 'SCOPE_INSUFICIENTE', r);
r = db.panel({ accion: 'config_guardar', clave: 'alertas_modo', valor: 'otro', motivo: 'x' });
check('modo de alertas solo sombra o real', r.error === 'MODO_INVALIDO', r);
const p = { accion: 'config_ver', nonce: 'repetido-123456789', actor: 'x', scopes: ['nomina_usa:kiosko'] };
const uno = db.j("SELECT nomina_usa.panel_seguro($q$" + JSON.stringify(p) + "$q$::jsonb)"), dos = db.j("SELECT nomina_usa.panel_seguro($q$" + JSON.stringify(p) + "$q$::jsonb)");
check('nonce repetido = REPLAY', uno.ok === true && dos.error === 'REPLAY', [uno.ok, dos.error]);
check('acción desconocida se rechaza', db.panel({ accion: 'borrar_todo' }).error === 'ACCION_DESCONOCIDA');
fin();
