/* ═══ Machote · la oportunidad de CRM (V1.44) ═════════════════════════════
 *
 * La cotización nace de una conversación con un cliente, y esa conversación
 * vive en Odoo como una tarjeta de CRM (`crm.lead`). Hasta la V1.43 el machote
 * NO tenía dónde elegirla: el campo existía en la base desde la 003
 * (`comercial.machote.odoo_lead_id`), el endpoint de lectura lo devolvía, y la
 * pantalla nunca lo leyó ni lo escribió.
 *
 * ── EL DEFECTO QUE ESTO ARREGLA, Y POR QUÉ ERA DOBLE ─────────────────────
 * `comercial/machotes-leer` devuelve **`odoo_lead_id`** (verificado leyendo el
 * SQL del workflow: la consulta lo selecciona y `Code - Armar respuesta` lo
 * mapea con ese nombre). En el navegador, en cambio, los tres únicos usos
 * decían **`lead_id`** —`orden.js` L790 y L953, `almacen.js` L1391—, y esa
 * cadena no la escribía NADIE. O sea que la orden se creaba siempre con
 * `lead_id: null` y nadie lo notaba: un `undefined` leído de un objeto no
 * truena, se propaga.
 *
 * Arreglar sólo el nombre no alcanzaba, y ésa es la parte importante: con el
 * nombre corregido la pantalla habría leído bien un campo **que nunca tuvo
 * valor**, porque no existía forma de ponerlo. Hacían falta las dos mitades
 * —leer el nombre bueno y poder elegir la oportunidad— y por eso están en la
 * misma versión.
 *
 * ── DÓNDE VIVE EL DATO ──────────────────────────────────────────────────
 * En el DOCUMENTO (`m.oportunidad`), no en una columna nueva. Tres razones:
 *
 *   1. `comercial/machote-guardar` está ACTIVO y no se toca esta noche (regla
 *      de la sesión). El documento viaja completo en cada versión, así que un
 *      campo nuevo dentro de él se guarda sin cambiar una línea del servidor.
 *   2. El documento es append-only: la liga queda FECHADA en la versión donde
 *      se puso, y el historial enseña cuándo se ligó y quién lo hizo.
 *   3. La columna `odoo_lead_id` sigue siendo la que leen los workflows. La
 *      sincroniza el endpoint `comercial/oportunidades` en modo `ligar`, que
 *      además escribe el folio del machote en la tarjeta de CRM. Un solo
 *      escritor por campo (CLAUDE.md §20 #4): la columna la escribe el
 *      servidor, el documento lo escribe la pantalla.
 *
 * Al ABRIR se ADOPTA lo que traiga el servidor: si el documento no tiene
 * `oportunidad` pero la fila sí tiene `odoo_lead_id`, se adopta ese valor en
 * memoria. Así un machote ligado por el servidor —o por un backfill— se ve
 * ligado en pantalla sin que nadie vuelva a elegir nada.
 *
 * ── LAS CARDINALIDADES, QUE MANDAN EN EL DISEÑO ─────────────────────────
 * Esteban las precisó: **una tarjeta de CRM tiene varias órdenes y varios
 * machotes**; una orden tiene varias facturas. De ahí sale que:
 *
 *   · `m.oportunidad.lead_id` es UNO por machote (un machote cotiza una cosa);
 *   · `crm.lead.x_studio_machote_folio` es una LISTA de folios, y el servidor
 *     **agrega al final, nunca sobrescribe**. Sobrescribir convertiría la
 *     segunda cotización de la misma tarjeta en un borrado silencioso de la
 *     primera — y un borrado que nadie pidió no se puede distinguir después de
 *     un dato que nunca se escribió.
 *
 * ── DEGRADAR SIN TRABAR (CLAUDE.md §8, regla anti-trabón) ───────────────
 * Éste es el lado TOLERANTE, y esta noche es el único lado desplegado: el
 * endpoint nace INACTIVO. Sin catálogo, la pantalla:
 *   · sigue dejando capturar y guardar (la oportunidad se SUGIERE al capturar);
 *   · dice que no pudo leer Odoo, con el porqué, en vez de callarse;
 *   · y NO deja poner una liga inventada a mano. Un `lead_id` tecleado que no
 *     existe en Odoo es peor que ninguno: se ve ligado y no lo está.
 * La regla dura `sin-oportunidad` (reglas.js) es lo que bloquea al confirmar.
 */
(function (G) {
  'use strict';

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_OP = BASE + '/comercial/oportunidades';
  var TIMEOUT_MS = 12000;
  /* Cuántas candidatas se ofrecen. Cinco caben en la pantalla del teléfono sin
   * desplazar, y más de cinco deja de ser una sugerencia y pasa a ser una
   * lista que hay que leer. */
  var MAX_CANDIDATAS = 5;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* Lo último que contestó el servidor, para pintar nombres sin volver a
   * preguntar. `porId` es la libreta id → nombre; se llena con TODO lo que
   * pase por aquí, venga de una búsqueda o de las candidatas. */
  var estado = { porId: {}, error: null };

  function recordar(lista) {
    for (var i = 0; i < (lista || []).length; i++) {
      var l = lista[i];
      if (l && l.id) estado.porId[l.id] = l.nombre || ('Oportunidad ' + l.id);
    }
  }

  /* ── El viaje al servidor ─────────────────────────────────────────────── */

  function postear(cuerpo) {
    var S = G.SuiteAuth;
    var token = S && S.getToken && S.getToken();
    if (!token) {
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: vuelve a entrar para leer las oportunidades de Odoo.' });
    }
    var corta = null;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var opciones = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* El token va en el CUERPO, no en Authorization: el header dispara un
       * preflight CORS que el webhook de n8n no contesta (CLAUDE.md §15 #5). */
      body: JSON.stringify(Object.assign({ token: token }, cuerpo))
    };
    if (ctrl) opciones.signal = ctrl.signal;

    var p = fetch(URL_OP, opciones)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || d.ok !== true) throw new Error((d && d.error) || 'RESPUESTA_INVALIDA');
        estado.error = null;
        return d;
      })
      .catch(function (e) {
        estado.error = String((e && e.message) || e);
        /* Se distingue «no hay red / no contestó» de «contestó que no», porque
         * llevan a acciones distintas (CLAUDE.md §20 #12b). Un fallo de fetch
         * no trae `d.error`; el del servidor sí. */
        return { ok: false, error: 'SIN_CATALOGO', mensaje: estado.error };
      })
      .then(function (res) { if (corta) clearTimeout(corta); return res; });

    if (ctrl) corta = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return p;
  }

  /** Busca oportunidades vivas por texto. Resuelve SIEMPRE. */
  function buscar(q) {
    var t = String(q || '').trim();
    /* Dos caracteres es el mínimo para que la búsqueda signifique algo. Con
     * uno, Odoo devuelve cientos y la lista deja de ayudar. */
    if (t.length < 2) {
      return Promise.resolve({ ok: true, oportunidades: [], corta: true });
    }
    return postear({ modo: 'buscar', q: t }).then(function (d) {
      if (d.ok) recordar(d.oportunidades);
      return d;
    });
  }

  /** Las candidatas para ESTE machote: por cliente y por parecido de nombre.
   *  La decisión de a quién se parece la toma el SERVIDOR, que es el que tiene
   *  el catálogo; aquí sólo se pintan.
   *
   *  ⚠️ Medido la noche que se construyó esto, y casi se cuela: **los leads de
   *  Odoo apuntan a CONTACTOS, no a la empresa**, y el machote guarda la
   *  EMPRESA (`comercial/clientes` sólo devuelve `is_company`). Buscando por
   *  igualdad, un cliente con 86 oportunidades vivas devolvía 37 — las otras 49
   *  cuelgan de sus contactos—. El servidor usa `child_of`, que trae la empresa
   *  y sus contactos. Se apunta aquí porque el vacío se habría leído como
   *  «ninguna se parece» y nadie lo habría cuestionado (CLAUDE.md §20 #13). */
  function candidatas(m) {
    if (!m) return Promise.resolve({ ok: true, candidatas: [] });
    return postear({
      modo: 'candidatas',
      cliente_id: m.cliente_id || null,
      nombre: m.nombre || '',
      limite: MAX_CANDIDATAS
    }).then(function (d) {
      if (d.ok) recordar(d.candidatas);
      return d;
    });
  }

  /** Crea la oportunidad en Odoo y devuelve `{ok, id, nombre}`. */
  function crear(nombre, clienteId) {
    var n = String(nombre || '').trim();
    if (!n) {
      return Promise.resolve({ ok: false, error: 'SIN_NOMBRE',
        mensaje: 'Ponle nombre a la oportunidad antes de crearla.' });
    }
    return postear({ modo: 'crear', nombre: n, cliente_id: clienteId || null })
      .then(function (d) {
        if (d.ok && d.id) recordar([{ id: d.id, nombre: d.nombre || n }]);
        return d;
      });
  }

  /** Escribe la liga en los DOS sentidos. Lo hace el servidor: la columna
   *  `odoo_lead_id` y el folio en la tarjeta de CRM son suyos. */
  function ligar(machoteUuid, version, leadId) {
    if (!machoteUuid || !leadId) {
      return Promise.resolve({ ok: false, error: 'FALTA_DATO',
        mensaje: 'Sin machote en el servidor o sin oportunidad no hay nada que ligar.' });
    }
    return postear({
      modo: 'ligar',
      machote_id: machoteUuid,
      version_leida: version || null,
      lead_id: Number(leadId)
    });
  }

  /* ── La pregunta, con UNA sola definición ─────────────────────────────── */

  /** ¿A esta cotización le falta la oportunidad? Igual que con el cliente, el
   *  texto no cuenta: lo que cuenta es el id. */
  function falta(m) {
    return !idDe(m);
  }

  /** El id ligado, o null. **Único lugar de todo el módulo que sabe de dónde
   *  sale**, y sale de DOS sitios, igual que el folio:
   *
   *    · el DOCUMENTO (`m.oportunidad.lead_id`) cuando lo eligió una persona
   *      en esta pantalla — ahí es un cambio del documento y debe marcar
   *      «por subir», porque lo es;
   *    · la LIBRETA DE SINCRONIZACIÓN cuando lo trajo el servidor en la
   *      columna `odoo_lead_id`.
   *
   *  ⚠️ Lo del servidor NO se copia dentro del machote, y esto no es un
   *  detalle: `pendienteUno` compara `huella(m)` —el objeto CRUDO, con los
   *  campos de guion bajo incluidos— contra la huella que la libreta guardó
   *  del documento que vino del servidor. Meter aquí el id adoptado marcaría
   *  «por subir» todos los machotes ya ligados en cuanto se cargara la lista,
   *  que es el mismo modo de falla que obligó a sacar el folio y `creado_at`
   *  del documento (los tres avisos de almacen.js). Lo AJENO sí lo trae
   *  encima (`_odoo_lead_id`) porque lo ajeno no entra en ese conteo. */
  function idDe(m) {
    if (!m) return null;
    if (m.oportunidad && m.oportunidad.lead_id) return Number(m.oportunidad.lead_id);
    if (m._ajeno === true) return m._odoo_lead_id ? Number(m._odoo_lead_id) : null;
    var A = G.MachoteAlmacen;
    var s = (A && A.leadServidor) ? A.leadServidor(m.id) : null;
    return s ? Number(s) : null;
  }

  /** ¿La liga la puso una persona aquí, o vino del servidor? Sirve para el
   *  texto de la pastilla: «ligada aquí» y «ya venía ligada» son dos hechos
   *  distintos y quien mira tiene derecho a saber cuál es. */
  function origenDe(m) {
    if (!m) return null;
    if (m.oportunidad && m.oportunidad.lead_id) return 'documento';
    return idDe(m) ? 'servidor' : null;
  }

  /** El nombre que se PINTA. Gana lo último que dijo Odoo; si no hay, lo que
   *  se guardó al ligar; y si tampoco, el id, que siempre es cierto. */
  function nombre(m) {
    var id = idDe(m);
    if (!id) return '';
    if (estado.porId[id]) return estado.porId[id];
    if (m.oportunidad && m.oportunidad.nombre) return m.oportunidad.nombre;
    return 'Oportunidad ' + id;
  }

  /** Lo que se ESCRIBE en el documento al elegir una oportunidad. Vive aquí y
   *  no en la pantalla para que haya una sola forma del campo: si cada quien
   *  lo arma, en un mes hay documentos con tres formas distintas.
   *
   *  `ligado_at` es la hora del navegador y se dice que lo es: sirve para el
   *  historial, no para auditar. La hora que vale es la de la versión, que la
   *  pone Postgres al guardar. */
  function marcar(m, o) {
    if (!m || !o || !o.id) return m;
    m.oportunidad = {
      lead_id: Number(o.id),
      nombre: o.nombre || null,
      cliente_id: m.cliente_id || null,
      ligado_at: new Date().toISOString(),
      origen: 'pantalla'
    };
    return m;
  }

  /* ── Lo que se ve ─────────────────────────────────────────────────────── */

  /** La franja que lo pide. Se pinta siempre que falte: el problema sigue ahí
   *  hasta que alguien lo arregle.
   *
   *  El tono es de PENDIENTE, no de error: al capturar, la oportunidad se
   *  SUGIERE. Lo que bloquea es confirmar, y eso lo dice la regla dura. */
  function franja(m) {
    if (!falta(m)) return '';
    return '<div class="aviso warn op-franja" id="opFranja">' +
      '<strong>Esta cotización todavía no está ligada a una oportunidad de CRM.</strong> ' +
      'Se puede capturar y guardar sin ella, pero <strong>no se puede confirmar la orden</strong>: ' +
      'es lo que permite ir del dinero de vuelta a la conversación que lo originó. ' +
      '<button class="btn fantasma" id="opElegir">Elegir la oportunidad</button>' +
      '</div>';
  }

  /** La pastilla de cuando SÍ está ligada. Es el otro estado del mismo dato, y
   *  se pinta en el mismo sitio para que la pantalla no tenga un hueco donde
   *  antes había un aviso. */
  function pastilla(m) {
    if (falta(m)) return '';
    var id = idDe(m);
    var delServidor = origenDe(m) === 'servidor';
    return '<div class="op-pastilla" id="opPastilla">' +
      '<span class="op-eti">Oportunidad</span> ' +
      '<strong>' + esc(nombre(m)) + '</strong> ' +
      '<span class="tiny nota">#' + id +
        /* Se dice de dónde sale la liga. Sin esto, «ligada» se lee igual
         * cuando alguien la puso aquí y cuando ya venía de la base, y son dos
         * cosas distintas para quien está revisando. */
        (delServidor ? ' · ya venía ligada en el servidor' : '') + '</span> ' +
      '<button class="btn fantasma tiny" id="opCambiar" ' +
      'title="Ligarla a otra oportunidad. Queda en el historial.">Cambiar</button>' +
      '</div>';
  }

  function enlazar(m, alElegir) {
    var b = $('#opElegir') || $('#opCambiar');
    if (b) b.onclick = function () { abrir(m, alElegir); };
  }

  /** El diálogo. Tres caminos, en el orden en que sirven:
   *    1. las CANDIDATAS que el servidor propone (lo más probable);
   *    2. buscar a mano;
   *    3. crearla ahí mismo, que es la salida que pidió Esteban.  */
  function abrir(m, alElegir) {
    cerrar();
    var caja = document.createElement('div');
    caja.id = 'opCaja';
    caja.className = 'modal';
    caja.setAttribute('role', 'dialog');
    caja.innerHTML =
      '<div class="caja op-caja" role="dialog" aria-modal="true">' +
        '<h3>La oportunidad de esta cotización</h3>' +
        '<p class="tiny nota">Se guarda el <strong>id</strong> de la tarjeta de CRM. ' +
        'Una tarjeta puede tener varias cotizaciones y varias órdenes: ligar ésta ' +
        '<strong>no desliga</strong> las demás.</p>' +

        '<div id="opCands" class="op-bloque">' +
          '<div class="op-sub">Candidatas</div>' +
          '<div id="opCandsCuerpo" class="tiny nota">Buscando en Odoo…</div>' +
        '</div>' +

        /* El texto dice lo que la búsqueda hace DE VERDAD: casa por el nombre de
         * la oportunidad, no por el del cliente. Prometer «o del cliente» y
         * devolver vacío es la peor combinación: quien busque «Nalco» va a
         * concluir que ese cliente no tiene ninguna. Por cliente está el bloque
         * de candidatas, que es el camino bueno. */
        '<label class="op-l">Buscar por nombre de la oportunidad<br>' +
          '<input id="opBuscar" class="cel" autocomplete="off" ' +
          'placeholder="Parte del nombre de la oportunidad…">' +
          '<span id="opEstado" class="tiny nota">Escribe al menos dos letras.</span></label>' +
        '<div id="opLista" class="op-lista"></div>' +

        '<details class="op-crear"><summary>No existe: crearla ahora</summary>' +
          '<p class="tiny nota">Nace en Odoo como oportunidad del cliente de esta ' +
          'cotización, y queda ligada de inmediato.</p>' +
          '<label class="op-l">Nombre de la oportunidad<br>' +
            '<input id="opNueva" class="cel" autocomplete="off" ' +
            'placeholder="Lo que se va a cotizar"></label>' +
          '<button class="btn fantasma" id="opCrear">Crear y ligar</button>' +
        '</details>' +

        '<div id="opAviso" class="tiny n-bad" hidden></div>' +
        '<div class="acciones">' +
          '<button class="btn fantasma" id="opDespues">Ahora no</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    $('#opDespues').onclick = cerrar;
    caja.onclick = function (e) { if (e.target === caja) cerrar(); };
    document.addEventListener('keydown', alaEscape);

    /* El nombre del machote es el mejor punto de partida para buscar, así que
     * se propone como nombre de la oportunidad nueva. No se propone como
     * búsqueda: las candidatas ya cubren eso y mejor. */
    var nn = $('#opNueva');
    if (nn && m && m.nombre) nn.value = m.nombre;

    pintarCandidatas(m, alElegir);

    var inp = $('#opBuscar');
    var temporizador = null;
    if (inp) {
      inp.oninput = function () {
        if (temporizador) clearTimeout(temporizador);
        /* 250 ms: lo bastante para no pegarle a Odoo en cada tecla, lo bastante
         * poco para que se sienta inmediato. */
        temporizador = setTimeout(function () { pintarBusqueda(inp.value, m, alElegir); }, 250);
      };
    }

    var bc = $('#opCrear');
    if (bc) bc.onclick = function () {
      var n = $('#opNueva') ? $('#opNueva').value.trim() : '';
      bc.disabled = true;
      bc.textContent = 'Creando…';
      crear(n, m ? m.cliente_id : null).then(function (d) {
        if (!document.body.contains(caja)) return;
        bc.disabled = false;
        bc.textContent = 'Crear y ligar';
        if (!d.ok) return avisar(d.mensaje || d.error);
        elegida({ id: d.id, nombre: d.nombre || n }, alElegir);
      });
    };

    setTimeout(function () { var i = $('#opBuscar'); if (i) i.focus(); }, 30);
  }

  function opcionHTML(o) {
    return '<button class="op-op" data-opid="' + o.id + '" data-opnom="' + esc(o.nombre) + '">' +
      '<span class="op-nom">' + esc(o.nombre) + '</span>' +
      (o.cliente ? '<span class="op-cli">' + esc(o.cliente) + '</span>' : '') +
      '<span class="op-meta tiny nota">#' + o.id +
        (o.etapa ? ' · ' + esc(o.etapa) : '') +
        (o.por_que ? ' · ' + esc(o.por_que) : '') + '</span>' +
      '</button>';
  }

  function enlazarOpciones(host, alElegir) {
    if (!host) return;
    host.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-opid]') : null;
      if (!b) return;
      elegida({ id: Number(b.dataset.opid), nombre: b.dataset.opnom }, alElegir);
    };
  }

  function pintarCandidatas(m, alElegir) {
    var host = $('#opCandsCuerpo');
    if (!host) return;
    candidatas(m).then(function (d) {
      if (!host || !document.body.contains(host)) return;
      if (!d.ok) {
        host.className = 'tiny n-bad';
        host.textContent = 'No se pudo leer Odoo (' + d.error + '). ' +
          'Sin catálogo no hay id que poner: vuelve a intentarlo en un momento.';
        return;
      }
      var lista = d.candidatas || [];
      if (!lista.length) {
        host.className = 'tiny nota';
        /* Vacío NO es «no hay oportunidades»: es «ninguna se parece a ésta».
         * Decir la diferencia evita que alguien concluya que Odoo está vacío
         * (CLAUDE.md §20 #11 y #18). */
        host.textContent = (m && m.cliente_id)
          ? 'Ninguna oportunidad viva de este cliente se parece a esta cotización. ' +
            'Búscala abajo o créala.'
          : 'Esta cotización no tiene cliente del catálogo, así que no hay por dónde ' +
            'proponer candidatas. Pon el cliente primero, o busca abajo.';
        return;
      }
      host.className = 'op-lista';
      host.innerHTML = lista.map(opcionHTML).join('');
      enlazarOpciones(host, alElegir);
    });
  }

  function pintarBusqueda(q, m, alElegir) {
    var est = $('#opEstado'), host = $('#opLista');
    if (!est || !host) return;
    buscar(q).then(function (d) {
      if (!document.body.contains(est)) return;
      if (!d.ok) {
        est.className = 'tiny n-bad';
        est.textContent = 'No se pudo buscar en Odoo (' + d.error + ').';
        host.innerHTML = '';
        return;
      }
      if (d.corta) {
        est.className = 'tiny nota';
        est.textContent = 'Escribe al menos dos letras.';
        host.innerHTML = '';
        return;
      }
      var lista = d.oportunidades || [];
      est.className = 'tiny nota';
      est.textContent = lista.length
        ? lista.length + (lista.length === 1 ? ' oportunidad viva.' : ' oportunidades vivas.')
        : 'Ninguna oportunidad viva casa con eso. Si de verdad no existe, créala abajo.';
      host.innerHTML = lista.map(opcionHTML).join('');
      enlazarOpciones(host, alElegir);
    });
  }

  function elegida(o, alElegir) {
    cerrar();
    if (typeof alElegir === 'function') alElegir(o);
  }

  function avisar(texto) {
    var a = $('#opAviso');
    if (!a) return;
    a.hidden = false;
    a.textContent = texto || 'No se pudo.';
  }

  function cerrar() {
    var d = $('#opCaja');
    if (d) d.remove();
    document.removeEventListener('keydown', alaEscape);
  }

  function alaEscape(e) { if (e.key === 'Escape') cerrar(); }

  G.Oportunidades = {
    falta: falta,
    idDe: idDe,
    origenDe: origenDe,
    nombre: nombre,
    marcar: marcar,
    franja: franja,
    pastilla: pastilla,
    enlazar: enlazar,
    abrir: abrir,
    cerrar: cerrar,
    buscar: buscar,
    candidatas: candidatas,
    crear: crear,
    ligar: ligar,
    error: function () { return estado.error; },
    MAX_CANDIDATAS: MAX_CANDIDATAS,
    URL: URL_OP
  };
})(window);
