/* ═══ La confirmación · la suite manda, el radar ya no descubre ═══════════
 *
 * Hasta hoy el equipo confirmaba en Odoo y un radar lo descubría hasta cinco
 * minutos después. A partir de esto la suite manda: la confirmación es el
 * disparador, en el momento, y arrastra proyecto, analíticas, presupuesto y
 * junta de arranque.
 *
 * ── TRES DECISIONES QUE NO SON DE PANTALLA ───────────────────────────────
 *
 * 1. EL ESTADO SE PINTA DE ODOO, RELEÍDO. Ni de localStorage, ni de una marca
 *    local, ni asumiendo que salió bien porque el servidor contestó 200. Cada
 *    carga vuelve a preguntar (CLAUDE.md §8). Por eso, cuando Odoo no
 *    contesta, la columna de estado sale VACÍA y se dice — «en borrador» y
 *    «no se pudo preguntar» son cosas distintas y no pueden verse igual.
 *
 * 2. LA COMPUERTA 2 SE ENSEÑA ANTES DE ESCRIBIR, con los ejes analíticos
 *    incluidos. Escribir una cuenta en la columna del plan equivocado NO da
 *    error: deja un número que se ve bien y está mal. Si no se puede ver
 *    antes, nadie lo va a ver nunca.
 *
 * 3. LO QUE SE QUEDÓ A MEDIAS SE VE EN LA LISTA. Un intento que murió en el
 *    paso 4 deja proyecto y analítica creados con la orden en borrador, y sin
 *    marcarlo se ve idéntico a una orden que nadie ha tocado. Lleva su propia
 *    insignia y dice en qué paso se quedó.
 *
 * La pantalla NO es el candado: el servidor vuelve a comprobarlo todo —la
 * versión, el cuadre, la moneda, el handoff, el estado de la orden— justo
 * antes de escribir. Lo de aquí es para que nadie llegue hasta el final para
 * que le digan que no.
 */
(function (G) {
  'use strict';

  function alm() { return G.MachoteAlmacen || null; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var money = function (n, mon) {
    if (n === null || n === undefined || !isFinite(Number(n))) return '—';
    return Number(n).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (mon ? ' ' + mon : '');
  };
  var pct = function (n) {
    if (n === null || n === undefined || !isFinite(Number(n))) return '—';
    return (Number(n) * 100).toFixed(1) + '%';
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

  /* Cómo se llama en pantalla cada estado de Odoo. `null` es su propio caso:
   * significa que no se pudo preguntar, y no se disfraza de borrador. */
  var ESTADOS = {
    draft:  { t: 'Borrador',    c: 'n-warn' },
    sent:   { t: 'Enviada',     c: 'n-warn' },
    sale:   { t: 'Confirmada',  c: 'n-ok'   },
    done:   { t: 'Cerrada',     c: 'n-ok'   },
    cancel: { t: 'Cancelada',   c: 'n-bad'  }
  };

  var _host = null;
  var _st = { cargando: true, error: null, ordenes: [], avisos: [],
              odooLeido: true, filtro: 'pendientes', abierta: null };

  // ── La lista ─────────────────────────────────────────────────────────────

  function visibles() {
    if (_st.filtro === 'todas') return _st.ordenes;
    if (_st.filtro === 'medias') return _st.ordenes.filter(function (o) { return o.a_medias; });
    return _st.ordenes.filter(function (o) { return !o.confirmada_at; });
  }

  function insignia(o) {
    if (o.confirmada_at) return '<span class="pill ok">Confirmada</span>';
    if (o.a_medias) {
      return '<span class="pill bad">A medias · paso ' +
        esc(o.ultimo_intento && o.ultimo_intento.paso) + ' de 7</span>';
    }
    if (o.handoff && o.handoff.hay) return '<span class="pill warn">Handoff capturado</span>';
    return '<span class="pill">Sin handoff</span>';
  }

  /* La línea recta, visible: cotización → orden → oportunidad → proyecto.
   * Es el hilo que hoy hay que reconstruir a mano abriendo Odoo. */
  function hilo(o) {
    var t = [];
    t.push('<span class="hilo-n">COT-' + esc(o.folio) + '</span>');
    t.push('<span class="hilo-f">→</span>');
    t.push('<span class="hilo-n">' + esc(o.odoo_so_name || ('SO ' + o.odoo_so_id)) + '</span>');
    t.push('<span class="hilo-f">→</span>');
    t.push(o.oportunidad_id
      ? '<span class="hilo-n">' + esc(o.oportunidad_nombre || ('Oportunidad ' + o.oportunidad_id)) + '</span>'
      : '<span class="hilo-x" title="Esta orden no salió de una oportunidad del pipeline">sin oportunidad</span>');
    t.push('<span class="hilo-f">→</span>');
    t.push(o.proyecto_odoo_id
      ? '<span class="hilo-n">' + esc(o.proyecto_odoo_nombre || ('Proyecto ' + o.proyecto_odoo_id)) + '</span>'
      : '<span class="hilo-x">sin proyecto</span>');
    return '<div class="hilo">' + t.join(' ') + '</div>';
  }

  function renglon(o) {
    var e = o.estado ? (ESTADOS[o.estado] || { t: o.estado, c: '' }) : null;
    return '<tr data-id="' + esc(o.machote_id) + '">' +
      '<td data-th="Cotización"><strong>' + esc(o.nombre || '(sin nombre)') + '</strong>' +
        '<div class="tiny nota">' + esc(o.cliente_odoo || o.cliente_nombre || '—') +
        ' · ' + esc(o.dueno_nombre || o.dueno) + '</div>' + hilo(o) + '</td>' +
      '<td class="num" data-th="Monto">' + money(o.total_machote, o.moneda) + '</td>' +
      '<td class="num" data-th="Margen">' + pct(o.margen) + '</td>' +
      '<td data-th="En Odoo">' + (e
          ? '<span class="' + e.c + '">' + esc(e.t) + '</span>'
          : '<span class="tiny nota" title="Odoo no contestó: esto NO quiere decir que esté en borrador">no se pudo leer</span>') +
        '<div class="tiny">' + insignia(o) + '</div></td>' +
      '<td data-th=""><button class="btn fantasma cf-abrir" data-id="' + esc(o.machote_id) + '">' +
        (o.confirmada_at ? 'Ver' : 'Preparar') + '</button></td>' +
      '</tr>';
  }

  function pintar() {
    if (!_host) return;

    if (_st.cargando) {
      _host.innerHTML = '<div class="pad"><div class="tiny nota">Leyendo las órdenes…</div></div>';
      return;
    }
    if (_st.error) {
      _host.innerHTML = '<div class="pad"><div class="aviso bad">' +
        '<strong>No se pudieron leer las órdenes.</strong> ' + esc(_st.error) +
        '</div></div>';
      return;
    }

    var lista = visibles();
    var nMedias = _st.ordenes.filter(function (o) { return o.a_medias; }).length;
    var nPend = _st.ordenes.filter(function (o) { return !o.confirmada_at; }).length;

    var explica =
      '<div class="aviso"><strong>Confirmar aquí es confirmar en Odoo.</strong> ' +
      'Al hacerlo se crean de una vez la cuenta analítica, el proyecto y el presupuesto, ' +
      'se confirma la orden y se agenda la junta de arranque. El estado que se ve abajo ' +
      'se acaba de leer de Odoo, no es lo que este navegador recuerde.</div>';

    var alarma = '';
    if (!_st.odooLeido) {
      alarma += '<div class="aviso bad"><strong>Odoo no contestó.</strong> ' +
        'La lista sale con lo que sabe el servidor, pero la columna de estado está vacía: ' +
        'no es que estén en borrador, es que no se pudo preguntar. ' +
        (_st.avisos.length ? esc(_st.avisos[0]) : '') + '</div>';
    }
    if (nMedias) {
      alarma += '<div class="aviso warn"><strong>' + nMedias +
        (nMedias === 1 ? ' confirmación se quedó a medias.' : ' confirmaciones se quedaron a medias.') +
        '</strong> La orden sigue en borrador y lo que alcanzó a crearse está guardado: ' +
        'al volver a intentarlo se reusa en vez de duplicarse.</div>';
    }

    var filtros = '<div class="cf-filtros">' +
      '<label>Ver <select id="cfFiltro">' +
        '<option value="pendientes"' + (_st.filtro === 'pendientes' ? ' selected' : '') + '>Por confirmar (' + nPend + ')</option>' +
        '<option value="medias"' + (_st.filtro === 'medias' ? ' selected' : '') + '>A medias (' + nMedias + ')</option>' +
        '<option value="todas"' + (_st.filtro === 'todas' ? ' selected' : '') + '>Todas (' + _st.ordenes.length + ')</option>' +
      '</select></label></div>';

    var tabla = lista.length
      ? '<div class="tabla-wrap"><table class="ctrl-t cf-tabla"><thead><tr>' +
          '<th>Cotización · orden · oportunidad · proyecto</th>' +
          '<th class="num">Monto</th><th class="num">Margen</th>' +
          '<th>Estado en Odoo</th><th></th>' +
        '</tr></thead><tbody>' + lista.map(renglon).join('') + '</tbody></table></div>'
      : '<div class="aviso">No hay órdenes que mostrar con ese filtro.</div>';

    _host.innerHTML = '<div class="pad">' + explica + alarma + filtros + tabla + '</div>';

    var f = $('#cfFiltro');
    if (f) f.onchange = function () { _st.filtro = f.value; pintar(); };

    var bs = _host.querySelectorAll('.cf-abrir');
    for (var i = 0; i < bs.length; i++) {
      bs[i].onclick = (function (id) {
        return function () { abrirPreparacion(id); };
      })(bs[i].getAttribute('data-id'));
    }
  }

  // ── La preparación: handoff + Compuerta 2 ────────────────────────────────

  function laOrden(id) {
    for (var i = 0; i < _st.ordenes.length; i++) {
      if (_st.ordenes[i].machote_id === id) return _st.ordenes[i];
    }
    return null;
  }

  /* Los tres rubros del plan 20 que el radar ya usa desde junio. Se COSECHAN,
   * no se reinventan: son los mismos ids con los que el flujo automático
   * lleva meses creando presupuestos. El signo es del rubro, no del capturista:
   * el ingreso suma y los costos restan, siempre. */
  var RUBROS = [
    { id: 1171, nombre: '1. Ingreso',      signo:  1, pista: 'El subtotal de la orden.' },
    { id: 1177, nombre: '2.1 Mano de Obra', signo: -1, pista: 'Lo presupuestado de MO.' },
    { id: 1176, nombre: '2.2 Materiales',   signo: -1, pista: 'Lo presupuestado de material.' }
  ];

  function montoDe(o, rid) {
    var p = (o.handoff && o.handoff.presupuesto) || [];
    for (var i = 0; i < p.length; i++) {
      if (Number(p[i].rubro_id) === rid) return Math.abs(Number(p[i].monto) || 0);
    }
    /* Sin capturar, el ingreso se propone solo: es el subtotal de la orden, y
     * teclearlo a mano sólo abre la puerta a un dedazo. Los costos NO se
     * proponen — inventar un costo es peor que dejarlo en cero. */
    if (rid === 1171) return Number(o.subtotal_odoo || o.total_machote || 0);
    return 0;
  }

  function abrirPreparacion(id) {
    var o = laOrden(id);
    if (!o) return;
    _st.abierta = id;
    cerrar();

    var caja = document.createElement('div');
    caja.id = 'cfCaja';
    caja.className = 'modal';
    caja.innerHTML =
      '<div class="caja cf-caja" role="dialog" aria-modal="true">' +
        '<h3>' + esc(o.odoo_so_name || '') + ' · ' + esc(o.nombre || '') + '</h3>' +
        '<p class="tiny nota">' + esc(o.cliente_odoo || o.cliente_nombre || '') +
        ' · ' + money(o.total_machote, o.moneda) + ' · margen ' + pct(o.margen) + '</p>' +
        (o.confirmada_at
          ? '<div class="aviso ok"><strong>Ya está confirmada.</strong> ' +
            esc(o.confirmada_por) + ', el ' + fecha(o.confirmada_at) + '. ' +
            'Proyecto ' + esc(o.odoo_project_id) + ' · cuenta ' + esc(o.odoo_analytic_id) +
            ' · presupuesto ' + esc(o.odoo_budget_id) + '.</div>'
          : '') +
        (o.a_medias
          ? '<div class="aviso warn"><strong>El intento anterior se quedó en el paso ' +
            esc(o.ultimo_intento.paso) + ' de 7</strong> (' + fecha(o.ultimo_intento.at) + '). ' +
            esc(o.ultimo_intento.error || '') +
            ' Lo que alcanzó a crearse se reusa; no se duplica nada.</div>'
          : '') +
        '<div id="cfForm"></div>' +
        '<div id="cfVeredicto"></div>' +
        '<div class="acciones">' +
          '<button class="btn fantasma" id="cfCerrar">Cerrar</button>' +
          (o.confirmada_at ? '' :
            '<button class="btn fantasma" id="cfGuardar">Guardar handoff</button>' +
            '<button class="btn primario" id="cfRevisar">Revisar antes de confirmar</button>') +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);

    $('#cfCerrar').onclick = cerrar;
    caja.onclick = function (e) { if (e.target === caja) cerrar(); };
    document.addEventListener('keydown', alaEscape);

    pintarForm(o);
    if ($('#cfGuardar')) $('#cfGuardar').onclick = function () { guardar(o, false); };
    if ($('#cfRevisar')) $('#cfRevisar').onclick = function () { guardar(o, true); };
  }

  /* El handoff: lo que operaciones necesita y el costeo no sabe. Las fechas y
   * el presupuesto son OBLIGATORIOS y se dice por qué —van al proyecto, y
   * después de confirmar ya nadie los captura—; el responsable y los textos
   * se piden pero no se exigen. */
  function pintarForm(o) {
    var h = (o.handoff || {});
    var host = $('#cfForm');
    if (!host) return;

    var rubros = RUBROS.map(function (r) {
      return '<tr><td>' + esc(r.nombre) +
        '<div class="tiny nota">' + esc(r.pista) + '</div></td>' +
        '<td class="num"><span class="cf-signo">' + (r.signo < 0 ? '−' : '+') + '</span>' +
        '<input class="cel num cf-rubro" data-rubro="' + r.id + '" type="number" step="0.01" min="0" value="' +
        esc(montoDe(o, r.id)) + '"></td></tr>';
    }).join('');

    host.innerHTML =
      '<h4 class="cf-h">Lo que operaciones necesita</h4>' +
      '<div class="cf-grid">' +
        '<label>Inicio de obra<br><input class="cel" id="cfIni" type="date" value="' +
          esc(h.fecha_inicio || '') + '"></label>' +
        '<label>Fin de obra<br><input class="cel" id="cfFin" type="date" value="' +
          esc(h.fecha_fin || '') + '"></label>' +
        '<label>Quién dirige la obra<br><input class="cel" id="cfResp" ' +
          'placeholder="Nombre de quien dirige" value="' + esc(h.responsable_nombre || '') + '"></label>' +
        '<label>Id en Odoo (opcional)<br><input class="cel num" id="cfRespId" type="number" ' +
          'value="' + esc(h.responsable_id || '') + '"></label>' +
      '</div>' +
      '<label>Alcance<br><textarea class="cel" id="cfAlc" rows="3">' +
        esc(h.alcance || '') + '</textarea></label>' +
      '<label>Entregables<br><textarea class="cel" id="cfEnt" rows="3">' +
        esc(h.entregables || '') + '</textarea></label>' +
      '<h4 class="cf-h">El presupuesto, por rubro</h4>' +
      '<p class="tiny nota">Va al presupuesto de Odoo con el proyecto y el rubro en la ' +
        '<strong>misma línea</strong>, que es lo que hace que el gasto se le descuente de verdad.</p>' +
      '<table class="ctrl-t cf-rubros"><tbody>' + rubros + '</tbody></table>' +
      '<div id="cfAviso" class="tiny n-bad" hidden></div>';
  }

  function delForm() {
    var num = function (s) { var n = Number(s); return isFinite(n) ? n : 0; };
    var rubros = [];
    var ins = document.querySelectorAll('.cf-rubro');
    for (var i = 0; i < ins.length; i++) {
      var rid = Number(ins[i].getAttribute('data-rubro'));
      var def = null;
      for (var j = 0; j < RUBROS.length; j++) if (RUBROS[j].id === rid) def = RUBROS[j];
      rubros.push({ rubro_id: rid, rubro_nombre: def ? def.nombre : '',
                    monto: Math.abs(num(ins[i].value)),
                    signo: def ? def.signo : 1 });
    }
    return {
      fecha_inicio: ($('#cfIni') || {}).value || null,
      fecha_fin: ($('#cfFin') || {}).value || null,
      responsable_nombre: ($('#cfResp') || {}).value || null,
      responsable_id: Number(($('#cfRespId') || {}).value) || null,
      alcance: ($('#cfAlc') || {}).value || null,
      entregables: ($('#cfEnt') || {}).value || null,
      presupuesto: rubros
    };
  }

  function aviso(txt) {
    var a = $('#cfAviso');
    if (!a) return;
    if (!txt) { a.hidden = true; a.textContent = ''; return; }
    a.hidden = false; a.textContent = txt;
  }

  function guardar(o, seguirARevisar) {
    var h = delForm();
    if (!h.fecha_inicio || !h.fecha_fin) {
      aviso('Faltan las fechas de obra. Van al proyecto de Odoo, y después de confirmar ya nadie las captura.');
      return;
    }
    if (h.fecha_fin < h.fecha_inicio) {
      aviso('La obra no puede terminar antes de empezar.');
      return;
    }
    aviso('');
    var b1 = $('#cfGuardar'), b2 = $('#cfRevisar');
    if (b1) b1.disabled = true;
    if (b2) { b2.disabled = true; b2.textContent = 'Guardando…'; }

    alm().guardarHandoff(o.machote_id, h).then(function (r) {
      if (b1) b1.disabled = false;
      if (b2) { b2.disabled = false; b2.textContent = 'Revisar antes de confirmar'; }
      if (!r || !r.ok) {
        aviso((r && r.mensaje) || 'No se pudo guardar el handoff.');
        return;
      }
      /* Se repinta con lo que el servidor volvió a LEER, no con lo tecleado. */
      o.handoff = r.handoff || o.handoff;
      o.handoff.hay = true;
      if (seguirARevisar) revisar(o);
      else aviso('');
    });
  }

  /* El veredicto: TODO lo que se va a escribir, junto, antes de escribirlo.
   * Incluye los ejes analíticos porque escribir en la columna equivocada no
   * da error — deja un número que se ve bien y está mal. */
  function revisar(o) {
    var v = $('#cfVeredicto');
    if (v) v.innerHTML = '<div class="tiny nota">Revisando contra Odoo…</div>';

    alm().evaluarConfirmacion(o.machote_id).then(function (r) {
      if (!v) return;
      if (!r || !r.ok) {
        v.innerHTML = '<div class="aviso bad"><strong>No se pudo revisar.</strong> ' +
          esc((r && r.mensaje) || '') + '</div>';
        return;
      }

      var mon = r.moneda_odoo || r.moneda;
      var cuadre = r.cuadra
        ? '<span class="n-ok">cuadra</span>'
        : '<span class="n-bad">NO cuadra</span>';

      var renglones = (r.renglones || []).map(function (l) {
        return '<tr><td data-th="Renglón">' + esc(l.nombre) + '</td>' +
          '<td class="num" data-th="Cant">' + esc(l.cantidad) + '</td>' +
          '<td class="num" data-th="P.U.">' + money(l.precio, '') + '</td>' +
          '<td class="num" data-th="Subtotal">' + money(l.subtotal, '') + '</td>' +
          '<td data-th="IVA">' + (l.con_impuesto ? 'con IVA' : '<span class="n-bad">sin IVA</span>') + '</td></tr>';
      }).join('');

      var pres = (r.handoff.presupuesto || []).map(function (p) {
        return '<tr><td>' + esc(p.rubro_nombre || p.rubro_id) +
          (p.existe_en_odoo ? '' : ' <span class="n-bad">(no existe en Odoo)</span>') + '</td>' +
          '<td class="num">' + (p.signo < 0 ? '−' : '+') + money(Math.abs(p.monto), '') + '</td></tr>';
      }).join('');

      var politica = r.dentro_politica
        ? '<div class="aviso ok"><strong>Dentro de política.</strong></div>'
        : '<div class="aviso warn"><strong>FUERA DE POLÍTICA.</strong> Se puede confirmar, ' +
          'y queda marcada. ' + esc((r.motivos || []).join(' ')) + '</div>';

      var avisosH = (r.handoff.avisos || []).length
        ? '<div class="aviso warn">' + esc(r.handoff.avisos.join(' ')) + '</div>' : '';

      var bloqueo = r.se_puede_confirmar ? '' :
        '<div class="aviso bad"><strong>No se puede confirmar todavía.</strong> ' +
        esc(r.por_que_no || '') + '</div>';

      v.innerHTML =
        '<h4 class="cf-h">Esto es lo que va a pasar</h4>' +
        bloqueo + politica + avisosH +
        '<div class="cf-cifras">' +
          '<div><span class="tiny nota">Subtotal en Odoo</span><strong>' + money(r.subtotal_odoo, mon) + '</strong></div>' +
          '<div><span class="tiny nota">Impuesto</span><strong>' + money(r.impuesto_odoo, mon) + '</strong></div>' +
          '<div><span class="tiny nota">Total</span><strong>' + money(r.total_odoo, mon) + '</strong></div>' +
          '<div><span class="tiny nota">Contra la cotización</span><strong>' + cuadre + '</strong></div>' +
          '<div><span class="tiny nota">Margen</span><strong>' + pct(r.margen) + '</strong></div>' +
        '</div>' +
        '<div class="tabla-wrap"><table class="ctrl-t"><thead><tr>' +
          '<th>Renglón de la orden</th><th class="num">Cant</th>' +
          '<th class="num">P.U.</th><th class="num">Subtotal</th><th>IVA</th></tr></thead>' +
          '<tbody>' + renglones + '</tbody></table></div>' +
        '<h4 class="cf-h">Lo que se va a crear</h4>' +
        '<ul class="cf-lista">' +
          '<li><strong>Cuenta analítica</strong> en el plan ' + esc(r.destino.plan_id) +
            ' (' + esc(r.destino.plan_nombre) + '), sobre la columna <code>' +
            esc(r.destino.columna_eje) + '</code>' +
            (r.destino.ya_creado.analitica ? ' — ya existe la ' + esc(r.destino.ya_creado.analitica) + ', se reusa' : '') + '</li>' +
          '<li><strong>Proyecto</strong> del ' + esc(r.handoff.fecha_inicio) + ' al ' + esc(r.handoff.fecha_fin) +
            (r.destino.ya_creado.proyecto ? ' — ya existe el ' + esc(r.destino.ya_creado.proyecto) + ', se reusa' : '') + '</li>' +
          '<li><strong>Presupuesto</strong> con estos rubros' +
            (r.destino.ya_creado.presupuesto ? ' — ya existe el ' + esc(r.destino.ya_creado.presupuesto) + ', se reusa' : '') +
            '<table class="ctrl-t cf-rubros"><tbody>' + pres + '</tbody></table></li>' +
          '<li><strong>La orden queda confirmada</strong> en Odoo. Esto es lo único que no se deshace.</li>' +
          '<li><strong>Junta de arranque</strong> mañana a las 14:00, como tarea del proyecto.</li>' +
        '</ul>' +
        '<p class="tiny nota">Si algo falla antes de confirmar la orden, la orden se queda ' +
          'en borrador y lo que se haya creado se reusa al volver a intentarlo. Nada se borra.</p>' +
        (r.se_puede_confirmar
          ? '<div class="cf-detonar"><button class="btn primario" id="cfConfirmar">' +
            'Confirmar ' + esc(r.odoo_so_name) + ' en Odoo</button></div>'
          : '');

      var b = $('#cfConfirmar');
      if (b) b.onclick = function () { detonar(o, r, b); };
    });
  }

  function detonar(o, r, boton) {
    boton.disabled = true;
    boton.textContent = 'Confirmando…';
    alm().confirmar(o.machote_id, r.version).then(function (res) {
      var v = $('#cfVeredicto');
      if (!v) return;
      if (res && res.confirmo) {
        var pasos = (res.pasos || []).map(function (p) {
          return '<li>' + (p.ok ? '✓' : '✗') + ' <strong>' + esc(p.nombre) + '</strong> — ' +
            esc(p.detalle || '') + '</li>';
        }).join('');
        v.innerHTML = '<div class="aviso ok"><strong>' + esc(res.odoo_so_name) +
          ' quedó confirmada.</strong> Proyecto ' + esc(res.odoo_project_id) +
          ' · cuenta ' + esc(res.odoo_analytic_id) + ' · presupuesto ' + esc(res.odoo_budget_id) + '.</div>' +
          ((res.avisos || []).length ? '<div class="aviso warn">' + esc(res.avisos.join(' ')) + '</div>' : '') +
          '<ul class="cf-lista cf-pasos">' + pasos + '</ul>';
        recargar();
      } else {
        boton.disabled = false;
        boton.textContent = 'Reintentar';
        var ps = (res && res.pasos || []).map(function (p) {
          return '<li>' + (p.ok ? '✓' : '✗') + ' <strong>' + esc(p.nombre) + '</strong> — ' +
            esc(p.detalle || '') + '</li>';
        }).join('');
        v.innerHTML = '<div class="aviso bad"><strong>No quedó confirmada.</strong> ' +
          esc((res && res.mensaje) || '') + '</div>' +
          (ps ? '<ul class="cf-lista cf-pasos">' + ps + '</ul>' : '');
        recargar();
      }
    });
  }

  function cerrar() {
    var d = $('#cfCaja');
    if (d) d.remove();
    document.removeEventListener('keydown', alaEscape);
  }
  function alaEscape(e) { if (e.key === 'Escape') cerrar(); }

  // ── Montaje ──────────────────────────────────────────────────────────────

  function recargar() {
    var A = alm();
    if (!A || !A.ordenesVivas) {
      _st.cargando = false;
      _st.error = 'Esta versión del almacén no sabe leer las órdenes.';
      pintar();
      return Promise.resolve();
    }
    return A.ordenesVivas().then(function (r) {
      _st.cargando = false;
      if (!r || !r.ok) {
        _st.error = (r && r.mensaje) || 'El servidor no contestó.';
        pintar();
        return;
      }
      _st.error = null;
      _st.ordenes = r.ordenes || [];
      _st.avisos = r.avisos || [];
      _st.odooLeido = r.odoo_leido !== false;
      pintar();
    });
  }

  function montar(host) {
    _host = host;
    _st.cargando = true;
    _st.error = null;
    pintar();
    return recargar();
  }

  G.MachoteConfirmar = {
    montar: montar,
    _estado: function () { return _st; },
    _rubros: RUBROS
  };
})(window);
