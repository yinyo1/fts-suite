/* ═══ Conceptualizador · ver y bajar lo del chat (como WhatsApp) ═══
 *
 *   · visor(fotos, i, op)  foto a pantalla completa. Un toque muestra u oculta
 *                          las barras oscuras de arriba y abajo (Descargar muy
 *                          claro, Compartir con el menú del sistema). Deslizar
 *                          a los lados pasa de foto; zoom con dos dedos, rueda
 *                          o doble toque. Descargar baja el ORIGINAL.
 *   · pantalla(datos, op)  «Archivos, enlaces y docs.»: flecha atrás, título,
 *                          🔍 y tres pestañas (Archivos · Documentos · Enlaces),
 *                          agrupado en Recientes / La semana pasada / Anteriores,
 *                          con selección múltiple para bajar varios.
 *   · zip(archivos)        un ZIP (sin compresión) hecho en el teléfono.
 *   · exportar(chat, fmt)  historial en JSON o TXT: fecha y hora, quién, texto,
 *                          transcripciones y lista de adjuntos. Nada interno
 *                          del motor, ninguna llave.
 *   · descargar(blob, nombre)
 *
 * No habla con la red: quien la usa pasa `obtener(item) → Promise<Blob>`.
 * Fuente única: fts-conceptualizador/prototipos/comun/cz-archivos.js.
 */
(function (G) {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = {
    atras: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    bajar: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/>',
    compartir: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cerrar: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    liga: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
  };
  function ico(n) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }
  function peso(b) { b = Number(b) || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(t) { var d = new Date(t); return isNaN(d) ? '' : d.getDate() + ' ' + MES[d.getMonth()] + ' ' + d.getFullYear(); }
  function fechaHora(t) { var d = new Date(t); return isNaN(d) ? '' : fecha(t) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  function descargar(blob, nombre) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nombre || 'archivo'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }

  // ── visor de fotos a pantalla completa ─────────────────────────────────
  function visor(fotos, i, op) {
    op = op || {};
    var raiz = document.createElement('div');
    raiz.className = 'czv barras'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-label', 'Foto');
    raiz.innerHTML = '<div class="czv-pista"></div>' +
      '<div class="czv-arriba"><button class="czv-bt" data-v="cerrar" aria-label="Cerrar">' + ico('atras') + '</button><div class="czv-tit"><b></b><small></small></div><span class="czv-n"></span></div>' +
      '<div class="czv-abajo"><button class="czv-descargar" data-v="bajar">' + ico('bajar') + 'Descargar</button>' +
      '<button class="czv-bt grande" data-v="compartir" aria-label="Compartir">' + ico('compartir') + '<span>Compartir</span></button></div>' +
      '<button class="czv-lado izq" data-v="ant" aria-label="Anterior">‹</button><button class="czv-lado der" data-v="sig" aria-label="Siguiente">›</button>';
    document.body.appendChild(raiz);
    var pista = $('.czv-pista', raiz), z = { s: 1, x: 0, y: 0 }, img = null, urls = {};
    function cerrar() { document.removeEventListener('keydown', tecla); raiz.remove(); Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); }); if (op.alCerrar) op.alCerrar(); }
    function aplica() { if (img) img.style.transform = 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')'; }
    function ir(n) {
      i = (n + fotos.length) % fotos.length; z = { s: 1, x: 0, y: 0 };
      var f = fotos[i];
      $('.czv-tit b', raiz).textContent = f.de || '';
      $('.czv-tit small', raiz).textContent = [f.nombre, f.cuando ? fechaHora(f.cuando) : ''].filter(Boolean).join(' · ');
      $('.czv-n', raiz).textContent = fotos.length > 1 ? (i + 1) + ' / ' + fotos.length : '';
      pista.innerHTML = '<div class="czv-cargando">Cargando…</div>';
      Promise.resolve(f.blob || (op.obtener && op.obtener(f))).then(function (b) {
        if (fotos[i] !== f) return;
        if (!b) { pista.innerHTML = '<div class="czv-cargando">No se pudo bajar la foto.</div>'; return; }
        f.blob = b; urls[i] = urls[i] || URL.createObjectURL(b);
        pista.innerHTML = '<img alt="' + esc(f.nombre || 'Foto') + '" draggable="false" src="' + urls[i] + '">'; img = $('img', pista); aplica();
      });
      $$('.czv-lado', raiz).forEach(function (b) { b.style.display = fotos.length > 1 ? '' : 'none'; });
    }
    function bajar() {
      var f = fotos[i];
      Promise.resolve(f.blob || (op.obtener && op.obtener(f))).then(function (b) {
        if (!b) return op.aviso && op.aviso('No se pudo bajar la foto.');
        descargar(b, f.nombre || 'foto.jpg'); if (op.alBajar) op.alBajar([f]);
      });
    }
    function compartir() {
      var f = fotos[i];
      Promise.resolve(f.blob || (op.obtener && op.obtener(f))).then(function (b) {
        try {
          var file = new File([b], f.nombre || 'foto.jpg', { type: b.type || 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: f.nombre || 'Foto' });
        } catch (e) {}
        if (op.aviso) op.aviso('Este navegador no deja compartir archivos: usa Descargar.');
      }).catch(function () {});
    }
    var A = { cerrar: cerrar, bajar: bajar, compartir: compartir, ant: function () { ir(i - 1); }, sig: function () { ir(i + 1); } };
    $$('[data-v]', raiz).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); A[b.dataset.v](); }; });
    function tecla(e) { if (e.key === 'Escape') cerrar(); if (e.key === 'ArrowLeft') ir(i - 1); if (e.key === 'ArrowRight') ir(i + 1); }
    document.addEventListener('keydown', tecla);
    // toque: barras · deslizar: otra foto · dos dedos: zoom · doble toque: zoom
    var P = {}, ini = null, ultTap = 0;
    pista.addEventListener('pointerdown', function (e) {
      P[e.pointerId] = { x: e.clientX, y: e.clientY }; try { pista.setPointerCapture(e.pointerId); } catch (er) {}
      var ids = Object.keys(P);
      if (ids.length === 1) ini = { x: e.clientX, y: e.clientY, t: Date.now(), zx: z.x, zy: z.y };
      if (ids.length === 2) { var a = P[ids[0]], b = P[ids[1]]; ini = { d: Math.hypot(a.x - b.x, a.y - b.y), s: z.s, pinch: true }; }
    });
    pista.addEventListener('pointermove', function (e) {
      if (!P[e.pointerId]) return; P[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(P);
      if (ids.length === 2 && ini && ini.pinch) { var a = P[ids[0]], b = P[ids[1]]; z.s = Math.max(1, Math.min(5, ini.s * Math.hypot(a.x - b.x, a.y - b.y) / ini.d)); if (z.s === 1) { z.x = 0; z.y = 0; } aplica(); }
      else if (ids.length === 1 && ini && !ini.pinch && z.s > 1) { z.x = ini.zx + e.clientX - ini.x; z.y = ini.zy + e.clientY - ini.y; aplica(); }
    });
    function fin(e) {
      var era = ini; delete P[e.pointerId];
      if (Object.keys(P).length) return;
      ini = null; if (!era || era.pinch) return;
      var dx = e.clientX - era.x, dy = e.clientY - era.y, dt = Date.now() - era.t;
      if (z.s === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && fotos.length > 1) return ir(i + (dx < 0 ? 1 : -1));
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 350) {
        if (Date.now() - ultTap < 300) { z = z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }; aplica(); ultTap = 0; return; }
        ultTap = Date.now();
        setTimeout(function () { if (ultTap && Date.now() - ultTap >= 290) { raiz.classList.toggle('barras'); ultTap = 0; } }, 300);
      }
    }
    pista.addEventListener('pointerup', fin); pista.addEventListener('pointercancel', fin);
    pista.addEventListener('wheel', function (e) { e.preventDefault(); z.s = Math.max(1, Math.min(5, z.s * (e.deltaY < 0 ? 1.15 : 0.87))); if (z.s === 1) { z.x = 0; z.y = 0; } aplica(); }, { passive: false });
    ir(i || 0);
    return { cerrar: cerrar, ir: ir, raiz: raiz };
  }

  // ── «Archivos, enlaces y docs.» ────────────────────────────────────────
  /** datos: { titulo, fotos:[{id,nombre,cuando,miniatura?,bytes,de}], docs:[{id,nombre,cuando,bytes,tipo,paginas?,generado?}],
   *           enlaces:[{url,titulo?,texto,cuando,msg?}] }
   *  op: { obtener(item)→Promise<Blob>, irAMensaje(msg), alBajar(items), aviso(t), miniatura(item)→Promise<url> } */
  function pantalla(datos, op) {
    op = op || {};
    var st = { tab: 'archivos', busca: null, sel: {} };
    var raiz = document.createElement('div');
    raiz.className = 'cza'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-label', 'Archivos, enlaces y docs.');
    document.body.appendChild(raiz);
    function cerrar() { raiz.remove(); if (op.alCerrar) op.alCerrar(); }
    function grupo(t) {
      var d = (Date.now() - new Date(t).getTime()) / 864e5;
      return d < 7 ? 'Recientes' : d < 14 ? 'La semana pasada' : 'Anteriores';
    }
    function filtra(L, campos) {
      if (!st.busca) return L;
      var b = st.busca.toLowerCase();
      return L.filter(function (x) { return campos.some(function (c) { return String(x[c] || '').toLowerCase().indexOf(b) >= 0; }); });
    }
    function porGrupo(L, pinta) {
      var g = {}, orden = ['Recientes', 'La semana pasada', 'Anteriores'];
      L.slice().sort(function (a, b) { return new Date(b.cuando) - new Date(a.cuando); }).forEach(function (x) { (g[grupo(x.cuando)] = g[grupo(x.cuando)] || []).push(x); });
      return orden.filter(function (k) { return g[k]; }).map(function (k) { return '<h5 class="cza-g">' + k + '</h5>' + pinta(g[k]); }).join('');
    }
    function nSel() { return Object.keys(st.sel).length; }
    function itemDe(k) {
      var a = (datos.fotos || []).concat(datos.docs || []);
      for (var i = 0; i < a.length; i++) if (String(a[i].id) === k) return a[i];
      return null;
    }
    function pinta() {
      var tabs = [['archivos', 'Archivos'], ['docs', 'Documentos'], ['enlaces', 'Enlaces']], h = '';
      var sel = nSel();
      h += '<div class="cza-cab">' + (sel ? '<button class="cza-bt" data-a="limpia" aria-label="Quitar selección">' + ico('cerrar') + '</button><b>' + sel + ' seleccionado' + (sel > 1 ? 's' : '') + '</b>' +
            '<button class="cza-bt" data-a="bajarSel" aria-label="Descargar seleccionados">' + ico('bajar') + '</button>'
          : st.busca !== null ? '<button class="cza-bt" data-a="sinBusca" aria-label="Cerrar la búsqueda">' + ico('atras') + '</button><input class="cza-in" placeholder="Buscar…" value="' + esc(st.busca) + '" aria-label="Buscar">'
          : '<button class="cza-bt" data-a="cerrar" aria-label="Volver al chat">' + ico('atras') + '</button><b>' + esc(datos.titulo || 'Archivos, enlaces y docs.') + '</b>' +
            '<button class="cza-bt" data-a="busca" aria-label="Buscar">' + ico('buscar') + '</button>') + '</div>';
      h += '<div class="cza-tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (st.tab === t[0]) + '" data-tab="' + t[0] + '" class="' + (st.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div class="cza-cuerpo">';
      if (st.tab === 'archivos') {
        var F = filtra(datos.fotos || [], ['nombre', 'de']);
        h += F.length ? porGrupo(F, function (L) {
          return '<div class="cza-rej">' + L.map(function (f) {
            return '<button class="cza-mini' + (st.sel[f.id] ? ' sel' : '') + '" data-foto="' + esc(f.id) + '" aria-label="' + esc(f.nombre || 'Foto') + '"' + (f.miniatura ? ' style="background-image:url(' + f.miniatura + ')"' : '') + '>' +
              (st.sel[f.id] ? '<span class="cza-ok">' + ico('check') + '</span>' : '') + '</button>'; }).join('') + '</div>'; }) : '<p class="cza-vacio">No se encontraron fotos</p>';
      } else if (st.tab === 'docs') {
        var D = filtra(datos.docs || [], ['nombre']);
        h += D.length ? porGrupo(D, function (L) {
          return L.map(function (d) {
            var ext = (d.tipo || (String(d.nombre).split('.').pop() || '')).toUpperCase().slice(0, 4);
            return '<button class="cza-doc' + (st.sel[d.id] ? ' sel' : '') + '" data-doc="' + esc(d.id) + '"><span class="cza-ext t-' + esc(ext.toLowerCase()) + '">' + esc(ext || 'BIN') + '</span>' +
              '<span class="cza-dtx"><b>' + esc(d.nombre) + '</b><small>' + [d.paginas ? d.paginas + ' pág.' : '', d.bytes ? peso(d.bytes) : '', d.generado ? 'lo generó el chat' : '', fecha(d.cuando)].filter(Boolean).join(' · ') + '</small></span>' +
              (st.sel[d.id] ? '<span class="cza-ok">' + ico('check') + '</span>' : '') + '</button>'; }).join(''); }) : '<p class="cza-vacio">No se encontraron documentos</p>';
      } else {
        var E = filtra(datos.enlaces || [], ['url', 'titulo', 'texto']);
        h += E.length ? porGrupo(E, function (L) {
          return L.map(function (l, i) {
            var dom = ''; try { dom = new URL(l.url).hostname.replace(/^www\./, ''); } catch (e) { dom = l.url; }
            return '<div class="cza-liga"><a class="cza-tarjeta" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><span class="cza-lic">' + ico('liga') + '</span><span><b>' + esc(l.titulo || dom) + '</b><small>' + esc(dom) + '</small><small class="u">' + esc(l.url) + '</small></span></a>' +
              (l.texto ? '<button class="cza-de" data-msg="' + esc(l.msg == null ? '' : l.msg) + '">' + esc(l.texto) + '</button>' : '') + '</div>'; }).join(''); }) : '<p class="cza-vacio">No se encontraron enlaces</p>';
      }
      h += '</div>';
      raiz.innerHTML = h;
      var bi = $('.cza-in', raiz);
      if (bi) { bi.focus(); bi.setSelectionRange(bi.value.length, bi.value.length); bi.oninput = function () { st.busca = bi.value; pinta(); }; }
      $$('[data-tab]', raiz).forEach(function (b) { b.onclick = function () { st.tab = b.dataset.tab; pinta(); }; });
      $$('[data-a]', raiz).forEach(function (b) { b.onclick = function () {
        var a = b.dataset.a;
        if (a === 'cerrar') return cerrar();
        if (a === 'busca') { st.busca = ''; return pinta(); }
        if (a === 'sinBusca') { st.busca = null; return pinta(); }
        if (a === 'limpia') { st.sel = {}; return pinta(); }
        if (a === 'bajarSel') bajarVarios(Object.keys(st.sel).map(itemDe).filter(Boolean));
      }; });
      $$('[data-foto],[data-doc]', raiz).forEach(function (b) {
        var k = b.dataset.foto || b.dataset.doc, t = null, largo = false;
        b.onpointerdown = function () { largo = false; t = setTimeout(function () { largo = true; alternar(k); }, 450); };
        b.onpointerup = b.onpointerleave = function () { clearTimeout(t); };
        b.oncontextmenu = function (e) { e.preventDefault(); };
        b.onclick = function () {
          if (largo) return;
          if (nSel()) return alternar(k);
          var it = itemDe(k);
          if (b.dataset.foto) visor(datos.fotos, datos.fotos.indexOf(it), op);
          else abrirDoc(it);
        };
      });
      $$('[data-msg]', raiz).forEach(function (b) { b.onclick = function () { cerrar(); if (op.irAMensaje) op.irAMensaje(b.dataset.msg); }; });
      if (st.tab === 'archivos' && op.miniatura) $$('[data-foto]', raiz).forEach(function (b) {
        var it = itemDe(b.dataset.foto); if (it && !it.miniatura) op.miniatura(it).then(function (u) { if (u) { it.miniatura = u; b.style.backgroundImage = 'url(' + u + ')'; } });
      });
    }
    function alternar(k) { if (st.sel[k]) delete st.sel[k]; else st.sel[k] = 1; pinta(); }
    function abrirDoc(d) {
      if (d.abrir) return d.abrir();
      Promise.resolve(d.blob || (op.obtener && op.obtener(d))).then(function (b) {
        if (!b) return op.aviso && op.aviso('No se pudo bajar el archivo.');
        descargar(b, d.nombre); if (op.alBajar) op.alBajar([d]);
      });
    }
    function bajarVarios(L) {
      if (!L.length) return;
      if (L.length === 1) return abrirDoc(L[0]);
      if (op.aviso) op.aviso('Preparando ' + L.length + ' archivos…');
      Promise.all(L.map(function (x) { return Promise.resolve(x.blob || (op.obtener && op.obtener(x))).then(function (b) { return b ? { nombre: x.nombre, blob: b } : null; }); }))
        .then(function (A) { A = A.filter(Boolean); return zip(A).then(function (z) { descargar(z, (datos.zipNombre || 'archivos') + '.zip'); if (op.alBajar) op.alBajar(L); st.sel = {}; pinta(); }); });
    }
    pinta();
    return { cerrar: cerrar, raiz: raiz, ir: function (t) { st.tab = t; pinta(); } };
  }

  // ── ZIP sin compresión (método 0), suficiente para fotos y audios ya comprimidos ─
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(archivos) {
    var usados = {};
    return Promise.all(archivos.map(function (a) { return (a.blob.arrayBuffer ? a.blob.arrayBuffer() : new Response(a.blob).arrayBuffer()).then(function (b) { return { nombre: a.nombre, datos: new Uint8Array(b) }; }); }))
      .then(function (L) {
        var partes = [], central = [], off = 0, enc = new TextEncoder(), d = new Date();
        var hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        L.forEach(function (f) {
          var n = String(f.nombre || 'archivo').replace(/[\\:*?"<>|]/g, '_'), base = n, i = 1;
          while (usados[n]) { n = base.replace(/(\.[^.]*)?$/, function (x) { return ' (' + (i++) + ')' + (x || ''); }); }
          usados[n] = 1;
          var nom = enc.encode(n), crc = crc32(f.datos), sz = f.datos.length;
          var lh = new DataView(new ArrayBuffer(30));
          lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
          lh.setUint16(10, hora, true); lh.setUint16(12, dia, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
          lh.setUint16(26, nom.length, true); lh.setUint16(28, 0, true);
          partes.push(new Uint8Array(lh.buffer), nom, f.datos);
          var ch = new DataView(new ArrayBuffer(46));
          ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
          ch.setUint16(12, hora, true); ch.setUint16(14, dia, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
          ch.setUint16(28, nom.length, true); ch.setUint32(42, off, true);
          central.push(new Uint8Array(ch.buffer), nom);
          off += 30 + nom.length + sz;
        });
        var tamC = central.reduce(function (s, x) { return s + x.length; }, 0);
        var fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, L.length, true); fin.setUint16(10, L.length, true);
        fin.setUint32(12, tamC, true); fin.setUint32(16, off, true);
        return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: 'application/zip' });
      });
  }

  // ── exportar el chat ───────────────────────────────────────────────────
  /** chat: { titulo, empresa?, exportado_por, mensajes:[{cuando, quien, texto, transcripciones:[], adjuntos:[{nombre,clase,bytes}]}] } */
  function exportar(chat, fmt) {
    var limpio = {
      titulo: chat.titulo, empresa: chat.empresa || null, exportado_at: new Date().toISOString(), exportado_por: chat.exportado_por || null,
      mensajes: (chat.mensajes || []).map(function (m) {
        return { cuando: m.cuando, quien: m.quien, texto: m.texto || '', transcripciones: (m.transcripciones || []).filter(Boolean),
                 adjuntos: (m.adjuntos || []).map(function (a) { return { nombre: a.nombre, clase: a.clase, bytes: a.bytes || null }; }) };
      })
    };
    if (fmt === 'json') return new Blob([JSON.stringify(limpio, null, 2)], { type: 'application/json' });
    var L = ['Conceptualizador FTS · ' + limpio.titulo, (limpio.empresa ? limpio.empresa + ' · ' : '') + 'exportado ' + fechaHora(limpio.exportado_at) + (limpio.exportado_por ? ' por ' + limpio.exportado_por : ''), ''];
    limpio.mensajes.forEach(function (m) {
      L.push('[' + fechaHora(m.cuando) + '] ' + m.quien + ':' + (m.texto ? ' ' + m.texto.replace(/\n/g, '\n    ') : ''));
      m.adjuntos.forEach(function (a) { L.push('    <adjunto: ' + a.nombre + (a.bytes ? ' · ' + peso(a.bytes) : '') + '>'); });
      m.transcripciones.forEach(function (t) { L.push('    (transcripción) ' + t); });
    });
    return new Blob([L.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  }

  G.CzArchivos = { visor: visor, pantalla: pantalla, zip: zip, exportar: exportar, descargar: descargar, crc32: crc32 };
})(window);
