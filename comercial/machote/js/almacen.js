/* ═══ Machote · el almacén ═══
 *
 * UNA sola pieza entre la pantalla y donde viven los datos. Hoy escribe en el
 * navegador; mañana escribirá en el Postgres de la suite (`fts-suite-db`,
 * esquema `comercial`, issue #140) y **esta es la única pieza que cambia** —
 * la pantalla no sabe contra qué está guardando y no debe saberlo.
 *
 * ⚠️ LÍMITE HONESTO DE HOY: `localStorage` es del navegador y del dispositivo.
 * Lo que Esteban guarde en su laptop NO lo ve el analista en su teléfono, y si
 * alguien limpia los datos del sitio, se pierde. Sirve para que el gesto de
 * autoguardado sea REAL mientras se valida el backend, no para operar.
 *
 * Lo que falta para mover esto a Postgres, escrito para no re-investigarlo:
 *   1. `db/migrations/comercial/003_machote.sql` — las tablas.
 *   2. El workflow `comercial/db-migrate` (DISEÑADO en docs/comercial/ALMACEN.md,
 *      NO CONSTRUIDO todavía) para aplicarla.
 *   3. Un humano corre una vez `ALTER ROLE comercial_app WITH LOGIN PASSWORD`
 *      y crea la credencial Postgres en n8n. La contraseña no pasa por el repo.
 *   4. Dos webhooks: leer los machotes de la persona, y guardar uno.
 * Entonces `leer`/`escribir` de aquí abajo cambian de cuerpo, y ya.
 */
(function (G) {
  'use strict';

  var LLAVE = 'fts_machote_v1';

  /* Que exista el objeto no basta: en modo privado de Safari `localStorage`
   * existe y **tira** al escribir. La única prueba que vale es escribir. */
  function disponible() {
    try {
      var t = '__p' + Date.now();
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  var VIVO = disponible();

  /** Devuelve lo guardado, o `null` si no hay nada o está corrupto.
   *  Un JSON roto NO debe tumbar la aplicación: se descarta y se sigue con los
   *  datos de ejemplo, que es exactamente lo que quiere quien abre la página. */
  function leer() {
    if (!VIVO) return null;
    try {
      var crudo = localStorage.getItem(LLAVE);
      if (!crudo) return null;
      var d = JSON.parse(crudo);
      if (!d || !Array.isArray(d.machotes)) return null;
      return d;
    } catch (e) { return null; }
  }

  /** Guarda. Devuelve `true` sólo si de verdad quedó.
   *  Se relee lo escrito a propósito: en este repo ya costó caro dar por bueno
   *  un `200` que no probaba la escritura (CLAUDE.md §8). Aquí es barato
   *  comprobarlo, así que se comprueba. */
  function escribir(datos) {
    if (!VIVO) return false;
    try {
      var payload = JSON.stringify({
        v: 1,
        guardado_at: new Date().toISOString(),
        machotes: datos.machotes,
        handoff: datos.handoff || {}
      });
      localStorage.setItem(LLAVE, payload);
      return localStorage.getItem(LLAVE) === payload;
    } catch (e) { return false; }
  }

  function olvidar() {
    if (!VIVO) return;
    try { localStorage.removeItem(LLAVE); } catch (e) { /* nada que hacer */ }
  }

  /* ── El sobre del respaldo ────────────────────────────────────────────
   *
   * ⚠️ NO es el formato del almacén. `fts_machote_v1` y su sobre
   * `{v, guardado_at, machotes, handoff}` **no se tocan** — hay capturas
   * reales adentro y cambiarlos las orfanaría. Esto es un envoltorio APARTE,
   * para el archivo que se descarga: lleva el almacén tal cual en `datos` y
   * le agrega quién lo exportó, que es lo que el archivo necesita saber y el
   * almacén no.
   *
   * Por qué el navegador va dentro: si alguien capturó en la laptop y en el
   * teléfono son dos archivos parciales, y al juntarlos hay que poder decir
   * cuál vino de dónde. */
  function sobre(sesion) {
    return {
      formato: 'fts-machote-respaldo',
      v: 1,
      exportado_at: new Date().toISOString(),
      exportado_por: (sesion && sesion.actor) || '',
      exportado_por_nombre: (sesion && sesion.nombre) || '',
      navegador: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
      datos: leer() || { v: 1, machotes: [], handoff: {} }
    };
  }

  /** Saca la lista de machotes de un archivo. Acepta el sobre de exportar y
   *  también el crudo del almacén, porque quien pegue un respaldo a mano no
   *  tiene por qué saber la diferencia. */
  function machotesDe(obj) {
    if (!obj) return null;
    if (obj.datos && Array.isArray(obj.datos.machotes)) return obj.datos.machotes;
    if (Array.isArray(obj.machotes)) return obj.machotes;
    return null;
  }

  G.MachoteAlmacen = {
    nombre: 'navegador',
    disponible: function () { return VIVO; },
    leer: leer,
    escribir: escribir,
    olvidar: olvidar,
    sobre: sobre,
    machotesDe: machotesDe
  };
})(window);
