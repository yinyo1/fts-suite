/* ═══ El panel de aprobadores · Compuerta 1 ═══════════════════════════════
 *
 * Las cifras existen en el papel desde el 17-jul-2026 —revisión de Esteban si
 * pasa de 500 mil dólares o si el margen baja de 35%— y nunca se aplicaron.
 * Aquí dejan de ser papel.
 *
 * ── DOS DECISIONES QUE NO SON DE PANTALLA ─────────────────────────────────
 *
 * 1. LA LEE CUALQUIERA DEL MÓDULO, la edita sólo dirección. Ver con qué regla
 *    te van a medir no es un privilegio: esconderla sólo consigue que quien
 *    sale marcado no entienda por qué. El candado de editar vive en el
 *    servidor (`comercial:admin`); lo de aquí es para no ofrecer un botón que
 *    ya se sabe que va a fallar.
 *
 * 2. UN NIVEL SIN APROBADOR **MARCA, NO BLOQUEA**, y la pantalla lo dice con
 *    esas palabras. Esteban pidió el panel primero y los niveles después, así
 *    que el estado normal al arrancar es exactamente ése: niveles con umbral y
 *    sin nombre. Un panel que no lo dijera parecería roto.
 *
 * 3. UN NIVEL NO SE BORRA: se apaga. Mismo criterio que el machote, que se
 *    archiva. Lo que se apagó sigue explicando por qué una cotización de hace
 *    tres meses salió marcada.
 */
(function (G) {
  'use strict';

  var A = null;
  function alm() { return G.MachoteAlmacen || null; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  var usd = function (n) {
    if (n === null || n === undefined || !isFinite(Number(n))) return '—';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' USD';
  };
  var pct = function (n) {
    if (n === null || n === undefined || !isFinite(Number(n))) return '—';
    return (Number(n) * 100).toFixed(0) + '%';
  };
  var fecha = function (x) {
    if (!x) return '—';
    var t = String(x).trim().replace(' ', 'T');
    if (/[+-]\d{2}$/.test(t)) t += ':00';
    else if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(t)) t += 'Z';
    var d = new Date(t);
    return isNaN(d.getTime()) ? String(x)
      : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  };

  var _host = null;
  var _st = { niveles: [], puedeEditar: false, cargando: true, error: null };

  function pintar() {
    if (!_host) return;

    if (_st.cargando) {
      _host.innerHTML = '<div class="pad"><div class="tiny nota">Leyendo la política…</div></div>';
      return;
    }
    if (_st.error) {
      _host.innerHTML = '<div class="pad"><div class="aviso bad">' +
        '<strong>No se pudo leer la política.</strong> ' + esc(_st.error) + '</div></div>';
      return;
    }

    var vivos = _st.niveles.filter(function (n) { return n.activo; });
    var apagados = _st.niveles.filter(function (n) { return !n.activo; });
    var sinAprobador = vivos.filter(function (n) { return n.solo_marca; }).length;

    var explica =
      '<div class="aviso"><strong>Esto es lo que mira la compuerta al enviar una ' +
      'cotización.</strong> Si un nivel se dispara, la cotización sale <strong>marcada</strong> ' +
      'y se manda igual — en esta versión la compuerta avisa, no detiene. Lo único que sí ' +
      'impide mandar es que la orden y la cotización no digan lo mismo, y eso no es política: ' +
      'es que los números no cuadran.</div>';

    var aviso = sinAprobador
      ? '<div class="aviso amb"><strong>' + sinAprobador + ' de ' + vivos.length +
        ' nivel(es) no tiene aprobador.</strong> Así funciona: sin nombre, el nivel ' +
        '<strong>marca pero no pide permiso a nadie</strong>. No está roto — es el estado ' +
        'normal mientras se deciden los nombres.</div>'
      : '';

    var candado = _st.puedeEditar ? ''
      : '<div class="tiny nota">La política la edita dirección. Aquí se ve para que ' +
        'sepas con qué regla te van a medir.</div>';

    var filas = vivos.concat(apagados).map(function (n, i) {
      var off = !n.activo;
      return '<tr' + (off ? ' class="apagado"' : '') + '>' +
        '<td class="num mono" data-th="Nivel">' + esc(n.nivel) + '</td>' +
        '<td data-th="Se llama">' + (_st.puedeEditar
          ? '<input class="cel" data-pol="nombre" data-nivel="' + esc(n.nivel) + '" value="' + esc(n.nombre) + '">'
          : '<strong>' + esc(n.nombre) + '</strong>') + '</td>' +
        '<td class="num" data-th="Desde (USD)">' + (_st.puedeEditar
          ? '<input class="cel num" data-pol="monto_desde" data-nivel="' + esc(n.nivel) + '" inputmode="decimal" value="' +
            (n.monto_desde === null ? '' : esc(n.monto_desde)) + '">'
          : '<span class="mono">' + usd(n.monto_desde) + '</span>') + '</td>' +
        '<td class="num" data-th="Margen bajo">' + (_st.puedeEditar
          ? '<input class="cel num" data-pol="margen_bajo" data-nivel="' + esc(n.nivel) + '" inputmode="decimal" value="' +
            (n.margen_bajo === null ? '' : esc(n.margen_bajo)) + '">'
          : '<span class="mono">' + pct(n.margen_bajo) + '</span>') + '</td>' +
        '<td data-th="Aprueba">' + (_st.puedeEditar
          ? '<input class="cel" data-pol="aprobador_nombre" data-nivel="' + esc(n.nivel) + '" placeholder="sin decidir" value="' +
            esc(n.aprobador_nombre || '') + '">'
          : (n.aprobador_nombre ? esc(n.aprobador_nombre)
                                : '<span class="n-warn">sólo marca</span>')) + '</td>' +
        '<td class="num" data-th="Estado">' + (_st.puedeEditar
          ? '<label class="tiny"><input type="checkbox" data-pol="activo" data-nivel="' + esc(n.nivel) + '"' +
            (n.activo ? ' checked' : '') + '> en uso</label>'
          : (n.activo ? 'en uso' : '<span class="tiny nota">apagado</span>')) + '</td>' +
        '<td class="tiny nota" data-th="Última edición">' + esc(fecha(n.updated_at)) +
          (n.updated_by ? '<br>' + esc(n.updated_by) : '') + '</td>' +
      '</tr>';
    }).join('');

    var pie = _st.puedeEditar
      ? '<div class="or-pie">' +
          '<button class="btn fantasma" id="pol-nuevo">Agregar un nivel</button>' +
          '<button class="btn" id="pol-guardar">Guardar la política</button>' +
        '</div>' +
        '<p class="tiny nota">El margen va como <strong>fracción</strong>: <code>0.35</code> ' +
        'es 35%. Un <code>35</code> sería 3500% y la base lo rechaza — a propósito, porque ' +
        '«35» se ve bien y nadie lo notaría. El monto va en <strong>dólares</strong>: una ' +
        'cotización en pesos se mide con el tipo de cambio congelado de su versión, no con ' +
        'el de hoy.</p>'
      : '';

    _host.innerHTML =
      '<div class="pad">' +
        explica + aviso + candado +
        /* ⚠️ `.ctrl-t`, NO `.or-t`. Y no es cosmético: a 640 px el módulo
         * convierte `.ctrl-t` en tarjetas Y apaga el scroll de `.tabla-wrap`
         * (`overflow-x: visible`). Con `.or-t` la tabla seguía siendo tabla y
         * la página entera se desbordaba de lado a 380 px — justo lo que
         * reportó Montalvo en V1.14 y que este CSS ya resolvía para la tabla
         * de Control. Se vio en la captura, no en el diff (§20 #12). */
        '<div class="tabla-wrap"><table class="ctrl-t"><thead><tr>' +
          '<th>Nivel</th><th>Se llama</th><th class="num">Desde (USD)</th>' +
          '<th class="num">Margen bajo</th><th>Aprueba</th><th class="num">Estado</th>' +
          '<th>Última edición</th>' +
        '</tr></thead><tbody>' + (filas || '<tr><td colspan="7" class="tiny nota">' +
          'No hay ningún nivel. La compuerta mira, pero no tiene con qué comparar.</td></tr>') +
        '</tbody></table></div>' +
        pie +
        '<div id="pol-estado" class="tiny nota"></div>' +
      '</div>';

    if (_st.puedeEditar) enlazar();
  }

  function enlazar() {
    Array.prototype.forEach.call(_host.querySelectorAll('[data-pol]'), function (el) {
      var apl = function () {
        var n = _st.niveles.filter(function (x) {
          return String(x.nivel) === String(el.dataset.nivel);
        })[0];
        if (!n) return;
        var campo = el.dataset.pol;
        if (campo === 'activo') { n.activo = el.checked; return; }
        if (campo === 'monto_desde' || campo === 'margen_bajo') {
          var v = String(el.value).trim();
          /* Vacío es NULL y NULL no es cero: «este nivel no mira el monto» y
           * «este nivel se dispara con cualquier monto» son cosas distintas. */
          n[campo] = (v === '') ? null : Number(v);
          return;
        }
        n[campo] = el.value;
      };
      el.oninput = apl;
      el.onchange = apl;
    });

    var nuevo = document.getElementById('pol-nuevo');
    if (nuevo) nuevo.onclick = function () {
      var max = _st.niveles.reduce(function (a, n) { return Math.max(a, Number(n.nivel) || 0); }, 0);
      _st.niveles.push({ nivel: max + 1, nombre: 'Nivel ' + (max + 1),
        monto_desde: null, margen_bajo: null, aprobador: null,
        aprobador_nombre: null, solo_marca: true, activo: true,
        updated_at: null, updated_by: null });
      pintar();
    };

    var g = document.getElementById('pol-guardar');
    if (g) g.onclick = guardar;
  }

  function decir(txt, malo) {
    var e = document.getElementById('pol-estado');
    if (e) e.innerHTML = '<span class="' + (malo ? 'falta' : 'ok-t') + '">' + esc(txt) + '</span>';
  }

  function guardar() {
    var _a = alm();
    if (!_a || !_a.guardarPolitica) { decir('El almacén no está disponible.', true); return; }

    /* Un nivel que no mira ni monto ni margen no mira nada, y la base lo
     * rechaza con un CHECK. Se dice aquí para no hacer el viaje. */
    var vacios = _st.niveles.filter(function (n) {
      return n.monto_desde === null && n.margen_bajo === null;
    });
    if (vacios.length) {
      decir('El nivel ' + vacios[0].nivel + ' no mira ni monto ni margen: así no mira nada.', true);
      return;
    }

    var b = document.getElementById('pol-guardar');
    if (b) { b.disabled = true; b.textContent = 'Guardando…'; }
    decir('Guardando…');

    _a.guardarPolitica(_st.niveles.map(function (n) {
      return { nivel: Number(n.nivel), nombre: n.nombre,
               monto_desde: n.monto_desde, margen_bajo: n.margen_bajo,
               /* El usuario del aprobador todavía no se captura: por ahora se
                * guarda el NOMBRE, que es lo que la pantalla enseña. Ligarlo a
                * un usuario de la suite es lo que hace falta para que el nivel
                * deje de sólo marcar, y va con la escalación por correo. */
               aprobador: n.aprobador || null,
               aprobador_nombre: n.aprobador_nombre || null,
               activo: n.activo !== false };
    })).then(function (r) {
      if (b) { b.disabled = false; b.textContent = 'Guardar la política'; }
      if (!r || r.ok !== true) {
        decir((r && r.mensaje) || 'No se pudo guardar.', true);
        return;
      }
      /* Se repinta desde lo que la BASE devolvió, no desde lo tecleado: si el
       * servidor normalizó algo o rechazó un nivel, hay que verlo. */
      _st.niveles = r.niveles || [];
      _st.puedeEditar = r.puede_editar === true;
      pintar();
      decir('Guardada. Lo de arriba es lo que la base tiene ahora.');
    });
  }

  function montar(host) {
    _host = host;
    _st = { niveles: [], puedeEditar: false, cargando: true, error: null };
    pintar();

    var _a = alm();
    if (!_a || !_a.politica) {
      _st.cargando = false;
      _st.error = 'El almacén no está disponible en esta pantalla.';
      pintar();
      return;
    }
    _a.politica().then(function (r) {
      _st.cargando = false;
      if (!r || r.ok !== true) {
        _st.error = (r && r.mensaje) || 'El servidor no contestó.';
      } else {
        _st.niveles = r.niveles || [];
        _st.puedeEditar = r.puede_editar === true;
      }
      pintar();
    });
  }

  G.MachotePolitica = { montar: montar };
})(window);
