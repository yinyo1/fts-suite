// ═══ FTS Suite · Finanzas — núcleo compartido de Facturas/Bills (FinFacturas) ═══
// Vista config-driven reusada por facturas-odoo.js y bills-odoo.js (decisión #7:
// core específico de "facturas", NO un data-table 100% genérico de repo todavía).
// Maneja: modo empty/demo/real, company chips, toolbar (filtros + columnas + export),
// tabla con selección, KPIs (consolidado MXN + by-company), paginación, modal de impresión.
//
// API: window.FinFacturas.createView(config) -> { mount(container) }
//   config = { moduleId, endpoint, title, subtitle, partnerLabel, mockPath, columns }

(function () {
  'use strict';

  var SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

  // ── helpers ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMoney(n, cur) {
    if (n == null || isNaN(n)) return '—';
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-' : '') + (cur ? cur + ' ' : '') + s;
  }
  function todayISO() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function daysAgoISO(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

  var COMPANY_NAME = { 1: 'FTS-MX', 6: 'FTS-USA' };
  var TYPE_LABEL = {
    out_invoice: 'Factura', out_refund: 'N. crédito',
    in_invoice: 'Bill', in_refund: 'N. cargo'
  };
  var PAY_PILL = {
    paid: ['Pagada', 'green'], not_paid: ['No pagada', 'red'], partial: ['Parcial', 'amber'],
    in_payment: ['En pago', 'blue'], reversed: ['Revertida', 'gray']
  };
  function payPill(s) { var m = PAY_PILL[s] || [s || '—', 'gray']; return '<span class="pill pill-' + m[1] + '">' + esc(m[0]) + '</span>'; }

  function createView(cfg) {
    var COLS = cfg.columns;
    var state = {
      mode: window.FinState.getMode(cfg.moduleId),
      visible: COLS.filter(function (c) { return c.def; }).map(function (c) { return c.id; }),
      filters: { date_from: daysAgoISO(90), date_to: todayISO(), doc_kind: 'all', payment: '', search: '' },
      sort_by: 'invoice_date', sort_dir: 'desc',
      limit: 100, offset: 0,
      rows: [], summary: null, total_count: 0, has_more: false,
      selected: {}, loading: false, error: null, container: null
    };

    function mount(container) {
      state.container = container;
      // re-fetch cuando cambian companies/modo desde fuera
      window.FinState.subscribe(function (evt) {
        if (!document.body.contains(container)) return;       // vista ya desmontada
        if (evt.type === 'companies') { state.offset = 0; load(); }
        if (evt.type === 'mode' && evt.id === cfg.moduleId) { state.mode = evt.mode; render(); if (evt.mode !== 'empty') load(); }
      });
      render();
      if (state.mode !== 'empty') load();
    }

    // ── carga de datos ──
    function buildParams() {
      var f = state.filters;
      return {
        companies: window.FinState.getCompanies(),
        date_from: f.date_from || null,
        date_to: f.date_to || null,
        states: ['posted'],
        payment_states: f.payment ? [f.payment] : null,
        search: f.search || null,
        limit: state.limit, offset: state.offset,
        sort_by: state.sort_by, sort_dir: state.sort_dir
      };
    }

    function applyClientFilters(rows) {
      var f = state.filters, cos = window.FinState.getCompanies();
      return rows.filter(function (r) {
        if (cos.indexOf(r.company_id) < 0) return false;
        if (f.doc_kind === 'invoice' && /refund/.test(r.move_type)) return false;
        if (f.doc_kind === 'refund' && !/refund/.test(r.move_type)) return false;
        if (f.payment && r.payment_state !== f.payment) return false;
        if (f.date_from && r.invoice_date < f.date_from) return false;
        if (f.date_to && r.invoice_date > f.date_to) return false;
        if (f.search) {
          var q = f.search.toLowerCase();
          var hay = [r.name, r.ref, r.invoice_origin, r.partner_name].join(' ').toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    function summarize(rows) {
      var by = {}, consolidado = 0;
      rows.forEach(function (r) {
        var c = r.company_id;
        if (!by[c]) by[c] = { currency: r.currency, amount_total: 0, count: 0 };
        by[c].amount_total += (r.amount_total || 0);
        by[c].count++;
        consolidado += (r.amount_total_mxn != null ? r.amount_total_mxn : r.amount_total || 0);
      });
      return { total_native_by_company: by, consolidado_mxn: { amount_total: consolidado }, total_count: rows.length, filtered_count: rows.length };
    }

    function load() {
      state.loading = true; state.error = null; render();
      if (state.mode === 'demo') {
        fetch(cfg.mockPath, { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var all = applyClientFilters(data.rows || []);
            sortRows(all);
            state.total_count = all.length;
            state.has_more = (state.offset + state.limit) < all.length;
            state.rows = all.slice(state.offset, state.offset + state.limit);
            state.summary = data.summary || summarize(all);
            if (!data.summary) state.summary = summarize(all);
            state.loading = false; render();
          })
          .catch(function (e) { state.loading = false; state.error = 'No se pudo cargar el mock: ' + e.message; render(); });
        return;
      }
      // real
      window.FinClient.call(cfg.endpoint, buildParams())
        .then(function (data) {
          var rows = data.rows || [];
          // sub-filtro invoice/refund client-side (refunds raros; v1)
          if (state.filters.doc_kind !== 'all') {
            rows = rows.filter(function (r) { return state.filters.doc_kind === 'refund' ? /refund/.test(r.move_type) : !/refund/.test(r.move_type); });
          }
          state.rows = rows;
          state.summary = data.summary || summarize(rows);
          state.total_count = (data.summary && data.summary.total_count) || rows.length;
          state.has_more = !!(data.pagination && data.pagination.has_more);
          state.loading = false; render();
        })
        .catch(function (err) {
          state.loading = false;
          state.error = (err && err.msg) || (err && err.code) || 'Error al consultar el servidor.';
          render();
        });
    }

    function sortRows(rows) {
      var k = state.sort_by, dir = state.sort_dir === 'asc' ? 1 : -1;
      rows.sort(function (a, b) {
        var va = a[k], vb = b[k];
        if (va == null) return 1; if (vb == null) return -1;
        if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0;
      });
    }

    // ── render ──
    function render() {
      var c = state.container; if (!c) return;
      var html = '<div class="page">';
      html += '<span class="block-tag">B4 · Centro de transacciones</span>';
      html += '<div class="page-header"><div>' +
                '<div class="page-title">' + esc(cfg.title) + '</div>' +
                '<div class="page-subtitle">' + esc(cfg.subtitle) + '</div>' +
              '</div>' + modeToggle() + '</div>';
      html += '<div id="fac-companies"></div>';

      if (state.mode === 'empty') {
        html += '<div class="empty-state"><div class="icon">▢</div><div class="title">Sin datos</div>' +
                '<div>Activa <b>Demo</b> para ver datos de muestra, o <b>Real</b> para consultar Odoo (solo lectura).</div></div></div>';
        c.innerHTML = html; mountCompanies(); return;
      }
      if (state.mode === 'demo') html += '<div class="demo-banner"><b>DEMO</b> · datos ficticios de muestra, no provienen de Odoo.</div>';

      html += toolbar();
      html += '<div id="fac-body">' + bodyHtml() + '</div>';
      html += '</div>';
      c.innerHTML = html;
      mountCompanies();
      wireToolbar();
      wireBody();
    }

    function modeToggle() {
      function b(m, lbl) { return '<button data-mode="' + m + '"' + (state.mode === m ? ' class="active"' : '') + '>' + lbl + '</button>'; }
      return '<div class="mode-toggle" id="fac-mode">' + b('empty', 'Vacío') + b('demo', 'Demo') + b('real', 'Real') + '</div>';
    }

    function toolbar() {
      var f = state.filters;
      var cols = COLS.filter(function (c) { return c.id !== 'check' && c.id !== 'actions'; });
      var colMenu = cols.map(function (col) {
        var on = state.visible.indexOf(col.id) >= 0;
        return '<div class="row col-opt' + (on ? ' on' : '') + '" data-col="' + col.id + '"><span class="chk"></span><span>' + esc(col.label) + '</span></div>';
      }).join('');
      return '<div class="table-toolbar">' +
        '<div class="tfield"><label>Desde</label><input type="date" id="f-from" value="' + esc(f.date_from) + '"></div>' +
        '<div class="tfield"><label>Hasta</label><input type="date" id="f-to" value="' + esc(f.date_to) + '"></div>' +
        '<div class="tfield"><label>Documento</label><select id="f-kind">' +
          opt('all', 'Todos', f.doc_kind) + opt('invoice', 'Facturas', f.doc_kind) + opt('refund', 'Notas', f.doc_kind) + '</select></div>' +
        '<div class="tfield"><label>Pago</label><select id="f-pay">' +
          opt('', 'Todos', f.payment) + opt('paid', 'Pagada', f.payment) + opt('not_paid', 'No pagada', f.payment) +
          opt('partial', 'Parcial', f.payment) + opt('in_payment', 'En pago', f.payment) + '</select></div>' +
        '<div class="tfield"><label>Buscar</label><input type="text" id="f-search" placeholder="folio, ref, SO, ' + esc(cfg.partnerLabel.toLowerCase()) + '" value="' + esc(f.search) + '"></div>' +
        '<button class="tbtn" id="f-apply">Aplicar</button>' +
        '<div class="spacer"></div>' +
        '<div class="tmenu-wrap"><button class="tbtn" id="cols-btn">▤ Columnas</button><div class="tmenu" id="cols-menu">' + colMenu + '</div></div>' +
        '<div class="tmenu-wrap"><button class="tbtn primary" id="exp-btn">⭳ Exportar</button><div class="tmenu" id="exp-menu">' +
          '<div class="row" data-exp="xlsx">⬚ Excel (.xlsx)</div><div class="row" data-exp="csv">⬚ CSV</div></div></div>' +
      '</div>';
    }
    function opt(v, lbl, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(lbl) + '</option>'; }

    function bodyHtml() {
      if (state.loading) return '<div class="loader">Cargando…</div>';
      if (state.error) return '<div class="empty-state"><div class="icon">⚠</div><div class="title">Error</div><div class="mono">' + esc(state.error) + '</div></div>';
      return kpis() + table() + pager();
    }

    function kpis() {
      var s = state.summary; if (!s) return '';
      var by = s.total_native_by_company || {};
      var cells = '';
      var consol = s.consolidado_mxn ? s.consolidado_mxn.amount_total : 0;
      cells += kpiCell('Consolidado MXN', fmtMoney(consol, 'MXN'), (s.filtered_count || state.total_count) + ' docs');
      Object.keys(by).forEach(function (cid) {
        var b = by[cid];
        cells += kpiCell(COMPANY_NAME[cid] || ('Co ' + cid), fmtMoney(b.amount_total, b.currency), b.count + ' docs');
      });
      cells += kpiCell('Página', state.rows.length + ' / ' + state.total_count, 'offset ' + state.offset);
      return '<div class="kpi-row">' + cells + '</div>';
    }
    function kpiCell(label, val, delta) {
      return '<div class="kpi-cell"><div class="label">' + esc(label) + '</div><div class="value">' + esc(val) + '</div><div class="delta">' + esc(delta) + '</div></div>';
    }

    function table() {
      var visCols = COLS.filter(function (c) { return c.id === 'check' || c.id === 'actions' || state.visible.indexOf(c.id) >= 0; });
      var head = visCols.map(function (col) {
        if (col.id === 'check') return '<th class="check-col"><span class="row-check" id="check-all"></span></th>';
        var cls = (col.kind === 'num') ? ' class="num"' : '';
        return '<th' + cls + '>' + esc(col.label) + '</th>';
      }).join('');
      var body = state.rows.map(function (r) {
        var tds = visCols.map(function (col) { return cell(col, r); }).join('');
        return '<tr class="' + (state.selected[r.id] ? 'sel' : '') + '" data-id="' + r.id + '">' + tds + '</tr>';
      }).join('');
      if (!state.rows.length) body = '<tr><td colspan="' + visCols.length + '" style="text-align:center;color:var(--muted);padding:30px">Sin resultados para los filtros actuales</td></tr>';
      return '<div class="data-table data-table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    }

    function cell(col, r) {
      var v = r[col.id];
      switch (col.id) {
        case 'check': return '<td class="check-col"><span class="row-check ' + (state.selected[r.id] ? 'on' : '') + '" data-row="' + r.id + '"></span></td>';
        case 'name': return '<td><a class="odoo-link" href="https://serviciosfts.odoo.com/odoo/accounting" target="_blank" rel="noopener">' + esc(v) + '</a></td>';
        case 'company_id': return '<td><span class="pill pill-company">' + esc(COMPANY_NAME[v] || v) + '</span></td>';
        case 'partner_name': return '<td>' + esc(v || '—') + '</td>';
        case 'move_type': return '<td><span class="pill pill-' + (/refund/.test(v) ? 'amber' : 'blue') + '">' + esc(TYPE_LABEL[v] || v) + '</span></td>';
        case 'payment_state': return '<td>' + payPill(v) + '</td>';
        case 'amount_total': return numTd(v, r.currency);
        case 'amount_total_mxn': return numTd(v, 'MXN');
        case 'amount_untaxed': return numTd(v, r.currency);
        case 'amount_tax': return numTd(v, r.currency);
        case 'amount_residual': return numTd(v, r.currency);
        case 'invoice_user_name': return '<td>' + esc(v || '—') + '</td>';
        case 'partner_vat': return '<td class="mono">' + esc(v || '—') + '</td>';
        case 'l10n_mx_edi_cfdi_uuid': return '<td class="mono" title="' + esc(v || '') + '">' + (v ? esc(String(v).slice(0, 12)) + '…' : '<span class="muted-cell">—</span>') + '</td>';
        case 'actions': return '<td><button class="tbtn btn-sm" data-print="' + r.id + '">🖨</button></td>';
        case 'invoice_date': case 'invoice_date_due': return '<td class="mono">' + esc(v || '—') + '</td>';
        case 'currency': return '<td class="mono">' + esc(v || '') + '</td>';
        default: return '<td>' + esc(v == null ? '—' : v) + '</td>';
      }
    }
    function numTd(v, cur) {
      if (v == null) return '<td class="num">—</td>';
      return '<td class="num' + (v < 0 ? ' neg' : '') + '">' + esc(fmtMoney(v, cur)) + '</td>';
    }

    function pager() {
      var from = state.total_count ? state.offset + 1 : 0;
      var to = Math.min(state.offset + state.rows.length, state.total_count);
      return '<div class="pager"><div>' + from + '–' + to + ' de ' + state.total_count + '</div>' +
        '<div class="controls">' +
          '<button class="tbtn" id="pg-prev"' + (state.offset <= 0 ? ' disabled' : '') + '>← Anterior</button>' +
          '<button class="tbtn" id="pg-next"' + (!state.has_more ? ' disabled' : '') + '>Siguiente →</button>' +
        '</div></div>';
    }

    // ── wiring ──
    function mountCompanies() {
      var el = document.getElementById('fac-companies');
      if (el) window.FinCompanySelector.mount(el, { onChange: function () { state.offset = 0; if (state.mode !== 'empty') load(); } });
      var mt = document.getElementById('fac-mode');
      if (mt) Array.prototype.forEach.call(mt.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () { window.FinState.setMode(cfg.moduleId, b.getAttribute('data-mode')); });
      });
    }

    function wireToolbar() {
      var byId = function (id) { return document.getElementById(id); };
      if (byId('f-apply')) byId('f-apply').addEventListener('click', function () {
        state.filters.date_from = byId('f-from').value;
        state.filters.date_to = byId('f-to').value;
        state.filters.doc_kind = byId('f-kind').value;
        state.filters.payment = byId('f-pay').value;
        state.filters.search = byId('f-search').value.trim();
        state.offset = 0; load();
      });
      menu('cols-btn', 'cols-menu', function (menuEl) {
        Array.prototype.forEach.call(menuEl.querySelectorAll('.col-opt'), function (row) {
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = row.getAttribute('data-col'), i = state.visible.indexOf(id);
            if (i >= 0) state.visible.splice(i, 1); else state.visible.push(id);
            refreshBody();
            row.classList.toggle('on');
          });
        });
      });
      menu('exp-btn', 'exp-menu', function (menuEl) {
        Array.prototype.forEach.call(menuEl.querySelectorAll('[data-exp]'), function (row) {
          row.addEventListener('click', function () { doExport(row.getAttribute('data-exp')); menuEl.classList.remove('open'); });
        });
      });
    }
    function menu(btnId, menuId, wire) {
      var btn = document.getElementById(btnId), m = document.getElementById(menuId);
      if (!btn || !m) return;
      btn.addEventListener('click', function (e) { e.stopPropagation(); m.classList.toggle('open'); });
      document.addEventListener('click', function () { m.classList.remove('open'); });
      m.addEventListener('click', function (e) { e.stopPropagation(); });
      wire(m);
    }

    function refreshBody() { var b = document.getElementById('fac-body'); if (b) { b.innerHTML = bodyHtml(); wireBody(); } }

    function wireBody() {
      var ca = document.getElementById('check-all');
      if (ca) ca.addEventListener('click', function () {
        var allSel = state.rows.every(function (r) { return state.selected[r.id]; });
        state.rows.forEach(function (r) { if (allSel) delete state.selected[r.id]; else state.selected[r.id] = true; });
        refreshBody();
      });
      Array.prototype.forEach.call(document.querySelectorAll('.row-check[data-row]'), function (rc) {
        rc.addEventListener('click', function () {
          var id = rc.getAttribute('data-row');
          if (state.selected[id]) delete state.selected[id]; else state.selected[id] = true;
          refreshBody();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-print]'), function (b) {
        b.addEventListener('click', function () { openPrint(b.getAttribute('data-print')); });
      });
      var prev = document.getElementById('pg-prev'), next = document.getElementById('pg-next');
      if (prev) prev.addEventListener('click', function () { if (state.offset > 0) { state.offset = Math.max(0, state.offset - state.limit); load(); } });
      if (next) next.addEventListener('click', function () { if (state.has_more) { state.offset += state.limit; load(); } });
    }

    // ── export ──
    function exportRows() {
      var sel = Object.keys(state.selected);
      var rows = sel.length ? state.rows.filter(function (r) { return state.selected[r.id]; }) : state.rows;
      var cols = COLS.filter(function (c) { return c.id !== 'check' && c.id !== 'actions' && state.visible.indexOf(c.id) >= 0; });
      return rows.map(function (r) {
        var o = {};
        cols.forEach(function (col) {
          var v = r[col.id];
          if (col.id === 'company_id') v = COMPANY_NAME[v] || v;
          if (col.id === 'move_type') v = TYPE_LABEL[v] || v;
          o[col.label] = v == null ? '' : v;
        });
        return o;
      });
    }
    function doExport(kind) {
      var data = exportRows();
      if (!data.length) { toast('Nada que exportar'); return; }
      var fname = cfg.moduleId + '-' + todayISO();
      if (kind === 'csv') return exportCSV(data, fname);
      ensureSheetJS(function (XLSX) {
        if (!XLSX) { toast('SheetJS no cargó; exportando CSV'); return exportCSV(data, fname); }
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
        XLSX.writeFile(wb, fname + '.xlsx');
      });
    }
    function exportCSV(data, fname) {
      var heads = Object.keys(data[0]);
      var lines = [heads.join(',')].concat(data.map(function (r) {
        return heads.map(function (h) { var v = String(r[h] == null ? '' : r[h]).replace(/"/g, '""'); return /[",\n]/.test(v) ? '"' + v + '"' : v; }).join(',');
      }));
      var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, fname + '.csv');
    }
    function ensureSheetJS(cb) {
      if (window.XLSX) return cb(window.XLSX);
      var s = document.createElement('script');
      s.src = SHEETJS_CDN;
      s.onload = function () { cb(window.XLSX); };
      s.onerror = function () { cb(null); };
      document.head.appendChild(s);
    }
    function downloadBlob(blob, name) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    // ── modal impresión ──
    function openPrint(id) {
      var r = state.rows.filter(function (x) { return String(x.id) === String(id); })[0]; if (!r) return;
      var rows = [
        ['Folio', r.name], [cfg.partnerLabel, r.partner_name], ['Tax ID', r.partner_vat || '—'],
        ['Tipo', TYPE_LABEL[r.move_type] || r.move_type], ['Empresa', COMPANY_NAME[r.company_id]],
        ['Fecha', r.invoice_date], ['Vence', r.invoice_date_due || '—'],
        ['Subtotal', fmtMoney(r.amount_untaxed, r.currency)], ['Impuestos', fmtMoney(r.amount_tax, r.currency)],
        ['Total', fmtMoney(r.amount_total, r.currency)], ['Total MXN', fmtMoney(r.amount_total_mxn, 'MXN')],
        ['Pago', (PAY_PILL[r.payment_state] || [r.payment_state])[0]], ['SO origen', r.invoice_origin || '—'],
        ['UUID CFDI', r.l10n_mx_edi_cfdi_uuid || '—']
      ];
      var body = '<table style="width:100%;border-collapse:collapse">' + rows.map(function (kv) {
        return '<tr><td style="padding:6px 8px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px">' + esc(kv[0]) + '</td><td style="padding:6px 8px;font-family:IBM Plex Mono;text-align:right">' + esc(kv[1] == null ? '—' : kv[1]) + '</td></tr>';
      }).join('') + '</table>';
      var ov = document.createElement('div'); ov.className = 'modal-overlay open';
      ov.innerHTML = '<div class="modal"><div class="modal-head"><h3>' + esc(r.name) + '</h3><button class="modal-close">×</button></div>' +
        '<div class="modal-body">' + body + '</div>' +
        '<div class="modal-foot"><button class="tbtn" data-close>Cerrar</button><button class="tbtn primary" data-doprint>🖨 Imprimir</button></div></div>';
      document.body.appendChild(ov);
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.querySelector('.modal-close').addEventListener('click', close);
      ov.querySelector('[data-close]').addEventListener('click', close);
      ov.querySelector('[data-doprint]').addEventListener('click', function () { window.print(); });
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    }

    function toast(msg) {
      var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    }

    return { mount: mount };
  }

  // Columnas estándar de un listado de account.move. partnerLabel = 'Cliente' | 'Proveedor'.
  // def=true → visible por default (decisión F5: + 'vence'). kind 'num' → alineación derecha.
  function defaultColumns(partnerLabel) {
    return [
      { id: 'check',                 label: '',          def: true },
      { id: 'name',                  label: 'Folio',     def: true },
      { id: 'company_id',            label: 'Empresa',   def: true },
      { id: 'partner_name',          label: partnerLabel, def: true },
      { id: 'move_type',             label: 'Tipo',      def: true },
      { id: 'invoice_date',          label: 'Fecha',     def: true },
      { id: 'invoice_date_due',      label: 'Vence',     def: true },
      { id: 'amount_total',          label: 'Total',     def: true, kind: 'num' },
      { id: 'amount_total_mxn',      label: 'Total MXN', def: true, kind: 'num' },
      { id: 'payment_state',         label: 'Pago',      def: true },
      { id: 'ref',                   label: 'Ref',       def: false },
      { id: 'invoice_origin',        label: 'SO origen', def: false },
      { id: 'currency',              label: 'Moneda',    def: false },
      { id: 'amount_untaxed',        label: 'Subtotal',  def: false, kind: 'num' },
      { id: 'amount_tax',            label: 'Impuestos', def: false, kind: 'num' },
      { id: 'amount_residual',       label: 'Saldo',     def: false, kind: 'num' },
      { id: 'invoice_user_name',     label: 'Vendedor',  def: false },
      { id: 'partner_vat',           label: 'Tax ID',    def: false },
      { id: 'l10n_mx_edi_cfdi_uuid', label: 'UUID CFDI', def: false },
      { id: 'actions',               label: '',          def: true }
    ];
  }

  window.FinFacturas = { createView: createView, defaultColumns: defaultColumns };
})();
