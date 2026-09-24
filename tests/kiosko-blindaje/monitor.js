// tests/kiosko-blindaje/monitor.js
//
// Ejecuta pasos sobre el modelo y revisa las invariantes después de cada uno.
// Un paso es una acción del empleado, una acción de RH, una falla inyectada o una
// corrida del watchdog.

'use strict';

const inv = require('./invariantes');
const { fmtCst } = require('./sistema');

class Monitor {
  constructor(sim, empleados) {
    this.sim = sim; this.empleados = empleados;
    this.violaciones = []; this.pasos = [];
  }

  paso(p) {
    const sim = this.sim;
    const bit0 = sim.bitacora.length, al0 = sim.alertas.length, ej0 = sim.ejecuciones.length, log0 = sim.odoo.log.length;
    let res = null, v = [];
    switch (p.tipo) {
      case 'falla': Object.keys(p.fallas).forEach(k => { sim.fallas[k] += p.fallas[k]; }); break;
      case 'accion': {
        const est = sim.estado(p.emp, p.t);
        let boton = p.boton;
        if (!est.botones.includes(boton) && p.alt && est.botones.includes(p.alt)) boton = p.alt;
        if (!est.botones.includes(boton)) { res = { omitido: true, estado: est.estado, botones: est.botones }; break; }
        res = sim.accion(p.emp, boton, p.t, p.args);
        v = v.concat(inv.i2i3(sim, res, p.emp, p.t, bit0, al0), inv.i7(res));
        break;
      }
      case 'rh': {
        try {
          if (p.op === 'resolver') {
            let id = p.inc;
            if (id && id[0] === '@') {
              const tipo = id.slice(1) === 'auto_cierre' ? 'auto_cierre_pendiente' : id.slice(1);
              const c = sim.incidencias.filter(i => i.tipo === tipo && /pendiente/.test(i.status)).slice(-1)[0];
              if (!c) { res = { omitido: true, motivo: 'sin incidencia pendiente ' + tipo }; break; }
              id = c.id;
            }
            res = sim.resolver(id, p.accion, p.hhmm, p.t, p.opts); v = v.concat(inv.i6(sim, res));
          }
          else res = sim.reparar(p.att, p.cambios, p.t);
        } catch (e) { res = { error: e.message }; }
        break;
      }
      case 'watchdog': res = sim.watchdog(this.empleados, p.t); v = v.concat(inv.i9(sim, res, p.t, this.empleados)); break;
      case 'bloqueo?': v = v.concat(inv.i4(sim, p.emp, p.t)); break;
      default: throw new Error('paso desconocido ' + p.tipo);
    }
    const tocados = new Set(sim.odoo.log.slice(log0).filter(x => x.id && !x.error).map(x => x.id));
    for (const e of this.empleados) v = v.concat(inv.i1(sim, e), inv.i8(sim, e, tocados));
    v = v.concat(inv.i5(sim, ej0));
    // Deduplicar I1 persistente: solo reportar la primera vez que aparece.
    v = v.filter(x => !(x.inv === 'I1' && this.violaciones.some(y => y.inv === 'I1' && y.msg === x.msg)));
    v.forEach(x => { x.paso = this.pasos.length; x.t = p.t; });
    this.violaciones.push(...v);
    this.pasos.push({ p, res, v });
    return { res, v };
  }

  correr(pasos) { pasos.forEach(p => this.paso(p)); return this; }

  resumen() {
    const porInv = {};
    this.violaciones.forEach(v => { porInv[v.inv] = (porInv[v.inv] || 0) + 1; });
    return porInv;
  }

  narrar() {
    return this.pasos.map((x, i) => {
      const p = x.p;
      let d = '#' + i + ' ' + (p.t ? fmtCst(p.t) : '') + ' ' + (p.desc || p.tipo);
      if (x.res && x.res.pantalla) d += ' -> pantalla ' + x.res.pantalla + (x.res.logrado ? ' (Odoo: sí)' : ' (Odoo: no)');
      if (x.res && x.res.panel) d += ' -> panel ' + x.res.panel;
      if (x.res && x.res.omitido) d += ' -> OMITIDO (' + x.res.estado + ')';
      if (x.v.length) d += '\n      ✗ ' + x.v.map(v => v.inv + ': ' + v.msg).join('\n      ✗ ');
      return d;
    }).join('\n');
  }
}

module.exports = { Monitor };
