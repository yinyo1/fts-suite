// tests/kiosko-blindaje/odoo-modelo.js
//
// Modelo en memoria de hr.attendance y de su validación nativa (_check_validity).
//
// NO es código de Odoo. Es la regla DEDUCIDA de los mensajes de error que
// devolvió producción, completada con la lógica pública de Odoo 17 para la rama
// que ninguna ejecución observó. Cada rama dice de dónde sale:
//
//   A  "already checked in on <X>"  por el registro ANTERIOR que sigue abierto
//      sobre mi check_in.                          NO OBSERVADA (lógica de Odoo 17)
//   B  "hasn't checked out since <X>" si YO quedo abierto y hay OTRO abierto.
//                                                  OBSERVADA: exec 104284, nodo
//                                                  "Odoo - CREATE Entrada"
//   C  "already checked in on <X>" si el último registro que empieza antes de
//      mi check_out no es el mismo que empieza antes de mi check_in.
//                                                  OBSERVADA: exec 105451 y 15 más,
//                                                  X = check_in de 15588
//
// Consecuencia clave (hecho 4 del caso): un registro ABIERTO solo se compara
// contra el anterior (A) y contra otros abiertos (B). Nadie mira hacia adelante,
// así que mover el check_in de un abierto por encima de registros posteriores
// PASA (resolver 104773), y el traslape solo aparece al intentar cerrarlo (C).

'use strict';

const H = 3600 * 1000;

// Fecha/hora CST (UTC-6, sin horario de verano) -> ms UTC.
function cst(y, m, d, hh, mi, ss) {
  return Date.UTC(y, m - 1, d, hh + 6, mi || 0, ss || 0);
}
// ms UTC -> 'MM/DD/YYYY HH:MM:SS AM' en CST, igual que el texto de Odoo.
function fmtOdoo(ms) {
  const d = new Date(ms - 6 * H);
  const p = n => String(n).padStart(2, '0');
  let h = d.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
  return p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate()) + '/' + d.getUTCFullYear() + ' ' +
         p(h) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' ' + ap;
}
function fmtCst(ms) {
  const d = new Date(ms - 6 * H);
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
         p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + ' CST';
}

class OdooError extends Error {
  constructor(msg, rama) { super(msg); this.name = 'ValidationError'; this.rama = rama; }
}

class OdooModelo {
  constructor() { this.regs = new Map(); this.sig = 100; this.log = []; this.forzados = []; this.validaAdelante = false; }

  clonar() {
    const o = new OdooModelo();
    for (const [k, v] of this.regs) o.regs.set(k, Object.assign({}, v));
    o.sig = this.sig; o.log = this.log.slice(); o.forzados = this.forzados.slice(); o.validaAdelante = this.validaAdelante;
    return o;
  }

  del(emp) { return [...this.regs.values()].filter(r => r.emp === emp); }
  leer(id) { const r = this.regs.get(id); return r ? Object.assign({}, r) : null; }

  // _check_validity deducida. Devuelve null o el OdooError que Odoo lanzaría.
  validar(rec) {
    if (rec.check_out != null && rec.check_out < rec.check_in) {
      return new OdooError('"Check Out" time cannot be earlier than "Check In" time.', 'orden');
    }
    const otros = this.del(rec.emp).filter(r => r.id !== rec.id);
    const antesIn = otros.filter(r => r.check_in <= rec.check_in)
                         .sort((a, b) => b.check_in - a.check_in)[0] || null;
    // Rama A (no observada)
    if (antesIn && antesIn.check_out != null && antesIn.check_out > rec.check_in) {
      return new OdooError('Cannot create new attendance record for ' + rec.emp +
        ', the employee was already checked in on ' + fmtOdoo(antesIn.check_in), 'A');
    }
    // Rama D (HIPOTÉTICA, no existe en Odoo): solo para el árbol de falla, modela un
    // Odoo que sí validara un abierto contra los registros posteriores.
    if (this.validaAdelante && rec.check_out == null) {
      const despues = otros.filter(r => r.check_in > rec.check_in).sort((a, b) => a.check_in - b.check_in)[0];
      if (despues) return new OdooError('(hipotético) abierto antes de ' + fmtOdoo(despues.check_in), 'D');
    }
    if (rec.check_out == null) {
      // Rama B (observada, exec 104284)
      const abierto = otros.filter(r => r.check_out == null)
                           .sort((a, b) => b.check_in - a.check_in)[0];
      if (abierto) {
        return new OdooError('Cannot create new attendance record for ' + rec.emp +
          ", the employee hasn't checked out since " + fmtOdoo(abierto.check_in), 'B');
      }
    } else {
      // Rama C (observada, exec 105451 y siguientes)
      const antesOut = otros.filter(r => r.check_in < rec.check_out)
                            .sort((a, b) => b.check_in - a.check_in)[0] || null;
      if (antesOut && antesOut !== antesIn) {
        return new OdooError('Cannot create new attendance record for ' + rec.emp +
          ', the employee was already checked in on ' + fmtOdoo(antesOut.check_in), 'C');
      }
    }
    return null;
  }

  crear(vals) {
    // `forzados` permite que un escenario use los ids reales de Odoo (p. ej. 15549).
    const rec = Object.assign({ id: this.forzados.length ? this.forzados[0] : this.sig, check_out: null, disputa: false, so: null }, vals);
    const err = this.validar(rec);
    if (err) { this.log.push({ op: 'create', vals, error: err.message }); throw err; }
    if (this.forzados.length) this.forzados.shift(); else this.sig++;
    this.regs.set(rec.id, rec);
    this.log.push({ op: 'create', id: rec.id, vals });
    return rec.id;
  }

  escribir(id, vals) {
    const actual = this.regs.get(id);
    if (!actual) { const e = new OdooError('Record does not exist', 'missing'); throw e; }
    const nuevo = Object.assign({}, actual, vals);
    // Solo re-valida si cambian fechas, como Odoo (@api.constrains check_in, check_out).
    if ('check_in' in vals || 'check_out' in vals) {
      const err = this.validar(nuevo);
      if (err) { this.log.push({ op: 'write', id, vals, error: err.message }); throw err; }
    }
    this.regs.set(id, nuevo);
    this.log.push({ op: 'write', id, vals });
    return true;
  }

  borrar(id) { this.log.push({ op: 'unlink', id }); return this.regs.delete(id); }
}

module.exports = { OdooModelo, OdooError, cst, fmtOdoo, fmtCst, H };
