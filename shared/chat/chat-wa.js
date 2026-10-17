/* ═══ shared/chat · piezas del look WhatsApp para cualquier chat de la suite (V1.51, prototipo v150 «look-whatsapp») ═══
 *
 * Módulo ADITIVO del núcleo: no pinta la lista ni el chat de nadie. Da piezas sueltas que cada producto
 * (conceptualizador, Marketing…) acomoda en su propio render. Ningún texto de producto vive aquí: lo que dice cada
 * pieza llega en las opciones; los textos por omisión son genéricos.
 *
 *   A · globitos       ChatWA.globitos({ sinLeer, teToca, explicacion:{ sinLeer, teToca } }) → HTML
 *                      ChatWA.enlazarGlobitos(root) → quitar()   (toque largo 500 ms = explicación; Esc o tocar fuera la cierra)
 *   B · superada       ChatWA.superados([{ id, at }]) → [ids superados]   (todas menos la más nueva)
 *                      ChatWA.marcarSuperada(el, { hora:'HH:MM', texto?, al?, titulo? })
 *   C · en curso       ChatWA.escribiendo(texto?) → HTML   ·   ChatWA.pasoEnCurso({ texto, pct?, pausa:{ texto, al(razon) } }) → elemento
 *   D · hora           ChatWA.hora(iso) → 'HH:MM'   ·   ChatWA.horaHtml(iso, { leido }) → HTML
 *   G · menú ⋮         ChatWA.menu(boton, items, { alCerrar }) → { el, cerrar } | null (si ya estaba abierto: lo cierra)
 *                      ChatWA.itemIrAlMachote({ folio, version, al })   ·   ChatWA.itemInstalar()   ·   ChatWA.itemBarra(clave, alCambiar)
 *   barra inferior     ChatWA.barra({ items, activa, apagable, claveUsuario }) → elemento
 *                      ChatWA.barraVisible(clave) · ChatWA.ponBarra(clave, bool)
 *   instalar           ChatWA.instalar.escuchar() · .disponible() · .instalada() · .pedir(opts) → Promise
 *   mis proyectos      ChatWA.misProyectos({ claveUsuario, esMio(conv), puedeVerTodos }) → controlador
 *   H · escritura      ChatWA.estadoEscritura({ trabajos, ahora, topeMin, escriben, yo }) → {k:'agente'|'detenido'|'cola'|'persona',…} | null
 *                      ChatWA.escrituraFilaHtml(estado) · ChatWA.escrituraCabeceraHtml(estado) · ChatWA.tecleo({ enviar, cadaMs }) → { tecla(texto?) }
 *   I · estado (V1.52) ChatWA.barraEstado({ textos?, alDetener(agente) → Promise<{ok}>, textoSinPermiso? }) → elemento con
 *                      el.chwaPoner(agente, { puedeDetener }) · ChatWA.quienEstado(quien) · ChatWA.gastoTexto(ponderado)
 *   J · hoja (V1.52)   ChatWA.hoja({ titulo, html, ancho?, alCerrar }) → { el, cuerpo, cerrar } · hojaAbierta() · cerrarHoja() · esPc()
 *   fila de la lista   ChatWA.fila({ id?, avatar:{ iniciales, color }, titulo, linea, hora, globitos, dueno, fijado, activa, escritura? })
 *
 * El estilo vive en chat-wa.css con prefijo chwa- en TODO (CLAUDE.md §20 #12: `.chip`, `.menu`, `.fila`, `.badge` ya
 * existen en los productos con otro significado). La prueba es pruebas/chat-wa-v151.js del repo del conceptualizador.
 */
(function (G) {
  'use strict';
  var D = G.document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICO = {
    reloj: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    palomas: '<path d="M2 13l4 4L15 7M10 15l2 2 9-10"/>',
    pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>'
  };
  var ico = function (n, c) { return '<svg class="chwa-ico' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>'; };

  /* ── almacenamiento: puede no existir o tronar (ventana privada, sitio bloqueado, vista previa) ── */
  function leer(k) { try { var s = G.localStorage; return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function guardar(k, v) { try { var s = G.localStorage; if (s) s.setItem(k, v); return true; } catch (e) { return false; } }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function texto(fuente, n, def) {
    if (typeof fuente === 'function') return String(fuente(n));
    if (fuente != null && fuente !== '') return String(fuente);
    return def(n);
  }

  /* ═══ A · globitos: verde = sin leer · ámbar con reloj de arena = decisiones que te tocan ═══ */
  function globitos(o) {
    o = o || {};
    var sl = +o.sinLeer || 0, tt = +o.teToca || 0, ex = o.explicacion || {}, h = '';
    if (tt > 0) {
      var t1 = texto(ex.teToca, tt, function (n) { return n === 1 ? '1 decisión te toca' : n + ' decisiones te tocan'; });
      h += '<span class="chwa-dec" role="img" data-chwa-tip="' + esc(t1) + '" title="' + esc(t1) + '" aria-label="' + esc(t1) + '">' + ico('reloj') + '<b>' + tt + '</b></span>';
    }
    if (sl > 0) {
      var t2 = texto(ex.sinLeer, sl, function (n) { return plural(n, 'mensaje sin leer', 'mensajes sin leer'); });
      h += '<span class="chwa-badge" role="img" data-chwa-tip="' + esc(t2) + '" title="' + esc(t2) + '" aria-label="' + esc(t2) + '">' + (sl > 99 ? '99+' : sl) + '</span>';
    }
    return h ? '<span class="chwa-globitos">' + h + '</span>' : '';
  }

  var tipEl = null, tipDueno = null;
  function tip() {
    if (tipEl && D.body.contains(tipEl)) return tipEl;
    tipEl = D.createElement('div'); tipEl.className = 'chwa-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.id = 'chwa-tip'; tipEl.hidden = true;
    D.body.appendChild(tipEl); return tipEl;
  }
  function mostrarTip(el) {
    var t = tip(); t.textContent = el.getAttribute('data-chwa-tip'); t.hidden = false; tipDueno = el;
    el.setAttribute('aria-describedby', 'chwa-tip');
    var r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, vw = D.documentElement.clientWidth;
    t.style.left = Math.max(8, Math.min(vw - w - 8, Math.round(r.right - w))) + 'px';
    var top = r.top - h - 6; if (top < 8) top = r.bottom + 6;
    t.style.top = Math.round(top) + 'px';
  }
  function ocultarTip() { if (tipEl) tipEl.hidden = true; if (tipDueno) tipDueno.removeAttribute('aria-describedby'); tipDueno = null; }

  /** Toque largo (500 ms) sobre un globito: muestra su explicación. Se cierra tocando fuera o con Esc.
   *  El clic que sigue al toque largo se traga (la fila de abajo no se abre). Devuelve una función para desenganchar. */
  function enlazarGlobitos(root) {
    root = root || D;
    var t = null, x0 = 0, y0 = 0, tragar = false;
    function abajo(e) {
      var el = e.target.closest && e.target.closest('[data-chwa-tip]');
      if (!el || !root.contains(el)) return;
      x0 = e.clientX; y0 = e.clientY; clearTimeout(t);
      t = setTimeout(function () { mostrarTip(el); tragar = true; }, 500);
    }
    function mueve(e) { if (t && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) { clearTimeout(t); t = null; } }
    function arriba() { clearTimeout(t); t = null; }
    function clic(e) { if (tragar) { tragar = false; e.stopPropagation(); e.preventDefault(); } }
    function menuCtx(e) { if (e.target.closest && e.target.closest('[data-chwa-tip]') && root.contains(e.target)) e.preventDefault(); }
    root.addEventListener('pointerdown', abajo);
    root.addEventListener('pointermove', mueve);
    root.addEventListener('pointerup', arriba); root.addEventListener('pointercancel', arriba);
    root.addEventListener('click', clic, true);
    root.addEventListener('contextmenu', menuCtx);
    return function quitar() {
      root.removeEventListener('pointerdown', abajo); root.removeEventListener('pointermove', mueve);
      root.removeEventListener('pointerup', arriba); root.removeEventListener('pointercancel', arriba);
      root.removeEventListener('click', clic, true); root.removeEventListener('contextmenu', menuCtx);
    };
  }
  /* cierre global de la explicación: tocar fuera de ella o Esc */
  D.addEventListener('pointerdown', function (e) {
    if (!tipEl || tipEl.hidden) return;
    if (tipDueno && tipDueno.contains(e.target)) return;
    ocultarTip();
  }, true);

  /* ═══ B · tarjeta de estado vigente y las superadas ═══ */
  function tiempo(v) {
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    var n = Date.parse(String(v || '')); return isNaN(n) ? -Infinity : n;
  }
  /** De [{id, at}] devuelve los ids superados: todas menos la más nueva (si empatan, gana la última de la lista). */
  function superados(cards) {
    cards = cards || []; if (cards.length < 2) return [];
    var iMax = 0;
    for (var i = 1; i < cards.length; i++) if (tiempo(cards[i].at) >= tiempo(cards[iMax].at)) iMax = i;
    var r = [];
    for (var j = 0; j < cards.length; j++) if (j !== iMax) r.push(cards[j].id);
    return r;
  }
  var CONTROLES = 'button, input, select, textarea';
  /** Marca una tarjeta como superada: atenuada, título tachado, todos sus controles desactivados y una línea
   *  «Reemplazado por el estado de las HH:MM». Con `al`, la línea es un botón que lleva a la vigente (el único vivo).
   *  Un control con data-chwa-libre (p. ej. el que abre y cierra la tarjeta) se respeta. Se puede llamar dos veces. */
  function marcarSuperada(el, o) {
    if (!el) return el;
    o = o || {};
    var msg = o.texto || ('Reemplazado por el estado de las ' + (o.hora || ''));
    el.classList.add('chwa-superada');
    el.setAttribute('data-chwa-superada', '1');
    var tit = o.titulo ? el.querySelector(o.titulo) : (el.querySelector('[data-chwa-titulo]') || el.querySelector('h1,h2,h3,h4,b,strong'));
    if (tit) tit.classList.add('chwa-tachado');
    var cs = el.querySelectorAll(CONTROLES);
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.classList.contains('chwa-reemp') || c.hasAttribute('data-chwa-libre')) continue;
      c.disabled = true; c.setAttribute('aria-disabled', 'true');
      if (!c.title) c.title = msg;
    }
    var lin = el.querySelector('.chwa-reemp');
    if (lin) lin.parentNode.removeChild(lin);
    if (typeof o.al === 'function') {
      lin = D.createElement('button'); lin.type = 'button';
      lin.textContent = msg + ' · ver el vigente';
      lin.addEventListener('click', function (e) { e.stopPropagation(); o.al(); });
    } else {
      lin = D.createElement('p'); lin.textContent = msg;
    }
    lin.className = 'chwa-reemp';
    var pie = el.querySelector('[data-chwa-pie]');
    if (pie) el.insertBefore(lin, pie); else el.appendChild(lin);
    return el;
  }

  /* ═══ C · qué está haciendo ahora ═══ */
  /** «🤖 escribiendo…» chico y verde para ponerlo bajo el nombre del chat. Los puntos se animan (sin animación si la
   *  persona pidió menos movimiento). */
  function escribiendo(t) {
    var s = String(t == null || t === '' ? '🤖 escribiendo' : t).replace(/(\.\.\.|…)\s*$/, '');
    return '<span class="chwa-escribe" role="status" aria-live="polite" aria-label="' + esc(s) + '…">' + esc(s) +
      '<span class="chwa-puntos" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>';
  }

  /** Franja con el paso exacto en curso y «Pausar aquí». La pausa pide la razón (obligatoria) y llama a pausa.al(razon).
   *  El elemento trae el.chwaPoner({texto, pct}) para cambiar el paso sin perder lo que se está escribiendo. */
  function pasoEnCurso(o) {
    o = o || {};
    var p = o.pausa || null, st = { texto: o.texto || '', pct: o.pct, pidiendo: false };
    var el = D.createElement('div'); el.className = 'chwa-paso';
    function pctHtml() { return (st.pct == null || isNaN(+st.pct)) ? '' : '<span class="chwa-paso-pct"> · ' + Math.round(+st.pct) + ' %</span>'; }
    function pintar(foco) {
      var h = '<span class="chwa-punto" aria-hidden="true"></span><span class="chwa-paso-tx" role="status" aria-live="polite"><b>' + esc(st.texto) + '</b>' + pctHtml() + '</span>';
      if (p && !st.pidiendo) h += '<button type="button" class="chwa-lnk" data-chwa-p="pausar">' + esc(p.texto || 'Pausar aquí') + '</button>';
      if (p && st.pidiendo) {
        h += '<div class="chwa-razon"><input type="text" maxlength="' + (p.max || 140) + '" required aria-required="true" placeholder="' + esc(p.placeholder || '¿Por qué lo pausas?') + '" aria-label="' + esc(p.etiqueta || 'Razón de la pausa') + '">' +
          '<button type="button" class="chwa-lnk" data-chwa-p="ok">' + esc(p.boton || 'Pausar') + '</button><button type="button" class="chwa-lnk" data-chwa-p="no">Cancelar</button></div>' +
          '<p class="chwa-razon-err" hidden>' + esc(p.error || 'Escribe la razón: sin razón no se pausa.') + '</p>';
      }
      if (st.pct != null && !isNaN(+st.pct)) h += '<span class="chwa-paso-barra" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, +st.pct)) + '%"></i></span>';
      el.innerHTML = h;
      if (foco === 'input') { var i = el.querySelector('input'); if (i) i.focus(); }
      if (foco === 'pausar') { var b = el.querySelector('[data-chwa-p="pausar"]'); if (b) b.focus(); }
    }
    function confirmar() {
      var i = el.querySelector('.chwa-razon input'); if (!i) return false;
      var r = (i.value || '').replace(/\s+/g, ' ').trim();
      if (!r) { el.querySelector('.chwa-razon-err').hidden = false; i.setAttribute('aria-invalid', 'true'); i.focus(); return false; }
      st.pidiendo = false; pintar();
      if (p && typeof p.al === 'function') p.al(r);
      return true;
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-chwa-p]'); if (!b) return;
      var q = b.getAttribute('data-chwa-p');
      if (q === 'pausar') { st.pidiendo = true; pintar('input'); }
      else if (q === 'no') { st.pidiendo = false; pintar('pausar'); }
      else if (q === 'ok') confirmar();
    });
    el.addEventListener('keydown', function (e) {
      if (!e.target.closest || !e.target.closest('.chwa-razon input')) return;
      if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); st.pidiendo = false; pintar('pausar'); }
      else { var er = el.querySelector('.chwa-razon-err'); if (er && !er.hidden && e.key.length === 1) { er.hidden = true; e.target.removeAttribute('aria-invalid'); } }
    });
    el.chwaPoner = function (n) {
      n = n || {};
      if (n.texto != null) st.texto = n.texto;
      if ('pct' in n) st.pct = n.pct;
      if (st.pidiendo) {   // no se tira lo que la persona está escribiendo
        var b = el.querySelector('.chwa-paso-tx'); if (b) b.innerHTML = '<b>' + esc(st.texto) + '</b>' + pctHtml();
        return el;
      }
      pintar(); return el;
    };
    el.chwaPidiendo = function () { return st.pidiendo; };
    pintar();
    return el;
  }

  /* ═══ H · quién está escribiendo, decidido SOLO con datos del servidor (nunca con una marca local) ═══ */
  function ms(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';   // sin zona = UTC
    return Date.parse(s);
  }
  function unirNombres(ns) {
    if (ns.length < 2) return ns[0] || '';
    return ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1];
  }
  var PERSONA_MS = 8000;
  /** De los trabajos del agente y de quién teclea (lo que dice el servidor) decide qué se muestra:
   *  {k:'agente'} · {k:'detenido'} · {k:'cola'} · {k:'persona'} · null. El agente (en cualquier estado) gana a una persona.
   *  Los trabajos de lote (lote_de) y los listo/error no cuentan. */
  function estadoEscritura(o) {
    o = o || {};
    var ahora = o.ahora == null ? Date.now() : ms(o.ahora), tope = (o.topeMin == null ? 10 : +o.topeMin) * 60000;
    var vivos = (o.trabajos || []).filter(function (t) { return t && !t.lote_de && (t.estado === 'tomado' || t.estado === 'pendiente'); });
    var fresco = null, viejo = null;
    vivos.forEach(function (t) {
      if (t.estado !== 'tomado') return;
      var a = ms(t.tomado_at), b = ms(t.avance_at), ult = Math.max(isNaN(a) ? -Infinity : a, isNaN(b) ? -Infinity : b);
      var reg = { t: t, ult: ult, desde: (!isNaN(b) && b >= (isNaN(a) ? -Infinity : a)) ? t.avance_at : t.tomado_at };
      if (ult > -Infinity && ahora - ult <= tope) { if (!fresco || ult > fresco.ult) fresco = reg; }
      else if (!viejo || ult > viejo.ult) viejo = reg;
    });
    if (fresco) {
      var av = fresco.t.avance;
      if (av && typeof av === 'object') av = av.texto || av.paso || null;
      return { k: 'agente', texto: '🤖 El agente está escribiendo…', paso: av || null, trabajo_id: fresco.t.id };
    }
    if (viejo) return { k: 'detenido', texto: 'Se detuvo', trabajo_id: viejo.t.id, desde: viejo.desde == null ? null : viejo.desde };
    if (vivos.some(function (t) { return t.estado === 'pendiente'; })) return { k: 'cola', texto: '🤖 En la cola del agente' };
    var vistos = {}, gente = [];
    (o.escriben || []).forEach(function (e) {
      if (!e || e.actor == null || e.actor === o.yo || vistos[e.actor]) return;
      var t = ms(e.at); if (isNaN(t) || ahora - t > PERSONA_MS) return;
      vistos[e.actor] = 1; gente.push(e);
    });
    if (!gente.length) return null;
    var nombres = gente.map(function (e) { return e.nombre || String(e.actor); });
    return { k: 'persona', texto: unirNombres(nombres) + (gente.length > 1 ? ' están escribiendo…' : ' está escribiendo…'), actor: gente[0].actor, actores: gente.map(function (e) { return e.actor; }) };
  }
  /** Para la fila de la lista: sustituye la vista previa, como WhatsApp. '' si no hay nada que mostrar. */
  function escrituraFilaHtml(e) {
    if (!e) return '';
    var t = e.k === 'agente' ? '🤖 escribiendo…' : e.k === 'cola' ? '🤖 en cola' : e.k === 'detenido' ? '⚠ se detuvo' : e.k === 'persona' ? e.texto : '';
    if (!t) return '';
    return '<span class="chwa-ef chwa-ef-' + esc(e.k) + '">' + esc(t) + '</span>';
  }
  /** La línea chica bajo el nombre del chat. Si se detuvo, trae <button data-chwa-reintentar> para que el producto lo enganche. */
  function escrituraCabeceraHtml(e) {
    if (!e) return '';
    if (e.k === 'agente' || e.k === 'persona') return escribiendo(e.texto);
    if (e.k === 'cola') return '<span class="chwa-escribe chwa-esc-cola" role="status" aria-live="polite">' + esc(e.texto || '🤖 En la cola del agente') + '</span>';
    if (e.k === 'detenido') {
      return '<span class="chwa-esc-det" role="status" aria-live="polite"><span class="chwa-esc-msg">⚠ El agente se detuvo' + (e.desde ? '<span class="chwa-esc-desde"> · ' + esc(hora(e.desde)) + '</span>' : '') + '</span>' +
        '<span aria-hidden="true">&nbsp;·&nbsp;</span><button type="button" class="chwa-reint" data-chwa-reintentar' + (e.trabajo_id != null ? ' data-chwa-trabajo="' + esc(e.trabajo_id) + '"' : '') + '>Reintentar</button></span>';
    }
    return '';
  }
  /** Avisa «estoy escribiendo» como mucho una vez cada cadaMs mientras la persona teclea (primer golpe inmediato).
   *  tecla(texto?) — si se pasa el texto y está vacío, no avisa. reloj() solo para pruebas. */
  function tecleo(o) {
    o = o || {};
    var cada = o.cadaMs == null ? 4000 : +o.cadaMs, reloj = typeof o.reloj === 'function' ? o.reloj : function () { return Date.now(); }, ult = -Infinity;
    return {
      tecla: function (txt) {
        if (arguments.length && String(txt == null ? '' : txt).trim() === '') return false;
        var t = reloj(); if (t - ult < cada) return false;
        ult = t; if (typeof o.enviar === 'function') o.enviar(); return true;
      },
      reiniciar: function () { ult = -Infinity; }
    };
  }

  /* ═══ I · barra de estado del agente (V1.52, prototipo v152 «estados»): SOLO con un proceso vivo en la base ═══
   * El producto le pasa lo que dijo el servidor en ESTA consulta (`agente`): {estado:'trabajando', quien:'motor'|'robot'|
   * 'respaldo', paso, pasos[], paso_i, hechos[], desde, gasto, proceso_id}. Cualquier otro estado (o null) la esconde:
   * nada se pinta por deducción. Tocarla la expande (hechos ✓, en curso, faltan, desde y gasto). «Detener» sale solo si
   * el producto dice que esta persona puede (dueño o administrador) y llama a alDetener(proceso); desde ahí dice
   * «Deteniendo en el siguiente punto seguro…» hasta que el servidor cierre ESE proceso (deja de venir vivo). */
  var QUIEN = { motor: 'Motor · te contesta', robot: 'Robot asistente · trabaja solo', respaldo: 'Respaldo · te contesta en minutos' };
  function quienEstado(q, textos) { var t = textos || {}; return t[q] || QUIEN[q] || QUIEN.motor; }
  /** 312000 → '312 mil tokens ponderados' · 1100000 → '1.1 millones de tokens ponderados'. Sin dato → ''. */
  function gastoTexto(n) {
    n = Number(n); if (!isFinite(n) || n <= 0) return '';
    if (n < 1000) return Math.round(n) + ' tokens ponderados';
    if (n < 1e6) return Math.round(n / 1000) + ' mil tokens ponderados';
    var m = Math.round(n / 1e5) / 10;
    return (m === 1 ? '1 millón' : String(m) + ' millones') + ' de tokens ponderados';
  }
  function vivo(a) { return !!(a && a.estado === 'trabajando'); }
  function barraEstado(o) {
    o = o || {};
    var st = { ag: null, abierta: false, deteniendo: null, puede: false, error: '' };
    var el = D.createElement('div'); el.className = 'chwa-est'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    function pasosHtml(a) {
      var P = Array.isArray(a.pasos) ? a.pasos : [], i = Number(a.paso_i), H = Array.isArray(a.hechos) ? a.hechos : [];
      if (!isFinite(i) || i < 0) i = 0;
      var hechos = H.length ? H : P.slice(0, i), faltan = P.slice(i + 1);
      var fila = function (k, x, ic) { return '<div class="chwa-est-paso ' + k + '"><span class="chwa-est-pi" aria-hidden="true">' + ic + '</span><span>' + esc(x) + '</span></div>'; };
      return hechos.map(function (x) { return fila('h', typeof x === 'object' && x ? (x.texto || x.paso || '') : x, '✓'); }).join('') +
        fila('c', a.paso || P[i] || 'Trabajando', '•') + faltan.map(function (x) { return fila('f', x, '○'); }).join('');
    }
    function pintar() {
      var a = st.ag;
      if (!vivo(a)) { el.hidden = true; el.innerHTML = ''; el.classList.remove('chwa-abierta'); return; }
      el.hidden = false; el.classList.toggle('chwa-abierta', st.abierta);
      var q = a.quien === 'robot' || a.quien === 'respaldo' ? a.quien : 'motor';
      var det = st.deteniendo != null && String(st.deteniendo) === String(a.proceso_id);
      var desde = hora(a.desde), g = gastoTexto(a.gasto);
      el.innerHTML = '<button type="button" class="chwa-est-l" data-chwa-est="tog" aria-expanded="' + st.abierta + '">' +
        '<span class="chwa-est-giro" aria-hidden="true"></span><span class="chwa-est-tx"><span class="chwa-est-q chwa-q-' + q + '">' + esc(quienEstado(q, o.textos)) + '</span>' +
        '<span class="chwa-est-p">' + esc(det ? 'Deteniendo en el siguiente punto seguro…' : (a.paso || 'Trabajando')) + '</span></span>' +
        '<span class="chwa-est-t" aria-hidden="true">' + (st.abierta ? '▴' : '▾') + '</span></button>' +
        '<div class="chwa-est-x">' + pasosHtml(a) +
        ((desde || g) ? '<div class="chwa-est-meta">' + (desde ? 'Corre desde las ' + esc(desde) : '') + (desde && g ? ' · ' : '') + (g ? 'lleva ' + esc(g) : '') + '</div>' : '') +
        (st.puede && a.proceso_id != null
          ? '<div class="chwa-est-acc"><button type="button" class="chwa-est-det" data-chwa-est="det"' + (det ? ' disabled aria-busy="true"' : '') + '>' +
            '<span class="chwa-est-cuad" aria-hidden="true"></span>' + (det ? 'Deteniendo en el siguiente punto seguro…' : 'Detener') + '</button>' +
            '<span class="chwa-est-meta">' + esc(st.error || 'Corta en el siguiente punto seguro. Lo que ya quedó guardado se queda.') + '</span></div>'
          : '<div class="chwa-est-meta">' + esc(o.textoSinPermiso || 'Solo el dueño del caso o un administrador pueden detenerlo.') + '</div>') + '</div>';
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-chwa-est]'); if (!b || b.disabled) return;
      if (b.getAttribute('data-chwa-est') === 'tog') { st.abierta = !st.abierta; pintar(); return; }
      var a = st.ag; if (!vivo(a) || typeof o.alDetener !== 'function') return;
      st.deteniendo = a.proceso_id; st.error = ''; pintar();
      Promise.resolve(o.alDetener(a)).then(function (r) {
        if (r && r.ok === false) { st.deteniendo = null; st.error = r.mensaje || 'No se pudo detener. Intenta otra vez.'; pintar(); }
      }, function () { st.deteniendo = null; st.error = 'No se pudo detener. Intenta otra vez.'; pintar(); });
    });
    /** Lo que dijo el servidor en ESTA consulta. op.puedeDetener: si esta persona ve «Detener». */
    el.chwaPoner = function (a, op) {
      op = op || {};
      if (op.puedeDetener !== undefined) st.puede = !!op.puedeDetener;
      var antes = st.ag; st.ag = vivo(a) ? a : null;
      // «Deteniendo…» dura hasta que el servidor deja de traer ESE proceso vivo (o desde que el servidor ya dice quién lo detiene).
      if (!st.ag) { st.abierta = false; st.deteniendo = null; st.error = ''; }
      else {
        if (antes && String(antes.proceso_id) !== String(st.ag.proceso_id)) { st.abierta = false; st.error = ''; }
        if (st.ag.detener_por || st.ag.deteniendo === true) st.deteniendo = st.ag.proceso_id;
        else if (st.deteniendo != null && String(st.deteniendo) !== String(st.ag.proceso_id)) st.deteniendo = null;
      }
      pintar(); return el;
    };
    el.chwaVivo = function () { return vivo(st.ag); };
    el.chwaDeteniendo = function () { return st.deteniendo; };
    el.chwaAbierta = function (v) { if (v !== undefined) { st.abierta = !!v; pintar(); } return st.abierta; };
    if (o.agente !== undefined) el.chwaPoner(o.agente, { puedeDetener: o.puedeDetener });
    return el;
  }

  /* ═══ J · hoja desde abajo (V1.52, adelantado de V1.53; prototipo v152 escena «Menú ⋮») ═══
   * En teléfono: sube desde abajo, máximo 70 % del alto, barra para arrastrar, X visible; se cierra tocando fuera,
   * deslizando hacia abajo (> 80 px), con Esc o con Atrás. En PC (≥ 900 px): tarjeta flotante arriba a la derecha
   * (los menús ⋮ del producto siguen siendo su popover; esto es para cuando el producto la pide también en PC).
   *   ChatWA.hoja({ titulo, html, etiqueta?, ancho?:'380px', alCerrar(motivo) }) → { el, cuerpo, cerrar(motivo) }
   *   ChatWA.hojaAbierta() → el | null   ·   ChatWA.cerrarHoja()   ·   ChatWA.esPc() */
  var hojaCtl = null, hsec = 0;
  function esPc() { try { return G.matchMedia('(min-width:900px)').matches; } catch (e) { return (G.innerWidth || 0) >= 900; } }
  function hoja(o) {
    o = o || {};
    if (hojaCtl) hojaCtl.cerrar('otra');
    var id = ++hsec, antes = D.activeElement;
    var velo = D.createElement('div'); velo.className = 'chwa-hoja-velo';
    var el = D.createElement('div'); el.className = 'chwa-hoja' + (esPc() ? ' chwa-hoja-pc' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'chwa-hoja-t' + id);
    if (o.ancho && esPc()) el.style.width = o.ancho;
    el.innerHTML = '<div class="chwa-hoja-cab"><span class="chwa-hoja-asa" aria-hidden="true"></span><b id="chwa-hoja-t' + id + '">' + esc(o.titulo || '') + '</b>' +
      '<button type="button" class="chwa-hoja-x" aria-label="Cerrar"><svg class="chwa-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="chwa-hoja-c">' + (o.html || '') + '</div>';
    D.body.appendChild(velo); D.body.appendChild(el);
    var cuerpo = el.querySelector('.chwa-hoja-c');
    var ctl = { el: el, cuerpo: cuerpo, id: id };
    function tecla(e) { if (e.key === 'Escape' && hojaCtl === ctl) { e.preventDefault(); e.stopPropagation(); ctl.cerrar('esc'); } }
    function quitar(motivo) {
      if (!el.parentNode) return false;
      D.removeEventListener('keydown', tecla, true);
      el.parentNode.removeChild(el); if (velo.parentNode) velo.parentNode.removeChild(velo);
      if (hojaCtl === ctl) hojaCtl = null;
      if (antes && antes.focus && motivo !== 'otra') { try { antes.focus({ preventScroll: true }); } catch (e) {} }
      if (typeof o.alCerrar === 'function') o.alCerrar(motivo);
      return true;
    }
    ctl.cerrar = function (motivo) {
      if (!quitar(motivo || 'codigo')) return;
      // Cerrada por la persona (fuera, X, Esc, deslizar): se saca su entrada del historial. Cerrada por el código (eligió algo
      // del menú): solo se desmarca, porque lo que sigue puede empujar su propia entrada (visor, vista) y un back() tardío la tiraría.
      var st = G.history.state;
      if (st && st.chwaHoja === id) {
        ctl.salioPorAtras = true;
        if (['fuera', 'x', 'esc', 'deslizar'].indexOf(motivo) >= 0) { try { G.history.back(); } catch (e) {} }
        else { var n = {}; for (var k2 in st) if (k2 !== 'chwaHoja' && Object.prototype.hasOwnProperty.call(st, k2)) n[k2] = st[k2]; try { G.history.replaceState(n, ''); } catch (e) {} }
      }
    };
    ctl.quitar = quitar;
    hojaCtl = ctl;
    D.addEventListener('keydown', tecla, true);
    velo.addEventListener('click', function () { ctl.cerrar('fuera'); });
    el.querySelector('.chwa-hoja-x').addEventListener('click', function () { ctl.cerrar('x'); });
    // Atrás cierra (una entrada propia en el historial que conserva el estado del producto, como el menú ⋮)
    var est = {}, h0 = G.history.state;
    if (h0 && typeof h0 === 'object') for (var k in h0) if (Object.prototype.hasOwnProperty.call(h0, k)) est[k] = h0[k];
    est.chwaHoja = id; try { G.history.pushState(est, ''); } catch (e) {}
    // deslizar hacia abajo desde la barra de arriba (solo teléfono)
    var cab = el.querySelector('.chwa-hoja-cab'), y0 = null, dy = 0;
    cab.addEventListener('pointerdown', function (e) {
      if (esPc() || (e.target.closest && e.target.closest('.chwa-hoja-x'))) return;
      y0 = e.clientY; dy = 0; el.style.transition = 'none'; try { cab.setPointerCapture(e.pointerId); } catch (er) {}
    });
    cab.addEventListener('pointermove', function (e) { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = 'translateY(' + dy + 'px)'; });
    var soltar = function () { if (y0 === null) return; y0 = null; el.style.transition = ''; if (dy > 80) ctl.cerrar('deslizar'); else el.style.transform = ''; };
    cab.addEventListener('pointerup', soltar); cab.addEventListener('pointercancel', soltar);
    // entra con animación (sin animación si la persona pidió menos movimiento: lo resuelve el CSS)
    G.requestAnimationFrame(function () { velo.classList.add('chwa-vis'); el.classList.add('chwa-vis'); });
    var b0 = cuerpo.querySelector('button:not([disabled]), [href], input, select, textarea');
    try { (b0 || el.querySelector('.chwa-hoja-x')).focus({ preventScroll: true }); } catch (e) {}
    return ctl;
  }
  G.addEventListener('popstate', function () { if (hojaCtl && !hojaCtl.salioPorAtras) hojaCtl.quitar('atras'); });

  /* ═══ D · hora en cada globo ═══ */
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  /** 'HH:MM' en 24 h, hora local del navegador. Acepta ISO (con o sin Z), número o Date. Lo ilegible da ''. */
  function hora(iso) {
    if (iso == null || iso === '') return '';
    var d;
    if (iso instanceof Date) d = iso;
    else if (typeof iso === 'number') d = new Date(iso);
    else {
      var s = String(iso).trim();
      if (/^\d{1,2}:\d{2}$/.test(s)) return s.length === 4 ? '0' + s : s;
      // Odoo/Postgres sin zona: «2026-10-16 13:40:00» es UTC (CLAUDE.md §11 #1)
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
      d = new Date(s);
    }
    if (!d || isNaN(d.getTime())) return '';
    return dos(d.getHours()) + ':' + dos(d.getMinutes());
  }
  /** La hora chica alineada a la derecha. leido: true = ✓✓ azul (leído) · false = ✓✓ gris (entregado) · sin dato = nada. */
  function horaHtml(iso, o) {
    o = o || {};
    var h = hora(iso), pal = '';
    if (o.leido === true) pal = '<span class="chwa-pal leido" role="img" aria-label="Leído">' + ico('palomas') + '</span>';
    else if (o.leido === false) pal = '<span class="chwa-pal" role="img" aria-label="Entregado">' + ico('palomas') + '</span>';
    if (!h && !pal) return '';
    return '<span class="chwa-hora"' + (typeof iso === 'string' && iso.length > 5 ? ' title="' + esc(iso) + '"' : '') + '><time>' + esc(h) + '</time>' + pal + '</span>';
  }

  /* ═══ G · menú ⋮ delgado y anclado ═══ */
  var abierto = null, sec = 0, esperaPop = null, tragarClic = false, tTragar = null;
  function menu(boton, items, o) {
    o = o || {};
    if (abierto && abierto.boton === boton) { abierto.cerrar('boton'); return null; }
    if (abierto) abierto.cerrar('otro');
    items = (items || []).filter(function (x) { return !!x; });
    var id = ++sec, el = D.createElement('div');
    el.className = 'chwa-menu'; el.setAttribute('role', 'menu'); el.id = 'chwa-menu-' + id;
    if (boton.id) el.setAttribute('aria-labelledby', boton.id);
    el.innerHTML = items.map(function (x, i) {
      var dis = !!x.deshabilitado, sub = dis ? (x.razon || x.sub) : x.sub;
      return '<button type="button" role="menuitem" class="chwa-mi' + (dis ? ' off' : '') + '" data-chwa-i="' + i + '"' + (dis ? ' disabled aria-disabled="true"' : '') + (x.id ? ' data-chwa-id="' + esc(x.id) + '"' : '') + '>' +
        (x.icono ? '<span class="chwa-mi-ic" aria-hidden="true">' + x.icono + '</span>' : '') +
        '<span class="chwa-mi-tx">' + esc(x.texto) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
    }).join('');
    D.body.appendChild(el);
    // anclado al botón: pegado a su borde derecho y abajo; si no cabe, se voltea a la izquierda o hacia arriba
    var r = boton.getBoundingClientRect(), vw = D.documentElement.clientWidth, vh = G.innerHeight;
    el.style.maxHeight = (vh - 16) + 'px';
    var w = el.offsetWidth, h = el.offsetHeight, left, top;
    if (r.left + r.width / 2 > vw / 2) { left = r.right - 6 - w; el.style.transformOrigin = 'top right'; }
    else { left = r.left + 6; el.style.transformOrigin = 'top left'; }
    left = Math.max(8, Math.min(vw - w - 8, left));
    top = r.bottom - 6;
    if (top + h > vh - 8) { top = r.top + 6 - h; if (top < 8) top = Math.max(8, vh - 8 - h); el.style.transformOrigin = el.style.transformOrigin.replace('top', 'bottom'); }
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
    boton.setAttribute('aria-haspopup', 'menu'); boton.setAttribute('aria-expanded', 'true'); boton.setAttribute('aria-controls', el.id);
    // Atrás cierra: una entrada propia en el historial que conserva el estado del producto
    var est = {}, h0 = G.history.state;
    if (h0 && typeof h0 === 'object') for (var k in h0) if (Object.prototype.hasOwnProperty.call(h0, k)) est[k] = h0[k];
    est.chwaMenu = id;
    try { G.history.pushState(est, ''); } catch (e) {}
    var ctl = { el: el, boton: boton, id: id };
    function quitar(motivo) {
      if (!el.parentNode) return false;
      el.parentNode.removeChild(el);
      boton.setAttribute('aria-expanded', 'false'); boton.removeAttribute('aria-controls');
      if (abierto === ctl) abierto = null;
      if (motivo !== 'fuera' && motivo !== 'otro') { try { boton.focus({ preventScroll: true }); } catch (e) { boton.focus(); } }
      if (typeof o.alCerrar === 'function') o.alCerrar(motivo);
      return true;
    }
    ctl.cerrar = function (motivo, despues) {
      if (!quitar(motivo || 'codigo')) return;
      var st = G.history.state;
      if (st && st.chwaMenu === id) {   // sacar la entrada del menú antes de que el producto haga lo suyo
        esperaPop = { id: id, despues: despues || null, t: setTimeout(function () { var x = esperaPop; esperaPop = null; if (x && x.despues) x.despues(); }, 400) };
        G.history.back();
      } else if (despues) setTimeout(despues, 0);
    };
    ctl.quitar = quitar;
    abierto = ctl;
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-chwa-i]'); if (!b || b.disabled) return;
      var it = items[+b.getAttribute('data-chwa-i')];
      if (!it || it.deshabilitado) return;
      ctl.cerrar('eleccion', typeof it.al === 'function' ? function () { it.al(it); } : null);
    });
    el.addEventListener('keydown', function (e) {
      var bs = Array.prototype.slice.call(el.querySelectorAll('[role="menuitem"]:not([disabled])'));
      var i = bs.indexOf(D.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (bs.length) bs[(i + 1) % bs.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (bs.length) bs[(i - 1 + bs.length) % bs.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); if (bs.length) bs[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); if (bs.length) bs[bs.length - 1].focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); ctl.cerrar('tab'); }
    });
    var b0 = el.querySelector('[role="menuitem"]:not([disabled])');
    if (b0) b0.focus({ preventScroll: true }); else { el.tabIndex = -1; el.focus({ preventScroll: true }); }
    return ctl;
  }
  /* tocar fuera solo cierra el menú: ese toque no activa lo que está debajo (como en Android) */
  D.addEventListener('pointerdown', function (e) {
    if (!abierto) return;
    if (abierto.el.contains(e.target) || abierto.boton.contains(e.target)) return;
    abierto.cerrar('fuera');
    tragarClic = true; clearTimeout(tTragar); tTragar = setTimeout(function () { tragarClic = false; }, 600);
  }, true);
  D.addEventListener('click', function (e) { if (tragarClic) { tragarClic = false; e.stopPropagation(); e.preventDefault(); } }, true);
  D.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (abierto) { e.preventDefault(); e.stopPropagation(); abierto.cerrar('esc'); return; }
    if (tipEl && !tipEl.hidden) { ocultarTip(); }
  }, true);
  G.addEventListener('popstate', function () {
    if (esperaPop) { var x = esperaPop; esperaPop = null; clearTimeout(x.t); if (x.despues) x.despues(); return; }
    if (abierto) abierto.quitar('atras');
  });

  function itemIrAlMachote(o) {
    o = o || {};
    if (!o.folio) return { id: 'ir-machote', texto: o.textoSin || 'Aún no hay machote', deshabilitado: true, razon: o.razon || '' };
    return { id: 'ir-machote', texto: o.texto || 'Ir al machote', sub: o.folio + (o.version != null && o.version !== '' ? ' · versión ' + o.version : ''), al: o.al };
  }

  /* ═══ barra inferior opcional (32 px) que cada persona puede apagar ═══ */
  function claveBarra(c) { return 'chwa_barra:' + (c || 'anon'); }
  function barraVisible(c) { return leer(claveBarra(c)) !== '0'; }
  var barras = [];
  function ponBarra(c, v) {
    guardar(claveBarra(c), v ? '1' : '0');
    barras.forEach(function (b) { if (b.clave === c) b.el.hidden = !v; });
    barras = barras.filter(function (b) { return b.el.isConnected; });   // las que el producto ya tiró
    return !!v;
  }
  function barra(o) {
    o = o || {};
    var items = o.items || [], activa = o.activa != null ? o.activa : (items[0] && items[0].id);
    var el = D.createElement('nav'); el.className = 'chwa-barra'; el.setAttribute('aria-label', o.etiqueta || 'Secciones');
    function pintar() {
      el.innerHTML = items.map(function (x) {
        var on = x.id === activa;
        return '<button type="button" class="chwa-tab' + (on ? ' on' : '') + '" data-chwa-tab="' + esc(x.id) + '"' + (on ? ' aria-current="page"' : '') + '>' +
          (x.icono ? '<span class="chwa-tab-ic" aria-hidden="true">' + x.icono + '</span>' : '') + '<span class="chwa-tab-tx">' + esc(x.texto) + '</span>' +
          (x.badge ? '<b class="chwa-tab-n" aria-label="' + esc(x.badge) + ' pendientes">' + esc(x.badge) + '</b>' : '') + '</button>';
      }).join('');
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-chwa-tab]'); if (!b) return;
      var id = b.getAttribute('data-chwa-tab'), it = items.filter(function (x) { return String(x.id) === id; })[0];
      activa = it ? it.id : id; pintar();
      if (it && typeof it.al === 'function') it.al(it);
    });
    el.chwaActiva = function (id) { if (id !== undefined) { activa = id; pintar(); } return activa; };
    el.chwaItems = function (n) { if (n) { items = n; pintar(); } return items; };
    pintar();
    if (o.apagable !== false && o.claveUsuario != null) {
      el.hidden = !barraVisible(o.claveUsuario);
      barras.push({ el: el, clave: o.claveUsuario });
    }
    return el;
  }
  /** Renglón para el ⋮: «Ocultar barra inferior» / «Mostrar barra inferior». */
  function itemBarra(c, alCambiar) {
    var v = barraVisible(c);
    return { id: 'barra', texto: v ? 'Ocultar barra inferior' : 'Mostrar barra inferior', al: function () { ponBarra(c, !v); if (typeof alCambiar === 'function') alCambiar(!v); } };
  }

  /* ═══ instalar como app ═══ */
  var diferido = null, escuchando = false, dlgAbierto = null;
  function esIOS() {
    var n = G.navigator || {}, ua = n.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  }
  var instalar = {
    escuchar: function () {
      if (escuchando) return; escuchando = true;
      G.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); diferido = e; });
      G.addEventListener('appinstalled', function () { diferido = null; });
    },
    instalada: function () {
      try { if (G.matchMedia && G.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) {}
      return !!(G.navigator && G.navigator.standalone === true);
    },
    /** 'instalada' · 'prompt' (el navegador ofrece instalar) · 'ios' (instrucciones) · 'manual' (instrucciones generales) */
    modo: function () {
      if (instalar.instalada()) return 'instalada';
      if (diferido) return 'prompt';
      return esIOS() ? 'ios' : 'manual';
    },
    disponible: function () { var m = instalar.modo(); return m === 'prompt' || m === 'ios'; },
    /** Pide instalar. Con el aviso del navegador lo lanza; si no (iPhone/iPad u otro), muestra las instrucciones.
     *  Devuelve Promise con 'aceptada' · 'rechazada' · 'instrucciones' · 'instalada'. */
    pedir: function (o) {
      o = o || {};
      var m = instalar.modo();
      if (m === 'instalada') return Promise.resolve('instalada');
      if (m === 'prompt') {
        var ev = diferido; diferido = null;
        try {
          ev.prompt();
          return Promise.resolve(ev.userChoice).then(function (c) { return c && c.outcome === 'accepted' ? 'aceptada' : 'rechazada'; }, function () { return 'rechazada'; });
        } catch (e) { m = esIOS() ? 'ios' : 'manual'; }
      }
      return new Promise(function (res) { dialogo(m, o, function () { res('instrucciones'); }); });
    }
  };
  function dialogo(m, o, fin) {
    if (dlgAbierto) dlgAbierto();
    var antes = D.activeElement, f = D.createElement('div');
    f.className = 'chwa-dlg';
    var cuerpo = m === 'ios'
      ? '<p class="chwa-dlg-paso">' + esc(o.ios || 'Toca Compartir → Agregar a inicio') + '</p><p>' + esc(o.iosNota || 'En Safari, el botón Compartir está abajo al centro (en iPad, arriba a la derecha).') + '</p>'
      : '<p>' + esc(o.nota || 'Queda como una app más, con su ícono y sin la barra del navegador.') + '</p>' +
        '<p><b>Android:</b> en Chrome, ⋮ y luego «Instalar app».</p><p><b>iPhone:</b> en Safari, Compartir y luego «Agregar a inicio».</p><p><b>PC:</b> el ícono de instalar al final de la barra de direcciones.</p>';
    f.innerHTML = '<div class="chwa-dlg-c" role="dialog" aria-modal="true" aria-labelledby="chwa-dlg-t"><h2 id="chwa-dlg-t">' + esc(o.titulo || 'Instalar la app') + '</h2>' + cuerpo +
      '<div class="chwa-dlg-acc"><button type="button" class="chwa-lnk" data-chwa-ok>Entendido</button></div></div>';
    D.body.appendChild(f);
    function cerrar() {
      if (!f.parentNode) return;
      f.parentNode.removeChild(f); D.removeEventListener('keydown', tecla, true); dlgAbierto = null;
      if (antes && antes.focus) try { antes.focus({ preventScroll: true }); } catch (e) {}
      fin();
    }
    function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); } }
    D.addEventListener('keydown', tecla, true);
    f.addEventListener('click', function (e) { if (e.target === f || (e.target.closest && e.target.closest('[data-chwa-ok]'))) cerrar(); });
    f.querySelector('[data-chwa-ok]').focus();
    dlgAbierto = cerrar;
  }
  function itemInstalar(o) {
    o = o || {};
    if (instalar.instalada()) return null;
    return { id: 'instalar', texto: o.texto || 'Instalar app', sub: o.sub, icono: o.icono, al: function () { instalar.pedir(o); } };
  }

  /* ═══ Mis proyectos: la lista abre con lo mío (dueño o participo); «Todos» para quien puede ═══ */
  function misProyectos(o) {
    o = o || {};
    var clave = 'chwa_mis:' + (o.claveUsuario || 'anon'), puede = !!o.puedeVerTodos;
    var esMio = typeof o.esMio === 'function' ? o.esMio : function () { return true; };
    var modo = 'mios';
    if (puede && leer(clave) === 'todos') modo = 'todos';
    var ctl = {
      modo: function () { return modo; },
      poner: function (m) {
        m = (m === 'todos' && puede) ? 'todos' : 'mios';
        modo = m; guardar(clave, m); return modo;
      },
      filtrar: function (lista) { lista = lista || []; return modo === 'todos' ? lista.slice() : lista.filter(function (c) { return !!esMio(c); }); },
      contar: function (lista) { lista = lista || []; return { mios: lista.filter(function (c) { return !!esMio(c); }).length, todos: lista.length }; },
      /** contadores: { mios, todos } o la lista completa (se cuenta aquí). { sinEnvoltura:true } da solo los botones. */
      chipsHtml: function (contadores, op) {
        var c = Array.isArray(contadores) ? ctl.contar(contadores) : (contadores || {});
        var b = function (m, t, n) {
          return '<button type="button" class="chwa-chip' + (modo === m ? ' on' : '') + '" data-chwa-mis="' + m + '" aria-pressed="' + (modo === m) + '">' + esc(t) +
            (n != null ? '<i>' + (+n || 0) + '</i>' : '') + '</button>';
        };
        var h = b('mios', o.textoMios || 'Mis proyectos', c.mios) + (puede ? b('todos', o.textoTodos || 'Todos', c.todos) : '');
        return op && op.sinEnvoltura ? h : '<div class="chwa-chips" role="group" aria-label="' + esc(o.etiqueta || 'Qué proyectos ver') + '">' + h + '</div>';
      },
      enlazar: function (root, alCambiar) {
        function clic(e) {
          var b = e.target.closest && e.target.closest('[data-chwa-mis]'); if (!b || !root.contains(b)) return;
          var antes = modo, m = ctl.poner(b.getAttribute('data-chwa-mis'));
          if (typeof alCambiar === 'function') alCambiar(m, antes);
        }
        root.addEventListener('click', clic);
        return function () { root.removeEventListener('click', clic); };
      }
    };
    return ctl;
  }

  /* ═══ fila de la lista (opcional) ═══ */
  function fila(o) {
    o = o || {};
    var av = o.avatar || {}, gl = o.globitos, nuevo = false, glh = '';
    if (gl && typeof gl === 'object') { nuevo = (+gl.sinLeer || 0) > 0; glh = globitos(gl); }
    else if (typeof gl === 'string') { glh = gl; nuevo = gl.indexOf('chwa-badge') >= 0; }
    if (o.nuevo != null) nuevo = !!o.nuevo;
    var ini = av.iniciales || String(o.titulo || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    return '<button type="button" class="chwa-fila' + (o.activa ? ' on' : '') + '"' + (o.id != null ? ' data-chwa-id="' + esc(o.id) + '"' : '') + (o.activa ? ' aria-current="true"' : '') + '>' +
      '<span class="chwa-av" style="background:' + esc(av.color || '#00a884') + '" aria-hidden="true">' + esc(ini) + '</span>' +
      '<span class="chwa-fila-tx"><span class="chwa-l1"><span class="chwa-tit">' + esc(o.titulo) + '</span>' +
      (o.hora ? '<span class="chwa-fh' + (nuevo ? ' nuevo' : '') + '">' + esc(o.hora) + '</span>' : '') + '</span>' +
      '<span class="chwa-l2">' + (o.escritura ? escrituraFilaHtml(o.escritura).replace('class="chwa-ef', 'class="chwa-prev chwa-ef') : '') +
      (o.escritura && escrituraFilaHtml(o.escritura) ? '' : '<span class="chwa-prev">' + esc(o.linea) + '</span>') +
      (o.dueno ? '<span class="chwa-dueno">' + esc(o.dueno) + '</span>' : '') +
      (o.fijado ? '<span class="chwa-fijo" role="img" aria-label="Fijada">' + ico('pin') + '</span>' : '') + glh + '</span></span></button>';
  }

  G.ChatWA = {
    version: '1.52',
    esc: esc,
    globitos: globitos, enlazarGlobitos: enlazarGlobitos, ocultarExplicacion: ocultarTip,
    superados: superados, marcarSuperada: marcarSuperada,
    escribiendo: escribiendo, pasoEnCurso: pasoEnCurso,
    estadoEscritura: estadoEscritura, escrituraFilaHtml: escrituraFilaHtml, escrituraCabeceraHtml: escrituraCabeceraHtml, tecleo: tecleo,
    hora: hora, horaHtml: horaHtml,
    barraEstado: barraEstado, quienEstado: quienEstado, gastoTexto: gastoTexto,
    hoja: hoja, hojaAbierta: function () { return hojaCtl ? hojaCtl.el : null; }, cerrarHoja: function () { if (hojaCtl) hojaCtl.cerrar('codigo'); }, esPc: esPc,
    menu: menu, menuAbierto: function () { return abierto ? abierto.el : null; }, cerrarMenu: function () { if (abierto) abierto.cerrar('codigo'); },
    itemIrAlMachote: itemIrAlMachote, itemInstalar: itemInstalar, itemBarra: itemBarra,
    barra: barra, barraVisible: barraVisible, ponBarra: ponBarra,
    instalar: instalar,
    misProyectos: misProyectos,
    fila: fila
  };
})(window);
