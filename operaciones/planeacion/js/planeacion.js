// ═══ FTS Operaciones — Planeación (simple) ═══

const P = {
  vista: 'diario',
  fechaDiario: '',
  semanaInicio: '',
  planDiario: [],
  planSemanal: {},
  comentarios: '',          // comentarios del día activo
  comentariosSemanal: '',   // comentarios de la semana activa
  empleados: [],
  config: {},
};

// ═══ Helpers de fechas ═══
function pad(n){ return String(n).padStart(2,'0'); }
function isoDate(d){
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}

function tomorrow(){
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function getLunes(fechaStr){
  const d = new Date(fechaStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return isoDate(d);
}

function fmtFecha(fechaStr, opts){
  const d = new Date(fechaStr + 'T00:00:00');
  return d.toLocaleDateString('es-MX', opts || { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function fmtFechaCorta(fechaStr){
  const d = new Date(fechaStr + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short' });
}

// ═══ Config ═══
function loadConfig(){
  return {
    n8nUrl:   localStorage.getItem('kiosk_n8n_url') || '',
    apiKey:   localStorage.getItem('kiosk_api_key') || '',
    demoMode: localStorage.getItem('kiosk_demo_mode') !== 'false',
  };
}

// ═══ Demo ═══
const DEMO_EMPLEADOS = [
  'Mateo Salazar',
  'Carlos Mendoza',
  'Luis Hernández',
  'Roberto García',
  'Jorge Pérez'
];

function loadDemoplan(fecha){
  return [
    { empleado:'Mateo Salazar',   origen:'fts',     planta:'Arca Monterrey', entrada:'07:00', salida:'17:00' },
    { empleado:'Carlos Mendoza',  origen:'directo', planta:'Ecolab MTY',     entrada:'07:00', salida:'17:00' },
    { empleado:'Roberto García',  origen:'fts',     planta:'Arca Monterrey', entrada:'08:00', salida:'17:00' },
  ];
}

// ═══ Storage ═══
function storageKey(fecha){ return 'plan_' + fecha; }
function comentariosKey(fecha){ return 'plan_comentarios_' + fecha; }
function comentariosSemanalKey(lunes){ return 'plan_comentarios_semanal_' + lunes; }

function cargarPlanDeStorage(fecha){
  try{
    const raw = localStorage.getItem(storageKey(fecha));
    if(raw) return JSON.parse(raw);
  } catch(e){}
  return null;
}

function guardarPlanEnStorage(fecha, plan){
  localStorage.setItem(storageKey(fecha), JSON.stringify(plan));
}

function cargarComentariosDiario(fecha){
  return localStorage.getItem(comentariosKey(fecha)) || '';
}

function cargarComentariosSemanal(lunes){
  return localStorage.getItem(comentariosSemanalKey(lunes)) || '';
}

function updateComentariosDiario(valor){
  P.comentarios = valor;
  if(P.fechaDiario) localStorage.setItem(comentariosKey(P.fechaDiario), valor);
}
window.updateComentariosDiario = updateComentariosDiario;

function updateComentariosSemanal(valor){
  P.comentariosSemanal = valor;
  if(P.semanaInicio) localStorage.setItem(comentariosSemanalKey(P.semanaInicio), valor);
}
window.updateComentariosSemanal = updateComentariosSemanal;

// ═══ Tabs ═══
function showVista(vista){
  P.vista = vista;
  document.querySelectorAll('.pl-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.pl-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + vista).classList.add('active');
  document.getElementById('pane-' + vista).classList.add('active');
  if(vista === 'semanal') renderPlanSemanal();
}
window.showVista = showVista;

// ═══ Plan Diario ═══
function onFechaDiarioChange(){
  P.fechaDiario = document.getElementById('fechaDiario').value;
  const saved = cargarPlanDeStorage(P.fechaDiario);
  P.planDiario = saved || (P.config.demoMode ? loadDemoplan(P.fechaDiario) : []);
  P.comentarios = cargarComentariosDiario(P.fechaDiario);
  const ta = document.getElementById('plan-comentarios-diario');
  if(ta) ta.value = P.comentarios;
  renderPlanDiario();
}
window.onFechaDiarioChange = onFechaDiarioChange;

function addTecnico(){
  P.planDiario.push({ empleado:'', origen:'fts', planta:'', entrada:'07:00', salida:'17:00' });
  renderPlanDiario();
}
window.addTecnico = addTecnico;

function removeTecnico(idx){
  P.planDiario.splice(idx, 1);
  renderPlanDiario();
}
window.removeTecnico = removeTecnico;

function updatePlanField(idx, campo, valor){
  if(P.planDiario[idx]) P.planDiario[idx][campo] = valor;
}
window.updatePlanField = updatePlanField;

function renderPlanDiario(){
  const tbody = document.getElementById('planDiarioBody');
  if(!tbody) return;
  if(!P.planDiario.length){
    tbody.innerHTML = '<tr><td colspan="6" class="pl-empty">Sin técnicos asignados — toca "+ Agregar técnico"</td></tr>';
    return;
  }
  tbody.innerHTML = P.planDiario.map((row, idx) => {
    const opts = P.empleados.map(e =>
      '<option value="'+e+'"'+(e===row.empleado?' selected':'')+'>'+e+'</option>'
    ).join('');
    const origen = row.origen || 'fts';
    return '<tr>'+
      '<td><select onchange="updatePlanField('+idx+',\'empleado\',this.value)">'+
        '<option value="">— Selecciona —</option>'+opts+
      '</select></td>'+
      '<td><select onchange="updatePlanField('+idx+',\'origen\',this.value)">'+
        '<option value="fts"'+(origen==='fts'?' selected':'')+'>🏢 Sale de FTS</option>'+
        '<option value="directo"'+(origen==='directo'?' selected':'')+'>📍 Va directo a planta</option>'+
      '</select></td>'+
      '<td><input type="text" placeholder="Arca Monterrey, Ecolab MTY…" value="'+(row.planta||'').replace(/"/g,'&quot;')+'" oninput="updatePlanField('+idx+',\'planta\',this.value)"></td>'+
      '<td><input type="time" value="'+(row.entrada||'07:00')+'" onchange="updatePlanField('+idx+',\'entrada\',this.value)"></td>'+
      '<td><input type="time" value="'+(row.salida||'17:00')+'" onchange="updatePlanField('+idx+',\'salida\',this.value)"></td>'+
      '<td><button class="pl-del" onclick="removeTecnico('+idx+')" title="Eliminar">🗑️</button></td>'+
    '</tr>';
  }).join('');
}

async function guardarPlan(){
  guardarPlanEnStorage(P.fechaDiario, P.planDiario);

  if(!P.config.demoMode && P.config.n8nUrl){
    try{
      const url = P.config.n8nUrl.replace(/\/$/, '') + '/planeacion/guardar';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':P.config.apiKey },
        body: JSON.stringify({ fecha:P.fechaDiario, plan:P.planDiario })
      });
      if(!res.ok) throw new Error('HTTP '+res.status);
      showToast('✅ Plan guardado en Odoo');
    } catch(e){
      console.warn('Fallo guardar en Odoo:', e);
      showToast('⚠️ Guardado local — Odoo no disponible');
    }
  } else {
    showToast('✅ Plan guardado (local)');
  }
}
window.guardarPlan = guardarPlan;

// ═══ Plan Semanal ═══
function onFechaSemanalChange(){
  const fecha = document.getElementById('fechaSemanal').value;
  P.semanaInicio = getLunes(fecha);
  cargarSemanaDeStorage();
  P.comentariosSemanal = cargarComentariosSemanal(P.semanaInicio);
  const ta = document.getElementById('plan-comentarios-semanal');
  if(ta) ta.value = P.comentariosSemanal;
  renderPlanSemanal();
}
window.onFechaSemanalChange = onFechaSemanalChange;

function cargarSemanaDeStorage(){
  P.planSemanal = {};
  const d = new Date(P.semanaInicio + 'T00:00:00');
  for(let i = 0; i < 5; i++){
    const fecha = isoDate(d);
    const plan = cargarPlanDeStorage(fecha);
    if(plan && plan.length) P.planSemanal[fecha] = plan;
    d.setDate(d.getDate() + 1);
  }
}

function renderPlanSemanal(){
  const tbody = document.getElementById('planSemanalBody');
  const head  = document.getElementById('planSemanalHead');
  const label = document.getElementById('semanaLabel');
  if(!tbody) return;

  // Calcular fechas de la semana
  const fechas = [];
  const d = new Date(P.semanaInicio + 'T00:00:00');
  for(let i = 0; i < 5; i++){
    fechas.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }

  // Label
  if(label){
    label.textContent = 'Del ' + fmtFechaCorta(fechas[0]) + ' al ' + fmtFechaCorta(fechas[4]);
  }

  // Header con fechas cortas
  const diasNombres = ['Lun','Mar','Mié','Jue','Vie'];
  head.innerHTML = '<tr><th>Técnico</th>' +
    fechas.map((f,i) =>
      '<th>'+diasNombres[i]+'<br><span style="font-weight:400;font-size:10px;color:#999">'+fmtFechaCorta(f)+'</span></th>'
    ).join('') + '</tr>';

  // Recolectar todos los técnicos de la semana
  const tecnicosSet = new Set();
  fechas.forEach(f => {
    (P.planSemanal[f] || []).forEach(row => {
      if(row.empleado) tecnicosSet.add(row.empleado);
    });
  });

  if(!tecnicosSet.size){
    tbody.innerHTML = '<tr><td colspan="6" class="pl-empty">Sin planes guardados esta semana — ve a "Plan Diario" para crear uno</td></tr>';
    return;
  }

  const tecnicos = Array.from(tecnicosSet).sort();
  tbody.innerHTML = tecnicos.map(emp => {
    const celdas = fechas.map(f => {
      const plan = P.planSemanal[f] || [];
      const row = plan.find(r => r.empleado === emp);
      if(row && row.planta){
        const corto = row.planta.length > 20 ? row.planta.slice(0,18)+'…' : row.planta;
        return '<td class="has-plan" title="'+row.planta+' ('+row.entrada+'-'+row.salida+')">'+corto+'</td>';
      }
      return '<td class="no-plan">—</td>';
    }).join('');
    return '<tr><td>'+emp+'</td>'+celdas+'</tr>';
  }).join('');
}

// ═══ WhatsApp ═══
function origenEmoji(origen){
  return origen === 'directo' ? '📍' : '🏢';
}

function generarMensajeWhatsApp(tipo){
  if(tipo === 'diario'){
    const fechaLabel = fmtFecha(P.fechaDiario);
    let msg = '*📋 PLAN DE TRABAJO — ' + fechaLabel + '*\n';
    msg += '*FTS Full Technology Systems*\n\n';
    const filas = P.planDiario.filter(r => r.empleado && r.planta);
    if(!filas.length){
      msg += '_Sin técnicos asignados_\n';
    } else {
      filas.forEach(r => {
        msg += '👷 ' + r.empleado + ' → ' + r.planta + ' (' + r.entrada + '-' + r.salida + ') ' + origenEmoji(r.origen) + '\n';
      });
    }
    if(P.comentarios && P.comentarios.trim()){
      msg += '\n💬 ' + P.comentarios.trim() + '\n';
    }
    msg += '\n_Enviado desde FTS Suite_';
    return msg;
  }

  // Semanal
  const d0 = new Date(P.semanaInicio + 'T00:00:00');
  const d4 = new Date(d0); d4.setDate(d4.getDate() + 4);
  let msg = '*📆 PLAN SEMANAL — ' + fmtFechaCorta(isoDate(d0)) + ' al ' + fmtFechaCorta(isoDate(d4)) + '*\n';
  msg += '*FTS Full Technology Systems*\n\n';

  const diasNombres = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const d = new Date(P.semanaInicio + 'T00:00:00');
  for(let i = 0; i < 5; i++){
    const fecha = isoDate(d);
    const plan = P.planSemanal[fecha] || [];
    const filas = plan.filter(r => r.empleado && r.planta);
    if(filas.length){
      msg += '*' + diasNombres[i] + ' ' + fmtFechaCorta(fecha) + ':*\n';
      filas.forEach(r => {
        msg += '👷 ' + r.empleado + ' → ' + r.planta + ' ' + origenEmoji(r.origen) + '\n';
      });
      msg += '\n';
    }
    d.setDate(d.getDate() + 1);
  }
  if(P.comentariosSemanal && P.comentariosSemanal.trim()){
    msg += '💬 *Comentarios:* ' + P.comentariosSemanal.trim() + '\n\n';
  }
  msg += '_Enviado desde FTS Suite_';
  return msg;
}

function enviarWhatsApp(tipo){
  const msg = generarMensajeWhatsApp(tipo);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(msg)
      .then(() => showToast('✅ Plan copiado — pégalo en WhatsApp'))
      .catch(() => fallbackCopy(msg));
  } else {
    fallbackCopy(msg);
  }
}
window.enviarWhatsApp = enviarWhatsApp;

// ═══ Generar imagen PNG con Canvas ═══
function getViernes(lunes){
  const d = new Date(lunes + 'T00:00:00');
  d.setDate(d.getDate() + 4);
  return isoDate(d);
}

function wrapText(ctx, text, maxWidth){
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if(ctx.measureText(test).width > maxWidth && cur){
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  });
  if(cur) lines.push(cur);
  return lines;
}

function generarImagen(tipo){
  if(tipo === 'diario'){
    generarImagenDiario();
  } else {
    generarImagenSemanal();
  }
}
window.generarImagen = generarImagen;

function generarImagenDiario(){
  const canvas = document.createElement('canvas');
  const filas = P.planDiario.length || 1;
  const altoFila = 44;
  const headerH = 80;
  const colH = 32;
  const comentarios = (P.comentarios || '').trim();
  const comentH = comentarios ? 70 : 0;
  const footerH = 40;
  canvas.width = 780;
  canvas.height = headerH + colH + (filas * altoFila) + comentH + footerH + 20;

  const ctx = canvas.getContext('2d');

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header verde FTS
  ctx.fillStyle = '#107C10';
  ctx.fillRect(0, 0, canvas.width, headerH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('📋 PLAN DE TRABAJO — FTS', 20, 32);
  ctx.font = '14px Arial';
  ctx.fillText(fmtFecha(P.fechaDiario), 20, 58);

  // Encabezados de columna
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, headerH, canvas.width, colH);
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('TÉCNICO', 16, headerH + 20);
  ctx.fillText('PLANTA', 220, headerH + 20);
  ctx.fillText('ORIGEN', 430, headerH + 20);
  ctx.fillText('HORARIO', 620, headerH + 20);

  // Filas
  if(P.planDiario.length){
    P.planDiario.forEach((t, i) => {
      const y = headerH + colH + (i * altoFila);
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fafafa';
      ctx.fillRect(0, y, canvas.width, altoFila);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + altoFila);
      ctx.lineTo(canvas.width, y + altoFila);
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '13px Arial';
      ctx.fillText('👷 ' + (t.empleado || '—'), 16, y + 27);
      ctx.fillText(t.planta || '—', 220, y + 27);
      const origenLabel = t.origen === 'directo' ? '📍 Directo' : '🏢 Sale FTS';
      ctx.fillText(origenLabel, 430, y + 27);
      ctx.fillText((t.entrada || '--:--') + ' - ' + (t.salida || '--:--'), 620, y + 27);
    });
  } else {
    const y = headerH + colH;
    ctx.fillStyle = '#999';
    ctx.font = 'italic 13px Arial';
    ctx.fillText('Sin técnicos asignados', 20, y + 27);
  }

  // Comentarios
  if(comentarios){
    const yComent = headerH + colH + (filas * altoFila) + 10;
    ctx.fillStyle = '#FFF9E6';
    ctx.fillRect(0, yComent, canvas.width, comentH - 10);
    ctx.fillStyle = '#BF8F00';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('💬 Comentarios:', 16, yComent + 20);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px Arial';
    const lines = wrapText(ctx, comentarios, canvas.width - 32);
    lines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, 16, yComent + 40 + (i * 16));
    });
  }

  // Footer
  const yFoot = canvas.height - footerH;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, yFoot, canvas.width, footerH);
  ctx.fillStyle = '#999';
  ctx.font = '11px Arial';
  ctx.fillText('FTS Full Technology Systems — fts-suite', 16, yFoot + 24);

  // Descargar
  const link = document.createElement('a');
  link.download = 'plan-fts-' + P.fechaDiario + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();

  showToast('✅ Imagen descargada');
}

function generarImagenSemanal(){
  // Calcular fechas de la semana
  const fechas = [];
  const d = new Date(P.semanaInicio + 'T00:00:00');
  for(let i = 0; i < 5; i++){
    fechas.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }

  // Recolectar técnicos únicos
  const tecnicosSet = new Set();
  fechas.forEach(f => (P.planSemanal[f] || []).forEach(r => {
    if(r.empleado) tecnicosSet.add(r.empleado);
  }));
  const tecnicos = Array.from(tecnicosSet).sort();

  const headerH = 80;
  const colH = 44;
  const altoFila = 44;
  const filas = tecnicos.length || 1;
  const comentarios = (P.comentariosSemanal || '').trim();
  const comentH = comentarios ? 70 : 0;
  const footerH = 40;

  const colTecnicoW = 180;
  const colDiaW = 140;
  const canvasW = colTecnicoW + colDiaW * 5;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = headerH + colH + (filas * altoFila) + comentH + footerH + 20;

  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header verde
  ctx.fillStyle = '#107C10';
  ctx.fillRect(0, 0, canvas.width, headerH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('📆 PLAN SEMANAL — FTS', 20, 32);
  ctx.font = '14px Arial';
  ctx.fillText('Semana del ' + fmtFechaCorta(fechas[0]) + ' al ' + fmtFechaCorta(fechas[4]), 20, 58);

  // Encabezados de días
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, headerH, canvas.width, colH);
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('TÉCNICO', 16, headerH + 26);
  const diasNombres = ['LUN','MAR','MIÉ','JUE','VIE'];
  fechas.forEach((f, i) => {
    const x = colTecnicoW + i * colDiaW;
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(diasNombres[i], x + 12, headerH + 20);
    ctx.fillStyle = '#999';
    ctx.font = '10px Arial';
    ctx.fillText(fmtFechaCorta(f), x + 12, headerH + 36);
  });

  // Filas
  if(tecnicos.length){
    tecnicos.forEach((emp, i) => {
      const y = headerH + colH + (i * altoFila);
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fafafa';
      ctx.fillRect(0, y, canvas.width, altoFila);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + altoFila);
      ctx.lineTo(canvas.width, y + altoFila);
      ctx.stroke();

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('👷 ' + emp, 16, y + 27);

      fechas.forEach((f, j) => {
        const x = colTecnicoW + j * colDiaW;
        const plan = P.planSemanal[f] || [];
        const row = plan.find(r => r.empleado === emp);
        if(row && row.planta){
          ctx.fillStyle = 'rgba(16,124,16,0.08)';
          ctx.fillRect(x + 4, y + 6, colDiaW - 8, altoFila - 12);
          ctx.fillStyle = '#107C10';
          ctx.font = '12px Arial';
          const texto = row.planta.length > 18 ? row.planta.slice(0,16) + '…' : row.planta;
          ctx.fillText(texto, x + 12, y + 27);
        } else {
          ctx.fillStyle = '#ccc';
          ctx.font = '12px Arial';
          ctx.fillText('—', x + 12, y + 27);
        }
      });
    });
  } else {
    const y = headerH + colH;
    ctx.fillStyle = '#999';
    ctx.font = 'italic 13px Arial';
    ctx.fillText('Sin planes guardados en esta semana', 20, y + 27);
  }

  // Comentarios
  if(comentarios){
    const yComent = headerH + colH + (filas * altoFila) + 10;
    ctx.fillStyle = '#FFF9E6';
    ctx.fillRect(0, yComent, canvas.width, comentH - 10);
    ctx.fillStyle = '#BF8F00';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('💬 Comentarios:', 16, yComent + 20);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px Arial';
    const lines = wrapText(ctx, comentarios, canvas.width - 32);
    lines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, 16, yComent + 40 + (i * 16));
    });
  }

  // Footer
  const yFoot = canvas.height - footerH;
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, yFoot, canvas.width, footerH);
  ctx.fillStyle = '#999';
  ctx.font = '11px Arial';
  ctx.fillText('FTS Full Technology Systems — fts-suite', 16, yFoot + 24);

  const link = document.createElement('a');
  link.download = 'plan-fts-semana-' + P.semanaInicio + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();

  showToast('✅ Imagen descargada');
}

function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); } catch(e){}
  document.body.removeChild(ta);
  showToast('✅ Plan copiado — pégalo en WhatsApp');
}

// ═══ Toast ═══
function showToast(text){
  const el = document.getElementById('plToast');
  if(!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ═══ Init ═══
function initPlaneacion(){
  P.config = loadConfig();
  P.empleados = DEMO_EMPLEADOS.slice();
  P.fechaDiario = tomorrow();
  P.semanaInicio = getLunes(isoDate(new Date()));

  document.getElementById('fechaDiario').value = P.fechaDiario;
  document.getElementById('fechaSemanal').value = isoDate(new Date());

  // Cargar plan del día inicial
  const saved = cargarPlanDeStorage(P.fechaDiario);
  P.planDiario = saved || (P.config.demoMode ? loadDemoplan(P.fechaDiario) : []);
  P.comentarios = cargarComentariosDiario(P.fechaDiario);
  const taD = document.getElementById('plan-comentarios-diario');
  if(taD) taD.value = P.comentarios;
  renderPlanDiario();

  cargarSemanaDeStorage();
  P.comentariosSemanal = cargarComentariosSemanal(P.semanaInicio);
  const taS = document.getElementById('plan-comentarios-semanal');
  if(taS) taS.value = P.comentariosSemanal;
}

document.addEventListener('DOMContentLoaded', initPlaneacion);
