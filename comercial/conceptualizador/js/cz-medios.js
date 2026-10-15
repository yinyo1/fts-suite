/* ═══ Conceptualizador · fotos, notas de voz y archivos ═══
 *
 * Todo se prepara EN EL TELÉFONO antes de subir:
 *   · fotos: se reducen a 1600 px del lado largo y JPEG 0.82 (una foto de
 *     12 MP pasa de ~4 MB a ~300 KB). Si el navegador no puede leerla (HEIC
 *     fuera de Safari, p. ej.) se sube tal cual si cabe en 10 MB.
 *   · notas de voz: las graba cz-grabadora.js (una sola pieza para el chat y «✎ Corregir»).
 *   · PDFs y lo demás: tal cual, hasta 10 MB por archivo (tope de la base).
 * Cada archivo se sube en su propia petición con su sha256; la base vuelve a
 * calcularlo y rechaza el que no cuadre.
 */
(function (G) {
  'use strict';
  var LADO = 1600, CALIDAD = 0.82, TOPE = 10 * 1024 * 1024;

  function clase(mime, nombre) {
    if (/^image\//.test(mime)) return 'foto';
    if (/^audio\//.test(mime)) return 'audio';
    if (mime === 'application/pdf' || /\.pdf$/i.test(nombre || '')) return 'pdf';
    return 'otro';
  }

  async function reducirFoto(file) {
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { return null; } }
    var k = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', CALIDAD); });
    if (!blob) return null;
    return { blob: blob, ancho: w, alto: h };
  }

  /** Devuelve {blob, nombre, mime, clase, bytes, original} o {error}. */
  async function preparar(file) {
    var mime = file.type || 'application/octet-stream', c = clase(mime, file.name);
    if (c === 'foto' && !/gif|svg/.test(mime)) {
      var r = await reducirFoto(file);
      if (r && r.blob.size < file.size) {
        return { blob: r.blob, nombre: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', clase: 'foto',
                 bytes: r.blob.size, original: file.size };
      }
    }
    if (file.size > TOPE) {
      return { error: file.name + ' pasa de 10 MB' + (c === 'pdf' ? ': pártelo o manda solo las hojas que importan.' : '.') };
    }
    return { blob: file, nombre: file.name || ('archivo-' + Date.now()), mime: mime, clase: c, bytes: file.size, original: file.size };
  }

  async function sha256(blob) {
    var h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    var b = new Uint8Array(h), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function base64(blob) {
    return new Promise(function (ok, mal) {
      var rd = new FileReader();
      rd.onload = function () { var s = String(rd.result); ok(s.slice(s.indexOf(',') + 1)); };
      rd.onerror = function () { mal(rd.error); };
      rd.readAsDataURL(blob);
    });
  }

  /* V1.42 · aquí vivía una SEGUNDA grabadora (grabar(), MediaRecorder sin reloj ni onda) que nadie llamaba desde
   * V1.32. Se quitó para que quede UNA sola pieza: cz-grabadora.js, la misma en la caja principal y en «✎ Corregir». */
  G.CzMedios = { preparar: preparar, sha256: sha256, base64: base64, TOPE: TOPE, clase: clase };
})(window);
