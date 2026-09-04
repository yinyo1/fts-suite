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
  var COLUMNAS = [
    { k: 'no_empleado',  t: 'NO EMPLEADO',                        tipo: 'txt',  total: false },
    { k: 'nombre',       t: 'NOMBRE',                             tipo: 'txt',  total: false },
    { k: 'puesto',       t: 'PUESTO',                             tipo: 'txt',  total: false },
    { k: 'departamento', t: 'DEPARTAMENTO',                       tipo: 'txt',  total: false },
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
    { k: 'fts_usa',      t: 'PAGADO POR FTS USA',                 tipo: 'mxn',  total: true  },
    { k: 'revisar',      t: 'REVISAR',                            tipo: 'txt',  total: false },
    { k: 'instruccion',  t: 'INSTRUCCION',                        tipo: 'txt',  total: false }
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
    for (var i = 0; i < COLUMNAS.length; i++) {
      if (f[COLUMNAS[i].k] === undefined) f[COLUMNAS[i].k] = (COLUMNAS[i].tipo === 'txt' ? '' : 0);
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
        frases.push(etiqueta + ' ' + pesos(suma) + (partes.length ? ' (' + partes.join(', ') + ')' : ''));
      } else {
        f[destino.col] += num(v[destino.campo]);
        if (destino.extra) f[destino.extra.col] += num(v[destino.extra.campo]);
        frases.push(fraseDe(etiqueta, dec, mm, v));
      }

      // La fuente se dice SIEMPRE que la haya: de dónde sale el dinero es la mitad
      // de la instrucción. Y si esa fuente no es la nómina, se marca para revisar.
      if (mm && mm.def.fuente && dec.fuente) {
        var fu = Log.derivarFuente(dec.fuente);
        frases[frases.length - 1] += ' — ' + (fu ? fu.nombre + ' (' + fu.moneda + ')' : dec.fuente);
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
    // Las COLUMNAS no cambian: los días, el premio y los montos siguen ahí con su
    // número exacto. La instrucción es el resumen para leer, no el dato para capturar.
    var partes = [];

    // PPA primero, que es como abre su renglón. Solo cuando toca: un "NO" no se
    // escribe, se calla — la columna ya lo dice, y escribirlo llenaría de ruido las
    // dos terceras partes de la lista.
    if (pp.valor === 'SI') partes.push('PPA' + (pp.decidido ? ' (decidido por RH)' : ''));

    // Los días solo se dicen cuando NO son la semana completa en México. Que alguien
    // trabaje sus cinco días es la norma; anunciarlo es gastar la línea.
    var trabajados = f.dias_mx + f.dias_usa;
    if (f.dias_mx !== semana.dias || f.dias_usa) {
      partes.push(trabajados + ' de ' + semana.dias + ' días trabajados' +
        (f.dias_usa ? ' (' + f.dias_mx + ' en México, ' + f.dias_usa + ' en USA)' : ''));
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
  function fraseDe(etiqueta, dec, mm, v) {
    var s = etiqueta;
    if (v.dias !== undefined && num(v.dias)) s += ': ' + num(v.dias) + (num(v.dias) === 1 ? ' día' : ' días');
    if (v.horas !== undefined && num(v.horas)) s += ': ' + num(v.horas) + ' h';
    if (v.monto !== undefined && num(v.monto)) s += ' ' + pesos(v.monto);
    if (v.folio) s += ' · folio IMSS ' + v.folio;
    if (v.clase) s += ' · ' + v.clase;
    if (v.motivo) s += ' · ' + v.motivo;
    if (v.so) s += ' · ' + v.so;
    if (v.plazo) s += ' · a ' + num(v.plazo) + ' semanas';
    if (v.pago) s += ' · pago ' + num(v.pago);
    if (v.fecha) s += ' · baja ' + v.fecha;
    if (v.prima === true) s += ' · con prima dominical';
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
    var t = { no_empleado: '', nombre: 'TOTAL (' + filasArr.length + ' personas)', puesto: '',
              departamento: '', ppa: '', revisar: '', instruccion: '' };
    for (var i = 0; i < COLUMNAS.length; i++) {
      var c = COLUMNAS[i];
      if (!c.total) continue;
      var s = 0;
      for (var j = 0; j < filasArr.length; j++) s += num(filasArr[j][c.k]);
      t[c.k] = s;
    }
    var conPremio = 0;
    for (var k = 0; k < filasArr.length; k++) if (filasArr[k].ppa === 'SI') conPremio++;
    t.ppa = conPremio + ' con premio';
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

  return {
    COLUMNAS: COLUMNAS,
    A_COLUMNA: A_COLUMNA,
    SEPARADOR: SEPARADOR,
    filas: filas,
    filaDe: filaDe,
    totales: totales,
    celda: celda,
    texto: texto,
    nombreArchivo: nombreArchivo,
    ppaDe: ppaDe,
    fuenteFueraDeNomina: fuenteFueraDeNomina
  };
});
