// ═══ FTS Kiosk — Lógica principal ═══
// Script clásico, estado global compartido

const K = {
  empleados: [],
  sos: [],
  seleccionado: null,
  soSeleccionada: null,
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

// ═══ Carga de configuración ═══
function loadConfig(){
  K.config = {
    n8nUrl:     localStorage.getItem('kiosk_n8n_url') || '',
    apiKey:     localStorage.getItem('kiosk_api_key') || '',
    faceEnable: localStorage.getItem('kiosk_face_enable') !== '0',
    faceThresh: parseFloat(localStorage.getItem('kiosk_face_threshold') || '0.5'),
    geoEnable:  localStorage.getItem('kiosk_geo_enable') !== '0',
    geoRadius:  parseInt(localStorage.getItem('kiosk_geo_radius') || '500', 10),
    demo:       localStorage.getItem('kiosk_demo_mode') === '1',
    pines:      JSON.parse(localStorage.getItem('kiosk_pines') || '{}'),
  };
  K.demoMode = K.config.demo || !K.config.n8nUrl;
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
}

function goHome(){
  K.seleccionado = null;
  K.soSeleccionada = null;
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
  const photoEl = document.getElementById('ksEmpPhoto');
  const nameEl = document.getElementById('ksEmpName');
  if(photoEl) photoEl.src = emp.foto || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="%23333"/><text x="50%" y="55%" text-anchor="middle" font-size="80" font-family="Inter,sans-serif" font-weight="700" fill="%23666">'+(emp.nombre||'?').charAt(0)+'</text></svg>';
  if(nameEl) nameEl.textContent = emp.nombre;
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
  const expected = K.config.pines[K.seleccionado.id] || K.seleccionado.pin;
  if(!expected){
    setFaceStatus('⚠️ Empleado sin PIN configurado');
    shakeVerify();
    clearPin();
    return;
  }
  if(K.pin !== expected){
    setFaceStatus('❌ PIN incorrecto');
    shakeVerify();
    clearPin();
    return;
  }
  setFaceStatus('✅ PIN correcto — verificando rostro…');
  if(K.config.faceEnable){
    doFaceVerify();
  } else {
    showScreen('ks-project');
  }
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
    setTimeout(() => showScreen('ks-project'), 800);
    return;
  }
  try{
    setFaceStatus('🔍 Analizando rostro…');
    const result = await window.FaceVerify.compareFaces(K.seleccionado.foto, video);
    if(result.match){
      setFaceStatus('✅ Rostro verificado ('+result.similarity+'%)');
      setTimeout(() => showScreen('ks-project'), 600);
    } else {
      setFaceStatus('❌ Rostro no coincide ('+result.similarity+'%) — '+(result.reason||''));
      shakeVerify();
      clearPin();
    }
  } catch(e){
    console.warn('Face verify error:', e);
    setFaceStatus('⚠️ Error en verificación — continuando');
    setTimeout(() => showScreen('ks-project'), 1000);
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

// ═══ Registro de asistencia ═══
async function registrarAsistencia(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  // Tipo de movimiento — simple: alterna por hora (demo). Real: lo decide Odoo.
  const tipo = (now.getHours() < 14) ? 'CHECK-IN' : 'CHECK-OUT';

  // Pre-mostrar pantalla confirm
  document.getElementById('ksConfirmName').textContent = K.seleccionado.nombre;
  document.getElementById('ksConfirmSO').textContent = K.soSeleccionada.num;
  document.getElementById('ksConfirmTime').textContent = hh+':'+mm;
  const typeEl = document.getElementById('ksConfirmType');
  typeEl.textContent = tipo;
  typeEl.className = 'kiosk-big-type ' + (tipo==='CHECK-IN' ? 'in' : 'out');
  document.getElementById('ksConfirmIcon').textContent = '✓';
  document.getElementById('ksConfirmIcon').className = 'kiosk-status-ok';
  showScreen('ks-confirm');

  // Geolocalización
  let geo = { lat:null, lng:null };
  if(K.config.geoEnable){
    geo = await window.getGeolocacion();
    const geoEl = document.getElementById('ksConfirmGeo');
    if(geo.lat && geo.lng){
      geoEl.innerHTML = '<span class="kiosk-geo-dot ok"></span>'+geo.lat.toFixed(5)+', '+geo.lng.toFixed(5);
    } else {
      geoEl.innerHTML = '<span class="kiosk-geo-dot err"></span>No disponible';
    }
  } else {
    document.getElementById('ksConfirmGeo').innerHTML = '<span class="kiosk-geo-dot warn"></span>Deshabilitada';
  }

  // Registrar en Odoo
  if(!K.demoMode){
    try{
      await window.OdooKiosk.registrarCheckin({
        empleado_id: K.seleccionado.id,
        so_id:       K.soSeleccionada.id,
        tipo:        tipo,
        lat:         geo.lat,
        lng:         geo.lng,
        timestamp:   now.toISOString(),
      });
    } catch(e){
      console.warn('Fallo registrar en Odoo:', e);
      document.getElementById('ksConfirmIcon').textContent = '⚠';
      document.getElementById('ksConfirmIcon').className = 'kiosk-status-err';
    }
  }

  autoReturn();
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

document.addEventListener('DOMContentLoaded', initKiosk);
