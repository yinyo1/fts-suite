// tests/kiosko-blindaje/invariantes.js
//
// Las reglas que el sistema nunca debe romper, como funciones que miran el estado
// del modelo (y el resultado del último paso) y devuelven la lista de violaciones.
// Ver docs/kiosko/blindaje/invariantes.md para el porqué y la capa de cada una.

'use strict';

const { H, MIN } = require('./sistema');

const INVARIANTES = {
  I1: 'Máximo un registro abierto por empleado y ningún registro traslapado',
  I2: 'La pantalla dice lo mismo que Odoo (éxito solo con escritura confirmada; error solo sin escritura)',
  I3: 'Toda falla del sistema es visible, queda en bitácora y alerta al supervisor',
  I4: 'Todo bloqueo tiene salida para el empleado y otra para supervisor o RH, sin backend',
  I5: 'Si Odoo no responde, el sistema no asume nada (no escribe tras una lectura fallida)',
  I6: 'Un ajuste de RH queda en Odoo, o la pantalla dice que no se aplicó',
  I7: 'Lo que la pantalla ofrece, el servidor lo acepta por regla (umbrales y búsqueda coherentes)',
  I8: 'Ningún registro de más de 16 h sin TAG de disputa',
  I9: 'El watchdog distingue bloqueados de ausentes'
};

// I1: sobre todo el estado de Odoo.
function i1(sim, emp) {
  const v = [];
  const regs = sim.odoo.del(emp).sort((a, b) => a.check_in - b.check_in);
  const abiertos = regs.filter(r => r.check_out == null);
  if (abiertos.length > 1) v.push({ inv: 'I1', msg: 'dos abiertos: ' + abiertos.map(r => r.id).join(', ') });
  for (let i = 0; i < regs.length; i++) {
    for (let j = i + 1; j < regs.length; j++) {
      const a = regs[i], b = regs[j];
      const finA = a.check_out == null ? Infinity : a.check_out;
      if (b.check_in < finA) v.push({ inv: 'I1', msg: 'traslape ' + a.id + ' envuelve/cruza ' + b.id });
    }
  }
  return v;
}

// I2 e I3: sobre el resultado de una acción del empleado.
function i2i3(sim, res, emp, t, bitacoraAntes, alertasAntes) {
  const v = [];
  if (res.validacion) return v;   // rechazo de validación del formulario: no es falla del sistema
  if (res.pantalla === 'exito' && !res.logrado) v.push({ inv: 'I2', msg: 'pantalla de éxito sin escritura en Odoo (' + res.boton + ')' });
  if (res.pantalla === 'error' && res.logrado) v.push({ inv: 'I2', msg: 'pantalla de error con escritura en Odoo (' + res.boton + ')' });
  const fallaSistema = !res.logrado && !(res.respuesta && ['YA_TIENES_ENTRADA', 'ZONA_GRIS', 'NO_HAY_ENTRADA', 'DECLARA_SALIDA'].includes(res.respuesta.codigo_error));
  if (fallaSistema) {
    if (res.pantalla !== 'error') v.push({ inv: 'I3', msg: 'falla invisible para el empleado (' + res.boton + ')' });
    if (sim.bitacora.length === bitacoraAntes) v.push({ inv: 'I3', msg: 'falla sin bitácora (' + res.boton + ')' });
    const alertaReciente = sim.alertas.some(a => a.emp === emp && t - a.t <= H);
    if (!alertaReciente) v.push({ inv: 'I3', msg: 'falla sin alerta al supervisor (' + res.boton + ')' });
  }
  return v;
}

// I5: ninguna ejecución escribió después de una lectura fallida.
function i5(sim, ejecAntes) {
  return sim.ejecuciones.slice(ejecAntes).filter(e => e.escribioTrasLecturaFallida)
    .map(e => ({ inv: 'I5', msg: 'escritura tras lectura fallida (' + e.tipo + ' ' + new Date(e.t).toISOString() + ')' }));
}

// I6: sobre el resultado de resolver().
function i6(sim, res) {
  const v = [];
  if (res.panel === 'aplicada' && res.horaPedida) {
    const r = sim.odoo.leer(res.att);
    if (!r || res.valor == null || r[res.campo] !== res.valor) {
      v.push({ inv: 'I6', msg: 'panel dice "aplicada" pero Odoo no tiene la hora de RH (' + res.horaPedida + ' en ' + res.campo + ' de ' + res.att + ')' });
    }
  }
  return v;
}

// I7: botón ofrecido rechazado por una regla de umbral o de búsqueda.
function i7(res) {
  if (res.respuesta && ['YA_TIENES_ENTRADA', 'ZONA_GRIS', 'NO_HAY_ENTRADA'].includes(res.respuesta.codigo_error)) {
    return [{ inv: 'I7', msg: 'el kiosko ofreció "' + res.boton + '" en ' + res.estadoAntes + ' y el servidor lo rechazó por regla: ' + res.respuesta.codigo_error }];
  }
  if (res.respuesta === null && res.detalleOdoo && /hasn't checked out/.test(res.detalleOdoo)) {
    return [{ inv: 'I7', msg: 'el kiosko no ve un abierto que Odoo sí ve' }];
  }
  return [];
}

// I8: registros de más de 16 h sin disputa, tocados en este paso.
function i8(sim, emp, idsTocados) {
  return sim.odoo.del(emp).filter(r => idsTocados.has(r.id) && r.check_out != null &&
      r.check_out - r.check_in > 16 * H && !r.disputa)
    .map(r => ({ inv: 'I8', msg: 'registro ' + r.id + ' de ' + ((r.check_out - r.check_in) / H).toFixed(1) + ' h sin disputa' }));
}

// I9: sobre el reporte del watchdog.
function i9(sim, reporte, now, empleados) {
  const v = [];
  for (const emp of empleados) {
    const fallasReales = sim.intentos.filter(x => x.emp === emp && !x.logrado && !x.validacion && now - x.t < 7 * 24 * H);
    const r = reporte.find(x => x.emp === emp);
    if (r && r.tipo === 'ausente' && fallasReales.length > 0) v.push({ inv: 'I9', msg: 'reportado ausente con ' + fallasReales.length + ' intentos fallidos' });
    const hoy = fallasReales.filter(x => now - x.t < 24 * H);
    if (hoy.length >= 2 && !(r && r.tipo === 'bloqueado')) v.push({ inv: 'I9', msg: hoy.length + ' intentos fallidos en 24 h y el watchdog no lo marca' });
  }
  return v;
}

// ─── I4: búsqueda de salida ────────────────────────────────────────────────
// ¿Existe una secuencia corta de acciones disponibles en la suite que termine con
// una entrada nueva registrada? Se prueba por separado para el empleado (solo
// botones del kiosko) y para supervisor/RH (resolver sobre incidencias abiertas y,
// con B8, reparar registro). Sin fallas de red ni de Odoo durante la búsqueda.

function accionesEmpleado(sim, emp, t) {
  const est = sim.estado(emp, t);
  const out = [];
  for (const b of est.botones) {
    if (b === 'olvide_salida') {
      const ci = est.abierto.check_in;
      const cand = Math.min(ci + 9.6 * H, t - MIN);
      out.push({ b, args: { tecleada: hhmm(cand) } });
    } else if (b === 'olvide_entrada' || b === 'corregir_entrada') out.push({ b, args: { hora: t - 5 * MIN } });
    else if (b === 'resolver') out.push({ b, args: { hora_real: t - 5 * MIN } });
    else out.push({ b, args: {} });
  }
  return out;
}

function accionesRH(sim, emp, t) {
  const out = [];
  for (const inc of sim.incidencias.filter(i => i.emp === emp && /pendiente/.test(i.status) && i.tipo !== 'bloqueo')) {
    const base = inc.declarada || (inc.base + 9.6 * H);
    out.push({ rh: 'resolver', inc: inc.id, accion: 'ajustar', hhmm: hhmm(base), absorber: true });
  }
  if (sim.d.B8) {
    const regs = sim.odoo.del(emp).sort((a, b) => a.check_in - b.check_in);
    for (const r of regs) {
      if (r.check_out != null && r.check_out - r.check_in < 5 * MIN) out.push({ rh: 'reparar', att: r.id, cambios: { borrar: true } });
      if (r.check_out == null) {
        const sig = regs.find(o => o.check_in > r.check_in);
        const cierre = Math.min(r.check_in + 9.6 * H, sig ? sig.check_in - 1000 : Infinity, t - MIN);
        out.push({ rh: 'reparar', att: r.id, cambios: { check_out: cierre } });
      }
    }
  }
  return out;
}

function hhmm(ms) { const d = new Date(ms - 6 * H); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }

function aplicar(sim, emp, t, a) {
  try {
    if (a.b) return sim.accion(emp, a.b, t, a.args);
    if (a.rh === 'resolver') return sim.resolver(a.inc, a.accion, a.hhmm, t, { absorber: a.absorber });
    if (a.rh === 'reparar') return sim.reparar(a.att, a.cambios, t);
  } catch (e) { return { error: e.message }; }
}

function entradaLograda(sim, emp, t) {
  const est = sim.estado(emp, t);
  for (const b of ['entrada', 'resolver']) {
    if (!est.botones.includes(b)) continue;
    const s = sim.clonar(); s.fallas = { redCaida: 0, lecturaOdoo: 0, lecturaRapida: 0, lento: 0 }; s.saturadoHasta = 0;
    const r = s.accion(emp, b, t, { hora_real: t });
    if (r.logrado) return true;
  }
  return false;
}

function haySalida(sim, emp, t, quien, profundidad) {
  if (entradaLograda(sim, emp, t)) return true;
  if (profundidad === 0) return false;
  const opciones = quien === 'empleado' ? accionesEmpleado(sim, emp, t) : accionesRH(sim, emp, t).concat(accionesEmpleado(sim, emp, t));
  for (const a of opciones) {
    const s = sim.clonar(); s.fallas = { redCaida: 0, lecturaOdoo: 0, lecturaRapida: 0, lento: 0 }; s.saturadoHasta = 0;
    const r = aplicar(s, emp, t, a);
    if (!r || r.error) continue;
    if (haySalida(s, emp, t + 2 * MIN, quien, profundidad - 1)) return true;
  }
  return false;
}

function i4(sim, emp, t) {
  const v = [];
  // Solo tiene sentido si el empleado está trabado: tiene un abierto de 16 h o más, o
  // ya no puede registrar entrada con los botones que tiene.
  if (entradaLograda(sim, emp, t)) return v;
  // Para el empleado cuenta como salida registrar una entrada o, con B7, levantar una
  // emergencia que queda persistida para RH y el supervisor.
  const puedeAvisar = sim.estado(emp, t).botones.includes('emergencia');
  if (!puedeAvisar && !haySalida(sim, emp, t, 'empleado', 2)) v.push({ inv: 'I4', quien: 'empleado', msg: 'sin salida para el EMPLEADO desde la suite' });
  if (!haySalida(sim, emp, t, 'rh', 2)) v.push({ inv: 'I4', quien: 'rh', msg: 'sin salida para SUPERVISOR/RH desde la suite' });
  return v;
}

module.exports = { INVARIANTES, i1, i2i3, i4, i5, i6, i7, i8, i9 };
