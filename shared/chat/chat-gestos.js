/* ═══ shared/chat · gestos del chat tipo WhatsApp: copiar, responder deslizando, reenviar (V1.39, #4 punto 11) ═══
 *
 * Un solo componente para cualquier chat de la suite (hoy lo engancha el conceptualizador; Marketing lo puede
 * enganchar igual). No pinta mensajes ni manda nada: el chat que lo usa sigue siendo dueño de su render y de su
 * envío, y el componente solo agrega los gestos encima y le avisa por callbacks.
 *
 *   · Toque largo (teléfono): selecciona el mensaje; arriba aparece la barra  ← 1 · Responder · Reenviar · ⋮
 *     y en ⋮ va «Copiar» («Copiar transcripción» si es nota de voz).
 *   · Escritorio: ⌄ al pasar el mouse sobre el mensaje, o clic derecho → menú Responder · Copiar · Reenviar.
 *   · Deslizar a la derecha (≥ 60 px): responde citando. La cita aparece arriba de la caja de escribir.
 *   · Tocar una cita lleva al mensaje original (scroll + resaltar).
 *   · Reenviar puede ir deshabilitado con su razón (en los chats de machote todavía no existe).
 *
 * Uso:
 *   var g = ChatGestos.enganchar({
 *     contenedor: el,            // donde viven las burbujas (se usa delegación: sobrevive a innerHTML)
 *     cabecera: el,              // la barra de selección la sustituye mientras hay un mensaje seleccionado
 *     antesDe: el,               // la cita de «respondiendo a…» se inserta justo antes de este elemento (la caja)
 *     burbujas: '[data-chg-id]', // selector de burbujas seleccionables; el id va en data-chg-id
 *     mensaje: function (id) → { quien, texto, voz:boolean } | null,   // para copiar y para la cita
 *     onResponder: function (id) {}, onCancelarRespuesta: function () {},
 *     puedeReenviar: function (id) → boolean, razonReenviar: 'texto', onReenviar: function (id) {},
 *     aviso: function (texto) {}  // el toast del chat
 *   });
 *   g.decorar()           después de cada repintado (pone el ⌄ y vuelve a marcar la selección)
 *   g.respondiendo()      id del mensaje que se está citando, o null
 *   g.cancelarRespuesta() / g.irA(id) / g.quitarSeleccion()
 *
 * La cita dentro de una burbuja la pinta el chat con ChatGestos.citaHtml(id, quien, resumen).
 *
 * ── Marcador de texto (servidor sin la columna `responde_a`) ──────────────────────────────────────────────
 * La pantalla se publica antes que la migración que guarda `responde_a`. Mientras el servidor no la tenga,
 * la referencia viaja en `datos.responde_a` (firmado) Y además el texto lleva al principio UNA línea legible:
 *
 *     ↩ msg 808: «primeras ~60 letras del citado»
 *     <el texto que escribió la persona>
 *
 * Así la cita no se pierde (el texto sí se guarda) y quien lea el hilo —una persona o el motor desde hilo.md—
 * sabe a qué contesta. Formato exacto: «↩ msg <id>: «<extracto>»» + salto de línea; el extracto es el texto del
 * citado en una sola línea, sin «»», cortado a 60 letras con «…». Se arma y se lee SOLO con
 * ChatGestos.marcador.armar() / .leer(): es el único lugar donde vive el formato.
 */
(function (G) {
  'use strict';
  var LARGO_MS = 450, DESLIZA_PX = 60, TOPE_PX = 90;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICO = {
    resp: '<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>',
    reen: '<path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/>',
    mas: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    atras: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  var ico = function (n, c) { return '<svg class="chg-ico' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>'; };


  /* Estilo del componente: va DENTRO del archivo (una sola petición; CLAUDE.md §20 #23) y con el prefijo chg-
   * para no chocar con las clases de cada chat (§20 #12: `.sel`, `.flecha`, `.brilla`, `.menu` ya existen en el
   * conceptualizador con otro significado). Los colores usan las variables del chat si existen. */
  var CSS = [
    '.chg-oculta{display:none!important}',
    '.chg-barra{display:none;height:var(--cab,52px);align-items:center;gap:4px;padding:0 4px;background:var(--sup,#fff);border-bottom:1px solid var(--linea,#e7e3dd);flex-shrink:0;color:var(--texto,#111b21)}',
    '.chg-barra.chg-vis{display:flex}',
    '.chg-cuantos{flex:1;font-size:18px;font-weight:500;padding-left:6px}',
    '.chg-bi{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#3b4a54;background:none;border:0;padding:0;cursor:pointer;flex-shrink:0}',
    '.chg-bi:hover,.chg-bi:active{background:rgba(11,20,26,.06)}',
    '.chg-bi[aria-disabled="true"]{opacity:.35}',
    '.chg-ico{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;display:block}',
    '.chg-ico.chg-s{width:20px;height:20px}',
    // La franja de selección ocupa el ancho del chat aunque la lista tenga relleno lateral (sin mover nada).
    '.chg-sel{background:rgba(0,128,105,.16);box-shadow:0 0 0 100vmax rgba(0,128,105,.16);clip-path:inset(0 -100vmax)}',
    '.chg-burb{position:relative;touch-action:pan-y;transition:transform .12s}',
    '.chg-burb.chg-arrastra{transition:none}',
    '@media (hover:none){.chg-burb{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}}',
    '.chg-flecha{align-self:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:var(--sec,#667781);opacity:0;margin-right:-30px;flex-shrink:0;box-shadow:0 1px .5px rgba(11,20,26,.13);pointer-events:none}',
    '.chg-brilla{animation:chgBrilla 1.4s}',
    '@keyframes chgBrilla{0%,60%{box-shadow:0 0 0 3px #f5c542}100%{box-shadow:0 1px .5px rgba(11,20,26,.13)}}',
    '.chg-chev{position:absolute;top:3px;right:3px;width:26px;height:22px;border-radius:0 12px 0 10px;background:inherit;color:var(--sec,#667781);display:none;align-items:center;justify-content:center;border:0;padding:0;cursor:pointer;z-index:1}',
    '@media (hover:hover){.chg-burb:hover>.chg-chev{display:flex}}',
    '.chg-cita{display:block;border:0;border-left:4px solid #06cf9c;background:rgba(11,20,26,.05);border-radius:6px;padding:4px 8px;margin:2px 0 5px;cursor:pointer;width:100%;min-width:0;max-width:100%;text-align:left;font:inherit;color:inherit}',
    '.chg-cita b{display:block;font-size:12.5px;font-weight:600;color:var(--acento-osc,#008069);line-height:1.3}',
    '.chg-cita span{display:block;font-size:13px;color:var(--sec,#667781);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}',
    '.chg-resp{display:none;margin:6px 6px 0;background:var(--sup,#fff);border-radius:14px;padding:6px 4px 0 6px;flex-shrink:0;box-shadow:0 1px .5px rgba(11,20,26,.13)}',
    '.chg-resp.chg-vis{display:flex;align-items:flex-start;gap:4px}',
    '.chg-resp .chg-cita-caja{margin:0 0 6px;flex:1;cursor:default}',
    '.chg-menu{position:fixed;width:250px;max-width:calc(100vw - 16px);background:var(--sup,#fff);color:var(--texto,#111b21);border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.2);z-index:140;display:none;padding:6px 0}',
    '.chg-menu.chg-vis{display:block}',
    '.chg-menu button{display:block;width:100%;text-align:left;padding:11px 18px;font:inherit;font-size:15px;background:none;border:0;color:inherit;cursor:pointer}',
    '.chg-menu button:hover{background:var(--sup2,#f6f5f3)}',
    '.chg-menu button[aria-disabled="true"]{color:var(--ter,#8696a0)}',
    '.chg-razon{font-size:12px;line-height:1.35;color:var(--sec,#667781);padding:0 18px 8px}'
  ].join('\n');
  function ponerCss() {
    if (document.getElementById('chg-css')) return;
    var st = document.createElement('style'); st.id = 'chg-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── el marcador: UN solo lugar ── */
  var EXTRACTO = 60;
  var RE_MARCA = /^↩ msg ([0-9]{1,18}): «([^\n]*)»\n/;
  function extracto(t) {
    var s = String(t || '').replace(/\s+/g, ' ').replace(/[«»]/g, '"').trim();
    return s.length > EXTRACTO ? s.slice(0, EXTRACTO).trim() + '…' : s;
  }
  var marcador = {
    /** El texto a mandar con su línea de cita al principio. */
    armar: function (id, textoCitado, texto) { return '↩ msg ' + id + ': «' + extracto(textoCitado) + '»\n' + (texto || ''); },
    /** { id, extracto, resto } si el texto empieza con el marcador; si no, null. */
    leer: function (texto) {
      var m = RE_MARCA.exec(String(texto || ''));
      return m ? { id: Number(m[1]), extracto: m[2], resto: String(texto).slice(m[0].length) } : null;
    },
    /** El texto sin el marcador (para copiar o citar). */
    quitar: function (texto) { var m = marcador.leer(texto); return m ? m.resto : String(texto || ''); },
    extracto: extracto
  };

  function citaHtml(id, quien, resumen) {
    return '<button type="button" class="chg-cita" data-chg-ir="' + esc(id) + '"><b>' + esc(quien || '') + '</b><span>' + esc(resumen || 'Mensaje') + '</span></button>';
  }

  async function alPortapapeles(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) {}
    try {
      var a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select(); var ok = document.execCommand('copy'); a.remove(); return ok;
    } catch (e) { return false; }
  }

  function enganchar(o) {
    ponerCss();
    var C = o.contenedor, sel = null, resp = null, g = null, ultimoPuntero = 'mouse';
    var selector = o.burbujas || '[data-chg-id]';
    var idDe = function (b) { var v = b && b.getAttribute('data-chg-id'); return v == null || v === '' ? null : (isNaN(Number(v)) ? v : Number(v)); };
    var burbujaDe = function (id) { return C.querySelector('[data-chg-id="' + String(id).replace(/"/g, '') + '"]'); };
    var avisa = function (t) { if (o.aviso) o.aviso(t); };
    var puedeReen = function (id) { return !!(o.puedeReenviar && o.puedeReenviar(id)); };
    var razon = o.razonReenviar || 'Reenviar todavía no está disponible aquí.';

    /* barra de selección (sustituye la cabecera) */
    var barra = document.createElement('div');
    barra.className = 'chg-barra'; barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Mensaje seleccionado');
    barra.innerHTML = '<button type="button" class="chg-bi" data-chg="quitar" aria-label="Quitar selección">' + ico('atras') + '</button><span class="chg-cuantos">1</span>' +
      '<button type="button" class="chg-bi" data-chg="resp" aria-label="Responder" title="Responder">' + ico('resp') + '</button>' +
      '<button type="button" class="chg-bi" data-chg="reen" aria-label="Reenviar" title="Reenviar">' + ico('reen') + '</button>' +
      '<button type="button" class="chg-bi" data-chg="mas" aria-label="Más opciones" title="Más opciones">' + ico('mas') + '</button>';
    if (o.cabecera && o.cabecera.parentNode) o.cabecera.parentNode.insertBefore(barra, o.cabecera.nextSibling);
    /* menú (⋮ o ⌄ o clic derecho) */
    var menu = document.createElement('div'); menu.className = 'chg-menu'; menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    /* respondiendo a… (arriba de la caja) */
    var rbar = document.createElement('div'); rbar.className = 'chg-resp';
    rbar.innerHTML = '<div class="chg-cita chg-cita-caja"><b></b><span></span></div><button type="button" class="chg-bi" data-chg="cancelar" aria-label="Cancelar respuesta">' + ico('x', 'chg-s') + '</button>';
    if (o.antesDe && o.antesDe.parentNode) o.antesDe.parentNode.insertBefore(rbar, o.antesDe);

    function marcar() {
      Array.prototype.forEach.call(C.querySelectorAll('.chg-sel'), function (e) { e.classList.remove('chg-sel'); });
      if (sel !== null) { var b = burbujaDe(sel); if (b) (b.parentNode || b).classList.add('chg-sel'); else sel = null; }
      if (o.cabecera) o.cabecera.classList.toggle('chg-oculta', sel !== null);
      barra.classList.toggle('chg-vis', sel !== null);
      var r = barra.querySelector('[data-chg="reen"]'); r.setAttribute('aria-disabled', sel !== null && puedeReen(sel) ? 'false' : 'true');
      if (sel !== null && !puedeReen(sel)) r.title = 'Reenviar: ' + razon; else r.title = 'Reenviar';
    }
    function decorar() {
      Array.prototype.forEach.call(C.querySelectorAll(selector), function (b) {
        b.classList.add('chg-burb');
        if (!b.querySelector(':scope > .chg-chev')) {
          var ch = document.createElement('button'); ch.type = 'button'; ch.className = 'chg-chev'; ch.setAttribute('aria-label', 'Opciones del mensaje'); ch.innerHTML = ico('chev', 'chg-s');
          b.appendChild(ch);
        }
      });
      marcar();
    }
    function cerrarMenu() { menu.classList.remove('chg-vis'); }
    function seleccionar(id) { sel = id; cerrarMenu(); marcar(); try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {} }
    function quitarSeleccion() { sel = null; cerrarMenu(); marcar(); }
    function pintarResp() {
      var m = resp !== null && o.mensaje ? o.mensaje(resp) : null;
      rbar.classList.toggle('chg-vis', resp !== null);
      if (resp !== null) { rbar.querySelector('b').textContent = (m && m.quien) || ''; rbar.querySelector('span').textContent = resumen(m); }
      if (o.alCambiar) o.alCambiar();
    }
    function resumen(m) { if (!m) return 'Mensaje'; return (m.voz ? '🎤 ' : '') + (marcador.quitar(m.texto) || (m.voz ? 'Nota de voz' : 'Mensaje')); }
    function responder(id) {
      sel = null; cerrarMenu(); marcar(); resp = id; pintarResp();
      if (o.onResponder) o.onResponder(id);
    }
    function cancelarRespuesta() { resp = null; pintarResp(); if (o.onCancelarRespuesta) o.onCancelarRespuesta(); }
    async function copiar(id) {
      var m = o.mensaje ? o.mensaje(id) : null, t = m ? marcador.quitar(m.texto) : '';
      quitarSeleccion();
      if (!t) return avisa(m && m.voz ? 'Esta nota de voz todavía no tiene transcripción.' : 'No hay texto que copiar.');
      var ok = await alPortapapeles(t);
      avisa(ok ? (m.voz ? 'Transcripción copiada' : 'Mensaje copiado') : 'Este navegador no dejó copiar.');
      if (o.onCopiar) o.onCopiar(id, t, ok);
    }
    function reenviar(id) {
      if (!puedeReen(id)) { cerrarMenu(); return avisa(razon); }
      quitarSeleccion(); if (o.onReenviar) o.onReenviar(id);
    }
    function abrirMenu(id, x, y, completo) {
      sel = id; marcar();
      var m = o.mensaje ? o.mensaje(id) : null, voz = !!(m && m.voz), pr = puedeReen(id);
      var h = (completo ? '<button type="button" role="menuitem" data-chg="resp">Responder</button>' : '') +
        '<button type="button" role="menuitem" data-chg="copiar">Copiar' + (voz ? ' transcripción' : '') + '</button>' +
        (completo ? '<button type="button" role="menuitem" data-chg="reen" aria-disabled="' + (pr ? 'false' : 'true') + '">Reenviar</button>' + (pr ? '' : '<div class="chg-razon">' + esc(razon) + '</div>') : '');
      menu.innerHTML = h; menu.classList.add('chg-vis');
      var W = innerWidth, H = innerHeight, w = menu.offsetWidth, hh = menu.offsetHeight;
      if (x === undefined) { var r = barra.getBoundingClientRect(); x = W - w - 8; y = r.bottom + 4; }
      menu.style.left = Math.max(8, Math.min(x, W - w - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(y, H - hh - 8)) + 'px';
    }
    function irA(id) {
      var b = burbujaDe(id);
      if (!b) return avisa('Ese mensaje ya no está en la pantalla.');
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
      b.classList.remove('chg-brilla'); void b.offsetWidth; b.classList.add('chg-brilla');
      setTimeout(function () { b.classList.remove('chg-brilla'); }, 1600);
    }

    barra.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chg]'); if (!b || sel === null) return;
      var a = b.getAttribute('data-chg');
      if (a === 'quitar') quitarSeleccion();
      else if (a === 'resp') responder(sel);
      else if (a === 'reen') reenviar(sel);
      else if (a === 'mas') abrirMenu(sel);
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chg]'); if (!b || sel === null) return;
      var a = b.getAttribute('data-chg'), id = sel;
      if (a === 'resp') responder(id); else if (a === 'copiar') copiar(id); else if (a === 'reen') reenviar(id);
    });
    rbar.addEventListener('click', function (e) { if (e.target.closest('[data-chg="cancelar"]')) cancelarRespuesta(); });
    document.addEventListener('pointerdown', function (e) {
      if (menu.classList.contains('chg-vis') && !menu.contains(e.target) && !e.target.closest('.chg-chev') && !barra.contains(e.target)) cerrarMenu();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (menu.classList.contains('chg-vis')) cerrarMenu(); else if (sel !== null) quitarSeleccion(); } });

    /* gestos sobre la burbuja: toque largo, deslizar a la derecha, clic derecho, ⌄ */
    var NO_GESTO = 'button:not(.chg-chev), a, input, textarea, select, [data-onda], [role="slider"], .chg-cita';
    C.addEventListener('pointerdown', function (e) {
      ultimoPuntero = e.pointerType || 'mouse';
      var b = e.target.closest(selector); if (!b || !C.contains(b) || e.button === 2) return;
      if (e.target.closest('.chg-chev')) return;
      var interactivo = e.target.closest(NO_GESTO);
      g = { b: b, id: idDe(b), x: e.clientX, y: e.clientY, dx: 0, sinDeslizar: !!interactivo, hecho: false,
            largo: interactivo ? null : setTimeout(function () { if (g && Math.abs(g.dx) < 8) { g.hecho = true; seleccionar(g.id); } }, LARGO_MS) };
    });
    addEventListener('pointermove', function (e) {
      if (!g) return; g.dx = e.clientX - g.x; var dy = Math.abs(e.clientY - g.y);
      if (dy > 14 && g.dx < 14) { clearTimeout(g.largo); soltar(); return; }
      if (Math.abs(g.dx) > 8) clearTimeout(g.largo);
      if (g.sinDeslizar || g.dx <= 6) return;
      g.b.classList.add('chg-arrastra');
      var d = Math.min(g.dx, TOPE_PX); g.b.style.transform = 'translateX(' + d + 'px)';
      var f = flecha(g.b); f.style.opacity = Math.min(1, d / DESLIZA_PX);
    });
    function flecha(b) {
      var fila = b.parentNode, f = fila.querySelector(':scope > .chg-flecha');
      if (!f) { f = document.createElement('span'); f.className = 'chg-flecha'; f.innerHTML = ico('resp', 'chg-s'); fila.insertBefore(f, fila.firstChild); }
      return f;
    }
    function soltar() {
      if (!g) return null; clearTimeout(g.largo); var x = g; g = null;
      x.b.classList.remove('chg-arrastra'); x.b.style.transform = '';
      var f = x.b.parentNode && x.b.parentNode.querySelector(':scope > .chg-flecha'); if (f) f.style.opacity = 0;
      return x;
    }
    var tragarClic = 0;
    addEventListener('pointerup', function () {
      var x = soltar(); if (!x) return;
      if (x.hecho || (!x.sinDeslizar && x.dx >= DESLIZA_PX)) tragarClic = Date.now();   // el clic que sigue no abre la foto ni el PDF
      if (!x.sinDeslizar && x.dx >= DESLIZA_PX) responder(x.id);
      else if (!x.hecho && sel !== null && Math.abs(x.dx) < 8 && sel !== x.id) seleccionar(x.id);
      else if (!x.hecho && sel === x.id && Math.abs(x.dx) < 8) quitarSeleccion();
    });
    addEventListener('pointercancel', function () { soltar(); });
    C.addEventListener('contextmenu', function (e) {
      var b = e.target.closest(selector); if (!b || !C.contains(b)) return;
      e.preventDefault();
      // En el teléfono el toque largo dispara también «contextmenu»: ahí ya se seleccionó, no se abre menú.
      if (ultimoPuntero === 'touch' || ultimoPuntero === 'pen') return;
      abrirMenu(idDe(b), e.clientX, e.clientY, true);
    });
    C.addEventListener('click', function (e) {
      if (tragarClic && Date.now() - tragarClic < 600) { tragarClic = 0; e.preventDefault(); e.stopPropagation(); return; }
      var ch = e.target.closest('.chg-chev');
      if (ch) { e.preventDefault(); e.stopPropagation(); var b = ch.closest(selector), r = b.getBoundingClientRect(); return abrirMenu(idDe(b), r.right - 230, r.top + 26, true); }
      var c = e.target.closest('[data-chg-ir]');
      if (c) { e.preventDefault(); return irA(isNaN(Number(c.getAttribute('data-chg-ir'))) ? c.getAttribute('data-chg-ir') : Number(c.getAttribute('data-chg-ir'))); }
    }, true);

    return {
      decorar: decorar, irA: irA, quitarSeleccion: quitarSeleccion, cancelarRespuesta: cancelarRespuesta,
      responder: responder, seleccionar: seleccionar, abrirMenu: function (id) { abrirMenu(id, undefined, undefined, true); },
      respondiendo: function () { return resp; }, seleccionado: function () { return sel; },
      /** Después de mandar: quita la cita de arriba de la caja (sin avisar onCancelarRespuesta). */
      enviada: function () { resp = null; pintarResp(); },
      alto: function () { return rbar.classList.contains('chg-vis') ? rbar.offsetHeight : 0; }
    };
  }

  G.ChatGestos = { enganchar: enganchar, citaHtml: citaHtml, marcador: marcador };
})(window);
