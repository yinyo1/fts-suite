// ═══ Nómina · Incidencias — escribir un .xlsx sin librerías ═══
//
// POR QUÉ ESTE ARCHIVO EXISTE. El archivo del despacho es un CSV, y un CSV se abre
// en Excel pero no puede tener DOS pestañas. Magaly necesita revisar la lista antes
// de mandarla, y Ulises necesita poder profundizar en los números detrás de cada
// instrucción; eso son dos vistas del mismo dato, o sea dos hojas.
//
// POR QUÉ SIN LIBRERÍA. Meter SheetJS por CDN sería media hora menos de trabajo y
// una dependencia externa más en un botón que mueve nómina. Ya nos pasó (CLAUDE.md
// §11 #14): un CDN que empieza a devolver 404 deja una función en bypass silencioso
// durante semanas sin que nadie lo note, porque a nadie le falla en pantalla. Un
// .xlsx es un ZIP con unos XML dentro; escribirlo a mano son ~150 líneas que no se
// caen nunca y que corren igual en el navegador que en el gate.
//
// El ZIP se escribe con método STORE (sin comprimir). Excel lo abre igual, y ahorra
// implementar DEFLATE. Un archivo de 30 personas pesa ~20 KB; comprimirlo sería
// optimizar lo que no duele.
//
// PURO: sin DOM, sin red. Devuelve bytes; quien los baje decide cómo.

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NomExcel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ─── Bytes ───
  function utf8(s) {
    s = String(s);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    // Sin TextEncoder (navegadores viejos): codificación manual, que es preferible a
    // asumir que cada carácter es un byte — el primer "Martínez" rompería el ZIP.
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var c2 = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  var TABLA_CRC = (function () {
    var t = new Int32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  // ─── ZIP (método STORE) ───
  function zip(entradas) {
    var locales = [], central = [], offset = 0, i;

    function u16(a, v) { a.push(v & 255, (v >> 8) & 255); }
    function u32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
    function empuja(a, bytes) { for (var j = 0; j < bytes.length; j++) a.push(bytes[j]); }

    for (i = 0; i < entradas.length; i++) {
      var nom = utf8(entradas[i].nombre);
      var dat = utf8(entradas[i].texto);
      var crc = crc32(dat);

      var lh = [];
      u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0x0800); u16(lh, 0);  // 0x0800 = nombre en UTF-8
      u16(lh, 0); u16(lh, 0);                                          // hora y fecha: 0 a propósito,
      u32(lh, crc); u32(lh, dat.length); u32(lh, dat.length);          // el mismo contenido da el mismo
      u16(lh, nom.length); u16(lh, 0);                                 // archivo, byte por byte
      empuja(lh, nom); empuja(lh, dat);
      locales.push(lh);

      var cd = [];
      u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0x0800); u16(cd, 0);
      u16(cd, 0); u16(cd, 0);
      u32(cd, crc); u32(cd, dat.length); u32(cd, dat.length);
      u16(cd, nom.length); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0);
      u32(cd, 0); u32(cd, offset);
      empuja(cd, nom);
      central.push(cd);

      offset += lh.length;
    }

    var todo = [], k;
    for (i = 0; i < locales.length; i++) for (k = 0; k < locales[i].length; k++) todo.push(locales[i][k]);
    var inicioCentral = todo.length;
    for (i = 0; i < central.length; i++) for (k = 0; k < central[i].length; k++) todo.push(central[i][k]);
    var tamCentral = todo.length - inicioCentral;

    var fin = [];
    u32(fin, 0x06054b50); u16(fin, 0); u16(fin, 0);
    u16(fin, entradas.length); u16(fin, entradas.length);
    u32(fin, tamCentral); u32(fin, inicioCentral); u16(fin, 0);
    for (k = 0; k < fin.length; k++) todo.push(fin[k]);

    return new Uint8Array(todo);
  }

  // ─── XML ───
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Excel rechaza el archivo entero si una celda trae un carácter de control.
      // Un solo byte raro pegado desde WhatsApp no puede tumbar la nómina.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function letraCol(n) {           // 0 -> A, 26 -> AA
    var s = '';
    n = n + 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // Estilos, por índice: 0 normal · 1 encabezado (blanco sobre azul) · 2 negritas ·
  // 3 texto que se ajusta al alto de la celda.
  var ESTILOS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
        '<alignment wrapText="1" vertical="top"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  // Una celda es un valor suelto (texto) o { v, n:true si es número, s: estilo }.
  function celdaXml(ref, c) {
    var o = (c && typeof c === 'object' && !(c instanceof Date)) ? c : { v: c };
    var s = o.s ? ' s="' + o.s + '"' : '';
    if (o.n) {
      var n = Number(o.v);
      if (!isFinite(n)) n = 0;
      return '<c r="' + ref + '"' + s + '><v>' + n + '</v></c>';
    }
    var t = (o.v === undefined || o.v === null) ? '' : String(o.v);
    if (t === '') return '<c r="' + ref + '"' + s + '/>';
    // inlineStr en vez de sharedStrings: una tabla de cadenas compartidas ahorraría
    // bytes y agregaría un índice más que puede quedar desalineado. Aquí no duele.
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
      esc(t) + '</t></is></c>';
  }

  function hojaXml(hoja) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (hoja.congelar) {
      x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + hoja.congelar +
        '" topLeftCell="A' + (hoja.congelar + 1) + '" activePane="bottomLeft" state="frozen"/>' +
        '</sheetView></sheetViews>';
    }
    if (hoja.anchos && hoja.anchos.length) {
      x += '<cols>';
      for (var a = 0; a < hoja.anchos.length; a++) {
        x += '<col min="' + (a + 1) + '" max="' + (a + 1) + '" width="' + hoja.anchos[a] + '" customWidth="1"/>';
      }
      x += '</cols>';
    }
    x += '<sheetData>';
    var F = hoja.filas || [];
    for (var r = 0; r < F.length; r++) {
      x += '<row r="' + (r + 1) + '">';
      for (var c = 0; c < F[r].length; c++) x += celdaXml(letraCol(c) + (r + 1), F[r][c]);
      x += '</row>';
    }
    return x + '</sheetData></worksheet>';
  }

  // El nombre de una pestaña de Excel: máximo 31 caracteres y sin : \ / ? * [ ]
  function nombreHoja(s, i) {
    var n = String(s || ('Hoja' + (i + 1))).replace(/[:\\\/?*\[\]]/g, '-').slice(0, 31);
    return n || ('Hoja' + (i + 1));
  }

  function libro(hojas) {
    hojas = hojas || [];
    var i, entradas = [];
    var tiposHojas = '', relsHojas = '', defsHojas = '';

    for (i = 0; i < hojas.length; i++) {
      var n = i + 1;
      entradas.push({ nombre: 'xl/worksheets/sheet' + n + '.xml', texto: hojaXml(hojas[i]) });
      tiposHojas += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      relsHojas += '<Relationship Id="rId' + n + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
        'Target="worksheets/sheet' + n + '.xml"/>';
      defsHojas += '<sheet name="' + esc(nombreHoja(hojas[i].nombre, i)) + '" sheetId="' + n +
        '" r:id="rId' + n + '"/>';
    }
    var idEstilos = 'rId' + (hojas.length + 1);

    entradas.unshift({ nombre: '[Content_Types].xml', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      tiposHojas +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>' });

    entradas.push({ nombre: '_rels/.rels', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' });

    entradas.push({ nombre: 'xl/workbook.xml', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + defsHojas + '</sheets></workbook>' });

    entradas.push({ nombre: 'xl/_rels/workbook.xml.rels', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      relsHojas +
      '<Relationship Id="' + idEstilos + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' });

    entradas.push({ nombre: 'xl/styles.xml', texto: ESTILOS });

    return zip(entradas);
  }

  return { libro: libro, crc32: crc32, utf8: utf8, letraCol: letraCol, nombreHoja: nombreHoja };
});
