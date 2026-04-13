// ═══ FTS Kiosk — Lógica principal ═══
// Script clásico, estado global compartido

const K = {
  empleados: [],
  sos: [],
  seleccionado: null,
  soSeleccionada: null,
  tipo: null,
  pin: '',
  stream: null,
  config: {},
  returnTimer: null,
  faceReady: false,
  demoMode: false,
};

// ═══ Carga de configuración (nuevo schema) ═══
function loadKioskConfig(){
  return {
    n8nUrl: localStorage.getItem('kiosk_n8n_url') || '',
    demoMode: localStorage.getItem('kiosk_demo_mode') !== 'false',
    faceEnabled: localStorage.getItem('kiosk_face_enabled') !== 'false',
    faceThreshold: parseFloat(localStorage.getItem('kiosk_face_threshold') || '0.5'),
    geolocations: JSON.parse(localStorage.getItem('kiosk_geolocations') || '[]'),
    stages: JSON.parse(localStorage.getItem('kiosk_stages_visible') || '["To Do","In Progress","Hold"]'),
    fields: {
      pin:             localStorage.getItem('kiosk_field_pin')              || 'pin',
      photo:           localStorage.getItem('kiosk_field_photo')            || 'image_128',
      manager:         localStorage.getItem('kiosk_field_manager')          || 'parent_id',
      supervisorEmail: localStorage.getItem('kiosk_field_supervisor_email') || 'work_email',
      supervisorWa:    localStorage.getItem('kiosk_field_supervisor_wa')    || 'mobile_phone',
    }
  };
}

// ═══ Geo: distancia y validación contra sitios autorizados ═══
function calcularDistancia(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function validarGeolocacion(lat, lng){
  const geos = K.config.geolocations;
  if(!geos || !geos.length) return {
    autorizado: true, sitio: 'Sin restricción geo'
  };
  if(lat == null || lng == null) return {
    autorizado: false,
    sitioMasCercano: (geos[0] && geos[0].nombre) || 'Desconocido',
    distancia: 0
  };
  let minDist = Infinity;
  let sitioMasCercano = geos[0];
  for(const sitio of geos){
    if(sitio.lat == null || sitio.lng == null) continue;
    const dist = calcularDistancia(
      lat, lng,
      parseFloat(sitio.lat), parseFloat(sitio.lng)
    );
    if(dist <= parseFloat(sitio.radio || 200)){
      return { autorizado: true, sitio: sitio.nombre, dist };
    }
    if(dist < minDist){ minDist = dist; sitioMasCercano = sitio; }
  }
  return {
    autorizado: false,
    sitioMasCercano: sitioMasCercano.nombre,
    distancia: Math.round(minDist)
  };
}

// ═══ Modal "fuera de zona" ═══
function mostrarModalGeo(geoResult){
  const modal = document.createElement('div');
  modal.id = 'geoModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px;box-sizing:border-box';
  modal.innerHTML =
    '<div style="background:#1a1a1a;border:2px solid #D83B01;border-radius:16px;padding:24px;max-width:440px;width:100%;text-align:center">'+
      '<div style="font-size:48px;margin-bottom:12px">⚠️</div>'+
      '<h2 style="color:#D83B01;margin:0 0 8px">Fuera de zona autorizada</h2>'+
      '<p style="color:#999;font-size:14px;margin:0 0 16px">'+
        'Estás a '+geoResult.distancia+'m de "<strong>'+geoResult.sitioMasCercano+'</strong>".<br>'+
        'Tu check-in requerirá aprobación del supervisor.'+
      '</p>'+
      '<textarea id="geoMotivo" placeholder="Motivo del check-in fuera de zona (obligatorio)..." style="width:100%;height:80px;background:#0a0a0a;color:#fff;border:1px solid #555;border-radius:8px;padding:10px;font-size:14px;box-sizing:border-box;resize:none;margin-bottom:16px;font-family:inherit"></textarea>'+
      '<div style="display:flex;gap:12px">'+
        '<button onclick="cancelarGeo()" style="flex:1;background:#333;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit">✕ Cancelar</button>'+
        '<button onclick="confirmarGeo()" style="flex:1;background:#D83B01;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">Enviar para aprobación</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

function cancelarGeo(){
  const m = document.getElementById('geoModal');
  if(m) m.remove();
  K.geoMotivo = null;
  goHome();
}

function confirmarGeo(){
  const ta = document.getElementById('geoMotivo');
  const motivo = ta ? ta.value.trim() : '';
  if(!motivo){
    if(ta) ta.style.borderColor = '#D83B01';
    return;
  }
  K.geoMotivo = motivo;
  K.geoAutorizada = false;
  const m = document.getElementById('geoModal');
  if(m) m.remove();
  if(K.tipo === 'salida'){
    showScreen('ks-project');
  } else {
    K.soSeleccionada = null;
    registrarAsistencia();
  }
}

// ═══ Reloj ═══
function tick(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const clock = document.getElementById('ksClock');
  if(clock) clock.textContent = hh+':'+mm+':'+ss;
  const date = document.getElementById('ksDate');
  if(date){
    const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
    date.textContent = now.toLocaleDateString('es-MX', opts);
  }
}

// ═══ Navegación ═══
function showScreen(id){
  document.querySelectorAll('.kiosk-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  // Cleanup al salir de verify
  if(id !== 'ks-verify') stopCamera();
  if(id === 'ks-search'){
    const input = document.getElementById('ksSearch');
    if(input){ input.value=''; input.focus(); }
    renderEmpleados(K.empleados);
  }
  if(id === 'ks-project'){
    const input = document.getElementById('ksSoSearch');
    if(input){ input.value=''; input.focus(); }
    renderSOs(K.sos);
  }
  if(id === 'ks-historial'){
    const input = document.getElementById('hist-search');
    if(input){ input.value=''; input.style.display=''; input.focus(); }
    const content = document.getElementById('hist-content');
    if(content) content.style.display = 'none';
    const list = document.getElementById('hist-empleados');
    if(list){ list.style.display=''; }
    searchHistorial('');
  }
}

function goHome(){
  K.seleccionado = null;
  K.soSeleccionada = null;
  K.tipo = null;
  K.pin = '';
  updatePinDots();
  if(K.returnTimer){ clearTimeout(K.returnTimer); K.returnTimer = null; }
  showScreen('ks-home');
}

// ═══ Carga de empleados/SOs ═══
const DEMO_EMPLEADOS = [
  { id:1, nombre:'Mateo Salazar',     puesto:'Ingeniero',  foto:'', pin:'1234' },
  { id:2, nombre:'Felipe Pérez',      puesto:'Supervisor', foto:'', pin:'5678' },
  { id:3, nombre:'Esteban De La Cruz',puesto:'Director',   foto:'', pin:'0000' },
  { id:4, nombre:'Ana Ramírez',       puesto:'Soldador',   foto:'', pin:'1111' },
  { id:5, nombre:'Carlos Hernández',  puesto:'Ayudante',   foto:'', pin:'2222' },
];
const DEMO_SOS = [
  { id:101, num:'SO-2026-001', nombre:'Topo Chico — Radium' },
  { id:102, num:'SO-2026-002', nombre:'Arca Continental — Mezzanine' },
  { id:103, num:'SO-2026-003', nombre:'Sigma — Polipasto 2T' },
  { id:104, num:'SO-2026-004', nombre:'HEB — Tanque 5000L' },
];

async function loadEmpleados(){
  if(K.config.demoMode || !K.config.n8nUrl){
    K.empleados = DEMO_EMPLEADOS.slice();
    return;
  }
  try{
    const data = await window.OdooKiosk.getEmpleados();
    K.empleados = Array.isArray(data) ? data : (data.empleados || []);
  } catch(e){
    console.warn('Odoo no disponible, usando demo:', e);
    K.empleados = DEMO_EMPLEADOS.slice();
    K.demoMode = true;
  }
}

async function loadSOs(){
  if(K.config.demoMode || !K.config.n8nUrl){
    K.sos = DEMO_SOS.slice();
    return;
  }
  try{
    const data = await window.OdooKiosk.getSOs();
    K.sos = Array.isArray(data) ? data : (data.sos || []);
  } catch(e){
    console.warn('Odoo no disponible, usando demo:', e);
    K.sos = DEMO_SOS.slice();
  }
}

// ═══ Búsqueda y render de empleados ═══
function normalize(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function searchEmpleados(q){
  const nq = normalize(q);
  const filtered = !nq ? K.empleados : K.empleados.filter(e => normalize(e.nombre).includes(nq));
  renderEmpleados(filtered);
}

function renderEmpleados(list){
  const el = document.getElementById('ksEmpleadosList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:#666;padding:24px">Sin resultados</div>';
    return;
  }
  el.innerHTML = list.map(e =>
    '<div class="kiosk-employee-card" onclick="selectEmpleado('+e.id+')">'+
      '<div class="kiosk-employee-photo">'+(e.foto?'<img src="'+e.foto+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':(e.nombre||'?').charAt(0))+'</div>'+
      '<div><div class="kiosk-employee-name">'+(e.nombre||'—')+'</div>'+
      '<div class="kiosk-employee-sub">'+(e.puesto||'')+'</div></div>'+
    '</div>'
  ).join('');
}

function selectEmpleado(id){
  const emp = K.empleados.find(e => e.id === id);
  if(!emp) return;
  K.seleccionado = emp;
  K.pin = '';
  updatePinDots();

  const displayName = emp.name || emp.nombre || '';

  // Preparar ks-verify (se usará después del selectTipo)
  const photoEl = document.getElementById('ksEmpPhoto');
  const nameEl  = document.getElementById('ksEmpName');
  if(photoEl) photoEl.src = emp.foto || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="%23f5f5f5"/><text x="50%" y="55%" text-anchor="middle" font-size="80" font-family="Inter,sans-serif" font-weight="700" fill="%23999">'+(displayName||'?').charAt(0)+'</text></svg>';
  if(nameEl) nameEl.textContent = displayName;

  // Llenar pantalla ks-tipo
  const tipoNombre = document.getElementById('ks-tipo-nombre');
  if(tipoNombre) tipoNombre.textContent = displayName;

  // Sugerencia de tipo según hora
  const sug = document.getElementById('ks-tipo-sugerencia');
  if(sug) sug.textContent = getSugerenciaTipo();

  showScreen('ks-tipo');
}

function getSugerenciaTipo(){
  const h = new Date().getHours();
  if(h >= 6  && h < 11) return '💡 Sugerido: Entrada — Inicio del día';
  if(h >= 11 && h < 13) return '💡 Sugerido: Salida a comer';
  if(h >= 13 && h < 15) return '💡 Sugerido: Regreso de comida';
  if(h >= 15)           return '💡 Sugerido: Salida — Fin del día';
  return '';
}

function selectTipo(tipo){
  K.tipo = tipo;

  const labels = {
    entrada:         '🟢 Entrada',
    salida_comida:   '🍽️ Salida a comer',
    regreso_comida:  '🔄 Regreso de comida',
    salida:          '🔴 Salida'
  };

  const tipoLabel = document.getElementById('ks-verify-tipo');
  if(tipoLabel) tipoLabel.textContent = labels[tipo] || tipo;

  showScreen('ks-verify');
  startCamera();
}

// ═══ PIN pad ═══
function addPin(n){
  if(K.pin.length >= 4) return;
  K.pin += n;
  updatePinDots();
  if(K.pin.length === 4){
    setTimeout(verifyPin, 200);
  }
}
function clearPin(){ K.pin = ''; updatePinDots(); }
function backPin(){ K.pin = K.pin.slice(0,-1); updatePinDots(); }

function updatePinDots(){
  const dots = document.querySelectorAll('#ksPinDots .kiosk-pin-dot');
  dots.forEach((d,i) => {
    if(i < K.pin.length) d.classList.add('filled');
    else d.classList.remove('filled');
  });
}

function verifyPin(){
  if(!K.seleccionado) return;
  const pinStatus = document.getElementById('pin-status');
  const expected = K.seleccionado.pin;

  console.log('[KIOSK PIN] Ingresado:', K.pin,
    'Esperado:', expected,
    'Empleado:', K.seleccionado.name || K.seleccionado.nombre,
    K.seleccionado);

  function failPin(msg){
    setFaceStatus('❌ ' + msg);
    if(pinStatus) pinStatus.textContent = msg;
    shakeVerify();
    flashPinDotsError();
    clearPin();
    setTimeout(() => {
      const ps = document.getElementById('pin-status');
      if(ps) ps.textContent = '';
    }, 2000);
  }

  if(!expected){
    failPin('Empleado sin PIN configurado');
    return;
  }
  if(K.pin !== expected){
    failPin('PIN incorrecto — intenta de nuevo');
    return;
  }
  // PIN correcto
  if(pinStatus) pinStatus.textContent = '';
  setFaceStatus('✅ PIN correcto — verificando rostro…');
  if(K.config.faceEnabled){
    doFaceVerify();
  } else {
    afterVerifyContinue();
  }
}

function flashPinDotsError(){
  const dots = document.querySelectorAll('#ksPinDots .kiosk-pin-dot');
  dots.forEach(d => d.classList.add('error'));
  setTimeout(() => {
    dots.forEach(d => d.classList.remove('error'));
  }, 1000);
}

function shakeVerify(){
  const el = document.getElementById('ks-verify');
  if(!el) return;
  el.classList.add('kiosk-shake');
  setTimeout(() => el.classList.remove('kiosk-shake'), 400);
}

function setFaceStatus(text){
  const el = document.getElementById('ksFaceStatus');
  if(el) el.textContent = text;
}

// ═══ Cámara ═══
async function startCamera(){
  try{
    if(K.stream) return;
    K.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:320, height:320, facingMode:'user' }, audio:false });
    const video = document.getElementById('ksCamera');
    if(video) video.srcObject = K.stream;
  } catch(e){
    console.warn('Cámara no disponible:', e);
    setFaceStatus('⚠️ Cámara no disponible');
  }
}

function stopCamera(){
  if(K.stream){
    K.stream.getTracks().forEach(t => t.stop());
    K.stream = null;
  }
}

// ═══ Verificación facial ═══
async function doFaceVerify(){
  const video = document.getElementById('ksCamera');
  if(!video || !K.faceReady){
    setFaceStatus('⚠️ Verificación facial no lista — continuando');
    setTimeout(afterVerifyContinue, 800);
    return;
  }
  try{
    setFaceStatus('🔍 Analizando rostro…');
    const result = await window.FaceVerify.compareFaces(K.seleccionado.foto, video);
    if(result.match){
      setFaceStatus('✅ Rostro verificado ('+result.similarity+'%)');
      setTimeout(afterVerifyContinue, 600);
    } else {
      setFaceStatus('❌ Rostro no coincide ('+result.similarity+'%) — '+(result.reason||''));
      shakeVerify();
      clearPin();
    }
  } catch(e){
    console.warn('Face verify error:', e);
    setFaceStatus('⚠️ Error en verificación — continuando');
    setTimeout(afterVerifyContinue, 1000);
  }
}

// ═══ Continuación tras PIN+facial OK: captura geo y valida zona ═══
async function afterVerifyContinue(){
  setFaceStatus('📍 Obteniendo ubicación…');
  K.geoMotivo = null;
  const geo = await window.getGeolocacion();
  K.geo = geo;
  const geoResult = validarGeolocacion(
    geo && geo.lat != null ? geo.lat : null,
    geo && geo.lng != null ? geo.lng : null
  );
  K.geoAutorizada = geoResult.autorizado;
  K.geoSitio = geoResult.sitio || geoResult.sitioMasCercano;
  K.geoDistancia = geoResult.distancia || 0;
  if(!geoResult.autorizado){
    mostrarModalGeo(geoResult);
  } else if(K.tipo === 'salida'){
    // Solo en salida pedir proyecto
    showScreen('ks-project');
  } else {
    // Entrada, salida_comida, regreso_comida → registrar directo
    K.soSeleccionada = null;
    registrarAsistencia();
  }
}

// ═══ SOs ═══
function searchSOs(q){
  const nq = normalize(q);
  const filtered = !nq ? K.sos : K.sos.filter(s => normalize(s.nombre).includes(nq) || normalize(s.num).includes(nq));
  renderSOs(filtered);
}

function renderSOs(list){
  const el = document.getElementById('ksSOsList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:#666;padding:24px">Sin resultados</div>';
    return;
  }
  el.innerHTML = list.map(s =>
    '<div class="kiosk-so-card" onclick="selectSO('+s.id+')">'+
      '<div class="kiosk-so-num">'+(s.num||'')+'</div>'+
      '<div class="kiosk-so-name">'+(s.nombre||'—')+'</div>'+
    '</div>'
  ).join('');
}

function selectSO(id){
  const so = K.sos.find(s => s.id === id);
  if(!so) return;
  K.soSeleccionada = so;
  registrarAsistencia();
}

// ═══ Captura de frame del webcam ═══
function captureFrame(videoEl){
  if(!videoEl || !videoEl.srcObject) return null;
  try{
    const canvas = document.createElement('canvas');
    canvas.width  = videoEl.videoWidth  || 320;
    canvas.height = videoEl.videoHeight || 240;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch(e){
    console.warn('captureFrame error:', e);
    return null;
  }
}

// ═══ Registro de asistencia ═══
async function registrarAsistencia(){
  const videoEl = document.getElementById('ksCamera');
  const fotoB64 = captureFrame(videoEl);

  // Determinar tipo — viene de ks-tipo (K.tipo)
  const now = new Date();
  const tipo = K.tipo || 'entrada';

  // Construir payload completo
  const payload = {
    empleado_id:        (K.seleccionado && K.seleccionado.id) || null,
    empleado_nombre:    (K.seleccionado && (K.seleccionado.name || K.seleccionado.nombre)) || '',
    so_id:              (K.soSeleccionada && K.soSeleccionada.id) || null,
    so_nombre:          (K.soSeleccionada && (K.soSeleccionada.name || K.soSeleccionada.nombre)) || '',
    tipo:               tipo,
    timestamp:          now.toISOString(),
    foto_b64:           fotoB64,
    lat:                (K.geo && K.geo.lat != null) ? K.geo.lat : null,
    lng:                (K.geo && K.geo.lng != null) ? K.geo.lng : null,
    geo_autorizada:     K.geoAutorizada !== false,
    geo_sitio:          K.geoSitio || null,
    geo_distancia:      K.geoDistancia || 0,
    geo_motivo:         K.geoMotivo || null,
    geo_status:         K.geoAutorizada !== false ? 'autorizado' : 'pendiente_aprobacion',
    supervisor_id:      (K.seleccionado && K.seleccionado.manager_id)   || null,
    supervisor_nombre:  (K.seleccionado && K.seleccionado.manager_name) || null,
  };

  // Mostrar pantalla de confirmación inmediatamente
  showScreen('ks-confirm');

  const confirmTipo   = document.getElementById('confirm-tipo');
  const confirmNombre = document.getElementById('confirm-nombre');
  const confirmSO     = document.getElementById('confirm-so');
  const confirmHora   = document.getElementById('confirm-hora');
  const confirmGeo    = document.getElementById('confirm-geo');
  const confirmIcon   = document.getElementById('confirm-icon');

  if(confirmTipo){
    const confirmLabels = {
      entrada:        '🟢 ENTRADA',
      salida_comida:  '🍽️ SALIDA A COMER',
      regreso_comida: '🔄 REGRESO DE COMIDA',
      salida:         '🔴 SALIDA',
    };
    const entradaLike = (tipo === 'entrada' || tipo === 'regreso_comida');
    confirmTipo.textContent = confirmLabels[tipo] || tipo.toUpperCase();
    confirmTipo.className = 'kiosk-big-type ' + (entradaLike ? 'in' : 'out');
  }
  if(confirmNombre) confirmNombre.textContent = payload.empleado_nombre || '—';
  if(confirmSO)     confirmSO.textContent     = payload.so_nombre || '—';
  if(confirmHora)   confirmHora.textContent   = now.toLocaleTimeString('es-MX');
  if(confirmGeo){
    confirmGeo.innerHTML = payload.geo_autorizada
      ? '<span class="kiosk-geo-dot ok"></span>📍 ' + (payload.geo_sitio || 'Ubicación autorizada')
      : '<span class="kiosk-geo-dot warn"></span>⚠️ Pendiente aprobación supervisor';
  }
  if(confirmIcon){
    confirmIcon.textContent = payload.geo_autorizada ? '✓' : '⚠';
    confirmIcon.className   = payload.geo_autorizada ? 'kiosk-status-ok' : 'kiosk-status-err';
  }

  // Enviar a n8n (o solo log en demo)
  if(!K.config.demoMode && K.config.n8nUrl){
    try{
      await window.OdooKiosk.registrarCheckin(payload);
    } catch(e){
      console.warn('Error enviando a n8n:', e);
    }
  } else {
    console.log('[DEMO] Payload kiosk:', payload);
  }

  // Reset estado y volver a home
  setTimeout(() => {
    K.seleccionado = null;
    K.soSeleccionada = null;
    K.tipo = null;
    K.geo = null;
    K.geoAutorizada = null;
    K.geoMotivo = null;
    K.geoSitio = null;
    K.geoDistancia = 0;
    K.pin = '';
    updatePinDots();
    if(K.stream){
      K.stream.getTracks().forEach(t => t.stop());
      K.stream = null;
    }
    showScreen('ks-home');
  }, 4000);
}

// ═══════ HISTORIAL ═══════
function searchHistorial(q){
  const lista = document.getElementById('hist-empleados');
  if(!lista) return;
  const nq = normalize(q||'');
  const filtrados = !nq ? K.empleados : K.empleados.filter(e => normalize(e.name||e.nombre||'').includes(nq));
  lista.innerHTML = filtrados.slice(0, 5).map(e => {
    const nombre = e.name || e.nombre || '';
    const cargo  = e.cargo || e.job_title || e.puesto || 'Técnico';
    const foto = e.foto || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%23f5f5f5"/><text x="50%" y="58%" text-anchor="middle" font-size="28" font-family="Inter,sans-serif" font-weight="700" fill="%23999">'+(nombre||'?').charAt(0)+'</text></svg>';
    return '<div class="kiosk-employee-card" onclick="mostrarHistorial('+e.id+')">'+
      '<img class="kiosk-employee-photo" src="'+foto+'" alt="">'+
      '<div><div class="kiosk-employee-name">'+nombre+'</div>'+
      '<div class="kiosk-employee-sub">'+cargo+'</div></div>'+
    '</div>';
  }).join('');
}

async function mostrarHistorial(empId){
  const emp = K.empleados.find(e => e.id === empId);
  if(!emp) return;

  document.getElementById('hist-empleados').style.display = 'none';
  document.getElementById('hist-search').style.display = 'none';
  document.getElementById('hist-content').style.display = 'block';
  document.getElementById('hist-foto').src = emp.foto || '';
  document.getElementById('hist-nombre').textContent = emp.name || emp.nombre || '';
  document.getElementById('hist-fecha').textContent = new Date().toLocaleDateString('es-MX', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  document.getElementById('hist-horas').textContent = 'Cargando…';
  document.getElementById('hist-eventos').innerHTML = '';

  let eventos = [];
  let esDemo = false;

  if(!K.config.demoMode && K.config.n8nUrl){
    try{
      const res = await window.OdooKiosk.getAsistenciaHoy(empId);
      eventos = (res && res.eventos) || [];
    } catch(e){
      console.warn('Odoo no disponible, usando demo:', e);
      esDemo = true;
      eventos = generarEventosDemo(new Date());
    }
  } else {
    esDemo = true;
    eventos = generarEventosDemo(new Date());
  }

  const avisoDemo = document.getElementById('hist-demo-aviso');
  if(avisoDemo) avisoDemo.style.display = esDemo ? 'block' : 'none';

  document.getElementById('hist-horas').innerHTML = calcularResumen(eventos, new Date());
  document.getElementById('hist-eventos').innerHTML = eventos.map(renderEventoHistorial).join('') ||
    '<div style="text-align:center;color:#999;font-size:13px;padding:12px">Sin registros hoy</div>';
}

function generarEventosDemo(ahora){
  const h = ahora.getHours();
  const eventos = [];
  if(h >= 7)  eventos.push({ tipo:'entrada',         hora:'07:05', geo:'FTS Monterrey', status:'ok' });
  if(h >= 12) eventos.push({ tipo:'salida_comida',   hora:'12:02', geo:'FTS Monterrey', status:'ok' });
  if(h >= 12) eventos.push({ tipo:'regreso_comida',  hora:'12:38', geo:'FTS Monterrey', status:'ok' });
  if(h >= 17) eventos.push({ tipo:'salida',          hora:'17:10', geo:'FTS Monterrey', proyecto:'SO-11547 Nalco', status:'ok' });
  return eventos;
}

function calcularResumen(eventos, ahora){
  const entrada   = eventos.find(e => e.tipo === 'entrada');
  const salComida = eventos.find(e => e.tipo === 'salida_comida');
  const regComida = eventos.find(e => e.tipo === 'regreso_comida');
  const salida    = eventos.find(e => e.tipo === 'salida');

  if(!entrada) return '⏳ Sin registros hoy';

  const toMin = h => {
    const parts = h.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  };
  const fmt = min => {
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    return h + 'h ' + m + 'min';
  };

  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const entMin = toMin(entrada.hora);
  const scMin  = salComida ? toMin(salComida.hora) : null;
  const rcMin  = regComida ? toMin(regComida.hora) : null;
  const saMin  = salida    ? toMin(salida.hora)    : ahoraMin;

  let efectivas = 0;
  if(scMin && rcMin){
    efectivas = (scMin - entMin) + (saMin - rcMin);
  } else if(scMin){
    efectivas = scMin - entMin;
  } else {
    efectivas = saMin - entMin;
  }

  const comida = (scMin && rcMin) ? (rcMin - scMin) : 0;
  const LIMITE = 576; // 9.6 hrs en minutos
  const extra = Math.max(0, efectivas - LIMITE);
  const faltan = Math.max(0, LIMITE - efectivas);

  return '⏱ <b>Efectivas:</b> ' + fmt(efectivas) + '<br>' +
    '🍽️ <b>Comida:</b> ' + fmt(comida) + '<br>' +
    '⚡ <b>Extra:</b> ' + (extra > 0
      ? '<span style="color:#107C10">' + fmt(extra) + '</span>'
      : '0h 0min <span style="color:#999;font-size:11px">(faltan ' + fmt(faltan) + ')</span>') +
    (!salida ? '<br>🔄 <span style="color:#0078D4">Turno en curso</span>' : '');
}

function renderEventoHistorial(ev){
  const colores = {
    entrada:        '#107C10',
    salida_comida:  '#f39c12',
    regreso_comida: '#0078D4',
    salida:         '#D83B01'
  };
  const labels = {
    entrada:        '🟢 Entrada',
    salida_comida:  '🍽️ Salida a comer',
    regreso_comida: '🔄 Regreso de comida',
    salida:         '🔴 Salida'
  };
  const color = colores[ev.tipo] || '#666';
  return '<div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid ' + color + ';border-radius:10px;padding:12px 14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-weight:600;font-size:14px">' + (labels[ev.tipo] || ev.tipo) + '</span>' +
      '<span style="font-weight:700;font-size:16px;color:' + color + '">' + (ev.hora || '—') + '</span>' +
    '</div>' +
    '<div style="font-size:12px;color:#999;margin-top:4px">' +
      '📍 ' + (ev.geo || '—') +
      (ev.proyecto ? '&nbsp;·&nbsp;📋 ' + ev.proyecto : '') +
      (ev.status === 'pendiente_aprobacion' ? '&nbsp;·&nbsp;<span style="color:#BF8F00">⚠️ Pendiente aprobación</span>' : '') +
    '</div>' +
  '</div>';
}

function autoReturn(){
  let remaining = 4;
  const el = document.getElementById('ksReturnCounter');
  if(el) el.textContent = 'Regresando en '+remaining+'…';
  K.returnTimer = setInterval(() => {
    remaining--;
    if(el) el.textContent = 'Regresando en '+remaining+'…';
    if(remaining <= 0){
      clearInterval(K.returnTimer);
      K.returnTimer = null;
      goHome();
    }
  }, 1000);
}

// ═══ Heartbeat conexión ═══
function updateConnStatus(){
  const el = document.getElementById('ksConnStatus');
  if(!el) return;
  if(K.config.demoMode || !K.config.n8nUrl) el.textContent = 'MODO DEMO';
  else el.textContent = 'conectado';
}

// ═══ Init ═══
async function initKiosk(){
  K.config = loadKioskConfig();
  tick(); setInterval(tick, 1000);
  updateConnStatus();

  await loadEmpleados();
  await loadSOs();

  // Cargar modelos de face-api en background
  if(K.config.faceEnabled && window.FaceVerify){
    try{
      await window.FaceVerify.loadFaceModels();
      K.faceReady = true;
      console.log('✅ Modelos faciales listos');
    } catch(e){
      console.warn('Error cargando modelos faciales:', e);
      K.faceReady = false;
    }
  }
}

// Expose
window.showScreen = showScreen;
window.goHome = goHome;
window.searchEmpleados = searchEmpleados;
window.selectEmpleado = selectEmpleado;
window.addPin = addPin;
window.clearPin = clearPin;
window.backPin = backPin;
window.searchSOs = searchSOs;
window.selectSO = selectSO;
window.selectTipo = selectTipo;
window.cancelarGeo = cancelarGeo;
window.confirmarGeo = confirmarGeo;
window.searchHistorial = searchHistorial;
window.mostrarHistorial = mostrarHistorial;

document.addEventListener('DOMContentLoaded', initKiosk);
