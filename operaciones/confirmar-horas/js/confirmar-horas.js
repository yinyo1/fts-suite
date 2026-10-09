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

  // ═══ TIPO DE DÍA (#396 fase a) ═══════════════════════════════════════════
  // Quién paga el día: México (México / Viaje a México) o FTS USA (Proyecto USA /
  // Viaje a USA). Lo propone el sistema con la zona de la entrada y la de la salida
  // (o, sin zona, con la empresa del proyecto) y Felipe lo confirma o lo cambia aquí.
  // Vive en Postgres (asistencia.*), NO en Odoo: a Odoo sólo va una nota al chatter.
  //
  // MITAD TOLERANTE. Las columnas Zona y Tipo sólo aparecen si asistencia/eventos
  // contesta; si no (workflow sin publicar, Postgres caído) la pantalla es la de hoy y
  // se confirma como siempre. Y si al enviar el tipo no se puede GUARDAR por la red, la
  // confirmación sigue: el día sale pendiente en el reporte de RH, que es donde se ve.
  // Lo que SÍ detiene un renglón es una regla: viaje sin cargo o día que paga México
  // cargado a una SO de FTS USA.
  var EVENTOS_URL = '/webhook/asistencia/eventos';
  var TIPO_URL = '/webhook/asistencia/tipo-dia';
  var CTA_RECOBRO = { id: 3096, nombre: 'ADMIN DE OPERACIONES' };   // D-7
  var TIPOS = [
    { k: 'mexico',       t: 'México',         paga: 'mx'  },
    { k: 'viaje_mexico', t: 'Viaje a México', paga: 'mx'  },
    { k: 'proyecto_usa', t: 'Proyecto USA',   paga: 'usa' },
    { k: 'viaje_usa',    t: 'Viaje a USA',    paga: 'usa' }
  ];
  function tipoTxt(k){ for(var i=0;i<TIPOS.length;i++){ if(TIPOS[i].k === k) return TIPOS[i].t; } return ''; }
  function esViajeTipo(k){ return k === 'viaje_usa' || k === 'viaje_mexico'; }
  function paisZona(z){ if(!z) return null; return String(z).trim().toLowerCase() === 'usa' ? 'usa' : 'mx'; }
  function tipoDe(row){ return (row && (row._tipoSel || (row._ev && (row._ev.tipo_dia || row._ev.tipo_dia_propuesto)))) || null; }
  function soCompania(row){
    if(!row || !row.so_id) return null;
    if(row._soCompany) return row._soCompany;
    var s = (CH.sos || []).filter(function(x){ return x.id === row.so_id; })[0];
    return s ? s.company_id : null;
  }
  // D-7: Viaje a México con SO de FTS USA → se carga a 3096 con recobro a USA.
  function requiereRecobro(row){ return tipoDe(row) === 'viaje_mexico' && soCompania(row) === 6; }
  function viajeSinCargo(row){ return esViajeTipo(tipoDe(row)) && !row.so_id && !row.cuenta_id && !precargaDe(row); }
  function mexicoConSoUsa(row){ return tipoDe(row) === 'mexico' && soCompania(row) === 6; }

  // ═══ PRECARGA DE DESTINO ═══════════════════════════════════════════════
  // EL PROBLEMA. Hoy se puede confirmar un renglón SIN destino: el semáforo lo
  // cuenta como listo y su dinero no sabe a dónde ir. Pasó tres veces en septiembre
  // (att 15272, 15353, 15505). Y para la mitad de la gente el destino nunca cambia:
  // medido del 17-jul en adelante, 14 personas llevan 9 semanas con CERO horas a
  // proyecto. Elegir cada día lo que nunca cambia es el trabajo que produce el hueco.
  //
  // QUÉ HACE. Al renglón sin destino de esa gente le llega el suyo YA PROPUESTO, y al
  // confirmar se escribe junto con la aprobación. Felipe sigue confirmando —que es el
  // control— pero deja de elegir lo que nunca cambia.
  //
  // EL DISPARADOR ES LA MARCA `solo_bolsa`, NO LA CUENTA. Tres personas con cuenta
  // default poblada SÍ van a obra (Francisco Montalvo 8, Jesús Montalvo 68, Mateo
  // Salazar 75) y ninguna tiene la marca. Precargar "por tener cuenta" las costearía
  // mal en silencio; precargar por la marca no falla contra el histórico medido.
  //
  // ⚠️ APAGADA. Se enciende con ?precarga=1 —y entonces la pantalla lo anuncia— para
  // poder mirarla antes de que escriba nada. Opt-in explícito, convención de
  // docs/FEATURE_FLAGS.md: un default opt-out convierte a cualquiera en cobaya.
  var PRECARGA_ACTIVA = false;
  function precargaEncendida(){
    if(PRECARGA_ACTIVA) return true;
    try { return /[?&]precarga=1(&|$)/.test(window.location.search); } catch(e){ return false; }
  }

  // LA MARCA PUEDE ESTAR MAL PUESTA, y el panel puede darse cuenta solo. Si alguien
  // marca solo_bolsa a quien sí va a obra, sus OTROS renglones del mismo rango traen
  // proyecto: la contradicción está en la pantalla. Cuando aparece NO se precarga
  // nada y se dice — es preferible el hueco de hoy, que se ve, a un destino inventado
  // con cara de dato de Odoo.
  function contradiceSoloBolsa(row){
    // Bajo el MISMO interruptor que la precarga, y no por pereza: esta señal existe
    // para frenarla. Con la precarga apagada la pantalla de Felipe tiene que ser
    // exactamente la de hoy — ni un marcador nuevo que nadie le explicó.
    if(!precargaEncendida()) return false;
    if(!row || row.solo_bolsa !== true) return false;
    for(var i = 0; i < CH.rows.length; i++){
      var o = CH.rows[i];
      if(o.empleado_id === row.empleado_id && o.so_id) return true;
    }
    return false;
  }

  // Devuelve {id, nombre} o null. Cinco candados, y el orden importa: primero lo que
  // YA tiene destino (jamás se toca), al final lo que el servidor no mandó.
  function precargaDe(row){
    if(!precargaEncendida() || !row) return null;
    if(row.confirmado || row.abierta) return null;   // no se propone sobre lo ya cerrado ni lo que sigue corriendo
    if(row.so_id || row.cuenta_id) return null;      // tiene destino: no es nuestro
    if(row.solo_bolsa !== true) return null;         // la marca, no la cuenta
    if(contradiceSoloBolsa(row)) return null;        // la marca se contradice con su propio rango
    if(!row.cuenta_default_id) return null;          // el servidor no lo mandó → no se inventa
    return { id: row.cuenta_default_id,
             nombre: row.cuenta_default_nombre || ('Bolsa ' + row.cuenta_default_id) };
  }
  function hayPrecarga(row){ return !!precargaDe(row); }

  // Celda de atribución: proyecto (🛠️) > bolsa (🗂️) > propuesta > sin atribución.
  function celdaAtribucion(row){
    if(row.so_id) return esc(row.so_nombre || ('Proy ' + row.so_id));
    if(row.cuenta_id) return '<span class="ch-bolsa">🗂️ ' + esc(row.cuenta_nombre || ('Bolsa ' + row.cuenta_id)) + '</span>';
    if(row.abierta) return '<span style="color:#999">— (en curso)</span>';   // PR-6: abierta sin atribución aún ≠ hueco
    // La propuesta se pinta DISTINTA del destino real a propósito: lo que viene de
    // Odoo y lo que todavía no está escrito no pueden verse igual (CLAUDE.md §8).
    var pre = precargaDe(row);
    if(pre) return '<span class="ch-pre" title="Propuesta por su marca solo-bolsa. Todavía NO está en Odoo: se escribe al confirmar.">🗂️ ' +
      esc(pre.nombre) + '</span> <span class="ch-tag-pre">propuesta</span>';
    // La contradicción va con PALABRAS, no con un glifo: al lado ya hay un 🔒 (la
    // marca solo-bolsa) y dos candados juntos no se distinguen de un vistazo.
    if(contradiceSoloBolsa(row)) return '<span class="ch-sinso">⚠ Sin atribución</span> ' +
      '<span class="ch-contra" title="Marcado solo-bolsa y con renglones a proyecto en este mismo rango: la marca no cuadra. No se propone nada hasta aclararlo en Odoo.">marca en duda</span>';
    return '<span class="ch-sinso">⚠ Sin atribución</span>';
  }
  // Etiqueta de la atribución ACTUAL (para prev_label del chatter).
  function labelAtribucion(row){
    if(!row) return '(sin atribución)';
    if(row.so_id) return row.so_nombre || ('Proy ' + row.so_id);
    if(row.cuenta_id) return row.cuenta_nombre || ('Bolsa ' + row.cuenta_id);
    return '(sin atribución)';
  }

  // Lo que va a QUEDAR escrito si se confirma este renglón. Distinto de
  // labelAtribucion, que dice lo que tiene HOY: el popup tiene que enseñar lo que se
  // va a escribir, no lo que había.
  function labelDestinoAEscribir(row){
    var pre = precargaDe(row);
    if(pre) return '🗂️ ' + pre.nombre + ' · propuesta';
    return labelAtribucion(row);
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
    sortDir: 'asc',
    tipoActivo: false     // #396: hay zona y tipo de día (asistencia/eventos contestó)
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

  function showMsg(texto, tipo, persist){
    var el = $('ch-msg');
    if(!el) return;
    el.textContent = texto;
    el.className = 'ch-msg ' + (tipo === 'ok' ? 'ch-msg-ok' : 'ch-msg-err');
    el.style.display = 'block';
    if(tipo === 'ok' && !persist) setTimeout(function(){ el.style.display = 'none'; }, 4000);
  }
  function clearMsg(){ var el = $('ch-msg'); if(el) el.style.display = 'none'; }
  // Overlay de progreso del envío (batch invisible -> visible)
  function showOverlay(t){ var o = $('ch-overlay'); if(o){ var x = $('ch-overlay-text'); if(x) x.textContent = t; o.style.display = 'flex'; } }
  function updateOverlay(t){ var x = $('ch-overlay-text'); if(x) x.textContent = t; }
  function hideOverlay(){ var o = $('ch-overlay'); if(o) o.style.display = 'none'; }

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
        CH.tipoActivo = false;
        renderTabla();
        cargarEventos();
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
    { key:'zona',     label:'Zona',                   sortable:true,  type:'str', tipo:true, get:function(r){ return zonaTxt(r); } },
    { key:'tipodia',  label:'Tipo de día',            sortable:true,  type:'str', tipo:true, get:function(r){ return tipoTxt(tipoDe(r)); } },
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

  function colsVisibles(){ return COLS.filter(function(c){ return !c.tipo || CH.tipoActivo; }); }

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
          (CH.tipoActivo ? '<td class="cell-zona">' + zonaHtml(row) + '</td><td class="cell-tipo">' + tipoHtml(row) + '</td>' : '') +
          '<td class="cell-so">' + soCell + '</td>' +
          '<td class="cell-estado">' + estadoBadge(row) + '</td>' +
          '<td><div class="ch-actions">' +
            '<label class="ch-mark-lbl' + (markDisabled ? ' ch-mark-off' : '') + '"' + markTitle + '><input type="checkbox" class="ch-mark" data-att="' + row.attendance_id + '"' + (row._marcado ? ' checked' : '') + (markDisabled ? ' disabled' : '') + '> revisado</label>' +
            '<button class="ch-btn ch-btn-sm ch-btn-edit" data-act="editso" data-att="' + row.attendance_id + '"' + (row.abierta ? ' disabled title="Jornada abierta — sin acciones hasta que cierre"' : '') + '>✎ Corregir</button>' +
          '</div></td>' +
        '</tr>';
    }).join('');

    var ths = colsVisibles().map(function(c){
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
    $('tabla-zone').querySelectorAll('select.ch-tipo').forEach(function(sel){
      sel.addEventListener('change', function(){ cambiarTipo(parseInt(sel.dataset.att, 10), sel.value); });
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
  function modalAbierto(){ return $('pop-tanda').style.display === 'flex' || $('modal-so').style.display === 'flex'; }
  function checkAutoPopup(){
    if(CH._autoTimer){ clearTimeout(CH._autoTimer); CH._autoTimer = null; }
    if(modalAbierto()) return;
    var conf = CH.rows.filter(marcable);   // disputa CUENTA (marcable por la regla nueva)
    var allMarked = conf.length && conf.every(function(r){ return r._marcado; });
    if(!allMarked){ CH._autoDismissed = false; return; }   // estado parcial re-arma el disparador
    if(CH._autoDismissed) return;                          // ya se mostró/canceló para este set completo
    CH._autoTimer = setTimeout(function(){
      CH._autoTimer = null;
      var c2 = CH.rows.filter(marcable);
      if(c2.length && c2.every(function(r){ return r._marcado; }) && !CH._autoDismissed && !modalAbierto()){
        confirmarEnvio(true);
      }
    }, 2000);
  }

  function actualizarFila(attId){
    var row = findRow(attId);
    var tr = document.querySelector('tr[data-att="' + attId + '"]');
    if(!row || !tr) return;
    tr.querySelector('.cell-estado').innerHTML = estadoBadge(row);
    tr.querySelector('.cell-so').innerHTML = soCellHtml(row);
    if(CH.tipoActivo && tr.querySelector('.cell-tipo')){
      tr.querySelector('.cell-zona').innerHTML = zonaHtml(row);
      tr.querySelector('.cell-tipo').innerHTML = tipoHtml(row);
      var sel = tr.querySelector('select.ch-tipo');
      if(sel) sel.addEventListener('change', function(){ cambiarTipo(attId, sel.value); });
    }
    var cb = tr.querySelector('.ch-mark');
    if(cb){ cb.checked = !!row._marcado; cb.disabled = !marcable(row); }
    tr.classList.toggle('ch-row-mark', !!row._marcado);
    var conf = CH.rows.filter(function(x){ return x.confirmado; }).length;
    $('ch-summary').textContent = CH.rows.length + ' registro(s) · ' + conf +
      ' confirmado(s) · ' + (CH.rows.length - conf) + ' pendiente(s)';
    updateSendBtn();
  }

  // ═══ #396 · Zona y tipo de día ══════════════════════════════════════════
  function zonaTxt(row){
    var ev = row && row._ev; if(!ev) return '';
    var a = paisZona(ev.zona_in), b = paisZona(ev.zona_out);
    if(!a && !b) return '';
    return (a || '?').toUpperCase() + (b && b !== a ? '→' + b.toUpperCase() : '');
  }
  function zonaHtml(row){
    var ev = row._ev;
    if(!ev || (!ev.zona_in && !ev.zona_out)){
      return '<span class="ch-zona ch-zona-na" title="Sin zona: checada anterior al cambio o sin evento del kiosko. El tipo se propone por la empresa del proyecto.">—</span>';
    }
    var a = paisZona(ev.zona_in), b = paisZona(ev.zona_out);
    var usa = a === 'usa' || b === 'usa';
    var tz = [ev.tz_in, ev.tz_out].filter(Boolean).join(' → ');
    var mot = [ev.geo_motivo_in, ev.geo_motivo_out].filter(Boolean).join(' · ');
    var t = 'Entrada: ' + (ev.zona_in || '—') + ' · Salida: ' + (ev.zona_out || '—') + (tz ? ' · ' + tz : '') + (mot ? ' · Motivo fuera de zona: ' + mot : '');
    var html = '<span class="ch-zona ' + (usa ? 'ch-zona-usa' : 'ch-zona-mx') + '" title="' + esc(t) + '">' + esc(zonaTxt(row)) + '</span>';
    if(esViajeTipo(tipoDe(row))) html += ' <span class="ch-zona ch-zona-viaje">viaje</span>';
    if(mot) html += ' <span class="ch-zona ch-zona-fuera" title="' + esc(mot) + '">fuera</span>';
    return html;
  }
  function tipoHtml(row){
    if(!row._ev) return '<span style="color:#999">—</span>';
    var sel = tipoDe(row), prop = row._ev.tipo_dia_propuesto;
    if(row.abierta) return '<span style="color:#999" title="Se propone al cerrar la salida">— (en curso)</span>';
    var opts = TIPOS.map(function(t){
      return '<option value="' + t.k + '"' + (t.k === sel ? ' selected' : '') + '>' + t.t + (t.k === prop ? ' (propuesto)' : '') + '</option>';
    }).join('');
    var nota = '';
    if(row._ev.tipo_dia && row._ev.tipo_dia === sel) nota = '<div class="ch-tipo-nota ch-tipo-ok">guardado</div>';
    else if(sel && prop && sel !== prop) nota = '<div class="ch-tipo-nota">cambiado por ti</div>';
    else if(row._ev.origen_propuesto === 'empresa_proyecto') nota = '<div class="ch-tipo-nota" title="Sin zona del kiosko: se propuso por la empresa del proyecto">por empresa</div>';
    var alerta = '';
    if(viajeSinCargo(row)) alerta = '<div class="ch-tipo-nota ch-tipo-bad">⚠ viaje sin SO ni centro de costos</div>';
    else if(mexicoConSoUsa(row)) alerta = '<div class="ch-tipo-nota ch-tipo-bad">⚠ paga México con SO de USA</div>';
    else if(requiereRecobro(row)) alerta = '<div class="ch-tipo-nota">→ ADMIN DE OPERACIONES con recobro a USA</div>';
    return '<select class="ch-tipo" data-att="' + row.attendance_id + '" aria-label="Tipo de día">' + opts + '</select>' + nota + alerta;
  }

  // Lee zona y tipo de las asistencias pintadas. Si falla, la pantalla queda como hoy.
  function cargarEventos(){
    if(!CH.rows.length) return;
    var filas = CH.rows.map(function(r){ return { attendance_id: r.attendance_id, so_id: r.so_id || null }; });
    cargarSOs();   // empresa de cada SO para el candado D-7 y la etiqueta MX/USA
    n8n(EVENTOS_URL, { filas: filas }).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(!r || r.success !== true || !Array.isArray(r.filas)) throw new Error((r && r.codigo) || 'sin datos');
      var por = {}; r.filas.forEach(function(f){ por[f.attendance_id] = f; });
      var emp = r.empresas || {};
      CH.rows.forEach(function(row){
        row._ev = por[row.attendance_id] || null;
        if(row.so_id && emp[row.so_id]) row._soCompany = Number(emp[row.so_id]);
        row._tipoSel = row._ev ? (row._ev.tipo_dia || row._ev.tipo_dia_propuesto || null) : null;
      });
      CH.tipoActivo = true;
      document.body.classList.add('ch-con-tipo');
      var av = $('ch-tipo-aviso'); if(av) av.style.display = 'none';
      renderTabla();
    }).catch(function(e){
      CH.tipoActivo = false;
      // 404 = el workflow todavía no está publicado: la pantalla es la de hoy, sin aviso.
      if(/HTTP 404/.test(String(e && e.message))) return;
      var av = $('ch-tipo-aviso');
      if(av){ av.textContent = 'Zona y tipo de día no disponibles (' + (e.message || 'sin respuesta') + '). Puedes confirmar como siempre; el tipo quedará pendiente en el reporte de RH.'; av.style.display = 'block'; }
    });
  }

  // Guarda el tipo de un renglón. resuelve {ok, regla, codigo, mensaje}.
  function guardarTipo(row, extra){
    var body = Object.assign({ attendance_id: row.attendance_id, tipo_dia: tipoDe(row),
      supervisor_nombre: CH.supervisor, es_viaje: esViajeTipo(tipoDe(row)) }, extra || {});
    return n8n(TIPO_URL, body).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(r && r.success === true){
        row._ev = row._ev || {};
        row._ev.tipo_dia = r.tipo_dia; if(extra && extra.recobro_usa) row._ev.recobro_usa = true;
        return { ok: true };
      }
      return { ok: false, regla: !!(r && r.regla), codigo: (r && r.codigo) || 'RECHAZO', mensaje: (r && r.mensaje) || 'No se guardó el tipo de día' };
    }, function(e){ return { ok: false, regla: false, codigo: 'RED', mensaje: e.message }; });
  }

  // Cambio en el selector. Si el renglón ya está confirmado se guarda al momento
  // (Felipe corrige un tipo ya confirmado); si no, viaja con el envío.
  function cambiarTipo(attId, valor){
    var row = findRow(attId); if(!row || !valor) return;
    row._tipoSel = valor;
    if(!row.confirmado){ actualizarFila(attId); return; }
    if(requiereRecobro(row) || mexicoConSoUsa(row)){
      showMsg('Este renglón ya está confirmado con una SO de FTS USA. Para que lo pague México, corrige primero su cargo (✎) y luego cambia el tipo.', 'err', true);
      row._tipoSel = row._ev && row._ev.tipo_dia || row._ev && row._ev.tipo_dia_propuesto; actualizarFila(attId); return;
    }
    guardarTipo(row).then(function(res){
      if(res.ok) showMsg('✓ Tipo de día guardado: ' + tipoTxt(valor), 'ok');
      else { showMsg('❌ ' + res.mensaje, 'err', true); row._tipoSel = row._ev && (row._ev.tipo_dia || row._ev.tipo_dia_propuesto); }
      actualizarFila(attId);
    });
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
        esc(labelDestinoAEscribir(r)) + (CH.tipoActivo && tipoDe(r) ? '<div style="font-size:11px;color:#555">' + esc(tipoTxt(tipoDe(r))) + '</div>' : '') + '</td><td style="text-align:right">' + (r.worked_hours!=null? r.worked_hours.toFixed(2)+'h':'—') + '</td></tr>';
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
    var conPre = marked.filter(hayPrecarga);
    var contra = marked.filter(contradiceSoloBolsa);
    if(conPre.length) alertas.push('🗂️ <b>' + conPre.length + '</b> con destino PROPUESTO (marca solo-bolsa) — se escribe al confirmar');
    if(contra.length) alertas.push('⚠️ <b>' + contra.length + '</b> con la <b>marca en duda</b> (solo-bolsa y con renglones a proyecto) — van sin destino, revisa la marca en Odoo');
    if(cross.length) alertas.push('⚠️ <b>' + cross.length + '</b> de otro depto cargando a proyecto');
    if(warn.length)  alertas.push('🟠 <b>' + warn.length + '</b> con MO sin fondos / agotada (se registra el sobrecosto)');
    if(disp.length)  alertas.push('⚖️ <b>' + disp.length + '</b> en disputa — se confirman pero deberán resolverse antes de nómina');
    if(CH.tipoActivo){
      var usaR = marked.filter(function(r){ var t = tipoDe(r); return t === 'proyecto_usa' || t === 'viaje_usa'; });
      var sinCargo = marked.filter(viajeSinCargo);
      var recobro = marked.filter(requiereRecobro);
      var mxUsa = marked.filter(mexicoConSoUsa);
      if(usaR.length) alertas.push('🇺🇸 <b>' + usaR.length + '</b> día(s) que paga FTS USA');
      if(recobro.length) alertas.push('↩ <b>' + recobro.length + '</b> Viaje a México con SO de USA: se cargan a ADMIN DE OPERACIONES (3096) con recobro a USA');
      if(sinCargo.length) alertas.push('⛔ <b>' + sinCargo.length + '</b> día(s) de viaje SIN SO ni centro de costos — NO se confirmarán; asígnales cargo (✎)');
      if(mxUsa.length) alertas.push('⛔ <b>' + mxUsa.length + '</b> con tipo México y SO de FTS USA — NO se confirmarán; cambia el tipo o la SO');
    }
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
    var motivos = [], sinTipo = [];   // #396: por qué se detuvo un renglón / tipos que no se guardaron
    showOverlay('Confirmando… 0 de ' + total);
    function next(){
      if(i >= atts.length){
        hideOverlay();
        var extra = [];
        if(blocked) extra.push(blocked + ' bloqueado(s)');
        if(fail) extra.push(fail + ' con error');
        var msg = ok ? ('✓ ' + ok + ' registro(s) confirmados' + (extra.length ? (' · ' + extra.join(' · ')) : ''))
                     : ('❌ No se envió ninguno' + (extra.length ? (' — ' + extra.join(' · ')) : ''));
        if(motivos.length) msg += ' · Detenidos: ' + motivos.join(' · ');
        if(sinTipo.length) msg += ' · Tipo de día NO guardado (quedan pendientes en RH): ' + sinTipo.join(' · ');
        showMsg(msg, (fail || blocked || !ok) ? 'err' : 'ok', true);   // PERSISTENTE hasta refresh o cambio de rango
        CH._autoDismissed = false;   // re-arma para un siguiente marcado completo
        return;
      }
      var att = atts[i++];
      var row = findRow(att); var est = budgetEstado(row); var ack = {};
      if(est === 'placeholder') ack.ack_mo_placeholder = true;
      else if(est === 'agotado') ack.ack_mo_agotado = true;

      // Con destino propuesto el envío NO es un confirm a secas: es la corrección que
      // además confirma, por el mismo endpoint que ya usa el botón ✎. Destino y
      // aprobación entran en la MISMA escritura, así que no se puede quedar aprobado
      // sin destino — que es exactamente el hueco que esto viene a tapar.
      var pre = precargaDe(row);
      var url = pre ? CORREGIR_URL : '/webhook/planeacion/confirmar-horas';
      var payload = pre
        ? payloadCorreccion(att, row, 'bolsa', pre.id, pre.nombre)
        : Object.assign({ attendance_id: att, action: 'confirm', origen: 'envio', supervisor_nombre: CH.supervisor }, ack);

      // #396: el tipo de día va ANTES de la aprobación. Una regla rota detiene el renglón;
      // una falla de red no (se confirma como siempre y el tipo queda pendiente en RH).
      var paso;
      if(CH.tipoActivo && row && tipoDe(row)){
        if(viajeSinCargo(row) || mexicoConSoUsa(row)){ blocked++; motivos.push((row.empleado_nombre || att) + ': ' + (viajeSinCargo(row) ? 'viaje sin SO ni centro de costos' : 'tipo México con SO de FTS USA')); updateOverlay('Confirmando… ' + (ok + fail + blocked) + ' de ' + total); next(); return; }
        if(requiereRecobro(row)){
          // D-7: primero el cargo pasa a 3096 (esa corrección ya confirma), luego el tipo con recobro.
          var soOrig = row.so_id;
          url = CORREGIR_URL;
          payload = payloadCorreccion(att, row, 'bolsa', CTA_RECOBRO.id, CTA_RECOBRO.nombre);
          paso = n8n(url, payload).then(function(data){
            var r = Array.isArray(data) ? data[0] : data;
            if(!r || r.success === false) throw new Error();
            row.cuenta_id = CTA_RECOBRO.id; row.cuenta_nombre = CTA_RECOBRO.nombre; row.so_id = null; row.so_nombre = '';
            return guardarTipo(row, { recobro_usa: true, so_original_id: soOrig }).then(function(res){
              if(!res.ok) sinTipo.push((row.empleado_nombre || att) + ': ' + res.mensaje);
              return { success: true };
            });
          });
        } else {
          paso = guardarTipo(row).then(function(res){
            if(!res.ok && res.regla){ return { _regla: res.mensaje }; }
            if(!res.ok) sinTipo.push((row.empleado_nombre || att) + ': ' + res.mensaje);
            return n8n(url, payload);
          });
        }
      } else {
        paso = n8n(url, payload);
      }
      paso
        .then(function(data){
          var r = Array.isArray(data) ? data[0] : data;
          if(r && r._regla){ blocked++; motivos.push((row.empleado_nombre || att) + ': ' + r._regla); return; }
          if(r && (r.bloqueo || r.needs_ack)){ blocked++; return; }
          if(!r || r.success === false) throw new Error();
          if(row){
            if(pre){ row.cuenta_id = pre.id; row.cuenta_nombre = pre.nombre; row.so_id = null; row.so_nombre = ''; }
            row.confirmado = true; row._marcado = false;
          }
          actualizarFila(att); ok++;
        })
        .catch(function(){ fail++; })
        .finally(function(){ updateOverlay('Confirmando… ' + (ok + fail + blocked) + ' de ' + total); next(); });
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
        return { id: s.id, nombre: s.nombre || s.name || ('SO ' + s.id), cliente: s.cliente || '',
                 company_id: (s.company_id != null && s.company_id !== false) ? Number(Array.isArray(s.company_id) ? s.company_id[0] : s.company_id) : null };
      }).filter(function(s){ return s.id != null; });
      return CH.sos;
    }).catch(function(e){
      $('modal-so-list').innerHTML = '<div class="ch-placeholder">❌ ' + esc(e.message) + '</div>';
      return [];
    }).finally(function(){ CH.sosCargando = false; });
  }

  // #396: etiqueta de empresa por renglón. kiosk/sos ya trae company_id (1 = FTS MX, 6 = FTS USA).
  function empresaChip(cid){
    if(cid === 6) return '<span class="ch-emp ch-emp-usa">USA</span> ';
    if(cid === 1) return '<span class="ch-emp ch-emp-mx">MX</span> ';
    return '';
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
          '<div class="n">' + empresaChip(s.company_id) + esc(s.nombre) + '</div>' +
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

  // El cuerpo de la corrección sale de UNA definición porque ahora lo mandan DOS
  // caminos: el botón ✎ (elegir a mano) y el envío de un renglón con destino
  // propuesto. Si se escribieran por separado, el día que cambie el contrato se
  // arregla uno y el otro sigue mandando la forma vieja.
  function payloadCorreccion(attId, row, tipo, id, nombre){
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
    return payload;
  }

  // Corrección con excluyencia mutua → planeacion/corregir-bolsa. Escribe manager_approval=true.
  function corregir(attId, tipo, id, nombre){
    if(!attId || !id || !tipo) return;
    var row = findRow(attId);
    var esBolsa = tipo === 'bolsa';
    var payload = payloadCorreccion(attId, row, tipo, id, nombre);
    $('modal-so-list').innerHTML = '<div class="ch-placeholder">⏳ Guardando…</div>';
    n8n(CORREGIR_URL, payload).then(function(data){
      var r = Array.isArray(data) ? data[0] : data;
      if(!r || r.success === false) throw new Error((r && r.mensaje) || 'Error');
      if(row){
        if(esBolsa){ row.cuenta_id = id; row.cuenta_nombre = nombre; row.so_id = null; row.so_nombre = ''; }
        else { row.so_id = id; row.so_nombre = nombre; row.cuenta_id = null; row.cuenta_nombre = '';
               var sx = (CH.sos || []).filter(function(x){ return x.id === id; })[0]; row._soCompany = sx ? sx.company_id : null; }
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

    // La precarga apagada no se anuncia. Encendida SÍ: una pantalla que propone un
    // destino tiene que decir que lo está proponiendo, o el siguiente que la abra
    // creerá que el destino vino de Odoo.
    if(precargaEncendida()){
      var avi = $('ch-precarga-aviso');
      if(avi) avi.style.display = 'block';
    }

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
