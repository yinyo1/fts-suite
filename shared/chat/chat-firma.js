/* ═══ shared/chat · la cadena canónica del HMAC, en UN solo lugar (#407 §2.2 punto 1) ═══
 *
 * La pantalla firma cada pedido con HMAC-SHA256 usando su PROPIO token como llave sobre
 * una cadena canónica (ts, nonce, modo y campos). n8n arma la MISMA cadena para comprobarla.
 * Antes la cadena vivía copiada en cada cliente y en cada verificador; ahora:
 *   · el navegador carga este archivo (núcleo de chat de Marketing y conceptualizador);
 *   · los workflows de n8n lo llevan pegado PROGRAMÁTICAMENTE al inicio de su Code node
 *     (fts-conceptualizador/n8n/construir-chat.js lo lee de aquí; nadie lo transcribe);
 *   · las pruebas lo cargan con require().
 *
 * No es un secreto nuevo en el navegador —el repo es público—: amarra el pedido a su token,
 * a su momento y a su nonce. La protección real la da el servidor (firma del JWT, ventana
 * de 5 min y nonce único guardado en Postgres).
 *
 * Sin escapes de unicode a propósito: por el MCP de n8n llegan colapsados (CLAUDE.md §17 2c).
 */
var ChatFirma = (function () {
  'use strict';
  function S(x) { return x === undefined || x === null ? '' : '' + x; }
  // Cada producto declara su lista. Un nombre suelto es un campo de texto; «adjuntos» son ids
  // unidos por coma; «json:x» es JSON.stringify(x ?? null). El orden ES la firma.
  var LISTAS = {
    chat: ['ts', 'nonce', 'producto', 'modo', 'sesion_id', 'ficha_id', 'senal_id', 'texto', 'tipo', 'sha256',
           'cliente_id', 'adjunto_id', 'escrito_at', 'adjuntos', 'json:datos'],
    // La del conceptualizador, idéntica a la que ya firmaba cz-cliente.js (V1.32.1) y verifica suite-verificar.js.
    conceptualizador: ['ts', 'nonce', 'modo', 'caso_id', 'texto', 'tipo', 'concepto', 'razon', 'sha256', 'accion_id',
           'decision', 'cliente_id', 'adjunto_id', 'escrito_at', 'adjuntos', 'json:resultado', 'json:datos'],
    // El radar escribe señales (marketing/senal-registrar).
    senal: ['ts', 'nonce', 'json:senales']
  };
  function canonica(c, lista) {
    lista = lista || LISTAS.chat;
    return lista.map(function (k) {
      if (k === 'adjuntos') return Array.isArray(c.adjuntos) ? c.adjuntos.filter(function (a) { return typeof a === 'string'; }).join(',') : '';
      if (k.indexOf('json:') === 0) { var v = c[k.slice(5)]; return JSON.stringify(v === undefined ? null : v); }
      return S(c[k]);
    }).join('\n');
  }
  return { canonica: canonica, LISTAS: LISTAS, S: S };
})();
if (typeof window !== 'undefined') window.ChatFirma = ChatFirma;
if (typeof module !== 'undefined' && module.exports) module.exports = ChatFirma;
