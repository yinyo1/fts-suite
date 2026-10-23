// Puente de pruebas: lee {tipo, datos, url?, ms?} por stdin y devuelve el correo armado (JSON).
const c = require('../../n8n/code/correo.js');
let s = '';
process.stdin.on('data', d => (s += d)).on('end', () => {
  const x = JSON.parse(s);
  let n = 7;
  const rnd = () => (n = (n * 73 + 41) % 256);
  const r = c.armar(x.tipo, x.datos, x.url || '', x.ms || Date.UTC(2026, 9, 1, 15, 0, 0), rnd);
  delete r.mime_b64;
  process.stdout.write(JSON.stringify(r));
});
