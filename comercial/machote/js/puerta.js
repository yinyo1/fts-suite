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
 * no se puede comprobar — y entonces esto devuelve una **dura** que lo dice,
 * nunca un «todo bien» por no haber podido mirar. Es la misma exigencia que el
 * barrido que se niega a concluir cuando sus consultas fallaron (§20 #19c).
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
     * aquí y por qué. Lo que corresponde es que el servidor devuelva esos
     * campos en la Compuerta 2 —entonces (b) desaparece y el candado vale para
     * todos—, y eso está anotado como pendiente. Mientras tanto, el
     * comportamiento de este caso es EL MISMO que antes de la V1.46.
     */
    if (!o.machote && o.machoteAjeno) {
      blandas.push({
        id: 'machote-ajeno', fuente: 'machote',
        que: 'La cotización no está en este navegador, así que no se pudo comprobar',
        porque: 'Sus datos existen en el servidor, pero este navegador sólo guarda lo que ' +
                'se capturó aquí. El contacto, la decisión de IVA, la orden de compra y el ' +
                'anticipo NO se revisaron: lo que decide es lo que contestó el servidor. ' +
                'Si quieres la revisión completa, ábrela en el navegador donde se capturó.',
        donde: 'No impide confirmar. Es un aviso, no un candado.'
      });
    } else if (!o.machote) {
      duras.push({
        id: 'sin-machote', fuente: 'machote',
        que: 'Esta orden no tiene machote ligado',
        porque: 'Sin machote no se puede comprobar el contacto, la decisión de IVA, la ' +
                'orden de compra ni el anticipo: esos datos viven en la cotización. Liga ' +
                'una, o captúralos a mano sabiendo que nadie los va a revisar.',
        donde: 'En la orden, en «El machote ligado».'
      });
    } else if (G.Confirmacion) {
      var todos = G.Confirmacion.faltantes(o.machote, o.calc, o.memoria);
      todos.forEach(function (x) {
        var r = { id: x.id, que: x.que, porque: x.porque, donde: x.donde, fuente: 'machote' };
        if (x.dureza === 'dura') duras.push(r); else blandas.push(r);
      });
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
        que: 'Todavía no se ha revisado contra Odoo',
        porque: 'Lo que esta pantalla ve es la captura; lo que se va a escribir se ' +
                'compara contra la orden real. Sin esa comparación no se confirma.',
        donde: 'Se pide sola al abrir este cuadro.' });
    } else if (s.ok !== true) {
      duras.push({ id: 'servidor-no', fuente: 'servidor',
        que: 'No se pudo revisar contra Odoo',
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
    document.getElementById('puDesde').textContent =
      o.desde === 'orden' ? 'desde la orden' : 'desde Confirmar órdenes';

    /* «No lo encontré» y «no lo hay» son dos cosas distintas, y de eso depende
     * si esto bloquea o sólo avisa. */
    var hayLiga = !!(orden && orden.machote) || !!o.machote_id;
    var base = { machote: machote, calc: calc, desde: o.desde,
                 machoteAjeno: hayLiga && !machote };

    /* Primero se pinta SIN la respuesta del servidor, que todavía no llegó —y
     * eso sale como una dura que dice justo eso, no como un hueco. */
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

  function pintar(v) {
    var cu = document.getElementById('puCuerpo');
    if (cu) cu.innerHTML = html(v);
    var ok = document.getElementById('puOk');
    if (ok) ok.disabled = !v.puede;
  }

  G.PuertaConfirmar = {
    evaluar: evaluar, html: html, abrir: abrir, cerrar: cerrar
  };
})(window);
