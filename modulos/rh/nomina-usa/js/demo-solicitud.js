/* ═══ RH · Nómina USA · práctica de la solicitud y su revisión (#448, fase E) ═══
 * Misma forma que las acciones de nomina_usa_0005; los candados salen de NominaUSA.nomina.
 * Semana de práctica: vie 30-oct a jue 5-nov 2026 (la primera que paga Auris el 6-nov). */
(function (G) {
  'use strict';
  var D = G.NusaDemo, S = D.estado, N = G.NominaUSA.nomina;
  S.solicitudes = [];
  S.comercialReal = [
    { employee_id: 98, fecha: '2026-10-30', pct: 20, sugerido: 20, excepcion: false },
    { employee_id: 98, fecha: '2026-10-31', pct: 0, sugerido: 0, excepcion: false },
    { employee_id: 98, fecha: '2026-11-02', pct: 30, sugerido: 30, excepcion: false },
    { employee_id: 98, fecha: '2026-11-03', pct: 50, sugerido: 30, excepcion: true, explicacion: 'Visita a cliente nuevo en Mission para levantamiento' }
  ];
  S.fichas.find(function (f) { return f.employee_id === 97; }).fijo_semanal_usd = 700;
  var ROL = { supervisor_comercial: 'supervisor', bolsa_avance: 'tecnicos' };
  function alias(id) { var f = S.fichas.find(function (x) { return x.employee_id === Number(id); }); return f ? f.alias : 'empleado ' + id; }
  function pagado(so, rol, excluir) {
    var b = D.bolsaVigente(so), p = b ? b['pagado_previo_' + rol] : 0;
    S.solicitudes.forEach(function (s) { if ((s.estado === 'autorizada' || s.estado === 'subida') && s.id !== excluir) s.lineas.forEach(function (l) { if (l.tipo === 'so' && l.so_id === so && l.rol === rol) p += (l.autorizado_monto != null ? l.autorizado_monto : l.monto); }); });
    return p;
  }
  function bloqueos(sem, personas) {
    var dias = N.semanaFTS(sem).dias;
    return { disputas: S.alertas.filter(function (a) { return a.estado === 'en_disputa' && personas.indexOf(a.employee_id) >= 0; }).map(function (a) { return { id: a.id, employee_id: a.employee_id, alias: alias(a.employee_id), fecha: a.fecha, tipo: a.tipo, revision_pedida: !!a.revision_pedida_por }; }),
             dias_pendientes: S.dias.filter(function (d) { return d.pendiente_rh && personas.indexOf(d.employee_id) >= 0 && dias.indexOf(d.fecha) >= 0; }) };
  }
  function viva(sem) { return S.solicitudes.find(function (s) { return s.semana === sem && s.estado !== 'devuelta'; }) || null; }
  var USA = function () { return S.fichas.filter(function (f) { return f.activo !== false && f.pais_nomina !== 'MX'; }); };

  D.reg('solicitud_contexto', ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar'], function (p) {
    var sem = N.semanaFTS(p.semana), ids = {};
    S.horas.forEach(function (h) { if (sem.dias.indexOf(h.fecha) >= 0) ids[h.so_id] = true; });
    Object.keys(S.avances).forEach(function (so) { S.avances[so].forEach(function (a) { if (sem.dias.indexOf(a.fecha) >= 0) ids[so] = true; }); });
    var sos = Object.keys(ids).map(Number).sort().map(function (so) {
      var b = D.bolsaVigente(so), cat = S.catalogoSO.find(function (c) { return c.so_id === so; }) || {};
      var horas = {}; S.horas.forEach(function (h) { if (h.so_id === so && sem.dias.indexOf(h.fecha) >= 0) horas[h.employee_id] = (horas[h.employee_id] || 0) + h.horas; });
      return { so_id: so, so_nombre: (b && b.so_nombre) || cat.so_nombre || ('SO ' + so), bolsa: b ? { supervisor: b.supervisor, tecnicos: b.tecnicos, origen: b.origen, folio: b.folio } : null,
        pagado: { supervisor: pagado(so, 'supervisor'), tecnicos: pagado(so, 'tecnicos') },
        avance_ultimo: (S.avances[so] || []).filter(function (a) { return a.fecha <= sem.fin; }).reduce(function (m, a) { return Math.max(m, a.pct); }, 0),
        dias: sem.dias.map(function (f) { var a = (S.avances[so] || []).find(function (x) { return x.fecha === f; });
          return { fecha: f, avance: a ? a.pct : null, horas: S.horas.filter(function (h) { return h.so_id === so && h.fecha === f; }).map(function (h) { return { employee_id: h.employee_id, horas: h.horas }; }) }; }),
        horas: horas };
    });
    var faltas = function (emp) { return S.alertas.filter(function (a) { return a.employee_id === emp && a.estado === 'falta_injustificada' && sem.dias.indexOf(a.fecha) >= 0; }).length; };
    return { ok: true, semana: sem.inicio, sos: sos,
      personas: USA().map(function (f) { return { employee_id: f.employee_id, alias: f.alias, tipo_pago_usa: f.tipo_pago_usa, rol: ROL[f.tipo_pago_usa] || null, fijo_semanal_usd: f.fijo_semanal_usd, faltas_injustificadas: faltas(f.employee_id) }; }),
      comercial: S.comercialReal.filter(function (x) { return sem.dias.indexOf(x.fecha) >= 0; }),
      tarifa_comercial_usd: S.config.tarifa_comercial_usd,
      bloqueos: bloqueos(sem.inicio, USA().map(function (f) { return f.employee_id; })),
      solicitud: viva(sem.inicio) };
  });

  D.reg('solicitud_enviar', ['nomina_usa:kiosko'], function (p, q) {
    var e = p.envio, sem = N.semanaFTS(e.semana), personas = [], err = [];
    if (viva(sem.inicio)) return { ok: false, error: 'YA_ENVIADA', mensaje: 'La solicitud de esta semana ya se envió.' };
    (e.sos || []).forEach(function (so) { ['supervisor', 'tecnicos'].forEach(function (r) { Object.keys((so.reparto || {})[r] || {}).forEach(function (k) { if (Number(so.reparto[r][k]) > 0) personas.push(Number(k)); }); }); });
    (e.comercial || []).forEach(function (c) { if (c.pct > 0) personas.push(c.employee_id); });
    (e.fijos || []).forEach(function (f) { personas.push(f.employee_id); });
    var bl = bloqueos(sem.inicio, personas);
    if (bl.disputas.length) return { ok: false, error: 'EN_DISPUTA', mensaje: 'Hay una incidencia en disputa. Valídala con Magaly.', disputas: bl.disputas };
    (e.sos || []).forEach(function (so) {
      var ult = (S.avances[so.so_id] || []).filter(function (a) { return a.fecha <= sem.fin; }).reduce(function (m, a) { return Math.max(m, a.pct); }, 0);
      var ee = N.validarEstimados(ult, so.est_mie, so.est_jue); if (ee) err.push({ codigo: 'ESTIMADO_INVALIDO', so_id: so.so_id, mensaje: so.so_nombre + ': ' + ee });
    });
    var cd = N.candados({ personas: personas, alertas: [], sos: (e.sos || []).map(function (so) { var b = D.bolsaVigente(so.so_id);
      return { so_id: so.so_id, so_nombre: so.so_nombre, bolsa: b ? { supervisor: b.supervisor, tecnicos: b.tecnicos } : null, avance_jueves: so.est_jue,
               pagado: { supervisor: pagado(so.so_id, 'supervisor'), tecnicos: pagado(so.so_id, 'tecnicos') }, reparto: so.reparto }; }) });
    err = err.concat(cd.envio);
    (e.comercial || []).forEach(function (c) { if (c.excepcion && String(c.explicacion || '').trim().length < 10) err.push({ codigo: 'EXCEPCION_SIN_EXPLICACION', mensaje: 'El comercial del ' + c.fecha + ' con excepción necesita explicación.' }); });
    if (err.length) return { ok: false, error: 'CANDADOS', errores: err };
    var tar = Number(S.config.tarifa_comercial_usd) || 140, lineas = [], id = S.solicitudes.length + 1, ln = 1;
    (e.sos || []).forEach(function (so) { ['supervisor', 'tecnicos'].forEach(function (r) { Object.keys((so.reparto || {})[r] || {}).forEach(function (k) {
      var m = Number(so.reparto[r][k]); if (m > 0) lineas.push({ id: id * 100 + ln++, tipo: 'so', employee_id: Number(k), alias: alias(k), so_id: so.so_id, rol: r, monto: m,
        sugerido: so.sugerido && so.sugerido[r] ? so.sugerido[r][k] : null, cuenta: String(so.so_nombre).split(' - ')[0], excepcion: false }); }); }); });
    (e.comercial || []).forEach(function (c) { if (c.pct > 0) lineas.push({ id: id * 100 + ln++, tipo: 'comercial', employee_id: c.employee_id, alias: alias(c.employee_id), fecha: c.fecha,
      monto: N._d(Math.round(N._c(tar) * c.pct / 100)), sugerido: N._d(Math.round(N._c(tar) * (c.sugerido || 0) / 100)), excepcion: !!c.excepcion, explicacion: c.explicacion || null,
      cuenta: 'COMERCIAL-USA', detalle: { pct: c.pct, sugerido_pct: c.sugerido, estimado: !!c.estimado } }); });
    (e.fijos || []).forEach(function (f) { var fi = S.fichas.find(function (x) { return x.employee_id === f.employee_id; }), fal = S.alertas.filter(function (a) { return a.employee_id === f.employee_id && a.estado === 'falta_injustificada' && sem.dias.indexOf(a.fecha) >= 0; }).length;
      lineas.push({ id: id * 100 + ln++, tipo: 'fijo', employee_id: f.employee_id, alias: fi.alias, monto: N.fijoAsistencia(fi.fijo_semanal_usd, fal), cuenta: 'COMERCIAL-USA', detalle: { faltas: fal, fijo: fi.fijo_semanal_usd } }); });
    var s = { id: id, semana: sem.inicio, estado: 'enviada', enviada_por: q.actor, enviada_at: new Date().toISOString(), envio: e, lineas: lineas,
              sos: (e.sos || []).map(function (so) { return { so_id: so.so_id, so_nombre: so.so_nombre, est_mie: so.est_mie, est_jue: so.est_jue }; }) };
    S.solicitudes.push(s); D.log(q.actor, 'solicitud_enviada', 'semana:' + s.semana, null, { id: id });
    return { ok: true, id: id };
  });

  D.reg('pedir_revision', ['nomina_usa:kiosko'], function (p, q) {
    var a = S.alertas.find(function (x) { return x.id === Number(p.id); });
    if (!a) return { ok: false, error: 'ALERTA_INEXISTENTE' };
    if (a.estado !== 'en_disputa') return { ok: false, error: 'NO_ESTA_EN_DISPUTA' };
    a.revision_pedida_por = q.actor; D.log(q.actor, 'revision_pedida', 'alerta:' + a.id);
    return { ok: true, notificada: S.config.alertas_modo === 'real', modo: S.config.alertas_modo };
  });
  function porId(id) { return S.solicitudes.find(function (s) { return s.id === Number(id); }); }
  function ver(s) { return { ok: true, solicitud: s, sos: s.sos, lineas: s.lineas, bloqueos: bloqueos(s.semana, s.lineas.map(function (l) { return l.employee_id; })) }; }
  var TODOS = ['nomina_usa:kiosko', 'nomina_usa:validar', 'nomina_usa:autorizar', 'nomina_usa:archivo'];
  D.reg('solicitudes', TODOS, function () { return { ok: true, solicitudes: S.solicitudes.slice().reverse().map(function (s) { return { id: s.id, semana: s.semana, estado: s.estado, total: s.lineas.reduce(function (a, l) { return a + (l.autorizado_monto != null ? l.autorizado_monto : l.monto); }, 0) }; }) }; });
  D.reg('solicitud_ver', TODOS, function (p) { var s = p.id ? porId(p.id) : viva(p.semana); return s ? ver(s) : { ok: false, error: 'SOLICITUD_INEXISTENTE' }; });
  D.reg('solicitud_validar', ['nomina_usa:validar'], function (p, q) {
    var s = porId(p.id); if (!s) return { ok: false, error: 'SOLICITUD_INEXISTENTE' };
    if (s.estado !== 'enviada') return { ok: false, error: 'ESTADO_INVALIDO' };
    var b = bloqueos(s.semana, s.lineas.map(function (l) { return l.employee_id; }));
    if (b.disputas.length) return { ok: false, error: 'EN_DISPUTA', disputas: b.disputas };
    if (b.dias_pendientes.length) return { ok: false, error: 'DIA_SIN_VALIDAR', dias: b.dias_pendientes };
    s.estado = 'validada'; s.validada_por = q.actor; D.log(q.actor, 'solicitud_validada', 'solicitud:' + s.id); return { ok: true };
  });
  D.reg('solicitud_autorizar', ['nomina_usa:autorizar'], function (p, q) {
    var s = porId(p.id); if (!s) return { ok: false, error: 'SOLICITUD_INEXISTENTE' };
    if (s.estado !== 'validada') return { ok: false, error: 'NO_VALIDADA', mensaje: 'Magaly tiene que validar antes de autorizar.' };
    var b = bloqueos(s.semana, s.lineas.map(function (l) { return l.employee_id; }));
    if (b.dias_pendientes.length) return { ok: false, error: 'DIA_SIN_VALIDAR' };
    var dec = {}; (p.decisiones || []).forEach(function (x) { dec[x.linea_id] = x; });
    var falta = s.lineas.some(function (l) { return l.excepcion && !dec[l.id]; });
    if (falta) return { ok: false, error: 'EXCEPCION_SIN_DECISION', mensaje: 'Aprueba o baja al sugerido cada comercial con excepción.' };
    s.lineas.forEach(function (l) { var x = dec[l.id]; l.decision = x ? x.decision : 'aprobar'; l.autorizado_monto = x && x.decision === 'bajar_sugerido' ? (l.sugerido || 0) : l.monto; });
    s.estado = 'autorizada'; s.autorizada_por = q.actor; D.log(q.actor, 'solicitud_autorizada', 'solicitud:' + s.id, null, p.decisiones); return { ok: true };
  });
  D.reg('solicitud_devolver', ['nomina_usa:validar', 'nomina_usa:autorizar'], function (p, q) {
    var s = porId(p.id); if (!s || ['enviada', 'validada'].indexOf(s.estado) < 0) return { ok: false, error: 'ESTADO_INVALIDO' };
    if (String(p.motivo || '').trim().length < 5) return { ok: false, error: 'MOTIVO_REQUERIDO' };
    s.estado = 'devuelta'; s.devuelta_motivo = p.motivo; D.log(q.actor, 'solicitud_devuelta', 'solicitud:' + s.id, null, null, p.motivo); return { ok: true };
  });
  D.reg('solicitud_archivo', ['nomina_usa:archivo'], function (p, q) {
    var s = porId(p.id); if (!s || ['autorizada', 'subida'].indexOf(s.estado) < 0) return { ok: false, error: 'NO_AUTORIZADA' };
    var g = {}; s.lineas.forEach(function (l) { var k = l.employee_id + '|' + l.cuenta; g[k] = g[k] || { employee_id: l.employee_id, persona: l.alias, cuenta: l.cuenta, neto: 0, semana: s.semana }; g[k].neto = N._d(N._c(g[k].neto) + N._c(l.autorizado_monto)); });
    s.archivo_at = s.archivo_at || new Date().toISOString(); D.log(q.actor, 'archivo_descargado', 'solicitud:' + s.id);
    return { ok: true, semana: s.semana, lineas: Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return x.neto !== 0; }) };
  });
  D.reg('solicitud_subida', ['nomina_usa:archivo'], function (p, q) {
    var s = porId(p.id); if (!s || s.estado !== 'autorizada') return { ok: false, error: 'NO_AUTORIZADA' };
    if (!s.archivo_at) return { ok: false, error: 'ARCHIVO_NO_DESCARGADO' };
    s.estado = 'subida'; s.subida_por = q.actor; D.log(q.actor, 'subida_auris', 'solicitud:' + s.id); return { ok: true };
  });
})(window);
