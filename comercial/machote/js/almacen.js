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
  /* ── LA LÁPIDA (V1.23) ──────────────────────────────────────────────────
   * Los `id_local` que se borraron EN ESTE NAVEGADOR. Sin esto, borrar no
   * servía de nada: `bajar()` ve una fila del servidor cuyo `id_local` ya no
   * está en la lista local, no tiene forma de distinguir «nunca llegó aquí»
   * de «se borró aquí», y la vuelve a meter. Al recargar reaparece, cada vez.
   *
   * Es lo que reportó Esteban de los ejemplos, y NO era sólo de los ejemplos:
   * le pasaba a CUALQUIER machote ya subido. Los ejemplos se notaron porque
   * son los que todo el mundo borra el primer día.
   *
   * Es POR NAVEGADOR a propósito: borrar aquí no borra en el servidor —para
   * eso hace falta una decisión de más peso, y un borrado que se propague sin
   * pedirlo es el error que no tiene vuelta. */
  var LLAVE_BORRADOS = 'fts_machote_borrados_v1';

  /* ── El cajón de lo PRESTADO (V1.25) ─────────────────────────────────────
   * Un machote que otra persona me prestó es editable, así que lo que teclee
   * tiene que sobrevivir una recarga. Pero NO puede vivir en `fts_machote_v1`:
   * esa llave significa «lo mío» y meter ahí lo de otro rompe dos cosas
   * concretas —el `id_local` de Ricardo puede chocar con uno mío, y `empujar`
   * lo subiría como propio, que es cómo el servidor le pondría de dueño a
   * quien manda—. Una prueba dedicada vigila que `fts_machote_v1` nunca
   * contenga trabajo ajeno.
   *
   * Así que van a un cajón aparte, indexado por el UUID DEL SERVIDOR —que es
   * como se nombra lo ajeno en pantalla— y con su propia contabilidad de
   * versiones. Cada renglón:
   *     { id_local, version_leida, documento, guardado_at }
   * `id_local` es el REAL, el del dueño: es lo que el servidor necesita para
   * saber sobre qué identidad está agregando una versión. Mandar el uuid en
   * su lugar crearía un machote nuevo. */
  var LLAVE_PRESTADO = 'fts_machote_prestado_v1';

  function leerPrestados() {
    try { return JSON.parse(localStorage.getItem(LLAVE_PRESTADO) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function escribirPrestados(o) {
    try { localStorage.setItem(LLAVE_PRESTADO, JSON.stringify(o)); return true; }
    catch (e) { return false; }
  }

  /** Guarda EN ESTE NAVEGADOR lo que se está tecleando sobre un prestado.
   *  Síncrono y sin red, igual que `escribirLocal` para lo propio: es lo que
   *  garantiza que un rechazo del servidor no cueste el trabajo. */
  function guardarPrestadoLocal(m) {
    if (!m || !m.id) return false;
    var todos = leerPrestados();
    var previo = todos[m.id] || {};
    todos[m.id] = {
      id_local: m._id_local || previo.id_local || null,
      version_leida: (m._version_servidor !== undefined && m._version_servidor !== null)
        ? m._version_servidor : (previo.version_leida || 0),
      documento: documentoDeMachote(m),
      guardado_at: new Date().toISOString()
    };
    return escribirPrestados(todos);
  }

  /** Lo deja de seguir: se subió, o se acabó el préstamo y ya no hay nada que
   *  recuperar. NO se llama al vencer un permiso con cambios sin subir — ahí
   *  justamente es cuando hace falta conservarlo. */
  function olvidarPrestado(uuid) {
    var todos = leerPrestados();
    if (todos[uuid]) { delete todos[uuid]; escribirPrestados(todos); }
  }

  /* El documento limpio, sin los campos que le cuelga la pantalla a lo ajeno
   * (`_ajeno`, `_dueno`, `_folio`…). Van con guion bajo por esto mismo. */
  function documentoDeMachote(m) {
    var o = {};
    for (var k in m) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
      if (k.charAt(0) === '_') continue;
      o[k] = m[k];
    }
    return o;
  }

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_LEER = BASE + '/comercial/machotes-leer';
  var URL_GUARDAR = BASE + '/comercial/machote-guardar';
  var URL_PRESTAR = BASE + '/comercial/machote-prestar';
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
      /* Y las lápidas. `olvidar` significa «este navegador no sabe nada»: si
       * las lápidas sobrevivieran, la siguiente bajada saltaría machotes que
       * están en el servidor y nadie entendería por qué faltan. */
      localStorage.removeItem(LLAVE_BORRADOS);
      localStorage.removeItem(LLAVE_PRESTADO);
    } catch (e) { /* nada que hacer */ }
  }

  // ── La libreta de sincronización ─────────────────────────────────────────
  // Por machote: en qué versión quedó en el servidor y con qué contenido, para
  // saber cuáles hay que subir sin volver a subirlos todos cada vez.

  /** Los `id_local` sepultados en este navegador, como diccionario para que
   *  preguntar sea O(1) dentro del bucle de `bajar()`. */
  function leerBorrados() {
    if (!VIVO) return {};
    try {
      var d = JSON.parse(localStorage.getItem(LLAVE_BORRADOS) || '{}');
      return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
    } catch (e) { return {}; }
  }

  /** Sepulta un `id_local`. Se llama AL BORRAR, no al bajar: la lápida es un
   *  hecho de este navegador, y tiene que quedar aunque no haya red. */
  function marcarBorrado(idLocal) {
    if (!VIVO || !idLocal) return false;
    try {
      var d = leerBorrados();
      d[idLocal] = new Date().toISOString();
      localStorage.setItem(LLAVE_BORRADOS, JSON.stringify(d));
      return true;
    } catch (e) { return false; }
  }

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

  /** ¿ESTE machote está escrito aquí pero todavía no en el servidor?
   *
   *  Los ejemplos NO cuentan: nunca se van a subir (`empujarUno` los rechaza),
   *  así que contarlos dejaría el pulso en «sin guardar» para siempre. Lo
   *  AJENO tampoco: no es de quien mira y no le toca a él guardarlo.
   *
   *  Está separado de `pendientes()` porque desde V1.24 la lista no sólo dice
   *  CUÁNTOS faltan sino CUÁLES —hay que poder marcarlos—, y tener dos
   *  criterios de «pendiente» en dos sitios es la forma segura de que el
   *  aviso diga «1 sin subir» y no logre señalar ninguno. */
  function pendienteUno(m) {
    if (!m || !m.id) return false;
    if (esDemo(m) || esAjeno(m)) return false;
    var meta = leerSync()[m.id];
    return !meta || meta.huella !== huella(m);
  }

  /** Cuántos machotes están escritos aquí pero todavía no en el servidor. */
  function pendientes(machotes) {
    var lista = machotes || ((leerLocal() || {}).machotes) || [];
    var n = 0;
    for (var i = 0; i < lista.length; i++) {
      if (pendienteUno(lista[i])) n++;
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
      var r = d || { ok: false, error: 'RESPUESTA_VACIA' };
      /* TODA respuesta pasa por aquí. Si el servidor dice que la credencial no
       * vale, la sesión caduca en el acto: se borra SÓLO la llave de sesión y
       * se manda al login. Reintentar con un token muerto no arregla nada y
       * es exactamente lo que pasó al rotar el secreto el 8-sep.
       *
       * Va en el POST y no en cada llamador para que un endpoint nuevo no
       * pueda olvidarse de manejarlo. */
      if (G.MachoteSesion) G.MachoteSesion.vigilar(r);

      /* ── Una respuesta que NO es nuestra ──────────────────────────────────
       * Un webhook de n8n que existe pero todavía no está publicado contesta
       * un 404 con JSON PROPIO de n8n (`{code, message, hint}`) — no lleva
       * `ok`, así que sin esto cae en el «no se pudo» genérico y quien lo lee
       * concluye que su cotización tiene algo malo.
       *
       * Se traduce AQUÍ, en el único punto por donde pasan todas las
       * respuestas, por lo mismo que la sesión caduca aquí: un endpoint nuevo
       * no puede olvidarse de manejarlo. Es la exigencia de §20 #12b —causas
       * distintas, remedios distintos, dichas con palabras distintas—
       * aplicada al caso «la mitad del servidor todavía no está encendida». */
      if (r && r.ok === undefined && (typeof r.code === 'number' || r.message)) {
        var apagado = /not registered|no est[áa] registrad/i.test(String(r.message || ''));
        return {
          ok: false,
          error: apagado ? 'ENDPOINT_APAGADO' : 'RESPUESTA_NO_NUESTRA',
          mensaje: apagado
            ? 'Esta función todavía no está encendida en el servidor. No es un ' +
              'problema de tu cotización: falta publicar el endpoint. Avísale a ' +
              'quien administra la suite.'
            : 'El servidor contestó algo que no es de este módulo. Vuelve a ' +
              'intentarlo; si sigue, avísale a quien administra la suite.'
        };
      }
      return r;
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
  /* ── LA DEMO NUNCA SUBE (V1.21) ────────────────────────────────────────
   * `demo.js` marca sus cuatro machotes con `_demo: true`. El 8-sep se
   * colaron cuatro demostraciones a la base de producción con id `M-1041` a
   * `M-1044` porque nada las distinguía de una captura real.
   *
   * El filtro vive AQUÍ y no en la pantalla por la misma razón que el
   * vigilante de sesión vive en el POST: es el único sitio por donde pasa
   * todo lo que sube, así que un camino nuevo no puede olvidarse de aplicarlo.
   * Se comprueba con una prueba dedicada. */
  function esDemo(m) { return !!(m && m._demo === true); }

  /* Un machote AJENO es de otra persona y llegó porque quien mira tiene el
   * scope `comercial:admin`. Dirección revisa, no edita el trabajo de otro.
   *
   * NO SE GUARDA EN `fts_machote_v1`. Esa llave significa «lo mío», y meter
   * ahí lo de los demás rompería tres cosas a la vez:
   *   · el `id_local` choca —Ricardo también tiene un M-1041— y el de otro
   *     pisaría el propio al fundirse;
   *   · `empujarUno` lo volvería a subir, y el servidor le pone de dueño a
   *     QUIEN MANDA, así que el trabajo de Ricardo acabaría a nombre de
   *     Esteban;
   *   · se quedaría ahí para siempre, también el día que a alguien le quiten
   *     el scope.
   * Por eso los ajenos viven SÓLO en memoria, mientras dura la pantalla. */
  function esAjeno(m) { return !!(m && m._ajeno === true); }

  /** ¿Tengo permiso VIGENTE para escribir en este machote ajeno?
   *
   *  Esto es para la PANTALLA —desbloquear los campos, no hacerle perder el
   *  rato a nadie—, NO es la seguridad. La seguridad es que el servidor
   *  comprueba el préstamo contra la base en cada guardado, con su propio
   *  reloj: el del navegador puede ir adelantado, atrasado o movido a mano.
   *
   *  Por eso el vencimiento se mira aquí de forma OPTIMISTA (deja escribir
   *  hasta que el servidor diga que no) en vez de trabar la hoja al segundo
   *  exacto. Trabar a alguien a media frase por un reloj que no es el bueno
   *  es peor que dejarlo terminar la frase y que el guardado lo diga. */
  function prestadoAMi(m) {
    if (!m || m._ajeno !== true) return false;
    var p = m._prestamo_para_mi;
    if (!p || !p.vence_at) return false;
    var t = Date.parse(p.vence_at);
    return isFinite(t) && t > Date.now();
  }

  /** ¿Puede esta persona escribir en este machote? Propio, o prestado vigente.
   *
   *  ⚠️ Un machote de DEMOSTRACIÓN sí se escribe, y es a propósito: en cuanto
   *  alguien teclea encima deja de ser un ejemplo y pasa a ser su trabajo
   *  (`tocado()` le quita el `_demo` en ese mismo momento). Lo que la demo no
   *  puede hacer es SUBIR, y eso lo impiden dos candados distintos —no entra a
   *  la lista de `empujar`, y `empujarUno` la rechaza aparte—.
   *
   *  La primera versión de esto devolvía `false` para la demo, y con eso
   *  trababa la hoja de los cuatro ejemplos que trae la aplicación: cualquiera
   *  que abriera la pantalla por primera vez se encontraba una cotización que
   *  no se deja escribir. Lo cazaron 41 pruebas de la suite completa, ninguna
   *  de ellas del préstamo — que es exactamente para lo que sirve correrla
   *  entera antes de mergear. */
  function puedeEscribir(m) {
    if (!m) return false;
    return !esAjeno(m) || prestadoAMi(m);
  }

  function empujarUno(m, ses, motivo) {
    /* Segundo candado, además de no meterla en la lista: si mañana alguien
     * llama a `empujarUno` directo, la demo sigue sin llegar al servidor. */
    if (esDemo(m)) {
      return Promise.resolve({ ok: false, error: 'ES_DEMO',
        mensaje: 'Los machotes de demostración no se suben al servidor.' });
    }
    /* Mismo candado para el trabajo ajeno. No debería llegar aquí —ni entra a
     * la lista local ni lo recorre `empujar`— pero el día que alguien llame a
     * esto directo, subirlo lo pondría a nombre de quien manda. */
    /* Un ajeno CON PRÉSTAMO VIGENTE sí sube, y por un camino aparte: su
     * identidad en el servidor es la del dueño (`_id_local`), no un id de
     * este navegador, y su contabilidad de versiones vive en el cajón de
     * prestados y no en la libreta de lo mío. Mezclarlas era la forma de que
     * el `M-1041` de Ricardo pisara el mío. */
    if (esAjeno(m)) {
      if (!prestadoAMi(m)) {
        return Promise.resolve({ ok: false, error: 'ES_AJENO',
          mensaje: 'Ese machote es de otra persona: se puede ver, no guardar.' });
      }
      return empujarPrestado(m, ses, motivo);
    }
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
        var previo = s[m.id] || {};
        s2[m.id] = {
          version: r.version,
          huella: huella(m),
          machote_id: r.machote_id,
          /* El folio lo asigna el servidor la PRIMERA vez que este machote
           * llega allá, así que la respuesta del guardado es el momento más
           * temprano en que se puede saber. Si esta respuesta no lo trae
           * —servidor viejo— se conserva el que ya hubiera: perder el folio
           * por una respuesta incompleta sería peor que no tenerlo. */
          folio: (r.folio !== undefined && r.folio !== null) ? r.folio : (previo.folio || null),
          folio_txt: r.folio_txt || previo.folio_txt || null,
          empujado_at: new Date().toISOString()
        };
        escribirSync(s2);
        return { ok: true, version: r.version, machote_id: r.machote_id,
                 folio: s2[m.id].folio, folio_txt: s2[m.id].folio_txt };
      }
      /* Choque de versión: alguien más guardó. NO se pisa y NO se reintenta en
       * silencio — se avisa, porque resolverlo es una decisión de persona. */
      return { ok: false, error: (r && r.error) || 'DESCONOCIDO',
               mensaje: (r && r.mensaje) || 'No se pudo guardar en el servidor.' };
    });
  }

  /** Sube un machote PRESTADO. Mismo endpoint y mismas reglas que lo propio
   *  —el servidor decide si el préstamo sigue vivo— pero con la identidad y
   *  la versión sacadas del cajón de prestados.
   *
   *  Pase lo que pase, lo tecleado se queda en el cajón: si el servidor
   *  rechaza (permiso vencido, permiso recogido, choque de versión), la
   *  persona conserva su trabajo y puede copiarlo o pedir el permiso de
   *  nuevo. El sistema puede negarse a guardar; no puede tirar trabajo. */
  function empujarPrestado(m, ses, motivo) {
    var idLocal = m._id_local;
    if (!idLocal) {
      return Promise.resolve({ ok: false, error: 'SIN_ID_LOCAL',
        mensaje: 'No se sabe con qué identidad guardar este machote prestado.' });
    }
    guardarPrestadoLocal(m);
    var cajon = leerPrestados();
    var leida = (cajon[m.id] && cajon[m.id].version_leida) || 0;

    return postear(URL_GUARDAR, {
      token: ses.token,
      id_local: idLocal,
      cliente_odoo_id: (typeof m.cliente_id === 'number') ? m.cliente_id : null,
      version_leida: Number(leida) || 0,
      estado: m.estado || 'borrador',
      motivo: motivo || null,
      documento: documentoDeMachote(m),
      resumen: resumenDe(m)
    }).then(function (r) {
      if (r && r.ok === true) {
        var c2 = leerPrestados();
        if (c2[m.id]) { c2[m.id].version_leida = r.version; escribirPrestados(c2); }
        m._version_servidor = r.version;
        return { ok: true, version: r.version, machote_id: r.machote_id, prestado: true };
      }
      return { ok: false, prestado: true,
               error: (r && r.error) || 'DESCONOCIDO',
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
      if (esDemo(m) || esAjeno(m)) continue;         // ni la demo ni lo de otro viajan
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

      var enterrados = leerBorrados();
      var nuevos = 0, refrescados = 0, conservados = 0, resucitados = 0;
      /* Lo AJENO se aparta aquí y no vuelve a tocar el almacén local. Va en su
       * propia lista, en memoria, y la pantalla la pinta al lado de la propia.
       * El porqué está en `esAjeno`. */
      var ajenos = [];

      var prestados = leerPrestados();

      for (i = 0; i < r.machotes.length; i++) {
        var fila = r.machotes[i];
        if (!fila || !fila.id_local || !fila.documento) continue;

        /* SEPULTADO AQUÍ: no vuelve. Sin esta línea, borrar un machote ya
         * subido no servía — reaparecía en la siguiente bajada, cada vez.
         *
         * ⚠️ La lápida NO aplica a lo AJENO, y es a propósito: las lápidas van
         * por `id_local`, y dos personas pueden tener el mismo (Ricardo tenía
         * un `M-1041` y Esteban otro). Sin esta condición, borrar el propio
         * M-1041 escondería el de Ricardo — trabajo de alguien más
         * desapareciendo de la pantalla de dirección sin que nadie lo pidiera.
         * Lo ajeno además no se puede borrar, así que nunca hay lápida suya. */
        if (enterrados[fila.id_local] && fila.ajeno !== true) { resucitados++; continue; }

        var doc = machoteDesdeFila(fila);

        if (fila.ajeno === true) {
          /* El id de PANTALLA de un ajeno es el uuid del servidor, no su
           * `id_local`: dos personas pueden tener el mismo `M-1041` y con el
           * id_local se abrirían una a la otra. */
          doc.id = fila.id;
          doc._ajeno = true;
          doc._id_local = fila.id_local;      // el del DUEÑO: con él se guarda
          doc._dueno = fila.dueno || null;
          doc._dueno_nombre = fila.dueno_nombre || null;
          doc._version_servidor = fila.version;
          doc._folio = fila.folio || null;
          doc._folio_txt = fila.folio_txt || null;

          /* Los préstamos VIGENTES que el servidor decidió enseñarme: los que
           * yo otorgué (si el machote es mío) o el mío (si soy prestatario).
           * El servidor decide cuáles; aquí sólo se separa el que me habilita
           * a escribir de los que sólo son cortesía para el dueño. */
          doc._prestamos = Array.isArray(fila.prestamos) ? fila.prestamos : [];
          doc._prestamo_para_mi = doc._prestamos.filter(function (x) {
            return x && x.para === r.actor;
          })[0] || null;

          /* LO TECLEADO SIN SUBIR MANDA sobre lo que trae el servidor. Es la
           * misma regla que para lo propio (`bajar` nunca pisa un machote con
           * cambios pendientes), aplicada al cajón de prestados: si el permiso
           * venció con trabajo a medias, ese trabajo tiene que seguir ahí al
           * recargar. Sólo se toma si además sigo teniendo permiso; sin
           * permiso el machote vuelve a ser de sólo lectura y lo tecleado se
           * recupera desde el aviso, no pisando la pantalla. */
          var enCajon = prestados[fila.id];
          if (enCajon && enCajon.documento && doc._prestamo_para_mi) {
            var recuperado = machoteDesdeFila({ documento: enCajon.documento,
              id_local: fila.id_local, estado: enCajon.documento.estado || fila.estado });
            recuperado.id = fila.id;
            recuperado._ajeno = true;
            recuperado._id_local = fila.id_local;
            recuperado._dueno = doc._dueno;
            recuperado._dueno_nombre = doc._dueno_nombre;
            recuperado._version_servidor = fila.version;
            recuperado._folio = doc._folio;
            recuperado._folio_txt = doc._folio_txt;
            recuperado._prestamos = doc._prestamos;
            recuperado._prestamo_para_mi = doc._prestamo_para_mi;
            recuperado._sin_subir = true;
            doc = recuperado;
          }

          ajenos.push(doc);
          continue;
        }

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

        /* La cortesía del dueño: a quién le presté esto y hasta cuándo. Va en
         * la libreta y no dentro del machote por lo mismo que el folio —
         * metido en el documento entraría en su huella y la pantalla diría
         * «por subir» de algo que sólo cambió allá. */
        s[fila.id_local] = {
          version: fila.version,
          huella: huella(doc),
          machote_id: fila.id,
          prestamos: Array.isArray(fila.prestamos) ? fila.prestamos : [],
          /* El folio vive AQUÍ y no dentro del machote. Metido en el machote
           * entraría en `huella(m)` y la franja diría «por subir» de algo que
           * acaba de bajar — el mismo modo de falla que obligó a separar
           * `documentoDeFila` de `machoteDesdeFila`. La libreta ya es donde
           * viven los datos que el servidor pone y el documento no lleva. */
          folio: fila.folio || null,
          folio_txt: fila.folio_txt || null,
          empujado_at: new Date().toISOString()
        };
      }

      /* CUÁNDO contestó el servidor. Es lo que permite decir «comprobado a
       * las 9:41» en vez de afirmar a secas que todo está a salvo: una
       * comprobación sin hora es una promesa sin fecha. */
      s.__visto_at = new Date().toISOString();
      escribirSync(s);
      var quedo = escribirLocal({ machotes: lista, handoff: local.handoff || {} });

      return { ok: true, bajados: r.machotes.length, nuevos: nuevos,
               refrescados: refrescados, conservados: conservados,
               enterrados: resucitados,
               es_admin: r.es_admin === true, ajenos: ajenos,
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
   *  Pregunta al SERVIDOR en vez de leer la libreta local, y la diferencia
   *  importa: si alguien limpia los datos del sitio, la libreta desaparece y
   *  diría "nada subido" cuando en realidad está todo a salvo. El servidor no
   *  se equivoca en eso.
   *
   *  Ésta era la fuente de la franja de sincronización. Con la franja retirada
   *  (V1.24) sus lectores son la vista de CONTROL y las pruebas del bloque
   *  «estado contra el servidor». Sigue siendo la ÚNICA manera de contestar
   *  «¿está TODO lo mío allá?»: el aviso de pendientes de la lista compara
   *  contra la libreta, así que puede probar que algo NO ha salido de aquí,
   *  nunca que todo llegó.
   *
   *  Resuelve SIEMPRE. Sin red devuelve `ok:false` con lo que se sabe de aquí,
   *  para poder decir "no se pudo confirmar" en vez de mentir en cualquiera de
   *  las dos direcciones. */
  function estadoServidor(machotes) {
    /* La demo se descuenta ANTES de contar. Si entrara, la franja diría «4 por
     * subir» eternamente y «Subir ahora» nunca podría bajar el número — un
     * pendiente que no se puede resolver es peor que no avisar. */
    var todos = machotes || ((leerLocal() || {}).machotes) || [];
    var lista = todos.filter(function (m) { return !esDemo(m) && !esAjeno(m); });
    var demos = todos.length - lista.length;
    var ses = sesion();

    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION', total: lista.length, demos: demos,
        subidos: 0, pendientes: lista.length, ids_pendientes: lista.map(function (m) { return m.id; }),
        mensaje: 'No hay sesión, así que no se puede confirmar qué hay en el servidor.' });
    }

    return postear(URL_LEER, { token: ses.token }).then(function (r) {
      if (!r || r.ok !== true || !Array.isArray(r.machotes)) {
        return { ok: false, error: (r && r.error) || 'DESCONOCIDO',
          mensaje: (r && r.mensaje) || 'No se pudo preguntar al servidor.',
          total: lista.length, demos: demos, subidos: 0, pendientes: lista.length,
          ids_pendientes: lista.map(function (m) { return m.id; }) };
      }

      /* Los AJENOS se descartan antes de indexar. La franja habla de LO MÍO, y
       * el índice va por `id_local`, que NO es único entre personas: Ricardo
       * también tiene un `M-1041`. Sin este filtro, con el scope de dirección
       * el machote de otro casaría con el propio y la franja diría «a salvo»
       * de algo que en el servidor está a nombre de alguien más. */
      var enServidor = {}, i;
      for (i = 0; i < r.machotes.length; i++) {
        var f = r.machotes[i];
        if (f && f.ajeno === true) continue;
        if (f && f.id_local) enServidor[f.id_local] = f;
      }

      var ids = [], subidos = 0, desfasados = 0, detalle = [];
      for (i = 0; i < lista.length; i++) {
        var m = lista[i];
        if (!m || !m.id) continue;
        var fila = enServidor[m.id];
        var hAqui = huellaCanonica(m);
        if (!fila) {                                              // no llegó nunca
          ids.push(m.id);
          detalle.push({ id: m.id, nombre: m.nombre, estado: 'nunca',
                         huella_aqui: hAqui, huella_servidor: null,
                         version: null, confirmado_at: null });
          continue;
        }
        var doc = documentoDeFila(fila);          // el contenido, sin reparaciones
        var hAlla = huellaCanonica(doc);
        if (hAlla !== hAqui) {
          ids.push(m.id); desfasados++;                           // llegó, pero lo de aquí cambió después
          detalle.push({ id: m.id, nombre: m.nombre, estado: 'desfasado',
                         huella_aqui: hAqui, huella_servidor: hAlla,
                         version: fila.version, confirmado_at: fila.guardada_at || null });
          continue;
        }
        subidos++;
        detalle.push({ id: m.id, nombre: m.nombre, estado: 'igual',
                       huella_aqui: hAqui, huella_servidor: hAlla,
                       version: fila.version, confirmado_at: fila.guardada_at || null });
      }

      return { ok: true, total: lista.length, demos: demos, subidos: subidos,
        pendientes: ids.length, desfasados: desfasados, ids_pendientes: ids,
        en_servidor_total: r.machotes.length, actor: r.actor,
        /* La EVIDENCIA, renglón por renglón. Un número pide fe; esto se puede
         * comprobar: las dos huellas son del MISMO documento calculadas por
         * separado —una sobre lo de aquí, otra sobre lo que devolvió el
         * servidor—, así que si coinciden son idénticos carácter por carácter.
         * Poder enseñar esto era la condición para retirar la franja, y se
         * retiró en V1.24. */
        detalle: detalle,
        leido_at: new Date().toISOString() };
    });
  }

  /* La forma de un uuid. Sirve para saber si un id de pantalla YA es el del
   * servidor, sin preguntarle a nadie. */
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** El id que el SERVIDOR le puso a este machote, o null si nunca ha subido.
   *
   *  Existe porque el navegador y el servidor nombran la misma cotización de
   *  dos maneras: aquí es `id_local` ('M-1757…', único por navegador), allá
   *  es un uuid. Todo lo que le pregunte algo del machote al servidor
   *  —historial, PDF, envío— necesita el uuid, y `null` es una respuesta
   *  legítima que significa «todavía no llega allá», no un error.
   *
   *  ⚠️ Recibe el id DE PANTALLA, que no siempre es un `id_local`: un machote
   *  AJENO se nombra aquí con el uuid del servidor a propósito —dos personas
   *  pueden tener el mismo `M-1041` y con el id_local se abrirían una a la
   *  otra—, y además no tiene renglón en la libreta de sincronización, porque
   *  esa libreta es de lo que YO subo. Buscarlo ahí no fallaba con un error:
   *  devolvía null, y quien preguntaba lo leía como «no ha subido». Así fue
   *  como el historial de una cotización con nueve versiones en el servidor
   *  contestaba que todavía no llegaba allá (V1.24, #140). Por eso la
   *  traducción vive AQUÍ y no en cada llamador: el PDF y el envío hacían la
   *  misma pregunta y les pasaba lo mismo. */
  function idServidor(id) {
    if (!id) return null;
    if (UUID.test(id)) return id;
    var meta = leerSync()[id];
    return (meta && meta.machote_id) ? meta.machote_id : null;
  }

  /** El folio de un machote, o `null` si todavía no tiene.
   *
   *  `null` NO es un error: significa «este machote no ha llegado al
   *  servidor», que es quien reparte los folios. La pantalla lo dice con esas
   *  palabras en vez de inventar un número — un folio propuesto por el
   *  navegador chocaría con el de otra persona capturando a la vez, y el
   *  choque saldría justo al subir. */
  function folio(idLocal) {
    var meta = leerSync()[idLocal];
    if (!meta || !meta.folio) return null;
    return { folio: meta.folio, folio_txt: meta.folio_txt || null };
  }

  /** El historial completo de un machote, del servidor. Para la pantalla de
   *  versiones: la caché del navegador sólo tiene la última.
   *
   *  TRES respuestas distintas, y son tres cosas distintas:
   *
   *    NUNCA_SUBIDO   — no hay uuid: esta cotización no ha llegado al
   *                     servidor. No tiene historial porque no puede tenerlo.
   *    ok:true        — llegó y aquí están sus versiones.
   *    NO_CONSULTABLE — SÍ llegó (tenemos su uuid) pero el servidor no
   *                     devolvió ninguna versión. Eso no es «no ha subido»:
   *                     es «ahora mismo no se puede ver», y se dice así.
   *
   *  Juntarlas fue el defecto: quien abría el reloj de un machote ajeno leía
   *  «todavía no llega al servidor» de algo que llevaba nueve versiones allá.
   *  Es el mismo modo de falla de la sesión muerta (CLAUDE.md §20 #12b): tres
   *  causas con tres remedios distintos colapsadas en un solo mensaje, y el
   *  mensaje elegido invitaba a la acción equivocada. */
  function historial(id) {
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: el historial vive en el servidor.' });
    }
    var uuid = idServidor(id);
    if (!uuid) {
      return Promise.resolve({ ok: false, error: 'NUNCA_SUBIDO',
        mensaje: 'Este machote todavía no llega al servidor, así que no tiene historial.' });
    }
    return postear(URL_LEER, { token: ses.token, machote_id: uuid }).then(function (r) {
      /* El endpoint contesta la lista VACÍA tanto si el machote no existe
       * como si existe y no se puede ver — a propósito, para no volverse un
       * oráculo que confirme qué ids hay. Aquí sabemos algo que él no: que
       * este machote SÍ subió, porque tenemos su uuid. Así que un vacío
       * significa «no se pudo traer», nunca «no ha subido». */
      if (r && r.ok === true && Array.isArray(r.versiones) && r.versiones.length === 0) {
        return { ok: false, error: 'NO_CONSULTABLE', machote_id: uuid,
          mensaje: 'Esta cotización sí está en el servidor, pero ahora mismo no se ' +
                   'pudo traer su historial. Vuelve a intentarlo en un momento.' };
      }
      return r;
    });
  }

  /* ── Prestar y recoger ───────────────────────────────────────────────────
   * Los dos van por `comercial/machote-prestar`, que comprueba contra la base
   * que quien otorga es el DUEÑO. Aquí no se decide nada: el `actor` sale del
   * token, igual que en todo lo demás, y el tope de 24 horas es un CHECK de
   * la base — no una validación de esta pantalla, que cualquiera puede saltar
   * con la consola abierta. */

  /** Presta un machote a otra persona por `horas` (tope 24, lo fuerza la base). */
  function prestar(machoteIdPantalla, para, horas) {
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: vuelve a entrar para prestar.' });
    }
    var uuid = idServidor(machoteIdPantalla);
    if (!uuid) {
      return Promise.resolve({ ok: false, error: 'NUNCA_SUBIDO',
        mensaje: 'Esta cotización todavía no llega al servidor, así que no se ' +
                 'puede prestar. Súbela primero.' });
    }
    return postear(URL_PRESTAR, { token: ses.token, accion: 'prestar',
      machote_id: uuid, para: para, horas: horas });
  }

  /** Recoge un préstamo antes de que venza. */
  function recoger(machoteIdPantalla, para) {
    var ses = sesion();
    if (!ses) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: vuelve a entrar para recoger el permiso.' });
    }
    var uuid = idServidor(machoteIdPantalla);
    if (!uuid) {
      return Promise.resolve({ ok: false, error: 'NUNCA_SUBIDO',
        mensaje: 'Esta cotización no está en el servidor.' });
    }
    return postear(URL_PRESTAR, { token: ses.token, accion: 'recoger',
      machote_id: uuid, para: para });
  }

  /** ¿Está todo lo mío en el servidor? Contestado SIN pedir nada: con lo que
   *  la última bajada ya trajo.
   *
   *  ── POR QUÉ ESTO SÍ PUEDE AFIRMARLO Y EL AVISO DE «SIN SUBIR» NO ────────
   *  Una marca local no puede probar que algo llegó al servidor — por eso el
   *  aviso de pendientes sólo afirma lo que puede demostrar, que algo NO ha
   *  salido de aquí. Esto es distinto: la libreta guarda, por machote, la
   *  VERSIÓN Y LA HUELLA que el servidor devolvió en la última bajada. Eso es
   *  evidencia del servidor, no una marca nuestra.
   *
   *  Lo que sí tiene es FECHA, y por eso la respuesta siempre la lleva: si la
   *  última bajada fue hace dos horas, lo que se afirma es «hace dos horas
   *  estaba todo», no «está todo». Sin bajada, se dice que no se ha podido
   *  comprobar — que NO es lo mismo que decir que falta algo.
   *
   *  No pide permiso nuevo ni endpoint nuevo: el dato ya viaja en
   *  `comercial/machotes-leer`, que es el mismo que pinta la lista. */
  function comprobacion(machotes) {
    var todos = machotes || ((leerLocal() || {}).machotes) || [];
    var mios = todos.filter(function (m) { return !esDemo(m) && !esAjeno(m); });
    var s = leerSync();
    var visto = s.__visto_at || null;

    var faltan = mios.filter(function (m) { return pendienteUno(m); });
    return {
      // `null` cuando nunca se ha podido bajar: es «no sé», no «todas bien».
      comprobado_at: visto,
      total: mios.length,
      en_servidor: mios.length - faltan.length,
      faltan: faltan.length,
      ids_faltan: faltan.map(function (m) { return m.id; }),
      demos: todos.length - mios.length
    };
  }

  /** Los préstamos VIGENTES de un machote, como los dejó la última bajada.
   *  Sale de la libreta para lo propio y del objeto en memoria para lo ajeno,
   *  que es la misma partición que el folio: lo ajeno no toca la libreta. */
  function prestamosDe(m) {
    if (!m) return [];
    if (m._ajeno === true) return Array.isArray(m._prestamos) ? m._prestamos : [];
    var meta = leerSync()[m.id];
    return (meta && Array.isArray(meta.prestamos)) ? meta.prestamos : [];
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
    folio: folio,
    marcarBorrado: marcarBorrado,
    leerBorrados: leerBorrados,
    leerLocal: leerLocal,
    escribirLocal: escribirLocal,

    // Asíncrono: el servidor.
    escribir: escribir,
    bajar: bajar,
    esAjeno: esAjeno,
    empujar: empujar,
    /* Se exporta para que la prueba pueda apretar el SEGUNDO candado —el de
     * `empujarUno`— sin pasar por la lista. Un candado que no se puede probar
     * por separado es un candado que nadie sabe si sigue puesto. */
    empujarUno: empujarUno,
    historial: historial,

    // El préstamo temporal (V1.25).
    prestar: prestar,
    recoger: recoger,
    prestamosDe: prestamosDe,
    puedeEscribir: puedeEscribir,
    prestadoAMi: prestadoAMi,
    guardarPrestadoLocal: guardarPrestadoLocal,
    leerPrestados: leerPrestados,
    olvidarPrestado: olvidarPrestado,
    idServidor: idServidor,
    esDemo: esDemo,

    pendientes: pendientes,
    pendienteUno: pendienteUno,
    comprobacion: comprobacion,
    estadoServidor: estadoServidor,
    huellaCanonica: huellaCanonica,
    olvidar: olvidar,
    sobre: sobre,
    machotesDe: machotesDe
  };
})(window);
