// tests/kiosko-blindaje/caso2.js
//
// Caso 2: la salida con el proyecto SO11855 del lunes 28-sep-2026 (issue del caso 2,
// ligado a #282). Extiende el simulador del caso 1 sin cambiar su comportamiento:
//
//   - Catálogo real de proyectos y SO (medido el 2026-09-29 por MCP de Odoo, solo lectura).
//   - Llave foránea de x_studio_sales_order_2 hacia sale.order (odoo-modelo.js, validarFk).
//   - "Odoo - UPDATE Salida" escribe el id del proyecto en DOS campos (versión feb04c42
//     del 9-jul) o en uno (hotfix a0c4b0e8 del 29-sep 12:53 UTC).
//   - Confirmar Horas (correct_so) y corregir-bolsa (UPDATE Proyecto) también escriben el
//     id del proyecto en x_studio_sales_order_2 (versiones publicadas 7a45cadc y 183acaa5).
//   - El PUT de shared/incidencias-asistencia.json puede chocar por sha con otra ejecución.
//
// Bloques nuevos (se suman a B1..B10; bloques.json los lista con construido:false):
//   B11  Todo id se valida contra su modelo destino antes de escribir. El id del proyecto
//        va a x_studio_project_id; x_studio_sales_order_2 recibe la SO real o nada.
//   B12  Ninguna escritura al almacén compartido de incidencias se pierde (reintento con
//        sha fresco, o almacén que no dependa de sha).
//   B13  Migración del histórico: x_studio_sales_order_2 = SO real del proyecto (o vacío)
//        en los registros viejos, y los lectores repuntados a x_studio_project_id.
//
// Invariantes nuevas (docs/kiosko/blindaje/invariantes.md):
//   I10  Todo id escrito en Odoo pertenece a su modelo destino, y el campo de SO de una
//        asistencia es la SO real de su proyecto o está vacío.
//   I11  Ninguna escritura a un archivo compartido se pierde: todo TAG de disputa apunta a
//        una incidencia que existe en el almacén.
//   I12  Una hora ambigua de 12 h nunca se interpreta sin confirmación del empleado.

'use strict';

const { Sistema, disenoActual, BLOQUES, H, MIN, DIA } = require('./sistema');
const { cst } = require('./odoo-modelo');
const { Monitor } = require('./monitor');

const BLOQUES_CASO2 = ['B11', 'B12', 'B13'];
const TODOS = BLOQUES.concat(BLOQUES_CASO2);

// ─── Catálogo medido (MCP FTS Odoo, 2026-09-29, solo lectura) ───────────────
// project.project 2382 "SO11855 - Adicional FTS ..." creado 2026-09-24 23:35:36 UTC,
//   sale_order_id vacío. sale.order 12054 = SO11855, project_id = 2382.
//   NO existe sale.order 2382: por eso el write del 28-sep falló por llave foránea.
// project.project 2302 "SO11547 - Desinstalación ...": sale.order 11746 = SO11547 SIN
//   project_id (la liga solo se recupera por el nombre). sale.order 2302 SÍ existe
//   (SO2286, de 2022): por eso escribir 2302 en el campo de SO "funciona" en silencio.
const PROYECTOS = new Map([
  [2382, { soPorLiga: 12054, soPorNombre: 12054, nombre: 'SO11855' }],
  [2302, { soPorLiga: null,  soPorNombre: 11746, nombre: 'SO11547' }]
]);
const SALE_ORDERS = new Set([12054, 11746, 2302]);   // 2302 = SO2286, la equivocada

// SO real del proyecto: primero la liga sale.order.project_id, luego el prefijo "SOxxxxx"
// del nombre del proyecto (medido: la liga cubre 16 de 21 proyectos con asistencias,
// el nombre cubre los 21).
function soReal(pid) {
  const p = PROYECTOS.get(pid);
  if (!p) return null;
  return p.soPorLiga || p.soPorNombre || null;
}

class SistemaCaso2 extends Sistema {
  constructor(diseno, opciones) {
    super(diseno);
    this.d = Object.assign({ B11: false, B12: false, B13: false }, this.d, diseno || {});
    this.hotfix = !!(opciones && opciones.hotfix);   // a0c4b0e8: checkin ya no escribe so2
    this.fallas.choqueSha = 0;
    this.reintentosSha = 0;
    this.odoo.fk = {
      so2: { ids: SALE_ORDERS, constraint: 'hr_attendance_x_studio_many2one_field_gHzp7_fkey' },
      proyecto: { ids: new Set(PROYECTOS.keys()), constraint: 'x_studio_project_id (nombre de la llave no observado)' }
    };
  }

  // "Odoo - UPDATE Salida" de kiosk/checkin.
  camposSalida(opts) {
    const pid = opts.so || null;
    if (!pid) return {};
    if (this.d.B11) {
      if (!PROYECTOS.has(pid)) throw new Error('ID_INVALIDO: el proyecto ' + pid + ' no existe en project.project');
      const so = soReal(pid);
      return so ? { proyecto: pid, so2: so } : { proyecto: pid };
    }
    // feb04c42 (9-jul): el mismo id en los dos campos. a0c4b0e8 (29-sep): solo proyecto.
    return this.hotfix ? { proyecto: pid } : { proyecto: pid, so2: pid };
  }

  // PUT de shared/incidencias-asistencia.json: GET por sha y PUT con ese sha, sin reintento
  // (kiosk/checkin, crear-olvido-checkout y resolver). Falla inyectada `choqueSha`: otra
  // ejecución escribió entre mi GET y mi PUT (exec 118442 contra 118441, 29-sep 12:59:34 UTC).
  guardarIncidencia(inc) {
    if (this.fallas.choqueSha > 0) {
      this.fallas.choqueSha--;
      if (!this.d.B12) throw new Error('GitHub 409: shared/incidencias-asistencia.json cambió de sha entre el GET y el PUT');
      this.reintentosSha++;   // B12: relee el archivo, vuelve a mezclar y reintenta
    }
    this.incidencias.push(inc);
  }

  // Confirmar Horas `correct_so` (7D3lgaYmH2DmqCWy, "Odoo - UPDATE SO+Approval") y
  // corregir-bolsa `correct_so` (O61Abp4s26yYpFEq, "Odoo - UPDATE Proyecto"): los dos
  // escriben x_studio_sales_order_2 = so_id y x_studio_project_id = so_id. El hotfix del
  // kiosko NO los tocó.
  corregirProyecto(att, pid) {
    const vals = { aprobado: true, proyecto: pid };
    if (this.d.B11) { const so = soReal(pid); if (so) vals.so2 = so; }
    else vals.so2 = pid;
    try { this.odoo.escribir(att, vals); return { panel: 'aplicada' }; }
    catch (e) { return { panel: 'error', detalle: e.message }; }
  }

  // B13: migración del histórico (propuesta, no ejecutada en producción).
  migrarHistorico() {
    if (!this.d.B13) return { migrados: 0 };
    let n = 0;
    for (const r of this.odoo.regs.values()) {
      if (r.so2 != null && r.so2 !== false) {
        const so = soReal(r.proyecto);
        r.so2 = so || false; n++;
      }
    }
    return { migrados: n };
  }
}

// ─── Invariantes nuevas ─────────────────────────────────────────────────────
function invariantesCaso2(sim) {
  const v = [];
  for (const r of sim.odoo.regs.values()) {
    if (r.so2 != null && r.so2 !== false && r.so2 !== soReal(r.proyecto)) {
      v.push({ inv: 'I10', msg: 'registro ' + r.id + ': campo de SO = ' + r.so2 + ', pero la SO del proyecto ' +
        r.proyecto + ' es ' + soReal(r.proyecto) });
    }
    if (r.disputa && r.incidencia && !sim.incidencias.some(i => i.id === r.incidencia)) {
      v.push({ inv: 'I11', msg: 'registro ' + r.id + ' con TAG de disputa hacia ' + r.incidencia + ', que no existe en el almacén' });
    }
    if (r.tecleada && r.check_out != null && r.check_out - r.check_in > 16 * H && !r.ampmConfirmada) {
      v.push({ inv: 'I12', msg: 'registro ' + r.id + ': "' + r.tecleada + '" se interpretó sin confirmar y dejó ' +
        ((r.check_out - r.check_in) / H).toFixed(2) + ' h' });
    }
  }
  return v;
}

// Monitor del caso 1 más tres pasos nuevos y las invariantes I10 a I12.
class MonitorCaso2 extends Monitor {
  paso(p) {
    const sim = this.sim;
    if (p.tipo === 'config') { if ('hotfix' in p) sim.hotfix = p.hotfix; return this.registrar(p, { config: true }, []); }
    if (p.tipo === 'ch') { const res = sim.corregirProyecto(p.att === '@' ? this.attDe(p.emp) : p.att, p.so); return this.registrar(p, res, []); }
    if (p.tipo === 'migrar') return this.registrar(p, sim.migrarHistorico(), []);
    if (p.tipo === 'reaccion') {
      // Empleado "razonable": solo si la pantalla del paso anterior dijo error, declara
      // su salida con "olvidé salida" en ese momento (como hizo hr.employee 131).
      const prev = this.pasos[this.pasos.length - 1];
      if (!(prev && prev.res && prev.res.pantalla === 'error')) return this.registrar(p, { omitido: true, motivo: 'la pantalla no dijo error' }, []);
      return this.pasoBase(Object.assign({}, p, { tipo: 'accion', boton: 'olvide_salida' }));
    }
    return this.pasoBase(p);
  }
  pasoBase(p) {
    const r = super.paso(p);
    const extra = this.nuevas();
    this.pasos[this.pasos.length - 1].v.push(...extra);
    return { res: r.res, v: r.v.concat(extra) };
  }
  registrar(p, res, v) {
    this.pasos.push({ p, res, v });
    const extra = this.nuevas();
    this.pasos[this.pasos.length - 1].v.push(...extra);
    return { res, v: extra };
  }
  // I10 a I12 son de estado: se reportan una vez por mensaje.
  nuevas() {
    const v = invariantesCaso2(this.sim).filter(x => !this.violaciones.some(y => y.inv === x.inv && y.msg === x.msg));
    v.forEach(x => { x.paso = this.pasos.length - 1; });
    this.violaciones.push(...v);
    return v;
  }
  attDe(emp) { const r = this.sim.odoo.del(emp).sort((a, b) => b.check_in - a.check_in); return r.length ? r[0].id : null; }
}

// ─── El caso, paso a paso ───────────────────────────────────────────────────
// Empleados por su id de Odoo (hr.employee). Registros con sus ids reales (hr.attendance).
// Horas de entrada del 28-sep: exactas para 57 (12:52:22 UTC) y 131 (12:33:46 UTC),
// leídas de Odoo el 29-sep; las demás son APROXIMADAS (salida real menos horas trabajadas).
const E = [
  { emp: 121, att: 15728, entra: [6, 32], sale: [17, 0, 12] },
  { emp: 127, att: 15735, entra: [6, 57], sale: [17, 1, 0] },
  { emp: 131, att: 15729, entra: [6, 33, 46], sale: [17, 0, 40] },
  { emp: 57,  att: 15734, entra: [6, 52, 22], sale: [17, 2, 8] },
  { emp: 25,  att: 15731, entra: [6, 38], sale: [17, 3, 0] },
  { emp: 76,  att: 15732, entra: [6, 50], sale: [17, 4, 0] },
  { emp: 128, att: 15733, entra: [6, 50], sale: [17, 5, 0] },
  { emp: 79,  att: 15737, entra: [6, 58], sale: [17, 6, 55] }
];
const EMPS = E.map(x => x.emp);
const L = (h, m, s) => cst(2026, 9, 28, h, m || 0, s || 0);    // lunes 28-sep, CST
const M = (h, m, s) => cst(2026, 9, 29, h, m || 0, s || 0);    // martes 29-sep, CST
const PROY = 2382;

function pasosCaso2(d) {
  const p = [];
  // Mañana del lunes: entradas normales (no son parte del incidente).
  for (const x of E) p.push({ tipo: 'accion', emp: x.emp, t: L(...x.entra), boton: 'entrada', desc: x.emp + ' entra' });
  // 17:00 a 17:07 CST (23:00 a 23:07 UTC): todos eligen SO11855 (proyecto 2382) al salir.
  // Producción: exec 117659, 117664, 117667, 117670, 117683, 117703, 117718, 117722, 117738, 117744.
  for (const x of E) {
    p.push({ tipo: 'accion', emp: x.emp, t: L(...x.sale), boton: 'salida', args: { so: PROY }, desc: x.emp + ' sale con SO11855' });
    if (x.emp === 131) {
      // hr.employee 131 lo resolvió esa tarde con "olvidé salida" (INC-OLV-CHK-131, propuso 17:01).
      p.push({ tipo: 'accion', emp: 131, t: L(17, 5, 24), boton: 'olvide_salida', args: { tecleada: '17:01' }, desc: '131 declara su salida 17:01' });
    } else if (d.B1) {
      // Con B1 la pantalla dice "No se guardó"; el empleado declara su salida en ese momento.
      p.push({ tipo: 'reaccion', emp: x.emp, t: L(...x.sale) + MIN, args: { tecleada: '17:0' + Math.min(9, x.sale[1]) }, desc: x.emp + ' ve el error y declara su salida' });
    }
  }
  // Martes 29-sep por la mañana.
  p.push({ tipo: 'accion', emp: 79, t: M(6, 27, 36), boton: 'salida', alt: 'segui_en_turno', args: { so: PROY }, desc: '79 intenta la salida de ayer (exec 118344)' });
  p.push({ tipo: 'accion', emp: 121, t: M(6, 29, 11), boton: 'salida', alt: 'segui_en_turno', args: { so: PROY }, desc: '121 intenta la salida de ayer (exec 118352)' });
  p.push({ tipo: 'accion', emp: 121, t: M(6, 33, 1), boton: 'resolver', alt: 'entrada', desc: '121 entra: auto-rescate a 9.6 h' });
  p.push({ tipo: 'accion', emp: 79, t: M(6, 35, 25), boton: 'salida', alt: 'segui_en_turno', args: { so: PROY }, desc: '79 reintenta (exec 118371)' });
  p.push({ tipo: 'accion', emp: 25, t: M(6, 40, 30), boton: 'resolver', alt: 'entrada', desc: '25 entra: auto-rescate a 9.6 h' });
  // hr.employee 57: "olvidé salida" tecleando 05:02 cuando quería 17:02 (exec 118408).
  p.push({ tipo: 'accion', emp: 57, t: M(6, 41, 18), boton: 'olvide_salida', args: { tecleada: '05:02' }, desc: '57 declara "05:02" (quería 17:02)' });
  // 12:53 UTC (06:53 CST): se publica el hotfix a0c4b0e8.
  p.push({ tipo: 'config', hotfix: true, t: M(6, 53), desc: 'hotfix a0c4b0e8 publicado' });
  // 06:59:33 y 06:59:34 CST: auto-rescates simultáneos; el PUT de 79 choca con el de 128.
  p.push({ tipo: 'accion', emp: 128, t: M(6, 59, 33), boton: 'resolver', alt: 'entrada', desc: '128 entra: auto-rescate (exec 118441)' });
  p.push({ tipo: 'falla', fallas: { choqueSha: 1 }, desc: 'el PUT de 128 cambia el sha del almacén' });
  p.push({ tipo: 'accion', emp: 79, t: M(6, 59, 34), boton: 'resolver', alt: 'entrada', desc: '79 entra: auto-rescate con choque de sha (exec 118442)' });
  // RH: ajusta un auto-cierre (como el registro 14864, ajustado a 17:01 y que sigue en 9.6 h).
  p.push({ tipo: 'rh', op: 'resolver', inc: '@auto_cierre', accion: 'ajustar', hhmm: '17:03', t: M(10), desc: 'RH ajusta el auto-cierre de 25 a 17:03' });
  // RH aprueba tal cual el olvido de 57 (como se aprobaron 15490, 14715 y 14476).
  p.push({ tipo: 'rh', op: 'resolver', inc: '@olvido_checkout', accion: 'aprobar', hhmm: null, t: M(10, 5), desc: 'RH aprueba el olvido de 57 tal cual' });
  // Confirmar Horas corrige proyecto: hacia 2382 (FK) y hacia 2302 (cae en la SO equivocada).
  p.push({ tipo: 'ch', emp: 131, att: '@', so: PROY, t: M(11), desc: 'Confirmar Horas: 131 a SO11855 (2382)' });
  p.push({ tipo: 'ch', emp: 127, att: '@', so: 2302, t: M(11, 1), desc: 'Confirmar Horas: 127 a SO11547 (2302)' });
  return p;
}

// Un escenario mínimo por bloque nuevo (y los viejos que el caso 2 vuelve a tocar).
const POR_BLOQUE_CASO2 = {
  B11: { inv: ['I10', 'I2'], titulo: 'Ids validados: la salida con un proyecto sin SO en el mismo id, y Confirmar Horas',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: L(7), boton: 'entrada' },
      { tipo: 'accion', emp: 1, t: L(17), boton: 'salida', args: { so: PROY } },
      { tipo: 'accion', emp: 2, t: L(7), boton: 'entrada' },
      { tipo: 'accion', emp: 2, t: L(17), boton: 'salida', args: { so: 2302 } },
      { tipo: 'ch', emp: 2, att: '@', so: 2302, t: M(9) }
    ] },
  B12: { inv: ['I11'], titulo: 'Auto-rescate con choque de sha en el almacén de incidencias',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: L(7), boton: 'entrada' },
      { tipo: 'falla', fallas: { choqueSha: 1 } },
      { tipo: 'accion', emp: 1, t: M(7, 5), boton: 'resolver' }
    ] },
  B13: { inv: ['I10'], titulo: 'Histórico: 2,074 registros con el id del proyecto en el campo de SO',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: L(7), boton: 'entrada' },
      { tipo: 'accion', emp: 1, t: L(17), boton: 'salida', args: { so: 2302 } },
      { tipo: 'migrar', t: M(22) }
    ] },
  B9: { inv: ['I12', 'I8'], titulo: 'Guarda AM/PM: "05:02" cuando quiso decir 17:02 (caso 2)',
    pasos: () => [
      { tipo: 'accion', emp: 1, t: L(6, 52, 22), boton: 'entrada' },
      { tipo: 'accion', emp: 1, t: M(6, 41, 18), boton: 'olvide_salida', args: { tecleada: '05:02' } },
      { tipo: 'rh', op: 'resolver', inc: '@olvido_checkout', accion: 'aprobar', hhmm: null, t: M(10) }
    ] }
};

function correrCaso2(diseno, opciones) {
  const sim = new SistemaCaso2(diseno, opciones);
  // Ids reales de los registros del 28-sep (en el orden en que se crean).
  sim.odoo.forzados = E.map(x => x.att);
  const m = new MonitorCaso2(sim, EMPS).correr(pasosCaso2(sim.d));
  return m;
}

// Las invariantes de estado (I10 a I12) se miden sobre el estado FINAL; las de acción
// (I2, I3, I6, I8...), durante la corrida.
function finales(m) {
  return m.violaciones.filter(v => !['I10', 'I11', 'I12'].includes(v.inv)).concat(invariantesCaso2(m.sim));
}

function correrBloque(b, diseno) {
  const esc = POR_BLOQUE_CASO2[b];
  const sim = new SistemaCaso2(diseno, { hotfix: false });
  const m = new MonitorCaso2(sim, [1, 2]).correr(esc.pasos(sim.d));
  return finales(m).filter(v => esc.inv.includes(v.inv));
}

function con(bloques) { const d = disenoActual(); BLOQUES_CASO2.forEach(b => { d[b] = false; }); bloques.forEach(b => { d[b] = true; }); return d; }

module.exports = { SistemaCaso2, MonitorCaso2, invariantesCaso2, finales, pasosCaso2, correrCaso2, correrBloque,
  POR_BLOQUE_CASO2, BLOQUES_CASO2, TODOS, con, soReal, PROYECTOS, E };
