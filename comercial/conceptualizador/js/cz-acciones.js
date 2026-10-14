/* ═══ Conceptualizador · lo que hacen los botones del motor ═══
 *
 * Cada manejador recibe la acción propuesta y hace la escritura con el
 * endpoint de la suite que ya existe para eso, SIEMPRE por el clic de la
 * persona. Devuelve {ok, resultado} — el resultado queda registrado en la
 * acción (api_suite modo 'accion') y el motor sigue desde ahí.
 * Los manejadores se agregan en la Fase 5 (machote, borrador, alta).
 */
(function (G) {
  'use strict';
  G.CzAcciones = G.CzAcciones || {};
})(window);
