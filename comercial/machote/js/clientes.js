/* ── El catálogo de clientes ──────────────────────────────────────────────
 * Issue #148 · lo que pidió Esteban: «que sea solo visual y alomejor
 * publicamente grabe el ID, para que al publico solo se vea el ID y lo
 * dinamico sea la lectura en odoo. esto en backend. en front end no veriamos
 * eso, en frontend solo veriamos el nombre del cliente».
 *
 * Lo que se GUARDA en el machote es `cliente_id`, un número. El NOMBRE se lee
 * de Odoo cada vez que se pinta. Dos razones, y ninguna es de estilo:
 *
 *   1. Si al cliente le cambian la razón social en Odoo, las cotizaciones
 *      viejas la muestran corregida sola. Un nombre copiado se queda con la
 *      versión del día que se capturó y nadie vuelve a tocarla.
 *   2. Este repo es PÚBLICO y sirve Pages (CLAUDE.md §20 regla 7). El día que
 *      los machotes salgan del navegador, lo que viaje es `1247`, no la
 *      cartera de clientes de FTS.
 *
 * ⚠️ EL CATÁLOGO NO SE GUARDA EN EL REPO. Vive en Odoo, se pide al vuelo y se
 * cachea en memoria mientras la pestaña está abierta. Ni localStorage ni JSON
 * commiteado: un archivo con los 250 clientes en un repo público es la misma
 * filtración, sólo que más difícil de deshacer.
 *
 * ── Degradar sin trabar (CLAUDE.md §8, regla anti-trabón) ────────────────
 * Este lado es el TOLERANTE. Si el webhook no existe todavía, si n8n está
 * caído o si el token venció, el campo de cliente **sigue siendo un texto
 * libre que funciona**: se guarda lo que se escriba y `cliente_id` queda en
 * null. Nunca se bloquea crear un machote porque Odoo no contestó — el
 * machote casi siempre nace antes que la orden, y a veces antes que el alta
 * del cliente.
 */
(function (G) {
  'use strict';

  var BASE = 'https://primary-production-5c3c.up.railway.app/webhook';
  var URL_CLIENTES = BASE + '/comercial/clientes';
  var TIMEOUT_MS = 12000;

  /* Una sola lectura por pestaña. `promesa` guarda la petición EN VUELO, no
   * sólo el resultado: si dos pantallas piden el catálogo al mismo tiempo,
   * comparten la misma llamada en vez de pegarle dos veces a Odoo. */
  var estado = { promesa: null, clientes: null, error: null, porId: null };

  function indexar(lista) {
    var m = {};
    for (var i = 0; i < lista.length; i++) m[lista[i].id] = lista[i].nombre;
    return m;
  }

  /** Lee el catálogo. Resuelve SIEMPRE —nunca rechaza— con
   *  `{ok:true, clientes:[{id,nombre}]}` o `{ok:false, error, mensaje}`. */
  function cargar() {
    if (estado.promesa) return estado.promesa;

    var S = G.SuiteAuth;
    var token = S && S.getToken && S.getToken();
    if (!token) {
      estado.error = 'SIN_SESION';
      return Promise.resolve({ ok: false, error: 'SIN_SESION',
        mensaje: 'No hay sesión: el cliente se escribe a mano.' });
    }

    var corta = null;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var opciones = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El token va en el CUERPO, no en Authorization: el header dispara un
      // preflight CORS que el webhook de n8n no contesta (CLAUDE.md §15 #5).
      body: JSON.stringify({ token: token })
    };
    if (ctrl) opciones.signal = ctrl.signal;

    estado.promesa = fetch(URL_CLIENTES, opciones)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || d.ok !== true || !Array.isArray(d.clientes)) {
          throw new Error((d && d.error) || 'RESPUESTA_INVALIDA');
        }
        estado.clientes = d.clientes;
        estado.porId = indexar(d.clientes);
        estado.error = null;
        return { ok: true, clientes: d.clientes };
      })
      .catch(function (e) {
        // El catálogo se pierde, la captura no. Se deja constancia del porqué
        // en la consola y el llamador decide cómo degradar.
        estado.error = String((e && e.message) || e);
        // Se limpia la promesa para que el siguiente intento vuelva a probar:
        // cachear un fallo de red condena la pestaña entera.
        estado.promesa = null;
        return { ok: false, error: 'SIN_CATALOGO', mensaje: estado.error };
      })
      .then(function (res) { if (corta) clearTimeout(corta); return res; });

    if (ctrl) corta = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return estado.promesa;
  }

  /** El nombre que se PINTA. Con el catálogo cargado gana Odoo; sin él, lo
   *  último que se supo. Nunca devuelve vacío si hay algo que decir. */
  function nombre(m) {
    if (!m) return '';
    if (m.cliente_id && estado.porId && estado.porId[m.cliente_id]) {
      return estado.porId[m.cliente_id];
    }
    if (m.cliente) return m.cliente;
    return m.cliente_id ? ('Cliente ' + m.cliente_id) : '';
  }

  /** ¿Lo que se está pintando salió de Odoo, o es el respaldo local? */
  function esDeOdoo(m) {
    return !!(m && m.cliente_id && estado.porId && estado.porId[m.cliente_id]);
  }

  /** Del texto tecleado al id. Exacto primero; si no, sin acentos ni
   *  mayúsculas — nadie teclea «Abamex Ingeniería» con la tilde puesta. */
  function resolver(texto) {
    var t = String(texto || '').trim();
    if (!t || !estado.clientes) return null;
    var i;
    for (i = 0; i < estado.clientes.length; i++) {
      if (estado.clientes[i].nombre === t) return estado.clientes[i];
    }
    var plano = aplanar(t);
    var halladas = [];
    for (i = 0; i < estado.clientes.length; i++) {
      if (aplanar(estado.clientes[i].nombre) === plano) halladas.push(estado.clientes[i]);
    }
    // Dos clientes que sólo se distinguen por un acento existen de verdad en
    // Odoo («Alta Extracción» y «ALTA EXTRACCION» son ids distintos). Ante el
    // empate no se elige: se deja el texto libre y se ve en la pantalla.
    return halladas.length === 1 ? halladas[0] : null;
  }

  function aplanar(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  G.Clientes = {
    cargar: cargar,
    nombre: nombre,
    esDeOdoo: esDeOdoo,
    resolver: resolver,
    lista: function () { return estado.clientes; },
    error: function () { return estado.error; },
    URL: URL_CLIENTES
  };
})(window);
