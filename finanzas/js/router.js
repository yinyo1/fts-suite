// ═══ FTS Suite · Finanzas — router + sidebar (FinRouter) ═══
// Extraído del navigate()/renderSidebar() inline del Paso 1. Los módulos se
// auto-registran (FinRouter.register) al cargarse; el shell llama FinRouter.init(MANIFEST).
//
// API: window.FinRouter.{ register, init, navigate, renderSidebar }
//   register(id, { render(container, ctx) })  — un módulo que sabe pintarse
//   init(manifest)                            — pinta sidebar + navega a dashboard
//   navigate(route)                           — guard de auth + render del módulo o empty-state

(function () {
  'use strict';

  var modules  = {};       // id -> { render }
  var MANIFEST = { modules: [], blocks: {} };

  function register(id, def) { modules[id] = def || {}; }

  function init(manifest) {
    MANIFEST = manifest || { modules: [], blocks: {} };
    renderSidebar();
    navigate('dashboard');
  }

  function moduleMode(id) { return window.FinState ? window.FinState.getMode(id) : 'empty'; }

  function renderSidebar() {
    var nav = document.getElementById('sidebarNav');
    if (!nav) return;
    var mods = MANIFEST.modules || [];
    var blocks = MANIFEST.blocks || {};
    var html = '', currentBlock = '__none__';
    mods.forEach(function (m) {
      var blk = m.block || null;
      if (blk !== currentBlock && blk !== null) {
        var num = String(blk).replace(/[^0-9]/g, '');
        html += '<div class="sidebar-section with-num"><span class="num">' + num + '</span>' +
                esc(blocks[blk] || blk) + '</div>';
        currentBlock = blk;
      } else if (blk === null) {
        currentBlock = '__none__';
      }
      var mode = moduleMode(m.id);
      html += '<div class="nav-item" data-route="' + esc(m.id) + '" onclick="FinRouter.navigate(\'' + esc(m.id) + '\')">' +
                '<span class="state-dot ' + mode + '" title="' + mode + '"></span>' +
                '<span class="icon">' + esc(m.icon || '') + '</span>' +
                '<span>' + esc(m.name) + '</span>' +
              '</div>';
    });
    nav.innerHTML = html;
  }

  function navigate(route) {
    // Guard de expiración en cada navegación (smoke #7 del Paso 1 — preservado)
    if (!window.FinAuth || !window.FinAuth.isValid()) {
      if (window.FinAuth) window.FinAuth.logout();
      if (typeof window.showLogin === 'function') window.showLogin();
      return;
    }
    var mods = MANIFEST.modules || [];
    var blocks = MANIFEST.blocks || {};
    var mod = mods.filter(function (m) { return m.id === route; })[0] || { id: route, name: route, block: null };

    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });
    var bcBlock = document.getElementById('bcBlock');
    if (bcBlock) bcBlock.textContent = mod.block ? (mod.block + ' · ' + (blocks[mod.block] || '')) : '';
    var bcCurrent = document.getElementById('bcCurrent');
    if (bcCurrent) bcCurrent.textContent = mod.name;

    var container = document.getElementById('viewContainer');
    if (!container) return;

    var def = modules[route];
    if (def && typeof def.render === 'function') {
      try { def.render(container, { module: mod }); }
      catch (e) { container.innerHTML = errorBox(mod, e); }
    } else {
      container.innerHTML = emptyState(mod);
    }
  }

  // Empty-state genérico (módulos aún sin implementar — idéntico al del Paso 1)
  function emptyState(mod) {
    return '<div class="page">' +
      (mod.block ? '<span class="block-tag">' + esc(mod.block) + '</span>' : '') +
      '<div class="page-header"><div>' +
        '<div class="page-title">' + esc(mod.name) + '</div>' +
        '<div class="page-subtitle">Módulo aún sin datos conectados.</div>' +
      '</div></div>' +
      '<div class="empty-state">' +
        '<div class="icon">▢</div>' +
        '<div class="title">Sin datos</div>' +
        '<div>Este módulo se conectará en un paso posterior del plan.<br>' +
        'El switch Demo/Real se habilitará cuando exista su webhook.</div>' +
      '</div></div>';
  }

  function errorBox(mod, e) {
    return '<div class="page"><div class="page-header"><div>' +
      '<div class="page-title">' + esc(mod.name) + '</div>' +
      '<div class="page-subtitle">Error al renderizar el módulo.</div>' +
      '</div></div><div class="empty-state"><div class="icon">⚠</div>' +
      '<div class="title">Error</div><div class="mono">' + esc(e && e.message || String(e)) + '</div></div></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.FinRouter = { register: register, init: init, navigate: navigate, renderSidebar: renderSidebar };
})();
