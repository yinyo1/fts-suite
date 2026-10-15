/* ═══ shared/chat · «Archivos, enlaces y docs.» y Exportar chat (Marketing v3, #421) ═══
 *
 * Dos pantallas genéricas sobre el hilo que ya tiene cargado el chat (no piden nada al servidor salvo el
 * visor de un adjunto, que es de ChatUI). El conceptualizador tiene las suyas en cz-archivos.js; estas son
 * las del núcleo y las puede adoptar (propuesta en el #421).
 *
 *   ChatPanel.archivos({ titulo, mensajes, cliente, enlacesExtra: [{ titulo, liga, fecha, nota }] })
 *     Tres pestañas: Archivos (fotos y notas de voz), Enlaces (las ligas del hilo MÁS las que le pase el
 *     producto: en Marketing, la evidencia de la ficha y de las señales) y Docs (PDF y otros).
 *   ChatPanel.exportar({ titulo, mensajes, quien: m => 'nombre' })
 *     El hilo en texto, para copiar o bajar como .txt. Sin datos de otras conversaciones.
 *
 * Estilo dentro del archivo, prefijo chp- (CLAUDE.md §20 #23).
 */
(function (G) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CSS = [
    '.chp-f{position:fixed;inset:0;background:var(--chp-fondo,#fff);z-index:70;display:flex;flex-direction:column;color:#111b21}',
    '.chp-cab{height:52px;display:flex;align-items:center;gap:6px;padding:0 8px;border-bottom:1px solid #e7e3dd;flex-shrink:0;padding-top:env(safe-area-inset-top,0px)}',
    '.chp-cab h3{flex:1;font-size:17px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chp-ib{width:40px;height:40px;border-radius:20px;border:0;background:none;font-size:19px;cursor:pointer;color:#54656f}.chp-ib:hover{background:#f6f5f3}',
    '.chp-tabs{display:flex;border-bottom:1px solid #e7e3dd;flex-shrink:0}',
    '.chp-tabs button{flex:1;padding:12px 6px;font:inherit;font-size:14px;color:#667781;background:none;border:0;border-bottom:2px solid transparent;cursor:pointer}',
    '.chp-tabs button.on{color:#008069;border-color:#008069;font-weight:600}',
    '.chp-cu{flex:1;overflow:auto;padding:12px max(16px,env(safe-area-inset-left,0px)) calc(16px + env(safe-area-inset-bottom,0px))}',
    '.chp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}',
    '.chp-it{border:1px solid #e7e3dd;border-radius:10px;padding:10px;font-size:13px;background:#fff;text-align:left;cursor:pointer;font:inherit;min-width:0;overflow-wrap:anywhere}',
    '.chp-it small{display:block;color:#667781;font-size:11.5px;margin-top:2px}',
    '.chp-lnk{display:block;border-bottom:1px solid #e7e3dd;padding:10px 0;font-size:14px;overflow-wrap:anywhere}.chp-lnk a{color:#008069}.chp-lnk small{display:block;color:#667781;font-size:12px}',
    '.chp-vacio{color:#667781;text-align:center;padding:40px 16px;font-size:14px}',
    '.chp-pre{white-space:pre-wrap;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;background:#f6f5f3;border-radius:10px;padding:12px;overflow-wrap:anywhere}',
    '.chp-fila{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
    '.chp-btn{height:38px;border-radius:19px;padding:0 16px;font:inherit;font-size:14px;font-weight:600;border:1px solid #e7e3dd;background:#fff;color:#008069;cursor:pointer}',
    '.chp-btn.p{background:#008069;color:#fff;border-color:#008069}'
  ].join('\n');
  function ponerCss() { if (document.getElementById('chp-css')) return; var s = document.createElement('style'); s.id = 'chp-css'; s.textContent = CSS; document.head.appendChild(s); }
  function capa(titulo, cuerpo) {
    ponerCss();
    var f = document.createElement('div'); f.className = 'chp-f'; f.setAttribute('role', 'dialog'); f.setAttribute('aria-label', titulo);
    f.innerHTML = '<div class="chp-cab"><button type="button" class="chp-ib" data-chp="cerrar" aria-label="Cerrar">←</button><h3>' + esc(titulo) + '</h3></div>' + cuerpo;
    document.body.appendChild(f);
    function cerrar() { f.remove(); document.removeEventListener('keydown', tecla); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', tecla);
    f.querySelector('[data-chp=cerrar]').onclick = cerrar; f.querySelector('[data-chp=cerrar]').focus();
    return f;
  }
  var URL_RE = /https?:\/\/[^\s<>"'«»)]+/g;
  function fecha(t) { var d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }

  function archivos(o) {
    var ms = o.mensajes || [], adj = [];
    ms.forEach(function (m) { (m.adjuntos || []).forEach(function (a) { adj.push({ a: a, m: m }); }); });
    var fotos = adj.filter(function (x) { return x.a.clase === 'foto' || x.a.clase === 'audio'; });
    var docs = adj.filter(function (x) { return x.a.clase !== 'foto' && x.a.clase !== 'audio'; });
    var vistos = {}, ligas = [];
    (o.enlacesExtra || []).forEach(function (e) { if (e.liga && !vistos[e.liga]) { vistos[e.liga] = 1; ligas.push(e); } });
    ms.forEach(function (m) { (String(m.texto || '').match(URL_RE) || []).forEach(function (u) { if (!vistos[u]) { vistos[u] = 1; ligas.push({ titulo: u, liga: u, fecha: m.created_at, nota: 'en el chat' }); } }); });
    var t = { a: 'Archivos', e: 'Enlaces', d: 'Docs.' };
    var f = capa(o.titulo || 'Archivos, enlaces y docs.', '<div class="chp-tabs" role="tablist">' + Object.keys(t).map(function (k, i) {
      return '<button type="button" role="tab" data-t="' + k + '" class="' + (i === 0 ? 'on' : '') + '" aria-selected="' + (i === 0) + '">' + t[k] + '</button>'; }).join('') + '</div><div class="chp-cu"></div>');
    var cu = f.querySelector('.chp-cu');
    function item(x) {
      var a = x.a, ic = a.clase === 'foto' ? '📷' : a.clase === 'audio' ? '🎙️' : a.clase === 'pdf' ? '📄' : '📎';
      return '<button type="button" class="chp-it" data-adj="' + esc(a.id) + '">' + ic + ' ' + esc(a.clase === 'audio' ? 'Nota de voz' : a.nombre) + '<small>' + esc(fecha(x.m.escrito_at || x.m.created_at)) + '</small></button>';
    }
    function pinta(k) {
      f.querySelectorAll('[data-t]').forEach(function (b) { var on = b.getAttribute('data-t') === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      if (k === 'a') cu.innerHTML = fotos.length ? '<div class="chp-grid">' + fotos.map(item).join('') + '</div>' : '<div class="chp-vacio">Sin fotos ni notas de voz todavía.</div>';
      else if (k === 'd') cu.innerHTML = docs.length ? '<div class="chp-grid">' + docs.map(item).join('') + '</div>' : '<div class="chp-vacio">Sin documentos todavía.</div>';
      else cu.innerHTML = ligas.length ? ligas.map(function (l) {
        return '<div class="chp-lnk"><a href="' + esc(l.liga) + '" target="_blank" rel="noopener noreferrer">' + esc(l.titulo || l.liga) + ' ↗</a><small>' +
          esc([l.nota, l.fecha && /^\d{4}-/.test(String(l.fecha)) ? String(l.fecha).slice(0, 10) : (l.fecha ? fecha(l.fecha) : '')].filter(Boolean).join(' · ')) + '</small></div>'; }).join('')
        : '<div class="chp-vacio">Sin enlaces todavía.</div>';
    }
    f.querySelector('.chp-tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) pinta(b.getAttribute('data-t')); };
    cu.onclick = function (e) { var b = e.target.closest('[data-adj]'); if (b && G.ChatUI && G.ChatUI.visor) G.ChatUI.visor(o.cliente, b.getAttribute('data-adj')); };
    pinta('a');
    return f;
  }

  function textoDe(o) {
    var lineas = ['Conversación: ' + (o.titulo || ''), 'Exportada: ' + new Date().toLocaleString('es-MX'), ''];
    (o.mensajes || []).forEach(function (m) {
      var t = m.escrito_at || m.created_at, d = new Date(t);
      var cuando = isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      var quien = m.rol === 'sistema' ? '·' : (o.quien ? o.quien(m) : (m.rol === 'motor' ? 'Motor' : m.autor));
      var adj = (m.adjuntos || []).map(function (a) { return '[' + (a.clase === 'audio' ? 'nota de voz' + (a.transcripcion ? ': «' + a.transcripcion + '»' : '') : a.nombre) + ']'; }).join(' ');
      lineas.push('[' + cuando + '] ' + quien + ': ' + [adj, m.texto || ''].filter(Boolean).join(' '));
    });
    return lineas.join('\n');
  }
  function exportar(o) {
    var txt = textoDe(o);
    var f = capa('Exportar chat', '<div class="chp-cu"><div class="chp-fila"><button type="button" class="chp-btn p" data-x="copiar">Copiar</button>' +
      '<button type="button" class="chp-btn" data-x="bajar">Bajar .txt</button></div><pre class="chp-pre"></pre></div>');
    f.querySelector('.chp-pre').textContent = txt;
    f.querySelector('[data-x=copiar]').onclick = async function () {
      var ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
        var r = document.createRange(); r.selectNodeContents(f.querySelector('.chp-pre')); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      if (G.ChatUI && G.ChatUI.toast) G.ChatUI.toast(ok ? 'Copiado' : 'Seleccionado: copia con el menú del teléfono');
    };
    f.querySelector('[data-x=bajar]').onclick = function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
      a.download = String(o.titulo || 'chat').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) + '.txt'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    return f;
  }

  G.ChatPanel = { archivos: archivos, exportar: exportar, texto: textoDe };
})(window);
