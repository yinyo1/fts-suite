// ═══ FTS Suite · Finanzas — selector multi-empresa (FinCompanySelector) ═══
// Chips reusables por módulo (FTS-MX / FTS-USA). Lee/escribe FinState; al cambiar
// llama opts.onChange(selectedIds) para que el módulo dispare re-fetch.
// (v1: chips per-módulo. Master global en topbar = diferido, ver PR notes.)
//
// API: window.FinCompanySelector.{ mount(container, {onChange}), COMPANIES }

(function () {
  'use strict';

  var COMPANIES = [
    { id: 1, code: 'FTS-MX',  name: 'SERVICIOS FTS',  currency: 'MXN' },
    { id: 6, code: 'FTS-USA', name: 'FTS USA',        currency: 'USD' }
  ];

  function mount(container, opts) {
    opts = opts || {};
    if (!container) return;

    function selected() { return window.FinState.getCompanies(); }

    function render() {
      var sel = selected();
      var html = '<div class="company-chips"><span class="cc-label">Empresas</span>';
      COMPANIES.forEach(function (co) {
        var on = sel.indexOf(co.id) >= 0;
        html += '<button type="button" class="chip' + (on ? ' on' : '') + '" data-co="' + co.id + '" ' +
                'title="' + esc(co.name) + ' · ' + co.currency + '">' +
                esc(co.code) + ' <span class="chip-cur">' + co.currency + '</span></button>';
      });
      html += '</div>';
      container.innerHTML = html;

      Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (btn) {
        btn.addEventListener('click', function () {
          var id = parseInt(btn.getAttribute('data-co'), 10);
          var cur = selected();
          var idx = cur.indexOf(id);
          if (idx >= 0) cur.splice(idx, 1); else cur.push(id);
          window.FinState.setCompanies(cur);   // FinState fuerza no-vacío (F9)
          render();
          if (typeof opts.onChange === 'function') opts.onChange(window.FinState.getCompanies());
        });
      });
    }

    render();
    return { refresh: render };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.FinCompanySelector = { mount: mount, COMPANIES: COMPANIES };
})();
