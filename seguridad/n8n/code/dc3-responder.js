/* seguridad/dc3-empleados · Code - Responder (#507 Etapa 3)
 * Solo lectura sobre Odoo: activos de la empresa 1. Deduplica en el servidor (por CURP
 * válida o, si no hay, por nombre normalizado; queda el registro de id mayor).
 *   buscar    → hasta 10 coincidencias. NUNCA trae la CURP: solo tiene_curp y curp_valida.
 *   detalle   → la persona elegida, con su CURP (solo en esta respuesta).
 *   faltantes → nombres y qué falta (sin CURP, CURP inválida, nombre sin separar). Sin CURP.
 * D1: la CURP vive en identification_id. D2: x_studio_apellido_paterno, _materno, x_studio_nombres.
 * Todo en try/catch: un throw aquí guardaría su entrada (con CURP) en un payload de error.
 */
try {
  var P = $('Code - Puerta').first().json;
  var CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/;
  var sinAcentos = function (s) { return s.normalize('NFD').split('').filter(function (c) { var k = c.charCodeAt(0); return k < 768 || k > 879; }).join(''); };
  var norm = function (s) { return sinAcentos(String(s || '')).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/ +/g, ' ').trim(); };
  // Para el PDF: mayúsculas sin acentos, pero la Ñ se queda (es parte del apellido).
  var nombrePdf = function (s) { return String(s || '').split('').map(function (c) { return (c === 'ñ' || c === 'Ñ') ? 'Ñ' : sinAcentos(c); }).join('').toUpperCase().replace(/[^A-ZÑ ]/g, ' ').replace(/ +/g, ' ').trim(); };
  var txt = function (v) { return (v === false || v == null) ? '' : String(v).trim(); };
  var m2o = function (v) { return Array.isArray(v) ? txt(v[1]) : ''; };
  var filas = $('Odoo - Empleados').all().map(function (i) { return i.json; }).filter(function (e) { return e && e.id; });
  var uno = {};
  filas.forEach(function (e) {
    var curp = txt(e.identification_id).toUpperCase().replace(/[^A-Z0-9]/g, '');
    var ap = nombrePdf(txt(e.x_studio_apellido_paterno)), am = nombrePdf(txt(e.x_studio_apellido_materno)), nom = nombrePdf(txt(e.x_studio_nombres));
    var r = { id: e.id, nombre: txt(e.name), ap: ap, am: am, nom: nom, curp: curp, curp_valida: CURP_RE.test(curp),
              puesto: txt(e.job_title) || m2o(e.job_id), separado: !!(ap && nom) };
    var llave = r.curp_valida ? 'C:' + curp : 'N:' + norm(r.nombre);
    if (!uno[llave] || uno[llave].id < r.id) uno[llave] = r;
  });
  var lista = Object.keys(uno).map(function (k) { return uno[k]; });
  var falta = function (r) { var f = []; if (!r.separado) f.push('nombre sin separar'); if (!r.curp) f.push('sin CURP'); else if (!r.curp_valida) f.push('CURP inválida'); return f; };
  var dc3 = function (r) { return r.separado ? [r.ap, r.am, r.nom].filter(Boolean).join(' ') : null; };

  if (P.accion === 'buscar') {
    var q = norm(P.q);
    if (q.length < 3) return [{ json: { ok: true, resultados: [] } }];
    var qc = q.replace(/ /g, '');
    var res = lista.filter(function (r) {
      return norm(r.nombre).indexOf(q) >= 0 || (dc3(r) && norm(dc3(r)).indexOf(q) >= 0) || (qc.length >= 4 && r.curp && r.curp.indexOf(qc) === 0);
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); }).slice(0, 10).map(function (r) {
      return { id: r.id, nombre: r.nombre, nombre_dc3: dc3(r), puesto: r.puesto, tiene_curp: !!r.curp, curp_valida: r.curp_valida, nombre_separado: r.separado };
    });
    return [{ json: { ok: true, resultados: res } }];
  }
  if (P.accion === 'detalle') {
    var r = lista.filter(function (x) { return x.id === P.id; })[0];
    if (!r) return [{ json: { ok: false, error: 'NO_ENCONTRADO' } }];
    return [{ json: { ok: true, empleado: { id: r.id, nombre: r.nombre, ap: r.ap, am: r.am, nom: r.nom, curp: r.curp, curp_valida: r.curp_valida, puesto: r.puesto } } }];
  }
  var f = lista.map(function (r) { return { nombre: r.nombre, falta: falta(r) }; }).filter(function (x) { return x.falta.length; })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
  return [{ json: { ok: true, activos: lista.length, completos: lista.length - f.length, faltan: f } }];
} catch (e) {
  return [{ json: { ok: false, error: 'FALLO_RESPUESTA' } }];
}
