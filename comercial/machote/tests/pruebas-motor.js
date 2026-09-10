/* ═══ Machote · pruebas del MOTOR ═══
 *
 * `node tests/pruebas-motor.js` — corre en menos de un segundo, sin navegador.
 *
 * ── POR QUÉ EXISTE, ADEMÁS DE LA SUITE DE NAVEGADOR ──────────────────────
 * La suite de `pruebas-navegador.js` tarda ~55 minutos porque levanta Chromium
 * y mira pantallas. Eso está bien para lo que se ve; es carísimo para lo que
 * se calcula. El motor es JavaScript puro y no necesita un navegador para
 * ejercitarse — sólo `window`.
 *
 * Y la regla que obliga a tenerla: **todo cambio a totales, márgenes o
 * multiplicadores lleva prueba que EJERCITE el cálculo, no que lo lea.** Cada
 * caso de abajo mete números, corre `calcular()` y compara contra una cuenta
 * hecha a mano en el propio nombre de la prueba.
 *
 * ⚠️ Esto NO sustituye a la suite de navegador: ahí vive todo lo que sólo se
 * puede comprobar mirando. Las dos se corren antes de mergear.
 */
global.window = global;
require(require('path').resolve(__dirname, '..', 'js', 'calc.js'));
const C = window.MachoteCalc;
let ok = 0, mal = 0;
const eq = (a, b, t, tol) => {
  const bien = Math.abs(a - b) < (tol === undefined ? 0.01 : tol);
  console.log((bien ? '✓' : '✗'), t, bien ? '' : ('→ ' + a + ' ≠ ' + b));
  bien ? ok++ : mal++;
};
const es = (a, b, t) => { const bien = a === b;
  console.log((bien ? '✓' : '✗'), t, bien ? '' : ('→ ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)));
  bien ? ok++ : mal++; };

// ── Un machote VIEJO: sin pais, sin viaje, sin tipo Viaje ──────────────────
const viejo = C.machoteNuevo({ nombre: 'viejo' });
delete viejo.pais; delete viejo.estado; delete viejo.ciudad; delete viejo.viaje;
const s0 = viejo.secciones[0];
s0.mo.find(l => l.rol === 'tecnicos').qty = 100;
s0.partidas[0].qty = 2; s0.partidas[0].pu = 1000; s0.partidas[0].tipo = 'Materiales';
const cv = C.calcular(viejo);
eq(cv.costoMo, 140 * 100, 'viejo · mano de obra 100 h × 140');
eq(cv.costoMat, 2000, 'viejo · materiales 2 × 1000');
eq(cv.costoViaje, 0, 'viejo · viaje en cero, el campo nuevo es inerte');
eq(cv.horas, 100, 'viejo · 100 horas');
es(cv.lugar.tiene, false, 'viejo · el motor dice que le FALTA el lugar');
es(cv.lugar.foraneo, false, 'viejo · sin lugar NO se supone foráneo');

// ── Viaje: multiplicador 1, siempre ────────────────────────────────────────
const m = C.machoteNuevo({ nombre: 'con viaje' });
const s = m.secciones[0];
s.partidas[0].qty = 1; s.partidas[0].pu = 12000; s.partidas[0].tipo = 'Viaje';
s.partidas[0].descripcion = 'Vuelos';
const c1 = C.calcular(m);
eq(c1.costoViaje, 12000, 'viaje · el costo entra');
eq(c1.ventaViaje, 12000, 'viaje · se VENDE a lo que cuesta (mult 1)');
eq(c1.costoMat, 0, 'viaje · NO se cuela en materiales');
// y no se deja pisar
s.partidas[0].margen = 1.8;
const c2 = C.calcular(m);
eq(c2.ventaViaje, 12000, 'viaje · un margen escrito encima se IGNORA');
es(c2.viajeConMargen, 1, 'viaje · pero queda marcado para que la regla lo diga');

// ── Días de viaje: no son horas ────────────────────────────────────────────
const d = C.machoteNuevo({ nombre: 'dias' });
const sd = d.secciones[0];
sd.mo.find(l => l.rol === 'tecnicos').qty = 40;
const ld = sd.mo.find(l => l.rol === 'dias_viaje');
ld.qty = 2; ld.personas = 3; ld.pu = 1500;
const cd = C.calcular(d);
eq(cd.horas, 40, 'días · HORAS PROYECTO no cuenta los días de viaje');
eq(cd.dias, 6, 'días · 2 días × 3 personas = 6 días, contados aparte');
eq(cd.costoMo, 40 * 140 + 2 * 3 * 1500, 'días · pero SÍ cuestan, en mano de obra');

// ── Recargo de fin de semana: sólo en Estados Unidos ───────────────────────
const w = C.machoteNuevo({ nombre: 'finde' });
const sw = w.secciones[0];
const lw = sw.mo.find(l => l.rol === 'hrs_finde');
lw.qty = 10; lw.personas = 1; lw.pu = 100;
eq(C.calcular(w).costoMo, 1000, 'finde · en Monterrey NO hay recargo');
w.pais = 'US'; w.estado = 'Nuevo México'; w.ciudad = 'Albuquerque';
eq(C.calcular(w).costoMo, 1300, 'finde · en EUA, 10 h × 100 × 1.30 = 1300');
w.viaje.recargo_fin_semana = 0.5;
eq(C.calcular(w).costoMo, 1500, 'finde · el recargo es editable: 50% → 1500');
// festivo nace SIN confirmar y por eso no cobra de más
const lf = sw.mo.find(l => l.rol === 'hrs_festivo');
lw.qty = 0; lf.qty = 10; lf.personas = 1; lf.pu = 100;
eq(C.calcular(w).costoMo, 1000, 'festivo · sin confirmar = sin recargo, no se inventa');
w.viaje.recargo_festivo = 0.4;
eq(C.calcular(w).costoMo, 1400, 'festivo · escrito por quien cotiza, sí se aplica');

// ── Foráneo ────────────────────────────────────────────────────────────────
es(C.esForaneo(C.machoteNuevo({})), false, 'foráneo · Monterrey no lo es');
es(C.esForaneo({ pais: 'MX', ciudad: 'MONTERREY  ' }), false, 'foráneo · ni con mayúsculas y espacios');
es(C.esForaneo({ pais: 'MX', ciudad: 'Montérrey' }), false, 'foráneo · ni con un acento de más');
es(C.esForaneo({ pais: 'MX', ciudad: 'Guadalajara' }), true, 'foráneo · Guadalajara SÍ (mover gente cuesta)');
es(C.esForaneo({ pais: 'US', ciudad: 'Albuquerque' }), true, 'foráneo · Albuquerque también');

// ── El REVISADOR: lo que bloquea y lo que no ───────────────────────────────
// Se carga aquí abajo porque `reglas.js` necesita a `DEMO` para el cuestionario
// de diagnóstico, y `demo.js` necesita al motor. El orden importa.
require(require('path').resolve(__dirname, '..', 'js', 'demo.js'));
require(require('path').resolve(__dirname, '..', 'js', 'reglas.js'));
const R = window.MachoteReglas;
const tieneDura = (m, id) => R.revisar(m).duras.some(h => h.id === id);
const tieneBlanda = (m, id) => R.revisar(m).blandas.some(h => h.id === id);

// Un machote de Monterrey NO pide nada de viaje.
const local = C.machoteNuevo({ nombre: 'local' });
es(tieneDura(local, 'foranea-sin-viaje'), false, 'regla · Monterrey no pide nada de viaje');
es(tieneDura(local, 'sin-lugar-ejecucion'), false, 'regla · y nace CON lugar, no lo reclama');

// Uno foráneo SIN nada de viaje: bloquea.
const fuera = C.machoteNuevo({ nombre: 'foráneo' });
fuera.pais = 'US'; fuera.estado = 'Nuevo México'; fuera.ciudad = 'Albuquerque';
es(tieneDura(fuera, 'foranea-sin-viaje'), true, 'regla · foráneo sin viaje BLOQUEA');
es(R.revisar(fuera).puedeConfirmar, false, 'regla · y por eso no se deja terminar');

// Basta UN concepto de viaje para desbloquear.
const conVuelo = JSON.parse(JSON.stringify(fuera));
conVuelo.secciones[0].partidas[0].tipo = 'Viaje';
conVuelo.secciones[0].partidas[0].qty = 2;
conVuelo.secciones[0].partidas[0].pu = 9000;
conVuelo.secciones[0].partidas[0].descripcion = 'Vuelos';
es(tieneDura(conVuelo, 'foranea-sin-viaje'), false, 'regla · con vuelos capturados, ya no bloquea');

// O los días de viaje solos.
const conDias = JSON.parse(JSON.stringify(fuera));
const ldv = conDias.secciones[0].mo.find(l => l.rol === 'dias_viaje');
ldv.qty = 2; ldv.pu = 1500;
es(tieneDura(conDias, 'foranea-sin-viaje'), false, 'regla · o con días de viaje, tampoco');

// O marcarlo explícitamente. Y entonces queda DICHO, no olvidado.
const marcado = JSON.parse(JSON.stringify(fuera));
marcado.viaje.no_aplica = true;
es(tieneDura(marcado, 'foranea-sin-viaje'), false, 'regla · marcar «no se ocupan» desbloquea');
es(tieneBlanda(marcado, 'viaje-marcado-no-aplica'), true, 'regla · pero deja constancia visible');

// Un machote VIEJO, sin el campo: se le reclama el lugar, no se le supone.
const antiguo = C.machoteNuevo({ nombre: 'antiguo' });
delete antiguo.pais; delete antiguo.ciudad;
es(tieneDura(antiguo, 'sin-lugar-ejecucion'), true, 'regla · sin lugar, lo reclama');
es(tieneDura(antiguo, 'foranea-sin-viaje'), false, 'regla · pero NO lo trata como foráneo');

// El margen sobre un renglón de viaje se dice en voz alta.
const conMargen = JSON.parse(JSON.stringify(conVuelo));
conMargen.secciones[0].partidas[0].margen = 1.8;
es(tieneBlanda(conMargen, 'viaje-con-margen'), true, 'regla · un margen sobre viaje se señala');

// ── El campo del lugar NO pisa el estado del documento ─────────────────────
// La primera versión de esto llamó `estado` a la subdivisión. `m.estado` ya
// existía desde V1.07 y significa borrador / en revisión / enviado a Odoo: se
// vio en la captura diciendo «Estado: borrador», y elegir «Texas» habría
// puesto el machote en estado «Texas» y roto el flujo entero, en silencio.
// Es el choque de `.kpi` de V1.22, pero en un campo de datos.
const col = C.machoteNuevo({ nombre: 'colisión' });
es(col.estado, 'borrador', 'colisión · el machote nace en estado borrador');
es(col.region, 'Nuevo León', 'colisión · y la subdivisión vive en `region`');
col.region = 'Texas'; col.pais = 'US'; col.ciudad = 'San Antonio';
es(col.estado, 'borrador', 'colisión · mover el lugar NO toca el estado del documento');
es(C.esForaneo(col), true, 'colisión · y el lugar sí se lee de `region`/`ciudad`');

// ── Los 8 machotes que ya existen: ni se rompen ni ganan campos ────────────
// «No los rompas ni les inventes valores», textual. Un documento viejo tiene
// que seguir calculando igual Y seguir sin los campos nuevos: si el motor se
// los rellenara, el machote diría que se ejecuta en Monterrey sin que nadie lo
// haya dicho, y eso es peor que no tener el dato.
const vj = C.machoteNuevo({ nombre: 'de antes' });
delete vj.pais; delete vj.region; delete vj.ciudad; delete vj.viaje;
vj.secciones[0].mo.find(l => l.rol === 'tecnicos').qty = 50;
const antes = JSON.stringify(vj);
const cvj = C.calcular(vj);
es(JSON.stringify(vj), antes, 'viejos · calcular NO modifica el documento');
es('pais' in vj, false, 'viejos · sigue sin `pais`: no se le inventa Monterrey');
es('viaje' in vj, false, 'viejos · sigue sin bloque `viaje`');
eq(cvj.costoMo, 50 * 140, 'viejos · y da exactamente los mismos números');
eq(cvj.costoViaje, 0, 'viejos · con el viaje en cero');
// Y el revisador les pide el dato, en vez de suponerlo.
es(tieneDura(vj, 'sin-lugar-ejecucion'), true, 'viejos · el revisador pide el lugar');
es(tieneDura(vj, 'foranea-sin-viaje'), false, 'viejos · pero no los trata como foráneos');

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron.');
process.exit(mal ? 1 : 0);
