/* ═══ Conceptualizador · pantalla tipo WhatsApp ═══
 *
 * V1.40 · franja en UNA línea y pantalla de rubros (prototipo aprobado V1.39 · 1, #4 punto 10): «44 % · Siguiente:
 *   Cerrar Mecánica» colapsada; se abre al tocarla o jalar hacia abajo y se esconde sola (scroll, mensaje, 6 s); a
 *   ≥900 px es un panel lateral de 300 px. La tarjeta de rubros y la hoja de cada rubro usan SOLO lo que manda el motor
 *   (`verifica.rubros` y el `rubro` de cada pregunta, concepto y renglón); confirmar / en espera / reabrir viajan como
 *   mensajes que el motor resuelve sin modelo.
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
  var VERSION = 'V1.48';
  // V1.46 (#4) · lo que contesta el motor a un «revisa» cuando no hay aviso pendiente (procesa.js, SIN_AVISO): no se pinta.
  var SIN_AVISO = 'Sin cambios pendientes en este caso.';
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
  /* V1.39 (#4 punto 11) · gestos del chat (shared/chat/chat-gestos.js): copiar, responder deslizando y reenviar
   * (deshabilitado aquí). GZ es el control enganchado al chat; CG el componente (marcador y cita). */
  var CG = G.ChatGestos, GZ = null;
  var RAZON_REENVIAR = 'Reenviar todavía no está en los chats de machote. Se enciende cuando existan los chats de grupo y del prospectador.';
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
             geo: null, ciuNueva: null, qf: null,
             // V1.42 · renglones reabiertos con «↺ Cambiar» (clave j:<id> o c:<id>) y permiso de Odoo
             reab: {}, permOdoo: null,
             // V1.43 · correcciones por voz que ya salieron a la cola (clave j:/c:/s:) y aceptación de referencias
             vozCorr: {}, refAcepta: {} };
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
      var x = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\bLlevas (\d{1,3}) %/g, '<span class="rub-pav">Llevas $1 %</span>');   // V1.40: el % del motor en sus mensajes
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
        (sinMarca(u.texto) ? sinMarca(u.texto) : (u.adjuntos ? u.adjuntos + ' adjunto' + (u.adjuntos > 1 ? 's' : '') : ''));
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
    // V1.41 · Permisos, Recordatorios, No molestar y (admins) Avisos del equipo: los pone cz-push.js.
    var v = enMenu(btn, '<button data-a="aprendio">' + ico('libro', 's') + '<span>Lo que aprendió</span></button>' + (G.CzPush ? G.CzPush.menuHtml('lista') : ''));
    $$('[data-a]', v).forEach(function (b) { b.onclick = function () { cerrarVelo(); var a = b.dataset.a; if (a.indexOf('push:') === 0) return G.CzPush.accion(a.slice(5)); verAprendio(); }; });
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
      g.estado === 'region' ? 'Sin permiso de ubicación: por la zona horaria pongo arriba las ciudades de <b>' + esc(g.region.nombre) + '</b>. Elige la del proyecto.' :
      g.estado === 'lejos' ? (g.region ? 'Tu ubicación cae en <b>' + esc(g.region.nombre) + '</b>: sus ciudades van primero en la lista. No guardo coordenadas.' :
        'Tu ubicación no cae cerca de ninguna ciudad de la lista: búscala por nombre o por estado. No guardo coordenadas.') :
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
  /** V1.39 (#4 punto 9) · selector de ciudad con el catálogo COMPLETO (INEGI municipios + Census places), que se baja
   *  SOLO al abrir (CI.catalogo). Sin texto: la actual, las del estado donde está la persona (ubicación o zona
   *  horaria) y donde ya trabaja FTS. Con texto: ciudad o estado, sin acentos («cd juarez», «Chihuahua», «CA»).
   *  «Otra» (texto libre) es el último recurso. `alElegir({c,e,pais})`: solo ciudad, estado y país, nunca coordenadas.
   *  `paisCtx` (MX|US): el país de la empresa del caso, para acomodar los homónimos. */
  function dlgCiudad(actual, alElegir, titulo, paisCtx) {
    var pais = paisCtx || (actual && (actual.pais === 'US' || actual.pais === 'MX') ? actual.pais : null) ||
      (EMPRESAS[ST.empresa] && EMPRESAS[ST.empresa].pais === 'usa' ? 'US' : 'MX');
    var miles = function (n) { return Number(n).toLocaleString('es-MX'); };
    var reg = function () { return (ST.geo && ST.geo.region) || null; };
    // Sin detección todavía (se llegó desde ⋮ sin pasar por el menú): se intenta aquí; nunca bloquea.
    if (!ST.geo) { ST.geo = { estado: 'buscando', persona: null }; CI.detectar().then(function (g) { ST.geo = g; if ($('#cdL')) pinta(); }); }
    var marca = function (t, q) {
      var k = CI.norm(q); if (!k) return esc(t);
      var n = CI.norm(t), i = n.indexOf(k);
      if (i < 0 || CI.norm(t.slice(0, i + k.length)) !== n.slice(0, i + k.length)) return esc(t);
      return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + k.length)) + '</mark>' + esc(t.slice(i + k.length));
    };
    var op = function (x, q) {
      // Segunda línea: estado, habitantes y al final el alias (lo que más se recorta en el teléfono va al último).
      var on = CI.igual(actual, x), sub = [];
      if (on) sub.push('la de ahora ✓');
      if (x.en) sub.push(x.en);
      if (x.pais === 'MX' && x.pob) sub.push(miles(x.pob) + ' hab.');
      if (x.cdp) sub.push('lugar censal');
      if (x.alias) sub.push(x.alias);
      return '<button type="button" class="cd-op' + (on ? ' on' : '') + '" data-ciudad="' + esc(x.c) + '" data-estado="' + esc(x.e) + '" data-pais="' + esc(x.pais) + '">' +
        '<span class="cd-n"><span class="cd-n1">' + marca(x.c, q) + ', ' + esc(x.e) + '</span>' + (sub.length ? '<span class="cd-n2">' + esc(sub.join(' · ')) + '</span>' : '') + '</span>' +
'<span class="cd-pa">' + esc(x.pais) + '</span></button>';
    };
    var grupo = function (t) { return '<div class="cd-g">' + t + '</div>'; };
    var lista = function (q) {
      var h = '', vistos = {}, k = CI.norm(q), r0 = reg();
      var una = function (x) { var id = x.c + '|' + x.e + '|' + x.pais; if (vistos[id]) return ''; vistos[id] = 1; return op(x, q); };
      if (!k) {
        if (actual && actual.c) {
          var enCat = CI.delCatalogo(actual);
          h += grupo('La de ahora') + una(enCat || { c: actual.c, e: actual.e || '', pais: actual.pais || pais });
        }
        if (r0) {
          var de = r0.fuente === 'ubicacion' ? 'tu ubicación' : 'la zona horaria del teléfono';
          var L = CI.delEstado(r0, 12);
          if (L.length) { h += grupo('Cerca de ti · ' + esc(r0.nombre) + ' (por ' + de + ')'); L.forEach(function (x) { h += una(x); }); }
        } else if (ST.geo && ST.geo.estado === 'buscando') h += grupo('Buscando dónde estás…');
        h += grupo('Donde ya trabaja FTS');
        CI.deFts().forEach(function (x) { h += una(x); });
        var n = CI.conteo(); if (n) h += '<div class="cd-mas">Busca entre ' + miles(n.mx) + ' municipios de México (INEGI) y ' + miles(n.us) + ' ciudades de Estados Unidos (Census).</div>';
      } else if (CI.listo()) {
        var r = CI.buscarCat(q, { region: r0, pais: pais });
        h += grupo(r.st ? esc(r.st.nombre) + ' (' + esc(r.st.e) + ') · sus ciudades, de más a menos pobladas' : r.total ? miles(r.total) + ' resultado' + (r.total === 1 ? '' : 's') : 'Sin resultados');
        r.L.forEach(function (x) { h += una(x); });
        if (r.total > r.L.length) h += '<div class="cd-mas">… y ' + miles(r.total - r.L.length) + ' más. Escribe más para afinar.</div>';
      } else {
        var f = CI.norm(q), Lf = CI.deFts().filter(function (x) { return CI.norm(x.c + ' ' + x.e + ' ' + (x.en || '')).indexOf(f) >= 0; });
        h += grupo('Donde ya trabaja FTS'); Lf.forEach(function (x) { h += una(x); });
      }
      if (!CI.listo()) h += '<div class="cd-mas" id="cdCarga">' + (cargando ? 'Cargando el catálogo completo (México y Estados Unidos)…' : 'Sin señal y sin el catálogo en el teléfono: elige de la lista o escribe la ciudad en «Otra».') + '</div>';
      return h + '<button type="button" class="cd-op otra" data-ciudad="otra"><span class="cd-n"><span class="cd-n1">Otra…</span><span class="cd-n2">Escríbela tú: ciudad y estado (sin coordenadas)</span></span></button>';
    };
    var cargando = true;
    var v = velo('<div class="dlg cd-dlg" role="dialog" aria-label="Ciudad del proyecto"><h3>' + esc(titulo || 'Ciudad del proyecto') + '</h3>' +
      '<p>De aquí sale la procura: tienda o sucursal con existencia en esta ciudad, distribuidores de la zona, flete si el material está en otra, y viáticos.</p>' +
      '<label class="cd-busca">' + ico('buscar', 's') + '<input id="cdQ" placeholder="Busca ciudad o estado" autocomplete="off" aria-label="Buscar ciudad o estado"></label>' +
      '<div class="cd-lista" id="cdL"></div>' +
      '<div class="cd-otra" id="cdO" hidden><input id="cdT" maxlength="90" placeholder="Ciudad, estado (ej. Reynosa, Tamps.)" aria-label="Ciudad y estado">' +
        '<div class="cd-pais"><button type="button" data-cp="MX" class="on">México</button><button type="button" data-cp="US">USA</button></div><span class="err-bt" id="cdE"></span></div>' +
      '<div class="acciones"><button id="cdNo">Cancelar</button><button id="cdSi" hidden>Usar esta</button></div></div>', true);
    var pinta = function () { var L = $('#cdL', v); if (!L) return; var y = L.scrollTop; L.innerHTML = lista($('#cdQ', v).value); L.scrollTop = y; };
    var paisO = pais;
    var marcaPais = function () { $$('[data-cp]', v).forEach(function (b) { b.classList.toggle('on', b.dataset.cp === paisO); }); };
    marcaPais(); pinta();
    CI.catalogo().then(function () { cargando = false; if ($('#cdL') === $('#cdL', v)) pinta(); });
    $('#cdL', v).onclick = function (ev) {
      var b = ev.target.closest('[data-ciudad]'); if (!b) return;
      if (b.dataset.ciudad === 'otra') { $('#cdO', v).hidden = false; $('#cdSi', v).hidden = false; $('#cdT', v).focus(); return; }
      var x = { c: b.dataset.ciudad, e: b.dataset.estado, pais: b.dataset.pais, alias: '' };
      if (x.c.length > 60) { var cat = CI.buscarCat(x.c, {}, 5).L.filter(function (y) { return y.c === x.c && y.e === x.e; })[0]; if (cat) x.alias = cat.alias; }
      cerrarVelo(); alElegir(CI.eleccion(x));
    };
    $('#cdQ', v).oninput = pinta;
    $$('[data-cp]', v).forEach(function (b) { b.onclick = function () { paisO = b.dataset.cp; marcaPais(); }; });
    var usar = function () {
      var x = CI.deTexto($('#cdT', v).value, paisO);
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
    }, null, claveEmpresa(c) === 'usa_usd' ? 'US' : 'MX');
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
    // Ya se dijo «ya es todo» (en la cola o recién llegado) y la base todavía no marca `disparado_at`: no se ofrece otra vez.
    if (sg && sg.acc === 'disparo' && yaDisparo()) sg = { txt: 'Armando las preguntas…', espera: true };
    // V1.40 · antes del BOM, con rubros y nada más que hacer: «Seguir con <rubro>» abre su hoja (prototipo aprobado).
    var Rb = abierta && !(ST.sel || {}).menu ? G.CzAvance.rubros(H) : null;
    // V1.40 · con rubros (antes del BOM) las preguntas y los conceptos se contestan por rubro: el botón dice el mismo
    // siguiente que la línea de arriba, «Seguir con <rubro>», y abre su hoja (prototipo aprobado).
    if (Rb && !Rb.con_bom && (!sg || (sg.espera && sg.txt === 'Armando el BOM…') || (sg.acc === 'ir' && (sg.a === 'conjetura' || sg.a === 'conceptos')))) {
      var rab = Rb.lista.filter(function (r) { return r.estado === 'abierto'; })[0];
      if (rab) sg = { txt: 'Seguir con ' + rab.nombre, acc: 'rubro', id: rab.id };
    }
    if (!sg) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var e = ST.env.fijo || (ST.env.ciudad ? 'guardando la ciudad…' : null), ic = sg.acc === 'ciudad' || sg.acc === 'confirma_ciudad' ? 'mapa' : sg.acc === 'machote' || sg.acc === 'disparo' ? 'disparo' : 'pagina';
    el.style.display = 'flex';
    el.innerHTML = '<button id="bFijo" type="button" data-fijo="' + esc(sg.acc) + '"' + (sg.espera || e ? ' disabled' : '') + ' class="' + (sg.espera ? 'espera' : '') + '">' +
      (sg.espera || e ? GIRO : ico(ic, 's')) + '<span class="fx">' + esc(e || sg.txt) + '</span></button>';
    var b = $('#bFijo');
    b.onclick = function () {
      if (sg.acc === 'ciudad') return cambiarCiudad();
      if (sg.acc === 'confirma_ciudad') return confirmarCiudad();
      if (sg.acc === 'rubro') return abrirRubro(sg.id);
      if (sg.acc === 'disparo') return confirmarDisparo(c.modo === 'acompanamiento' ? 'acompanamiento' : 'levantamiento');
      if (sg.acc === 'machote') { ST.env.fijo = /^Actualizar/.test(sg.txt) ? 'actualizando…' : 'creando…'; pintarFijo(); return hacer(sg.id, b).then(function () { delete ST.env.fijo; pintarFijo(); }); }
      if (sg.acc === 'cotiza' || sg.acc === 'mandar') { b.disabled = true; return mandar(sg.acc === 'cotiza' ? 'Haz la cotización' : sg.texto).then(function () { pintarFijo(); }); }
      if (sg.acc === 'ir') {
        var t = sg.a === 'conjetura' ? $('[data-conf]') : sg.a === 'conceptos' ? $('[data-acepta]') : sg.a === 'oferta' ? $('.of-carta') : $('.pend-cot');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); var k = t.closest('.carta') || t; k.classList.add('resalta'); setTimeout(function () { k.classList.remove('resalta'); }, 1600); }
      }
    };
  }

  /* V1.40 · la franja de avance como UNA línea (visto bueno de Esteban al prototipo V1.39 · 1, #4). Sustituye a la franja
   * de 7 barritas de V1.37, que estorbaba y le quitaba alto al chat:
   *  · colapsada por omisión, ~34 px: «44 % · Siguiente: Cerrar Mecánica ⌄». El % es el del motor (verifica.rubros);
   *    sin rubros todavía, el paso y el siguiente de CzAvance.avance(), sin %.
   *  · se abre al tocarla o al jalar hacia abajo (sobre la línea o desde arriba del chat), ENCIMA del chat sin moverlo:
   *    los 7 pasos y los rubros con su %;
   *  · se esconde sola al hacer scroll en el chat, al mandar un mensaje y a los CIERRE_MS sin tocarla;
   *  · ≥900 px: panel lateral de 300 px a la derecha, siempre abierto y sin cerrarse solo (el chat conserva su alto).
   * Integra la ciudad (sin confirmar sale en rojo y el botón de abajo la pide primero) y el «Abrir M-xxxx». */
  var CIERRE_MS = 6000;
  /* V1.47 (#4) · el ciclo del análisis y el presupuesto, de la última respuesta del motor (verifica.analisis, verifica.presupuesto). */
  var BOTON_CIERRE = 'Ya está todo ok, ya no muevas nada';
  function verUlt() { return (ST.hilo && ST.hilo.ultima && ST.hilo.ultima.verifica) || {}; }
  function analisis() { return verUlt().analisis || null; }
  function analisisCerrado() { var a = analisis(); return !!(a && a.estado === 'cerrado'); }
  function presupuesto() { return verUlt().presupuesto || null; }
  function lateral() { return G.matchMedia && G.matchMedia('(min-width:900px)').matches; }
  function abrirFranja(v) {
    ST.franjaAbierta = !!v; var el = $('#avance');
    if (el) { el.classList.toggle('abierta', ST.franjaAbierta); var t = $('#avTop'); if (t) t.setAttribute('aria-expanded', String(ST.franjaAbierta || lateral())); }
    clearTimeout(ST.tFranja); if (ST.franjaAbierta && !lateral()) armarCierre();
  }
  function armarCierre() { clearTimeout(ST.tFranja); ST.tFranja = setTimeout(function () { if (!ST.razonAg) abrirFranja(false); }, CIERRE_MS); }
  /* V1.47.1 (#4) · pausa del agente por caso y reabrir el análisis: con razón obligatoria; viajan como mensaje del dueño (o de
   * Esteban) que el motor resuelve sin modelo. La franja dice «⏸ Agente en pausa · quién · razón · desde» con «Reanudar». */
  var FRASE_PAUSA = '⏸ Pausa al agente: ', FRASE_REANUDA = '▶ Reanuda al agente', FRASE_REABRE = '🔓 Reabre el análisis: ';
  function nombreAgente(a) { return String(a || '').split('.').filter(Boolean).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(' ') || '—'; }
  function horaDe(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), hoy = new Date();
    return d.toDateString() === hoy.toDateString() ? hm : ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()] + ' ' + d.getDate() + ' · ' + hm;
  }
  function pedirRazonAg(tipo) { ST.razonAg = tipo; ST.razonErr = ''; abrirFranja(true); pintarFranja(); var i = $('#avRazon'); if (i) i.focus(); }
  function mandarRazonAg() {
    var i = $('#avRazon'), r = i ? String(i.value || '').replace(/\s+/g, ' ').trim() : '';
    if (r.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}.*\s.*[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(r)) { ST.razonErr = 'Escribe la razón en una línea (por ejemplo: «muevo yo los precios hoy»).'; pintarFranja(); var j = $('#avRazon'); if (j) { j.value = r; j.focus(); } return; }
    var t = ST.razonAg === 'reabre' ? FRASE_REABRE + r : FRASE_PAUSA + r; ST.razonAg = null; ST.razonErr = ''; pintarFranja(); mandar(t);
  }
  function pintarFranja() {
    var el = $('#avance'), viejo = $('#ciuF'); if (viejo) { viejo.style.display = 'none'; viejo.innerHTML = ''; }
    if (!el) return;
    var H = ST.hilo, c = H && H.caso, app = $('#app');
    if (!H || !c || !G.CzAvance || (ST.sel || {}).menu || ['abierto', 'enviada'].indexOf(c.estado) < 0 || archivada(c)) {
      el.style.display = 'none'; el.innerHTML = ''; if (app) app.classList.remove('con-lado'); return;
    }
    var AV = G.CzAvance, L = AV.linea(H), av = L.av, R = L.R, a = av.actual, P = AV.PASOS, abierto = !!ST.franjaAbierta;
    var x = ciudadDe(c), folio = av.machote && ((av.machote.resultado || {}).folio || c.machote_folio);
    el.style.display = 'block'; el.classList.toggle('abierta', abierto); if (app) { app.classList.add('con-lado'); app.classList.toggle('lado-col', ladoColapsado()); }
    // V1.45 (#4 punto 13) · con machote, el avance y los precios por separado: «Rubros 7/7 · Precios 46/46 (62 % referencia, 19 alertas)».
    var AN0 = analisis();
    // V1.48 · con el % hacia el 100, las referencias y alertas viven adentro: la línea de arriba ya no se pinta de naranja.
    var cab = L.P ? '<b>' + esc(L.rubrosTxt) + '</b> · <span class="avl-pre' + (L.P.alertas && !(AN0 && typeof AN0.pct === 'number') ? ' alerta' : '') + '">' + esc(L.preciosTxt) + '</span>' :
      (L.pct !== null ? '<b>' + L.pct + ' %</b>' : '<b>' + esc(L.paso) + '</b>') +
      (L.sig ? ' · Siguiente: ' + (L.rojo ? '<span class="avl-rojo">' + esc(L.sig) + '</span>' : esc(L.sig)) : '');
    var AN = analisis();
    if (AN && AN.pausa && AN.estado !== 'cerrado') cab = '<b class="avl-pausa">⏸ En pausa</b> · ' + cab;
    if (AN && AN.estado === 'cerrado') cab = '<b class="avl-cerrado">🔒 Análisis cerrado</b> · ' + cab;
    else if (AN && AN.estado === 'listo') cab = '<b class="avl-listo">Listo para cerrar</b> · ' + cab;
    else if (AN && typeof AN.pct === 'number') cab = '<b class="avl-pct ' + colorAvance(AN, L.P) + '">' + AN.pct + ' % hacia el 100</b> · ' + cab;
    // V1.48 · UN indicador con color que significa algo: rojo = todavía no se puede cotizar (un N5), ámbar = en camino, verde = 100 %.
    if (AN) cab = anillo(AN, L.P) + cab;
    var h = AN && AN.pausa && AN.estado !== 'cerrado' ? '<div class="avl-pausa-fr" role="status"><span>⏸ <b>Agente en pausa</b> · ' + esc(nombreAgente(AN.pausa.por)) + ' · «' + esc(AN.pausa.razon) + '» · desde ' + esc(horaDe(AN.pausa.desde)) + '</span>' +
      (mia(c) ? '<button type="button" class="bt" id="avReanudar">Reanudar</button>' : '') + '</div>' : '';
    h += '<button type="button" class="avl-top' + (L.P ? ' con-precios' : '') + '" id="avTop" aria-expanded="' + (abierto || lateral()) + '" aria-controls="avDet"><span class="avl-l">' + cab + '</span>' + ico('abajo', 's avl-chev') + '</button>';
    // V1.48 · en PC el panel se colapsa hacia la derecha y se recuerda por persona (en este navegador).
    h += '<button type="button" class="avl-col" id="avCol" aria-label="' + (ladoColapsado() ? 'Abrir el panel de progreso' : 'Colapsar el panel de progreso') + '" title="' + (ladoColapsado() ? 'Abrir el panel' : 'Colapsar el panel') + '"><span class="avl-col-i' + (ladoColapsado() ? ' abre' : '') + '" aria-hidden="true"></span></button>';
    h += '<div class="avl-det" id="avDet"><div class="avl-tit">Paso ' + (a + 1) + ' de 7 · ' + esc(P[a]) + (av.det[a] ? ' · ' + esc(av.det[a].replace(/\.$/, '')) : '') +
      (L.P ? ' · <b>' + esc(L.rubrosTxt) + ' cerrados</b>' : L.pct !== null ? ' · <b>Llevas ' + L.pct + ' %</b>' : '') + (R && !L.P ? ' · ' + R.lista.length + ' rubros' : '') + '</div>';
    if (L.P) h += preciosFranja(L.P, L.sig);
    if (AN) h += '<div class="avl-analisis">' + (AN.estado === 'cerrado' ? '<b>🔒 Análisis cerrado' + (AN.cerrado && AN.cerrado.folio ? ' · ' + esc(AN.cerrado.folio) + (AN.cerrado.version ? ' v' + esc(AN.cerrado.version) : '') : '') + '.</b> El agente ya no mueve nada; si pides algo nuevo, se reabre.' :
      '<b>' + (AN.estado === 'listo' ? 'Listo para cerrar' : AN.pct + ' % hacia el 100') + '</b>' + (AN.falta && AN.falta.length ? ' · Falta: ' + esc(AN.falta.join('; ')) : '') +
      (mia(c) ? ' <button type="button" class="link" id="avCerrarAn">' + esc(BOTON_CIERRE) + '</button>' : '') +
      (mia(c) && !AN.pausa ? ' <button type="button" class="link" id="avPausar">Pausar al agente</button>' : '') +
      (AN.congelado_ref && AN.congelado_ref.folio ? '<span class="avl-cong">Versión congelada de referencia: ' + esc(AN.congelado_ref.folio) + (AN.congelado_ref.version ? ' v' + esc(AN.congelado_ref.version) : '') + '</span>' : '')) +
      (AN.estado === 'cerrado' && mia(c) ? ' <button type="button" class="link" id="avReabrir">Reabrir el análisis</button>' : '') +
      (ST.razonAg && mia(c) ? '<div class="caja-razon avl-razon"><label for="avRazon">' + (ST.razonAg === 'reabre' ? '¿Qué cambió para reabrirlo?' : '¿Por qué pausas al agente?') + '</label>' +
        '<input id="avRazon" maxlength="300" autocomplete="off" placeholder="' + (ST.razonAg === 'reabre' ? 'el cliente pidió 2 chillers más' : 'muevo yo los precios hoy') + '">' +
        (ST.razonErr ? '<span class="nota mal">' + esc(ST.razonErr) + '</span>' : '') +
        '<span class="avl-razon-bt"><button type="button" class="bt" id="avRazonOk">' + (ST.razonAg === 'reabre' ? 'Reabrir' : 'Pausar') + '</button><button type="button" class="link" id="avRazonNo">Cancelar</button></span></div>' : '') + '</div>';
    var PR = presupuesto();
    if (PR && yo() === 'esteban.delacruz') h += '<div class="avl-pres">' + esc(PR.linea) + ' <button type="button" class="link" id="avAvance">' + (PR.apagado ? 'Prender el avance' : 'Apagar el avance') + '</button></div>';
    if (!av.ciudad) h += '<div class="avl-ciu"><b>Ciudad del proyecto' + (x ? ': ' + esc(CI.nombre(x)) + ' (sin confirmar)' : '') + '</b> Sin ella no se buscan precios: tiendas, fletes y viáticos se miden contra ella.' +
      (mia(c) ? ' <button type="button" class="link" id="avCiudad">' + (x ? 'Cambiar' : 'Elegir') + '</button>' : '') + '</div>';
    h += '<ol class="avl-pasos">' + P.map(function (p, i) { var e = av.e[i]; return '<li class="' + e + '" title="' + esc(av.det[i]) + '">' + (e === 'hecho' ? '✓ ' : '') + (i + 1) + ' ' + esc(p) + '</li>'; }).join('') + '</ol>';
    if (av.machote) h += '<div class="avl-maq">Machote ' + esc(folio || '') + ' · <button type="button" class="link" id="avAbrir">Abrir ' + esc(folio || 'machote') + '</button></div>';
    h += '<div class="avl-sub">Rubros</div>';
    if (R) {
      h += R.lista.map(function (r) {
        var cls = r.estado === 'cerrado' ? ' cerrado' : r.estado === 'espera' ? ' espera' : '';
        var est = r.estado === 'cerrado' ? (r.id === 'fec' ? 'cerradas' : 'cerrado') : r.estado === 'espera' ? 'en espera' : (typeof r.pct === 'number' ? r.pct + ' %' : '');
        return '<button type="button" class="rub-fila' + cls + '" data-rub="' + esc(r.id) + '"><span class="rub-n"><b>' + esc(r.nombre) + '</b>' + barraRubro(r) + '</span><span class="rub-pct">' + esc(est) + '</span></button>';
      }).join('');
    } else h += '<div class="avl-nada">' + (av.oferta && av.oferta.estado === 'ofrecida' ? 'Los rubros salen cuando contestes la oferta.' : 'Los rubros salen cuando arranque con el machote.') + '</div>';
    el.innerHTML = h + '</div>';
    if ($('#avCol')) $('#avCol').onclick = function (e) { e.stopPropagation(); ponLadoColapsado(!ladoColapsado()); pintarFranja(); };
    if ($('#avCiudad')) $('#avCiudad').onclick = function () { cambiarCiudad(); };
    if ($('#avAbrir')) $('#avAbrir').onclick = function () { abrirEditor(av.machote); };
    if ($('#avCerrarAn')) $('#avCerrarAn').onclick = function () { if (confirm('¿Cerrar el análisis? El machote vigente queda congelado y el agente deja de moverlo.')) mandar(BOTON_CIERRE); };
    if ($('#avAvance')) $('#avAvance').onclick = function () { mandar(PR && PR.apagado ? 'prende el avance' : 'apaga el avance'); };
    if ($('#avPausar')) $('#avPausar').onclick = function () { pedirRazonAg('pausa'); };
    if ($('#avReabrir')) $('#avReabrir').onclick = function () { pedirRazonAg('reabre'); };
    if ($('#avReanudar')) $('#avReanudar').onclick = function (e) { e.stopPropagation(); mandar(FRASE_REANUDA); };
    if ($('#avRazonOk')) $('#avRazonOk').onclick = mandarRazonAg;
    if ($('#avRazonNo')) $('#avRazonNo').onclick = function () { ST.razonAg = null; ST.razonErr = ''; pintarFranja(); armarCierre(); };
    if ($('#avRazon')) $('#avRazon').oninput = function () { if (ST.razonErr) { ST.razonErr = ''; var m = $('.avl-razon .nota.mal'); if (m) m.remove(); } };
    if ($('#avRazon')) $('#avRazon').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); mandarRazonAg(); } else if (e.key === 'Escape') { ST.razonAg = null; pintarFranja(); } };
  }
  /** V1.48 · rojo si algo impide cotizar (un renglón sin precio, N5), ámbar en camino (referencias, alertas, lo que falte), verde al 100 %. */
  function colorAvance(AN, P) {
    if (AN.estado === 'cerrado' || AN.estado === 'listo' || AN.pct >= 100) return 'verde';
    if (P && P.total && P.con_precio < P.total) return 'rojo';
    // Sin el bloque de precios (antes de guardar el machote): el machote de la última respuesta o lo que el motor dice que falta.
    var M = ((ST.hilo && (ST.hilo.propuesta || ST.hilo.ultima)) || {}).machote;
    if (M && (M.secciones || []).some(function (x) { return x.sin_precio > 0; })) return 'rojo';
    if ((AN.falta || []).some(function (f) { return /sin precio|\bN5\b/i.test(f); })) return 'rojo';
    return 'ambar';
  }
  function anillo(AN, P) {
    var pct = AN.estado === 'cerrado' || AN.estado === 'listo' ? 100 : Math.max(0, Math.min(100, Number(AN.pct) || 0)), col = colorAvance(AN, P);
    var cl = { verde: '#1daa61', ambar: '#b7791f', rojo: '#d13438' }[col];
    return '<svg class="avl-anillo" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#e7e3dd" stroke-width="3"/>' +
      '<circle cx="10" cy="10" r="8" fill="none" stroke="' + cl + '" stroke-width="3" stroke-linecap="round" transform="rotate(-90 10 10)" stroke-dasharray="50.27" stroke-dashoffset="' + (50.27 * (1 - pct / 100)).toFixed(2) + '"/></svg>';
  }
  var LADO_KEY = function () { return 'cz_lado_colapsado:' + (yo() || 'anon'); };
  function ladoColapsado() { try { return localStorage.getItem(LADO_KEY()) === '1'; } catch (e) { return false; } }
  function ponLadoColapsado(v) { try { localStorage.setItem(LADO_KEY(), v ? '1' : '0'); } catch (e) {} var a = $('#app'); if (a) a.classList.toggle('lado-col', !!v); }
  /** V1.45 · el renglón de precios del detalle de la franja: con precio, % de referencia, alertas N3 y de sensatez. */
  function preciosFranja(P, sig) {
    var S = P.sensatez || [];
    return '<div class="avl-precios"><b>Precios</b> ' + esc(P.con_precio + ' de ' + P.total + ' renglones con precio') +
      (P.pct ? ' · ' + esc(P.pct + ' % del costo es referencia (N3/N4)') : '') + (P.n3 ? ' · <span class="alerta">⚠ ' + esc(P.n3 + (P.n3 === 1 ? ' alerta N3' : ' alertas N3')) + '</span>' : '') +
      S.map(function (x) { return '<span class="avl-sens">⚠ ALERTA ' + esc(x.seccion) + ': ' + esc(x.cuenta).replace(/ %/g, '&nbsp;%') + '</span>'; }).join('') +
      (sig ? '<span class="avl-sig">Siguiente: ' + esc(sig) + '</span>' : '') + '</div>';
  }
  /** La barrita de un rubro: el % que mandó el motor (cerrado = lleno). Sin % no hay barra. */
  function barraRubro(r) {
    var v = r.estado === 'cerrado' ? 100 : typeof r.pct === 'number' ? r.pct : null;
    return v === null ? '' : '<span class="rub-barra"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></span>';
  }
  /** Los gestos de la franja. Se enlazan UNA vez (la franja se repinta con cada sondeo, el contenedor no). */
  function enlazarFranja() {
    var F = $('#avance'), M = $('#msgs'), jalon = null;
    F.addEventListener('click', function (e) {
      if (e.target.closest('#avTop')) { if (lateral() || Date.now() - (ST.jalado || 0) < 400) return; abrirFranja(!ST.franjaAbierta); return; }
      var r = e.target.closest('[data-rub]');
      if (r) { if (!lateral()) abrirFranja(false); return abrirRubro(r.dataset.rub); }
      if (ST.franjaAbierta) armarCierre();   // cualquier toque dentro reinicia el reloj
    });
    // Jalar hacia abajo: sobre la línea, o desde arriba del chat cuando ya está hasta arriba.
    var inicia = function (x, y, desdeChat) { if (lateral() || ST.franjaAbierta || F.style.display === 'none') return; if (desdeChat && M.scrollTop > 2) return; jalon = { x: x, y: y }; };
    var mueve = function (x, y) {
      if (!jalon) return; var dy = y - jalon.y;
      if (dy > 40 && Math.abs(x - jalon.x) < dy) { jalon = null; ST.jalado = Date.now(); try { G.getSelection().removeAllRanges(); } catch (er) {} abrirFranja(true); }
    };
    F.addEventListener('pointerdown', function (e) { inicia(e.clientX, e.clientY, false); });
    M.addEventListener('pointerdown', function (e) { inicia(e.clientX, e.clientY, true); });
    document.addEventListener('pointermove', function (e) { mueve(e.clientX, e.clientY); });
    document.addEventListener('pointerup', function () { jalon = null; });
    M.addEventListener('touchstart', function (e) { var t = e.touches[0]; inicia(t.clientX, t.clientY, true); }, { passive: true });
    M.addEventListener('touchmove', function (e) { var t = e.touches[0]; mueve(t.clientX, t.clientY); }, { passive: true });
    // El scroll de la persona la esconde; el que hace la pantalla para bajar al final, no.
    M.addEventListener('scroll', function () { if (ST.franjaAbierta && !lateral() && Date.now() - (ST.scrollProg || 0) > 250) abrirFranja(false); }, { passive: true });
  }

  /* ── V1.40 · la pantalla de rubros (prototipo «después de Adelante») ─────────────────────────────
   * Tarjeta «Resumen por rubro para confirmar» bajo la respuesta más nueva del motor, y la hoja de cada rubro con sus
   * preguntas (✓ Va / ✎ Corregir, las mismas conjeturas de siempre), sus conceptos (la palomeada de siempre) y, con BOM,
   * sus renglones. «Confirmar», «En espera de datos» y «Reabrir» mandan un MENSAJE que el motor resuelve sin modelo
   * (oferta-rubros.js `cambioDeRubro`): «Cerrar rubro: <nombre>», «Rubro <nombre> en espera de datos: <porqué>» y
   * «Reabrir rubro: <nombre>». El estado que se pinta es SIEMPRE el que regresa el motor; mientras tanto, «enviado». */
  function rubroDe(id) { var R = G.CzAvance.rubros(ST.hilo); return R ? R.lista.filter(function (r) { return r.id === id; })[0] || null : null; }
  function rubEnviado(id) { var e = (ST.rubEnv || {})[id], u = ST.hilo && ST.hilo.ultima; return e && (!u || u.trabajo_id === e.base) ? e : null; }
  function tarjetaRubros(R) {
    var P = G.CzAvance.precios(ST.hilo), cerr = R.lista.filter(function (r) { return r.estado === 'cerrado'; }).length;
    var h = '<div class="carta rub-carta"><h4>Resumen por rubro para confirmar <span class="rub-tot">' + (P ? esc('Rubros ' + cerr + '/' + R.lista.length + ' · ' + G.CzAvance.textoPrecios(P)) : 'Llevas ' + esc(R.total_pct) + ' %') + '</span></h4>' +
      '<p class="nota">' + (P ? 'Rubros: cerrados de los que hay (el motor cierra solo el que ya no tiene nada abierto). Precios: aparte, del machote.' :
        R.con_bom ? 'Con BOM: % de renglones con precio; el total pesa cada rubro por su costo.' : 'Antes del BOM: preguntas contestadas y conceptos palomeados.') + ' Toca un rubro para cerrarlo.</p>';
    R.lista.forEach(function (r) {
      var d = G.CzAvance.delRubro(ST.hilo, r.id), env = rubEnviado(r.id), sub;
      if (r.estado === 'cerrado') sub = 'Cerrado';
      else if (r.estado === 'espera') sub = 'En espera de datos' + (r.porque ? ': ' + r.porque : '');
      else if (r.id === 'fec' && !r.renglones) sub = 'Sin costo: alimenta el tiempo de ejecución';
      else if (R.con_bom && r.renglones) sub = r.sin_precio + ' sin precio de ' + r.renglones + (d.R.length && d.conocido ? ' · ' + dinero(d.conocido, ((ST.hilo.caso || {}).moneda === 'USD' ? 'USD' : '')) + ' conocidos' : '');
      else if (d.Q.length || d.K.length) sub = plural(d.abiertas, 'pregunta abierta', 'preguntas abiertas') + ' · ' + plural(d.sinDec, 'concepto sin palomear', 'conceptos sin palomear');
      else sub = plural(r.preguntas || 0, 'pregunta', 'preguntas') + ' · ' + plural(r.conceptos || 0, 'concepto', 'conceptos');
      if (env) sub = (env.tipo === 'cerrar' ? 'Confirmación enviada' : env.tipo === 'espera' ? 'En espera: enviado' : 'Reabrir: enviado') + ' · esperando al motor';
      h += '<button type="button" class="rub-fila' + (r.estado === 'cerrado' ? ' cerrado' : r.estado === 'espera' ? ' espera' : '') + '" data-rub="' + esc(r.id) + '"><span class="rub-n"><b>' + esc(r.nombre) +
        (r.estado === 'cerrado' ? '<span class="rub-tag cerr">✓ cerrado</span>' : r.estado === 'espera' ? '<span class="rub-tag esp">en espera</span>' : '') + '</b><span class="rub-sub">' + esc(sub) + '</span>' + barraRubro(r) + '</span>' +
        '<span class="rub-pct">' + (r.estado === 'cerrado' ? '✓' : typeof r.pct === 'number' ? r.pct + ' %' : '') + '</span></button>';
    });
    return h + '</div>';
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function abrirRubro(id) { if (!rubroDe(id)) return; ST.rubHoja = id; ST.rubPorque = false; pintarHojaRubro(); }
  function cerrarHojaRubro() { ST.rubHoja = null; var h = $('#rubHoja'); h.className = 'rub-velo'; h.innerHTML = ''; }
  function pintarHojaRubro() {
    var el = $('#rubHoja'), id = ST.rubHoja; if (!el) return;
    var r = id && rubroDe(id); if (!r || !ST.hilo) return cerrarHojaRubro();
    var H = ST.hilo, d = G.CzAvance.delRubro(H, id), c = H.caso || {}, puede = mia(c), env = rubEnviado(id), nom = G.CzAvance.corto(r.nombre);
    var cuerpoAntes = el.querySelector('.rub-cuerpo'), arriba = cuerpoAntes ? cuerpoAntes.scrollTop : 0;
    var fe = document.activeElement, foco = fe && fe.closest && fe.closest('#rubHoja') && fe.dataset && fe.dataset.borr ? { k: fe.dataset.borr, a: fe.selectionStart, b: fe.selectionEnd } : null;
    var est = r.estado === 'cerrado' ? 'cerrado' : r.estado === 'espera' ? 'en espera de datos' : (typeof r.pct === 'number' ? r.pct + ' %' : '');
    var h = '<div class="rub-hoja" role="dialog" aria-modal="true" aria-label="' + esc(r.nombre) + '"><div class="rub-cab"><span class="rub-ht"><b>' + esc(r.nombre) + '</b><span>' + esc(est) +
      (r.estado === 'espera' && r.porque ? ' · ' + esc(r.porque) : '') + '</span></span><button type="button" class="btn-ic" id="rubX" aria-label="Cerrar">' + ico('cerrar') + '</button></div><div class="rub-cuerpo">';
    if (d.Q.length) h += '<div class="rub-sec">Preguntas</div>' + tarjetaAcciones(d.Q).replace(/^<div class="carta">/, '<div class="carta rub-in">');
    if (d.K.length) {
      h += '<div class="rub-sec">Conceptos</div><div class="carta rub-in conceptos">';
      d.K.forEach(function (x) {
        var k = x.k, kk = 'c:' + k.id, reab = !!ST.reab[kk] && !!x.d, dd = reab ? null : x.d, e = ST.env[kk], b = ST.borr[kk] || {}, corr = dd && dd.tipo === 'aceptar' && dd.datos && dd.datos.corregido;
        h += '<div class="cn" data-con="' + esc(k.id) + '"><div class="fil"><span class="n">' + esc(k.id) + '</span><div class="d">' + esc(k.concepto) + '<small>origen: ' + esc(k.origen || '') + '</small>' +
          (dd && dd.razon ? '<small class="' + (corr ? 'corr' : 'mal') + '">' + (corr ? '✎ ' : '') + esc(dd.razon) + '</small>' : '') + '</div>' +
          (dd ? '<span class="hecho' + (dd.tipo === 'rechazar' ? ' mal' : corr ? ' corr' : '') + '">' + (corr ? '✎ corregido' : dd.tipo === 'aceptar' ? '✓ va' : 'rechazado') + '</span>' : '') + '</div>' +
          (reab ? '<p class="nota reab">↺ Reabierto: vale tu última decisión.</p>' : '') +
          (dd && puede && !b.abierto ? '<div class="decide">' + botonCambiar(kk) + '</div>' : '') +
          (dd || b.abierto || !puede ? '' : '<div class="decide">' + (e === 'aceptar' ? '<button class="si enviando" disabled aria-label="Enviando">' + GIRO + 'enviando…</button>' : '<button class="si" data-acepta="' + esc(k.id) + '">✓ Va</button>') +
            '<button data-corrige="' + esc(k.id) + '"' + (e ? ' disabled' : '') + '>✎ Corregir</button></div>') +
          (ST.errBt[kk] && !b.abierto ? '<span class="err-bt">' + esc(ST.errBt[kk]) + '</span>' : '') +
          (b.abierto && !dd ? cajaRazon(kk, 'Escribe o dicta qué cambia. Si no va, di por qué.', 'Guardar', false) : '') + '</div>';
      });
      h += '</div>';
    }
    if (d.R.length && r.renglones) {
      h += '<div class="rub-sec">Renglones del BOM</div><div class="rub-bom">' + d.R.map(function (x) {
        var m = x.r, sin = !conPrecioR(m);
        return '<div class="rub-br"><span class="d">' + esc(x.mo ? 'MO · ' + (m.rol || '') : m.descripcion || '') + '</span><span class="i' + (sin ? ' pend' : '') + '">' + (sin ? 'PENDIENTE PROVEEDOR' : dinero(m.importe, m.moneda)) + '</span></div>';
      }).join('') + '</div>';
    }
    if (!d.Q.length && !d.K.length && !(d.R.length && r.renglones)) h += '<p class="nota rub-vacio">' + (r.preguntas || r.conceptos || r.renglones ?
      'El motor cuenta ' + [r.preguntas ? plural(r.preguntas, 'pregunta', 'preguntas') : '', r.conceptos ? plural(r.conceptos, 'concepto', 'conceptos') : '', r.renglones ? plural(r.renglones, 'renglón', 'renglones') : ''].filter(Boolean).join(', ') + ' en este rubro; todavía no llegan a esta pantalla.' :
      'Este rubro todavía no tiene preguntas, conceptos ni renglones.') + '</p>';
    if (ST.rubPorque && !ST.borr['r:espera']) ST.rubPorque = false;   // «Cancelar» de la cajita
    if (ST.rubPorque && puede && r.estado !== 'cerrado') {
      var chips = d.Q.filter(function (a) { return a.estado === 'propuesta'; }).map(function (a) { return String((a.datos && a.datos.pregunta) || a.titulo || '').replace(/^¿|\?$/g, ''); }).filter(Boolean).slice(0, 5);
      var bp = ST.borr['r:espera'] || {};
      h += '<div class="rub-porque">' + (chips.length ? '<div class="of-chips">' + chips.map(function (f) {
          return '<button type="button" data-rfalta="' + esc(f) + '" class="' + (String(bp.texto || '').indexOf(f) >= 0 ? 'on' : '') + '">' + esc(f) + '</button>'; }).join('') + '</div>' : '') +
        cajaRazon('r:espera', '¿Qué datos faltan? (escribe, dicta o toca)', 'Dejar en espera') + '</div>';
    }
    h += '</div><div class="rub-pie">';
    if (env) h += '<span class="nota">' + esc(env.tipo === 'cerrar' ? 'Mandé «Confirmar ' + nom + '»' : env.tipo === 'espera' ? 'Mandé «en espera de datos»' : 'Mandé «Reabrir»') + '; espera la respuesta del motor.</span>';
    else if (!puede) h += '<span class="nota">Solo quien abrió la sesión confirma los rubros.</span>';
    else if (r.estado === 'cerrado') h += '<span class="nota">✓ Rubro cerrado. Si algo cambia, lo reabres.</span><button type="button" class="bt" id="rubReabre">Reabrir</button>';
    else {
      var falta = d.abiertas + d.sinDec;
      h += '<span class="nota">' + (falta ? 'Faltan ' + falta + ' por contestar o palomear.' : 'Todo contestado: ya puedes confirmarlo.') + (r.estado === 'espera' && r.porque ? ' En espera de: ' + esc(r.porque) + '.' : '') + '</span>' +
        (r.estado === 'espera' ? '<button type="button" class="bt" id="rubReabre">Sacar de espera</button>' : ST.rubPorque ? '' : '<button type="button" class="bt rub-gris" id="rubEspera">En espera de datos</button>') +
        '<button type="button" class="bt si" id="rubCierra"' + (falta ? ' disabled' : '') + '>Confirmar ' + esc(nom) + '</button>';
    }
    el.innerHTML = h + '</div></div>'; el.className = 'rub-velo on';
    enlazarChat(el);
    el.onclick = function (e) { if (e.target === el) cerrarHojaRubro(); };
    $('#rubX').onclick = cerrarHojaRubro;
    $$('[data-rfalta]', el).forEach(function (b) { b.onclick = function () {
      var bb = ST.borr['r:espera'] = ST.borr['r:espera'] || { abierto: true, texto: '' }, f = b.dataset.rfalta, L = String(bb.texto || '').replace(/^falta:\s*/i, '').split(/\s*;\s*/).filter(Boolean);
      L = L.indexOf(f) >= 0 ? L.filter(function (z) { return z !== f; }) : L.concat(f);
      bb.texto = L.length ? 'falta: ' + L.join('; ') : ''; pintarHojaRubro(); }; });
    if ($('#rubCierra')) $('#rubCierra').onclick = function () { cambiarRubro('cerrar', r); };
    if ($('#rubReabre')) $('#rubReabre').onclick = function () { cambiarRubro('reabrir', r); };
    if ($('#rubEspera')) $('#rubEspera').onclick = function () { ST.rubPorque = true; ST.borr['r:espera'] = ST.borr['r:espera'] || { abierto: true, texto: '' }; pintarHojaRubro(); var t = $('#rubHoja [data-borr="r:espera"]'); if (t) t.focus(); };
    var cu = el.querySelector('.rub-cuerpo'); if (cu) cu.scrollTop = arriba;
    if (foco) { var t = $('#rubHoja [data-borr="' + foco.k + '"]'); if (t) { t.focus(); try { t.setSelectionRange(foco.a, foco.b); } catch (er) {} } }
  }
  function conPrecioR(m) { var ok = function (v) { return v !== null && v !== undefined && v !== ''; }; return ok(m.importe) || ok(m.pu); }
  /** Manda el cambio de estado como mensaje (lo resuelve el motor sin modelo) y espera su respuesta para pintarlo. */
  function cambiarRubro(tipo, r, porque) {
    var txt = tipo === 'cerrar' ? 'Cerrar rubro: ' + r.nombre : tipo === 'reabrir' ? 'Reabrir rubro: ' + r.nombre :
      'Rubro ' + r.nombre + ' en espera de datos' + (porque ? ': ' + porque : '');
    ST.rubEnv = ST.rubEnv || {}; ST.rubEnv[r.id] = { tipo: tipo, base: ST.hilo && ST.hilo.ultima ? ST.hilo.ultima.trabajo_id : null };
    ST.rubPorque = false; delete ST.borr['r:espera']; cerrarHojaRubro();
    return mandar(txt).then(function () { pintarFijo(); pintarChat(); });
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
    $('#app').classList.remove('ver-chat'); $('#app').classList.remove('en-menu'); $('#app').classList.remove('con-lado'); cerrarHojaRubro(); ST.sel = null; guardarSel(); pintarLista();
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
      // V1.48 · el globito del agente (prototipo aprobado, #4): su estado y, al tocarlo, explicación y botones.
      globitoHtml() +
      // V1.37 · «Ya terminé, cotiza» es el botón del siguiente paso (abajo) y «¿Qué me falta?» vive en ⋮ (decisión de Esteban, #4).
      '<button class="btn-ic" id="bMenu" aria-label="Opciones">' + ico('mas') + '</button>';
    $('#bVuelve').onclick = volverALista;
    if ($('#bAgente')) $('#bAgente').onclick = function (e) { popAgente(e.currentTarget); };
    $('#bMenu').onclick = function (e) { menuChat(e.currentTarget); };
  }
  /* V1.48 · el globito del agente: 🤖 trabajando · ⏸️ en pausa · 🔒 cerrado · 💤 fuera de horario o tope · 🧪 modo prueba.
   * Todo sale de la última respuesta del motor (verifica.analisis y verifica.presupuesto): sin pedirle nada al servidor. */
  function estadoAgente() {
    var H = ST.hilo, c = H && H.caso; if (!c || ['abierto', 'enviada'].indexOf(c.estado) < 0 || archivada(c) || (ST.sel || {}).menu) return null;
    var AN = analisis(), PR = presupuesto();
    if (AN && AN.estado === 'cerrado') return { k: 'cerrado', e: '🔒', l: 'cerrado', t: 'Análisis cerrado', p: 'Se cerró con «' + BOTON_CIERRE + '». El agente no toca este caso. Si necesitas cambiar algo, reábrelo.' };
    if (AN && AN.pausa) return { k: 'pausa', e: '⏸️', l: 'en pausa', t: 'El agente está en pausa', p: 'Lo pausó ' + nombreAgente(AN.pausa.por) + ' ' + horaDe(AN.pausa.desde) + ': «' + AN.pausa.razon + '». No mueve nada en este caso hasta que lo reanudes; si le pides algo, hace eso y solo eso.' };
    if (PR && (PR.apagado || PR.en_horario === false)) return { k: 'dormido', e: '💤', l: PR.apagado ? 'en tope' : 'fuera de horario', t: PR.apagado ? 'El agente llegó a su tope' : 'El agente descansa',
      p: (PR.apagado ? 'El trabajo por su cuenta está apagado' + (PR.apagado.motivo ? ' (' + String(PR.apagado.motivo).replace(/_/g, ' ') + ')' : '') + (PR.apagado.hasta ? ' hasta ' + horaDe(PR.apagado.hasta) : '') + '.' :
        'Trabaja por su cuenta L–V de 7:00 a 21:00 de quien cotiza.') + ' Tus mensajes sí se contestan.' };
    if (PR && PR.modo_prueba) return { k: 'prueba', e: '🧪', l: 'modo prueba', t: 'Modo prueba (hasta ' + horaDe(PR.modo_prueba.hasta) + ')', p: 'Esta semana el agente trabaja con más margen para probarlo, con un vigilante de código que lo corta si gasta de más o no avanza. Nunca cambia lo que tú decidiste.' };
    return { k: 'trabajando', e: '🤖', l: 'trabajando', t: 'El agente está trabajando', p: 'Avanza solo hacia el 100 %: completa precios, revisa alertas y sube versión nueva del mismo machote. Nunca cambia lo que tú decidiste.' };
  }
  function globitoHtml() {
    var x = estadoAgente(); if (!x) return '';
    return '<button type="button" class="bot-ag ' + x.k + '" id="bAgente" aria-haspopup="dialog" aria-label="Agente: ' + esc(x.l) + '"><span class="e">' + x.e + '</span><span class="lbl">' + esc(x.l) + '</span></button>';
  }
  function popAgente(btn) {
    var x = estadoAgente(); if (!x) return;
    var c = (ST.hilo && ST.hilo.caso) || {}, puede = mia(c), b = [];
    if (x.k === 'pausa') b.push('<button type="button" class="bt si" data-ag="reanuda">▶ Reanudar</button>');
    else if (x.k !== 'cerrado') b.push('<button type="button" class="bt" data-ag="pausa">⏸️ Pausar</button>');
    if (x.k !== 'cerrado') b.push('<button type="button" class="bt" data-ag="cierra">🔒 Ya está todo ok</button>');
    else b.push('<button type="button" class="bt si" data-ag="reabre">↺ Reabrir</button>');
    var v = enMenu(btn, '<div class="pop-ag"><b>' + x.e + ' ' + esc(x.t) + '</b><p>' + esc(x.p) + '</p><div class="acc">' + b.join('').replace(/<button /g, puede ? '<button ' : '<button disabled ') + '</div>' +
      '<small>' + (puede ? 'Solo el dueño del caso o Esteban ven estos botones activos.' : 'Solo el dueño del caso (' + esc(nombreAgente(c.autor)) + ') o Esteban pueden cambiar esto.') + '</small></div>');
    $$('[data-ag]', v).forEach(function (bt) { bt.onclick = function () {
      cerrarVelo(); var a = bt.dataset.ag;
      if (a === 'pausa') return pedirRazonAg('pausa');
      if (a === 'reabre') return pedirRazonAg('reabre');
      if (a === 'reanuda') return mandar(FRASE_REANUDA);
      if (a === 'cierra' && confirm('¿Cerrar el análisis? El machote vigente queda congelado y el agente deja de moverlo.')) return mandar(BOTON_CIERRE);
    }; });
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
      // V1.47 (#4 Parte H) · el análisis lo cierra SOLO el dueño (o Esteban), de forma explícita; el botón está aunque no llegue al 100 %.
      // V1.47.1 · pausa del agente en este caso (con razón), reanudar y reabrir el análisis: dueño o Esteban.
      (abierta && c.id && mia && !analisisCerrado() ? (analisis() && analisis().pausa ? '<button data-a="reanuda_agente">' + ico('info', 's') + '<span>Reanudar al agente<small>En pausa desde ' + esc(horaDe(analisis().pausa.desde)) + ': «' + esc(analisis().pausa.razon) + '»</small></span></button>'
        : '<button data-a="pausa_agente">' + ico('info', 's') + '<span>Pausar al agente<small>Con razón: deja de mover el caso por su cuenta; sí contesta lo que pidas</small></span></button>') : '') +
      (abierta && c.id && mia && analisisCerrado() ? '<button data-a="reabre_analisis">' + ico('candado', 's') + '<span>Reabrir el análisis<small>Con razón: guarda la versión congelada y vuelve a trabajar</small></span></button>' : '') +
      (abierta && c.id && mia && !analisisCerrado() ? '<button data-a="cierra_analisis">' + ico('candado', 's') + '<span>' + esc(BOTON_CIERRE) + '<small>Congela el machote vigente; el agente deja de moverlo</small></span></button>' : '') +
      // V1.47 (#4 Parte T) · el interruptor del modo avance, solo para Esteban.
      (yo() === 'esteban.delacruz' && c.id ? '<button data-a="avance_toggle">' + ico('info', 's') + '<span>' + (presupuesto() && presupuesto().apagado ? 'Prender el avance' : 'Apagar el avance') +
        '<small>' + esc(presupuesto() ? presupuesto().linea : 'El trabajo proactivo del motor (sin presupuesto leído todavía)') + '</small></span></button>' : '') +
      (abierta && c.id ? '<button data-a="cierre">' + ico('candado', 's') + '<span>Cerrar con /cierre</span></button>' : '') +
      (G.CzPush ? G.CzPush.menuHtml('chat') : '') +   // V1.41 · «Permisos y avisos» (cz-push.js)
      '<button data-a="aprendio">' + ico('libro', 's') + '<span>Lo que aprendió</span></button>';
    var v = enMenu(btn, h);
    $$('[data-a]', v).forEach(function (b) { b.onclick = function () {
      cerrarVelo(); var a = b.dataset.a;
      if (a.indexOf('push:') === 0) return G.CzPush.accion(a.slice(5));
      if (a === 'disparo') return confirmarDisparo(md);
      if (a === 'falta') return queFalta(null);
      if (a === 'cierra_analisis') return mandar(BOTON_CIERRE);
      if (a === 'pausa_agente') return pedirRazonAg('pausa');
      if (a === 'reabre_analisis') return pedirRazonAg('reabre');
      if (a === 'reanuda_agente') return mandar(FRASE_REANUDA);
      if (a === 'avance_toggle') return mandar(presupuesto() && presupuesto().apagado ? 'prende el avance' : 'apaga el avance');
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
    var fe = document.activeElement, foco = fe && fe.dataset && fe.dataset.borr && !(fe.closest && fe.closest('#rubHoja')) ? { k: fe.dataset.borr, a: fe.selectionStart, b: fe.selectionEnd } : null;
    pintarCabecera(); pintarSenal(); pintarFijo(); pintarFranja();
    var modo = modoActual();
    var h = '', ultimoDia = '', prev = null;
    var dia = function (t) { var d = separador(t); if (d && d !== ultimoDia) { ultimoDia = d; h += '<div class="dia"><span>' + esc(d) + '</span></div>'; prev = null; } };
    var aparte = function (html) { h += html; prev = null; };
    // Una burbuja; la primera de cada racha lleva la colita y, si es del motor, quién habla.
    var burbuja = function (lado, cls, quien, cuerpo, id) {
      var sig = prev !== lado; prev = lado;
      h += '<div class="fila ' + lado + (sig ? ' sig' : '') + '"' + (id ? ' data-msg="' + esc(id) + '"' : '') + '><div class="b ' + lado + (cls ? ' ' + cls : '') + '"' + (id ? ' data-chg-id="' + esc(id) + '"' : '') + '>' +
        (lado === 'el' && sig && quien ? '<div class="quien">' + esc(quien) + '</div>' : '') + cuerpo + '</div></div>';
    };
    var meta = adjuntosPorId();
    var acc = accionesPorTrabajo(), pintadas = {};
    var U = H && (H.propuesta || H.ultima), porTrabajo = {}; ((H && H.trabajos) || []).forEach(function (t) { porTrabajo[t.id] = t; });
    var OFR = ofertaDe(H), RUB = H && G.CzAvance ? G.CzAvance.rubros(H) : null;
    if (!H && !(ST.sel || {}).local) aparte('<div class="sis"><span>Cargando…</span></div>');
    if (modo) burbuja('el', 'intro', 'Conceptualizador', '<div class="txt">' + esc(MODOS[modo].intro) + '</div>');
    else if ((ST.sel || {}).local && !(H && H.mensajes && H.mensajes.length)) aparte('<div class="sis"><span>Platícale el trabajo: texto, notas de voz, fotos y PDFs. Cuando termines escribe «ya es todo».</span></div>');
    ((H && H.mensajes) || []).forEach(function (m) {
      var t = m.escrito_at || m.created_at; dia(t);
      if (m.rol === 'sistema') return aparte('<div class="sis"><span>' + esc(m.texto) + '</span></div>');
      if (m.rol === 'motor' && m.texto === SIN_AVISO) return;          // V1.46 · el «revisa» sin aviso no se pinta
      var mio = m.rol === 'usuario', tr = m.trabajo_id && porTrabajo[m.trabajo_id];
      // V1.48 · el mensaje del agente que trae la tabla del machote se queda corto (4 líneas) con «Ver todo»: la tabla es el resumen.
      var corto = !mio && U && U.machote && U.machote.tabla && Number(U.trabajo_id) === Number(m.trabajo_id) && String(sinMarca(m.texto) || '').length > 280 && !(ST.verTodo || {})[m.id];
      // Sin trabajo en modo «ya tengo el levantamiento»: guardado; el motor lo lee todo junto al disparar.
      var tk = mio ? (!m.trabajo_id && modo === 'levantamiento' ? '<span class="tk leido" title="Guardado; lo reviso todo junto cuando toques «Ya es todo»">' + palomita(true) + '</span>' : tick(tr)) : '';
      burbuja(mio ? 'yo' : 'el', '', 'Conceptualizador' + (/respaldo/.test(m.autor) ? ' · respaldo' : ''),
        citaDe(m.responde_a, m.texto) +
        adjuntosHtml((m.adjuntos || []).map(function (a) { return Object.assign({}, a, meta[a.id] || {}); }), false) +
        (sinMarca(m.texto) ? '<div class="txt' + (corto ? ' txt-corto' : '') + '">' + (mio ? esc(sinMarca(m.texto)) : md(sinMarca(m.texto))) + '</div>' +
          (corto ? '<button type="button" class="link ver-todo" data-vertodo="' + esc(m.id) + '">Ver todo</button>' : '') : '') +
        '<span class="hora">' + (m.escrito_at && Math.abs(new Date(m.created_at) - new Date(m.escrito_at)) > 120000 ? '<i title="Escrito sin señal; llegó ' + esc(hora(m.created_at)) + '">⟲</i> ' : '') +
        esc(hora(t)) + tk + '</span><div style="clear:both"></div>', m.id);
      if (mio && tr && tr.estado === 'error') aparte('<div class="sis"><span class="mal">El motor no pudo con este mensaje: ' + esc(tr.error || '') + '. Escríbelo de otra forma o vuelve a intentar.</span></div>');
      if (!mio && m.trabajo_id) {
        // Primero lo que hay que confirmar, luego conceptos y machote (el orden del método).
        if (acc[m.trabajo_id]) aparte(tarjetaAcciones(acc[m.trabajo_id].filter(function (a) { return a.tipo === 'conjetura'; })));
        if (U && U.trabajo_id === m.trabajo_id) aparte(tarjetasRespuesta(U));
        if (OFR && Number(OFR.trabajo_id) === Number(m.trabajo_id)) aparte(tarjetaOferta(OFR));
        // V1.40 · el resumen por rubro, una sola vez: bajo la respuesta más nueva del motor (trae el % al día).
        if (RUB && H.ultima && Number(H.ultima.trabajo_id) === Number(m.trabajo_id)) aparte(tarjetaRubros(RUB));
        // V1.43 · «Supuse esto»: lo deducible se asume con su fuente (viaja en cada respuesta); bajo la más nueva.
        var SUP = (H.ultima && H.ultima.verifica && H.ultima.verifica.supuestos) || [];
        if (SUP.length && Number(H.ultima.trabajo_id) === Number(m.trabajo_id)) aparte(tarjetaSupuestos(SUP));
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
      burbuja('yo', 'pend', '', citaDe(x.datos && x.datos.responde_a, x.texto) +
        adjuntosHtml(x.archivos.map(function (a) { return { local: a.local, blob: a.blob, nombre: a.nombre, clase: a.clase, bytes: a.bytes, duracion_s: a.duracion_s, subido: !!a.adjunto_id }; }), true) +
        (sinMarca(x.texto) ? '<div class="txt">' + esc(sinMarca(x.texto)) + '</div>' : '') +
        (total && x.estado === 'subiendo' ? '<div class="barra"><i style="width:' + Math.round(100 * (subidos + (actual ? Q.progreso(actual.local) : 0)) / total) + '%"></i></div>' : '') +
        '<span class="hora">' + esc(hora(x.escrito_at)) + ' ' + est + '</span><div style="clear:both"></div>' +
        (x.estado === 'error' ? '<div class="corr"><span class="err">' + esc(x.error) + '</span><button class="boton" data-reint="' + esc(x.cliente_id) + '">Reintentar</button><button class="boton" data-desc="' + esc(x.cliente_id) + '">Descartar</button></div>' : ''));
    });
    var RT = ST.retoma;
    if (RT && RT.id === (ST.sel || {}).id && G.CzAvance && G.CzAvance.ultimaActividad(H) === RT.t && !salidaDelCaso().length) {
      dia(new Date().toISOString());
      // V1.46 · el siguiente paso, el de AHORA (el mismo del botón de abajo), no el de cuando se abrió el caso.
      var sgV = G.CzAvance.avance(H).sig, rtSig = sgV ? sgV.txt : RT.sig;
      aparte('<div class="reto" role="status"><div class="rt">' + ico('reloj', 'xs') + (RT.version ? 'Retomamos · actualizaste a ' + esc(RT.version) : 'Retomamos · tu último mensaje fue ' + esc(RT.hace)) + '</div>' +
        '<p>Vas en <b>' + esc(RT.vas) + '</b>.</p>' + (RT.falta.length ? '<p>Falta: ' + esc(RT.falta.join(', ')) + '.</p>' : '') +
        (rtSig ? '<p>Siguiente: <b>' + esc(rtSig) + '</b> (el botón de abajo).</p>' : '') + '</div>');
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
    if (GZ) GZ.decorar();
    if (foco) { var t = $('#msgs [data-borr="' + foco.k + '"]'); if (t) { t.focus(); try { t.setSelectionRange(foco.a, foco.b); } catch (e) {} } }
    ST.scrollProg = Date.now();   // V1.40: este scroll lo hace la pantalla; no esconde la franja
    if (abajo || ST.irAbajo) { M.scrollTop = M.scrollHeight; ST.irAbajo = false; ST.abajoN = 0; }
    else { M.scrollTop = arriba0; ST.abajoN += nuevas; }
    actualizarAbajo();
    if (ST.rubHoja) pintarHojaRubro();
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
    b.style.bottom = ((c ? c.offsetHeight : 56) + (f && f.style.display !== 'none' ? f.offsetHeight : 0) + (bj && bj.style.display !== 'none' ? bj.offsetHeight : 0) + (GZ ? GZ.alto() : 0) + 10) + 'px';
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
      var puedeC = mia(H.caso);
      U.conceptos.forEach(function (k) {
        var kk = 'c:' + k.id, reab = !!ST.reab[kk] && !!decididos[k.id], d = reab ? null : decididos[k.id], e = ST.env[kk], b = ST.borr[kk] || {};
        // V1.34 · sin ✕: «✓ Va» y «✎ Corregir». Corregir abre la cajita (texto o voz); la corrección viaja en el
        // lote como `aceptar` con su razón y `datos.corregido` (el motor la interpreta: si dice que no va, es rechazo).
        var corr = d && d.tipo === 'aceptar' && d.datos && d.datos.corregido;
        h += '<div class="cn" data-con="' + esc(k.id) + '"><div class="fil"><span class="n">' + esc(k.id) + '</span><div class="d">' + esc(k.concepto) + '<small>origen: ' + esc(k.origen || '') + '</small>' +
          (d && d.razon ? '<small class="' + (corr ? 'corr' : 'mal') + '">' + (corr ? '✎ ' : '') + esc(d.razon) + '</small>' : '') + '</div>' +
          (d ? '<span class="hecho' + (d.tipo === 'rechazar' ? ' mal' : corr ? ' corr' : '') + '">' + (corr ? '✎ corregido' : d.tipo === 'aceptar' ? '✓ va' : 'rechazado') + '</span>' : '') + '</div>' +
          (reab ? '<p class="nota reab">↺ Reabierto: vale tu última decisión.</p>' : '') +
          (d && puedeC && !b.abierto ? '<div class="decide">' + botonCambiar(kk) + '</div>' : '') +
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
    var Mq = U.machote, TB = Mq && Mq.tabla && G.CzTabla;
    // V1.48 · la tabla del machote (prototipo aprobado, #4): secciones → subgrupos → renglones, al peso con calc.js de la suite.
    if (TB && (Mq.secciones || []).length) h += G.CzTabla.tabla(Mq, { analisis: analisis(), folio: folioCaso(), puede: mia(H.caso) });
    else if (Mq && (Mq.secciones || []).length) {
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
    // V1.48 · con la tabla, el BOM va abajo, colapsado y con filtros combinables (origen Y estado).
    if (TB && (Mq.secciones || []).some(function (s) { return (s.grupos || []).length; })) h += G.CzTabla.bom(Mq, { puede: mia(H.caso) });
    else if (mat.length || mo.length) {
      h += '<details class="carta"' + (nivelesDe(mat).n.N3 ? ' open' : '') + '><summary><b>BOM a costo</b> · ' + mat.length + ' renglones + ' + mo.length + ' de mano de obra</summary>';
      var NIV = nivelesDe(mat);
      if (NIV.con) h += '<div class="niv-res">' + ['N1', 'N2', 'N3', 'N4', 'N5'].filter(function (k) { return NIV.n[k]; }).map(function (k) {
        return '<span class="niv niv-' + k + '" title="' + esc(NIVEL[k][1]) + '">' + k + ' ' + esc(NIVEL[k][0]) + ' · ' + NIV.n[k] + '</span>'; }).join('') + '</div>';
      // V1.47 (#4 regla de oro 1) · los renglones que la persona decidió: «lo dijiste tú», con el mensaje de donde salió.
      // `propuesta` (la del BOM) no trae `verifica`: los decretos vigentes salen de la última respuesta que los mandó.
      var DEC = ((U.verifica && U.verifica.decretos) || verUlt().decretos || {}).renglones || [];
      var decDe = function (d) { var k = String(d || '').slice(0, 60); return DEC.filter(function (x) { return x.descripcion && String(x.descripcion).slice(0, 60) === k; })[0]; };
      mat.forEach(function (r) {
        var te = r.tienda_existencia || r.tienda || '', sin = /sin existencia|solo (hay )?en|otra ciudad/i.test(te), nv = nivelDe(r), dj = decDe(r.descripcion);
        h += '<div class="bom' + (nv === 'N3' ? ' alerta-n3' : '') + '"><div>' + (NIV.con ? '<span class="niv niv-' + nv + '">' + nv + '</span> ' : '') + '<b>' + esc(r.descripcion) + '</b>' + (r.sku ? ' <span class="sku">' + esc(r.sku) + '</span>' : '') + '</div><div>' + esc(r.qty) + ' ' + esc(r.unidad) + ' · ' + esc(r.tipo) + ' · <b>' + dinero(r.importe, r.moneda) + '</b></div>' +
          '<div class="org">' + [r.formula ? esc(r.formula) : '', r.liga && /^https?:/.test(r.liga) ? '<a href="' + esc(r.liga) + '" target="_blank" rel="noopener">' + esc(r.fuente) + '</a>' :
            /pendiente/i.test(r.fuente || '') ? '<b class="mal">' + esc(r.fuente) + '</b>' : esc(r.fuente || 'sin fuente')].filter(Boolean).join(' · ') + '</div>' +
          (te ? '<span class="tienda' + (sin ? ' sin' : '') + '">' + esc(te) + '</span>' : '') +
          (NIV.con && (nv === 'N3' || nv === 'N4') && r.riesgo ? '<div class="riesgo">⚠ ' + esc(r.riesgo) + '</div>' : '') +
          (dj ? '<div class="dijiste" title="' + esc(dj.decretos.map(function (x) { return x.texto; }).join(' · ')) + '">🔒 lo dijiste tú · ' + esc(dj.decretos.map(function (x) { return x.origen; }).join(', ')) + ': «' + esc(String(dj.decretos[0].texto).replace(/^[«"\s]+|[»"\s]+$/g, '').slice(0, 90)) + '»</div>' : '') + '</div>';
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

  /* ── V1.43 · niveles de precio (decisión de Esteban, 15-oct; herramientas/motor/niveles.js del motor) ───────────
   * N1 Proveedor · N2 Web MX · N3 Lista de referencia ⚠ · N4 Paramétrico ⚠ · N5 Pendiente. N1–N4 cuentan como precio;
   * solo N5 frena la cotización. Un BOM de antes (sin `nivel`) se pinta como antes, sin insignias. */
  var NIVEL = { N1: ['Proveedor', 'Folio, cotización o lo pagado en Odoo del mismo material'], N2: ['Web MX', 'Distribuidor mexicano con liga al producto'],
    N3: ['Referencia', 'Distribuidor de otro país: USD × FIX × internación × 15 % de holgura. Puede variar el precio en México, la entrega, la importación o la garantía.'],
    N4: ['Paramétrico', 'Precio unitario publicado × cantidad calculada por ingeniería, con holgura'], N5: ['Pendiente', 'Sin ninguna referencia pública: falta el precio del proveedor'] };
  function nivelDe(r) {
    var n = String(r.nivel || '').toUpperCase(); if (NIVEL[n]) return n;
    if (r.pu === null || r.pu === undefined || r.pu === '') return 'N5';
    return /odoo|P0\d{3,}|BILL\d|pagado|cotizaci[oó]n|folio|dato (dictado )?de/i.test(r.fuente || '') ? 'N1' : 'N2';
  }
  function nivelesDe(mat) { var n = {}, con = (mat || []).some(function (r) { return !!r.nivel; }); (mat || []).forEach(function (r) { var k = nivelDe(r); n[k] = (n[k] || 0) + 1; }); return { con: con, n: n }; }
  /** «18.4 % del costo es referencia (N3/N4)», con las alertas N3 arriba. `R` = datos.referencias del motor. */
  function referenciasHtml(R, conLista) {
    if (!R || !R.n) return '';
    var din = function (x) { return '$' + Number(x || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };
    var lista = conLista ? (R.lista || []).map(function (x) { return '<li class="' + (x.nivel === 'N3' ? 'n3' : '') + '"><span class="niv niv-' + esc(x.nivel) + '">' + esc(x.nivel) + '</span> ' +
      esc(x.descripcion) + ' · ' + din(x.importe) + (x.riesgo ? '<small> ⚠ ' + esc(x.riesgo) + '</small>' : '') + '</li>'; }).join('') : '';
    return '<div class="ref-cot"><b>' + esc(R.pct) + ' % del costo es referencia (N3/N4)</b>' + (R.n3 ? ' · <span class="alerta">⚠ ' + R.n3 + (R.n3 === 1 ? ' alerta N3' : ' alertas N3') + '</span>' : '') +
      '<span class="nota">Precio de referencia, no de proveedor: N3 es la lista × 1.10 de internación (o × lo que de verdad pagamos, si hay compras); N4 lleva 15 % de holgura. Puede variar el precio en México, la entrega, la importación o la garantía.</span>' +
      (lista ? '<ul>' + lista + '</ul>' : '') + '</div>';
  }
  /** V1.45 (#4 punto 7) · la prueba de sensatez por sección contra la venta parecida ya escalada. Solo las que tienen parecido. */
  function sensatezHtml(S) {
    var con = (S || []).filter(function (x) { return x.parecido; }); if (!con.length) return '';
    return '<div class="sens-cot">' + con.map(function (x) {
      return '<div class="' + (x.alerta ? 'sens-al' : 'sens-ok') + '">' + (x.alerta ? '⚠ <b>ALERTA</b> ' : '✓ ') + '<b>' + esc(x.seccion) + '</b>: ' + esc(x.cuenta).replace(/ %/g, '&nbsp;%') + '</div>'; }).join('') +
      '<span class="nota">Contra la venta parecida ya escalada; más de 50 % arriba o abajo es alerta.</span></div>';
  }
  function tarjetaSupuestos(L) {
    var puede = mia(ST.hilo && ST.hilo.caso);
    return '<div class="carta sup-carta"><h4>💡 Supuse esto · con su fuente</h4><p class="nota">No te lo pregunto: lo deduje. Si algo no va, cámbialo.</p>' + L.map(function (x) {
      var kk = 's:' + x.id, b = ST.borr[kk] || {}, e = ST.env[kk], vz = ST.vozCorr[kk];
      return '<div class="sup" data-sup="' + esc(x.id) + '"><div class="sup-t">' + (x.cambiado ? '<s>' + esc(x.texto) + '</s> ' : '') + esc(x.vigente || x.texto) +
        '<small> · ' + esc(x.fuente || '') + '</small></div>' +
        (vz ? '<span class="hecho corr">🎤 Cambio por voz ' + (vz.decidido ? 'enviado' : 'en cola') + ' · se transcribe</span>' :
         e ? '<span class="hecho corr">' + GIRO + 'enviando…</span>' :
         x.cambiado ? '<span class="hecho repl">↺ Cambiado ' + esc(VIA[x.via] || '') + '</span>' : '') +
        (b.abierto ? cajaRazon(kk, '¿Qué es lo correcto?', 'Cambiar', false) : (puede && !e && !vz ? '<div class="decide"><button type="button" class="cambiar" data-supc="' + esc(x.id) + '">↺ Cambiar</button></div>' : '')) +
        (ST.errBt[kk] && !b.abierto ? '<span class="err-bt">' + esc(ST.errBt[kk]) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  var ETIQ = { alta_contacto: 'Sí, dar de alta', crear_machote: 'Crear machote', crear_borrador: 'Crear borrador en Odoo',
               enviada: 'Ya la mandé', cerrar: 'Sí, ciérrala' };

  /* ── V1.42 · qué gana (#4, correcciones del ingeniero de campo) ───────────────────────────────────────────────
   * La última decisión del AUTOR sobre la misma pregunta gana, venga del botón, del texto o de la voz. Lo vigente lo
   * manda el motor en cada respuesta (`verifica.reemplazos`, de reemplazos.json); un «↺ Cambiar» que el motor todavía
   * no contesta se pinta ya con el valor nuevo y «enviando al motor». La pregunta reemplazada se ve reemplazada:
   * el historial no enseña lo viejo como vigente. */
  function reemplazosDe(H) {
    var m = {}, U = H && H.ultima, t0 = U && U.created_at ? Date.parse(U.created_at) : 0;
    (((U && U.verifica) || {}).reemplazos || []).forEach(function (r) { m[r.objetivo] = { vigente: r.vigente, antes: r.antes, via: r.via, autor: r.autor, at: r.at, veces: r.veces || 1 }; });
    ((H && H.eventos) || []).forEach(function (e) {
      var d = e.datos || {};
      if (e.tipo === 'correccion' && e.concepto === 'cambia' && d.objetivo && Date.parse(e.created_at) > t0)
        m[d.objetivo] = { vigente: d.despues, antes: (m[d.objetivo] || {}).vigente || d.antes, via: d.via, autor: e.autor, at: e.created_at, pendiente: true };
    });
    return m;
  }
  var VIA = { boton: 'con el botón', texto: 'por texto', voz: 'por voz' };
  function lineaReemplazo(rp) {
    return '<span class="hecho repl">↺ Vigente: ' + esc(rp.vigente) + '</span><small class="antes">Reemplazada' + (rp.antes ? ' · antes: ' + esc(rp.antes) : '') +
      ' · ' + esc(VIA[rp.via] || rp.via || '') + (rp.pendiente ? ' · esperando al motor' : '') + '</small>';
  }
  /* V1.42 · quién crea la cotización en Odoo lo dice el SERVIDOR (modo permiso); aquí solo se pinta la leyenda. */
  function leyendaOdoo(tipo) {
    if (!G.CzAcciones || !G.CzAcciones.permiso) return '';
    if (ST.permOdoo === null) { ST.permOdoo = 'cargando'; G.CzAcciones.permiso().then(function (p) { ST.permOdoo = p; pintarChat(); }); return ''; }
    var p = ST.permOdoo; if (!p || p === 'cargando' || p.habilitado) return '';
    if (tipo === 'enviada') return '<p class="nota">En Odoo la marca quien tiene la emisión habilitada: crear y mover la cotización en Odoo todavía no está habilitado para tu usuario.</p>';
    return '<p class="nota">' + esc(p.mensaje || 'Crear la cotización en Odoo todavía no está habilitado para tu usuario.') + '</p>';
  }
  /** Lo releído de Odoo (no el 200): renglón por renglón, la suma y los opcionales fuera del total. */
  function releidoOdoo(r) {
    if (!r || !r.orden_id || !(r.renglones || []).length) return '';
    var din = function (n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    return '<div class="odoo-rb">' + r.renglones.map(function (x) { return esc(String(x.texto || '').slice(0, 70)) + ' · ' + din(x.precio); }).join('<br>') +
      '<br><b>' + r.renglones.map(function (x) { return Number(x.precio || 0).toLocaleString('es-MX'); }).join(' + ') + ' = ' + din(r.subtotal) + ' ' + esc(r.moneda || '') + '</b>' +
      ((r.opcionales || []).length ? '<br>Fuera del total: ' + r.opcionales.map(function (o) { return esc(String(o).slice(0, 60)); }).join(' · ') : '') +
      (r.estado ? '<br>Estado en Odoo: ' + esc(r.estado === 'sent' ? 'Cotización enviada' : r.estado === 'draft' ? 'Borrador' : r.estado) : '') + '</div>';
  }
  /* V1.43 · «Cotizar con referencias»: un toque acepta las referencias (N3/N4) y crea el borrador. Solo se ofrece si el
   * SERVIDOR exige la aceptación (permiso → `referencias: true`); con el workflow viejo, la pantalla no promete nada. */
  function botonReferencias(a) {
    if (ST.permOdoo === null) { leyendaOdoo('crear_borrador'); return '<p class="nota">' + GIRO + 'revisando el permiso…</p>'; }
    var p = ST.permOdoo; if (!p || p === 'cargando') return '<p class="nota">' + GIRO + 'revisando el permiso…</p>';
    if (!p.habilitado) return '<div class="acc"><button class="si" data-hacer="' + a.id + '">Cotizar con referencias</button><button data-descartar="' + a.id + '">No</button></div>' + leyendaOdoo('crear_borrador');
    if (!p.referencias) return '<p class="nota mal">El servidor de Odoo todavía no acepta cotizar con referencias: falta publicar el workflow nuevo. Por ahora este borrador no se crea; el machote sí está al día.</p>' +
      '<div class="acc"><button data-descartar="' + a.id + '">No</button></div>';
    return '<div class="acc"><button class="si" data-refok="' + a.id + '">Cotizar con referencias</button><button data-descartar="' + a.id + '">No</button></div>' +
      '<p class="nota">Al tocarlo aceptas las referencias de arriba; queda registrado en el hilo.</p>';
  }
  function botonCambiar(kk) { return '<button type="button" class="cambiar" data-cambia="' + esc(kk) + '" aria-label="Cambiar esta respuesta">↺ Cambiar</button>'; }
  function tarjetaAcciones(L) {
    var conj = L.filter(function (a) { return a.tipo === 'conjetura'; }), otras = L.filter(function (a) { return a.tipo !== 'conjetura'; }), h = '';
    if (conj.length) {
      var pend = conj.filter(function (a) { return a.estado === 'propuesta'; }).length;
      h += '<div class="carta"><h4>❓ Lo que supongo · confírmalo o corrígelo' + (pend ? ' · <span class="gris">faltan ' + pend + '</span>' : '') + '</h4>';
      var REP = reemplazosDe(ST.hilo), puede = mia(ST.hilo && ST.hilo.caso);
      conj.forEach(function (a) {
        var d = a.datos || {}, r = a.resultado || {}, kk = 'j:' + a.id, e = ST.env[kk], b = ST.borr[kk] || {};
        var rp = REP['conjetura:' + a.id], reab = !!ST.reab[kk] && a.estado !== 'propuesta', decidida = a.estado !== 'propuesta' && !reab;
        h += '<div class="preg' + (rp ? ' reemplazada' : '') + (reab ? ' reabierta' : '') + '" data-preg="' + a.id + '"><p>' + esc(d.pregunta || a.titulo) + '</p>' + (d.conjetura ? '<div class="conj">Supongo: ' + (rp ? '<s>' + esc(d.conjetura) + '</s>' : esc(d.conjetura)) + (d.porque ? '<small> · ' + esc(d.porque) + '</small>' : '') + '</div>' : '') +
          (d.mueve ? '<div class="mueve">' + (/no mueve|sin estimar/i.test(d.mueve) ? '' : 'mueve ') + esc(d.mueve) + '</div>' : '') +
          (ST.vozCorr[kk] && a.estado === 'propuesta' ? '<span class="hecho corr">🎤 Corrección por voz ' + (ST.vozCorr[kk].decidido ? 'enviada' : 'en cola') + ' · se transcribe</span>' : '') +
          (reab ? '<p class="nota reab">↺ Reabierta: vale tu última decisión.' + (rp ? ' Hoy está: ' + esc(rp.vigente) + '.' : '') + '</p>' : '') +
          (decidida && rp ? lineaReemplazo(rp) + (puede ? botonCambiar(kk) : '') :
           decidida ? (a.estado === 'hecha' ? '<span class="hecho">✓ Confirmado</span>' : '<span class="hecho corr">✎ Corregido: ' + esc(r.correccion || '') + '</span>') + (puede ? botonCambiar(kk) : '') :
           b.abierto ? cajaRazon(kk, '¿Qué es lo correcto?', 'Mandar', false) :
           ST.vozCorr[kk] ? '' :
           '<div class="acc" data-acc="' + a.id + '">' + (e === 'confirma' ? '<button class="si enviando" disabled>' + GIRO + 'enviando…</button>' : '<button class="si" data-conf="' + a.id + '">✓ Va</button>') +
           '<button data-corr="' + a.id + '"' + (e ? ' disabled' : '') + '>✎ Corregir</button></div>' + (ST.errBt[kk] ? '<span class="err-bt">' + esc(ST.errBt[kk]) + '</span>' : '')) + '</div>';
      });
      h += (pend ? '<p class="nota">Cuando contestes todas, sigo con los conceptos.</p>' : '') + '</div>';
    }
    // Un machote o un borrador con suposiciones sin contestar saldría con números viejos.
    var pendientes = ((ST.hilo && ST.hilo.acciones) || []).some(function (x) { return x.tipo === 'conjetura' && x.estado === 'propuesta'; });
    // V1.36 · solo el machote más nuevo dice lo que falta: el de antes de actualizar ya no cuenta.
    var ultimoCm = (((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado !== 'descartada'; }).pop() || {}).id;
    var cmPend = ((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'propuesta'; }).pop();
    otras.forEach(function (a) {
      var d = a.datos || {}, r = a.resultado || {}, manejador = G.CzAcciones && G.CzAcciones[a.tipo];
      var espera = pendientes && (a.tipo === 'crear_machote' || a.tipo === 'crear_borrador');
      // V1.46 · un borrador propuesto ANTES de la versión del machote que falta guardar es de la versión anterior.
      var viejo = a.tipo === 'crear_borrador' && a.estado === 'propuesta' && cmPend && cmPend.id > a.id;
      // V1.48 · «Actualizar COT-XXXX» que se entienda: «El agente tiene una versión nueva (total, diferencia) · Guardar en el machote».
      var nueva = a.tipo === 'crear_machote' && a.estado === 'propuesta' && d.actualiza && a.id === ultimoCm ? versionNueva() : null;
      h += '<div class="carta' + (nueva ? ' tb-nueva' : '') + '"><h4>' + ({ alta_contacto: '👤', crear_machote: '📐', crear_borrador: '🧾', enviada: '📨', cerrar: '🔒' }[a.tipo] || '•') + ' ' +
        (nueva ? 'El agente tiene una versión nueva de ' + esc(folioCaso() || 'tu machote') : esc(a.titulo)) + '</h4>' +
        (nueva ? '<p class="tb-dif">' + esc(nueva) + '</p><p class="nota">Tu machote guardado sigue en la versión anterior. Cuando el machote acepte al agente, esto se guarda solo y la tarjeta desaparece.</p>' : '') +
        (d.detalle ? '<div class="odoo">' + md(d.detalle) + '</div>' : '') +
        // V1.36 · lo que falta para cotizar en Odoo, con su número y renglón por renglón.
        (a.tipo === 'crear_machote' && Number(d.n_pendientes) > 0 && a.estado !== 'descartada' && a.id === ultimoCm ? '<div class="pend-cot"><b>' + esc(G.CzAcciones.textoPendientes({ n: Number(d.n_pendientes), lista: d.pendientes || [] })) + '</b>' +
          '<ul>' + (d.pendientes || []).map(function (hh) { return (hh.items && hh.items.length ? hh.items : [hh.titulo]).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join(''); }).join('') + '</ul>' +
          '<span class="nota">El machote sí se crea: esos renglones van sin precio y marcados (N5).</span></div>' : '') +
        // V1.43 · qué parte del costo es referencia (N3/N4), con las alertas N3 arriba.
        ((a.tipo === 'crear_machote' && a.id === ultimoCm) || a.tipo === 'crear_borrador' ? referenciasHtml(d.referencias, a.tipo === 'crear_borrador' && a.estado === 'propuesta') + sensatezHtml(d.sensatez) : '') +
        (a.estado === 'hecha' ? '<span class="hecho">✓ ' + esc(r.texto || 'Hecho') + '</span>' + releidoOdoo(r) :
         a.estado === 'descartada' ? '<span class="hecho gris">' + ((r.reemplazada_por_trabajo) ? 'Reemplazado por una propuesta más nueva' : 'Descartado') + '</span>' :
         espera ? '<p class="nota">Contesta primero las suposiciones pendientes: el machote se arma con lo que confirmes.</p>' :
         viejo ? '<p class="nota">Es de la versión anterior del machote: primero toca «' + esc(cmPend.titulo) + '».</p>' :
         (a.tipo === 'enviada' || a.tipo === 'cerrar' || manejador) ?
           (a.tipo === 'crear_borrador' && d.referencias && d.referencias.n ? botonReferencias(a) :
           '<div class="acc"><button class="si" data-hacer="' + a.id + '">' + esc(nueva ? 'Guardar en el machote' : (d.boton || ETIQ[a.tipo] || 'Hacer')) + '</button><button data-descartar="' + a.id + '">' + (a.tipo === 'cerrar' ? 'Todavía no' : 'No') + '</button></div>') +
           (a.tipo === 'crear_borrador' || a.tipo === 'enviada' ? leyendaOdoo(a.tipo) : '') :
           '<p class="nota">Este botón se enciende cuando se active la escritura a Odoo correspondiente.</p>') + '</div>';
    });
    return h;
  }

  /** V1.48 · «$7,761,174.29 · diferencia +$0.00 · +1 renglón» de la versión nueva que el agente propone guardar. */
  function versionNueva() {
    var H = ST.hilo, M = ((H && (H.propuesta || H.ultima)) || {}).machote; if (!M || typeof M.precio !== 'number') return '';
    var c = M.cambio || {}, n = c.n || {}, p = [dinero(M.precio)];
    if (typeof c.dif === 'number') p.push('diferencia ' + (c.dif >= 0 ? '+' : '−') + dinero(Math.abs(c.dif)));
    if (n.nuevos) p.push('+' + n.nuevos + (n.nuevos === 1 ? ' renglón' : ' renglones'));
    if (n.quitados) p.push('−' + n.quitados + (n.quitados === 1 ? ' renglón' : ' renglones'));
    if (n.precio) p.push(n.precio + (n.precio === 1 ? ' precio nuevo' : ' precios nuevos'));
    if (M.n_pendientes) p.push(M.n_pendientes + (M.n_pendientes === 1 ? ' pendiente' : ' pendientes'));
    return p.join(' · ');
  }
  // ── V1.39 · punto 7 (#4): «¿me permites ir analizando precios…?» ─────────
  /* La oferta la escribe el motor (procesa.js, con el apodo de motor/apodos.json) y su estado llega en cada respuesta
   * en `ultima.verifica.oferta` (sin migración). Aquí solo los tres botones del prototipo aprobado. En este paso las
   * palabras son «machote» y «procura»: nunca «cotización» ni «cotiza». */
  var TXT_ADELANTE = 'Ya terminé: adelante con el machote y la procura de los materiales principales.';   // es el disparador (db/003)
  var TXT_EDITAR = 'Sobre arrancar el machote:';                                                        // procesa.js → ES_EDITAR
  function ofertaDe(H) { var v = H && H.ultima && H.ultima.verifica, o = v && v.oferta; return o && o.trabajo_id ? o : null; }
  function tarjetaOferta(o) {
    var c = (ST.hilo && ST.hilo.caso) || {}, est = (ST.ofEnv && ST.ofEnv[o.trabajo_id]) || o.estado;
    if (c.disparado_at && est === 'ofrecida') est = 'arrancada';
    var h = '<div class="carta of-carta" data-oferta="' + esc(o.trabajo_id) + '"><div class="of-tiene"><b>Ya tengo:</b> ' + esc((o.tengo || []).join(' · ')) +
      ((o.falta || []).length ? '<br><i>Falta:</i> ' + esc(o.falta.join(' · ')) : '') + '</div>';
    if (est === 'arrancada' || est === 'adelante') h += '<div class="of-est">✓ Adelante</div>';
    else if (est === 'esperando') h += '<div class="of-est of-esp">⏸ Esperando más' + (o.esperando && (o.esperando.que || []).length ? ': ' + esc(o.esperando.que.join(', ')) : '') +
      ' · no te vuelvo a preguntar hasta que llegue</div>';
    else if (est === 'editada') h += '<div class="of-est">✎ Contestaste con ajuste</div>';
    else if (!mia(c)) h += '<div class="of-est of-esp">Espera la respuesta de quien abrió la sesión.</div>';
    else {
      h += '<div class="of-bt"><button type="button" class="bt si" data-of="adelante">Adelante</button><button type="button" class="bt" data-of="editar">Editar respuesta</button>' +
        '<button type="button" class="bt of-gris" data-of="esperar">Esperar más</button></div>';
      if (ST.borr['o:editar']) h += cajaRazon('o:editar', 'Tu respuesta (escribe o dicta). Por ejemplo: «sí, pero sin la escalera».', 'Mandar');
      if (ST.borr['o:esperar']) h += ((o.falta || []).length ? '<div class="of-chips">' + o.falta.map(function (f) {
          return '<button type="button" data-ofalta="' + esc(f) + '" class="' + (String((ST.borr['o:esperar'] || {}).texto || '').indexOf(f) >= 0 ? 'on' : '') + '">' + esc(f) + '</button>'; }).join('') + '</div>' : '') +
        cajaRazon('o:esperar', '¿Qué falta? (opcional: escribe, dicta o toca)', 'Esperar');
    }
    return h + '</div>';
  }
  function botonOferta(que) {
    if (que === 'editar' || que === 'esperar') { delete ST.borr['o:' + (que === 'editar' ? 'esperar' : 'editar')]; return abrirCaja('o:' + que); }
    var o = ofertaDe(ST.hilo); if (!o) return;
    var AV = G.CzAvance, f = AV ? AV.faltantes(ST.hilo) : null, falta = (o.falta || []).slice();
    if (f && f.total && !falta.length) falta.push(AV.textoFaltantes(f).replace(/^f/, 'F') + ' del levantamiento');
    modal('<h3>¿Arranco con el machote?</h3><p class="sub">Arranco con el machote y los precios de los materiales principales. Lo que falte va como pregunta con conjetura; lo puedes seguir mandando después.</p>' +
      (falta.length ? '<div class="falta-disp"><b>Lo que falta</b><ul>' + falta.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="acc der"><button class="boton" data-cierra>Todavía no</button><button class="boton si" id="okAdelante">Adelante</button></div>');
    $('#okAdelante').onclick = function () { this.disabled = true; cerrarModal(); contestarOferta('adelante', null, TXT_ADELANTE); };
  }
  function contestarOferta(estado, k, texto) {
    var o = ofertaDe(ST.hilo); ST.ofEnv = ST.ofEnv || {}; if (o) ST.ofEnv[o.trabajo_id] = estado;
    if (k) { if (GR.activa('d-' + k)) GR.basura('d-' + k); delete ST.borr[k]; delete ST.errBt[k]; }
    return mandar(texto).then(function () { pintarFijo(); pintarCabecera(); pintarChat(); });
  }
  /* V1.39 · punto 8, nivel 2 (#4): al actualizar de versión, UN evento ligero «revisa» por caso que podría estar listo para
   * la oferta: abierto, propio, no demo, con actividad en 14 días, sin disparar, con la ciudad confirmada, sin oferta todavía
   * y SIN trabajo en curso. Una vez por caso y por versión (se anota en el teléfono antes de mandarlo). El motor contesta
   * solo la oferta que toque, sin BOM ni búsquedas. Viaja como evento `correccion` con concepto `revisa` (la base no
   * acepta un tipo nuevo sin migración; procesa.js lo reconoce). */
  async function revisarAlActualizar() {
    var sv = G.CzVersion && G.CzVersion.salto ? G.CzVersion.salto() : null; if (!sv || ST.revisado) return;
    ST.revisado = true;
    var quien = yo(), ahora = Date.now(), n = 0;
    // V1.46 (#4) · también los casos ya disparados o con machote: ahí el «revisa» pregunta si una sesión dejó un AVISO
    // (repricing, versión nueva del machote, regla nueva). El motor lo publica sin que la persona escriba; si no hay nada,
    // contesta «Sin cambios pendientes en este caso.» y esa línea no se pinta (SIN_AVISO).
    var L = (ST.casos || []).filter(function (c) {
      return c.autor === quien && (c.estado === 'abierto' || c.estado === 'enviada') && !c.demo && !c.archivada && !Number(c.pendientes || 0) &&
        ahora - Date.parse(c.ultima_actividad_at || c.updated_at || 0) < 14 * 864e5;
    });
    for (var i = 0; i < L.length; i++) {
      var c = L[i], k = 'cz_revisa_v_' + c.id;
      try { if (localStorage.getItem(k) === VERSION) continue; } catch (e) {}
      var r = await C.hilo(c.id); if (!r.ok || !r.hilo) continue;
      var H = r.hilo, hc = H.caso || {};
      if ((H.trabajos || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; })) continue;   // en curso: en otra carga
      try { localStorage.setItem(k, VERSION); } catch (e) {}
      var conAviso = !!(hc.disparado_at || hc.machote_id || ofertaDe(H));
      if (!conAviso && !hc.proyecto_confirmada_at) continue;
      var rv = await C.evento({ caso_id: c.id, tipo: 'correccion', concepto: 'revisa', razon: '', datos: { revisa: true, aviso: true, version: VERSION } });
      if (rv && rv.ok) n++;
      // V1.46 · el caso abierto se relee ya: con el «revisa» en curso el botón deja de ofrecer «Haz la cotización» y el
      // sondeo pasa a rápido, así el aviso aparece en segundos y no a los 20 s.
      if (rv && rv.ok && c.id === (ST.sel || {}).id) cargarHilo().catch(function () {});
    }
    return n;
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
    $$('[data-conf]', M).forEach(function (b) { b.onclick = function () {
      var k = 'j:' + b.dataset.conf;
      if (ST.reab[k]) { var a = accionPorId(b.dataset.conf); return cambiar(k, 'conjetura:' + b.dataset.conf, ((a && a.datos) || {}).conjetura || 'lo que supuse', 'boton'); }
      responder(k, b.dataset.conf, 'hecha', { confirma: true }, 'confirma'); }; });
    $$('[data-corr]', M).forEach(function (b) { b.onclick = function () { abrirCaja('j:' + b.dataset.corr); }; });
    // V1.42 · «↺ Cambiar» reabre el renglón con «✓ Va / ✎ Corregir». No manda nada hasta que decidas.
    $$('[data-cambia]', M).forEach(function (b) { b.onclick = function () { ST.reab[b.dataset.cambia] = true; delete ST.borr[b.dataset.cambia]; pintarChat(); if (ST.rubHoja) pintarHojaRubro(); }; });
    $$('[data-supc]', M).forEach(function (b) { b.onclick = function () { abrirCaja('s:' + b.dataset.supc); }; });   // V1.43
    $$('[data-refok]', M).forEach(function (b) { b.onclick = function () { ST.refAcepta[b.dataset.refok] = true; hacer(b.dataset.refok, b); }; });
    $$('[data-borr]', M).forEach(function (t) { t.oninput = function () { (ST.borr[t.dataset.borr] = ST.borr[t.dataset.borr] || { abierto: true }).texto = t.value; }; });
    $$('[data-cancela]', M).forEach(function (b) { b.onclick = function () { var k = b.dataset.cancela; if (GR.activa('d-' + k)) GR.basura('d-' + k); delete ST.borr[k]; delete ST.errBt[k]; pintarChat(); }; });
    $$('[data-manda]', M).forEach(function (b) { b.onclick = function () { mandarCaja(b.dataset.manda); }; });
    $$('[data-dicta]', M).forEach(function (b) { b.onclick = function () { dictar(b.dataset.dicta); }; });
    $$('[data-of]', M).forEach(function (b) { b.onclick = function () { botonOferta(b.dataset.of); }; });
    $$('.rub-carta [data-rub]', M).forEach(function (b) { b.onclick = function () { abrirRubro(b.dataset.rub); }; });   // V1.40
    $$('[data-ofalta]', M).forEach(function (b) { b.onclick = function () {
      var bb = ST.borr['o:esperar'] = ST.borr['o:esperar'] || { abierto: true, texto: '' }, f = b.dataset.ofalta, L = String(bb.texto || '').replace(/^falta:\s*/i, '').split(/\s*,\s*/).filter(Boolean);
      L = L.indexOf(f) >= 0 ? L.filter(function (x) { return x !== f; }) : L.concat(f);
      bb.texto = L.length ? 'falta: ' + L.join(', ') : ''; pintarChat(); }; });
    GR.enlazar(M);
    if (G.CzTabla) G.CzTabla.enlazar(M, cambiarRenglon, pintarChat);   // V1.48
    $$('[data-vertodo]', M).forEach(function (b) { b.onclick = function () { (ST.verTodo = ST.verTodo || {})[b.dataset.vertodo] = true; pintarChat(); }; });
    var bl = $('#bListo', M); if (bl) bl.onclick = listoSigue;
    var be = $('#bEscribe', M); if (be) be.onclick = function () { var tq = trabajoQueContesta(); ST.abiertoReg = ST.abiertoReg === (tq && tq.id) ? null : (tq && tq.id); pintarChat(); };
    $$('[data-hacer]', M).forEach(function (b) { b.onclick = function () { hacer(b.dataset.hacer, b); }; });
    $$('[data-pdf]', M).forEach(function (b) { b.onclick = verPdf; });
    $$('[data-copia]', M).forEach(function (b) { b.onclick = function () { copiar(b.closest('.carta').querySelector('textarea.copia').value, b); }; });
    $$('[data-descartar]', M).forEach(function (b) { b.onclick = function () { resolver(b.dataset.descartar, 'descartada', {}, b); }; });
  }
  /** V1.48 · «↺ Cambiar» de un renglón que supuso el agente: abre la caja de abajo con el renglón citado; lo que la persona
   *  escriba (o dicte) es su decisión y gana (regla de oro 1: queda como decreto). */
  function cambiarRenglon(desc) {
    var i = $('#in'); if (!i) return;
    i.value = 'Sobre el renglón «' + String(desc || '').split(' — ')[0].slice(0, 90) + '»: '; autoAlto(); pintarComposer(); i.focus();
    try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) {}
  }
  /** El folio del machote del caso (COT-XXXX), si ya se guardó. */
  function folioCaso() {
    var c = (ST.hilo && ST.hilo.caso) || {}, hecho = ((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return x.tipo === 'crear_machote' && x.estado === 'hecha'; }).pop();
    return (hecho && hecho.resultado && hecho.resultado.folio) || c.machote_folio || null;
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
  function abrirCaja(k) { ST.borr[k] = ST.borr[k] || { abierto: true, texto: '' }; ST.borr[k].abierto = true; delete ST.errBt[k]; pintarChat();
    var t = (ST.rubHoja && $('#rubHoja [data-borr="' + k + '"]')) || $('[data-borr="' + k + '"]'); if (t) t.focus(); }
  function sinSenal(r) { return r && r.clase === 'red' ? 'Sin señal: no se mandó. Toca otra vez.' : (r && (r.mensaje || r.error)) || 'No se pudo.'; }
  function mandarCaja(k) {
    var b = ST.borr[k] || {}, txt = String(b.texto || '').trim();
    // V1.39 · punto 7: la respuesta a la oferta va como mensaje; el motor la reconoce por su arranque.
    // V1.40 · el porqué de «En espera de datos» de un rubro.
    if (k === 'r:espera') { var rr = rubroDe(ST.rubHoja); if (!rr) return; return cambiarRubro('espera', rr, txt.replace(/^falta:\s*/i, 'falta ')); }
    if (k === 'o:esperar') return contestarOferta('esperando', k, 'Esperar más' + (txt ? ': ' + txt.replace(/^falta:\s*/i, 'falta ') : '.'));
    if (k === 'o:editar') {
      if (txt.length < 2) { b.err = 'Escribe o dicta tu respuesta.'; return pintarChat(); }
      return contestarOferta('editada', k, TXT_EDITAR + ' ' + txt);
    }
    if (txt.length < 3) { b.err = 'Escribe o dicta ' + (k.indexOf('c:') === 0 ? 'qué cambia' : 'lo correcto') + ' (3 letras mínimo).'; return pintarChat(); }
    if (k.indexOf('c:') === 0) return decidirConcepto(k.slice(2), 'aceptar', txt, { corregido: true });
    if (k.indexOf('s:') === 0) return cambiar(k, 'supuesto:' + k.slice(2), txt, b.voz ? 'voz' : 'texto');   // V1.43
    if (ST.reab[k]) return cambiar(k, 'conjetura:' + k.slice(2), txt, b.voz ? 'voz' : 'texto');
    return responder(k, k.slice(2), 'descartada', { correccion: txt }, 'corrige');
  }
  function accionPorId(id) { return ((ST.hilo && ST.hilo.acciones) || []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
  /** V1.42 · el valor vigente de una pregunta: el último reemplazo, o lo que se decidió con el botón. */
  function vigenteDe(objetivo) {
    var rp = reemplazosDe(ST.hilo)[objetivo]; if (rp) return rp.vigente;
    var ms = /^supuesto:(.+)$/.exec(objetivo);
    if (ms) { var sp = ((ST.hilo && ST.hilo.ultima && ST.hilo.ultima.verifica && ST.hilo.ultima.verifica.supuestos) || []).filter(function (x) { return x.id === ms[1]; })[0]; return sp ? sp.vigente || sp.texto : ''; }
    var m = /^conjetura:(.+)$/.exec(objetivo), a = m && accionPorId(m[1]); if (!a) return '';
    return a.estado === 'descartada' ? ((a.resultado || {}).correccion || '') : ((a.datos || {}).conjetura || '');
  }
  /** «↺ Cambiar» de una conjetura: evento `correccion`/`cambia` (la base ya lo acepta y le da trabajo al motor). */
  async function cambiar(k, objetivo, despues, via) {
    ST.env[k] = 'cambia'; delete ST.errBt[k]; pintarChat();
    var r = await C.evento({ caso_id: ST.hilo.caso.id, tipo: 'correccion', concepto: 'cambia', razon: '',
      datos: { objetivo: objetivo, antes: vigenteDe(objetivo), despues: String(despues).trim(), via: via } });
    delete ST.env[k];
    if (!r.ok) { ST.errBt[k] = sinSenal(r); pintarChat(); return false; }
    delete ST.reab[k]; delete ST.borr[k]; ST.irAbajo = true; await cargarHilo(); return true;
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
    GR.iniciar('d-' + k, { chico: true, etiquetaEnviar: /^[jcs]:/.test(k) ? 'Enviar' : 'Terminar y transcribir', alCambiar: function () { pintarChat(); },
      alTerminar: function (nota) {
        if (!nota || nota.duracion_s < 1) { b.err = 'Muy corta: mantén grabando al menos un segundo.'; return pintarChat(); }
        // V1.43 (#4 punto 10) · en «✎ Corregir» de una conjetura, un concepto o un supuesto, la nota se MANDA tal cual
        // (como en el chat principal, por la cola: sin señal espera en el teléfono) y la transcripción va en segundo plano.
        if (/^[jcs]:/.test(k)) return corregirPorVoz(k, nota);
        return subirDictado(k, nota);
      } }).catch(function (e) { b.err = e && e.name === 'NotAllowedError' ? 'Da permiso al micrófono para dictar.' : 'No se pudo grabar: ' + (e.message || e); pintarChat(); });
  }
  /* V1.43 · corrección por voz sin esperar a la transcripción. La nota entra a la cola como mensaje del caso con una
   * primera línea que la liga a su pregunta («✎ Corrección por voz · conjetura:63 · «…»»): el motor la lee en hilo.md,
   * la transcribe y la toma como la corrección de ESA pregunta (PROCESAR §3i). La decisión (✎ en la conjetura, el
   * concepto o el «↺ Cambiar») se registra en cuanto hay señal; sin señal queda pendiente y sale sola al volver. */
  function objetivoDe(k) { var t = k.slice(0, 1), id = k.slice(2); return t === 'j' ? 'conjetura:' + id : t === 'c' ? 'concepto:' + id : 'supuesto:' + id; }
  function preguntaDe(k) {
    var t = k.slice(0, 1), id = k.slice(2);
    if (t === 'j') { var a = accionPorId(id); return a ? ((a.datos || {}).pregunta || a.titulo) : ''; }
    if (t === 's') return vigenteDe('supuesto:' + id);
    var U = ST.hilo && ST.hilo.ultima, c = ((U && U.conceptos) || []).filter(function (x) { return String(x.id) === id; })[0]; return c ? c.concepto : id;
  }
  var PEND_VOZ = 'cz_corr_voz_pend';
  function pendVoz() { try { return JSON.parse(localStorage.getItem(PEND_VOZ) || '[]'); } catch (e) { return []; } }
  function ponPendVoz(L) { try { localStorage.setItem(PEND_VOZ, JSON.stringify(L.slice(-50))); } catch (e) {} }
  async function corregirPorVoz(k, nota) {
    var caso = ST.hilo && ST.hilo.caso && ST.hilo.caso.id; if (!caso) return;
    var obj = objetivoDe(k), preg = String(preguntaDe(k) || '').replace(/\s+/g, ' ').slice(0, 90);
    await Q.encolar(destino(), '✎ Corrección por voz · ' + obj + ' · «' + preg + '»', [nota], nota.escrito_at);
    delete ST.borr[k]; ST.vozCorr[k] = { at: Date.now(), decidido: false }; ST.irAbajo = true;
    var L = pendVoz(); L.push({ k: k, caso: caso, obj: obj, reab: !!ST.reab[k] }); ponPendVoz(L);
    await refrescarSalida(); pintarChat();
    decidirVozPendientes();
  }
  var decidiendoVoz = false;
  async function decidirVozPendientes() {
    if (decidiendoVoz || !navigator.onLine || !ST.hilo) return;
    decidiendoVoz = true;
    try {
      var L = pendVoz(), quedan = [];
      for (var i = 0; i < L.length; i++) {
        var x = L[i]; if (x.caso !== ST.hilo.caso.id) { quedan.push(x); continue; }
        var txt = '🎤 Por voz: va en la nota de voz (se transcribe)', t = x.k.slice(0, 1), id = x.k.slice(2), r;
        if (t === 's' || x.reab) r = await C.evento({ caso_id: x.caso, tipo: 'correccion', concepto: 'cambia', razon: '', datos: { objetivo: x.obj, antes: vigenteDe(x.obj), despues: txt, via: 'voz' } });
        else if (t === 'j') { var a = accionPorId(id); r = a && a.estado !== 'propuesta' ? { ok: true } : await C.accion({ accion_id: String(id), decision: 'descartada', resultado: { correccion: txt, voz: true } }); }
        else r = await C.evento({ caso_id: x.caso, tipo: 'aceptar', concepto: id, razon: txt, datos: { corregido: true, voz: true } });
        if (r && r.ok) { if (ST.vozCorr[x.k]) ST.vozCorr[x.k].decidido = true; delete ST.reab[x.k]; }
        else if (r && r.clase === 'red') quedan.push(x);
      }
      ponPendVoz(quedan);
    } finally { decidiendoVoz = false; }
    await cargarHilo();
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
      if (a && a.transcripcion) { b.texto = (b.texto ? b.texto.replace(/\s+$/, '') + ' ' : '') + a.transcripcion.trim(); b.transcribiendo = false; b.voz = true; delete b.adjunto; }
      else if (Date.now() - b.desde > 120000 && !b.tarda) { b.tarda = true; b.err = 'La transcripción está tardando: puedes escribirlo mientras.'; }
    });
    if (!navigator.onLine || !ST.hilo) return;
    if (pendVoz().length) decidirVozPendientes();
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
    var cambio = null;
    if (ST.reab[kk]) {   // V1.42 · concepto reabierto: la decisión nueva gana; lleva lo de antes para el rastro.
      var prev = ((ST.hilo.eventos || []).filter(function (x) { return x.concepto === id && (x.tipo === 'aceptar' || x.tipo === 'rechazar'); }).pop()) || null;
      cambio = { cambio: true, antes: prev ? (prev.tipo === 'rechazar' ? 'rechazado: ' + (prev.razon || '') : prev.datos && prev.datos.corregido ? prev.razon : 'va') : '',
                 via: razon ? ((ST.borr[kk] || {}).voz ? 'voz' : 'texto') : 'boton' };
    }
    var r = await C.evento({ caso_id: ST.hilo.caso.id, tipo: tipo, concepto: k.id, razon: razon || '', datos: Object.assign({ concepto: k.concepto, origen: k.origen }, extra || {}, cambio || {}) });
    delete ST.env[kk];
    if (r.ok) delete ST.reab[kk];
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
    if (a.tipo === 'enviada' && !(G.CzAcciones && G.CzAcciones.enviada)) return resolver(id, 'hecha', { texto: 'Marcada como enviada al cliente' }, b);
    if (a.tipo === 'cerrar') return confirmarCierre(function () { return resolver(id, 'hecha', { texto: 'Cerrada a mano' }, b); });
    var m = G.CzAcciones && G.CzAcciones[a.tipo]; if (!m) return;
    b.disabled = true;
    try {
      // El manejador hace la escritura con su propio endpoint (machote-guardar,
      // orden-crear-v2, odoo-alta) y devuelve {ok, resultado} o {ok:false, mensaje}.
      var r = await m(a, { caso: ST.hilo.caso, hilo: ST.hilo, toast: toast, modal: modal, cerrarModal: cerrarModal, aceptaReferencias: !!ST.refAcepta[id] });
      delete ST.refAcepta[id];
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
    var r = GZ ? GZ.respondiendo() : null;
    if (/^\/cierre\b/i.test(t)) return confirmarCierre(function () { if (GZ) GZ.enviada(); return mandar(t, r); });
    if (GZ) GZ.enviada();
    return mandar(t, r);
  }
  /** `resp` = id del mensaje citado (deslizar a la derecha). Viaja en `datos.responde_a`, que ya va firmado.
   *  Con un servidor que todavía no guarda `responde_a` (sin la migración 0009), además se antepone al texto la
   *  línea marcador de shared/chat/chat-gestos.js — salvo en «/cierre» y en el disparador («ya es todo»…), que la
   *  base reconoce por cómo EMPIEZA el texto: ahí solo viaja `datos`. */
  async function mandar(t, resp) {
    if (ST.franjaAbierta) abrirFranja(false);   // V1.40: mandar un mensaje esconde la franja
    var arch = ST.bandeja.slice(); ST.bandeja = [];
    $('#in').value = ''; autoAlto(); pintarComposer();
    var datos = null;
    if (resp !== null && resp !== undefined) {
      datos = { responde_a: resp };
      if (CG && !servidorConCitas() && !/^\s*\//.test(t) && !DISPARO.test(t)) { var d = gestoDe(resp); t = CG.marcador.armar(resp, d ? d.texto : '', t); }
    }
    await Q.encolar(destino(), t, arch, undefined, datos); ST.irAbajo = true; await refrescarSalida();
    return true;
  }
  /* ── V1.39 · citas ────────────────────────────────────────────────────
   * Servidor nuevo = el hilo trae la llave `responde_a` en sus mensajes (migración 0009). Sin ella, la cita
   * se reconstruye del marcador al principio del texto. Con ella, de la columna (y si un mensaje viejo trae
   * marcador, también se respeta). */
  function servidorConCitas() { return ((ST.hilo && ST.hilo.mensajes) || []).some(function (m) { return Object.prototype.hasOwnProperty.call(m, 'responde_a'); }); }
  function sinMarca(t) { return CG ? CG.marcador.quitar(t) : (t || ''); }
  function msgPorId(id) { return ((ST.hilo && ST.hilo.mensajes) || []).filter(function (m) { return String(m.id) === String(id); })[0] || null; }
  /** Lo que el componente necesita de un mensaje: quién lo dijo, su texto (o la transcripción si es nota de voz). */
  function gestoDe(id) {
    var m = msgPorId(id); if (!m) return null;
    var t = sinMarca(m.texto).trim(), meta = adjuntosPorId(), voz = null;
    (m.adjuntos || []).forEach(function (a) { var x = Object.assign({}, a, meta[a.id] || {}); if (!voz && x.clase === 'audio') voz = x; });
    var quien = m.rol === 'usuario' ? (m.autor && m.autor === yo() ? 'Tú' : nombreCorto(m.autor)) : 'Conceptualizador';
    if (t) return { quien: quien, texto: t, voz: false };
    if (voz) return { quien: quien, texto: voz.transcripcion || '', voz: true };
    var f = (m.adjuntos || []).length;
    return { quien: quien, texto: f ? (f === 1 ? '1 archivo' : f + ' archivos') : '', voz: false };
  }
  function citaDe(ref, texto) {
    if (!CG) return '';
    var mk = CG.marcador.leer(texto);
    if ((ref === null || ref === undefined) && mk) ref = mk.id;
    if (ref === null || ref === undefined) return '';
    var d = gestoDe(ref);
    return CG.citaHtml(ref, d ? d.quien : 'Mensaje', d ? (d.voz ? '🎤 ' : '') + (d.texto || (d.voz ? 'Nota de voz' : 'Mensaje')) : (mk ? mk.extracto : 'Mensaje'));
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
      ST.retomaPara = s.id; var rt = G.CzAvance.retomamos(r.hilo, Date.now(), { version: tocaRetomarPorVersion(r.hilo) });
      ST.retoma = rt ? Object.assign({ id: s.id, t: G.CzAvance.ultimaActividad(r.hilo) }, rt) : null;
    }
    ST.hilo = r.hilo; registrarPasos(r.hilo); revisarDictados(); pintarChat();
    // Recién mandado: si el motor ya tiene trabajo, la siguiente consulta no espera los 20 s.
    if (enCurso() && ST.sondeoMs > 2500) sondear();
  }
  /* V1.38 (#4 punto 8, nivel 1) · Recién actualizado (botón «Actualizar» o recarga dura con versión nueva), cada caso
   * abierto muestra su paso SIN que la persona escriba: «Retomamos» sale aunque no hayan pasado 2 h, UNA vez por caso y
   * por versión (se anota en el teléfono). Todo sale de Postgres; no hay trabajo del motor. Devuelve la versión o null. */
  function tocaRetomarPorVersion(H) {
    var sv = G.CzVersion && G.CzVersion.salto ? G.CzVersion.salto() : null, c = (H && H.caso) || {};
    if (!sv || !c.id || (c.estado && c.estado !== 'abierto')) return null;
    var k = 'cz_retoma_v_' + c.id;
    try { if (localStorage.getItem(k) === VERSION) return null; localStorage.setItem(k, VERSION); } catch (e) {}
    return VERSION;
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
    if (!ST.sel || ST.sel.id !== sel.id || ST.sel.local !== sel.local) {
      pararVoz();
      if (GZ) { GZ.quitarSeleccion(); GZ.enviada(); }   // la cita y la selección son del caso que se deja
      cerrarHojaRubro(); ST.rubEnv = {}; ST.franjaAbierta = false;   // V1.40: la hoja y los envíos de rubro son del caso que se deja
    }
    ST.sel = sel; guardarSel(); ST.hilo = null; ST.vistos = null; ST.bandeja = []; ST.irAbajo = true;
    if (G.CzTabla) G.CzTabla.reiniciar();   // V1.48 · lo abierto y los filtros de la tabla y del BOM son de cada caso
    $('#app').classList.remove('en-menu'); $('#app').classList.add('ver-chat'); pintarLista(); pintarChat(); pintarComposer();
    await cargarHilo(); sondear();
    // V1.41 · ya NO se pide el permiso de notificaciones al abrir un chat: sin gesto, iPhone lo ignora y Chrome lo
    // marca como molesto. Se pide solo desde la pantalla de permisos (cz-push.js), cuando la persona toca «Activar».
  }

  function esCompu() { try { return !G.matchMedia('(pointer: coarse)').matches; } catch (e) { return innerWidth >= 900; } }
  G.CzApp = { VERSION: VERSION, arrancar: async function () {
    if (G.__ftsSinAcceso) return;
    $('#lArch').insertAdjacentHTML('afterbegin', ico('clip')); $('#lCam').insertAdjacentHTML('afterbegin', ico('camara'));
    $('#in').oninput = function () { autoAlto(); pintarComposer(); };
    /* V1.43 (#4 punto 9) · en compu: Enter envía; Shift+Enter y Alt+Enter hacen salto de línea. En teléfono (puntero
     * grueso) Enter sigue siendo salto de línea y se envía con el botón. */
    $('#in').onkeydown = function (e) {
      if (e.key !== 'Enter' || e.isComposing || !esCompu()) return;
      if (e.altKey && !e.shiftKey) { e.preventDefault(); var t = this, a = t.selectionStart, z = t.selectionEnd; t.value = t.value.slice(0, a) + '\n' + t.value.slice(z); t.selectionStart = t.selectionEnd = a + 1; autoAlto(); pintarComposer(); return; }
      if (e.shiftKey) return;
      e.preventDefault(); enviar();
    };
    /* V1.43 (#4 punto 8) · ráfaga de fotos dentro de la app; sin cámara en vivo, el <input capture> de siempre. */
    $('#lCam').addEventListener('click', function (e) {
      if (e.target && e.target.id === 'fCam') return;            // el clic sintético del respaldo
      if (!G.CzCamara || !G.CzCamara.puede()) return;
      e.preventDefault();
      G.CzCamara.abrir({ alAceptar: function (L) { agregarArchivos(L); }, aviso: toast,
        alFallar: function () { $('#fCam').click(); } });
    });
    /* V1.43 (#4 punto 11) · con MOUSE se selecciona y copia texto; deslizar-para-responder es solo con el dedo.
     * shared/chat/chat-gestos.js no se toca (lo comparten Marketing y el núcleo de WhatsApp). Aquí, en captura: si el
     * mouse ARRASTRA sobre una burbuja, su pointermove no llega a los gestos y se les manda un pointercancel (sueltan la
     * burbuja y su temporizador), así el navegador selecciona texto. Mantener presionado sin mover sigue seleccionando
     * el mensaje como antes, y «Responder» queda en el menú ⌄ y el clic derecho. */
    var ratonG = null;
    $('#msgs').parentNode.addEventListener('pointerdown', function (e) {
      ratonG = null;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      var b = e.target.closest && e.target.closest('#msgs [data-chg-id]'); if (!b) return;
      if (e.target.closest('button, a, input, textarea, select, [data-onda], [role="slider"], .chg-cita, .chg-chev')) return;
      ratonG = { x: e.clientX, y: e.clientY, cancelado: false };
    }, true);
    G.addEventListener('pointermove', function (e) {
      if (!ratonG || e.pointerType !== 'mouse') return;
      e.stopPropagation();
      if (!ratonG.cancelado && Math.abs(e.clientX - ratonG.x) + Math.abs(e.clientY - ratonG.y) > 6) {
        ratonG.cancelado = true;
        G.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'mouse', bubbles: true }));
      }
    }, true);
    G.addEventListener('pointerup', function () { ratonG = null; }, true);
    $('#bEnviar').onclick = enviar;
    if (CG) GZ = CG.enganchar({
      contenedor: $('#msgs'), cabecera: $('#ch'), antesDe: $('.compose'),
      mensaje: gestoDe, puedeReenviar: function () { return false; }, razonReenviar: RAZON_REENVIAR,
      onResponder: function () { try { $('#in').focus(); } catch (e) {} actualizarAbajo(); },
      alCambiar: actualizarAbajo, aviso: function (t) { toast(t); }
    });
    $('#fArch').onchange = function () { agregarArchivos(this.files); this.value = ''; };
    $('#fCam').onchange = function () { agregarArchivos(this.files); this.value = ''; };
    G.addEventListener('online', function () { pintarSenal(); pintarCabecera(); revisarDictados(); });
    G.addEventListener('offline', function () { pintarSenal(); pintarCabecera(); });
    $('#bAbajo').insertAdjacentHTML('afterbegin', ico('abajo2'));
    $('#bAbajo').onclick = function () { var M = $('#msgs'); M.scrollTo({ top: M.scrollHeight, behavior: 'smooth' }); ST.abajoN = 0; };
    $('#msgs').addEventListener('scroll', actualizarAbajo, { passive: true });
    enlazarFranja();
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ST.rubHoja) cerrarHojaRubro(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sondear(true); });
    Q.oir(function (e) { refrescarSalida(); if (e && e.enviado) cargarHilo(); });
    await Q.iniciar();
    ST.locales = await Q.casosLocales(); ST.salida = await Q.salida();
    pintarLista(); pintarComposer();
    await cargarCasos(); pintarLista();
    if (ST.sel) abrir(ST.sel);
    sondear();
    revisarAlActualizar().catch(function () {});
  },
  // V1.41 (cz-push.js) · al tocar un aviso: abrir ese caso, y «Adelante» con la confirmación de siempre (nunca dispara solo).
  abrirCaso: function (id) { return abrir({ id: id }); },
  disparo: function () { var m = modoDisparo(); if (!m) return toast('Esta sesión ya arrancó: no hay nada que confirmar.'); confirmarDisparo(m); },
  _st: ST };
})(window);
