/* ═══ Conceptualizador · cola de salida (sin señal) ═══
 *
 * Todo lo que el usuario manda entra PRIMERO aquí (IndexedDB) y se pinta como
 * «en cola». La cola lo sube y lo envía cuando hay red; el mensaje solo se
 * pinta como enviado cuando el SERVIDOR lo devuelve en el hilo (hallazgo #15
 * de fts-suite: nunca pintar éxito antes de la respuesta).
 *
 *   · hora real: cada mensaje guarda `escrito_at` al escribirse, no al enviarse.
 *   · idempotencia: cada mensaje lleva `cliente_id`; si la red se cae después
 *     de que el servidor lo guardó, el reintento no lo duplica.
 *   · adjuntos: uno por petición, con su sha256; un reintento del mismo
 *     archivo regresa el mismo id (la base lo deduplica por caso + sha256).
 *   · sesión nueva sin señal: se crea local y se da de alta al volver la red.
 *   · si IndexedDB no está (modo privado, sitio bloqueado), la cola vive en
 *     memoria y la pantalla avisa que no se cierre la pestaña.
 *   · V1.32: la sesión nueva lleva su empresa y moneda; una nota de voz guarda
 *     la hora en que se EMPEZÓ a grabar; y lo que se dicta en una cajita de
 *     corregir o rechazar sin señal se guarda aquí (almacén `dictados`) y se
 *     sube solo al volver la red.
 */
(function (G) {
  'use strict';
  var C = G.CzCliente, Me = G.CzMedios;
  var DB = null, MEMORIA = { salida: {}, casos: {}, dictados: {} }, persistente = false;
  var LLAVE = { salida: 'cliente_id', casos: 'local_id', dictados: 'k' };
  var oyentes = [], corriendo = false, espera = null, progreso = {};

  function actor() { try { var s = G.SuiteAuth.getSession(); return s && s.actor; } catch (e) { return null; } }
  function id(p) { var a = new Uint8Array(9); crypto.getRandomValues(a); return p + '-' + Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (x) { return (x % 36).toString(36); }).join(''); }

  function abrir() {
    return new Promise(function (ok) {
      try {
        var q = indexedDB.open('fts-conceptualizador', 2);
        q.onupgradeneeded = function () {
          var d = q.result;
          if (!d.objectStoreNames.contains('salida')) d.createObjectStore('salida', { keyPath: 'cliente_id' });
          if (!d.objectStoreNames.contains('casos')) d.createObjectStore('casos', { keyPath: 'local_id' });
          if (!d.objectStoreNames.contains('dictados')) d.createObjectStore('dictados', { keyPath: 'k' });
        };
        q.onsuccess = function () { DB = q.result; persistente = true; ok(); };
        q.onerror = function () { ok(); };
        q.onblocked = function () { ok(); };
      } catch (e) { ok(); }
    });
  }
  function tx(almacen, modo, fn) {
    if (!DB) return Promise.resolve(fn(null));
    return new Promise(function (ok) {
      try {
        var t = DB.transaction(almacen, modo), s = t.objectStore(almacen), r = fn(s);
        t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : r); };
        t.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  async function poner(almacen, obj) {
    MEMORIA[almacen][obj[LLAVE[almacen]]] = obj;
    if (DB) await tx(almacen, 'readwrite', function (s) { return s.put(obj); });
  }
  async function quitar(almacen, llave) {
    delete MEMORIA[almacen][llave];
    if (DB) await tx(almacen, 'readwrite', function (s) { return s.delete(llave); });
  }
  async function todos(almacen) {
    if (!DB) return Object.keys(MEMORIA[almacen]).map(function (k) { return MEMORIA[almacen][k]; });
    var r = await tx(almacen, 'readonly', function (s) { return s.getAll(); });
    return (r || []).filter(function (x) { return !x.actor || x.actor === actor(); });
  }
  function avisar() { oyentes.forEach(function (f) { try { f(); } catch (e) {} }); }

  /** Nueva sesión. Con red se da de alta de inmediato; sin red queda local. */
  async function nuevaSesion(datos) {
    var c = { local_id: id('caso'), actor: actor(), titulo: datos.titulo || 'Cotización nueva', cliente: datos.cliente || '',
              pais: datos.pais || 'mx', modo: datos.modo || 'libre', empresa: datos.empresa || null,
              // V1.34: ciudad del proyecto y de la persona, aparte (solo ciudad y estado, nunca coordenadas).
              proyecto: datos.proyecto || null, persona: datos.persona || null, caso_id: null, creado: Date.now() };
    await poner('casos', c); avisar(); correr();
    return c;
  }

  /** Encola un mensaje con texto y/o archivos ya preparados por CzMedios. */
  async function encolar(destino, texto, archivos, escritoAt) {
    var it = { cliente_id: id('msg'), actor: actor(), caso_id: destino.caso_id || null, caso_local: destino.local_id || null,
               texto: texto || '', escrito_at: escritoAt || Date.now(), estado: 'pendiente', error: null, intentos: 0,
               archivos: (archivos || []).map(function (a) { return { local: id('adj'), nombre: a.nombre, mime: a.mime, clase: a.clase,
                 bytes: a.bytes, duracion_s: a.duracion_s || null, blob: a.blob, sha256: null, adjunto_id: null }; }) };
    await poner('salida', it); avisar(); correr();
    return it;
  }

  async function reintentar(cid) {
    var it = MEMORIA.salida[cid] || (await todos('salida')).filter(function (x) { return x.cliente_id === cid; })[0];
    if (!it) return; it.estado = 'pendiente'; it.error = null; it.intentos = 0; await poner('salida', it); correr(true);
  }
  async function descartar(cid) { await quitar('salida', cid); avisar(); }

  function programar(ms) { clearTimeout(espera); espera = setTimeout(function () { correr(); }, ms); }

  /** Procesa en orden: altas de sesión, luego mensajes (subir cada archivo, luego enviar). */
  async function correr(ya) {
    if (corriendo) return; corriendo = true;
    var red = false;
    try {
      var casos = await todos('casos');
      for (var i = 0; i < casos.length; i++) {
        var c = casos[i]; if (c.caso_id) continue;
        var dt = {}; if (c.proyecto) dt.proyecto = c.proyecto; if (c.persona) dt.persona = c.persona;
        var r = await C.nueva({ titulo: c.titulo, cliente: c.cliente, pais: c.pais, modo_sesion: c.modo || 'libre', empresa: c.empresa || undefined,
          datos: Object.keys(dt).length ? dt : undefined });
        if (r.ok) { c.caso_id = r.caso_id; await poner('casos', c); avisar(); }
        else if (r.clase === 'red') { red = true; break; }
      }
      var cola = (await todos('salida')).sort(function (a, b) { return a.escrito_at - b.escrito_at; });
      for (var j = 0; j < cola.length && !red; j++) {
        var it = cola[j];
        if (it.estado === 'error') continue;
        if (!it.caso_id && it.caso_local) {
          var cl = casos.filter(function (x) { return x.local_id === it.caso_local; })[0];
          if (!cl || !cl.caso_id) continue;
          it.caso_id = cl.caso_id;
        }
        it.estado = 'subiendo'; it.intentos++; await poner('salida', it); avisar();
        var fallo = null;
        for (var k = 0; k < it.archivos.length; k++) {
          var a = it.archivos[k]; if (a.adjunto_id) continue;
          if (!a.sha256) { a.sha256 = await Me.sha256(a.blob); await poner('salida', it); }
          progreso[a.local] = 0; avisar();
          var rs = await C.subir({ caso_id: it.caso_id, archivo: a.nombre, mime: a.mime, clase: a.clase, sha256: a.sha256,
            duracion_s: a.duracion_s, escrito_at: String(it.escrito_at), b64: await Me.base64(a.blob) },
            function (p) { progreso[a.local] = p; avisar(); });
          delete progreso[a.local];
          if (rs.ok) { a.adjunto_id = rs.adjunto_id; await poner('salida', it); avisar(); }
          else { fallo = rs; break; }
        }
        if (!fallo) {
          it.estado = 'enviando'; await poner('salida', it); avisar();
          var re = await C.enviar({ caso_id: it.caso_id, texto: it.texto, cliente_id: it.cliente_id, escrito_at: String(it.escrito_at),
            adjuntos: it.archivos.map(function (a) { return a.adjunto_id; }) });
          if (re.ok) { await quitar('salida', it.cliente_id); avisar(); oyentes.forEach(function (f) { try { f({ enviado: re }); } catch (e) {} }); continue; }
          fallo = re;
        }
        if (fallo.clase === 'red') { it.estado = 'pendiente'; await poner('salida', it); red = true; }
        else if (fallo.clase === 'sesion') { it.estado = 'pendiente'; await poner('salida', it); red = true; }
        else { it.estado = 'error'; it.error = fallo.mensaje || fallo.error || 'error'; await poner('salida', it); }
        avisar();
      }
    } catch (e) {
      red = true;
    } finally { corriendo = false; }
    var quedan = (await todos('salida')).some(function (x) { return x.estado !== 'error'; }) ||
                 (await todos('casos')).some(function (x) { return !x.caso_id; });
    if (quedan) programar(red ? 15000 : (ya ? 500 : 3000));
  }

  /* V1.32 · dictados de las cajitas sin señal: { k, caso_id, nota:{blob,mime,duracion_s,nombre,escrito_at} } */
  async function guardarDictado(d) { d.actor = actor(); await poner('dictados', d); avisar(); }
  async function quitarDictado(k) { await quitar('dictados', k); avisar(); }

  G.addEventListener('online', function () { correr(true); });

  G.CzCola = {
    iniciar: async function () { await abrir(); correr(true); return persistente; },
    persistente: function () { return persistente; },
    nuevaSesion: nuevaSesion, encolar: encolar, reintentar: reintentar, descartar: descartar, correr: correr,
    salida: function () { return todos('salida'); }, casosLocales: function () { return todos('casos'); },
    dictados: function () { return todos('dictados'); }, guardarDictado: guardarDictado, quitarDictado: quitarDictado,
    progreso: function (local) { return progreso[local]; },
    oir: function (f) { oyentes.push(f); },
    casoDeLocal: async function (local) { return (await todos('casos')).filter(function (x) { return x.local_id === local; })[0] || null; }
  };
})(window);
