/* DC-3 · periodo de ejecucion y tope diario por persona (logica pura, sin DOM).
   Fechas como 'AAAA-MM-DD'; se opera en UTC para que la zona horaria no mueva el dia. */
(function (root) {
  'use strict';
  var TOPE_DIARIO_DEFAULT = 12; // regla FTS, no STPS
  var EPS = 1e-9;

  function toDate(s) { return new Date(s + 'T00:00:00Z'); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function esFinDeSemana(s) { var w = toDate(s).getUTCDay(); return w === 0 || w === 6; }
  function fechaValida(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(toDate(s)) === s; }
  function fmt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—'; }
  function fmtDC3(s) { return s ? s.replace(/-/g, '/') : '—'; } // AAAA/MM/DD como el formato STPS

  // Dias del periodo que cuentan para repartir horas (D3: con o sin fines de semana).
  function diasDelPeriodo(ini, fin, contarFines) {
    var out = [];
    for (var d = ini; d <= fin; d = addDays(d, 1)) {
      if (contarFines || !esFinDeSemana(d)) out.push(d);
      if (out.length > 3660) break;
    }
    return out;
  }

  function diasMinimos(horas, tope) { return Math.max(1, Math.ceil(horas / tope)); }

  // Primera fecha fin valida: el dia en que se completan los dias minimos que cuentan.
  function finMinima(ini, horas, tope, contarFines) {
    var falta = diasMinimos(horas, tope), d = ini, n = 0;
    while (true) {
      if (contarFines || !esFinDeSemana(d)) { n++; if (n === falta) return d; }
      d = addDays(d, 1);
    }
  }

  // D1: reparto de horas entre los dias del periodo.
  function repartir(horas, dias, regla, tope) {
    var m = {};
    if (!dias.length) return m;
    if (regla === 'llenar') {
      var resto = horas;
      dias.forEach(function (d) { var h = Math.min(tope, resto); m[d] = h; resto -= h; });
    } else {
      dias.forEach(function (d) { m[d] = horas / dias.length; });
    }
    return m;
  }

  /* asignaciones: [{id, empleado, curso, ini, fin}]
     cursos: {id: {nombre, hrs}}
     opts: {tope, reparto:'parejo'|'llenar', contarFines, historial:[{empleado, curso, ini, fin}]}
     -> {porAsignacion: {id: {errores:[{tipo,texto}], dias:{fecha:horas}}}, total, conError} */
  function validarLote(asignaciones, cursos, opts) {
    opts = opts || {};
    var tope = opts.tope || TOPE_DIARIO_DEFAULT;
    var regla = opts.reparto || 'parejo';
    var contarFines = opts.contarFines !== false;
    var res = {}, carga = {}; // carga[empleado][fecha] = [{id, curso, horas, historial}]

    function procesar(a, esHistorial) {
      var c = cursos[a.curso];
      var r = { errores: [], dias: {} };
      if (!esHistorial) res[a.id] = r;
      if (!c) { r.errores.push({ tipo: 'curso', texto: 'Curso desconocido' }); return; }
      if (!(c.hrs > 0)) { r.errores.push({ tipo: 'horas', texto: 'El curso no tiene duración en horas' }); return; }
      if (!fechaValida(a.ini) || !fechaValida(a.fin)) { r.errores.push({ tipo: 'fecha', texto: 'Falta fecha de inicio o de fin' }); return; }
      if (a.fin < a.ini) { r.errores.push({ tipo: 'orden', texto: 'La fecha fin (' + fmt(a.fin) + ') es anterior al inicio (' + fmt(a.ini) + ')' }); return; }
      var dias = diasDelPeriodo(a.ini, a.fin, contarFines);
      if (!dias.length) { r.errores.push({ tipo: 'fines', texto: 'El periodo solo tiene sábado y domingo, y no se cuentan' }); return; }
      var min = diasMinimos(c.hrs, tope);
      if (dias.length < min) {
        r.errores.push({ tipo: 'minimo', texto: c.hrs + ' h requiere al menos ' + min + ' días (tope ' + tope + ' h por día). Fecha fin mínima: ' + fmt(finMinima(a.ini, c.hrs, tope, contarFines)) });
        return;
      }
      r.dias = repartir(c.hrs, dias, regla, tope);
      var e = carga[a.empleado] || (carga[a.empleado] = {});
      Object.keys(r.dias).forEach(function (d) {
        if (r.dias[d] <= EPS) return;
        (e[d] || (e[d] = [])).push({ id: esHistorial ? null : a.id, curso: c.nombre, horas: r.dias[d], historial: !!esHistorial });
      });
    }

    asignaciones.forEach(function (a) { procesar(a, false); });
    (opts.historial || []).forEach(function (h) { procesar(h, true); });

    // Tope diario: suma SOLO dentro de la misma persona.
    Object.keys(carga).forEach(function (emp) {
      Object.keys(carga[emp]).sort().forEach(function (d) {
        var items = carga[emp][d];
        var suma = items.reduce(function (s, x) { return s + x.horas; }, 0);
        if (suma > tope + EPS) {
          var detalle = items.map(function (x) { return x.curso + ' ' + red(x.horas) + ' h' + (x.historial ? ' (ya emitida)' : ''); }).join(' + ');
          items.forEach(function (x) {
            if (x.id == null) return;
            res[x.id].errores.push({ tipo: 'tope', dia: d, suma: suma, texto: fmt(d) + ': ' + red(suma) + ' h sumadas (' + detalle + '). Tope ' + tope + ' h' });
          });
        }
      });
    });

    var conError = Object.keys(res).filter(function (k) { return res[k].errores.length; }).length;
    return { porAsignacion: res, total: asignaciones.length, conError: conError };
  }

  function red(h) { return Math.round(h * 10) / 10; }

  var api = { TOPE_DIARIO_DEFAULT: TOPE_DIARIO_DEFAULT, validarLote: validarLote, finMinima: finMinima,
    diasMinimos: diasMinimos, diasDelPeriodo: diasDelPeriodo, repartir: repartir, addDays: addDays,
    fmt: fmt, fmtDC3: fmtDC3, esFinDeSemana: esFinDeSemana, red: red };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DC3Periodo = api;
})(this);
