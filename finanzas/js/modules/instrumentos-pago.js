// ═══ FTS Suite · Finanzas — Instrumentos de pago (Bancos) ═══
// Llena el slot reservado `instrumentos-pago` (B4 · Centro de transacciones) con
// el contenido del mockup v7 (docs/mockup-finanzas-bancos.html): fuentes de pago
// colapsables por país, tabla de 17 columnas, semáforo de conciliación, countdown
// al próximo sync y tabla de últimas corridas (CBRUN).
//
// Reutiliza FinRouter (registro), FinState (modo/companies), FinCompanySelector
// (selector único de empresa en todo Finanzas), FinClient (webhooks JWT-en-body).
// Sin globals: todo el wiring vía addEventListener (CSP-safe).
//
// Modos: empty / demo (mock JSON) / real (endpoints fin/captura-*). El modo Real
// está GATEADO tras IP_REAL_ENABLED hasta cerrar el checklist de seguridad
// (docs/finanzas/BANCOS_CHECKLIST_SEGURIDAD.md). Flip a true = one-liner.

(function () {
  'use strict';
  if (!window.FinRouter) return;

  // ── config ──
  var MODULE_ID = 'instrumentos-pago';
  var MOCK_PATH = 'data/mock/instrumentos-pago.mock.json';
  var IP_REAL_ENABLED = false;            // ⚠ gate: Real deshabilitado hasta firmar el checklist de seguridad
  var RESIDUAL_UMBRAL_MXN = 10000;        // coherente con fin/captura-status
  var SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  // Endpoints reales (contrato construido en la sesión de backend; verificar nombres de
  // campo contra la respuesta viva al des-gatear Real — requiere runner JWT).
  var EP_STATUS = '/fin/captura-status', EP_TX = '/fin/captura-transacciones', EP_DATASET = '/fin/captura-dataset';

  var DEFAULT_CRON = { days: [1, 2, 3, 4, 5], start_hour: 7, regular_end_hour: 16, regular_interval_min: 30, peak_hour: 17, peak_interval_min: 10, close_hour: 18, label: 'L–V 7–18h · 30 min · pico 10 min' };

  // ── helpers ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var amber = function (s) { return '<span class="amber">' + s + '</span>'; };

  // 17 columnas (contrato exacto del v7). vis = visible por default (8).
  var COLS = [
    { k: 'd',    lbl: 'Fecha',        vis: true,  cls: 'style="font-family:var(--ip-mono);font-size:12.5px"', fmt: function (r) { return esc(r.d); } },
    { k: 'j',    lbl: 'Instrumento',  vis: true,  fmt: function (r) { return '<span class="jtag">' + esc(r.j) + '</span>'; } },
    { k: 'tipo', lbl: 'Tipo',         vis: false, fmt: function (r) { return esc(r.tipo); } },
    { k: 'ref',  lbl: 'Descripción',  vis: true,  fmt: function (r) { return esc(r.ref); } },
    { k: 'tarj', lbl: 'Tarjeta',      vis: false, fmt: function (r) { return esc(r.tarj) || '—'; } },
    { k: 'comp', lbl: 'Comprador',    vis: true,  fmt: function (r) { return esc(r.comp) || '—'; } },
    { k: 'rs',   lbl: 'Razón social', vis: false, fmt: function (r) { return esc(r.rs); } },
    { k: 'art',  lbl: 'Artículo',     vis: false, fmt: function (r) { return esc(r.art) || '—'; } },
    { k: 'ana',  lbl: 'Analítica',    vis: true,  fmt: function (r) { return r.ana ? esc(r.ana) : amber('—'); } },
    { k: 'po',   lbl: 'PO',           vis: true,  fmt: function (r) { return r.po ? esc(r.po) : amber('—'); } },
    { k: 'bill', lbl: 'Bill',         vis: false, fmt: function (r) { return r.bill ? esc(r.bill) : amber('—'); } },
    { k: 'sb',   lbl: 'Status bill',  vis: false, fmt: function (r) { return r.sb ? esc(r.sb) : amber('—'); } },
    { k: 'ff',   lbl: 'Folio fiscal', vis: false, fmt: function (r) { return r.ff ? '<span style="font-family:var(--ip-mono);font-size:11.5px">' + esc(r.ff) + '</span>' : amber('—'); } },
    { k: 'tk',   lbl: 'Ticket',       vis: false, fmt: function (r) { return esc(r.tk) || '—'; } },
    { k: 'mon',  lbl: 'Moneda',       vis: false, fmt: function (r) { return esc(r.mon); } },
    { k: 'amt',  lbl: 'Monto',        vis: true,  cls: function (r) { return 'class="amt ' + (r.amt < 0 ? 'neg' : 'pos') + '"'; }, fmt: function (r) { return money(r.amt); } },
    { k: 'ok',   lbl: 'Status',       vis: true,  cls: function (r) { return 'class="st ' + (r.ok ? 'ok' : 'pend') + '"'; }, fmt: function (r) { return r.ok ? '✓ conciliada' : '● pendiente'; } }
  ];
  function colAttr(col, r) { return typeof col.cls === 'function' ? col.cls(r) : (col.cls || ''); }

  // ═══ vista ═══
  function createView(container) {
    var state = {
      mode: currentMode(),
      allRows: [], sources: [], runs: [], cron: DEFAULT_CRON,
      filters: { journal: '', estado: '', from: '2026-07-01', to: '2026-07-18', search: '' },
      sortK: 'd', sortDir: -1,
      pageSize: 100, page: 1,
      sel: {},                 // rowId -> true
      loading: false, error: null,
      timer: null
    };

    function currentMode() {
      var stored = null;
      try { stored = localStorage.getItem('fts_fin_mode_' + MODULE_ID); } catch (e) { stored = null; }
      if (stored === 'real') return IP_REAL_ENABLED ? 'real' : 'demo';   // Real gateado → cae a demo
      if (stored === 'demo' || stored === 'empty') return stored;         // respeta elección explícita del usuario
      return IP_REAL_ENABLED ? 'empty' : 'demo';   // sin preferencia: demo por default mientras Real esté gateado (deploy de revisión)
    }

    var q  = function (s) { return container.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(container.querySelectorAll(s)); };

    // ── ciclo de vida ──
    function mount() {
      window.FinState.subscribe(function (evt) {
        if (!document.body.contains(container)) return;      // vista desmontada
        if (evt.type === 'mode' && evt.id === MODULE_ID) { state.mode = currentMode(); state.sel = {}; render(); if (state.mode !== 'empty') load(); }
        if (evt.type === 'companies') { if (state.mode !== 'empty') { if (state.mode === 'real') { load(); } else { renderSources(); paintTable(); } } }
      });
      render();
      if (state.mode !== 'empty') load();
    }

    // ── carga de datos ──
    function load() {
      state.loading = true; state.error = null; render();
      if (state.mode === 'demo') {
        fetch(MOCK_PATH, { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (data) { ingest(data.rows || [], data.sources || [], data.runs || [], data.cron || DEFAULT_CRON); state.loading = false; render(); afterData(); })
          .catch(function (e) { state.loading = false; state.error = 'No se pudo cargar el mock: ' + e.message; render(); });
        return;
      }
      // real: status (fuentes/runs/cron) + transacciones. Verificar nombres de campo al des-gatear.
      var params = { companies: window.FinState.getCompanies() };
      Promise.all([
        window.FinClient.call(EP_STATUS, params),
        window.FinClient.call(EP_TX, txParams())
      ]).then(function (res) {
        var st = res[0] || {}, tx = res[1] || {};
        ingest(tx.rows || [], st.sources || [], st.runs || [], st.cron || DEFAULT_CRON);
        state.loading = false; render(); afterData();
      }).catch(function (err) {
        state.loading = false;
        state.error = (err && err.msg) || (err && err.code) || 'Error al consultar el servidor.';
        render();
      });
    }
    function txParams() {
      var f = state.filters;
      return {
        companies: window.FinState.getCompanies(),
        journal: f.journal || null, estado: f.estado || null,
        date_from: f.from || null, date_to: f.to || null,
        search: f.search || null, limit: 500, offset: 0
      };
    }
    function ingest(rows, sources, runs, cron) {
      rows.forEach(function (r, i) { r._id = i; });
      state.allRows = rows; state.sources = sources; state.runs = runs; state.cron = cron || DEFAULT_CRON;
    }
    function afterData() { startCountdown(); }

    // ── filtrado / orden (cliente) ──
    function visibleRows() {
      var f = state.filters, s = (f.search || '').toLowerCase();
      var cos = window.FinState.getCompanies();
      var rows = state.allRows.filter(function (t) {
        return (cos.indexOf(t.company_id) >= 0) &&
          (!f.journal || t.j === f.journal) &&
          (!f.estado || (f.estado === 'ok' ? t.ok : !t.ok)) &&
          (!s || Object.keys(t).map(function (k) { return t[k]; }).join(' ').toLowerCase().indexOf(s) >= 0) &&
          (!f.from || t.d >= f.from) && (!f.to || t.d <= f.to);
      });
      var k = state.sortK, dir = state.sortDir;
      rows.sort(function (a, b) {
        var va = a[k], vb = b[k];
        if (typeof va === 'boolean') { va = +va; vb = +vb; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
        return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
      });
      return rows;
    }

    // ── render principal (shell) ──
    function render() {
      var html = '<div class="page ip-view">';
      html += '<span class="block-tag">B4 · Centro de transacciones</span>';
      html += '<div class="ip-head"><div class="page-header" style="flex:1"><div>' +
                '<div class="page-title">Instrumentos de pago</div>' +
                '<div class="page-subtitle">Captura bancaria · fuentes de pago, transacciones y conciliación</div>' +
              '</div></div>' +
              gearHtml() + modeToggle() + '</div>';
      html += '<div id="ip-companies"></div>';

      if (state.mode === 'empty') {
        html += '<div class="empty-state"><div class="icon">▢</div><div class="title">Sin datos</div>' +
                '<div>Activa <b>Demo</b> para ver datos de muestra' + (IP_REAL_ENABLED ? ', o <b>Real</b> para consultar captura bancaria (solo lectura).' : '. <span class="mono">(Real pendiente de checklist de seguridad)</span>') + '</div></div></div>';
        container.innerHTML = html; wireHead(); return;
      }
      if (state.mode === 'demo') html += '<div class="demo-banner"><b>DEMO</b> · datos ficticios de muestra, no provienen de Odoo.</div>';

      if (state.loading) { html += '<div class="loader" style="padding:30px;text-align:center;color:var(--steel)">Cargando…</div></div>'; container.innerHTML = html; wireHead(); return; }
      if (state.error)   { html += '<div class="empty-state"><div class="icon">⚠</div><div class="title">Error</div><div class="mono">' + esc(state.error) + '</div></div></div>'; container.innerHTML = html; wireHead(); return; }

      html += '<h2>Fuentes de pago — FTS MEX</h2><div class="srclist" id="ip-srcMEX"></div>';
      html += '<h2>Fuentes de pago — FTS USA</h2><div class="srclist" id="ip-srcUSA"></div>';

      html += '<h2>Transacciones</h2><div class="panel">' + filtersHtml() +
              '<div class="selbanner" id="ip-selbanner"></div>' +
              '<div id="ip-tblwrap"></div>' +
              '<div class="tfoot"><span id="ip-aggs"></span><span class="pager" id="ip-pager"></span></div></div>';

      html += '<h2>Semáforo de conciliación — Admin</h2><div class="sem"><div class="title">Control de conciliación por journal</div>' +
              '<div id="ip-semrows"></div>' +
              '<div class="semnote">Verde = 100% conciliado y residual $0 · Amarillo ≥ 90% · Rojo &lt; 90% o residual &gt; ' + money(RESIDUAL_UMBRAL_MXN) + '. El KPI incluye backlog histórico hasta su limpieza (Fase 2).</div></div>';

      html += '<h2>Últimas corridas de captura</h2><div class="panel"><table class="runs">' +
              '<thead><tr><th>Run</th><th>Origen</th><th>Rango</th><th>Nuevas</th><th>Dup.</th><th>Rech.</th><th>Status</th></tr></thead>' +
              '<tbody id="ip-runsbody"></tbody></table></div>';

      html += '<div class="ip-toast" id="ip-toast"></div>';
      html += '</div>';
      container.innerHTML = html;

      wireHead();
      wireFilters();
      renderSources();
      renderRuns();
      buildColMenu();
      paintTable();
    }

    // ── head: gear + mode toggle + company selector ──
    function gearHtml() {
      return '<div class="ip-gearwrap"><button class="gear" id="ip-gear" title="Agregar fuente de pago">⚙</button>' +
        '<div class="setmenu" id="ip-setmenu"><div class="mt">Agregar fuente de pago</div>' +
        '<label>Empresa</label><select id="ip-nfEmp"><option>FTS MEX (Servicios FTS)</option><option>FTS USA (FTS LLC)</option></select>' +
        '<label>Nombre de la cuenta</label><input id="ip-nfNom" placeholder="ej. Banorte Empresarial MXN">' +
        '<label>Método de sync</label><select id="ip-nfMet"><option>MCP / API nativa</option><option>CAMT.053 / archivo banco</option><option>Plaid / agregador</option><option>CSV por correo (IMAP)</option><option>Extensión portal</option><option>Manual</option></select>' +
        '<button class="ip-btn" id="ip-addsrc">Agregar (demo)</button></div></div>';
    }
    function modeToggle() {
      function b(m, lbl) {
        var dis = (m === 'real' && !IP_REAL_ENABLED);
        return '<button data-mode="' + m + '"' + (state.mode === m ? ' class="active"' : '') +
          (dis ? ' disabled title="Pendiente checklist de seguridad"' : '') + '>' + lbl + '</button>';
      }
      return '<div class="mode-toggle" id="ip-mode">' + b('empty', 'Vacío') + b('demo', 'Demo') + b('real', 'Real') + '</div>';
    }
    function wireHead() {
      var el = q('#ip-companies');
      if (el && window.FinCompanySelector) window.FinCompanySelector.mount(el, { onChange: function () {
        if (state.mode === 'empty') return;
        if (state.mode === 'real') { load(); } else { renderSources(); paintTable(); }
      } });
      qa('#ip-mode button').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          window.FinState.setMode(MODULE_ID, b.getAttribute('data-mode'));
        });
      });
      var gear = q('#ip-gear'), setmenu = q('#ip-setmenu');
      if (gear && setmenu) {
        gear.addEventListener('click', function (e) { e.stopPropagation(); setmenu.classList.toggle('open'); });
        document.addEventListener('click', function docClose(ev) {
          if (!document.body.contains(container)) { document.removeEventListener('click', docClose); return; }
          if (!ev.target.closest || !ev.target.closest('.ip-gearwrap')) setmenu.classList.remove('open');
        });
        var add = q('#ip-addsrc');
        if (add) add.addEventListener('click', addSource);
      }
    }

    function addSource() {
      var emp = q('#ip-nfEmp').value, nom = q('#ip-nfNom').value || 'Nueva cuenta', met = q('#ip-nfMet').value;
      state.sources.push({ id: 'n' + state.sources.length, co: emp.indexOf('USA') >= 0 ? 6 : 1, pais: emp.indexOf('USA') >= 0 ? 'USA' : 'MEX', nm: nom, jt: 'sin journal', met: met.split(' ')[0], st: 'ok', last: '—', kpi: '—', movHoy: 0, movMes: 0, run: 'Pendiente de primer sync' });
      renderSources(); q('#ip-setmenu').classList.remove('open');
      toast('Fuente <b>' + esc(nom) + '</b> agregada (demo) — configura credenciales para el primer sync');
    }

    // ── fuentes colapsables ──
    function srcRow(s) {
      var chip = s.st === 'ok'
        ? '<span class="stchip ok">● SYNC OK · ' + esc(s.last) + '</span>'
        : s.st === 'off'
          ? '<span class="stchip off">○ SIN CONFIGURAR</span>'
          : '<span class="stchip err">▲ SYNC ERROR · ' + esc(s.last) + '</span><span class="wdbadge">WATCHDOG <button data-atender="' + esc(s.id) + '">Atender</button></span>';
      var jeevesExtra = s.main ? (
        '<div class="synced"><span class="pulse"></span>' +
        '<span>Próximo sync en <b class="ip-countdown" style="font-family:var(--ip-mono)">—</b></span>' +
        '<span class="schChip" title="Horario de captura">' + esc(state.cron && state.cron.label || DEFAULT_CRON.label) + '</span></div>') : '';
      var btn = s.st === 'off' ? '' : (s.main
        ? '<button class="ip-btn ip-btnrun"><span class="spin"></span><span class="ip-btntxt">Sync Now</span></button>'
        : '<button class="ip-btn" data-demosync="' + esc(s.id) + '">Sync Now</button>');
      var body = s.st === 'off'
        ? '<div class="meta">Fuente no configurada — pendiente de credenciales / primer sync.</div>'
        : '<div class="meta">Última captura: <b class="' + (s.main ? 'ip-lastsync' : '') + '">' + esc(s.last) + '</b> · schedule<br>' +
            'Movimientos hoy: <b>' + esc(s.movHoy) + '</b> · este mes: <b>' + esc(s.movMes) + '</b><br>' +
            'Último run: <b style="color:' + (s.st === 'ok' ? 'var(--ip-ok)' : 'var(--ip-bad)') + '">' + esc(s.run) + '</b>' +
            (s.wd ? '<br><span style="color:var(--ip-bad);font-weight:600">⚠ ' + esc(s.wd) + '</span>' : '') + '</div>' +
          jeevesExtra +
          '<div class="kpi"><div class="lbl">$ sin conciliar</div><div class="val">' + esc(s.kpi) + '</div>' + (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</div>' +
          btn;
      return '<div class="src" data-src="' + esc(s.id) + '"><div class="srchead" data-toggle="' + esc(s.id) + '">' +
        '<span class="chev">▶</span><span class="nm">' + esc(s.nm) + '</span><span class="jtag">' + esc(s.jt) + '</span>' +
        chip + '<span class="sp">' + esc(s.met) + '</span></div><div class="srcbody">' + body + '</div></div>';
    }
    function renderSources() {
      var mex = q('#ip-srcMEX'), usa = q('#ip-srcUSA'); if (!mex || !usa) return;
      var cos = window.FinState.getCompanies();
      var pick = function (pais) { return state.sources.filter(function (s) { return s.pais === pais && cos.indexOf(s.co) >= 0; }).map(srcRow).join(''); };
      mex.innerHTML = pick('MEX') || '<div class="ip-empty" style="padding:14px">Sin fuentes para la empresa seleccionada.</div>';
      usa.innerHTML = pick('USA') || '<div class="ip-empty" style="padding:14px">Sin fuentes para la empresa seleccionada.</div>';
      qa('[data-toggle]').forEach(function (h) { h.addEventListener('click', function () { var el = q('[data-src="' + h.getAttribute('data-toggle') + '"]'); if (el) el.classList.toggle('open'); }); });
      qa('[data-atender]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toast('Watchdog <b>' + esc(b.getAttribute('data-atender').toUpperCase()) + '</b>: reintentando sync y notificando responsable…'); }); });
      qa('[data-demosync]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); toast('Sync <b>' + esc(b.getAttribute('data-demosync').toUpperCase()) + '</b> terminado — 0 nuevas · 0 duplicadas'); }); });
      var run = q('.ip-btnrun');
      if (run) run.addEventListener('click', function () {
        run.disabled = true; run.classList.add('busy'); var tx = q('.ip-btntxt'); if (tx) tx.textContent = 'Sincronizando…';
        setTimeout(function () {
          if (!document.body.contains(container)) return;
          run.disabled = false; run.classList.remove('busy'); if (tx) tx.textContent = 'Sync Now';
          toast('Captura Jeeves terminada — <b>3 nuevas</b> · 2 duplicadas · 0 rechazadas');
          var rb = q('#ip-runsbody');
          if (rb) rb.insertAdjacentHTML('afterbegin', '<tr><td>Jeeves manual ' + new Date().toTimeString().slice(0, 5) + '</td><td>manual</td><td>07-14 → 07-18</td><td>3</td><td>2</td><td>0</td><td class="st ok">OK</td></tr>');
        }, 1600);
      });
    }

    // ── filtros + menú de columnas ──
    function filtersHtml() {
      var f = state.filters;
      return '<div class="filters">' +
        '<select id="ip-fJournal"><option value="">Todos los journals</option>' +
          '<option value="Jeeves"' + (f.journal === 'Jeeves' ? ' selected' : '') + '>Jeeves (61)</option>' +
          '<option value="Chase"' + (f.journal === 'Chase' ? ' selected' : '') + '>Chase</option>' +
          '<option value="BBVA"' + (f.journal === 'BBVA' ? ' selected' : '') + '>BBVA General</option></select>' +
        '<input type="date" id="ip-fFrom" value="' + esc(f.from) + '">' +
        '<input type="date" id="ip-fTo" value="' + esc(f.to) + '">' +
        '<select id="ip-fEstado"><option value="">Estado: todos</option>' +
          '<option value="ok"' + (f.estado === 'ok' ? ' selected' : '') + '>Conciliadas</option>' +
          '<option value="pend"' + (f.estado === 'pend' ? ' selected' : '') + '>Sin conciliar</option></select>' +
        '<input class="grow" type="text" id="ip-fSearch" placeholder="Buscar en TODAS las columnas… (comercio, PO, folio, comprador, analítica)" value="' + esc(f.search) + '">' +
        '<button class="xlsbtn" id="ip-btnxls" title="Descarga las filas seleccionadas con las columnas visibles">⬇ Excel <span id="ip-xlscount"></span></button>' +
        '<select id="ip-fPageSize" title="Filas por página">' +
          [10, 25, 50, 100].map(function (n) { return '<option value="' + n + '"' + (state.pageSize === n ? ' selected' : '') + '>' + n + ' filas</option>'; }).join('') + '</select>' +
        '<div class="colbtn"><button id="ip-colbtn" title="Columnas">⋮</button>' +
          '<div class="colmenu" id="ip-colmenu"><div class="mt">Columnas visibles</div>' +
          '<div class="cact"><a id="ip-colall">Seleccionar todas</a><a id="ip-colnone">Ninguna</a></div>' +
          '<div id="ip-colchecks"></div></div></div>' +
        '</div>';
    }
    function wireFilters() {
      var reload = function () {
        state.filters.journal = q('#ip-fJournal').value;
        state.filters.estado = q('#ip-fEstado').value;
        state.filters.from = q('#ip-fFrom').value;
        state.filters.to = q('#ip-fTo').value;
        state.filters.search = q('#ip-fSearch').value;
        state.page = 1;
        if (state.mode === 'real') { load(); } else { paintTable(); }
      };
      ['#ip-fJournal', '#ip-fEstado', '#ip-fFrom', '#ip-fTo'].forEach(function (s) { var el = q(s); if (el) el.addEventListener('change', reload); });
      var srch = q('#ip-fSearch'); if (srch) srch.addEventListener('input', function () { state.filters.search = srch.value; state.page = 1; paintTable(); });
      var ps = q('#ip-fPageSize'); if (ps) ps.addEventListener('change', function () { state.pageSize = +ps.value; state.page = 1; paintTable(); });
      var cb = q('#ip-colbtn'), cm = q('#ip-colmenu');
      if (cb && cm) {
        cb.addEventListener('click', function (e) { e.stopPropagation(); cm.classList.toggle('open'); });
        document.addEventListener('click', function docClose(ev) {
          if (!document.body.contains(container)) { document.removeEventListener('click', docClose); return; }
          if (!ev.target.closest || !ev.target.closest('.colbtn')) cm.classList.remove('open');
        });
        cm.addEventListener('click', function (e) { e.stopPropagation(); });
      }
      var all = q('#ip-colall'), none = q('#ip-colnone');
      if (all) all.addEventListener('click', function () { COLS.forEach(function (c) { c.vis = true; }); buildColMenu(); paintTable(); });
      if (none) none.addEventListener('click', function () { COLS.forEach(function (c) { c.vis = false; }); buildColMenu(); paintTable(); });
      var xls = q('#ip-btnxls'); if (xls) xls.addEventListener('click', exportXls);
    }
    function buildColMenu() {
      var cc = q('#ip-colchecks'); if (!cc) return;
      cc.innerHTML = COLS.map(function (c, i) { return '<label><input type="checkbox" data-col="' + i + '"' + (c.vis ? ' checked' : '') + '> ' + esc(c.lbl) + '</label>'; }).join('');
      qa('#ip-colchecks input[data-col]').forEach(function (inp) { inp.addEventListener('change', function () { COLS[+inp.getAttribute('data-col')].vis = inp.checked; paintTable(); }); });
    }

    // ── tabla (repintado parcial, preserva menús abiertos) ──
    function paintTable() {
      var rows = visibleRows();
      var pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      if (state.page > pages) state.page = 1;
      var slice = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
      var vis = COLS.filter(function (c) { return c.vis; });
      var allSel = rows.length > 0 && rows.every(function (t) { return state.sel[t._id]; });

      var tbl = rows.length ? '<div style="overflow-x:auto"><table><thead><tr>' +
        '<th class="chk"><input type="checkbox" id="ip-checkall"' + (allSel ? ' checked' : '') + ' title="Seleccionar toda la vista filtrada (' + rows.length + ')"></th>' +
        vis.map(function (c) { return '<th class="sortable" data-sort="' + c.k + '"' + (c.k === 'amt' ? ' style="text-align:right"' : '') + '>' + esc(c.lbl) + (state.sortK === c.k ? '<span class="sarr">' + (state.sortDir > 0 ? '▲' : '▼') + '</span>' : '') + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        slice.map(function (t) {
          return '<tr class="' + (state.sel[t._id] ? 'selrow' : '') + '"><td class="chk"><input type="checkbox" data-row="' + t._id + '"' + (state.sel[t._id] ? ' checked' : '') + '></td>' +
            vis.map(function (c) { return '<td ' + colAttr(c, t) + '>' + c.fmt(t) + '</td>'; }).join('') + '</tr>';
        }).join('') +
        '</tbody></table></div>'
        : '<div class="ip-empty">Sin movimientos con estos filtros. Ajusta el rango o la búsqueda.</div>';
      var w = q('#ip-tblwrap'); if (w) w.innerHTML = tbl;

      var conc = rows.filter(function (t) { return t.ok; }).length;
      var resid = rows.reduce(function (a, t) { return a + (t.res || 0); }, 0);
      var nSel = rows.filter(function (t) { return state.sel[t._id]; }).length;
      var ag = q('#ip-aggs'); if (ag) ag.textContent = rows.length + ' líneas · ' + conc + ' conciliadas · ' + (rows.length - conc) + ' pendientes · residual ' + money(resid) + (nSel ? ' · ' + nSel + ' seleccionadas' : '');

      var bn = q('#ip-selbanner');
      if (bn) {
        if (nSel > 0) {
          bn.classList.add('show');
          bn.innerHTML = '<span>Seleccionadas <b>' + nSel + '</b> de <b>' + rows.length + '</b> transacciones de la vista (todas las páginas · ' + pages + ' pág.)</span>' +
            (nSel < rows.length ? '<a id="ip-selall">Seleccionar las ' + rows.length + '</a>' : '') + '<a id="ip-selnone">Quitar selección</a>';
          var sa = q('#ip-selall'), sn = q('#ip-selnone');
          if (sa) sa.addEventListener('click', function () { rows.forEach(function (t) { state.sel[t._id] = true; }); paintTable(); });
          if (sn) sn.addEventListener('click', function () { rows.forEach(function (t) { delete state.sel[t._id]; }); paintTable(); });
        } else { bn.classList.remove('show'); bn.innerHTML = ''; }
      }

      var xls = q('#ip-btnxls'); if (xls) xls.classList.toggle('show', nSel > 0);
      var xc = q('#ip-xlscount'); if (xc) xc.textContent = nSel ? '(' + nSel + ')' : '';

      var pg = q('#ip-pager');
      if (pg) {
        pg.innerHTML = Array.from({ length: pages }, function (_, i) { return '<button class="' + (i + 1 === state.page ? 'on' : '') + '" data-page="' + (i + 1) + '">' + (i + 1) + '</button>'; }).join('');
        qa('#ip-pager button').forEach(function (b) { b.addEventListener('click', function () { state.page = +b.getAttribute('data-page'); paintTable(); }); });
      }

      // wiring de la tabla repintada
      var ca = q('#ip-checkall');
      if (ca) ca.addEventListener('change', function () { rows.forEach(function (t) { if (ca.checked) state.sel[t._id] = true; else delete state.sel[t._id]; }); paintTable(); });
      qa('input[data-row]').forEach(function (rc) { rc.addEventListener('change', function () { var id = +rc.getAttribute('data-row'); if (rc.checked) state.sel[id] = true; else delete state.sel[id]; paintTable(); }); });
      qa('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { var k = th.getAttribute('data-sort'); if (state.sortK === k) state.sortDir *= -1; else { state.sortK = k; state.sortDir = 1; } paintTable(); }); });

      paintSem();
    }

    // ── semáforo ──
    function semColor(pct, res) {
      if (pct === null) return 'off';
      if (res > RESIDUAL_UMBRAL_MXN) return 'r';
      if (pct === 100 && res === 0) return 'g';
      if (pct >= 90) return 'y';
      return 'r';
    }
    function barc(c) { return c === 'g' ? 'var(--ip-ok)' : c === 'y' ? 'var(--ip-warn)' : 'var(--ip-bad)'; }
    function paintSem() {
      var host = q('#ip-semrows'); if (!host) return;
      var journals = [{ n: 'Jeeves', id: '61' }, { n: 'Chase', id: '73' }, { n: 'BBVA', id: '—' }];
      var base = state.allRows;   // el semáforo admin evalúa todo el universo cargado, no la vista filtrada
      var data = journals.map(function (x) {
        var r = base.filter(function (t) { return t.j === x.n; });
        var tot = r.length, conc = r.filter(function (t) { return t.ok; }).length, res = r.reduce(function (a, t) { return a + (t.res || 0); }, 0);
        return { n: x.n, tot: tot, conc: conc, res: res, pct: tot ? Math.round(conc / tot * 100) : null };
      });
      var all = { tot: base.length, conc: base.filter(function (t) { return t.ok; }).length, res: base.reduce(function (a, t) { return a + (t.res || 0); }, 0) };
      all.pct = all.tot ? Math.round(all.conc / all.tot * 100) : null;

      host.innerHTML = data.map(function (d) {
        var c = semColor(d.pct, d.res);
        return '<div class="semrow"><span class="jn">' + esc(d.n) + (d.pct === null ? '' : ' <span style="color:#68788a;font-family:var(--ip-mono);font-size:11px">(' + d.conc + '/' + d.tot + ')</span>') + '</span>' +
          '<div class="bar"><i style="width:' + (d.pct || 0) + '%;background:' + barc(c) + '"></i></div>' +
          '<span class="pct">' + (d.pct === null ? '—' : d.pct + '%') + '</span>' +
          '<span class="res">' + (d.pct === null ? '' : money(d.res)) + '</span></div>';
      }).join('') +
        '<div class="semrow total"><span class="jn" style="display:flex;align-items:center;gap:10px"><span class="light ' + semColor(all.pct, all.res) + '"></span> TODOS</span>' +
        '<div class="bar"><i style="width:' + (all.pct || 0) + '%;background:' + barc(semColor(all.pct, all.res)) + '"></i></div>' +
        '<span class="pct">' + (all.pct === null ? '—' : all.pct + '%') + '</span><span class="res">' + money(all.res) + '</span></div>';
    }

    // ── corridas ──
    function renderRuns() {
      var rb = q('#ip-runsbody'); if (!rb) return;
      rb.innerHTML = state.runs.map(function (r) {
        var st = r.status === 'ok' ? 'ok' : 'pend';
        var cell = function (v) { return (v == null ? '—' : v); };
        return '<tr><td>' + esc(r.run) + '</td><td>' + esc(r.origen) + '</td><td>' + esc(r.rango) + '</td>' +
          '<td>' + cell(r.nuevas) + '</td><td>' + cell(r.dup) + '</td><td>' + cell(r.rech) + '</td>' +
          '<td class="st ' + st + '">' + esc(r.status_label || (r.status === 'ok' ? 'OK' : r.status)) + '</td></tr>';
      }).join('');
    }

    // ── export XLSX (columnas visibles × filas seleccionadas) ──
    function exportXls() {
      var vis = COLS.filter(function (c) { return c.vis; });
      var selIds = Object.keys(state.sel).filter(function (k) { return state.sel[k]; });
      if (!selIds.length) return;
      if (state.mode === 'real') {
        // dataset completo desde el server (columnas visibles × selección)
        window.FinClient.call(EP_DATASET, { companies: window.FinState.getCompanies(), ids: selIds.map(Number), columns: vis.map(function (c) { return c.k; }), filters: txParams() })
          .then(function (data) { writeXls(data.rows || [], vis); })
          .catch(function (err) { toast('No se pudo exportar: ' + esc((err && err.msg) || (err && err.code) || 'error')); });
        return;
      }
      var data = visibleRows().filter(function (t) { return state.sel[t._id]; });
      writeXls(data, vis);
    }
    function writeXls(rows, vis) {
      if (!rows.length) { toast('Nada que exportar'); return; }
      ensureSheetJS(function (XLSX) {
        if (!XLSX) { toast('SheetJS no cargó; intenta de nuevo'); return; }
        var plain = rows.map(function (t) {
          var o = {};
          vis.forEach(function (c) { o[c.lbl] = c.k === 'ok' ? (t.ok ? 'CONCILIADA' : 'PENDIENTE') : (t[c.k] == null ? '' : t[c.k]); });
          return o;
        });
        var ws = XLSX.utils.json_to_sheet(plain);
        ws['!cols'] = vis.map(function (c) { return { wch: c.k === 'ref' ? 45 : c.k === 'ana' ? 24 : 14 }; });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
        XLSX.writeFile(wb, 'FTS_transacciones_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      });
    }
    function ensureSheetJS(cb) {
      if (window.XLSX) return cb(window.XLSX);
      var s = document.createElement('script'); s.src = SHEETJS_CDN;
      s.onload = function () { cb(window.XLSX); };
      s.onerror = function () { cb(null); };
      document.head.appendChild(s);
    }

    // ── countdown al próximo sync ──
    function nextSync(now, cron) {
      var c = new Date(now.getTime());
      for (var i = 0; i < 10080; i++) {
        c.setSeconds(0, 0);
        var dow = c.getDay(), h = c.getHours(), m = c.getMinutes();
        var habil = cron.days.indexOf(dow) >= 0;
        var reg = h >= cron.start_hour && h <= cron.regular_end_hour && (m % cron.regular_interval_min === 0);
        var peak = h === cron.peak_hour && (m % cron.peak_interval_min === 0);
        var close = h === cron.close_hour && m === 0;
        if (habil && (reg || peak || close) && c > now) return c;
        c.setMinutes(c.getMinutes() + 1);
      }
      return null;
    }
    function fmtDelta(ms) {
      var s = Math.floor(ms / 1000);
      if (s >= 3600) { var h = Math.floor(s / 3600); return h + 'h ' + Math.floor(s % 3600 / 60) + 'm'; }
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    function startCountdown() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      var cron = state.cron || DEFAULT_CRON;
      var target = nextSync(new Date(), cron);
      state.timer = setInterval(function () {
        if (!document.body.contains(container)) { clearInterval(state.timer); state.timer = null; return; }
        var el = q('.ip-countdown'); if (!el) return;
        var now = new Date();
        if (!target || target <= now) {
          var ls = q('.ip-lastsync'); if (ls) ls.textContent = 'hoy ' + now.toTimeString().slice(0, 5);
          target = nextSync(now, cron);
        }
        el.textContent = target ? fmtDelta(target - now) : 'fuera de horario';
      }, 1000);
    }

    // ── toast ──
    function toast(html) {
      var t = q('#ip-toast'); if (!t) return;
      t.innerHTML = html; t.style.display = 'block';
      clearTimeout(t._to); t._to = setTimeout(function () { t.style.display = 'none'; }, 3800);
    }

    return { mount: mount };
  }

  window.FinRouter.register(MODULE_ID, {
    render: function (container) { createView(container).mount(); }
  });
})();
