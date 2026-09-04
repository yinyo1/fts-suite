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
    { etiqueta: 'Descuento de préstamo',      clave: 'PRESTAMO_EMPRESA' },
    { etiqueta: 'Descuento de anticipo',      clave: 'PRESTAMO_EMPRESA' },
    { etiqueta: 'Compensación de deuda',      clave: 'PRESTAMO_EMPRESA' }
  ];
  // El premio va aparte: no se declara como concepto con cantidad, abre el renglón
  // con la palabra PPA. Su columna en CONTPAQi es esta.
  var CLAVE_PPA = 'PREMIO_ASISTENCIA_PUNTUALIDAD';

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
      out.items.push({
        verbo: verbo, concepto: concepto, texto: frase,
        dias:  mDias  ? num(mDias[1]) : null,
        horas: mHoras ? num(mHoras[1]) : null,
        monto: mMonto ? num(mMonto[1].replace(/,/g, '')) : null,
        sin_cantidad: /SIN CANTIDAD/.test(n)
      });
    }
    return out;
  }

  // ── El cruce ──────────────────────────────────────────────────────────────
  // `empleados` son los del resolver de CONTPAQi (cod, nombre, conceptos{}).
  function cruzar(despacho, empleados, semanaSeleccionada) {
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

    for (i = 0; i < despacho.filas.length; i++) {
      var f = despacho.filas[i];
      var quien = (f.codigo3 || '???') + ' ' + f.nombre;

      // 2 · Sin código no hay cruce. Se dice y se sigue: el resto del archivo sí
      // se puede revisar, y esconderlo sería peor.
      if (!f.codigo3) {
        hallazgos.push({ nivel: REVISION, codigo: 'RH_SIN_CODIGO',
          que: 'RH mandó una persona sin código de CONTPAQi, no se puede cruzar',
          dato: f.nombre + (f.instruccion ? ' · ' + f.instruccion : ''),
          accion: 'Pide a RH que le cargue el código en Odoo. Mientras, revisa esta persona a mano.' });
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
      var ppaPagado = Math.abs(num(e.conceptos && e.conceptos[CLAVE_PPA])) > 0.005;
      if (f.conceptos.ppa && !ppaPagado) {
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'PPA_NO_PAGADO',
          que: 'RH otorgó el premio de puntualidad y la nómina no lo trae',
          dato: quien, accion: 'Captura el premio o confirma con RH que se le quitó.' });
      } else if (!f.conceptos.ppa && ppaPagado) {
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'PPA_SIN_INSTRUCCION',
          que: 'La nómina paga premio de puntualidad y RH no lo otorgó',
          dato: quien + ' · $' + num(e.conceptos[CLAVE_PPA]).toFixed(2),
          accion: 'Quítalo o confirma con RH.' });
      }

      // 6 · Concepto por concepto, en las dos direcciones.
      var pedido = {};
      for (j = 0; j < f.conceptos.items.length; j++) {
        var it = f.conceptos.items[j];
        var fila = buscarMapa(it.concepto);
        if (!fila) {
          hallazgos.push({ nivel: REVISION, codigo: 'CONCEPTO_NO_CRUZABLE',
            que: 'RH pidió algo que este cruce no sabe comparar contra CONTPAQi',
            dato: quien + ' · ' + it.texto,
            accion: 'Revísalo a mano. Si es un concepto que se va a repetir, hay que agregarlo a la tabla del cruce.' });
          continue;
        }
        pedido[fila.clave] = true;
        var val = num(e.conceptos && e.conceptos[fila.clave]);
        if (Math.abs(val) < 0.005) {
          hallazgos.push({ nivel: INTEGRIDAD, codigo: 'INSTRUCCION_NO_CAPTURADA',
            que: 'RH pidió un movimiento que la nómina no refleja',
            dato: quien + ' · ' + it.texto,
            accion: 'Captúralo en CONTPAQi o confirma con RH que ya no aplica.' });
        } else if (it.monto !== null && Math.abs(Math.abs(val) - it.monto) > 0.005) {
          hallazgos.push({ nivel: REVISION, codigo: 'MONTO_DISTINTO',
            que: 'El monto capturado no es el que pidió RH',
            dato: quien + ' · RH pidió $' + it.monto.toFixed(2) + ' y la nómina trae $' + Math.abs(val).toFixed(2),
            accion: 'Corrige el monto o confirma la diferencia con RH.' });
        }
        if (it.sin_cantidad) {
          hallazgos.push({ nivel: REVISION, codigo: 'RH_SIN_CANTIDAD',
            que: 'RH mandó el concepto sin decir cuánto',
            dato: quien + ' · ' + it.texto,
            accion: 'Pide a RH la cantidad. No la inventes.' });
        }
      }

      // 7 · Y al revés: dinero capturado que RH nunca pidió.
      for (j = 0; j < MAPA.length; j++) {
        var cl = MAPA[j].clave;
        if (pedido[cl]) continue;
        var v2 = num(e.conceptos && e.conceptos[cl]);
        if (Math.abs(v2) < 0.005) continue;
        if (yaReportado(hallazgos, quien, cl)) continue;
        hallazgos.push({ nivel: INTEGRIDAD, codigo: 'CAPTURA_SIN_INSTRUCCION',
          que: 'La nómina trae un movimiento que RH no pidió',
          dato: quien + ' · ' + MAPA[j].etiqueta + ' $' + Math.abs(v2).toFixed(2),
          accion: 'Quítalo o pide a RH la instrucción que lo respalde.', _clave: cl });
      }
    }

    // 8 · Gente en la nómina que RH nunca listó.
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
