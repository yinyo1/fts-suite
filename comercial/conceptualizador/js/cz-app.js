/* ═══ Conceptualizador · pantalla tipo WhatsApp ═══
 *
 * V1.35 · «Hay versión nueva · Actualizar» (cz-version.js): compara VERSION con version.json y recarga sin
 *   perder lo pendiente (la cola vive en IndexedDB). Nada más cambia en este archivo.
 * V1.34 · ciudad del proyecto (D89, migración 0007; cz-ciudad.js): selector con buscador en el menú de la
 * sesión nueva, prellenado por ubicación (en el teléfono, sin mandar coordenadas) o zona horaria; proyecto
 * y persona aparte; encabezado «empresa · moneda · ciudad», «Ciudad del proyecto» en ⋮ y la franja
 * «¿El proyecto es en X? Sí · Cambiar». Conjeturas y conceptos sin ✕: «✓ Va» / «✎ Corregir» (la corrección
 * de un concepto viaja en el lote como `aceptar` + `datos.corregido`). «¿Qué me falta?» en acompañamiento.
 * Con un servidor sin la 0007, los modos nuevos regresan MODO_DESCONOCIDO y la pantalla lo dice en una línea.
 *
 * V1.32 · lo del prototipo aprobado (fts-conceptualizador prototipos/chat-v3.html, #4, puntos 3 a 9
 * y el ajuste del visto bueno): palomeada en lote con «Listo, sigue», botones que dicen «enviando…»
 * hasta que el servidor contesta, corregir y rechazar debajo del renglón y con voz, el registro de
 * pasos del motor, ir hasta abajo sin arrastrar, empresa y moneda, «Es una prueba», crear machote y
 * el editor de siempre en ventana, la ficha, la vista en página con versiones; la grabadora igual a
 * WhatsApp (cz-grabadora.js), lo que se manda sin señal dice «pendiente de enviar», el visor de
 * fotos, «Archivos, enlaces y docs.», bajar todo y exportar el chat (cz-archivos.js).
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
  var VERSION = 'V1.37';
  /* V1.32 (0006) · empresa y moneda de la sesión: la base acepta estas tres claves. */
  var EMPRESAS = { mx_mxn: { n: 'FTS México · MXN', s: 'Empresa 1 · pesos', id: 1, m: 'MXN', pais: 'mx' },
                   mx_usd: { n: 'FTS México · USD', s: 'Empresa 1 · dólares', id: 1, m: 'USD', pais: 'mx' },
                   usa_usd: { n: 'FTS USA · USD', s: 'Empresa 6 · dólares', id: 6, m: 'USD', pais: 'usa' } };
  function claveEmpresa(c) { if (!c) return null; var m = c.moneda || 'MXN';
    return Number(c.empresa_id) === 6 ? 'usa_usd' : m === 'USD' ? 'mx_usd' : (c.empresa_id || c.moneda || c.pais === 'mx' ? 'mx_mxn' : null); }
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
  var C = G.CzCliente, Q = G.CzCola, Me = G.CzMedios, GR = G.CzGrabadora, AR = G.CzArchivos, CI = G.CzCiudad;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ST = { sel: null, casos: [], locales: [], salida: [], hilo: null, motor: null, filtro: 'vivas', aprendio: null,
             urls: {}, cargando: {}, bandeja: [], rec: null, sondeo: null, vistos: null, decidiendo: {},
             // V1.31
             usuario: 'todos', archivadas: false, busca: null, player: null, rate: 1,
             // V1.32
             empresa: 'mx_mxn', borr: {}, env: {}, errBt: {}, listo: false, pasos: {}, abiertoReg: null, abajoN: 0,
             nMotor: null, panel: null,
             // V1.34 · ciudad: lo que el teléfono dedujo (geo) y la del proyecto elegida en el menú (ciuNueva)
             geo: null, ciuNueva: null, qf: null };
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
    abajo: '<path d="M7 10l5 5 5-5"/>',
    abajo2: '<path d="M7 6l5 5 5-5"/><path d="M7 12l5 5 5-5"/>',
    ficha: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    empresa: '<path d="M4 20V6l8-3 8 3v14"/><path d="M9 20v-5h6v5"/><path d="M8 9h1M15 9h1M8 12h1M15 12h1"/>',
    prueba: '<path d="M9 3h6"/><path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/>',
    pagina: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    docs: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
    bajar: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/>',
    exportar: '<path d="M12 15V4"/><path d="M7 8.5l5-5 5 5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    flecha: '<path d="M7 10l5 5 5-5"/>',
    // V1.34
    mapa: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    falta: '<path d="M10 6.5h10M10 12h10M10 17.5h6"/><path d="M3.5 6.5l1.5 1.5 2.5-3"/><path d="M3.5 12l1.5 1.5 2.5-3"/><circle cx="5.2" cy="17.5" r="1.4"/>'
  };
  var GIRO = '<span class="giro" aria-hidden="true"></span>';
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
    r.error === 'MODO_DESCONOCIDO' ? 'Esto se activa cuando se actualice el servidor.' : (r.mensaje || ('No se pudo: ' + (r.error || 'error')))); }
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
        (c.demo ? '<span class="chip-prueba">PRUEBA</span>' : '') +
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
  /** V1.30 · la sesión nueva empieza en el chat con dos opciones (V1.32.1 quitó «Seguir una cotización»: la lista ya lo hace). */
  function abrirMenu() {
    ST.sel = { menu: true }; ST.hilo = null; ST.bandeja = []; ST.pais = ST.pais || 'mx'; ST.ciuNueva = null;
    $('#app').classList.add('ver-chat'); $('#app').classList.add('en-menu'); pintarLista(); pintarChat();
    // V1.34 (D89) · prellenar la ciudad: ubicación con permiso (→ ciudad más cercana de la lista, en el teléfono)
    // o la zona horaria. Nunca bloquea: el menú ya se ve y se puede elegir mientras tanto.
    if (!ST.geo) {
      ST.geo = { estado: 'buscando', persona: null };
      CI.detectar().then(function (g) { ST.geo = g; if ((ST.sel || {}).menu) pintarMenu(); });
    }
  }
  /** La ciudad del proyecto del menú: la elegida, o la prellenada (de la persona) sin confirmar. */
  function ciudadMenu() {
    if (ST.ciuNueva) return ST.ciuNueva;
    var p = ST.geo && ST.geo.persona; return p ? Object.assign({}, p) : null;
  }
  function lineaGeo() {
    var g = ST.geo || {}, p = g.persona;
    var t = g.estado === 'buscando' ? 'Buscando tu ciudad…' :
      g.estado === 'ubicacion' ? 'Estás en <b>' + esc(CI.nombre(p)) + '</b> (ubicación del teléfono). Solo guardo ciudad y estado, nunca coordenadas.' :
      g.estado === 'zona' ? 'Sin permiso de ubicación: tomé <b>' + esc(CI.nombre(p)) + '</b> por la zona horaria del teléfono. Cámbiala si no es.' :
      g.estado === 'lejos' ? 'Tu ubicación no cae cerca de ninguna ciudad de la lista: elige «Otra» y escríbela. No guardo coordenadas.' :
      'No supe dónde estás. Elige la ciudad o déjala: te la pregunto antes de buscar precios.';
    return '<p class="nota geo">' + ico('mapa', 'xs') + '<span>' + t + '</span></p>';
  }
  function pintarMenu() {
    pintarCabecera(); $('#senal').style.display = 'none'; $('#fijo').style.display = 'none'; pintarFranja();
    var cm = ciudadMenu(), pre = cm && cm.fuente !== 'elegida';
    $('#msgs').innerHTML = '<div class="fila el sig"><div class="b el"><div class="quien">Conceptualizador</div><div class="txt">¿Qué vamos a hacer?</div>' +
      '<p class="nota">Primero, ¿a nombre de qué empresa y en qué moneda?</p><div class="emp-sel">' + selEmpresa(ST.empresa) + '</div>' +
      '<p class="nota"><b>¿Dónde es el proyecto?</b></p>' +
      '<button type="button" class="cd-pick" id="bCiudadIni">' + ico('mapa', 's') + '<span class="cd-t">' + (cm ? esc(CI.nombre(cm)) : 'Elegir ciudad') +
        (pre ? '<span class="cd-pre">prellenada</span>' : '') +
        '<small>' + (!cm ? 'De aquí sale la procura: tiendas, flete y viáticos' : pre ? (cm.fuente === 'ubicacion' ? 'por tu ubicación' : 'por la zona horaria') + ' · cámbiala si el proyecto es en otra' : 'elegida por ti · toca para cambiar') + '</small></span>' + ico('flecha', 's') + '</button>' +
      lineaGeo() +
      '<div class="opciones">' +
      '<button class="opc" data-modo="acompanamiento"><b>1 · Voy a hacer un levantamiento</b><small>Te acompaño en planta: te pido fotos, la ruta, medidas y acceso según el trabajo.</small></button>' +
      '<button class="opc" data-modo="levantamiento"><b>2 · Ya tengo el levantamiento</b><small>Me mandas todo (fotos, audios, PDFs, notas) y al final tocas «Ya es todo».</small></button></div>' +
      '<p class="nota">Empresa y ciudad se cambian después desde&nbsp;⋮.</p></div></div>';
    $$('#msgs [data-emp]').forEach(function (b) { b.onclick = function () { ST.empresa = b.dataset.emp; pintarMenu(); }; });
    $('#bCiudadIni').onclick = function () { dlgCiudad(ciudadMenu(), function (x) { ST.ciuNueva = Object.assign({ fuente: 'elegida' }, x); pintarMenu(); }); };
    $$('#msgs [data-modo]').forEach(function (b) { b.onclick = async function () {
      var m = b.dataset.modo, cp = ciudadMenu(), per = ST.geo && ST.geo.persona;
      b.disabled = true;
      // Persona ≠ proyecto: cada una con su fuente. Solo ciudad, estado y país; nunca coordenadas.
      var c = await Q.nuevaSesion({ titulo: MODOS[m].titulo, pais: EMPRESAS[ST.empresa].pais, modo: m, empresa: ST.empresa,
        proyecto: cp ? { ciudad: cp.c, estado: cp.e || '', pais: cp.pais === 'US' ? 'US' : 'MX', fuente: cp.fuente || 'elegida' } : null,
        persona: per ? { ciudad: per.c, estado: per.e || '', fuente: per.fuente } : null });
      ST.locales = await Q.casosLocales(); $('#app').classList.remove('en-menu'); abrir({ local: c.local_id });
    }; });
  }
  /** V1.34 · selector de ciudad con buscador: la lista de D89 y «Otra» (texto libre). `alElegir({c,e,pais})`. */
  function dlgCiudad(actual, alElegir, titulo) {
    var lista = function (f) {
      f = CI.sinAcento(f);
      return CI.CIUDADES.map(function (gr) {
        var L = gr.L.filter(function (x) { return !f || CI.sinAcento(x[0] + ' ' + x[1]).indexOf(f) >= 0; });
        if (!L.length) return '';
        return '<div class="cd-g">' + esc(gr.g) + '</div>' + L.map(function (x) {
          var on = actual && actual.c === x[0];
          return '<button type="button" class="cd-op' + (on ? ' on' : '') + '" data-ciudad="' + esc(x[0]) + '"><span>' + esc(x[0]) + '</span><small>' + esc(x[1]) + (on ? ' ✓' : '') + '</small></button>';
        }).join('');
      }).join('') + '<button type="button" class="cd-op otra" data-ciudad="otra"><span>Otra…</span><small>escribe ciudad y estado</small></button>';
    };
    var v = velo('<div class="dlg cd-dlg" role="dialog" aria-label="Ciudad del proyecto"><h3>' + esc(titulo || 'Ciudad del proyecto') + '</h3>' +
      '<p>De aquí sale la procura: tienda o sucursal con existencia en esta ciudad, distribuidores de la zona, flete si el material está en otra, y viáticos.</p>' +
      '<label class="cd-busca">' + ico('buscar', 's') + '<input id="cdQ" placeholder="Busca la ciudad" autocomplete="off" aria-label="Buscar ciudad"></label>' +
      '<div class="cd-lista" id="cdL">' + lista('') + '</div>' +
      '<div class="cd-otra" id="cdO" hidden><input id="cdT" maxlength="90" placeholder="Ciudad, estado (ej. Reynosa, Tamps.)" aria-label="Ciudad y estado">' +
        '<div class="cd-pais"><button type="button" data-cp="MX" class="on">México</button><button type="button" data-cp="US">USA</button></div><span class="err-bt" id="cdE"></span></div>' +
      '<div class="acciones"><button id="cdNo">Cancelar</button><button id="cdSi" hidden>Usar esta</button></div></div>', true);
    var pais = EMPRESAS[ST.empresa] && EMPRESAS[ST.empresa].pais === 'usa' ? 'US' : 'MX';
    var marcaPais = function () { $$('[data-cp]', v).forEach(function (b) { b.classList.toggle('on', b.dataset.cp === pais); }); };
    marcaPais();
    var enlaza = function () {
      $$('[data-ciudad]', v).forEach(function (b) { b.onclick = function () {
        if (b.dataset.ciudad === 'otra') { $('#cdO', v).hidden = false; $('#cdSi', v).hidden = false; $('#cdT', v).focus(); return; }
        cerrarVelo(); alElegir(CI.buscar(b.dataset.ciudad));
      }; });
    };
    enlaza();
    $('#cdQ', v).oninput = function () { $('#cdL', v).innerHTML = lista(this.value); enlaza(); };
    $$('[data-cp]', v).forEach(function (b) { b.onclick = function () { pais = b.dataset.cp; marcaPais(); }; });
    var usar = function () {
      var x = CI.deTexto($('#cdT', v).value, pais);
      if (x.error) { $('#cdE', v).textContent = x.error; return; }
      cerrarVelo(); alElegir(x);
    };
    $('#cdSi', v).onclick = usar;
    $('#cdT', v).onkeydown = function (e) { if (e.key === 'Enter') usar(); };
    $('#cdNo', v).onclick = cerrarVelo;
  }
  // ── V1.34 · la ciudad del proyecto en el chat ──────────────────────────
  /** ¿El servidor ya trae la ciudad (0007)? Con uno viejo, la pantalla no inventa nada. */
  function conCiudad(c) { return !!c && Object.prototype.hasOwnProperty.call(c, 'proyecto_ciudad'); }
  function ciudadDe(c) {
    if (!c) return null;
    if (conCiudad(c)) return c.proyecto_ciudad ? { c: c.proyecto_ciudad, e: c.proyecto_estado || '', pais: c.proyecto_pais, confirmada: !!c.proyecto_confirmada_at } : null;
    return c.proyecto ? { c: c.proyecto.ciudad, e: c.proyecto.estado, pais: c.proyecto.pais, confirmada: c.proyecto.fuente === 'elegida' } : null;
  }
  /** Texto de la ciudad para el encabezado: «Monterrey, N.L.», «ciudad por confirmar», o nada (servidor viejo). */
  function ciudadTxt(c) {
    var x = ciudadDe(c);
    if (x) return CI.nombre(x);
    return conCiudad(c) || (c && c.estado === 'local') ? 'ciudad por confirmar' : '';
  }
  function mia(c) { var s = sesionDe(ST.sel) || {}; return s.puede_editar === true || (c && c.autor && c.autor === yo()); }
  /** Franja discreta: «¿El proyecto es en X? Sí · Cambiar» (prellenada sin confirmar) o «Falta la ciudad» (sin ciudad). */
  async function confirmarCiudad() {
    var c = ST.hilo && ST.hilo.caso; if (!c) return;
    ST.env.ciudad = 'confirma'; pintarFranja(); pintarFijo();
    var r = await C.confirmarCiudad(c.id);
    delete ST.env.ciudad;
    if (!r.ok) { pintarFranja(); pintarFijo(); return aviso(r); }
    await refrescarSesiones();
  }
  function cambiarCiudad() {
    var c = ST.hilo && ST.hilo.caso; if (!c) return;
    dlgCiudad(ciudadDe(c), async function (x) {
      ST.env.ciudad = 'cambia'; pintarFranja(); pintarFijo(); toast('Guardando la ciudad del proyecto…');
      var r = await C.ciudad(c.id, { ciudad: x.c, estado: x.e || '', pais: x.pais === 'US' ? 'US' : 'MX' });
      delete ST.env.ciudad;
      if (!r.ok) { pintarFranja(); pintarFijo(); return aviso(r); }
      ST.irAbajo = true; await refrescarSesiones();
      toast('Proyecto en ' + CI.nombre(x) + '.');
    });
  }
  /** «¿Qué me falta?»: un trabajo a demanda; la respuesta llega al chat como cualquier otra. */
  async function queFalta(b) {
    var c = ST.hilo && ST.hilo.caso; if (!c) return;
    if (b) { b.disabled = true; b.dataset.tx = b.innerHTML; b.innerHTML = GIRO + '<span>preguntando…</span>'; }
    var r = await C.queFalta(c.id);
    if (b) { b.disabled = false; b.innerHTML = b.dataset.tx; }
    if (!r.ok) return aviso(r);
    ST.qf = r.trabajo_id || null; ST.irAbajo = true;
    toast('Le pregunté al motor qué falta: contesta aquí en el chat.');
    await cargarHilo(); sondear(true);
  }
  function selEmpresa(sel) {
    return Object.keys(EMPRESAS).map(function (k) { return '<button type="button" data-emp="' + k + '" class="' + (sel === k ? 'on' : '') + '"><span class="rad"></span><span>' +
      esc(EMPRESAS[k].n) + '<small>' + esc(EMPRESAS[k].s) + '</small></span></button>'; }).join('');
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
  /** ¿Se ofrece el disparador («Ya terminé, cotiza» / «Ya es todo»)? Devuelve el modo, o null. */
  function modoDisparo() {
    var m = modoActual(), c = (ST.hilo && ST.hilo.caso) || casoActual() || {};
    var hayMachote = ((ST.hilo && ST.hilo.acciones) || []).some(function (x) { return x.tipo === 'crear_machote'; });
    return m && !(ST.sel || {}).menu && ['abierto', 'local', undefined].indexOf(c.estado) >= 0 && !yaDisparo() && !hayMachote ? m : null;
  }
  /** V1.32.1 (#4 A5, Montalvo lo picó sin querer): el disparador SIEMPRE pide confirmación. */
  function confirmarDisparo(m) {
    // V1.37 · la confirmación de siempre, mostrando lo que falta (decisión de Esteban, #4): lo que se va como supuesto.
    var AV = G.CzAvance, hc = (ST.hilo && ST.hilo.caso) || {}, f = AV ? AV.faltantes(ST.hilo) : null, falta = [];
    if (f && f.total) falta.push(AV.textoFaltantes(f).replace(/^f/, 'F') + ' del levantamiento');
    if (!hc.cliente && !hc.cliente_odoo_id) falta.push('El cliente todavía no se dijo');
    modal('<h3>' + (m === 'acompanamiento' ? '¿Ya terminaste el levantamiento?' : '¿Ya es todo?') + '</h3>' +
      '<p class="sub">Con lo que mandaste armo las preguntas que faltan y la lista de conceptos. Lo que mandes después también entra, en otra vuelta.</p>' +
      (falta.length ? '<div class="falta-disp"><b>Lo que falta</b><ul>' + falta.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<span>Lo que no llegue entra como supuesto en la cotización.' + (hc.id ? ' <button type="button" class="link" id="okFalta">Ver la lista</button>' : '') + '</span></div>' : '') +
      '<div class="acc der"><button class="boton" data-cierra>' + (m === 'acompanamiento' ? 'Sigo levantando' : 'Todavía no') + '</button><button class="boton si" id="okDisparo">' + (m === 'acompanamiento' ? 'Sí, cotiza' : 'Sí, ya es todo') + '</button></div>');
    $('#okDisparo').onclick = function () { this.disabled = true; cerrarModal(); mandar(MODOS[m].boton).then(function () { pintarFijo(); pintarCabecera(); }); };
    if ($('#okFalta')) $('#okFalta').onclick = function () { cerrarModal(); queFalta(this); };
  }
  /* V1.37 · UN botón con el siguiente paso (prototipo aprobado, #4): sale de CzAvance.avance(), con lo que ya
   * está en el hilo. Sustituye a «Todo listo, crear machote», «Abrir · Haz la cotización» y al «Cotiza» del encabezado. */
  function pintarFijo() {
    var el = $('#fijo'), H = ST.hilo, c = (H && H.caso) || casoActual() || {}, md = modoDisparo();
    var abierta = ['abierto', 'enviada'].indexOf(c.estado) >= 0 && !archivada(c);
    // Sin hilo todavía (sesión local recién creada): el disparador de siempre.
    if (!H || !G.CzAvance) {
      if (md) { el.style.display = 'flex'; el.innerHTML = '<button id="bFijo" type="button">' + ico('disparo', 's') + esc(MODOS[md].boton) + '</button>'; $('#bFijo').onclick = function () { confirmarDisparo(md); }; }
      else { el.style.display = 'none'; el.innerHTML = ''; }
      return;
    }
    var sg = abierta && !(ST.sel || {}).menu ? G.CzAvance.avance(H).sig : null;
    if (sg && (sg.acc === 'ciudad' || sg.acc === 'confirma_ciudad') && !mia(c)) sg = null;
    if (!sg) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var e = ST.env.fijo || (ST.env.ciudad ? 'guardando la ciudad…' : null), ic = sg.acc === 'ciudad' || sg.acc === 'confirma_ciudad' ? 'mapa' : sg.acc === 'machote' || sg.acc === 'disparo' ? 'disparo' : 'pagina';
    el.style.display = 'flex';
    el.innerHTML = '<button id="bFijo" type="button" data-fijo="' + esc(sg.acc) + '"' + (sg.espera || e ? ' disabled' : '') + ' class="' + (sg.espera ? 'espera' : '') + '">' +
      (sg.espera || e ? GIRO : ico(ic, 's')) + '<span class="fx">' + esc(e || sg.txt) + '</span></button>';
    var b = $('#bFijo');
    b.onclick = function () {
      if (sg.acc === 'ciudad') return cambiarCiudad();
      if (sg.acc === 'confirma_ciudad') return confirmarCiudad();
      if (sg.acc === 'disparo') return confirmarDisparo(c.modo === 'acompanamiento' ? 'acompanamiento' : 'levantamiento');
      if (sg.acc === 'machote') { ST.env.fijo = /^Actualizar/.test(sg.txt) ? 'actualizando…' : 'creando…'; pintarFijo(); return hacer(sg.id, b).then(function () { delete ST.env.fijo; pintarFijo(); }); }
      if (sg.acc === 'cotiza' || sg.acc === 'mandar') { b.disabled = true; return mandar(sg.acc === 'cotiza' ? 'Haz la cotización' : sg.texto).then(function () { pintarFijo(); }); }
      if (sg.acc === 'ir') {
        var t = sg.a === 'conjetura' ? $('[data-conf]') : sg.a === 'conceptos' ? $('[data-acepta]') : $('.pend-cot');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); var k = t.closest('.carta') || t; k.classList.add('resalta'); setTimeout(function () { k.classList.remove('resalta'); }, 1600); }
      }
    };
  }

  /* V1.37 · la franja de avance, fija bajo el encabezado e igual para todos (prototipo aprobado, #4). Sustituye a la
   * franja de la ciudad de V1.34: la ciudad sin confirmar sale aquí en rojo y el botón de abajo la pide primero. */
  function pintarFranja() {
    var el = $('#avance'), viejo = $('#ciuF'); if (viejo) { viejo.style.display = 'none'; viejo.innerHTML = ''; }
    if (!el) return;
    var H = ST.hilo, c = H && H.caso;
    if (!H || !c || !G.CzAvance || (ST.sel || {}).menu || ['abierto', 'enviada'].indexOf(c.estado) < 0 || archivada(c)) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var AV = G.CzAvance, av = AV.avance(H), a = av.actual, P = AV.PASOS;
    var cnt = a === 0 && av.faltan && av.faltan.total ? 'faltan ' + av.faltan.total : a === 2 && av.conjAb ? av.conjAb + ' abierta' + (av.conjAb === 1 ? '' : 's') :
      a === 3 && av.sinDec ? av.sinDec + ' sin palomear' : (a === 4 || a === 5) && av.pendCot ? av.pendCot + ' pendiente' + (av.pendCot === 1 ? '' : 's') : '';
    var abierto = !!ST.franjaAbierta, x = ciudadDe(c), folio = av.machote && ((av.machote.resultado || {}).folio || c.machote_folio);
    el.style.display = 'block'; el.className = abierto ? 'abierta' : '';
    el.innerHTML = '<button type="button" class="av-top" id="avTop" aria-expanded="' + abierto + '" aria-controls="avPanel"><span class="av-tx"><span class="av-paso">Paso ' + (a + 1) + ' de 7' + (a === 0 && av.faltan && av.faltan.a_medias ? ' · ' + av.faltan.abiertos + ' sin nada · ' + av.faltan.a_medias + ' a medias' : '') + '</span><b>' +
        (av.ciudad ? '' : '<span class="av-rojo">Falta la ciudad</span> · ') + esc(P[a]) + (cnt ? ' · <span class="av-cnt">' + esc(cnt) + '</span>' : '') + '</b></span>' + ico('abajo', 's') + '</button>' +
      '<div class="av-barras" aria-hidden="true">' + av.e.map(function (x) { return '<i class="' + x + '"></i>'; }).join('') + '</div>' +
      '<div class="av-etiq" aria-hidden="true">' + P.map(function (p, i) { return '<span class="' + av.e[i] + '">' + esc(p) + '</span>'; }).join('') + '</div>' +
      '<div class="av-panel" id="avPanel">' +
        (av.ciudad ? '' : '<div class="av-pp falta"><span class="av-pt">!</span><span class="av-px"><b>Ciudad del proyecto' + (x ? ': ' + esc(CI.nombre(x)) + ' (sin confirmar)' : '') + '</b><span>Sin ella no se buscan precios: tiendas, fletes y viáticos se miden contra ella.' +
          (mia(c) ? ' <button type="button" class="link" id="avCiudad">' + (x ? 'Cambiar' : 'Elegir') + '</button>' : '') + '</span></span></div>') +
        P.map(function (p, i) { return '<div class="av-pp ' + av.e[i] + '"><span class="av-pt">' + (av.e[i] === 'hecho' ? '✓' : i + 1) + '</span><span class="av-px"><b>' + esc(p) + '</b><span>' + esc(av.det[i]) +
          (i === 5 && av.machote ? ' <button type="button" class="link" id="avAbrir">Abrir ' + esc(folio || 'machote') + '</button>' : '') + '</span></span></div>'; }).join('') + '</div>';
    $('#avTop').onclick = function () { ST.franjaAbierta = !ST.franjaAbierta; pintarFranja(); };
    if ($('#avCiudad')) $('#avCiudad').onclick = cambiarCiudad;
    if ($('#avAbrir')) $('#avAbrir').onclick = function () { abrirEditor(av.machote); };
  }

  // ── chat ───────────────────────────────────────────────────────────────
  function casoActual() {
    var s = ST.sel || {};
    if (s.menu) return { titulo: 'Nueva cotización', estado: 'menu' };
    if (s.id) return ST.casos.filter(function (c) { return c.id === s.id; })[0] || (ST.hilo && ST.hilo.caso && ST.hilo.caso.id === s.id ? ST.hilo.caso : null);
    var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0];
    return l ? { titulo: l.titulo, cliente: l.cliente, modo: l.modo, estado: 'local', proyecto: l.proyecto || null } : null;
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
      // V1.34: «¿Qué me falta?» lo pidió la persona con un botón: el motor sí va a contestar.
      if (t.estado === 'pendiente' && ST.qf && String(t.id) === String(ST.qf)) return true;
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
    var ke = claveEmpresa((H && H.caso) || c), emp = ke ? EMPRESAS[ke].n + ' · ' : '';
    // V1.34 (D89) · empresa · moneda · ciudad (o «ciudad por confirmar»). Con servidor viejo no se pinta ciudad.
    var cTx = (ST.sel || {}).menu ? '' : ciudadTxt((H && H.caso) || c);
    if (cTx) emp += cTx + ' · ';
    var sub = !navigator.onLine ? 'sin señal · lo que mandes se guarda en el teléfono' :
      emp + (!m ? 'conectando…' : m.modo === 'rapido' ? 'motor rápido · en línea' : 'respaldo · contesta en minutos');
    var t = trabajoQueContesta();
    if (t && navigator.onLine) { sub = 'escribiendo…' + (t.estado === 'tomado' && t.avance ? ' · ' + t.avance : ''); vivo = true; }
    else if (H && H.caso && H.caso.modo === 'levantamiento' && !H.caso.disparado_at && navigator.onLine) {
      var n = notasSinTexto();
      sub = 'guardando tu levantamiento' + (n ? ' · transcribiendo ' + n + ' nota' + (n > 1 ? 's' : '') : '');
    }
    if (c.id && archivada(c)) sub = 'archivada · ' + sub;
    $('#ch').innerHTML = '<button class="btn-ic vuelve" id="bVuelve" aria-label="Volver">' + ico('atras') + '</button>' +
      '<div class="av" style="background:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div>' +
      '<div class="tx"><b><span>' + esc(c.titulo) + '</span>' + (((H && H.caso) || c).demo ? '<span class="chip-prueba" title="No enseña">PRUEBA</span>' : '') +
      '<span class="ver" title="Build del módulo">' + VERSION + '</span></b><small class="' + (vivo ? 'vivo' : '') + '">' + esc(sub) + '</small></div>' +
      // V1.37 · «Ya terminé, cotiza» es el botón del siguiente paso (abajo) y «¿Qué me falta?» vive en ⋮ (decisión de Esteban, #4).
      '<button class="btn-ic" id="bMenu" aria-label="Opciones">' + ico('mas') + '</button>';
    $('#bVuelve').onclick = volverALista;
    $('#bMenu').onclick = function (e) { menuChat(e.currentTarget); };
  }
  /** ⋮ del chat: lo de la sesión (fijar, renombrar, archivar) y, abajo, detalles y lo aprendido. */
  function menuChat(btn) {
    var c = sesionDe(ST.sel) || casoActual() || {};
    var A = accionesDe(c), abierta = c.estado === 'abierto' || c.estado === 'enviada';
    var H = ST.hilo, cs = (H && H.caso) || {}, hayM = !!(cs.machote_id || cs.machote_folio), mia = c.puede_editar === true;
    var md = modoDisparo();
    var cx = ciudadDe(cs.id ? cs : c);
    var V = (md === 'acompanamiento' ? '<button data-a="disparo" class="destaca">' + ico('disparo', 's') + '<span>' + esc(MODOS[md].boton) + '<small>Te pido confirmación antes de mandarlo</small></span></button>' +
      (c.id ? '<button data-a="falta">' + ico('falta', 's') + '<span>¿Qué me falta?<small>Lo que no puede faltar para cotizar este trabajo</small></span></button>' : '') + '<hr>' : '') + (c.id && !(ST.sel || {}).menu ? (
      // V1.34 (D89) · la ciudad del proyecto se cambia aquí (solo quien la abrió o Esteban; la base vuelve a decidir).
      '<button data-a="ciudad"' + (mia ? '' : ' disabled') + '>' + ico('mapa', 's') + '<span>Ciudad del proyecto' + (cx ? ': ' + esc(CI.nombre(cx)) : '') +
        '<small>' + (!mia ? 'Solo quien la abrió o Esteban' : cx ? (cx.confirmada ? 'Cambiarla: tiendas, flete y viáticos se recalculan' : 'Prellenada, sin confirmar · cambiar o confirmar') : 'Por confirmar · elegirla') + '</small></span></button>' +
      '<button data-a="ficha">' + ico('ficha', 's') + '<span>Ficha de la sesión<small>CRM · machote · orden · carpeta</small></span></button>' +
      '<button data-a="empresa"' + (hayM || !mia ? ' disabled' : '') + '>' + ico('empresa', 's') + '<span>Empresa: ' + esc((EMPRESAS[claveEmpresa(cs)] || EMPRESAS.mx_mxn).n) +
        '<small>' + (hayM ? 'Ya hay machote: no se cambia aquí' : !mia ? 'Solo quien la abrió o Esteban' : 'Cambiar mientras no haya machote') + '</small></span></button>' +
      '<button data-a="prueba"' + (mia ? '' : ' disabled') + '>' + ico('prueba', 's') + '<span>' + (cs.demo ? 'Ya no es prueba (sí enseña)' : 'Es una prueba (no enseña)') + '<small>Solo quien la abrió o Esteban</small></span></button>' +
      '<button data-a="pagina">' + ico('pagina', 's') + '<span>Ver en página<small>Lo considerado y el machote, con versiones</small></span></button><hr>' +
      '<button data-a="archivos">' + ico('docs', 's') + '<span>Archivos, enlaces y docs.</span></button>' +
      '<button data-a="multimedia">' + ico('bajar', 's') + '<span>Descargar todo lo multimedia<small>Fotos, audios y PDFs en un ZIP</small></span></button>' +
      '<button data-a="exportar">' + ico('exportar', 's') + '<span>Exportar chat<small>JSON o TXT, con o sin multimedia</small></span></button><hr>') : '');
    var h = V + A.map(function (a) { return '<button data-a="' + a.k + '"' + (a.ok ? '' : ' disabled') + '>' + ico(a.ic, 's') + '<span>' + a.t + a.sub + '</span></button>'; }).join('') +
      (A.length ? '<hr>' : '') +
      ((ST.sel || {}).menu ? '' : '<button data-a="detalles">' + ico('info', 's') + '<span>Detalles y línea de tiempo</span></button>') +
      (abierta && c.id ? '<button data-a="cierre">' + ico('candado', 's') + '<span>Cerrar con /cierre</span></button>' : '') +
      '<button data-a="aprendio">' + ico('libro', 's') + '<span>Lo que aprendió</span></button>';
    var v = enMenu(btn, h);
    $$('[data-a]', v).forEach(function (b) { b.onclick = function () {
      cerrarVelo(); var a = b.dataset.a;
      if (a === 'disparo') return confirmarDisparo(md);
      if (a === 'falta') return queFalta(null);
      if (a === 'ciudad') return cambiarCiudad();
      if (a === 'detalles') return menuSesion();
      if (a === 'aprendio') return verAprendio();
      if (a === 'ficha') return hojaFicha();
      if (a === 'empresa') return dlgEmpresa();
      if (a === 'prueba') return marcarPrueba();
      if (a === 'pagina') return abrirPagina('considerado');
      if (a === 'archivos') return abrirArchivos();
      if (a === 'multimedia') return bajarMultimedia();
      if (a === 'exportar') return dlgExportar();
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
    var M = $('#msgs'), abajo = M.scrollHeight - M.scrollTop - M.clientHeight < 80, H = ST.hilo, arriba0 = M.scrollTop;
    // Lo escrito en una cajita abierta y su cursor sobreviven al repintado (sondeo de 2.5 s).
    var fe = document.activeElement, foco = fe && fe.dataset && fe.dataset.borr ? { k: fe.dataset.borr, a: fe.selectionStart, b: fe.selectionEnd } : null;
    pintarCabecera(); pintarSenal(); pintarFijo(); pintarFranja();
    var modo = modoActual();
    var h = '', ultimoDia = '', prev = null;
    var dia = function (t) { var d = separador(t); if (d && d !== ultimoDia) { ultimoDia = d; h += '<div class="dia"><span>' + esc(d) + '</span></div>'; prev = null; } };
    var aparte = function (html) { h += html; prev = null; };
    // Una burbuja; la primera de cada racha lleva la colita y, si es del motor, quién habla.
    var burbuja = function (lado, cls, quien, cuerpo, id) {
      var sig = prev !== lado; prev = lado;
      h += '<div class="fila ' + lado + (sig ? ' sig' : '') + '"' + (id ? ' data-msg="' + esc(id) + '"' : '') + '><div class="b ' + lado + (cls ? ' ' + cls : '') + '">' +
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
        esc(hora(t)) + tk + '</span><div style="clear:both"></div>', m.id);
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
        x.estado === 'enviando' ? '<span class="pend-env">' + reloj + 'enviando…</span>' :
        '<span class="pend-env" title="Guardado en el teléfono con su hora real; se manda solo al volver la señal">' + reloj + 'pendiente de enviar</span>';
      burbuja('yo', 'pend', '', adjuntosHtml(x.archivos.map(function (a) { return { local: a.local, blob: a.blob, nombre: a.nombre, clase: a.clase, bytes: a.bytes, duracion_s: a.duracion_s, subido: !!a.adjunto_id }; }), true) +
        (x.texto ? '<div class="txt">' + esc(x.texto) + '</div>' : '') +
        (total && x.estado === 'subiendo' ? '<div class="barra"><i style="width:' + Math.round(100 * (subidos + (actual ? Q.progreso(actual.local) : 0)) / total) + '%"></i></div>' : '') +
        '<span class="hora">' + esc(hora(x.escrito_at)) + ' ' + est + '</span><div style="clear:both"></div>' +
        (x.estado === 'error' ? '<div class="corr"><span class="err">' + esc(x.error) + '</span><button class="boton" data-reint="' + esc(x.cliente_id) + '">Reintentar</button><button class="boton" data-desc="' + esc(x.cliente_id) + '">Descartar</button></div>' : ''));
    });
    var RT = ST.retoma;
    if (RT && RT.id === (ST.sel || {}).id && G.CzAvance && G.CzAvance.ultimaActividad(H) === RT.t && !salidaDelCaso().length) {
      dia(new Date().toISOString());
      aparte('<div class="reto" role="status"><div class="rt">' + ico('reloj', 'xs') + 'Retomamos · tu último mensaje fue ' + esc(RT.hace) + '</div>' +
        '<p>Vas en <b>' + esc(RT.vas) + '</b>.</p>' + (RT.falta.length ? '<p>Falta: ' + esc(RT.falta.join(', ')) + '.</p>' : '') +
        (RT.sig ? '<p>Siguiente: <b>' + esc(RT.sig) + '</b> (el botón de abajo).</p>' : '') + '</div>');
    }
    var tq = trabajoQueContesta();
    if (tq) h += escribeHtml(tq);
    // ¿Llegaron respuestas del motor desde el último pintado? Si la persona está leyendo arriba, se cuentan
    // en el botón ⇊ y NO se le arrastra hacia abajo (6b).
    var nMotor = ((H && H.mensajes) || []).filter(function (m) { return m.rol !== 'usuario'; }).length;
    var nuevas = ST.nMotor !== null && ST.nMotorCaso === (ST.sel || {}).id ? Math.max(0, nMotor - ST.nMotor) : 0;
    ST.nMotor = nMotor; ST.nMotorCaso = (ST.sel || {}).id;
    M.innerHTML = h;
    enlazarChat(M);
    if (foco) { var t = $('[data-borr="' + foco.k + '"]'); if (t) { t.focus(); try { t.setSelectionRange(foco.a, foco.b); } catch (e) {} } }
    if (abajo || ST.irAbajo) { M.scrollTop = M.scrollHeight; ST.irAbajo = false; ST.abajoN = 0; }
    else { M.scrollTop = arriba0; ST.abajoN += nuevas; }
    actualizarAbajo();
  }
  /** «escribiendo…» que se despliega con los pasos de ESE trabajo (6a). Los pasos los junta la
   *  pantalla de lo que el motor va publicando (`trabajo.avance`), con sus segundos. */
  function escribeHtml(tq) {
    var P_ = ST.pasos[tq.id] || [], abierto = ST.abiertoReg === tq.id;
    var lista = P_.map(function (x, i) {
      var cur = i === P_.length - 1;
      return '<span class="paso' + (cur ? '' : ' ya') + '"><span class="m">' + (cur ? GIRO : '✓') + '</span><span class="pt-tx">' + esc(x.t) + '</span><span class="t">' + x.s + ' s</span></span>';
    }).join('') || '<span class="paso"><span class="m">' + GIRO + '</span><span class="pt-tx">' + (tq.estado === 'tomado' ? 'empezando' : 'en la cola del motor') + '</span></span>';
    return '<div class="fila el sig"><button type="button" class="escribe-b' + (abierto ? ' abierto' : '') + '" id="bEscribe" aria-expanded="' + abierto + '" aria-label="Ver los pasos del conceptualizador">' +
      '<span class="top"><span class="pts"><i></i><i></i><i></i></span><em>' + esc(tq.estado === 'tomado' && tq.avance ? tq.avance : 'escribiendo…') + '</em><span class="flecha">' + ico('flecha', 's') + '</span></span>' +
      '<span class="pasos">' + lista + '</span></button></div>';
  }
  function registrarPasos(H) {
    ((H && H.trabajos) || []).forEach(function (t) {
      if (t.estado !== 'tomado' || !t.avance) return;
      var L = ST.pasos[t.id] = ST.pasos[t.id] || [], ult = L[L.length - 1];
      if (ult && ult.t === t.avance) return;
      var t0 = new Date(t.tomado_at || t.created_at).getTime(), ta = new Date(t.avance_at || Date.now()).getTime();
      L.push({ t: t.avance, s: Math.max(0, Math.round((ta - t0) / 1000)) });
    });
  }
  function actualizarAbajo() {
    var M = $('#msgs'), b = $('#bAbajo'); if (!M || !b) return;
    var arriba = M.scrollHeight - M.scrollTop - M.clientHeight > 80;
    if (!arriba) ST.abajoN = 0;
    b.classList.toggle('on', arriba);
    var c = $('.compose'), f = $('#fijo'), bj = $('#bandeja');
    b.style.bottom = ((c ? c.offsetHeight : 56) + (f && f.style.display !== 'none' ? f.offsetHeight : 0) + (bj && bj.style.display !== 'none' ? bj.offsetHeight : 0) + 10) + 'px';
    var n = $('#nAbajo'); n.style.display = ST.abajoN ? 'flex' : 'none'; n.textContent = ST.abajoN;
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
      // V1.32 (3) · palomeada en lote: cada clic se guarda, y las decisiones viajan JUNTAS al motor cuando
      // se decide el último o con «Listo, sigue». (4) el botón dice «enviando…» hasta que el servidor contesta;
      // (5) el cuadro de la razón va DEBAJO del renglón, a todo lo ancho, y se puede dictar.
      var faltan = U.conceptos.filter(function (k) { return !decididos[k.id]; }).length, dec = U.conceptos.length - faltan;
      var lotes = (H.eventos || []).filter(function (e) { return e.tipo === 'palomeada' && e.datos && Number(e.datos.propuesta_trabajo_id) === Number(U.trabajo_id); });
      var enLote = lotes.reduce(function (n, e) { return n + ((e.datos.decisiones || []).length); }, 0);
      h += '<div class="carta conceptos"><h4>🧩 Conceptos propuestos' + (faltan ? ' · <span class="gris">' + faltan + ' por decidir</span>' : '') + '</h4>';
      U.conceptos.forEach(function (k) {
        var d = decididos[k.id], kk = 'c:' + k.id, e = ST.env[kk], b = ST.borr[kk] || {};
        // V1.34 · sin ✕: «✓ Va» y «✎ Corregir». Corregir abre la cajita (texto o voz); la corrección viaja en el
        // lote como `aceptar` con su razón y `datos.corregido` (el motor la interpreta: si dice que no va, es rechazo).
        var corr = d && d.tipo === 'aceptar' && d.datos && d.datos.corregido;
        h += '<div class="cn" data-con="' + esc(k.id) + '"><div class="fil"><span class="n">' + esc(k.id) + '</span><div class="d">' + esc(k.concepto) + '<small>origen: ' + esc(k.origen || '') + '</small>' +
          (d && d.razon ? '<small class="' + (corr ? 'corr' : 'mal') + '">' + (corr ? '✎ ' : '') + esc(d.razon) + '</small>' : '') + '</div>' +
          (d ? '<span class="hecho' + (d.tipo === 'rechazar' ? ' mal' : corr ? ' corr' : '') + '">' + (corr ? '✎ corregido' : d.tipo === 'aceptar' ? '✓ va' : 'rechazado') + '</span>' : '') + '</div>' +
          (d || b.abierto ? '' : '<div class="decide">' +
               (e === 'aceptar' ? '<button class="si enviando" disabled aria-label="Enviando">' + GIRO + 'enviando…</button>' : '<button class="si" data-acepta="' + esc(k.id) + '">✓ Va</button>') +
               '<button data-corrige="' + esc(k.id) + '"' + (e ? ' disabled' : '') + '>✎ Corregir</button></div>') +
          (ST.errBt[kk] && !b.abierto ? '<span class="err-bt">' + esc(ST.errBt[kk]) + '</span>' : '') +
          (b.abierto && !d ? cajaRazon(kk, 'Escribe o dicta qué cambia. Si no va, di por qué.', 'Guardar', false) : '') + '</div>';
      });
      if (enLote && !faltan) h += '<div class="pie-lote"><span class="txt-lote">✓ Mandé tus ' + enLote + ' decisiones juntas: armo el BOM.</span></div>';
      else h += '<div class="pie-lote"><span class="txt-lote">' + (enLote ? '✓ Ya mandé ' + enLote + '. ' : '') + (dec ? 'Llevas ' + dec + ' de ' + U.conceptos.length + '. Se mandan juntas cuando decidas el último' : 'Palomea cada uno; las decisiones se mandan juntas al final') + '.</span>' +
        (ST.listo ? '<button class="bt si enviando" id="bListo" disabled aria-busy="true">' + GIRO + 'Enviando…</button>' :
         '<button class="bt si" id="bListo"' + (dec > enLote && faltan ? '' : ' disabled') + '>Listo, sigue' + (faltan && dec ? ' (' + faltan + ' sin decidir)' : '') + '</button>') + '</div>';
      if (ST.errBt.listo) h += '<span class="err-bt">' + esc(ST.errBt.listo) + '</span>';
      h += '</div>';
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
        var te = r.tienda_existencia || r.tienda || '', sin = /sin existencia|solo (hay )?en|otra ciudad/i.test(te);
        h += '<div class="bom"><div><b>' + esc(r.descripcion) + '</b>' + (r.sku ? ' <span class="sku">' + esc(r.sku) + '</span>' : '') + '</div><div>' + esc(r.qty) + ' ' + esc(r.unidad) + ' · ' + esc(r.tipo) + ' · <b>' + dinero(r.importe, r.moneda) + '</b></div>' +
          '<div class="org">' + [r.formula ? esc(r.formula) : '', r.liga && /^https?:/.test(r.liga) ? '<a href="' + esc(r.liga) + '" target="_blank" rel="noopener">' + esc(r.fuente) + '</a>' :
            /pendiente/i.test(r.fuente || '') ? '<b class="mal">' + esc(r.fuente) + '</b>' : esc(r.fuente || 'sin fuente')].filter(Boolean).join(' · ') + '</div>' +
          (te ? '<span class="tienda' + (sin ? ' sin' : '') + '">' + esc(te) + '</span>' : '') + '</div>';
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
        var d = a.datos || {}, r = a.resultado || {}, kk = 'j:' + a.id, e = ST.env[kk], b = ST.borr[kk] || {};
        h += '<div class="preg"><p>' + esc(d.pregunta || a.titulo) + '</p>' + (d.conjetura ? '<div class="conj">Supongo: ' + esc(d.conjetura) + (d.porque ? '<small> · ' + esc(d.porque) + '</small>' : '') + '</div>' : '') +
          (a.estado === 'hecha' ? '<span class="hecho">✓ Confirmado</span>' : a.estado === 'descartada' ? '<span class="hecho corr">✎ Corregido: ' + esc(r.correccion || '') + '</span>' :
           b.abierto ? cajaRazon(kk, '¿Qué es lo correcto?', 'Mandar', false) :
           '<div class="acc" data-acc="' + a.id + '">' + (e === 'confirma' ? '<button class="si enviando" disabled>' + GIRO + 'enviando…</button>' : '<button class="si" data-conf="' + a.id + '">✓ Va</button>') +
           '<button data-corr="' + a.id + '"' + (e ? ' disabled' : '') + '>✎ Corregir</button></div>' + (ST.errBt[kk] ? '<span class="err-bt">' + esc(ST.errBt[kk]) + '</span>' : '')) + '</div>';
      });
      h += (pend ? '<p class="nota">Cuando contestes todas, sigo con los conceptos.</p>' : '') + '</div>';
    }
    // Un machote o un borrador con suposiciones sin contestar saldría con números viejos.
    var pendientes = ((ST.hilo && ST.hilo.acciones) || []).some(function (x) { return x.tipo === 'conjetura' && x.estado === 'propuesta'; });
    // V1.36 · solo el machote más nuevo dice lo que falta: el de antes de actualizar ya no cuenta.
    var ultimoCm = (((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado !== 'descartada'; }).pop() || {}).id;
    otras.forEach(function (a) {
      var d = a.datos || {}, r = a.resultado || {}, manejador = G.CzAcciones && G.CzAcciones[a.tipo];
      var espera = pendientes && (a.tipo === 'crear_machote' || a.tipo === 'crear_borrador');
      h += '<div class="carta"><h4>' + ({ alta_contacto: '👤', crear_machote: '📐', crear_borrador: '🧾', enviada: '📨', cerrar: '🔒' }[a.tipo] || '•') + ' ' + esc(a.titulo) + '</h4>' +
        (d.detalle ? '<div class="odoo">' + md(d.detalle) + '</div>' : '') +
        // V1.36 · lo que falta para cotizar en Odoo, con su número y renglón por renglón.
        (a.tipo === 'crear_machote' && Number(d.n_pendientes) > 0 && a.estado !== 'descartada' && a.id === ultimoCm ? '<div class="pend-cot"><b>' + esc(G.CzAcciones.textoPendientes({ n: Number(d.n_pendientes), lista: d.pendientes || [] })) + '</b>' +
          '<ul>' + (d.pendientes || []).map(function (hh) { return (hh.items && hh.items.length ? hh.items : [hh.titulo]).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join(''); }).join('') + '</ul>' +
          '<span class="nota">El machote sí se crea: esos renglones van sin precio y marcados. Nunca se estima un precio.</span></div>' : '') +
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
    $$('[data-acepta]', M).forEach(function (b) { b.onclick = function () { decidirConcepto(b.dataset.acepta, 'aceptar'); }; });
    $$('[data-corrige]', M).forEach(function (b) { b.onclick = function () { abrirCaja('c:' + b.dataset.corrige); }; });
    $$('[data-conf]', M).forEach(function (b) { b.onclick = function () { responder('j:' + b.dataset.conf, b.dataset.conf, 'hecha', { confirma: true }, 'confirma'); }; });
    $$('[data-corr]', M).forEach(function (b) { b.onclick = function () { abrirCaja('j:' + b.dataset.corr); }; });
    $$('[data-borr]', M).forEach(function (t) { t.oninput = function () { (ST.borr[t.dataset.borr] = ST.borr[t.dataset.borr] || { abierto: true }).texto = t.value; }; });
    $$('[data-cancela]', M).forEach(function (b) { b.onclick = function () { var k = b.dataset.cancela; if (GR.activa('d-' + k)) GR.basura('d-' + k); delete ST.borr[k]; delete ST.errBt[k]; pintarChat(); }; });
    $$('[data-manda]', M).forEach(function (b) { b.onclick = function () { mandarCaja(b.dataset.manda); }; });
    $$('[data-dicta]', M).forEach(function (b) { b.onclick = function () { dictar(b.dataset.dicta); }; });
    GR.enlazar(M);
    var bl = $('#bListo', M); if (bl) bl.onclick = listoSigue;
    var be = $('#bEscribe', M); if (be) be.onclick = function () { var tq = trabajoQueContesta(); ST.abiertoReg = ST.abiertoReg === (tq && tq.id) ? null : (tq && tq.id); pintarChat(); };
    $$('[data-hacer]', M).forEach(function (b) { b.onclick = function () { hacer(b.dataset.hacer, b); }; });
    $$('[data-pdf]', M).forEach(function (b) { b.onclick = verPdf; });
    $$('[data-copia]', M).forEach(function (b) { b.onclick = function () { copiar(b.closest('.carta').querySelector('textarea.copia').value, b); }; });
    $$('[data-descartar]', M).forEach(function (b) { b.onclick = function () { resolver(b.dataset.descartar, 'descartada', {}, b); }; });
  }
  // ── V1.32 · cajita de corregir / rechazar: debajo del renglón, con su borrador en el estado ──
  function cajaRazon(k, etiqueta, boton, rechazo) {
    var b = ST.borr[k] || {}, g = GR.activa('d-' + k), e = ST.env[k];
    var est = b.transcribiendo ? GIRO + 'subiendo y transcribiendo tu nota…' :
      b.guardada ? '🕓 Sin señal: tu nota quedó guardada en el teléfono. Se transcribe y llena el campo sola cuando vuelva la señal.' :
      b.err ? '<span class="mal">' + esc(b.err) + '</span>' : '';
    return '<div class="caja-razon" data-caja="' + esc(k) + '"><label for="t-' + esc(k) + '">' + esc(etiqueta) + '</label><div class="lin">' +
      (g ? GR.html('d-' + k) :
       '<textarea id="t-' + esc(k) + '" rows="2" data-borr="' + esc(k) + '" placeholder="Escribe o dicta">' + esc(b.texto || '') + '</textarea>' +
       '<button type="button" class="mic-dict" data-dicta="' + esc(k) + '" aria-label="Dictar">' + ico('mic', 's') + '</button>') + '</div>' +
      '<div class="estado">' + est + '</div><div class="acc-r"><button type="button" class="bt" data-cancela="' + esc(k) + '">Cancelar</button>' +
      '<button type="button" class="bt ' + (rechazo ? 'no' : 'si') + (e ? ' enviando' : '') + '" data-manda="' + esc(k) + '"' + (e || g ? ' disabled' : '') + '>' + (e ? GIRO + 'enviando…' : esc(boton)) + '</button></div>' +
      (ST.errBt[k] ? '<span class="err-bt">' + esc(ST.errBt[k]) + '</span>' : '') + '</div>';
  }
  function abrirCaja(k) { ST.borr[k] = ST.borr[k] || { abierto: true, texto: '' }; ST.borr[k].abierto = true; delete ST.errBt[k]; pintarChat(); var t = $('[data-borr="' + k + '"]'); if (t) t.focus(); }
  function sinSenal(r) { return r && r.clase === 'red' ? 'Sin señal: no se mandó. Toca otra vez.' : (r && (r.mensaje || r.error)) || 'No se pudo.'; }
  function mandarCaja(k) {
    var b = ST.borr[k] || {}, txt = String(b.texto || '').trim();
    if (txt.length < 3) { b.err = 'Escribe o dicta ' + (k.indexOf('c:') === 0 ? 'qué cambia' : 'lo correcto') + ' (3 letras mínimo).'; return pintarChat(); }
    if (k.indexOf('c:') === 0) return decidirConcepto(k.slice(2), 'aceptar', txt, { corregido: true });
    return responder(k, k.slice(2), 'descartada', { correccion: txt }, 'corrige');
  }
  /** Confirmar o corregir una conjetura: el botón dice «enviando…» hasta que el servidor contesta. */
  async function responder(k, id, decision, resultado, que) {
    ST.env[k] = que; delete ST.errBt[k]; pintarChat();
    var r = await C.accion({ accion_id: String(id), decision: decision, resultado: resultado });
    delete ST.env[k];
    if (!r.ok) { ST.errBt[k] = sinSenal(r); pintarChat(); return false; }
    delete ST.borr[k]; await cargarHilo(); return true;
  }
  async function listoSigue() {
    ST.listo = true; delete ST.errBt.listo; pintarChat();
    var r = await C.palomeadaLista(ST.hilo.caso.id);
    ST.listo = false;
    if (!r.ok) { ST.errBt.listo = sinSenal(r); pintarChat(); return; }
    ST.irAbajo = true; await cargarHilo();
  }
  // Dictar: la misma grabadora que la caja principal, en chiquito. Se sube como nota del caso; el motor
  // la transcribe (whisper, en cuanto llega) y el texto llena el campo. Sin señal se queda en el teléfono.
  function dictar(k) {
    var b = ST.borr[k] = ST.borr[k] || { abierto: true, texto: '' }; b.err = null;
    if (!GR.puede()) { b.err = 'Este navegador no deja grabar: escríbelo.'; return pintarChat(); }
    GR.iniciar('d-' + k, { chico: true, etiquetaEnviar: 'Terminar y transcribir', alCambiar: function () { pintarChat(); },
      alTerminar: function (nota) {
        if (!nota || nota.duracion_s < 1) { b.err = 'Muy corta: mantén grabando al menos un segundo.'; return pintarChat(); }
        return subirDictado(k, nota);
      } }).catch(function (e) { b.err = e && e.name === 'NotAllowedError' ? 'Da permiso al micrófono para dictar.' : 'No se pudo grabar: ' + (e.message || e); pintarChat(); });
  }
  async function subirDictado(k, nota) {
    var b = ST.borr[k] = ST.borr[k] || { abierto: true, texto: '' }, caso = ST.hilo && ST.hilo.caso && ST.hilo.caso.id;
    var guardar = async function () { await Q.guardarDictado({ k: k, caso_id: caso, nota: nota }); b.guardada = true; b.transcribiendo = false; pintarChat(); };
    if (!navigator.onLine || !caso) return guardar();
    b.guardada = false; b.transcribiendo = true; pintarChat();
    var r = await C.subir({ caso_id: caso, archivo: nota.nombre, mime: nota.mime, clase: 'audio', sha256: await Me.sha256(nota.blob),
      duracion_s: nota.duracion_s, escrito_at: String(nota.escrito_at || Date.now()), b64: await Me.base64(nota.blob) });
    if (!r.ok) { if (r.clase === 'red') return guardar(); b.transcribiendo = false; b.err = sinSenal(r); return pintarChat(); }
    await Q.quitarDictado(k);
    b.adjunto = r.adjunto_id; b.desde = Date.now(); pintarChat(); sondear(true);
  }
  /** En cada lectura del hilo: ¿ya llegó la transcripción de un dictado? ¿hay dictados guardados sin señal? */
  function revisarDictados() {
    var meta = adjuntosPorId();
    Object.keys(ST.borr).forEach(function (k) {
      var b = ST.borr[k]; if (!b.adjunto) return;
      var a = meta[b.adjunto];
      if (a && a.transcripcion) { b.texto = (b.texto ? b.texto.replace(/\s+$/, '') + ' ' : '') + a.transcripcion.trim(); b.transcribiendo = false; delete b.adjunto; }
      else if (Date.now() - b.desde > 120000 && !b.tarda) { b.tarda = true; b.err = 'La transcripción está tardando: puedes escribirlo mientras.'; }
    });
    if (!navigator.onLine || !ST.hilo) return;
    Q.dictados().then(function (L) { L.filter(function (d) { return d.caso_id === ST.hilo.caso.id && !ST.subiendoDictado; }).forEach(function (d) {
      ST.subiendoDictado = true; ST.borr[d.k] = ST.borr[d.k] || { abierto: true, texto: '' };
      subirDictado(d.k, d.nota).then(function () { ST.subiendoDictado = false; }); }); });
  }
  function pedirTexto(lugar, ph, boton, fn) {
    var d = document.createElement('div'); d.className = 'corr';
    d.innerHTML = '<input placeholder="' + esc(ph) + '"><button class="boton si">' + esc(boton) + '</button>';
    lugar.replaceWith(d); var i = d.querySelector('input'); i.focus();
    var ir = async function () { var v = i.value.trim(); if (v.length < 2) return toast('Escribe la razón o lo correcto.'); d.querySelector('button').disabled = true;
      var ok = await fn(v); if (!ok) d.querySelector('button').disabled = false; };
    d.querySelector('button').onclick = ir; i.onkeydown = function (e) { if (e.key === 'Enter') ir(); };
  }
  async function decidirConcepto(id, tipo, razon, extra) {
    var U = ST.hilo && (ST.hilo.propuesta || ST.hilo.ultima), k = U && (U.conceptos || []).filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var kk = 'c:' + id;
    ST.env[kk] = tipo; delete ST.errBt[kk]; pintarChat();
    var r = await C.evento({ caso_id: ST.hilo.caso.id, tipo: tipo, concepto: k.id, razon: razon || '', datos: Object.assign({ concepto: k.concepto, origen: k.origen }, extra || {}) });
    delete ST.env[kk];
    if (!r.ok) { ST.errBt[kk] = sinSenal(r); pintarChat(); return false; }
    delete ST.borr[kk];
    if (r.trabajo_id) ST.irAbajo = true;     // el último decidió el lote: el motor arma el BOM
    await cargarHilo(); return true;
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
    var H = ST.hilo, U = respConBom(H), E = U && U.machote && U.machote.entrega; if (!E) return;
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
  /** V1.32 (4) · el ORIGINAL de un adjunto como Blob (lo que está en la base, no una miniatura). */
  async function blobDe(k) {
    var u = await cargarUrl(k); if (!u) return null;
    try { return await (await fetch(u)).blob(); } catch (e) { return null; }
  }
  function nombreDe(k) {
    if (ST.nombres && ST.nombres[k]) return ST.nombres[k];
    var a = adjuntosPorId()[k]; if (a && a.nombre) return a.nombre;
    if (String(k).indexOf('l:') === 0) { var loc = k.slice(2), x = ST.salida.reduce(function (acc, y) { return acc || y.archivos.filter(function (z) { return z.local === loc; })[0]; }, null); if (x) return x.nombre; }
    return 'archivo';
  }
  /** Visor a pantalla completa (WhatsApp): barras oscuras, Descargar el original, Compartir, deslizar, zoom. */
  function verFotos(grupo, k) {
    var meta = adjuntosPorId();
    var fotos = grupo.map(function (id) { var a = meta[id] || {}; return { id: id, nombre: nombreDe(id), cuando: a.created_at, de: a.autor ? nombreCorto(a.autor) : '' }; });
    AR.visor(fotos, Math.max(0, grupo.indexOf(k)), { obtener: function (f) { return blobDe(f.id); }, aviso: toast });
  }
  async function bajar(k) {
    var b = await blobDe(k); if (!b) return toast('No se pudo bajar el archivo.');
    AR.descargar(b, nombreDe(k));
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
  /** V1.32 (1a) · grabar igual que WhatsApp: basura · ● reloj · onda en vivo · pausa · enviar; en pausa se
   *  escucha antes de mandar. La nota entra a la cola con la hora en que se EMPEZÓ a grabar (1b). */
  async function grabar() {
    if (!GR.puede()) return toast('Este navegador no deja grabar. Usa el 📎 para mandar un audio grabado.');
    if (GR.activa('principal')) return;
    try {
      await GR.iniciar('principal', { alCambiar: pintarGrab, alTerminar: async function (r) {
        if (!r || r.duracion_s < 1) return toast('Muy corta: mantén grabando al menos un segundo.');
        if (r.bytes > Me.TOPE) return toast('La nota pasa de 10 MB: grábala en partes.');
        await Q.encolar(destino(), '', [r], r.escrito_at); ST.irAbajo = true; await refrescarSalida();
      } });
    } catch (e) { pintarGrab(); return toast(e && e.name === 'NotAllowedError' ? 'Da permiso al micrófono para grabar.' : 'No se pudo grabar: ' + (e.message || e)); }
  }
  function pintarGrab() {
    var c = $('.compose'), g = $('#grab'), on = GR.activa('principal');
    c.classList.toggle('grabando', on);
    var clave = on ? GR.fase('principal') : '';
    if (g.dataset.k !== clave) { g.dataset.k = clave; g.innerHTML = on ? GR.html('principal') : ''; GR.enlazar(g); }
    g.style.display = on ? 'flex' : 'none';
    actualizarAbajo();
  }
  function autoAlto() { var i = $('#in'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 140) + 'px'; }

  // ── V1.32 · ficha, empresa, prueba, editor de machote, vista en página ─
  function hojaFicha() {
    var c = (ST.hilo && ST.hilo.caso) || {}, e = EMPRESAS[claveEmpresa(c)] || EMPRESAS.mx_mxn;
    var hecho = ((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop();
    var fl = function (k, v) { return '<div class="fl"><span>' + esc(k) + '</span><div>' + v + '</div></div>'; };
    modal('<h3>Ficha de la sesión</h3><p class="sub">Los mismos ids quedan en la carpeta del caso.</p><div class="ficha">' +
      fl('Empresa', esc(e.n) + ' · company ' + e.id) +
      fl('CRM', c.oportunidad_id ? '<a href="https://serviciosfts.odoo.com/odoo/crm/' + encodeURIComponent(c.oportunidad_id) + '" target="_blank" rel="noopener">Oportunidad ' + esc(c.oportunidad_id) + '</a>' : '— todavía sin oportunidad') +
      fl('Machote', c.machote_folio || hecho ? '<a href="#" id="fMach">' + esc(c.machote_folio || (hecho.resultado || {}).folio || 'abrir') + (c.demo ? ' · PRUEBA' : '') + '</a>' : '— todavía no') +
      fl('Orden (SO)', c.orden_nombre || c.orden_id ? esc(c.orden_nombre || c.orden_id) : '— (la emisión a Odoo sigue apagada, #387)') +
      fl('Carpeta', esc(c.carpeta || '—')) +
      fl('Nota en Odoo', '«Conceptualizada en la sesión ' + esc(c.titulo || '') + '»: se escribe cuando la emisión esté encendida.') +
      '</div><div class="acc der"><button class="boton si" data-cierra>Listo</button></div>');
    var fm = $('#fMach'); if (fm) fm.onclick = function (ev) { ev.preventDefault(); cerrarModal(); abrirEditor(hecho); };
  }
  function dlgEmpresa() {
    var c = ST.hilo && ST.hilo.caso; if (!c) return;
    var sel = claveEmpresa(c);
    var v = velo('<div class="dlg" role="dialog" aria-label="Empresa y moneda"><h3>Empresa y moneda</h3><p>Define la moneda del machote y la empresa del borrador en Odoo. El motor dice qué tipo de cambio usó y de dónde salió.</p>' +
      '<div class="emp-sel">' + selEmpresa(sel) + '</div><div class="acciones"><button id="dNo">Cancelar</button><button id="dSi">Cambiar</button></div></div>', true);
    $$('[data-emp]', v).forEach(function (b) { b.onclick = function () { sel = b.dataset.emp; $$('[data-emp]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('#dNo', v).onclick = cerrarVelo;
    $('#dSi', v).onclick = async function () {
      if (sel === claveEmpresa(c)) return cerrarVelo();
      this.disabled = true; this.innerHTML = GIRO + 'cambiando…';
      var r = await C.empresa(c.id, sel); cerrarVelo();
      if (!r.ok) return aviso(r);
      await refrescarSesiones();
    };
  }
  async function marcarPrueba() {
    var c = ST.hilo && ST.hilo.caso; if (!c) return;
    var r = await C.prueba(c.id, !c.demo);
    if (!r.ok) return aviso(r);
    await refrescarSesiones();
    toast(r.demo ? 'Es una prueba: no enseña. El motor marca lo ya escrito.' : 'Ya no es prueba: sí enseña.', 'Deshacer', function () { marcarPrueba(); });
  }
  /** 9b · el editor de machotes que YA existe (comercial/machote), en ventana, con la misma sesión. */
  function abrirEditor(hecho) {
    var c = (ST.hilo && ST.hilo.caso) || {}, r = (hecho && hecho.resultado) || {};
    var id = r.id_local || c.machote_id || r.machote_id;
    var p = $('#panel'); p.className = 'panel on';
    p.innerHTML = '<div class="marco" role="dialog" aria-label="Editor de machotes"><div class="cabp"><button type="button" class="volver" id="pVolver">' + ico('atras', 's') + 'Volver al chat</button><b>' +
      esc((r.folio || c.machote_folio || 'Machote') + (c.demo ? ' · PRUEBA' : '')) + ' · editor de machotes</b></div>' +
      '<div class="cuerpo"><iframe title="Editor de machotes" src="../machote/index.html' + (id ? '#/m/' + encodeURIComponent(id) : '') + '"></iframe></div></div>';
    $('#pVolver').onclick = function () { p.className = 'panel'; p.innerHTML = ''; toast('De regreso en el chat. Toca «Haz la cotización» y releo el machote como quedó.'); };
  }
  /** 9g · vista en página, solo a pedido: Lo considerado y Machote. Cada versión que se ve se guarda EN ESTE
   *  TELÉFONO (localStorage) y se compara con la anterior. Las versiones del servidor piden la 0007. */
  function versiones(caso, U) {
    var k = 'cz_pag_' + caso, L = []; try { L = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) {}
    if (U && U.trabajo_id && (!L.length || L[L.length - 1].trabajo_id !== U.trabajo_id)) {
      // Una respuesta que solo trae BOM conserva los conceptos de la versión anterior.
      var cs = (U.conceptos || []).length ? U.conceptos : (L.length ? L[L.length - 1].conceptos : ((ST.hilo && ST.hilo.propuesta && ST.hilo.propuesta.conceptos) || []));
      L.push({ trabajo_id: U.trabajo_id, at: U.created_at || new Date().toISOString(), bom: U.bom || {}, machote: U.machote || null, conceptos: cs });
      L = L.slice(-12); try { localStorage.setItem(k, JSON.stringify(L)); } catch (e) {}
    }
    return L;
  }
  function abrirPagina(que, comparar) {
    var H = ST.hilo; if (!H) return;
    var U = respConBom(H); if (!U.trabajo_id) U = H.propuesta || H.ultima;
    var L = versiones(H.caso.id, U), v = L[L.length - 1] || { bom: {}, conceptos: [] }, a = L.length > 1 ? L[L.length - 2] : null, comp = comparar && a;
    var dec = {}; (H.eventos || []).forEach(function (e) { if (e.concepto && (e.tipo === 'aceptar' || e.tipo === 'rechazar')) dec[e.concepto] = e; });
    var cambio = function (x, y) { return comp && String(x) !== String(y) ? '<del>' + esc(y == null ? '—' : y) + '</del> <ins>' + esc(x == null ? '—' : x) + '</ins>' : esc(x == null ? '—' : x); };
    var ant = function (lista, campo, val) { return comp ? ((lista || []).filter(function (z) { return z[campo] === val; })[0] || {}) : {}; };
    var mat = (v.bom && v.bom.materiales) || [], mo = (v.bom && v.bom.mano_obra) || [];
    var cons = !(v.conceptos || []).length ? '' : '<h3>Conceptos</h3><div class="scroll-x"><table class="tabla"><tr><th>#</th><th>Concepto</th><th>Origen</th><th>Estado</th></tr>' +
      (v.conceptos || []).map(function (k) { var d = dec[k.id]; return '<tr><td>' + esc(k.id) + '</td><td>' + esc(k.concepto) + '</td><td>' + esc(k.origen || '') + '</td><td>' + (d ? (d.tipo === 'aceptar' ? (d.datos && d.datos.corregido ? 'corregido · ' + esc(d.razon || '') : 'va') : 'rechazado · ' + esc(d.razon || '')) : 'sin decidir') + '</td></tr>'; }).join('') + '</table></div>';
    cons += '<h3>BOM a costo</h3><div class="scroll-x"><table class="tabla"><tr><th>Descripción</th><th class="r">Qty</th><th class="r">P. unit.</th><th>Fuente</th><th>Tienda · existencia</th></tr>' +
      mat.map(function (r) { var o = ant(a && a.bom && a.bom.materiales, 'descripcion', r.descripcion); var nuevo = comp && !o.descripcion;
        return '<tr' + (comp && (nuevo || String(o.qty) !== String(r.qty) || String(o.pu) !== String(r.pu)) ? ' class="cambio"' : '') + '><td>' + (nuevo ? '<ins>' + esc(r.descripcion) + '</ins>' : esc(r.descripcion)) + (r.sku ? ' <span class="sku">' + esc(r.sku) + '</span>' : '') + '</td><td class="r">' + (nuevo ? esc(r.qty) : cambio(r.qty, o.qty)) +
          '</td><td class="r">' + (r.pu == null ? '—' : nuevo ? esc(dinero(r.pu)) : cambio(dinero(r.pu), o.pu == null ? null : dinero(o.pu))) + '</td><td>' +
          (r.liga && /^https?:/.test(r.liga) ? '<a href="' + esc(r.liga) + '" target="_blank" rel="noopener">' + esc(r.fuente || r.liga) + '</a>' : esc(r.fuente || '')) + '</td><td>' + esc(r.tienda_existencia || r.tienda || '') + '</td></tr>'; }).join('') + '</table></div>' +
      '<h3>Mano de obra</h3><div class="scroll-x"><table class="tabla"><tr><th>Rol</th><th class="r">Pers.</th><th class="r">Días</th><th class="r">H/día</th><th>Origen de los insumos</th></tr>' +
      mo.map(function (r) { var o = ant(a && a.bom && a.bom.mano_obra, 'rol', r.rol);
        return '<tr><td>' + esc(r.rol) + '</td><td class="r">' + cambio(r.personas, o.personas) + '</td><td class="r">' + cambio(r.dias, o.dias) + '</td><td class="r">' + cambio(r.horas_dia, o.horas_dia) + '</td><td>' + esc(r.origen || '') + '</td></tr>'; }).join('') + '</table></div>';
    var Mq = v.machote || {}, Ma = (a && a.machote) || {};
    var mach = (Mq.secciones || []).length ? '<h3>Machote al ' + Math.round((Mq.margen_objetivo || 0.4) * 100) + ' % · ' + esc(Mq.moneda || (H.caso.moneda || '')) + '</h3><div class="scroll-x"><table class="tabla"><tr><th>Sección</th><th class="r">Costo</th><th class="r">Precio</th><th class="r">Margen</th></tr>' +
      Mq.secciones.map(function (s2) { var o = ant(Ma.secciones, 'nombre', s2.nombre);
        return '<tr><td>' + esc(s2.nombre) + '</td><td class="r">' + cambio(dinero(s2.costo), o.nombre ? dinero(o.costo) : null) + '</td><td class="r">' + cambio(dinero(s2.precio), o.nombre ? dinero(o.precio) : null) + '</td><td class="r">' + ((s2.margen || 0) * 100).toFixed(1) + ' %</td></tr>'; }).join('') +
      '<tr class="tot"><td>Total</td><td class="r">' + cambio(dinero(Mq.costo), Ma.costo == null || !comp ? null : dinero(Ma.costo)) + '</td><td class="r">' + cambio(dinero(Mq.precio), Ma.precio == null || !comp ? null : dinero(Ma.precio)) + '</td><td class="r">' + ((Mq.margen || 0) * 100).toFixed(1) + ' %</td></tr></table></div>' +
      ((Mq.opciones || []).length ? '<p class="nota">Aparte (el cliente escoge una): ' + Mq.opciones.map(function (o) { return esc(o.nombre) + ' ' + dinero(o.precio); }).join(' · ') + '</p>' : '')
      : '<p class="vacio">Todavía no hay machote en esta sesión.</p>';
    var p = $('#panel'); p.className = 'panel on';
    p.innerHTML = '<div class="marco" role="dialog" aria-label="Vista en página"><div class="cabp"><button type="button" class="volver" id="pVolver">' + ico('atras', 's') + 'Volver al chat</button><b>Vista en página · v' + L.length + '</b></div>' +
      '<div class="cuerpo"><div class="pagina"><h2>' + esc(H.caso.titulo) + '</h2><div class="sub">Generada a pedido · v' + L.length + (v.at ? ' del ' + esc(diaDe(v.at) + ' ' + hora(v.at)) : '') + (H.caso.demo ? ' · PRUEBA' : '') + '</div>' +
      '<div class="tabs"><button class="' + (que === 'considerado' ? 'on' : '') + '" data-tab="considerado">Lo considerado</button><button class="' + (que === 'machote' ? 'on' : '') + '" data-tab="machote">Machote</button>' +
      (a ? '<button data-comp="1" class="' + (comp ? 'on' : '') + '">' + (comp ? 'Comparando con v' + (L.length - 1) : 'Comparar con v' + (L.length - 1)) + '</button>' : '') +
      '<button data-imp="1">Descargar PDF</button></div>' + (que === 'machote' ? mach : cons) + '</div></div></div>';
    $('#pVolver').onclick = function () { p.className = 'panel'; p.innerHTML = ''; };
    $$('[data-tab]', p).forEach(function (b) { b.onclick = function () { abrirPagina(b.dataset.tab, comparar); }; });
    $$('[data-comp]', p).forEach(function (b) { b.onclick = function () { abrirPagina(que, !comparar); }; });
    $$('[data-imp]', p).forEach(function (b) { b.onclick = function () { document.body.classList.add('imprimiendo-pag'); G.print(); setTimeout(function () { document.body.classList.remove('imprimiendo-pag'); }, 500); }; });
  }

  // ── V1.32 (4) · «Archivos, enlaces y docs.», bajar todo y exportar ─────
  /** La respuesta más reciente con BOM o machote (la última del hilo puede ser solo una aclaración). */
  function respConBom(H) {
    return [H && H.ultima, H && H.propuesta].filter(function (x) { return x && ((x.bom && Object.keys(x.bom).length) || x.machote); })[0] || {};
  }
  function ligasDelChat() {
    var H = ST.hilo || {}, L = [], vistas = {};
    var agrega = function (url, titulo, texto, cuando, msg) { url = String(url).replace(/[).,;»]+$/, ''); if (vistas[url]) return; vistas[url] = 1; L.push({ url: url, titulo: titulo, texto: texto, cuando: cuando, msg: msg }); };
    (H.mensajes || []).forEach(function (m) { (String(m.texto || '').match(/https?:\/\/[^\s<>"'`|]+/g) || []).forEach(function (u) { agrega(u, '', String(m.texto).replace(/\s+/g, ' ').slice(0, 140), m.created_at, m.id); }); });
    var U = respConBom(H), mm = (H.mensajes || []).filter(function (m) { return m.trabajo_id === U.trabajo_id && m.rol !== 'usuario'; })[0];
    (((U.bom || {}).materiales) || []).forEach(function (r, i) { if (r.liga && /^https?:/.test(r.liga)) agrega(r.liga, r.descripcion + (r.sku ? ' · ' + r.sku : ''),
      'BOM renglón ' + (i + 1) + ' · ' + (r.fuente || '') + (r.tienda_existencia ? ' · ' + r.tienda_existencia : ''), U.created_at, mm && mm.id); });
    return L;
  }
  function datosArchivos() {
    var H = ST.hilo || {}, A = H.adjuntos || [], U = respConBom(H), Mq = U.machote || {};
    var docs = A.filter(function (a) { return a.clase !== 'foto'; }).map(function (a) { return { id: a.id, nombre: a.nombre, cuando: a.created_at, bytes: a.bytes, tipo: (String(a.nombre).split('.').pop() || '') }; });
    if (Mq.entrega) docs.push({ id: 'g-pdf', nombre: 'PDF al cliente · ' + (H.caso.titulo || '') + '.pdf', tipo: 'pdf', cuando: U.created_at, generado: true, abrir: verPdf });
    if (U.bom && Object.keys(U.bom).length) docs.push({ id: 'g-pag', nombre: 'Vista en página · ' + (H.caso.titulo || '') + '.html', tipo: 'html', cuando: U.created_at, generado: true, abrir: function () { abrirPagina('considerado'); } });
    return { titulo: 'Archivos, enlaces y docs.', zipNombre: slugDe(H.caso && H.caso.titulo),
      fotos: A.filter(function (a) { return a.clase === 'foto'; }).map(function (a) { return { id: a.id, nombre: a.nombre, cuando: a.created_at, bytes: a.bytes, de: nombreCorto(a.autor) }; }),
      docs: docs, enlaces: ligasDelChat() };
  }
  function slugDe(t) { return sinAcento(t || 'chat').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'chat'; }
  function opArchivos() {
    return { obtener: function (x) { return blobDe(x.id); }, aviso: toast,
      miniatura: function (x) { return cargarUrl(x.id); },
      irAMensaje: function (id) { var e = $('#msgs [data-msg="' + id + '"]'); if (e) { e.scrollIntoView({ block: 'center' }); e.classList.add('brilla'); } } };
  }
  function abrirArchivos() { if (ST.hilo) AR.pantalla(datosArchivos(), opArchivos()); }
  async function todoMultimedia(prefijo) {
    var A = (ST.hilo && ST.hilo.adjuntos) || [], L = [];
    for (var i = 0; i < A.length; i++) { var b = await blobDe(A[i].id); if (b) L.push({ nombre: (prefijo || '') + A[i].nombre, blob: b }); }
    return { L: L, total: A.length };
  }
  async function bajarMultimedia() {
    if (!ST.hilo) return;
    toast('Preparando el ZIP con todo lo multimedia…');
    var r = await todoMultimedia('');
    if (!r.L.length) return toast(r.total ? 'No se pudo bajar ningún archivo.' : 'Esta sesión no tiene fotos, audios ni archivos.');
    AR.descargar(await AR.zip(r.L), slugDe(ST.hilo.caso.titulo) + '-multimedia.zip');
    toast('Listo: ' + r.L.length + ' de ' + r.total + ' archivos en el ZIP');
  }
  function chatParaExportar() {
    var H = ST.hilo, meta = adjuntosPorId();
    return { titulo: H.caso.titulo, empresa: (EMPRESAS[claveEmpresa(H.caso)] || {}).n, exportado_por: yo(),
      mensajes: (H.mensajes || []).map(function (m) {
        var adj = (m.adjuntos || []).map(function (a) { return Object.assign({}, a, meta[a.id] || meta[a] || {}); });
        return { cuando: m.escrito_at || m.created_at, quien: m.rol === 'usuario' ? nombreCorto(m.autor) : m.rol === 'sistema' ? 'Sistema' : 'Conceptualizador',
          texto: m.texto || '', transcripciones: adj.map(function (a) { return a.transcripcion; }).filter(Boolean),
          adjuntos: adj.map(function (a) { return { nombre: a.nombre, clase: a.clase, bytes: a.bytes }; }) }; }) };
  }
  function dlgExportar() {
    if (!ST.hilo) return;
    var v = velo('<div class="dlg" role="dialog" aria-label="Exportar chat"><h3>Exportar chat</h3><p>Historial con fecha y hora, quién escribió, el texto, las transcripciones y la lista de adjuntos. Nunca lleva llaves ni datos internos del motor.</p>' +
      '<div class="emp-sel"><button type="button" data-f="txt" class="on"><span class="rad"></span><span>TXT<small>Para leer o pegar</small></span></button><button type="button" data-f="json"><span class="rad"></span><span>JSON<small>Para otra herramienta</small></span></button></div>' +
      '<label class="chk"><input type="checkbox" id="xMedia"> Con todo lo multimedia (ZIP)</label><div class="acciones"><button id="xNo">Cancelar</button><button id="xSi">Exportar</button></div></div>', true);
    var f = 'txt';
    $$('[data-f]', v).forEach(function (b) { b.onclick = function () { f = b.dataset.f; $$('[data-f]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('#xNo', v).onclick = cerrarVelo;
    $('#xSi', v).onclick = async function () {
      var con = $('#xMedia', v).checked, blob = AR.exportar(chatParaExportar(), f), base = 'chat-' + slugDe(ST.hilo.caso.titulo);
      this.disabled = true; this.innerHTML = GIRO + 'exportando…';
      if (!con) { cerrarVelo(); AR.descargar(blob, base + '.' + f); return toast('Exporté el chat en ' + f.toUpperCase()); }
      var r = await todoMultimedia('multimedia/'); cerrarVelo();
      AR.descargar(await AR.zip([{ nombre: base + '.' + f, blob: blob }].concat(r.L)), base + '.zip');
      toast('Exporté el chat y ' + r.L.length + ' archivos en un ZIP');
    };
  }

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
    // V1.37 · «Retomamos»: se calcula UNA vez al abrir el caso; se va sola en cuanto hay actividad nueva.
    if (ST.retomaPara !== s.id && G.CzAvance) {
      ST.retomaPara = s.id; var rt = G.CzAvance.retomamos(r.hilo, Date.now());
      ST.retoma = rt ? Object.assign({ id: s.id, t: G.CzAvance.ultimaActividad(r.hilo) }, rt) : null;
    }
    ST.hilo = r.hilo; registrarPasos(r.hilo); revisarDictados(); pintarChat();
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
  function enCurso() { return (ST.hilo && (ST.hilo.trabajos || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; })) ||
    Object.keys(ST.borr).some(function (k) { return ST.borr[k].adjunto; }); }
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
    G.addEventListener('online', function () { pintarSenal(); pintarCabecera(); revisarDictados(); });
    G.addEventListener('offline', function () { pintarSenal(); pintarCabecera(); });
    $('#bAbajo').insertAdjacentHTML('afterbegin', ico('abajo2'));
    $('#bAbajo').onclick = function () { var M = $('#msgs'); M.scrollTo({ top: M.scrollHeight, behavior: 'smooth' }); ST.abajoN = 0; };
    $('#msgs').addEventListener('scroll', actualizarAbajo, { passive: true });
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
