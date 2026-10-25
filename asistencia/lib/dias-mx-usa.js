/* ═══════════════════════════════════════════════════════════════════════════
 * asistencia/lib/dias-mx-usa.js — lógica pura del tipo de día y del reporte
 * «Días México / USA» (#396, fase a).
 *
 * UNA sola fuente para tres lugares:
 *   - el Code node de n8n `rh/dias-mx-usa` (se inyecta tal cual con armar.js),
 *   - la página modulos/rh/dias-mx-usa/ (la carga con <script>),
 *   - las pruebas tests/asistencia/dias-mx-usa.test.js.
 * Sin dependencias, sin red, sin fecha del sistema: todo entra por argumento.
 *
 * Reglas (decisiones de Esteban, #396, 8-oct-2026):
 *   mexico        → paga nómina México
 *   viaje_mexico  → paga nómina México (sale de USA, llega a México)
 *   proyecto_usa  → paga FTS USA
 *   viaje_usa     → paga FTS USA (sale de México, llega a USA)
 *   Propuesto por zonas: mx→mx mexico · usa→usa proyecto_usa · mx→usa viaje_usa
 *   · usa→mx viaje_mexico. Toda zona que no sea 'usa' cuenta como mx.
 *   Sin zona: por empresa del proyecto (6 = proyecto_usa; si no, mexico).
 *   Sólo cuentan días CONFIRMADOS por Felipe: manager_approval en Odoo Y
 *   tipo_dia en Postgres. Lo demás es pendiente, en rojo, con su motivo.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.DiasMxUsa = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIPOS = ['mexico', 'proyecto_usa', 'viaje_usa', 'viaje_mexico'];
  var ETIQUETA = { mexico: 'México', proyecto_usa: 'Proyecto USA', viaje_usa: 'Viaje a USA', viaje_mexico: 'Viaje a México' };
  var PAGA = { mexico: 'mx', viaje_mexico: 'mx', proyecto_usa: 'usa', viaje_usa: 'usa' };
  var COMPANY_USA = 6;
  var DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var DIA_MS = 864e5;

  function paisZona(z) {
    if (z == null || String(z).trim() === '') return null;
    return String(z).trim().toLowerCase() === 'usa' ? 'usa' : 'mx';
  }
  function tipoPorZonas(zin, zout) {
    var a = paisZona(zin), b = paisZona(zout);
    if (!a || !b) return null;
    if (a === 'mx' && b === 'mx') return 'mexico';
    if (a === 'usa' && b === 'usa') return 'proyecto_usa';
    if (a === 'mx' && b === 'usa') return 'viaje_usa';
    return 'viaje_mexico';
  }
  function tipoPorEmpresa(companyId) { return Number(companyId) === COMPANY_USA ? 'proyecto_usa' : 'mexico'; }
  function esViaje(tipo) { return tipo === 'viaje_usa' || tipo === 'viaje_mexico'; }

  // ── Fechas ─────────────────────────────────────────────────────────────
  // Odoo entrega UTC sin Z ('2026-10-08 13:19:49'). México no tiene horario de
  // verano desde 2022: CST = UTC−6 fijo, igual que el resto de la suite.
  function aUtc(s) {
    if (!s) return null;
    var t = String(s).trim().replace(' ', 'T');
    if (!/[zZ]|[+-][0-9]{2}:?[0-9]{2}$/.test(t)) t += 'Z';
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  function diaCst(utc) {
    var d = aUtc(utc);
    return d ? new Date(d.getTime() - 6 * 3600e3).toISOString().slice(0, 10) : null;
  }
  function horaCst(utc) {
    var d = aUtc(utc);
    return d ? new Date(d.getTime() - 6 * 3600e3).toISOString().slice(11, 16) : null;
  }
  function sumarDias(iso, n) { return new Date(Date.parse(iso + 'T12:00:00Z') + n * DIA_MS).toISOString().slice(0, 10); }
  function nombreDia(iso) { var d = new Date(iso + 'T12:00:00Z'); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate(); }

  // Semana FTS: viernes a jueves. Ancla de toda la nómina: jueves 2026-07-23 = S30.
  function semanaDe(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    var desde = sumarDias(iso, -((d.getUTCDay() - 5 + 7) % 7));
    var hasta = sumarDias(desde, 6);
    var n = 30 + Math.round((Date.parse(hasta + 'T12:00:00Z') - Date.parse('2026-07-23T12:00:00Z')) / (7 * DIA_MS));
    var dias = []; for (var i = 0; i < 7; i++) dias.push(sumarDias(desde, i));
    return { id: 'S' + n + '/' + hasta.slice(0, 4), desde: desde, hasta: hasta, dias: dias };
  }
  function semanaPorId(id) {
    var m = /^S([0-9]+)\/([0-9]{4})/.exec(String(id || ''));
    if (!m) return null;
    var jue = sumarDias('2026-07-23', (Number(m[1]) - 30) * 7);
    return semanaDe(sumarDias(jue, -6));
  }

  function m2o(v) {
    if (v == null || v === false) return { id: null, nombre: null };
    if (Array.isArray(v)) return { id: v[0] || null, nombre: v[1] || null };
    if (typeof v === 'object') return { id: v.id || null, nombre: v.name || v.nombre || null };
    return { id: Number(v) || null, nombre: null };
  }

  // ── Propuesto efectivo de una fila (evento de Postgres + asistencia de Odoo) ──
  function propuesto(fila) {
    var ev = fila.evento || {};
    if (ev.tipo_dia_propuesto && ev.origen_propuesto === 'zona') return { tipo: ev.tipo_dia_propuesto, origen: 'zona' };
    var z = tipoPorZonas(ev.zona_in, ev.zona_out);
    if (z) return { tipo: z, origen: 'zona' };
    return { tipo: tipoPorEmpresa(fila.so_company_id), origen: 'empresa_proyecto' };
  }

  /* armarReporte({ semana:'S42/2026' | {desde,…}, asistencias:[…], empleados?:{id:nombre} })
   * Cada asistencia: { attendance_id, employee_id, empleado_nombre?, check_in, check_out,
   *   worked_hours, confirmado (manager_approval), so_id, so_nombre, so_company_id,
   *   cuenta_id, cuenta_nombre, evento:{ tipo_dia, tipo_dia_propuesto, origen_propuesto,
   *   zona_in, zona_out, recobro_usa } | null }
   */
  function armarReporte(entrada) {
    var sem = typeof entrada.semana === 'string' ? semanaPorId(entrada.semana) : entrada.semana;
    if (!sem) throw new Error('SEMANA_INVALIDA');
    var porPersona = {};
    (entrada.asistencias || []).forEach(function (a) {
      var fecha = diaCst(a.check_in);
      if (!fecha || fecha < sem.desde || fecha > sem.hasta) return;
      var emp = Number(a.employee_id);
      var p = porPersona[emp] || (porPersona[emp] = { employee_id: emp, nombre: a.empleado_nombre || (entrada.empleados || {})[emp] || ('Empleado ' + emp), porDia: {} });
      (p.porDia[fecha] = p.porDia[fecha] || []).push(a);
    });

    var personas = Object.keys(porPersona).map(function (k) {
      var p = porPersona[k];
      var dias = sem.dias.map(function (fecha) {
        var atts = (p.porDia[fecha] || []).slice().sort(function (x, y) { return String(x.check_in).localeCompare(String(y.check_in)); });
        if (!atts.length) return { fecha: fecha, estado: 'sin_checadas', attendance_ids: [], horas: 0, motivos: [] };
        var motivos = [], tipos = {}, horas = 0, cargos = [], recobro = false;
        atts.forEach(function (a) {
          var ev = a.evento || {};
          horas += Number(a.worked_hours) || 0;
          if (!a.check_out) motivos.push('abierta (att ' + a.attendance_id + ')');
          if (a.confirmado !== true) motivos.push('sin confirmar (att ' + a.attendance_id + ')');
          if (!ev.tipo_dia) motivos.push('sin tipo (att ' + a.attendance_id + ')');
          else {
            tipos[ev.tipo_dia] = true;
            if (esViaje(ev.tipo_dia) && !a.so_id && !a.cuenta_id) motivos.push('viaje sin cargo (att ' + a.attendance_id + ')');
          }
          if (ev.recobro_usa) recobro = true;
          var so = m2o(a.so_id), cta = m2o(a.cuenta_id);
          cargos.push(so.id ? { tipo: 'so', id: so.id, nombre: a.so_nombre || so.nombre || ('SO ' + so.id), company_id: a.so_company_id || null }
                            : cta.id ? { tipo: 'bolsa', id: cta.id, nombre: a.cuenta_nombre || cta.nombre || ('Cuenta ' + cta.id) } : null);
        });
        var listaTipos = Object.keys(tipos);
        if (listaTipos.length > 1) motivos.push('tipos distintos el mismo día (' + listaTipos.map(function (t) { return ETIQUETA[t]; }).join(' y ') + ')');
        var base = { fecha: fecha, attendance_ids: atts.map(function (a) { return a.attendance_id; }), horas: Math.round(horas * 100) / 100, cargos: cargos.filter(Boolean), recobro_usa: recobro };
        if (motivos.length) {
          var pt = listaTipos.length === 1 ? listaTipos[0] : null;
          return Object.assign(base, { estado: 'pendiente', tipo: pt, motivos: motivos, propuesto: propuesto(atts[0]).tipo });
        }
        var tipo = listaTipos[0];
        return Object.assign(base, { estado: PAGA[tipo], tipo: tipo, motivos: [] });
      });
      var mx = dias.filter(function (d) { return d.estado === 'mx'; });
      var usa = dias.filter(function (d) { return d.estado === 'usa'; });
      var pend = dias.filter(function (d) { return d.estado === 'pendiente'; });
      function suma(arr) { return Math.round(arr.reduce(function (s, d) { return s + d.horas; }, 0) * 100) / 100; }
      var persona = {
        employee_id: p.employee_id, nombre: p.nombre, dias: dias,
        paga_mx: mx.length, paga_usa: usa.length,
        viaje_usa: usa.filter(function (d) { return d.tipo === 'viaje_usa'; }).length,
        proyecto_usa: usa.filter(function (d) { return d.tipo === 'proyecto_usa'; }).length,
        pendientes: pend.length,
        horas: { mx: suma(mx), usa: suma(usa), pendiente: suma(pend) }
      };
      persona.como_salio = comoSalio(persona);
      persona.propuesta_trabajo_usa = propuestaTrabajoUsa(persona);
      return persona;
    }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });

    var tot = { personas: personas.length, paga_mx: 0, paga_usa: 0, pendientes: 0, con_usa: 0 };
    personas.forEach(function (p) { tot.paga_mx += p.paga_mx; tot.paga_usa += p.paga_usa; tot.pendientes += p.pendientes; if (p.paga_usa) tot.con_usa++; });
    return { semana: sem.id, desde: sem.desde, hasta: sem.hasta, dias: sem.dias, personas: personas, totales: tot };
  }

  function detalleDia(d) {
    return nombreDia(d.fecha) + ' (' + (d.tipo ? ETIQUETA[d.tipo] : 'sin tipo') + ', att ' + d.attendance_ids.join('+') + ', ' + d.horas.toFixed(2) + ' h' + (d.recobro_usa ? ', recobro a USA' : '') + ')';
  }
  function comoSalio(p) {
    var mx = p.dias.filter(function (d) { return d.estado === 'mx'; });
    var usa = p.dias.filter(function (d) { return d.estado === 'usa'; });
    var pend = p.dias.filter(function (d) { return d.estado === 'pendiente'; });
    return {
      mx: 'México ' + mx.length + ' = ' + (mx.length ? mx.map(detalleDia).join(' + ') : 'ningún día') + '. Horas ' + p.horas.mx.toFixed(2) + ' (métrica).',
      usa: 'FTS USA ' + usa.length + ' = ' + (usa.length ? usa.map(detalleDia).join(' + ') : 'ningún día') + '. Horas ' + p.horas.usa.toFixed(2) + ' (métrica, no costo).',
      pendiente: pend.length ? 'Pendiente ' + pend.length + ' = ' + pend.map(function (d) { return nombreDia(d.fecha) + ': ' + d.motivos.join('; '); }).join(' · ') + '. No suma en ninguna columna hasta que Felipe lo confirme.' : ''
    };
  }

  /* D-10: la declaración trabajo_usa de Nómina · Incidencias es { dias, so } con UNA
   * SO. Se propone una declaración por SO, con los días USA confirmados. RH la acepta;
   * no se captura dos veces. */
  function propuestaTrabajoUsa(p) {
    var porSo = {};
    p.dias.filter(function (d) { return d.estado === 'usa'; }).forEach(function (d) {
      var c = d.cargos[0] || { tipo: 'sin', id: 0, nombre: 'Sin SO' };
      var k = c.tipo + ':' + c.id;
      (porSo[k] = porSo[k] || { so: c.nombre, so_id: c.tipo === 'so' ? c.id : null, dias: 0, fechas: [] });
      porSo[k].dias++; porSo[k].fechas.push(d.fecha);
    });
    return Object.keys(porSo).map(function (k) { var x = porSo[k]; return { tipo: 'trabajo_usa', valores: { dias: x.dias, so: x.so }, so_id: x.so_id, fechas: x.fechas }; });
  }

  /* Hojas para NomExcel.libro(): resumen por persona + detalle por día. */
  function hojasExcel(rep) {
    var h1 = [[{ v: 'Días México / USA · ' + rep.semana + ' (' + rep.desde + ' a ' + rep.hasta + ')', s: 2 }],
              ['Sólo cuentan días confirmados por Felipe (aprobación en Odoo y tipo de día). PENDIENTE = no suma en ninguna columna.'], [],
              ['Persona', 'Paga nómina México', 'Paga FTS USA', '  de ellos Viaje a USA', 'Pendientes', 'Horas MX', 'Horas USA', 'Cómo salió México', 'Cómo salió USA', 'Pendientes (motivo)']
                .map(function (t) { return { v: t, s: 1 }; })];
    rep.personas.forEach(function (p) {
      h1.push([p.nombre, { v: p.paga_mx, n: true }, { v: p.paga_usa, n: true }, { v: p.viaje_usa, n: true }, { v: p.pendientes, n: true },
               { v: p.horas.mx, n: true }, { v: p.horas.usa, n: true }, { v: p.como_salio.mx, s: 3 }, { v: p.como_salio.usa, s: 3 }, { v: p.como_salio.pendiente, s: 3 }]);
    });
    var h2 = [[{ v: 'Detalle por día · ' + rep.semana, s: 2 }], [],
              ['Persona', 'Fecha', 'Estado', 'Tipo de día', 'Asistencias (Odoo)', 'Horas', 'Cargo', 'Recobro a USA', 'Motivo pendiente'].map(function (t) { return { v: t, s: 1 }; })];
    rep.personas.forEach(function (p) {
      p.dias.forEach(function (d) {
        if (d.estado === 'sin_checadas') return;
        h2.push([p.nombre, d.fecha, d.estado === 'mx' ? 'Paga México' : d.estado === 'usa' ? 'Paga FTS USA' : 'PENDIENTE',
                 d.tipo ? ETIQUETA[d.tipo] : '', d.attendance_ids.join(', '), { v: d.horas, n: true },
                 (d.cargos || []).map(function (c) { return c.nombre; }).join(' · '), d.recobro_usa ? 'Sí' : '', { v: d.motivos.join('; '), s: 3 }]);
      });
    });
    return [{ nombre: 'Resumen', congelar: 4, anchos: [30, 12, 12, 12, 11, 9, 9, 60, 60, 50], filas: h1 },
            { nombre: 'Detalle', congelar: 3, anchos: [30, 11, 14, 15, 18, 8, 40, 10, 50], filas: h2 }];
  }

  return {
    TIPOS: TIPOS, ETIQUETA: ETIQUETA, PAGA: PAGA,
    paisZona: paisZona, tipoPorZonas: tipoPorZonas, tipoPorEmpresa: tipoPorEmpresa, esViaje: esViaje,
    diaCst: diaCst, horaCst: horaCst, semanaDe: semanaDe, semanaPorId: semanaPorId, nombreDia: nombreDia,
    propuesto: propuesto, armarReporte: armarReporte, comoSalio: comoSalio,
    propuestaTrabajoUsa: propuestaTrabajoUsa, hojasExcel: hojasExcel
  };
});
