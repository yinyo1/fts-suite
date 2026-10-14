/* ═══ shared/chat · cola de salida sin señal (#407 §2.2) ═══
 *
 * Generalización de cz-cola.js del conceptualizador. Todo lo que el usuario manda entra
 * PRIMERO aquí (IndexedDB) y se pinta como «pendiente de enviar». La cola sube cada archivo
 * con su sha256 y manda el mensaje cuando hay red; el mensaje solo se pinta como enviado
 * cuando el SERVIDOR lo devuelve en el hilo (CLAUDE.md §15: nunca pintar éxito antes).
 *
 *   ChatCola.crear({ cliente, medios, idb: 'fts-marketing' }) → cola
 *   cola.iniciar() · nuevaSesion({tipo,titulo,datos}) · encolar(destino, texto, archivos, escritoAt)
 *   cola.salida() · sesionesLocales() · reintentar(id) · descartar(id) · oir(f) · correr()
 *
 *   · hora real: cada mensaje guarda `escrito_at` al escribirse, no al enviarse;
 *   · idempotencia: `cliente_id` por mensaje y `local_id` por sesión (la base no duplica);
 *   · sesión nueva sin señal: se crea local y se da de alta al volver la red;
 *   · sin IndexedDB (modo privado): la cola vive en memoria y la pantalla lo avisa.
 */
(function (G) {
  'use strict';
  function crear(cfg) {
    var C = cfg.cliente, Me = cfg.medios, NOMBRE = cfg.idb || 'fts-chat';
    var DB = null, MEM = { salida: {}, sesiones: {} }, persistente = false;
    var LLAVE = { salida: 'cliente_id', sesiones: 'local_id' };
    var oyentes = [], corriendo = false, espera = null, progreso = {};

    function actor() { try { var s = G.SuiteAuth.getSession(); return s && (s.actor || s.sub || s.username); } catch (e) { return null; } }
    function id(p) { var a = new Uint8Array(9); crypto.getRandomValues(a); return p + '-' + Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (x) { return (x % 36).toString(36); }).join(''); }
    function abrir() {
      return new Promise(function (ok) {
        try {
          var q = indexedDB.open(NOMBRE, 1);
          q.onupgradeneeded = function () {
            var d = q.result;
            if (!d.objectStoreNames.contains('salida')) d.createObjectStore('salida', { keyPath: 'cliente_id' });
            if (!d.objectStoreNames.contains('sesiones')) d.createObjectStore('sesiones', { keyPath: 'local_id' });
          };
          q.onsuccess = function () { DB = q.result; persistente = true; ok(); };
          q.onerror = function () { ok(); }; q.onblocked = function () { ok(); };
        } catch (e) { ok(); }
      });
    }
    function tx(alm, modo, fn) {
      if (!DB) return Promise.resolve(null);
      return new Promise(function (ok) {
        try { var t = DB.transaction(alm, modo), r = fn(t.objectStore(alm));
          t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : r); }; t.onerror = function () { ok(null); };
        } catch (e) { ok(null); }
      });
    }
    async function poner(alm, o) { MEM[alm][o[LLAVE[alm]]] = o; if (DB) await tx(alm, 'readwrite', function (s) { return s.put(o); }); }
    async function quitar(alm, k) { delete MEM[alm][k]; if (DB) await tx(alm, 'readwrite', function (s) { return s.delete(k); }); }
    async function todos(alm) {
      if (!DB) return Object.keys(MEM[alm]).map(function (k) { return MEM[alm][k]; });
      var r = await tx(alm, 'readonly', function (s) { return s.getAll(); });
      return (r || []).filter(function (x) { return !x.actor || x.actor === actor(); });
    }
    function avisar(extra) { oyentes.forEach(function (f) { try { f(extra); } catch (e) {} }); }

    async function nuevaSesion(d) {
      var s = { local_id: id('ses'), actor: actor(), tipo: d.tipo || 'libre', titulo: d.titulo || 'Sesión nueva', datos: d.datos || {},
                sesion_id: null, error: null, creado: Date.now() };
      await poner('sesiones', s); avisar(); correr(true);
      return s;
    }
    async function encolar(destino, texto, archivos, escritoAt) {
      var it = { cliente_id: id('msg'), actor: actor(), sesion_id: destino.sesion_id || null, sesion_local: destino.local_id || null,
        texto: texto || '', escrito_at: escritoAt || Date.now(), estado: 'pendiente', error: null, intentos: 0,
        archivos: (archivos || []).map(function (a) { return { local: id('adj'), nombre: a.nombre, mime: a.mime, clase: a.clase, bytes: a.bytes,
          duracion_s: a.duracion_s || null, blob: a.blob, sha256: null, adjunto_id: null }; }) };
      await poner('salida', it); avisar(); correr(true);
      return it;
    }
    async function reintentar(cid) {
      var it = (await todos('salida')).filter(function (x) { return x.cliente_id === cid; })[0];
      if (!it) return; it.estado = 'pendiente'; it.error = null; await poner('salida', it); correr(true);
    }
    async function reintentarSesion(lid) {
      var s = (await todos('sesiones')).filter(function (x) { return x.local_id === lid; })[0];
      if (!s) return; s.error = null; await poner('sesiones', s); correr(true);
    }
    async function descartar(cid) { await quitar('salida', cid); avisar(); }
    async function descartarSesion(lid) {
      await quitar('sesiones', lid);
      var cola = await todos('salida');
      for (var i = 0; i < cola.length; i++) if (cola[i].sesion_local === lid && !cola[i].sesion_id) await quitar('salida', cola[i].cliente_id);
      avisar();
    }
    function programar(ms) { clearTimeout(espera); espera = setTimeout(function () { correr(); }, ms); }

    async function correr(ya) {
      if (corriendo) return; corriendo = true;
      var red = false;
      try {
        var ses = await todos('sesiones');
        for (var i = 0; i < ses.length && !red; i++) {
          var s = ses[i]; if (s.sesion_id || s.error) continue;
          var r = await C.pedir('nueva', { tipo: s.tipo, titulo: s.titulo, local_id: s.local_id, datos: s.datos });
          if (r.ok) { s.sesion_id = r.sesion_id; await poner('sesiones', s); avisar({ sesion: s }); }
          else if (r.clase === 'red') red = true;
          else if (r.clase !== 'sesion') { s.error = r.mensaje || r.error; await poner('sesiones', s); avisar({ errorSesion: s }); }
          else red = true;
        }
        var cola = (await todos('salida')).sort(function (a, b) { return a.escrito_at - b.escrito_at; });
        for (var j = 0; j < cola.length && !red; j++) {
          var it = cola[j];
          if (it.estado === 'error') continue;
          if (!it.sesion_id && it.sesion_local) {
            var sl = ses.filter(function (x) { return x.local_id === it.sesion_local; })[0];
            if (!sl || !sl.sesion_id) continue;
            it.sesion_id = sl.sesion_id;
          }
          it.estado = 'subiendo'; it.intentos++; await poner('salida', it); avisar();
          var fallo = null;
          for (var k = 0; k < it.archivos.length; k++) {
            var a = it.archivos[k]; if (a.adjunto_id) continue;
            if (!a.sha256) { a.sha256 = await Me.sha256(a.blob); await poner('salida', it); }
            progreso[a.local] = 0; avisar();
            var rs = await C.subir({ sesion_id: it.sesion_id, archivo: a.nombre, mime: a.mime, clase: a.clase, sha256: a.sha256,
              duracion_s: a.duracion_s, escrito_at: String(it.escrito_at), b64: await Me.base64(a.blob) },
              (function (loc) { return function (p) { progreso[loc] = p; avisar(); }; })(a.local));
            delete progreso[a.local];
            if (rs.ok) { a.adjunto_id = rs.adjunto_id; await poner('salida', it); avisar(); } else { fallo = rs; break; }
          }
          if (!fallo) {
            it.estado = 'enviando'; await poner('salida', it); avisar();
            var re = await C.pedir('enviar', { sesion_id: it.sesion_id, texto: it.texto, cliente_id: it.cliente_id, escrito_at: String(it.escrito_at),
              adjuntos: it.archivos.map(function (x) { return x.adjunto_id; }) });
            if (re.ok) { await quitar('salida', it.cliente_id); avisar({ enviado: re, sesion_id: it.sesion_id }); continue; }
            fallo = re;
          }
          if (fallo.clase === 'red' || fallo.clase === 'sesion') { it.estado = 'pendiente'; await poner('salida', it); red = true; }
          else { it.estado = 'error'; it.error = fallo.mensaje || fallo.error || 'error'; await poner('salida', it); }
          avisar();
        }
      } catch (e) { red = true; } finally { corriendo = false; }
      var quedan = (await todos('salida')).some(function (x) { return x.estado !== 'error'; }) ||
                   (await todos('sesiones')).some(function (x) { return !x.sesion_id && !x.error; });
      if (quedan) programar(red ? 15000 : (ya ? 500 : 3000));
    }
    G.addEventListener('online', function () { correr(true); });
    return {
      iniciar: async function () { await abrir(); correr(true); return persistente; },
      persistente: function () { return persistente; },
      nuevaSesion: nuevaSesion, encolar: encolar, reintentar: reintentar, reintentarSesion: reintentarSesion,
      descartar: descartar, descartarSesion: descartarSesion, correr: correr,
      salida: function () { return todos('salida'); }, sesionesLocales: function () { return todos('sesiones'); },
      progreso: function (local) { return progreso[local]; }, oir: function (f) { oyentes.push(f); }
    };
  }
  G.ChatCola = { crear: crear };
})(window);
