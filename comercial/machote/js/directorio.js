/* Directorio de cotizadores y dueños posibles de machote (#480).
 *
 * Antes: las personas del filtro «Responsable» y de Ceder / Prestar salían SOLO de los machotes que ya existen, así que
 * alguien recién dado de alta no aparecía hasta capturar el primero. Ahora se suma el directorio de PERFILES de la suite
 * (perfil con «cotiza» o «dueño de machote»), que vive en la base y lo asigna RH. No hay ninguna lista escrita aquí.
 *
 * Si el endpoint no contesta o los perfiles están apagados, todo sigue como antes (solo datos). Caché 5 min en la sesión
 * del navegador: no es estado, solo evita pedirlo en cada pintada. */
(function (G) {
  'use strict';
  var URL = 'https://primary-production-5c3c.up.railway.app/webhook/suite/perfiles';
  var LLAVE = 'fts_perfiles_directorio_v1', VIDA = 5 * 60 * 1000;
  var lista = null, pidiendo = null, avisar = [];
  function leerCache() {
    try { var c = JSON.parse(sessionStorage.getItem(LLAVE) || 'null'); if (c && c.t > Date.now() - VIDA && Array.isArray(c.p)) return c.p; } catch (e) { /* sigue */ }
    return null;
  }
  function cargar() {
    if (lista) return Promise.resolve(lista);
    var c = leerCache(); if (c) { lista = c; return Promise.resolve(lista); }
    if (pidiendo) return pidiendo;
    var ses = null; try { ses = G.SuiteAuth && G.SuiteAuth.getSession(); } catch (e) { ses = null; }
    if (!ses || !ses.token) return Promise.resolve([]);
    pidiendo = fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ses.token }), credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        lista = (j && j.ok && Array.isArray(j.personas)) ? j.personas.filter(function (p) { return p && p.username; }) : [];
        try { sessionStorage.setItem(LLAVE, JSON.stringify({ t: Date.now(), p: lista })); } catch (e) { /* sigue */ }
        avisar.forEach(function (f) { try { f(lista); } catch (e) { /* sigue */ } });
        return lista;
      })
      .catch(function () { lista = []; return lista; })
      .then(function (l) { pidiendo = null; return l; });
    return pidiendo;
  }
  G.MachoteDirectorio = {
    cargar: cargar,
    /* Lo que hay YA (síncrono): las pantallas pintan con esto y se repintan cuando llegue. */
    personas: function () { return lista || leerCache() || []; },
    duenosPosibles: function () { return (lista || leerCache() || []).filter(function (p) { return p.dueno_machote; }); },
    cotizadores: function () { return (lista || leerCache() || []).filter(function (p) { return p.cotiza; }); },
    alLlegar: function (f) { avisar.push(f); }
  };
})(window);
