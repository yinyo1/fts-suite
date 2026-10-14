/* ═══ Conceptualizador · pantalla tipo WhatsApp ═══
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
  var VERSION = 'V1.20';
  var C = G.CzCliente, Q = G.CzCola, Me = G.CzMedios;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ST = { sel: null, casos: [], locales: [], salida: [], hilo: null, motor: null, filtro: 'vivas', aprendio: null,
             urls: {}, cargando: {}, bandeja: [], rec: null, sondeo: null, vistos: null, decidiendo: {} };
  try { var g = JSON.parse(sessionStorage.getItem('cz_sel') || 'null'); if (g && (g.id || g.local)) ST.sel = g; } catch (e) {}

  // ── utilidades ─────────────────────────────────────────────────────────
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3400); }
  function aviso(r) { if (!r || r.ok) return; toast(r.clase === 'red' ? 'Sin conexión. Se reintenta solo.' : (r.mensaje || ('No se pudo: ' + (r.error || 'error')))); }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(t) { return t ? new Date(t) : null; }
  function hora(t) { var d = fecha(t); return d ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function diaDe(t) { var d = fecha(t); return d ? d.getDate() + ' de ' + MES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') : ''; }
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
  function sesionesVisibles() {
    var loc = ST.locales.filter(function (l) { return !l.caso_id; }).map(function (l) {
      return { local: l.local_id, titulo: l.titulo, cliente: l.cliente, estado: 'local', ultima_actividad_at: new Date(l.creado).toISOString(), ultimo: null }; });
    var srv = ST.casos.map(function (c) { return Object.assign({ id: c.id }, c); });
    var F = { vivas: ['local', 'abierto', 'enviada'], cerradas: ['cerrado'], archivadas: ['archivado'], todas: null }[ST.filtro];
    return loc.concat(srv).filter(function (c) { return !F || F.indexOf(c.estado) >= 0; });
  }
  function pintarLista() {
    var L = sesionesVisibles(), sel = ST.sel || {};
    var cuenta = function (f) { return ST.casos.filter(function (c) { return f.indexOf(c.estado) >= 0; }).length; };
    var h = '<button class="nueva" id="bNueva">＋ Nueva cotización</button>' +
      '<div class="filtros">' + [['vivas', 'En curso', cuenta(['abierto', 'enviada']) + ST.locales.filter(function (l) { return !l.caso_id; }).length],
        ['cerradas', 'Cerradas', cuenta(['cerrado'])], ['archivadas', 'Archivadas', cuenta(['archivado'])], ['todas', 'Todas', null]].map(function (f) {
        return '<button data-f="' + f[0] + '" class="' + (ST.filtro === f[0] ? 'on' : '') + '">' + f[1] + (f[2] !== null ? ' <b>' + f[2] + '</b>' : '') + '</button>'; }).join('') + '</div>';
    if (!L.length) h += '<p class="vacio">' + (ST.filtro === 'vivas' ? 'No hay cotizaciones en curso. Abre una con «Nueva cotización» y platícale el trabajo.' : 'Nada aquí.') + '</p>';
    L.forEach(function (c) {
      var u = c.ultimo, prev = c.estado === 'local' ? 'Se da de alta al volver la señal' :
        u ? (u.rol === 'motor' ? '' : u.rol === 'sistema' ? '⚙ ' : '✓ ') + (u.texto ? u.texto : (u.adjuntos ? '📎 ' + u.adjuntos + ' adjunto' + (u.adjuntos > 1 ? 's' : '') : '')) : 'Sin mensajes';
      var on = (c.id && sel.id === c.id) || (c.local && sel.local === c.local);
      h += '<div class="ses' + (on ? ' on' : '') + '" data-id="' + esc(c.id || '') + '" data-local="' + esc(c.local || '') + '">' +
        '<div class="av" style="background:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div><div class="tx">' +
        '<div class="t"><span>' + esc(c.titulo) + '</span><span class="h">' + esc(corto((u && u.created_at) || c.ultima_actividad_at)) + '</span></div>' +
        '<div class="u">' + chip(c.estado) + (c.demo ? ' <span class="est archivada">demo</span>' : '') + ' ' + esc(prev) + '</div></div>' +
        (Number(c.acciones) ? '<span class="badge" title="Botones esperando tu decisión">' + c.acciones + '</span>' : '') + '</div>';
    });
    h += '<p class="pie">Una sesión por cotización · <a href="#" id="bAprendio">Lo que aprendió</a> · ' + VERSION + '</p>';
    $('#lista').innerHTML = h;
    $('#bNueva').onclick = nuevaCotizacion;
    $('#bAprendio').onclick = function (e) { e.preventDefault(); verAprendio(); };
    $$('#lista .filtros button').forEach(function (b) { b.onclick = function () { ST.filtro = b.dataset.f; pintarLista(); }; });
    $$('#lista .ses').forEach(function (s) { s.onclick = function () { abrir({ id: s.dataset.id || null, local: s.dataset.local || null }); }; });
  }
  var PALETA = ['#128c7e', '#075e54', '#5d4037', '#455a64', '#6d4c41', '#00796b', '#37474f', '#795548'];
  function color(t) { var n = 0; String(t || '').split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 997; }); return PALETA[n % PALETA.length]; }

  function nuevaCotizacion() {
    modal('<h3>Nueva cotización</h3><p class="sub">Una sesión por cotización. Después platícale todo: texto, notas de voz, fotos, PDFs.</p>' +
      '<label class="lb">Título corto<input id="nTit" maxlength="120" placeholder="Ej. reubicación de pantallas y audio"></label>' +
      '<label class="lb">Cliente (como lo conozcas; lo busco en Odoo)<input id="nCli" maxlength="120" placeholder="Ej. nombre corto o razón social"></label>' +
      '<label class="lb">País<select id="nPais"><option value="mx">México · MXN</option><option value="usa">USA · USD</option></select></label>' +
      '<div class="acc der"><button class="boton" data-cierra>Cancelar</button><button class="boton si" id="nOk">Abrir</button></div>');
    $('#nOk').onclick = async function () {
      var t = $('#nTit').value.trim(); if (!t) return toast('Ponle un título corto.');
      var c = await Q.nuevaSesion({ titulo: t, cliente: $('#nCli').value.trim(), pais: $('#nPais').value });
      cerrarModal(); ST.locales = await Q.casosLocales(); abrir({ local: c.local_id });
    };
    setTimeout(function () { var i = $('#nTit'); if (i) i.focus(); }, 50);
  }

  // ── chat ───────────────────────────────────────────────────────────────
  function casoActual() {
    var s = ST.sel || {};
    if (s.id) return ST.casos.filter(function (c) { return c.id === s.id; })[0] || (ST.hilo && ST.hilo.caso && ST.hilo.caso.id === s.id ? ST.hilo.caso : null);
    var l = ST.locales.filter(function (x) { return x.local_id === s.local; })[0];
    return l ? { titulo: l.titulo, cliente: l.cliente, estado: 'local' } : null;
  }
  function pintarCabecera() {
    var c = casoActual() || { titulo: '…' }, m = ST.motor;
    var sub = !navigator.onLine ? 'sin señal · lo que escribas se guarda' :
      !m ? 'conectando…' : m.modo === 'rapido' ? 'motor rápido · en línea' : 'respaldo · contesta en minutos';
    if (ST.hilo && (ST.hilo.trabajos || []).some(function (t) { return t.estado === 'tomado'; })) sub = 'escribiendo…';
    $('#ch').innerHTML = '<button class="vuelve" id="bVuelve" aria-label="Volver">&#8592;</button>' +
      '<div class="av" style="background:#fff;color:' + color(c.titulo) + '">' + esc(iniciales(c.cliente || c.titulo)) + '</div>' +
      '<div class="tx"><b>' + esc(c.titulo) + '</b><small>' + esc(sub) + '</small></div>' +
      '<button class="btl" id="bMenu" aria-label="Opciones">⋮</button>';
    $('#bVuelve').onclick = function () { $('#app').classList.remove('ver-chat'); ST.sel = null; guardarSel(); pintarLista(); };
    $('#bMenu').onclick = menuSesion;
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
    var M = $('#msgs'), abajo = M.scrollHeight - M.scrollTop - M.clientHeight < 80, H = ST.hilo;
    pintarCabecera(); pintarSenal();
    var h = '', ultimoDia = '';
    var dia = function (t) { var d = diaDe(t); if (d && d !== ultimoDia) { ultimoDia = d; h += '<div class="dia"><span>' + esc(d) + '</span></div>'; } };
    var meta = adjuntosPorId();
    var acc = accionesPorTrabajo(), pintadas = {};
    var U = H && (H.propuesta || H.ultima), porTrabajo = {}; ((H && H.trabajos) || []).forEach(function (t) { porTrabajo[t.id] = t; });
    if (!H && !(ST.sel || {}).local) h += '<div class="sistema"><span>Cargando…</span></div>';
    if ((ST.sel || {}).local && !(H && H.mensajes && H.mensajes.length)) h += '<div class="sistema"><span>Platícale el trabajo: texto, notas de voz, fotos y PDFs. Cuando termines escribe «ya es todo».</span></div>';
    ((H && H.mensajes) || []).forEach(function (m) {
      var t = m.escrito_at || m.created_at; dia(t);
      if (m.rol === 'sistema') { h += '<div class="sistema"><span>' + esc(m.texto) + '</span></div>'; return; }
      var yo = m.rol === 'usuario', tr = m.trabajo_id && porTrabajo[m.trabajo_id];
      var tk = yo ? tick(tr) : '';
      h += '<div class="b ' + (yo ? 'yo' : 'el') + '">' + (yo ? '' : '<div class="quien">Conceptualizador' + (/respaldo/.test(m.autor) ? ' · respaldo' : '') + '</div>') +
        adjuntosHtml((m.adjuntos || []).map(function (a) { return Object.assign({}, a, meta[a.id] || {}); }), false) +
        (m.texto ? '<div class="txt">' + (yo ? esc(m.texto) : md(m.texto)) + '</div>' : '') +
        '<span class="meta">' + (m.escrito_at && Math.abs(new Date(m.created_at) - new Date(m.escrito_at)) > 120000 ? '<i title="Escrito sin señal; llegó ' + esc(hora(m.created_at)) + '">⟲</i> ' : '') +
        esc(hora(t)) + ' ' + tk + '</span><div style="clear:both"></div></div>';
      if (yo && tr && tr.estado === 'error') h += '<div class="sistema"><span class="mal">El motor no pudo con este mensaje: ' + esc(tr.error || '') + '. Escríbelo de otra forma o vuelve a intentar.</span></div>';
      if (!yo && m.trabajo_id) {
        // Primero lo que hay que confirmar, luego conceptos y machote (el orden del método).
        if (acc[m.trabajo_id]) { h += tarjetaAcciones(acc[m.trabajo_id].filter(function (a) { return a.tipo === 'conjetura'; })); }
        if (U && U.trabajo_id === m.trabajo_id) h += tarjetasRespuesta(U);
        if (acc[m.trabajo_id]) { h += tarjetaAcciones(acc[m.trabajo_id].filter(function (a) { return a.tipo !== 'conjetura'; })); pintadas[m.trabajo_id] = 1; }
      }
    });
    // Acciones que no cuelgan de un mensaje del motor (p. ej. «¿la cierro?» de los cierres automáticos).
    Object.keys(acc).forEach(function (k) { if (!pintadas[k]) h += tarjetaAcciones(acc[k]); });
    salidaDelCaso().sort(function (a, b) { return a.escrito_at - b.escrito_at; }).forEach(function (x) {
      dia(x.escrito_at);
      var subidos = x.archivos.filter(function (a) { return a.adjunto_id; }).length, total = x.archivos.length;
      var actual = x.archivos.filter(function (a) { return Q.progreso(a.local) !== undefined; })[0];
      var est = x.estado === 'error' ? '<span class="mal">⚠ no se mandó</span>' :
        x.estado === 'subiendo' && total ? '<span class="cola">subiendo ' + (subidos + (actual ? 1 : 0)) + '/' + total + (actual ? ' · ' + Math.round(Q.progreso(actual.local) * 100) + '%' : '') + '</span>' :
        x.estado === 'enviando' ? '<span class="cola">enviando</span>' : '<span class="cola">en cola</span>';
      h += '<div class="b yo pend">' + adjuntosHtml(x.archivos.map(function (a) { return { local: a.local, blob: a.blob, nombre: a.nombre, clase: a.clase, bytes: a.bytes, duracion_s: a.duracion_s, subido: !!a.adjunto_id }; }), true) +
        (x.texto ? '<div class="txt">' + esc(x.texto) + '</div>' : '') +
        (total && x.estado === 'subiendo' ? '<div class="barra"><i style="width:' + Math.round(100 * (subidos + (actual ? Q.progreso(actual.local) : 0)) / total) + '%"></i></div>' : '') +
        '<span class="meta">' + esc(hora(x.escrito_at)) + ' ' + est + '</span><div style="clear:both"></div>' +
        (x.estado === 'error' ? '<div class="corr"><span class="err">' + esc(x.error) + '</span><button class="boton" data-reint="' + esc(x.cliente_id) + '">Reintentar</button><button class="boton" data-desc="' + esc(x.cliente_id) + '">Descartar</button></div>' : '') + '</div>';
    });
    if (H && (H.trabajos || []).some(function (t) { return t.estado === 'tomado' || t.estado === 'pendiente'; }))
      h += '<div class="b el escribe"><span></span><span></span><span></span></div>';
    M.innerHTML = h;
    enlazarChat(M);
    if (abajo || ST.irAbajo) { M.scrollTop = M.scrollHeight; ST.irAbajo = false; }
  }
  function tick(tr) {
    if (!tr) return '<span class="tk">✓</span>';
    if (tr.estado === 'listo') return '<span class="tk leido" title="El motor ya contestó">✓✓</span>';
    if (tr.estado === 'tomado') return '<span class="tk" title="El motor lo está trabajando">✓✓</span>';
    if (tr.estado === 'error') return '<span class="tk mal">⚠</span>';
    return '<span class="tk" title="Recibido en el servidor">✓</span>';
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
      if (a.clase === 'audio') {
        h += '<div class="voz"><button class="play" data-audio="' + esc(k) + '" aria-label="Reproducir">▶</button><div class="onda">' + onda(a.nombre) +
          '</div><div class="mic">🎤</div></div><div class="voz-pie"><span class="dur">' + dur(a.duracion_s) + '</span></div>' +
          (a.transcripcion ? '<div class="trans">📝 ' + esc(a.transcripcion) + '</div>' : (!local ? '<div class="trans gris">transcripción pendiente</div>' : ''));
      } else {
        h += '<div class="doc" data-doc="' + esc(k) + '"><div class="ic">' + (a.clase === 'pdf' ? 'PDF' : '📄') + '</div><div><b>' + esc(a.nombre) + '</b><small>' + peso(a.bytes || 0) + '</small></div></div>';
      }
    });
    return h;
  }
  function onda(semilla) { var h = '', n = 0; String(semilla || 'x').split('').forEach(function (c) { n = (n * 17 + c.charCodeAt(0)) % 9973; });
    for (var i = 0; i < 30; i++) h += '<i style="height:' + (6 + Math.round(18 * Math.abs(Math.sin(i * 1.7 + n) * Math.cos(i * .45)))) + 'px"></i>'; return h; }
  function dur(s) { s = Math.round(Number(s) || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

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
    otras.forEach(function (a) {
      var d = a.datos || {}, r = a.resultado || {}, manejador = G.CzAcciones && G.CzAcciones[a.tipo];
      h += '<div class="carta"><h4>' + ({ alta_contacto: '👤', crear_machote: '📐', crear_borrador: '🧾', enviada: '📨', cerrar: '🔒' }[a.tipo] || '•') + ' ' + esc(a.titulo) + '</h4>' +
        (d.detalle ? '<div class="odoo">' + md(d.detalle) + '</div>' : '') +
        (a.estado === 'hecha' ? '<span class="hecho">✓ ' + esc(r.texto || 'Hecho') + '</span>' :
         a.estado === 'descartada' ? '<span class="hecho gris">Descartado</span>' :
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
    $$('[data-audio]', M).forEach(function (b) { b.onclick = function () { tocar(b); }; });
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
  var sonando = null;
  async function tocar(b) {
    if (sonando) { sonando.a.pause(); sonando.b.textContent = '▶'; if (sonando.b === b) { sonando = null; return; } }
    b.textContent = '…'; var u = await cargarUrl(b.dataset.audio); if (!u) { b.textContent = '▶'; return toast('No se pudo bajar el audio.'); }
    var a = new Audio(u); sonando = { a: a, b: b }; b.textContent = '❚❚';
    a.onended = function () { b.textContent = '▶'; sonando = null; };
    a.play().catch(function () { b.textContent = '▶'; toast('El navegador no reprodujo este audio.'); });
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
    $('#bEnviar').textContent = hay ? '➤' : '🎤';
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
    var n = (r.hilo.mensajes || []).filter(function (m) { return m.rol !== 'usuario'; }).length;
    if (ST.vistos && ST.vistos.id === s.id && n > ST.vistos.n) avisarLlegada();
    ST.vistos = { id: s.id, n: n };
    ST.hilo = r.hilo; pintarChat();
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
  /** Consulta sola: cada 4 s mientras el motor trabaja, cada 20 s si no. */
  function sondear(ya) {
    clearTimeout(ST.sondeo);
    ST.sondeo = setTimeout(async function () {
      if (!document.hidden) {
        await cargarCasos(); pintarLista();
        if (ST.sel) await cargarHilo();
      }
      sondear();
    }, ya ? 1200 : (enCurso() ? 4000 : 20000));
  }
  async function abrir(sel) {
    ST.sel = sel; guardarSel(); ST.hilo = null; ST.vistos = null; ST.bandeja = []; ST.irAbajo = true;
    $('#app').classList.add('ver-chat'); pintarLista(); pintarChat(); pintarComposer();
    await cargarHilo(); sondear();
    try { if (G.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }

  G.CzApp = { VERSION: VERSION, arrancar: async function () {
    if (G.__ftsSinAcceso) return;
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
