/* ═══ Regla 15 · lo que ve el cliente no lleva cálculos (V1.57b, fts-conceptualizador#12) ═══
 *
 * Decreto de Esteban (19-oct, comentario 6270293704): en todo lo que ve el cliente (PDF, renglones y nota de la orden en
 * Odoo, correo, versión cliente de la vista ejecutiva) no van horas × días × personas, horas de traslado ni cómo se cobran,
 * comida no cobrada ni horas efectivas, tarifas, costos, márgenes, comisiones, «al costo / sin utilidad», fórmulas de
 * gasolina ni niveles de precio. Los cálculos viven en el chat, el machote, los supuestos y el comentario INTERNO.
 *
 * Decisiones de Esteban sobre la fase 1 (comentario 6273937527):
 *   · también los NOMBRES de sección y los TÍTULOS de renglón pasan por aquí;
 *   · BLOQUEA desde el día 1: marca la frase, propone el texto limpio y deja LIBERARLA con un clic, registrando quién y por qué.
 *
 * Un solo archivo para los tres lados (motor, pantalla y n8n), así que NO lleva barras invertidas: por el MCP de n8n se
 * colapsan (§17 2c de la suite). Por eso [0-9] en vez de la clase de dígito, espacio literal y lookarounds en vez del
 * límite de palabra. `pruebas/regla15-v157b.js` revisa que siga sin barras y que la copia de fts-suite sea idéntica.
 *
 *   revisar(texto)                → [{patron, nombre, frase}]          ¿qué cálculo trae este texto?
 *   limpiar(texto)                → texto sin los cálculos ('' = el texto entero era cálculo)
 *   revisarCotizacion(c, liberadas) → {hallazgos:[{id, donde, original, limpio, patrones, frases, liberada}], pendientes}
 *   aplicar(c, decisiones)        → la cotización con el texto limpio donde se eligió «Usar el texto limpio»
 */
var CzRegla15 = (function () {
  'use strict';
  // Letras para los lookarounds (en vez del límite de palabra): así «N3» no casa en «AN3B» ni «margen» en «margenes»… sí casa.
  var L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  var PATRONES = [
    { id: 'multiplica', nombre: 'multiplicación (horas × días, personas × horas)', re: new RegExp('[0-9] ?[×] ?[0-9]|(?<=[0-9]) ?x ?(?=[0-9])') },
    { id: 'igual_horas', nombre: 'resultado de horas («= 68 h»)', re: /= ?[0-9]+([.,][0-9]+)? ?h/ },
    { id: 'h_por_persona', nombre: 'horas por persona', re: /h(oras?)? por persona|hours? per person/i },
    { id: 'horas_tipo', nombre: 'horas en planta, efectivas, diarias o por sentido', re: /[0-9]+([.,][0-9]+)? ?h(oras?)? (en planta|efectivas|diarias|por d[ií]a|por sentido|de traslado)/i },
    { id: 'traslado_horas', nombre: 'horas de traslado', re: new RegExp('traslado[^.;]{0,40}[0-9]+([.,][0-9]+)? ?h(oras?)?(?![' + L + '])', 'i') },
    { id: 'al_doble', nombre: '«al doble» (cómo se cobra)', re: /al doble|pagad[oa]s? (al )?doble|double time|at double/i },
    { id: 'comida_no', nombre: 'comida que no se cobra', re: /no se cobra|no cobrad[oa]|not charged|unpaid lunch/i },
    { id: 'efectivas', nombre: 'horas efectivas', re: new RegExp('(?<![' + L + '])efectiv[oa]s(?![' + L + '])', 'i') },
    { id: 'al_costo', nombre: '«al costo»', re: new RegExp('al costo|(?<![' + L + '])at cost(?![' + L + '])', 'i') },
    { id: 'sin_utilidad', nombre: '«sin utilidad»', re: /sin utilidad|sin rentabilidad|no markup|without markup|no profit/i },
    { id: 'comision', nombre: 'comisión', re: /comisi[oó]n|commission(?!ing)/i },
    { id: 'margen', nombre: 'margen', re: new RegExp('(?<![' + L + '])(margen|margin)', 'i') },
    { id: 'tarifa', nombre: 'tarifa', re: /tarifa|hourly rate|rate per hour/i },
    { id: 'precio_hora', nombre: 'precio por hora', re: /[$] ?[0-9][0-9,.]* ?(MXN |USD )?[/] ?h/i },
    { id: 'km', nombre: 'kilómetros o rendimiento', re: new RegExp('[0-9]+([.,][0-9]+)? ?km(?![' + L + '])|km ?[÷/]|km[/]l', 'i') },
    { id: 'viajes', nombre: 'número de viajes', re: /[0-9]+ viajes? redondos?|[0-9]+ round trips?/i },
    { id: 'division', nombre: 'división', re: /÷/ },
    { id: 'internacion', nombre: 'factor de internación', re: /factor de internaci[oó]n|internaci[oó]n ?×/i },
    { id: 'nivel', nombre: 'nivel de precio (N1–N5)', re: new RegExp('(?<![' + L + '0-9])N[1-5](?![' + L + '0-9])') }
  ];

  function revisar(texto) {
    var t = String(texto == null ? '' : texto), out = [];
    PATRONES.forEach(function (p) { var m = t.match(p.re); if (m) out.push({ patron: p.id, nombre: p.nombre, frase: m[0] }); });
    return out;
  }
  var malo = function (s) { return PATRONES.some(function (p) { return p.re.test(s); }); };

  /* El texto limpio, por pasos y sin inventar nada: (1) se tiran los paréntesis que traen un cálculo; (2) se quitan los
   * modificadores que dicen cómo se cobra («pagado al doble», «(al costo, sin utilidad)», «que no se cobra»); (3) se tira
   * la cláusula que siga trayendo un cálculo; (4) se tira la oración que se quedó vacía. Lo demás queda igual. */
  var FRASES = [
    / ?[(]?(se cobran? |cobrad[oa]s? )?al costo,? ?(sin utilidad|sin rentabilidad)?( ni comisi[oó]n)?[)]?/gi,
    / ?[(]?sin utilidad( ni comisi[oó]n)?[)]?/gi,
    / (pagad[oa]s? )?al doble( de la hora normal)?/gi,
    / ?que no se cobra| no cobrad[oa]s?/gi,
    / ?[(]?at cost,? ?(no markup)?[)]?/gi
  ];
  function limpiarOracion(s) {
    var x = String(s);
    x = x.replace(/ ?[(][^()]*[)]/g, function (g) { return malo(g) ? '' : g; });
    FRASES.forEach(function (re) { x = x.replace(re, ''); });
    // cláusulas: se conserva el separador de adelante de cada una
    var partes = x.split(/(, |; |: | · | más | plus )/), quedan = [];
    for (var i = 0; i < partes.length; i += 2) {
      var c = partes[i], sep = i ? partes[i - 1] : '';
      if (malo(c)) continue;
      quedan.push(quedan.length ? sep + c : c);
    }
    x = quedan.join('');
    x = x.replace(/[(] *[)]/g, '').replace(/ {2,}/g, ' ').replace(/ ([,.;:])/g, '$1');
    x = x.replace(/^[ ,.;:·]+|[ ,;:·]+$/g, '');
    return x.trim();
  }
  function limpiar(texto) {
    var t = String(texto == null ? '' : texto);
    if (!malo(t)) return t;
    var fin = /[.]$/.test(t.trim());
    var oraciones = t.split(/(?<=[.]) (?=[A-ZÁÉÍÓÚÑ0-9])/);
    // En un texto de varias oraciones, la que conserva menos del 35 % de su largo era el cálculo: se va entera («Los gastos de
    // traslado se cobran al costo, sin utilidad: 12 viajes…» no se queda como «Los gastos de traslado.»).
    var varias = oraciones.length > 1;
    var q = oraciones.map(function (o) { var p = /[.]$/.test(o); var l = limpiarOracion(o.replace(/[.]$/, ''));
      if (varias && malo(o) && l.length < o.length * 0.35) l = ''; return l ? l + (p ? '.' : '') : ''; }).filter(Boolean);
    var r = q.join(' ').trim();
    if (r && fin && !/[.]$/.test(r)) r += '.';
    if (r && !fin) r = r.replace(/[.]$/, '');
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  /* Huella corta y estable (sin crypto: corre igual en el navegador y en n8n). */
  function id(donde, original) {
    var s = donde + '|' + original, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'r15-' + h.toString(36);
  }
  var NL = String.fromCharCode(10);
  /* Las piezas de texto que ve el cliente, con dónde viven. En un texto HTML, cada trozo entre etiquetas. */
  function piezas(c) {
    var out = [], k = 0;
    var linea = function (donde, txt, sitio) { if (String(txt || '').trim()) out.push({ donde: donde, original: String(txt), sitio: sitio }); };
    (c.bloques || []).forEach(function (b, i) {
      if (b.display_type === 'line_section') { k++; linea('Sección ' + k + ' · nombre', b.nombre, { bloque: i, linea: 0 }); return; }
      if (b.display_type) { linea('Nota ' + (i + 1), b.nombre, { bloque: i, linea: 0 }); return; }
      var nv = 0;
      String(b.nombre || '').split(NL).forEach(function (l, j) {
        var txt = l.replace(/^- /, '');
        if (/:$/.test(l.trim()) && j) return;   // «El servicio incluye:»
        linea('Partida ' + k + ' · ' + (j ? 'viñeta ' + (++nv) : 'título'), txt, { bloque: i, linea: j });
      });
    });
    if (c.opcionales) {
      linea('Opcionales · título', c.opcionales.titulo, { opc: 'titulo' });
      linea('Opcionales · nota', c.opcionales.nota, { opc: 'nota' });
      (c.opcionales.lineas || []).forEach(function (l, i) { String(l.nombre || '').split(NL).forEach(function (x, j) { if (!(/:$/.test(x.trim()) && j)) linea('Opcional ' + (i + 1) + (j ? ' · viñeta ' + j : ' · título'), x.replace(/^- /, ''), { opcl: i, linea: j }); }); });
    }
    var html = function (donde, h, campo, base) {
      String(h || '').split(/(<[^>]+>)/).forEach(function (seg, j) { if (seg.charAt(0) !== '<') linea(donde, seg, { campo: campo, base: base, seg: j }); });
    };
    html('Nota de la orden', c.nota_orden, 'nota_orden');
    linea('Descripción del proyecto', c.descripcion_proyecto, { campo: 'descripcion_proyecto' });
    var X = c.x_fts || {};
    ['x_fts_titulo', 'x_fts_detalle', 'x_fts_lugar'].forEach(function (f) { linea('PDF · ' + f.slice(6), X[f], { campo: f, base: 'x_fts' }); });
    ['x_fts_clave', 'x_fts_hitos'].forEach(function (f) { String(X[f] || '').split(NL).forEach(function (r, j) { r.split('|').forEach(function (v, q) { linea('PDF · ' + f.slice(6) + ' ' + (j + 1), v, { campo: f, base: 'x_fts', fila: j, col: q }); }); }); });
    html('PDF · condiciones', X.x_fts_condiciones_html, 'x_fts_condiciones_html', 'x_fts');
    html('PDF · condiciones legales', X.x_fts_legal_html, 'x_fts_legal_html', 'x_fts');
    (X.etiquetas || []).forEach(function (e, i) { String(e.texto || '').split('|').forEach(function (v, q) { linea('PDF · etiqueta partida ' + ((e.seccion || 0) + 1), v.trim(), { etiqueta: i, col: q }); }); });
    return out;
  }
  function liberadaEn(liberadas, h) {
    return (liberadas || []).some(function (x) { return x && (x.id === h.id || String(x.original || '') === h.original); });
  }
  function revisarCotizacion(c, liberadas) {
    var hall = [], vistos = {};
    piezas(c || {}).forEach(function (p) {
      var r = revisar(p.original); if (!r.length) return;
      var h = { id: id(p.donde, p.original), donde: p.donde, original: p.original, limpio: limpiar(p.original),
        patrones: r.map(function (x) { return x.patron; }), frases: r.map(function (x) { return x.frase; }), sitio: p.sitio };
      if (vistos[h.id]) return; vistos[h.id] = 1;
      h.liberada = liberadaEn(liberadas, h);
      hall.push(h);
    });
    return { hallazgos: hall, pendientes: hall.filter(function (h) { return !h.liberada; }).length };
  }
  /* Reemplaza cada pieza por su texto limpio donde la persona eligió «Usar el texto limpio». Un texto limpio vacío tira la
   * viñeta entera. La suma y los precios NO se tocan: solo texto. */
  function aplicar(c, decisiones) {
    // Por id o por el texto original: una decisión de la vuelta anterior sigue valiendo aunque la partida cambie de lugar.
    var D = {}, O = {}; (decisiones || []).forEach(function (d) { if (d && d.uso === 'limpio') { if (d.id) D[d.id] = d; if (d.original) O[d.original] = d; } });
    var x = JSON.parse(JSON.stringify(c || {}));
    var r = revisarCotizacion(x, []);
    // De atrás hacia adelante: borrar una viñeta o vaciar un <li> no recorre los índices de lo que falta por cambiar.
    r.hallazgos.slice().reverse().forEach(function (h) {
      if (!D[h.id] && !O[h.original]) return;
      var s = h.sitio, nuevo = h.limpio;
      var cambiaLineas = function (texto) {
        var L = String(texto).split(NL);
        if (nuevo) L[s.linea] = (s.linea && /^- /.test(L[s.linea]) ? '- ' : '') + nuevo; else L.splice(s.linea, 1);
        return L.join(NL);
      };
      if (s.bloque !== undefined) x.bloques[s.bloque].nombre = cambiaLineas(x.bloques[s.bloque].nombre);
      else if (s.opc) x.opcionales[s.opc] = nuevo;
      else if (s.opcl !== undefined) x.opcionales.lineas[s.opcl].nombre = cambiaLineas(x.opcionales.lineas[s.opcl].nombre);
      else if (s.etiqueta !== undefined) { var E = x.x_fts.etiquetas[s.etiqueta], V = String(E.texto).split('|'); V[s.col] = (V[s.col].charAt(0) === ' ' ? ' ' : '') + nuevo; E.texto = V.filter(function (v) { return v.trim(); }).join('|'); }
      else if (s.seg !== undefined) {
        var obj = s.base === 'x_fts' ? x.x_fts : x, P = String(obj[s.campo]).split(/(<[^>]+>)/);
        P[s.seg] = nuevo; obj[s.campo] = P.join('');
      } else if (s.fila !== undefined) {
        var F = String(x.x_fts[s.campo]).split(NL), C = F[s.fila].split('|'); C[s.col] = nuevo; F[s.fila] = C.join('|'); x.x_fts[s.campo] = F.join(NL);
      } else if (s.base === 'x_fts') x.x_fts[s.campo] = nuevo;
      else x[s.campo] = nuevo;
    });
    var vacio = function (h) { return String(h || '').replace(/<li> *<[/]li>|<p> *<[/]p>/g, ''); };
    x.nota_orden = x.nota_orden === undefined ? undefined : vacio(x.nota_orden);
    if (x.x_fts) ['x_fts_condiciones_html', 'x_fts_legal_html'].forEach(function (f) { if (x.x_fts[f] !== undefined) x.x_fts[f] = vacio(x.x_fts[f]); });
    return x;
  }
  return { PATRONES: PATRONES, revisar: revisar, limpiar: limpiar, revisarCotizacion: revisarCotizacion, aplicar: aplicar, id: id };
})();
// Se usa igual en el motor (require), en la pantalla (window.CzRegla15) y antepuesto a un Code de n8n (la constante).
if (typeof module === 'object' && module && module.exports) module.exports = CzRegla15;
if (typeof window !== 'undefined') window.CzRegla15 = CzRegla15;
