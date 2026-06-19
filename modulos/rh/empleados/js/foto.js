// ═══ FTS RH — compresión de foto de perfil (client-side) ═══
// Reduce a ~1024px lado mayor, JPEG 0.8, y devuelve base64 SIN el prefijo data:
// (el workflow rh/empleado/crear lo asigna directo a hr.employee.image_1920).
// Cap 1.5 MB tras compresión → si excede, rechaza.
(function(global){
  'use strict';
  var MAX_LADO = 1024;
  var CALIDAD  = 0.8;
  var CAP_BYTES = 1.5 * 1024 * 1024;

  function comprimirFoto(file){
    return new Promise(function(resolve, reject){
      if (!file) return resolve(null);
      if (!/^image\/(jpe?g|png)$/i.test(file.type)) return reject(new Error('Formato no soportado (usa JPG o PNG).'));
      var reader = new FileReader();
      reader.onerror = function(){ reject(new Error('No se pudo leer la imagen.')); };
      reader.onload = function(){
        var img = new Image();
        img.onerror = function(){ reject(new Error('Imagen inválida.')); };
        img.onload = function(){
          var w = img.width, h = img.height;
          if (w > h && w > MAX_LADO){ h = Math.round(h * MAX_LADO / w); w = MAX_LADO; }
          else if (h >= w && h > MAX_LADO){ w = Math.round(w * MAX_LADO / h); h = MAX_LADO; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = cv.toDataURL('image/jpeg', CALIDAD);
          var b64 = dataUrl.split('base64,')[1] || '';
          // tamaño aprox en bytes del base64
          var bytes = Math.ceil(b64.length * 3 / 4);
          if (bytes > CAP_BYTES) return reject(new Error('La foto pesa ' + (bytes/1048576).toFixed(1) + ' MB tras comprimir (máx 1.5 MB). Usa una más chica.'));
          resolve({ base64: b64, dataUrl: dataUrl, bytes: bytes, w: w, h: h });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  global.FTSFoto = { comprimirFoto: comprimirFoto };
})(window);
