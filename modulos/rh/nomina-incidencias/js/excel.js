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
  // La fecha de las entradas es FIJA, no la de hoy: así el mismo contenido produce el
  // mismo archivo byte por byte, que es lo que hace comparable un despacho contra otro.
  // Pero fija NO quiere decir cero: un 0 en el campo de fecha DOS es el día 0 del mes 0
  // —una fecha que no existe— y un lector estricto ante eso decide REPARAR el archivo;
  // al repararlo, tira el formato. Empaquetado DOS:
  //   fecha = ((año−1980)<<9) | (mes<<5) | día     hora = (h<<11) | (min<<5) | (seg/2)
  var FECHA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;   // 2026-01-01
  var HORA_DOS  = (12 << 11);                            // 12:00:00

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
      u16(lh, HORA_DOS); u16(lh, FECHA_DOS);
      u32(lh, crc); u32(lh, dat.length); u32(lh, dat.length);
      u16(lh, nom.length); u16(lh, 0);
      empuja(lh, nom); empuja(lh, dat);
      locales.push(lh);

      var cd = [];
      u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0x0800); u16(cd, 0);
      u16(cd, HORA_DOS); u16(cd, FECHA_DOS);
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
    // El orden de los hijos de styleSheet lo fija el esquema y NO es libre:
    // numFmts, fonts, fills, borders, cellStyleXfs, cellXfs, cellStyles, dxfs,
    // tableStyles. Los tres vacíos los escribe cualquier generador real; van para que
    // el archivo no se distinga de uno de fábrica.
    '<numFmts count="0"/>' +
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
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF9BA7B8"/></left>' +
             '<right style="thin"><color rgb="FF9BA7B8"/></right>' +
             '<top style="thin"><color rgb="FF9BA7B8"/></top>' +
             '<bottom style="thin"><color rgb="FF9BA7B8"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
        '<alignment wrapText="1" vertical="top"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/>' +
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>' +
    '</styleSheet>';

  // ─── El tema ───
  // Copiado LITERAL de un archivo generado por una herramienta real, sin editar una
  // coma. Es plantilla: define la paleta y las fuentes por defecto del documento, y
  // todo generador de verdad la escribe. Nuestros estilos NO la referencian —usan
  // colores rgb explícitos— pero un .xlsx sin tema no se parece a ninguno, y ahí es
  // donde un lector estricto decide repararlo y tirar el formato. Escribirlo a mano
  // sería peor que no tenerlo: un tema mal formado sí rompe el archivo entero.
  // Por eso se COPIA, no se redacta.
  var TEMA = '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">  <a:themeElements>    <a:clrScheme name="Office">      <a:dk1>        <a:sysClr val="windowText" lastClr="000000"/>      </a:dk1>      <a:lt1>        <a:sysClr val="window" lastClr="FFFFFF"/>      </a:lt1>      <a:dk2>        <a:srgbClr val="1F497D"/>      </a:dk2>      <a:lt2>        <a:srgbClr val="EEECE1"/>      </a:lt2>      <a:accent1>        <a:srgbClr val="4F81BD"/>      </a:accent1>      <a:accent2>        <a:srgbClr val="C0504D"/>      </a:accent2>      <a:accent3>        <a:srgbClr val="9BBB59"/>      </a:accent3>      <a:accent4>        <a:srgbClr val="8064A2"/>      </a:accent4>      <a:accent5>        <a:srgbClr val="4BACC6"/>      </a:accent5>      <a:accent6>        <a:srgbClr val="F79646"/>      </a:accent6>      <a:hlink>        <a:srgbClr val="0000FF"/>      </a:hlink>      <a:folHlink>        <a:srgbClr val="800080"/>      </a:folHlink>    </a:clrScheme>    <a:fontScheme name="Office">      <a:majorFont>        <a:latin typeface="Cambria"/>        <a:ea typeface=""/>        <a:cs typeface=""/>        <a:font script="Jpan" typeface="&#xFF2D;&#xFF33; &#xFF30;&#x30B4;&#x30B7;&#x30C3;&#x30AF;"/>        <a:font script="Hang" typeface="&#xB9D1;&#xC740; &#xACE0;&#xB515;"/>        <a:font script="Hans" typeface="&#x5B8B;&#x4F53;"/>        <a:font script="Hant" typeface="&#x65B0;&#x7D30;&#x660E;&#x9AD4;"/>        <a:font script="Arab" typeface="Times New Roman"/>        <a:font script="Hebr" typeface="Times New Roman"/>        <a:font script="Thai" typeface="Tahoma"/>        <a:font script="Ethi" typeface="Nyala"/>        <a:font script="Beng" typeface="Vrinda"/>        <a:font script="Gujr" typeface="Shruti"/>        <a:font script="Khmr" typeface="MoolBoran"/>        <a:font script="Knda" typeface="Tunga"/>        <a:font script="Guru" typeface="Raavi"/>        <a:font script="Cans" typeface="Euphemia"/>        <a:font script="Cher" typeface="Plantagenet Cherokee"/>        <a:font script="Yiii" typeface="Microsoft Yi Baiti"/>        <a:font script="Tibt" typeface="Microsoft Himalaya"/>        <a:font script="Thaa" typeface="MV Boli"/>        <a:font script="Deva" typeface="Mangal"/>        <a:font script="Telu" typeface="Gautami"/>        <a:font script="Taml" typeface="Latha"/>        <a:font script="Syrc" typeface="Estrangelo Edessa"/>        <a:font script="Orya" typeface="Kalinga"/>        <a:font script="Mlym" typeface="Kartika"/>        <a:font script="Laoo" typeface="DokChampa"/>        <a:font script="Sinh" typeface="Iskoola Pota"/>        <a:font script="Mong" typeface="Mongolian Baiti"/>        <a:font script="Viet" typeface="Times New Roman"/>        <a:font script="Uigh" typeface="Microsoft Uighur"/>      </a:majorFont>      <a:minorFont>        <a:latin typeface="Calibri"/>        <a:ea typeface=""/>        <a:cs typeface=""/>        <a:font script="Jpan" typeface="&#xFF2D;&#xFF33; &#xFF30;&#x30B4;&#x30B7;&#x30C3;&#x30AF;"/>        <a:font script="Hang" typeface="&#xB9D1;&#xC740; &#xACE0;&#xB515;"/>        <a:font script="Hans" typeface="&#x5B8B;&#x4F53;"/>        <a:font script="Hant" typeface="&#x65B0;&#x7D30;&#x660E;&#x9AD4;"/>        <a:font script="Arab" typeface="Arial"/>        <a:font script="Hebr" typeface="Arial"/>        <a:font script="Thai" typeface="Tahoma"/>        <a:font script="Ethi" typeface="Nyala"/>        <a:font script="Beng" typeface="Vrinda"/>        <a:font script="Gujr" typeface="Shruti"/>        <a:font script="Khmr" typeface="DaunPenh"/>        <a:font script="Knda" typeface="Tunga"/>        <a:font script="Guru" typeface="Raavi"/>        <a:font script="Cans" typeface="Euphemia"/>        <a:font script="Cher" typeface="Plantagenet Cherokee"/>        <a:font script="Yiii" typeface="Microsoft Yi Baiti"/>        <a:font script="Tibt" typeface="Microsoft Himalaya"/>        <a:font script="Thaa" typeface="MV Boli"/>        <a:font script="Deva" typeface="Mangal"/>        <a:font script="Telu" typeface="Gautami"/>        <a:font script="Taml" typeface="Latha"/>        <a:font script="Syrc" typeface="Estrangelo Edessa"/>        <a:font script="Orya" typeface="Kalinga"/>        <a:font script="Mlym" typeface="Kartika"/>        <a:font script="Laoo" typeface="DokChampa"/>        <a:font script="Sinh" typeface="Iskoola Pota"/>        <a:font script="Mong" typeface="Mongolian Baiti"/>        <a:font script="Viet" typeface="Arial"/>        <a:font script="Uigh" typeface="Microsoft Uighur"/>      </a:minorFont>    </a:fontScheme>    <a:fmtScheme name="Office">      <a:fillStyleLst>        <a:solidFill>          <a:schemeClr val="phClr"/>        </a:solidFill>        <a:gradFill rotWithShape="1">          <a:gsLst>            <a:gs pos="0">              <a:schemeClr val="phClr">                <a:tint val="50000"/>                <a:satMod val="300000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="35000">              <a:schemeClr val="phClr">                <a:tint val="37000"/>                <a:satMod val="300000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="100000">              <a:schemeClr val="phClr">                <a:tint val="15000"/>                <a:satMod val="350000"/>              </a:schemeClr>            </a:gs>          </a:gsLst>          <a:lin ang="16200000" scaled="1"/>        </a:gradFill>        <a:gradFill rotWithShape="1">          <a:gsLst>            <a:gs pos="0">              <a:schemeClr val="phClr">                <a:shade val="51000"/>                <a:satMod val="130000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="80000">              <a:schemeClr val="phClr">                <a:shade val="93000"/>                <a:satMod val="130000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="100000">              <a:schemeClr val="phClr">                <a:shade val="94000"/>                <a:satMod val="135000"/>              </a:schemeClr>            </a:gs>          </a:gsLst>          <a:lin ang="16200000" scaled="0"/>        </a:gradFill>      </a:fillStyleLst>      <a:lnStyleLst>        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">          <a:solidFill>            <a:schemeClr val="phClr">              <a:shade val="95000"/>              <a:satMod val="105000"/>            </a:schemeClr>          </a:solidFill>          <a:prstDash val="solid"/>        </a:ln>        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr">          <a:solidFill>            <a:schemeClr val="phClr"/>          </a:solidFill>          <a:prstDash val="solid"/>        </a:ln>        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr">          <a:solidFill>            <a:schemeClr val="phClr"/>          </a:solidFill>          <a:prstDash val="solid"/>        </a:ln>      </a:lnStyleLst>      <a:effectStyleLst>        <a:effectStyle>          <a:effectLst>            <a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0">              <a:srgbClr val="000000">                <a:alpha val="38000"/>              </a:srgbClr>            </a:outerShdw>          </a:effectLst>        </a:effectStyle>        <a:effectStyle>          <a:effectLst>            <a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0">              <a:srgbClr val="000000">                <a:alpha val="35000"/>              </a:srgbClr>            </a:outerShdw>          </a:effectLst>        </a:effectStyle>        <a:effectStyle>          <a:effectLst>            <a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0">              <a:srgbClr val="000000">                <a:alpha val="35000"/>              </a:srgbClr>            </a:outerShdw>          </a:effectLst>          <a:scene3d>            <a:camera prst="orthographicFront">              <a:rot lat="0" lon="0" rev="0"/>            </a:camera>            <a:lightRig rig="threePt" dir="t">              <a:rot lat="0" lon="0" rev="1200000"/>            </a:lightRig>          </a:scene3d>          <a:sp3d>            <a:bevelT w="63500" h="25400"/>          </a:sp3d>        </a:effectStyle>      </a:effectStyleLst>      <a:bgFillStyleLst>        <a:solidFill>          <a:schemeClr val="phClr"/>        </a:solidFill>        <a:gradFill rotWithShape="1">          <a:gsLst>            <a:gs pos="0">              <a:schemeClr val="phClr">                <a:tint val="40000"/>                <a:satMod val="350000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="40000">              <a:schemeClr val="phClr">                <a:tint val="45000"/>                <a:shade val="99000"/>                <a:satMod val="350000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="100000">              <a:schemeClr val="phClr">                <a:shade val="20000"/>                <a:satMod val="255000"/>              </a:schemeClr>            </a:gs>          </a:gsLst>          <a:path path="circle">            <a:fillToRect l="50000" t="-80000" r="50000" b="180000"/>          </a:path>        </a:gradFill>        <a:gradFill rotWithShape="1">          <a:gsLst>            <a:gs pos="0">              <a:schemeClr val="phClr">                <a:tint val="80000"/>                <a:satMod val="300000"/>              </a:schemeClr>            </a:gs>            <a:gs pos="100000">              <a:schemeClr val="phClr">                <a:shade val="30000"/>                <a:satMod val="200000"/>              </a:schemeClr>            </a:gs>          </a:gsLst>          <a:path path="circle">            <a:fillToRect l="50000" t="50000" r="50000" b="50000"/>          </a:path>        </a:gradFill>      </a:bgFillStyleLst>    </a:fmtScheme>  </a:themeElements>  <a:objectDefaults/>  <a:extraClrSchemeLst/></a:theme>';

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

  // El orden de los hijos de worksheet tampoco es libre: dimension, sheetViews,
  // sheetFormatPr, cols, sheetData. `dimension` declara el rango ocupado —lo escribe
  // todo generador real y es lo primero que lee quien abre el archivo.
  function hojaXml(hoja, indice) {
    var F = hoja.filas || [];
    var anchoMax = 1, r;
    for (r = 0; r < F.length; r++) if (F[r].length > anchoMax) anchoMax = F[r].length;
    var dim = 'A1:' + letraCol(anchoMax - 1) + Math.max(F.length, 1);

    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="' + dim + '"/>';
    // La primera hoja va marcada como la seleccionada: sin eso el archivo se abre sin
    // pestaña activa y hay lectores a los que eso no les gusta.
    var sel = indice === 0 ? ' tabSelected="1"' : '';
    if (hoja.congelar) {
      x += '<sheetViews><sheetView' + sel + ' workbookViewId="0"><pane ySplit="' + hoja.congelar +
        '" topLeftCell="A' + (hoja.congelar + 1) + '" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A' + (hoja.congelar + 1) +
        '" sqref="A' + (hoja.congelar + 1) + '"/></sheetView></sheetViews>';
    } else {
      x += '<sheetViews><sheetView' + sel + ' workbookViewId="0"/></sheetViews>';
    }
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    if (hoja.anchos && hoja.anchos.length) {
      x += '<cols>';
      for (var a = 0; a < hoja.anchos.length; a++) {
        x += '<col min="' + (a + 1) + '" max="' + (a + 1) + '" width="' + hoja.anchos[a] + '" customWidth="1"/>';
      }
      x += '</cols>';
    }
    x += '<sheetData>';
    for (r = 0; r < F.length; r++) {
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
      entradas.push({ nombre: 'xl/worksheets/sheet' + n + '.xml', texto: hojaXml(hojas[i], i) });
      tiposHojas += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      relsHojas += '<Relationship Id="rId' + n + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
        'Target="worksheets/sheet' + n + '.xml"/>';
      defsHojas += '<sheet name="' + esc(nombreHoja(hojas[i].nombre, i)) + '" sheetId="' + n +
        '" r:id="rId' + n + '"/>';
    }
    var idEstilos = 'rId' + (hojas.length + 1);
    var idTema    = 'rId' + (hojas.length + 2);

    entradas.unshift({ nombre: '[Content_Types].xml', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      tiposHojas +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>' });

    entradas.push({ nombre: '_rels/.rels', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
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
      '<Relationship Id="' + idTema + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
      '</Relationships>' });

    entradas.push({ nombre: 'xl/styles.xml', texto: ESTILOS });
    entradas.push({ nombre: 'xl/theme/theme1.xml', texto: TEMA });

    // Propiedades del documento. No cambian nada de lo que se ve, pero un paquete sin
    // ellas es un paquete incompleto para quien lo valide. La fecha va fija por la
    // misma razón que la del ZIP: mismo contenido, mismo archivo.
    entradas.push({ nombre: 'docProps/core.xml', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:creator>FTS Suite</dc:creator><cp:lastModifiedBy>FTS Suite</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T12:00:00Z</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T12:00:00Z</dcterms:modified>' +
      '</cp:coreProperties>' });

    entradas.push({ nombre: 'docProps/app.xml', texto:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>FTS Suite</Application></Properties>' });

    return zip(entradas);
  }

  return { libro: libro, crc32: crc32, utf8: utf8, letraCol: letraCol, nombreHoja: nombreHoja };
});
