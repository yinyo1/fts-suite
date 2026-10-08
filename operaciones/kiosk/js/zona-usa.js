// ═══ FTS Kiosk — Zona región USA ═══
// Decide si una coordenada está dentro de EE.UU. continental con el contorno real
// del país (shared/geo/usa-continental.json, generado por
// scripts/geo/generar-usa-continental.js desde OpenStreetMap). Sin API externa.
//
// NUNCA usar un rectángulo: el rectángulo de EE.UU. continental contiene a
// Monterrey (lat 25.69) y a todo el norte de México.
//
// El archivo pesa ~300 KB y solo se descarga cuando hace falta: si la checada ya
// cayó en un sitio autorizado no se toca. Funciona igual en el navegador
// (window.ZonaUSA) y en Node (module.exports) para las pruebas.
(function(root){
  'use strict';

  var URL_CONTORNO = '../../shared/geo/usa-continental.json';
  var cache = null;      // { escala, poligonos:[{bbox:[..] escalado, x:Int32Array, y:Int32Array}] }
  var cargando = null;

  // Decodifica los pares delta-enteros del archivo a coordenadas absolutas.
  function preparar(data){
    if(!data || !Array.isArray(data.poligonos) || !data.poligonos.length || !data.escala){
      throw new Error('CONTORNO_USA_INVALIDO');
    }
    var polis = data.poligonos.map(function(p){
      var n = p.d.length / 2, x = new Int32Array(n), y = new Int32Array(n), px = 0, py = 0;
      for(var i = 0; i < n; i++){ px += p.d[2*i]; py += p.d[2*i+1]; x[i] = px; y[i] = py; }
      return { bbox: p.bbox, x: x, y: y };
    });
    return { escala: data.escala, poligonos: polis };
  }

  // Par-impar clásico sobre enteros escalados (sin error de flotante en los vértices).
  function dentroAnillo(px, py, x, y){
    var dentro = false;
    for(var i = 0, j = x.length - 1; i < x.length; j = i++){
      if(((y[i] > py) !== (y[j] > py)) &&
         (px < (x[j] - x[i]) * (py - y[i]) / (y[j] - y[i]) + x[i])) dentro = !dentro;
    }
    return dentro;
  }

  function contieneCon(contorno, lat, lng){
    if(lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
    var px = Math.round(lng * contorno.escala), py = Math.round(lat * contorno.escala);
    for(var k = 0; k < contorno.poligonos.length; k++){
      var p = contorno.poligonos[k], b = p.bbox;
      if(px < b[0] || py < b[1] || px > b[2] || py > b[3]) continue;
      if(dentroAnillo(px, py, p.x, p.y)) return true;
    }
    return false;
  }

  // Navegador: descarga una vez por sesión de página. Lanza si no se pudo cargar,
  // para que el llamador NO confunda "no cargó" con "no está en USA" (§20 #11).
  function cargar(){
    if(cache) return Promise.resolve(cache);
    if(cargando) return cargando;
    cargando = fetch(URL_CONTORNO, { cache: 'force-cache' })
      .then(function(r){ if(!r.ok) throw new Error('CONTORNO_USA_HTTP_' + r.status); return r.json(); })
      .then(function(data){ cache = preparar(data); return cache; })
      .catch(function(e){ cargando = null; throw e; });
    return cargando;
  }

  // Devuelve { usa: true|false } o { usa: null, error } si no se pudo decidir.
  async function evaluar(lat, lng){
    try{
      var c = await cargar();
      return { usa: contieneCon(c, lat, lng) };
    } catch(e){
      return { usa: null, error: (e && e.message) || String(e) };
    }
  }

  var NOMBRE_ZONA = 'USA (región)';

  // Combina la validación de sitios (validarGeolocacion del kiosko) con la región USA.
  // Regla: un sitio autorizado gana; si no hay sitio, la región USA autoriza; si la
  // región no se pudo evaluar (contorno no cargó), NO se asume nada y la checada va
  // a aprobación como hoy (falla hacia el lado tolerable, nunca hacia "autorizado").
  //   sitio:  { autorizado, sitio?, sitioMasCercano?, distancia?, pais? }
  //   usa:    { usa: true|false|null, error? }  (null/undefined = no se evaluó)
  //   activo: interruptor "Permitir checada en todo USA"
  function resolverZona(sitio, usa, activo){
    sitio = sitio || { autorizado: false };
    if(sitio.autorizado){
      return Object.assign({}, sitio, { zona: sitio.sinRestriccion ? 'sin_restriccion' : 'sitio', pais: sitio.pais || null });
    }
    if(activo && usa && usa.usa === true){
      return { autorizado: true, sitio: NOMBRE_ZONA, distancia: 0, zona: 'usa', pais: 'US' };
    }
    return Object.assign({}, sitio, {
      zona: 'fuera',
      pais: (activo && usa && usa.usa === false) ? 'NO_US' : null,
      region_error: (activo && usa && usa.usa == null) ? (usa.error || 'NO_EVALUADA') : null
    });
  }

  // La salida en zona USA exige SO de México o de USA. Una zona USA "de sitio"
  // (un sitio configurado con pais:'US') cuenta igual.
  function esZonaUsa(z){
    return !!z && (z.zona === 'usa' || (z.zona === 'sitio' && z.pais === 'US'));
  }

  // ─ Catálogo de SO en zona USA: México (company 1) + USA (company 6) ─
  var EMPRESAS = { 1: 'MX', 6: 'USA' };

  function companyIdDe(row){
    var c = row && (row.company_id != null ? row.company_id : row.empresa_id);
    if(Array.isArray(c)) return parseInt(c[0], 10) || null;
    if(c && typeof c === 'object' && c.id != null) return parseInt(c.id, 10) || null;
    if(typeof c === 'number' || typeof c === 'string') return parseInt(c, 10) || null;
    return null;
  }

  // Junta las dos respuestas de /kiosk/sos ({company_id:1} y {company_id:6}).
  // Cada renglón sale con _company_id y _empresa ('MX'|'USA') para pintarlo.
  // Si el servidor trae company_id en el renglón, manda ése; si no, se usa la
  // empresa que se pidió. Y si la respuesta "USA" trae exactamente los mismos ids
  // que la de México sin decir empresa, el servidor está ignorando el company_id:
  // NO se etiquetan como USA (sería mentir) y se reporta el catálogo USA como no
  // disponible. Una lista USA vacía tampoco se lee como "no hay": 0 renglones se
  // ve igual cuando no hay proyectos que cuando la consulta está mal (§20 #11).
  function combinarCatalogos(listaMx, listaUs, companyMx){
    companyMx = companyMx || 1;
    listaMx = Array.isArray(listaMx) ? listaMx : [];
    listaUs = Array.isArray(listaUs) ? listaUs : [];
    var traeEmpresa = listaMx.concat(listaUs).some(function(r){ return companyIdDe(r) != null; });
    var idsMx = listaMx.map(function(r){ return r.id; }).sort().join(',');
    var idsUs = listaUs.map(function(r){ return r.id; }).sort().join(',');
    var motivo = null;
    if(!listaUs.length) motivo = 'CATALOGO_USA_VACIO';
    else if(!traeEmpresa && idsMx === idsUs) motivo = 'SERVIDOR_IGNORA_COMPANY_ID';

    var vistos = {}, lista = [];
    function agregar(r, pedida){
      if(!r || r.id == null || vistos[r.id]) return;
      var cid = companyIdDe(r) || pedida;
      vistos[r.id] = true;
      lista.push(Object.assign({}, r, { _company_id: cid, _empresa: EMPRESAS[cid] || ('Empresa ' + cid) }));
    }
    listaMx.forEach(function(r){ agregar(r, companyMx); });
    if(!motivo) listaUs.forEach(function(r){ agregar(r, 6); });
    var usaDisponible = !motivo;
    return {
      lista: lista,
      usaDisponible: usaDisponible,
      motivo: motivo,
      // Obligatoria solo si de verdad hay de dónde elegir: si el catálogo USA no
      // llegó, obligar a elegir una SO de México sería obligar a mentir.
      obligatoria: usaDisponible && lista.length > 0
    };
  }

  // Zona horaria y desfase del dispositivo en el momento del evento.
  function zonaHorariaLocal(fecha){
    var d = fecha || new Date(), tz = null;
    try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch(e){}
    return { tz: tz, utc_offset_min: -d.getTimezoneOffset() };
  }

  var api = {
    URL_CONTORNO: URL_CONTORNO,
    preparar: preparar,
    contieneCon: contieneCon,
    cargar: cargar,
    evaluar: evaluar,
    zonaHorariaLocal: zonaHorariaLocal,
    resolverZona: resolverZona,
    esZonaUsa: esZonaUsa,
    combinarCatalogos: combinarCatalogos,
    companyIdDe: companyIdDe,
    EMPRESAS: EMPRESAS,
    NOMBRE_ZONA: NOMBRE_ZONA
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZonaUSA = api;
})(typeof window !== 'undefined' ? window : this);
