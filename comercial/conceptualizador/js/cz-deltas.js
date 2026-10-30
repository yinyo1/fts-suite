/* ── cz-deltas · recotización: qué cambia por SECCIÓN entre el machote base y la propuesta (V1.65, fts-suite#442) ──
 *
 * Un caso de recotización parte de un machote que ya existe (caso.recotizacion). El agente propone una versión nueva del MISMO
 * machote; la persona aprueba o rechaza sección por sección y solo lo aprobado se guarda. Aquí vive la regla, en UN solo lugar
 * (pantalla y pruebas): qué sección es la misma, qué cambió y cómo se mezcla.
 *
 *   deltas(base, propuesto, calcular?) → [{ clave, nombre, estado: 'sin_cambio'|'modificada'|'nueva'|'eliminada',
 *                                          renglones: { nuevos, quitados, cambian }, costo: {antes, despues}, precio: {antes, despues} }]
 *   mezclar(base, propuesto, aprobadas[]) → el documento a guardar: el BASE con las secciones aprobadas tomadas de la propuesta
 *                                          (y las eliminadas aprobadas quitadas). Lo no aprobado se queda como estaba.
 *
 * Una sección es la misma si trae el mismo `id`; si no, por su nombre normalizado. Un renglón es el mismo por su descripción
 * normalizada (o su rol, en mano de obra). Sin dependencias: corre en el navegador (G.CzDeltas) y en node (module.exports). */
(function (G) {
  'use strict';
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  var vacio = function (v) { return v === null || v === undefined || v === ''; };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : null; };
  function claveSec(s, i) { return s && s.id ? 'id:' + s.id : 'n:' + (norm(s && s.nombre) || ('#' + i)); }
  /* Solo cuenta lo que pesa en la cotización: un renglón vacío (sin descripción, sin cantidad y sin precio) es relleno del editor. */
  function renglones(s) {
    var L = {};
    ((s && s.partidas) || []).forEach(function (p) {
      if (vacio(p.pu) && (vacio(p.qty) || Number(p.qty) === 0)) return;   // sin precio ni cantidad: renglón de plantilla del editor
      var k = 'p:' + norm(p.descripcion) + '|' + norm(p.tipo);
      L[k] = { qty: num(p.qty), pu: num(p.pu), unidad: norm(p.unidad), moneda: norm(p.moneda), no_aplica: p.no_aplica === true };
    });
    ((s && s.mo) || []).forEach(function (m) {
      if (vacio(m.qty) || Number(m.qty) === 0) return;
      L['m:' + norm(m.rol)] = { qty: num(m.qty), pu: num(m.pu), personas: num(m.personas) };
    });
    return L;
  }
  function comparar(a, b) {
    var A = renglones(a), B = renglones(b), r = { nuevos: 0, quitados: 0, cambian: 0 };
    Object.keys(B).forEach(function (k) { if (!(k in A)) r.nuevos++; else if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) r.cambian++; });
    Object.keys(A).forEach(function (k) { if (!(k in B)) r.quitados++; });
    return r;
  }
  function porSeccion(doc, calcular) {
    var out = {};
    if (typeof calcular !== 'function' || !doc) return out;
    try {
      var c = calcular(doc), S = (c && c.secciones) || [];
      (doc.secciones || []).forEach(function (s, i) { var x = S[i]; if (x) out[claveSec(s, i)] = { costo: num(x.costo), precio: num(x.precio) }; });
    } catch (e) { /* sin motor: sin montos, los renglones igual se comparan */ }
    return out;
  }
  function deltas(base, propuesto, calcular) {
    var B = (base && base.secciones) || [], P = (propuesto && propuesto.secciones) || [], out = [];
    var $B = porSeccion(base, calcular), $P = porSeccion(propuesto, calcular), tomada = {};
    // La misma sección: primero por id; si no, por nombre, entre las del base que nadie tomó todavía.
    var par = P.map(function (s, i) {
      var j = s && s.id ? B.findIndex(function (x) { return x && x.id === s.id; }) : -1;
      if (j < 0 || tomada[j]) j = B.findIndex(function (x, k) { return !tomada[k] && norm(x && x.nombre) && norm(x.nombre) === norm(s && s.nombre); });
      if (j >= 0) tomada[j] = 1;
      return j;
    });
    P.forEach(function (s, i) {
      var j = par[i], b = j >= 0 ? B[j] : null, k = b ? claveSec(b, j) : claveSec(s, i), kp = claveSec(s, i);
      var r = comparar(b || {}, s);
      var estado = !b ? 'nueva' : (r.nuevos || r.quitados || r.cambian || norm(b.nombre) !== norm(s.nombre)) ? 'modificada' : 'sin_cambio';
      out.push({ clave: k, clave_propuesta: kp, nombre: s.nombre || (b && b.nombre) || '', estado: estado, renglones: r,
        costo: { antes: b ? ($B[k] || {}).costo : null, despues: ($P[kp] || {}).costo }, precio: { antes: b ? ($B[k] || {}).precio : null, despues: ($P[kp] || {}).precio } });
    });
    B.forEach(function (s, j) {
      if (tomada[j]) return;
      var k = claveSec(s, j);
      out.push({ clave: k, clave_propuesta: null, nombre: s.nombre || '', estado: 'eliminada', renglones: comparar(s, {}),
        costo: { antes: ($B[k] || {}).costo, despues: null }, precio: { antes: ($B[k] || {}).precio, despues: null } });
    });
    return out;
  }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function mezclar(base, propuesto, aprobadas, calcular) {
    var doc = copia(base || {}), D = deltas(base, propuesto, calcular), ok = {};
    (aprobadas || []).forEach(function (k) { ok[k] = 1; });
    var P = (propuesto && propuesto.secciones) || [], mP = {};
    P.forEach(function (s, i) { mP[claveSec(s, i)] = s; });
    var B = doc.secciones || [], mB = {};
    B.forEach(function (s, j) { mB[claveSec(s, j)] = j; });
    var secs = B.slice(), quitar = {}, nuevas = [], aplicadas = [], quedan = [];
    D.forEach(function (d) {
      if (d.estado === 'sin_cambio') return;
      if (!ok[d.clave]) { quedan.push(d.clave); return; }
      if (d.estado === 'modificada' && d.clave in mB) { var n = copia(mP[d.clave_propuesta]); if (B[mB[d.clave]].id) n.id = B[mB[d.clave]].id; secs[mB[d.clave]] = n; aplicadas.push(d.clave); }
      else if (d.estado === 'nueva') { nuevas.push(copia(mP[d.clave_propuesta])); aplicadas.push(d.clave); }
      else if (d.estado === 'eliminada' && d.clave in mB) { quitar[mB[d.clave]] = 1; aplicadas.push(d.clave); }
    });
    doc.secciones = secs.filter(function (s, j) { return !quitar[j]; }).concat(nuevas);
    return { documento: doc, aplicadas: aplicadas, rechazadas: quedan };
  }
  var API = { deltas: deltas, mezclar: mezclar, clave: claveSec };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (G) G.CzDeltas = API;
})(typeof window !== 'undefined' ? window : null);
