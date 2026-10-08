#!/usr/bin/env node
// Pruebas de la zona región USA del kiosko.
//   node tests/kiosko-usa/zona-usa.test.js
// Usa el MISMO archivo que sirve Pages (shared/geo/usa-continental.json) y el MISMO
// módulo que carga el kiosko (operaciones/kiosk/js/zona-usa.js). Para cada punto
// imprime la distancia al borde del polígono: un acierto a 50 m del borde no vale
// lo mismo que uno a 50 km, y el lector tiene que poder verlo.
'use strict';
const fs = require('fs');
const path = require('path');
const Z = require('../../operaciones/kiosk/js/zona-usa.js');

const RAIZ = path.join(__dirname, '..', '..');
const contorno = Z.preparar(JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/geo/usa-continental.json'), 'utf8')));

// Coordenadas de centros de ciudad / aeropuertos públicos. Ninguna es un domicilio.
const CASOS = [
  // — obligatorios del requerimiento —
  ['Monterrey, NL (centro)',            25.6866, -100.3161, false],
  ['Laredo NL = Nuevo Laredo, Tamps',   27.4763,  -99.5164, false],
  ['Laredo TX',                         27.5306,  -99.4803, true ],
  ['Houston TX',                        29.7604,  -95.3698, true ],
  ['Irving TX',                         32.8140,  -96.9489, true ],
  ['Albuquerque NM',                    35.0844, -106.6504, true ],
  ['Palo Alto CA',                      37.4419, -122.1430, true ],
  ['Hayward CA',                        37.6688, -122.0808, true ],
  // — bordes que un rectángulo o un contorno burdo fallarían —
  ['Aeropuerto Nuevo Laredo (NLD)',     27.4439,  -99.5705, false],
  ['Aeropuerto Laredo TX (LRD)',        27.5438,  -99.4616, true ],
  ['Anáhuac, NL',                       27.2358, -100.1352, false],
  ['Matamoros, Tamps',                  25.8690,  -97.5027, false],
  ['Brownsville TX',                    25.9017,  -97.4975, true ],
  ['Ciudad Juárez, Chih',               31.6904, -106.4245, false],
  ['El Paso TX',                        31.7619, -106.4850, true ],
  ['Nogales, Son',                      31.3086, -110.9422, false],
  ['Nogales AZ',                        31.3404, -110.9343, true ],
  ['Tijuana, BC',                       32.5149, -117.0382, false],
  ['San Diego CA',                      32.7157, -117.1611, true ],
  ['Miami FL (más al sur que Monterrey)', 25.7617, -80.1918, true ],
  ['Key West FL (aeropuerto EYW)',      24.5561,  -81.7596, true ],
  ['Galveston TX',                      29.3013,  -94.7977, true ],
  ['Windsor ON (al sur de Detroit)',    42.3149,  -83.0364, false],
  ['Detroit MI',                        42.3314,  -83.0458, true ],
  ['Seattle WA',                        47.6062, -122.3321, true ],
  ['Vancouver BC',                      49.2827, -123.1207, false],
  ['Toronto ON',                        43.6532,  -79.3832, false],
  ['Anchorage AK (no continental)',     61.2181, -149.9003, false],
  ['Honolulu HI (no continental)',      21.3069, -157.8583, false],
  ['San Juan PR (no continental)',      18.4655,  -66.1057, false],
  ['Ciudad de México',                  19.4326,  -99.1332, false],
  ['Saltillo, Coah',                    25.4232, -100.9925, false],
  ['Chihuahua, Chih',                   28.6330, -106.0691, false],
  ['Mar abierto, Golfo de México',      25.0000,  -90.0000, false],
];

// Distancia mínima (m) del punto a cualquier arista del contorno.
function distanciaBorde(lat, lng){
  const esc = contorno.escala, c = Math.cos(lat * Math.PI / 180);
  const mx = 111320 * c / esc, my = 110540 / esc;
  const px = lng * esc, py = lat * esc;
  let min = Infinity;
  for(const p of contorno.poligonos){
    const b = p.bbox, marg = 2e6; // ~20 grados: solo descarta lo muy lejano
    if(px < b[0] - marg || px > b[2] + marg || py < b[1] - marg || py > b[3] + marg) continue;
    for(let i = 0, j = p.x.length - 1; i < p.x.length; j = i++){
      const ax = (p.x[j] - px) * mx, ay = (p.y[j] - py) * my, bx = (p.x[i] - px) * mx, by = (p.y[i] - py) * my;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if(d < min) min = d;
    }
  }
  return min;
}

let ok = 0, mal = 0;
console.log('Contorno: ' + contorno.poligonos.length + ' polígonos\n');
console.log('resultado  esperado  obtenido  dist. al borde  punto');
for(const [nombre, lat, lng, esperado] of CASOS){
  const obtenido = Z.contieneCon(contorno, lat, lng);
  const bien = obtenido === esperado;
  bien ? ok++ : mal++;
  const d = distanciaBorde(lat, lng);
  const dTxt = !isFinite(d) ? 'lejos' : d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
  console.log((bien ? '  ✓ ' : '  ✗ ') + '      ' + (esperado ? 'SÍ USA' : 'NO USA') + '    ' + (obtenido ? 'SÍ' : 'NO') + '       ' + dTxt.padStart(9) + '      ' + nombre);
}

// Guardas del módulo: entradas inválidas nunca son USA.
const guardas = [[null, null], [NaN, -99], [25.7, undefined]];
for(const [lat, lng] of guardas){
  if(Z.contieneCon(contorno, lat, lng) === false) ok++; else { mal++; console.log('  ✗ entrada inválida contó como USA', lat, lng); }
}

// Catálogo de SO en zona USA (combinarCatalogos)
const MX = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], US = [{ id: 3, name: 'C' }];
function esperar(nombre, real, esp){ const b = JSON.stringify(real) === JSON.stringify(esp); b ? ok++ : mal++; console.log((b ? '  ✓ ' : '  ✗ ') + nombre + (b ? '' : ' → ' + JSON.stringify(real))); }
console.log('\nCatálogo SO en zona USA:');
let r = Z.combinarCatalogos(MX, US);
esperar('MX + USA sin empresa en el renglón: etiqueta por empresa pedida', r.lista.map(x => x._empresa), ['MX', 'MX', 'USA']);
esperar('… y la SO queda obligatoria', [r.obligatoria, r.motivo], [true, null]);
r = Z.combinarCatalogos(MX, MX);
esperar('servidor ignora company_id (mismos ids, sin empresa): no se etiqueta USA', [r.lista.map(x => x._empresa), r.obligatoria, r.motivo], [['MX', 'MX'], false, 'SERVIDOR_IGNORA_COMPANY_ID']);
r = Z.combinarCatalogos(MX, []);
esperar('lista USA vacía no se lee como "no hay": no obligatoria', [r.obligatoria, r.motivo], [false, 'CATALOGO_USA_VACIO']);
r = Z.combinarCatalogos([{ id: 1, company_id: [1, 'SERVICIOS FTS'] }, { id: 3, company_id: [6, 'FTS LLC'] }], [{ id: 3, company_id: [6, 'FTS LLC'] }]);
esperar('si el servidor trae company_id, manda el del renglón y no se duplica', r.lista.map(x => [x.id, x._empresa]), [[1, 'MX'], [3, 'USA']]);

console.log('\nresolverZona:');
esperar('sitio gana sobre USA', Z.resolverZona({ autorizado: true, sitio: 'X' }, { usa: true }, true).zona, 'sitio');
esperar('USA autoriza si el interruptor está prendido', Z.resolverZona({ autorizado: false }, { usa: true }, true).autorizado, true);
esperar('interruptor apagado → fuera', Z.resolverZona({ autorizado: false }, { usa: true }, false).zona, 'fuera');
esperar('contorno no cargó → fuera (nunca autoriza a ciegas)', Z.resolverZona({ autorizado: false }, { usa: null, error: 'X' }, true).autorizado, false);

// El rectángulo de EE.UU. continental SÍ contiene a Monterrey: esta prueba documenta
// por qué está prohibido usarlo.
const RECT = { minLat: 24.396308, maxLat: 49.384358, minLng: -124.848974, maxLng: -66.885444 };
const enRect = (lat, lng) => lat >= RECT.minLat && lat <= RECT.maxLat && lng >= RECT.minLng && lng <= RECT.maxLng;
if(enRect(25.6866, -100.3161)) { ok++; console.log('\n  ✓ el rectángulo (bounding box) SÍ contiene a Monterrey: por eso no se usa'); }
else { mal++; console.log('\n  ✗ la prueba del rectángulo no reproduce el problema'); }

console.log('\n' + ok + ' ✓   ' + mal + ' ✗');
process.exit(mal ? 1 : 0);
