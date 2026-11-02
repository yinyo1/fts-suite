/* ═══ Nómina USA · bolsas, solicitud del miércoles, candados y ajuste del viernes (#448, fases D-F) ═══
 *
 * Puras. Montos NETOS en USD (Auris agrega impuestos). Todo dinero se redondea a centavos y
 * se compara en centavos enteros: un 0.1 + 0.2 no puede abrir un candado.
 * Semana FTS: viernes a jueves. Richard envía el miércoles: miércoles y jueves van ESTIMADOS,
 * y el viernes el sistema compara contra lo real y deja la diferencia en la siguiente solicitud.
 * La base (nomina_usa_0004/0005) vuelve a revisar los candados que mueven dinero.
 */
(function (root) {
  'use strict';
  var NU = root.NominaUSA = root.NominaUSA || {};

  var ROLES_BOLSA = {
    supervisor: ['supervisor_sr', 'supervisor_jr', 'he_supervisor', 'he_jr'],
    tecnicos: ['tecnicos', 'he_tecnicos']
  };
  function c(x) { return Math.round((Number(x) || 0) * 100); }       // a centavos
  function d(cents) { return Math.round(cents) / 100; }               // de centavos
  function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? 0 : n; }

  function iso(dt) { return dt.toISOString().slice(0, 10); }
  /** Semana FTS que contiene la fecha: { inicio (viernes), fin (jueves), dias[7], miercoles, jueves }. */
  function semanaFTS(fecha) {
    var t = new Date(String(fecha).slice(0, 10) + 'T12:00:00Z');
    var atras = (t.getUTCDay() + 2) % 7;                               // viernes = 0
    var ini = new Date(t.getTime() - atras * 86400000), dias = [];
    for (var i = 0; i < 7; i++) dias.push(iso(new Date(ini.getTime() + i * 86400000)));
    return { inicio: dias[0], fin: dias[6], dias: dias, miercoles: dias[5], jueves: dias[6] };
  }

  /** Bolsa por rol desde el documento del machote digital (comercial.machote_version.documento).
   *  Σ personas × qty × pu de las líneas de MO de cada sección. Diseño, programación y viaje no entran. */
  function bolsaDeMachote(doc) {
    var r = { supervisor: 0, tecnicos: 0, moneda: null, lineas: 0 };
    ((doc && doc.secciones) || []).forEach(function (s) {
      (s.mo || []).forEach(function (m) {
        var rol = ROLES_BOLSA.supervisor.indexOf(m.rol) >= 0 ? 'supervisor' : (ROLES_BOLSA.tecnicos.indexOf(m.rol) >= 0 ? 'tecnicos' : null);
        if (!rol) return;
        var imp = num(m.personas || 1) * num(m.qty) * num(m.pu);
        if (imp > 0) { r[rol] = d(c(r[rol]) + c(imp)); r.lineas++; r.moneda = r.moneda || m.moneda || null; }
      });
    });
    return r;
  }

  /** Disponible de un rol: bolsa × avance − pagado, nunca negativo, nunca más que la bolsa − pagado. */
  function disponible(bolsa, avancePct, pagado) {
    var b = c(bolsa), tope = Math.min(b, Math.round(b * Math.min(100, Math.max(0, num(avancePct))) / 100));
    return d(Math.max(0, tope - c(pagado)));
  }

  /** Estimados de miércoles y jueves: no menores al último reportado ni al día anterior; 0–100. */
  function validarEstimados(ultimo, mie, jue) {
    var u = num(ultimo), m = num(mie), j = num(jue);
    if ([mie, jue].some(function (v) { return v === '' || v == null; })) return 'Faltan los estimados de miércoles y jueves.';
    if (m < 0 || j < 0 || m > 100 || j > 100) return 'El avance va de 0 a 100.';
    if (m < u) return 'El estimado del miércoles no puede ser menor al último reportado (' + u + '%).';
    if (j < m) return 'El estimado del jueves no puede ser menor al del miércoles (' + m + '%).';
    return null;
  }

  /** Reparto sugerido de un monto entre personas en proporción a horas. Cuadra al centavo
   *  (el residuo va a quien más horas tiene). horas: {employee_id: horas}. */
  function repartoSugerido(monto, horas) {
    var ids = Object.keys(horas || {}).filter(function (k) { return num(horas[k]) > 0; });
    var tot = ids.reduce(function (a, k) { return a + num(horas[k]); }, 0), cents = c(monto), out = {}, suma = 0;
    if (!ids.length || tot <= 0 || cents <= 0) { ids.forEach(function (k) { out[k] = 0; }); return out; }
    ids.forEach(function (k) { out[k] = Math.floor(cents * num(horas[k]) / tot); suma += out[k]; });
    var mayor = ids.slice().sort(function (a, b) { return num(horas[b]) - num(horas[a]); })[0];
    out[mayor] += cents - suma;
    ids.forEach(function (k) { out[k] = d(out[k]); });
    return out;
  }

  /** Candado del reparto de un rol: Σ montos ≤ disponible y ninguno negativo. */
  function validarReparto(montos, disp) {
    var s = 0, neg = false;
    Object.keys(montos || {}).forEach(function (k) { var v = c(montos[k]); if (v < 0) neg = true; s += v; });
    if (neg) return { ok: false, error: 'MONTO_NEGATIVO', mensaje: 'Ningún monto puede ser negativo.' };
    if (s > c(disp)) return { ok: false, error: 'EXCEDE_DISPONIBLE', mensaje: 'Repartes $' + d(s).toFixed(2) + ' y el disponible es $' + num(disp).toFixed(2) + '.', exceso: d(s - c(disp)) };
    return { ok: true, total: d(s) };
  }

  /** Comercial de Ricardo: tarifa × % comercial de cada día. dias: [{fecha, pct}]. */
  function pagoComercial(dias, tarifa) {
    var t = tarifa == null ? 140 : num(tarifa), tot = 0;
    var det = (dias || []).map(function (x) { var m = Math.round(c(t) * num(x.pct) / 100); tot += m; return { fecha: x.fecha, pct: num(x.pct), monto: d(m) }; });
    return { total: d(tot), dias: det };
  }

  /** Fijo por asistencia (Rissia): TODO O NADA (Esteban, 2-nov). Una sola falta INJUSTIFICADA confirmada
   *  por RH en la semana y el fijo no se paga; la justificada (permiso, vacaciones) no cuenta aquí. */
  function fijoAsistencia(fijo, faltasInjustificadas) {
    return num(faltasInjustificadas) > 0 ? 0 : d(c(fijo));
  }

  /** Candados del ENVÍO (Richard) y de la AUTORIZACIÓN (Erick).
   *  ctx: { sos:[{so_id, so_nombre, bolsa:{supervisor,tecnicos}|null, avance_jueves, pagado:{supervisor,tecnicos}, reparto:{supervisor:{id:monto}, tecnicos:{id:monto}}}],
   *         alertas:[{employee_id, estado}], dias_pendientes:[{employee_id, fecha}], personas:[ids en la solicitud] }
   *  Devuelve { envio: [errores], autorizacion: [errores] }. Un error = { codigo, mensaje, ... }. */
  function candados(ctx) {
    var envio = [], aut = [], personas = {};
    (ctx.personas || []).forEach(function (p) { personas[p] = true; });
    (ctx.sos || []).forEach(function (so) {
      var pide = ['supervisor', 'tecnicos'].some(function (r) { return so.reparto && so.reparto[r] && Object.keys(so.reparto[r]).some(function (k) { return num(so.reparto[r][k]) > 0; }); });
      if (!so.bolsa) { if (pide) envio.push({ codigo: 'SIN_BOLSA', so_id: so.so_id, mensaje: so.so_nombre + ' no tiene bolsa. Pide a Esteban que capture la provisional con folio.' }); return; }
      ['supervisor', 'tecnicos'].forEach(function (r) {
        var disp = disponible(so.bolsa[r], so.avance_jueves, (so.pagado || {})[r]);
        var v = validarReparto((so.reparto || {})[r] || {}, disp);
        if (!v.ok) envio.push({ codigo: v.error, so_id: so.so_id, rol: r, mensaje: so.so_nombre + ' · ' + r + ': ' + v.mensaje });
      });
    });
    (ctx.alertas || []).forEach(function (a) {
      if (a.estado === 'en_disputa' && personas[a.employee_id]) envio.push({ codigo: 'EN_DISPUTA', employee_id: a.employee_id, alerta_id: a.id, mensaje: 'Hay una incidencia en disputa. Valídala con Magaly.' });
    });
    (ctx.dias_pendientes || []).forEach(function (x) {
      if (personas[x.employee_id]) aut.push({ codigo: 'DIA_SIN_VALIDAR', employee_id: x.employee_id, fecha: x.fecha, mensaje: 'El día ' + x.fecha + ' está sin validar por RH.' });
    });
    return { envio: envio, autorizacion: aut };
  }

  /** Ajuste del viernes por comercial: tarifa × (real − estimado) de miércoles y jueves. */
  function ajusteComercial(estimados, reales, tarifa) {
    var t = tarifa == null ? 140 : num(tarifa), tot = 0, det = [];
    Object.keys(estimados || {}).forEach(function (f) {
      var e = num(estimados[f]), r = (reales || {})[f] == null ? 0 : num(reales[f]);
      var m = Math.round(c(t) * (r - e) / 100);
      if (m !== 0) det.push({ fecha: f, estimado: e, real: r, monto: d(m) });
      tot += m;
    });
    return { total: d(tot), dias: det };
  }

  /** Ajuste del viernes por avance estimado: bolsa × (real − estimado), por rol (informativo:
   *  el disponible de la semana siguiente ya lo absorbe porque se calcula con el avance real). */
  function ajusteAvance(bolsa, estimadoJueves, realJueves) {
    return { supervisor: d(Math.round(c(bolsa && bolsa.supervisor) * (num(realJueves) - num(estimadoJueves)) / 100)),
             tecnicos: d(Math.round(c(bolsa && bolsa.tecnicos) * (num(realJueves) - num(estimadoJueves)) / 100)) };
  }

  /** Archivo de netos para Auris. lineas: [{persona, employee_id, neto, cuenta, semana}]. CSV con coma,
   *  comillas dobles escapadas, montos con dos decimales y un renglón por persona y cuenta. */
  function csvAuris(lineas) {
    function q(v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var cab = 'persona,employee_id,neto_usd,cuenta,semana';
    var filas = (lineas || []).filter(function (l) { return c(l.neto) !== 0; })
      .map(function (l) { return [q(l.persona), q(l.employee_id), d(c(l.neto)).toFixed(2), q(l.cuenta), q(l.semana)].join(','); });
    return [cab].concat(filas).join('\n') + '\n';
  }

  NU.nomina = { ROLES_BOLSA: ROLES_BOLSA, semanaFTS: semanaFTS, bolsaDeMachote: bolsaDeMachote, disponible: disponible,
    validarEstimados: validarEstimados, repartoSugerido: repartoSugerido, validarReparto: validarReparto, pagoComercial: pagoComercial,
    fijoAsistencia: fijoAsistencia, candados: candados, ajusteComercial: ajusteComercial, ajusteAvance: ajusteAvance, csvAuris: csvAuris, _c: c, _d: d };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.nomina;
})(typeof window !== 'undefined' ? window : globalThis);
