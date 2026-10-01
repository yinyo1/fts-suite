/* retardos/lib/sesion.js · Puerta del webhook retardos/panel (#334, #123)
 *
 * Dos llaves, las dos del lado del servidor:
 *  1) JWT de la Suite (SUITE_JWT_SECRET) con scope retardos:read / retardos:write.
 *  2) HMAC-SHA256 + anti-replay (#123): el cliente firma  ts + "." + nonce + "." + JSON(datos)
 *     usando SU PROPIO TOKEN como llave. Así no hay un secreto global viviendo en el
 *     navegador (el riesgo que #123 deja anotado) y una petición capturada no se puede
 *     re-enviar: la ventana es de 5 minutos y el nonce se registra en Postgres
 *     (retardos.nonce), que rechaza el segundo uso.
 *
 * SHA-256/HMAC en JS puro: el sandbox de n8n no expone crypto (CLAUDE.md §15).
 * Sin diagonales invertidas (se embebe en n8n).
 */
(function (raiz) {
  function sha256Bytes(bytes) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var ml = bytes.length * 8, w8 = bytes.slice(), i, j;
    w8.push(0x80);
    while (w8.length % 64 !== 56) w8.push(0);
    for (i = 7; i >= 0; i--) w8.push((ml / Math.pow(2, i * 8)) & 0xff);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < w8.length; i += 64) {
      var w = new Array(64);
      for (j = 0; j < 16; j++) w[j] = (w8[i + j * 4] << 24) | (w8[i + j * 4 + 1] << 16) | (w8[i + j * 4 + 2] << 8) | w8[i + j * 4 + 3];
      for (j = 16; j < 64; j++) {
        var s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[j] + w[j]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    var out = [];
    for (i = 0; i < 8; i++) out.push((H[i] >>> 24) & 0xff, (H[i] >>> 16) & 0xff, (H[i] >>> 8) & 0xff, H[i] & 0xff);
    return out;
  }
  function strBytes(s) {
    var u = unescape(encodeURIComponent(String(s))), o = [];
    for (var i = 0; i < u.length; i++) o.push(u.charCodeAt(i));
    return o;
  }
  function hmac(keyStr, msgStr) {
    var key = strBytes(keyStr);
    if (key.length > 64) key = sha256Bytes(key);
    while (key.length < 64) key.push(0);
    var ip = key.map(function (b) { return b ^ 0x36; }), op = key.map(function (b) { return b ^ 0x5c; });
    return sha256Bytes(op.concat(sha256Bytes(ip.concat(strBytes(msgStr)))));
  }
  function hex(bytes) { var o = ''; for (var i = 0; i < bytes.length; i++) o += ('0' + bytes[i].toString(16)).slice(-2); return o; }
  function b64url(bytes) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', o = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      o += A[b0 >> 2] + A[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
      if (b1 !== undefined) { o += A[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)]; if (b2 !== undefined) o += A[b2 & 63]; }
    }
    return o;
  }
  function b64urlAStr(s) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', bits = '', out = [];
    for (var i = 0; i < s.length; i++) { var k = A.indexOf(s.charAt(i)); if (k < 0) continue; bits += ('000000' + k.toString(2)).slice(-6); }
    for (var j = 0; j + 8 <= bits.length; j += 8) out.push(parseInt(bits.slice(j, j + 8), 2));
    return decodeURIComponent(escape(String.fromCharCode.apply(null, out)));
  }
  function igual(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

  function verificarJWT(token, secreto, scope, ahoraS) {
    if (typeof token !== 'string') return { ok: false, error: 'TOKEN_AUSENTE' };
    var p = token.split('.');
    if (p.length !== 3) return { ok: false, error: 'TOKEN_MALFORMADO' };
    if (!igual(b64url(hmac(secreto, p[0] + '.' + p[1])), p[2])) return { ok: false, error: 'FIRMA_INVALIDA' };
    var pl;
    try { pl = JSON.parse(b64urlAStr(p[1])); } catch (e) { return { ok: false, error: 'PAYLOAD_ILEGIBLE' }; }
    var ahora = ahoraS || Math.floor(Date.now() / 1000);
    if (!pl.exp || pl.exp <= ahora) return { ok: false, error: 'TOKEN_EXPIRADO' };
    var scopes = Array.isArray(pl.scopes) ? pl.scopes : [];
    if (scope && scopes.indexOf(scope) < 0) return { ok: false, error: 'SCOPE_INSUFICIENTE' };
    return { ok: true, actor: pl.sub || pl.username || null, scopes: scopes };
  }

  function canonico(ts, nonce, datos) { return String(ts) + '.' + String(nonce) + '.' + JSON.stringify(datos == null ? {} : datos); }
  function firmar(token, ts, nonce, datos) { return hex(hmac(token, canonico(ts, nonce, datos))); }

  // Puerta completa. body = { token, ts, nonce, sig, datos }
  function puerta(body, secreto, ahoraMs) {
    if (!secreto || String(secreto).length < 32) return { ok: false, error: 'SECRETO_NO_CONFIGURADO' };
    body = body || {};
    var datos = body.datos || {};
    var escribe = ['listar', 'caso', 'config', 'evidencia', 'calidad', 'hojas', 'hoja_ver', 'reincidencia', 'jornada', 'medidas'].indexOf(String(datos.accion || '')) < 0;
    var v = verificarJWT(String(body.token || ''), String(secreto), escribe ? 'retardos:write' : 'retardos:read',
                         ahoraMs ? Math.floor(ahoraMs / 1000) : undefined);
    if (!v.ok) return v;
    var ts = Number(body.ts), ahora = ahoraMs || Date.now();
    if (!isFinite(ts) || Math.abs(ahora - ts) > 5 * 60 * 1000) return { ok: false, error: 'FUERA_DE_VENTANA' };
    var nonce = String(body.nonce || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { ok: false, error: 'NONCE_INVALIDO' };
    var sig = String(body.sig || '').toLowerCase();
    if (!igual(firmar(String(body.token), ts, nonce, datos), sig)) return { ok: false, error: 'HMAC_INVALIDO' };
    return { ok: true, actor: v.actor, rol: v.scopes.indexOf('retardos:write') >= 0 ? 'editor' : 'lector', nonce: nonce, datos: datos };
  }

  var api = { puerta: puerta, firmar: firmar, verificarJWT: verificarJWT, _hmacHex: function (k, m) { return hex(hmac(k, m)); }, _b64url: b64url, _hmac: hmac };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RetardosSesion = api;
})(typeof window !== 'undefined' ? window : this);
