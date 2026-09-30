/* ═══ Buscar una orden de venta y ligarla · el espejo de `orden-ligar.js` ════
 *
 * ── POR QUÉ SON DOS PIEZAS Y NO UNA ─────────────────────────────────────────
 * `orden-ligar.js` liga DESDE la orden: se elige el machote, y los machotes
 * están en este navegador, así que la lista sale de la libreta local.
 * Esta pieza liga DESDE el machote: se elige la ORDEN, y las órdenes viven en
 * Odoo —1,546 de ellas—, así que la lista sale del servidor. La pregunta se
 * parece; de dónde sale la respuesta no, y eso es lo que decide la pieza.
 *
 * Lo que NO se duplica es la ESCRITURA: las dos llaman a
 * `MachoteAlmacen.ligarOrden`, que sigue siendo el único escritor de la liga
 * (§20 #4). Si mañana hay que cambiar qué se manda al ligar, se cambia una vez.
 *
 * ── LAS DOS FORMAS DE BUSCAR, Y POR QUÉ HACEN FALTA LAS DOS ─────────────────
 *   por CLIENTE  · el caso normal. La orden de esta cotización es casi siempre
 *                  una de las de su cliente. Necesita `cliente_id`, o sea que
 *                  el cliente se haya ELEGIDO del catálogo, no escrito a mano.
 *   por NÚMERO   · para cuando la orden está a nombre de otro contacto (obra
 *                  facturada a la matriz, por ejemplo), o cuando la cotización
 *                  trae el cliente escrito a mano y no hay `cliente_id`.
 *
 * Sin la segunda, una cotización con el cliente sin resolver no tendría manera
 * de llegar a su orden — y sería otro callejón, más escondido que el que esto
 * viene a tapar.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ───────────────────────────────────────────
 * No crea órdenes. Hoy las órdenes se crean en Odoo (así existen las 1,546) y
 * el botón de emitir desde aquí está apagado a propósito, con su motivo. Por
 * eso cuando no aparece ninguna candidata, lo que se ofrece es lo que SÍ se
 * puede hacer, no un botón que no lleva a nada.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Los estados de Odoo, en palabras. Un renglón que dice `sale` obliga a
   * saberse la tabla; y la primera captura de la lista de órdenes salió con las
   * letras crudas justamente por esto. */
  var ESTADO = {
    draft: 'presupuesto', sent: 'presupuesto enviado', sale: 'orden confirmada',
    done: 'cerrada', cancel: 'cancelada'
  };
  function estadoTx(e) { return ESTADO[e] || e || ''; }

  function dinero(n, mon) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    try {
      return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
             (mon ? ' ' + mon : '');
    } catch (e) { return String(n) + (mon ? ' ' + mon : ''); }
  }

  /* El estado de esta pantalla. `res` es lo ÚLTIMO que contestó el servidor, y
   * se guarda tal cual: lo que se pinta sale de ahí, nunca de lo que se pidió. */
  var _st = {
    machote: null, uuid: null, alTerminar: null,
    por: 'cliente',        // 'cliente' | 'numero'
    q: '',
    buscando: false,
    res: null,             // la respuesta cruda del servidor
    sel: null,
    ligando: false
  };

  function clienteId(m) {
    return (m && typeof m.cliente_id === 'number' && isFinite(m.cliente_id))
      ? m.cliente_id : null;
  }

  // ── Pintar ────────────────────────────────────────────────────────────────

  function filas() {
    var r = _st.res;
    if (!r) {
      return '<p class="tiny nota">Busca arriba para ver las órdenes entre las que ' +
             'puedes elegir.</p>';
    }
    if (r.ok !== true) {
      /* Cada causa con sus palabras. Un mensaje único para «no hay red», «la
       * sesión venció» y «falta publicar el endpoint» manda a la persona a
       * hacer lo que no arregla nada (§20 #12b). */
      var esApagado = r.error === 'ENDPOINT_APAGADO';
      return '<div class="aviso ' + (esApagado ? 'warn' : 'bad') + '">' +
        '<strong>' + (esApagado
          ? 'Esta búsqueda todavía no está encendida en el servidor.'
          : 'No se pudo buscar.') + '</strong> ' +
        esc(r.mensaje || 'El servidor no contestó lo que se esperaba.') +
        (esApagado
          ? ' El endpoint <code>comercial/ordenes</code> ya está construido y está ' +
            '<strong>sin publicar</strong>: publicarlo es un clic en n8n que sólo puede ' +
            'dar quien administra la suite. Mientras tanto la liga se puede poner ' +
            'desde la vista de <strong>Órdenes de venta</strong>… que usa el mismo ' +
            'endpoint, así que tampoco. No es tu cotización: es ese clic.'
          : '') +
        '</div>';
    }
    var lista = Array.isArray(r.ordenes) ? r.ordenes : [];
    if (!lista.length) {
      return '<div class="aviso"><strong>Ninguna orden casa con eso.</strong> ' +
        (_st.por === 'cliente'
          ? 'Este cliente no tiene órdenes en Odoo (de las empresas 1 y 6, sin contar ' +
            'las canceladas). Prueba <em>por número</em>: la orden puede estar a nombre ' +
            'de otro contacto, por ejemplo la matriz.'
          : 'Revisa el número. Se busca por coincidencia, así que <code>11905</code> ' +
            'encuentra <code>SO11905</code>; si no aparece, es que no existe con ese ' +
            'número en las empresas 1 y 6.') +
        '</div>';
    }

    var h = '';
    if (r.truncado === true) {
      h += '<div class="aviso warn"><strong>Hay más de las que caben.</strong> ' +
        'Se muestran las 50 más recientes. Si la que buscas es vieja, búscala por ' +
        'número — acotar es más seguro que asomarse a una lista cortada.</div>';
    }
    h += '<div class="lg-lista">';
    lista.forEach(function (o) {
      var sub = [estadoTx(o.estado), dinero(o.total, o.moneda), o.fecha]
        .filter(Boolean).join(' · ');
      h += '<label class="lg-fila">' +
        '<input type="radio" name="obO" value="' + esc(o.id) + '" />' +
        '<span class="lg-tx">' +
          '<b>' + esc(o.nombre) + '</b> · ' + esc(o.cliente || 'sin cliente') +
          '<span class="tiny nota">' + esc(sub) +
            /* Que ya esté ligada a otra cotización se ENSEÑA. Es legal —varias
             * por orden, una manda— pero hay que verlo ANTES, no después. */
            (o.ligada
              ? ' · <b>ya tiene ligada ' + esc(o.ligada_a || 'otra cotización') + '</b>'
              : '') +
          '</span>' +
        '</span></label>';
    });
    h += '</div>';
    return h;
  }

  /* Las puertas de salida cuando de verdad no hay orden. Aquí es donde un
   * botón muerto sería el mismo defecto que esta pantalla viene a arreglar:
   * lo que se ofrece es lo que funciona HOY, y se dice en qué orden hacerlo. */
  function sinOrden() {
    return '<details class="p1-nota"><summary>Y si esta cotización todavía no tiene ' +
      'orden en Odoo…</summary>' +
      '<p><strong>Lo más probable es que sí la tenga.</strong> Las 1,546 órdenes de ' +
      'Odoo se crearon antes de que existiera esta liga, así que casi ninguna está ' +
      'ligada todavía: «sin orden ligada» casi siempre significa «sin ligar», no ' +
      '«sin orden». Búscala por número antes de darla por inexistente.</p>' +
      '<p><strong>Si de verdad no existe:</strong> se crea en Odoo, como se han creado ' +
      'todas hasta hoy, y se vuelve aquí a ligarla. Emitirla desde esta pantalla está ' +
      'apagado a propósito y no es un permiso que te falte: ' +
      '<code>comercial/orden-crear-v2</code> tarda ~29 minutos en contestar y el ' +
      'navegador corta a los 10 s, así que se ve un error y la orden se crea de todas ' +
      'formas. Encenderlo sin arreglar eso produce órdenes duplicadas.</p>' +
      '</details>';
  }

  function html() {
    var m = _st.machote || {};
    var cid = clienteId(m);
    var hayUuid = !!_st.uuid;

    var cab = '<div class="pu-cab"><h3>Ligar una orden a ' +
      esc(m.nombre || 'esta cotización') + '</h3>' +
      '<span class="chip-mini">paso 1 · ligar</span>' +
      '<button class="btn" id="obX">&times;</button></div>';

    var cuerpo = '';

    /* Sin identidad del servidor no hay liga posible, y se dice con su remedio
     * antes de que nadie teclee una búsqueda que no va a servir de nada. */
    if (!hayUuid) {
      cuerpo += '<div class="aviso bad"><strong>Esta cotización todavía no ha subido al ' +
        'servidor.</strong> La liga se guarda en la base y necesita la identidad de ' +
        'allá, que se asigna al guardar. Guárdala una vez y vuelve: no hay que capturar ' +
        'nada de nuevo.</div>';
    } else {
      cuerpo +=
        '<p class="tiny">La liga se escribe en la base, no en este navegador: así la ve ' +
        'todo el equipo. De la cotización que manda salen el contacto, la decisión de ' +
        'IVA, la orden de compra y el anticipo que el checklist revisa.</p>';

      cuerpo += '<div class="p1-puertas" role="group" aria-label="Cómo buscar">' +
        '<button class="btn' + (_st.por === 'cliente' ? ' primario' : '') + '" id="obPorCli"' +
          (cid === null ? ' disabled' : '') + '>Buscar las órdenes de ' +
          esc(m.cliente || 'su cliente') + '</button>' +
        '<button class="btn' + (_st.por === 'numero' ? ' primario' : '') + '" id="obPorNum">' +
          'Buscar por número de orden</button>' +
        '</div>';

      if (cid === null) {
        /* El cliente escrito a mano NO bloquea: manda a la otra forma, que sí
         * funciona. Deshabilitar sin decir por qué es el callejón otra vez. */
        cuerpo += '<div class="aviso warn"><strong>El cliente de esta cotización está ' +
          'escrito a mano</strong>, no elegido del catálogo, así que no se puede buscar ' +
          '«sus» órdenes: Odoo no sabe quién es. Búscala <strong>por número</strong>, ' +
          'que no depende de eso.</div>';
      }

      if (_st.por === 'numero') {
        cuerpo += '<label class="campo"><span>Número de orden</span>' +
          '<input type="text" id="obQ" value="' + esc(_st.q) + '" ' +
          'placeholder="11905, SO11905…" /></label>' +
          '<div class="p1-puertas"><button class="btn" id="obGo"' +
          (_st.buscando ? ' disabled' : '') + '>' +
          (_st.buscando ? 'Buscando…' : 'Buscar') + '</button></div>';
      } else if (_st.buscando) {
        cuerpo += '<p class="tiny nota">Buscando las órdenes de ' +
          esc(m.cliente || 'el cliente') + '…</p>';
      }

      cuerpo += filas();
      cuerpo += sinOrden();
    }

    var pie = '<div class="pu-pie">' +
      '<button class="btn" id="obCancel">Cancelar</button>' +
      '<button class="btn primario" id="obOk" disabled>' +
        (_st.ligando ? 'Ligando…' : 'Ligar y continuar al checklist') +
      '</button></div>';

    return '<div class="pu-modal">' + cab +
      '<div class="pu-cuerpo" id="obCuerpo">' + cuerpo + '</div>' + pie + '</div>';
  }

  function caja() {
    var c = document.getElementById('obVelo');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'obVelo'; c.className = 'pu-velo';
    document.body.appendChild(c);
    return c;
  }

  function cerrar() {
    var c = document.getElementById('obVelo');
    if (c) c.classList.remove('abierto');
  }

  function pintar() {
    var c = caja();
    c.innerHTML = html();
    c.classList.add('abierto');

    var x = c.querySelector('#obX'), cn = c.querySelector('#obCancel');
    if (x) x.addEventListener('click', cerrar);
    if (cn) cn.addEventListener('click', cerrar);

    var pc = c.querySelector('#obPorCli');
    if (pc) pc.addEventListener('click', function () {
      _st.por = 'cliente'; _st.sel = null; _st.res = null;
      buscar();
    });
    var pn = c.querySelector('#obPorNum');
    if (pn) pn.addEventListener('click', function () {
      _st.por = 'numero'; _st.sel = null; _st.res = null;
      pintar();
      var q = document.getElementById('obQ');
      if (q) q.focus();
    });

    var q = c.querySelector('#obQ');
    if (q) {
      q.addEventListener('input', function () { _st.q = q.value; });
      q.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); buscar(); }
      });
    }
    var go = c.querySelector('#obGo');
    if (go) go.addEventListener('click', buscar);

    c.querySelectorAll('input[name="obO"]').forEach(function (r) {
      r.addEventListener('change', function () {
        _st.sel = r.value;
        var ok = document.getElementById('obOk');
        if (ok) ok.disabled = false;
      });
    });

    var ok = c.querySelector('#obOk');
    if (ok) {
      ok.disabled = !_st.sel || _st.ligando;
      ok.addEventListener('click', ligar);
    }
  }

  function buscar() {
    var A = G.MachoteAlmacen;
    if (!A || !A.buscarOrdenes) {
      _st.res = { ok: false, error: 'SIN_PIEZA',
        mensaje: 'No está cargada la pieza que habla con el servidor.' };
      pintar();
      return;
    }
    var cid = clienteId(_st.machote);
    var pet = _st.por === 'numero'
      ? { q: _st.q }
      : { cliente_id: cid };

    _st.buscando = true; _st.sel = null;
    pintar();
    A.buscarOrdenes(pet).then(function (r) {
      _st.buscando = false;
      /* Se guarda LO QUE CONTESTÓ, tal cual. El `ok` de una pantalla no puede
       * salir de lo que se pidió (§8). */
      _st.res = r || { ok: false, error: 'RESPUESTA_VACIA' };
      pintar();
    });
  }

  function ligar() {
    if (!_st.sel || !_st.uuid) return;
    var lista = (_st.res && Array.isArray(_st.res.ordenes)) ? _st.res.ordenes : [];
    var o = null;
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === String(_st.sel)) { o = lista[i]; break; }
    }
    if (!o) return;

    var aviso = 'Vas a ligar esta cotización a ' + o.nombre + '.' +
      (o.ligada ? '\n\nEsa orden ya tiene ligada ' + (o.ligada_a || 'otra cotización') +
                  '; aquélla se queda ligada y deja de mandar. Nada se borra.' : '') +
      '\n\n¿Seguir?';
    if (!G.confirm(aviso)) return;

    var A = G.MachoteAlmacen;
    _st.ligando = true;
    pintar();
    A.ligarOrden(o.id, o.nombre, _st.uuid, true).then(function (r) {
      _st.ligando = false;
      if (r && r.ok === true) {
        cerrar();
        /* Y se sigue al checklist, que es a lo que se venía. Devolver a quien
         * ligó al mismo diálogo de antes sería hacerle repetir el camino. */
        if (_st.alTerminar) _st.alTerminar({ id: o.id, nombre: o.nombre, _f: o }, r);
        return;
      }
      _st.res = _st.res || {};
      pintar();
      G.alert((r && r.mensaje) || 'No se pudo ligar. Nada cambió.');
    });
  }

  /** `machote` es el documento en pantalla; `uuid` su identidad del servidor
   *  (la que `MachoteAlmacen.idServidor` resuelve); `alTerminar(orden, resp)` se
   *  llama SÓLO si la base confirmó la liga. */
  function abrir(machote, uuid, alTerminar) {
    _st.machote = machote || null;
    _st.uuid = uuid || null;
    _st.alTerminar = alTerminar || null;
    _st.por = clienteId(machote) === null ? 'numero' : 'cliente';
    _st.q = ''; _st.res = null; _st.sel = null;
    _st.buscando = false; _st.ligando = false;
    pintar();
    /* Con cliente resuelto se busca de una: la lista de sus órdenes es la
     * respuesta al 90% de los casos y hacerla pedir un clic es hacer trabajar
     * a quien ya dijo lo que quería. */
    if (_st.uuid && _st.por === 'cliente') buscar();
  }

  /* `sinOrden` se EXPORTA porque el paso 1 lo necesita también: quien abre
   * Confirmar orden sin liga se enfrenta a la pregunta ahí, antes de llegar a
   * esta pantalla. Exportarlo en vez de copiarlo es la misma razón de siempre
   * — dos copias no fallan, contestan distinto (§20 #4). */
  G.OrdenBuscar = { abrir: abrir, cerrar: cerrar, sinOrdenHTML: sinOrden,
                    _estado: function () { return _st; } };
})(window);
