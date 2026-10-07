/* ═══ La puerta de la Confirmación · UNA sola, para los dos caminos ═════════
 *
 * ── EL DEFECTO QUE ESTO ARREGLA, MEDIDO ANTES DE ESCRIBIR UNA LÍNEA ─────────
 * Al 29-sep-2026 había **dos pantallas y dos definiciones distintas** de «esto
 * ya se puede mandar»:
 *
 *     orden.js      crea la orden BORRADOR   → SÍ aplica los seis candados de
 *                                              la V1.45 (`G.Confirmacion`)
 *     confirmar.js  CONFIRMA en Odoo         → NO menciona `G.Confirmacion` ni
 *                                              una sola vez (grep: 0 líneas)
 *
 * O sea que los candados guardaban la puerta de ENTRADA y no la de SALIDA, que
 * es la irreversible. La Compuerta 2 del servidor sí revisa cosas —el cuadre
 * contra Odoo, la moneda, el IVA por renglón, el presupuesto, la política—
 * pero NO el contacto, NO la decisión de IVA, NO el número ni el archivo de la
 * PO, NO el cuadre contra la PO del cliente, NO el anticipo.
 *
 * Es la misma forma del defecto que costó la noche del 28: un estado calculado
 * en dos sitios no falla, **contesta distinto** — y el que contesta distinto es
 * el que más corre, porque el que se actualiza es el que uno está escribiendo.
 *
 * ── LA REGLA DE ESTE ARCHIVO ────────────────────────────────────────────────
 * Quien quiera saber si una orden se puede confirmar llama a `evaluar`. No hay
 * segunda respuesta. Si mañana aparece un tercer camino —desde un correo, desde
 * un tablero— llama aquí también, y no hereda un hueco.
 *
 * ── Y LO QUE NO SE PUEDE SABER, SE DICE ─────────────────────────────────────
 * Los candados del machote necesitan el machote. Si la cotización no está en
 * ESTE navegador (la libreta de sincronización guarda sólo lo propio, §20 #13),
 * lo que falte se DICE en voz alta — nunca un «todo bien» por no haber podido
 * mirar. Es la misma exigencia que el barrido que se niega a concluir cuando
 * sus consultas fallaron (§20 #19c).
 *
 * Qué tan alto se dice depende del caso, y las tres situaciones están abajo con
 * su porqué. La primera versión BLOQUEABA este caso y estaba mal: los datos de
 * la cotización existen, lo que falta es la forma de leerlos desde aquí, y
 * convertir una limitación del cliente en una avería le habría quitado a
 * alguien una confirmación que hoy sí puede hacer. Desde la V1.47, cuando el
 * servidor manda la `confirmacion` del machote, cuatro de los seis candados se
 * comprueban igual y los otros dos declaran que se abstienen.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ══ LA DECISIÓN ══════════════════════════════════════════════════════════
   *
   * `machote`  la cotización de este navegador, o null si no se pudo resolver.
   * `calc`     lo que devolvió el motor para ese machote, o null.
   * `servidor` lo que contestó la Compuerta 2 (`modo:'evaluar'`), o null si
   *            todavía no se ha preguntado.
   *
   * Devuelve SIEMPRE la misma forma, venga de donde venga la llamada.
   */
  function evaluar(op) {
    var o = op || {};
    var duras = [], blandas = [];

    /* ── 1 · Los candados del machote ─────────────────────────────────────
     *
     * ⚠️ AQUÍ HAY TRES SITUACIONES Y NO DOS, y confundirlas cuesta caro en
     * direcciones opuestas (§20 #12b):
     *
     *   a) No hay machote ligado        → DURA. Confirmar una orden sin
     *      cotización detrás es exactamente lo que este encargo viene a
     *      impedir, y es una capacidad NUEVA: no se le quita nada a nadie.
     *
     *   b) Hay machote, pero no está en ESTE navegador → **NO bloquea**.
     *      Avisa, fuerte y visible, y deja decidir al servidor.
     *
     *   c) Hay machote y está aquí      → los seis candados, como siempre.
     *
     * El caso (b) merece su párrafo, porque la primera versión lo bloqueaba y
     * estaba mal. Los datos de la cotización EXISTEN —viven en el servidor—;
     * lo que no existe es la forma de que este navegador los lea, porque la
     * libreta de sincronización guarda sólo lo propio (§20 #13). Bloquear por
     * eso no es un candado: es convertir una limitación del cliente en una
     * avería, y le quitaría a alguien una confirmación que hoy puede hacer.
     *
     * Tampoco se calla: sale en ámbar diciendo que no se pudo comprobar desde
     * aquí y por qué.
     *
     * ── Y EL CASO (b) YA SE ESTÁ CERRANDO ──
     * Lo que corresponde es que el servidor mande esos campos en la Compuerta
     * 2. Esta mitad ya está hecha (el puente de aquí abajo); la del servidor es
     * una llave más en su respuesta y está escrita en
     * `docs/comercial/POR-QUE-NO-SE-PODIA-CONFIRMAR.md`, sin aplicar, porque
     * `comercial/confirmar` está activo. Mientras no llegue, (b) se comporta
     * EXACTAMENTE como antes de la V1.46: avisa y deja decidir al servidor.
     */
    /* ── EL PUENTE DEL SERVIDOR (V1.47) ──────────────────────────────────
     * Si esta pantalla no tiene el machote pero la Compuerta 2 mandó su
     * `confirmacion`, se usa ESA y los candados valen igual venga de donde
     * venga la cotización. Es el arreglo de fondo del caso (b) de abajo, y es
     * TOLERANTE a propósito: mientras el servidor no mande la llave, esto no
     * hace nada y el comportamiento es el de antes (§8, la mitad tolerante va
     * primero).
     *
     * ⚠️ Lo que NO se hereda es el PRECIO. El subtotal sale del motor del
     * machote, y aquí no hay machote que calcular. Se podría usar el
     * `subtotal_odoo` que el servidor manda al lado, y sería un error: dos
     * sumas del mismo número es una carrera silenciosa y la que pierde no deja
     * rastro (§20 #4). Así que los dos candados que dependen del precio —el
     * cuadre de la PO y el anticipo— SE ABSTIENEN, y eso se DICE en voz alta
     * tres líneas más abajo: una abstención callada se lee como «todo bien»,
     * que es el vacío que se confunde con una respuesta (§20 #11). */
    var mach = o.machote;
    var delServidor = false;
    if (!mach && o.servidor && o.servidor.confirmacion) {
      mach = { confirmacion: o.servidor.confirmacion,
               moneda: o.servidor.moneda || null };
      delServidor = true;
    }

    if (!mach && o.machoteAjeno) {
      blandas.push({
        id: 'machote-ajeno', fuente: 'machote',
        que: 'La cotización no está en este navegador, así que no se pudo comprobar',
        porque: 'Sus datos existen en el servidor, pero este navegador sólo guarda lo que ' +
                'se capturó aquí. El contacto, la decisión de IVA, la orden de compra y el ' +
                'anticipo NO se revisaron: lo que decide es lo que contestó el servidor. ' +
                'Si quieres la revisión completa, ábrela en el navegador donde se capturó.',
        donde: 'No impide confirmar. Es un aviso, no un candado.'
      });
    } else if (!mach) {
      duras.push({
        id: 'sin-machote', fuente: 'machote',
        que: 'Esta orden no tiene machote ligado',
        porque: 'Sin machote no se puede comprobar el contacto, la decisión de IVA, la ' +
                'orden de compra ni el anticipo: esos datos viven en la cotización. Liga ' +
                'una, o captúralos a mano sabiendo que nadie los va a revisar.',
        donde: 'En la orden, en «El machote ligado».'
      });
    } else if (G.Confirmacion) {
      var todos = G.Confirmacion.faltantes(mach, o.calc, o.memoria);
      todos.forEach(function (x) {
        var r = { id: x.id, que: x.que, porque: x.porque, donde: x.donde, fuente: 'machote' };
        if (x.dureza === 'dura') duras.push(r); else blandas.push(r);
      });
      if (delServidor) {
        blandas.push({
          id: 'sin-precio-local', fuente: 'machote',
          que: 'Dos de los seis candados no se pudieron comprobar',
          porque: 'La cotización no está en este navegador, así que sus datos vinieron del ' +
                  'servidor y aquí no hay precio calculado. El contacto, la decisión de IVA y ' +
                  'la orden de compra SÍ se revisaron; el cuadre de la PO contra el precio y ' +
                  'el anticipo NO. Decirlo es la diferencia entre «no impide» y «todo bien».',
          donde: 'Si quieres los seis, ábrela en el navegador donde se capturó.'
        });
      }
    } else {
      duras.push({ id: 'sin-modulo', fuente: 'machote',
        que: 'Los candados de la cotización no están cargados en esta pantalla',
        porque: 'Sin ellos no se puede afirmar que la cotización esté completa, y ' +
                'afirmarlo sin haber mirado es peor que no poder.',
        donde: 'Recarga la pantalla.' });
    }

    /* ── 2 · Lo que dijo el servidor (Compuerta 2) ────────────────────────
     * Es independiente y NO se sustituye por lo de arriba: el servidor mira
     * contra Odoo —el cuadre, la moneda, el IVA por renglón— y esta pantalla
     * mira contra la captura. Las dos cosas tienen que pasar. */
    var s = o.servidor;
    if (!s) {
      duras.push({ id: 'sin-revisar', fuente: 'servidor',
        /* Sin «contra Odoo»: la pastilla de la fuente, tres líneas abajo en
          * `linea()`, ya lo pone. Decía «Todavía no se ha revisado contra Odoo
          * contra Odoo» y la frase la destapó una captura, no el diff. */
        que: 'Todavía no se ha revisado',
        porque: 'Lo que esta pantalla ve es la captura; lo que se va a escribir se ' +
                'compara contra la orden real. Sin esa comparación no se confirma.',
        donde: 'Se pide sola al abrir este cuadro.' });
    } else if (s.ok !== true) {
      duras.push({ id: 'servidor-no', fuente: 'servidor',
        que: 'No se pudo revisar',
        porque: (s.mensaje || 'El servidor no contestó lo que se esperaba.') +
                ' No poder revisar no es lo mismo que estar bien.',
        donde: 'Vuelve a intentarlo; si sigue, avísale a Esteban.' });
    } else {
      if (s.cuadra === false) {
        duras.push({ id: 'no-cuadra', fuente: 'servidor',
          que: 'La orden de Odoo no cuadra con la cotización',
          porque: 'Los importes de allá y los de aquí no dicen lo mismo. Confirmar ' +
                  'congelaría el número equivocado, y es el que se va a facturar.',
          donde: 'En la orden de Odoo, o en el machote.' });
      }
      if (s.dentro_politica === false) {
        blandas.push({ id: 'fuera-politica', fuente: 'servidor',
          que: 'Fuera de política',
          porque: (s.motivos || []).join(' ') ||
                  'La cotización sale de la política de aprobación. Se puede confirmar, ' +
                  'y queda marcada para que alguien lo mire.',
          donde: 'En la política de aprobación.' });
      }
      (s.handoff && s.handoff.avisos ? s.handoff.avisos : []).forEach(function (a, i) {
        blandas.push({ id: 'handoff-' + i, fuente: 'servidor',
          que: 'Aviso del handoff', porque: a, donde: 'En el handoff.' });
      });
    }

    return {
      duras: duras, blandas: blandas,
      puede: duras.length === 0,
      servidor: s || null,
      desde: o.desde || null
    };
  }

  /* ══ LO QUE SE VE ═════════════════════════════════════════════════════════
   * Un solo renderizador. Si los dos caminos pintaran su propia lista, mañana
   * dirían cosas distintas de la misma verdad. */
  function html(v) {
    var linea = function (x, clase) {
      return '<div class="pu-c ' + clase + '">' +
        '<h4>' + esc(x.que) +
          ' <span class="pu-f ' + esc(x.fuente) + '">' +
            (x.fuente === 'machote' ? 'de la cotización' : 'contra Odoo') + '</span></h4>' +
        '<p>' + esc(x.porque) + '</p>' +
        (x.donde ? '<p class="tiny nota">' + esc(x.donde) + '</p>' : '') +
      '</div>';
    };

    var cab = v.puede
      ? '<div class="aviso ok"><strong>Se puede confirmar.</strong> ' +
        (v.blandas.length ? 'Hay ' + v.blandas.length + ' cosa(s) que alguien debería mirar, ' +
          'pero ninguna impide.' : 'No queda nada pendiente.') + '</div>'
      : '<div class="aviso bad"><strong>No se puede confirmar todavía.</strong> ' +
        'Falta' + (v.duras.length === 1 ? '' : 'n') + ' ' + v.duras.length +
        ' cosa' + (v.duras.length === 1 ? '' : 's') + ', y cada una dice dónde se arregla.</div>';

    return cab +
      (v.duras.length ? '<h4 class="pu-t">Lo que impide</h4>' +
        v.duras.map(function (x) { return linea(x, 'frena'); }).join('') : '') +
      (v.blandas.length ? '<h4 class="pu-t">Lo que hay que mirar, pero no impide</h4>' +
        v.blandas.map(function (x) { return linea(x, 'avisa'); }).join('') : '');
  }

  /* ══ EL CUADRO, QUE ES UNO ════════════════════════════════════════════════ */
  function caja() {
    var c = document.getElementById('puVelo');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'puVelo';
    c.className = 'pu-velo';
    c.innerHTML =
      '<div class="pu-modal">' +
        '<div class="pu-cab"><h3 id="puTt">Confirmar</h3>' +
          '<span class="chip-mini" id="puDesde"></span>' +
          '<button class="btn" id="puX">×</button></div>' +
        '<div class="pu-cuerpo" id="puCuerpo"></div>' +
        '<div class="pu-pie">' +
          '<button class="btn" id="puCancel">Cancelar</button>' +
          '<button class="btn primario" id="puOk" disabled>Confirmar en Odoo</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(c);
    c.querySelector('#puX').addEventListener('click', cerrar);
    c.querySelector('#puCancel').addEventListener('click', cerrar);
    return c;
  }
  function cerrar() {
    var c = document.getElementById('puVelo');
    if (c) c.classList.remove('abierto');
  }

  /* Qué cotización tiene delante el cuadro abierto. Lo pone `abrir`. */
  var _abierto = null;

  /* `abrir` es lo que llaman los dos caminos. Lo único que cambia entre ellos
   * es la insignia que dice por dónde se entró — y eso es de diagnóstico, no
   * de decisión. */
  function abrir(op) {
    var o = op || {};
    var c = caja();
    c.classList.add('abierto');

    var orden = o.orden || {};
    var machote = o.machote || null;
    if (!machote && orden.machote && G.MachoteApp && G.MachoteApp.machotePorUuid)
      machote = G.MachoteApp.machotePorUuid(orden.machote.id);

    var calc = (machote && G.MachoteCalc && G.MachoteCalc.calcular)
      ? G.MachoteCalc.calcular(machote) : null;

    document.getElementById('puTt').textContent =
      'Confirmar ' + (orden.nombre || o.titulo || '');
    /* V1.48 · hay TRES entradas, no dos. Con un ternario, la tercera caía en
     * el `else` y la insignia mentía: decía «desde Confirmar órdenes» a quien
     * venía del machote. Un rótulo de diagnóstico que miente es peor que no
     * tenerlo, porque se usa para saber por dónde entró alguien. */
    var DESDE = { orden: 'paso 2 de 3 · desde la orden',
                  machote: 'paso 2 de 3 · desde la cotización',
                  confirmar: 'paso 2 de 3 · desde Confirmar órdenes' };
    document.getElementById('puDesde').textContent =
      DESDE[o.desde] || ('paso 2 de 3 · ' + (o.desde || 'origen no dicho'));

    /* «No lo encontré» y «no lo hay» son dos cosas distintas, y de eso depende
     * si esto bloquea o sólo avisa. */
    var hayLiga = !!(orden && orden.machote) || !!o.machote_id;
    var base = { machote: machote, calc: calc, desde: o.desde,
                 machoteAjeno: hayLiga && !machote };

    /* Primero se pinta SIN la respuesta del servidor, que todavía no llegó —y
     * eso sale como una dura que dice justo eso, no como un hueco. */
    /* Lo que la puerta a DATOS necesita: el machote de ESTE cuadro. Vive aquí
     * porque `pintar` se llama dos veces (antes y después del servidor) y el
     * botón se vuelve a crear en cada pintada. */
    _abierto = { machote: machote, ajeno: base.machoteAjeno, desde: o.desde };

    pintar(evaluar(base));

    var uuid = (orden.machote && orden.machote.id) || o.machote_id;
    var A = G.MachoteAlmacen;
    if (uuid && A && A.evaluarConfirmacion) {
      A.evaluarConfirmacion(uuid).then(function (r) {
        base.servidor = r;
        pintar(evaluar(base));
      });
    }
  }

  /* ── EL PASO 3, VISIBLE Y APAGADO ────────────────────────────────────────
   * Se LLEGA hasta aquí y se ve lo que haría; simplemente no escribe. No se
   * esconde el botón: un botón que desaparece se lee como algo que se perdió,
   * y el siguiente en abrir la pantalla no tiene forma de saber que existe.
   *
   * El motivo NO se escribe aquí: se le pregunta al almacén, que es donde vive
   * el interruptor. Dos copias del motivo se separan el día que se encienda. */
  function bloqueFinal() {
    var A = G.MachoteAlmacen;
    var encendido = !A || !A.confirmacionEncendida || A.confirmacionEncendida();
    if (encendido) return '';
    var F = G.ConfirmarFlujo;
    var motivo = (A && A.motivoApagado) ? A.motivoApagado('confirmar') : '';
    var h = '<div class="pu-final aviso warn"><strong>Paso 3 · Confirmar en Odoo — APAGADO</strong>' +
            '<p class="tiny">' + motivo + '</p>';
    if (F && F.FINAL && F.FINAL.condiciones) {
      /* NO dice cuántas son: decía «los tres cambios» y el 7-oct pasaron a
        * cinco, con dos ya hechas. Un número escrito a mano al lado de una
        * lista que crece se contradice solo — y lo cazó una captura (§20 #20),
        * porque leyendo el arreglo de condiciones nadie mira el encabezado. */
      h += '<p class="tiny">Lo que falta, y lo que ya está, de ' +
           '<code>' + F.FINAL.donde + '</code>:</p><ul class="tiny">';
      F.FINAL.condiciones.forEach(function (c) { h += '<li>' + c + '</li>'; });
      h += '</ul>';
    }
    return h + '</div>';
  }

  /* ── LA PUERTA A DATOS, Y POR QUÉ HACÍA FALTA ────────────────────────────
   * MEDIDO el 30-sep-2026, no deducido: de los 8 candados que frenan en el
   * caso peor, SIETE terminan en «Arriba, en DATOS» — y dentro de este cuadro
   * sólo había tres controles: ×, Cancelar y el Confirmar apagado. Peor: el
   * botón de DATOS del machote SÍ existe y está visible, pero
   * `document.elementFromPoint` sobre su centro devuelve `puVelo`, o sea que
   * el velo de este cuadro se come el clic. La pantalla que el mensaje nombra
   * está TAPADA por la pantalla que lo dice, y la única salida era «Cancelar»,
   * que se lee como abandonar.
   *
   * Es el mismo defecto del paso 1 que reportó Esteban, un cuadro más adentro.
   *
   * Y cuando la cotización NO está en este navegador —el caso de la vista de
   * órdenes con un machote ajeno— el botón NO se pone: ahí la puerta de verdad
   * no existe, y ofrecerla sería peor que decirlo. */
  function bloquePuerta(v) {
    if (!_abierto) return '';
    var duras = (v && v.duras) || [];
    var aDatos = duras.filter(function (x) {
      return x && /DATOS/i.test(String(x.donde || ''));
    }).length;
    if (!aDatos) return '';

    if (!_abierto.machote) {
      return '<div class="aviso warn"><strong>' + aDatos + ' de las cosas que faltan se ' +
        'arreglan en DATOS de la cotización, y esa cotización no está en este ' +
        'navegador.</strong> Se capturó en otra máquina, así que desde aquí no se puede ' +
        'abrir: tiene que completarla quien la capturó. Lo que falta está en la lista de ' +
        'arriba, tal cual, para podérselo pedir.</div>';
    }
    return '<div class="p1-puertas"><button class="btn primario" id="puDatos">' +
      'Abrir DATOS de la cotización (' + aDatos + ' pendiente' + (aDatos === 1 ? '' : 's') +
      ')</button></div>' +
      '<p class="p1-nota">Se cierra este cuadro y se abre DATOS. Al terminar, vuelve a ' +
      '«Confirmar orden»: los candados se vuelven a revisar desde cero.</p>';
  }

  function pintar(v) {
    var cu = document.getElementById('puCuerpo');
    if (cu) cu.innerHTML = html(v) + bloqueFinal();

    /* ⚠️ LA PUERTA VA ARRIBA, PEGADA AL VEREDICTO, Y ESO LO DIJO LA CAPTURA.
     * Concatenada al final quedaba DESPUÉS de los ocho candados: quien lee
     * «Arriba, en DATOS» en el primero tenía que bajar por los ocho para
     * encontrar el botón. La prueba pasaba igual —el botón existía y
     * funcionaba—, y a 1280 se veía de un golpe que no estaba donde se lee el
     * problema. Se inserta después del primer `.aviso`, que es el veredicto.
     * (§20 #12: una pantalla se revisa mirándola.) */
    var hp = bloquePuerta(v);
    if (cu && hp) {
      var av = cu.querySelector('.aviso');
      var caja = document.createElement('div');
      caja.innerHTML = hp;
      /* ⚠️ Con un `while` insertando ante `av.nextSibling`, cada nodo insertado
       * se vuelve el ancla del siguiente y el bloque sale AL REVÉS: la nota
       * quedaba encima del botón. Se vio en la captura de 1280, no en el
       * código. Con un fragmento se inserta de una y en orden. */
      var frag = document.createDocumentFragment();
      while (caja.firstChild) frag.appendChild(caja.firstChild);
      if (av && av.parentNode) av.parentNode.insertBefore(frag, av.nextSibling);
      else cu.insertBefore(frag, cu.firstChild);
    }

    var bd = cu && cu.querySelector('#puDatos');
    if (bd) bd.addEventListener('click', function () {
      var m = _abierto && _abierto.machote;
      if (!m || !G.MachoteOrden) return;
      cerrar();
      G.MachoteOrden.abrir(m, function (mm) {
        /* Lo que el usuario acaba de capturar se guarda por el camino de
         * siempre —esta pieza no escribe— y la pantalla de atrás se entera. */
        if (G.MachoteApp && G.MachoteApp.tocado) G.MachoteApp.tocado(mm);
      });
    });
    var ok = document.getElementById('puOk');
    if (!ok) return;
    var A = G.MachoteAlmacen;
    var apagado = A && A.confirmacionEncendida && !A.confirmacionEncendida();
    /* Apagado manda sobre el veredicto: aunque los candados pasen, no se
     * escribe. Y el botón lo DICE, en vez de quedarse gris sin explicación. */
    ok.disabled = apagado || !v.puede;
    ok.textContent = apagado ? 'Confirmar en Odoo — apagado' : 'Confirmar en Odoo';
    ok.title = apagado
      ? ((A && A.motivoApagado) ? A.motivoApagado('confirmar') : 'Apagado a propósito.')
      : '';
  }

  G.PuertaConfirmar = {
    evaluar: evaluar, html: html, abrir: abrir, cerrar: cerrar
  };
})(window);
