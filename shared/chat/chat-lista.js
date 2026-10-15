/* ═══ shared/chat · lista de conversaciones tipo WhatsApp (Marketing v3, #421) ═══
 *
 * Un solo componente para cualquier lista de chats de la suite. No sabe de ningún producto: el producto le da
 * las filas y le dice qué pintar (título, vista previa, hora, insignias, etiquetas), qué filtros ofrecer y qué
 * hacer al abrir o con las acciones de una fila. Lo usa Marketing (Prospectador); el conceptualizador tiene la
 * suya en cz-app.js y PUEDE adoptar esta (propuesta en el #421) sin cambiar su servidor.
 *
 *   var L = ChatLista.crear(contenedor, {
 *     producto: 'marketing',                 // prefijo para recordar filtros en este navegador
 *     clave: f => f.id,                      // id de la fila
 *     titulo: f => '…', vista: f => '…', hora: f => 'ayer', horaClase: f => 'vence'|'nuevo'|'',
 *     avatar: f => ({ letra:'A', color:'#3b5a75', insignia:'N2', insigniaClase:'n2' }),
 *     etiquetas: f => [{ texto:'Etapa 2', clase:'e2' }],
 *     noLeidos: f => 0, fijada: f => false,
 *     buscarEn: f => 'texto donde buscar',
 *     filtros: [ { id:'vista', unico:true, opciones:[{ id:'mias', texto:'Mis conversaciones', f: fila => …, contar:true }, …] }, … ],
 *     menuPersonas: { titulo:'Persona', opciones: () => [{ id:'todos', texto:'Todos' }, …], f: (fila, id) => … } (opcional),
 *     secciones: [{ titulo:'Vence hoy', f: fila => … }] (opcional; lo que no cae en ninguna va al final),
 *     orden: (a, b) => …  (después de fijadas primero),
 *     acciones: f => [{ texto:'📌 Fijar', hacer: () => … }],   // el ⋮ de cada fila
 *     onAbrir: f => …, seleccionada: () => id, vacio: 'texto'
 *   });
 *   L.pintar(filas)   L.filtro(grupo, opcion)   L.estado()
 *
 * El estilo va DENTRO del archivo (una sola petición; CLAUDE.md §20 #23), con prefijo chl- y los colores como
 * variables (--chl-*) con valores por omisión iguales al look del conceptualizador; cada producto las puede pisar.
 */
(function (G) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CSS = [
    '.chl{--chl-sup:var(--chl-fondo-lista,#fff);--chl-sup2:#f6f5f3;--chl-linea:#e7e3dd;--chl-texto:#111b21;--chl-sec:#667781;--chl-ter:#8696a0;',
    '--chl-acento:#1daa61;--chl-acento-osc:#008069;--chl-on:#d9fdd3;--chl-on-txt:#0a5c3c;--chl-rojo:#d13438;display:flex;flex-direction:column;min-width:0;background:var(--chl-sup);color:var(--chl-texto)}',
    '.chl-buscar{margin:8px 12px 2px;background:var(--chl-sup2);border-radius:20px;height:38px;display:flex;align-items:center;padding:0 14px;gap:8px;color:var(--chl-sec)}',
    '.chl-buscar input{border:0;background:none;outline:0;flex:1;font:inherit;font-size:15px;color:var(--chl-texto);min-width:0}',
    '.chl-chips{display:flex;gap:6px;padding:6px 12px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}.chl-chips::-webkit-scrollbar{display:none}',
    '.chl-chip{flex-shrink:0;height:32px;border-radius:16px;padding:0 12px;background:var(--chl-sup2);color:#3b4a54;font:inherit;font-size:13.5px;font-weight:500;border:0;display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}',
    '.chl-chip b{font-weight:600;color:var(--chl-sec);font-size:12px}.chl-chip.on{background:var(--chl-on);color:var(--chl-on-txt)}.chl-chip.on b{color:var(--chl-on-txt)}',
    '.chl-chip:focus-visible,.chl-fila:focus-visible,.chl-mas:focus-visible{outline:2px solid var(--chl-acento-osc);outline-offset:-2px}',
    '.chl-sep{width:1px;background:var(--chl-linea);margin:6px 2px;flex-shrink:0}',
    '.chl-sec{font-size:12px;font-weight:600;color:var(--chl-sec);letter-spacing:.3px;text-transform:uppercase;padding:10px 16px 4px}',
    '.chl-fila{display:flex;gap:12px;padding:10px 6px 10px 14px;align-items:center;min-height:76px;cursor:pointer;width:100%;text-align:left;background:none;border:0;font:inherit;color:inherit}',
    '.chl-fila:hover{background:#f5f6f6}.chl-fila.on{background:#f0f2f5}',
    '.chl-av{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px;flex-shrink:0;position:relative}',
    '.chl-av i{position:absolute;right:-3px;bottom:-3px;font-style:normal;font-size:10px;font-weight:700;border-radius:8px;padding:0 4px;line-height:16px;border:2px solid var(--chl-sup)}',
    '.chl-tx{flex:1;min-width:0;border-bottom:1px solid var(--chl-linea);padding-bottom:10px;margin-bottom:-10px}',
    '.chl-t{display:flex;align-items:center;gap:6px}.chl-t span.n{flex:1;font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chl-h{font-size:12px;color:var(--chl-sec);flex-shrink:0}.chl-h.nuevo{color:var(--chl-acento);font-weight:600}.chl-h.vence{color:var(--chl-rojo);font-weight:600}',
    '.chl-u{display:flex;align-items:center;gap:5px;font-size:14px;color:var(--chl-sec);margin-top:2px}.chl-u .p{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chl-et{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap}',
    '.chl-pill{font-size:11px;font-weight:600;border-radius:6px;padding:0 6px;line-height:18px;white-space:nowrap;background:var(--chl-sup2);color:var(--chl-sec)}',
    '.chl-badge{min-width:20px;height:20px;border-radius:10px;background:var(--chl-acento);color:#fff;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 6px}',
    '.chl-mas{width:32px;height:40px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:var(--chl-ter);flex-shrink:0;background:none;border:0;cursor:pointer;font-size:18px}',
    '.chl-vacio{padding:40px 24px;text-align:center;color:var(--chl-sec);font-size:14px}',
    '.chl-hoja-f{position:fixed;inset:0;background:rgba(11,20,26,.35);z-index:60}',
    '.chl-hoja{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));width:min(420px,calc(100% - 24px));background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.2);padding:6px 0;max-height:70vh;overflow:auto}',
    '@media (min-width:760px){.chl-hoja{top:20vh;bottom:auto}}',
    '.chl-hoja h4{font-size:13px;color:var(--chl-sec);margin:6px 18px;font-weight:600}',
    '.chl-hoja button{display:block;width:100%;text-align:left;padding:12px 18px;font:inherit;font-size:15px;background:none;border:0;color:var(--chl-texto);cursor:pointer}',
    '.chl-hoja button:hover{background:var(--chl-sup2)}.chl-hoja button[aria-disabled=true]{color:var(--chl-ter)}.chl-hoja small{display:block;color:var(--chl-sec);font-size:12px}'
  ].join('\n');
  function ponerCss() { if (document.getElementById('chl-css')) return; var s = document.createElement('style'); s.id = 'chl-css'; s.textContent = CSS; document.head.appendChild(s); }

  /** Hoja de opciones (⋮ de una fila o de una pantalla). items: [{texto, nota?, hacer?, apagado?}] */
  function hoja(titulo, items) {
    ponerCss();
    var f = document.createElement('div'); f.className = 'chl-hoja-f';
    f.innerHTML = '<div class="chl-hoja" role="menu">' + (titulo ? '<h4>' + esc(titulo) + '</h4>' : '') + items.map(function (it, i) {
      return '<button type="button" role="menuitem" data-i="' + i + '"' + (it.apagado ? ' aria-disabled="true"' : '') + '>' + esc(it.texto) + (it.nota ? '<small>' + esc(it.nota) + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    document.body.appendChild(f);
    var b0 = f.querySelector('button:not([aria-disabled=true])'); if (b0) b0.focus();
    function cerrar() { f.remove(); document.removeEventListener('keydown', tecla); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', tecla);
    f.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (b) { var it = items[+b.getAttribute('data-i')]; if (it.apagado) return; cerrar(); if (it.hacer) it.hacer(); return; }
      if (e.target === f) cerrar();
    });
    return cerrar;
  }

  function crear(cont, o) {
    ponerCss();
    var LS = 'chl-' + (o.producto || 'chat') + '-filtros';
    var est = { filas: [], q: '', sel: {}, persona: 'todos' };
    try { var g = JSON.parse(localStorage.getItem(LS) || 'null'); if (g) { est.sel = g.sel || {}; est.persona = g.persona || 'todos'; } } catch (e) {}
    (o.filtros || []).forEach(function (gr) { if (gr.unico && !est.sel[gr.id]) est.sel[gr.id] = gr.opciones[0].id; });
    function guardar() { try { localStorage.setItem(LS, JSON.stringify({ sel: est.sel, persona: est.persona })); } catch (e) {} }
    cont.classList.add('chl');
    cont.innerHTML = '<label class="chl-buscar"><span aria-hidden="true">🔍</span><input type="search" id="chl-q-' + esc(o.producto || 'chat') + '" placeholder="' + esc(o.buscarTexto || 'Buscar') + '" aria-label="Buscar"></label>' +
      '<div class="chl-filtros"></div><div class="chl-lst" role="list"></div>';
    var inp = cont.querySelector('input'), F = cont.querySelector('.chl-filtros'), L = cont.querySelector('.chl-lst');
    inp.addEventListener('input', function () { est.q = inp.value.trim().toLowerCase(); lista(); });

    function opcion(gr, id) { return gr.opciones.filter(function (x) { return x.id === id; })[0]; }
    function pasa(f, saltar) {
      if (est.q && String(o.buscarEn ? o.buscarEn(f) : o.titulo(f)).toLowerCase().indexOf(est.q) < 0) return false;
      if (o.menuPersonas && est.persona !== 'todos' && !o.menuPersonas.f(f, est.persona)) return false;
      return (o.filtros || []).every(function (gr) {
        if (gr.id === saltar) return true;
        var v = est.sel[gr.id]; if (!v) return true;
        var op = opcion(gr, v); return !op || op.f(f);
      });
    }
    function chips() {
      var h = (o.filtros || []).map(function (gr) {
        return gr.opciones.map(function (op) {
          var n = op.contar ? est.filas.filter(function (f) { return pasa(f, gr.id) && op.f(f); }).length : null;
          return '<button type="button" class="chl-chip' + (est.sel[gr.id] === op.id ? ' on' : '') + '" data-g="' + esc(gr.id) + '" data-o="' + esc(op.id) + '" aria-pressed="' + (est.sel[gr.id] === op.id) + '">' +
            esc(op.texto) + (n != null ? ' <b>' + n + '</b>' : '') + '</button>';
        }).join('');
      });
      var fila1 = h.slice(0, 1).join(''), resto = h.slice(1);
      var per = o.menuPersonas ? '<button type="button" class="chl-chip' + (est.persona !== 'todos' ? ' on' : '') + '" data-per="1">👤 ' +
        esc((o.menuPersonas.opciones().filter(function (p) { return p.id === est.persona; })[0] || { texto: 'Todos' }).texto) + ' ▾</button><span class="chl-sep"></span>' : '';
      F.innerHTML = '<div class="chl-chips">' + fila1 + '</div>' + (resto.length || per ? '<div class="chl-chips">' + per + resto.join('<span class="chl-sep"></span>') + '</div>' : '');
    }
    function filaHtml(f) {
      var a = o.avatar ? o.avatar(f) : { letra: (o.titulo(f) || '?').charAt(0) };
      var nl = o.noLeidos ? o.noLeidos(f) : 0, hc = o.horaClase ? o.horaClase(f) : (nl ? 'nuevo' : '');
      var et = o.etiquetas ? o.etiquetas(f) : [];
      var id = o.clave(f), on = o.seleccionada && o.seleccionada() === id;
      return '<div class="chl-fila' + (on ? ' on' : '') + '" role="listitem" tabindex="0" data-id="' + esc(id) + '">' +
        '<div class="chl-av" style="background:' + esc(a.color || '#8696a0') + '">' + esc(String(a.letra || '?').toUpperCase()) +
        (a.insignia ? '<i class="' + esc(a.insigniaClase || '') + '">' + esc(a.insignia) + '</i>' : '') + '</div>' +
        '<div class="chl-tx"><div class="chl-t"><span class="n">' + esc(o.titulo(f)) + '</span><span class="chl-h ' + esc(hc || '') + '">' + esc(o.hora ? o.hora(f) : '') + '</span></div>' +
        '<div class="chl-u"><span class="p">' + esc(o.vista ? o.vista(f) : '') + '</span>' + (o.fijada && o.fijada(f) ? '<span aria-label="Fijada">📌</span>' : '') +
        (nl ? '<span class="chl-badge" aria-label="' + nl + ' sin leer">' + nl + '</span>' : '') + '</div>' +
        (et.length ? '<div class="chl-et">' + et.map(function (e) { return '<span class="chl-pill ' + esc(e.clase || '') + '">' + esc(e.texto) + '</span>'; }).join('') + '</div>' : '') + '</div>' +
        (o.acciones ? '<button type="button" class="chl-mas" data-mas="' + esc(id) + '" aria-label="Opciones de ' + esc(o.titulo(f)) + '">⋮</button>' : '') + '</div>';
    }
    function lista() {
      chips();
      var vs = est.filas.filter(function (f) { return pasa(f); });
      vs.sort(function (a, b) { return ((o.fijada && o.fijada(b)) ? 1 : 0) - ((o.fijada && o.fijada(a)) ? 1 : 0) || (o.orden ? o.orden(a, b) : 0); });
      if (!vs.length) { L.innerHTML = '<div class="chl-vacio">' + esc(o.vacio || 'No hay conversaciones con estos filtros.') + '</div>'; return; }
      var secs = o.secciones ? o.secciones(est) : null;
      if (!secs) { L.innerHTML = vs.map(filaHtml).join(''); return; }
      var usadas = {}, h = '';
      secs.forEach(function (s) {
        var en = vs.filter(function (f) { return !usadas[o.clave(f)] && s.f(f); });
        if (!en.length) return; en.forEach(function (f) { usadas[o.clave(f)] = 1; });
        h += '<div class="chl-sec">' + esc(s.titulo) + '</div>' + en.map(filaHtml).join('');
      });
      var resto = vs.filter(function (f) { return !usadas[o.clave(f)]; });
      if (resto.length) h += (h ? '<div class="chl-sec">' + esc(o.restoTitulo || 'Después') + '</div>' : '') + resto.map(filaHtml).join('');
      L.innerHTML = h;
    }
    F.addEventListener('click', function (e) {
      var c = e.target.closest('[data-g]');
      if (c) { var g = c.getAttribute('data-g'), v = c.getAttribute('data-o'), gr = (o.filtros || []).filter(function (x) { return x.id === g; })[0];
        est.sel[g] = (est.sel[g] === v && !gr.unico) ? null : v; guardar(); lista(); return; }
      if (e.target.closest('[data-per]')) {
        hoja(o.menuPersonas.titulo || 'Persona', o.menuPersonas.opciones().map(function (p) { return { texto: p.texto, hacer: function () { est.persona = p.id; guardar(); lista(); } }; }));
      }
    });
    function porId(id) { return est.filas.filter(function (f) { return String(o.clave(f)) === String(id); })[0]; }
    L.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mas]');
      if (m) { e.stopPropagation(); var f = porId(m.getAttribute('data-mas')); if (f) hoja(o.titulo(f), o.acciones(f)); return; }
      var r = e.target.closest('[data-id]'); if (r) { var fr = porId(r.getAttribute('data-id')); if (fr && o.onAbrir) o.onAbrir(fr); }
    });
    L.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var r = e.target.closest('[data-id]'); if (!r || e.target.closest('[data-mas]')) return;
      e.preventDefault(); var fr = porId(r.getAttribute('data-id')); if (fr && o.onAbrir) o.onAbrir(fr);
    });
    return {
      pintar: function (filas) { est.filas = filas || []; lista(); },
      filtro: function (g, v) { est.sel[g] = v; guardar(); lista(); },
      persona: function (p) { est.persona = p; guardar(); lista(); },
      estado: function () { return { sel: est.sel, persona: est.persona, q: est.q }; },
      refrescar: lista
    };
  }

  G.ChatLista = { crear: crear, hoja: hoja };
})(window);
