/* ═══ Machote · el préstamo temporal de escritura ═══
 *
 * El dueño de una cotización le presta la ESCRITURA a otra persona por un
 * plazo que él elige, con tope de 24 horas. Mientras dura, esa persona guarda
 * como guardaría el dueño, y cada versión suya queda con SU nombre en el
 * historial — que es el caso de las comisiones que motivó el histórico.
 *
 * Idea de Ricardo. El diseño, con las cinco decisiones y lo que se descartó,
 * está en `docs/comercial/PERMISO_TEMPORAL.md`.
 *
 * ── DÓNDE VIVE CADA COSA, Y POR QUÉ ──────────────────────────────────────
 * Este archivo es SÓLO pantalla. No decide nada:
 *
 *   el tope de 24 h        → un CHECK de la base (migración 005)
 *   quién puede prestar    → el servidor, comparando el dueño contra el token
 *   si el permiso vigente  → el servidor, en cada guardado, con SU reloj
 *
 * Lo de aquí es cortesía y aviso. Un reloj de navegador puede ir adelantado,
 * atrasado o movido a mano, así que esta pantalla es OPTIMISTA: deja escribir
 * hasta que el servidor diga que no. La alternativa —trabar los campos al
 * segundo exacto— le quitaría el teclado a alguien a media frase por un reloj
 * que no es el bueno.
 */
(function (G) {
  'use strict';

  var AVISO_MS = 15 * 60 * 1000;   // se avisa cuando faltan 15 minutos
  var _reloj = null;               // el temporizador del aviso
  var _avisado = {};               // por machote: ya se avisó de este vencimiento

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* La hora a la que vence, como se dice en voz alta: «4:20 p.m.». Si vence
   * otro día se agrega el día, porque «vence a las 9:00» de un préstamo de 20
   * horas es verdad y engaña. */
  function cuando(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return 'una hora que no se pudo leer';
    var d = new Date(t), hoy = new Date();
    var hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    var mismoDia = d.getFullYear() === hoy.getFullYear() &&
                   d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
    if (mismoDia) return 'las ' + hora;
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) +
           ' a las ' + hora;
  }

  /* Un punto al final, pero SIN duplicarlo. `toLocaleTimeString('es-MX')`
   * devuelve «10:13 a.m.» —con punto— así que concatenar otro daba
   * «hasta las 10:13 a.m..» en la franja. Se ve en la captura y no en el
   * diff, que es la lección de CLAUDE.md §20 #12. */
  function punto(s) { return /[.!?…]$/.test(s) ? s : s + '.'; }

  function minutosQueFaltan(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    return Math.round((t - Date.now()) / 60000);
  }

  function nombreDe(actor, m) {
    /* El nombre real si se conoce; si no, el usuario. Un «ricardo.hernandez»
     * es legible, pero «Ricardo Hernández» es cómo se le llama en la junta —
     * y es el que la MISMA pantalla acaba de mostrar en el selector de
     * prestar, así que decir el otro se lee como si fueran dos personas.
     *
     * Tres fuentes, en orden, y la última nunca falla:
     *   1. lo que venga en el préstamo (hoy no viene: la 005 no guarda nombre,
     *      y no hay tabla de usuarios en `comercial` — si algún día la hay,
     *      esto lo aprovecha sin tocarse),
     *   2. el directorio de la lista, que es donde el nombre YA se conoce,
     *   3. el usuario tal cual, que es legible aunque no sea bonito. */
    var ps = (m && m._prestamos) || [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] && ps[i].para === actor && ps[i].para_nombre) return ps[i].para_nombre;
    }
    try {
      var dir = (G.MachoteApp && G.MachoteApp.personas) ? G.MachoteApp.personas() : [];
      for (var j = 0; j < dir.length; j++) {
        if (dir[j] && dir[j].actor === actor && dir[j].nombre) return dir[j].nombre;
      }
    } catch (e) { /* el nombre es cortesía: nunca puede tumbar la franja */ }
    return actor;
  }

  /** La franja que va arriba del machote abierto. Devuelve HTML (posiblemente
   *  vacío): quien la pinta es `vMachote`, para que entre en el mismo repintado
   *  y no haya dos fuentes de verdad sobre qué hay en pantalla. */
  function franja(m) {
    var A = G.MachoteAlmacen;
    if (!m || !A) return '';

    /* ── Soy el PRESTATARIO ───────────────────────────────────────────────
     * Lo que necesita saber: hasta cuándo puede escribir. Y si ya venció, que
     * lo que tecleó sigue aquí — que es la promesa que sostiene todo esto. */
    if (m._ajeno === true) {
      var mio = m._prestamo_para_mi;
      if (!mio) return '';
      var faltan = minutosQueFaltan(mio.vence_at);
      if (faltan !== null && faltan <= 0) {
        return '<div class="presta-fr vencido" role="alert">' +
          '<strong>Tu permiso sobre esta cotización venció.</strong> ' +
          'Lo que escribiste sigue en este navegador y no se perdió, pero ya no se ' +
          'puede guardar. Pídele el permiso de nuevo a ' +
          esc(m._dueno_nombre || m._dueno || 'su dueño') + '.' +
          '</div>';
      }
      return '<div class="presta-fr' + (faltan !== null && faltan <= 15 ? ' pronto' : '') + '">' +
        '<strong>' + esc(m._dueno_nombre || m._dueno || 'Su dueño') +
        ' te prestó esta cotización.</strong> Puedes editarla hasta ' +
        (faltan !== null && faltan <= 15
          ? esc(cuando(mio.vence_at)) + ' — faltan ' + faltan + ' minuto(s).'
          : punto(esc(cuando(mio.vence_at)))) +
        ' Borrarla y mandarla a Odoo siguen siendo suyas.' +
        '</div>';
    }

    /* ── Soy el DUEÑO ─────────────────────────────────────────────────────
     * Cortesía: saber que alguien está adentro. No es un candado —los dos
     * pueden escribir, y si chocan la base rechaza al segundo— pero saberlo
     * evita la mayoría de los choques sin necesidad de candados. */
    var ps = A.prestamosDe ? A.prestamosDe(m) : [];
    var vivos = ps.filter(function (x) {
      return x && x.vence_at && Date.parse(x.vence_at) > Date.now();
    });
    if (!vivos.length) return '';

    return '<div class="presta-fr dueno">' +
      '<span class="grow"><strong>Prestada.</strong> ' +
      vivos.map(function (x) {
        return esc(nombreDe(x.para, m)) + ' puede editarla hasta ' +
               punto(esc(cuando(x.vence_at)));
      }).join(' · ') +
      ' Si guardan los dos a la vez, el segundo tendrá que volver a abrirla.</span>' +
      vivos.map(function (x) {
        return '<button class="btn fantasma chico" data-recoger="' + esc(x.para) + '">Recoger</button>';
      }).join('') +
      '</div>';
  }

  /** Engancha lo que la franja pinta, arma el botón de prestar, y programa el
   *  aviso de los 15 minutos. `repintar` es `vMachote`, para volver a pintar
   *  sin que este archivo sepa cómo se pinta un machote. */
  function montar(m, repintar) {
    var A = G.MachoteAlmacen;
    if (!m || !A) return;

    $$('[data-recoger]').forEach(function (b) {
      b.onclick = function () {
        var para = b.dataset.recoger;
        if (!confirm('¿Recoger el permiso de ' + nombreDe(para, m) + '?\n\n' +
                     'Dejará de poder guardar en cuanto lo intente. Lo que haya escrito ' +
                     'no se pierde: se queda en su navegador.')) return;
        b.disabled = true;
        A.recoger(m.id, para).then(function (r) {
          if (!r || r.ok !== true) {
            b.disabled = false;
            alert((r && r.mensaje) || 'No se pudo recoger el permiso.');
            return;
          }
          /* Se vuelve a bajar en vez de tachar el renglón a mano: el estado
           * de quién puede escribir vive en el servidor, y pintarlo desde una
           * marca local sería creerle a la pantalla en vez de al servidor
           * (CLAUDE.md §8). */
          A.bajar().then(function () { if (repintar) repintar(m.id); });
        });
      };
    });

    programarAviso(m, repintar);
  }

  /* ── El aviso de los 15 minutos ──────────────────────────────────────────
   * Por qué avisar antes y no trabar al vencer: el permiso se comprueba AL
   * GUARDAR, así que se puede estar tecleando cuando vence. Sin aviso, la
   * persona se entera cuando el guardado la rechaza — con el trabajo hecho y
   * la sorpresa encima. Con aviso, tiene quince minutos para cerrar o para
   * pedir más tiempo.
   *
   * Se avisa UNA vez por vencimiento. Un aviso que se repite cada minuto es
   * un aviso que se aprende a ignorar, y este es de los que hay que leer. */
  function programarAviso(m, repintar) {
    if (_reloj) { clearTimeout(_reloj); _reloj = null; }
    if (!m || m._ajeno !== true) return;
    var mio = m._prestamo_para_mi;
    if (!mio || !mio.vence_at) return;

    var t = Date.parse(mio.vence_at);
    if (!isFinite(t)) return;
    var falta = t - Date.now();
    if (falta <= 0) return;

    var clave = m.id + '|' + mio.vence_at;
    var enCuanto = falta - AVISO_MS;

    if (enCuanto <= 0) { avisar(m, clave, repintar); return; }
    _reloj = setTimeout(function () { avisar(m, clave, repintar); }, enCuanto);
  }

  function avisar(m, clave, repintar) {
    if (_avisado[clave]) return;
    _avisado[clave] = true;
    var mio = m._prestamo_para_mi;
    var faltan = minutosQueFaltan(mio.vence_at);

    var viejo = $('#prestaAviso'); if (viejo) viejo.remove();
    var b = document.createElement('div');
    b.id = 'prestaAviso';
    b.className = 'nogda';
    b.setAttribute('role', 'alert');
    b.innerHTML =
      '<span><strong>Tu permiso sobre «' + esc(m.nombre || 'esta cotización') +
      '» vence a ' + esc(cuando(mio.vence_at)).replace(/\.$/, '') + '</strong>' +
      (faltan !== null && faltan > 0 ? ' — faltan ' + faltan + ' minuto(s)' : '') +
      '. Después de esa hora ya no vas a poder guardar. Lo que escribas no se ' +
      'pierde, pero para que quede en el servidor tiene que subir antes.</span>' +
      '<span class="nogda-b">' +
      '<button class="btn" id="prestaYa">Guardar ahora</button>' +
      '<button class="btn fantasma" id="prestaX">Entendido</button></span>';
    document.body.appendChild(b);

    $('#prestaYa').onclick = function () {
      b.remove();
      if (G.MachoteApp && G.MachoteApp.guardarYa) G.MachoteApp.guardarYa();
      if (repintar) repintar(m.id);
    };
    $('#prestaX').onclick = function () { b.remove(); };
  }

  /** El modal de prestar. Sale del botón «Prestar» de la barra del machote. */
  function abrir(m, personas, repintar) {
    var A = G.MachoteAlmacen;
    if (!A) return;

    var otros = (personas || []).filter(function (p) { return p && p.actor; });

    /* OJO con los nombres: en este módulo `.modal` YA ES EL FONDO —posición
     * fija, inset 0, negro translúcido— y la tarjeta de adentro es `.caja`.
     * Inventar `.modal-fondo` aquí habría dado dos convenciones para lo mismo,
     * que es cómo se llegó al choque de `.kpi` en V1.22 (CLAUDE.md §20 #12).
     * Se reusan las que ya existen y sólo se agrega lo propio: `.presta-caja`. */
    var caja = document.createElement('div');
    caja.className = 'modal';
    caja.id = 'prestaModal';
    caja.innerHTML =
      '<div class="caja presta-caja" role="dialog" aria-modal="true" aria-labelledby="pm-t">' +
        '<h3 id="pm-t">Prestar «' + esc(m.nombre || 'esta cotización') + '»</h3>' +
        '<p class="tiny nota">Quien reciba el permiso podrá <strong>editarla y guardarla</strong> ' +
        'mientras dure. Cada versión suya queda con su nombre en el historial. ' +
        'Borrarla y mandarla a Odoo siguen siendo tuyas, y puedes recoger el permiso ' +
        'antes de tiempo.</p>' +
        (otros.length
          ? '<label class="pm-l">A quién<select id="pm-para">' +
            otros.map(function (p) {
              return '<option value="' + esc(p.actor) + '">' + esc(p.nombre || p.actor) + '</option>';
            }).join('') + '</select></label>'
          : '<div class="aviso">Todavía no hay nadie más con machotes en el servidor, ' +
            'así que no hay a quién prestarle.</div>') +
        '<label class="pm-l">Por cuánto tiempo<select id="pm-horas">' +
          '<option value="1">1 hora</option>' +
          '<option value="4" selected>4 horas</option>' +
          '<option value="8">8 horas</option>' +
          '<option value="24">24 horas (el máximo)</option>' +
        '</select></label>' +
        '<p class="tiny nota">El tope de 24 horas lo impone la base de datos, no esta ' +
        'pantalla. Un permiso sin vencimiento sería un cambio de dueño con otro nombre.</p>' +
        '<div id="pm-err"></div>' +
        '<div class="acciones">' +
          '<button class="btn fantasma" id="pm-x">Cancelar</button>' +
          '<button class="btn" id="pm-ok"' + (otros.length ? '' : ' disabled') + '>Prestar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    var cerrar = function () { caja.remove(); };
    $('#pm-x').onclick = cerrar;
    caja.addEventListener('click', function (e) { if (e.target === caja) cerrar(); });

    $('#pm-ok').onclick = function () {
      var para = ($('#pm-para') || {}).value;
      var horas = Number(($('#pm-horas') || {}).value) || 4;
      if (!para) return;
      $('#pm-ok').disabled = true;
      A.prestar(m.id, para, horas).then(function (r) {
        if (!r || r.ok !== true) {
          $('#pm-ok').disabled = false;
          $('#pm-err').innerHTML = '<div class="aviso bad">' +
            esc((r && r.mensaje) || 'No se pudo prestar.') + '</div>';
          return;
        }
        cerrar();
        /* Se relee del servidor: quién puede escribir es estado suyo, no de
         * esta pantalla. */
        A.bajar().then(function () { if (repintar) repintar(m.id); });
      });
    };
  }

  G.MachotePrestamo = { franja: franja, montar: montar, abrir: abrir,
                        _cuando: cuando, _minutosQueFaltan: minutosQueFaltan };
})(window);
