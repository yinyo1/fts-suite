// Pruebas de la regla del periodo DC-3 (#505). Correr: node seguridad/tests/dc3-periodo.test.js
// Mismas opciones que usa la app: tope 12 h, reparto parejo (D1 a), sábado y domingo cuentan (D3 a).
const P = require('../js/dc3-periodo.js');
const OPTS = { tope: 12, reparto: 'parejo', contarFines: true };
const C = { A8: {nombre:'CURSO A', hrs:8}, B6: {nombre:'CURSO B', hrs:6}, B4: {nombre:'CURSO B4', hrs:4},
            C12: {nombre:'CURSO C', hrs:12}, D16: {nombre:'CURSO D', hrs:16} };
const d = '2026-11-20', d2 = '2026-11-21';
const A = (id, emp, curso, ini, fin) => ({ id, empleado: emp, curso, ini, fin });
const casos = [
  ['Curso de 8 h en 1 día: pasa', [A(1,'e1','A8',d,d)], 'pasa'],
  ['Curso de 12 h en 1 día: pasa', [A(1,'e1','C12',d,d)], 'pasa'],
  ['Curso de 16 h en 1 día: bloquea', [A(1,'e1','D16',d,d)], 'bloquea'],
  ['Curso de 16 h en 2 días: pasa', [A(1,'e1','D16','2026-11-17','2026-11-18')], 'pasa'],
  ['Curso de 16 h del vie 20-nov al sáb 21-nov-2026: pasa', [A(1,'e1','D16',d,d2)], 'pasa'],
  ['Misma persona, 8 h + 6 h el mismo día: bloquea', [A(1,'e1','A8',d,d), A(2,'e1','B6',d,d)], 'bloquea'],
  ['Misma persona, 8 h + 4 h el mismo día: pasa', [A(1,'e1','A8',d,d), A(2,'e1','B4',d,d)], 'pasa'],
  ['Mismo curso duplicado a una persona el mismo día (16 h): bloquea', [A(1,'e1','A8',d,d), A(2,'e1','A8',d,d)], 'bloquea'],
  ['Dos personas, mismo curso de 12 h, mismo día: pasa', [A(1,'e1','C12',d,d), A(2,'e2','C12',d,d)], 'pasa'],
  ['Fecha fin antes del inicio: bloquea', [A(1,'e1','A8',d,'2026-11-19')], 'bloquea'],
  ['16 h (20–21 nov) + 4 h el 20 = 8 + 4 con reparto parejo: pasa', [A(1,'e1','D16',d,d2), A(2,'e1','B4',d,d)], 'pasa'],
];
let fallas = 0;
for (const [nombre, asg, esperado] of casos) {
  const r = P.validarLote(asg, C, OPTS);
  const obtenido = r.conError ? 'bloquea' : 'pasa';
  const ok = obtenido === esperado; if (!ok) fallas++;
  const msgs = Object.values(r.porAsignacion).flatMap(x => x.errores.map(e => e.texto));
  console.log((ok ? 'OK  ' : 'FALLA ') + nombre + (msgs.length ? '  → ' + msgs[0] : ''));
}
// Mensajes concretos
const r16 = P.validarLote([A(1,'e1','D16',d,d)], C, OPTS).porAsignacion[1].errores[0].texto;
if (!/al menos 2 días/.test(r16) || !/21\/11\/2026/.test(r16)) { fallas++; console.log('FALLA mensaje 16 h: ' + r16); }
const rt = P.validarLote([A(1,'e1','A8',d,d), A(2,'e1','B6',d,d)], C, OPTS).porAsignacion[1].errores[0];
if (rt.tipo !== 'tope' || rt.dia !== d || rt.suma !== 14) { fallas++; console.log('FALLA mensaje tope: ' + JSON.stringify(rt)); }
if (P.finMinima(d, 16, 12, true) !== d2) { fallas++; console.log('FALLA finMinima'); }
console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodas pasan (' + casos.length + ' casos + 3 verificaciones de mensaje)');
process.exit(fallas ? 1 : 0);
