/* ═══ RH · Nómina USA · práctica de alertas e incidencias (#448, fase C) ═══
 * Alertas de ejemplo + las incidencias REALES de octubre de Ricardo, calculadas con la
 * misma función que usa el workflow (NominaUSA.alertas.incidencias). Modo sombra. */
(function (G) {
  'use strict';
  var D = G.NusaDemo, S = D.estado, A = G.NominaUSA.alertas;
  var seq = 1;
  function alerta(o) { return Object.assign({ id: seq++, modo_al_crear: 'sombra', encolada: false, estado: 'abierta', marcado_por: null, nota: null, detalle: {} }, o); }
  S.alertas = [
    alerta({ clave: 'entrada:75:2026-11-02', tipo: 'entrada_faltante', employee_id: 75, alias: 'Mateo', fecha: '2026-11-02', detalle: { hora_ref: '07:00', zona: 'America/Chicago', segundos_tarde: 1260 } }),
    alerta({ clave: 'salida:16395', tipo: 'salida_faltante', employee_id: 98, alias: 'Ricardo', fecha: '2026-10-31', attendance_id: 16395 }),
    alerta({ clave: 'salida_rh:16395', tipo: 'salida_faltante_rh', employee_id: 98, alias: 'Ricardo', fecha: '2026-10-31', attendance_id: 16395 })
  ];
  A.incidencias(G.NusaOctubre.asistencias, '2026-10-21', '2026-10-30', 'America/Los_Angeles').forEach(function (i) {
    if (i.tipo === 'rafaga') return;
    S.alertas.push(alerta({ clave: 'inc:98:' + i.fecha + ':' + i.tipo, tipo: 'incidencia_periodo', employee_id: 98, alias: 'Ricardo', fecha: i.fecha, attendance_id: i.attendance_id, detalle: i }));
  });
  S.dias = [
    { employee_id: 79, alias: 'José Luis', fecha: '2026-10-30', pais: 'USA', origen: 'declarado', pendiente_rh: true },
    { employee_id: 75, alias: 'Mateo', fecha: '2026-10-30', pais: 'USA', origen: 'geo', pendiente_rh: false }
  ];
  var LEER = ['nomina_usa:validar', 'nomina_usa:autorizar'];
  D.reg('alertas', LEER, function (p) {
    var l = S.alertas.filter(function (a) { return !p.solo_abiertas || a.estado === 'abierta' || a.estado === 'en_disputa'; });
    return { ok: true, modo: S.config.alertas_modo, alertas: JSON.parse(JSON.stringify(l)) };
  });
  D.reg('alerta_marcar', ['nomina_usa:validar'], function (p, q) {
    var a = S.alertas.find(function (x) { return x.id === Number(p.id); });
    if (!a) return { ok: false, error: 'ALERTA_INEXISTENTE' };
    if (['falta_justificada', 'falta_injustificada', 'error_corregido', 'en_disputa'].indexOf(p.estado) < 0) return { ok: false, error: 'ESTADO_INVALIDO' };
    if (!String(p.nota || '').trim() && (p.estado === 'falta_justificada' || p.estado === 'en_disputa')) return { ok: false, error: 'MOTIVO_REQUERIDO' };
    var antes = a.estado; a.estado = p.estado; a.marcado_por = q.actor; a.nota = p.nota || null;
    D.log(q.actor, antes === 'en_disputa' && p.estado !== 'en_disputa' ? 'alerta_liberada' : 'alerta_marcada', 'alerta:' + a.id, { estado: antes }, { estado: p.estado }, p.nota);
    return { ok: true, id: a.id, estado: p.estado };
  });
  D.reg('dias', LEER.concat(['nomina_usa:kiosko']), function (p) {
    return { ok: true, dias: S.dias.filter(function (d) { return !p.solo_pendientes || d.pendiente_rh; }) };
  });
  D.reg('dia_validar', ['nomina_usa:validar'], function (p, q) {
    if (['USA', 'MX'].indexOf(p.pais) < 0) return { ok: false, error: 'PAIS_INVALIDO' };
    var d = S.dias.find(function (x) { return x.employee_id === Number(p.employee_id) && x.fecha === p.fecha; });
    if (!d) { d = { employee_id: Number(p.employee_id), fecha: p.fecha }; S.dias.push(d); }
    var antes = Object.assign({}, d);
    Object.assign(d, { pais: p.pais, origen: 'rh', pendiente_rh: false, validado_por: q.actor, nota_rh: p.nota || null });
    D.log(q.actor, 'dia_validado', d.employee_id + '@' + d.fecha, antes, { pais: p.pais }, p.nota);
    return { ok: true };
  });
})(window);
