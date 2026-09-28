/* retardos/lib/pdf.js · Generador de hojas PDF de Retardos v2 (#334)
 *
 * JS puro, sin dependencias: corre igual en Node (pruebas), en el navegador
 * (panel RH) y dentro de un Code node de n8n (sin require). Por eso:
 *   - no usa Buffer ni require;
 *   - el fuente no lleva diagonales invertidas (el update_workflow del MCP de
 *     n8n se come un nivel de escape, CLAUDE.md §17 quirk 2c): los caracteres
 *     de control se arman con String.fromCharCode.
 *
 * Hoja pensada para ser leída por máquina (complemento S2): folio grande, un código
 * QR con el folio en cada página, marcas de esquina y recuadros en posiciones FIJAS
 * (LAYOUT). El procesador retardos-hojas usa el mismo LAYOUT para ubicar cada firma,
 * la casilla "Se negó a firmar" y el recuadro de comentarios aunque la hoja llegue
 * como foto chueca. Si se mueve algo aquí, se regenera retardos/hojas/layout.json
 * (node retardos/hojas/exportar-layout.js) y la prueba de contrato lo exige.
 *
 * Produce un PDF 1.4 carta, Helvetica WinAnsi (acentos y ñ).
 * Uso: RetardosPDF.hoja(datosCaso) -> { base64, nombre, bytes, binario, paginas }
 */
(function (raiz) {
  var NL = String.fromCharCode(10);
  var BS = String.fromCharCode(92);

  // ── QR (modo byte, versión 3, corrección Q) ─────────────────────────────
  // Implementación mínima del estándar ISO/IEC 18004 para textos cortos (hasta 32 bytes).
  var QR_VER = 3, QR_N = 29, QR_BLOQUES = 2, QR_DATOS_BLOQUE = 17, QR_EC = 18;
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 255;
  }
  function rsDivisor(grado) {
    var r = []; for (var i = 0; i < grado - 1; i++) r.push(0); r.push(1);
    var raizG = 1;
    for (var k = 0; k < grado; k++) {
      for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], raizG); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      raizG = gfMul(raizG, 2);
    }
    return r;
  }
  function rsResto(datos, div) {
    var r = div.map(function () { return 0; });
    for (var i = 0; i < datos.length; i++) {
      var f = datos[i] ^ r.shift(); r.push(0);
      for (var j = 0; j < div.length; j++) r[j] ^= gfMul(div[j], f);
    }
    return r;
  }
  function qrMatriz(texto) {
    var bytes = []; var t = aLatin1(texto);
    for (var i = 0; i < t.length; i++) bytes.push(t.charCodeAt(i) & 255);
    var cap = QR_BLOQUES * QR_DATOS_BLOQUE;
    if (bytes.length > cap - 2) throw new Error('QR_TEXTO_LARGO');
    var bits = [];
    function poner(v, n) { for (var b = n - 1; b >= 0; b--) bits.push((v >>> b) & 1); }
    poner(4, 4); poner(bytes.length, 8);
    for (var q = 0; q < bytes.length; q++) poner(bytes[q], 8);
    for (var z = 0; z < 4 && bits.length < cap * 8; z++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var p = 0; p < bits.length; p += 8) { var v = 0; for (var u = 0; u < 8; u++) v = (v << 1) | bits[p + u]; cw.push(v); }
    for (var pad = 0; cw.length < cap; pad++) cw.push(pad % 2 ? 0x11 : 0xEC);
    var div = rsDivisor(QR_EC), bloques = [], ecs = [];
    for (var bI = 0; bI < QR_BLOQUES; bI++) {
      var d = cw.slice(bI * QR_DATOS_BLOQUE, (bI + 1) * QR_DATOS_BLOQUE);
      bloques.push(d); ecs.push(rsResto(d, div));
    }
    var fin = [];
    for (var c1 = 0; c1 < QR_DATOS_BLOQUE; c1++) for (var b1 = 0; b1 < QR_BLOQUES; b1++) fin.push(bloques[b1][c1]);
    for (var c2 = 0; c2 < QR_EC; c2++) for (var b2 = 0; b2 < QR_BLOQUES; b2++) fin.push(ecs[b2][c2]);

    var N = QR_N, mod = [], fun = [];
    for (var y0 = 0; y0 < N; y0++) { mod.push([]); fun.push([]); for (var x0 = 0; x0 < N; x0++) { mod[y0].push(false); fun[y0].push(false); } }
    function fij(x, y, v) { mod[y][x] = v; fun[y][x] = true; }
    for (var ti = 0; ti < N; ti++) { fij(6, ti, ti % 2 === 0); fij(ti, 6, ti % 2 === 0); }
    function buscador(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < N && yy >= 0 && yy < N) fij(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    buscador(3, 3); buscador(N - 4, 3); buscador(3, N - 4);
    for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) fij(22 + ax, 22 + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    function formato(mask) {
      var dat = (3 << 3) | mask, rem = dat;
      for (var i2 = 0; i2 < 10; i2++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((dat << 10) | rem) ^ 0x5412;
      function bit(i3) { return ((fb >>> i3) & 1) !== 0; }
      for (var i4 = 0; i4 <= 5; i4++) fij(8, i4, bit(i4));
      fij(8, 7, bit(6)); fij(8, 8, bit(7)); fij(7, 8, bit(8));
      for (var i5 = 9; i5 < 15; i5++) fij(14 - i5, 8, bit(i5));
      for (var i6 = 0; i6 < 8; i6++) fij(N - 1 - i6, 8, bit(i6));
      for (var i7 = 8; i7 < 15; i7++) fij(8, N - 15 + i7, bit(i7));
      fij(8, N - 8, true);
    }
    formato(0);
    var idx = 0, total = fin.length * 8;
    for (var der = N - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (var vert = 0; vert < N; vert++) for (var j2 = 0; j2 < 2; j2++) {
        var x = der - j2, arriba = ((der + 1) & 2) === 0, y = arriba ? N - 1 - vert : vert;
        if (!fun[y][x] && idx < total) { mod[y][x] = ((fin[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0; idx++; }
      }
    }
    function condicion(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function aplicar(m) { for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) if (!fun[yy][xx] && condicion(m, xx, yy)) mod[yy][xx] = !mod[yy][xx]; }
    function castigo() {
      var s = 0, oscuros = 0;
      for (var a = 0; a < N; a++) {
        var ch = 1, cv = 1;
        for (var b = 1; b < N; b++) {
          if (mod[a][b] === mod[a][b - 1]) { ch++; if (ch === 5) s += 3; else if (ch > 5) s++; } else ch = 1;
          if (mod[b][a] === mod[b - 1][a]) { cv++; if (cv === 5) s += 3; else if (cv > 5) s++; } else cv = 1;
        }
      }
      for (var yy = 0; yy < N - 1; yy++) for (var xx = 0; xx < N - 1; xx++) {
        var c = mod[yy][xx];
        if (c === mod[yy][xx + 1] && c === mod[yy + 1][xx] && c === mod[yy + 1][xx + 1]) s += 3;
      }
      for (var y3 = 0; y3 < N; y3++) for (var x3 = 0; x3 < N; x3++) if (mod[y3][x3]) oscuros++;
      s += Math.floor(Math.abs(oscuros * 20 - N * N * 10) / (N * N)) * 10;
      return s;
    }
    var mejor = 0, mejorS = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      aplicar(mk); formato(mk);
      var sc = castigo();
      if (sc < mejorS) { mejorS = sc; mejor = mk; }
      aplicar(mk);
    }
    aplicar(mejor); formato(mejor);
    return mod;
  }

  // ── utilidades de texto ───────────────────────────────────────────────────
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
  function r2(n) { return Math.round(n * 100) / 100; }

  // ── geometría fija de la hoja (puntos PDF, origen abajo a la izquierda) ──
  var LAYOUT = {
    version: 1,
    pagina: [612, 792],
    qr: { x: 486, y: 688, lado: 75.4, modulos: QR_N },
    marcas: [[36, 756, 12, 12], [36, 36, 12, 12], [564, 36, 12, 12]],   // arriba izq, abajo izq, abajo der
    folio: [60, 700, 400, 30],
    nombre: [60, 656, 490, 18],
    tabla_filas: 8,
    cajas: {
      comentarios: [60, 300, 490, 76],
      negativa: [60, 278, 12, 12],
      trabajador: [60, 222, 235, 40],
      rh: [315, 222, 235, 40],
      testigo1: [60, 160, 235, 40],
      testigo2: [315, 160, 235, 40],
      jefe: [60, 98, 235, 40]
    }
  };
  var ETIQUETAS = {
    trabajador: 'Firma del trabajador', rh: 'Recursos Humanos (nombre y firma)', jefe: 'Jefe directo',
    testigo1: 'Testigo 1 (acta o negativa)', testigo2: 'Testigo 2 (acta o negativa)'
  };

  function Pagina() { this.ops = []; }
  Pagina.prototype.texto = function (x, y, t, tam, negrita) {
    this.ops.push('BT /' + (negrita ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + x + ' ' + y + ' Td (' + esc(t) + ') Tj ET');
  };
  Pagina.prototype.linea = function (x1, y, x2) { this.ops.push('0.5 w ' + x1 + ' ' + y + ' m ' + x2 + ' ' + y + ' l S'); };
  Pagina.prototype.caja = function (r, ancho) { this.ops.push((ancho || 0.8) + ' w ' + r[0] + ' ' + r[1] + ' ' + r[2] + ' ' + r[3] + ' re S'); };
  Pagina.prototype.lleno = function (r) { this.ops.push(r[0] + ' ' + r[1] + ' ' + r[2] + ' ' + r[3] + ' re f'); };
  Pagina.prototype.qr = function (texto) {
    var m = qrMatriz(texto), q = LAYOUT.qr, s = q.lado / q.modulos;
    for (var y = 0; y < q.modulos; y++) for (var x = 0; x < q.modulos; x++) {
      if (m[y][x]) this.ops.push(r2(q.x + x * s) + ' ' + r2(q.y + q.lado - (y + 1) * s) + ' ' + r2(s + 0.02) + ' ' + r2(s + 0.02) + ' re');
    }
    this.ops.push('f');
  };
  Pagina.prototype.marcas = function () { for (var i = 0; i < LAYOUT.marcas.length; i++) this.lleno(LAYOUT.marcas[i]); };

  function construir(paginas) {
    var objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    var kids = [], n = 5;
    for (var i = 0; i < paginas.length; i++) {
      var cont = paginas[i].join(NL) + NL + 'BT /F1 8 Tf 280 40 Td (Página ' + (i + 1) + ' de ' + paginas.length + ') Tj ET';
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
    carta_compromiso: 'Reconozco los retardos que se detallan abajo y me comprometo a presentarme puntualmente a mi jornada conforme a mi horario de entrada.',
    acta: 'Se levanta la presente acta administrativa por los retardos que se detallan abajo, con fundamento en los artículos 20 y 134 fracciones I, III y V de la Ley Federal del Trabajo y en el Reglamento Interior de Trabajo. Antes de firmar, el trabajador puede manifestar lo que a su derecho convenga en el espacio de comentarios.',
    suspension: 'Por reincidencia en retardos después de documentos previos firmados, se cita al trabajador para ser oído antes de determinar una medida disciplinaria. Cualquier suspensión se aplicará conforme al Reglamento Interior de Trabajo y al artículo 423 fracción X de la Ley Federal del Trabajo, con un máximo de ocho días. La decisión es de Recursos Humanos.'
  };
  // Texto PENDIENTE DE VALIDACIÓN DE LEGAL (docs/retardos/PARA_LEGAL.md): va en la carta y en el acta.
  var REINCIDENCIA = 'La reincidencia queda registrada y puede dar lugar a las medidas que prevea el Reglamento Interior de Trabajo.';
  var PENDIENTE_LEGAL = ['REINCIDENCIA'];
  var PIE = 'Recursos Humanos recolecta esta hoja firmada. Si la recibió por correo, entréguela a Recursos Humanos o responda ese correo con la foto de la hoja, sin cambiar el asunto.';
  var NIVEL_DE = { aviso: 1, carta_compromiso: 2, acta: 3, suspension: 4 };

  function textoQR(folio, nivel, pag, total) { return 'FTS|' + (folio || 'SIN-FOLIO') + '|N' + nivel + '|P' + pag + '/' + total; }

  function encabezado(P, d, acc, nivel, pag, total) {
    P.marcas();
    P.qr(textoQR(d.folio, nivel, pag, total));
    P.texto(60, 752, 'SERVICIOS FTS SA DE CV', 10, true);
    P.texto(60, 739, 'Recursos Humanos', 9, false);
    P.texto(60, 706, 'Folio ' + (d.folio || ''), 22, true);
    P.texto(360, 739, 'Fecha: ' + (d.fecha_emision || ''), 9, false);
    if (pag > 1) { P.texto(60, 682, (TITULOS[acc] || 'DOCUMENTO') + ' (continuación)', 12, true); return; }
    P.texto(60, 682, TITULOS[acc] || 'DOCUMENTO', 14, true);
    P.texto(60, 662, 'Nombre: ' + (d.nombre || ''), 11, true);
    P.texto(60, 648, 'Puesto: ' + (d.puesto || '') + '    Departamento: ' + (d.departamento || ''), 9, false);
    P.texto(60, 634, 'Nivel ' + nivel + '    Periodo: ' + (d.periodo || '') + '    Retardos en el periodo: ' + (d.retardos_n == null ? '' : d.retardos_n)
      + (d.motivo_apertura === 'reincidencia' ? '    Motivo: reincidencia' : ''), 9, false);
  }
  function cabeceraTabla(P, y) {
    P.texto(60, y, 'Fecha', 9, true); P.texto(170, y, 'Hora de llegada', 9, true); P.texto(300, y, 'Hora de entrada', 9, true); P.texto(430, y, 'Minutos tarde', 9, true);
    P.linea(60, y - 6, 550);
  }
  function fila(P, y, r) {
    P.texto(60, y, r.fecha, 9, false); P.texto(170, y, r.llegada, 9, false); P.texto(300, y, r.esperada, 9, false); P.texto(430, y, String(r.minutos), 9, false);
  }

  function hoja(d) {
    d = d || {};
    var acc = d.accion || 'aviso';
    var nivel = d.nivel || NIVEL_DE[acc] || 1;
    var firma = acc !== 'aviso';
    var rs = d.retardos || [];
    var porPag1 = firma ? LAYOUT.tabla_filas : 26, porPagN = 40;
    var resto = Math.max(0, rs.length - porPag1), total = 1 + (resto > 0 ? Math.ceil(resto / porPagN) : 0);
    var paginas = [];

    var P = new Pagina();
    encabezado(P, d, acc, nivel, 1, total);
    var y = 614;
    var parrafos = [CUERPO[acc] || ''];
    if (acc === 'carta_compromiso' || acc === 'acta') parrafos.push(REINCIDENCIA);
    if (acc === 'suspension' && d.accion_desde) parrafos.push('Días de suspensión determinados por RH: ' + (d.dias_suspension || '') + ', del ' + d.accion_desde + ' al ' + (d.accion_hasta || '') + '.');
    for (var pI = 0; pI < parrafos.length; pI++) {
      var ls = partir(parrafos[pI], 9, 490);
      for (var l = 0; l < ls.length; l++) { P.texto(60, y, ls[l], 9, false); y -= 12; }
      y -= 4;
    }
    if (y < 526) throw new Error('HOJA_TEXTO_DEMASIADO_LARGO');
    cabeceraTabla(P, 516);
    var yf = 498;
    for (var i = 0; i < Math.min(rs.length, porPag1); i++) { fila(P, yf, rs[i]); yf -= 12; }
    if (resto > 0) P.texto(60, yf - 2, 'Continúa en la página 2: ' + resto + ' retardos más.', 9, true);

    if (firma) {
      var C = LAYOUT.cajas;
      P.texto(60, 382, 'Comentarios del trabajador (derecho a ser oído):', 9, true);
      P.caja(C.comentarios);
      P.caja(C.negativa, 1.2);
      P.texto(80, 280, 'Se negó a firmar (se requieren dos testigos)', 9, true);
      var orden = ['trabajador', 'rh', 'testigo1', 'testigo2', 'jefe'];
      for (var f = 0; f < orden.length; f++) {
        var r = C[orden[f]];
        P.caja(r);
        P.texto(r[0], r[1] - 10, ETIQUETAS[orden[f]], 8, false);
      }
      var pie = partir(PIE, 8, 490);
      for (var k = 0; k < pie.length; k++) P.texto(60, 74 - k * 10, pie[k], 8, false);
    }
    paginas.push(P.ops);

    for (var pg = 2; pg <= total; pg++) {
      var Q = new Pagina();
      encabezado(Q, d, acc, nivel, pg, total);
      cabeceraTabla(Q, 660);
      var y2 = 642, desde = porPag1 + (pg - 2) * porPagN;
      for (var j = desde; j < Math.min(rs.length, desde + porPagN); j++) { fila(Q, y2, rs[j]); y2 -= 12; }
      paginas.push(Q.ops);
    }

    var bin = construir(paginas);
    return { base64: b64(bin), nombre: (d.folio || 'retardos') + '-' + acc + '.pdf', bytes: bin.length, binario: bin, paginas: total };
  }

  var api = { hoja: hoja, LAYOUT: LAYOUT, textoQR: textoQR, PENDIENTE_LEGAL: PENDIENTE_LEGAL, _qr: qrMatriz, _aLatin1: aLatin1, _b64: b64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RetardosPDF = api;
})(typeof window !== 'undefined' ? window : this);
