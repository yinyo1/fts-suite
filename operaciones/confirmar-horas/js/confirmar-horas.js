// ═══ FTS · Panel «Confirmar Horas» (B4) ═══
// Felipe (Supervisor Ops) + ftsmaster confirman las horas reales de operativos
// y corrigen la SO cuando aplique. Escribe x_studio_manager_approval y/o
// x_studio_sales_order_2 vía workflows n8n (Odoo write server-side).
// Anti-patrón Hallazgo #15: la UI muestra éxito SÓLO tras el OK del POST.
'use strict';

(function(){
  var BUILD = window.CH_BUILD || 'b4-v1';
  var N8N_BASE = 'https://primary-production-5c3c.up.railway.app';
  var COMPANY_ID = 1;

  // PR-5: corrección de atribución (proyecto O bolsa, excluyencia mutua) → workflow
  // separado planeacion/corregir-bolsa (O61Abp4s26yYpFEq). El botón ✔ Confirmar sigue
  // usando /planeacion/confirmar-horas (sin cambios).
  var CORREGIR_URL = '/webhook/planeacion/corregir-bolsa';
  var BOLSAS = [
    { id: 3095, nombre: 'DIRECCION' },
    { id: 3096, nombre: 'ADMIN DE OPERACIONES' },
    { id: 608,  nombre: 'VENTAS' },
    { id: 513,  nombre: 'Administración' },
    { id: 768,  nombre: 'LEGAL' },
    { id: 478,  nombre: 'RH' }
  ];

  // Celda de atribución: proyecto (🛠️) > bolsa (🗂️) > sin atribución.
  function celdaAtribucion(row){
    if(row.so_id) return esc(row.so_nombre || ('Proy ' + row.so_id));
    if(row.cuenta_id) return '<span class="ch-bolsa">🗂️ ' + esc(row.cuenta_nombre || ('Bolsa ' + row.cuenta_id)) + '</span>';
    if(row.abierta) return '<span style="color:#999">— (en curso)</span>';   // PR-6: abierta sin atribución aún ≠ hueco
    return '<span class="ch-sinso">⚠ Sin atribución</span>';
  }
  // Etiqueta de la atribución ACTUAL (para prev_label del chatter).
  function labelAtribucion(row){
    if(!row) return '(sin atribución)';
    if(row.so_id) return row.so_nombre || ('Proy ' + row.so_id);
    if(row.cuenta_id) return row.cuenta_nombre || ('Bolsa ' + row.cuenta_id);
    return '(sin atribución)';
  }

  // #2b: cross-departamento a PROYECTO (no bolsa). Los híbridos pueden hacerlo; la alerta hace visible, no bloquea.
  function esCrossProy(row){ return !!(row && row.es_operaciones === false && row.so_id); }
  // Celda de atribución con marcadores ⚠️ (cross-proy) y 🔒 (solo_bolsa).
  function soCellHtml(row){
    var so = celdaAtribucion(row);
    return (esCrossProy(row) ? '<span class="ch-warn" title="Empleado de ' + esc(row.department_name || 'otro depto') + ' cargando a proyecto">⚠️</span> ' : '') +
      so + (row.solo_bolsa ? ' <span class="ch-solo" title="Solo-bolsa: costo fijo a su bolsa, sin proyecto">🔒</span>' : '') +
      budgetBadge(row);
  }

  // CC-1: estado presupuestal MO (budget rubro 1177) del renglón. Sólo aplica a proyectos (bolsas = exento).
  function budgetEstado(row){ return (row && row.budget_mo && row.budget_mo.estado) || null; }
  function fmtMoney(n){ return '$' + Number(n||0).toLocaleString('es-MX', { maximumFractionDigits: 0 }); }
  function budgetBadge(row){
    var e = budgetEstado(row);
    if(e === 'sin_linea')   return ' <span class="ch-mo ch-mo-red" title="Sin línea de Mano de Obra (rubro 1177): no confirmable">🔴 sin MO</span>';
    if(e === 'placeholder') return ' <span class="ch-mo ch-mo-amber" title="MO sin presupuesto asignado (placeholder)">🟠 s/fondos</span>';
    if(e === 'agotado'){ var bm = row.budget_mo || {}; return ' <span class="ch-mo ch-mo-amber" title="MO agotada: ' + fmtMoney(bm.consumido) + ' de ' + fmtMoney(bm.presupuesto) + '">🟠 MO agotada</span>'; }
    return '';
  }

  var CH = {
    rows: [],
    sos: null,            // cache lista SO (lazy)
    sosCargando: false,
    supervisor: 'Supervisor',
    modalAttId: null,
    sortKey: null,        // PR-4: orden client-side
    sortDir: 'asc'
  };

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function n8n(path, body){
    return fetch(N8N_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function(res){
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function ymd(d){ return d.toISOString().slice(0,10); }
  function ayerCST(){
    var nowCst = new Date(Date.now() - 6*3600*1000);
    return new Date(nowCst.getTime() - 24*3600*1000);
  }

  function showMsg(texto, tipo){
    var el = $('ch-msg');
    if(!el) return;
    el.textContent = texto;
    el.className = 'ch-msg ' + (tipo === 'ok' ? 'ch-msg-ok' : 'ch-msg-err');
    el.style.display = 'block';
    if(tipo === 'ok') setTimeout(function(){ el.style.display = 'none'; }, 4000);
  }
  function clearMsg(){ var el = $('ch-msg'); if(el) el.style.display = 'none'; }

  // ─── Cargar horas del rango ───
  function cargar(){
    clearMsg();
    CH._autoDismissed = false; if(CH._autoTimer){ clearTimeout(CH._autoTimer); CH._autoTimer = null; }
    var desde = $('f-desde').value;
    var hasta = $('f-hasta').value;
    if(!desde){ showMsg('Elige la fecha "Desde".', 'err'); return; }
    if(!hasta) hasta = desde;
    var btn = $('btn-cargar');
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Cargando…';
    $('tabla-zone').innerHTML = '<div class="ch-placeholder">⏳ Consultando Odoo…</div>';

    n8n('/webhook/planeacion/horas-dia', { fecha_desde: desde, fecha_hasta: hasta })
      .then(function(data){
        var r = Array.isArray(data) ? data[0] : data;
        if(!r || r.success === false){
          throw new Error((r && r.mensaje) || 'Respuesta inválida');
        }
        CH.rows = r.rows || [];
        renderTabla();
        var conf = CH.rows.filter(function(x){ return x.confirmado; }).length;
        $('ch-summary').textContent = CH.rows.length + ' registro(s) · ' + conf +
          ' confirmado(s) · ' + (CH.rows.length - conf) + ' pendiente(s)';
      })
      .catch(function(e){
        $('tabla-zone').innerHTML = '<div class="ch-placeholder">❌ Error cargando: ' + esc(e.message) + '</div>';
        $('ch-summary').textContent = '';
      })
      .finally(function(){ btn.disabled = false; btn.textContent = orig; });
  }

  function estadoBadge(row){
    if(row.en_disputa) return '<span class="ch-badge b-disp">⚠ En disputa' + (row._marcado ? ' ☑' : '') + '</span>';
    if(row.abierta)    return '<span class="ch-badge b-open">⏳ Sin completar</span>';
    if(row.confirmado) return '<span class="ch-badge b-ok">✓ Confirmada</span>';
    if(row._marcado)   return '<span class="ch-badge b-mark">☑ Revisado</span>';
    return '<span class="ch-badge b-pend">Pendiente</span>';
  }

  // ─── PR-4: columnas + orden client-side ───
  var COLS = [
    { key:'id',       label:'ID',                     sortable:true,  type:'num', thStyle:'width:56px', get:function(r){ return r.attendance_id || 0; } },
    { key:'empleado', label:'Empleado',               sortable:true,  type:'str', get:function(r){ return r.empleado_nombre || ('#' + r.empleado_id); } },
    { key:'depto',    label:'Depto',                  sortable:true,  type:'str', get:function(r){ return r.department_name || ''; } },
    { key:'horario',  label:'Entrada → Salida (CST)', sortable:true,  type:'str', get:function(r){ return r.check_in_cst || ''; } },
    { key:'horas',    label:'Horas',                  sortable:true,  type:'num', get:function(r){ return r.worked_hours == null ? -1 : r.worked_hours; } },
    { key:'proyecto', label:'Proyecto / Bolsa',        sortable:true,  type:'str', get:function(r){ return r.so_id ? (r.so_nombre || ('Proy ' + r.so_id)) : (r.cuenta_id ? ('🗂️ ' + (r.cuenta_nombre || ('Bolsa ' + r.cuenta_id))) : ''); } },
    { key:'estado',   label:'Estado',                 sortable:true,  type:'num', get:function(r){ return estadoRank(r); } },
    { key:'acc',      label:'Acciones',               sortable:false }
  ];

  // Rank de estado: lo accionable primero (disputa < pendiente < abierta < confirmada)
  function estadoRank(row){
    if(row.en_disputa) return 0;
    if(row.abierta)    return 2;
    if(row.confirmado) return 3;
    return 1; // pendiente
  }

  function colByKey(key){
    for(var i=0;i<COLS.length;i++){ if(COLS[i].key === key) return COLS[i]; }
    return null;
  }

  function sortedRows(){
    var rows = CH.rows.slice();
    var col = CH.sortKey ? colByKey(CH.sortKey) : null;
    if(!col || !col.get) return rows;
    var dir = CH.sortDir === 'desc' ? -1 : 1;
    rows.sort(function(a,b){
      var va = col.get(a), vb = col.get(b), r;
      if(col.type === 'num'){ r = (Number(va) - Number(vb)); }
      else { r = String(va).localeCompare(String(vb), 'es', { numeric:true, sensitivity:'base' }); }
      if(r === 0) r = (a.attendance_id || 0) - (b.attendance_id || 0); // desempate estable
      return r * dir;
    });
    return rows;
  }

  function sortInd(key){
    if(CH.sortKey !== key) return '<span class="ch-sort-ind">↕</span>';
    return '<span class="ch-sort-ind">' + (CH.sortDir === 'desc' ? '▼' : '▲') + '</span>';
  }

  function onHeaderClick(key){
    var col = colByKey(key);
    if(!col || !col.sortable) return;
    if(CH.sortKey === key){ CH.sortDir = (CH.sortDir === 'asc') ? 'desc' : 'asc'; }
    else { CH.sortKey = key; CH.sortDir = 'asc'; }
    renderTabla();
  }

  function renderTabla(){
    if(!CH.rows.length){
      $('tabla-zone').innerHTML = '<div class="ch-placeholder">Sin registros en el rango.</div>';
      return;
    }
    var filas = sortedRows().map(function(row){
      var depto = row.department_name
        ? (esCrossProy(row)
            ? '<span class="ch-depto-cross" title="Cargó horas a un PROYECTO siendo de otro depto">' + esc(row.department_name) + '</span>'
            : esc(row.department_name))
        : '—';
      var soCell = soCellHtml(row);
      var horario = (row.check_in_cst || '—') + (row.check_out_cst ? ' → ' + row.check_out_cst.slice(11) : ' → …');
      var horas = row.worked_hours != null ? row.worked_hours.toFixed(2) + 'h' : '—';
      var moEst = budgetEstado(row);
      var markDisabled = !marcable(row);
      var markTitle = (moEst === 'sin_linea') ? ' title="🔴 Sin línea de Mano de Obra — corrige el destino (✎) para poder enviar"'
        : (row.confirmado ? ' title="Ya confirmada"' : (row.abierta ? ' title="Jornada abierta"' : (row.en_disputa ? ' title="⚠️ En disputa — se confirma normal pero deberá resolverse antes de nómina"' : ' title="Marca revisado para incluir en el envío"')));
      return '<tr data-att="' + row.attendance_id + '"' + (row._marcado ? ' class="ch-row-mark"' : '') + '>' +
          '<td style="color:#9aa0a6;font-size:11px;font-variant-numeric:tabular-nums" title="Attendance ID (Odoo)">' + row.attendance_id + '</td>' +
          '<td>' + esc(row.empleado_nombre || ('#' + row.empleado_id)) + '</td>' +
          '<td>' + depto + '</td>' +
          '<td>' + esc(horario) + '</td>' +
          '<td>' + horas + '</td>' +
          '<td class="cell-so">' + soCell + '</td>' +
          '<td class="cell-estado">' + estadoBadge(row) + '</td>' +
          '<td><div class="ch-actions">' +
            '<label class="ch-mark-lbl' + (markDisabled ? ' ch-mark-off' : '') + '"' + markTitle + '><input type="checkbox" class="ch-mark" data-att="' + row.attendance_id + '"' + (row._marcado ? ' checked' : '') + (markDisabled ? ' disabled' : '') + '> revisado</label>' +
            '<button class="ch-btn ch-btn-sm ch-btn-edit" data-act="editso" data-att="' + row.attendance_id + '"' + (row.abierta ? ' disabled title="Jornada abierta — sin acciones hasta que cierre"' : '') + '>✎ Corregir</button>' +
          '</div></td>' +
        '</tr>';
    }).join('');

    var ths = COLS.map(function(c){
      if(!c.sortable) return '<th' + (c.thStyle ? ' style="' + c.thStyle + '"' : '') + '>' + c.label + '</th>';
      var active = (CH.sortKey === c.key) ? ' ch-th-active' : '';
      return '<th class="ch-sortable' + active + '"' + (c.thStyle ? ' style="' + c.thStyle + '"' : '') +
        ' data-key="' + c.key + '">' + c.label + ' ' + sortInd(c.key) + '</th>';
    }).join('');

    $('tabla-zone').innerHTML =
      '<table class="ch-table"><thead><tr>' + ths + '</tr></thead><tbody>' + filas + '</tbody></table>';

    $('tabla-zone').querySelectorAll('th.ch-sortable').forEach(function(th){
      th.addEventListener('click', function(){ onHeaderClick(th.dataset.key); });
    });
    $('tabla-zone').querySelectorAll('.ch-mark').forEach(function(cb){
      cb.addEventListener('change', function(){ toggleMark(parseInt(cb.dataset.att, 10), cb.checked); });
    });
    $('tabla-zone').querySelectorAll('button[data-act="editso"]').forEach(function(b){
      b.addEventListener('click', function(){ abrirModalSO(parseInt(b.dataset.att, 10)); });
    });
    updateSendBtn();
    checkAutoPopup();
  }

  function findRow(attId){ return CH.rows.find(function(x){ return x.attendance_id === attId; }); }

  // ═══ Modelo "revisar → enviar" (dos pasos) ═══
  // El click individual solo MARCA el renglón (estado local, no escribe en Odoo, no dispara W6).
  // El botón general es la ÚNICA vía real: exige marcados, SIEMPRE muestra popup-resumen con
  // alertas visibles, y al enviar escribe en Odoo. Ese envío es el evento del W6.
  // sin_linea (server-side) sigue siendo bloqueo duro: no es marcable ni pasa con OK.
  // Disputa YA NO bloquea la confirmación diaria: el renglón en disputa se confirma normal
  // (se señala en el popup) — el bloqueo duro por disputa vive en el semáforo del distribuidor (write semanal).
  function marcable(row){ return !(row.confirmado || row.abierta || budgetEstado(row) === 'sin_linea'); }
  function marcados(){ return CH.rows.filter(function(r){ return r._marcado && marcable(r); }); }
  function pendientes(){ return CH.rows.filter(function(r){ return !r.confirmado && !r.abierta; }); }

  function toggleMark(attId, checked){
    var row = findRow(attId); if(!row) return;
    if(checked && !marcable(row)){ return; }
    row._marcado = !!checked;
    if(!checked) CH._autoDismissed = false;   // re-arma el auto-popup al desmarcar
    var tr = document.querySelector('tr[data-att="' + attId + '"]');
    if(tr){ tr.classList.toggle('ch-row-mark', row._marcado); tr.querySelector('.cell-estado').innerHTML = estadoBadge(row); }
    updateSendBtn();
    checkAutoPopup();
  }
  function updateSendBtn(){
    var btn = $('btn-tanda'); if(!btn) return;
    var n = marcados().length;
    btn.textContent = '✔ Enviar confirmación' + (n ? ' (' + n + ')' : '');
    btn.disabled = (n === 0);
  }
  function marcarTodos(){
    var any = false;
    CH.rows.forEach(function(r){ if(marcable(r) && !r._marcado){ r._marcado = true; any = true; } });
    if(any){ CH._autoDismissed = false; renderTabla(); }
    else showMsg('No hay renglones nuevos por marcar (revisa abiertas / 🔴 sin línea MO).', 'err');
  }
  // Auto-popup anti-olvido: cuando TODO lo confirmable del rango queda marcado, dispara el envío tras ~4s.
  function checkAutoPopup(){
    if(CH._autoTimer){ clearTimeout(CH._autoTimer); CH._autoTimer = null; }
    if(CH._autoDismissed) return;
    if($('pop-tanda').style.display === 'flex') return;
    var conf = CH.rows.filter(marcable);
    if(!conf.length || !conf.every(function(r){ return r._marcado; })) return;
    CH._autoTimer = setTimeout(function(){
      CH._autoTimer = null;
      var c2 = CH.rows.filter(marcable);
      if(c2.length && c2.every(function(r){ return r._marcado; }) && !CH._autoDismissed && $('pop-tanda').style.display !== 'flex'){
        confirmarEnvio(true);
      }
    }, 4000);
  }

  function actualizarFila(attId){
    var row = findRow(attId);
    var tr = document.querySelector('tr[data-att="' + attId + '"]');
    if(!row || !tr) return;
    tr.querySelector('.cell-estado').innerHTML = estadoBadge(row);
    tr.querySelector('.cell-so').innerHTML = soCellHtml(row);
    var cb = tr.querySelector('.ch-mark');
    if(cb){ cb.checked = !!row._marcado; cb.disabled = !marcable(row); }
    tr.classList.toggle('ch-row-mark', !!row._marcado);
    var conf = CH.rows.filter(function(x){ return x.confirmado; }).length;
    $('ch-summary').textContent = CH.rows.length + ' registro(s) · ' + conf +
      ' confirmado(s) · ' + (CH.rows.length - conf) + ' pendiente(s)';
    updateSendBtn();
  }

  // ─── Envío: única vía de confirmación real. SIEMPRE popup-resumen con alertas visibles. ───
  function confirmarEnvio(auto){
    clearMsg();
    var marked = marcados();
    if(!marked.length){ if(!auto) showMsg('No hay nada marcado para enviar. Marca (revisado) los renglones que quieras confirmar.', 'err'); return; }
    var pend = pendientes();
    var sinMarcar = pend.filter(function(r){ return !r._marcado && marcable(r); });
    var sinLinea = pend.filter(function(r){ return budgetEstado(r) === 'sin_linea'; });
    abrirPopupEnvio(marked, sinMarcar, sinLinea, auto === true);
  }
  function flagsRow(r){
    var s = '', e = budgetEstado(r);
    if(r.en_disputa) s += '⚖️';
    if(esCrossProy(r)) s += '⚠️';
    if(e === 'placeholder' || e === 'agotado') s += '🟠';
    if(e === 'sin_linea') s += '🔴';
    return s;
  }
  function popFilas(arr){
    return arr.map(function(r){
      var fl = flagsRow(r);
      return '<tr><td>' + (fl ? fl + ' ' : '') + esc(r.empleado_nombre||'') + '</td><td>' + esc(r.department_name||'') + '</td><td>' +
        esc(labelAtribucion(r)) + '</td><td style="text-align:right">' + (r.worked_hours!=null? r.worked_hours.toFixed(2)+'h':'—') + '</td></tr>';
    }).join('');
  }
  function abrirPopupEnvio(marked, sinMarcar, sinLinea, auto){
    var cross = marked.filter(esCrossProy);
    var warn = marked.filter(function(r){ var e = budgetEstado(r); return e === 'placeholder' || e === 'agotado'; });
    var disp = marked.filter(function(r){ return r.en_disputa; });
    var intro = auto
      ? '<p style="color:#1a4480;font-weight:600">✅ Todos los registros del rango están pre-confirmados — ¿enviar confirmación?</p><p>Se enviarán <b>' + marked.length + '</b> registro(s):</p>'
      : '<p>Vas a <b>enviar la confirmación</b> de <b>' + marked.length + '</b> registro(s):</p>';
    var html = intro +
      '<table class="ch-pop-tbl"><thead><tr><th>Empleado</th><th>Depto</th><th>Destino</th><th>Hrs</th></tr></thead><tbody>' + popFilas(marked) + '</tbody></table>';
    var alertas = [];
    if(cross.length) alertas.push('⚠️ <b>' + cross.length + '</b> de otro depto cargando a proyecto');
    if(warn.length)  alertas.push('🟠 <b>' + warn.length + '</b> con MO sin fondos / agotada (se registra el sobrecosto)');
    if(disp.length)  alertas.push('⚖️ <b>' + disp.length + '</b> en disputa — se confirman pero deberán resolverse antes de nómina');
    if(alertas.length){
      html += '<p style="color:#8a5a12;font-size:12px;background:#fff3df;padding:8px 10px;border-radius:8px">Alertas de lo que envías: ' + alertas.join(' · ') + '</p>';
    } else {
      html += '<p style="color:#1a7a3a;font-size:12px">Sin alertas en lo marcado.</p>';
    }
    if(sinMarcar.length){
      html += '<p style="color:#555;font-size:12px">↩ Quedan <b>' + sinMarcar.length + '</b> pendiente(s) sin marcar — NO se enviarán.</p>';
    }
    if(sinLinea.length){
      html += '<p style="color:#b3261e;font-size:12px">🔴 <b>' + sinLinea.length + '</b> con sin línea de Mano de Obra — no se pueden enviar; corrige su destino (✎).</p>';
    }
    $('pop-tanda-body').innerHTML = html;
    CH._envioPend = marked.map(function(r){ return r.attendance_id; });
    $('pop-tanda').style.display = 'flex';
  }
  function cerrarPopupEnvio(){ $('pop-tanda').style.display = 'none'; CH._envioPend = null; CH._autoDismissed = true; }
  function enviarLote(atts){
    if(!atts || !atts.length){ showMsg('No había nada marcado para enviar.', 'err'); return; }
    var total = atts.length, ok = 0, fail = 0, blocked = 0, i = 0;
    showMsg('Enviando confirmación de ' + total + ' registro(s)…', 'ok');
    function next(){
      if(i >= atts.length){
        var extra = [];
        if(blocked) extra.push(blocked + ' bloqueado(s)');
        if(fail) extra.push(fail + ' con error');
        var msg = ok ? ('✓ Confirmación enviada — ' + ok + ' registro(s)' + (extra.length ? (' · ' + extra.join(' · ')) : ''))
                     : ('❌ No se envió ninguno' + (extra.length ? (' — ' + extra.join(' · ')) : ''));
        showMsg(msg, (fail || blocked || !ok) ? 'err' : 'ok');
        CH._autoDismissed = false;   // re-arma para un siguiente marcado completo
        return;
      }
      var att = atts[i++];
      var row = findRow(att); var est = budgetEstado(row); var ack = {};
      if(est === 'placeholder') ack.ack_mo_placeholder = true;
      else if(est === 'agotado') ack.ack_mo_agotado = true;
      n8n('/webhook/planeacion/confirmar-horas', Object.assign({ attendance_id: att, action: 'confirm', origen: 'envio', supervisor_nombre: CH.supervisor }, ack))
        .then(function(data){
          var r = Array.isArray(data) ? data[0] : data;
          if(r && (r.bloqueo || r.needs_ack)){ blocked++; return; }
          if(!r || r.success === false) throw new Error();
          if(row){ row.confirmado = true; row._marcado = false; }
          actualizarFila(att); ok++;
        })
        .catch(function(){ fail++; })
        .finally(next);
    }
    next();
  }

  // ─── Modal corregir atribución (proyecto O bolsa) ───
  function abrirModalSO(attId){
    CH.modalAttId = attId;
    var row = findRow(attId);
    $('modal-so-title').textContent = 'Corregir atribución — ' + ((row && row.empleado_nombre) || ('att ' + attId)) +
      ' · actual: ' + labelAtribucion(row);
    $('modal-so-search').value = '';
    $('modal-so').style.display = 'flex';
    $('modal-so-search').focus();
    cargarSOs().then(function(){ renderSOList(''); });
  }
  function cerrarModalSO(){ $('modal-so').style.display = 'none'; CH.modalAttId = null; }

  function cargarSOs(){
    if(CH.sos) return Promise.resolve(CH.sos);
    if(CH.sosCargando) return Promise.resolve([]);
    CH.sosCargando = true;
    $('modal-so-list').innerHTML = '<div class="ch-placeholder">⏳ Cargando SOs…</div>';
    return n8n('/webhook/kiosk/sos', { company_id: COMPANY_ID }).then(function(data){
      var arr = Array.isArray(data) ? data : (data && data.sos) || [];
      CH.sos = arr.map(function(s){
        return { id: s.id, nombre: s.nombre || s.name || ('SO ' + s.id), cliente: s.cliente || '' };
      }).filter(function(s){ return s.id != null; });
      return CH.sos;
    }).catch(function(e){
      $('modal-so-list').innerHTML = '<div class="ch-placeholder">❌ ' + esc(e.message) + '</div>';
      return [];
    }).finally(function(){ CH.sosCargando = false; });
  }

  // Dos grupos: 🗂️ Bolsas (fijas) + 🛠️ Proyectos (de /kiosk/sos). El buscador filtra ambos.
  function renderSOList(q){
    var nq = q ? q.toLowerCase() : '';
    var curRow = findRow(CH.modalAttId);
    var soloB = !!(curRow && curRow.solo_bolsa);   // #2a: solo_bolsa → sólo bolsas, sin proyectos
    var bolsas = BOLSAS.filter(function(b){ return !nq || b.nombre.toLowerCase().indexOf(nq) !== -1; });
    var proys = (CH.sos || []).filter(function(s){
      return !nq || (s.nombre || '').toLowerCase().indexOf(nq) !== -1 ||
                    (s.cliente || '').toLowerCase().indexOf(nq) !== -1;
    });
    var html = '';
    if(soloB){
      html += '<div class="ch-lock-note">🔒 Empleado <b>solo-bolsa</b>: su costo va fijo a su bolsa. Sólo se puede corregir entre bolsas (sin proyectos).</div>';
    }
    if(bolsas.length){
      html += '<div class="ch-grp">🗂️ Bolsas (cuenta indirecta)</div>';
      html += bolsas.map(function(b){
        return '<div class="ch-so-item ch-item-bolsa" data-tipo="bolsa" data-id="' + b.id + '" data-nombre="' + esc(b.nombre) + '">' +
          '<div class="n">🗂️ ' + esc(b.nombre) + '</div></div>';
      }).join('');
    }
    if(!soloB){
      html += '<div class="ch-grp">🛠️ Proyectos</div>';
      if(!proys.length){ html += '<div class="ch-placeholder">Sin proyectos que coincidan</div>'; }
      else html += proys.slice(0, 40).map(function(s){
        return '<div class="ch-so-item" data-tipo="proyecto" data-id="' + s.id + '" data-nombre="' + esc(s.nombre) + '">' +
          '<div class="n">' + esc(s.nombre) + '</div>' +
          (s.cliente ? '<div class="c">' + esc(s.cliente) + '</div>' : '') +
        '</div>';
      }).join('');
    }
    $('modal-so-list').innerHTML = html;
    $('modal-so-list').querySelectorAll('.ch-so-item').forEach(function(it){
      it.addEventListener('click', function(){
        corregir(CH.modalAttId, it.dataset.tipo, parseInt(it.dataset.id, 10), it.dataset.nombre);
      });
    });
  }

  // Corrección con excluyencia mutua → planeacion/corregir-bolsa. Escribe manager_approval=true.
  function corregir(attId, tipo, id, nombre){
    if(!attId || !id || !tipo) return;
    var row = findRow(attId);
    var esBolsa = tipo === 'bolsa';
    var origen = (row && row.cuenta_id) ? 'bolsa' : ((row && row.so_id) ? 'proyecto' : 'nada');
    var payload = {
      attendance_id: attId,
      action: esBolsa ? 'correct_bolsa' : 'correct_so',
      target_nombre: nombre,
      prev_label: labelAtribucion(row),
      tipo_correccion: origen + '_a_' + tipo,
      supervisor_nombre: CH.supervisor
    };
    if(esBolsa) payload.cuenta_id = id; else payload.so_id = id;
    $('modal-so-list').innerHTML = '<div class="ch-placeholder">⏳ Guardando…</div>';
    n8n(CORREGIR_URL, payload).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(!r || r.success === false) throw new Error((r && r.mensaje) || 'Error');
      if(row){
        if(esBolsa){ row.cuenta_id = id; row.cuenta_nombre = nombre; row.so_id = null; row.so_nombre = ''; }
        else { row.so_id = id; row.so_nombre = nombre; row.cuenta_id = null; row.cuenta_nombre = ''; }
        row.confirmado = true;
      }
      actualizarFila(attId);
      cerrarModalSO();
      showMsg('✓ ' + (esBolsa ? 'Bolsa' : 'Proyecto') + ' asignado: ' + nombre + ' y horas confirmadas', 'ok');
    }).catch(function(e){
      $('modal-so-list').innerHTML = '<div class="ch-placeholder">❌ ' + esc(e.message) + '</div>';
    });
  }

  // ─── Auth gate + bootstrap ───
  function denyAccess(reason){
    $('auth-gate').style.display = 'block';
    $('auth-gate').innerHTML = '<h2>🔒 Acceso restringido</h2><p>' + esc(reason) +
      '</p><a href="../index.html">Volver a Operaciones</a>';
  }

  document.addEventListener('DOMContentLoaded', function(){
    $('ch-build').textContent = 'build ' + BUILD;

    if(!window.FTSAuth || !window.FTSAuth.isLoggedIn()){
      window.location.href = '../../index.html';
      return;
    }
    var session = window.FTSAuth.getSession();
    if(!session){ window.location.href = '../../index.html'; return; }
    try { window.FTSAuth.initActivityTracking && window.FTSAuth.initActivityTracking(); } catch(e){}

    CH.supervisor = session.nombre || session.username || 'Supervisor';
    $('ch-user-nombre').textContent = '👤 ' + CH.supervisor;

    var isMaster = session.role === 'master' || session.modulos === 'all';
    var isFelipe = session.username === 'felipe.perez';
    if(!isMaster && !isFelipe){
      denyAccess('Solo Felipe Pérez (Supervisor Operaciones) o ftsmaster pueden confirmar horas.');
      return;
    }

    $('main-content').style.display = 'block';

    // Default: ayer (CST)
    var ayer = ymd(ayerCST());
    $('f-desde').value = ayer;
    $('f-hasta').value = ayer;

    $('btn-cargar').addEventListener('click', cargar);
    var btnTanda = $('btn-tanda'); if(btnTanda) btnTanda.addEventListener('click', function(){ confirmarEnvio(false); });
    var btnMarcar = $('btn-marcar-todos'); if(btnMarcar) btnMarcar.addEventListener('click', marcarTodos);
    var pcancel = $('pop-tanda-cancel'); if(pcancel) pcancel.addEventListener('click', cerrarPopupEnvio);
    var pcancel2 = $('pop-tanda-cancel2'); if(pcancel2) pcancel2.addEventListener('click', cerrarPopupEnvio);
    var pconfirm = $('pop-tanda-confirm'); if(pconfirm) pconfirm.addEventListener('click', function(){ var a = CH._envioPend; cerrarPopupEnvio(); enviarLote(a); });
    var pop = $('pop-tanda'); if(pop) pop.addEventListener('click', function(e){ if(e.target.id === 'pop-tanda') cerrarPopupEnvio(); });
    $('modal-so-close').addEventListener('click', cerrarModalSO);
    $('modal-so').addEventListener('click', function(e){ if(e.target.id === 'modal-so') cerrarModalSO(); });
    $('modal-so-search').addEventListener('input', function(e){ renderSOList(e.target.value); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') cerrarModalSO(); });

    // Carga inicial automática (ayer)
    cargar();
  });
})();
