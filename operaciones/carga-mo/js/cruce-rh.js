// ═══ Carga MO · cruce contra lo que mandó RH ═══════════════════════════════
//
// QUÉ PROBLEMA RESUELVE. Hasta aquí, la nómina se validaba contra sí misma: que el
// Excel de CONTPAQi cuadre, que los conceptos estén catalogados, que los totales
// cierren. Todo eso puede salir perfecto y la nómina estar mal, porque no se
// comparaba contra lo ÚNICO que dice qué debía traer: las instrucciones que RH mandó.
// Si Magaly pidió descontarle dos días a alguien y nadie lo capturó, el archivo
// cuadra igual — la persona simplemente cobra de más y nadie se entera.
//
// Este archivo cruza los dos lados y contesta una sola pregunta por persona:
// **¿lo que se capturó es lo que RH pidió?**
//
// LA LLAVE ES EL CÓDIGO, NO EL NOMBRE. Odoo escribe "Héctor Cruz Hernández" y
// CONTPAQi "CRUZ HERNANDEZ HECTOR JAVIER": distinto orden, con el segundo nombre y
// sin acentos. Cruzar por nombre es adivinar. El código de tres dígitos vive en
// Odoo (x_studio_codigo_contpaqi), viaja en el archivo de RH desde V1.16 y es el
// mismo con el que Ulises captura.
//
// PURO: sin DOM, sin red. Corre en el navegador y en node — por eso el doble export.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CruceRH = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Los mismos tres niveles del resolver, para que la pantalla los pinte igual y
  // nadie tenga que aprender una segunda escala.
  var INTEGRIDAD = 'INTEGRIDAD';     // no se manda la nómina así
  var REVISION   = 'REVISION';       // hay que mirarlo antes de mandar
  var AVISO      = 'AVISO';          // se dice, no detiene

  // ── Qué concepto de RH corresponde a qué concepto de CONTPAQi ─────────────
  // La tabla es EXPLÍCITA a propósito. Deducirla por parecido de nombre sería el
  // camino corto y el que se rompe en silencio el día que alguien renombre algo:
  // un concepto que no calza dejaría de vigilarse sin que nadie lo note. Aquí, un
  // concepto sin fila en esta tabla no se cruza y SE DICE (CONCEPTO_NO_CRUZABLE).
  //
  // `clave` es la del catálogo de CONTPAQi (shared/operaciones/contpaqi_conceptos.json).
  // `etiqueta` es como lo escribe el archivo de RH (el label del catálogo de nómina).
  var MAPA = [
    { etiqueta: 'Vacaciones',                 clave: 'VACACIONES_A_TIEMPO' },
    { etiqueta: 'Día de cumpleaños',          clave: 'VACACIONES_A_TIEMPO' },
    { etiqueta: 'Prima vacacional',           clave: 'PRIMA_VACACIONAL_A_TIEMPO' },
    { etiqueta: 'Aguinaldo',                  clave: 'AGUINALDO' },
    { etiqueta: 'Fondo de ahorro',            clave: 'FONDO_DE_AHORRO_EMPLEADO' },
    { etiqueta: 'Bono de proyecto',           clave: 'BONO' },
    { etiqueta: 'Bono de productividad',      clave: 'BONO' },
    { etiqueta: 'Bono condicionado',          clave: 'BONO' },
    { etiqueta: 'Tiempo extra',               clave: 'HORAS_EXTRAS' },
    { etiqueta: 'Ajuste de sueldo',           clave: 'AJUSTE_EN_SUELDOS' },
    { etiqueta: 'Descuento por préstamo',     clave: 'PRESTAMO_EMPRESA' },
    { etiqueta: 'Descuento de anticipo',      clave: 'PRESTAMO_EMPRESA' },
    { etiqueta: 'Compensa contra deuda',      clave: 'PRESTAMO_EMPRESA' }
  ];
  // ⚠️ Las etiquetas de arriba tienen que existir LETRA POR LETRA en el catálogo de
  // nómina (modulos/rh/nomina-incidencias/js/catalogo.js). Dos de ellas no existían
  // —decían 'Descuento DE préstamo' y 'Compensación de deuda' cuando el catálogo dice
  // 'Descuento POR préstamo' y 'Compensa contra deuda'—, así que esos dos conceptos
  // NUNCA se cruzaron: RH pedía el descuento, Ulises lo capturaba bien, y el sistema
  // reportaba 'RH pidió algo que este cruce no sabe comparar'. Una preposición apagó
  // un control durante todo el tiempo que existió. El gate ahora cruza esta tabla
  // contra el catálogo real, que es la única forma de que no vuelva a pasar callado.
  // El premio va aparte: no se declara como concepto con cantidad, abre el renglón
  // con la palabra PPA. Su columna en CONTPAQi es esta.
  var CLAVE_PPA = 'PREMIO_ASISTENCIA_PUNTUALIDAD';

  // ── Conceptos que CONTPAQi paga SOLO, como consecuencia de otro ───────────
  // RH nunca los va a pedir porque no son una decisión suya: son ley. La prima
  // vacacional es el 25% de las vacaciones (LFT art. 80), y aparece sola en cuanto
  // se capturan vacaciones. Reclamarla como 'movimiento que RH no pidió' es exigirle
  // a Magaly que declare una obligación legal — y era el hallazgo que más ruido hacía:
  // tres INTEGRIDAD que apagaban el botón de enviar una nómina correcta.
  //
  // No se ignora: se verifica el porcentaje, que es el control que de verdad importa.
  // Y una prima SIN vacaciones sigue siendo hallazgo, porque ahí no hay de dónde salga.
  var DERIVADOS = [
    { clave: 'PRIMA_VACACIONAL_A_TIEMPO', de: 'VACACIONES_A_TIEMPO',
      pct: 0.25, nombre: 'prima vacacional', ley: 'LFT art. 80 (25% mínimo)' }
  ];

  // ── Bono libre de impuestos ───────────────────────────────────────────────
  // Cuando el bono va libre, la cifra que RH escribe es lo que le LLEGA al empleado y
  // la que Ulises captura es el BRUTO que lo produce: la empresa absorbe el ISR. Los
  // dos números son correctos y distintos, así que exigir que sean iguales convierte
  // el trabajo bien hecho en siete hallazgos.
  //
  // Medido en la SEM 36: $1,000 libres se capturaron como $1,271.62 (×1.2716) y como
  // $1,353.33 (×1.3533) según la persona; Tomás pidió $500 y se capturaron $635.81 —
  // el MISMO factor que en los de $1,000, o sea estrictamente proporcional. Esos dos
  // factores son 1/(1−21.36%) y 1/(1−26.1%): tasas marginales reales.
  //
  // La banda es deliberadamente ancha. No sirve para adivinar la tasa —eso lo hace
  // CONTPAQi con la tabla del SAT— sino para cazar los dos errores que sí importan:
  // capturar el neto como si fuera bruto (factor 1.00, al empleado le llega de menos)
  // y un dedazo que multiplique el monto. Entre medio, cualquier factor es plausible.
  var FACTOR_MIN = 1.02;   // por debajo, no se hizo el cálculo inverso
  var FACTOR_MAX = 1.85;   // por encima, ninguna tasa marginal mexicana lo explica

  function norm(s) {
    return ('' + (s === undefined || s === null ? '' : s))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }

  // ── Leer el archivo que mandó RH ──────────────────────────────────────────
  // Es NUESTRO formato, no un archivo ajeno: dos renglones de encabezado, uno en
  // blanco, la fila de columnas y los datos, separados por ';'. Por eso se puede
  // parsear con confianza — y por eso el gate lo fija: si el generador cambia de
  // forma, este lector se cae aquí y no en la pantalla de Ulises.
  function parseDespacho(texto) {
    var t = ('' + (texto || '')).replace(/^﻿/, '');
    var lin = t.split(/\r\n|\n/);
    var rejilla = [];
    for (var z = 0; z < lin.length; z++) rejilla.push(partirCsv(lin[z]));
    return armar(rejilla);
  }

  // RH manda dos formatos y los dos son el mismo archivo: el .csv es el acuse y el
  // .xlsx es la vista. Aceptar solo uno obligaria a Ulises a saber cual le tocó.
  // `filas` es la rejilla que devuelve cualquier lector de hoja de calculo.
  function desdeFilas(filas) {
    var rej = [];
    for (var i = 0; i < (filas || []).length; i++) {
      var r = filas[i] || [], f = [];
      for (var j = 0; j < r.length; j++) f.push(r[j] === null || r[j] === undefined ? '' : ('' + r[j]));
      rej.push(f);
    }
    return armar(rej);
  }

  function armar(rejilla) {
    var out = { semana: null, generado: '', version: null, filas: [], error: null };
    var lin = [];
    for (var z = 0; z < rejilla.length; z++) lin.push(rejilla[z].join(' '));

    if (lin.length < 4) { out.error = 'El archivo no tiene la forma del archivo de RH.'; return out; }

    var mSem = /SEMANA\s+(S\d+\/\d{4})/.exec(lin[0]);
    if (!mSem) { out.error = 'El archivo no dice de qué semana es. ¿Es el archivo de RH?'; return out; }
    out.semana = mSem[1];
    out.generado = lin[1] || '';
    var mVer = /versi[oó]n\s+(\d+)/i.exec(lin[1] || '');
    out.version = mVer ? parseInt(mVer[1], 10) : null;

    var iCab = -1;
    for (var k = 0; k < Math.min(lin.length, 8); k++) {
      if (/NO EMPLEADO/.test(lin[k]) && /INSTRUCCION/.test(lin[k])) { iCab = k; break; }
    }
    if (iCab < 0) { out.error = 'No se encontró el renglón de columnas del archivo de RH.'; return out; }
    var cab = rejilla[iCab].map(norm);
    var iCod = cab.indexOf('CODIGO'), iNo = cab.indexOf('NO EMPLEADO'),
        iNom = cab.indexOf('EMPLEADO'), iIns = cab.indexOf('INSTRUCCION'), iRev = cab.indexOf('REVISAR');

    for (var i = iCab + 1; i < lin.length; i++) {
      if (!lin[i] || !lin[i].trim()) continue;
      var c = rejilla[i];
      var nom = iNom >= 0 ? (c[iNom] || '') : '';
      if (/^TOTAL\s*\(/.test(nom)) continue;               // el renglón de totales no es una persona
      var cod = iCod >= 0 ? ('' + (c[iCod] || '')).trim() : '';
      out.filas.push({
        codigo: cod,
        // El código se compara siempre a 3 dígitos: '13' y '013' son la misma persona,
        // y el resolver ya normaliza así del lado de CONTPAQi.
        codigo3: cod ? ('00' + cod).slice(-3) : '',
        no_empleado: iNo >= 0 ? ('' + (c[iNo] || '')).trim() : '',
        nombre: nom,
        instruccion: iIns >= 0 ? (c[iIns] || '') : '',
        revisar: iRev >= 0 ? (c[iRev] || '') : '',
        conceptos: leerInstruccion(iIns >= 0 ? (c[iIns] || '') : '')
      });
    }
    if (!out.filas.length) out.error = 'El archivo de RH no trae ninguna persona.';
    return out;
  }

  // CSV con ';' y comillas dobles escapadas duplicando. Mínimo pero correcto: una
  // instrucción con punto y coma dentro va entrecomillada y hay que respetarlo.
  function partirCsv(linea) {
    var out = [], cur = '', dentro = false;
    for (var i = 0; i < linea.length; i++) {
      var ch = linea[i];
      if (dentro) {
        if (ch === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else dentro = false; }
        else cur += ch;
      } else if (ch === '"') dentro = true;
      else if (ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  // ── Leer una instrucción ──────────────────────────────────────────────────
  // Formato propio y fijo: frases separadas por '. ', cada una
  //   VERBO CANTIDAD · CONCEPTO (detalle)
  // El PPA no lleva verbo: abre el renglón con la palabra sola.
  var VERBOS = ['DESCONTAR', 'NO PAGAR EN MEXICO', 'NO PAGAR', 'PAGAR', 'AGREGAR'];
  function leerInstruccion(txt) {
    var s = '' + (txt || '');
    var out = { ppa: /(^|[.·]\s*)PPA\b/.test(norm(s)), items: [] };
    var partes = s.split('. ');
    for (var i = 0; i < partes.length; i++) {
      var frase = partes[i].replace(/\.$/, '').trim();
      if (!frase) continue;
      var n = norm(frase);
      var verbo = null;
      for (var v = 0; v < VERBOS.length; v++) {
        if (n.indexOf(VERBOS[v] + ' ') === 0) { verbo = VERBOS[v]; break; }
      }
      if (!verbo) continue;                                  // contexto, no instrucción
      var resto = frase.slice(verbo.length).trim();
      var p = resto.split('·');
      if (p.length < 2) continue;
      var cuanto = p[0].trim();
      var concepto = p[p.length - 1].trim().replace(/\s*\(.*$/, '').replace(/\s*—.*$/, '').trim();
      var mDias = /([\d.]+)\s*d[ií]as?/i.exec(cuanto);
      var mHoras = /([\d.]+)\s*h\b/i.exec(cuanto);
      var mMonto = /\$\s*([\d,]+(?:\.\d+)?)/.exec(cuanto);
      // 'libre': el monto es lo que le LLEGA al empleado, no lo que se captura.
      // 'con_isr': el monto es el bruto y se captura tal cual.
      // null: la instrucción no lo dice — archivos de antes de que RH lo declarara.
      // Ese tercer estado NO se trata como 'con_isr': no saber no es saber que no.
      var libre = /LIBRE DE IMPUESTOS/.test(n) ? true : (/CON ISR AL EMPLEADO/.test(n) ? false : null);
      out.items.push({
        verbo: verbo, concepto: concepto, texto: frase,
        dias:  mDias  ? num(mDias[1]) : null,
        horas: mHoras ? num(mHoras[1]) : null,
        monto: mMonto ? num(mMonto[1].replace(/,/g, '')) : null,
        libre: libre,
        sin_cantidad: /SIN CANTIDAD/.test(n)
      });
    }
    return out;
  }

  // ── El cruce ──────────────────────────────────────────────────────────────
  // `empleados` son los del resolver de CONTPAQi (cod, nombre, conceptos{}).
  // `trio` son los EXTERNOS que facturan por honorarios: no están en CONTPAQi, así
  // que Ulises los agrega a mano al Excel con su neto y les hace un .txt aparte para
  // dispersarles. El resolver ya los reconoce por alias de nombre y les pone su
  // empleado_id de Odoo; aquí se cruzan por ESE id, que es el mismo `NO EMPLEADO`
  // que trae el archivo de RH. Cruzar por nombre sería adivinar: Ulises escribe
  // "FELIPE" y "MANZANAREZ" (con z), Odoo dice "Felipe Pérez Guzmán" y "Manzanares".
  // `externos` = { personas: {<empleado_id>: {alias:[…]}}, filas: [<lo que el resolver
  // encontró en el Excel>] }. Los DOS hacen falta y por razones distintas: `personas`
  // dice quién ES externo —aunque esta semana no haya facturado— y `filas` dice quién
  // facturó. Sin `personas`, alguien que no facturó se vería como si le faltara el
  // código de CONTPAQi, que es justo el diagnóstico equivocado.
  function cruzar(despacho, empleados, semanaSeleccionada, externos) {
    var hallazgos = [], i, j;
    var res = { total_rh: 0, total_contpaqi: 0, cruzados: 0, con_instruccion: 0 };
    if (!despacho || despacho.error) {
      return { hallazgos: [{ nivel: INTEGRIDAD, codigo: 'ARCHIVO_RH_ILEGIBLE',
        que: 'No se pudo leer el archivo de RH',
        dato: (despacho && despacho.error) || 'archivo vacío',
        accion: 'Sube el archivo tal como lo mandó RH, sin abrirlo ni guardarlo de nuevo.' }],
        resumen: res };
    }

    var emps = empleados || [];
    res.total_rh = despacho.filas.length;
    res.total_contpaqi = emps.length;

    // 1 · La semana. Es lo PRIMERO porque si no cuadra, todo lo demás compara
    // personas de dos semanas distintas y cada diferencia sería falsa.
    if (semanaSeleccionada && despacho.semana && despacho.semana !== semanaSeleccionada) {
      hallazgos.push({ nivel: INTEGRIDAD, codigo: 'SEMANA_DISTINTA',
        que: 'El archivo de RH es de otra semana',
        dato: 'RH mandó ' + despacho.semana + ' y aquí está seleccionada ' + semanaSeleccionada,
        accion: 'Cambia la fecha de arriba o pide a RH el archivo de la semana correcta.' });
    }

    var porCod = {};
    for (i = 0; i < emps.length; i++) if (emps[i].cod) porCod[('00' + emps[i].cod).slice(-3)] = emps[i];
    var vistos = {};

    // Quién es externo (del catálogo) y quién facturó (del Excel), por empleado_id.
    var ext0 = externos || {};
    var esExterno = {}, filaExterno = {}, externosVistos = {};
    var conocidos = ext0.personas || {};
    for (var k in conocidos) if (Object.prototype.hasOwnProperty.call(conocidos, k)) esExterno[String(k)] = true;
    var filasExt = ext0.filas || [];
    for (i = 0; i < filasExt.length; i++) {
      if (filasExt[i] && filasExt[i].empleado_id != null) {
        var idE = String(filasExt[i].empleado_id);
        esExterno[idE] = true;                 // facturó: es externo aunque falte del catálogo
        filaExterno[idE] = filasExt[i];
      }
    }

    for (i = 0; i < despacho.filas.length; i++) {
      var f = despacho.filas[i];
      var quien = (f.codigo3 || '???') + ' ' + f.nombre;

      // 2 · Sin código de CONTPAQi. Hay dos razones muy distintas y confundirlas
      // manda a Ulises a pedir un dato que nunca va a existir.
      if (!f.codigo3) {
        var idRh = String(f.no_empleado || '');
        var ext = esExterno[idRh] ? (filaExterno[idRh] || null) : undefined;

        // (a) Externo por honorarios: NO tiene código porque no va en CONTPAQi.
        // Cobra en esta nómina, pero por fuera: Ulises le agrega su renglón al final
        // del Excel con el neto y le hace un .txt aparte para dispersarle. Pedir su
        // código sería pedir algo que por definición no existe, cada semana.
        if (ext !== undefined) {
          externosVistos[idRh] = true;
          if (ext) {
            hallazgos.push({ nivel: AVISO, codigo: 'EXTERNO_FACTURO',
              que: 'Externo por honorarios: cobra fuera de CONTPAQi y su renglón está en el Excel',
              dato: f.nombre + ' · renglón "' + ext.nombre + '" · neto $' + num(ext.neto).toFixed(2),
              accion: 'Verifica que ese neto sea el de su factura, y que entre en el .txt de dispersión.' });
          } else {
            hallazgos.push({ nivel: AVISO, codigo: 'EXTERNO_SIN_RENGLON',
              que: 'Externo por honorarios que esta semana no tiene renglón en el Excel',
              dato: f.nombre + ' · no aparece entre los renglones de honorarios',
              accion: 'Si facturó, agrégale su renglón con el neto. Si no facturó esta semana, no hay nada que hacer.' });
          }
          continue;
        }

        // (b) Le falta el código de verdad: está en la nómina de CONTPAQi pero su
        // ficha de Odoo no lo tiene cargado. Eso sí se arregla, y en Odoo.
        hallazgos.push({ nivel: REVISION, codigo: 'RH_SIN_CODIGO',
          que: 'RH mandó una persona sin código de CONTPAQi, no se puede cruzar',
          dato: f.nombre + (f.instruccion ? ' · ' + f.instruccion : ''),
          accion: 'Si cobra por CONTPAQi, pide que le carguen el código en Odoo. Si cobra por honorarios, ' +
                  'hay que darla de alta como externa en el catálogo. Mientras, revísala a mano.' });
        continue;
      }
      vistos[f.codigo3] = true;
      var e = porCod[f.codigo3];

      // 3 · Está en la lista de RH y NO en la nómina. Es el error caro: alguien
      // que debía cobrar y no aparece.
      if (!e) {
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'RH_SIN_PAGO',
          que: 'RH la incluyó en la semana pero no aparece en la nómina de CONTPAQi',
          dato: quien,
          accion: 'Verifica si falta capturarla o si causó baja. No mandes la nómina sin resolverlo.' });
        continue;
      }
      res.cruzados++;

      // 4 · Lo que RH marcó para revisar viaja hasta aquí. Que RH lo haya mandado
      // así no lo vuelve capturable a ciegas.
      if (f.revisar && f.revisar.trim()) {
        hallazgos.push({ nivel: REVISION, codigo: 'RH_MARCO_REVISAR',
          que: 'RH mandó esta persona marcada para revisar',
          dato: quien + ' · ' + f.revisar.replace(/^SI:\s*/, ''),
          accion: 'Confírmalo con RH antes de capturar este renglón.' });
      }

      if (f.instruccion && f.instruccion.trim()) res.con_instruccion++;

      // 5 · El premio de puntualidad, en sus dos direcciones.
      var ppaPagado = Math.abs(valorDe(e, CLAVE_PPA)) > 0.005;
      if (f.conceptos.ppa && !ppaPagado) {
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'PPA_NO_PAGADO',
          que: 'RH otorgó el premio de puntualidad y la nómina no lo trae',
          dato: quien, accion: 'Captura el premio o confirma con RH que se le quitó.' });
      } else if (!f.conceptos.ppa && ppaPagado) {
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'PPA_SIN_INSTRUCCION',
          que: 'La nómina paga premio de puntualidad y RH no lo otorgó',
          dato: quien + ' · $' + valorDe(e, CLAVE_PPA).toFixed(2),
          accion: 'Quítalo o confirma con RH.' });
      }

      // 6 · Concepto por concepto, en las dos direcciones.
      var pedido = {};
      for (j = 0; j < f.conceptos.items.length; j++) {
        var it = f.conceptos.items[j];
        var fila = buscarMapa(it.concepto);
        if (!fila) {
          // Días trabajados, faltas, permisos: NO tienen columna propia en la lista
          // de raya. Se reflejan dentro del Sueldo, y el archivo no trae ni los días
          // ni el sueldo diario, así que este cruce NO PUEDE verificarlos. Decir
          // 'RH pidió algo que no sé comparar' suena a que falta configurar algo;
          // lo honesto es decir que no hay contra qué compararlo y qué mirar a mano.
          // Es AVISO y no REVISIÓN porque no es una sospecha sobre este archivo:
          // es un límite del layout, y se repite idéntico todas las semanas.
          if (it.dias !== null) {
            hallazgos.push({ nivel: AVISO, codigo: 'DIAS_NO_VERIFICABLES',
              que: 'Días que hay que revisar a mano: la lista de raya no trae columna de días',
              dato: quien + ' · ' + it.texto,
              accion: 'Compara el Sueldo de esta persona contra su sueldo diario. ' +
                      'Si le pagaron la semana completa, el ajuste no se capturó.' });
            continue;
          }
          hallazgos.push({ nivel: REVISION, codigo: 'CONCEPTO_NO_CRUZABLE',
            que: 'RH pidió algo que este cruce no sabe comparar contra CONTPAQi',
            dato: quien + ' · ' + it.texto,
            accion: 'Revísalo a mano. Si es un concepto que se va a repetir, hay que agregarlo a la tabla del cruce.' });
          continue;
        }
        pedido[fila.clave] = true;
        var val = valorDe(e, fila.clave);
        if (Math.abs(val) < 0.005) {
          hallazgos.push({ nivel: INTEGRIDAD, codigo: 'INSTRUCCION_NO_CAPTURADA',
            que: 'RH pidió un movimiento que la nómina no refleja',
            dato: quien + ' · ' + it.texto,
            accion: 'Captúralo en CONTPAQi o confirma con RH que ya no aplica.' });
        } else if (it.monto !== null && (Math.abs(Math.abs(val) - it.monto) > 0.005 || it.libre === true)) {
          var h = compararMonto(quien, it, Math.abs(val));
          if (h) hallazgos.push(h);
        }
        if (it.sin_cantidad) {
          hallazgos.push({ nivel: REVISION, codigo: 'RH_SIN_CANTIDAD',
            que: 'RH mandó el concepto sin decir cuánto',
            dato: quien + ' · ' + it.texto,
            accion: 'Pide a RH la cantidad. No la inventes.' });
        }
      }

      // 7 · Lo que CONTPAQi paga solo porque la ley lo obliga.
      // Se verifica el porcentaje en vez de reclamar la existencia.
      var derivado = {};
      for (j = 0; j < DERIVADOS.length; j++) {
        var D = DERIVADOS[j];
        var origen = valorDe(e, D.de);
        var monto  = valorDe(e, D.clave);
        if (Math.abs(origen) < 0.005) continue;      // sin origen, no es derivado: cae abajo
        derivado[D.clave] = true;
        if (Math.abs(monto) < 0.005) {
          hallazgos.push({ nivel: INTEGRIDAD, codigo: 'DERIVADO_FALTANTE',
            que: 'La nómina paga ' + D.de.toLowerCase().replace(/_/g, ' ') + ' sin la ' + D.nombre + ' que le corresponde',
            dato: quien + ' · ' + D.ley,
            accion: 'Captura la ' + D.nombre + '. Es obligatoria, no depende de que RH la pida.' });
          continue;
        }
        var esperado = r2(Math.abs(origen) * D.pct);
        if (Math.abs(monto) < esperado - 0.02) {
          hallazgos.push({ nivel: REVISION, codigo: 'DERIVADO_CORTO',
            que: 'La ' + D.nombre + ' quedó por debajo del mínimo de ley',
            dato: quien + ' · $' + Math.abs(monto).toFixed(2) + ' sobre $' + Math.abs(origen).toFixed(2) +
                  ' es ' + (100 * Math.abs(monto) / Math.abs(origen)).toFixed(1) + '%, y el mínimo es ' +
                  (100 * D.pct).toFixed(0) + '% (' + D.ley + ')',
            accion: 'Corrígelo en CONTPAQi antes de mandar.' });
        }
      }

      // 8 · Y al revés: dinero capturado que RH nunca pidió.
      for (j = 0; j < MAPA.length; j++) {
        var cl = MAPA[j].clave;
        if (pedido[cl] || derivado[cl]) continue;
        var v2 = valorDe(e, cl);
        if (Math.abs(v2) < 0.005) continue;
        if (yaReportado(hallazgos, quien, cl)) continue;
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'CAPTURA_SIN_INSTRUCCION',
          que: 'La nómina trae un movimiento que RH no pidió',
          dato: quien + ' · ' + MAPA[j].etiqueta + ' $' + Math.abs(v2).toFixed(2),
          accion: 'Quítalo o pide a RH la instrucción que lo respalde.', _clave: cl });
      }
    }

    // 8b · Un externo facturó y RH no lo listó en la semana. Su monto entra al total
    // de la nómina y se carga a proyectos igual que el de cualquiera, así que que RH
    // no lo tenga es un hueco real, no un detalle de forma.
    for (i = 0; i < filasExt.length; i++) {
      var fx = filasExt[i];
      if (!fx || fx.empleado_id == null) continue;
      if (externosVistos[String(fx.empleado_id)]) continue;
      hallazgos.push({ nivel: REVISION, codigo: 'EXTERNO_SIN_RH',
        que: 'El Excel trae un renglón de honorarios de alguien que RH no incluyó en la semana',
        dato: '"' + fx.nombre + '" · neto $' + num(fx.neto).toFixed(2) + ' (fila ' + fx.fila + ')',
        accion: 'Confírmalo con RH antes de mandar: su monto entra al total y se carga a proyectos.' });
    }

    // 9 · Gente en la nómina que RH nunca listó.
    for (i = 0; i < emps.length; i++) {
      var c3 = ('00' + emps[i].cod).slice(-3);
      if (vistos[c3]) continue;
      hallazgos.push({ nivel: INTEGRIDAD, codigo: 'PAGO_SIN_RH',
        que: 'La nómina paga a alguien que RH no incluyó en la semana',
        dato: c3 + ' ' + emps[i].nombre + ' · neto $' + num(emps[i].neto).toFixed(2),
        accion: 'Confirma con RH. Puede ser un alta que no llegó al módulo de nómina.' });
    }

    return { hallazgos: hallazgos, resumen: res };
  }

  // ── Comparar lo que RH pidió contra lo que se capturó ─────────────────────
  // Devuelve SIEMPRE un hallazgo: la diferencia existe y se dice. Lo que cambia es
  // el nivel y la explicación, porque no toda diferencia es un error.
  function compararMonto(quien, it, capturado) {
    var factor = it.monto > 0 ? capturado / it.monto : 0;

    // Bono libre: la diferencia es el ISR que absorbe la empresa. Es correcto.
    if (it.libre === true) {
      if (factor >= FACTOR_MIN && factor <= FACTOR_MAX) {
        return { nivel: AVISO, codigo: 'BONO_LIBRE_OK',
          que: 'Bono libre de impuestos: el bruto capturado es mayor, como debe ser',
          dato: quien + ' · le llegan $' + it.monto.toFixed(2) + ' y se capturaron $' + capturado.toFixed(2) +
                ' (×' + factor.toFixed(4) + ', ISR implícito ' + (100 * (1 - 1 / factor)).toFixed(2) + '%)',
          accion: 'Nada que hacer. Se muestra para que quede la cuenta a la vista.' };
      }
      if (factor < FACTOR_MIN) {
        return { nivel: INTEGRIDAD, codigo: 'BONO_LIBRE_SIN_CALCULAR',
          que: 'El bono era libre de impuestos y se capturó el monto tal cual',
          dato: quien + ' · RH pidió que le llegaran $' + it.monto.toFixed(2) + ' y se capturaron $' +
                capturado.toFixed(2) + ' brutos',
          accion: 'Calcula el bruto para que el neto sea $' + it.monto.toFixed(2) + '. Así le llega de menos.' };
      }
      return { nivel: REVISION, codigo: 'BONO_LIBRE_DESPROPORCIONADO',
        que: 'El bruto del bono libre es demasiado alto para cualquier tasa de ISR',
        dato: quien + ' · $' + it.monto.toFixed(2) + ' libres se capturaron como $' + capturado.toFixed(2) +
              ' (×' + factor.toFixed(4) + ')',
        accion: 'Revisa el cálculo: ninguna tasa marginal mexicana da ese factor.' };
    }

    // Sin marca de impuestos no se puede saber cuál de los dos casos es. Se dice la
    // diferencia y se pide que RH la declare, en vez de afirmar que está mal.
    if (it.libre === null && capturado > it.monto) {
      return { nivel: REVISION, codigo: 'MONTO_MAYOR_SIN_DECLARAR',
        que: 'La nómina capturó más de lo que pidió RH y el archivo no dice si el bono va libre de impuestos',
        dato: quien + ' · RH pidió $' + it.monto.toFixed(2) + ' y la nómina trae $' + capturado.toFixed(2) +
              ' (×' + factor.toFixed(4) + ')',
        accion: 'Si va libre de impuestos, la diferencia es el ISR y está bien: pide a RH que lo marque ' +
                'en el módulo para que deje de aparecer aquí. Si no, corrige el monto.' };
    }

    if (Math.abs(capturado - it.monto) <= 0.005) return null;   // coinciden: nada que decir

    return { nivel: REVISION, codigo: 'MONTO_DISTINTO',
      que: 'El monto capturado no es el que pidió RH',
      dato: quien + ' · RH pidió $' + it.monto.toFixed(2) + ' y la nómina trae $' + capturado.toFixed(2),
      accion: 'Corrige el monto o confirma la diferencia con RH.' };
  }

  // Un concepto de RH puede caer en una percepción (un bono) o en una deducción (un
  // descuento por préstamo). Buscar solo en percepciones fue lo que hizo que los tres
  // descuentos de la SEM 36 se reportaran como "RH lo pidió y no aparece" estando
  // capturados: el dato existía, se estaba mirando la mitad equivocada del renglón.
  function valorDe(e, clave) {
    if (!e) return 0;
    var v = e.conceptos && e.conceptos[clave];
    if (v === undefined || v === null) v = e.deducciones && e.deducciones[clave];
    return num(v);
  }

  function buscarMapa(concepto) {
    var n = norm(concepto);
    for (var i = 0; i < MAPA.length; i++) if (norm(MAPA[i].etiqueta) === n) return MAPA[i];
    return null;
  }
  // Varias etiquetas caen en la misma clave (los tres bonos son BONO). Sin esto, un
  // bono capturado generaria un hallazgo por cada etiqueta que apunta a esa clave.
  function yaReportado(hallazgos, quien, clave) {
    for (var i = 0; i < hallazgos.length; i++) {
      if (hallazgos[i]._clave === clave && hallazgos[i].dato.indexOf(quien) === 0) return true;
    }
    return false;
  }

  function contar(hallazgos, nivel) {
    var n = 0;
    for (var i = 0; i < hallazgos.length; i++) if (hallazgos[i].nivel === nivel) n++;
    return n;
  }

  return {
    parseDespacho: parseDespacho, desdeFilas: desdeFilas, leerInstruccion: leerInstruccion, cruzar: cruzar,
    contar: contar, norm: norm, MAPA: MAPA, CLAVE_PPA: CLAVE_PPA,
    NIVELES: { INTEGRIDAD: INTEGRIDAD, REVISION: REVISION, AVISO: AVISO }
  };
});
