/* ═══ shared/chat · NÚCLEO (propuesta) · ChatNucleo: el chat tipo WhatsApp del conceptualizador para cualquier producto ═══
 *
 * El núcleo pinta TODO lo que es chat: marco de 1 o 2 columnas, encabezados de 52 px, lista con búsqueda, chips y
 * botón flotante, burbujas con racha y colita, palomitas SVG (enviado · recibido · leído · error · pendiente), hora,
 * separador de día, mensajes de sistema, «escribiendo…» con pasos, álbum de fotos, documentos, nota de voz con onda,
 * salto y velocidad, ⇊ con contador, botón fijo del siguiente paso, barra de escribir y panel lateral ≥900 px.
 * El producto NO trae estilos del chat: solo le pasa CONFIGURACIÓN y CONTENIDO (título, avatar, chips, acciones,
 * etiquetas con tono, y el interior de sus tarjetas armado con las piezas chn-carta / chn-bt / chn-conj / chn-liga).
 *
 *   var N = ChatNucleo.crear(raiz, {
 *     producto, titulo, version, atras: { aria, hacer }, buscarTexto,
 *     lista: { clave, titulo, vista, vistaTick, hora, horaClase, avatar, etiquetas, noLeidos, fijada, filtros, pie },
 *     fab: { texto, hacer },
 *     cabecera: c => ({ titulo, sub, vivo, avatar, etiquetas }),
 *     franja: c => html,   lado: c => html | null,   fijo: c => [{ texto, fuerte, hacer }],
 *     mensajes: c => [ { id, rol:'yo'|'el'|'sistema', quien, texto, md, intro, at, estado, adjuntos:[…], tarjeta:{tipo,datos} } ],
 *     tarjetas: { tipo: (datos, m) => html },   escribiendo: c => ({ texto, pasos:[{t,s}] }) | null,
 *     placeholder, vacioChat, onEnviar: (c, texto) => …
 *   });
 *   N.pintar(filas)  N.abrir(id)  N.repintarChat()  N.toast(t)
 */
(function (G) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var P = {
    atras: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>', buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    mas: '<circle cx="12" cy="5.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor"/>',
    clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
    camara: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    enviar: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>', nuevo: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    usuario: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', abajo: '<path d="M7 10l5 5 5-5"/>', abajo2: '<path d="M7 6l5 5 5-5"/><path d="M7 12l5 5 5-5"/>',
    reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>', fijar: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
    check: '<path d="M1.5 6.2L5 9.5 11 2"/>', check2: '<path d="M1 6.2L4.5 9.5 10.5 2"/><path d="M6.7 8.2l1.3 1.3L14 2"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>', pausa: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>', flecha: '<path d="M7 10l5 5 5-5"/>', disparo: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  function ico(n, c) { return '<svg class="chn-ico ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>'; }
  function palomita(doble) { return '<svg viewBox="0 0 15 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (doble ? P.check2 : P.check) + '</svg>'; }
  /** Palomitas como WhatsApp. Un mensaje en cola dice «pendiente de enviar» y NUNCA lleva ✓ (CLAUDE.md §15). */
  function tick(estado) {
    if (estado === 'leido') return '<span class="chn-tk leido" title="Ya contestó">' + palomita(true) + '</span>';
    if (estado === 'recibido') return '<span class="chn-tk" title="Lo está trabajando">' + palomita(true) + '</span>';
    if (estado === 'error') return '<span class="chn-tk mal">⚠</span>';
    if (estado === 'pendiente') return '<span class="chn-pend" title="Guardado en el teléfono; se manda solo al volver la señal">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + P.reloj + '</svg>pendiente de enviar</span>';
    return '<span class="chn-tk" title="Recibido en el servidor">' + palomita(false) + '</span>';
  }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function hora(t) { var d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
  function separador(t) {
    var d = new Date(t); if (isNaN(d)) return ''; var h = new Date(); if (d.toDateString() === h.toDateString()) return 'Hoy';
    var a = new Date(h); a.setDate(h.getDate() - 1); if (d.toDateString() === a.toDateString()) return 'Ayer';
    return d.getDate() + ' de ' + MES[d.getMonth()] + (d.getFullYear() !== h.getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function corto(t) { var d = new Date(t); if (isNaN(d)) return ''; var s = separador(t); return s === 'Hoy' ? hora(t) : s === 'Ayer' ? 'ayer' : d.getDate() + ' ' + MES[d.getMonth()]; }
  function peso(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function dur(s) { s = Math.max(0, Math.floor(Number(s) || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  /** Markdown mínimo de las respuestas (listas, **negritas**, títulos), igual que cz-app.js md(). */
  function md(t) {
    return String(t || '').split('\n').map(function (l) {
      var x = esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (!l.trim()) return '<div class="sp"></div>';
      if (/^#{1,4}\s/.test(l)) return '<div class="h">' + x.replace(/^#+\s*/, '') + '</div>';
      if (/^\s*([-*•]|\d+\.)\s+/.test(l)) return '<div class="li">' + x.replace(/^\s*([-*•]|\d+\.)\s+/, function (m0, m1) { return /\d/.test(m1) ? m1 + ' ' : '• '; }) + '</div>';
      return '<div>' + x + '</div>';
    }).join('');
  }
  function barrasDe(k) { var a = [], n = 0; String(k).split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 233280; });
    for (var i = 0; i < 30; i++) { n = (n * 9301 + 49297) % 233280; a.push(Math.round(5 + 22 * Math.abs(Math.sin(i * .55 + (n % 7)) * .55 + (n / 233280) * .45))); } return a; }
  function etiquetas(L) { return (L || []).map(function (e) { return '<span class="chn-et ' + esc(e.tono || '') + '">' + esc(e.texto) + '</span>'; }).join(''); }
  function avatar(a, cls) { a = a || {}; return '<div class="chn-av ' + (cls || '') + '" style="background:' + esc(a.color || '#8696a0') + '">' + esc(a.texto || '?') + (a.insignia ? '<i style="' + (a.insigniaColor ? 'color:' + esc(a.insigniaColor) : '') + '">' + esc(a.insignia) + '</i>' : '') + '</div>'; }

  function crear(raiz, o) {
    var ST = { filas: [], sel: null, q: null, filtros: {}, rate: 1, player: null, abajoN: 0, abierto: false };
    (o.lista.filtros || []).forEach(function (g) { ST.filtros[g.id] = g.opciones[0].id; });
    raiz.className = 'chn' + (o.lado ? ' con-lado' : '');
    raiz.innerHTML = '<aside class="chn-lst"></aside><section class="chn-chat" data-vacio="' + esc(o.vacioChat || 'Elige una conversación.') + '">' +
      '<header class="chn-cab chn-cc"></header><div class="chn-franja"></div><div class="chn-msgs"></div><div class="chn-lado"></div>' +
      '<button class="chn-abajo" type="button" aria-label="Ir al último mensaje">' + ico('abajo2') + '<span class="chn-badge" style="display:none"></span></button>' +
      '<div class="chn-fijo"></div><div class="chn-compose"><div class="chn-caja"><button class="chn-bic" aria-label="Adjuntar">' + ico('clip') + '</button>' +
      '<textarea rows="1" aria-label="Mensaje" placeholder="' + esc(o.placeholder || 'Mensaje') + '"></textarea><button class="chn-bic" aria-label="Cámara">' + ico('camara') + '</button></div>' +
      '<button class="chn-redondo" aria-label="Grabar nota de voz">' + ico('mic') + '</button></div></section><div class="chn-toast" role="status"></div>';
    var $ = function (s) { return raiz.querySelector(s); };
    var L = $('.chn-lst'), M = $('.chn-msgs'), TA = $('textarea'), RD = $('.chn-redondo');
    function toast(t) { var e = $('.chn-toast'); e.textContent = t; e.classList.add('on'); clearTimeout(ST.tt); ST.tt = setTimeout(function () { e.classList.remove('on'); }, 2800); }
    function actual() { return ST.filas.filter(function (f) { return o.lista.clave(f) === ST.sel; })[0] || null; }

    // ── lista ──
    function pasa(f, saltar) {
      if (ST.q && String(o.lista.buscarEn ? o.lista.buscarEn(f) : o.lista.titulo(f)).toLowerCase().indexOf(ST.q.toLowerCase()) < 0) return false;
      return (o.lista.filtros || []).every(function (g) { if (g.id === saltar) return true; var op = g.opciones.filter(function (x) { return x.id === ST.filtros[g.id]; })[0]; return !op || !op.f || op.f(f); });
    }
    function pintarLista() {
      var h = '<div class="chn-cab">';
      if (ST.q !== null) h += '<button class="chn-bic" data-x="salbusca" aria-label="Cerrar la búsqueda">' + ico('atras') + '</button><div class="chn-tit"><input data-x="q" placeholder="' + esc(o.buscarTexto || 'Buscar') + '" value="' + esc(ST.q) + '" aria-label="Buscar"></div>';
      else h += '<button class="chn-bic" data-x="atras" aria-label="' + esc((o.atras && o.atras.aria) || 'Volver a la suite') + '">' + ico('atras') + '</button><div class="chn-tit"><b>' + esc(o.titulo) + '</b>' +
        (o.version ? '<span class="chn-ver" title="Build del módulo">' + esc(o.version) + '</span>' : '') + '</div><button class="chn-bic" data-x="buscar" aria-label="Buscar">' + ico('buscar') + '</button><button class="chn-bic" aria-label="Opciones">' + ico('mas') + '</button>';
      h += '</div><div class="chn-chips" aria-label="Filtros">' + (o.lista.filtros || []).map(function (g, gi) {
        return (gi ? '<span class="chn-sep"></span>' : '') + g.opciones.map(function (op) {
          var n = op.contar ? ST.filas.filter(function (f) { return pasa(f, g.id) && (!op.f || op.f(f)); }).length : null;
          return '<button class="chn-chip' + (ST.filtros[g.id] === op.id && !op.menu ? ' on' : '') + '" data-g="' + esc(g.id) + '" data-o="' + esc(op.id) + '">' + (op.icono ? ico(op.icono, 'xs') : '') + esc(op.texto) + (n != null ? ' <b>' + n + '</b>' : '') + (op.menu ? ico('abajo', 'xs') : '') + '</button>';
        }).join('');
      }).join('') + '</div><div class="chn-scroll">';
      var vs = ST.filas.filter(function (f) { return pasa(f); });
      vs.sort(function (a, b) { return (o.lista.fijada && o.lista.fijada(b) ? 1 : 0) - (o.lista.fijada && o.lista.fijada(a) ? 1 : 0); });
      if (!vs.length) h += '<p class="chn-vacio">' + esc(o.lista.vacio || 'Nada aquí con estos filtros.') + '</p>';
      vs.forEach(function (f) {
        var id = o.lista.clave(f), nl = o.lista.noLeidos ? o.lista.noLeidos(f) : 0, hc = o.lista.horaClase ? o.lista.horaClase(f) : (nl ? 'nuevo' : '');
        h += '<div class="chn-ses' + (id === ST.sel ? ' on' : '') + '" data-id="' + esc(id) + '" role="button" tabindex="0">' + avatar(o.lista.avatar(f)) +
          '<div class="chn-tx"><div class="chn-t"><span class="n">' + esc(o.lista.titulo(f)) + '</span><span class="chn-h ' + esc(hc || '') + '">' + esc(o.lista.hora(f)) + '</span></div>' +
          '<div class="chn-u">' + (o.lista.vistaTick && o.lista.vistaTick(f) ? tick(o.lista.vistaTick(f)) : '') + '<span class="p">' + esc(o.lista.vista(f)) + '</span><span class="chn-meta">' +
          etiquetas(o.lista.etiquetas ? o.lista.etiquetas(f) : []) + (o.lista.fijada && o.lista.fijada(f) ? ico('fijar', 'xs') : '') + (nl ? '<span class="chn-badge">' + nl + '</span>' : '') + '</span></div></div>' +
          '<button class="chn-mas" aria-label="Opciones">' + ico('mas', 's') + '</button></div>';
      });
      h += (o.lista.pie ? '<p class="chn-pie-l">' + esc(o.lista.pie) + '</p>' : '') + '</div>' + (o.fab ? '<button class="chn-fab">' + ico('nuevo') + esc(o.fab.texto) + '</button>' : '');
      L.innerHTML = h;
      var q = L.querySelector('[data-x=q]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); q.oninput = function () { ST.q = q.value; pintarLista(); }; }
    }
    L.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]'), c = e.target.closest('[data-g]'), s = e.target.closest('[data-id]');
      if (x && x.dataset.x === 'buscar') { ST.q = ''; return pintarLista(); }
      if (x && x.dataset.x === 'salbusca') { ST.q = null; return pintarLista(); }
      if (x && x.dataset.x === 'atras') return o.atras && o.atras.hacer && o.atras.hacer();
      if (c) { ST.filtros[c.dataset.g] = c.dataset.o; return pintarLista(); }
      if (e.target.closest('.chn-fab')) return o.fab.hacer && o.fab.hacer();
      if (s && !e.target.closest('.chn-mas')) abrir(s.dataset.id);
    });

    // ── chat ──
    function pintarCab(c) {
      var k = o.cabecera(c);
      $('.chn-cc').innerHTML = '<button class="chn-bic chn-vuelve" aria-label="Volver">' + ico('atras') + '</button>' + avatar(k.avatar) +
        '<div class="chn-tx"><b><span>' + esc(k.titulo) + '</span>' + etiquetas(k.etiquetas) + (o.version ? '<span class="chn-ver">' + esc(o.version) + '</span>' : '') + '</b>' +
        '<small class="' + (k.vivo ? 'vivo' : '') + '">' + esc(k.sub) + '</small></div><button class="chn-bic" aria-label="Opciones">' + ico('mas') + '</button>';
      $('.chn-vuelve').onclick = function () { raiz.classList.remove('ver-chat'); ST.sel = null; pintarLista(); };
    }
    function adjuntos(L2, mio) {
      var fotos = L2.filter(function (a) { return a.clase === 'foto'; }), h = '';
      if (fotos.length) {
        h += '<div class="chn-album n' + Math.min(4, fotos.length) + '">' + fotos.slice(0, 4).map(function (a, i) {
          return '<div class="chn-foto" style="background-image:' + esc(a.fondo || 'none') + '">' + (i === 3 && fotos.length > 4 ? '<div class="mas">+' + (fotos.length - 4) + '</div>' : '') + '</div>'; }).join('') + '</div>';
        if (fotos.length > 1) h += '<div class="chn-pie-adj">' + fotos.length + ' fotos</div>';
      }
      L2.filter(function (a) { return a.clase !== 'foto'; }).forEach(function (a) {
        if (a.clase === 'audio') h += voz(a);
        else h += '<div class="chn-doc"><div class="ic' + (a.clase === 'pdf' ? '' : ' otro') + '">' + (a.clase === 'pdf' ? 'PDF' : esc((a.nombre.split('.').pop() || '').toUpperCase().slice(0, 4))) + '</div><div><b>' + esc(a.nombre) + '</b><small>' + peso(a.bytes || 0) + '</small></div></div>';
      });
      return h;
    }
    function voz(a) {
      var p = ST.player && ST.player.k === a.id ? ST.player : null, D = a.duracion_s, pos = p ? p.audio.currentTime : 0, f = D ? Math.min(1, pos / D) : 0;
      var B = barrasDe(a.id), corte = Math.round(f * B.length), k = esc(a.id);
      return '<div class="chn-voz"><button class="play" data-play="' + k + '" aria-label="' + (p && p.sonando ? 'Pausa' : 'Reproducir') + '"><svg viewBox="0 0 24 24">' + (p && p.sonando ? P.pausa : P.play) + '</svg></button>' +
        '<div class="cuerpo"><div class="chn-onda" data-onda="' + k + '" role="slider" aria-label="Posición">' + B.map(function (x, i) { return '<i style="height:' + x + 'px"' + (i < corte ? ' class="ya"' : '') + '></i>'; }).join('') +
        '<span class="perilla" style="left:' + (f * 100) + '%"></span></div><div class="chn-voz-pie"><span>' + dur(p ? pos : D) + '</span></div></div>' +
        '<button class="chn-vel" data-vel="1" aria-label="Velocidad">' + ST.rate + '×</button></div>' +
        (a.transcripcion ? '<div class="chn-trans"><span class="et">Transcripción</span>' + esc(a.transcripcion) + '</div>' : a.transcribiendo ? '<div class="chn-trans pend"><span class="chn-giro"></span>transcribiendo…</div>' : '');
    }
    function pintarChat() {
      var c = actual(); if (!c) return;
      pintarCab(c);
      $('.chn-franja').innerHTML = o.franja ? o.franja(c) || '' : '';
      $('.chn-lado').innerHTML = o.lado ? o.lado(c) || '' : '';
      var fj = o.fijo ? o.fijo(c) || [] : [];
      $('.chn-fijo').innerHTML = fj.map(function (b, i) { return '<button data-fj="' + i + '" class="' + (b.fuerte ? 'fuerte' : '') + '">' + (b.icono ? ico(b.icono, 's') : '') + esc(b.texto) + '</button>'; }).join('');
      $('.chn-fijo').onclick = function (e) { var b = e.target.closest('[data-fj]'); if (b && fj[+b.dataset.fj].hacer) fj[+b.dataset.fj].hacer(); };
      var h = '', ult = '', prev = null;
      (o.mensajes(c) || []).forEach(function (m) {
        var d = separador(m.at); if (d && d !== ult) { ult = d; h += '<div class="chn-dia"><span>' + esc(d) + '</span></div>'; prev = null; }
        if (m.rol === 'sistema') { h += '<div class="chn-sis"><span>' + esc(m.texto) + '</span></div>'; prev = null; return; }
        var lado = m.rol === 'yo' ? 'yo' : 'el', sig = prev !== lado; prev = lado;
        var cuerpo = adjuntos(m.adjuntos || [], lado === 'yo') + (m.texto ? '<div class="chn-txt">' + (m.md ? md(m.texto) : esc(m.texto)) + '</div>' : '') +
          (m.dentro ? (o.tarjetas[m.dentro.tipo] || function () { return ''; })(m.dentro.datos, m) : '') +
          '<span class="chn-hora">' + esc(hora(m.at)) + (lado === 'yo' ? ' ' + tick(m.estado) : '') + '</span>';
        var quien = lado === 'el' && sig && m.quien ? '<div class="chn-quien">' + esc(m.quien) + '</div>' : '';
        // Sin texto ni adjuntos, la tarjeta va sola (con quién habla arriba), sin una burbuja vacía encima.
        if (m.texto || (m.adjuntos || []).length || m.dentro) h += '<div class="chn-fila ' + lado + (sig ? ' sig' : '') + '"><div class="chn-b ' + lado + (m.intro ? ' intro' : '') + (m.estado === 'pendiente' ? ' pend' : '') + '">' + quien + cuerpo + '</div></div>', quien = '';
        if (m.tarjeta) { h += '<div class="chn-fila ' + lado + (quien ? ' sig' : '') + '"><div class="chn-carta">' + quien + (o.tarjetas[m.tarjeta.tipo] || function () { return ''; })(m.tarjeta.datos, m) + '</div></div>'; prev = null; }
      });
      var es = o.escribiendo ? o.escribiendo(c) : null;
      if (es) h += '<div class="chn-fila el sig"><button type="button" class="chn-escribe' + (ST.abierto ? ' abierto' : '') + '" data-escribe="1" aria-expanded="' + ST.abierto + '"><span class="top"><span class="pts"><i></i><i></i><i></i></span><em>' + esc(es.texto || 'escribiendo…') + '</em><span class="flecha">' + ico('flecha', 's') + '</span></span>' +
        '<span class="pasos">' + (es.pasos || []).map(function (p, i, A) { var cur = i === A.length - 1; return '<span class="chn-paso' + (cur ? '' : ' ya') + '"><span class="m">' + (cur ? '<span class="chn-giro"></span>' : '✓') + '</span><span>' + esc(p.t) + '</span><span class="t">' + p.s + ' s</span></span>'; }).join('') + '</span></button></div>';
      var abajo = M.scrollHeight - M.scrollTop - M.clientHeight < 80;
      M.innerHTML = h;
      if (abajo || ST.irAbajo) { M.scrollTop = M.scrollHeight; ST.irAbajo = false; }
      actualizarAbajo();
    }
    function actualizarAbajo() {
      var b = $('.chn-abajo'), arriba = M.scrollHeight - M.scrollTop - M.clientHeight > 80;
      b.classList.toggle('on', arriba); b.style.bottom = ($('.chn-compose').offsetHeight + $('.chn-fijo').offsetHeight + 10) + 'px';
      var n = b.querySelector('.chn-badge'); n.style.display = ST.abajoN && arriba ? 'flex' : 'none'; n.textContent = ST.abajoN;
    }
    M.addEventListener('scroll', actualizarAbajo, { passive: true });
    $('.chn-abajo').onclick = function () { M.scrollTop = M.scrollHeight; ST.abajoN = 0; actualizarAbajo(); };
    M.addEventListener('click', function (e) {
      var es = e.target.closest('[data-escribe]'); if (es) { ST.abierto = !ST.abierto; return pintarChat(); }
      var pl = e.target.closest('[data-play]'); if (pl) return alternar(pl.dataset.play);
      var v = e.target.closest('[data-vel]'); if (v) { ST.rate = ST.rate === 1 ? 1.5 : ST.rate === 1.5 ? 2 : 1; if (ST.player) ST.player.audio.playbackRate = ST.rate; return pintarChat(); }
      var on = e.target.closest('[data-onda]'); if (on && ST.player && ST.player.k === on.dataset.onda) { var r = on.getBoundingClientRect(); ST.player.audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (ST.player.audio.duration || 0); pintarChat(); }
      var bt = e.target.closest('[data-hacer]'); if (bt && o.alHacer) o.alHacer(bt.dataset.hacer, actual(), bt);
    });
    function alternar(k) {
      if (ST.player && ST.player.k === k) { if (ST.player.sonando) ST.player.audio.pause(); else ST.player.audio.play(); ST.player.sonando = !ST.player.sonando; return pintarChat(); }
      if (ST.player) ST.player.audio.pause();
      var a = new Audio(o.audio ? o.audio(k) : ''); a.playbackRate = ST.rate; ST.player = { k: k, audio: a, sonando: true }; a.play().catch(function () {});
      a.ontimeupdate = function () { pintarChat(); }; a.onended = function () { ST.player.sonando = false; a.currentTime = 0; pintarChat(); };
      pintarChat();
    }
    TA.addEventListener('input', function () { TA.style.height = 'auto'; TA.style.height = Math.min(132, TA.scrollHeight) + 'px';
      RD.innerHTML = TA.value.trim() ? ico('enviar') : ico('mic'); RD.setAttribute('aria-label', TA.value.trim() ? 'Enviar' : 'Grabar nota de voz'); });
    RD.onclick = function () { var t = TA.value.trim(); if (!t) return toast('Aquí empieza la grabadora del núcleo (onda, pausa, escuchar, enviar).'); TA.value = ''; TA.dispatchEvent(new Event('input')); ST.irAbajo = true; if (o.onEnviar) o.onEnviar(actual(), t); pintarChat(); };
    TA.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && G.matchMedia('(min-width:760px)').matches) { e.preventDefault(); RD.click(); } });
    function abrir(id) { ST.sel = id; ST.irAbajo = true; raiz.classList.add('ver-chat'); pintarLista(); pintarChat(); }
    return { pintar: function (f) { ST.filas = f; pintarLista(); if (ST.sel) pintarChat(); }, abrir: abrir, repintarChat: pintarChat, toast: toast, estado: ST };
  }
  G.ChatNucleo = { crear: crear, esc: esc, ico: ico, md: md, tick: tick, hora: hora, corto: corto, separador: separador };
})(window);
