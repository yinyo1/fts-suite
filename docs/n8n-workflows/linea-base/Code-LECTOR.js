// -- Code - LECTOR de la linea base (contrato SEM v1, issue #240 / #229) -------
// La mitad que FALTABA. El escritor de al lado produce el bloque; esto lo lee de
// vuelta del chatter REAL de Odoo y calcula el delta. Hasta hoy este camino no
// se habia ejercido NUNCA.
//
// LOS TRES ESTADOS, y por que son tres y no dos:
//
//   con_linea_base  hay bloque dentro de la ventana -> se puede decir QUE CAMBIO.
//   nuevo           hay linea base del CONJUNTO y este proyecto no estaba en
//                   ella -> entro a la lista. Es un cambio CONOCIDO.
//   sin_linea_base  no hay bloque para este proyecto dentro de la ventana -> del
//                   pasado no se puede afirmar nada; solo en que estado esta HOY.
//
// EL CODIGO DE HOY SOLO TIENE DOS, y ahi esta el bug que esto arregla. En
// `Code - buildEmail`: `if (p === undefined) NUEVO.push(r);`. O sea que «no tengo
// con que comparar» se reporta como «entro hoy». Son dos afirmaciones distintas:
// «nuevo» es una NOTICIA -entro a la lista-; «sin linea base» es una AUSENCIA DE
// MEDICION, y presentarla como noticia es inventar un cambio que nadie hizo.
// Por eso `sin_linea_base` NO viaja como renglon de trabajo sino como SALVEDAD
// del numero (`SIN_LINEA_BASE` del contrato de #237): es una advertencia sobre
// lo que el numero no cubre.
//
// EL ARRANQUE. El primer dia NINGUN proyecto tiene bloque, porque nadie lo ha
// escrito nunca -hay notas en el chatter desde el 11-sep, pero son prosa-. Sin
// una regla explicita el correo saldria con ~36 renglones diciendo «sin linea
// base», que es ruido puro y ademas entrena al equipo a ignorar la seccion. La
// regla, copiada del precedente que ya corre en produccion (`fin/watchdog-captura`
// hace `avisos.push('primera corrida: no hay CBWATCH previo')`): si NINGUN
// proyecto tiene linea base, el conjunto esta SEMBRANDO, y eso se dice UNA vez,
// en una frase, sin listar proyectos. La seccion de delta no se imprime, y
// `nuevo` no existe -no se puede saber quien es nuevo sin saber quien estaba-.

const ABRE = '[[SEM]]';
const CIERRA = '[[/SEM]]';

// --- guarda de vacio, la misma del motor -------------------------------------
// Un search vacio con alwaysOutputData devuelve [{}] y es indistinguible de uno
// exitoso. Cada nodo declara la llave que TODA fila legitima suya trae.
const diag = [];
function rowsOf(nodo, llave, critico){
  let all = [];
  try { all = $(nodo).all(); }
  catch(e){ diag.push({ nodo:nodo, problema:'no se pudo leer el nodo',
                        detalle:String(e.message).slice(0,120), critico:!!critico });
            return []; }
  const out = [];
  for (const it of all) {
    const j = it.json;
    if (j && typeof j === 'object' && j[llave] !== undefined) out.push(j);
  }
  if (!out.length) diag.push({ nodo:nodo,
    problema:'devolvio 0 filas utilizables (llave "'+llave+'" ausente)',
    items_crudos: all.length, critico: !!critico });
  return out;
}

// --- el parser ---------------------------------------------------------------
// Recibe el cuerpo tal cual viene de Odoo (HTML). Devuelve null si no hay bloque
// legible, que es una respuesta LEGITIMA -la nota es vieja y es solo prosa-, no
// un error. El corte usa `ABRE.length` y no un numero escrito a mano: el lector
// del CBWATCH tiene un `slice(a+11, b)` y ese 11 es una bomba para el dia que la
// marca cambie de largo.
function leerBloque(bodyHtml){
  const s = String(bodyHtml == null ? '' : bodyHtml)
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, ' ');
  const a = s.indexOf(ABRE);
  if (a < 0) return null;
  const b = s.indexOf(CIERRA, a);
  if (b < 0) return null;
  let j = null;
  try { j = JSON.parse(s.slice(a + ABRE.length, b)); } catch(e) { return null; }
  if (!j || typeof j !== 'object') return null;
  // Tolerancia de version: se acepta lo que se sepa leer y se DICE cual es. Sin
  // esto, el dia que el contrato cambie el lector pierde la referencia entera en
  // vez de degradarse.
  return {
    v: Number(j.v || 1),
    fecha: j.f || null,
    color_a: j.a || null,
    color_a_rep: j.ar || j.a || null,
    color_b: j.b || null,
    dias_en_stage: (j.da === undefined ? null : j.da),
    dias_sin_seguimiento: (j.db === undefined ? null : j.db),
    tramo_a: j.ta || null,
    sin_avance: !!j.sa,
    racha_nota: Number(j.rn || 0),
    banderas: Array.isArray(j.g) ? j.g : []
  };
}

// La MISMA firma que compara el correo hoy (`firmaDe` de Code - buildEmail):
// color_a_rep | tramo_a | sin_avance. Si el bloque no reprodujera estos tres, el
// delta calculado aqui no seria el mismo que el que el equipo viene recibiendo.
function firmaDe(r){ return (r.color_a_rep || r.color_a) + '|' + r.tramo_a + '|' + (r.sin_avance ? 'sa' : '-'); }
function firmaBase(b){ return (b.color_a_rep || b.color_a) + '|' + b.tramo_a + '|' + (b.sin_avance ? 'sa' : '-'); }

// --- 1. el lado REAL: las notas del watchdog que hay en Odoo hoy -------------
const P     = $('Code - prep').first().json;
const NOTAS = rowsOf('Odoo - getAll notas watchdog', 'res_id', false);
const FILAS = [];
for (const it of $('Code - ESCRITOR').all()) {
  if (it.json && it.json.id !== undefined) FILAS.push(it.json);
}

// La ultima nota CON BLOQUE por proyecto, que no es lo mismo que la ultima nota:
// mientras convivan notas viejas de prosa y notas nuevas con bloque, quedarse
// con «la ultima» daria null justo en los proyectos mas activos.
const base = {};
let notasConBloque = 0, notasSoloProsa = 0;
for (const n of NOTAS) {
  const b = leerBloque(n.body);
  if (!b) { notasSoloProsa++; continue; }
  notasConBloque++;
  const prev = base[n.res_id];
  if (!prev || new Date(n.date) > new Date(prev._date)) { b._date = n.date; base[n.res_id] = b; }
}

const arranque = Object.keys(base).length === 0;

// --- 2. clasificar cada proyecto --------------------------------------------
function cambios(hoyFila, b){
  const c = [];
  const ah = hoyFila.color_a_rep || hoyFila.color_a;
  const an = b.color_a_rep || b.color_a;
  if (an && ah !== an) c.push({ que:'color_a_rep', de:an, a:ah });
  if (b.color_b && hoyFila.color_b !== b.color_b) c.push({ que:'color_b', de:b.color_b, a:hoyFila.color_b });
  // El contador se compara por TRAMO y no por dia: de lo contrario todo renglon
  // «cambia» cada 24 h y el delta deja de significar nada.
  if (b.tramo_a && hoyFila.tramo_a !== b.tramo_a) c.push({ que:'tramo_a', de:b.tramo_a, a:hoyFila.tramo_a });
  if (!!hoyFila.sin_avance !== !!b.sin_avance) c.push({ que:'sin_avance', de:!!b.sin_avance, a:!!hoyFila.sin_avance });
  const antes = b.banderas || [];
  for (const f of (hoyFila.banderas || [])) {
    if (antes.indexOf(f.tipo) < 0) c.push({ que:'bandera_nueva', a:f.tipo });
  }
  return c;
}

const salida = [], sinBase = [], nuevos = [];
let conBase = 0;
for (const f of FILAS) {
  const b = base[f.id];
  let estado, delta = null;
  if (b) {
    estado = 'con_linea_base';
    conBase++;
    delta = { desde:b.fecha, firma_antes:firmaBase(b), firma_hoy:firmaDe(f), cambios:cambios(f, b) };
  } else if (arranque) {
    // Sin ninguna linea base del conjunto no se puede saber quien es nuevo.
    estado = 'sin_linea_base';
    sinBase.push(f.id);
  } else {
    estado = 'nuevo';
    nuevos.push(f.id);
  }
  salida.push({ id:f.id, name:f.name, stage:f.stage, color_a:f.color_a,
                color_a_rep:f.color_a_rep || f.color_a, color_b:f.color_b,
                tramo_a:f.tramo_a, sin_avance:!!f.sin_avance,
                estado_linea_base:estado, delta:delta });
}

// --- 3. las salvedades, en la forma del contrato de #237 --------------------
const salvedades = [];
if (arranque) {
  // UNA frase, sin listar proyectos. Es la regla del arranque.
  salvedades.push({ codigo:'SIN_LINEA_BASE',
    dice:'Primera corrida de la serie: todavia no hay ninguna nota con bloque en el ' +
         'chatter, asi que de hoy solo se puede decir en que estado esta cada proyecto, ' +
         'no que cambio. El delta queda disponible desde la siguiente corrida.',
    filas: [] });
} else if (sinBase.length) {
  salvedades.push({ codigo:'SIN_LINEA_BASE',
    dice: sinBase.length + ' proyecto(s) no traen nota con bloque en la ventana de ' +
          P.dias_ventana + ' dias: de esos NO se puede decir si empeoraron o mejoraron, ' +
          'solo en que estado estan hoy.',
    filas: sinBase });
}

// --- 4. AUTO-COMPROBACION del contrato --------------------------------------
// El camino del lector nunca se habia ejercido, y hoy en Odoo NO existe ni un
// bloque, asi que leer 0 bloques se ve IGUAL que un parser roto (§20 #11: un []
// no prueba que la consulta sirva). Estas comprobaciones separan las dos cosas
// sin escribir una sola linea a Odoo:
//
//   A. IDA Y VUELTA. El cuerpo que produjo el escritor en esta misma corrida,
//      con proyectos REALES, se pasa por el parser y se exige que la FIRMA
//      reconstruida sea identica a la de la fila. Prueba el contrato completo.
//   B. NOTAS REALES. Cuantas notas del watchdog trajo Odoo. Si son > 0, la
//      consulta sirve; si ademas ninguna trae bloque, es que nadie lo ha escrito
//      todavia -o sea el arranque-, y no que el lector falle.
const rt = { probados:0, ok:0, fallos:[] };
for (const f of FILAS) {
  if (!f._body) continue;
  rt.probados++;
  const b = leerBloque(f._body);          // el cuerpo HTML entero, como lo daria Odoo
  if (b && firmaBase(b) === firmaDe(f) &&
      b.dias_en_stage === (f.dias_en_stage == null ? null : f.dias_en_stage) &&
      b.banderas.length === (f.banderas || []).length) {
    rt.ok++;
  } else {
    rt.fallos.push({ id:f.id, esperada:firmaDe(f), leida:b ? firmaBase(b) : null });
  }
}
if (rt.probados && rt.ok !== rt.probados) {
  diag.push({ nodo:'Code - LECTOR',
    problema:'la ida y vuelta del bloque fallo en ' + (rt.probados - rt.ok) + ' de ' + rt.probados,
    critico:true });
}
if (!NOTAS.length) {
  diag.push({ nodo:'Odoo - getAll notas watchdog',
    problema:'cero notas del watchdog en la ventana: la consulta NO quedo probada contra ' +
             'una fila que deba salir, asi que este 0 no distingue "no hay" de "no sirve"',
    critico:true });
}

return [{ json: {
  ok: true,
  contrato: 1,
  marca: ABRE,
  medido: P.hoy,
  ventana_dias: P.dias_ventana,
  arranque: arranque,
  resumen: {
    proyectos: FILAS.length,
    con_linea_base: conBase,
    nuevos: nuevos.length,
    sin_linea_base: sinBase.length,
    notas_watchdog_en_ventana: NOTAS.length,
    notas_con_bloque: notasConBloque,
    notas_solo_prosa: notasSoloProsa
  },
  ida_y_vuelta: rt,
  salvedades: salvedades,
  proyectos: salida,
  _diag: diag
} }];
