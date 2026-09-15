/* ── ops/semaforo · armar la respuesta ─────────────────────────────────────
 * El motor (ops/semaforo-motor) ya midio todo: colores, contadores, banderas.
 * Aqui se hacen SOLO las cosas que el motor no puede hacer:
 *   1. poner el `actor` (quien pregunto y con que permisos) — el motor no vio el token
 *   2. derivar lo que es de ESTE panel: dias vencido, no_puede_esperar, pide_algo
 *   3. declarar las columnas (el contrato de tabla de #237)
 *   4. decir en SALVEDADES lo que este tablero NO dice
 *
 * SOLO LECTURA. No escribe a Odoo, no commitea nada, no guarda snapshots.
 *
 * LOS UMBRALES DE `no_puede_esperar` VIVEN AQUI, NO EN EL NAVEGADOR, y son los
 * MISMOS que la seccion del correo del watchdog (parche S4): rojo Y (vencido
 * >45d O >90d en la etapa). Dos pantallas que dicen "urgente" de dos cosas
 * distintas es peor que no tener la seccion — por eso el numero lo decide el
 * servidor y el panel solo lo pinta.
 */
const A1_VENCIDO_DIAS = 45;
const A1_ETAPA_DIAS   = 90;

let filas;
try { filas = $input.all().map(i => i.json); } catch (e) { filas = []; }

// El motor devuelve una sola fila `_solo_diag` cuando no pudo medir nada. Eso NO
// es "cero proyectos": es un fallo, y se contesta como fallo en vez de como una
// lista vacia tranquilizadora (§20 #11: un [] no prueba que la consulta sirva).
const soloDiag = filas.length === 1 && filas[0] && filas[0]._solo_diag;
if (soloDiag || !filas.length) {
  const d = (filas[0] && filas[0]._diag) || [];
  return [{ json: { ok:false, panel:'semaforo', error:'MOTOR_SIN_FILAS', clase:'servidor',
    mensaje:'El motor no devolvio proyectos utilizables.',
    detalle: d.map(x => x.nodo + ': ' + x.problema).join(' | ').slice(0,300) } }];
}

const diag = (filas[0] && filas[0]._diag) ? filas[0]._diag : [];

let v;
try { v = $('Code - Verificar token').first().json; } catch (e) { v = {}; }

let hoy;
try { hoy = String($('Code - Verificar token').first().json.hoy || '').slice(0,10); } catch (e) { hoy = ''; }
if (!hoy) hoy = new Date(Date.now() - 6*3600000).toISOString().slice(0,10);  // CST = UTC-6

function diasVencido(r){
  if (!r.project_date) return null;
  const t = Date.parse(String(r.project_date).slice(0,10) + 'T00:00:00Z');
  if (isNaN(t)) return null;
  return Math.floor((Date.parse(hoy + 'T00:00:00Z') - t) / 86400000);
}
// Mismo criterio que `enLista` del correo: que tiene que pedir algo un proyecto.
const pideAlgo = r => r.color_a_rep !== 'verde' || r.sin_avance || (r.banderas||[]).length > 0;

let porEdad = 0;
const out = filas.map(function (r) {
  const ven = diasVencido(r);
  if (r.fuente_a === 'create_date') porEdad++;
  return {
    id: r.id,
    proyecto: r.name,
    cliente: r.cliente,
    stage: r.stage,
    grupo: r.grupo,
    color_etapa: r.color_a_rep,
    color_seguimiento: r.color_b,
    dias_en_stage: (r.dias_en_stage === undefined ? null : r.dias_en_stage),
    // LA FUENTE VIAJA CON EL CONTADOR. Un numero grande con fuente `create_date`
    // no es un atoron: es la EDAD del proyecto, porque nunca cambio de etapa.
    // Mandar el numero sin la fuente es mandar un dato que miente (#229).
    fuente_contador: r.fuente_a,
    dias_sin_seguimiento: (r.dias_sin_seguimiento === undefined ? null : r.dias_sin_seguimiento),
    compromiso: r.project_date ? String(r.project_date).slice(0,10) : null,
    dias_vencido: ven,
    no_puede_esperar: r.color_a_rep === 'rojo' &&
      ((ven !== null && ven > A1_VENCIDO_DIAS) || ((r.dias_en_stage||0) > A1_ETAPA_DIAS)),
    pide_algo: pideAlgo(r),
    racha_nota: r.racha_nota || 0,
    sin_avance: !!r.sin_avance,
    banderas: r.banderas || [],
    // TERCER ESTADO, y hoy siempre el mismo por una razon que se DICE en las
    // salvedades: este endpoint todavia no lee el bloque marcado. El codigo de
    // la salvedad es LINEA_BASE_NO_LEIDA y no SIN_LINEA_BASE a proposito — dice
    // que el panel no mira, no que no exista. Si algun dia existiera y el codigo
    // dijera "no hay", seria una mentira que envejece sola.
    linea_base: 'sin_linea_base',
    linea_base_dice: 'Este panel todavia no lee el bloque marcado [[SEM]] del chatter.',
    link_odoo: r.link_odoo
  };
});

const c = x => out.filter(f => f.color_etapa === x).length;
const verde = c('verde');

const salvedades = [
  { codigo:'LINEA_BASE_NO_LEIDA',
    dice:'La columna "linea base" dice SIN LINEA BASE en los ' + out.length + ' renglones porque este endpoint ' +
         'todavia no lee el bloque marcado [[SEM]] del chatter — no porque se haya comprobado que no existe. ' +
         'Hasta que ops/semaforo-linea-base pase a produccion, este tablero dice EN QUE ESTADO esta cada ' +
         'proyecto hoy, pero no QUE CAMBIO. "No tengo con que comparar" no es "entro hoy".' },
  { codigo:'SEGUIMIENTO_NO_MANDA',
    dice:'El semaforo de falta de seguimiento se muestra en su columna pero NO decide el color del renglon: ' +
         'su verde exige una nota escrita hoy, asi que es inalcanzable por construccion. Llevaba 11 corridas ' +
         'en 0% verde cuando se retiro del reporte (#220). Se sigue calculando.' },
  { codigo:'FOTO_DE_HOY',
    dice:'El % en tiempo es la foto de HOY sobre los ' + out.length + ' vigilados (' + verde + ' verdes), ' +
         'no un promedio de la semana. Se imprime con su denominador a proposito: un porcentaje sin decir ' +
         'de que universo sale no se puede cuadrar contra el encabezado.' }
];
if (porEdad) salvedades.push({ codigo:'CONTADOR_POR_EDAD',
  dice: porEdad + ' de ' + out.length + ' proyectos miden los dias desde create_date porque nunca han ' +
        'cambiado de etapa. Ese numero es la EDAD del proyecto, no su tiempo en la etapa, y la celda lo ' +
        'dice. Salen de la lista en cuanto alguien los mueva de etapa. Causa raiz en #229.' });
// Los diagnosticos del motor son del REPORTE, no de los proyectos, y por eso van
// como salvedad y no como renglon: una falla de medicion no es un proyecto atrasado.
//
// SE PASAN TAL CUAL, CON SU LIMITACION DICHA. Las guardas del motor no distinguen
// "vino vacio porque fallo" de "vino vacio porque hoy no habia nada" en 6 de sus 9
// lecturas, y dos de esas seis estan encadenadas a otra por el centinela [0], asi
// que una condicion normal levanta dos avisos. Medido y documentado en
// docs/watchdogs/GUARDAS-AMBIGUAS.md. Filtrarlas AQUI seria tapar el sintoma en un
// consumidor mas -el correo ya lo hace para una de ellas- en vez de arreglarlas en
// `rowsOf`, que es donde estan; y esconderlas dejaria sin voz a la que si es un
// fallo real. Se muestran, y el texto dice que pueden ser falsas alarmas.
for (const d of diag) salvedades.push({ codigo: d.critico ? 'MEDICION_CRITICA' : 'MEDICION',
  dice: d.nodo + ': ' + d.problema +
        ' — OJO: la guarda del motor no distingue "fallo la lectura" de "hoy no habia nada que leer" ' +
        'en 6 de sus 9 lecturas, asi que esto puede ser una falsa alarma. Ver docs/watchdogs/GUARDAS-AMBIGUAS.md.' });

return [{ json: {
  ok: true,
  panel: 'semaforo',
  contrato: 1,
  actor: { nombre: v.actor || null, scopes: v.scopes || [] },
  salvedades: salvedades,
  datos: {
    resumen: {
      total: out.length,
      rojo: c('rojo'), amarillo: c('amarillo'), verde: verde,
      no_puede_esperar: out.filter(f => f.no_puede_esperar).length,
      pide_algo: out.filter(f => f.pide_algo).length,
      en_tiempo_pct: out.length ? Math.round(verde / out.length * 100) : null
    },
    columnas: [
      { id:'proyecto',             label:'Proyecto',         kind:'texto' },
      { id:'cliente',              label:'Cliente',          kind:'texto',  agrupable:true },
      { id:'stage',                label:'Etapa',            kind:'texto',  agrupable:true },
      { id:'grupo',                label:'Grupo',            kind:'texto',  agrupable:true },
      { id:'color_etapa',          label:'Retraso etapa',    kind:'texto',  agrupable:true },
      { id:'dias_en_stage',        label:'Dias en la etapa', kind:'numero' },
      { id:'compromiso',           label:'Compromiso',       kind:'texto' },
      { id:'dias_vencido',         label:'Dias vencido',     kind:'numero' },
      { id:'color_seguimiento',    label:'Seguimiento',      kind:'texto',  agrupable:true },
      { id:'dias_sin_seguimiento', label:'Dias sin nota',    kind:'numero' },
      { id:'linea_base',           label:'Linea base',       kind:'texto',  agrupable:true },
      { id:'banderas',             label:'Banderas',         kind:'texto' }
    ],
    // NINGUNA columna lleva `suma`: sumar dias no significa nada. La regla 2 del
    // armazon (un subtotal solo suma lo declarado sumable) deja los subtotales
    // vacios por si sola, sin que el panel tenga que evitarlos.
    filas: out
  },
  _meta: { fecha: hoy, total: out.length, por_edad: porEdad,
           fuente: 'ops/semaforo-motor RtP77DIATk4nogR5 · solo lectura' }
} }];
