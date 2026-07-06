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

  var CH = {
    rows: [],
    sos: null,            // cache lista SO (lazy)
    sosCargando: false,
    supervisor: 'Supervisor',
    modalAttId: null
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
    if(row.en_disputa) return '<span class="ch-badge b-disp">⚠ En disputa</span>';
    if(row.abierta)    return '<span class="ch-badge b-open">⏳ Abierta</span>';
    if(row.confirmado) return '<span class="ch-badge b-ok">✓ Confirmada</span>';
    return '<span class="ch-badge b-pend">Pendiente</span>';
  }

  function renderTabla(){
    if(!CH.rows.length){
      $('tabla-zone').innerHTML = '<div class="ch-placeholder">Sin registros en el rango.</div>';
      return;
    }
    var filas = CH.rows.map(function(row){
      var so = row.so_id
        ? esc(row.so_nombre || ('SO ' + row.so_id))
        : '<span class="ch-sinso">⚠ Sin SO</span>';
      var horario = (row.check_in_cst || '—') + (row.check_out_cst ? ' → ' + row.check_out_cst.slice(11) : ' → …');
      var horas = row.worked_hours != null ? row.worked_hours.toFixed(2) + 'h' : '—';
      var confirmarDisabled = (row.confirmado || row.en_disputa || row.abierta) ? ' disabled' : '';
      return '<tr data-att="' + row.attendance_id + '">' +
          '<td style="color:#9aa0a6;font-size:11px;font-variant-numeric:tabular-nums" title="Attendance ID (Odoo)">' + row.attendance_id + '</td>' +
          '<td>' + esc(row.empleado_nombre || ('#' + row.empleado_id)) + '</td>' +
          '<td>' + esc(horario) + '</td>' +
          '<td>' + horas + '</td>' +
          '<td class="cell-so">' + so + '</td>' +
          '<td class="cell-estado">' + estadoBadge(row) + '</td>' +
          '<td><div class="ch-actions">' +
            '<button class="ch-btn ch-btn-sm ch-btn-ok" data-act="confirm" data-att="' + row.attendance_id + '"' + confirmarDisabled + '>✔ Confirmar</button>' +
            '<button class="ch-btn ch-btn-sm ch-btn-edit" data-act="editso" data-att="' + row.attendance_id + '">✎ SO</button>' +
          '</div></td>' +
        '</tr>';
    }).join('');

    $('tabla-zone').innerHTML =
      '<table class="ch-table"><thead><tr>' +
        '<th style="width:56px">ID</th><th>Empleado</th><th>Entrada → Salida (CST)</th><th>Horas</th><th>SO</th><th>Estado</th><th>Acciones</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table>';

    $('tabla-zone').querySelectorAll('button[data-act]').forEach(function(b){
      b.addEventListener('click', function(){
        var att = parseInt(b.dataset.att, 10);
        if(b.dataset.act === 'confirm') confirmar(att, b);
        else abrirModalSO(att);
      });
    });
  }

  function findRow(attId){ return CH.rows.find(function(x){ return x.attendance_id === attId; }); }

  // ─── Confirmar horas (set manager_approval) ───
  function confirmar(attId, btn){
    clearMsg();
    if(btn){ btn.disabled = true; btn.textContent = '⏳'; }
    n8n('/webhook/planeacion/confirmar-horas', {
      attendance_id: attId, action: 'confirm', supervisor_nombre: CH.supervisor
    }).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(!r || r.success === false) throw new Error((r && r.mensaje) || 'Error');
      // Éxito confirmado por el backend → recién ahora actualizamos UI (anti #15)
      var row = findRow(attId);
      if(row) row.confirmado = true;
      actualizarFila(attId);
      showMsg('✓ Horas confirmadas (att ' + attId + ')', 'ok');
    }).catch(function(e){
      showMsg('❌ No se pudo confirmar: ' + e.message, 'err');
      if(btn){ btn.disabled = false; btn.textContent = '✔ Confirmar'; }
    });
  }

  function actualizarFila(attId){
    var row = findRow(attId);
    var tr = document.querySelector('tr[data-att="' + attId + '"]');
    if(!row || !tr) return;
    tr.querySelector('.cell-estado').innerHTML = estadoBadge(row);
    tr.querySelector('.cell-so').innerHTML = row.so_id
      ? esc(row.so_nombre || ('SO ' + row.so_id))
      : '<span class="ch-sinso">⚠ Sin SO</span>';
    var btnC = tr.querySelector('button[data-act="confirm"]');
    if(btnC){
      var dis = (row.confirmado || row.en_disputa || row.abierta);
      btnC.disabled = dis;
      btnC.textContent = '✔ Confirmar';
    }
    var conf = CH.rows.filter(function(x){ return x.confirmado; }).length;
    $('ch-summary').textContent = CH.rows.length + ' registro(s) · ' + conf +
      ' confirmado(s) · ' + (CH.rows.length - conf) + ' pendiente(s)';
  }

  // ─── Modal corregir SO ───
  function abrirModalSO(attId){
    CH.modalAttId = attId;
    var row = findRow(attId);
    $('modal-so-title').textContent = 'Corregir SO — ' + ((row && row.empleado_nombre) || ('att ' + attId));
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

  function renderSOList(q){
    var lista = CH.sos || [];
    var nq = q ? q.toLowerCase() : '';
    if(nq) lista = lista.filter(function(s){
      return (s.nombre || '').toLowerCase().indexOf(nq) !== -1 ||
             (s.cliente || '').toLowerCase().indexOf(nq) !== -1;
    });
    if(!lista.length){ $('modal-so-list').innerHTML = '<div class="ch-placeholder">Sin resultados</div>'; return; }
    $('modal-so-list').innerHTML = lista.slice(0, 40).map(function(s){
      return '<div class="ch-so-item" data-so="' + s.id + '">' +
        '<div class="n">' + esc(s.nombre) + '</div>' +
        (s.cliente ? '<div class="c">' + esc(s.cliente) + '</div>' : '') +
      '</div>';
    }).join('');
    $('modal-so-list').querySelectorAll('.ch-so-item').forEach(function(it){
      it.addEventListener('click', function(){ corregirSO(CH.modalAttId, parseInt(it.dataset.so, 10)); });
    });
  }

  function corregirSO(attId, soId){
    if(!attId || !soId) return;
    var so = (CH.sos || []).find(function(s){ return s.id === soId; });
    $('modal-so-list').innerHTML = '<div class="ch-placeholder">⏳ Guardando…</div>';
    n8n('/webhook/planeacion/confirmar-horas', {
      attendance_id: attId, action: 'correct_so', so_id: soId, supervisor_nombre: CH.supervisor
    }).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(!r || r.success === false) throw new Error((r && r.mensaje) || 'Error');
      var row = findRow(attId);
      if(row){ row.so_id = soId; row.so_nombre = so ? so.nombre : ('SO ' + soId); row.confirmado = true; }
      actualizarFila(attId);
      cerrarModalSO();
      showMsg('✓ SO corregida a ' + (so ? so.nombre : soId) + ' y horas confirmadas', 'ok');
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
    $('modal-so-close').addEventListener('click', cerrarModalSO);
    $('modal-so').addEventListener('click', function(e){ if(e.target.id === 'modal-so') cerrarModalSO(); });
    $('modal-so-search').addEventListener('input', function(e){ renderSOList(e.target.value); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') cerrarModalSO(); });

    // Carga inicial automática (ayer)
    cargar();
  });
})();
