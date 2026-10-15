/* ═══ Conceptualizador · ciudad del proyecto (V1.34 D89 · V1.39 catálogo completo, #4 punto 9) ═══
 *
 * V1.39: el selector busca en el catálogo COMPLETO, un JSON estático por país en `datos/`:
 *   MX · INEGI, Catálogo Único AGEEML, municipios (catun_municipio.zip, 21-ago-2026): 2,479 renglones.
 *   US · Census 2020 Place Codes (national_place2020.txt) + población 2024 (sub-est2024.csv): 31,409.
 * Son los mismos bytes que generó fts-conceptualizador/prototipos/ciudades/gen-ciudades.js (prototipo aprobado
 * ciudad-v138.html). Se bajan SOLO al abrir el selector (carga perezosa: el chat no los pide al cargar), se quedan en
 * memoria y, si el navegador deja, en el Cache Storage: sin red, lo ya bajado sigue buscando.
 *
 * La lista corta de V1.34 (CIUDADES) se queda: es donde trabaja FTS, y la única con centro aproximado, para
 * prellenar con la ubicación (radio 30 km). Los nombres ya van como en el catálogo («General Escobedo»); lo que se
 * guardó con el nombre viejo («Escobedo», «Cadereyta», «Fairfield, USA») sigue valiendo por ALIAS.
 *
 * Privacidad (V1.34, igual): las coordenadas NUNCA salen del teléfono. Con permiso de ubicación se toma la ciudad
 * más cercana de la lista corta (30 km) y el ESTADO aproximado (punto de referencia más cercano, 250 km) solo para
 * acomodar las sugerencias; se manda ciudad, estado y país, nunca la posición. Sin permiso, la zona horaria.
 */
(function (G) {
  'use strict';
  var CIUDADES = [
    { g: 'Monterrey metro (base de MX)', pais: 'MX', L: [
      ['Monterrey', 'N.L.', 25.6866, -100.3161], ['San Pedro Garza García', 'N.L.', 25.6573, -100.4023], ['Santa Catarina', 'N.L.', 25.6733, -100.4581],
      ['San Nicolás de los Garza', 'N.L.', 25.7417, -100.3022], ['General Escobedo', 'N.L.', 25.7953, -100.3180], ['Apodaca', 'N.L.', 25.7817, -100.1886],
      ['Guadalupe', 'N.L.', 25.6775, -100.2597], ['García', 'N.L.', 25.8106, -100.5856], ['Santiago', 'N.L.', 25.4253, -100.1525],
      ['Cadereyta Jiménez', 'N.L.', 25.5925, -99.9819], ['Ciénega de Flores', 'N.L.', 25.9539, -100.1694], ['Salinas Victoria', 'N.L.', 25.9636, -100.2925]] },
    { g: 'Resto de México', pais: 'MX', L: [
      ['Saltillo', 'Coah.', 25.4232, -101.0053], ['Ramos Arizpe', 'Coah.', 25.5394, -100.9472], ['Arteaga', 'Coah.', 25.4461, -100.8478],
      ['Ciudad Juárez', 'Chih.', 31.6904, -106.4245], ['Ciudad de México', 'CDMX', 19.4326, -99.1332], ['Puebla', 'Pue.', 19.0414, -98.2063],
      ['Querétaro', 'Qro.', 20.5888, -100.3899]] },
    // V1.34 decía «Fairfield, USA» (el prototipo no traía el estado); los casos de Calbee son Fairfield, CA.
    { g: 'USA', pais: 'US', L: [
      ['Irving', 'TX', 32.8140, -96.9489], ['Dallas', 'TX', 32.7767, -96.7970], ['San Antonio', 'TX', 29.4241, -98.4936],
      ['Houston', 'TX', 29.7604, -95.3698], ['Fairfield', 'CA', 38.2494, -122.0400], ['Portland', 'OR', 45.5152, -122.6784],
      ['North Las Vegas', 'NV', 36.1989, -115.1175], ['Rochester', 'MI', 42.6806, -83.1338]] }
  ];
  /** Nombres de V1.34 (o de casos viejos) → el del catálogo. Clave «ciudad|estado» sin acentos. */
  var ALIAS = {
    'escobedo|n.l.': ['General Escobedo', 'N.L.', 'MX'], 'cadereyta|n.l.': ['Cadereyta Jiménez', 'N.L.', 'MX'],
    'fairfield|usa': ['Fairfield', 'CA', 'US'], 'fairfield|': ['Fairfield', 'CA', 'US'],
    'juarez|chih.': ['Ciudad Juárez', 'Chih.', 'MX'], 'queretaro|qro.': ['Querétaro', 'Qro.', 'MX'], 'cdmx|cdmx': ['Ciudad de México', 'CDMX', 'MX']
  };
  /* Puntos de referencia SOLO para saber en qué estado está el teléfono (y poner arriba sus ciudades). Centros
   * aproximados de ciudades grandes; nunca se guardan ni se mandan. Un error de frontera solo cambia el orden. */
  var REGION = [
    ['Chih.', 'MX', 28.6353, -106.0889], ['Son.', 'MX', 29.0729, -110.9559], ['B.C.', 'MX', 32.5149, -117.0382], ['B.C.', 'MX', 32.6245, -115.4523],
    ['Jal.', 'MX', 20.6597, -103.3496], ['Coah.', 'MX', 25.5428, -103.4068], ['Coah.', 'MX', 26.9080, -101.4215], ['Coah.', 'MX', 28.7000, -100.5236],
    ['Tamps.', 'MX', 26.0508, -98.2979], ['Tamps.', 'MX', 27.4779, -99.5496], ['Tamps.', 'MX', 22.2331, -97.8611], ['Tamps.', 'MX', 23.7369, -99.1411],
    ['S.L.P.', 'MX', 22.1565, -100.9855], ['Gto.', 'MX', 21.1250, -101.6860], ['Ags.', 'MX', 21.8853, -102.2916], ['Dgo.', 'MX', 24.0277, -104.6532],
    ['Zac.', 'MX', 22.7709, -102.5833], ['Méx.', 'MX', 19.2826, -99.6557], ['Ver.', 'MX', 19.1738, -96.1342], ['Yuc.', 'MX', 20.9674, -89.5926],
    ['Q. Roo', 'MX', 21.1619, -86.8515], ['Sin.', 'MX', 24.8091, -107.3940], ['Mich.', 'MX', 19.7060, -101.1950], ['Tab.', 'MX', 17.9895, -92.9475],
    ['Oax.', 'MX', 17.0732, -96.7266], ['Hgo.', 'MX', 20.1011, -98.7591],
    ['CA', 'US', 34.0522, -118.2437], ['CA', 'US', 32.7157, -117.1611], ['CA', 'US', 37.3382, -121.8863], ['CA', 'US', 38.5816, -121.4944],
    ['CA', 'US', 36.7378, -119.7871], ['AZ', 'US', 33.4484, -112.0740], ['AZ', 'US', 32.2226, -110.9747], ['TX', 'US', 31.7619, -106.4850],
    ['TX', 'US', 30.2672, -97.7431], ['TX', 'US', 27.5306, -99.4803], ['TX', 'US', 26.2034, -98.2300], ['TX', 'US', 31.9973, -102.0779],
    ['TX', 'US', 33.5779, -101.8552], ['IL', 'US', 41.8781, -87.6298], ['GA', 'US', 33.7490, -84.3880], ['CO', 'US', 39.7392, -104.9903],
    ['WA', 'US', 47.6062, -122.3321], ['NM', 'US', 35.0844, -106.6504], ['OK', 'US', 35.4676, -97.5164], ['TN', 'US', 36.1627, -86.7816],
    ['TN', 'US', 35.1495, -90.0490], ['IN', 'US', 39.7684, -86.1581], ['OH', 'US', 39.9612, -82.9988], ['NY', 'US', 40.7128, -74.0060],
    ['NC', 'US', 35.2271, -80.8431], ['FL', 'US', 25.7617, -80.1918], ['FL', 'US', 28.5383, -81.3792], ['MO', 'US', 38.6270, -90.1994],
    ['MO', 'US', 39.0997, -94.5786], ['UT', 'US', 40.7608, -111.8910], ['NV', 'US', 39.5296, -119.8138], ['MI', 'US', 42.3314, -83.0458],
    ['KY', 'US', 38.2527, -85.7585], ['AL', 'US', 33.5186, -86.8104], ['LA', 'US', 29.9511, -90.0715], ['MN', 'US', 44.9778, -93.2650],
    ['WI', 'US', 43.0389, -87.9065], ['PA', 'US', 40.4406, -79.9959], ['PA', 'US', 39.9526, -75.1652], ['ID', 'US', 43.6150, -116.2023]
  ];
  var RADIO_KM = 30, RADIO_REGION_KM = 250;
  /* Zona horaria → ciudad base de esa zona (y su estado). Sin red ni servicio externo: mandar la IP a un tercero, no.
   * Donde la zona cubre varios estados y no hay ciudad que adivinar, solo el estado para ordenar (sin prellenar). */
  var ZONAS = {
    'America/Monterrey': 'Monterrey', 'America/Matamoros': 'Monterrey',
    'America/Mexico_City': 'Ciudad de México', 'America/Bahia_Banderas': 'Ciudad de México', 'America/Merida': 'Ciudad de México',
    'America/Ciudad_Juarez': 'Ciudad Juárez', 'America/Ojinaga': 'Ciudad Juárez', 'America/Chihuahua': 'Ciudad Juárez',
    'America/Chicago': 'Dallas', 'America/Detroit': 'Rochester'
  };
  var ZONA_REGION = {
    'America/Los_Angeles': ['CA', 'US'], 'America/Tijuana': ['B.C.', 'MX'], 'America/Hermosillo': ['Son.', 'MX'], 'America/Mazatlan': ['Sin.', 'MX'],
    'America/Cancun': ['Q. Roo', 'MX'], 'America/Phoenix': ['AZ', 'US'], 'America/Denver': ['CO', 'US'], 'America/Boise': ['ID', 'US']
  };
  /** Nombre largo de los estados de la lista corta y las regiones (sin esperar al catálogo). */
  var NOMBRE_EDO = { 'N.L.': 'Nuevo León', 'Coah.': 'Coahuila', 'Chih.': 'Chihuahua', CDMX: 'Ciudad de México', 'Pue.': 'Puebla', 'Qro.': 'Querétaro',
    'B.C.': 'Baja California', 'Son.': 'Sonora', 'Sin.': 'Sinaloa', 'Q. Roo': 'Quintana Roo', 'Jal.': 'Jalisco', 'Tamps.': 'Tamaulipas',
    TX: 'Texas', CA: 'California', OR: 'Oregon', NV: 'Nevada', MI: 'Michigan', AZ: 'Arizona', CO: 'Colorado', ID: 'Idaho' };

  function todas() {
    var L = []; CIUDADES.forEach(function (g) { g.L.forEach(function (x) { L.push({ c: x[0], e: x[1], pais: g.pais, lat: x[2], lon: x[3] }); }); });
    return L;
  }
  function sinAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** Lo que se guarda y se manda: ciudad, estado y país. Nunca el centro. Respeta los límites de la base (db/007). */
  function limpia(x) { return x ? { c: String(x.c).slice(0, 60), e: String(x.e || '').slice(0, 30), pais: x.pais === 'US' ? 'US' : 'MX' } : null; }
  /** Busca en la lista corta por nombre (y por los nombres viejos). */
  function buscar(nombre) {
    var x = todas().filter(function (y) { return y.c === nombre; })[0];
    if (!x) { var a = ALIAS[sinAcento(nombre) + '|n.l.'] || ALIAS[sinAcento(nombre) + '|']; if (a) x = { c: a[0], e: a[1], pais: a[2] }; }
    return limpia(x);
  }
  /** La forma del catálogo de una ciudad guardada («Escobedo, N.L.» → General Escobedo). Para marcar la actual. */
  function canon(x) {
    if (!x || !x.c) return null;
    var a = ALIAS[sinAcento(x.c) + '|' + sinAcento(x.e || '')];
    return a ? { c: a[0], e: a[1], pais: a[2] } : { c: x.c, e: x.e || '', pais: x.pais || null };
  }
  function igual(a, b) {
    a = canon(a); b = canon(b); if (!a || !b) return false;
    return sinAcento(a.c) === sinAcento(b.c) && sinAcento(a.e) === sinAcento(b.e) && (!a.pais || !b.pais || a.pais === b.pais);
  }
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
  function region(e, pais, fuente) { return e ? { e: e, pais: pais, nombre: NOMBRE_EDO[e] || e, fuente: fuente } : null; }
  /** El estado aproximado de una posición (punto de referencia más cercano, 250 km). Solo para ordenar. */
  function regionDe(lat, lon) {
    var mejor = null, d0 = Infinity;
    todas().concat(REGION.map(function (r) { return { e: r[0], pais: r[1], lat: r[2], lon: r[3] }; })).forEach(function (x) {
      if (x.lat == null) return; var d = km(lat, lon, x.lat, x.lon); if (d < d0) { d0 = d; mejor = x; } });
    return d0 <= RADIO_REGION_KM ? region(mejor.e, mejor.pais, 'ubicacion') : null;
  }
  function zona() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  function deZona() { var z = zona(); return ZONAS[z] ? buscar(ZONAS[z]) : null; }
  /** Prellenado: {estado, persona, region}. estado = ubicacion | zona | region | lejos | nada. Nunca rechaza ni bloquea.
   *  La posición se usa dentro de esta función y se descarta: no se guarda ni se devuelve. `region` ({e, pais, nombre,
   *  fuente}) solo acomoda las sugerencias del selector; no se manda. */
  function detectar(ms) {
    var zc = deZona(), z = zona();
    var porZona = function () {
      if (zc) return { estado: 'zona', persona: Object.assign({ fuente: 'zona_horaria' }, zc), region: region(zc.e, zc.pais, 'zona_horaria') };
      var zr = ZONA_REGION[z];
      return zr ? { estado: 'region', persona: null, region: region(zr[0], zr[1], 'zona_horaria') } : { estado: 'nada', persona: null, region: null };
    };
    if (!navigator.geolocation) return Promise.resolve(porZona());
    return new Promise(function (listo) {
      var hecho = false, fin = function (r) { if (!hecho) { hecho = true; listo(r); } };
      setTimeout(function () { fin(porZona()); }, ms || 8000);
      try {
        navigator.geolocation.getCurrentPosition(function (pos) {
          var c = cercana(pos.coords.latitude, pos.coords.longitude), rg = regionDe(pos.coords.latitude, pos.coords.longitude);
          fin(c ? { estado: 'ubicacion', persona: Object.assign({ fuente: 'ubicacion' }, c), region: region(c.e, c.pais, 'ubicacion') }
            : { estado: 'lejos', persona: null, region: rg });
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

  // ── V1.39 · el catálogo completo (perezoso) ─────────────────────────────
  var CAT_VER = '2026-10-15', CAT = null, bajando = null, cargas = 0, CACHE = 'cz-ciudades-' + CAT_VER;
  function url(p) { return 'datos/ciudades-' + p + '.json?v=' + CAT_VER; }
  /** Baja un JSON; si no hay red, lo que haya en el Cache Storage. Todo con try/catch: el caché es un extra. */
  function bajar(p) {
    var u = url(p);
    var deCache = function () {
      try { return caches.open(CACHE).then(function (c) { return c.match(u); }).then(function (r) { if (!r) throw new Error('SIN_CATALOGO'); return r.json(); }); }
      catch (e) { return Promise.reject(e); }
    };
    return fetch(u).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      try { var cl = r.clone(); caches.open(CACHE).then(function (c) { return c.put(u, cl); }).catch(function () {}); } catch (e) {}
      return r.json();
    }).catch(deCache);
  }
  /* Sin acentos y con las abreviaturas de la calle: «cd juarez» encuentra «Ciudad Juárez» (prototipo aprobado). */
  var ABREV = { cd: 'ciudad', sn: 'san', sta: 'santa', sto: 'santo', gral: 'general', mpio: '', edo: '', mty: 'monterrey', gdl: 'guadalajara', slp: 'san luis potosi', cdmx: 'ciudad de mexico' };
  function norm(t) {
    return sinAcento(t).replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
      .map(function (w) { return ABREV[w] !== undefined ? ABREV[w] : w; }).filter(Boolean).join(' ');
  }
  function arma(mx, us) {
    var L = [];
    if (mx) mx.c.forEach(function (x) { L.push({ c: x[0], e: x[1], pais: 'MX', pob: x[2], alias: x[3] || '', en: mx.estados[x[1]] }); });
    if (us) Object.keys(us.c).forEach(function (st) {
      us.c[st].split('|').forEach(function (n, i) { var cdp = n.charAt(0) === '~', m = n.replace(/^~/, '').split('*');
        L.push({ c: m[0], e: st, pais: 'US', pob: (Number(m[1]) || 0) * 1000, rango: i, cdp: cdp, alias: '', en: us.estados[st] }); });
    });
    L.forEach(function (x) { x.k = norm(x.c); x.ka = x.alias ? x.alias.split(' · ').map(norm) : []; });
    return { L: L, mx: mx, us: us, n_mx: mx ? mx.c.length : 0, n_us: us ? us._meta.renglones : 0, completo: !!(mx && us) };
  }
  /** El catálogo: se baja la primera vez que se abre el selector; después, de memoria. Nunca rechaza:
   *  si no se pudo, devuelve null y el selector se queda con la lista corta y «Otra». */
  function catalogo() {
    if (CAT && CAT.completo) return Promise.resolve(CAT);
    if (bajando) return bajando;
    cargas++;
    bajando = Promise.all([bajar('mx').catch(function () { return null; }), bajar('us').catch(function () { return null; })]).then(function (r) {
      bajando = null;
      if (!r[0] && !r[1]) return CAT;
      CAT = arma(r[0], r[1]); return CAT;
    });
    return bajando;
  }
  function estadoDe(q) {
    var k = norm(q); if (!k || !CAT) return null;
    var r = null;
    [['MX', CAT.mx && CAT.mx.estados], ['US', CAT.us && CAT.us.estados]].forEach(function (p) {
      if (!p[1]) return;
      Object.keys(p[1]).forEach(function (ab) { if (r) return;
        if (norm(p[1][ab]) === k || norm(ab) === k || norm(ab).replace(/ /g, '') === k.replace(/ /g, '')) r = { pais: p[0], e: ab, nombre: p[1][ab] }; });
    });
    return r;
  }
  function calza(k, t) { if (!t) return -1; if (t === k) return 100; if (t.indexOf(k) === 0) return 80; return (' ' + t).indexOf(' ' + k) >= 0 ? 78 : -1; }
  /** Busca en el catálogo (puntaje del prototipo aprobado). `ctx` = {region, pais}: +15 si es del estado detectado, +10 si es del país de la empresa
   *  (con empresa MX, «esco» da General Escobedo antes que Escondido, CA). Si el texto ES un estado, sus ciudades
   *  primero, de más a menos pobladas. Máximo `max` (60). */
  function buscarCat(q, ctx, max) {
    ctx = ctx || {}; var k = norm(q), st = estadoDe(q), out = [], rg = ctx.region;
    if (!k || !CAT) return { st: null, total: 0, L: [] };
    CAT.L.forEach(function (x) {
      var s = calza(k, x.k);
      // por alias (cabecera o nombre del municipio) calza igual si es exacto y, si no, 5 puntos abajo del nombre: «esco» → General Escobedo antes que
      // Tultitlán (cuya cabecera es «Tultitlán de Mariano Escobedo»); «ciudad obregon» sigue llevando a Cajeme.
      x.ka.forEach(function (a) { var c = calza(k, a); if (c >= 0) s = Math.max(s, c === 100 ? c : c - 5); });
      if (st && x.e === st.e && x.pais === st.pais) s = 200;
      if (s < 0) return;
      s += Math.log10(x.pob + 1) * 2.5;
      if (rg && x.e === rg.e && x.pais === rg.pais) s += 15;
      if (ctx.pais && x.pais === ctx.pais) s += 10;
      out.push({ x: x, s: s });
    });
    out.sort(function (a, b) { return b.s - a.s || (b.x.pob - a.x.pob) || ((a.x.rango || 0) - (b.x.rango || 0)) || a.x.c.localeCompare(b.x.c); });
    return { st: st, total: out.length, L: out.slice(0, max || 60).map(function (o) { return o.x; }) };
  }
  /** Las ciudades del estado detectado, de más a menos pobladas. */
  function delEstado(rg, n) {
    if (!CAT || !rg) return [];
    return CAT.L.filter(function (x) { return x.e === rg.e && x.pais === rg.pais; }).slice(0, n || 12);
  }
  /** Una ciudad del catálogo (o null), aceptando los nombres viejos. */
  function delCatalogo(x) {
    var c = canon(x); if (!c || !CAT) return null;
    return CAT.L.filter(function (y) { return y.c === c.c && y.e === c.e && (!c.pais || y.pais === c.pais); })[0] || null;
  }
  /** Las de la lista corta (donde ya trabaja FTS), del catálogo si ya se bajó. */
  function deFts() {
    return todas().map(function (x) { return delCatalogo(x) || { c: x.c, e: x.e, pais: x.pais, en: NOMBRE_EDO[x.e] || '' }; });
  }
  /** Lo que se manda al elegir de la lista: ciudad, estado y país (nada más; ni población ni centro). Los pocos
   *  municipios de más de 60 caracteres van con su cabecera si cabe, si no recortados (límite de la base). */
  function eleccion(x) {
    var c = x.c; if (c.length > 60 && x.alias) { var a = x.alias.split(' · ').filter(function (s) { return s.length <= 60; })[0]; if (a) c = a; }
    return limpia({ c: c, e: x.e, pais: x.pais });
  }

  G.CzCiudad = { CIUDADES: CIUDADES, cercana: cercana, deZona: deZona, detectar: detectar, deTexto: deTexto, buscar: buscar,
    nombre: nombre, sinAcento: sinAcento,
    // V1.39
    catalogo: catalogo, buscarCat: buscarCat, delEstado: delEstado, deFts: deFts, canon: canon, igual: igual, norm: norm,
    eleccion: eleccion, regionDe: regionDe, delCatalogo: delCatalogo,
    conteo: function () { return CAT ? { mx: CAT.n_mx, us: CAT.n_us } : null; }, cargas: function () { return cargas; }, listo: function () { return !!CAT; } };
})(window);
