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

  /** Encola un mensaje con texto y/o archivos ya preparados por CzMedios. `datos` (V1.39) viaja tal cual en el
   *  pedido `enviar` (firmado: json:datos); hoy solo lleva `responde_a` cuando el mensaje responde citando. */
  async function encolar(destino, texto, archivos, escritoAt, datos) {
    var it = { cliente_id: id('msg'), actor: actor(), caso_id: destino.caso_id || null, caso_local: destino.local_id || null,
               texto: texto || '', escrito_at: escritoAt || Date.now(), encolado_at: Date.now(), estado: 'pendiente', error: null, intentos: 0, fallas: 0,
               datos: datos && typeof datos === 'object' ? datos : null,
               archivos: (archivos || []).map(function (a) { return { local: id('adj'), nombre: a.nombre, mime: a.mime, clase: a.clase,
                 bytes: a.bytes, duracion_s: a.duracion_s || null, blob: a.blob, sha256: null, adjunto_id: null }; }) };
    await poner('salida', it); avisar(); correr();
    return it;
  }

  /* ── V1.65.8 (fts-conceptualizador#20, V1.64a · la cola de Richard) ────────────────────────────────────────────
   * Hasta la V1.65.7 una excepción al leer o subir UN adjunto (el iPhone que ya no puede leer un audio guardado) caía
   * en el catch general de correr(), se trataba como «sin red» y DETENÍA toda la cola sin decir nada: el primer
   * mensaje quedaba en «subiendo 1/3 · 0 %» para siempre y los de atrás en «pendiente de enviar». Ahora:
   *   · cada mensaje se intenta solo (try/catch por mensaje): uno atorado NO bloquea a los demás;
   *   · cada intento firma con ts y nonce NUEVOS (CzCliente.pedir) y la hora real viaja en escrito_at (ya firmada);
   *   · un rechazo que no se arregla reintentando deja de reintentarse: rojo, con el motivo en palabras simples;
   *   · uno que sí puede arreglarse se reintenta con espera creciente (15 s → 5 min) sin frenar a los demás;
   *   · 3 fallas seguidas, o más de 30 min en la cola con al menos una falla → «Este audio no se ha podido mandar:
   *     <motivo>» y aviso al servidor (evento `cola_atorada`, alarma en el correo diario);
   *   · nunca se borra de la cola un adjunto que el servidor no confirmó (descartar() se niega). */
  var ESPERA = [15000, 30000, 60000, 120000, 300000], ATORADO_MS = 30 * 60 * 1000, FALLAS_ALARMA = 3;
  // Errores que SÍ pueden arreglarse solos con otro intento (red, servidor caído o saturado, reloj, firma repetida).
  var REINTENTABLES = ['SIN_RED', 'RESPUESTA_INVALIDA', 'RESPUESTA_VACIA', 'FALLO_VERIFICAR', 'NO_PUBLICADO', 'FUERA_DE_VENTANA',
                       'REPETIDA', 'SECRETO_NO_CONFIGURADO', 'TOPE_SESIONES'];
  var MOTIVOS = {
    SIN_RED: 'el servidor no contesta o no hay señal',
    RESPUESTA_INVALIDA: 'el servidor contestó con un error',
    RESPUESTA_VACIA: 'el servidor no contestó nada',
    FALLO_VERIFICAR: 'el servidor no pudo revisar el envío',
    NO_PUBLICADO: 'el servicio está apagado en el servidor',
    FUERA_DE_VENTANA: 'la hora del teléfono no coincide con la del servidor (revisa fecha y hora automáticas)',
    FIRMA_INVALIDA: 'el envío no pasó la verificación de seguridad',
    ADJUNTO_GRANDE: 'el archivo pasa de 10 MB',
    ADJUNTO_ALTERADO: 'el archivo llegó dañado',
    ADJUNTO_ILEGIBLE: 'el archivo llegó dañado',
    ADJUNTO_VACIO: 'el archivo está vacío',
    ADJUNTO_NO_EXISTE: 'el archivo ya no está en el servidor',
    CASO_NO_EXISTE: 'la conversación ya no existe en el servidor',
    NO_AUTORIZADO: 'no tienes permiso de escribir en esta conversación',
    SOLO_LECTURA: 'esta conversación es de solo lectura para ti',
    TEXTO_VACIO: 'el mensaje está vacío',
    AUDIO_ILEGIBLE: 'el teléfono ya no puede leer este audio guardado',
    ARCHIVO_ILEGIBLE: 'el teléfono ya no puede leer este archivo guardado',
    FALLO_LOCAL: 'el teléfono no pudo preparar el envío'
  };
  function motivo(codigo, mensaje) { return MOTIVOS[codigo] || mensaje || ('error ' + (codigo || 'desconocido')); }
  function reintentable(codigo) { return REINTENTABLES.indexOf(codigo) >= 0; }
  function sinConfirmar(it) { return (it.archivos || []).some(function (a) { return !a.adjunto_id; }); }
  function tieneAudio(it) { return (it.archivos || []).some(function (a) { return a.clase === 'audio'; }); }
  function desde(it) { return it.encolado_at || it.escrito_at || Date.now(); }
  /** ¿Ya hay que avisar? 3 fallas seguidas, o más de 30 min en la cola con al menos una falla. */
  function atorado(it, ahora) {
    if (!it || !it.fallas) return false;
    return it.fallas >= FALLAS_ALARMA || ((ahora || Date.now()) - desde(it) > ATORADO_MS);
  }
  function aviso(it) {
    var cosa = tieneAudio(it) ? 'Este audio' : (it.archivos && it.archivos.length ? 'Este archivo' : 'Este mensaje');
    return cosa + ' no se ha podido mandar: ' + (it.motivo || motivo(it.error_codigo, it.error)) + '.';
  }

  async function reintentar(cid) {
    var it = MEMORIA.salida[cid] || (await todos('salida')).filter(function (x) { return x.cliente_id === cid; })[0];
    if (!it) return;
    it.estado = 'pendiente'; it.error = null; it.error_codigo = null; it.motivo = null; it.intentos = 0; it.fallas = 0; it.proximo_at = 0;
    await poner('salida', it); avisar(); correr(true);
  }
  /** «Reintentar» del letrero: todos los atorados vuelven a intentarse YA, con firma nueva. */
  async function reintentarTodo() {
    var L = await todos('salida');
    for (var i = 0; i < L.length; i++) { var it = L[i]; it.proximo_at = 0; if (it.estado === 'error') { it.estado = 'pendiente'; it.fallas = 0; } await poner('salida', it); }
    avisar(); correr(true);
  }
  /** Nunca se borra un adjunto que el servidor no confirmó: devuelve false y no toca nada. */
  async function descartar(cid) {
    var it = MEMORIA.salida[cid] || (await todos('salida')).filter(function (x) { return x.cliente_id === cid; })[0];
    if (it && sinConfirmar(it)) return false;
    await quitar('salida', cid); avisar(); return true;
  }

  function programar(ms) { clearTimeout(espera); espera = setTimeout(function () { correr(); }, Math.max(500, ms)); }

  /** Una falla de UN mensaje: se anota en ese mensaje y solo en ese. */
  async function anotarFalla(it, codigo, mensaje) {
    it.fallas = (it.fallas || 0) + 1; it.error_codigo = codigo || 'FALLO_LOCAL'; it.motivo = motivo(it.error_codigo, mensaje);
    it.ultimo_fallo_at = Date.now();
    if (reintentable(it.error_codigo) && it.fallas < FALLAS_ALARMA) {
      it.estado = 'pendiente'; it.error = null;
      it.proximo_at = Date.now() + ESPERA[Math.min(it.fallas - 1, ESPERA.length - 1)];
    } else if (reintentable(it.error_codigo)) {
      // Sigue intentándose solo (la red puede volver), pero ya avisa: 3 seguidas.
      it.estado = 'pendiente'; it.error = null; it.proximo_at = Date.now() + ESPERA[ESPERA.length - 1];
    } else {
      it.estado = 'error'; it.error = it.motivo; it.proximo_at = 0;   // no se arregla reintentando: rojo con su motivo
    }
    await poner('salida', it);
  }

  /** Avisa al servidor (una vez por mensaje, reintento cada 10 min) que algo no se ha podido mandar. Best-effort. */
  async function reportar(it) {
    if (!it.caso_id || it.reportado_at || (it.reporte_intento_at && Date.now() - it.reporte_intento_at < 600000)) return;
    it.reporte_intento_at = Date.now(); await poner('salida', it);
    try {
      var r = await C.evento({ caso_id: it.caso_id, tipo: 'cola_atorada', datos: {
        cliente_id: it.cliente_id, codigo: it.error_codigo || null, motivo: it.motivo || null, fallas: it.fallas || 0,
        escrito_at: Number(it.escrito_at) || null, encolado_at: Number(desde(it)) || null,
        adjuntos: (it.archivos || []).length, sin_subir: (it.archivos || []).filter(function (a) { return !a.adjunto_id; }).length,
        clases: (it.archivos || []).map(function (a) { return a.clase; }).slice(0, 20), estado: it.estado,
        navegador: String((G.navigator && G.navigator.userAgent) || '').slice(0, 160) } });
      if (r && r.ok) { it.reportado_at = Date.now(); await poner('salida', it); }
    } catch (e) {}
  }

  /** Lee un adjunto guardado. Si el teléfono ya no puede leerlo, lo dice con nombre propio en vez de lanzar. */
  async function leer(a, fn) {
    try { if (!a.blob) throw new Error('sin blob'); return { ok: true, v: await fn(a.blob) }; }
    catch (e) { return { ok: false, error: a.clase === 'audio' ? 'AUDIO_ILEGIBLE' : 'ARCHIVO_ILEGIBLE', mensaje: (e && (e.name || e.message)) || '' }; }
  }

  /** Un mensaje, de punta a punta. Devuelve 'ok' | 'falla' | 'sesion'. NUNCA lanza. */
  async function mandarUno(it) {
    try {
      it.estado = 'subiendo'; it.intentos = (it.intentos || 0) + 1; await poner('salida', it); avisar();
      for (var k = 0; k < it.archivos.length; k++) {
        var a = it.archivos[k]; if (a.adjunto_id) continue;
        if (!a.sha256) {
          var h = await leer(a, Me.sha256);
          if (!h.ok) { await anotarFalla(it, h.error, h.mensaje); return 'falla'; }
          a.sha256 = h.v; await poner('salida', it);
        }
        progreso[a.local] = 0; avisar();
        var b = await leer(a, Me.base64);
        if (!b.ok) { delete progreso[a.local]; await anotarFalla(it, b.error, b.mensaje); return 'falla'; }
        var rs = await C.subir({ caso_id: it.caso_id, archivo: a.nombre, mime: a.mime, clase: a.clase, sha256: a.sha256,
          duracion_s: a.duracion_s, escrito_at: String(it.escrito_at), b64: b.v },
          function (p) { progreso[a.local] = p; avisar(); });
        delete progreso[a.local];
        if (rs.ok) { a.adjunto_id = rs.adjunto_id; await poner('salida', it); avisar(); continue; }
        if (rs.clase === 'sesion') { it.estado = 'pendiente'; await poner('salida', it); return 'sesion'; }
        await anotarFalla(it, rs.error, rs.mensaje); return 'falla';
      }
      it.estado = 'enviando'; await poner('salida', it); avisar();
      var pe = { caso_id: it.caso_id, texto: it.texto, cliente_id: it.cliente_id, escrito_at: String(it.escrito_at),
        adjuntos: it.archivos.map(function (a) { return a.adjunto_id; }) };
      if (it.datos) pe.datos = it.datos;   // sin datos el pedido queda idéntico al de antes (firma: json:datos = null)
      var re = await C.enviar(pe);
      if (re.ok) {
        await quitar('salida', it.cliente_id); avisar();
        oyentes.forEach(function (f) { try { f({ enviado: re }); } catch (e) {} });
        return 'ok';
      }
      if (re.clase === 'sesion') { it.estado = 'pendiente'; await poner('salida', it); return 'sesion'; }
      await anotarFalla(it, re.error, re.mensaje); return 'falla';
    } catch (e) {
      Object.keys(progreso).forEach(function (l) { if (it.archivos.some(function (a) { return a.local === l; })) delete progreso[l]; });
      try { await anotarFalla(it, 'FALLO_LOCAL', e && (e.name || e.message)); } catch (e2) {}
      return 'falla';
    }
  }

  /** Procesa: altas de sesión, luego cada mensaje por su lado (subir cada archivo, luego enviar). */
  async function correr(ya) {
    if (corriendo) return; corriendo = true;
    var parar = false, ahora = Date.now();
    try {
      var casos = await todos('casos');
      for (var i = 0; i < casos.length; i++) {
        var c = casos[i]; if (c.caso_id) continue;
        try {
          var dt = {}; if (c.proyecto) dt.proyecto = c.proyecto; if (c.persona) dt.persona = c.persona;
          var r = await C.nueva({ titulo: c.titulo, cliente: c.cliente, pais: c.pais, modo_sesion: c.modo || 'libre', empresa: c.empresa || undefined,
            datos: Object.keys(dt).length ? dt : undefined });
          if (r.ok) { c.caso_id = r.caso_id; await poner('casos', c); avisar(); }
          else if (r.clase === 'sesion') { parar = true; break; }
        } catch (e) {}
      }
      var cola = (await todos('salida')).sort(function (a, b) { return a.escrito_at - b.escrito_at; });
      for (var j = 0; j < cola.length && !parar; j++) {
        var it = cola[j];
        if (it.estado === 'error') continue;
        if (!ya && it.proximo_at && it.proximo_at > ahora) continue;   // su espera, sin frenar a los demás
        if (!it.caso_id && it.caso_local) {
          var cl = casos.filter(function (x) { return x.local_id === it.caso_local; })[0];
          if (!cl || !cl.caso_id) continue;
          it.caso_id = cl.caso_id;
        }
        if (!it.encolado_at) { it.encolado_at = Number(it.escrito_at) || ahora; }
        var res = await mandarUno(it);
        if (res === 'sesion') parar = true;   // CzCliente ya mandó al login; la cola sobrevive en IndexedDB
        avisar();
      }
      // Los que ya ameritan aviso: al servidor (una vez) para la alarma del correo diario.
      var L = await todos('salida');
      for (var m = 0; m < L.length; m++) if (atorado(L[m]) || L[m].estado === 'error') await reportar(L[m]);
    } catch (e) {
      // No debería llegar aquí (cada mensaje tiene su try); si llega, NO se cuenta como «sin red» de todos.
    } finally { corriendo = false; }
    var rest = await todos('salida'), prox = Infinity, t = Date.now();
    rest.forEach(function (x) { if (x.estado !== 'error') prox = Math.min(prox, x.proximo_at && x.proximo_at > t ? x.proximo_at - t : (ya ? 500 : 3000)); });
    if ((await todos('casos')).some(function (x) { return !x.caso_id; })) prox = Math.min(prox, 15000);
    if (prox !== Infinity) programar(parar ? 15000 : prox);
    avisar();
  }

  /** Al abrir: lo que quedó «subiendo» o «enviando» de una pestaña que se cerró vuelve a «pendiente» (el 0 % no es real). */
  async function sanear() {
    var L = await todos('salida');
    for (var i = 0; i < L.length; i++) {
      var it = L[i], cambio = false;
      if (it.estado === 'subiendo' || it.estado === 'enviando') { it.estado = 'pendiente'; cambio = true; }
      if (!it.encolado_at) { it.encolado_at = Number(it.escrito_at) || Date.now(); cambio = true; }
      if (cambio) await poner('salida', it);
    }
  }

  /* V1.32 · dictados de las cajitas sin señal: { k, caso_id, nota:{blob,mime,duracion_s,nombre,escrito_at} } */
  async function guardarDictado(d) { d.actor = actor(); await poner('dictados', d); avisar(); }
  async function quitarDictado(k) { await quitar('dictados', k); avisar(); }

  G.addEventListener('online', function () { correr(true); });

  G.CzCola = {
    iniciar: async function () { await abrir(); await sanear(); correr(true); return persistente; },
    persistente: function () { return persistente; },
    nuevaSesion: nuevaSesion, encolar: encolar, reintentar: reintentar, reintentarTodo: reintentarTodo, descartar: descartar, correr: correr,
    // V1.65.8 · para la pantalla: ¿ya hay que avisar?, el texto del aviso, y si el mensaje trae algo sin confirmar.
    atorado: function (it) { return atorado(it); }, aviso: aviso, sinConfirmar: sinConfirmar, motivo: motivo,
    salida: function () { return todos('salida'); }, casosLocales: function () { return todos('casos'); },
    dictados: function () { return todos('dictados'); }, guardarDictado: guardarDictado, quitarDictado: quitarDictado,
    progreso: function (local) { return progreso[local]; },
    oir: function (f) { oyentes.push(f); },
    casoDeLocal: async function (local) { return (await todos('casos')).filter(function (x) { return x.local_id === local; })[0] || null; }
  };
})(window);
