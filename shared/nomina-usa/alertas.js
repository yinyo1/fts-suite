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

  /* ── Zona horaria por coordenadas (ajuste de Esteban, 2-nov) ───────────────────────────────
   * Mateo, José Luis y Ricardo viajan entre California y Texas: la alerta de entrada se evalúa
   * en la zona de su ÚLTIMA checada, no en una fija. Odoo no guarda la zona de la checada, pero
   * sí la ubicación de entrada (in_latitude / in_longitude), y con eso basta.
   * Es una APROXIMACIÓN por franjas, a propósito chica para poder embeberla en n8n (el contorno
   * real pesa 500 KB): la frontera con México va como polilínea de ~25 puntos y las fronteras
   * entre zonas de EE.UU. como líneas de longitud por banda de latitud. Es exacta para donde
   * trabajan (California, Texas, Nuevo León) y puede fallar a unos km de una frontera de zona
   * dentro de EE.UU. o junto al río Bravo. Sin ubicación devuelve null: nunca inventa. */
  var FRONTERA_MX = [[-117.13, 32.53], [-114.72, 32.72], [-111.07, 31.33], [-108.21, 31.33], [-108.2, 31.78], [-106.53, 31.78],
    [-106.45, 31.74], [-105.85, 31.29], [-104.9, 30.6], [-104.37, 29.56], [-103.6, 29.16], [-103.15, 28.98], [-102.9, 29.18],
    [-102.45, 29.78], [-101.4, 29.77], [-100.9, 29.36], [-100.5, 28.71], [-99.95, 27.95], [-99.5, 27.5], [-99.27, 26.9],
    [-98.82, 26.38], [-98.3, 26.11], [-97.7, 26.05], [-97.5, 25.9], [-97.14, 25.96]];
  function latFrontera(lng) {
    for (var i = 1; i < FRONTERA_MX.length; i++) {
      var a = FRONTERA_MX[i - 1], b = FRONTERA_MX[i];
      if (lng >= a[0] && lng <= b[0]) return a[1] + (b[1] - a[1]) * (lng - a[0]) / (b[0] - a[0]);
    }
    return null;
  }
  function enMexico(lat, lng) {
    if (lng < -117.13) return lat < 32.53;
    if (lng <= -97.14) return lat < latFrontera(lng);
    return lat < 25.8 && lng < -86.7;      // costa del Golfo y Yucatán; Florida queda fuera
  }
  function zonaDeCoordenadas(lat, lng) {
    lat = Number(lat); lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;   // 0,0 = Odoo sin ubicación
    if (lat < 14 || lat > 50 || lng < -125 || lng > -66) return null;               // fuera de México y EE.UU. continental
    if (enMexico(lat, lng)) return 'America/Monterrey';
    if (lat >= 31.33 && lat <= 37 && lng >= -114.82 && lng <= -109.05) return 'America/Phoenix';
    if (lng <= -114.05) return 'America/Los_Angeles';
    var oeste = lat < 32 ? -104.92 : lat < 37 ? -103.04 : -101;      // Mountain | Central
    if (lng <= oeste) return 'America/Denver';
    var este = lat < 37 ? -85.3 : -86.5;                              // Central | Eastern
    return lng <= este ? 'America/Chicago' : 'America/New_York';
  }
  /** Zona en la que se evalúa a una persona: la de su ÚLTIMA checada (entrada o salida) anterior a
   *  `ahora` con ubicación; si no hay ninguna, la de la ficha; si tampoco, Monterrey.
   *  atts: [{check_in, check_out, in_latitude, in_longitude, out_latitude, out_longitude}] */
  function zonaUltimaChecada(atts, ahora, zonaFicha) {
    var lim = ahora instanceof Date ? ahora : new Date(ahora), mejor = null;
    (atts || []).forEach(function (a) {
      [['check_in', 'in_latitude', 'in_longitude'], ['check_out', 'out_latitude', 'out_longitude']].forEach(function (k) {
        var t = utc(a[k[0]]); if (!t || t > lim) return;
        var z = zonaDeCoordenadas(a[k[1]], a[k[2]]); if (!z) return;
        if (!mejor || t > mejor.t) mejor = { t: t, zona: z };
      });
    });
    return mejor ? { zona: mejor.zona, fuente: 'ultima_checada', at: mejor.t.toISOString() }
                 : { zona: zonaFicha || 'America/Monterrey', fuente: zonaFicha ? 'ficha' : 'omision', at: null };
  }
  /** Alertas de UNA persona en el instante `ahora`. Es lo que corre el workflow cada 15 min y lo que
   *  repite la prueba de octubre. p: {employee_id, hora_ref, zona, fuente}. mias: sus asistencias
   *  recientes (abiertas o de las últimas 40 h). historial: sus asistencias con ubicación (para la
   *  zona de la última checada; solo se usa si p.fuente === 'ficha'). par: {tolerancia_min, salida_horas, festivos}. */
  function alertasPersona(p, mias, historial, ahora, par) {
    par = par || {};
    var z = p.fuente === 'ficha' ? zonaUltimaChecada(historial, ahora, p.zona) : { zona: p.zona || 'America/Monterrey', fuente: 'padron', at: null };
    var pz = { employee_id: p.employee_id, hora_ref: p.hora_ref, zona: z.zona };
    var hoy = local(ahora, z.zona).fecha;
    var entradasHoy = (mias || []).filter(function (a) { return local(utc(a.check_in), z.zona).fecha === hoy; }).length;
    var e = entradaFaltante(pz, entradasHoy, ahora, par.tolerancia_min, par.festivos), out = [];
    if (e.alerta) out.push({ clave: e.clave, tipo: 'entrada_faltante', employee_id: p.employee_id, fecha: e.fecha, attendance_id: null,
      detalle: { hora_ref: p.hora_ref, zona: z.zona, zona_fuente: z.fuente, zona_ficha: p.zona || null, segundos_tarde: e.segundos_tarde, fuente: p.fuente } });
    (mias || []).forEach(function (a) {
      salidaFaltante(a, ahora, par.salida_horas, z.zona).forEach(function (x) {
        out.push({ clave: x.clave, tipo: x.tipo, employee_id: p.employee_id, fecha: x.fecha, attendance_id: a.id,
          detalle: { check_in_utc: a.check_in, zona: z.zona, zona_fuente: z.fuente } });
      });
    });
    return { zona: z, entrada: e, alertas: out };
  }
  var ZONAS_USA = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York'];
  function esZonaUSA(z) { return ZONAS_USA.indexOf(z) >= 0; }

  NU.alertas = { local: local, utc: utc, entradaFaltante: entradaFaltante, salidaFaltante: salidaFaltante,
    incidencias: incidencias, sosPorDia: sosPorDia, dias: dias,
    zonaDeCoordenadas: zonaDeCoordenadas, zonaUltimaChecada: zonaUltimaChecada, esZonaUSA: esZonaUSA, alertasPersona: alertasPersona };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.alertas;
})(typeof window !== 'undefined' ? window : globalThis);
