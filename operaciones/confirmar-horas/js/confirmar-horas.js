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
    return '<span class="ch-sinso">⚠ Sin atribución</span>';
  }
  // Etiqueta de la atribución ACTUAL (para prev_label del chatter).
  function labelAtribucion(row){
    if(!row) return '(sin atribución)';
    if(row.so_id) return row.so_nombre || ('Proy ' + row.so_id);
    if(row.cuenta_id) return row.cuenta_nombre || ('Bolsa ' + row.cuenta_id);
    return '(sin atribución)';
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
      var so = celdaAtribucion(row);
      var depto = row.department_name
        ? (row.es_operaciones === false
            ? '<span class="ch-depto-cross" title="Cargó horas a un proyecto siendo de otro depto">' + esc(row.department_name) + '</span>'
            : esc(row.department_name))
        : '—';
      var horario = (row.check_in_cst || '—') + (row.check_out_cst ? ' → ' + row.check_out_cst.slice(11) : ' → …');
      var horas = row.worked_hours != null ? row.worked_hours.toFixed(2) + 'h' : '—';
      var confirmarDisabled = (row.confirmado || row.en_disputa || row.abierta) ? ' disabled' : '';
      return '<tr data-att="' + row.attendance_id + '">' +
          '<td style="color:#9aa0a6;font-size:11px;font-variant-numeric:tabular-nums" title="Attendance ID (Odoo)">' + row.attendance_id + '</td>' +
          '<td>' + esc(row.empleado_nombre || ('#' + row.empleado_id)) + '</td>' +
          '<td>' + depto + '</td>' +
          '<td>' + esc(horario) + '</td>' +
          '<td>' + horas + '</td>' +
          '<td class="cell-so">' + so + '</td>' +
          '<td class="cell-estado">' + estadoBadge(row) + '</td>' +
          '<td><div class="ch-actions">' +
            '<button class="ch-btn ch-btn-sm ch-btn-ok" data-act="confirm" data-att="' + row.attendance_id + '"' + confirmarDisabled + '>✔ Confirmar</button>' +
            '<button class="ch-btn ch-btn-sm ch-btn-edit" data-act="editso" data-att="' + row.attendance_id + '">✎ Corregir</button>' +
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
    tr.querySelector('.cell-so').innerHTML = celdaAtribucion(row);
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
    var bolsas = BOLSAS.filter(function(b){ return !nq || b.nombre.toLowerCase().indexOf(nq) !== -1; });
    var proys = (CH.sos || []).filter(function(s){
      return !nq || (s.nombre || '').toLowerCase().indexOf(nq) !== -1 ||
                    (s.cliente || '').toLowerCase().indexOf(nq) !== -1;
    });
    var html = '';
    if(bolsas.length){
      html += '<div class="ch-grp">🗂️ Bolsas (cuenta indirecta)</div>';
      html += bolsas.map(function(b){
        return '<div class="ch-so-item ch-item-bolsa" data-tipo="bolsa" data-id="' + b.id + '" data-nombre="' + esc(b.nombre) + '">' +
          '<div class="n">🗂️ ' + esc(b.nombre) + '</div></div>';
      }).join('');
    }
    html += '<div class="ch-grp">🛠️ Proyectos</div>';
    if(!proys.length){ html += '<div class="ch-placeholder">Sin proyectos que coincidan</div>'; }
    else html += proys.slice(0, 40).map(function(s){
      return '<div class="ch-so-item" data-tipo="proyecto" data-id="' + s.id + '" data-nombre="' + esc(s.nombre) + '">' +
        '<div class="n">' + esc(s.nombre) + '</div>' +
        (s.cliente ? '<div class="c">' + esc(s.cliente) + '</div>' : '') +
      '</div>';
    }).join('');
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
    $('modal-so-close').addEventListener('click', cerrarModalSO);
    $('modal-so').addEventListener('click', function(e){ if(e.target.id === 'modal-so') cerrarModalSO(); });
    $('modal-so-search').addEventListener('input', function(e){ renderSOList(e.target.value); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') cerrarModalSO(); });

    // Carga inicial automática (ayer)
    cargar();
  });
})();
