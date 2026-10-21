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

  /* ═══ V1.58 (fts-conceptualizador#12 LIGAS, interruptor `ligas_v158`) · la liga completa en la vista interna ═══
   * El motor (herramientas/motor/tabla-machote.js) manda en cada renglón la liga COMPLETA más `sku`, `tienda`, `fecha`
   * (`fecha_de`: fuente | ligas | commit) y, si la liga no abre un producto, `liga_mala` (el motivo). Aquí: el TEXTO se recorta a
   * la vista y el href va completo; SKU, tienda y fecha (o «sin fecha»: no se inventa; un renglón sin precio no lleva fecha);
   * y 🔴 con su motivo. Apagado: ''. */
  var on158 = function () { try { return !!(G.CzInterruptor && G.CzInterruptor('ligas_v158')); } catch (e) { return false; } };
  var CSS158 = '.lg8{display:block;margin-top:3px;font-size:12px;line-height:1.35;color:var(--sec,#54656f);overflow-wrap:anywhere}' +
    '.lg8 a{color:var(--marca,#008069);text-decoration:underline;word-break:break-all}.lg8 .lg8-m{display:block;color:#a1261b;font-weight:600}';
  function estilos158() { if (typeof document === 'undefined' || document.getElementById('czLigas158Css')) return; var s = document.createElement('style'); s.id = 'czLigas158Css'; s.textContent = CSS158; document.head.appendChild(s); }
  /** El texto de la liga para la vista: sin protocolo ni www, recortado con «…»; el href se queda completo. */
  function recorta(u, n) {
    n = n || 52; var s = String(u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  var FDE = { fuente: 'según la fuente', ligas: 'al verificar la liga', commit: 'cuando se escribió el renglón' };
  /** Las piezas de la liga de un renglón (r = renglón de la tabla del machote). `o.sinLiga`: sin el enlace (ya lo pinta otro). */
  function piezas(r, o) {
    o = o || {}; if (!on158() || !r) return '';
    var url = String(r.liga || '').trim(), comp = /^https?:\/\//i.test(url);
    if (!comp && !r.liga_mala) return '';
    estilos158();
    var p = [];
    if (comp && !o.sinLiga) p.push('<a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">' + esc(recorta(url)) + '</a>');
    if (comp) {
      p.push(r.sku ? 'SKU ' + esc(r.sku) : 'sin SKU');
      if (r.tienda) p.push(esc(String(r.tienda).slice(0, 90)));
      if (r.pu !== null && r.pu !== undefined) p.push(r.fecha ? 'precio leído ' + esc(r.fecha) + (FDE[r.fecha_de] ? ' (' + FDE[r.fecha_de] + ')' : '') : 'sin fecha');
    }
    return '<span class="lg8" data-lg8="1">' + p.join(' · ') + (r.liga_mala ? '<span class="lg8-m" data-lg8-mala="1">🔴 ' + (r.liga_base ? 'liga existente sin producto: ' : '') + esc(r.liga_mala) + '</span>' : '') + '</span>';
  }
  G.CzLigas = { chip: chip, info: info, dominio: dominio, on: on, on158: on158, recorta: recorta, piezas: piezas };
})(typeof window !== 'undefined' ? window : globalThis);
