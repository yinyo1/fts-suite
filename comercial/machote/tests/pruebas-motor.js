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
require(require('path').resolve(__dirname, '..', 'js', 'pad-hoja.js'));
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


/* ══ V1.40 · LOS DOS PORCENTAJES DE COMISIÓN, POR SECCIÓN ══════════════════
 *
 * Lo que se pidió, y lo que la V1.34 había entendido al revés: «comisión de
 * FTS» y «comisión de cliente» —los dos campos que la gente ya toca, en la
 * columna de margen de utilidad— tienen que ser DE LA SECCIÓN. Hasta la V1.39
 * cambiar uno en una sección lo cambiaba en todas, en silencio.
 *
 * Lo que se ejercita, que es lo que puede salir mal:
 *   1. Sin desvíos, TODO número es idéntico al de antes. No parecido:
 *      idéntico, hasta el último bit. Es lo que sostiene a los 45 machotes
 *      ya capturados — y lo que garantiza el atajo de `calcular`.
 *   2. Cambiar la comisión de la sección 1 NO mueve la de la sección 2.
 *      Éste es literalmente el defecto que se reportó.
 *   3. `0` y «vacío» son cosas distintas: cero es «esta sección no paga» y
 *      ausente es «la del machote». Si se confundieran, quien quiera poner
 *      cero acabaría heredando el 5.5% sin enterarse.
 *   4. El total sube o baja lo que debe: la sección desviada carga SU
 *      comisión, no una parte a prorrata.
 */
(function () {
  const base = () => {
    const m = C.machoteNuevo({ nombre: 'ZZ comisiones', empresa_id: 1 });
    m.secciones = [C.seccionNueva('A', 'MXN'), C.seccionNueva('B', 'MXN')];
    // Dos secciones con costo, para que los pesos no sean triviales.
    m.secciones[0].mo[0].qty = 100; m.secciones[0].mo[0].pu = 100;
    m.secciones[1].mo[0].qty = 300; m.secciones[1].mo[0].pu = 100;
    m.comision_fts = 0.055; m.comision_cliente = 0.02;
    return m;
  };

  // ── 1 · sin desvíos: el MISMO camino, no uno equivalente ────────────────
  const sin = base();
  const cSin = C.calcular(sin);
  const aMano = (() => {
    const venta = cSin.venta;
    const cf = venta * 0.055;
    const cc = (venta + cf) * 0.02;
    return { cf, cc, precio: venta + cf + cc };
  })();
  es(cSin.escenarios.con_utilidad.comisionFts === aMano.cf, true,
     'comisiones · sin desvíos, la de FTS es EXACTAMENTE la de antes (mismo bit)');
  es(cSin.escenarios.con_utilidad.comisionCliente === aMano.cc, true,
     'comisiones · sin desvíos, la de cliente es EXACTAMENTE la de antes');
  es(cSin.escenarios.con_utilidad.precio === aMano.precio, true,
     'comisiones · sin desvíos, el precio es EXACTAMENTE el de antes');
  es(cSin.secciones[0].comisionesApartadas, 0, 'comisiones · sin desvíos no marca ninguna');

  // ── 2 · cambiar la de UNA sección NO mueve la otra ──────────────────────
  //     Es el defecto reportado, y va por los dos campos.
  const uno = base();
  uno.secciones[0].comision_fts = 0.10;
  const cUno = C.calcular(uno);
  eq(cUno.secciones[1].comFts, cSin.secciones[1].comFts,
     'comisiones · cambiar la de FTS en la sección 1 NO mueve la de la 2', 0.0001);
  es(cUno.secciones[0].comFts > cSin.secciones[0].comFts, true,
     'comisiones · cambiar la de FTS en la sección 1 SÍ mueve la suya');
  es(cUno.secciones[0].comisiones.fts.origen, 'seccion',
     'comisiones · la sección dice que el número es suyo');
  es(cUno.secciones[1].comisiones.fts.origen, 'machote',
     'comisiones · la que no se tocó sigue diciendo que es del machote');

  const dos = base();
  dos.secciones[0].comision_cliente = 0.09;
  const cDos = C.calcular(dos);
  eq(cDos.secciones[1].comCli, cSin.secciones[1].comCli,
     'comisiones · cambiar la de CLIENTE en la sección 1 NO mueve la de la 2', 0.0001);
  es(cDos.secciones[0].comCli > cSin.secciones[0].comCli, true,
     'comisiones · cambiar la de CLIENTE en la sección 1 SÍ mueve la suya');

  // ── 3 · cero NO es vacío ────────────────────────────────────────────────
  const cero = base();
  cero.secciones[0].comision_fts = 0;
  const cCero = C.calcular(cero);
  es(cCero.secciones[0].comFts, 0, 'comisiones · cero en la sección significa CERO');
  es(cCero.secciones[0].comisiones.fts.apartado, true,
     'comisiones · poner cero cuenta como apartarse del machote');
  eq(cCero.secciones[1].comFts, cSin.secciones[1].comFts,
     'comisiones · el cero de una sección no toca a la otra', 0.0001);

  const vacia = base();
  vacia.secciones[0].comision_fts = '';      // vacío = la del machote
  const cVacia = C.calcular(vacia);
  eq(cVacia.secciones[0].comFts, cSin.secciones[0].comFts,
     'comisiones · vacío hereda la del machote, no cero', 0.0001);
  es(cVacia.secciones[0].comisiones.fts.apartado, false,
     'comisiones · heredar no es apartarse');

  // ── 4 · el total se mueve lo que debe, y sólo por la sección que cambió ──
  const subeSolo = cUno.escenarios.con_utilidad.comisionFts - cSin.escenarios.con_utilidad.comisionFts;
  const esperado = cSin.secciones[0].venta * (0.10 - 0.055);
  eq(subeSolo, esperado,
     'comisiones · el total sube exactamente lo que causó la sección 1', 0.0001);

  // ── 5 · un machote de ANTES —sin ningún campo en la sección— no cambia ──
  //     La capa vieja es la ausencia: es lo que tienen los 45 reales.
  const viejo = base();
  delete viejo.secciones[0].comision_fts;
  delete viejo.secciones[0].comision_cliente;
  es(C.calcular(viejo).escenarios.con_utilidad.precio === cSin.escenarios.con_utilidad.precio, true,
     'comisiones · un machote sin los campos nuevos da EXACTAMENTE el mismo precio');
})();

/* ══ V1.41 · EL EVALUADOR DE LA HOJA DEL PAD ══════════════════════════════
 *
 * Es el trozo con más filo de la sesión: un parser escrito a mano que corre
 * texto de un usuario. Se ejercita aquí y no sólo en el navegador porque es
 * JavaScript puro y porque estos casos tienen que correr en un segundo cada
 * vez que alguien lo toque.
 *
 * ⚠️ El caso 1 es EL de Montalvo: lo que hoy escribe a mano en el pad de
 * texto (`3 tramos × 12 m × $450/m + 8 soportes × $1,200 = 25,800`), tecleado
 * como lo teclearía en la rejilla. Si eso no da 25,800 exactos, la hoja no
 * sirve por más que el resto pase.
 */
(function () {
  const PH = window.PadHoja;
  const ev = (h) => PH.evaluar(h);

  // 1 · el caso real
  const real = ev([['Tramos','3','12','=A1*B1*450'],
                   ['Soportes','8','1200','=A2*B2'],
                   ['Total','','','=SUMA(C1:C2)']]);
  es(real.valores.C1, 16200, 'hoja · 3 × 12 × 450 = 16,200');
  es(real.valores.C2, 9600,  'hoja · 8 × 1,200 = 9,600');
  es(real.valores.C3, 25800, 'hoja · SUMA de la columna = 25,800');
  es(Object.keys(real.errores).length, 0, 'hoja · el caso real no da ningún error');

  // 2 · aritmética
  es(ev([['','','','=2+3*4']]).valores.C1, 14, 'hoja · precedencia: 2+3*4 = 14');
  es(ev([['','','','=(2+3)*4']]).valores.C1, 20, 'hoja · paréntesis: (2+3)*4 = 20');
  es(ev([['','','','=-5+2']]).valores.C1, -3, 'hoja · menos unario');
  es(ev([['','','','=10/4']]).valores.C1, 2.5, 'hoja · división');

  // 3 · los errores NO se convierten en números, que es lo peligroso
  es(ev([['','','','=1/0']]).errores.C1, 'DIV0', 'hoja · dividir entre cero se marca');
  es(ev([['','','','=2+']]).errores.C1, 'SINTAXIS', 'hoja · fórmula a medias se marca');
  es(ev([['','','','=Z9+1']]).errores.C1, 'REF', 'hoja · referencia fuera de la rejilla se marca');

  // 4 · ciclos, y que NO cuelguen
  es(ev([['','=A1','','']]).errores.A1, 'CICLO', 'hoja · una celda que se cita a sí misma');
  const ind = ev([['','=B1','=C1','=A1']]);
  es(ind.errores.A1 === 'CICLO' && ind.errores.B1 === 'CICLO' && ind.errores.C1 === 'CICLO', true,
     'hoja · en un ciclo indirecto se marcan LAS TRES, no sólo donde se detectó');
  es(ind.valores.A1, null, 'hoja · una celda en ciclo no enseña un cero con confianza');

  // 5 · un error se PROPAGA a quien lo usa
  const prop = ev([['','=1/0','=A1+5','']]);
  es(prop.errores.B1, 'REF', 'hoja · quien suma una celda rota queda marcado, no da 5');
  es(prop.valores.B1, null, 'hoja · y no enseña número');

  // 6 · lo que la gente teclea de verdad
  es(ev([['','$1,200','2','=A1*B1']]).valores.C1, 2400, 'hoja · acepta $ y comas de millares');
  es(ev([['','hola','5','=A1+B1']]).valores.C1, 5, 'hoja · el texto vale cero, no rompe');
  es(ev([['','1','2','=SUMA(A1,B1)']]).valores.C1, 3, 'hoja · SUMA con lista de celdas');
  es(ev([['','1','2',''],['','3','4','=SUMA(A1:B2)']]).valores.C2, 10, 'hoja · SUMA de un rango 2D');

  // 7 · la migración del pad de texto, que es trabajo de alguien
  const mig = PH.hojaDe({ pad: { texto: 'primera\nsegunda' } });
  es(mig.length, 2, 'hoja · un pad de texto viejo migra a filas');
  es(mig[0][0], 'primera', 'hoja · el texto viejo cae en la columna de CONCEPTO');
  es(PH.hojaDe({ pad: { hoja: [['x','','','']], texto: 'viejo' } })[0][0], 'x',
     'hoja · si ya hay rejilla, el texto viejo no la pisa');

  // 8 · defensivo: una hoja mal formada no puede tirar la sección
  es(PH.normalizar(null).length, 0, 'hoja · null no revienta');
  es(PH.normalizar([null, 'x', [1,2,3,4,5]]).length, 3, 'hoja · filas basura se normalizan');
  es(PH.evaluar([['','=SUMA(A1:C10)','','']]).errores.A1, 'CICLO',
     'hoja · un rango que se incluye a sí mismo es un ciclo, no un cuelgue');
  /* V1.42 · con el tope en 10 filas, `C20` dejó de ser una dirección. Antes
   * esta misma prueba usaba `A1:C20` y esperaba CICLO; hoy da REF, que es
   * correcto y sigue siendo ruidoso. Se cambió la prueba, no el motor. */
  es(PH.evaluar([['','=SUMA(A1:C20)','','']]).errores.A1, 'REF',
     'hoja · un rango fuera de la rejilla es REF, no un número inventado');

  // 9 · el tope de filas se respeta
  const muchas = []; for (let i = 0; i < 60; i++) muchas.push(['x','','','']);
  es(PH.normalizar(muchas).length, PH.MAX_FILAS, 'hoja · no se pasa del tope de filas');

  /* ══ V1.42 · LAS CUATRO PALABRAS EN ESPAÑOL ════════════════════════════
   *
   * Con acento y sin él, en mayúsculas, minúsculas y mezcladas. Nadie va a
   * acordarse de si el acento cuenta, y una fórmula rechazada por una tilde
   * es de las cosas que hacen que la gente abandone la herramienta y vuelva
   * al Excel — que es exactamente de donde la estamos trayendo.
   *
   * Las cuatro comparten un mismo camino: se juntan los valores y se pliegan
   * con un operador. Por eso se prueban las cuatro, no una de muestra: la
   * que se rompería sola es la que tiene el operador distinto. */
  const base = [['Tramos','3','12','=A1*B1*450'], ['Soportes','8','1200','=A2*B2']];
  const conF = (f) => ev([base[0], base[1], ['t', f, '', '']]);
  const val  = (f) => { const r = conF(f); return r.errores.A3 ? ('#' + r.errores.A3) : r.valores.A3; };

  es(val('=SUMA(C1:C2)'),            25800, 'palabras · SUMA de un rango');
  es(val('=suma(C1:C2)'),            25800, 'palabras · suma en minúsculas');
  es(val('=Suma(C1:C2)'),            25800, 'palabras · Suma mezclada');
  es(val('=MULTIPLICACION(A1,B1)'),     36, 'palabras · MULTIPLICACION sin acento');
  es(val('=MULTIPLICACIÓN(A1,B1)'),     36, 'palabras · MULTIPLICACIÓN con acento');
  es(val('=multiplicación(A1,B1)'),     36, 'palabras · multiplicación minúscula y con acento');
  es(val('=RESTA(C1,C2)'),            6600, 'palabras · RESTA se pliega desde el primero');
  es(val('=DIVISION(C1,A1)'),         5400, 'palabras · DIVISION sin acento');
  es(val('=división(C1,A1)'),         5400, 'palabras · división con acento y minúscula');
  es(val('=DIVISION(C1,0)'),       '#DIV0', 'palabras · dividir entre cero falla RUIDOSO');

  /* Los signos NO dejaron de servir por agregar las palabras: es la mitad
   * que se rompe callada al tocar el tokenizador. */
  es(ev(base).valores.C1, 16200, 'palabras · los signos siguen sirviendo (C1)');
  es(ev(base).valores.C2,  9600, 'palabras · los signos siguen sirviendo (C2)');
  es(val('=SUMA(C1:C2)*2'),          51600, 'palabras · una palabra dentro de una expresión');

  /* Un argumento puede ser una expresión, no sólo una celda. Es lo primero
   * que alguien escribe viniendo de Excel, y aceptar sólo rangos lo rompía. */
  es(val('=SUMA(C1:C2, 500)'),       26300, 'palabras · rango MÁS un número suelto');
  es(val('=SUMA(A1*2, 4)'),             10, 'palabras · un argumento que es una cuenta');

  /* Y lo que NO es una de las cuatro sigue fallando, que es lo que evita que
   * `=PROMEDIO(A1:A9)` devuelva un número inventado. */
  es(val('=PROMEDIO(A1,B1)'),       '#REF', 'palabras · una palabra que no existe NO se inventa');
  es(val('=suma()'),            '#SINTAXIS', 'palabras · una palabra vacía no vale cero callado');

  // 10 · la rejilla es de 10 × 10
  es(PH.COLS.length, 10, 'hoja · diez columnas');
  es(PH.COLS[9], 'J', 'hoja · la última columna es J');
  es(PH.MAX_FILAS, 10, 'hoja · diez filas');
  es(ev([['','1','','','','','','','','','=J1+A1'].slice(0,11)]).valores.J1, null,
     'hoja · J1 existe y vale vacío');
  es(PH.dir('J10') && PH.dir('J10').col, 9, 'hoja · J10 es una dirección válida');
  es(PH.dir('K1'), null, 'hoja · K1 NO es una dirección');
  es(PH.dir('A11'), null, 'hoja · A11 NO es una dirección');
})();

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron.');
process.exit(mal ? 1 : 0);
