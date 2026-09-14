/* ═══ Machote · el cliente que falta (V1.31) ══════════════════════════════
 *
 * Doce de trece cotizaciones vivas no tienen cliente de Odoo: el equipo
 * tecleó el nombre en vez de elegirlo del catálogo, así que `cliente_id` está
 * en null y hoy esas doce contestarían `SIN_CLIENTE` al crear la orden.
 *
 * Esteban pidió las dos cosas, y son dos cosas distintas:
 *
 *   HACIA ADELANTE · no se puede llegar a crear la orden sin cliente real.
 *   HACIA ATRÁS    · las que ya existen lo piden la próxima vez que alguien
 *                    las abra, SIN PERDER NADA de lo capturado.
 *
 * ── POR QUÉ ESTO VIVE EN UN SOLO ARCHIVO ────────────────────────────────
 * La pregunta «¿a esta cotización le falta el cliente?» se hace desde dos
 * pantallas —el libro y la orden— y va a hacerse desde una tercera cuando
 * exista la confirmación. Si cada una la contesta por su cuenta, el día que
 * cambie la regla se arregla en una y las otras siguen mintiendo (§20 #13).
 * Aquí está la única definición, y las pantallas la consultan.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────
 * No borra, no reescribe y no toca nada más que `cliente_id` y `cliente`.
 * Una cotización de la versión 29 que lleva meses capturada no puede perder
 * un solo número porque alguien le ponga el cliente que le faltaba.
 *
 * Y no es el candado: el servidor vuelve a comprobar el cliente al crear la
 * orden y contesta `SIN_CLIENTE` si no está. Lo de aquí es para que nadie
 * llegue hasta el final para que le digan que no — que es distinto de
 * impedirlo.
 */
(function (G) {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /** LA definición, y la única. Falta el cliente cuando no hay `cliente_id`:
   *  el texto NO cuenta, por muy bien escrito que esté. «Grupo Industrial
   *  ACME» tecleado a mano no es un cliente de Odoo y la orden no se puede
   *  emitir contra él. */
  function falta(m) {
    return !!(m && !m.cliente_id);
  }

  /** Lo que se le ENSEÑA a quien abre una cotización a la que le falta.
   *  Se pinta siempre que falte —no una sola vez—, porque el problema sigue
   *  ahí hasta que alguien lo arregle. */
  function franja(m) {
    if (!falta(m)) return '';
    var tecleado = (m && m.cliente) ? m.cliente : '';
    return '<div class="aviso warn cli-franja" id="cliFranja">' +
      '<strong>A esta cotización le falta el cliente de Odoo.</strong> ' +
      (tecleado
        ? 'Dice <em>«' + esc(tecleado) + '»</em>, pero eso es texto que alguien escribió: ' +
          'no está ligado a ningún cliente del catálogo.'
        : 'No tiene ninguno, ni escrito.') +
      ' Sin él <strong>no se puede crear la orden</strong> en Odoo. ' +
      'Elegirlo no cambia nada más de lo que ya capturaste. ' +
      '<button class="btn fantasma" id="cliElegir">Elegir el cliente</button>' +
      '</div>';
  }

  /** Engancha el botón de la franja. Separado del pintado porque quien pinta
   *  decide CUÁNDO, y a veces la franja se vuelve a dibujar sola. */
  function enlazar(m, alElegir) {
    var b = $('#cliElegir');
    if (b) b.onclick = function () { abrir(m, alElegir); };
  }

  /** El diálogo. Mismo esqueleto que la cesión —`.modal` con su `.caja` en el
   *  body—, y se cierra igual: con «Ahora no», tocando fuera, o con Escape.
   *
   *  `alElegir(cliente)` se llama SÓLO si se eligió uno del catálogo. Quien
   *  llama decide qué hacer con eso —guardarlo, repintar—; este módulo no
   *  sabe cómo se guarda un machote y no tiene por qué saberlo. */
  function abrir(m, alElegir) {
    cerrar();
    var caja = document.createElement('div');
    caja.id = 'cliCaja';
    caja.className = 'modal';
    caja.setAttribute('role', 'dialog');
    caja.innerHTML =
      '<div class="caja" role="dialog" aria-modal="true">' +
        '<h3>El cliente de esta cotización</h3>' +
        '<p class="tiny nota">El catálogo se lee de Odoo al vuelo. Lo que se guarda es el ' +
        '<strong>id</strong>: si mañana le cambian la razón social, esta cotización la ' +
        'muestra corregida sola.</p>' +
        (m && m.cliente
          ? '<div class="aviso warn"><strong>Lo que estaba escrito:</strong> «' + esc(m.cliente) + '». ' +
            'Búscalo abajo; si el nombre no coincide exactamente, es porque en Odoo está de otra forma.</div>'
          : '') +
        '<label class="cli-l">Cliente<br>' +
          '<input id="cliBuscar" class="cel" list="cliLista" autocomplete="off" ' +
          'placeholder="Escribe para buscar en Odoo…" value="' + esc((m && m.cliente) || '') + '">' +
          '<datalist id="cliLista"></datalist>' +
          '<span id="cliEstado" class="tiny nota">Leyendo el catálogo de Odoo…</span></label>' +
        '<div id="cliAviso" class="tiny n-bad" hidden></div>' +
        '<div class="acciones">' +
          '<button class="btn fantasma" id="cliDespues">Ahora no</button>' +
          '<button class="btn" id="cliOk">Usar este cliente</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    $('#cliDespues').onclick = cerrar;
    caja.onclick = function (e) { if (e.target === caja) cerrar(); };
    document.addEventListener('keydown', alaEscape);

    poblar();

    $('#cliOk').onclick = function () {
      var txt = $('#cliBuscar').value.trim();
      var hit = G.Clientes ? G.Clientes.resolver(txt) : null;
      if (!hit) {
        /* Aquí SÍ se exige que case, y es la diferencia con la pantalla de
         * capturar: al crear un machote el cliente puede ser un prospecto que
         * todavía no está de alta y el texto libre es correcto. Este diálogo
         * existe para poner el ID que falta, así que un texto que no resuelve
         * no sirve — y decirlo es mejor que guardar otra vez lo mismo. */
        var a = $('#cliAviso');
        a.hidden = false;
        a.textContent = txt
          ? '«' + txt + '» no casa con ningún cliente del catálogo. Elígelo de la lista; ' +
            'si de verdad no está en Odoo, hay que darlo de alta antes de poder emitir la orden.'
          : 'Escribe el nombre y elígelo de la lista.';
        return;
      }
      cerrar();
      if (typeof alElegir === 'function') alElegir(hit);
    };

    setTimeout(function () { var i = $('#cliBuscar'); if (i) i.focus(); }, 30);
  }

  function cerrar() {
    var d = $('#cliCaja');
    if (d) d.remove();
    document.removeEventListener('keydown', alaEscape);
  }

  function alaEscape(e) { if (e.key === 'Escape') cerrar(); }

  /* Llena la lista. La pantalla YA está pintada cuando esto corre: si Odoo no
   * contesta, se dice y el diálogo no sirve de nada — que es la verdad, porque
   * sin catálogo no hay id que poner. Es el único sitio del módulo donde NO se
   * degrada a texto libre, y a propósito. */
  function poblar() {
    var est = $('#cliEstado'), dl = $('#cliLista');
    if (!est || !dl || !G.Clientes) return;
    G.Clientes.cargar().then(function (r) {
      if (!document.body.contains(est)) return;
      if (!r.ok) {
        est.className = 'tiny n-bad';
        est.textContent = 'No se pudo leer el catálogo de Odoo (' + r.error + '). ' +
          'Sin catálogo no hay id que poner: vuelve a intentarlo en un momento.';
        return;
      }
      dl.innerHTML = r.clientes.map(function (c) {
        return '<option value="' + esc(c.nombre) + '"></option>';
      }).join('');
      est.className = 'tiny';
      est.textContent = r.clientes.length + ' clientes de Odoo.';
    });
  }

  G.ClienteFalta = {
    falta: falta,
    franja: franja,
    enlazar: enlazar,
    abrir: abrir,
    cerrar: cerrar
  };
})(window);
