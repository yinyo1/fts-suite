// ═══ FTS Dashboard Operaciones — Lógica principal ═══

const D = {
  tecnicos: [],
  alertas: [],
  config: {},
  ultimaActualizacion: null,
  refreshTimer: null,
};

// ═══ Configuración ═══
function loadConfig(){
  const refreshMin = parseInt(localStorage.getItem('ops_dash_refresh') || '5', 10);
  return {
    n8nUrl:         localStorage.getItem('ops_n8n_url') || '',
    apiKey:         localStorage.getItem('ops_api_key') || '',
    demoMode:       localStorage.getItem('ops_demo_mode') !== '0',
    refreshMs:      Math.max(1, refreshMin) * 60 * 1000,
    alertaSinChecar: localStorage.getItem('ops_dash_alerta_sin_checar') !== '0',
    alertaFueraZona: localStorage.getItem('ops_dash_alerta_fuera_zona') !== '0',
    alertaExtra:     localStorage.getItem('ops_dash_alerta_extra') !== '0',
  };
}

// ═══ Datos demo ═══
const DEMO_TECNICOS = [
  {
    id: 1, nombre: 'Mateo Salazar', foto: '', cargo: 'Ingeniero',
    status: 'activo',
    entrada: '07:05', salida_comida: '12:00', regreso_comida: '12:35', salida: null,
    horas_efectivas: 285,
    so: 'SO-11547 Nalco',
    geo_ok: true
  },
  {
    id: 2, nombre: 'Carlos Mendoza', foto: '', cargo: 'Supervisor',
    status: 'comida',
    entrada: '07:10', salida_comida: '12:05', regreso_comida: null, salida: null,
    horas_efectivas: 235,
    so: 'SO-11548 Ecolab',
    geo_ok: true
  },
  {
    id: 3, nombre: 'Luis Hernández', foto: '', cargo: 'Técnico',
    status: 'sin_checar',
    entrada: null, salida_comida: null, regreso_comida: null, salida: null,
    horas_efectivas: 0,
    so: null,
    geo_ok: null
  },
  {
    id: 4, nombre: 'Roberto García', foto: '', cargo: 'Soldador',
    status: 'completado',
    entrada: '07:00', salida_comida: '12:00', regreso_comida: '12:30', salida: '17:05',
    horas_efectivas: 575,
    so: 'SO-11549 Arca',
    geo_ok: true
  },
  {
    id: 5, nombre: 'Jorge Pérez', foto: '', cargo: 'Ayudante',
    status: 'fuera_zona',
    entrada: '07:15', salida_comida: null, regreso_comida: null, salida: null,
    horas_efectivas: 290,
    so: 'SO-11547 Nalco',
    geo_ok: false,
    motivo: 'Llegó directo a planta'
  }
];

function generarAlertasDemo(tecnicos){
  const alertas = [];
  const cfg = D.config || {};

  // Sin checar
  if(cfg.alertaSinChecar !== false){
    const sinChecar = tecnicos.filter(t => t.status === 'sin_checar');
    if(sinChecar.length){
      alertas.push({
        nivel: 'err',
        icon: '⚠️',
        titulo: sinChecar.length + ' técnico(s) sin checar',
        msg: sinChecar.map(t => t.nombre).join(', ')
      });
    }
  }

  // Fuera de zona pendientes
  if(cfg.alertaFueraZona !== false){
    const fueraZona = tecnicos.filter(t => t.status === 'fuera_zona' || t.geo_ok === false);
    if(fueraZona.length){
      alertas.push({
        nivel: 'warn',
        icon: '📍',
        titulo: fueraZona.length + ' check-in(s) fuera de zona',
        msg: fueraZona.map(t => t.nombre + (t.motivo ? ' — ' + t.motivo : '')).join(' · ')
      });
    }
  }

  // Horas extra
  if(cfg.alertaExtra !== false){
    const LIMITE = 576; // 9.6 hrs
    const conExtra = tecnicos.filter(t => t.horas_efectivas > LIMITE);
    if(conExtra.length){
      alertas.push({
        nivel: 'info',
        icon: '⚡',
        titulo: conExtra.length + ' técnico(s) con horas extra',
        msg: conExtra.map(t => t.nombre + ' (+' + formatHoras(t.horas_efectivas - LIMITE) + ')').join(' · ')
      });
    }
  }

  return alertas;
}

// ═══ Cálculos ═══
function calcularStatus(t){
  if(!t.entrada) return 'sin_checar';
  if(t.geo_ok === false) return 'fuera_zona';
  if(t.salida) return 'completado';
  if(t.salida_comida && !t.regreso_comida) return 'comida';
  return 'activo';
}

function formatHoras(min){
  if(min == null) return '—';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return h + 'h ' + String(m).padStart(2,'0') + 'm';
}

// ═══ Carga de datos ═══
async function loadDatos(){
  D.config = loadConfig();

  if(D.config.demoMode || !D.config.n8nUrl){
    D.tecnicos = DEMO_TECNICOS.slice();
    D.alertas = generarAlertasDemo(D.tecnicos);
    mostrarDemoBadge(true);
  } else {
    try{
      const url = D.config.n8nUrl.replace(/\/$/, '') + '/dashboard/resumen';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': D.config.apiKey || ''
        },
        body: '{}'
      });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      D.tecnicos = (data && data.tecnicos) || [];
      D.alertas  = (data && data.alertas)  || generarAlertasDemo(D.tecnicos);
      mostrarDemoBadge(false);
    } catch(e){
      console.warn('Odoo no disponible, usando demo:', e);
      D.tecnicos = DEMO_TECNICOS.slice();
      D.alertas = generarAlertasDemo(D.tecnicos);
      mostrarDemoBadge(true);
    }
  }

  // Recalcular status por si vienen inconsistentes
  D.tecnicos.forEach(t => {
    if(!t.status) t.status = calcularStatus(t);
  });

  D.ultimaActualizacion = new Date();
  renderMetricas();
  renderTecnicos();
  renderAlertas();
  actualizarTimestamp();
}

function mostrarDemoBadge(on){
  const el = document.getElementById('demoBadge');
  if(el) el.style.display = on ? 'inline-flex' : 'none';
}

function actualizarTimestamp(){
  const el = document.getElementById('lastUpdate');
  if(!el || !D.ultimaActualizacion) return;
  const hh = String(D.ultimaActualizacion.getHours()).padStart(2,'0');
  const mm = String(D.ultimaActualizacion.getMinutes()).padStart(2,'0');
  const ss = String(D.ultimaActualizacion.getSeconds()).padStart(2,'0');
  el.textContent = hh + ':' + mm + ':' + ss;
}

// ═══ Render: Métricas ═══
function renderMetricas(){
  const activos     = D.tecnicos.filter(t => t.status === 'activo' || t.status === 'comida' || t.status === 'fuera_zona').length;
  const completados = D.tecnicos.filter(t => t.status === 'completado').length;
  const sinChecar   = D.tecnicos.filter(t => t.status === 'sin_checar').length;
  const conExtra    = D.tecnicos.filter(t => t.horas_efectivas > 576).length;

  document.getElementById('mActivos').textContent     = activos;
  document.getElementById('mCompletados').textContent = completados;
  document.getElementById('mSinChecar').textContent   = sinChecar;
  document.getElementById('mExtra').textContent       = conExtra;
}

// ═══ Render: Lista de técnicos ═══
function renderTecnicos(){
  const el = document.getElementById('tecnicosList');
  if(!el) return;
  if(!D.tecnicos.length){
    el.innerHTML = '<div style="padding:24px;text-align:center;color:#999;font-size:13px">Sin técnicos registrados hoy</div>';
    return;
  }

  const statusLabel = {
    activo:     '🟢 Activo',
    comida:     '🍽️ Comida',
    sin_checar: '🔴 Sin checar',
    completado: '✅ Salió',
    fuera_zona: '⚠️ Fuera de zona'
  };

  el.innerHTML = D.tecnicos.map(t => {
    const nombre = t.nombre || t.name || '';
    const inicial = (nombre || '?').charAt(0).toUpperCase();
    const photo = t.foto
      ? '<img class="tech-photo" src="'+t.foto+'" alt="">'
      : '<div class="tech-photo">'+inicial+'</div>';

    const horarios = [
      { l:'In',  v:t.entrada },
      { l:'SC',  v:t.salida_comida },
      { l:'RC',  v:t.regreso_comida },
      { l:'Out', v:t.salida },
    ].map(h => h.v
      ? '<span class="h" title="'+h.l+'">'+h.l+':&nbsp;'+h.v+'</span>'
      : '<span class="h empty">'+h.l+':&nbsp;—</span>'
    ).join('');

    const geoCell = t.geo_ok === true
      ? '<div class="tech-geo ok" title="Ubicación autorizada">✅</div>'
      : t.geo_ok === false
      ? '<div class="tech-geo err" title="Fuera de zona">⚠️</div>'
      : '<div class="tech-geo na" title="Sin datos">—</div>';

    const soCell = t.so
      ? '<div class="tech-so">📋 '+t.so+'</div>'
      : '<div class="tech-so empty">Sin proyecto</div>';

    return '<div class="tech-row">'+
      '<div class="tech-name-cell">'+photo+'<div><div class="tech-name">'+nombre+'</div>'+
      '<div class="tech-id">'+(t.cargo||'')+'</div></div></div>'+
      '<div><span class="tech-status '+t.status+'">'+(statusLabel[t.status]||t.status)+'</span></div>'+
      '<div class="tech-horarios">'+horarios+'</div>'+
      '<div class="tech-horas">'+formatHoras(t.horas_efectivas)+'</div>'+
      soCell+
      geoCell+
    '</div>';
  }).join('');
}

// ═══ Render: Alertas ═══
function renderAlertas(){
  const el = document.getElementById('alertList');
  if(!el) return;
  if(!D.alertas.length){
    el.innerHTML = '<div class="alert-empty">✅ Sin alertas — todo en orden</div>';
    return;
  }
  el.innerHTML = D.alertas.map(a =>
    '<div class="alert-card '+(a.nivel||'info')+'">'+
      '<div class="alert-icon">'+(a.icon||'⚠️')+'</div>'+
      '<div class="alert-body">'+
        '<div class="alert-title">'+(a.titulo||'')+'</div>'+
        '<div class="alert-msg">'+(a.msg||'')+'</div>'+
      '</div>'+
    '</div>'
  ).join('');
}

// ═══ Init ═══
async function initDashboard(){
  await loadDatos();
  // Refresh automático según configuración
  if(D.refreshTimer) clearInterval(D.refreshTimer);
  D.refreshTimer = setInterval(loadDatos, D.config.refreshMs || 5 * 60 * 1000);
  // Timestamp tick cada segundo
  setInterval(actualizarTimestamp, 1000);
}

document.addEventListener('DOMContentLoaded', initDashboard);
