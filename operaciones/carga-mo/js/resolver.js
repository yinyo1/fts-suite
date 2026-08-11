/* ═══════════════════════════════════════════════════════════════════════════
   FTS Suite · Carga MO · Resolver v2
   ---------------------------------------------------------------------------
   Funcion PURA. Sin DOM, sin fetch, sin estado global. Recibe:
     rows     = matriz cruda del Excel (XLSX.utils.sheet_to_json header:1)
     catalogo = shared/operaciones/contpaqi_conceptos.json ya parseado
   Devuelve un reporte completo con niveles de falla.

   REGLAS DURAS (no relajar sin releer docs/operaciones/PARSER_V2.md):
     · CERO indices hardcodeados. Todo por marcador + nombre normalizado.
     · La fila de encabezados se DETECTA, no se asume.
     · Match EXACTO tras normalizar. Nunca substring.
       (FONDO DE AHORRO existe en percepciones Y en deducciones.)
     · A2 suma TODAS las columnas de la zona percepciones, catalogadas o no.
       Un concepto nuevo NO rompe integridad: va al puente y la nomina sigue.
     · Nada se descarta en silencio. Fila con dinero que no se entiende -> puente.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CargaMOResolver = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── niveles de falla ─────────────────────────────────────────────────── */
  var INTEGRIDAD = 'INTEGRIDAD';   // ALTO TOTAL. No se escribe nada. Gatea el boton.
  var CLASIFICACION = 'CLASIFICACION'; // Al puente. El resto se escribe.
  var AVISO = 'AVISO';             // Solo se reporta.

  /* ── helpers ──────────────────────────────────────────────────────────── */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/\*/g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[.·]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? r2(v) : 0;
    var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isNaN(n) ? 0 : r2(n);
  }
  function esVacio(v) { return v == null || String(v).trim() === ''; }
  function colLetra(i) {
    var s = '', n = i;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }

  /* Indice alias-normalizado -> clave, construido una vez por catalogo. */
  function construirIndice(cat) {
    var idx = { campo: {}, marcador: {}, concepto: {}, trio: {}, filaTotal: {} };
    Object.keys(cat.campos_fijos || {}).forEach(function (k) {
      (cat.campos_fijos[k].alias || []).forEach(function (a) { idx.campo[norm(a)] = k; });
    });
    var defs = (cat.marcadores && cat.marcadores.defs) || {};
    Object.keys(defs).forEach(function (k) {
      (defs[k].alias || []).forEach(function (a) { idx.marcador[norm(a)] = k; });
    });
    Object.keys(cat.conceptos || {}).forEach(function (k) {
      (cat.conceptos[k].alias || []).forEach(function (a) { idx.concepto[norm(a)] = k; });
    });
    var per = (cat.trio && cat.trio.personas) || {};
    Object.keys(per).forEach(function (empId) {
      (per[empId].alias || []).forEach(function (a) { idx.trio[norm(a)] = empId; });
    });
    ((cat.fila_total && cat.fila_total.alias) || []).forEach(function (a) { idx.filaTotal[norm(a)] = true; });
    return idx;
  }

  /* ── 1. deteccion de la fila de encabezados ───────────────────────────── */
  function detectarHeader(rows, cat, idx) {
    var cfg = cat.deteccion_header || {};
    var barrer = Math.min(cfg.filas_a_barrer || 15, rows.length);
    var mejor = -1, mejorPuntaje = -1;
    for (var i = 0; i < barrer; i++) {
      var fila = rows[i] || [], p = 0;
      for (var j = 0; j < fila.length; j++) {
        var n = norm(fila[j]);
        if (!n) continue;
        if (idx.campo[n] || idx.marcador[n] || idx.concepto[n]) p++;
      }
      // desempate por el hint del catalogo
      if (p > mejorPuntaje || (p === mejorPuntaje && i === cfg.hint)) { mejorPuntaje = p; mejor = i; }
    }
    return { fila: mejor, puntaje: mejorPuntaje, minimo: cfg.min_matches || 3 };
  }

  /* ── 2. resolucion de columnas ────────────────────────────────────────── */
  function resolverColumnas(headers, cat, idx, fallas) {
    var campos = {}, marcadores = {}, conceptos = {}, ambiguos = [];
    var crudos = headers.map(function (h) { return esVacio(h) ? '' : String(h).replace(/\s+/g, ' ').trim(); });

    for (var j = 0; j < headers.length; j++) {
      var n = norm(headers[j]);
      if (!n) continue;
      if (idx.campo[n] !== undefined) {
        var ck = idx.campo[n];
        if (campos[ck] !== undefined) ambiguos.push('campo "' + ck + '" aparece en ' + colLetra(campos[ck]) + ' y ' + colLetra(j));
        else campos[ck] = j;
        continue;
      }
      if (idx.marcador[n] !== undefined) {
        var mk = idx.marcador[n];
        if (marcadores[mk] !== undefined) ambiguos.push('marcador "' + mk + '" aparece en ' + colLetra(marcadores[mk]) + ' y ' + colLetra(j));
        else marcadores[mk] = j;
        continue;
      }
      if (idx.concepto[n] !== undefined) {
        var kk = idx.concepto[n];
        if (conceptos[kk] !== undefined) ambiguos.push('concepto "' + kk + '" aparece en ' + colLetra(conceptos[kk]) + ' y ' + colLetra(j));
        else conceptos[kk] = j;
      }
    }

    ambiguos.forEach(function (m) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'COLUMNA_AMBIGUA',
        que: 'La misma etiqueta aparece en dos columnas distintas',
        dato: m,
        accion: 'Revisa el Excel: hay encabezados duplicados. No se puede decidir cual leer.' });
    });
    return { campos: campos, marcadores: marcadores, conceptos: conceptos, crudos: crudos };
  }

  function validarMarcadores(marcadores, cat, fallas) {
    var orden = (cat.marcadores && cat.marcadores.orden_requerido) || [];
    var faltantes = orden.filter(function (m) { return marcadores[m] === undefined; });
    if (faltantes.length) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'MARCADOR_AUSENTE',
        que: 'Faltan marcadores de CONTPAQi que delimitan las zonas del reporte',
        dato: 'faltan: ' + faltantes.join(', '),
        accion: 'Confirma que el archivo es la "Lista de Raya (forma tabular)" de CONTPAQi. Si el nombre de la columna cambio, agrega el alias en contpaqi_conceptos.json -> marcadores.defs.' });
      return false;
    }
    var pos = orden.map(function (m) { return marcadores[m]; });
    for (var i = 1; i < pos.length; i++) {
      if (pos[i] <= pos[i - 1]) {
        fallas.push({ nivel: INTEGRIDAD, codigo: 'MARCADOR_DESORDENADO',
          que: 'Los marcadores de CONTPAQi no vienen en el orden esperado',
          dato: orden.map(function (m, k) { return m + '=' + colLetra(pos[k]); }).join(' → '),
          accion: 'El archivo no tiene la estructura que conocemos. No se leyo ningun monto. Avisa a Ulises.' });
        return false;
      }
    }
    return true;
  }

  /* ── 3. armado de zonas ───────────────────────────────────────────────── */
  function armarZonas(res, cat, idx, fallas) {
    var M = res.marcadores;
    var idxTotPer = M.TOTAL_PERCEPCIONES, idxTotDed = M.TOTAL_DEDUCCIONES;
    var camposIdx = {}; Object.keys(res.campos).forEach(function (k) { camposIdx[res.campos[k]] = true; });

    var percepciones = [], deducciones = [], noCatalogadas = [];
    var conceptoPorCol = {};
    Object.keys(res.conceptos).forEach(function (k) { conceptoPorCol[res.conceptos[k]] = k; });

    for (var j = 0; j < res.crudos.length; j++) {
      if (camposIdx[j]) continue;
      if (esVacio(res.crudos[j])) continue;
      if (j === idxTotPer || j === idxTotDed || j === M.NETO) continue;

      var esPer = j < idxTotPer;
      var esDed = j > idxTotPer && j < idxTotDed;
      if (!esPer && !esDed) continue;

      var clave = conceptoPorCol[j];
      var esMarcadorMonto = (j === M.OTRAS_PERCEPCIONES || j === M.OTRAS_DEDUCCIONES);

      if (esPer) {
        if (clave) {
          var c = cat.conceptos[clave];
          if (c.zona !== 'percepciones') {
            fallas.push({ nivel: INTEGRIDAD, codigo: 'CONCEPTO_ZONA_EQUIVOCADA',
              que: 'Un concepto de deducciones aparecio en la zona de percepciones',
              dato: '"' + res.crudos[j] + '" (' + colLetra(j) + ') esta catalogado como ' + c.zona,
              accion: 'Revisa contpaqi_conceptos.json: la zona del concepto ' + clave + ' no coincide con donde lo imprime CONTPAQi.' });
          }
          percepciones.push({ col: j, clave: clave, clase: c.clase, destino: c.destino || null, def: c, header: res.crudos[j] });
        } else if (esMarcadorMonto) {
          percepciones.push({ col: j, clave: '__OTRAS_PERCEPCIONES__', clase: 'A_BOLSA', destino: 'PUENTE', def: { alerta_si_no_cero: true }, header: res.crudos[j] });
        } else {
          percepciones.push({ col: j, clave: null, clase: 'NO_CATALOGADO', destino: 'PUENTE', def: {}, header: res.crudos[j] });
          noCatalogadas.push({ col: j, letra: colLetra(j), header: res.crudos[j] });
        }
      } else {
        deducciones.push({ col: j, clave: clave || null, header: res.crudos[j] });
        if (!clave && !esMarcadorMonto) noCatalogadas.push({ col: j, letra: colLetra(j), header: res.crudos[j], zona: 'deducciones' });
      }
    }
    return { percepciones: percepciones, deducciones: deducciones, noCatalogadas: noCatalogadas };
  }

  /* ── 4. periodo ───────────────────────────────────────────────────────── */
  function detectarPeriodo(rows, headerRow) {
    var lim = Math.min(headerRow >= 0 ? headerRow : 8, rows.length);
    var re = /Periodo\s+(\d+).*?del\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+al\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
    for (var i = 0; i < lim; i++) {
      var linea = (rows[i] || []).map(function (c) { return c == null ? '' : String(c); }).join(' ');
      var m = linea.match(re);
      if (m) {
        return {
          periodo: parseInt(m[1], 10),
          inicio: m[4] + '-' + String(m[3]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0'),
          fin: m[7] + '-' + String(m[6]).padStart(2, '0') + '-' + String(m[5]).padStart(2, '0'),
          fila: i
        };
      }
    }
    return null;
  }

  /* ═══ RESOLVER ════════════════════════════════════════════════════════ */
  function resolver(rows, catalogo, opts) {
    opts = opts || {};
    var TOL = 0.011;
    var fallas = [];
    var idx = construirIndice(catalogo);

    if (!rows || !rows.length) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'ARCHIVO_VACIO', que: 'El archivo no tiene filas', dato: '0 filas', accion: 'Verifica que subiste el Excel correcto.' });
      return armarSalida(null, fallas, catalogo);
    }

    /* 1 · header */
    var det = detectarHeader(rows, catalogo, idx);
    if (det.fila < 0 || det.puntaje < det.minimo) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'HEADER_NO_DETECTADO',
        que: 'No se encontro la fila de encabezados del reporte',
        dato: 'mejor candidata: fila ' + (det.fila + 1) + ' con ' + det.puntaje + ' coincidencias (minimo ' + det.minimo + ')',
        accion: 'Confirma que el archivo es la Lista de Raya de CONTPAQi. Si los nombres de columna cambiaron, agregalos como alias en contpaqi_conceptos.json.' });
      return armarSalida(null, fallas, catalogo);
    }
    var headers = rows[det.fila] || [];

    /* 2 · columnas + marcadores */
    var res = resolverColumnas(headers, catalogo, idx, fallas);
    var reqCampos = Object.keys(catalogo.campos_fijos || {}).filter(function (k) { return catalogo.campos_fijos[k].requerido; });
    var faltanCampos = reqCampos.filter(function (k) { return res.campos[k] === undefined; });
    if (faltanCampos.length) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'CAMPO_REQUERIDO_AUSENTE',
        que: 'No se pudo identificar una columna obligatoria',
        dato: 'faltan: ' + faltanCampos.join(', ') + ' · encabezados leidos en fila ' + (det.fila + 1) + ': [' + res.crudos.filter(Boolean).join(', ') + ']',
        accion: 'Agrega el encabezado real como alias en contpaqi_conceptos.json -> campos_fijos.' });
    }
    var marcOk = validarMarcadores(res.marcadores, catalogo, fallas);
    if (faltanCampos.length || !marcOk) return armarSalida(null, fallas, catalogo);

    var Z = armarZonas(res, catalogo, idx, fallas);
    var M = res.marcadores, C = res.campos;

    /* 3 · periodo */
    var per = detectarPeriodo(rows, det.fila);
    if (!per) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'PERIODO_NO_DETECTADO',
        que: 'No se encontro la linea "Periodo N ... del DD/MM/AAAA al DD/MM/AAAA"',
        dato: 'se buscaron las filas 1 a ' + det.fila,
        accion: 'Verifica que el Excel trae el encabezado de CONTPAQi completo (no una copia pegada solo de la tabla).' });
    }

    /* 4 · filas */
    var empleados = [], trio = [], totalGral = null, puenteFilas = [], avisos = [];

    for (var i = det.fila + 1; i < rows.length; i++) {
      var fila = rows[i] || [];
      var codRaw = C.cod !== undefined ? fila[C.cod] : null;
      var nomRaw = C.nom !== undefined ? fila[C.nom] : null;
      var codStr = esVacio(codRaw) ? '' : String(codRaw).trim();
      var nomStr = esVacio(nomRaw) ? '' : String(nomRaw).trim();
      var nomN = norm(nomStr), codN = norm(codStr);

      var brutoFila = num(fila[M.TOTAL_PERCEPCIONES]);
      var netoFila = num(fila[M.NETO]);
      var dedFila = num(fila[M.TOTAL_DEDUCCIONES]);

      /* fila de totales */
      if (idx.filaTotal[codN] || idx.filaTotal[nomN] ||
          (!codStr && /^TOTAL/.test(nomN)) || (/^TOTAL/.test(codN))) {
        totalGral = { fila: i + 1, bruto: brutoFila, deducciones: dedFila, neto: netoFila, porColumna: {} };
        Z.percepciones.forEach(function (p) { totalGral.porColumna[p.col] = num(fila[p.col]); });
        continue;
      }

      var codValido = /^0*\d+$/.test(codStr) && parseInt(codStr, 10) > 0;

      /* trio: sin codigo, nombre en la tabla de alias */
      if (!codValido && idx.trio[nomN] !== undefined) {
        trio.push({ empleado_id: parseInt(idx.trio[nomN], 10), nombre: nomStr, alias_match: nomN,
                    neto: netoFila, fila: i + 1 });
        continue;
      }

      /* empleado con codigo */
      if (codValido) {
        empleados.push(construirEmpleado(fila, i, codStr, nomStr, Z, M, catalogo, TOL, fallas, avisos, catalogo.baselines_individuales));
        continue;
      }

      /* sin codigo y sin alias */
      var hayDinero = Math.abs(brutoFila) > 0.004 || Math.abs(netoFila) > 0.004;
      if (!hayDinero) continue;  // fila fantasma real: sin codigo, sin nombre util, sin dinero

      puenteFilas.push({ fila: i + 1, nombre: nomStr || '(sin nombre)', bruto: brutoFila, neto: netoFila });
      fallas.push({ nivel: CLASIFICACION, codigo: 'FILA_SIN_IDENTIFICAR',
        que: 'Hay una fila con dinero que no tiene codigo de empleado ni coincide con la tabla del trio',
        dato: 'fila ' + (i + 1) + ' · "' + (nomStr || '(sin nombre)') + '" · percepciones ' + brutoFila.toFixed(2) + ' · neto ' + netoFila.toFixed(2),
        accion: 'Su monto se aparta a la cuenta puente. Si es una persona del trio con el nombre escrito distinto, agrega ese nombre como alias en contpaqi_conceptos.json -> trio.personas.' });
    }

    /* 5 · validaciones de nivel archivo */
    // A3: suma de filas de empleado vs fila Total Gral, por columna
    if (!totalGral) {
      fallas.push({ nivel: AVISO, codigo: 'SIN_FILA_TOTAL',
        que: 'No se encontro la fila "Total Gral" del reporte',
        dato: 'alias buscados: ' + ((catalogo.fila_total || {}).alias || []).join(', '),
        accion: 'No se pudo correr la validacion A3 (suma de filas contra el total impreso). Las demas validaciones si corrieron.' });
    } else {
      var n = empleados.length;
      var tolA3 = Math.max(0.05, n * 0.01);
      var sumaBruto = r2(empleados.reduce(function (s, e) { return s + e.bruto; }, 0));
      if (Math.abs(sumaBruto - totalGral.bruto) > tolA3) {
        fallas.push({ nivel: INTEGRIDAD, codigo: 'A3_TOTAL_NO_CUADRA',
          que: 'La suma de los empleados no coincide con la fila Total Gral del Excel',
          dato: 'Σ empleados ' + sumaBruto.toFixed(2) + ' vs Total Gral ' + totalGral.bruto.toFixed(2) + ' · Δ ' + r2(sumaBruto - totalGral.bruto).toFixed(2) + ' (tolerancia ' + tolA3.toFixed(2) + ')',
          accion: 'El Excel no cuadra consigo mismo. No se escribe nada. Pidele a Ulises que regenere la Lista de Raya.' });
      }
      Z.percepciones.forEach(function (p) {
        var sc = r2(empleados.reduce(function (s, e) { return s + (e.porColumna[p.col] || 0); }, 0));
        var tc = totalGral.porColumna[p.col] || 0;
        if (Math.abs(sc - tc) > tolA3) {
          fallas.push({ nivel: INTEGRIDAD, codigo: 'A3_COLUMNA_NO_CUADRA',
            que: 'Una columna de percepciones no cuadra contra su total',
            dato: '"' + p.header + '" (' + colLetra(p.col) + ') · Σ ' + sc.toFixed(2) + ' vs total ' + tc.toFixed(2),
            accion: 'El Excel no cuadra consigo mismo. Pidele a Ulises que regenere la Lista de Raya.' });
        }
      });
    }

    if (!empleados.length) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'SIN_EMPLEADOS',
        que: 'No se identifico ningun empleado con codigo',
        dato: 'se recorrieron las filas ' + (det.fila + 2) + ' a ' + rows.length,
        accion: 'Verifica que el Excel trae la tabla de empleados y que la columna Codigo tiene numeros.' });
    }

    /* avisos de catalogo */
    Z.noCatalogadas.filter(function (c) { return c.zona !== 'deducciones'; }).forEach(function (c) {
      fallas.push({ nivel: CLASIFICACION, codigo: 'CONCEPTO_NO_CATALOGADO',
        que: 'Hay un concepto de percepciones que el catalogo no conoce',
        dato: '"' + c.header + '" en la columna ' + c.letra,
        accion: 'Su monto se aparta a la cuenta puente y la nomina se carga igual. Para que se distribuya, agregalo a contpaqi_conceptos.json -> conceptos con su clasificacion (POR_HORAS o A_BOLSA).' });
    });
    Z.noCatalogadas.filter(function (c) { return c.zona === 'deducciones'; }).forEach(function (c) {
      fallas.push({ nivel: AVISO, codigo: 'DEDUCCION_NO_CATALOGADA',
        que: 'Hay una deduccion nueva que el catalogo no conoce',
        dato: '"' + c.header + '" en la columna ' + c.letra,
        accion: 'Las deducciones no se distribuyen, asi que no afecta la carga. Agregala al catalogo cuando puedas para mantener el inventario completo.' });
    });

    avisos.forEach(function (a) { fallas.push(a); });

    return armarSalida({
      periodo: per,
      layout: {
        catalogo_version: catalogo.version,
        header_row: det.fila,
        header_row_humana: det.fila + 1,
        puntaje: det.puntaje,
        campos: mapaLetras(res.campos),
        marcadores: mapaLetras(res.marcadores),
        conceptos: mapaLetras(res.conceptos),
        no_catalogadas: Z.noCatalogadas,
        headers_crudos: res.crudos
      },
      empleados: empleados,
      trio: trio,
      total_gral: totalGral,
      puente_filas: puenteFilas,
      zonas: {
        percepciones: Z.percepciones.map(function (p) { return { col: p.col, letra: colLetra(p.col), clave: p.clave, clase: p.clase, header: p.header }; }),
        deducciones: Z.deducciones.map(function (d) { return { col: d.col, letra: colLetra(d.col), clave: d.clave, header: d.header }; })
      }
    }, fallas, catalogo);
  }

  function mapaLetras(m) {
    var o = {};
    Object.keys(m).forEach(function (k) { o[k] = { col: m[k], letra: colLetra(m[k]) }; });
    return o;
  }

  /* ── construccion de un empleado ──────────────────────────────────────── */
  function construirEmpleado(fila, i, codStr, nomStr, Z, M, cat, TOL, fallas, avisos, baselines) {
    var cod = codStr.padStart(3, '0');
    var bruto = num(fila[M.TOTAL_PERCEPCIONES]);
    var ded = num(fila[M.TOTAL_DEDUCCIONES]);
    var neto = num(fila[M.NETO]);

    var porColumna = {}, conceptos = {}, aBolsa = [], noCatalogado = [];
    var sumaZona = 0, sumaBolsa = 0, sumaNoCat = 0;
    var legacy = { vac: 0, asim: 0 };
    var firmaBaja = [];

    Z.percepciones.forEach(function (p) {
      var v = num(fila[p.col]);
      porColumna[p.col] = v;
      sumaZona = r2(sumaZona + v);
      if (p.clave) conceptos[p.clave] = v;
      if (Math.abs(v) < 0.005) return;

      if (p.clase === 'A_BOLSA') {
        sumaBolsa = r2(sumaBolsa + v);
        aBolsa.push({ concepto: p.clave, header: p.header, monto: v, destino: p.destino });
        if (p.def && p.def.mapea_a_campo_legacy) legacy[p.def.mapea_a_campo_legacy] = r2(legacy[p.def.mapea_a_campo_legacy] + v);
        if (p.def && p.def.firma_baja) firmaBaja.push(p.clave);
      } else if (p.clase === 'NO_CATALOGADO') {
        sumaNoCat = r2(sumaNoCat + v);
        noCatalogado.push({ header: p.header, letra: colLetra(p.col), monto: v, destino: 'PUENTE' });
      }
      /* alerta por MONTO: solo para conceptos raros (aguinaldo, fondo ahorro, viaticos,
         otras percepciones). Estos casi nunca aparecen, asi que verlos ES la señal. */
      if (p.def && p.def.alerta_si_no_cero) {
        avisos.push({ nivel: AVISO, codigo: 'CONCEPTO_INUSUAL',
          que: 'Aparecio un concepto que normalmente no viene en la nomina semanal',
          dato: cod + ' ' + nomStr + ' · "' + p.header + '" $' + v.toFixed(2),
          accion: 'Revisa que sea correcto. Si es un finiquito, confirma con RH que la baja este registrada en Odoo.' });
      }

      /* alerta por DESVIACION: para conceptos recurrentes (bono, premio de asistencia).
         Alertar "si != 0" dispararia ~52 veces al año y nadie leeria las alertas.
         Solo importa cuando el monto se sale del patron de ESA persona. */
      if (p.def && p.def.vigilar_desviacion && baselines) {
        var base = baselines.por_codigo && baselines.por_codigo[cod] && baselines.por_codigo[cod][p.clave];
        var umbral = baselines._umbral_pct || 20;
        if (base && Math.abs(base) > 0.005) {
          var desv = 100 * (v - base) / Math.abs(base);
          if (Math.abs(desv) > umbral) {
            avisos.push({ nivel: AVISO, codigo: 'DESVIACION_INDIVIDUAL',
              que: 'Un concepto se salio del patron habitual de esa persona',
              dato: cod + ' ' + nomStr + ' · "' + p.header + '" $' + v.toFixed(2)
                  + ' vs su habitual $' + base.toFixed(2) + ' · ' + (desv > 0 ? '+' : '') + desv.toFixed(1) + '%',
              accion: 'Confirma con RH o con Ulises que el monto es correcto. Si lo es, no requiere accion: se reparte por horas igual que siempre.' });
          }
        }
      }
    });

    /* A2 · la suma de la zona debe dar el TOTAL PERCEPCIONES impreso */
    if (Math.abs(sumaZona - bruto) > TOL) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'A2_EMPLEADO_NO_CUADRA',
        que: 'Los conceptos de un empleado no suman su Total Percepciones',
        dato: cod + ' ' + nomStr + ' (fila ' + (i + 1) + ') · Σ conceptos ' + sumaZona.toFixed(2) + ' vs Total Percepciones ' + bruto.toFixed(2) + ' · Δ ' + r2(sumaZona - bruto).toFixed(2),
        accion: 'El Excel no cuadra consigo mismo en ese renglon. No se escribe nada. Pidele a Ulises que revise ese empleado.' });
    }
    /* A4 · percepciones - deducciones = neto */
    if (Math.abs(r2(bruto - ded) - neto) > TOL) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'A4_NETO_NO_CUADRA',
        que: 'Percepciones menos deducciones no da el neto impreso',
        dato: cod + ' ' + nomStr + ' (fila ' + (i + 1) + ') · ' + bruto.toFixed(2) + ' - ' + ded.toFixed(2) + ' = ' + r2(bruto - ded).toFixed(2) + ' vs neto ' + neto.toFixed(2),
        accion: 'El Excel no cuadra consigo mismo en ese renglon. Pidele a Ulises que revise ese empleado.' });
    }

    var aRepartir = r2(bruto - sumaBolsa - sumaNoCat);
    /* A6 · invariante de la formula */
    if (Math.abs(r2(aRepartir + sumaBolsa + sumaNoCat) - bruto) > TOL) {
      fallas.push({ nivel: INTEGRIDAD, codigo: 'A6_INVARIANTE_ROTA',
        que: 'La descomposicion del bruto no cierra',
        dato: cod + ' ' + nomStr + ' · reparte ' + aRepartir.toFixed(2) + ' + bolsa ' + sumaBolsa.toFixed(2) + ' + puente ' + sumaNoCat.toFixed(2) + ' ≠ ' + bruto.toFixed(2),
        accion: 'Error interno del resolver. Avisa a Claude con el codigo A6_INVARIANTE_ROTA.' });
    }

    if (firmaBaja.length >= 2) {
      avisos.push({ nivel: AVISO, codigo: 'POSIBLE_BAJA',
        que: 'Aparecieron juntos los conceptos que solo salen en un finiquito',
        dato: cod + ' ' + nomStr + ' · ' + firmaBaja.join(' + '),
        accion: 'Confirma con RH si es una baja. Si lo es, verifica que este archivado en Odoo y que conserve su codigo CONTPAQi.' });
    }

    return {
      cod: cod, nombre: nomStr, fila: i + 1,
      bruto: bruto, deducciones: ded, neto: neto,
      a_repartir: aRepartir,
      a_bolsa: aBolsa, no_catalogado: noCatalogado,
      conceptos: conceptos, porColumna: porColumna,
      vac: legacy.vac, asim: legacy.asim,
      _src: { total_percepciones_col: M.TOTAL_PERCEPCIONES, total_percepciones_letra: colLetra(M.TOTAL_PERCEPCIONES) }
    };
  }

  /* ── salida ───────────────────────────────────────────────────────────── */
  function armarSalida(data, fallas, catalogo) {
    var integridad = fallas.filter(function (f) { return f.nivel === INTEGRIDAD; });
    var clasificacion = fallas.filter(function (f) { return f.nivel === CLASIFICACION; });
    var aviso = fallas.filter(function (f) { return f.nivel === AVISO; });
    var out = {
      ok: integridad.length === 0 && !!data,
      puede_enviar: integridad.length === 0 && !!data,
      catalogo_version: catalogo && catalogo.version,
      fallas: { integridad: integridad, clasificacion: clasificacion, aviso: aviso },
      resumen_fallas: { integridad: integridad.length, clasificacion: clasificacion.length, aviso: aviso.length }
    };
    if (data) {
      out.periodo = data.periodo;
      out.layout = data.layout;
      out.empleados = data.empleados;
      out.trio = data.trio;
      out.total_gral = data.total_gral;
      out.puente_filas = data.puente_filas;
      out.zonas = data.zonas;
      /* a_bolsa y puente son EXCLUYENTES: un concepto A_BOLSA con destino PUENTE
         cuenta en puente, no en bolsa. Si no, el KPI y el bloque del puente se
         contradicen — y una pagina que se contradice es peor que una que falla. */
      var tBolsa = 0, tPuente = 0;
      data.empleados.forEach(function (e) {
        e.a_bolsa.forEach(function (b) {
          if (b.destino === 'PUENTE') tPuente = r2(tPuente + b.monto);
          else tBolsa = r2(tBolsa + b.monto);
        });
        e.no_catalogado.forEach(function (x) { tPuente = r2(tPuente + x.monto); });
      });
      data.puente_filas.forEach(function (f) { tPuente = r2(tPuente + (f.bruto || f.neto || 0)); });

      out.totales = {
        bruto: r2(data.empleados.reduce(function (s, e) { return s + e.bruto; }, 0)),
        a_repartir: r2(data.empleados.reduce(function (s, e) { return s + e.a_repartir; }, 0)),
        a_bolsa: tBolsa,
        puente: tPuente,
        trio: r2(data.trio.reduce(function (s, t) { return s + t.neto; }, 0)),
        empleados: data.empleados.length
      };
      out.totales.nomina = r2(out.totales.bruto + out.totales.trio);

      /* invariante de presentacion: los tres pedazos deben reconstruir el bruto.
         Si no cierra es bug del resolver, no del Excel -> INTEGRIDAD. */
      var recompuesto = r2(out.totales.a_repartir + out.totales.a_bolsa + out.totales.puente);
      var soloFilas = r2(data.puente_filas.reduce(function (s, f) { return s + (f.bruto || f.neto || 0); }, 0));
      if (Math.abs(r2(recompuesto - soloFilas) - out.totales.bruto) > 0.011) {
        out.fallas.integridad.push({ nivel: INTEGRIDAD, codigo: 'TOTALES_INCONSISTENTES',
          que: 'Los totales que mostraria la pantalla no reconstruyen el bruto',
          dato: 'reparte ' + out.totales.a_repartir.toFixed(2) + ' + bolsa ' + out.totales.a_bolsa.toFixed(2)
              + ' + puente ' + out.totales.puente.toFixed(2) + ' (de los cuales ' + soloFilas.toFixed(2)
              + ' son filas sueltas) ≠ bruto ' + out.totales.bruto.toFixed(2),
          accion: 'Error interno del resolver. No cargues. Avisa a Claude con el codigo TOTALES_INCONSISTENTES.' });
        out.resumen_fallas.integridad = out.fallas.integridad.length;
        out.ok = false; out.puede_enviar = false;
      }
    }
    return out;
  }

  return { resolver: resolver, norm: norm, num: num, colLetra: colLetra, NIVELES: { INTEGRIDAD: INTEGRIDAD, CLASIFICACION: CLASIFICACION, AVISO: AVISO } };
}));
