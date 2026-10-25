// tests/kiosko-blindaje/aleatorio.js
//
// Generador de semanas aleatorias y un empleado "razonable" que usa los botones
// que el kiosko le ofrece para lograr lo que de verdad hizo (llegar a tal hora,
// salir a tal otra). Se inyectan fallas de red y de Odoo, olvidos, confusión AM/PM
// y la intervención diaria de RH. Todo es determinista dada la semilla.

'use strict';

const { Sistema, cst, diaCst, hhmmDe, H, MIN, DIA } = require('./sistema');
const { Monitor } = require('./monitor');

function prng(seed) {             // mulberry32
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const DIAS = [14, 15, 16, 17, 18, 21, 22];   // septiembre 2026, días hábiles

function generar(seed, empleados) {
  const r = prng(seed);
  const ev = [];
  const verdad = {};
  for (const emp of empleados) {
    let salidaAnterior = null;
    for (const d of DIAS) {
      const llegada = cst(2026, 9, d, 6, 30) + Math.floor(r() * 70) * MIN;
      const salida = cst(2026, 9, d, 16, 30) + Math.floor(r() * 90) * MIN;
      verdad[emp + '|' + d] = { llegada, salida };
      if (r() < 0.15) ev.push({ tipo: 'falla', t: llegada - MIN, fallas: { redCaida: 3 } });
      if (r() < 0.12) ev.push({ tipo: 'falla', t: llegada - MIN, fallas: { lecturaOdoo: r() < 0.5 ? 1 : 3 } });
      if (r() < 0.10) ev.push({ tipo: 'falla', t: llegada - MIN, fallas: { lento: 1 } });
      const tarde = r() < 0.15;
      ev.push({ tipo: 'entrar', emp, t: tarde ? llegada + (60 + Math.floor(r() * 140)) * MIN : llegada,
                real: llegada, salidaAnterior, amPm: r() < 0.3 });
      const olvida = r() < 0.2;
      if (!olvida) {
        if (r() < 0.1) ev.push({ tipo: 'falla', t: salida - MIN, fallas: { redCaida: 3 } });
        ev.push({ tipo: 'salir', emp, t: salida });
      }
      salidaAnterior = salida;
      ev.push({ tipo: 'rh', t: cst(2026, 9, d, 11, 0) });
      ev.push({ tipo: 'rh', t: cst(2026, 9, d, 18, 30) });
      ev.push({ tipo: 'watchdog', t: cst(2026, 9, d, 8, 0) });
      ev.push({ tipo: 'bloqueo?', emp, t: cst(2026, 9, d, 12, 0) });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { ev, verdad };
}

// ─── el empleado razonable ─────────────────────────────────────────────────
function entrar(m, e) {
  const sim = m.sim;
  let t = e.t, intentosError = 0;
  for (let i = 0; i < 5; i++) {
    const est = sim.estado(e.emp, t);
    let paso = null;
    if (est.estado === 'sin_registro') {
      paso = (t - e.real > 15 * MIN)
        ? { boton: 'olvide_entrada', args: { hora: e.real } }
        : { boton: 'entrada' };
    } else if (est.estado === 'activo') {
      const ab = est.abierto;
      if (diaCst(ab.check_in) === diaCst(t)) {
        if (ab.check_in <= e.real + 15 * MIN) return;                       // ya está dentro
        if (ab.disputa) return;                                              // ya pidió la corrección
        paso = est.botones.includes('corregir_entrada')
          ? { boton: 'corregir_entrada', args: { hora: e.real } }
          : { boton: 'salida' };                                             // el baile: salir para poder declarar
      } else paso = { boton: 'salida' };
    } else if (est.estado === 'zona_gris' || est.estado === 'error_critico') {
      if (est.botones.includes('olvide_salida') && e.salidaAnterior && !e._declarada) {
        e._declarada = true;
        let hh = hhmmDe(e.salidaAnterior);
        if (e.amPm) { const h = Number(hh.slice(0, 2)); if (h >= 13) hh = String(h - 12).padStart(2, '0') + hh.slice(2); }
        paso = { boton: 'olvide_salida', args: { tecleada: hh } };
      } else if (est.botones.includes('resolver')) paso = { boton: 'resolver', args: { hora_real: e.real } };
      else if (est.botones.includes('segui_en_turno')) paso = { boton: 'segui_en_turno' };
    }
    if (!paso) return;
    const { res } = m.paso({ tipo: 'accion', emp: e.emp, t, boton: paso.boton, args: paso.args, desc: 'entrar: ' + paso.boton });
    t += 2 * MIN;
    if (res && res.pantalla === 'error' && !res.validacion) { if (++intentosError >= 2) return; }
    if (res && res.pantalla === 'exito' && ['entrada', 'olvide_entrada', 'corregir_entrada'].includes(paso.boton)) return;
    if (res && res.pantalla === 'exito' && paso.boton === 'resolver' && !e._corregir) { e._corregir = true; continue; }
    if (res && res.pantalla === 'exito' && paso.boton === 'resolver') return;
  }
}

function salir(m, e) {
  const est = m.sim.estado(e.emp, e.t);
  if (est.estado === 'activo') return m.paso({ tipo: 'accion', emp: e.emp, t: e.t, boton: 'salida', desc: 'salir' });
  if (est.estado === 'zona_gris') return m.paso({ tipo: 'accion', emp: e.emp, t: e.t, boton: 'segui_en_turno', desc: 'salir (zona gris)' });
}

// RH resuelve lo pendiente con la hora verdadera. Con B8 también repara bloqueos.
function rh(m, e, verdad) {
  const sim = m.sim;
  for (const inc of sim.incidencias.filter(i => /pendiente/.test(i.status))) {
    const d = new Date(diaCst(inc.base)).getUTCDate();
    const v = verdad[inc.emp + '|' + d];
    if (inc.tipo === 'bloqueo') {
      if (!sim.d.B8) continue;
      const regs = sim.odoo.del(inc.emp).sort((a, b) => a.check_in - b.check_in);
      for (const r of regs.filter(x => x.check_out != null && x.check_out - x.check_in < 5 * MIN)) {
        m.paso({ tipo: 'rh', op: 'reparar', att: r.id, cambios: { borrar: true }, t: e.t, desc: 'RH borra micro registro' });
      }
      const ab = sim.odoo.del(inc.emp).find(x => x.check_out == null);
      if (ab) {
        const vd = verdad[inc.emp + '|' + new Date(diaCst(ab.check_in)).getUTCDate()];
        const sig = sim.odoo.del(inc.emp).filter(x => x.check_in > ab.check_in).sort((a, b) => a.check_in - b.check_in)[0];
        const cierre = Math.min(vd ? vd.salida : ab.check_in + 9.6 * H, sig ? sig.check_in - 1000 : Infinity, e.t);
        m.paso({ tipo: 'rh', op: 'reparar', att: ab.id, cambios: { check_out: cierre }, t: e.t, desc: 'RH cierra el huérfano' });
      }
      inc.status = 'resuelta';
      continue;
    }
    if (!v) continue;
    const hora = inc.tipo === 'olvido_entrada' ? v.llegada : v.salida;
    m.paso({ tipo: 'rh', op: 'resolver', inc: inc.id, accion: 'ajustar', hhmm: hhmmDe(hora), t: e.t, desc: 'RH ajusta ' + inc.tipo });
  }
}

function ejecutar(diseno, esc, empleados) {
  const m = new Monitor(new Sistema(diseno), empleados);
  for (const e of esc.ev) {
    const ec = Object.assign({}, e);
    if (e.tipo === 'falla') m.paso({ tipo: 'falla', fallas: e.fallas, t: e.t, desc: 'falla ' + JSON.stringify(e.fallas) });
    else if (e.tipo === 'entrar') entrar(m, ec);
    else if (e.tipo === 'salir') salir(m, ec);
    else if (e.tipo === 'rh') rh(m, ec, esc.verdad);
    else if (e.tipo === 'watchdog') m.paso({ tipo: 'watchdog', t: e.t, desc: 'watchdog' });
    else if (e.tipo === 'bloqueo?') m.paso({ tipo: 'bloqueo?', emp: e.emp, t: e.t, desc: '¿hay salida?' });
  }
  return m;
}

function firma(v) { return v.inv + (v.quien ? ':' + v.quien : ''); }

// Reduce la lista de eventos quitando uno a la vez mientras siga apareciendo la firma.
function reducir(diseno, esc, empleados, sig) {
  let ev = esc.ev.slice();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (let i = ev.length - 1; i >= 0; i--) {
      const prueba = ev.slice(0, i).concat(ev.slice(i + 1));
      const m = ejecutar(diseno, { ev: prueba, verdad: esc.verdad }, empleados);
      if (m.violaciones.some(v => firma(v) === sig)) { ev = prueba; cambio = true; }
    }
  }
  return { ev, verdad: esc.verdad };
}

module.exports = { generar, ejecutar, reducir, firma, prng };
