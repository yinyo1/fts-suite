/* ═══ Nómina USA · lector del registro de nómina de Auris (#448, MVP paso 4) ═══
 * Todavía no conocemos el formato real de Auris. Por eso el mapeo de columnas NO está aquí:
 * viene de nomina_usa.config conciliacion_formato ({separador, columnas:{campo:[alias…]}}) y
 * se cambia sin tocar código cuando llegue el primer registro real.
 * Campos: employee_id, persona, neto, imp_empleado, imp_patron, fee. Obligatorios: persona y neto.
 * Si falta una columna obligatoria o un número no se puede leer, FALLA con nombre propio:
 * nunca devuelve una lista vacía que se confunda con «no había nada» (CLAUDE.md §20 #11, #16).
 * La base vuelve a validar cada número y calcula los totales ella (a_auris_importar).
 * Navegador y Node, sin dependencias.
 */
(function (raiz) {
  'use strict';
  var CAMPOS = ['employee_id', 'persona', 'neto', 'imp_empleado', 'imp_patron', 'fee'];
  var OBLIGATORIOS = ['persona', 'neto'];
  var NUMEROS = ['neto', 'imp_empleado', 'imp_patron', 'fee'];

  function filasCsv(texto, sep) {
    var out = [], fila = [], celda = '', q = false, i, c;
    texto = String(texto || '').replace(/^﻿/, '');
    for (i = 0; i < texto.length; i++) {
      c = texto.charAt(i);
      if (q) {
        if (c === '"') { if (texto.charAt(i + 1) === '"') { celda += '"'; i++; } else q = false; }
        else celda += c;
      } else if (c === '"') q = true;
      else if (c === sep) { fila.push(celda); celda = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto.charAt(i + 1) === '\n') i++;
        fila.push(celda); out.push(fila); fila = []; celda = '';
      } else celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); out.push(fila); }
    return out.filter(function (f) { return f.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function centavos(n) { return Math.round(n * 100) / 100; }
  // «$1,080.00» → 1080 · «(12.50)» → -12.5 · vacío → 0 · otra cosa → NaN
  function numero(s) {
    var t = String(s == null ? '' : s).trim();
    if (t === '') return 0;
    var neg = /^\(.*\)$/.test(t);
    t = t.replace(/[()$\s]/g, '').replace(/,/g, '');
    if (!/^-?[0-9]*[.]?[0-9]+$/.test(t)) return NaN;
    var n = Number(t);
    return neg ? -n : n;
  }

  function leer(texto, formato) {
    var f = formato || {}, sep = f.separador || ',', cols = f.columnas || {};
    var filas = filasCsv(texto, sep);
    if (!filas.length) return { ok: false, error: 'REGISTRO_VACIO', mensaje: 'El archivo no trae renglones.' };
    var cab = filas[0].map(norm), idx = {};
    CAMPOS.forEach(function (k) {
      var alias = [].concat(cols[k] || []).map(norm);
      idx[k] = cab.findIndex(function (h) { return alias.indexOf(h) >= 0; });
    });
    var faltan = OBLIGATORIOS.filter(function (k) { return idx[k] < 0; });
    if (faltan.length) return { ok: false, error: 'COLUMNA_FALTANTE', faltan: faltan, encabezados: filas[0],
      mensaje: 'No encontré la columna ' + faltan.join(', ') + '. Agrega su nombre en conciliacion_formato.columnas.' };
    var out = [], tot = { neto: 0, imp_empleado: 0, imp_patron: 0, fee: 0 };
    for (var r = 1; r < filas.length; r++) {
      var x = { persona: String(filas[r][idx.persona] || '').trim() };
      if (idx.employee_id >= 0) { var e = String(filas[r][idx.employee_id] || '').trim(); x.employee_id = /^[0-9]+$/.test(e) ? Number(e) : null; }
      for (var j = 0; j < NUMEROS.length; j++) {
        var k = NUMEROS[j], v = idx[k] >= 0 ? numero(filas[r][idx[k]]) : 0;
        if (isNaN(v)) return { ok: false, error: 'NUMERO_INVALIDO', fila: r + 1, campo: k, valor: filas[r][idx[k]],
          mensaje: 'Renglón ' + (r + 1) + ': «' + filas[r][idx[k]] + '» no es un número (' + k + ').' };
        x[k] = centavos(v); tot[k] += v;
      }
      out.push(x);
    }
    var t = { neto: centavos(tot.neto), imp_empleado: centavos(tot.imp_empleado), imp_patron: centavos(tot.imp_patron), fee: centavos(tot.fee) };
    t.impuestos = centavos(t.imp_empleado + t.imp_patron);
    t.total = centavos(t.neto + t.impuestos + t.fee);
    return { ok: true, filas: out, totales: t, columnas: idx };
  }

  // Registro de EJEMPLO (no es de Auris; sirve para la guía y para practicar).
  var EJEMPLO = 'Employee,Employee ID,Net Pay,Employee Taxes,Employer Taxes,Fee\n' +
    'Ricardo,98,988.00,180.50,80.40,0\nMateo,75,1163.27,210.10,95.25,0\nJosé Luis,79,996.73,190.00,85.00,0\nRissia,97,507.59,90.00,40.00,0\nAuris service fee,,0,0,0,45.00\n';

  var api = { leer: leer, numero: numero, filasCsv: filasCsv, EJEMPLO: EJEMPLO, CAMPOS: CAMPOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.NominaUSA = raiz.NominaUSA || {}; raiz.NominaUSA.auris = api;
})(typeof window !== 'undefined' ? window : globalThis);
