/* ═══ Nómina USA · reglas del kiosko (#448, fase B) ═══
 *
 * Puras: sin red, sin DOM, sin reloj implícito (la hora se pasa). Las usan el kiosko
 * (operaciones/kiosk/js/kiosko-usa.js), el webhook nomina-usa/kiosko (Code - Validar) y
 * las pruebas. La base vuelve a revisar lo que importa (avance que no baja, suma 100).
 *
 * LA REGLA QUE NO SE NEGOCIA: el flujo USA solo existe si (1) el interruptor general está
 * prendido, (2) la persona tiene su bandera y (3) la checada viene de Estados Unidos (o la
 * persona eligió USA porque no hubo ubicación). Cualquier otra combinación = flujo de México,
 * idéntico al de hoy.
 */
(function (root) {
  'use strict';
  var NU = root.NominaUSA = root.NominaUSA || {};

  /** País de la checada a partir del resultado de validarGeoConRegion del kiosko.
   *  'USA' | 'MX' | null (no se pudo decidir: sin ubicación o el contorno no cargó). */
  function clasificarPais(g) {
    if (!g) return null;
    if (g.zona === 'usa' || (g.zona === 'sitio' && g.pais === 'US')) return 'USA';
    if (g.zona === 'sitio' || g.zona === 'sin_restriccion') return 'MX';
    if (g.pais === 'NO_US') return 'MX';
    return null;
  }

  /** Qué flujo corre. kioskoCfg = shared/nomina-usa/kiosko.json; persona = su renglón.
   *  Devuelve 'mx' (el de hoy), 'pregunta_pais', 'so_entrada', 'plan_entrada',
   *  'avance_salida' o 'usa_normal' (USA sin pantalla extra). */
  function flujo(kioskoCfg, persona, tipo, pais) {
    if (!kioskoCfg || kioskoCfg.activo !== true) return 'mx';
    if (!persona || persona.activo !== true || !persona.perfil) return 'mx';
    if (tipo !== 'entrada' && tipo !== 'salida') return 'mx';
    if (pais === 'MX') return 'mx';
    if (pais == null) return 'pregunta_pais';
    if (persona.perfil === 'so_entrada') return tipo === 'entrada' ? 'so_entrada' : 'usa_normal';
    if (persona.perfil === 'plan_avance') return tipo === 'entrada' ? 'plan_entrada' : 'avance_salida';
    return 'usa_normal';
  }

  function entero(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }

  /** Avance de una SO: obligatorio, 0–100, nunca menor al último reportado. */
  function validarAvance(nuevo, ultimo) {
    var n = entero(nuevo), u = entero(ultimo) || 0;
    if (n == null) return 'Falta el % de avance.';
    if (n < 0 || n > 100 || Math.round(n) !== n) return 'El avance va de 0 a 100, en enteros.';
    if (n < u) return 'El avance no puede bajar: el último fue ' + u + '%.';
    return null;
  }

  /** Reparto del día (plan o real): renglones {clave, pct}; comercial es clave 'COMERCIAL'.
   *  Debe sumar exactamente 100, sin negativos, sin claves repetidas, al menos un renglón > 0. */
  function validarReparto(lineas) {
    if (!Array.isArray(lineas) || !lineas.length) return 'Agrega al menos una SO o comercial.';
    var vistas = {}, suma = 0;
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i], p = entero(l && l.pct);
      if (!l || !l.clave) return 'Cada renglón necesita su SO o «Comercial».';
      if (vistas[l.clave]) return 'Repetiste un renglón.';
      vistas[l.clave] = true;
      if (p == null || p < 0 || p > 100 || Math.round(p) !== p) return 'Cada % va de 0 a 100, en enteros.';
      suma += p;
    }
    if (suma !== 100) return 'Tu día tiene que sumar 100%. Ahora suma ' + suma + '%.';
    return null;
  }

  function pctComercial(lineas) {
    var l = (lineas || []).find(function (x) { return x.clave === 'COMERCIAL'; });
    return l ? entero(l.pct) || 0 : 0;
  }

  /** Sugerido = horas comerciales con evidencia / horas checadas, redondeado a 10 %. */
  function sugeridoComercial(horasComercialesEvidencia, horasChecadas) {
    var h = Number(horasChecadas), c = Number(horasComercialesEvidencia) || 0;
    if (!(h > 0)) return 0;
    var pct = Math.min(1, Math.max(0, c / h)) * 100;
    return Math.round(pct / 10) * 10;
  }

  /** Comercial declarado contra sugerido y contra el plan de la mañana.
   *  Hasta `tope` puntos arriba del sugerido: aprobado. Más: PROCEDE con excepción y exige
   *  explicación. Más de `topePlan` arriba del plan también se marca. */
  function evaluarComercial(declarado, sugerido, planComercial, tope, topePlan) {
    tope = tope == null ? 10 : tope; topePlan = topePlan == null ? 20 : topePlan;
    var d = entero(declarado) || 0, s = entero(sugerido) || 0;
    var exceso = d - s, excepcion = exceso > tope;
    var contraPlan = planComercial != null && (d - (entero(planComercial) || 0)) > topePlan;
    return { declarado: d, sugerido: s, exceso: exceso, estado: excepcion ? 'excepcion' : 'aprobado',
             exige_explicacion: excepcion, contra_plan: !!contraPlan };
  }

  /** La explicación de una excepción: una línea, con sustancia. */
  function validarExplicacion(t) {
    t = String(t || '').trim();
    if (t.length < 10) return 'Explica en una línea por qué tu comercial fue mayor al sugerido.';
    if (/[\r\n]/.test(t)) return 'La explicación va en una sola línea.';
    return null;
  }

  /** SO de las que hay que pedirle avance a quien supervisa.
   *  entradas: [{so_id, ts}] entradas de su cuadrilla (y suyas) con SO en el día.
   *  salidaTs: su salida de ese día (null = todavía no sale).
   *  reportadas: so_id ya reportadas en esa salida.
   *  → { en_salida: [so_id], para_siguiente_entrada: [so_id] }
   *  Una SO que entró DESPUÉS de su salida no se pierde: se le pide en su siguiente entrada. */
  function sosParaAvance(entradas, salidaTs, reportadas) {
    var ya = {}; (reportadas || []).forEach(function (s) { ya[s] = true; });
    var antes = {}, despues = {};
    (entradas || []).forEach(function (e) {
      if (e.so_id == null) return;
      if (salidaTs == null || new Date(e.ts) <= new Date(salidaTs)) antes[e.so_id] = true;
      else despues[e.so_id] = true;
    });
    var enSalida = Object.keys(antes).map(Number);
    var siguiente = Object.keys(despues).map(Number).filter(function (s) { return !antes[s] && !ya[s]; });
    return { en_salida: enSalida, para_siguiente_entrada: siguiente };
  }

  NU.kiosko = { clasificarPais: clasificarPais, flujo: flujo, validarAvance: validarAvance, validarReparto: validarReparto,
    pctComercial: pctComercial, sugeridoComercial: sugeridoComercial, evaluarComercial: evaluarComercial,
    validarExplicacion: validarExplicacion, sosParaAvance: sosParaAvance };
  if (typeof module !== 'undefined' && module.exports) module.exports = NU.kiosko;
})(typeof window !== 'undefined' ? window : globalThis);
