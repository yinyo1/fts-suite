/* ═══ GENERADO desde fts-conceptualizador/herramientas/motor/indicadores.js · NO SE EDITA A MANO ═══
 * Se regenera con: node herramientas/motor/publicar-indicadores.js --suite <fts-suite> (y se revisa con --revisar).
 * huella de la fuente: 585f889b162b2a6e
 */
/* ═══ Conceptualizador · UN SOLO DATO: alertas, % de referencia (N3/N4) y avance (V1.52, motor/DISENO-V152.md §14) ═══
 *
 * La misma cuenta para el mensaje del agente (procesa.js), la tarjeta, la barra/pastilla, la vista ejecutiva y la lista
 * de la suite. Antes cada vista contaba a su modo y el mismo caso decía dos cosas: en 21fec6 el mensaje del agente decía
 * «1 alerta, 1 sección fuera de rango» (oferta-rubros.textoPrecios: «alerta» = solo los precios N3) y la franja de la
 * suite «2 alertas» (CzAvance.textoPrecios: N3 + secciones); además el % de referencia salía «5.4 %» en uno y «5 %» en
 * otro (Math.round).
 *
 * Regla (una sola): alertas = precios N3 (lista de referencia de otro país) + secciones fuera de rango (sensatez).
 * Siempre se dicen juntas y con su desglose: «2 alertas (1 precio N3, 1 sección fuera de rango)».
 * % de referencia = el del costo en N3/N4, a un decimal (sin «.0»). Avance = el % hacia el 100 de avance/completo.js
 * (analisis.pct; cerrado o listo = 100); sin análisis, el total de los rubros (que sale de la misma función).
 *
 * UMD sin dependencias: en node `require('./indicadores')`; en el navegador `window.CzIndicadores`. La suite usa una
 * copia GENERADA (fts-suite comercial/conceptualizador/js/cz-indicadores.js) con herramientas/motor/publicar-indicadores.js,
 * que con --revisar falla si divergen.
 *
 *   calcular(fuente) → { alertas:{ total, n3, secciones }, n4, referencia_pct, avance_pct, con_precio, renglones }
 *     fuente = el `verifica` de una respuesta ({ precios, rubros, analisis, referencias }) o cualquier mezcla de:
 *       precios     {con_precio, total, pct, n3, n4, alertas, sensatez[]}      (precios.json · verifica.precios)
 *       referencias {pct, n3, n4}                                              (machote.referencias · datos.referencias)
 *       sensatez    [{seccion, alerta, …}]                                     (machote.sensatez · datos.sensatez)
 *       analisis    {estado, pct}                                              (avance/completo.pantalla)
 *       rubros      {total_pct, precios?}                                      (oferta-rubros.resumenRubros().pantalla)
 *   textoAlertas(I) · textoReferencia(I) · textoPrecios(I) · textoAvance(I) · pct(n)
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CzIndicadores = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function primero() { for (var i = 0; i < arguments.length; i++) { var v = num(arguments[i]); if (v !== null) return v; } return null; }
  function pct(n) { n = num(n); if (n === null) return null; return Math.round(n * 10) / 10; }
  function deLista(s) { return Array.isArray(s) ? s.filter(function (x) { return x && x.alerta !== false; }).length : null; }

  function calcular(f) {
    f = f || {};
    var P = f.precios || (f.rubros && f.rubros.precios) || null, R = f.referencias || null, A = f.analisis || null, RU = f.rubros || null;
    var n3 = primero(P && P.n3, R && R.n3) || 0, n4 = primero(P && P.n4, R && R.n4) || 0;
    // Las secciones fuera de rango: el conteo que ya trae precios.json; si no, la lista de sensatez que venga.
    var sec = primero(P && P.alertas);
    if (sec === null) sec = deLista(P && P.sensatez);
    if (sec === null) sec = deLista(f.sensatez);
    sec = sec || 0;
    var ref = pct(primero(P && P.pct, R && R.pct));
    var av = null;
    if (A && (A.estado === 'cerrado' || A.estado === 'listo')) av = 100;
    else av = primero(A && A.pct, RU && RU.total_pct);
    if (av !== null) av = Math.max(0, Math.min(100, Math.round(av)));
    return { alertas: { total: n3 + sec, n3: n3, secciones: sec }, n4: n4, referencia_pct: ref, avance_pct: av,
             con_precio: primero(P && P.con_precio), renglones: primero(P && P.total) };
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  /** «2 alertas (1 precio N3, 1 sección fuera de rango)» · «1 alerta (precio N3)» · '' si no hay. */
  function textoAlertas(I) {
    var a = (I && I.alertas) || { total: 0 }; if (!a.total) return '';
    var d = [];
    if (a.n3) d.push(a.total === a.n3 && a.n3 === 1 ? 'precio N3' : plural(a.n3, 'precio N3', 'precios N3'));
    if (a.secciones) d.push(a.total === a.secciones && a.secciones === 1 ? 'sección fuera de rango' : plural(a.secciones, 'sección fuera de rango', 'secciones fuera de rango'));
    return plural(a.total, 'alerta', 'alertas') + (d.length ? ' (' + d.join(', ') + ')' : '');
  }
  /** «5.4 % del costo es referencia (N3/N4)» · '' sin dato. */
  function textoReferencia(I) { var p = I && I.referencia_pct; return p ? p + ' % del costo es referencia (N3/N4)' : ''; }
  /** «Precios 2/2 (5.4 % referencia, 2 alertas)»: corto, para que quepa a 380 px. */
  function textoPrecios(I) {
    if (!I || !I.renglones) return '';
    var d = [];
    if (I.referencia_pct) d.push(I.referencia_pct + ' % referencia');
    if (I.alertas && I.alertas.total) d.push(plural(I.alertas.total, 'alerta', 'alertas'));
    return 'Precios ' + (I.con_precio || 0) + '/' + I.renglones + (d.length ? ' (' + d.join(', ') + ')' : '');
  }
  /** «60 %» · '' sin dato. */
  function textoAvance(I) { return I && I.avance_pct !== null && I.avance_pct !== undefined ? I.avance_pct + ' %' : ''; }
  return { version: 1, calcular: calcular, textoAlertas: textoAlertas, textoReferencia: textoReferencia, textoPrecios: textoPrecios, textoAvance: textoAvance, pct: pct };
});
