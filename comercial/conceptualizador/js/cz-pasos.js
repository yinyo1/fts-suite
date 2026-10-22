/* ═══ Conceptualizador · un solo diccionario de pasos (V1.61, fts-conceptualizador#12, interruptor `barra_v161`) ═══
 *
 * Todo texto de paso que llega del servidor (procesa.js del principal y del respaldo, el robot, la 0014) pasa por AQUÍ antes
 * de verse. Nunca se pinta crudo: lo que no está en el diccionario sale como «Trabajando» y se cuenta como desconocido (la
 * medición del panel lo lista). Los pasos de procesa.js (V1.61): corto «Leyendo lo nuevo · Escribiendo la respuesta»; largo
 * «Leyendo lo nuevo · Buscando en Odoo · Buscando precios · Armando el machote · Escribiendo la respuesta». Los nombres viejos
 * («Pensando la respuesta», «Entregando», «bajando N fotos», «empezando») caen en el paso que les toca.
 *
 * «Escribiendo la respuesta» es el ÚNICO paso en que el encabezado dice «… está escribiendo…» (decisión de Esteban, 22-oct).
 *
 * API: CzPasos.traducir(texto) → { texto, base, detalle, conocido, escribe }
 *      CzPasos.lista(pasos) → [texto de usuario]   ·   CzPasos.PANTALLA / PROHIBIDAS (la barrida de la prueba)   ·   CzPasos.limpio(texto)
 */
(function (G) {
  'use strict';
  var sin = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  /* clave (sin acentos, minúsculas, inicio del texto) → lo que ve la persona. El orden importa: gana el primero que calza. */
  var DIC = [
    ['leyendo lo nuevo', 'Leyendo lo nuevo'],
    ['bajando', 'Leyendo lo nuevo'],
    ['viendo', 'Leyendo lo nuevo'],
    ['empezando', 'Leyendo lo nuevo'],
    ['buscando en odoo', 'Buscando en Odoo'],
    ['buscando al cliente', 'Buscando en Odoo'],
    ['buscando precios', 'Buscando precios'],
    ['buscando vuelos', 'Buscando precios'],
    ['buscando viaticos', 'Buscando precios'],
    ['armando el machote', 'Armando el machote'],
    ['calculando el machote', 'Armando el machote'],
    ['actualizando el machote', 'Armando el machote'],
    ['escribiendo la respuesta', 'Escribiendo la respuesta'],
    ['pensando la respuesta', 'Escribiendo la respuesta'],
    ['entregando', 'Escribiendo la respuesta'],
    ['trabajando', 'Trabajando']
  ];
  /* Palabras internas que NUNCA se ven. PANTALLA: en ningún lugar de la pantalla (los estados viejos). BARRA: además, en el
   * encabezado y en la barra (ahí ni «motor» ni «respaldo»: la persona no tiene por qué saber cuál le contesta). */
  var PANTALLA = ['Recibido · en cola', 'Revisando si hay cambios', 'bajando', 'Tomado por', 'tomado por'];
  var PROHIBIDAS = PANTALLA.concat(['tomado', 'Tomado', 'en cola', 'la cola', 'motor', 'Motor', 'respaldo', 'Respaldo', 'empezando']);
  var INTERNAS = /\b(motor|respaldo|cola|tomad[oa]|bajando|lease|proceso|trabajo \d+|pasada|subagente)\b/i;
  function traducir(t) {
    var cruda = String(t == null ? '' : t), partes = cruda.split(' · '), b = sin(partes[0]);
    for (var i = 0; i < DIC.length; i++) {
      if (b.indexOf(DIC[i][0]) === 0) {
        var det = partes.slice(1).join(' · ').trim();
        // «bajando 3 fotos» → «Leyendo lo nuevo · 3 fotos»; un detalle con palabras internas no se enseña.
        if (DIC[i][0] === 'bajando' && !det) det = cruda.replace(/^bajando\s*/i, '');
        if (det && INTERNAS.test(det)) det = '';
        var texto = DIC[i][1] + (det ? ' · ' + det : '');
        return { texto: texto, base: DIC[i][1], detalle: det, conocido: true, escribe: DIC[i][1] === 'Escribiendo la respuesta' };
      }
    }
    return { texto: 'Trabajando', base: 'Trabajando', detalle: '', conocido: !cruda.trim(), escribe: false, crudo: cruda };
  }
  /** La lista de pasos previstos, en palabras de usuario y sin repetir (dos nombres viejos caen en el mismo). */
  function lista(P) {
    var out = [];
    (Array.isArray(P) ? P : []).forEach(function (x) { var b = traducir(typeof x === 'object' && x ? (x.texto || x.paso) : x).base; if (out.indexOf(b) < 0) out.push(b); });
    return out;
  }
  /** ¿Este texto ya está limpio de palabras internas? (para la prueba y para el detalle de la barra) */
  function limpio(t) { var s = String(t || ''); return !PROHIBIDAS.some(function (p) { return s.indexOf(p) >= 0; }); }
  G.CzPasos = { traducir: traducir, lista: lista, limpio: limpio, PROHIBIDAS: PROHIBIDAS, PANTALLA: PANTALLA, DIC: DIC };
})(window);
