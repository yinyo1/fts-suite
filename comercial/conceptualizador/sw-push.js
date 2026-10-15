/* ═══ Conceptualizador · service worker de avisos (V1.41, #4 punto 12) ═══
 *
 * SOLO dos cosas: mostrar el aviso que llega (`push`) y abrir el caso al tocarlo (`notificationclick`).
 *   · SIN caché y SIN `fetch`: no intercepta ninguna petición. Si cacheara la pantalla rompería el «Hay versión
 *     nueva · Actualizar» de V1.35 (cz-version.js) y serviría HTML viejo.
 *   · Su alcance es esta carpeta (/fts-suite/comercial/conceptualizador/): se registra desde cz-push.js con
 *     `{ scope: './' }` y vive aquí mismo, así que el navegador no lo deja controlar otra página de la suite.
 *   · El aviso llega CIFRADO (aes128gcm, RFC 8291) y el navegador lo descifra antes de dárnoslo. Trae el tipo, el
 *     caso, el título y el texto; la liga la arma este archivo con su propio alcance (no viene del servidor).
 *   · Si llega algo que no se entiende, se muestra un aviso genérico: Chrome exige mostrar uno por cada push.
 */
'use strict';
var ICONO = 'icono-192.png';
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leer(datos) {
  var a = null;
  try { a = datos ? datos.json() : null; } catch (e) { a = null; }
  if (!a || typeof a !== 'object') return { titulo: 'Conceptualizador', cuerpo: 'Tienes un aviso nuevo.', caso: null };
  return {
    tipo: a.tipo === 'recordatorio' ? 'recordatorio' : a.tipo === 'oferta' ? 'oferta' : 'aviso',
    titulo: String(a.titulo || 'Conceptualizador').slice(0, 80),
    cuerpo: String(a.cuerpo || '').slice(0, 400),
    caso: UUID.test(String(a.caso || '')) ? String(a.caso) : null,
    ver: a.ver === 'recordatorio' ? 'recordatorio' : a.ver === 'oferta' ? 'oferta' : '',
    acciones: Array.isArray(a.acciones) ? a.acciones.slice(0, 2).map(function (x) { return { action: String(x.action || '').slice(0, 20), title: String(x.title || '').slice(0, 30) }; }) : [],
    tag: String(a.tag || 'cz').slice(0, 64)
  };
}

/** La liga del caso, SIEMPRE dentro del alcance de este service worker. */
function destino(data, accion) {
  var u = new URL('./', self.registration.scope);
  if (data && data.caso && UUID.test(data.caso)) {
    u.searchParams.set('caso', data.caso);
    if (data.ver) u.searchParams.set('ver', data.ver);
    // «adelante» (V1.41: sin «cotiza» en el aviso); «cotiza» queda como alias de un aviso viejo.
    if (accion === 'adelante' || accion === 'cotiza') u.searchParams.set('accion', 'adelante');
    else if (accion === 'recuerda') u.searchParams.set('accion', accion);
  }
  return u.href;
}

// Una versión nueva de este archivo entra sin esperar a que se cierren las pestañas. No reclama páginas (sin
// clients.claim): no hace falta controlar nada para mostrar un aviso ni para abrir el caso.
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('push', function (e) {
  var a = leer(e.data);
  e.waitUntil(self.registration.showNotification(a.titulo, {
    body: a.cuerpo, tag: a.tag, renotify: true, icon: ICONO, badge: ICONO, lang: 'es-MX',
    // Android (Chrome) muestra los botones; iPhone los ignora y al tocar abre la hoja con los mismos dos (cz-push.js).
    actions: a.acciones,
    data: { caso: a.caso, ver: a.ver, tipo: a.tipo }
  }));
});

/** Al tocar: si la app ya está abierta, la trae al frente y le dice qué caso abrir; si no, la abre en el caso. */
function abrir(data, accion) {
  var url = destino(data, accion);
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    var mia = lista.filter(function (c) { return c.url.indexOf(self.registration.scope) === 0; })[0];
    if (mia) {
      mia.postMessage({ tipo: 'cz-abrir', caso: data && data.caso, ver: data && data.ver, accion: accion || '' });
      return mia.focus ? mia.focus().catch(function () { return mia; }) : mia;
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  });
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(abrir(e.notification.data || {}, e.action || ''));
});
