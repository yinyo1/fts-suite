// ═══ Nómina · Incidencias — el archivo para el despacho ═══
//
// Convierte la semana capturada en UN RENGLÓN POR PERSONA con la instrucción de qué
// hacerle a cada quien. Es el formato que Magaly le manda a Ulises para que capture
// la nómina en CONTPAQi, y que hasta V1.08 se mandaba por WhatsApp en texto libre.
//
// PURO: sin DOM, sin red, sin `window`. Se carga igual en el navegador que en node,
// por eso el doble export del final. Lo que este archivo produce mueve dinero, así
// que tiene que poder probarse en milisegundos y de forma exhaustiva.
//
// POR QUÉ UN RENGLÓN POR PERSONA Y NO UNO POR CONCEPTO. Ulises captura persona por
// persona: abre la ficha de alguien y mete sus números. Un archivo por concepto lo
// obligaría a saltar entre renglones para armar a una sola persona, que es justo
// donde se pierde una incidencia. El renglón es la unidad de captura.

(function (root, factory) {
  var Cat = (typeof module === 'object' && module.exports) ? require('./catalogo.js') : root.NomCatalogo;
  var Log = (typeof module === 'object' && module.exports) ? require('./logica.js')   : root.NomLogica;
  var api = factory(Cat, Log);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NomDespacho = api;
})(typeof window !== 'undefined' ? window : null, function (Cat, Log) {
  'use strict';

  // ─── Formato del texto plano ───
  // SEPARADOR y DECIMAL viven aquí arriba juntos y a propósito: son la única cosa de
  // este archivo que depende de la máquina de Ulises, no de nuestras reglas.
  //
  // Excel en español (es-MX) usa ';' como separador de lista y ',' como decimal; Excel
  // en inglés usa ',' y '.'. No hay un juego que funcione en los dos. Se eligió el par
  // es-MX porque es el que corre en la oficina, y queda en dos constantes para que
  // cambiarlo sea una línea y no una cacería. Si el archivo se abre con todo en una
  // sola columna, el que hay que mover es SEPARADOR.
  var SEPARADOR = ';';
  var DECIMAL = ',';
  var BOM = '﻿';   // sin esto Excel abre los acentos como "MartÃ­nez"

  // ─── Las columnas ───
  // El nombre de la columna usa el vocabulario que Ulises YA lee en CONTPAQi
  // (shared/operaciones/contpaqi_conceptos.json): "PREMIO DE ASISTENCIA Y PUNTUALIDAD"
  // y no "PPA", "AJUSTE EN SUELDOS" y no "ajuste". El archivo tiene que sonar al
  // sistema donde se va a capturar, no al nuestro.
  //
  // `tipo` decide cómo se imprime la celda:
  //   'txt'  tal cual        'dias' número de días (vacío si 0)
  //   'num'  cantidad simple 'mxn'  dinero con dos decimales (vacío si 0)
  // ── LO QUE SE IMPRIME ─────────────────────────────────────────────────────
  // Cuatro columnas. El archivo ES la instrucción: departamento y puesto no le dicen
  // nada a quien captura, y las veintitantas columnas de números eran una segunda
  // forma de decir lo mismo que ya dice la instrucción — dos fuentes para el mismo
  // dato, que es como se cuelan las diferencias entre lo que dice el renglón y lo que
  // dice la celda. Se conserva REVISAR aparte porque contesta otra pregunta: la
  // instrucción dice QUÉ capturar, REVISAR dice si TODAVÍA NO se debe capturar.
  var COLUMNAS = [
    { k: 'no_empleado',  t: 'NO EMPLEADO',  tipo: 'txt', total: false },
    { k: 'nombre',       t: 'EMPLEADO',     tipo: 'txt', total: false },
    { k: 'instruccion',  t: 'INSTRUCCION',  tipo: 'txt', total: false },
    { k: 'revisar',      t: 'REVISAR',      tipo: 'txt', total: false }
  ];

  // ── LO QUE SE ACUMULA (interno, ya no se imprime) ─────────────────────────
  // Los conceptos siguen sumándose en su cubo: de ahí sale el candado aritmético, el
  // cuadre de la semana y las cantidades que la instrucción escribe. Que dejen de
  // imprimirse no significa que dejen de calcularse — significa que la instrucción es
  // ahora su único vocero.
  var ACUMULADORES = [
    { k: 'dias_mx',      t: 'DIAS TRABAJADOS MX',                 tipo: 'dias', total: true  },
    { k: 'dias_usa',     t: 'DIAS TRABAJADOS USA',                tipo: 'dias', total: true  },
    { k: 'vacaciones',   t: 'VACACIONES',                         tipo: 'dias', total: true  },
    { k: 'festivo',      t: 'DIA FESTIVO',                        tipo: 'dias', total: true  },
    { k: 'falta_inj',    t: 'FALTA INJUSTIFICADA',                tipo: 'dias', total: true  },
    { k: 'falta_jus',    t: 'FALTA JUSTIFICADA',                  tipo: 'dias', total: true  },
    { k: 'permiso_cg',   t: 'PERMISO CON GOCE',                   tipo: 'dias', total: true  },
    { k: 'permiso_sg',   t: 'PERMISO SIN GOCE',                   tipo: 'dias', total: true  },
    { k: 'incapacidad',  t: 'INCAPACIDAD',                        tipo: 'dias', total: true  },
    { k: 'descanso',     t: 'DESCANSO TRABAJADO',                 tipo: 'dias', total: true  },
    { k: 'horas_extra',  t: 'HORAS EXTRAS',                       tipo: 'num',  total: true  },
    { k: 'imp_extra',    t: 'IMPORTE TIEMPO EXTRA',               tipo: 'mxn',  total: true  },
    { k: 'ppa',          t: 'PREMIO DE ASISTENCIA Y PUNTUALIDAD', tipo: 'txt',  total: false },
    { k: 'bono',         t: 'BONO',                               tipo: 'mxn',  total: true  },
    { k: 'prima_vac',    t: 'PRIMA VACACIONAL',                   tipo: 'mxn',  total: true  },
    { k: 'aguinaldo',    t: 'AGUINALDO',                          tipo: 'mxn',  total: true  },
    { k: 'fondo',        t: 'FONDO DE AHORRO',                    tipo: 'mxn',  total: true  },
    { k: 'ajuste',       t: 'AJUSTE EN SUELDOS',                  tipo: 'mxn',  total: true  },
    { k: 'finiquito',    t: 'FINIQUITO',                          tipo: 'mxn',  total: true  },
    { k: 'descuentos',   t: 'DESCUENTOS',                         tipo: 'mxn',  total: true  },
    { k: 'anticipo',     t: 'ANTICIPO ENTREGADO',                 tipo: 'mxn',  total: true  },
    { k: 'fts_usa',      t: 'PAGADO POR FTS USA',                 tipo: 'mxn',  total: true  }
  ];

  // A qué columna va cada tipo del catálogo. Vivir aquí y no repartido por el código
  // es lo que permite que agregar un tipo nuevo al catálogo sea una línea aquí.
  // Un tipo que NO esté en este mapa no desaparece: cae en la instrucción con su
  // etiqueta y marca REVISAR, porque un concepto que el archivo no sabe colocar es
  // exactamente lo que no debe pasar en silencio.
  var A_COLUMNA = {
    vacaciones:          { col: 'vacaciones', campo: 'dias' },
    dia_cumpleanos:      { col: 'vacaciones', campo: 'dias' },
    dia_festivo:         { col: 'festivo',    campo: 'dias' },
    falta_injustificada: { col: 'falta_inj',  campo: 'dias' },
    falta_justificada:   { col: 'falta_jus',  campo: 'dias' },
    permiso_con_goce:    { col: 'permiso_cg', campo: 'dias' },
    permiso_sin_goce:    { col: 'permiso_sg', campo: 'dias' },
    incapacidad:         { col: 'incapacidad',campo: 'dias' },
    trabajo_usa:         { col: 'dias_usa',   campo: 'dias' },
    descanso_trabajado:  { col: 'descanso',   campo: 'dias' },
    tiempo_extra:        { col: 'horas_extra',campo: 'horas', extra: { col: 'imp_extra', campo: 'monto' } },
    bono_proyecto:       { col: 'bono',       campo: 'monto' },
    bono_productividad:  { col: 'bono',       campo: 'monto' },
    bono_condicionado:   { col: 'bono',       campo: 'monto' },
    prima_vacacional:    { col: 'prima_vac',  campo: 'monto' },
    aguinaldo:           { col: 'aguinaldo',  campo: 'monto' },
    fondo_ahorro:        { col: 'fondo',      campo: 'monto' },
    ajuste_sueldo:       { col: 'ajuste',     campo: 'monto' },
    finiquito:           { col: 'finiquito',  campo: 'monto' },
    descuento_anticipo:  { col: 'descuentos', campo: 'monto' },
    compensa_deuda:      { col: 'descuentos', campo: 'monto' },
    descuento_prestamo:  { col: 'descuentos', campo: 'monto' },
    anticipo_sueldo:     { col: 'anticipo',   campo: 'monto' },
    pagado_fts_usa:      { col: 'fts_usa',    campo: 'monto' }
  };

  // ── Qué le hace cada concepto al pago ─────────────────────────────────────
  // El catálogo NO trae el signo: dice qué campos captura cada tipo, no si suma o
  // resta. Mientras el archivo tenía columnas eso bastaba —el número caía en la
  // columna DESCUENTOS o en BONO y el signo se leía del encabezado—, pero ahora la
  // instrucción es lo único que Ulises lee, y "1 día de falta injustificada" no dice
  // por sí solo que hay que descontarlo. El verbo va escrito.
  //
  // 'suma'  agrega al pago      'resta'  se le quita
  // 'dato'  ni suma ni resta: es información que el despacho necesita para capturar
  //         bien, pero el verbo lo decide otra cosa (quién paga, qué empresa).
  var EFECTO = {
    // Días que SÍ se pagan
    vacaciones:          { v: 'PAGAR',     signo: 'suma'  },
    dia_cumpleanos:      { v: 'PAGAR',     signo: 'suma'  },
    dia_festivo:         { v: 'PAGAR',     signo: 'suma'  },
    permiso_con_goce:    { v: 'PAGAR',     signo: 'suma'  },
    descanso_trabajado:  { v: 'PAGAR',     signo: 'suma'  },
    // Días que NO se pagan
    falta_injustificada: { v: 'DESCONTAR', signo: 'resta' },
    permiso_sin_goce:    { v: 'DESCONTAR', signo: 'resta' },
    // CONFIRMADO POR ESTEBAN (2026-09-04). Los dos dependen de la política de FTS, no
    // del código, y ponerles el verbo equivocado le cuesta dinero a una persona real,
    // así que estuvieron marcados `confirmar` hasta que hubo respuesta:
    //   · falta_justificada — se descuenta. Justificada quiere decir que no se
    //     sanciona, no que se pague; si hay que pagarla, el tipo es permiso_con_goce.
    //   · incapacidad — se descuenta el día TAMBIÉN. El verbo es DESCONTAR y no
    //     "NO PAGAR" porque para CONTPAQi es la misma operación: el día sale de la
    //     nómina de FTS. La nota dice a dónde se fue el pago, que es lo que impide
    //     que alguien lea el descuento como un error y lo revierta.
    falta_justificada:   { v: 'DESCONTAR', signo: 'resta' },
    incapacidad:         { v: 'DESCONTAR', signo: 'resta', nota: 'el día lo paga el IMSS, no FTS' },
    // Dinero que se agrega
    bono_proyecto:       { v: 'AGREGAR',   signo: 'suma'  },
    bono_productividad:  { v: 'AGREGAR',   signo: 'suma'  },
    bono_condicionado:   { v: 'AGREGAR',   signo: 'suma'  },
    prima_vacacional:    { v: 'AGREGAR',   signo: 'suma'  },
    aguinaldo:           { v: 'AGREGAR',   signo: 'suma'  },
    fondo_ahorro:        { v: 'AGREGAR',   signo: 'suma'  },
    finiquito:           { v: 'AGREGAR',   signo: 'suma'  },
    tiempo_extra:        { v: 'AGREGAR',   signo: 'suma'  },
    anticipo_sueldo:     { v: 'AGREGAR',   signo: 'suma'  },
    // Dinero que se descuenta
    descuento_anticipo:  { v: 'DESCONTAR', signo: 'resta' },
    descuento_prestamo:  { v: 'DESCONTAR', signo: 'resta' },
    compensa_deuda:      { v: 'DESCONTAR', signo: 'resta' },
    // El ajuste NO tiene verbo fijo: lo decide el signo del monto que capturó RH.
    ajuste_sueldo:       { v: null,        signo: 'porMonto' },
    // Estados Unidos. Lo que se trabaja o se paga allá NO lo paga esta nómina: lo
    // paga FTS LLC. Hasta V1.12 estos dos iban sin verbo, como dato informativo, y
    // ese es justo el modo de fallo caro: un día en USA sin verbo se lee como un día
    // normal de la semana y se termina pagando dos veces, aquí y allá. El verbo va
    // explícito y dice el motivo, que es lo que hace que nadie lo revierta por su
    // cuenta al no entenderlo.
    // `escueto` = la frase se corta después del concepto: ni proyecto, ni folio, ni
    // nota. Aquí es a propósito: contra qué orden trabajó en Estados Unidos es un
    // dato de rentabilidad, no de nómina, y a Ulises no le dice nada al capturar.
    // "DESCONTAR 3 días · Trabajó en USA" es la instrucción entera.
    trabajo_usa:         { v: 'DESCONTAR',          signo: 'resta', escueto: true },
    pagado_fts_usa:      { v: 'NO PAGAR EN MÉXICO', signo: 'resta' }
  };

  // Fuentes que NO son la nómina de CONTPAQi. Un bono pagado en dólares por Chase no
  // lo captura Ulises: lo paga FTS LLC. Que salga en el archivo sin avisar sería pedir
  // que se pague dos veces.
  function fuenteFueraDeNomina(clave) {
    var f = Log.derivarFuente(clave);
    if (!f) return clave ? 'fuente desconocida (' + clave + ')' : null;
    if (f.moneda === 'USD') return 'en USD por ' + f.nombre;
    if (f.empresa === 'FTS LLC') return 'lo paga FTS LLC (' + f.nombre + ')';
    if (clave === 'FACT') return 'va por factura del receptor';
    if (clave === 'SIN-PAGO') return 'devengado sin pago';
    return null;
  }

  // ─── El premio, resuelto igual que en la pantalla ───
  // Una decisión humana gana sobre la sugerencia; sin decisión manda la sugerencia.
  // Si la ficha de Odoo dice que no aplica, la celda dice N/A y no 'NO': no es lo
  // mismo "se le quitó" que "nunca le tocó".
  function ppaDe(p) {
    if (p.ppa && p.ppa.aplica === false) return { valor: 'N/A', decidido: false, revisar: false };
    var decidido = (p.ppa_decidido === true || p.ppa_decidido === false);
    var vale = decidido ? p.ppa_decidido : !!(p.ppa && p.ppa.sugerido);
    return { valor: vale ? 'SI' : 'NO', decidido: decidido, revisar: !!(p.ppa && p.ppa.revisar && !decidido) };
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function dinero(n) { return num(n).toFixed(2); }
  // En la INSTRUCCION el dinero se lee, no se captura: lleva separador de miles.
  // En la CELDA va plano, porque ahí sí lo va a leer una hoja de cálculo.
  function pesos(n) { return '$' + Log.moneda(n); }

  // ─── Un renglón ───
  function filaDe(persona, semana, disputas) {
    var f = { no_empleado: persona.id, nombre: persona.nombre, puesto: persona.puesto || '',
              departamento: persona.departamento || '', dias_mx: num(persona.dias_mexico) };
    // Todo cubo arranca en cero aunque nadie declare nada: un `undefined` sumado da
    // NaN, y un NaN en una cantidad de dias es un renglon que nadie sabe leer.
    for (var i = 0; i < ACUMULADORES.length; i++) {
      if (f[ACUMULADORES[i].k] === undefined) f[ACUMULADORES[i].k] = (ACUMULADORES[i].tipo === 'txt' ? '' : 0);
    }

    var frases = [], avisos = [];
    var L = persona.declaraciones || [];

    for (var d = 0; d < L.length; d++) {
      var dec = L[d], mm = Cat.meta(dec.tipo), destino = A_COLUMNA[dec.tipo];
      var etiqueta = mm ? mm.def.label : dec.tipo;
      var v = dec.valores || {};

      if (!destino) {
        // Tipo que el archivo no sabe colocar. NO se calla: se escribe y se marca.
        frases.push(etiqueta + ' (este concepto no tiene columna: captúralo a mano)');
        avisos.push('concepto sin columna: ' + etiqueta);
        continue;
      }

      // Los bonos de proyecto traen varios renglones, cada uno con su proyecto.
      if (mm && mm.def.multi) {
        var R = v.renglones || [], suma = 0, partes = [];
        for (var r = 0; r < R.length; r++) {
          suma += num(R[r].monto);
          partes.push((R[r].so || 'SIN PROYECTO') + ' ' + pesos(R[r].monto));
        }
        f[destino.col] += suma;
        // El bono de proyecto trae varios renglones: se dice el total —que es lo que
        // se captura— y luego el desglose por proyecto, que es lo que lo justifica.
        var efB = EFECTO[dec.tipo] || { v: 'AGREGAR' };
        frases.push((efB.v ? efB.v + ' ' : '') + pesos(suma) + ' · ' + etiqueta +
          (partes.length ? ' (' + partes.join(', ') + ')' : ''));
      } else {
        f[destino.col] += num(v[destino.campo]);
        if (destino.extra) f[destino.extra.col] += num(v[destino.extra.campo]);
        frases.push(fraseDe(etiqueta, dec, mm, v));
      }

      // La fuente NO se escribe en la instrucción. De qué banco sale el dinero no le
      // dice nada a quien captura la nómina: "BBVA México (MXN)" pegado a cada
      // concepto es ruido en la única línea que Ulises lee de verdad.
      //
      // Pero SÍ importa cuando la fuente no es esta nómina —un bono en dólares por
      // Chase lo paga FTS LLC, y capturarlo aquí sería pagarlo dos veces—, así que
      // ese caso no se calla: se va a REVISAR, que es la columna que contesta
      // "¿puedo capturar este renglón ya?". La instrucción dice QUÉ hacer; REVISAR
      // dice si todavía no. Cada dato en la columna que contesta su pregunta.
      if (mm && mm.def.fuente && dec.fuente) {
        var fuera = fuenteFueraDeNomina(dec.fuente);
        if (fuera) avisos.push(etiqueta + ' ' + fuera);
      }
    }

    // El premio SÍ va siempre en su COLUMNA: es la que Ulises captura o deja en
    // blanco cada semana para todos. En la instrucción es otra cosa — ver abajo.
    var pp = ppaDe(persona);
    f.ppa = pp.valor;
    if (pp.revisar) avisos.push('el premio salió de un cálculo que pide revisión');

    // Lo que le falta al renglón se manda igual, pero DICIÉNDOLO. El archivo se puede
    // bajar antes de enviar para revisarlo, y ahí es justo donde tiene que verse.
    // Se reusa `bloqueos` —el mismo juez que apaga el botón de enviar— para que no
    // existan dos definiciones de "a este renglón le falta algo": si la pantalla dice
    // que Samuel tiene un bono sin proyecto, el archivo tiene que decir lo mismo.
    var b = Log.bloqueos(persona, semana, disputas || []);
    for (var q = 0; q < b.length; q++) avisos.push(b[q].texto.toLowerCase());

    // ══ La instrucción se escribe COMO LA ESCRIBE MAGALY ═══════════════════════
    // Su lista de raya lleva años funcionando con una convención muy simple: si la
    // semana de alguien es normal, su renglón va EN BLANCO; si hay algo que hacer, va
    // dicho ahí mismo, en la línea de esa persona ("PPA + 1,000.00 BONO Y DESCONTAR
    // 500 DE PRESTAMO"). Ulises ya lee así, y el ojo entrenado a saltarse los blancos
    // encuentra las excepciones sin leer treinta renglones.
    //
    // Antes esta columna decía algo SIEMPRE —"5 de 5 días trabajados. Premio de
    // asistencia: NO (sugerido por el sistema)."— y eso es exactamente lo contrario:
    // treinta renglones con texto son treinta renglones que hay que leer para
    // descubrir que veintitantos no dicen nada. Lo repetido esconde lo excepcional.
    //
    // Desde V1.12 la instrucción NO es un resumen de las columnas: ES el dato. Las
    // columnas de números se quitaron porque decían lo mismo dos veces, y dos fuentes
    // del mismo dato es como se cuela una diferencia entre la celda y el renglón. Por
    // eso cada concepto va con su VERBO, su CANTIDAD y su CONCEPTO — sin las tres, la
    // instrucción obliga a preguntar.
    var partes = [];

    // PPA primero, que es como abre su renglón. Solo cuando toca: un "NO" no se
    // escribe, se calla — la columna ya lo dice, y escribirlo llenaría de ruido las
    // dos terceras partes de la lista.
    if (pp.valor === 'SI') partes.push('PPA' + (pp.decidido ? ' (decidido por RH)' : ''));

    // Los días solo se dicen cuando los trabajados NO completan la semana. Trabajar
    // los cinco es la norma y anunciarlo gasta la línea.
    //
    // El reparto México/USA se quitó a propósito: quien trabajó dos días aquí y tres
    // allá ya tiene su renglón "DESCONTAR 3 días · Trabajó en USA", que es la
    // instrucción completa. Decir además "5 de 5 días trabajados (2 en México, 3 en
    // USA)" es contar lo mismo otra vez y de otra forma — y obliga a hacer la resta
    // mental para saber cuántos se pagan. Los cinco días SÍ se trabajaron; lo que
    // cambia es quién los paga, y eso ya lo dice el verbo.
    var trabajados = f.dias_mx + f.dias_usa;
    if (trabajados !== semana.dias) {
      partes.push(trabajados + ' de ' + semana.dias + ' días trabajados');
    }

    for (var z = 0; z < frases.length; z++) partes.push(frases[z]);
    if (persona.ppa_nota) partes.push('Nota del premio: ' + persona.ppa_nota);
    if (persona.inactivo) partes.push('DADO DE BAJA en Odoo: solo trae lo declarado.');

    f.revisar = avisos.length ? ('SI: ' + avisos.join('; ')) : '';
    // Vacío = semana normal, nada que hacer. Es el caso más común y por eso es el que
    // tiene que costar cero leer.
    f.instruccion = partes.length ? (partes.join('. ') + '.') : '';
    return f;
  }

  // La frase de una declaración, con los datos que hacen falta para capturarla.
  // ── La frase de una declaración ───────────────────────────────────────────
  // Forma fija: VERBO · CUÁNTO · DE QUÉ CONCEPTO. Las tres partes van siempre y en
  // ese orden, porque las tres hacen falta para capturar sin preguntar: cuánto se
  // descuenta o se agrega, y bajo qué concepto. Antes la frase decía el concepto y la
  // cantidad pero NO el verbo — el signo se leía de la columna donde caía el número, y
  // esa columna ya no se imprime.
  function fraseDe(etiqueta, dec, mm, v) {
    var ef = EFECTO[dec.tipo] || { v: null, signo: 'dato' };
    var verbo = ef.v;
    // El ajuste de sueldo lo decide el signo de lo que capturó RH: +500 se agrega,
    // −500 se quita. Es el único concepto que puede ir para los dos lados.
    if (ef.signo === 'porMonto') verbo = num(v.monto) < 0 ? 'DESCONTAR' : 'AGREGAR';

    var cuanto = [];
    if (v.dias !== undefined && num(v.dias)) {
      cuanto.push(num(v.dias) + (num(v.dias) === 1 ? ' día' : ' días'));
    }
    if (v.horas !== undefined && num(v.horas)) cuanto.push(num(v.horas) + ' h');
    if (v.monto !== undefined && num(v.monto)) cuanto.push(pesos(Math.abs(num(v.monto))));

    // Un concepto que PIDE cantidad y llega sin ella no se puede escribir como si
    // estuviera completo: "PAGAR Vacaciones" no dice cuántos días, y quien lo lea va a
    // tener que preguntar o —peor— adivinar. Se dice que falta, con todas sus letras.
    // El renglón ya sale marcado en REVISAR por el mismo hueco; esto es para que
    // tambien se vea en la línea que Ulises captura.
    var pideCantidad = false;
    var defs = (mm && mm.def && mm.def.campos) || [];
    for (var c = 0; c < defs.length; c++) {
      var kc = defs[c][0];
      if (kc === 'dias' || kc === 'monto' || kc === 'horas') pideCantidad = true;
    }
    if (!cuanto.length && pideCantidad) cuanto.push('SIN CANTIDAD');

    var s = (verbo ? verbo + ' ' : '') + (cuanto.length ? cuanto.join(' · ') + ' · ' : '') + etiqueta;

    // El detalle que hace capturable la instrucción: contra qué proyecto, con qué
    // folio, cuál pago de la serie. Sin esto Ulises tiene el monto pero no la cuenta.
    // Salvo en los tipos marcados `escueto`, donde el detalle no aporta a la captura
    // y solo alarga el renglón.
    if (ef.escueto) return s;
    if (v.folio) s += ' (folio IMSS ' + v.folio + ')';
    if (v.clase) s += ' (' + v.clase + ')';
    if (v.motivo) s += ' (' + v.motivo + ')';
    if (v.so) s += ' (' + v.so + ')';
    if (v.plazo) s += ' (a ' + num(v.plazo) + ' semanas)';
    if (v.pago) s += ' (pago ' + num(v.pago) + ')';
    if (v.fecha) s += ' (baja ' + v.fecha + ')';
    if (v.prima === true) s += ' (con prima dominical)';
    if (ef.nota) s += ' — ' + ef.nota;
    return s;
  }

  // ─── Todos los renglones ───
  // Entra quien trabajó la semana Y quien, estando de baja, todavía trae algo
  // declarado (un finiquito, un saldo que se compensa). La misma regla que usa el
  // candado en logica.js: si se filtrara solo por activo, el finiquito se perdería.
  function filas(estado) {
    var out = [], P = (estado && estado.personas) || [];
    for (var i = 0; i < P.length; i++) {
      if (P[i].inactivo && !(P[i].declaraciones || []).length) continue;
      out.push(filaDe(P[i], estado.semana, estado.disputas));
    }
    return out;
  }

  // Renglón de totales. Existe para que Magaly cuadre de un vistazo que no se perdió
  // a nadie ni un peso entre la pantalla y el archivo.
  function totales(filasArr) {
    var t = { no_empleado: '', nombre: 'TOTAL (' + filasArr.length + ' personas)',
              ppa: '', revisar: '', instruccion: '' };
    // Los totales se siguen calculando sobre los CUBOS aunque el archivo ya no los
    // imprima: son el cuadre de la semana, y quien lo audite los quiere.
    for (var i = 0; i < ACUMULADORES.length; i++) {
      var c = ACUMULADORES[i];
      if (!c.total) continue;
      var s = 0;
      for (var j = 0; j < filasArr.length; j++) s += num(filasArr[j][c.k]);
      t[c.k] = s;
    }
    var conPremio = 0;
    for (var k = 0; k < filasArr.length; k++) if (filasArr[k].ppa === 'SI') conPremio++;
    t.ppa = conPremio + ' con premio';

    // El cuadre de la semana, en la línea del total. Antes se leía sumando las
    // columnas con la vista; sin columnas hay que escribirlo, o el renglón de totales
    // se queda diciendo solo cuántas personas — que es la mitad de para lo que existe.
    // Solo se nombra lo que tuvo movimiento: un cuadre lleno de ceros no se lee.
    var resumen = [];
    for (var q = 0; q < ACUMULADORES.length; q++) {
      var a = ACUMULADORES[q];
      if (!a.total || !num(t[a.k])) continue;
      var v = num(t[a.k]);
      resumen.push((a.tipo === 'mxn' ? pesos(v) : String(v)) + ' ' + a.t.toLowerCase());
    }
    resumen.push(conPremio + ' con premio');
    t.instruccion = resumen.join(' · ') + '.';
    return t;
  }

  // ─── Impresión de una celda ───
  function celda(fila, col) {
    var v = fila[col.k];
    if (col.tipo === 'txt') return v === undefined || v === null ? '' : String(v);
    var n = num(v);
    if (!n) return '';                                  // el 0 se calla: un mar de ceros no se lee
    if (col.tipo === 'mxn') return dinero(n).replace('.', DECIMAL);
    if (col.tipo === 'num') return String(n).replace('.', DECIMAL);
    return String(n);
  }

  function escapar(s) {
    s = String(s === undefined || s === null ? '' : s);
    // Los saltos de línea se aplanan: una celda de varias líneas rompe el CSV en
    // cuanto alguien lo abre con algo que no sea Excel.
    s = s.replace(/[\r\n]+/g, ' ');
    if (s.indexOf(SEPARADOR) >= 0 || s.indexOf('"') >= 0) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // ─── El archivo ───
  // Encabezado de dos renglones antes de la tabla: quién, qué semana y qué versión.
  // Sin eso, dos archivos de dos semanas distintas se ven iguales en la carpeta de
  // descargas, y el que se captura es el que se abrió primero.
  function texto(estado, meta) {
    meta = meta || {};
    var F = filas(estado), T = totales(F);
    var sem = estado.semana;
    var lin = [];
    lin.push(escapar('NOMINA FTS · SEMANA ' + sem.id + ' · del ' + sem.desde + ' al ' + sem.hasta +
      ' · ' + sem.dias + ' dias'));
    lin.push(escapar('Generado ' + (meta.fecha || new Date().toISOString().slice(0, 16).replace('T', ' ')) +
      ' UTC por ' + (meta.actor || 'RH') + ' · version ' + (meta.version || 1) +
      (meta.motivo ? ' · corregida: ' + meta.motivo : '')));
    lin.push('');
    var cab = [];
    for (var c = 0; c < COLUMNAS.length; c++) cab.push(escapar(COLUMNAS[c].t));
    lin.push(cab.join(SEPARADOR));
    for (var i = 0; i < F.length; i++) {
      var r = [];
      for (var k = 0; k < COLUMNAS.length; k++) r.push(escapar(celda(F[i], COLUMNAS[k])));
      lin.push(r.join(SEPARADOR));
    }
    var rt = [];
    for (var q = 0; q < COLUMNAS.length; q++) rt.push(escapar(celda(T, COLUMNAS[q])));
    lin.push(rt.join(SEPARADOR));
    return BOM + lin.join('\r\n') + '\r\n';
  }

  // 'S36/2026' no puede ser nombre de archivo: la diagonal es separador de carpetas.
  function nombreArchivo(semana, version) {
    var id = String((semana && semana.id) || 'semana').replace('/', '-');
    return 'nomina-' + id + '-v' + (version || 1) + '.csv';
  }

  // ═══ Las dos hojas del Excel ═══════════════════════════════════════════════
  // MISMA FUENTE, DOS VISTAS. Las dos hojas salen de `filas()` y `totales()`, los
  // mismos que escriben el CSV. No hay un segundo cálculo que pueda desviarse: si la
  // instrucción dice "DESCONTAR 2 días", el cubo del detalle trae 2 porque es el
  // mismo objeto leído dos veces.
  //
  // HOJA 1 — Instrucciones: idéntica al archivo que se manda. Es la que se revisa.
  // HOJA 2 — Detalle: los veintitantos cubos con su número, más departamento y
  //   puesto. Se quitaron del archivo porque estorbaban a quien captura, pero quien
  //   AUDITA sí los quiere: es la diferencia entre "qué hago" y "de dónde salió".
  //   Aquí los números van como NÚMEROS, no como texto, para que se puedan sumar.
  //
  // El CSV sigue siendo el acuse —es lo que se congela al enviar— y el Excel es la
  // vista. Un binario no se guarda en la tabla de datos ni se compara de un vistazo.
  function celdaExcel(fila, col) {
    var v = fila[col.k];
    if (col.tipo === 'txt') return (v === undefined || v === null) ? '' : String(v);
    var n = num(v);
    return n ? { v: n, n: true } : '';      // el 0 se calla, igual que en el CSV
  }

  // Ponerle estilo a una celda SIN aplastarla. Una celda numérica ya es un objeto
  // { v, n }, y envolverla otra vez —{ v: { v, n }, s }— la imprime como
  // "[object Object]". Pasó de verdad en el renglón de TOTAL de la hoja Detalle: en
  // la hoja 1 no se vio porque ahí todas las columnas son texto, o sea que el error
  // estaba desde el primer minuto y escondido detrás de un tipo de dato.
  function conEstilo(cel, s) {
    if (cel === '' || cel === undefined || cel === null) return { v: '', s: s };
    if (typeof cel === 'object') return { v: cel.v, n: cel.n, s: s };
    return { v: cel, s: s };
  }

  function hojas(estado, meta) {
    meta = meta || {};
    var F = filas(estado), T = totales(F), sem = estado.semana, i, k;

    var titulo = 'NOMINA FTS · SEMANA ' + sem.id + ' · del ' + sem.desde + ' al ' + sem.hasta +
      ' · ' + sem.dias + ' dias';
    var sello = 'Generado ' + (meta.fecha || new Date().toISOString().slice(0, 16).replace('T', ' ')) +
      ' UTC por ' + (meta.actor || 'RH') + ' · version ' + (meta.version || 1) +
      (meta.motivo ? ' · corregida: ' + meta.motivo : '');

    // -- Hoja 1 --
    var h1 = [[{ v: titulo, s: 2 }], [sello], [], []];
    for (i = 0; i < COLUMNAS.length; i++) h1[3].push({ v: COLUMNAS[i].t, s: 1 });
    for (i = 0; i < F.length; i++) {
      var r1 = [];
      for (k = 0; k < COLUMNAS.length; k++) {
        var val = celdaExcel(F[i], COLUMNAS[k]);
        // La instrucción y el aviso se ajustan al alto de la celda: son las dos
        // columnas largas, y sin esto el renglón se corta a la mitad de la frase.
        r1.push((COLUMNAS[k].k === 'instruccion' || COLUMNAS[k].k === 'revisar')
          ? conEstilo(val, 3) : val);
      }
      h1.push(r1);
    }
    var t1 = [];
    for (k = 0; k < COLUMNAS.length; k++) t1.push(conEstilo(celdaExcel(T, COLUMNAS[k]), 2));
    h1.push(t1);

    // -- Hoja 2 --
    var COLS2 = [{ k: 'no_empleado', t: 'NO EMPLEADO', tipo: 'txt' },
                 { k: 'nombre',      t: 'EMPLEADO',    tipo: 'txt' },
                 { k: 'departamento',t: 'DEPARTAMENTO',tipo: 'txt' },
                 { k: 'puesto',      t: 'PUESTO',      tipo: 'txt' }]
      .concat(ACUMULADORES)
      .concat([{ k: 'revisar', t: 'REVISAR', tipo: 'txt' }]);

    var h2 = [[{ v: titulo + ' · DETALLE', s: 2 }],
              ['Los mismos renglones de la hoja Instrucciones, abiertos por concepto. ' +
               'Los números son números: se pueden sumar y filtrar.'], [], []];
    for (i = 0; i < COLS2.length; i++) h2[3].push({ v: COLS2[i].t, s: 1 });
    for (i = 0; i < F.length; i++) {
      var r2 = [];
      for (k = 0; k < COLS2.length; k++) r2.push(celdaExcel(F[i], COLS2[k]));
      h2.push(r2);
    }
    var t2 = [];
    for (k = 0; k < COLS2.length; k++) {
      // El TOTAL no repite la instrucción de cuadre aquí: en esta hoja el cuadre son
      // las sumas de cada columna, que es justo lo que se viene a ver.
      t2.push(conEstilo((COLS2[k].k === 'revisar') ? '' : celdaExcel(T, COLS2[k]), 2));
    }
    h2.push(t2);

    var anchos2 = [13, 32, 20, 26];
    for (i = 0; i < ACUMULADORES.length; i++) anchos2.push(ACUMULADORES[i].tipo === 'mxn' ? 16 : 13);
    anchos2.push(44);

    return [
      { nombre: 'Instrucciones', congelar: 4, anchos: [13, 34, 96, 46], filas: h1 },
      { nombre: 'Detalle',       congelar: 4, anchos: anchos2,          filas: h2 }
    ];
  }

  function nombreExcel(semana, version) {
    var id = String((semana && semana.id) || 'semana').replace('/', '-');
    return 'nomina-' + id + '-v' + (version || 1) + '.xlsx';
  }

  return {
    COLUMNAS: COLUMNAS,
    ACUMULADORES: ACUMULADORES,
    EFECTO: EFECTO,
    A_COLUMNA: A_COLUMNA,
    SEPARADOR: SEPARADOR,
    filas: filas,
    filaDe: filaDe,
    totales: totales,
    celda: celda,
    texto: texto,
    hojas: hojas,
    nombreArchivo: nombreArchivo,
    nombreExcel: nombreExcel,
    ppaDe: ppaDe,
    fuenteFueraDeNomina: fuenteFueraDeNomina
  };
});
