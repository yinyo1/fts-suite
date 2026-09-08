/* ═══ Machote · el almacén ═══
 *
 * UNA sola pieza entre la pantalla y donde viven los datos. Desde el issue
 * #140 los machotes viven en el Postgres de la suite (`fts-suite-db`, esquema
 * `comercial`); el navegador dejó de ser el almacén y pasó a ser la CACHÉ.
 * **Ésta sigue siendo la única pieza que sabe eso.** La pantalla no sabe
 * contra qué guarda y no debe saberlo.
 *
 * ── El orden importa: primero local, después servidor ────────────────────
 * Toda escritura toca `localStorage` PRIMERO y de forma síncrona, y sólo
 * después sale a la red. No es una optimización, son dos requisitos:
 *
 *   · **Sin red se sigue capturando.** Si el servidor no contesta, lo tecleado
 *     ya está en el navegador y queda PENDIENTE de subir. Se reintenta en el
 *     siguiente guardado y al abrir la pantalla.
 *   · Nunca se pinta "guardado" antes de que lo esté. Es el anti-patrón más
 *     caro que tiene documentado este repo — el kiosko mostraba "✓ SALIDA"
 *     antes del POST y por eso hubo 12 h de datos perdidos sin que nadie lo
 *     notara (CLAUDE.md hallazgo #15).
 *
 * ── Lo que NO se toca ────────────────────────────────────────────────────
 * La llave `fts_machote_v1` y su sobre `{v, guardado_at, machotes, handoff}`
 * se quedan EXACTAMENTE igual: hay capturas reales adentro, de gente que no
 * se enteró de esta sesión, y cambiar el formato las orfanaría. Lo nuevo vive
 * en una llave aparte, `fts_machote_sync_v1`.
 *
 * ── Reconciliación ───────────────────────────────────────────────────────
 * Los `id` nacidos en el navegador (`M-1757…`) son únicos POR NAVEGADOR, no
 * entre personas. Viajan al servidor como `id_local` y ahí se reconcilian; la
 * llave de verdad es el `uuid` que asigna Postgres. Por eso el servidor puede
 * rechazar un guardado con `MACHOTE_DE_OTRA_PERSONA`: dos navegadores pueden
 * generar el mismo `M-…`.
 */
(function (G) {
  'use strict';

  var LLAVE = 'fts_machote_v1';        // la caché de trabajo · NO CAMBIAR
  var LLAVE_SYNC = 'fts_machote_sync_v1';  // qué se subió y en qué versión

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_LEER = BASE + '/comercial/machotes-leer';
  var URL_GUARDAR = BASE + '/comercial/machote-guardar';
  var TIMEOUT_MS = 12000;

  /* Que exista el objeto no basta: en modo privado de Safari `localStorage`
   * existe y **tira** al escribir. La única prueba que vale es escribir. */
  function disponible() {
    try {
      var t = '__p' + Date.now();
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  var VIVO = disponible();

  // ── La caché del navegador ───────────────────────────────────────────────

  /** Lo guardado en ESTE navegador, o `null` si no hay nada o está corrupto.
   *  Un JSON roto NO debe tumbar la aplicación: se descarta y se sigue con los
   *  datos de ejemplo, que es exactamente lo que quiere quien abre la página. */
  function leerLocal() {
    if (!VIVO) return null;
    try {
      var crudo = localStorage.getItem(LLAVE);
      if (!crudo) return null;
      var d = JSON.parse(crudo);
      if (!d || !Array.isArray(d.machotes)) return null;
      return d;
    } catch (e) { return null; }
  }

  /** Guarda en el navegador. Devuelve `true` sólo si de verdad quedó.
   *  Se relee lo escrito a propósito: en este repo ya costó caro dar por bueno
   *  un `200` que no probaba la escritura (CLAUDE.md §8). Aquí es barato
   *  comprobarlo, así que se comprueba. */
  function escribirLocal(datos) {
    if (!VIVO) return false;
    try {
      var payload = JSON.stringify({
        v: 1,
        guardado_at: new Date().toISOString(),
        machotes: datos.machotes,
        handoff: datos.handoff || {}
      });
      localStorage.setItem(LLAVE, payload);
      return localStorage.getItem(LLAVE) === payload;
    } catch (e) { return false; }
  }

  function olvidar() {
    if (!VIVO) return;
    try {
      localStorage.removeItem(LLAVE);
      localStorage.removeItem(LLAVE_SYNC);
    } catch (e) { /* nada que hacer */ }
  }

  // ── La libreta de sincronización ─────────────────────────────────────────
  // Por machote: en qué versión quedó en el servidor y con qué contenido, para
  // saber cuáles hay que subir sin volver a subirlos todos cada vez.

  function leerSync() {
    if (!VIVO) return {};
    try {
      var d = JSON.parse(localStorage.getItem(LLAVE_SYNC) || '{}');
      return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
    } catch (e) { return {}; }
  }

  function escribirSync(s) {
    if (!VIVO) return false;
    try { localStorage.setItem(LLAVE_SYNC, JSON.stringify(s)); return true; }
    catch (e) { return false; }
  }

  /* Huella del contenido para saber si cambió desde la última subida. No es
   * criptografía: sólo hace falta que dos contenidos distintos den huellas
   * distintas con altísima probabilidad, y que sea barato en cada tecla. */
  function huella(obj) {
    var s;
    try { s = JSON.stringify(obj); } catch (e) { return 'x' + Date.now(); }
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0; h1 = (h1 * 0x01000193) >>> 0;
      h2 = (h2 + c * (i + 1)) >>> 0;
    }
    return h1.toString(16) + '-' + h2.toString(16) + '-' + s.length;
  }

  /* Huella CANÓNICA: igual que `huella` pero con las llaves ordenadas, a todas
   * las profundidades.
   *
   * Hace falta una segunda porque **Postgres `jsonb` no conserva el orden de
   * las llaves**: lo que sube como `{nombre, secciones, nota}` vuelve como
   * `{nota, nombre, secciones}`. Con `JSON.stringify` normal, un documento
   * idéntico da huellas distintas de ida y de vuelta, y la franja diría
   * "pendiente" de algo que ya está a salvo.
   *
   * `huella` se queda para comparar local contra local —el orden es estable
   * ahí, y cambiarla invalidaría la libreta de sincronización de todos, que
   * volvería a subir todo—; ésta es sólo para comparar contra el servidor. */
  function canonico(x) {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(canonico);
    var llaves = Object.keys(x).sort(), o = {}, i;
    for (i = 0; i < llaves.length; i++) o[llaves[i]] = canonico(x[llaves[i]]);
    return o;
  }

  function huellaCanonica(obj) { return huella(canonico(obj)); }

  /** Cuántos machotes están escritos aquí pero todavía no en el servidor. */
  function pendientes(machotes) {
    var lista = machotes || ((leerLocal() || {}).machotes) || [];
    var s = leerSync(), n = 0;
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (!m || !m.id) continue;
      var meta = s[m.id];
      if (!meta || meta.huella !== huella(m)) n++;
    }
    return n;
  }

  // ── El servidor ──────────────────────────────────────────────────────────

  function sesion() {
    var S = G.SuiteAuth;
    if (!S || !S.getToken) return null;
    var t = S.getToken();
    return t ? { token: t, actor: (S.getSession && S.getSession() || {}).actor || null } : null;
  }

  /** POST al webhook. Resuelve SIEMPRE —nunca rechaza— para que la pantalla
   *  no tenga que envolver cada llamada en su propio try. Un fallo de red es
   *  un resultado normal aquí, no una excepción. */
  function postear(url, cuerpo) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var reloj = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El token viaja en el CUERPO, no en un header Authorization: un header
      // fuerza preflight CORS que el webhook de n8n puede no contestar
      // (patrón validado en Finanzas, CLAUDE.md §15 #5).
      body: JSON.stringify(cuerpo),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: 'RESPUESTA_INVALIDA',
                 mensaje: 'El servidor respondió algo que no se entiende.' };
      });
    }).catch(function () {
      return { ok: false, error: 'SIN_RED',
               mensaje: 'No se pudo contactar al servidor. Lo capturado sigue en este navegador.' };
    }).then(function (d) {
      if (reloj) clearTimeout(reloj);
      return d || { ok: false, error: 'RESPUESTA_VACIA' };
    });
  }

  /* Los consultables que el servidor indexa. Salen del machote, no del
   * documento interpretado: si mañana cambia la forma de las secciones, esto
   * sigue funcionando. El `total` se pide a calc si está cargado, y si no se
   * manda null — es para ordenar, no para decidir nada. */
  function resumenDe(m) {
    var total = null;
    try {
      if (G.MachoteCalc && G.MachoteCalc.calcular) {
        var c = G.MachoteCalc.calcular(m);
        if (c && isFinite(Number(c.precio_venta))) total = Number(c.precio_venta);
        else if (c && isFinite(Number(c.total))) total = Number(c.total);
      }
    } catch (e) { total = null; }

    return {
      total: total,
      margen: isFinite(Number(m.margen_deseado)) ? Number(m.margen_deseado) : null,
      moneda: m.moneda || null,
      tc: isFinite(Number(m.tc)) ? Number(m.tc) : null,
      tc_fuente: m.tc_fuente || null,
      comision_fts: isFinite(Number(m.comision_fts)) ? Number(m.comision_fts) : null,
      comision_cliente: isFinite(Number(m.comision_cliente)) ? Number(m.comision_cliente) : null
    };
  }

  /** Sube UN machote. El servidor agrega una versión nueva al historial; no
   *  reescribe nada. Resuelve `{ok, error, mensaje, version}`. */
  function empujarUno(m, ses, motivo) {
    var s = leerSync();
    var meta = s[m.id] || { version: 0 };
    return postear(URL_GUARDAR, {
      token: ses.token,
      id_local: m.id,
      cliente_odoo_id: (typeof m.cliente_id === 'number') ? m.cliente_id : null,
      version_leida: Number(meta.version) || 0,
      estado: m.estado || 'borrador',
      motivo: motivo || null,
      documento: m,
      resumen: resumenDe(m)
    }).then(function (r) {
      if (r && r.ok === true) {
        var s2 = leerSync();
        s2[m.id] = {
          version: r.version,
          huella: huella(m),
          machote_id: r.machote_id,
          empujado_at: new Date().toISOString()
        };
        escribirSync(s2);
        return { ok: true, version: r.version, machote_id: r.machote_id };
      }
      /* Choque de versión: alguien más guardó. NO se pisa y NO se reintenta en
       * silencio — se avisa, porque resolverlo es una decisión de persona. */
      return { ok: false, error: (r && r.error) || 'DESCONOCIDO',
               mensaje: (r && r.mensaje) || 'No se pudo guardar en el servidor.' };
    });
  }

  /* Una sola subida a la vez. El autoguardado dispara medio segundo después
   * de la última tecla, así que con el servidor lento se encimarían varias
   * subidas del MISMO machote — y la segunda chocaría contra la primera con
   * un falso conflicto de versión, porque la versión que leyó ya cambió.
   * Si llega otra mientras hay una en vuelo, se devuelve la que ya corre: lo
   * que falte se recalcula sobre el estado nuevo en el siguiente guardado. */
  var _enVuelo = null;

  /** Sube lo que falte. Uno por uno, a propósito: el servidor guarda UN
   *  machote por llamada, y si uno falla los demás sí suben. */
  function empujar(machotes, motivos) {
    if (_enVuelo) return _enVuelo;
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION', subidos: 0,
        mensaje: 'No hay sesión: lo capturado queda en este navegador.' });
    }

    var lista = machotes || ((leerLocal() || {}).machotes) || [];
    var s = leerSync();
    var falta = [];
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (!m || !m.id) continue;
      var meta = s[m.id];
      if (!meta || meta.huella !== huella(m)) falta.push(m);
    }

    if (!falta.length) return Promise.resolve({ ok: true, subidos: 0, fallos: [] });

    var subidos = 0, fallos = [];
    var cadena = Promise.resolve();
    falta.forEach(function (m) {
      cadena = cadena.then(function () {
        return empujarUno(m, ses, motivos && motivos[m.id]).then(function (r) {
          if (r.ok) subidos++;
          else fallos.push({ id: m.id, nombre: m.nombre, error: r.error, mensaje: r.mensaje });
        });
      });
    });

    _enVuelo = cadena.then(function () {
      _enVuelo = null;
      return { ok: fallos.length === 0, subidos: subidos, fallos: fallos };
    }, function (e) {
      _enVuelo = null;
      return { ok: false, subidos: subidos, fallos: fallos, error: 'FALLO_INESPERADO' };
    });
    return _enVuelo;
  }

  /** Baja lo que hay en el servidor y lo funde con lo local.
   *
   *  REGLA DURA DE LA FUSIÓN: **nunca se pierde un machote local.** Lo que
   *  tiene cambios sin subir gana siempre; lo que ya está sincronizado se
   *  refresca con la versión del servidor (puede venir de otro dispositivo);
   *  lo que sólo existe en el servidor se agrega. */
  function bajar() {
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION', bajados: 0 });
    }

    return postear(URL_LEER, { token: ses.token }).then(function (r) {
      if (!r || r.ok !== true || !Array.isArray(r.machotes)) {
        return { ok: false, error: (r && r.error) || 'DESCONOCIDO',
                 mensaje: (r && r.mensaje) || 'No se pudieron leer los machotes del servidor.',
                 bajados: 0 };
      }

      var local = leerLocal() || { machotes: [], handoff: {} };
      var lista = Array.isArray(local.machotes) ? local.machotes.slice() : [];
      var s = leerSync();

      var porId = {}, i;
      for (i = 0; i < lista.length; i++) if (lista[i] && lista[i].id) porId[lista[i].id] = i;

      var nuevos = 0, refrescados = 0, conservados = 0;

      for (i = 0; i < r.machotes.length; i++) {
        var fila = r.machotes[i];
        if (!fila || !fila.id_local || !fila.documento) continue;

        var doc = machoteDesdeFila(fila);

        var pos = porId[fila.id_local];
        if (pos === undefined) {
          lista.push(doc);
          porId[fila.id_local] = lista.length - 1;
          nuevos++;
        } else {
          var mio = lista[pos];
          var meta = s[fila.id_local];
          var pendiente = !meta || meta.huella !== huella(mio);
          if (pendiente) {
            // Lo mío no ha subido: no se pisa. Sube en el siguiente empujón.
            conservados++;
            continue;
          }
          lista[pos] = doc;
          refrescados++;
        }

        s[fila.id_local] = {
          version: fila.version,
          huella: huella(doc),
          machote_id: fila.id,
          empujado_at: new Date().toISOString()
        };
      }

      escribirSync(s);
      var quedo = escribirLocal({ machotes: lista, handoff: local.handoff || {} });

      return { ok: true, bajados: r.machotes.length, nuevos: nuevos,
               refrescados: refrescados, conservados: conservados,
               machotes: lista, handoff: local.handoff || {}, cache_ok: quedo };
    });
  }

  /* Convierte una fila del servidor en un machote de los de aquí.
   *
   * Vive en UN solo lugar a propósito: la usan `bajar()` —para traerlo— y
   * `estadoServidor()` —para compararlo—. Cuando estaban separadas, `bajar`
   * reponía `estado` desde la columna y la comparación no, así que un machote
   * recién bajado se veía distinto de sí mismo y la franja decía "por subir"
   * de algo que acababa de llegar del servidor. Un solo escritor por regla,
   * también cuando la regla es una conversión (CLAUDE.md §20 #4). */
  /* El CONTENIDO tal como el servidor lo guardó, con lo único que el servidor
   * no mete dentro del documento: el id local. Esto es lo que se compara
   * contra lo de aquí para saber si está a salvo. */
  function documentoDeFila(fila) {
    var doc = JSON.parse(JSON.stringify(fila.documento || {}));
    doc.id = fila.id_local;
    return doc;
  }

  /* Lo mismo, ya listo para PINTARSE. La diferencia es una reparación: si el
   * documento no trae `estado` —uno viejo, o guardado por otra versión— se
   * repone desde la columna del servidor, que es la que manda.
   *
   * Y por eso son dos y no una: la reparación no puede entrar en la
   * comparación. Si entrara, un machote legado se vería distinto de sí mismo
   * y la franja diría "por subir" de algo que acaba de bajar del servidor. */
  function machoteDesdeFila(fila) {
    var doc = documentoDeFila(fila);
    if (!doc.estado && fila.estado) doc.estado = fila.estado;
    return doc;
  }

  /** Qué tiene el SERVIDOR de esta persona, comparado con lo que hay aquí.
   *
   *  Ésta es la fuente de la franja de sincronización, y por eso pregunta al
   *  servidor en vez de leer la libreta local. La diferencia importa justo en
   *  el caso que estamos resolviendo: si alguien limpia los datos del sitio,
   *  la libreta desaparece y diría "nada subido" cuando en realidad está todo
   *  a salvo. El servidor no se equivoca en eso.
   *
   *  Resuelve SIEMPRE. Sin red devuelve `ok:false` con lo que se sabe de aquí,
   *  para que la franja pueda decir "no se pudo confirmar" en vez de mentir en
   *  cualquiera de las dos direcciones. */
  function estadoServidor(machotes) {
    var lista = machotes || ((leerLocal() || {}).machotes) || [];
    var ses = sesion();

    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION', total: lista.length,
        subidos: 0, pendientes: lista.length, ids_pendientes: lista.map(function (m) { return m.id; }),
        mensaje: 'No hay sesión, así que no se puede confirmar qué hay en el servidor.' });
    }

    return postear(URL_LEER, { token: ses.token }).then(function (r) {
      if (!r || r.ok !== true || !Array.isArray(r.machotes)) {
        return { ok: false, error: (r && r.error) || 'DESCONOCIDO',
          mensaje: (r && r.mensaje) || 'No se pudo preguntar al servidor.',
          total: lista.length, subidos: 0, pendientes: lista.length,
          ids_pendientes: lista.map(function (m) { return m.id; }) };
      }

      var enServidor = {}, i;
      for (i = 0; i < r.machotes.length; i++) {
        var f = r.machotes[i];
        if (f && f.id_local) enServidor[f.id_local] = f;
      }

      var ids = [], subidos = 0, desfasados = 0;
      for (i = 0; i < lista.length; i++) {
        var m = lista[i];
        if (!m || !m.id) continue;
        var fila = enServidor[m.id];
        if (!fila) { ids.push(m.id); continue; }                  // no llegó nunca
        var doc = documentoDeFila(fila);          // el contenido, sin reparaciones
        if (huellaCanonica(doc) !== huellaCanonica(m)) {
          ids.push(m.id); desfasados++;                           // llegó, pero lo de aquí cambió después
          continue;
        }
        subidos++;
      }

      return { ok: true, total: lista.length, subidos: subidos,
        pendientes: ids.length, desfasados: desfasados, ids_pendientes: ids,
        en_servidor_total: r.machotes.length, actor: r.actor,
        leido_at: new Date().toISOString() };
    });
  }

  /** El historial completo de un machote, del servidor. Para la pantalla de
   *  versiones: la caché del navegador sólo tiene la última. */
  function historial(idLocal) {
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: el historial vive en el servidor.' });
    }
    var s = leerSync();
    var meta = s[idLocal];
    if (!meta || !meta.machote_id) {
      return Promise.resolve({ ok: false, error: 'NUNCA_SUBIDO',
        mensaje: 'Este machote todavía no llega al servidor, así que no tiene historial.' });
    }
    return postear(URL_LEER, { token: ses.token, machote_id: meta.machote_id });
  }

  /** Guarda: navegador primero (síncrono, nunca falla por red), servidor
   *  después. Resuelve `{local, servidor, pendientes, fallos}`.
   *
   *  Devuelve una promesa, pero `local` ya es verdad cuando la promesa se
   *  crea: quien sólo necesite saber si lo tecleado está a salvo en este
   *  navegador puede leer `escribirLocal` directo y no esperar nada. */
  function escribir(datos, motivos) {
    var local = escribirLocal(datos);
    if (!local) {
      return Promise.resolve({ local: false, servidor: false, pendientes: 0,
        fallos: [], error: 'SIN_ALMACEN' });
    }
    return empujar(datos.machotes, motivos).then(function (r) {
      return {
        local: true,
        servidor: r.ok === true,
        subidos: r.subidos || 0,
        pendientes: pendientes(datos.machotes),
        fallos: r.fallos || [],
        error: r.ok ? null : (r.error || null),
        mensaje: r.ok ? null : (r.mensaje || null)
      };
    });
  }

  /* ── El sobre del respaldo ────────────────────────────────────────────
   *
   * ⚠️ NO es el formato del almacén. `fts_machote_v1` y su sobre
   * `{v, guardado_at, machotes, handoff}` **no se tocan** — hay capturas
   * reales adentro y cambiarlos las orfanaría. Esto es un envoltorio APARTE,
   * para el archivo que se descarga: lleva el almacén tal cual en `datos` y
   * le agrega quién lo exportó, que es lo que el archivo necesita saber y el
   * almacén no.
   *
   * Por qué el navegador va dentro: si alguien capturó en la laptop y en el
   * teléfono son dos archivos parciales, y al juntarlos hay que poder decir
   * cuál vino de dónde. */
  function sobre(sesion) {
    return {
      formato: 'fts-machote-respaldo',
      v: 1,
      exportado_at: new Date().toISOString(),
      exportado_por: (sesion && sesion.actor) || '',
      exportado_por_nombre: (sesion && sesion.nombre) || '',
      navegador: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
      datos: leerLocal() || { v: 1, machotes: [], handoff: {} }
    };
  }

  /** Saca la lista de machotes de un archivo. Acepta el sobre de exportar y
   *  también el crudo del almacén, porque quien pegue un respaldo a mano no
   *  tiene por qué saber la diferencia. */
  function machotesDe(obj) {
    if (!obj) return null;
    if (obj.datos && Array.isArray(obj.datos.machotes)) return obj.datos.machotes;
    if (Array.isArray(obj.machotes)) return obj.machotes;
    return null;
  }

  G.MachoteAlmacen = {
    nombre: 'postgres+cache',
    disponible: function () { return VIVO; },

    // Síncrono: la caché de este navegador. Es con lo que arranca la pantalla,
    // para que abra al instante y funcione sin red.
    leer: leerLocal,
    leerLocal: leerLocal,
    escribirLocal: escribirLocal,

    // Asíncrono: el servidor.
    escribir: escribir,
    bajar: bajar,
    empujar: empujar,
    historial: historial,

    pendientes: pendientes,
    estadoServidor: estadoServidor,
    huellaCanonica: huellaCanonica,
    olvidar: olvidar,
    sobre: sobre,
    machotesDe: machotesDe
  };
})(window);
