/* ═══ Nómina USA · evidencia comercial para el sugerido de «Tu día» (#448, paso 6) ═══
 *
 * Puras, sin dependencias: navegador, Node y Code node de n8n. Sin diagonales invertidas
 * (se embebe en n8n, CLAUDE.md §17 2c).
 *
 * Regla (decisión de Esteban, #448):
 *   · Un bloque de horas (una asistencia) cuenta como OBRA si tiene SO y hay evidencia de obra:
 *       - la checada de entrada está en la planta del cliente de esa SO, o
 *       - ese día local hubo una compra de material con la tarjeta de la persona.
 *   · Todo lo demás cuenta como COMERCIAL: sin SO, o con SO pero sin evidencia de obra.
 *   · Sugerido = horas comerciales / horas checadas, redondeado a 10 %.
 *
 * La PLANTA de una SO no sale de la propia persona (sería circular: siempre estaría «en
 * planta»): sale de las checadas de OTRAS personas con esa SO. Se toma el punto con más
 * vecinos dentro del radio y, si al menos `minPuntos` checadas coinciden, el centro de ese
 * grupo es la planta. Si no hay grupo, la planta queda DESCONOCIDA y la ubicación no aporta
 * (decide la compra de material). Nunca se inventa una planta.
 */
(function (root) {
  'use strict';
  var NU = root.NominaUSA = root.NominaUSA || {};

  var PROVEEDORES_MATERIAL = ['platt', 'grainger', 'home depot', 'lowe', 'elliott electric', 'graybar', 'ferguson',
    'fastenal', 'mcmaster', 'border states', 'crescent electric', 'wesco', 'rexel', 'mayer electric', 'ced '];

  function rad(g) { return g * Math.PI / 180; }
  function distanciaM(a, b) {
    if (!a || !b || !isFinite(a.lat) || !isFinite(a.lng) || !isFinite(b.lat) || !isFinite(b.lng)) return null;
    var R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Odoo guarda 0,0 cuando no hubo ubicación: eso no es un punto.
  function puntoValido(p) { return !!p && isFinite(p.lat) && isFinite(p.lng) && !(Number(p.lat) === 0 && Number(p.lng) === 0); }

  /** Planta de una SO a partir de checadas de OTRAS personas: [{lat,lng}]. */
  function plantaDe(puntos, radioM, minPuntos) {
    radioM = radioM || 500; minPuntos = minPuntos || 2;
    var ps = (puntos || []).filter(puntoValido), mejor = null;
    ps.forEach(function (p) {
      var vecinos = ps.filter(function (q) { return distanciaM(p, q) <= radioM; });
      if (!mejor || vecinos.length > mejor.length) mejor = vecinos;
    });
    if (!mejor || mejor.length < minPuntos) return null;
    var lat = 0, lng = 0;
    mejor.forEach(function (q) { lat += Number(q.lat); lng += Number(q.lng); });
    return { lat: lat / mejor.length, lng: lng / mejor.length, puntos: mejor.length };
  }

  function esCompraMaterial(proveedor, lista) {
    var t = ' ' + String(proveedor || '').toLowerCase() + ' ';
    return (lista || PROVEEDORES_MATERIAL).some(function (k) { return t.indexOf(String(k).toLowerCase()) >= 0; });
  }

  function redondear10(pct) { return Math.round(pct / 10) * 10; }

  /** Un día de una persona.
   *  bloques: [{attendance_id, horas, so_id, lat, lng}]  (ya del día local, sin ráfagas)
   *  compras: [{monto, proveedor}] del día local, de la tarjeta de la persona
   *  plantas: {so_id: {lat,lng}|null}
   *  opts: {radio_m, proveedores} */
  function evaluarDia(bloques, compras, plantas, opts) {
    opts = opts || {};
    var radio = opts.radio_m || 500;
    var material = (compras || []).filter(function (c) { return Number(c.monto) < 0 && esCompraMaterial(c.proveedor, opts.proveedores); });
    var tot = 0, com = 0, det = [];
    (bloques || []).forEach(function (b) {
      var h = Math.max(0, Number(b.horas) || 0), motivo, obra = false;
      if (!b.so_id) motivo = 'SIN_SO';
      else {
        var pl = plantas ? plantas[b.so_id] : null, d = (pl && puntoValido(b)) ? distanciaM(b, pl) : null;
        if (d != null && d <= radio) { obra = true; motivo = 'EN_PLANTA'; }
        else if (material.length) { obra = true; motivo = 'COMPRA_MATERIAL'; }
        else motivo = pl ? 'FUERA_DE_PLANTA' : 'PLANTA_DESCONOCIDA_SIN_COMPRA';
        b = Object.assign({}, b, { dist_planta_m: d == null ? null : Math.round(d) });
      }
      tot += h; if (!obra) com += h;
      det.push({ attendance_id: b.attendance_id, so_id: b.so_id || null, horas: Math.round(h * 100) / 100, obra: obra, motivo: motivo,
                 dist_planta_m: b.dist_planta_m == null ? null : b.dist_planta_m });
    });
    var sugerido = tot > 0 ? redondear10(Math.min(1, Math.max(0, com / tot)) * 100) : 0;
    return { horas_checadas: Math.round(tot * 100) / 100, horas_comerciales: Math.round(com * 100) / 100, sugerido: sugerido,
             compras_material: material.map(function (c) { return { proveedor: c.proveedor, monto: Number(c.monto) }; }), bloques: det };
  }

  // Partes locales de un instante (misma técnica que alertas.js).
  function fechaLocal(fecha, tz) {
    var d = fecha instanceof Date ? fecha : new Date(fecha);
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' });
    var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }
  function utc(s) { if (s == null || s === false) return null; if (s instanceof Date) return s; var t = String(s); return new Date(t.indexOf('T') >= 0 ? t : t.replace(' ', 'T') + 'Z'); }
  function m2o(v) { return Array.isArray(v) ? v[0] : (v || null); }

  /** Arma los días de UNA persona desde Odoo.
   *  atts: hr.attendance de la persona {id, check_in, check_out, x_studio_project_id, in_latitude, in_longitude}
   *  cuadrilla: hr.attendance de OTRAS personas (para las plantas), mismos campos
   *  compras: account.bank.statement.line de su tarjeta {date, amount, payment_ref}
   *  opts: {zona, ahora, radio_m, min_puntos, tope_horas, proveedores} */
  function evaluarPersona(atts, cuadrilla, compras, opts) {
    opts = opts || {};
    var zona = opts.zona, ahora = opts.ahora ? new Date(opts.ahora) : new Date(), tope = opts.tope_horas || 14;
    var porSo = {};
    (cuadrilla || []).forEach(function (a) { var so = m2o(a.x_studio_project_id); if (so) (porSo[so] = porSo[so] || []).push({ lat: Number(a.in_latitude), lng: Number(a.in_longitude) }); });
    var plantas = {};
    Object.keys(porSo).forEach(function (so) { plantas[so] = plantaDe(porSo[so], opts.radio_m, opts.min_puntos); });
    var dias = {};
    (atts || []).forEach(function (a) {
      var ent = utc(a.check_in), sal = a.check_out ? utc(a.check_out) : ahora;
      var horas = (sal - ent) / 3600000;
      if (a.check_out && horas < 1 / 60) return;              // ráfaga: no es un bloque
      var f = fechaLocal(ent, zona);
      (dias[f] = dias[f] || []).push({ attendance_id: a.id, horas: Math.min(tope, horas), so_id: m2o(a.x_studio_project_id),
        lat: Number(a.in_latitude), lng: Number(a.in_longitude) });
    });
    var comprasDia = {};
    (compras || []).forEach(function (c) { var f = String(c.date).slice(0, 10); (comprasDia[f] = comprasDia[f] || []).push({ monto: c.amount, proveedor: c.payment_ref }); });
    return Object.keys(dias).sort().map(function (f) {
      return Object.assign({ fecha: f }, evaluarDia(dias[f], comprasDia[f] || [], plantas, opts));
    });
  }

  NU.evidencia = { distanciaM: distanciaM, plantaDe: plantaDe, esCompraMaterial: esCompraMaterial, evaluarDia: evaluarDia,
    evaluarPersona: evaluarPersona, fechaLocal: fechaLocal, PROVEEDORES_MATERIAL: PROVEEDORES_MATERIAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.evidencia;
})(typeof window !== 'undefined' ? window : globalThis);
