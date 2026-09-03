// ═══ Nómina · Incidencias — pantalla ═══
//
// Render y eventos. Toda decisión de "esto se puede enviar / esto falta" vive en
// logica.js; aquí solo se pinta lo que esa capa dice. Si una regla de negocio aparece
// en este archivo, está en el lugar equivocado.
//
// Se expone window.NomApp para que el gate lo monte en jsdom sin navegador.

(function () {
  'use strict';

  var Cat, Log;
  var S = null;          // estado de la semana cargado
  var PANTALLA = 1;      // 1 roster · 2 disputas · 3 cierre
  var FILTRO = 'todos';
  var ACTIVO = null;     // id de la persona abierta en el cajón
  var SUCIO = false;     // hay cambios sin enviar
  // Copia de la persona tal como estaba AL ABRIR el cajón. Sin ella no hay forma de
  // saber qué estado se quitó: la lista nueva solo dice lo que quedó, y un estado
  // retirado hay que cerrarlo explícitamente en el server, no dejarlo vivo.
  var ORIG = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function persona(id) {
    for (var i = 0; i < S.personas.length; i++) if (S.personas[i].id === id) return S.personas[i];
    return null;
  }
  function nombreCorto(n) { return String(n).split(' ').slice(0, 2).join(' '); }

  // Aviso de guardado. Se pinta ANTES de saber el resultado solo como "guardando";
  // el "guardado" nunca se pinta hasta que el server contestó. Pintar el éxito antes
  // del POST es el anti-patrón que costó el incidente del 27-may (CLAUDE.md §14 #15).
  function aviso(estado, texto) {
    var el = $('guardado');
    if (!el) return;
    el.className = 'guardado ' + estado;
    el.textContent = texto;
    if (estado === 'ok') setTimeout(function () {
      if (el.textContent === texto) { el.className = 'guardado'; el.textContent = ''; }
    }, 4000);
  }

  // ─── Filtros del roster ───
  // "Pendientes" es el que de verdad se usa el viernes; va primero después de Todos.
  var FILTROS = [
    ['todos',     'Todos',            function () { return true; }],
    ['pend',      'Pendientes',       function (p) { return Log.bloqueos(p, S.semana, S.disputas).length > 0; }],
    ['inc',       'Con incidencia',   function (p) { return (p.declaraciones || []).length > 0; }],
    ['sin',       'Sin incidencia',   function (p) { return (p.declaraciones || []).length === 0; }],
    ['bono',      'Con bono',         function (p) { return (p.declaraciones || []).some(function (d) { return d.tipo === 'bono_proyecto'; }); }],
    ['estado',    'Con estado vivo',  function (p) { return Log.estadosVigentes(p, S.semana.hasta).length > 0; }]
  ];

  // ══════════════════════════ BANNER ══════════════════════════
  function pintarBanner() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var el = $('banner'), btn = $('enviar');
    if (!el) return r;

    if (r.lista_para_enviar) {
      el.innerHTML = '<div class="banner ok"><span class="ico">✓</span><div>' +
        '<h3>La semana ' + esc(S.semana.id) + ' está lista para enviar</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">' + r.personas +
        ' personas en el roster, todas con sus días cuadrados, sin declaraciones incompletas y sin checadas en disputa.</div>' +
        '</div></div>';
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar a Nóminas FTS'; }
      return r;
    }

    var li = '';
    for (var i = 0; i < r.detalle.length; i++) {
      var d = r.detalle[i];
      li += '<li><b>' + esc(nombreCorto(d.persona.nombre)) + '</b> — ' +
        esc(d.bloqueos.map(function (x) { return x.texto; }).join(' · ')) + '</li>';
    }
    el.innerHTML = '<div class="banner bad"><span class="ico">⛔</span><div>' +
      '<h3>No se puede enviar: ' + r.bloqueos_totales + ' cosa' + (r.bloqueos_totales > 1 ? 's' : '') +
      ' abierta' + (r.bloqueos_totales > 1 ? 's' : '') + ' en ' + r.con_bloqueo +
      ' persona' + (r.con_bloqueo > 1 ? 's' : '') + '</h3><ul>' + li + '</ul></div></div>';
    if (btn) { btn.disabled = true; btn.textContent = 'Enviar a Nóminas FTS (' + r.bloqueos_totales + ' pendientes)'; }
    return r;
  }

  // ══════════════════════════ PANTALLA 1 ══════════════════════════
  function pintarFiltros() {
    var h = '';
    for (var i = 0; i < FILTROS.length; i++) {
      var f = FILTROS[i], n = S.personas.filter(f[2]).length;
      h += '<button class="chipf" data-f="' + f[0] + '" aria-pressed="' + (FILTRO === f[0]) + '">' +
        f[1] + '<span class="n num">' + n + '</span></button>';
    }
    $('filtros').innerHTML = h;
  }

  function pintarTabla() {
    var f = FILTROS.filter(function (x) { return x[0] === FILTRO; })[0] || FILTROS[0];
    var lista = S.personas.filter(f[2]), h = '';

    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      var c = Log.contarDias(p, S.semana);
      var b = Log.bloqueos(p, S.semana, S.disputas);
      var L = p.declaraciones || [];
      var color = b.length ? 'var(--red)' : (L.length ? 'var(--green)' : 'var(--border)');

      var tags = '';
      for (var k = 0; k < L.length; k++) {
        var mm = Cat.meta(L[k].tipo);
        if (mm) tags += '<span class="pill p-info">' + esc(mm.def.label) + '</span>';
      }
      if (!L.length) tags = '<span class="pill p-none">sin declarar</span>';

      // El motivo, en la fila. Antes habia que abrir el cajon o subir al aviso para
      // saberlo; con treinta renglones y el aviso fuera de pantalla, "esta en rojo y
      // no se por que" es un callejon sin salida. Se listan hasta dos y se dice
      // cuantos faltan: si se pintan los seis, el renglon se vuelve un parrafo.
      var porque = '';
      if (b.length) {
        var vistos = [];
        for (var bz = 0; bz < b.length && bz < 2; bz++) vistos.push(esc(b[bz].texto));
        porque = '<div class="porque">' + vistos.join(' \u00b7 ') +
                 (b.length > 2 ? ' \u00b7 y ' + (b.length - 2) + ' mas' : '') + '</div>';
      }

      var dinero = '<span style="color:var(--muted)">—</span>', partes = [];
      for (var q = 0; q < L.length; q++) {
        var m2 = Cat.meta(L[q].tipo);
        if (!m2 || m2.grupo === 'dias') continue;
        if (m2.def.multi) {
          var R = (L[q].valores && L[q].valores.renglones) || [];
          for (var w = 0; w < R.length; w++) {
            partes.push('<span class="pill ' + (R[w].so ? 'p-ok' : 'p-bad') + '">$' +
              Log.moneda(R[w].monto) + (R[w].so ? '' : ' · sin proyecto') + '</span>');
          }
        } else if (Number(L[q].valores && L[q].valores.monto) > 0) {
          partes.push('<span class="pill ' + (L[q].fuente || !m2.def.fuente ? 'p-ok' : 'p-bad') + '">$' +
            Log.moneda(L[q].valores.monto) + (m2.def.fuente && !L[q].fuente ? ' · sin fuente' : '') + '</span>');
        }
      }
      if (partes.length) dinero = partes.join(' ');

      var vig = Log.estadosVigentes(p, S.semana.hasta), et = '';
      for (var z = 0; z < vig.length; z++) {
        var m3 = Cat.meta(vig[z].tipo);
        if (m3) et += '<span class="pill p-warn">' + esc(m3.def.label) + '</span>';
      }
      if (!et) et = '<span style="color:var(--muted)">—</span>';

      var diasCel = p.inactivo
        ? '<span class="pill p-none">n/a</span>'
        : '<span class="pill ' + (c.cuadra ? 'p-ok' : 'p-bad') + '">' + c.total + ' / ' + c.esperado + '</span>';

      h += '<tr data-id="' + p.id + '" tabindex="0">' +
        '<td class="st" style="background:' + color + '"></td>' +
        '<td><div class="nm">' + esc(p.nombre) +
          (p.inactivo ? ' <span class="pill p-warn">inactivo</span>' : '') + '</div>' +
          '<div class="rol">' + esc(p.puesto) + ' · ' + esc(p.departamento) + '</div>' + porque + '</td>' +
        '<td class="num">' + diasCel + '</td>' +
        '<td><div class="tags">' + tags + '</div></td>' +
        '<td><div class="tags">' + dinero + '</div></td>' +
        '<td><div class="tags">' + et + '</div></td></tr>';
    }
    $('tb').innerHTML = h || '<tr><td colspan="6" class="vacio">Nadie cae en este filtro.</td></tr>';
  }

  // ══════════════════════════ CAJÓN DE CAPTURA ══════════════════════════
  function abrir(id) {
    ACTIVO = id;
    var p = persona(id);
    if (!p) return;
    $('dnom').textContent = p.nombre + (p.inactivo ? ' · inactivo' : '');
    $('dsub').textContent = p.puesto + ' · ' + p.departamento + ' · empleado ' + p.id;
    ORIG = JSON.parse(JSON.stringify(p));
    pintarCajon();
    $('drawer').setAttribute('open', '');
  }

  // Cerrar el cajón ES el momento de guardar: es cuando la persona termina de capturar
  // a alguien. No hay botón "guardar" aparte porque un botón que se puede olvidar es
  // una forma de perder trabajo.
  async function cerrar() {
    var p = persona(ACTIVO);
    var previo = ORIG;
    $('drawer').removeAttribute('open');
    ACTIVO = null; ORIG = null;
    if (!p || !previo) return;
    if (window.NomClient.modo() === 'demo') return;
    if (JSON.stringify(p) === JSON.stringify(previo)) return;   // nada cambió: no se escribe
    await guardarPersona(p, previo);
  }

  // Guarda una persona y RELEE la semana del server. La relectura no es paranoia: es
  // la única forma de que la pantalla muestre lo que Odoo y las tablas realmente
  // tienen, en vez de lo que el navegador cree haber mandado (CLAUDE.md §8).
  async function guardarPersona(p, previo) {
    aviso('yendo', 'Guardando ' + nombreCorto(p.nombre) + '…');
    try {
      await window.NomClient.guardarPersona(S.semana.id, p);

      // Los estados viven en su propia tabla porque cruzan semanas. Los nuevos se
      // abren; los que la persona quitó se CIERRAN (vigente:false) en vez de
      // borrarse, para que quede la historia de que existieron.
      var antes = {}, ahora = {};
      (previo.estados || []).forEach(function (e) { antes[e.tipo] = e; });
      (p.estados || []).forEach(function (e) { ahora[e.tipo] = e; });
      for (var t in ahora) {
        if (JSON.stringify(ahora[t]) !== JSON.stringify(antes[t])) {
          await window.NomClient.guardarEstado(p.id, ahora[t], true);
        }
      }
      for (var t2 in antes) {
        if (!ahora[t2]) await window.NomClient.guardarEstado(p.id, antes[t2], false);
      }

      await recargar();
      aviso('ok', 'Guardado · ' + nombreCorto(p.nombre));
    } catch (err) {
      // El fallo se DICE. Un catch mudo aquí repetiría el bug #2 del kiosk: el
      // usuario cree que quedó y no quedó.
      aviso('mal', 'NO se guardó ' + nombreCorto(p.nombre) + ': ' + (err && err.msg ? err.msg : 'error desconocido'));
    }
  }

  // Relee la semana del server y repinta desde ahí.
  async function recargar() {
    var fresca = await window.NomClient.cargarSemana(S.semana.id);
    S = fresca;
    SUCIO = false;
    refrescar();
  }

  function pintarCajon() {
    var p = persona(ACTIVO);
    if (!p) return;
    var c = Log.contarDias(p, S.semana);
    var h = '';

    // Candado aritmético, con los días de México EDITABLES: es el único número que la
    // persona teclea directo; el resto sale de lo declarado. Verlo sumar en vivo es lo
    // que convierte el candado en herramienta y no en regaño al final.
    h += '<div class="box"><h4>Candado aritmético</h4><div class="calc">' +
      '<div>Días trabajados en México</div>' +
      '<div class="v"><input type="number" min="0" max="' + S.semana.dias + '" id="fmx" value="' + c.mexico + '" ' + (p.inactivo ? 'disabled' : '') + '></div>' +
      // Lo que Odoo registró va AL LADO del campo, no dentro: es un dato de apoyo,
      // no la respuesta. Quien captura decide, pero decide viendo las checadas.
      (p.dias_odoo === undefined ? '' :
        '<div style="grid-column:1/3;font-size:12px;color:var(--muted);margin:-4px 0 6px">' +
        'El kiosko registró <b>' + p.dias_odoo + '</b> ' + (p.dias_odoo === 1 ? 'día' : 'días') + ' con checada esta semana' +
        (p.dias_odoo === c.mexico ? '' : ' · lo capturado dice ' + c.mexico) +
        (p.capturado ? ' · ya capturado por RH' : '') + '</div>') +
      '<div>Días en USA</div><div class="v num">' + c.usa + '</div>' +
      '<div>Vacaciones y festivos</div><div class="v num">' + c.vac + '</div>' +
      '<div>Faltas, permisos e incapacidad</div><div class="v num">' + c.falta + '</div>' +
      '<div class="tot">Suma</div><div class="v tot num" style="color:' +
        (c.cuadra ? 'var(--green)' : 'var(--red)') + '">' + c.total + ' / ' + c.esperado + '</div>' +
      '</div>';
    if (p.inactivo) h += '<div class="aviso">Persona inactiva: no se le exigen días. Lo que se le declare sí se valida.</div>';
    h += '</div>';

    var L = p.declaraciones || [];
    h += '<div class="box"><h4>Declaraciones de la semana</h4>';
    if (!L.length) h += '<div style="font-size:13px;color:var(--muted);margin-bottom:9px">Nada declarado todavía.</div>';
    for (var i = 0; i < L.length; i++) h += renglon(L[i], i, false);
    h += '<button class="add" id="addDecl">+ Agregar declaración</button><div id="zonaDecl"></div></div>';

    var E = p.estados || [];
    h += '<div class="box"><h4>Estado de la persona <span style="text-transform:none;font-weight:400">· dura semanas, no se redeclara</span></h4>';
    if (!E.length) h += '<div style="font-size:13px;color:var(--muted);margin-bottom:9px">Sin estados registrados.</div>';
    for (var k = 0; k < E.length; k++) h += renglon(E[k], k, true);
    h += '<button class="add" id="addEst">+ Agregar estado</button><div id="zonaEst"></div></div>';

    $('dbody').innerHTML = h;
    cablearCajon();
  }

  function renglon(d, idx, esEstado) {
    var mm = Cat.meta(d.tipo);
    if (!mm) return '';
    var det = [];

    if (mm.def.multi) {
      var R = (d.valores && d.valores.renglones) || [];
      for (var i = 0; i < R.length; i++) {
        det.push('$' + Log.moneda(R[i].monto) + ' → ' + (R[i].so || '⚠ sin proyecto'));
      }
    } else {
      var C = mm.def.campos || [];
      for (var k = 0; k < C.length; k++) {
        var v = d.valores ? d.valores[C[k][0]] : null;
        if (v === undefined || v === null || v === '' || v === false) continue;
        det.push(C[k][1] + ': ' + (v === true ? 'sí' : String(v)));
      }
    }
    if (d.fuente) {
      var f = Log.derivarFuente(d.fuente);
      if (f) det.push('Fuente: ' + f.clave + ' ' + f.nombre + ' · ' + f.empresa + ' · ' + f.moneda);
    } else if (mm.def.fuente) {
      det.push('⚠ sin fuente de pago');
    }
    if (mm.def.no_costo) det.push('no es costo del proyecto: es un préstamo');

    return '<div class="item"><div class="cuerpo"><div class="tit">' + esc(mm.def.label) + '</div>' +
      '<div class="det">' + esc(det.join(' · ')) + '</div></div>' +
      '<button class="quitar" data-quitar="' + idx + '" data-est="' + (esEstado ? '1' : '') + '">quitar</button></div>';
  }

  // Formulario de alta: los campos cambian con el tipo elegido. Un formulario fijo con
  // todos los campos de los 26 tipos sería ilegible y pediría datos que no aplican.
  function formulario(zonaId, soloEstados, alAgregar) {
    var zona = $(zonaId);
    if (!zona) return;
    var opts = '';
    for (var g in Cat.CATALOGO) {
      var G = Cat.CATALOGO[g];
      if (!!G.es_estado !== !!soloEstados) continue;
      opts += '<optgroup label="' + esc(G.titulo) + '">';
      for (var t in G.items) opts += '<option value="' + t + '">' + esc(G.items[t].label) + '</option>';
      opts += '</optgroup>';
    }
    zona.innerHTML = '<div class="box" style="margin-top:9px;border-color:var(--green)">' +
      '<label for="ntipo">Tipo</label><select id="ntipo">' + opts + '</select>' +
      '<div id="ncampos"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn pri" id="nok">Agregar</button>' +
      '<button class="btn" id="ncancel">Cancelar</button></div></div>';

    function pintarCampos() {
      var tipo = $('ntipo').value, mm = Cat.meta(tipo), h = '';
      if (!mm) { $('ncampos').innerHTML = ''; return; }

      if (mm.def.multi) {
        h += '<label for="c_monto">Monto</label><input type="number" id="c_monto" step="0.01">' +
             '<label for="c_so">Proyecto</label>' + selectProyecto('c_so');
      } else {
        var C = mm.def.campos || [];
        for (var i = 0; i < C.length; i++) {
          var nom = C[i][0], et = C[i][1], ti = C[i][2];
          h += '<label for="c_' + nom + '">' + esc(et) + '</label>';
          if (ti === 'bool') {
            h += '<select id="c_' + nom + '"><option value="">No</option><option value="1">Sí</option></select>';
          } else if (ti === 'so') {
            h += selectProyecto('c_' + nom);
          } else if (Array.isArray(ti)) {
            h += '<select id="c_' + nom + '"><option value="">—</option>';
            for (var j = 0; j < ti.length; j++) h += '<option>' + esc(ti[j]) + '</option>';
            h += '</select>';
          } else {
            h += '<input type="' + (ti === 'num' ? 'number' : (ti === 'date' ? 'date' : 'text')) + '" id="c_' + nom + '"' + (ti === 'num' ? ' step="0.01"' : '') + '>';
          }
        }
      }

      if (mm.def.fuente) {
        h += '<label for="c_fuente">Fuente de pago</label><select id="c_fuente"><option value="">— elige la fuente —</option>';
        for (var f in Cat.JOURNALS) h += '<option value="' + f + '">' + f + ' · ' + esc(Cat.JOURNALS[f].nombre) + '</option>';
        h += '</select><div class="derv" id="derv">La empresa y la moneda se derivan de la fuente.</div>';
      }
      if (mm.def.rubro) {
        var p = persona(ACTIVO), r = Cat.rubroBono(p);
        h += '<div class="derv">Rubro derivado del puesto: <b>' + esc(r || 'sin rubro de obra — este puesto no cobra bono de proyecto') + '</b></div>';
      }
      if (mm.def.no_costo) {
        h += '<div class="aviso">Esto es un <b>préstamo</b>, no costo del proyecto. No entra al reparto de mano de obra; se registra contra la cuenta de anticipos y se descuenta en semanas siguientes.</div>';
      }
      $('ncampos').innerHTML = h;

      var sel = $('c_fuente');
      if (sel) {
        sel.addEventListener('change', function () {
          var d = Log.derivarFuente(sel.value);
          $('derv').innerHTML = d
            ? 'Empresa: <b>' + esc(d.empresa) + '</b> · Moneda: <b>' + esc(d.moneda) + '</b>'
            : 'La empresa y la moneda se derivan de la fuente.';
        });
      }
    }

    $('ntipo').addEventListener('change', pintarCampos);
    pintarCampos();

    $('ncancel').addEventListener('click', function () { zona.innerHTML = ''; });
    $('nok').addEventListener('click', function () {
      var tipo = $('ntipo').value, mm = Cat.meta(tipo);
      if (!mm) return;
      var reg = { tipo: tipo, valores: {} };

      if (mm.def.multi) {
        reg.valores.renglones = [{ monto: Number($('c_monto').value) || 0, so: $('c_so').value || '' }];
      } else {
        var C = mm.def.campos || [];
        for (var i = 0; i < C.length; i++) {
          var nom = C[i][0], ti = C[i][2], el = $('c_' + nom);
          if (!el) continue;
          reg.valores[nom] = (ti === 'bool') ? (el.value === '1')
            : (ti === 'num' ? (Number(el.value) || 0) : el.value);
        }
      }
      if (mm.def.fuente) reg.fuente = $('c_fuente') ? $('c_fuente').value : '';
      zona.innerHTML = '';
      alAgregar(reg);
    });
  }

  function selectProyecto(id) {
    var P = S.proyectos || [];
    var lista = 'dl-' + id;
    var h = '<input id="' + id + '" list="' + lista + '" autocomplete="off" spellcheck="false" ' +
            'placeholder="Escribe SO, cliente o parte del nombre...">';
    h += '<datalist id="' + lista + '">';
    for (var i = 0; i < P.length; i++) h += '<option value="' + esc(P[i]) + '"></option>';
    h += '</datalist>';
    h += '<div class="pista">' + P.length + ' proyectos activos, de Mexico y de USA. ' +
         'Se escribe y se filtra solo; tambien se puede pegar el nombre completo.</div>';
    return h;
  }

  function cablearCajon() {
    var mx = $('fmx');
    if (mx) {
      mx.addEventListener('input', function () {
        var p = persona(ACTIVO);
        p.dias_mexico = Number(mx.value) || 0;
        SUCIO = true;
        // Se repinta el candado y la tabla, NO el cajón completo: repintarlo le robaría
        // el foco al campo mientras se teclea.
        actualizarCandado();
        pintarBanner(); pintarTabla();
      });
    }
    var ad = $('addDecl');
    if (ad) ad.addEventListener('click', function () {
      formulario('zonaDecl', false, function (reg) {
        persona(ACTIVO).declaraciones.push(reg); SUCIO = true; pintarCajon(); refrescar();
      });
    });
    var ae = $('addEst');
    if (ae) ae.addEventListener('click', function () {
      formulario('zonaEst', true, function (reg) {
        persona(ACTIVO).estados.push(reg); SUCIO = true; pintarCajon(); refrescar();
      });
    });
    var qs = $('dbody').querySelectorAll('[data-quitar]');
    for (var i = 0; i < qs.length; i++) {
      qs[i].addEventListener('click', function (ev) {
        var idx = Number(ev.currentTarget.getAttribute('data-quitar'));
        var est = ev.currentTarget.getAttribute('data-est') === '1';
        var p = persona(ACTIVO);
        (est ? p.estados : p.declaraciones).splice(idx, 1);
        SUCIO = true; pintarCajon(); refrescar();
      });
    }
  }

  function actualizarCandado() {
    var p = persona(ACTIVO);
    if (!p) return;
    var c = Log.contarDias(p, S.semana);
    var celdas = $('dbody').querySelectorAll('.calc .v');
    if (celdas.length >= 5) {
      celdas[1].textContent = c.usa;
      celdas[2].textContent = c.vac;
      celdas[3].textContent = c.falta;
      celdas[4].textContent = c.total + ' / ' + c.esperado;
      celdas[4].style.color = c.cuadra ? 'var(--green)' : 'var(--red)';
    }
  }

  // ══════════════════════════ PANTALLA 2 · DISPUTAS ══════════════════════════
  function pintarDisputas() {
    var D = S.disputas || [], h = '';
    var abiertas = D.filter(function (d) { return d.abierta; });

    // Rezago: checadas marcadas en disputa de semanas ANTERIORES. No frenan esta
    // nómina —si lo hicieran, no cerraría nunca— pero tampoco se ocultan: son deuda
    // real y su conteo tiene que doler un poco cada semana hasta que se limpie.
    var rz = S.rezago;
    if (rz && rz.total > 0) {
      h += '<div class="banner warn"><span class="ico">⏳</span><div>' +
        '<h3>' + rz.total + ' checadas en disputa de semanas anteriores</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">Tocan a ' + rz.personas +
        ' persona' + (rz.personas === 1 ? '' : 's') + ' y la más vieja es del ' + esc(rz.desde) + '. ' +
        'No bloquean esta semana a propósito, pero siguen abiertas en Odoo. ' +
        'Se limpian desde el panel de incidencias, no desde aquí.</div></div></div>';
    }

    if (!abiertas.length) {
      h = '<div class="banner ok"><span class="ico">✓</span><div><h3>No queda ninguna checada en disputa</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">Las disputas se resuelven aquí porque es el momento en que alguien puede resolverlas: ' +
        'antes vivían en el panel del supervisor y el freno aparecía una semana después, en la carga de mano de obra.</div></div></div>';
    }
    for (var i = 0; i < D.length; i++) {
      var d = D[i], p = persona(d.empleado_id);
      if (!p) continue;
      h += '<div class="disp" data-disputa="' + d.id + '">' +
        '<div class="top"><b>' + esc(p.nombre) + '</b>' +
        '<span class="pill p-info">' + esc(d.fecha) + '</span>' +
        (d.abierta ? '<span class="pill p-bad">abierta</span>' : '<span class="pill p-ok">resuelta</span>') +
        '<span style="font-size:12px;color:var(--muted)">asistencia ' + esc(d.attendance_id) + '</span></div>' +
        '<div class="ev"><b>Propuesta:</b> ' + esc(d.propuesta) + '<br><b>Evidencia:</b> ' + esc(d.evidencia) + '</div>';
      if (d.abierta) {
        h += '<div class="acc"><button class="btn pri" data-acc="aceptar" data-id="' + d.id + '">Aceptar la propuesta</button>' +
          '<button class="btn" data-acc="otro" data-id="' + d.id + '">Es otro destino</button></div>';
      }
      h += '</div>';
    }
    $('p2').innerHTML = h;

    var bs = $('p2').querySelectorAll('[data-acc]');
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener('click', function (ev) {
        var id = Number(ev.currentTarget.getAttribute('data-id'));
        var acc = ev.currentTarget.getAttribute('data-acc');
        resolverDisputa(id, acc);
      });
    }
  }

  // En V1.00 la resolución es LOCAL: marca la disputa y desbloquea la semana en la
  // pantalla. El write real llama al resolver `incidencias/resolver`, que ya existe y
  // ya limpia el TAG — se cablea en la fase de disputas, no antes, para no estrenar un
  // segundo camino de escritura sobre el mismo dato.
  function resolverDisputa(id, accion) {
    for (var i = 0; i < S.disputas.length; i++) {
      if (S.disputas[i].id === id) {
        S.disputas[i].abierta = false;
        S.disputas[i].resolucion = accion;
        SUCIO = true;
      }
    }
    refrescar();
  }

  // ══════════════════════════ PANTALLA 3 · CIERRE ══════════════════════════
  function pintarCierre() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var t = Log.totalesDinero(S.personas);
    var conDecl = S.personas.filter(function (p) { return (p.declaraciones || []).length > 0; }).length;

    var h = '<div class="cierre-grid">' +
      kpi('Personas en el roster', r.personas, conDecl + ' con algo declarado') +
      kpi('Percepciones', '$' + Log.moneda(t.percepciones), 'bonos, primas, tiempo extra') +
      kpi('Descuentos', '$' + Log.moneda(t.descuentos), 'lo que se resta del neto') +
      kpi('Préstamos (no es costo)', '$' + Log.moneda(t.no_costo), 'anticipos: se recuperan') +
      '</div>';

    h += '<div class="box" style="background:var(--card)"><h4>Qué se verificó</h4>' +
      chk(r.bloqueos_totales === 0, 'Los días de cada persona suman ' + S.semana.dias) +
      chk(r.bloqueos_totales === 0, 'Ninguna declaración quedó sin fuente de pago ni sin proyecto') +
      chk(r.disputas_abiertas === 0, 'No queda ninguna checada en disputa') +
      '</div>';

    h += '<div class="box" style="background:var(--card)"><h4>Qué NO se verificó</h4>' +
      '<div style="font-size:13px;line-height:1.7;color:var(--muted2)">' +
      '· Que los montos sean los correctos: el módulo verifica que estén completos, no que estén bien.<br>' +
      '· Que las horas del kiosko cuadren con lo declarado: eso lo hace la carga de mano de obra, después.<br>' +
      '· Que el despacho reciba lo que se manda: hasta que exista el acuse, el envío es de ida.' +
      '</div></div>';

    if (Object.keys(t.por_fuente).length) {
      h += '<div class="box" style="background:var(--card)"><h4>Por fuente de pago</h4><div class="tags">';
      for (var f in t.por_fuente) {
        var d = Log.derivarFuente(f);
        h += '<span class="pill ' + (d ? 'p-info' : 'p-bad') + '">' + esc(f) +
          (d ? ' · ' + esc(d.moneda) : ' · sin fuente') + ' · $' + Log.moneda(t.por_fuente[f]) + '</span>';
      }
      h += '</div></div>';
    }
    $('p3').innerHTML = h;
  }
  function kpi(k, v, s) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v num">' + esc(v) +
      '</div><div class="s">' + esc(s) + '</div></div>';
  }
  function chk(ok, txt) {
    return '<div style="font-size:13px;line-height:1.9">' + (ok ? '✓ ' : '⛔ ') + esc(txt) + '</div>';
  }

  // ══════════════════════════ ORQUESTACIÓN ══════════════════════════
  function refrescar() {
    pintarBanner();
    if (PANTALLA === 1) { pintarFiltros(); pintarTabla(); }
    if (PANTALLA === 2) pintarDisputas();
    if (PANTALLA === 3) pintarCierre();
    pintarTabs();
  }

  function pintarTabs() {
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var defs = [
      [1, 'Semana', r.con_bloqueo],
      [2, 'Disputas', r.disputas_abiertas],
      [3, 'Cierre', null]
    ];
    var h = '';
    for (var i = 0; i < defs.length; i++) {
      h += '<button class="tab" data-p="' + defs[i][0] + '" aria-selected="' + (PANTALLA === defs[i][0]) + '">' +
        defs[i][1] + (defs[i][2] ? '<span class="n num">' + defs[i][2] + '</span>' : '') + '</button>';
    }
    $('tabs').innerHTML = h;
    var bs = $('tabs').querySelectorAll('.tab');
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener('click', function (ev) { irA(Number(ev.currentTarget.getAttribute('data-p'))); });
    }
  }

  function irA(n) {
    PANTALLA = n;
    $('p1').className = n === 1 ? '' : 'hid';
    $('p2').className = n === 2 ? '' : 'hid';
    $('p3').className = n === 3 ? '' : 'hid';
    refrescar();
  }

  function montar(estado) {
    Cat = window.NomCatalogo; Log = window.NomLogica;
    S = estado;
    $('semana-id').textContent = S.semana.id;
    $('semana-rango').textContent = 'del ' + S.semana.desde + ' al ' + S.semana.hasta + ' · ' + S.semana.dias + ' días';

    // La insignia de modo la pinta el arranque de index.html, NO aquí. Antes la
    // escribían los dos y ganaba el último: el pie decía PRÁCTICA y la insignia
    // decía otra cosa. Un solo escritor por campo (CLAUDE.md §20.4), y tiene que
    // ser el arranque porque la insignia debe ser correcta aunque la semana falle
    // al cargar y montar() nunca corra.

    irA(1);

    $('tb').addEventListener('click', function (ev) {
      var tr = ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if (tr) abrir(Number(tr.getAttribute('data-id')));
    });
    $('filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-f]') : null;
      if (b) { FILTRO = b.getAttribute('data-f'); pintarFiltros(); pintarTabla(); }
    });
    $('dx').addEventListener('click', cerrar);
    $('dcerrar').addEventListener('click', cerrar);
    $('drawer').addEventListener('click', function (ev) { if (ev.target === $('drawer')) cerrar(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrar(); });

    var env = $('enviar');
    if (env) env.addEventListener('click', enviar);
    return S;
  }

  // El envío real llega en la fase del formato al despacho. Hasta entonces el botón
  // dice la verdad en vez de fingir que mandó algo — el anti-patrón §14 del CLAUDE.md
  // (pintar éxito antes de que el servidor confirme) es exactamente lo que no se repite.
  async function enviar() {
    irA(3);
    var el = $('banner');
    if (window.NomClient.modo() === 'demo') {
      el.innerHTML = '<div class="banner warn"><span class="ico">⚠</span><div>' +
        '<h3>Estás en modo práctica: esto no se envió</h3>' +
        '<div style="font-size:13px;color:var(--muted2)">El módulo revisó todo y la semana pasa, ' +
        'pero en DEMO nada sale de tu navegador. Cambia a REAL en la insignia de arriba para enviar de verdad.' +
        '</div></div></div>';
      return;
    }
    var r = Log.resumenSemana(S.personas, S.semana, S.disputas);
    var t = Log.totalesDinero(S.personas);
    aviso('yendo', 'Enviando la semana…');
    try {
      await window.NomClient.guardarEnvio(S.semana.id, {
        personas: r.personas, con_bloqueo: r.con_bloqueo, bloqueos: r.bloqueos_totales,
        con_declaracion: r.con_declaracion, disputas_abiertas: r.disputas_abiertas,
        dinero: { percepciones: t.percepciones, descuentos: t.descuentos, no_costo: t.no_costo }
      });
      await recargar();
      aviso('ok', 'Semana ' + S.semana.id + ' marcada como enviada');
      irA(3);
    } catch (err) {
      aviso('mal', 'NO se envió: ' + (err && err.msg ? err.msg : 'error desconocido'));
      el.innerHTML = '<div class="banner bad"><span class="ico">⛔</span><div>' +
        '<h3>La semana NO se envió</h3><div style="font-size:13px;color:var(--muted2)">' +
        esc(err && err.msg ? err.msg : 'Error desconocido') + '</div></div></div>';
    }
  }

  window.NomApp = {
    montar: montar,
    refrescar: refrescar,
    irA: irA,
    abrir: abrir,
    cerrar: cerrar,
    estado: function () { return S; },
    filtro: function (f) { if (f !== undefined) { FILTRO = f; pintarFiltros(); pintarTabla(); } return FILTRO; },
    resolverDisputa: resolverDisputa,
    recargar: recargar,
    sucio: function () { return SUCIO; }
  };
})();
