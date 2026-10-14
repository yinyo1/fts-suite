/* ═══ Conceptualizador · pantalla tipo WhatsApp ═══
 *
 * V1.31 · el look del prototipo aprobado (fts-conceptualizador prototipos/
 * chat-v2.html, issue #4): encabezado delgado con la versión, nota de voz con
 * onda que avanza, salto y velocidad, «escribiendo…» solo cuando el motor va a
 * contestar, y la sesión a mano: renombrar, archivar, desarchivar y fijar
 * (fijar es de cada quien). Filtro por usuario. Lo demás es V1.30.
 *
 * Una sesión por cotización. Lista de sesiones con su estado (abierta ·
 * enviada · cerrada · archivada) y el chat con el motor: texto, notas de voz,
 * fotos (muchas) y PDFs. Lo que el motor propone como botón (confirmar una
 * suposición, dar de alta un contacto, crear el machote, crear el borrador,
 * cerrar) se resuelve aquí con un clic de la persona.
 *
 * Reglas de la suite que respeta:
 *   · nada se pinta como enviado antes de que el servidor lo devuelva (#15);
 *   · lo que la persona escribe sin señal se guarda con su hora real (cz-cola);
 *   · la sesión vencida manda al login sin perder la cola (§20 #12b).
 */
(function (G) {
  'use strict';
  var VERSION = 'V1.31';
  /* V1.30 · los dos modos de una sesión nueva (Fase 9). El botón fijo manda
   * EXACTAMENTE la frase que se escribiría: el disparador es el mismo. */
  var MODOS = {
    acompanamiento: { titulo: 'Levantamiento en planta', boton: 'Ya terminé, cotiza',
      intro: 'Modo acompañamiento. Mándame lo que vayas viendo: fotos, notas de voz, medidas, la ruta. Te contesto corto y te pido lo que no puede faltar según el trabajo. No propongo conceptos hasta que toques «Ya terminé, cotiza».' },
    levantamiento: { titulo: 'Cotización nueva', boton: 'Ya es todo',
      intro: 'Mándame todo (fotos, audios, PDFs, notas) y cuando acabes toca «Ya es todo».' }
  };
  // Igual que es_disparador() de la base: «cotiza» sí, «cotización…» no.
  var DISPARO = /^\s*(ya\s+es\s+todo|es\s+todo|ya\s+termin|cotiza(?![a-záéíóúñ]))/i;
  var C = G.CzCliente, Q = G.CzCola, Me = G.CzMedios;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ST = { sel: null, casos: [], locales: [], salida: [], hilo: null, motor: null, filtro: 'vivas', aprendio: null,
             urls: {}, cargando: {}, bandeja: [], rec: null, sondeo: null, vistos: null, decidiendo: {},
             // V1.31
             usuario: 'todos', archivadas: false, busca: null, player: null, rate: 1 };
  try { var g = JSON.parse(sessionStorage.getItem('cz_sel') || 'null'); if (g && (g.id || g.local)) ST.sel = g; } catch (e) {}

  // ── iconos de línea (genéricos, los del prototipo) ─────────────────────
  var P = {
    atras: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    mas: '<circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>',
    clip: '<path d="M20.5 11.5l-8.1 8.1a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
    camara: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    enviar: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    cerrar: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    fijar: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>',
    desfijar: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/><path d="M4 4l16 16"/>',
    archivar: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5"/><path d="M10 12.5h4"/>',
    desarchivar: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5"/><path d="M12 17v-5.5"/><path d="M9.5 14L12 11.5 14.5 14"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pausa: '<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>',
    nuevo: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    check: '<path d="M1.5 6.2L5 9.5 11 2"/>',
    check2: '<path d="M1 6.2L4.5 9.5 10.5 2"/><path d="M6.7 8.2l1.3 1.3L14 2"/>',
    reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
    usuario: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.6v.1"/>',
    libro: '<path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    candado: '<rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    disparo: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    abajo: '<path d="M7 10l5 5 5-5"/>'
  };
  function ico(n, c) { return '<svg class="ico ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + '</svg>'; }
  function palomita(doble) { return '<svg viewBox="0 0 15 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (doble ? P.check2 : P.check) + '</svg>'; }

  // ── utilidades ─────────────────────────────────────────────────────────
  /** Aviso abajo; con `accion` lleva un botón (p. ej. «Deshacer») que dura 5 s. */
  var tt = null;
  function toast(t, accion, fn) {
    var e = $('#toast'); e.innerHTML = esc(t) + (accion ? '<button type="button">' + esc(accion) + '</button>' : ''); e.classList.add('on');
    if (accion) $('button', e).onclick = function () { e.classList.remove('on'); fn(); };
    clearTimeout(tt); tt = setTimeout(function () { e.classList.remove('on'); }, accion ? 5000 : 3400);
  }
  function aviso(r) { if (!r || r.ok) return; toast(r.clase === 'red' ? 'Sin conexión. Se reintenta solo.' :
    // V1.31: si la pantalla sale antes que el verificador nuevo de n8n, lo dice en vez de un código.
    r.error === 'MODO_DESCONOCIDO' ? 'Esa opción todavía no está encendida en el servidor.' : (r.mensaje || ('No se pudo: ' + (r.error || 'error')))); }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(t) { return t ? new Date(t) : null; }
  function hora(t) { var d = fecha(t); return d ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function diaDe(t) { var d = fecha(t); return d ? d.getDate() + ' de ' + MES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') : ''; }
  /** Separador del chat: «Hoy», «Ayer» o la fecha (como el prototipo). */
  function separador(t) { var d = fecha(t); if (!d) return ''; var h = new Date(); if (d.toDateString() === h.toDateString()) return 'Hoy';
    if (d.toDateString() === new Date(h - 864e5).toDateString()) return 'Ayer'; return diaDe(t); }
  function corto(t) { var d = fecha(t); if (!d) return ''; var h = new Date(); if (d.toDateString() === h.toDateString()) return hora(t);
    var ay = new Date(h - 864e5); if (d.toDateString() === ay.toDateString()) return 'ayer'; return d.getDate() + ' ' + MES[d.getMonth()]; }
  function peso(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function dinero(n, m) { if (n === null || n === undefined || n === '') return '—';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (m ? ' ' + m : ''); }
  function iniciales(t) { return String(t || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase() || '?'; }
  function md(t) {
    // Markdown mínimo del motor: negritas, listas, tablas con barras y saltos.
    var L = esc(t).split('\n'), h = '', tabla = null;
    function cierraTabla() { if (tabla) { h += '<table class="tabla">' + tabla.join('') + '</table>'; tabla = null; } }
    L.forEach(function (l) {
      var x = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return;
        var celdas = x.trim().replace(/^\||\|$/g, '').split('|');
        tabla = tabla || [];
        tabla.push('<tr>' + celdas.map(function (c) { var v = c.trim(); return (tabla.length ? '<td' : '<th') + (/^[-$\d.,% ]+$/.test(v) && v ? ' class="r"' : '') + '>' + v + (tabla.length ? '</td>' : '</th>'); }).join('') + '</tr>');
        return;
      }
      cierraTabla();
      if (/^\s*([-*•]|\d+\.)\s+/.test(l)) h += '<div class="li">' + x.replace(/^\s*([-*•]|\d+\.)\s+/, function (m0, m1) { return /\d/.test(m1) ? m1 + ' ' : '• '; }) + '</div>';
      else if (/^#{1,4}\s/.test(l)) h += '<div class="h">' + x.replace(/^#+\s/, '') + '</div>';
      else h += x ? '<div>' + x + '</div>' : '<div class="sp"></div>';
    });
    cierraTabla();
    return h;
  }
  var ESTADOS = { abierto: ['abierta', 'abierta'], enviada: ['enviada', 'enviada'], cerrado: ['cerrada', 'cerrada'], archivado: ['archivada', 'archivada'], local: ['sin enviar', 'local'] };
  function chip(est) { var e = ESTADOS[est] || [est, 'abierta']; return '<span class="est ' + e[1] + '">' + e[0] + '</span>'; }

  // ── lista de sesiones ──────────────────────────────────────────────────
  // V1.31 · la persona que entró (sale del token firmado; la base vuelve a decidir con él).
  function yo() { try { var s = G.SuiteAuth.getSession(); return (s && (s.actor || s.username)) || ''; } catch (e) { return ''; } }
  /** Nombre corto para chips y tarjetas: del usuario de la suite, no de una lista escrita aquí
   *  («esteban.delacruz» → Esteban, «montalvo» → Montalvo). */
  function nombreCorto(actor, nombre) {
    var a = String(actor || '').split(/[.@_]/)[0];
    if (a) return a.charAt(0).toUpperCase() + a.slice(1);
    return String(nombre || '?').split(/\s+/)[0];
  }
  function archivada(c) { return !!(c.archivada || c.estado === 'archivado'); }
  function sinAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function deSesion(c) { return ST.usuario === 'todos' || c.autor === ST.usuario; }
  var F_ESTADO = { vivas: ['local', 'abierto', 'enviada'], cerradas: ['cerrado'], todas: null };
  function todasLasSesiones() {
    var loc = ST.locales.filter(function (l) { return !l.caso_id; }).map(function (l) {
      return { local: l.local_id, titulo: l.titulo, cliente: l.cliente, modo: l.modo, estado: 'local', autor: yo(), puede_editar: false,
               ultima_actividad_at: new Date(l.creado).toISOString(), ultimo: null }; });
    return loc.concat(ST.casos.map(function (c) { return Object.assign({ id: c.id }, c); }));
  }
  function sesionesVisibles() {
    var b = ST.busca ? sinAcento(ST.busca) : '';
    var L = todasLasSesiones().filter(function (c) {
      if (ST.archivadas !== archivada(c)) return false;
      if (!deSesion(c)) return false;
      if (b && sinAcento((c.titulo || '') + ' ' + (c.cliente || '')).indexOf(b) < 0) return false;
      if (ST.archivadas) return true;
      var F = F_ESTADO[ST.filtro]; return !F || F.indexOf(c.estado) >= 0;
    });
    // Las fijadas (de ESTA persona) arriba; la base ya las ordena, aquí solo se respeta.
    return L.map(function (c, i) { return [c, i]; }).sort(function (x, y) { return (y[0].fijado ? 1 : 0) - (x[0].fijado ? 1 : 0) || x[1] - y[1]; })
      .map(function (x) { return x[0]; });
  }
  function personas() {
    var o = {}, y = yo(); if (y) o[y] = nombreCorto(y);
    ST.casos.forEach(function (c) { if (c.autor) o[c.autor] = nombreCorto(c.autor, c.autor_nombre); });
    return Object.keys(o).sort(function (a, b) { return o[a].localeCompare(o[b]); }).map(function (k) { return { actor: k, n: o[k] }; });
  }
  function pintarLista() {
    var L = sesionesVisibles(), sel = ST.sel || {}, todas = todasLasSesiones();
    var nArch = todas.filter(function (c) { return archivada(c) && deSesion(c); }).length;
    var cuenta = function (f) { var F = F_ESTADO[f]; return todas.filter(function (c) { return !archivada(c) && deSesion(c) && (!F || F.indexOf(c.estado) >= 0); }).length; };
    var foco = document.activeElement && document.activeElement.id === 'bBusca' ? document.activeElement.selectionStart : null;
    var h = '<div class="cab">';
    if (ST.archivadas) {
      h += '<button class="btn-ic" id="bSalArch" aria-label="Volver a la lista">' + ico('atras') + '</button><div class="tit"><b>Archivadas</b><span class="ver">' + VERSION + '</span></div>';
    } else if (ST.busca !== null) {
      h += '<button class="btn-ic" id="bSalBusca" aria-label="Cerrar la búsqueda">' + ico('atras') + '</button><div class="tit"><input id="bBusca" placeholder="Buscar por nombre o cliente" value="' + esc(ST.busca) + '" aria-label="Buscar"></div>' +
        '<button class="btn-ic" id="bLimpia" aria-label="Borrar">' + ico('cerrar', 's') + '</button>';
    } else {
      // La barra de la suite no va dentro del módulo (decisión de Esteban, #4): esta ← regresa a la suite.
      h += '<button class="btn-ic" id="bSuite" aria-label="Volver a la suite">' + ico('atras') + '</button><div class="tit"><b>Conceptualizador</b><span class="ver" title="Build del módulo">' + VERSION + '</span></div>' +
        '<button class="btn-ic" id="bBuscar" aria-label="Buscar">' + ico('buscar') + '</button><button class="btn-ic" id="bMasLista" aria-label="Opciones">' + ico('mas') + '</button>';
    }
    h += '</div>';
    // 1.7 · el filtro por usuario va PRIMERO y como desplegable (a 380 px una fila de chips se salía).
    var gu = ST.usuario !== 'todos' ? { n: nombreCorto(ST.usuario), c: color(ST.usuario) } : null;
    h += '<div class="chips filtros" aria-label="Filtros"><button class="chip' + (gu ? ' on' : '') + '" id="bUsr" aria-haspopup="menu">' +
      (gu ? '<span class="ini" style="background:' + gu.c + '">' + esc(gu.n[0]) + '</span>' + esc(gu.n) : ico('usuario', 'xs') + 'Todos') + ico('abajo', 'xs') + '</button><span class="sep"></span>';
    if (!ST.archivadas) h += [['vivas', 'En curso'], ['cerradas', 'Cerradas'], ['todas', 'Todas']].map(function (f) {
      return '<button class="chip' + (ST.filtro === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' <b>' + cuenta(f[0]) + '</b></button>'; }).join('');
    h += '</div><div class="scroll">';
    if (ST.archivadas) h += '<div class="nota-arch">Archivar no borra: la sesión sigue en la base y, si tiene machote, sigue enseñando. Desarchívala con ⋮ o manteniéndola presionada.</div>';
    else if (nArch && ST.busca === null) h += '<button class="fila-arch" id="bArch">' + ico('archivar') + 'Archivadas<span class="n">' + nArch + '</span></button>';
    if (!L.length) h += '<p class="vacio">' + (ST.archivadas ? 'No hay sesiones archivadas' + (gu ? ' de ' + esc(gu.n) : '') + '.' :
      ST.busca ? 'Nada con «' + esc(ST.busca) + '».' :
      ST.filtro === 'vivas' && !gu ? 'No hay cotizaciones en curso. Abre una con «Nueva cotización» y platícale el trabajo.' : 'Nada aquí con estos filtros.') + '</p>';
    L.forEach(function (c) {
      var u = c.ultimo, on = (c.id && sel.id === c.id) || (c.local && sel.local === c.local);
      var prev = c.estado === 'local' ? 'Se da de alta al volver la señal' : !u ? 'Sin mensajes' :
        (u.texto ? u.texto : (u.adjuntos ? u.adjuntos + ' adjunto' + (u.adjuntos > 1 ? 's' : '') : ''));
      var pre = !u ? '' : (u.rol === 'usuario' ? '<span class="tk" title="En el servidor">' + palomita(false) + '</span>' : '') +
        (u.adjuntos && !u.texto ? ico('clip', 'xs') : '');
      var nAcc = Number(c.acciones) || 0;
      h += '<div class="ses' + (on ? ' on' : '') + '" data-id="' + esc(c.id || '') + '" data-local="' + esc(c.local || '') + '" role="button" tabindex="0">' +
        '<div class="av" style="background:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div>' +
        '<div class="tx"><div class="t"><span class="n">' + esc(c.titulo) + '</span><span class="h' + (nAcc ? ' nuevo' : '') + '">' + esc(corto((u && u.created_at) || c.ultima_actividad_at)) + '</span></div>' +
        '<div class="u">' + pre + '<span class="p">' + (u && u.rol === 'sistema' ? '⚙ ' : '') + esc(prev) + '</span><span class="meta">' +
        (c.estado === 'enviada' ? '<span class="est enviada">enviada</span>' : c.estado === 'cerrado' ? '<span class="est cerrada">cerrada</span>' :
         c.estado === 'local' ? '<span class="est local">sin enviar</span>' : '') +
        (c.demo ? '<span class="est archivada">demo</span>' : '') +
        (ST.usuario === 'todos' && c.autor ? '<span class="quien-ses">' + esc(nombreCorto(c.autor, c.autor_nombre)) + '</span>' : '') +
        (c.fijado ? '<span title="Fijada arriba (solo en tu lista)" aria-label="Fijada">' + ico('fijar', 'xs') + '</span>' : '') +
        (nAcc ? '<span class="badge" title="Botones esperando tu decisión">' + nAcc + '</span>' : '') + '</span></div></div>' +
        '<button class="mas" data-mas="1" aria-label="Opciones de la sesión">' + ico('mas', 's') + '</button></div>';
    });
    h += '<p class="pie">Una sesión por cotización · <a href="#" id="bAprendio">Lo que aprendió</a> · ' + VERSION + '</p></div>';
    if (!ST.archivadas) h += '<button class="fab nueva" id="bNueva">' + ico('nuevo') + 'Nueva cotización</button>';
    $('#lista').innerHTML = h;
    var on = function (id, fn) { var e = $('#' + id); if (e) e.onclick = fn; };
    on('bNueva', nuevaCotizacion);
    on('bAprendio', function (e) { e.preventDefault(); verAprendio(); });
    on('bSuite', function () { location.href = '../index.html'; });
    on('bArch', function () { ST.archivadas = true; pintarLista(); });
    on('bSalArch', function () { ST.archivadas = false; pintarLista(); });
    on('bBuscar', function () { ST.busca = ''; pintarLista(); $('#bBusca').focus(); });
    on('bSalBusca', function () { ST.busca = null; pintarLista(); });
    on('bLimpia', function () { ST.busca = ''; pintarLista(); $('#bBusca').focus(); });
    on('bMasLista', function (e) { menuLista(e.currentTarget); });
    on('bUsr', function (e) { menuUsuario(e.currentTarget); });
    var bi = $('#bBusca');
    if (bi) {
      bi.oninput = function () { ST.busca = bi.value; var p = bi.selectionStart; pintarLista(); var n = $('#bBusca'); n.focus(); n.setSelectionRange(p, p); };
      if (foco !== null) { bi.focus(); bi.setSelectionRange(foco, foco); }
    }
    $$('#lista [data-f]').forEach(function (b) { b.onclick = function () { ST.filtro = b.dataset.f; pintarLista(); }; });
    $$('#lista .ses').forEach(enlazarTarjeta);
  }
  /** Tocar abre; mantener presionado (500 ms) o el ⋮ abre la hoja de la sesión. */
  function enlazarTarjeta(el) {
    var t = null, largo = false, x0 = 0, y0 = 0;
    var sel = function () { return { id: el.dataset.id || null, local: el.dataset.local || null }; };
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-mas]')) return;
      largo = false; x0 = e.clientX; y0 = e.clientY; el.classList.add('presion');
      t = setTimeout(function () { largo = true; el.classList.remove('presion'); try { if (navigator.vibrate) navigator.vibrate(18); } catch (er) {} hojaSesion(sel()); }, 500);
    });
    var soltar = function () { clearTimeout(t); el.classList.remove('presion'); };
    el.addEventListener('pointerup', soltar); el.addEventListener('pointerleave', soltar); el.addEventListener('pointercancel', soltar);
    el.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 10) soltar(); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-mas]')) { e.stopPropagation(); return hojaSesion(sel()); }
      if (largo) return; abrir(sel());
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrir(sel()); });
  }
  var PALETA = ['#00897b', '#5c6bc0', '#8d6e63', '#43a047', '#f4511e', '#546e7a', '#7e57c2', '#00acc1'];
  function color(t) { var n = 0; String(t || '').split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 997; }); return PALETA[n % PALETA.length]; }

  // ── V1.31 · la sesión a mano: fijar, renombrar, archivar ──────────────
  function sesionDe(s) {
    s = s || {};
    return todasLasSesiones().filter(function (c) { return (s.id && c.id === s.id) || (s.local && c.local === s.local); })[0] ||
      (s.id && ST.hilo && ST.hilo.caso && ST.hilo.caso.id === s.id ? ST.hilo.caso : null);
  }
  function accionesDe(c) {
    if (!c.id) return [];
    var mia = c.puede_editar === true, n = nombreCorto(c.autor, c.autor_nombre);
    var porque = mia ? '' : '<small>Solo ' + esc(n) + (n === 'Esteban' ? '' : ' o Esteban') + '</small>';
    var arch = archivada(c);
    var quien = c.archivado_por ? 'Archivada por ' + esc(nombreCorto(c.archivado_por)) + (c.archivado_at ? ' · ' + esc(diaDe(c.archivado_at) + ' ' + hora(c.archivado_at)) : '')
      : 'La archivaron los cierres por quieta';
    return [
      { k: c.fijado ? 'desfijar' : 'fijar', ic: c.fijado ? 'desfijar' : 'fijar', t: c.fijado ? 'Quitar fijado' : 'Fijar arriba', sub: '<small>Solo en tu lista</small>', ok: true },
      { k: 'renombrar', ic: 'lapiz', t: 'Renombrar', sub: porque, ok: mia },
      { k: arch ? 'desarchivar' : 'archivar', ic: arch ? 'desarchivar' : 'archivar', t: arch ? 'Desarchivar' : 'Archivar',
        sub: porque || (arch ? '<small>' + quien + '</small>' : '<small>No se borra: sigue en la base</small>'), ok: mia }
    ];
  }
  function cerrarVelo() { var v = $('#velo'); v.className = 'velo'; v.innerHTML = ''; }
  function velo(html, oscuro) {
    var v = $('#velo'); v.className = 'velo on' + (oscuro ? ' oscuro' : ''); v.innerHTML = html;
    v.onclick = function (e) { if (e.target === v) cerrarVelo(); };
    return v;
  }
  function enMenu(btn, html, izq) {
    var r = btn.getBoundingClientRect();
    var v = velo('<div class="menu" role="menu" style="top:' + (r.bottom + 2) + 'px;' + (izq ? 'left:' + Math.max(8, r.left) + 'px' : 'right:' + Math.max(8, innerWidth - r.right) + 'px') + '">' + html + '</div>', false);
    var m = $('.menu', v), b = m.getBoundingClientRect();
    if (b.bottom > innerHeight - 8) m.style.top = Math.max(8, innerHeight - 8 - b.height) + 'px';
    return v;
  }
  function hojaSesion(s) {
    var c = sesionDe(s); if (!c) return;
    if (!c.id) return toast('Esta sesión todavía no llega al servidor: se puede cuando vuelva la señal.');
    var h = '<div class="hoja-ses" role="dialog" aria-label="Opciones de la sesión"><div class="asa"></div><div class="cabh"><div class="av" style="width:40px;height:40px;font-size:14px;background:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div>' +
      '<div><b>' + esc(c.titulo) + '</b><small>' + esc(nombreCorto(c.autor, c.autor_nombre)) + ' · ' + esc(corto(c.ultima_actividad_at)) + '</small></div></div>' +
      accionesDe(c).map(function (a) { return '<button data-a="' + a.k + '"' + (a.ok ? '' : ' disabled') + '>' + ico(a.ic) + '<span>' + a.t + a.sub + '</span></button>'; }).join('') + '</div>';
    var v = velo(h, true);
    $$('[data-a]', v).forEach(function (b) { b.onclick = function () { cerrarVelo(); hacerSesion(b.dataset.a, c); }; });
  }
  function menuLista(btn) {
    var v = enMenu(btn, '<button data-a="aprendio">' + ico('libro', 's') + '<span>Lo que aprendió</span></button>');
    $('[data-a]', v).onclick = function () { cerrarVelo(); verAprendio(); };
  }
  function menuUsuario(btn) {
    var L = [{ actor: 'todos', n: 'Todos' }].concat(personas());
    var v = enMenu(btn, L.map(function (p) {
      return '<button data-u="' + esc(p.actor) + '">' + (p.actor === 'todos' ? ico('usuario', 's') : '<span class="chip-av" style="background:' + color(p.actor) + '">' + esc(p.n[0]) + '</span>') +
        '<span>' + esc(p.n) + (p.actor === yo() ? ' <small>tú</small>' : '') + '</span>' + (ST.usuario === p.actor ? '<span style="margin-left:auto">✓</span>' : '') + '</button>'; }).join(''), true);
    $$('[data-u]', v).forEach(function (b) { b.onclick = function () { cerrarVelo(); ST.usuario = b.dataset.u; pintarLista(); }; });
  }
  function dialogoRenombrar(c) {
    var v = velo('<div class="dlg" role="dialog" aria-label="Renombrar"><h3>Renombrar</h3><p>Lo ven todos en la lista. La carpeta del caso en el repo no cambia.</p>' +
      '<input id="nNom" maxlength="80" value="' + esc(c.titulo) + '" aria-label="Nombre de la sesión"><div class="cuenta"><span id="nCta">' + String(c.titulo || '').length + '</span>/80</div>' +
      '<div class="acciones"><button id="nNo">Cancelar</button><button id="nSi">Guardar</button></div></div>', true);
    var i = $('#nNom', v); setTimeout(function () { i.focus(); i.select(); }, 30);
    i.oninput = function () { $('#nCta', v).textContent = i.value.length; };
    var guardar = async function () {
      var t = i.value.replace(/\s+/g, ' ').trim();
      if (t.length < 3) return toast('El nombre necesita al menos 3 letras.');
      if (t === c.titulo) return cerrarVelo();
      $('#nSi', v).disabled = true;
      var r = await C.renombrar(c.id, t);
      if (!r.ok) { $('#nSi', v).disabled = false; return aviso(r); }
      cerrarVelo(); await refrescarSesiones();
      toast('Renombrada · antes «' + (r.antes || c.titulo) + '»');
    };
    $('#nSi', v).onclick = guardar; $('#nNo', v).onclick = cerrarVelo;
    i.onkeydown = function (e) { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cerrarVelo(); };
  }
  /** Lo que se ve sale del servidor después de cada cambio: nada se pinta antes de que la base lo confirme. */
  async function refrescarSesiones() {
    await cargarCasos(); pintarLista();
    if ($('#app').classList.contains('ver-chat') && ST.sel && ST.sel.id) { pintarCabecera(); cargarHilo(); }
  }
  async function hacerSesion(a, c) {
    if (a === 'renombrar') return dialogoRenombrar(c);
    if (a === 'detalles') return menuSesion();
    var r = await C[a](c.id);
    if (!r.ok) return aviso(r);
    if (a === 'archivar' && ST.sel && ST.sel.id === c.id && innerWidth < 900) volverALista();
    await refrescarSesiones();
    if (a === 'fijar') return toast('Fijada arriba (solo en tu lista)');
    if (a === 'desfijar') return toast('Ya no está fijada');
    if (a === 'archivar') return toast('Archivada. Sigue en la base.', 'Deshacer', function () { hacerSesion('desarchivar', c); });
    if (a === 'desarchivar') return toast('Desarchivada: vuelve a la lista.');
  }

  function nuevaCotizacion() { abrirMenu(); }
  /** V1.30 · la sesión nueva empieza en el chat con tres opciones. */
  function abrirMenu() {
    ST.sel = { menu: true }; ST.hilo = null; ST.bandeja = []; ST.pais = ST.pais || 'mx';
    $('#app').classList.add('ver-chat'); $('#app').classList.add('en-menu'); pintarLista(); pintarChat();
  }
  function pintarMenu() {
    pintarCabecera(); $('#senal').style.display = 'none'; $('#fijo').style.display = 'none';
    $('#msgs').innerHTML = '<div class="fila el sig"><div class="b el"><div class="quien">Conceptualizador</div><div class="txt">¿Qué vamos a hacer?</div>' +
      '<div class="opciones">' +
      '<button class="opc" data-modo="acompanamiento"><b>1 · Voy a hacer un levantamiento</b><small>Te acompaño en planta: te pido fotos, la ruta, medidas y acceso según el trabajo.</small></button>' +
      '<button class="opc" data-modo="levantamiento"><b>2 · Ya tengo el levantamiento</b><small>Me mandas todo (fotos, audios, PDFs, notas) y al final tocas «Ya es todo».</small></button>' +
      '<button class="opc" data-modo="seguir"><b>3 · Seguir una cotización</b><small>Abre la lista de sesiones.</small></button></div>' +
      '<div class="pais">País: ' + [['mx', 'México · MXN'], ['usa', 'USA · USD']].map(function (p) {
        return '<button data-pais="' + p[0] + '" class="' + (ST.pais === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div></div></div>';
    $$('#msgs [data-pais]').forEach(function (b) { b.onclick = function () { ST.pais = b.dataset.pais; pintarMenu(); }; });
    $$('#msgs [data-modo]').forEach(function (b) { b.onclick = async function () {
      var m = b.dataset.modo;
      if (m === 'seguir') { ST.filtro = 'vivas'; ST.archivadas = false; volverALista(); pintarChat(); return; }
      b.disabled = true;
      var c = await Q.nuevaSesion({ titulo: MODOS[m].titulo, pais: ST.pais || 'mx', modo: m });
      ST.locales = await Q.casosLocales(); $('#app').classList.remove('en-menu'); abrir({ local: c.local_id });
    }; });
  }
  function modoActual() {
    var c = (ST.hilo && ST.hilo.caso) || casoActual() || {};
    return MODOS[c.modo] ? c.modo : null;
  }
  /** ¿Ya se dijo «ya es todo»? En el servidor, en lo que ya llegó o en lo que está en cola. */
  function yaDisparo() {
    var H = ST.hilo;
    if (H && H.caso && H.caso.disparado_at) return true;
    if (H && (H.mensajes || []).some(function (m) { return m.rol === 'usuario' && DISPARO.test(m.texto || ''); })) return true;
    return salidaDelCaso().some(function (x) { return DISPARO.test(x.texto || ''); });
  }
  function pintarFijo() {
    var m = modoActual(), c = (ST.hilo && ST.hilo.caso) || casoActual() || {}, el = $('#fijo');
    var ver = m && !(ST.sel || {}).menu && ['abierto', 'local', undefined].indexOf(c.estado) >= 0 && !yaDisparo();
    el.style.display = ver ? 'flex' : 'none';
    if (!ver) return;
    $('#bFijo').innerHTML = ico('disparo', 's') + esc(MODOS[m].boton);
    $('#bFijo').onclick = function () { this.disabled = true; var t = MODOS[m].boton; mandar(t).then(function () { $('#bFijo').disabled = false; pintarFijo(); }); };
  }

  // ── chat ───────────────────────────────────────────────────────────────
  function casoActual() {
    var s = ST.sel || {};
    if (s.menu) return { titulo: 'Nueva cotización', estado: 'menu' };
    if (s.id) return ST.casos.filter(function (c) { return c.id === s.id; })[0] || (ST.hilo && ST.hilo.caso && ST.hilo.caso.id === s.id ? ST.hilo.caso : null);
    var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0];
    return l ? { titulo: l.titulo, cliente: l.cliente, modo: l.modo, estado: 'local' } : null;
  }
  /** V1.31 (1.4) · ¿el motor VA A CONTESTAR? Solo entonces hay «escribiendo…» y puntitos.
   *  · «Ya tengo el levantamiento» antes del disparador: no. Lo que corre es guardar y transcribir.
   *  · Después de «Ya es todo» / «Ya terminé, cotiza»: sí, desde que el trabajo entra a la cola.
   *  · Acompañamiento (y sesiones sin modo): solo con un trabajo TOMADO por un motor. */
  function trabajoQueContesta() {
    var H = ST.hilo; if (!H) return null;
    var c = H.caso || {}, disp = c.disparado_at ? new Date(c.disparado_at).getTime() : null;
    if (c.modo === 'levantamiento' && !disp) return null;
    var L = (H.trabajos || []).filter(function (t) {
      if (t.lote_de) return false;                       // absorbido: lo contesta otro trabajo
      if (t.estado === 'tomado') return true;
      return t.estado === 'pendiente' && !!disp && new Date(t.created_at).getTime() >= disp - 5000;
    });
    return L.filter(function (t) { return t.estado === 'tomado'; })[0] || L[0] || null;
  }
  function notasSinTexto() {
    return ((ST.hilo && ST.hilo.adjuntos) || []).filter(function (a) { return a.clase === 'audio' && !a.transcripcion && Date.now() - new Date(a.created_at) < 10 * 60000; }).length;
  }
  function volverALista() {
    pararVoz();
    $('#app').classList.remove('ver-chat'); $('#app').classList.remove('en-menu'); ST.sel = null; guardarSel(); pintarLista();
  }
  function pintarCabecera() {
    var c = casoActual() || { titulo: '…' }, m = ST.motor, H = ST.hilo, vivo = false;
    var sub = !navigator.onLine ? 'sin señal · lo que escribas se guarda' :
      !m ? 'conectando…' : m.modo === 'rapido' ? 'motor rápido · en línea' : 'respaldo · contesta en minutos';
    var t = trabajoQueContesta();
    if (t && navigator.onLine) { sub = 'escribiendo…' + (t.estado === 'tomado' && t.avance ? ' · ' + t.avance : ''); vivo = true; }
    else if (H && H.caso && H.caso.modo === 'levantamiento' && !H.caso.disparado_at && navigator.onLine) {
      var n = notasSinTexto();
      sub = 'guardando tu levantamiento' + (n ? ' · transcribiendo ' + n + ' nota' + (n > 1 ? 's' : '') : '');
    }
    if (c.id && archivada(c)) sub = 'archivada · ' + sub;
    $('#ch').innerHTML = '<button class="btn-ic vuelve" id="bVuelve" aria-label="Volver">' + ico('atras') + '</button>' +
      '<div class="av" style="background:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div>' +
      '<div class="tx"><b><span>' + esc(c.titulo) + '</span><span class="ver" title="Build del módulo">' + VERSION + '</span></b><small class="' + (vivo ? 'vivo' : '') + '">' + esc(sub) + '</small></div>' +
      '<button class="btn-ic" id="bMenu" aria-label="Opciones">' + ico('mas') + '</button>';
    $('#bVuelve').onclick = volverALista;
    $('#bMenu').onclick = function (e) { menuChat(e.currentTarget); };
  }
  /** ⋮ del chat: lo de la sesión (fijar, renombrar, archivar) y, abajo, detalles y lo aprendido. */
  function menuChat(btn) {
    var c = sesionDe(ST.sel) || casoActual() || {};
    var A = accionesDe(c), abierta = c.estado === 'abierto' || c.estado === 'enviada';
    var h = A.map(function (a) { return '<button data-a="' + a.k + '"' + (a.ok ? '' : ' disabled') + '>' + ico(a.ic, 's') + '<span>' + a.t + a.sub + '</span></button>'; }).join('') +
      (A.length ? '<hr>' : '') +
      ((ST.sel || {}).menu ? '' : '<button data-a="detalles">' + ico('info', 's') + '<span>Detalles y línea de tiempo</span></button>') +
      (abierta && c.id ? '<button data-a="cierre">' + ico('candado', 's') + '<span>Cerrar con /cierre</span></button>' : '') +
      '<button data-a="aprendio">' + ico('libro', 's') + '<span>Lo que aprendió</span></button>';
    var v = enMenu(btn, h);
    $$('[data-a]', v).forEach(function (b) { b.onclick = function () {
      cerrarVelo(); var a = b.dataset.a;
      if (a === 'detalles') return menuSesion();
      if (a === 'aprendio') return verAprendio();
      if (a === 'cierre') { $('#in').value = '/cierre '; autoAlto(); pintarComposer(); return $('#in').focus(); }
      hacerSesion(a, c);
    }; });
  }
  function pintarSenal() {
    var mias = salidaDelCaso(), pend = mias.filter(function (x) { return x.estado !== 'error'; }).length;
    var el = $('#senal');
    if (!navigator.onLine || (pend && mias.some(function (x) { return x.intentos > 1; }))) {
      el.innerHTML = '<span>📶 ' + (!navigator.onLine ? 'Sin señal' : 'El servidor no contesta') + (pend ? ': ' + pend + ' mensaje' + (pend > 1 ? 's' : '') + ' en cola con su hora real. Se mandan solos.' : '. Lo que escribas se guarda.') +
        '</span><button id="bReint">Reintentar</button>';
      el.style.display = 'flex'; $('#bReint').onclick = function () { Q.correr(true); };
    } else if (!Q.persistente()) {
      el.innerHTML = '<span>⚠ Este navegador no deja guardar la cola: no cierres la pestaña hasta que tus mensajes tengan palomita.</span>'; el.style.display = 'flex';
    } else el.style.display = 'none';
  }
  function salidaDelCaso() {
    var s = ST.sel || {}, loc = s.local, id = s.id;
    if (!loc && id) { var l = ST.locales.filter(function (x) { return x.caso_id === id; })[0]; loc = l && l.local_id; }
    return ST.salida.filter(function (x) { return (id && x.caso_id === id) || (loc && x.caso_local === loc); });
  }

  function pintarChat() {
    if ((ST.sel || {}).menu) return pintarMenu();
    $('#app').classList.remove('en-menu');
    var M = $('#msgs'), abajo = M.scrollHeight - M.scrollTop - M.clientHeight < 80, H = ST.hilo;
    pintarCabecera(); pintarSenal(); pintarFijo();
    var modo = modoActual();
    var h = '', ultimoDia = '', prev = null;
    var dia = function (t) { var d = separador(t); if (d && d !== ultimoDia) { ultimoDia = d; h += '<div class="dia"><span>' + esc(d) + '</span></div>'; prev = null; } };
    var aparte = function (html) { h += html; prev = null; };
    // Una burbuja; la primera de cada racha lleva la colita y, si es del motor, quién habla.
    var burbuja = function (lado, cls, quien, cuerpo) {
      var sig = prev !== lado; prev = lado;
      h += '<div class="fila ' + lado + (sig ? ' sig' : '') + '"><div class="b ' + lado + (cls ? ' ' + cls : '') + '">' +
        (lado === 'el' && sig && quien ? '<div class="quien">' + esc(quien) + '</div>' : '') + cuerpo + '</div></div>';
    };
    var meta = adjuntosPorId();
    var acc = accionesPorTrabajo(), pintadas = {};
    var U = H && (H.propuesta || H.ultima), porTrabajo = {}; ((H && H.trabajos) || []).forEach(function (t) { porTrabajo[t.id] = t; });
    if (!H && !(ST.sel || {}).local) aparte('<div class="sis"><span>Cargando…</span></div>');
    if (modo) burbuja('el', 'intro', 'Conceptualizador', '<div class="txt">' + esc(MODOS[modo].intro) + '</div>');
    else if ((ST.sel || {}).local && !(H && H.mensajes && H.mensajes.length)) aparte('<div class="sis"><span>Platícale el trabajo: texto, notas de voz, fotos y PDFs. Cuando termines escribe «ya es todo».</span></div>');
    ((H && H.mensajes) || []).forEach(function (m) {
      var t = m.escrito_at || m.created_at; dia(t);
      if (m.rol === 'sistema') return aparte('<div class="sis"><span>' + esc(m.texto) + '</span></div>');
      var mio = m.rol === 'usuario', tr = m.trabajo_id && porTrabajo[m.trabajo_id];
      // Sin trabajo en modo «ya tengo el levantamiento»: guardado; el motor lo lee todo junto al disparar.
      var tk = mio ? (!m.trabajo_id && modo === 'levantamiento' ? '<span class="tk leido" title="Guardado; lo reviso todo junto cuando toques «Ya es todo»">' + palomita(true) + '</span>' : tick(tr)) : '';
      burbuja(mio ? 'yo' : 'el', '', 'Conceptualizador' + (/respaldo/.test(m.autor) ? ' · respaldo' : ''),
        adjuntosHtml((m.adjuntos || []).map(function (a) { return Object.assign({}, a, meta[a.id] || {}); }), false) +
        (m.texto ? '<div class="txt">' + (mio ? esc(m.texto) : md(m.texto)) + '</div>' : '') +
        '<span class="hora">' + (m.escrito_at && Math.abs(new Date(m.created_at) - new Date(m.escrito_at)) > 120000 ? '<i title="Escrito sin señal; llegó ' + esc(hora(m.created_at)) + '">⟲</i> ' : '') +
        esc(hora(t)) + tk + '</span><div style="clear:both"></div>');
      if (mio && tr && tr.estado === 'error') aparte('<div class="sis"><span class="mal">El motor no pudo con este mensaje: ' + esc(tr.error || '') + '. Escríbelo de otra forma o vuelve a intentar.</span></div>');
      if (!mio && m.trabajo_id) {
        // Primero lo que hay que confirmar, luego conceptos y machote (el orden del método).
        if (acc[m.trabajo_id]) aparte(tarjetaAcciones(acc[m.trabajo_id].filter(function (a) { return a.tipo === 'conjetura'; })));
        if (U && U.trabajo_id === m.trabajo_id) aparte(tarjetasRespuesta(U));
        if (acc[m.trabajo_id]) { aparte(tarjetaAcciones(acc[m.trabajo_id].filter(function (a) { return a.tipo !== 'conjetura'; }))); pintadas[m.trabajo_id] = 1; }
      }
    });
    // Acciones que no cuelgan de un mensaje del motor (p. ej. «¿la cierro?» de los cierres automáticos).
    Object.keys(acc).forEach(function (k) { if (!pintadas[k]) aparte(tarjetaAcciones(acc[k])); });
    salidaDelCaso().sort(function (a, b) { return a.escrito_at - b.escrito_at; }).forEach(function (x) {
      dia(x.escrito_at);
      var subidos = x.archivos.filter(function (a) { return a.adjunto_id; }).length, total = x.archivos.length;
      var actual = x.archivos.filter(function (a) { return Q.progreso(a.local) !== undefined; })[0];
      var reloj = '<svg class="ico xs" viewBox="0 0 24 24" aria-hidden="true" style="width:13px;height:13px">' + P.reloj + '</svg>';
      var est = x.estado === 'error' ? '<span class="mal">⚠ no se mandó</span>' :
        x.estado === 'subiendo' && total ? '<span class="cola">' + reloj + 'subiendo ' + (subidos + (actual ? 1 : 0)) + '/' + total + (actual ? ' · ' + Math.round(Q.progreso(actual.local) * 100) + '%' : '') + '</span>' :
        x.estado === 'enviando' ? '<span class="cola">' + reloj + 'enviando</span>' : '<span class="cola">' + reloj + 'en cola</span>';
      burbuja('yo', 'pend', '', adjuntosHtml(x.archivos.map(function (a) { return { local: a.local, blob: a.blob, nombre: a.nombre, clase: a.clase, bytes: a.bytes, duracion_s: a.duracion_s, subido: !!a.adjunto_id }; }), true) +
        (x.texto ? '<div class="txt">' + esc(x.texto) + '</div>' : '') +
        (total && x.estado === 'subiendo' ? '<div class="barra"><i style="width:' + Math.round(100 * (subidos + (actual ? Q.progreso(actual.local) : 0)) / total) + '%"></i></div>' : '') +
        '<span class="hora">' + esc(hora(x.escrito_at)) + ' ' + est + '</span><div style="clear:both"></div>' +
        (x.estado === 'error' ? '<div class="corr"><span class="err">' + esc(x.error) + '</span><button class="boton" data-reint="' + esc(x.cliente_id) + '">Reintentar</button><button class="boton" data-desc="' + esc(x.cliente_id) + '">Descartar</button></div>' : ''));
    });
    var tq = trabajoQueContesta();
    if (tq) h += '<div class="fila el sig"><div class="escribe" aria-label="El conceptualizador está escribiendo"><i></i><i></i><i></i>' +
      (tq.estado === 'tomado' && tq.avance ? '<em>' + esc(tq.avance) + '</em>' : '') + '</div></div>';
    M.innerHTML = h;
    enlazarChat(M);
    if (abajo || ST.irAbajo) { M.scrollTop = M.scrollHeight; ST.irAbajo = false; }
  }
  function tick(tr) {
    if (!tr) return '<span class="tk" title="Recibido en el servidor">' + palomita(false) + '</span>';
    if (tr.estado === 'listo') return '<span class="tk leido" title="El motor ya contestó">' + palomita(true) + '</span>';
    if (tr.estado === 'tomado') return '<span class="tk" title="El motor lo está trabajando">' + palomita(true) + '</span>';
    if (tr.estado === 'error') return '<span class="tk mal">⚠</span>';
    return '<span class="tk" title="Recibido en el servidor">' + palomita(false) + '</span>';
  }
  function adjuntosPorId() { var o = {}; ((ST.hilo && ST.hilo.adjuntos) || []).forEach(function (a) { o[a.id] = a; }); return o; }
  function accionesPorTrabajo() { var o = {}; ((ST.hilo && ST.hilo.acciones) || []).forEach(function (a) { var k = a.trabajo_id || ('sin-' + a.id); (o[k] = o[k] || []).push(a); }); return o; }

  function adjuntosHtml(L, local) {
    if (!L.length) return '';
    var fotos = L.filter(function (a) { return a.clase === 'foto'; }), resto = L.filter(function (a) { return a.clase !== 'foto'; }), h = '';
    if (fotos.length) {
      var v = fotos.slice(0, 4);
      h += '<div class="album n' + Math.min(fotos.length, 4) + '">' + v.map(function (a, i) {
        var k = local ? 'l:' + a.local : a.id;
        return '<div class="foto" data-foto="' + esc(k) + '" data-grupo="' + esc(fotos.map(function (f) { return local ? 'l:' + f.local : f.id; }).join(',')) + '"' +
          (ST.urls[k] ? ' style="background-image:url(' + ST.urls[k] + ')"' : '') + '>' +
          (local && !a.subido ? '<span class="sube">⬆</span>' : '') + (i === 3 && fotos.length > 4 ? '<div class="mas">+' + (fotos.length - 4) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      if (fotos.length > 1) h += '<div class="pie-adj">' + fotos.length + ' fotos</div>';
    }
    resto.forEach(function (a) {
      var k = local ? 'l:' + a.local : a.id;
      if (a.clase === 'audio') h += vozHtml(a, k, local);
      else h += '<div class="doc" data-doc="' + esc(k) + '"><div class="ic">' + (a.clase === 'pdf' ? 'PDF' : '📄') + '</div><div><b>' + esc(a.nombre) + '</b><small>' + peso(a.bytes || 0) + '</small></div></div>';
    });
    return h;
  }
  function dur(s) { s = Math.max(0, Math.floor(Number(s) || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  // ── V1.31 (1.3) · nota de voz: ▶/❚❚, onda que avanza, tocar o arrastrar para saltar, 1×/1.5×/2× ──
  // UN reproductor vivo en ST.player, fuera del DOM: el chat se repinta cada 2.5 s y el audio sigue;
  // la burbuja nueva se pinta con el estado del reproductor (en V1.30 se reiniciaba).
  ST.durs = {};
  function barrasDe(k) { var a = [], n = 0; String(k).split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 233280; });
    for (var i = 0; i < 30; i++) { n = (n * 9301 + 49297) % 233280; a.push(Math.round(5 + 22 * Math.abs(Math.sin(i * .55 + (n % 7)) * .55 + (n / 233280) * .45))); } return a; }
  function durDe(k) { var d = ST.durs[k]; return d > 0 && isFinite(d) ? d : 0; }
  function vozHtml(a, k, local) {
    if (a.duracion_s && !ST.durs[k]) ST.durs[k] = Number(a.duracion_s);
    var p = ST.player && ST.player.k === k ? ST.player : null, D = durDe(k);
    var pos = p ? p.audio.currentTime : 0, f = p && D ? Math.min(1, pos / D) : 0;
    var B = barrasDe(k), corte = Math.round(f * B.length), sk = esc(k);
    var h = '<div class="voz" data-voz="' + sk + '"><button class="play" data-play="' + sk + '" aria-label="' + (p && p.playing ? 'Pausa' : 'Reproducir') + '"><svg viewBox="0 0 24 24">' + (p && p.playing ? P.pausa : P.play) + '</svg></button>' +
      '<div class="cuerpo"><div class="onda" data-onda="' + sk + '" role="slider" aria-label="Posición" aria-valuemin="0" aria-valuemax="' + Math.round(D) + '" aria-valuenow="' + Math.round(pos) + '">' +
      B.map(function (x, i) { return '<i style="height:' + x + 'px"' + (i < corte ? ' class="ya"' : '') + '></i>'; }).join('') +
      '<span class="perilla" style="left:' + (f * 100) + '%"></span></div>' +
      '<div class="voz-pie"><span data-t="' + sk + '">' + dur(p ? pos : D) + '</span></div></div>' +
      '<button class="vel" data-vel="' + sk + '" aria-label="Velocidad">' + ST.rate + '×</button></div>';
    if (a.transcripcion) h += '<div class="trans"><span class="et">Transcripción</span>' + esc(a.transcripcion) + '</div>';
    else if (!local) {
      // La base no guarda la falla (el vigía reintenta solo, hasta 30 min entre intentos, durante 2 días).
      var edad = Date.now() - new Date(a.created_at || Date.now());
      h += edad < 10 * 60000 ? '<div class="trans pend"><span class="giro"></span>transcribiendo…</div>' :
        edad < 2 * 864e5 ? '<div class="trans mal">Todavía no se pudo transcribir: reintento solo.</div>' :
        '<div class="trans mal">No se pudo transcribir.</div>';
    }
    return h;
  }
  function selVoz(k, sel) { return '[' + sel + '="' + (G.CSS && CSS.escape ? CSS.escape(k) : k) + '"]'; }
  function pararVoz() { if (ST.player) { ST.player.audio.pause(); ST.player = null; } cancelAnimationFrame(rafVoz); }
  /** MediaRecorder graba webm sin duración (Infinity) y Chrome no deja saltar: se fuerza a calcularla. */
  function conDuracion(a, k) {
    return new Promise(function (listo) {
      var hecho = false;
      var fin = function () { if (hecho) return; hecho = true; a.ontimeupdate = null; if (isFinite(a.duration) && a.duration > 0) ST.durs[k] = a.duration; listo(); };
      var ya = function () {
        if (isFinite(a.duration)) return fin();
        a.ontimeupdate = function () { if (hecho) return; a.ontimeupdate = null; a.currentTime = 0; fin(); };
        try { a.currentTime = 1e101; } catch (e) { fin(); }
      };
      if (a.readyState >= 1) ya(); else a.onloadedmetadata = ya;
      // Si no se pudo medir en 4 s se suena igual; el truco ya no corre después (no regresa el audio a 0).
      setTimeout(fin, 4000);
    });
  }
  async function prepararAudio(k, tocar) {
    if (ST.player && ST.player.k !== k) { var ant = ST.player.k; pararVoz(); actualizarVoz(ant, 0, false); }
    if (!ST.player) {
      var boton = $(selVoz(k, 'data-play')); if (boton) boton.setAttribute('aria-busy', 'true');
      var u = await cargarUrl(k);
      if (boton) boton.removeAttribute('aria-busy');
      if (!u) { toast('No se pudo bajar el audio.'); return null; }
      if (ST.player && ST.player.k !== k) pararVoz();
      if (!ST.player) {
        var a = new Audio(u); a.preload = 'auto';
        ST.player = { k: k, audio: a, playing: false };
        await conDuracion(a, k);
        a.onended = function () { if (ST.player && ST.player.audio === a) { ST.player.playing = false; a.currentTime = 0; actualizarVoz(k, 0, false, true); } };
        a.playbackRate = ST.rate;
      }
    }
    if (tocar && ST.player && ST.player.k === k) {
      try { await ST.player.audio.play(); ST.player.playing = true; } catch (e) { toast('El navegador no reprodujo este audio.'); }
      ciclo();
    }
    return ST.player;
  }
  function alternar(k) {
    if (ST.player && ST.player.k === k && ST.player.playing) { ST.player.audio.pause(); ST.player.playing = false; ciclo(); return; }
    prepararAudio(k, true);
  }
  function actualizarVoz(k, pos, sonando, fin) {
    var el = $(selVoz(k, 'data-voz')); if (!el) return;
    var D = durDe(k), f = D ? Math.min(1, pos / D) : 0, B = $$('.onda i', el), corte = Math.round(f * B.length);
    B.forEach(function (b, i) { b.classList.toggle('ya', i < corte); });
    $('.perilla', el).style.left = (f * 100) + '%';
    $('[data-t]', el).textContent = dur(fin || (!sonando && !pos) ? D : pos);
    $('[data-play] svg', el).innerHTML = sonando ? P.pausa : P.play;
    $('[data-play]', el).setAttribute('aria-label', sonando ? 'Pausa' : 'Reproducir');
    $('.onda', el).setAttribute('aria-valuenow', Math.round(pos));
  }
  var rafVoz = null;
  function ciclo() {
    cancelAnimationFrame(rafVoz);
    var p = ST.player; if (!p) return;
    actualizarVoz(p.k, p.audio.currentTime, p.playing);
    if (p.playing) rafVoz = requestAnimationFrame(ciclo);
  }
  function enlazarVoces(R) {
    $$('[data-play]', R).forEach(function (b) { b.onclick = function () { alternar(b.dataset.play); }; });
    $$('[data-vel]', R).forEach(function (b) { b.onclick = function () {
      ST.rate = { 1: 1.5, 1.5: 2, 2: 1 }[ST.rate] || 1;
      if (ST.player) ST.player.audio.playbackRate = ST.rate;
      $$('[data-vel]').forEach(function (x) { x.textContent = ST.rate + '×'; });
    }; });
    $$('[data-onda]', R).forEach(function (o) {
      var k = o.dataset.onda;
      var mover = function (e) {
        var p = ST.player; if (!p || p.k !== k) return;
        var r = o.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), D = durDe(k);
        if (D) { p.audio.currentTime = f * D; actualizarVoz(k, f * D, p.playing); }
      };
      o.addEventListener('pointerdown', function (e) {
        try { o.setPointerCapture(e.pointerId); } catch (er) {}
        if (ST.player && ST.player.k === k) mover(e);
        else { var x = e.clientX; prepararAudio(k, false).then(function () { mover({ clientX: x }); }); }
        o.onpointermove = mover;
      });
      o.addEventListener('pointerup', function () { o.onpointermove = null; });
      o.addEventListener('pointercancel', function () { o.onpointermove = null; });
    });
  }

  // ── tarjetas de la respuesta del motor ─────────────────────────────────
  function tarjetasRespuesta(U) {
    var H = ST.hilo, h = '';
    var decididos = {}; (H.eventos || []).forEach(function (e) { if (e.concepto && (e.tipo === 'aceptar' || e.tipo === 'rechazar')) decididos[e.concepto] = e; });
    if ((U.conceptos || []).length) {
      var faltan = U.conceptos.filter(function (k) { return !decididos[k.id]; }).length;
      h += '<div class="carta"><h4>🧩 Conceptos propuestos' + (faltan ? ' · <span class="gris">' + faltan + ' por decidir</span>' : '') + '</h4>';
      U.conceptos.forEach(function (k) {
        var d = decididos[k.id];
        h += '<div class="con"><span class="n">' + esc(k.id) + '</span><div class="d">' + esc(k.concepto) + '<small>origen: ' + esc(k.origen || '') + '</small>' +
          (d && d.razon ? '<small class="mal">' + esc(d.razon) + '</small>' : '') + '<div class="corr-slot" data-slot="' + esc(k.id) + '"></div></div>' +
          (d ? '<span class="hecho' + (d.tipo === 'rechazar' ? ' mal' : '') + '">' + (d.tipo === 'aceptar' ? 'aceptado' : 'rechazado') + '</span>'
             : '<div class="acc"><button class="si" data-k="' + esc(k.id) + '" data-v="1" aria-label="Aceptar">✓</button><button class="no" data-k="' + esc(k.id) + '" data-v="0" aria-label="Rechazar">✕</button></div>') + '</div>';
      });
      h += '<p class="nota">Rechazar pide la razón: así aprendo para la siguiente.</p></div>';
    }
    var Mq = U.machote;
    if (Mq && (Mq.secciones || []).length) {
      h += '<div class="carta"><h4>📐 Machote propuesto · ' + (Mq.margen_objetivo ? Math.round(Mq.margen_objetivo * 100) + '%' : '40%') + ' con comisión FTS ' + ((Mq.comision_fts || 0.055) * 100).toFixed(1) + '% por sección</h4>' +
        '<table class="tabla"><tr><th>Sección</th><th class="r">Costo</th><th class="r">Precio</th><th class="r">Margen</th></tr>' +
        Mq.secciones.map(function (s) { return '<tr><td>' + esc(s.nombre) + (s.sin_precio ? ' <span class="mal" title="Renglones sin precio">· ' + s.sin_precio + ' sin precio</span>' : '') +
          '</td><td class="r">' + dinero(s.costo) + '</td><td class="r">' + dinero(s.precio) + '</td><td class="r ok">' + (s.margen * 100).toFixed(1) + '%</td></tr>'; }).join('') +
        '<tr class="tot"><td>Total</td><td class="r">' + dinero(Mq.costo) + '</td><td class="r">' + dinero(Mq.precio) + '</td><td class="r">' + ((Mq.margen || 0) * 100).toFixed(1) + '%</td></tr></table>' +
        ((Mq.opciones || []).length ? '<p class="nota">Aparte (el cliente escoge una): ' + Mq.opciones.map(function (o) { return esc(o.nombre) + ' ' + dinero(o.precio); }).join(' · ') + '</p>' : '') +
        '<p class="nota">Calculado con el motor del machote de la suite (calc.js ' + esc((Mq.calc && Mq.calc.version) || '') + '). Para cambiar secciones, márgenes o la mano de obra, dímelo aquí.</p></div>';
    }
    if (Mq && Mq.entrega) {
      h += '<div class="carta"><h4>📄 Para el cliente</h4><p class="nota">Una línea por sección, sin costos internos ni subcontratistas. Revísalo antes de mandarlo.</p>' +
        '<div class="acc"><button class="si" data-pdf="1">Ver PDF al cliente</button></div>' +
        '<h4 style="margin-top:10px">✉️ Correo para copiar · no se envía nada desde aquí</h4>' +
        '<textarea class="copia" readonly>' + esc(Mq.entrega.correo) + '</textarea>' +
        '<div class="acc"><button class="si" data-copia="1">Copiar correo</button></div></div>';
    }
    var B = U.bom || {}, mat = B.materiales || [], mo = B.mano_obra || [];
    if (mat.length || mo.length) {
      h += '<details class="carta"><summary><b>BOM a costo</b> · ' + mat.length + ' renglones + ' + mo.length + ' de mano de obra</summary>';
      mat.forEach(function (r) {
        h += '<div class="bom"><div><b>' + esc(r.descripcion) + '</b></div><div>' + esc(r.qty) + ' ' + esc(r.unidad) + ' · ' + esc(r.tipo) + ' · <b>' + dinero(r.importe, r.moneda) + '</b></div>' +
          '<div class="org">' + esc(r.formula || '') + ' · ' + (r.liga && /^https?:/.test(r.liga) ? '<a href="' + esc(r.liga) + '" target="_blank" rel="noopener">' + esc(r.fuente) + '</a>' : esc(r.fuente || 'sin fuente')) + '</div></div>';
      });
      mo.forEach(function (r) {
        h += '<div class="bom"><div><b>MO · ' + esc(r.rol) + '</b></div><div>' + esc(r.personas) + ' pers × ' + esc(r.dias) + ' d × ' + esc(r.horas_dia) + ' h · <b>' + dinero(r.importe, r.moneda) + '</b></div><div class="org">' + esc(r.origen || '') + '</div></div>';
      });
      h += '</details>';
    }
    if ((U.preguntas || []).length && !((ST.hilo.acciones || []).some(function (a) { return a.trabajo_id === U.trabajo_id && a.tipo === 'conjetura'; })))
      h += '<div class="carta"><h4>❓ Preguntas</h4><ol class="ol">' + U.preguntas.map(function (p) { return '<li>' + esc(typeof p === 'string' ? p : p.pregunta) + '</li>'; }).join('') + '</ol></div>';
    return h;
  }

  var ETIQ = { alta_contacto: 'Sí, dar de alta', crear_machote: 'Crear machote', crear_borrador: 'Crear borrador en Odoo',
               enviada: 'Ya la mandé al cliente', cerrar: 'Sí, ciérrala' };
  function tarjetaAcciones(L) {
    var conj = L.filter(function (a) { return a.tipo === 'conjetura'; }), otras = L.filter(function (a) { return a.tipo !== 'conjetura'; }), h = '';
    if (conj.length) {
      var pend = conj.filter(function (a) { return a.estado === 'propuesta'; }).length;
      h += '<div class="carta"><h4>❓ Lo que supongo · confírmalo o corrígelo' + (pend ? ' · <span class="gris">faltan ' + pend + '</span>' : '') + '</h4>';
      conj.forEach(function (a) {
        var d = a.datos || {}, r = a.resultado || {};
        h += '<div class="preg"><p>' + esc(d.pregunta || a.titulo) + '</p>' + (d.conjetura ? '<div class="conj">Supongo: ' + esc(d.conjetura) + (d.porque ? '<small> · ' + esc(d.porque) + '</small>' : '') + '</div>' : '') +
          (a.estado === 'hecha' ? '<span class="hecho">✓ Confirmado</span>' : a.estado === 'descartada' ? '<span class="hecho mal">✎ Corregido: ' + esc(r.correccion || '') + '</span>' :
           '<div class="acc" data-acc="' + a.id + '"><button class="si" data-conf="' + a.id + '">Confirmo</button><button data-corr="' + a.id + '">Corrijo</button></div>') + '</div>';
      });
      h += (pend ? '<p class="nota">Cuando contestes todas, sigo con los conceptos.</p>' : '') + '</div>';
    }
    // Un machote o un borrador con suposiciones sin contestar saldría con números viejos.
    var pendientes = ((ST.hilo && ST.hilo.acciones) || []).some(function (x) { return x.tipo === 'conjetura' && x.estado === 'propuesta'; });
    otras.forEach(function (a) {
      var d = a.datos || {}, r = a.resultado || {}, manejador = G.CzAcciones && G.CzAcciones[a.tipo];
      var espera = pendientes && (a.tipo === 'crear_machote' || a.tipo === 'crear_borrador');
      h += '<div class="carta"><h4>' + ({ alta_contacto: '👤', crear_machote: '📐', crear_borrador: '🧾', enviada: '📨', cerrar: '🔒' }[a.tipo] || '•') + ' ' + esc(a.titulo) + '</h4>' +
        (d.detalle ? '<div class="odoo">' + md(d.detalle) + '</div>' : '') +
        (a.estado === 'hecha' ? '<span class="hecho">✓ ' + esc(r.texto || 'Hecho') + '</span>' :
         a.estado === 'descartada' ? '<span class="hecho gris">' + ((r.reemplazada_por_trabajo) ? 'Reemplazado por una propuesta más nueva' : 'Descartado') + '</span>' :
         espera ? '<p class="nota">Contesta primero las suposiciones pendientes: el machote se arma con lo que confirmes.</p>' :
         (a.tipo === 'enviada' || a.tipo === 'cerrar' || manejador) ?
           '<div class="acc"><button class="si" data-hacer="' + a.id + '">' + esc(d.boton || ETIQ[a.tipo] || 'Hacer') + '</button><button data-descartar="' + a.id + '">' + (a.tipo === 'cerrar' ? 'Todavía no' : 'No') + '</button></div>' :
           '<p class="nota">Este botón se enciende cuando se active la escritura a Odoo correspondiente.</p>') + '</div>';
    });
    return h;
  }

  // ── eventos del chat ───────────────────────────────────────────────────
  function enlazarChat(M) {
    $$('[data-foto]', M).forEach(function (f) {
      var k = f.dataset.foto; cargarUrl(k).then(function (u) { if (u) f.style.backgroundImage = 'url(' + u + ')'; });
      f.onclick = function () { verFotos(f.dataset.grupo.split(','), k); };
    });
    enlazarVoces(M);
    $$('[data-doc]', M).forEach(function (d) { d.onclick = function () { bajar(d.dataset.doc); }; });
    $$('[data-reint]', M).forEach(function (b) { b.onclick = function () { Q.reintentar(b.dataset.reint); }; });
    $$('[data-desc]', M).forEach(function (b) { b.onclick = function () { if (confirm('¿Descartar este mensaje? No se manda.')) Q.descartar(b.dataset.desc); }; });
    $$('[data-k]', M).forEach(function (b) { b.onclick = function () { decidirConcepto(b.dataset.k, b.dataset.v === '1', b); }; });
    $$('[data-conf]', M).forEach(function (b) { b.onclick = function () { resolver(b.dataset.conf, 'hecha', { confirma: true }, b); }; });
    $$('[data-corr]', M).forEach(function (b) { b.onclick = function () { pedirTexto(b.closest('.acc'), '¿Qué es lo correcto?', 'Mandar', function (v) { return resolver(b.dataset.corr, 'descartada', { correccion: v }, b); }); }; });
    $$('[data-hacer]', M).forEach(function (b) { b.onclick = function () { hacer(b.dataset.hacer, b); }; });
    $$('[data-pdf]', M).forEach(function (b) { b.onclick = verPdf; });
    $$('[data-copia]', M).forEach(function (b) { b.onclick = function () { copiar(b.closest('.carta').querySelector('textarea.copia').value, b); }; });
    $$('[data-descartar]', M).forEach(function (b) { b.onclick = function () { resolver(b.dataset.descartar, 'descartada', {}, b); }; });
  }
  function pedirTexto(lugar, ph, boton, fn) {
    var d = document.createElement('div'); d.className = 'corr';
    d.innerHTML = '<input placeholder="' + esc(ph) + '"><button class="boton si">' + esc(boton) + '</button>';
    lugar.replaceWith(d); var i = d.querySelector('input'); i.focus();
    var ir = async function () { var v = i.value.trim(); if (v.length < 2) return toast('Escribe la razón o lo correcto.'); d.querySelector('button').disabled = true;
      var ok = await fn(v); if (!ok) d.querySelector('button').disabled = false; };
    d.querySelector('button').onclick = ir; i.onkeydown = function (e) { if (e.key === 'Enter') ir(); };
  }
  async function decidirConcepto(id, acepta, b) {
    var U = ST.hilo && (ST.hilo.propuesta || ST.hilo.ultima), k = U && (U.conceptos || []).filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var mandar = async function (razon) {
      var r = await C.evento({ caso_id: ST.hilo.caso.id, tipo: acepta ? 'aceptar' : 'rechazar', concepto: k.id, razon: razon || '',
        datos: { concepto: k.concepto, origen: k.origen } });
      if (!r.ok) { aviso(r); return false; }
      await cargarHilo(); return true;
    };
    if (acepta) { b.disabled = true; if (!(await mandar(''))) b.disabled = false; return; }
    pedirTexto(b.closest('.acc'), '¿Por qué no va? (obligatorio)', 'Rechazar', mandar);
  }
  async function resolver(id, decision, resultado, b) {
    if (b) b.disabled = true;
    var r = await C.accion({ accion_id: String(id), decision: decision, resultado: resultado });
    if (!r.ok) { aviso(r); if (b) b.disabled = false; return false; }
    await cargarHilo(); return true;
  }
  async function hacer(id, b) {
    var a = ((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return String(x.id) === String(id); })[0]; if (!a) return;
    if (a.tipo === 'enviada') return resolver(id, 'hecha', { texto: 'Marcada como enviada al cliente' }, b);
    if (a.tipo === 'cerrar') return confirmarCierre(function () { return resolver(id, 'hecha', { texto: 'Cerrada a mano' }, b); });
    var m = G.CzAcciones && G.CzAcciones[a.tipo]; if (!m) return;
    b.disabled = true;
    try {
      // El manejador hace la escritura con su propio endpoint (machote-guardar,
      // orden-crear-v2, odoo-alta) y devuelve {ok, resultado} o {ok:false, mensaje}.
      var r = await m(a, { caso: ST.hilo.caso, hilo: ST.hilo, toast: toast, modal: modal, cerrarModal: cerrarModal });
      if (!r || !r.ok) { if (r && r.mensaje) toast(r.mensaje); b.disabled = false; return; }
      await resolver(id, 'hecha', r.resultado || {}, null);
    } catch (e) { toast('No se pudo: ' + (e && e.message || e)); b.disabled = false; }
  }

  async function verPdf() {
    var H = ST.hilo, U = H && (H.propuesta || H.ultima), E = U && U.machote && U.machote.entrega; if (!E) return;
    modal('<p class="sub">Preparando…</p>');
    var cuerpo = await G.CzAcciones._pdfCliente(E, H.caso);
    modal('<div class="no-imp"><h3>Vista del PDF al cliente</h3><p class="sub">Lo que ve el cliente: una línea por sección, sin costos ni subcontratistas.</p></div>' + cuerpo +
      '<div class="acc der no-imp"><button class="boton" data-cierra>Cerrar</button><button class="boton si" id="bImp">Imprimir o guardar PDF</button></div>');
    $('#bImp').onclick = function () { document.body.classList.add('imprimiendo'); G.print(); setTimeout(function () { document.body.classList.remove('imprimiendo'); }, 500); };
  }
  function copiar(t, b) {
    var hecho = function () { b.textContent = '✓ Copiado'; setTimeout(function () { b.textContent = 'Copiar correo'; }, 2500); };
    try { navigator.clipboard.writeText(t).then(hecho, function () { viejo(); }); } catch (e) { viejo(); }
    function viejo() { var ta = b.closest('.carta').querySelector('textarea.copia'); ta.removeAttribute('readonly'); ta.select(); try { document.execCommand('copy'); hecho(); } catch (e) { toast('Selecciona el texto y cópialo.'); } ta.setAttribute('readonly', ''); }
  }

  // ── adjuntos: ver, tocar, bajar ────────────────────────────────────────
  async function cargarUrl(k) {
    if (ST.urls[k]) return ST.urls[k];
    if (k.indexOf('l:') === 0) {
      var loc = k.slice(2), it = ST.salida.reduce(function (acc, x) { return acc || x.archivos.filter(function (a) { return a.local === loc; })[0]; }, null);
      if (it && it.blob) return (ST.urls[k] = URL.createObjectURL(it.blob));
      return null;
    }
    if (ST.cargando[k]) return ST.cargando[k];
    ST.cargando[k] = (async function () {
      var r = await C.verAdjunto(k);
      if (!r.ok) return null;
      var bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      ST.urls[k] = URL.createObjectURL(new Blob([u8], { type: r.tipo })); ST.nombres = ST.nombres || {}; ST.nombres[k] = r.nombre;
      return ST.urls[k];
    })();
    return ST.cargando[k];
  }
  function verFotos(grupo, k) {
    var i = Math.max(0, grupo.indexOf(k));
    var pinta = async function () {
      modal('<div class="visor"><img alt=""><div class="vbar"><button class="boton" data-p="-1">‹</button><span>' + (i + 1) + ' / ' + grupo.length + '</span><button class="boton" data-p="1">›</button><button class="boton" data-cierra>Cerrar</button></div></div>', true);
      var u = await cargarUrl(grupo[i]); var img = $('.visor img'); if (img && u) img.src = u;
      $$('.visor [data-p]').forEach(function (b) { b.onclick = function () { i = (i + Number(b.dataset.p) + grupo.length) % grupo.length; pinta(); }; });
    };
    pinta();
  }
  async function bajar(k) {
    var u = await cargarUrl(k); if (!u) return toast('No se pudo bajar el archivo.');
    var a = document.createElement('a'); a.href = u; a.download = (ST.nombres && ST.nombres[k]) || 'archivo'; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ── redactar: texto, archivos, voz ─────────────────────────────────────
  function destino() {
    var s = ST.sel || {};
    if (s.id) return { caso_id: s.id };
    var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0];
    return l && l.caso_id ? { caso_id: l.caso_id } : { local_id: s.local };
  }
  function pintarComposer() {
    var hay = $('#in').value.trim() || ST.bandeja.length;
    $('#bEnviar').innerHTML = ico(hay ? 'enviar' : 'mic');
    $('#bEnviar').setAttribute('aria-label', hay ? 'Enviar' : 'Grabar nota de voz');
    var B = $('#bandeja');
    if (!ST.bandeja.length) { B.style.display = 'none'; return; }
    var antes = ST.bandeja.reduce(function (s, a) { return s + (a.original || a.bytes); }, 0), despues = ST.bandeja.reduce(function (s, a) { return s + a.bytes; }, 0);
    B.style.display = 'block';
    B.innerHTML = '<div class="tira">' + ST.bandeja.map(function (a, i) {
      return '<div class="mini" data-i="' + i + '"' + (a.clase === 'foto' ? ' style="background-image:url(' + (a.url || (a.url = URL.createObjectURL(a.blob))) + ')"' : '') + '>' +
        (a.clase !== 'foto' ? '<span>' + (a.clase === 'pdf' ? 'PDF' : a.clase === 'audio' ? '🎤' : '📄') + '</span>' : '') + '<button data-quita="' + i + '" aria-label="Quitar">×</button></div>'; }).join('') +
      '</div><div class="nota">' + ST.bandeja.length + ' archivo' + (ST.bandeja.length > 1 ? 's' : '') + ' · ' + peso(despues) + (antes > despues * 1.2 ? ' (reducidas de ' + peso(antes) + ')' : '') + ' · se suben uno por uno</div>';
    $$('#bandeja [data-quita]').forEach(function (b) { b.onclick = function () { ST.bandeja.splice(Number(b.dataset.quita), 1); pintarComposer(); }; });
  }
  async function agregarArchivos(files) {
    files = Array.prototype.slice.call(files || []); if (!files.length) return;
    var nota = $('#prep'); nota.style.display = 'block';
    for (var i = 0; i < files.length; i++) {
      nota.textContent = 'Preparando ' + (i + 1) + ' de ' + files.length + '…';
      var r = await Me.preparar(files[i]);
      if (r.error) toast(r.error); else ST.bandeja.push(r);
    }
    nota.style.display = 'none'; pintarComposer();
  }
  async function enviar() {
    var t = $('#in').value.trim();
    if (!t && !ST.bandeja.length) return grabar();
    if (/^\/cierre\b/i.test(t)) return confirmarCierre(function () { return mandar(t); });
    return mandar(t);
  }
  async function mandar(t) {
    var arch = ST.bandeja.slice(); ST.bandeja = [];
    $('#in').value = ''; autoAlto(); pintarComposer();
    await Q.encolar(destino(), t, arch); ST.irAbajo = true; await refrescarSalida();
    return true;
  }
  function confirmarCierre(fn) {
    modal('<h3>Cerrar la cotización</h3><p class="sub">Te voy a pedir lo que de verdad salió: el machote final, y si ya se ejecutó, cuánta gente y cuántos días. Comparo contra lo propuesto y guardo lo aprendido.</p>' +
      '<div class="acc der"><button class="boton" data-cierra>Todavía no</button><button class="boton si" id="okCierre">Sí, ciérrala</button></div>');
    $('#okCierre').onclick = async function () { this.disabled = true; await fn(); cerrarModal(); };
  }
  async function grabar() {
    if (!Me.puedeGrabar()) return toast('Este navegador no deja grabar. Usa el 📎 para mandar un audio grabado.');
    if (ST.rec) return;
    try { ST.rec = await Me.grabar(); } catch (e) { ST.rec = null; return toast(e && e.name === 'NotAllowedError' ? 'Da permiso al micrófono para grabar.' : 'No se pudo grabar: ' + (e.message || e)); }
    $('#grab').style.display = 'flex'; $('.compose').classList.add('grabando');
    var reloj = setInterval(function () { if (!ST.rec) return clearInterval(reloj); $('#gT').textContent = dur((Date.now() - ST.rec.inicio) / 1000);
      if (Date.now() - ST.rec.inicio > 10 * 60 * 1000) $('#gOk').click(); }, 250);
    $('#gNo').onclick = function () { ST.rec.cancelar(); ST.rec = null; clearInterval(reloj); $('#grab').style.display = 'none'; $('.compose').classList.remove('grabando'); };
    $('#gOk').onclick = async function () {
      var r = await ST.rec.detener(); ST.rec = null; clearInterval(reloj); $('#grab').style.display = 'none'; $('.compose').classList.remove('grabando');
      if (!r || r.duracion_s < 1) return toast('Muy corta: mantén grabando al menos un segundo.');
      if (r.bytes > Me.TOPE) return toast('La nota pasa de 10 MB: grábala en partes.');
      await Q.encolar(destino(), '', [r]); ST.irAbajo = true; await refrescarSalida();
    };
  }
  function autoAlto() { var i = $('#in'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 140) + 'px'; }

  // ── menú, aprendió, modal ──────────────────────────────────────────────
  function menuSesion() {
    var c = (ST.hilo && ST.hilo.caso) || casoActual() || {};
    modal('<h3>' + esc(c.titulo || 'Sesión') + '</h3><p class="sub">' + chip(c.estado || 'local') + ' ' + esc(c.cliente || '') + (c.pais ? ' · ' + esc(String(c.pais).toUpperCase()) : '') + '</p>' +
      '<table class="tabla">' + [['Machote', c.machote_folio], ['Oportunidad en Odoo', c.oportunidad_id], ['Borrador en Odoo', c.orden_nombre || c.orden_id],
        ['Caso en el repo', c.carpeta], ['Cerrada por', c.cerrado_por && (c.cerrado_por + (c.cierre_motivo ? ' · ' + c.cierre_motivo : ''))]]
        .filter(function (x) { return x[1]; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>' +
      '<h4 class="h4">Línea de tiempo</h4><ul class="tl">' + lineaDeTiempo().map(function (t) { return '<li class="' + (t[2] ? 'auto' : '') + '">' + esc(t[1]) + '<small>' + esc(t[0]) + '</small></li>'; }).join('') + '</ul>' +
      '<div class="acc der">' + (c.estado === 'abierto' || c.estado === 'enviada' ? '<button class="boton" id="mCierre">Cerrar con /cierre</button>' : '') +
      '<button class="boton" id="mAprendio">Lo que aprendió</button><button class="boton si" data-cierra>Listo</button></div>');
    var mc = $('#mCierre'); if (mc) mc.onclick = function () { cerrarModal(); $('#in').value = '/cierre '; autoAlto(); pintarComposer(); $('#in').focus(); };
    $('#mAprendio').onclick = function () { verAprendio(); };
  }
  function lineaDeTiempo() {
    var H = ST.hilo; if (!H) return [];
    var f = function (t) { var d = new Date(t); return diaDe(t) + ' ' + hora(t); }, L = [];
    var c = H.caso; L.push([c.created_at, 'Sesión abierta por ' + (c.autor_nombre || c.autor)]);
    (H.mensajes || []).forEach(function (m) {
      if (m.rol === 'sistema') L.push([m.created_at, m.texto, true]);
      if (m.escrito_at && Math.abs(new Date(m.created_at) - new Date(m.escrito_at)) > 120000) L.push([m.escrito_at, 'Escrito sin señal; llegó a las ' + hora(m.created_at)]);
    });
    (H.acciones || []).forEach(function (a) {
      if (a.estado === 'propuesta') return;
      var que = a.tipo === 'conjetura' ? (a.estado === 'hecha' ? 'confirmado' : 'corregido: ' + ((a.resultado || {}).correccion || '')) : (a.estado === 'hecha' ? 'hecho' : 'descartado');
      L.push([a.hecha_at, a.titulo + ' → ' + que + (a.hecha_por ? ' (' + a.hecha_por + ')' : '')]);
    });
    (H.eventos || []).forEach(function (e) { if (e.tipo === 'cierra' || e.tipo === 'ejecucion') L.push([e.created_at, e.tipo === 'cierra' ? 'Cierre: el motor compara lo propuesto contra lo que salió' : 'Cierre de ejecución: horas reales contra lo cotizado', true]); });
    if (c.estado === 'enviada') L.push([new Date(Date.now() + 5 * 864e5).toISOString(), 'Si el chat sigue quieto 5 días con el machote enviado, te pregunto «¿la cierro?»', true]);
    if (c.estado === 'abierto' && !c.machote_id) L.push([new Date(new Date(c.ultima_actividad_at).getTime() + 30 * 864e5).toISOString(), 'Sin machote nunca se cierra por tiempo: a los 30 días quieta se archiva', true]);
    return L.filter(function (x) { return x[0]; }).sort(function (a, b) { return new Date(a[0]) - new Date(b[0]); }).map(function (x) { return [f(x[0]), x[1], x[2]]; });
  }
  async function verAprendio() {
    modal('<h3>Lo que aprendió</h3><p class="sub">Cargando…</p>');
    var r = await C.aprendio(); if (!r.ok) { cerrarModal(); return aviso(r); }
    var A = r.aprendizaje && r.aprendizaje.resumen;
    if (!A) return modal('<h3>Lo que aprendió</h3><p class="sub">El motor todavía no ha mandado lo aprendido. Aparece con la primera respuesta.</p><div class="acc der"><button class="boton si" data-cierra>Listo</button></div>');
    var grupos = [['reglas', 'Reglas', A.reglas], ['observaciones', 'Observaciones', A.observaciones], ['en_disputa', 'En disputa', A.en_disputa],
                  ['superadas', 'Superadas', A.superadas], ['cuarentena', 'Cuarentena', A.cuarentena]];
    var sel = 'reglas';
    var pinta = function () {
      var g = grupos.filter(function (x) { return x[0] === sel; })[0], items = g[2] || [];
      modal('<h3>Lo que aprendió</h3><p class="sub">Regla = 3 casos a favor y lo que va en contra menos de la mitad. Actualizado ' + esc(diaDe(r.aprendizaje.created_at)) + '.</p>' +
        (A.examen ? '<p class="nota">Examen a ciegas: ' + esc(A.examen.ultima) + '/100 · promedio ' + esc(A.examen.promedio) + '</p>' : '') +
        '<div class="filtros">' + grupos.map(function (x) { return '<button data-g="' + x[0] + '" class="' + (x[0] === sel ? 'on' : '') + '">' + x[1] + ' <b>' + (x[2] || []).length + '</b></button>'; }).join('') + '</div>' +
        (items.length ? items.map(function (i) { return '<div class="lec">' + md(i.texto || '') + '<div class="org">' + (i.conteo ? i.conteo + ' casos' + (i.en_contra ? ' · ' + i.en_contra + ' en contra' : '') + ' · ' : '') +
          esc(i.alcance || '') + (i.especialidad ? ' · ' + esc(i.especialidad) : '') + (i.razon ? ' · ' + esc(i.razon) : '') + '</div></div>'; }).join('') : '<p class="vacio">Nada aquí.</p>') +
        '<div class="acc der"><button class="boton si" data-cierra>Listo</button></div>');
      $$('.hoja [data-g]').forEach(function (b) { b.onclick = function () { sel = b.dataset.g; pinta(); }; });
    };
    pinta();
  }
  function modal(html, oscuro) {
    var m = $('#modal'); m.className = 'modal on' + (oscuro ? ' oscuro' : ''); m.innerHTML = '<div class="hoja">' + html + '</div>';
    $$('[data-cierra]', m).forEach(function (b) { b.onclick = cerrarModal; });
    m.onclick = function (e) { if (e.target === m) cerrarModal(); };
  }
  function cerrarModal() { var m = $('#modal'); m.className = 'modal'; m.innerHTML = ''; }

  // ── datos y sondeo ─────────────────────────────────────────────────────
  function guardarSel() { try { sessionStorage.setItem('cz_sel', JSON.stringify(ST.sel)); } catch (e) {} }
  async function cargarCasos() { var r = await C.casos(); if (r.ok) { ST.casos = r.casos || []; ST.motor = r.motor; } return r; }
  async function cargarHilo() {
    var s = ST.sel || {};
    if (!s.id && s.local) { var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0]; if (l && l.caso_id) { s.id = l.caso_id; guardarSel(); } }
    if (!s.id) { ST.hilo = null; pintarChat(); return; }
    var r = await C.hilo(s.id); if (!r.ok) { aviso(r); return; }
    if ((ST.sel || {}).id !== s.id) return;
    ST.motor = r.motor;
    var n = (r.hilo.mensajes || []).filter(function (m) { return m.rol !== 'usuario' && m.autor !== 'acuse'; }).length;
    if (ST.vistos && ST.vistos.id === s.id && n > ST.vistos.n) avisarLlegada();
    ST.vistos = { id: s.id, n: n };
    ST.hilo = r.hilo; pintarChat();
    // Recién mandado: si el motor ya tiene trabajo, la siguiente consulta no espera los 20 s.
    if (enCurso() && ST.sondeoMs > 2500) sondear();
  }
  async function refrescarSalida() {
    ST.salida = await Q.salida(); ST.locales = await Q.casosLocales();
    var s = ST.sel || {};
    if (s.local && !s.id) {
      // La sesión creada sin señal ya tiene id en el servidor: desde aquí se lee de allá.
      var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0];
      if (l && l.caso_id) { s.id = l.caso_id; guardarSel(); cargarCasos().then(pintarLista); cargarHilo(); }
    }
    if ($('#app').classList.contains('ver-chat')) pintarChat();
    pintarLista();
  }
  function avisarLlegada() {
    toast('Llegó la respuesta del conceptualizador.');
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
    try { if (document.hidden && G.Notification && Notification.permission === 'granted') new Notification('Conceptualizador', { body: 'Llegó la respuesta.' }); } catch (e) {}
  }
  function enCurso() { return ST.hilo && (ST.hilo.trabajos || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; }); }
  /** Consulta sola: cada 2.5 s mientras el motor trabaja (se ve el paso), cada 20 s si no. */
  function sondear(ya) {
    clearTimeout(ST.sondeo);
    ST.sondeoMs = ya ? 1200 : (enCurso() ? 2500 : 20000);
    ST.sondeo = setTimeout(async function () {
      if (!document.hidden) {
        await cargarCasos(); pintarLista();
        if (ST.sel) await cargarHilo();
      }
      sondear();
    }, ST.sondeoMs);
  }
  async function abrir(sel) {
    if (!ST.sel || ST.sel.id !== sel.id || ST.sel.local !== sel.local) pararVoz();
    ST.sel = sel; guardarSel(); ST.hilo = null; ST.vistos = null; ST.bandeja = []; ST.irAbajo = true;
    $('#app').classList.remove('en-menu'); $('#app').classList.add('ver-chat'); pintarLista(); pintarChat(); pintarComposer();
    await cargarHilo(); sondear();
    try { if (G.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }

  G.CzApp = { VERSION: VERSION, arrancar: async function () {
    if (G.__ftsSinAcceso) return;
    $('#lArch').insertAdjacentHTML('afterbegin', ico('clip')); $('#lCam').insertAdjacentHTML('afterbegin', ico('camara'));
    $('#in').oninput = function () { autoAlto(); pintarComposer(); };
    $('#in').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && innerWidth >= 900) { e.preventDefault(); enviar(); } };
    $('#bEnviar').onclick = enviar;
    $('#fArch').onchange = function () { agregarArchivos(this.files); this.value = ''; };
    $('#fCam').onchange = function () { agregarArchivos(this.files); this.value = ''; };
    G.addEventListener('online', function () { pintarSenal(); pintarCabecera(); });
    G.addEventListener('offline', function () { pintarSenal(); pintarCabecera(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sondear(true); });
    Q.oir(function (e) { refrescarSalida(); if (e && e.enviado) cargarHilo(); });
    await Q.iniciar();
    ST.locales = await Q.casosLocales(); ST.salida = await Q.salida();
    pintarLista(); pintarComposer();
    await cargarCasos(); pintarLista();
    if (ST.sel) abrir(ST.sel);
    sondear();
  }, _st: ST };
})(window);
