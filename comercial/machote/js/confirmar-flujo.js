/* ═══ El flujo de confirmación · UNA sola pieza ════════════════════════════
 *
 * Los dos caminos —el machote y la vista de órdenes— llaman AQUÍ. No hay dos
 * copias, y es a propósito: un estado calculado en dos sitios no falla cuando
 * se olvida una copia, **contesta distinto**, que es peor. Ya costó dos veces
 * (CLAUDE.md §20 #4).
 *
 * El flujo son tres pasos y siempre los mismos, en el mismo orden:
 *
 *   1 · ELEGIR EL PAR   ·  esta pieza
 *   2 · EL CHECKLIST    ·  `G.PuertaConfirmar`, que ya era una sola
 *   3 · CONFIRMAR       ·  APAGADO (ver `FINAL`)
 *
 * ── Por qué el paso 1 pregunta lo MISMO desde los dos lados ────────────────
 *
 * Se pidió «elegir la SO» desde el machote y «elegir el machote o los
 * machotes» desde la vista de órdenes. Suena a dos preguntas y es una: lo que
 * la confirmación necesita saber es un PAR —a qué orden se le escribe, y qué
 * cotización manda—, y cada camino llega con una mitad ya puesta.
 *
 *   desde el machote →  la cotización que manda la traes tú;  falta la ORDEN
 *   desde la orden   →  la orden la traes tú;                 falta EL MACHOTE
 *
 * Así que el paso 1 es un solo componente que resuelve el par y pregunta por
 * la mitad que falta. Con una sola candidata **igual se muestra y hay que
 * aceptarla**: es la orden que va a recibir siete escrituras irreversibles, y
 * una pantalla que se salta sola el único paso donde se lee lo que va a pasar
 * es una pantalla que entrena a no leer.
 *
 * Ligar MÁS de un machote a la vez no se construyó. Con la regla de «varios
 * machotes y uno que manda», lo que la confirmación consume es el que manda;
 * ligar los demás es mantenimiento de la liga, que ya vive en la vista de
 * órdenes y no tiene por qué meterse en medio de una irreversible.
 */
(function (G) {
  'use strict';

  /* ── EL PASO 3, Y POR QUÉ ESTÁ APAGADO ──────────────────────────────────
   * Un solo sitio lo dice. Si el motivo viviera en cada pantalla, el día que
   * se encienda quedaría una pantalla jurando que sigue apagado. */
  var FINAL = {
    apagado: true,
    titulo: 'Confirmar en Odoo — apagado',
    porque:
      'El paso que escribe en Odoo está apagado a propósito, para poder recorrer todo ' +
      'lo de arriba sin que nada llegue. No es una falla ni te falta un permiso.',
    condiciones: [
      'Los tres <code>executeOnce</code> de <code>comercial/orden-crear-v2</code>: sin ' +
      'ellos cada lectura se repite una vez por renglón y la corrida tarda ~29 minutos.',
      'La llave que falta en la respuesta de <code>Code - Compuerta 2</code>, que es lo ' +
      'que el candado necesita mirar.',
      'Dejar de usar <code>comercial/orden-crear</code> (v1), que crea renglones sin ' +
      'producto y Odoo después no deja confirmar la orden.'
    ],
    donde: 'docs/comercial/POR-QUE-NO-SE-PODIA-CONFIRMAR.md'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── LAS CANDIDATAS ──────────────────────────────────────────────────────
   * Puro y sin DOM, para poder probarlo sin navegador.
   *
   * ⚠️ Devuelve además `parcial`: verdadero cuando la lista sólo puede salir
   * de lo que ESTE navegador conoce. Una lista corta y una lista completa se
   * ven igual, y ése es el vacío que se lee como respuesta (§20 #11): si no se
   * dice, alguien elige «el único» que en realidad era «el único de aquí».  */
  function candidatos(op) {
    var o = op || {};
    var libreta = Array.isArray(o.machotes) ? o.machotes : [];
    var ordenes = Array.isArray(o.ordenes) ? o.ordenes : [];

    if (o.desde === 'orden') {
      var f = o.orden || {};
      var vistos = {};
      var lista = [];
      /* El principal lo manda el SERVIDOR, así que va primero y marcado. */
      if (f.machote && f.machote.id) {
        vistos[String(f.machote.id)] = true;
        lista.push({ id: f.machote.id, nombre: f.machote.nombre || '(sin nombre)',
                     principal: true, local: false });
      }
      /* Y los que este navegador sabe que apuntan a esta orden. */
      libreta.forEach(function (m) {
        var liga = m && (m.odoo_so_id || (m.orden && m.orden.id));
        if (!liga || String(liga) !== String(f.id)) return;
        var k = String(m.uuid || m.id);
        if (vistos[k]) return;
        vistos[k] = true;
        lista.push({ id: m.uuid || m.id, nombre: m.nombre || m.cliente || '(sin nombre)',
                     principal: false, local: true });
      });
      return {
        que: 'machote',
        lista: lista,
        /* El servidor dijo cuántos hay; si dice más de los que armamos, la
         * lista está corta y hay que decirlo. */
        parcial: (Number(f.machotes_mas) || 0) + (f.machote ? 1 : 0) > lista.length
      };
    }

    /* desde el machote: falta la ORDEN.
     *
     * La liga la da `MachoteAlmacen.ordenDe`, que la lee de la libreta de
     * sincronización — y ésa sólo guarda lo que el SERVIDOR devolvió. Se
     * acepta también servida por el llamador, para poder probar sin libreta. */
    var m0 = o.machote || {};
    var liga = o.liga ||
      (m0.odoo_so_id ? { id: m0.odoo_so_id, nombre: m0.odoo_so_name || null } : null) ||
      (m0.orden && m0.orden.id ? m0.orden : null);
    if (!liga || !liga.id) return { que: 'orden', lista: [], parcial: false };

    /* Si la pantalla de órdenes ya trajo esa fila, se enseña con cliente y
     * estado. Si no, se ofrece IGUAL con lo que se sabe: la liga existe, y
     * negarla porque esta pantalla no cargó la lista convertiría una
     * limitación del cliente en un «no hay» (§20 #13). */
    var f = null;
    for (var i = 0; i < ordenes.length; i++) {
      if (ordenes[i] && String(ordenes[i].id) === String(liga.id)) { f = ordenes[i]; break; }
    }
    if (f) {
      return { que: 'orden', parcial: false, lista: [{
        id: f.id, nombre: f.nombre || f.name || ('SO' + f.id),
        cliente: f.cliente || '', estado: f.estado || '', _f: f }] };
    }
    return { que: 'orden', parcial: true, lista: [{
      id: liga.id, nombre: liga.nombre || ('orden ' + liga.id),
      cliente: '', estado: 'no cargada en esta pantalla', soloLiga: true }] };
  }

  /* ── EL PASO 1, EN PANTALLA ──────────────────────────────────────────────
   * Reusa el mismo velo y las mismas clases que el checklist: si se viera
   * distinto, parecerían dos flujos, y es uno. */
  function caja() {
    var c = document.getElementById('cfVelo');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'cfVelo';
    c.className = 'pu-velo';
    c.innerHTML =
      '<div class="pu-modal">' +
        '<div class="pu-cab"><h3 id="cfTt">Confirmar orden</h3>' +
          '<span class="chip-mini" id="cfDesde"></span>' +
          '<button class="btn" id="cfX">&times;</button></div>' +
        '<div class="pu-cuerpo" id="cfCuerpo"></div>' +
        '<div class="pu-pie">' +
          '<button class="btn" id="cfCancel">Cancelar</button>' +
          '<button class="btn primario" id="cfOk" disabled>Continuar al checklist</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(c);
    c.querySelector('#cfX').addEventListener('click', cerrar);
    c.querySelector('#cfCancel').addEventListener('click', cerrar);
    return c;
  }

  function cerrar() {
    var c = document.getElementById('cfVelo');
    if (c) c.classList.remove('abierto');
  }

  /* El estado del paso 1. Vive aquí y en un solo sitio: es el par que se está
   * resolviendo, y el botón sale de él. */
  var elegido = null;

  function pintar(cand, op) {
    var cu = document.getElementById('cfCuerpo');
    if (!cu) return;
    var esOrden = cand.que === 'orden';
    var h = '';

    h += '<p class="tiny">' + (esOrden
      ? 'Elige <strong>a qué orden</strong> se va a confirmar esta cotización.'
      : 'Elige <strong>qué cotización manda</strong> en esta confirmación.') +
      ' De ella salen el contacto, la decisión de IVA, la orden de compra y el anticipo.</p>';

    if (!cand.lista.length) {
      h += '<div class="aviso bad"><strong>' + (esOrden
        ? 'Esta cotización no tiene ninguna orden ligada.'
        : 'Esta orden no tiene ningún machote ligado.') + '</strong> ' +
        (cand.parcial
          ? 'Hay una liga registrada, pero lo ligado no está cargado en esta pantalla, ' +
            'así que no se puede elegir desde aquí. No es que no exista.'
          : 'Se liga antes de confirmar: es de donde salen los datos que el checklist revisa.') +
        '</div>';
    } else {
      /* ⚠️ `parcial` significa cosas DISTINTAS en cada camino, y el mensaje
       * tiene que decir la que toca. Reusar un texto porque la bandera se
       * llama igual produce una pantalla que describe mal lo que pasa —se vio
       * en la captura de 380: decía «hay más machotes ligados» viniendo DEL
       * machote, donde lo que falta es la información de la orden. */
      if (cand.parcial && !esOrden) {
        h += '<div class="aviso warn"><strong>La lista puede estar corta.</strong> ' +
          'El servidor dice que hay más machotes ligados de los que este navegador ' +
          'conoce. Lo de abajo es lo que se puede elegir <em>desde aquí</em>, no ' +
          'necesariamente todo.</div>';
      } else if (cand.parcial && esOrden) {
        h += '<div class="aviso"><strong>La liga existe; el detalle no está cargado aquí.</strong> ' +
          'Esta pantalla no trae el cliente ni el estado de esa orden porque no se ha ' +
          'abierto la lista de órdenes. <em>Se puede continuar</em>: lo que decide es el ' +
          'servidor, y la liga está guardada.</div>';
      }
      h += '<div class="cf-lista">';
      cand.lista.forEach(function (x, i) {
        var sub = esOrden
          ? [x.cliente, x.estado].filter(Boolean).join(' · ')
          : (x.principal ? 'el principal, según el servidor'
                         : 'ligado, según este navegador');
        h += '<label class="cf-op">' +
          '<input type="radio" name="cfSel" value="' + i + '"' +
            (cand.lista.length === 1 || x.principal ? '' : '') + '>' +
          '<span class="cf-nm"><strong>' + esc(x.nombre) + '</strong>' +
            (x.principal ? ' <span class="chip-mini">manda</span>' : '') +
            (sub ? '<span class="tiny">' + esc(sub) + '</span>' : '') +
          '</span></label>';
      });
      h += '</div>';
      /* Con una sola candidata IGUAL hay que aceptarla. Es la orden que va a
       * recibir siete escrituras irreversibles; una pantalla que se salta sola
       * el único paso donde se lee lo que va a pasar entrena a no leer. */
      if (cand.lista.length === 1) {
        h += '<p class="tiny">Hay una sola, y aun así hay que elegirla: es la que va a ' +
             'recibir las escrituras.</p>';
      }
    }

    cu.innerHTML = h;
    cu.querySelectorAll('input[name=cfSel]').forEach(function (r) {
      r.addEventListener('change', function () {
        elegido = cand.lista[Number(r.value)] || null;
        var ok = document.getElementById('cfOk');
        if (ok) ok.disabled = !elegido;
      });
    });

    var ok = document.getElementById('cfOk');
    if (ok) {
      ok.disabled = true;
      ok.onclick = function () {
        if (!elegido) return;
        cerrar();
        if (!G.PuertaConfirmar) return;
        /* El paso 2, que es el MISMO para los dos caminos. */
        G.PuertaConfirmar.abrir(esOrden
          ? { orden: elegido._f || { id: elegido.id, nombre: elegido.nombre },
              machote: op.machote, desde: op.desde }
          : { orden: op.orden, machote_id: elegido.id, desde: op.desde });
      };
    }
  }

  /** La entrada única. Los dos caminos llaman aquí y sólo cambia qué mitad
   *  del par traen puesta. */
  function abrir(op) {
    var o = op || {};
    elegido = null;
    var c = caja();
    c.classList.add('abierto');

    var A = G.MachoteAlmacen;
    var libreta = (A && A.leer && A.leer()) ? A.leer().machotes : [];
    var cand = candidatos({
      desde: o.desde, orden: o.orden, machote: o.machote,
      liga: o.liga || (A && A.ordenDe && o.machote && o.machote.id
                        ? A.ordenDe(o.machote.id) : null),
      machotes: libreta,
      ordenes: o.ordenes || (G.Ordenes && G.Ordenes.cargadas ? G.Ordenes.cargadas() : [])
    });

    var tt = document.getElementById('cfTt');
    if (tt) tt.textContent = 'Confirmar orden';
    var de = document.getElementById('cfDesde');
    if (de) de.textContent = o.desde === 'orden' ? 'paso 1 de 3 · desde la orden'
                                                 : 'paso 1 de 3 · desde la cotización';
    pintar(cand, o);
    return cand;
  }

  G.ConfirmarFlujo = {
    FINAL: FINAL, candidatos: candidatos, esc: esc,
    abrir: abrir, cerrar: cerrar
  };
})(window);
