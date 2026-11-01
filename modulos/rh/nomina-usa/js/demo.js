/* ═══ RH · Nómina USA · modo práctica (#448) ═══
 * Copia en memoria de lo que hace el esquema nomina_usa, para practicar y para las
 * capturas. Los candados salen de la MISMA librería (shared/nomina-usa/*.js) que
 * usan las pruebas; la defensa real vive en SQL. Nunca toca el servidor.
 * Las personas se nombran por alias; los números de empleado son los de Odoo.
 */
(function (G) {
  'use strict';
  var A = G.NusaApi, NU = G.NominaUSA;
  var S = G.NusaDemoEstado = {
    config: { kiosko_activo: false, alertas_modo: 'sombra', entrada_tolerancia_min: 15, salida_faltante_horas: 14,
              tope_excepcion_puntos: 10, tope_contra_plan_puntos: 20, tarifa_comercial_usd: 140 },
    fichas: [
      { employee_id: 75, alias: 'Mateo', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true, kiosko_usa: false, jefe_employee_id: 112, hora_entrada_ref: null, zona_horaria: null, fijo_semanal_usd: null, activo: true },
      { employee_id: 79, alias: 'José Luis', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'bolsa_avance', pide_so_entrada: true, kiosko_usa: false, jefe_employee_id: 112, hora_entrada_ref: null, zona_horaria: null, fijo_semanal_usd: null, activo: true },
      { employee_id: 98, alias: 'Ricardo', pais_nomina: 'HIBRIDO', tipo_pago_usa: 'supervisor_comercial', pide_so_entrada: false, kiosko_usa: false, jefe_employee_id: 32, hora_entrada_ref: null, zona_horaria: null, fijo_semanal_usd: null, activo: true },
      { employee_id: 97, alias: 'Rissia', pais_nomina: 'USA', tipo_pago_usa: 'fijo_asistencia', pide_so_entrada: false, kiosko_usa: false, jefe_employee_id: 32, hora_entrada_ref: null, zona_horaria: null, fijo_semanal_usd: null, activo: true }
    ],
    bitacora: []
  };
  function log(actor, evento, objeto, antes, despues, motivo) {
    S.bitacora.unshift({ id: S.bitacora.length + 1, creado_at: new Date().toISOString(), actor: actor, evento: evento, objeto: objeto, antes: antes, despues: despues, motivo: motivo || null });
  }
  function puede(quien, scopes) {
    return quien.scopes.indexOf('nomina_usa:admin') >= 0 || scopes.some(function (s) { return quien.scopes.indexOf(s) >= 0; });
  }
  // Registra un handler con el mismo candado de scope que nomina_usa.accion.
  function reg(accion, scopes, fn) {
    A.registrar(accion, function (p, quien) {
      if (!puede(quien, scopes)) return { ok: false, error: 'SCOPE_INSUFICIENTE', pide: scopes };
      return fn(p, quien);
    });
  }
  G.NusaDemo = { reg: reg, log: log, estado: S };

  var TODOS = ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'];
  reg('config_ver', TODOS, function () { return { ok: true, config: JSON.parse(JSON.stringify(S.config)) }; });
  reg('config_guardar', ['nomina_usa:admin'], function (p, q) {
    if (!(p.clave in S.config)) return { ok: false, error: 'CLAVE_DESCONOCIDA' };
    if (p.clave === 'alertas_modo' && ['sombra', 'real'].indexOf(p.valor) < 0) return { ok: false, error: 'MODO_INVALIDO' };
    if (!String(p.motivo || '').trim()) return { ok: false, error: 'MOTIVO_REQUERIDO' };
    var antes = S.config[p.clave]; S.config[p.clave] = p.valor;
    log(q.actor, 'config', p.clave, antes, p.valor, p.motivo);
    return { ok: true, clave: p.clave, antes: antes, despues: p.valor };
  });
  reg('ficha_listar', ['nomina_usa:validar', 'nomina_usa:autorizar'], function () { return { ok: true, fichas: JSON.parse(JSON.stringify(S.fichas)) }; });
  reg('ficha_guardar', ['nomina_usa:admin'], function (p, q) {
    var f = p.ficha || {}, err = NU.ficha.validarFicha(f);
    if (err.length) return { ok: false, error: 'FICHA_INVALIDA', detalle: err.join(' ') };
    var i = S.fichas.findIndex(function (x) { return x.employee_id === Number(f.employee_id); });
    var antes = i >= 0 ? S.fichas[i] : null;
    var nueva = Object.assign({}, antes || {}, f, { employee_id: Number(f.employee_id) });
    if (i >= 0) S.fichas[i] = nueva; else S.fichas.push(nueva);
    log(q.actor, 'ficha', String(nueva.employee_id), antes, nueva, p.motivo);
    return { ok: true, ficha: nueva };
  });
  reg('bitacora', ['nomina_usa:validar', 'nomina_usa:autorizar'], function () { return { ok: true, bitacora: S.bitacora.slice(0, 200) }; });
})(window);
