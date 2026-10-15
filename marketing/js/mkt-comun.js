/* ═══ Marketing · lo común a los subpaneles (#407) ═══
 * Un cliente del núcleo de chat para el producto `marketing`, la cola sin señal (una sola base
 * IndexedDB para Prospectador y Lead rápido: lo que se capturó sin red sale desde cualquiera
 * de los dos) y las piezas de pantalla que se repiten. */
(function (G) {
  'use strict';
  var U = G.ChatUI;
  var cliente = G.ChatCliente.crear({ producto: 'marketing', scope: 'marketing:usar', login: '../../shared/login.html' });
  var cola = null;
  function laCola() {
    if (!cola) cola = G.ChatCola.crear({ cliente: cliente, medios: G.ChatMedios, idb: 'fts-marketing' });
    return cola;
  }
  function sesion() { try { return G.SuiteAuth.getSession() || {}; } catch (e) { return {}; } }
  function tiene(sc) { try { return G.SuiteAuth.tieneScope(sc); } catch (e) { return false; } }
  /** Encabezado: título, subtítulo y a dónde regresa la flecha. */
  function cab(t, s, atras) {
    var a = document.getElementById('tit'), b = document.getElementById('sub'), c = document.getElementById('atras');
    if (a) a.textContent = t; if (b) b.textContent = s || 'Marketing';
    if (c) c.onclick = function () { if (typeof atras === 'function') atras(); else location.href = atras || '../index.html'; };
    document.title = 'Marketing · ' + t;
  }
  function pct(a, b) { return b ? Math.min(100, Math.round(100 * a / b)) : 0; }
  function medidor(a, b) { var p = pct(a, b); return '<div class="ch-medidor" aria-hidden="true"><i class="' + (p >= 100 ? 'lleno' : p >= 80 ? 'alto' : '') + '" style="width:' + p + '%"></i></div>'; }
  /** El candado visible: fichas y consultas web de hoy contra el tope de la persona. */
  function usoHtml(u) {
    if (!u) return '';
    return '<div class="ch-card"><h3>Tu uso de hoy</h3>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">' +
      '<div><b>' + u.fichas_hoy + '</b> de ' + u.tope_fichas + ' fichas' + medidor(u.fichas_hoy, u.tope_fichas) + '</div>' +
      '<div><b>' + u.consultas_hoy + '</b> de ' + u.tope_consultas + ' consultas web' + medidor(u.consultas_hoy, u.tope_consultas) + '</div></div>' +
      '<p class="ch-nota" style="margin-top:8px">El tope es por persona y por día (hora de Monterrey). Lo fija marketing.config y se cambia sin tocar la pantalla.</p></div>';
  }
  /** Presupuesto ANTES de correr: consultas y tokens estimados por ficha (los tokens se corrigen con lo medido). */
  function presupuestoHtml(n, u) {
    if (!u) return '<p class="ch-nota">Sin datos de uso todavía: se calculan al conectar.</p>';
    var c = n * u.consultas_por_ficha, tk = n * Number(u.tokens_por_ficha || 0);
    var quedanC = u.tope_consultas - u.consultas_hoy, quedanF = u.tope_fichas - u.fichas_hoy;
    var malo = n > quedanF || c > quedanC || (u.tope_tokens_dia && Number(u.tokens_hoy || 0) + tk > u.tope_tokens_dia);
    return '<div class="ch-hall ' + (malo ? 'rojo' : 'verde') + '"><div class="ic">' + (malo ? '⛔' : '🧮') + '</div><div>' +
      '<b>Presupuesto estimado: ' + n + ' ficha' + (n === 1 ? '' : 's') + ' · hasta ' + c + ' consultas web · ~' + (tk / 1e6).toFixed(1) + ' M tokens</b><br>' +
      'Por ficha: hasta ' + u.consultas_por_ficha + ' consultas y ~' + (u.tokens_por_ficha / 1e6).toFixed(1) + ' M tokens ' + (u.tokens_medidos ? '(promedio medido)' : '(estimado: todavía no hay fichas medidas)') + '.<br>' +
      'Te quedan hoy ' + quedanF + ' fichas y ' + quedanC + ' consultas' + (u.tope_tokens_dia ? ' · ~' + (Math.max(0, u.tope_tokens_dia - Number(u.tokens_hoy || 0)) / 1e6).toFixed(1) + ' M tokens de tu tope diario' : '') + '.' + (malo ? '<br><b>No alcanza: reduce la lista o espera a mañana.</b>' : '') +
      '<br><span style="color:var(--muted2)">Antes de gastar una sola consulta web, el motor revisa Odoo y la lista negra: si ya es cliente, competidor o duplicado, esa empresa no gasta.</span></div></div>';
  }
  function hoyISO() { var d = new Date(Date.now() - 6 * 3600e3); return d.toISOString().slice(0, 10); }
  G.Mkt = { cliente: cliente, cola: laCola, sesion: sesion, tiene: tiene, cab: cab, usoHtml: usoHtml, presupuestoHtml: presupuestoHtml,
            medidor: medidor, hoyISO: hoyISO, esc: U.esc, toast: U.toast };
})(window);
