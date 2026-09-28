/* retardos/lib/pdf.js · Generador de hojas PDF de Retardos v2 (#334)
 *
 * JS puro, sin dependencias: corre igual en Node (pruebas), en el navegador
 * (panel RH) y dentro de un Code node de n8n (sin require). Por eso:
 *   - no usa Buffer ni require;
 *   - el fuente no lleva diagonales invertidas (el update_workflow del MCP de
 *     n8n se come un nivel de escape, CLAUDE.md §17 quirk 2c): los caracteres
 *     de control se arman con String.fromCharCode.
 *
 * Produce un PDF 1.4 de una o más páginas carta, Helvetica WinAnsi (acentos y ñ).
 * Uso: RetardosPDF.hoja(datosCaso) -> { base64, nombre, bytes }
 */
(function (raiz) {
  var NL = String.fromCharCode(10);
  var BS = String.fromCharCode(92);

  // WinAnsi: los acentos del español caen en el mismo código que latin1.
  function aLatin1(s) {
    var o = '';
    s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 8211 || c === 8212) o += '-';            // guiones largos: nunca en un documento
      else if (c === 8220 || c === 8221) o += '"';
      else if (c === 8216 || c === 8217) o += "'";
      else if (c === 8230) o += '...';
      else if (c < 256) o += s.charAt(i);
      else o += '?';
    }
    return o;
  }
  function esc(s) {
    s = aLatin1(s);
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '(' || ch === ')' || ch === BS) o += BS + ch; else o += ch;
    }
    return o;
  }
  // Ancho aproximado de Helvetica (promedio por carácter) para partir líneas.
  function partir(texto, tam, ancho) {
    var porLinea = Math.floor(ancho / (tam * 0.5));
    var palabras = aLatin1(texto).split(' '), lineas = [], cur = '';
    for (var i = 0; i < palabras.length; i++) {
      var p = palabras[i];
      if ((cur + ' ' + p).trim().length > porLinea) { if (cur) lineas.push(cur); cur = p; }
      else cur = (cur ? cur + ' ' : '') + p;
    }
    if (cur) lineas.push(cur);
    return lineas;
  }
  function b64(bin) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', o = '';
    for (var i = 0; i < bin.length; i += 3) {
      var a = bin.charCodeAt(i) & 255, b = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 255 : NaN,
          c = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 255 : NaN;
      o += A.charAt(a >> 2) + A.charAt(((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4));
      o += isNaN(b) ? '=' : A.charAt(((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6));
      o += isNaN(c) ? '=' : A.charAt(c & 63);
    }
    return o;
  }

  // Lienzo de páginas: acumula operaciones y salta de página solo.
  function Lienzo() {
    this.paginas = []; this.ops = []; this.y = 740; this.nueva = true;
  }
  Lienzo.prototype.saltoSiHaceFalta = function (alto) {
    if (this.y - alto < 60) { this.paginas.push(this.ops); this.ops = []; this.y = 740; }
  };
  Lienzo.prototype.texto = function (x, t, tam, negrita) {
    this.saltoSiHaceFalta(tam + 4);
    this.ops.push('BT /' + (negrita ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + x + ' ' + this.y + ' Td (' + esc(t) + ') Tj ET');
  };
  Lienzo.prototype.parrafo = function (t, tam, negrita) {
    var ls = partir(t, tam, 500);
    for (var i = 0; i < ls.length; i++) { this.texto(56, ls[i], tam, negrita); this.y -= tam + 4; }
    this.y -= 4;
  };
  Lienzo.prototype.linea = function (x1, x2) {
    this.ops.push('0.5 w ' + x1 + ' ' + this.y + ' m ' + x2 + ' ' + this.y + ' l S');
  };
  Lienzo.prototype.fin = function () { this.paginas.push(this.ops); return this.paginas; };

  function construir(paginas) {
    var objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    var kids = [], n = 5;
    for (var i = 0; i < paginas.length; i++) {
      var cont = paginas[i].join(NL) + NL + 'BT /F1 8 Tf 56 36 Td (Pagina ' + (i + 1) + ' de ' + paginas.length + ') Tj ET';
      var pid = n, cid = n + 1; n += 2;
      objs[cid] = '<< /Length ' + aLatin1(cont).length + ' >>' + NL + 'stream' + NL + aLatin1(cont) + NL + 'endstream';
      objs[pid] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>';
      kids.push(pid + ' 0 R');
    }
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + paginas.length + ' >>';
    var out = '%PDF-1.4' + NL + '%' + String.fromCharCode(226, 227, 207, 211) + NL, offs = [];
    for (var k = 1; k < objs.length; k++) {
      offs[k] = out.length;
      out += k + ' 0 obj' + NL + objs[k] + NL + 'endobj' + NL;
    }
    var xref = out.length;
    out += 'xref' + NL + '0 ' + objs.length + NL + '0000000000 65535 f ' + NL;
    for (var j = 1; j < objs.length; j++) out += ('0000000000' + offs[j]).slice(-10) + ' 00000 n ' + NL;
    out += 'trailer' + NL + '<< /Size ' + objs.length + ' /Root 1 0 R >>' + NL + 'startxref' + NL + xref + NL + '%%EOF' + NL;
    return out;
  }

  var TITULOS = {
    aviso: 'AVISO DE RETARDOS',
    carta_compromiso: 'CARTA COMPROMISO',
    acta: 'ACTA ADMINISTRATIVA',
    suspension: 'CITATORIO Y PROPUESTA DE MEDIDA DISCIPLINARIA'
  };
  var CUERPO = {
    aviso: 'Por medio del presente se le informa que el control de asistencia registró los retardos que se detallan abajo. Este aviso es informativo.',
    carta_compromiso: 'Reconozco los retardos que se detallan abajo y me comprometo a presentarme puntualmente a mi jornada conforme a mi horario de entrada. Entiendo que la reincidencia puede dar lugar a un acta administrativa conforme al Reglamento Interior de Trabajo.',
    acta: 'Se levanta la presente acta administrativa por los retardos que se detallan abajo, con fundamento en los artículos 20 y 134 fracciones I, III y V de la Ley Federal del Trabajo y en el Reglamento Interior de Trabajo. Antes de firmar, el trabajador puede manifestar lo que a su derecho convenga en el espacio de comentarios.',
    suspension: 'Por reincidencia en retardos después de documentos previos firmados, se cita al trabajador para ser oído antes de determinar una medida disciplinaria. Cualquier suspensión se aplicará conforme al Reglamento Interior de Trabajo y al artículo 423 fracción X de la Ley Federal del Trabajo, con un máximo de ocho días. La decisión es de Recursos Humanos.'
  };

  function hoja(d) {
    d = d || {};
    var acc = d.accion || 'aviso';
    var L = new Lienzo();
    L.texto(56, 'SERVICIOS FTS SA DE CV', 10, true); L.texto(420, 'Folio: ' + (d.folio || ''), 10, true); L.y -= 14;
    L.texto(56, 'Recursos Humanos', 9, false); L.texto(420, 'Fecha: ' + (d.fecha_emision || ''), 9, false); L.y -= 28;
    L.texto(56, TITULOS[acc] || 'DOCUMENTO', 15, true); L.y -= 24;
    L.parrafo('Nombre: ' + (d.nombre || '') + (d.puesto ? '   Puesto: ' + d.puesto : ''), 10, false);
    L.parrafo('Departamento: ' + (d.departamento || '') + '   Periodo: ' + (d.periodo || '') + '   Retardos en el periodo: ' + (d.retardos_n == null ? '' : d.retardos_n), 10, false);
    if (d.motivo_apertura === 'reincidencia') L.parrafo('Motivo: reincidencia después de un documento firmado y validado.', 10, true);
    L.y -= 4;
    L.parrafo(CUERPO[acc] || '', 10, false);
    L.y -= 6;
    // Tabla de retardos
    L.texto(56, 'Fecha', 9, true); L.texto(170, 'Hora de llegada', 9, true); L.texto(300, 'Hora de entrada', 9, true); L.texto(430, 'Minutos tarde', 9, true);
    L.y -= 6; L.linea(56, 556); L.y -= 12;
    var rs = d.retardos || [];
    for (var i = 0; i < rs.length; i++) {
      L.saltoSiHaceFalta(14);
      L.texto(56, rs[i].fecha, 9, false); L.texto(170, rs[i].llegada, 9, false); L.texto(300, rs[i].esperada, 9, false); L.texto(430, String(rs[i].minutos), 9, false);
      L.y -= 13;
    }
    if (acc === 'suspension' && d.accion_desde) {
      L.y -= 6; L.parrafo('Días de suspensión determinados por RH: ' + (d.dias_suspension || '') + ', del ' + d.accion_desde + ' al ' + (d.accion_hasta || '') + '.', 10, true);
    }
    L.y -= 10;
    if (acc !== 'aviso') {
      L.parrafo('Comentarios del trabajador (derecho a ser oído):', 10, true);
      for (var k = 0; k < 3; k++) { L.y -= 14; L.linea(56, 556); }
      L.y -= 34;
      var firmas = ['Firma del trabajador', 'Recursos Humanos'];
      if (d.requiere_testigos || acc === 'acta' || acc === 'suspension') firmas.push('Testigo 1', 'Testigo 2');
      firmas.push('Jefe directo');
      for (var f = 0; f < firmas.length; f += 2) {
        L.saltoSiHaceFalta(50);
        L.linea(56, 266); if (firmas[f + 1]) L.linea(330, 540);
        L.y -= 12;
        L.texto(56, firmas[f], 9, false); if (firmas[f + 1]) L.texto(330, firmas[f + 1], 9, false);
        L.y -= 40;
      }
      L.parrafo('Instrucción: responda al correo del folio ' + (d.folio || '') + ' con esta hoja firmada (PDF o foto clara), sin cambiar el asunto.', 8, false);
    }
    var bin = construir(L.fin());
    return { base64: b64(bin), nombre: (d.folio || 'retardos') + '-' + acc + '.pdf', bytes: bin.length, binario: bin };
  }

  var api = { hoja: hoja, _aLatin1: aLatin1, _b64: b64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RetardosPDF = api;
})(typeof window !== 'undefined' ? window : this);
