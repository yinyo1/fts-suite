/* ═══ cz-ligas · la liga de cada material como miniatura: foto, tienda, ✓ verificada o ⚠ por qué, y «Abrir ↗» ═══
 * V1.55 (fts-conceptualizador#12 G, interruptor `ligas_v155`). El motor abre cada liga (herramientas/precios/ligas.js) y
 * manda en `verifica.ligas` {liga: {estado, clase, foto, titulo, tienda, precio_web}}. Apagado (o sin ese dato), la liga
 * se pinta como antes: un enlace con el texto de la fuente. La foto es una liga a la imagen de la tienda (no se guarda).
 * Lo que dice la página (título) es DATO: se escapa y se recorta. */
(function (G) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var on = function () { try { return !!(G.CzInterruptor && G.CzInterruptor('ligas_v155')); } catch (e) { return false; } };
  var ES = { verificada: ['ok', '✓ verificada'], revisar_precio: ['mal', '⚠ precio distinto al de la página'], no_coincide: ['mal', '⚠ la página no es este material'],
    no_responde: ['mal', '⚠ la página no respondió'], no_es_producto: ['mal', '⚠ no abre el producto'], sin_verificar: ['', 'sin verificar'] };
  var CSS = '.lg{display:flex;gap:8px;align-items:center;margin-top:6px;border:1px solid var(--linea,#e9edef);border-radius:10px;padding:5px;text-decoration:none;color:inherit;max-width:100%}' +
    '.lg img,.lg .lg-sf{width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--sup2,#f0f2f5);display:flex;align-items:center;justify-content:center;font-size:18px}' +
    '.lg .lg-tx{flex:1;min-width:0;font-size:12.5px}.lg .lg-tx b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}' +
    '.lg .lg-st{font-size:11.5px;font-weight:600}.lg .lg-st.ok{color:#0b6b45}.lg .lg-st.mal{color:#8a5a00}' +
    '.lg .lg-ab{flex-shrink:0;color:var(--marca,#008069);font-weight:600;font-size:13px;padding:0 4px}';
  function estilos() { if (typeof document === 'undefined' || document.getElementById('czLigasCss')) return; var s = document.createElement('style'); s.id = 'czLigasCss'; s.textContent = CSS; document.head.appendChild(s); }
  function dominio(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  /** La info de una liga (o null). `mapa` = verifica.ligas de la respuesta. */
  function info(url, mapa) { return on() && mapa && url ? mapa[url] || null : null; }
  /** Miniatura clicable. Sin info o apagado: devuelve '' (quien llama pinta lo de antes). */
  function chip(url, mapa, texto) {
    var x = info(url, mapa); if (!x || !/^https?:\/\//.test(url)) return '';
    estilos();
    var es = ES[x.estado] || ['', esc(x.estado || '')], odoo = /^odoo_/.test(x.clase || '');
    var st = x.estado === 'verificada' && odoo ? '✓ registro de Odoo' : es[1];
    var tit = String(x.titulo || texto || dominio(url)).slice(0, 140);
    return '<a class="lg" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">' +
      (x.foto && /^https:\/\//.test(x.foto) ? '<img alt="" loading="lazy" referrerpolicy="no-referrer" src="' + esc(x.foto) + '">' : '<span class="lg-sf">' + (odoo ? '🧾' : '🔗') + '</span>') +
      '<span class="lg-tx"><b>' + esc(tit) + '</b><span class="lg-st ' + es[0] + '">' + esc(st) + '</span> · ' + esc(odoo ? 'Odoo' : (x.tienda || dominio(url))) + '</span>' +
      '<span class="lg-ab">Abrir ↗</span></a>';
  }
  G.CzLigas = { chip: chip, info: info, dominio: dominio, on: on };
})(typeof window !== 'undefined' ? window : globalThis);
