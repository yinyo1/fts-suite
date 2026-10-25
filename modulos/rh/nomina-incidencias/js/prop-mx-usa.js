// ═══ Nómina · Incidencias — propuesta «Trabajó en USA» desde el reporte Días México / USA (#396 D-10) ═══
//
// El reporte rh/dias-mx-usa ya sabe, por persona y por SO, cuántos días confirmó Felipe
// como pagados por FTS USA. Esta pieza lo trae al cajón de la persona como PROPUESTA:
// RH la ve, la acepta con un clic y queda como una declaración normal. No se captura
// dos veces y nada se acepta solo.
//
// Tres reglas de diseño:
//  1. La lectura va por un fetch PROPIO, nunca por NomClient.call(): call() cierra la
//     sesión ante un 401, y quien no tenga el permiso rh:dias-mx-usa perdería su sesión
//     de Nómina por algo que sólo es una ayuda. Aquí cualquier fallo = no hay propuesta.
//  2. La parte que decide (¿ya está aceptada?, ¿qué nombre de SO usar?) es pura y se
//     prueba sin navegador.
//  3. Un pendiente no se propone: si el reporte tiene días sin confirmar, se dice cuántos
//     y por qué, y la propuesta sólo cubre lo confirmado.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NomPropMxUsa = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var PATH = '/webhook/rh/dias-mx-usa';
  var SIN_PERMISO = { SCOPE_INSUFICIENTE: 1 };
  var CACHE = {};

  function codigoSo(s) {
    var m = /^\s*(SO\d+)/i.exec(String(s || ''));
    return m ? m[1].toUpperCase() : null;
  }

  // El campo Proyecto de Nómina es texto libre elegido de una lista (S.proyectos). Se usa
  // el renglón de esa lista que sea la misma SO, para que la declaración aceptada se vea
  // igual que una capturada a mano.
  function resolverSo(nombre, proyectos) {
    var P = proyectos || [], n = String(nombre || '').trim(), i;
    for (i = 0; i < P.length; i++) if (String(P[i]).trim() === n) return P[i];
    var c = codigoSo(n);
    if (c) for (i = 0; i < P.length; i++) if (codigoSo(P[i]) === c) return P[i];
    return n;
  }

  function mismaSo(a, b) {
    var ca = codigoSo(a), cb = codigoSo(b);
    if (ca && cb) return ca === cb;
    return String(a || '').trim() === String(b || '').trim();
  }

  // Estado de UNA propuesta frente a lo ya declarado:
  //   nueva     → no hay declaración trabajo_usa de esa SO
  //   aceptada  → la hay, con los mismos días
  //   distinta  → la hay con otros días (idx dice cuál, para corregirla)
  function estado(prop, declaraciones, proyectos) {
    var so = resolverSo(prop.valores.so, proyectos), dias = Number(prop.valores.dias) || 0;
    var L = declaraciones || [];
    for (var i = 0; i < L.length; i++) {
      var d = L[i];
      if (!d || d.tipo !== 'trabajo_usa' || !d.valores) continue;
      if (!mismaSo(d.valores.so, so)) continue;
      return { so: so, dias: dias, idx: i, dias_declarados: Number(d.valores.dias) || 0,
               estado: (Number(d.valores.dias) || 0) === dias ? 'aceptada' : 'distinta' };
    }
    return { so: so, dias: dias, idx: -1, dias_declarados: 0, estado: 'nueva' };
  }

  // Aplica la propuesta sobre la lista de declaraciones (la muta) y dice qué hizo.
  function aceptar(prop, declaraciones, proyectos) {
    var e = estado(prop, declaraciones, proyectos);
    if (e.estado === 'aceptada') return 'sin_cambio';
    if (e.estado === 'distinta') { declaraciones[e.idx].valores.dias = e.dias; return 'corregida'; }
    declaraciones.push({ tipo: 'trabajo_usa', valores: { dias: e.dias, so: e.so } });
    return 'agregada';
  }

  // Índice por employee_id de lo que trae el reporte.
  function indexar(rep) {
    var out = {};
    ((rep && rep.personas) || []).forEach(function (p) { out[p.employee_id] = p; });
    return out;
  }

  // Lectura. Nunca lanza y nunca cierra sesión.
  async function leer(semanaId, base, token) {
    if (!token) return { ok: false, motivo: 'sin_sesion' };
    var res, j;
    try {
      res = await fetch(String(base).replace(/\/$/, '') + PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, semana: semanaId })
      });
    } catch (e) { return { ok: false, motivo: 'sin_red' }; }
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, motivo: res.status === 404 ? 'no_publicado' : 'http_' + res.status };
    if (j.success !== true) return { ok: false, motivo: SIN_PERMISO[j.error] ? 'sin_permiso' : (j.codigo || j.error || 'error') };
    if (!j.reporte || j.reporte.semana !== semanaId) return { ok: false, motivo: 'otra_semana' };
    return { ok: true, porEmpleado: indexar(j.reporte), demo: false };
  }

  // Ejemplo para el modo práctica: una persona con dos días en una SO de USA y un pendiente.
  function demo(semanaId, personas, proyectos) {
    var P = (personas || []).filter(function (p) { return !p.inactivo; });
    var so = (proyectos || []).filter(function (s) { return /mission/i.test(s); })[0] || 'SO11842 Mission Foods';
    var out = {};
    if (P[0]) out[P[0].id] = { employee_id: P[0].id, nombre: P[0].nombre, paga_mx: 3, paga_usa: 2, pendientes: 0,
      propuesta_trabajo_usa: [{ tipo: 'trabajo_usa', valores: { dias: 2, so: so }, fechas: [] }], como_salio: { pendiente: '' } };
    if (P[1]) out[P[1].id] = { employee_id: P[1].id, nombre: P[1].nombre, paga_mx: 2, paga_usa: 1, pendientes: 1,
      propuesta_trabajo_usa: [{ tipo: 'trabajo_usa', valores: { dias: 1, so: so }, fechas: [] }],
      como_salio: { pendiente: 'Pendiente 1 = mié 2: sin tipo (att 900001). No suma en ninguna columna hasta que Felipe lo confirme.' } };
    return { ok: true, porEmpleado: out, demo: true, semana: semanaId };
  }

  // Con caché por semana: el cajón se abre y se cierra muchas veces.
  function cargar(semanaId, opciones) {
    var o = opciones || {};
    if (CACHE[semanaId]) return CACHE[semanaId];
    CACHE[semanaId] = o.demo ? Promise.resolve(demo(semanaId, o.personas, o.proyectos)) : leer(semanaId, o.base, o.token);
    return CACHE[semanaId];
  }
  function olvidar() { CACHE = {}; }

  var MOTIVO = {
    sin_sesion: 'no hay sesión', sin_red: 'no hubo respuesta del servidor', no_publicado: 'el reporte todavía no está publicado',
    sin_permiso: 'tu usuario no tiene el permiso rh:dias-mx-usa', otra_semana: 'el servidor contestó otra semana'
  };
  function textoMotivo(m) { return MOTIVO[m] || ('error ' + m); }

  return { codigoSo: codigoSo, resolverSo: resolverSo, estado: estado, aceptar: aceptar, indexar: indexar,
           leer: leer, demo: demo, cargar: cargar, olvidar: olvidar, textoMotivo: textoMotivo };
});
