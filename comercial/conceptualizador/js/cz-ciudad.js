/* ═══ Conceptualizador · ciudad del proyecto (V1.34, D89) ═══
 *
 * La lista es la del prototipo aprobado V1.33 (fts-conceptualizador prototipos/v133/bloque.js):
 * ciudades donde trabaja FTS, sembradas de las órdenes de Odoo de 36 meses (es una SIEMBRA, no
 * un ranking: Odoo guarda la dirección fiscal del cliente, no la de la obra).
 *
 * Privacidad: las coordenadas NUNCA salen del teléfono. Con permiso de ubicación se toma la
 * ciudad más cercana de esta lista (radio 30 km) y solo se manda ciudad y estado; si no cae en
 * ninguna, se propone «Otra». Sin permiso, la zona horaria del teléfono propone la ciudad base
 * de esa zona. Nada de esto bloquea: si no hay nada, la ciudad queda por elegir.
 *
 * Cada ciudad lleva su centro aproximado SOLO para comparar aquí; el centro nunca se manda.
 */
(function (G) {
  'use strict';
  var CIUDADES = [
    { g: 'Monterrey metro (base de MX)', pais: 'MX', L: [
      ['Monterrey', 'N.L.', 25.6866, -100.3161], ['San Pedro Garza García', 'N.L.', 25.6573, -100.4023], ['Santa Catarina', 'N.L.', 25.6733, -100.4581],
      ['San Nicolás de los Garza', 'N.L.', 25.7417, -100.3022], ['Escobedo', 'N.L.', 25.7953, -100.3180], ['Apodaca', 'N.L.', 25.7817, -100.1886],
      ['Guadalupe', 'N.L.', 25.6775, -100.2597], ['García', 'N.L.', 25.8106, -100.5856], ['Santiago', 'N.L.', 25.4253, -100.1525],
      ['Cadereyta', 'N.L.', 25.5925, -99.9819], ['Ciénega de Flores', 'N.L.', 25.9539, -100.1694], ['Salinas Victoria', 'N.L.', 25.9636, -100.2925]] },
    { g: 'Resto de México', pais: 'MX', L: [
      ['Saltillo', 'Coah.', 25.4232, -101.0053], ['Ramos Arizpe', 'Coah.', 25.5394, -100.9472], ['Arteaga', 'Coah.', 25.4461, -100.8478],
      ['Ciudad Juárez', 'Chih.', 31.6904, -106.4245], ['Ciudad de México', 'CDMX', 19.4326, -99.1332], ['Puebla', 'Pue.', 19.0414, -98.2063],
      ['Querétaro', 'Qro.', 20.5888, -100.3899]] },
    // «Fairfield, USA» viene así del prototipo (no dice el estado): sin centro, solo se elige a mano.
    { g: 'USA', pais: 'US', L: [
      ['Irving', 'TX', 32.8140, -96.9489], ['Dallas', 'TX', 32.7767, -96.7970], ['San Antonio', 'TX', 29.4241, -98.4936],
      ['Houston', 'TX', 29.7604, -95.3698], ['Fairfield', 'USA', null, null], ['Portland', 'OR', 45.5152, -122.6784],
      ['North Las Vegas', 'NV', 36.1989, -115.1175], ['Rochester', 'MI', 42.6806, -83.1338]] }
  ];
  var RADIO_KM = 30;
  /* Zona horaria → ciudad base de esa zona (sin red ni servicio externo: mandar la IP a un tercero, no). */
  var ZONAS = {
    'America/Monterrey': 'Monterrey', 'America/Matamoros': 'Monterrey',
    'America/Mexico_City': 'Ciudad de México', 'America/Bahia_Banderas': 'Ciudad de México', 'America/Merida': 'Ciudad de México',
    'America/Ciudad_Juarez': 'Ciudad Juárez', 'America/Ojinaga': 'Ciudad Juárez', 'America/Chihuahua': 'Ciudad Juárez',
    'America/Chicago': 'Dallas', 'America/Detroit': 'Rochester', 'America/Los_Angeles': 'Portland'
  };

  function todas() {
    var L = []; CIUDADES.forEach(function (g) { g.L.forEach(function (x) { L.push({ c: x[0], e: x[1], pais: g.pais, lat: x[2], lon: x[3] }); }); });
    return L;
  }
  function sinAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** Lo que se guarda y se manda: ciudad, estado y país. Nunca el centro. */
  function limpia(x) { return x ? { c: x.c, e: x.e, pais: x.pais } : null; }
  function buscar(nombre) { return limpia(todas().filter(function (x) { return x.c === nombre; })[0]); }
  function km(a1, o1, a2, o2) {
    var r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    var h = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  /** La ciudad de la lista más cercana, dentro de 30 km; si no hay, null («Otra»). */
  function cercana(lat, lon) {
    var mejor = null, d0 = Infinity;
    todas().forEach(function (x) { if (x.lat == null) return; var d = km(lat, lon, x.lat, x.lon); if (d < d0) { d0 = d; mejor = x; } });
    return d0 <= RADIO_KM ? limpia(mejor) : null;
  }
  function deZona() {
    var z = ''; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return ZONAS[z] ? buscar(ZONAS[z]) : null;
  }
  /** Prellenado: {estado, persona}. estado = ubicacion | zona | lejos | nada. Nunca rechaza ni bloquea.
   *  La posición se usa dentro de esta función y se descarta: no se guarda ni se devuelve. */
  function detectar(ms) {
    var zona = deZona();
    var porZona = function () { return zona ? { estado: 'zona', persona: Object.assign({ fuente: 'zona_horaria' }, zona) } : { estado: 'nada', persona: null }; };
    if (!navigator.geolocation) return Promise.resolve(porZona());
    return new Promise(function (listo) {
      var hecho = false, fin = function (r) { if (!hecho) { hecho = true; listo(r); } };
      setTimeout(function () { fin(porZona()); }, ms || 8000);
      try {
        navigator.geolocation.getCurrentPosition(function (pos) {
          var c = cercana(pos.coords.latitude, pos.coords.longitude);
          fin(c ? { estado: 'ubicacion', persona: Object.assign({ fuente: 'ubicacion' }, c) } : { estado: 'lejos', persona: null });
        }, function () { fin(porZona()); }, { enableHighAccuracy: false, timeout: (ms || 8000) - 500, maximumAge: 600000 });
      } catch (e) { fin(porZona()); }
    });
  }
  /** Una ciudad escrita a mano: «Reynosa, Tamps.» → {c, e}. Rechaza lo que parezca coordenada. */
  function deTexto(t, pais) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (/\d+[.,]\d/.test(t)) return { error: 'Escribe la ciudad, no coordenadas.' };
    var p = t.split(','), c = (p[0] || '').trim().slice(0, 60), e = p.slice(1).join(',').trim().slice(0, 30);
    if (c.length < 2) return { error: 'Escribe la ciudad (y el estado, si puedes).' };
    return { c: c, e: e, pais: pais === 'US' ? 'US' : 'MX' };
  }
  function nombre(x) { return x && x.c ? x.c + (x.e ? ', ' + x.e : '') : ''; }

  G.CzCiudad = { CIUDADES: CIUDADES, cercana: cercana, deZona: deZona, detectar: detectar, deTexto: deTexto, buscar: buscar,
    nombre: nombre, sinAcento: sinAcento };
})(window);
