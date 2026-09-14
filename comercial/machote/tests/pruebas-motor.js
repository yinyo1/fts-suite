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


/* ── V1.28 · EL RECARGO ES DE LA SECCIÓN ───────────────────────────────────
 *
 * Decisión de Esteban (11-sep): el porcentaje deja de ser fijo y su alcance
 * es LA SECCIÓN, porque un mismo proyecto puede tener una sección que se
 * trabaja en fin de semana y otra que no. Lo que se prueba aquí es lo que
 * puede romperse: que NO se propague, y que los machotes ya capturados con el
 * recargo a nivel machote sigan valiendo exactamente lo mismo. */
(function () {   // en su propio ámbito: el archivo es plano y los nombres chocan


// El 30% vive en el arreglo de configuración, no incrustado en el código.
eq(C.RECARGOS_PLANTILLA.fin_semana, 0.30, 'recargo · el valor de arranque está en la configuración');
es(C.RECARGOS_PLANTILLA.festivo, null, 'recargo · y el de festivos sigue vacío a propósito');

// Un machote nuevo NO se escribe el número encima: lo lee de la plantilla.
const rn = C.machoteNuevo({ nombre: 'recargo nuevo' });
es(rn.viaje.recargo_fin_semana, undefined, 'recargo · un machote nuevo no trae número propio');
rn.pais = 'US'; rn.region = 'Texas'; rn.ciudad = 'Dallas';
const rn1 = rn.secciones[0];
const lrn = rn1.mo.find(l => l.rol === 'hrs_finde');
lrn.qty = 10; lrn.personas = 1; lrn.pu = 100;
eq(C.calcular(rn).costoMo, 1300, 'recargo · y aun así cobra el 30% de arranque');

// DOS SECCIONES: mover una NO toca la otra.
const dos = C.machoteNuevo({ nombre: 'dos tramos' });
dos.pais = 'US'; dos.region = 'Texas'; dos.ciudad = 'Dallas';
dos.secciones.push(C.seccionNueva('SECCIÓN 2', 'MXN', C.MARGENES_PLANTILLA));
const [A, B] = dos.secciones;
[A, B].forEach(sx => { const l = sx.mo.find(y => y.rol === 'hrs_finde');
                       l.qty = 10; l.personas = 1; l.pu = 100; });
eq(C.calcular(dos).costoMo, 2600, 'sección · las dos arrancan en 30%: 1300 + 1300');
A.recargos = { fin_semana: 0.50 };
const cdos = C.calcular(dos);
eq(cdos.secciones[0].costoMo, 1500, 'sección · la que se movió cobra 50%');
eq(cdos.secciones[1].costoMo, 1300, 'sección · Y LA OTRA NO SE ENTERA: sigue en 30%');
es(B.recargos, undefined, 'sección · no se le escribió nada a la sección de al lado');
es(dos.viaje.recargo_fin_semana, undefined, 'sección · ni se subió al machote');

// NO SE PROPAGA A MACHOTES NUEVOS: el siguiente arranca otra vez en 30%.
const sig = C.machoteNuevo({ nombre: 'el siguiente' });
sig.pais = 'US'; sig.region = 'Texas'; sig.ciudad = 'Dallas';
sig.secciones.push(C.seccionNueva('SECCIÓN 2', 'MXN', C.MARGENES_PLANTILLA));
sig.secciones.forEach(sx => { const l = sx.mo.find(y => y.rol === 'hrs_finde');
                              l.qty = 10; l.personas = 1; l.pu = 100; });
eq(C.calcular(sig).costoMo, 2600, 'nuevo · un machote nuevo arranca en 30% en TODAS sus secciones');
eq(C.RECARGOS_PLANTILLA.fin_semana, 0.30, 'nuevo · y el valor por defecto no se movió');

/* ── LOS QUE YA EXISTEN ────────────────────────────────────────────────────
 * Hay captura real de tres personas. Un machote capturado ANTES de V1.28 trae
 * su recargo en `m.viaje` y tiene que dar EXACTAMENTE los mismos números, sin
 * recibir un valor inventado al pasar a nivel sección. */
const v127 = {
  id: 'M-v127', nombre: 'capturado en V1.27', empresa_id: 1, moneda: 'MXN',
  escenario: 'con_utilidad', factor_proteccion: 0, tc: 17,
  pais: 'US', region: 'Texas', ciudad: 'Dallas',
  // así se guardaban: el número a nivel MACHOTE
  viaje: { no_aplica: false, recargo_fin_semana: 0.45, recargo_festivo: null, paga_dias: 'mx' },
  margenes: Object.assign({}, C.MARGENES_PLANTILLA),
  secciones: [C.seccionNueva('SECCIÓN 1', 'MXN', C.MARGENES_PLANTILLA),
              C.seccionNueva('SECCIÓN 2', 'MXN', C.MARGENES_PLANTILLA)]
};
v127.secciones.forEach(sx => { const l = sx.mo.find(y => y.rol === 'hrs_finde');
                                l.qty = 10; l.personas = 1; l.pu = 100; });
const cv = C.calcular(v127);
eq(cv.secciones[0].costoMo, 1450, 'v127 · el 45% del machote se respeta en la sección 1');
eq(cv.secciones[1].costoMo, 1450, 'v127 · y en la sección 2: mismo número que antes');
es(v127.secciones[0].recargos, undefined, 'v127 · NO se le escribió un recargo a la sección');
es(v127.viaje.recargo_fin_semana, 0.45, 'v127 · ni se le tocó el del machote');
es(C.recargosDe(v127, v127.secciones[0]).fin_semana.origen, 'machote',
   'v127 · y el motor dice de dónde sale el número');

// Y la sección manda sobre el machote v127, sin pisarle el dato.
v127.secciones[1].recargos = { fin_semana: 0.10 };
const cv2 = C.calcular(v127);
eq(cv2.secciones[0].costoMo, 1450, 'v127 · la sección 1 sigue con el 45% heredado');
eq(cv2.secciones[1].costoMo, 1100, 'v127 · la sección 2 manda sobre el machote');
es(v127.viaje.recargo_fin_semana, 0.45, 'v127 · y el machote sigue intacto');

/* Un machote de V1.27 con el 0.30 escrito —que es lo que `machoteNuevo`
 * escribía— NO se marca como apartado: tener el número escrito no es haberse
 * separado de nada. Se compara el VALOR, no la presencia del campo. */
const treinta = JSON.parse(JSON.stringify(v127));
treinta.viaje.recargo_fin_semana = 0.30;
delete treinta.secciones[1].recargos;
es(C.recargosDe(treinta, treinta.secciones[0]).fin_semana.apartado, false,
   'v127 · un 30% escrito a mano no cuenta como apartarse del 30%');
es(C.recargosDe(v127, v127.secciones[1]).fin_semana.apartado, true,
   'apartado · un 10% sí, y se marca');

// Vaciar la sección devuelve el mando a la capa de arriba.
delete v127.secciones[1].recargos.fin_semana;
eq(C.calcular(v127).secciones[1].costoMo, 1450, 'apartado · vaciar la sección vuelve a heredar');

/* ── CIUDAD JUÁREZ CONTRA DALLAS ───────────────────────────────────────────
 * Son DOS REGLAS, y ésta es la prueba de que no se volvieron una sola: los
 * gastos de viaje salen de dejar Nuevo León; el recargo, de ejecutar en
 * Estados Unidos. Juárez es foráneo y NO lleva recargo. */
function conFinde(pais, region, ciudad) {
  const x = C.machoteNuevo({ nombre: ciudad });
  x.pais = pais; x.region = region; x.ciudad = ciudad;
  const l = x.secciones[0].mo.find(y => y.rol === 'hrs_finde');
  l.qty = 10; l.personas = 1; l.pu = 100;
  return x;
}
const jz = conFinde('MX', 'Chihuahua', 'Ciudad Juárez');
const cjz = C.calcular(jz);
es(cjz.lugar.foraneo, true, 'Juárez · es foránea: pide viaje');
es(cjz.lugar.eua, false, 'Juárez · pero no se ejecuta en Estados Unidos');
eq(cjz.costoMo, 1000, 'Juárez · así que el fin de semana va a tarifa normal');
es(C.recargoDe(C.ROL.hrs_finde, jz, jz.secciones[0]).aplica, false,
   'Juárez · el recargo no aplica');
es(cjz.secciones[0].recargosApartados, 0, 'Juárez · y no hay nada que marcar');
// Y ni escribiéndole uno a la sección se cobra: la regla es de allá.
jz.secciones[0].recargos = { fin_semana: 0.50 };
eq(C.calcular(jz).costoMo, 1000, 'Juárez · ni escribiéndole un 50% se cobra de más');

const dl = conFinde('US', 'Texas', 'Dallas');
const cdl = C.calcular(dl);
es(cdl.lugar.foraneo, true, 'Dallas · es foránea: pide viaje');
es(cdl.lugar.eua, true, 'Dallas · y se ejecuta en Estados Unidos');
eq(cdl.costoMo, 1300, 'Dallas · lleva las dos cosas: viaje Y recargo');

// El motor no ensucia el documento al resolver los recargos.
const limpio = C.machoteNuevo({ nombre: 'limpio' });
limpio.pais = 'US'; limpio.region = 'Texas'; limpio.ciudad = 'Dallas';
const antesLimpio = JSON.stringify(limpio);
C.calcular(limpio);
es(JSON.stringify(limpio), antesLimpio, 'recargo · calcular NO escribe recargos en el documento');
})();

/* ── Foráneo ───────────────────────────────────────────────────────────────
 * V1.27 · LA SEDE ES EL ESTADO, no la ciudad (corrección de Montalvo). Lo que
 * decide es Nuevo León; la ciudad se captura pero no juzga. */
const NL = { pais: 'MX', region: 'Nuevo León' };
es(C.esForaneo(C.machoteNuevo({})), false, 'foráneo · la sede no lo es');
es(C.esForaneo({ pais: 'MX', region: 'NUEVO LEON  ', ciudad: 'Monterrey' }), false,
   'foráneo · ni con mayúsculas, espacios y sin acento');
es(C.esForaneo({ pais: 'MX', region: 'Nuévo León', ciudad: 'Monterrey' }), false,
   'foráneo · ni con un acento de más');

// El corazón de la corrección: otra CIUDAD del mismo estado sigue siendo local.
es(C.esForaneo(Object.assign({ ciudad: 'Santa Catarina' }, NL)), false,
   'foráneo · Santa Catarina es Nuevo León: NO lleva viáticos');
es(C.esForaneo(Object.assign({ ciudad: 'García' }, NL)), false,
   'foráneo · García tampoco');
// Y el estado de al lado sí, aunque quede cerca.
es(C.esForaneo({ pais: 'MX', region: 'Coahuila', ciudad: 'Saltillo' }), true,
   'foráneo · Saltillo es Coahuila: SÍ lleva viáticos, aunque quede cerca');
es(C.esForaneo({ pais: 'MX', region: 'Jalisco', ciudad: 'Guadalajara' }), true,
   'foráneo · Guadalajara SÍ (mover gente cuesta)');
es(C.esForaneo({ pais: 'US', region: 'Nuevo México', ciudad: 'Albuquerque' }), true,
   'foráneo · Albuquerque también');
es(C.esForaneo({ pais: 'BR', region: 'São Paulo', ciudad: 'São Paulo' }), true,
   'foráneo · Brasil también (operación nueva, V1.27)');

// Sin ESTADO no se puede juzgar: antes «MX + Saltillo» se leía como local
// porque sólo se comparaba la ciudad contra Monterrey.
es(C.esForaneo({ pais: 'MX', ciudad: 'Saltillo' }), false,
   'foráneo · sin estado NO se juzga (lo reclama su propia regla)');
es(C.tieneLugar({ pais: 'MX', ciudad: 'Saltillo' }), false,
   'lugar · sin estado el lugar está incompleto');

// ── El REVISADOR: lo que bloquea y lo que no ───────────────────────────────
// Se carga aquí abajo porque `reglas.js` necesita a `DEMO` para el cuestionario
// de diagnóstico, y `demo.js` necesita al motor. El orden importa.
require(require('path').resolve(__dirname, '..', 'js', 'demo.js'));
require(require('path').resolve(__dirname, '..', 'js', 'reglas.js'));
const R = window.MachoteReglas;
const tieneDura = (m, id) => R.revisar(m).duras.some(h => h.id === id);
const tieneBlanda = (m, id) => R.revisar(m).blandas.some(h => h.id === id);

// Un machote en la SEDE no pide nada de viaje.
const local = C.machoteNuevo({ nombre: 'local' });
es(tieneDura(local, 'viaje-sin-resolver'), false, 'regla · Nuevo León no pide nada de viaje');
es(tieneDura(local, 'sin-lugar-ejecucion'), false, 'regla · y nace CON lugar, no lo reclama');

// Otra ciudad del MISMO estado tampoco. Es la corrección de Montalvo.
const mismoEstado = C.machoteNuevo({ nombre: 'Santa Catarina' });
mismoEstado.ciudad = 'Santa Catarina';
es(tieneDura(mismoEstado, 'viaje-sin-resolver'), false,
   'regla · Santa Catarina es Nuevo León: sigue sin pedir viáticos');

/* Uno foráneo sin decidir nada: BLOQUEA.
 * V1.27 · la regla cambió de «que exista algún renglón» a «que cada uno de los
 * cinco conceptos esté decidido». Es más estricta, no menos. */
const fuera = C.machoteNuevo({ nombre: 'foráneo' });
fuera.pais = 'US'; fuera.region = 'Nuevo México'; fuera.ciudad = 'Albuquerque';
/* Con TRABAJO capturado. Una sección en blanco no exige decidir el viaje —no
 * aporta nada a la cotización y el candado sería ruido—; en cuanto hay gente
 * que mover, la exigencia es real. */
const moFuera = fuera.secciones[0].mo.find(l => l.rol === 'tecnicos');
moFuera.qty = 40; moFuera.personas = 2; moFuera.pu = 140;
es(tieneDura(fuera, 'viaje-sin-resolver'), true, 'regla · foráneo sin decidir BLOQUEA');
es(R.revisar(fuera).puedeConfirmar, false, 'regla · y por eso no se deja terminar');
eq(C.calcular(fuera).viajePorResolver, 5, 'regla · los cinco conceptos sin decidir');

/* ⚠️ LO QUE ANTES DESBLOQUEABA Y AHORA NO. Con la regla vieja bastaba UN
 * renglón de viaje: capturar el vuelo la satisfacía y el hotel olvidado pasaba
 * igual — que es exactamente lo que ocurrió con Albuquerque. */
const soloVuelo = JSON.parse(JSON.stringify(fuera));
soloVuelo.secciones[0].partidas[0].tipo = 'Viaje';
soloVuelo.secciones[0].partidas[0].qty = 2;
soloVuelo.secciones[0].partidas[0].pu = 9000;
soloVuelo.secciones[0].partidas[0].descripcion = 'Vuelos';
es(tieneDura(soloVuelo, 'viaje-sin-resolver'), true,
   'regla · SOLO el vuelo ya NO desbloquea: es el caso Albuquerque');
eq(C.calcular(soloVuelo).viajePorResolver, 4, 'regla · quedan cuatro sin decidir');

// Lo que desbloquea: decidir los cinco. Con importe, o marcando que no se ocupa.
const resuelto = JSON.parse(JSON.stringify(soloVuelo));
['Hotel', 'Viáticos', 'Taxis y traslados', 'Gasolina'].forEach((etiqueta, i) => {
  const l = resuelto.secciones[0].partidas[i + 1];
  l.tipo = 'Viaje'; l.descripcion = etiqueta; l.no_aplica = true;
});
eq(C.calcular(resuelto).viajePorResolver, 0, 'regla · los cinco decididos');
es(tieneDura(resuelto, 'viaje-sin-resolver'), false, 'regla · y ya no bloquea');
/* Lo que se afirma es que el candado DEL VIAJE se abrió, no que el machote
 * entero esté listo: sigue sin tarifas de mano de obra y sin tipo de proyecto,
 * que son otras dos reglas duras y no tienen nada que ver con esto. */
es(R.revisar(resuelto).duras.some(h => h.area === 'Viaje'), false,
   'regla · ya no queda ninguna dura de Viaje');
// Y marcar «no se ocupa» NO deja el renglón como capturado a medias: si lo
// dejara, cambiaríamos un bloqueo por otro (`partida-sin-precio`).
es(tieneDura(resuelto, 'partida-sin-precio'), false,
   'regla · un «no se ocupa» no dispara «partida sin precio»');

// Un «no se ocupa» NO es un importe: el viaje sigue costando cero.
eq(C.calcular(resuelto).costoViaje, 18000, 'regla · marcar en cero no inventa costo');

// Una sección EN BLANCO no exige nada: no hay gente que mover.
const vacioFuera = C.machoteNuevo({ nombre: 'foráneo en blanco' });
vacioFuera.pais = 'US'; vacioFuera.region = 'Nuevo México'; vacioFuera.ciudad = 'Albuquerque';
eq(C.calcular(vacioFuera).viajePorResolver, 0,
   'regla · una sección sin nada capturado no exige decidir el viaje');
es(tieneDura(vacioFuera, 'viaje-sin-resolver'), false, 'regla · y por eso no bloquea');

// O marcarlo todo de una vez. Y entonces queda DICHO, no olvidado.
const marcado = JSON.parse(JSON.stringify(fuera));
marcado.viaje.no_aplica = true;
es(tieneDura(marcado, 'viaje-sin-resolver'), false, 'regla · marcar «no se ocupan» desbloquea');
es(tieneBlanda(marcado, 'viaje-marcado-no-aplica'), true, 'regla · pero deja constancia visible');

// Un machote VIEJO, sin el campo: se le reclama el lugar, no se le supone.
const antiguo = C.machoteNuevo({ nombre: 'antiguo' });
delete antiguo.pais; delete antiguo.region; delete antiguo.ciudad;
es(tieneDura(antiguo, 'sin-lugar-ejecucion'), true, 'regla · sin lugar, lo reclama');
es(tieneDura(antiguo, 'viaje-sin-resolver'), false, 'regla · pero NO lo trata como foráneo');

// El margen sobre un renglón de viaje se dice en voz alta.
const conMargen = JSON.parse(JSON.stringify(soloVuelo));
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
