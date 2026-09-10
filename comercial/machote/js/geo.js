/* ═══ Machote · dónde se ejecuta ═══
 *
 * El catálogo de países y subdivisiones, y nada más. Vive en
 * `shared/comercial/geo.json` y se pide UNA vez por pestaña.
 *
 * ── POR QUÉ UN CATÁLOGO GENÉRICO Y NO UNA LISTA CORTA ────────────────────
 * Esteban lo pidió así: países y sus estados, no «los tres lugares donde
 * trabajamos hoy». Una lista corta se queda vieja el día que entre el cuarto
 * cliente, y quien captura acaba escribiendo el país en el campo de la ciudad.
 *
 * Los 249 países salen de ICU —no están tecleados a mano—, filtrando las
 * pseudo-regiones de CLDR que no son ISO 3166-1. Que queden exactamente 249,
 * que es el número de códigos alpha-2 asignados de la norma, es la
 * comprobación de que el filtro está bien: cuadra por aritmética.
 *
 * Las subdivisiones sólo existen para MÉXICO y ESTADOS UNIDOS, que es donde
 * FTS ejecuta (companies 1 y 6). Para cualquier otro país el estado va en
 * TEXTO LIBRE, y la pantalla lo dice en vez de fingir un catálogo que no hay.
 *
 * Si el archivo no carga, esto NO tumba la pantalla: se cae a texto libre en
 * los tres campos. Un catálogo es una comodidad, no un requisito para cotizar.
 */
(function (G) {
  'use strict';

  var URL_GEO = '../../shared/comercial/geo.json';

  var _datos = null;      // ya cargado
  var _promesa = null;    // la petición EN VUELO, para no pedirlo dos veces

  function vacio() { return { paises: [], subdivisiones: {}, _falló: true }; }

  /** Pide el catálogo. Devuelve siempre una promesa que RESUELVE: si la red
   *  falla, resuelve con el catálogo vacío y quien pinta usa texto libre. */
  function cargar() {
    if (_datos) return Promise.resolve(_datos);
    if (_promesa) return _promesa;
    _promesa = fetch(URL_GEO)
      .then(function (r) { return r.ok ? r.json() : vacio(); })
      .then(function (d) {
        _datos = (d && Array.isArray(d.paises) && d.paises.length) ? d : vacio();
        _promesa = null;
        return _datos;
      })
      .catch(function () { _datos = vacio(); _promesa = null; return _datos; });
    return _promesa;
  }

  /** Lo que ya está cargado, síncrono. `null` si todavía no llega: quien pinta
   *  decide qué hacer mientras tanto, en vez de esperar a la red para dibujar. */
  function datos() { return _datos; }

  function paises() { return (_datos && _datos.paises) || []; }

  function pais(codigo) {
    if (!codigo) return null;
    var c = String(codigo).toUpperCase();
    return paises().filter(function (p) { return p.codigo === c; })[0] || null;
  }

  /** Los estados de un país, o `[]` si no los tenemos. **Vacío significa
   *  «texto libre», no «no existen»** — es la distinción de CLAUDE.md §20 #13:
   *  un índice que sólo cubre parte del universo contesta «no» por lo que no
   *  cubre, y quien pregunta lo lee como la respuesta legítima. Por eso quien
   *  pinta tiene que preguntar `tieneEstados()` antes de creerle al vacío. */
  function estados(codigo) {
    if (!codigo || !_datos) return [];
    return _datos.subdivisiones[String(codigo).toUpperCase()] || [];
  }

  function tieneEstados(codigo) { return estados(codigo).length > 0; }

  G.MachoteGeo = {
    cargar: cargar, datos: datos,
    paises: paises, pais: pais,
    estados: estados, tieneEstados: tieneEstados
  };
})(window);
