/* ═══ Conceptualizador · fotos, notas de voz y archivos ═══
 *
 * Todo se prepara EN EL TELÉFONO antes de subir:
 *   · fotos: se reducen a 1600 px del lado largo y JPEG 0.82 (una foto de
 *     12 MP pasa de ~4 MB a ~300 KB). Si el navegador no puede leerla (HEIC
 *     fuera de Safari, p. ej.) se sube tal cual si cabe en 10 MB.
 *   · notas de voz: MediaRecorder, opus/webm o mp4 según el navegador.
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

  // ── Grabadora ──────────────────────────────────────────────────────────
  var TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  function tipoGrabacion() {
    if (!G.MediaRecorder) return null;
    for (var i = 0; i < TIPOS.length; i++) { try { if (MediaRecorder.isTypeSupported(TIPOS[i])) return TIPOS[i]; } catch (e) {} }
    return '';
  }
  /** grabar() → { detener(): Promise<{blob,mime,duracion_s,nombre}>, cancelar(), inicio } */
  async function grabar() {
    var tipo = tipoGrabacion();
    if (tipo === null) throw new Error('Este navegador no puede grabar audio.');
    var flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    var rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    var partes = [], inicio = Date.now(), cancelado = false;
    rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
    rec.start(1000);
    function soltar() { flujo.getTracks().forEach(function (t) { t.stop(); }); }
    return {
      inicio: inicio,
      detener: function () {
        return new Promise(function (ok) {
          rec.onstop = function () {
            soltar();
            var mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0];
            var ext = /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
            var blob = new Blob(partes, { type: mime });
            ok(cancelado ? null : { blob: blob, mime: mime, clase: 'audio', bytes: blob.size,
              duracion_s: Math.round((Date.now() - inicio) / 1000), nombre: 'nota-de-voz-' + new Date(inicio).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext });
          };
          try { rec.stop(); } catch (e) { soltar(); ok(null); }
        });
      },
      cancelar: function () { cancelado = true; try { rec.stop(); } catch (e) {} soltar(); }
    };
  }

  G.CzMedios = { preparar: preparar, sha256: sha256, base64: base64, grabar: grabar, puedeGrabar: function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && tipoGrabacion() !== null); }, TOPE: TOPE, clase: clase };
})(window);
