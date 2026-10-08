#!/usr/bin/env node
// Genera shared/geo/usa-continental.json: contorno simplificado de EE.UU. continental
// (48 estados + DC), autocontenido, para que el kiosko decida "estoy en USA" sin API externa.
//
// Fuente: @geo-maps/countries-land-100m 0.6.0 (OpenStreetMap, resolucion 100 m).
//   Datos (c) colaboradores de OpenStreetMap, licencia ODbL 1.0.
//   https://www.npmjs.com/package/@geo-maps/countries-land-100m
//
// Uso:
//   npm pack @geo-maps/countries-land-100m@0.6.0 && tar xzf geo-maps-*.tgz
//   node scripts/geo/generar-usa-continental.js package/map.geo.json shared/geo/usa-continental.json
//
// Por que NO un rectangulo: el rectangulo de EE.UU. continental (lat 24.4-49.4) contiene a
// Monterrey (25.69) y a todo el norte de Mexico. Aqui la frontera con Mexico y Canada se
// conserva casi intacta (tolerancia 25 m, por debajo de la resolucion de la fuente) y solo
// la costa y el interior se simplifican (tolerancia 300 m). Las islas de menos de 1 km2
// se descartan. Los huecos (lagos interiores) se descartan: un lago dentro del pais cuenta
// como pais.
'use strict';
const fs = require('fs');
const [,, SRC, OUT] = process.argv;
if (!SRC || !OUT) { console.error('uso: generar-usa-continental.js <map.geo.json> <salida.json>'); process.exit(2); }

const TOL_FRONTERA_M = 25;
const TOL_RESTO_M = 300;
const DIST_FRONTERA_M = 3000;   // un vertice a menos de 3 km de MEX o CAN es "frontera"
const MIN_ISLA_KM2 = 1;
const ESCALA = 1e5;             // 1e-5 grados ~ 1.1 m

const T = {};
for (const f of JSON.parse(fs.readFileSync(SRC, 'utf8')).features) {
  const k = f.properties.A3;
  if (k === 'USA' || k === 'MEX' || k === 'CAN') T[k] = f;
}
if (!T.USA || !T.MEX || !T.CAN) throw new Error('FUENTE_INCOMPLETA: faltan USA, MEX o CAN en ' + SRC);

const polysOf = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
const R = 6371000, rad = d => d * Math.PI / 180;
function areaKm2(ring) {
  let a = 0; const c = Math.cos(rad(ring[0][1]));
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (rad(ring[j][0]) * c * R) * (rad(ring[i][1]) * R) - (rad(ring[i][0]) * c * R) * (rad(ring[j][1]) * R);
  }
  return Math.abs(a / 2) / 1e6;
}
function bbox(r) {
  const b = [180, 90, -180, -90];
  for (const p of r) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  return b;
}
// Continental = centro del bbox dentro de lng [-126,-66], lat [24,49.6]. Deja fuera Alaska,
// Hawai, Puerto Rico y territorios.
const continental = polysOf(T.USA).filter(p => {
  const b = bbox(p[0]); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  return cx > -126 && cx < -66 && cy > 24 && cy < 49.6;
});

const CELDA = 0.05, grid = new Map();
for (const k of ['MEX', 'CAN']) for (const p of polysOf(T[k])) for (const r of p) for (const q of r) {
  const key = Math.floor(q[0] / CELDA) + ',' + Math.floor(q[1] / CELDA);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(q);
}
function esFrontera(q) {
  const cx = Math.floor(q[0] / CELDA), cy = Math.floor(q[1] / CELDA);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const L = grid.get((cx + dx) + ',' + (cy + dy)); if (!L) continue;
    for (const v of L) {
      if (Math.hypot((v[0] - q[0]) * Math.cos(rad(q[1])) * 111320, (v[1] - q[1]) * 110540) < DIST_FRONTERA_M) return true;
    }
  }
  return false;
}
// Douglas-Peucker con tolerancia por vertice (manda la menor del tramo).
function simplificar(ring, tol) {
  const n = ring.length; if (n < 5) return ring;
  const c = Math.cos(rad(ring[0][1]));
  const X = ring.map(p => [rad(p[0]) * c * R, rad(p[1]) * R]);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0, mi = -1;
    const ax = X[a][0], ay = X[a][1], dx = X[b][0] - ax, dy = X[b][1] - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let t = L ? ((X[i][0] - ax) * dx + (X[i][1] - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const exceso = Math.hypot(X[i][0] - ax - t * dx, X[i][1] - ay - t * dy) - Math.min(tol[i], tol[a], tol[b]);
      if (exceso > md) { md = exceso; mi = i; }
    }
    if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return ring.filter((p, i) => keep[i]);
}

const poligonos = [];
let vIn = 0, vFrontera = 0, vOut = 0, islas = 0;
for (const p of continental) {
  const outer = p[0];
  if (areaKm2(outer) < MIN_ISLA_KM2) { islas++; continue; }
  vIn += outer.length;
  const tol = outer.map(q => { const f = esFrontera(q); if (f) vFrontera++; return f ? TOL_FRONTERA_M : TOL_RESTO_M; });
  const s = simplificar(outer, tol);
  vOut += s.length;
  // delta-enteros: [x0, y0, dx1, dy1, ...] en 1e-5 grados
  const flat = []; let px = 0, py = 0;
  for (const q of s) { const x = Math.round(q[0] * ESCALA), y = Math.round(q[1] * ESCALA); flat.push(x - px, y - py); px = x; py = y; }
  const b = bbox(s);
  poligonos.push({ bbox: b.map(v => Math.round(v * ESCALA)), d: flat });
}
poligonos.sort((a, b) => b.d.length - a.d.length);

const salida = {
  _que: 'Contorno simplificado de EE.UU. continental (48 estados + DC) para la zona region USA del kiosko.',
  _fuente: '@geo-maps/countries-land-100m 0.6.0, derivado de OpenStreetMap',
  _licencia: 'Datos (c) colaboradores de OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
  _generador: 'scripts/geo/generar-usa-continental.js',
  _parametros: { TOL_FRONTERA_M, TOL_RESTO_M, DIST_FRONTERA_M, MIN_ISLA_KM2 },
  _formato: 'cada poligono: bbox [minLng,minLat,maxLng,maxLat] y d = pares delta-enteros en 1e-5 grados (lng,lat)',
  escala: ESCALA,
  poligonos
};
fs.writeFileSync(OUT, JSON.stringify(salida));
console.log(JSON.stringify({ poligonos: poligonos.length, islas_descartadas: islas, vertices_fuente: vIn, vertices_frontera: vFrontera, vertices_salida: vOut, bytes: fs.statSync(OUT).size }));
