/* ═══ Nómina USA · alertas de checada e incidencias del periodo (#448, fase C) ═══
 *
 * Puras. La hora «ahora» se pasa siempre (nada de Date.now() escondido): así la prueba de
 * «15:00 no, 15:01 sí» es exacta y el workflow nomina-usa/alertas corre la MISMA función.
 * Funciona en el navegador, en Node y dentro de un Code node de n8n (usa Intl, sin require).
 *
 * Dos preguntas distintas, a propósito:
 *   · alertas (en vivo, L-V): ¿falta una checada AHORA? entrada a +tolerancia, salida a 14 h.
 *   · incidencias (del periodo, para la nómina): días sin checada, sin cerrar o sin SO.
 */
(function (root) {
  'use strict';
  var NU = root.NominaUSA = root.NominaUSA || {};

  // Partes locales de un instante en una zona IANA.
  function local(fecha, tz) {
    var d = fecha instanceof Date ? fecha : new Date(fecha);
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
    var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    return { fecha: o.year + '-' + o.month + '-' + o.day, seg: Number(o.hour) * 3600 + Number(o.minute) * 60 + Number(o.second), dow: dow };
  }
  function hhmmSeg(h) { var m = /^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(String(h || '')); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null; }
  // Odoo manda 'AAAA-MM-DD HH:MM:SS' en UTC sin Z (CLAUDE.md §11 #1).
  function utc(s) { if (s == null || s === false) return null; if (s instanceof Date) return s; var t = String(s); return new Date(/[zZ]|[+-][0-9][0-9]:?[0-9][0-9]$/.test(t) ? t : t.replace(' ', 'T') + 'Z'); }

  /** Entrada faltante. persona: {employee_id, hora_ref 'HH:MM', zona}. entradasDelDia: cuántas entradas
   *  tiene hoy (fecha local de la persona). Alerta si es lunes a viernes, no festivo, y pasaron MÁS de
   *  `tolMin` minutos de la hora de referencia: a +15:00 no, a +15:01 sí. Sin hora → nunca. */
  function entradaFaltante(persona, entradasDelDia, ahora, tolMin, festivos) {
    var ref = hhmmSeg(persona && persona.hora_ref);
    if (ref == null) return { alerta: false, motivo: 'SIN_HORA_REFERENCIA' };
    var l = local(ahora, persona.zona);
    if (l.dow === 0 || l.dow === 6) return { alerta: false, motivo: 'FIN_DE_SEMANA', fecha: l.fecha };
    if ((festivos || []).indexOf(l.fecha) >= 0) return { alerta: false, motivo: 'FESTIVO', fecha: l.fecha };
    if (entradasDelDia > 0) return { alerta: false, motivo: 'YA_CHECO', fecha: l.fecha };
    var tol = (tolMin == null ? 15 : tolMin) * 60;
    var pasados = l.seg - ref;
    return { alerta: pasados > tol, motivo: pasados > tol ? 'ENTRADA_FALTANTE' : 'EN_TOLERANCIA', fecha: l.fecha, segundos_tarde: pasados,
             clave: 'entrada:' + persona.employee_id + ':' + l.fecha };
  }

  /** Salida faltante de una asistencia abierta. A las `horas` desde la entrada: aviso a la persona.
   *  Al día siguiente (fecha local posterior) sigue abierta: alerta a RH. Devuelve 0, 1 o 2 alertas. */
  function salidaFaltante(att, ahora, horas, zona) {
    if (!att || att.check_out) return [];
    var ent = utc(att.check_in), now = ahora instanceof Date ? ahora : new Date(ahora);
    var h = (horas == null ? 14 : horas) * 3600 * 1000, out = [];
    if (now - ent >= h) out.push({ tipo: 'salida_faltante', para: 'persona', clave: 'salida:' + att.id, attendance_id: att.id, fecha: local(ent, zona).fecha });
    if (local(now, zona).fecha > local(ent, zona).fecha && now - ent >= h)
      out.push({ tipo: 'salida_faltante_rh', para: 'rh', clave: 'salida_rh:' + att.id, attendance_id: att.id, fecha: local(ent, zona).fecha });
    return out;
  }

  function dias(desde, hasta) {
    var out = [], d = new Date(desde + 'T12:00:00Z'), h = new Date(hasta + 'T12:00:00Z');
    for (; d <= h; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
    return out;
  }

  /** Incidencias de un periodo para la nómina, de las asistencias de Odoo de UNA persona.
   *  · sin_checada: día del periodo sin ninguna entrada (RH decide: descanso, falta justificada o no).
   *  · sin_cerrar: abierta, o cerrada después de `horas` (el olvido que se cerró a la mañana siguiente).
   *  · sin_so: cerrada sin proyecto (x_studio_project_id vacío).
   *  · rafaga: duró menos de 1 minuto (checada de prueba o doble toque): se marca, no cuenta. */
  function incidencias(atts, desde, hasta, zona, horas) {
    var lim = (horas == null ? 14 : horas) * 3600 * 1000, porDia = {}, out = [];
    (atts || []).forEach(function (a) {
      var ent = utc(a.check_in), sal = utc(a.check_out), f = local(ent, zona).fecha;
      if (f < desde || f > hasta) return;
      var dur = sal ? sal - ent : null;
      if (dur != null && dur < 60000) { out.push({ fecha: f, tipo: 'rafaga', attendance_id: a.id }); return; }
      porDia[f] = true;
      if (!sal || dur > lim) out.push({ fecha: f, tipo: 'sin_cerrar', attendance_id: a.id, horas: dur == null ? null : Math.round(dur / 36000) / 100 });
      var so = a.x_studio_project_id;
      if (sal && (so === false || so == null || (Array.isArray(so) && !so.length))) out.push({ fecha: f, tipo: 'sin_so', attendance_id: a.id });
    });
    dias(desde, hasta).forEach(function (f) { if (!porDia[f]) out.push({ fecha: f, tipo: 'sin_checada', attendance_id: null }); });
    out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    return out;
  }

  /** SO de cada día (para cruzar contra la bolsa): {fecha: [nombres de SO]} de asistencias cerradas. */
  function sosPorDia(atts, desde, hasta, zona) {
    var r = {};
    (atts || []).forEach(function (a) {
      var f = local(utc(a.check_in), zona).fecha; if (f < desde || f > hasta) return;
      var so = a.x_studio_project_id, nom = Array.isArray(so) ? so[1] : (so || null);
      if (!nom) return;
      var corto = String(nom).split(' - ')[0];
      r[f] = r[f] || []; if (r[f].indexOf(corto) < 0) r[f].push(corto);
    });
    return r;
  }

  NU.alertas = { local: local, utc: utc, entradaFaltante: entradaFaltante, salidaFaltante: salidaFaltante,
    incidencias: incidencias, sosPorDia: sosPorDia, dias: dias };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.alertas;
})(typeof window !== 'undefined' ? window : globalThis);
